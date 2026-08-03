# Build log — Snackbar (optimistic save)

## Choices the prompt asked me to report

- **Enter easing:** `motion.easing.out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`), duration `motion.duration.base` (200ms). Chosen over `out-expo`/`site` because the enter is a short, small-distance (8px) settle — out-quart's gentler deceleration reads as a quiet arrival rather than an emphatic one, which fits "restraint over persuasion" for a low-stakes confirmation toast.
- **Exit easing:** also `motion.easing.out-quart`, duration `motion.duration.fast` (120ms), opacity-only (no transform on exit — spec only lists opacity 1→0 for exit, so no translate was added). Kept the same easing family as enter for visual consistency between the two transitions of one component.
- Both transitions are implemented as CSS `@keyframes` + `animation` (not `transition`) so enter/exit can be triggered by a `data-phase` attribute swap without fighting a single `transition` declaration across two different property sets.

## Gaps I resolved

1. **No taste/decision-graph binding for "arena"** — prompt explicitly says "do not consult any other design source," so I did not call `get_taste_interview` / `bind_taste_surface` / decision-graph tools. Built from DESIGN.md tokens + the prompt's own Structure/States/Motion/Content sections only.
2. **Archetype `toast` (node `snackbar-root`) has no component in the system** — created `.snackbar` (region wrapper `.snackbar-region` + inner `.snackbar`) as the new component. Named per the prompt's own vocabulary ("snackbar-root").
3. **Archetype `text` (node `message`) has no component** — used a plain `.snackbar__message` element (not a reusable `<text>` component elsewhere in this fixture) since it's a single-purpose label inside the one new component.
4. **Button missing `loading` state / `secondary` variant** — neither is used by this component (the snackbar has no async in-place buttons; Undo triggers an immediate local revert, and the primary "Save change" demo button doesn't need a loading spinner state per the given States section, which has undo exit immediately rather than showing a spinner). Not added since nothing in this component's state machine calls for them; noted here as an unaddressed system gap rather than silently invented.

## What I could not fully satisfy / verify

- **A5 (Playwright assertion)** — no test harness/runner is wired into this static deliverable; the JS state machine is manually testable via the demo button (click Save change → snackbar appears; click Undo → reverts immediately; click dismiss (×) → hides; wait 5s → auto-hides). No automated Playwright script is included since the deliverable is a single self-contained HTML file with no test runner scaffolding.
- **Fonts** — DESIGN.md names Untitled Sans / Domaine Display SemiBold / Geist as licensed files, but none are embeddable here (no font files supplied, no external requests allowed). `--font-display`/`--font-body`/`--font-mono`/`--font-serif` are defined as tokens with system-font fallbacks; no italic, no faux-bold/italic is used anywhere, and `--font-serif` is not used at all in this component (correct per `TYPE-serif-authorial-only` — a toast is not an authorial context).
- **role/live-region (A6)**: the snackbar region carries `aria-live="polite"` + `aria-atomic="true"`; the snackbar itself has `role="status"`. The node is only added to the DOM while visible/undoing and fully removed (not CSS-hidden) when hidden, per `OTHER-dynamic-dom-not-css-hide`.
- **Tap targets**: Undo and the dismiss (×) button are both set to `min-height/min-width: 44px` to satisfy `SPACING-tap-targets-44px`.
- Only one accent (`--color-accent`) is used, and only on the Undo action text — a functional/interactive signal, not decorative fill, per `COLOR-control-signal-only` / `COLOR-accent-punctuation-not-fill`.
