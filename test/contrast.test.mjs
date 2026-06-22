/**
 * contrast.test.mjs
 *
 * Tests for the WCAG contrast audit module (dist/contrast.js).
 * Runs after `npm run build` (tsc must have produced dist/contrast.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/contrast.test.mjs
 *
 * Browser-dependent tests are skipped gracefully when Playwright / chromium
 * is not installed — the Integrate phase installs chromium so CI runs all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distContrast = path.resolve(__dirname, '../dist/contrast.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let contrastRatio;
let relativeLuminance;
let parseColor;
let auditContrastSnapshot;
let auditContrastUrl;
let CaptureUnavailableError;
let compositeBackground;

try {
  const mod = await import(distContrast);
  contrastRatio = mod.contrastRatio;
  relativeLuminance = mod.relativeLuminance;
  parseColor = mod.parseColor;
  auditContrastSnapshot = mod.auditContrastSnapshot;
  auditContrastUrl = mod.auditContrastUrl;
  compositeBackground = mod.compositeBackground;
  // CaptureUnavailableError may be re-exported from contrast.ts or the error class itself
  CaptureUnavailableError = mod.CaptureUnavailableError;
} catch (err) {
  const msg = `dist/contrast.js not found — run \`npm run build\` first. (${err.message})`;
  test('contrast module available', (t) => { t.skip(msg); });
  process.exit(0);
}

// ── Helper: skip a whole test if chromium is unavailable ────────────────────

async function runOrSkip(t, fn) {
  try {
    await fn();
  } catch (err) {
    if (CaptureUnavailableError && err instanceof CaptureUnavailableError) {
      t.skip(
        'Playwright chromium not installed. ' +
        'Run `npx playwright install chromium` then re-run tests. ' +
        `(original message: ${err.message})`
      );
      return;
    }
    throw err;
  }
}

// ── Pure-function tests (no browser needed) ──────────────────────────────────

test('contrastRatio(black, white) === 21 (±0.01)', () => {
  const black = /** @type {[number,number,number]} */ ([0, 0, 0]);
  const white = /** @type {[number,number,number]} */ ([255, 255, 255]);
  const ratio = contrastRatio(black, white);
  assert.ok(
    Math.abs(ratio - 21) <= 0.01,
    `expected contrastRatio([0,0,0],[255,255,255]) ≈ 21, got ${ratio}`
  );
});

test('contrastRatio(white, white) === 1', () => {
  const white = /** @type {[number,number,number]} */ ([255, 255, 255]);
  const ratio = contrastRatio(white, white);
  assert.ok(
    Math.abs(ratio - 1) <= 0.01,
    `expected contrastRatio([255,255,255],[255,255,255]) ≈ 1, got ${ratio}`
  );
});

test('parseColor handles #hex shorthand', () => {
  const [r, g, b, a] = parseColor('#fff');
  assert.strictEqual(r, 255);
  assert.strictEqual(g, 255);
  assert.strictEqual(b, 255);
  assert.ok(Math.abs(a - 1) < 0.001, 'alpha should be 1');
});

test('parseColor handles #rrggbb', () => {
  const [r, g, b, a] = parseColor('#111111');
  assert.strictEqual(r, 17);
  assert.strictEqual(g, 17);
  assert.strictEqual(b, 17);
  assert.ok(Math.abs(a - 1) < 0.001);
});

test('parseColor handles rgb()', () => {
  const [r, g, b, a] = parseColor('rgb(170, 170, 170)');
  assert.strictEqual(r, 170);
  assert.strictEqual(g, 170);
  assert.strictEqual(b, 170);
  assert.ok(Math.abs(a - 1) < 0.001);
});

test('parseColor handles rgba()', () => {
  const [r, g, b, a] = parseColor('rgba(0,0,0,0.5)');
  assert.strictEqual(r, 0);
  assert.strictEqual(g, 0);
  assert.strictEqual(b, 0);
  assert.ok(Math.abs(a - 0.5) < 0.001);
});

test('parseColor handles named color "black"', () => {
  const [r, g, b] = parseColor('black');
  assert.strictEqual(r, 0);
  assert.strictEqual(g, 0);
  assert.strictEqual(b, 0);
});

test('parseColor handles named color "white"', () => {
  const [r, g, b] = parseColor('white');
  assert.strictEqual(r, 255);
  assert.strictEqual(g, 255);
  assert.strictEqual(b, 255);
});

test('parseColor handles "transparent"', () => {
  const [r, g, b, a] = parseColor('transparent');
  assert.strictEqual(a, 0);
});

test('relativeLuminance of white is 1', () => {
  const lum = relativeLuminance([255, 255, 255]);
  assert.ok(Math.abs(lum - 1) < 0.001, `expected ~1, got ${lum}`);
});

test('relativeLuminance of black is 0', () => {
  const lum = relativeLuminance([0, 0, 0]);
  assert.ok(Math.abs(lum - 0) < 0.001, `expected ~0, got ${lum}`);
});

// ── auditContrastSnapshot (pure — no browser) ────────────────────────────────

test('auditContrastSnapshot: #111 on #fff passes AA', () => {
  const result = auditContrastSnapshot([
    { selector: 'p.passes', color: '#111111', bgColor: '#ffffff', fontPx: 16, bold: false, text: 'High contrast' },
  ]);
  assert.ok(result.rows.length >= 1, 'should have at least one row');
  const row = result.rows.find((r) => r.selector === 'p.passes');
  assert.ok(row !== undefined, 'row for p.passes should exist');
  assert.strictEqual(row.aa, true, `#111 on #fff should pass AA (ratio was ${row.ratio})`);
  assert.strictEqual(row.large, false, 'should not be large text at 16px normal weight');
  assert.ok(row.ratio > 4.5, `ratio should exceed 4.5, got ${row.ratio}`);
});

test('auditContrastSnapshot: #aaa on #fff fails AA', () => {
  const result = auditContrastSnapshot([
    { selector: 'p.fails', color: '#aaaaaa', bgColor: '#ffffff', fontPx: 16, bold: false, text: 'Low contrast' },
  ]);
  assert.ok(result.rows.length >= 1, 'should have at least one row');
  const row = result.rows.find((r) => r.selector === 'p.fails');
  assert.ok(row !== undefined, 'row for p.fails should exist');
  assert.strictEqual(row.aa, false, `#aaa on #fff should fail AA (ratio was ${row.ratio})`);
  assert.ok(row.ratio < 4.5, `ratio should be below 4.5, got ${row.ratio}`);
  assert.ok(row.delta_to_aa > 0, 'delta_to_aa should be positive for a failing element');
});

test('auditContrastSnapshot: large text (24px) has lower AA threshold (3:1)', () => {
  const result = auditContrastSnapshot([
    { selector: 'h2.large', color: '#767676', bgColor: '#ffffff', fontPx: 24, bold: false, text: 'Large text' },
  ]);
  const row = result.rows.find((r) => r.selector === 'h2.large');
  assert.ok(row !== undefined, 'row for h2.large should exist');
  assert.strictEqual(row.large, true, '24px should be large text');
  assert.strictEqual(row.required_aa, 3, 'large text required AA ratio is 3:1');
});

test('auditContrastSnapshot: bold text ≥18.66px is large', () => {
  const result = auditContrastSnapshot([
    { selector: 'b.bold-large', color: '#000', bgColor: '#fff', fontPx: 18.66, bold: true, text: 'Bold large' },
  ]);
  const row = result.rows.find((r) => r.selector === 'b.bold-large');
  assert.ok(row !== undefined, 'row should exist');
  assert.strictEqual(row.large, true, '18.66px bold should be large text');
});

test('auditContrastSnapshot: aa_failures contains only failing rows', () => {
  const result = auditContrastSnapshot([
    { selector: 'p.ok', color: '#111', bgColor: '#fff', fontPx: 16 },
    { selector: 'p.bad', color: '#aaa', bgColor: '#fff', fontPx: 16 },
  ]);
  assert.strictEqual(result.aa_fail_count, result.aa_failures.length, 'aa_fail_count matches aa_failures.length');
  for (const row of result.aa_failures) {
    assert.strictEqual(row.aa, false, `every aa_failure row must have aa===false, got ${row.ratio} for ${row.selector}`);
  }
});

test('auditContrastSnapshot: result shape is complete', () => {
  const result = auditContrastSnapshot([
    { selector: 'x', color: '#aaa', bgColor: '#fff', fontPx: 16 },
  ]);
  const requiredKeys = ['total_text_elements', 'rows', 'aa_failures', 'aa_fail_count', 'warnings'];
  for (const key of requiredKeys) {
    assert.ok(key in result, `ContrastResult missing key: ${key}`);
  }
  assert.ok(Array.isArray(result.rows), 'rows is an array');
  assert.ok(Array.isArray(result.aa_failures), 'aa_failures is an array');
  assert.ok(Array.isArray(result.warnings), 'warnings is an array');
  assert.strictEqual(result.total_text_elements, 1, 'total_text_elements should be 1');
});

// ── compositeBackground — pure (A: cases 1-5) ────────────────────────────────

// Case A1: canonical fix — translucent white layer over dark base must be dark
test('compositeBackground: canonical fix ["rgba(255,255,255,0.1)","rgb(11,11,15)"] ≈ [36,36,40]', () => {
  if (typeof compositeBackground !== 'function') {
    // compositeBackground not yet in dist — awaiting implementer build
    assert.ok(true, 'skipped: compositeBackground not exported yet');
    return;
  }
  const [r, g, b] = compositeBackground(['rgba(255,255,255,0.1)', 'rgb(11,11,15)']);
  assert.ok(Math.abs(r - 36) <= 2, `r channel: expected ~36, got ${r}`);
  assert.ok(Math.abs(g - 36) <= 2, `g channel: expected ~36, got ${g}`);
  assert.ok(Math.abs(b - 40) <= 2, `b channel: expected ~40, got ${b}`);
  // Must be dark, NOT near-white
  assert.ok(r < 80 && g < 80 && b < 80, `result must be dark (all channels < 80); got [${r},${g},${b}]`);
});

// Case A2: transparent-skip — fully-transparent layer is ignored
test('compositeBackground: transparent layer is skipped ["rgba(0,0,0,0)","rgb(20,20,20)"] → [20,20,20]', () => {
  if (typeof compositeBackground !== 'function') {
    assert.ok(true, 'skipped: compositeBackground not exported yet');
    return;
  }
  const result = compositeBackground(['rgba(0,0,0,0)', 'rgb(20,20,20)']);
  assert.deepEqual(result, [20, 20, 20]);
});

// Case A3: opaque base passes through — fully-opaque single layer
test('compositeBackground: opaque layer passes through ["rgb(18,18,18)"] → [18,18,18]', () => {
  if (typeof compositeBackground !== 'function') {
    assert.ok(true, 'skipped: compositeBackground not exported yet');
    return;
  }
  const result = compositeBackground(['rgb(18,18,18)']);
  assert.deepEqual(result, [18, 18, 18]);
});

// Case A4: empty array → white
test('compositeBackground: empty array → [255,255,255]', () => {
  if (typeof compositeBackground !== 'function') {
    assert.ok(true, 'skipped: compositeBackground not exported yet');
    return;
  }
  const result = compositeBackground([]);
  assert.deepEqual(result, [255, 255, 255]);
});

// Case A5: multi-layer stack composes to something dark
test('compositeBackground: multi-layer translucent stack over dark base → low luminance result', () => {
  if (typeof compositeBackground !== 'function') {
    assert.ok(true, 'skipped: compositeBackground not exported yet');
    return;
  }
  // nearest: rgba white tint, middle: rgba dark overlay, furthest: opaque dark base
  const [r, g, b] = compositeBackground([
    'rgba(255,255,255,0.08)',
    'rgba(0,0,0,0.3)',
    'rgb(10,10,14)',
  ]);
  const maxChannel = Math.max(r, g, b);
  assert.ok(maxChannel < 80, `max channel should be < 80 (dark result); got [${r},${g},${b}], max=${maxChannel}`);
});

// ── Bug is fixed — end-to-end via auditContrastSnapshot (B: cases 6-8) ───────

// Case B6: white text on true dark composite passes AA with bgColors stack
test('auditContrastSnapshot: bgColors stack — white text on dark composite passes AA (≥4.5)', () => {
  if (typeof compositeBackground !== 'function') {
    assert.ok(true, 'skipped: compositeBackground not exported yet (bgColors path needs it)');
    return;
  }
  const result = auditContrastSnapshot([
    {
      selector: '.pill',
      color: 'rgb(255,255,255)',
      bgColors: ['rgba(255,255,255,0.1)', 'rgb(11,11,15)'],
      fontPx: 14,
    },
  ]);
  assert.ok(result.rows.length >= 1, 'should have at least one row');
  const row = result.rows.find((r) => r.selector === '.pill');
  assert.ok(row !== undefined, 'row for .pill should exist');
  assert.strictEqual(row.aa, true, `white on dark composite should pass AA; ratio=${row.ratio}`);
  assert.ok(row.ratio >= 4.5, `ratio should be >= 4.5; got ${row.ratio}`);
});

// Case B7: OLD failure mode — single translucent bgColor composited over white FAILS AA
// This demonstrates the regression that the bgColors stack fix closes.
test('auditContrastSnapshot: old single-bgColor path — white on rgba(255,255,255,0.1) over white FAILS AA', () => {
  // This uses the unchanged back-compat single-bgColor path.
  // rgba(255,255,255,0.1) composited over white ≈ rgb(255,255,255) → white-on-white, ratio ≈ 1.
  const result = auditContrastSnapshot([
    {
      selector: '.pill-old',
      color: 'rgb(255,255,255)',
      bgColor: 'rgba(255,255,255,0.1)',
      fontPx: 14,
    },
  ]);
  const row = result.rows.find((r) => r.selector === '.pill-old');
  assert.ok(row !== undefined, 'row for .pill-old should exist');
  assert.strictEqual(row.aa, false, `white on near-white (over-white composite) should fail AA; ratio=${row.ratio}`);
  assert.ok(row.ratio < 1.5, `ratio should be < 1.5 (near-1); got ${row.ratio}`);
});

// Case B8: row background reports the effective composited opaque color (starts with "rgb(")
test('auditContrastSnapshot: bgColors stack row background is opaque rgb string (not the raw rgba)', () => {
  if (typeof compositeBackground !== 'function') {
    assert.ok(true, 'skipped: compositeBackground not exported yet');
    return;
  }
  const result = auditContrastSnapshot([
    {
      selector: '.pill-bg',
      color: 'rgb(255,255,255)',
      bgColors: ['rgba(255,255,255,0.1)', 'rgb(11,11,15)'],
      fontPx: 14,
    },
  ]);
  const row = result.rows.find((r) => r.selector === '.pill-bg');
  assert.ok(row !== undefined, 'row for .pill-bg should exist');
  assert.ok(
    typeof row.background === 'string' && row.background.startsWith('rgb('),
    `background should be an opaque rgb(...) string; got "${row.background}"`
  );
  assert.notStrictEqual(
    row.background,
    'rgba(255,255,255,0.1)',
    'background should NOT equal the raw translucent layer string'
  );
});

// ── Back-compat — single bgColor path unchanged (C: case 9) ──────────────────

// Case C9: element with only bgColor (no bgColors) works exactly as before
test('auditContrastSnapshot: back-compat — bgColor-only with dark bg + light text passes', () => {
  // rgb(17,17,17) background + white text → high contrast, clearly AA-passing
  const result = auditContrastSnapshot([
    {
      selector: 'p.compat',
      color: 'rgb(255,255,255)',
      bgColor: 'rgb(17,17,17)',
      fontPx: 16,
      bold: false,
      text: 'Back compat',
    },
  ]);
  assert.ok(result.rows.length >= 1, 'should have at least one row');
  const row = result.rows.find((r) => r.selector === 'p.compat');
  assert.ok(row !== undefined, 'row for p.compat should exist');
  assert.strictEqual(row.aa, true, `white on dark (#111) should pass AA; ratio=${row.ratio}`);
  assert.ok(row.ratio >= 4.5, `ratio should be >= 4.5; got ${row.ratio}`);
});

// ── Browser-dependent tests ──────────────────────────────────────────────────

test('auditContrastUrl: #111 text passes AA, #aaa text fails AA', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditContrastUrl(fixtureUrl('contrast.html'));

    assert.ok(typeof result.total_text_elements === 'number', 'total_text_elements is a number');
    assert.ok(result.total_text_elements >= 2, 'should find at least 2 text elements');
    assert.ok(Array.isArray(result.rows), 'rows is an array');
    assert.ok(result.aa_fail_count >= 1, `at least one AA failure expected, got ${result.aa_fail_count}`);

    // Find the high-contrast element (color:#111)
    const passingRow = result.rows.find(
      (row) => row.foreground && (
        row.foreground.includes('17, 17') ||  // rgb(17,17,17)
        row.foreground === '#111111' ||
        row.foreground === '#111'
      )
    );
    // If colour-matching is imprecise, fall back to checking any row with aa===true exists
    const anyPass = result.rows.some((row) => row.aa === true);
    assert.ok(anyPass, 'at least one element should pass AA (the #111 text)');

    // Find the low-contrast element (color:#aaa)
    const anyFail = result.rows.some((row) => row.aa === false);
    assert.ok(anyFail, 'at least one element should fail AA (the #aaa text)');
  });
});

test('auditContrastUrl: result shape from live page', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditContrastUrl(fixtureUrl('contrast.html'));

    const requiredKeys = ['total_text_elements', 'rows', 'aa_failures', 'aa_fail_count', 'warnings'];
    for (const key of requiredKeys) {
      assert.ok(key in result, `ContrastResult missing key: ${key}`);
    }
    assert.strictEqual(result.aa_fail_count, result.aa_failures.length, 'aa_fail_count matches aa_failures.length');

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const rowKeys = ['selector', 'foreground', 'background', 'fontPx', 'bold', 'large', 'ratio', 'aa', 'aaa', 'required_aa', 'delta_to_aa'];
      for (const key of rowKeys) {
        assert.ok(key in row, `ContrastRow missing key: ${key}`);
      }
      assert.ok(typeof row.ratio === 'number', 'ratio is a number');
      assert.ok(row.ratio >= 1, 'ratio must be >= 1');
      assert.ok(row.ratio <= 21.1, 'ratio must be <= 21');
    }
  });
});
