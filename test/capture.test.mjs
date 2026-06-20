/**
 * capture.test.mjs
 *
 * Tests for the headless-browser capture module (dist/capture.js).
 * Runs after `npm run build` (tsc must have produced dist/capture.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/capture.test.mjs
 *
 * If Playwright / chromium is not installed, each test is skipped with a
 * clear diagnostic message rather than failing — the Integrate phase installs
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

let capturePage;
let CaptureUnavailableError;
let classifyVideoArtifact;

try {
  const mod = await import(distCapture);
  capturePage = mod.capturePage;
  CaptureUnavailableError = mod.CaptureUnavailableError;
  classifyVideoArtifact = mod.classifyVideoArtifact;
} catch (err) {
  // Module missing means `npm run build` hasn't run — skip all tests.
  const msg = `dist/capture.js not found — run \`npm run build\` first. (${err.message})`;
  test('capture module available', (t) => { t.skip(msg); });
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

test('scroll_settle:false — reveal target does NOT have class "revealed"', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('reveal.html'), {
      scroll_settle: false,
      viewport: { w: 1440, h: 900 },
    });

    // Basic shape checks
    assert.ok(result.url, 'result.url is set');
    assert.ok(typeof result.renderedHtml === 'string', 'renderedHtml is a string');
    assert.ok(typeof result.screenshotBase64 === 'string', 'screenshotBase64 is a string');
    assert.ok(result.screenshotBase64.length > 0, 'screenshotBase64 is non-empty');
    assert.strictEqual(result.scrolledToBottom, false, 'scrolledToBottom should be false');

    // The target element should NOT carry the "revealed" class because we
    // never scrolled it into the IntersectionObserver's viewport.
    assert.ok(
      !result.renderedHtml.includes('class="revealed"') &&
      !result.renderedHtml.includes("class='revealed'"),
      'rendered HTML must NOT contain class="revealed" when scroll_settle is false'
    );
  });
});

test('scroll_settle:true — reveal target HAS class "revealed"', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('reveal.html'), {
      scroll_settle: true,
      viewport: { w: 1440, h: 900 },
    });

    assert.strictEqual(result.scrolledToBottom, true, 'scrolledToBottom should be true');

    // After scroll-settle the IntersectionObserver should have fired and
    // added the "revealed" class to the target element.
    assert.ok(
      result.renderedHtml.includes('revealed'),
      'rendered HTML must contain "revealed" after scroll_settle:true'
    );
  });
});

const VALID_VIDEO_ARTIFACT_REASONS = new Set([
  'preload-none',
  'autoplay-blocked',
  'empty-src',
  'decode-error',
  'unknown',
  // legacy value — may appear in data produced by older versions
  'unloaded-video-artifact',
]);

test('video.html with scroll_settle:true — videoArtifacts contains a discriminated-reason entry', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('video.html'), {
      scroll_settle: true,
      viewport: { w: 1440, h: 900 },
    });

    assert.ok(Array.isArray(result.videoArtifacts), 'videoArtifacts is an array');
    assert.ok(result.videoArtifacts.length >= 1, 'at least one video artifact detected');

    const artifact = result.videoArtifacts[0];
    assert.ok(
      VALID_VIDEO_ARTIFACT_REASONS.has(artifact.reason),
      `artifact.reason "${artifact.reason}" must be one of the known VideoArtifactReason values`
    );
    assert.ok(
      typeof artifact.selector === 'string' && artifact.selector.length > 0,
      'artifact.selector is a non-empty string'
    );
    assert.strictEqual(artifact.renderedBlank, true, 'artifact.renderedBlank must be true');

    // The selector should reference the lazyvid element in some way
    // (could be #lazyvid, video[data-testid="lazyvid"], or video:nth-of-type(1))
    assert.ok(
      artifact.selector.includes('lazyvid') || artifact.selector.includes('video'),
      `artifact.selector "${artifact.selector}" should reference the video element`
    );
  });
});

test('video.html — artifact preload attribute is "none"', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('video.html'), {
      scroll_settle: true,
      viewport: { w: 1440, h: 900 },
    });

    assert.ok(result.videoArtifacts.length >= 1, 'at least one video artifact detected');
    const artifact = result.videoArtifacts[0];
    assert.strictEqual(artifact.preload, 'none', 'preload attr should be "none"');
  });
});

test('CaptureResult shape is complete for a simple page', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('reveal.html'), {
      scroll_settle: false,
    });

    const requiredKeys = [
      'url',
      'renderedHtml',
      'screenshotBase64',
      'viewport',
      'scrolledToBottom',
      'videoArtifacts',
      'warnings',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in result, `CaptureResult missing key: ${key}`);
    }

    assert.ok(typeof result.viewport === 'object', 'viewport is an object');
    assert.ok(typeof result.viewport.w === 'number', 'viewport.w is a number');
    assert.ok(typeof result.viewport.h === 'number', 'viewport.h is a number');
    assert.ok(Array.isArray(result.warnings), 'warnings is an array');
  });
});

// ── classifyVideoArtifact — pure offline unit tests ──────────────────────────
//
// These tests never touch the browser or filesystem. They exercise the
// exported classifier function directly so the classification logic can be
// verified without playwright installed.

test('classifyVideoArtifact — empty currentSrc → "empty-src"', () => {
  assert.strictEqual(
    classifyVideoArtifact({ currentSrc: '', networkState: 1, readyState: 0, preload: 'auto' }),
    'empty-src',
    'empty currentSrc must classify as empty-src'
  );
});

test('classifyVideoArtifact — networkState NETWORK_NO_SOURCE (3) → "empty-src"', () => {
  assert.strictEqual(
    classifyVideoArtifact({ currentSrc: 'https://example.com/v.mp4', networkState: 3, readyState: 0, preload: 'auto' }),
    'empty-src',
    'NETWORK_NO_SOURCE must classify as empty-src'
  );
});

test('classifyVideoArtifact — errorCode set → "decode-error"', () => {
  // MEDIA_ERR_SRC_NOT_SUPPORTED = 4; any positive errorCode should classify as decode-error
  // provided currentSrc is non-empty and networkState is not 3
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: 'https://example.com/v.mp4',
      networkState: 1,
      errorCode: 4,
      readyState: 0,
      preload: 'auto',
    }),
    'decode-error',
    'errorCode=4 must classify as decode-error'
  );
});

test('classifyVideoArtifact — MEDIA_ERR_NETWORK (2) → "decode-error"', () => {
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: 'https://example.com/v.mp4',
      networkState: 2,
      errorCode: 2,
      readyState: 0,
      preload: 'auto',
    }),
    'decode-error',
    'errorCode=2 (MEDIA_ERR_NETWORK) must classify as decode-error'
  );
});

test('classifyVideoArtifact — errorCode 0 is NOT a decode-error', () => {
  // errorCode 0 is the sentinel for "no error" — should not trigger decode-error
  const result = classifyVideoArtifact({
    currentSrc: 'https://example.com/v.mp4',
    networkState: 1,
    errorCode: 0,
    preload: 'none',
    readyState: 0,
  });
  assert.notStrictEqual(result, 'decode-error', 'errorCode=0 must NOT classify as decode-error');
});

test('classifyVideoArtifact — playRejection NotAllowedError → "autoplay-blocked"', () => {
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: 'https://example.com/v.mp4',
      networkState: 1,
      playRejection: 'NotAllowedError',
      preload: 'auto',
      readyState: 0,
    }),
    'autoplay-blocked',
    'NotAllowedError play rejection must classify as autoplay-blocked'
  );
});

test('classifyVideoArtifact — preload=none + readyState<2 → "preload-none"', () => {
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: 'https://example.com/v.mp4',
      networkState: 0,
      preload: 'none',
      readyState: 0,
    }),
    'preload-none',
    'preload=none with readyState<2 must classify as preload-none'
  );
});

test('classifyVideoArtifact — preload=none but readyState>=2 is NOT preload-none', () => {
  // If the video somehow buffered despite preload=none it should not be flagged.
  const result = classifyVideoArtifact({
    currentSrc: 'https://example.com/v.mp4',
    networkState: 1,
    preload: 'none',
    readyState: 2,
  });
  assert.notStrictEqual(result, 'preload-none', 'preload=none with readyState>=2 must NOT be preload-none');
});

test('classifyVideoArtifact — empty-src takes priority over decode-error', () => {
  // Both signals present — empty-src should win (checked first).
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: '',
      networkState: 3,
      errorCode: 4,
      preload: 'auto',
      readyState: 0,
    }),
    'empty-src',
    'empty-src must take priority over decode-error'
  );
});

test('classifyVideoArtifact — empty-src takes priority over autoplay-blocked', () => {
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: '',
      networkState: 1,
      playRejection: 'NotAllowedError',
      preload: 'auto',
      readyState: 0,
    }),
    'empty-src',
    'empty-src must take priority over autoplay-blocked'
  );
});

test('classifyVideoArtifact — decode-error takes priority over autoplay-blocked', () => {
  // No currentSrc issue but both an error code and a play rejection present.
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: 'https://example.com/v.mp4',
      networkState: 1,
      errorCode: 3,
      playRejection: 'NotAllowedError',
      preload: 'auto',
      readyState: 0,
    }),
    'decode-error',
    'decode-error must take priority over autoplay-blocked'
  );
});

test('classifyVideoArtifact — no signals → "unknown"', () => {
  assert.strictEqual(
    classifyVideoArtifact({
      currentSrc: 'https://example.com/v.mp4',
      networkState: 1,
      preload: 'auto',
      readyState: 0,
    }),
    'unknown',
    'no matching signals must classify as unknown'
  );
});

test('classifyVideoArtifact — handles missing/undefined fields gracefully', () => {
  // Minimal probe — should not throw.
  const result = classifyVideoArtifact({});
  assert.ok(
    VALID_VIDEO_ARTIFACT_REASONS.has(result),
    `empty probe must still return a valid reason; got "${result}"`
  );
});
