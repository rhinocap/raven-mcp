# Raven MCP

**Odin's ravens brought back knowledge of the world — Raven brings back design intelligence.**

A design knowledge MCP server that Claude can query when generating UI. Five layers: principles, patterns, content design systems, business strategy, and design tokens.

## What it does

Raven gives Claude access to a comprehensive design knowledge base:

- **Principles** — Nielsen's 10 Heuristics, all 21 Laws of UX, Gestalt principles, WCAG accessibility, typography rules, color theory, mobile UX, D4D framework, and UX writing principles
- **Patterns** — Proven UI patterns for signup flows, pricing pages, navigation, forms, landing pages, dashboards, modals, empty/error/loading states, CTAs, social proof, mobile conversion — plus content patterns for error messages, empty-state copy, notifications, and form validation
- **Content systems** — Voice & tone guides from real brands: Mailchimp, GOV.UK, Shopify Polaris, Atlassian, and Intuit
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
| `list_content_systems` | Browse brand voice & tone systems (Mailchimp, GOV.UK, Shopify Polaris, Atlassian, Intuit) |
| `get_content_system` | Get a brand's voice attributes, tone shifts, vocabulary, grammar, and content patterns |
| `get_content_principles` | Get UX-writing principles — clarity, active voice, error anatomy, inclusive language |
| `get_content_pattern` | Get copy recipes for error messages, empty-state copy, notifications, form validation |
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

## Data structure

All knowledge lives in `src/data/` as static JSON files:

```
src/data/
  principles/   # Nielsen, Laws of UX, Gestalt, accessibility, typography, color, mobile, D4D
  patterns/     # signup, pricing, nav, forms, landing, dashboard, modals, empty/error/loading, CTA, social proof, mobile
  business/     # monetization, retention, onboarding, growth, metrics
  tokens/       # registry.json + systems/ (stripe, linear, vercel, …)
  content/      # voice & tone: Mailchimp, GOV.UK, Shopify Polaris, Atlassian, Intuit
    systems/    # registry.json + brand-voice JSONs
    principles/ # UX-writing principles (clarity, active voice, error anatomy, …)
    patterns/   # copy recipes for errors, empty states, notifications, form validation
```
