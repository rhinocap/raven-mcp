# Session: 2026-08-12 — Homepage typography

## Where we left off

The homepage typography work is locally verified; the recovered queue lane needed its missing accessibility and visibility guards finished before handoff.

## This session

### Homepage typography consolidation

**What:** Scoped the live `web/` homepage to three non-H1 Untitled Sans size/weight roles, preserved the responsive H1, removed eyebrow nodes, and covered shared nav/footer Shadow DOM on the root route only.

**Why:** Andrew requested fewer font treatments, no homepage mono, and no eyebrow typography.

**Verification:** Production build passed. Chromium at 1440px and 390px measured only `14px/600`, `17px/400`, and `30px/700` outside H1; zero wrong-family nodes, tracked/uppercase treatments, or eyebrow patterns. The post-click copy confirmation also measures `14px/600` in Untitled Sans. Raven page audit scored A/100 and tap targets passed 37/37. Independent review found and cleared mobile-menu scope, content-loss, post-click status, and the overstated `evaluate_design` claim. The design judge found no typography issue; its cyan-gradient/glow objection predates this type-only scope and remains separate visual debt.

**Pushed:** No — local only.

### Homepage H2 hierarchy correction

**What:** Kept the existing semantic section H2s as the homepage's only bold tier and lowered every subordinate heading, stat, button, label, terminal line, body style, and shared Shadow DOM nav/footer role to weight 400.

**Why:** Andrew clarified that section titles such as “Twelve design-system token sets, queryable” need distinct H2 prominence, while nothing beneath them should be bold.

**Verification:** Production build passed. Chromium at 1440px and 390px measured all 13 H2s at `30px/700`; an exhaustive light DOM, Shadow DOM, hidden/open-state, expanded-tools, mobile-menu, focused skip-link, and live-region sweep returned no weight above 400 outside H1/H2 and no non-Untitled text. Desktop and mobile H2 captures were inspected. The first Sol pass found the focused skip link and shared Shadow DOM variables; both were corrected, and the focused follow-up returned no findings. Raven recorded the correction as `dec_201`; its URL-mode taste audit exceeded the 90-second capture budget, so no Raven verdict is claimed.

**Pushed:** No — local only.

### Homepage H2 size restoration

**What:** Restored the original responsive H2 size scale: `clamp(30px, 4vw, 44px)` on desktop, `clamp(22px, 5.5vw, 32px)` below 768px, and 20px below 480px, while retaining H2 as the only bold section tier.

**Why:** Andrew found the fixed 30px section titles too small.

**Verification:** Production build passed. Chromium measured all 13 H2s at `44px/700` at 1440px, `32px/700` at 768px, `26.455px/700` at 481px, and `20px/700` at both 480px and 390px; every checkpoint retained zero subordinate weight violations. Desktop and small-mobile section-header captures were inspected. The final Sol cascade review returned no findings. Raven recorded the user correction as `dec_202`.

**Pushed:** No — local only.

### Grab batch: dark page and white H1 line

**What:** Applied committed Grab batch `f5f57dbeb7f9a7a43bed8a087c22477d`: changed “with your coding agent” from cyan-to-purple gradient text to solid white; removed the fixed blue top wash and oversized hero cyan orb. Retained the 3–6% hero mesh, faint interactive grid, small local cyan glows, cyan borders, dots, and controls.

**Why:** Andrew requested a dark page with subtle cyan accents rather than a blue gradient background.

**Verification:** Desktop and mobile hero captures were inspected against the prior blue-wash capture. Computed styles confirm the page base is `rgb(26,26,34)`, the fixed wash and oversized orb do not render, and the second H1 line resolves to literal white `rgb(255,255,255)` with no background or filter. Production build passed. The first Sol pass caught off-white instead of literal white; after correction, its focused follow-up returned no findings. Both durable Grab changes are marked applied. Raven recorded the correction as `dec_203`.

**Pushed:** No — local only.

### Grab: remove tool-category numbers

**What:** Removed the visible `01–07` labels from every tool-category accordion row and removed the obsolete 28px expanded-panel indent. Kept `act.num` internally for stable React keys, panel IDs, and `aria-controls` relationships.

**Why:** Andrew selected the first number label and instructed “Remove these numbers,” then explicitly authorized the change after the bridge failed to persist its Apply marker.

**Verification:** Production build passed. Desktop (1440×900) and mobile (390×844) captures show zero `.txb-num` nodes across all seven headings; opening the first category preserves `aria-expanded`, matching `aria-controls`/panel ID, and a visible panel. The heading and expanded panel share the same left edge at both widths (150px desktop, 16px mobile) with a computed `0px` panel margin. Raven bridge returned HTTP 200 after the dev-server restart. Design Judge: PASS, no findings. GPT-5.6-Sol medium adverse pass: `NO FINDINGS`; Fable 5 is unavailable in this runtime. Captures: `/private/tmp/raven-tools-no-numbers-desktop.png`, `/private/tmp/raven-tools-no-numbers-mobile.png`.

**Pushed:** No — local only.

### Grab: unify design-system card colors

**What:** Scoped the four `card-raised` design-system tiles to the same existing base resting color as the other eight while preserving their established hover-border response.

**Why:** Andrew selected the Airbnb card and instructed, “Make all of these squares the same color.” The committed Grab batch scoped “all” to the design-system grid.

**Verification:** The running Raven preview reports 12/12 cards at the identical `rgb(33, 33, 41)` resting background on desktop and 390px mobile; all mobile cards retain the same 358px width. The complete grid was inspected after hot reload. The production build passed with all 14 routes generated.

**Pushed:** No — release remains paused pending verification.

### Queue verification completion

**What:** Added T14 for collapsed-panel status routing, replaced the weak geometry check with a painted-pixel check, added Q25-Q28, and refreshed the current matrix contract. T14 now isolates `aria-hidden` and `inert` so neither ancestry check can disappear unnoticed. The full suite exposed one shared-helper edge, fixed in `statusNodeIsReachable()` by skipping element-like parent objects that lack DOM attribute methods. Source and public mirror remain byte-identical.

**Why:** A successful bank must leave one visible, announced confirmation even when Assets is collapsed, and the guard must fail when text has geometry but paints nothing.

**Verification:** Queue suite 14/14, including three consecutive clean stress runs before the final pass. Matrix v12 re-run whole after the helper and independent-attribute guards: 28/28 mutants killed, no wrong-test or wrong-assertion hits, 1/1 control green. Final full suite: 1539 tests / 1536 pass / 0 fail / 3 skipped. The six integration tests that exposed the non-DOM-parent edge pass directly. Syntax checks and source/mirror `cmp` pass.

**Pushed:** No — local only.

### Fresh-project typography defaults

**What:** Separated product generation from homepage styling. Fresh `generate_design_system` output now starts with H1 `32px/700`, then `20px/600`, `16px/500`, and `14px/400`; the paired ladder is preserved in DTCG, HTML specimens, Figma variables, and saved systems. Existing `base_system` typography remains inherited rather than rewritten.

**Why:** Andrew clarified that Raven Design itself, not only the marketing homepage, should start new projects with a deliberately small descending type hierarchy.

**Verification:** Focused generator suite covers all six presets and both HTML/Figma exports. The final full suite passed at 1539 tests / 1536 pass / 0 fail / 3 skipped.

**Pushed:** No — local only.

### Production release

**What:** Landed the isolated queue, homepage, approved Grab, and fresh-project typography work on `main` as `7218371`, excluding the parked static-site/count/Inter lane. Deployed the exact clean release checkout to Vercel production as `dpl_CeJwYU6X61tFhXbYgk82jyZv7t4X`.

**Verification:** Vercel reports READY with `ravenmcp.ai`, `www.ravenmcp.ai`, and `next.ravenmcp.ai` aliases. Live Chromium at 1440px and 390px measured 12 design-system cards with one resting color, four preserved raised hover variants, 13 H2s at weight 700, zero subordinate text above weight 400, zero non-Untitled text, and zero `.txb-num` nodes. The live anonymous MCP endpoint returned 45 tools with the frozen SHA-256 hash `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, and a live `generate_design_system` call returned the new typography ladder. The final Sol gate found one distribution boundary: npm `2.4.0` and the live `.mcpb` predate `7218371`, so local installs still need a separately human-gated package release.

**Pushed:** `7218371` to `main`; production deployment READY.

## Mistakes & lessons

| Mistake | Type | Rule added |
|---|---|---|
| Initially treated the typography request as homepage-only. | Scope/communication | When Andrew distinguishes “website” from “actual design tool,” map and verify the product-generation path separately before editing. |
| Flattened section H2s together with subordinate headings and retained 600-weight utilities. | Visual hierarchy | In a reduced homepage type system, reserve bold for semantic H1/H2 tiers and explicitly measure every subordinate role at normal or lighter. |
| Reintroduced H2 prominence at a fixed 30px instead of restoring the page's original responsive scale. | Visual fidelity | When asked to bring a treatment back, recover and reuse its prior responsive rule verbatim rather than approximating it with one fixed value. |

## State at end of session

- Homepage typography and approved Grab changes: live and verified on desktop and mobile.
- Queue work and fresh-project typography defaults: on `main` and the hosted generator is current; local npm/Desktop installs remain on the prior package.
- Remaining human gates: cut the passkey/2FA npm + `.mcpb` release, then reload the old deck tab so its embedded overlay takes the new bundle.
