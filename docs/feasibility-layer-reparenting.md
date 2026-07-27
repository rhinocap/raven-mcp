# Feasibility: Layer reparenting (cross-parent move)

**Status:** Implemented 2026-07-15 (`operation: "reparent"`).  
**Date:** 2026-07-15  
**Scope:** Raven Grab overlay layer intent (`browser/raven-grab.js`) → bridge/agent apply later.

## Current contract

- Same-parent drags still emit `{ operation: "reorder", parentSelector, fromIndex, toIndex, orderedSelectors, ... }`.
- Cross-parent drops emit `{ operation: "reparent", fromParentSelector, toParentSelector, fromIndex, toIndex, orderedSelectors, toBaselineOrder?, toDomSnapshotHash?, ... }`.
- Overlay records **intent** only; agent applies later (no live DOM mutate in the overlay).

## Payload shape (shipped)

```js
{
  operation: "reparent",
  fromParentSelector: "...",
  toParentSelector: "...",
  fromIndex: 0,
  toIndex: 2,
  orderedSelectors: ["..."], // expected children under toParent after apply
  baselineOrder: ["..."],      // fromParent children before remove
  toBaselineOrder: ["..."],    // toParent children before insert
  domSnapshotHash: "...",      // fromParent
  toDomSnapshotHash: "...",    // toParent
  // plus page, selectionOrder, measuredRects, approximate, fromSelector, fixedMove/note when applicable
}
```

## Drag detection (shipped)

1. `resolveLayerReparentDrop` hit-tests layer rows under the pointer.
2. Same-parent → existing sibling-swap reorder path.
3. Different parent → insert as sibling under that parent; nesting only when dropping on the lower half of a **container** (already has children).
4. Slot chrome: `data-reparent="true"` + “Move into…”.
5. Preview via `cloneMeasuredReparentPreview` (same 300-descendant unavailable gate).

## Out of scope (v1 — still)

- Shadow roots / iframes (`buildLayerTree` stops; overlay rejects with notice).
- Keyboard reparent, multi-select reparent, undo across parents.
- Live DOM apply inside the overlay.

## Agent apply recipe

1. Resolve `fromParentSelector` / `toParentSelector` / `fromSelector` against the live page.
2. Reject if `domSnapshotHash` or `toDomSnapshotHash` mismatches.
3. Detach moved node from fromParent; insert at `toIndex` under toParent.
4. Mark operation applied via `get_grab_operation`; reject on ambiguous selectors.
5. DESIGN.md fixed-move records (when `fixedMove`) include `operation`, `fromParent`, `toParent`.
