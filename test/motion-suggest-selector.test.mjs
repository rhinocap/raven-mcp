// suggest_motion with a selector (Motion in Grab spec v0.3, section 3).
//
// What these tests hold, on fixture pages served from 127.0.0.1: a selector gives one suggestion
// scoped to that element, built from the existing recipe when the element is one the page pass
// already knows and from an element recipe otherwise; the requested trigger is used; a selector
// that matches nothing, or is not valid, says which; the response has preview_url and no map;
// a hostile element's fragment carries no script, handler or external URL; every trigger works on
// an image, a heading, a container with 2-8 children, one with more and a button; parts carry a
// fingerprint with dup and nth; failures are listed by stage; aborting writes and registers nothing.
// Chromium only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, 'fixtures/motion/site');
const TIMELINE = path.join(__dirname, '../src/data/motion/timeline');

const { suggestMotion } = await import('../dist/motion-suggest/index.js');
const { FsTasteStore } = await import('../dist/taste-store.js');
const taste = await import('../dist/taste.js');
const session = await import('../dist/motion-session.js');
const { checkTimeline } = await import(path.join(TIMELINE, 'scripts/validate-timeline.mjs'));

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch();
  await b.close();
} catch {
  chromium = null;
}
const noBrowser = !chromium && 'chromium did not launch';

after(async () => { await session.stopMotionSession(); });

const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2' };
async function serveSite({ onRequest } = {}) {
  const server = http.createServer((req, res) => {
    if (onRequest) onRequest(req);
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SITE, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!file.startsWith(SITE)) { res.statusCode = 404; res.end(); return; }
    readFile(file).then((body) => {
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    }, () => { res.statusCode = 404; res.end(); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

async function withHome(fn) {
  const prev = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-selector-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    await fn({ home, store: new FsTasteStore() });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
}

async function pick(store, page, selector, extra = {}, siteOpts) {
  const site = await serveSite(siteOpts);
  try {
    return await suggestMotion({ store, url: site.origin + page, selector, ...extra });
  } finally {
    await site.close();
  }
}

function valid(s) {
  const checked = checkTimeline(JSON.parse(JSON.stringify(s.timeline)), { fragmentHtml: s.fragment });
  assert.deepEqual(checked.errs, [], `${s.id}: Motion Lab's validator`);
}

const ON = { entrance: 'load', hover: 'hover', scroll: 'scroll' };
const onOf = (s) => (typeof s.trigger === 'string' ? s.trigger : s.trigger.on);

test('a selector gives one suggestion for that element, with preview_url and no map', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await pick(store, '/', '#hero-title', { max: 5 });
    assert.equal(r.suggestions.length, 1);
    const s = r.suggestions[0];
    assert.equal(s.kind, 'hero-entrance', 'the hero heading uses the hero recipe');
    assert.equal(r.preview_url, s.url);
    assert.match(r.preview_url, /^http:\/\/127\.0\.0\.1:\d+\/p\/[0-9a-f]+$/);
    assert.match(s.playground_id, /^[0-9a-f]{16}$/);
    assert.ok(!('map_path' in r), 'no map in selector mode');
    // The serialised MCP response cannot send the agent to the map or to the source page.
    const json = JSON.parse(JSON.stringify(r));
    assert.equal(json.next.length, 1);
    assert.match(json.next[0], /preview_url/);
    assert.doesNotMatch(json.next.join(' '), /map/i);
    assert.notEqual(json.preview_url, json.url);
    assert.deepEqual(r.failed, []);
    valid(s);
    // Parts are page elements: the heading, then what follows it in the hero.
    assert.equal(s.parts[0].selector, '#hero-title');
    assert.equal(s.parts[0].tag, 'h1');
    assert.equal(s.parts[0].text, 'Calm websites for busy studios');
    assert.equal(s.parts[0].dup, 1);
    assert.equal(s.parts[0].nth, 0);
    assert.ok(s.parts.length >= 2, 'the lede and actions are parts too');
  });
});

test('the requested trigger is used, and a known element defaults to its own kind', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const hover = await pick(store, '/', '#hero-title', { trigger: 'hover' });
    assert.equal(hover.suggestions[0].kind, 'element-hover');
    assert.equal(onOf(hover.suggestions[0]), 'hover');
    valid(hover.suggestions[0]);
    const card = await pick(store, '/', '#card-2');
    assert.equal(card.suggestions[0].kind, 'card-hover');
    const cardScroll = await pick(store, '/', '#card-2', { trigger: 'scroll' });
    assert.equal(cardScroll.suggestions[0].kind, 'element-reveal');
    assert.equal(cardScroll.suggestions[0].parts[0].selector, '#card-2');
    const cta = await pick(store, '/', '#cta-primary');
    assert.equal(cta.suggestions[0].kind, 'cta-hover');
  });
});

test('a selector that matches nothing, and one that is not valid, each say so', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const none = await pick(store, '/', '#not-on-this-page');
    assert.equal(none.suggestions.length, 0);
    assert.match(none.message, /wasn't there/);
    assert.ok(!('preview_url' in none));
    const bad = await pick(store, '/', 'div[[');
    assert.equal(bad.suggestions.length, 0);
    assert.match(bad.message, /isn't one the page can read/);
    await assert.rejects(() => suggestMotion({ store, url: 'http://127.0.0.1:1/', selector: 'a'.repeat(513) }), /at most 512/);
    await assert.rejects(() => suggestMotion({ store, url: 'http://127.0.0.1:1/', trigger: 'hover' }), /trigger goes with selector/);
    await assert.rejects(() => suggestMotion({ store, url: 'http://127.0.0.1:1/', selector: '#x', trigger: 'spin' }), /entrance, hover or scroll/);
  });
});

test('a hostile element loses its script, handlers and external URLs, with every trigger', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    for (const trigger of ['entrance', 'hover', 'scroll']) {
      const r = await pick(store, '/picked.html', '#hostile', { trigger });
      assert.equal(r.suggestions.length, 1, trigger);
      const s = r.suggestions[0];
      const text = s.fragment.replace(/src="data:image\/png;base64,[A-Za-z0-9+/=]+"/g, '');
      assert.doesNotMatch(text, /https?:|\/\/|url\(|javascript:|<script|<style|<a\b|\son[a-z]+=|style=|steal|alert/i, `${trigger}: fragment`);
      assert.doesNotMatch(JSON.stringify(s.timeline), /https?:|url\(|javascript:/i, `${trigger}: timeline`);
      assert.match(text, /Styled &lt;b&gt;text&lt;\/b&gt;/, `${trigger}: page text stays text`);
      valid(s);
    }
  });
});

test('every trigger works on an image, a heading, 2-8 children, more than 8 children and a button', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const KIND = { entrance: 'element-entrance', hover: 'element-hover', scroll: 'element-reveal' };
    for (const sel of ['#photo', '#lower-title', '#few', '#many', '#go']) {
      for (const trigger of ['entrance', 'hover', 'scroll']) {
        const r = await pick(store, '/picked.html', sel, { trigger });
        assert.equal(r.suggestions.length, 1, `${sel} ${trigger}: ${r.message || ''} ${r.warnings.join(' ')}`);
        const s = r.suggestions[0];
        // The button is the page's own button kind on hover; everything else uses an element recipe.
        assert.equal(s.kind, sel === '#go' && trigger === 'hover' ? 'cta-hover' : KIND[trigger], `${sel} ${trigger}`);
        assert.equal(onOf(s), ON[trigger], `${sel} ${trigger}`);
        valid(s);
        if (trigger === 'entrance' && s.kind === 'element-entrance') {
          const split = s.timeline.targets.el.split === 'children';
          assert.equal(split, sel === '#few', `${sel}: stagger only with 2-8 children`);
        }
      }
    }
  });
});

test('with no trigger, the element sets it: image and lower heading scroll, button hovers, top heading enters', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const want = { '#photo': 'scroll', '#go': 'hover', '#intro-title': 'load', '#lower-title': 'scroll' };
    for (const [sel, on] of Object.entries(want)) {
      const r = await pick(store, '/picked.html', sel);
      assert.equal(onOf(r.suggestions[0]), on, sel);
    }
  });
});

test('parts count same-looking elements, so a repeated label or image is told apart by position', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const second = await pick(store, '/picked.html', '#twins img:nth-of-type(2)', { trigger: 'hover' });
    const p = second.suggestions[0].parts[0];
    assert.equal(p.tag, 'img');
    assert.equal(p.text, 'Same alt');
    assert.equal(p.src, 'card.png');
    assert.equal(p.dup, 2);
    assert.equal(p.nth, 1);
    const link = await pick(store, '/picked.html', '#more a:first-of-type', { trigger: 'hover' });
    const q = link.suggestions[0].parts[0];
    assert.equal(q.href, '/one');
    assert.equal(q.dup, 2);
    assert.equal(q.nth, 0);
  });
});

test('a forced failure at each stage is listed with its stage, and all failing is not "none qualify"', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    for (const stage of ['recipe', 'playground', 'register']) {
      const r = await pick(store, '/', '#hero-title', { faultAt: stage });
      assert.equal(r.suggestions.length, 0, stage);
      assert.equal(r.failed.length, 1, stage);
      assert.equal(r.failed[0].stage, stage);
      assert.equal(r.failed[0].label, 'Hero entrance');
      assert.match(r.message, /couldn't build any previews/, stage);
    }
    const site = await serveSite();
    try {
      const r = await suggestMotion({ store, url: site.origin + '/', max: 3, faultAt: 'playground' });
      assert.equal(r.suggestions.length, 0);
      assert.equal(r.failed.length, 3);
      assert.match(r.message, /couldn't build any previews/);
    } finally { await site.close(); }
  });
});

test('a note that turns motion off still applies to a chosen element', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'sel-p', rules: [] });
    await taste.bindTasteSurface(store, 'sel-p', { project: 'sel-site', surface: 'site', voice_note: 'Plain.', design_notes: { motion: 'None or instant.' } });
    const r = await pick(store, '/', '#hero-title', { profile: 'sel-p', project: 'sel-site' });
    assert.equal(r.suggestions.length, 0);
    assert.match(r.message, /no motion suggestions/);
    assert.deepEqual(r.failed, []);
  });
});

test('aborting writes and registers nothing, before, during and after the capture', { skip: noBrowser }, async () => {
  await withHome(async ({ home, store }) => {
    const count = async () => (await session.getMotionSends(0)).waiting_url_count;
    const files = () => (existsSync(path.join(home, 'playgrounds')) ? readdirSync(path.join(home, 'playgrounds')).length : 0);
    const before = await count();

    const early = new AbortController();
    early.abort();
    await assert.rejects(() => pick(store, '/', '#hero-title', { signal: early.signal }), { name: 'AbortError' });

    const during = new AbortController();
    setTimeout(() => during.abort(), 300);
    await assert.rejects(() => pick(store, '/', '#hero-title', { signal: during.signal }), { name: 'AbortError' });

    // After the capture: Raven fetches the page's font itself (not the browser), then builds; abort on that fetch.
    const late = new AbortController();
    const onRequest = (req) => {
      if (req.url.endsWith('.woff2') && !/Chrome/.test(req.headers['user-agent'] || '')) late.abort();
    };
    await assert.rejects(() => pick(store, '/', '#hero-title', { signal: late.signal }, { onRequest }), { name: 'AbortError' });
    assert.ok(late.signal.aborted, 'the abort came from the font fetch');

    assert.equal(await count(), before, 'nothing registered');
    assert.equal(files(), 0, 'no playground written');
  });
});

test('an owner is passed to registration, and the owner can unregister', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await pick(store, '/', '#cta-primary', { owner: 'grab-test' });
    const id = r.suggestions[0].playground_id;
    assert.equal(session.isPlaygroundRegistered(id), true);
    assert.equal(session.unregisterPlayground(id), true);
    assert.equal(session.isPlaygroundRegistered(id), false);
    assert.equal(session.unregisterPlayground(id), false);
  });
});
