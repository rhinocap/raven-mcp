/**
 * device-frame.test.mjs
 *
 * Tests for device-frame auditing in dist/device-frame.js.
 * Runs after `npm run build` (tsc must have produced dist/device-frame.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDeviceFrame = path.resolve(__dirname, '../dist/device-frame.js');

let auditDeviceFrames;
let auditClipMotion;
let auditFrameEdges;

try {
  const mod = await import(distDeviceFrame);
  auditDeviceFrames = mod.auditDeviceFrames;
  auditClipMotion = mod.auditClipMotion;
  auditFrameEdges = mod.auditFrameEdges;
} catch (err) {
  const msg = `dist/device-frame.js not found - run \`npm run build\` first. (${err.message})`;
  test('device-frame module available', (t) => { t.skip(msg); });
  process.exit(0);
}

let PNG;
try {
  const pngjs = await import('pngjs');
  PNG = pngjs.PNG;
} catch (err) {
  test('pngjs available for test PNG generation', (t) => {
    t.skip(`pngjs not installed - cannot build synthetic PNGs for device-frame tests. (${err.message})`);
  });
  process.exit(0);
}

function makeTexturedPng(width = 96, height = 96) {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) * 4;
      const channel =
        (x * 17 + y * 31 + ((x * y) % 47) * 9 + ((x ^ y) % 13) * 11) % 256;

      png.data[idx + 0] = channel;
      png.data[idx + 1] = (channel * 3 + x * 5) % 256;
      png.data[idx + 2] = (channel * 7 + y * 3) % 256;
      png.data[idx + 3] = 255;
    }
  }

  return png;
}

function makeZoomedPng(source, cropFraction = 0.88) {
  const width = source.width;
  const height = source.height;
  const png = new PNG({ width, height });
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.max(0, Math.min(width - 1, Math.round(cx + (x - cx) * cropFraction)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(cy + (y - cy) * cropFraction)));
      const srcIdx = (width * sy + sx) * 4;
      const dstIdx = (width * y + x) * 4;

      png.data[dstIdx + 0] = source.data[srcIdx + 0];
      png.data[dstIdx + 1] = source.data[srcIdx + 1];
      png.data[dstIdx + 2] = source.data[srcIdx + 2];
      png.data[dstIdx + 3] = 255;
    }
  }

  return png;
}

function makeEdgeSlicedPng() {
  const width = 200;
  const height = 200;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) * 4;

      if (y >= 180) {
        const channel = x % 2 === 0 ? 0 : 255;
        png.data[idx + 0] = channel;
        png.data[idx + 1] = channel;
        png.data[idx + 2] = channel;
      } else {
        png.data[idx + 0] = 204;
        png.data[idx + 1] = 204;
        png.data[idx + 2] = 204;
      }

      png.data[idx + 3] = 255;
    }
  }

  return png;
}

async function writePng(filePath, png) {
  await writeFile(filePath, PNG.sync.write(png));
}

test('Geometry - cover vertical crop (the real watch case)', () => {
  const results = auditDeviceFrames([
    {
      selector: '#watch',
      container: { w: 1000, h: 550 },
      media: { w: 1920, h: 1080 },
      objectFit: 'cover'
    }
  ]);
  const result = results[0];

  assert.strictEqual(result.verdict, 'cropped');
  assert.ok(result.cropped_edges.includes('top'), 'top edge should be cropped');
  assert.ok(result.cropped_edges.includes('bottom'), 'bottom edge should be cropped');
  assert.ok(result.crop_fraction > 0.015, `crop_fraction ${result.crop_fraction} should be > 0.015`);
  assert.ok(result.crop_fraction < 0.03, `crop_fraction ${result.crop_fraction} should be < 0.03`);
});

test('Geometry - exact-fit', () => {
  const results = auditDeviceFrames([
    {
      selector: '#exact',
      container: { w: 1600, h: 900 },
      media: { w: 1920, h: 1080 },
      objectFit: 'cover'
    }
  ]);
  const result = results[0];

  assert.strictEqual(result.verdict, 'fits');
  assert.ok(result.crop_fraction < 0.000001, `crop_fraction ${result.crop_fraction} should be ~0`);
});

test('Geometry - fill distortion', () => {
  const results = auditDeviceFrames([
    {
      selector: '#distorted',
      container: { w: 1000, h: 1000 },
      media: { w: 1920, h: 1080 },
      objectFit: 'fill'
    }
  ]);
  const result = results[0];

  assert.strictEqual(result.verdict, 'distorted');
  assert.ok(result.distortion > 0.02, 'distortion should exceed the default threshold');
});

test('Motion - static', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-device-frame-static-'));
  const framePath = path.join(dir, 'static.png');
  const frame = makeTexturedPng();

  await writePng(framePath, frame);

  const results = await auditClipMotion([
    { label: 'static', firstFramePath: framePath, lastFramePath: framePath }
  ]);
  const result = results[0];

  assert.strictEqual(result.verdict, 'static');
  assert.ok(result.mean_displacement < 0.6, `mean_displacement ${result.mean_displacement} should be small`);
  assert.ok(Math.abs(result.zoom_ratio - 1) < 0.02, `zoom_ratio ${result.zoom_ratio} should be near 1`);
});

test('Motion - zoom', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-device-frame-zoom-'));
  const firstPath = path.join(dir, 'first.png');
  const lastPath = path.join(dir, 'last.png');
  const first = makeTexturedPng();
  const last = makeZoomedPng(first, 0.88);

  await writePng(firstPath, first);
  await writePng(lastPath, last);

  const results = await auditClipMotion([
    { label: 'zoom', firstFramePath: firstPath, lastFramePath: lastPath }
  ]);
  const result = results[0];

  assert.ok(result.verdict === 'zoom' || result.verdict === 'pan-zoom', `verdict was ${result.verdict}`);
  assert.ok(result.zoom_ratio > 1.0, `zoom_ratio ${result.zoom_ratio} should be > 1.0`);
});

test('Edge truncation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-device-frame-edge-'));
  const framePath = path.join(dir, 'edge.png');
  const frame = makeEdgeSlicedPng();

  await writePng(framePath, frame);

  const results = await auditFrameEdges([{ label: 'edge', framePath }]);
  const result = results[0];

  assert.strictEqual(result.verdict, 'likely-sliced');
  assert.strictEqual(result.cut_edge, 'bottom');
});
