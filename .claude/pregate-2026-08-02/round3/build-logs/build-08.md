# build-08 — snackbar for an optimistic save

One self-contained file: `index.html`. All CSS/JS inline, zero external requests, zero
dependencies. Tokens are declared once in `:root` from `arena/DESIGN.md`; all component
CSS is authored against `var(--token, fallback)`.

---

## Choices I was asked to report

**Motion easing — enter: `motion.easing.out-expo`.** The entrance has to say *where the
surface sits relative to the viewport edge*. `out-expo` front-loads almost all of the
travel and then settles with a long tail, so the 16px rise reads as the surface arriving
at a boundary rather than sliding a fixed distance. `out-quart` is too even for that;
`easing.site` has a slow head (0.56, 0.22) that reads as a decorative wind-up on a 200ms
transient.

**Motion easing — exit: `motion.easing.out-quart`.** The exit is a removal, not a reveal.
Over 120ms the difference between the curves is close to invisible, so the milder curve is
the honest pick — `out-expo` on 120ms is effectively a linear snap with a wasted tail.

**Structural values used:** enter `translateY(var(--space-md))` → 0 (space.md = 16px, the
spec's value hit exactly by a token, not a literal); exit 0 → `translateY(var(--space-sm))`
(space.sm = 8px, likewise). Durations are `--motion-duration-base` (200ms) and
`--motion-duration-fast` (120ms). All four verified from `getComputedStyle` — see A5.9/A5.10.

**Emphasis without display size (gaps 4 and 6).** Both nodes clamped to `type.body`:
- `status_message` — carries rank by **weight and colour**: `--weight-medium` (500) at
  `--color-fg`, against the recessive `--color-fg-dim` chrome around it.
- `undo_action` — carries rank by **weight plus the accent**: `--weight-medium` at
  `--color-fg`, with `--color-accent` as a hairline rule under the label only. The accent
  is punctuation on the label; it is never a fill, and it is the only accent on the surface.

**Component names for the three unmatched archetypes (gaps 2, 3, 5).** No equivalents
existed in the arena system, so I created them as BEM parts of one component rather than
three registrable components — a transient overlay whose parts have no life of their own:
- `snackbar` (`.snackbar`) — the archetype's own name; nothing in the system was close.
- `status-message` → `.snackbar__message`
- `action-row` → `.snackbar__actions`
The two controls reuse the existing `button` component via its semantic classes.

**Missing button `loading` state (gap 7) — added, not substituted.** `.btn[data-loading]`
plus `aria-busy`, used for real: the Save trigger holds it for the simulated 900ms request
that runs *behind* the optimistic update. Presentation is a dimmed monochrome ground and a
label swap ("Saving") — no spinner, no glow.

**Missing button `secondary` variant (gap 8) — added.** `.btn--secondary`: hairline
`--color-line-strong` border, transparent ground, `--color-fg` label, with hover /
focus-visible / active / disabled / loading. It is defined but not exercised on the demo
page — the harness only needs primary (Save), ghost (Undo) and icon (Dismiss).

**Registration:** both were added to this build's CSS only. I did **not** edit
`arena/DESIGN.md` — it is a shared fixture read by all 14 arms of this round, and mutating
it would contaminate the other builds. Flagging it as the one thing a real project would
do differently.

---

## Gaps I resolved on my own judgment

**Gap 1 (decision-store scope mismatch)** — nothing to act on at build time. The rejected
`dec_design_01` entries concern a light-mode field and a dark-mode signature moment; this
surface is dark-only and has no such field, so neither rejected direction was reachable.

**`entering` had no exit for an early activation.** The state chart only leaves `entering`
on `entrance-motion-end`, which would make the two controls dead for the first 200ms — a
click that does nothing. I let an activation during `entering` pass *through* `visible`
and then out, so no edge is invented and no input is dropped.

**Live-region announcement.** The message node is mounted with empty text and the copy is
set two frames later, so the insertion is announced. The alternative — a permanently
parked visually-hidden live region — would have meant a CSS-hidden element, which
`OTHER-dynamic-dom-not-css-hide` forbids.

**Escape.** Added as a dismiss route while focus is inside the surface. It terminates in
`dismissed`, the existing state, so the machine is unchanged.

**Reverted vs dismissed on the surrounding surface.** `reverted` restores the field value
and writes "Reverted — visibility is back to private."; `dismissed` leaves the value and
writes "Kept — visibility is public." Both outcome lines are built and removed from the
DOM, never CSS-hidden.

---

## Two defects I found on myself and fixed

1. **`Undo` sat optically high against `Saved`.** Caught on the full-size capture, not in
   code: the accent underline's `padding-block-end` was unbalanced, pushing the label up
   inside the flex-centred button. Paid the offset on both sides.
2. **An accent hover that failed AA.** `--color-accent` on `--color-bg-card` measures
   **4.45:1** — under the 4.5 floor — while on `--color-bg-elev` it is **4.81:1**. The
   hover ground now does not move; hover is carried by the colour change alone.

---

## Deviations, stated plainly

**`colors.bg-card` is declared in DESIGN.md but is not used in this build.** It sits 4/255
from `bg-elev`; as a hover ground that shift is invisible, and its only effect was to put a
near-duplicate pair in the palette (`talon_scan` TAL-003, warning). Removing it took A2
from 1 warning to 0 findings and cost nothing visible — hover is carried by ink
(`fg-dim` → `fg`, `fg` → `accent`) instead of a filled chip, which also suits the
"non-signal controls are monochrome" rule better than a hover fill did. The spec lists
bg-card as *available*, not required.

**The demo page title renders at `type.h1` (96px), via
`clamp(var(--type-h3), 9vw, var(--type-h1))`.** The first `audit_taste` run returned WARN
on `NOTE-typography` — the note promises display scale and the largest heading was 27px.
Display type is banned *in the component*, not on the page around it, so the page-level
`h1` now uses the system's own display step and the component stays in the body band. This
is the one change I made in response to an audit rather than to the design.

**Honest note on a bad inference.** I tried to prove TAL-003 was a property of the arena
palette rather than my authoring by deleting the `--color-bg-card` declaration and
re-scanning. The finding persisted and I nearly wrote it up as unavoidable — but the probe
was worthless, because every `var(--color-bg-card, #1c1c1c)` fallback still carried the hex
in the stylesheet text. The detector reads CSS text, not painted pixels. Removing every
occurrence cleared it (palette 9 → 8 colours).

---

## Acceptance criteria — measured

| # | Claim | Result | Evidence |
|---|---|---|---|
| A1 | No bare hex / font-size / font-family / spacing literal on added UI lines | **not run** | `review_diff` needs a git diff of a recognized UI file; this is an untracked fixture, so there is no diff to read. Agent-asserted instead: every literal in the file sits inside the `:root` token block or a `var()` fallback. |
| A2 | Clears the deterministic colour/spacing/motion detectors | **PASS — 0 findings** | `talon_scan` on the post-interaction snapshot (snackbar mounted, `visible`), viewport 1280×900: palette tight (8 colours), 100% of 22 spacing values on the 4px grid, 5 unique spacing values, 3 font families, no heading skips, landmarks present, `prefers-reduced-motion` respected. |
| A3 | Every interactive target ≥ 44×44 CSS px | **PASS — 3/3, 0 failing** | `audit_tap_targets` (minSize 44) on the post-interaction frame, plus an independent Playwright `getBoundingClientRect` sweep over every `button, a[href], [role=button]` with the snackbar mounted — empty failure list from both. |
| A4 | Text contrast ≥ 4.5:1 (AA normal) | **PASS — 17/17, 0 AA failures** | `audit_contrast` on the post-interaction frame. Lowest ratio 5.30 (`fg-dim` chrome). Component rows: "Saved" 18.42, "Undo" 18.42. |
| A5 | Appears and transitions per the States section | **PASS — 28/28 assertions** | Playwright, both motion modes. Covers absent → entering → visible; hover holds past 6000ms; focus-within holds past 6000ms; undo → reverted (surface removed, save rolled back, surrounding surface updated); dismiss → dismissed (save stands, distinct outcome); unattended auto-dismiss measured at **6348ms**; enter 0.2s / `cubic-bezier(0.16, 1, 0.3, 1)`; exit 0.12s / `cubic-bezier(0.25, 1, 0.5, 1)`; `leaving` computes `pointer-events: none`; reduced-motion enter is `transition-property: opacity` with `transform: none`; reduced-motion exit is 0.01ms. Zero page errors. |
| A6 | Semantic roles and live regions present | **PASS (agent-asserted, as the criterion specifies)** | `role="status"` + `aria-live="polite"` + `aria-atomic="true"` on the message; `aria-label="Dismiss"` on the icon control; `aria-hidden` + `focusable="false"` on the SVG; `aria-busy` on the loading trigger; `aria-current` on the state readout; `<main>` / `<section aria-labelledby>` landmarks. |
| A7 | Taste verdict not BLOCK, every design_note present | **PASS — "Verdict: PASS (no findings)"** | `audit_taste` (profile `andrew`, project `arena`, binding resolved: `arena`). |

**A5 caveat, kept from the criterion:** duration and easing are asserted from
`getComputedStyle`, which proves the tokens are *applied*. No motion sampler observed the
actual per-frame curve — that remains UNVERIFIED, as the criterion says.

### `audit_taste` verdict in full

`Verdict: PASS (no findings)` — 0 findings, 0 fidelity_findings, 0 suppressed,
0 disabled_by_binding.

`note_assessments`:
- typography — **present** (`max_heading_px=96`)
- spacing — **present** (`text_density=0.41`, low density earned)
- color — **present** (`scheme=dark, bg_luminance=0.02`)
- layout / motion / aesthetic / libraries / special — **unverifiable** (no deterministic
  verifier for those dimensions; the engine reports this rather than guessing)

29 rules came back `not_assessed` — judgment clauses with no deterministic detector
(accent-as-punctuation, card-soup, proportional frames, hover-state-required, icon sizes,
reduced-motion, semantic button classes, dynamic-DOM-not-CSS-hide, and the asset-clearance
/ content-accuracy families). Three of those — `SPACING-tap-targets-44px`,
`TOKEN-no-bare-literals`, `LAYOUT-no-bare-modals` — reported "no delegated results
supplied" on this run, so I ran their delegates directly rather than let the gap pass
silently; A3 and A4 above are those runs. `TOKEN-no-bare-literals` remains covered only by
A2's detectors plus my own read of the file.

---

## Verification method

`prefers-reduced-motion` was exercised in a second browser context with
`reducedMotion: 'reduce'`, not simulated. Tap targets and contrast were measured on a
**post-interaction** frame (snackbar mounted and settled in `visible`), because the
component is absent from the default DOM and a default-state audit would have measured a
page that does not contain it. Full-resolution captures were inspected by eye at the
`visible` and `undo:hover` states — that is where both self-caught defects came from.

Temporary artifacts (the Playwright script, the static audit frame, the local audit
server on :8781) were removed after the run. Only `index.html` and this log remain.
