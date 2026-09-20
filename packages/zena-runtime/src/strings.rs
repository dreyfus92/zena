//! Moving strings across the host boundary.
//!
//! Zena strings live on the guest's GC heap, so the host cannot read
//! them from linear memory. Every compiled module instead exports four
//! helpers, and the host calls back into the guest one byte at a time:
//! `$stringCreate(len)` and `$stringSetByte(str, i, byte)` build a
//! string, `$stringGetLength(str)` and `$stringGetByte(str, i)` read one.
//! Bytes are UTF-8.

use wasmtime::{Caller, ExternRef, Rooted, Val};

use crate::HostState;

/// Extracts the externref behind a reference-typed parameter. Imports
/// declared with a concrete GC type arrive as `AnyRef` and are converted.
pub fn param_to_externref(
    caller: &mut Caller<'_, HostState>,
    param: &Val,
    what: &str,
) -> Result<Rooted<ExternRef>, wasmtime::Error> {
    match param {
        Val::ExternRef(Some(r)) => Ok(*r),
        Val::AnyRef(Some(anyref)) => Ok(ExternRef::convert_any(&mut *caller, *anyref)?),
        _ => Err(wasmtime::Error::msg(format!(
            "{what}: null or non-reference handle"
        ))),
    }
}

/// Reads a guest String param via the module's `$stringGetLength` /
/// `$stringGetByte` exports.
pub fn read_guest_string(
    caller: &mut Caller<'_, HostState>,
    param: &Val,
) -> Result<String, wasmtime::Error> {
    let ext = param_to_externref(caller, param, "string argument")?;
    let get_length = caller
        .get_export("$stringGetLength")
        .and_then(|e| e.into_func())
        .ok_or_else(|| wasmtime::Error::msg("no $stringGetLength export"))?;
    let get_byte = caller
        .get_export("$stringGetByte")
        .and_then(|e| e.into_func())
        .ok_or_else(|| wasmtime::Error::msg("no $stringGetByte export"))?;

    let mut len_res = vec![Val::I32(0)];
    get_length.call(&mut *caller, &[Val::ExternRef(Some(ext))], &mut len_res)?;
    let Val::I32(len) = len_res[0] else {
        return Err(wasmtime::Error::msg("$stringGetLength returned a non-i32"));
    };
    let mut bytes = Vec::with_capacity(len.max(0) as usize);
    let mut byte_res = vec![Val::I32(0)];
    for i in 0..len {
        get_byte.call(
            &mut *caller,
            &[Val::ExternRef(Some(ext)), Val::I32(i)],
            &mut byte_res,
        )?;
        let Val::I32(b) = byte_res[0] else {
            return Err(wasmtime::Error::msg("$stringGetByte returned a non-i32"));
        };
        bytes.push(b as u8);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Builds a guest String from host bytes via `$stringCreate` /
/// `$stringSetByte`.
pub fn make_guest_string(
    caller: &mut Caller<'_, HostState>,
    bytes: &[u8],
) -> Result<Val, wasmtime::Error> {
    let create = caller
        .get_export("$stringCreate")
        .and_then(|e| e.into_func())
        .ok_or_else(|| wasmtime::Error::msg("no $stringCreate export"))?;
    let set_byte = caller
        .get_export("$stringSetByte")
        .and_then(|e| e.into_func())
        .ok_or_else(|| wasmtime::Error::msg("no $stringSetByte export"))?;

    let mut cr_res = vec![Val::I32(0)];
    create.call(&mut *caller, &[Val::I32(bytes.len() as i32)], &mut cr_res)?;
    let str_ref = cr_res[0].clone();
    for (i, &byte) in bytes.iter().enumerate() {
        set_byte.call(
            &mut *caller,
            &[str_ref.clone(), Val::I32(i as i32), Val::I32(byte as i32)],
            &mut [],
        )?;
    }
    Ok(str_ref)
}

/// Like [`make_guest_string`], but returns a null externref when the
/// text is empty or the module does not export the string helpers.
/// The stack-trace imports use this: a module without `Error` in its
/// prelude has no strings to build into.
pub fn make_guest_string_or_null(
    caller: &mut Caller<'_, HostState>,
    text: &str,
) -> Result<Val, wasmtime::Error> {
    if text.is_empty() {
        return Ok(Val::ExternRef(None));
    }
    let has_helpers = caller.get_export("$stringCreate").is_some()
        && caller.get_export("$stringSetByte").is_some();
    if !has_helpers {
        return Ok(Val::ExternRef(None));
    }
    make_guest_string(caller, text.as_bytes())
}
