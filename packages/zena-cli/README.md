# Zena CLI (`zena-cli`)

The official Rust-based command-line interface and execution engine for the Zena
programming language.

## Purpose

Since Zena compiles to standard WebAssembly and targets WASI, Zena programs
_can_ run in any compliant Wasm runtime (including the web). However, this
custom Rust CLI exists for **convenience and enhanced capabilities**:

- **Extended APIs:** Several tools, such as the Zena compiler and CLI, work best
  with capabilities beyond standard WASI:
  - Extracting backtraces from exceptions
  - Spawning child processes
  - Dynamically compiling and running Wasm modules
- **Performance:** It caches Wasmtime-compiled native machine code, greatly
  speeding up startup times.
- **Ergonomics:** It automatically configures all the experimental Wasmtime
  flags required by Zena (e.g., GC, reference types, and exceptions).
- **Bundling:** It provides a vehicle to bundle the Zena compiler, CLI, and test
  runner into a single installable binary.

While standard Zena programs work anywhere, `zena-cli` acts as the optimized,
fully-featured native host for the Zena ecosystem.

The host-side pieces (engine configuration, the `.cwasm` cache, the
stack-trace and `zena:process` imports) live in the
[`zena-runtime`](../zena-runtime) crate. [`zena-run`](../zena-run) embeds
the same crate to run a compiled module without the compiler.

## Building

```bash
cargo build --release -p zena-cli    # from the repository root
```

## Usage

```bash
# Run a Zena file directly (silently outputs only the program's output)
./target/release/zena-cli run examples/hello-world.zena

# Run with verbose engine diagnostic logs
./target/release/zena-cli --verbose run examples/hello-world.zena
```

## Development and Architecture

For architectural insights, design constraints, and AI agent instructions
regarding this application, please refer to [CONTEXT.md](./CONTEXT.md).
