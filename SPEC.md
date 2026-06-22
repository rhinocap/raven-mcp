# SPEC — suggest_contrast_fix: minimal WCAG-passing color remediation

**Date:** 2026-06-21
**Branch:** `feat/contrast-remediation` (off `origin/main`)
**Backlog rank this run:** #1 by (impact × reach) ÷ effort. Natural follow-on to this session's contrast compositing fix — and unlike the other P1 contender (score_page), it has **objective WCAG ground truth**, so acceptance criteria are deterministic, not a self-defined rubric.
**Source:** raven-opportunities ledger 2026-06-20 (P2): "No tool to find the MINIMAL token lift that clears AA across every surface a token touches — I brute-forced candidate greys live in the browser. → audit_contrast 'remediation mode': given a failing fg token + its surfaces, return the minimal passing value (and/or suggest darkening the chip bg) with margin."

---

## Problem statement

`audit_contrast` reports *which* text fails WCAG and the delta-to-pass, but not *what value to use instead*. When a foreground token fails against one or more surfaces, the designer currently brute-forces candidate colors by hand in the browser until the ratio clears. There is no tool that, given a failing fg/bg pair and a target level, returns the **minimal color change** that reaches the target ratio.

## Goal / intent

Add a pure, deterministic remediation helper + a thin MCP tool that, for each failing `{fg, bg}` pair, returns the **smallest adjustment** to the foreground (and, as an alternative, to the background) that meets the WCAG target ratio — with the achieved ratio and margin. Ground truth is the existing `contrastRatio`/`relativeLuminance` math, so every result is objectively verifiable.

## Scope

**In:**
- **`src/contrast.ts`** — NEW pure exported `suggestContrastFix(fg, bg, opts?)`. Reuses existing `parseColor`, `relativeLuminance`, `contrastRatio`. No change to any existing function.
- **`src/index.ts`** — NEW tool `suggest_contrast_fix` (takes an array of pairs, returns per-pair fixes + a summary). Tool count 56 → 57.
- **`test/contrast.test.mjs`** — extend with `suggestContrastFix` cases (deterministic).
- **Docs:** README tool list + CHANGELOG `[Unreleased] > Added`.

**Out (not this run):**
- No change to `audit_contrast` itself, the contrast math, or any other tool.
- No marketing-site edit (the separate marketing-site-sync loop owns the 56→57 site bump).
- No version bump / publish / push beyond the commit.
- No multi-surface solver across N backgrounds in one call beyond what falls out of calling per pair (the tool accepts many pairs; "minimal lift across every surface a token touches" is the caller feeding all that token's failing pairs and taking the darkest/lightest returned fg — documented, not a new solver this run).

## Constrained valid values (the contract)

### `suggestContrastFix(fg: string, bg: string, opts?): SuggestContrastFix`
- `fg`, `bg`: any CSS color string `parseColor` accepts. Both are reduced to opaque before solving: if `fg` alpha < 1, composite `fg` over `bg`; if `bg` alpha < 1, composite `bg` over white. Reuse `parseColor`.
- `opts.targetRatio?: number` — explicit target; when set, overrides the level/size-derived target.
- `opts.level?: "AA" | "AAA"` — default `"AA"`.
- `opts.fontPx?: number`, `opts.bold?: boolean` — used only to pick the large-text threshold when `targetRatio` is not given.
- **Target derivation** (when `targetRatio` absent): text is "large" if `fontPx >= 24` OR (`fontPx >= 18.66` AND `bold`). Targets: AA → large `3.0`, normal `4.5`; AAA → large `4.5`, normal `7.0`.

Return shape (`SuggestContrastFix`):
```
{
  fg: string,                 // normalized opaque "rgb(r, g, b)"
  bg: string,                 // normalized opaque "rgb(r, g, b)"
  currentRatio: number,       // rounded to 2 decimals
  targetRatio: number,
  passes: boolean,            // currentRatio >= targetRatio (already OK)
  fgFix: {                    // present only when !passes
    color: string,            // "rgb(r, g, b)", minimal fg change reaching target
    ratio: number,            // achieved ratio (>= targetRatio when reachable), 2 dp
    direction: "lighter" | "darker"
  } | null,
  bgFix: {                    // present only when !passes
    color: string,
    ratio: number,
    direction: "lighter" | "darker"
  } | null,
  reachable: boolean,         // true if a fix reaching target exists (else best-effort returned)
  recommendation: string
}
```

### Algorithm (deterministic)
- Compute `currentRatio`. If `>= targetRatio` → `passes:true`, `fgFix:null`, `bgFix:null`, `reachable:true`, recommendation "already passes".
- Otherwise, to increase contrast, move the adjusted channel toward the pole whose contrast against the fixed color is larger:
  - `fgFix`: choose the pole (`[0,0,0]` or `[255,255,255]`) whose `contrastRatio(pole, bg)` is larger; `direction` = "darker" for black pole, "lighter" for white pole. Binary-search the sRGB interpolation `t∈[0,1]` from `fg`→pole for the **smallest `t`** whose rounded color yields `contrastRatio >= targetRatio` (≥ ~20 iterations, then round to int RGB and, if rounding dipped below target, step one unit further toward the pole). If even the pole < target → `reachable:false`, return the pole as best-effort.
  - `bgFix`: same procedure adjusting `bg` toward its best pole with `fg` fixed.
- `recommendation`: prefer whichever fix is smaller in perceptual change (smaller RGB-space distance from original); mention the other as the alternative; if `!reachable`, say the pair cannot reach the target by adjusting one color alone and give the best achievable ratio.
- **Purity:** no mutation of inputs; no I/O.

### Tool `suggest_contrast_fix`
- Input: `{ pairs: Array<{ selector?: string, fg: string, bg: string, fontPx?: number, bold?: boolean, targetRatio?: number }>, level?: "AA"|"AAA" }`.
- Output JSON: `{ tool: "suggest_contrast_fix", level, results: Array<{ selector?, ...SuggestContrastFix }>, summary }`. `summary` counts pairs already-passing / fixed / unreachable.
- Empty/missing `pairs` → a usage message describing the shape (mirror how audit_contrast handles missing input).

## Acceptance criteria

1. `suggestContrastFix` is pure, exported, reuses existing contrast math, mutates nothing.
2. **Already-passing** pair (e.g. `#000` on `#fff`) → `passes:true`, `fgFix===null`, `bgFix===null`.
3. **Fix actually passes:** for a failing pair (e.g. `fg=rgb(150,150,150)` on `bg=rgb(255,255,255)`, AA normal target 4.5), `fgFix.color` satisfies `contrastRatio(parse(fgFix.color), bg) >= 4.5` and `fgFix.ratio >= 4.5`.
4. **Minimality (within rounding):** a color one step *less* adjusted than `fgFix.color` (one RGB unit back toward the original fg along the pole direction) yields `contrastRatio < targetRatio`. (Tolerance: assert the fix is within 2 RGB units of the true minimum.)
5. **Direction correctness:** dark bg → `fgFix.direction==="lighter"`; light bg → `fgFix.direction==="darker"`.
6. **Target derivation:** large text (fontPx 24) uses 3.0 under AA; AAA normal uses 7.0; explicit `targetRatio` overrides both.
7. **Unreachable:** a pair where neither pole reaches target (e.g. target 21 on a mid-gray bg) → `reachable:false` with a best-effort fgFix at the pole and a clear recommendation; never throws.
8. **Tool** returns one result per input pair with the `selector` echoed, plus a correct `summary` count; empty pairs → usage message.
9. `npm run build` clean; `npm test` fully green — all existing contrast/other tests still pass plus the new ones.
10. CHANGELOG `[Unreleased] > Added` + README document the new tool.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/contrast.ts` | add `SuggestContrastFix` type + pure `suggestContrastFix(fg,bg,opts?)`; reuse parseColor/relativeLuminance/contrastRatio; no existing fn changed | implementer |
| `src/index.ts` | add `suggest_contrast_fix` tool (array of pairs → per-pair fixes + summary); import from `./contrast.js` | implementer |
| `test/contrast.test.mjs` | add: already-passing, fix-passes, minimality, direction, target-derivation, unreachable, no-mutation | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry | doc-updater |
| `README.md` | new tool line; bump tool count if README states one | doc-updater |

## Verification plan

- **Targeted:** `node --test test/contrast.test.mjs` → all pass (proves AC 1–7).
- **Ground-truth assertions:** every "fix" test recomputes `contrastRatio` on the returned color and asserts `>= target` (objective, not self-defined) — AC 3; minimality via one-step-back failing — AC 4.
- **Full suite:** `npm run build && npm test` → 0 fail (AC 9); confirms no existing contrast test regressed (existing functions untouched).
- **Reviewer:** diff vs this SPEC; flag any change to existing contrast functions, any non-pure helper, any returned fix that does NOT actually clear the target, missing direction/unreachable handling.
- **Main loop (me):** read merged diff, run suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push/PR).
