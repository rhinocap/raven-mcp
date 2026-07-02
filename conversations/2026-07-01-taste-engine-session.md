# Session: 2026-07-01 (taste-engine instance)

## Where we left off
Fresh `/goal`: land 6 parked feature branches, then build the Taste Engine (5 new MCP tools modeled on the design-judge skill).

## This session

### Part A — landed 6 parked branches on main
**What:** score_page, audit_video_playback, audit_consistency, layout orphan-stretch, SVG color compliance, dropdown-menu pattern — rebased in an isolated worktree, ff-merged, build+test green after each (248→353 tests). CHANGELOG [Unreleased] deduped; README rows deduped (049ff6e).
**Why:** branches were cut from stale base b51d570; goal said land first, sequentially.
**Pushed:** NOT pushed — staged on local main per goal ("do NOT run /release").

### Part B — Taste Engine
**What:** src/taste.ts (pure logic: profiles, markdown ingestion, append-only precedent corpus, deterministic taste detectors, raven delegation via page_issues), 5 server.tool registrations + extractInsight cases in src/index.ts, test/taste.test.mjs (13 tests), README + CHANGELOG docs. Implementation by Codex via Workflow wf_2292d932-91e; Sonnet adversarial verifier confirmed 8 invariants (1 must-fix — missing glow test — fixed).
**Why:** portable, growable design judgment as first-class Raven tools; owner:raven rules reuse existing audit engines instead of re-implementing.
**Pushed:** NOT pushed — awaiting /release.

**Gates:** build green; 366/366 tests; 65 tools no dupes, clean boot; live smoke vs site/index.html (47 findings, all citing real rule_ids + line evidence, BLOCK verdict, suppression loop demonstrated); final report-only Codex devil's-advocate pass on the diff.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| `node smoke | tee | head` SIGPIPE-killed the smoke mid-run (suppression section silently missing) | verification | Never pipe a live smoke through `head`; write to file, then inspect slices |

## State at end of session
- Part A: 6 branches landed + deduped docs ✓ (staged on local main, unpushed)
- Taste Engine: implemented, wired, tested, smoked ✓ (staged, unpushed)
- Handoff: conversations/2026-07-01-taste-engine.md ✓
- Pending (carried forward):
  - `/release` (suggest v1.13.0 — 7 [Unreleased] bullets) after Andrew's go
  - faux-font detection via rendered metrics (currently not_assessed)
  - site/index.html violates BRAND.md monochrome rules heavily (smoke signal; site loop owns it)
