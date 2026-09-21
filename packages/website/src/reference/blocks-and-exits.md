---
title: 'Blocks and Exits'
description: 'Lexical blocks, return statements, exception unwinding, using disposals, cancellation, and reverse cleanup order in Zena.'
---

In Zena, code executes within lexical blocks `{ ... }`. Every block and function
has a well-defined lifecycle governing both normal evaluation and early exits.

Exits can occur across multiple vectors:

- Normal completion (evaluating to the end of a block or trailing expression).
- Early returns (`return`).
- Loop interruptions (`break` and `continue` — see [Loops](/reference/loops/)).
- Abnormal failures (`throw` and exception propagation — see [Exceptions](/reference/exceptions/)).
- Asynchronous task cancellation (see [Cancellation](/reference/cancellation/)).

Zena unifies these exit paths into a single **deterministic unwinding model**:
whenever execution leaves a lexical scope, all registered cleanup actions
(`using` disposables and `finally` blocks) execute in **strict reverse
declaration order (LIFO)**.

## Blocks and lexical scope

A block `{ ... }` groups statements and declarations into a single syntactic
unit.

### Lexical variable scoping

Variables declared within a block using `let` or `var` are bound to that lexical
scope. They cannot be referenced outside:

```zena
{
  let message = 'Hello';
  var counter = 0;
  println(message);
}
// 'message' and 'counter' are out of scope here
```

Inner blocks can shadow variables from outer scopes:

```zena
let value = 10;
{
  let value = 20; // Shadows outer 'value'
  println(value.toString()); // Prints 20
}
println(value.toString()); // Prints 10
```

### Block expressions and trailing values

In expression contexts (such as the arms of an [`if` expression](/reference/conditionals/) or
[`match` expression](/reference/pattern-matching/)), a block evaluates to the value of its
trailing expression:

```zena
let total = {
  let base = 100;
  let tax = 8;
  base + tax // Trailing expression without semicolon produces 108
};
```

If a block terminates in a statement or is empty, it evaluates to `void`.

## return

The `return` statement immediately terminates execution of the current function
and passes a result back to the caller.

### Syntax and function bodies

In block-bodied functions, `return` is explicit:

```zena
function add(a: i32, b: i32): i32 {
  return a + b;
}
```

In arrow functions with concise expression bodies (`=> expr`), the expression is
returned implicitly without writing `return`:

```zena
let multiply = (a: i32, b: i32): i32 => a * b;
```

For functions with a `void` return type, `return;` can be used without an operand
to exit early, or omitted entirely:

```zena
function logMessage(msg: String?): void {
  if (msg == null) {
    return; // Early exit
  }
  println(msg);
}
```

### Early returns in expression arms

An arm of an [`if` expression](/reference/conditionals/) can execute an early `return`:

```zena
function process(item: Item?): i32 {
  // If item is null, early return 0; otherwise bind item
  let validItem = if (item != null) item else return 0;
  return validItem.calculate();
}
```

Because an early `return` never produces a value in that expression context, its
type is `never`. The compiler's type algebra simplifies `never | T` to `T`,
narrowing the variable cleanly.

### Functions that never return

Functions that abort execution unconditionally (such as panics or infinite
loops) are typed with the bottom type `never`:

```zena
function panic(message: String): never {
  throw new Error(message);
}
```

Attempting to return a value from a function declared to return `never` is a
compile-time error.

## throw and exception unwinding

The `throw` statement signals an unexpected or unrecoverable failure, halting
normal sequential execution and initiating stack unwinding. See [Exceptions](/reference/exceptions/)
for full details on throwing and catching error instances.

### Throwing Error instances

In Zena, only instances of `Error` (or classes extending `Error` from
`zena:core`) can be thrown:

```zena
import { Error } from 'zena:core';

function divide(a: i32, b: i32): i32 {
  if (b == 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}
```

Throwing arbitrary primitives (such as numbers or strings) is rejected at
compile time.

### Stack unwinding

When an exception is thrown, the runtime unwinds active execution frames
sequentially until a matching `try/catch` block is encountered (see [Exceptions](/reference/exceptions/)).

As each frame and lexical block is unwound, the runtime executes all cleanups
registered within that block (such as `using` disposals and `finally` blocks)
before continuing propagation to outer callers.

## Deterministic cleanup with using

The `using` statement binds a resource implementing the `Disposable` protocol
to the current lexical block, guaranteeing deterministic release upon scope exit.
See [Ownership and Resources](/reference/ownership/) for complete details on
the resource model.

### Syntax

```zena
{
  using file = openFile('data.txt');
  file.write('data');
  // 'file[Disposable.dispose]()' is guaranteed to run here
}
```

The bound object must implement the `Disposable` interface from `zena:core`.

### Unconditional release guarantee

The disposal method runs unconditionally, regardless of how control leaves the
block:

- **Normal completion**: falling off the end of the block.
- **Early returns**: executing a `return` statement inside the block.
- **Loop jumps**: encountering `break` or `continue` (see [Loops](/reference/loops/)).
- **Exceptions**: an unhandled exception thrown inside the block (see [Exceptions](/reference/exceptions/)).
- **Cancellation**: task cancellation during an `await` point (see [Cancellation](/reference/cancellation/)).

```zena
function readFile(path: String): String {
  using file = openFile(path);
  if (!file.exists()) {
    return ''; // 'file' is disposed before returning
  }
  return file.readAll(); // 'file' is disposed after reading
}
```

### Nullable disposables

If a resource is nullable (`Disposable?`), `using` checks the reference and
safely skips disposal if it is `null`:

```zena
function process(source: File?): void {
  using file = source;
  // If 'file' is null, no disposal call is attempted on exit
}
```

## Cancellation unwinding

In asynchronous and concurrent Zena programs, **cancellation is a third channel**
(see [Cancellation](/reference/cancellation/)), distinct from both return values
(`Result`) and thrown exceptions (`Error` — see [Exceptions](/reference/exceptions/)).

Cancellation is a directive from an ancestor scope signaling that the in-flight
computation is no longer needed (such as a user navigating away, or a timeout
expiring).

### Cancellation propagation

When a cancel scope is cancelled, pending async operations at `await`
checkpoints abort immediately. Rather than running further domain logic, the
task unwinds its call stack.

### Cleanup guarantees during cancellation

Cancellation unwinding honors all language cleanup contracts:

- All active `using` statements run their `dispose()` methods.
- All active `finally` blocks execute.

```zena
async function fetchWithCleanup(url: String): Future<Data> {
  using socket = connect(url);
  try {
    return await socket.read();
  } finally {
    println('Cleanup completed even on cancellation');
  }
}
```

This ensures that network connections, file descriptors, and allocated buffers
are never leaked when tasks are cancelled.

## Reverse cleanup order

When multiple resources or cleanup handlers are active within the same scope,
Zena executes cleanups in **strict reverse order of declaration (LIFO)**.

### Declaration order example

```zena
{
  using first = acquireResource('A');
  using second = acquireResource('B');
  using third = acquireResource('C');

  // Work with resources...

  // On block exit, disposals run in reverse order:
  // 1. third.dispose()
  // 2. second.dispose()
  // 3. first.dispose()
}
```

This guarantees that dependent resources (where `second` might rely on `first`
remaining open) are cleaned up safely before the underlying resources they depend
upon are closed.

### Composition across nested scopes and finally

Reverse ordering applies hierarchically across nested blocks and `finally`
handlers:

```zena
try {
  using a = openA();
  try {
    using b = openB();
    work();
  } finally {
    println('Finally block for inner scope');
  }
} finally {
  println('Finally block for outer scope');
}
```

If an exit occurs within `work()`, cleanups execute in exact nesting order:

1. `b.dispose()`
2. Inner `finally` block
3. `a.dispose()`
4. Outer `finally` block
