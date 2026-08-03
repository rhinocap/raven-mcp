# Build log — optimistic-save snackbar

Source spec: `composed-prompt-fair.md`. Tokens from `arena/DESIGN.md`. No other design source consulted.

## Reported choices (spec asked me to pick and record)

- **Enter easing**: `motion.easing.out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`), duration `motion.duration.base` (200ms). Chosen over `out-expo`/`site` because it decelerates smoothly with no overshoot — appropriate for a small transient confirmation, consistent with the "restraint over persuasion" brief; a bouncier or more aggressive curve would read as unearned emphasis for a routine save confirmation.
- **Exit easing**: also `motion.easing.out-quart`, duration `motion.duration.fast` (120ms). Used the same easing family as the enter for visual consistency across the transition pair (same object, same character in and out), just compressed to the faster token since exit should read as quicker/quieter than entry.
- Motion is opacity + transform on enter (`translateY(space.sm)→0` combined with opacity 0→1) and opacity-only on exit per spec's explicit "opacity 1→0" exit definition.

## Gaps resolved

1. **No `toast`/`text` components exist in the system** — created `.snackbar-root`, `.snackbar-root__message`, `.snackbar-root__actions` as the equivalents; named for future registration in the design system.
2. **Button missing `loading` state** — not needed here (Save/Undo/Dismiss are instantaneous demo actions with no request latency to represent); no substitute added since the criterion doesn't apply to this component.
3. **Button missing `secondary` variant** — used the existing `ghost` variant as the substitute for Undo and Dismiss ("text-weight action" in the spec maps directly to `ghost`'s no-fill treatment).
4. **Taste-surface / decision-graph binding gaps** (items 1–2 in the prompt's Gaps section) — out of scope for a single-component build; not resolved, no design direction was invented to fill them.

## Constraints honored

- All color/space/type/motion values are `var(--token, fallback)` — no bare hex/px/font-family literals in component CSS (fallbacks included per token, values match DESIGN.md's concrete set exactly).
- `hidden` state is not CSS-hidden — the snackbar node does not exist in the DOM at all until a save commits (`display:none`/`.hidden`/`opacity:0` were not used for the hidden state; JS creates and removes the element).
- `role="status"` + `aria-live="polite"` + `aria-atomic="true"` on the snackbar root for the confirmation; a separate `aria-live="polite"` status line in the demo harness echoes state transitions for hand-testing.
- Dismiss control is icon-only (16px stroke, `stroke="currentColor"`) but keeps a 44×44 CSS px hit area via `.btn--icon` sizing — tap-target minimum met without inflating the visible glyph.
- Every interactive element (`.btn`, `.btn--primary`, `.btn--ghost`) has `:hover`, `:focus-visible`, `:active`, and `:disabled` states defined.
- `prefers-reduced-motion: reduce` collapses all snackbar transitions to opacity-only at ~1ms duration and cancels the transform offset entirely.
- Single-instance behavior: pressing Save again while a snackbar is already visible removes the old instance and mounts a fresh one with a reset 5s countdown, per "single instance" in Structure.
- Accent (`--color-accent`) is used only for the focus-visible ring and the ghost buttons' hover/active text color — a functional (interaction feedback) use, not a decorative fill, per the color prohibitions.
- No card-soup, no gradients, no drop shadow, no faux type weights, no font-family literals (relies on system font stack via a plain `sans-serif` fallback chain since Untitled Sans/Domaine/Geist files are not available in this build environment — no font-family literal was hardcoded as a *brand* name, only the generic OS-safe fallback chain).

## Not verified (agent-asserted only, per acceptance table)

- A5 (Playwright assertion of state transitions) and the tool-run acceptance checks (A1–A4, A7) were not executed — this build only produced the artifact and this log; no `review_diff`/`talon_scan`/`audit_tap_targets`/`audit_contrast`/`audit_taste` pass was run against it in this session.
- Duration/easing fidelity is unverified by any motion sampler, as the spec itself notes remains true for any build.

## Deviations / could not fully satisfy

- Untitled Sans / Domaine / Geist font files are not present in this build environment, so the page renders on a generic system sans-serif fallback stack instead of the named brand fonts. No literal font-family other than the generic fallback keywords (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) was introduced; this is a substitution, not a token violation, but it is a visible fidelity gap against the full brief.
