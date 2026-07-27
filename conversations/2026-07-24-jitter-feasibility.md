# Session — Jitter-in-Raven feasibility (/goal, 2026-07-24)

## Where we left off
Prior segment: Lenis scroll root-cause landed (`4174bfa`); main clean at v2.2.0.

## This session
**What:** /goal feasibility study — can RavenMCP provide Jitter-equivalent (motion-design) functionality. Research-only, no implementation.
- Workflow `wf_e5cf4e96-5f3`: 2 legs — Jitter web research (Sonnet, cited), raven-mcp + HyperFrames motion inventory (Codex, report-only).
- Open-weight benchmark: same synthesis subtask run on GLM 5.2 ($0.0088, 32s, quality 7.5 self-judged) vs Fable main-loop (8.5); 2 rows appended to `conversations/openweight-scoreboard.jsonl` (now 10).
- Sol adverse (report-only): FLAWED-10. Key corrections absorbed:
  - `REMOTE_GATED_TOOLS` (src/index.ts:1848) is a **denylist** — any new tool is remote-exposed by default and changes the frozen anon-45 hash unless explicitly gated. "Additive = safe" was wrong as stated; safety is an implementation obligation + regression test, not automatic. (Verified by grep.)
  - Motion **creation** tools inside OSS Raven contradict the locked boundary "creation surface lives in Morven, not here" — pursuing this requires Andrew's explicit boundary reversal, or the tools land in Morven.
  - Lottie is the only remaining **export-format** gap; the larger gap is that no integrated compose→render→audit workflow exists at all (that's what the proposed tools would build). Several capability rows downgraded EXISTS→PARTIAL (Figma import fidelity, tokens→timelines, agent-authored presets).
  - Feasibility rests on **static inventory only** — no operational render/Figma-import/alpha test was run; "under a minute" unbenchmarked; Figma paths need a token (not zero-credential).
  - "Jitter has no API" stays UNVERIFIED-negative, not categorical.
- design-judge on the report copy: PASS (no findings).
- prioritization-judge: **DEFER 17/30** (0 block; warns: EVID-measured-not-assumed, EFFORT-honest, SEQ-dependencies). Backlog `idea_5` updated with score + findings.

**Why:** Andrew asked whether Raven could own Jitter's job. Verdict: the ecosystem (HyperFrames as renderer + Raven as taste/token layer) plausibly covers most of Jitter's surface agent-natively — and Jitter has no headless surface at all — but it's a DEFER on demand-signal, boundary, and sequencing grounds.

**Pushed:** nothing. Files touched: `.claude/linear-backlog-queue.jsonl` (idea_5), `conversations/openweight-scoreboard.jsonl` (+2 rows), this log. Committed locally only if auto-save fires; not pushed by me.

## Mistakes / Lessons
- Drafted "additive tools don't touch the frozen surface" from memory of the `audit` precedent; Sol caught that the gate is a denylist requiring explicit action per tool. Lesson: re-grep the gating mechanism before asserting surface-safety, even for a pattern used before.
- Drafted motion-creation tools into OSS Raven despite the ground-truth boundary line; the boundary check belongs in the spec step for any new-capability proposal, not the adverse step.

## State at end
- Feasibility report delivered in chat; full record here. idea_5 = DEFER 17/30 in backlog, unsynced to Linear.
- If Andrew wants to proceed anyway, the pre-work is: (1) his boundary call (Raven vs Morven), (2) one cheap demand check, (3) an operational spike — one real Figma frame → HyperFrames render via a prototype runner.
