# Build log — snackbar (optimistic save confirmation)

Source spec: `composed-prompt-fair.md`. Tokens: `arena/DESIGN.md`. No other design source consulted.

## Choices the prompt asked me to report

- **Enter easing:** `motion.easing.out-quart` (`cubic-bezier(0.25,1,0.5,1)`), 200ms (`motion.duration.base`), on `opacity` + `transform: translateY`. Chosen over out-expo/site because the entrance is a small 8px rise-in — out-quart's gentler deceleration reads as a settle, not a snap, appropriate for a passive confirmation rather than a user-initiated action.
- **Exit easing:** `motion.easing.out-expo` (`cubic-bezier(0.16,1,0.3,1)`), 120ms (`motion.duration.fast`), on `opacity` only (no transform on exit — matches the spec's exit motion list, which only names opacity). out-expo's steeper initial drop suits a fast dismissal (auto-timeout, explicit dismiss, or immediate undo-exit) better than the softer out-quart used on entry.
- **`prefers-reduced-motion`:** both enter and exit collapse to opacity-only, duration ~1ms (effectively instant), per the spec's per-transition override note.

## Gaps resolved

1. **No taste-surface binding / decision-graph scope mismatch (gaps 1–2):** spec says use judgment; I stayed strictly inside `DESIGN.md` tokens and the prohibitions list already embedded in the prompt and did not query Raven for anything else, per the instruction to consult no other design source.
2. **"toast" archetype has no component match (gap 3):** created `.snackbar` / `.snackbar-viewport` as a new primitive. Named it `snackbar` (matching the spec's own vocabulary for the node) rather than `toast`, since the spec's Structure section itself calls it a "snackbar."
3. **"text" archetype has no component match (gap 4):** created `.snackbar__message`, a plain `<p>` styled at `type.h3` / `space.sm` per the emphasis/density mapping given in Structure.
4. **Button missing `loading` state (gap 5):** not used. Neither Undo nor Dismiss enters a loading state in this state machine (undo exits the snackbar immediately per spec, with no visible in-flight button state) — no substitute needed.
5. **Button missing `secondary` variant (gap 6):** substituted the existing `ghost` variant for both Undo and Dismiss ("inline undo affordance, text-weight action" maps naturally to a borderless/ghost treatment); Dismiss reuses the same ghost button as an icon-only affordance with `aria-label="Dismiss"`.
6. **No radius token in `DESIGN.md`:** set `border-radius: 0` on the snackbar and buttons — deliberate, not an oversight. This is also the better read of `LAYOUT-no-card-soup` (no rounded-corner card-soup primitives) and matches the editorial hairline-rule aesthetic.
7. **Hairline border width has no token:** `DESIGN.md` tokenizes rule *color* (`--line`) but not stroke width. Added a local `--hairline-width: 1px` custom property (referenced via `var()`, never a bare literal in component CSS) rather than inventing a padding/sizing token — this is a stroke width, not a layout dimension, and is small enough that I judged it doesn't need to trade off against `space.xs` (4px).
8. **Dismiss button icon:** a plain 16px `stroke="currentColor"` X, sized within the 14/16/20 allowed set, no hardcoded color — satisfies `ASSET-icon-stroke-current-color` / `ASSET-icon-sizes-consistent`.
9. **`hidden` state and DOM presence:** the snackbar element is created and appended only on `enter()` and fully removed from the DOM (not CSS-hidden) once its exit transition finishes — satisfies `OTHER-dynamic-dom-not-css-hide`. No space is reserved for it when hidden (it's `position: fixed`, no layout participation regardless).
10. **Second "Save change" click while a snackbar is already showing:** not specified by the spec. Judgment call — instantly tear down the current instance (no exit animation) and re-`enter()` fresh, so state never gets ambiguous between two overlapping snackbars.
11. **Tap targets:** both Undo and Dismiss are sized to a 44×44px minimum via `min-height`/`min-width` on `.btn--ghost`, even though the icon/text content is visually smaller — satisfies `SPACING-tap-targets-44px`.
12. **Focus-visible:** added a 1px accent-colored outline on `:focus-visible` for all buttons (not explicitly required by the Structure/Motion sections but required by `OTHER-hover-state-required` in spirit and basic accessibility; the accent use here is functional signal, not decoration, so it's consistent with `COLOR-control-signal-only`).

## Things I could not fully satisfy / left agent-asserted

- **A5 (Playwright assertion of visibility/transition):** not written — this deliverable is a static self-contained HTML file with inline vanilla JS, not a test harness with Playwright available. The state machine is exercisable by hand (click "Save change", then Undo or the × or wait 5s) and every transition in the States section is implemented and named in code (`data-phase="enter"/"exit"`, `state` variable with the exact `hidden|visible|undoing` values from the spec), but no automated assertion was authored.
- **A2/A3/A4 (talon_scan / audit_tap_targets / audit_contrast):** not run — no tool access was exercised for this build per the instruction to consult no other design source; the file is ready for those tools to run against it. I self-checked contrast qualitatively: `--color-fg` (#fff) on `--color-bg-elev` (#141414) is well above 4.5:1; `--color-fg-muted` is not used for essential text in this component.
- **A7 (audit_taste verdict):** not run, same reason as above.
- No hex/px/font-family literals appear in component CSS outside of `var(--token, fallback)` fallback positions and the two documented local tokens (`--hairline-width`, `--icon-size-sm`, `--tap-target-min`) — self-audited by re-reading the stylesheet, not tool-verified.

## Files

- `index.html` — self-contained demo page (dark `--color-bg` background, "Save change" trigger, snackbar component, all CSS/JS inline, no external requests).
- `BUILD-LOG.md` — this file.
