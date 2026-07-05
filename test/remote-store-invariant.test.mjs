/**
 * remote-store-invariant.test.mjs
 *
 * The whack-a-mole killer for the hosted (remote) MCP endpoint.
 *
 * Invariant under test: in remote runtime, NO code path may read or write the
 * local raven store (~/.raven taste profiles + creative records). Three
 * adversarial Codex passes each found a new tool/param reaching a local resource;
 * the fix gates the *capability* at the store functions via a one-way latch
 * (src/remote-runtime.ts), so this test asserts the capability is closed rather
 * than enumerating tools. If a future change reopens the store in remote mode,
 * this test fails.
 *
 * Runs after `npm run build`. Each assertion phase runs in its own spawned node
 * process — the latch is process-global and one-way (by design), so it must not
 * leak into sibling test files; a child process guarantees isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

// Run a snippet in a fresh node process with a sentinel store home, return its
// stdout. Throws (failing the test) on non-zero exit.
function runChild(snippet, env) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', snippet], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('remote runtime closes the local taste store; local runtime keeps it open', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'raven-inv-'));
  const tasteHome = path.join(home, 'taste');
  mkdirSync(tasteHome, { recursive: true });

  const tasteUrl = JSON.stringify(pathToImport('taste.js'));
  const rtUrl = JSON.stringify(pathToImport('remote-runtime.js'));

  try {
    // Phase 1 — LOCAL runtime (latch never set): create a real profile + surface
    // binding via the actual store API (guaranteed-valid on-disk shape), then
    // read them back. Proves the sentinel data is real and a leak is detectable.
    const localOut = runChild(
      `import { createTasteProfile, bindTasteSurface, listTasteProfiles, resolveSurfaceBinding } from ${tasteUrl};
       createTasteProfile({ name: 'invtest' });
       bindTasteSurface('invtest', { project: 'secretproj', surface: 'product-site', design_notes: { color: 'monochrome one-accent' } });
       const names = listTasteProfiles().map(p => p.name);
       const bound = resolveSurfaceBinding('invtest', { project: 'secretproj' });
       console.log(JSON.stringify({ names, bound: bound ? bound.project : null }));`,
      { RAVEN_TASTE_HOME: tasteHome }
    );
    const local = JSON.parse(localOut.trim().split('\n').pop());
    assert.deepEqual(local.names, ['invtest'], 'local runtime must read the taste store');
    assert.equal(local.bound, 'secretproj', 'local runtime must resolve the surface binding');

    // Phase 2 — REMOTE runtime (latch set): the SAME calls fail closed. Even
    // with valid on-disk data and an explicitly-named project, the store is
    // never read — no profile names, no binding.
    const remoteOut = runChild(
      `import { setRemoteRuntime } from ${rtUrl};
       setRemoteRuntime();
       const { listTasteProfiles, resolveSurfaceBinding } = await import(${tasteUrl});
       const names = listTasteProfiles();
       const bound = resolveSurfaceBinding('invtest', { project: 'secretproj' });
       console.log(JSON.stringify({ names, bound }));`,
      { RAVEN_TASTE_HOME: tasteHome }
    );
    const remote = JSON.parse(remoteOut.trim().split('\n').pop());
    assert.deepEqual(remote.names, [], 'remote runtime must NOT enumerate taste profiles');
    assert.equal(remote.bound, null, 'remote runtime must NOT resolve any surface binding');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function pathToImport(file) {
  return fileURLToPathHref(path.join(distDir, file));
}
function fileURLToPathHref(p) {
  // file:// URL for cross-platform dynamic import in the child.
  return new URL('file://' + p).href;
}
