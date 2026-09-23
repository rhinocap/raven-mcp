import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, realpath, rm, truncate, writeFile } from 'node:fs/promises';
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

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function largeValidPng(baseBytes, minimumSize) {
  const iendOffset = baseBytes.lastIndexOf(Buffer.from('IEND')) - 4;
  assert.ok(iendOffset >= 8, 'fixture should contain an IEND chunk');
  const dataSize = minimumSize - baseBytes.length + 32;
  const textData = Buffer.alloc(dataSize, 0x61);
  textData[0] = 0x6b;
  textData[1] = 0;
  const typeAndData = Buffer.concat([Buffer.from('tEXt'), textData]);
  const chunk = Buffer.alloc(12 + dataSize);
  chunk.writeUInt32BE(dataSize, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), 4 + typeAndData.length);
  return Buffer.concat([baseBytes.subarray(0, iendOffset), chunk, baseBytes.subarray(iendOffset)]);
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
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.equal(served.headers['content-security-policy'], "default-src 'none'; sandbox");
    assert.equal(served.headers['access-control-allow-origin'], '*');
    assert.deepEqual(served.body, await readFile(fixturePath));
  });
});

realHttpTest('GET attachment streams a multi-MiB PNG with its exact Content-Length', async () => {
  await withSession(async ({ session, key }) => {
    const png = largeValidPng(await readFile(fixturePath), 4 * 1024 * 1024 + 1);
    assert.ok(png.length > 4 * 1024 * 1024);
    const form = multipartPng(png);
    const uploaded = await request(`${session.url}/attachment?key=${key}`, 'POST', form.body, {
      'Content-Type': form.contentType,
      'Content-Length': form.body.length
    });
    assert.equal(uploaded.status, 202, 'expected multi-MiB fixture upload to return 202');
    const record = JSON.parse(uploaded.body.toString('utf8'));
    const served = await request(`${session.url}/attachment?key=${key}&id=${encodeURIComponent(record.id)}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers['content-type'], 'image/png');
    assert.equal(Number(served.headers['content-length']), png.length);
    assert.deepEqual(served.body, png);
  });
});

realHttpTest('GET attachment streams a 256 MiB file without buffering it in memory', async () => {
  await withSession(async ({ session, key }) => {
    const record = await upload(session, key);
    const size = 256 * 1024 * 1024;
    await truncate(record.path, size);
    const baseline = process.memoryUsage().arrayBuffers;
    let peak = baseline;
    let received = 0;
    const status = await new Promise((resolve, reject) => {
      httpRequest(`${session.url}/attachment?key=${key}&id=${encodeURIComponent(record.id)}`, (res) => {
        assert.equal(Number(res.headers['content-length']), size);
        res.on('data', (chunk) => {
          received += chunk.length;
          peak = Math.max(peak, process.memoryUsage().arrayBuffers);
        });
        res.on('end', () => resolve(res.statusCode));
        res.on('error', reject);
      }).on('error', reject).end();
    });
    assert.equal(status, 200);
    assert.equal(received, size);
    assert.ok(peak - baseline < 64 * 1024 * 1024, `server buffered the file: arrayBuffers grew by ${peak - baseline} bytes`);
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
