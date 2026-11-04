// Motion in Grab (spec v0.3): the bridge's /motion/suggest and /motion/job/:id routes.
// Most tests swap suggestMotion for a fake so they can hold a job open, time it out or
// count what it registered; the last one runs the real suggestMotion on the fixture site
// to show the taste binding comes from the session, not the request.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RAVEN_NO_USAGE_LOG = '1';

const bridge = await import('../dist/grab-bridge.js');
const motionSession = await import('../dist/motion-session.js');
const taste = await import('../dist/taste.js');
const { FsTasteStore } = await import('../dist/taste-store.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, 'fixtures', 'motion', 'site');

let chromiumOk = true;
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  await b.close();
} catch {
  chromiumOk = false;
}

after(async () => {
  await bridge.stopGrabSession();
  await motionSession.stopMotionSession();
});

const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2' };

/** The designer's dev server: serves the fixture site and records every request. */
async function upstream() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.method + ' ' + req.url);
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SITE, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!file.startsWith(SITE)) { res.statusCode = 404; res.end(); return; }
    readFile(file).then((body) => {
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    }, () => { res.statusCode = 404; res.end('upstream 404'); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    seen,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

async function designFile() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-motion-'));
  const p = path.join(dir, 'DESIGN.md');
  await writeFile(p, '---\nname: "Motion fixture"\n---\n# Fixture\n', 'utf8');
  return p;
}

function keyOf(session) {
  return new URL(session.script_tag.match(/src="([^"]*raven-grab\.js[^"]*)"/)[1]).searchParams.get('key');
}

function request(url, { method = 'GET', body, host } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { ...(data !== undefined ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...(host ? { host } : {}) },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(text); } catch { json = undefined; }
        resolve({ status: res.statusCode, text, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

async function withSession(fn, { motion, proxy = 'loopback' } = {}) {
  const site = await upstream();
  const store = new FsTasteStore();
  const target = proxy === 'loopback' ? site.origin : proxy === 'none' ? undefined : proxy;
  const session = await bridge.startGrabSession(await designFile(), undefined, target, 'consumer', motion === null ? undefined : { motion: { store, ...(motion || {}) } });
  const key = keyOf(session);
  const base = session.url;
  const api = {
    session, key, site, store,
    suggest: (body, k = key) => request(`${base}/motion/suggest?key=${k}`, { method: 'POST', body }),
    job: (id, k = key) => request(`${base}/motion/job/${id}?key=${k}`),
    async settle(id) {
      for (let i = 0; i < 400; i++) {
        const r = await api.job(id);
        if (r.json && r.json.state !== 'running') return r;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('job never settled: ' + id);
    },
  };
  try {
    return await fn(api);
  } finally {
    await bridge.stopGrabSession();
    await site.close();
  }
}

/** A suggestMotion stand-in. `gate` holds the job open until released. */
function fakeSuggest({ gate, register = 0, fail } = {}) {
  const calls = [];
  const fn = async (input) => {
    calls.push(input);
    if (gate) await gate.promise;
    if (fail) throw fail;
    const suggestions = [];
    for (let i = 0; i < register; i++) {
      const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-motion-pg-'));
      const html = path.join(dir, 'p.html');
      await writeFile(html, '<!doctype html><title>p</title><p>playground</p>', 'utf8');
      const reg = await motionSession.registerPlayground(html, { owner: input.owner });
      fn.registered.push(reg.id);
      suggestions.push({
        id: 'cta-hover-' + i, kind: 'cta-hover', label: 'Button hover', why: 'A reason.', trigger_words: 'When someone hovers.',
        approximations: [], url: reg.url, parts: [{ selector: '#go', tag: 'button', role: '', text: 'Start a project', src: '', href: '', dup: 1, nth: 0 }],
        playground_id: reg.id, fragment: '<div>SECRET FRAGMENT</div>', html_path: html, timeline: { secret: true },
      });
    }
    return { suggestions, failed: [], uses_taste: false, warnings: [], next: '' };
  };
  fn.calls = calls;
  fn.registered = [];
  return fn;
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('the routes answer locally on a loopback upstream, and nothing reaches the dev server', async () => {
  const fake = fakeSuggest({ register: 1 });
  await withSession(async ({ suggest, settle, site }) => {
    const before = site.seen.length;
    const r = await suggest({ path: '/picked.html' });
    assert.equal(r.status, 202, r.text);
    assert.match(r.json.job, /^[0-9a-f]{16}$/);
    const done = await settle(r.json.job);
    assert.equal(done.json.state, 'done', done.text);
    assert.equal(site.seen.slice(before).filter((s) => /\/motion\//.test(s)).length, 0, 'no motion route forwarded: ' + site.seen.join(', '));
    assert.equal(fake.calls[0].url, site.origin + '/picked.html');
    assert.equal(fake.calls[0].viewport, 'desktop');
  }, { motion: { suggest: fake } });
});

test('a job response carries no fragment, timeline or local path', async () => {
  const fake = fakeSuggest({ register: 1 });
  await withSession(async ({ suggest, settle }) => {
    const r = await suggest({ path: '/', selector: '#go', trigger: 'hover' });
    const done = await settle(r.json.job);
    assert.equal(done.json.suggestions.length, 1);
    assert.doesNotMatch(done.text, /SECRET|html_path|timeline|playground_id|\/var\/|\/tmp\//);
    const s = done.json.suggestions[0];
    assert.deepEqual(Object.keys(s).sort(), ['approximations', 'id', 'kind', 'label', 'parts', 'trigger_words', 'url', 'why']);
    assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+\/p\/[0-9a-f]{16}$/);
    assert.deepEqual(done.json.inputs, { path: '/', selector: '#go', trigger: 'hover' });
  }, { motion: { suggest: fake } });
});

test('the routes need the key, and serve 127.0.0.1 only', async () => {
  const fake = fakeSuggest();
  await withSession(async ({ session, suggest, job, site }) => {
    const before = site.seen.length;
    // Without the right key the path may be the app's own route: it goes upstream, and
    // the app answers. Raven starts nothing.
    assert.equal((await suggest({ path: '/' }, 'f'.repeat(64))).text, 'upstream 404');
    assert.equal((await job('0123456789abcdef', 'f'.repeat(64))).text, 'upstream 404');
    const unkeyed = await request(`${session.url}/motion/suggest`, { method: 'POST', body: { path: '/' } });
    assert.equal(unkeyed.text, 'upstream 404');
    assert.equal(site.seen.length, before + 3);
    const rebound = await request(`${session.url}/motion/suggest?key=x`, { method: 'POST', body: { path: '/' }, host: 'evil.example:' + session.port });
    assert.equal(rebound.status, 421);
    assert.equal(fake.calls.length, 0);
  }, { motion: { suggest: fake } });
});

test('on a third-party upstream the keyed routes get a local 404 and nothing is forwarded', async () => {
  const fake = fakeSuggest();
  // A name that cannot resolve: any forwarded request would fail loudly instead of 404ing.
  await withSession(async ({ suggest, job }) => {
    const r = await suggest({ path: '/' });
    assert.equal(r.status, 404);
    assert.match(r.text, /Not available while proxying a third-party site/);
    assert.equal((await job('0123456789abcdef')).status, 404);
    assert.equal(fake.calls.length, 0);
  }, { motion: { suggest: fake }, proxy: 'https://shop.example.invalid' });
});

test('with no proxy, or no motion options, the routes say Motion needs a dev server session', async () => {
  const fake = fakeSuggest();
  await withSession(async ({ suggest }) => {
    const r = await suggest({ path: '/' });
    assert.equal(r.status, 404);
    assert.match(r.json.error, /Motion needs a Grab session on your own dev server/);
  }, { motion: { suggest: fake }, proxy: 'none' });
  await withSession(async ({ suggest }) => {
    assert.equal((await suggest({ path: '/' })).status, 404);
  }, { motion: null });
  assert.equal(fake.calls.length, 0);
});

test('the overlay config says full on a loopback upstream and copy on a third-party one', async () => {
  const cfgOf = async (session) => {
    const page = await request(session.url + '/picked.html');
    const src = page.text.match(/<script src="(\/raven-grab\.js\?[^"]*&cfg=[^"]+)"><\/script>/);
    assert.ok(src, 'overlay tag in proxied page');
    return JSON.parse(new URL(src[1], session.url).searchParams.get('cfg'));
  };
  await withSession(async ({ session }) => {
    assert.equal((await cfgOf(session)).motion, 'full');
  }, { motion: { suggest: fakeSuggest() } });
  await withSession(async ({ session }) => {
    assert.equal((await cfgOf(session)).motion, undefined);
  }, { motion: null });
});

test('bad paths, selectors and triggers are refused before any work', async () => {
  const fake = fakeSuggest();
  await withSession(async ({ suggest, session, key }) => {
    const bads = [
      {}, { path: '' }, { path: 'pricing' }, { path: '//evil.example/x' }, { path: 'http://evil.example/' },
      { path: 'javascript:alert(1)' }, { path: '/\\evil.example' }, { path: '/a\u0000b' }, { path: '/' + 'a'.repeat(2048) },
      { path: '/', selector: '' }, { path: '/', selector: 'a'.repeat(513) }, { path: '/', selector: 5 },
      { path: '/', trigger: 'hover' }, { path: '/', selector: '#go', trigger: 'click' },
    ];
    for (const body of bads) {
      const r = await suggest(body);
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80) + ' -> ' + r.status + ' ' + r.text);
    }
    const notJson = await request(`${session.url}/motion/suggest?key=${key}`, { method: 'POST', body: '{nope' });
    assert.equal(notJson.status, 400);
    assert.equal((await request(`${session.url}/motion/suggest?key=${key}`)).status, 405);
    assert.equal((await request(`${session.url}/motion/job/zz?key=${key}`)).status, 404);
    assert.equal(fake.calls.length, 0);
  }, { motion: { suggest: fake } });
});

test('one job at a time, and the eleventh start in ten minutes is refused', async () => {
  const gate = deferred();
  const fake = fakeSuggest({ gate });
  await withSession(async ({ suggest, settle }) => {
    const first = await suggest({ path: '/' });
    assert.equal(first.status, 202);
    const busy = await suggest({ path: '/' });
    assert.equal(busy.status, 409);
    assert.equal(busy.json.job, first.json.job);
    gate.resolve();
    await settle(first.json.job);
    for (let i = 1; i < 10; i++) {
      const r = await suggest({ path: '/' });
      assert.equal(r.status, 202, 'start ' + (i + 1));
      await settle(r.json.job);
    }
    const eleventh = await suggest({ path: '/' });
    assert.equal(eleventh.status, 429);
    assert.equal(eleventh.json.error, 'Wait a few minutes.');
    assert.equal(fake.calls.length, 10);
  }, { motion: { suggest: fake } });
});

test('a job that hangs fails at the deadline, aborts its work, and its late playgrounds are taken back', async () => {
  const gate = deferred();
  const fake = fakeSuggest({ gate, register: 2 });
  await withSession(async ({ suggest, job }) => {
    const r = await suggest({ path: '/' });
    const id = r.json.job;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const timedOut = await job(id);
    assert.equal(timedOut.json.state, 'failed');
    assert.equal(timedOut.json.message, 'It took too long.');
    assert.equal(fake.calls[0].signal.aborted, true);
    // The work is still winding down, so the slot stays taken: no overlap.
    assert.equal((await suggest({ path: '/' })).status, 409);
    gate.resolve();
    // A 409 does not count as a start, so polling for the free slot is safe.
    let next;
    for (let i = 0; i < 100; i++) {
      next = await suggest({ path: '/' });
      if (next.status !== 409) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(next.status, 202, 'slot free once the late work settled');
    const after = await job(id);
    assert.equal(after.json.state, 'failed', 'a late result does not turn the job done');
    assert.equal(after.json.suggestions, undefined);
    assert.equal(fake.registered.length, 2);
    for (const pid of fake.registered) assert.equal(motionSession.isPlaygroundRegistered(pid), false, 'late playground unregistered: ' + pid);
  }, { motion: { suggest: fake, deadlineMs: 150 } });
});

test('stopping the Grab session cancels the job and aborts its work', async () => {
  const gate = deferred();
  const fake = fakeSuggest({ gate });
  const site = await upstream();
  const session = await bridge.startGrabSession(await designFile(), undefined, site.origin, 'consumer', { motion: { store: new FsTasteStore(), suggest: fake } });
  const key = keyOf(session);
  try {
    const r = await request(`${session.url}/motion/suggest?key=${key}`, { method: 'POST', body: { path: '/' } });
    assert.equal(r.status, 202);
    for (let i = 0; i < 50 && fake.calls.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    await bridge.stopGrabSession();
    assert.equal(fake.calls[0].signal.aborted, true);
  } finally {
    gate.resolve();
    await bridge.stopGrabSession();
    await site.close();
  }
});

test('a session keeps at most 40 playgrounds and unregisters the oldest; a chat playground is not counted', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-motion-chat-'));
  const chatHtml = path.join(dir, 'chat.html');
  await writeFile(chatHtml, '<!doctype html><title>chat</title>', 'utf8');
  const chat = await motionSession.registerPlayground(chatHtml);
  const ids = [];
  // Ten starts per ten minutes, so each job registers seven: six jobs make 42.
  const many = fakeSuggest({ register: 7 });
  await withSession(async ({ suggest, settle }) => {
    for (let i = 0; i < 6; i++) {
      const r = await suggest({ path: '/' });
      assert.equal(r.status, 202);
      const done = await settle(r.json.job);
      assert.equal(done.json.state, 'done', done.text);
      for (const s of done.json.suggestions) ids.push(s.url.split('/p/')[1]);
    }
  }, { motion: { suggest: many } });
  assert.equal(ids.length, 42);
  for (const pid of ids.slice(0, 2)) assert.equal(motionSession.isPlaygroundRegistered(pid), false, 'oldest evicted: ' + pid);
  for (const pid of ids.slice(2)) assert.equal(motionSession.isPlaygroundRegistered(pid), true, 'kept: ' + pid);
  assert.equal(motionSession.isPlaygroundRegistered(chat.id), true, 'the chat playground stays');
  motionSession.unregisterPlayground(chat.id);
});

test('the taste binding comes from the session: a rejected kind stays out whatever the request says', { skip: !chromiumOk && 'Chromium unavailable' }, async () => {
  const prev = process.env.RAVEN_TASTE_HOME;
  process.env.RAVEN_TASTE_HOME = await mkdtemp(path.join(tmpdir(), 'raven-grab-motion-home-'));
  try {
    const store = new FsTasteStore();
    await taste.createTasteProfile(store, { name: 'site-p', rules: [] });
    await taste.bindTasteSurface(store, 'site-p', { project: 'studio-site', surface: 'studio site', voice_note: 'Plain.', design_notes: {} });
    await taste.recordTasteDecision(store, 'site-p', { project: 'studio-site', dimension: 'motion', decision: 'Kept the rest', rejected: ['motion:section-reveal\nSections should not move.'], source: 'user-directed' });
    await withSession(async ({ suggest, settle }) => {
      const r = await suggest({ path: '/', profile: 'other', project: 'other' });
      assert.equal(r.status, 202, r.text);
      const done = await settle(r.json.job);
      assert.equal(done.json.state, 'done', done.text);
      assert.equal(done.json.uses_taste, true);
      const kinds = done.json.suggestions.map((s) => s.kind);
      assert.ok(kinds.length > 0, done.text);
      assert.ok(!kinds.includes('section-reveal'), kinds.join(', '));
      for (const s of done.json.suggestions) {
        const page = await request(s.url);
        assert.equal(page.status, 200, s.url);
      }
    }, { motion: { store, profile: 'site-p', project: 'studio-site' } });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
});
