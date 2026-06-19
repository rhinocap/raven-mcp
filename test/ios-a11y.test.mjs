/**
 * ios-a11y.test.mjs
 *
 * Tests for auditIosA11y() in dist/ios-a11y.js.
 * Runs after `npm run build` (tsc must have produced dist/ios-a11y.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIosA11y = path.resolve(__dirname, '../dist/ios-a11y.js');

let auditIosA11y;

try {
  const mod = await import(distIosA11y);
  auditIosA11y = mod.auditIosA11y;
} catch (err) {
  const msg = `dist/ios-a11y.js not found - run \`npm run build\` first. (${err.message})`;
  test('ios-a11y module available', (t) => { t.skip(msg); });
  process.exit(0);
}

if (typeof auditIosA11y !== 'function') {
  test('auditIosA11y export available', (t) => {
    t.skip('auditIosA11y not exported from dist/ios-a11y.js.');
  });
  process.exit(0);
}

function snapshot(elements, options) {
  return {
    elements,
    viewport: { w: 390, h: 844 },
    ...(options ? { options } : {}),
  };
}

function hasError(result, rule) {
  return result.errors.some((issue) => issue.rule === rule);
}

test('button with no label reports missing label', () => {
  const result = auditIosA11y(snapshot([
    { role: 'button', traits: ['button'], rect: { x: 16, y: 16, w: 44, h: 44 } },
  ]));

  assert.ok(hasError(result, 'a11y/missing-label'), 'missing label error should be present');
});

test('button below 44x44 reports touch target error', () => {
  const result = auditIosA11y(snapshot([
    { role: 'button', label: 'Save', traits: ['button'], rect: { x: 16, y: 16, w: 30, h: 30 } },
  ]));

  assert.ok(hasError(result, 'a11y/touch-target'), 'touch target error should be present');
});

test('staticText below WCAG AA contrast reports contrast error', () => {
  const result = auditIosA11y(snapshot([
    { role: 'staticText', label: 'Muted copy', fgColor: '#777777', bgColor: '#FFFFFF' },
  ]));

  assert.ok(hasError(result, 'a11y/contrast'), 'contrast error should be present');
});

test('staticText with high contrast has no contrast error', () => {
  const result = auditIosA11y(snapshot([
    { role: 'staticText', label: 'Readable copy', fgColor: '#000000', bgColor: '#FFFFFF' },
  ]));

  assert.equal(hasError(result, 'a11y/contrast'), false, 'contrast error should not be present');
});

test('dynamic type clipping reports dynamic type error', () => {
  const result = auditIosA11y(snapshot([
    { role: 'staticText', label: 'Scalable copy', dynamicTypeClipped: true },
  ]));

  assert.ok(hasError(result, 'a11y/dynamic-type-clipping'), 'dynamic type clipping error should be present');
});

test('voiceover_order returns labels in element order', () => {
  const result = auditIosA11y(snapshot([
    { role: 'staticText', label: 'First' },
    { role: 'button', label: 'Second', traits: ['button'], rect: { x: 16, y: 16, w: 44, h: 44 } },
    { role: 'staticText', label: 'Third' },
  ]));

  assert.deepStrictEqual(result.voiceover_order, ['First', 'Second', 'Third']);
});

test('clean snapshot grades A with zero errors', () => {
  const result = auditIosA11y(snapshot([
    { role: 'button', label: 'Continue', traits: ['button'], rect: { x: 16, y: 16, w: 44, h: 44 } },
    { role: 'staticText', label: 'Readable copy', fgColor: '#000000', bgColor: '#FFFFFF' },
  ]));

  assert.strictEqual(result.grade, 'A');
  assert.strictEqual(result.errors.length, 0);
});
