/**
 * adversarial.test.mjs
 *
 * Tests for verifyFindings() in dist/capture.js (adversarial verification leg).
 * Runs after `npm run build` (tsc must have produced dist/capture.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/adversarial.test.mjs
 *
 * If Playwright / chromium is not installed, adversarial tests are skipped with
 * a clear diagnostic message rather than failing — the Integrate phase installs
 * chromium so CI will exercise the full suite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCapture = path.resolve(__dirname, '../dist/capture.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

// ── Load built module (fail gracefully if tsc hasn't run yet) ────────────────

let verifyFindings;
let CaptureUnavailableError;

try {
  const mod = await import(distCapture);
  verifyFindings = mod.verifyFindings;
  CaptureUnavailableError = mod.CaptureUnavailableError;
} catch (err) {
  const msg = `dist/capture.js not found — run \`npm run build\` first. (${err.message})`;
  test('capture module available', (t) => { t.skip(msg); });
  process.exit(0);
}

if (typeof verifyFindings !== 'function') {
  test('verifyFindings export available', (t) => {
    t.skip('verifyFindings not exported from dist/capture.js — Leg A may not be merged yet.');
  });
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

test('video-artifact finding against video.html => verdict "likely-artifact"', async (t) => {
  await runOrSkip(t, async () => {
    const findings = [
      {
        key: 'video:0',
        rule: 'video',
        message: 'Video rendered blank (preload=none — unloaded-video-artifact)',
        kind: 'video-artifact',
        selector: '#lazyvid',
      },
    ];

    const verdicts = await verifyFindings(
      { url: fixtureUrl('video.html') },
      findings,
      { viewport: { w: 1440, h: 900 }, timeoutMs: 30000 }
    );

    assert.ok(Array.isArray(verdicts), 'verifyFindings returns an array');
    assert.strictEqual(verdicts.length, 1, 'one verdict for one finding');

    const v = verdicts[0];
    assert.strictEqual(v.key, 'video:0', 'verdict key matches finding key');
    assert.strictEqual(v.verdict, 'likely-artifact', 'video preload=none must be "likely-artifact"');
    assert.ok(typeof v.evidence === 'string' && v.evidence.length > 0, 'evidence is a non-empty string');
  });
});

test('structure/title finding against page WITH a title => "likely-artifact"', async (t) => {
  await runOrSkip(t, async () => {
    // video.html has <title>Video Preload None Fixture</title> — title present
    const findings = [
      {
        key: 'structure/title:0',
        rule: 'structure/title',
        message: 'Page is missing a <title> element.',
        kind: 'issue',
      },
    ];

    const verdicts = await verifyFindings(
      { url: fixtureUrl('video.html') },
      findings,
      { viewport: { w: 1440, h: 900 }, timeoutMs: 30000 }
    );

    assert.strictEqual(verdicts.length, 1, 'one verdict');
    const v = verdicts[0];
    assert.strictEqual(v.key, 'structure/title:0', 'verdict key matches');
    assert.strictEqual(
      v.verdict,
      'likely-artifact',
      'title IS present live — static analysis was wrong, should be likely-artifact'
    );
  });
});

test('structure/title finding against notitle.html (no title) => "confirmed"', async (t) => {
  await runOrSkip(t, async () => {
    const findings = [
      {
        key: 'structure/title:0',
        rule: 'structure/title',
        message: 'Page is missing a <title> element.',
        kind: 'issue',
      },
    ];

    const verdicts = await verifyFindings(
      { url: fixtureUrl('notitle.html') },
      findings,
      { viewport: { w: 1440, h: 900 }, timeoutMs: 30000 }
    );

    assert.strictEqual(verdicts.length, 1, 'one verdict');
    const v = verdicts[0];
    assert.strictEqual(v.key, 'structure/title:0', 'verdict key matches');
    assert.strictEqual(
      v.verdict,
      'confirmed',
      'title is genuinely absent — finding should be "confirmed"'
    );
    assert.ok(typeof v.evidence === 'string' && v.evidence.length > 0, 'evidence is a non-empty string');
  });
});

test('unknown aggregate rule (color/palette-size) => "inconclusive"', async (t) => {
  await runOrSkip(t, async () => {
    const findings = [
      {
        key: 'color/palette-size:0',
        rule: 'color/palette-size',
        message: 'Palette exceeds 5 brand colours (found 8).',
        kind: 'issue',
      },
    ];

    const verdicts = await verifyFindings(
      { url: fixtureUrl('video.html') },
      findings,
      { viewport: { w: 1440, h: 900 }, timeoutMs: 30000 }
    );

    assert.strictEqual(verdicts.length, 1, 'one verdict');
    const v = verdicts[0];
    assert.strictEqual(v.key, 'color/palette-size:0', 'verdict key matches');
    assert.strictEqual(
      v.verdict,
      'inconclusive',
      'aggregate/heuristic rules must be "inconclusive" — no element-level re-check available'
    );
    assert.ok(typeof v.evidence === 'string' && v.evidence.length > 0, 'evidence is a non-empty string');
  });
});

test('verifyFindings with no url or html returns all inconclusive', async (t) => {
  const findings = [
    {
      key: 'video:0',
      rule: 'video',
      message: 'Video rendered blank.',
      kind: 'video-artifact',
    },
    {
      key: 'color/palette-size:0',
      rule: 'color/palette-size',
      message: 'Palette too large.',
      kind: 'issue',
    },
  ];

  // Pass empty target — neither url nor html
  const verdicts = await verifyFindings({}, findings);

  assert.ok(Array.isArray(verdicts), 'returns array');
  assert.strictEqual(verdicts.length, 2, 'one verdict per finding');
  for (const v of verdicts) {
    assert.strictEqual(v.verdict, 'inconclusive', `finding ${v.key} should be inconclusive`);
    assert.ok(v.evidence.includes('unavailable'), `evidence should mention unavailable for ${v.key}`);
  }
});

test('verifyFindings with empty findings array returns empty array', async (t) => {
  const verdicts = await verifyFindings({ url: fixtureUrl('video.html') }, []);
  assert.ok(Array.isArray(verdicts), 'returns array');
  assert.strictEqual(verdicts.length, 0, 'empty findings => empty verdicts');
});
