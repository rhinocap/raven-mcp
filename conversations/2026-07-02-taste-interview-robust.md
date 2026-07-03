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
**Pushed:** 78f7a93 → origin/main

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|

## State at end of session
- Interview enhancement (11 dims + references + special closer w/ learned suggestions, options, voice examples, skippable, refine mode): implemented + tested ✓
- Capture animation settle (P1): implemented + tested ✓
- Fenced-code ingest (P2): pre-existing, verified ✓
- Committed + pushed 78f7a93 ✓. Pending: rolls into next version cut (release skill) when Andrew wants it on npm/local instances.

### Live demo of the new interview on the nexus-ai prompt (Andrew's ask: "try it on the same prompt")
**What:** Ran the full new 18-question interview from dist for nexus-ai — Andrew answered ALL dimensions live (initially carried over the old 6; he corrected "you didn't ask typography, colors" → re-asked everything). New answers moved the surface substantially: display+mono pair, airy 96px+, warm off-white + one warm accent, full-bleed scenes, cinematic choreography, 3D scenes + product UI, cinematic entrance, branded loader, hamburger nav, flat-white×glassmorphic, three.js/GSAP/framer-motion, warm-conversational voice (picked by ear from the 3 samples), dot-field texture, reference immersive-g.com (atmosphere/type-in-scene/transitions/3D — folded into type/motion/imagery notes). Rebound nexus-ai with 13 design_note keys; rebuilt demo page with-raven-v2.html in the prior session's demo dir (live at http://127.0.0.1:8787/with-raven-v2.html).
**Verified:** auditTaste PASS (0 findings, 13 keys echoed); capturePage animationsSettled:true (new settle machinery waited out loader+entrance); eyes-on full-page render ✓; local-Codex DA report-only pass: 13/13 notes HONORED.
**Lesson:** carrying over prior answers ≠ running the interview — when Andrew says "try it," ask every question.

### Keep the old version (Andrew)
**What:** Old cool-light/electric-blue calibration preserved as binding `nexus-ai-light` (6 keys, no hosts to avoid url-mode conflict); old with-raven.html untouched and still served. Family now: nexus-ai (new cinematic 13-key), nexus-ai-light, nexus-ai-dark. Verified: audit of old page vs nexus-ai-light → PASS 0 findings; http 200.

### Immersive-g rebuild of v2 (Andrew: "I don't see any of the immersive g stuff")
**What:** v2 rebuilt as scene-based page: 5 full-viewport scenes alternating filmic-dark/paper; 3D-projected particle field (depth-based size/brightness, fog stamps, canvas vignette) under AND over the type (type composited into scene); scroll-snap + per-scene cascade choreography + header glass retint dark↔paper; parallax product frame floating in the field; all off under reduced-motion. Old flat v2 backed up to my scratchpad (with-raven-v2-backup.html).
**Bug caught by capture:** stage-gated content stayed hidden on instant programmatic scroll (IO never fires on jumps) — features/pricing blank for bots/capture/print. Fixed with scroll-position live fallback.
**Verified:** audit_taste PASS 0 findings; animationsSettled:true; eyes-on full-page (all scenes populated, field over type visible); deterministic Playwright probe — scenes go live sequentially, hero line mid-entrance at t=1.6s, on-paper header retint toggles, cascade→opacity 1, parallax transform active, 6 field canvases.

### Next.js default build suggestion (Andrew)
**What:** Raven now suggests building sites as a Next.js app by default, everywhere it guides a build: libraries interview question (plain-language, opt-out recorded in design_notes.libraries), kickoff `then` contract, get_taste_interview tool description, server instructions, README. libraries matcher extended (next.js/framework). New test asserts question + then carry the default. 395/395.

### Dry-run diagnosis — "it didn't interview me automatically" (Andrew, 10:26 PM screenshots)
**What:** Two causes. (1) Stale server: /clear does NOT restart MCP servers — all 5 live raven processes started 09:38 AM or earlier; the new-interview dist was built 8:41 PM, so his 10:16 PM /clear session was still on the old server. (2) Client bypassed the gate: the instance named "calibrate taste with Raven at kickoff," then committed a design direction ("terminal salvage editorial") while its concept panel ran, and after his complaint asked 4 hand-rolled questions instead of the interview. Hardened: kickoff `then` + server instructions now state the interview is a blocking gate — user answers before ANY direction/palette/type/name is committed, never self-answered. 395/395; pushed 5c34f81.
**Lesson:** a server can't push an interview — the gate lives in the instructions the client reads; make the blocking semantics explicit in the contract text.

### Decision learning loop (Andrew, 2026-07-03: "anytime a taste/direction/decision is made, we're learning from it")
**What:** New `record_taste_decision` + `list_taste_decisions` tools — every taste/direction/design decision made during real work (chosen, rejected alternatives, why, user-directed/approved/corrected) lands in `~/.raven/taste/<profile>.decisions.json`. Kickoff interviews mine the ledger: other-project decisions become suggested defaults on their dimension's question (max 3 distinct, newest first), and categories outside the standard 11 (+reserved special/references/voice/identity) SPAWN new design:<key> questions — the interview literally grows. Kickoff `then` + server instructions tell clients to record every committed decision (`user-corrected` = highest signal). Local-model distillation deliberately deferred — deterministic recurrence first.
**Verified:** 398/398 tests (3 new); wire smoke: record sound decision → fresh interview spawns design:sound with the suggestion; Codex DA 5/5 HONORED, flagged issues all match existing storage prior art; pushed ddd59b6.

**Lesson (Andrew: "why aren't you using agents for this?"):** the learning-loop implementation (~250 lines, 4 files) stayed in the main loop; only the DA leg went to local-free. Wrong default — substantial implementation legs go to Codex/sonnet subagents even when the main loop holds the context; main loop specs, reviews, verifies. Delegate-by-default, main-loop-implement is the exception needing justification.

### Codex dry run — interview blocked by Codex's 50-tool cap (Andrew, 2026-07-03)
**What:** Andrew ran the kickoff flow in Codex; it TRIED to follow the gate (AGENTS.md mirror added this session) but reported `list_taste_profiles` schema error + `get_taste_interview` not exposed. Root cause, reproduced in an isolated Codex home: **Codex exposes at most 50 tools per MCP server** — raven serves 69, the 19 dropped vary per session (one probe had record_taste_decision but no interview; another the reverse). The "schema error" was actually the `approval_mode="approve"` gate auto-cancelling in non-interactive mode. Fix in ~/.codex/config.toml (backup: config.toml.bak-2026-07-03): `disabled_tools` = 20 legs never used from Codex (creative-gen pipeline, strategy frameworks, service design, raven_register/reflect) → 49 exposed; read-only taste tools (list_taste_profiles, get_taste_interview, get_taste_profile, list_taste_decisions) set to `approval_mode="auto"`.
**Verified:** isolated-home probe after fix: COUNT: 49, INTERVIEW: yes, RECORD: yes; real config parses + `codex mcp get raven` shows the list.
**Watch:** every new raven tool re-approaches the cap — keep `disabled_tools` ≥ (tool count − 50).
