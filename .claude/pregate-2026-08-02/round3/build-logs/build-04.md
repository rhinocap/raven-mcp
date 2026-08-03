# build-04 — snackbar, optimistic save

One self-contained file: `index.html` (all CSS + JS inline, zero external requests, no fonts fetched).

## Grounding

- `read_design_md` on `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena/DESIGN.md` — every colour, type-scale, space and motion token in `:root` is the literal value from that frontmatter.
- `get_taste_profile("andrew")` — 39 rules + the `arena` surface binding (surface: "monochrome portfolio component surface — transient UI components (toasts, inline affordances, buttons)…"), whose `design_notes` were read as acceptance criteria, not mood words.

## Component

State machine, all of it exercisable by hand from the single **Save change** button:

| state | trigger | behaviour |
|---|---|---|
| idle | — | no snackbar node in the DOM at all |
| saved · undo available | Save change | value flips **immediately** (optimistic), snackbar mounts, Save disables, server reads `pending` |
| saved · confirmed | +900ms simulated ack | server reads `acknowledged`; nothing in the component moves |
| held | pointer or keyboard focus inside the snackbar | countdown pauses and holds; leaving resumes from the held remainder |
| reverted | Undo | value restored, confirmation replaced by a shorter (4s) revert notice with **no** Undo button |
| dismissed | × button, `Esc`, or countdown reaching 0 | exit transition, then the node is removed from the DOM |

Remaining time is an accent hairline across the top edge of the panel that depletes from the right — the only accent in the component besides the Undo label and the focus ring.

## Choices reported

1. **Dismissal is a real removal, not a hide.** `OTHER-dynamic-dom-not-css-hide` — the snackbar is constructed on demand and `removeChild`'d after its exit transition. At rest there is no snackbar node in the document. A `setTimeout` fallback (`--motion-duration-fast` + 120ms) guarantees removal even if `transitionend` never fires.
2. **Auto-dismiss 6s, revert notice 4s**, both defined as tokens (`--motion-duration-dismiss`, `--motion-duration-dismiss-short`) and read from CSS by the JS — no duplicated literal numbers. The countdown pauses on hover and on `focusin`, so a keyboard user tabbing to Undo cannot have it disappear mid-reach.
3. **The countdown hairline is JS-driven, not a CSS animation.** It writes a `--snackbar-remaining` scale factor, so the global `prefers-reduced-motion` clamp (which collapses every transition to 0.001ms) does not silently destroy the one piece of motion that carries information. Under reduced motion it steps in 10% increments on a 250ms timer instead of sweeping per frame; the enter/exit transitions are clamped as normal.
4. **Undo removed rather than disabled on the revert notice.** A revert has nothing to undo, so the button and its divider are simply not built.
5. **Primary button is ink-on-paper (white fill, near-black label), not accent-filled** — `COLOR-accent-punctuation-not-fill`. Accent appears only on the Undo label, the countdown hairline and the focus ring.
6. **Save is disabled while a snackbar is live**, which is what gives the `:disabled` state something real to do and prevents stacking snackbars.
7. **Snackbar aligns to the content column, not the viewport.** `.snackbar-region__column` reproduces `.page`'s width and gutter exactly, so its left edge sits on the content edge (measured 214px = 214px at 1280w). This was wrong in the first pass — the region carried the gutter and the snackbar sat 24px outboard of the text. Fixed and asserted.
8. **Copy is deadpan and unexclaimed** per the binding's voice note: "Digest set to Daily." / "Change reverted." / "Dismiss". No "Success!", no "Saved!", no persuasion words.

## Gaps resolved

DESIGN.md's frontmatter carries colour, type, space and motion only. Everything else the component needed was added as a **semantic** token (never a literal in component CSS), with the value derived from the DESIGN.md body prose or from the taste rules:

- `--font-display` / `--font-body` = Untitled Sans + system fallbacks; `--font-mono` = Geist Mono; `--font-serif` = Domaine Display SemiBold → Georgia. Named in the DESIGN.md body as token-only families; no font files are loaded (no external requests allowed), so these are stacks with real fallbacks.
- `--weight-regular/medium/bold` = 400/500/700 (DESIGN.md body: those three weights only, no italics).
- `--border-hairline: 1px`, `--radius-none: 0px` — the brief's hairline-ruled, non-rounded editorial primitive.
- `--tap-min: 44px` (rule `SPACING-tap-targets-44px`), `--icon-size-sm: 16px` (rule `ASSET-icon-sizes-consistent` permits 14/16/20 only).
- `--page-max`, `--page-gutter`, `--snackbar-max-width`, `--snackbar-inset-block-end`, `--snackbar-enter-shift`, `--snackbar-layer`, `--focus-ring-width/offset`, leading and tracking tokens, and the two dismiss-duration tokens above.
- The dismiss `×` is an inline SVG at `--icon-size-sm` with `stroke="currentColor"`.

## Could not satisfy / deliberate divergences

- **Fonts cannot actually render as specified.** "No external requests" and "Untitled Sans / Domaine Display SemiBold" are in tension: the licensed faces are not installed in the audit or screenshot environment, so the page falls back to the system grotesk and Georgia. The families are declared first in each stack, so the real faces are used wherever they are installed. `font-synthesis: none` is set on the serif lede so no browser can fake a SemiBold — `TYPE-no-faux-anything` is honoured in the fallback case rather than approximated.
- **Serif is used exactly once**, on the one-sentence lede — the authorial-voice slot `TYPE-serif-authorial-only` permits. It appears in no title, label, metric or CTA.
- **The page heading is fluid** — `clamp(var(--type-h2), 8vw, var(--type-h1))`. The h1 token (96px) would overflow a 390px viewport as a fixed value; the clamp honours the display scale on desktop and falls to the h2 token on mobile. The component's own text never leaves the body band, per the binding's typography note.
- **The state readout line** (`state / server / dismiss in`) is harness instrumentation, not part of the component. It exists so the full machine can be observed by hand; it would not ship with the component.

## Verification

Headless Chromium (Playwright), 1280×900 and 390×844, plus a `reducedMotion: 'reduce'` context — 30/30 assertions passed:

- optimistic value flip, snackbar mount, Save disabled, `pending` → `acknowledged`
- Undo restores the value, mounts exactly one snackbar, drops the Undo button
- × / `Esc` / 6.3s timeout each remove the node from the DOM and re-enable Save
- hover holds the countdown (`5s · held` stable across 1.5s) and resumes on leave
- Undo 76×44 and dismiss 44×44 tap targets at both viewports
- snackbar left edge = content column left edge (214 = 214)
- reduced-motion: countdown still steps (1 → 0.8 → 0.6), dismiss still removes the node
- mobile: snackbar inside the viewport, no horizontal page scroll
- zero console or page errors

Eyes-on at full resolution in all three states (confirmation, reverted, mobile).

## Audit result

`audit_taste(profile: "andrew", project: "arena", surface: <arena binding>)`, run both ways:

- **html mode — Verdict: PASS (no findings).** The three delegated rules (`TOKEN-no-bare-literals` → `audit_page`, `SPACING-tap-targets-44px` → `audit_tap_targets`, `LAYOUT-no-bare-modals` → `evaluate_design`) ran and returned nothing. `note_assessments`: color **present** (scheme=dark, bg_luminance=0.02); the rest unverifiable from static HTML. `fidelity_findings`: none.
- **url mode (rendered) — Verdict: PASS (no findings).** `note_assessments`: typography **present** (max_heading_px=96), spacing **present** (text_density=0.63), color **present**. `fidelity_findings`: none. In url mode the three delegated rules report as not-assessed (no delegated results supplied for a `file://` target), which is why both modes were run.

29 further rules came back `not_assessed` in both runs — they have no deterministic detector and want a judgment layer (`COLOR-accent-punctuation-not-fill`, `LAYOUT-no-card-soup`, `OTHER-hover-state-required`, `MOTION-prefers-reduced-motion`, `TYPE-serif-authorial-only`, the asset-clearance and content-accuracy families, etc.). They were satisfied by construction and checked by hand; the audit does not confirm them.

**One finding was raised and fixed, not argued away.** The first rendered run returned `WARN — NOTE-typography: note promises display/dramatic scale but the largest heading is 56px`. The page heading was moved from the h2 token to the fluid h1 clamp described above; the re-run reads `max_heading_px=96`, status **present**, verdict PASS.
