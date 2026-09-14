---
title: 'Variables'
description: 'Variable declarations, mutability modifiers, type inference, scoping, and shadowing in Zena.'
---

Zena provides two keywords for declaring variables: `let` for immutable bindings
and `var` for mutable bindings. All variables are block-scoped, statically typed,
and require an initializer at the point of declaration.

There is no `const` keyword; immutable values are always declared with `let`.

## let

The `let` keyword declares an immutable variable binding. Once initialized, the
binding cannot be reassigned:

```zena
let total = 100;
let message = "success";
```

Attempting to reassign a `let` binding or update it with a compound assignment
operator is a compile-time error:

```zena
let counter = 0;
counter = 1;
//^^^^^ error: Cannot assign to immutable variable 'counter'.
counter += 1;
//^^^^^ error: Cannot assign to immutable variable 'counter'.
```

### Literal type preservation

When a `let` variable is declared without an explicit type annotation, type
inference preserves the literal type of the initializer:

```zena
let active = true;        // active has literal type `true`
let status = "ok";        // status has literal type `"ok"`
let code = 200;           // code has type `i32`
```

Preserving literal types allows immutable variables to participate in narrow
unions and exact value comparisons.

## var

The `var` keyword declares a mutable variable binding. A `var` binding can be
reassigned with `=` or updated using compound assignment operators:

```zena
var count = 0;
count = 10;
count += 5;
count *= 2;
```

Zena does not have increment (`++`) or decrement (`--`) operators. All updates
use assignment expressions such as `+= 1` or `-= 1`.

### Literal type widening

When a `var` variable is declared without an explicit type annotation, literal
types in the initializer are automatically widened to their corresponding base
types:

```zena
var flag = true;          // Widened to `boolean`, not literal type `true`
flag = false;             // Valid

var label = "pending";    // Widened to `String`, not `"pending"`
label = "completed";      // Valid
```

Widening ensures that mutable variables can be reassigned to other values of the
same base type. To constrain a `var` binding to a literal or union type, supply an
explicit type annotation:

```zena
var mode: "read" | "write" = "read";
mode = "write";
mode = "append";
//     ^^^^^^^^ error: Type mismatch: '"append"' is not assignable to '"read" | "write"'.
```

## Type annotations

Because every expression in Zena has a type and every variable declaration
requires an initializer, variable types can always be inferred. Type
annotations are optional and are only needed when:

- The variable type should differ from the initializer type (such as a wider supertype or union).
- The initializer relies on a contextual type, such as a non-default numeric type or callback parameter types.
- An explicit type is desired for clarity or documentation.

When provided, a type annotation follows the variable name after a colon:

```zena
let maxRetries: i32 = 3;
var bufferSize: usize = 4096;
```

### Contextual typing of numeric literals

When an explicit type annotation is present, the compiler uses contextual typing
to determine the concrete type of numeric literal initializers:

```zena
let largeId: i64 = 1;     // Literal 1 is typed as `i64`
let mask: u8 = 255;       // Literal 255 is typed as `u8`
```

For bounded integer types (`u8`, `i8`, `u16`, `i16`, `u32`, `u64`), the compiler
validates that literal values fit within the range of the annotated type at
compile time:

```zena
let validByte: u8 = 255;
let overflow: u8 = 256;
//                 ^^^ error: Integer literal 256 is out of range for type 'u8'.
```

Negative numeric literals are checked in their entirety, allowing values like
`let minI8: i8 = -128;`.

## Definite assignment

Every variable declaration requires an initializer. Declaring a variable without
an initial value is a syntax error:

```zena
let total;
//       ^ error: Expected '=' after variable name
var offset: i32;
//             ^ error: Expected '=' after variable name
```

Because an initializer is required at declaration, variables in Zena are
guaranteed to be definitely assigned before use. Variables are never
automatically initialized to `null` or an undefined state.

### Declaration ordering

Variables cannot be referenced before their point of declaration. Variables are
not hoisted:

```zena
let result = factor * 2;
//           ^^^^^^ error: Undeclared variable 'factor'.
let factor = 10;
```

## Shadowing

Variables are lexically scoped to the enclosing block `{ ... }` or library file.
An inner scope can declare a variable with the same name as a variable in an
enclosing outer scope, shadowing the outer declaration:

```zena
let value: i32 = 10;

if (condition) {
  let value: String = "inner";
  console.log(value);     // Prints "inner"
}

console.log(value);       // Prints 10
```

The shadowed variable remains inaccessible within the inner scope. Once the inner
scope exits, the outer variable becomes accessible again.

### Scope redeclaration

Declaring two variables with the same name in the same lexical scope is a
compile-time error:

```zena
let count = 1;
let count = 2;
//  ^^^^^ error: 'count' is already declared in this scope.
```

Shadowing is permitted only across distinct nested scopes.

## Destructuring bindings

Both `let` and `var` declarations accept destructuring patterns to unpack
records, tuples, and arrays into individual variable bindings:

```zena
// Record destructuring
let { x, y } = point;

// Tuple destructuring
let (first, second) = pair;

// Mutable bindings via var
var (cursor, limit) = range;
cursor += 1;
```

Destructuring patterns in variable declarations must be irrefutable. Conditional
patterns that may fail to match use `if (let ...)` or `match` expressions. See
[Destructuring](/reference/destructuring/) for full pattern matching details.
