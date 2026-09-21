---
title: 'Ownership and Resources'
description: 'Ownership and resource management in Zena: resource classes, the Disposable protocol, handles, second-class borrows, and scoped values.'
status: Draft
statusType: warning
---

::: warning Placeholder
This page hasn't been written yet. The headings below are the planned outline —
see `src/_data/sidebar.js` for the full content plan. For the conceptual guide,
see [Resources and Ownership](/guide/resources/).
:::

## Resource classes

<!-- TODO: Resource classes -->

## The Disposable protocol

<!-- TODO: The Disposable protocol -->

## Deterministic cleanup with using

<!-- TODO: Deterministic cleanup with using -->

## Handles: Own, Borrow, and Unmanaged

<!-- TODO: Handles: Own, Borrow, and Unmanaged -->

## Second-class borrows

<!-- TODO: Second-class borrows -->

## Scoped values and the scoped modifier

`Scoped<T>` from `zena:core` marks a second-class value that may not be
duplicated and may not outlive the extent it derives from. It allows asynchronous
operations and generators to safely work with borrowed resources without
violating loan lifetimes.

### Why second-class types cannot bind bare type parameters

An unconstrained generic type parameter `<T>` assumes `T` represents an
ordinary, first-class value that can be freely copied, stored in heap slots, or
captured:

```zena
// Ordinary generic function
let store = <T>(x: T) => {
  let list = new GrowableArray<T>();
  list.push(x); // Permitted for first-class T
};
```

Passing a second-class type like `Borrow<File>` or `Scoped<Future<i32>>` to
`store` would place the stack-bound value in a heap array, violating its
extent. Therefore, ordinary `<T>` type parameters reject second-class type
arguments at compile time.

### The `<scoped T>` syntax

To permit generic code to accept second-class arguments, prefix the type
parameter with the contextual `scoped` modifier:

```zena
let keep = <scoped T>(x: T): T => {
  return x;
};
```

The `scoped` keyword is contextual: it acts as a modifier only when followed by
an identifier in a type-parameter list. It composes directly with bounds:

```zena
import { Disposable } from 'zena:core';

let processResource = <scoped T extends Disposable>(res: T): void => {
  // ...
};
```

### Discipline inside `scoped T` bodies

The body of a `scoped T` generic is checked under strict second-class
discipline:

1. **Consumed exactly once**: Every `T` value must be consumed exactly once on
   every exit path. Consumption occurs by returning the value, moving it to
   another `scoped` parameter, or awaiting it (for scoped futures). Leaving a
   `scoped T` unconsumed produces an abandonment compile error.
2. **No heap storage**: A value of type `T` cannot be stored in an ordinary class
   field, record property, or general collection.
3. **No closure capture**: A value of type `T` cannot be captured by a nested
   closure.

```zena
let invalidStore = <scoped T>(x: T): i32 => {
  let array = new GrowableArray<T>();
  // Compile error: scoped type parameter 'T' may not be stored in containers
  array.push(x);
  return 0;
};

let invalidCapture = <scoped T>(x: T): i32 => {
  // Compile error: scoped type parameter 'T' may not be captured by closures
  let fn = () => x;
  return 0;
};
```

### Compatibility with first-class types

The `<scoped T>` modifier relaxes the call-site requirement so second-class
arguments are admitted, but does not exclude ordinary first-class values. Passing
an `i32` or `String` to `keep(42)` is valid: the single implementation serves
both first-class and second-class callers safely.

### Standard library combinators

Combinators that operate over scoped values use `<scoped T>` to accept them
safely. For example, `Future.allSettled` accepts an array of scoped futures,
ensuring that all futures are awaited and none are abandoned with active
borrows:

```zena
Future.allSettled([read(fileA), read(fileB)]);
```

Similarly, `zena:core` exports `map`, `filter`, and `take` for scoped iterators
(`Scoped<Iterator<T>>`), allowing generator pipelines to transform borrowed
elements before they are driven by a loop.

## Regime transitions: disown and adopt

<!-- TODO: Regime transitions: disown and adopt -->
