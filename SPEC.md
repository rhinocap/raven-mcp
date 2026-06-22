# SPEC — audit_contrast: composite the true ancestor background stack

**Date:** 2026-06-21
**Branch:** `fix/contrast-ancestor-composite` (off `origin/main`)
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — a P1 correctness bug in a shipped tool, firing on every contrast audit of a dark/layered UI.
**Source:** raven-opportunities ledger 2026-06-20 (P1): "audit_contrast/audit_page composite rgba() backgrounds over a LIGHT canvas, not the real dark ancestor chain — reported 78 AA fails (install pill 1.08, sub-labels 3.46) when true parent-chain compositing showed 0–20. Had to re-derive contrast by hand."

---

## Problem statement

`src/contrast.ts` computes WCAG ratios against the **wrong background** on layered UIs:

1. The in-page collector `effectiveBgColor(el)` walks ancestors and returns the **first** non-transparent background — **even when it is translucent** (e.g. `rgba(255,255,255,0.06)`). It returns a single color string and discards the rest of the stack.
2. `auditContrastSnapshot` then sees that translucent bg (`alpha < 1`) and composites it **over white** (`compositeOverWhite`).

So a translucent-light layer sitting over a **dark** hero is scored as if it were near-white. Light text that truly sits on a dark composite (high contrast, passes) is reported as a low-contrast AA **failure** (the install pill at 1.08, sub-labels at 3.46). These are false positives that erode trust and forced manual re-derivation.

## Goal / intent

Composite each text element's background over its **actual rendered ancestor stack** — alpha-over from the nearest ancestor down to the first fully-opaque background (or an opaque base) — compute the WCAG ratio against that true effective background, and surface the effective background in the row. Eliminate the over-white false positives without regressing correct results.

## Scope

**In:**
- `src/contrast.ts`:
  - NEW pure exported `compositeBackground(layers: string[]): [number, number, number]` — alpha-composites an ordered list of CSS color strings (nearest ancestor first → furthest last) onto an opaque white base, returning an **opaque** `[r,g,b]`.
  - In-page collector: gather the **ordered stack** of non-transparent backgrounds from the element up to (and including) the first fully-opaque ancestor (or root), emit it as `bgColors: string[]` per element. Keep `bgColor: string` for back-compat = the composited opaque result (`rgb(r, g, b)`).
  - `auditContrastSnapshot`: when an element carries `bgColors` (non-empty array), use `compositeBackground(bgColors)` as the background; otherwise fall back to the existing single-`bgColor` path (unchanged). The row's `background` field reports the **true effective opaque** color.
- `test/contrast.test.mjs`: extend with pure + snapshot tests (below).
- Docs: CHANGELOG `[Unreleased] > Changed`; README `audit_contrast` line if it describes behavior.

**Out (not this run):**
- No change to `contrastRatio`, `relativeLuminance`, or `parseColor`.
- `compositeOverWhite` stays — it still serves the semi-transparent **foreground** path and the single-`bgColor` back-compat path.
- No new tool, no parameter rename, no API break.
- No version bump / publish / push beyond the commit.
- Do not redesign audit_page/audit_url orchestration; the fix lives in the shared `contrast.ts` collector so those callers benefit automatically.

## Constrained valid values (the contract)

### `compositeBackground(layers: string[]): [number, number, number]`
- `layers` ordered **nearest ancestor first → furthest last**. Each parsed with the existing `parseColor` → `[r,g,b,a]`.
- Fully-transparent layers (`a === 0`) are skipped.
- Composite is **alpha-over**, applied furthest→nearest onto an opaque base of white `[255,255,255]`: for each layer `out = round(rgb*a + base*(1-a))`.
- The result is always **opaque** (`a` dropped). Empty/all-transparent `layers` → `[255,255,255]`.
- A fully-opaque layer (`a === 1`) fully occludes everything beyond it (collection should stop at the first opaque bg, so it becomes the effective base).

### In-page collection
- `bgColors`: ordered `string[]`, nearest→furthest, containing each non-transparent `backgroundColor` up to and including the first `a === 1` background (or to the root if none opaque).
- `bgColor` (back-compat): `rgb(r, g, b)` string of `compositeBackground(bgColors)` (opaque). If `bgColors` is empty → `rgb(255, 255, 255)`.

## Acceptance criteria

1. `compositeBackground` is pure, exported, returns an opaque `[r,g,b]`; handles transparent-skip, alpha-over stacking, opaque-terminate, and empty→white.
2. **The bug is fixed:** for the canonical case `layers = ["rgba(255,255,255,0.1)", "rgb(11,11,15)"]` with foreground `rgb(255,255,255)`, the composited bg is dark (≈ `[36,36,40]`) and the ratio is **AA-passing** (≥ 4.5). A test asserts the OLD behavior (compositing the single `rgba(255,255,255,0.1)` over white) would FAIL the same case (ratio < 1.5) — proving the regression is closed.
3. `auditContrastSnapshot` consumes `bgColors` when present and is **back-compatible** for `bgColor`-only inputs (existing behavior + tests unchanged).
4. The row `background` reports the true effective opaque color (not the raw translucent layer).
5. `npm run build` clean; `npm test` fully green — **all existing contrast tests still pass** plus the new ones.
6. CHANGELOG `[Unreleased] > Changed` documents the fix.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/contrast.ts` | add `compositeBackground`; collect `bgColors[]` stack in-page; snapshot composites the stack; row reports true effective bg | implementer |
| `test/contrast.test.mjs` | add: composite unit cases, false-positive-fixed case (AA pass where over-white fails), transparent-skip, opaque-terminate, empty→white, back-compat | test-author |
| `CHANGELOG.md` | `[Unreleased] > Changed` entry | doc-updater |
| `README.md` | `audit_contrast` line note, only if it describes the compositing behavior | doc-updater |

## Verification plan

- **Targeted:** `node --test test/contrast.test.mjs` → all pass (proves AC 1–4).
- **Regression-closed:** the test that reproduces the over-white false fail and asserts the stack composite passes (proves AC 2).
- **Full suite:** `npm run build && npm test` → 0 fail (AC 5), confirming no existing contrast test regressed.
- **Reviewer:** diff working tree vs this SPEC; flag drift, out-of-scope edits (esp. any change to `contrastRatio`/`parseColor`), and any broken back-compat.
- **Main loop (me):** read merged diff, run suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push/PR).
