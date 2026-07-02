# RavenMCP improvement proposal — 2026-07-01

Grounded in: design-judge skill (37-rule catalog, 31-entry corpus, 3-layer delegation model), RavenMCP's current 57-tool surface + 8 parked feature branches, and live research on Claude Design, Paper.design, Dessn, and the broader AI-design-tool landscape.

## 1. Ship what's already built (zero-risk, immediate)

Six feature branches are fully committed but never merged for v1.13.0:

| Branch | What it ships |
|---|---|
| `feat/score-page` | `score_page` — per-category 0-10 design score (craft/typography/hierarchy/a11y/conversion/brand/motion) |
| `feat/audit-video-playback` | `audit_video_playback` — detects non-playing/black `<video>` |
| `feat/audit-consistency` | `audit_consistency` — cross-page corpus audit |
| `feat/layout-orphan-stretch` | orphan-stretch detector added to `audit_layout` |
| `feat/svg-color-compliance` | `tokens/svg-hardcoded-color` page-check |
| `feat/dropdown-menu-pattern` | `dropdown-menu.json` pattern (closes #1) |

`score_page` in particular is competitively load-bearing — it's the single-number "how good is this design" answer that Baymard UX-Ray and generic screenshot-scorers sell as their whole product, and Raven already built it. Land these branches onto current `main` (they were cut from an older base) before anything else below.

## 2. The real opportunity: productize Design Judge's model into Raven

This is the highest-leverage move and the one no competitor has. Design Judge is Andrew's personal, portable design conscience — but its *architecture* is generic and belongs in the MCP, not locked in a personal skill file. Three things Design Judge does that Raven doesn't yet offer to any user:

**a) A taste/precedent corpus that grows from real corrections.** Design Judge's `design-corpus.jsonl` is 31 `wrong→right` records mined from actual mistakes, used to calibrate future critiques and avoid re-flagging accepted patterns. Raven's knowledge base is static (principles/patterns authored once). Add:
- `create_taste_profile` — ingest a project's `DESIGN.md` / rule set into a Raven-managed profile (the Layer-1 "project overlay" concept, generalized).
- `label_finding` — record a correction (`wrong`, `right`, `severity`, `scope: personal|project`) as a durable precedent, exactly like Design Judge's Step 7 label mode.
- `audit_against_taste_profile` — run Raven's deterministic audits *and* the taste profile's calibrated judgment in one pass, deduped by rule_id.

No competitor found (Claude Design, Paper.design, Dessn, Impeccable, onBeacon) has a corrections-become-precedent growth loop. This is the thing Andrew already validated works on himself — turn it into the product's differentiator.

**b) A verdict + false-positive gate contract.** Design Judge's BLOCK/WARN/PASS with mandatory cited `rule_id` + evidence, and "prefer silence over a speculative nit," is stricter than Raven's current score/grade output. Consider a `verdict` field on `audit_page`/`evaluate_design`/`score_page` — one line, no hedging — so agents calling Raven get an unambiguous ship/no-ship signal instead of having to interpret a score.

**c) Negative-prompt severity defaults.** Design Judge's rules carry a `negative_prompt` (what NOT to do, stated for the model). Raven's `fix_priority` output could adopt the same shape — most audit tools return "here's what's wrong," but an explicit negative-prompt form is more directly useful to an agent trying not to regress the same issue next time.

## 3. Competitive positioning — don't chase generation, own the verification layer

The market split cleanly in research:
- **Generation tools** (Claude Design, Paper.design, Dessn, v0, Figma Make, Google Stitch, Superdesign, Lovable/Bolt/Replit) — crowded, well-funded (Anthropic itself just entered with Claude Design), racing on speed-to-prototype.
- **Narrow point-audits** (axe-core, Stark, Chromatic/Percy, Style Dictionary/Supernova) — deterministic but single-surface (a11y-only, or visual-diff-only, or token-sync-only) and mostly human-facing, not agent-consumable.
- **One agent-native critique skill** (Impeccable) — LLM-judgment only, no measurement math, web-only.

Nothing combines deterministic math + MCP-native + multi-platform (web/iOS-SwiftUI/RN) + brand/content/service-design + a taste layer. That combination is unclaimed. Two implications:

1. **Resist scope creep toward generation.** Raven already has `generate_design_system`/`compose_system`/creative-studio tools — fine as-is, but the generation space is where Anthropic's own Claude Design and a dozen funded startups are fighting. Raven's edge is the audit+critique+taste side; don't dilute effort chasing prompt-to-UI generation quality.
2. **Position Raven as the verification backend other tools lack.** Anthropic's own "Design" plugin does WCAG/critique/design-system audits as *prompt-driven guidance* — no measured math. Every generation tool (Claude Design, v0, Paper.design, Figma Make) ships UI with zero audit step. Raven's pitch becomes concrete: "whatever generated this — Claude Design, v0, a human — run it through Raven before you ship it." A short "Verify what Claude Design/v0/Figma Make generated" doc example on the site would make this explicit rather than implied.

## 4. Smaller, concrete gaps still open (from your own ledger, lower priority than #1–3)

- `audit_video_content` (Ken Burns/baked-in pan-zoom detection) — P3, not yet built.
- Section-seam detection (adjacent sibling sections with a jarring background-color seam) — P3, not yet built.
- Perplexity MCP is returning 401 (expired/invalid API key) — surfaced incidentally by this research; check `~/.claude` config or https://www.perplexity.ai/settings/api if you want it working for future research sessions.

## Bottom line

Ship the 6 parked branches first (cheap, already done). Then the one idea worth real effort is #2 — lifting Design Judge's corpus/label/verdict model out of your personal skill and into Raven as `create_taste_profile` / `label_finding` / `audit_against_taste_profile`. It's the one piece of your own working method that no competitor (generation or audit-side) has productized, and you've already proven it works on yourself.
