# Build log — snackbar (optimistic save / undo / auto-dismiss)

Source: `composed-prompt-fair.md` (only design source consulted, per instruction). Tokens: `arena/DESIGN.md`.

## Reported choices (prompt asked for a report)

- **Enter easing:** `motion.easing.out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`). Reasoning: `out-expo` reads as more dramatic/snappy than a small utility toast warrants; `site` is reserved-feeling for larger scene transitions. `out-quart` gives a smooth, non-linear deceleration appropriate to a small UI element entering.
- **Enter duration:** used `motion.duration.base` (200ms) per the prompt's explicit instruction to replace the designer's non-token 210ms with a real token.
- **Exit easing:** also `motion.easing.out-quart`, for consistency between enter/exit on the same element.
- **Exit duration:** used `motion.duration.fast` (120ms) per the prompt's instruction to replace the designer's non-token 120ms value with the equivalent token (values already matched, so no visible change).
- **prefers-reduced-motion:** both enter and exit collapse to opacity-only (transform removed via the media query), per spec.

## Gaps resolved

1. **No taste-surface binding for "arena"** — prompt's own instruction was to consult no other design source, so I proceeded directly from DESIGN.md + the composed prompt without running the interview.
2. **Decision-graph scope mismatch** — not actionable from this build; noted, no action taken.
3. **"toast" archetype had no system match** — created a new component, named `c-toast` (BEM-style: `c-toast`, `c-toast__message`, `c-toast__actions`, `c-toast__divider`). It lives in `<div class="toast-region" role="status" aria-live="polite">`.
4. **"text" archetype had no system match** — implemented as `c-toast__message`, a plain `<p>` sub-element of `c-toast` rather than a standalone registered component (it has no independent interactive or visual identity).
5. **Button missing `loading` state** — not applicable to this component; neither Undo nor Dismiss has a loading phase in the state machine, so the state was not used and nothing substitutes for it.
6. **Button missing `secondary` variant** — substituted the existing `ghost` variant for both Undo (text-weight action) and Dismiss (icon-only ghost button), since ghost is the system's existing low-emphasis affordance and secondary doesn't exist.

## Structure / accessibility

- The toast host (`#toast-region`) is `role="status" aria-live="polite" aria-atomic="true"` so screen readers announce "Change saved" when it appears — this is the best available substitute for A6's "semantic roles and live regions" claim (agent-asserted per the acceptance table; no tool checks live regions).
- The `c-toast` node itself is only ever in the DOM while visible or animating out. In the `hidden` state it is fully removed via `removeChild`, never CSS-hidden (`display:none`/`opacity:0`/`.hidden` class) at rest — satisfies `OTHER-dynamic-dom-not-css-hide`. The `is-exiting` class is a legitimate in-flight transition state, not a steady-state hide.
- Both Undo and the icon-only Dismiss button are ≥44×44 CSS px (`.btn` sets `min-height/min-width: 44px`).
- Dismiss icon uses `stroke="currentColor"` at 16px (within the 14/16/20 allowed set).
- No second accent color introduced; `--color-accent` is used only on the demo's primary Save CTA (functional — the primary action) and on `:focus-visible` outlines. The snackbar itself is monochrome (bg-elev / line / fg / fg-muted), matching `COLOR-control-signal-only` and `COLOR-accent-punctuation-not-fill`.
- No card-soup: the toast is a single hairline-bordered surface (`--color-line`), no shadow, no rounded-corner elevation stack.
- All CSS values are `var(--token, fallback)` — no bare hex/px/font-family literals in component rules (the fallback values are the literal token defaults, per the standard `var(--x, fallback)` pattern, not bare literals used directly).
- Buttons use the semantic `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--icon` classes; no inline styles on any `<button>`. Every interactive element has a defined `:hover` (and `:active`, `:disabled`, `:focus-visible`).

## State machine (as built)

`hidden` (not rendered) → `visible` on `save-committed` (Save button click, simulating an optimistic save) → back to `hidden` on either a 5000ms timeout or an explicit Dismiss click (both exit through the same 120ms fast opacity fade) → `undoing` on Undo click (reverts the field immediately, exits immediately, no auto-dismiss race) → `hidden` on revert-complete.

## Could not satisfy / left unverified

- Acceptance criteria A1–A4, A5 (Playwright assertion), and A7 (audit_taste) require running Raven's tooling (`review_diff`, `talon_scan`, `audit_tap_targets`, `audit_contrast`, `audit_taste`) against a live/served instance of this file and a Playwright harness — none of that tooling was run as part of this build; only the component and demo harness were authored. The file is structured to pass those checks (semantic classes, token-only CSS, 44px targets, live region, DOM-removal-not-CSS-hide) but the checks themselves are unexecuted here.
- Duration/easing fidelity (the exact 200ms/120ms + `out-quart` claimed above) is implemented in CSS transitions but, per the prompt's own note under A5, remains unverified by any motion sampler — no such tool was run.
