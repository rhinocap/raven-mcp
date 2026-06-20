/**
 * content-audit.test.mjs
 *
 * Tests for the content audit module (dist/content-audit.js).
 * Runs after `npm run build` (tsc must have produced dist/content-audit.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/content-audit.test.mjs
 *
 * All tests are pure (no network, no browser) — the module is fully offline-testable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distModule = path.resolve(__dirname, '../dist/content-audit.js');

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let auditContent;
let _resetPrinciplesCache;

try {
  const mod = await import(distModule);
  auditContent = mod.auditContent;
  _resetPrinciplesCache = mod._resetPrinciplesCache;
} catch (err) {
  const msg = `dist/content-audit.js not found — run \`npm run build\` first. (${err.message})`;
  test('content-audit module available', (t) => { t.skip(msg); });
  process.exit(0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Assert all items in result have the required shape. */
function assertResultShape(result) {
  assert.ok(result && typeof result === 'object', 'result is an object');
  assert.ok(Array.isArray(result.items), 'result.items is an array');
  assert.ok(result.summary && typeof result.summary === 'object', 'result.summary exists');
  assert.ok(Array.isArray(result.principles_loaded), 'result.principles_loaded is an array');

  const summaryKeys = ['total', 'pass', 'warn', 'fail'];
  for (const k of summaryKeys) {
    assert.ok(k in result.summary, `summary.${k} present`);
    assert.ok(typeof result.summary[k] === 'number', `summary.${k} is a number`);
  }

  for (const item of result.items) {
    const itemKeys = ['id', 'type', 'text', 'verdict', 'matched_principles', 'issues', 'suggestion'];
    for (const k of itemKeys) {
      assert.ok(k in item, `item.${k} present`);
    }
    assert.ok(['pass', 'warn', 'fail'].includes(item.verdict), `verdict is valid: ${item.verdict}`);
    assert.ok(Array.isArray(item.matched_principles), 'matched_principles is array');
    assert.ok(Array.isArray(item.issues), 'issues is array');
    for (const issue of item.issues) {
      assert.ok('principle' in issue, 'issue.principle present');
      assert.ok('message' in issue, 'issue.message present');
    }
  }
}

/** Find the result item for a given id or index. */
function itemFor(result, idOrIdx) {
  if (typeof idOrIdx === 'number') return result.items[idOrIdx];
  return result.items.find((i) => i.id === idOrIdx);
}

// ── Result shape ─────────────────────────────────────────────────────────────

test('auditContent: returns correct shape for empty input', () => {
  const result = auditContent([]);
  assertResultShape(result);
  assert.strictEqual(result.summary.total, 0);
  assert.strictEqual(result.summary.pass, 0);
  assert.strictEqual(result.summary.warn, 0);
  assert.strictEqual(result.summary.fail, 0);
  assert.deepEqual(result.items, []);
});

test('auditContent: result shape is complete for a single item', () => {
  const result = auditContent([{ id: 'h1', type: 'heading', text: 'Get started' }]);
  assertResultShape(result);
  assert.strictEqual(result.summary.total, 1);
});

test('auditContent: summary totals match item count', () => {
  const items = [
    { id: 'a', type: 'heading', text: 'Track your progress' },
    { id: 'b', type: 'metric', text: '42 users' },
    { id: 'c', type: 'cta', text: 'Click here' },
  ];
  const result = auditContent(items);
  assertResultShape(result);
  assert.strictEqual(result.summary.total, 3);
  assert.strictEqual(
    result.summary.pass + result.summary.warn + result.summary.fail,
    result.summary.total,
    'pass+warn+fail must equal total'
  );
});

// ── CTA / label rules ─────────────────────────────────────────────────────────

test('auditContent: CTA with action verb and ≤4 words passes', () => {
  const result = auditContent([{ id: 'cta-good', type: 'cta', text: 'Save changes' }]);
  const item = itemFor(result, 'cta-good');
  assert.ok(item, 'item found');
  assert.strictEqual(item.verdict, 'pass', `Expected pass, got ${item.verdict}`);
});

test('auditContent: CTA without action verb warns or fails', () => {
  const result = auditContent([{ id: 'cta-bad', type: 'cta', text: 'Your account' }]);
  const item = itemFor(result, 'cta-bad');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Non-verb CTA should not pass');
  assert.ok(item.matched_principles.includes('front-load-meaning'), 'Should flag front-load-meaning');
});

test('auditContent: CTA longer than 4 words warns or fails', () => {
  const result = auditContent([{ id: 'cta-long', type: 'cta', text: 'Please click here to continue your journey' }]);
  const item = itemFor(result, 'cta-long');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Long CTA should not pass');
  const allPrinciples = item.matched_principles;
  assert.ok(
    allPrinciples.includes('front-load-meaning') || allPrinciples.includes('be-specific-not-generic'),
    `Expected front-load-meaning or be-specific-not-generic, got [${allPrinciples.join(', ')}]`
  );
});

test('auditContent: label "Submit" flags be-specific-not-generic', () => {
  const result = auditContent([{ id: 'lbl-generic', type: 'label', text: 'Submit' }]);
  const item = itemFor(result, 'lbl-generic');
  assert.ok(item, 'item found');
  assert.ok(item.matched_principles.includes('be-specific-not-generic'), 'Should flag generic language');
});

test('auditContent: label "Send invoice" passes', () => {
  const result = auditContent([{ id: 'lbl-good', type: 'label', text: 'Send invoice' }]);
  const item = itemFor(result, 'lbl-good');
  assert.ok(item, 'item found');
  assert.strictEqual(item.verdict, 'pass');
});

// ── Heading rules ─────────────────────────────────────────────────────────────

test('auditContent: heading starting with filler word warns or fails', () => {
  const result = auditContent([{ id: 'hd-filler', type: 'heading', text: 'Welcome to your dashboard' }]);
  const item = itemFor(result, 'hd-filler');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Filler opener heading should not pass');
  assert.ok(item.matched_principles.includes('front-load-meaning'), 'Should flag front-load-meaning');
});

test('auditContent: heading with jargon warns or fails', () => {
  const result = auditContent([{ id: 'hd-jargon', type: 'heading', text: 'Leverage our seamless ecosystem' }]);
  const item = itemFor(result, 'hd-jargon');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Jargon heading should not pass');
  assert.ok(item.matched_principles.includes('clarity-over-cleverness'), 'Should flag clarity-over-cleverness');
});

test('auditContent: clear heading passes', () => {
  const result = auditContent([{ id: 'hd-clear', type: 'heading', text: 'Track your workouts' }]);
  const item = itemFor(result, 'hd-clear');
  assert.ok(item, 'item found');
  assert.strictEqual(item.verdict, 'pass');
});

// ── Prose rules ───────────────────────────────────────────────────────────────

test('auditContent: prose with passive voice warns or fails', () => {
  const result = auditContent([{ id: 'prose-passive', type: 'prose', text: 'Your request has been submitted to our team.' }]);
  const item = itemFor(result, 'prose-passive');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Passive prose should not pass');
  assert.ok(item.matched_principles.includes('active-voice'), 'Should flag active-voice');
});

test('auditContent: prose with hedging warns or fails', () => {
  const result = auditContent([{ id: 'prose-hedge', type: 'prose', text: 'This might possibly help you perhaps achieve your goal.' }]);
  const item = itemFor(result, 'prose-hedge');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Hedging prose should not pass');
});

test('auditContent: prose with jargon warns or fails', () => {
  const result = auditContent([{ id: 'prose-jargon', type: 'prose', text: 'We leverage cutting-edge technology to empower your workflow.' }]);
  const item = itemFor(result, 'prose-jargon');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Jargon prose should not pass');
  assert.ok(item.matched_principles.includes('clarity-over-cleverness'), 'Should flag clarity-over-cleverness');
});

test('auditContent: clean short prose passes', () => {
  const result = auditContent([{ id: 'prose-good', type: 'prose', text: 'Connect your device to start tracking your data.' }]);
  const item = itemFor(result, 'prose-good');
  assert.ok(item, 'item found');
  assert.strictEqual(item.verdict, 'pass');
});

// ── Metric rules ──────────────────────────────────────────────────────────────

test('auditContent: metric with number + unit passes', () => {
  const testCases = [
    '42 users',
    '3.2%',
    '$1.2M revenue',
    '100ms response time',
    '2× faster',
    '500 calories burned',
  ];
  for (const text of testCases) {
    const result = auditContent([{ id: 'metric-good', type: 'metric', text }]);
    const item = itemFor(result, 'metric-good');
    assert.strictEqual(item.verdict, 'pass', `Expected pass for metric: "${text}", got ${item.verdict}`);
  }
});

test('auditContent: metric without number fails', () => {
  const result = auditContent([{ id: 'metric-bad', type: 'metric', text: 'Many users' }]);
  const item = itemFor(result, 'metric-bad');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Metric without number should not pass');
  assert.ok(item.matched_principles.includes('be-specific-not-generic'), 'Should flag be-specific-not-generic');
});

test('auditContent: metric without unit fails', () => {
  const result = auditContent([{ id: 'metric-nounit', type: 'metric', text: 'Improved by 42' }]);
  const item = itemFor(result, 'metric-nounit');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Metric without unit should not pass');
});

// ── Outcome rules ─────────────────────────────────────────────────────────────

test('auditContent: outcome with hedging warns or fails', () => {
  const result = auditContent([{ id: 'out-hedge', type: 'outcome', text: 'Users might possibly see improvement.' }]);
  const item = itemFor(result, 'out-hedge');
  assert.ok(item, 'item found');
  assert.notStrictEqual(item.verdict, 'pass', 'Hedging outcome should not pass');
});

test('auditContent: confident outcome passes', () => {
  const result = auditContent([{ id: 'out-good', type: 'outcome', text: 'Users save 3 hours per week on reporting.' }]);
  const item = itemFor(result, 'out-good');
  assert.ok(item, 'item found');
  assert.strictEqual(item.verdict, 'pass');
});

// ── Caption rules ─────────────────────────────────────────────────────────────

test('auditContent: caption that duplicates a heading warns or fails', () => {
  const items = [
    { id: 'hd', type: 'heading', text: 'Track your daily workouts' },
    { id: 'cap', type: 'caption', text: 'Track your daily workouts here' },
  ];
  const result = auditContent(items);
  const cap = itemFor(result, 'cap');
  assert.ok(cap, 'caption item found');
  assert.notStrictEqual(cap.verdict, 'pass', 'Caption duplicating heading should not pass');
  assert.ok(cap.matched_principles.includes('scannable-structure'), 'Should flag scannable-structure');
});

test('auditContent: caption that adds context passes', () => {
  const items = [
    { id: 'hd', type: 'heading', text: 'Monthly summary' },
    { id: 'cap', type: 'caption', text: 'Shows total calories burned, steps taken, and active minutes.' },
  ];
  const result = auditContent(items);
  const cap = itemFor(result, 'cap');
  assert.ok(cap, 'caption item found');
  assert.strictEqual(cap.verdict, 'pass');
});

// ── ID generation ────────────────────────────────────────────────────────────

test('auditContent: items without id get auto-generated ids', () => {
  const result = auditContent([
    { type: 'heading', text: 'Dashboard' },
    { type: 'cta', text: 'Get started' },
  ]);
  assert.strictEqual(result.items[0].id, 'item_0');
  assert.strictEqual(result.items[1].id, 'item_1');
});

test('auditContent: explicit id is preserved', () => {
  const result = auditContent([{ id: 'my-id', type: 'heading', text: 'Dashboard' }]);
  assert.strictEqual(result.items[0].id, 'my-id');
});

// ── Options ──────────────────────────────────────────────────────────────────

test('auditContent: system option is recorded in result', () => {
  const result = auditContent([], { system: 'material' });
  assert.strictEqual(result.system, 'material');
});

test('auditContent: goals option is recorded in result', () => {
  const result = auditContent([], { goals: ['clarity', 'conversion'] });
  assert.deepEqual(result.goals, ['clarity', 'conversion']);
});

test('auditContent: system and goals are absent when not provided', () => {
  const result = auditContent([]);
  assert.ok(!('system' in result), 'system should not be present when not provided');
  assert.ok(!('goals' in result), 'goals should not be present when not provided');
});

// ── Principles loading ────────────────────────────────────────────────────────

test('auditContent: principles_loaded is non-empty (data files found)', () => {
  const result = auditContent([]);
  assert.ok(result.principles_loaded.length > 0, `Should load at least 1 principle, got ${result.principles_loaded.length}`);
});

test('auditContent: issues reference real principle ids', () => {
  const result = auditContent([
    { id: 'p', type: 'prose', text: 'Your request has been submitted. We might process it soon.' },
  ]);
  const item = itemFor(result, 'p');
  const knownIds = result.principles_loaded;
  for (const issue of item.issues) {
    assert.ok(
      knownIds.includes(issue.principle),
      `Issue references unknown principle "${issue.principle}". Known: [${knownIds.join(', ')}]`
    );
  }
});

// ── Suggestion quality ────────────────────────────────────────────────────────

test('auditContent: failing items have non-empty suggestion', () => {
  const result = auditContent([
    { id: 'fail1', type: 'metric', text: 'Many users' },
    { id: 'fail2', type: 'cta', text: 'Click here to learn more about things' },
  ]);
  for (const item of result.items) {
    if (item.verdict !== 'pass') {
      assert.ok(
        typeof item.suggestion === 'string' && item.suggestion.length > 0,
        `Failing item "${item.id}" should have a non-empty suggestion`
      );
    }
  }
});

test('auditContent: passing items have empty suggestion', () => {
  const result = auditContent([{ id: 'good-cta', type: 'cta', text: 'Save changes' }]);
  const item = itemFor(result, 'good-cta');
  assert.strictEqual(item.suggestion, '', `Passing item should have empty suggestion, got "${item.suggestion}"`);
});

// ── Mixed batch ───────────────────────────────────────────────────────────────

test('auditContent: mixed batch produces correct summary counts', () => {
  const items = [
    { id: 'hd', type: 'heading', text: 'Track your workouts' },         // pass
    { id: 'mt', type: 'metric', text: '$1.2M saved' },                  // pass
    { id: 'cta', type: 'cta', text: 'Get started' },                    // pass
    { id: 'prose', type: 'prose', text: 'Your data has been processed.' }, // fail (passive)
    { id: 'lbl', type: 'label', text: 'Click here' },                   // fail
  ];
  const result = auditContent(items);
  assertResultShape(result);
  assert.strictEqual(result.summary.total, 5, 'total should be 5');
  assert.ok(result.summary.fail >= 1, 'at least 1 fail expected');
  assert.ok(result.summary.pass >= 2, 'at least 2 passes expected');
});
