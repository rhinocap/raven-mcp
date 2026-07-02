# Session: 2026-07-02 — local judge label fix + retrain (taken over from paused instance)

## This session
### v1.14.0 released
**What:** Surface calibration + scoping + server instructions shipped to npm; changelog JSON + apex deployed + verified live.
**Pushed:** f26173d (changelog), 61d1abc (release), tag v1.14.0.

### Local LoRA judge — label bug fixed, retrained, regraded (work in ~/.claude/skills/design-judge/training/)
**What:** map_verdict() silently PASS-labeled 11 authored violations (BLOCK/WARN scheme from synthetic.jsonl; 8 train/2 valid/1 test) — fixed to handle both schemes and RAISE on unknown verdicts. Corpus regenerated (train violations 37→45, contamination-checked), retrained (val loss 3.128→0.194 monotone, log saved), all 4 checkpoints regraded: ALL NOT READY — step 20 flags nothing, steps 40–80 flag everything (100% FP). New root cause: class + token-mass imbalance (45v/11p). GRADE-RESULTS.md rewritten; SKILL.md §3b demoted local flags from trusted→hint-only (old 0% FP license was graded on corrupted labels — revoked); judge.py docstring + README-distill trued up; grade transcript persisted.
**Why:** Paused instance found the bug; Andrew asked this instance to run it. Codex devil's-advocate pass ran: falsified "12" (→11, one record was raven-owned), caught stale judge.py trust text — all dispositioned.
**Next lever:** grow clean/accept examples from real label_finding accepts (never more synthetic authoring).

## State at end of session
- v1.14.0 live on npm + ravenmcp.ai/changelog ✓
- Local judge: honest NOT READY, hint-only wiring, docs consistent ✓
- LinkedIn draft in /tmp/drafts (accuracy-corrected, PASS) — awaiting Andrew's inputs
- Pending: VOICE demotion question on product surfaces; corpus growth to ~150+ records
