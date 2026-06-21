# Session: 2026-06-20 — Watch-it-work MacBook feature grid

## Where we left off
Open thread from prior session was the audit_ios_privacy 90683 bug; this session is a separate `/goal`: marketing-site feature grid.

## This session
### "Watch it work" MacBook feature grid (ravenmcp.ai homepage)
**What:**
- Cut the 100s `sizzle-reel.mp4` (1920×1080, single narrative: Claude Code + Raven building/auditing a SwiftUI fitness app on iPhone 17 Pro sim) into 6 loop-friendly beat clips → `site/assets/video/clips/` (mp4 h264 + webm vp9 + poster jpg each). Beats: 01-build(4–16s), 02-layout(20–27s), 03-screen(36–50s), 04-pattern(58–70s), 05-a11y(80–91s), 06-evaluate(92–100s). Re-cut 02 off a black title-card start.
- Replaced the standalone `<video controls>` embed with a new `#watch` section: eyebrow/heading/body + responsive grid (1/2/3 cols at base/640/1000) of 6 cards, each a portfolio-style **MacBook** (DeviceFrame geometry ported to vanilla CSS — lid/bezel/screen/notch/hinge/groove as % of 860×498) playing a beat clip, captioned with real new audit tools.
- Lazy-load JS (IntersectionObserver, webm→mp4 sources, autoplay/muted/loop) — mirrors HighLvl `FeatureClips`.
- Content sync: tool count 32→**55** (meta og+twitter, header "Forty-Four"→"Fifty-Five"); added the 12 missing tool cards (11 new audit tools + audit_ios_screen) to the index tools grid; added "Render & Audit Layer (v1.7–v1.10)" to docs.html with 11 tool entries; docs count 32→55 / 8→9 layers.

**Why:** `/goal` — surface all new capabilities + a grid matching the portfolio + HighLvl landing grids, with sizzle clips in devices.

**Verified (vision/code):** grid renders 6 MacBook cards 3×2 ✓; MacBook chrome geometry correct (zoom) ✓; posters show real reel content ✓; captions map to real tools ✓; old embed gone ✓; 55 tool-cards (grep) ✓; responsive ladder 1/2/3 (stylesheet) ✓.
**NOT verified:** video PLAYBACK — automation Chromium has its media decoder disabled (rs=0 for both codecs even from in-memory blob; play() froze renderer). Clips valid per ffprobe; markup is the proven HighLvl pattern. Needs a real browser.

**Pushed:** NOT pushed. Working tree: `site/index.html`, `site/docs.html` modified; `site/assets/video/clips/` new (31MB). Local range-capable server at http://127.0.0.1:8799 for real-browser check.

### RavenMCP analysis of homepage → brand profile + P1–P3 fixes
**What:**
- Ran ~15 Raven tools across audit/brand/content/knowledge layers on the homepage (audit_contrast, audit_page, get_brand_principles, get_brand_trends, get_content_principles, get_content_system, list_brand_profiles).
- **(a)** Created the canonical RavenMCP brand profile (`create_brand_profile` → `~/.raven/creative/brands/ravenmcp.json`; `list_brand_profiles` 0→1) — colors from live tokens, voice from observed copy, principles encoded as constraints.
- **(b)** Fixed P1–P3 against it:
  - **P1 contrast:** `--text-tertiary` #5C5F68→#8E929C; `.tag` + `.system-tags span` bg flipped from `rgba(255,255,255,.03)` (lightens) to `rgba(0,0,0,.2)` (darkens chip). True parent-chain composite AA fails: **0**.
  - **P1 tap targets:** `.btn-text-link`, `.cta-install`, `.pricing-services-link` → min-height:44px. Sub-44px targets: **0**.
  - **P2 voice/CTA:** tools H2 "The full flight across all realms"→"Fifty-five tools, organized by job"; `get_checklist` desc dropped "raise the raven banner"; elevated install pill to the one high-contrast primary (accent border + blue copy icon). Mythology *story* section left intact (intentional brand voice).
  - **P2 counts/terminology:** hero "Twenty-seven"→"Fifty-five tools…your AI agent"; "Eight"→"Nine" layers (label+H2+terminal); unified groupings to "layers"; **added the 9th layer card (Render & Audit, 20 audit tools)** so Nine is shown, not just claimed.
  - **P3 hygiene:** MacBook chrome bare hex → `--mb-*` device tokens (kept out of the brand palette).
- Caught Raven audit false-positive: audit_contrast/audit_page composite rgba bgs over a light canvas → 78 inflated AA fails; true compositing = 0. Logged to `.claude/raven-opportunities.md` (P1 + P2).

**Verified:** brand profile exists (list_brand_profiles=1) ✓; true-composite contrast sweep 0 fails ✓; tap-target sweep 0 fails ✓; eyes-on hero/layers/tools/9th-card/tag-chips ✓; deployed preview 200 + key strings present ✓.
**Preview:** https://site-nl1atqbi9-cunliffeandrewc-8712s-projects.vercel.app
**Pushed:** NOT pushed (auto-save hook commits locally; no remote push requested).

### "Watch it work" rebuilt — alternating rows + global rhythm (commit 005b243)
**What:** Andrew flagged the watch grid as cramped + "should be alternating; whole site cramped on all devices." Captured live side-by-sides (portfolio + HighLvl) at 1440/390 via Playwright (automation Chrome viewport locks at 500px — used headless instead) → confirmed neither reference is a uniform laptop grid; both are alternating editorial rows. Rebuilt `#watch` from 3×2 `.watch-grid` cards into **6 alternating `.watch-row`s** (big MacBook per beat, copy beside, sides flip `:nth-child(odd)` order-swap ≥900px; DOM text-first for a11y; mobile stacks). Opened global rhythm: container side-pad clamp(16,24)→clamp(20,48), section pad clamp(48,80)→clamp(72,128), section-header margin→clamp 88, --max-width 1140→1200.
**Verified:** deployed-URL eyes-on at 1440+390 — alternating correct, big devices, airy; hero + tools grid unbroken; gutters 48px / section pad 128px measured.
**Deploy:** https://site-3sw3f817c-cunliffeandrewc-8712s-projects.vercel.app · **Pushed:** branch raven-feedback-site-polish (005b243).
**Open:** clip playback needs real browser; header centered vs rows left/right (offered left-align).

### Watch — full-bleed + 2x MacBooks + full-res clips (commit f1edea2)
**What:** Andrew on a Studio Display XDR couldn't read the terminal text; MacBooks too small, sims looked cropped. (a) `.watch-rows` full-bleed (100vw breakout; html/body clip overflow-x), media-weighted tracks 0.78fr/1.22fr that swap with the side (device always larger), `.mb` cap 620→1320px, copy hugs inner edge via justify-self. (b) Re-encoded all 6 clips from the 1920×1080 master at full res (were 1280×720 — the real legibility killer, not the cut points). Mapped the reel's title cards (~18/28/40/52/62/66/96s) via contact sheet; trimmed 02-layout to 20.0–26.3s to clear the 28s card. Diagnosed "sims cut off" as the small device + object-fit cover sliver, not a bad window.
**Verified (deployed URL @2560):** device=1320px (≈2.1×) ✓; no horizontal overflow @2560/1440/390 (mobile 390==390) ✓; terminal commands legible at 1:1 ✓; sims fully shown ✓; clips ffprobe 1920×1080 + live 206/accept-ranges ✓.
**Deploy:** https://site-oegysd6wk-cunliffeandrewc-8712s-projects.vercel.app · **Pushed:** branch raven-feedback-site-polish (f1edea2).
**Open:** clip motion-playback still needs a real (non-automation) browser; Watch header still centered above the alternating rows.

### Watch redesign #2 + layers grid + rhythm + video playback (RavenMCP-grounded)
**What:** Andrew (XDR) flagged 4 hard failures from real screenshots: (1) most videos black/don't play, (2) layers grid 4-wide with a stretched orphan card, (3) Watch rows "willy nilly" — giant device + tiny stranded copy, (4) vertical rhythm still bad; asked "did you use RavenMCP or eyeball it?" Ran `audit_page` (deployed URL @2436, scroll_settle) + `get_pattern(landing-page)` + `get_principles`. Raven confirmed: spacing **25 unique values** ("rhythm breaks past ~7"), 740px container off the 1200 token. Fixes:
- **Videos:** lazy-loader was webm/VP9-first → `v.load()` cleared poster while the big file buffered → black. Now **mp4-only (h264)** + **poster set as CSS background** behind every `.mb-screen` (never pure black). Removed `data-webm` attrs, deleted 6 webm files (clips dir 60M→26M). NOTE: neither Playwright nor claude-in-chrome can decode video (play() freezes the renderer) — playback motion must be confirmed in Andrew's real browser; poster-bg guarantees real content shows regardless (verified 5/6 in headless; 6th was a decode-artifact, poster luma 39 = fine).
- **Layers grid:** `.layers-grid` was the same `flex: 1 1 280px` bug as tools-grid (never fixed) → CSS grid `repeat(3,1fr)` desktop / 2 / 1. 9 cards = clean 3+3+3.
- **Watch layout:** killed the 100vw bleed + 1320 device cap that stranded the copy. Moved `.watch-rows` to section level (outside `.container`), bounded `width: min(100% - 48px, 1840px)` centered, balanced tracks 0.82/1.18fr that swap by side, device max 1080, copy sized up (h3 clamp(24,34), body clamp(17,21)) + hugs inner edge. Device ~1040px on XDR (≈1.67×), text 544px — alternation LEFT/RIGHT/LEFT/RIGHT/LEFT/RIGHT verified deterministically.
- **Rhythm:** snapped ad-hoc clamps to 8px grid — section pad clamp(96,156)→clamp(80,144) (×13), header margin →clamp(48,96), watch gap →clamp(96,160). Raven re-audit: scale-count **25→22**, oddballs 56/88/104/156/168 gone.
**Verified:** deployed URL @2436/1840/1440/390 — device 1040/1010/779px, no overflow any width, layers 3 cols, alternation clean, posters show content; Raven re-audit confirms spacing improved.
**Deploy:** https://site-673utcovf-cunliffeandrewc-8712s-projects.vercel.app · **Pushed:** branch raven-feedback-site-polish.
**Open:** video MOTION still needs Andrew's real browser (automation can't decode); 740px sub-container + 38 sub-13px font-sizes are pre-existing Raven warnings (not today's scope).

## State at end of session
- Watch-grid build + structural verification: done ✓
- RavenMCP analysis + brand profile + P1–P3 fixes: done & verified ✓
- Design-system reference page (`site/design-system.html`) built + verified + deployed ✓
- **Branched + deployed for review** ✓ — branch `raven-feedback-site-polish` (commit 8997314, pushed); review deploy https://site-jk4zko8iu-cunliffeandrewc-8712s-projects.vercel.app (+ /design-system.html). Memory saved: [[project-raven-site-feedback-branch]] (survives /clear).
- Branch is based on local main (06-19 ancestor); origin/main diverged (changelog + release skill, different files) — reconcile onto latest origin/main before final merge.
- Pending: Andrew's review notes → iterate on the branch; then PR when asked. Still open: video PLAYBACK eyes-on in a real (non-automation) browser; optional — bump locally-connected Raven MCP server to 1.10.0 (lags: audit_url/typography/tap_targets/content unavailable).
