import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import {
  access, mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, symlink,
  utimes, writeFile
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures', 'attachments');
const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
const previousAssetPath = process.env.RAVEN_GRAB_ASSET_PATH;
const realHttpTest = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1' ? test.skip : test;
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.join(tmpdir(), 'missing-raven-grab.js');

let grabBridge;
try {
  grabBridge = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));
} catch (error) {
  test('grab attachment bridge module is available', (t) => {
    t.skip(`dist/grab-bridge.js is required; run npm run build first (${error.message})`);
  });
}

afterEach(async () => {
  if (grabBridge) await grabBridge.stopGrabSession();
});

test.after(() => {
  if (previousNoUsageLog === undefined) delete process.env.RAVEN_NO_USAGE_LOG;
  else process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  if (previousAssetPath === undefined) delete process.env.RAVEN_GRAB_ASSET_PATH;
  else process.env.RAVEN_GRAB_ASSET_PATH = previousAssetPath;
});

const manifest = JSON.parse(await readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));
const hero = manifest.find((entry) => entry.name === 'hero.png');

function keyFor(session) {
  const match = session.script_tag.match(/[?&]key=([a-f0-9]+)/);
  assert.ok(match, 'expected the session script tag to include a capability key');
  return match[1];
}

function multipart(parts, boundary = 'raven-attachment-boundary') {
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n${part.headers}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function filePart(name, mime, bytes) {
  return { headers: `Content-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}`, body: bytes };
}

function fieldPart(name, value) {
  return { headers: `Content-Disposition: form-data; name="${name}"`, body: value };
}

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: 'POST', headers: { ...headers, 'Content-Length': body.length } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks), headers: response.headers }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

async function responseJson(url, body, headers) {
  const response = await post(url, body, headers);
  let json = null;
  if (response.body.length) {
    try { json = JSON.parse(response.body.toString('utf8')); } catch { json = null; }
  }
  return { ...response, json };
}

async function inboxEntries(inbox, key) {
  try { return await readdir(path.join(inbox, key.slice(0, 8))); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function withSession(run) {
  assert.ok(grabBridge, 'expected dist/grab-bridge.js to be built before attachment tests run');
  const project = await realpath(await mkdtemp(path.join(__dirname, 'fixtures', 'attachment-session-')));
  const inbox = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-inbox-')));
  const oldInbox = process.env.RAVEN_GRAB_INBOX;
  process.env.RAVEN_GRAB_INBOX = inbox;
  await writeFile(path.join(project, 'DESIGN.md'), '# Attachment test fixture\n');
  let session;
  try {
    session = await grabBridge.startGrabSession(path.join(project, 'DESIGN.md'));
    assert.equal(session.mode, 'server', 'expected a real HTTP grab bridge server');
    return await run({ project, inbox, session, key: keyFor(session) });
  } finally {
    await grabBridge.stopGrabSession();
    if (oldInbox === undefined) delete process.env.RAVEN_GRAB_INBOX;
    else process.env.RAVEN_GRAB_INBOX = oldInbox;
    await rm(project, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  }
}

function attachmentUrl(session, key = null) {
  return `${session.url}/attachment${key === null ? '' : `?key=${key}`}`;
}

realHttpTest('multipart PNG creates a deduplicated drop attachment record and file', async () => {
  await withSession(async ({ inbox, session, key }) => {
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    const upload = multipart([filePart('hero.png', 'image/png', bytes)]);
    const first = await responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    assert.equal(first.status, 202, 'expected multipart hero.png upload to return 202');
    const record = first.json;
    assert.match(record.id, /^att_[0-9a-f]{16}$/, 'expected attachment id to have the att_ plus 16 hex format');
    assert.equal(record.origin, 'drop', 'expected omitted origin to default to drop');
    assert.equal(record.name, 'hero.png', 'expected record name to preserve hero.png');
    assert.equal(record.mime, 'image/png', 'expected record MIME to be image/png');
    assert.equal(record.bytes, hero.bytes, 'expected record byte count to match the manifest');
    assert.equal(record.sha256, hero.sha256, 'expected record SHA-256 to match the manifest');
    assert.equal(record.width, 16, 'expected PNG width to be read as 16');
    assert.equal(record.height, 9, 'expected PNG height to be read as 9');
    assert.ok(path.isAbsolute(record.path), 'expected stored attachment path to be absolute');
    assert.ok(record.path.startsWith(path.join(inbox, key.slice(0, 8)) + path.sep), 'expected attachment path to be under this session inbox directory');
    assert.equal(path.basename(record.path), `${hero.sha256.slice(0, 12)}-hero.png`, 'expected stored filename to be SHA prefix plus original name');
    assert.deepEqual(await readFile(record.path), bytes, 'expected stored attachment bytes to equal uploaded bytes');
    assert.equal(record.sourcePath, null, 'expected a multipart attachment to have no sourcePath');

    const second = await responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    assert.equal(second.status, 202, 'expected re-uploading hero.png to return 202');
    assert.notEqual(second.json.id, record.id, 'expected re-uploading the same bytes to create a new record id');
    assert.equal(second.json.sha256, record.sha256, 'expected re-uploaded bytes to retain the same SHA-256');
    assert.equal(second.json.path, record.path, 'expected re-uploaded bytes to deduplicate to the same stored path');
    assert.deepEqual(await inboxEntries(inbox, key), [path.basename(record.path)], 'expected exactly one deduplicated file in the session inbox');
  });
});

realHttpTest('multipart origin accepts paste and rejects invalid values', async () => {
  await withSession(async ({ session, key }) => {
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    const pasted = multipart([filePart('hero.png', 'image/png', bytes), fieldPart('origin', 'paste')]);
    const accepted = await responseJson(attachmentUrl(session, key), pasted.body, { 'Content-Type': pasted.contentType });
    assert.equal(accepted.status, 202, 'expected origin=paste multipart upload to return 202');
    assert.equal(accepted.json.origin, 'paste', 'expected origin=paste to be retained on the record');
    const bogus = multipart([filePart('hero.png', 'image/png', bytes), fieldPart('origin', 'bogus')]);
    const rejected = await responseJson(attachmentUrl(session, key), bogus.body, { 'Content-Type': bogus.contentType });
    assert.equal(rejected.status, 400, 'expected invalid multipart origin to return 400');
  });
});

realHttpTest('multipart MIME validation rejects mismatched and non-image declarations without writing', async () => {
  await withSession(async ({ inbox, session, key }) => {
    const jpg = await readFile(path.join(fixtureDir, 'photo.jpg'));
    const mismatched = multipart([filePart('photo.jpg', 'image/png', jpg)]);
    const mismatchResult = await responseJson(attachmentUrl(session, key), mismatched.body, { 'Content-Type': mismatched.contentType });
    assert.equal(mismatchResult.status, 415, 'expected JPEG bytes declared as image/png to return 415');
    const text = multipart([filePart('notes.txt', 'text/plain', Buffer.from('not an image'))]);
    const textResult = await responseJson(attachmentUrl(session, key), text.body, { 'Content-Type': text.contentType });
    assert.equal(textResult.status, 415, 'expected text/plain file declaration to return 415');
    assert.deepEqual(await inboxEntries(inbox, key), [], 'expected rejected multipart uploads to write no inbox files');
  });
});

realHttpTest('multipart body cap refuses oversized and falsely long requests without writing', async () => {
  await withSession(async ({ inbox, session, key }) => {
    const pngHeader = await readFile(path.join(fixtureDir, 'hero.png'));
    const tooLarge = Buffer.alloc(25 * 1024 * 1024 + 1);
    pngHeader.copy(tooLarge);
    const upload = multipart([filePart('large.png', 'image/png', tooLarge)]);
    const rejected = await responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    assert.equal(rejected.status, 413, 'expected a 25 MiB plus one byte file part to return 413');
    assert.deepEqual(await inboxEntries(inbox, key), [], 'expected oversized multipart upload to write no inbox files');

    const outcome = await new Promise((resolve) => {
      const request = httpRequest(attachmentUrl(session, key), {
        method: 'POST', headers: { 'Content-Type': upload.contentType, 'Content-Length': 30 * 1024 * 1024 }
      }, (response) => {
        response.resume();
        response.on('end', () => resolve(`status:${response.statusCode}`));
      });
      request.on('error', (error) => resolve(`error:${error.code}`));
      // A client-side timeout is a failure: the server must answer or close.
      request.setTimeout(5000, () => { request.destroy(); resolve('client-timeout'); });
      request.end(Buffer.from(`--raven-attachment-boundary\r\n`));
    });
    assert.ok(outcome === 'status:413' || outcome === 'error:ECONNRESET', `expected falsely long Content-Length request to end with 413 or a server close; got ${outcome}`);
    assert.deepEqual(await inboxEntries(inbox, key), [], 'expected falsely long request to write no inbox files');
  });
});

realHttpTest('path route validates permitted absolute image paths and copies them to the inbox', async () => {
  await withSession(async ({ project, inbox, session, key }) => {
    const heroBytes = await readFile(path.join(fixtureDir, 'hero.png'));
    const source = path.join(project, 'hero-copy.png');
    await writeFile(source, heroBytes);
    const sendPath = (value) => responseJson(attachmentUrl(session, key), Buffer.from(JSON.stringify({ path: value })), { 'Content-Type': 'application/json' });
    const accepted = await sendPath(source);
    assert.equal(accepted.status, 202, 'expected an absolute project PNG path to return 202');
    assert.equal(accepted.json.origin, 'path', 'expected path route record origin to be path');
    assert.equal(accepted.json.sourcePath, source, 'expected path route record sourcePath to equal the input path');
    assert.equal(accepted.json.width, 16, 'expected path PNG width to be 16');
    assert.equal(accepted.json.height, 9, 'expected path PNG height to be 9');
    assert.ok(accepted.json.path.startsWith(path.join(inbox, key.slice(0, 8)) + path.sep), 'expected path attachment to be copied into the inbox');
    assert.deepEqual(await readFile(accepted.json.path), heroBytes, 'expected path attachment inbox copy to match source bytes');
    const fileUrl = await sendPath(pathToFileURL(source).href);
    assert.equal(fileUrl.status, 202, 'expected file:// image path to return 202');
    assert.equal((await sendPath(path.join(project, 'missing.png'))).status, 404, 'expected a missing image path to return 404');
    assert.equal((await sendPath(project)).status, 400, 'expected a directory path to return 400');
    const notes = path.join(project, 'notes.txt');
    await writeFile(notes, 'not an image');
    assert.equal((await sendPath(notes)).status, 415, 'expected a text file path to return 415');
    const outside = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-outside-')));
    try {
      const escaped = path.join(outside, 'outside.png');
      await writeFile(escaped, heroBytes);
      const link = path.join(project, 'escaped.png');
      await symlink(escaped, link);
      const symlinkResult = await sendPath(link);
      assert.equal(symlinkResult.status, 400, 'expected a symlink escaping project and home to return 400');
      assert.match(symlinkResult.json.error, /symlink/i, 'expected an escaping symlink error to name the symlink');
      assert.equal((await sendPath('hero-copy.png')).status, 400, 'expected a relative path to return 400');
      assert.equal((await sendPath('/etc/hosts')).status, 400, 'expected an absolute path outside home and project to return 400');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

realHttpTest('/grab expands known attachment records and rejects unknown ids', async () => {
  await withSession(async ({ session, key }) => {
    const grabUrl = `${session.url}/grab?key=${key}`;
    const sendGrab = (payload) => responseJson(grabUrl, Buffer.from(JSON.stringify(payload)), { 'Content-Type': 'application/json' });
    const unknown = await sendGrab({ selector: '#hero', attachments: [{ id: 'att_0000000000000000' }] });
    assert.equal(unknown.status, 400, 'expected /grab with an unknown attachment id to return 400');
    assert.match(unknown.json.error, /not found; re-drop it/, 'expected unknown attachment error to tell the user to re-drop it');
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    const upload = multipart([filePart('hero.png', 'image/png', bytes)]);
    const attached = await responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    assert.equal(attached.status, 202, 'expected attachment used by /grab to upload successfully');
    const imageTarget = { kind: 'img', selector: '#hero', currentSrc: 'https://example.test/hero.png', renderedWidth: 16, renderedHeight: 9 };
    const queued = await sendGrab({ selector: '#hero', attachments: [{ id: attached.json.id }], imageTarget });
    assert.equal(queued.status, 202, 'expected /grab with a known attachment id to return 202');
    const drained = await grabBridge.getGrabbedElements();
    assert.equal(drained.count, 1, 'expected /grab to queue exactly one element');
    assert.deepEqual(drained.elements[0].attachments[0], attached.json, 'expected drained attachment to equal the 202 attachment record');
    assert.deepEqual(drained.elements[0].imageTarget, imageTarget, 'expected imageTarget to round-trip verbatim through the drain');
  });
});

realHttpTest('attachment route rejects missing keys and is unavailable after the session stops', async () => {
  await withSession(async ({ session, key }) => {
    const noKey = await responseJson(attachmentUrl(session), Buffer.from('{}'), { 'Content-Type': 'application/json' });
    assert.equal(noKey.status, 403, 'expected POST /attachment without a capability key to return 403, matching /grab');
    await grabBridge.stopGrabSession();
    const stopped = await new Promise((resolve) => {
      const request = httpRequest(attachmentUrl(session, key), { method: 'POST' }, (response) => {
        response.resume();
        response.on('end', () => resolve(`status:${response.statusCode}`));
      });
      request.on('error', () => resolve('connection-refused'));
      request.end();
    });
    assert.ok(stopped === 'status:503' || stopped === 'connection-refused', `expected stopped bridge to return 503 or refuse the connection; bridge returned ${stopped}`);
  });
});

test('session startup prunes inbox directories older than seven days only', async () => {
  assert.ok(grabBridge, 'expected dist/grab-bridge.js to be built before attachment tests run');
  const project = await realpath(await mkdtemp(path.join(__dirname, 'fixtures', 'attachment-prune-')));
  const inbox = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-inbox-')));
  const oldInbox = process.env.RAVEN_GRAB_INBOX;
  process.env.RAVEN_GRAB_INBOX = inbox;
  const oldDir = path.join(inbox, 'deadbeef');
  const freshDir = path.join(inbox, 'cafef00d');
  // RAVEN_GRAB_INBOX may point at a directory the user also keeps other things
  // in; only directories shaped like a session key are ever removed.
  const foreignDir = path.join(inbox, 'photos');
  try {
    await writeFile(path.join(project, 'DESIGN.md'), '# Attachment prune fixture\n');
    await mkdir(oldDir);
    await mkdir(freshDir);
    await mkdir(foreignDir);
    const now = Date.now() / 1000;
    await utimes(oldDir, now - 8 * 24 * 60 * 60, now - 8 * 24 * 60 * 60);
    await utimes(freshDir, now - 6 * 24 * 60 * 60, now - 6 * 24 * 60 * 60);
    await utimes(foreignDir, now - 8 * 24 * 60 * 60, now - 8 * 24 * 60 * 60);
    await grabBridge.startGrabSession(path.join(project, 'DESIGN.md'));
    await assert.rejects(access(oldDir), { code: 'ENOENT' }, 'expected the eight-day-old inbox directory to be pruned');
    await access(freshDir);
    await access(foreignDir);
  } finally {
    await grabBridge.stopGrabSession();
    if (oldInbox === undefined) delete process.env.RAVEN_GRAB_INBOX;
    else process.env.RAVEN_GRAB_INBOX = oldInbox;
    await rm(project, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  }
});

// ---- adverse-pass findings (L10) ----

const grabInbox = grabBridge ? await import(path.resolve(__dirname, '../dist/grab-inbox.js')) : null;

realHttpTest('path route is refused while proxying a third-party origin; multipart still works', async () => {
  const project = await realpath(await mkdtemp(path.join(__dirname, 'fixtures', 'attachment-proxy-')));
  const inbox = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-inbox-')));
  const oldInbox = process.env.RAVEN_GRAB_INBOX;
  process.env.RAVEN_GRAB_INBOX = inbox;
  try {
    await writeFile(path.join(project, 'DESIGN.md'), '# proxy fixture\n');
    const source = path.join(project, 'hero-copy.png');
    await writeFile(source, await readFile(path.join(fixtureDir, 'hero.png')));
    const session = await grabBridge.startGrabSession(path.join(project, 'DESIGN.md'), undefined, 'https://example.invalid', 'consumer');
    assert.equal(session.mode, 'server');
    const key = keyFor(session);
    // A page proxied from a third-party origin shares the key with its own scripts,
    // so a JSON path body would let that page read any image under the home directory.
    const refused = await responseJson(attachmentUrl(session, key), Buffer.from(JSON.stringify({ path: source })), { 'Content-Type': 'application/json' });
    assert.equal(refused.status, 403, 'expected a path attachment on a third-party proxy to be refused');
    assert.match(refused.json.error, /local page/i);
    assert.deepEqual(await inboxEntries(inbox, key), []);
    const upload = multipart([filePart('hero.png', 'image/png', await readFile(path.join(fixtureDir, 'hero.png')))]);
    const accepted = await responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    assert.equal(accepted.status, 202, 'expected multipart bytes to stay accepted on a third-party proxy');
  } finally {
    await grabBridge.stopGrabSession();
    if (oldInbox === undefined) delete process.env.RAVEN_GRAB_INBOX; else process.env.RAVEN_GRAB_INBOX = oldInbox;
    await rm(project, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  }
});

test('path route checks the file size before reading it', async () => {
  const project = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-huge-')));
  const inbox = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-inbox-')));
  const oldInbox = process.env.RAVEN_GRAB_INBOX;
  process.env.RAVEN_GRAB_INBOX = inbox;
  try {
    // A sparse 3 GiB file costs no disk; reading it whole would throw
    // ERR_FS_FILE_TOO_LARGE (a 400) instead of the size refusal.
    const huge = path.join(project, 'huge.png');
    await writeFile(huge, '');
    const { truncate } = await import('node:fs/promises');
    await truncate(huge, 3 * 1024 * 1024 * 1024);
    const result = grabInbox.handleAttachmentRequest('0123456789abcdef', project, 'application/json', Buffer.from(JSON.stringify({ path: huge })));
    assert.equal(result.status, 413, `expected a 3 GiB path to be refused as oversized, got ${result.status} ${JSON.stringify(result.body)}`);
  } finally {
    if (oldInbox === undefined) delete process.env.RAVEN_GRAB_INBOX; else process.env.RAVEN_GRAB_INBOX = oldInbox;
    await rm(project, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  }
});

realHttpTest('multipart keeps file bytes that contain the boundary string', async () => {
  await withSession(async ({ session, key }) => {
    const boundary = 'raven-attachment-boundary';
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>--${boundary}--</text></svg>`);
    const upload = multipart([filePart('marker.svg', 'image/svg+xml', svg)], boundary);
    const accepted = await responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    assert.equal(accepted.status, 202, `expected the SVG to be accepted, got ${accepted.status} ${JSON.stringify(accepted.json)}`);
    assert.equal(accepted.json.bytes, svg.length, 'expected the stored size to equal the full file');
    assert.deepEqual(await readFile(accepted.json.path), svg, 'expected the stored bytes to equal the full file');
  });
});

realHttpTest('same bytes dedupe to one inbox file only under the same name', async () => {
  await withSession(async ({ session, inbox, key }) => {
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    const first = await responseJson(attachmentUrl(session, key), multipart([filePart('a.png', 'image/png', bytes)]).body, { 'Content-Type': multipart([]).contentType });
    const second = await responseJson(attachmentUrl(session, key), multipart([filePart('b.png', 'image/png', bytes)]).body, { 'Content-Type': multipart([]).contentType });
    const third = await responseJson(attachmentUrl(session, key), multipart([filePart('a.png', 'image/png', bytes)]).body, { 'Content-Type': multipart([]).contentType });
    assert.equal(first.status, 202); assert.equal(second.status, 202); assert.equal(third.status, 202);
    // The path the agent copies must carry the name the user gave, so a
    // second name for the same bytes gets its own file.
    assert.notEqual(second.json.path, first.json.path, 'expected a different name to get its own file');
    assert.equal(second.json.name, 'b.png', 'expected the record to keep the name the user gave');
    assert.equal(third.json.path, first.json.path, 'expected the same name and bytes to reuse the first file');
    assert.equal((await inboxEntries(inbox, key)).length, 2, 'expected one inbox file per distinct name');
  });
});

realHttpTest('/grab refuses more than four attachments', async () => {
  await withSession(async ({ session, key }) => {
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    const ids = [];
    for (const name of ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']) {
      const accepted = await responseJson(attachmentUrl(session, key), multipart([filePart(name, 'image/png', bytes)]).body, { 'Content-Type': multipart([]).contentType });
      ids.push({ id: accepted.json.id });
    }
    const grabUrl = `${session.url}/grab?key=${key}`;
    const refused = await responseJson(grabUrl, Buffer.from(JSON.stringify({ selector: '#hero', attachments: ids })), { 'Content-Type': 'application/json' });
    assert.equal(refused.status, 400, 'expected five attachments to be refused');
    const accepted = await responseJson(grabUrl, Buffer.from(JSON.stringify({ selector: '#hero', attachments: ids.slice(0, 4) })), { 'Content-Type': 'application/json' });
    assert.equal(accepted.status, 202, 'expected four attachments to be accepted');
  });
});

realHttpTest('a Content-Length above the cap is answered 413 without waiting for the body', async () => {
  await withSession(async ({ session, inbox, key }) => {
    const outcome = await new Promise((resolve) => {
      const request = httpRequest(attachmentUrl(session, key), {
        method: 'POST', headers: { 'Content-Type': multipart([]).contentType, 'Content-Length': 30 * 1024 * 1024 }
      }, (response) => {
        response.resume();
        response.on('end', () => resolve(`status:${response.statusCode}`));
      });
      request.on('error', (error) => resolve(`error:${error.code}`));
      request.setTimeout(5000, () => { request.destroy(); resolve('client-timeout'); });
      request.write(Buffer.from('--raven-attachment-boundary\r\n'));
    });
    assert.equal(outcome, 'status:413', `expected the server to answer 413 on the header alone; got ${outcome}`);
    assert.deepEqual(await inboxEntries(inbox, key), []);
  });
});

// ---- falsification-pass findings (Opus 5.5) ----

async function withLocalSession(prefix, fn) {
  assert.ok(grabBridge, 'expected dist/grab-bridge.js to be built before attachment tests run');
  const project = await realpath(await mkdtemp(path.join(__dirname, 'fixtures', prefix)));
  const inbox = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-inbox-')));
  const oldInbox = process.env.RAVEN_GRAB_INBOX;
  process.env.RAVEN_GRAB_INBOX = inbox;
  try {
    await writeFile(path.join(project, 'DESIGN.md'), '# fixture\n');
    const session = await grabBridge.startGrabSession(path.join(project, 'DESIGN.md'));
    await fn({ session, key: keyFor(session), project, inbox });
  } finally {
    await grabBridge.stopGrabSession();
    if (oldInbox === undefined) delete process.env.RAVEN_GRAB_INBOX; else process.env.RAVEN_GRAB_INBOX = oldInbox;
    await rm(project, { recursive: true, force: true });
    await rm(inbox, { recursive: true, force: true });
  }
}

realHttpTest('a session refuses its 33rd attachment record', async () => {
  await withLocalSession('attachment-cap-', async ({ session, key }) => {
    const base = await readFile(path.join(fixtureDir, 'hero.png'));
    // Bytes after IEND keep the PNG valid and give each upload a distinct sha.
    const post = async (i) => {
      const upload = multipart([filePart(`hero-${i}.png`, 'image/png', Buffer.concat([base, Buffer.from([i])]))]);
      return responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    };
    for (let i = 0; i < 32; i += 1) {
      assert.equal((await post(i)).status, 202, `expected upload ${i} to be accepted`);
    }
    const refused = await post(32);
    assert.equal(refused.status, 413, 'expected the 33rd record in one session to be refused');
    assert.match(refused.json.error, /32/);
  });
});

realHttpTest('a stored name always carries the extension of the sniffed image type', async () => {
  await withLocalSession('attachment-ext-', async ({ session, key, inbox }) => {
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    let salt = 0;
    // Each send gets distinct bytes so the sha dedupe does not fold them together.
    const send = async (name) => {
      const upload = multipart([filePart(name, 'image/png', Buffer.concat([bytes, Buffer.from([salt += 1])]))]);
      return responseJson(attachmentUrl(session, key), upload.body, { 'Content-Type': upload.contentType });
    };
    const html = await send('evil.html');
    assert.equal(html.status, 202);
    assert.ok(html.json.path.endsWith('-evil.png'), `expected .html on PNG bytes to be stored as .png, got ${html.json.path}`);
    const bare = await send('image');
    assert.equal(bare.status, 202);
    assert.ok(bare.json.path.endsWith('-image.png'), `expected a bare name to gain .png, got ${bare.json.path}`);
    const mismatch = await send('hero.jpg');
    assert.equal(mismatch.status, 415, 'expected an image extension that contradicts the bytes to stay refused');
    assert.ok((await inboxEntries(inbox, key)).every((entry) => entry.endsWith('.png')));
  });
});

realHttpTest('path route answers the same for a missing and a present file outside the permitted roots', async () => {
  await withLocalSession('attachment-oracle-', async ({ session, key }) => {
    const present = '/etc/hosts';
    const missing = '/etc/raven-does-not-exist.png';
    const a = await responseJson(attachmentUrl(session, key), Buffer.from(JSON.stringify({ path: present })), { 'Content-Type': 'application/json' });
    const b = await responseJson(attachmentUrl(session, key), Buffer.from(JSON.stringify({ path: missing })), { 'Content-Type': 'application/json' });
    assert.equal(a.status, 400);
    assert.equal(b.status, 400, 'expected a missing path outside the roots to be refused as out of bounds, not reported missing');
    assert.equal(a.json.error, b.json.error);
    assert.ok(!a.json.error.includes(present), 'expected the error not to echo the path');
  });
});

test('a dedupe hit touches the session inbox directory', async () => {
  assert.ok(grabInbox, 'expected dist/grab-inbox.js to be built');
  const inbox = await realpath(await mkdtemp(path.join(tmpdir(), 'raven-grab-inbox-')));
  const oldInbox = process.env.RAVEN_GRAB_INBOX;
  process.env.RAVEN_GRAB_INBOX = inbox;
  try {
    const key = 'abcdef0123456789';
    const bytes = await readFile(path.join(fixtureDir, 'hero.png'));
    grabInbox.storeAttachmentBytes(key, { name: 'hero.png', declaredMime: 'image/png', bytes, origin: 'drop' });
    const dir = path.join(inbox, key.slice(0, 8));
    const old = Date.now() / 1000 - 8 * 24 * 60 * 60;
    await utimes(dir, old, old);
    grabInbox.storeAttachmentBytes(key, { name: 'again.png', declaredMime: 'image/png', bytes, origin: 'drop' });
    const { mtimeMs } = await stat(dir);
    assert.ok(Date.now() - mtimeMs < 60 * 1000, 'expected the dedupe hit to refresh the directory mtime so a sibling session cannot prune it');
  } finally {
    if (oldInbox === undefined) delete process.env.RAVEN_GRAB_INBOX; else process.env.RAVEN_GRAB_INBOX = oldInbox;
    await rm(inbox, { recursive: true, force: true });
  }
});
