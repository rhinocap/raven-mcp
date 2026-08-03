# Build log — snackbar (arm-a)

Spec: `../composed-prompt.md` · tokens: `../arena/DESIGN.md`

## Choices I was asked to report

- **Enter easing:** `motion.easing.out-expo` (`--motion-easing-out-expo`), on both opacity and transform, at `motion.duration.base` (200ms — the spec's 210ms designer value rounds to this token as instructed). Rationale: a confirmation surface should decelerate hard and settle fast; out-expo front-loads the movement so the toast feels immediate without overshoot. `site` is a two-sided ease better suited to on-page layout moves than an off-canvas entry.
- **Exit easing:** `motion.easing.out-quart` (`--motion-easing-out-quart`) at `motion.duration.fast` (120ms), opacity only per spec. A gentler curve than out-expo — an exit should recede, not perform.
- **`prefers-reduced-motion`:** opacity-only (transform: none) AND duration collapsed to `--motion-duration-instant` (0.01ms), satisfying both the Motion section and `MOTION-prefers-reduced-motion`.

## Gaps resolved (spec §Gaps 1–6)

1. **No surface binding for "arena":** proceeded with DESIGN.md's brief prose as the taste surface (dark-first editorial, hairline rules, one warm accent, restraint). No interview could be run from this build arm.
2. **Decision-scope mismatch:** noted; the dec_design_01–06 rejections were still honored (line-height ≥ 1.2 everywhere, no nested cards, no orange as general chrome — accent appears only on the Undo action, a functional signal).
3. **"toast" archetype unmatched:** created a new `snackbar` component (`.snackbar`, injected into a persistent `.snackbar-region` live region).
4. **"text" archetype unmatched:** created `.snackbar__message`, a plain `<p>` text element scoped to the component.
5. **button missing `loading` state:** added `.btn.is-loading` (fg-dim, pointer-events none, `aria-busy`) to the semantic button system; applied to the Undo button during `undoing`. Registered here in CSS + this log — no design-system registry is writable from this arm.
6. **button missing `secondary` variant:** substituted the existing **`ghost`** variant for both the inline Undo and the dismiss affordance rather than inventing an unregistered secondary.

## Other decisions and notes

- **Emphasis→type mapping applied literally:** message at `type.h3` (27px), Undo at `type.h2` (56px), dismiss at `type.body`. Flagging plainly: a 56px Undo is far larger than any shipping snackbar convention and visually dominates the message; I applied it because the build instruction was to follow the spec exactly and this mapping is not listed as a gap. If this is a compose-time mapping defect, the one-line fix is `type.body` on all three nodes (message medium-weight).
- **Hidden = absent from DOM** (`OTHER-dynamic-dom-not-css-hide`): the snackbar node is created on save-committed and removed after exit; no display:none. A persistent, empty `role="status" aria-live="polite"` region stays in the DOM so injected confirmations actually announce (a live region added at insert time would not).
- **State machine:** implemented exactly as specced (`hidden`/`visible`/`undoing`, all five transitions). "Exits immediately" on undo is read as: exit animation starts at undo-press while the revert runs; `revert-complete` (simulated 400ms) restores the value and lands `hidden`. `data-state` is stamped on the root for testability.
- **Single instance:** a save while visible restarts the 5000ms countdown on the existing snackbar; undo reverts only the latest save (demo model is a history stack).
- **Added semantic tokens** (values not present in DESIGN.md, needed to avoid raw literals in component CSS): `--size-tap-min: 44px`, `--border-hairline: 1px`, `--focus-ring-width: 2px`, `--motion-duration-instant: 0.01ms`, `--motion-distance-enter: var(--space-md)`. All semantic names per `TOKEN-semantic-names`.
- **Fonts:** Untitled Sans / Geist licensed files can't be embedded in this fixture; the `--font-body/--font-display/--font-mono` tokens carry system fallback stacks behind the same names. No font-family literals in component CSS. No serif anywhere (`TYPE-serif-authorial-only`), no italics.
- **Corner radius:** none — no radius token exists in the system and the brief is hairline-ruled editorial; the toast is a sharp-cornered `bg-elev` surface with a `--color-line` hairline border, no shadow (`LAYOUT-no-card-soup`).
- **Contrast check (computed):** accent #ed4609 on bg-elev #141414 ≈ 4.8:1 (AA pass); fg and fg-muted are well clear. Dismiss icon is 20px (allowed set 14/16/20), `stroke="currentColor"`, sized by SVG attributes not CSS.
- **Tap targets:** all three interactive elements carry `min-width/min-height: var(--size-tap-min)` (44px).
- **Hover states:** Save (bg shift), Undo (underline at accent), dismiss (fg-muted → fg). Focus-visible outlines on all buttons.
- **No countdown pause on hover** — the spec's transition table names a plain 5000ms timeout, so no unrequested pause-on-hover behavior was added.

## A5 — Playwright assertion (agent-asserted criterion)

```js
await page.click('#save-change');
const bar = page.locator('.snackbar');
await expect(bar).toBeVisible();                    // hidden -> visible on save-committed
await expect(bar).toContainText('Change saved');
await page.click('.snackbar__dismiss');
await expect(bar).toHaveCount(0);                   // visible -> hidden on dismiss-pressed

await page.click('#save-change');
await expect(page.locator('.snackbar')).toHaveCount(0, { timeout: 6000 }); // 5000ms auto-dismiss

await page.click('#save-change');                   // value -> Draft N
await page.click('.snackbar__undo');                // visible -> undoing
await expect(page.locator('.snackbar')).toHaveCount(0);      // undoing -> hidden after revert
await expect(page.locator('#demo-value')).not.toHaveText(/Draft 4/); // reverted
```

Duration/easing remain UNVERIFIED per the spec's own note (no motion sampler); the token wiring is verifiable by reading the CSS.

## Could not satisfy

- Gap 1's "run get_taste_interview + bind_taste_surface" — interview is a user-facing gate, not runnable from a build arm; proceeded on DESIGN.md alone as the prompt directs ("do not consult any other design source").
- Real Untitled Sans/Geist rendering (licensed binaries unavailable to a self-contained fixture).
