// Repo-local end-to-end check for the pattern library, run by hand, not by npm test.
// It hits the real network (github.com) and launches a real browser, so it does
// not belong in the suite. Lives inside the project because ESM resolves imports
// from the script's own path.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bridge = await import('../dist/grab-bridge.js');
const indexMod = await import('../dist/index.js');
// Only for the teardown check — there is no delete tool, so that one assertion is
// the single place this script is allowed to reach past the tool surface.
const store = await import('../dist/reference-store.js');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  console.log(`FAIL  playwright is required for the overlay leg (${err.message})`);
  process.exit(1);
}

process.env.RAVEN_NO_USAGE_LOG = '1';

const fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-e2e-'));
process.env.RAVEN_REFERENCE_HOME = path.join(fixtureDir, 'references');

const designPath = path.join(fixtureDir, 'DESIGN.md');
await writeFile(designPath, `---
color:
  text:
    primary: "#f7f8f8"
  bg:
    canvas: "#08090a"
type:
  size:
    hero: "64px"
    body: "16px"
  leading:
    hero: "64px"
  weight:
    medium: 510
space:
  gap:
    md: "24px"
---

# Fixture tokens
`, 'utf8');

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

// The MCP client comes up first, because the grab drain in leg B goes through it
// — the queue seam is only tested if the same process holds both ends.
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = indexMod.buildServer({ remote: false });
const client = new Client({ name: 'raven-e2e', version: '1.0.0' }, { capabilities: {} });
await server.connect(serverTransport);
await client.connect(clientTransport);

async function callTool(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

// ── Leg A: does a CSP-strict third-party site come through usable? ──
const TARGET = 'https://github.com';
{
  const session = await bridge.startGrabSession(designPath, undefined, TARGET, 'consumer');
  console.log(`\nbridge up at ${session.url} proxying ${TARGET}\n`);
  try {
    const res = await fetch(session.url + '/');
    const html = await res.text();

    check('upstream reached', res.status === 200, `HTTP ${res.status}, ${html.length} bytes`);
    check('real GitHub HTML, not an error page',
      /<title>[^<]*GitHub[^<]*<\/title>/i.test(html),
      (html.match(/<title>([^<]*)<\/title>/i) || [, '(none)'])[1].trim().slice(0, 70));

    // The whole point of leg A: GitHub's CSP has no 'unsafe-inline', so an inline
    // config script is dropped and the overlay never boots.
    check('upstream CSP header stripped', res.headers.get('content-security-policy') === null,
      String(res.headers.get('content-security-policy')).slice(0, 60));
    check('X-Frame-Options stripped', res.headers.get('x-frame-options') === null);
    check('meta-CSP removed from the document',
      !/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy/i.test(html));

    const overlay = html.match(/<script src="\/raven-grab\.js\?key=[a-f0-9]+&cfg=[^"]+"><\/script>/);
    check('overlay script injected', Boolean(overlay));
    check('overlay carries no inline config', html.indexOf('<script>window.ravenGrabConfig') === -1);
    check('doctype is still the first bytes (no quirks mode)', /^\s*<!doctype/i.test(html),
      html.slice(0, 40).replace(/\n/g, ' '));

    // The overlay asset itself must be servable, or the injected tag 404s.
    if (overlay) {
      const assetUrl = session.url + overlay[0].match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
      const asset = await fetch(assetUrl);
      const assetBody = await asset.text();
      check('overlay asset serves with its config prefix', asset.status === 200
        && assetBody.startsWith('window.ravenGrabConfig='), `HTTP ${asset.status}, ${assetBody.length} bytes`);
    }
  } finally {
    await bridge.stopGrabSession();
  }
}

// ── Leg B: the real overlay, in a real browser, produces the payload ──
//
// This leg used to POST a hand-written selection object to /grab and feed leg C
// from the drain. The queue seam was real, but the PAYLOAD was fiction, and the
// script could not tell: the literal claimed `width: 50%` where the overlay
// reports the resolved `640px`, wrote `padding-top` where the overlay reports
// the `padding` shorthand, and produced a flat drained record where the real
// overlay's batch nests everything under `payload`. Every downstream assertion
// was therefore grading a shape the feature never emits. So the selection is now
// made the way a designer makes one — a real Chromium, the real overlay booted
// through the bridge, a real click on the element and a real press of Send.
const HOST_FIXTURE = `<!doctype html><html><head><title>hero fixture</title><style>
  body { margin: 0; background: #08090a; }
  h1.hero-title {
    font-family: system-ui, sans-serif;
    font-size: 64px; line-height: 64px; font-weight: 510;
    color: #f7f8f8; letter-spacing: -1.408px;
    padding-top: 25px; width: 50%; margin: 0;
  }
  h1.hero-title:hover { color: #ffffff; }
</style></head><body>
<h1 class="hero-title">Build and ship software on a single, collaborative platform</h1>
</body></html>`;

const upstream = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HOST_FIXTURE);
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const fixtureOrigin = 'http://127.0.0.1:' + upstream.address().port;

console.log('');
let grabbed = null;
{
  const session = await bridge.startGrabSession(designPath, undefined, fixtureOrigin, 'consumer');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot),
      null, { timeout: 20000 });
    check('the overlay boots on the proxied fixture', true);

    // The overlay panels dock left and right; the click has to land on the hero
    // in the gap between them, and page.click() refuses outright because the
    // overlay host covers the viewport (it is pointer-events:none, which the
    // actionability check cannot see). A raw mouse click is what a designer does.
    await page.mouse.move(500, 150);
    await page.waitForTimeout(150);
    await page.mouse.click(500, 150);
    // Off the element before reading: the fixture has a :hover rule, and leaving
    // the pointer on it would capture the hover colour as the resting one — the
    // capture would then "match" a token it does not actually use.
    await page.mouse.move(640, 690);
    await page.waitForTimeout(400);

    const selected = await page.evaluate(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return root.querySelector('[data-element-selector]')?.getAttribute('title') || null;
    });
    check('a real click selects the hero headline', selected === 'h1.hero-title', String(selected));

    const typed = await page.evaluate(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      const field = root.querySelector('[data-instruction]');
      if (!field || field.getClientRects().length === 0) return false;
      field.focus();
      return root.activeElement === field;
    });
    check('the instructions field takes focus', typed);
    if (typed) await page.keyboard.type('Keep this one.', { delay: 5 });

    const sendState = await page.evaluate(() => {
      const send = document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-send-batch]');
      return { label: (send?.textContent || '').trim(), disabled: send?.disabled };
    });
    check('typing an instruction arms the send button',
      sendState.disabled === false, `${sendState.label} (disabled=${sendState.disabled})`);

    // Record every label the send button passes through, rather than sampling it
    // once afterwards. The terminal state holds for 1.8s and then resets to idle,
    // so a single later read is a race — and the dispatch keeps working after
    // /grab returns (it used to chain into the /batch-commit that a proxied
    // session withholds), so a console check taken right after the drain passes
    // on timing rather than on behaviour. It reported clean on the exact defect
    // this leg exists to catch.
    await page.evaluate(() => {
      window.__ravenLabels = [];
      setInterval(() => {
        const send = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-send-batch]');
        const label = (send?.textContent || '').trim();
        if (label && window.__ravenLabels[window.__ravenLabels.length - 1] !== label) window.__ravenLabels.push(label);
      }, 40);
      document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-send-batch]').click();
    });

    const drain = await callTool('get_grabbed_elements', { timeout_ms: 8000 });
    check('the overlay\'s own send reaches get_grabbed_elements',
      drain.count === 1 && drain.elements[0]?.target === 'h1.hero-title',
      `count ${drain.count}, target ${drain.elements?.[0]?.target}`);
    grabbed = drain.elements?.[0]?.payload || null;

    // The drain's own instruction to the agent, which is the last thing standing
    // between a successful grab and the agent doing nothing with it. Proxy mode
    // has no batchCommit — the bridge withholds the route that produces one — so
    // an agent told to wait for the marker waits forever and the capture is
    // never kept. start_grab_session says this correctly; the drain used to
    // contradict it one call later.
    check('the drain tells a proxied agent to keep the capture rather than wait for a commit',
      typeof drain.agent_protocol === 'string' &&
      /capture_reference/.test(drain.agent_protocol) &&
      !/wait for the batchCommit/.test(drain.agent_protocol),
      String(drain.agent_protocol).slice(0, 140));

    check('the drained payload carries the overlay\'s computed styles',
      Boolean(grabbed) && grabbed.styles?.['font-weight'] === '510',
      JSON.stringify(grabbed?.styles?.['font-weight']));
    // The overlay does NOT send a flat map — it sends the declaration list its
    // token editor works against. capture_reference's `state_styles` accepts the
    // flat form its own description documents, so the two shapes differ by
    // design and the tool normalizes between them. Assert the shape the overlay
    // really emits, because that is the input the normalizer exists for: if the
    // overlay ever flattened this, the normalizer would still pass its own test
    // while quietly having nothing left to do.
    check('and the interactive state the overlay measured',
      grabbed?.stateStyles?.hover?.declarations?.some((d) => d.property === 'color' && d.value === 'rgb(255, 255, 255)'),
      JSON.stringify(grabbed?.stateStyles?.hover));
    check('and the instruction the designer typed',
      grabbed?.instruction === 'Keep this one.', JSON.stringify(grabbed?.instruction));
    // Let the dispatch reach its terminal state before judging it — the drain
    // returns as soon as /grab lands, which is earlier than the send finishes.
    await page.waitForFunction(() => (window.__ravenLabels || []).some((label) => /captured|Retry|review/.test(label)),
      null, { timeout: 15000 }).catch(() => {});
    const labels = await page.evaluate(() => window.__ravenLabels || []);
    check('a grab from a third-party site settles as captured, not as a failed send',
      labels.includes('1 pattern captured ✓') && !labels.some((label) => /Retry/.test(label)),
      labels.join(' → '));
    check('the overlay logged no console errors while sending', consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(' | ').slice(0, 200));
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

if (!grabbed) {
  console.log('\nFAIL  nothing came back from the grab queue — the rest of the run has no input');
  process.exit(1);
}

// ── Leg C: capture → search → map, THROUGH THE TOOLS ──
//
// This leg used to import reference-store and reference-tokens and call them
// directly, which meant it could print ALL CHECKS PASSED while the seam the
// feature actually ships across — the MCP tool surface — was broken. It was:
// capture_reference declared `state_styles` as record<record<string>> while its
// own description told callers to pass Grab's `stateStyles`, and an MCP schema
// strips unknown keys before the handler runs, so the documented call stored a
// reference with no states and returned success. A module-level check cannot see
// that class of defect by construction. Everything below goes over a real MCP
// client against the stdio server, so schema, handler and serialization are all
// in the path — and every field it passes came out of the overlay in leg B.
console.log('');
const listed = (await client.listTools()).tools.map((tool) => tool.name);
check('all three pattern-library tools are registered on the stdio server',
  ['capture_reference', 'search_references', 'map_reference_to_tokens'].every((name) => listed.includes(name)),
  `${listed.length} tools listed`);

const saved = await callTool('capture_reference', {
  url: TARGET + '/features',
  app: 'GitHub',
  owner: 'third-party',
  selector: grabbed.selector,
  styles: grabbed.styles,
  html: grabbed.html,
  rect: grabbed.rect,
  stateStyles: grabbed.stateStyles,
  note: 'The hero headline weight — 510 is the detail that makes it read tight.',
  tags: ['hero', 'typography']
});
check('capture_reference persisted a record', Boolean(saved.ref_id), `ref_id ${saved.ref_id}, host ${saved.host}`);
check("the grab's own stateStyles survived the tool schema",
  saved.reference?.state_styles?.hover?.color === 'rgb(255, 255, 255)',
  JSON.stringify(saved.reference?.state_styles));

// The thumbnail. test/reference-thumbnail.test.mjs proves the renderer and the
// store, and neither of them can see whether capture_reference actually CALLS
// the renderer — the tool could return a record with no image and every unit
// test stays green. This is the only place the wiring is observed. Chromium is a
// hard requirement of this script (it fails at the top without it), so a null
// image here is a defect and never a missing browser.
const imageFile = store.referenceImagePath(saved.ref_id);
check('capture_reference rendered a thumbnail of what was grabbed',
  saved.image && saved.image.width > 0 && saved.image.height > 0 && saved.image.fidelity === 'offline',
  JSON.stringify(saved.image));
check('the thumbnail is a PNG on disk beside the record',
  existsSync(imageFile) && readFileSync(imageFile).subarray(0, 4).toString('latin1') === '\x89PNG',
  imageFile);

const found = await callTool('search_references', { query: 'hero headline weight' });
check('search_references found it by note', found.total === 1 && found.results[0].reference.ref_id === saved.ref_id,
  found.total ? `score ${found.results[0].score}: ${found.results[0].why}` : 'no results');
// A picking surface needs the picture in the SEARCH result, not only on the
// record it just wrote — this is the field a client renders a grid from. It sits
// underneath the credit on purpose: this corpus holds other people's work, and a
// caller reaching for the picture has to carry the source out with it.
check('search results carry the image path so results can be shown, not just listed',
  found.results[0]?.display?.image_path === imageFile, String(found.results[0]?.display?.image_path));
check('the picture cannot be taken without its credit',
  found.results[0]?.display?.credit?.includes(TARGET + '/features')
    && found.results[0]?.image_path === undefined,
  found.results[0]?.display?.credit);
check('a third-party result carries the ownership notice',
  Boolean(found.notice) && found.notice === found.results[0]?.display?.notice, found.notice);

const reloaded = found.results[0]?.reference;
check('the record survives a fresh read', Boolean(reloaded) && reloaded.note === saved.reference.note);

const mapped = await callTool('map_reference_to_tokens', { ref_id: saved.ref_id, design_file_path: designPath });
console.log('');
for (const b of mapped.bindings) console.log(`  BIND  ${b.property}: ${b.captured} → ${b.token} (${b.verdict}) — ${b.why}`);
for (const g of mapped.gaps) console.log(`  GAP   ${g.property}: ${g.captured} — ${g.why}`);
console.log('');

const bound = Object.fromEntries(mapped.bindings.map(b => [b.property, b.token]));
check('font-size 64px bound to the hero size token', bound['font-size'] === 'type.size.hero', bound['font-size']);
check('color bound to the text token', bound['color'] === 'color.text.primary', bound['color']);
check('font-weight 510 bound to the weight token', bound['font-weight'] === 'type.weight.medium', bound['font-weight']);
check('line-height took the leading token, not the font-size token',
  bound['line-height'] === 'type.leading.hero', bound['line-height']);
check('letter-spacing has no token and is a gap',
  mapped.gaps.some(g => g.property === 'letter-spacing'));
check('coverage is self-consistent with what it reported',
  mapped.coverage.bound === mapped.bindings.length && mapped.coverage.total >= mapped.coverage.bound,
  `${mapped.coverage.bound}/${mapped.coverage.total} = ${mapped.coverage.ratio.toFixed(2)}, ${mapped.bindings.length} bindings`);
check('nothing bound outside its own token family',
  mapped.bindings.every((b) => !/^color\./.test(b.token) || b.property.includes('color')),
  mapped.bindings.filter((b) => /^color\./.test(b.token) && !b.property.includes('color')).map((b) => b.property + '→' + b.token).join(', '));

// There is no delete tool, so this one assertion is module-level by necessity.
check('deleting the record removes it', store.deleteReference(saved.ref_id) && store.getReference(saved.ref_id) === null);
// …and takes the picture with it. This is the takedown path for a third-party
// pattern: a record removed from the corpus must not survive as an image of
// itself sitting next to a gap in the index.
check('deleting the record removes its thumbnail too', !existsSync(imageFile), imageFile);

await client.close();
await server.close();
await rm(fixtureDir, { recursive: true, force: true });
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
