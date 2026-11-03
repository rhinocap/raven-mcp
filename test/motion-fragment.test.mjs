// create_motion_playground with a fragment: the HTML for a timeline's element targets. Motion Lab's sanitiser
// (the synced src/timeline/fragment.js) cleans it before the validator measures it, so nothing from a page the
// agent captured runs or loads in the playground.
//
// What these tests hold: a hover timeline with its fragment builds and plays on hover under the CSP; scripts,
// handlers, style strings and links are dropped; an image from outside the fragment refuses it; a fragment that
// is not a string or is too large is refused before it is read; the tool passes fragment through.
//
// Fixtures: button-hover.json and button-hover.fragment.html are Motion Lab's button-hover example; each test
// points its font at composite.ttf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, 'fixtures', 'motion');
const FONT = path.join(FIX, 'composite.ttf');
const FRAGMENT = readFileSync(path.join(FIX, 'button-hover.fragment.html'), 'utf8');

const { buildServer } = await import('../dist/index.js');
const { FsTasteStore } = await import('../dist/taste-store.js');
const mp = await import('../dist/motion-playground/index.js');
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
  const home = await mkdtemp(path.join(tmpdir(), 'raven-fragment-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    await fn({ home, store: new FsTasteStore() });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
}

function hoverDoc() {
  const doc = JSON.parse(readFileSync(path.join(FIX, 'button-hover.json'), 'utf8'));
  doc.fonts.ui.path = FONT;
  return doc;
}
const layoutOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="layout">([\s\S]*?)<\/script>/)[1]);

test('a hover timeline builds from its fragment, with the cleaned parts in the layout', async () => {
  await withHome(async ({ store }) => {
    const r = await mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: FRAGMENT });
    assert.equal(r.timeline_id, 'button-hover');
    const html = readFileSync(r.html_path, 'utf8');
    assert.doesNotMatch(html, /__[A-Z_]+__/, 'a template placeholder was left unfilled');
    const layout = layoutOf(html);
    assert.ok(layout.fragment, 'the cleaned fragment is in the layout');
    assert.match(JSON.stringify(layout.fragment), /Book a visit/);
    assert.ok(layout.targets.button, 'the element target is measured');
  });
});

test('scripts, handlers, style strings and links in a fragment never reach the playground', async () => {
  await withHome(async ({ store }) => {
    const hostile = '<div id="panel" onclick="alert(\'p1\')" style="background:url(https://evil.example/a.png)">'
      + '<h2 id="line">Visit the studio<script>fetch("https://evil.example/s")</script></h2>'
      + '<a href="javascript:alert(\'p2\')">more</a><iframe src="https://evil.example/f"></iframe>'
      + '<span id="cta" onmouseover="alert(\'p3\')">Book a visit</span></div>';
    const r = await mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: hostile });
    const html = readFileSync(r.html_path, 'utf8');
    for (const bad of ['evil.example', "alert('p1')", "alert('p2')", "alert('p3')", 'alert(\\u0027', 'javascript:']) {
      assert.ok(!html.includes(bad), bad + ' reached the playground');
    }
    assert.match(JSON.stringify(layoutOf(html).fragment), /Book a visit/, 'the text is kept');
  });
});

test('an image from outside the fragment refuses it, in plain words', async () => {
  await withHome(async ({ store }) => {
    const ext = '<div id="panel"><h2 id="line">Visit</h2><img src="https://evil.example/x.png"><span id="cta">Book</span></div>';
    await assert.rejects(mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: ext }), /fragment: .*image/i);
  });
});

test('a fragment that is not a string or is too large is refused before it is read', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: { html: FRAGMENT } }), /fragment must be a string of HTML/);
    const big = '<div id="cta">' + 'x'.repeat(mp.FRAGMENT_MAX_BYTES) + '</div>';
    await assert.rejects(mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: big }), /fragment is \d+ bytes; at most/);
  });
});

test('an element target with no fragment, or an id the fragment lacks, is a contract error', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store, timeline: hoverDoc() }), /breaks the Motion Lab contract/);
    await assert.rejects(mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: '<div id="panel"><h2 id="line">Visit</h2></div>' }), /breaks the Motion Lab contract[\s\S]*cta/);
  });
});

test('the tool passes fragment through', async () => {
  await withHome(async ({ store }) => {
    const server = buildServer({ remote: false, tasteStore: store });
    const client = new Client({ name: 'fragment-test', version: '1.0.0' }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'create_motion_playground');
      assert.ok(tool.inputSchema.properties.fragment, 'fragment is in the input schema');
      assert.match(tool.description, /on hover/);
      assert.match(tool.description, /scrolled into view/);
      const res = await client.callTool({ name: 'create_motion_playground', arguments: { timeline: hoverDoc(), fragment: FRAGMENT } });
      assert.ok(!res.isError, res.content?.[0]?.text);
      const out = JSON.parse(res.content[0].text);
      assert.equal(out.timeline_id, 'button-hover');
    } finally {
      await client.close();
    }
  });
});

test('in a browser the hover playground waits, plays on hover under its CSP, and loads nothing', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await mp.createMotionPlayground({ store, timeline: hoverDoc(), fragment: FRAGMENT });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const problems = [], requests = [];
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
      page.on('request', (q) => { if (!q.url().startsWith('file:') && !q.url().startsWith('data:')) requests.push(q.url()); });
      await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
      await page.goto(pathToFileURL(r.html_path).href, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__ml);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__ml.time()), 0, 'a hover motion waits for the pointer');
      assert.equal(await page.isVisible('#hover-in'), true, 'the Hover button is shown');
      await page.hover('#art .ml-button-hover-n-cta');
      await page.waitForTimeout(150);
      const t = await page.evaluate(() => window.__ml.time());
      assert.ok(t > 0, 'it plays on hover');
      assert.match(await page.evaluate(() => window.__ml.sendContext()), /^Plays on hover/);
      assert.deepEqual(await page.evaluate(() => window.__csp), []);
      assert.deepEqual(problems, []);
      assert.deepEqual(requests.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u)), []);
    } finally {
      await browser.close();
    }
  });
});
