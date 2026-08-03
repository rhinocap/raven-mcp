# build-12 — optimistic-save snackbar

Single self-contained file: `index.html` (no external requests, all CSS/JS inline).

## Grounding (called, not assumed)

- `read_design_md` on `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena/DESIGN.md` — every token below is the literal value it returned (`--color-*`, `--type-*`, `--space-*`, `--motion-*`).
- `get_taste_profile("andrew")` — 37 rules; the ones that actually shaped this build: `TOKEN-no-bare-literals`, `LAYOUT-no-card-soup`, `COLOR-accent-punctuation-not-fill`, `COLOR-control-signal-only`, `OTHER-no-shadcn-defaults`, `OTHER-dynamic-dom-not-css-hide`, `SPACING-tap-targets-44px`, `MOTION-prefers-reduced-motion`, `MOTION-reveals-structure`, `ASSET-icon-stroke-current-color`, `ASSET-icon-sizes-consistent`, `VOICE-editorial-restraint`.
- The profile carries a saved `arena` binding (surface: *monochrome portfolio component surface — transient UI components (toasts, inline affordances, buttons)*) with `design_notes` and a `voice_note`. Those notes were treated as acceptance criteria, not mood words.

## The component

State machine — `idle → entering → visible ⇄ paused → leaving → idle`:

| Transition | Trigger |
| --- | --- |
| `idle → entering/visible` | "Save change" — the value flips **before** the snackbar appears (optimistic) |
| `visible → paused` | pointer enters the snackbar, or keyboard focus lands inside it |
| `paused → visible` | pointer leaves **and** focus is outside |
| `visible → leaving` | countdown reaches 0 (auto-dismiss, 6000ms) |
| `any → leaving` | close control, or `Escape` |
| Undo | reverts the value, replaces the snackbar with a plain "Reverted to X." confirmation on the shorter 3200ms timeout, no Undo affordance |
| repeat save | replaces the live snackbar; never stacks |

Anatomy: message · hairline · **Undo** · hairline · close (16px `stroke="currentColor"` ✕). A 2px `--line-strong` rule along the bottom edge depletes left→right as the remaining time; it goes dim (`--line`) while paused, so "your countdown is held" is visible, not just felt.

## Choices worth reporting

1. **The accent is used exactly once** — the Undo label (`--color-accent` on `--color-bg-elev` = 4.8:1, AA at 16px). The countdown rule, the close control, and the focus rings are all monochrome, so the one warm hue stays punctuation and the only colored control is the one that carries signal (`COLOR-control-signal-only`).
2. **Anchored to the content column, not the viewport corner.** The snackbar region is the same `min(--page-max, 100% − 2×--space-xl)` frame as the page, left-aligned — it reads as belonging to the document rather than floating free (`LAYOUT-no-bare-modals`: "no floating buttons without context").
3. **Square corners, hairline border, one flat elevation step** (`--bg-elev` on `--bg`). No radius, no shadow, no pill, no badge — this is a ruled bar, not a card (`LAYOUT-no-card-soup`, `OTHER-no-shadcn-defaults`).
4. **Created and removed from the DOM**, never CSS-hidden (`OTHER-dynamic-dom-not-css-hide`). The exit transition runs on the live node; the node is removed after it, and immediately (0ms) under reduced motion.
5. **Timing lives in CSS tokens** (`--snackbar-timeout: 6000ms`, `--snackbar-timeout-short: 3200ms`) and the script reads them off `:root` — one source of truth, no magic number in JS.
6. **Motion is structural**: 8px rise + fade on `--motion-duration-base` / `--motion-easing-out-expo`, plus the depleting rule which is information, not decoration. Global `prefers-reduced-motion` clamp to 0.001ms.
7. **Copy is deadpan and unexclaimed** per the binding's `voice_note` — "Visibility set to Public." / "Reverted to Private." / "Undo" / "Dismiss notice". No exclamation, no "Success", no persuasion words.
8. **Accessibility**: a visually-hidden `role="status" aria-live="polite"` region announces each message (the snackbar itself is not the live region, so its buttons aren't re-announced on every change); focus is never stolen, but if focus was *inside* the snackbar when it left, it returns to the Save button; `Escape` dismisses; every control is ≥44×44 (measured: Undo 91×76, close 44×76, Save 149×44).

## Gaps I had to resolve

- **DESIGN.md type tokens are unitless numbers** (`body: 16`). Declared them as px custom properties (`--type-body: 16px`) so they are directly usable in `font-size`; values unchanged.
- **DESIGN.md names four font families but ships no files.** Declared `--font-display/-body/-mono/-serif` as tokens with system fallback stacks; no webfont is fetched (self-contained constraint). `--font-serif` is declared for completeness and deliberately unused — Domaine is authorial voice only, and nothing here is authorial (`TYPE-serif-authorial-only`). No italics anywhere.
- **No radius / border-width / z-index / control-size tokens exist in DESIGN.md.** Rather than write bare literals in component CSS (`TOKEN-no-bare-literals`), I added semantically-named component tokens to `:root` — `--rule-hairline`, `--rule-strong`, `--radius-square`, `--control-min`, `--icon-size`, `--page-max`, `--snackbar-max`, `--snackbar-enter-offset`, `--z-snackbar`, `--focus-ring` — and every component rule reads `var(--token, fallback)`.
- **The harness needs a subject to save.** Chose a "Project visibility — Private/Public" row because an optimistic save needs a visible value that changes *before* confirmation; the value dims for 600ms while the simulated request settles, so "optimistic" is legible rather than asserted.
- **One line beyond the requested single button**: a mono `state / remaining` readout. It adds no control, and without it the paused/visible distinction is only inferable from the depleting rule. Called out here in case the fixture wants it removed.

## Could not satisfy

- Untitled Sans / Geist / Domaine cannot render — no licensed font files may be embedded in a no-external-request fixture, so the browser falls back to the system grotesk. Weight mapping (400/500/700) is honored; nothing faux is requested.
- `audit_taste` in `html` mode cannot measure rendered traits: 29 of 37 rules came back `not_assessed` and two `design_notes` (typography scale, text density) came back `unverifiable`. Those were verified by hand and by the Playwright pass below instead of being claimed from the audit.

## Verification

`verify.mjs` (Playwright, in this directory) — 24 assertions against the real rendered page, **all pass**:

```
PASS initial idle, no snackbar
PASS value flipped optimistically :: Public
PASS snackbar present / confirmation copy / undo action present / state visible
PASS tap targets >= 44x44 :: [["btn btn--primary",149,44],["snackbar__action",91,76],["snackbar__dismiss",44,76]]
PASS hover pauses countdown :: paused 5.1s -> 5.1s
PASS unhover resumes countdown :: 5.1s -> 4.7s
PASS focus pauses countdown
PASS undo reverts value :: Private / revert copy / revert snackbar has no undo / only one snackbar in dom
PASS explicit dismiss removes node from DOM / state back to idle
PASS escape dismisses
PASS focus returns to trigger
PASS auto-dismiss near 6s :: 6208ms
PASS repeat save does not stack
PASS reduced motion: snackbar immediately opaque
PASS mobile: snackbar within viewport / no horizontal scroll
PASS no console errors
```

Eyes-on: `shot-desktop.png` (1280×900), `shot-mobile.png` (390×844, reduced motion), `shot-crop.png` (component detail).

## Audit result

`audit_taste({ profile: "andrew", project: "arena", surface: "monochrome portfolio component surface…", html })`

- **Verdict: PASS — "no findings"**
- `findings: []`, `fidelity_findings: []`, `suppressed: []`, `skipped_out_of_scope: []`
- Binding resolved: `arena`
- `note_assessments`: `color` → **present** (`scheme=dark, bg_luminance=0.02`). All seven other notes → `unverifiable` in static-HTML mode (`typography` and `spacing` explicitly say "render the url for a live check"; `layout`, `motion`, `aesthetic`, `libraries`, `special` have no deterministic verifier).
- `not_assessed`: 29 rules with no deterministic detector in html mode — including `MOTION-prefers-reduced-motion`, `OTHER-hover-state-required`, `ASSET-icon-*`, `TOKEN-semantic-*`, `LAYOUT-*`, `COLOR-accent-punctuation-not-fill`. **The PASS is therefore a clean run of the detectors that fired (gradient/glow, second-hue, banned-word, bare-literal), not a full-rule clearance.** Those 29 were checked by hand against the rule text and by the Playwright pass above.
