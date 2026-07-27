<!-- BEGIN raven design-decisions (managed by raven; edits here are overwritten) -->
## Design decisions

This repo keeps its design intent — the resolved rulings on how the UI should look and
behave — in a shared decision graph under `.raven/decisions/`. It is the source of truth
for design choices; a teammate or a prior agent already settled these, and they outrank
your defaults.

Before you choose or change anything visual — color, type, spacing, layout, motion,
component structure, interaction — consult it first:

```
node scripts/consult.mjs <query>
```

Pass a term for the choice you're about to make (e.g. `color`, `spacing`, `motion`,
`layout`). It returns the active decisions that apply. Follow them. If a decision
conflicts with what you were about to do, the decision wins; if you believe it's wrong,
say so rather than silently overriding it.

If nothing matches your query, proceed on your own judgment — there's no ruling yet.
<!-- END raven design-decisions -->

## Target customer (customer-lens-kickoff, 2026-07-09; evolved 2026-07-12)
**Strategic evolution (Andrew, 2026-07-12; boundary clarified 2026-07-18): the TEAM is now the primary customer.** The team paid service is **Morven**, a separate superset product (all of Raven is in Morven; not all of Morven is in Raven) — Raven itself stays the free open-source tier serving the solo indie dev forever. Judge new features through the team lens first (shared workflows, multi-user consent, admin approval, org data handling), while never regressing the indie dev's free "under a minute" path. New-feature kickoffs default to asking the delta question against BOTH lenses.

### Primary lens — the paying team (2026-07-12)
- We are a product/design team (designers + engineers) with an existing design practice and shared tooling (Slack, Figma, a design system in some state of maturity)
- We are trying to make our design decisions, taste, and system knowledge durable and enforceable across people and AI agents
- But our decisions live scattered in Slack threads, meeting notes, and heads — they get re-litigated and lost
- Because no tool maintains a living, queryable decision/taste graph that both humans and coding agents consult
- Which makes us feel like we're paying a coordination tax on every project
- Meets the product: via a team member (often the indie-dev free user) advocating internally; evaluated with IT/admin approval, procurement, and data-handling questions in the room
- Bounces on: anything requiring broad data access without clear consent controls, unclear data retention/LLM handling, per-seat pricing with no obvious team-level win over the free tier

### Free tier lens — the solo indie dev (2026-07-09, retained verbatim)
- I am a solo indie developer/builder, working alone, moderately technical but not deep into the design-tooling space
- I am trying to figure out whether this "design-intelligence MCP server" thing is worth adding to my coding-agent workflow
- But I've never heard of this category before landing here — I don't yet know what an MCP design/taste server even does
- Because design-intelligence-for-AI-agents is a new, unfamiliar product category — there's no existing mental model to slot this into
- Which makes me feel skeptical and a little impatient — is this real, or is it AI-marketing fluff?
- Meets the product: cold, via GitHub/HN/Twitter discovery, no prior context, evaluating solo with no one to ask
- Bounces on: a site that looks less polished than competing tools (undermines the "design intelligence" claim on its face), vague AI-marketing copy that never says concretely what it does, no obvious "try it in under a minute" path
- Expects voice: plain, concrete, show-don't-tell — a working example or before/after beats an adjective-laden pitch; technical enough to trust, not jargon-dense
- Uncalibrated: none — all three interview questions answered

### Feature overrides
- **grab / DESIGN.md feature (2026-07-09):** dual customer — the bound solo indie dev AND design-system-mature teams (existing token vocabulary). Verify both ways: under-a-minute setup + concrete copy for the indie dev; token fidelity, naming rigor, no dumbing-down for the mature team.
- **Slack/messaging decision ingestion (2026-07-12):** TEAM-lens feature (paid tier candidate). Consent, admin approval, and shared-graph semantics are core requirements, not phase 2. Keep a paste-a-thread path that works for the free solo user with zero credentials.
- **Homepage Raven Design video (2026-07-21):** any builder whose coding velocity has outrun their design confidence and who is urgently looking for concrete design solutions—especially designers trying to keep up with AI-fast implementation. Lead with the felt gap between fast code output and slower design judgment—not skepticism about Raven or the MCP category. Make visible canvas transformation the primary payoff; reuse and agent handoff are supporting proof. Use no synthetic captions, narration, or music.
