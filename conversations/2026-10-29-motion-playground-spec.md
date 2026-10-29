# 2026-10-29 — Motion playground spec

Ask (Andrew): "Can you spec out how to include it in RAvenMCP as an animation playground?"
Answers: customer = Motion Lab's designer; surface = tool + site gallery (Recommended).

Done:
- docs/spec-motion-playground.md v0.1: `create_motion_playground` (stdio, gated, local-only write), port of Motion Lab validator/runtime into src/motion-playground + src/data/motion, SVG sanitiser, taste-in mapping + "Copy for Raven" taste-out, /motion site gallery, count changes 111→112 / gated 67→68, phases 1–4, open decisions.
- Feature override added to CLAUDE.md and AGENTS.md.
- Font licensing flagged: Untitled Sans cannot ship inside npm-generated files.

Pending: Sol report-only pass; vault copy; local commit (push needs Andrew).

## Current state (post-compaction)
- Spec citation fix: grab-bridge has no live-session accessor; spec now says Phase 2 adds `currentGrabSessionUrl()`.
- Vault copy refreshed after that edit.
- Sol report-only pass running; output in scratchpad `sol-playground.out`.
- Pending: disposition Sol hits, local commit (explicit paths), ask Andrew before push.

## Sol pass on spec v0.1 (2026-10-29)

Verdict: DOES NOT SURVIVE, 1 P1, 5 P2, 1 P3. All seven checked against source and confirmed; all fixed in v0.2 (spec Review log has the table).

1. P1: title went unescaped into the embed's HTML comment (Motion Lab `src/keyfob/template.html:519` has the same bug; the published artifact is not exploitable because its title is fixed). Title kept out of comments; adversarial export test added.
2. P2: `TOOL_ACCESS` has only readOnly/destructive. Now `destructive`, not in `TOOL_LOCAL_ONLY_WRITE`, annotations asserted.
3. P2: `allow-clipboard-write` is not a sandbox token. Copy is parent-mediated over postMessage with source/origin/shape checks, clipboard read-back, fallback field.
4. P2: clamp ignored step. Order: overrides, taste, clamp, round up to step, range check (error above max), revalidate. Example 1165 to 1200.
5. P2: "no bounce" mapped to Firm, which still oscillates. Now damping ratio at least 1, or a warning; simulation test.
6. P2: Copy for Raven payload used a `chosen` field `record_taste_decision` does not have. Real schema, profile/project carried or asked for, moved to phase 2 with its test.
7. P3: customer section named only the indie dev. Both lenses named.

Counts unchanged from v0.1: stdio 111 to 112, gated 67 to 68, reconciliation 112 to 113.

Open for Andrew: push approval; fix Motion Lab `embedCode()` comment injection; optional settleTime clamp in the Motion Lab playground.
