# zena-runtime

The host side of the `zena-cli` compilation target, as a Rust library on
wasmtime. It is the counterpart of `packages/runtime`, which does the same
job for the `js` target in JavaScript.

A module compiled for `zena-cli` imports three things from whatever runs
it:

- **WASI preview 1** (`wasi_snapshot_preview1`), for stdio, files, clocks,
  arguments and environment.
- **`env.captureStackTrace` and `env.formatStackTrace`**, which back
  `Error`'s stack traces. Every module imports these because `Error` is in
  the prelude. (`env.getStackTrace`, which does both in one call, is also
  provided; nothing in the stdlib imports it.)
- **`zena_process`**, the ten functions behind `zena:process`, when the
  program uses that module. Spawning host processes leaves the sandbox, so
  the embedder grants it per instantiation (`Spawn::Allow`) or links
  trapping stubs (`Spawn::Deny`).

Strings cross the boundary through four helpers every compiled module
exports (`$stringCreate`, `$stringSetByte`, `$stringGetLength`,
`$stringGetByte`); `strings.rs` wraps them.

Beyond the imports, the crate holds what every embedder otherwise
duplicates:

- `engine::config(debug)`: the wasmtime `Config` Zena output needs (GC,
  exception handling, typed function references, tail calls, wide
  arithmetic, backtrace details), plus the ZENA_GC and ZENA_PROFILE
  environment switches and `reserve_gc_heap` (ZENA_GC_RESERVE_MB).
- `cache`: ahead-of-time compiled `.cwasm` files kept beside each `.wasm`,
  written under a file lock so concurrent processes compile a module once.
  Debug engines use a separate `.debug.cwasm`, since a cwasm only loads
  into an engine with the same compile-affecting settings.

## Use

```rust
use wasmtime::{Engine, Linker, Store};
use zena_runtime::{HostState, Spawn};

let engine = Engine::new(&zena_runtime::engine::config(false))?;
let module = zena_runtime::cache::load_module(&engine, "prog.wasm".as_ref(), false)?;

let mut linker: Linker<HostState> = Linker::new(&engine);
zena_runtime::add_to_linker(&mut linker, &engine, &module, Spawn::Deny)?;

let wasi = wasmtime_wasi::WasiCtxBuilder::new().inherit_stdio().build_p1();
let mut store = Store::new(&engine, HostState { wasi });
let instance = linker.instantiate(&mut store, &module)?;
zena_runtime::call_export(&mut store, &instance, "main")?;
```

`call_export` keeps the error as a `wasmtime::Error` so the caller can
still read the guest's exit status (`exit_code`) or print the wasm
backtrace (`report_trap`).

Two binaries in this repository embed the crate: [`zena-run`](../zena-run)
runs one compiled module and nothing else; [`zena-cli`](../zena-cli) adds
the compiler and the test and benchmark runners.

## Tests

```bash
cargo test -p zena-runtime
```
