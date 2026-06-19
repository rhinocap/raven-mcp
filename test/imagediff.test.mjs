/**
 * imagediff.test.mjs
 *
 * Tests for diffScreenshots() in dist/image-diff.js (before/after diff leg).
 * Runs after `npm run build` (tsc must have produced dist/image-diff.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/imagediff.test.mjs
 *
 * Uses pngjs to build synthetic test PNGs in-process — same dependency that
 * image-diff.ts relies on at runtime.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distImageDiff = path.resolve(__dirname, '../dist/image-diff.js');

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let diffScreenshots;

try {
  const mod = await import(distImageDiff);
  diffScreenshots = mod.diffScreenshots;
} catch (err) {
  const msg = `dist/image-diff.js not found — run \`npm run build\` first. (${err.message})`;
  test('image-diff module available', (t) => { t.skip(msg); });
  process.exit(0);
}

if (typeof diffScreenshots !== 'function') {
  test('diffScreenshots export available', (t) => {
    t.skip('diffScreenshots not exported from dist/image-diff.js — Leg B may not be merged yet.');
  });
  process.exit(0);
}

// ── PNG helpers (require pngjs) ───────────────────────────────────────────────

let PNG;
try {
  const pngjs = await import('pngjs');
  PNG = pngjs.PNG;
} catch (err) {
  test('pngjs available for test PNG generation', (t) => {
    t.skip(`pngjs not installed — cannot build synthetic PNGs for image-diff tests. (${err.message})`);
  });
  process.exit(0);
}

/**
 * Build a 40x40 PNG filled with `fillColor` [r,g,b,a],
 * then optionally paint a solid rectangle of `rectColor` [r,g,b,a]
 * at (rx, ry, rw, rh).
 * Returns a base64 string (no data: prefix).
 */
function makePng(fillColor, rect) {
  const W = 40;
  const H = 40;
  const png = new PNG({ width: W, height: H });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (W * y + x) * 4;
      png.data[idx + 0] = fillColor[0];
      png.data[idx + 1] = fillColor[1];
      png.data[idx + 2] = fillColor[2];
      png.data[idx + 3] = fillColor[3] !== undefined ? fillColor[3] : 255;
    }
  }

  if (rect) {
    const { x: rx, y: ry, w: rw, h: rh, color: rc } = rect;
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const idx = (W * y + x) * 4;
        png.data[idx + 0] = rc[0];
        png.data[idx + 1] = rc[1];
        png.data[idx + 2] = rc[2];
        png.data[idx + 3] = rc[3] !== undefined ? rc[3] : 255;
      }
    }
  }

  return PNG.sync.write(png).toString('base64');
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('changed image: 40x40 white with black square => fix_confirmed true, changed_region non-null', async (t) => {
  // before: 40x40 all white
  const before = makePng([255, 255, 255]);
  // after:  40x40 white + 10x10 black square at (5,5)
  const after = makePng([255, 255, 255], { x: 5, y: 5, w: 10, h: 10, color: [0, 0, 0] });

  const result = await diffScreenshots(before, after);

  assert.ok(typeof result === 'object' && result !== null, 'result is an object');
  assert.strictEqual(result.fix_confirmed, true, 'fix_confirmed must be true when pixels changed');
  assert.ok(result.changed_ratio > 0, 'changed_ratio > 0');
  assert.ok(result.changed_region !== null, 'changed_region must be non-null');

  const r = result.changed_region;
  assert.ok(typeof r.x === 'number', 'changed_region.x is a number');
  assert.ok(typeof r.y === 'number', 'changed_region.y is a number');
  assert.ok(typeof r.w === 'number', 'changed_region.w is a number');
  assert.ok(typeof r.h === 'number', 'changed_region.h is a number');

  // The changed region should loosely cover the 10x10 black square at (5,5)
  assert.ok(r.x <= 5, `changed_region.x (${r.x}) should be <= 5`);
  assert.ok(r.y <= 5, `changed_region.y (${r.y}) should be <= 5`);
  assert.ok(r.x + r.w >= 15, `changed_region right edge (${r.x + r.w}) should be >= 15`);
  assert.ok(r.y + r.h >= 15, `changed_region bottom edge (${r.y + r.h}) should be >= 15`);

  // changed_ratio for a 10x10 patch in 40x40 = 100/1600 = 0.0625
  assert.ok(result.changed_ratio > 0.0001, 'changed_ratio should be meaningfully above 0');

  // Result should include expected fields
  assert.ok(typeof result.dimensions_note === 'string', 'dimensions_note is a string');
  assert.ok(Array.isArray(result.dimensions), 'dimensions is an array');
  assert.ok(Array.isArray(result.warnings), 'warnings is an array');
});

test('identical images => fix_confirmed false, changed_region null', async (t) => {
  const before = makePng([255, 255, 255]);
  // same image passed as both before and after
  const result = await diffScreenshots(before, before);

  assert.ok(typeof result === 'object' && result !== null, 'result is an object');
  assert.strictEqual(result.fix_confirmed, false, 'fix_confirmed must be false for identical images');
  assert.strictEqual(result.changed_ratio, 0, 'changed_ratio must be 0 for identical images');
  assert.strictEqual(result.changed_region, null, 'changed_region must be null for identical images');
});

test('ScreenshotDiff shape is complete', async (t) => {
  const before = makePng([200, 200, 200]);
  const after = makePng([200, 200, 200], { x: 0, y: 0, w: 5, h: 5, color: [100, 100, 100] });

  const result = await diffScreenshots(before, after);

  const requiredKeys = [
    'fix_confirmed',
    'changed_ratio',
    'changed_region',
    'dimensions',
    'dimensions_note',
    'warnings',
  ];
  for (const key of requiredKeys) {
    assert.ok(key in result, `ScreenshotDiff missing key: ${key}`);
  }

  assert.ok(typeof result.fix_confirmed === 'boolean', 'fix_confirmed is boolean');
  assert.ok(typeof result.changed_ratio === 'number', 'changed_ratio is number');
  assert.ok(typeof result.dimensions_note === 'string', 'dimensions_note is string');
  assert.ok(Array.isArray(result.dimensions), 'dimensions is array');
  assert.ok(Array.isArray(result.warnings), 'warnings is array');

  // dimensions_note should mention image-derived / proxy
  assert.ok(
    result.dimensions_note.toLowerCase().includes('image-derived') ||
    result.dimensions_note.toLowerCase().includes('proxy'),
    'dimensions_note should mention image-derived or proxy'
  );
});

test('diffScreenshots strips data:image/png;base64, prefix gracefully', async (t) => {
  const before = makePng([255, 255, 255]);
  const after = makePng([255, 255, 255], { x: 2, y: 2, w: 8, h: 8, color: [0, 0, 255] });

  // Prepend the data URL prefix — diffScreenshots must strip it
  const beforeWithPrefix = 'data:image/png;base64,' + before;
  const afterWithPrefix = 'data:image/png;base64,' + after;

  const result = await diffScreenshots(beforeWithPrefix, afterWithPrefix);

  assert.strictEqual(result.fix_confirmed, true, 'fix_confirmed true even with data: prefix');
  assert.ok(result.changed_ratio > 0, 'changed_ratio > 0 even with data: prefix');
});
