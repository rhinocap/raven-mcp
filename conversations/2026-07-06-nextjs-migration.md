# Session: 2026-07-06 — Next.js migration + hero grid

## Where we left off
Computer crashed mid site-update. Recovered: one staged, intact uncommitted edit to `site/index.html` (frosted-glass opaque install CTA + 2 copy tweaks). Nothing lost.

## This session
### Recovery
**What:** Reconstructed the interrupted work from git state + JSONL transcript (`1d576e0f`). The "site update" = (a) switch the live site over to the Next.js `web/` project, (b) content updates for the new design judge + newer tools, (c) get the light-up hero hover-grid right.
**Why:** Crash reorientation.

### Hero grid brightness (static site/)
**What:** The interactive hero grid engine is wired into `site/index.html` (9 variants, `?grid=N`, default Beacon). Andrew rejected variant #8 "Radar" (CRT top-to-bottom scanline) and wanted the calm Beacon hover, dimmer. Dimmed: `glow-1` 0.40→0.26, Beacon spotlight peak 0.55→0.36, blue haze 0.05→0.032; added `.hero::after` radial readability scrim behind content; canvas `opacity:0.72`. Kept the recovered opaque frosted install button (answers his "maybe the button is just opaque?" note).
**Why:** "too bright behind the button and some of the content."
**Verified:** eyes-on at localhost:8799 — content reads clean, grid still lights up on hover away from content. Andrew to gauge brightness on the live interactive page. NOT committed.

### Decision — go straight to Next.js
**What:** Andrew chose "straight to Next.js" — stop polishing the static site; port content + the dimmed grid into `web/`, then flip the deploy. `web/` is a STALE port (hero "Fifty-five tools" vs 70, no "The Judge" nav, static `grid-bg` not interactive). Next dev server running on :3100.
**Why:** `web/` (Next.js) is the destination; static `site/` is being retired.

### Migration execution (branch feat/nextjs-migration)
**What:** Fable plan landed. Key reshape: the apex domain (ravenmcp.ai) serves the remote MCP API (`api/mcp.js`, `well-known.js`, OAuth PRM) on the "site" Vercel project, not just marketing — so the deploy flip is a TWO-service migration, and those files are owned by the parallel P4 workstream. Phases 5–6 (MCP proxy continuity + domain flip) need P4 coordination and are high-blast-radius.
**Discovery:** the CURRENT site content (grid engine, #judge, 70-tool tools section, nav "The Judge") is committed on `p4-remote-taste`, NOT on main — so it's the porting source, and Fable's "branch off main" would have ported stale content.
**Branch:** created `feat/nextjs-migration` off p4 HEAD (carries current site content as source); committed dimming there (`2972de4`) to get it off the hot backend branch.
**Phase 0:** ✓ staged dimming diff captured to scratchpad; ✓ collision check clean (no instance touching web/); ✓ web/ builds green baseline (exit 0).
**Phase 2 (content+CSS port):** delegated to Codex — hero subtitle, insert #judge (site 2360-2417) + #cinematic (2420-2450), rewrite tools section to 70 tools/4 groups (site 2613-3004), FAQ 55→70, layout.tsx metadata, llms.txt; + globals.css transplant (judge/cinematic/replay/eyebrow/static-term-body/syntax spans + hero-grid-canvas/scrim/frosted-CTA). Web already has terminal/tool/grid-bg classes (reuse).
**Phase 3 (grid):** authored `web/components/HeroGrid.tsx` — Beacon-only React client component, StrictMode-safe (effect-local state + full cleanup), reduced-motion static draw. NOT yet wired into page.tsx (waits for Codex to finish editing page.tsx).

### Port completed + verified (commits f5b5d37, 229375c)
**What:** Reviewed Codex port; wired `<HeroGrid/>` into hero; fixed the JSX `<pre>` newline-collapse bug (both taste-quote terminals — audit_taste BLOCK verdict + build_hint recipe — via `dangerouslySetInnerHTML` template literals w/ raw `class=`). Build green.
**Eyes-on (headless Chrome @ localhost:3200):** ✓ #judge audit_taste terminal renders multi-line w/ syntax spans; ✓ #cinematic build_hint terminal renders all 9 lines w/ spans + em-dash; ✓ tools section = 70 tools / 4 groups (Know/Create/Audit/Judge... actually 6 group cards w/ counts), headline "Seventy tools, organized by job"; ✓ hero subtitle "70 tools" copy.
**audit_taste (raven-mcp binding, product-site):** caught 2 Codex persuasion-word infidelities — "Field-tested"→"Proven" (×2 spots). Restored source-verbatim → VOICE warn cleared. Remaining BLOCK (FAQ inline prose link 189×21 <44px) + WARN (60 brand-icon hardcoded colors) are BOTH inherited byte-identical from site/index.html — not port regressions, known-acceptable at site's 94/B floor.
**Grid:** HeroGrid Beacon canvas wired; at-rest faint (baseGrid 0.02) so hover glow not visible in static shots — Andrew to judge brightness live at localhost:3200.

### Full-site grid (Andrew: "make the grid scroll for the entire site, not just the hero")
**What:** Promoted the Beacon canvas from hero-only to a fixed full-site backdrop. HeroGrid moved OUT of .hero to a direct child of <main> (so z-index:-1 isn't trapped by hero overflow/reveal stacking contexts); listeners on window (clientX/Y map 1:1, no scroll math); touch guard; removed 4 static .grid-bg divs + the .grid-bg CSS rule (moiré against live 40px grid). .hero-grid-canvas: position:fixed; z-index:-1; mask dropped.
**Why:** Andrew's exploratory ask — full-page interactive grid.
**Verified:** canvas draws spotlight at scrollY 6000 (canvasCenterPixel cyan [0,170,255]); grid visible in gutters over the layers section, behind opaque cards (no card-text washout); hero scrim retained. Build green. design-judge PASS (0 new findings). Codex devil's-advocate: 1 flag ("grid hidden behind body bg") = FALSE POSITIVE (disproven by render; body bg propagates to viewport backdrop below negative-z) — closed with a background-propagation invariant comment in globals.css.
**Committed:** cfba187 on feat/nextjs-migration (NOT pushed — feature branch, awaiting Andrew's live brightness judgment).

## State at end of session
- Static-site grid dimming: committed on feat/nextjs-migration (2972de4)
- Next.js content port: DONE + verified on feat/nextjs-migration (f5b5d37, 229375c)
- Full-site grid: DONE + verified, committed cfba187
- Pending (carried forward):
  - Andrew judges grid brightness live @ localhost:3200 (opacity:0.72 = the dial; may want dimmer)
  - Phase 4: preview deploy + audit_taste/audit_page on Vercel URL
  - Phase 5–6 (HIGH RISK, needs P4 coord): MCP proxy rewrites in web/next.config.js (/api/mcp, /api/mcp-user, /.well-known/*) + curl verify; domain flip with rollback
