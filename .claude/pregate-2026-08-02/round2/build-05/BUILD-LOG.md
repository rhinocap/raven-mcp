# Build log — snackbar (optimistic save, undo, auto-dismiss)

## Tools called

**`read_design_md`** on `arena/DESIGN.md` — returned the full token set used verbatim as CSS custom properties:
- Colors: `--color-bg #050505`, `--color-bg-elev #141414`, `--color-bg-card #1c1c1c`, `--color-fg #ffffff`, `--color-fg-muted #b8b8b8`, `--color-fg-dim #828282`, `--color-line #363636`, `--color-line-strong #545454`, `--color-accent #ed4609`
- Type scale: label 13 / body 16 / lead 20 / h3 27 / h2 56 / h1 96
- Space scale: xs 4 / sm 8 / md 16 / lg 24 / xl 32 / xxl 48
- Motion: fast 120ms / base 200ms / slow 400ms, plus out-quart / out-expo / site easing curves
- Body brief: dark-first editorial, ink-on-paper weight, hairline rules, one warm accent used as punctuation, Untitled Sans (400/500/700, no italics) for display/body, Geist for mono, Domaine Display SemiBold reserved for authorial voice only (never CTAs/labels) — so it is not used anywhere in this component.
- Frontmatter also specified the button component contract directly: variants `primary`/`ghost`, states `hover`/`focus-visible`/`active`/`disabled` — implemented as `.btn.btn-primary` / `.btn.btn-ghost` semantic classes.

**`get_taste_profile("andrew")`** — response was too large to inline (103K chars), saved to a temp file; grepped for the rules relevant to a toast/snackbar-class component: color, motion, layout, token, button, and hover-state rules. Key constraints pulled in:
- `COLOR-one-warm-orange-accent` / `COLOR-accent-punctuation-not-fill`: accent marks, never fills — so Undo is accent-colored TEXT on a transparent button, never an accent-filled pill or button.
- `COLOR-no-gradient-no-glow`: no glow/neon anywhere — ruled out a "glowing" progress bar for the auto-dismiss countdown; used a plain 2px hairline-toned bar instead.
- `LAYOUT-no-bare-modals` / floating-buttons-without-context precedent: the snackbar reads as a bordered, elevated surface (background + 1px border, no drop shadow — "dark UIs read structure from borders, not shadows" per a MORVEN precedent in the same profile) rather than a shadow-only floating card.
- `LAYOUT-no-card-soup`: single hairline-bordered surface, no rounded-card-with-shadow treatment.
- `MOTION-prefers-reduced-motion` (non-negotiable): every transition, plus the countdown-bar animation, collapses to 0.001ms under `@media (prefers-reduced-motion: reduce)`.
- `MOTION-reveals-structure`: entrance/exit is a simple opacity+12px translateY settle (matches the profile's own "wrong vs right" precedent that rejects theatrical rotate/skew entrances in favor of plain fade+rise).
- `TOKEN-semantic-names` / `TOKEN-semantic-button-classes`: every value is `var(--token)`, buttons use `.btn-primary`/`.btn-ghost`, no inline styles.
- `OTHER-hover-state-required`: Undo, dismiss (×), primary/ghost buttons, and the text input all have explicit `:hover` and `:focus-visible` states.
- `OTHER-status-pills-banned` precedent (shadcn-default / glow-pill ban): the confirmation icon is a plain accent-colored checkmark glyph, not a colored status pill/badge.

## Choices made

- **Placement**: fixed, bottom-center, above page content, in an `aria-live="polite"` region — standard snackbar convention, doesn't collide with the demo form.
- **Auto-dismiss**: 6s, visualized with a thin monochrome hairline bar that scales to zero (linear), not a colored/glowing progress ring — keeps the accent reserved for Undo only.
- **Explicit dismiss**: a small × icon button, `currentColor`-stroked SVG, dim by default, brightens on hover — never accent-colored, so the accent stays a single, unambiguous "this is an action" signal (Undo).
- **Undo behavior**: clicking Undo reverts the input's value, swaps the snackbar into an "undone" confirmation state (icon dims from accent to fg-dim — signals "no longer actionable"), removes the Undo affordance, and gives a short 1.2s grace window before auto-closing — so the user gets visual confirmation the undo itself landed.
- **Demo harness**: one "Save change" button on a single text field simulates an optimistic save — the value commits to the DOM immediately (optimistic), and the snackbar is the only feedback + safety net, matching the brief's "optimistic save with inline Undo" shape.
- **Icon strokes**: both icons use `stroke="currentColor"` so they inherit `.snackbar__icon` / `.snackbar__dismiss` color via CSS rather than hardcoded SVG fills.
- **No new dependencies, no external requests** — inline SVGs, system font stack as a safe fallback since Untitled Sans/Geist/Domaine are licensed files not available to embed in this fixture (declared as `--font-display`/`--font-body`/`--font-mono` fallback chains per the "tokens only, never literals" rule — the token exists even though the physical font file isn't bundled here).

## `audit_taste` result

First call was invalidated by my own error (I passed a literal placeholder string instead of the file's HTML — that run returned one `warn` for `TOKEN-no-bare-literals` because the placeholder obviously contained no CSS at all). Re-ran with the actual rendered markup+CSS:

```
verdict: PASS
verdict_line: "Verdict: PASS (no findings)"
findings: []
```

All rules with a deterministic detector passed clean. The remaining ~29 rules (`COLOR-accent-punctuation-not-fill`, `MOTION-prefers-reduced-motion`, `LAYOUT-no-card-soup`, `OTHER-hover-state-required`, etc.) came back under `not_assessed` — Raven's engine is honest that these need judgment/an LLM layer (e.g. design-judge) rather than guessing a pass; I addressed each of them by hand per the "Choices made" section above and via direct rule-text grep against the taste profile, but they are not machine-verified the way the token/literal check is.

## Deviations / notes

- Licensed font files (Untitled Sans, Geist, Domaine Display) are not embedded — this is a system-font fallback stand-in for the token names, consistent with the project's "tokens only, never literals" rule but not a byte-identical type render.
- The demo harness is intentionally minimal (single field + single button) per the brief's ask for "a demo page" to exercise the component, not a full app shell.
