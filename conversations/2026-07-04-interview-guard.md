# Session: 2026-07-04 — taste-interview engine enforcement

## This session
### bind_taste_surface refusal guard (enforce the kickoff interview)
**What:** Turned the taste-kickoff interview from an advisory (prose) gate into an engine-enforced one. `bindTasteSurface` (src/taste.ts) now REFUSES any bind whose result carries zero taste calibration (no design_notes / non-blank voice_note / references / overrides), unless an explicit non-blank `uncalibrated_ack` rationale is passed (persisted on the binding + through disk reload, so the skip is auditable). Gates new surfaces AND empty re-binds (upsert replaces all fields → empty re-bind erases calibration). Threaded `uncalibrated_ack` through the index.ts tool schema/description + SurfaceBinding type + validateStoredBinding round-trip.
**Why:** Codex bypassed the advisory gate — called get_taste_interview, skipped asking the user, bound a new surface `ai-reader-raven` identity-only ("leave the optional taste questions uncalibrated"). Andrew: "Codex did not do the interview." The engine now makes that impossible.
**Verify:** 481/481 tests pass (new dedicated guard test); tsc clean; live runtime probe reproduced the exact ai-reader-raven scenario → REFUSED, plus all 4 Codex-found holes → REFUSED, legit paths → ALLOWED, ack persists through reload, empty re-bind preserves prior calibration.
**Codex devil's-advocate:** ran report-only; found 4 real holes (whitespace voice_note, whitespace ack, same-project/new-surface rebind wipe, garbage design_note) → 3 fixed (trim + drop isNewSurface exemption), #4 (fabricated meaningful note) documented as out-of-scope for a deterministic gate.
**Pushed:** local on main, built to dist, NOT pushed (takes effect on Raven MCP restart).
