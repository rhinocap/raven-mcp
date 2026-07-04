# Session: 2026-07-03 — Taste Engine fidelity fix (highest priority)

## Where we left off
Diagnosis complete: taste-calibrated builds came out WORSE than uncalibrated ones — audit_taste echoed design_notes without verifying them (builders honored cheap notes, silently dropped expensive ones: three.js/WebGL, GSAP choreography, imagery stories, glassmorphism), references were lossy-distilled to prose and never consistency-checked, and "restrained" was executed as deletion.

## This session
### Taste Engine fidelity — 5-leg workflow (Andrew-authorized top-tier models)
**What:** design_notes are now verified ACCEPTANCE CRITERIA, not echoed prose.
- **LEG A** (Codex/GPT-5.5, src/capture.ts): `PageTraits` measurable page fingerprint — scheme/luminance, text_density, canvas/webgl, backdrop_filter, animation_count, scroll_effects, fonts, max_heading_px, gradients, loader_hint, viewport_fill; live in-page probe (`collectTraits`) + static HTML fallback.
- **LEG B** (Opus, src/taste.ts + index.ts): references first-class on bindings (`ReferenceCapture[]`, http(s) or local .png); `checkBindingConsistency` flags note-vs-reference contradictions at bind time; bind_taste_surface captures each reference's live traits, returns `consistency_warnings`.
- **LEG C** (Fable, src/taste-fidelity.ts NEW): `assessDesignNotes` per-dimension verifiers (present/partial/missing/unverifiable, every status trait-number-cited); `referenceDeltas` (REF-scheme-mismatch/density/motion/type-scale); `restraintGuard` (sparse-and-empty = restraint-as-deletion warn); fidelity findings count toward verdict; block escalation only when a named library or branded loader is wholly absent. Conservatism contract: unverifiable over guessed; entrance capped at partial (post-settle capture can't see entrances).
- **LEG D** (Opus): `TECHNIQUE_RECIPES` (10) + `buildHints()` — expensive notes (three.js, GSAP, glassmorphism, branded loader, lottie, kinetic type…) get concrete recipes + canonical public sources (threejs.org, gsap.com, Codrops) attached to audits and bind results; contract text: "an expensive note is NEVER license to drop it."
- **LEG E** (Fable, mobile parity): `screenTraitsFromImage` (pngjs border-ring luminance; scheme asserted only ≥70% ring agreement); `assessDesignNotesSource` for swiftui/rn/compose API vocabularies; wired opt-in (`project`/`profile`) into audit_swiftui/audit_rn/audit_screen/audit_ios_screen; resolveMobileTaste never throws into a plain HIG audit.
**Why:** monetizable core + Apple/OpenAI interview demos Mon/Tue; the engine's word must be trustworthy.
**Verification:** 457/457 tests green, build clean. Three live acid tests:
1. **Bind consistency (real binding):** vision-app-raven notes vs fresh mont-fort/igloo captures → flagged "color note reads dark, but every captured reference renders LIGHT (mont-fort lum=1.00, igloo 0.65)". ✓
2. **Live audit (odd-lot.vercel.app):** honest per-note statuses + webgl:true detection; surfaced a Times/serif false positive → fixed with SERIF_FACE_RE/MONO_FACE_RE recognized-face vocabularies + regression test. ✓
3. **HEADLINE:** the deployed vision-app-raven build (previously "13/13 honored") now returns **Verdict: BLOCK (1 block, 4 warn)** — NOTE-motion missing (animation_count=0, scroll_effects=false at 5 scroll depths), NOTE-aesthetic (renders dark vs flat-white note), NOTE-libraries block, REF-scheme-mismatch + REF-motion-missing vs references, with build_hints attached. Live traits probed via claude-in-chrome through the SSO wall. ✓
**Pushed:** (fill at ship)

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Serif detection matched substring "serif" in family names — Times/Georgia/Playfair all read as "no serif" (caught live in ACID 2, would have been a trust-destroying false positive) | verifier design | Recognized-face vocabularies, not name-substring matching; regression test added |
| Heavy in-page scroll loop froze the WebGL page's renderer (CDP timeout) | browser probing | Sample few depths with short waits on canvas-heavy pages |

## State at end of session
- 5 legs implemented + built + 457/457 green ✓
- 3 acid tests passed ✓
- Codex devil's-advocate pass: running
- Commit/push: pending DA
- Pending (carried forward):
  - MCP servers serve stale dist until restarted (tell Andrew)
  - Release/version cut on Andrew's go
  - Interview demo artifact: the before/after acid test (vision-app "13/13" → BLOCK with cited evidence) is the story
