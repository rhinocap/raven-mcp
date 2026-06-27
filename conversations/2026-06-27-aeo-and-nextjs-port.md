# Session: 2026-06-27 — AEO fix + Next.js port

## Where we left off
Andrew showed a Framer AEO audit (ravenmcp.ai = 63/100), wanted 100; then `/goal`'d a Next.js port "like the family."

## This session
### 1. AEO fix on static site — SHIPPED TO PROD
**What:** Added `robots.txt` (AI crawlers + sitemap), `llms.txt` (llmstxt.org), `sitemap.xml`, JSON-LD (Organization/WebSite/SoftwareApplication/FAQPage), canonical + meta description, and a visible FAQ section to `site/`.
**Why:** The 63 score was missing exactly these answer-engine signals.
**Pushed:** commit `75cd330` → origin/main; `vercel --prod` deployed. Verified ravenmcp.ai serves all files (200) + JSON-LD/canonical/FAQ on home.

### 2. Next.js port (the /goal) — IN PROGRESS
**What:** Scaffolded `raven-mcp/web/` = Next 14 App Router mirroring gethighlvl-landing. Shell DONE + builds clean: `layout.tsx` (metadata API + JSON-LD @graph AEO), `robots.ts`, `sitemap.ts`, `globals.css` (full design system ported verbatim), `RevealAndCopy` client comp (reveal + clipboard), nav/footer custom-element wiring (hrefs rewritten to clean routes), `global.d.ts`, tailwind (dormant, no preflight).
**Page bodies:** fanned out to 5 Codex agents via Workflow `wf_225d355d-1e8` (home/about/docs/design-system/changelog) — markup→JSX, JS verbatim in client components. Awaiting completion → then integrate, build, run, Raven-audit vs original.
**State:** `web/` all UNCOMMITTED. Vercel still points at static `site/` (not switched until port verified).

### 3. Deck — NOT this instance
Andrew's deck lives in andrewcunliffe-portfolio (different instance, ~140 agents). I only VIEWED it (RAVEN MCP = slides 23–27). Wrote a deck `/goal` prompt for him to hand to that instance: `/tmp/drafts/2026-06-27-deck-goal-prompt.md` (2259 chars).

## State at end of session
- AEO fix: ✓ live on prod
- Deck /goal prompt: ✓ drafted, in Zed
- Next.js port: ⏳ shell done + builds; page bodies in flight (Workflow). Pending: integrate + build + verify + Raven audit + Vercel cutover.
