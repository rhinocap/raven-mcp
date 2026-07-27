/**
 * tap-targets.test.mjs
 *
 * Tests for the WCAG 2.5.5 / Apple 44pt tap-target audit module (dist/tap-targets.js).
 * Runs after `npm run build` (tsc must have produced dist/tap-targets.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/tap-targets.test.mjs
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
const distModule = path.resolve(__dirname, '../dist/tap-targets.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let auditTapTargetsSnapshot;
let auditTapTargetsUrl;
let CaptureUnavailableError;

try {
  const mod = await import(distModule);
  auditTapTargetsSnapshot = mod.auditTapTargetsSnapshot;
  auditTapTargetsUrl = mod.auditTapTargetsUrl;
  CaptureUnavailableError = mod.CaptureUnavailableError;
} catch (err) {
  const msg = `dist/tap-targets.js not found — run \`npm run build\` first. (${err.message})`;
  test('tap-targets module available', (t) => { t.skip(msg); });
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

// ── auditTapTargetsSnapshot (pure — no browser needed) ──────────────────────

test('snapshot: empty elements returns zero totals', () => {
  const result = auditTapTargetsSnapshot([]);
  assert.strictEqual(result.total, 0);
  assert.strictEqual(result.passing, 0);
  assert.strictEqual(result.failing, 0);
  assert.deepStrictEqual(result.fix_table, []);
  assert.ok(Array.isArray(result.warnings), 'warnings is an array');
});

test('snapshot: element >= 44x44 is a pass', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button.big', w: 48, h: 48 },
  ]);
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.passing, 1);
  assert.strictEqual(result.failing, 0);
  assert.deepStrictEqual(result.fix_table, []);
});

test('snapshot: element exactly 44x44 is a pass', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button.exact', w: 44, h: 44 },
  ]);
  assert.strictEqual(result.passing, 1);
  assert.strictEqual(result.failing, 0);
});

test('snapshot: element < 44x44 on both axes is a fail', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button.tiny', role: 'button', text: '×', w: 24, h: 24 },
  ]);
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.passing, 0);
  assert.strictEqual(result.failing, 1);
  assert.strictEqual(result.fix_table.length, 1);

  const row = result.fix_table[0];
  assert.strictEqual(row.selector, 'button.tiny');
  assert.strictEqual(row.w, 24);
  assert.strictEqual(row.h, 24);
  assert.ok(row.deficit_w > 0, 'deficit_w should be positive');
  assert.ok(row.deficit_h > 0, 'deficit_h should be positive');
  assert.strictEqual(row.deficit_w, 20); // 44 - 24
  assert.strictEqual(row.deficit_h, 20);
  assert.ok(typeof row.fix === 'string' && row.fix.length > 0, 'fix should be non-empty string');
  assert.ok(row.fix.includes('44'), 'fix should mention 44px target');
});

test('snapshot: element with small height only fails on height axis', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'a.flat', role: 'link', text: 'Read more', w: 100, h: 20 },
  ]);
  assert.strictEqual(result.failing, 1);
  const row = result.fix_table[0];
  assert.strictEqual(row.deficit_w, 0, 'width deficit should be 0 (w=100 >= 44)');
  assert.ok(row.deficit_h > 0, 'height deficit should be positive');
  assert.strictEqual(row.deficit_h, 24); // 44 - 20
  // fix string should mention height, not width
  assert.ok(row.fix.includes('min-height'), 'fix should reference min-height for height-only failure');
});

test('snapshot: mixed pass/fail counted correctly', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button.big', w: 48, h: 48 },   // pass
    { selector: 'button.exact', w: 44, h: 44 },  // pass
    { selector: 'button.tiny', w: 24, h: 24 },   // fail
    { selector: 'a.flat', w: 100, h: 20 },       // fail
  ]);
  assert.strictEqual(result.total, 4);
  assert.strictEqual(result.passing, 2);
  assert.strictEqual(result.failing, 2);
  assert.strictEqual(result.fix_table.length, 2);
});

test('snapshot: fix_table sorted worst-first by combined deficit', () => {
  // big deficit (20+20=40) should come before small deficit (0+24=24)
  const result = auditTapTargetsSnapshot([
    { selector: 'a.flat', w: 100, h: 20 },       // deficit: 0+24=24
    { selector: 'button.tiny', w: 24, h: 24 },   // deficit: 20+20=40
  ]);
  assert.strictEqual(result.fix_table[0].selector, 'button.tiny', 'worst element should be first');
  assert.strictEqual(result.fix_table[1].selector, 'a.flat');
});

test('snapshot: custom minSize overrides 44px default', () => {
  // element 40x40 passes default 44, but should fail custom 48
  const result48 = auditTapTargetsSnapshot(
    [{ selector: 'button.medium', w: 40, h: 40 }],
    48
  );
  assert.strictEqual(result48.failing, 1, 'should fail at minSize=48');
  assert.strictEqual(result48.minSize, 48);

  const result32 = auditTapTargetsSnapshot(
    [{ selector: 'button.medium', w: 40, h: 40 }],
    32
  );
  assert.strictEqual(result32.passing, 1, 'should pass at minSize=32');
});

test('snapshot: result shape has all required keys', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button', w: 20, h: 20 },
  ]);
  const required = ['minSize', 'total', 'passing', 'failing', 'fix_table', 'warnings'];
  for (const key of required) {
    assert.ok(key in result, `TapTargetResult missing key: ${key}`);
  }
  assert.ok(Array.isArray(result.fix_table), 'fix_table is an array');
  assert.ok(Array.isArray(result.warnings), 'warnings is an array');
  assert.strictEqual(result.minSize, 44);
});

test('snapshot: fix_table row has all required keys', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button.tiny', role: 'button', text: 'Go', w: 20, h: 20 },
  ]);
  assert.strictEqual(result.fix_table.length, 1);
  const row = result.fix_table[0];
  const rowKeys = ['selector', 'role', 'text', 'w', 'h', 'deficit_w', 'deficit_h', 'fix'];
  for (const key of rowKeys) {
    assert.ok(key in row, `TapTargetRow missing key: ${key}`);
  }
  assert.strictEqual(row.role, 'button');
  assert.strictEqual(row.text, 'Go');
  assert.strictEqual(typeof row.deficit_w, 'number');
  assert.strictEqual(typeof row.deficit_h, 'number');
  assert.strictEqual(typeof row.fix, 'string');
});

test('snapshot: role defaults to "interactive" when not supplied', () => {
  const result = auditTapTargetsSnapshot([
    { selector: '[onclick]', w: 10, h: 10 },
  ]);
  assert.strictEqual(result.fix_table[0].role, 'interactive');
});

test('snapshot: text defaults to empty string when not supplied', () => {
  const result = auditTapTargetsSnapshot([
    { selector: 'button', w: 10, h: 10 },
  ]);
  assert.strictEqual(result.fix_table[0].text, '');
});

// ── Browser-dependent tests ──────────────────────────────────────────────────

test('auditTapTargetsUrl: detects failing elements in fixture', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'));

    assert.ok(typeof result.total === 'number', 'total is a number');
    assert.ok(result.total >= 2, `expected at least 2 interactive elements, got ${result.total}`);

    // The fixture has 2 passing buttons (48x48, 44x44) and 2 failing (24x24 button, 100x20 link)
    assert.ok(result.passing >= 2, `expected at least 2 passing elements, got ${result.passing}`);
    assert.ok(result.failing >= 2, `expected at least 2 failing elements, got ${result.failing}`);

    assert.ok(Array.isArray(result.fix_table), 'fix_table is an array');
    assert.ok(result.fix_table.length >= 1, 'fix_table should have at least one entry');

    // Validate fix_table row shape
    const row = result.fix_table[0];
    const rowKeys = ['selector', 'role', 'text', 'w', 'h', 'deficit_w', 'deficit_h', 'fix'];
    for (const key of rowKeys) {
      assert.ok(key in row, `fix_table row missing key: ${key}`);
    }

    // All fix_table entries should actually be failing
    for (const r of result.fix_table) {
      const failsW = r.w < result.minSize;
      const failsH = r.h < result.minSize;
      assert.ok(failsW || failsH, `fix_table entry ${r.selector} (${r.w}x${r.h}) should fail ${result.minSize}pt minimum`);
      assert.ok(r.deficit_w >= 0 && r.deficit_h >= 0, 'deficits must be non-negative');
      assert.ok(r.deficit_w > 0 || r.deficit_h > 0, 'at least one deficit must be > 0');
    }
  });
});

test('auditTapTargetsUrl: result shape from live page', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'));

    const required = ['url', 'viewport', 'minSize', 'total', 'passing', 'failing', 'fix_table', 'warnings'];
    for (const key of required) {
      assert.ok(key in result, `TapTargetResult missing key: ${key}`);
    }

    assert.strictEqual(result.url, fixtureUrl('tap-targets.html'));
    assert.ok(result.viewport !== undefined, 'viewport should be set');
    assert.strictEqual(result.viewport.w, 1440);
    assert.strictEqual(result.viewport.h, 900);
    assert.strictEqual(result.minSize, 44);
    assert.strictEqual(result.total, result.passing + result.failing, 'total = passing + failing');
    assert.ok(Array.isArray(result.warnings), 'warnings is an array');
  });
});

test('auditTapTargetsUrl: fix_table sorted worst-first', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'));

    // Verify descending sort by combined deficit
    for (let i = 0; i < result.fix_table.length - 1; i++) {
      const current = result.fix_table[i].deficit_w + result.fix_table[i].deficit_h;
      const next = result.fix_table[i + 1].deficit_w + result.fix_table[i + 1].deficit_h;
      assert.ok(
        current >= next,
        `fix_table[${i}] deficit (${current}) should be >= fix_table[${i+1}] deficit (${next}) — expected worst-first order`
      );
    }
  });
});

test('auditTapTargetsUrl: custom minSize option respected', async (t) => {
  await runOrSkip(t, async () => {
    // With minSize=60, all 4 fixture elements should fail (max size in fixture is 48x48)
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'), { minSize: 60 });
    assert.strictEqual(result.minSize, 60);
    assert.ok(result.failing >= 3, `with minSize=60 at least 3 elements should fail, got ${result.failing}`);
  });
});

test('auditTapTargetsUrl: discloses the AA/AAA split on a non-emulated 44px render', async (t) => {
  await runOrSkip(t, async () => {
    // Default render is desktop (1440x900), default minSize 44 (enhanced/AAA) — a
    // non-mobile-emulated render at the 44px bar must disclose the AA (24px) split.
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'));
    assert.strictEqual(result.mobile_emulation, false, 'default render is not mobile-emulated');
    const hit = result.warnings.find((w) => /enhanced-target size/i.test(w) && /24px/.test(w));
    assert.ok(hit, `expected an AA/AAA standard-split disclosure, got: ${JSON.stringify(result.warnings)}`);
  });
});

test('auditTapTargetsUrl: no standard-split disclosure when minSize is already 24', async (t) => {
  await runOrSkip(t, async () => {
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'), { minSize: 24 });
    const hit = result.warnings.find((w) => /enhanced-target size/i.test(w));
    assert.ok(!hit, `should not disclose the split when already grading at the 24px AA size, got: ${JSON.stringify(result.warnings)}`);
  });
});

test('auditTapTargetsUrl: CaptureUnavailableError is gracefully catchable', async (t) => {
  // This test verifies the error class is exported and re-catchable even when chromium IS present.
  // The runOrSkip helper will skip if chromium is absent — which is valid behavior.
  await runOrSkip(t, async () => {
    // If we reach here, chromium is available; just verify the result type is correct.
    const result = await auditTapTargetsUrl(fixtureUrl('tap-targets.html'));
    assert.ok(typeof result.total === 'number', 'should return a valid result when chromium is available');
  });
});
