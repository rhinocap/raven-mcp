# build-09 — optimistic-save snackbar

One self-contained file: `index.html` (inline CSS + JS, zero external requests — verified: 0 non-localhost requests in a Playwright run).

## Grounding

- `read_design_md` on `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena/DESIGN.md` — all 26 tokens transcribed into `:root` at their concrete values (colors, type scale, space, motion durations/easings). Component CSS reads `var(--token, fallback)` only; no bare hex, px, or font literal appears below the token block.
- `get_taste_profile("andrew")` — 39 rules + the **`arena` surface binding** (bound 2026-08-03): "monochrome portfolio component surface — transient UI components (toasts, inline affordances, buttons) on the dark editorial portfolio system", with per-dimension design notes used as acceptance criteria.
- No other sources consulted; nothing needed from outside the design system.

## State machine

`idle → optimistic (undo window open) → committed | reverted`

| Path | Behavior |
| --- | --- |
| Save | Value flips **immediately**; row meta reads `Pending — reversible for a few seconds.`; snackbar appears with the new state, `Undo`, and an accent countdown rule. |
| Auto-dismiss (6 s) | Snackbar leaves, change commits, meta reads `Saved.` |
| Undo | Change rolls back, undo-snackbar is replaced by a terminal `Reverted to …` confirmation (3 s, no action). |
| Explicit dismiss (× or `Escape`) | Snackbar leaves **and the change commits** — dismissing is acceptance, not cancellation. |
| Hover / focus | Pauses the countdown, but only while an undo is still on offer. |

Only one snackbar exists at a time; a second save replaces the first.

## Choices

1. **6 s undo window, 3 s terminal confirmation.** The undo snackbar carries a decision, so it gets time to read the sentence and reach the button; the revert confirmation carries none.
2. **Accent = the reversible window.** `--accent` appears exactly twice on the component: the word `Undo` and the countdown rule that measures how long `Undo` remains true. Everything else is monochrome. Accent stays punctuation, never a fill (`COLOR-accent-punctuation-not-fill`, `COLOR-control-signal-only`).
3. **The countdown is load-bearing, not decoration.** It is the only thing that says how long the change stays reversible (`MOTION-reveals-structure`, `OTHER-no-load-bearing-decoration`).
4. **Explicit dismiss commits.** A snackbar's × means "I've read it", not "cancel". Undo is the only path that reverts — otherwise the same gesture would mean two things.
5. **Node created and removed, never CSS-hidden** (`OTHER-dynamic-dom-not-css-hide`). A permanently-present, visually empty `role="status" aria-live="polite"` region hosts it so the announcement lands.
6. **Snackbar is centered in a padded region, hairline-bordered, square-cornered, `--bg-elev` on `--bg`.** No shadow, no radius, no pill, no badge — separation is a hairline (`LAYOUT-no-card-soup`, `OTHER-no-shadcn-defaults`).
7. **Primary button is monochrome** (`--fg` fill on `--bg` text), not accent — the save action carries no signal that needs colour.
8. **Copy is deadpan and unexclaimed**: "Visible to anyone with the link." / "Reverted to only me." — the affordance is named for what it does (`Undo`, `Dismiss`).

## Gaps resolved

- **Type tokens are unitless in DESIGN.md** (`type.body: 16`). Declared as `px` in `:root` (`--type-body: 16px`) so component CSS can use `var()` directly rather than `calc(… * 1px)`.
- **Fonts can't be embedded** — a self-contained file with no external requests can't load the licensed Untitled Sans / Geist / Domaine woff2 files. Families are declared as tokens with real-family-first stacks (`"Untitled Sans", ui-sans-serif, system-ui, …`); the rendering machine substitutes. No synthetic weights are requested (400/500/700 only), no italic anywhere, and `--font-serif` is defined but never applied (`TYPE-serif-authorial-only`, `TYPE-no-faux-anything`).
- **Tokens DESIGN.md doesn't define** were added with semantic names, not literal ones: `--line-hairline`, `--radius-flat`, `--tap-min`, `--frame-page`, `--frame-snackbar`, `--icon-sm`, `--icon-stroke`, `--focus-ring`, `--countdown-thickness`, plus weight/leading/tracking (`TOKEN-semantic-names`).
- **Reduced motion vs. the countdown.** The global `prefers-reduced-motion` block clamps every duration to `0.001ms`, which would leave a countdown rule frozen at full width — a lie about remaining time. Under reduced motion the countdown element is **not rendered at all** and auto-dismiss still runs on its own clock. Verified: `countdown nodes=0`, snackbar still gone after 6.5 s.
- **A terminal confirmation could hang forever.** First run showed the revert confirmation appearing under a stationary cursor, inheriting `pointerenter` and pausing indefinitely. Fixed: hover/focus pause is attached only to snackbars that still offer an undo.

## Not satisfied

- **Real type files** — see above; the design intent is expressed, the licensed faces are not embedded.
- **Failure path.** The brief asked for confirmation + undo + auto-dismiss + explicit dismiss; a rejected-write ("Couldn't save. Retry.") path is not built. Deliberately out of scope, and the accent is unclaimed for it.
- **No `evaluate_design`/`audit_page` run** beyond what `audit_taste` delegates — the delegating rules returned no findings.

## Verification (Playwright, Chromium)

- All six paths above exercised: optimistic flip, hover-pause (`0.944 → 0.942` over 1.2 s, i.e. held), undo + revert-confirm auto-dismiss, 6 s auto-dismiss commit, × dismiss, `Escape` dismiss. **0 JS errors, 0 external requests.**
- Tap targets: `Save change 158×44`, `Undo 62×44`, `Dismiss 44×44` — all ≥ 44 px on both axes (`SPACING-tap-targets-44px`).
- 390×844 with `reducedMotion: reduce`: snackbar wraps to two rows, no horizontal page scroll, no countdown node.
- Eyes-on at 1280×800 and 390×844 (screenshots reviewed at full size).

## Audit result — `audit_taste(profile: "andrew", project: "arena", url: <local render>)`

**Verdict: WARN (0 block, 1 warn).** Binding `arena` resolved; surface applied.

- `findings: []` — no rule findings, none suppressed.
- `note_assessments`: `spacing` present (`text_density=0.30`), `color` present (`scheme=dark, bg_luminance=0.02`), `typography` **missing**, remainder unverifiable (no deterministic verifier).
- The single warn is `NOTE-typography`: *"note promises display/dramatic scale but the largest heading is 27px (max_heading_px=27)"*.

**Disposition — not fixed, deliberately.** The detector reads the word "Display" in "Domaine **Display** SemiBold" as a promise of ≥64 px headings. The same note's operative clause says the opposite: *"Component text stays in the body band; carry emphasis with weight or the accent, never with display size."* The artifact is a transient component plus a minimal harness; growing the demo heading to 64 px to clear the check would break the note it is checking and make the harness louder than the component. Recorded as a detector artifact rather than a defect. Everything else in that note is honoured: weights 400/500/700 only, no italic, `--font-serif` declared and never used.

29 rules came back `not_assessed` (no deterministic detector) — those remain judgment calls, checked by hand against the rule text above.
