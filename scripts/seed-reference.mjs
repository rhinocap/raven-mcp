// Capture one pattern from a live site into the local corpus, through the REAL
// overlay rather than a hand-written selection.
//
// That distinction is the whole reason this script exists rather than calling
// saveReference with a computed-style map assembled here. A hand-written
// selection is fiction in at least three ways the e2e already found: it claims
// authored values where the overlay reports resolved ones (`width: 50%` vs
// `640px`), it writes longhand where the overlay reports the shorthand, and it
// drains flat where the real overlay nests under `payload`. A corpus seeded that
// way would not match what a user's own grab produces.
//
// Usage: node scripts/seed-reference.mjs <url> <clickX> <clickY> <tag,tag> <taxonomy,id> "note"
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var bridge = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));
var store = await import(path.resolve(__dirname, '../dist/reference-store.js'));

var [url, clickX, clickY, tagList, taxonomyList, note] = process.argv.slice(2);
if (!url || !clickX || !clickY) {
  console.error('usage: node scripts/seed-reference.mjs <url> <clickX> <clickY> [tags] [taxonomy] [note]');
  process.exit(2);
}

var session = await bridge.startGrabSession(undefined, undefined, url, 'consumer');
console.log('grab session: ' + session.url + '  ->  ' + url);

var browser = await chromium.launch();
var saved = null;
try {
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var page = await context.newPage();
  await page.goto(session.url + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot),
    null, { timeout: 30000 });
  console.log('overlay booted');

  // Wait for the ELEMENT, not for a duration. A fixed sleep is a bet on how
  // long a site takes to settle, and the first version lost that bet on a heavy
  // WebGL page: at 4s a full-screen `#preloader` was still covering the hero, so
  // the click landed on the preloader and the corpus got a record of a loading
  // screen tagged "scroll cue". Poll what is actually under the click point
  // until it is the thing that was asked for.
  var expect = process.env.SEED_EXPECT || '';
  var deadline = Date.now() + 45000;
  var under = null;
  for (;;) {
    under = await page.evaluate(([x, y]) => {
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      var id = el.id ? '#' + el.id : '';
      var cls = (typeof el.className === 'string' && el.className.trim())
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      return el.tagName.toLowerCase() + id + cls;
    }, [Number(clickX), Number(clickY)]);
    // Readiness only. What is under the point is a LEAF — on this page the cue's
    // text is split into per-word divs, so elementFromPoint reports `div.word`
    // while the overlay correctly walks up to the cue itself. Asserting the
    // expected selector here would reject a perfectly good capture. The hard
    // verdict belongs to the overlay's own selection, below, because that is
    // what actually gets stored.
    var covered = !under || /preloader|loader|splash|overlay-cover/i.test(under);
    if (!covered) break;
    if (Date.now() > deadline) {
      throw new Error('after 45s the element at (' + clickX + ',' + clickY + ') is still "' + under
        + '" — the page never finished loading, nothing captured');
    }
    await page.waitForTimeout(1000);
  }
  console.log('under the click point: ' + under);

  // A raw mouse click, not page.click(). The overlay host covers the viewport
  // and is pointer-events:none, which Playwright's actionability check cannot
  // see, so page.click() refuses outright.
  await page.mouse.move(Number(clickX), Number(clickY));
  await page.waitForTimeout(200);
  await page.mouse.click(Number(clickX), Number(clickY));
  // Off the element before the styles are read, or a :hover rule is captured as
  // the resting state and the record describes a state the pattern is rarely in.
  await page.mouse.move(20, 20);
  await page.waitForTimeout(600);

  var selected = await page.evaluate(() => {
    var root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return root.querySelector('[data-element-selector]')?.getAttribute('title') || null;
  });
  console.log('selected: ' + selected);
  if (!selected) throw new Error('the click selected nothing — re-run the discovery pass for a current coordinate');
  // The overlay's own verdict, checked separately from what was under the point.
  // They can disagree — the overlay walks up to a meaningful ancestor — and it
  // is the overlay's selection that gets stored, so it is the one that has to be
  // right. Saving whatever happened to be selected is how a preloader ended up
  // in the corpus tagged "scroll cue".
  if (expect && !selected.includes(expect)) {
    throw new Error('the overlay selected "' + selected + '", not "' + expect + '" — nothing saved');
  }

  await page.evaluate((text) => {
    var root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    var field = root.querySelector('[data-instruction]');
    if (field) { field.focus(); field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); }
    root.querySelector('[data-send-batch]').click();
  }, note || 'Seed capture.');

  var drain = await bridge.getGrabbedElements({ timeout_ms: 15000 });
  if (!drain.count) throw new Error('the overlay sent nothing');
  var payload = drain.elements[0].payload;
  console.log('drained: ' + drain.elements[0].target + '  (proxyMode=' + drain.proxyMode + ')');

  saved = store.saveReference({
    url: payload.url || url,
    owner: 'third-party',
    selector: drain.elements[0].target,
    html: payload.html,
    rect: payload.rect,
    styles: payload.styles || {},
    state_styles: payload.state_styles,
    note: note || undefined,
    tags: (tagList || '').split(',').filter(Boolean),
    taxonomy: (taxonomyList || '').split(',').filter(Boolean),
  });
  console.log('\nsaved ' + saved.ref_id + '  ' + saved.host + '  ' + saved.selector);
  console.log('  taxonomy: ' + JSON.stringify(saved.taxonomy));
  console.log('  tags:     ' + JSON.stringify(saved.tags));
  console.log('  styles:   ' + Object.keys(saved.styles).length + ' properties');
  console.log('  image:    ' + (saved.image ? saved.image.file + ' (' + saved.image.width + 'x' + saved.image.height + ', ' + saved.image.fidelity + ')' : 'none — the thumbnail render failed, the capture stands'));
} finally {
  await browser.close();
  await bridge.stopGrabSession();
}
