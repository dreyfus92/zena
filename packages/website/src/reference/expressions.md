---
title: 'Expressions'
description: 'Expression syntax, member access, calls, and evaluation order in Zena.'
---

An expression in Zena is a syntactic construct that evaluates to a value. Zena is
an expression-oriented language: many constructs that are statements in C-style
languages—including conditionals, pattern matches, and error handlers—are
expressions that produce values.

## Expression-oriented syntax

Several fundamental control flow structures in Zena operate as expressions:

- **Conditional expressions (`if`/`else`)**: Evaluate a condition and produce
  the value of the selected branch:

```zena
let status = if (score >= 90) 'pass' else 'fail';
```

All branches must yield compatible types. See [Control Flow](/reference/control-flow/)
for multi-branch chains and `if-let` pattern bindings.

- **Match expressions (`match`)**: Match a value against patterns and evaluate
  to the expression of the first matching case:

```zena
let label = match (result) {
  case Ok {value}: 'Success: ' + value
  case Err {error}: 'Error: ' + error.message
};
```

See [Pattern Matching](/reference/pattern-matching/) for pattern types and
exhaustiveness checking.

- **Try expressions (`try`/`catch`)**: Attempt an operation and evaluate to a
  fallback value if an exception occurs:

```zena
let port = try { parsePort(env) } catch (e) { 8080 };
```

See [Exceptions](/reference/exceptions/) for error handling and cleanup syntax.

### Blocks in expression positions

The branches of `if`/`else`, `match` cases, and `try`/`catch` constructs can be
block bodies enclosed in curly braces (`{}`).

Inside an expression block, statements execute in sequential order. The final
expression in the block (without a trailing semicolon) provides the value
produced by the block:

```zena
let discount = if (isMember) {
  let base = getBaseRate();
  base * 0.9
} else {
  0.0
};
```

If a block ends with a statement terminated by a semicolon, or if the block contains
no statements, the block evaluates to `void`.

### Blocks versus record literals

Zena does not have standalone block expressions. In expression position, curly
braces define record literals or map literals:

```zena
let origin = {x: 0.0, y: 0.0}; // Record literal, not a block expression
```

At the statement level, a standalone block `{ ... }` introduces a new lexical scope
for variable declarations and deterministic resource disposal (`using`), but it does
not evaluate to a value.

## Literals

Literals represent constant values written directly in source code. Zena provides
literals for primitive types, text, and compound data structures:

| Literal form         | Examples                       | Reference                         |
| :------------------- | :----------------------------- | :-------------------------------- |
| **Numbers**          | `42`, `3.14`, `0xff`, `0b1010` | [Numbers](/reference/numbers/)    |
| **Booleans**         | `true`, `false`                | [Booleans](/reference/booleans/)  |
| **Strings**          | `'hello'`, `"world"`           | [Strings](/reference/strings/)    |
| **Template strings** | `` `count: ${n}` ``            | [Strings](/reference/strings/)    |
| **Null**             | `null`                         | [Unions](/reference/unions/)      |
| **Arrays**           | `[1, 2, 3]`                    | [Arrays](/reference/arrays/)      |
| **Records**          | `{x: 10, y: 20}`               | [Records](/reference/records/)    |
| **Maps**             | `{'key' => 'value'}`           | [Maps and Sets](/reference/maps/) |
| **Tuples**           | `(1, 'two')`                   | [Tuples](/reference/tuples/)      |

Because curly braces define record literals (`{x: 0}`) and map literals (`{'a' => 1}`)
in expression position, curly braces cannot be used as standalone block expressions.

## Member access

Zena provides several forms of member access:

### Property access

Dot notation (`.`) accesses public fields, getters, and methods:

```zena
let name = user.name;
let count = list.length;
```

### Private field access

Private fields are prefixed with `#`. Access to private fields is restricted to the
declaring class:

```zena
class Counter {
  var #count: i32 = 0;

  increment() {
    this.#count += 1;
  }
}
```

### Symbol-keyed member access

Properties and methods can be keyed by unique symbols using `.[symbol]` syntax:

```zena
symbol idKey;

class Entity {
  var [idKey]: i32;
  new(id: i32) {
    this.[idKey] = id;
  }
}

let entity = new Entity(42);
let id = entity.[idKey];
```

Qualified symbol paths, such as standard library protocol symbols, are written
inside the brackets:

```zena
let iter = items.[Iterable.iterator]();
```

### Index access

Bracket indexing (`[]`) accesses array elements and map entries:

```zena
let first = items[0];
let value = map['key'];
```

### Optional chaining

The optional chaining operators safely traverse nullable references by
short-circuiting to `null` when the receiver is `null`:

- **Optional property access (`?.`)**: `user?.profile?.address`
- **Optional private field access (`?.#`)**: `this?.#secret`
- **Optional symbol-keyed access (`?.[]`)**: `entity?.[idKey]`
- **Optional index access (`?[]`)**: `items?[0]`

If the left-hand operand evaluates to `null`, the remainder of the member or index
chain is skipped, and the entire expression evaluates to `null`:

```zena
let c: Container | null = null;
let name = c?.inner?.name; // Evaluates to null without throwing
```

## Calls

Calling functions, methods, and closures uses parenthesis syntax:

### Function and method invocation

Arguments are passed as a comma-separated list enclosed in parentheses:

```zena
let total = add(10, 20);
let greeting = user.greet('Alice');
```

### Generic type arguments

Calls to generic functions or methods that require explicit type arguments specify
them in angle brackets (`<...>`) before the argument list:

```zena
let box = Box.of<i32>(42);
let config = parseJson<Config>(source);
```

### Symbol-keyed method invocation

Symbol-keyed methods are invoked by combining `.[symbol]` with an argument list:

```zena
resource.[Disposable.dispose]();
```

### Optional call invocation

When invoking a nullable function or callback, the optional call operator (`?(`)
guards against `null`:

```zena
let callback: ((i32) => void) | null = getHandler();
callback?(42);
```

If `callback` is `null`, the call is skipped and the expression evaluates to
`null`.

For chaining expressions with the pipeline operator (`|>`) and the `$` placeholder,
see [Operators](/reference/operators/).

## Evaluation order

Zena enforces predictable evaluation semantics across all expressions:

### Left-to-right evaluation

Subexpressions in Zena always evaluate strictly from left to right:

1. **Binary and compound expressions**: In `a() + b()`, `a()` evaluates before `b()`.
2. **Argument lists**: In `f(first(), second())`, `first()` evaluates before `second()`.
3. **Literal elements**: Elements in array literals (`[a(), b()]`), record literals
   (`{x: a(), y: b()}`), and tuple literals (`(a(), b())`) evaluate in lexical order.
4. **Member chains**: In `a().b().c()`, each segment evaluates before the next.

### Short-circuiting evaluation

Certain expressions terminate evaluation early based on intermediate outcomes:

- **Logical AND (`&&`)**: Evaluates the right-hand operand only if the left-hand
  operand evaluates to `true`.
- **Logical OR (`||`)**: Evaluates the right-hand operand only if the left-hand
  operand evaluates to `false`.
- **Null coalescing (`??`)**: Evaluates the right-hand operand only if the left-hand
  operand is `null`.
- **Optional chaining (`?.`, `?[]`, `?(`)**: Evaluates subsequent member accesses,
  index operations, or invocations only if the receiver is not `null`.
- **Conditional expressions (`if`/`else`)**: Evaluates only the branch selected by
  the condition.
