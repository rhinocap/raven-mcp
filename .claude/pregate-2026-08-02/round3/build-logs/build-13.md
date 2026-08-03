# build-13 — optimistic-save snackbar

Component: a snackbar that confirms an optimistic save, offers an inline Undo,
auto-dismisses, and can be dismissed explicitly. One self-contained
`index.html`, no external requests.

## Grounding

- `read_design_md` on `arena/DESIGN.md` — every token value below is transcribed
  from it, not invented.
- `get_taste_profile("andrew")` — 38 rules, plus a saved surface binding for
  project `arena`: *"monochrome portfolio component surface — transient UI
  components (toasts, inline affordances, buttons) on the dark editorial
  portfolio system"*, with design notes on typography, spacing, color, layout,
  motion, aesthetic, and libraries, and a voice note: *"Editorial restraint,
  deadpan, zero sales language. Confirmation copy is plain and unexclaimed; the
  affordance is named for what it does."* That binding drove every call below.

No other design source was consulted; DESIGN.md plus the profile were sufficient.

## What it does — the state machine

| Trigger | Result |
|---|---|
| `Save change` | Value flips **immediately** (optimistic), snackbar mounts with `Visibility set to Private.` + `Undo` + close control + countdown hairline |
| hover / focus inside the snackbar | Countdown **holds** (JS timer paused, CSS `animation-play-state: paused`); resumes on leave / focus-out |
| `Undo` | Value restored, snackbar is **replaced** by `Visibility restored to Public.` — no Undo affordance, shorter dwell |
| close control (✕) | Immediate dismiss, focus returns to `Save change` |
| `Escape` | Same explicit dismiss |
| nothing, 6000 ms | Auto-dismiss |
| `Save change` while one is open | Existing snackbar torn down first — never two at once |

## Choices, and why

- **Optimistic means optimistic — there is no "Saving…" state.** The value on the
  row changes on click and the snackbar confirms it after the fact. A pending
  spinner would contradict the pattern the brief named. The page lede says this
  out loud so the demo reads honestly.
- **Easing / duration**: entrance `--motion-duration-base` (200ms) with
  `--motion-easing-out-quart`; exit `--motion-duration-fast` (120ms), same
  easing. Out-quart over out-expo because a transient confirmation should arrive
  without a flourish; out-expo's long tail reads as an entrance you are meant to
  watch. Both are token references, never literal numbers.
- **Motion is 8px of rise + opacity, nothing else.** No slide-in from off-screen,
  no scale, no bounce — motion reveals that something arrived, it does not
  perform.
- **The countdown hairline is the only decoration, and it is load-bearing**: it
  is the visible remaining Undo window, which is the one thing a user needs to
  know while an undoable action is still undoable. 1px, accent, bottom edge —
  accent as punctuation, never a fill.
- **Undo is `--accent` text on a transparent ground**, not an accent button.
  Measured against `--color-bg-elev` that is 4.88:1, over the 4.5:1 floor for
  13px text.
- **`prefers-reduced-motion` removes the countdown hairline from the DOM
  entirely** rather than leaving a bar the global clamp has frozen at full width.
  A frozen progress indicator is a lie; the JS dwell still runs, so auto-dismiss
  is unchanged. Verified: 0 timer nodes under reduced motion, snackbar still
  auto-dismisses.
- **The snackbar node is created and removed, never CSS-hidden**
  (`OTHER-dynamic-dom-not-css-hide`). The only persistent node is an empty
  `role="status" aria-live="polite"` region, which has to pre-exist for the
  announcement to fire — that is an always-present container, not a hidden
  element.
- **Focus is returned to `Save change`** when the dismissed snackbar contained
  focus, so keyboard dismissal does not drop the user on `<body>`.
- **Dwell holds on hover and focus** (WCAG 2.2.1). An undo window that expires
  while you are reading it is the classic snackbar defect.
- **Demo harness has real context** — an eyebrow, a title, a lede, one hairline-ruled
  setting row showing the value being changed. `LAYOUT-no-bare-modals` bans
  floating controls without context; a snackbar demoed over an empty page is
  exactly that.
- **Copy is deadpan and names the thing**: `Visibility set to Private.`,
  `Visibility restored to Public.`, `Undo`, `Dismiss`. No exclamation, no
  "Success!", no "Oops", no "Got it".
- **Single accent, no gradient, no shadow, no radius.** The snackbar is a
  hairline-ruled `--color-bg-elev` plane, not an elevated rounded card.

## Gaps I had to resolve

1. **DESIGN.md's type scale is unitless** (`body: 16`). Appended `px` in the
   token declarations: `--type-body: 16px`. Ratios preserved exactly.
2. **No font files may be loaded** (self-contained, no external requests), but the
   brief says fonts are tokens-only. Declared `--font-body` / `--font-display` /
   `--font-mono` as stacks naming `Untitled Sans` and `Geist Mono` first with
   system fallbacks, so a machine with the licensed families renders correctly
   and no request is made either way. No italic is used anywhere, so
   `TYPE-no-faux-anything` cannot be violated by a synthesized slant.
3. **`--font-serif` (Domaine) is not used at all.** The binding restricts it to
   authorial voice; a snackbar, a page title, and a control label are all
   disqualified contexts.
4. **DESIGN.md carries no tokens for weight, leading, tracking, measure, border
   width, focus ring, icon size, tap minimum, z-index, or dwell.** Added them as
   an explicitly-commented `EXT` block in `:root`, semantically named
   (`--weight-medium`, `--tap-min`, `--snackbar-dwell`), so component CSS still
   references only variables. Dwell is 6000ms / 3600ms terse — long enough to
   read a sentence and reach for Undo, short enough not to loiter.
5. **`--snackbar-dwell` is the single source of truth for timing.** The JS reads
   it back off the element with `getComputedStyle`, so the CSS countdown and the
   JS auto-dismiss cannot drift, and the `snackbar--terse` modifier retimes both
   by overriding one variable.
6. **The button `disabled` state** is required by `DESIGN.md components.button`
   but has no honest use in an optimistic flow (nothing is ever in flight).
   Styled for system completeness, not exercised by the harness.

## Could not satisfy

- **One bare literal survives**: `@media (max-width: 480px)`. `var()` is not
  valid inside a media query condition per the Custom Properties spec, so this
  cannot be tokenized. Commented as such at the call site. Every other value in
  the stylesheet outside `:root` is `var(--token, fallback)` — verified by
  scanning the compiled CSS for hex and px outside the token block.
- **`h1` is 96px, which is loud for a component demo.** Kept because `--type-h1`
  is the scale's h1 and the element is an h1; see the audit note below.

## Verification

Driven in real Chromium (Playwright, `file://`), every state exercised, console
clean (0 errors):

- mount on save, value flips to `Private` before the snackbar appears
- Undo restores `Public`, replaces the snackbar, drops the Undo affordance, applies `snackbar--terse`
- explicit dismiss (✕) removes the node and returns focus to `#save-change`
- `Escape` dismisses
- auto-dismiss fires at the 6000ms dwell (present at t+120ms, gone at t+6.9s)
- hover pauses: `is-holding` applied, computed `animation-play-state: paused`, `running` again on leave
- a second save while one is open leaves exactly 1 snackbar
- reduced-motion context: 0 `.snackbar__timer` nodes, snackbar still mounts and still auto-dismisses
- tap targets measured: Undo 78×44, Dismiss 44×44, Save change 142×44 — all ≥ 44×44
- HTML tag balance checked; inline JS passes `node --check`; 0 external URL references

## Audit result — `audit_taste(profile "andrew", project "arena")`

**Final: `PASS` — "Verdict: PASS (no findings)".** 0 block, 0 warn, 0 nit.
Binding `arena` resolved; surface applied. `fidelity_findings: []`.
Note assessments: typography **present** (`max_heading_px=96`), spacing
**present** (`text_density=0.68`), color **present** (`scheme=dark,
bg_luminance=0.02`); layout / motion / aesthetic / libraries / special returned
`unverifiable` (no deterministic verifier). 29 rules returned `not_assessed` —
the engine reporting honestly that those clauses need judgment, not that they
were checked and passed.

**First pass was `WARN` (0 block, 1 warn)** and I fixed it rather than
explaining it away:

- `NOTE-typography`, warn — *"note promises display/dramatic scale but the
  largest heading is 56px (max_heading_px=56)."*
- Cause: I had styled the page's `<h1>` at `--type-h2` (56px). That was a real
  mismatch — the element is an h1 and the scale has a 96px `--type-h1`, so the
  token and the element disagreed for no reason.
- Fix: `.page__title` now uses `var(--type-h1, 96px)`, the title was shortened to
  `Visibility` so it sets on one line at that size, and the existing 480px
  breakpoint steps it down to `--type-h2` on narrow screens. Re-audited: `PASS`.
- Note this changed the **harness**, not the component. The binding's typography
  note says component text stays in the body band and carries emphasis with
  weight or accent, never display size — the snackbar's own type is unchanged at
  `--type-body` / `--type-label`.
