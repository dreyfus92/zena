//! Wasmtime engine configuration for compiled Zena modules.

use anyhow::Result;
use wasmtime::{Collector, Config, Engine, Inlining, Linker, Module, Store};

use crate::HostState;

/// The wasmtime `Config` every Zena host uses.
///
/// Zena's output needs GC, exception handling, typed function references,
/// tail calls (`return_call` for `tail return`, see docs/design/tail-calls.md)
/// and the wide-arithmetic instructions the compiler emits under
/// ZENA_WIDE_ARITHMETIC=1. All engines that share cwasm artifacts must agree
/// on these settings: wasmtime refuses to deserialize a cwasm whose
/// compile-affecting flags differ, and the fallback is a silent multi-second
/// in-process recompile.
///
/// `debug` turns off Cranelift's inlining so backtraces name the function
/// that trapped; [`crate::cache`] keeps debug and release cwasm files
/// apart.
///
/// Two environment variables adjust the result: ZENA_PROFILE enables the
/// perf-map profiler, and ZENA_GC picks the collector (see
/// [`apply_gc_config`]).
pub fn config(debug: bool) -> Config {
    let mut config = Config::new();
    config.cranelift_opt_level(wasmtime::OptLevel::Speed);
    config.compiler_inlining(if debug { Inlining::No } else { Inlining::Yes });
    config.wasm_gc(true);
    config.wasm_function_references(true);
    config.wasm_exceptions(true);
    config.wasm_tail_call(true);
    config.wasm_wide_arithmetic(true);
    config.wasm_backtrace_details(wasmtime::WasmBacktraceDetails::Enable);
    if std::env::var("ZENA_PROFILE").is_ok() {
        config.profiler(wasmtime::ProfilingStrategy::PerfMap);
    } else {
        config.native_unwind_info(false);
    }
    apply_gc_config(&mut config);
    config
}

/// Selects the wasmtime GC collector via the ZENA_GC env var
/// (null | drc | copying). Defaults to wasmtime's Auto.
pub fn apply_gc_config(config: &mut Config) {
    match std::env::var("ZENA_GC").as_deref() {
        Ok("null") => {
            config.collector(Collector::Null);
        }
        Ok("drc") => {
            config.collector(Collector::DeferredReferenceCounting);
        }
        Ok("copying") => {
            config.collector(Collector::Copying);
        }
        _ => {}
    }
}

/// How many MiB of GC heap headroom to reserve up front (see
/// [`reserve_gc_heap`]). Overridable via the ZENA_GC_RESERVE_MB env var;
/// 0 disables the reservation.
const DEFAULT_GC_RESERVE_MB: u64 = 0;

/// Pre-grows the store's GC heap by allocating, and immediately
/// dropping, one large dummy array.
///
/// Wasmtime's copying collector only grows the GC heap when an
/// allocation still does not fit after a full collection, so the heap
/// hovers just above the size of the live set and allocation-heavy
/// programs (like the self-hosted compiler) spend most of their time
/// collecting: roughly one full live-set copy per live-set's worth of
/// allocation. The GC heap never shrinks, so one oversized allocation
/// up front leaves every later collection with ample headroom. The
/// balloon array is dead as soon as the helper returns; only the
/// grown heap capacity remains.
///
/// The allocation is done by a tiny auxiliary wasm module using
/// `array.new_default` because the host-side `ArrayRef::new`
/// initializes elements one `Val` at a time (~2.4s/GiB, versus
/// memset speed here).
pub fn reserve_gc_heap(engine: &Engine, store: &mut Store<HostState>) -> Result<()> {
    let mb: u64 = match std::env::var("ZENA_GC_RESERVE_MB") {
        Ok(v) => v
            .trim()
            .parse()
            .map_err(|_| anyhow::anyhow!("ZENA_GC_RESERVE_MB must be an integer, got {v:?}"))?,
        Err(_) => DEFAULT_GC_RESERVE_MB,
    };
    // The GC heap is an i32-indexed memory capped at 4 GiB and split
    // into two equal semi-spaces, and the balloon must fit in one
    // semi-space. Above this cap the growth request would exceed the
    // 4 GiB maximum and wasmtime would skip growing entirely.
    let mb = mb.min(1900);
    if mb == 0 {
        return Ok(());
    }
    let wat = r#"(module
      (type $balloon (array (mut i64)))
      (func (export "balloon") (param $len i32)
        (drop (array.new_default $balloon (local.get $len)))))"#;
    let module = Module::new(engine, wat)?;
    let instance = Linker::<HostState>::new(engine).instantiate(&mut *store, &module)?;
    let balloon = instance.get_typed_func::<i32, ()>(&mut *store, "balloon")?;
    let len = i32::try_from(mb * (1 << 20) / 8).unwrap();
    // A failure here only means less headroom, not incorrectness.
    let _ = balloon.call(&mut *store, len);
    Ok(())
}
