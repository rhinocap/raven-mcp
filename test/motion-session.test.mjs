// The local motion session (src/motion-session.ts): a loopback server, separate
// from Raven Grab, that serves a registered playground file with a send block
// inserted and takes "Send to your agent" posts into a queue that
// get_motion_sends drains.
//
// What these tests hold: the page is served fresh with the block before
// </head> and the stated headers; the Host check, key, content type, body cap,
// body shape and playground id are each refused with their own status; sends
// drain once, a blocked waiter wakes on a send, and a full queue answers 503;
// symlinks and non-.html files are refused; both tools are on the stdio
// server and round-trip through MCP; and, when chromium launches, a real
// playground posts a send under its own CSP.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ms = await import('../dist/motion-session.js');
const { buildServer } = await import('../dist/index.js');
const { FsTasteStore } = await import('../dist/taste-store.js');
const mp = await import('../dist/motion-playground/index.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

// Same discriminator as test/motion-timeline.test.mjs: probe chromium once.
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch();
  await b.close();
} catch {
  chromium = null;
}
const noBrowser = !chromium && 'chromium did not launch';

afterEach(async () => { await ms.stopMotionSession(); });

const PAGE = '<!doctype html><html><head><title>t</title></HEAD><body><p>stage</p></body></html>';

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), 'raven-motion-session-'));
}

async function htmlFile(content = PAGE, name = 'play.html') {
  const dir = await tempDir();
  const file = path.join(dir, name);
  await writeFile(file, content);
  return file;
}

// node:http rather than fetch, so the Host header can be set.
function request(url, { method = 'GET', headers = {}, body } = {}) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function origin(url) { return new URL(url).origin; }

async function sendConfig(url) {
  const res = await request(url);
  const m = res.body.match(/<script type="application\/json" id="motion-send">([^<]*)<\/script>/);
  assert.ok(m, 'send block present');
  return JSON.parse(m[1]);
}

function post(url, body, headers = { 'Content-Type': 'application/json' }) {
  return request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

const goodBody = (playground, extra = {}) => ({ playground, instruction: 'Slower settle', context: 'Phase 2', packet: '{"duration":420}', ...extra });

test('register and GET serve the file with the send block before </head> and the stated headers', async () => {
  const file = await htmlFile();
  const { id, url } = await ms.registerPlayground(file);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.match(url, new RegExp('^http://127\\.0\\.0\\.1:\\d+/p/' + id + '$'));
  const res = await request(url);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['access-control-allow-origin'], undefined, 'no CORS headers');
  const m = res.body.match(/<script type="application\/json" id="motion-send">(\{"url":"\/send\?key=([0-9a-f]{64})","playground":"([0-9a-f]{16})"\})<\/script><\/HEAD>/);
  assert.ok(m, 'block sits immediately before the first </head>, in the exact shape');
  assert.equal(m[3], id);
  assert.equal(res.body.replace(m[0], '</HEAD>'), PAGE, 'nothing else in the file changes');
});

test('a file with no </head> gets the block before <body; neither is a 500', async () => {
  const { url } = await ms.registerPlayground(await htmlFile('<p>x</p><BODY>y</BODY>'));
  const res = await request(url);
  assert.equal(res.status, 200);
  assert.match(res.body, /^<p>x<\/p><script type="application\/json" id="motion-send">.*<\/script><BODY>y<\/BODY>$/);
  const none = await ms.registerPlayground(await htmlFile('<p>no head or body</p>'));
  assert.equal((await request(none.url)).status, 500);
});

test('unknown id and unknown paths are 404; OPTIONS is 405', async () => {
  const { url } = await ms.registerPlayground(await htmlFile());
  assert.equal((await request(origin(url) + '/p/0000000000000000')).status, 404);
  assert.equal((await request(origin(url) + '/elsewhere')).status, 404);
  const opt = await request(origin(url) + '/send', { method: 'OPTIONS', headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(opt.status, 405);
  assert.equal(opt.headers['access-control-allow-origin'], undefined);
});

test('a Host header other than 127.0.0.1:PORT or localhost:PORT is 421', async () => {
  const { url } = await ms.registerPlayground(await htmlFile());
  const port = new URL(url).port;
  assert.equal((await request(url, { headers: { Host: 'evil.example' } })).status, 421);
  assert.equal((await request(url, { headers: { Host: 'evil.example:' + port } })).status, 421);
  assert.equal((await request(url, { headers: { Host: 'localhost:' + port } })).status, 200);
});

test('POST /send refusals: no key 403, wrong key 403, wrong type 415, oversize 413, bad body 400, unknown playground 400', async () => {
  const { id, url } = await ms.registerPlayground(await htmlFile());
  const cfg = await sendConfig(url);
  const sendUrl = origin(url) + cfg.url;
  assert.equal((await post(origin(url) + '/send', goodBody(id))).status, 403);
  assert.equal((await post(origin(url) + '/send?key=' + '0'.repeat(64), goodBody(id))).status, 403);
  assert.equal((await post(sendUrl, goodBody(id), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(sendUrl, goodBody(id), {})).status, 415);
  const big = JSON.stringify(goodBody(id, { packet: 'x'.repeat(600 * 1024) }));
  assert.equal((await post(sendUrl, big)).status, 413, 'declared length over the cap');
  // Chunked, so only the streaming check can see the size.
  const chunked = await new Promise((resolve, reject) => {
    const u = new URL(sendUrl);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    for (let i = 0; i < 12; i++) req.write('x'.repeat(64 * 1024));
    req.end();
  });
  assert.equal(chunked, 413, 'streamed body over the cap');
  assert.equal((await post(sendUrl, '{not json')).status, 400);
  assert.equal((await post(sendUrl, { playground: id, instruction: 'x' })).status, 400, 'missing context and packet');
  assert.equal((await post(sendUrl, goodBody(id, { instruction: 'x'.repeat(4001) }))).status, 400);
  assert.equal((await post(sendUrl, goodBody(id, { title: 'x'.repeat(201) }))).status, 400);
  assert.equal((await post(sendUrl, goodBody('ffffffffffffffff'))).status, 400);
  assert.deepEqual((await ms.getMotionSends()).sends, [], 'nothing refused was queued');
});

test('a good send is 202 and getMotionSends drains it once with playground_url and html_path', async () => {
  const file = await htmlFile();
  const { id, url } = await ms.registerPlayground(file);
  const cfg = await sendConfig(url);
  const res = await post(origin(url) + cfg.url, goodBody(id, { instruction: '', title: 'Keyfob' }));
  assert.equal(res.status, 202);
  assert.deepEqual(JSON.parse(res.body), { queued: true });
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  const out = await ms.getMotionSends();
  assert.equal(out.waiting_url_count, 1);
  assert.equal(out.sends.length, 1);
  const s = out.sends[0];
  assert.match(s.id, /^[0-9a-f]{16}$/);
  assert.ok(!Number.isNaN(Date.parse(s.received_at)));
  assert.equal(s.playground_id, id);
  assert.equal(s.playground_url, url);
  assert.equal(s.html_path, file);
  assert.equal(s.title, 'Keyfob');
  assert.equal(s.instruction, '');
  assert.equal(s.context, 'Phase 2');
  assert.equal(s.packet, '{"duration":420}');
  assert.deepEqual((await ms.getMotionSends()).sends, [], 'drained once');
});

test('a waiter blocked in getMotionSends(5000) resolves when a send arrives', async () => {
  const { id, url } = await ms.registerPlayground(await htmlFile());
  const cfg = await sendConfig(url);
  const started = Date.now();
  const a = ms.getMotionSends(5000);
  const b = ms.getMotionSends(5000);
  let bDone = false;
  b.then(() => { bDone = true; });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await post(origin(url) + cfg.url, goodBody(id))).status, 202);
  const ra = await a;
  assert.ok(Date.now() - started < 4000, 'resolved on the send, not the timeout');
  assert.equal(ra.sends.length, 1);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(bDone, false, 'one send goes to one waiter; the other keeps waiting');
  assert.equal((await post(origin(url) + cfg.url, goodBody(id))).status, 202);
  const rb = await b;
  assert.ok(Date.now() - started < 4000, 'the second waiter resolved on the second send');
  assert.equal(rb.sends.length, 1);
  assert.notEqual(rb.sends[0].id, ra.sends[0].id, 'no send is handed out twice');
  const empty = await ms.getMotionSends(50);
  assert.deepEqual(empty.sends, [], 'a timed-out wait returns no sends');
});

test('the queue holds 50 sends and answers 503 beyond that', async () => {
  const { id, url } = await ms.registerPlayground(await htmlFile());
  const sendUrl = origin(url) + (await sendConfig(url)).url;
  for (let i = 0; i < ms.MAX_QUEUE; i++) assert.equal((await post(sendUrl, goodBody(id))).status, 202);
  assert.equal((await post(sendUrl, goodBody(id))).status, 503);
  assert.equal((await ms.getMotionSends()).sends.length, 50);
  assert.equal((await post(sendUrl, goodBody(id))).status, 202, 'room again after a drain');
});

test('register refuses a symlink, a non-.html file, a missing file and a directory', async () => {
  const real = await htmlFile();
  const link = path.join(path.dirname(real), 'link.html');
  await symlink(real, link);
  await assert.rejects(ms.registerPlayground(link), /symlink/);
  const txt = await htmlFile(PAGE, 'play.txt');
  await assert.rejects(ms.registerPlayground(txt), /must end in \.html/);
  await assert.rejects(ms.registerPlayground(path.join(path.dirname(real), 'missing.html')), /No file/);
  const dir = path.join(await tempDir(), 'dir.html');
  await (await import('node:fs/promises')).mkdir(dir);
  await assert.rejects(ms.registerPlayground(dir), /not a regular file/);
});

test('a file edited after register is served fresh; registering again gives a fresh id', async () => {
  const file = await htmlFile();
  const first = await ms.registerPlayground(file);
  await writeFile(file, '<html><head><title>v2</title></head><body>rebuilt</body></html>');
  const res = await request(first.url);
  assert.match(res.body, /rebuilt/);
  assert.doesNotMatch(res.body, /stage/);
  const second = await ms.registerPlayground(file);
  assert.notEqual(second.id, first.id);
  assert.equal((await ms.getMotionSends()).waiting_url_count, 2);
});

test('only the newest 64 registrations are kept', async () => {
  const file = await htmlFile();
  const first = await ms.registerPlayground(file);
  for (let i = 0; i < ms.MAX_REGISTERED; i++) await ms.registerPlayground(file);
  assert.equal((await request(first.url)).status, 404, 'the oldest was dropped');
  assert.equal((await ms.getMotionSends()).waiting_url_count, 64);
});

async function withClient(fn) {
  const home = await tempDir();
  const prev = process.env.RAVEN_TASTE_HOME;
  process.env.RAVEN_TASTE_HOME = home;
  const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
  const client = new Client({ name: 'motion-session-test', version: '1.0.0' }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    return await fn(client, home);
  } finally {
    await client.close();
    await server.close();
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
}

// The hosted builds are not built here: buildServer({ remote: true }) latches
// the whole process as remote. test/gate-list-drift.test.mjs holds that no
// gated name reaches a hosted build.
test('both tools are on the stdio server', async () => {
  await withClient(async (client) => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes('open_motion_playground'));
    assert.ok(names.includes('get_motion_sends'));
  });
});

test('open_motion_playground, fetch, POST /send and get_motion_sends round-trip through MCP', async () => {
  await withClient(async (client) => {
    const file = await htmlFile();
    const opened = JSON.parse((await client.callTool({ name: 'open_motion_playground', arguments: { html_path: file } })).content[0].text);
    assert.equal(opened.html_path, file);
    assert.match(opened.playground_id, /^[0-9a-f]{16}$/);
    assert.ok(opened.url.endsWith('/p/' + opened.playground_id));
    assert.ok(Array.isArray(opened.next) && opened.next.some((n) => /get_motion_sends/.test(n)));
    const cfg = await sendConfig(opened.url);
    assert.equal(cfg.playground, opened.playground_id);
    const wait = client.callTool({ name: 'get_motion_sends', arguments: { timeout_ms: 5000 } });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await post(origin(opened.url) + cfg.url, goodBody(opened.playground_id))).status, 202);
    const got = JSON.parse((await wait).content[0].text);
    assert.equal(got.sends.length, 1);
    assert.equal(got.sends[0].instruction, 'Slower settle');
    assert.equal(got.sends[0].playground_url, opened.url);
    assert.equal(got.sends[0].html_path, file);
    assert.equal(got.waiting_url_count, 1);
    const refused = await client.callTool({ name: 'open_motion_playground', arguments: { html_path: file.replace(/\.html$/, '.txt') } });
    assert.equal(refused.isError, true);
  });
});

test('create_motion_playground points at open_motion_playground for Send and not at Grab', async () => {
  await withClient(async (client, home) => {
    const res = JSON.parse((await client.callTool({ name: 'create_motion_playground', arguments: { motif: mp.MOTION_MOTIFS[0], output_path: path.join(home, 'p.html') } })).content[0].text);
    const next = res.next.join(' ');
    assert.match(next, /open_motion_playground/);
    assert.doesNotMatch(next, /Grab|script tag/i);
  });
});

test('a real playground served by the session posts a send under its own CSP', { skip: noBrowser }, async () => {
  const home = await tempDir();
  const prev = process.env.RAVEN_TASTE_HOME;
  process.env.RAVEN_TASTE_HOME = home;
  let built;
  try {
    built = await mp.createMotionPlayground({ store: new FsTasteStore(), motif: mp.MOTION_MOTIFS[0], output_path: path.join(home, 'real.html') });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
  const { id, url } = await ms.registerPlayground(built.html_path);
  const served = (await request(url)).body;
  const csp = served.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  const policy = csp && csp[1].replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');
  assert.ok(policy && /default-src 'none'/.test(policy) && /connect-src 'self'/.test(policy), 'the page keeps its own strict CSP');
  assert.ok(served.indexOf(csp[0]) < served.indexOf('id="motion-send"'), 'the CSP meta comes before the send block');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(e.violatedDirective + ' ' + e.blockedURI);
      });
    });
    await page.goto(url);
    await page.waitForLoadState('load');
    const result = await page.evaluate(async (playground) => {
      const cfg = JSON.parse(document.getElementById('motion-send').textContent);
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playground, instruction: 'From the page', context: 'stage', packet: '{}' }),
      });
      return { status: res.status, body: await res.text(), cfgPlayground: cfg.playground };
    }, id);
    assert.equal(result.cfgPlayground, id);
    assert.equal(result.status, 202);
    assert.deepEqual(JSON.parse(result.body), { queued: true });
    // Let any late violation report land before reading the list.
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__cspViolations), [], 'no CSP violation');
    const out = await ms.getMotionSends();
    assert.equal(out.sends.length, 1);
    assert.equal(out.sends[0].instruction, 'From the page');
    assert.equal(out.sends[0].html_path, built.html_path);
  } finally {
    await browser.close();
  }
});

test('the send block goes before the real </head>, not one inside a comment or raw text', () => {
  const block = (h) => ms.insertSendBlock(h, 'k', 'p');
  const at = (h) => block(h).indexOf('<script type="application/json" id="motion-send">');
  for (const [html, real] of [
    ['<html><head><!-- keep settings before </head> --><title>a</head></title><style>x{}</head></style></head><body></body></html>', '</style></head>'],
    ['<html><head><script>var s = "</head>";</script></head><body><textarea></head></textarea></body></html>', '</script></head>'],
  ]) {
    assert.ok(block(html).includes('{"url":"/send?key=k","playground":"p"}'));
    assert.equal(at(html), html.indexOf(real) + real.indexOf('</head>'), 'inserted before the one real </head>');
  }
  for (const [html, real] of [
    ['<html><head><meta content="<!--"><script-data>x</script-data></head><body><p>--></p></body></html>', '</script-data></head>'],
    ['<html><head><meta name="x" content="</head>"><scriptx></scriptx></head><body></body></html>', '</scriptx></head>'],
  ]) assert.equal(at(html), html.indexOf(real) + real.indexOf('</head>'), 'a look-alike tag or a quoted attribute does not move the insertion: ' + html);
  const noHead = '<!-- <body> --><body><p>x</p></body>';
  assert.equal(at(noHead), noHead.lastIndexOf('<body>'), 'without </head>, before the real <body');
  assert.equal(block('<p>no head or body</p><!-- </head> -->'), null);
});
