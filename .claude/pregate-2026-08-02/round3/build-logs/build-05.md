# build-05 — optimistic-save snackbar

Prompt: `round3/composed-prompt.md`. Tokens: `arena/DESIGN.md` (values transcribed verbatim into `:root`).

Files:
- `index.html` — the deliverable. One self-contained file, all CSS/JS inline, zero external requests (verified).
- `verify.mjs` — Playwright state-machine assertions (A5 evidence). `node .claude/pregate-2026-08-02/round3/builds/build-05/verify.mjs`
- `shot.mjs`, `state-visible.png`, `state-visible-crop.png` — eyes-on capture of the `visible` state.

---

## Choices I was asked to report

**Motion easing (prompt §Motion asked me to pick and report).**
- Enter — `opacity 0→1`, `translateY 16px→0`, `--motion-duration-base` (200ms), **`--motion-easing-out-expo`**. The entrance's job is to say *where the surface sits relative to the viewport edge*. out-expo front-loads almost all the travel and lands with a long flat tail, so the reader perceives the arrival as already-settled rather than as a slide being performed. out-quart is gentler and reads as a decoration at this distance; `site` is a symmetric-ish signature curve built for larger page moves and has a slow head that makes a 16px travel look hesitant.
- Exit — `opacity 1→0`, `translateY 0→8px`, `--motion-duration-fast` (120ms), **`--motion-easing-out-quart`**. At 120ms the curve is nearly invisible; out-quart's shorter tail makes the exit read as *removal*, not as a second performance. Deliberately a different, quieter curve from the entrance.
- `--motion-easing-site` is defined in the token block but not consumed by the snackbar. It is used once, on the button `loading` state's progress rule, where a longer sweep suits it.
- `prefers-reduced-motion: reduce` — entrance collapses to opacity-only (transform removed, verified `transform: none`); exit is instant (transition removed and the node is torn down synchronously, no `transitionend` wait). Every other transition/animation on the page is also collapsed under the same query.

**Where emphasis is carried (gaps 4 and 6 — display type clamped to `type.body`).**
- `status_message`: **weight + colour.** `--type-body` at `--weight-medium` (500) in `--color-fg` (pure white), against a surface whose only other text is a control label. No size change, no accent.
- `undo_action`: **weight + accent-as-punctuation.** `--type-body` at `--weight-medium`, label in `--color-fg`, with a 1px `--color-accent` rule under the label glyphs only (`border-block-end` on an inner `.btn__label` span). The accent touches roughly 40×1 px of the component — punctuation, never a fill. It is the only accent in the component.

**Component names I created (gaps 2, 3, 5 — no matching component in the system).**
| Archetype | Name I created | Notes |
|---|---|---|
| `snackbar` | `.snackbar` | New component. Not an alias of `card` — `card` carries a hover state and a container reading I explicitly did not want (`LAYOUT-no-card-soup`). |
| `status-message` | `.snackbar__message` | Element of `.snackbar`, not a standalone component. `role="status" aria-live="polite"`. |
| `action-row` | `.snackbar__actions` | Element of `.snackbar`. Separated from the message by `border-inline-start: 1px solid var(--color-line)` — a hairline rule, not a filled surface, per the structure spec. |

**Missing button state / variant (gaps 7, 8).**
- **`loading` state — added and implemented**, not substituted. `.btn[aria-busy="true"]`: label recedes to `--color-fg-dim`, `pointer-events: none`, `cursor: progress`, and a 1px `--color-accent` rule sweeps under the control. Colour here is functional signal (`COLOR-control-signal-only`), and it is static under reduced motion. Exercised by the harness `Save change` button for one `--motion-duration-fast` beat before commit.
- **`secondary` variant — added and implemented.** `.btn--secondary` is the Undo control: no fill, no border, label at weight 500 with the accent underline, `--color-bg-card` on hover. `primary` and `ghost` from DESIGN.md are also present (`Save change` and `Dismiss` respectively).
- **Registration:** I defined and documented both here and in the CSS, but I did **not** edit `arena/DESIGN.md`. That file is the shared fixture every build arm reads; mutating it mid-experiment would contaminate the other arms' inputs. Flagging it rather than doing it: if these should land in the system, `components.button.states` needs `loading` and `components.button.variants` needs `secondary`.

---

## Gaps I resolved on my own judgment

1. **Decision-scope mismatch (gap 1).** Noted, no action available to me — the Decision Graph store resolves globally and `project_dir` cannot move it. The one active decision surfaced (`dec_design_01`, light-mode field intensity) does not bear on a dark-surface transient component, so nothing in this build turns on it.
2. **No webfont is loadable without a network request.** `--font-body`/`--font-display` declare `"Untitled Sans"` first with a neutral grotesque fallback chain. Weights are restricted to 400/500/700 via `--weight-*` tokens; no `font-style: italic` anywhere and no italic file referenced. On a machine without Untitled Sans installed the fallback renders — that is the only honest option under "no external requests".
3. **"No px literals" vs. real component dimensions.** `TOKEN-no-bare-literals` and `LAYOUT-proportional-frames` between them mean the *layout frame* must be proportional and every *value* must come through `var(--token, fallback)`. I resolved this by defining a semantic component-dimension token band in `:root` (`--hairline`, `--control-min-size`, `--icon-size`, `--icon-stroke-width`, `--focus-ring-width`, `--focus-ring-offset`, `--snackbar-max-inline-size`, `--snackbar-enter-offset`, `--snackbar-exit-offset`, `--measure-page`) and authoring 100% of the component CSS against variables. The page frame and the snackbar width are `min()`-based, not fixed px. Zero bare hex, px, or font-family literals exist below the token block.
3b. **Non-length literals were tokenised too.** Letter-spacing went to `--tracking-label` / `--tracking-display`, and the icon's `stroke-width` moved off the SVG attribute onto `.btn__icon` as `var(--icon-stroke-width)` — so the icon's only inline attributes are `stroke="currentColor"` and `fill="none"` (`ASSET-icon-stroke-current-color`). Verified by extracting lines 83→`</style>` (290 lines of component CSS) and grepping for hex / px / rem / em outside a `var(--token, fallback)`: zero matches.
4. **The 6000ms dwell is also a token.** `--snackbar-dwell: 6000ms` lives in `:root` and the JS reads it out of computed style, along with `--motion-duration-base` and `--motion-duration-fast`. No duration is duplicated as a number in the script.
5. **Focus ring colour is `--color-fg`, not `--color-accent`.** The spec makes Undo "the only element permitted to carry the accent". An accent focus ring on the Dismiss button would have broken that. A 2px white ring at 2px offset is unambiguous on this surface and stays monochrome.
6. **Live-region announcement.** The whole snackbar enters the DOM at commit, so a `role="status"` that arrives already populated can be missed by assistive tech. The node is appended with an empty message and the text is written one frame later, which makes it a genuine live-region *change*. No element is CSS-hidden and nothing conditionally absent is left in the DOM (`OTHER-dynamic-dom-not-css-hide`).
7. **`leaving` is genuinely inert.** `pointer-events: none` in the `leaving` rule, plus every handler guards on `state === "visible"`, so a click landing during the 120ms exit cannot re-enter the machine. Verified.
8. **The two terminal states are visibly distinct on the surrounding surface**, per the States section: `dismissed` leaves the optimistic value in place and the harness reads "dismissed — the save stands"; `reverted` rolls the field value back and reads "reverted — the save was rolled back".
9. **No progress/countdown indicator.** A depleting timer bar is the conventional move and I left it out — it is decoration that does not reveal structure (`OTHER-no-load-bearing-decoration`, `MOTION-reveals-structure`), and the pattern already guarantees the clock is held whenever the reader is reaching for the control.
10. **Display-band type on the harness page (see audit, below).** The first `audit_taste` run returned WARN on `NOTE-typography`: the page's largest heading was 27px and the note's trait check expects the display band to actually appear. I raised the *page's own editorial headline* to `clamp(--type-h3, 9vw, --type-h1)` and the lede to `--type-lead`. This is the note read correctly, not gamed around: the note's constraint is that **component** text stays in the body band and carries emphasis by weight — the snackbar is untouched and still 16px throughout. The page headline is exactly where the display band belongs.

## What I could not satisfy

- **A1 (`review_diff`) and A2 (`talon_scan`) were not run by me** — these are orchestrator-owned checks in the acceptance table and A2 explicitly requires an agent-supplied post-interaction elements+viewport snapshot. I assert by construction and by reading the file that no added line carries a bare hex, font-size, font-family, or spacing literal outside the `:root` token block; that assertion is agent-asserted, not tool-verified.
- **Motion duration and easing remain UNVERIFIED as timings**, exactly as A5 says. I verified the *end states* (opacity settles at 1, transform settles at 0, reduced-motion transform is `none`, exit is instant under reduce) — not the shape of the curve over time. No motion sampler exists.
- `arena/DESIGN.md` was not amended with the new button state/variant, for the reason in the table above.

---

## Verification

**A5 — state machine (Playwright, `verify.mjs`): 35/35 PASS.**

```
PASS  initial state is absent (no .snackbar in DOM)
PASS  no console/page errors on load
PASS  snackbar is visible after save          PASS  data-state=visible
PASS  opacity settles at 1                    PASS  translateY settles at 0
PASS  message text is "Saved"                 PASS  message is a polite live region
PASS  undo control present                    PASS  dismiss has accessible name "Dismiss"
PASS  optimistic value already changed
PASS  clock held by hover: still visible after 7s of hover
PASS  auto-dismiss resumes on pointer leave -> dismissed
PASS  snackbar removed from the document      PASS  save stands after dismiss
PASS  clock held by keyboard focus: still visible after 7s
PASS  undo via keyboard -> reverted           PASS  value rolled back
PASS  reverted outcome is distinct from dismissed
PASS  dismiss enters leaving state [leaving]  PASS  leaving surface is inert [pointer-events: none]
PASS  leaving -> dismissed on exit-motion-end
PASS  reduced motion: entrance is opacity-only (transform: none)
PASS  reduced motion: exit is instant
PASS  zero external network requests
PASS  tap targets >= 44x44 @1200px: undo 76x47, dismiss 44x44, save 133x44
PASS  tap targets >= 44x44 @390px:  undo 76x47, dismiss 44x44, save 133x44
PASS  no horizontal overflow at 390px
```

**A6 — semantic roles / live regions:** present. `.snackbar__message` is `role="status" aria-live="polite"`; the icon-only control carries `aria-label="Dismiss"` and its SVG is `aria-hidden focusable="false"` with `stroke="currentColor"` at `--icon-size` (16px, inside the allowed 14/16/20 set); both controls are real `<button type="button">`.

**A3 / A4 corroboration:** tap targets measured above. Contrast on `--color-bg-elev` (#141414): `--color-fg` 18.9:1, `--color-fg-muted` 9.4:1, `--color-fg-dim` 4.9:1, `--color-accent` 4.9:1 — all ≥ 4.5:1. Body text on `--color-bg` (#050505): `--color-fg-muted` 10.3:1, `--color-fg-dim` 5.3:1.

**A7 — `audit_taste` (profile `andrew`, project `arena`, surface `portfolio`, url mode).**

- **Verdict: PASS — "no findings" (0 block, 0 warn).** `findings: []`, `fidelity_findings: []`, `suppressed: []`, `capture_warnings: []`. Binding resolved to `arena`.
- `note_assessments`: typography **present** (`max_heading_px=96`), spacing **present** (`text_density=0.36`), color **present** (`scheme=dark, bg_luminance=0.02`); layout / motion / aesthetic / libraries / special returned **unverifiable** — the engine reports no deterministic verifier for those dimensions rather than guessing. None came back missing or partial.
- Reported honestly: 31 rules landed in `not_assessed` (no deterministic detector — they need an LLM judgment layer), including `COLOR-accent-punctuation-not-fill`, `LAYOUT-no-card-soup`, `MOTION-prefers-reduced-motion`, `TOKEN-semantic-button-classes`, `OTHER-hover-state-required` and `ASSET-icon-*`. Three more (`LAYOUT-no-bare-modals`, `SPACING-tap-targets-44px`, `TOKEN-no-bare-literals`) are delegated to `evaluate_design` / `audit_tap_targets` / `audit_page` and returned no delegated results on this run. **A PASS verdict here is not evidence those 34 rules hold** — for the tap-target and reduced-motion ones I have my own measurements above; the rest are agent-asserted from the source.
- Prior run (before the display-band fix in gap-resolution 10) was **WARN — 1 warn**, `NOTE-typography`, evidence `max_heading_px=27`. That is the only finding this build ever produced. The PASS above was re-run against the final byte-state of `index.html` after the letter-spacing / stroke-width tokenisation, and `verify.mjs` was re-run after it too (35/35).

**Eyes-on:** `state-visible.png` (1200×800 @2x, `visible` state with the pointer inside the surface, clock held) and `state-visible-crop.png` (component only). Read at full resolution: hairline rule separates message from controls, accent appears only as the 1px underline beneath "Undo", no shadow, no radius, no second hue.
