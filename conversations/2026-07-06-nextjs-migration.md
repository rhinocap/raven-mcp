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

### Trim copy + unify terminals (Andrew: "way too much content for the new stuff… terminals are different sizes… all terminals should be uniform size")
**What:** (Copy) #cinematic subtitle 65→27 words; #judge left text column (eyebrow pill + duplicate h2 + paragraph + 3 bullets, ~126 words) deleted entirely, keeping only the section-header subtitle; audit_taste terminal content unchanged. (Terminals) #judge was a 2-col `.judge-grid` (terminal rendered 668px, overflowed mobile) → restructured to a single centered `.recipe` wrapping the terminal, mirroring #cinematic; `.static-term-body` min-height:360px → #judge & #cinematic height-identical; `.hero-visual` max-width 900→760 so all three terminals share one width (760 desktop cap / full-width mobile). Deleted dead rules: `.judge-grid`(+@media cols), `.judge-text`(+h2,>p), `.eyebrow-tool`, `.judge-proof`(+li/strong/svg/code), `.recipe .static-term-body` override.
**Why:** Editorial restraint (show, don't restate the terminal) + fix the awkward terminal size mismatch.
**Verified:** build green; DOM-measured all 3 terminals 466px wide (mobile) + 2 static bodies 464×360 identical; eyes-on both terminals render clean (judge centered, no dup h2, new caption; cinematic build_hint identical box). Raven audit_taste PASS (raven-mcp binding, no hype verbs); design-judge PASS (net restraint win, −49 lines). Codex devil's-advocate (report-only): its "hero terminal not uniform" flag was a mobile-override conflation — on desktop hero/static share identical padding+line-height, hero only taller (620 vs 360) to hold the typing anim; word-count nit (27 not 26) noted. Collision check clean (feat/nextjs-migration local-only; P4 touches only backend).
**Committed:** bb89e90 (NOT pushed — feature branch).
**Open interpretive edge for Andrew:** the hero sizzle-reel is width-matched but stays taller than the two static terminals by design (animated showpiece). If he meant literally all-three-same-height, that's a follow-up (would compromise the hero animation's room).

### Three-terminal Taste Engine lifecycle (Andrew: "three terminals, one initial interview, then the one showing now, then kicking off a project")
**What:** Replaced the single `#judge` audit_taste terminal with THREE telling the Taste Engine lifecycle in a stacked trio: ① `get_taste_interview — fieldnotes` (calibrate: `existing_binding null`, the 12-dimension blocking interview), ② `audit_taste — raven-mcp` (the existing BLOCK verdict, "showing now", unchanged), ③ `bind_taste_surface — fieldnotes` (kick off: bound surface + design_notes as acceptance criteria). Each wrapped in a `.lifecycle-step` with a mono step-label (01 Calibrate / 02 Audit / 03 Kick off; blue `.step-num`). `.judge .recipe` → `display:flex; flex-direction:column; gap:var(--space-12)`; `.judge .static-term-body{min-height:0}` (trio is content-sized, NOT the 620px hero-match). Subtitle tweaked to "calibrated once, enforced on every build, carried into every new project" (maps 1:1 to the 3 steps; plain verbs); caption pluralized.
**Layout decision (Fable 5 plan, option c):** three 620px boxes = ~1900px dead space right after Andrew's trim ask; 3-across row breaks 13px mono. Instead: author all three `<pre>` at EXACTLY 12 lines (= the pre-existing audit_taste count) so at one shared width+line-height they render pixel-identical with no min-height hack. Uniform *as a sequence*; hero + #cinematic keep their 620px (prior "uniform" directive survives where it still applies). One truthfulness fix to the plan: ① interviews `fieldnotes` (a genuinely unbound project → `existing_binding null` is truthful) not raven-mcp (which is bound), and ①→③ become one coherent calibrate→bind flow bracketing the live ② audit.
**Verified:** build green; DOM @1440px: all 3 terminals 760×408, bodies 758×360 — PIXEL-IDENTICAL; step-num = rgb(0,191,255)=#00BFFF. Mobile @390px: 3× 358×361 uniform, `docScrollX:false` (wide mono scrolls inside each terminal's own overflow-x:auto, page body doesn't). Eyes-on desktop + mobile: reads as clean top-to-bottom lifecycle, syntax coloring consistent, no card-soup. Line-count re-counted by hand: ①②③ all exactly 12 lines. Raven audit_taste (raven-mcp binding, text mode): **PASS** (0 findings; one-warm-orange skipped out-of-scope; voice_note "no hype verbs"). design-judge Layer 2: **PASS** (no findings — blue accent in-scope for product-site, restraint held, px on component labels matches existing .replay-caption/.realm-tradition pattern). Codex devil's-advocate: running.
**Committed:** pending Codex clear (NOT pushed — feature branch).

## State at end of session
- Static-site grid dimming: committed on feat/nextjs-migration (2972de4)
- Next.js content port: DONE + verified on feat/nextjs-migration (f5b5d37, 229375c)
- Full-site grid: DONE + verified, committed cfba187
- Copy trim + terminal uniformity: DONE + verified + gated, committed bb89e90
- Pending (carried forward):
  - Andrew judges grid brightness live @ localhost:3200 (opacity:0.72 = the dial; may want dimmer)
  - Andrew: does "all terminals uniform" mean the hero sizzle-reel too? (currently width-matched but taller by design)
  - Phase 4: preview deploy + audit_taste/audit_page on Vercel URL
  - Phase 5–6 (HIGH RISK, needs P4 coord): MCP proxy rewrites in web/next.config.js (/api/mcp, /api/mcp-user, /.well-known/*) + curl verify; domain flip with rollback
