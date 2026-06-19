/**
 * responsive.test.mjs
 *
 * Tests for the responsive visibility audit module (dist/responsive.js).
 * Runs after `npm run build` (tsc must have produced dist/responsive.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/responsive.test.mjs
 *
 * If Playwright / chromium is not installed the browser-dependent tests are
 * skipped with a clear diagnostic — the Integrate phase installs chromium so
 * CI will exercise the full suite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distResponsive = path.resolve(__dirname, '../dist/responsive.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let captureResponsiveVisibility;
let CaptureUnavailableError;

try {
  const mod = await import(distResponsive);
  captureResponsiveVisibility = mod.captureResponsiveVisibility;
  CaptureUnavailableError = mod.CaptureUnavailableError;
} catch (err) {
  const msg = `dist/responsive.js not found — run \`npm run build\` first. (${err.message})`;
  test('responsive module available', (t) => { t.skip(msg); });
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

// ── Tests ────────────────────────────────────────────────────────────────────

test('lede paragraph is flagged as likely-oversight', async (t) => {
  await runOrSkip(t, async () => {
    const result = await captureResponsiveVisibility(
      fixtureUrl('responsive.html'),
      [390, 768, 1440, 2160]
    );

    assert.ok(Array.isArray(result.flagged), 'flagged is an array');
    assert.ok(typeof result.flagged_count === 'number', 'flagged_count is a number');
    assert.ok(typeof result.likely_oversight_count === 'number', 'likely_oversight_count is a number');

    // The lede <p> must appear in flagged as likely-oversight
    const ledeRow = result.flagged.find(
      (row) =>
        row.selector.includes('lede') ||
        (row.selector.includes('p') && !row.isDecorative)
    );
    assert.ok(ledeRow !== undefined, 'lede paragraph must appear in flagged rows');
    assert.strictEqual(
      ledeRow.category,
      'likely-oversight',
      'lede paragraph must be categorised as likely-oversight'
    );
    assert.strictEqual(ledeRow.mobileVisible, false, 'lede must be hidden at mobile breakpoint');
    assert.strictEqual(ledeRow.desktopVisible, true, 'lede must be visible at desktop breakpoint');

    assert.ok(result.likely_oversight_count >= 1, 'at least one likely-oversight element found');
  });
});

test('decorative element is NOT flagged as likely-oversight', async (t) => {
  await runOrSkip(t, async () => {
    const result = await captureResponsiveVisibility(
      fixtureUrl('responsive.html'),
      [390, 768, 1440, 2160]
    );

    // If the decoration div appears in flagged, it must NOT be likely-oversight
    const decorationRows = result.flagged.filter(
      (row) =>
        row.selector.includes('decoration') ||
        (row.isDecorative === true)
    );

    for (const row of decorationRows) {
      assert.notStrictEqual(
        row.category,
        'likely-oversight',
        `decorative element at selector "${row.selector}" must not be categorised as likely-oversight`
      );
    }
  });
});

test('h1 heading is not flagged (always visible)', async (t) => {
  await runOrSkip(t, async () => {
    const result = await captureResponsiveVisibility(
      fixtureUrl('responsive.html'),
      [390, 768, 1440, 2160]
    );

    // The always-visible h1 should not appear in flagged
    const h1Row = result.flagged.find(
      (row) => row.selector.startsWith('h1') || row.selector.includes('[data-testid="heading"]')
    );
    assert.strictEqual(
      h1Row,
      undefined,
      'the always-visible h1 heading must not appear in the flagged list'
    );
  });
});

test('result shape is complete', async (t) => {
  await runOrSkip(t, async () => {
    const result = await captureResponsiveVisibility(
      fixtureUrl('responsive.html'),
      [390, 1440]
    );

    assert.ok(typeof result.url === 'string', 'url is a string');
    assert.ok(Array.isArray(result.breakpoints), 'breakpoints is an array');
    assert.ok(Array.isArray(result.flagged), 'flagged is an array');
    assert.ok(typeof result.flagged_count === 'number', 'flagged_count is a number');
    assert.ok(typeof result.likely_oversight_count === 'number', 'likely_oversight_count is a number');
    assert.ok(Array.isArray(result.warnings), 'warnings is an array');
    assert.strictEqual(result.flagged.length, result.flagged_count, 'flagged_count matches flagged.length');

    if (result.flagged.length > 0) {
      const row = result.flagged[0];
      const requiredRowKeys = [
        'selector', 'hidingClass', 'isContent', 'isDecorative',
        'visibleAt', 'mobileVisible', 'desktopVisible', 'category',
      ];
      for (const key of requiredRowKeys) {
        assert.ok(key in row, `VisibilityRow missing key: ${key}`);
      }
      assert.ok(Array.isArray(row.visibleAt), 'visibleAt is an array');
    }
  });
});
