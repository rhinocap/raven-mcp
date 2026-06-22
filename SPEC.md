# SPEC — `score_page` tool (per-category design scoring)

**Date:** 2026-06-21
**Branch:** `feat/score-page` (off `origin/main` @ b51d570)
**Backlog source:** `.claude/raven-opportunities.md` — `2026-06-21 | missing capability | no Raven tool produces a per-category "award" SCORE for a full page … add a score_page/score_design tool that returns 0-10 per design category … | **P1**`
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — P1, broadest reach (every page audit), low effort (pure function reusing `runPageChecks` output, no browser), fully deterministic + unit-testable, no collision with the 5 parked branches.

---

## Problem statement

`audit_page` already returns a flat overall score (0–100 + A–D grade) plus a list of passes/errors/warnings, but it does **not** break that score down per design category. A caller who wants "how is this page doing on typography vs accessibility vs spacing?" has to bucket the raw `fix_priority` rule strings by hand. There is no Raven tool that emits a per-category 0–10 design score for a full page (`evaluate_design` is a 129-principle checklist, not a scorer; `score_creative` scores ad copy only). This was logged P1.

## Goal / intent

Add a new MCP tool **`score_page`** that consumes a block of HTML/CSS and returns a **per-category 0–10 score** derived deterministically from the existing `runPageChecks` rule engine — plus the same overall 0–100/grade `audit_page` produces, the weakest category, and an honest list of categories Raven does **not** mechanically assess. Reuse `runPageChecks` verbatim; **do not modify `src/page-checks.ts`** (it is shared by `audit_page` + `audit_url` and must not regress).

## Scope

**In:**
- `src/score-page.ts` — NEW pure module: `scorePage(html, opts?) → ScorePageResult`.
- `src/index.ts` — register the `score_page` tool (import, Zod input schema, handler, tool description). Tool count 56 → 57.
- `test/score-page.test.mjs` — NEW deterministic unit tests against the acceptance criteria (no browser).
- Docs: `CHANGELOG.md` `[Unreleased] > Added`; `README.md` tool list + count.

**Out (not this run):**
- No change to `src/page-checks.ts`, `audit_page`, `audit_url`, or any other tool.
- No new rule/check (scores derive only from existing checks).
- No browser/render path (pure HTML-string analysis).
- No version bump / publish / push. Joins `feat/svg-color-compliance` + `feat/dropdown-menu-pattern` as a post-v1.12.0 `[Unreleased]` item.

## Constrained valid values (the contract)

### Category enum — EXACTLY these 7 assessed categories (the tagged rule namespaces `runPageChecks` emits), in this canonical order:
`structure`, `typography`, `color`, `spacing`, `a11y`, `responsive`, `tokens`

Display labels (1:1):
- `structure` → "Structure"
- `typography` → "Typography"
- `color` → "Color & palette"
- `spacing` → "Spacing & rhythm"
- `a11y` → "Accessibility"
- `responsive` → "Responsive layout"
- `tokens` → "Design tokens"

A category's issues are those whose `issue.rule` starts with `"<category>/"`.

### Not-assessed enum — EXACTLY these 3 (named in the ledger, no mechanical signal exists):
`brand`, `conversion`, `motion` — surfaced with a note steering callers to `evaluate_design` / `score_creative`. These carry NO numeric score.

### Per-category score formula (deterministic):
```
penalty = (errors_in_category × 4) + (warnings_in_category × 2)
score   = clamp(10 − penalty, 0, 10)   // integer
```
Truth table (must hold): 0 issues → 10; 1 warning → 8; 1 error → 6; 1 error+1 warning → 4; 2 errors → 2; 3+ errors → 0.

### Overall (mirrors `audit_page` exactly — reuse the same arithmetic):
```
totalChecks = passes.length + issues.length
failCount   = strict ? issues.length : errors.length   // strict default false
score       = totalChecks > 0 ? round((totalChecks − failCount) / totalChecks × 100) : 100
grade       = failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D"
```

### Tool input (Zod), mirroring `audit_page`:
- `html` (string, required, non-empty)
- `strict` (boolean, optional, default false) — count warnings as failures in the overall score
- `containerMaxWidth` (number, optional) — forwarded to `runPageChecks` for the `responsive/max-width` check

### `ScorePageResult` shape (the contract the test asserts):
```ts
{
  overall: { score: number /*0-100*/, grade: "A"|"B"|"C"|"D", summary: string },
  categories: Array<{            // length === 7, canonical order above
    category: string,            // one of the 7 enum keys
    label: string,               // matching display label
    score: number,               // integer 0-10
    errors: number,
    warnings: number,
    rationale: string            // one line; e.g. "2 errors, 1 warning" or "all checks passed"
  }>,
  weakest_category: string,      // category key with the lowest score (ties → first in canonical order)
  not_assessed: { categories: string[] /* exactly ["brand","conversion","motion"] */, note: string }
}
```

## Acceptance criteria

1. `src/score-page.ts` exports a pure `scorePage(html: string, opts?: { strict?: boolean; containerMaxWidth?: number }): ScorePageResult`; no I/O, no browser, no `page-checks.ts` edit.
2. `categories` always has **exactly 7** entries in the canonical order, each with all keys present and `score` an integer in `[0,10]`.
3. Per-category score obeys the penalty formula + truth table above.
4. `overall.score`/`overall.grade` for a given `html`+`strict` are **byte-identical** to what `audit_page` computes for the same input (verified by computing both in the test from `runPageChecks`).
5. `weakest_category` equals the category with the minimum score (first in canonical order on ties).
6. `not_assessed.categories` deep-equals `["brand","conversion","motion"]`.
7. A clean HTML fixture (no issues) → every category score 10, grade "A". An HTML fixture with a known a11y error (img missing alt) AND a known typography error (font < 13px) → `a11y` and `typography` scores drop per the formula while unrelated categories stay 10.
8. `score_page` is registered in `src/index.ts` (importable tool), tool count 56 → 57; the handler returns the `ScorePageResult` as JSON text.
9. `npm run build` clean; `npm test` fully green (existing suite + new `score-page.test.mjs`).
10. `CHANGELOG.md` `[Unreleased] > Added` documents `score_page`; `README.md` lists it and bumps the count to 57.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/score-page.ts` | NEW — `scorePage()` pure module reusing `runPageChecks` | implementer |
| `src/index.ts` | register `score_page` tool (import, Zod schema, handler, description); count 56→57 | implementer |
| `test/score-page.test.mjs` | NEW — deterministic unit tests for AC 1–8 (no browser, no skip-guard exit pitfalls) | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry for `score_page` | doc-updater |
| `README.md` | add `score_page` to tool list; bump tool count to 57 | doc-updater |

## Verification plan

- **Unit:** `node --test test/score-page.test.mjs` → all pass (proves AC 1–8). Test imports `dist/score-page.js` (after build) and also `dist/page-checks.js` to cross-check AC 4; assert exactly-7 categories, the penalty truth table, weakest-category, not_assessed deep-equal, and the clean/dirty fixtures.
- **Full suite:** `npm run build && npm test` → 0 fail (AC 9), confirming no regression to audit_page/audit_url (page-checks.ts untouched).
- **Eyes-on:** main loop calls `scorePage` on a real fixture and reads the JSON to confirm scores are sane (not just that it ran).
- **Reviewer:** diff vs this SPEC; flag any `page-checks.ts` edit (out of scope), category-count/order drift, formula drift, missing AC, or overall-score divergence from audit_page.
- **Main loop (me):** read the result, run the suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push).
