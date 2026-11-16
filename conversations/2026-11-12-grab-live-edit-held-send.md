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

## Follow-up: invalid held value (Andrew: "the second one ther should be some kind of warning")
- Accepted by Andrew, no change: a value held while a batch applies with nothing next does not enable Send.
- Fixed: a field that does not parse marks itself `aria-invalid` with the warning border. The tray reads "Edited value not valid", and Send is disabled and reads "Fix the value being edited". Add to queue is blocked, and dispatch refuses to flush. Blur and a press in the panel leave the field open; the press returns focus to the field.
- Covers the generic editor (number, colour) and every structured editor: size, box field, shadow (numbers, negative blur, colour), corner radius, text decoration, Stroke.
- Accepted:
  - `calc()`/`var()` in a numeric field is flagged. The number control never recorded these; before this change they were dropped silently.
  - A press on the page that selects another element abandons the field, like Escape. Nothing is recorded.
- Tests: T67 updated; T73–T88 added. Every guard was mutation-killed (26 mutants plus the border CSS). Full suite: 2,253 tests, 2,250 pass, 0 fail, 3 skipped.
- Sol: round 1 2×P2 + 1×P3 fixed; round 2 2×P2 fixed, 1×P2 accepted (calc/var above).
- Sol round 3 (cap): 1×P2 open. Enter on a field that does not parse closes the editor and restores the old value without a message (radius named; every editor does this, and T34/T34b assert it). Needs Andrew's call: keep, or make Enter keep the field open like blur.

## Follow-up: Enter holds (Andrew, 2026-11-13: "enter shojld keep the field open, and the highlight should be more clear")
- Enter on a field that does not parse keeps the editor open, focuses the field and records nothing (`holdInvalidOnEnter()`), in every editor with an `invalidField` hook. Overflow has no guard: it has only selects and can never hold an invalid value.
- Highlight: warning border plus a 2px warning ring and 12% warning fill.
- Tests: T34/T34b now expect the field to stay open, then Escape. `enterHolds` was added to T79–T88. Three grab-bridge tests now flush explicitly to reach the rollback. All 15 mutants (13 guard sites, the ring and the refocus) were killed. Full suite: 2,253 tests, 2,250 pass, 0 fail, 3 skipped.
- Screenshot: scratchpad `enter-held.png`.
- Sol round 1: 0×P1, 1×P2, accepted by design. Enter on a preset button (Soft, an easing keyword) applies that preset, the same as a click: you pick a new value, which replaces the bad one. Nothing is committed and the editor stays open.

## Open
- Andrew: full-size look via `npm run grab:dev grab-live-edit.html`, plus the four pointer checks from the handoff.
- Push/PR need approval; merging to main deploys `mcp.ravenmcp.ai` and needs separate approval.

## Shipped (2026-11-15)
- PR #55 merged (b38b994). Andrew asked to remove the "Layers" heading above "Find a layer" to match Styles: 5eb329e, PR #56 merged (656f1a7). Test kill-proven; suite 2,254 / 0 fail; Sol 0 findings.
- mcp.ravenmcp.ai: site-nqy8kllw5 Ready, /api/mcp 405.
- ravenmcp.ai: web-qtdsu5m5z Ready; live raven-grab.js byte-identical to main; /changelog shows v3.1.0 (1716b93).
- npm 3.1.0: preflight done (registry key, mcp-publisher validate, dry run → 3.1.0). npm auth E401, so Andrew runs ~/Desktop/raven-release-3.1.0.command (npm login, scripts/release.sh minor). Then: verify npm view, registry, tag, rebuild local dist.
- Old local auto-save 9c7efc2 kept on branch backup/autosave-9c7efc2.
