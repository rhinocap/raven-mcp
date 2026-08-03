# build-07 — snackbar for an optimistic save

One self-contained file: `index.html`. No external requests (verified: zero `src=`/`href=`
attributes in the document). All CSS and JS inline.

## Grounding

- `read_design_md` on `/…/pregate-2026-08-02/arena/DESIGN.md` — all 27 tokens transcribed
  into `:root` at their concrete values.
- `get_taste_profile("andrew")` — 36 rules; the profile carries an `arena` surface binding
  ("monochrome portfolio component surface — transient UI components … on the dark editorial
  portfolio system") whose `design_notes` and `voice_note` were treated as acceptance criteria.

## What it does

State machine, all of it reachable by hand from the single **Save change** button:

| state | how to reach it |
|---|---|
| `idle` | load, or after any dismissal — **no snackbar node exists in the DOM** |
| `entering` | click Save (the value changes first — the save is optimistic) |
| `visible` | dwell timer running, countdown hairline depleting |
| `paused` | pointer over the snackbar, keyboard focus inside it, or tab hidden |
| `dismissing` | × button, `Escape`, or the dwell expiring |
| `undone` | **Undo** — restores the previous value, then a brief "Change reverted" acknowledgement |

Also: a second save does not stack — it dismisses the first and builds the replacement after
the exit, so there is only ever one snackbar.

## Choices reported

- **Easing.** Enter uses `--motion-easing-out-expo` at `--motion-duration-base` (200ms): the
  component arrives decisively and settles, which is what an already-committed change should
  feel like. Exit uses `--motion-easing-site` at `--motion-duration-fast` (120ms) — leaving is
  not an event. Buttons use `--motion-easing-out-quart` at `--motion-duration-fast` for
  colour/border only. No literal durations or curves anywhere; the JS reads the dwell back out
  of `--snackbar-dwell` via `getComputedStyle` so the token is the single source of truth.
- **Dwell.** 8s for the actionable confirmation (`--snackbar-dwell`), 5s for the "Change
  reverted" acknowledgement (`--snackbar-dwell-brief`, applied by the `.snackbar--brief`
  modifier — not an inline style). 8s is a compromise: long enough to read and reach Undo,
  short enough not to loiter; the hover/focus pause is what actually makes the timing safe.
- **Placement.** Bottom-left, `--snackbar-inset` from both edges, not centre-floating. It sits
  under the content column rather than over it, so it never reads as a bare modal.
- **Accent.** The one use of `--accent` at rest is a hairline under the word *Undo* — the only
  reversible action in the component. Everything else (countdown, borders, dismiss icon) is
  monochrome. Focus rings use the accent because a focus ring is signal.
- **Copy.** "Change saved" / "Change reverted", with a muted detail line naming the new value.
  Deadpan, unexclaimed, no "Success!", no exclamation, no persuasion verbs.
- **Elevation.** `--color-bg-elev` plus a 1px `--color-line` border and square corners. No
  shadow — a blurred shadow here would be decoration, and the profile blocks glow outright.

## Gaps resolved

1. **Type tokens are unitless in DESIGN.md** (`body: 16`). Written into `:root` with `px`
   (`--type-body: 16px`) so `font-size: var(--type-body)` is valid. Values unchanged.
2. **No font files.** "No external requests" forbids loading Untitled Sans / Geist / Domaine.
   Families are declared in the tokens with system fallbacks and `font-synthesis: none` on
   `body`, so nothing renders faux-bold or faux-italic if the real family is absent. Weights are
   restricted to 400/500/700 — 600 is never requested, since it would synthesize.
   `--font-serif` is defined for completeness but **never used**: authorial voice only, and
   nothing here is authorial.
3. **Countdown vs. reduced motion.** The depleting hairline is the only time cue, but it is
   motion. Under `prefers-reduced-motion: reduce` the element is **never built** (not
   CSS-hidden), per the profile's dynamic-DOM rule; the timer and the hover/focus pause still
   work, so the component stays operable without it.
4. **Timing accessibility.** The dwell pauses on pointer-over, on focus inside, and on tab
   hide; Undo and dismiss are always reachable; `Escape` dismisses globally.
5. **Focus loss on dismiss.** When the snackbar owning focus disappears, focus returns to the
   Save button rather than falling to `<body>`.
6. **Live region.** The `role="status" aria-live="polite"` container is persistent and empty
   at rest (a live region must pre-exist to announce); only the snackbar itself is created and
   removed. Nothing is CSS-hidden.
7. **Demo harness.** A hairline-ruled "Display name" record whose value changes *before* any
   confirmation (that is the optimism), a `Save change` primary button, and a mono `state · …`
   readout so the machine above can be watched while it is exercised.

## Not satisfied / accepted deviations

- The `@media (max-width: 480px)` breakpoint is a bare `480px`. Media query conditions cannot
  read custom properties — this is the one literal in the file outside `:root`, and it is not a
  visual value. Everything the query *sets* is a token.
- `stroke-width="1.5"` and the `viewBox` on the dismiss glyph are SVG geometry, not visual
  tokens. The icon's colour is `currentColor` and its box is `--icon-size` (16px).
- Fonts render in system fallbacks in this environment (see gap 2). Metrics will shift when the
  real families are present; the type scale is token-driven, so nothing needs re-authoring.
- No failure/rollback state. An optimistic save can lose its reconciliation, but the brief named
  confirmation, Undo, auto-dismiss and explicit dismiss — a server-error variant is unrequested
  scope, so it is flagged here rather than built.

## Verification

A temporary Playwright script (run from inside the repo, then removed) drove the built file:
**31 checks, 0 failing.**

Confirmed live: optimistic value change before confirmation · "Change saved" copy · inline Undo
· dismiss control · countdown rendered and paused in step with the timer · hover pause and
resume · focus pause · Undo restores the previous value and shows the brief acknowledgement with
no Undo of its own · focus returns to Save · single instance under repeated saves · × removes
the node from the DOM · `Escape` dismisses · auto-dismiss at 8126ms against an 8000ms token ·
tap targets 133×44 / 60×44 / 44×44 (floor 44×44) · reduced motion builds no countdown and clamps
transitions to 1e-06s · 390px viewport has no horizontal overflow and the snackbar fits · no
console or page errors.

One harness assertion failed on first run and was wrong, not the build: it expected the reduced
-motion transition string to match `0.001`, but 0.001ms serialises as `1e-06s`. The assertion was
re-derived and re-run.

Eyes-on at 1280×820 and 390×844 caught one real defect the checks could not: the accent hairline
was on the Undo *button's* bottom border, so at 44px control height it floated ~20px below the
word and read as loose decoration. Moved onto a label span so it hugs the word.

## Audit result

`audit_taste(profile: "andrew", project: "arena", surface: "monochrome portfolio component
surface — transient UI component (snackbar) …", html: <the built file>)`

**Verdict: PASS (no findings).**

- `findings`: none. `fidelity_findings`: none. `suppressed`: none. `skipped_out_of_scope`: none.
- Binding resolved: `arena`. Deterministic detectors that ran — gradients, glow/neon, second
  accent hue, banned persuasion vocabulary, bare literals — all clean.
- `note_assessments`: `color` **present** (`scheme=dark, bg_luminance=0.02`). The other seven
  dimensions came back **unverifiable** in html mode; they need a rendered URL. Worth naming:
  the engine's derived expectation for `typography` was "display-scale headings (≥64px)", which
  the page does not meet (the h1 is `--type-h2`, 56px). That expectation is the engine's generic
  heuristic, not the note — the binding's actual typography instruction is "component text stays
  in the body band; carry emphasis with weight or the accent, never with display size," which
  this build follows deliberately. It was not raised as a finding.
- 29 rules were reported under `not_assessed` (no deterministic detector — they need a judgment
  layer). A PASS here means nothing deterministic tripped, not that every rule was checked. The
  ones I hold myself to by construction, unchecked by the engine: reduced-motion override
  present and measured; every interactive element has hover, focus-visible and active states;
  buttons are semantic classes with zero inline styles; layout frames are proportional
  (`min()`, `flex`) with px reserved for component dimensions; `overflow-x: clip; max-width:
  100vw` on html and body; icons at 16px with `stroke="currentColor"`; conditional nodes are
  built and removed, never CSS-hidden.
