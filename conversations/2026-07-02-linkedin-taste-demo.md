# Session: 2026-07-02 — LinkedIn taste-calibration demo + design_notes feature

## This session
### Design-dimension interview + design_notes on bindings
**What:** get_taste_interview asks 6 design-dimension questions (typography/spacing/color/layout/motion/imagery), each grounded in the profile's own rules; bind_taste_surface stores answers as design_notes; audit_taste echoes them. Collision-after-normalization now throws (Codex catch). 383/383 tests.
**Why:** Andrew: "we need way more questions like what type of typography to use, what kind of spacing" — the interview was scope/voice-only.
**Pushed:** c760d4a

### Nexus AI demo + LinkedIn post example
**What:** Real interview run for nexus-ai (Andrew's answers), slop page (BLOCK — 14 block, 3 warn) vs binding-driven page (PASS — no findings), composed as demo/composite.png + demo/interview.png; example paragraph added to /tmp/drafts/2026-07-02-raven-taste-calibration-linkedin.md (2,623 chars).
**Why:** Andrew wanted the post to show the interview + without/with Raven on his portfolio prompt.
**Pushed:** demo artifacts live in scratchpad demo/; post draft in /tmp/drafts.

## State at end of session
- design_notes feature: committed + pushed (c760d4a) ✓ — NOT released; ships with next release
- LinkedIn post + 2 images: awaiting Andrew's review ✓
- Pending (carried forward): corpus growth to ~150-300 records for local judge; VOICE-rule demotion question on product surfaces; portfolio binding has no hosts

## Session (continued, post-compaction)
### Warm-palette do-over (light page)
**What:** Andrew: warm colors wrong for a startup → rebound nexus-ai color note to cool light ground + electric-blue accent, punctuation only (buttons/links/pills, never section fills). Rebuilt with-raven.html, re-audit PASS, recaptured with.png; interview.png + composites updated to match.
**Why:** Startup surface reads wrong in warm terracotta; interview answer corrected via AskUserQuestion.
**Pushed:** scratchpad artifacts only (not repo).

### Dark variant via fresh interview (nexus-ai-dark)
**What:** Real get_taste_interview rerun; Andrew's answers (near-black + same electric accent punctuation-only, grotesque tighter, ~96px airier rhythm, hairline-bordered panels, expressive motion w/ reduced-motion guard, dark product-UI imagery, terser voice) bound as nexus-ai-dark (no hosts, avoids url-mode conflict). Built with-raven-dark.html → audit_taste PASS (no findings). composite-3up.png (BLOCK/PASS/PASS) + post draft updated to the three-run story (2,687 chars).

### Three-options showcase page + link
**What:** Lookalike of the raven-demo case-study page (same #191A23/#5E6AD2 token system, scoreboard, dot-tagged frames with open↗ links, prompt cards, pipeline steps, interview table) at scratchpad demo/out/index.html, served via python3 http.server on 127.0.0.1:8787 (background, survives session, not reboot). Verified: 9/9 URLs 200, eyes-on full-page render (fixed frame-tag wrap misalignment), design-judge PASS, local-Codex devil's-advocate pass (broken-link objection refuted against live server).
**Link:** http://127.0.0.1:8787/out/index.html · files: /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/95c30ecc-9bde-4a30-b205-17134b4574c9/scratchpad/demo/

## State at end of session (updated)
- Showcase link live at http://127.0.0.1:8787/out/index.html ✓ (scratchpad + local server — offer stands to park it in portfolio repo / Vercel)
- LinkedIn draft /tmp/drafts/2026-07-02-raven-taste-calibration-linkedin.md (2,687 chars, 3-up story) + interview.png + composite-3up.png: awaiting Andrew's review
- Andrew's open choice: 2-up vs 3-up composite in the post
- nexus-ai + nexus-ai-dark bindings live in ~/.raven/taste/andrew.surfaces.json
- design_notes feature on main (c760d4a), unreleased — ships with next release on Andrew's go
- Pending (carried forward): local-judge corpus growth to ~150-300; VOICE-rule demotion on product surfaces; portfolio binding has no hosts
