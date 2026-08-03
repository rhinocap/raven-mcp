# Build log — optimistic-save snackbar

## Tools consulted

**`read_design_md`** (`.claude/pregate-2026-08-02/arena/DESIGN.md`) — pulled the concrete token set used verbatim in the component:
- Colors: `bg #050505`, `bg-elev #141414`, `bg-card #1c1c1c`, `fg #fff`, `fg-muted #b8b8b8`, `fg-dim #828282`, `line #363636`, `line-strong #545454`, `accent #ed4609` (single warm accent, "everything decorative is monochrome").
- Type scale (13/16/20/27/56/96), space scale (4/8/16/24/32/48), motion durations (120/200/400ms) and three easings.
- Brief text: dark-first editorial, hairline rules, one warm accent, restraint over persuasion, semantic button classes with hover states, every animation must honor `prefers-reduced-motion`, Domaine serif is authorial-voice-only (never labels/CTAs), no bare hex/px/font literals in component CSS.

**`get_taste_profile("andrew")`** (103K chars — grepped rather than read whole) — pulled the rules that bind this kind of component:
- `COLOR-no-gradient-no-glow`: no gradients, no glow/neon.
- `LAYOUT-no-card-soup`: no drop-shadowed rounded-card grids; editorial hairline primitives instead.
- `LAYOUT-no-bare-modals-or-floating-buttons`: no floating buttons without visual context.
- `MOTION-prefers-reduced-motion` / `MOTION-reveals-structure`: motion must be structural (reveals state), not decorative, and must clamp under reduced motion.
- `TOKEN-semantic-button-classes`: no inline button styles.
- `OTHER-no-status-glow-pills`: no glow pills / decorative badges.
- `OTHER-no-load-bearing-decoration` / `VOICE-editorial-restraint`: restraint over persuasion, no salesy copy, "would this embarrass Apple" bar.
- Accent is "punctuation only," reserved for interactive elements — not fills, not decoration.

## Choices made

- **Placement & shape**: bottom-center fixed toast, single hairline-bordered surface (`--color-bg-card` / `--color-line-strong`), no drop shadow beyond a 1px hard edge — avoids card-soup and avoids glow.
- **Icon**: monochrome check mark (`--color-fg-muted` stroke) inside a hairline circle — status indicator, not a colored/glow pill.
- **Accent usage**: reserved `--color-accent` for exactly one place — the "Undo" action text, since it's the one interactive, load-bearing control in the toast. The dismiss (×) icon and the progress hairline stay monochrome (`fg-dim`/`line`) since they aren't the accent-worthy interactive signal.
- **Auto-dismiss + Undo**: 6s timer (`setTimeout`), paired with a literal hairline progress bar that scales from 1→0 over the same duration — motion that reveals actual remaining time rather than decorating. Under `prefers-reduced-motion`, the bar's transition collapses to 0.001ms but the timer itself still fires on schedule (the auto-dismiss behavior isn't motion, so it isn't gated by the media query — only the visual animation is).
- **Explicit dismiss vs. Undo**: kept semantically distinct per the spec — Undo reverts the optimistic change and hides the toast; the × commits the change silently and hides the toast. Both clear the pending timer.
- **Buttons**: `.btn.btn-primary` for the demo's "Save change" trigger (semantic class, hover/disabled states per DESIGN.md's button component contract); toast actions use dedicated `.snackbar__undo` / `.snackbar__dismiss` classes rather than inline styles, each with its own hover and `:focus-visible` state.
- **Fonts**: DESIGN.md's `--font-display`/`--font-body`/`--font-mono`/`--font-serif` are declared as tokens with the licensed families named, but since Untitled Sans / Domaine / Geist aren't available to embed in a self-contained artifact, each falls back to a close system stack. Domaine (`--font-serif`) is declared but deliberately unused in the component — DESIGN.md restricts it to authorial copy, and a snackbar has none.
- **Demo harness**: a small "Document status" / "Last change" panel simulates the record being optimistically mutated (`Draft` → `Published`) the instant "Save change" is clicked, before any server confirmation exists — so Undo has something real to revert, and the auto-dismiss/explicit-dismiss paths both leave the optimistic value committed.
- **Accessibility**: toast region is `role="status"` / `aria-live="polite"` so screen readers announce the confirmation without stealing focus; dismiss button has `aria-label="Dismiss"` since it's icon-only.

## `audit_taste` result

Ran `audit_taste(profile: "andrew", surface: "component", html: <built page>)`.

**Verdict: PASS — 0 findings, 0 suppressed.**

- `COLOR-one-warm-orange-accent` was `skipped_out_of_scope` (scoped to `portfolio-monochrome`, not `component`) — not a defect, just a scope mismatch for this surface tag.
- Everything else (gradient/glow, card-soup, reduced-motion, semantic buttons, hover states, no-load-bearing-decoration, voice restraint, icon consistency, etc.) landed in `not_assessed` — the engine is honest that these clauses need judgment rather than a deterministic detector, so it declined to guess rather than fabricate a pass. I addressed each by hand against the DESIGN.md brief and the grepped rule text above (no gradients/glow anywhere in the CSS, no drop-shadowed card grid, reduced-motion media query present, `.btn`/`.snackbar__undo`/`.snackbar__dismiss` are all named semantic classes with hover + focus-visible states, copy is a flat description with no persuasion language).

## Deviations / notes

- Licensed fonts (Untitled Sans, Domaine Display SemiBold, Geist) are referenced as token names but not embedded — no legal access to the font files from this session, so system-stack fallbacks stand in. Flagged rather than silently substituted.
- Chose a 6-second auto-dismiss window (not specified by the task) as a standard, generous-enough undo window; easily tunable via the `AUTO_DISMISS_MS` constant at the top of the script.
