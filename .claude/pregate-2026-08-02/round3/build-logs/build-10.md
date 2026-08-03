# build-10 — snackbar for an optimistic save

Source spec: `round3/composed-prompt.md`. Tokens: `arena/DESIGN.md` frontmatter, transcribed
verbatim into the `:root` token layer. One self-contained file, no external requests.

## Choices the spec asked me to report

**Easing (enter and exit): `motion.easing.out-quart` — `cubic-bezier(0.25, 1, 0.5, 1)`.**
Both directions use the same curve. Reasoning: `out-expo` (0.16, 1, 0.3, 1) front-loads almost
all of its travel in the first ~40ms — at 200ms that reads as a flourish, and the spec says the
entrance "reveals where the surface sits relative to the viewport edge; it does not decorate."
`motion.easing.site` (0.56, 0.22, 0.05, 0.99) has a slow, held onset — it is the page-level
signature curve for large editorial transitions, and on a 120ms exit it would spend most of its
duration barely moving. `out-quart` decelerates without theatrics in both directions and keeps a
single curve across the component. Enter 200ms = `--motion-duration-base`, exit 120ms =
`--motion-duration-fast`, enter shift 16px = `--space-md`, exit shift 8px = `--space-sm`. No
timing or distance literal is authored in the CSS or the JS: the script reads
`--snackbar-enter-duration`, `--snackbar-exit-duration` and `--motion-duration-dwell` off the live
computed style, so CSS is the single source for every timing.

**Gap 2 — archetype `snackbar` matched no component.** Created one. Named `.snackbar`
(root, `data-state` mirrors the machine state). Registered in this log, not in `arena/DESIGN.md` —
see "Registration" below.

**Gap 3 — archetype `status-message` matched no component.** Created `.snackbar__message`,
a `<p role="status" aria-live="polite">`.

**Gap 4 — status_message emphasis, clamped from `type.h3` to `type.body`.**
Emphasis is carried by **weight and colour**: `--weight-medium` (500) plus `--color-fg` (#ffffff)
where every other line on the page sits at `--color-fg-muted` or `--color-fg-dim`. Size stays at
`--type-body` (16px). No display type anywhere in the component.

**Gap 5 — archetype `action-row` matched no component.** Created `.snackbar__actions`. It is
separated from the message by `border-left: 1px solid var(--color-line)` — a hairline rule, not a
filled surface — and the two controls inside it are separated from each other by the same rule.

**Gap 6 — undo_action emphasis, clamped from `type.h3` to `type.body`.**
Emphasis is carried by **weight and the accent**: `--weight-medium` label at `--type-body`, with a
2px `--color-accent` rule under the word only. The accent is punctuation on the label — it never
fills the control, never touches the surface, and appears nowhere else in the build. On hover and
`:focus-visible` the label text itself goes accent (measured 4.81:1 on `--color-bg-elev`, above AA).

**Gap 7 — button missing `loading` state.** Added `.btn.is-loading`: label drops to
`--color-fg-dim`, `aria-busy="true"` + `aria-disabled="true"` (not `disabled`, so keyboard focus is
not thrown to `<body>` mid-interaction), and a `--color-line-strong` hairline traverses the button's
bottom edge for exactly the request duration (`--motion-duration-slow`). It reports how long the
write is outstanding, so it carries information rather than decorating. It is genuinely exercised:
the optimistic write and the confirmation land immediately, and the request settles behind them.

**Gap 8 — button missing `secondary` variant.** Added `.btn--secondary`: an unframed text action,
monochrome, sitting between `primary` (hairline-framed) and `ghost` (recessive). The Undo control
is `btn btn--secondary snackbar__undo`.

**Gap 1 — decision-store scope mismatch.** Noted, not actionable from the build side: the Decision
Graph store resolves globally, so the `round3/decisions` path could not be re-scoped to `arena`.
The one active decision it carries (`dec_design_01`, rejecting a barely-there subdued field and
rejecting dark-only signature moments) does not constrain this component; nothing here is
dark-mode-exclusive by construction — the surface has one dark-first token set, per DESIGN.md.

## Registration

`btn--secondary` and `.btn.is-loading` are registered **here and in the component CSS's own
variant/state comment block**, not by editing `arena/DESIGN.md`. Deliberate: `arena/DESIGN.md` is
the shared fixture for fourteen parallel builds of this experiment, and mutating it mid-run would
change every other arm's input. If this fixture were promoted to a real system, the registration is
`components.button.variants: [primary, secondary, ghost]` and
`components.button.states: [hover, focus-visible, active, disabled, loading]`.

## Interpretations I had to make

- **`visible → reverted` has no exit motion.** The state chart routes undo *straight* to the
  terminal `reverted` state (only `dismiss` and the timeout pass through `leaving`), and `reverted`
  is defined as "removed from the document". I implemented that literally: Undo removes the surface
  at once and restores the previous value in the same frame. The alternative — running the 120ms
  exit for undo too — would have added a state the chart does not contain. Reported rather than
  silently smoothed.
- **Reduced-motion conflict.** The Motion section says the entrance becomes "opacity-only" under
  `prefers-reduced-motion`, while the prohibition `MOTION-prefers-reduced-motion` says every
  transition's duration must collapse to near-zero. I satisfied the stricter rule, which also
  satisfies the looser one: under `reduce`, both shifts go to `0px` (so opacity is the only property
  still transitioning) **and** both durations go to `--motion-duration-instant` (1ms). Verified live:
  check A5.19/A5.20.
- **Live-region announcement.** The message text is written on the frame *after* the root is
  appended, so the polite region exists in the document before its content changes — an insertion
  into a live region announces; a region that arrives already-populated frequently does not.
- **`OTHER-dynamic-dom-not-css-hide`.** No `display:none`, no `.hidden`, no opacity-0 parking. The
  snackbar is `createElement`'d on commit and `removeChild`'d on both terminal states. Verified by
  `document.querySelector` count, not by visibility (checks A5.1, A5.10, A5.17).
- **`CSS-ARITHMETIC-enumerate-all-offsets`.** The root's visual origin is enumerated in a comment
  above the rule. Centering uses `left:50%` + `translate:-50%`, which is exact because
  `box-sizing: border-box` puts the 1px hairline inside the measured width; the element is a fixed
  direct child of `<body>`, so no ancestor padding, gap, border or transform contributes. The
  vertical origin is exactly `bottom: --space-xl` plus the single motion term `--snackbar-shift`.
  Centering and motion share one `translate` property so neither can silently overwrite the other.
- **Fonts.** No font files are loaded (zero external requests is a hard note), so each family token
  carries its own fallback stack and the page renders in the system grotesque. Weights are 400/500
  only; no italic, no synthetic weight, no `--font-serif` usage anywhere.

## Acceptance criteria — result

| # | Claim | Result |
|---|---|---|
| A1 | No bare literal in component CSS | **agent-asserted, pass.** Every declaration outside `:root` is `var(--token, fallback)`. Literals exist only in the `:root` token layer and in SVG `viewBox`/`stroke-width` geometry. `review_diff` was not run — this build is not a diff against a tracked UI file. |
| A2 | Deterministic color/spacing/motion detectors | **agent-asserted, pass.** `talon_scan` was not run (it needs an elements+viewport snapshot payload this fixture has no producer for). The equivalent was covered by `audit_taste` (0 findings, PASS) plus a manual read: one accent hue, no gradient, no glow, no shadow, no radius. |
| A3 | Every interactive target ≥ 44×44 CSS px | **pass, measured post-interaction** (check A5.23): Save change 149×44, Undo 92×53, Dismiss 44×44. |
| A4 | Text contrast ≥ 4.5:1 | **pass, computed.** #fff/#141414 = 18.9:1 · #b8b8b8/#050505 = 10.3:1 · #828282/#050505 = 5.30:1 · #828282/#141414 = 4.79:1 · accent #ed4609/#141414 (hover Undo) = 4.81:1. Lowest value on the page is 4.79:1. |
| A5 | Appears and transitions per the States section | **pass, 23/23** — `state-machine.check.mjs` (Playwright, in-repo). Covers absent→entering→visible, the 6008ms measured dwell, hover hold (still visible at 7.5s), focus-within hold, dismiss→leaving→dismissed, undo→reverted with the value rolled back, `inert` during leaving, DOM removal on both terminals, and reduced-motion. Duration/easing are asserted from resolved token values, not sampled frames — the spec's caveat still stands there. |
| A6 | Semantic roles and live regions present | **agent-asserted, pass.** `role="status"` + `aria-live="polite"` on the message; `aria-label="Dismiss"` on the icon control; `aria-hidden`/`focusable="false"` on the icon; `inert` on the leaving surface; `aria-busy` on the in-flight button. |
| A7 | Taste verdict not BLOCK, design notes present | **pass — `audit_taste` verdict: PASS, 0 findings, 0 fidelity_findings.** |

## audit_taste result (profile `andrew`, project `arena`, surface `portfolio`)

```
Verdict: PASS (no findings)
findings: []            suppressed: []          fidelity_findings: []
binding: arena          surface_applied: portfolio
```

`note_assessments`: `color` = **present** (`scheme=dark, bg_luminance=0.02`). The other seven notes
came back **unverifiable** in html mode — `typography` and `spacing` want a rendered page for
heading-size and text-density traits, and `layout` / `motion` / `aesthetic` / `libraries` / `special`
have no deterministic verifier. 29 rules landed in `not_assessed` for the same reason (no
deterministic detector in static-HTML mode). So: no rule fired against this build, and the tool
verified one of eight notes; the remaining seven are agent-asserted above, not tool-confirmed.

Voice note returned by the audit: *"Editorial restraint, deadpan, zero sales language. Confirmation
copy is plain and unexclaimed; the affordance is named for what it does."*

## Not satisfied / open

- `review_diff` (A1) and `talon_scan` (A2) were not executed — neither has a valid input shape for a
  standalone fixture file with no diff and no snapshot producer. Both claims are agent-asserted and
  labelled as such above.
- Motion duration and easing remain **unverified as rendered timing** — the checks read the resolved
  token values, not sampled frames. The spec already flags this as beyond current tooling.
- `typography` and `spacing` design notes are unverified by tool; a `url`-mode `audit_taste` against a
  served copy would close them.

## Files

- `index.html` — the component + demo harness, self-contained.
- `state-machine.check.mjs` — the A5 verification (`node .../state-machine.check.mjs`, run from the
  raven-mcp repo root so Playwright resolves).
