# Changelog

All notable changes to Raven MCP are documented here. Format follows [Keep a Changelog](https://keepachangelog.com). This project adheres to [Semantic Versioning](https://semver.org).

The public web changelog at [ravenmcp.ai/changelog.html](https://ravenmcp.ai/changelog.html) is the authoritative source — this file mirrors it for offline reading and downstream packagers.

## [Unreleased]

### Added
- Server-level MCP `instructions` — Raven now tells connecting agents how to use it well at initialize time, including the project-kickoff calibration flow (run `get_taste_interview` before the first design work when a taste profile exists, persist with `bind_taste_surface`, pass `project` on audits), when to prefer taste vs. mechanical audits, and the `label_finding` learning loop. Clients that honor MCP server instructions get kickoff calibration with zero per-user setup; a copy-paste `CLAUDE.md`/`AGENTS.md` snippet for other clients is in the README ("Start every project calibrated").
- Surface calibration for taste profiles — a short kickoff interview plus per-project bindings, so one profile shows up correctly on every surface (full-strength monochrome rules on a portfolio, none of them on a product site, a slightly different voice on each). `get_taste_interview` returns a deterministic question set built from the profile's own scoped and voice/tone rules; `bind_taste_surface` persists the answers as a binding (surface string, URL hosts, per-rule severity overrides including `off`, and a voice note) under `~/.raven/taste/<profile>.surfaces.json`. `audit_taste` gains a `project` param and resolves bindings automatically (explicit project name first, then url hostname incl. subdomains): the binding supplies the surface at full trust, re-tunes or silences overridden rules (silenced rules reported under `disabled_by_binding`, and their delegated url-mode audits skipped), and echoes the binding's `voice_note`. Audits on uncalibrated projects with scoped rules return a `calibration_hint`. `get_taste_profile` now lists a profile's surface bindings.
- Taste rules can carry an optional `scope` (e.g. `portfolio-monochrome`), and `audit_taste` accepts an optional `surface` param — a scoped rule runs at full severity on a matching surface (token match; short scopes like `ui` match by exact word, never substring), is skipped and reported under the new `skipped_out_of_scope` result list on a non-matching surface, and can warn but never block when `surface` is omitted. Out-of-scope `owner: raven` rules also no longer trigger their delegated url-mode audits. `create_taste_profile` accepts `scope` on explicit rules and a `(scope:name)` bullet annotation in markdown ingestion. Backwards compatible: unscoped and `scope: "global"` rules behave exactly as before.

## [1.13.0] - 2026-07-01

### Added
- `dropdown-menu` pattern — dropdown / select / action-menu guidance covering keyboard navigation & type-ahead, focus management, the ARIA listbox-vs-menu-vs-combobox distinction, mobile (native select vs bottom-sheet), and overflow/sizing, surfaced via `get_pattern`/`search_knowledge`/`get_checklist`. Closes #1.
- `audit_page`/`audit_url` now check inline SVG icon-color compliance (`tokens/svg-hardcoded-color`) — warns when an icon `fill`/`stroke` hardcodes a hex/rgb/hsl color instead of `currentColor` or a token; exempts `currentColor`/`none`/`url(...)`/`var()`. Surfaces design-system icon-theming gaps that were previously invisible.
- `audit_layout` now flags orphan-stretch — a lonely last-row grid/flex card that stretches far wider (≥1.5×) than its sibling cards (the `flex: 1 1 280px` orphan), with a fixed-column-grid fix.
- `audit_consistency` — corpus/multi-page audit: compares ≥2 pages and flags cross-page divergence in content-container width and hero heading tier (inferring the canonical value from the corpus or a supplied token), catching relational defects single-blob audits miss (#9).
- `audit_video_playback` — renders a page and observes whether each `<video>` actually advances (samples currentTime, readyState, decode errors, autoplay-block), classifying each clip playing | paused | stalled | empty | error — catching black/non-playing videos that static frame-capture audits miss.
- `score_page` — returns a per-category (0–10) design score for a page (typography, accessibility, spacing, color, responsive, tokens, structure) derived from the same checks as `audit_page`, plus the overall score/grade, the weakest category, and the categories Raven does not mechanically assess (brand, conversion, motion).
- Taste Engine — five new tools that make design judgment portable and growable: `create_taste_profile` (ruleset + precedent corpus from explicit rules or a DESIGN.md-style markdown doc, persisted locally under `~/.raven/taste/`, `RAVEN_TASTE_HOME` override), `get_taste_profile` / `list_taste_profiles`, `label_finding` (append-only human accept/revise/reject precedents — accepts suppress that pattern in future audits), and `audit_taste` (judges HTML/text/URL against a profile with deterministic detectors for gradients, glow/neon, second accent hue, and banned-word lists; `owner: raven` rules delegate to the existing page-checks/contrast/tap-target engines; every finding cites a rule_id + concrete evidence, undetectable clauses land in `not_assessed` instead of being guessed; verdict BLOCK/WARN/PASS).

## [1.12.0] - 2026-06-21

### Added
- `compact` response mode for `audit_page`, `evaluate_design`, and `audit_url` — pass `compact: true` to return only scores, violations, and fix_priority, dropping embedded base64 screenshots and full principle/pattern bodies. Backwards-compatible (default off).
- `suggest_contrast_fix` tool — given failing WCAG color pairs, returns the minimal foreground (or background) change that clears the AA/AAA target ratio, with the achieved ratio and direction. Pairs directly with `audit_contrast` output.

### Changed
- `audit_contrast` now composites each text element's background over its full ancestor stack (alpha-over to the first opaque layer) instead of compositing a lone translucent layer over white — eliminating false AA failures on dark/layered UIs (e.g. a translucent pill over a dark hero) and reporting the true effective background. Backwards-compatible (single-`bgColor` callers unchanged; a new optional `bgColors[]` drives the corrected path).

## [1.11.0] - 2026-06-21

### Added
- `audit_device_frame` — flags cropped content in device-mockup frames (phone/MacBook screenshots, app-preview clips). Three checks: (1) **geometry** — given a frame's container box + the intrinsic media size + `object-fit`/`object-position` (or call with no args for a DevTools snippet), it computes `object-fit:cover` crop loss when the frame's aspect ratio diverges from the media's, naming the cropped edges and the hidden fraction; (2) **motion** — given a clip's first/last frame PNGs, it estimates baked-in pan/zoom (Ken Burns) via block-matched displacement regressed onto radial position, so a zoom that drifts content out of frame is caught; (3) **edge** — given frame PNGs, it reuses the edge-symmetry scorer to flag content truncated at a frame edge. Catches the exact failure where a 16:9 clip in a ~1.82-AR screen cutout silently slices the bottom. `src/device-frame.ts` is unit-tested (6 cases). The geometry leg is pure/offline; the motion + edge legs require `pngjs`.
- `color-systems` principle — palette-size discipline (page-level ≤10 distinct colors; role-based token set: surface/border/text/accent/semantic) surfaced via `get_principles`/`search_knowledge`/`evaluate_design`. Closes #4, #7, #8, #12, #14, #19.
- `spacing-systems` principles — 8px base-unit grid (4px half-step) + limited ≤7-token spacing scale, aligned to the `spacing/base-unit` and `spacing/scale-count` audit rules. Closes #3, #11, #13.

## [1.10.0] - 2026-06-19

### Added
- `audit_content` — per-item content evaluation. Takes an array of content items (`heading`/`prose`/`cta`/`label`/`caption`/`metric`/`outcome`) and returns a per-item verdict (`pass`/`warn`/`fail`) with matched UX-writing principle ids, concrete issues grounded in principle text, and a before→after rewrite suggestion, plus an aggregate summary. Deterministic heuristics per type: metrics must carry a number+unit; CTAs/labels must be action-led and ≤4 words; prose flags passive voice, jargon, and hedging; headings flag filler openers and buzzwords; captions flag duplication of any heading in the batch. Pure offline — no network or browser. Use it instead of `evaluate_design` when you need per-item verdicts rather than the principle library. `src/content-audit.ts` is unit-tested (32 cases).
- `audit_typography` — typographic-scale report over rendered DOM text nodes (`url` mode) or a supplied `nodes` snapshot. Detects the dominant modular-scale ratio (~1.2/1.25/1.333/1.5) and flags off-scale sizes, checks line-height consistency against the body rhythm, and flags weight ladders with >4 weights or non-standard CSS values. Returns `scale`, `line_height`, `weight_ladder`, `nodes_analyzed`, and `findings[]`. Complements `audit_page`'s pass/fail typography checks with a focused scale analysis. `src/typography.ts` is unit-tested (20 cases incl. live-chromium). Requires headless chromium for `url` mode.
- `audit_tap_targets` — WCAG 2.5.5 / Apple 44pt web tap-target audit. Collects every interactive element (`a`, `button`, `[role=button]`, form controls, `summary`, `label[for]`, `[onclick]`, `[tabindex>=0]`) from a rendered URL or a supplied `elements` snapshot and emits a per-element fix table for any below the minimum (default 44px): selector, role, text, measured w/h, per-axis pixel deficit, and a concrete CSS fix — sorted worst-first. `src/tap-targets.ts` is unit-tested.

### Changed
- `src/capture.ts` — blank-video detection now classifies each artifact with a `reason` (`preload-none` / `autoplay-blocked` / `empty-src` / `decode-error` / `unknown`) plus raw `errorCode`/`networkState` evidence, via a unit-tested pure `classifyVideoArtifact` helper. Adversarial verification now tags `empty-src` and `decode-error` as **confirmed** defects while `preload-none`/`autoplay-blocked` stay `likely-artifact` — so a genuinely broken video is no longer rubber-stamped as a lazy-load artifact. Backwards-compatible (existing `preload` field unchanged).
- `src/ios-capture.ts` — added `checkSnapshotWiring`, a pure, unit-tested preflight that verifies the `AccessibilitySnapshot.swift` + hosted-UITest-target wiring required for e2e iOS capture and returns actionable `missing`/`guidance` (including the Xcode 26+ `SWIFT_ENABLE_EXPLICIT_MODULES=NO` recommendation). `scripts/ios-audit.mjs` surfaces this guidance (warn-only) when run without a captured snapshot, so setup gaps are caught before build iterations are spent.

## [1.9.0] - 2026-06-19

### Added
- `audit_url` — Layer 0 render-and-capture audit transport. Renders a **live URL** at each viewport×theme (default: iphone 393×852, desktop 1440×900, wide 2160×1200 × light/dark), scroll-settles (fires whileInView/IntersectionObserver reveals and plays videos), fires `hover`/`click`/`focus` interactions, and captures real pixels + the rendered DOM. Then it runs the existing checks over the captures — the shared `audit_page` rule engine, per-element WCAG contrast, responsive-visibility (desktop-shown/mobile-hidden), blank-media detection — **plus** new pixel checks: sliced-image **edge-symmetry** detection and **hover-state white-wash** detection (baseline-vs-interaction screenshot diff). Every finding is tagged `confirmed` / `likely-artifact` / `inconclusive` with its evidence and ranked by severity. This is the tool that catches real-world visual nits invisible to HTML-string/geometry audits: cropped images, blank videos, hover white-wash, sliced exports, and hidden-on-mobile content. Requires headless chromium.
- `src/audit-url.ts` — the orchestrator (viewport×theme loop, finding aggregation, verdict tagging, severity ranking). Reuses the existing capture/check functions rather than forking them.
- `src/page-checks.ts` — the `audit_page` rule engine extracted verbatim into a shared, pure `runPageChecks(html, opts)` so `audit_page` **and** `audit_url` run the exact same checks over (rendered) HTML, one implementation. `audit_page` behavior is unchanged.
- `auditImageEdges` in `src/asset-integrity.ts` — scores per-edge luminance variance of rendered `<img>` elements (collected in-page via canvas) to flag content cut off at a frame edge (asymmetric edge → `likely-sliced`); pure + unit-coverable.

### Changed
- `src/capture.ts` — `capturePage` gains optional `theme` (emulates `prefers-color-scheme` + sets `data-theme`/class) and `collectImageEdges` (returns per-`<img>` edge-variance samples); `CaptureResult` gains optional `theme` and `imageEdges`. Backwards-compatible — existing callers are unaffected.
- `auditContrastUrl` (`src/contrast.ts`) gains an optional `theme` so contrast can be measured under each color scheme. Backwards-compatible.

## [1.8.0] - 2026-06-18

### Added
- `audit_contract` — new tool (Phase 4). Verifies a wire contract (an ordered token list / field set / `schemaVersion`) is identical across N independent source files (iOS Swift, proxy JS, Android Kotlin). Flags tokens present in some layers but missing in others, `schemaVersion` drift across layers, and the **prefix-ordering bug** — a contained token (e.g. `@WORKOUT`) matched before the longer token that contains it (`@UNWORKOUT`), which silently corrupts directive parsing. Returns a per-layer report + `BLOCK`/`PASS` verdict with enumerated reasons. `src/contract.ts` is pure + unit-tested.
- `audit_api_contract` — new tool (Phase 4). Runs adversarial queries against a live endpoint and returns a per-query verdict — `shape-valid` / `shape-invalid` / `confident-wrong` (shape valid but a declared expectation failed) / `uncertain` (network/non-JSON) — against an expected shape schema (required dot-paths + types) plus per-query `contains`/`equals` expectations. Catches responses that pass shape but are wrong. `src/api-contract.ts` exposes a pure `validateShape`/`getPath` core (unit-tested against a local HTTP server) + a thin `fetch` runner.
- `audit_parity` — new tool (Phase 3). Compares an iOS element snapshot to an Android one against a checklist of named **spatial relationships** (`vertically-centered`, `baseline-aligned`, `left-aligned`, `equal-gap`, `equal-size`, `present`, `same-truncation`) and returns per-relation `match`/`mismatch`/`uncertain` with measured deltas + a `mismatch_count`. Evaluates the relationship on each platform and flags when they differ — catches cross-platform drift like status text vertically centered to an icon on one platform but top-aligned on the other (a class that previously shipped past device-verified parity claims). `src/parity.ts` is pure + unit-tested.
- `audit_ios_a11y` — new tool (Phase 3). Scores an accessibility-enriched iOS element snapshot: missing `accessibilityLabel`/value/traits on interactive elements, sub-44pt tap targets, per-text WCAG contrast (reusing the `contrast.ts` math; iOS semantic colors warn not fail), Dynamic-Type clipping, and VoiceOver reading order. Returns grade/score/errors/warnings + `voiceover_order`. `src/ios-a11y.ts` is pure + unit-tested. `AccessibilitySnapshot.swift` now also captures element `value` and `traits` (`hint` is not exposed by XCUITest).
- iOS capture interactions + freeze-frame passthrough (Phase 2 of the iOS audit roadmap). `scripts/ios-capture.mjs` gains `--interactions <json>` and `--launch-args <json>`; the `AccessibilitySnapshot` XCUITest now fires each interaction in order (tap / swipe / focus — `hover` is a no-op on touch, use the web `audit_page` interactions for that) and applies `launchArguments` before walking the tree, so transient/animation states are captured deterministically. A `freeze_animation` interaction with `t_seconds` injects `-RAVENFreezeAnimation 1 -RAVENFreezeT <t>` launch args for the app's DEBUG freeze hook to honor (identical args every run = pixel-stable captures). Mirrors the web `interactions[]` shape shipped in 1.7.0. Pure helpers (`parseInteractions`, `freezeLaunchArgs`, `buildLaunchArgs`, `captureEnv`) in `src/ios-capture.ts` are unit-tested; backwards-compatible (no interactions ⇒ Phase 1 behavior).
- iOS device-capable capture orchestration (Phase 1 of the iOS audit roadmap). `scripts/ios-capture.mjs` drives the `AccessibilitySnapshot` XCUITest against a chosen `xcodebuild -destination` — a real device (`--device <udid>` → `platform=iOS,id=…`) or a booted simulator — runs it exactly once (no relaunch loop), reports `sim_runtime_available` for the target OS, and reads back the installed app's CFBundleVersion via `xcrun devicectl device info apps` so the caller can confirm build identity. `--require-device` returns a BLOCKED verdict instead of silently falling back to the simulator. `audit_ios_screen` itself is unchanged — it remains the pure snapshot scorer; this adds the capture step that produces its input.
- `src/ios-capture.ts` — pure, unit-tested helpers for the above (destination construction, `simctl` runtime parsing + availability match, real-device block logic, `devicectl` CFBundleVersion extraction, xcodebuild arg construction). No process spawning; verified against real `xcrun`/`devicectl` output.

## [1.7.0] - 2026-06-18

### Changed
- `audit_page` now accepts an optional `containerMaxWidth` (your design system's canonical content-container width, in px). When set, the `responsive/max-width` check flags content containers that **diverge** from your token — too narrow or too wide — instead of a generic 1200px heuristic. Catches an off-system page (e.g. a `max-w-3xl` 768px container in a 1152px system) that the old check passed clean. With no token passed, behavior is unchanged. (#9)

### Added
- `audit_responsive_visibility` — render a page at multiple breakpoints (default: 390/768/1440/2160px) and flag content elements visible on desktop but hidden on mobile. Categorises each flagged element as likely-oversight (content vanishing on mobile) vs intentional (decorative). Catches responsive-hiding bugs that only surface on real devices. Detects hiding via computed styles (display:none/visibility:hidden/opacity:0/zero-size) and Tailwind responsive classes (hidden md:block). Reports selector, hiding class, visibility per breakpoint, and category for each flagged row.
- `audit_contrast` — compute WCAG 2.1 contrast ratios for every text element on a rendered page and report AA/AAA pass-fail. Returns per-element ratio, delta-to-pass for failures, and aggregated failure count. WCAG math is exact: linearised luminance, 21 for black-on-white, 4.5:1 / 3:1 large for AA, 7:1 / 4.5:1 large for AAA. Replaces manual eyedropper + ratio calculation.
- `src/responsive.ts` — headless renderer and categoriser for responsive-visibility audits.
- `src/contrast.ts` — pure WCAG math (parseColor, relativeLuminance, contrastRatio) plus headless renderer for contrast audits. Exports testable functions so contrast scoring can be unit-tested in isolation.
- `src/capture.ts` — headless Chromium renderer for `audit_page`. New `url` parameter (optional) enables live rendering with Playwright: render the page, optionally scroll to bottom and settle IntersectionObserver / whileInView reveals, play preload=none videos, then audit the live DOM. Includes video-artifact detection: flags `<video preload="none">` elements that render blank (readyState < 2), helping catch unloaded media without false positives on reveal-on-scroll pages. Backwards-compatible: calling `audit_page` with `html` only (no `url`) behaves identically to prior versions. Playwright binary is optional; if missing, a clear instruction guides setup via `npx playwright install chromium`.
- `src/audit-container.ts` — side-effect-free container-width audit helper, unit-testable in isolation.
- `audit_page` — `adversarial_verify` optional boolean. When true, each finding is independently re-checked against the live DOM using a different method and tagged `confirmed` / `likely-artifact` / `inconclusive` with evidence. Returns `adversarial_verification: { debunked_count, confirmed_count, inconclusive_count }` so you only fix real issues, not artifacts of the audit method. Backwards-compatible: absent or false preserves byte-identical prior output.
- `src/image-diff.ts` — pixel-level before/after screenshot comparison. Detects changed regions, changed ratio, and image-derived dimensions (canvas size, brightness, color shift).
- `evaluate_design` — new optional parameters `before_screenshot` and `after_screenshot` (base64 PNGs). When both are provided, returns `before_after_diff: { fix_confirmed, changed_ratio, changed_region, dimensions }` indicating whether the fix actually changed the rendered output. When provided without `description`, gracefully returns the diff only. Backwards-compatible: without screenshots, output is identical to prior versions.
- `audit_page` — `interactions` optional array of `{ selector, event, delay_ms }`. Before capturing, Raven fires each interaction in order (`hover`/`click`/`focus` via native Playwright, so real CSS `:hover`/`:focus` pseudo-classes trigger) and waits `delay_ms`, then screenshots the resulting state. Makes transient/dynamic visual defects — e.g. an on-hover theme-toggle white-wash filter — visible in the capture, where a settled static screenshot showed nothing. Backwards-compatible: absent ⇒ byte-identical prior behavior. (#18)
- `audit_asset_integrity` — given PNG file paths, measures per-pixel luminance variance in the bottom strip (5% of height, min 20px) and flags high-variance bottom rows as `likely-sliced`. Catches content cut off **inside** a correctly-sized export (e.g. a Figma export that ended mid-form) — which dimension/ratio checks cannot detect. Returns path / `bottom_variance` / verdict / confidence per image. (#18)
- `src/asset-integrity.ts` — pure luminance-variance analysis of a PNG's bottom strip, decoded via the optional `pngjs` dependency (graceful no-op when absent), unit-testable in isolation.

## [1.4.0] - 2026-05-19

### Changed
- Content design systems registry tightened to four canonical references: Mailchimp, GOV.UK, Shopify Polaris, and Atlassian. `list_content_systems` now returns 4 systems.
- Refreshed `src/data/principles/laws-of-ux.json` — descriptions tightened and source citations point to primary academic references (Fitts 1954, Hick 1952, Miller 1956, Doherty & Thadani 1982, and others).
- Refreshed `src/data/content/systems/mailchimp.json` — original commentary on the publicly documented voice with an explicit attribution field.

### Added
- `NOTICE` file at repo root — third-party attribution for every upstream source referenced in `src/data/`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1 by reference), and `CODEOWNERS`.
- New "License & attribution" section in README pointing to `NOTICE`.
- `.env` / `.env.*` patterns added to `.gitignore` (defense in depth; no tracked secrets existed).
- `NOTICE` added to the npm `files` allowlist so it ships in published tarballs.

## [1.3.6] - 2026-05

### Changed
- Weekly knowledge-PR pipeline release; minor doc + data refinements.

## [1.3.5] - 2026-05

### Changed
- Security: bumped `@modelcontextprotocol/sdk` and `@anthropic-ai/sdk`, hardened data loading (#5).

## [1.3.3] - 2026-04

### Added
- MCP Registry metadata (`mcpName` + `server.json`).

## [1.3.2] - 2026-04

### Changed
- Equal-height pricing cards on marketing site.
- Full terminal/video swap on homepage — terminal at hero, video lower.
- Audit fixes + live install stats card.

## [1.3.1] - 2026-04

### Changed
- Site content refresh for v1.2 + v1.3.

## [1.3.0] - 2026-04

### Added
- Two-actor / HI-loop service blueprints.
- v1.3 knowledge layers: research methods, service design, brand/visual.
- Persona avatars next to lane labels in blueprints.
- `--debug` flag to dump `logs.list`/`logs.get` shape.
- Backfill script — walks `logs.list` instead of `emails.list`.
- Resend audience backfill script.

### Changed
- Blueprint: match row order across both lanes; stronger actor differentiation; render empty cells as blank instead of em-dash placeholders.
- Site header + metadata rebranded to RavenMCP.
- Nav link added to Updates section. Mailing list CTAs surfaced on the three pages users see.

## [1.2.0] - 2026-04

### Added
- Content design systems — voice, writing principles, copy patterns.
- Raven learns from local usage — passive, insight-only, never leaves the machine.
- Daily digest — in-server injection + launchd agent at 18:00 local.
- Welcome email — dark-mode hardening for Gmail/Outlook.
- End-to-end release automation.
- Weekly knowledge-PR pipeline + release script.
- Claude Desktop Extension (`.mcpb`) packaging.
- Sizzle reel video on homepage; build prompt clip in sizzle reel.

### Changed
- Lead docs install with `npm`/CLI; keep `.mcpb` as secondary.
- OG image switched to compressed JPEG (827KB → 80KB) with dimension meta tags.
- Workflow runtime bumped to Node.js 24.
- Added missing `--space-7` token; replaced hardcoded values with tokens.

### Fixed
- Route `gh`/`git` content through tmpfiles to avoid shell interpretation.
- Map `RAVEN_KNOWLEDGE_PR` secret to `ANTHROPIC_API_KEY` env var.

## Earlier

Earlier versions predate this changelog file; see git history for details.

[1.4.0]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.4.0
[1.3.6]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.6
[1.3.5]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.5
[1.3.3]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.3
[1.3.2]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.2
[1.3.1]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.1
[1.3.0]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.0
[1.2.0]: https://github.com/rhinocap/raven-mcp/releases/tag/v1.2.0
