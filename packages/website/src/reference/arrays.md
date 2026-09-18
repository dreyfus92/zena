---
title: 'Arrays'
description: 'FixedArray, ImmutableArray, GrowableArray, literals, slicing, and WebAssembly GC representations in Zena.'
---

Zena's array architecture is tailored to WebAssembly GC and built for both
low-level, high-performance use cases and high-level convenient and ergonomic
APIs.

To support this Zena has an `Array<T>` interface and operator overloading on the
`[]` operator to allow for multiple array implementations. The built-in arrays
include fixed-size mutable and immutable arrays that map directly to Wasm GC,
and familiar growable arrays.

## Array classes and interfaces

Zena provides three concrete array implementations and two common interfaces:

| Type                | Kind            | Mutability          | Description                                        |
| :------------------ | :-------------- | :------------------ | :------------------------------------------------- |
| `ImmutableArray<T>` | Extension class | Read-only elements  | Fixed-size array; default for array literals       |
| `FixedArray<T>`     | Extension class | Mutable elements    | Fixed-size array with in-place element mutation    |
| `GrowableArray<T>`  | Class           | Resizable           | Dynamic collection backed by a `FixedArray<T>`     |
| `Array<T>`          | Interface       | Read-only interface | Common read-only contract (`length`, `[]`, `map`)  |
| `MutableArray<T>`   | Interface       | Mutable interface   | Extends `Array<T>` with element assignment (`[]=`) |

`FixedArray<T>` and `ImmutableArray<T>` are **extension classes** over raw
WebAssembly GC arrays. They have no wrapper struct or vtable indirection: an
array reference points directly to an engine-managed GC array. See [Performance
and representation](#performance-and-representation) for low-level details.

## Array literals

An array literal consists of a comma-separated list of expressions enclosed in
brackets `[...]`:

```zena
let nums = [1, 2, 3]; // ImmutableArray<i32>
let words = ["alpha", "beta", "gamma"]; // ImmutableArray<String>
```

### Default type: `ImmutableArray<T>`

Array literals produce an `ImmutableArray<T>` by default. Their element type is
inferred from the types of the contained expressions:

```zena
let primes = [2, 3, 5, 7];
primes[0] = 1; // @error: Cannot assign to read-only indexer.
```

### Contextual typing

When an array literal appears in a position where a mutable array or a growable
collection is expected, the compiler automatically constructs the requested
container:

```zena
// Context expects FixedArray:
let mutableList: FixedArray<i32> = [10, 20, 30];
mutableList[0] = 99; // Permitted

// Context expects GrowableArray:
let items: GrowableArray<String> = ["hello", "world"];
items.push("zena"); // Permitted
```

### Construction helpers: `fixed()` and `growable()`

When constructing arrays in expression position—such as passing arguments to
functions or initializing unannotated `let` variables—the standard library
provides two zero-cost helpers in `zena:core`:

```zena
import { fixed, growable } from 'zena:core';

// Produces FixedArray<i32> without requiring an explicit type annotation:
let mutTable = fixed([10, 20, 30]);
mutTable[1] = 42;

// Produces GrowableArray<i32> by adopting the literal backing buffer:
let queue = growable([1, 2, 3]);
queue.push(4);
```

- `fixed([1, 2, 3])`: Supplies the contextual type so the literal compiles
  directly as a `FixedArray`. The helper inlines away completely.
- `growable([1, 2, 3])`: Compiles the literal as a `FixedArray` and passes it
  directly to `GrowableArray` as its initial backing buffer without allocating
  an intermediate copy.

::: note

Planned literal decorators In an upcoming release, Zena plans to
introduce literal decorators such as `@fixed` (or `@mutable`) and `@growable`
directly on array literals:

```zena
let mutTable = @fixed [10, 20, 30];
let queue = @growable [1, 2, 3];
```

Until literal decorators land, the `fixed()` and `growable()` helper functions
serve as the idiomatic, zero-cost way to construct mutable and growable arrays
in expression position.

:::

### Empty literals

An empty array literal `[]` contains no elements from which to infer an element
type. It must receive its container and element type from surrounding context:

1. **Variable type annotations**:
   ```zena
   let emptyFixed: FixedArray<i32> = [];
   let emptyGrowable: GrowableArray<String> = [];
   ```
2. **Explicit casts (`as`)**: In expression position where no annotation is
   present, cast the literal directly:
   ```zena
   let empty = [] as FixedArray<i32>;
   let emptyImm = [] as ImmutableArray<String>;
   ```
3. **Function parameter positions**: Passing `[]` to a typed function parameter
   supplies the contextual type directly:

   ```zena
   function setHeaders(headers: FixedArray<String>) { ... }

   setHeaders([]); // Parameter supplies contextual type FixedArray<String>
   ```

4. **Return positions**:
   ```zena
   function getTags(): Array<String> {
     return []; // Return type supplies contextual type
   }
   ```

Attempting to declare `let ambiguous = [];` without an expected type or cast
produces a compile-time error. For more details on how context determines
literal types, see [Contextual typing](/reference/inference/#contextual-typing).

## `ImmutableArray<T>`

`ImmutableArray<T>` is declared in `zena:core` as an extension class on the raw
WebAssembly GC immutable array type `array<T>`:

```zena
export final extension class ImmutableArray<T> on array<T>
  with IterableUtils<T>
  implements Array<T>
```

### Immutability guarantees

1. **Static rejection**: The index assignment operator `[]=` is not defined on
   `ImmutableArray<T>`. Attempting to assign to an element produces a
   compile-time error.
2. **Runtime enforcement**: WebAssembly GC enforces array mutability at the
   bytecode level. An immutable array cannot be modified even through casts (see
   [WebAssembly GC array types](#webassembly-gc-array-types)).

### Covariance

Because elements in an `ImmutableArray<T>` can never be overwritten,
`ImmutableArray<T>` is covariant in its element type:

```zena
class Animal {}
class Dog extends Animal {}

let dogs: ImmutableArray<Dog> = [new Dog(), new Dog()];
let animals: ImmutableArray<Animal> = dogs; // Permitted: covariant subtyping
```

### Creation and mapping

WebAssembly provides no instruction to allocate an uninitialized immutable array
and populate it afterwards. Consequently, `ImmutableArray` has no `from()`
constructor. It is created exclusively via literals or static constant tables.

Calling `arr.map(f)` on an `ImmutableArray<T>` populates and returns a
`FixedArray<U>`, which satisfies `Array<U>` via covariant return.

## `FixedArray<T>`

`FixedArray<T>` is an extension class on the raw mutable WebAssembly GC array
type `array<var T>`:

```zena
export final extension class FixedArray<T> on array<var T>
  with IterableUtils<T>
  implements MutableArray<T>, Iterable<T>
```

A `FixedArray<T>` has a fixed length determined upon allocation, but its
individual elements can be read and mutated in place.

### Allocation and constructors

1. **Default-value allocation**: Creates an array of the specified length with
   every slot initialized to `value`:
   ```zena
   let table = new FixedArray<i32>(10, 0); // 10 elements, all 0
   ```
2. **From sequence**: Copies elements from any `Array<T>` into a new
   `FixedArray<T>`:
   ```zena
   let copy = FixedArray.from(existingArray);
   ```

### Mutation

Elements are read with `arr[i]` and mutated with `arr[i] = value`:

```zena
let counts = new FixedArray<i32>(4, 0);
counts[0] = 10;
counts[1] += 5;
```

### Invariance

`FixedArray<T>` is strictly invariant in its element type to preserve type
safety:

```zena
let dogs = new FixedArray<Dog>(2, new Dog());
// let animals: FixedArray<Animal> = dogs; // @error: FixedArray is invariant
```

Because elements can be modified in place, allowing subtyping would permit
storing an incompatible subtype through an aliased reference.

## `GrowableArray<T>`

`GrowableArray<T>` is a standard library class in `zena:core` providing dynamic
resizing with amortized O(1) append operations:

```zena
export final class GrowableArray<T> implements MutableArray<T>, Iterable<T>
```

### Construction

```zena
// Empty growable array with default capacity (8):
let list = new GrowableArray<String>();

// With explicit initial capacity:
let preallocated = new GrowableArray<i32>(64);

// Copied from an existing array:
let cloned = GrowableArray.from([1, 2, 3]);

// Built from a literal without copying backing storage:
let ready = growable([10, 20, 30]);
```

### Resizing operations

- `list.push(value)`: Appends an element to the end of the array. When the
  backing buffer fills, `GrowableArray` allocates a new `FixedArray` with double
  the capacity and copies existing elements over.
- `list.pop()`: Removes and returns the last element, decrementing the logical
  `length`.
- `list.length`: Returns the logical count of elements currently stored
  (distinct from the backing buffer's capacity).

```zena
let stack = new GrowableArray<i32>();
stack.push(100);
stack.push(200);

let top = stack.pop(); // 200
let count = stack.length; // 1
```

## Interfaces: `Array<T>` and `MutableArray<T>`

Zena defines two interfaces in `zena:core` to allow polymorphic programming
across different array implementations:

```zena
export interface Array<T> extends Iterable<T> {
  length: i32 { get; }
  operator [](index: i32): T;
  map<U>(f: (item: T, index: i32, seq: this) => U): Array<U>;
}

export interface MutableArray<T> extends Array<T> {
  operator []=(index: i32, value: T): void;
}
```

- `ImmutableArray<T>` implements `Array<T>`.
- `FixedArray<T>` and `GrowableArray<T>` implement both `Array<T>` and
  `MutableArray<T>`.

### Writing polymorphic array functions

Functions that only need to read elements and check lengths can accept
`Array<T>`:

```zena
function printAll(items: Array<String>) {
  for (let item in items) {
    console.log(item);
  }
}
```

For performance-critical code where you want guaranteed specialization without
interface dispatch, use generic bounds (`<A extends Array<T>>(arr: A)`). See
[Polymorphism and generic
specialization](#polymorphism-and-generic-specialization) for details and
trade-offs.

## Indexing and bounds

All arrays use zero-based indexing (`0 <= index < length`):

```zena
let arr = [10, 20, 30];
let first = arr[0]; // 10
let last = arr[arr.length - 1]; // 30
```

### Bounds checking behavior

Zena enforces bounds safety on all array reads and writes:

- **`FixedArray` and `ImmutableArray`**: Bounds checking is performed directly
  by the WebAssembly GC runtime. Accessing an index outside `[0, length)`
  immediately traps with a WebAssembly `out of bounds` trap.
- **`GrowableArray`**: Checks indices against its logical `length` property and
  throws an `IndexOutOfBoundsError` when an index is invalid.

## Slicing and ranges

`FixedArray<T>` provides slicing via the `slice()` method and range operator
overloads:

### The `slice()` method

`arr.slice(start, end)` returns a shallow copy of a portion of the array from
index `start` (inclusive) to `end` (exclusive):

```zena
let arr: FixedArray<i32> = [10, 20, 30, 40, 50];
let sub = arr.slice(1, 4); // [20, 30, 40]
```

- Indices are clamped to valid ranges (`start < 0` is clamped to `0`, `end >
length` is clamped to `length`).
- If `start >= end`, an empty array is returned.
- Negative indexing relative to the end (e.g. `-1`) is not supported; use
  `arr.length - 1` explicitly.

### Range indexing syntax

`FixedArray<T>` overloads the index operator for range types:

```zena
let items: FixedArray<i32> = [0, 1, 2, 3, 4, 5];

let a = items[1..4]; // BoundedRange: [1, 2, 3]
let b = items[2..];  // FromRange: [2, 3, 4, 5]
let c = items[..3];  // ToRange: [0, 1, 2]
let d = items[..];   // FullRange: shallow copy of entire array
```

## Iteration

All array implementations implement `Iterable<T>` and can be iterated using
`for-in` loops:

```zena
let names = ["Ada", "Grace", "Margaret"];
for (let name in names) {
  console.log(name);
}
```

When iterating over concrete `FixedArray` or `ImmutableArray` instances, the
compiler optimizes the loop into a direct index counter with zero iterator
allocation. See [Loop fusion for concrete
arrays](#loop-fusion-for-concrete-arrays).

## Array destructuring

Arrays support pattern destructuring in `let`, `var`, and parameter positions:

```zena
let coords = [10, 20, 30];

// Basic positional destructuring:
let [x, y, z] = coords;

// Skipping elements with holes:
let [first, , third] = coords; // first = 10, third = 30

// Rest pattern collecting remaining elements:
let [head, ...tail] = coords; // head = 10, tail = [20, 30]
```

Destructuring works identically across `ImmutableArray`, `FixedArray`, and
`GrowableArray`.

## Narrow integer arrays

Arrays can be instantiated with narrow integer types (`u8`, `i8`, `u16`, `i16`).
Narrow arrays share the same generic collection API as all other arrays:

```zena
let bytes = new FixedArray<u8>(4, 0);
bytes[0] = 0x48;
bytes[1] = 0x65;
bytes[2] = 0x6c;
bytes[3] = 0x6c;

// Slicing, mapping, and iteration work identically:
let sub = bytes.slice(1, 3);
```

### Explicit widening for arithmetic

Because Zena has a sound type system with no implicit widening or sign coercion,
reading an element from `FixedArray<u8>` yields the `u8` type. Combining it with
standard `i32` arithmetic requires an explicit widening cast using `as`:

```zena
let byteVal: u8 = bytes[0];
let total: i32 = (bytes[0] as i32) + 10;
```

See [Packed storage for narrow integer
types](#packed-storage-for-narrow-integer-types) for details on how these types
map directly to compact WebAssembly storage.

## Performance and representation

This section details how Zena's array architecture is implemented under
WebAssembly GC and how to write high-performance array code.

### WebAssembly GC array types

Zena's concrete arrays map directly onto WebAssembly GC array types without
wrapper structs or vtables:

```wat
;; Immutable 32-bit array:
(type $ImmutableArray_i32 (array i32))

;; Mutable 32-bit array:
(type $FixedArray_i32 (array (mut i32)))

;; Packed 8-bit array (FixedArray<u8> or FixedArray<i8>):
(type $FixedArray_u8 (array (mut i8)))

;; Packed 16-bit array (FixedArray<u16> or FixedArray<i16>):
(type $FixedArray_u16 (array (mut i16)))
```

Because `FixedArray<T>` and `ImmutableArray<T>` are declared as `extension class
... on array<...>`, the compiler erases the extension class to its underlying
`array` type at the WebAssembly boundary:

- Methods called on fixed or immutable arrays (such as `.map()` or `.slice()`)
  compile as **static functions** where the array is passed as the first
  argument (`this`).
- Array instances do not require vtables.
- Immutability is enforced by the WebAssembly VM: `(array T)` has no `array.set`
  instruction. Attempting to cast an `ImmutableArray` to a `FixedArray` via
  `anyref` fails with a WebAssembly `ref.cast` runtime trap.
- Zero-cost interoperability: Zena arrays can be passed directly to WebAssembly
  host environments or modules compiled from other languages without conversion.

### Packed storage for narrow integer types

In WebAssembly, values on the evaluation stack and in registers are always at
least 32 bits (`i32`, `i64`, `f32`, `f64`). However, the WebAssembly GC
specification supports `i8` and `i16` as **storage types** inside GC arrays and
structs.

When generic array classes are instantiated with narrow integer types, the
compiler maps them directly to native packed WebAssembly array types:

| Zena Array Type                               | Underlying WebAssembly GC Type | Bytes per Element |
| :-------------------------------------------- | :----------------------------- | :---------------- |
| `FixedArray<u8>` / `FixedArray<i8>`           | `(array (mut i8))`             | 1 byte            |
| `ImmutableArray<u8>` / `ImmutableArray<i8>`   | `(array i8)`                   | 1 byte            |
| `FixedArray<u16>` / `FixedArray<i16>`         | `(array (mut i16))`            | 2 bytes           |
| `ImmutableArray<u16>` / `ImmutableArray<i16>` | `(array i16)`                  | 2 bytes           |
| `FixedArray<i32>` / `FixedArray<u32>`         | `(array (mut i32))`            | 4 bytes           |
| `FixedArray<i64>` / `FixedArray<u64>`         | `(array (mut i64))`            | 8 bytes           |
| `FixedArray<f32>`                             | `(array (mut f32))`            | 4 bytes           |
| `FixedArray<f64>`                             | `(array (mut f64))`            | 8 bytes           |

Generic `FixedArray<T>` serves as the typed array: `FixedArray<u8>` provides
packed byte storage while sharing the exact same collection API as any other
array.

At the engine level:

- **Reads**: Reading `arr[i]` emits `array.get_u` (for `u8` and `u16`) or
  `array.get_s` (for `i8` and `i16`), automatically zero-extending or
  sign-extending the packed value to the evaluation stack.
- **Writes**: Mutating `arr[i] = value` on `FixedArray` emits `array.set`, which
  truncates the stack value to 8 or 16 bits upon storage.

### Loop fusion for concrete arrays

When iterating over concrete `FixedArray<T>` or `ImmutableArray<T>` instances,
the compiler's ZIR backend detects the concrete array and **fuses** the `for-in`
loop directly into an index counter loop:

```wat
;; Fused loop emits direct WebAssembly instructions:
local.get $arr
array.len
...
local.get $arr
local.get $idx
array.get $type
```

This eliminates the allocation of an iterator object and avoids all interface
method dispatch.

### Polymorphism and generic specialization

Passing a concrete array (`FixedArray` or `ImmutableArray`) to a parameter typed
as an interface like `Array<T>` conceptually packs the array into a fat pointer
(a two-field struct holding the instance reference and vtable pointer),
introducing dynamic dispatch.

In many cases, the compiler's optimizer will optimize this fat pointer away:

- **Scalar Replacement of Aggregates (SRoA)**: Decomposes the two-field
  fat-pointer struct into separate scalar locals where it does not escape.
- **Argument explosion**: Passes the instance reference and vtable as separate
  scalar parameters across function call boundaries.
- **Devirtualization and inlining**: Resolves single-implementer interface calls
  statically and inlines the underlying `array.len` and `array.get` trampolines.

#### Guaranteed specialization via generic bounds

If you want **guaranteed specialization** directly to native WebAssembly array
instructions without relying on optimization passes, constrain a generic type
parameter by `Array<T>`:

```zena
function sum<A extends Array<i32>>(arr: A): i32 {
  var total = 0;
  for (var i = 0; i < arr.length; i += 1) {
    total += arr[i];
  }
  return total;
}
```

The compiler specializes the function for each concrete array type passed to it.
Both `.length` and `arr[i]` resolve directly through the bound to native
WebAssembly instructions (`array.len` and `array.get`) with zero fat-pointer
overhead and zero indirect calls.

#### Trade-off: code size versus peak performance

Guaranteed specialization relies on **monomorphization**: the compiler
duplicates the function body for each concrete array type (`FixedArray`,
`ImmutableArray`, `GrowableArray`) it is instantiated with. This trades larger
WebAssembly binary size for maximum loop and element access speed.

For performance-critical inner loops and math kernels, generic specialization is
ideal. For large function bodies or cold utility paths where element access is
not the bottleneck, taking the plain `Array<T>` interface produces a single
shared function in the binary.
