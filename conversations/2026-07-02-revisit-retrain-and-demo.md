# Session: 2026-07-02 — headless /revisit (v1.14.0 retrain + design_notes/Nexus demo delta)

## Where we left off
An earlier same-day headless revisit (`4f2e0b0`) covered only the taste-tools-overview + local-judge diagnosis transcript it was handed. Two later segments of the same 48-hour arc — (1) the v1.14.0 release + local-LoRA-judge label-bug fix/retrain/regrade, and (2) the design_notes interview feature + full Nexus AI LinkedIn demo (slop/light/do-over/dark/showcase) — had per-instance session logs on disk but no `metrics.md` / `ideas-and-innovations.md` entries yet. This run closes that gap.

## Revisit — 2026-07-02

### Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Built the "with-Raven" Nexus demo page from an existing binding instead of running the real `get_taste_interview` — the interview is the feature being demoed. Andrew: "You haven't interviewed me, though." | Accuracy/process gap | Already promoted — "Taste calibration at project KICKOFF" HARD RULE in `~/.claude/CLAUDE.md` (dated 2026-07-02), added via direct interactive edit same day. No PROMOTION-QUEUE entry needed. |
| `map_verdict()` silent PASS fallthrough for an unrecognized verdict scheme, mistraining ~11 authored violation examples with the opposite label. | Accuracy gap (data pipeline) | Already in `conversations/PROMOTION-QUEUE.md` `## Open` as `exhaustive-verdict-mapping-audit` (added 2026-07-02, prior revisit run). No duplicate added. |
| Corrupted-record count off by one (12 claimed vs 11 actual) and stale "0% FP" trust language left in `judge.py`'s docstring after the labels were found corrupted. | Accuracy gap (minor) | Caught and fixed by the Codex devil's-advocate pass before the "done" claim shipped — no promotion needed, this is the adversarial-verify HARD RULE working as intended. |

### Metrics
See `conversations/metrics.md` — two new columns added: "2026-07-02 (v1.14.0 + local-judge retrain)" (~90% first-attempt accuracy, 9/10) and "2026-07-02 (design_notes + Nexus demo + showcase)" (~80%, 8/10 — the interview-skip miss).

### Running totals
- Push rejections: 0 (unchanged, clean streak holds across the whole 2026-07 arc).
- Promotion queue: still 5 Open items, unchanged by this run (headless — cannot clear; a manual `/revisit` is required). No new cross-cutting items surfaced by this delta beyond what's already queued or already promoted.

### Ideas flagged
- Local judge model: still NOT READY (class/token-mass imbalance, not the fixed labeling bug). Next lever is corpus growth from real `label_finding` accepts, not more synthetic authoring.
- Taste Engine (per-surface calibration, `design_notes`, kickoff interview) moved from "Ideas to explore" to "Innovations shipped" in `ideas-and-innovations.md` — fully live as of v1.14.0.

### What would help you go faster
- When demoing a feature whose core mechanic is "ask the user a real question," build a checklist step that literally says "did I call the real tool with the real user, or reuse a prior artifact?" before building the comparison page — the interview-skip miss was avoidable with a one-line self-check.

## RavenMCP opportunity scan
No new opportunities — the two relevant scans ("Nexus taste demo: do-over, dark binding, showcase page" and "taste tools overview + local judge diagnosis") are already captured in `.claude/raven-opportunities.md` (entrance-animation settle P1, fenced-code ingest P2, rule-scoping P2) via the prior `/save-context` run (commit `5f8b3c7`). Verified present, no duplicates added.

## State at end of session
- `metrics.md`: updated with 2 new session columns + narrative notes ✓
- `ideas-and-innovations.md`: Taste Engine moved to shipped, 2 new session retrospectives added ✓
- `conversations/PROMOTION-QUEUE.md`: unchanged (5 Open, headless run cannot clear) ✓
- `.claude/raven-opportunities.md`: verified current, no changes needed ✓
- HTML report: `conversations/revisit-reports/2026-07-02.html` (this run)
- Pending (carried forward): local-judge corpus growth to ~150-300 real accepts; VOICE-rule demotion question on product surfaces; `andrew` BRAND.md taste profile rebuild decision; portfolio binding has no hosts; PROMOTION-QUEUE.md's 5 Open items still await a manual `/revisit` to land in `~/.claude/CLAUDE.md`/memory.
