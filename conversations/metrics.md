# Metrics

Tracking collaboration quality across sessions. Updated every Revisit.

| Metric | Target | 2026-04-22 | 2026-06-18 | 2026-06-19 (v1.9.0) | 2026-06-19 (v1.10.0) | 2026-06-20 (changelog) | 2026-06-20 (site) | 2026-06-21 (cut-off fix) | 2026-06-21 (spacing + device-frame) | 2026-06-25 (site award) |
|---|---|---|---|---|---|---|---|---|---|---|
| First-attempt accuracy | 90% | ~85% | ~83% (10/12) | ~80% (8/10) | ~82% (14/17) | ~85% (5/6) | ~70% (14/20) | ~70% (screenshot 3×; AR fix partial) | ~75% (6/8 — screenshot blind + /tmp import) | ~82% (9/11 — bg-clip bug + video debug) |
| Push rejections | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Autonomy score | 90% | 85% | ~95% | ~95% | ~99% | ~99% | ~99% | ~99% | ~99% | ~88% (stop hook friction) |
| Round-trips per task | 1 | 1.3 avg | ~1.2 avg | ~1.4 avg | ~1.2 avg | ~1.2 avg | ~2.1 avg | ~1.8 avg | ~1.3 avg | ~1.5 avg |
| Tests passing | 100% | 100% (smoke) | 100% (85/85) | 100% (92/92) | 100% (185/185) | N/A | | 100% (191/191) | N/A (site work) |
| Log currency | Immediate | Delayed | Immediate | Immediate | Immediate | Immediate | Immediate | | Immediate | Immediate |

## Notes per session

### 2026-06-25 — Site award-grade pass (homepage + changelog)
- **Session scale:** Large — full-day `/goal` overhaul: 3×2 duotone video grid, Layout-2 hero typography, header CTA button, HighLvl-style changelog rebuild, container width unification, section-seam removal. 3 commits to prod (c316623, 1fb7f19, a221cef).
- **First-attempt accuracy ~82% (9/11):** Two misses: (1) `background:` shorthand reset `background-clip: text` → gradient text rendered as solid bars on first verify; fixed 1 round-trip. (2) Video `readyState:0` in backgrounded automation tab → ~3 rounds of diagnosis before Playwright `currentTime` probe definitively confirmed 12/12 playing. Both caught in the verify loop before any broken state shipped to prod.
- **⚠️ PENDING PROMOTION (blocked in headless):**
  1. **`background-clip` shorthand gotcha → CLAUDE.md Coding rules.** Rule: always declare `background-clip: text; -webkit-background-clip: text;` AFTER `background:` in gradient-text CSS. `background:` shorthand resets the clip to `border-box`, turning gradient text into solid bars.
  2. **Video playback verification → CLAUDE.md Testing rules.** Rule: Chrome suspends ALL media in backgrounded tabs (`document.hidden:true`). `readyState:0` in that context proves nothing — identical for playing and broken clips. Correct verification surface: Playwright in a real (non-backgrounded) page, reading `currentTime` after 2s wait. `gstack browse` backgrounded automation is not a valid video verification surface.
- **Autonomy gap:** Stop hook fired repeatedly because assistant offered layout/button options and waited for a pick rather than making a recommendation and implementing the non-pick-gated piece. Root cause: `/goal` said "interview for questions" — interview was done but the implementation loop re-entered an interview posture. Fix: once `/goal` interview answers are locked, make a recommendation with rationale and ship the highest-impact pick-independent piece immediately.
- **Wins:** `audit_content` used proactively and returned actionable result (14/14 pass → correctly did NOT over-edit clean copy). Background-clip bug and video readyState confusion both caught in the verify loop, never shipped broken. HighLvl changelog pattern ported in one pass (filter JS correct on first impl, confirmed programmatically). Section seam fix identified all 3 affected sections in one grep pass — no partial fix. Push rejections: 0.
- **Autonomy score ~88%:** Stop hook fired multiple times due to layout-pick hesitation; once recommendation was made + shipped, no further friction.
- **Round-trips:** ~1.5 avg. Video debug ~3, bg-clip fix ~2, all others 1.

### 2026-06-21 — Watch-grid spacing + audit_device_frame
- **Session scale:** Small-medium — 2 tasks via `/goal`→Workflow, 2 commits.
- **First-attempt accuracy ~75% (6/8):** Two misses: (1) Screenshot captures blank — `opacity:0` reveal-on-scroll + headless non-autoplay video → forced `.reveal` visible + killed transitions. Known capture-artifact class, re-confirmed. (2) `/tmp/df-smoke.mjs` failed importing `../../dist/device-frame.js` — `ERR_MODULE_NOT_FOUND`. Fixed in 1 step (absolute path + project-root run). **This is the 3rd consecutive session** this exact failure fires (2026-06-19 `@mcp` imports, 2026-06-20 playwright ESM, 2026-06-21 dist/ path). Rule exists in session notes only — NEVER reached CLAUDE.md or a loaded memory.
- **Communication gap:** Shared the immutable deploy URL but not the stable `-git-<branch>-` branch-alias URL after pushing. Andrew had to ask "Is the grid vertical spacing live on the previous Vercel link?" — proactive one-liner at completion would have prevented this.
- **⚠️ REPEAT OFFENDER — MUST PROMOTE in next interactive session (blocked in headless):**
  1. **`/tmp smoke script import` → CLAUDE.md Testing rules.** Rule: Node.js scripts that import project `dist/` or local packages must run from the project root, not `/tmp`. ESM module resolution walks up from the script file — `/tmp/foo.mjs` importing a relative path to `dist/` or a bare `@pkg` has no `node_modules` on the lookup chain. Use absolute dist/ path OR run from project dir.
  2. **Vercel branch-alias URL → CLAUDE.md + project memory.** Rule: After any Vercel push for review, always include the `-git-<branch>-` alias URL (stable, auto-updates each push) alongside the immutable deploy URL. The alias is the bookmark to share; the immutable URL goes stale on the next push.
- **Wins:** `/goal`→Workflow executed perfectly. Codex built `src/device-frame.ts` (761 lines) + tests (214 lines) first attempt; independent Claude verifier recomputed the geometry+motion math — guards against a self-consistent wrong impl+test pair. 191/191 tests (full suite, 0 regression). Real-data smoke: pre-fix geometry → "cropped" top+bottom 2.4% ✓; current 16:9 cutout → "fits" 0.1% ✓; real clip → ~3.7% composition drift ✓. Deployed-URL verification (served-value check + eyes-on) before claiming done.
- **Autonomy score ~99%:** No AskUserQuestion calls. Andrew's only input was the Vercel link question (after completion).
- **Round-trips:** ~1.3 avg. Screenshot-blind + /tmp import each cost 1 extra step; everything else 1 round-trip.

### 2026-06-21 — Watch grid cut-off fix
- **Session scale:** Small-medium — 1 goal (phones + terminals cut off in #watch grid), 2 commits.
- **First-attempt accuracy ~70%:** Three misses: (1) macOS screenshot access: U+202F narrow-space + HEIC-as-.png + Bash sandbox → 3 attempts to read the capture. (2) AR fix (d81cc98): the `.mb-screen` 1.82 → 16:9 edit was real and needed, but was incomplete — didn't fix the source clips. Andrew returned "still cut off." (3) Fade band-aid prototyped before discovering the session-log PENDING item.
- **Root cause of accuracy misses:** Did not read the prior session log before starting. The 06-20 session log explicitly had "re-cut clips from raw source" as PENDING — the complete answer. A 2-minute read would have collapsed the entire session to one pass.
- **Wins:** Once directed to the source, re-cut all 6 clips from 4K master in one clean pass. Union crop works across all 6 beats despite varied simulator layout. A/B/C demo page chose right craft call. Three-level verification. Proactively flagged personal email in terminal. Queued spacing task in 3 persistent places.
- **Rule to promote (next interactive session):** "Read the ongoing-feature session log before any diagnosis — PENDING items are the unresolved root causes." → `~/.claude/CLAUDE.md` near "reuse what worked."
- **macOS screenshot pattern:** Memory written (project-scoped). Needs to move to global `~/.claude/memory/`.

### 2026-06-20 — Watch-it-work grid + RavenMCP site audit
- **Session scale:** Very large — `/goal` to update marketing site with all new tools + build a feature grid matching portfolio+HighLvl references. Full brand audit via Raven. Multiple full redesigns of the Watch section.
- **First-attempt accuracy ~70% (14/20):** Worst session on record. Failures: (1) Ken Burns zoom re-introduced when doing the full-res recut pass (cut from sizzle-reel.mp4 instead of RavenReelRawmp4.mp4 — exact violation of "reuse what worked"). (2) Layers grid 4-wide orphan — fixed tools-grid but never audited sibling grid with the same pattern. (3) Videos black on XDR — VP9/webm-first path cleared the poster while buffering; needed mp4-only + CSS poster bg. (4) Verified layout at 2560px Playwright while XDR runs wider — stranded text and orphan invisible to my checks. (5) Didn't run Raven audits before building Watch layout — ran them only after Andrew called it out ("did you use RavenMCP or eyeball it?"). (6) 25 unique spacing values (Raven confirmed).
- **Root pattern:** Every failure this session was an existing CLAUDE.md rule that wasn't applied. No new rule gaps — pure habit execution failure.
- **New rule identified (not yet in CLAUDE.md — blocked in headless):** "For lazy-loaded autoplay video: mp4/h264-only source; poster as CSS background-image behind the screen container." Next non-headless session must promote this.
- **Wins:** Brand profile created (0→1), 55-tool taxonomy (3 acts, 11 sub-groups), true WCAG parent-chain compositing (78 reported fails → 0 true fails), full-res clips from 4K raw source (1280×720→1920×1080), design system reference page, alternating rows layout.
- **Autonomy score ~99%:** Andrew drove direction via corrections; zero unnecessary permission-seeking.
- **Round-trips ~2.1:** Watch section alone went through 5 full redesign cycles (grid → alternating → full-bleed → XDR-corrected → post-Ken-Burns). Raven-first would have cut this to 2.

### 2026-06-20 — Changelog catch-up + release skill fix
- **Session scale:** Small — 1 task (site changelog catch-up, release skill gap closure).
- **First-attempt accuracy ~85% (5/6):** Diagnosis, HTML entry authoring, collision check, push, live-URL verify all clean on first attempt. One miss: initial render script (inline ESM) failed with `ERR_MODULE_NOT_FOUND`; recovered in 1 step via project-installed `playwright`. Follows the "/tmp ESM import" lesson from Jun 19 but in a slightly different context (inline script rather than `/tmp`).
- **Root cause found + fixed:** `site/changelog.html` lagged 5 releases behind (stuck at v1.6.1/May 29) because the release skill had no step to update it. The manual "Update changelog" commit was dropped during the rapid Jun 18–19 burst. Fixed by: (1) adding the 5 missing entries, (2) adding mandatory Step 1b + done-gate to the release skill.
- **Wins:** Live URL verified (`curl` polling loop until `v1.10.0` appeared); collision check (1 commit ahead of origin, no parallel instance conflict); release skill now has a structural gate so this can't silently drift again.
- **Autonomy score ~99%:** Andrew asked one question, assistant diagnosed and fixed everything autonomously.
- **Round-trips:** ~1.2 avg. Only the render-script failure cost an extra step; everything else was 1 round-trip.

### 2026-06-19 (v1.10.0) — Layer 1 gap-fill
- **Session scale:** Large — 8 backlog items triaged (3 verified-as-already-shipped, 5 built), v1.10.0 released. Net: 185/185 tests (+29 from 156).
- **First-attempt accuracy ~82% (14/17):** Five new modules + ios preflight fix + release all clean first attempt. Three misses: (1) Workflow output parsed `d['results']` — actual key was `result` (REPEAT: third consecutive session; rule exists in CLAUDE.md but habit compliance fails). (2) Edit without prior Read on `index.ts` and `manifest.json` (each rejected once). (3) Subagent-authored `checkSnapshotWiring` returned `ready:false` with empty `guidance[]` for no-test-targets boundary case — required follow-up fix + test.
- **REPEAT-OFFENDER flag:** Workflow key mismatch (`results` vs `result`) has now fired in 3 consecutive sessions. Rule "Probe workflow/agent output shape before parsing" IS in CLAUDE.md (loaded surface). This is habit compliance, not rule-gap — no re-promotion needed; flagged here for awareness.
- **Major win:** Gap analysis prevented rebuilding 3 already-shipped tools — upfront code-read (index.ts + image-diff.ts + grep) proved adversarial_verify, before/after diff, and interactions[] were all shipped in v1.9.0. Saved ~3 agents + avoided duplicate registrations.
- **New pattern:** When a subagent authors a gating function (`ready`, `passed`, `ok`), always probe the boundary case where the gate fires but the human-facing output (`guidance[]`, `issues[]`) is empty — that's the silent-failure mode.
- **MCP smoke /tmp lesson:** ESM bare imports (e.g. `@modelcontextprotocol/sdk/...`) don't resolve from `/tmp` (no `node_modules` on lookup path). Write smoke scripts inside the project repo dir.
- **Autonomy score ~99%:** Zero AskUserQuestion calls. Andrew's only input was "Push it and release" — a one-line human gate for an outbound action, not an autonomy failure.
- **Round-trips:** ~1.2 avg. Workflow key error + empty-guidance fix each cost 1 extra; everything else was 1 round-trip.

### 2026-06-19 (v1.9.0) — Layer 0 audit_url
- **Session scale:** Large — Layer 0 `audit_url` full build + v1.9.0 release.
- **First-attempt accuracy ~80% (8/10):** Core build (extraction, orchestrator, capture changes, registration) all tsc-clean on first attempt. Two failures: (1) sliced-image fixture — base64 from subagent was corrupted in transit, case 4 failed first probe; fixed by re-deriving from disk via script. (2) Portfolio ledger push — collision from another instance moving origin/main; resolved via isolated worktree but needed 2 extra round-trips + one heredoc retry (shell variable expansion issue).
- **Speed misses:** Probe script import path (1 extra round-trip, trivial). Shell heredoc variable expansion in eval context ("bad substitution") required writing script to file.
- **Wins:** Fan-out Explore agents (index.ts map, test-harness map, deployed-URL finder, image generator) all delivered on first request. `page-checks.ts` extraction preserved exact `audit_page` behavior — full suite 92/92 green unchanged. All 6 acceptance classes caught; real-world run confirmed. Release ran clean (automation token, one-command).
- **Autonomy score ~95%:** Zero AskUserQuestion calls; single "keep going" from user when session paused (not an autonomy failure — session paused correctly while subagents settled).
- **Round-trips:** ~1.4 avg. Driven by the two failure cases above; core build was 1 round-trip each.

### 2026-06-18 (follow-up: two-followups)
- **Session scale:** Small — 2 follow-up tasks from the morning session.
- **First-attempt accuracy ~80%:** Follow-up 1 (docs softening) clean first attempt. Follow-up 2 (MacroUITests) took 6 build iterations — workflow agent chose wrong product type (`ui-testing` vs hosted `unit-test`), then SPM pbxproj-inheritance issues, then `_Testing_Unavailable` alias.
- **Accuracy miss:** Build #2 false pass — MacroTests aborted early; absence of errors for a target is NOT confirmation it compiled. Need to check produced artifacts. **Rule pending promotion to ~/.claude/CLAUDE.md (not done in this headless session).**
- **Token leak:** Docs-grep-verify leg inside the workflow ran on haiku; local-eligible per the HARD RULE already written.
- **Wins:** Clean collision check + fast-forward push; pre-existing MacroTests CLI breakage correctly identified as out-of-scope; stale sim-runtime rule softened correctly.
- **Autonomy score ~90%:** 2 AskUserQuestion calls (product-type architectural fork, push) — both genuine gates.

### 2026-06-18
- **Session scale:** Largest single session to date — 12 discrete tasks, 4 Raven phases (12 new source files), 11 global skills, 1 npm release, 1 cloud routine. raven-mcp went from v1.6.2 → v1.8.0 in one session.
- **Speed misses (2):** (1) npm release: EOTP → passkey 404 → automation token required ~4 round-trips; now captured in release skill. (2) `sed` batch silently no-oped on skill rename — had to re-run with inlined paths.
- **Accuracy miss:** Claimed "auto-save hook commits" when it hadn't fired — wrong. Always `git status` before claiming committed state.
- **Staleness catch:** CLAUDE.md rule "Apple ships no iOS 26.x sim runtime" is factually wrong on this machine (26.4+26.5 present). Flagged as a follow-up.
- **Wins:** 100% workflow success (all 4 Codex fan-out workflows built correct code on first attempt); Phase 4 test agent even caught + fixed a real prefix-ordering bug it wasn't asked to hunt. Automation token now in place — future releases are one-command. Eyes-on device verification on a real paired iPhone (build 75 CFBundleVersion read-back).
- **Autonomy score ~95%:** Asked exactly one AskUserQuestion (workflow vs autonomous for the 4 phases); waited on Andrew only for npm passkey (correctly, since it's an interactive auth step) and two "merged/logged in/saved" confirmations that were genuinely his to do.

### 2026-04-22
- **Autonomy miss (−5%):** generated a paste-prompt when Andrew asked me to "use Raven" directly. Should have defaulted to running the tool.
- **Accuracy miss (−5%):** guessed "last week" on narrative timing instead of asking.
- **Wins:** flagged RavenAI conflict risk upfront (validated when cowork reversed); OIDC Trusted Publishing elimination of EOTP friction; backfill attempt even though it couldn't find anything; single-screenshot-above-the-fold specimen layout for the trademark.
- **Log currency improvement:** session log was touched only at compaction + end-of-day. Should update inline after each major commit per global CLAUDE.md rule.
