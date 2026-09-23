import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'attachments', 'hero.png');
const realHttpTest = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1' ? test.skip : test;
process.env.RAVEN_NO_USAGE_LOG = '1';

let grabBridge;
try {
  grabBridge = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));
} catch (error) {
  test('grab bridge module is available', (t) => t.skip(`dist/grab-bridge.js is required; run npm run build first (${error.message})`));
}

afterEach(async () => { if (grabBridge) await grabBridge.stopGrabSession(); });

function keyFor(session) {
  const match = session.script_tag.match(/[?&]key=([a-f0-9]+)/);
  assert.ok(match, 'expected session script tag capability key');
  return match[1];
}

function request(url, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.once('error', reject);
    req.end(body);
  });
}

function multipartPng(bytes) {
  const boundary = 'raven-thumb-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="hero.png"\r\nContent-Type: image/png\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function withSession(run, proxyTarget, role) {
  assert.ok(grabBridge, 'expected dist/grab-bridge.js to be built');
  const project = await realpath(await mkdtemp(path.join(__dirname, 'fixtures', 'thumb-session-')));
  await writeFile(path.join(project, 'DESIGN.md'), '# Thumbnail test fixture\n');
  try {
    const session = await grabBridge.startGrabSession(path.join(project, 'DESIGN.md'), undefined, proxyTarget, role);
    assert.equal(session.mode, 'server');
    return await run({ session, key: keyFor(session) });
  } finally {
    await grabBridge.stopGrabSession();
    await rm(project, { recursive: true, force: true });
  }
}

async function upload(session, key) {
  const bytes = await readFile(fixturePath);
  const form = multipartPng(bytes);
  const result = await request(`${session.url}/attachment?key=${key}`, 'POST', form.body, {
    'Content-Type': form.contentType,
    'Content-Length': form.body.length
  });
  assert.equal(result.status, 202, 'expected fixture upload to return 202');
  return JSON.parse(result.body.toString('utf8'));
}

realHttpTest('GET attachment serves fixture bytes with MIME and no-store', async () => {
  await withSession(async ({ session, key }) => {
    const record = await upload(session, key);
    const served = await request(`${session.url}/attachment?key=${key}&id=${encodeURIComponent(record.id)}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers['content-type'], 'image/png');
    assert.equal(Number(served.headers['content-length']), served.body.length);
    assert.equal(served.headers['cache-control'], 'no-store');
    assert.equal(served.headers['access-control-allow-origin'], '*');
    assert.deepEqual(served.body, await readFile(fixturePath));
  });
});

realHttpTest('GET attachment returns 404 for an unknown id', async () => {
  await withSession(async ({ session, key }) => {
    const missing = await request(`${session.url}/attachment?key=${key}&id=att_0000000000000000`);
    assert.equal(missing.status, 404);
    assert.ok(JSON.parse(missing.body.toString('utf8')).error);
  });
});

realHttpTest('GET attachment rejects a wrong key before lookup', async () => {
  await withSession(async ({ session, key }) => {
    const wrong = await request(`${session.url}/attachment?key=wrong&id=att_0000000000000000`);
    assert.equal(wrong.status, 403);
  });
});

realHttpTest('GET attachment is unavailable for third-party proxy sessions', async () => {
  await withSession(async ({ session, key }) => {
    const record = await upload(session, key);
    const unavailable = await request(`${session.url}/attachment?key=${key}&id=${encodeURIComponent(record.id)}`);
    assert.equal(unavailable.status, 404);
    assert.match(unavailable.body.toString('utf8'), /Not available while proxying a third-party site/);
  }, 'https://example.invalid', 'consumer');
});
