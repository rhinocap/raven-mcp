# Raven

## Tagline
Design intelligence and creative orchestration for AI-generated UI and launch assets.

## Description
Raven gives Claude (and any MCP client) a queryable design knowledge base and local-first creative orchestration layer it can reach into while generating UI or preparing launch assets. Eight design layers cover the complete surface of design work: principles (Nielsen's heuristics, the 21 Laws of UX, Gestalt, WCAG, typography, color, mobile UX, D4D, UX writing, service design, brand), patterns (signup, pricing, nav, forms, landing, dashboards, modals, empty/error/loading states, CTAs, social proof, mobile conversion, plus content and service patterns), content design systems (Mailchimp, GOV.UK, Shopify Polaris, Atlassian voice & tone), research methods (qualitative, quantitative, usability) and metrics frameworks (HEART, AARRR, North Star, conversion funnel, RICE, OKRs), service design (blueprinting with HTML output, human handoff, signup-as-service, omnichannel continuity, moments of truth, GOV.UK Service Standard), brand & visual design (logo usage, gradient usage, imagery, hierarchy, brand-as-system, 2026 trends), business strategy, and production design tokens (Stripe, Linear, and more). Creative studio tools add local brand profiles, asset references, character reference profiles, provider-agnostic image/video/3D/audio generation jobs, campaign plans, and transparent creative scoring. Claude calls Raven's tools automatically when you ask it to build, evaluate, improve UI, design a service, or prepare creative production.

## Setup Requirements
None for the default local knowledge and creative-planning tools. Raven ships as a stdio MCP server — no API keys, no accounts. Install with `claude mcp add raven -- npx -y raven-mcp` and Claude can use it immediately. To execute real media generation, optionally set `RAVEN_CREATIVE_RUNNER` to your own renderer command; Raven passes one job JSON object on stdin and never ships provider credentials.

## Category
Developer Tools

## Features
- Get design principles for any UI context (Nielsen, Laws of UX, Gestalt, WCAG, typography, color, mobile UX)
- Pull proven UI patterns for signup flows, pricing, nav, forms, dashboards, modals, empty/error/loading states
- Audit rendered HTML/CSS against Raven's quality standards (`audit_page`, `audit_layout`)
- Evaluate visual rhythm, alignment, and optical balance of any rendered page
- Generate a complete custom design system from a single brand color
- Browse production design tokens from real systems (Stripe, Linear, and more)
- Compose tokens across multiple design systems for hybrid styling
- Get brand voice & tone systems from Mailchimp, GOV.UK, Shopify Polaris, and Atlassian
- Apply UX-writing principles to error messages, empty states, notifications, and form validation
- Get research methods with protocols and checklists (qualitative, quantitative, usability)
- Apply product-metrics frameworks (HEART, AARRR, North Star, conversion funnel, RICE, OKRs)
- Generate service blueprints as standalone HTML — including current-vs-ideal state comparisons
- Get the GOV.UK Service Standard's 14 points for evaluating service quality
- Apply service design patterns (human handoff, signup-as-service, omnichannel continuity, moments of truth)
- Get brand and visual-design principles (logo usage, gradient usage, imagery, visual hierarchy)
- Get current 2026 brand and visual-design trends with usage guidance
- Create local brand profiles, asset references, character profiles, and provider-ready generation jobs
- Plan full creative campaigns across product photos, marketplace cards, UGC ads, TV spots, storyboards, and social launch packs
- Score creative prompts/scripts for hook strength, benefit clarity, channel fit, and brand fit
- Get Design for Delight (D4D) framework templates for empathy-led product work
- Run a pre-publish UI checklist before shipping
- Reflect on local Raven usage to surface knowledge gaps and recurring audit warnings

## Getting Started
- "Audit the home page I just built against Raven's quality standards."
- "Get me Nielsen's heuristics relevant to this signup flow."
- "Generate a complete design system from this brand color: #5B47E5"
- "Show me Mailchimp's voice and tone system, then rewrite this error message in that voice."
- "Generate a service blueprint comparing current vs. ideal state for our onboarding."
- "What are the 2026 brand and visual-design trends, and which fit a fintech audience?"
- "Create a Raven brand profile, register this product image, and plan a launch campaign for web, TikTok, and marketplace."
- "Create a video generation job for a 15-second UGC ad using our saved brand profile."
- "Score this ad script for hook strength and brand fit."
- Tool: audit_page — Audit HTML/CSS against Raven's quality standards. Use after building any UI. Pass `containerMaxWidth` (your design system's canonical container width in px) to flag containers that diverge from your own token instead of a generic 1200px heuristic.
- Tool: generate_design_system — Build a full design system (typography, color, spacing, motion) from one brand color.
- Tool: get_content_system — Get a brand's voice attributes, tone shifts, vocabulary, grammar, and content patterns.
- Tool: generate_service_blueprint — Render a service blueprint as standalone HTML, current-state or current-vs-ideal.

## Tags
design, design-system, tokens, design-tokens, ux, ui-patterns, principles, accessibility, wcag, content-design, ux-writing, voice-and-tone, ux-research, service-design, service-blueprint, brand, visual-design, branding, creative-studio, image-generation, video-generation, campaign-planning, design-intelligence, claude, anthropic, mcp, ai-design, design-review

## Documentation URL
https://ravenmcp.ai/docs.html
