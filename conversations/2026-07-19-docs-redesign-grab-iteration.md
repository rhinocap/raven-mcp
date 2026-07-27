# Session: 2026-07-19 — docs redesign grab iteration

## Where we left off
Bake-off of `/docs` redesign concepts in `~/projects/raven-mcp-site-audit-polish/docs-redesign-concepts/`; Andrew live-iterating `sol3-raven.html` via the Raven grab overlay. He's stepping away, returning later today.

## This session
### sol3-raven.html grab-driven fixes (all applied)
**What:** (1) removed hero chip pills; (2) hero was full-viewport-height for 3 lines — collapsed to normal section padding (clamp 72–120px top / 56–96px bottom); (3) `.rd-section-inner` width now `min(100%, calc(1200px + 2*gutter))` so 1200px is true content width (padding no longer eats into it); (4) code-shell bg `#16161e` → `#0e0e14` for contrast vs `#1a1a22` page.
**Why:** grab payloads #3–#6 from Andrew.
**Pushed:** local files only, not a repo deliverable yet.

### 1200px grid sweep across ALL concepts
fable-1 (main cap → nets 1200), fable-2/3 (1060→1200), sol-1 (76rem→1200+gutters), sol-2 & hybrid (`--content-max` → 1200px+gutters), sol-3 (1100→1200). Andrew on fable-1 at 1200: "It's insane how much better this is" — recorded as taste decision dec_151 (source: user-corrected).

### Design-judge gate
audit_page 100/A, 0 errors; 4 warnings = accepted audit-floor class. Verdict: PASS.

## Infrastructure (needed to resume)
- Raw server: `python3 -m http.server` on **:58710** in docs-redesign-concepts/
- Grab bridge proxy: **:64956**, key `4414d461e3457e955f6736d5983e2bb1632981c18cbc214e65f4957162d0b92e`
- Watch loop: background curl on `/agent/wait?key=...&timeout_ms=240000`, skip `"count": 0` payloads, re-arm after each handled grab
- Grab protocol: each payload's `instruction` = change request → implement immediately, report one line, re-arm

## State at end of session
- sol3-raven: all 6 grab fixes applied ✓
- All 8 concepts on 1200px grid ✓
- Taste decision dec_151 recorded ✓
- Pending (carried forward):
  - Andrew's call on orange accent: "tighten" (code-only orange, chrome→blue) vs "keep"
  - Direction call: fable-1 (now loved at 1200px) vs sol3-raven — possibly fold sol-3 elements into fable-1
  - Whether wider text measures (h1 940 / lede 760) should stretch to full 1200
