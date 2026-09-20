//! The `env` imports behind `Error`'s stack traces.
//!
//! `Error`'s constructor calls `captureStackTrace()`, which hands back an
//! opaque host handle (a `wasmtime::WasmBacktrace` in an externref).
//! `Error.getStackTrace()` later passes it to `formatStackTrace`, which
//! renders it as a guest String. Capturing and formatting are separate
//! so that constructing an error that is never printed stays cheap.
//!
//! `getStackTrace` captures and formats in one call. No stdlib module
//! imports it today; it is kept because the JS runtime offers the same
//! name and a hand-written module may use it.
//!
//! All three are linked unconditionally, matching the module's declared
//! signature when it imports the name and a default otherwise.

use anyhow::Result;
use wasmtime::{Caller, Engine, ExternRef, Linker, Module, Val};

use crate::HostState;
use crate::strings::make_guest_string_or_null;

/// The module's declared type for an `env` import, or `default` when the
/// module does not import that name.
fn import_type(
    module: &Module,
    name: &str,
    default: impl FnOnce() -> wasmtime::FuncType,
) -> wasmtime::FuncType {
    module
        .imports()
        .find(|i| i.module() == "env" && i.name() == name)
        .and_then(|i| i.ty().func().cloned())
        .unwrap_or_else(default)
}

/// Links `env.getStackTrace`, `env.captureStackTrace` and
/// `env.formatStackTrace`.
pub fn add_to_linker(
    linker: &mut Linker<HostState>,
    engine: &Engine,
    module: &Module,
) -> Result<()> {
    let externref = wasmtime::ValType::EXTERNREF;

    let get_ty = import_type(module, "getStackTrace", || {
        wasmtime::FuncType::new(engine, [], [externref.clone()])
    });
    linker.func_new(
        "env",
        "getStackTrace",
        get_ty,
        |mut caller: Caller<'_, HostState>, _params, results| {
            let text = format!("{}", wasmtime::WasmBacktrace::capture(&caller));
            results[0] = make_guest_string_or_null(&mut caller, &text)?;
            Ok(())
        },
    )?;

    let capture_ty = import_type(module, "captureStackTrace", || {
        wasmtime::FuncType::new(engine, [], [externref.clone()])
    });
    linker.func_new(
        "env",
        "captureStackTrace",
        capture_ty,
        |mut caller: Caller<'_, HostState>, _params, results| {
            let bt = wasmtime::WasmBacktrace::capture(&caller);
            let ext_ref = ExternRef::new(&mut caller, bt)?;
            results[0] = Val::ExternRef(Some(ext_ref));
            Ok(())
        },
    )?;

    let format_ty = import_type(module, "formatStackTrace", || {
        wasmtime::FuncType::new(engine, [externref.clone()], [externref])
    });
    linker.func_new(
        "env",
        "formatStackTrace",
        format_ty,
        |mut caller: Caller<'_, HostState>, params, results| {
            let bt_ref = match &params[0] {
                Val::ExternRef(Some(r)) => *r,
                Val::AnyRef(Some(anyref)) => ExternRef::convert_any(&mut caller, *anyref)?,
                Val::ExternRef(None) | Val::AnyRef(None) => {
                    results[0] = Val::ExternRef(None);
                    return Ok(());
                }
                other => {
                    return Err(wasmtime::Error::msg(format!(
                        "formatStackTrace: expected ExternRef or AnyRef, got {other:?}"
                    )));
                }
            };
            let text = {
                let data = bt_ref.data(&caller)?;
                let Some(bt) = data.and_then(|any| any.downcast_ref::<wasmtime::WasmBacktrace>())
                else {
                    return Err(wasmtime::Error::msg(
                        "formatStackTrace: handle does not hold a WasmBacktrace",
                    ));
                };
                format!("{bt}")
            };
            results[0] = make_guest_string_or_null(&mut caller, &text)?;
            Ok(())
        },
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use wasmtime::{Config, Rooted, Store};
    use wasmtime_wasi::WasiCtxBuilder;

    struct MockString {
        data: Vec<u8>,
    }

    #[test]
    fn capture_then_format_names_the_wasm_frame() -> Result<()> {
        let mut config = Config::new();
        config.wasm_backtrace_details(wasmtime::WasmBacktraceDetails::Enable);
        config.wasm_gc(true);
        let engine = Engine::new(&config)?;

        let wat = r#"
            (module
                (import "env" "captureStackTrace" (func $capture (result externref)))
                (import "env" "formatStackTrace" (func $format (param externref) (result externref)))
                (import "env" "mockStringCreate" (func $create (param i32) (result externref)))
                (import "env" "mockStringSetByte" (func $set_byte (param externref i32 i32)))

                (func (export "$stringCreate") (param i32) (result externref)
                    local.get 0
                    call $create
                )

                (func (export "$stringSetByte") (param externref i32 i32)
                    local.get 0
                    local.get 1
                    local.get 2
                    call $set_byte
                )

                (func $test_stack_trace (export "test_stack_trace") (result externref)
                    call $capture
                    call $format
                )
            )
        "#;

        let module = Module::new(&engine, wat)?;
        let mut linker = Linker::<HostState>::new(&engine);
        add_to_linker(&mut linker, &engine, &module)?;

        linker.func_wrap(
            "env",
            "mockStringCreate",
            |mut caller: Caller<'_, HostState>, len: i32| {
                let mock = MockString {
                    data: vec![0; len as usize],
                };
                let ext = ExternRef::new(&mut caller, Mutex::new(mock))?;
                Ok(Some(ext))
            },
        )?;
        linker.func_wrap(
            "env",
            "mockStringSetByte",
            |caller: Caller<'_, HostState>,
             ext_ref: Option<Rooted<ExternRef>>,
             index: i32,
             val: i32| {
                let ext =
                    ext_ref.ok_or_else(|| wasmtime::Error::msg("expected non-null ExternRef"))?;
                let cell = ext
                    .data(&caller)?
                    .ok_or_else(|| wasmtime::Error::msg("missing data"))?
                    .downcast_ref::<Mutex<MockString>>()
                    .ok_or_else(|| wasmtime::Error::msg("expected Mutex<MockString>"))?;
                cell.lock().unwrap().data[index as usize] = val as u8;
                Ok(())
            },
        )?;

        let wasi = WasiCtxBuilder::new().build_p1();
        let mut store = Store::new(&engine, HostState { wasi });
        let instance = linker.instantiate(&mut store, &module)?;

        let func = instance
            .get_typed_func::<(), Option<Rooted<ExternRef>>>(&mut store, "test_stack_trace")?;
        let result_ref = func.call(&mut store, ())?;

        let ext =
            result_ref.ok_or_else(|| wasmtime::Error::msg("test_stack_trace returned null"))?;
        let cell = ext
            .data(&store)?
            .ok_or_else(|| wasmtime::Error::msg("expected string data in returned ExternRef"))?
            .downcast_ref::<Mutex<MockString>>()
            .ok_or_else(|| wasmtime::Error::msg("expected Mutex<MockString>"))?;
        let stack_trace = String::from_utf8(cell.lock().unwrap().data.clone())?;

        assert!(
            stack_trace.contains("test_stack_trace"),
            "got: {stack_trace}"
        );
        Ok(())
    }
}
