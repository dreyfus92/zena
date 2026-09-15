# Vendored web-platform-tests URL resources

Machine-readable conformance data for `zena:url`, copied verbatim from
[web-platform-tests](https://github.com/web-platform-tests/wpt). Node and
rust-url vendor the same files the same way; see `../../../zena/url/DESIGN.md`
for why we generate `.zena` suites from them instead of reading JSON at
runtime.

**Licensed under the 3-Clause BSD License** (`LICENSE.md`, copied from the
same commit). These files are third-party data — do not hand-edit them.

## Provenance

- Upstream path: `url/resources/`
- Pinned commit: see `COMMIT`

| File                    | Used by                             | Schema                                                                                                                                             |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `urltestdata.json`      | `../wpt_urltestdata_test.zena`      | array mixing section-comment strings with `{input, base, ...}` objects that are either `failure: true` or a full set of expected component strings |
| `percent-encoding.json` | `../wpt_percent_encoding_test.zena` | `{input, output: {<encoding>: string}}`; only the `utf-8` expectations apply to us                                                                 |
| `setters_tests.json`    | `../wpt_setters_test.zena`          | keyed by property name; `{href, new_value, expected}`                                                                                              |
| `toascii.json`          | `../wpt_toascii_test.zena`          | `{input, output}` for UTS 46 domain-to-ASCII; a null `output` means the host must not parse                                                        |

`urltestdata-javascript-only.json` is deliberately NOT vendored: its cases are
lone-surrogate inputs specific to UTF-16 JS strings, and Zena strings are
well-formed UTF-8. The generator additionally skips any case containing a lone
surrogate (currently 8) and reports the count.

## Refreshing

```sh
COMMIT=<new upstream sha>
cd packages/stdlib/tests/url/wpt
for f in urltestdata.json percent-encoding.json setters_tests.json toascii.json LICENSE.md; do
  curl -sSo $f "https://raw.githubusercontent.com/web-platform-tests/wpt/$COMMIT/url/resources/$f"
done
echo "$COMMIT" > COMMIT
cd ../../.. && node scripts/generate-wpt-url-tests.js
```

Then re-run the suite and reconcile `expected-failures.txt`: cases that now
pass must be removed from it (the generator emits listed cases as `testSkip`,
so a stale entry silently hides a passing test), and any newly failing case
must be added with a one-line reason.

## expected-failures.txt

The cases we do not pass yet, keyed so the list survives upstream reordering:
`[input, base]` for urltestdata, `["percent-encoding", input]`,
`["setter", property, href, new_value]`, and `["toascii", input]`. Burning this
list down is the conformance metric for each phase.

The urltestdata, setters, and percent-encoding lists are **empty**. Everything
left is `toascii.json`, and each entry names the UTS 46 rule idna.zena does not
implement yet.
