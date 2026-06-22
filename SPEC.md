# SPEC — dropdown-menu pattern (closes GitHub #1)

**Date:** 2026-06-21
**Branch:** `feat/dropdown-menu-pattern` (off `origin/main`)
**Closes:** GitHub issue #1 (`knowledge-request`, open since 2026-04-19)
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — closes a long-open, fully-specified user issue; low effort (one auto-loaded JSON, no code change); broad reach (dropdowns/selects/menus are a core UI pattern the library currently lacks); deterministic verification.

---

## Problem statement

Raven's pattern library (`src/data/patterns/*.json`, surfaced via `get_pattern`, `search_knowledge`, `get_checklist`) has **no coverage of dropdown / select menus** — one of the most common interactive components. Issue #1 requests a `dropdown-menu.json` pattern covering keyboard nav, focus management, ARIA semantics, mobile behavior, visual specifics, and do/don't lists grounded in NN/g, Baymard, and the WAI-ARIA Authoring Practices Guide.

## Goal / intent

Author `src/data/patterns/dropdown-menu.json` to the existing pattern schema so dropdown/select/menu guidance becomes first-class and queryable. The loader (`loadJsonDir(PATTERNS_DIR)`, `src/index.ts:136`) auto-discovers it — **no code change**. Content must be accurate (correct ARIA role distinctions, real keyboard-interaction conventions) and grounded in cited sources without fabricating precise statistics.

## Scope

**In:**
- `src/data/patterns/dropdown-menu.json` — NEW pattern file (one pattern object with sub-patterns).
- `test/patterns-data.test.mjs` — NEW data-integrity test (schema, load, dropdown-menu present, no-dup-id, topic coverage).
- Docs: CHANGELOG `[Unreleased] > Added`; README patterns line mentions dropdown/menu.

**Out (not this run):**
- No `index.ts`/loader change (auto-discovered).
- No new audit rule, no other pattern file edited.
- No version bump / publish / push.

## Constrained valid values (the contract)

### Pattern object schema (MUST match existing `src/data/patterns/*.json`, e.g. `modals-dialogs.json`)
Top-level object (NOT an array — pattern files are a single object) with exactly these keys, all present and non-empty:
- `id` (string, kebab-case) — MUST be `"dropdown-menu"`
- `name` (string) — e.g. `"Dropdown and Select Menus"`
- `category` (string) — use `"usability"` (matches modals-dialogs/navigation)
- `summary` (string, one sentence)
- `principles_referenced` (string[], ≥3) — reference real principle ids where possible (e.g. `recognition-rather-than-recall`, `consistency-and-standards`, `user-control-freedom`, `flexibility-efficiency`); non-resolving ids are non-fatal (used for search text) but prefer real ones.
- `patterns` (array, ≥5 objects) — each object has: `name` (string), `description` (string), `do` (string[], ≥4), `dont` (string[], ≥4), `evidence` (string, non-empty).
- `checklist` (string[], ≥10) — actionable yes/no pre-ship items.

### Required topic coverage (from issue #1) — must be substantively addressed across `patterns[]` / `checklist`
1. **Keyboard navigation** — arrow keys to move, type-ahead to jump, Escape to close, Tab/Shift-Tab to move focus out, Enter/Space to select/open.
2. **Focus management** — on open (first/selected item vs trigger-retained) and on close (return focus to trigger).
3. **ARIA semantics** — the distinction between `role="listbox"` (single/multi select of values), `role="menu"`/`menuitem` (action commands), and `role="combobox"` (text input + popup), and **when to use each** (selecting a value → listbox/combobox; firing a command → menu).
4. **Mobile touch** — native `<select>` vs custom; when a bottom-sheet overlay beats an inline dropdown.
5. **Visual** — min-width matching the trigger, max-height with internal scroll, a selected-item indicator, hover vs active/focus states.
6. **Evidence/do-don't** — cite NN/g, Baymard, and/or WAI-ARIA APG. Use directional/qualitative findings; do NOT invent precise percentages that can't be attributed.

### Suggested `patterns[]` decomposition (author may refine, must keep ≥5 and cover all 6 topics)
- "Select menu (choosing a value)" — listbox/combobox semantics, selected indicator, min-width.
- "Action menu (commands)" — menu/menuitem semantics, not for value selection.
- "Keyboard interaction & type-ahead" — full key map.
- "Focus management" — open/close focus rules, focus trap vs roving tabindex.
- "Mobile dropdowns" — native select vs custom vs bottom sheet.
- "Overflow & sizing" — max-height/scroll, min-width match, placement/flip.

## Acceptance criteria

1. `src/data/patterns/dropdown-menu.json` exists and is **valid JSON** (a single object, not an array) parseable by `JSON.parse`.
2. Schema: all keys above present & non-empty; `patterns` has ≥5 entries each with `name`/`description`/non-empty `do[]`(≥4)/`dont[]`(≥4)/`evidence`; `checklist` has ≥10 items; `principles_referenced` ≥3.
3. `id === "dropdown-menu"`; no duplicate `id` across `src/data/patterns/*.json`.
4. **Topic coverage (drift/quality guard):** the concatenated text of the file contains evidence of every required topic — case-insensitive matches for: `listbox`, `menu`, `combobox`, `type-ahead` (or `typeahead`/`type ahead`), `escape`, `bottom sheet` (or `bottom-sheet`), `max-height` (or `max height`), and `currentColor`-free (n/a). Concretely the test asserts presence of: `/listbox/i`, `/role="?menu/i` or `/\bmenu(item)?\b/i`, `/combobox/i`, `/type[- ]?ahead/i`, `/escape/i`, `/bottom[- ]?sheet/i`, `/max-?height/i`, `/native\s+(<)?select/i`.
5. The pattern is reachable through the live loader: after `npm run build`, a `search_knowledge`-style scan / `allPatterns` load includes a pattern with `id === "dropdown-menu"` (verified by reading the file the loader reads + asserting it parses; if `allPatterns` is exported/importable, assert membership, else assert the file is in `PATTERNS_DIR` and valid).
6. Content accuracy: ARIA section correctly distinguishes listbox vs menu vs combobox and says when to use each (the test checks all three role terms co-occur; reviewer checks correctness).
7. `npm run build` clean; `npm test` fully green — existing suite + new `patterns-data.test.mjs`.
8. CHANGELOG `[Unreleased] > Added` documents the pattern (mention "Closes #1"); README patterns line mentions dropdown/select menus.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/data/patterns/dropdown-menu.json` | NEW — dropdown/select/menu pattern, ≥5 sub-patterns, ≥10 checklist, all 6 topics | implementer |
| `test/patterns-data.test.mjs` | NEW — schema + load + no-dup-id + topic-coverage tests over `src/data/patterns/*.json` | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry (Closes #1) | doc-updater |
| `README.md` | extend the patterns bullet to name dropdown/select menus | doc-updater |

## Verification plan

- **Schema/load/coverage:** `node --test test/patterns-data.test.mjs` → all pass (proves AC 1–6).
- **Full suite:** `npm run build && npm test` → 0 fail (AC 7), confirming the new file loads cleanly with the others (a malformed JSON would be silently skipped by `loadJsonDir`, so the test parses it explicitly to catch that).
- **Reviewer:** diff vs SPEC; flag schema drift, missing topic coverage, ARIA inaccuracy (listbox vs menu vs combobox misuse), fabricated statistics, or any out-of-scope edit (no code/loader/other-pattern change).
- **Main loop (me):** read the file, run the suite, parallel-instance collision re-check, then commit referencing SPEC.md + "Closes #1" (no push). Post-v1.12.0 `[Unreleased]` item.
