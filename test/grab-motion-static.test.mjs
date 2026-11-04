// Grab Motion mode "static" (docs/motion-playground-page-spec.md): a standalone page whose
// suggestions were built ahead of time. Grab reads one same-origin file, draws the same
// markers and list as "full", opens each playground in a sandboxed viewer, and calls no bridge.
// Chromium only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GRAB = path.join(HERE, '..', 'browser', 'raven-grab.js');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

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

before(async () => { if (chromium) browser = await chromium.launch(); });
after(async () => { if (browser) await browser.close(); });

function part(selector, tag, text, href = '') {
  return { selector, tag, role: '', text, src: '', href, dup: 1, nth: 0 };
}

const GOOD = [
  { label: 'Button hover: Start', kind: 'cta-hover', why: 'The main button.', trigger_words: 'On hover', approximations: [], parts: [part('#start', 'a', 'Start', '/start')], url: '/playgrounds/motion/cta-hover-1.html' },
  { label: 'Card hover', kind: 'card-hover', why: 'Three cards.', trigger_words: 'On hover', approximations: ['A note.'], parts: [part('#card', 'article', 'Card body')], url: '/playgrounds/motion/card-hover-2.html' },
];
// Each is dropped: another origin, another folder, a climb out, a loopback bridge URL, no parts.
const BAD = [
  { ...GOOD[0], label: 'Elsewhere', url: 'https://example.com/playgrounds/motion/x.html' },
  { ...GOOD[0], label: 'Other folder', url: '/playgrounds/try/x.html' },
  { ...GOOD[0], label: 'Climb', url: '/playgrounds/motion/../x.html' },
  { ...GOOD[0], label: 'Bridge', url: 'http://127.0.0.1:4000/p/0123456789abcdef' },
  { ...GOOD[0], label: 'No parts', parts: [] },
];

const PAGE = (config) => `<!doctype html><html><head><meta charset="utf-8"><title>Static motion</title>
<style>body{margin:0;font:16px sans-serif} .stage{padding:120px 420px 1200px} #start{display:inline-block;padding:12px 20px;background:#0bf} #card{margin-top:40px;padding:24px;border:1px solid #ccc} #other{margin-top:40px}</style>
</head><body><div class="stage"><a id="start" href="/start">Start</a><article id="card">Card body</article><p id="other">Not a spot</p></div>
<script>window.RavenGrabConfig = ${JSON.stringify(config)};</script><script src="/raven-grab.js"></script></body></html>`;

// A playground that hands its Copy text to the parent, the way the real template does when framed.
const PLAYGROUND = (name) => `<!doctype html><html><body><h1>${name}</h1><button id="copy">Copy</button><p id="said"></p>
<script>
document.getElementById('copy').addEventListener('click', function () {
  window.addEventListener('message', function (e) { if (e.data && e.data.type === 'raven-motion-copied') document.getElementById('said').textContent = e.data.ok ? 'copied' : 'failed'; });
  window.parent.postMessage({ type: 'raven-motion-copy', id: 'c1', text: 'motion for ${name}' }, '*');
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.parent.postMessage({ type: 'raven-motion-close' }, '*'); });
</script></body></html>`;

async function serve(config, suggestions) {
  const grab = await readFile(GRAB, 'utf8');
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push(url.pathname);
    const send = (type, body, status = 200) => { res.writeHead(status, { 'Content-Type': type }); res.end(body); };
    if (url.pathname === '/') return send('text/html; charset=utf-8', PAGE(config));
    if (url.pathname === '/raven-grab.js') return send('text/javascript', grab);
    if (url.pathname === '/playgrounds/motion/suggestions.json') return send('application/json', JSON.stringify({ suggestions }));
    const m = /^\/playgrounds\/motion\/([a-z0-9-]+)\.html$/.exec(url.pathname);
    if (m) return send('text/html; charset=utf-8', PLAYGROUND(m[1]));
    send('text/plain', 'not found', 404);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: 'http://127.0.0.1:' + server.address().port, requests, close: () => new Promise((r) => server.close(r)) };
}

const STATIC = { mode: 'standalone', motion: 'static', openTab: 'motion', grabEndpoint: null, projectName: 'Fixture' };

async function withPage(opts, fn) {
  const site = await serve(opts.config || STATIC, opts.suggestions || GOOD);
  const context = await browser.newContext({ viewport: opts.viewport || DESKTOP, ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}) });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site.origin });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(site.origin + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!document.querySelector('raven-grab, [data-raven-grab-host]') || [...document.querySelectorAll('*')].some((el) => el.shadowRoot && el.shadowRoot.querySelector('.raven-grab-panel')));
    await fn(page, site);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await site.close();
  }
}

const inGrab = (page, selector) => page.evaluate((sel) => {
  for (const el of document.querySelectorAll('*')) if (el.shadowRoot) { const found = el.shadowRoot.querySelectorAll(sel); if (found.length) return found.length; }
  return 0;
}, selector);
const clickGrab = (page, selector) => page.evaluate((sel) => {
  for (const el of document.querySelectorAll('*')) if (el.shadowRoot) { const found = el.shadowRoot.querySelector(sel); if (found) { found.click(); return true; } }
  return false;
}, selector);
const grabText = (page, selector) => page.evaluate((sel) => {
  for (const el of document.querySelectorAll('*')) if (el.shadowRoot) { const found = el.shadowRoot.querySelector(sel); if (found) return found.textContent; }
  return null;
}, selector);
const frameSrc = (page) => page.evaluate(() => {
  for (const el of document.querySelectorAll('*')) if (el.shadowRoot) { const f = el.shadowRoot.querySelector('[data-motion-viewer] iframe'); if (f) return { src: f.getAttribute('src'), sandbox: f.getAttribute('sandbox') }; }
  return null;
});

async function find(page) {
  assert.ok(await clickGrab(page, '[data-motion-find]'), 'Find motion is shown');
  await page.waitForFunction(() => [...document.querySelectorAll('*')].some((el) => el.shadowRoot && el.shadowRoot.querySelectorAll('[data-motion-row]').length > 0));
}

test('desktop: the Motion tab opens first, Find lists only same-origin playgrounds, markers sit on the spots', { skip }, async () => {
  await withPage({ suggestions: [...GOOD, ...BAD] }, async (page, site) => {
    assert.equal(await grabText(page, '[data-tab="motion"][aria-selected="true"]'), 'Motion');
    await find(page);
    assert.equal(await inGrab(page, '[data-motion-row]'), 2);
    assert.equal(await inGrab(page, '[data-motion-marker]'), 2);
    assert.equal(await inGrab(page, '[data-motion-find]'), 0, 'Find has nothing new to show once listed');
    const box = await page.locator('#start').boundingBox();
    const marker = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) if (el.shadowRoot) { const m = el.shadowRoot.querySelector('[data-motion-marker="1"]'); if (m) { const r = m.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; } }
      return null;
    });
    assert.ok(marker && Math.abs(marker.x - box.x) < 1 && Math.abs(marker.y - box.y) < 1, 'marker 1 sits on the button');
    // Static mode reads one file and calls no bridge route.
    assert.deepEqual(site.requests.filter((p) => !['/', '/raven-grab.js', '/favicon.ico'].includes(p)), ['/playgrounds/motion/suggestions.json']);
  });
});

test('a playground opens in a sandboxed same-origin frame; Copy reaches the clipboard; Next and Escape work', { skip }, async () => {
  await withPage({}, async (page) => {
    await find(page);
    assert.ok(await clickGrab(page, '[data-motion-play="1"]'));
    const frame = await frameSrc(page);
    assert.deepEqual(frame, { src: '/playgrounds/motion/cta-hover-1.html', sandbox: 'allow-scripts' });
    assert.equal(await grabText(page, '[data-motion-viewer-title]'), 'Suggestion 1 of 2');
    const inner = page.frames().find((f) => f.url().endsWith('/cta-hover-1.html')) || await (async () => { await page.waitForTimeout(300); return page.frames().find((f) => f.url().endsWith('/cta-hover-1.html')); })();
    await inner.waitForSelector('#copy');
    await inner.click('#copy');
    await inner.waitForFunction(() => document.getElementById('said').textContent !== '');
    assert.equal(await inner.textContent('#said'), 'copied');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'motion for cta-hover-1');
    assert.ok(await clickGrab(page, '[data-motion-viewer-next]'));
    assert.equal((await frameSrc(page)).src, '/playgrounds/motion/card-hover-2.html');
    assert.equal(await grabText(page, '[data-motion-viewer-title]'), 'Suggestion 2 of 2');
    await page.keyboard.press('Escape');
    assert.equal(await inGrab(page, '[data-motion-viewer]'), 0);
  });
});

test('the viewer is modal: the page and panels go inert, and Escape inside the playground closes it', { skip }, async () => {
  await withPage({}, async (page) => {
    await find(page);
    assert.ok(await clickGrab(page, '[data-motion-play="1"]'));
    const inert = () => page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].find((el) => el.shadowRoot && el.shadowRoot.querySelector('.raven-grab-panel')).shadowRoot;
      return { stage: document.querySelector('.stage').inert, panel: root.querySelector('.raven-grab-panel').inert, viewer: root.querySelector('[data-motion-viewer]')?.inert ?? null };
    });
    assert.deepEqual(await inert(), { stage: true, panel: true, viewer: false });
    const inner = page.frames().find((f) => f.url().endsWith('/cta-hover-1.html'));
    await inner.waitForSelector('#copy');
    await inner.focus('#copy');
    await inner.press('#copy', 'Escape');
    await page.waitForFunction(() => ![...document.querySelectorAll('*')].some((el) => el.shadowRoot && el.shadowRoot.querySelector('[data-motion-viewer]')));
    assert.deepEqual(await inert(), { stage: false, panel: false, viewer: null });
  });
});

test('while the viewer is open, a resize leaves every marker inert and Cmd+K does not open Settings', { skip }, async () => {
  await withPage({}, async (page) => {
    await find(page);
    assert.ok(await clickGrab(page, '[data-motion-play="1"]'));
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(250);
    const state = () => page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].find((el) => el.shadowRoot && el.shadowRoot.querySelector('.raven-grab-panel')).shadowRoot;
      const live = (el) => { for (let n = el; n; n = n.parentNode && n.parentNode.nodeType === 1 ? n.parentNode : null) if (n.inert) return false; return true; };
      return {
        liveBadges: [...root.querySelectorAll('[data-motion-marker], .raven-grab-motion-badge')].filter(live).length,
        settingsHidden: [...root.querySelectorAll('[data-settings-close]')].every((b) => !b.getClientRects().length),
      };
    });
    assert.deepEqual(await state(), { liveBadges: 0, settingsHidden: true });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    assert.deepEqual(await state(), { liveBadges: 0, settingsHidden: true });
    await page.keyboard.press('Escape');
    assert.equal(await inGrab(page, '[data-motion-viewer]'), 0);
    // Painting resumes once the viewer closes.
    assert.equal(await inGrab(page, '[data-motion-marker]'), 2);
  });
});

test('a message from anything but the open playground frame is ignored', { skip }, async () => {
  await withPage({}, async (page) => {
    await find(page);
    await page.evaluate(() => navigator.clipboard.writeText('before'));
    await page.evaluate(() => window.postMessage({ type: 'raven-motion-copy', id: 'x', text: 'from the page' }, '*'));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'before');
  });
});

test('Add motion opens the playground for a numbered spot, and explains any other element', { skip }, async () => {
  await withPage({}, async (page) => {
    await find(page);
    const select = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
    await select('#card');
    await page.waitForFunction(() => [...document.querySelectorAll('*')].some((el) => el.shadowRoot && el.shadowRoot.querySelector('[data-motion-pick]')));
    assert.ok(await clickGrab(page, '[data-motion-pick]'));
    assert.equal((await frameSrc(page)).src, '/playgrounds/motion/card-hover-2.html');
    await page.keyboard.press('Escape');
    await select('#other');
    await page.waitForTimeout(150);
    assert.ok(await clickGrab(page, '[data-motion-pick]'));
    assert.equal(await inGrab(page, '[data-motion-viewer]'), 0);
    assert.match(await grabText(page, '.raven-grab-motion-pick .raven-grab-motion-message'), /playgrounds for the numbered spots/);
  });
});

test('mobile: the Motion tab is in the sheet and Find draws markers', { skip }, async () => {
  await withPage({ viewport: MOBILE }, async (page) => {
    assert.equal(await grabText(page, '.raven-grab-mobile-tabs [data-tab="motion"][aria-selected="true"]'), 'Motion');
    await find(page);
    assert.equal(await inGrab(page, '[data-motion-row]'), 2);
    assert.equal(await inGrab(page, '[data-motion-marker]'), 2);
    // Nothing to send in the demo: the Motion tab hides Send, other tabs keep it.
    assert.equal(await inGrab(page, '.raven-grab-actions[data-motion-static]'), 1);
    assert.ok(await clickGrab(page, '.raven-grab-mobile-tabs [data-tab="layers"]'));
    assert.equal(await inGrab(page, '.raven-grab-actions[data-motion-static]'), 0);
  });
});

test('static needs standalone mode; a bridge page asking for it gets no Motion tab', { skip }, async () => {
  await withPage({ config: { motion: 'static', openTab: 'motion', grabEndpoint: null } }, async (page, site) => {
    await page.waitForTimeout(300);
    assert.equal(await inGrab(page, '[data-tab="motion"]'), 0);
    assert.ok(!site.requests.includes('/playgrounds/motion/suggestions.json'));
  });
});
