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

## State at end of session
- Watch-grid build + structural verification: done ✓
- RavenMCP analysis + brand profile + P1–P3 fixes: done & verified ✓
- Design-system reference page (`site/design-system.html`) built + verified + deployed ✓
- **Branched + deployed for review** ✓ — branch `raven-feedback-site-polish` (commit 8997314, pushed); review deploy https://site-jk4zko8iu-cunliffeandrewc-8712s-projects.vercel.app (+ /design-system.html). Memory saved: [[project-raven-site-feedback-branch]] (survives /clear).
- Branch is based on local main (06-19 ancestor); origin/main diverged (changelog + release skill, different files) — reconcile onto latest origin/main before final merge.
- Pending: Andrew's review notes → iterate on the branch; then PR when asked. Still open: video PLAYBACK eyes-on in a real (non-automation) browser; optional — bump locally-connected Raven MCP server to 1.10.0 (lags: audit_url/typography/tap_targets/content unavailable).
