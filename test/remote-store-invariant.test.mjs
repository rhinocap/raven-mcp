/**
 * remote-store-invariant.test.mjs
 *
 * The hosted (remote) MCP endpoint must not get a capability to read or write
 * the local taste store. Phase 4 moves that invariant from implicit taste.ts
 * fs/latch checks to an explicit per-server TasteStore: local stdio uses
 * FsTasteStore, while a remote build with no injected store uses
 * ClosedTasteStore. No module-global current store is allowed.
 *
 * Runs after `npm run build`. Each assertion phase runs in its own spawned node
 * process because remote-runtime is still a one-way process latch for the
 * creative store and remote server mode.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

function runChild(snippet, env) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', snippet], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('TasteStore capability is explicit: fs store opens local taste; closed store reads empty and rejects writes', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'raven-inv-'));
  const tasteHome = path.join(home, 'taste');
  mkdirSync(tasteHome, { recursive: true });

  const tasteUrl = JSON.stringify(pathToImport('taste.js'));
  const storeUrl = JSON.stringify(pathToImport('taste-store.js'));

  try {
    const localOut = runChild(
      `import { createTasteProfile, bindTasteSurface, listTasteProfiles, resolveSurfaceBinding } from ${tasteUrl};
       import { FsTasteStore } from ${storeUrl};
       const store = new FsTasteStore();
       await createTasteProfile(store, { name: 'invtest' });
       await bindTasteSurface(store, 'invtest', { project: 'secretproj', surface: 'product-site', design_notes: { color: 'monochrome one-accent' } });
       const names = (await listTasteProfiles(store)).map(p => p.name);
       const bound = await resolveSurfaceBinding(store, 'invtest', { project: 'secretproj' });
       console.log(JSON.stringify({ names, bound: bound ? bound.project : null }));`,
      { RAVEN_TASTE_HOME: tasteHome }
    );
    const local = JSON.parse(localOut.trim().split('\n').pop());
    assert.deepEqual(local.names, ['invtest'], 'FsTasteStore must read the local taste store');
    assert.equal(local.bound, 'secretproj', 'FsTasteStore must resolve the local surface binding');

    const closedOut = runChild(
      `import { createTasteProfile, bindTasteSurface, listTasteProfiles, resolveSurfaceBinding, getTasteProfile } from ${tasteUrl};
       import { ClosedTasteStore } from ${storeUrl};
       const store = new ClosedTasteStore();
       const names = await listTasteProfiles(store);
       const bound = await resolveSurfaceBinding(store, 'invtest', { project: 'secretproj' });
       let getError = '';
       let createError = '';
       let bindError = '';
       try { await getTasteProfile(store, 'invtest'); } catch (err) { getError = err.message; }
       try { await createTasteProfile(store, { name: 'nope' }); } catch (err) { createError = err.message; }
       try { await bindTasteSurface(store, 'invtest', { project: 'x', surface: 's', design_notes: { color: 'x' } }); } catch (err) { bindError = err.message; }
       console.log(JSON.stringify({ names, bound, getError, createError, bindError }));`,
      { RAVEN_TASTE_HOME: tasteHome }
    );
    const closed = JSON.parse(closedOut.trim().split('\n').pop());
    assert.deepEqual(closed.names, [], 'ClosedTasteStore must not enumerate taste profiles');
    assert.equal(closed.bound, null, 'ClosedTasteStore must not resolve local surface bindings');
    assert.match(closed.getError, /Taste profile not found: invtest.*Available profiles: \(none\)/);
    assert.match(closed.createError, /Taste store is not available in remote runtime/);
    assert.match(closed.bindError, /Taste profile not found: invtest.*Available profiles: \(none\)/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('remote build with no injected store keeps anonymous endpoint taste-closed', () => {
  const indexUrl = JSON.stringify(pathToImport('index.js'));

  const out = runChild(
    `import { buildServer } from ${indexUrl};
     import { Client } from '@modelcontextprotocol/sdk/client/index.js';
     import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
     const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
     const server = buildServer({ remote: true });
     const client = new Client({ name: 'remote-store-invariant-test', version: '1.0.0' }, { capabilities: {} });
     await server.connect(serverTransport);
     await client.connect(clientTransport);
     const listed = await client.listTools();
     const names = listed.tools.map(t => t.name).sort();
     const tasteNames = names.filter(name => name.includes('taste') || name === 'label_finding');
     let listTasteError = '';
     let createTasteError = '';
     try {
       const listCall = await client.callTool({ name: 'list_taste_profiles', arguments: {} });
       listTasteError = listCall.content && listCall.content[0] ? listCall.content[0].text : '';
     } catch (err) { listTasteError = err.message; }
     try {
       const createCall = await client.callTool({ name: 'create_taste_profile', arguments: { name: 'leak' } });
       createTasteError = createCall.content && createCall.content[0] ? createCall.content[0].text : '';
     } catch (err) { createTasteError = err.message; }
     await client.close();
     await server.close();
     console.log(JSON.stringify({ count: names.length, tasteNames, listTasteError, createTasteError }));`
  );

  const result = JSON.parse(out.trim().split('\n').pop());
  assert.equal(result.count, 45, 'remote anonymous endpoint must keep the existing 45-tool set');
  assert.deepEqual(result.tasteNames, [], 'remote anonymous endpoint must expose no taste store tools');
  assert.match(result.listTasteError, /not found|Unknown tool|Tool.*not/i);
  assert.match(result.createTasteError, /not found|Unknown tool|Tool.*not/i);
});

function pathToImport(file) {
  return new URL('file://' + path.join(distDir, file)).href;
}
