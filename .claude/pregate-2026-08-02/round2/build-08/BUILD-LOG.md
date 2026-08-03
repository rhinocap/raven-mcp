# Build log — snackbar (optimistic save + undo)

## Tools consulted

**`read_design_md`** on the arena project returned the full token set used verbatim as CSS
custom properties:
- Colors: `--color-bg #050505`, `--color-bg-elev #141414`, `--color-bg-card #1c1c1c`,
  `--color-fg #ffffff`, `--color-fg-muted #b8b8b8`, `--color-fg-dim #828282`,
  `--color-line #363636`, `--color-line-strong #545454`, `--color-accent #ed4609`.
- Type scale: label 13 / body 16 / lead 20 / h3 27 / h2 56 / h1 96.
- Space scale: xs 4 / sm 8 / md 16 / lg 24 / xl 32 / xxl 48.
- Motion: durations fast 120ms / base 200ms / slow 400ms; easings out-quart, out-expo, and
  a bespoke `site` cubic-bezier.
- Brief body: dark-first editorial, hairline rules, one warm accent, generous negative
  space, "the work is the subject; the chrome recedes." Fonts are Untitled Sans
  (400/500/700, no italics) for display/body, Geist for mono, Domaine Display SemiBold
  reserved for authorial voice only (never titles/CTAs/labels) — irrelevant here since a
  snackbar has no authorial copy. Every visual value must be `var(--token, fallback)`,
  no bare hex/px/font literals in component CSS, semantic button classes, hover state on
  every interactive element, and every animation must honor `prefers-reduced-motion`.

**`get_taste_profile("andrew")`** returned a 1,616-line rule catalog + precedent corpus
(too large for inline context, read via the saved chunk file and grepped for relevant
categories). Rules that governed this build:
- `COLOR-no-gradient-no-glow` — no gradients, no glow/neon. → No shadow color, no glow;
  elevation shadow is neutral black at low opacity, not a colored/blurred glow.
- `LAYOUT-no-card-soup` — no grid of drop-shadowed rounded cards; editorial hairline
  primitives instead. → The snackbar is a single hairline-bordered surface with a small
  neutral elevation shadow, not a stack of decorative cards; the demo's status readout
  uses a hairline-bordered block, not a card-soup grid.
2. `TYPE-serif-authorial-only` — Domaine is authorial voice only. → Not used; all UI text
   is body/label sizes in the sans stack.
- `MOTION-prefers-reduced-motion` — every animation needs a reduced-motion clamp to
  0.001ms, non-negotiable. → Global `@media (prefers-reduced-motion: reduce)` block
  clamps the snackbar enter/exit, button transitions, and the timer-bar transition.
- `MOTION-reveals-structure` — motion reveals structure, doesn't decorate. → The only
  motions are: (1) the snackbar's enter/exit slide+fade, which communicates its
  appearance/dismissal, and (2) the countdown bar, which is a functional readout of time
  remaining before auto-dismiss, not ornamentation.
- `OTHER-hover-state-required` / semantic button classes — every interactive element
  (`.btn`, `.snackbar__undo`, `.snackbar__dismiss`) has hover, focus-visible, active, and
  (on `.btn`) disabled states.
- No shadcn-default visual language, no glow/status pills, no decorative badges — the
  snackbar is a plain hairline-bordered surface, not a rounded pill/toast with a colored
  glow ring.
- Tap targets ≥44px — `.btn`, `.snackbar__undo`, and `.snackbar__dismiss` are all 44px
  minimum in the dimension that matters (height for buttons, full 44×44 box for the icon
  dismiss button).
- One warm accent, used as punctuation not fill — `--color-accent` appears only on the
  Undo label, the countdown bar, and interactive focus rings/published-state text; the
  snackbar surface itself stays neutral (`--color-bg-elev` + hairline `--color-line`).

## Choices made

- **Placement**: bottom-center, fixed, single-instance region (`aria-live="polite"`,
  `role="status"`) — standard snackbar convention, doesn't compete with the editorial
  page content, and reads correctly to assistive tech without interrupting.
- **Elevation**: a single neutral, low-opacity box-shadow plus a 1px hairline border,
  rather than a heavier drop shadow — keeps it in the "hairline-ruled, not card-soup"
  register the brief specifies, while still lifting it visually off the page.
- **Countdown bar**: added a thin 2px bar in `--color-accent` along the bottom edge that
  animates from full width to zero over the auto-dismiss window. This is a deliberate
  read of `MOTION-reveals-structure` — it's a functional signal of "time remaining before
  this action is gone," not decoration, and it's the one place a second use of accent
  color felt earned (it's the temporal structure of the component, same role as the
  Undo action).
- **Local tokens not in DESIGN.md**: `--radius-snackbar` (3px), `--snackbar-auto-dismiss-ms`
  (5000), `--snackbar-shadow`. DESIGN.md's frontmatter has no radius or shadow token group
  and no timing-duration-in-milliseconds primitive for JS use, so these are defined
  locally as CSS custom properties (never bare literals in the rule bodies) and flagged
  here as a deviation/addition rather than silently invented. 5000ms auto-dismiss and a
  minimal 3px radius are both conservative, restraint-consistent defaults.
- **Fonts**: declared `--font-body`/`--font-display` as `"Untitled Sans", -apple-system,
  ...` and `--font-mono` as `"Geist Mono", ui-monospace, ...` per the brief's naming, but
  did not embed the licensed Untitled Sans/Geist font files (no webfont source available
  in this fixture) — the stack falls back to the system sans/mono. This is a known,
  disclosed gap rather than a silent substitution to a different named typeface.
- **Demo harness**: single "Save change" button that optimistically flips a document
  status from Draft → Published immediately (no request/spinner simulated — that's the
  point of "optimistic"), opens the snackbar with "Change saved." + inline Undo. Undo
  reverts the status and closes the snackbar immediately; the explicit dismiss (×) closes
  without reverting; auto-dismiss fires after 5s if neither is used. This exercises all
  three required behaviors by hand: confirmation, inline undo, and both dismiss paths
  (timed and explicit).
- **Escape key**: closes the snackbar when focus is inside it, as a keyboard-equivalent
  explicit dismiss (not in the original spec, added since it's a near-zero-cost a11y
  affordance for a transient status region).

## `audit_taste` result

Ran `audit_taste(profile: "andrew", surface: "component", html: <built file>)`.

**Verdict: WARN (0 block, 3 warn)**

All three warnings were the same deterministic rule, `CSS-ARITHMETIC-enumerate-all-offsets`
("before writing any translate/calc/inset value, enumerate every layout property that
shifts the visual origin"), firing on plain-text proximity matches for the words
"padding", "border", and "gap" elsewhere in the stylesheet (e.g. near an unrelated
`gap: var(--space-xxl...)` in `.stage`, and near a `border-box` declaration) — not on any
actual `calc()`/`translate()`/`inset` expression with a missing term. The component's one
positional transform (`transform: translateY(12px)` on the snackbar's enter/exit) is a
plain, single-term offset with no adjacent padding/border/gap arithmetic to omit, so
there's no real defect underneath the match; read as a lexical false positive from the
detector rather than a positioning bug, and no fix applied.

Everything else the profile covers for this surface (`COLOR-accent-punctuation-not-fill`,
`LAYOUT-no-card-soup`, `MOTION-prefers-reduced-motion`, `MOTION-reveals-structure`,
`TOKEN-semantic-button-classes`, `OTHER-hover-state-required`, etc.) came back
`not_assessed` — the engine is honest that these require judgment/LLM review rather than
having a deterministic detector, so it declined to guess rather than false-passing them.
I addressed each of those by hand against the read DESIGN.md brief and profile clauses
as documented in "Choices made" above. `COLOR-one-warm-orange-accent` was correctly
`skipped_out_of_scope` (scoped to `portfolio-monochrome`, not `component`).

No blocking findings. No further changes made in response to the audit.
