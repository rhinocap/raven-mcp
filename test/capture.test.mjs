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
let extractStaticTraits;

try {
  const mod = await import(distCapture);
  capturePage = mod.capturePage;
  CaptureUnavailableError = mod.CaptureUnavailableError;
  classifyVideoArtifact = mod.classifyVideoArtifact;
  extractStaticTraits = mod.extractStaticTraits;
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


// The file:// no-browser fallback returns instead of throwing — detect it so
// animation-settle assertions skip (no Animations API there) like runOrSkip does.
function usedFileFallback(result) {
  return result.warnings.some((w) => w.includes('file URL fallback'));
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

test('scroll_settle:true — pauses at each viewport step so every IO-gated scene reveals, then returns to top', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('io-stepwise-reveal.html'), {
      scroll_settle: true,
      viewport: { w: 1200, h: 800 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback cannot exercise IntersectionObserver timing'); return; }
    const revealedCount = (result.renderedHtml.match(/class="scene revealed settled"/g) || []).length;
    assert.strictEqual(revealedCount, 5, 'all initial and dynamically appended IO-gated scenes must reveal and settle');
    assert.strictEqual(result.scrolledToBottom, true, 'scroll settle should report that the bottom was visited');
    assert.strictEqual(result.captureScrollY, 0, 'capture must occur back at the top of the page');
    assert.deepStrictEqual(result.capture_warnings, [], 'fully revealed content must not emit a false-blank warning');
  });
});

test('io-late-bottom-append.html — waits through a late bottom append and reveals the new scene', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('io-late-bottom-append.html'), {
      scroll_settle: true,
      viewport: { w: 1200, h: 800 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback cannot exercise late IntersectionObserver content'); return; }
    assert.strictEqual(result.scrolledToBottom, true, 'late content must settle at the real final bottom');
    assert.ok(
      result.renderedHtml.includes('late-scene revealed'),
      'the scene appended 300ms after first reaching bottom must be revealed before capture'
    );
  });
});

test('unbounded-scroll-growth.html — reports the walk cap without claiming the final bottom', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('unbounded-scroll-growth.html'), {
      scroll_settle: true,
      viewport: { w: 1200, h: 800 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback cannot exercise the scroll walk cap'); return; }
    assert.strictEqual(result.scrolledToBottom, false, 'continuous growth through the grace window must not report bottom reached');
    assert.ok(
      result.capture_warnings.some((warning) => warning.includes('scroll-settle-cap-reached: stepwise reveal walk exceeded 2000ms')),
      `expected the computed 2000ms walk-cap warning, got ${JSON.stringify(result.capture_warnings)}`
    );
  });
});

// ── animation-settle ─────────────────────────────────────────────────────────

test('entrance-animation.html — finite entrance animation settles before capture (animationsSettled true)', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('entrance-animation.html'), {
      viewport: { w: 1440, h: 900 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, true, 'animationsSettled should be true once the finite entrance animation completes');

    // The hero's `animationend` listener adds this class — if it is present in the
    // captured HTML, capture genuinely waited for the animation to finish rather
    // than firing immediately.
    assert.ok(
      result.renderedHtml.includes('animation-done'),
      'rendered HTML must contain "animation-done" once the entrance animation has settled'
    );
    assert.deepStrictEqual(result.capture_warnings, [], 'settled entrance content must not be flagged false-blank');
  });
});

test('entrance-animation.html — infinite spinner does not block animation-settle', async (t) => {
  await runOrSkip(t, async () => {
    const startedAt = Date.now();
    const result = await capturePage(fixtureUrl('entrance-animation.html'), {
      viewport: { w: 1440, h: 900 },
    });
    const elapsedMs = Date.now() - startedAt;

    // The page also contains an `infinite` spinner animation; settle must still
    // report true (the spinner is excluded from the running/finite check) rather
    // than hanging for the full 3s cap.
    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, true, 'an infinite-loop animation must not block animation-settle');
    assert.ok(elapsedMs < 2800, `infinite spinner must not consume the 3s settle cap (elapsed ${elapsedMs}ms)`);
  });
});

test('delayed-entrance-animation.html — an animation starting 150ms after load is included in settle', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('delayed-entrance-animation.html'), {
      viewport: { w: 1200, h: 800 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, true);
    assert.ok(
      result.renderedHtml.includes('transition-done'),
      'capture must wait for the delayed opacity transition to end'
    );
  });
});

test('scroll-timeline-animation.html — scroll-driven animation does not consume the animation cap', async (t) => {
  await runOrSkip(t, async () => {
    const startedAt = Date.now();
    const result = await capturePage(fixtureUrl('scroll-timeline-animation.html'), {
      viewport: { w: 1200, h: 800 },
    });
    const elapsedMs = Date.now() - startedAt;

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, true, 'non-document timelines must not block settle');
    assert.ok(elapsedMs < 2800, `scroll-driven animation must not consume the 3s cap (elapsed ${elapsedMs}ms)`);
  });
});

test('permanently-hidden.html — capture completes without waiting and emits a false-blank warning', async (t) => {
  await runOrSkip(t, async () => {
    const startedAt = Date.now();
    const result = await capturePage(fixtureUrl('permanently-hidden.html'), {
      viewport: { w: 1200, h: 800 },
    });
    const elapsedMs = Date.now() - startedAt;

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback cannot inspect computed visibility'); return; }
    assert.ok(elapsedMs < 2800, `permanently hidden content must not consume the settle cap (elapsed ${elapsedMs}ms)`);
    assert.ok(Array.isArray(result.capture_warnings), 'capture_warnings must be an additive array field');
    assert.ok(
      result.capture_warnings.some((warning) => /^reveal-gate-false-blank: \d+% of text\/content nodes invisible at capture$/.test(warning)),
      `expected false-blank warning, got ${JSON.stringify(result.capture_warnings)}`
    );
  });
});

test('false-blank-exclusions.html — intentional hidden and clipped content does not trigger the reveal gate', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('false-blank-exclusions.html'), {
      viewport: { w: 1200, h: 800 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback cannot inspect computed visibility'); return; }
    assert.ok(
      !result.capture_warnings.some((warning) => warning.startsWith('reveal-gate-false-blank:')),
      `intentional non-rendered content and gradient text must be excluded, got ${JSON.stringify(result.capture_warnings)}`
    );
  });
});

test('long-entrance-animation.html — settle wait times out but capture still succeeds (animationsSettled false)', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('long-entrance-animation.html'), {
      viewport: { w: 1440, h: 900 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, false, 'animationsSettled should be false when a finite animation outlives the settle cap');
    // Capture must not fail/throw — it should still return a full result.
    assert.ok(typeof result.screenshotBase64 === 'string' && result.screenshotBase64.length > 0, 'screenshot is still produced after a settle timeout');
    assert.ok(typeof result.renderedHtml === 'string' && result.renderedHtml.length > 0, 'rendered HTML is still produced after a settle timeout');
  });
});

test('scroll_settle preserves an all-page animation timeout in capture metadata', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('long-entrance-animation.html'), {
      scroll_settle: true,
      viewport: { w: 1440, h: 900 },
    });

    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, false, 'a scroll-settle timeout must not be overwritten by the later viewport settle');
    assert.ok(
      result.capture_warnings.some((warning) => warning.startsWith('scroll-animation-settle-cap-reached:')),
      `expected scroll animation cap warning, got ${JSON.stringify(result.capture_warnings)}`
    );
  });
});

test('animation_settle_timeout_ms:0 remains bounded instead of disabling the Playwright timeout', async (t) => {
  await runOrSkip(t, async () => {
    const startedAt = Date.now();
    const result = await capturePage(fixtureUrl('long-entrance-animation.html'), {
      animation_settle_timeout_ms: 0,
    });
    const elapsedMs = Date.now() - startedAt;
    if (usedFileFallback(result)) { t.skip('browser unavailable — file:// fallback has no Animations API'); return; }
    assert.strictEqual(result.animationsSettled, false);
    assert.ok(elapsedMs < 2800, `zero timeout must stay bounded (elapsed ${elapsedMs}ms)`);
  });
});

test('CaptureResult includes animationsSettled boolean alongside scrolledToBottom', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('reveal.html'), {
      scroll_settle: true,
    });

    assert.ok('animationsSettled' in result, 'CaptureResult missing key: animationsSettled');
    assert.strictEqual(typeof result.animationsSettled, 'boolean', 'animationsSettled is a boolean');
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
      'animationsSettled',
      'captureScrollY',
      'capture_warnings',
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

test('file URL fallback marks reveal and settle checks as unavailable', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('reveal.html'), {
      scroll_settle: true,
    });
    if (!usedFileFallback(result)) { t.skip('browser available — fallback path not used'); return; }
    assert.ok(
      result.capture_warnings.includes('capture-integrity: browser unavailable — reveal/settle checks not run'),
      `fallback must carry an integrity warning, got ${JSON.stringify(result.capture_warnings)}`
    );
  });
});

// ── PageTraits capture ───────────────────────────────────────────────────────

test('collectTraits captures a dark WebGL-ish page with canvas, animation, and motion cues', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('traits-dark-webgl.html'), {
      scroll_settle: true,
      collectTraits: true,
      viewport: { w: 1440, h: 900 },
    });

    assert.ok(result.traits, 'traits should be attached when collectTraits:true');
    if (usedFileFallback(result)) {
      assert.strictEqual(result.traits.source, 'static');
      assert.strictEqual(result.traits.scheme, 'dark');
      assert.ok(result.traits.canvas_count >= 1, 'static fallback should count the canvas');
      assert.strictEqual(result.traits.webgl, null, 'static fallback cannot prove WebGL');
      assert.strictEqual(result.traits.backdrop_filter, true, 'static fallback should detect backdrop-filter');
      assert.ok(result.traits.gradient_count >= 1, 'static fallback should detect CSS gradients');
      return;
    }

    assert.strictEqual(result.traits.source, 'live');
    assert.strictEqual(result.traits.scheme, 'dark');
    assert.ok(result.traits.bg_luminance < 0.35, `dark background luminance expected; got ${result.traits.bg_luminance}`);
    assert.ok(result.traits.canvas_count >= 1, 'canvas_count should include the WebGL canvas');
    assert.strictEqual(result.traits.webgl, true, 'webgl should be detected from the canvas');
    assert.strictEqual(result.traits.backdrop_filter, true, 'backdrop_filter should detect the glass panel');
    assert.ok(result.traits.animation_count >= 1, 'animation_count should include the infinite canvas pulse');
    assert.strictEqual(result.traits.scroll_effects, true, 'scroll_effects should detect offscreen transform/opacity cues');
    assert.ok(result.traits.gradient_count >= 1, 'gradient_count should detect CSS gradients');
    assert.ok(result.traits.max_heading_px >= 80, `max heading should be hero-sized; got ${result.traits.max_heading_px}`);
    assert.ok(result.traits.viewport_fill > 0, 'viewport_fill should be computed for the first viewport');
  });
});

test('collectTraits captures a light sparse page without canvas or animation', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('traits-light-sparse.html'), {
      collectTraits: true,
      viewport: { w: 1440, h: 900 },
    });

    assert.ok(result.traits, 'traits should be attached when collectTraits:true');
    if (usedFileFallback(result)) {
      assert.strictEqual(result.traits.source, 'static');
      assert.strictEqual(result.traits.scheme, 'light');
      assert.strictEqual(result.traits.canvas_count, 0, 'static fallback should see no canvas');
      assert.strictEqual(result.traits.webgl, null, 'static fallback cannot prove WebGL');
      assert.strictEqual(result.traits.image_count, 0, 'static fallback should see no images');
      assert.strictEqual(result.traits.video_count, 0, 'static fallback should see no videos');
      assert.strictEqual(result.traits.backdrop_filter, false, 'static fallback should see no backdrop-filter');
      return;
    }

    assert.strictEqual(result.traits.source, 'live');
    assert.strictEqual(result.traits.scheme, 'light');
    assert.ok(result.traits.bg_luminance > 0.6, `light background luminance expected; got ${result.traits.bg_luminance}`);
    assert.strictEqual(result.traits.canvas_count, 0, 'light sparse fixture has no canvas');
    assert.strictEqual(result.traits.webgl, false, 'webgl should be false when there are no canvases');
    assert.strictEqual(result.traits.image_count, 0, 'light sparse fixture has no images');
    assert.strictEqual(result.traits.video_count, 0, 'light sparse fixture has no videos');
    assert.strictEqual(result.traits.backdrop_filter, false, 'light sparse fixture has no backdrop-filter');
    assert.strictEqual(result.traits.scroll_effects, false, 'light sparse fixture has no offscreen motion cues');
    assert.ok(result.traits.section_count >= 1, 'section_count should include semantic sections');
    assert.ok(result.traits.text_density > 0, 'text_density should be computed from visible text');
  });
});

test('extractStaticTraits detects static dark visual traits from an HTML string', () => {
  const traits = extractStaticTraits(`
    <html>
      <head>
        <style>
          body { background: #050505; font-family: "IBM Plex Mono", monospace; }
          .panel { backdrop-filter: blur(12px); background: linear-gradient(#111, #333); }
        </style>
      </head>
      <body>
        <div class="loader" role="progressbar"></div>
        <main><section><img src="hero.png" alt=""><canvas></canvas><video src="clip.mp4"></video></section></main>
      </body>
    </html>
  `);

  assert.strictEqual(traits.source, 'static');
  assert.strictEqual(traits.scheme, 'dark');
  assert.ok(traits.bg_luminance < 0.35, `dark static luminance expected; got ${traits.bg_luminance}`);
  assert.strictEqual(traits.section_count, 2, 'section_count should include main and section tags');
  assert.strictEqual(traits.image_count, 1);
  assert.strictEqual(traits.video_count, 1);
  assert.strictEqual(traits.canvas_count, 1);
  assert.strictEqual(traits.webgl, null, 'static extraction cannot prove WebGL');
  assert.strictEqual(traits.backdrop_filter, true);
  assert.strictEqual(traits.gradient_count, 1);
  assert.strictEqual(traits.loader_hint, true);
  assert.deepStrictEqual(traits.font_families, ['IBM Plex Mono']);
  assert.strictEqual(traits.animation_count, null);
  assert.strictEqual(traits.scroll_effects, null);
  assert.strictEqual(traits.max_heading_px, null);
  assert.strictEqual(traits.viewport_fill, null);
});

test('extractStaticTraits returns unknown scheme and safe defaults when static background is not parseable', () => {
  const traits = extractStaticTraits(`
    <html>
      <head><style>.card { background: var(--surface); }</style></head>
      <body><section><p>Plain content</p></section></body>
    </html>
  `);

  assert.strictEqual(traits.source, 'static');
  assert.strictEqual(traits.scheme, 'unknown');
  assert.strictEqual(traits.bg_luminance, null);
  assert.strictEqual(traits.section_count, 1);
  assert.strictEqual(traits.image_count, 0);
  assert.strictEqual(traits.video_count, 0);
  assert.strictEqual(traits.canvas_count, 0);
  assert.strictEqual(traits.backdrop_filter, false);
  assert.strictEqual(traits.gradient_count, 0);
  assert.strictEqual(traits.loader_hint, false);
  assert.deepStrictEqual(traits.font_families, []);
  assert.strictEqual(traits.webgl, null);
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

test('collectTraits: full-viewport dark wrapper over a default-white body reads dark (DA regression)', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('traits-dark-hero-light-body.html'), {
      scroll_settle: true,
      collectTraits: true,
      viewport: { w: 1440, h: 900 },
    });
    assert.ok(result.traits, 'traits should be attached');
    if (usedFileFallback(result)) {
      // Static extraction cannot measure element geometry — no assertion on scheme.
      return;
    }
    assert.strictEqual(result.traits.scheme, 'dark', 'the dominant opaque overlay is the ground the user sees');
    assert.ok(result.traits.bg_luminance < 0.35, `expected dark luminance; got ${result.traits.bg_luminance}`);
  });
});

test('overall_timeout_ms — a page whose load never fires aborts at the deadline, not the harness', async (t) => {
  // Regression: capturePage bounded each Playwright call but had no wall-clock
  // ceiling, so a page that never signals load (or never stops animating) blocked
  // forever. Observed as a 30-minute silent hang capturing a taste reference.
  const http = await import('node:http');
  const { CaptureTimeoutError } = await import(distCapture);

  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      // The stylesheet request below is accepted and never answered, so `load`
      // never fires and goto waits out its full timeoutMs.
      res.end('<html><head><link rel="stylesheet" href="/never"></head><body>hi</body></html>');
      return;
    }
    // Deliberately no response, no close.
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await runOrSkip(t, async () => {
      const started = Date.now();
      await assert.rejects(
        () => capturePage(`http://127.0.0.1:${port}/`, {
          timeoutMs: 30000,          // per-call budget stays generous...
          overall_timeout_ms: 2000,  // ...the wall-clock ceiling is what must fire
          viewport: { w: 800, h: 600 },
        }),
        (err) => err instanceof CaptureTimeoutError,
        'must reject with CaptureTimeoutError rather than hanging until goto times out'
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 20000, `must abort near the deadline, not the 30s goto timeout; took ${elapsed}ms`);
    });
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
});
