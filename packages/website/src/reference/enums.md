---
title: 'Enums'
description: 'Enumeration types, backing types, member initializers, conversions, and comparison with sealed classes in Zena.'
---

Enums define closed sets of named constant values. An enum is a distinct, nominal
type backed by either 32-bit signed integers (`i32`) or strings (`String`),
providing type safety without runtime boxing overhead.

## Declaring an enum

Declare an enum using the `enum` keyword followed by a type name and a comma-separated
list of members:

```zena
enum Color {
  Red,
  Green,
  Blue,
}
```

Trailing commas after the final member are optional. An enum declaration must
contain at least one member; empty enum declarations (`enum Empty {}`) are
rejected by the compiler.

### Dual namespace

An enum declaration introduces names into two namespaces:

1. In the **type namespace**, it defines the type `Color`, representing any
   valid member of the enumeration.
2. In the **value namespace**, it defines an object `Color` whose properties
   are the enum's members.

Enum members are accessed through the enum name:

```zena
let favorite: Color = Color.Green;
```

Members can be compared for equality using the standard equality operators (`==`
and `!=`):

```zena
if (favorite == Color.Green) {
  println('Green!');
}
```

## Backing types and initializers

Every enum has an underlying scalar representation: either `i32` or `String`. The
backing type is determined by the first member of the declaration:

- If the first member has a string literal initializer, the enum is a **string enum**
  backed by `String`.
- Otherwise, the enum is an **integer enum** backed by `i32`.

### Integer enums

Integer enums are backed by `i32`. By default, member values start at `0` and
increment by `1` for each subsequent member:

```zena
enum Direction {
  North, // 0
  East,  // 1
  South, // 2
  West,  // 3
}
```

#### Explicit integer initializers

Members can be assigned explicit values using `i32` numeric literals in decimal or
hexadecimal notation:

```zena
enum HttpStatus {
  Ok = 200,
  Created = 201,
  BadRequest = 400,
  NotFound = 404,
  InternalServerError = 500,
}

enum Permission {
  None = 0x00,
  Read = 0x01,
  Write = 0x02,
  Execute = 0x04,
}
```

#### Auto-incrementing from explicit values

When a member does not specify an initializer, it automatically takes the value of
the previous member plus `1`:

```zena
enum Priority {
  Low = 1,
  Medium,   // 2
  High,     // 3
  Urgent = 10,
  Critical, // 11
}
```

#### Literal requirement

Integer initializers must be numeric literals. Dynamic expressions and computed
arithmetic are not allowed:

```zena
enum Status {
  Ok = 200,
  Failed = 100 + 100,
  //       ^^^^^^^^^ @error: Enum member initializer must be an i32 literal.
}
```

### String enums

When the first member is initialized with a string literal, the enum is backed by
`String`:

```zena
enum Command {
  Start = 'start',
  Stop = 'stop',
  Pause = 'pause',
}
```

#### Mandatory initializers

In a string enum, every member must have an explicit initializer. Omitting an
initializer produces a compile-time error:

```zena
enum Action {
  Open = 'open',
  Close, // @error("Close"): String enum member 'Close' must have an initializer.
}
```

#### Literal requirement

Like integer enums, initializers for string enums must be string literals. String
concatenations and variable references are not permitted:

```zena
enum Protocol {
  Http = 'http',
  Https = 'http' + 's',
  //      ^^^^^^^^^^^^ @error: Enum member initializer must be a string literal.
}
```

Enums cannot mix member kinds: a string initializer cannot appear in an integer
enum, and numeric initializers cannot appear in a string enum.

## Nominality and conversions

Enums are distinct nominal types. Even though an enum has an underlying `i32` or
`String` representation, values are not implicitly assignable to or from their
backing type:

```zena
enum Level {
  Low,
  High,
}

let lvl: Level = Level.Low;

// Error: cannot assign an enum to its backing type implicitly:
let raw: i32 = lvl;
//             ^^^ @error: Type mismatch: expected i32, found Level

// Error: cannot assign a backing type value to an enum implicitly:
let back: Level = 0;
//                ^ @error: Type mismatch: expected Level, found i32
```

### Casting with `as`

Conversions between an enum and its backing scalar type require an explicit `as`
cast:

```zena
let lvl = Level.High;

// Convert an enum to its backing integer value:
let code = lvl as i32; // 1

// Cast an integer to an enum:
let restored = 1 as Level; // Level.High
```

The same casting syntax applies to string-backed enums:

```zena
enum Mode {
  Fast = 'fast',
  Safe = 'safe',
}

let m = Mode.Fast;
let rawString = m as String; // 'fast'
let fromString = 'safe' as Mode; // Mode.Safe
```

Casting an enum to its backing type extracts the underlying scalar. Casting a scalar
value to an enum reinterprets the scalar as an instance of the enum type.

## Pattern matching

Enum values can be inspected using `match` expressions:

```zena
let label = (c: Color): String => match (c) {
  case Color.Red: 'Red'
  case Color.Green: 'Green'
  case Color.Blue: 'Blue'
};
```

### Exhaustiveness checking

`match` expressions over enum types are checked for exhaustiveness. All declared
members must be handled. If any member is omitted without a wildcard default, the
compiler reports an error:

```zena
let label = (c: Color): String => match (c) {
  //                              ^^^^^^^^^^^ error: Non-exhaustive match. Not all cases are covered.
  case Color.Red: 'Red'
  case Color.Green: 'Green'
  // Missing case Color.Blue
};
```

To handle a subset of members and catch all remaining values, use a wildcard arm:

```zena
let isWarm = (c: Color): boolean => match (c) {
  case Color.Red: true
  case _: false
};
```

## Enums versus sealed classes

Enums in Zena represent fixed sets of discrete scalar values. They cannot declare
instance fields, methods, or constructors, and individual members cannot carry
associated data payloads.

When modeling sum types, algebraic data types (ADTs), or variants where each case
carries distinct fields and methods, use [sealed classes and case classes](/reference/classes/sealed/)
instead of enums:

```zena
sealed class Shape {
  case Circle(radius: f64)
  case Rectangle(width: f64, height: f64)
  case Point
}

let area = (s: Shape): f64 => match (s) {
  case Circle {radius}: 3.14159265 * radius * radius
  case Rectangle {width, height}: width * height
  case Point: 0.0
};
```

Choose between enums and sealed classes based on data requirements:

- **Use an enum** when representing discrete flags, state codes, command names,
  or options that map to simple integer or string scalars.
- **Use a sealed class** when variants require payloads, custom fields, methods,
  or type-level distinction beyond scalar constants.
