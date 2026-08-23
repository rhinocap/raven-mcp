// Gate-list drift guard.
//
// The six suites that assert exact tool COUNTS all count REGISTRATIONS. None of
// them ever diffs the gate LIST against the registration set, and that blindness
// is not hypothetical: `delete_taste_data` sits in `REMOTE_GATED_TOOLS`, in
// `TOOL_ACCESS` and in the idempotency map while being registered on NO stdio
// build at all (`src/index.ts` registers it under `if (remote && hasUserStore)`).
// A name can therefore be gated with nothing answering to it, and every count
// suite stays green. That is the drift this file measures.
//
// It also pins the THREE remote builds apart, because the ledger spent two rounds
// treating them as two and "corrected" a right number into a wrong one:
//   remote                -> anonymous, frozen at 45
//   remote + tasteStore   -> authenticated hosted, 56
//   stdio                 -> 111
// with 112 registered names in total.
//
// The gate lists are NOT exported from src/index.ts, so they are scraped out of
// the compiled `dist/index.js` by brace balance. Exporting them would be a `src/`
// change, and any `src/` change makes the next push to main a live-endpoint
// deploy — a cost this guard is not worth. The scrape is the risky half: an
// extractor that silently returns an empty set would make every set-difference
// assertion vacuously true, which is the "measures nothing while looking green"
// shape this repo documents repeatedly. TypeScript emits `new Set<string>([...])`
// members as DOUBLE-quoted literals, and a first prototype written for single
// quotes reported `GATED 0` rather than erroring. So both extractions assert
// their own size first, and those two numbers are the guard on the instrument.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../dist/index.js';
import { RedisTasteStore } from '../dist/taste-store-redis.js';

const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function extractSet(name) {
  const src = readFileSync(DIST, 'utf8');
  const at = src.indexOf(name + ' = new Set([');
  assert.notEqual(at, -1, `${name} not found in dist/index.js — rebuild, or the constant was renamed`);
  const open = src.indexOf('[', at);
  let depth = 0, close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { close = i; break; } }
  }
  assert.notEqual(close, -1, `${name}: unbalanced array literal`);
  // Line comments live INSIDE the compiled array; strip them before harvesting.
  const body = src.slice(open + 1, close).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  return new Set([...body.matchAll(/["']([a-z0-9_]+)["']/g)].map((m) => m[1]));
}

function fakeRedis() {
  const kv = new Map();
  return {
    async get() { return null; }, async set() { return 'OK'; }, async del() { return 0; },
    async sadd() { return 0; }, async srem() { return 0; }, async smembers() { return []; },
    async rpush() { return 0; }, async lrange() { return []; },
    async scan() { return ['0', []]; }, kv,
  };
}

const names = (server) => new Set(Object.keys(server._registeredTools));
const minus = (a, b) => [...a].filter((n) => !b.has(n)).sort();
const GATED = extractSet('REMOTE_GATED_TOOLS');
const AUTHED_TASTE = extractSet('AUTHED_USER_TASTE_TOOLS');
const stdio = names(buildServer({ remote: false }));
const anon = names(buildServer({ remote: true }));
const authed = names(buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', fakeRedis()) }));
const all = new Set([...stdio, ...authed]);

// Split into four tests on purpose. `assert` aborts at the first failure, so a
// single test would grade every mutant by whichever pin happens to sit highest —
// measured: adding one phantom name to the gate list reddens the SIZE guard and
// the phantom assertion never runs, and renaming an entry reddens the anon count
// instead. Separate tests let each mechanism report the failure a human can act
// on: a NAME, not a number.
test('instrument: the dist/ scrape reads both gate lists', () => {
  // A silently-empty scrape would satisfy every set-difference assertion below
  // vacuously. TypeScript emits the members DOUBLE-quoted; a prototype written
  // for single quotes reported 0 rather than erroring.
  assert.equal(GATED.size, 67, 'REMOTE_GATED_TOOLS scraped from dist/');
  assert.equal(AUTHED_TASTE.size, 11, 'AUTHED_USER_TASTE_TOOLS scraped from dist/');
});

test('three remote builds, one hosted-only registration, 112 names in total', () => {
  assert.equal(stdio.size, 111);
  assert.equal(anon.size, 45);
  assert.equal(authed.size, 56);
  assert.equal(all.size, 112, 'stdio ∪ authed is the full registered name space');
  assert.deepEqual(minus(authed, stdio), ['delete_taste_data'],
    'delete_taste_data is the only tool registered on a hosted build and not on stdio');
  assert.ok(minus(stdio, authed).length > 0, 'stdio carries gated tools the hosted build does not');
});

test('the gate holds: the name space minus the gate list IS the anonymous surface', () => {
  assert.deepEqual([...anon].filter((n) => GATED.has(n)).sort(), [],
    'no gated tool leaks into the anonymous 45');
  assert.deepEqual(minus(all, GATED), [...anon].sort(),
    'full name space minus REMOTE_GATED_TOOLS equals the anonymous surface');
  assert.deepEqual(minus(authed, anon), [...AUTHED_TASTE].sort(),
    'authed minus anonymous is exactly AUTHED_USER_TASTE_TOOLS');
  assert.deepEqual([...AUTHED_TASTE].filter((n) => !GATED.has(n)).sort(), [],
    'every authed taste tool is itself gated');
});

// The drift this file exists for. `delete_taste_data` is the live proof the class
// is real: gated, classified in TOOL_ACCESS, in the idempotency map, and absent
// from all 111 stdio registrations. It is legitimate because the hosted build
// registers it — a name answering to NOTHING is what this catches, and no count
// suite can see it.
test('no phantom gate entries: every gated name is registered on some build', () => {
  assert.deepEqual([...GATED].filter((n) => !all.has(n)).sort(), [],
    'REMOTE_GATED_TOOLS entries with no registration answering to them');
});
