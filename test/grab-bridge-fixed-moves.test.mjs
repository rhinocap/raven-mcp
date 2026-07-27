import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridge = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));
const designmd = await import(path.resolve(__dirname, '../dist/designmd.js'));
const previousWebhook = process.env.RAVEN_GRAB_NOTIFY_WEBHOOK;

afterEach(async () => {
  await bridge.stopGrabSession();
  if (previousWebhook === undefined) delete process.env.RAVEN_GRAB_NOTIFY_WEBHOOK;
  else process.env.RAVEN_GRAB_NOTIFY_WEBHOOK = previousWebhook;
});

async function makeDesignFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-fixed-move-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, `---\ncolors:\n  primary: "#111111"\n---\n# Fixed move fixture\n`, 'utf8');
  return designPath;
}

function sessionKey(session) {
  const match = session.script_tag.match(/[?&]key=([a-f0-9]+)/);
  assert.ok(match, 'session script tag should contain its capability key');
  return match[1];
}

function baseIntent(overrides = {}) {
  return {
    operation: 'reorder',
    page: '/pricing',
    parentSelector: 'main',
    fromIndex: 0,
    toIndex: 1,
    orderedSelectors: ['#body', '#hero'],
    measuredRects: [],
    approximate: false,
    domSnapshotHash: 'fixed-move-hash',
    ...overrides
  };
}

async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function fixedMovesFrom(source, templateId = 'marketing', pageKey = '%2Fpricing') {
  const parsed = designmd.parseDesignMd(source);
  const stored = parsed.frontmatter.templates[templateId].pages[pageKey].fixedMoves;
  return typeof stored === 'string' ? JSON.parse(stored) : stored;
}

test('template slot note persists through POST and GET with fixed as the omitted-role default', async () => {
  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  const response = await postJson(`${session.url}/template?key=${key}`, {
    page: '/pricing',
    templateId: 'marketing',
    slots: [{ slotId: 'hero', selector: '#hero', note: '  Keep the campaign art anchored.  ' }]
  });
  assert.equal(response.status, 200);

  const persisted = await readFile(designPath, 'utf8');
  assert.match(persisted, /Keep the campaign art anchored\./);
  const fetched = await fetch(`${session.url}/template?page=%2Fpricing&key=${key}`);
  assert.equal(fetched.status, 200);
  assert.deepEqual((await fetched.json()).slots, [{
    slotId: 'hero',
    selector: '#hero',
    role: 'fixed',
    note: 'Keep the campaign art anchored.',
    validated: false
  }]);

  const oversized = await postJson(`${session.url}/template?key=${key}`, {
    page: '/pricing',
    templateId: 'marketing',
    slots: [{ slotId: 'hero', selector: '#hero', note: 'x'.repeat(2001) }]
  });
  assert.equal(oversized.status, 400);
});

test('/layers-intent accepts movedRole, fixedMove, and trimmed note fields', async () => {
  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  const response = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'flexible',
    fixedMove: false,
    note: '  Reviewed in the layer panel.  '
  }));
  assert.equal(response.status, 202);
  const operationId = (await response.json()).operationId;
  assert.equal(typeof operationId, 'string');
  assert.deepEqual(bridge.getGrabOperation(operationId).intent, baseIntent({
    movedRole: 'flexible',
    fixedMove: false,
    note: 'Reviewed in the layer panel.'
  }));

  const exactLimit = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed',
    fixedMove: true,
    note: 'x'.repeat(2000)
  }));
  assert.equal(exactLimit.status, 202);
  const exactLimitOperation = bridge.getGrabOperation((await exactLimit.json()).operationId);
  assert.equal(exactLimitOperation.intent.note.length, 2000);

  const oversized = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed',
    fixedMove: false,
    note: 'x'.repeat(2001)
  }));
  assert.equal(oversized.status, 400);
});

test('/layers-intent rejects fixedMove true unless movedRole is fixed', async () => {
  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  const response = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'flexible',
    fixedMove: true,
    note: 'Contradictory intent'
  }));
  assert.equal(response.status, 400);
  assert.equal(bridge.getGrabOperation().length, 0);
});

test('/layers-intent rejects movedRole fixed unless fixedMove is true', async () => {
  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  const response = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed',
    fixedMove: false,
    note: 'Must persist and notify'
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /movedRole fixed requires fixedMove true/);
  assert.equal(bridge.getGrabOperation().length, 0);
});

test('fixedMove appends a DESIGN.md record under the resolved template and page', async () => {
  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  await postJson(`${session.url}/template?key=${key}`, {
    page: '/pricing',
    templateId: 'marketing',
    slots: [{ slotId: 'hero', selector: '#hero', role: 'fixed' }]
  });

  const first = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed', fixedMove: true, note: '  Approved for this campaign.  '
  }));
  assert.equal(first.status, 202);
  const firstOperation = bridge.getGrabOperation((await first.json()).operationId);
  assert.equal(firstOperation.intent.movedRole, 'fixed');
  assert.equal(firstOperation.intent.fixedMove, true);
  assert.equal(firstOperation.intent.note, 'Approved for this campaign.');
  const second = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    fromIndex: 1,
    toIndex: 0,
    orderedSelectors: ['#hero', '#body'],
    movedRole: 'fixed',
    fixedMove: true,
    note: 'Second move'
  }));
  assert.equal(second.status, 202);

  const moves = fixedMovesFrom(await readFile(designPath, 'utf8'));
  assert.equal(moves.length, 2);
  assert.deepEqual(moves[0], {
    selector: '#hero',
    from: 0,
    to: 1,
    note: 'Approved for this campaign.',
    at: moves[0].at,
    operation: 'reorder',
    parent: 'main'
  });
  assert.match(moves[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(moves[1].selector, '#hero');
});

test('malformed persisted fixedMoves returns 400 without recording an operation', async () => {
  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  await postJson(`${session.url}/template?key=${key}`, {
    page: '/pricing',
    templateId: 'marketing',
    slots: [{ slotId: 'hero', selector: '#hero', role: 'fixed' }]
  });
  const source = await readFile(designPath, 'utf8');
  const marker = '      slots:';
  assert.ok(source.includes(marker));
  await writeFile(designPath, source.replace(marker, '      fixedMoves: "{not-json"\n' + marker), 'utf8');

  const response = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed', fixedMove: true, note: 'Must not crash'
  }));
  assert.equal(response.status, 400);
  assert.equal(typeof (await response.json()).error, 'string');
  assert.equal(bridge.getGrabOperation().length, 0);

  const invalidJsonSource = await readFile(designPath, 'utf8');
  await writeFile(designPath, invalidJsonSource.replace('fixedMoves: "{not-json"', 'fixedMoves: "{}"'), 'utf8');
  const nonArrayResponse = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed', fixedMove: true, note: 'Still must not crash'
  }));
  assert.equal(nonArrayResponse.status, 400);
  assert.match((await nonArrayResponse.json()).error, /must be an array/);
  assert.equal(bridge.getGrabOperation().length, 0);
});

test('fixedMove posts the fixed-layer-move webhook payload', async (t) => {
  const received = [];
  const webhook = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method, body: JSON.parse(body) });
      res.statusCode = 204;
      res.end();
    });
  });
  try {
    await new Promise((resolve, reject) => {
      webhook.once('error', reject);
      webhook.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error && error.code === 'EPERM') {
      t.skip('sandbox does not permit loopback listeners');
      return;
    }
    throw error;
  }
  t.after(() => new Promise((resolve) => webhook.close(resolve)));
  const address = webhook.address();
  process.env.RAVEN_GRAB_NOTIFY_WEBHOOK = `http://127.0.0.1:${address.port}/notify`;

  const designPath = await makeDesignFixture();
  const session = await bridge.startGrabSession(designPath);
  const key = sessionKey(session);
  const response = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
    movedRole: 'fixed', fixedMove: true, note: '  Move approved.  '
  }));
  assert.equal(response.status, 202);

  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 2000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(received.length, 1);
  });
  assert.equal(received[0].method, 'POST');
  assert.deepEqual(received[0].body, {
    type: 'fixed-layer-move',
    page: '/pricing',
    operation: 'reorder',
    selector: '#hero',
    from: 0,
    to: 1,
    parent: 'main',
    note: 'Move approved.'
  });
});

test('fixedMove does not call a webhook when RAVEN_GRAB_NOTIFY_WEBHOOK is unset', async () => {
  delete process.env.RAVEN_GRAB_NOTIFY_WEBHOOK;
  const originalFetch = globalThis.fetch;
  let webhookCalls = 0;
  globalThis.fetch = async function (input, init) {
    if (String(input).includes('/notify')) webhookCalls += 1;
    return originalFetch(input, init);
  };
  try {
    const designPath = await makeDesignFixture();
    const session = await bridge.startGrabSession(designPath);
    const key = sessionKey(session);
    const response = await postJson(`${session.url}/layers-intent?key=${key}`, baseIntent({
      movedRole: 'fixed', fixedMove: true, note: 'No webhook configured'
    }));
    assert.equal(response.status, 202);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(webhookCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
