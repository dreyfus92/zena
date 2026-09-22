---
title: 'Inheritance'
description: 'Single inheritance with extends, member overriding, abstract and final modifiers, method resolution, and virtual dispatch in Zena.'
---

Zena supports single inheritance for class hierarchies. Derived classes inherit state
and behavior from a base class, can override virtual members, and can define abstract
contracts or seal extension points with `final`.

## extends

A class derives from a base class using the `extends` clause:

```zena
class Animal {
  name: String;

  new(this.name);

  speak(): String {
    return '...';
  }
}

class Dog extends Animal {
  breed: String;

  new(name: String, this.breed)
    : super(name);

  speak(): String {
    return 'Woof!';
  }
}
```

Zena enforces **single inheritance**: a class can extend at most one superclass.
This constraint maps directly to WebAssembly GC's nominal struct subtyping model,
which permits only a single parent struct in `(sub $Base ...)`. To achieve multiple
subtyping or share behavior across unrelated class hierarchies, Zena provides
[Interfaces](/reference/classes/interfaces/) (which use fat references rather than
linear struct subtyping) and [Mixins](/reference/classes/mixins/).

### WebAssembly GC layout compatibility

Inheritance in Zena maps directly to WebAssembly GC struct subtyping:

1. **Prefix layout**: The fields of the base class appear first in the subclass's
   underlying struct in identical order and type. Subclass fields are appended
   afterward.
2. **Native subtyping**: The WebAssembly module declares the subclass struct with
   `(sub $Animal (struct ...))`.

Because the field offsets are identical, an instance of `Dog` can be passed anywhere
an `Animal` reference is expected without wrapper allocations or pointer adjustments.
Upcasts are allocation-free, and field accesses on base references compile to the
exact same struct offsets regardless of which derived class is executing.

### Constructor sequencing and single-shot construction

Constructors in derived classes must invoke the base class constructor using
`super(...)` or `super.named(...)` in their initializer list:

```zena
class Dog extends Animal {
  breed: String;

  new(name: String, this.breed)
    : super(name);
}
```

- **Last entry requirement**: `super(...)` must appear as the **last entry** in the
  subclass's initializer list.

#### The single-shot hierarchy execution order

Zena organizes constructor execution across an inheritance hierarchy into distinct
phases:

1. **Initializer lists evaluate bottom-up**: When `new Derived(...)` is called, the
   subclass's initializer list evaluates first. It initializes subclass fields and
   computes the arguments passed to `super(...)`. This triggers evaluation of the
   superclass's initializer list.
2. **Allocation happens once**: Once all field expressions across the entire
   hierarchy have been computed, the WebAssembly GC struct is allocated in a single
   `struct.new` operation with every field (both superclass and subclass) populated.
   The concrete derived class's vtable is attached to the instance immediately.
3. **Constructor bodies execute top-down**: Constructor bodies run in top-down
   order: the superclass constructor body executes first, followed by the subclass
   constructor body.

#### Safe virtual calls during construction

Because allocation occurs only after _all_ fields across the hierarchy are
initialized, Zena eliminates a classic source of object-oriented bugs:

- If a base class constructor calls a virtual method that the subclass overrides,
  the call dispatches to the subclass override through the installed vtable.
- The subclass method can safely access its own subclass fields because those fields
  are already initialized. In languages like Java, subclass fields remain `null` or
  uninitialized while the superclass constructor runs; in C++, virtual dispatch does
  not reach derived overrides during construction. In Zena, the instance is fully
  formed and coherent before any constructor body executes.

### What is inherited

When a subclass extends a base class:

- **Inherited**: Public and package-accessible fields, methods, accessors, and
  static members.
- **Not inherited**:
  - **Constructors**: Derived classes do not automatically inherit constructors from
    their superclass; they must declare their own constructors and chain to `super`.
  - **Private members (`#`)**: Private fields, methods, and accessors are lexically
    scoped to the declaring class body. A subclass cannot access a base class's
    private members, and declaring a `#name` member in a subclass never collides
    with or overrides a `#name` member in a superclass.

## Overriding

A derived class can replace the behavior of an inherited method or accessor by
declaring a member with the same name:

```zena
class Vehicle {
  maxSpeed(): f64 {
    return 100.0;
  }
}

class SportsCar extends Vehicle {
  maxSpeed(): f64 {
    return 250.0;
  }
}
```

Zena does not require an `override` keyword. If a subclass member matches an
inherited member's name and kind, it is treated as an override.

### Signature compatibility

An overriding method must conform to the signature established by the base class:

1. **Parameter types**: Must be compatible with the base class parameter types.
2. **Return type**: Can be a subtype of the base class return type (covariance).
3. **Receiver ownership**: If the base method declares an explicit receiver
   modifier (such as `this: Own<this>`), the overriding method must maintain the
   identical receiver capability. An override cannot change a consuming method into
   a borrowing method or vice-versa.

### Calling super implementations

Within an overriding method or accessor, use `super` to invoke the superclass
implementation:

```zena
class BaseLogger {
  log(message: String): void {
    console.log('[LOG] ' + message);
  }
}

class TimestampedLogger extends BaseLogger {
  log(message: String): void {
    let stamped = now().toString() + ' ' + message;
    super.log(stamped);
  }
}
```

Calls to `super.method(...)` are resolved statically and dispatched directly,
bypassing virtual table lookup.

### Overriding accessors and fields

In Zena, public fields and accessors share the same property namespace:

- A subclass can override an inherited field by declaring a grouped accessor with
  matching name and type:

```zena
class BaseConfig {
  var timeoutMs: i32 = 1000;
}

class DynamicConfig extends BaseConfig {
  timeoutMs: i32 {
    get {
      return this.#calculateDynamicTimeout();
    }
    set(v) {
      // Custom setter logic
    }
  }

  #calculateDynamicTimeout(): i32 {
    return 2000;
  }
}
```

- A subclass accessor can override an inherited accessor and use `super.prop` to
  read or write the superclass accessor value.

#### How virtual properties work under the hood

To make field and accessor overriding seamless across inheritance hierarchies:

1. **Virtual getter and setter slots**: Every public field in a class generates
   default getter and setter slots in the class vtable. When a subclass declares an
   accessor for that property, it replaces those vtable slots with its custom getter
   and setter functions. This ensures callers accessing the property through a base
   class reference invoke the subclass accessor logic.
2. **Bypassing the vtable for performance**: When a property is marked `final`, is a
   private `#` field, or when the compiler's whole-program analysis proves that a
   property is never overridden, the compiler eliminates the vtable getter/setter
   slots and emits direct WebAssembly `struct.get` and `struct.set` instructions.

### Overload sets in subclasses

When a base class declares an overloaded method (multiple signatures with the same
name):

- A subclass can override an individual signature in the overload set without
  affecting the other signatures.
- **Overlap restriction**: A subclass cannot introduce a _new_ overload signature
  that overlaps an inherited signature. If a method requires an additional overload
  variant, it must be declared in the base class to maintain deterministic static
  overload resolution across the hierarchy.

## abstract and final

Zena provides `abstract` and `final` modifiers to manage class inheritance and
member extensibility.

### abstract classes

An `abstract` class defines an incomplete contract that cannot be instantiated
directly:

```zena
abstract class Shape {
  abstract area(): f64;
  abstract color: String;

  describe(): String {
    return 'Shape of color ' + this.color + ' with area ' + this.area().toString();
  }
}
```

1. **No direct instantiation**: `new Shape()` produces a compile-time error.
2. **Abstract methods**: Declared with the `abstract` keyword and a signature
   terminated by a semicolon. They have no method body.
3. **Abstract fields**: Declared with `abstract name: Type;`. They declare that
   derived classes must provide storage or accessors for that property.
4. **Implementation requirement**: Any concrete (non-abstract) subclass extending
   an abstract class must implement all inherited abstract methods and fields:

```zena
class Circle extends Shape {
  color: String;
  radius: f64;

  new(this.color, this.radius);

  area(): f64 {
    return 3.141592653589793 * this.radius * this.radius;
  }
}
```

Abstract classes can extend other abstract classes without implementing all
inherited abstract members.

### final classes and members

The `final` modifier prevents further extension or overriding.

#### Final classes

Marking a class `final` prohibits other classes from extending it:

```zena
final class Point {
  x: f64;
  y: f64;
  new(this.x, this.y);
}

// Compile error: Cannot extend final class 'Point'
// class Point3D extends Point {}
```

Because a `final` class can never have derived subclasses, the compiler statically
devirtualizes all method calls and property accesses on instances known to be of that
type.

#### Final methods

Marking an individual method `final` prevents subclasses from overriding it:

```zena
class BankAccount {
  var balance: f64 = 0.0;

  final deposit(amount: f64): void {
    if (amount <= 0.0) {
      throw new Error('Invalid deposit');
    }
    this.balance += amount;
  }
}
```

Calls to `deposit` can always be dispatched directly rather than through a virtual
method table.

#### Final fields

Marking a field `final` prevents subclasses from overriding that property with an
accessor:

```zena
class Configuration {
  final endpoint: String;
  final var retries: i32;

  new(this.endpoint, this.retries);
}
```

- **`final` vs. mutability**: `final` controls **overridability**, whereas `let` and
  `var` control **mutability**.
  - `final endpoint: String`: Immutable (`let`) and non-overridable. Access compiles
    to an un-indirected struct read (`struct.get`).
  - `final var retries: i32`: Mutable field that can be reassigned on instances, but
    subclasses cannot replace it with custom virtual getters or setters.

## Method resolution

When a program invokes a method on a receiver expression (`receiver.method(...)`), the
compiler determines which declaration to bind using static analysis:

1. **Receiver type determination**: The compiler evaluates the static type `T` of
   the receiver expression.
2. **Member lookup**:
   - The compiler searches the member namespace of `T`.
   - If `method` is not found directly on `T`, the search continues up the
     superclass chain until a matching declaration is located or the root is
     reached.
   - If the superclass is generic (`class Sub extends Base<String>`), inherited
     type signatures are instantiated with the provided type arguments.
3. **Overload resolution**:
   - If the member is an overload set, the compiler filters candidates applicable to
     the call arguments.
   - The unique most-specific signature is selected at compile time.
4. **Binding target**:
   - For a direct or devirtualized call, the compiler records the exact function index.
   - For a virtual call, the compiler records the vtable slot index established by
     the initial declaration in the hierarchy.

### Namespace isolation

Zena maintains separate namespaces to prevent ambiguities:

- **Instance vs. static**: Instance members (`receiver.prop`) and static members
  (`Class.prop`) occupy separate namespaces. A class may define both an instance
  method and a static method with the same name without collision.
- **Private encapsulation**: Private members (`#name`) are resolved lexically based
  on the enclosing class body rather than the receiver's inheritance chain. Private
  access never enters the vtable and is always a direct reference.

## Virtual dispatch

When a method is called on a reference that could point to different runtime
subtypes, Zena uses virtual method dispatch:

```zena
let announce = (animal: Animal): void => {
  console.log(animal.speak()); // Virtual call: dispatches based on runtime instance
};

announce(new Animal('Creature')); // prints '...'
announce(new Dog('Spot', 'Beagle')); // prints 'Woof!'
```

### VTables in WebAssembly GC

To implement virtual dispatch efficiently in WebAssembly GC:

1. **VTable structs**: The compiler synthesizes a WebAssembly struct representing the
   virtual method table (vtable). Each field in the vtable struct holds a typed
   function reference (`(field (ref $MethodSig)))`.
2. **Singleton vtable instances**: Each concrete class generates a single constant
   vtable instance populated with function references to its specific method
   implementations (either its own overrides or inherited versions).
3. **Instance vtable reference**: Every class instance struct includes a hidden
   field pointing to its class's vtable singleton.
4. **Stable slot indices**: Subclasses preserve the vtable slot positions of their
   superclasses. If `speak()` is assigned slot `0` in `Animal_VTable`, it occupies
   slot `0` in `Dog_VTable`. New methods introduced in `Dog` receive subsequent
   slots (`1`, `2`, etc.).

### Execution of a virtual call

Calling `animal.speak()` translates to the following WebAssembly sequence:

1. Load the vtable reference from field `0` of the `animal` struct (`struct.get 0`).
2. Load the function reference from slot `0` of the vtable (`struct.get 0`).
3. Execute a WebAssembly `call_ref` instruction, passing `animal` as the leading
   `this` argument along with any call parameters.

### Compiler devirtualization

Virtual dispatch incurs an indirect jump (`call_ref`). The Zena optimizing compiler
analyzes call sites to eliminate this overhead whenever possible:

- **Exact instantiation**: When the compiler can prove the exact concrete type of an
  object (such as `let d = new Dog('Spot', 'Pug'); d.speak();`), it devirtualizes the
  call to a direct `call $Dog_speak`.
- **`final` annotations**: Methods and classes marked `final` can never be overridden,
  so calls to them are immediately devirtualized.
- **Whole-program analysis**: During whole-program compilation (closed world), the
  compiler analyzes points-to sets across the application. If a virtual call site is
  only ever invoked on instances of a single concrete class, the compiler rewrites the
  call site to a direct function call.
