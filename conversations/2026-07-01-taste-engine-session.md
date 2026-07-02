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
| Dogfood step 2 sent Andrew to BRAND.md for profile creation — mythology doc yielded 11 noise rules; parser also produced stopword categories ("The"/"Why") and would ingest bullets inside code fences | Accuracy gap | Before recommending a doc for markdown ingestion, always confirm it is rules-shaped (actionable bullets under category headings); parser must skip stopwords in headings and fenced code blocks |

### Post-dogfood fixes (Andrew's BRAND.md ingest feedback)
**What:** parseMarkdownRules skips fenced code blocks + categoryFromHeading skips stopwords ("### Why it works" → category "works", not "why"); extractBannedTerms gated behind a vocabulary-cue check so descriptive example lists ("facts (counts, scope)") no longer become banned-word scans (was false-firing on "counts"/"video" against real pages); create_taste_profile description now warns markdown ingest needs rules-shaped docs. Rebuilt ~/.raven/taste/andrew.json from design-judge DESIGN-RULES.json (37 rules) + design-corpus.jsonl (31 precedents), replacing the 12-rule mythology-noise profile.
**Why:** Andrew's dogfood step 2 pointed at BRAND.md (story doc) and exposed all three parser weaknesses at once.
**Pushed:** NOT pushed — staged on local main.

### Qwen LoRA design-judge pre-filter — graded + wired (Andrew's ask)
**What:** First on-record grade.py run on both adapters (venv + mlx-lm installed at training/.venv): final step-80 = recall 88.9% / FP 83.3% NOT READY; conservative-ck20 = recall 33.3% / FP 0% NOT READY. Results recorded in training/GRADE-RESULTS.md. Wired the only licensed mode into design-judge SKILL.md §3b: punt-only pre-pass via new training/judge.py (defaults to ck20) — trust BLOCK/WARN/NIT (0% FP), route DELEGATE_RAVEN, punt PASS/UNKNOWN to frontier; a local PASS never clears. Smoke: fresh artifact → UNKNOWN (punts); memorized artifact → PASS (punts). Honest state: near-zero savings until train.jsonl grows to ~150+ records.
**Why:** Andrew: "WE should wire this model in" — trained 2026-06-28 but never graded or integrated.
**Pushed:** lives in ~/.claude/skills/design-judge/ (not this repo).

### Codex devil's-advocate pass #2 (Qwen wiring) — 6 MUST-FIX, all dispositioned
**What:** (1) judge.py omitted the "Category hint:" line when --category absent (every training record has it) → default "other", line always emitted — fix improved real behavior: fresh gradient artifact now flags WARN/COLOR-no-gradient-no-glow instead of UNKNOWN; (2) load diagnostics polluted stdout → redirected to stderr, stdout is response + LOCAL_VERDICT only; (3) grade.py's lenient extract_verdict could promote malformed output ("BLOCKISH", "FINDING:…BLOCKED") into trusted verdicts → judge.py now uses strict whitelist-only strict_verdict (8/8 attack cases → UNKNOWN); (4) SKILL.md §3b guard didn't absorb inference errors → rewritten as OUT capture with `|| UNKNOWN` fallback, error path verified; (5) `source: "local-lora"` contradicted Step 5 schema → added to allowed sources; (6) "when it flags, it's right" / "never adds false alarms" overstated n=6 → softened with provisional caveat inline in SKILL.md + GRADE-RESULTS.md. Notes: README-distill stale counts fixed (90 records, 62/13/15 splits); smoke results now on record in GRADE-RESULTS.md.
**Why:** required devil's-advocate gate before the done claim; all 6 were real.

## State at end of session
- Part A: 6 branches landed + deduped docs ✓ (staged on local main, unpushed)
- Taste Engine: implemented, wired, tested, smoked ✓ (staged, unpushed)
- Post-dogfood parser fixes + andrew profile rebuild ✓ (370/370 tests, commit 5869cdf)
- Qwen LoRA pre-filter graded (NOT READY ×2) + wired punt-only into design-judge SKILL.md §3b ✓
- Handoff: conversations/2026-07-01-taste-engine.md ✓
- Pending (carried forward):
  - `/release` (suggest v1.13.0 — 7 [Unreleased] bullets) after Andrew's go
  - faux-font detection via rendered metrics (currently not_assessed)
  - site/index.html violates BRAND.md monochrome rules heavily (smoke signal; site loop owns it)
