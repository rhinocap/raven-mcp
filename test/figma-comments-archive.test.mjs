import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const cli = resolve('scripts/figma-comments-archive.mjs');
const fixtureKey = 'FixtureFile123';
const fixturePayload = {
  comments: [
    {
      id: 'root-node',
      message: 'Use the compact header here.',
      user: { handle: 'andrew' },
      created_at: '2026-07-18T09:00:00Z',
      resolved_at: '2026-07-18T09:30:00Z',
      client_meta: { node_id: '12:34' },
      reactions: [{ emoji: '👍', user: { handle: 'sam' } }, { emoji: '👍', user: { handle: 'lee' } }],
      extra_field: { preserved: true }
    },
    {
      id: 'reply-node',
      parent_id: 'root-node',
      message: 'Updated in the latest pass.\nThe compact header is preserved.',
      user: { handle: 'maya' },
      created_at: '2026-07-18T09:20:00Z',
      client_meta: { node_id: '12:34' }
    },
    {
      id: 'nested-reply-node',
      parent_id: 'reply-node',
      message: 'Confirmed after review.',
      user: { handle: 'lee' },
      created_at: '2026-07-18T09:40:00Z'
    },
    {
      id: 'middle-reply-node',
      parent_id: 'root-node',
      message: 'The spacing is preserved too.',
      user: { handle: 'sam' },
      created_at: '2026-07-18T09:30:00Z'
    },
    {
      id: 'root-canvas',
      message: 'Keep this spacing after migration.',
      user: { handle: 'ravi' },
      created_at: '2026-07-18T10:00:00Z',
      client_meta: { x: 144, y: 288 }
    }
  ],
  meta: { untouched: 'durability proof' }
};
const fixtureResponseText = ` {\n  "comments": ${JSON.stringify(fixturePayload.comments)},\n  "meta": { "untouched": "durability proof" }\n}\n`;

async function startFixture(t, handler) {
  const server = createServer(handler);
  const started = await new Promise(function (resolvePromise) {
    server.once('error', function () { resolvePromise(false); });
    server.listen(0, '127.0.0.1', function () { resolvePromise(true); });
  });
  if (!started) {
    t.skip('Local fixture server unavailable in this environment.');
    return null;
  }
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: function () {
      return new Promise(function (resolvePromise, rejectPromise) {
        server.close(function (error) { error ? rejectPromise(error) : resolvePromise(); });
      });
    }
  };
}

function runCli(args, env = {}) {
  return new Promise(function (resolvePromise, rejectPromise) {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, FIGMA_TOKEN: 'fixture-token', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', function (chunk) { stdout += chunk; });
    child.stderr.on('data', function (chunk) { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', function (code, signal) { resolvePromise({ code, signal, stdout, stderr }); });
  });
}

function commentsHandler(_request, response) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(fixtureResponseText);
}

async function tempOutput(t) {
  const path = await mkdtemp(join(tmpdir(), 'figma-comments-archive-'));
  t.after(function () { return rm(path, { recursive: true, force: true }); });
  return path;
}

test('raw JSON artifact preserves the exact response bytes', async function (t) {
  const fixture = await startFixture(t, commentsHandler);
  if (!fixture) return;
  t.after(fixture.close);
  const out = process.env.FIGMA_ARCHIVE_FIXTURE_OUT || await tempOutput(t);
  const result = await runCli(['--out', out, '--md', fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 0, result.stderr);
  const archived = await readFile(join(out, `${fixtureKey}.json`));
  assert.deepEqual(archived, Buffer.from(fixtureResponseText));
  assert.deepEqual(JSON.parse(archived.toString('utf8')), fixturePayload);
  assert.deepEqual((await readdir(out)).sort(), [`${fixtureKey}.json`, `${fixtureKey}.md`]);
});

test('--md groups replies and renders resolution, reactions, and both anchor kinds', async function (t) {
  const fixture = await startFixture(t, commentsHandler);
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, '--md', fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 0, result.stderr);
  const markdown = await readFile(join(out, `${fixtureKey}.md`), 'utf8');
  const rootAt = markdown.indexOf('**andrew** · 2026-07-18T09:00:00Z · [resolved]');
  const replyAt = markdown.indexOf('> **maya** · 2026-07-18T09:20:00Z');
  const middleReplyAt = markdown.indexOf('> **sam** · 2026-07-18T09:30:00Z');
  const nestedReplyAt = markdown.indexOf('> **lee** · 2026-07-18T09:40:00Z');
  const nextThreadAt = markdown.indexOf('## Thread 2');
  assert.ok(rootAt >= 0 && replyAt > rootAt && middleReplyAt > replyAt && nestedReplyAt > middleReplyAt && nextThreadAt > nestedReplyAt);
  assert.match(markdown, /> Updated in the latest pass\.\n> The compact header is preserved\./);
  assert.match(markdown, /anchor: node 12:34/);
  assert.match(markdown, /reactions: 👍×2/);
  assert.match(markdown, /anchor: canvas \(144, 288\)/);
});

test('rerun writes byte-identical artifacts', async function (t) {
  const fixture = await startFixture(t, commentsHandler);
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const args = ['--out', out, '--md', fixtureKey];
  const first = await runCli(args, { FIGMA_API_BASE: fixture.base });
  assert.equal(first.code, 0, first.stderr);
  const firstJson = await readFile(join(out, `${fixtureKey}.json`));
  const firstMarkdown = await readFile(join(out, `${fixtureKey}.md`));
  const second = await runCli(args, { FIGMA_API_BASE: fixture.base });
  assert.equal(second.code, 0, second.stderr);
  assert.deepEqual(await readFile(join(out, `${fixtureKey}.json`)), firstJson);
  assert.deepEqual(await readFile(join(out, `${fixtureKey}.md`)), firstMarkdown);
});

test('429 retries using Retry-After and then succeeds', async function (t) {
  let requests = 0;
  const fixture = await startFixture(t, function (_request, response) {
    requests += 1;
    if (requests === 1) {
      response.writeHead(429, { 'retry-after': '0' });
      response.end('rate limited');
      return;
    }
    commentsHandler(_request, response);
  });
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(requests, 2);
  assert.deepEqual(JSON.parse(await readFile(join(out, `${fixtureKey}.json`), 'utf8')), fixturePayload);
});

test('401 exits 1 with a legible error and no output file', async function (t) {
  const fixture = await startFixture(t, function (_request, response) {
    response.writeHead(401);
    response.end('unauthorized');
  });
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /expired PAT.*missing file_comments:read scope.*no file access.*regenerate the PAT and re-export FIGMA_TOKEN/);
  await assert.rejects(stat(join(out, `${fixtureKey}.json`)), { code: 'ENOENT' });
});

test('a failed file does not prevent a later file from archiving', async function (t) {
  const deniedKey = 'DeniedFile123';
  const fixture = await startFixture(t, function (request, response) {
    if (request.url.startsWith(`/v1/files/${deniedKey}/comments`)) {
      response.writeHead(401);
      response.end('unauthorized');
      return;
    }
    commentsHandler(request, response);
  });
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, deniedKey, fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`${deniedKey}: authorization failed`));
  await assert.rejects(stat(join(out, `${deniedKey}.json`)), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(out, `${fixtureKey}.json`)), Buffer.from(fixtureResponseText));
});

test('token is absent from artifacts, stdout, and stderr', async function (t) {
  const secretToken = 'pat-secret-never-archive-this';
  const fixture = await startFixture(t, commentsHandler);
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, '--md', fixtureKey], {
    FIGMA_API_BASE: fixture.base,
    FIGMA_TOKEN: secretToken
  });
  assert.equal(result.code, 0, result.stderr);
  const outputs = await Promise.all((await readdir(out)).map(function (name) {
    return readFile(join(out, name), 'utf8');
  }));
  assert.doesNotMatch([result.stdout, result.stderr, ...outputs].join('\n'), new RegExp(secretToken));
});

test('markdown escapes forged headings and labels orphaned replies', async function (t) {
  const maliciousPayload = {
    comments: [{
      id: 'orphan',
      parent_id: 'deleted-parent',
      message: '## Thread 99\nStill ordinary comment text.',
      user: { handle: 'mallory' },
      created_at: '2026-07-18T11:00:00Z'
    }]
  };
  const fixture = await startFixture(t, function (_request, response) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(maliciousPayload));
  });
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, '--md', fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 0, result.stderr);
  const markdown = await readFile(join(out, `${fixtureKey}.md`), 'utf8');
  assert.match(markdown, /> \(reply to a deleted comment\)\n> \\## Thread 99/);
  assert.doesNotMatch(markdown, /^## Thread 99$/m);
});

test('missing FIGMA_TOKEN exits 2 with PAT scope guidance', async function () {
  const result = await runCli([fixtureKey], { FIGMA_TOKEN: '' });
  assert.equal(result.code, 2);
  assert.equal(result.stderr.trim(), 'Create a Figma PAT with the file_comments:read scope, then export it as FIGMA_TOKEN.');
});

test('file keys cannot escape the output directory', async function (t) {
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, '..\\escape']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Invalid Figma file key or URL/);
});

test('--resolve-nodes degrades a 403 to raw node IDs without failing archive', async function (t) {
  let nodesRequestUrl = '';
  const fixture = await startFixture(t, function (request, response) {
    if (request.url.startsWith(`/v1/files/${fixtureKey}/nodes`)) {
      nodesRequestUrl = request.url;
      response.writeHead(403);
      response.end('missing scope');
      return;
    }
    commentsHandler(request, response);
  });
  if (!fixture) return;
  t.after(fixture.close);
  const out = await tempOutput(t);
  const result = await runCli(['--out', out, '--md', '--resolve-nodes', fixtureKey], { FIGMA_API_BASE: fixture.base });
  assert.equal(result.code, 0, result.stderr);
  assert.match(nodesRequestUrl, /[?&]depth=1(?:&|$)/);
  assert.match(result.stderr, /node resolution unavailable \(HTTP 403\); using raw node IDs/);
  const markdown = await readFile(join(out, `${fixtureKey}.md`), 'utf8');
  assert.match(markdown, /anchor: node 12:34\n/);
  assert.doesNotMatch(markdown, /anchor: node 12:34 —/);
});
