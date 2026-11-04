// Motion in Grab (spec v0.3), the Grab side: the Motion tab in a real Chromium against the fixture site.
// Covers the spec's "Grab in Chromium against the fixture site" list and its speed and export checks.
//
// Each test boots a Grab session that proxies a loopback fixture server (the designer's own dev server),
// or a stubbed third-party upstream for the copy fallback. Real suggestMotion runs where the result
// matters (markers, speed, export); a fake suggest forces the states the real one cannot reach on demand.
// The overlay host covers the viewport, so clicks are raw mouse events at measured points.
// Chromium only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bridge = await import('../dist/grab-bridge.js');
const motionSession = await import('../dist/motion-session.js');
const taste = await import('../dist/taste.js');
const { FsTasteStore } = await import('../dist/taste-store.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, 'fixtures', 'motion', 'site');
const DESKTOP = { width: 1440, height: 900 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const PLAYGROUND = /^http:\/\/127\.0\.0\.1:\d{2,5}\/p\/[0-9a-f]{16}$/;

let chromium;
let browser;
try {
  ({ chromium } = await import('playwright'));
  const probe = await chromium.launch();
  await probe.close();
} catch {
  chromium = null;
}
const skip = !chromium && 'Chromium unavailable';

const prevHome = process.env.RAVEN_TASTE_HOME;
before(async () => {
  process.env.RAVEN_TASTE_HOME = await mkdtemp(path.join(tmpdir(), 'raven-grab-motion-tab-home-'));
  if (chromium) browser = await chromium.launch();
});
after(async () => {
  if (browser) await browser.close();
  await bridge.stopGrabSession();
  await motionSession.stopMotionSession();
  if (prevHome === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prevHome;
});

function siteServer() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SITE, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!file.startsWith(SITE)) { res.statusCode = 404; res.end(); return; }
    readFile(file).then((body) => {
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    }, () => { res.statusCode = 404; res.end('not found'); });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) })));
}

async function designFile() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-motion-tab-'));
  const file = path.join(dir, 'DESIGN.md');
  await writeFile(file, '# Fixture\n', 'utf8');
  return file;
}

// A Grab page on a proxied loopback fixture. motion: null starts the session without motion state.
async function withGrab(opts, fn) {
  const site = await siteServer();
  const motion = opts.motion === null ? undefined : { store: new FsTasteStore(), ...(opts.motion || {}) };
  const session = await bridge.startGrabSession(await designFile(), undefined, site.origin, 'consumer', motion ? { motion } : undefined);
  const context = await browser.newContext({ viewport: opts.viewport || DESKTOP, ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const jobs = [];
  page.on('response', async (r) => {
    if (!/\/motion\/job\//.test(r.url())) return;
    try { const body = await r.json(); if (body.state !== 'running') jobs.push(body); } catch { /* closed */ }
  });
  try {
    await page.goto(session.url + (opts.path || '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-tabs')), null, { timeout: 15000 });
    return await fn({ page, context, session, errors, jobs, site });
  } finally {
    await context.close();
    await bridge.stopGrabSession();
    await site.close();
  }
}

// Shadow-root queries run in the page.
const inShadow = (page, fn, arg) => page.evaluate(([src, a]) => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  return (0, eval)('(' + src + ')')(root, a);
}, [fn.toString(), arg]);

async function clickAt(page, fn, arg) {
  const at = await inShadow(page, fn, arg);
  assert.ok(at, 'nothing to click');
  await page.mouse.click(at.x, at.y);
}
const centre = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

async function openMotionTab(page) {
  await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-tab="motion"]')), centre.toString());
  await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-root] > *'));
}

async function findMotion(page) {
  const started = Date.now();
  await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return root.querySelector('[data-motion-row]') || root.querySelector('[data-motion-state]');
  }, null, { timeout: 60000 });
  const ms = Date.now() - started;
  await settleFrames(page);
  return ms;
}

const settleFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// The left panel floats over the page's left 380 px, where the fixture's content starts.
// A margin moves the page clear of it so a pointer press reaches the element.
const clearOfPanels = (page) => page.addStyleTag({ content: 'body { margin-left: 400px !important; margin-right: 400px !important; }' });

async function selectElement(page, selector) {
  const at = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-label')?.style.display === 'block', null, { timeout: 5000 });
}

// Every drawn marker against the union of its parts' live boxes. Rows are suggestions then failures,
// with picked rows first, so the caller passes the suggestions in row order.
async function markerReport(page, suggestions) {
  return page.evaluate((list) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return list.map((s, i) => {
      const m = root.querySelector('[data-motion-marker="' + (i + 1) + '"]');
      const els = (s.parts || []).map((p) => document.querySelector(p.selector));
      let u = null;
      if (els.length && els.every(Boolean)) {
        const rs = els.map((e) => e.getBoundingClientRect());
        u = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
      }
      const b = m ? m.getBoundingClientRect() : null;
      const box = b ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null;
      const off = box && u ? Math.max(Math.abs(box.left - u.left), Math.abs(box.top - u.top), Math.abs(box.right - u.right), Math.abs(box.bottom - u.bottom)) : null;
      return { label: s.label, kind: s.kind, marker: Boolean(m), off, box, parts: (s.parts || []).map((p) => p.selector) };
    });
  }, suggestions);
}

const lastJob = (jobs) => jobs[jobs.length - 1];

function fakeSuggestion(over = {}) {
  return { id: 'fake-1', kind: 'button-hover', label: 'Button hover', why: 'It shows the button can be pressed.', trigger_words: 'When the pointer is over it', approximations: [], url: 'http://127.0.0.1:9999/p/0123456789abcdef', parts: [], playground_id: '', ...over };
}
const fakeResult = (over = {}) => async () => ({ suggestions: [], failed: [], ...over });

// ---------- where the tab is ----------

test('the Motion tab appears on a loopback upstream with motion, with Find motion and its lede', { skip }, async () => {
  await withGrab({}, async ({ page, errors }) => {
    const tabs = await inShadow(page, (root) => [...root.querySelectorAll('.raven-grab-tabs [data-tab]')].map((b) => b.getAttribute('data-tab')));
    assert.ok(tabs.includes('motion'), tabs.join(','));
    await openMotionTab(page);
    const got = await inShadow(page, (root) => ({ find: root.querySelector('[data-motion-find]')?.textContent, lede: root.querySelector('.raven-grab-motion-lede')?.textContent, pick: Boolean(root.querySelector('[data-motion-pick]')) }));
    assert.deepEqual(got, { find: 'Find motion', lede: 'Find places on this page where motion could help.', pick: false });
    assert.deepEqual(errors, []);
  });
});

test('the tab is absent when the session has no motion state, and in the mobile sheet', { skip }, async () => {
  await withGrab({ motion: null }, async ({ page }) => {
    assert.equal(await inShadow(page, (root) => root.querySelectorAll('[data-tab="motion"]').length), 0);
  });
  await withGrab({ viewport: { width: 390, height: 844 } }, async ({ page }) => {
    assert.equal(await inShadow(page, (root) => root.querySelectorAll('[data-tab="motion"]').length), 0);
  });
});

test('the tab is absent with no proxy_target', { skip }, async () => {
  const session = await bridge.startGrabSession(await designFile(), undefined, undefined, 'consumer', { motion: { store: new FsTasteStore() } });
  const html = (await readFile(path.join(SITE, 'index.html'), 'utf8')).replace('</body>', session.script_tag + '</body>');
  const host = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({ viewport: DESKTOP });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:' + host.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-tabs [data-tab]')), null, { timeout: 15000 });
    const tabs = await inShadow(page, (root) => [...root.querySelectorAll('.raven-grab-tabs [data-tab]')].map((b) => b.getAttribute('data-tab')));
    assert.ok(tabs.includes('layers') && !tabs.includes('motion'), tabs.join(','));
  } finally {
    await context.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => host.close(resolve));
  }
});

test('a third-party upstream shows the copy-to-chat line, not Find motion', { skip }, async () => {
  const html = await readFile(path.join(SITE, 'index.html'), 'utf8');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const session = await bridge.startGrabSession(await designFile(), undefined, 'https://fixture.test', 'consumer', { motion: { store: new FsTasteStore() } });
  const context = await browser.newContext({ viewport: DESKTOP });
  try {
    const page = await context.newPage();
    await page.goto(session.url + '/pricing?x=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-tab="motion"]')), null, { timeout: 15000 });
    await openMotionTab(page);
    const got = await inShadow(page, (root) => ({ line: root.querySelector('[data-motion-chat]')?.textContent, copy: root.querySelector('[data-motion-copy]')?.textContent, find: Boolean(root.querySelector('[data-motion-find]')) }));
    assert.deepEqual(got, { line: 'Ask your agent: suggest motion for https://fixture.test/pricing?x=1', copy: 'Copy', find: false });
  } finally {
    await context.close();
    globalThis.fetch = originalFetch;
    await bridge.stopGrabSession();
  }
});

// ---------- Find motion and markers (real suggestMotion) ----------

test('Find motion lists suggestions within 20 s; each marker is within 4 px of its parts; hero and nav markers sit on the heading and links', { skip }, async () => {
  await withGrab({}, async ({ page, jobs, errors }) => {
    await openMotionTab(page);
    const ms = await findMotion(page);
    assert.ok(ms <= 20000, 'first row took ' + ms + ' ms');
    const job = lastJob(jobs);
    assert.equal(job.state, 'done');
    assert.ok(job.suggestions.length >= 3, job.suggestions.map((s) => s.kind).join(','));
    const rows = await inShadow(page, (root) => root.querySelectorAll('[data-motion-row]').length);
    assert.equal(rows, job.suggestions.length + job.failed.length);
    const report = await markerReport(page, job.suggestions);
    for (const r of report) {
      assert.ok(r.marker, 'no marker for ' + r.label + ' ' + r.parts.join(' | '));
      assert.ok(r.off !== null && r.off <= 4, r.label + ' marker is ' + r.off + ' px from its parts');
    }
    const hero = report.find((r) => r.kind === 'hero-entrance');
    assert.ok(hero, report.map((r) => r.kind).join(','));
    assert.ok(hero.parts.some((s) => /hero-title/.test(s)), 'hero parts: ' + hero.parts.join(' | '));
    const nav = report.find((r) => r.kind === 'nav-hover');
    assert.ok(nav, report.map((r) => r.kind).join(','));
    const links = await page.evaluate(() => [...document.querySelectorAll('#main-nav a')].map((a) => { const r = a.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
    assert.ok(Math.abs(nav.box.left - links[0].left) <= 4 && Math.abs(nav.box.right - links[links.length - 1].right) <= 4, JSON.stringify({ nav: nav.box, links }));
    assert.deepEqual(errors, []);
  });
});

test('no marker covers an unrelated element: only its parts, their ancestors and their descendants sit inside it', { skip }, async () => {
  await withGrab({}, async ({ page, jobs }) => {
    await openMotionTab(page);
    await findMotion(page);
    const job = lastJob(jobs);
    const covered = await page.evaluate((list) => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      const content = [...document.querySelectorAll('body h1, body h2, body h3, body p, body a, body button, body img, body span')];
      const out = [];
      list.forEach((s, i) => {
        const m = root.querySelector('[data-motion-marker="' + (i + 1) + '"]');
        if (!m) return;
        const b = m.getBoundingClientRect();
        const parts = s.parts.map((p) => document.querySelector(p.selector));
        for (const el of content) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const inside = r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
          if (!inside) continue;
          const related = parts.some((p) => p === el || p.contains(el) || el.contains(p));
          if (!related) out.push(s.label + ' covers ' + el.localName + ' "' + (el.textContent || el.getAttribute('alt') || '').trim().slice(0, 30) + '"');
        }
      });
      return out;
    }, job.suggestions);
    assert.deepEqual(covered, []);
  });
});

test('hovering a row lights its marker, and clicking its name opens the preview in a new tab while Grab stays', { skip }, async () => {
  await withGrab({}, async ({ page, context, session }) => {
    await openMotionTab(page);
    await findMotion(page);
    const at = await inShadow(page, (root) => { const r = root.querySelector('[data-motion-row="2"]').getBoundingClientRect(); return { x: r.left + r.width - 12, y: r.top + 12 }; });
    await page.mouse.move(at.x, at.y);
    const hot = await inShadow(page, (root) => ({ marker: root.querySelector('[data-motion-marker="2"]')?.getAttribute('data-hot'), others: [...root.querySelectorAll('[data-motion-marker][data-hot]')].length, row: root.querySelector('[data-motion-row="2"]').getAttribute('data-hot') }));
    assert.deepEqual(hot, { marker: 'true', others: 1, row: 'true' });
    const before = page.url();
    const popup = context.waitForEvent('page');
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-row="1"] a.raven-grab-motion-name')), centre.toString());
    const opened = await popup;
    await opened.waitForLoadState('domcontentloaded');
    assert.match(opened.url(), PLAYGROUND);
    assert.equal(page.url(), before);
    assert.ok(page.url().startsWith(session.url));
    const still = await inShadow(page, (root) => ({ rows: root.querySelectorAll('[data-motion-row]').length, active: root.querySelector('[data-tab="motion"]').getAttribute('aria-selected') || root.querySelector('[data-tab="motion"]').className }));
    assert.ok(still.rows > 0);
    assert.match(String(still.active), /true|active/);
    await opened.close();
  });
});

test('editing text live takes the marker away and the row reads "Not on screen right now"', { skip }, async () => {
  await withGrab({}, async ({ page, jobs }) => {
    await openMotionTab(page);
    await findMotion(page);
    const job = lastJob(jobs);
    const i = job.suggestions.findIndex((s) => s.parts.some((p) => /hero-title/.test(p.selector)));
    assert.ok(i >= 0, 'no suggestion on the hero heading');
    const n = i + 1;
    assert.equal(await inShadow(page, (root, k) => Boolean(root.querySelector('[data-motion-marker="' + k + '"]')), n), true);
    await page.evaluate(() => { document.getElementById('hero-title').textContent = 'A different heading now'; });
    await settleFrames(page);
    await settleFrames(page);
    const got = await inShadow(page, (root, k) => ({ marker: Boolean(root.querySelector('[data-motion-marker="' + k + '"]')), note: !root.querySelector('[data-motion-row="' + k + '"] [data-motion-offscreen]').hidden, text: root.querySelector('[data-motion-row="' + k + '"] [data-motion-offscreen]').textContent, link: Boolean(root.querySelector('[data-motion-row="' + k + '"] a.raven-grab-motion-name')) }), n);
    assert.deepEqual(got, { marker: false, note: true, text: 'Not on screen right now', link: true });
  });
});

test('at a 900 px window every marker that is drawn still matches its parts', { skip }, async () => {
  await withGrab({}, async ({ page, jobs }) => {
    await openMotionTab(page);
    await findMotion(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await settleFrames(page);
    await settleFrames(page);
    const report = await markerReport(page, lastJob(jobs).suggestions);
    const drawn = report.filter((r) => r.marker);
    assert.ok(drawn.length > 0, 'no markers at 900 px');
    for (const r of drawn) assert.ok(r.off !== null && r.off <= 4, r.label + ' is ' + r.off + ' px off at 900 px');
  });
});

// ---------- Add motion ----------

test('Add motion is absent with no selection; with one it adds "You picked this" and Open preview without opening a tab', { skip }, async () => {
  await withGrab({}, async ({ page, context, errors }) => {
    await openMotionTab(page);
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-pick]'))), false);
    await clearOfPanels(page);
    await selectElement(page, '#cta-primary');
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]'));
    const trigger = await inShadow(page, (root) => root.querySelector('[data-motion-trigger]').value);
    assert.equal(trigger, 'hover');
    const pagesBefore = context.pages().length;
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-pick]')), centre.toString());
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-open]'), null, { timeout: 60000 });
    await settleFrames(page);
    const got = await inShadow(page, (root) => ({ tag: root.querySelector('[data-motion-row="1"] .raven-grab-motion-tag')?.textContent, open: root.querySelector('[data-motion-open]').href, openText: root.querySelector('[data-motion-open]').textContent, marker: Boolean(root.querySelector('[data-motion-marker="1"]')) }));
    assert.equal(got.tag, 'You picked this');
    assert.equal(got.openText, 'Open preview');
    assert.match(got.open, PLAYGROUND);
    assert.equal(got.marker, true);
    assert.equal(context.pages().length, pagesBefore, 'Add motion opened a tab');
    assert.deepEqual(errors, []);
  });
});

test('repeated images and repeated "Learn more" links: a new twin removes the marker rather than moving it', { skip }, async () => {
  await withGrab({ path: '/picked.html' }, async ({ page, jobs }) => {
    await openMotionTab(page);
    await clearOfPanels(page);
    for (const [sel, insert] of [
      ['#twins img:nth-of-type(2)', () => { const t = document.querySelector('#twins img'); t.parentNode.insertBefore(t.cloneNode(), t); }],
      ['#more a:nth-of-type(2)', () => { const a = document.querySelector('#more a'); a.parentNode.insertBefore(a.cloneNode(true), a); }],
    ]) {
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
      await selectElement(page, sel);
      await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]:not([disabled])'));
      const count = jobs.length;
      await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-pick]')), centre.toString());
      for (let t = 0; jobs.length === count && t < 600; t++) await new Promise((r) => setTimeout(r, 100));
      assert.ok(jobs.length > count, sel + ': the pick job did not finish');
      await settleFrames(page);
      await settleFrames(page);
      const job = lastJob(jobs);
      assert.equal(job.state, 'done', JSON.stringify(job));
      assert.ok(job.suggestions.length >= 1, sel + ': ' + JSON.stringify(job));
      const part = job.suggestions[0].parts[0];
      assert.equal(part.dup, 2, JSON.stringify(part));
      assert.equal(part.nth, 1, JSON.stringify(part));
      const before = await markerReport(page, job.suggestions);
      assert.ok(before[0].marker && before[0].off <= 4, sel + ' marker before: ' + JSON.stringify(before[0]));
      await page.evaluate(insert);
      await settleFrames(page);
      await settleFrames(page);
      const afterMarker = await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-marker="1"]')));
      assert.equal(afterMarker, false, sel + ': the marker moved to a twin instead of going away');
    }
  });
});

test('swapping two identical twins takes the marker away rather than moving it to the other one', { skip }, async () => {
  await withGrab({ path: '/picked.html' }, async ({ page, jobs }) => {
    await openMotionTab(page);
    await clearOfPanels(page);
    const sel = '#twins img:nth-of-type(2)';
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await selectElement(page, sel);
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]:not([disabled])'));
    const count = jobs.length;
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-pick]')), centre.toString());
    for (let t = 0; jobs.length === count && t < 600; t++) await new Promise((r) => setTimeout(r, 100));
    await settleFrames(page);
    await settleFrames(page);
    const job = lastJob(jobs);
    const before = await markerReport(page, job.suggestions);
    assert.ok(before[0].marker && before[0].off <= 4, 'marker before: ' + JSON.stringify(before[0]));
    // The chosen twin moves first: the selector, fingerprint, dup and nth now all describe the other twin.
    await page.evaluate(() => { const [a, b] = document.querySelectorAll('#twins img'); a.parentNode.insertBefore(b, a); });
    await settleFrames(page);
    await settleFrames(page);
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-marker="1"]'))), false, 'the marker moved to the other twin');
    // Swapped back, the chosen twin answers again.
    await page.evaluate(() => { const [a, b] = document.querySelectorAll('#twins img'); a.parentNode.insertBefore(b, a); });
    await settleFrames(page);
    await settleFrames(page);
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-marker="1"]'))), true, 'the marker did not come back');
    // The chosen twin removed and a new one added after it: the new one answers to the same
    // selector, fingerprint, dup and nth, but it is not the element that was picked.
    await page.evaluate(() => { const imgs = document.querySelectorAll('#twins img'); const c = imgs[1].cloneNode(); imgs[1].remove(); imgs[0].parentNode.appendChild(c); });
    await settleFrames(page);
    await settleFrames(page);
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-marker="1"]'))), false, 'the marker moved to a new twin');
  });
});

test('an edit made while another tab is open is caught when Motion opens again', { skip }, async () => {
  await withGrab({}, async ({ page, jobs }) => {
    await openMotionTab(page);
    await findMotion(page);
    const i = lastJob(jobs).suggestions.findIndex((s) => s.parts.some((p) => /hero-title/.test(p.selector)));
    assert.ok(i >= 0, 'no suggestion on the hero heading');
    const n = i + 1;
    assert.equal(await inShadow(page, (root, k) => Boolean(root.querySelector('[data-motion-marker="' + k + '"]')), n), true);
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-tab="layers"]')), centre.toString());
    await settleFrames(page);
    await page.evaluate(() => { document.getElementById('hero-title').textContent = 'A different heading now'; });
    await settleFrames(page);
    await openMotionTab(page);
    await settleFrames(page);
    await settleFrames(page);
    assert.equal(await inShadow(page, (root, k) => Boolean(root.querySelector('[data-motion-marker="' + k + '"]')), n), false, 'the marker stayed on the edited heading');
  });
});

// ---------- limits and footer ----------

test('after ten jobs in ten minutes both buttons read "Wait a few minutes" and are disabled', { skip }, async () => {
  await withGrab({ motion: { suggest: fakeResult({ suggestions: [fakeSuggestion()] }) } }, async ({ page, jobs }) => {
    const limited = [];
    page.on('response', async (r) => {
      if (/\/motion\/suggest/.test(r.url()) && r.status() === 429) { try { limited.push(await r.json()); } catch { /* closed */ } }
    });
    await openMotionTab(page);
    for (let k = 0; k < 10; k++) {
      const count = jobs.length;
      await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-find]:not([disabled])'));
      await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());
      for (let t = 0; jobs.length === count && t < 200; t++) await new Promise((r) => setTimeout(r, 50));
      assert.ok(jobs.length > count, 'job ' + (k + 1) + ' did not finish');
    }
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-find]:not([disabled])'));
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-find]')?.textContent === 'Wait a few minutes', null, { timeout: 5000 });
    assert.equal(limited.length, 1);
    assert.ok(limited[0].retry_after_ms > 0 && limited[0].retry_after_ms <= 600000, JSON.stringify(limited[0]));
    await clearOfPanels(page);
    await selectElement(page, '#cta-primary');
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]'));
    const got = await inShadow(page, (root) => ({
      find: root.querySelector('[data-motion-find]').textContent, findOff: root.querySelector('[data-motion-find]').disabled,
      pick: root.querySelector('[data-motion-pick]').textContent, pickOff: root.querySelector('[data-motion-pick]').disabled,
      state: root.querySelector('[data-motion-state]')?.getAttribute('data-motion-state') || '', rows: root.querySelectorAll('[data-motion-row]').length,
    }));
    assert.deepEqual(got, { find: 'Wait a few minutes', findOff: true, pick: 'Wait a few minutes', pickOff: true, state: '', rows: 1 });
  });
});

test('without a taste binding the footer reads "Suggestions use this page only"; with one it is not shown', { skip }, async () => {
  await withGrab({}, async ({ page }) => {
    await openMotionTab(page);
    assert.equal(await inShadow(page, (root) => root.querySelector('[data-motion-footer]')?.textContent || ''), 'Suggestions use this page only');
  });
  const store = new FsTasteStore();
  await taste.createTasteProfile(store, { name: 'foot-p', rules: [] });
  await taste.bindTasteSurface(store, 'foot-p', { project: 'foot-site', surface: 'studio site', voice_note: 'Plain.', design_notes: {} });
  // A profile with no binding for this project is still the page alone.
  await withGrab({ motion: { store, profile: 'foot-p', project: 'not-bound-site' } }, async ({ page }) => {
    await openMotionTab(page);
    assert.equal(await inShadow(page, (root) => root.querySelector('[data-motion-footer]')?.textContent || ''), 'Suggestions use this page only', 'unbound project before a job');
    await findMotion(page);
    assert.equal(await inShadow(page, (root) => root.querySelector('[data-motion-footer]')?.textContent || ''), 'Suggestions use this page only', 'unbound project after a job');
  });
  await withGrab({ motion: { store, profile: 'foot-p', project: 'foot-site', suggest: fakeResult({ suggestions: [fakeSuggestion()], uses_taste: true }) } }, async ({ page }) => {
    await openMotionTab(page);
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-footer]'))), false, 'footer before a job');
    await findMotion(page);
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-footer]'))), false, 'footer after a job');
  });
});

// ---------- stale results ----------

test('navigating while a job runs drops the result, including from A to B and back to A', { skip }, async () => {
  await withGrab({}, async ({ page }) => {
    await openMotionTab(page);
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());
    await page.evaluate(() => { history.pushState({}, '', '/b'); history.pushState({}, '', '/'); });
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-state]'), null, { timeout: 60000 });
    await settleFrames(page);
    const got = await inShadow(page, (root) => ({ state: root.querySelector('[data-motion-state]').getAttribute('data-motion-state'), text: root.querySelector('[data-motion-state]').textContent, rows: root.querySelectorAll('[data-motion-row]').length, markers: root.querySelectorAll('[data-motion-marker]').length, find: root.querySelector('[data-motion-find]').textContent }));
    assert.deepEqual(got, { state: 'stale', text: 'The page changed while Raven was looking, so those results were dropped.', rows: 0, markers: 0, find: 'Find motion again' });
  });
});

test('moving to a different page after results drops them', { skip }, async () => {
  await withGrab({}, async ({ page }) => {
    await openMotionTab(page);
    await findMotion(page);
    await page.evaluate(() => history.pushState({}, '', '/pricing'));
    await settleFrames(page);
    const got = await inShadow(page, (root) => ({ state: root.querySelector('[data-motion-state]')?.textContent, rows: root.querySelectorAll('[data-motion-row]').length, markers: root.querySelectorAll('[data-motion-marker]').length }));
    assert.deepEqual(got, { state: 'This is a different page from the one Raven looked at.', rows: 0, markers: 0 });
  });
});

// ---------- each state has its own copy ----------

test('none qualify: a "no motion" binding gives its own copy and no list', { skip }, async () => {
  const store = new FsTasteStore();
  await taste.createTasteProfile(store, { name: 'still-p', rules: [] });
  await taste.bindTasteSurface(store, 'still-p', { project: 'still-site', surface: 'studio site', voice_note: 'Plain.', design_notes: { motion: 'No motion' } });
  await withGrab({ motion: { store, profile: 'still-p', project: 'still-site' } }, async ({ page }) => {
    await openMotionTab(page);
    await findMotion(page);
    const got = await inShadow(page, (root) => ({ state: root.querySelector('[data-motion-state]')?.getAttribute('data-motion-state'), text: root.querySelector('[data-motion-state]')?.textContent, rows: root.querySelectorAll('[data-motion-row]').length, find: root.querySelector('[data-motion-find]').textContent }));
    assert.equal(got.state, 'none', JSON.stringify(got));
    assert.match(got.text, /^Nothing here needs motion yet\./);
    assert.equal(got.rows, 0);
    assert.equal(got.find, 'Again');
  });
});

test('a partial build failure lists the built row and a "Couldn\'t build this preview" row', { skip }, async () => {
  const suggest = fakeResult({ suggestions: [fakeSuggestion()], failed: [{ kind: 'card-hover', label: 'Card hover', stage: 'build' }] });
  await withGrab({ motion: { suggest } }, async ({ page }) => {
    await openMotionTab(page);
    await findMotion(page);
    const got = await inShadow(page, (root) => ({
      state: root.querySelector('[data-motion-state]')?.textContent || '',
      rows: [...root.querySelectorAll('[data-motion-row]')].map((li) => ({ failed: li.getAttribute('data-failed') === 'true', name: li.querySelector('.raven-grab-motion-name').textContent, link: li.querySelector('a.raven-grab-motion-name')?.href || '', why: li.querySelector('.raven-grab-motion-why')?.textContent })),
    }));
    assert.deepEqual(got, { state: '', rows: [
      { failed: false, name: 'Button hover', link: 'http://127.0.0.1:9999/p/0123456789abcdef', why: 'It shows the button can be pressed.' },
      { failed: true, name: 'Card hover', link: '', why: 'Couldn\'t build this preview' },
    ] });
  });
});

test('every preview failed has its own copy', { skip }, async () => {
  const suggest = fakeResult({ failed: [{ kind: 'card-hover', label: 'Card hover', stage: 'build' }, { kind: 'hero-entrance', label: 'Hero entrance', stage: 'register' }] });
  await withGrab({ motion: { suggest } }, async ({ page }) => {
    await openMotionTab(page);
    await findMotion(page);
    const got = await inShadow(page, (root) => ({ state: root.querySelector('[data-motion-state]').getAttribute('data-motion-state'), text: root.querySelector('[data-motion-state]').textContent, failedRows: root.querySelectorAll('[data-motion-row][data-failed="true"]').length, markers: root.querySelectorAll('[data-motion-marker]').length }));
    assert.deepEqual(got, { state: 'allfailed', text: 'Raven found places for motion but couldn\'t build any previews.', failedRows: 2, markers: 0 });
  });
});

test('a job that runs past its deadline fails with its own copy and offers Try again', { skip }, async () => {
  const suggest = (input) => new Promise((resolve, reject) => { input.signal.addEventListener('abort', () => reject(new Error('aborted'))); });
  await withGrab({ motion: { suggest, deadlineMs: 400 } }, async ({ page }) => {
    await openMotionTab(page);
    await findMotion(page);
    const got = await inShadow(page, (root) => ({ state: root.querySelector('[data-motion-state]').getAttribute('data-motion-state'), text: root.querySelector('[data-motion-state]').textContent, find: root.querySelector('[data-motion-find]').textContent }));
    assert.deepEqual(got, { state: 'failed', text: 'Raven couldn\'t copy this page. It took too long.', find: 'Try again' });
  });
});

test('a hostile label, reason and link render as text, with no link and no request', { skip }, async () => {
  const hostile = '<img src="https://evil.example/p.png" onerror="window.__pwn=1">Lift';
  const suggest = fakeResult({ suggestions: [fakeSuggestion({ label: hostile, why: '<b>bold</b> <script>window.__pwn=2</script>', trigger_words: '<i>x</i>', approximations: ['<u>a</u>', 'b', 'c', 'd', 'e'], url: 'javascript:window.__pwn=3' })] });
  await withGrab({ motion: { suggest } }, async ({ page }) => {
    const external = [];
    page.on('request', (r) => { if (/evil\.example/.test(r.url())) external.push(r.url()); });
    await openMotionTab(page);
    await findMotion(page);
    const got = await inShadow(page, (root) => {
      const li = root.querySelector('[data-motion-row="1"]');
      return { name: li.querySelector('.raven-grab-motion-name').textContent, isLink: li.querySelector('.raven-grab-motion-name').localName === 'a', elements: li.querySelectorAll('img, b, i, u, script').length, why: li.querySelector('.raven-grab-motion-why').textContent, more: li.querySelector('.raven-grab-motion-more summary')?.textContent, shown: li.querySelectorAll(':scope .raven-grab-motion-row-body > .raven-grab-motion-approx > li').length };
    });
    assert.deepEqual(got, { name: hostile, isLink: false, elements: 0, why: '<b>bold</b> <script>window.__pwn=2</script>', more: '2 more differences', shown: 3 });
    assert.equal(await page.evaluate(() => window.__pwn), undefined);
    assert.deepEqual(external, []);
  });
});

// ---------- speed and export ----------

test('a name click reaches a playground that answers a slider within 2 s, and its web version plays the same motion', { skip }, async () => {
  await withGrab({}, async ({ page, context, jobs }) => {
    await openMotionTab(page);
    await findMotion(page);
    const job = lastJob(jobs);
    const i = job.suggestions.findIndex((s) => s.kind === 'hero-entrance');
    assert.ok(i >= 0, job.suggestions.map((s) => s.kind).join(','));
    const popup = context.waitForEvent('page');
    const t0 = Date.now();
    await clickAt(page, (root, a) => (0, eval)('(' + a.c + ')')(root.querySelector('[data-motion-row="' + a.n + '"] a.raven-grab-motion-name')), { c: centre.toString(), n: i + 1 });
    const pg = await popup;
    await pg.waitForFunction(() => Boolean(window.__ml && document.querySelector('input[type=range]')), null, { timeout: 5000 });
    const moved = await pg.evaluate(() => {
      const range = document.querySelector('input[type=range]');
      const id = range.id || range.getAttribute('data-param') || '';
      const before = JSON.stringify(window.__ml.state.values);
      range.value = String(Number(range.max));
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return { id, changed: JSON.stringify(window.__ml.state.values) !== before };
    });
    const ms = Date.now() - t0;
    assert.ok(moved.changed, 'the slider did not change the playground: ' + moved.id);
    assert.ok(ms <= 2000, 'name click to a responsive slider took ' + ms + ' ms');

    // Export: the playground's web version, on a blank page, against the playground at the midpoint.
    const pack = await pg.evaluate(() => {
      const ml = window.__ml;
      const plan = ml.plan();
      const m = ml.agentPacket().match(/```html\n([\s\S]*?)\n```/);
      const mid = plan.total / 2;
      ml.seek(mid);
      const frag = document.querySelector('#art [class$="-frag"]');
      const read = (root) => [...root.querySelectorAll('[class]')].map((el) => ({ cls: el.className, transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }));
      return { snippet: m ? m[1] : '', mid, total: plan.total, id: plan.doc.id, live: frag ? read(frag) : [] };
    });
    assert.ok(pack.snippet, 'no web version in the agent packet');
    assert.ok(pack.live.some((e) => e.transform !== 'none' || e.opacity !== '1'), 'nothing is moving at the midpoint in the playground');
    const blank = await context.newPage();
    await blank.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' + pack.snippet + '</body></html>');
    await blank.waitForTimeout(150);
    const exported = await blank.evaluate((p) => {
      const anims = document.getAnimations();
      for (const a of anims) { a.pause(); a.currentTime = p.mid; }
      const frag = document.querySelector('.ml-' + p.id + '-frag');
      return { anims: anims.length, els: frag ? [...frag.querySelectorAll('[class]')].map((el) => ({ cls: el.className, transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity })) : [] };
    }, pack);
    assert.ok(exported.anims > 0, 'the web version started no animations');
    const nums = (t) => (t === 'none' ? [1, 0, 0, 1, 0, 0] : t.replace(/^matrix(3d)?\(|\)$/g, '').split(',').map(Number));
    const byCls = new Map(exported.els.map((e) => [e.cls, e]));
    let compared = 0;
    for (const e of pack.live) {
      const x = byCls.get(e.cls);
      assert.ok(x, 'the web version has no element ' + e.cls);
      const a = nums(e.transform), b = nums(x.transform);
      assert.equal(a.length, b.length, e.cls + ': ' + e.transform + ' vs ' + x.transform);
      for (let k = 0; k < a.length; k++) assert.ok(Math.abs(a[k] - b[k]) <= 0.5, e.cls + ': ' + e.transform + ' vs ' + x.transform);
      assert.ok(Math.abs(Number(e.opacity) - Number(x.opacity)) <= 0.02, e.cls + ' opacity ' + e.opacity + ' vs ' + x.opacity);
      compared += 1;
    }
    assert.ok(compared > 0);
    await blank.close();
    await pg.close();
  });
});

// ---------- while a job runs ----------

// A suggest that waits until the test lets it go, and can report the building step first.
function heldSuggest(result) {
  let release, input;
  const gate = new Promise((r) => { release = r; });
  const suggest = async (i) => { input = i; await gate; return { suggestions: [], failed: [], ...result }; };
  return { suggest, release: () => release(), step: (s) => input && input.onStep && input.onStep(s) };
}

const busyReport = (root) => {
  const find = root.querySelector('[data-motion-find]');
  const track = root.querySelector('[data-motion-find] ~ [data-motion-track]');
  const skeleton = root.querySelector('[data-motion-skeleton]');
  const progress = root.querySelector('[data-motion-progress]');
  return {
    label: find.textContent, busy: find.getAttribute('aria-busy'), disabled: find.disabled, opacity: getComputedStyle(find).opacity,
    track: track ? { hidden: track.getAttribute('aria-hidden'), animation: getComputedStyle(track.firstChild).animationName, visible: track.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && track.getBoundingClientRect().height > 0 } : null,
    skeleton: skeleton ? { rows: skeleton.children.length, hidden: skeleton.getAttribute('aria-hidden'), animation: getComputedStyle(skeleton.firstChild).animationName, visible: skeleton.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && skeleton.getBoundingClientRect().height > 40 } : null,
    role: progress.getAttribute('role'),
    step: root.querySelector('[data-motion-step]')?.textContent ?? null,
    elapsed: root.querySelector('[data-motion-elapsed]')?.textContent ?? null,
    elapsedHidden: root.querySelector('[data-motion-elapsed]')?.getAttribute('aria-hidden') ?? null,
    hint: root.querySelector('[data-motion-hint]')?.textContent ?? null,
  };
};

test('while Find motion runs: a busy button at full strength, a moving track, three placeholder rows, the step and a seconds count', { skip }, async () => {
  const held = heldSuggest({ suggestions: [fakeSuggestion()] });
  await withGrab({ motion: { suggest: held.suggest } }, async ({ page, errors }) => {
    await openMotionTab(page);
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-skeleton]'), null, { timeout: 2000 });
    const first = await inShadow(page, busyReport);
    assert.deepEqual(first, {
      label: 'Looking at the page…', busy: 'true', disabled: true, opacity: '1',
      track: { hidden: 'true', animation: 'raven-grab-motion-slide', visible: true },
      skeleton: { rows: 3, hidden: 'true', animation: 'raven-grab-motion-pulse', visible: true },
      role: 'status', step: 'Copying the page', elapsed: '', elapsedHidden: 'true', hint: '',
    });
    await page.waitForFunction(() => /^ · [2-4] s$/.test(document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-elapsed]')?.textContent || ''), null, { timeout: 5000 });
    held.step('building');
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-step]')?.textContent === 'Building previews', null, { timeout: 5000 });
    held.release();
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-row]'), null, { timeout: 10000 });
    await settleFrames(page);
    const after = await inShadow(page, busyReport);
    assert.deepEqual({ ...after, opacity: undefined }, { label: 'Again', busy: null, disabled: false, opacity: undefined, track: null, skeleton: null, role: 'status', step: null, elapsed: null, elapsedHidden: null, hint: null });
    assert.deepEqual(errors, []);
  });
});

test('with reduced motion the track and the placeholder rows hold still', { skip }, async () => {
  const held = heldSuggest({});
  await withGrab({ reducedMotion: 'reduce', motion: { suggest: held.suggest } }, async ({ page }) => {
    await openMotionTab(page);
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-skeleton]'), null, { timeout: 2000 });
    const got = await inShadow(page, busyReport);
    assert.deepEqual({ track: got.track, skeleton: got.skeleton }, { track: { hidden: 'true', animation: 'none', visible: true }, skeleton: { rows: 3, hidden: 'true', animation: 'none', visible: true } });
    held.release();
  });
});

test('while Add motion runs its button is busy at full strength with a moving track, and no placeholder rows', { skip }, async () => {
  const held = heldSuggest({ suggestions: [fakeSuggestion()] });
  await withGrab({ motion: { suggest: held.suggest } }, async ({ page }) => {
    await openMotionTab(page);
    await clearOfPanels(page);
    await selectElement(page, '#cta-primary');
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]'));
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-pick]')), centre.toString());
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick][aria-busy="true"]'), null, { timeout: 2000 });
    const got = await inShadow(page, (root) => {
      const b = root.querySelector('[data-motion-pick]'), t = root.querySelector('[data-motion-pick] ~ [data-motion-track]');
      return { label: b.textContent, opacity: getComputedStyle(b).opacity, track: Boolean(t) && getComputedStyle(t.firstChild).animationName, skeleton: Boolean(root.querySelector('[data-motion-skeleton]')), findBusy: root.querySelector('[data-motion-find]').getAttribute('aria-busy') };
    });
    assert.deepEqual(got, { label: 'Building a preview…', opacity: '1', track: 'raven-grab-motion-slide', skeleton: false, findBusy: null });
    held.release();
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-open]'), null, { timeout: 10000 });
    assert.equal(await inShadow(page, (root) => Boolean(root.querySelector('[data-motion-track]'))), false);
  });
});

async function secondTab(context, session, path = '/') {
  const other = await context.newPage();
  const errors = [];
  other.on('pageerror', (e) => errors.push(String(e)));
  await other.goto(session.url + path, { waitUntil: 'domcontentloaded' });
  await other.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-tabs')), null, { timeout: 15000 });
  await openMotionTab(other);
  return { other, errors };
}
const clickFind = (p) => clickAt(p, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-find]')), centre.toString());

test('Find motion in a second tab that joins a running Add motion job shows no Find loading state', { skip }, async () => {
  const held = heldSuggest({ suggestions: [fakeSuggestion()] });
  await withGrab({ motion: { suggest: held.suggest } }, async ({ page, context, session, errors }) => {
    const { other, errors: otherErrors } = await secondTab(context, session);
    await openMotionTab(page);
    await clearOfPanels(page);
    await selectElement(page, '#cta-primary');
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]'));
    await clickAt(page, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-pick]')), centre.toString());
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick][aria-busy="true"]'), null, { timeout: 2000 });
    await other.bringToFront();
    await clickFind(other);
    await other.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return root.querySelector('[data-motion-find]').disabled && !root.querySelector('[data-motion-find][aria-busy]') && !root.querySelector('[data-motion-skeleton]');
    }, null, { timeout: 3000 });
    await other.waitForTimeout(1300);
    const got = await inShadow(other, (root) => ({ running: root.querySelector('[data-motion-find]').disabled, skeleton: Boolean(root.querySelector('[data-motion-skeleton]')), findBusy: root.querySelector('[data-motion-find]').getAttribute('aria-busy'), findTrack: Boolean(root.querySelector('[data-motion-find] ~ [data-motion-track]')), step: root.querySelector('[data-motion-step]')?.textContent ?? null, elapsed: /^ · \d+ s$/.test(root.querySelector('[data-motion-elapsed]')?.textContent || '') }));
    assert.deepEqual(got, { running: true, skeleton: false, findBusy: null, findTrack: false, step: 'Building a preview', elapsed: true });
    held.release();
    // The joined job's preview lands here too, though this tab selected nothing.
    await other.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-row]'), null, { timeout: 10000 });
    assert.equal(await inShadow(other, (root) => root.querySelector('[data-motion-find]').disabled), false);
    assert.deepEqual([...errors, ...otherErrors], []);
    await other.close();
  });
});

test('Find motion in a second tab that joins a running Find job counts seconds from the job start', { skip }, async () => {
  const held = heldSuggest({ suggestions: [fakeSuggestion()] });
  await withGrab({ motion: { suggest: held.suggest } }, async ({ page, context, session, errors }) => {
    const { other, errors: otherErrors } = await secondTab(context, session);
    await openMotionTab(page);
    await clickFind(page);
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-skeleton]'), null, { timeout: 2000 });
    await page.waitForTimeout(3000);
    await other.bringToFront();
    await clickFind(other);
    await other.waitForTimeout(1800);
    const got = await inShadow(other, (root) => ({ skeleton: Boolean(root.querySelector('[data-motion-skeleton]')), elapsed: root.querySelector('[data-motion-elapsed]')?.textContent || '' }));
    assert.equal(got.skeleton, true);
    const secs = Number((/(\d+) s$/.exec(got.elapsed) || [])[1]);
    assert.ok(secs >= 4 && secs <= 9, 'seconds should count from the job start: ' + JSON.stringify(got.elapsed));
    held.release();
    await other.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-row]'), null, { timeout: 10000 });
    assert.deepEqual([...errors, ...otherErrors], []);
    await other.close();
  });
});

test('Add motion in a second tab that joins a running Add motion job shows the step and the seconds count', { skip }, async () => {
  const held = heldSuggest({ suggestions: [fakeSuggestion()] });
  await withGrab({ motion: { suggest: held.suggest } }, async ({ page, context, session, errors }) => {
    const { other, errors: otherErrors } = await secondTab(context, session);
    const pickIn = async (p) => {
      await clearOfPanels(p);
      await selectElement(p, '#cta-primary');
      await p.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick]'));
      await clickAt(p, (root, c) => (0, eval)('(' + c + ')')(root.querySelector('[data-motion-pick]')), centre.toString());
    };
    await openMotionTab(page);
    await pickIn(page);
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-pick][aria-busy="true"]'), null, { timeout: 2000 });
    await page.waitForTimeout(2000);
    await other.bringToFront();
    await pickIn(other);
    await other.waitForTimeout(1800);
    const got = await inShadow(other, (root) => ({ step: root.querySelector('[data-motion-step]')?.textContent ?? null, elapsed: root.querySelector('[data-motion-elapsed]')?.textContent || '' }));
    assert.equal(got.step, 'Building a preview');
    const secs = Number((/(\d+) s$/.exec(got.elapsed) || [])[1]);
    assert.ok(secs >= 3 && secs <= 8, 'seconds should count from the job start: ' + JSON.stringify(got.elapsed));
    held.release();
    await other.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-row]'), null, { timeout: 10000 });
    assert.deepEqual([...errors, ...otherErrors], []);
    await other.close();
  });
});

test('a second tab on another page that joins a running job keeps none of its results and says why', { skip }, async () => {
  const held = heldSuggest({ suggestions: [fakeSuggestion()] });
  await withGrab({ motion: { suggest: held.suggest } }, async ({ page, context, session, errors }) => {
    const { other, errors: otherErrors } = await secondTab(context, session, '/picked.html');
    await openMotionTab(page);
    await clickFind(page);
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-skeleton]'), null, { timeout: 2000 });
    await other.bringToFront();
    await clickFind(other);
    await other.waitForTimeout(1000);
    held.release();
    await other.waitForFunction(() => !document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-find]').disabled, null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-motion-row]'), null, { timeout: 10000 });
    const got = await inShadow(other, (root) => ({ rows: root.querySelectorAll('[data-motion-row]').length, state: root.querySelector('[data-motion-state]')?.textContent ?? null, markers: root.querySelectorAll('[data-motion-marker]').length }));
    assert.deepEqual(got, { rows: 0, state: 'Raven was busy with another page. Press Find motion again to look at this one.', markers: 0 });
    // picked.html's own hostile handlers throw on purpose; only the overlay's errors count.
    assert.deepEqual([...errors, ...otherErrors.filter((e) => !/steal is not defined/.test(e))], []);
    await other.close();
  });
});
