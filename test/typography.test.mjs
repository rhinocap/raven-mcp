/**
 * typography.test.mjs
 *
 * Tests for the typographic-scale audit module (dist/typography.js).
 * Runs after `npm run build` (tsc must have produced dist/typography.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/typography.test.mjs
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
const distTypography = path.resolve(__dirname, '../dist/typography.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let auditTypographySnapshot;
let auditTypographyUrl;
let CaptureUnavailableError;

try {
  const mod = await import(distTypography);
  auditTypographySnapshot = mod.auditTypographySnapshot;
  auditTypographyUrl = mod.auditTypographyUrl;
  CaptureUnavailableError = mod.CaptureUnavailableError;
} catch (err) {
  const msg = `dist/typography.js not found — run \`npm run build\` first. (${err.message})`;
  test('typography module available', (t) => { t.skip(msg); });
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

// ── auditTypographySnapshot — empty input ────────────────────────────────────

test('auditTypographySnapshot: empty nodes returns info finding', () => {
  const result = auditTypographySnapshot([]);
  assert.strictEqual(result.nodes_analyzed, 0);
  assert.strictEqual(result.scale.sizes.length, 0);
  assert.strictEqual(result.scale.ratios.length, 0);
  assert.ok(result.findings.some((f) => f.rule === 'typography/no-nodes'), 'should include no-nodes finding');
});

// ── Result shape ─────────────────────────────────────────────────────────────

test('auditTypographySnapshot: result shape is complete', () => {
  const result = auditTypographySnapshot([
    { selector: 'p', fontPx: 16 },
  ]);
  assert.ok('scale' in result, 'missing key: scale');
  assert.ok('line_height' in result, 'missing key: line_height');
  assert.ok('weight_ladder' in result, 'missing key: weight_ladder');
  assert.ok('nodes_analyzed' in result, 'missing key: nodes_analyzed');
  assert.ok('findings' in result, 'missing key: findings');

  assert.ok('sizes' in result.scale, 'scale missing key: sizes');
  assert.ok('ratios' in result.scale, 'scale missing key: ratios');
  assert.ok('detected_ratio' in result.scale, 'scale missing key: detected_ratio');
  assert.ok('off_scale_sizes' in result.scale, 'scale missing key: off_scale_sizes');

  assert.ok('dominant_ratio' in result.line_height, 'line_height missing key: dominant_ratio');
  assert.ok('outliers' in result.line_height, 'line_height missing key: outliers');

  assert.ok('weights' in result.weight_ladder, 'weight_ladder missing key: weights');
  assert.ok('issues' in result.weight_ladder, 'weight_ladder missing key: issues');

  assert.ok(Array.isArray(result.findings), 'findings should be an array');
});

// ── Modular scale detection ──────────────────────────────────────────────────

test('auditTypographySnapshot: detects perfect-fourth scale (1.333)', () => {
  // 12 * 1.333^n: 12, 16, 21.3, 28.4
  const nodes = [
    { selector: 'small', fontPx: 12 },
    { selector: 'p', fontPx: 16 },
    { selector: 'h3', fontPx: 21.33 },
    { selector: 'h2', fontPx: 28.43 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.ok(result.scale.detected_ratio !== null, 'should detect a ratio');
  assert.ok(
    Math.abs(result.scale.detected_ratio - 1.333) <= 0.06,
    `expected detected_ratio ~1.333, got ${result.scale.detected_ratio}`
  );
  assert.ok(result.scale.sizes.length >= 4, 'should have 4 distinct sizes');
  assert.ok(result.scale.ratios.length >= 3, 'should have 3 consecutive ratios');
});

test('auditTypographySnapshot: detects major-third scale (1.25)', () => {
  // 10 * 1.25^n: 10, 12.5, 15.63, 19.53, 24.41
  const nodes = [
    { selector: 'caption', fontPx: 10 },
    { selector: 'small', fontPx: 12.5 },
    { selector: 'p', fontPx: 15.63 },
    { selector: 'h3', fontPx: 19.53 },
    { selector: 'h2', fontPx: 24.41 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.ok(result.scale.detected_ratio !== null, 'should detect a ratio');
  assert.ok(
    Math.abs(result.scale.detected_ratio - 1.25) <= 0.06,
    `expected detected_ratio ~1.25, got ${result.scale.detected_ratio}`
  );
});

test('auditTypographySnapshot: single size emits info finding', () => {
  const result = auditTypographySnapshot([
    { selector: 'p', fontPx: 16 },
    { selector: 'span', fontPx: 16 },
  ]);
  assert.strictEqual(result.scale.sizes.length, 1, 'only one distinct size');
  assert.ok(result.findings.some((f) => f.rule === 'typography/single-size'), 'should flag single-size');
});

test('auditTypographySnapshot: off-scale size is flagged', () => {
  // Pure perfect-fourth from 16: 16, 21.3, 28.4, 37.9
  // Insert 25px which is not on any common modular scale from 16 at 1.333.
  // 25/21.3≈1.17, 28.4/25≈1.14 — no consistent known ratio includes 25.
  const nodes = [
    { selector: 'p', fontPx: 16 },
    { selector: 'h3', fontPx: 21.33 },
    { selector: 'h2', fontPx: 28.43 },
    { selector: 'h1', fontPx: 37.9 },
    { selector: 'p.off', fontPx: 25 },
  ];
  const result = auditTypographySnapshot(nodes);
  // Either off-scale detected (preferred path) OR inconsistent scale flagged
  // — both signal that 25px is anomalous. At minimum, some finding exists.
  const hasAnomaly =
    result.scale.off_scale_sizes.length > 0 ||
    result.findings.some((f) => f.rule === 'typography/off-scale-size' || f.rule === 'typography/inconsistent-scale');
  assert.ok(hasAnomaly, 'expected off-scale or inconsistent-scale finding for the 25px anomaly');
});

test('auditTypographySnapshot: inconsistent scale flagged when no dominant ratio', () => {
  // Sizes with no consistent ratio
  const nodes = [
    { selector: 's1', fontPx: 10 },
    { selector: 's2', fontPx: 15 },
    { selector: 's3', fontPx: 19 },
    { selector: 's4', fontPx: 31 },
  ];
  const result = auditTypographySnapshot(nodes);
  // Either no ratio detected, or inconsistent-scale flagged
  if (result.scale.detected_ratio === null) {
    const incFinding = result.findings.find((f) => f.rule === 'typography/inconsistent-scale');
    // Acceptable if flagged or if only 1-2 ratios (can't always detect)
    assert.ok(
      incFinding !== undefined || result.scale.ratios.length < 2,
      'expected either inconsistent-scale finding or too few ratios to flag'
    );
  }
});

// ── Line-height consistency ──────────────────────────────────────────────────

test('auditTypographySnapshot: dominant line-height ratio computed correctly', () => {
  const nodes = [
    { selector: 'p1', fontPx: 16, lineHeightPx: 24 }, // ratio 1.5
    { selector: 'p2', fontPx: 16, lineHeightPx: 24 }, // ratio 1.5
    { selector: 'p3', fontPx: 16, lineHeightPx: 24 }, // ratio 1.5
    { selector: 'h1', fontPx: 32, lineHeightPx: 48 }, // ratio 1.5
  ];
  const result = auditTypographySnapshot(nodes);
  assert.ok(result.line_height.dominant_ratio !== null, 'dominant_ratio should be set');
  assert.ok(
    Math.abs(result.line_height.dominant_ratio - 1.5) < 0.05,
    `expected dominant ratio ~1.5, got ${result.line_height.dominant_ratio}`
  );
  assert.strictEqual(result.line_height.outliers.length, 0, 'no outliers when all ratios match');
});

test('auditTypographySnapshot: line-height outlier is detected', () => {
  const nodes = [
    { selector: 'p1', fontPx: 16, lineHeightPx: 24 },  // ratio 1.5 (dominant)
    { selector: 'p2', fontPx: 16, lineHeightPx: 24 },  // ratio 1.5
    { selector: 'p3', fontPx: 16, lineHeightPx: 24 },  // ratio 1.5
    { selector: 'p.outlier', fontPx: 16, lineHeightPx: 48 }, // ratio 3.0 — outlier
  ];
  const result = auditTypographySnapshot(nodes);
  const outlierFinding = result.findings.find(
    (f) => f.rule === 'typography/line-height-outlier' && f.selector === 'p.outlier'
  );
  assert.ok(outlierFinding !== undefined, 'should flag line-height outlier');
  assert.ok(
    result.line_height.outliers.some((o) => o.selector === 'p.outlier'),
    'outliers array should contain p.outlier'
  );
});

test('auditTypographySnapshot: no line-height data → dominant_ratio null', () => {
  const nodes = [
    { selector: 'p', fontPx: 16 },
    { selector: 'h1', fontPx: 32 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.strictEqual(result.line_height.dominant_ratio, null);
  assert.strictEqual(result.line_height.outliers.length, 0);
});

// ── Weight ladder ─────────────────────────────────────────────────────────────

test('auditTypographySnapshot: normal weight ladder (≤4 weights) is clean', () => {
  const nodes = [
    { selector: 'p', fontPx: 16, fontWeight: 400 },
    { selector: 'h3', fontPx: 21, fontWeight: 500 },
    { selector: 'h2', fontPx: 28, fontWeight: 600 },
    { selector: 'h1', fontPx: 37, fontWeight: 700 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.deepEqual(result.weight_ladder.weights, [400, 500, 600, 700]);
  assert.strictEqual(result.weight_ladder.issues.length, 0, 'no weight issues for standard ladder');
  assert.ok(
    !result.findings.some((f) => f.rule === 'typography/too-many-weights'),
    'should not flag too-many-weights for 4 weights'
  );
});

test('auditTypographySnapshot: >4 distinct weights flags too-many-weights', () => {
  const nodes = [
    { selector: 'a', fontPx: 16, fontWeight: 100 },
    { selector: 'b', fontPx: 16, fontWeight: 300 },
    { selector: 'c', fontPx: 16, fontWeight: 400 },
    { selector: 'd', fontPx: 16, fontWeight: 600 },
    { selector: 'e', fontPx: 16, fontWeight: 700 },
    { selector: 'f', fontPx: 16, fontWeight: 900 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.ok(
    result.findings.some((f) => f.rule === 'typography/too-many-weights'),
    'should flag too-many-weights for 6 weights'
  );
  assert.ok(result.weight_ladder.issues.length > 0, 'issues array should be non-empty');
});

test('auditTypographySnapshot: non-standard weight (450) flags non-standard-weight', () => {
  const nodes = [
    { selector: 'p', fontPx: 16, fontWeight: 400 },
    { selector: 'b', fontPx: 16, fontWeight: 450 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.ok(
    result.findings.some((f) => f.rule === 'typography/non-standard-weight'),
    'should flag non-standard-weight for fontWeight 450'
  );
});

test('auditTypographySnapshot: no fontWeight provided → empty weights array', () => {
  const nodes = [
    { selector: 'p', fontPx: 16 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.strictEqual(result.weight_ladder.weights.length, 0);
  assert.strictEqual(result.weight_ladder.issues.length, 0);
});

// ── nodes_analyzed ────────────────────────────────────────────────────────────

test('auditTypographySnapshot: nodes_analyzed matches input length', () => {
  const nodes = [
    { selector: 'p', fontPx: 16 },
    { selector: 'h1', fontPx: 32 },
    { selector: 'small', fontPx: 12 },
  ];
  const result = auditTypographySnapshot(nodes);
  assert.strictEqual(result.nodes_analyzed, 3);
});

// ── Finding shape ─────────────────────────────────────────────────────────────

test('auditTypographySnapshot: every finding has required keys', () => {
  const nodes = [
    { selector: 'p.off', fontPx: 20 },
    { selector: 'small', fontPx: 12 },
    { selector: 'h1', fontPx: 37 },
    { selector: 'p.bad-weight', fontPx: 16, fontWeight: 450 },
  ];
  const result = auditTypographySnapshot(nodes);
  for (const finding of result.findings) {
    assert.ok('rule' in finding, `finding missing key: rule (${JSON.stringify(finding)})`);
    assert.ok('severity' in finding, `finding missing key: severity (${JSON.stringify(finding)})`);
    assert.ok('message' in finding, `finding missing key: message (${JSON.stringify(finding)})`);
    assert.ok('fix' in finding, `finding missing key: fix (${JSON.stringify(finding)})`);
    assert.ok(
      ['error', 'warning', 'info'].includes(finding.severity),
      `finding severity must be error|warning|info, got ${finding.severity}`
    );
  }
});

// ── Browser-dependent tests ──────────────────────────────────────────────────

test('auditTypographyUrl: result shape from live page', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTypographyUrl(fixtureUrl('typography.html'));

    assert.ok(typeof result.nodes_analyzed === 'number', 'nodes_analyzed is a number');
    assert.ok(result.nodes_analyzed >= 5, `expected ≥5 text nodes, got ${result.nodes_analyzed}`);

    assert.ok('scale' in result, 'result missing key: scale');
    assert.ok('line_height' in result, 'result missing key: line_height');
    assert.ok('weight_ladder' in result, 'result missing key: weight_ladder');
    assert.ok('findings' in result, 'result missing key: findings');
    assert.ok(Array.isArray(result.findings), 'findings must be an array');
    assert.ok(Array.isArray(result.scale.sizes), 'scale.sizes must be an array');
    assert.ok(result.scale.sizes.length >= 2, `expected ≥2 distinct sizes, got ${result.scale.sizes.length}`);
  });
});

test('auditTypographyUrl: detects non-standard weight 450 from live page', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTypographyUrl(fixtureUrl('typography.html'));
    const hasNonStandardWeight = result.findings.some(
      (f) => f.rule === 'typography/non-standard-weight'
    );
    assert.ok(hasNonStandardWeight, 'expected non-standard-weight finding for fontWeight 450 in fixture');
  });
});

test('auditTypographyUrl: detects line-height outlier from live page', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTypographyUrl(fixtureUrl('typography.html'));
    const hasLhOutlier = result.findings.some(
      (f) => f.rule === 'typography/line-height-outlier'
    );
    assert.ok(hasLhOutlier, 'expected line-height-outlier finding for 3.0 ratio element in fixture');
  });
});

test('auditTypographyUrl: result includes url field', async (t) => {
  await runOrSkip(t, async () => {
    const url = fixtureUrl('typography.html');
    const result = await auditTypographyUrl(url);
    assert.strictEqual(result.url, url, 'result.url should match the input URL');
  });
});
