---
title: 'Loops'
description: 'Iteration constructs in Zena: while, for, for-in, break and continue, and while let.'
---

Zena provides a comprehensive set of loop constructs for condition-driven
iteration, indexed traversal, collection streaming, and zero-allocation
pattern-based consumption.

All loop conditions in Zena require explicit `boolean` expressions; there is no
implicit truthy or falsy coercion.

## while

The `while` loop executes its body repeatedly as long as a condition evaluates to
`true`.

### Syntax

```zena
while (condition) {
  // Body executed while condition is true
}
```

The condition is evaluated before each iteration. The body must be enclosed in
braces (`{ ... }`).

```zena
var count = 3;

while (count > 0) {
  println('Count: ' + count.toString());
  count -= 1;
}
```

### Control-flow narrowing in loops

The compiler tracks conditions on the control-flow graph (CFG) through loop
headers:

- **Loop body narrowing**: If the while condition checks for nullability or type
  membership, the variable is narrowed throughout the loop body:
  ```zena
  var current: Node? = head;
  while (current != null) {
    println(current.value); // current is narrowed to Node
    current = current.next;
  }
  ```
- **Post-loop inversion**: Because exiting a `while` loop guarantees the loop
  condition evaluated to `false`, the compiler inverts the condition for
  subsequent statements:
  ```zena
  var node: Node? = null;
  while (node == null) {
    node = fetchNext();
  }
  // The loop only exits when node != null:
  println(node.value); // node is statically narrowed to Node!
  ```

## for

The `for` statement provides standard three-clause iteration (`initializer`,
`condition`, `update`).

### Syntax

```zena
for (initializer; condition; update) {
  // Loop body
}
```

### Loop variables and compound assignment

Because loop index variables are modified on each step, they must be declared
with `var`.

Zena does not have unary increment or decrement operators (`++` or `--`). Loop
updates use compound assignment (`+= 1` or `-= 1`):

```zena
for (var i = 0; i < 5; i += 1) {
  println('Index: ' + i.toString());
}
```

Variables declared in the `initializer` clause are scoped strictly to the loop
and are not accessible outside.

### Optional clauses

All three clauses are optional. Omitting the condition creates an infinite loop:

```zena
for (;;) {
  if (shouldStop()) {
    break;
  }
}
```

## for-in

The `for-in` loop provides clean, high-level iteration over any object that
implements the `Iterable<T>` interface—including arrays, maps, sets, and
ranges.

### Syntax

```zena
for (let item in collection) {
  // Body executed for each element
}
```

The loop variable is declared with `let` and is fresh for each iteration:

```zena
let names = ['Alice', 'Bob', 'Charlie'];

for (let name in names) {
  println('Hello, ' + name);
}
```

### Destructuring in the loop header

If the iterable yields [tuples](/reference/tuples/) or [records](/reference/records/),
[destructuring patterns](/reference/pattern-matching/) can be written directly in the `for-in`
header:

```zena
let entries = [('apple', 3), ('banana', 5), ('cherry', 8)];

for (let (fruit, quantity) in entries) {
  println(`${fruit}: ${quantity}`);
}
```

### Iterating over ranges

Zena features first-class [range operators](/reference/ranges/) (`..` for inclusive,
`..<` for exclusive):

```zena
// Exclusive upper bound: 0, 1, 2, 3, 4
for (let i in 0..<5) {
  println(i.toString());
}

// Inclusive upper bound: 1, 2, 3, 4, 5
for (let i in 1..5) {
  println(i.toString());
}
```

## break and continue

The `break` and `continue` statements allow early termination or advancement of
loop execution.

### break

`break` terminates the innermost enclosing loop immediately, transferring
control to the statement following the loop:

```zena
for (var i = 0; i < 10; i += 1) {
  if (i == 4) {
    break; // Loop exits when i reaches 4
  }
  println(i.toString());
}
```

### continue

`continue` skips the remainder of the current loop iteration and proceeds to the
next cycle (evaluating the update clause in a `for` loop, or re-evaluating the
test condition in a `while` loop):

```zena
for (var i = 0; i < 6; i += 1) {
  if (i % 2 == 0) {
    continue; // Skip even numbers
  }
  println('Odd: ' + i.toString());
}
```

### Resource cleanup on jumps

When `break` or `continue` exits a block containing active resources—such as
`using` bindings or unmoved owned resources (`Own<R>`)—the runtime guarantees
that those resources are cleaned up before control transfers out of the block.
See [Blocks and Exits](/reference/blocks-and-exits/) for complete details on
cleanup semantics.

## while let

The `while let` loop combines iteration with **refutable [pattern matching](/reference/pattern-matching/)**. It
evaluates an expression on each iteration and tests whether the result matches a
specified pattern. The loop continues executing as long as the pattern matches,
and terminates as soon as it fails to match.

### Syntax

```zena
while (let pattern = expression) {
  // Body executed while expression matches pattern
}
```

### Zero-allocation iterator consumption

The canonical use case for `while let` in Zena is consuming iterators. Standard
library iterators return unboxed, multi-value **inline tuple unions** from
`Iterator.next()`:

```zena
inline (true, T) | inline (false, _)
```

Using `while let` matches the literal `true` presence tag and binds the payload
value in a single step:

```zena
import { Array } from 'zena:collections';

function processAll<T>(iter: Iterator<T>): void {
  // Loops until iter.next() returns (false, _)
  while (let (true, item) = iter.next()) {
    // 'item' is narrowed to T
    handleItem(item);
  }
}
```

Because inline tuples compile to WebAssembly multi-value returns without heap
allocations, `while let` provides the ergonomics of generator iteration with the
performance of a low-level C loop.

### Relationship to for-in

A `while let` loop over `Iterator.next()` is **exactly what `for/in` does** under
the hood. When you write:

```zena
for (let item in collection) {
  handleItem(item);
}
```

The compiler obtains an iterator and desugars the loop into an equivalent `while let`
construct:

```zena
let iter = collection.iterator();
while (let (true, item) = iter.next()) {
  handleItem(item);
}
```

Understanding this equivalence illustrates why `Iterator.next()` uses tagged
inline tuples rather than an allocated wrapper object or sentinel value: both
the high-level `for-in` syntax and the explicit `while let` pattern compile to the
exact same efficient, zero-allocation WebAssembly bytecode.

### Consuming custom stream variants

`while let` can also match sealed class variants:

```zena
sealed class StreamEvent {
  case Message(payload: String)
  case EndOfStream
}

function processEvents(source: EventSource): void {
  while (let Message {payload} = source.poll()) {
    println('Received: ' + payload);
  }
}
```

For the complete taxonomy of supported pattern forms (including record, class,
tuple, and or-patterns), see [Pattern Matching](/reference/pattern-matching/).
