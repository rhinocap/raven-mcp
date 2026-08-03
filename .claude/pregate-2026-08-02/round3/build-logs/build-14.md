# build-14 — snackbar for an optimistic save

One self-contained file: `index.html` (all CSS/JS inline, zero external requests, no font
files fetched). Tokens are declared once in `:root` from `arena/DESIGN.md`; every component
rule authors against `var(--token, fallback)`.

---

## Choices I was asked to report

**Easing (enter, 200ms `--motion-duration-base`): `--motion-easing-out-quart`**
`cubic-bezier(0.25, 1, 0.5, 1)`. Chosen over `out-expo` and `site`:
- `out-expo` (0.16, 1, 0.3, 1) spends ~85% of its travel in the first third; over only 200ms
  it reads as a snap followed by a stall, which draws attention to the motion rather than to
  where the surface sits.
- `site` (0.56, 0.22, 0.05, 0.99) has a slow, weighted in-phase — right for a large page
  element being deliberately moved, wrong for something that must be readable immediately.
- `out-quart` decelerates cleanly with no overshoot: the surface arrives from the viewport
  edge and settles. The motion states the anchor and stops.

**Easing (exit, 120ms `--motion-duration-fast`): `--motion-easing-out-quart`** — same curve,
so leaving reads as the inverse of arriving rather than a second, unrelated gesture.

**Motion distances are tokens, not literals**: enter `translateY(var(--space-md))` (16px),
exit `translateY(var(--space-sm))` (8px) — the spec's 16/8 land exactly on the space scale.

**Gap 4 — status_message emphasis, clamped to `type.body`.** Carried by **weight**:
`--weight-medium` (500) in `--color-fg`, against the `--color-fg-muted` / `--color-fg-dim`
body of the page. No size step, no accent.

**Gap 6 — undo_action emphasis, clamped to `type.body`.** Carried by **colour, as an accent
hairline**: the label sits at `--color-fg` / weight 500 with a 1px `--color-accent` underline
(`text-decoration-color`), and goes fully accent on hover/active. The accent is punctuation on
the label — never a fill, never a background. It is the only element on the page that touches
the accent.

**Gaps 2/3/5 — archetypes with no component in the system.** Created, named, and scoped with
BEM-ish class names rather than aliased onto `card`:
| archetype | what I created | why not an existing component |
|---|---|---|
| `snackbar` | `.snackbar` | `card` carries a filled elevated surface; the snackbar is a hairline-ruled bar with no radius and no shadow |
| `status-message` | `.snackbar__message` (`<p role="status" aria-live="polite">`) | it is a live region, not a text style — no system equivalent |
| `action-row` | `.snackbar__actions` | a stretched `border-inline-start` hairline is the separator; nothing in the system does this |

**Gap 7 — button missing `loading` state.** Added `.btn--loading` and used it honestly: an
optimistic save commits the surface immediately, so the *trigger* carries the in-flight state
while the snackbar is already up — label swaps to "Saving…", colour drops to `--color-fg-dim`,
the primary fill is released to a `--color-line-strong` hairline outline, `aria-busy="true"`,
pointer-events off. No spinner, no animation: a text + weight change is the most restrained
honest signal and needs no motion.

**Gap 8 — button missing `secondary` variant.** Added `.btn--secondary` and used it for Undo:
text-level, transparent border, accent hairline underline — the middle rank between
`.btn--primary` (fill) and `.btn--ghost` (icon-only, recessive). The full button system in
this file is therefore **variants** primary · secondary · ghost, **states** hover ·
focus-visible · active · disabled · loading.

**Registration**: I did **not** write the new component/variant/state back into
`arena/DESIGN.md`. That file is a shared fixture read by other consumers, and mutating it
mid-experiment would change ground truth for everyone reading it. The registration is this
table instead.

---

## Judgment calls on gaps the prompt left open

1. **Undo has no exit motion — deliberate.** The state graph has `visible → reverted`
   (terminal, "removed from the document") with no `leaving` edge for undo. I followed it
   literally: undo restores the surrounding value first, then removes the node in the same
   tick. The reversal's feedback is the surface changing back, not a farewell animation.
   Dismiss and timeout both route through `leaving → dismissed` with the 120ms exit.
2. **Live-region ordering.** The snackbar mounts with the message element **empty**, and the
   text is written on the next frame. A `role="status"` region inserted already-populated is
   unreliably announced; inserting it first and then filling it is what actually speaks.
3. **`leaving` inertness.** `inert = true`, `aria-hidden="true"`, `pointer-events: none`, and
   every button `disabled` — a late click cannot re-enter the machine.
4. **Clock accounting.** `--snackbar-dwell: 6000ms` is a token; JS reads it off the computed
   root style rather than hard-coding 6000. Hover and `focusin` bank the remaining time;
   `mouseleave` / `focusout` (checked against `relatedTarget` and `:hover`) resume from the
   banked remainder, not from a fresh 6s. Focus that lands during `entering` pauses the clock
   at the instant it starts. Live state is readable off `data-state` / `data-clock`.
5. **Re-trigger replaces, never stacks.** A second save tears the first surface down
   (`data-cancelled`) so its pending terminal callback cannot fire late.
6. **Escape** dismisses while `visible` (routes through `leaving`, same as the ✕).
7. **`reverted` reflected in the surrounding surface**, as the state description requires: the
   field value rolls back, the in-flight request is cancelled, and a monochrome ledger line
   ("Last change reverted." vs "Last change kept.") is *added to the DOM* — never CSS-hidden.
8. **`--font-serif` is deliberately not declared.** Domaine is authorial-voice-only, so the
   token simply does not exist in this file; the prohibition is unreachable rather than merely
   unbroken. No italics anywhere; `font-style: normal` is explicit on body and `.btn`.
9. **Focus rings are monochrome** (`--color-fg`, 2px, offset `--space-xs`) on every control
   including Undo — the accent stays reserved for the undo label so it reads as one signal,
   not as generic control chrome.
10. **Reduced motion.** `MOTION-prefers-reduced-motion` ("collapse to near-zero") is stricter
    than the motion spec's "opacity-only / instant", so I satisfied both: inside the media
    query the keyframes are redefined **without any translate** (opacity-only) *and* durations
    collapse to `0.01ms`. Button transitions collapse too. The `animationend` listeners have
    timer fallbacks, so the state machine still advances when animation is effectively off —
    verified under Playwright's `reducedMotion: 'reduce'`.
11. **Decision-scope mismatch (gap 1)** is an infrastructure note about where the Decision
    Graph store resolves; nothing was actionable in the build. The one rejected decision cited
    (`dec_design_01`, light-mode field) does not apply — this surface is dark-first per the
    token set and the composed prompt's own instruction.

---

## Verification

**A5 / A3 — Playwright, headless Chromium, 1200×800 and 390×844.** Wrote a throwaway driver
(deleted after the run so the deliverable stays two files), 23 assertions, **all PASS**:

```
PASS  absent before commit
PASS  optimistic value applied immediately
PASS  save button carries loading state
PASS  message is "Saved"
PASS  entering -> visible on entrance-motion-end
PASS  all targets >= 44x44 — [{"cls":"btn btn--primary btn--loading","w":116,"h":44},
                              {"cls":"btn btn--secondary","w":76,"h":44},
                              {"cls":"btn btn--ghost","w":44,"h":44}]
PASS  hover pauses auto-dismiss clock
PASS  leaving hover resumes clock
PASS  focus-within pauses clock
PASS  undo removes the surface from the document
PASS  undo reverts the surrounding surface
PASS  reverted outcome reflected
PASS  dismiss enters leaving
PASS  leaving surface is inert
PASS  leaving -> dismissed removes node
PASS  dismiss keeps the save
PASS  kept outcome reflected
PASS  auto-dismiss fires near 6000ms — 6806ms (6000 dwell + 200 enter + 120 exit + harness latency)
PASS  reduced-motion: machine reaches visible
PASS  mobile 390px: targets >= 44x44
PASS  mobile 390px: no horizontal overflow
PASS  reduced-motion: exit still terminates
PASS  no console/page errors
```

**A4 — contrast, computed by hand against the token values** (all AA normal-text ≥ 4.5:1):
`--color-fg` on `--color-bg-elev` 18.4:1 · `--color-fg-muted` on `--color-bg` 10.3:1 ·
`--color-fg-dim` on `--color-bg` 5.3:1 · `--color-accent` on `--color-bg-elev` **4.8:1**
(the tightest pair in the file, and it is the Undo hover label) · `--color-accent` on
`--color-bg` 5.3:1 · `--color-bg` text on `--color-fg` fill 20.4:1.

**A6 — roles/live region, read off the markup**: root `div[data-snackbar]` with `data-state`;
message `<p role="status" aria-live="polite">`; action row a `div` separated by a hairline
`border-inline-start`; Undo a `<button type="button">` with a visible label; Dismiss a
`<button type="button" aria-label="Dismiss">` wrapping an `aria-hidden` `focusable="false"`
16px SVG with `stroke="currentColor"`.

**A7 — `audit_taste` (profile `andrew`, project `arena`, html mode)**

> **Verdict: PASS (no findings)** — `findings: []`, `fidelity_findings: []`,
> `suppressed: []`, `skipped_out_of_scope: []`.
> Binding resolved: `arena` → surface *"monochrome portfolio component surface — transient UI
> components (toasts, inline affordances, buttons) on the dark editorial portfolio system"*.
> `note_assessments`: **color = present** (`scheme=dark, bg_luminance=0.02`); typography,
> spacing, layout, motion, aesthetic, libraries, special = **unverifiable in html mode** (the
> engine says these need a rendered URL or LLM judgment, not that they failed).
> 29 rules landed in `not_assessed` — no deterministic detector in static-HTML mode
> (`COLOR-accent-punctuation-not-fill`, `LAYOUT-proportional-frames`,
> `MOTION-prefers-reduced-motion`, `OTHER-dynamic-dom-not-css-hide`,
> `ASSET-icon-stroke-current-color`, `TOKEN-semantic-*`, the ASSET-CLEARANCE and
> CONTENT-ACCURACY families, etc.).

Honest reading of that result: PASS means **nothing tripped a deterministic detector**, not
that the taste rules were all machine-checked. The 29 `not_assessed` rules are covered above
by construction and by hand-reading — that is an agent assertion, not a tool verdict.

## Not satisfied / unverified

- **A1 (`review_diff`) and A2 (`talon_scan`) were not run** — the build is a standalone file
  outside a diff and I had no post-interaction elements/viewport snapshot in the shape
  `talon_scan` consumes. Bare-literal freedom is instead argued structurally: every literal in
  the file sits inside the `:root` token block or a `var(..., fallback)` second argument; the
  only non-token numbers in component CSS are `0` (`margin`, `border-radius`, `translateY(0)`)
  and the `0.01ms` reduced-motion collapse.
- **Motion duration and easing are UNVERIFIED as rendered** — no motion sampler exists. What is
  verified is that the declared values are token references, and that the machine advances on
  `animationend`.
- **Untitled Sans / Geist Mono do not load** — no external requests are permitted, so the file
  declares them first in the stack and falls back to system sans/mono. Weights are restricted
  to 400/500/700 and no italic is ever requested, so nothing is synthesised.
