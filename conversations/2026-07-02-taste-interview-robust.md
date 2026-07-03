# Session: 2026-07-02 — taste-interview-robust

## Where we left off
v1.14.0 live; design-dimension interview questions + design_notes shipped (c760d4a); ledger carries 2 fresh captures (animation-settle P1, fenced-code ingest P2).

## This session
### /goal — make the taste interview more robust
**What:**
- `DESIGN_DIMENSIONS` 6 → 11: added `entrance` (hero/launch animation), `loading` (skeleton/spinner/progress/branded), `navigation` (centered/right-aligned/hamburger/tabs/side-panel/fab), `aesthetic` (brutalist/neon/flat-white/editorial/glassmorphic/retro-terminal), `libraries` (three.js/GSAP/framer-motion/lottie/GraphQL/vanilla in plain outcome language for non-technical users — Andrew's mid-flight addition). Each carries multiple-choice `options`.
- Every question now has `skippable` + `priority` (core|extended); only `identity` required; `then` says skipping leaves the dimension uncalibrated — encourage, never force.
- Voice question always emitted (even with zero voice rules) and carries 3 `examples` — one fixed sentence rendered formal-technical / warm-conversational / punchy-editorial so users pick by ear.
- `getTasteInterview` gained `mode: "kickoff"|"refine"`. Refine = the "I don't like the result" re-interview: requires existing binding, asks complaint → revise:<key> per stored design_note (quoting it) → revise:voice → optional reject precedent via label_finding. Wired through index.ts zod schema + tool description + server instructions ("dissatisfaction is a calibration signal, not a dead end").
- `bind_taste_surface` descriptions synced to 11 design_notes keys.
- capture.ts: entrance-animation settle-before-capture (the ledger P1) — waitForFunction polls document.getAnimations() until no RUNNING FINITE animation (infinite spinners excluded), 3s cap, timeout swallowed, `animationsSettled` on CaptureResult; false on no-browser fallback. Real-Playwright fixtures entrance-animation.html + long-entrance-animation.html.
**Why:** /goal — deeper upfront calibration, voice chosen by ear not adjective, dissatisfaction loops back into calibration; P1 capture gap from raven-opportunities ledger.
**Notes:** Andrew added mid-flight: libraries question (three.js/GSAP/framer-motion/lottie/GraphQL in plain language), open-ended 'special' closer with suggestions learned from the profile's other bindings, and a 'references' question (feed examples, get interviewed on what specifically you like). Codex DA ran TWICE — round 1 caught animationsSettled missing from public audit metadata, stale README, fallback-vs-test conflict; round 2 caught unescaped suggestion interpolation, missing references key in bind docs, stale voice phrasing — all fixed. fenced-code-block ingest skip (ledger P2) was ALREADY implemented+tested by a prior instance — verified, not redone. Both ledger lines already captured. Built via Workflow (2 sonnet legs, disjoint files), verified in main loop: npm test 392/392 → 393 after libraries test extension; library-level smoke on dist; wire-level JSON-RPC tools/call with mode:refine against built server ✓; audit_taste on new copy PASS; Codex DA pass run.
**Pushed:** (fill at push)

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|

## State at end of session
- Interview enhancement (11 dims + references + special closer w/ learned suggestions, options, voice examples, skippable, refine mode): implemented + tested ✓
- Capture animation settle (P1): implemented + tested ✓
- Fenced-code ingest (P2): pre-existing, verified ✓
- Pending: commit + push after Codex devil's-advocate objections dispositioned; release rolls into next version cut.
