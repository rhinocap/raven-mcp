# build-01 — snackbar for an optimistic save

One self-contained file: `index.html`. All CSS and JS inline, no external requests,
no fonts fetched, no dependencies.

## Grounding

- `read_design_md` on `.claude/pregate-2026-08-02/arena/DESIGN.md` — every token value
  in `:root` is copied from that file's frontmatter (colors, type scale, space, motion
  durations + easings). Nothing was invented.
- `get_taste_profile("andrew")` — 36 rules plus a **surface binding for project `arena`**
  ("transient UI components (toasts, inline affordances, buttons) on the dark editorial
  portfolio system"). Its `design_notes` were treated as acceptance criteria, not mood.
  Its `voice_note` ("editorial restraint, deadpan, zero sales language. Confirmation copy
  is plain and unexclaimed; the affordance is named for what it does") set the copy.

## Choices

**States.** `idle → saved (confirmation + Undo + auto-dismiss) → {undone | dismissed | expired}`.
Undo lands on a second, briefer confirmation ("Change reverted.") that carries **no** Undo —
an undo of an undo is a redo, and this component doesn't claim one.

- Auto-dismiss: **6000ms** for the actionable snackbar, **3200ms** for the brief revert
  confirmation. Both are tokens (`--snackbar-dismiss-delay`, `--snackbar-revert-delay`),
  and the JS reads them back out of computed style, so CSS and JS cannot drift.
- Auto-dismiss **pauses on hover and on focus-within**, resumes with the remaining time.
  An undo affordance that expires while you are reaching for it is a broken affordance.
- Explicit dismiss: the × button, plus **Escape**.
- A second save while a snackbar is up replaces it immediately (one live snackbar, no stack).

**Remaining-time indicator.** A 1px `--accent` rule on the snackbar's bottom hairline,
scaling from 1 → 0 over the dismiss delay. It is load-bearing (it is the only cue that the
Undo is expiring) and it uses the accent as punctuation, not fill. It shares the same
`--snackbar-dismiss-delay` token as the timer and pauses with it.

**Form.** No rounded card, no shadow, no pill. Hairline `--line` border on `--bg-elev`,
square corners, and a vertical hairline separating the message from the actions — the
binding's `layout` note asks for hairline rules doing the separating and explicitly bans
card-soup and shadcn defaults.

**Accent.** Used in exactly three places: the Undo label, the remaining-time rule, and the
focus-visible outline. One hue, no second accent, no gradient, no glow.

**Optimistic state on the field.** The saved value flashes `--accent` for `--motion-duration-slow`
then settles to `--fg`. That is signal, not decoration: it marks the value as written-but-not-yet-
confirmed, which is what "optimistic" means. It resolves on its own; nothing depends on noticing it.

**Copy.** "Visibility set to Private." / "Undo" / "Change reverted." Declarative, unexclaimed,
no "Success", no "Saved!", no persuasion verbs.

**Motion.** Enter = 8px rise + fade at `--motion-duration-base` / `--motion-easing-out-expo`
(it arrives from the edge it lives on — structural). Leave = `--motion-duration-fast`. The
global `prefers-reduced-motion: reduce` block clamps every duration to 0.001ms.

**Demo harness.** A single settings field ("Who can open this project") that toggles
Public ↔ Private and one `Save change` button. Every path in the state machine is reachable
by hand from it.

## Gaps resolved

1. **Two token vocabularies.** `read_design_md` emits `--color-accent`, `--type-body`, etc.;
   the DESIGN.md prose body writes `var(--accent)`, `var(--line)`, `var(--font-display)`.
   Resolved by defining the canonical `--color-*` / `--type-*` / `--space-*` / `--motion-*`
   set from the token index, then aliasing the prose names off them. Component CSS is
   authored against the prose names only, so both vocabularies resolve and there is one
   source of truth.
2. **Type tokens are unitless numbers** in the frontmatter (`body: 16`). Declared as
   `16px` etc. — the same numbers, made usable.
3. **Fonts.** Untitled Sans / Geist / Domaine are named in `--font-*` tokens with system
   fallbacks. The file is offline-only by requirement, so no font file is embedded and the
   demo renders in the fallback. No italic is ever requested (no italic file exists) and
   `--font-serif` is declared but deliberately unused — serif is authorial voice only, and
   a snackbar has no authorial voice.
4. **Values not in DESIGN.md** (border width, radius, tap-target minimum, icon size,
   line-heights, font weights, snackbar width, both dismiss delays) were added as named
   component tokens rather than written as literals, so `var(--token, fallback)` holds
   everywhere in component CSS.
5. **Live region vs. "don't CSS-hide dynamic nodes."** The `role="status"` region is always
   present but **empty** — a live region has to pre-exist to announce reliably. The snackbar
   node itself is created and removed from the DOM, never hidden. Verified: 0 children at rest.

## Could not satisfy

- Real Untitled Sans / Geist / Domaine rendering (see gap 3) — the self-contained,
  no-external-request constraint and no licensed woff2 in this fixture directory.
- Nothing else. No requirement was dropped.

## Verification (measured, not assumed)

Playwright, Chromium, `file://`, 1280×800 and 390×844:

| check | result |
| --- | --- |
| snackbar in DOM at rest | 0 nodes |
| optimistic value update on save | `Public` → `Private` immediately |
| confirmation copy | `Visibility set to Private.` |
| auto-dismiss at 6000ms | present at 5.35s, gone at 6.65s |
| hover pauses the timer | `data-paused="true"`, `animation-play-state: paused` |
| pointer leave resumes | `data-paused="false"` |
| Undo reverts the value | `Private` → `Public` |
| revert confirmation | `Change reverted.`, no Undo button, delay `3200ms` |
| brief auto-dismiss | gone after 3.5s, region back to 0 children |
| explicit × dismiss | node removed, saved value persists |
| Escape dismiss | node removed |
| tap targets | Undo 69×44, dismiss 44×44, Save 133×44 — all ≥44px |
| reduced motion | enter animation duration `1e-06s` |
| horizontal overflow at 390px | `scrollWidth === clientWidth === 390` |
| console / page errors | none |

Eyes-on at both viewports: desktop and mobile screenshots reviewed at full size.

One first-run "failure" was a false alarm and is worth recording: the brief snackbar
appeared not to auto-dismiss, because clicking Undo leaves the pointer sitting over where
the replacement snackbar renders — hover-pause was doing its job. Re-run with the pointer
moved away: dismisses correctly.

## Audit result

`audit_taste(profile: "andrew", project: "arena", surface: <bound arena surface>, html: <this file>)`

- **Verdict: PASS — no findings.** `findings: []`, `fidelity_findings: []`,
  `suppressed: []`, binding resolved to `arena`.
- `note_assessments`: `color` → **present** (`scheme=dark, bg_luminance=0.02`). The other
  seven notes came back **unverifiable** in html mode (they need a rendered URL, or human
  judgment).
- **Honest caveat on that PASS:** 29 rules landed in `not_assessed` because static-HTML mode
  has no deterministic detector for them. A clean verdict here means "nothing the engine can
  measure is wrong", not "all 36 rules verified". The ones the engine could not check were
  checked by hand and by measurement above: tap targets (measured), reduced-motion clamp
  (measured), hover states on every interactive element (authored), icons at 16px with
  `stroke="currentColor"` (authored), no gradient/glow/second hue (authored), no inline
  button styles (authored), overflow-x clip on html/body (measured, no overflow at 390px).
