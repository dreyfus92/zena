---
title: 'Classes'
description: 'Classes in Zena: taxonomy of class types, mixins, interfaces, memory representation, dispatch, and the performance model.'
---

Classes in Zena are nominal, object-oriented types targeting WebAssembly GC.
They provide single inheritance, interface implementation, mixin composition,
constructors with initializer lists, immutable fields by default, and pattern
matching.

This overview introduces the different class kinds in Zena and explains the
underlying execution and performance model.

## Kinds of classes and types

Zena provides several specialized declarations for structuring data and
behavior:

- **Standard classes (`class`)**: Nominal stateful types with single
  inheritance (`extends`), private and public fields, and methods. Instances
  compile directly to WebAssembly GC structs (see [Fields and Constructors](/reference/classes/fields/),
  [Inheritance](/reference/classes/inheritance/)).
- **Abstract classes (`abstract class`)**: Incomplete base classes that define
  method contracts and partial implementations. Abstract classes cannot be
  instantiated directly.
- **Final classes (`final class`)**: Leaf classes that cannot be extended. Marking
  a class `final` enables the compiler to devirtualize method calls into direct
  static calls.
- **Case classes (`class Name(...)`)**: Concise data containers with constructor
  parameters declared in parentheses. The compiler automatically generates value
  equality (`==`), `hashCode`, string representations, and destructuring
  patterns (see [Sealed and Case Classes](/reference/classes/sealed/)).
- **Sealed classes (`sealed class`)**: Closed class hierarchies where all
  subclasses or cases are known at compile time. Used to model algebraic data
  types (sum types) for exhaustive pattern matching.
- **Mixins (`mixin ... on ...`)**: Reusable suites of fields and methods that can
  be mixed into class hierarchies via `with` clauses. Mixins avoid multiple
  inheritance conflicts through linear composition (see [Mixins](/reference/classes/mixins/)).
- **Interfaces (`interface`)**: Nominal contracts that specify required methods
  and accessors without defining instance state. A class can implement multiple
  interfaces (`implements`), enabling polymorphism across unrelated hierarchies
  (see [Interfaces](/reference/classes/interfaces/)).
- **Extension classes (`extension class ... on ...`)**: Zero-overhead static
  extensions that add methods to existing types (including primitives and
  external library classes) without modifying their runtime representation (see
  [Extension Classes](/reference/classes/extensions/)).
- **Resource classes (`resource class`)**: Linear, owned types tracked by the
  ownership system (`Own<T>`, `Borrow<T>`) for non-GC host resources like files
  and network streams that require deterministic disposal via `using` (see
  [Ownership and Resources](/reference/ownership/)).

## Declaring and instantiating classes

A standard class defines fields, constructors, and methods:

```zena
class Point {
  x: f64; // Immutable by default
  y: f64;

  new(this.x, this.y);

  distanceTo(other: Point): f64 {
    let dx = this.x - other.x;
    let dy = this.y - other.y;
    return (dx * dx + dy * dy).sqrt();
  }
}
```

### Field mutability

Fields in Zena are immutable by default:

- **`field: Type`**: Immutable field. Initialized in the constructor and cannot
  be reassigned.
- **`var field: Type`**: Mutable field with public read and write access.
- **`var(#field) field: Type`**: Asymmetric visibility—public getter, but private
  setter accessible only within the class using `this.#field`.

### Instantiation and identity

Instances are created using the `new` operator:

```zena
let p1 = new Point(0.0, 0.0);
let p2 = new Point(0.0, 0.0);
```

For standard classes, equality (`==`) evaluates **reference identity**: two
references are equal only if they point to the exact same heap instance in
memory (`p1 == p2` is `false`).

Case classes override this behavior with **value equality**: two case class
instances are equal if their corresponding fields are equal (`p1 == p2` is
`true`).

## Instance structs and memory layout

Zena compiles language constructs to the most direct, least indirected
representation available in WebAssembly GC.

Polymorphism in WebAssembly GC presents unique challenges. While WebAssembly GC
provides managed `struct` and `array` types, it has no native concept of classes
or virtual methods, and supports only single-inheritance nominal subtyping.

To bridge this, Zena adopts the standard compiler representation:

- **State in structs**: Declared fields map sequentially to typed fields in a
  WebAssembly GC struct (`(type $Point (struct ...))`). Field access compiles to
  a single `struct.get` or `struct.set` instruction without dictionary lookups or
  pointer indirection.
- **Methods in vtables**: When a class hierarchy requires dynamic dispatch, the
  compiler groups function references into a virtual method table (vtable). An
  internal vtable reference is placed at field 0 of the struct.
- **Zero vtable overhead when devirtualized**: Classes that have no virtual
  methods (or whose methods are all devirtualized) contain **only their data
  fields**. No vtable pointer is emitted in the instance struct.

### Subclass polymorphism in WebAssembly GC

WebAssembly GC natively supports **single nominal subtyping** via the `(sub ...)`
declaration:

```wat
;; Animal base struct
(type $Animal (sub (struct (field (ref $AnimalVTable)) (field i32))))

;; Dog subtype struct extends Animal
(type $Dog (sub $Animal (struct (field (ref $DogVTable)) (field i32) (field f64))))
```

Because the WebAssembly engine understands this subtyping relationship directly,
subclass polymorphism and upcasts happen without wrapper allocations—a `ref $Dog`
is accepted wherever a `ref $Animal` is expected. Zena ensures that a Zena
subclass's struct is always a WebAssembly GC subtype of its superclasses'
structs.

## Interfaces and fat references

While WebAssembly GC subtyping handles single-inheritance class hierarchies, it
cannot express multiple inheritance or interface implementation. A WebAssembly
struct can have at most one supertype. Because a class in Zena can implement
multiple independent interfaces (such as `class User implements Serializable, Hashable`),
interfaces cannot be represented as Wasm struct subtypes.

To support multiple interface polymorphism, interfaces require their own vtable
per implementing class and an adapter known as a **fat reference** (often called
an _interface object_ or _fat pointer_ in other systems).

### Anatomy of a fat reference

A fat reference is a small, heap-allocated two-field adapter struct created when
an object is upcast to an interface type:

1. **`instance`**: An erased reference (`anyref`) pointing to the underlying
   object.
2. **`vtable`**: A reference to an interface-specific virtual method table
   containing function references for that specific class's implementation of the
   interface.

```
Interface Reference (Fat Reference)
┌─────────────────────────────────┐
│ instance: ref $Point            │ ────> [ Point Struct: x, y ]
├─────────────────────────────────┤
│ vtable:   ref $DrawableVTable   │ ────> [ draw() -> $Point_draw_thunk ]
└─────────────────────────────────┘
```

### Performance implications

Because of this representation, **class references are usually cheaper than
interface references**:

- **Calling through a class reference**: The compiler accesses the instance
  struct directly, issuing either a static direct call or an indexed vtable lookup
  leveraging native Wasm GC subtyping.
- **Calling through an interface reference**: The runtime must load the vtable
  from the fat reference, invoke the function reference via `call_ref`, and pass
  through a small trampoline function that casts `anyref` back to the concrete
  class struct.

In performance-critical code or tight loops, prefer concrete class types or
class hierarchies where single inheritance suffices. Use interfaces when
polymorphism across disparate, unrelated class hierarchies is required.

## Virtual vs direct dispatch

Zena uses two distinct calling conventions for methods:

### Direct calls

When the compiler can prove which method implementation will execute, it emits a
direct WebAssembly call (`call $function_name`):

- **Zero dispatch overhead**: The call jumps directly to the function without
  vtable lookups or indirect branches.
- **Inlining**: Direct calls are eligible for function inlining, enabling further
  optimizations across call boundaries.

### Virtual calls

When a method is declared in an open class and can be overridden by subclasses,
the compiler emits an indirect call through the instance's vtable (`call_ref`).

### Devirtualizing with final

You can assist the compiler by declaring classes or methods `final`:

```zena
final class FastCounter {
  increment(): void { ... }
}
```

Because a `final` class cannot be extended, the compiler knows that its methods
can never be overridden. All method invocations on a variable of type
`FastCounter` are automatically **devirtualized** into direct static calls.

Similarly, marking an individual method `final` in an unsealed class allows the
compiler to devirtualize calls to that specific method.

### Extension methods resolve statically

Extension classes define methods that extend an existing type:

```zena
extension class StringUtils on String {
  shout(): String {
    return this + '!';
  }
}
```

Extension methods are resolved **entirely statically at compile time** based on
the static type of the receiver expression. They do not participate in virtual
dispatch and involve no vtable overhead—an extension call compiles directly into
a static function call with `this` passed as the first argument.

## Devirtualization and monomorphization

Zena employs whole-program compiler optimizations to eliminate dynamic dispatch
and generic overhead:

### Whole-program polymorphic analysis

Because Zena compiles with closed-world, whole-program analysis, the compiler
tracks which concrete classes actually flow into polymorphic variables and call
sites.

- **Single-target devirtualization**: If only one concrete class implements a
  given interface or reaches a specific call site across the entire program, the
  compiler devirtualizes the call into a direct static call, bypassing the
  vtable and trampoline entirely.
- **Small-hierarchy branching**: For small, closed hierarchies with a few
  implementations, the compiler can replace an indirect vtable lookup with a
  fast type test (`ref.test` or `br_on_cast`) and direct calls.

### Monomorphization of generics

When generic classes or methods are used, the compiler analyzes the concrete
type arguments that flow to each type parameter:

```zena
class Box<T>(value: T)

let intBox = new Box(42);
let floatBox = new Box(3.14);
let stringBox = new Box('hello');
```

Zena currently uses **full monomorphization**: the compiler generates a distinct,
specialized copy of the class struct and its methods for every unique combination
of type arguments (such as `$Box_i32`, `$Box_f64`, and `$Box_String`).

#### Performance implications

Monomorphization generates the fastest possible code for each type argument:

- **Unboxed scalars**: Primitive types (`i32`, `f64`, `boolean`) remain unboxed
  in native WebAssembly GC struct fields and array elements, avoiding heap
  allocations and pointer boxing.
- **Direct operations**: Field offsets and method signatures are known
  statically at compile time.
- **Optimization opportunities**: Each specialized copy passes through Zena's
  optimization loop. The optimizer can perform type-specific constant folding,
  inlining, and dead-branch elimination tailored to that exact instantiation.

However, monomorphization trades binary size for execution speed. Specializing
a generic class or function for each type produces a separate copy of the code.
Even though portions of these copies are often optimized further, inlined, or
folded away by subsequent passes, the underlying structs and functions still
increase compiled WebAssembly module size.

#### Future hybrid monomorphization

To control binary size while preserving unboxed performance, Zena is considering
an optional **hybrid monomorphization** mode:

- **Specialized scalars, shared references**: Primitives (`i32`, `f64`) receive
  fully specialized struct and method copies, while reference types (`String`,
  classes) share a single generalized WebAssembly implementation using internal
  type tags for runtime type tests (`is`).
- **Selective specialization**: Creating specialized copies only where
  type-specific fields or methods are accessed, while sharing common routines
  that merely pass generic references through without inspecting them.
