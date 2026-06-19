# Metrics

Tracking collaboration quality across sessions. Updated every Revisit.

| Metric | Target | 2026-04-22 | 2026-06-18 | 2026-06-19 |
|---|---|---|---|---|
| First-attempt accuracy | 90% | ~85% | ~83% (10/12 tasks) | ~80% (8/10 tasks) |
| Push rejections | 0 | 0 | 0 | 0 |
| Autonomy score | 90% | 85% | ~95% | ~95% |
| Round-trips per task | 1 | 1.3 avg | ~1.2 avg | ~1.4 avg |
| Tests passing | 100% | 100% (smoke tests for content tools) | 100% (85/85 pass) | 100% (92/92 pass) |
| Log currency | Immediate | Delayed — logged only at end of day | Immediate (per-phase commits) | Immediate |

## Notes per session

### 2026-06-19
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
