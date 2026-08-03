# Build log — snackbar (optimistic save)

Source spec: `composed-prompt-fair.md`. Tokens sourced from `arena/DESIGN.md` only, per instruction not to consult any other design source.

## 1. Motion — easing choices (spec asked me to report these)
- **Enter** (`snackbar-root`, transform + opacity 0→1, `--motion-duration-base` / 200ms): picked `motion.easing.out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`). It gives the entrance a decisive arrival rather than a soft float, which reads better for a confirmation that just landed.
- **Exit** (`snackbar-root`, opacity 1→0, `--motion-duration-fast` / 120ms): picked `motion.easing.out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`). A gentler curve for the shorter, quieter dismissal beat (auto-timeout, explicit dismiss, or undo-triggered exit) so it doesn't compete with the enter motion.
- `prefers-reduced-motion: reduce` collapses both to opacity-only with a 0.01ms animation duration (the near-zero value the prohibition `MOTION-prefers-reduced-motion` explicitly calls for); JS uses a 20ms safety window before removing the node so the shortened animation has time to apply.

## 2. Naming gaps (spec flagged, asked me to name or create)
- Gap #3 — archetype `toast` (node `snackbar-root`) matched nothing in the system: named it `.snackbar` / `data-component="snackbar"`.
- Gap #4 — archetype `text` (node `message`) matched nothing in the system: named it `.snackbar__message` / `data-component="snackbar-message"`.
- Neither existed before, so nothing was overwritten; both are net-new component names, semantic rather than descriptive, per `TOKEN-semantic-names`.

## 3. Button-system gaps (spec flagged, asked me to state substitutes)
- Gap #6 — the design system's `button` component is missing a registered `secondary` variant. Substitute: the existing `ghost` variant is used for both the Undo and Dismiss actions inside the snackbar (`.btn--ghost`). It reads as the quiet/secondary action against the elevated snackbar surface without inventing an unregistered variant name.
- Gap #5 — the `button` component is missing a registered `loading` state. The demo harness's "Save change" trigger does not need a real loading state for this spec (the state machine starts at `save-committed`, i.e. after the save already resolved), so no substitute was exercised in the interactive demo. I did wire the CSS hook (`.btn[data-loading="true"]`, built on the existing `disabled` state + opacity reduction) so a future caller has a substitute ready, and documented it as a substitute rather than a new registered state.

## 4. Gaps / decisions resolved by judgment
- Gap #1/#2 (no taste-surface binding for project "arena"; decision graph resolved outside the project dir): proceeded on the DESIGN.md tokens and the composed prompt's explicit structure/states/motion/content sections only, per the task instruction not to consult any other design source.
- **Dismiss affordance content**: the spec's Content section only specifies copy for the confirmation message and the Undo label, not the dismiss control. Used an icon-only close (16px stroke, `stroke="currentColor"`, one of the three permitted icon sizes) with `aria-label="Dismiss"` rather than inventing dismiss copy that wasn't in the brief.
- **No radius token exists** in the "Tokens to use" list. Rather than invent an unlisted `--radius-*` token, the snackbar and buttons ship with square corners (`border-radius: 0`), consistent with the brief's hairline-ruled editorial layout language and `LAYOUT-no-card-soup`.
- **Density mapping followed literally**: the Structure section maps both the snackbar root and the message text to `emphasis 2 → type.h3` (27px) and `density compact → space.sm` (8px padding). This produces a large-type, tight-padding toast. I followed the explicit mapping rather than substituting a smaller display size, since the brief stated it directly rather than leaving it a gap.
- **Live region**: used `role="status"` + `aria-live="polite"` + `aria-atomic="true"` on the snackbar root (not specified verbatim in Structure, but required to satisfy "semantic roles and live regions" under acceptance criterion A6, since the archetype had no existing component to inherit ARIA behavior from).
- **Hidden state**: implemented as full DOM removal (`region.innerHTML = ''`), not CSS hiding, per `OTHER-dynamic-dom-not-css-hide` and the Structure note "not rendered in the tree; no reserved space."
- **Undo-pressed exit timing**: "snackbar exits immediately" was read as "no delay before starting the exit animation," not "skip the exit animation" — the undo path still plays the same 120ms/out-quart exit as timeout/dismiss, then calls the revert and returns to `hidden`.
- **Tap targets**: both snackbar buttons get `min-height`/`min-width: 44px` (literal px, permitted under `LAYOUT-proportional-frames`'s "reserving px for component-dimension sizing" exception and required directly by `SPACING-tap-targets-44px`).

## 5. What I could not satisfy
- Acceptance criteria A1–A4 and A7 (`review_diff`, `talon_scan`, `audit_tap_targets`, `audit_contrast`, `audit_taste`) require running Raven tooling against a live/rendered snapshot — not run as part of this build task, since the task only asked me to produce the two files, not to execute the audit tools. The HTML is written to be clean against them (token-only values, hover + focus-visible states, 44px targets, live region, reduced-motion collapse) but that is unverified by tooling in this pass.
- A5 (Playwright assertion for state transitions) is agent-asserted only, per the spec's own framing — no test file was requested as a deliverable, so none was written; the interactive demo lets the full `hidden → visible → {hidden | undoing → hidden}` machine be exercised by hand (Save change → Undo/Dismiss/wait 5s).
