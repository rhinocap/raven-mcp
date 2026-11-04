// suggest_motion capture half (Site Motion Spec D1, D3, D5; Revisions 2, 3, 4, 11).
//
// What these tests hold: capturePage's inspect hook runs on the loaded page;
// the fixture site yields all six kinds with boxes equal to
// getBoundingClientRect of known ids, typed styles only, a resolved fontSrc,
// image crops at one pixel per CSS px, and an approximation for the gradient
// button; rankCandidates scores, dedupes, drops rejected kinds, gates on the
// motion note and cuts to max; the capture policy refuses a public page
// reaching loopback, lets a local page load its own origin and nothing else
// local, and checks redirect hops; fetchFont refuses a redirect to 127.0.0.1
// from a non-local origin, caps size, sniffs type and caches by URL hash.
// "Public" is simulated with an injected classifier, so no real network is used.
// Chromium only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, 'fixtures/motion/site');

const { capturePage } = await import('../dist/capture.js');
const policy = await import('../dist/motion-suggest/policy.js');
const cand = await import('../dist/motion-suggest/candidates.js');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch();
  await b.close();
} catch {
  chromium = null;
}
const noBrowser = !chromium && 'chromium did not launch';

// ── servers ──────────────────────────────────────────────────────────────────

async function serve(handler) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    hits,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); })
  };
}

const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2' };
function siteHandler(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(SITE, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  if (!file.startsWith(SITE)) { res.statusCode = 404; res.end(); return; }
  readFile(file).then((body) => {
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  }, () => { res.statusCode = 404; res.end(); });
}

// Treats the named hosts as public while still connecting to 127.0.0.1; every
// other host uses the real classifier (so 127.0.0.1 stays local).
function publicHosts(...names) {
  return async (host) => names.includes(host)
    ? { local: false, addresses: ['127.0.0.1'] }
    : policy.defaultClassifyHost(host);
}

// ── the fixture site ─────────────────────────────────────────────────────────

const IDS = ['hero', 'hero-title', 'cta-primary', 'cta-gradient', 'card-1', 'about-title', 'process-title', 'main-nav', 'wide-image'];

async function captureFixture() {
  const site = await serve(siteHandler);
  const url = `http://127.0.0.1:${site.port}/`;
  try {
    const pol = await policy.createCapturePolicy(url);
    const result = await capturePage(url, {
      beforeNavigate: pol.install,
      inspect: async (page) => {
        const pass = await cand.findMotionCandidates(page);
        const rects = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [id, { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }];
        })), IDS);
        const crops = await cand.cropImages(page, cand.imageCropRequests(pass.candidates));
        return { pass, rects, crops };
      }
    });
    return { result, pol, port: site.port };
  } finally {
    await site.close();
  }
}

let fixturePromise = null;
const fixture = () => (fixturePromise ||= captureFixture());

function assertBox(actual, expected, label) {
  for (const k of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(actual[k] - expected[k]) <= 0.5, `${label}.${k}: ${actual[k]} vs ${expected[k]}`);
  }
}

function findNode(node, pred) {
  if (pred(node)) return node;
  for (const c of node.children) {
    const f = findNode(c, pred);
    if (f) return f;
  }
  return null;
}

function walk(node, fn) {
  fn(node);
  for (const c of node.children) walk(c, fn);
}

test('inspect runs on the loaded page and its result comes back with the capture', { skip: noBrowser }, async () => {
  const { result, pol } = await fixture();
  assert.equal(result.inspectionError, undefined);
  assert.ok(result.inspection && result.inspection.pass, 'inspection returned');
  assert.ok(result.screenshotBase64.length > 0, 'the normal capture still ran');
  assert.deepEqual(pol.warnings, [], 'a local page loading only its own origin is not refused');
});

test('the fixture yields all six kinds with boxes matching getBoundingClientRect', { skip: noBrowser }, async () => {
  const { result } = await fixture();
  const { pass, rects } = result.inspection;
  const kinds = new Set(pass.candidates.map((c) => c.kind));
  for (const k of ['hero-entrance', 'cta-hover', 'card-hover', 'section-reveal', 'nav-hover', 'image-reveal']) {
    assert.ok(kinds.has(k), `found ${k}`);
  }
  const of = (kind) => pass.candidates.filter((c) => c.kind === kind);

  const hero = of('hero-entrance')[0];
  assert.equal(hero.label, 'Hero entrance');
  assertBox(hero.box, rects.hero, 'hero');
  const heading = findNode(hero.node, (n) => n.role === 'heading');
  assert.equal(heading.tag, 'h1');
  assert.equal(heading.text, 'Calm websites for busy studios');
  assertBox(heading.box, rects['hero-title'], 'hero-title');
  assert.equal(hero.signals.firstViewport, true);

  const [primary, gradient] = of('cta-hover');
  assert.equal(primary.label, 'Button hover');
  assertBox(primary.box, rects['cta-primary'], 'cta-primary');
  assert.equal(primary.signals.mainAction, true, 'the first filled link in the first viewport is the main action');
  assert.equal(primary.node.styles.background, '#1a4dff');
  assert.equal(primary.node.styles.color, '#ffffff');
  assert.equal(primary.node.styles.borderRadius, 8);
  assert.deepEqual(primary.node.styles.padding, [14, 24, 14, 24]);
  assert.equal(primary.section.background, '#f4f2ee');
  assertBox(primary.section.box, rects.hero, 'cta section');
  assertBox(gradient.box, rects['cta-gradient'], 'cta-gradient');
  assert.equal(gradient.signals.mainAction, false);

  const card = of('card-hover')[0];
  assert.equal(card.count, 3);
  assertBox(card.box, rects['card-1'], 'card-1');
  assert.equal(card.section.background, '#ebe7df');
  const img = findNode(card.node, (n) => n.tag === 'img');
  assert.deepEqual(img.image, { natural: { w: 64, h: 48 }, crop: true });
  assert.equal(img.role, 'image');

  const sections = of('section-reveal');
  assert.equal(sections.length, 2, 'both sections below the fold');
  const aboutHeading = findNode(sections[0].node, (n) => n.role === 'heading');
  assertBox(aboutHeading.box, rects['about-title'], 'about-title');
  assert.equal(sections[0].node.children.filter((n) => n.role === 'item').length, 3);
  assertBox(findNode(sections[1].node, (n) => n.role === 'heading').box, rects['process-title'], 'process-title');
  assert.equal(sections[1].node.children.filter((n) => n.role === 'item').length, 4);
  assert.equal(sections[0].signals.firstViewport, false);

  const nav = of('nav-hover')[0];
  assertBox(nav.box, rects['main-nav'], 'main-nav');
  assert.equal(nav.node.children.filter((n) => n.role === 'item').length, 4);
  assert.equal(nav.section.background, '#ffffff');

  const wide = of('image-reveal')[0];
  assertBox(wide.box, rects['wide-image'], 'wide-image');
  assert.ok(wide.box.w >= pass.viewport.w * 0.3);
});

test('nodes carry typed style keys only, a resolved fontSrc, and no HTML or other URLs', { skip: noBrowser }, async () => {
  const { result, port } = await fixture();
  const allowed = new Set(['width', 'height', 'padding', 'gap', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'color', 'background', 'borderRadius', 'borderColor', 'borderWidth', 'display', 'flexDirection', 'alignItems',
    'justifyContent', 'textAlign', 'fontFamily', 'fontSrc', 'whiteSpace']);
  const fontUrl = `http://127.0.0.1:${port}/fonts/untitled-sans-regular.woff2`;
  for (const c of result.inspection.pass.candidates) {
    assert.ok(c.nodeCount <= 40);
    walk(c.node, (n) => {
      for (const k of Object.keys(n.styles)) assert.ok(allowed.has(k), `style key ${k}`);
      for (const k of ['color', 'background', 'borderColor']) {
        if (n.styles[k] !== undefined) assert.match(n.styles[k], /^#[0-9a-f]{6}$/);
      }
      if (n.styles.fontWeight !== undefined) assert.ok(n.styles.fontWeight % 100 === 0);
      if (n.styles.display !== undefined) assert.ok(['block', 'flex', 'inline-block'].includes(n.styles.display));
      if (n.styles.whiteSpace !== undefined) assert.equal(n.styles.whiteSpace, 'nowrap');
      if (n.styles.fontSrc !== undefined) assert.equal(n.styles.fontSrc, fontUrl);
      assert.match(n.tag, /^[a-z][a-z0-9-]*$/);
    });
    const json = JSON.stringify({ ...c, node: JSON.parse(JSON.stringify(c.node, (k, v) => (k === 'fontSrc' ? undefined : v))) });
    assert.doesNotMatch(json, /https?:|url\(|<[a-z]|style=/i, `${c.kind} carries no URL, markup or style string`);
  }
  const h1 = findNode(result.inspection.pass.candidates[0].node, (n) => n.tag === 'h1');
  assert.equal(h1.styles.fontFamily, 'Fixture Sans');
  assert.equal(h1.styles.fontSrc, fontUrl);
  assert.equal(h1.styles.fontSize, 64);
  assert.equal(h1.styles.lineHeight, 1.1);
  assert.equal(h1.styles.letterSpacing, -1);
});

test('the gradient button yields plain approximations and a flat colour', { skip: noBrowser }, async () => {
  const { result } = await fixture();
  const gradient = result.inspection.pass.candidates.filter((c) => c.kind === 'cta-hover')[1];
  assert.ok(gradient.approximations.includes("The button's gradient is shown as a flat colour."), JSON.stringify(gradient.approximations));
  assert.ok(gradient.approximations.includes("The button's shadow is not shown."));
  assert.equal(gradient.node.styles.background, '#ff5f6d');
  const primary = result.inspection.pass.candidates.filter((c) => c.kind === 'cta-hover')[0];
  assert.deepEqual(primary.approximations, []);
});

test('image crops are PNGs at one pixel per CSS px, of the right image', { skip: noBrowser }, async () => {
  const { result } = await fixture();
  const { crops, pass } = result.inspection;
  assert.ok(crops.length >= 2);
  const close = (hex, want) => {
    const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(want.slice(i, i + 2), 16));
    return a.every((v, i) => Math.abs(v - b[i]) <= 6);
  };
  const cardImg = findNode(pass.candidates.find((c) => c.kind === 'card-hover').node, (n) => n.tag === 'img');
  const wideImg = pass.candidates.find((c) => c.kind === 'image-reveal').node;
  for (const [node, color] of [[cardImg, '#3366cc'], [wideImg, '#2e8b57']]) {
    const crop = crops.find((c) => c.id === node.id);
    assert.ok(crop && crop.png, `crop for ${node.id}`);
    assert.equal(crop.png.readUInt32BE(16), Math.round(node.box.w), 'PNG width equals CSS width');
    assert.equal(crop.png.readUInt32BE(20), Math.round(node.box.h), 'PNG height equals CSS height');
    const avg = cand.averagePngColor(crop.png);
    assert.ok(close(avg, color), `${avg} close to ${color}`);
  }
});

test('an image box over 2400 CSS px becomes a flat colour with an approximation', { skip: noBrowser }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.setContent('<body style="margin:0"><div style="width:2600px;height:300px;background:#123456"></div></body>');
    const crops = await cand.cropImages(page, [
      { id: 'big', box: { x: 0, y: 0, w: 2600, h: 300 } },
      { id: 'small', box: { x: 0, y: 0, w: 100, h: 100 } }
    ]);
    assert.equal(crops[0].png, undefined);
    assert.equal(crops[0].approximation, 'The large image is shown as a flat colour block.');
    assert.equal(crops[0].color, '#123456');
    assert.ok(crops[1].png);
  } finally {
    await browser.close();
  }
});

// ── ranking ──────────────────────────────────────────────────────────────────

function mk(kind, order, { fv = false, main = false, area = 0, box } = {}) {
  return {
    kind, label: cand.MOTION_KIND_LABELS[kind], order,
    box: box || { x: order * 1000, y: 0, w: 100, h: 100 },
    section: { box: { x: 0, y: 0, w: 1, h: 1 }, background: '#ffffff' },
    node: { id: 'm' + order, tag: 'div', text: '', box: { x: 0, y: 0, w: 1, h: 1 }, styles: {}, children: [] },
    nodeCount: 1, approximations: [],
    signals: { firstViewport: fv, mainAction: main, area }
  };
}

const SET = [
  mk('nav-hover', 0, { fv: true, area: 0.01 }),
  mk('hero-entrance', 1, { fv: true, area: 0.4 }),
  mk('cta-hover', 2, { fv: true, main: true, area: 0.01 }),
  mk('card-hover', 3, { fv: true, area: 0.05 }),
  mk('section-reveal', 4, { area: 0.3 }),
  mk('image-reveal', 5, { area: 0.5 }),
  mk('section-reveal', 6, { area: 0.2 })
];
const kinds = (r) => r.candidates.map((c) => c.kind + c.order);

test('rank: score is first-viewport 2 + main action 2 + area, ties by document order, default max 5', () => {
  assert.equal(cand.candidateScore(SET[2]), 4.01);
  assert.equal(cand.candidateScore(mk('image-reveal', 9, { area: 7 })), 1, 'area is capped at 1');
  const r = cand.rankCandidates(SET, {});
  assert.equal(r.gate, null);
  assert.deepEqual(kinds(r), ['cta-hover2', 'hero-entrance1', 'card-hover3', 'nav-hover0', 'image-reveal5']);
  const tie = cand.rankCandidates([mk('cta-hover', 7, { fv: true }), mk('nav-hover', 3, { fv: true })], {});
  assert.deepEqual(kinds(tie), ['nav-hover3', 'cta-hover7']);
});

test('rank: max is clamped to 1–8 and cuts after sorting', () => {
  assert.deepEqual(kinds(cand.rankCandidates(SET, { max: 2 })), ['cta-hover2', 'hero-entrance1']);
  assert.equal(cand.rankCandidates(SET, { max: 0 }).candidates.length, 1);
  const many = Array.from({ length: 12 }, (_, i) => mk('image-reveal', i));
  assert.equal(cand.rankCandidates(many, { max: 50 }).candidates.length, 8);
});

test('rank: a candidate overlapping an earlier one of the same kind by more than half is dropped', () => {
  const a = mk('card-hover', 0, { box: { x: 0, y: 0, w: 100, h: 100 } });
  const b = mk('card-hover', 1, { box: { x: 40, y: 0, w: 100, h: 100 } });   // 60% overlap
  const c = mk('card-hover', 2, { box: { x: 60, y: 0, w: 100, h: 100 } });   // 40% with a, 80% with b (b dropped first)
  const d = mk('image-reveal', 3, { box: { x: 0, y: 0, w: 100, h: 100 } });  // other kind: kept
  const r = cand.rankCandidates([c, b, a, d], { max: 8 });
  assert.deepEqual(kinds(r).sort(), ['card-hover0', 'card-hover2', 'image-reveal3']);
});

test('rank: rejected kinds are removed', () => {
  const r = cand.rankCandidates(SET, { rejectedKinds: ['cta-hover', 'hero-entrance'] });
  assert.ok(!kinds(r).some((k) => k.startsWith('cta') || k.startsWith('hero')));
  const all = cand.rankCandidates([SET[2]], { rejectedKinds: ['cta-hover'] });
  assert.equal(all.candidates.length, 0);
  assert.match(all.message, /turned down/);
});

test('rank: a none-instant or no motion note returns nothing and quotes the note', () => {
  for (const note of ['none-instant', 'No motion, please. Things should just appear.']) {
    const r = cand.rankCandidates(SET, { motionNote: note });
    assert.equal(r.gate, 'none');
    assert.deepEqual(r.candidates, []);
    assert.ok(r.message.includes('“' + note + '”'), r.message);
  }
});

test('rank: a restrained or subtle note keeps at most three, hover or reveal only, no hero entrance', () => {
  for (const note of ['restrained', 'Keep it subtle and quick']) {
    const r = cand.rankCandidates(SET, { motionNote: note, max: 8 });
    assert.equal(r.gate, 'restrained');
    assert.ok(r.candidates.length <= 3);
    assert.ok(r.candidates.every((c) => c.kind !== 'hero-entrance'));
    assert.deepEqual(kinds(r), ['cta-hover2', 'card-hover3', 'nav-hover0']);
  }
  assert.equal(cand.rankCandidates(SET, { motionNote: 'subtle', max: 2 }).candidates.length, 2);
});

test('rank: a cinematic note puts the hero entrance first', () => {
  const r = cand.rankCandidates(SET, { motionNote: 'cinematic, slow reveals' });
  assert.equal(r.gate, 'cinematic');
  assert.equal(r.candidates[0].kind, 'hero-entrance');
  assert.equal(r.candidates[1].kind, 'cta-hover');
  assert.equal(cand.motionGate('snappy'), null);
});

test('rank: an empty page gets a plain message', () => {
  const r = cand.rankCandidates([], {});
  assert.deepEqual(r.candidates, []);
  assert.ok(r.message && r.message.length > 0);
});

// ── capture policy ───────────────────────────────────────────────────────────

test('policy: only http and https page URLs are accepted', async () => {
  assert.equal(policy.captureUrlError('https://example.com/'), null);
  assert.ok(policy.captureUrlError('file:///etc/passwd'));
  assert.ok(policy.captureUrlError('javascript:alert(1)'));
  await assert.rejects(policy.createCapturePolicy('ftp://example.com/'));
});

test('policy: the pure rule', () => {
  const u = (s) => new URL(s);
  const pub = 'https://site.example';
  assert.equal(policy.decideRequest(u('https://cdn.example/a.js'), pub, false, false).allow, true);
  assert.equal(policy.decideRequest(u('http://127.0.0.1:3000/'), pub, false, true).allow, false);
  assert.equal(policy.decideRequest(u('http://169.254.169.254/latest/meta-data'), pub, false, true).allow, false);
  const local = 'http://localhost:3000';
  assert.equal(policy.decideRequest(u('http://localhost:3000/app.js'), local, true, true).allow, true);
  assert.equal(policy.decideRequest(u('ws://localhost:3000/hmr'), local, true, true).allow, true);
  assert.equal(policy.decideRequest(u('http://localhost:5432/'), local, true, true).allow, false);
  assert.equal(policy.decideRequest(u('https://fonts.example/a.woff2'), local, true, false).allow, true);
  assert.equal(policy.decideRequest(u('file:///etc/hosts'), local, true, true).allow, false);
});

test('policy: the default classifier marks loopback, private, link-local and metadata hosts local', async () => {
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '10.0.0.8', '192.168.1.2', '172.16.0.1', '169.254.169.254', '[::1]', 'fd00::1', 'fe80::1']) {
    assert.equal((await policy.defaultClassifyHost(h)).local, true, h);
  }
  assert.equal((await policy.defaultClassifyHost('93.184.216.34')).local, false);
});

test('policy: a public-origin page requesting 127.0.0.1 is refused', { skip: noBrowser }, async () => {
  const secret = await serve((req, res) => { res.end('secret'); });
  const site = await serve((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>p</title><img id="i" src="http://127.0.0.1:${secret.port}/secret.png">` +
      `<script>fetch("http://127.0.0.1:${secret.port}/api").catch(()=>{})</script>`);
  });
  try {
    const url = `http://localhost:${site.port}/`;
    const pol = await policy.createCapturePolicy(url, { classifyHost: publicHosts('localhost') });
    const result = await capturePage(url, { beforeNavigate: pol.install, inspect: async () => true });
    assert.equal(result.inspection, true);
    assert.deepEqual(secret.hits, [], 'nothing reached the loopback server');
    assert.equal(pol.warnings.length, 1, JSON.stringify(pol.warnings));
    assert.match(pol.warnings[0], new RegExp(`127\\.0\\.0\\.1:${secret.port}.*public page`));
    assert.ok(pol.refused.length >= 1);
  } finally {
    await secret.close();
    await site.close();
  }
});

test('policy: a loopback page loads its own origin but no other local origin, and redirect hops are checked', { skip: noBrowser }, async () => {
  const other = await serve((req, res) => { res.end('other'); });
  const png = await readFile(path.join(SITE, 'images/card.png'));
  const site = await serve((req, res) => {
    if (req.url.startsWith('/own.png')) { res.setHeader('content-type', 'image/png'); res.end(png); return; }
    if (req.url === '/hop.png') { res.statusCode = 302; res.setHeader('location', '/own.png?via=hop'); res.end(); return; }
    if (req.url === '/away.png') { res.statusCode = 302; res.setHeader('location', `http://127.0.0.1:${other.port}/x.png`); res.end(); return; }
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>l</title><img id="own" src="/own.png"><img id="hop" src="/hop.png">` +
      `<img id="away" src="/away.png"><img id="direct" src="http://127.0.0.1:${other.port}/y.png">`);
  });
  try {
    const url = `http://127.0.0.1:${site.port}/`;
    const pol = await policy.createCapturePolicy(url);
    const result = await capturePage(url, {
      beforeNavigate: pol.install,
      inspect: (page) => page.evaluate(() => Object.fromEntries(
        [...document.images].map((i) => [i.id, i.naturalWidth])))
    });
    assert.equal(result.inspection.own, 64, 'own-origin image loaded');
    assert.equal(result.inspection.hop, 64, 'a same-origin redirect is followed');
    assert.equal(result.inspection.away, 0);
    assert.equal(result.inspection.direct, 0);
    assert.deepEqual(other.hits, [], 'the other local origin was never reached');
    assert.ok(site.hits.includes('/own.png?via=hop'));
    assert.equal(pol.warnings.length, 1, 'one warning per refused origin');
    assert.match(pol.warnings[0], /only its own origin/);
  } finally {
    await other.close();
    await site.close();
  }
});

test('policy: resolveCaptureRedirects follows allowed hops and refuses a public URL redirecting to loopback', async () => {
  const target = await serve((req, res) => { res.end('ok'); });
  const site = await serve((req, res) => {
    if (req.url === '/start') { res.statusCode = 301; res.setHeader('location', '/final'); res.end(); return; }
    if (req.url === '/evil') { res.statusCode = 302; res.setHeader('location', `http://127.0.0.1:${target.port}/`); res.end(); return; }
    res.end('final');
  });
  try {
    const ok = await policy.resolveCaptureRedirects(`http://127.0.0.1:${site.port}/start`);
    assert.deepEqual(ok, { url: `http://127.0.0.1:${site.port}/final` });
    const bad = await policy.resolveCaptureRedirects(`http://public.test:${site.port}/evil`, { classifyHost: publicHosts('public.test') });
    assert.ok('error' in bad);
    assert.deepEqual(target.hits, []);
  } finally {
    await target.close();
    await site.close();
  }
});

// ── fonts ────────────────────────────────────────────────────────────────────

test('fetchFont: a redirect to 127.0.0.1 from a non-local origin is refused', async () => {
  const font = await readFile(path.join(SITE, 'fonts/untitled-sans-regular.woff2'));
  const local = await serve((req, res) => { res.end(font); });
  const pub = await serve((req, res) => {
    res.statusCode = 302;
    res.setHeader('location', `http://127.0.0.1:${local.port}/font.woff2`);
    res.end();
  });
  try {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'raven-font-'));
    const r = await policy.fetchFont(`http://public.test:${pub.port}/font.woff2`, `http://public.test:${pub.port}`, {
      cacheDir, classifyHost: publicHosts('public.test')
    });
    assert.ok('error' in r, JSON.stringify(r));
    assert.match(r.error, /local or private address/);
    assert.deepEqual(pub.hits, ['/font.woff2'], 'the first hop was fetched');
    assert.deepEqual(local.hits, [], 'the loopback server was never reached');
    assert.deepEqual(await readdir(cacheDir), []);
  } finally {
    await local.close();
    await pub.close();
  }
});

test('fetchFont: the requested local origin works, is sniffed and cached by URL hash', async () => {
  const font = await readFile(path.join(SITE, 'fonts/untitled-sans-regular.woff2'));
  const site = await serve((req, res) => {
    if (req.url === '/f.woff2') { res.end(font); return; }
    if (req.url === '/hop1') { res.statusCode = 302; res.setHeader('location', '/hop2'); res.end(); return; }
    if (req.url === '/hop2') { res.statusCode = 302; res.setHeader('location', '/f.woff2'); res.end(); return; }
    if (req.url === '/loop') { res.statusCode = 302; res.setHeader('location', '/loop'); res.end(); return; }
    if (req.url === '/big') { res.end(Buffer.concat([font, Buffer.alloc(4096)])); return; }
    res.end('<html>not a font</html>');
  });
  const origin = `http://127.0.0.1:${site.port}`;
  try {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'raven-font-'));
    const r = await policy.fetchFont(origin + '/f.woff2', origin, { cacheDir });
    assert.ok('path' in r, JSON.stringify(r));
    assert.ok(path.isAbsolute(r.path) && r.path.endsWith('.woff2'));
    assert.ok(path.basename(r.path).startsWith((await import('node:crypto')).createHash('sha256').update(origin + '/f.woff2').digest('hex')));
    assert.deepEqual(await readFile(r.path), font);
    const hitsBefore = site.hits.length;
    const again = await policy.fetchFont(origin + '/f.woff2', origin, { cacheDir });
    assert.equal(again.path, r.path);
    assert.equal(site.hits.length, hitsBefore, 'served from the cache');

    assert.ok('path' in await policy.fetchFont(origin + '/hop1', origin, { cacheDir }), 'two redirects are followed');
    assert.match((await policy.fetchFont(origin + '/loop', origin, { cacheDir })).error, /more than 3/);
    assert.match((await policy.fetchFont(origin + '/page', origin, { cacheDir })).error, /not a font/);
    assert.match((await policy.fetchFont(origin + '/big', origin, { cacheDir, maxBytes: font.length + 100 })).error, /larger than/);
    const other = `http://127.0.0.1:${site.port + 0}`.replace('127.0.0.1', 'localhost');
    assert.match((await policy.fetchFont(other + '/f.woff2', origin, { cacheDir })).error, /local or private/,
      'a different local origin is refused');
    assert.match((await policy.fetchFont(`http://cdn.test:${site.port}/f.woff2`, origin, { cacheDir, classifyHost: publicHosts('cdn.test') })).error,
      /https only/, 'a public font from another site must be https');
  } finally {
    await site.close();
  }
});

test('sniffFont recognises the five signatures and nothing else', () => {
  const b = (...v) => Uint8Array.from(v);
  assert.equal(policy.sniffFont(b(0, 1, 0, 0)), 'ttf');
  assert.equal(policy.sniffFont(Buffer.from('true')), 'ttf');
  assert.equal(policy.sniffFont(Buffer.from('OTTO')), 'otf');
  assert.equal(policy.sniffFont(Buffer.from('wOFF')), 'woff');
  assert.equal(policy.sniffFont(Buffer.from('wOF2')), 'woff2');
  assert.equal(policy.sniffFont(Buffer.from('<htm')), null);
  assert.equal(policy.sniffFont(b(0, 1)), null);
});
