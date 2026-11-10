# Raven MCP

## Ground truth (checked 2026-11-10)
- This repo is PUBLIC and `.claude/` is tracked. Anything committed is published.
- Two Vercel projects. `site` (repo root, `.vercel/project.json`) serves `mcp.ravenmcp.ai`: `/api/mcp` anonymous, `/api/mcp-user` OAuth. `web` (`web/`, Next.js) serves `ravenmcp.ai`; `www` redirects to it.
- Pushing `main` is the production deploy of `mcp.ravenmcp.ai` (recorded since the 2026-07-27 unpin; the Vercel Git setting was not re-read on 2026-11-10). It needs Andrew's fresh approval.
- `web` has no Git integration (`scripts/release.sh`, `.github/workflows/release.yml`). A push to `main` does not move `ravenmcp.ai`. It moves on `cd web && vercel deploy --prod` or on the release workflow's apex step. Both are prod deploys.
- Live on 2026-11-10: `https://mcp.ravenmcp.ai/api/mcp` answers GET with 405 (POST only), `https://ravenmcp.ai/` 200, `https://www.ravenmcp.ai/` 301 to the apex. Deployed commit and version were not checked.
- Test: `RAVEN_NO_USAGE_LOG=1 npm test` (`pretest` cleans and builds `dist/`, then `node --test "test/**/*.test.mjs"`). Site drift: `npm run check:site`. Marketing build: `cd web && npm run build`.
- Contract tests after a build: `node --test test/taste-remote-full.test.mjs test/remote-click-guard.test.mjs`; read the skips.
- Release from a clean, current `main`: `npm run release -- patch|minor|major` (`scripts/release.sh`), or the `release.yml` workflow. A release reaches four surfaces: npm, the MCP Registry record `ai.ravenmcp/raven-mcp`, the git tag and the apex `.mcpb`. Verify each one separately.
- Version is in `package.json` (3.0.0 on 2026-11-10).
- Worktrees share this `.git`: `~/projects/raven-mcp` (main), `raven-mcp-motion` (motion-playground), `raven-mcp-site-fixes` (site-content-fixes). `git worktree list` shows the rest.
- This file was 287 KB until 2026-11-10. The full earlier text is in `docs/claude-md-incident-record-2026-11-10.md`. Each rule below is a one-line summary of an incident recorded there; read the matching part before changing a rule or the code it protects.

## Repository rules
- Derive hosted open-world annotations from actual network guards and public writes; retain the full 45-name partition test.
- Do not infer unchanged annotations from name/metadata pins.
- Compare stdio, anonymous and authenticated tool-name sets.
- Keep private-path AUTHORING_CHECKOUT machine-independent and KNOWN_PUBLISHED empty.
- Parse MCP JSON and Registry `servers[].server`.
- Fail closed on unknown published shasums before resuming or rebasing a release.
- Use remote:false and new FsTasteStore() for stdio probes; isolate remote-runtime builds from browser tests in separate processes.
- Preserve byte-identical stdio behavior and the anonymous 45-name golden set.
- Use main, not retired p4-remote-taste, as the endpoint source.
- Share takedown matching between preview and action; delete images before index rows, retry failures and ignore only ENOENT.
- Keep the save blocklist recheck; do not add a lockfile for the accepted TOCTOU window.
- Re-read blocklists per check, pass the takedown matcher and give owner:self no exemption; treat malformed local lists as [].
- Retain phrase constituents in intent search, match word prefixes and derive taxonomy options from PATTERN_TAXONOMY.
- Return corpus HTML only on request and token mappings with values; do not restore compose_build_prompt.
- Keep third-party proxy sessions capture-only; allow authoring only for exact loopback hosts.
- Persist records before offline thumbnails; disable scripts, network and service workers; never fail capture for render errors.
- Nest image_path with credit in display; attach THIRD_PARTY_NOTICE only to third-party records.
- Store raw transcripts in ignored `.claude/**/agent-output/`; keep reviewed briefs outside.
- Preserve queued drafts when their DOM nodes detach.
- Grade overlay mutants by failing test names, declared skips and nonzero baseline passes; fail on unexpected survivors.
- Apply scrub precision floors at all three consumers.
- Synchronize draft controls in place; validate all restore values before clearing any draft or style.
- Treat STYLE_CATEGORIES edits as Grab payload-contract changes.
- Preserve easing syntax; clamp only x; honor token locks and restore drag-start values on cancellation.
- Keep springs generative-only and test their serialized property values.
- Keep mics in their field-label or section-heading row; exclude email fields.
- Keep browser/raven-grab.js and web/public/raven-grab.js byte-identical.
- Rebuild and reconnect MCP after source changes; inspect npm pack --dry-run after deleting sources.
- Fail cookies closed; enforce Host allowlists/document-only Lax; pin drain session; return capture-only/proxy on every drain.
- Preserve both overlay keyboard propagation guards; consume the private IME send marker once.
- Classify/gate new tools and build before `node scripts/sync-manifest-tools.mjs`; six test files asserted the exact tool count on 2026-08-05, so grep for the count.
- Preserve AuthKit access, WorkOS/Redis, the measured 400KB body cap and Next.js web/ replacement.

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
- **Animation playground (2026-10-29):** Motion Lab's designer (brand/web designer, Framer/Webflow, desktop) reached through Raven; plain designer vocabulary, no engine terms; bounces on too many controls, no usable export, janky preview.
