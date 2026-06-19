# Changelog

All notable changes to Raven MCP are documented here. Format follows [Keep a Changelog](https://keepachangelog.com). This project adheres to [Semantic Versioning](https://semver.org).

The public web changelog at [ravenmcp.ai/changelog.html](https://ravenmcp.ai/changelog.html) is the authoritative source — this file mirrors it for offline reading and downstream packagers.

## [Unreleased]

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
