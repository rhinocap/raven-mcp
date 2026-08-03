# Build log — snackbar (optimistic save), arm-b

## Tools consulted

**`read_design_md`** (arena/DESIGN.md) returned the full token index:
- Colors: bg `#050505`, bg-elev `#141414`, bg-card `#1c1c1c`, fg `#ffffff`, fg-muted `#b8b8b8`, fg-dim `#828282`, line `#363636`, line-strong `#545454`, accent `#ed4609` (one warm accent).
- Type scale 13/16/20/27/56/96; space 4/8/16/24/32/48; motion 120/200/400ms with out-quart, out-expo, and site easings.
- Brief: dark-first editorial, hairline rules, one warm accent, generous negative space, restraint over persuasion. Untitled Sans body, Geist mono, serif is authorial-voice only. Every visual value `var(--token, fallback)`; semantic button classes; hover states on every interactive element; `prefers-reduced-motion` honored; everything decorative monochrome.

**`get_taste_profile` ("andrew")** — 37-rule catalog. The rules that shaped this component: `COLOR-accent-punctuation-not-fill`, `COLOR-no-gradient-no-glow`, `TOKEN-no-bare-literals`, `TOKEN-semantic-button-classes`, `OTHER-hover-state-required`, `SPACING-tap-targets-44px`, `MOTION-prefers-reduced-motion`, `OTHER-dynamic-dom-not-css-hide`, `ASSET-icon-stroke-current-color`, `TYPE-serif-authorial-only`, `VOICE-editorial-restraint`, `LAYOUT-no-bare-modals`.

## Choices

- **Accent as punctuation, not fill:** the Undo action is accent-colored *text* on the elevated surface — the only accent on the page. The confirmation surface itself is monochrome (`bg-elev` + 1px `line` hairline border). No gradient, no glow, no drop shadow — elevation is carried by the hairline and the lighter surface, which fits the ink-on-paper brief.
- **Placement:** fixed bottom-left with `--space-xl` margins — editorial rather than the centered-toast default (`OTHER-no-shadcn-defaults`).
- **Behavior:** optimistic — the setting value flips immediately on Save; the snackbar confirms with inline **Undo** (reverts to the captured previous value), an explicit **dismiss** (X, `currentColor` stroke icon), and an 8s auto-dismiss. The timer pauses on hover and on keyboard focus within the bar and resumes with remaining time, so Undo can't vanish under the user's cursor. A new save replaces the current snackbar rather than stacking.
- **A11y:** persistent `role="status" aria-live="polite"` region (the live region exists before content is injected, so announcements fire reliably); both actions are real `<button>`s with `min-height/min-width: 44px`; dismiss has an `aria-label`; visible `:focus-visible` outline; `prefers-reduced-motion` disables transitions in CSS *and* skips the JS exit animation.
- **Dynamic DOM, not CSS hide:** the snackbar is created on save and removed from the DOM after the exit transition (with a timeout fallback in case `transitionend` never fires), per `OTHER-dynamic-dom-not-css-hide`.
- **Tokens:** all DESIGN.md values defined as `:root` custom properties; every component declaration is `var(--token, fallback)` — no bare hex/px in component CSS. Buttons are semantic classes (`.btn`, `.btn-primary`, `.btn-undo`, `.btn-dismiss`) with hover, active, focus-visible, and disabled styling.
- **Fonts:** `--font-body` names Untitled Sans with a Helvetica fallback stack (licensed woff2 files are not available in this fixture to inline); no italics, weights limited to 400/500/700; no serif anywhere (nothing authorial on this surface).
- **Demo harness:** one hairline-bounded setting row ("Project visibility" Private/Public) plus a single "Save change" primary button, so save → undo produces a visibly verifiable state change. Copy is plain and concrete, no persuasion.

## audit_taste result

`audit_taste` (profile "andrew", surface "component-demo", html mode): **Verdict: PASS — no findings, none suppressed.** All deterministic detectors clean (no gradients, no glow shadows, no second accent hue, no banned words, no bare literals). 29 judgment-only rules reported honestly as `not_assessed` (no deterministic detector); each of the applicable ones was addressed by construction as listed above. `COLOR-one-warm-orange-accent` was skipped as out-of-scope for this surface (portfolio-monochrome scope) — the build honors it anyway with `#ed4609` as the sole accent.

## Deviations

- Untitled Sans/Geist are referenced by token with system fallbacks rather than embedded, since the font files are not present in the fixture directory and the artifact must make no external requests.
