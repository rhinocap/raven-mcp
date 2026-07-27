import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridge = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));

afterEach(async () => {
  await bridge.stopGrabSession();
});

async function makeDesignFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-layers-operation-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolors:\n  primary: "#111111"\n---\n# Layers operation fixture\n', 'utf8');
  return designPath;
}

function sessionKey(session) {
  const match = session.script_tag.match(/[?&]key=([a-f0-9]+)/);
  assert.ok(match, 'session script tag should contain its capability key');
  return match[1];
}

test('GET /layers-operation returns operation state and JSON errors', async () => {
  const session = await bridge.startGrabSession(await makeDesignFixture());
  const key = sessionKey(session);
  const created = await fetch(`${session.url}/layers-intent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'reorder',
      page: '/pricing',
      parentSelector: 'main',
      fromIndex: 0,
      toIndex: 1,
      orderedSelectors: ['#body', '#hero'],
      measuredRects: [],
      approximate: false,
      domSnapshotHash: 'layers-operation-test'
    })
  });
  assert.equal(created.status, 202);
  const operationId = (await created.json()).operationId;
  const operation = bridge.getGrabOperation(operationId);

  const found = await fetch(`${session.url}/layers-operation?id=${operationId}&key=${key}`);
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), {
    id: operation.id,
    state: operation.state,
    updatedAt: operation.updatedAt
  });

  const unknown = await fetch(`${session.url}/layers-operation?id=missing&key=${key}`);
  assert.equal(unknown.status, 404);
  assert.equal(typeof (await unknown.json()).error, 'string');

  const missing = await fetch(`${session.url}/layers-operation?key=${key}`);
  assert.equal(missing.status, 400);
  assert.equal(typeof (await missing.json()).error, 'string');
});
