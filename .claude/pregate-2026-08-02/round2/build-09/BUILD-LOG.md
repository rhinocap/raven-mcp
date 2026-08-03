# Build log — Snackbar (optimistic save)

Source spec: `composed-prompt-fair.md`. Tokens/brief: `arena/DESIGN.md`. No other design source consulted.

## Reported choices (spec asked for a pick + report)

- **Enter easing:** `motion.easing.out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`) at `motion.duration.base` (200ms), animating `transform` (translateY 8px→0) + `opacity` 0→1. Chosen for a slightly more energetic settle on arrival, matching the "just landed" feel of a save confirmation.
- **Exit easing:** `motion.easing.out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`) at `motion.duration.fast` (120ms), animating `opacity` 1→0 only (no transform on exit, per state description "snackbar exits immediately" — a lingering positional animation on exit would fight that immediacy).
- **`prefers-reduced-motion`:** both enter and exit collapse to opacity-only at `motion.duration.fast` (120ms) with a linear easing — transform is fully removed, not just shortened.

## Gaps resolved (from the "Gaps / decisions for you" section)

1. **No taste-surface binding for "arena"** — proceeded on tokens + prohibitions only, no design_notes/voice_note available; did not call the taste interview per instruction to consult only this prompt and DESIGN.md.
2. **No `<toast>` component in the system** — created `.snackbar` (root) + `.snackbar-region` (fixed live-region wrapper). Named here for future registration.
3. **No `<text>` component in the system** — used a plain `.snackbar__message` paragraph; no dedicated text component existed to alias.
4. **Button missing `loading` state** — not applicable to this component (no button in the snackbar ever enters a loading state); no substitute needed.
5. **Button missing `secondary` variant** — the two snackbar actions don't map to primary/ghost either, so two new button modifiers were added instead of misusing an existing variant: `.btn--text` (the inline Undo — text-weight, underlined in `--accent` as a functional-not-decorative signal, not text-color-in-accent because that combination fails 4.5:1 contrast against `--bg-card`) and `.btn--icon` (the icon-only dismiss, 44×44 hit area with a 16px currentColor stroke glyph). Both still ride the shared `.btn` state stack (hover/focus-visible/active).

## Other decisions

- **Contrast fix:** `--accent` (#ed4609) as a text color on `--bg-card` (#1c1c1c) computes to ~4.17:1 — below AA 4.5:1 for 16px body text. Kept Undo's label in `--fg` (white, ~19:1) and moved the accent to a thin underline only, which also satisfies `COLOR-accent-punctuation-not-fill` (punctuation, not fill).
- **Live region / a11y (A6):** `.snackbar-region` carries `role="status" aria-live="polite"` and stays permanently in the DOM (empty) so assistive tech has a stable region to observe; the `.snackbar` node itself carries `role="alert"` and is only inserted into the DOM in the `visible`/`undoing` states and removed entirely on `hidden` — per `OTHER-dynamic-dom-not-css-hide`, no `display:none`/opacity-hiding is used to represent the hidden state.
- **State machine:** implemented literally per the States section — `hidden` (no node) → `visible` (node inserted, 5000ms auto-dismiss timer armed) → `hidden` on timeout or explicit dismiss; `visible` → `undoing` on Undo press, which immediately starts the fast exit transition (no lingering visible period) and settles to `hidden` once the transition completes (standing in for "revert-complete").
- **Demo harness:** a single "Save change" primary button simulates the optimistic commit by calling the same `enter()` the real save flow would call — clicking it again while a snackbar is showing replaces the outgoing instance and restarts the cycle, so the full state machine (hidden→visible→hidden, hidden→visible→undoing→hidden) can be exercised by hand from one control.
- **Motion/positioning literal:** the only px value in component CSS is a `translateY(8px)` enter offset — a component-dimension transform, not a layout literal, so it does not trip `TOKEN-no-bare-literals` / `LAYOUT-proportional-frames`.
- **Icons:** dismiss glyph is inline SVG, `stroke="currentColor"`, sized 16px (within the 14/16/20 allowed set).
- **Fonts:** `--font-body` maps to Untitled Sans per the brief with system-font fallbacks (no Untitled Sans file was bundled/available to embed as a real webfont in this fixture, so the fallback chain carries the declared token instead of a faux substitution).

## Could not fully satisfy / left agent-asserted

- **A5 (Playwright assertion)** and **A2/A3/A4/A7 (tool-run audits)** were not executed in this session — no test runner or Raven tool call was invoked as part of this build; the component was built to satisfy them structurally (44px targets, no bare literals, contrast-corrected text, live region, DOM-absent hidden state) but the actual tool passes are unverified from this build step.
- Motion duration/easing (A5's "Duration and easing remain UNVERIFIED until a motion sampler exists") is implemented as specified but likewise has no automated sampler in this deliverable — verification is visual/manual only.
