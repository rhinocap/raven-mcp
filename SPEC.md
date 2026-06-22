# SPEC — `audit_layout` orphan-stretch detection (lonely last-row card)

**Date:** 2026-06-22
**Branch:** `feat/layout-orphan-stretch` (off `origin/main` @ b51d570)
**Backlog source:** `.claude/raven-opportunities.md` — `2026-06-20 | grid orphan detector | Two separate grids (.tools-grid, .layers-grid) shipped flex:1 1 280px that stretches a lone last-row card full-width on wide screens. No audit flagged the lonely-stretched-orphan pattern. | audit_layout: detect flex/grid wrap rows where the final row has 1 item spanning >1.5× the modal card width (orphan stretch) and recommend fixed-column grid | P3`
**Backlog rank this run:** #1 by (impact × reach) ÷ effort among remaining items — the high-value/open-issue backlog is drained; this is a pure, deterministic, unit-testable extension to the EXISTING `audit_layout` tool (no new tool, no browser), catching a real layout defect that shipped on the user's site.

---

## Problem statement

A flex grid declared `flex: 1 1 280px` (or `grid` with `auto-fit`/`minmax`) wraps cards neatly until the **last row has a single item** — which then **stretches to fill the entire row width**, producing a lonely, oversized "orphan" card that looks broken on wide screens. This shipped on two real grids (`.tools-grid`, `.layers-grid`). `audit_layout` already ingests rendered element geometry (`{elements:[{selector,rect}], viewport}`) and scores alignment / gap-rhythm / optical-balance, but it has **no detector for the orphan-stretch pattern**, so the defect passed clean.

## Goal / intent

Add an **orphan-stretch detector** to `audit_layout`: from the element rects it already receives, identify a repeated "card" group (same width & height) and flag any same-height element whose width is ≥1.5× the modal card width (the stretched orphan), recommending a fixed-column grid. Implement as a NEW pure module so it is unit-testable in isolation; wire it into `audit_layout` as an **additive** result key (`orphan_stretch`) that does NOT change the existing `alignment`/`gap_rhythm`/`optical_balance` output.

## Scope

**In:**
- `src/layout-orphans.ts` — NEW pure module: `detectOrphanStretch(elements, opts?) → OrphanStretchResult`.
- `src/index.ts` — call it inside the `audit_layout` handler (the branch that already has `elements`+`viewport`) and add the `orphan_stretch` key to the returned JSON. No change to the snippet branch, no change to existing metric computations.
- `test/layout-orphans.test.mjs` — NEW deterministic unit tests (synthetic rects; no browser).
- Docs: `CHANGELOG.md` `[Unreleased] > Added`; `README.md` (`audit_layout` description mentions orphan-stretch).

**Out (not this run):**
- No NEW tool registration (extends `audit_layout`).
- No change to alignment/gap-rhythm/optical-balance logic, the DevTools snippet, or any other tool.
- No browser/render path (operates on supplied rects).
- No tool-count change (still 56 on this base; no new tool).
- No version bump / publish / push.

## Constrained valid values (the contract)

### Input element shape (already produced by the audit_layout DevTools snippet):
`elements: Array<{ selector: string, rect: { x:number, y:number, w:number, h:number }, computed?: {...} }>`. The detector uses only `selector` + `rect`.

### Detection algorithm (deterministic):
1. **Card group:** find the modal **width cluster** among all rects — group widths within ±12% of a representative; the largest group with **count ≥ 3** is the card group. Its representative width = **W** (median of the group), representative height = **H** (median height of that same group). If no width cluster has count ≥ 3 → **no card grid** → no finding (return `has_orphan:false`, empty `orphans`).
2. **Card height band:** define H-band = H ±15%.
3. **Orphan:** any element whose **height is within the H-band** AND whose **width ≥ `widthRatio` × W** (default `widthRatio = 1.5`) is an orphan-stretch candidate. (Same height as the cards, but stretched much wider — the flex-orphan signature.) Exclude elements that ARE in the card group (width within ±12% of W).
4. Sort orphans by `rect.y` descending (last-row orphan first). Each orphan: `{ selector, width, height, card_width: W, ratio: round(width/W, 2), row_y: rect.y }`.

### `widthRatio` valid range: a positive number > 1; default **1.5**. (Threaded from `opts.widthRatio`; the tool does not expose it as a param this run — fixed at 1.5.)

### `OrphanStretchResult` shape (the contract the test asserts):
```ts
{
  has_orphan: boolean,
  card_width: number | null,   // W, or null when no card grid detected
  card_height: number | null,  // H, or null
  card_count: number,          // size of the detected card group (0 if none)
  orphans: Array<{ selector: string, width: number, height: number, card_width: number, ratio: number, row_y: number }>,
  issues: Array<{ severity: "warning", rule: "layout/orphan-stretch", message: string, fix: string }>  // one issue per orphan; empty when none
}
```
- Issue `message`: names the selector, its width, and W (e.g. `"<selector> spans 880px — 3.1× the 280px card width (lonely last-row orphan)."`).
- Issue `fix`: recommend a fixed-column grid / `max-width` on items so a lone last-row card keeps the card width instead of stretching (e.g. `"Use grid-template-columns: repeat(auto-fill, 280px) (auto-FILL, not auto-fit) or cap item max-width:280px so a lone final-row card stays card-width."`).

### audit_layout result integration:
The existing returned object (with `alignment`, `gap_rhythm`, `optical_balance`, …) gains one key `orphan_stretch: OrphanStretchResult`. All existing keys/values are byte-identical to before for the same input.

## Acceptance criteria

1. `src/layout-orphans.ts` exports a **pure** `detectOrphanStretch(elements, opts?)` (no I/O/browser); does not import or modify page-checks/audit-container/any tool logic.
2. **Card grid + orphan fixture:** 3 cards at `w:280,h:200` in a row + 1 element at `w:880,h:200` below → `has_orphan:true`, `card_width:280`, `card_count:3`, exactly one orphan (the 880 element) with `ratio` ≈ 3.14, one `layout/orphan-stretch` issue.
3. **No-orphan fixture:** 4 cards all `w:280,h:200` (a full last row) → `has_orphan:false`, `orphans:[]`, `issues:[]`, but `card_width:280`/`card_count:4` reported.
4. **No-grid fixture:** fewer than 3 same-width elements (e.g. a heading + 2 differently-sized blocks) → `has_orphan:false`, `card_width:null`, `card_count:0`, no issues (does NOT false-positive on arbitrary wide elements).
5. **Height-band guard:** an element that is wider than 1.5×W but a DIFFERENT height than the cards (e.g. a full-width footer `w:1200,h:80` under `h:200` cards) is NOT flagged (different height ⇒ not a stretched card).
6. **widthRatio threshold:** an element at exactly `1.49×W` same height is NOT an orphan; at `1.5×W` it IS (boundary uses `>=`). Cards themselves (width ≈ W) are never orphans.
7. `audit_layout` returns the new `orphan_stretch` key when called with `{elements, viewport}`; the existing `alignment`/`gap_rhythm`/`optical_balance` keys and values are unchanged for the same input (additive only); the no-args snippet branch is unchanged.
8. `npm run build` clean; `npm test` fully green (existing suite + new `layout-orphans.test.mjs`).
9. `CHANGELOG.md` `[Unreleased] > Added` documents the orphan-stretch detection; `README.md`'s `audit_layout` line mentions it.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/layout-orphans.ts` | NEW — `detectOrphanStretch()` pure detector | implementer |
| `src/index.ts` | import + call in `audit_layout` handler; add `orphan_stretch` result key (additive) | implementer |
| `test/layout-orphans.test.mjs` | NEW — deterministic unit tests for AC 1–6 | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry | doc-updater |
| `README.md` | extend the `audit_layout` description to mention orphan-stretch | doc-updater |

## Verification plan

- **Unit:** `node --test test/layout-orphans.test.mjs` → all pass (proves AC 1–6) with synthetic rects (card-grid+orphan, full-last-row, no-grid, height-band guard, ratio boundary).
- **Integration/eyes-on:** main loop calls the `audit_layout` handler logic (or `detectOrphanStretch` directly) on a synthetic `.tools-grid`-style rect set and reads the JSON to confirm the orphan is flagged AND the existing alignment/gap/balance keys still appear unchanged.
- **Full suite:** `npm run build && npm test` → 0 fail (AC 8), confirming no regression to audit_layout's existing metrics.
- **Reviewer:** diff vs this SPEC; flag any change to the existing audit_layout metric math or snippet, the detector firing on non-grids / different-height wide elements (false positives), threshold drift, or out-of-scope edits.
- **Main loop (me):** read the result, run the suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push).
