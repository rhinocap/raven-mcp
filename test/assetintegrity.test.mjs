/**
 * assetintegrity.test.mjs
 *
 * Tests for auditAssetIntegrity() in dist/asset-integrity.js.
 * Runs after `npm run build` (tsc must have produced dist/asset-integrity.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distAssetIntegrity = path.resolve(__dirname, '../dist/asset-integrity.js');

let auditAssetIntegrity;

try {
  const mod = await import(distAssetIntegrity);
  auditAssetIntegrity = mod.auditAssetIntegrity;
} catch (err) {
  const msg = `dist/asset-integrity.js not found - run \`npm run build\` first. (${err.message})`;
  test('asset-integrity module available', (t) => { t.skip(msg); });
  process.exit(0);
}

let PNG;
try {
  const pngjs = await import('pngjs');
  PNG = pngjs.PNG;
} catch (err) {
  test('pngjs available for test PNG generation', (t) => {
    t.skip(`pngjs not installed - cannot build synthetic PNGs for asset-integrity tests. (${err.message})`);
  });
  process.exit(0);
}

function makeCleanPng() {
  const width = 200;
  const height = 200;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) * 4;

      if (y >= 180) {
        png.data[idx + 0] = 204;
        png.data[idx + 1] = 204;
        png.data[idx + 2] = 204;
      } else {
        png.data[idx + 0] = (x * 3 + y) % 256;
        png.data[idx + 1] = (x + y * 2) % 256;
        png.data[idx + 2] = (x * 5 + y * 7) % 256;
      }

      png.data[idx + 3] = 255;
    }
  }

  return png;
}

function makeSlicedPng() {
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
        png.data[idx + 0] = (x * 3 + y) % 256;
        png.data[idx + 1] = (x + y * 2) % 256;
        png.data[idx + 2] = (x * 5 + y * 7) % 256;
      }

      png.data[idx + 3] = 255;
    }
  }

  return png;
}

async function writePackedPng(filePath, png) {
  const pngBuffer = await pngToBuffer(png);
  await writeFile(filePath, pngBuffer);
}

function pngToBuffer(png) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = png.pack();

    stream.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', reject);
  });
}

function bottomVarianceFromResultOrPng(result, png) {
  if (result && typeof result.bottom_variance === 'number') {
    return result.bottom_variance;
  }

  return bottomLuminanceVariance(png, 20);
}

function bottomLuminanceVariance(png, stripHeight) {
  const startY = png.height - stripHeight;
  const pixelCount = png.width * stripHeight;
  let lumaTotal = 0;
  const luminances = [];

  for (let y = startY; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) * 4;
      const luminance =
        0.2126 * png.data[idx + 0] +
        0.7152 * png.data[idx + 1] +
        0.0722 * png.data[idx + 2];

      luminances.push(luminance);
      lumaTotal += luminance;
    }
  }

  const mean = lumaTotal / pixelCount;
  let squaredDeltaTotal = 0;

  for (let i = 0; i < luminances.length; i += 1) {
    const delta = luminances[i] - mean;
    squaredDeltaTotal += delta * delta;
  }

  return squaredDeltaTotal / pixelCount;
}

test('asset integrity distinguishes uniform bottom strip from sliced bottom strip', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-assetintegrity-'));
  const cleanPath = path.join(dir, 'clean.png');
  const slicedPath = path.join(dir, 'sliced.png');
  const cleanPng = makeCleanPng();
  const slicedPng = makeSlicedPng();

  await writePackedPng(cleanPath, cleanPng);
  await writePackedPng(slicedPath, slicedPng);

  const results = await auditAssetIntegrity([cleanPath, slicedPath]);
  const clean = results.find((result) => result.path === cleanPath);
  const sliced = results.find((result) => result.path === slicedPath);

  assert.ok(clean, 'clean result is present');
  assert.ok(sliced, 'sliced result is present');

  const cleanVariance = bottomVarianceFromResultOrPng(clean, cleanPng);
  const slicedVariance = bottomVarianceFromResultOrPng(sliced, slicedPng);
  t.diagnostic(`clean bottom variance: ${cleanVariance.toFixed(4)}`);
  t.diagnostic(`sliced bottom variance: ${slicedVariance.toFixed(4)}`);

  assert.strictEqual(clean.verdict, 'clean');
  assert.strictEqual(sliced.verdict, 'likely-sliced');
  assert.ok(slicedVariance > cleanVariance, 'sliced bottom variance should exceed clean bottom variance');
});
