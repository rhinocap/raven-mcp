# Handoff — 2026-05-25 — Android spec + LinkedIn post (post-/clear)

Per-instance handoff (NOT the shared daily file). Read this first after a cold start.

## What shipped this session (context)

**RavenMCP 1.5.0 is LIVE** (npm + https://ravenmcp.ai) — extended the design-intelligence MCP
from web-only audits to **native mobile**. Repo: `/Users/accunliffe/projects/raven-mcp/`
(TypeScript `src/index.ts` → `dist/index.js`; registered as the `raven` MCP in both Claude Code
and Codex via local `dist/` path).

Four new tools (same JSON contract as `audit_page`: `score/grade/passes/errors/warnings/fix_priority`):
- **`audit_swiftui`** — static SwiftUI vs Apple HIG: tiny/non-Dynamic-Type fonts, hardcoded
  `Color(red:green:blue:)`/hex vs semantic+asset colors, empty AccentColor, sub-44pt frames,
  off-4/8pt spacing. Optional `accent_color_contents`.
- **`audit_ios_screen`** — scores a view-hierarchy/accessibility snapshot: 44pt targets, contrast
  (iOS secondaryLabel/tertiaryLabel = warn not fail), alignment/gap/balance. Framework-agnostic
  (RN renders native → same tool works).
- **`audit_ios_privacy`** — Info.plist OR Expo `app_json`: usage-string vs code contradictions
  (e.g. HealthKit write claim the code never fulfills), unused entitlements, Android permissions,
  ATS cleartext, bundled secrets (incl. `expo.extra`), undisclosed default data-egress.
- **`audit_rn`** — RN/Expo JSX+StyleSheet vs iOS HIG + Android Material: touchable
  accessibilityLabel/Role, 44/48pt+hitSlop, `allowFontScaling={false}`, sub-13 fontSize, missing
  SafeAreaView, dark-mode (suppressed for single-mode apps via `color_scheme`).
- `get_checklist`/`get_principles` gained `platform:"ios"` and `platform:"react-native"`.
- CLIs: `scripts/ios-audit.mjs`, `scripts/rn-audit.mjs` (terminal/Claude Code/Codex orchestrators);
  `scripts/AccessibilitySnapshot.swift` (XCUITest snapshot dumper).

Commits on `main`: `01e003a` (iOS suite), `fe69624` (RN suite), `dbdd2c2` (CI: actions→v5 Node 24),
`06363bf` (site update). Release tag `v1.5.0`. Tests: 38/38 deterministic suite at
`/tmp/raven-ios-test.mjs` (tests live in /tmp, not the repo). Web `audit_page`/`audit_layout`
behavior unchanged throughout.

**Dogfood findings (real, useful, true):**
- Macro (native SwiftUI, `/Users/accunliffe/projects/macro`): a live `NSHealthUpdateUsageDescription`
  declared while code only does `toShare: []` → App-Review reject risk; WHOOP_CLIENT_SECRET in
  Info.plist; default "Recommended" hosted-egress not disclosed at point of choice. (Macro was
  uploaded to App Store Connect this session — these matter before "Submit for Review".)
- blacksheep-ios (Expo RN, `/Users/accunliffe/projects/blacksheep-ios`): 40 TouchableOpacity with
  no accessibilityLabel/Role; a `fontSize: 11`; 3 screens missing SafeAreaView. Dark-only app →
  dark-mode correctly NOT flagged. Expo privacy clean (uses expo-secure-store).

## TASK C (DO FIRST — live correctness bug in shipped 1.5.0)

`audit_ios_privacy`'s `ios-privacy/unfulfilled-claim` rule fires when
`NSHealthUpdateUsageDescription` is declared but the code only does `toShare: []`, and its **fix
says "Remove NSHealthUpdateUsageDescription"**. That advice is WRONG and harmful: per hard-won
memory `feedback_healthkit_usage_string.md`, while the **HealthKit entitlement is present** the App
Store upload validator **requires** that usage string — removing it fails upload with **error
90683**, even if the app never writes. So the tool currently tells users to break their build.

Fix (in `src/index.ts`, the `unfulfilled-claim` branch):
- If the HealthKit entitlement is present (entitlements has `com.apple.developer.healthkit`),
  do NOT tell them to remove the string. Reframe: the string is upload-mandatory (90683); the real
  remedy for an unused write is to drop the write *capability* (don't request `toShare:` write auth /
  remove the write entitlement) or actually use it — and note App Review 5.1.1 scrutinizes unused
  permissions separately. Keep it a `warning`, not an `error`, in that case.
- Only when there is NO HealthKit entitlement should "remove the unused usage string" be safe advice.
- Add/refresh a deterministic test in `/tmp/raven-ios-test.mjs` for both branches (entitlement
  present vs absent). Rebuild (`npm run build`), rerun the suite, and — since 1.5.0 is already
  published — decide with Andrew whether this warrants a 1.5.1 patch release.

Cross-check `feedback_healthkit_usage_string.md` before editing.

## TASK A — Spec `audit_compose` (native Android / Jetpack Compose)

**Deliverable: a written SPEC (design doc), not an implementation.** Andrew said "spec it."
Write it to `/Users/accunliffe/projects/raven-mcp/conversations/2026-05-25-audit-compose-spec.md`
(or a `docs/specs/` file if one exists). Mirror the shape/quality of the iOS suite.

Must cover:
- **Purpose & positioning:** completes the matrix web · iOS · Android · RN. Honest caveat: Andrew
  ships NO native Kotlin/Compose app today, so there's no app to dogfood — spec a synthetic-fixture
  test plan and say so. The Android *he ships* (via Expo RN) is already covered by `audit_rn` +
  `audit_ios_privacy` Android-permission checks. So this is a market-completeness play, demand-gated.
- **Input schema:** `source` (Kotlin/Compose, string|array), optional `theme`/`dark_theme` hint,
  `strict`. Same return shape as `audit_page` (+ `platform:"android"`).
- **Checks (Compose-specific, high-signal, avoid noise):**
  - Touch targets: `Modifier.size(Xdp)` / `.width().height()` < 48dp on `clickable`/`Button`/
    `IconButton` without `Modifier.minimumInteractiveComponentSize()`.
  - Accessibility: `Modifier.clickable {}` or `Icon(...)` with `contentDescription = null` on
    interactive elements; missing `Modifier.semantics { role = Role.Button }`.
  - Color: hardcoded `Color(0xFF…)` / `Color(red=…)` vs `MaterialTheme.colorScheme.*`.
  - Typography: hardcoded `fontSize = Xsp` below ~13sp, or not from `MaterialTheme.typography`.
  - Spacing: `Modifier.padding(Xdp)` off the 4/8 grid; reward a dimens/spacing scale.
  - Dark theme: no `isSystemInDarkTheme()` / dynamic color while hardcoded colors present.
  - Edge-to-edge/insets: missing `WindowInsets`/`Modifier.windowInsetsPadding`/`enableEdgeToEdge()`.
  - Rewards: Material3 theme, `semantics`, `minimumInteractiveComponentSize`, `Platform`/insets.
- **AndroidManifest.xml:** deepen the existing `audit_ios_privacy` (or a new `audit_android_privacy`):
  dangerous `<uses-permission>`, `android:exported=true` without permission, `usesCleartextTraffic`,
  `allowBackup`, `debuggable`, Play Store Data-Safety alignment.
- **Reuse:** `audit_ios_screen` is already framework-agnostic — propose aliasing it `audit_screen`
  so an Android accessibility snapshot (UI Automator / Espresso dump) feeds the same geometry/touch
  checks. Note the dp(48) vs pt(44) threshold difference.
- **`platform:"android"`** for `get_checklist`/`get_principles` (Material 3, Android a11y/TalkBack,
  Play Data-Safety).
- **Effort estimate + sequencing recommendation** (build now for matrix-completeness vs wait for a
  real Compose app / user demand). Keep the recommendation honest.

## TASK B — LinkedIn post (write in Zed, per Andrew's drafting rule)

Write to `/tmp/drafts/2026-05-25-ravenmcp-mobile-audits-linkedin.md`, then
`open -a Zed /tmp/drafts/2026-05-25-ravenmcp-mobile-audits-linkedin.md`. Also paste it bare (no
markdown link-wrapping) in the chat reply. Andrew = Senior Staff designer/technologist (Intuit).
Authentic, insight-first, NOT markety. No em-dash-heavy AI voice.

**Lead with the insight, not the feature list:** point a *web* design auditor at a SwiftUI or React
Native app and ~80% of what it flags is web noise (lang, flex-wrap, clamp, bare-hex) — false
positives that train you to ignore it. RavenMCP 1.5.0 fixes that: it now audits native iOS (SwiftUI)
and React Native against what's *actually* true on-device — Apple HIG + Android Material — and
suppresses the web-only rules.

Facts to use (accurate):
- RavenMCP = open-source design-intelligence MCP server (ravenmcp.ai), gives AI design-system/HIG/
  accessibility/privacy knowledge. One install, works in Claude Code / Codex / any MCP client.
- 1.5.0: 4 new tools, 31 total. Native iOS + React Native audits.
- What it checks natively: Dynamic Type, 44/48pt touch targets, safe areas, dark-mode parity,
  AccentColor, touchable accessibility labels, and App-Review privacy (usage-string honesty,
  undisclosed default data-egress, secrets in the bundle).
- Dogfood proof (anonymize / keep generic — don't name client apps unless Andrew okays): caught a
  HealthKit permission an app declared but never used (a real App Review reject trigger), a default
  option silently sending data to a server with the disclosure buried in settings, and dozens of
  tappable controls with no accessibility labels in an RN app.
- Optional CTA: try it / it's open source / link ravenmcp.ai.
- Keep ~150–250 words, a hook first line, line breaks for skimmability, 3–5 hashtags max.
- Offer a shorter variant too if useful.

## Open / not-blocking
- Andrew chose "review commit then publish" earlier; 1.5.0 already published with his "Go".
- No native Android app exists to dogfood `audit_compose` — be honest about that in the spec.
