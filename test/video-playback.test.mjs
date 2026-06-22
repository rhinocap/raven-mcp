/**
 * video-playback.test.mjs
 *
 * Tests for the video playback audit module (dist/video-playback.js).
 * Runs after `npm run build` (tsc must have produced dist/video-playback.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/video-playback.test.mjs
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
const distVideoPlayback = path.resolve(__dirname, '../dist/video-playback.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

// ── Load built module (fail with a FAILING test if tsc hasn't run yet) ───────

let classifyVideoPlayback;
let auditVideoPlaybackUrl;
let auditVideoPlaybackSnapshot;
let CaptureUnavailableError;

try {
  const mod = await import(distVideoPlayback);
  classifyVideoPlayback = mod.classifyVideoPlayback;
  auditVideoPlaybackUrl = mod.auditVideoPlaybackUrl;
  auditVideoPlaybackSnapshot = mod.auditVideoPlaybackSnapshot;
  // CaptureUnavailableError may be re-exported from video-playback.ts or
  // imported directly from dist/capture.js — try both.
  CaptureUnavailableError = mod.CaptureUnavailableError;
  if (!CaptureUnavailableError) {
    const captureMod = await import(path.resolve(__dirname, '../dist/capture.js'));
    CaptureUnavailableError = captureMod.CaptureUnavailableError;
  }
} catch (err) {
  const msg = `dist/video-playback.js not found — run \`npm run build\` first. (${err.message})`;
  test('video-playback module available', () => {
    assert.fail(msg);
  });
  process.exit(1);
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

// ── Helper: build a minimal VideoObservation with sane defaults ──────────────

function obs(overrides) {
  return Object.assign(
    {
      selector: 'video',
      hasSource: true,
      readyState: 4,
      networkState: 1,
      errorCode: 0,
      paused: false,
      autoplayBlocked: false,
      currentTimeStart: 0,
      currentTimeEnd: 2,
    },
    overrides
  );
}

// ── Pure classifier tests (AC2) — error states ───────────────────────────────

test('classifyVideoPlayback: errorCode 1 → state=error, reason=aborted', () => {
  const result = classifyVideoPlayback(obs({ errorCode: 1, currentTimeEnd: 0, paused: true }));
  assert.strictEqual(result.state, 'error');
  assert.strictEqual(result.reason, 'aborted');
});

test('classifyVideoPlayback: errorCode 2 → state=error, reason=network-error', () => {
  const result = classifyVideoPlayback(obs({ errorCode: 2, currentTimeEnd: 0, paused: true }));
  assert.strictEqual(result.state, 'error');
  assert.strictEqual(result.reason, 'network-error');
});

test('classifyVideoPlayback: errorCode 3 → state=error, reason=decode-error', () => {
  const result = classifyVideoPlayback(obs({ errorCode: 3, currentTimeEnd: 0, paused: true }));
  assert.strictEqual(result.state, 'error');
  assert.strictEqual(result.reason, 'decode-error');
});

test('classifyVideoPlayback: errorCode 4 → state=error, reason=src-not-supported', () => {
  const result = classifyVideoPlayback(obs({ errorCode: 4, currentTimeEnd: 0, paused: true }));
  assert.strictEqual(result.state, 'error');
  assert.strictEqual(result.reason, 'src-not-supported');
});

// ── Pure classifier tests (AC2) — empty states ───────────────────────────────

test('classifyVideoPlayback: hasSource=false → state=empty, reason=empty-src', () => {
  const result = classifyVideoPlayback(
    obs({ hasSource: false, readyState: 0, networkState: 0, currentTimeEnd: 0, paused: true })
  );
  assert.strictEqual(result.state, 'empty');
  assert.strictEqual(result.reason, 'empty-src');
});

test('classifyVideoPlayback: networkState=3 → state=empty, reason=empty-src', () => {
  const result = classifyVideoPlayback(
    obs({ networkState: 3, readyState: 0, currentTimeEnd: 0, paused: true })
  );
  assert.strictEqual(result.state, 'empty');
  assert.strictEqual(result.reason, 'empty-src');
});

// ── Pure classifier tests (AC2) — playing state ──────────────────────────────

test('classifyVideoPlayback: currentTime advanced + not paused → state=playing, reason=advancing, advanced=true', () => {
  const result = classifyVideoPlayback(
    obs({ currentTimeStart: 0, currentTimeEnd: 2, paused: false })
  );
  assert.strictEqual(result.state, 'playing');
  assert.strictEqual(result.reason, 'advancing');
  assert.strictEqual(result.advanced, true);
});

// ── Pure classifier tests (AC2) — paused states ──────────────────────────────

test('classifyVideoPlayback: readyState≥3, not advancing, autoplayBlocked=true → state=paused, reason=autoplay-blocked', () => {
  const result = classifyVideoPlayback(
    obs({
      readyState: 3,
      paused: true,
      autoplayBlocked: true,
      currentTimeStart: 0,
      currentTimeEnd: 0,
    })
  );
  assert.strictEqual(result.state, 'paused');
  assert.strictEqual(result.reason, 'autoplay-blocked');
});

test('classifyVideoPlayback: readyState≥3, not advancing, autoplayBlocked=false → state=paused, reason=paused', () => {
  const result = classifyVideoPlayback(
    obs({
      readyState: 3,
      paused: true,
      autoplayBlocked: false,
      currentTimeStart: 0,
      currentTimeEnd: 0,
    })
  );
  assert.strictEqual(result.state, 'paused');
  assert.strictEqual(result.reason, 'paused');
});

test('classifyVideoPlayback: readyState=4, not advancing, autoplayBlocked=false → state=paused, reason=paused', () => {
  const result = classifyVideoPlayback(
    obs({
      readyState: 4,
      paused: true,
      autoplayBlocked: false,
      currentTimeStart: 0,
      currentTimeEnd: 0,
    })
  );
  assert.strictEqual(result.state, 'paused');
  assert.strictEqual(result.reason, 'paused');
});

// ── Pure classifier tests (AC2) — stalled state ──────────────────────────────

test('classifyVideoPlayback: has source, readyState=1, not advancing, no error → state=stalled, reason=buffering-or-stalled', () => {
  const result = classifyVideoPlayback(
    obs({
      hasSource: true,
      readyState: 1,
      networkState: 2,
      errorCode: 0,
      paused: false,
      autoplayBlocked: false,
      currentTimeStart: 0,
      currentTimeEnd: 0,
    })
  );
  assert.strictEqual(result.state, 'stalled');
  assert.strictEqual(result.reason, 'buffering-or-stalled');
});

test('classifyVideoPlayback: readyState=2 not advancing → state=stalled', () => {
  const result = classifyVideoPlayback(
    obs({
      hasSource: true,
      readyState: 2,
      errorCode: 0,
      paused: false,
      currentTimeStart: 0,
      currentTimeEnd: 0,
    })
  );
  assert.strictEqual(result.state, 'stalled');
});

// ── Ordering guard tests (AC3) ────────────────────────────────────────────────

test('classifyVideoPlayback: errorCode>0 AND advanced → error wins over playing', () => {
  // Both "error" condition and "playing" condition are true; error must win (first-match order)
  const result = classifyVideoPlayback(
    obs({
      errorCode: 3,
      currentTimeStart: 0,
      currentTimeEnd: 5,
      paused: false,
    })
  );
  assert.strictEqual(result.state, 'error', 'error must beat playing in first-match order');
  assert.strictEqual(result.reason, 'decode-error');
});

test('classifyVideoPlayback: hasSource=false AND readyState=4 → empty wins over paused/playing', () => {
  // readyState=4 and paused=false could imply playing, but hasSource=false must win
  const result = classifyVideoPlayback(
    obs({
      hasSource: false,
      readyState: 4,
      networkState: 0,
      errorCode: 0,
      paused: false,
      currentTimeStart: 0,
      currentTimeEnd: 5,
    })
  );
  assert.strictEqual(result.state, 'empty', 'empty must beat paused/playing in first-match order');
  assert.strictEqual(result.reason, 'empty-src');
});

// ── AC4: advanced flag exactly equals (end - start) > 1e-3 ───────────────────

test('classifyVideoPlayback: advanced=true when delta > 1e-3', () => {
  const result = classifyVideoPlayback(obs({ currentTimeStart: 0, currentTimeEnd: 0.002, paused: false }));
  assert.strictEqual(result.advanced, true);
});

test('classifyVideoPlayback: advanced=false when delta === 1e-3 (not strictly greater)', () => {
  // Exactly 1e-3 is NOT > 1e-3, so advanced must be false
  const result = classifyVideoPlayback(
    obs({ currentTimeStart: 0, currentTimeEnd: 0.001, paused: true, readyState: 3 })
  );
  assert.strictEqual(result.advanced, false);
});

test('classifyVideoPlayback: advanced=false for sub-epsilon delta (0.0005)', () => {
  // 0.0005 < 1e-3 → not advanced
  const result = classifyVideoPlayback(
    obs({
      currentTimeStart: 0,
      currentTimeEnd: 0.0005,
      paused: true,
      readyState: 3,
    })
  );
  assert.strictEqual(result.advanced, false);
  // readyState≥3 and not advanced and not autoplayBlocked → paused
  assert.strictEqual(result.state, 'paused');
});

test('classifyVideoPlayback: advanced=false when delta is 0', () => {
  const result = classifyVideoPlayback(
    obs({ currentTimeStart: 1.5, currentTimeEnd: 1.5, paused: true, readyState: 3 })
  );
  assert.strictEqual(result.advanced, false);
});

// ── Return shape (selector propagation) ──────────────────────────────────────

test('classifyVideoPlayback: selector is propagated to result', () => {
  const result = classifyVideoPlayback(obs({ selector: 'video#hero', currentTimeEnd: 0, paused: true, readyState: 3 }));
  assert.strictEqual(result.selector, 'video#hero');
});

// ── Browser integration test (AC5) — wrap in runOrSkip ───────────────────────

test('auditVideoPlaybackUrl: fixture has 2 videos, broken is not_playing, shape is complete', async (t) => {
  await runOrSkip(t, async () => {
    const r = await auditVideoPlaybackUrl(fixtureUrl('video-playback.html'), { observeMs: 1500 });

    // AC5: total_videos === 2
    assert.strictEqual(r.total_videos, 2, `expected 2 videos, got ${r.total_videos}`);

    // AC5: not_playing_count === not_playing.length
    assert.strictEqual(
      r.not_playing_count,
      r.not_playing.length,
      'not_playing_count must equal not_playing.length'
    );

    // AC5: VideoPlaybackResult shape — all required keys present
    const requiredKeys = [
      'url',
      'total_videos',
      'rows',
      'playing_count',
      'not_playing_count',
      'not_playing',
      'summary',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in r, `VideoPlaybackResult missing key: ${key}`);
    }
    assert.ok(Array.isArray(r.rows), 'rows must be an Array');
    assert.ok(Array.isArray(r.not_playing), 'not_playing must be an Array');
    assert.ok(typeof r.summary === 'string', 'summary must be a string');

    // AC5: the broken video (#broken / does-not-exist.mp4) must appear in not_playing
    // classified as error or empty
    const brokenRow = r.not_playing.find(
      (row) =>
        row.selector === '#broken' ||
        row.selector === 'video#broken' ||
        (row.selector && row.selector.includes('broken'))
    );
    assert.ok(
      brokenRow !== undefined,
      `broken video must be in not_playing. not_playing selectors: [${r.not_playing.map((x) => x.selector).join(', ')}]`
    );
    assert.ok(
      brokenRow.state === 'error' || brokenRow.state === 'empty',
      `broken video must be classified error or empty, got: ${brokenRow.state}`
    );

    // AC5: good video (#good) must NOT be classified error or empty
    // (don't hard-assert playing in case timing flakes in CI, but it must NOT be an error/empty)
    const goodRow = r.rows.find(
      (row) =>
        row.selector === '#good' ||
        row.selector === 'video#good' ||
        (row.selector && row.selector.includes('good'))
    );
    assert.ok(
      goodRow !== undefined,
      `good video must be in rows. row selectors: [${r.rows.map((x) => x.selector).join(', ')}]`
    );
    assert.ok(
      goodRow.state !== 'error' && goodRow.state !== 'empty',
      `good video (clip.webm, autoplay+muted) must not classify as error/empty, got: ${goodRow.state}`
    );

    // Each row must carry the extended keys
    if (r.rows.length > 0) {
      const row = r.rows[0];
      const rowKeys = [
        'selector',
        'state',
        'reason',
        'advanced',
        'readyState',
        'errorCode',
        'paused',
        'currentTimeStart',
        'currentTimeEnd',
      ];
      for (const key of rowKeys) {
        assert.ok(key in row, `row missing key: ${key}`);
      }
    }

    // playing_count + not_playing_count === total_videos
    assert.strictEqual(
      r.playing_count + r.not_playing_count,
      r.total_videos,
      'playing_count + not_playing_count must equal total_videos'
    );
  });
});

// ── auditVideoPlaybackSnapshot — the dom_snapshot aggregation path (no browser, AC6)
// This is the exact function the audit_video_playback handler calls for dom_snapshot
// input. It must build the full VideoPlaybackResult shape (incl. url) without rendering.

test('auditVideoPlaybackSnapshot: classifies observations without a browser and returns full shape', () => {
  const obs = [
    { selector: '#a', hasSource: true, readyState: 4, networkState: 1, errorCode: 0, paused: false, autoplayBlocked: false, currentTimeStart: 0, currentTimeEnd: 1.5 }, // playing
    { selector: '#b', hasSource: true, readyState: 0, networkState: 1, errorCode: 4, paused: true, autoplayBlocked: false, currentTimeStart: 0, currentTimeEnd: 0 },     // error
    { selector: '#c', hasSource: false, readyState: 0, networkState: 3, errorCode: 0, paused: true, autoplayBlocked: false, currentTimeStart: 0, currentTimeEnd: 0 },    // empty
  ];
  const r = auditVideoPlaybackSnapshot(obs);
  const requiredKeys = ['url', 'total_videos', 'rows', 'playing_count', 'not_playing_count', 'not_playing', 'summary'];
  for (const k of requiredKeys) assert.ok(k in r, `result missing key: ${k}`);
  assert.equal(r.url, null, 'dom_snapshot aggregation has no rendered url → null');
  assert.equal(r.total_videos, 3);
  assert.equal(r.playing_count, 1);
  assert.equal(r.not_playing_count, 2);
  assert.equal(r.not_playing.length, r.not_playing_count, 'not_playing_count === not_playing.length');
  assert.equal(r.rows.find((x) => x.selector === '#a').state, 'playing');
  assert.equal(r.rows.find((x) => x.selector === '#b').state, 'error');
  assert.equal(r.rows.find((x) => x.selector === '#c').state, 'empty');
  // round-trips through JSON (the handler returns JSON.stringify)
  assert.doesNotThrow(() => JSON.stringify(r));
});

test('auditVideoPlaybackSnapshot: empty input → 0 videos, valid shape', () => {
  const r = auditVideoPlaybackSnapshot([]);
  assert.equal(r.total_videos, 0);
  assert.equal(r.playing_count, 0);
  assert.equal(r.not_playing_count, 0);
  assert.equal(r.url, null);
  assert.match(r.summary, /No <video>/);
});

test('auditVideoPlaybackSnapshot: passes through a supplied url', () => {
  const r = auditVideoPlaybackSnapshot([], 'https://example.com');
  assert.equal(r.url, 'https://example.com');
});
