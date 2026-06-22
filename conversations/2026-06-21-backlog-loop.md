# Session: 2026-06-21 — autonomous backlog /loop + release prep

# Session: 2026-06-21/22 — autonomous backlog /loop + release prep

## Where we left off
v1.12.0 staged on local `main` awaiting Andrew's "go" to publish; backlog `/loop` running via session ScheduleWakeup (does NOT survive /clear). Durable record: memory `project_v1_12_0_staged_and_parked_branches.md`.

## This session
### Backlog /loop — run N+1: shipped `audit_consistency` (#1 this run, open issue #9)
- `feat/audit-consistency` (`1db1af1`, off `origin/main`) — NEW `audit_consistency` MCP tool: takes ≥2 pages, flags cross-page divergence in container width + hero heading tier (the relational defects single-blob audits miss). Infers modal canonical value or honors `container_token`/`hero_token`; handles Tailwind classes (`text-display-xl`, `container-wide max-w-3xl`) AND declared px. Pure, reuses `audit-container.ts` `containerScaleWidths`; **audit-container.ts + page-checks.ts untouched**. Tool 56→57. 14 tests (issue-#9 fixtures); suite **224/224 green**. Reviewer PASS. Fixed 1 NIT (no-modal tie → `source:"none"` for field consistency) + 1 message bug (class signature no longer rendered as `container-widepx`). Eyes-on: changelog flagged on BOTH dimensions, consistent corpus → 100/A.
  - **Issue #9 now fully addressed**: fix-1 (corpus mode) shipped THIS run; fix-2 (project-token grounding) + fix-3 (reframe responsive/max-width) already shipped earlier via `auditContainerWidth`/`containerMaxWidth`. #9 is closeable once these land on `origin/main` (NOT closing the GH issue now — branch unpushed).

### Backlog /loop — run N (post-/compact): shipped `score_page`
- `feat/score-page` (`118a0ed`, off `origin/main`) — NEW `score_page` MCP tool: per-category 0-10 design scores (7 namespaces) from `runPageChecks`, no browser, **page-checks.ts untouched**; mirrors audit_page overall score/grade; weakest_category; honest not_assessed [brand,conversion,motion]. 38 tests; suite 248/248 green on that branch. Reviewer PASS. UNPUSHED. (Session log for that run committed on the feat/score-page branch @ 9d34cd2.)

### Backlog /loop — earlier: shipped 4 items (each spec → fan-out → reviewer → test → commit), all UNPUSHED branches
- `fix/contrast-ancestor-composite` (`263046b`) — audit_contrast composites the true ancestor bg stack (P1 false-AA-fail bug)
- `feat/compact-response-mode` (`247734e`) — `compact:true` on audit_page/evaluate_design/audit_url
- `feat/contrast-remediation` (`1148c2b`) — new `suggest_contrast_fix` tool
- `feat/svg-color-compliance` (`e9dfa5e`) — new `tokens/svg-hardcoded-color` page-check
- `feat/dropdown-menu-pattern` (`201d2f5`) — `dropdown-menu.json` pattern, **Closes #1**

### Release prep (Andrew chose "Prepare, then ask me")
- v1.12.0 staged on local `main` (`7c2f40e`), merged first 3 branches, CHANGELOG → `## [1.12.0] - 2026-06-21`, dry-run confirms 1.12.0. **Awaiting "go"** to run `scripts/release.sh minor`.
- Reusable loop prompts: `.claude/loops/release-readiness.md` (prepare-then-ask) + `.claude/loops/marketing-site-sync.md`.

## State at end of session
- v1.12.0: STAGED on main, NOT pushed — awaiting Andrew's "go" ✓
- Post-v1.12.0 unpushed feature branches: `feat/svg-color-compliance`, `feat/dropdown-menu-pattern`, `feat/score-page`, `feat/audit-consistency`
- npm: still 1.11.0; origin/main: still b51d570 (nothing pushed)
- Pending (carried forward):
  - Publish v1.12.0 on Andrew's "go"
  - Land the post-v1.12.0 branches; close GH #9 (fully addressed) and #1 (dropdown) when they reach origin/main
  - Backlog loop continues (re-fire /loop, or convert to /schedule for durability)

## This session — backlog /loop (each: spec → 4-agent fan-out → reviewer → test → commit, all UNPUSHED off origin/main)
### Run N+2: `audit_video_playback` (#1, ledger P2 — "videos don't play")
- `feat/audit-video-playback` (`f57f41a`) — NEW `audit_video_playback`: renders page in chromium, observes whether each `<video>` currentTime ADVANCES (+readyState/networkState/error/paused), classifies playing|paused|stalled|empty|error. Catches black/non-playing videos static audits miss. Mirrors contrast.ts: pure `classifyVideoPlayback` + pure `auditVideoPlaybackSnapshot` (shared by both paths) + browser `auditVideoPlaybackUrl`; `url` OR `dom_snapshot`. capture/contrast/page-checks untouched. Tool 56→57. 23 tests; suite **233/233**. Reviewer FAIL→fixed (dom_snapshot missing `url` field + no test for that path → extracted shared aggregator + 3 tests). Eyes-on: clip.webm→playing (Δt 0.2s), broken src→error.

### Run N+1: `audit_consistency` (#1, open issue #9)
- `feat/audit-consistency` (`1db1af1`) — cross-page corpus audit (container width + hero tier divergence). 14 tests; 224/224. **Issue #9 fully addressed** (corpus mode this run; token-grounding + max-width-reframe already shipped earlier). Closeable once landed.

### Run N: `score_page`
- `feat/score-page` (`118a0ed`) — per-category 0-10 design scores from runPageChecks. 38 tests; 248/248 on that branch.

### Earlier runs: 5 items (all UNPUSHED)
- `fix/contrast-ancestor-composite` (`263046b`), `feat/compact-response-mode` (`247734e`), `feat/contrast-remediation` (`1148c2b`), `feat/svg-color-compliance` (`e9dfa5e`), `feat/dropdown-menu-pattern` (`201d2f5`, Closes #1)

### Release prep (Andrew chose "Prepare, then ask me")
- v1.12.0 staged on local `main` (`7c2f40e`): merged first 3 branches, CHANGELOG → `## [1.12.0] - 2026-06-21`, dry-run OK. **Awaiting "go"** to run `scripts/release.sh minor`.
- Reusable: `.claude/loops/release-readiness.md` + `.claude/loops/marketing-site-sync.md`.

## State at end of session
- v1.12.0: STAGED on main, NOT pushed — awaiting "go" ✓
- npm: still 1.11.0; origin/main: still b51d570 (nothing pushed)
- Post-v1.12.0 unpushed feature branches: svg-color-compliance, dropdown-menu-pattern, score-page, audit-consistency, audit-video-playback
- Open-issue backlog now EMPTY (#9 + #1 handled on branches; close on land)
- Pending (carried forward):
  - Publish v1.12.0 on Andrew's "go"; then land post-v1.12.0 branches; close GH #9 + #1
  - Backlog loop continues (re-fire /loop, or convert to /schedule for durability). Remaining ledger candidates: ultra-wide XDR sweep (P2), grid-orphan detector (P3), intentional-miniature exemption (P2), Ken-Burns video-content (P3)

# Session: 2026-06-21 — autonomous backlog /loop + release prep

## Where we left off
v1.12.0 staged on `main` awaiting Andrew's "go" to publish; backlog loop running via session ScheduleWakeup (does NOT survive /clear).

## This session
### Backlog /loop — run N (post-/compact): shipped `score_page` (#1 this run)
- `feat/score-page` (`118a0ed`, off `origin/main`) — NEW `score_page` MCP tool: per-category 0-10 design scores (7 namespaces: structure/typography/color/spacing/a11y/responsive/tokens) from `runPageChecks`, no browser, **page-checks.ts untouched**; mirrors audit_page overall score/grade; weakest_category; honest not_assessed [brand,conversion,motion]. Tool 56→57. `src/score-page.ts` + 38 tests; full suite **248/248 green**. Reviewer: OVERALL PASS. Backlog source: raven-opportunities.md P1 (2026-06-21). Fan-out: implementer+test-author(sonnet), doc-updater(haiku), reviewer(sonnet). UNPUSHED.
  - Note: `scroll_settle`, custom viewport sweep, decorative/intentional categorization all found ALREADY-SHIPPED during the scan (ledger rows predate shipment) — not redone.

### Backlog /loop — shipped 4 items (each spec → fan-out → reviewer → test → commit), all UNPUSHED branches
- `fix/contrast-ancestor-composite` (`263046b`) — audit_contrast composites the true ancestor bg stack (was a P1 false-AA-fail bug)
- `feat/compact-response-mode` (`247734e`) — `compact:true` on audit_page/evaluate_design/audit_url (strips screenshots/principle bodies)
- `feat/contrast-remediation` (`1148c2b`) — new `suggest_contrast_fix` tool (minimal WCAG-passing color), 56→57 tools
- `feat/svg-color-compliance` (`e9dfa5e`) — new `tokens/svg-hardcoded-color` page-check (inline SVG icons hardcoding color)
- `feat/dropdown-menu-pattern` (`201d2f5`) — `dropdown-menu.json` pattern, **Closes #1** (grafted real UX-law refs from stale raven-bot draft `origin/knowledge/issue-1-*`)

### Release prep (Andrew chose "Prepare, then ask me")
- Merged the first 3 branches into local `main` (`7c2f40e`, ahead 6), combined CHANGELOG → `## [1.12.0] - 2026-06-21`, dry-run confirms 1.12.0, `npm whoami`=accunliffe. **Awaiting "go"** to run `scripts/release.sh minor` (passkey EOTP → `! npm publish` recovery, then marketing-site-sync).
- Created reusable `.claude/loops/release-readiness.md` (prepare-then-ask) — pairs with `marketing-site-sync.md`.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Authored dropdown-menu.json fresh instead of checking for the `knowledge/issue-1-*` draft branch first | reuse-miss | Check stale `knowledge/issue-*` draft branches BEFORE authoring a knowledge file (caught at collision gate, grafted the draft's correct UX-law refs) |

## State at end of session
- v1.12.0: STAGED on main, NOT pushed — awaiting Andrew's "go" ✓
- npm: still 1.11.0; origin/main: still b51d570 (nothing pushed)
- All 5 branches committed in git (durable across /clear)
- Pending (carried forward):
  - Publish v1.12.0 on Andrew's "go"
  - After v1.12.0 ships: svg-color-compliance + dropdown-menu become the next [Unreleased]
  - Backlog loop continues (re-fire /loop, or convert to /schedule for durability)

### Run +release (2026-06-22): v1.12.0 PUBLISHED
Andrew: "let's /release" = the go. Ran the release skill end-to-end on `main`:
- Preflight: clean tree, `npm whoami`=accunliffe (no E401), origin/main=b51d570 (no collision).
- Step 1b: added v1.12.0 `<article>` to `site/changelog.html` (was stalled at v1.11.0), committed `8a9e3f6`.
- `scripts/release.sh minor` → published `raven-mcp@1.12.0`, commit `b6e09ae`, tag `v1.12.0`, pushed. **No EOTP gate** (token valid).
- Verify: npm=1.12.0, tag pushed, live changelog page shows v1.12.0 (after ~30s Vercel deploy), local `dist/` rebuilt.
- npm: https://www.npmjs.com/package/raven-mcp/v/1.12.0
6 post-v1.12.0 branches still parked (cut off OLD base b51d570 — rebase onto b6e09ae before landing) = next release v1.13.0. GH #9/#1 close when their branches land.
