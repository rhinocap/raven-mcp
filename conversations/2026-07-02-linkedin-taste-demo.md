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
