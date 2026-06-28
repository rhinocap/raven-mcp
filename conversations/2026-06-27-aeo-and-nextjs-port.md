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

### 4. AEO score result + citation fix
Andrew re-scanned Framer AEO: **63 → 96** (top 5%). Findable/Quotable/Understandable 25/25; only gap = Trustworthy 21/25 → "External citation links 0/7". Fixed: added 4 outbound citations (NN/g Nielsen heuristics, Laws of UX, W3C WCAG, modelcontextprotocol.io) in the principles card + FAQ. Live on prod (commit `518adc9`), verified crawler-visible. Mirrored into the port (`5992df9`). Should now hit ~100.

### 5. Next.js port — COMPLETE
All 5 pages ported (Codex workflow), build clean (10 static routes), every page verified faithful eyes-on + clean consoles. Fixed: DocsScripts nav-null guard + nav/footer beforeInteractive; per-page metadata added. Committed+pushed `1c8aef0`. Deployed to "web" Vercel project (prj_zg075…).

### 6. Subdomain staging — LIVE
Per Andrew's choice, staging on next.ravenmcp.ai. Domain ADDED to web project (verified). web project protection = `all_except_custom_domains` → custom domain is PUBLIC (no settings change needed). DNS is GoDaddy (registrar confirmed via WHOIS: GoDaddy.com LLC, Domains By Proxy privacy; nameservers ns57/ns58.domaincontrol.com). Andrew couldn't find it at first — was signed into the wrong GoDaddy account (jiu-jitsu/surf acct genuinely doesn't own it). **DONE (2026-06-28):** cowork instance added ONE record — CNAME `next` → `cname.vercel-dns.com` (1hr TTL), nothing else touched (apex A 76.76.21.21, www, improvmx MX/DKIM, _domainconnect, NS all intact). All 4 bars pass: DNS resolves to Vercel anycast (66.33.60.193/76.76.21.241), HTTPS 200 + valid cert (after ~2min cert issuance), homepage renders (dark theme, raven-nav, hero, v1.12.1 stats), Vercel Domains shows configured. Amber "DNS Change Recommended" nudge (per-project …vercel-dns-017.com target) intentionally left — cname.vercel-dns.com keeps working.

### Drafted DNS /goal
`/tmp/drafts/2026-06-28-dns-next-cname-goal.md` (2114 chars) — handed to cowork to make the GoDaddy CNAME change. Executed successfully.

## State at end of session
- AEO fix (static prod): ✓ live, 63→96, citation fix deployed → expect ~100 on re-scan
- Next.js port: ✓ complete, committed/pushed, builds, all pages verified, deployed to web project
- next.ravenmcp.ai staging: ⏳ domain added, awaiting Andrew's CNAME record
- Deck /goal prompt: ✓ in Zed (for the deck instance)
- Apex cutover (ravenmcp.ai → Next): not done (staging-first per Andrew)
