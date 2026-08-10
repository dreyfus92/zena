# `zena:url`

URL parsing, serialization, building, and matching for Zena.

**Status: 📐 Design phase.** Nothing is implemented yet. See [DESIGN.md](./DESIGN.md)
for the full design and implementation plan.

## Overview

`zena:url` provides a `URL` class that follows the
[WHATWG URL Standard](https://url.spec.whatwg.org/) — the same standard behind
the `URL` class in browsers, Node.js (`node:url`), Deno, Bun, and Cloudflare
Workers. Following the WHATWG standard (rather than RFC 3986) means:

- Zena programs parse URLs the same way browsers and servers do.
- We can mechanically port the [Web Platform Tests](https://github.com/web-platform-tests/wpt/tree/master/url)
  for URL parsing instead of writing thousands of edge-case tests by hand.

Everything is one library — `import {...} from 'zena:url'` — implemented as
multiple files in this directory, with dead-code elimination keeping unused
pieces out of compiled binaries:

| Export                   | Description                               | Status                             |
| ------------------------ | ----------------------------------------- | ---------------------------------- |
| `URL`                    | WHATWG URL parsing and serialization      | Done, including the `with*` copy methods. Usable as a map key (`==`/`hashCode` on the canonical form) |
| `URLSearchParams`        | The query as an ordered multimap          | Done                               |
| percent-encoding helpers | Encode sets, form-urlencoded codec        | Done                               |
| `url` tag                | Safe URL building by interpolation        | Done                               |
| punycode codec           | RFC 3492 encode/decode for one label      | Done — the IDNA host processing around it is not |
| `UrlString`              | Typed URL strings                         | Design                             |
| `URLPattern`             | Route/pattern matching                    | Planned                            |
| `URLPatternList`         | Fast multi-pattern matching (prefix trie) | Planned                            |

## API at a glance

```zena
import {URL, URLSearchParams, url} from 'zena:url';

// Parsing — returns null on invalid input; there is no throwing constructor
let u = URL.parse('https://example.com:8080/docs/api?q=zena#intro') as URL;
u.protocol;  // 'https:'
u.hostname;  // 'example.com'
u.port;      // '8080'
u.pathname;  // '/docs/api'
u.search;    // '?q=zena'
u.hash;      // '#intro'
u.href;      // the canonical serialization

let maybe = URL.parse('not a url');  // null

// Relative URL resolution against a base
let page = URL.parse('/guide/intro', 'https://zena.dev/docs/');

// URLs are immutable; derive modified copies with `with*` methods
let plain = u.withProtocol('http:').withPort('');

// Like the web's setters, a value the spec rejects leaves the component
// alone rather than reporting an error.
u.withPort('nope').port;  // '8080', unchanged

// `withHref` is the exception: it replaces every component, so there is
// nothing to fall back to and it returns `URL | null` like `URL.parse`.
let moved = u.withHref('https://zena.dev/');  // URL | null

// Query parameters. A SNAPSHOT, not the web's live-bound object: URL is
// immutable, so mutating these does not change `u`.
let params = u.searchParams();
params.get('q');       // 'zena' (String | null)
params.getAll('tag');  // Array<String>, in order
params.append('page', '2');
params.toString();     // 'q=zena&page=2'
for (let pair in params) {
  let (name, value) = pair;
}

// Safe URL building with a template tag: the literal parts are trusted,
// and every interpolated value is percent-encoded for the component it
// lands in, so it cannot escape into another one.
let team = 'a/b team';
let link = url`https://example.com/teams/${team}/dashboard`;
// → https://example.com/teams/a%2Fb%20team/dashboard

url`https://example.com/s?q=${'a&admin=true'}`;
// → ...?q=a%26admin%3Dtrue — one parameter, not two

// Only the path, query, and fragment take interpolations. A hole in the
// scheme, credentials, host, or port returns null: those are parsed from
// their raw text, so no encoding would make an untrusted value safe.
url`https://${host}/a`;  // null
```

Deviations from the web API (and why) are covered in
[DESIGN.md](./DESIGN.md#api-design) — the headline one is that Zena's `URL` is
**immutable** with `with*` methods instead of the web's mutable setters, since
Zena has no getter/setter accessors and favors immutability by default.

## Specs and references

- [WHATWG URL Standard](https://url.spec.whatwg.org/) — the spec we implement.
- [URLPattern Standard](https://urlpattern.spec.whatwg.org/) — for the `URLPattern` phase.
- [WPT `url/` tests](https://github.com/web-platform-tests/wpt/tree/master/url) —
  machine-readable conformance test data we port.
- [Node.js `node:url`](https://nodejs.org/api/url.html) — WHATWG `URL` plus a
  legacy `url.parse()` API that we do **not** replicate.
- [Ada](https://github.com/ada-url/ada) (C++, used by Node) and
  [rust-url](https://github.com/servo/rust-url) (Rust, used by Servo) —
  from-scratch implementations we reference for structure and performance ideas.
- [url-pattern-list](https://github.com/justinfagnani/url-pattern-list) — prefix-trie
  matching over many `URLPattern`s (2–30× faster than a linear scan depending
  on pattern count).

## Testing

Conformance tests are mechanically generated from the WPT JSON test data
(`urltestdata.json`, `setters_tests.json`) into `zena:test` suites — the same
approach as the Go regexp tests ported into `zena:regex`. See
[DESIGN.md](./DESIGN.md#testing-strategy).
