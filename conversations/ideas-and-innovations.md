# Ideas & Innovations

## Innovations shipped

- **RavenMCP brand profile** (2026-06-20) — `create_brand_profile` → `~/.raven/creative/brands/ravenmcp.json`. The keystone that was missing: `list_brand_profiles` 0→1. Colors from live `:root` tokens, voice from observed copy ("No Figma file. No designer."), 73 principles encoded as constraints. All downstream brand checks now have a ground truth.
- **True WCAG parent-chain compositing script** (2026-06-20) — custom DOM-walk contrast script that alpha-composites rgba() backgrounds over the actual dark ancestor chain. Raven's `audit_contrast` reported 78 AA fails (78→0 real). The technique is reusable for any dark-theme audit where Raven false-positives.
- **Design system reference page** (2026-06-20) — `site/design-system.html`: live WCAG AA matrix (computes parent-chain contrast in-browser), all 45+ tokens with swatches, type scale, spacing bars, motion, voice Do/Don't, guardrails. `noindex`, not linked from nav.
- **55-tool taxonomy (3 acts)** (2026-06-20) — 55 tools reorganized into Know / Create / Audit (+ Meta) with 11 labeled sub-groups and act-level descriptors. Related tools adjacent; consistent terminology ("layers" throughout); section heading "Fifty-five tools, organized by job."
- **Alternating-row Watch section** (2026-06-20) — replaced 3×2 cramped card grid with 6 alternating editorial rows (big MacBook per beat, copy beside, L/R/L/R/L/R alternation verified deterministically). Ported HighLvl `FeatureStory` pattern to vanilla CSS.
- **Release skill Step 1b — site changelog gate** (2026-06-20) — mandatory step added to `.claude/skills/release/SKILL.md`: mirror each release entry to `site/changelog.html` and curl-verify the live URL before declaring a release done. Closes the silent-drift gap where `CHANGELOG.md` and `.mcpb` were current but the marketing page lagged 5 releases.
- **`audit_content`, `audit_typography`, `audit_tap_targets` + video/iOS preflight refinements** (2026-06-19, v1.10.0) — Layer 1 gap-fill on top of the v1.9.0 render-and-capture foundation. `audit_content`: per-item UX-writing verdicts (pass/warn/fail) with before→after rewrites, pure offline, 32 tests. `audit_typography`: modular-scale/line-height/weight-ladder over rendered DOM text nodes, 20 tests incl. live Chromium. `audit_tap_targets`: DOM-enumerated 44×44pt per-element fix table, 12 tests. `capture.ts`: video artifact reason now distinguishes `empty-src`/`decode-error` (confirmed) from `preload-none`/`autoplay-blocked` (likely-artifact). `ios-capture.ts` + `ios-audit.mjs`: `checkSnapshotWiring` preflight emits actionable guidance for all false-ready paths. 185/185 tests. Also verified and closed 3 backlog items that turned out to have shipped in v1.9.0 (adversarial_verify, before/after diff, interactions[]) — gap analysis first, no duplicate build.
- **`audit_url` — Layer 0 render-and-capture transport** (2026-06-19, v1.9.0) — headless Playwright render at viewports×themes with scroll-settle, interaction firing, edge symmetry scoring, adversarial verdict tagging (`confirmed | likely-artifact | inconclusive`). Catches: responsive-hidden elements, video TP/FP, hover white-wash, sliced PNG exports, WCAG contrast failures. All built by reusing existing checks via extracted `runPageChecks()` — no forks. 92/92 tests, 7/7 acceptance cases, verified on deployed URL. Closes the P1 "render-and-capture" backlog accumulated across 9 portfolio projects.
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

### 2026-06-21 — Watch grid cut-off fix (phones + terminals)
- **Biggest win:** Re-cut all 6 clips from the 4K master (`~/Movies/RavenReelRawmp4.mp4`) with a union crop (`3680:2070:160:78 → 1920×1080`) that works for every beat despite the simulator window varying. Three-level verification (old-vs-new edge compare, poster contact sheet, deployed-URL AR measurement) done before calling it complete. A/B/C demo test picked exact-16:9 fill (C) over letterbox (B) — the right craft call.
- **Biggest lesson:** The PENDING item in the 06-20 session log said "re-cut from raw source." I didn't read the log before diagnosing — so I spent ~30 min on an AR fix that was real but incomplete, then got "still cut off." A 2-min log read would have collapsed the whole session to one pass. **Rule to promote to `~/.claude/CLAUDE.md` (next interactive session):** "Read the ongoing-feature session log before starting any diagnosis — PENDING items are the unresolved root causes."
- **Second lesson:** macOS screenshot access pattern needs to live in GLOBAL memory, not just the raven-mcp project memory. U+202F narrow-space + HEIC-as-.png + Bash sandbox from ~/Pictures affects every project where Andrew shares captures.
- **There were actually two root causes, not one:** (1) `.mb-screen` AR 1.82 vs 16:9 content → `object-fit:cover` sliced the bottom; (2) source clips were cut from a sizzle-reel export with baked-in Ken Burns zoom — exactly the PENDING from 06-20. Both real; only #2 was the user-visible symptom.

### 2026-06-20 — Watch-it-work grid + site audit
- **Biggest lesson: rules exist; execution doesn't.** Every failure this session violated an existing CLAUDE.md rule. Ken Burns re-introduced = "reuse what worked." Layers orphan = "audit full CSS scope." No Raven before building = "MCP first." Wrong viewport = "reproduce on user's surface." Five separate violations of five separate loaded rules in one session. The rules are not the problem; the habit of checking them before acting is.
- **Ken Burns re-regression root cause:** two independent clip-cutting passes happened in the session. The first (correctly) identified and fixed the wrong source file. The second (legibility pass) re-derived the approach from scratch instead of reusing the first pass, and silently picked up the bad source. Write the source file into any recut script as a comment so it's impossible to pick the wrong one.
- **Video poster fallback (new rule, not yet in CLAUDE.md):** the VP9-first path clears the poster before the big file finishes buffering → black screen. Fix: mp4/h264-only + poster as CSS background-image behind the screen element. Needs to be added to CLAUDE.md next interactive session.
- **True WCAG parent-chain compositing:** `audit_contrast` reported 78 AA fails (install pill at 1.08:1 — alarm level). Actual: 0 via DOM parent walk. The technique of verifying Raven's output against a live browser script before acting on it is now established as a pattern for dark-theme pages.
- **Biggest win:** brand profile + true WCAG compositing + 55-tool taxonomy shipped despite the iteration overhead. The Raven audit tooling (audit_page, get_pattern, get_principles) gave clear grounding when used; the lesson is to reach for it at the START, not after 4 failed iterations.

### 2026-06-19
- **Biggest win:** `audit_url` + v1.9.0 ships the entire Layer 0 backlog in one session — the P1 render-and-capture gap that was structurally invisible to all prior Raven audits is now closed. Seven acceptance cases covering every escape class pass, including a real deployed URL run.
- **Biggest lesson:** Subagents returning binary data (base64 data URIs for PNG test assets) are unreliable — the base64 gets corrupted in transit. Always have subagents write files to disk and return the path; read the asset yourself. The "agent wrote the data → paste it inline" pattern is a failure mode for anything binary.
- **Fan-out pattern:** The `/goal` → 5 parallel Explore/image-gen subagents → coupled core on main loop → verify pattern worked well. Subagents (index.ts map, test harness map, deployed-URL finder, clip.webm generator, image generator) all completed correctly on first request. The main loop owned all file writes and the verify gate.
- **Layer 1/2 follow-ups identified:** `audit_typography` (text rhythm, scale ratios over rendered DOM), `evaluate_design(before, after)` (before/after diff per dimension), browser-chrome video detection (for in-tab autoplay policies vs preload=none) — all now have a render-and-capture source to consume.

### 2026-06-19 (v1.10.0) — Layer 1 gap-fill
- **Biggest win:** Gap analysis as the first move. Reading the code before writing any code proved 3 of the 8 backlog items were already shipped — adversarial_verify, before/after diff, and interactions[] were all live in v1.9.0. The cost of that recon (~20 min) was less than the cost of one duplicate agent build. "Don't rebuild what already exists" held perfectly.
- **Fan-out pattern matured:** `/goal` → Workflow → 5 parallel agents on 5 distinct files (zero `index.ts` collision) → main loop owned all wiring, wired them all in one pass, ran the smoke, caught the preflight bug. Agents did authoring; main loop did integration + verify. This is the right division.
- **Boundary-case discipline:** The iOS preflight subagent produced `ready:false` with empty `guidance[]` — technically correct (the gate fires) but useless to the caller. Lesson: when a gating function returns a boolean, the companion human-facing output (`guidance[]`, `issues[]`) must also be non-empty whenever the gate says "no." Test the empty-output boundary explicitly.
- **Workflow output shape (THIRD miss):** Tried to parse `d['results']` from a Workflow result that had `result` (not `results`). Rule is in CLAUDE.md. This is now a chronic execution gap — not a rule problem, a habit problem. The self-check must happen BEFORE the parse, not after the KeyError.
- **MCP smoke location:** `/tmp` scripts can't import `@modelcontextprotocol/sdk/...` because ESM walks up from the script file looking for `node_modules`. Write MCP smoke tests inside the project, not in `/tmp`.

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
