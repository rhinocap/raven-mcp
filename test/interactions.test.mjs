/**
 * interactions.test.mjs
 *
 * Tests for interaction replay in dist/capture.js.
 * Runs after `npm run build` (tsc must have produced dist/capture.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCapture = path.resolve(__dirname, '../dist/capture.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');
const EMPTY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

let capturePage;
let CaptureUnavailableError;

try {
  const mod = await import(distCapture);
  capturePage = mod.capturePage;
  CaptureUnavailableError = mod.CaptureUnavailableError;
} catch (err) {
  const msg = `dist/capture.js not found - run \`npm run build\` first. (${err.message})`;
  test('capture module available', (t) => { t.skip(msg); });
  process.exit(0);
}

let PNG;
try {
  const pngjs = await import('pngjs');
  PNG = pngjs.PNG;
} catch (err) {
  test('pngjs available for screenshot decoding', (t) => {
    t.skip(`pngjs not installed - cannot decode screenshots for interaction tests. (${err.message})`);
  });
  process.exit(0);
}

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

function decodeScreenshotOrSkip(t, base64) {
  if (base64 === EMPTY_PNG_BASE64) {
    t.skip('capture returned the 1x1 EMPTY_PNG fallback; browser unavailable for pixel assertion.');
    return null;
  }

  const png = PNG.sync.read(Buffer.from(base64, 'base64'));

  if (png.width === 1 && png.height === 1) {
    t.skip('capture returned the 1x1 EMPTY_PNG fallback; browser unavailable for pixel assertion.');
    return null;
  }

  return png;
}

function nearWhiteFraction(png) {
  const total = png.width * png.height;
  let nearWhite = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) * 4;
      const r = png.data[idx + 0];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];

      if (r > 235 && g > 235 && b > 235) {
        nearWhite += 1;
      }
    }
  }

  return nearWhite / total;
}

test('hover interaction triggers the full-viewport white theme wash', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('theme-wipe.html'), {
      interactions: [{ selector: '.theme-fab', event: 'hover', delay_ms: 200 }],
    });

    const png = decodeScreenshotOrSkip(t, result.screenshotBase64);
    if (png === null) {
      return;
    }

    const fraction = nearWhiteFraction(png);
    t.diagnostic(`near-white fraction after hover: ${fraction.toFixed(4)}`);
    assert.ok(fraction > 0.6, `near-white fraction should be > 0.6 after hover, got ${fraction}`);
  });
});

test('without interactions the theme wash stays hidden', async (t) => {
  await runOrSkip(t, async () => {
    const result = await capturePage(fixtureUrl('theme-wipe.html'));

    const png = decodeScreenshotOrSkip(t, result.screenshotBase64);
    if (png === null) {
      return;
    }

    const fraction = nearWhiteFraction(png);
    t.diagnostic(`near-white fraction without interactions: ${fraction.toFixed(4)}`);
    assert.ok(fraction < 0.2, `near-white fraction should be < 0.2 without interactions, got ${fraction}`);
  });
});
