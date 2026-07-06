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

## State at end of session
- Static-site grid dimming: done locally, unpaused, uncommitted; awaiting Andrew's brightness gauge
- Next.js migration: PLANNING — Fable plan + content-gap diff running as subagents
- Pending (carried forward):
  - Execute Fable's migration plan: content parity + design-judge updates, grid port to React client component (Beacon only, no Radar), deploy flip with rollback
  - Note: work is on branch `p4-remote-taste` mixed with unrelated P4 backend commits — consider splitting site work onto a `site-*` branch
