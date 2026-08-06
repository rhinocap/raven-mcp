// A panel rebuild must not throw away where the user was scrolled to.
//
// Reported by Andrew 2026-08-06: "as I have been using the panels sometimes I
// click in to change a value and the panel resets scrolling back to the top
// instead of just letting me use the input to change whatever I am trying to
// change." renderPanel() rewrites panel.innerHTML wholesale, which destroys the
// scrolled .raven-grab-body and builds a fresh one at scrollTop 0 — so any
// render triggered while he was reading a long style list (an unrelated tab
// switch, a batch poll landing, a layer operation completing) yanked the row he
// was reaching for out from under the cursor. There are 81 renderPanel() call
// sites and exactly one of them (expandLayerDuringDrag) saved and restored
// around its own rebuild.
//
// This needs a real browser. scrollTop only exists once the body has laid out
// and overflowed, and the whole defect is that a DOM node is replaced — neither
// is observable by reading the source or by any jsdom-style shim.
//
// The five tests split into two preserve cases and three reset cases, on
// purpose — "keep the scroll" alone is its own bug, because a different list
// would open part-scrolled with nothing to explain why. Each mechanism is
// independently falsifiable; every row below was measured by serving a mutated
// overlay through RAVEN_GRAB_ASSET_PATH:
//
//   disable the restore loop            → both preserve tests fail
//   make the identity check always true → all three reset tests fail
//   drop the simple-mode key branch     → the simple-mode test fails, alone
//   restore panel A only                → the layer-tree test fails, alone
//   drop the mobile key branch          → the mobile tab test fails, alone
//
// Three earlier drafts of the mobile test passed against the defect and are
// documented at that test — read them before weakening any precondition here.
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
  test('playwright available for overlay scroll-preservation test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');

// Two selectable targets, far enough apart vertically that a mouse click lands
// unambiguously on one or the other, and both in the horizontal gap between the
// docked panels. Each carries enough authored style that the panel's style list
// is long — a fixture whose panel does not overflow would make the preserve
// assertion vacuously true, which is why the test measures the overflow first.
const HOST_PAGE = `<!doctype html><html><head><title>scroll host</title><style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  .target {
    width: 320px; margin: 0 auto; padding: 24px 32px; border: 3px dashed #7a5cff;
    border-radius: 12px; background: #f4f1ff; color: #221a44; letter-spacing: 0.4px;
    line-height: 1.6; text-transform: uppercase; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    font-weight: 600; font-size: 20px; opacity: 0.95; text-align: center;
  }
  #second { margin-top: 120px; background: #eef9f1; border-color: #2f9e5c; color: #10331f; }
  /* Forty leaf nodes so the LAYER tree in panel B overflows too — panel A's
     style list is long because of authored style, which says nothing about the
     other panel, and panel B is the one a designer scrolls most. They sit at
     body level rather than nested inside a wrapper because the tree renders
     collapsed children as one row: nesting them made the tree SHORTER. */
  .leaf { font-size: 9px; line-height: 1; color: #9a9a9a; margin: 0; padding: 0 40px; }
</style></head><body>
<div class="target" id="first">First target</div>
<div class="target" id="second">Second target</div>
${Array.from({ length: 40 }, (_, i) => `<p class="leaf">n${i}</p>`).join('')}
</body></html>`;

// 760 is the overlay's own mobile-sheet threshold (window.innerWidth <= 760),
// so the viewport is what selects between the desktop two-panel layout and the
// single tabbed sheet — and the sheet is a different markup branch, not a
// restyle of the same one.
const DESKTOP = { width: 1280, height: 620 };
const MOBILE = { width: 420, height: 780 };

async function withOverlay(fn, viewport = DESKTOP) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HOST_PAGE);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-scroll-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath, undefined, upstreamUrl, 'consumer');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport });
    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot),
      null,
      { timeout: 15000 }
    );
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

// The panels dock left and right and the overlay host covers the viewport, so
// page.click() fails its actionability check even though the host is
// pointer-events:none. A raw mouse click is what a designer actually does.
async function selectAt(page, x, y) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(60);
  await page.mouse.click(x, y);
  await page.waitForTimeout(180);
  return page.evaluate(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    // The selector chip lives in panel A's element markup, which the mobile
    // sheet does not render while the Layers tab is showing — reading it there
    // returns null for a perfectly good selection, which is how the first
    // version of the two mobile tests "failed". The primary layer row is the
    // readout that exists in both layouts.
    const chip = root.querySelector('[data-element-selector]')?.getAttribute('title');
    if (chip) return chip;
    return root.querySelector('.raven-grab-layer-row[data-primary="true"]')?.getAttribute('data-layer-id') || null;
  });
}

// The right-hand panel is the one showing the selected element's styles. Its
// body is the scroll container the report is about.
const STYLE_BODY = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  const panels = root.querySelectorAll('.raven-grab-panel');
  for (const panel of panels) {
    if (panel.querySelector('[data-style-value]')) return panel.querySelector('.raven-grab-body');
  }
  return null;
})()`;

// Simple mode replaces panel A's style list with a short element summary, so the
// style-value locator finds nothing there. The panel is still the same panel and
// still the same scroll container — locate it by which one is not collapsed.
const OPEN_BODY = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  for (const panel of root.querySelectorAll('.raven-grab-panel')) {
    if (panel.getAttribute('data-collapsed') !== 'true') return panel.querySelector('.raven-grab-body');
  }
  return null;
})()`;

// The layer tree lives in the OTHER panel. Locating it by content rather than by
// position is what makes the panel-B test independent of which side is which.
const LAYER_BODY = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  for (const panel of root.querySelectorAll('.raven-grab-panel')) {
    if (panel.querySelector('.raven-grab-layer-list')) return panel.querySelector('.raven-grab-body');
  }
  return null;
})()`;

function bodyMetrics(page, locator) {
  return page.evaluate(`(() => {
    const body = ${locator || STYLE_BODY};
    if (!body) return { found: false };
    return { found: true, scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
  })()`);
}

async function scrollStyleBodyDown(page) {
  const before = await bodyMetrics(page);
  assert.equal(before.found, true, 'no style panel found — the fixture never selected anything');
  // A body that does not overflow cannot lose a scroll position, so every
  // assertion below would pass against a completely unfixed overlay. Fail here
  // instead, loudly, with the numbers.
  assert.ok(before.scrollHeight > before.clientHeight + 40,
    `fixture panel does not overflow (scrollHeight ${before.scrollHeight} vs clientHeight ${before.clientHeight}) — `
    + 'the scroll assertions below would be vacuous');
  const target = Math.min(120, before.scrollHeight - before.clientHeight);
  const landed = await page.evaluate(`(() => {
    const body = ${STYLE_BODY};
    body.scrollTop = ${target};
    return body.scrollTop;
  })()`);
  assert.ok(landed > 20, `the panel refused to scroll (landed at ${landed})`);
  return landed;
}

function skipIfNoBrowser(t, err) {
  if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
    t.skip(`browser unavailable for overlay scroll preservation (${err.message})`);
    return true;
  }
  return false;
}

test('a rebuild of the same panel content keeps the scroll position', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      await selectAt(page, 640, 60);
      const scrolled = await scrollStyleBodyDown(page);
      // A real render with panel A's content unchanged: switching the LEFT
      // panel's tab rebuilds both panels, and the selected element's style list
      // is byte-identical across it. This is the shape of every render the
      // report is about — something else in the overlay moved, and the list the
      // user was reading was rebuilt as collateral.
      const switched = await page.evaluate(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const tab = root.querySelector('[data-tab="assets"]');
        if (!tab) return false;
        tab.click();
        return true;
      });
      await page.waitForTimeout(200);
      return { scrolled, switched, after: await bodyMetrics(page) };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }

  assert.equal(result.switched, true, 'no left-panel tab to click — the render under test never fired');
  assert.equal(result.after.found, true, 'the style panel disappeared across the rebuild');
  assert.equal(result.after.scrollTop, result.scrolled,
    `the panel jumped from ${result.scrolled} back to ${result.after.scrollTop} on a rebuild of the same content`);
});

test('switching the overlay into simple mode starts the panel at the top', async (t) => {
  // Panel A's body is chosen by simpleMode() and mobileTabbedSheetMode() as well
  // as by the tab, so a key built from the tab alone preserves a scroll position
  // taken on a completely different list. This covers the simple-mode half; the
  // mobile half is in the key by the same argument and is NOT tested here.
  let result;
  try {
    result = await withOverlay(async (page) => {
      await selectAt(page, 640, 60);
      const scrolled = await scrollStyleBodyDown(page);
      const switched = await page.evaluate(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const gear = root.querySelector('[data-settings-open]');
        if (!gear) return 'no settings control in the overlay';
        gear.click();
        const simple = root.querySelector('[data-overlay-mode="simple"]');
        if (!simple) return 'no simple-mode control in the settings modal';
        simple.click();
        return null;
      });
      await page.waitForTimeout(220);
      return { scrolled, switched, after: await bodyMetrics(page, OPEN_BODY) };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }

  assert.equal(result.switched, null, String(result.switched));
  assert.equal(result.after.found, true, 'no style panel after switching to simple mode');
  assert.equal(result.after.scrollTop, 0,
    `simple mode opened part-scrolled at ${result.after.scrollTop}, carried over from the full-mode list`);
});

test('the layer tree keeps its scroll position when the selection changes', async (t) => {
  // Sol's round-2 review, finding 7: the first three tests all measure panel A,
  // so an implementation that restores panel A and drops panel B passes every
  // one of them while the layer tree — the list a designer scrolls most — still
  // snaps to the top on every background render. Selecting a page element is the
  // sharpest case: it MUST reset panel A (test 3) and MUST NOT reset panel B,
  // because the tree is the same tree whatever is selected inside it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      const first = await selectAt(page, 640, 60);
      const before = await bodyMetrics(page, LAYER_BODY);
      assert.equal(before.found, true, 'no layer panel found');
      assert.ok(before.scrollHeight > before.clientHeight + 40,
        `the layer tree does not overflow (scrollHeight ${before.scrollHeight} vs clientHeight ${before.clientHeight}) — `
        + 'this assertion would be vacuous');
      const scrolled = await page.evaluate(`(() => {
        const body = ${LAYER_BODY};
        body.scrollTop = 100;
        return body.scrollTop;
      })()`);
      assert.ok(scrolled > 20, `the layer tree refused to scroll (landed at ${scrolled})`);
      const second = await selectAt(page, 640, 320);
      return { first, second, scrolled, after: await bodyMetrics(page, LAYER_BODY) };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }

  assert.notEqual(result.second, result.first,
    `the second click did not change the selection (both read ${JSON.stringify(result.first)})`);
  assert.equal(result.after.found, true, 'the layer panel disappeared after selecting a second element');
  assert.equal(result.after.scrollTop, result.scrolled,
    `the layer tree jumped from ${result.scrolled} back to ${result.after.scrollTop} on a selection change`);
});

test('switching tabs in the mobile sheet starts the new list at the top', async (t) => {
  // Sol's round-2 review, finding 1. In the mobile tabbed sheet there is one
  // panel, and its body is chosen by activeTabB — the same variable panel B is
  // keyed on. A key built only from activeTabA / editScope / the two mode flags
  // calls Layers and Styles the same content, so switching tabs would open the
  // new list at the old list's offset. Panel A is keyed on activeTabB in this
  // mode and only in this mode; the desktop test above is the other half of
  // that, and would fail if the key were widened unconditionally.
  // DIRECTION IS LOAD-BEARING and the first two drafts of this test both got it
  // wrong in ways that passed against the defect:
  //   (a) Layers → Styles with nothing selected: the style list is barely taller
  //       than the sheet, so a carried-over offset CLAMPS to 0 and reads exactly
  //       like a correct reset.
  //   (b) Styles → Layers with something selected: switchTab("layers") calls
  //       scrollIntoView({block:"nearest"}) on the selected row AFTER the render,
  //       which puts a near-top selection at ~0 whatever the key decided.
  // Both were measured passing with the mechanism reverted. This is Layers →
  // Styles WITH a selection, which avoids the scrollIntoView path entirely and
  // lands on a list long enough to hold the offset it must not have kept.
  const CARRY = 90;
  let result;
  try {
    result = await withOverlay(async (page) => {
      const selected = await selectAt(page, 210, 60);
      const before = await bodyMetrics(page, OPEN_BODY);
      assert.equal(before.found, true, 'no open panel in the mobile sheet');
      assert.ok(before.scrollHeight > before.clientHeight + CARRY,
        `the mobile Layers list does not overflow far enough (scrollHeight ${before.scrollHeight} vs `
        + `clientHeight ${before.clientHeight}) — it could not hold a ${CARRY}px offset`);
      const scrolled = await page.evaluate(`(() => {
        const body = ${OPEN_BODY};
        body.scrollTop = ${CARRY};
        return body.scrollTop;
      })()`);
      assert.ok(scrolled >= CARRY, `the mobile sheet refused to scroll (landed at ${scrolled})`);

      const switched = await page.evaluate(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const tabs = root.querySelectorAll('.raven-grab-mobile-tabs [data-tab]');
        if (!tabs.length) return 'no mobile tab strip — the sheet did not render in tabbed mode';
        const styles = root.querySelector('.raven-grab-mobile-tabs [data-tab="styles"]');
        if (!styles) return 'no styles tab in the mobile tab strip';
        styles.click();
        return null;
      });
      await page.waitForTimeout(220);
      return { selected, scrolled, switched, after: await bodyMetrics(page, OPEN_BODY) };
    }, MOBILE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }

  assert.notEqual(result.selected, null, 'the mobile click selected nothing');
  assert.equal(result.switched, null, String(result.switched));
  assert.equal(result.after.found, true, 'the sheet body disappeared across the tab switch');
  // Without this the test cannot fail: a destination shorter than the offset
  // clamps to 0 and reads exactly like a correct reset. This is (a) above.
  assert.ok(result.after.scrollHeight > result.after.clientHeight + result.scrolled,
    `the mobile Styles list is too short to hold a carried-over ${result.scrolled}px `
    + `(scrollHeight ${result.after.scrollHeight} vs clientHeight ${result.after.clientHeight}) — `
    + 'a clamp would be indistinguishable from the reset under test');
  assert.equal(result.after.scrollTop, 0,
    `the Styles tab opened part-scrolled at ${result.after.scrollTop}, carried over from the Layers list`);
});

test('selecting a different element starts its panel at the top', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      const first = await selectAt(page, 640, 60);
      const scrolled = await scrollStyleBodyDown(page);
      const second = await selectAt(page, 640, 320);
      return { first, second, scrolled, after: await bodyMetrics(page) };
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }

  // Without this, "preserve the scroll" would carry one element's reading
  // position onto a different element's list — a shorter list would open
  // part-scrolled with no way to tell why.
  assert.notEqual(result.second, result.first,
    `the second click did not change the selection (both read ${JSON.stringify(result.first)})`);
  assert.equal(result.after.found, true, 'the style panel disappeared after selecting a second element');
  assert.equal(result.after.scrollTop, 0,
    `a newly selected element opened part-scrolled at ${result.after.scrollTop}`);
});
