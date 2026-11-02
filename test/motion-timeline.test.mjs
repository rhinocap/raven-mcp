// create_motion_playground with a timeline: a Motion Lab timeline document the agent writes, checked by
// Motion Lab's own validator and outliner (the synced copies in src/data/motion/timeline/), filled into
// timeline-template.html, Raven's fork of the timeline playground.
//
// What these tests hold: exactly one of motif or timeline is accepted; the validator's errors come back in
// full; font paths are absolute, named by extension, and held to Motion Lab's font limits; every playground,
// keyfob included, carries a CSP that runs only its own inline scripts plus loopback (Raven Grab), and a
// browser shows no CSP violation; the timeline playground runs, its Copy for Raven text is accepted by
// record_taste_decision, and Send goes through Grab; the tool description lists the schema's own words.
//
// Fixtures: test/fixtures/motion/composite.ttf and woff2-bomb.woff2 are built from code by Motion Lab's
// scripts/make-font-fixtures.mjs (L is a 20-point leaf; A nests composites 14 levels deep).
// wordmark.json is Motion Lab's wordmark timeline; each test points its font at composite.ttf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, 'fixtures', 'motion');
const FONT = path.join(FIX, 'composite.ttf');

const { buildServer } = await import('../dist/index.js');
const { FsTasteStore } = await import('../dist/taste-store.js');
const taste = await import('../dist/taste.js');
const mp = await import('../dist/motion-playground/index.js');
const bridge = await import('../dist/grab-bridge.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch();
  await b.close();
} catch {
  chromium = null;
}
const noBrowser = !chromium && 'chromium did not launch';

async function withHome(fn) {
  const prev = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-timeline-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    await fn({ home, store: new FsTasteStore() });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
}

function timeline(text = 'LLL', font = FONT) {
  const doc = JSON.parse(readFileSync(path.join(FIX, 'wordmark.json'), 'utf8'));
  doc.fonts.wordmark.path = font;
  doc.targets.mark.text = text;
  return doc;
}

const inlineScripts = (html) => [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter((m) => !/application\/json/.test(m[1] || ''))
  .map((m) => m[2]);
const cspOf = (html) => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
};

test('exactly one of motif or timeline', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store }), /exactly one of motif .* or timeline/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', timeline: timeline() }), /exactly one of motif .* or timeline/);
  });
});

test('a timeline builds one full document named after its id, with its title, controls and outlines', async () => {
  await withHome(async ({ home, store }) => {
    const r = await mp.createMotionPlayground({ store, timeline: timeline(), title: 'Leaf mark' });
    assert.equal(r.timeline_id, 'wordmark');
    assert.equal(r.motif, undefined);
    assert.match(r.playground_id, /^wordmark-[0-9a-f]{4}$/);
    assert.equal(path.dirname(r.html_path), path.join(home, 'playgrounds'));
    assert.equal(r.controls, 11);
    const html = readFileSync(r.html_path, 'utf8');
    assert.ok(html.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy"'));
    assert.match(html, /<title>Leaf mark<\/title>/);
    assert.doesNotMatch(html, /__[A-Z_]+__/, 'a template placeholder was left unfilled');
    assert.doesNotMatch(html, /@font-face/, 'the Raven fork bundles no font');
    const layout = JSON.parse(html.match(/<script type="application\/json" id="layout">([\s\S]*?)<\/script>/)[1]);
    assert.equal(layout.targets.mark.parts, 3);
    assert.ok(layout.targets.mark.partList.every((p) => p.runs[0].d.includes('M')), 'each letter has an outline');
  });
});

test('the caller\'s timeline object is not changed by the build', async () => {
  await withHome(async ({ store }) => {
    const doc = timeline();
    const before = JSON.stringify(doc);
    await mp.createMotionPlayground({ store, timeline: doc, title: 'Other', seed: 9 });
    assert.equal(JSON.stringify(doc), before);
  });
});

test('validator errors come back in full, and overrides are for motifs only', async () => {
  await withHome(async ({ store }) => {
    const doc = timeline();
    doc.tracks[0].property = 'wobble';
    await assert.rejects(mp.createMotionPlayground({ store, timeline: doc }), (e) => /breaks the Motion Lab contract/.test(e.message) && /property/.test(e.message));
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline(), overrides: { controls: {} } }), /overrides apply to built-in motifs/);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: [] }), /must be a JSON object/);
    const big = timeline();
    big.concept = 'x'.repeat(mp.TIMELINE_MAX_BYTES);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: big }), /bytes of JSON; at most 262144/);
  });
});

test('font paths are absolute, end in a font extension, and meet Motion Lab\'s font limits', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline('LLL', 'fonts/composite.ttf') }), /path must be absolute or start with ~\//);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline('LLL', path.join(FIX, 'wordmark.json')) }), /must end in \.otf, \.ttf, \.woff or \.woff2/);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline('LLL', path.join(FIX, 'woff2-bomb.woff2')) }), /decompresses past its declared 4096 bytes/);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline('LAL') }), /glyph \d+ "A" nests components more than 8 levels deep/);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline('LLL', path.join(FIX, 'missing.ttf')) }), /ENOENT|no such file/);
  });
});

test('profile and project prefill Copy for Raven on a timeline and say taste notes set motif defaults only', async () => {
  await withHome(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'andrew' });
    await taste.bindTasteSurface(store, 'andrew', { project: 'site', surface: 'product-site', design_notes: { motion: 'snappy' } });
    const r = await mp.createMotionPlayground({ store, timeline: timeline(), profile: 'andrew', project: 'site' });
    assert.deepEqual(r.taste_applied, []);
    assert.ok(r.warnings.some((w) => /Taste notes set defaults on built-in motifs only/.test(w)));
    const html = readFileSync(r.html_path, 'utf8');
    assert.deepEqual(JSON.parse(html.match(/id="raven-ctx">([\s\S]*?)<\/script>/)[1]), { profile: 'andrew', project: 'site' });
  });
});

test('every playground carries a CSP that runs only its own inline scripts, by hash, plus loopback', async () => {
  await withHome(async ({ store }) => {
    for (const input of [{ motif: 'keyfob' }, { timeline: timeline() }]) {
      const r = await mp.createMotionPlayground({ store, ...input });
      const html = readFileSync(r.html_path, 'utf8');
      const csp = cspOf(html);
      assert.ok(csp, 'a CSP meta tag is present');
      const want = inlineScripts(html).map((s) => "'sha256-" + createHash('sha256').update(s, 'utf8').digest('base64') + "'");
      assert.ok(want.length >= 1);
      const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src ')).split(' ').slice(1);
      assert.deepEqual(scriptSrc, [...want, 'http://127.0.0.1:*', 'http://localhost:*']);
      assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
      assert.match(csp, /^default-src 'none'/);
      assert.match(csp, /style-src 'unsafe-inline' http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\* https:\/\/fonts\.googleapis\.com;/);
      assert.match(csp, /font-src data: http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\* https:\/\/fonts\.gstatic\.com;/);
    }
  });
});

test('in a browser neither playground trips its CSP, and the timeline plays', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const browser = await chromium.launch();
    try {
      for (const input of [{ motif: 'keyfob' }, { timeline: timeline() }]) {
        const r = await mp.createMotionPlayground({ store, ...input });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const problems = [];
        page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
        await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
        await page.goto(pathToFileURL(r.html_path).href, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__ml);
        await page.waitForTimeout(400);
        const got = await page.evaluate(() => ({ csp: window.__csp, t: typeof window.__ml.time === 'function' ? window.__ml.time() : null }));
        assert.deepEqual(got.csp, [], 'no CSP violation for ' + JSON.stringify(input).slice(0, 20));
        assert.deepEqual(problems, []);
        if (input.timeline) {
          assert.ok(got.t > 0, 'the timeline clock moves');
          const paths = await page.$$eval('#art path', (ps) => ps.filter((p) => (p.getAttribute('d') || '').length > 10).length);
          assert.ok(paths >= 3, 'the outlined letters are drawn');
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});

test('Copy for Raven on a timeline is accepted by record_taste_decision as-is', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'andrew' });
    const r = await mp.createMotionPlayground({ store, timeline: timeline(), profile: 'andrew', project: 'site' });
    const browser = await chromium.launch();
    let text;
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(pathToFileURL(r.html_path).href, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__ml);
      text = await page.evaluate(() => {
        window.__ml.setParam('letterTime', 600);
        window.__ml.setParam('letterMotion', { kind: 'spring', duration: 500, bounce: 0.2 });
        document.getElementById('tab-agent').click();
        return { box: document.getElementById('out-raven').value, raven: window.__ml.ravenText(), lede: !!document.getElementById('copy-raven') && !document.getElementById('copy-raven').disabled };
      });
    } finally {
      await browser.close();
    }
    assert.ok(text.lede);
    assert.equal(text.box, text.raven);
    const record = JSON.parse(text.raven.slice(text.raven.indexOf('{')));
    assert.equal(record.profile, 'andrew');
    assert.equal(record.project, 'site');
    assert.match(record.decision, /^wordmark: /);
    assert.match(record.decision, /600/);
    assert.match(record.decision, /spring 500 ms, bounce 0\.2/);
    assert.doesNotMatch(text.raven, /\[object Object\]/);
    const server = buildServer({ remote: false, tasteStore: store });
    const client = new Client({ name: 'timeline-test', version: '1.0.0' }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const res = await client.callTool({ name: 'record_taste_decision', arguments: record });
    assert.ok(!res.isError, JSON.stringify(res.content).slice(0, 300));
    await client.close();
  });
});

test('with Raven Grab\'s script tag pasted in, the overlay starts under the CSP and Send queues the packet', { skip: noBrowser }, async () => {
  await withHome(async ({ home, store }) => {
    const out = path.join(home, 'timeline.html');
    await mp.createMotionPlayground({ store, timeline: timeline(), output_path: out });
    const designPath = path.join(home, 'DESIGN.md');
    writeFileSync(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n');
    const session = await bridge.startGrabSession(designPath);
    const html = readFileSync(out, 'utf8').replace('</body>', session.script_tag + '</body>');
    const site = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
    await new Promise((r) => site.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline'))); });
      await page.goto('http://127.0.0.1:' + site.address().port + '/', { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__ml && !!document.getElementById('send-agent') && !!document.querySelector('[data-raven-grab-overlay]')?.shadowRoot);
      const got = await page.evaluate(async () => {
        const $ = (id) => document.getElementById(id);
        window.__ml.setParam('letterTime', 600);
        $('tab-agent').click();
        $('status').textContent = '';
        $('send-agent').click();
        const deadline = Date.now() + 3000;
        while (!$('status').textContent && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
        return {
          status: $('status').textContent, packet: window.__ml.agentPacket(), csp: window.__csp,
          ignored: ['panel'].map((id) => $(id).hasAttribute('data-raven-grab-ignore')).concat(['.viewbar', '.transport', '.strip'].map((s) => document.querySelector(s).hasAttribute('data-raven-grab-ignore'))),
        };
      });
      assert.equal(got.status, 'Sent to your agent through Raven Grab.');
      assert.deepEqual(got.ignored, [true, true, true, true]);
      // The pasted tag's inline config is the one thing the CSP refuses; the overlay runs without it.
      assert.ok(got.csp.every((v) => /^script-src(-elem)? inline$/.test(v)), JSON.stringify(got.csp));
      assert.match(got.packet, /I tuned it in a Raven motion playground/);
    } finally {
      await browser.close();
      site.closeAllConnections();
      await new Promise((r) => site.close(r));
      await bridge.stopGrabSession?.();
    }
  });
});

test('the tool description lists the schema\'s properties, the built target kinds and the named easings', async () => {
  const words = mp.timelineVocabulary();
  const schema = JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'data', 'motion', 'timeline', 'schemas', 'timeline.schema.json'), 'utf8'));
  assert.deepEqual(words.properties, schema.$defs.track.properties.property.enum);
  assert.deepEqual(words.targetKinds, ['surface', 'text']);
  assert.deepEqual(words.easings, schema.$defs.easing.oneOf.find((o) => o.enum).enum);
  await withHome(async ({ store }) => {
    const server = buildServer({ remote: false, tasteStore: store });
    const client = new Client({ name: 'timeline-test', version: '1.0.0' }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'create_motion_playground');
    await client.close();
    for (const w of [...words.properties, ...words.easings]) assert.ok(tool.description.includes(w), w);
    assert.match(tool.description, /Target kinds: surface, text\./);
    assert.match(tool.description, /Use ONLY these\.$/);
    assert.ok(tool.inputSchema.properties.timeline, 'timeline is an input');
    assert.deepEqual(tool.inputSchema.required ?? [], []);
  });
});

test('the lock pins every timeline file the validator loads and both template forks', () => {
  const DATA = path.join(__dirname, '..', 'src', 'data', 'motion');
  const lock = JSON.parse(readFileSync(path.join(DATA, 'motifs.lock.json'), 'utf8'));
  for (const f of ['scripts/validate-timeline.mjs', 'scripts/validate.mjs', 'src/timeline/evaluator.js', 'src/timeline/export.js', 'src/timeline/swiftui.js', 'src/timeline/outline.js', 'schemas/timeline.schema.json', 'schemas/playground.schema.json']) {
    const rel = 'timeline/' + f;
    assert.ok(lock.files[rel], rel + ' is not in the lock');
    assert.equal(createHash('sha256').update(readFileSync(path.join(DATA, rel))).digest('hex'), lock.files[rel], rel + ' no longer matches the lock');
  }
  assert.deepEqual(Object.keys(lock.templates).sort(), ['template.html', 'timeline-template.html']);
  assert.equal(lock.templates['timeline-template.html'].forked_from, 'src/timeline/template.html');
  for (const [fork, t] of Object.entries(lock.templates)) {
    assert.match(t.upstream_sha256, /^[0-9a-f]{64}$/);
    assert.equal(createHash('sha256').update(readFileSync(path.join(DATA, fork))).digest('hex'), t.fork_sha256, fork + ' was edited without a sync to re-lock it');
  }
  assert.match(lock.source_commit, /^[0-9a-f]{40}$/, 'synced from a real Motion Lab commit');
});

test('output_path replaces a regular file but refuses a symbolic link or a directory', async () => {
  const { symlinkSync, mkdirSync, readdirSync } = await import('node:fs');
  await withHome(async ({ home, store }) => {
    const victim = path.join(home, 'victim.json');
    writeFileSync(victim, '{"keep":true}');
    const link = path.join(home, 'preview.html');
    symlinkSync(victim, link);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline(), output_path: link }), /is a symbolic link/);
    assert.equal(readFileSync(victim, 'utf8'), '{"keep":true}');
    mkdirSync(path.join(home, 'dir.html'));
    await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline(), output_path: path.join(home, 'dir.html') }), /not a regular file/);
    const out = path.join(home, 'out.html');
    writeFileSync(out, 'old');
    await mp.createMotionPlayground({ store, timeline: timeline(), output_path: out });
    assert.match(readFileSync(out, 'utf8'), /^<!doctype html>/);
    assert.deepEqual(readdirSync(home).filter((f) => f.endsWith('.tmp')), []);
  });
});

test('a write that fails part-way leaves no temporary file beside output_path', async () => {
  const fs = (await import('node:fs')).default;
  const { readdirSync } = await import('node:fs');
  const { syncBuiltinESMExports } = await import('node:module');
  await withHome(async ({ home, store }) => {
    const real = fs.writeFileSync;
    // Fail the write into the new temp file's descriptor, the way a full disk would.
    fs.writeFileSync = function (f, ...rest) { if (typeof f === 'number') { const e = new Error('ENOSPC: no space left on device'); e.code = 'ENOSPC'; throw e; } return real.call(this, f, ...rest); };
    syncBuiltinESMExports();
    try {
      await assert.rejects(mp.createMotionPlayground({ store, timeline: timeline(), output_path: path.join(home, 'full.html') }), /ENOSPC/);
    } finally { fs.writeFileSync = real; syncBuiltinESMExports(); }
    assert.deepEqual(readdirSync(home).filter((f) => f.includes('full.html')), []);
  });
});

test('Copy for Raven stays off until the profile and project are names Raven accepts', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const browser = await chromium.launch();
    try {
      for (const input of [{ motif: 'keyfob' }, { timeline: timeline() }]) {
        const r = await mp.createMotionPlayground({ store, ...input });
        const page = await browser.newPage();
        await page.goto(pathToFileURL(r.html_path).href);
        await page.waitForFunction(() => !!window.__ml);
        const got = await page.evaluate(() => {
          const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
          const state = () => ({ text: window.__ml.ravenText(), disabled: document.getElementById('copy-raven').disabled, note: document.getElementById('raven-need').textContent });
          set('raven-profile', '../andrew'); set('raven-project', 'site'); const bad = state();
          set('raven-profile', 'andrew'); const good = state();
          return { bad, good };
        });
        assert.equal(got.bad.text, '');
        assert.equal(got.bad.disabled, true);
        assert.match(got.bad.note, /Profile names use letters/);
        assert.equal(got.good.disabled, false);
        assert.match(got.good.text, /"profile": "andrew"/);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
