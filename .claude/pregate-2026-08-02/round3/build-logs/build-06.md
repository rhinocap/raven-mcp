# build-06 — snackbar, optimistic save

One self-contained file: `index.html` (all CSS + JS inline, zero external requests — verified
by regex sweep: 0 `http(s)://` references outside the SVG namespace URI).

## Grounding

- `read_design_md` on `.../pregate-2026-08-02/arena/DESIGN.md` — every token value below is copied
  from that frontmatter, not invented.
- `get_taste_profile("andrew")` — 39 rules; the `arena` binding resolved to *"monochrome portfolio
  component surface — transient UI components (toasts, inline affordances, buttons) on the dark
  editorial portfolio system"*, voice note *"Editorial restraint, deadpan, zero sales language.
  Confirmation copy is plain and unexclaimed; the affordance is named for what it does."*
- I deliberately did **not** read `round3/composed-prompt.md` or `round3/grounding.md`. This build
  is the arm whose information source is the two tool calls; reading the other arm's spec would
  have contaminated the comparison.

## Choices reported

| Choice | Decision | Why |
|---|---|---|
| Entrance motion | `opacity 0→1` + `translateY(8px→0)`, `--motion-duration-base` (200ms), `--motion-easing-out-expo` | Out-expo settles hard at the end — the bar arrives and stops rather than drifting. Structural, not decorative. |
| Exit motion | same two properties reversed, `--motion-duration-fast` (120ms), `--motion-easing-out-quart` | Leaving should be quicker than arriving; nothing to read on the way out. |
| Auto-dismiss window | 6000ms (`--snackbar-dismiss-ms`) | Long enough to read 5 words and reach Undo; the standard 4s is short for a target that must also be tabbed to. |
| Revert-confirmation window | 2400ms (`--snackbar-revert-ms`) | Nothing left to act on, so it only needs to be read. |
| Countdown affordance | 1px accent hairline along the bottom edge, `scaleX` driven by a JS-owned `--snack-meter` custom property | The undo window is a real deadline; showing it is load-bearing, not decoration. A hairline is the same primitive `--line` already uses, so it adds no new visual vocabulary. |
| Timer pause | pauses on `pointerenter` / `focusin` / tab-hidden, resumes on leave / blur / tab-visible | A countdown that runs while the user is reaching for Undo is a trap. |
| Dismiss affordances | inline `×` button (16px, `stroke="currentColor"`), plus `Escape` | Two explicit exits, one pointer one keyboard. |
| Stacking | single slot — a second save replaces the standing snackbar | Queued toasts create a backlog the user never asked to read; the newest confirmation is the only true one. |
| Accent usage | Undo label + countdown hairline only | Accent as punctuation, never fill. Nothing else on the page is colored. |
| Button variants | `.btn--primary` (Save change) and `.btn--ghost` (Undo, dismiss), states `hover / focus-visible / active / disabled` | Matches the variant + state vocabulary DESIGN.md declares under `components.button`. |
| Focus | the snackbar never steals focus; it is announced via `role="status" aria-live="polite"` | Optimistic save is not an interruption. |

## Gaps resolved

1. **Type tokens are unitless numbers** in DESIGN.md (`body: 16`). Resolved to `px`
   (`--type-body: 16px`) so component CSS never has to append a unit literal.
2. **No font files may be fetched** (self-contained, no external requests), but the brief names
   Untitled Sans / Geist / Domaine. Declared as `--font-body` / `--font-mono` / `--font-serif`
   with the real family names first and a system stack behind them. No italic is ever requested
   and no `font-style: italic` or synthetic weight appears anywhere, so `TYPE-no-faux-anything`
   holds under substitution. `--font-serif` is declared and never used — the surface has no
   authorial passage, and the binding forbids serif on titles, headers, metrics, and CTAs.
3. **Reduced motion vs. the countdown.** The global `prefers-reduced-motion` clamp sets every
   animation/transition to 0.001ms. If the countdown were a CSS animation, that clamp would fire
   `animationend` instantly and dismiss the snackbar the moment it appeared — a correctness bug
   dressed as an accessibility win. So the timer is owned by JS and the *motion* is what gets
   removed: under reduced motion the meter element is **not added to the DOM at all** (per
   `OTHER-dynamic-dom-not-css-hide`, absent rather than hidden), and the 6s window still runs.
   Verified: with `reducedMotion: 'reduce'`, meter nodes = 0 and the bar still auto-dismissed.
4. **Tokens the brief doesn't define** (radius, hairline width, tap-target minimum, icon size,
   page/snackbar widths, z-index, timings) are declared as named semantic customs in `:root`
   (`--hairline`, `--control-target`, `--icon-sm`, `--page-max`, `--snackbar-max`,
   `--layer-snackbar`, …) rather than written as literals at the use site.
5. **"Optimistic" needed something to be optimistic about.** Added one hairline-ruled record row
   (`Visibility: Private ⇄ Public`) that flips *before* any confirmation, so Undo has real work to
   do, plus a mono state readout (`state / undo window / last action`) so every branch of the
   machine is observable by hand.

## Could not satisfy / deliberate deviations

- **`audit_page` warns "no content container max-width detected — expected your 720px token."**
  The container *is* capped: `.page { max-width: var(--page-max, 720px) }`. The detector appears
  to want a literal px value, and `TOKEN-no-bare-literals` is a **block**-severity rule while this
  is a warning. Kept the token; not fixing a block-rule violation into the file to clear a warn.
- **`NOTE-typography` warn (see below).** Not fixed — reasoning in the audit section.
- Untitled Sans, Geist Mono, and Domaine Display are not embedded (gap 2); on a machine without
  them the page falls back to the system stack. Unavoidable under "no external requests".

## Verification (Playwright, headless chromium, real clicks)

Every branch of the state machine exercised, not inferred:

| Path | Result |
|---|---|
| idle | 0 snackbar nodes in the DOM |
| save | record flips `Private → Public` **before** the confirmation; 1 snackbar; state `visible` |
| countdown | `--snack-meter` 0.928 → 0.778 over 900ms |
| hover pause | state `paused`, remaining frozen at 4.7s across 800ms |
| resume | state `visible`, countdown continues (4.2s) |
| Undo | record reverts to `Private`, message becomes "Change reverted.", reason `undone` |
| dismiss (`×`) | node removed from the DOM, state `idle` |
| dismiss (`Esc`) | node removed, reason `dismissed (esc)` |
| auto-dismiss | node removed at 6s, reason `auto-dismiss` |
| double save | 1 node, not 2 (single slot) |
| reduced motion | 0 meter nodes, snackbar still present, still auto-dismissed at 6s |
| 390×844 | tap targets 76×44 and 44×44; no horizontal scroll |
| console | 0 page errors across all of the above |

Tap targets measured from `getBoundingClientRect`: Save change 149×44, Undo 76×44, Dismiss 44×44 —
all ≥ 44×44 (`SPACING-tap-targets-44px`).

Contrast (`audit_contrast`): 12/12 rendered page rows pass AA, 0 failures. Snackbar rows measured
separately by snapshot — message 18.42:1, Undo accent on `--bg-elev` 4.81:1, dismiss icon 4.79:1.
**One real defect found and fixed here:** Undo on hover originally washed to `--bg-card` (#1c1c1c),
which dropped warm orange to **4.45:1 — an AA fail by 0.05**. Changed the ghost hover to press
*into* the page (`--color-bg`, #050505) instead of lifting off it, which raises it to **5.32:1**.
Re-measured and passing.

`audit_page` (rendered, with a click on `#save` so the snackbar is present): **score 100, grade A**,
16/17 checks, 0 errors, 1 warning (the max-width token warning discussed above).

## Audit result — `audit_taste` (profile `andrew`, project `arena`)

**Verdict: WARN (0 block, 1 warn)** — run against the final file, url mode, binding `arena`
resolved, surface *"monochrome portfolio component surface…"*.

- `findings`: **empty**. No rule violation of any severity.
- `note_assessments`: `color` **present** (scheme=dark, bg_luminance=0.02), `spacing` **present**
  (text_density=0.38), `typography` **missing**, the rest unverifiable by trait counting.
- `fidelity_findings`: one — `NOTE-typography` (warn): *"note promises display/dramatic scale but
  the largest heading is 56px (max_heading_px=56)."*

**Dispositioned, not fixed.** The detector reads the word "Display" in *"Domaine **Display**
SemiBold"* as a promise of ≥64px headings, but the note it cites says the opposite: *"Component
text stays in the body band; carry emphasis with weight or the accent, **never with display
size**."* The page title tops out at `--type-h2` (56px) via
`clamp(--type-h3, 6vw, --type-h2)`. Raising it to `--type-h1` (96px) to satisfy the trait check
would make the demo chrome shout over the component it exists to show — against both
`VOICE-work-is-subject` and the cited note itself. Recorded as a false positive; the artifact is
held at 56px deliberately.

One scoping note: calling `audit_taste` with an explicit `surface: "component"` skips
`COLOR-one-warm-orange-accent` (scoped `portfolio-monochrome`). The verdict of record above is the
default call **without** `surface`, which keeps that rule in scope — it produced no finding.
