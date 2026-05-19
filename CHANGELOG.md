# Changelog

All notable changes to Raven MCP are documented here. Format follows [Keep a Changelog](https://keepachangelog.com). This project adheres to [Semantic Versioning](https://semver.org).

The public web changelog at [ravenmcp.ai/changelog.html](https://ravenmcp.ai/changelog.html) is the authoritative source — this file mirrors it for offline reading and downstream packagers.

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
