---
title: 'Cancellation'
description: 'Structured cancellation in Zena: the cancellation channel, cancel scopes, checkpoints, and cleanup.'
---

Cancellation terminates in-flight asynchronous operations when their results
are no longer needed.

Zena treats cancellation as a distinct channel from normal returns and thrown
exceptions. Cancellation is scoped to task hierarchies, delivered at suspension
checkpoints, and does not trigger `catch (e: Error)` blocks.

## The cancellation channel

Program outcomes follow three separate paths:

1. **Return values**: Results produced for the caller, including expected domain
   failures returned in signatures.
2. **Exceptions (`Error`)**: Failures that unwind the stack until caught by a
   matching `catch` block (see [Exceptions](/reference/exceptions/)).
3. **Cancellation**: Directives from an ancestor scope signaling that an operation
   is no longer needed. Intermediate frames run their cleanups and continue unwinding.

### Separation from exceptions

A `catch (e: Error)` block catches exceptions, but does not catch cancellation.
When an operation is cancelled, the stack unwinds through `catch` blocks without
invoking them, preventing code intended for error recovery from intercepting the
cancellation directive.

## Cancel scopes

Cancellation in Zena is managed through `CancelScope` from `zena:async`.

### Hierarchical scope trees

Scopes form a hierarchy mirroring the call tree:

- A cancel scope maintains a cancelled flag and a reference to its parent scope.
- Cancelling a parent scope marks that scope and all descendant scopes as cancelled.
- Async tasks created within a scope inherit that scope as their parent.

```zena
import { CancelScope } from 'zena:async';

let scope = new CancelScope();

// Cancelling the parent cancels all child tasks in the scope:
scope.cancel();
```

### Scope binding and frame storage

Async functions inherit their cancellation scope without signature annotations:

- **Captured at frame creation**: When an `async` function is called, its initial
  synchronous statements (the ramp up to the first `await`) run immediately in
  the caller's turn. During this ramp, the runtime captures the ambient scope
  from `currentScope()` and stores it in a private field on the async frame struct.
- **Direct checkpoint reads**: After frame creation, the frame does not query
  ambient state for cancellation checks. Each checkpoint evaluates the stored
  scope field directly on its own frame.
- **Executor restoration**: When a suspended task is dequeued to run on the
  microtask queue, the runtime executor sets `currentScope` to that task's scope
  for the duration of the turn, restoring the previous scope upon completion.
- **Stored callbacks**: Synchronous callbacks do not carry or track a cancellation
  scope. When an asynchronous callback is stored in a container (such as an
  event listener collection, cache, or queue) and executed later, it captures
  the scope that is ambient at the call site when invoked.

### Level-triggered state

Cancellation is **level-triggered**: once a scope is marked as cancelled, it
remains cancelled. Any subsequent checkpoint within that scope detects the
cancelled state and initiates unwinding.

### Delivery at checkpoints

Cancellation is delivered at **checkpoints** (points of asynchronous suspension
and resumption):

- **Entering `await`**: Before parking on an unsettled future, the runtime checks
  whether the scope is already cancelled. If so, it raises cancellation
  immediately, avoiding unnecessary subscription and allocation overhead.
- **Resuming from `await`**: When an awaited future settles (or when cancelling a
  scope actively wakes parked frames), the scope is checked immediately upon
  waking before any subsequent synchronous statements in the frame execute.

Synchronous code between `await` expressions executes without interruption.

### Detached scopes

When creating a new scope with `new CancelScope()`, it automatically parents
itself to the ambient scope (`currentScope()`). If an ancestor scope cancels,
that cancellation cascades downward to all child scopes and tasks.

To run work that must outlive its caller—such as shared cache fills or telemetry
daemons—use `CancelScope.detached()`. A detached scope has no parent link:
cancelling an outer caller scope will not affect it, and only calling `.cancel()`
on the detached scope itself will terminate its work.

To associate async tasks with a detached scope, run them inside `scope.run()`:

```zena
import { CancelScope } from 'zena:async';

let cacheScope = CancelScope.detached();

function populateCache(key: String): void {
  // Binds the async task to cacheScope instead of the caller's scope
  cacheScope.run(() => {
    fetchAndCacheData(key);
  });
}
```

### Explicit checkpoints: checkCancellation and raiseCancellation

Long-running CPU-bound synchronous code has no natural `await` suspension points.
To allow such loops to observe cancellation and unwind promptly, use
`checkCancellation()` from `zena:async`:

```zena
import { checkCancellation } from 'zena:async';

function processLargeDataset(items: Array<Item>): void {
  for (let item in items) {
    checkCancellation(); // Raises on cancellation channel if cancelled
    process(item);
  }
}
```

If the ambient scope is cancelled, `checkCancellation()` initiates cancellation
unwinding, triggering `finally` blocks and `using` disposals exactly like an
`await` checkpoint. If the scope is not cancelled, it performs a single boolean
check.

For custom execution engines or low-level async primitives, `zena:async` provides:

- **`raiseCancellation(): never`**: Unconditionally raises on the cancellation
  channel on the current execution frame.
- **`currentScope().isCancelled`**: Allows passive polling of cancellation status
  without unwinding.

## Cleanup on cancellation

When cancellation unwinds an execution frame (see [Blocks and Exits](/reference/blocks-and-exits/)),
active cleanups execute:

- Active [`using` resource statements](/reference/blocks-and-exits/) invoke
  `[Disposable.dispose]()` (see [Ownership and Resources](/reference/ownership/)).
- Active [`finally` blocks](/reference/exceptions/) execute.

```zena
async function fetchResource(url: String): Future<String> {
  using connection = openConnection(url);

  try {
    return await connection.readData();
  } finally {
    println('Runs on return, exception, or cancellation');
  }
}
```

### Shielded cleanup sections

Because a cancelled scope remains cancelled, subsequent `await` expressions
inside a cleanup handler would also trigger cancellation immediately.

When cleanup must perform asynchronous operations (such as closing a network
connection or flushing a buffer), execute the cleanup in a **shielded scope**:

```zena
import { shield } from 'zena:async';

try {
  await performTask();
} finally {
  await shield(async () => {
    await socket.flush();
    await socket.closeAsync();
  });
}
```

## Structured concurrency

Cancel scopes are used by `TaskGroup` to implement **structured concurrency**,
where concurrent tasks are bounded by lexical scope.

### Task group rules

1. **Bounded lifetime**: A task group does not complete until all of its child
   tasks have finished.
2. **Error propagation**: If a child task fails with an unhandled exception,
   remaining tasks in the group are cancelled, and the error propagates to the
   caller of `join()`.
3. **Cascade cancellation**: Cancelling a parent scope cancels all child tasks in
   its task groups.

```zena
import { TaskGroup } from 'zena:async';

async function fetchDashboard(): Future<DashboardData> {
  let group = new TaskGroup();

  let userTask = group.spawn(async () => fetchUser());
  let statsTask = group.spawn(async () => fetchStats());

  // Await all tasks; if one fails, the other is cancelled
  await group.join();

  return new DashboardData(await userTask, await statsTask);
}
```
