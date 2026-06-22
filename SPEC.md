# SPEC — Palette-size & spacing-scale discipline principles

**Date:** 2026-06-21
**Branch:** `knowledge/palette-spacing-principles` (off `origin/main`)
**Closes:** GitHub issues #3, #4, #7, #8, #11, #12, #13, #14, #19 (nine open `knowledge-request` issues)
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — two knowledge files close up to nine issues that have recurred monthly since 2026-04-19.

---

## Problem statement

Raven's weekly self-audit repeatedly fires three rules on Raven's own generated demos:

- `color/palette-size` — pages ship 11+ distinct hex colors (hierarchy breaks down past ~10).
- `spacing/base-unit` — only ~80% of spacing values sit on a 4/8px grid.
- `spacing/scale-count` — pages use 15–19 unique spacing values (rhythm breaks down past ~7).

The **audit rules already exist and fire** (`src/page-checks.ts`). What is missing is the **principle knowledge** that `get_principles`, `search_knowledge`, and `evaluate_design` surface — so the generator/planner can reference the discipline, and findings can be grounded. Each auto-filed issue explicitly requests a principle file under `src/data/principles/`. Because the knowledge does not exist, the self-audit re-files the same request every cycle (six palette issues, three spacing issues).

## Goal / intent

Add two principle JSON files to the knowledge base so palette-size and spacing-scale discipline become first-class, queryable principles whose guidance **exactly matches the thresholds the audit rules enforce**. No new audit rules; no code changes needed (loader auto-discovers files).

## Scope

**In:**
- `src/data/principles/color-systems.json` — palette-size + role-based color discipline (1 principle).
- `src/data/principles/spacing-systems.json` — spacing base-unit + limited-scale discipline (2 principles).
- A data-integrity test that validates both files (schema, load, threshold alignment).
- Docs: CHANGELOG `[Unreleased]`, README principle line, `get_principles` category enumeration in the tool description.

**Out (explicitly not this run):**
- No new audit rules or changes to `src/page-checks.ts` logic.
- No `index.ts` loader changes (it already auto-loads every `.json` in the dir via `loadJsonDir`).
- No demo-page regeneration, no fixing the demos that trip the rules.
- No version bump / npm publish / push / PR (commit only).

## Reuse note

Adapt the high-quality draft principle text already authored on the stale branches `origin/knowledge/issue-13-*` (`spacing-systems.json`) and `origin/knowledge/issue-14-*` (`color-palette-discipline.json`) — do **not** reinvent the prose. Reconcile to the final filenames/categories/thresholds below.

## Constrained valid values (the contract)

### Principle object schema (must match existing `src/data/principles/*.json`)
Every principle object MUST have exactly these keys, all present and non-empty:
- `id` (string, kebab-case)
- `name` (string)
- `category` (string — see below)
- `summary` (string, one sentence)
- `description` (string, paragraph)
- `implications` (string[], ≥4 items)
- `violations` (string[], ≥3 items)
- `applies_to` (string[], ≥3 items)
- `sources` (string[], ≥1 item)

### File 1 — `src/data/principles/color-systems.json`
JSON array with **one** principle:
- `id`: `"color-palette-discipline"`
- `category`: `"color-systems"`
- Threshold alignment (MUST appear verbatim-as-numbers in `summary`/`description`/`implications`):
  - Page-level cap: **≤10 distinct colors** (matches `color/palette-size`: passes when `uniqueHex.length <= 10`). Target ~6–8 core + neutrals.
  - Role-based token set to name explicitly (satisfies #4/#8): `surface`, `surface-raised`, `border`, `text`, `text-muted`, `accent`, `accent-hover`, `success`, `warning`, `danger`.
  - Variation via opacity/alpha/HSL shifts, NOT new hues; near-duplicate hexes still count.
- `applies_to` MUST include: `"color"`, `"design-tokens"`, `"design-system"`, `"visual-hierarchy"`.

### File 2 — `src/data/principles/spacing-systems.json`
JSON array with **two** principles:
- Principle A: `id`: `"spacing-base-unit"`, `category`: `"spacing-systems"`
  - Threshold: every margin/padding/gap is a **multiple of 8px (4px half-step)** (matches `spacing/base-unit`: ≥90% on a 4 or 8px grid). Off-grid offenders to name: 6, 10, 14, 18, 36, 80, 120px.
- Principle B: `id`: `"spacing-scale-count"`, `category`: `"spacing-systems"`
  - Threshold: expose a **≤7-token scale** (matches `spacing/scale-count`: passes when `uniqueSpacings.length <= 7`); recommend the 5–7 token scale `4, 8, 12, 16, 24, 32, 48`.
- `applies_to` for both MUST include: `"spacing"`, `"design-tokens"`, `"layout"`.

### Allowed new `category` values
`"color-systems"`, `"spacing-systems"` — these are net-new categories. The `get_principles` tool-description category enumeration MUST be updated to list them.

## Acceptance criteria

1. Both files exist at the paths above and are **valid JSON arrays** (loader silently skips invalid JSON — so a malformed file is a silent failure; the test must catch it).
2. Every principle object has all 9 required keys, non-empty, with array fields meeting the minimum counts above.
3. `id`s and `category`s exactly match the contract; no duplicate `id` across the whole `principles/` dir.
4. **Threshold alignment:** the palette principle text contains "10"; the spacing-scale principle text contains "7"; the base-unit principle references "8" and "4". (Guards principle↔rule drift.)
5. The new principles are reachable through the live loader: a `get_principles`-style query for `"color palette"` returns `color-palette-discipline`, and one for `"spacing scale"` returns the two spacing principles (verify via `allPrinciples` load path / built `dist`).
6. `npm run build` clean; `npm test` fully green (existing 191 tests + new ones).
7. CHANGELOG `[Unreleased]` documents both files; README principle line mentions palette/spacing discipline; `get_principles` category list updated.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/data/principles/color-systems.json` | NEW — 1 principle (adapt issue-14 draft) | implementer |
| `src/data/principles/spacing-systems.json` | NEW — 2 principles (adapt issue-13 draft) | implementer |
| `test/principles-data.test.mjs` | NEW — schema + load + threshold-alignment + no-dup-id tests | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry for both files | doc-updater |
| `README.md` | extend the principles line (~L13) to name palette/spacing discipline | doc-updater |
| `src/index.ts` | `get_principles` `category` description: append `color-systems, spacing-systems` (description string only — no logic change) | doc-updater |

## Verification plan

- **Schema/load/threshold:** `node --test test/principles-data.test.mjs` → all pass (proves AC 1–5).
- **Drift guard:** test asserts the principle text carries the same numeric thresholds the audit rule enforces (proves AC 4).
- **Full suite:** `npm run build && npm test` → 0 fail (proves AC 6).
- **Reviewer:** diff working tree against this SPEC, flag any drift (filenames, ids, categories, thresholds, out-of-scope edits).
- **Main loop (me):** read the merged diff, run the suite, do the parallel-instance collision re-check, then commit (no push).
