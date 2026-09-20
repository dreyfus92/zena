# Zena CLI Context (For AI Agents)

This document is to be used by AI agents (and human developers) to understand
the architectural boundaries, design decisions, and debugging expectations for
the `zena-cli` Rust package.

## Architecture & Responsibilities

0. **Two crates, one host**
   - Everything a compiled module needs from its host lives in
     `packages/zena-runtime`: the wasmtime `Config` (`engine::config`), the
     `.cwasm` cache (`cache`), the `env` stack-trace imports, `zena_process`,
     and the guest-string helpers. This crate adds the compiler invocation,
     the compile cache under `.zena/cache` or the user cache dir, and the
     `test`, `bench`, `doc` and `precompile` commands.
   - `packages/zena-run` is the other embedder of `zena-runtime`: it runs a
     compiled module and nothing more. A change to how modules are linked or
     configured belongs in `zena-runtime`, so both binaries pick it up.

1. **Host Language Integration (Rust/Wasmtime)**
   - The CLI leverages **Wasmtime** to execute Zena's output. Zena is uniquely
     tied to experimental/advanced WebAssembly features.
   - `zena_runtime::engine::config` always enables Garbage Collection (`gc`),
     Exception Handling (`exceptions`), Typed Function References
     (`function-references`), tail calls and wide arithmetic. If Zena
     compilation/instantiation fails with validation errors, verify that
     Wasmtime feature flags are correctly toggled there.

2. **Host Capabilities Beyond WASI (`zena_process`)**
   - `zena:process` (stdlib) is backed by the `zena_process` import module
     implemented in `zena-runtime`'s `process.rs`. Spawning escapes the WASI
     sandbox, so it is granted per invocation (`Spawn::Allow` vs
     `Spawn::Deny`): the orchestrator programs under `zena/`
     (`bench-run.zena`, `test-run.zena`) and repo tests get real
     implementations; `zena-cli run` requires `--allow-spawn` or
     `ZENA_ALLOW_SPAWN=1`; everything else gets trapping stubs.
   - The `bench` and `test` subcommands are thin: they compile and run
     those Zena orchestrators via `run_internal_tool`, which also spawns
     this binary back in hidden worker modes (`sample`, `test --single`).
   - `doc` is thin the same way, running `packages/zenadoc/zena/cli/main.zena`
     (see `docs/design/zenadoc.md`). It needs no spawn capability; what it
     needs is that the guest works from the repository root, which is why
     it passes an input path inside the checkout repo-relative and an
     output path absolute.

3. **WASI Virtual Filesystem Boundaries**
   - Zena's `stdlib/fs` interfaces natively with WASI Preview 1.
   - The CLI uses `wasmtime-wasi` to safely expose OS capabilities to the
     sandbox. When the Zena standard library resolves file logic across various
     host directories (e.g., using temp vs root paths), the Rust CLI provides
     the respective directory map (preopen capabilities).
   - If a new system-level module (like `net`) is added to Zena, this CLI will
     be responsible for providing the host capability implementation via WASI.

4. **Output Standardization (Silent by Default)**
   - Following strict Unix philosophy and mirroring standard Node CLI behavior,
     the Zena CLI execution engine is **silent by default**.
   - Standard output (`stdout`) represents **only** the executing `.zena`
     program's output, enabling clean pipelines (e.g., `zena run data.zena |
grep foo`).
   - Diagnostic text (e.g., "Compiling...", "Running executable...") is hidden
     behind the `--verbose` / `-v` flag.

## Agent Guidelines & Warnings

- **Debugging Crashes**: By default, you will not see Wasm engine setups or host
  reading traps. If you encounter inexplicable exits or test failures related to
  the CLI, **always re-run the command with the `--verbose` flag**.
- **Workspace Navigation**: Remember this is a standard Rust application living
  in an NPM monorepo. The Cargo workspace is the repository root
  (`Cargo.toml` and `Cargo.lock` there); use `cargo build -p zena-cli`,
  `cargo check`, and `cargo clippy` from the root, and `cargo test -p
  zena-runtime -p zena-cli -p zena-run` for all three crates.
- **Tests**: When expanding standard library tests that interact with this CLI,
  remember that test environments map different paths (like `/tmp`), which rely
  entirely on `wasmtime_wasi::Dir` mappings being present in the CLI
  bootstrapper.
