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
- **After** — 1 warn. The two remaining blocks were both fixed after the second
  audit: the `.hero-note` anchor now clears 44px, and `--raised` was collapsed
  into `var(--accent-a12)` so the empty load track reuses the accent's alpha
  ladder instead of carrying its own hex. The single surviving gradient is the
  hero legibility scrim — one hue, two alphas, functional not decorative.

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

## Not done

- **Adverse Sol → Fable pass was not run.** This session carries an explicit
  instruction not to use the Agent tool, which overrides done-gate's adverse
  pass. Stated rather than skipped silently.
