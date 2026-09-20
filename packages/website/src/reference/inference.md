---
title: 'Inference'
description: 'Type inference in Zena: local variables, literal widening, contextual typing, generic argument inference, and return types.'
---

Zena employs bidirectional type inference, combining bottom-up type synthesis
from expressions with top-down contextual typing from expected types. Local
variable types, generic type arguments, lambda parameter types, and function
return types can frequently be omitted, producing concise code while retaining
full static type safety.

## Local variable inference

`let` and `var` variable declarations infer their static types directly from
their initializer expressions:

```zena
let count = 42;
let name = 'Alice';
let origin = new Point(0.0, 0.0);
```

Explicit type annotations on initialized local variables (such as `let count:
i32 = 42;`) are valid but rarely necessary.

Initializers are strictly required for all scalar types (`i32`, `f64`,
`boolean`, etc.), as primitives cannot be `null` or uninitialized. When an
initializer is omitted on a declaration, an explicit type annotation is
required, the type must be nullable, and the initial value defaults to `null`:

```zena
var pending: String?; // Explicit nullable type required; initial value is null
```

## Literal widening

Zena differentiates between immutable bindings (`let`) and mutable bindings
(`var`) when inferring literal types.

### Immutable bindings (`let`)

`let` bindings retain exact literal types for string, boolean, and numeric
literals:

```zena
let mode = 'strict';  // Type is the literal string 'strict'
let flag = true;      // Type is the literal boolean true
```

Preserving literal types enables inferred variables to satisfy union types and
discriminate pattern matches:

```zena
type Theme = 'light' | 'dark' | 'system';

let current = 'light'; // Inferred as the literal type 'light'

function applyTheme(theme: Theme) {
  // ...
}

// Valid: the inferred literal type 'light' is assignable to Theme
applyTheme(current);
```

By contrast, if `current` were declared with `var`, its type would widen to
`String`, and `applyTheme(current)` would produce a compile error because
`String` is not assignable to `'light' | 'dark' | 'system'`.

### Mutable bindings (`var`)

Mutable variables (`var`) widen literal initializers to their general scalar
types:

```zena
var mode = 'strict';  // Widened to String
mode = 'permissive';  // Valid

var flag = true;      // Widened to boolean
flag = false;         // Valid
```

If `var` preserved literal types, reassignment to any other value of the base
type would produce a compile error. Widening allows mutable variables to be
reassigned freely within their base type.

Mutable class fields (`var`) also widen literal initializers to scalar types:

```zena
class Counter {
  var count = 0;  // Widened to i32
}
```

### Numeric literals and contextual numbers

Integer literal syntax defaults to `i32`, while floating-point syntax defaults
to `f64` in the absence of context:

```zena
let n = 100;    // i32
let pi = 3.14;  // f64
```

When a numeric literal appears in a context expecting a specific integer or
floating-point type (such as `u8`, `u16`, `i8`, `i16`, `i64`, or `f32`), the
literal adapts to the expected type:

```zena
let byte: u8 = 255;      // Literal 255 treated as u8
let big: i64 = 1000;     // Literal 1000 treated as i64
let floatVal: f32 = 1.5; // Literal 1.5 treated as f32
```

The compiler verifies literal values against the target type's range at compile
time. Values that exceed the range produce a compile error:

```zena
let invalid: u8 = 256;  // Compile error: integer literal out of range for u8
```

## Contextual typing

Contextual typing is top-down type inference: the expected type of an expression
influences how the expression itself is checked.

### Arrow function parameters

When an arrow function is passed as an argument or assigned to an annotated
variable, its parameter types are inferred from the expected function type:

```zena
let numbers = [1, 2, 3, 4];
let doubled = numbers.map((x) => x * 2);  // x is inferred as i32
```

In the example above, `Array.map` expects a callback `(item: T) => U`. Because
`numbers` is `Array<i32>`, `x` is contextually typed as `i32` without requiring
`(x: i32) => x * 2`.

Without an expected type from context, unannotated arrow function parameters
produce a compile error:

```zena
// Compile error: parameter 'x' requires a type annotation
let addOne = (x) => x + 1;

// Valid:
let addOne = (x: i32) => x + 1;
```

### Empty collection literals

An empty array literal `[]` has no element expressions to inspect. Contextual
typing supplies the element type from the target context:

```zena
let names: Array<String> = [];  // Element type String inferred from context
```

If an empty collection literal appears without an expected contextual type, the
compiler cannot determine the element type, and an explicit annotation or cast
is required:

```zena
let items = [] as Array<String>;
```

### Record literals

Record literals infer field names and field types from their properties, and can
be checked against expected structural record types:

```zena
type Config = {
  host: String,
  port: i32,
  verbose?: boolean,
};

let server: Config = {
  host: 'localhost',
  port: 8080,
};
```

## Generic type argument inference

Zena infers generic type arguments at call sites and constructor invocations,
eliminating the need to explicitly write `<T>` on every call.

### Function calls and constructors

Type parameters are inferred from the types of the provided arguments:

```zena
function identity<T>(value: T): T {
  return value;
}

let result = identity('hello');  // T inferred as 'hello' (or String)

class Box<T> {
  value: T;
  new(this.value);
}

let box = new Box(42);  // Box<i32> inferred
```

### Multi-phase closure inference

Generic functions often take both data collections and callback closures. Zena
infers type parameters across multiple phases:

```zena
function transform<T, U>(items: Array<T>, callback: (item: T) => U): Array<U> {
  let result = new Array<U>();
  for (let item in items) {
    result.push(callback(item));
  }
  return result;
}

let strings = ['apple', 'banana', 'cherry'];
let lengths = transform(strings, (s) => s.length);
```

Inference proceeds in distinct stages:

1. Argument `strings` is checked against `Array<T>`, fixing `T = String`.
2. With `T` known, the expected type for `callback` becomes `(item: String) =>
U`.
3. The parameter `s` in `(s) => s.length` receives the contextual type `String`.
4. The body `s.length` is evaluated with `s: String`, producing `i32` and fixing
   `U = i32`.
5. The function return type resolves to `Array<i32>`.

### Limitations and explicit type arguments

Generic inference requires sufficient information from arguments or context. In
two common scenarios, explicit type arguments or parameter annotations are
required:

1. **Sole closure argument fixing a type parameter**: If a type parameter only
   appears within an unannotated closure parameter, `T` cannot be resolved
   before evaluating the closure:

   ```zena
   function runHandler<T>(handler: (event: T) => void): void { ... }

   // Error: cannot infer type of parameter 'e'
   runHandler((e) => processEvent(e));

   // Solution 1: Explicit type argument
   runHandler<CustomEvent>((e) => processEvent(e));

   // Solution 2: Explicit parameter annotation
   runHandler((e: CustomEvent) => processEvent(e));
   ```

2. **Return-only type parameters**: When a type parameter appears only in the
   return type, argument values provide no information to infer it:

   ```zena
   function parse<T>(json: String): T { ... }

   // Explicit type argument required
   let config = parse<AppConfig>('{ ... }');
   ```

## Return type inference

Function and arrow return types are inferred automatically from their bodies
when no return type annotation is provided.

### Expression bodies

Arrow functions with expression bodies infer their return type directly from the
evaluated expression:

```zena
let add = (a: i32, b: i32) => a + b;  // Inferred return type: i32
```

### Block bodies

Functions with block bodies infer their return type by finding the common
supertype across all `return` statements:

```zena
function choose(condition: boolean, a: String, b: String) {
  if (condition) {
    return a;
  }
  return b;
}  // Inferred return type: String
```

If a block body has branches that do not return a value, or contains no `return`
statements, the return type is inferred as `void`:

```zena
function logMessage(msg: String) {
  println(msg);
}  // Inferred return type: void
```

### Async functions and generators

Return type inference accounts for asynchronous and generator execution:

- An `async` function returning an expression of type `T` has an inferred return
  type of `Future<T>`:
  ```zena
  async function fetchCount() {
    return 42;
  }  // Inferred return type: Future<i32>
  ```
- A generator function yielding values of type `T` has an inferred return type
  of `Iterator<T>`:
  ```zena
  function* countUpTo(limit: i32) {
    for (var i = 0; i < limit; i += 1) {
      yield i;
    }
  }  // Inferred return type: Iterator<i32>
  ```

## When type annotations are required

While inference covers most common code patterns, explicit type annotations are
required in specific situations to preserve soundness and resolve ambiguity:

### Recursive and mutually recursive functions

When a function calls itself, its return type cannot be synthesized from its
return statements without first knowing the return type of the recursive call.
Recursive functions require an explicit return type annotation:

```zena
// Compile error: Recursive function requires an explicit return type annotation
let factorial = (n: i32) => {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
};

// Valid:
let factorial = (n: i32): i32 => {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
};
```

The same rule applies to mutually recursive functions: every function in the
recursive cycle must declare its return type explicitly.

### Functions with `tail return`

Functions that use the `tail return` statement must declare their return type
explicitly. Zena compiles `tail return` directly to WebAssembly's `return_call`
instruction, which discards the caller's stack frame before executing the
callee.

Because the caller frame no longer exists when the callee completes, no
post-call conversions (such as interface packaging, subtype casting, or
unboxing) can run. The compiler verifies that the callee's return type matches
the caller's declared return type exactly:

```zena
// Compile error: 'tail return' requires the enclosing function to declare its return type.
let countUp = (n: i32, max: i32) => {
  if (n >= max) {
    return n;
  }
  tail return countUp(n + 1, max);
};

// Valid:
let countUp = (n: i32, max: i32): i32 => {
  if (n >= max) {
    return n;
  }
  tail return countUp(n + 1, max);
};
```

### Declarations without initializers

Initializers are strictly required for all scalar types (`i32`, `f64`,
`boolean`), which have no default uninitialized state and cannot be `null`.

When an initializer is omitted on a variable or class field, the type cannot be
inferred and must be explicitly declared as a nullable type (`T?` or `T |
null`). The initial value defaults to `null`:

```zena
class Task {
  var count: i32 = 0;   // Initializer required for scalars
  var pending: String?; // No initializer: requires nullable type; defaults to null
}
```

Attempting to declare a non-nullable type without an initializer produces a
compile error.

### Empty collections without context

Empty array literals without contextual type information must provide an
explicit type annotation or type cast:

```zena
let items = [] as Array<i32>;
```

### Unconstrained generic calls

Generic functions with return-only type parameters or unconstrained type
parameters must be called with explicit type arguments:

```zena
let parsed = parse<UserPayload>(rawJson);
```

### Public library and API boundaries

Although top-level functions and class methods can infer their return types,
annotating public and exported signatures is recommended. Explicit annotations
document module contracts and prevent inadvertent breaking API changes when
implementation details change.
