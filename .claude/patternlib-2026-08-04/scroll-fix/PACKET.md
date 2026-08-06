# Correctness review — panel scroll preservation in the Raven Grab overlay

Report-only. Do not edit files. Return findings with severity and, for each, the
concrete input or sequence that produces the wrong behaviour.

## Context

`browser/raven-grab.js` is a browser overlay injected into a live page. It renders
two docked panels: panel A (right) shows the selected element's style list, panel B
(left) shows a layer / asset tree. `renderPanel()` rebuilds BOTH panels by assigning
`panel.innerHTML` and `panelLeft.innerHTML` wholesale. Each panel contains a
`<div class="raven-grab-body">` with `overflow-y: auto` — that is the scroll
container, and rebuilding the panel destroys and recreates it, so `scrollTop` resets
to 0.

There are 81 `renderPanel()` call sites. Many fire for reasons unrelated to what the
user is looking at: batch polling (`pollBatch`), layer-operation polling
(`pollLayerOperation`), tab switches, change-tray mutations, dispatch lifecycle.
Exactly one call site (`expandLayerDuringDrag`) previously saved and restored the
scroll position around its own rebuild.

Reported symptom (the user, verbatim): "as I have been using the panels sometimes I
click in to change a value and the panel resets scrolling back to the top instead of
just letting me use the input to change whatever I am trying to change."

## The change under review

`overlay.diff` in this directory. It adds, inside `renderPanel()`:

1. A module-level `lastRenderIdentity = [null, null]`, indexed like the `panels`
   array `[panelA, panelB]`.
2. Before the `innerHTML` writes: compute `renderIdentity` — panel A keyed on
   `{ element: selectedElement, key: activeTabA + "|" + editScope }`, panel B on
   `{ element: null, key: activeTabB }` — compare each against the previous render's
   entry, and capture `scrollTop` only when both fields match. Then store the new
   identity.
3. After the `innerHTML` writes and the collapsed-state loop: for each panel with a
   non-zero captured value, re-query `.raven-grab-body` and assign `scrollTop`.

Relevant existing behaviour that was NOT changed:
- `renderPanel()` early-returns when `activeStyleEditorFlush || activeStyleScrub` is
  set (an open style editor defers background rerenders) and when a layer drag is
  active without `layerDragRenderBypass`.
- `switchTab("layers")` calls `scrollIntoView({block:"nearest"})` on the selected
  layer row AFTER `renderPanel()` returns.
- `expandLayerDuringDrag` still does its own save/restore around its `renderPanel()`
  call, which is now redundant with the generic one.

## Tests added

`test/grab-overlay-scroll-preservation.test.mjs` — real Chromium via Playwright,
overlay booted through the real bridge against a proxied fixture page.

- Test 1: select an element, assert the style body actually overflows, scroll it to
  ~120px, click panel B's "assets" tab (a real render where panel A's content is
  unchanged), assert `scrollTop` is unchanged.
- Test 2: select an element, scroll, select a DIFFERENT element, assert `scrollTop`
  is 0.

Falsifiability measured by serving mutated overlays via `RAVEN_GRAB_ASSET_PATH`:
- Delete the restore loop → test 1 fails, test 2 passes.
- Replace the identity comparison with `var sameContent = true` → test 2 fails,
  test 1 passes.

Full suite: 1321 tests / 1318 pass / 0 fail / 3 skipped.

## What to attack

Be specific and adversarial about the mechanism, not the style. In particular:

1. **Is the identity key sufficient?** Name a sequence where `selectedElement`,
   `activeTabA`, `editScope` and `activeTabB` are all unchanged but panel A's or
   panel B's list content is materially different, so the restored scroll lands the
   user somewhere wrong. Multi-select, component-vs-instance scope, state tabs
   (hover/focus/active style states), pending-change tray expansion, template load,
   layer tree reorder are all candidates.
2. **Is the identity key too strict?** Name a sequence a user would experience as
   the same list where the key changes and the scroll is thrown away anyway — i.e.
   the reported bug still reproduces.
3. **Element identity and lifetime.** `renderIdentity[0].element` holds a strong
   reference to a DOM node across renders. Does that leak, or hold a detached node
   alive, in a page the overlay does not control? Does a re-selection of the *same*
   logical element after a DOM rebuild produce a different node and therefore a
   spurious reset?
4. **Ordering.** The restore runs before `syncMobileSheetEdgeTabs()`,
   `syncPanelPresets()`, `mountGlobalActions()` and the `[data-status]` removals.
   Can any of those change the body's layout or content height such that the
   assigned `scrollTop` is clamped or invalidated after the fact?
5. **Collapsed / hidden panels.** A collapsed panel is `display:none`. Reading 0 and
   writing nothing is the intended behaviour — confirm there is no sequence where a
   panel is hidden at capture and visible at restore (or the reverse) that loses a
   position the user had.
6. **Mobile sheet mode.** `updateMobileSheetViewport()` calls `renderPanel()` and
   `mobileTabbedSheetMode()` changes the markup. Does the identity key account for
   the mobile tab state, and is the body still the scroll container there?
7. **The tests themselves.** Do they encode the property or merely detect the
   current implementation? Would a plausible wrong implementation pass both? Is the
   overflow precondition assertion strong enough that the fixture cannot silently
   stop overflowing?
8. **The redundant save/restore in `expandLayerDuringDrag`** — can the two
   interact to produce a wrong position during a layer drag?

Return: findings ranked by severity, each with the reproduction sequence. If a
concern is theoretical rather than reachable, say so explicitly.


---

# The diff

```diff
diff --git a/browser/raven-grab.js b/browser/raven-grab.js
index a4d18a5..a67f066 100644
--- a/browser/raven-grab.js
+++ b/browser/raven-grab.js
@@ -158,6 +158,10 @@
   var previewOriginals = Object.create(null);
   var activeTabA = "design";
   var activeTabB = "layers";
+  // What each panel was showing at the last render, so renderPanel can tell a
+  // rebuild of the same list (keep the scroll position) from a switch to a
+  // different one (start at the top). Indexed like `panels`: [A, B].
+  var lastRenderIdentity = [null, null];
   var activeGlobalActionSurface = "design";
   var expandedSections = { styles: true };
   // Pending-changes tray sections start expanded; the user can collapse each to
@@ -9686,6 +9690,31 @@
         <button class="raven-grab-tab" type="button" role="tab" data-tab="styles" aria-selected="${activeTabB === "styles" ? "true" : "false"}">Styles</button>
         <button class="raven-grab-tab" type="button" role="tab" data-tab="instructions" aria-selected="${activeTabB === "instructions" ? "true" : "false"}">Instructions</button>
       </div>` : "";
+    // Every render rebuilds the panel from a string, which throws away the
+    // scrolled .raven-grab-body and builds a fresh one at the top. Renders are
+    // not only background events — opening a style editor, picking a token and
+    // expanding a section all call this — so clicking a value halfway down a long
+    // panel scrolled the panel back to the top under the click, and the field the
+    // user was reaching for moved out from under them. expandLayerDuringDrag
+    // already saved and restored around its own rebuild; there are 81 call sites,
+    // so it belongs here rather than at each one.
+    // Scroll is only preserved across renders of the SAME content. A different
+    // selected element (or a different tab) is a different list, and starting
+    // that one part-scrolled would be its own bug — so identity is checked, not
+    // assumed. Panel A is the selected element's styles; panel B is the layer /
+    // asset tree, which does not change with selection.
+    var renderIdentity = [
+      { element: selectedElement, key: activeTabA + "|" + editScope },
+      { element: null, key: activeTabB }
+    ];
+    var priorScroll = [];
+    for (var si = 0; si < panels.length; si++) {
+      var prior = lastRenderIdentity[si];
+      var sameContent = !!prior && prior.element === renderIdentity[si].element && prior.key === renderIdentity[si].key;
+      var priorBody = sameContent ? panels[si].querySelector(".raven-grab-body") : null;
+      priorScroll.push(priorBody ? priorBody.scrollTop || 0 : 0);
+    }
+    lastRenderIdentity = renderIdentity;
     panel.innerHTML = `
       <button class="raven-grab-sheet-handle" type="button" data-sheet-drag-handle aria-label="Resize Raven sheet"></button>
       <div class="raven-grab-top">
@@ -9715,6 +9744,14 @@
       panels[pi].setAttribute("aria-hidden", isCollapsed ? "true" : "false");
       panels[pi].setAttribute("data-collapsed", isCollapsed ? "true" : "false");
     }
+    // Restore the scroll captured above. Reading scrollTop back is what makes
+    // this falsifiable — a shorter panel clamps, and a collapsed one is
+    // display:none and silently keeps 0, which is also what it read.
+    for (var ri = 0; ri < panels.length; ri++) {
+      if (!priorScroll[ri]) continue;
+      var freshBody = panels[ri].querySelector(".raven-grab-body");
+      if (freshBody) freshBody.scrollTop = priorScroll[ri];
+    }
     syncMobileSheetEdgeTabs();
     syncPanelPresets();
     var legacyStatusA = panel.querySelector("[data-status]");
```

---

# renderPanel() in full (browser/raven-grab.js)

```js
9479	  function renderPanel() {
9480	    if (!armed) return;
9481	    // Defer background rerenders while the user is typing in a style editor;
9482	    // gesture paths flush the editor first, and the next poll renders after it closes.
9483	    if (activeStyleEditorFlush || activeStyleScrub) return;
9484	    // A mid-drag rerender (template load, operation poll) detaches the drag's rows
9485	    // and silently cancels the drop — defer; every endLayerDrag path renders.
9486	    if (layerDrag && layerDrag.active && !layerDragRenderBypass) return;
9487	    hidePanelPresetTooltip();
9488	    selectionMembershipForRender = null;
9489	    orderedSelection();
9490	    // Snapshot after prune. Instance path reuses multiSelections (no second
9491	    // connectivity walk); component path re-derives the live match set once.
9492	    if (editScope === "component" && selectedElement) selectionMembershipForRender = visualBadgeElements();
9493	    else selectionMembershipForRender = multiSelections.slice();
9494	    var hasSelection = !!currentSelection;
9495	    var stateStyles = hasSelection && currentSelection.stateStyles ? currentSelection.stateStyles : {};
9496	    var boxStrokeProperties = ["border-width", "border-style", "border-color", "outline-width", "outline-style", "outline-color", "outline-offset"];
9497	    var svgGraphicsSelected = hasSelection && isSvgGraphicsElement(selectedElement);
9498	    var strokeModel = hasSelection ? strokeModelForSelection() : null;
9499	    var strokeEdited = STROKE_PROPERTIES.some(function (property) {
9500	      return !!styleEdits[property] && styleEdits[property].groupId === "stroke";
9501	    });
9502	    var strokeMarkup = hasSelection
9503	      ? '<li data-style-property="__raven-stroke__" data-edited="' + (strokeEdited ? "true" : "false") + '"><span>Stroke</span><code data-style-value data-style-raw="' + escapeHtml(strokeSummary(strokeModel)) + '" tabindex="0" role="button" aria-label="Edit Stroke">' + escapeHtml(strokeSummary(strokeModel)) + "</code></li>"
9504	      : "";
9505	    function styleRowMarkup(property) {
9506	      if (property === "__raven-stroke__") return strokeMarkup;
9507	      if (boxStrokeProperties.indexOf(property) !== -1) return "";
9508	      if (property === "stroke" && !svgGraphicsSelected) return "";
9509	      if (property === "fill" && !svgGraphicsSelected) return "";
9510	      var matched = matchedTokenEntryForProperty(property);
9511	      var edit = styleEdits[property];
9512	      var value = edit ? edit.newValue : (hasSelection ? resolvedStyleValue(property) : "");
9513	      if (!value && !edit) {
9514	        // Fall back to primary computed map so single-select still shows defaults.
9515	        value = hasSelection && currentSelection.styles ? (currentSelection.styles[property] || "") : "";
9516	      }
9517	      if (!value && !edit && matched && matched.token.value) value = matched.token.value;
9518	      if (!value && !edit) return "";
9519	      var isMixed = value === MIXED_STYLE_VALUE;
9520	      var propertyLabel = property === "stroke" ? "SVG stroke" : property;
…
9681	    var requestHintText = "No destination configured — requests can't be sent yet. Ask your agent to set up GitHub routing.";
9682	    var requestHintMarkup = activeTabB === "assets" && grabRole !== "maintainer" && copyOnlyRequest && !requestHintDismissed
9683	      ? '<p class="raven-grab-request-hint" data-request-hint><span>' + escapeHtml(requestHintText) + '</span><button class="raven-grab-request-hint-dismiss" type="button" data-dismiss-request-hint aria-label="' + escapeHtml("Dismiss setup hint") + '">' + escapeHtml("×") + "</button></p>"
9684	      : "";
9685	
9686	    var mobileTabsMarkup = mobileTabbedSheetMode() ? `
9687	      <div class="raven-grab-tabs raven-grab-mobile-tabs" role="tablist" aria-label="Raven Design actions">
9688	        <button class="raven-grab-tab" type="button" role="tab" data-tab="layers" aria-selected="${activeTabB === "layers" ? "true" : "false"}">Layers</button>
9689	        <button class="raven-grab-tab" type="button" role="tab" data-tab="assets" aria-selected="${activeTabB === "assets" ? "true" : "false"}">Assets</button>
9690	        <button class="raven-grab-tab" type="button" role="tab" data-tab="styles" aria-selected="${activeTabB === "styles" ? "true" : "false"}">Styles</button>
9691	        <button class="raven-grab-tab" type="button" role="tab" data-tab="instructions" aria-selected="${activeTabB === "instructions" ? "true" : "false"}">Instructions</button>
9692	      </div>` : "";
9693	    // Every render rebuilds the panel from a string, which throws away the
9694	    // scrolled .raven-grab-body and builds a fresh one at the top. Renders are
9695	    // not only background events — opening a style editor, picking a token and
9696	    // expanding a section all call this — so clicking a value halfway down a long
9697	    // panel scrolled the panel back to the top under the click, and the field the
9698	    // user was reaching for moved out from under them. expandLayerDuringDrag
9699	    // already saved and restored around its own rebuild; there are 81 call sites,
9700	    // so it belongs here rather than at each one.
9701	    // Scroll is only preserved across renders of the SAME content. A different
9702	    // selected element (or a different tab) is a different list, and starting
9703	    // that one part-scrolled would be its own bug — so identity is checked, not
9704	    // assumed. Panel A is the selected element's styles; panel B is the layer /
9705	    // asset tree, which does not change with selection.
9706	    var renderIdentity = [
9707	      { element: selectedElement, key: activeTabA + "|" + editScope },
9708	      { element: null, key: activeTabB }
9709	    ];
9710	    var priorScroll = [];
9711	    for (var si = 0; si < panels.length; si++) {
9712	      var prior = lastRenderIdentity[si];
9713	      var sameContent = !!prior && prior.element === renderIdentity[si].element && prior.key === renderIdentity[si].key;
9714	      var priorBody = sameContent ? panels[si].querySelector(".raven-grab-body") : null;
9715	      priorScroll.push(priorBody ? priorBody.scrollTop || 0 : 0);
9716	    }
9717	    lastRenderIdentity = renderIdentity;
9718	    panel.innerHTML = `
9719	      <button class="raven-grab-sheet-handle" type="button" data-sheet-drag-handle aria-label="Resize Raven sheet"></button>
9720	      <div class="raven-grab-top">
9721	        <div class="raven-grab-header">
9722	          <div class="raven-grab-title"><strong>Raven</strong></div>
9723	          ${panelPresetsMarkup()}
9724	        </div>
9725	      </div>
9726	      ${mobileTabsMarkup}
9727	      <div class="raven-grab-body"><div class="raven-grab-content">${bodyMarkupA}</div></div>
9728	      <div class="raven-grab-actions"${mobileTabbedSheetMode() ? " data-mobile-bottom-bar" : ""}>${changesMarkup}${actionMarkupA}<p class="raven-grab-status" data-status aria-live="polite"></p></div>`;
9729	    panelLeft.innerHTML = `
9730	      <div class="raven-grab-top">
9731	        <div class="raven-grab-header">
9732	          <div class="raven-grab-title"><strong>Raven Design</strong></div>
9733	          ${panelPresetsMarkup()}
9734	        </div>
9735	        <div class="raven-grab-tabs" role="tablist" aria-label="Raven Design actions">
9736	          <button class="raven-grab-tab" type="button" role="tab" data-tab="layers" aria-selected="${activeTabB === "layers" ? "true" : "false"}">Layers</button>
9737	          <button class="raven-grab-tab" type="button" role="tab" data-tab="assets" aria-selected="${activeTabB === "assets" ? "true" : "false"}">Assets</button>
9738	        </div>
9739	      </div>
9740	      <div class="raven-grab-body"><div class="raven-grab-content">${bodyMarkupB}</div></div>
9741	      <div class="raven-grab-actions">${changesMarkup}${requestHintMarkup}${actionMarkupB}<p class="raven-grab-status" data-status-b aria-live="polite"></p></div>`;
9742	    for (var pi = 0; pi < panels.length; pi++) {
9743	      var isCollapsed = collapsedSides[sideOf(panels[pi])];
9744	      panels[pi].setAttribute("aria-hidden", isCollapsed ? "true" : "false");
9745	      panels[pi].setAttribute("data-collapsed", isCollapsed ? "true" : "false");
9746	    }
9747	    // Restore the scroll captured above. Reading scrollTop back is what makes
9748	    // this falsifiable — a shorter panel clamps, and a collapsed one is
9749	    // display:none and silently keeps 0, which is also what it read.
9750	    for (var ri = 0; ri < panels.length; ri++) {
9751	      if (!priorScroll[ri]) continue;
9752	      var freshBody = panels[ri].querySelector(".raven-grab-body");
9753	      if (freshBody) freshBody.scrollTop = priorScroll[ri];
9754	    }
9755	    syncMobileSheetEdgeTabs();
9756	    syncPanelPresets();
9757	    var legacyStatusA = panel.querySelector("[data-status]");
9758	    var legacyStatusB = panelLeft.querySelector("[data-status-b]");
9759	    if (legacyStatusA) legacyStatusA.remove();
9760	    if (legacyStatusB) legacyStatusB.remove();
9761	    mountGlobalActions();
9762	    // Row markup only marks the exact hovered element — re-apply so the
9763	    // nearest-visible-ancestor hover echo survives background rerenders.
9764	    if (hoveredLayerElement) setLayerRowHover(hoveredLayerElement);
9765	    // Drop the render snapshot so later direct layerRowsMarkup / selectionHasElement
9766	    // callers (tests, post-mutation checks) re-derive from live selection state.
9767	    selectionMembershipForRender = null;
9768	    applyPanelFontSize();
9769	  }
9770	
```

---

# test/grab-overlay-scroll-preservation.test.mjs

```js
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
// The two tests are opposites on purpose and each is killed by a different
// revert: delete the restore loop and the preserve test fails; drop the
// identity check (preserve unconditionally) and the reset test fails.
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
</style></head><body>
<div class="target" id="first">First target</div>
<div class="target" id="second">Second target</div>
</body></html>`;

async function withOverlay(fn) {
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 620 } });
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
    return root.querySelector('[data-element-selector]')?.getAttribute('title') || null;
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

function bodyMetrics(page) {
  return page.evaluate(`(() => {
    const body = ${STYLE_BODY};
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
```
