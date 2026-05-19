# Raven MCP

**Odin's ravens brought back knowledge of the world — Raven brings back design intelligence.**

A design knowledge MCP server that Claude can query when generating UI. Eight layers: principles, patterns, content design systems, research methods, service design, brand/visual, business strategy, and design tokens.

> Raven MCP is a personal open-source project by [Andrew Cunliffe](https://ravenmcp.ai). It is **not endorsed by, affiliated with, or supported by Intuit Inc.** or any other company referenced in its source data. See [NOTICE](./NOTICE) for full attribution of upstream sources and their licenses.

## What it does

Raven gives Claude access to a comprehensive design knowledge base:

- **Principles** — Nielsen's 10 Heuristics, all 21 Laws of UX, Gestalt principles, WCAG accessibility, typography rules, color theory, mobile UX, D4D framework, UX writing, service design, and brand
- **Patterns** — Proven UI patterns for signup flows, pricing pages, navigation, forms, landing pages, dashboards, modals, empty/error/loading states, CTAs, social proof, mobile conversion — plus content patterns (error messages, empty-state copy, notifications, form validation) and service patterns (service blueprinting, human handoff, signup-as-service, omnichannel continuity, moments of truth)
- **Content systems** — Voice & tone guides from publicly documented brand systems: Mailchimp, GOV.UK, Shopify Polaris, and Atlassian
- **Research** — Qualitative, quantitative, and usability methods with do/don't protocols and checklists. Metrics frameworks: HEART, AARRR/Pirate, North Star Metric, conversion funnel, RICE, OKRs.
- **Service design** — Service blueprinting (with HTML blueprint generation — current vs. ideal state), human-handoff patterns, signup-as-service, omnichannel continuity, moments of truth / recovery, and the GOV.UK Service Standard
- **Brand & visual** — Logo usage (clear space, min sizes, variants, placement, restraint), gradient usage (hierarchy, palette, contrast, trend vs signature), imagery (consistency, representation, purpose), visual hierarchy, brand-as-system, and current (2026) visual-design trends
- **Business** — Monetization models, retention strategies, onboarding optimization, growth mechanics, and product metrics frameworks
- **Tokens** — Design system tokens for Stripe, Linear, and more

## Install

### Claude Code — one command
```bash
claude mcp add raven -- npx -y raven-mcp
```

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

### Claude Desktop — one-click extension
Prefer not to edit JSON? Download [raven.mcpb](https://ravenmcp.ai/raven.mcpb) and double-click it. Claude Desktop installs Raven automatically — no Node, no terminal.

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
| `evaluate_design` | Evaluate a design description against principles |
| `search_knowledge` | Search across all principles, patterns, and strategies |
| `get_checklist` | Get a pre-publish checklist for a UI type |
| `get_d4d_framework` | Get Design for Delight framework templates |
| `list_design_systems` | Browse available design systems |
| `get_design_system` | Get tokens for a specific design system |
| `compose_system` | Mix tokens from different systems |
| `get_brand_system` | Get a full system styled like a well-known brand |
| `audit_page` | Audit HTML/CSS against Raven's quality standards |
| `audit_layout` | Evaluate visual rhythm, alignment, and optical balance |
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
| `raven_reflect` | Summarize your local Raven usage log to find patterns + gaps |

## Release updates

Raven ships new principles, patterns, and brand systems regularly. For one email per minor/major release (patches stay quiet):

- **Web:** [ravenmcp.ai/#updates](https://ravenmcp.ai/#updates) — 10 seconds, one email field.
- **In-product:** ask Claude *"register me for Raven updates at you@work.com"* — Claude calls `raven_register` and you're in.

No marketing, unsubscribe anytime. Powered by Resend.

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
