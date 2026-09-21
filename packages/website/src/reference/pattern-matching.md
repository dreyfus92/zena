---
title: 'Pattern Matching'
description: 'Pattern matching, match expressions, pattern forms, destructuring, guards, and exhaustiveness in Zena.'
---

Pattern matching in Zena provides structured, expressive data inspection,
variant discrimination, and destructuring.

Zena distinguishes between two categories of patterns:

- **Irrefutable patterns**: Patterns that are guaranteed to match any value of
  the target type. These are used in variable declarations (`let {x, y} = point;`),
  assignments, and function parameter lists.
- **Refutable patterns**: Patterns that may or may not match a runtime value.
  These are used in `match` expressions, `if let` conditions, and `while let`
  loops.

## match expressions

The `match` expression evaluates a discriminant expression and branches based on
which pattern matches first.

### Syntax

```zena
match (discriminant) {
  case Pattern1: result1
  case Pattern2: {
    // Multi-statement block
    result2
  }
}
```

Zena is an expression-oriented language; `match` is an expression that produces
a value directly:

```zena
let statusName = match (statusCode) {
  case 200: 'OK'
  case 404: 'Not Found'
  case 500: 'Internal Error'
  case _: 'Unknown'
};
```

### Evaluation order and block bodies

Arms are evaluated from top to bottom. The first arm whose pattern (and optional
guard) matches is executed, and subsequent arms are ignored.

When an arm uses braces (`{ ... }`), the block evaluates to the value of its
trailing expression without an explicit `return`:

```zena
let label = match (event) {
  case Click {x, y}: {
    let distance = sqrt(x * x + y * y);
    'Clicked at distance ' + distance.toString()
  }
  case Hover: 'Hovering'
};
```

### Discriminant narrowing

Inside each `case` arm, the discriminant variable (as well as immutable member
paths) is automatically narrowed to the type of the matched pattern:

```zena
sealed class Shape {
  case Circle(radius: f64)
  case Rect(width: f64, height: f64)
}

function getArea(s: Shape): f64 {
  return match (s) {
    case Circle {radius}: {
      // 's' is narrowed to Circle in this arm
      3.14159 * radius * radius
    }
    case Rect {width, height}: {
      // 's' is narrowed to Rect in this arm
      width * height
    }
  };
}
```

## Pattern forms and destructuring

Zena supports a rich set of patterns that compose recursively:

### Literal patterns

Matches exact scalar constants:

```zena
match (code) {
  case 0: 'Success'
  case 1: 'General Error'
  case 'read': 'Read operation'
  case null: 'No value'
}
```

### Wildcard pattern (\_)

The wildcard pattern `_` matches any value without binding a variable:

```zena
match (n) {
  case 1: 'One'
  case 2: 'Two'
  case _: 'Other'
}
```

An identifier pattern (such as `case other:`) also matches any value, but it
binds the matched value to a named variable in scope. The wildcard `_` differs
from variable patterns in three ways:

- **No variable binding**: `_` discards the matched value without introducing a
  name into scope, avoiding unused variable warnings or shadowing outer
  variables.
- **Repetition in composite patterns**: Identifier patterns cannot reuse the
  same variable name within a single pattern (for example, `(x, x)` is an error
  because `x` is declared twice). The wildcard `_` can be repeated as many times
  as needed:
  ```zena
  case (_, 0, _): 'Middle element is zero'
  ```
- **Ignoring positional tuple elements**: Positional tuples require an element
  pattern for every slot. `_` allows skipping unneeded positions without
  inventing dummy variable names:
  ```zena
  let (id, _) = pair;
  ```

### Identifier and binding patterns

A variable identifier in a pattern matches any value and binds it to that name
in the arm's body:

```zena
match (val) {
  case 0: 'Zero'
  case other: 'Non-zero: ' + other.toString()
}
```

### Record patterns and destructuring

Decomposes [record](/reference/records/) objects by property name. Field values can be extracted,
renamed, or assigned defaults:

```zena
let point = {x: 10, y: 20};

// Destructuring in a variable declaration:
let {x, y} = point;

// Matching in a match expression:
match (point) {
  case {x: 0, y: 0}: 'Origin'
  case {x, y}: `Point at (${x}, ${y})`
}
```

Field renaming is written with `as`:

```zena
let {x as xPos, y as yPos} = point;
```

### Tuple patterns and inline tuples

Decomposes positional [tuples](/reference/tuples/):

```zena
let pair = (1, 'hello');
let (id, message) = pair;

match (pair) {
  case (0, _): 'Zero pair'
  case (id, msg): `ID ${id}: ${msg}`
}
```

Tagged inline tuples (used by standard library returns) match identically:

```zena
match (map.get(key)) {
  case (true, val): 'Found: ' + val.toString()
  case (false, _): 'Missing'
}
```

### Class patterns

Decomposes class instances by matching their constructor or field structure:

```zena
class User(name: String, age: i32)

let u = new User('Alice', 30);

match (u) {
  case User {name, age}: println(`${name} is ${age}`)
}
```

### Unit variant patterns

Matches sealed class variants declared without state (`case None`, `case Red`):

```zena
sealed class Color {
  case Red, Green, Blue
}

let name = match (color) {
  case Red: 'Red'
  case Green: 'Green'
  case Blue: 'Blue'
};
```

### As patterns (pattern aliases)

The `as` keyword binds the entire matched sub-pattern to a variable name while
simultaneously destructuring its internal fields:

```zena
match (shape) {
  case Circle {radius} as c: {
    // Both 'radius' (field) and 'c' (the Circle instance) are bound
    println('Circle area: ' + (c.radius * c.radius * 3.14).toString());
  }
  case Rect as r: {
    println(`Rectangle dimensions: ${r.width}x${r.height}`);
  }
}
```

## Pattern guards

A pattern guard adds an arbitrary boolean condition to a `case` arm using the
`if` keyword. The arm matches only if the pattern matches **and** the guard
expression evaluates to `true`:

```zena
match (number) {
  case n if n < 0: 'Negative'
  case n if n == 0: 'Zero'
  case n if n % 2 == 0: 'Positive even'
  case _: 'Positive odd'
}
```

Guards can inspect values bound within the pattern:

```zena
match (shape) {
  case Rect {width, height} if width == height: 'Square'
  case Rect {width, height}: 'Rectangle'
  case Circle: 'Circle'
}
```

## Or patterns

Multiple alternative patterns can be combined in a single arm using the pipe
(`|`) operator:

```zena
match (code) {
  case 200 | 201 | 204: 'Success'
  case 400 | 401 | 403 | 404: 'Client Error'
  case 500 | 502 | 503: 'Server Error'
  case _: 'Other'
}
```

When or-patterns bind variables, every alternative pattern must bind the same set
of variable names with compatible types.

## Exhaustiveness checking

The Zena compiler performs static **exhaustiveness checking** on `match`
expressions. A `match` expression must account for every possible value that the
discriminant's type can represent.

### Sealed class hierarchies

For a sealed class, the match expression must handle every declared variant (or
include a wildcard `case _:` arm):

```zena
sealed class Result {
  case Success(data: String)
  case Failure(error: String)
}

// Compile error: Non-exhaustive match: missing variant 'Failure'.
let msg = match (res) {
  case Success {data}: data
};
```

Adding the missing variant or a wildcard resolves the error:

```zena
let msg = match (res) {
  case Success {data}: data
  case Failure {error}: 'Error: ' + error
};
```

### Union types

Untagged [union types](/reference/unions/) must similarly cover all constituent member types:

```zena
type Pet = Cat | Dog | Bird;

function getSound(p: Pet): String = match (p) {
  case Cat: 'meow'
  case Dog: 'woof'
  case Bird: 'chirp'
};
```

## Pattern conditions with if let and while let

When you only care about matching a single pattern variant rather than handling
all possible cases, [`if let`](/reference/conditionals/) (in conditional statements)
and [`while let`](/reference/loops/) (in loop headers) provide concise conditional
destructuring:

### if let

```zena
if (let (true, user) = userMap.get(id)) {
  println('User: ' + user.name);
} else {
  println('User not found');
}
```

### while let

```zena
while (let (true, item) = stream.next()) {
  processItem(item);
}
```

Using `if let` and `while let` avoids writing a full `match` expression with an
empty or default fallback arm when only one variant requires special handling.
See [Conditionals](/reference/conditionals/) and [Loops](/reference/loops/) for
their surrounding control flow semantics.
