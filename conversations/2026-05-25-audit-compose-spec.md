# Spec — `audit_compose` (native Android / Jetpack Compose)

**Status:** Design doc. NOT implemented. Decision pending (see §9 Sequencing).
**Author:** Claude (for Andrew Cunliffe)
**Date:** 2026-05-25
**Repo:** `/Users/accunliffe/projects/raven-mcp` (`src/index.ts` → `dist/index.js`)
**Companion tools:** `audit_swiftui`, `audit_ios_screen`, `audit_ios_privacy`, `audit_rn` (all shipped in 1.5.0)

---

## 1. Purpose & positioning

RavenMCP audits design-system / HIG / accessibility / privacy posture across surfaces.
1.5.0 covers **web** (`audit_page`/`audit_layout`), **iOS/SwiftUI** (`audit_swiftui`),
**iOS view snapshots** (`audit_ios_screen`), and **React Native** (`audit_rn`). The one
empty cell in the matrix is **native Android / Jetpack Compose**.

```
              static source        runtime snapshot      privacy/manifest
  web         audit_page           —                     —
  iOS         audit_swiftui        audit_ios_screen      audit_ios_privacy
  RN          audit_rn             audit_ios_screen*     audit_ios_privacy (Android perms)
  Android     ►audit_compose◄      ►audit_screen alias◄  ►audit_compose / *_privacy ext◄
  * RN renders to native views, so the iOS snapshot tool already works on it.
```

`audit_compose` is the **static-source** Compose auditor: point it at Kotlin `@Composable`
code and it scores it against **Material 3 + Android accessibility (TalkBack) + the Android
touch-target/spacing/typography rules** the way `audit_swiftui` does for Apple HIG.

### Honest caveat (read this before building)

**Andrew ships no native Kotlin/Compose app today.** The Android he ships is via **Expo /
React Native**, which is *already* covered by `audit_rn` (it emits Android `48dp`/Material
guidance) plus `audit_ios_privacy`'s Android-permission checks. So `audit_compose` is a
**market-completeness play, not a dogfooding-driven one** — there is no in-house app to prove
it against. That changes the test plan (synthetic fixtures, §8) and the sequencing call (§9).
Don't pretend otherwise in the README or the launch post.

---

## 2. Input schema

Mirror `audit_swiftui`. Tool name: `audit_compose`.

```ts
{
  source:      z.string().or(z.array(z.string()))  // Kotlin/Compose source, one or many files, concatenated
                 .describe("Kotlin @Composable source. Pass one file or an array of files."),
  theme:       z.string().optional()   // optional Theme.kt / Color.kt so we can resolve MaterialTheme usage
                 .describe("Optional theme/Color.kt source — lets the audit reward a real color/type scale instead of hardcoded literals."),
  manifest:    z.string().optional()   // AndroidManifest.xml for the privacy/manifest checks (§6)
                 .describe("Optional AndroidManifest.xml for permission/exported/cleartext checks."),
  dark_theme:  z.boolean().optional()  // mirrors audit_rn's color_scheme: suppress dark-mode flag for single-theme apps
                 .describe("Set false for a single-theme (e.g. always-light brand) app to suppress the dark-theme parity flag."),
  strict:      z.boolean().optional()  // promote selected warnings to errors (same semantics as web audit_page strict)
}
```

`source` accepts a string OR string[] exactly like `audit_swiftui` (it `Array.isArray(source) ?
source.join("\n") : source` at the top). `manifest` here is optional; the manifest checks can
ALSO live in `audit_ios_privacy` (which already takes Android perms via Expo `app_json`) — see
§6 for the build-vs-extend decision.

---

## 3. Return shape

**Identical to `audit_page`** so every client (Claude Code, Codex, the CLIs) parses one
contract. The only delta is `platform: "android"`.

```jsonc
{
  "platform": "android",
  "score": 82,                      // 0–100
  "grade": "B",                     // A–F, same banding as the other tools
  "passes":  ["Material3 theme in use", "minimumInteractiveComponentSize on icon buttons", ...],
  "errors":  [ { "severity":"error",   "rule":"compose-touch/min-target", "message":"...", "fix":"..." } ],
  "warnings":[ { "severity":"warning", "rule":"compose-color/hardcoded-literal", "message":"...", "fix":"..." } ],
  "fix_priority": ["compose-touch/min-target", "compose-a11y/content-description", ...]  // errors first, then warnings, de-duped
}
```

Rule namespace: `compose-touch/*`, `compose-a11y/*`, `compose-color/*`, `compose-typography/*`,
`compose-spacing/*`, `compose-theme/*`, `compose-layout/*`. (Parallels `ios-touch/*`,
`ios-color/*`, etc. — a reader who knows the iOS rules can guess the Compose ones.)

---

## 4. Compose checks (static source)

These are deliberately **high-signal, low-noise** — same discipline as `audit_swiftui`, which
emits ZERO web-only warnings. A web rule (lang, flex-wrap, clamp, bare-hex-in-CSS) must never
fire here. Each check below names the regex/heuristic and the severity.

### 4.1 Touch targets — `compose-touch/min-target` (error)
- **Detect:** a `Modifier.size(Xdp)`, or paired `.width(Xdp).height(Ydp)`, where the smaller
  dimension `< 48dp`, applied on an interactive node: `Modifier.clickable`, `IconButton(`,
  `Button(`, `Checkbox(`, `RadioButton(`, `Switch(`, `IconToggleButton(`.
- **Suppress** when `Modifier.minimumInteractiveComponentSize()` is present in the same chain,
  or the composable is a Material `IconButton` (which applies the 48dp minimum internally — note
  this and reward it as a pass instead).
- **Fix:** "Add `Modifier.minimumInteractiveComponentSize()` or size the target ≥ 48dp; the
  visual icon can stay small while the touch target meets Material's 48dp minimum."
- **Threshold note:** Android = **48dp**, iOS = **44pt**. This is the one number that differs
  from the iOS tools; call it out in the message so cross-platform readers don't get confused.

### 4.2 Accessibility — `compose-a11y/content-description` (error) + `compose-a11y/semantics-role` (warning)
- **content-description:** `Icon(`, `Image(`, or `IconButton(` that is interactive (inside a
  `clickable`/`onClick`) with `contentDescription = null`. Decorative-only icons legitimately
  use `null`, so only fire when the node is interactive or carries meaning (heuristic: `null`
  contentDescription on a node that also has `onClick`/`clickable` → error; standalone decorative
  `Icon` with `null` and a nearby `Text` label → pass with a note).
- **semantics-role:** a bare `Modifier.clickable {}` on a non-Material container (e.g. `Box`,
  `Row`) with no `Modifier.semantics { role = Role.Button }` → warning (TalkBack won't announce
  it as a button). Material `Button`/`IconButton` set the role for you → reward as pass.
- **Fix (content-description):** "Provide a `contentDescription` describing the action/meaning,
  or set it to `null` only for purely decorative imagery that a nearby `Text` already labels."

### 4.3 Color — `compose-color/hardcoded-literal` (warning)
- **Detect:** `Color(0xFF......)`, `Color(0x........)`, `Color(red = .., green = .., blue = ..)`,
  or `Color.Red`/`Color.Black` etc. used **inside a `@Composable`** (not inside a `Color.kt`
  palette definition — distinguish by whether the file/usage is theme-definition vs. UI).
- **Suppress / reward:** usage of `MaterialTheme.colorScheme.*` → pass
  ("colors sourced from MaterialTheme.colorScheme"). If a `theme`/`Color.kt` arg is supplied and
  defines a palette, treat literals *there* as the legitimate single source of truth (don't flag),
  and only flag literals that appear in composables.
- **Fix:** "Reference `MaterialTheme.colorScheme.{primary|surface|onSurface|…}` so the color
  adapts to light/dark and dynamic color (Material You). Define raw values once in your Color.kt
  palette, not inline in the UI."

### 4.4 Typography — `compose-typography/small-font` (warning) + `compose-typography/hardcoded-size` (warning)
- **small-font:** `fontSize = Xsp` where `X < 13` (Material body-small floor; below this fails
  legibility / Large-Text scaling). Error in `strict`.
- **hardcoded-size:** `fontSize = Xsp` literal in a composable instead of
  `MaterialTheme.typography.{bodyLarge|labelSmall|…}`. Warning — reward `MaterialTheme.typography`
  usage as a pass.
- **Don't** flag `sp` itself (sp is correct — it scales with the user's font setting). Flagging
  `dp` for text would be the bug; only `sp` is acceptable for type. (Inverse of a web tool's px rule.)
- **Fix:** "Use `MaterialTheme.typography.*` styles; if you must set a size, keep it ≥ 13sp and
  in `sp` (never `dp`) so it honors the user's display-size setting."

### 4.5 Spacing — `compose-spacing/base-unit` (warning) + `compose-spacing/scale-count` (warning)
- **base-unit:** `Modifier.padding(Xdp)`, `.padding(horizontal = Xdp, vertical = Ydp)`,
  `Spacer(Modifier.height(Xdp))`, `Arrangement.spacedBy(Xdp)` where a value is not a multiple of
  **4** (warn) — flag 8-grid deviations more softly than 4-grid. Mirror `ios-spacing/base-unit`.
- **scale-count:** count the distinct spacing values; if a single screen uses > ~6 distinct
  off-scale numbers, warn that there's no spacing scale (mirror `ios-spacing/scale-count`).
- **Reward:** values pulled from a `dimensionResource(...)` or a `Spacing`/`Dimens` object →
  pass ("spacing sourced from a named scale").
- **Fix:** "Round to the 4/8dp grid and centralize in a `Dimens`/`spacing` object so the rhythm
  is consistent and themeable."

### 4.6 Dark theme — `compose-theme/dark-mode` (warning)
- **Detect:** no `isSystemInDarkTheme()` reference anywhere AND no `dynamicColor`/
  `dynamicDarkColorScheme`/`darkColorScheme` in the supplied theme, WHILE hardcoded `Color(0x..)`
  literals are present (i.e. the app paints fixed colors and never branches on dark mode).
- **Suppress** when `dark_theme: false` is passed (single-theme brand app — same escape hatch as
  `audit_rn`'s `color_scheme`).
- **Fix:** "Drive colors from `MaterialTheme.colorScheme` and provide a `darkColorScheme()` (or
  `dynamicColorScheme` on Android 12+); branch on `isSystemInDarkTheme()` at the theme root."

### 4.7 Edge-to-edge / insets — `compose-layout/window-insets` (warning)
- **Detect:** content that hardcodes top/bottom padding or uses `fillMaxSize()` as a screen root
  with **no** `Modifier.windowInsetsPadding(...)` / `Modifier.safeDrawingPadding()` /
  `WindowInsets.*` / a call to `enableEdgeToEdge()` (typically in the Activity, so accept it from
  any supplied file). Android 15 enforces edge-to-edge — content can be drawn under the system
  bars without inset handling.
- **Fix:** "Call `enableEdgeToEdge()` and apply `Modifier.windowInsetsPadding(WindowInsets.safeDrawing)`
  (or `safeDrawingPadding()`) to your screen scaffold so content isn't occluded by the status/nav bars."

### 4.8 Rewards (passes) — explicitly credit good Compose
Same philosophy as `audit_swiftui` (which passes a populated AccentColor). Emit `passes` for:
- `MaterialTheme` / `MaterialTheme.colorScheme` / `MaterialTheme.typography` in use
- `Modifier.minimumInteractiveComponentSize()` present
- `Modifier.semantics { role = … }` / non-null `contentDescription` on interactive nodes
- `darkColorScheme()` / `dynamicColor` present (dark-mode handled)
- `WindowInsets`/`enableEdgeToEdge()` present (edge-to-edge handled)
- spacing/type sourced from a named scale (`Dimens`, `MaterialTheme.typography`)

A clean Material 3 screen should land an **A** with several passes and zero errors — the same
"reward, don't just punish" balance the iOS tools strike.

---

## 5. Heuristic honesty (why this is regex, and where it's weak)

Like the iOS tools, this is **static text analysis, not a Kotlin compiler/AST**. State that
plainly. Known soft spots, and the mitigation:
- **Modifier chains span lines / are extracted into vals** → match within a normalized
  (whitespace-collapsed) window; accept some false-negatives over false-positives.
- **`contentDescription` decorative-vs-meaningful** is genuinely ambiguous → bias toward warning
  (not error) unless the node is unambiguously interactive (`onClick`/`clickable` present).
- **Theme indirection** (`AppColors.brandBlue`) → if a `theme` arg is supplied, treat values
  defined there as the source of truth and don't double-flag.
- Document these in the tool description so users calibrate trust — the iOS suite earned trust by
  emitting ZERO web-noise; Compose must clear the same bar or it trains people to ignore it.

---

## 6. AndroidManifest.xml — privacy/manifest checks

The handoff asks to **deepen** privacy coverage. `audit_ios_privacy` already accepts Android
permissions via Expo `app_json` and has an `ios-privacy/android-permissions` rule. Two options:

**Option A (recommended): extend `audit_ios_privacy` to accept a raw `manifest` arg** and add the
manifest rules there, OR alias a thin `audit_android_privacy`. Keeps all privacy logic in one
place; the Expo path and the native path share rule code.

**Option B:** fold a light manifest scan into `audit_compose` via its `manifest` arg.

Either way, the manifest rules (rule namespace `android-privacy/*`):
- `android-privacy/dangerous-permission` (warning→error in strict): `<uses-permission>` for
  dangerous groups — `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `READ_CONTACTS`,
  `RECORD_AUDIO`, `CAMERA`, `READ_SMS`, `READ_MEDIA_*`, `BODY_SENSORS`, `READ_CALL_LOG`, etc.
  Message ties each to the **Play Console Data-Safety form** obligation. (Reuse the dangerous-set
  already in `ios-privacy/android-permissions`.)
- `android-privacy/exported-component` (error): `android:exported="true"` on `<activity>`/
  `<service>`/`<receiver>` with no `android:permission` and an `<intent-filter>` that isn't the
  launcher — an unguarded exported surface. (Android 12+ requires explicit `exported`; flag the
  unguarded-true case, not the mere presence.)
- `android-privacy/cleartext-traffic` (error): `android:usesCleartextTraffic="true"` (the
  Android analog of iOS `NSAllowsArbitraryLoads`), or a `network_security_config` that permits
  cleartext broadly.
- `android-privacy/allow-backup` (warning): `android:allowBackup="true"` (default) without a
  `fullBackupContent`/`dataExtractionRules` ruleset → app data (incl. tokens) may be backed up.
- `android-privacy/debuggable` (error): `android:debuggable="true"` shipped in a release build.
- **Play Data-Safety alignment** (warning): if PRIVACY.md / a data-safety note is supplied,
  cross-reference declared dangerous permissions against it — same spirit as the iOS
  usage-string-vs-PRIVACY.md cross-check.

**Reuse the HealthKit-90683 lesson:** the iOS privacy fix (this session) taught that "remove the
declaration" is sometimes wrong because a platform validator *requires* it. The Android analog:
don't blanket-advise removing a `<uses-permission>` that a bundled SDK/library requires — frame
the fix as "remove if your code doesn't use it; otherwise disclose it in Data Safety." Carry that
nuance over.

---

## 7. Reuse — alias `audit_ios_screen` → `audit_screen`

`audit_ios_screen` is **already framework-agnostic**: it scores a list of `{label, rect, role,
fontPt, fgColor, bgColor}` elements for touch targets, contrast, alignment, gap, balance. An
Android **UI Automator / Espresso** accessibility dump (or a Compose `printToLog`/semantics tree
exported to that shape) feeds it directly.

Proposal:
- **Register `audit_screen` as the canonical name; keep `audit_ios_screen` as a back-compat
  alias** (both point at the same handler). Update the description to say "iOS or Android view
  snapshot."
- **Touch-target threshold must become platform-aware:** add an optional `platform: "ios" |
  "android"` arg (default `ios` for back-compat). `ios` → 44pt minimum; `android` → 48dp minimum.
  This is the single behavioral difference; everything else (contrast, alignment) is identical.
- **Contrast:** iOS uses `secondaryLabel`/`tertiaryLabel` as warn-not-fail semantic colors;
  Android's analog is `onSurfaceVariant` — add it to the same warn-not-fail set when
  `platform: "android"`.

This gives Android a runtime-snapshot auditor for **free** (one alias + one threshold branch),
which is a strong argument for doing the snapshot half even if the static `audit_compose` half is
deferred.

---

## 8. `platform: "android"` for `get_checklist` / `get_principles`

Add an `android` branch alongside the existing `ios` / `react-native` ones.

- **`get_checklist({ platform: "android" })`** returns Material-3 / Android-a11y items:
  48dp touch targets, `contentDescription` on actionable imagery, TalkBack focus order &
  announcements, Dynamic Color / dark theme parity, edge-to-edge + insets, large-text/font-scale
  support, content scaling, Play **Data Safety** disclosure. Must NOT leak web items (the iOS
  checklist test asserts no `auto-zoom`/`grid-template` leak — replicate that assertion).
- **`get_principles({ platform: "android" })`** returns a Material-3 / Android-accessibility
  principle set, `source: "Material Design 3 / Android Accessibility"`, with ids like
  `md3-touch-targets`, `md3-color-roles`, `md3-typography-scale`, `android-talkback`,
  `md3-dark-dynamic-color`, `android-edge-to-edge`. Mirror the `hig-*` / `rn-*` id convention.

---

## 9. Effort estimate & sequencing recommendation

### Effort (working estimate, mirrors what the iOS/RN suites took)

| Piece | Scope | Effort |
|---|---|---|
| `audit_compose` static checks (§4) | 7 rule families + rewards, regex + normalize | **0.75–1 day** |
| `audit_screen` alias + platform threshold (§7) | rename + alias + 48dp/onSurfaceVariant branch | **0.25 day** |
| Manifest privacy (§6, extend `audit_ios_privacy`) | 5–6 rules, reuse dangerous-set | **0.5 day** |
| `platform:"android"` checklist/principles (§8) | author Material-3 content + no-leak guard | **0.5 day** |
| Synthetic-fixture test suite (§8 below) | good/bad Compose + manifest fixtures | **0.5 day** |
| Docs / CLI (`scripts/compose-audit.mjs`) / site | parity with ios-audit.mjs | **0.5 day** |
| **Total** | | **~3 days** |

### Test plan — synthetic fixtures (NO dogfood app exists)

Because there is **no in-house Compose app**, the suite cannot do the live-dogfood print the iOS
suite does. Instead, add to `/tmp/raven-compose-test.mjs` (tests live in /tmp, per house rules):
- A **`BAD.kt`** fixture deliberately tripping every rule: `Modifier.size(32.dp)` on a
  `clickable`, `Icon(..., contentDescription = null)` inside an `onClick`, `Color(0xFF3366FF)` in
  a composable, `fontSize = 11.sp`, `padding(7.dp)`, no `isSystemInDarkTheme`, no `WindowInsets`.
- A **`GOOD.kt`** fixture: Material3 theme, `minimumInteractiveComponentSize()`, labeled icons,
  `MaterialTheme.colorScheme`/`typography`, 4/8dp spacing from a `Dimens`, `darkColorScheme`,
  `enableEdgeToEdge()` → asserts **0 errors** and several passes.
- A **`BAD_MANIFEST.xml`** and **`GOOD_MANIFEST.xml`** for §6.
- A **web-noise guard** assertion: `allRules(...).filter(r => WEB_ONLY.includes(r)).length === 0`
  — the same ZERO-web-noise gate the iOS tests enforce.
- Optionally **vendor one tiny real-world OSS Compose screen** (e.g. a screen from a permissively
  licensed sample) as a sanity fixture, clearly marked as third-party, so it's not purely
  self-authored. State in the doc/README that fixtures are synthetic and the tool is unproven on a
  shipping in-house app.

### Recommendation — **demand-gated; build the cheap half opportunistically**

**Don't build the full `audit_compose` now.** Honest reasoning:
1. **No dogfood target.** Every other RavenMCP tool was sharpened against a real app Andrew ships
   (web portfolio, Macro, blacksheep). `audit_compose` would ship *unproven against production
   code* — exactly the thing that produced the HealthKit-90683 bug we just fixed (a rule that
   looked right in the abstract but broke a real build). Synthetic fixtures can't surface that
   class of error.
2. **Andrew's Android is already covered.** His Android ships via Expo/RN → `audit_rn` +
   `audit_ios_privacy` Android-permission checks. The gap is *other people's* native Kotlin, i.e.
   external demand we haven't seen yet.
3. **Cost/benefit:** ~3 days for a matrix cell nobody's asked for.

**What to do instead, now (low cost, high leverage):**
- **Ship §7 (the `audit_screen` alias + 48dp/`onSurfaceVariant` branch) — ~0.25 day.** It gives
  Android a runtime-snapshot auditor essentially for free off existing, *already-dogfooded* code,
  and it's genuinely useful for anyone with an Espresso/UI-Automator dump.
- **Optionally ship §6 manifest checks** by extending `audit_ios_privacy` (~0.5 day) — privacy is
  the highest-stakes, most-portable surface (Play Data Safety mirrors App Review), and it reuses
  the dangerous-permission set already present.
- **Hold §4 (`audit_compose` static checks) and §8 behind a demand gate.** Build it when any of:
  (a) a real native Compose app appears to dogfood against, (b) an external user/issue asks for
  Android-native auditing, or (c) it's being packaged as a paid/portfolio matrix-completeness
  feature where "we cover all four surfaces" is itself the value. When that trigger fires, this
  spec is the build sheet — it's ~1 day of focused work at that point.

This keeps RavenMCP's credibility (every shipped rule is proven) while leaving the matrix one
quick alias away from "Android: partial" and one demand-signal away from "Android: complete."

---

## 10. Open questions
- Is matrix-completeness ("all four platforms") itself a marketing/portfolio asset worth the
  unproven-rule risk? If yes, that's the trigger to build §4 now — but ship it labeled
  "experimental / synthetic-fixture validated" until a real app proves it.
- Compose Multiplatform (Android + iOS + desktop from one Kotlin source): out of scope here, but
  if it shows up, `audit_compose` static checks would partially apply to its Android target.
- Should `audit_screen` accept a Compose semantics-tree export format directly, or require callers
  to map it to the existing `{rect, role, …}` shape? (Lean: require the existing shape; document a
  mapping recipe rather than parsing N snapshot formats.)
