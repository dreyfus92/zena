#!/usr/bin/env node
// Generates zena/url/idna-table.zena from Unicode's IdnaMappingTable.txt.
//
// Run with the table path (see zena/url/UNICODE.md for how to refresh it):
//   node scripts/generate-idna-table.js path/to/IdnaMappingTable.txt
//
// The output is one big ASCII string literal plus a tiny amount of Zena. The
// encoding is designed so the runtime never has to decode it up front: every
// byte is printable ASCII, so `getByteAt` reads the encoded bytes directly out
// of the string's data segment and the lookup binary-searches in place.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'zena', 'url', 'idna-table.zena');

// Effective status codes, after collapsing the source statuses under the
// options WHATWG URL fixes (see below). Must match idna.zena.
const VALID = 0;
const IGNORED = 1;
const DISALLOWED = 2;
const MAPPED = 3;

const tablePath = process.argv[2];
if (!tablePath) {
  console.error('usage: generate-idna-table.js <IdnaMappingTable.txt>');
  process.exit(1);
}

const source = readFileSync(tablePath, 'utf8');

/** Pulls the Unicode version out of the file's header comment. */
const versionOf = (text) => {
  const m = text.match(/^#\s*Version:\s*(.+)$/m);
  return m ? m[1].trim() : 'unknown';
};

/**
 * WHATWG URL calls UTS 46 ToASCII with UseSTD3ASCIIRules=false and
 * Transitional_Processing=false, which makes three of the source statuses
 * indistinguishable from ones we already have. Collapsing them here rather
 * than at runtime is most of why the table fits in 34 KB.
 */
const effectiveStatus = (status) => {
  switch (status) {
    case 'valid':
      return VALID;
    case 'ignored':
      return IGNORED;
    case 'disallowed':
      return DISALLOWED;
    case 'mapped':
      return MAPPED;
    case 'deviation':
      return VALID; // nontransitional
    case 'disallowed_STD3_valid':
      return VALID; // UseSTD3ASCIIRules=false
    case 'disallowed_STD3_mapped':
      return MAPPED; // UseSTD3ASCIIRules=false
    default:
      throw new Error(`unknown IDNA status: ${status}`);
  }
};

const parsed = [];
for (const rawLine of source.split('\n')) {
  const hash = rawLine.indexOf('#');
  const line = (hash >= 0 ? rawLine.slice(0, hash) : rawLine).trim();
  if (!line) continue;
  const fields = line.split(';').map((s) => s.trim());
  const [lo, hi] = fields[0].split('..');
  const start = parseInt(lo, 16);
  const end = hi ? parseInt(hi, 16) : start;
  const status = effectiveStatus(fields[1]);
  const mapping =
    status === MAPPED && fields[2]
      ? fields[2].split(/\s+/).map((h) => parseInt(h, 16))
      : null;
  if (status === MAPPED && mapping === null) {
    throw new Error(`mapped range with no mapping at ${fields[0]}`);
  }
  parsed.push({start, end, status, mapping});
}

// Merge neighbours that say the same thing. Only ranges with no mapping can
// merge; two mapped ranges are only the same if they map to the same string,
// which for distinct code points they never do.
const ranges = [];
for (const r of parsed) {
  const prev = ranges[ranges.length - 1];
  const mergeable =
    prev &&
    prev.end + 1 === r.start &&
    prev.status === r.status &&
    prev.mapping === null &&
    r.mapping === null;
  if (mergeable) prev.end = r.end;
  else ranges.push({...r});
}

// The table must cover every code point, because the lookup finds a range by
// binary search and then trusts it — a gap would silently read the wrong one.
let expected = 0;
for (const r of ranges) {
  if (r.start !== expected) {
    throw new Error(
      `gap or overlap at U+${r.start.toString(16).toUpperCase()}: ` +
        `expected U+${expected.toString(16).toUpperCase()}`,
    );
  }
  expected = r.end + 1;
}
if (expected !== 0x110000) {
  throw new Error(`table stops at U+${expected.toString(16)}, not U+110000`);
}

// --- Encoding -------------------------------------------------------------
//
// Every byte lands in 0x30..0x6F so the payload is printable ASCII: the
// generated file stays a legible (if enormous) string literal, it is valid
// UTF-8 by construction, and getByteAt returns the encoded byte itself.
//
// That window is 64 values, which buys five payload bits and a continuation
// flag — not six and a flag, which would need 128. Five costs about a fifth
// more bytes than a raw LEB128 would, and in exchange the table needs no
// decoding pass at startup and no escaping in the source.

const BASE = 0x30;
const CONTINUE = 0x20;

const bytes = [];
const emitVarint = (value) => {
  let v = value;
  for (;;) {
    const chunk = v & 0x1f;
    v >>>= 5;
    bytes.push(BASE + chunk + (v > 0 ? CONTINUE : 0));
    if (v === 0) break;
  }
};

// Multi-code-point mappings go in a spill area addressed by index; single
// code point mappings are stored as a zigzag delta from the range start,
// which is tiny for the huge number of case foldings.
const spill = [];
const spillIndex = new Map();
const spillSlot = (mapping) => {
  const key = mapping.join(',');
  const found = spillIndex.get(key);
  if (found !== undefined) return found;
  const at = spill.length;
  spill.push(mapping.length, ...mapping);
  spillIndex.set(key, at);
  return at;
};

const zigzag = (n) => (n << 1) ^ (n >> 31);

emitVarint(ranges.length);
let previousStart = 0;
for (const r of ranges) {
  emitVarint(r.start - previousStart);
  previousStart = r.start;
  if (r.status !== MAPPED) {
    emitVarint(r.status);
  } else if (r.mapping.length === 1) {
    // tag 3 = mapped-by-delta
    emitVarint(MAPPED);
    emitVarint(zigzag(r.mapping[0] - r.start));
  } else {
    // tag 4 = mapped-by-spill
    emitVarint(4);
    emitVarint(spillSlot(r.mapping));
  }
}

const spillStart = bytes.length;
for (const cp of spill) emitVarint(cp);

const encoded = String.fromCharCode(...bytes);
if (!/^[\x30-\x6F]*$/.test(encoded)) {
  throw new Error('encoder produced a byte outside the printable window');
}
// 0x5C lands inside the window, and no contiguous 64-value window in
// printable ASCII avoids it, so it is escaped in the source rather than
// encoded around. The quote is below the window and cannot appear.
if (encoded.includes("'")) {
  throw new Error('encoded table contains a quote');
}

// One literal on one (very long) line, deliberately. Splitting it into
// concatenated chunks would read better but leaves the compiler to either
// constant-fold hundreds of `+` or run them at startup, and there is no
// reason to find out which.
const literal = `  '${encoded.replaceAll('\\', '\\\\')}'`;

const out = `// GENERATED by scripts/generate-idna-table.js — DO NOT EDIT.
// Source: Unicode IdnaMappingTable.txt, Version ${versionOf(source)}.
// See UNICODE.md in this directory for how to refresh it.
//
// The UTS 46 mapping table, collapsed to the four statuses that remain once
// WHATWG URL's options are applied (UseSTD3ASCIIRules=false,
// Transitional_Processing=false) and merged where neighbours agree:
// ${parsed.length} source ranges become ${ranges.length}.
//
// The payload is a varint stream in printable ASCII — six bits per byte, bit
// 6 continues — so it needs no decoding pass: idna.zena binary-searches it
// where it sits in the data segment. Layout is a range count, then per range
// a delta from the previous start and a tag, then the spill area holding the
// mappings too long to store as a delta.

import { String } from 'zena:core';

/** Offset of the spill area within \`IDNA_TABLE\`. */
export let IDNA_SPILL_START = ${spillStart};

/** Number of ranges encoded in \`IDNA_TABLE\`. */
export let IDNA_RANGE_COUNT = ${ranges.length};

export let IDNA_TABLE: String =
${literal};
`;

writeFileSync(OUT, out);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Unicode ${versionOf(source)}`);
console.log(`  ${parsed.length} source ranges -> ${ranges.length} merged`);
console.log(`  ${spill.length} spill words for multi-code-point mappings`);
console.log(`  payload ${bytes.length} bytes (${kb(bytes.length)})`);
console.log(`  wrote ${OUT}`);
