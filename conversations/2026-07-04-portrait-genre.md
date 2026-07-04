# Session: 2026-07-04 — taste-portrait genre distinction

## Where we left off
Codex had authored `generate_taste_portrait`; the killer gate (every portrait passes `audit_taste` against its own surface) was failing because note-fidelity findings (missing three.js canvas, branded loader) counted toward the verdict on documents that are ABOUT the surface, not builds OF it.

## This session
### document_kind genre distinction in audit_taste
**What:** Added `document_kind: 'artifact' | 'portrait'` to `auditTaste()` (src/taste.ts). Default `artifact` = unchanged. `portrait` skips the note-fidelity block (note_assessments / fidelity_findings / build_hints) and sets a visible `note_fidelity_skipped` string; profile taste rules (gradient/glow/second-hue/banned-word) still run at full strength. Wired through the MCP registration (src/index.ts zod enum + threaded call) and both tool descriptions.
**Why:** A taste portrait is a document about a surface — "three.js hero scene" is not an acceptance criterion for it, but "no gradients / editorial voice / one accent" still is. Genre mismatch, not a scoring bug.

### Light-glass generator improvement
**What:** `wantsLightGlass()` gate in src/taste-portrait.ts adds real glass cards (translucent fill + backdrop-filter over single-hue tint fields, no gradient/glow) only to editorial-light portraits whose notes name glassmorphism/frosted glass.
**Why:** Makes the aesthetic note genuinely true on nexus-ai / vision-app-raven instead of only claimed.

### Quoted-evidence exemption (carried, verified)
`data-taste-quote` regions excluded from detectors; reported as `quoted_evidence_exempt`. A page is never convicted for quoting the law.

## Verification
- `npm test` — 472/472 pass (added 1 genre test proving BLOCK without flag / PASS with it for a three.js-naming binding).
- Killer gate: all 10 andrew portraits PASS `audit_taste` with `document_kind:'portrait'`.
- Family routing correct: 2 glass-light (nexus-ai, vision-app-raven), 1 dark-product (nexus-ai-dark), rest editorial-light; 0 atmosphere (no binding opts in).
- Eyes-on: gallery index, nexus-ai (glass), portfolio (sparse monochrome) — all obey their surface, no gradient/glow, warm accent as punctuation only.
- Codex devil's-advocate pass: report-only, in progress.

## State at end of session
- document_kind: implemented + tested + gate green ✓
- glass improvement: implemented, landed only where notes call for it ✓
- CHANGELOG (Unreleased) + README: updated ✓ (version NOT bumped — release cut awaits Andrew)
- Pending: Codex adversarial pass resolution; collision check + commit; report to Andrew (incl. owed 06-atmosphere verdict).

## anime.js Taste Engine parity — COMPLETE (Codex-hardened)
**What:** Made anime.js a first-class recognized animation library at parity with three.js/gsap/lottie across all 8 recognition paths: grading (ANIME_WORDS), web + shared/mobile escalation, recipe trigger, interview option, interview-match relevance, and every prose/tooldesc enumeration.
**Codex adversarial loop (2 passes):** pass 1 found 4 gaps (mis-branch, escalation parity, unbounded trigger, prose) — all fixed. Pass 2 (confirmation) CONFIRMED all closed + found 1 severe self-review miss: the interview OPTION LABEL was `anime-js: ... without GSAP's weight` — hyphen defeated ANIME_WORDS and the literal "GSAP" cross-contaminated the greedy GSAP branch, so a user's anime.js pick graded as missing-GSAP. Fixed at source (clean `anime.js` label, no gsap mention) + broadened ANIME_WORDS/trigger/escalations to `anime[.\-\s]?js` (matches dot/hyphen/space/none, rejects xanime.js). Final Codex nit (server-instructions source list omitted animejs.com) also fixed.
**Verify:** npm test 480/480, portrait gate 10/10, 13/13 regex battery, both escalation paths + grading now recognize all 4 spellings. 3 new regression tests (option-consistency, xanime.js boundary, 4-spelling escalation) — all non-vacuous (fail on pre-fix code).
**State:** working-tree only, HEAD==origin/main (4ceb91c), nothing committed/pushed, version 1.14.1 unchanged — release cut waits for Andrew.
