import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.join(tmpdir(), 'missing-raven-grab.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.resolve(__dirname, '../dist/index.js');

let indexMod;
try {
  indexMod = await import(distIndex);
} catch (err) {
  const msg = `dist/index.js not found - run \`npm run build\` first. (${err.message})`;
  test('grab bridge module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

async function withClient(server, fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'grab-bridge-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('tool gating keeps the anonymous remote surface at 45 and gates the six DESIGN.md/grab tools', async () => {
  const stdio = indexMod.buildServer({});
  const remote = indexMod.buildServer({ remote: true });

  const stdioNames = Object.keys(stdio._registeredTools).sort();
  const remoteNames = Object.keys(remote._registeredTools).sort();
  const newTools = [
    'read_design_md',
    'init_design_md',
    'update_design_md',
    'start_grab_session',
    'get_grabbed_elements',
    'stop_grab_session'
  ];

  assert.equal(stdioNames.length, 78);
  for (const name of newTools) {
    assert.equal(stdioNames.includes(name), true, `${name} should be registered on stdio`);
    assert.equal(remoteNames.includes(name), false, `${name} should be gated off remote anonymous`);
  }
  assert.equal(remoteNames.length, 45, 'remote anonymous endpoint must stay at 45 tools');
});

test('start_grab_session serves DESIGN.md tokens, 404s the missing overlay, queues grabs, and stops cleanly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-bridge-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, `---\ncolors:\n  primary: "#111111"\nspacing:\n  md: "16px"\n---\n# Bridge fixture\n`, 'utf8');

  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    assert.ok(!started.isError);
    const session = JSON.parse(started.content[0].text);
    assert.ok(session.port > 0, 'bridge should allocate a loopback port');
    assert.match(session.script_tag, /<script src="http:\/\/127\.0\.0\.1:\d+\/raven-grab\.js"><\/script>/);

    const tokensRes = await fetch(`http://127.0.0.1:${session.port}/tokens`);
    assert.equal(tokensRes.status, 200);
    const tokens = await tokensRes.json();
    assert.equal(tokens.path, path.resolve(designPath));
    assert.equal(tokens.count, 2);
    assert.equal(tokens.tokens.find((token) => token.path === 'colors.primary').cssVar, '--color-primary');

    const overlayRes = await fetch(`http://127.0.0.1:${session.port}/raven-grab.js`);
    assert.equal(overlayRes.status, 404, 'missing browser asset must 404 gracefully');

    const grabRes = await fetch(`http://127.0.0.1:${session.port}/grab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: '#cta',
        html: '<button id="cta">Save</button>',
        rect: { x: 10, y: 20, w: 120, h: 44 },
        instruction: 'Swap the primary color to the muted variant.'
      })
    });
    assert.equal(grabRes.status, 202);
    const queued = await grabRes.json();
    assert.equal(queued.queued, true);
    assert.equal(queued.count, 1);

    const drained = await client.callTool({ name: 'get_grabbed_elements', arguments: {} });
    assert.ok(!drained.isError);
    const grabbed = JSON.parse(drained.content[0].text);
    assert.equal(grabbed.count, 1);
    assert.equal(grabbed.elements[0].selector, '#cta');
    assert.equal(grabbed.elements[0].instruction, 'Swap the primary color to the muted variant.');

    const stopped = await client.callTool({ name: 'stop_grab_session', arguments: {} });
    assert.ok(!stopped.isError);
    assert.equal(JSON.parse(stopped.content[0].text).stopped, true);
  });
});
