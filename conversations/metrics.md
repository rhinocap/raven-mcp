# Metrics

Tracking collaboration quality across sessions. Updated every Revisit.

| Metric | Target | 2026-04-22 | 2026-06-18 |
|---|---|---|---|
| First-attempt accuracy | 90% | ~85% | ~83% (10/12 tasks) |
| Push rejections | 0 | 0 | 0 |
| Autonomy score | 90% | 85% | ~95% |
| Round-trips per task | 1 | 1.3 avg | ~1.2 avg |
| Tests passing | 100% | 100% (smoke tests for content tools) | 100% (85/85 pass) |
| Log currency | Immediate | Delayed — logged only at end of day | Immediate (per-phase commits) |

## Notes per session

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
