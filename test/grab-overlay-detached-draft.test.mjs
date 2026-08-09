// A draft whose element leaves the DOM WITHOUT a page load must survive
// (Andrew, 2026-08-08: giving feedback on a slide deck in his portfolio —
// "I can only give instructions on one slide at a time, when I navigate to a
// new one I lose the rest"; confirmed same message that the URL does not change,
// so every slide swap is an in-page node swap, not a navigation).
//
// The mechanism, and why it was invisible to every existing guard:
//
//   1. Typing an instruction with no style edits produces a draft whose only
//      content is `instruction`. draftAwaitingReconnect() holds a detached draft
//      ONLY when some styleEdits/tokenIntents entry carries needsRecheck, so an
//      instruction-only draft has nothing making it worth keeping.
//   2. The active draft is not swept — it is rebuilt on each call. The loss
//      happens one step later: selecting an element on the NEXT slide STASHES
//      the previous draft into styleDrafts, and the very next sweep sees a
//      detached target and drops it. That is exactly "one slide at a time".
//   3. The cross-navigation carry (sessionStorage + pagehide) cannot help,
//      because pagehide does not fire on an in-page swap. It only ever covered
//      real page loads.
//
// So the rescue has to be a snapshot taken WHILE THE NODE IS STILL CONNECTED —
// a detached node reports empty computed styles, so the send-ready payload is
// not buildable at the moment the sweep notices. carryDetachedDraft() promotes
// that snapshot into the existing carriedPending path rather than inventing a
// second mechanism.
//
// This needs a real browser and a LOCAL session: the whole thing spans real
// selection through raw mouse events, a real shadow-DOM panel, real element
// detachment, and real sessionStorage. A fake DOM has none of it.
//
// The sessionStorage assertion is the load-bearing one. A rendered "Carried"
// row only proves SOMETHING was kept; reading the persisted payload back and
// finding the typed instruction inside it is what proves the user's actual
// words survived, which is the only thing that matters here.
//
// MEASURED mutant matrix (.claude/dialkit-2026-08-08/detached-draft-mutants.mjs,
// v2): 5 mutants, 4 killed, 0 unexpected survivors, 1 EXPECTED survivor; 1
// control, 0 false-failed. Both tests passed on the first run, which under this
// repo's own rule means nothing until a revert proves them red — so every claim
// below is a measurement, not a reading.
//
//   D2  the sweep drops a detached draft without carrying it (the shipped
//       defect, reproduced exactly)                                 radius 2
//   D3  no snapshot is memoized while the node is still connected   radius 2
//   D4  the carry runs AFTER the drop instead of before             radius 2
//   D5  the instruction blur does not flush                         radius 2
//   D1  the `!draft.target` arm drops without carrying   EXPECTED SURVIVOR
//   C1  CONTROL: the sweep renames its local binding               green
//
// D4 is the one worth reading twice: ORDERING is load-bearing, not stylistic.
// dropStyleDraft() clears the memo unconditionally (every route out of a draft
// comes through it, so a leftover memo would resurrect already-sent work as a
// zombie Carried row), which means the rescue has to read the memo BEFORE the
// drop clears it. Swapping two adjacent lines silently reinstates the bug.
//
// All four kills have radius 2 because both tests share one mechanism — that is
// a fact about the mechanism, not two independent guards. D1 is defensive code
// on a path no constructible input reaches (a draft is built as
// `styleEditTarget || selectedElement`, so it needs a draft made with nothing
// selected); the carry belongs there for symmetry and no test kills it, and
// this file says so rather than implying coverage it does not have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

let chromium = null;
let playwrightError = null;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  playwrightError = err;
}

// Full probe, matching test/grab-overlay-spring-control.test.mjs: bind a
// loopback socket, write and remove a temp dir, launch chromium, and have the
// browser actually REACH the socket. A narrower probe passes in a sandbox that
// permits binding and launching but denies the connection, and the real test's
// environment failure then gets reported as a product defect. Deliberately does
// NOT probe startGrabSession or dist/grab-bridge.js — those are product code,
// and probing them would turn a real bridge defect into a skip.
let chromiumAvailable = false;
let chromiumProbeError = playwrightError;
if (chromium) {
  let probeServer = null;
  try {
    probeServer = createServer((_q, r) => r.end('ok'));
    await new Promise((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    const probeDir = await mkdtemp(path.join(tmpdir(), 'raven-detach-probe-'));
    await writeFile(path.join(probeDir, 'probe.txt'), 'ok', 'utf8');
    await rm(probeDir, { recursive: true, force: true });
    const probeUrl = `http://127.0.0.1:${probeServer.address().port}/`;
    const probe = await chromium.launch({ headless: true });
    try {
      const probePage = await probe.newPage();
      const probeResponse = await probePage.goto(probeUrl);
      if (!probeResponse || !probeResponse.ok()) {
        throw new Error(`probe navigation to ${probeUrl} did not succeed`);
      }
    } finally {
      await probe.close();
    }
    chromiumAvailable = true;
  } catch (err) {
    chromiumProbeError = err;
  } finally {
    if (probeServer && probeServer.listening) {
      await new Promise((resolve) => probeServer.close(resolve));
    }
  }
}

// Lazy, inside the tests: at module scope an unbuilt dist/ would take the whole
// file down as a crash rather than a skip.
let bridge = null;

// Two "slides", one visible at a time, in the horizontal gap between the docked
// panels. Advancing REMOVES the outgoing slide's node, which is what a deck that
// swaps rather than hides actually does — and is the only version of a slide
// change that reproduces this at all: a deck using display:none leaves the node
// connected, the sweep never fires, and the drafts were never at risk.
const VIEWPORT = { width: 1280, height: 700 };
const FIXTURE_BODY = `<style>
  body { margin: 0; font: 16px system-ui; }
  .slide { position: absolute; left: 440px; top: 120px; width: 400px; }
  .headline { padding: 28px; background: #eef; text-align: center; }
</style>
<div id="slide1" class="slide"><div id="a" class="headline">Slide one headline</div></div>
<div id="slide2" class="slide" hidden><div id="b" class="headline">Slide two headline</div></div>`;

async function withLocalOverlay(fn) {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-detach-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>deck host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto('http://127.0.0.1:' + fixture.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot),
      null,
      { timeout: 15000 }
    );
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => fixture.close(resolve));
  }
}

// The overlay host covers the viewport, so page.click() fails actionability;
// raw mouse events are what a designer's pointer actually produces.
async function selectElement(page, selector) {
  const at = await page.evaluate((sel) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    return root && root.querySelector('.raven-grab-label')?.style.display === 'block';
  }, null, { timeout: 5000 });
}

// Type into the Instructions box the way a person does — focus it, fire real
// input, then move focus away so a genuine focusout fires. The focusout is what
// flushes the snapshot synchronously; without it the persist is debounced 250ms
// and a fast slide advance beats it.
async function typeInstruction(page, text) {
  await page.evaluate((value) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const field = root.querySelector('[data-instruction]');
    if (!field) throw new Error('the Instructions field is not rendered');
    field.focus();
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.blur();
  }, text);
}

const readState = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  return {
    carriedRows: root.querySelectorAll('[data-remove-change^="carried:"]').length,
    draftRows: root.querySelectorAll('[data-remove-change^="draft-"]').length,
    stored: window.sessionStorage.getItem('raven-grab-pending-v1') || '',
    instructionsFieldPresent: Boolean(root.querySelector('[data-instruction]'))
  };
})()`;

test('an instruction survives its slide being swapped out from under it', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay detached-draft test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await typeInstruction(page, 'Make this headline smaller and left-aligned');

    // Precondition, asserted rather than assumed: the instruction really did
    // reach a snapshot while #a was still connected. Without this a later pass
    // could come from the mechanism never having had anything to lose.
    const before = await page.evaluate(readState);
    assert.ok(
      before.stored.includes('Make this headline smaller'),
      'the instruction is snapshotted while its element is still connected'
    );

    // The slide advance: slide one's node is REMOVED, slide two revealed.
    await page.evaluate(() => {
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
    });

    // Selecting on the new slide is what stashes the previous draft and runs
    // the sweep. This is the exact step at which the instruction used to vanish.
    await selectElement(page, '#b');

    const after = await page.evaluate(readState);
    assert.equal(after.carriedRows, 1, 'the orphaned instruction is kept as a Carried row, not swept');
    assert.ok(
      after.stored.includes('Make this headline smaller'),
      'and the typed words themselves survive in the persisted payload'
    );
  });
});

test('a second slide\'s instruction accumulates alongside the first', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay detached-draft test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await typeInstruction(page, 'First slide note');

    await page.evaluate(() => {
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
    });

    await selectElement(page, '#b');
    await typeInstruction(page, 'Second slide note');

    const state = await page.evaluate(readState);
    // The first is carried (its node is gone), the second is still a live draft
    // on a connected node — one of each, which is the whole point: reviewing a
    // deck accumulates feedback instead of forcing a send per slide.
    assert.equal(state.carriedRows, 1, 'the first slide\'s note is carried');
    assert.ok(state.draftRows >= 1, 'the second slide\'s note is still a live, editable draft');
    assert.ok(state.stored.includes('First slide note'), 'the first note is still persisted');
    assert.ok(state.stored.includes('Second slide note'), 'and the second joined it rather than replacing it');
  });
});
