# 2026-11-12 — Grab: Send counts the held value

Branch `grab-live-style-editing`, worktree `~/projects/raven-mcp-live-edit`. Handoff item 3 in `2026-11-12-grab-live-edit-handoff.md`.

## Decision
While an editor holds an unrecorded value, Send read "Send to agent" and the tray read "None yet", and with N recorded changes Send read N but sent N+1. Andrew approved counting the held value ("yes, fix it").

## Change (commit 015c77a)
- `browser/raven-grab.js` (+ mirror `web/public/raven-grab.js`): `heldRowDelta()`, `shownPendingCount()`, `pendingTraySummary()`, `expandBoxSides()`; every structured editor passes `heldEdit` to `holdStylePreview`.
- Copy: "Send N change(s)" includes the held value; tray reads "1 being edited", "N pending · 1 being edited", "N pending · 1 undone by this edit", "1 active · N next".
- Tests: T27, T37, T24d updated; T65–T72 added in `test/grab-overlay-live-edit-controls.test.mjs`.

## Evidence
- Every fix killed by its test when reverted (R3a equivalent, reverted).
- Full suite: 2,237 tests, 2,234 pass, 0 fail, 3 skipped.
- Sol: round 1 4×P2 + 1×P3 fixed; round 2 0×P1/P2, 3×P3 fixed.
- design-judge on the rendered panel: PASS. Screenshot: scratchpad `held-send.png`.
- `test/grab-motion-static.test.mjs:157` flaked 2/11 runs (reads the pending label before the next playground loads); unrelated to this change.

## Open
- Send stays disabled for a value held while a batch applies with nothing next.
- An invalid held value still enables Send (count excludes it).
- Andrew: full-size look via `npm run grab:dev grab-live-edit.html`, plus the four pointer checks from the handoff.
- Push/PR need approval; merging to main deploys `mcp.ravenmcp.ai` and needs separate approval.
