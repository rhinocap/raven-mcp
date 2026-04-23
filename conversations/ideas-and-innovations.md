# Ideas & Innovations

## Innovations shipped

- **Content design systems layer** (2026-04-22, v1.2.0) — 5 brand voice systems + 11 UX-writing principles + 4 content patterns + 4 new tools. Shipped from one prompt in ~6 hours.
- **In-server daily digest + launchd agent** (2026-04-19) — local-only usage digest delivered at 18:00 daily.
- **Passive usage-insight logging** (2026-04-17) — privacy-by-construction local log (`~/.raven/usage.jsonl`), never leaves machine.
- **OIDC Trusted Publishing for npm** (2026-04-22) — eliminates long-lived NPM_TOKEN + EOTP friction permanently.
- **Single-viewport trademark specimen** (2026-04-22) — install command moved into hero CTA row so one screenshot captures wordmark + install command for USPTO Class 009.
- **External-share draft-to-Zed workflow** (2026-04-22) — global rule: drafts for external surfaces land in `/tmp/drafts/*.md` and open in Zed for style-intact copy-out.

## Ideas to explore

### Raven product
- Submit to MCP registry on modelcontextprotocol.io
- Add `content/` coverage to the Sunday self-audit so recurring UX-writing gaps become auto-filed issues
- Voice-system coverage expansion: candidates include Linear (terse, direct), Vercel (developer-native), Stripe (measured authority), Notion (approachable clarity) — one-prompt additions each
- Content patterns: onboarding tooltips, permission-request copy, billing/dunning sequences, deletion-confirmation modals
- `raven_register` in-product signup feedback loop: on successful register, surface a tool-return confirmation that includes subscriber-count growth so Andrew can see momentum

### Trademark / IP
- Once RAVENMCP is registered, consider filing in EU / UK for defensive coverage if usage spreads
- Maintain a "first use in X class" log so any future expansion has clean dates

### Audience growth
- The #updates form is the only audience-fill path. Idea: A/B the copy above the form (currently generic) against something more specific like "One email per release. Patches are silent."
- Consider a weekly "what's new in Raven" digest seeded from changelog — if subscriber count crosses 50, worth pushing

### Operations
- Revisit reports should be auto-generated at compaction boundaries, not just on `/revisit` — compaction is a natural retrospective moment
- `raven_reflect` could suggest its own follow-up issues based on recurring audit warnings, not just surface them

## Session retrospectives

### 2026-04-22
- Biggest win: same-day ship of content systems layer (one prompt → production in 6 hours) proves Raven's own thesis — AI+HI collaboration compresses weeks into hours when the system prompt is tight.
- Biggest lesson: when Andrew says "use X," default to running X. Paste-prompts are for when he explicitly asks for cross-session handoff copy.
- Emerging pattern: trademark filings benefit from single-viewport specimens. Applied to RavenMCP; worth remembering for any future marks.

## Open questions

- Are there jurisdictions where "MCP" (as a generic technical term) could weaken the mark?
- Should the audience-growth strategy lean on the install ping (ask user to opt in during `postinstall.cjs`) vs. staying purely passive via the web form?
- When does self-audit stop surfacing new gaps and become noise? Need a threshold.
