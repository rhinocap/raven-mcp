/**
 * layout-orphans.test.mjs
 *
 * Deterministic unit tests for detectOrphanStretch() (dist/layout-orphans.js).
 * Tests are written against SPEC.md AC 1–6 using synthetic rects — no browser.
 *
 * Run:  node --test test/layout-orphans.test.mjs
 *   or: npm run build && node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Resolve paths ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distModule = path.resolve(__dirname, '../dist/layout-orphans.js');

// ── Load built module — register a FAILING test if dist is absent ─────────────

let detectOrphanStretch;

try {
  const mod = await import(distModule);
  detectOrphanStretch = mod.detectOrphanStretch;
  if (typeof detectOrphanStretch !== 'function') {
    throw new Error('detectOrphanStretch is not exported as a function');
  }
} catch (err) {
  // Register a named failing test so `node --test` exits non-zero.
  test('layout-orphans module available (FAILING — run `npm run build` first)', () => {
    assert.fail(
      `dist/layout-orphans.js not found or does not export detectOrphanStretch — run \`npm run build\` first. (${err.message})`
    );
  });
  process.exit(1);
}

// ── Element builder helper ────────────────────────────────────────────────────

/**
 * Build a minimal element object matching the audit_layout element shape.
 * @param {string} selector
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @returns {{ selector: string, rect: {x:number, y:number, w:number, h:number} }}
 */
function el(selector, { x = 0, y = 0, w, h }) {
  return { selector, rect: { x, y, w, h } };
}

// ── AC 6 helper: approximate equality ────────────────────────────────────────

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `${message ?? 'assertClose'}: expected ${actual} ≈ ${expected} (±${tolerance}), diff=${diff}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC 1/shape — result has the correct shape
// ─────────────────────────────────────────────────────────────────────────────

test('AC1/shape — result has all required keys with correct types', () => {
  const elements = [
    el('card-1', { x: 0,   y: 0, w: 280, h: 200 }),
    el('card-2', { x: 300, y: 0, w: 280, h: 200 }),
    el('card-3', { x: 600, y: 0, w: 280, h: 200 }),
    el('orphan', { x: 0, y: 240, w: 880, h: 200 }),
  ];

  const result = detectOrphanStretch(elements);

  // Required keys present
  const requiredKeys = ['has_orphan', 'card_width', 'card_height', 'card_count', 'orphans', 'issues'];
  for (const key of requiredKeys) {
    assert.ok(key in result, `result missing required key: ${key}`);
  }

  // Type checks
  assert.strictEqual(typeof result.has_orphan, 'boolean', 'has_orphan must be boolean');
  assert.ok(
    result.card_width === null || typeof result.card_width === 'number',
    'card_width must be number or null'
  );
  assert.ok(
    result.card_height === null || typeof result.card_height === 'number',
    'card_height must be number or null'
  );
  assert.strictEqual(typeof result.card_count, 'number', 'card_count must be number');
  assert.ok(Array.isArray(result.orphans), 'orphans must be an array');
  assert.ok(Array.isArray(result.issues), 'issues must be an array');

  // JSON-serialisable (no circular refs, no undefined, no functions)
  const serialised = JSON.stringify(result);
  assert.ok(typeof serialised === 'string' && serialised.length > 0, 'result must be JSON-serialisable');
  const roundTrip = JSON.parse(serialised);
  assert.deepStrictEqual(Object.keys(roundTrip).sort(), requiredKeys.slice().sort(),
    'round-tripped JSON must contain the same keys');
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 2 — card grid + orphan fixture
// 3 cards (w:280, h:200) in a row + 1 element (w:880, h:200) below
// ─────────────────────────────────────────────────────────────────────────────

test('AC2/card-grid+orphan — detects the stretched lone last-row card', () => {
  const elements = [
    el('card-1', { x: 0,   y: 0,   w: 280, h: 200 }),
    el('card-2', { x: 300, y: 0,   w: 280, h: 200 }),
    el('card-3', { x: 600, y: 0,   w: 280, h: 200 }),
    el('orphan', { x: 0,   y: 240, w: 880, h: 200 }),
  ];

  const result = detectOrphanStretch(elements);

  assert.strictEqual(result.has_orphan, true, 'has_orphan must be true');
  assert.strictEqual(result.card_width, 280, 'card_width must be 280');
  assert.strictEqual(result.card_count, 3, 'card_count must be 3');
  assert.strictEqual(result.orphans.length, 1, 'exactly one orphan');

  // The orphan selector must be the 880px element
  assert.strictEqual(result.orphans[0].selector, 'orphan', 'orphan selector must be "orphan"');

  // ratio ≈ 880/280 = 3.142…
  assertClose(result.orphans[0].ratio, 880 / 280, 0.05, 'orphan ratio must be ≈ 3.14');

  // Exactly one issue with the right rule and severity
  assert.strictEqual(result.issues.length, 1, 'exactly one issue');
  assert.strictEqual(result.issues[0].rule, 'layout/orphan-stretch', 'issue rule');
  assert.strictEqual(result.issues[0].severity, 'warning', 'issue severity must be "warning"');
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 3 — no-orphan fixture (full last row: 4 cards, all w:280)
// ─────────────────────────────────────────────────────────────────────────────

test('AC3/no-orphan — full last row produces no orphan but reports card metrics', () => {
  const elements = [
    el('card-1', { x: 0,   y: 0, w: 280, h: 200 }),
    el('card-2', { x: 300, y: 0, w: 280, h: 200 }),
    el('card-3', { x: 600, y: 0, w: 280, h: 200 }),
    el('card-4', { x: 900, y: 0, w: 280, h: 200 }),
  ];

  const result = detectOrphanStretch(elements);

  assert.strictEqual(result.has_orphan, false, 'has_orphan must be false');
  assert.deepStrictEqual(result.orphans, [], 'orphans must be empty');
  assert.deepStrictEqual(result.issues, [], 'issues must be empty');

  // Card group is still detected and reported
  assert.strictEqual(result.card_width, 280, 'card_width must be 280 (grid still detected)');
  assert.strictEqual(result.card_count, 4, 'card_count must be 4');
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 4 — no-grid fixture: fewer than 3 same-width elements
// One wide heading + two different-sized blocks
// Must NOT false-positive on arbitrary wide elements
// ─────────────────────────────────────────────────────────────────────────────

test('AC4/no-grid — fewer than 3 same-width elements produces no finding', () => {
  const elements = [
    el('heading',  { x: 0, y: 0,   w: 1200, h: 80  }),
    el('block-a',  { x: 0, y: 120, w: 400,  h: 200 }),
    el('block-b',  { x: 0, y: 360, w: 600,  h: 300 }),
  ];

  const result = detectOrphanStretch(elements);

  assert.strictEqual(result.has_orphan, false, 'has_orphan must be false (no card grid)');
  assert.strictEqual(result.card_width, null, 'card_width must be null (no grid detected)');
  assert.strictEqual(result.card_count, 0, 'card_count must be 0');
  assert.deepStrictEqual(result.issues, [], 'must produce no issues');

  // The wide heading must NOT be in orphans even though it is wider than any 1.5× threshold
  const orphanSelectors = result.orphans.map((o) => o.selector);
  assert.ok(!orphanSelectors.includes('heading'), 'heading must not be flagged as orphan (no card grid)');
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 5 — height-band guard
// 3 cards (w:280, h:200) + full-width footer (w:1200, h:80)
// Footer is wider than 1.5×280 but has a different height — must NOT be flagged
// ─────────────────────────────────────────────────────────────────────────────

test('AC5/height-band-guard — full-width different-height footer is not flagged', () => {
  const elements = [
    el('card-1', { x: 0,   y: 0,   w: 280,  h: 200 }),
    el('card-2', { x: 300, y: 0,   w: 280,  h: 200 }),
    el('card-3', { x: 600, y: 0,   w: 280,  h: 200 }),
    el('footer', { x: 0,   y: 240, w: 1200, h: 80  }),  // wider than 1.5×280, but h=80 ≠ 200
  ];

  const result = detectOrphanStretch(elements);

  assert.strictEqual(result.has_orphan, false, 'has_orphan must be false (footer different height)');

  const orphanSelectors = result.orphans.map((o) => o.selector);
  assert.ok(
    !orphanSelectors.includes('footer'),
    'footer must not appear in orphans (height outside the card H-band)'
  );

  // Card grid is still detected
  assert.strictEqual(result.card_width, 280, 'card grid must still be detected');
  assert.strictEqual(result.card_count, 3, 'card_count must be 3');
});

// ─────────────────────────────────────────────────────────────────────────────
// AC 6 — widthRatio threshold boundary (>=)
// 1.49× card width → NOT an orphan
// 1.5×  card width → IS  an orphan
// A card-width element itself is never an orphan
// ─────────────────────────────────────────────────────────────────────────────

test('AC6/ratio-boundary — element at 1.49×W is NOT an orphan', () => {
  const W = 280;
  const belowThreshold = W * 1.49;  // 417.2

  const elements = [
    el('card-1',  { x: 0,   y: 0,   w: W,              h: 200 }),
    el('card-2',  { x: 300, y: 0,   w: W,              h: 200 }),
    el('card-3',  { x: 600, y: 0,   w: W,              h: 200 }),
    el('not-orphan', { x: 0, y: 240, w: belowThreshold, h: 200 }),
  ];

  const result = detectOrphanStretch(elements);

  assert.strictEqual(result.has_orphan, false, '1.49× must NOT be flagged as orphan');
  const orphanSelectors = result.orphans.map((o) => o.selector);
  assert.ok(
    !orphanSelectors.includes('not-orphan'),
    '1.49× element must not appear in orphans'
  );
});

test('AC6/ratio-boundary — element at exactly 1.5×W IS an orphan (>= boundary)', () => {
  const W = 280;
  const atThreshold = W * 1.5;  // 420

  const elements = [
    el('card-1', { x: 0,   y: 0,   w: W,           h: 200 }),
    el('card-2', { x: 300, y: 0,   w: W,           h: 200 }),
    el('card-3', { x: 600, y: 0,   w: W,           h: 200 }),
    el('is-orphan', { x: 0, y: 240, w: atThreshold, h: 200 }),
  ];

  const result = detectOrphanStretch(elements);

  assert.strictEqual(result.has_orphan, true, '1.5× must be flagged as orphan (>= boundary)');
  const orphanSelectors = result.orphans.map((o) => o.selector);
  assert.ok(
    orphanSelectors.includes('is-orphan'),
    '1.5× element must appear in orphans'
  );
});

test('AC6/cards-never-orphans — card-width elements are never flagged as orphans', () => {
  const W = 280;

  const elements = [
    el('card-1', { x: 0,   y: 0, w: W, h: 200 }),
    el('card-2', { x: 300, y: 0, w: W, h: 200 }),
    el('card-3', { x: 600, y: 0, w: W, h: 200 }),
    el('card-4', { x: 900, y: 0, w: W, h: 200 }),  // a card-width element on a second row
  ];

  const result = detectOrphanStretch(elements);

  // All elements are card-width → none should be orphans
  assert.deepStrictEqual(result.orphans, [], 'card-width elements must never appear in orphans');
  assert.strictEqual(result.has_orphan, false, 'has_orphan must be false when all elements are card-width');
});
