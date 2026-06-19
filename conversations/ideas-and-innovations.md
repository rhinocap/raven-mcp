# Ideas & Innovations

## Innovations shipped

- **MacroUITests + AccessibilitySnapshot target** (2026-06-18, HighLvl) — hosted unit-test target wired in Macro.xcodeproj with AccessibilitySnapshot 0.11.0 + SnapshotTesting 1.19.2; dedicated MacroUITests.xcscheme; `scripts/run-accessibility-snapshots.sh`. Resolves Xcode 26.5 explicit-modules incompatibility via `SWIFT_ENABLE_EXPLICIT_MODULES = NO` at invocation level. Commit `06133c3`. Unlocks e2e a11y-snapshot verification for Raven iOS Phase 1–2 capture.
- **iOS audit roadmap (Phases 1–4)** (2026-06-18, v1.8.0) — device-capable iOS capture orchestrator + interactions/freeze-frame + `audit_parity` + `audit_ios_a11y` + `audit_contract` + `audit_api_contract`. 12 new source files, 85/85 tests, all verified on real hardware.
- **`audit_page interactions[]`** (2026-06-18, v1.7.0) — native Playwright hover/click/focus before screenshot; the theme-toggle white-wash bug class is now photographable. Verified eyes-on: 99.8% wash captured.
- **`audit_asset_integrity`** (2026-06-18, v1.7.0) — bottom-strip luminance variance detects sliced PNG exports that pass ratio math. Catches the "Figma export ended mid-form" failure class.
- **npm automation token + `release` skill** (2026-06-18) — frictionless one-command releases via `scripts/release.sh`; full runbook with EOTP/passkey recovery captured in `.claude/skills/release/SKILL.md`.
- **11 permanent global skills** (2026-06-18) — attention-animation-harness, parity-visual-verify, parity-audit-workflow, integration-surface-checklist, sync-contract-guard, whoop-clock-guard, whoop-api-probe, ios-device-build, play-upload-sideload, audit-ios-motion-120hz, ios-a11y-gate. Each replaces a per-session reinvention.
- **Cloud routine: 90-day token rotation reminder** (2026-06-18) — fires 2026-09-16T16:00Z, emails via Gmail.
- **Content design systems layer** (2026-04-22, v1.2.0) — 5 brand voice systems + 11 UX-writing principles + 4 content patterns + 4 new tools. Shipped from one prompt in ~6 hours.
- **In-server daily digest + launchd agent** (2026-04-19) — local-only usage digest delivered at 18:00 daily.
- **Passive usage-insight logging** (2026-04-17) — privacy-by-construction local log (`~/.raven/usage.jsonl`), never leaves machine.
- **OIDC Trusted Publishing for npm** (2026-04-22) — eliminates long-lived NPM_TOKEN + EOTP friction permanently.
- **Single-viewport trademark specimen** (2026-04-22) — install command moved into hero CTA row so one screenshot captures wordmark + install command for USPTO Class 009.
- **External-share draft-to-Zed workflow** (2026-04-22) — global rule: drafts for external surfaces land in `/tmp/drafts/*.md` and open in Zed for style-intact copy-out.

## Ideas to explore

### Raven product
- Submit to MCP registry on modelcontextprotocol.io
- Add `content/` coverage to the Sunday self-audit so recurring UX-writing gaps become auto-filed issues
- Voice-system coverage expansion: candidates include Linear (terse, direct), Vercel (developer-native), Stripe (measured authority), Notion (approachable clarity) — one-prompt additions each
- Content patterns: onboarding tooltips, permission-request copy, billing/dunning sequences, deletion-confirmation modals
- `raven_register` in-product signup feedback loop: on successful register, surface a tool-return confirmation that includes subscriber-count growth so Andrew can see momentum

### Trademark / IP
- Once RAVENMCP is registered, consider filing in EU / UK for defensive coverage if usage spreads
- Maintain a "first use in X class" log so any future expansion has clean dates

### Audience growth
- The #updates form is the only audience-fill path. Idea: A/B the copy above the form (currently generic) against something more specific like "One email per release. Patches are silent."
- Consider a weekly "what's new in Raven" digest seeded from changelog — if subscriber count crosses 50, worth pushing

### Operations
- Revisit reports should be auto-generated at compaction boundaries, not just on `/revisit` — compaction is a natural retrospective moment
- `raven_reflect` could suggest its own follow-up issues based on recurring audit warnings, not just surface them

## Session retrospectives

### 2026-06-18 (follow-up: two-followups)
- **Biggest win:** MacroUITests target fully wired and building under Xcode 26.5 — unlocks e2e a11y-snapshot verification for Raven iOS capture. Both stale-rule and wiring follow-ups closed in one session.
- **Biggest lesson:** AccessibilitySnapshot renders views in-process — it can never run in a `ui-testing` bundle (out-of-process). Always spec the test-host topology before wiring any in-process renderer (AccessibilitySnapshot, ViewInspector, SwiftUI preview-based test libs). The `_Testing_Unavailable` alias is a direct Xcode signal: UI-test bundles have Swift Testing force-disabled.
- **Shell lesson:** `EXIT=$?` before ANY subsequent command — `echo $?` resets the value and will lie.
- **SPM inheritance lesson:** `SWIFT_ENABLE_EXPLICIT_MODULES`, `ENABLE_TESTING_SEARCH_PATHS`, and similar build settings in pbxproj do NOT reach SPM package targets. They require invocation-level CLI overrides.
- **False-negative pattern:** In a multi-target build, if TargetA fails early, all following targets silently have "no errors" in the log — they never compiled. Confirm by checking for produced artifacts, not log silence.

### 2026-06-18
- **Biggest wins:** 4 autonomous Raven phases built via Codex fan-out, all first-attempt — the workflow pattern proved out end-to-end. The Phase 4 test agent even caught a production bug it wasn't asked to find. Automation token unlocks frictionless future releases. Eyes-on device verification (real paired iPhone) for Phase 1.
- **Biggest lesson:** `sed` batch ops against a variable holding a list silently fail in non-interactive sh — always inline the list. npm publish authentication: always check `npm whoami` before running `release.sh`; if it fails, skip interactive auth entirely and go straight to an Automation token.
- **Structural insight:** The "doc → 4 phased /goals" format (from the HighLvl opportunities ledger) is a strong template for multi-phase Raven roadmap work. Each phase is a self-contained workflow with a clear input/output contract; they compose cleanly without blocking.
- **Rule staleness noted:** CLAUDE.md's "Apple ships no iOS 26.x sim runtime" is factually incorrect on this machine. Rules written from point-in-time observations decay; the intent (device-verify even when sim is available) still holds, but the premise needs softening.

### 2026-04-22
- Biggest win: same-day ship of content systems layer (one prompt → production in 6 hours) proves Raven's own thesis — AI+HI collaboration compresses weeks into hours when the system prompt is tight.
- Biggest lesson: when Andrew says "use X," default to running X. Paste-prompts are for when he explicitly asks for cross-session handoff copy.
- Emerging pattern: trademark filings benefit from single-viewport specimens. Applied to RavenMCP; worth remembering for any future marks.

## Open questions

- Are there jurisdictions where "MCP" (as a generic technical term) could weaken the mark?
- Should the audience-growth strategy lean on the install ping (ask user to opt in during `postinstall.cjs`) vs. staying purely passive via the web form?
- When does self-audit stop surfacing new gaps and become noise? Need a threshold.
