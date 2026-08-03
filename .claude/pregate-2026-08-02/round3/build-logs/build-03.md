# build-03 — optimistic-save snackbar

Prompt: `round3/composed-prompt.md`. Tokens: `arena/DESIGN.md` (frontmatter transcribed verbatim).
Deliverable: `index.html` (one self-contained file, no external requests).
Evidence in this directory: `verify.mjs` (26 Playwright assertions), `capture.mjs`,
`state-visible.png`, `snackbar-hover.png`, `snackbar-focus.png`.

---

## Choices I was asked to report

**Enter easing — `motion.easing.out-expo`** (`cubic-bezier(0.16, 1, 0.3, 1)`), 200ms /
`motion.duration.base`. The entrance has to say *where the surface sits relative to the
viewport edge*. out-expo front-loads almost the whole 16px of travel and then settles on a
long tail, so the bar reads as arriving from off the bottom edge and coming to rest there.
out-quart is too even to make the edge relationship legible in 200ms; `site` has an
ease-in shoulder (0.56, 0.22) that reads as a slow start, which for an entrance looks like lag.

**Exit easing — `motion.easing.out-quart`** (`cubic-bezier(0.25, 1, 0.5, 1)`), 120ms /
`motion.duration.fast`. At 120ms an expo tail is below perceptual resolution — you get a
truncated cut rather than a decay. out-quart's gentler curve keeps a 120ms fade legible as
a departure. `site` was rejected for the same ease-in reason.

**Motion offsets snap to the spacing scale.** The prompt's 16px rise and 8px sink are
exactly `--space-md` and `--space-sm`, so both keyframes are authored as
`translateY(var(--space-md))` / `translateY(var(--space-sm))` — no literal offsets anywhere.

**Emphasis without display size (gaps 4 + 6).**
- `status_message` (emphasis 2, clamped to `type.body`): carried by **weight** —
  `--weight-medium` (500) against the page's 400 body, plus full `--color-fg` while the
  dismiss control sits at `--color-fg-dim`. No size change.
- `undo_action` (emphasis 2, clamped to `type.body`): carried by **the accent** —
  `--color-accent` as a 1px underline under the label only. It is the single accent-bearing
  element on the surface, and it is a hairline, never a fill.

**Component names for the unmatched archetypes (gaps 2, 3, 5).** DESIGN.md's `components`
block has only `button`, `card`, `nav`, so I created three and named them here:
| archetype | created as | note |
|---|---|---|
| `snackbar` | `.snackbar` (+ `.snackbar-host` mount point) | new; `card` was rejected — it would import the card surface the layout rules ban |
| `status-message` | `.snackbar__message` | new; an element of `.snackbar`, not a standalone component |
| `action-row` | `.snackbar__actions` | new; separated from the message by `border-inline-start`, a hairline, not a filled surface |

**Missing button state `loading` (gap 7).** Added and registered as `.btn.is-loading`:
text drops to `--color-fg-muted`, `cursor: progress`, `aria-busy="true"`, and a 1px
`--color-accent` hairline fills the button's bottom edge over `--motion-duration-slow`.
It is progress, not decoration — the accent carries functional meaning. Because the save is
*optimistic*, the record and the confirmation do not wait on it: the value flips and the
snackbar mounts in the same tick, and `is-loading` represents only the in-flight request.

**Missing button variant `secondary` (gap 8).** Added and registered as `.btn--secondary`:
no frame, no fill, a hairline underline on the label. The Undo control is
`.btn .btn--secondary .snackbar__undo` — the base variant carries the shape, the
snackbar-scoped class swaps the underline to the accent. No substitute was needed.

---

## Gaps I resolved on my own judgment

1. **Live region placement.** The Structure section asks for a "polite live-region line",
   but `OTHER-dynamic-dom-not-css-hide` requires the snackbar to be *absent from the DOM*
   between saves — and a live region that is inserted already-populated frequently does not
   announce. Resolution: the permanent element is an **empty mount point**
   (`#snackbar-host`, `aria-live="polite" aria-atomic="true"`); the snackbar is appended
   into it and removed from it. The announcement fires on insertion, the machine still
   terminates in true removal, and nothing conditional is CSS-hidden. The bar itself is
   `role="group" aria-label="Save confirmation"` so the two controls are read as one unit.
   A second nested `role="status"` on the message line was deliberately *not* added —
   nested live regions double-announce.

2. **`visible → reverted` has no exit motion.** The state table transitions
   `visible → reverted` directly, with no `leaving` in between, and defines `reverted` as
   "removed from the document". I implemented it literally: Undo removes the node in the
   same frame. Only the dismiss/timeout path runs the 120ms exit. This is also the better
   read — a reversal should feel immediate, not negotiated.

3. **Which outcome the surrounding surface shows.** `dismissed` and `reverted` are required
   to be distinguishable. The demo record shows `Saved · kept` vs `Saved · reverted`, and
   the Visibility value itself is restored on undo, so the difference is visible in the data
   and not only in a status string.

4. **Focus after removal.** Activating Undo or Dismiss destroys the element holding focus.
   Focus is returned to the Save button. Not in the spec; leaving focus on `<body>` is a
   keyboard dead end.

5. **`leaving` inertness.** Implemented as `pointer-events: none` (CSS) **plus**
   `node.inert = true` **plus** a `state !== 'visible'` guard at the top of both handlers —
   three independent barriers, because a late click must not re-enter the machine.

6. **The 6000ms dwell is a token, not a JS constant.** `--motion-duration-dwell: 6000ms`
   lives in the token layer and the machine reads it off the cascade. Pause/resume is
   remaining-time arithmetic (`performance.now()` deltas), not a restart, so hovering three
   times does not grant three fresh clocks. Both hover and `focusin`/`focusout` hold it, and
   `focusout` ignores focus moves *within* the bar.

7. **Fallback style for `var(--token, fallback)`.** `TOKEN-no-bare-literals` requires the
   fallback form. Font-family fallbacks use the **generic keyword** (`sans-serif`,
   `monospace`) rather than a named face, so no font-family literal appears outside the
   token layer. Every hex, px, ms and easing literal appears exactly once, in `:root`.

8. **Escape dismisses.** Added: a keyboard user who has tabbed into the bar can leave it
   without hunting for the icon button. Routed through the same `onDismiss`, so it obeys the
   same guards.

9. **`--type-h1` for the demo page title.** Initially `--type-h2` (56px); the taste audit
   warned that the typography note promises display scale and 56px did not reach the
   detector's 64px floor. Raised to `--type-h1` (96px), stepping back down the same token
   ladder at 48rem and 30rem. This is the *page*, not the component — the component text
   stays in the body band, which is what the note actually protects.

---

## What I could not satisfy

- **Gap 1 (decision-store scope) is not fixable from a build.** The Decision Graph resolved
  from `round3/decisions`, outside the named project directory. Nothing in `index.html` can
  change that; I read the rejected-alternatives line and honoured it (no light-mode field,
  no dark-only signature moment — the surface is dark-first throughout).
- **Motion duration and easing are unverified by any tool.** A5 says so explicitly. I assert
  them from `getComputedStyle` on the live element (`animation-duration: 0.2s`,
  `animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`) — that proves the tokens
  resolved, not that the rendered curve is correct. No motion sampler exists.
- **`review_diff` (A1) and `talon_scan` (A2) were not run.** There is no diff to review — the
  file is new and unversioned — and I did not have a post-interaction elements+viewport
  snapshot in the shape `talon_scan` expects. A1's substance was verified by construction and
  by reading: every literal is inside `:root`. Reported as unrun rather than assumed passing.

---

## Audit result

`audit_taste({ profile: "andrew", project: "arena", surface: "portfolio", url: file://…index.html })`

**Verdict: PASS (no findings).** Binding resolved: `arena`. Surface applied: `portfolio`.
`findings: []`, `suppressed: []`, `fidelity_findings: []`.

Note assessments:

| note | status | evidence |
|---|---|---|
| typography | present | `max_heading_px=96` |
| spacing | present | `text_density=0.50` (expectation `<1.2`) |
| color | present | `scheme=dark`, `bg_luminance=0.02` |
| layout · motion · aesthetic · libraries · special | unverifiable | no deterministic verifier for those dimensions |

29 rules came back `not_assessed` ("no deterministic detector — requires judgment"),
including `COLOR-accent-punctuation-not-fill`, `MOTION-prefers-reduced-motion`,
`OTHER-dynamic-dom-not-css-hide` and `TOKEN-semantic-button-classes`. **A PASS here does not
mean those rules were checked.** Each is asserted by construction and, where possible,
covered by the Playwright pass below.

**First run was WARN (0 block, 1 warn):** `NOTE-typography` — "note promises display/dramatic
scale but the largest heading is 56px". Fixed by item 9 above; re-audit is the PASS recorded here.

### A5 / A3 — `node verify.mjs` → **26/26 passed**

Covers: initial `absent` with zero `.snackbar` nodes · insert + optimistic value flip ·
copy verbatim (`Saved` / `Undo` / `Dismiss`) · polite live region present ·
`entering → visible` on entrance-motion-end · **hover holds the clock past the full 6000ms
dwell** · **focus-within holds it past the full dwell** · release →
`visible → leaving → dismissed` on timeout · `visible → reverted` on undo with the previous
value restored · both terminal states remove the node from the document · the two outcomes
are distinct · focus returns to the trigger · `leaving` is `inert` + `pointer-events: none` ·
`leaving → dismissed` on exit-motion-end · zero page errors · enter animation computes to
`0.2s` / `cubic-bezier(0.16, 1, 0.3, 1)` · under `reducedMotion: 'reduce'` the entrance
keyframes contain **no transform** (opacity only) and the exit still terminates in `dismissed`.

### A3 — tap targets, measured on the post-interaction surface

Every `button` bounding box ≥ 44×44 CSS px (Save 149×46, Undo 68×46, Dismiss 44×46).
Measured in-page via `getBoundingClientRect()` while the snackbar was `visible`, not from a
static read.

### A4 — contrast, computed against the shipped token values

| pair | ratio |
|---|---|
| `fg` on `bg` | 20.38 |
| `fg` (message) on `bg-elev` | 18.42 |
| `fg-muted` (lede, note) on `bg` | 10.27 |
| `fg-dim` (eyebrow, keys) on `bg` | 5.30 |
| `fg-dim` (dismiss icon, resting) on `bg-elev` | 4.79 |
| `accent` underline on `bg-elev` | 4.81 |
| `accent` focus ring on `bg` | 5.32 |
| `fg` on `bg-card` (button hover) | 17.04 |

All ≥ 4.5:1. The dismiss icon's hover pair is white-on-`bg-card` (17.04), not
`fg-dim`-on-`bg-card`, so the one sub-4.5 combination in the palette never renders.
Computed with the WCAG relative-luminance formula against the exact `:root` hexes, not
delegated — `audit_contrast` was not run.
