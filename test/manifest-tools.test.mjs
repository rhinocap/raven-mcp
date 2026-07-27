import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { listBuiltServerTools, shortDescription } from '../scripts/sync-manifest-tools.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('manifest tools exactly match the built stdio server', { timeout: 30_000 }, async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'manifest.json'), 'utf8'));
  const liveTools = await listBuiltServerTools();
  const derivedTools = liveTools.map(tool => ({
    name: tool.name,
    description: shortDescription(tool.description),
  }));
  assert.deepEqual(manifest.tools, derivedTools);
});
