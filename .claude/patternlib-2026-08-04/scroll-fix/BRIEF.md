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
