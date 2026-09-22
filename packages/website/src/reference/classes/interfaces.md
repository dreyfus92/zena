---
title: 'Interfaces'
description: 'Declaring interfaces, multiple interface conformance with implements, interface inheritance, factory constructors, and runtime fat reference representation in Zena.'
---

Interfaces define abstract contracts of methods, accessors, and operators that
classes can implement. Unlike class inheritance, which is strictly single-parent,
a class in Zena can implement any number of interfaces.

## Declaring an interface

An interface is declared using the `interface` keyword and contains member
signatures without implementation bodies:

```zena
interface Printable {
  print(): void;
}

interface Sizable {
  size: i32 { get; }
  isEmpty(): boolean;
}
```

### Member signatures

Interfaces can declare:

- **Methods**: Declared with parameter lists and return types, terminated by a
  semicolon:
  ```zena
  interface Task {
    execute(context: Context): boolean;
    cancel(): void;
  }
  ```
- **Accessors (properties)**: Declared using field or accessor block syntax:
  - _Read-only property_: `name: Type;` or `name: Type { get; }`
  - _Read-write property_: `var name: Type;` or `name: Type { get; set; }`
  - _Write-only property_: `name: Type { set; }`
- **Operators**: Declared with the `operator` keyword followed by the symbol:
  ```zena
  interface Indexable<T> {
    operator [](index: i32): T;
    operator []=(index: i32, value: T): void;
  }
  ```

### Generic interfaces

Interfaces can declare type parameters, which are instantiated when implemented or
referenced:

```zena
interface Stack<T> {
  push(item: T): void;
  pop(): T | null;
  length: i32 { get; }
}
```

### Signature variance rules

When a class or derived interface implements an interface method, Zena enforces
sound subtyping variance:

1. **Return types (covariant)**: An implementation can declare a more specific return
   type than the interface signature.
2. **Parameter types (contravariant)**: An implementation can accept a more general
   parameter type than the interface signature.
3. **Mutable properties (invariant)**: Read-write properties must match the declared
   type exactly.

```zena
interface Producer<T> {
  produce(): T;
}

class AnimalProducer implements Producer<Animal> {
  // Returns Dog, which is a subtype of Animal (covariant refinement)
  produce(): Dog {
    return new Dog('Buddy');
  }
}
```

## implements

A class declares that it conforms to one or more interfaces using the `implements`
clause:

```zena
class Document implements Printable, Sizable {
  var #text: String;

  new(this.#text);

  print(): void {
    console.log(this.#text);
  }

  size: i32 {
    get { return this.#text.length; }
  }

  isEmpty(): boolean {
    return this.size == 0;
  }
}
```

A class can extend a single superclass and implement multiple interfaces at the same
time:

```zena
class WorkItem extends BaseItem implements Printable, Runnable {
  // ...
}
```

### Conformance checking

The compiler validates that an implementing class provides concrete implementations
for every signature declared by its interfaces:

- **Missing members**: Omitting a required method or accessor causes a compile-time
  conformance error.
- **Accessors satisfied by fields**: A class field can satisfy an interface accessor
  signature directly:
  - An immutable field (`let x: i32` or bare `x: i32`) satisfies a read-only
    signature `x: i32 { get; }`.
  - A mutable field (`var x: i32`) satisfies a read-write signature
    `var x: i32;` or `x: i32 { get; set; }`.

```zena
interface Coordinate {
  x: f64 { get; }
  y: f64 { get; }
}

class Point implements Coordinate {
  x: f64; // Plain immutable fields satisfy read-only Coordinate accessors
  y: f64;

  new(this.x, this.y);
}
```

### Downcasting and runtime type tests

An interface reference can be tested or downcast back to a concrete class using `is`
and `as`:

```zena
let process = (p: Printable): void => {
  if (p is Document) {
    let doc = p as Document; // Unwraps the concrete instance
    console.log('Document length: ' + doc.size.toString());
  }
};
```

Under WebAssembly GC, the runtime unwraps the object instance stored inside the
interface fat reference and executes a native `ref.test` or `ref.cast` against the
target class type.

## Interface inheritance

An interface can inherit from one or more base interfaces using the `extends` keyword:

```zena
interface Readable {
  read(buffer: Array<u8>): i32;
}

interface Writable {
  write(buffer: Array<u8>): i32;
}

// Multiple interface inheritance
interface ReadWriteStream extends Readable, Writable {
  flush(): void;
}
```

- **Member accumulation**: `ReadWriteStream` inherits all signatures from both
  `Readable` and `Writable` alongside its own members (`flush()`).
- **Subtype substitution**: Any class that implements `ReadWriteStream` automatically
  satisfies `Readable` and `Writable`, and can be passed to functions expecting either
  parent interface.

## Default members

Interfaces in Zena focus on pure type contracts, but they provide convenience features
for instantiation and reusable behavior.

### Interface factory constructors

An interface can declare constructors using `new(...)` or named constructors
(`new name(...)`). Unlike class constructors, interface constructors act as
**factory functions**:

- Their bodies must return an instance of a class that implements the interface.
- They have no `this`, no initializer list, and no `super()` calls.
- Callers invoke them using standard `new Interface(...)` syntax.

```zena
interface Stack<T> {
  new() {
    return new ListStack<T>();
  }

  new withFirst(first: T) {
    let s = new ListStack<T>();
    s.push(first);
    return s;
  }

  push(value: T): void;
  pop(): T | null;
}

let s1 = new Stack<i32>();        // Stack<i32> backed by ListStack
let s2 = new Stack.withFirst(42); // Stack<i32>
```

#### Restating type parameters with tighter bounds

An interface may be unconstrained while its factory constructor requires bounds. A
constructor can restate the interface's type parameters with additional constraints:

```zena
interface Map<K, V> {
  new<K extends Hashable, V>(capacity: i32 = 16) {
    return new HashMap<K, V>(capacity);
  }

  get(key: K): V | null;
  set(key: K, value: V): void;
}

let m = new Map<String, i32>(); // OK: String implements Hashable
```

#### Narrower declared return types

An interface constructor can declare a return type narrower than the interface
itself:

```zena
interface ReadOnlyBuffer {
  new(): MutableBuffer {
    return new MutableBuffer();
  }

  length: i32 { get; }
}
```

The caller gets the full API of `MutableBuffer`, while the interface remains the
abstract contract.

Implementing classes owe nothing to interface constructors; they are purely a
convenience of the interface.

### Default method implementations via mixins

While interfaces cannot provide instance method bodies directly, shared default
implementations are expressed using **Mixins**:

```zena
interface Enumerable<T> {
  forEach(fn: (item: T) => void): void;
}

mixin EnumerableMixin<T> on Enumerable<T> {
  count(): i32 {
    var total = 0;
    this.forEach((_) => { total += 1; });
    return total;
  }
}

class MyList<T> with EnumerableMixin<T> implements Enumerable<T> {
  forEach(fn: (item: T) => void): void {
    // ...
  }
}
```

The mixin requires `on Enumerable<T>`, allowing its default methods to call interface
members on `this`. Classes then gain the implementation simply by using `with`.

## Representation

Understanding how interfaces are represented in WebAssembly GC explains their
performance characteristics.

### Why linear struct subtyping cannot represent interfaces

WebAssembly GC provides nominal struct subtyping through `(sub $Base ...)`. However:

- Struct subtyping is **single-inheritance only**: a struct can declare at most one
  parent struct type.
- A class can implement multiple unrelated interfaces (e.g. `Printable`, `Sizable`,
  and `Serializable`).
- The field and method table offsets of multiple interfaces cannot be laid out in a
  single linear prefix without conflicts across unrelated classes.

Because of this, an interface cannot simply be a WebAssembly GC supertype of the
classes that implement it.

### Fat references

To represent an interface value uniformly at runtime, Zena uses **fat references**
(interface objects). A fat reference is a two-field WebAssembly struct containing:

1. **Instance pointer (`$instance`)**: An erased reference (`anyref` / `eqref`) to the
   actual heap object.
2. **Interface table pointer (`$vtable`)**: A reference to an **Interface Table
   (itable)** specific to that class's implementation of that interface.

```wat
;; Generated WebAssembly struct for an interface fat reference
(type $Printable (struct
  (field $instance (ref null any))        ;; Concrete object
  (field $vtable (ref $Printable_ITable)) ;; Interface dispatch table
))
```

#### Itables and trampolines

Each concrete class that implements an interface receives a singleton itable populated
with function references. Because the interface itable expects an erased `any`
receiver while the class method expects its specific struct type `(ref $MyClass)`, the
compiler generates **trampoline functions**:

1. The trampoline receives the erased `$instance` as `any`.
2. It casts the reference back to the concrete class (`ref.cast $MyClass`).
3. It calls the real method on the class.

### Performance implications

The fat reference model produces concrete performance trade-offs:

- **Allocation overhead**: Assigning a class instance to an interface variable
  (`let p: Printable = doc`) allocates a fat reference wrapper struct `(instance, itable)`.
- **Extra indirection**: Calling an interface method requires loading the itable from
  the fat reference, loading the function pointer from the itable, loading the
  instance, and executing `call_ref`. This is one level of indirection more than a
  class virtual method call.
- **Class references are cheaper**: Class references use native WebAssembly GC struct
  subtyping directly—they require no wrapper allocations, no trampolines, and zero
  pointer adjustments. Whenever possible, pass concrete class types rather than
  interface types in performance-critical code.
- **Whole-program devirtualization**: When the compiler's whole-program analysis
  proves that only a single concrete class ever flows into an interface-typed call
  site, it devirtualizes the call into a direct class function call, bypassing the
  fat reference and itable entirely.
