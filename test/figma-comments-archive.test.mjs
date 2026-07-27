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

function runCli(args, env = {}, stdin = null) {
  return new Promise(function (resolvePromise, rejectPromise) {
    const childEnv = { ...process.env, FIGMA_TOKEN: 'fixture-token', ...env };
    if (Object.prototype.hasOwnProperty.call(env, 'FIGMA_TOKEN') && env.FIGMA_TOKEN === undefined) delete childEnv.FIGMA_TOKEN;
    const child = spawn(process.execPath, [cli, ...args], {
      env: childEnv,
      stdio: [stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', function (chunk) { stdout += chunk; });
    child.stderr.on('data', function (chunk) { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', function (code, signal) { resolvePromise({ code, signal, stdout, stderr }); });
    if (stdin != null) child.stdin.end(stdin);
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

test('--paste needs no token, preserves raw bytes, and renders threads and replies in input order', async function (t) {
  const out = await tempOutput(t);
  const pasted = Buffer.from('andrew\r\n2 days ago\r\nFirst root\r\nmaya\r\njust now\r\nFirst reply\r\n\r\nsam\r\n2 days ago\r\nSecond root\r\nlee\r\nyesterday\r\nSecond reply\r\n');
  const result = await runCli(['--paste', 'panel-copy', '--out', out], { FIGMA_TOKEN: undefined }, pasted);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /archived 1\/1 file\(s\) → /);
  assert.deepEqual(await readFile(join(out, 'panel-copy.txt')), pasted);
  assert.deepEqual((await readdir(out)).sort(), ['panel-copy.md', 'panel-copy.txt']);

  const markdown = await readFile(join(out, 'panel-copy.md'), 'utf8');
  const firstThreadAt = markdown.indexOf('## Thread 1');
  const firstRootAt = markdown.indexOf('**andrew** · 2 days ago');
  const firstReplyAt = markdown.indexOf('> **maya** · just now');
  const secondThreadAt = markdown.indexOf('## Thread 2');
  const secondRootAt = markdown.indexOf('**sam** · 2 days ago');
  const secondReplyAt = markdown.indexOf('> **lee** · yesterday');
  assert.ok(firstThreadAt >= 0 && firstRootAt > firstThreadAt && firstReplyAt > firstRootAt);
  assert.ok(secondThreadAt > firstReplyAt && secondRootAt > secondThreadAt && secondReplyAt > secondRootAt);
  assert.match(markdown, /^# Figma comments archive: panel-copy$/m);
  assert.match(markdown, /## Thread 1\nanchor: unknown/);
  assert.match(markdown, /> First reply/);
  assert.match(markdown, /> Second reply/);
});

test('--paste keeps pasted order when relative timestamps sort lexically backwards', async function (t) {
  const out = await tempOutput(t);
  // "10 minutes ago" < "2 days ago" lexically, and root "5 days ago" > "2 days ago":
  // without pasted-position ordering, both the reply order and the thread order flip.
  const pasted = 'ana\n5 days ago\nOldest root\nben\n2 days ago\nMiddle reply\ncal\n10 minutes ago\nNewest reply\n\nzoe\n2 days ago\nSecond thread root\n';
  const result = await runCli(['--paste', 'ordering', '--out', out], { FIGMA_TOKEN: undefined }, pasted);
  assert.equal(result.code, 0, result.stderr);
  const markdown = await readFile(join(out, 'ordering.md'), 'utf8');
  const anaAt = markdown.indexOf('**ana** · 5 days ago');
  const benAt = markdown.indexOf('> **ben** · 2 days ago');
  const calAt = markdown.indexOf('> **cal** · 10 minutes ago');
  const zoeAt = markdown.indexOf('**zoe** · 2 days ago');
  assert.ok(anaAt >= 0 && benAt > anaAt && calAt > benAt, `pasted reply order lost:\n${markdown}`);
  assert.ok(zoeAt > calAt, `pasted thread order lost:\n${markdown}`);
});

test('--paste renders a headerless block as one unknown comment', async function (t) {
  const out = await tempOutput(t);
  const result = await runCli(['--paste', 'headerless', '--out', out], { FIGMA_TOKEN: undefined }, 'No copied author header\nJust the comment body.');
  assert.equal(result.code, 0, result.stderr);
  const markdown = await readFile(join(out, 'headerless.md'), 'utf8');
  assert.match(markdown, /\*\*unknown\*\* · unknown\nNo copied author header\nJust the comment body\./);
  assert.doesNotMatch(markdown, /## Thread 2/);
});

test('--paste rejects empty stdin', async function (t) {
  const out = await tempOutput(t);
  const result = await runCli(['--paste', 'empty', '--out', out], { FIGMA_TOKEN: undefined }, ' \n\t\r\n');
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Pasted comment text is empty/);
  assert.deepEqual(await readdir(out), []);
});

test('--paste is mutually exclusive with file keys and --resolve-nodes', async function () {
  const withKey = await runCli(['--paste', 'panel-copy', fixtureKey], { FIGMA_TOKEN: undefined }, 'comment');
  assert.equal(withKey.code, 2);
  assert.match(withKey.stderr, /Usage: node scripts\/figma-comments-archive\.mjs/);

  const withNodes = await runCli(['--paste', 'panel-copy', '--resolve-nodes'], { FIGMA_TOKEN: undefined }, 'comment');
  assert.equal(withNodes.code, 2);
  assert.match(withNodes.stderr, /Usage: node scripts\/figma-comments-archive\.mjs/);
});

test('--paste refuses to overwrite an existing label without --force', async function (t) {
  const out = await tempOutput(t);
  const first = await runCli(['--paste', 'archive', '--out', out], { FIGMA_TOKEN: undefined }, 'original paste');
  assert.equal(first.code, 0, first.stderr);

  const second = await runCli(['--paste', 'archive', '--out', out], { FIGMA_TOKEN: undefined }, 'second paste');
  assert.equal(second.code, 2);
  assert.match(second.stderr, /archive\.txt already exists .* --force/);
  assert.equal(await readFile(join(out, 'archive.txt'), 'utf8'), 'original paste');

  const forced = await runCli(['--paste', 'archive', '--out', out, '--force'], { FIGMA_TOKEN: undefined }, 'second paste');
  assert.equal(forced.code, 0, forced.stderr);
  assert.equal(await readFile(join(out, 'archive.txt'), 'utf8'), 'second paste');

  const patForce = await runCli(['--force', fixtureKey]);
  assert.equal(patForce.code, 2);
  assert.match(patForce.stderr, /Usage: node scripts\/figma-comments-archive\.mjs/);
});

test('--paste rejects labels that are not filesystem-safe', async function () {
  for (const label of ['unsafe label', 'unsafe/label', 'unsafe\\label']) {
    const result = await runCli(['--paste', label], { FIGMA_TOKEN: undefined }, 'comment');
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Invalid paste label:/);
  }
});
