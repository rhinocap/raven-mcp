# Session: 2026-06-18 — two-followups

## Where we left off
Two follow-ups offered (not started) from the v1.8.0 HighLvl Raven phases: soften stale iOS 26.x sim-runtime rule in CLAUDE.md + skill, and wire Macro UITest target with AccessibilitySnapshot for e2e a11y-snapshot verification.

## This session

### Follow-up 1 — Soften stale "no iOS 26.x sim runtime" rule
**What:** Removed the false "iOS 26.x has no sim runtime" claim from CLAUDE.md:627 and audit-ios-motion-120hz SKILL.md (3 targeted replacements). New wording: "26.4/26.5 sims exist but render at 60Hz → structurally blind to ProMotion timing; device IS the repro." Device requirement preserved on the correct premise.
**Why:** Machine has iOS 26.4 + 26.5 runtimes; the original claim was factually wrong. The actual reason for device-first (60Hz sim blindness) still fully holds.
**Pushed:** N/A — changes in ~/.claude files (not this repo); workflow subagent handled

### Follow-up 2 — Wire Macro UITest target + AccessibilitySnapshot
**What:** MacroUITests hosted unit-test target wired into Macro.xcodeproj; AccessibilitySnapshotTests.swift (3 in-process a11y snapshot tests); MacroUITests.xcscheme (dedicated scheme, excludes broken pre-existing MacroTests); scripts/run-accessibility-snapshots.sh (verified invocation); INTEGRATION-NOTES.md (resolved state). SWIFT_ENABLE_EXPLICIT_MODULES = NO across all 8 build configs. TEST_HOST + BUNDLE_LOADER wired for hosted testing.
**Why:** Raven iOS Phase 1–2 capture needs AccessibilitySnapshot wired into a buildable Xcode target; e2e device-snapshot verification requires it.
**Pushed:** `06133c3` on HighLvl main → pushed to origin/main; logged to HIGHLVL_PUSH_LOG.md (`2026-06-19T05:43:46Z`)

**Build journey (6 iterations before green):**
1. Workflow agent created `com.apple.product-type.bundle.ui-testing` — architecturally wrong; AccessibilitySnapshot renders views in-process, UI-test bundles are out-of-process
2. `SWIFT_ENABLE_EXPLICIT_MODULES = NO` in pbxproj doesn't reach SPM package targets; requires invocation-level CLI override
3. Build #2 false "pass" — MacroTests failed early and aborted before the package compile was reached; "no AccessibilitySnapshot error" was a false negative
4. `ENABLE_TESTING_SEARCH_PATHS = YES` also doesn't reach SPM packages
5. `_Testing_Unavailable` force-alias in ui-testing bundles (Swift Testing disabled for that product type) — converted to `com.apple.product-type.bundle.unit-test` + TEST_HOST
6. MacroUITests dedicated scheme + invocation-level overrides → **TEST BUILD SUCCEEDED** ✅

**Final verification:** `MacroUITests.xctest` produced at `Macro.app/PlugIns/MacroUITests.xctest` with `.xctestrun`.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|------------|
| Workflow subagent wired AccessibilitySnapshot as `ui-testing` bundle — in-process renderer can't run in an out-of-process UI-test target | Accuracy gap | AccessibilitySnapshot/in-process snapshot libs MUST use hosted unit-test; project memory [[highlvl-accessibilitysnapshot-hosted-unit-test]] |
| Build #2: MacroTests failed early → AccessibilitySnapshot never compiled → read "no errors on AccessibilitySnapshot" as pass | Accuracy gap | A target "having no errors" in a multi-target build that failed early is a false negative — check for compiled ARTIFACTS, not absence of errors. **Promote to ~/.claude/CLAUDE.md** |
| `echo $?` after a subsequent command reset exit to 0 → falsely concluded "build succeeded" | Speed gap | Always `EXIT=$?` before any subsequent command when checking build exit codes |
| Docs-grep-verify leg ran on haiku inside workflow (local-eligible per HARD RULE) | Token leak | Local-free HARD RULE already in CLAUDE.md — this was a miss on an existing rule, not a new rule |

## State at end of session
- Follow-up 1 (docs softening): ✓ verified (grep confirms zero stale claims, correct wording in 3 locations)
- Follow-up 2 (MacroUITests + AccessibilitySnapshot): ✓ verified (TEST BUILD SUCCEEDED, bundle embedded in Macro.app/PlugIns/)
- HIGHLVL_PUSH_LOG.md: ✓ updated
- Collision check: ✓ fast-forward confirmed before push; zero file overlap with concurrent instance's commits
- Pending (carried forward):
  - Promote "multi-target build false negative" rule to ~/.claude/CLAUDE.md in next interactive session
  - MacroTests CLI breakage (pre-existing, no TEST_HOST) — separate follow-up if warranted
