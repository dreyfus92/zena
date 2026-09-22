---
title: 'Extension Classes'
description: 'Compile-time extension classes, static method resolution, primitive wrapping, and runtime erasure in Zena.'
---

Extension classes add methods, accessors, and constructors to existing types without
altering their definitions or creating wrapper objects at runtime. They are completely
erased during compilation, providing zero-cost domain abstractions over existing classes,
interfaces, primitives, and WebAssembly GC arrays.

## Declaring an extension

An extension class is declared using the `extension class` keywords followed by an `on`
clause specifying the target type:

```zena
class Point {
  x: i32;
  y: i32;
  new(this.x, this.y);
}

extension class PointExt on Point {
  sum(): i32 {
    return this.x + this.y;
  }

  diagonal: f64 {
    get {
      let dx = this.x as f64;
      let dy = this.y as f64;
      return sqrt(dx * dx + dy * dy);
    }
  }
}
```

### Runtime erasure

Extension classes are **completely erased** during compilation. An instance of an extension
class is the underlying value itself:

- **No wrapper allocation**: No intermediate object or struct is created on the heap.
- **No vtable overhead**: Extension classes have no vtables or virtual dispatch slots.
- **Direct representation**: Passing an extension class value passes the underlying
  value directly in a WebAssembly register or reference.

In method bodies, `this` refers directly to the underlying value. In `PointExt`, `this.x`
accesses `Point.x` directly.

### Extension constructors

An extension class can declare constructors to build values of the extended type. An
extension constructor:

1. Takes only its declared parameters (no receiver exists before construction).
2. Must call `super(...)` with exactly one argument: the underlying value, which must be
   assignable to the `on` type.
3. Can include a constructor body that runs after `super` with `this` bound to the
   resulting value.

```zena
extension class Diag on Point {
  new(n: i32) : super(new Point(n, n));

  sum(): i32 {
    return this.x + this.y;
  }
}

let d = new Diag(21);
let total = d.sum(); // 42
```

Because extension classes are erased, `new Diag(...)` compiles to an ordinary function
call that evaluates the `super` argument and returns the underlying `Point` reference.

Rules for extension constructors:

- **The `super` call is required**: Without it, the constructor has no underlying value
  to return.
- **Exactly one argument**: The `super` argument supplies the underlying instance.
- **No field-initializing parameters**: Parameters like `this.x` are not permitted
  because extension classes cannot declare instance fields.

### Returning `this`

Methods in an extension class can declare their return type as `this` to preserve the
extension type through method chains:

```zena
extension class Path on String {
  new(value: String) : super(value);

  normalized(): this {
    // In an extension method body, this is already the underlying value.
    return this;
  }
}
```

### Extending other extension classes

An extension class can extend another extension class over the same underlying type:

```zena
extension class Path on String {
  new(value: String) : super(value);

  filename(): String {
    let s = this as String;
    // Extract filename
    return s;
  }
}

extension class FilePath extends Path {
  new(value: String) : super(value);

  extension(): String {
    let s = this as String;
    // Extract extension
    return '.zena';
  }
}
```

In this hierarchy:

- `FilePath` is a subtype of `Path` at compile time. A function accepting `Path` accepts
  a `FilePath`.
- Both classes erase to `String` at runtime, so the hierarchy incurs zero allocation,
  zero indirection, and zero vtable overhead.
- An extension class cannot extend a standard class, and a standard class cannot extend
  an extension class.

## Resolution rules

Methods declared on an extension class use **static dispatch** rather than virtual dispatch.

### Static call binding

When you call an extension method, the compiler resolves the target function at compile
time based on the **static type** of the receiver expression:

```zena
let p = new Point(10, 20);
let ext = p as PointExt;

ext.sum(); // Compiles directly to: PointExt$sum(ext)
```

At the WebAssembly bytecode level, this emits a direct `call $PointExt$sum` instruction,
passing the receiver as the first parameter. There is no runtime method lookup or vtable
indexing.

### Shadowing vs virtual overriding

Because dispatch is static, overriding a method in an extension subclass **shadows** the
parent method rather than participating in dynamic virtual dispatch:

```zena
extension class BaseExt on String {
  new(value: String) : super(value);
  describe(): String { return 'base'; }
}

extension class SubExt extends BaseExt {
  new(value: String) : super(value);
  describe(): String { return 'sub'; }
}

let callBase = (b: BaseExt): String => b.describe();
let callSub = (s: SubExt): String => s.describe();

let item = new SubExt('hello');

item.describe();     // 'sub'  (static type SubExt)
callBase(item);      // 'base' (static type BaseExt)
callSub(item);       // 'sub'  (static type SubExt)
```

Because both types erase to `String` at runtime, the runtime value does not record which
extension class created it. The method executed is determined entirely by the static type
of the variable through which it is called.

### Viewing values through casting

You can convert any instance of the underlying type to an extension class using a type
cast (`as`):

```zena
let p = new Point(3, 4);
let ext = p as PointExt; // Zero-cost compile-time view

let d = ext.diagonal;   // 5.0
```

Because extension classes are erased, the `as` cast emits no WebAssembly instructions.
It changes only the compiler's static type view of the value.

### Scope and imports

Extension methods are available whenever the extension class is in lexical scope. If an
extension class is declared in another library, you must import it:

```zena
import {PointExt} from './geometry';

let p = new Point(1, 2);
let ext = p as PointExt;
```

## Extending primitives

Extension classes can extend primitive scalar types (`i32`, `f64`, `boolean`, `String`,
`v128`) and WebAssembly GC array types (`array<T>`, `array<var T>`).

### Zero-cost units of measure

Extension classes provide strong typing for distinct domain quantities without runtime
boxing:

```zena
final extension class Meters on f64 {
  new(value: f64) : super(value);

  operator +(other: Meters): Meters {
    let a = this as f64;
    let b = other as f64;
    return new Meters(a + b);
  }
}

final extension class Seconds on f64 {
  new(value: f64) : super(value);
}

let m1 = new Meters(100.0);
let m2 = new Meters(50.0);
let total = m1 + m2; // Meters(150.0)

let s = new Seconds(10.0);
// let bad = m1 + s; // Compile error: Type mismatch (Meters vs Seconds)
```

At runtime, `Meters` and `Seconds` are raw, unboxed `f64` scalar values in WebAssembly
registers. They incur zero object allocations, zero garbage collection pressure, and zero
arithmetic overhead, while providing complete compile-time type safety.

### WebAssembly GC arrays

The Zena standard library uses extension classes to provide convenient, object-like APIs
over WebAssembly GC's built-in array types:

- **`FixedArray<T>`**: An extension class over `array<var T>` (mutable element array).
- **`ImmutableArray<T>`**: An extension class over `array<T>` (immutable element array).

```zena
extension class ArrayOps<T> on array<T> {
  last(): T {
    let s = this as array<T>;
    return s[s.length - 1];
  }
}
```

This allows treating raw WebAssembly GC arrays as full-featured collections with indexing,
slicing, and iteration methods without wrapping them in an extra class struct.

### SIMD vector extensions

SIMD 128-bit vector types (`v128`) can be extended with domain-specific vector math
operations (such as 4-lane floats or 16-lane bytes) that compile directly to native WebAssembly
SIMD instructions.

## Limitations

Because extension classes are erased at compile time, they have several intentional
architectural limitations.

### No instance fields

An extension class cannot declare instance fields:

```zena
extension class ExtraData on Point {
  var count: i32 = 0; // Compile error: Extension classes cannot declare instance fields
}
```

Extension classes have no underlying struct of their own on the heap; they can only read
and write fields that exist on the underlying type being extended.

### No inheritance with normal classes

The inheritance boundary between extension classes and normal classes is strict:

- An extension class **cannot extend an ordinary class**:
  ```zena
  class StandardClass {}
  extension class Ext on Point extends StandardClass {} // Compile error
  ```
- An ordinary class **cannot extend an extension class**:
  ```zena
  class NormalSubclass extends PointExt {} // Compile error
  ```

Because extension classes are erased, there is no heap-allocated class structure for a
normal subclass to inherit.

### Runtime indistinguishability

Two extension classes declared over the same underlying type are identical at runtime:

```zena
extension class UserId on String {
  new(value: String) : super(value);
}

extension class OrderId on String {
  new(value: String) : super(value);
}
```

At runtime, both `UserId` and `OrderId` are simply `String` values. This leads to the
following constraints:

#### Ambiguous unions are rejected

You cannot create a union between extension classes on the same underlying type:

```zena
type Identifier = UserId | OrderId; // Compile error: Ambiguous union of erased types
```

Because both types erase to `String`, the runtime cannot determine which branch of the union
a value belongs to when narrowing.

#### Pattern matching restrictions

You cannot match against multiple extension classes on the same underlying type in a single
`match` expression:

```zena
let check = (val: String): String => match (val) {
  case let UserId {}: 'user'
  case let OrderId {}: 'order' // Compile error: Indistinguishable pattern
};
```

#### Runtime type tests (`is`)

Evaluating `value is UserId` tests whether `value` is an instance of the underlying `on`
type (`String`). It does not verify that the value was constructed via `UserId`.

### No virtual dispatch

Extension methods cannot be dispatched virtually. If you require dynamic runtime polymorphism
where different instances invoke different implementations based on their runtime identity,
use standard classes with inheritance or interfaces.
