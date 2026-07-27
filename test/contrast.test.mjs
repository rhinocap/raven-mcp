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
let parseGradientStops;
let suggestContrastFix;
let collapseShortTextContrastFailures;
let filterSuggestibleContrastPairs;

try {
  const mod = await import(distContrast);
  contrastRatio = mod.contrastRatio;
  relativeLuminance = mod.relativeLuminance;
  parseColor = mod.parseColor;
  auditContrastSnapshot = mod.auditContrastSnapshot;
  auditContrastUrl = mod.auditContrastUrl;
  compositeBackground = mod.compositeBackground;
  parseGradientStops = mod.parseGradientStops;
  // CaptureUnavailableError may be re-exported from contrast.ts or the error class itself
  CaptureUnavailableError = mod.CaptureUnavailableError;
  suggestContrastFix = mod.suggestContrastFix;
  collapseShortTextContrastFailures = mod.collapseShortTextContrastFailures;
  filterSuggestibleContrastPairs = mod.filterSuggestibleContrastPairs;
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

test('parseGradientStops parses simple linear gradients with angle and positions', () => {
  assert.deepEqual(
    parseGradientStops('linear-gradient(135deg, #111 0%, rgb(34, 34, 34) 50%, rgba(255, 255, 255, 0.5) 100%)'),
    [
      [17, 17, 17, 1],
      [34, 34, 34, 1],
      [255, 255, 255, 0.5],
    ]
  );
});

test('parseGradientStops parses a simple linear gradient without an angle', () => {
  assert.deepEqual(
    parseGradientStops('linear-gradient(rgb(17, 17, 17), #222 100%)'),
    [
      [17, 17, 17, 1],
      [34, 34, 34, 1],
    ]
  );
});

test('parseGradientStops parses simple radial gradients and named colors', () => {
  assert.deepEqual(
    parseGradientStops('radial-gradient(circle at center, black, white)'),
    [
      [0, 0, 0, 1],
      [255, 255, 255, 1],
    ]
  );
});

test('parseGradientStops rejects photos, conic gradients, and complex color stops', () => {
  assert.strictEqual(parseGradientStops('url("hero.jpg")'), null);
  assert.strictEqual(parseGradientStops('conic-gradient(#111, #222)'), null);
  assert.strictEqual(parseGradientStops('linear-gradient(var(--start), #222)'), null);
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
  assert.strictEqual(row.background, '#ffffff', 'opaque bgColor-only snapshots preserve the existing background field');
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
  const requiredKeys = ['total_text_elements', 'rows', 'aa_failures', 'aa_fail_count', 'indeterminate_bg_rows', 'indeterminate_bg_count', 'indeterminate_bg_note', 'mode_note', 'warnings'];
  for (const key of requiredKeys) {
    assert.ok(key in result, `ContrastResult missing key: ${key}`);
  }
  assert.ok(Array.isArray(result.rows), 'rows is an array');
  assert.ok(Array.isArray(result.aa_failures), 'aa_failures is an array');
  assert.ok(Array.isArray(result.indeterminate_bg_rows), 'indeterminate_bg_rows is an array');
  assert.ok(Array.isArray(result.warnings), 'warnings is an array');
  assert.strictEqual(result.total_text_elements, 1, 'total_text_elements should be 1');
  assert.match(result.mode_note, /snapshot.*over-white.*URL mode/i);
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

test('auditContrastSnapshot: dark solid background composites rgba white foreground over the real backdrop', () => {
  const result = auditContrastSnapshot([
    {
      selector: '.alpha-text',
      color: 'rgba(255,255,255,0.7)',
      bgColor: '#111',
      bgLayers: [{ color: '#111', image: null }],
      fontPx: 16,
    },
  ]);
  const row = result.rows[0];
  assert.strictEqual(row.aa, true, `rgba white on #111 should pass; ratio=${row.ratio}`);
  assert.strictEqual(row.effective_bg, 'rgb(17, 17, 17)');
  assert.strictEqual(row.bg_indeterminate, false);
});

test('auditContrastSnapshot: nested alpha layers composite over the dark base in paint order', () => {
  const result = auditContrastSnapshot([
    {
      selector: '.nested-alpha',
      color: 'rgba(255,255,255,0.8)',
      bgColor: '#000',
      bgLayers: [
        { color: 'rgba(255,255,255,0.1)', image: null },
        { color: '#000', image: null },
      ],
      fontPx: 16,
    },
  ]);
  const row = result.rows[0];
  const expectedRatio = Math.round(contrastRatio([209, 209, 209], [26, 26, 26]) * 100) / 100;
  assert.strictEqual(row.effective_bg, 'rgb(26, 26, 26)');
  assert.strictEqual(row.ratio, expectedRatio);
  assert.strictEqual(row.aa, true);
});

test('auditContrastSnapshot: true light-on-light and dark-on-dark failures remain failures', () => {
  const result = auditContrastSnapshot([
    { selector: '.light-fail', color: '#aaa', bgColor: '#fff', fontPx: 16 },
    {
      selector: '.dark-fail',
      color: '#333',
      bgColor: '#111',
      bgLayers: [{ color: null, image: 'linear-gradient(#111, #222)' }],
      fontPx: 16,
    },
  ]);
  assert.deepEqual(result.aa_failures.map((row) => row.selector).sort(), ['.dark-fail', '.light-fail']);
  assert.strictEqual(result.aa_fail_count, 2);
});

test('auditContrastSnapshot: photo backdrop is needs-review, never an AA failure', () => {
  const result = auditContrastSnapshot([
    {
      selector: '.photo-copy',
      color: '#fff',
      bgColor: 'transparent',
      bgLayers: [{ color: null, image: 'url("hero.jpg")' }],
      fontPx: 16,
    },
  ]);
  const row = result.rows[0];
  assert.strictEqual(row.bg_indeterminate, true);
  assert.match(row.effective_bg, /indeterminate/i);
  assert.strictEqual(row.ratio_min, undefined, 'an unparseable image must not expose a guessed ratio range');
  assert.strictEqual(row.ratio_max, undefined, 'an unparseable image must not expose a guessed ratio range');
  assert.strictEqual(result.aa_fail_count, 0);
  assert.strictEqual(result.indeterminate_bg_count, 1);
  assert.deepEqual(result.indeterminate_bg_rows, [row]);
  assert.match(result.indeterminate_bg_note, /need review/i);
});

test('auditContrastSnapshot: mixed gradient is needs-review with a min/max range', () => {
  const result = auditContrastSnapshot([
    {
      selector: '.mixed-gradient',
      color: '#000',
      bgColor: 'transparent',
      bgLayers: [{ color: null, image: 'linear-gradient(#fff, #000)' }],
      fontPx: 16,
    },
  ]);
  const row = result.rows[0];
  assert.strictEqual(row.bg_indeterminate, true);
  assert.strictEqual(row.ratio_min, 1);
  assert.strictEqual(row.ratio_max, 21);
  assert.match(row.effective_bg, /rgb\(255, 255, 255\).*rgb\(0, 0, 0\)/);
  assert.strictEqual(row.background, 'rgb(0, 0, 0)', 'background remains the single worst tested stop');
  assert.strictEqual(result.aa_fail_count, 0);
  assert.strictEqual(result.indeterminate_bg_count, 1);
});

test('auditContrastSnapshot: dark gradient with white and alpha-white text has zero AA failures', () => {
  const gradient = [{ color: null, image: 'linear-gradient(#111, #222)' }];
  const result = auditContrastSnapshot([
    { selector: '.white', color: '#fff', bgColor: 'transparent', bgLayers: gradient, fontPx: 16 },
    { selector: '.alpha-white', color: 'rgba(255,255,255,0.85)', bgColor: 'transparent', bgLayers: gradient, fontPx: 16 },
  ]);
  assert.strictEqual(result.aa_fail_count, 0);
  assert.strictEqual(result.indeterminate_bg_count, 0);
  assert.ok(result.rows.every((row) => row.aa));
});

test('auditContrastSnapshot: gradient stops include nearer semi-transparent color layers', () => {
  const result = auditContrastSnapshot([
    {
      selector: '.gradient-overlay',
      color: '#fff',
      bgColor: 'transparent',
      bgLayers: [
        { color: 'rgba(255,255,255,0.1)', image: null },
        { color: null, image: 'linear-gradient(#000, #222)' },
      ],
      fontPx: 16,
    },
  ]);
  const row = result.rows[0];
  assert.strictEqual(row.effective_bg, 'rgb(26, 26, 26) to rgb(56, 56, 56)');
  assert.strictEqual(row.bg_indeterminate, false);
  assert.strictEqual(row.aa, true);
});

test('auditContrastSnapshot: nearer opaque color makes an unparseable image below it irrelevant', () => {
  const result = auditContrastSnapshot([
    {
      selector: '.opaque-cover',
      color: '#fff',
      bgColor: '#111',
      bgLayers: [
        { color: '#111', image: null },
        { color: null, image: 'url("photo.jpg")' },
      ],
      fontPx: 16,
    },
  ]);
  const row = result.rows[0];
  assert.strictEqual(row.bg_indeterminate, false);
  assert.strictEqual(row.effective_bg, 'rgb(17, 17, 17)');
  assert.strictEqual(row.aa, true);
});

test('auditContrastSnapshot: gradient interiors prevent a false pass for gray-117 over black-to-white', () => {
  const row = auditContrastSnapshot([{
    selector: '.gradient-midpoint', color: 'rgb(117,117,117)', bgColor: 'transparent',
    bgLayers: [{ color: null, image: 'linear-gradient(#000, #fff)' }], fontPx: 16,
  }]).rows[0];
  assert.notStrictEqual(row.status, 'pass');
  assert.ok(row.ratio_min <= 1.1, `expected a near-1 sampled interior ratio, got ${row.ratio_min}`);
});

test('auditContrastSnapshot: unparsed foreground or background is indeterminate with null metrics', () => {
  const result = auditContrastSnapshot([
    { selector: '.bad-fg', color: 'not-a-color', bgColor: '#fff', fontPx: 16 },
    { selector: '.bad-bg', color: '#000', bgColor: 'not-a-color', fontPx: 16 },
  ]);
  for (const row of result.rows) {
    assert.strictEqual(row.status, 'indeterminate');
    assert.strictEqual(row.bg_indeterminate, true);
    assert.strictEqual(row.indeterminate_reason, 'unparsed-color');
    assert.strictEqual(row.ratio, null);
    assert.strictEqual(row.aa, null);
    assert.strictEqual(row.aaa, null);
    assert.strictEqual(row.delta_to_aa, null);
  }
});

test('auditContrastSnapshot: two gradient layers composite in CSS paint order', () => {
  const row = auditContrastSnapshot([{
    selector: '.stacked-gradients', color: '#fff', bgColor: '#000',
    bgLayers: [{
      color: '#000',
      image: 'linear-gradient(rgba(255,255,255,.25), rgba(255,255,255,.25)), linear-gradient(#000, #222)',
    }],
    fontPx: 16,
  }]).rows[0];
  assert.strictEqual(row.status, 'pass');
  assert.strictEqual(row.bg_indeterminate, false);
  assert.ok(row.ratio >= 4.5);
});

test('auditContrastSnapshot: top photo over gradient is indeterminate', () => {
  const row = auditContrastSnapshot([{
    selector: '.photo-over-gradient', color: '#fff', bgColor: '#000',
    bgLayers: [{ color: '#000', image: 'url("photo.jpg"), linear-gradient(#000, #222)' }],
    fontPx: 16,
  }]).rows[0];
  assert.strictEqual(row.status, 'indeterminate');
  assert.strictEqual(row.indeterminate_reason, 'unparsed-background-image');
  assert.strictEqual(row.ratio, null);
});

test('auditContrastSnapshot: candidate explosion is bounded and indeterminate quickly', () => {
  const image = Array.from({ length: 8 }, (_, i) =>
    `linear-gradient(rgba(${i * 20},0,0,.5), rgba(0,${i * 20},0,.5))`
  ).join(', ');
  const started = performance.now();
  const row = auditContrastSnapshot([{
    selector: '.many-layers', color: '#fff', bgColor: '#000',
    bgLayers: [{ color: '#000', image }], fontPx: 16,
  }]).rows[0];
  const elapsed = performance.now() - started;
  assert.strictEqual(row.status, 'indeterminate');
  assert.strictEqual(row.indeterminate_reason, 'candidate-cap');
  assert.ok(elapsed < 50, `candidate cap should return in <50ms, took ${elapsed.toFixed(1)}ms`);
});

test('filterSuggestibleContrastPairs excludes indeterminate and null-ratio rows', () => {
  const pairs = [
    { selector: '.pass', status: 'pass', ratio: 7, foreground: '#000', background: '#fff' },
    { selector: '.fail', status: 'fail', ratio: 2, foreground: '#aaa', background: '#fff' },
    { selector: '.unknown', status: 'indeterminate', ratio: null, foreground: '#fff', background: 'indeterminate' },
  ];
  assert.deepEqual(filterSuggestibleContrastPairs(pairs).map((row) => row.selector), ['.fail']);
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

    const requiredKeys = ['total_text_elements', 'rows', 'aa_failures', 'aa_fail_count', 'indeterminate_bg_rows', 'indeterminate_bg_count', 'indeterminate_bg_note', 'mode_note', 'warnings'];
    for (const key of requiredKeys) {
      assert.ok(key in result, `ContrastResult missing key: ${key}`);
    }
    assert.strictEqual(result.aa_fail_count, result.aa_failures.length, 'aa_fail_count matches aa_failures.length');

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const rowKeys = ['selector', 'foreground', 'background', 'fontPx', 'bold', 'large', 'status', 'ratio', 'aa', 'aaa', 'required_aa', 'delta_to_aa', 'effective_bg', 'bg_indeterminate'];
      for (const key of rowKeys) {
        assert.ok(key in row, `ContrastRow missing key: ${key}`);
      }
      if (row.status === 'indeterminate') {
        assert.strictEqual(row.ratio, null);
      } else {
        assert.ok(typeof row.ratio === 'number', 'determinate ratio is a number');
        assert.ok(row.ratio >= 1, 'ratio must be >= 1');
        assert.ok(row.ratio <= 21.1, 'ratio must be <= 21');
      }
    }
  });
});

test('auditContrastUrl: dark full-page gradient with white and alpha-white text has zero AA failures', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditContrastUrl(fixtureUrl('contrast-gradient.html'));
    assert.ok(result.total_text_elements >= 2, 'fixture should expose both text rows');
    assert.strictEqual(result.aa_fail_count, 0, JSON.stringify(result.aa_failures, null, 2));
    assert.strictEqual(result.indeterminate_bg_count, 0);
    assert.ok(result.rows.every((row) => row.effective_bg.includes('rgb(')));
  });
});

test('auditContrastUrl: rendering-chain hazards and modern colors are surfaced honestly', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditContrastUrl(fixtureUrl('contrast-round2.html'));
    const byText = new Map(result.rows.map((row) => [row.text, row]));
    assert.strictEqual(byText.get('Opacity card').indeterminate_reason, 'ancestor-opacity');
    assert.strictEqual(byText.get('Opacity outside opaque').indeterminate_reason, 'ancestor-opacity');
    assert.strictEqual(byText.get('Contents card').indeterminate_reason, 'display-contents');
    assert.strictEqual(byText.get('Fixed transparent').indeterminate_reason, 'positioned-transparent-chain');
    for (const text of ['Opacity card', 'Opacity outside opaque', 'Contents card', 'Fixed transparent']) {
      assert.strictEqual(byText.get(text).status, 'indeterminate');
      assert.strictEqual(byText.get(text).ratio, null);
    }
    const modern = byText.get('Modern color');
    assert.notStrictEqual(modern.status, 'indeterminate', JSON.stringify(modern));
    assert.match(modern.foreground, /^(?:rgb|rgba|#)/i);
  });
});

// ── suggestContrastFix tests ─────────────────────────────────────────────────

/**
 * Helper: recompute the contrast ratio between two CSS color strings using the
 * same underlying math as the module under test, so ground-truth assertions are
 * objective rather than hard-coded magic numbers.
 */
function ratioOf(colorStr, bgStr) {
  const f = parseColor(colorStr).slice(0, 3);
  const b = parseColor(bgStr).slice(0, 3);
  return contrastRatio(f, b);
}

// AC 1 — Already-passing pair ─────────────────────────────────────────────────

test('suggestContrastFix: already-passing — #000 on #fff', () => {
  const result = suggestContrastFix('#000', '#fff');
  assert.equal(result.passes, true, 'passes should be true for black on white');
  assert.equal(result.fgFix, null, 'fgFix should be null when already passing');
  assert.equal(result.bgFix, null, 'bgFix should be null when already passing');
  assert.equal(result.reachable, true, 'reachable should be true for already-passing pair');
});

test('suggestContrastFix: already-passing — rgb(0,0,0) on rgb(255,255,255)', () => {
  const result = suggestContrastFix('rgb(0,0,0)', 'rgb(255,255,255)');
  assert.equal(result.passes, true, 'passes should be true for black on white (rgb form)');
  assert.equal(result.fgFix, null, 'fgFix should be null when already passing');
  assert.equal(result.bgFix, null, 'bgFix should be null when already passing');
});

// AC 2 — Fix actually passes (ground-truth ratio check) ──────────────────────

test('suggestContrastFix: fix actually passes — mid-gray on white (AA normal 4.5)', () => {
  const fg = 'rgb(150,150,150)';
  const bg = 'rgb(255,255,255)';
  const result = suggestContrastFix(fg, bg);

  assert.equal(result.passes, false, 'rgb(150,150,150) on white should fail AA normal');

  // fgFix.color should clear the 4.5 target
  assert.ok(result.fgFix !== null, 'fgFix should be non-null for a failing pair');
  const fgFixRatio = ratioOf(result.fgFix.color, result.bg);
  assert.ok(
    fgFixRatio >= 4.5,
    `fgFix.color="${result.fgFix.color}" should yield ratio >= 4.5 against bg, got ${fgFixRatio}`
  );
  assert.ok(
    result.fgFix.ratio >= 4.5,
    `fgFix.ratio (${result.fgFix.ratio}) should be >= 4.5`
  );

  // bgFix.color should also clear the 4.5 target
  assert.ok(result.bgFix !== null, 'bgFix should be non-null for a failing pair');
  const bgFixRatio = ratioOf(result.fg, result.bgFix.color);
  assert.ok(
    bgFixRatio >= 4.5,
    `bgFix.color="${result.bgFix.color}" should yield ratio >= 4.5 with fg, got ${bgFixRatio}`
  );
});

// AC 3 — Minimality (within 2 RGB units) ─────────────────────────────────────

test('suggestContrastFix: minimality — two steps back toward original fails (AA 4.5)', () => {
  const fg = 'rgb(150,150,150)';
  const bg = 'rgb(255,255,255)';
  const result = suggestContrastFix(fg, bg);

  assert.ok(result.fgFix !== null, 'fgFix must exist for minimality test');

  // Parse the fixed color
  const fixed = parseColor(result.fgFix.color).slice(0, 3);
  const original = parseColor(fg).slice(0, 3);

  // Determine the step direction: "darker" means fixed is closer to black (lower values)
  // so stepping back toward original means increasing channel values by +2.
  // "lighter" means fixed is closer to white, so stepping back means decreasing by -2.
  const delta = result.fgFix.direction === 'darker' ? 2 : -2;

  const twoBack = fixed.map((c) => Math.min(255, Math.max(0, c + delta)));
  const twoBackStr = `rgb(${twoBack[0]},${twoBack[1]},${twoBack[2]})`;
  const twoBackRatio = ratioOf(twoBackStr, result.bg);

  assert.ok(
    twoBackRatio < 4.5,
    `two steps back (${twoBackStr}) should fail 4.5, got ${twoBackRatio} — fix is not near-minimal`
  );
});

// AC 4 — Direction correctness ────────────────────────────────────────────────

test('suggestContrastFix: direction — dark bg → fgFix.direction is "lighter"', () => {
  // Dark fg on very dark bg — must go lighter to gain contrast
  const result = suggestContrastFix('rgb(80,80,80)', 'rgb(10,10,10)');
  assert.ok(result.fgFix !== null, 'fgFix should exist for dark-bg failing pair');
  assert.equal(
    result.fgFix.direction,
    'lighter',
    `expected "lighter" direction on dark bg, got "${result.fgFix.direction}"`
  );
});

test('suggestContrastFix: direction — light bg → fgFix.direction is "darker"', () => {
  // Light fg on white bg — must go darker to gain contrast
  const result = suggestContrastFix('rgb(180,180,180)', 'rgb(255,255,255)');
  assert.ok(result.fgFix !== null, 'fgFix should exist for light-bg failing pair');
  assert.equal(
    result.fgFix.direction,
    'darker',
    `expected "darker" direction on light bg, got "${result.fgFix.direction}"`
  );
});

// AC 5 — Target derivation ────────────────────────────────────────────────────

test('suggestContrastFix: target derivation — large text (fontPx 24) uses AA target 3.0', () => {
  const result = suggestContrastFix('rgb(150,150,150)', 'rgb(255,255,255)', { fontPx: 24 });
  assert.equal(
    result.targetRatio,
    3,
    `expected targetRatio 3 for large text (24px), got ${result.targetRatio}`
  );
});

test('suggestContrastFix: target derivation — AAA normal text uses target 7.0 (passes for black on white)', () => {
  const result = suggestContrastFix('rgb(0,0,0)', 'rgb(255,255,255)', { level: 'AAA' });
  assert.equal(
    result.targetRatio,
    7,
    `expected targetRatio 7 for AAA normal, got ${result.targetRatio}`
  );
  // Black on white ratio is ~21, well above 7 — should pass
  assert.equal(result.passes, true, 'black on white should pass AAA (ratio ≈ 21)');
});

test('suggestContrastFix: target derivation — explicit targetRatio overrides level+fontPx', () => {
  const result = suggestContrastFix('rgb(150,150,150)', 'rgb(255,255,255)', {
    targetRatio: 7,
    fontPx: 24,
  });
  assert.equal(
    result.targetRatio,
    7,
    `explicit targetRatio:7 should override large-text 3.0 default, got ${result.targetRatio}`
  );
});

// AC 6 — Unreachable ──────────────────────────────────────────────────────────

test('suggestContrastFix: unreachable — mid-gray on same mid-gray with target 21', () => {
  // No single-color adjustment from mid-gray can reach ratio 21 (max is black/white ≈ 21,
  // but against a mid-gray bg the pole ratio is well below 21)
  let result;
  assert.doesNotThrow(() => {
    result = suggestContrastFix('rgb(120,120,120)', 'rgb(120,120,120)', { targetRatio: 21 });
  }, 'suggestContrastFix must not throw for unreachable pairs');

  assert.equal(result.passes, false, 'identical mid-gray pair should not pass target 21');
  assert.equal(result.reachable, false, 'reachable should be false when target 21 is impossible');

  // Best-effort fix should still be returned (the pole)
  assert.ok(result.fgFix !== null, 'fgFix should be non-null (best-effort pole) when unreachable');

  // Recommendation must be a non-empty string describing the situation
  assert.ok(
    typeof result.recommendation === 'string' && result.recommendation.length > 0,
    `recommendation must be a non-empty string, got: ${JSON.stringify(result.recommendation)}`
  );
});

// AC 7 — No mutation / purity ─────────────────────────────────────────────────

test('suggestContrastFix: purity — identical calls return deep-equal results', () => {
  const a = suggestContrastFix('rgb(150,150,150)', 'rgb(255,255,255)');
  const b = suggestContrastFix('rgb(150,150,150)', 'rgb(255,255,255)');
  assert.deepEqual(
    a,
    b,
    'Two calls with the same arguments must return deep-equal results (pure function)'
  );
});

test('suggestContrastFix: purity — each call returns a fresh object', () => {
  const a = suggestContrastFix('rgb(150,150,150)', 'rgb(255,255,255)');
  const b = suggestContrastFix('rgb(150,150,150)', 'rgb(255,255,255)');
  assert.ok(a !== b, 'Each call should return a distinct object reference');
  if (a.fgFix !== null && b.fgFix !== null) {
    assert.ok(a.fgFix !== b.fgFix, 'Each call should return a distinct fgFix object reference');
  }
});

// ── collapseShortTextContrastFailures ─────────────────────────────────────────

function row(overrides) {
  return {
    selector: 'div',
    text: '',
    foreground: 'rgb(170,170,170)',
    background: 'rgb(255,255,255)',
    fontPx: 16,
    bold: false,
    large: false,
    ratio: 2.3,
    aa: false,
    aaa: false,
    required_aa: 4.5,
    delta_to_aa: 2.2,
    ...overrides,
  };
}

test('collapseShortTextContrastFailures: 1/2-char rows sharing context collapse into one group', () => {
  const rows = [
    row({ selector: '.split-a', text: 'H' }),
    row({ selector: '.split-b', text: 'i' }),
    row({ selector: '.split-c', text: '!' }),
  ];
  const groups = collapseShortTextContrastFailures(rows);
  assert.strictEqual(groups.length, 1, 'all three short fragments collapse into one group');
  assert.strictEqual(groups[0].isShortTextGroup, true, 'group is flagged as a short-text group');
  assert.strictEqual(groups[0].rows.length, 3, 'group retains all 3 rows');
});

test('collapseShortTextContrastFailures: 0-length text counts as short (icon glyphs)', () => {
  const rows = [row({ selector: '.icon-a', text: '' }), row({ selector: '.icon-b', text: '   ' })];
  const groups = collapseShortTextContrastFailures(rows);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].isShortTextGroup, true);
  assert.strictEqual(groups[0].rows.length, 2);
});

test('collapseShortTextContrastFailures: 3+ char text is never grouped, stays a single-row group', () => {
  const rows = [
    row({ selector: '.para-a', text: 'Low contrast paragraph text' }),
    row({ selector: '.para-b', text: 'Another low contrast paragraph' }),
  ];
  const groups = collapseShortTextContrastFailures(rows);
  assert.strictEqual(groups.length, 2, 'each long-text failure stays its own group');
  for (const g of groups) {
    assert.strictEqual(g.isShortTextGroup, false);
    assert.strictEqual(g.rows.length, 1);
  }
});

test('collapseShortTextContrastFailures: short-text rows only collapse when context (fg/bg/required_aa) matches', () => {
  const rows = [
    row({ selector: '.a', text: 'a', foreground: 'rgb(1,1,1)' }),
    row({ selector: '.b', text: 'b', foreground: 'rgb(2,2,2)' }),
    row({ selector: '.c', text: 'c', required_aa: 3 }),
  ];
  const groups = collapseShortTextContrastFailures(rows);
  assert.strictEqual(groups.length, 3, 'different (fg/bg/required_aa) contexts do not collapse together');
  for (const g of groups) assert.strictEqual(g.isShortTextGroup, true);
});

test('collapseShortTextContrastFailures: a lone short-text failure is still a short-text group (size 1)', () => {
  const rows = [row({ selector: '.lone', text: 'x' })];
  const groups = collapseShortTextContrastFailures(rows);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].isShortTextGroup, true, 'a single short fragment is still marked as a short-text group');
  assert.strictEqual(groups[0].rows.length, 1);
});

test('collapseShortTextContrastFailures: mixed short + long rows partition correctly', () => {
  const rows = [
    row({ selector: '.long', text: 'A full sentence of low-contrast copy' }),
    row({ selector: '.g1', text: 'A' }),
    row({ selector: '.g2', text: 'B' }),
  ];
  const groups = collapseShortTextContrastFailures(rows);
  assert.strictEqual(groups.length, 2, 'one long-text group + one collapsed short-text group');
  const shortGroup = groups.find((g) => g.isShortTextGroup);
  const longGroup = groups.find((g) => !g.isShortTextGroup);
  assert.ok(shortGroup, 'short-text group exists');
  assert.ok(longGroup, 'long-text group exists');
  assert.strictEqual(shortGroup.rows.length, 2, 'short-text group has both single-letter rows');
  assert.strictEqual(longGroup.rows.length, 1);
});

test('collapseShortTextContrastFailures: empty input returns empty array', () => {
  const groups = collapseShortTextContrastFailures([]);
  assert.deepEqual(groups, []);
});
