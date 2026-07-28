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
   *falling* is green, time-to-restore *rising* is red. (An earlier draft of
   this log said "review latency rising"; there is no review-latency delta on
   the page. The single red delta is "Time to restore +2m vs Q4".)

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

## Third task — the Scope switch was missing entirely

> "none of the layers in there expose the scope selector, because some how you
> broke that now too"

Not caused by the `max-width` removal — that commit changed one CSS declaration
and cannot suppress a render. But the bug was real and pre-existing: on
`test/fixtures/layers-test-page.html` **no element** offered "All siblings".

`componentScopeFor()` matched components by **exact class-set equality**
(`componentSignaturesMatch` compares length then every entry). So
`div.cell.cell-1` and `div.cell.cell-2` are different components, `matchCount`
stays 1, and the Scope section — which only renders at `matchCount >= 2` —
never appears. A shared base class plus a per-instance modifier is the ordinary
way hand-written components are authored, so this took out the whole fixture:
6 cells, 4 cards, 2 floaters.

There was already a fallback for *class-less* elements (bare `<li>`/`<h2>`) that
scopes to same-tag siblings under the same parent. The fix generalises it: when
the exact signature matches fewer than 2, fall back to the **largest class
subset shared with same-tag siblings under the same parent**. Same bound the
class-less path already argues for — a partial match can never escape its
parent, and `COMPONENT_SCOPE_MATCH_CAP` still applies. Siblings sharing no
distinctive class stay out.

`componentScopeSiblingElements()` needed the matching change. Its
`siblingScoped` branch returned *every* same-tag sibling, which is right when
there are no classes to share and wrong here — it would have swept an unrelated
`div.footnote` into the preview. It now filters by the scope's `sharedClasses`.

**Verified against the running overlay**, not a harness:

| Selected | Scope caps | Component-scope highlights | Expected set |
|---|---|---|---|
| `.cell-1` | Instance / All siblings (6) | 5 | `.cell:not(.cell-1)` ✓ rect-for-rect |
| `.card-2` | Instance / All siblings (4) | 3 | `.card:not(.card-2)` ✓ |
| `.floater-a` | Instance / All siblings (2) | 1 | `.floater:not(.floater-a)` ✓ |

Full suite 1153 / 1150 pass / 0 fail / 3 skipped, plus a new regression test
(base class + modifier opens sibling scope; a sibling with no shared class is
excluded). Shipped as `0aac27d` on `main` + `vercel deploy --prod` from `web/`;
`ravenmcp.ai/raven-grab.js` verified byte-identical to the local file.

One test-authoring gotcha: `assert.deepEqual(['cell'], ['cell'])` **fails** in
this suite. The overlay runs in a `vm` sandbox, so its arrays carry that realm's
`Array.prototype` and `deepStrictEqual`'s prototype check rejects them. Compare
through `Array.prototype.join.call(...)`.

## Fourth task — porting the scope fix to the portfolio

`andrewcunliffe-portfolio` ships its own copy of the overlay. Both were stale in
different ways: `public/raven-grab.js` already had the `max-width` fix (it
arrived via auto-save `5cdb07d`) but not the scope fix; the
`.claude/worktrees/morven-pilot` copy had neither.

Ported both. Committed `19030cf` with `git commit --only <path>` — the pilot
worktree is a detached HEAD with ~10 uncommitted files from a live parallel
session, so its asset was updated on disk (the running pilot gets the fix) and
deliberately **not** committed into someone else's tree.

Verified with the portfolio's own e2e specs rather than byte-identity alone:
`raven-audit-fab` + `raven-change-notify`, **80 passed / 7 skipped / 0 failed**.

`git push origin 19030cf:main` was rejected non-fast-forward — **not a failure**.
A parallel session had already pushed main to `f7b23f2`, which *contains*
`19030cf`; my push would have rewound main by one commit. Confirmed with
`git merge-base --is-ancestor` and by grepping the pushed blob. Live via
`dpl_CKQnsBErvjXoFLTz3VdBzZG8WTnt`.

Parity sweep — all four copies plus both live endpoints byte-identical (587281
bytes). `https://andrewcunliffe.com/raven-grab.js` returns 301/15 bytes: that is
the redirect to the `.ai` apex, not a stale asset. `curl -sL` follows it and
matches.

## Fifth task — the Flux fix pass (the 16 adverse findings)

Shipped as `0d8e510`. What actually changed:

**Layout.** Row 02 leads with its chart (DOM reorder + `order` in the 860px
media query so text still leads on one column); row 03 gets `.text-led`,
1.3fr/1fr. Row 02 keeps the chart in the *narrow* track — the first attempt
widened it and opened a ~500px leader gap between each stack-key label and its
value. Caught by looking at the render, not by reading the CSS.

**Copy.** Hero double-triple split. The three h3s were all comma-hinged noun
phrases; now short-noun / verb-clause / cadenced-list. Two of the three closing
aphorisms cut, one kept. "Click any figure and Flux shows the events underneath
it" deleted — nothing on the page is clickable. Planetscale → PlanetScale.
Final-CTA h2 no longer repeats its own button text.

**Type.** One scale: 11 / 12 / 14 / 15 / 17 / 18 / 28 / 32 / 52. Verified by
enumerating computed `font-size` on every leaf text node — the only 16px hits
are `<script>` elements. Also collapsed three near-identical body line-heights
(1.60 / 1.65 / 1.70) to one; that trio is itself a generated-code tell.

**Accessibility.**
- Mobile nav hid *all four* links. Now the two anchors that go somewhere stay;
  the two dead demo links drop. Gotcha: `.nav-links .nav-stub` (0,2,0) loses to
  `.nav-links a:not(.btn)` (0,2,1) — `:not()` counts its argument. Needs
  `a.nav-stub`. The first attempt silently did nothing and the nav overflowed
  393→472px; caught by measuring `scrollWidth`, not by eye.
- Hero video autoplays and loops with no stop control → WCAG 2.2.2 Level A.
  Inline script right after `</video>` so it lands on the poster instead of
  playing until a bottom-of-page script catches it.
- `--accent-hover` went *lighter*, dropping white button text to 3.79:1.
  Inverted to `#5560C4` → 5.45:1.
- Pricing "Most teams" badge was accent-coloured at 11px (3.69:1) → secondary.
  The 2px accent rule on the card already carries the emphasis.
- `--text-tertiary` #848694 → #8A8C9A: it was 4.49:1 on `--surface`, which the
  dash-card caption sits on. Now 4.86.
- Zero `:focus-visible` rules existed. Added one.
- Chart values were mouse-only `title=`. Added `role="img"` + `aria-label`.

**Deleted.** The `.reveal` scroll-reveal system — its own 2.5s failsafe already
defeated it — and `--hairline`, whose two uses were both visually identical to
`--border`.

Verified on the rendered page: contrast **0 AA failures / 124 text elements, 0
indeterminate**; tap targets **20/20**; 0 console errors; no horizontal overflow
at 1440x900 or 393x852; eyes-on at both. Raven `audit_page` 94/B, 13/18 (was
12/18). Live at https://ravenmcp.ai/demos/saas.html, byte-identical to the repo.

**Raven findings deliberately not fixed**, with reasons:
- `typography/min-size` (ten 11–12px declarations) — all mono axis ticks,
  eyebrows, metric labels and captions. Deliberate data-UI convention; every one
  of them passes WCAG AA at its size after the `--text-tertiary` lift.
- `responsive/no-grid-breakpoints` (1) — `.feature-row` collapses a two-column
  grid whose index row spans both tracks (`grid-column: 1 / -1`). Flex can't.
- `spacing/base-unit` 56% / `scale-count` 15 — the off-grid values are chart bar
  gaps (1/3/6px), pre-existing button padding, and `clamp()` bounds. Out of
  scope for a de-slop pass; `scroll-padding-top` was snapped 84→88.
- `color/palette-size` 12 — 10 tokens plus `#fff` and the nav's rgba. Already
  one down from the `--hairline` merge.

**Found, flagged, not fixed — needs Andrew:**
1. `www.ravenmcp.ai` **hard-fails TLS.** DNS CNAMEs to Vercel (76.76.21.21) but
   the domain is not registered on the `web` project, so the edge serves a cert
   for `ravenmcp.ai` only: `subjectAltName does not match host name`. A visitor
   typing `www.` gets a browser interstitial, which is worse than a 404.
   Confirmed off the deployment's own alias list — `["ravenmcp.ai",
   "next.ravenmcp.ai", ...]`, no `www`. Pre-existing, unrelated to this change.
   Fix is `vercel domains add www.ravenmcp.ai web`, which is an account-settings
   change and therefore Andrew's call.
2. `.btn-secondary`'s border is `--border` at **1.31:1** against `--bg` — below
   WCAG 1.4.11's 3:1 for a control boundary. It was equally bad before the
   `--hairline` merge (~1.42), so this is not a regression. Not fixed silently
   because any value that clears 3:1 visibly changes how every secondary button
   on the page reads, and that is a taste call.

## Not done

- **The accent hue `#5E6AD2`** — Linear's actual brand indigo on a page that
  name-drops Linear twice. An originality call for Andrew, not a defect, so it
  was left alone. Same for Inter (register consistency with the five sibling
  demo pages was protected scope) and the `#191A23`/`#1F2028` pair (a deliberate
  elevation step, not a redundant duplicate).
- **No second adverse pass on the fixes themselves.** The session forbids the
  Agent tool absent a request; "Do it" in message 8 lifted it for the original
  Sol → Fable pass only. These fixes are that pass's disposition, verified
  mechanically and by eye instead.

## Sixth task — the Glama email, and the README drift under it

Andrew forwarded a screenshot: "Release 2.2.9 published for Raven MCP" from
Glama Support. Glama.ai is a third-party MCP directory whose crawler watches
npm; it re-indexed on the v2.2.9 publish. Nothing to action there — the
listing at `glama.ai/mcp/servers/rhinocap/raven-mcp` reads Quality A,
Security A, Apache-2.0, npm and GitHub links correct.

Checking what it actually displays turned up a defect on our side, not theirs.
Glama showed **99 tools**. That number is scraped verbatim from `README.md`
lines 25 and 29, and it was wrong:

| ref | manifest.json | README |
|---|---|---|
| `ebb9759` (v2.2.9, the crawled release) | 100 | **99** |
| `origin/main` before this fix | 104 | **99** |
| local main (parallel session, `f606d5a`) | 105 | **99** |

`scripts/sync-manifest-tools.mjs` regenerated `manifest.json` from a real
stdio `tools/list` but never touched the README, so the count was hand-typed
and had drifted five releases. Every directory listing carried the stale
number because they all scrape the same line.

Fixed at the root rather than by retyping the number (`a63f715`): the sync
script now rewrites both README occurrences from the same enumeration it
already uses for the manifest, and throws if either pattern stops matching.
Verified the guard by breaking the surrounding prose — exit 1, names the
pattern. Suite: 1152 tests / 1149 pass / 0 fail / 3 skipped. Manifest came
back byte-identical at 104, which confirms the enumeration path agrees with
what was already committed.

Note the script spawns the built server as a subprocess and speaks real MCP
over stdio, so it sidesteps the `buildServer()` / `RAVEN_REMOTE` fallback
gotcha entirely — no `{ remote: false }` needed.

Post-push: `main` deploy touches no `src/` or `api/` path, and the live anon
endpoint re-verified at 45 tools / `f64bb18…2bb0a6`, the frozen golden hash.

### Not fixed — needs Andrew
- **The Glama description is the README's opening line, and it is badly
  dated.** It sells only the original eight knowledge layers: no Taste Engine,
  no decision graph, no Grab, no audit suite, no hosted remote endpoint. That
  sentence is the first thing the bound cold indie-dev evaluator reads on a
  discovery surface. Rewriting it is positioning copy in Andrew's voice, not a
  mechanical sync, so it is flagged rather than done.
- **The listing does not surface in Glama's own search for "Raven MCP"** —
  only reachable at the direct `/mcp/servers/rhinocap/raven-mcp` path. A
  discoverability gap on a distribution channel, alongside the OpenAI plugin
  directory submission still in Review.

## Seventh task — the four-item close-out (/goal)

Andrew: "Write yourself a /goal to do 1,2,3 and 4 and execute."

Routing: the copy leg fanned out as a Workflow (9 agents, 0 errors) — 3 Codex
drafters, then per draft a Codex factual-accuracy adversary and a Fable voice
adversary bound to the target-customer block. Items 2-4 stayed in the main
session: MCP-bound, deploy-gated, eyes-on. The first Workflow call was
hard-blocked by the routing hook for pinning Anthropic models with no
justification token — correctly. Re-routed generation and evidence-checking to
Codex and kept only the taste lens on Fable with `[claude-justified: ...]`.

**#2 www.ravenmcp.ai — FIXED.** Reproduced first: `CN=ravenmcp.ai`,
`subjectAltName does not match host name www.ravenmcp.ai`. `vercel domains add
www.ravenmcp.ai web`, then verified off the deployment's own alias list rather
than a URL probe — `www.ravenmcp.ai` now appears alongside the apex. Cert is
`CN=www.ravenmcp.ai`, SAN matches, HTTP/2, 200. DNS needed nothing: www already
CNAME'd to the apex at 76.76.21.21.
Consequence checked, not assumed: www now answers 200 rather than redirecting,
so both hostnames serve. The Next.js pages already carry a canonical link to
the apex, so the duplicate-content exposure is covered. A www->apex 301 would
still be tidier; not done, it is a further account-settings change.

**#3 .btn-secondary border — FIXED (`edc25ae`), live.** 1.31:1 -> 3.09:1.
Added `--border-control: #666772` rather than moving `--border`: line 91 was the
ONLY control use of that token; all thirteen others are decorative hairlines
where 1.4.11 does not apply, so lifting `--border` would have repainted the
page for no accessibility gain. #666772 is the smallest step along the same hue
that clears 3:1. Hover keeps `--text-tertiary` at 5.19:1, so the hover step
still reads.
Verified live at ravenmcp.ai/demos/saas.html: all four secondary buttons
("Read the docs", "Get started", "Contact sales", "Talk to us") measure 3.09:1
against the body background; live file sha matches the repo exactly
(cc9d4644...); before/after crops captured at the same region. `audit_page`
holds at 94/B, 13/18 — no regression. The palette-size warning moved 12 -> 13
hexes, which is this token; it is a functional control value, not a decorative
hue.

**#4 grab dev server — KILLED.** PID 47761 on :53570 plus its parent shell;
port free, background task exited.

**#1 README opening line — options produced, NOT shipped.** Path B: interpretive,
Andrew picks. Three findings converged across all three independent voice
critiques and they are the real lesson:
- "taste" as a bare noun reads as AI-marketing fluff to a cold reader. All three
  killed it independently.
- "your team" excludes the free-tier solo dev, who IS the bound free persona.
- The line must name what it is ("MCP server") and who calls it ("coding
  agent"), or the reader has no slot to put it in.
The factual adversaries added a hard constraint: the Decision Graph is
local-stdio only (every `decision_*` tool is in `REMOTE_GATED_TOOLS`) and is
SEPARATE from the per-person Taste Engine. Any line implying team decision
memory over the hosted endpoint is simply false.

**Second drift found by an adversary, fixed (`ec6baac`).** README line 69 told
Desktop-bundle users the package tracks npm at 1.17.x while the published
version is 2.2.9 — a full major behind on the no-terminal install path. Dropped
the parenthetical; the sentence already says it tracks npm, so the number
carried no information and only existed to go stale.

Post-push: live anon endpoint re-verified at 45 tools / `f64bb18...2bb0a6`.
