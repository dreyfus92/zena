# Unicode data in `zena:url`

`idna-table.zena` is generated from Unicode's `IdnaMappingTable.txt`. It is
checked in rather than fetched at build time, for the same reason the WPT JSON
is vendored: a build should not depend on the network, and a Unicode version
bump should be a reviewable diff.

## Refreshing

```sh
cd packages/stdlib
curl -sSO https://www.unicode.org/Public/idna/latest/IdnaMappingTable.txt
node scripts/generate-idna-table.js IdnaMappingTable.txt
rm IdnaMappingTable.txt
```

The generator prints the version it read and the sizes it produced. Check the
version in the regenerated file's header comment matches what you expected,
then run the URL tests — a Unicode bump can change which hosts parse, and
`tests/url/wpt_toascii_test.zena` is where that shows up.

## What the table costs, and why it is shaped this way

Unicode 17.0's source file is 787 KB. Three things cut that to a 42.5 KB
string literal:

1. **Collapsing statuses.** WHATWG URL calls UTS 46 with
   `UseSTD3ASCIIRules=false` and `Transitional_Processing=false`, which makes
   `deviation` and `disallowed_STD3_valid` indistinguishable from `valid`, and
   `disallowed_STD3_mapped` from `mapped`. Four statuses remain.
2. **Merging neighbours** that then say the same thing: 9,262 ranges become
   8,198.
3. **Delta varints.** Range starts are stored as deltas, and a single code
   point mapping as a zigzag delta from the range start — which is most of
   them, since case folding dominates.

The payload is printable ASCII, five bits per byte with bit 5 continuing.
That is a fifth larger than a raw LEB128 would be, and buys two things: the
generated file is a plain string literal needing no escaping beyond `\`, and
the runtime reads the encoded bytes straight out of the data segment with
`getByteAt`.

The table is gapless over U+0000..U+10FFFF, and the generator fails rather
than emitting a table with a hole — the lookup binary-searches and then trusts
what it finds, so a gap would silently return a neighbouring range's status.

`idna.zena` expands the stream into arrays on first use, because a varint
stream cannot be binary-searched in place. That costs one linear pass and
about 64 KB of arrays, and only for programs that actually parse a non-ASCII
host.
