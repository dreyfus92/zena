#!/usr/bin/env node
// Generates zena:test suites from the vendored WPT url resources.
//
// The generated files are checked in and diffable; refreshing them is a
// re-download of tests/url/wpt/ (see its README) plus a re-run of this script.
// Cases we do not pass yet are listed in tests/url/wpt/expected-failures.txt
// and emitted as testSkip so they stay visible in the test output instead of
// silently disappearing.
//
// Usage: node scripts/generate-wpt-url-tests.js

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');
const wptDir = join(pkgDir, 'tests', 'url', 'wpt');

const commit = readFileSync(join(wptDir, 'COMMIT'), 'utf-8').trim();

// ---------------------------------------------------------------------------
// Zena string literal emission
//
// Zena has no \xNN or \uXXXX escapes (docs/language-reference.md); source is
// UTF-8, so non-ASCII characters are emitted directly. Only the exotic control
// bytes have no representation, so strings containing them are emitted as
// dec('...') with those bytes (and '%' itself) percent-escaped, decoded by a
// helper the generated file defines locally — deliberately NOT zena:url's
// percentDecode, so the harness does not depend on the code under test.
// ---------------------------------------------------------------------------

const needsDecoder = (bytes) =>
  bytes.some(
    (b) => (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f,
  );

const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, '0');

function zenaString(str) {
  const bytes = [...Buffer.from(str, 'utf-8')];
  const useDec = needsDecoder(bytes);
  let out = '';
  for (const b of bytes) {
    if (b === 0x5c) {
      out += '\\\\'; // backslash
    } else if (b === 0x27) {
      out += "\\'"; // single quote
    } else if (useDec && b === 0x25) {
      out += '%25'; // literal percent, so dec() round-trips
    } else if (useDec && (b < 0x20 || b === 0x7f)) {
      out += '%' + hex2(b);
    } else if (b === 0x09) {
      out += '\\t';
    } else if (b === 0x0a) {
      out += '\\n';
    } else if (b === 0x0d) {
      out += '\\r';
    } else {
      out += String.fromCharCode(b); // raw byte; re-encoded below
    }
  }
  // `out` holds bytes as chars; write it back out as UTF-8 bytes verbatim.
  const literal = "'" + Buffer.from(out, 'latin1').toString('utf-8') + "'";
  return useDec ? `dec(${literal})` : literal;
}

const zenaStringOrNull = (v) =>
  v === null || v === undefined ? 'null' : zenaString(v);

// A short, readable, single-line label for a test case.
function label(index, input, base) {
  const clean = (s) =>
    [...s]
      .map((ch) => {
        const c = ch.codePointAt(0);
        return c < 0x20 || c === 0x7f ? '.' : ch;
      })
      .join('')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
  let name = `#${index} ${clean(input)}`;
  if (base !== null && base !== undefined) name += ` [base ${clean(base)}]`;
  return name.length > 110 ? name.slice(0, 107) + '...' : name;
}

// ---------------------------------------------------------------------------
// Expected failures
// ---------------------------------------------------------------------------

const skipPath = join(wptDir, 'expected-failures.txt');
const skipKeys = new Set();
if (existsSync(skipPath)) {
  for (const line of readFileSync(skipPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    skipKeys.add(trimmed);
  }
}
// Key a case by its JSON identity so the list survives reordering upstream.
const caseKey = (c) => JSON.stringify([c.input, c.base ?? null]);
// percent-encoding.json cases have no base, so they get their own key shape.
const encodingCaseKey = (input) => JSON.stringify(['percent-encoding', input]);

// The dec() helper both generated files need, for control bytes that Zena
// string literals cannot express.
const decoderPreamble = () => [
  `// Decodes the %XX escapes this generator uses for control bytes that`,
  `// Zena string literals cannot express. Local on purpose: the harness`,
  `// must not depend on zena:url's own percent-decoder.`,
  `let hexVal = (b: i32): i32 => {`,
  `  if (b >= 0x30 && b <= 0x39) return b - 0x30;`,
  `  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;`,
  `  return b - 0x61 + 10;`,
  `};`,
  ``,
  `let dec = (s: String): String => {`,
  `  let sb = new StringBuilder(s.length);`,
  `  var i = 0;`,
  `  while (i < s.length) {`,
  `    if (s.getByteAt(i) == 0x25 && i + 2 < s.length) {`,
  `      sb.appendByte((hexVal(s.getByteAt(i + 1)) << 4) | hexVal(s.getByteAt(i + 2)));`,
  `      i += 3;`,
  `    } else {`,
  `      sb.appendByte(s.getByteAt(i));`,
  `      i += 1;`,
  `    }`,
  `  }`,
  `  return sb.toString();`,
  `};`,
];

// ---------------------------------------------------------------------------
// urltestdata.json
// ---------------------------------------------------------------------------

const data = JSON.parse(
  readFileSync(join(wptDir, 'urltestdata.json'), 'utf-8'),
);

const lines = [];
const emit = (s) => lines.push(s);

emit(`// GENERATED by scripts/generate-wpt-url-tests.js — DO NOT EDIT.`);
emit(`// Source: web-platform-tests/wpt url/resources/urltestdata.json`);
emit(`// Pinned at commit ${commit}. See tests/url/wpt/README.md.`);
emit(`//`);
emit(`// Cases listed in tests/url/wpt/expected-failures.txt are emitted as`);
emit(`// testSkip; burning that list down is the conformance metric.`);
emit(`import {suite, test, testSkip, TestContext} from 'zena:test';`);
emit(`import {equal, isTrue} from 'zena:assert';`);
emit(`import {URL} from 'zena:url';`);
emit(`import {StringBuilder} from 'zena:core';`);
emit('');
decoderPreamble().forEach(emit);
emit('');

let nSuccess = 0;
let nFailure = 0;
let nSkipped = 0;
let nUnrepresentable = 0;

const body = [];
data.forEach((entry, index) => {
  if (typeof entry === 'string') return; // section comment
  // Lone surrogates cannot be represented in a UTF-8 source file. WPT keeps
  // those cases in urltestdata-javascript-only.json, but guard anyway.
  try {
    Buffer.from(entry.input ?? '', 'utf-8');
    if (/[\uD800-\uDFFF]/.test(entry.input ?? '')) throw new Error('surrogate');
    if (/[\uD800-\uDFFF]/.test(entry.base ?? '')) throw new Error('surrogate');
  } catch {
    nUnrepresentable++;
    return;
  }

  const skipped = skipKeys.has(caseKey(entry));
  const fn = skipped ? 'testSkip' : 'test';
  const input = zenaString(entry.input);
  const base = zenaStringOrNull(entry.base);
  const name = label(index, entry.input, entry.base);

  body.push(`  ${fn}('${name}', (ctx: TestContext): void => {`);
  if (entry.failure) {
    if (!skipped) nFailure++;
    body.push(`    isTrue(URL.parse(${input}, ${base}) == null);`);
  } else {
    if (!skipped) nSuccess++;
    body.push(`    let u = URL.parse(${input}, ${base});`);
    body.push(`    isTrue(u != null);`);
    body.push(`    if (u != null) {`);
    const u = '(u as URL)';
    const cmp = (expr, expected) =>
      body.push(`      equal(${expr}, ${zenaString(expected)});`);
    cmp(`${u}.href`, entry.href);
    cmp(`${u}.protocol`, entry.protocol);
    cmp(`${u}.username`, entry.username);
    cmp(`${u}.password`, entry.password);
    cmp(`${u}.host()`, entry.host);
    cmp(`${u}.hostname`, entry.hostname);
    cmp(`${u}.port`, entry.port);
    cmp(`${u}.pathname`, entry.pathname);
    cmp(`${u}.search`, entry.search);
    cmp(`${u}.hash`, entry.hash);
    if (entry.origin !== undefined) cmp(`${u}.origin()`, entry.origin);
    body.push(`    }`);
  }
  body.push(`  });`);
  if (skipped) nSkipped++;
});

emit(`export let tests = suite('WPT urltestdata', (): void => {`);
lines.push(...body);
emit(`});`);

const outPath = join(pkgDir, 'tests', 'url', 'wpt_urltestdata_test.zena');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');

console.log(
  `Wrote ${outPath}\n` +
    `  ${nSuccess} component cases, ${nFailure} failure cases, ` +
    `${nSkipped} skipped (expected failures), ` +
    `${nUnrepresentable} unrepresentable (lone surrogates)`,
);

// ---------------------------------------------------------------------------
// percent-encoding.json
//
// Upstream drives these through an <a href> in a document of a given legacy
// encoding, so each case's `output` is keyed by encoding. zena:url is always
// UTF-8 and does not implement the spec's encoding override, so only the
// "utf-8" key is used and the rest are counted and reported, not silently
// dropped.
//
// The harness puts the input in the query of an https URL, so the expected
// output is the SPECIAL-query percent-encode set (https being a special
// scheme). None of the current cases contain "'", the only code point where
// the special-query and query sets differ, but the special set is what the
// fixture actually describes.
// ---------------------------------------------------------------------------

const encData = JSON.parse(
  readFileSync(join(wptDir, 'percent-encoding.json'), 'utf-8'),
);

const encLines = [];
const encEmit = (s) => encLines.push(s);

encEmit(`// GENERATED by scripts/generate-wpt-url-tests.js — DO NOT EDIT.`);
encEmit(
  `// Source: web-platform-tests/wpt url/resources/percent-encoding.json`,
);
encEmit(`// Pinned at commit ${commit}. See tests/url/wpt/README.md.`);
encEmit(`//`);
encEmit(`// Only each case's "utf-8" output is asserted: zena:url is always`);
encEmit(`// UTF-8 and does not implement the spec's encoding override. The`);
encEmit(`// fixture drives its inputs through the query of an https URL,`);
encEmit(`// hence the special-query set.`);
encEmit(`import {suite, test, testSkip, TestContext} from 'zena:test';`);
encEmit(`import {equal} from 'zena:assert';`);
encEmit(`import {percentEncode, EncodeSet} from 'zena:url';`);
encEmit(`import {StringBuilder} from 'zena:core';`);
encEmit('');
decoderPreamble().forEach(encEmit);
encEmit('');

let nEnc = 0;
let nEncSkipped = 0;
let nEncNonUtf8 = 0;

const encBody = [];
encData.forEach((entry, index) => {
  if (typeof entry === 'string') return; // section comment
  const outputs = entry.output ?? {};
  nEncNonUtf8 += Object.keys(outputs).filter((k) => k !== 'utf-8').length;
  const expected = outputs['utf-8'];
  if (expected === undefined) return;

  const skipped = skipKeys.has(encodingCaseKey(entry.input));
  const fn = skipped ? 'testSkip' : 'test';
  encBody.push(
    `  ${fn}('${label(index, entry.input, null)}', (ctx: TestContext): void => {`,
  );
  encBody.push(
    `    equal(percentEncode(${zenaString(entry.input)}, EncodeSet.SpecialQuery), ${zenaString(expected)});`,
  );
  encBody.push(`  });`);
  if (skipped) nEncSkipped++;
  else nEnc++;
});

encEmit(`export let tests = suite('WPT percent-encoding', (): void => {`);
encLines.push(...encBody);
encEmit(`});`);

const encOutPath = join(
  pkgDir,
  'tests',
  'url',
  'wpt_percent_encoding_test.zena',
);
writeFileSync(encOutPath, encLines.join('\n') + '\n', 'utf-8');

console.log(
  `Wrote ${encOutPath}\n` +
    `  ${nEnc} utf-8 cases, ${nEncSkipped} skipped (expected failures), ` +
    `${nEncNonUtf8} legacy-encoding outputs ignored (encoding override is a non-goal)`,
);

// ---------------------------------------------------------------------------
// setters_tests.json
//
// Keyed by property name; each case is {href, new_value, expected} where
// expected holds the components that must hold AFTER the set. Many cases
// expect NO change — the spec's setters reject bad input by returning early
// rather than reporting an error — so `expected` frequently equals the
// components of `href`.
//
// zena:url is immutable, so `url.protocol = v` becomes `url.withProtocol(v)`
// and the assertions run against the returned URL.
// ---------------------------------------------------------------------------

const settersData = JSON.parse(
  readFileSync(join(wptDir, 'setters_tests.json'), 'utf-8'),
);

// property name -> the with* method that replaces its setter
const SETTER_METHOD = {
  protocol: 'withProtocol',
  username: 'withUsername',
  password: 'withPassword',
  host: 'withHost',
  hostname: 'withHostname',
  port: 'withPort',
  pathname: 'withPathname',
  search: 'withSearch',
  hash: 'withHash',
};

// component name -> the expression that reads it back off a URL
const COMPONENT_READ = {
  href: 'href',
  protocol: 'protocol',
  username: 'username',
  password: 'password',
  host: 'host()',
  hostname: 'hostname',
  port: 'port',
  pathname: 'pathname',
  search: 'search',
  hash: 'hash',
  origin: 'origin()',
};

const setLines = [];
const setEmit = (s) => setLines.push(s);

setEmit(`// GENERATED by scripts/generate-wpt-url-tests.js — DO NOT EDIT.`);
setEmit(`// Source: web-platform-tests/wpt url/resources/setters_tests.json`);
setEmit(`// Pinned at commit ${commit}. See tests/url/wpt/README.md.`);
setEmit(`//`);
setEmit(`// The web's mutable setters map to zena:url's with* methods, which`);
setEmit(`// return a new URL. Cases whose "expected" repeats the original`);
setEmit(`// components are the spec rejecting the value by leaving the URL`);
setEmit(`// alone, which is exactly what these pin.`);
setEmit(`import {suite, test, testSkip, TestContext} from 'zena:test';`);
setEmit(`import {equal, isTrue} from 'zena:assert';`);
setEmit(`import {URL} from 'zena:url';`);
setEmit(`import {String} from 'zena:core';`);
setEmit(`import {StringBuilder} from 'zena:core';`);
setEmit('');
decoderPreamble().forEach(setEmit);
setEmit('');

let nSet = 0;
let nSetSkipped = 0;
const setterCaseKey = (prop, c) =>
  JSON.stringify(['setter', prop, c.href, c.new_value]);

const setBody = [];
for (const prop of Object.keys(settersData)) {
  if (prop === 'comment') continue;
  const method = SETTER_METHOD[prop];
  // href is a whole-URL replacement, not a component set; withHref returns
  // URL | null and is covered by the hand-written suite instead.
  if (method === undefined) continue;

  settersData[prop].forEach((c, i) => {
    const skipped = skipKeys.has(setterCaseKey(prop, c));
    const fn = skipped ? 'testSkip' : 'test';
    const note = c.comment ? ` — ${c.comment}` : '';
    const name = label(i, `${prop}=${c.new_value} on ${c.href}${note}`, null);

    setBody.push(`  ${fn}('${name}', (ctx: TestContext): void => {`);
    setBody.push(`    let u = URL.parse(${zenaString(c.href)}, null);`);
    setBody.push(`    isTrue(u != null);`);
    setBody.push(`    if (u != null) {`);
    setBody.push(
      `      let out = (u as URL).${method}(${zenaString(c.new_value)});`,
    );
    for (const [component, expected] of Object.entries(c.expected)) {
      const read = COMPONENT_READ[component];
      if (read === undefined) continue;
      setBody.push(`      equal(out.${read}, ${zenaString(expected)});`);
    }
    setBody.push(`    }`);
    setBody.push(`  });`);
    if (skipped) nSetSkipped++;
    else nSet++;
  });
}

setEmit(`export let tests = suite('WPT setters', (): void => {`);
setLines.push(...setBody);
setEmit(`});`);

const setOutPath = join(pkgDir, 'tests', 'url', 'wpt_setters_test.zena');
writeFileSync(setOutPath, setLines.join('\n') + '\n', 'utf-8');

console.log(
  `Wrote ${setOutPath}\n` +
    `  ${nSet} setter cases, ${nSetSkipped} skipped (expected failures)`,
);

// ---------------------------------------------------------------------------
// toascii.json -> tests/url/wpt_toascii_test.zena
// ---------------------------------------------------------------------------
//
// Run the way WPT itself runs these: build `https://<input>/x` and read back
// the host, with a null output meaning the URL must not parse. That exercises
// domain-to-ASCII through the same path a caller reaches it by, rather than
// through an export that only exists for the test.

const toasciiData = JSON.parse(
  readFileSync(join(wptDir, 'toascii.json'), 'utf-8'),
);

// Keyed on the input alone; these cases have no base.
const toasciiCaseKey = (input) => JSON.stringify(['toascii', input]);

const taLines = [];
const taEmit = (s) => taLines.push(s);

taEmit(`// GENERATED by scripts/generate-wpt-url-tests.js — DO NOT EDIT.`);
taEmit(`// Source: web-platform-tests/wpt url/resources/toascii.json`);
taEmit(`// Pinned at commit ${commit}. See tests/url/wpt/README.md.`);
taEmit(`//`);
taEmit(
  `// UTS 46 domain-to-ASCII. Each case builds https://<input>/x and reads`,
);
taEmit(`// back the host; a null output means the URL must not parse at all.`);
taEmit(`import {suite, test, testSkip, TestContext} from 'zena:test';`);
taEmit(`import {equal, isTrue} from 'zena:assert';`);
taEmit(`import {URL} from 'zena:url';`);
taEmit(`import {String} from 'zena:core';`);
taEmit(`import {StringBuilder} from 'zena:core';`);
taEmit('');
taLines.push(...decoderPreamble());
taEmit('');

const taBody = [];
let nTa = 0;
let nTaSkipped = 0;

toasciiData
  .filter((c) => typeof c === 'object' && c !== null)
  .forEach((c, i) => {
    const skipped = skipKeys.has(toasciiCaseKey(c.input));
    const fn = skipped ? 'testSkip' : 'test';
    const label = c.comment ? `${c.input} — ${c.comment}` : c.input;
    const name = `#${i} ${label}`.replace(/[\r\n]+/g, ' ');
    taBody.push(`  ${fn}(${zenaString(name)}, (ctx: TestContext): void => {`);
    taBody.push(
      `    let u = URL.parse('https://' + ${zenaString(c.input)} + '/x', null);`,
    );
    if (c.output === null) {
      taBody.push(`    isTrue(u == null);`);
    } else {
      taBody.push(`    isTrue(u != null);`);
      taBody.push(`    if (u != null) {`);
      taBody.push(`      equal((u as URL).host(), ${zenaString(c.output)});`);
      taBody.push(`    }`);
    }
    taBody.push(`  });`);
    if (skipped) nTaSkipped++;
    else nTa++;
  });

taEmit(`export let tests = suite('WPT toascii', (): void => {`);
taLines.push(...taBody);
taEmit(`});`);

const taOutPath = join(pkgDir, 'tests', 'url', 'wpt_toascii_test.zena');
writeFileSync(taOutPath, taLines.join('\n') + '\n', 'utf-8');

console.log(
  `Wrote ${taOutPath}\n` +
    `  ${nTa} toascii cases, ${nTaSkipped} skipped (expected failures)`,
);

// ---------------------------------------------------------------------------
// urlpatterntestdata.json -> tests/url/wpt_urlpattern_test.zena
//
// Only the constructor is covered so far: each case builds the pattern and
// checks the eight component pattern strings it reports. The match half of
// the fixture (`inputs` / `expected_match`) waits for exec().
//
// Most cases name only the components they care about. The rest are NOT
// unconstrained — upstream's harness computes them, and this reproduces that
// computation here so the generated file holds flat literals rather than the
// rule. In priority order: an explicit expectation, then "" for a component
// listed in exactly_empty_components, then the pattern the input gave, then
// `*` when an EARLIER component was specified (naming a hostname stops the
// base URL's pathname being inherited), then the base URL's own value, and
// `*` otherwise. Credentials are never inherited from a base URL.
//
// Cases the Zena API cannot express are counted as unrepresentable rather
// than listed as expected failures, because no later phase makes them
// expressible: a pattern given as a string needs the constructor-string
// parser (a later phase, so those ARE expected failures), but a lone
// surrogate has no UTF-8 spelling, and `new URLPattern(init, baseURL)` is a
// JavaScript overload that takes an init object and a string at once.
// ---------------------------------------------------------------------------

const patternData = JSON.parse(
  readFileSync(join(wptDir, 'urlpatterntestdata.json'), 'utf-8'),
);

const PATTERN_COMPONENTS = [
  'protocol',
  'username',
  'password',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
];

// URLPatternInit's own members. A case may carry other keys — `ignoreCase`
// belongs to URLPatternOptions, a different dictionary — and the web API
// ignores those in the init position, so they are not set here either.
const INIT_FIELDS = [...PATTERN_COMPONENTS, 'baseURL'];

// A component is only inherited from the base URL while every component to
// its left was left unspecified. Upstream's own list; note that username and
// password have none, being never inherited.
const EARLIER_COMPONENTS = {
  protocol: [],
  username: [],
  password: [],
  hostname: ['protocol'],
  port: ['protocol', 'hostname'],
  pathname: ['protocol', 'hostname', 'port'],
  search: ['protocol', 'hostname', 'port', 'pathname'],
  hash: ['protocol', 'hostname', 'port', 'pathname', 'search'],
};

const patternCaseKey = (c) => JSON.stringify(['urlpattern', c.pattern]);

const hasLoneSurrogate = (s) => /[\uD800-\uDFFF]/.test(s);

// Reproduces the expectation upstream's harness computes for one component.
function expectedComponent(entry, component) {
  const explicit = (entry.expected_obj || {})[component];
  if (explicit !== undefined) return explicit;

  const init = entry.pattern[0];

  let baseURL = null;
  if (entry.pattern.length > 0 && init && init.baseURL) {
    baseURL = new URL(init.baseURL);
  } else if (entry.pattern.length > 1 && typeof entry.pattern[1] === 'string') {
    baseURL = new URL(entry.pattern[1]);
  }

  if (entry.exactly_empty_components?.includes(component)) return '';
  // Truthiness, not key presence: an empty component falls through to the
  // rules below, which is how {"port": ""} reaches its own expectation.
  if (typeof init === 'object' && init[component]) return init[component];
  if (
    typeof init === 'object' &&
    EARLIER_COMPONENTS[component].some((c) => c in init)
  ) {
    return '*';
  }
  if (baseURL && component !== 'username' && component !== 'password') {
    let value = baseURL[component];
    // The URL getters keep their separators; the pattern strings do not.
    if (component === 'protocol') value = value.substring(0, value.length - 1);
    else if (component === 'search' || component === 'hash') {
      value = value.substring(1);
    }
    return value;
  }
  return '*';
}

const patLines = [];
const patEmit = (s) => patLines.push(s);

patEmit(`// GENERATED by scripts/generate-wpt-url-tests.js — DO NOT EDIT.`);
patEmit(
  `// Source: web-platform-tests/wpt urlpattern/resources/urlpatterntestdata.json`,
);
patEmit(`// Pinned at commit ${commit}. See tests/url/wpt/README.md.`);
patEmit(`//`);
patEmit(`// Constructor cases only: each builds a URLPattern and checks the`);
patEmit(`// eight component pattern strings. Components a case does not name`);
patEmit(`// are computed the way upstream's harness computes them, so the`);
patEmit(`// expectations here are literals rather than a rule.`);
patEmit(`import {suite, test, testSkip, TestContext} from 'zena:test';`);
patEmit(`import {equal, throws} from 'zena:assert';`);
patEmit(`import {URLPattern, URLPatternInit} from 'zena:url';`);
patEmit(`import {StringBuilder} from 'zena:core';`);
patEmit('');
decoderPreamble().forEach(patEmit);
patEmit('');

let nPat = 0;
let nPatError = 0;
let nPatSkipped = 0;
let nPatString = 0;
let nPatUnrepresentable = 0;

const patBody = [];
const seenPatterns = new Set();

patternData.forEach((entry, index) => {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.pattern)) {
    return; // section comment or "//" annotation
  }

  const patternJson = JSON.stringify(entry.pattern);

  if (hasLoneSurrogate(patternJson)) {
    nPatUnrepresentable++;
    return;
  }

  const init = entry.pattern[0];

  // A pattern given as a string needs the constructor-string parser, which is
  // a later phase. Tracked separately from the genuinely inexpressible.
  if (typeof init !== 'object' || init === null) {
    nPatString++;
    return;
  }

  // A second argument is either a base URL or an options dictionary, and only
  // one of those is a problem.
  //
  // `new URLPattern(init, baseURL)` passes an init object and a base URL
  // string at once. Zena's constructor takes the base URL inside the init, so
  // that combination has no spelling here and never will.
  //
  // Options are fine to drop: they only decide how the compiled matchers are
  // flagged, never the component pattern strings this suite checks, so such a
  // case is emitted as if the options were not there. It then usually dedupes
  // against the same init without them.
  if (entry.pattern.length > 1 && typeof entry.pattern[1] === 'string') {
    nPatUnrepresentable++;
    return;
  }

  const isError = entry.expected_obj === 'error';

  const expectations = isError
    ? null
    : PATTERN_COMPONENTS.map((c) => expectedComponent(entry, c));

  // The same pattern recurs with different match inputs; construction checks
  // for those are identical, so only the first is emitted. Keyed on the init
  // alone, so that a case differing only by a dropped options argument
  // collapses into its plain equivalent rather than emitting a twin.
  const dedupeKey = JSON.stringify([init, expectations]);
  if (seenPatterns.has(dedupeKey)) return;
  seenPatterns.add(dedupeKey);

  const skipped = skipKeys.has(patternCaseKey(entry));
  const fn = skipped ? 'testSkip' : 'test';
  const name = label(index, patternJson, null);

  const buildInit = (indent) => {
    const out = [`${indent}let init = new URLPatternInit();`];
    for (const key of INIT_FIELDS) {
      const value = init[key];
      if (typeof value !== 'string') continue;
      out.push(`${indent}init.${key} = ${zenaString(value)};`);
    }
    return out;
  };

  patBody.push(`  ${fn}('${name}', (ctx: TestContext): void => {`);
  if (isError) {
    patBody.push(`    throws((): void => {`);
    patBody.push(...buildInit('      '));
    patBody.push(`      let p = new URLPattern(init);`);
    patBody.push(`    });`);
    if (!skipped) nPatError++;
  } else {
    patBody.push(...buildInit('    '));
    patBody.push(`    let p = new URLPattern(init);`);
    PATTERN_COMPONENTS.forEach((component, i) => {
      // The component name rides along as the assertion message: without it
      // a mismatch reports only "Values not equal", naming neither the
      // component nor either value.
      patBody.push(
        `    equal(p.${component}, ${zenaString(expectations[i])}, '${component}');`,
      );
    });
    if (!skipped) nPat++;
  }
  patBody.push(`  });`);
  if (skipped) nPatSkipped++;
});

patEmit(`export let tests = suite('WPT urlpattern constructor', (): void => {`);
patLines.push(...patBody);
patEmit(`});`);

const patOutPath = join(pkgDir, 'tests', 'url', 'wpt_urlpattern_test.zena');
writeFileSync(patOutPath, patLines.join('\n') + '\n', 'utf-8');

console.log(
  `Wrote ${patOutPath}\n` +
    `  ${nPat} constructor cases, ${nPatError} error cases, ` +
    `${nPatSkipped} skipped (expected failures), ` +
    `${nPatString} string patterns (need the constructor-string parser), ` +
    `${nPatUnrepresentable} unrepresentable (lone surrogates, init+baseURL)`,
);
