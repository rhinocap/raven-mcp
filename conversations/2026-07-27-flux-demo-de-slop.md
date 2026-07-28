# Flux demo page — de-slop pass (2026-07-27)

Per-instance log. Shared context lives in `2026-07-25-distribution-channels.md`.

## The ask

> "I feel like the page could use a pass at not looking like AI slop because
> while it looks ok, it's very clearly been donw with AI"

Two scoping answers pinned it:

- **Which page** → the **Flux demo page** (`demos/saas.html`), not the ravenmcp.ai
  homepage. This is the fictional developer-analytics sample site the new
  `saas.mp4` hero video landed on.
- **How far** → **Re-craft**: remove the tells *and* break the center-stack that
  is itself the AI signature. Left-aligned hero, asymmetric feature rhythm,
  hairline rules instead of a bordered box around everything, a real type scale.

He granted the page "looks ok" — this was craft, not rebuild. He did **not**
pick the third option (rebuild the register), which would have broken
consistency with the other five demo pages.

## The tells, and what replaced them

The critique was a catalogue with line citations, not an impression. Fourteen
items; the ones that carried the "clearly AI" read:

| Tell | Fix |
|---|---|
| Everything center-stacked, every section identical | Left-aligned hero at 660px; numbered editorial feature rows on a hairline rule |
| `Developer analytics<br>that actually ship` — forced `<br>`, "actually" | `See where the work stalls` |
| Four forced `<br>` line breaks total, two "actually"s | All removed |
| `flux.metrics.pulse()` / `.cycles.analyze()` / `.team.health()` — fake API garnish | Deleted |
| Pulsing-dot version pill with a glow | Plain mono line: `v2.4 · anomaly detection on deploy windows` |
| 12 gradients, 6 glows | 1 gradient (the hero legibility scrim), 0 glows |
| 14 distinct hexes across several hues | 12, one accent at four alpha steps; green/red are semantic only |
| Grey placeholder bars pretending to be charts | Real plots with y-axes and labelled weeks/months |
| `Trusted by engineering teams at` / `Join 2,400+ engineering teams` | `Example integrations in this demo`; claims dropped |
| A dashboard tile that said "Connect deploy data to calculate" beside three hard numbers | All four tiles consistent; header eyebrow reads `Sample data` |
| Card-in-a-box around every group | Hairline rules and rhythm |

Copy went concrete throughout: feature headings are now sentence-length and say
what is measured ("The four DORA measures, computed from webhooks"), and the
section descriptor states plainly that every figure is sample data.

## Two pre-existing bugs found on the way

1. **Nav CTA failed WCAG AA at 2.06:1.** `.nav-links a` (0,1,1) outranks
   `.btn-primary` (0,1,0), so the primary button rendered `--text-secondary`
   on `--accent`. Fixed with `.nav-links a:not(.btn)`. Now white on indigo.
2. **A metric delta rendered in success-green while de-claiming itself.** The
   dashboard row mixed a "connect your data" placeholder with three real
   numbers. Now uniform, and the deltas carry correct semantics — lead time
   *falling* is green, review latency *rising* is red.

## Three bugs I introduced, and how they were caught

All three were invisible in source review and only showed up in rendered pixels.

1. **Review-load bars rendered as five identical full-width tracks.**
   `.load-fill` was an inline `<span>` with `height: 100%`; inline elements
   ignore height. Grid *items* get blockified, which is why the track was fine
   and its child was not. Fixed with `display: block` on both.
2. **Chart x-labels sat at even fractions, not over their bars.**
   `justify-content: space-between` distributes labels across the track — it
   does not align them to data. Converted `.col-labels` to a grid with an
   explicit `grid-column` per label. This one mattered: I had just criticised
   the original chart for being dishonest decoration.
3. **Final CTA hung off the left margin.** `.final-cta .container
   { max-width: 620px; margin-left: 0 }` destroyed the container's
   `margin: 0 auto`, putting the CTA at x=32 while every other section sat at
   x=192. Fixed by constraining the children instead:
   `.final-cta .container > * { max-width: 620px }`.

Also fixed a capture artifact that turned out to be a real fragility: a
`fullPage` Playwright screenshot does not scroll, so `IntersectionObserver`
reveals never fire and the features section came back as an 1100px void. The
page now has a 2.5s failsafe that unhides everything, plus a no-IO fallback —
content can no longer be permanently invisible if the observer never runs.

## Measured, not asserted

| Check | Result |
|---|---|
| Nav "Get started" | `rgb(255,255,255)` on `rgb(94,106,210)` (was 2.06:1) |
| `.hero-note` link tap target | 263×44 (was 262.5×22) |
| Raven badge tap target | 44px (was 355×22.4) |
| Real chart columns | pulse 12, quarter 13 |
| Gradients in stylesheet | 1 — the hero scrim only (was 12) |
| Glows | 0 (was 6) |
| Distinct hexes | 12 (was 14) |
| Elements still JS-hidden after a full scroll | 0 |
| Section headline left edges | 192 ×6 desktop; 20 ×6 at 393 |
| Mobile overflow at 393 | none |
| Page height | 8886 (was 9732) at 2x, carrying more real content |

## Raven verdict

`audit_taste`, profile `andrew`, surface `product-site`:

- **Before** — BLOCK, 15 block / 1 warn. 12 × `COLOR-no-gradient-no-glow`,
  2 × `OTHER-no-shadcn-defaults`, 1 × `SPACING-tap-targets-44px`, warn on
  `TOKEN-no-bare-literals`.
- **After (live URL, binding `raven-mcp`)** — 1 block / 1 warn, both
  deliberately left standing:
  - `COLOR-no-gradient-no-glow` on the hero scrim. This is a **detector false
    positive**. The rule bans purple/indigo/blue gradients, rainbows, "AI"
    gradients, glow and neon; the scrim is the page background `#191A23` at
    three alpha stops, and its job is to hold white headline type legible over
    a video. Removing it fails contrast, which Raven itself enforces. Not
    labelled via `label_finding` because the `raven-mcp` binding also covers
    the real marketing site, where the rule should keep biting.
  - `TOKEN-no-bare-literals` — 12 distinct hexes against a 6–10 target. The
    ladder is 4 neutrals, 1 accent + hover, 3 text steps, 2 semantic, white.
    Getting to 10 means deleting real distinctions, so it stays a warn.

  Everything else was fixed: `--raised` collapsed into `var(--accent-a12)` so
  the empty load track reuses the accent's alpha ladder rather than carrying
  its own hex, and three separate tap-target misses closed (the `.hero-note`
  anchor at 22px, the nav logo at 24px, and "Docs" at 41.9px wide).

**Caveat worth carrying.** Auditing the live URL resolved binding `raven-mcp`;
auditing `127.0.0.1:8899` resolved `raven2-walkthrough` and pulled in that
profile's design_notes ("one warm orange accent"). Neither binding legitimately
governs a *fictional brand's* sample page — the demo pages have no binding of
their own, so an audit picks up whichever one matches the host. The
gradient/glow findings were actionable only because they happened to converge
with the AI-tell complaint. Worth a real binding if these pages get audited
again.

## Files

- `web/public/demos/saas.html` — rewritten. This is the one that serves the live
  page (apex `ravenmcp.ai` → the **`web`** project).
- `site/demos/saas.html` — was four strings stale against `web/public/` and had
  no trailing newline. Overwritten with an exact copy; `diff -q` clean.

## Git / deploy state

Local `main` had diverged: the parallel session cherry-picked my four video
commits onto a clean base and pushed them, dropping their in-flight `f606d5a`
(the 105th tool, touching `src/index.ts` + `manifest.json`). So `origin/main`
already carries the video work; local `main` is 4 ahead / 5 behind and its lead
is that unfinished tool commit. This change was landed through a scratch
worktree off `origin/main` rather than the shared index, so the parallel
session's staged work was never touched.

**The live page moves only on `vercel deploy --prod` from `web/`.** A push to
`main` deploys the `site` project, which owns `mcp.ravenmcp.ai` — not the apex.
See `feedback_alias_list_not_url_probe_identifies_owner`.

Shipped as six commits on `main`, each with its own `web` production deploy and
a byte-diff of the live response against the local file:

| sha | what |
|---|---|
| `0e4ff8e` | the re-craft |
| `9464657` | quarter chart height — 13 weeks at 132px in a 940px card rendered as slabs |
| `e2ca9e3` | nav logo 44px hit area |
| `42b1bf7` | pricing columns off by 3px (2px accent rule pulled up only 1px, plus the mono badge's line box) |
| `e94ba4c` | "Docs" was 41.9px wide |

Final production sweep at 1440 and 393: 0 elements still JS-hidden, 0 tap
targets under 44px in either dimension, no horizontal overflow, six section
headlines sharing a left edge, and `diff` clean between the live bytes and
`web/public/demos/saas.html`.

## Second task, same session — Raven Grab's scope toggle

> "the scope toggle should fill the parent container here"

`.raven-grab-scope` carried `max-width: 300px`, so in any panel wider than that
the Scope switch stopped short of the right edge while every sibling control in
the panel spanned the full section. The cap was the whole bug — one line.

Nothing else needed to change, because the pill was already width-agnostic:
the grid is `36px / minmax(0, 1fr) / 36px` (two fixed 36px caps, a fluid track),
and the knob is `calc(50% - 2px)` translated by `translateX(100%)`. Both are
proportional, so the toggle tracks its parent at any size.

**Verified** by extracting the real CSS block and the real markup from
`browser/raven-grab.js` into a harness at four panel widths, measuring with
Playwright, then looking at the render:

| Panel content box | Scope width | Knob = half track |
|---|---|---|
| 266 | 266 | yes |
| 346 | 346 | yes |
| 446 | 446 | yes |
| 606 | 606 | yes |

The first pass of that harness reported `fills: false` at all four widths. That
was the harness, not the fix — it computed the parent as `width - 32` (the
padding) and forgot `.panel`'s own `1px` border under `box-sizing: border-box`,
so its "expected" was 2px too wide at every size. Worth remembering: a derived
expected-value is as falsifiable as the measurement it grades.

Shipped as `0b8206d` on `main`, plus a manual `vercel deploy --prod` from
`web/` — `ravenmcp.ai/raven-grab.js` is served by the **`web`** project, so the
push alone would never have moved it. Live bytes `diff`-clean against
`web/public/raven-grab.js`.

**Not touched, needs Andrew's call:** two copies in the *portfolio* repo still
carry `max-width: 300px` —
`andrewcunliffe-portfolio/public/raven-grab.js` and
`andrewcunliffe-portfolio/.claude/worktrees/morven-pilot/public/raven-grab.js`.
Different repo; not mine to edit unasked.

## Not done

- **Adverse Sol → Fable pass.** Not run at the time this log was first written
  (the session forbade the Agent tool). Andrew lifted that explicitly — the Sol
  leg is running now; Fable follows on the artifact **and** Sol's findings.
