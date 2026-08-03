# build-11 — snackbar for an optimistic save

One self-contained file: `index.html` (tokens + component + demo harness, all CSS/JS inline,
zero external requests). Everything below is measured unless marked GUESSED.

Evidence files in this directory: `verify.mjs` (28-assertion Playwright run),
`snapshot.mjs` (post-interaction DOM snapshot builder), `post-interaction-snapshot.json`,
`build.diff`, `snackbar-visible.png`, `snackbar-mobile.png`.

---

## Choices I was asked to report

### Motion easing

| Transition | Duration token | Easing token | Value |
|---|---|---|---|
| enter (opacity 0→1, translateY `--space-md` → 0) | `--motion-duration-base` (200ms) | **`motion.easing.out-expo`** | `cubic-bezier(0.16, 1, 0.3, 1)` |
| exit (opacity 1→0, translateY 0 → `--space-sm`) | `--motion-duration-fast` (120ms) | **`motion.easing.out-quart`** | `cubic-bezier(0.25, 1, 0.5, 1)` |

Why: the entrance is the only moment that has to *say where this surface lives* — out-expo's long
decelerating tail lets the 16px rise read as the bar arriving at the viewport edge and settling
against it, which is the structural job the spec assigns the entrance. The exit has no such job;
out-quart is the shorter-tailed curve, so departure is quick and unremarkable at half the entrance
duration. `motion.easing.site` was left alone deliberately — it is the page-level signature curve
and would over-dramatise an 8px, 120ms move on a transient surface.

The translate distances are tokens, not literals: enter rises from `--space-md` (16px), exit drops
to `--space-sm` (8px). Verified computed on the live element (`verify.mjs`):
`transition-property: opacity, transform`, `0.2s/0.2s cubic-bezier(0.16,1,0.3,1)` entering and
`0.12s/0.12s cubic-bezier(0.25,1,0.5,1)` leaving.

`prefers-reduced-motion: reduce` — entrance collapses to opacity only (`transform: none`,
measured `transition-property: opacity`, `0.2s`); exit is instant (measured `0.001s`).

### Emphasis without display size (gaps 4 and 6)

- **status_message** — `type.body` (16px). Emphasis carried by **weight + colour**:
  `--weight-medium` (500) in `--color-fg` (white) against the page's `--color-fg-muted` body copy.
  No size step at all.
- **undo_action** — `type.body` (16px), `--weight-medium` (500), and the **accent as punctuation**:
  a 1px `text-decoration-color: var(--color-accent)` underline on the label. On hover the underline
  thickens to `--space-xs`; the accent never becomes a fill, a background, or a text colour.
  It is the only accent-bearing element on the surface.

### Component names for the three unmatched archetypes (gaps 2, 3, 5)

Nothing in `arena/DESIGN.md` matched, so I created them and am reporting the names for registration:

| Archetype | Created as | Notes |
|---|---|---|
| `snackbar` | **`snackbar`** (`.snackbar`) | new root component; states `entering`/`visible`/`leaving` expressed as `.is-visible` / `.is-leaving` |
| `status-message` | **`snackbar__message`** | BEM child, `role="status" aria-live="polite"` |
| `action-row` | **`snackbar__actions`** | BEM child; separated from the message by `border-inline-start: var(--rule-hairline) solid var(--color-line)` — a hairline, not a filled surface |

`button` was reused as-is (the DESIGN.md alias), with one new sub-variant `btn--ghost-icon`
for the icon-only dismiss.

### Missing button `loading` state (gap 7) — **added and used, not stubbed**

`.btn.is-loading` is now part of the button class system (registered states: hover, focus-visible,
active, disabled, **loading**). It is exercised for real: the harness's **Save change** trigger
enters `is-loading` + `aria-disabled`/`disabled` + `aria-busy="true"` for a 600ms simulated
round-trip while the optimistic write settles, then leaves it. The snackbar's own controls do not
use it — undo and dismiss resolve immediately, and inventing a pending step for them would have
added a state the spec's machine does not have.

### Missing button `secondary` variant (gap 8) — **substituted `ghost`**

`ghost` is already registered in `DESIGN.md components.button.variants` and is the system's
existing non-primary control. Undo is `.btn.btn--ghost.snackbar__undo`; dismiss is
`.btn.btn--ghost-icon`. No new variant name and no second hue were introduced to fill the gap.

### Decision-scope mismatch (gap 1)

Acknowledged and not fixable from the build: the Decision Graph store is global, so the decisions
came from `round3/decisions` rather than the `arena` project dir. I read the one rejected decision
carried in the prompt (`dec_design_01` — "Light is the default surface, so the signature moment
cannot be a dark-mode-only feature"). It does not bind here: `arena/DESIGN.md` declares a dark-first
system, this surface has no light mode, and the component carries no signature moment in either
scheme. Recorded rather than silently ignored.

---

## Decisions the spec left open that I made anyway

1. **`reverted` is terminal at activation, not routed through `leaving`.** The state list gives
   `visible → leaving → dismissed` but `visible → reverted` directly, with no leaving-for-revert
   state. So on undo the machine records `reverted` immediately — surface inerted, undo callback
   fired, surrounding value rolled back — and the exit motion then runs purely as the removal
   mechanics of the terminal state. The DOM node is gone either way.
2. **Escape routes to `dismiss-activated`.** Not in the spec's event list. It is an additional route
   into an existing transition, not a new state; a keyboard user inside a timed surface needs a way
   out that is not a tab-hunt.
3. **A second save supersedes a live confirmation** through the ordinary `leaving → dismissed` path,
   labelled `superseded` in the readout, and its callbacks are detached so it cannot write its
   outcome over the newer one. The spec has no concurrency rule.
4. **One live region, not two.** The message element is the `role="status" aria-live="polite"`
   region named in the Structure section, and its text is written one frame *after* the node is
   inserted, so the region exists in the accessibility tree before it has content. Tradeoff:
   this is the single-region pattern, not the persistent-announcer pattern — it avoids double
   announcement at the cost of depending on the one-frame delay. GUESSED that this announces
   correctly on real AT; not tested with a screen reader.
5. **Focus is read before `inert` is applied.** `inert` blurs whatever is inside it, so reading
   `document.activeElement` afterwards always reports `body` and focus return silently fails.
   This was a real failure in the first verify run (see below).
6. **The focus ring is `--color-fg`, not `--color-accent`.** The accent is reserved to the undo
   control per the Structure section; a white ring is the monochrome-chrome answer.
7. **`--font-serif` is not defined at all.** Domaine is authorial-voice-only and this surface has
   no authorial voice, so the token is absent rather than present-and-unused.
8. **Dimension tokens added with semantic names** so no bare px reaches component CSS:
   `--rule-hairline`, `--tap-target-min` (44px, from `SPACING-tap-targets-44px`), `--focus-ring-width`,
   `--focus-ring-offset`, `--icon-sm` (16px, inside the permitted 14/16/20 set),
   `--measure-component`, `--measure-page`, `--motion-duration-instant`.
9. **The page title uses display scale; the component never does.** After the first `audit_taste`
   run flagged `NOTE-typography` as missing (`max_heading_px=27` against an expected ≥64), I raised
   the harness's `h1` to `clamp(var(--type-h3), 9vw, var(--type-h1))`. The note's own clause —
   "Component text stays in the body band" — is still literally true: every string inside the
   snackbar is `--type-body`. The display scale is the page's editorial voice, not the component's.

---

## Verification

### `verify.mjs` — 28 assertions, 0 failures (Playwright/Chromium)

Covers A5 and feeds A2–A4. Notable measured results:

- `absent` at load with zero `.snackbar` nodes; save → `entering` → `visible`.
- Copy verbatim: message `Saved`, undo label `Undo`, dismiss accessible name `Dismiss`.
- Auto-dismiss fired at **6134ms** (spec 6000ms + entrance).
- Hover **holds** the clock: `held (pointer) 6.0s → held (pointer) 6.0s` across 500ms; resumes to
  `5.8s` on pointer leave. Focus-within holds identically: `held (focus) 5.7s`.
- Undo → node removed from the document, outcome `reverted`, value rolled back to `Private`,
  surrounding surface line reads "Change reverted.", focus returned to the trigger.
- Dismiss → node removed, outcome `dismissed`, save stands at `Public`.
- `leaving` is inert: `inert` attribute present and `pointer-events: none` computed.
- Buttons at 1280×800 and at 390×844: `Save change` 148.6×44, `Undo` 91.8×44, `Dismiss` 44×44.
- No horizontal overflow at 390px; no console or page errors.

**Two real defects the run caught and I fixed:** (a) the countdown ticker overwrote the "held"
readout with `0.0s` because it kept computing against a zeroed `startedAt` — hover and focus were
genuinely pausing the timer, but the surface was lying about it; (b) focus return after undo never
fired, because `inert` was applied before `document.activeElement` was read.

### Raven audits

| # | Claim | Tool | Result |
|---|---|---|---|
| A1 | no bare literals on added lines | `review_diff` (run locally against `dist/design-review.js` with `arena/DESIGN.md`) | **verdict `pass`**, but `checks_skipped: ["typography-tokens"]` — see below |
| A2 | deterministic detectors clean | `talon_scan` | **1 warning**, inherited from the palette — see below |
| A3 | every target ≥ 44×44 | `audit_tap_targets` (post-interaction snapshot, minSize 44) | **3/3 passing, 0 failing** |
| A4 | text contrast ≥ AA | `audit_contrast` (post-interaction snapshot, resolved backgrounds) | **15/15 pass, 0 AA failures**; lowest ratio 4.79 (disabled controls during `leaving`), snackbar message 18.42, dismiss icon 9.29 |
| A5 | states behave per spec | Playwright assertions, above | **28/28 pass**, incl. computed duration+easing |
| A6 | roles and live regions present | manual read | `role="status" aria-live="polite"` on the message, `role="group" aria-label="Save confirmation"` on the root, `aria-hidden` on the icon, `.sr-only` accessible name on dismiss, `aria-busy` on the loading trigger — agent-asserted |
| A7 | taste verdict not BLOCK, notes present | `audit_taste` (profile `andrew`, project `arena`) | **`PASS` — "Verdict: PASS (no findings)"** |

**`audit_taste` final run:** `verdict: PASS`, `findings: []`, `fidelity_findings: []`,
`suppressed: []`, binding `arena`, surface "monochrome portfolio component surface".
`note_assessments`: typography **present** (`max_heading_px=96`), spacing **present**
(`text_density=0.32`), color **present** (`scheme=dark, bg_luminance=0.02`); layout, motion,
aesthetic, libraries and special returned **unverifiable** — the engine has no deterministic
verifier for those dimensions, so they are unchecked, not passed. 31 rules came back
`not_assessed` for the same reason (no deterministic detector / judgment required), including
`COLOR-accent-punctuation-not-fill`, `LAYOUT-no-card-soup`, `MOTION-prefers-reduced-motion`,
`OTHER-hover-state-required` and `ASSET-icon-stroke-current-color`. I verified those five myself
against the source and the Playwright run; they are agent-asserted, not tool-verified.

The first `audit_taste` run returned **WARN (0 block, 1 warn)** on `NOTE-typography`. Fixed as
described in decision 9, then re-run to `PASS`.

---

## What I could not satisfy

1. **A2 is not clean: `talon_scan` returns one warning I cannot fix from the build.**
   `TAL-003 — 1 near-duplicate color pair(s) within ~5% lightness: #141414 / #1c1c1c`.
   Those are `colors.bg-elev` and `colors.bg-card`, both declared verbatim in `arena/DESIGN.md`
   (lines 4–5) and both listed in the prompt's sanctioned token set. **Measured, not assumed:**
   I ran `talon_scan` on an HTML document containing *only* the nine-line `:root` palette
   declaration and no component CSS whatsoever — it returns the identical single `TAL-003` warning.
   The finding is a property of the supplied palette, not of anything this build authored.
   I did not delete the token to clear the scan; that would be audit-gaming a design-system fact.
   Everything else passes: palette tight (9 colors), 94% of spacing on the 4px grid, 5 unique
   spacing values, 3 font families, no heading skips, semantic landmarks present, respects
   `prefers-reduced-motion`. A separate geometry-mode run on the post-interaction snapshot
   (elements + viewport 1280×800) returned **0 findings**: no orphan-stretch, no viewport overflow.

2. **A1's `checks_skipped` cannot be emptied from the build either.** `review_diff` returns
   `checks_skipped: ["typography-tokens"]`. **Measured:** the same skip appears on a two-line
   token-only diff with the same DESIGN.md, and it survives adding `px` units to the `type` scale.
   `dist/design-review.js:224` pushes that skip when the DESIGN.md vocabulary yields no font-size
   *and* no font-family tokens — `arena/DESIGN.md` declares no font-family tokens at all (the font
   names live in prose, not frontmatter). The verdict itself is `pass`.

3. **`review_diff` also emits `info`-severity `token-value-match` / `hardcoded-spacing` notes** on
   the literals inside `var(--token, fallback)` fallbacks. These are deliberate: the binding's
   `libraries` design note requires "Every visual value is `var(--token, fallback)`", and
   `TOKEN-no-bare-literals` prescribes the same form. The detector reads the fallback as an inlined
   literal. I confirmed by grep that **zero** hex, px, or font-family literals appear outside a
   `var(--token, fallback)` expression anywhere below the `:root` token block. None of these notes
   is error-severity and the verdict is `pass`.

4. **Motion duration and easing are verified as declared values, not as sampled frames.** I assert
   the computed `transition-duration` and `transition-timing-function` on the live element, which
   proves the tokens are bound correctly. No motion sampler exists, so the *rendered* curve is
   still UNVERIFIED, exactly as the acceptance table states.

5. **Screen-reader announcement is untested.** The live-region markup is correct and the
   fill-after-insert ordering is deliberate, but no AT was driven. GUESSED.
