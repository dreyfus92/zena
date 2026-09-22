---
title: 'Mixins'
description: 'Abstract subclasses, subclass factories, mixin applications, on constraints, with clauses, and linearization in Zena.'
---

Mixins allow classes to share code and state across different class hierarchies without
requiring a common base class. While standard class inheritance in Zena is strictly
single-parent, mixins let you compose reusable units of behavior and fields into
multiple classes without the ambiguities or diamond problems of multiple inheritance.

The foundational definition of mixins comes from Gilad Bracha and William Cook:

> "A mixin is an abstract subclass; i.e. a subclass definition that may be applied to
> different superclasses to create a related family of modified classes."
>
> — _Mixin-based Inheritance_ (OOPSLA '90)

In this model:

- A **mixin definition** is an abstract subclass or _subclass factory_. Unlike a normal
  class, which has a fixed superclass determined at declaration time, a mixin definition
  is parameterized over whatever superclass it is later applied to.
- A **mixin application** is the concrete intermediate subclass created when a mixin
  definition is applied to a specific superclass.
- Ordinary subclassing is simply a degenerate form of mixin application where the
  superclass is fixed upfront.

## Declaring a mixin

Mixins are declared using the `mixin` keyword. Their bodies look similar to class
bodies:

```zena
mixin Timestamped {
  timestamp: i64 = now();

  touch(): void {
    this.timestamp = now();
  }
}
```

### What mixins can declare

Mixins can define:

- **Methods**: Both public and private (`#`) methods with full implementation bodies.
- **Fields**: Fields with default initializer expressions:
  ```zena
  mixin Identifiable {
    var id: String = '';
  }
  ```
- **Accessors**: Grouped getter and setter blocks (`name: Type { get { ... } set(v) { ... } }`).
- **Operators**: Operator overloads like `operator ==` or `operator +`.

### What mixins cannot declare

Because a mixin is an abstract subclass rather than a standalone concrete class:

1. **No constructors**: Mixins cannot declare constructors (`new(...)`). They do not
   allocate objects independently; their fields are initialized during the enclosing
   class's initialization phase.
2. **No direct instantiation**: You cannot instantiate a mixin directly (`new Timestamped()`
   is a compile-time error). A mixin must always be applied to a class.

### Generic mixins

Mixins can declare type parameters, which are bound when the mixin is applied:

```zena
mixin Cache<K, V> {
  var #store: Map<K, V> = new Map<K, V>();

  getOrCompute(key: K, compute: (k: K) => V): V {
    if (let Some {value} = this.#store.get(key)) {
      return value;
    }
    let value = compute(key);
    this.#store.set(key, value);
    return value;
  }
}
```

### Composing mixins

A mixin can apply other mixins using the `with` clause:

```zena
mixin Audited {
  logAudit(event: String): void {
    console.log('[AUDIT] ' + event);
  }
}

// Composed mixin combines Timestamped and Audited
mixin Tracked with Timestamped, Audited {
  recordChange(event: String): void {
    this.touch();
    this.logAudit(event);
  }
}
```

## on constraints

By default, a mixin assumes only the capabilities of `Object`. However, a mixin often
needs to call methods or access fields that it expects its superclass to provide. Zena
enables this through the `on` clause:

```zena
class Entity {
  id: i32;

  new(this.id);

  save(): void {
    console.log('Saving entity ' + this.id.toString());
  }
}

mixin Syncable on Entity {
  sync(): void {
    this.save(); // OK: guaranteed by 'on Entity'
    console.log('Synchronized ' + this.id.toString());
  }
}
```

### Calling super in mixins

The `on` constraint establishes the static type of `super` within the mixin body.
This allows mixins to override superclass methods while chaining to the superclass
implementation:

```zena
class Service {
  execute(): void {
    console.log('Executing base service');
  }
}

mixin LoggingService on Service {
  execute(): void {
    console.log('Before execution');
    super.execute(); // Calls Service.execute()
    console.log('After execution');
  }
}
```

### Constraint satisfaction

When a class applies a mixin, the compiler verifies that the class satisfies the
mixin's `on` constraint. A target class satisfies `on T` if `T` is assignable to:

1. The class's **superclass** (or super-mixin application).
2. An **interface** listed in the class's `implements` clause.

### Implementing an interface via a mixin

A frequent design pattern in Zena pairs an abstract interface with a companion mixin
that provides default method implementations:

```zena
interface Collection<T> {
  forEach(fn: (item: T) => void): void;
  count: i32 { get; }
  contains(item: T): boolean;
}

mixin CollectionDefaults<T> on Collection<T> {
  count: i32 {
    get {
      var tally = 0;
      this.forEach((_) => { tally += 1; });
      return tally;
    }
  }

  contains(target: T): boolean {
    var found = false;
    this.forEach((item) => {
      if (item == target) {
        found = true;
      }
    });
    return found;
  }
}
```

A concrete class declares that it implements the interface and mixes in the defaults:

```zena
class CustomList<T> with CollectionDefaults<T> implements Collection<T> {
  // Only needs to implement forEach; count and contains are supplied by the mixin
  forEach(fn: (item: T) => void): void {
    // ...
  }
}
```

1. The class declares `implements Collection<T>`, satisfying the mixin's `on Collection<T>`
   constraint.
2. The mixin is applied, injecting the implementations of `count` and `contains`.
3. The compiler validates that `CustomList<T>` satisfies all members of `Collection<T>`,
   which succeeds because of the injected mixin methods.

## with clauses

Mixins are applied to classes using the `with` keyword:

```zena
class User {
  name: String;
  new(this.name);
}

class RegisteredUser extends User with Timestamped, Identifiable {
  email: String;

  new(name: String, this.email)
    : super(name);
}
```

### Declaration order

When combining inheritance, mixins, and interfaces, clauses must appear in this order:

```zena
class MyClass extends SuperClass with Mixin1, Mixin2 implements Interface1, Interface2 {
  // class body
}
```

If a class does not extend an explicit base class, `extends` may be omitted:

```zena
class Document with Timestamped {
  content: String;
  new(this.content);
}
```

### Constructors and field initialization

Although mixins do not have constructors of their own, mixin fields must be initialized
when an instance of the applying class is constructed:

- Mixin fields with default initializers are initialized during the object creation
  phase.
- In derived classes, constructor initializer lists can assign directly to public or
  accessible mixin fields.
- Calling `super(...)` in the class constructor chains up through the mixin application
  hierarchy to the base class constructor.

## Linearization

When a class applies multiple mixins, Zena uses **linearization** to order them into a
single, unambiguous inheritance chain.

### The mixin application chain

Given:

```zena
class Base {
  step(): i32 { return 1; }
}

mixin M1 on Base {
  step(): i32 { return super.step() + 10; }
}

mixin M2 on Base {
  step(): i32 { return super.step() + 100; }
}

class Derived extends Base with M1, M2 {
  step(): i32 { return super.step() + 1000; }
}
```

The compiler linearizes the declaration into a single-inheritance hierarchy of
intermediate **mixin application** classes:

```
Base  <--  (Base + M1)  <--  (Base + M1 + M2)  <--  Derived
```

Each mixin application is a distinct, synthesized class in the inheritance chain:

1. `Base + M1` extends `Base` and adds the members of `M1`.
2. `Base + M1 + M2` extends `Base + M1` and adds the members of `M2`.
3. `Derived` extends `Base + M1 + M2`.

### Member override order

Because of this linear chain, members are resolved from right to left in the `with`
list:

- **`Derived`** has the highest precedence. Any member declared in `Derived` overrides
  identically named members in the mixins and base class.
- **`M2`** (the last mixin in the `with` clause) overrides matching members in `M1` and
  `Base`.
- **`M1`** overrides matching members in `Base`.
- **`Base`** provides the foundation.

When invoking `super.step()`:

- In `Derived`, `super.step()` dispatches to `M2.step()`.
- In `M2`, `super.step()` dispatches to `M1.step()`.
- In `M1`, `super.step()` dispatches to `Base.step()`.

```zena
let d = new Derived();
let result = d.step(); // 1 (Base) + 10 (M1) + 100 (M2) + 1000 (Derived) = 1111
```

### WebAssembly GC representation and monomorphization

In WebAssembly GC, struct fields require fixed, sequential offsets. Because the
offsets of a mixin's fields depend on the layout of the base class to which it is
applied:

- If `M1` is applied to a base class with 2 fields, its fields start at index 2.
- If `M1` is applied to a base class with 5 fields, its fields start at index 5.

To achieve optimal runtime performance and minimize binary size:

1. **Struct flattening**: While mixin applications exist conceptually in the inheritance
   chain, mixins themselves are not types and intermediate mixin applications are never
   instantiated or referenced as types in user code. The compiler removes these
   intermediate structs during reachability analysis, flattening the mixed-in fields
   directly into the concrete class struct. If `Derived extends Base with M1, M2`, the
   resulting WebAssembly struct extends `$Base` directly:

   ```wat
   ;; Base struct
   (type $Base (sub (struct (field $vtable ...) (field $baseField i32))))

   ;; Concrete derived struct flattens mixed-in fields directly onto Base
   (type $Derived (sub $Base (struct
     (field $vtable ...)
     (field $baseField i32)
     (field $m1Field i64)
     (field $m2Field f64)
     (field $derivedField String)
   )))
   ```

2. **Method monomorphization**: Rather than incurring the cost of dynamic property
   lookups or interface dispatch, Zena specializes (monomorphizes) mixin methods for each
   concrete class they are mixed into. Methods compiled for `Derived` receive `(param (ref $Derived))`
   and directly access the exact struct field offsets for that layout.

This architecture ensures that mixin methods compile to direct, un-indirected WebAssembly
instructions (`struct.get` and `call`) and can be inlined by the optimizer with zero
runtime abstraction penalty.
