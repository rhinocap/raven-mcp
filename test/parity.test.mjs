/**
 * parity.test.mjs
 *
 * Tests for auditParity() in dist/parity.js.
 * Runs after `npm run build` (tsc must have produced dist/parity.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distParity = path.resolve(__dirname, '../dist/parity.js');

let auditParity;

try {
  const mod = await import(distParity);
  auditParity = mod.auditParity;
} catch (err) {
  const msg = `dist/parity.js not found - run \`npm run build\` first. (${err.message})`;
  test('parity module available', (t) => { t.skip(msg); });
  process.exit(0);
}

if (typeof auditParity !== 'function') {
  test('auditParity export available', (t) => {
    t.skip('auditParity not exported from dist/parity.js.');
  });
  process.exit(0);
}

function snapshot(elements) {
  return {
    elements,
    viewport: { w: 390, h: 844 },
  };
}

function el(id, x, y, w, h, extras = {}) {
  return {
    id,
    label: id,
    rect: { x, y, w, h },
    ...extras,
  };
}

function verdictFor(result, name) {
  const item = result.results.find((entry) => entry.name === name);
  assert.ok(item, `missing parity result: ${name}`);
  return item.verdict;
}

test('vertically-centered mismatch', () => {
  const ios = snapshot([
    el('hl', 16, 40, 24, 24),
    el('status', 48, 42, 100, 20),
  ]);
  const android = snapshot([
    el('hl', 16, 40, 24, 24),
    el('status', 48, 40, 100, 20),
  ]);

  const result = auditParity(ios, android, [
    { name: 'status centered on icon', a: 'status', b: 'hl', relation: 'vertically-centered', tolerance: 1 },
  ]);

  assert.strictEqual(verdictFor(result, 'status centered on icon'), 'mismatch');
  assert.ok(result.mismatch_count >= 1, 'mismatch_count should include the centered mismatch');
});

test('vertically-centered match', () => {
  const ios = snapshot([
    el('hl', 16, 40, 24, 24),
    el('status', 48, 42, 100, 20),
  ]);
  const android = snapshot([
    el('hl', 16, 72, 24, 24),
    el('status', 48, 74, 100, 20),
  ]);

  const result = auditParity(ios, android, [
    { name: 'status centered on icon', a: 'status', b: 'hl', relation: 'vertically-centered', tolerance: 1 },
  ]);

  assert.strictEqual(verdictFor(result, 'status centered on icon'), 'match');
});

test('present match', () => {
  const ios = snapshot([el('status', 48, 42, 100, 20)]);
  const android = snapshot([el('status', 48, 42, 100, 20)]);

  const result = auditParity(ios, android, [
    { name: 'status present', a: 'status', relation: 'present' },
  ]);

  assert.strictEqual(verdictFor(result, 'status present'), 'match');
});

test('present mismatch', () => {
  const ios = snapshot([el('status', 48, 42, 100, 20)]);
  const android = snapshot([]);

  const result = auditParity(ios, android, [
    { name: 'status present', a: 'status', relation: 'present' },
  ]);

  assert.strictEqual(verdictFor(result, 'status present'), 'mismatch');
});

test('equal-size mismatch', () => {
  const ios = snapshot([el('status', 48, 42, 100, 20)]);
  const android = snapshot([el('status', 48, 42, 112, 26)]);

  const result = auditParity(ios, android, [
    { name: 'status size', a: 'status', relation: 'equal-size', tolerance: 1 },
  ]);

  assert.strictEqual(verdictFor(result, 'status size'), 'mismatch');
});

test('missing element', () => {
  const ios = snapshot([]);
  const android = snapshot([]);

  const result = auditParity(ios, android, [
    { name: 'status present', a: 'status', relation: 'present' },
  ]);

  assert.strictEqual(verdictFor(result, 'status present'), 'uncertain');
});
