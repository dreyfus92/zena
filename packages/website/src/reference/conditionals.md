---
title: 'Conditionals'
description: 'Conditional branching, if statements, if expressions, and pattern conditions in Zena.'
---

Zena provides conditional branching constructs that can be used both as
control-flow statements and as value-producing expressions.

In Zena, `if` expressions directly replace the ternary operator (`? :`),
providing unified syntax for conditional logic while enforcing strict type
safety without implicit boolean coercion.

## if statements

The `if` statement executes a block of code conditionally based on a boolean
expression.

### Syntax

```zena
if (condition) {
  // Body executed when condition is true
}
```

In Zena, the condition must be enclosed in parentheses, and the body must be
enclosed in braces (`{ ... }`). Single-statement unbraced bodies are not
permitted:

```zena
let count = 5;

if (count > 0) {
  println('Count is positive');
}
```

### Lexical scoping

Variables declared within an `if` block with `let` or `var` are lexically scoped
to that block and cannot be accessed outside:

```zena
if (isActive) {
  let message = 'Running';
  println(message);
}
// message is not accessible here
```

## if-else and else-if

An `if` statement can include an optional `else` branch, or multiple chained
`else if` branches:

```zena
if (score >= 90) {
  println('Grade: A');
} else if (score >= 80) {
  println('Grade: B');
} else if (score >= 70) {
  println('Grade: C');
} else {
  println('Grade: F');
}
```

Execution evaluates conditions from top to bottom. As soon as a condition
evaluates to `true`, its corresponding block executes and the remaining branches
are skipped. If none of the conditions evaluate to `true`, the `else` block
executes (if present).

## if as an expression

Zena is an **expression-oriented language**. An `if` construct can be evaluated
as an expression to produce a value directly, assigning the result to a
variable, passing it as a function argument, or returning it:

```zena
let max = if (a > b) a else b;
```

In Zena, `if` expressions replace the traditional ternary operator (`cond ? a : b`)
found in languages like C, Java, and JavaScript.

### Mandatory else branch

When an `if` construct is used in an expression context (where its result is
expected to produce a value), the `else` branch is **mandatory**:

```zena
// Error: An 'if' expression must have an 'else' branch.
let status = if (ready) 'OK';
```

Because an expression must always produce a value, omitting `else` would leave
the value undefined when the condition is `false`.

### Block expressions and trailing values

When branches of an `if` expression contain multiple statements enclosed in
braces, each block evaluates to the value of its trailing expression (without
requiring a `return` keyword):

```zena
let price = if (hasDiscount) {
  let discount = 15;
  basePrice - discount // Evaluates to the branch value
} else {
  basePrice
};
```

### Resulting type and union types

When the branches of an `if` expression produce different types, the compiler
types the overall expression as the **union** of the branch types:

```zena
// Inferred type is String | i32
let result = if (useText) 'Ready' else 0;
```

If the types share a common supertype or interface, the expression can be typed
accordingly:

```zena
class Dog extends Animal {}
class Cat extends Animal {}

let pet: Animal = if (preferDog) new Dog() else new Cat();
```

### Early jumps and the never type

An arm of an `if` expression can execute an early control-flow jump—such as
`return`, `throw`, `break`, or `continue` (see [Blocks and Exits](/reference/blocks-and-exits/)
and [Exceptions](/reference/exceptions/)):

```zena
let user = if (maybeUser != null) maybeUser else return null;

let port = if (rawPort > 0) rawPort else throw new Error('Invalid port');
```

Because an arm that returns or throws never produces a value, its static type is
`never` (the bottom type). In Zena's type algebra, `never | T` simplifies
directly to `T`. This allows guard clauses to be written inline cleanly without
diluting the variable's type.

## Pattern matching with if let

The `if let` statement provides **refutable pattern matching** directly within a
conditional header. It evaluates an expression, tests whether it conforms to a
pattern, and if so, binds variables that are scoped strictly to the `if` block:

```zena
if (let pattern = expression) {
  // Pattern matched: bound variables are in scope here
} else {
  // Pattern did not match
}
```

### Tagged tuple returns (Map.get)

A primary application of `if let` in the standard library is querying maps and
lookups. Methods like `Map.get(key)` return an unboxed **[inline tuple](/reference/tuples/) union**:

```zena
inline (true, V) | inline (false, _)
```

Using `if let` tests the boolean presence tag and binds the payload value in a
single operation:

```zena
import { Map } from 'zena:collections';

let scores = new Map<String, i32>();
scores['Alice'] = 98;

if (let (true, score) = scores.get('Alice')) {
  // 'score' is in scope and statically narrowed to i32
  println('Score: ' + score.toString());
} else {
  println('User not found');
}
```

Because inline tuples compile to WebAssembly multi-value returns, this presence
check and payload retrieval involves **zero heap allocation**.

For the complete taxonomy of supported pattern forms (including record, class,
and or-patterns), see [Pattern Matching](/reference/pattern-matching/).

## Strict boolean evaluation

Zena enforces **strict boolean semantics**. The condition in an `if` statement,
`else if` clause, or `if` expression must be of type [`boolean`](/reference/booleans/).

### No truthy or falsy coercion

Unlike JavaScript, TypeScript, or Python, Zena does not perform implicit truthy
or falsy conversions. Numbers, strings, objects, and `null` cannot be used
directly as conditions:

```zena
let count = 0;
let name: String? = null;

// Error: Type 'i32' is not assignable to type 'boolean'.
if (count) { ... }

// Error: Type 'String?' is not assignable to type 'boolean'.
if (name) { ... }
```

Conditions must be written as explicit boolean expressions:

```zena
// Explicit numeric check
if (count > 0) { ... }

// Explicit null check
if (name != null) { ... }

// Explicit emptiness check
if (text.length > 0) { ... }
```

This design eliminates a broad class of subtle runtime bugs stemming from
implicit coercion (such as `0` or `""` unexpectedly behaving as `false`).
