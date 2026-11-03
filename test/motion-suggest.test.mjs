// suggest_motion end to end (Site Motion Spec D, E; Revisions 5, 11–14).
//
// What these tests hold, on the fixture site served from 127.0.0.1: the six
// kinds come back, each built into a playground whose timeline passes Motion
// Lab's validator and whose SwiftUI export refuses page elements in plain
// words; the map puts each numbered marker on its suggestion's box; nothing
// taken from the page carries a URL into a fragment or the map; the motion
// note gates the list (none, restrained, cinematic); every quoted phrase in a
// reason comes from a stored note; recorded decisions remove and restore; the
// page's web font is fetched and used, and a missing one falls back with a
// warning; and Send from a playground opened through the map reaches
// get_motion_sends naming the trigger. Chromium only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, 'fixtures/motion/site');
const TIMELINE = path.join(__dirname, '../src/data/motion/timeline');

const { suggestMotion } = await import('../dist/motion-suggest/index.js');
const { quotePhrase } = await import('../dist/motion-suggest/why.js');
const { motionGate } = await import('../dist/motion-suggest/candidates.js');
const { buildMotionMap } = await import('../dist/motion-suggest/map.js');
const { readMotionDecisions } = await import('../dist/motion-suggest/decisions.js');
const { FsTasteStore } = await import('../dist/taste-store.js');
const taste = await import('../dist/taste.js');
const session = await import('../dist/motion-session.js');
const { checkTimeline } = await import(path.join(TIMELINE, 'scripts/validate-timeline.mjs'));
const require = createRequire(import.meta.url);
const TL = require(path.join(TIMELINE, 'src/timeline/evaluator.js'));
const SW = require(path.join(TIMELINE, 'src/timeline/swiftui.js'));

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

// ── the fixture site ─────────────────────────────────────────────────────────

const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2' };
async function serveSite({ noFont = false } = {}) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SITE, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!file.startsWith(SITE) || (noFont && file.endsWith('.woff2'))) { res.statusCode = 404; res.end(); return; }
    readFile(file).then((body) => {
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    }, () => { res.statusCode = 404; res.end(); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

async function withHome(fn) {
  const prev = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-suggest-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    await fn({ home, store: new FsTasteStore() });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
}

async function bound(store, notes) {
  await taste.createTasteProfile(store, { name: 'site-p', rules: [] });
  await taste.bindTasteSurface(store, 'site-p', { project: 'studio-site', surface: 'studio site', voice_note: 'Plain.', design_notes: notes });
  return { profile: 'site-p', project: 'studio-site' };
}

async function suggest(store, extra = {}, siteOpts) {
  const site = await serveSite(siteOpts);
  try {
    return await suggestMotion({ store, url: site.url, max: 8, ...extra });
  } finally {
    await site.close();
  }
}

const CUSTOMER = 'Small studio owners booking a first call. They decide in a minute.';

// ── kinds, builds, map ───────────────────────────────────────────────────────

test('the fixture returns every kind, each built, valid and served', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await suggest(store);
    const kinds = r.suggestions.map((s) => s.kind);
    assert.deepEqual([...new Set(kinds)].sort(), ['card-hover', 'cta-hover', 'hero-entrance', 'image-reveal', 'nav-hover', 'section-reveal']);
    assert.equal(r.suggestions.length, 8);
    for (const s of r.suggestions) {
      assert.ok(existsSync(s.html_path), `${s.id}: playground written`);
      assert.match(s.url || '', /^http:\/\/127\.0\.0\.1:\d+\/p\/[0-9a-f]+$/, `${s.id}: served`);
      const checked = checkTimeline(JSON.parse(JSON.stringify(s.timeline)), { fragmentHtml: s.fragment });
      assert.deepEqual(checked.errs, [], `${s.id}: Motion Lab's validator`);
      // Revision 5: element recipes are web only; the SwiftUI export refuses them in plain words.
      const plan = TL.compile(s.timeline, checked.layout, {});
      assert.throws(() => SW.swiftExport(plan), /can't draw .*page elements and artwork are web only/, `${s.id}: SwiftUI refusal`);
      const words = { load: 'When the page opens', hover: 'On hover', scroll: 'When it scrolls into view' };
      const on = typeof s.trigger === 'string' ? s.trigger : s.trigger.on;
      assert.equal(s.trigger_words, words[on], `${s.id}: trigger words`);
      assert.ok(s.why.length > 0 && s.why.split(/(?<=\.)\s+(?=[A-Z])/).length <= 2, `${s.id}: one or two sentences`);
    }
    assert.ok(existsSync(r.map_path));
    assert.match(r.next[0], /open_motion_playground with map_path/);
  });
});

test('each map marker sits on its suggestion\'s box, and the list matches', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await suggest(store);
    const html = readFileSync(r.map_path, 'utf8');
    const img = /<img src="data:image\/jpeg;base64,[^"]+" alt="[^"]*" width="(\d+)" height="(\d+)">/.exec(html);
    assert.ok(img, 'the screenshot is a data JPEG');
    const W = Number(img[1]), H = Number(img[2]);
    assert.equal(W, 1440);
    const markers = [...html.matchAll(/<a class="marker" data-n="(\d+)" href="([^"]+)" data-served="([^"]+)" style="left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%"/g)];
    const shown = r.suggestions.filter((s) => s.box.y < H);
    assert.equal(markers.length, shown.length);
    for (const m of markers) {
      const s = r.suggestions[Number(m[1]) - 1];
      const near = (pct, px, of) => Math.abs((Number(pct) / 100) * of - px) < 0.5;
      assert.ok(near(m[4], s.box.x, W) && near(m[5], s.box.y, H), `${s.id}: marker corner at the box corner`);
      assert.ok(near(m[6], Math.min(s.box.w, W - s.box.x), W) && near(m[7], Math.min(s.box.h, H - s.box.y), H), `${s.id}: marker size is the box size`);
      assert.equal(m[2], path.basename(s.html_path));
      assert.equal(m[3], new URL(s.url).pathname);
    }
    const listed = [...html.matchAll(/<li data-n="(\d+)"><div class="item-head"><span class="n" aria-hidden="true">\d+<\/span><a href="[^"]+"[^>]*>([^<]+)<\/a><span class="trigger">([^<]+)<\/span>/g)];
    assert.deepEqual(listed.map((l) => [l[2], l[3]]), r.suggestions.map((s) => [s.label, s.trigger_words]));
    assert.match(html, /Here's where motion could help\. Open one to try it on your page\./);
    assert.doesNotMatch(html, /→|↗|&rarr;/, 'no arrows beside links');
  });
});

test('nothing from the page carries a URL into a fragment, a timeline or the map', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await suggest(store);
    for (const s of r.suggestions) {
      const text = s.fragment.replace(/src="data:image\/png;base64,[A-Za-z0-9+/=]+"/g, '');
      assert.doesNotMatch(text, /https?:|\/\/|url\(|<script|<style|<a\b|\son[a-z]+=|style=/i, `${s.id}: fragment`);
      assert.doesNotMatch(text, /src=/, `${s.id}: only data PNG images`);
      const json = JSON.stringify(s.timeline);
      assert.doesNotMatch(json, /https?:|url\(/, `${s.id}: timeline`);
    }
    // The map names the page in its header text; no attribute or style points anywhere.
    const html = readFileSync(r.map_path, 'utf8');
    const attrs = [...html.matchAll(/\s(?:src|href|data-served|srcset|action|poster)="([^"]*)"/g)].map((m) => m[1]);
    for (const a of attrs) assert.match(a, /^(data:image\/jpeg;base64,|\/p\/[0-9a-f]+$|[a-z0-9-]+\.html$)/, a.slice(0, 60));
    assert.doesNotMatch(html, /url\(/);
  });
});

test('real-site patterns: a floating nav, a cookie notice, a glow, a split card grid, a later reveal, a shadow footer', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const site = await serveSite();
    let r;
    try { r = await suggestMotion({ store, url: site.url + 'real.html', max: 8 }); } finally { await site.close(); }
    const by = (k) => r.suggestions.filter((s) => s.kind === k);
    const ids = r.suggestions.map((s) => s.id).join(', ');
    // The cookie notice is an overlay: none of its buttons are suggested.
    assert.ok(!r.suggestions.some((s) => /cookies/i.test(s.fragment)), 'cookie notice left out');
    // The floating nav is a bar, not an overlay, and the line goes under a link nested in a list.
    assert.equal(by('nav-hover').length, 1, ids);
    assert.match(by('nav-hover')[0].fragment, /Pricing/);
    // The link to the home page (the logo) is passed over, and the line takes the colour of the link's text, not the link's own.
    const navTl = JSON.stringify(by('nav-hover')[0].timeline);
    assert.match(navTl, /Navigation hover: Work/);
    assert.equal(by('nav-hover')[0].timeline.params.find((x) => x.id === 'lineColour').default, '#2b2b2b');
    // The bright button is the main one, though the grey one comes first.
    const main = by('cta-hover').find((s) => /main button/.test(s.why));
    assert.ok(main && /Start a project/.test(main.fragment), 'main action is the bright button: ' + ids);
    // The glow is a decoration: left out of the hero, and said so.
    const hero = by('hero-entrance')[0];
    assert.ok(hero, ids);
    assert.ok(hero.approximations.includes('A shape drawn for effect, apart from the layout, is left out.'), hero.approximations.join(' | '));
    // Four tiles that differ by modifier classes are one group.
    assert.equal(by('card-hover').length, 1, ids);
    assert.match(by('card-hover')[0].why, /4 cards/);
    // Text with an inline-flex link and a bold word inside reads in order, and a see-through background is blended over the page.
    const card = by('card-hover')[0];
    assert.match(card.fragment, /Built with Framer and care\./);
    assert.match(card.fragment + JSON.stringify(card.timeline), /#faf9f7/);
    assert.ok(card.approximations.some((x) => /inline styling is shown plain/.test(x)), card.approximations.join(' | '));
    assert.ok(!r.suggestions.some((s) => s.approximations.some((x) => /see-through|without its transparency/.test(x))));
    // Gradient text takes the gradient's first colour as its text colour, with no box behind it.
    const styles = Object.values(card.timeline.styles || {});
    assert.ok(styles.some((st) => st.color === '#123456'), 'gradient text colour');
    assert.ok(!styles.some((st) => st.background === '#123456'), 'no gradient box');
    // A section that fades in on scroll is found, because the page is scrolled before it is read.
    assert.ok(by('section-reveal').some((s) => /How a project runs/.test(s.fragment)), 'later reveal found: ' + ids);
    // The shadow footer is named.
    assert.ok(r.warnings.some((w) => /<site-footer>/.test(w)), r.warnings.join('\n'));
  });
});

test('a fixed dialog stays out of the section it sits in; the main button is found past the first four; cards under the body group; shadow text is named', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const site = await serveSite();
    let r;
    try { r = await suggestMotion({ store, url: site.url + 'edge.html', max: 8 }); } finally { await site.close(); }
    const by = (k) => r.suggestions.filter((s) => s.kind === k);
    const ids = r.suggestions.map((s) => s.id).join(', ');
    const hero = by('hero-entrance')[0];
    assert.ok(hero, ids);
    assert.doesNotMatch(hero.fragment, /Consent dialog/);
    assert.ok(!r.suggestions.some((s) => /Consent dialog|Allow/.test(s.fragment)), 'dialog left out everywhere');
    const main = by('cta-hover').find((s) => /main button/.test(s.why));
    assert.ok(main && /Book a call/.test(main.fragment), 'main action is the red fifth button: ' + ids);
    assert.ok(by('cta-hover').length <= 4);
    assert.equal(by('card-hover').length, 1, ids);
    assert.match(by('card-hover')[0].why, /3 cards/);
    // The tag row wraps on the page, so it wraps in the playground and is not listed as a difference.
    const card = by('card-hover')[0];
    assert.ok(Object.values(card.timeline.styles || {}).some((st) => st.flexWrap === 'wrap'), JSON.stringify(card.timeline.styles));
    assert.ok(!card.approximations.some((a) => /wrapping/.test(a)), card.approximations.join(' | '));
    assert.ok(r.warnings.some((w) => /<product-hero>/.test(w)), r.warnings.join('\n'));
  });
});

test('none, instant and none or instant all read as no motion', () => {
  for (const n of ['none', 'None.', 'instant', 'none/instant', 'none or instant', 'none-instant', 'no motion please']) assert.equal(motionGate(n), 'none', n);
  for (const n of ['instant feedback, restrained', 'subtle']) assert.notEqual(motionGate(n), 'none', n);
});

test('the map shows three differences and puts the rest behind a disclosure', () => {
  const approximations = ['One.', 'Two.', 'Three.', 'Four.', 'Five.'];
  const html = buildMotionMap({
    pageUrl: 'https://example.com/',
    screenshot: { mime: 'image/png', base64: 'iVBORw0KGgo=', width: 100, height: 100 },
    items: [{ number: 1, label: 'Button hover', why: 'Why.', triggerWords: 'On hover', approximations, box: { x: 0, y: 0, w: 10, h: 10 }, file: 'a.html' }],
  });
  const firstList = /<ul class="approx">([\s\S]*?)<\/ul>/.exec(html)[1];
  assert.equal((firstList.match(/<li>/g) || []).length, 3);
  assert.match(html, /<details class="more"><summary>2 more differences from your page<\/summary><ul class="approx"><li>Four\.<\/li><li>Five\.<\/li><\/ul><\/details>/);
});

// ── fonts ────────────────────────────────────────────────────────────────────

test('the page\'s web font is fetched into the taste home and used; a missing one falls back with a warning', { skip: noBrowser }, async () => {
  await withHome(async ({ home, store }) => {
    const r = await suggest(store);
    const hero = r.suggestions.find((s) => s.kind === 'hero-entrance');
    const fonts = Object.values(hero.timeline.fonts || {});
    assert.equal(fonts.length, 1);
    assert.ok(fonts[0].path.startsWith(path.join(home, 'fonts')) && existsSync(fonts[0].path));
    assert.ok(!r.warnings.some((w) => /could not be loaded/.test(w)));

    const r2 = await suggest(store, {}, { noFont: true });
    const hero2 = r2.suggestions.find((s) => s.kind === 'hero-entrance');
    assert.equal(hero2.timeline.fonts, undefined);
    assert.ok(Object.values(hero2.timeline.styles).some((st) => st.font === 'sans'));
    assert.ok(r2.warnings.some((w) => /^The font “Fixture Sans” could not be loaded .*, so a plain sans is shown in its place\.$/.test(w)), r2.warnings.join('\n'));
  });
});

// ── gates and reasons ────────────────────────────────────────────────────────

// Every “quoted” phrase in a reason must appear word for word in the note its sentence names.
function assertQuotesFromNotes(s, notes) {
  const quotes = [...s.why.matchAll(/“([^”]+)”/g)].map((m) => m[1]);
  const all = Object.values(notes).join('\n').toLowerCase();
  for (const q of quotes) assert.ok(all.includes(q.toLowerCase()), `${s.id}: “${q}” is not in any stored note`);
  for (const c of s.cites.filter((c) => c.startsWith('notes.') || c === 'customer')) {
    const note = c === 'customer' ? notes.customer : notes[c.slice(6)];
    assert.ok(note, `${s.id}: cites ${c}, which is not stored`);
    assert.ok(quotes.some((q) => note.toLowerCase().includes(q.toLowerCase())), `${s.id}: cites ${c} without quoting it`);
  }
}

test('a none-instant note returns no suggestions and a message that quotes it', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const notes = { motion: 'none-instant: nothing moves on this site', customer: CUSTOMER };
    const r = await suggest(store, await bound(store, notes));
    assert.deepEqual(r.suggestions, []);
    assert.match(r.message, /none-instant/);
    assert.ok(existsSync(r.map_path));
    assert.match(readFileSync(r.map_path, 'utf8'), /class="empty"/);
  });
});

test('a restrained note keeps three hovers or reveals, makes them smaller, and says why with the note\'s words', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const notes = { motion: 'restrained and snappy, no bounce', customer: CUSTOMER };
    const r = await suggest(store, await bound(store, notes));
    assert.ok(r.suggestions.length > 0 && r.suggestions.length <= 3);
    assert.ok(r.suggestions.every((s) => s.kind !== 'hero-entrance'));
    for (const s of r.suggestions) {
      assert.ok(s.cites.includes('notes.motion') && s.cites.includes('customer'), s.id);
      assert.match(s.why, /^You're designing for “Small studio owners booking a first call”, and /);
      assertQuotesFromNotes(s, notes);
    }
    const cta = r.suggestions.find((s) => s.kind === 'cta-hover');
    if (cta) {
      const p = Object.fromEntries(cta.timeline.params.map((x) => [x.id, x.default]));
      assert.ok(p.lift < 2 && p.timing < 180, JSON.stringify(p));
    }
    assert.deepEqual(r.customer_used, CUSTOMER);
    assert.ok(r.notes_used.includes('notes.motion'));
  });
});

test('a cinematic note puts the hero entrance first and cites it', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const notes = { motion: 'cinematic, with a slow hero' };
    const r = await suggest(store, await bound(store, notes));
    assert.equal(r.suggestions[0].kind, 'hero-entrance');
    assert.ok(r.suggestions[0].cites.includes('notes.motion'));
    assertQuotesFromNotes(r.suggestions[0], notes);
    // No customer note: the reasons speak about the page only, and a warning says so.
    for (const s of r.suggestions) {
      assert.ok(!s.cites.includes('customer'));
      assert.doesNotMatch(s.why, /designing for|visitors|customers|people who/i, s.id);
    }
    assert.ok(r.warnings.some((w) => /no customer note yet/.test(w)));
  });
});

test('with a customer note and no motion note, each reason quotes the customer and nothing else', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const notes = { customer: CUSTOMER };
    const r = await suggest(store, await bound(store, notes));
    assert.equal(quotePhrase(CUSTOMER), 'Small studio owners booking a first call');
    for (const s of r.suggestions) {
      assert.deepEqual(s.cites, ['customer'], s.id);
      assertQuotesFromNotes(s, notes);
    }
  });
});

// ── recorded decisions ──────────────────────────────────────────────────────

test('a rejected kind is left out, and a chosen one starts from the values sent', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const who = await bound(store, { customer: CUSTOMER });
    await taste.recordTasteDecision(store, who.profile, { project: who.project, dimension: 'motion', decision: 'Kept the button hover', rejected: ['motion:card-hover\nThe cards should stay still.'], source: 'user-directed' });
    await taste.recordTasteDecision(store, who.profile, { project: who.project, dimension: 'motion', decision: 'motion:cta-hover {"lift":3,"timing":200}\nA slightly bigger lift.', source: 'user-directed' });
    const r = await suggest(store, who);
    assert.ok(!r.suggestions.some((s) => s.kind === 'card-hover'));
    const cta = r.suggestions.filter((s) => s.kind === 'cta-hover');
    assert.ok(cta.length > 0);
    for (const s of cta) {
      const p = Object.fromEntries(s.timeline.params.map((x) => [x.id, x.default]));
      assert.deepEqual([p.lift, p.timing], [3, 200]);
      assert.ok(s.cites.includes('decisions.motion'));
      assert.match(s.why, /it starts from the values you sent last time\.$/i);
    }
    // A later choice brings the card back.
    await new Promise((res) => setTimeout(res, 5));
    await taste.recordTasteDecision(store, who.profile, { project: who.project, dimension: 'motion', decision: 'motion:card-hover', source: 'user-directed' });
    const r2 = await suggest(store, who);
    assert.ok(r2.suggestions.some((s) => s.kind === 'card-hover'));
  });
});

test('a reason does not claim a note\'s effect that a restored value replaced', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const who = await bound(store, { motion: 'snappy, restrained, no bounce' });
    await taste.recordTasteDecision(store, who.profile, { project: who.project, dimension: 'motion', decision: 'motion:cta-hover {"lift":8,"feel":{"kind":"spring","duration":260,"bounce":0.25}}', source: 'user-directed' });
    const r = await suggest(store, who);
    const cta = r.suggestions.filter((s) => s.kind === 'cta-hover');
    assert.ok(cta.length > 0);
    for (const s of cta) {
      const p = Object.fromEntries(s.timeline.params.map((x) => [x.id, x.default]));
      assert.equal(p.lift, 8);
      assert.doesNotMatch(s.why, /a third smaller|without overshooting/, s.why);
      assert.match(s.why, /snappy/, s.why);
      assert.match(s.why, /values you sent last time/, s.why);
    }
  });
});

// ── end to end ───────────────────────────────────────────────────────────────

test('from the map, open a suggestion, tune it, Send, and get_motion_sends names the trigger', { skip: noBrowser }, async () => {
  await withHome(async ({ store }) => {
    const r = await suggest(store);
    const opened = await session.registerPlayground(r.map_path);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline'))); });
      await page.goto(opened.url, { waitUntil: 'load' });
      const n = r.suggestions.findIndex((s) => s.kind === 'cta-hover') + 1;
      const s = r.suggestions[n - 1];
      // The served map points its links at the served playgrounds.
      assert.equal(await page.getAttribute(`li[data-n="${n}"] .item-head a`, 'href'), new URL(s.url).pathname);
      assert.deepEqual(await page.evaluate(() => window.__csp), []);
      await page.click(`.marker[data-n="${n}"]`);
      await page.waitForURL(s.url);
      await page.waitForFunction(() => !!window.__ml);
      const ctx = await page.evaluate(() => {
        window.__ml.setParam('lift', 5);
        document.getElementById('tab-agent').click();
        return document.getElementById('send-context').textContent;
      });
      assert.match(ctx, /Plays on hover/);
      assert.match(ctx, /Lift 5/);
      // Copy for Raven starts with the line the next suggestion reads back.
      const copied = await page.evaluate(() => {
        for (const [k, v] of [['raven-profile', 'site-p'], ['raven-project', 'studio-site']]) { const i = document.getElementById(k); if (i) i.value = v; }
        return window.__ml.ravenText();
      });
      const record = JSON.parse(copied.slice(copied.indexOf('{')));
      assert.match(record.decision, /^motion:cta-hover \{.*"lift":5.*\}\n/);
      // Every value is in the line, including unchanged ones, so a value restored from an earlier decision
      // is not dropped when the designer saves again.
      const tuned = readMotionDecisions([{ decision: record.decision, rejected: record.rejected, recorded_at: new Date().toISOString() }]).tuned['cta-hover'];
      assert.equal(tuned.lift, 5);
      assert.equal(typeof tuned.timing, 'number', JSON.stringify(tuned));
      await page.fill('#send-note', 'Use this on the main button');
      await page.click('#send-agent');
      await page.waitForFunction(() => /Sent|reach/.test(document.getElementById('status').textContent));
      assert.equal(await page.textContent('#status'), 'Sent. Your agent has it.');
      const got = await session.getMotionSends(2000);
      assert.equal(got.sends.length, 1);
      assert.equal(got.sends[0].instruction, 'Use this on the main button');
      assert.equal(got.sends[0].context, ctx);
      assert.equal(got.sends[0].html_path, s.html_path);
      assert.match(got.sends[0].packet, /"on": "hover"/);
      assert.deepEqual(await page.evaluate(() => window.__csp), []);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
});

// Part F: the taste loop and the instructions that point at suggest_motion.
async function withClient(fn) {
  const indexMod = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({});
  const client = new Client({ name: 'motion-suggest-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(st);
  await client.connect(ct);
  try { return await fn(client); } finally { await client.close(); await server.close(); }
}

test('get_motion_sends says to build the send and record it as a motion decision, and that record is read back', async () => {
  const next = await withClient(async (client) => {
    const res = await client.callTool({ name: 'get_motion_sends', arguments: { timeout_ms: 0 } });
    return JSON.parse(res.content[0].text).next;
  });
  assert.ok(Array.isArray(next) && next.length === 3);
  assert.match(next[0], /Build the motion as sent/);
  assert.match(next[1], /record_taste_decision/);
  assert.match(next[1], /dimension 'motion'/);
  assert.match(next[1], /'user-directed'/);
  assert.match(next[1], /first line of decision is 'motion:<kind> \{/);
  assert.match(next[2], /rejected starts with 'motion:<kind>'/);

  // Record exactly as the text says: canonical first line, words on the next.
  await withHome(async ({ store }) => {
    const b = await bound(store, { customer: 'Studio clients choosing a designer.' });
    await taste.recordTasteDecision(store, b.profile, { project: b.project, dimension: 'motion', decision: 'motion:cta-hover {"lift": 4}\nButton hover: a 4 px lift.', source: 'user-directed' });
    await taste.recordTasteDecision(store, b.profile, { project: b.project, dimension: 'motion', decision: 'no motion here', rejected: ['motion:image-reveal'], why: 'Too much.' });
    const out = await suggest(store, b);
    assert.ok(!out.suggestions.some((s) => s.kind === 'image-reveal'), 'turned-down kind is gone');
    const cta = out.suggestions.find((s) => s.kind === 'cta-hover');
    const lift = cta.timeline.params.find((p) => p.id === 'lift');
    assert.equal(lift.default, 4);
  });
});

test('the server instructions and the kickoff interview offer suggest_motion, and never against a none note', async () => {
  const instructions = await withClient(async (client) => client.getInstructions());
  assert.match(instructions, /MOTION — once a project is bound and its pages exist, offer suggest_motion/);
  assert.match(instructions, /GRAB, CAPTURE-ONLY PROXY/, 'the other local paragraph also reaches the client');
  assert.match(instructions, /Ask before running it unprompted, and never add motion against a design_notes\.motion of none or instant/);
  await withHome(async ({ store }) => {
    const b = await bound(store, {});
    for (const depth of ['first_run', 'full']) {
      const iv = await taste.getTasteInterview(store, b.profile, 'another-site', 'kickoff', depth);
      assert.match(iv.then, /Once the build starts and a first page exists, suggest_motion/);
    }
  });
});
