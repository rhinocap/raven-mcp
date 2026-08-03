# Build log — optimistic-save snackbar

## What the tools told me

**`read_design_md`** (project: `.claude/pregate-2026-08-02/arena`) — the frontmatter gave concrete
token values I used verbatim:
- Colors: `--bg #050505`, `--bg-elev #141414`, `--bg-card #1c1c1c`, `--fg #ffffff`,
  `--fg-muted #b8b8b8`, `--fg-dim #828282`, `--line #363636`, `--line-strong #545454`,
  `--accent #ed4609` (single warm-orange accent, no second hue).
- Type scale: label 13 / body 16 / lead 20 / h3 27 / h2 56 / h1 96.
- Spacing scale: xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48.
- Motion: fast 120ms / base 200ms / slow 400ms, with `out-quart`, `out-expo`, and `site` easings.
- Component contract: buttons are semantic classes (`primary`/`ghost`) with
  hover/focus-visible/active/disabled states; body prose says dark-first editorial,
  hairline rules, one warm accent, `prefers-reduced-motion` mandatory, no bare literals.

**`get_taste_profile("andrew")`** (truncated to a saved file — read via grep/offset since
it was 1,616 lines) — the rules that bear directly on a snackbar:
- `COLOR-one-warm-orange-accent` / `COLOR-accent-punctuation-not-fill` — accent is
  punctuation only, never a fill or dominant surface.
- `COLOR-control-signal-only` — no decorative color on controls.
- `LAYOUT-no-card-soup` — no drop-shadowed rounded-card grids; hairline-ruled editorial
  primitives instead.
- `TYPE-serif-authorial-only` — Domaine serif is banned from any UI chrome (titles,
  labels, CTAs); reserved for editorial prose only — so the snackbar uses Untitled
  Sans/Geist Mono exclusively, no serif anywhere.
- `MOTION-prefers-reduced-motion` — every animation needs a reduced-motion override
  clamping to ~0.001ms; non-negotiable.
- `MOTION-reveals-structure` — motion should reveal state, not decorate.
- `TOKEN-no-bare-literals` / `TOKEN-semantic-names` / `TOKEN-semantic-button-classes` —
  all values through `var(--token, fallback)`, semantic (not literal) names, semantic
  button classes.
- `ASSET-icon-stroke-current-color` — icons use `stroke="currentColor"`.
- `SPACING-tap-targets-44px` — mobile-first tap targets ≥ 44×44px.

## Choices made

- **Undo is the one place accent color appears** — colored text on the Undo action,
  no background fill, per `COLOR-accent-punctuation-not-fill`. Every other control
  (dismiss ×, primary/ghost demo buttons) is monochrome.
- **Auto-dismiss progress is a monochrome hairline bar** (`--line-strong` on `--line`
  track), not an accent-filled progress bar — keeps the countdown legible without
  making decorative color do double duty as signal.
- **No drop shadow / rounded card** on the snackbar surface — `--bg-elev` fill, 1px
  `--line` border, 3px radius (near-hairline, not a soft card), and a 1px flat
  `box-shadow` matching `--line` rather than a soft blurred shadow, so it reads as an
  editorial panel, not card-soup.
- **Timing**: entrance uses `--duration-slow` (400ms) with `--ease-out-expo` (deliberate,
  weighted arrival); exit uses `--duration-base` (200ms) with `--ease-out-quart` (quicker,
  since the user already acted). Auto-dismiss window is 5s, matching common snackbar
  conventions and giving enough time to read + decide on Undo.
- **Motion is structural, not decorative**: the countdown bar directly represents "time
  until auto-dismiss" (state, not flourish), and the whole `@media (prefers-reduced-motion:
  reduce)` block collapses every transition to 0.001ms including the countdown fill —
  the auto-dismiss timer itself still fires on schedule for reduced-motion users, it
  just isn't animated.
- **Explicit dismiss and Undo are mutually exclusive terminal states** — clicking Undo
  removes the Undo button, changes the message to "Change undone," and reverts the
  field synchronously; clicking dismiss just removes the bar without touching the
  saved value. Both stop the auto-dismiss timer so there's no double-fire/race.
- **Demo harness** is a single hairline-ruled field row (no card grid) with a
  `Save change` button that optimistically mutates the on-screen value immediately,
  then after a short simulated network delay shows the snackbar — modeling a real
  optimistic-update flow, not just triggering a toast.
- Kept the harness to Untitled-Sans body copy and Geist Mono for the small mono label
  and field value, matching `TYPE-serif-authorial-only` (no serif used anywhere in
  this component, correctly — it's chrome, not editorial prose).

## `audit_taste` result

Ran `mcp__raven__audit_taste` against profile `andrew`, surface `portfolio-monochrome`,
with the full built HTML.

- **Verdict: PASS (no findings)**
- `findings`: `[]`, `suppressed`: `[]`
- One deterministic rule was actually checked and passed automatically:
  `TOKEN-no-bare-literals` (the earlier smoke-test run with a placeholder string
  instead of real HTML DID flag this — confirming the detector works — and it
  cleared once the real, all-var()-authored markup was submitted).
- All other rules (`COLOR-*`, `LAYOUT-no-card-soup`, `TYPE-serif-authorial-only`,
  `MOTION-*`, `TOKEN-semantic-*`, `ASSET-icon-stroke-current-color`, etc.) came back
  under `not_assessed` — the engine has no deterministic detector for them and says so
  explicitly rather than guessing. I self-verified each of those by construction (see
  "Choices made" above) since no LLM design-judge pass was run in this session.

## Deviations / notes

- No literal Untitled Sans / Geist Mono font files were embedded (no license files
  available in this environment) — the CSS declares the correct token-driven font
  stack (`--font-body`, `--font-mono`) with system-font fallbacks, so on a machine
  with those fonts installed it renders correctly, and elsewhere it degrades to
  `-apple-system`/`ui-monospace` rather than substituting a different real typeface.
- `--font-serif` (Domaine) is declared nowhere in this file — deliberate, since the
  component is pure UI chrome and the taste profile bans serif from chrome contexts.
