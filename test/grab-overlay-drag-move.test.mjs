// On-canvas element drag (Andrew, /goal 2026-08-07: "Dragging elements on the
// page itself"; round 2 same day: "it was really hard to grab and drag things"
// — the selection-prerequisite arming was removed, so a press now SELECTS at
// slop-crossing and drags in one gesture). Dragging an element on the canvas
// drives the Layers tab's own reorderLayer/reparentLayer draft machinery — the
// optimistic DOM preview, the pending-tray row, the Remove revert, and the
// agent protocol are all the one existing rule, and this suite exercises them
// through the gesture.
//
// This needs a real browser: the mechanism spans pointer-event capture on the
// document, document.elementsFromPoint hit testing, getBoundingClientRect
// midpoint arithmetic, and an optimistic insertBefore whose whole point is
// observable reflow. None of that exists in a fake DOM.
//
// The harness boots a LOCAL session and embeds session.script_tag in its own
// fixture page. A THIRD-PARTY proxied session is capture-only (authoring:
// "withheld") and the gesture never arms there — that refusal is under test
// against a stubbed non-loopback upstream; and since capture-only narrowed to
// third-party origins (2026-08-07), the granted direction — a proxy of the
// designer's OWN loopback dev server, Andrew's actual preview flow — has its
// own test proving the gesture arms through the proxy.
//
// Same-parent drop arithmetic, derived once and pinned here: reorderLayer(from,
// to) removes fromNode and splices it at toNode's ORIGINAL index. Counting the
// non-dragged siblings whose layout-axis midpoint is above the pointer gives
// `ins`, and children[ins] is exactly the toNode that lands the element at
// removed-array position ins — for [a,b,c,d] dragging a past b and c's
// midpoints: ins=2, toNode=c, removed [b,c,d] splice at 2 → [b,c,a,d].
// ins === indexOf(fromNode) is the no-op.
//
// Mutation matrix — every radius below is MEASURED (each mutant a string edit
// on a copy served through RAVEN_GRAB_ASSET_PATH, load-checked before its run;
// harness dedupes node --test's summary-repeat ✖ lines before counting).
// The matrix has now falsified header claims in THREE separate runs, which is
// it earning its keep — do not trust an unmeasured row. And a find-string
// mutant goes STALE the moment its target line is edited (the suppression
// mutant aborted in round 3 because a fix rewrote its line; the round-2
// select-on-press rewrite stale'd every pointerdown anchor), so re-measure the
// WHOLE matrix after any fix round, never carry a radius forward. Tests 8-14
// and mutants D8-D15 come from a Kimi K3 adverse pass (2026-08-07) that found
// the teardown paths and three plan branches untested. Mutants D16-D20 come
// from the round-2 select-on-press rewrite (2026-08-07): drag-element choice,
// selection promotion, the grabbing-cursor affordance, and the html/body root
// guard. Current radii are the 2026-08-07 round-2 whole-matrix run (20/20
// killed, baseline 21 green):
//   D1  - delete the pointerdown arming (canvasDrag never set)
//       -> SEVENTEEN red: every test that actually drags, the loopback-proxy,
//          select-on-press, and cursor tests included. The below-threshold,
//          sub-slop-unselected, capture-only-proxy, and root-guard tests
//          SURVIVE because they assert the same nothing-happens the mutant
//          produces — and the Escape test only reddens because of its explicit
//          mid-drag precondition (first draft lacked it and stayed green
//          here). A wide radius here is the entry point being shared, not
//          seventeen independent guards.
//   D2  - weaken the 6px slop to zero (every press becomes a drag)
//       -> TWO red: "a press below the drag threshold stays a click" and the
//          round-2 "a sub-slop press on an unselected element moves nothing"
//          — both press in the dense fixture where a sub-slop wiggle crosses
//          a sibling midpoint. The first draft wiggled in-place inside a 48px
//          row, where the no-op plan makes zero slop observationally
//          invisible; this mutant survived all 7 tests then.
//   D3  - never call positionDropIndicator during pointermove
//       -> EIGHT red: reorder, Escape, loopback-proxy, lost-pointerup,
//          foreign-pointer, pointercancel, second-pointerdown, and the
//          select-on-press reorder — every test that asserts the indicator
//          mid-drag as its active-drag precondition. Shared observable,
//          shared radius — not eight guards.
//   D4  - make Escape apply the drag instead of abandoning it
//       -> exactly "Escape abandons an active drag" red
//   D5  - never set suppressCanvasClick (neutralize the conditional arm)
//       -> TWO red: "the trailing click after a drop does not re-select" and
//          "press-dragging B while A is selected drags and selects B" — the
//          round-2 test asserts the post-drop selection stays on B, which the
//          unsuppressed trailing click would move.
//   D6  - return null from the cross-parent branch of canvasDropPlanAt
//       -> THREE red: both reparent tests (leaf sibling and INTO-container)
//          plus "pressing a child of the selected container drags the
//          container" — its drop is cross-parent too. Shared killed line.
//   D7  - drop the captureOnly guard in pointerdown
//       -> exactly "a proxied capture-only session never arms the gesture" red
//   D8  - delete the pointermove (event.buttons & 1) abort
//       -> exactly "a lost pointerup abandons the drag" red
//   D9  - make pointercancel a no-op
//       -> exactly "pointercancel abandons the drag" red
//   D10 - drop the pointerId match in pointermove
//       -> exactly "a foreign pointer's events do not disturb" red
//   D11 - reparent only via hitNode.parentId (delete the container-hit branch)
//       -> exactly "dropping over a container's own padding reparents INTO
//          it" red
//   D12 - make canvasLayoutAxis always return "y"
//       -> exactly "a horizontal flex row reorders along the x axis" red —
//          that test's order change IS the axis: on the wrong axis the plan
//          is a no-op, so a passing reorder can only come from measuring x.
//   D13 - drop the stale-drag clear at the top of pointerdown
//       -> exactly "a second pointerdown mid-drag abandons the stale drag" red
//   D14 - arm suppressCanvasClick unconditionally (ignore expectTrailingClick)
//       -> exactly "pointercancel ... without arming the click suppression"
//          red — the cancel path is where the conditional matters, because no
//          click ever follows a cancelled pointer to consume the flag.
//   D15 - turn the no-op check from === into <= (the natural typo)
//       -> exactly "an upward drag reorders with the same splice arithmetic"
//          red: <= reads every upward target as a no-op while downward still
//          works, which is why the upward test exists.
//   D16 - drag element always = selection (never the press target)
//       -> TWO red: both select-on-press tests — an unselected press drags
//          nothing real, and pressing B while A is selected drags A.
//   D17 - delete the slop-crossing selection promotion
//       -> TWO red (tests 16+17) — but ONLY after those tests were rewritten.
//          Run 1 measured this mutant SURVIVING all 21 tests: the first draft
//          asserted the canvas labelText, which HOVER paints on the element as
//          the mouse travels to the press point, and which the drop path
//          repaints from drag.element directly — neither reads the selection,
//          so the label is the same with the promotion deleted. The
//          selection-derived observable is the panel Element chip
//          [data-element-selector] (rendered only when a selection exists,
//          title = its selector); readState now reads that. Assume a new test
//          does not work until a mutant proves it red.
//   D18 - never inject the grabbing-cursor style
//       -> exactly "an active drag shows a page-wide grabbing cursor" red
//   D19 - never remove the grabbing-cursor style on drop
//       -> exactly the same test red — it asserts both directions.
//   D20 - drop the html/body root guard in pointerdown
//       -> exactly "a press on the page background arms nothing" red
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  test('playwright available for overlay drag-move test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');

// Four reorderable siblings in #list plus a second container #other for the
// reparent case. The 150px bottom padding on #list is load-bearing: the
// trailing-click test drops there, so that after the optimistic move the
// pointer rests over the CONTAINER, not the moved element — the only geometry
// in which a failed click suppression selects something visibly different.
// Everything sits in the horizontal gap between the docked panels at x≈640.
const FIXTURE_BODY = `<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  #list { width: 280px; margin: 0 auto; padding: 24px 0 150px; }
  #list > div { height: 48px; margin-bottom: 6px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; color: #1c2540; background: #dfe7ff; }
  #other { width: 280px; margin: 0 auto; padding: 10px; border-radius: 10px;
    background: #eef7ee; }
  #other > div { height: 40px; margin-bottom: 6px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    color: #163a1f; background: #cdeacd; }
  #dense { width: 280px; margin: 0 auto; }
  #dense > div { height: 6px; background: #f3d9d9; }
  #dense > div:nth-child(2) { background: #d9e5f3; }
  #row { display: flex; flex-direction: row; width: 280px; margin: 10px auto 0; }
  #row > div { width: 60px; height: 24px; background: #e8e0f5; }
  #row > div:nth-child(2) { background: #f5ecd8; }
</style>
<div id="list">
  <div id="a">Alpha</div>
  <div id="b">Beta</div>
  <div id="c">Gamma</div>
  <div id="d">Delta</div>
</div>
<div id="other">
  <div id="x">Xul</div>
  <div id="y">Yar</div>
</div>
<div id="dense">
  <div id="m1"></div>
  <div id="m2"></div>
  <div id="m3"></div>
</div>
<div id="row">
  <div id="r1"></div>
  <div id="r2"></div>
  <div id="r3"></div>
</div>`;

const VIEWPORT = { width: 1280, height: 640 };

async function withLocalOverlay(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-drag-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>drag host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto('http://127.0.0.1:' + fixture.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => fixture.close(resolve));
  }
}

// A capture-only session needs a genuinely NON-loopback upstream: capture-only
// narrowed to third-party origins on 2026-08-07 (a proxy of the designer's own
// loopback dev server keeps the full authoring surface, drag included), so the
// old loopback fixture here sat on the one origin where the old rule and the
// new rule disagree — keeping it would have flipped this suite's capture-only
// test rather than preserved its trigger. The upstream never exists: the
// bridge's outbound fetch is stubbed in this process, and the browser only
// ever talks to the bridge.
async function withProxiedOverlay(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-drag-proxy-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    return new Response(`<!doctype html><html><head><title>drag proxy host</title></head><body>${FIXTURE_BODY}</body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  const session = await bridge.startGrabSession(designPath, undefined, 'https://fixture.test', 'consumer');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    globalThis.fetch = originalFetch;
    await bridge.stopGrabSession();
  }
}

// Andrew's actual preview flow: his OWN dev server proxied through the bridge.
// This is the session shape where drag silently died while every local test
// stayed green — the loopback grant is what fixed it, so the granted direction
// runs against a REAL upstream on the same wire path a designer uses.
async function withLoopbackProxiedOverlay(fn) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>drag proxy host</title></head><body>${FIXTURE_BODY}</body></html>`);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-drag-loopback-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath, undefined, 'http://127.0.0.1:' + upstream.address().port, 'consumer');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

function skipIfNoBrowser(t, err) {
  if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
    t.skip(`browser unavailable for overlay drag-move (${err.message})`);
    return true;
  }
  return false;
}

const readState = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  const indicator = root.querySelector('.raven-grab-drop-indicator');
  const label = root.querySelector('.raven-grab-label');
  const draftButtons = Array.from(root.querySelectorAll('[data-remove-change^="draft-"]'));
  // The panel's Element chip is the SELECTION-derived observable. The canvas
  // label is not: hover paints it before the press (the mouse travels over the
  // element on its way in) and the drop path repaints it from drag.element
  // directly, so a label assertion passes with the promotion deleted —
  // measured: the promotion-deleted mutant survived exactly that assertion.
  const chip = root.querySelector('[data-element-selector]');
  return {
    listOrder: Array.from(document.querySelectorAll('#list > div')).map((el) => el.id),
    otherOrder: Array.from(document.querySelectorAll('#other > div')).map((el) => el.id),
    denseOrder: Array.from(document.querySelectorAll('#dense > div')).map((el) => el.id),
    rowOrder: Array.from(document.querySelectorAll('#row > div')).map((el) => el.id),
    indicatorVisible: indicator ? indicator.style.display === 'block' : null,
    labelText: label ? label.textContent : '',
    elementChip: chip ? chip.getAttribute('title') : null,
    draftCount: draftButtons.length,
    panelText: root.textContent
  };
})()`;

async function centerOf(page, selector) {
  return page.evaluate((sel) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect: { top: rect.top, bottom: rect.bottom, left: rect.left } };
  }, selector);
}

// The overlay host covers the viewport, so page.click() fails actionability;
// raw mouse events are what a designer's pointer actually produces.
async function selectElement(page, selector) {
  const at = await centerOf(page, selector);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    return root && root.querySelector('.raven-grab-label')?.style.display === 'block';
  }, null, { timeout: 5000 });
}

async function dragTo(page, from, toX, toY, { release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several intermediate moves: the first crosses the 6px slop, the rest give
  // the plan/indicator code real pointermove traffic on the way to the target.
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.move(toX, toY, { steps: 6 });
  if (release) await page.mouse.up();
}

test('dragging the selected element past two siblings reorders optimistically and queues a Move draft', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      // Between #c's midpoint and #d's midpoint: ins=2 → [b,c,a,d].
      const dropY = (c.y + d.y) / 2;
      await dragTo(page, a, a.x, dropY, { release: false });
      const midDrag = await page.evaluate(readState);
      await page.mouse.up();
      const after = await page.evaluate(readState);
      return { midDrag, after };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, true, 'the drop indicator shows during an active drag');
  assert.deepEqual(result.after.listOrder, ['b', 'c', 'a', 'd'], 'the optimistic preview reordered the live DOM');
  assert.equal(result.after.draftCount, 1, 'exactly one pending move draft queued');
  assert.match(result.after.panelText, /Move/, 'the tray row names the change a Move');
  assert.equal(result.after.indicatorVisible, false, 'the indicator clears on drop');
});

// The slop's protection is only OBSERVABLE in dense layouts. The first draft of
// this test wiggled 3px inside a 48px-tall element, and the zero-slop mutant
// survived it: in non-overlapping block flow, any pointer that stays inside the
// dragged element yields ins === fromIndex, the plan is "none", and the release
// changes nothing whether or not the drag armed — the mutant was behaviorally
// invisible. In #dense the rows are 6px tall, so a sub-slop 5px wiggle from
// near #m1's bottom edge crosses #m2's midpoint (1px in from m1.bottom, +5px
// down = m2.top + 4, past m2's midpoint at m2.top + 3): under zero slop that
// press-and-wiggle applies a REAL reorder ([m2, m1, m3] plus a draft), which is
// exactly the accidental move the 6px threshold exists to prevent.
test('a press below the drag threshold stays a click — no draft, no move', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#m1');
      const m1 = await centerOf(page, '#m1');
      const pressY = m1.rect.bottom - 1;
      await page.mouse.move(m1.x, pressY);
      await page.mouse.down();
      await page.mouse.move(m1.x, pressY + 5); // 5px < the 6px slop, but past #m2's midpoint
      await page.mouse.up();
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.denseOrder, ['m1', 'm2', 'm3'], 'the DOM order never changed');
  assert.equal(result.draftCount, 0, 'no draft was queued');
});

test('Escape abandons an active drag without applying it', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2, { release: false });
      const midDrag = await page.evaluate(readState);
      await page.keyboard.press('Escape');
      const afterEscape = await page.evaluate(readState);
      await page.mouse.up();
      const afterRelease = await page.evaluate(readState);
      return { midDrag, afterEscape, afterRelease };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  // Precondition, not decoration: without it this test passes when the gesture
  // never arms at all — "nothing to abandon" and "abandoned" are byte-identical
  // in every post-Escape observable. The first mutant run proved it: the
  // never-arm mutant left this test green.
  assert.equal(result.midDrag.indicatorVisible, true, 'a drag was actually active before Escape');
  assert.equal(result.afterEscape.indicatorVisible, false, 'Escape clears the indicator');
  assert.deepEqual(result.afterRelease.listOrder, ['a', 'b', 'c', 'd'], 'the DOM order never changed');
  assert.equal(result.afterRelease.draftCount, 0, 'no draft was queued');
});

test('dragging into another container reparents optimistically and queues a Reparent draft', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const y = await centerOf(page, '#y');
      // Past #y's midpoint inside #other: toIndex=2 → appended after #y.
      await dragTo(page, a, y.x, y.y + 12);
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.listOrder, ['b', 'c', 'd'], 'the element left its original parent');
  assert.deepEqual(result.otherOrder, ['x', 'y', 'a'], 'the element joined the destination container at the pointer position');
  assert.equal(result.draftCount, 1, 'exactly one pending move draft queued');
  assert.match(result.panelText, /Reparent/, 'the tray row names the change a Reparent');
});

test('removing the queued move reverts the optimistic DOM order', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2);
      const moved = await page.evaluate(readState);
      await page.evaluate(`(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        root.querySelector('[data-remove-change^="draft-"]').click();
      })()`);
      const reverted = await page.evaluate(readState);
      return { moved, reverted };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.moved.listOrder, ['b', 'c', 'a', 'd'], 'the drag moved the element first (precondition)');
  assert.deepEqual(result.reverted.listOrder, ['a', 'b', 'c', 'd'], 'Remove put the live DOM back');
  assert.equal(result.reverted.draftCount, 0, 'the draft is gone');
});

test('the trailing click after a drop does not re-select whatever ends up under the pointer', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const d = await centerOf(page, '#d');
      // Drop in #list's bottom padding, past every sibling midpoint: ins=3 →
      // [b,c,d,a]. After reflow the moved element's rect ends ABOVE this point,
      // so the pointer rests on the container — a failed click suppression
      // selects #list, which is visibly a different label.
      const dropY = d.rect.bottom + 80;
      await dragTo(page, a, a.x, dropY);
      const atDrop = await page.evaluate(readState);
      await page.waitForTimeout(200);
      const later = await page.evaluate(readState);
      return { atDrop, later };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.later.listOrder, ['b', 'c', 'd', 'a'], 'the drop landed at the end of the list');
  assert.equal(result.later.labelText, result.atDrop.labelText, 'the selection label never changed after the drop');
  assert.doesNotMatch(result.later.labelText, /list/, 'the container was not selected by the trailing click');
});

test('a proxied capture-only session never arms the gesture', async (t) => {
  let result;
  try {
    result = await withProxiedOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2, { release: false });
      const midDrag = await page.evaluate(readState);
      await page.mouse.up();
      const after = await page.evaluate(readState);
      return { midDrag, after };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, false, 'no indicator in a capture-only session');
  assert.deepEqual(result.after.listOrder, ['a', 'b', 'c', 'd'], 'the DOM order never changed');
  assert.equal(result.after.draftCount, 0, 'no draft was queued');
});

test('a loopback proxy arms the gesture like a local session', async (t) => {
  // The granted half of the capture-only narrowing, at the browser level: the
  // bridge tests pin the flag's absence, but the reported defect was drag
  // itself dying in the proxied-preview flow, so the drag has to be seen
  // working through the proxy — indicator up mid-drag, reorder applied, draft
  // queued, exactly the local-session observables.
  let result;
  try {
    result = await withLoopbackProxiedOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2, { release: false });
      const midDrag = await page.evaluate(readState);
      await page.mouse.up();
      const after = await page.evaluate(readState);
      return { midDrag, after };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, true, 'the indicator shows mid-drag through the proxy');
  assert.deepEqual(result.after.listOrder, ['b', 'c', 'a', 'd'], 'the reorder applied through the proxy');
  assert.equal(result.after.draftCount, 1, 'exactly one pending move draft queued');
});

// ---------------------------------------------------------------------------
// Tests 8–14 came out of the Kimi K3 adverse pass (2026-08-07). 8–10 cover
// shipped plan branches the first seven never exercised (upward splice
// direction, the INTO-container reparent branch, the flex-row x axis) — each
// had a surviving mutant before its test existed. 11–14 cover the teardown
// fixes the same pass forced: a lost pointerup wedged the page viewport-wide
// (no buttons check), pointercancel armed a click suppression no click would
// ever consume, a second pointerdown stranded the indicator, and the
// pointermove pointerId guard had no test at all. The synthetic events use
// pointerId 1 because that is Chromium's mouse pointer id; every test that
// relies on the match asserts a precondition that fails loudly if it drifts.
// ---------------------------------------------------------------------------

test('an upward drag reorders with the same splice arithmetic', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#d');
      const d = await centerOf(page, '#d');
      const a = await centerOf(page, '#a');
      // Above #a's midpoint: ins=0, fromIndex=3 → toNode=children[0] → [d,a,b,c].
      await dragTo(page, d, d.x, a.y - 10);
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.listOrder, ['d', 'a', 'b', 'c'], 'the upward drag landed above every sibling');
  assert.equal(result.draftCount, 1, 'exactly one pending move draft queued');
});

test('dropping over a container’s own padding reparents INTO it', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const x = await centerOf(page, '#x');
      // 5px above #x's top edge is inside #other's 10px top padding: the hit is
      // the CONTAINER itself, which is the childful INTO branch — the leaf
      // branch (drop beside #y) is the other reparent test. toIndex=0 → first.
      await dragTo(page, a, x.x, x.rect.top - 5);
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.listOrder, ['b', 'c', 'd'], 'the element left its original parent');
  assert.deepEqual(result.otherOrder, ['a', 'x', 'y'], 'the container hit inserted at the pointer position inside it');
  assert.match(result.panelText, /Reparent/, 'the tray row names the change a Reparent');
});

test('a horizontal flex row reorders along the x axis', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#r1');
      const r1 = await centerOf(page, '#r1');
      const r2 = await centerOf(page, '#r2');
      // Past #r2's x midpoint at the row's own y: ins=1 → [r2,r1,r3]. On the
      // wrong axis this is a no-op — every sibling shares the pointer's y
      // midpoint, ins stays 0 === fromIndex — so the order change is the axis.
      await dragTo(page, r1, r2.x + 10, r1.y);
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.rowOrder, ['r2', 'r1', 'r3'], 'the horizontal drag reordered the flex row');
  assert.equal(result.draftCount, 1, 'exactly one pending move draft queued');
});

test('a lost pointerup abandons the drag instead of wedging the page', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      const dropY = (c.y + d.y) / 2;
      await dragTo(page, a, a.x, dropY, { release: false });
      const midDrag = await page.evaluate(readState);
      // The release the document never sees: a pointermove arriving with the
      // button already up (released outside the window, or over an iframe).
      await page.evaluate(([px, py]) => {
        document.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 1, buttons: 0, clientX: px, clientY: py, bubbles: true, cancelable: true
        }));
      }, [a.x, dropY]);
      const afterLoss = await page.evaluate(readState);
      // The real button is still physically down; releasing it must not apply
      // the abandoned plan, and the page must not be stuck in drag mode.
      await page.mouse.up();
      const afterRelease = await page.evaluate(readState);
      return { midDrag, afterLoss, afterRelease };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, true, 'a drag was actually active before the loss (precondition)');
  assert.equal(result.afterLoss.indicatorVisible, false, 'the buttons-up move abandoned the drag');
  assert.deepEqual(result.afterRelease.listOrder, ['a', 'b', 'c', 'd'], 'the abandoned plan was never applied');
  assert.equal(result.afterRelease.draftCount, 0, 'no draft was queued');
});

test('a foreign pointer’s events do not disturb an active drag', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      const dropY = (c.y + d.y) / 2;
      await dragTo(page, a, a.x, dropY, { release: false });
      // A second pointer (pen, second mouse) with its button up: without the
      // pointerId guard the buttons check reads this as OUR release and kills
      // the drag mid-flight.
      await page.evaluate(([px, py]) => {
        document.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 999, buttons: 0, clientX: px, clientY: py, bubbles: true, cancelable: true
        }));
      }, [a.x, dropY]);
      const afterForeign = await page.evaluate(readState);
      await page.mouse.up();
      const afterDrop = await page.evaluate(readState);
      return { afterForeign, afterDrop };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.afterForeign.indicatorVisible, true, 'the foreign pointer was ignored — the drag stayed live');
  assert.deepEqual(result.afterDrop.listOrder, ['b', 'c', 'a', 'd'], 'the real release still applied the drop');
});

test('pointercancel abandons the drag without arming the click suppression', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      await dragTo(page, a, c.x, c.y, { release: false });
      const midDrag = await page.evaluate(readState);
      await page.evaluate(() => {
        document.dispatchEvent(new PointerEvent('pointercancel', {
          pointerId: 1, bubbles: true, cancelable: true
        }));
      });
      const afterCancel = await page.evaluate(readState);
      // The spec fires no click after a real pointercancel, so the suppression
      // has nothing to eat — armed anyway, it would swallow the next unrelated
      // click. The physical release here DOES produce one (the browser never
      // saw our synthetic cancel), and it must select #c normally.
      await page.mouse.up();
      await page.waitForTimeout(100);
      const afterRelease = await page.evaluate(readState);
      return { midDrag, afterCancel, afterRelease };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, true, 'a drag was actually active before the cancel (precondition)');
  assert.equal(result.afterCancel.indicatorVisible, false, 'pointercancel abandoned the drag');
  assert.deepEqual(result.afterRelease.listOrder, ['a', 'b', 'c', 'd'], 'the abandoned plan was never applied');
  assert.equal(result.afterRelease.draftCount, 0, 'no draft was queued');
  assert.notEqual(result.afterRelease.labelText, result.midDrag.labelText, 'the follow-up click was NOT suppressed — selection moved to the element under the pointer');
});

test('a second pointerdown mid-drag abandons the stale drag cleanly', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2, { release: false });
      const midDrag = await page.evaluate(readState);
      // A second pointer pressing mid-drag: the first drag's state must not be
      // silently overwritten with its indicator stranded visible.
      await page.evaluate(() => {
        document.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 7, button: 0, buttons: 1, clientX: 20, clientY: 20, bubbles: true, cancelable: true
        }));
      });
      const afterSecond = await page.evaluate(readState);
      await page.mouse.up();
      const afterRelease = await page.evaluate(readState);
      return { midDrag, afterSecond, afterRelease };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, true, 'a drag was actually active before the second press (precondition)');
  assert.equal(result.afterSecond.indicatorVisible, false, 'the stale drag was torn down, indicator included');
  assert.deepEqual(result.afterRelease.listOrder, ['a', 'b', 'c', 'd'], 'the discarded plan was never applied');
  assert.equal(result.afterRelease.draftCount, 0, 'no draft was queued');
});

// ---------------------------------------------------------------------------
// Tests 16–21: select-on-press (round 2, Andrew 2026-08-07: "really hard to
// grab and drag things"). The old pointerdown required the pressed element to
// ALREADY be selected, so the natural press-and-pull did nothing until a
// separate click had landed — every test above starts with selectElement() and
// so never noticed. Any canvas press arms a candidate now; selection promotes
// at slop-crossing; a press on/inside the current selection still drags the
// SELECTED element (sticky container); html/body presses arm nothing; and an
// active drag shows a page-wide grabbing cursor.
// ---------------------------------------------------------------------------

test('press-dragging an unselected element arms, selects it, and reorders', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      // Deliberately NO selectElement first — the press is the whole gesture.
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2, { release: false });
      const midDrag = await page.evaluate(readState);
      await page.mouse.up();
      const after = await page.evaluate(readState);
      return { midDrag, after };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, true, 'the drag armed with nothing selected beforehand');
  assert.match(String(result.midDrag.elementChip), /#a\b/,
    'selection promoted to the pressed element at slop-crossing — the panel Element chip must show it ' +
    '(the canvas label cannot discriminate: hover paints it before the press)');
  assert.deepEqual(result.after.listOrder, ['b', 'c', 'a', 'd'], 'the reorder applied');
  assert.equal(result.after.draftCount, 1, 'exactly one pending move draft queued');
});

test('press-dragging B while A is selected drags and selects B', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const b = await centerOf(page, '#b');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      // #b is neither the selection nor inside it, so the press re-targets.
      // Non-dragged siblings [a,c,d] with midpoints above (c.y+d.y)/2: a and c
      // → ins=2, removed [a,c,d] splice at 2 → [a,c,b,d].
      await dragTo(page, b, b.x, (c.y + d.y) / 2);
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.listOrder, ['a', 'c', 'b', 'd'], 'the PRESSED element moved, not the previously selected one');
  assert.match(String(result.elementChip), /#b\b/,
    'selection followed the drag to B — the panel Element chip must read #b, not the stale #a');
  assert.equal(result.draftCount, 1, 'exactly one pending move draft queued');
});

test('pressing a child of the selected container drags the container', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      // Select #list by clicking its bottom padding (no child under the pointer).
      const d = await centerOf(page, '#d');
      await page.mouse.click(d.x, d.rect.bottom + 80);
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
        return root && /#list\b/.test(root.querySelector('.raven-grab-label')?.textContent || '');
      }, null, { timeout: 5000 });
      // Press #b — INSIDE the selection. Sticky rule: the container drags, so a
      // child press moves the frame the designer chose, not the child.
      const b = await centerOf(page, '#b');
      const x = await centerOf(page, '#x');
      await dragTo(page, b, x.x, x.y + 8);
      return page.evaluate(`(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        return {
          listParent: document.querySelector('#list').parentElement.id || document.querySelector('#list').parentElement.tagName,
          listOrder: Array.from(document.querySelectorAll('#list > div')).map((el) => el.id),
          draftCount: root.querySelectorAll('[data-remove-change^="draft-"]').length,
          panelText: root.textContent
        };
      })()`);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.listParent, 'other', 'the CONTAINER moved (reparented beside the drop target), not the pressed child');
  assert.deepEqual(result.listOrder, ['a', 'b', 'c', 'd'], 'the container’s own children never reordered');
  assert.equal(result.draftCount, 1, 'exactly one pending move draft queued');
  assert.match(result.panelText, /Reparent/, 'the tray row names the change a Reparent');
});

// Guards the promote-at-SLOP-crossing boundary: a mutant that promotes and
// activates at pointerdown turns this sub-slop wiggle into a real reorder
// (same dense-fixture geometry as the selected-case slop test above — in #list
// a sub-slop wiggle is a no-op plan whether or not the drag armed).
test('a sub-slop press on an unselected element moves nothing', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      const m1 = await centerOf(page, '#m1');
      const pressY = m1.rect.bottom - 1;
      await page.mouse.move(m1.x, pressY);
      await page.mouse.down();
      await page.mouse.move(m1.x, pressY + 5); // < 6px slop, past #m2's midpoint
      await page.mouse.up();
      return page.evaluate(readState);
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.deepEqual(result.denseOrder, ['m1', 'm2', 'm3'], 'the DOM order never changed');
  assert.equal(result.draftCount, 0, 'no draft was queued');
});

test('a press on the page background arms nothing and raises no notice', async (t) => {
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      // Find a point where the pointer genuinely lands on bare <body>/<html> —
      // the docked panels own the viewport edges (a first draft pressed at
      // x=100 and drag-reordered a Layers row), and the fixture columns own
      // the center, so the safe region has to be measured, not guessed.
      const pt = await page.evaluate(() => {
        for (let y = 80; y < 620; y += 20) {
          for (let x = 300; x < 1000; x += 20) {
            const el = document.elementFromPoint(x, y);
            if (el === document.body || el === document.documentElement) return { x, y };
          }
        }
        return null;
      });
      if (!pt) throw new Error('precondition: no bare body/html point found in the viewport');
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      await page.mouse.move(pt.x, pt.y + 15);
      await page.mouse.move(pt.x, pt.y + 45, { steps: 3 });
      const midDrag = await page.evaluate(readState);
      await page.mouse.up();
      const after = await page.evaluate(readState);
      return { midDrag, after };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.indicatorVisible, false, 'no drag armed on a body press');
  assert.doesNotMatch(result.after.panelText, /Cannot move the page root/, 'no page-root notice spammed the panel');
  assert.deepEqual(result.after.listOrder, ['a', 'b', 'c', 'd'], 'nothing moved');
  assert.equal(result.after.draftCount, 0, 'no draft was queued');
});

test('an active drag shows a page-wide grabbing cursor and removes it on drop', async (t) => {
  const readCursor = `(() => ({
    styleTag: Boolean(document.querySelector('style[data-raven-grab-drag-cursor]')),
    cursor: getComputedStyle(document.querySelector('#c')).cursor
  }))()`;
  let result;
  try {
    result = await withLocalOverlay(async (page) => {
      await selectElement(page, '#a');
      const a = await centerOf(page, '#a');
      const c = await centerOf(page, '#c');
      const d = await centerOf(page, '#d');
      await dragTo(page, a, a.x, (c.y + d.y) / 2, { release: false });
      const midDrag = await page.evaluate(readCursor);
      await page.mouse.up();
      const after = await page.evaluate(readCursor);
      return { midDrag, after };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.midDrag.styleTag, true, 'the cursor style is injected mid-drag');
  assert.equal(result.midDrag.cursor, 'grabbing', 'page elements show the grabbing cursor mid-drag');
  assert.equal(result.after.styleTag, false, 'the cursor style is removed on drop');
  assert.notEqual(result.after.cursor, 'grabbing', 'the page cursor is back to its own rules');
});
