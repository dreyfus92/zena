---
title: 'Booleans'
description: 'Boolean type, literals, and strict conditional semantics in Zena.'
---

Zena provides a dedicated primitive `boolean` type for logical truth values. Unlike
dynamically typed languages or languages with truthy/falsy coercion, Zena enforces
strict, sound boolean semantics across all control flow and logical expressions.

## The boolean type

The `boolean` type represents a binary logical state (`true` or `false`). Like numbers,
`boolean` is an unboxed primitive type that compiles directly to WebAssembly `i32`,
where `1` represents `true` and `0` represents `false`:

```zena
let isActive: boolean = true;
var isComplete = false; // Inferred as boolean
```

## true and false

Zena has two canonical boolean literals: `true` and `false`.

### Operations producing booleans

Boolean values are produced by comparison, equality, type testing, and logical operators:

- **Relational comparisons**: `<`, `<=`, `>`, `>=`
  ```zena
  let isPositive = count > 0;
  ```
- **Equality comparisons**: `==`, `!=`, `===`, `!==`
  ```zena
  let isMatch = name == 'Alice';
  ```
- **Type tests**: `is`
  ```zena
  let isText = value is String;
  ```
- **Logical NOT**: `!`
  ```zena
  let isHidden = !isVisible;
  ```

### Logical operators

Logical operators combine or invert boolean values with short-circuiting evaluation:

| Operator | Name        | Description                                     | Short-circuit behavior                  |
| :------- | :---------- | :---------------------------------------------- | :-------------------------------------- |
| `!`      | Logical NOT | Inverts a boolean value                         | None (unary)                            |
| `&&`     | Logical AND | Conjunction: `true` if both operands are `true` | If LHS is `false`, RHS is not evaluated |
| `\|\|`   | Logical OR  | Disjunction: `true` if either operand is `true` | If LHS is `true`, RHS is not evaluated  |

```zena
let canEdit = user.isAuthenticated && (user.isAdmin || user.isOwner);
```

Operands to `&&` and `||` must be of type `boolean`. Mixing non-boolean operands in
logical operations is a compile-time error.

## Strict conditional semantics

Zena has a sound type system with **no truthy or falsy values**. There are no implicit
conversions from integers, floats, strings, collections, or `null` to `boolean`.

### Strict condition requirements

Every condition in Zena control flow must evaluate strictly to a `boolean`:

- `if` statements and `if` expressions
- `while` loops
- `for` loop conditions
- `!` (logical NOT), `&&` (logical AND), and `||` (logical OR)

Passing a non-boolean expression directly as a condition produces a compile-time error:

```zena
let name: String? = null;
if (name) { ... }
// @error: Type mismatch: expected 'boolean', got 'String?'

let count: i32 = 0;
if (count) { ... }
// @error: Type mismatch: expected 'boolean', got 'i32'
```

### Explicit comparisons

To evaluate conditions on non-boolean values, write the comparison explicitly:

| JavaScript / TypeScript | Zena equivalent                             |
| :---------------------- | :------------------------------------------ |
| `if (user)`             | `if (user != null)`                         |
| `if (!items.length)`    | `if (items.length == 0)`                    |
| `if (count)`            | `if (count != 0)`                           |
| `if (text)`             | `if (text.length > 0)` or `if (text != '')` |

```zena
let items = [1, 2, 3];
if (items.length > 0) {
  // Explicit length comparison
}

let title: String? = 'Zena';
if (title != null) {
  // Explicit null check
}
```

### Type narrowing through boolean conditions

Boolean conditions drive Zena's control-flow type narrowing:

- **Null checks**: Testing `x != null` narrows `x` to its non-null type in the `true`
  branch, and to `null` in the `else` branch:
  ```zena
  let input: String? = getInput();
  if (input != null) {
    // input is narrowed to String
    let len = input.length;
  } else {
    // input is narrowed to null
  }
  ```
- **Type tests**: Testing `x is T` narrows `x` to type `T` in the `true` branch:
  ```zena
  let item: Shape = getShape();
  if (item is Circle) {
    // item is narrowed to Circle
    let r = item.radius;
  }
  ```

Type narrowing applies safely to local variables, parameters, and immutable member
paths (such as immutable `let` fields, records, and tuples).
