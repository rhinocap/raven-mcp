# SPEC — SVG icon-color compliance check (tokens/svg-hardcoded-color)

**Date:** 2026-06-21
**Branch:** `feat/svg-color-compliance` (off `origin/main`)
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — low effort, deterministic (HTML-string, no browser), broad reach (inline SVG icons are ubiquitous). Closes a measurement blind spot in a shipped audit.
**Source:** raven-opportunities ledger 2026-06-21 (P3): "audit_page tokens/no-bare-hex counts CSS declarations only, ignores SVG presentation attributes (stroke=/fill=); converting icons to currentColor is correct but invisible to the metric → extend no-bare-hex (and palette-size) to scan inline SVG stroke/fill attrs so design-system icon compliance is measured."

---

## Problem statement

The `audit_page` rule engine (`src/page-checks.ts`, shared by `audit_page` and `audit_url`) cannot see hardcoded colors in inline SVG icons:

1. `tokens/no-bare-hex` (page-checks.ts:92–105) scans **only `<style>` blocks** and explicitly `continue`s on any line matching `/stroke|fill/` (line 99). Inline SVG presentation attributes like `<path fill="#3b82f6">` are never examined.

So a design-system icon set converted to `fill="currentColor"` (the correct pattern — icons inherit text color and theme automatically) earns no credit, and an icon set that hardcodes `fill="#3b82f6"` (breaks theming, duplicates the palette) is never flagged. Icon-color compliance is invisible to the audit.

(Note: `color/palette-size` at line 179 already scans the whole HTML for `#hex`, so SVG **hex** colors already count toward the palette — no change needed there. This run adds the missing **icon-compliance** signal, not a palette change.)

## Goal / intent

Add a new, deterministic `tokens/svg-hardcoded-color` check to `runPageChecks` that scans inline SVG presentation attributes (`fill`/`stroke`, including `style="fill:…"`) for **bare hardcoded colors** (hex / rgb() / hsl()) and warns when icons hardcode color instead of using `currentColor` or a token (`var(--…)`). Exempt the non-color and themeable keywords. No browser; pure HTML-string analysis. No change to existing rules or their thresholds.

## Scope

**In:**
- `src/page-checks.ts` — add the `tokens/svg-hardcoded-color` check inside `runPageChecks` (after the existing `tokens/no-bare-hex` block). Pure; appends to `passes`/`issues`.
- `test/page-checks.test.mjs` — NEW test file importing `runPageChecks` from `dist/page-checks.js` (no existing page-checks test file).
- Docs: README `audit_page` description note; CHANGELOG `[Unreleased] > Added`.

**Out (not this run):**
- No change to `tokens/no-bare-hex` (CSS scan stays as-is — line 99 skip preserved), `color/palette-size`, or any other rule/threshold.
- No new MCP tool, no param, no `index.ts` change (the rule flows through `audit_page`/`audit_url` automatically).
- No version bump / publish / push.
- Named CSS colors (`red`, `white`) are NOT treated as violations this run (only numeric bare colors: hex/rgb/hsl) — keeps it precise and deterministic.

## Constrained valid values (the contract)

### The check
- **Where it scans:** only inside `<svg …>…</svg>` blocks (case-insensitive). Match each SVG block, then within it find every `fill` / `stroke` presentation attribute value AND any `fill:`/`stroke:` inside an inline `style="…"`.
- **Counted as a hardcoded color** (a violation) iff the value matches one of:
  - hex: `#[0-9a-fA-F]{3,8}`
  - `rgb(` / `rgba(`
  - `hsl(` / `hsla(`
- **Exempt** (NOT counted), case-insensitive: `currentColor`, `none`, `transparent`, `inherit`, `unset`, `initial`, any `url(...)` reference (gradients/patterns), and any `var(--…)` token.
- **Result:**
  - 0 hardcoded → `passes.push("SVG icons use currentColor/tokens (N color attrs, 0 hardcoded)")` when at least one SVG color attr exists; if no SVG/color attrs exist at all, add nothing (silent — like the other conditional checks).
  - ≥1 hardcoded → `issues.push({ severity: "warning", rule: "tokens/svg-hardcoded-color", message: "<count> inline SVG fill/stroke attribute(s) hardcode a color (" + uniqueValues.slice(0,8).join(", ") + ") instead of currentColor/token", fix: "Use fill=\"currentColor\" (or stroke=\"currentColor\") so icons inherit text color and theme; for multi-color brand logos that must keep fixed colors, this warning is expected." })`.
- **Severity:** `warning` (never `error`) — multi-color brand logos legitimately hardcode colors, so this must not fail a strict audit's error count by default. (It WILL surface as an error only under `audit_page`'s existing `strict:true`, consistent with every other warning — acceptable and documented in the fix text.)
- **Purity/safety:** operate on the `html` string already in scope; no mutation of shared state beyond `passes`/`issues`; no network/FS.

## Acceptance criteria

1. A new `tokens/svg-hardcoded-color` check exists in `runPageChecks` and runs for both `audit_page` and `audit_url` (shared engine) with no other rule changed.
2. `<svg><path fill="#3b82f6"/></svg>` → a `tokens/svg-hardcoded-color` warning; message includes `#3b82f6` and count 1.
3. `<svg><path fill="currentColor"/><circle stroke="var(--icon)"/></svg>` → NO warning; a pass string is present mentioning 0 hardcoded.
4. Exemptions: `fill="none"`, `stroke="none"`, `fill="transparent"`, `fill="inherit"`, `fill="url(#grad)"`, `stroke="var(--c)"` → none counted (no warning).
5. `stroke="rgb(0,0,0)"` and inline `style="fill:#fff"` inside an SVG → counted (warning, count reflects both).
6. A `fill="#fff"` that appears **outside** any `<svg>` block (e.g. coincidental text) is NOT counted by this rule.
7. Multiple hardcoded values are de-duplicated in the message and counted correctly; `>8` distinct values are truncated in the message but the count is the full total.
8. Existing behavior intact: a page with no SVG produces no new finding; `tokens/no-bare-hex`, `color/palette-size`, and all other rule outputs are unchanged (existing checks’ pass/issue strings byte-identical).
9. `npm run build` clean; `npm test` fully green — existing suite + the new `page-checks.test.mjs`.
10. CHANGELOG `[Unreleased] > Added` + README `audit_page` note document the new check.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/page-checks.ts` | add `tokens/svg-hardcoded-color` check after the `no-bare-hex` block; no other rule touched | implementer |
| `test/page-checks.test.mjs` | NEW — warn/pass/exemptions/scope/dedup/no-svg cases via `runPageChecks` | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry | doc-updater |
| `README.md` | extend the `audit_page` row to mention inline-SVG icon-color compliance | doc-updater |

## Verification plan

- **Targeted:** `node --test test/page-checks.test.mjs` → all pass (proves AC 1–8).
- **Full suite:** `npm run build && npm test` → 0 fail (AC 9), confirming no existing check regressed (esp. no-bare-hex / palette-size).
- **Reviewer:** diff vs this SPEC; flag any change to an existing rule/threshold, any non-SVG-scoped match (AC 6), any value mis-classified (exempt list), severity != warning, or any index.ts/tool change (should be none).
- **Main loop (me):** read merged diff, run suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push/PR). This becomes a post-v1.12.0 `[Unreleased]` item (will ride the next release after v1.12.0).
