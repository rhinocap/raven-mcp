# Build log — snackbar (optimistic save)

## What the tools told me

**`read_design_md`** (`.claude/pregate-2026-08-02/arena/DESIGN.md`) — the arena project brief:
- Dark-first editorial: `--color-bg #050505`, `--color-bg-elev #141414`, `--color-bg-card #1c1c1c`, `--color-fg #fff`, `--color-fg-muted #b8b8b8`, `--color-fg-dim #828282`, hairline `--color-line #363636` / `--color-line-strong #545454`, single warm accent `--color-accent #ed4609`.
- Type scale: label 13 / body 16 / lead 20 / h3 27 / h2 56 / h1 96.
- Space scale: xs 4, sm 8, md 16, lg 24, xl 32, xxl 48.
- Motion: durations fast 120ms / base 200ms / slow 400ms; easings `out-quart`, `out-expo`, and a site-signature bezier.
- Explicit component rule: every animation must honor `prefers-reduced-motion` (clamp to 0.001ms); one accent hue only, everything decorative stays monochrome; buttons are semantic classes with hover/focus-visible/active/disabled states; no bare hex/px/font literals — tokens only.

**`get_taste_profile("andrew")`** — grep'd the 1,616-line profile for the relevant clauses (full profile too large to load inline; searched for toast/motion/color/spacing/card rules):
- `COLOR-no-gradient-no-glow` — no gradients, no glow/neon, no second hue.
- `LAYOUT-no-card-soup` — no drop-shadowed rounded-card grids; editorial hairline-ruled primitives instead.
- `MOTION-prefers-reduced-motion` — non-negotiable clamp override.
- `MOTION-reveals-structure` — motion must reveal state/structure, never decorate for its own sake.
- Status-pill/badge rule — no glow pills or decorative badges; non-signal controls stay monochrome.
- `SPACING-tap-targets-44px` and `SPACING-generous-negative-space`.
- `TOKEN-no-bare-literals` / `TOKEN-semantic-names` / `TOKEN-semantic-button-classes`.
- Accent is punctuation, reserved for interactive elements — never a fill.

## Choices made

- **Placement & shape**: single-line snackbar, bottom-center, fixed region, hairline border on `--color-bg-card` — no shadow, no rounded card-soup, no glow. Reads as one flat editorial strip, consistent with `LAYOUT-no-card-soup` even though that rule targets grids (a lone toast isn't a grid, but the same restraint applies).
- **Accent usage**: `--color-accent` appears in exactly two places — the small monochrome-adjacent status dot and the **Undo** label/focus ring. It is the only interactive/actionable element in the strip, matching "accent as punctuation on interactive elements only." The dismiss (×) icon and message text stay monochrome (`fg` / `fg-dim`) since they're non-signal controls.
- **Auto-dismiss + explicit dismiss**: 5s auto-dismiss with a 1px hairline timer bar (`--color-line-strong`) as the sole visual indicator of remaining time — this is structural feedback (how long Undo is still valid), not decoration, satisfying `MOTION-reveals-structure`. An explicit × button (44×44px tap target) dismisses immediately. Hover/focus pauses the timer (standard toast a11y pattern) and resumes on blur/mouseleave.
- **Undo**: reverts the optimistic write, swaps the message to "Change undone," holds briefly (1.4s, no timer bar since there's nothing left to undo), then closes. Undo target is 44×44px.
- **Motion**: opacity + translateY(12px→0) fade/rise on entry using `--motion-duration-base` / `out-quart`; a faster `--motion-duration-fast` exit. Everything is wrapped in a single `@media (prefers-reduced-motion: reduce)` rule that clamps all listed transitions to `0.001ms`, per DESIGN.md wording exactly.
- **Tokens**: every color, space, radius-adjacent value (border-radius only used for the 6px status dot, not a card shape), duration, and easing in the component CSS is a `var(--token, fallback)` — no bare literals in component rules (page-scaffold rules for the demo harness follow the same discipline).
- **Buttons**: semantic `.btn`, `.btn--primary`, `.btn--ghost` classes with hover/focus-visible/active/disabled states, `.snackbar__undo` and `.snackbar__dismiss` are dedicated semantic classes with their own hover/focus-visible/active states (not raw `<button>` styling).
- **Demo harness**: one "Save change" button mutates a fake document title synchronously (the optimistic write) before the snackbar opens, so the "optimistic" claim is actually exercised — the value changes instantly, independent of the snackbar's own entrance animation.

## `audit_taste` result

Ran against `profile: "andrew"`, `surface: "component-demo"`, passing the full built HTML.

- First pass accidentally sent a placeholder string instead of file contents — caught it (finding `TOKEN-no-bare-literals: no CSS custom properties detected`) and re-ran with the real markup.
- Second pass, full HTML:
  - **`findings`: none.**
  - **`verdict: PASS` — "Verdict: PASS (no findings)."**
  - `skipped_out_of_scope`: `COLOR-one-warm-orange-accent` (scoped to `portfolio-monochrome`, not this surface).
  - Everything else fell into `not_assessed` (judgment-only clauses with no deterministic detector — card-soup, accent-as-punctuation, reduced-motion compliance, semantic tokens, etc.) — the engine is honest that these need an eyes-on/LLM pass rather than silently passing them.

Eyes-on cross-check against the `not_assessed` list: no gradients/glow anywhere in the CSS (`grep -i gradient|glow` → none), accent used only on the status dot and Undo, `prefers-reduced-motion` block present and covers every transitioning selector, tap targets on Undo/Dismiss are 44×44px, no bare hex/px in component rules (verified by eye — every value in `.snackbar*`/`.btn*`/`.demo-card*` rules is a `var(--...)`).

## Deviations / notes

- No literal `.mcpb`/font files available in this sandbox, so `--font-display`/`--font-body` fall back to system sans stacks after the `"Untitled Sans"` token name — consistent with DESIGN.md's instruction to reference fonts by token, but the actual licensed woff2 isn't embeddable here.
- Domaine Display (authorial serif) is intentionally unused — DESIGN.md restricts it to authorial voice only, never titles/CTAs/UI, and a snackbar has none of those.
