# Vendored web-platform-tests URL resources

Machine-readable conformance data for `zena:url`, copied verbatim from
[web-platform-tests](https://github.com/web-platform-tests/wpt). Node and
rust-url vendor the same files the same way; see `../../../zena/url/DESIGN.md`
for why we generate `.zena` suites from them instead of reading JSON at
runtime.

**Licensed under the 3-Clause BSD License** (`LICENSE.md`, copied from the
same commit). These files are third-party data — do not hand-edit them.

## Provenance

- Pinned commit: see `COMMIT`
- Upstream path: `url/resources/`, except `urlpatterntestdata.json`, which
  upstream keeps under `urlpattern/resources/`. Both are pinned to the same
  commit, and the refresh loop below fetches each from its own path.

| File                      | Used by                             | Schema                                                                                                                                             |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `urltestdata.json`        | `../wpt_urltestdata_test.zena`      | array mixing section-comment strings with `{input, base, ...}` objects that are either `failure: true` or a full set of expected component strings |
| `percent-encoding.json`   | `../wpt_percent_encoding_test.zena` | `{input, output: {<encoding>: string}}`; only the `utf-8` expectations apply to us                                                                 |
| `setters_tests.json`      | `../wpt_setters_test.zena`          | keyed by property name; `{href, new_value, expected}`                                                                                              |
| `toascii.json`            | `../wpt_toascii_test.zena`          | `{input, output}` for UTS 46 domain-to-ASCII; a null `output` means the host must not parse                                                        |
| `urlpatterntestdata.json` | `../wpt_urlpattern_test.zena`       | `{pattern, inputs, expected_obj, expected_match, exactly_empty_components}`; see below                                                             |

`urlpatterntestdata.json` carries four shapes in one array, distinguished by
which keys a case has. `expected_obj: "error"` means the constructor must
throw (44 cases). `expected_match: null` means the pattern must not match the
input (87). An `expected_obj` object names the canonicalized components the
constructor must produce (134). Otherwise `expected_match` names the groups
`exec` must return. `pattern` and `inputs` are arrays, because a case may
supply a base URL as a second element (11 and 8 cases) or options as a third
(2).

`urltestdata-javascript-only.json` is deliberately NOT vendored: its cases are
lone-surrogate inputs specific to UTF-16 JS strings, and Zena strings are
well-formed UTF-8. The generators additionally skip any case containing a lone
surrogate — 8 in `urltestdata.json`, 5 in `urlpatterntestdata.json` — and
report the count.

`urlpatterntestdata.json` is divided further, and every count is reported at
the end of a generation run rather than quietly dropped. Of its 369 cases: 5
carry a lone surrogate; 71 give the pattern as a string and wait on the
constructor-string parser; 1 passes an init object and a base URL as two
arguments, which is a JavaScript overload with no Zena spelling at all, the
base URL going inside the init here; and the remaining 292 are init objects,
deduping to 182 emitted tests. A case whose second argument is an options
dictionary IS emitted, with the options dropped — they change how the compiled
matchers are flagged, never the component pattern strings a constructor test
looks at.

## Refreshing

```sh
COMMIT=<new upstream sha>
cd packages/stdlib/tests/url/wpt
for f in urltestdata.json percent-encoding.json setters_tests.json toascii.json LICENSE.md; do
  curl -sSo $f "https://raw.githubusercontent.com/web-platform-tests/wpt/$COMMIT/url/resources/$f"
done
curl -sSo urlpatterntestdata.json \
  "https://raw.githubusercontent.com/web-platform-tests/wpt/$COMMIT/urlpattern/resources/urlpatterntestdata.json"
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
`["setter", property, href, new_value]`, `["toascii", input]`, and
`["urlpattern", <the case's pattern array, as JSON>]`. Burning this list down
is the conformance metric for each phase.

The urltestdata, setters, percent-encoding and urlpattern lists are **empty**.
What remains is `toascii.json`, where each entry names the UTS 46 rule
idna.zena does not implement yet.

Nothing from `urlpatterntestdata.json` is listed here yet, and the pattern
forms URLPattern cannot take are deliberately not listed here either: those
cases are never emitted, so there is no test for an entry to silence. They are
reported as counts with their reasons instead (see above). A case earns a line
here only once it is emitted and fails.
