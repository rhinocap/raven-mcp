# Raven MCP

**Odin's ravens brought back knowledge of the world — Raven brings back design intelligence.**

A design knowledge MCP server that Claude can query when generating UI. Eight layers: principles, patterns, content design systems, research methods, service design, brand/visual, business strategy, and design tokens.

> Raven MCP is a personal open-source project by [Andrew Cunliffe](https://ravenmcp.ai). It is **not endorsed by, affiliated with, or supported by Intuit Inc.** or any other company referenced in its source data. See [NOTICE](./NOTICE) for full attribution of upstream sources and their licenses.

## What it does

Raven gives Claude access to a comprehensive design knowledge base:

- **Principles** — Nielsen's 10 Heuristics, all 21 Laws of UX, Gestalt principles, WCAG accessibility, typography rules, color theory, mobile UX, D4D framework, UX writing, service design, brand, color-systems (palette-size discipline), and spacing-systems (base-unit grid + scale limits)
- **Patterns** — Proven UI patterns for signup flows, pricing pages, navigation, dropdown/select menus, forms, landing pages, dashboards, modals, empty/error/loading states, CTAs, social proof, mobile conversion — plus content patterns (error messages, empty-state copy, notifications, form validation) and service patterns (service blueprinting, human handoff, signup-as-service, omnichannel continuity, moments of truth)
- **Content systems** — Voice & tone guides from publicly documented brand systems: Mailchimp, GOV.UK, Shopify Polaris, and Atlassian
- **Research** — Qualitative, quantitative, and usability methods with do/don't protocols and checklists. Metrics frameworks: HEART, AARRR/Pirate, North Star Metric, conversion funnel, RICE, OKRs.
- **Service design** — Service blueprinting (with HTML blueprint generation — current vs. ideal state), human-handoff patterns, signup-as-service, omnichannel continuity, moments of truth / recovery, and the GOV.UK Service Standard
- **Brand & visual** — Logo usage (clear space, min sizes, variants, placement, restraint), gradient usage (hierarchy, palette, contrast, trend vs signature), imagery (consistency, representation, purpose), visual hierarchy, brand-as-system, and current (2026) visual-design trends
- **Business** — Monetization models, retention strategies, onboarding optimization, growth mechanics, and product metrics frameworks
- **Tokens** — Design system tokens for Stripe, Linear, and more
- **Creative studio** — Local-first brand profiles, asset references, character reference profiles, provider-agnostic image/video/3D/audio generation jobs, campaign plans, and transparent creative scoring. Raven does not ship media-provider credentials; set `RAVEN_CREATIVE_RUNNER` to route jobs to your own renderer.

## Install

Local stdio (npx / from source) is the **full product**: **93 tools**, including Grab and the file-backed Taste Engine. Hosted endpoints are smaller subsets — pick one path and stick to it.

| Path | How | Tools | Taste | Grab |
|------|-----|-------|-------|------|
| Local stdio | `npx -y raven-mcp` (Claude Code, Cursor `mcp.json`, Codex, Desktop mcpb) | **93** | Yes | Yes |
| Public remote | `https://mcp.ravenmcp.ai/api/mcp` | **~45** | No | No |
| Auth remote | `https://mcp.ravenmcp.ai/api/mcp-user` (OAuth) | Taste + audits (no Grab) | Yes | **No** |

### Claude Code — one command
```bash
claude mcp add raven -- npx -y raven-mcp
```

Prefer **one** Raven entry. If both a local `raven` and a `claude.ai` / remote Raven are connected, the agent sees two overlapping toolsets — disable or rename one (e.g. `raven-local` vs `raven-cloud`) so it is obvious which product you are talking to.

### Manual config (Claude Desktop or team `.mcp.json`)
```json
{
  "mcpServers": {
    "raven": {
      "command": "npx",
      "args": ["-y", "raven-mcp"]
    }
  }
}
```

### Cursor
Same `mcp.json` snippet as above (`~/.cursor/mcp.json` or project `.cursor/mcp.json`) runs the **full local** server (Grab + Taste). Hosted options:

- Public: `"url": "https://mcp.ravenmcp.ai/api/mcp"` — ~45 stateless tools; **no Grab, no Taste**.
- Authenticated Taste: `"url": "https://mcp.ravenmcp.ai/api/mcp-user"` — OAuth; Taste yes, **Grab still local-only**.

### Codex
Add under `mcp_servers` in `config.toml`:
```toml
[mcp_servers.raven]
command = "npx"
args = ["-y", "raven-mcp"]
```

Codex may prompt to approve many Raven tools on first use — that is client approval policy, not a smaller Raven.

### Claude Desktop — one-click extension
Prefer not to edit JSON? Download [raven.mcpb](https://ravenmcp.ai/raven.mcpb) and double-click it. Claude Desktop installs Raven automatically — no Node, no terminal. Package version tracks npm (`1.17.x`).

### From source
```bash
git clone https://github.com/rhinocap/raven-mcp.git
cd raven-mcp && npm install && npm run build
```

## Tools

| Tool | Description |
|------|-------------|
| `get_principles` | Get design principles relevant to a UI context |
| `get_pattern` | Get proven patterns for a specific UI type |
| `get_business_strategy` | Get business/monetization strategies |
| `evaluate_design` | Evaluate a design description against principles. Pass base64 PNG screenshots (`before_screenshot`/`after_screenshot`) for a structured before/after pixel diff with `fix_confirmed`, `changed_ratio`, and changed region. Pass `compact: true` to return only scores and violations (drops full principle/pattern bodies) when the full payload is too large. |
| `search_knowledge` | Search across all principles, patterns, and strategies |
| `get_checklist` | Get a pre-publish checklist for a UI type |
| `get_d4d_framework` | Get Design for Delight framework templates |
| `list_design_systems` | Browse available design systems |
| `get_design_system` | Get tokens for a specific design system |
| `compose_system` | Mix tokens from different systems |
| `get_brand_system` | Get a full system styled like a well-known brand |
| `audit_page` | Audit HTML/CSS against Raven's quality standards — pass `html` for static audit, or `url` to render headless with optional `scroll_settle` (step through reveal gates, then return to top) and `viewport` parameters; `containerMaxWidth` makes container checks token-aware. Also flags inline SVG icons that hardcode a color instead of using `currentColor`/a token. Pass `compact: true` to return only scores, violations, and fix_priority (drops embedded base64 screenshots) when the full payload is too large. |
| `score_page` | Return a per-category (0–10) design score for a page — typography, accessibility, spacing, color, responsive layout, design tokens, structure — derived from the same checks as `audit_page`, plus the overall score/grade, the weakest category, and categories Raven does not mechanically assess (brand, conversion, motion). URL mode also counts determinate contrast failures while keeping indeterminate rows out of numeric scoring. Pass `html` and/or `url` (url capture is local/stdio only; remote rejects `url`) |
| `audit_layout` | Evaluate visual rhythm, alignment, and optical balance; detects orphan-stretch (a lonely last-row grid/flex card stretching far wider than siblings) |
| `audit_responsive_visibility` | Render a URL at multiple breakpoints and flag content elements that are visible on desktop but hidden on mobile (display:none/opacity:0/zero-size) — categorises each as likely-oversight (content vanishing on mobile) vs intentional (decorative) |
| `audit_contrast` | Compute WCAG contrast for rendered text with tri-state `status` (`pass`, `fail`, `indeterminate`), effective backdrops, ratio ranges, and delta-to-pass only where the backdrop is determinate |
| `suggest_contrast_fix` | Given failing WCAG color pairs, return the minimal fg/bg change that clears the AA/AAA target — concrete passing values to fix `audit_contrast` failures |
| `audit_url` | Render a live URL at each viewport×theme, scroll-settle, fire interactions, capture real pixels + DOM, then run the page/contrast/responsive/blank-media checks **plus** sliced-image edge-symmetry and hover-state white-wash detection over the captures — every finding tagged confirmed/likely-artifact/inconclusive, ranked by severity. Pass `compact: true` to return only findings and summary (drops per-capture base64 screenshots) when the full payload is too large. |
| `audit_content` | Per-item content verdicts (pass/warn/fail) for headings, prose, CTAs, labels, captions, metrics & outcomes against UX-writing principles + deterministic heuristics (metric needs number+unit; CTA action-led ≤4 words; prose flags passive/jargon/hedging; caption-vs-heading duplication) — with a before→after rewrite suggestion per item. Pure offline |
| `audit_typography` | Typographic-**scale** report over rendered DOM text nodes (or a supplied snapshot) — detects the dominant modular-scale ratio and flags off-scale sizes, checks line-height consistency vs the body rhythm, and flags weight ladders >4 weights or non-standard values. Goes beyond `audit_page`'s pass/fail typography checks |
| `audit_tap_targets` | WCAG 2.5.5 / Apple 44pt **web** tap-target audit — enumerates every interactive element (rendered URL or snapshot) and emits a per-element fix table: selector, role, text, measured w/h, per-axis pixel deficit, and a concrete CSS fix, sorted worst-first |
| `audit_device_frame` | Flag cropped content in device-mockup frames — `frames` (container box + intrinsic media + object-fit, or a DevTools snippet) detects object-fit:cover crop loss when frame AR ≠ media AR; `clips` (first/last frame PNGs) detects baked-in pan/zoom (Ken Burns); `edge_frames` (PNGs) flags content truncated at a frame edge |
| `audit_video_playback` | Render a page and observe whether each `<video>` actually advances — samples currentTime, readyState, error codes, and autoplay-block state, then classifies each clip into playing | paused | stalled | empty | error with evidence. Catches black/non-playing videos that static frame-capture audits miss. Pass `url` to render and observe, or `dom_snapshot` for deterministic offline classification |
| `audit_consistency` | Corpus/multi-page audit — compares ≥2 pages and flags cross-page divergence in content-container width and hero heading tier, inferring the canonical (modal) value from the corpus when no token is supplied — catching relational defects that single-page audits miss |
| `audit_swiftui` | Audit SwiftUI source against Apple HIG — Dynamic Type, semantic colors, 44pt targets, 4/8pt spacing, AccentColor |
| `audit_ios_screen` | Score a rendered iOS screen from an accessibility/view-hierarchy snapshot — 44pt targets + contrast + rhythm, in points |
| `audit_ios_privacy` | Audit Info.plist (or Expo app.json) /PRIVACY.md/entitlements/source — usage-string honesty, ATS, Android permissions, bundled secrets, undisclosed default data-egress |
| `audit_rn` | Audit React Native / Expo source — touchable a11y labels, 44/48pt+hitSlop targets, font scaling, SafeAreaView, dark mode, against iOS HIG + Android Material |
| `generate_design_system` | Generate a custom design system from a brand color |
| `list_content_systems` | Browse brand voice & tone systems (Mailchimp, GOV.UK, Shopify Polaris, Atlassian) |
| `get_content_system` | Get a brand's voice attributes, tone shifts, vocabulary, grammar, and content patterns |
| `get_content_principles` | Get UX-writing principles — clarity, active voice, error anatomy, inclusive language |
| `get_content_pattern` | Get copy recipes for error messages, empty-state copy, notifications, form validation |
| `get_research_method` | Get qualitative, quantitative, or usability research methods with protocols and checklists |
| `get_metrics_framework` | Get a product-metrics framework — HEART, AARRR, North Star, conversion funnel, RICE, OKRs |
| `get_service_pattern` | Get a service design pattern — blueprinting, human handoff, signup-as-service, omnichannel, moments of truth |
| `get_service_standard` | Get the GOV.UK Service Standard — 14 points for evaluating service quality |
| `generate_service_blueprint` | Render a service blueprint as HTML — current state, or current vs. ideal side-by-side |
| `get_brand_principles` | Get brand/visual principles — logo, gradient, imagery, hierarchy, brand-as-system |
| `get_brand_trends` | Get current (2026) brand and visual-design trends with usage guidance |
| `list_creative_models` | Browse provider-agnostic creative model slots for image, video, 3D, audio, character consistency, and analysis |
| `list_creative_presets` | Browse creative presets: product photoshoot, marketplace cards, UGC ads, TV spots, social packs, storyboards, infographics |
| `create_brand_profile` | Create or update a local brand profile for brand-aware creative jobs |
| `get_brand_profile` | Read a local creative brand profile |
| `list_brand_profiles` | List local creative brand profiles |
| `register_creative_asset` | Register a local path or URL as a creative asset reference — no file bytes are uploaded by Raven |
| `create_character_profile` | Create a local character/identity reference profile from registered assets |
| `create_generation_job` | Create a provider-agnostic image, video, audio, 3D, campaign, or analysis job payload; optionally execute via `RAVEN_CREATIVE_RUNNER` |
| `get_generation_job` | Read a creative generation job and its provider payload/output state |
| `list_generation_jobs` | List local creative generation jobs |
| `plan_creative_campaign` | Plan a multi-asset campaign and optionally create draft generation jobs |
| `score_creative` | Score a prompt/script/concept for hook, benefit clarity, product signal, CTA, channel fit, audience fit, and brand fit |
| `create_taste_profile` | Create a named taste profile — a portable design-judgment ruleset (rule_id, clause, category, severity, negative prompt, owner) + precedent corpus, from explicit rules and/or a DESIGN.md-style markdown doc — persisted locally under `~/.raven/taste/` (`RAVEN_TASTE_HOME` override) |
| `get_taste_profile` | Load a stored taste profile's full rule catalog, precedent corpus, and surface bindings |
| `list_taste_profiles` | List locally stored taste profiles with rule/corpus counts |
| `label_finding` | Append a human accept/revise/reject precedent to a profile's corpus — the growth loop; append-only, and accept-verdicts suppress that pattern in future audits |
| `get_taste_interview` | Calibration interview, two modes. `kickoff` (default, for a NEW project): a deterministic interview built from the profile's voice rules and eleven design dimensions (typography, spacing, color, layout, motion, imagery, entrance/hero animation, loading states, navigation pattern, aesthetic family, specialty libraries — with Next.js suggested as the default build target for sites) — most questions carry plain-language multiple-choice options, the voice question renders the same message in three registers so you pick by ear, a references question invites example URLs/screenshots to be interviewed about, and an open-ended closer captures signature touches (suggesting the ones you chose on other surfaces once it knows them). Every question is skippable (only identity is required). `refine` (for an ALREADY-bound project you're unhappy with): re-interviews against the stored binding — what fell short, keep/tighten/replace each stored note, voice, optional reject precedent. Answers persist via `bind_taste_surface` |
| `bind_taste_surface` | Persist a project's surface calibration — surface string, URL hosts, per-rule severity overrides (incl. `off`), voice note, references — auto-applied by `audit_taste` via `project` or a bound url host. Upserts by project; on a re-bind, omitted fields carry forward from the stored binding (reported as `carried_forward`), while explicit empty values clear them |
| `record_taste_decision` | The learning loop — record a taste/direction/design decision the moment it's made during real work (what was chosen, what was rejected, why, and whether the user directed, approved, or corrected it). Recorded decisions evolve future kickoff interviews: recurring choices return as suggested defaults on their dimension's question, and decision categories no standard question covers become new interview questions |
| `list_taste_decisions` | The decision ledger, filterable by project or dimension |
| `audit_taste` | Judge HTML, copy text, or a live URL against a taste profile — deterministic detectors for gradients, glow/neon, second accent hue, and banned words; pass `source_text` to verify a content port's visible text verbatim with a deterministic word diff; `owner: raven` rules route through Raven's existing page/contrast/tap-target engines; every finding cites a rule_id + concrete evidence (undetectable clauses are reported as `not_assessed`, never guessed); scope-tagged rules activate per `surface` (skipped elsewhere, warn-only when surface is omitted); pass `project` to apply a saved surface binding automatically; `document_kind:'portrait'` skips note-fidelity for documents *about* a surface (rules still run); `data-taste-quote` regions are exempt from detectors so a page is never convicted for quoting the law; verdict BLOCK / WARN / PASS |
| `generate_taste_portrait` | Render a bound taste surface as a self-contained designed HTML page (its rules, notes, voice, decisions, and wrong→right corpus) that obeys the surface it describes — art direction routes by the surface's own color permissions; sparse surfaces degrade gracefully. Omit `project` to render every binding plus a gallery. Every portrait passes `audit_taste` (`document_kind:'portrait'`) against its own surface |
| `raven_reflect` | Summarize your local Raven usage log to find patterns + gaps |

## Decision Graph

The local Decision Graph keeps three node kinds: decisions, evidence, and sources. Five edge types connect them: `supersedes`, `scoped_alongside`, `supports`, `contradicts`, and `derived_from`. Decision status is candidate, active, superseded, or contested; nodes are not hard-deleted.

- `decision_add` — add an active decision with its scope, component, rationale, and rejected alternatives.
- `decision_evidence` — attach quantitative or qualitative evidence to a decision.
- `decision_get` — return one node, its connected neighbors, and attached evidence.
- `decision_list` — list active, superseded, contested, or candidate decisions. Candidates are excluded unless `include_candidates:true` or `status:"candidate"` is passed.
- `decision_draft` — capture a decision before its rationale is confirmed.
- `decision_commit` — confirm a rationale and surface similar active decisions for review.
- `decision_supersede` — replace a decision while keeping both nodes and their lineage.
- `decision_scope` — narrow two active decisions so they can coexist.
- `decision_history` — return a supersession lineage from oldest to newest.
- `ingest_transcript` — store a Source node and return the extraction prompt for the calling model.
- `decision_import` — read local git history and matching decision documents, then return source-bound extraction prompts.
- `ingest_transcript_results` — turn extracted JSON into candidate decisions linked with `derived_from` edges.
- `gap_scan` — rank uncovered components, missing or thin rationales, contested decisions, and derived staleness; `digest_only:true` is quiet when no action is needed.

For a cold start: call `decision_import` → run the returned extraction prompts with a model → pass each result to `ingest_transcript_results` → review the candidates → call `decision_commit` for each decision to keep. Candidates remain available through `decision_get`, but default `decision_list` and `gap_scan` ignore them until commit changes their status to `active`.

Imported provenance is checked against its Source node before evidence is attached. Git references must be a full or unique-prefix match for a commit included by that import. Document references must match the imported path, optionally followed by a line (`#L12`) or heading fragment. Rejected references are returned in `rejected_source_refs`; the candidate remains available without an evidence node.

For transcripts: call `ingest_transcript` → run its extraction prompt → pass the result to `ingest_transcript_results` → review and commit the candidates. Resolve active conflicts with `decision_supersede` or `decision_scope`, inspect lineage with `decision_history`, and use `gap_scan` for health checks.

Evidence nodes and `supports` / `contradicts` edges capture quantitative and qualitative results linked to decisions.

## Click-to-change (grab) + DESIGN.md

**Grab is local-stdio only.** Hosted Cursor/Claude remote endpoints do not expose Grab — click-to-change needs a loopback bridge on your machine. Use local `npx` / Cursor local `mcp.json` when you need Grab.

Raven Grab connects a local page to your agent so you can click an element, describe the change, and send its selector, computed styles, matching DESIGN.md tokens, and token choices back to the session. The bridge runs on loopback and the returned script tag carries the capability key required by its routes.
Computed styles are editable inline, and edits are sent to the agent as `styleEdits`.

Setup takes under a minute:

1. Start your local dev server.
2. Call `start_grab_session` with `proxy_target` set to the local server URL. `path` to a `DESIGN.md` is optional when `proxy_target` is set (Raven creates a minimal temp DESIGN.md); required when you only inject the script without a proxy.
3. Open the returned bridge URL. The overlay is already included on HTML pages served through it.
4. Click elements and enter the changes you want in the Grab panel.
5. Call `get_grabbed_elements` to receive the queued selections and instructions (draining frees queue capacity for later sends).

For a page you control, you can omit `proxy_target` and paste the returned `<script>` tag into the page instead.

Use `read_design_md` to inspect a DESIGN.md file and its flattened token index, `init_design_md` to create one from a stored Raven system, a blank template, or a [getdesign.md](https://getdesign.md) starter, and `update_design_md` to set, rename, or remove one token without rewriting the rest of the file.

## Creative studio

Raven now covers the creative-production workflow around media generation without copying or depending on any closed vendor. The tools are orchestration primitives:

- Store brand kits locally with `create_brand_profile`.
- Register product photos, logos, references, or URLs with `register_creative_asset`.
- Create character/identity reference sets with `create_character_profile`.
- Generate provider-ready payloads with `create_generation_job`.
- Build full campaign shot lists with `plan_creative_campaign`.
- Score creative concepts with `score_creative`.

By default, jobs are saved as local draft payloads under `~/.raven/creative` (override with `RAVEN_CREATIVE_HOME`). To run real media generation, set `RAVEN_CREATIVE_RUNNER` to an executable that reads one job JSON object from stdin and returns JSON on stdout. That runner can call any provider you choose; Raven never stores API keys in source.

## iOS / SwiftUI audits

Raven audits native iOS apps against the **Apple Human Interface Guidelines**, not web/CSS conventions. None of the web-only rules (`lang`, `title`, `flex-wrap`, `clamp`, `max-width`, CSS custom properties, bare hex) run on iOS input — and `get_checklist`/`get_principles` take `platform: "ios"` to return HIG items (Dynamic Type, 44pt targets, SF Symbols, safe areas, dark-mode parity, App Review privacy) instead of the web set.

- **`audit_swiftui`** — paste SwiftUI source (`source`: a string or array of files). Statically flags hardcoded `.font(.system(size:))` below ~13pt, tiny semantic fonts (`.caption`/`.caption2`), hardcoded `Color(red:green:blue:)`/hex literals (vs. asset-catalog or semantic system colors), interactive frames under 44×44pt, and ad-hoc spacing off the 4/8-pt grid. Rewards semantic Dynamic Type fonts, semantic system colors, SF Symbols, and flexible frames. Pass the optional `accent_color_contents` (the raw `AccentColor.colorset/Contents.json`) and it verifies the accent color actually defines components — catching an **empty/undefined AccentColor** that would silently fall back to system blue.
- **`audit_ios_screen`** — the iOS analog of `audit_layout`. Call with no args for the expected snapshot shape and how to capture it (Accessibility Inspector / XCUITest). Call with `{ elements: [{ label, rect, role, fontPt, fgColor, bgColor }], viewport }` (plus an optional base64 `screenshot`) to score 44×44**pt** touch targets, contrast (with iOS `secondaryLabel`/`tertiaryLabel` treated as platform-standard — a warning, not a hard fail), and visual rhythm (alignment, gap consistency, optical balance).
- **`audit_ios_privacy`** — the "no sketchy issues" gate. Reads `info_plist` **or** an Expo `app_json` (managed RN apps have no Info.plist) plus optional `privacy_md`, `entitlements`, and `source`. Flags `NS*UsageDescription` strings that are vague or **contradict the code** (e.g. an `NSHealthUpdateUsageDescription` write claim that `requestAuthorization(toShare: [])` never fulfills), unused entitlements, **Android permissions** (Expo), ATS cleartext exceptions, **secrets/keys shipped in the bundle or `app.json` `extra`**, and **default data-egress paths not disclosed at the point of choice** (a pre-selected "Recommended" option that silently sends personal data to a hosted server).

All three return the same shape as `audit_page` — `score`, `grade`, `summary`, `passes`, `errors`, `warnings`, `fix_priority` (with `audit_ios_screen` adding a `metrics` block).

**One command:** `node scripts/ios-audit.mjs <app-dir> [--snapshot snap.json] [--md report.md]` discovers all the inputs and runs all three tools with an aggregated report.

## React Native / Expo audits

Anyone building a React Native or Expo app gets the same treatment. RN renders to **native** iOS + Android widgets, so `audit_ios_screen` already scores its *rendered* output (an accessibility snapshot is platform-level); `audit_rn` covers the **JSX/StyleSheet source** — the RN analog of `audit_swiftui` — graded against the iOS HIG + Android Material conventions RN has to satisfy on both platforms. `get_checklist`/`get_principles` take `platform: "react-native"`.

- **`audit_rn`** — paste RN source (`source`: a string or array). Flags touchables (`Pressable`/`Touchable*`) missing `accessibilityLabel`/`accessibilityRole`, touchables under 44pt with no `hitSlop`, `allowFontScaling={false}` (silently breaks Dynamic Type), `fontSize` below ~13, screens with no `SafeAreaView`/`useSafeAreaInsets`, and — for multi-mode apps — hardcoded colors with no `useColorScheme`/`Appearance`. Pass `color_scheme: "dark"`/`"light"` (your Expo `userInterfaceStyle`) and the dark-mode check is suppressed for intentionally single-mode apps. Rewards `SafeAreaView`, `hitSlop`, `Platform`-aware code, and a theme.
- **`audit_ios_privacy`** also accepts an Expo **`app_json`** — it audits `expo.ios.infoPlist`, Android permissions, plugins, and scans `expo.extra`/config for secrets and Google API keys.

**One command:** `node scripts/rn-audit.mjs <app-dir> [--snapshot snap.json] [--md report.md]` discovers screens + `app.json` (reading `userInterfaceStyle` so dark-only apps aren't false-flagged) and runs everything.

## Responsive visibility audits

`audit_responsive_visibility` renders a page at multiple breakpoints (default: 390px mobile, 768px tablet, 1440px desktop, 2160px ultra-wide) and flags content elements that are visible on desktop but hidden on mobile — catching the "vanishes on mobile" bug class. Each flagged element is categorised as **likely-oversight** (content that shouldn't be hidden) or **intentional** (decorative elements). Detects hiding via CSS (`hidden`, `display:none`, `opacity:0`, `visibility:hidden`) and responsive Tailwind classes (`hidden md:block`, etc.).

**Usage:**
- `audit_responsive_visibility(url)` — render at default breakpoints and flag mismatches.
- `audit_responsive_visibility(url, [390, 768, 1440])` — custom breakpoints.
- Optional `viewportHeight` (default: 900px) for tall content.

Returns flagged elements with selector, hiding class, visibility at each breakpoint, and category.

## Contrast audits

`audit_contrast` computes WCAG contrast for every text element, reporting a tri-state `status`: `pass`, `fail`, or `indeterminate`. Determinate rows include `ratio`, `aa`, `aaa`, and `delta_to_aa`; indeterminate rows keep `required_aa` but publish those four metrics as `null`. Gradient and layered backgrounds expose `effective_bg` plus `ratio_min` / `ratio_max` when a trustworthy candidate range exists, and results summarize `indeterminate_bg_rows` / `indeterminate_bg_count` separately from AA failures.

Real-backdrop compositing applies to **URL mode**. Raven walks the rendered DOM ancestor chain, composites parseable colors and gradient layers in CSS paint order, samples gradient interiors, and normalizes modern computed colors through the browser canvas. This intentionally stops at the DOM-ancestor ceiling: opacity, `display:contents`, positioned transparent chains, photos, unsupported layers, and cross-stacking-context sibling backdrops are reported indeterminate; Raven does not pixel-sample across stacking contexts. Snapshot mode retains the pre-existing supplied-`bgColor` / over-white model and announces that scope in `mode_note`.

**Usage:**
- `audit_contrast(url)` — render a live page and audit all text.
- `audit_contrast(dom_snapshot: [{ selector, color, bgColor, fontPx?, bold?, text? }])` — audit a pre-captured snapshot (useful for dynamic or cookie-protected pages).

Returns all text rows with status, determinate failures with delta-to-pass, effective background evidence/ranges, and separate indeterminate summaries. `suggest_contrast_fix` accepts only determinate failing rows; indeterminate or null-ratio evidence is skipped rather than converted into a fake color recommendation.

**WCAG math:** Contrast ratio uses linearised luminance (WCAG 2.1 § 1.4.3) — black-on-white is exactly 21, white-on-black is exactly 21. Large text (18.66pt+ bold or 24pt+) needs only 3:1 / 4.5:1 AAA; regular text needs 4.5:1 / 7:1.

## Headless browser audits

`audit_page` can render a live URL in headless Chromium, scroll to settle reveal-on-scroll elements, and play preload=none videos before capturing — preventing false "blank section" reports caused by whileInView states that haven't fired yet.

**Usage:**
- **Static HTML mode** — pass `html` string for immediate static analysis (existing behavior, no change).
- **Rendered URL mode** — pass `url` (full HTTP/HTTPS URL). Raven launches Chromium, renders the page, optionally scrolls, and audits the live DOM.
  - `scroll_settle: true` — scroll from top to bottom in viewport-height steps with a short pause at each step so `IntersectionObserver` / whileInView thresholds can fire, recomputing page height as lazy content appears and requiring consecutive stable-height observations at the bottom. Raven then waits for finite animations triggered anywhere in the walked page before returning to the top and re-settling for capture. Smooth scrolling is temporarily neutralized. The whole walk/settle is capped at 4s; if a very long, continuously growing, or still-animating page cannot fully settle, Raven emits a capture warning rather than silently trusting the result, and `animationsSettled` remains false. Unloaded videos (preload="none") are played to detect if they render blank.
  - **Entrance-animation settle (always on)** — before extracting content or screenshotting, Raven polls `document.getAnimations()` until no finite animation in or near the viewport is still running (infinite spinners/loops are ignored), capped at 3s by default. Library callers can set `animation_settle_timeout_ms` (hard maximum 10s). Pages whose heroes enter via `animation-delay` + `backwards` fill are captured settled, not blank or mid-flight; `animationsSettled` in the capture metadata reports whether quiescence was reached.
  - **False-blank detection (always on)** — at capture time Raven measures text-bearing leaf nodes and media/content elements across the captured page. If more than 30% are effectively invisible through `opacity:0`, `visibility:hidden`, or a fully transparent text color, `capture_warnings` includes `reveal-gate-false-blank: …` so capture-backed audit callers know the rendered audit may be untrustworthy.
  - `viewport: { w, h }` — set the render viewport (default: `{ w: 1440, h: 900 }`).

**Video artifacts detection:** If any `<video>` with `preload="none"` (or missing preload) renders with `readyState < 2` (i.e. would show a black box in a screenshot), Raven flags it as an `unloaded-video-artifact` in the result. This is **informational** — not a pass/fail — since preload=none is often intentional. On cookie-protected hosts, video requests may fail because iOS/Android media daemons don't send cookies; Raven notes this to help you troubleshoot (e.g. disable deployment protection, use a token-based bypass).

**Adversarial verification:** Set `adversarial_verify: true` to independently re-check each finding against the live DOM using a different method. Findings are tagged:
- `confirmed` — the finding is real on the live page (e.g. missing `<title>` in the rendered DOM)
- `likely-artifact` — the finding is an artifact of the static audit method (e.g. a `<video preload="none">` rendered blank, which is expected behavior, not a missing resource)
- `inconclusive` — the finding cannot be independently verified (e.g. aggregate rules like color-palette size)

The result includes `adversarial_verification: { debunked_count, confirmed_count, inconclusive_count }`, where debunked_count is the number of likely-artifacts. This surfaces false positives so you only fix real issues. Backwards-compatible: when `adversarial_verify` is absent or false, the output is identical to prior versions.

**Setup:** First time only, run `npx playwright install chromium` to download the browser binary. If the binary is missing when you call audit_page with `url`, you'll see a clear instruction to run the install command.

## Before/after design diffs

`evaluate_design` can now accept base64-encoded PNG screenshots to measure whether a fix actually changed the rendered output.

**Usage:**
- Pass `before_screenshot` and `after_screenshot` (both base64 PNGs, with or without the `data:image/png;base64,` prefix).
- Raven returns `fix_confirmed: true` if the images differ by > 0.1% of pixels (accounting for jpeg/PNG decode variance).
- `changed_ratio` — exact fraction of pixels that changed (0–1).
- `changed_region` — bounding box `{ x, y, w, h }` of the changed pixels (null if no changes detected).
- `dimensions` — image-derived measurements (canvas size, brightness, color shift) as context, with the caveat that these are pixel-level proxies, not Raven principle scores.

When before/after screenshots are provided alongside a `description`, `evaluate_design` returns both the principle-based evaluation and the pixel diff. When screenshots are provided without a description, the evaluation gracefully skips the principle search and returns the diff only. Backwards-compatible: without screenshots, the tool behaves identically to prior versions.

## Release updates

Raven ships new principles, patterns, and brand systems regularly. For one email per minor/major release (patches stay quiet):

- **Web:** [ravenmcp.ai/#updates](https://ravenmcp.ai/#updates) — 10 seconds, one email field.
- **In-product:** ask Claude *"register me for Raven updates at you@work.com"* — Claude calls `raven_register` and you're in.

No marketing, unsubscribe anytime. Powered by Resend.

## Start every project calibrated

Taste is per-surface: the same designer wants monochrome one-accent rules enforced on their portfolio and *none* of them on a product site, with a slightly different voice on each. The Taste Engine handles this with a **kickoff interview** (once per project — every question skippable, most with plain-language multiple-choice options, from navigation pattern to aesthetic family to specialty libraries) whose answers persist as a surface binding that every future audit applies automatically. And when generated work misses, `mode:'refine'` turns that dissatisfaction into a re-interview against the stored binding instead of a dead end.

Raven ships this flow in its MCP server instructions, so agents that honor server instructions (Claude Code, Claude Desktop) run the interview at project kickoff on their own: `get_taste_interview` → ask the user → `bind_taste_surface` → done. If your client doesn't surface server instructions — or you want the ritual to be non-negotiable — add one line to the project's `CLAUDE.md` / `AGENTS.md`:

```markdown
Before the first design/UI/copy work in this repo, run Raven's get_taste_interview
(profile <name>, project <repo-name>); if existing_binding is null, ask me its
questions and persist with bind_taste_surface. Pass project:'<repo-name>' on every
audit_taste after that.
```

Already-calibrated projects cost one cheap call (`existing_binding` comes back non-null and the agent proceeds). Uncalibrated audits still work — scoped rules just demote to warn and the result carries a `calibration_hint` — so calibration is never a wall, only a sharpener.

## Learning loop

Raven keeps a small **local-only** log of how you use it so you (and Claude) can spot which patterns you build most often and which gaps show up again and again.

- **Location:** `~/.raven/usage.jsonl` (override with `RAVEN_USAGE_LOG=/path`).
- **What's written:** tool name, timestamp, elapsed ms, and a tiny insight object — audit score/warning rule names, pattern `type`, brand company name, search layer. **Never the HTML you audit, never prompt text, never brand copy.**
- **What's never written:** raw page bodies, client content, your work product.
- **Disable entirely:** `RAVEN_NO_USAGE_LOG=1`.
- **Reflect:** ask Claude *"what have I been using Raven for?"* and it will call `raven_reflect`, which reads the log locally and summarizes the last N days — most-used tools, recurring audit warnings (likely knowledge gaps), patterns you request most, design systems you reach for.

Nothing is sent to a remote server. If a recurring gap is worth turning into a new Raven principle or pattern, you file an issue by hand — the automated pipeline at [github.com/rhinocap/raven-mcp](https://github.com/rhinocap/raven-mcp) handles it from there.

## Development

```bash
npm run dev    # Run with tsx (hot reload)
npm run build  # Compile TypeScript
npm start      # Run compiled output
```

## License & attribution

Raven MCP is released under the [MIT License](./LICENSE) — Copyright (c) 2026 Andrew Cunliffe.

If you fork, embed, or redistribute Raven (in whole or in part), retain the MIT license notice and the `LICENSE` file. If you ship Raven inside another product, include attribution to "Raven MCP — https://ravenmcp.ai" in your acknowledgements.

Raven's knowledge base paraphrases and references work from many third-party sources — Nielsen Norman Group, Laws of UX (CC BY-NC-ND 4.0), Gestalt principles, WCAG (W3C), Mailchimp (CC BY-NC 4.0), GOV.UK (Open Government Licence v3.0), Shopify Polaris, Atlassian Design, and others. Each entry carries a `sources` URL field. See [NOTICE](./NOTICE) for the full list of upstream sources and license terms; some carry their own conditions beyond MIT.

This is a personal project. It is not endorsed by Intuit Inc. or any other company referenced in its source data.

## Data structure

All knowledge lives in `src/data/` as static JSON files:

```
src/data/
  principles/      # Nielsen, Laws of UX, Gestalt, accessibility, typography, color, mobile, D4D
  patterns/        # signup, pricing, nav, forms, landing, dashboard, modals, empty/error/loading, CTA, social proof, mobile
  business/        # monetization, retention, onboarding, growth, metrics
  tokens/          # registry.json + systems/ (stripe, linear, vercel, …)
  content/         # voice & tone: Mailchimp, GOV.UK, Shopify Polaris, Atlassian
    systems/       # registry.json + brand-voice JSONs (Mailchimp, GOV.UK, Polaris, Atlassian)
    principles/    # UX-writing principles (clarity, active voice, error anatomy, …)
    patterns/      # copy recipes for errors, empty states, notifications, form validation
  research/        # study protocols + metrics frameworks
    principles/    # research fundamentals (method match, bias, sample size, ethics, triangulation, …)
    methods/       # qualitative, quantitative, usability
    frameworks/    # HEART, AARRR, North Star, conversion funnel, RICE, OKRs
  service-design/  # service-level principles + patterns + frameworks
    principles/    # Stickdorn, Shostack, peak-end, moments of truth, handoff
    patterns/      # service blueprinting, human handoff, signup-as-service, omnichannel, moments of truth
    frameworks/    # GOV.UK Service Standard (14 points)
  brand/           # brand & visual design
    principles/    # logo, gradient, imagery, hierarchy, brand-as-system
    trends/        # 2026-current.json
```
