# SPEC — `audit_consistency` tool (cross-page / corpus consistency audit)

**Date:** 2026-06-21
**Branch:** `feat/audit-consistency` (off `origin/main` @ b51d570)
**Addresses:** GitHub issue **#9** ("Audits miss cross-page consistency + per-system container width — single-blob audit blind spot"; labels: bug, enhancement; open since 2026-06-05), requested fix **#1 ("Multi-page / corpus audit mode")**.
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — the only open *bug* issue, filed about defects that shipped to prod; broad reach (every multi-page site); deterministic + unit-testable (pure HTML-string analysis, no browser).

---

## Problem statement

Every Raven audit (`audit_page`, `audit_url`, …) evaluates a **single HTML blob in isolation**, so it is blind to *relational* defects that only exist across routes. Issue #9 documents two such defects that shipped to a production landing site with no audit flagging them:

1. **Hero inconsistency across pages.** `/changelog` used a small custom header (`text-display-md`) while the sibling `/get-started` uses a large hero (`text-display-xl`). Same site, two hero systems. Each page passed `audit_page` clean.
2. **Container width diverging across pages.** `/changelog` throttled its body to `max-w-3xl` (768px) while every other page sits on `container-wide` (1152px). The content rail was ~384px off-system.

Single-page container grounding for defect #2 already shipped (`auditContainerWidth` + the `containerMaxWidth` param on `audit_page`) — but it requires the caller to KNOW and pass the canonical token, and it cannot see defect #1 (hero tier) at all. There is **no corpus mode** that takes several pages and asserts they agree.

## Goal / intent

Add a new MCP tool **`audit_consistency`** that accepts multiple pages and flags cross-page divergence in (a) content-container width and (b) hero heading tier — inferring the canonical (modal) value from the corpus when no token is supplied, so the caller need not know it in advance. Pure HTML-string analysis (no browser). Reuse `extractDeclaredMaxWidths`/`containerScaleWidths` from `src/audit-container.ts`; do **not** modify `audit-container.ts` or `page-checks.ts`.

## Scope

**In:**
- `src/audit-consistency.ts` — NEW pure module: `auditConsistency(pages, opts?) → ConsistencyResult`.
- `src/index.ts` — register the `audit_consistency` tool (import, Zod schema, handler, description). Tool count 56 → 57.
- `test/audit-consistency.test.mjs` — NEW deterministic unit tests (no browser).
- Docs: `CHANGELOG.md` `[Unreleased] > Added`; `README.md` tool list.

**Out (not this run):**
- No change to `src/audit-container.ts`, `src/page-checks.ts`, `audit_page`, `audit_url`, or any other tool.
- No URL-fetching/crawling (input is pre-collected HTML per route; a URL-fetch variant is a later run).
- No heading-scale-across-pages check beyond hero tier (kept out to bound this run; can extend later).
- No version bump / publish / push. Joins the post-v1.12.0 `[Unreleased]` queue.

## Constrained valid values (the contract)

### Tool input (Zod):
- `pages` (array, **min length 2**) of `{ name: string (non-empty), html: string (non-empty) }`.
- `container_token` (number, optional) — the project's canonical container width in px. When given, container divergence is measured against it; when omitted, the **modal** container width across `pages` is the reference.
- `hero_token` (string, optional) — the canonical hero heading class signature (e.g. `"text-display-xl"`). When given, hero divergence is measured against it; when omitted, the **modal** hero signature across pages is the reference.

### Per-page extraction (deterministic rules):
- **`container_px`**: `max(containerScaleWidths(html))` (declared `max-width:Npx` ≥ 700px) or `null` if none. (Reuse `containerScaleWidths` from audit-container.ts.)
- **`container_classes`**: sorted unique set of class tokens in the page matching `/\b(max-w-[a-z0-9.]+|container[a-z0-9-]*|w-screen|w-full)\b/gi`.
- **`container_signature`**: if `container_px !== null` → `String(container_px)`; else the `container_classes` joined by `" "` (or `""` if none).
- **`hero_size_px`**: the largest declared heading `font-size:Npx` among `h1/h2` rules, or `null`.
- **`hero_classes`**: the class attribute of the FIRST `<h1 …>` in the page (string, `""` if none/no class).
- **`hero_signature`**: if `hero_size_px !== null` → `String(hero_size_px)`; else the first type-scale class token in `hero_classes` matching `/\btext-(display-[a-z0-9]+|[0-9]?xl|xs|sm|base|lg|xl)\b/i` (full match), or `""`.

### Consistency logic (the "modal" rule):
- The reference for a dimension = the supplied token if given, else the **modal** (most frequent non-empty) signature across pages. On a frequency tie among ≥2 distinct values (e.g. exactly 2 pages that differ), there is **no modal**: emit a `divergence` finding listing all distinct values, and mark **all** differing pages as outliers (since none can be declared canonical without a token).
- A page is an **outlier** on a dimension if its signature is non-empty and differs from the reference.
- Empty/`null` signatures are reported as `unknown` for that page and are NOT counted as outliers (absence of declared value ≠ divergence).

### Issue rules (constrained enum) emitted in `issues[]`:
- `consistency/container-width` (severity `warning`) — when container outliers exist.
- `consistency/hero-tier` (severity `warning`) — when hero outliers exist.
Each issue: `{ severity, rule, message, fix }` (same shape as PageIssue).

### `ConsistencyResult` shape (the contract the test asserts):
```ts
{
  page_count: number,                       // === pages.length
  pages: Array<{
    name: string,
    container: { px: number|null, classes: string[], signature: string },
    hero:      { size_px: number|null, classes: string, signature: string }
  }>,
  consistency: {
    container: { reference: string|null, source: "token"|"modal"|"none", outliers: string[] /* page names */ },
    hero:      { reference: string|null, source: "token"|"modal"|"none", outliers: string[] /* page names */ }
  },
  issues: Array<{ severity: "warning", rule: string, message: string, fix: string }>,
  score: number /* 0-100 */,
  grade: "A"|"B"|"C"|"D",
  summary: string
}
```

### Scoring (mirror the audit_page idiom):
```
totalDimensions = 2 (container, hero)
failCount       = number of dimensions with ≥1 outlier   // 0, 1, or 2
score           = round((totalDimensions - failCount) / totalDimensions * 100)   // 100 / 50 / 0
grade           = failCount === 0 ? "A" : failCount === 1 ? "C" : "D"
```

## Acceptance criteria

1. `src/audit-consistency.ts` exports a pure `auditConsistency(pages, opts?)`; no I/O, no browser; imports `containerScaleWidths` (or `extractDeclaredMaxWidths`) from `./audit-container.js` and does NOT edit that file or `page-checks.ts`.
2. Input guard: `pages.length < 2` → the handler returns a clear "need ≥2 pages" message (tool layer); the pure fn may assume ≥2 but must not throw on exactly 2.
3. Per-page extraction matches the rules above (container_px, container_classes sorted-unique, hero_classes from first h1, signatures).
4. **Issue #9 defect-1 fixture (hero):** two pages — `get-started` `<h1 class="font-display text-display-xl">` and `changelog` `<h1 class="text-display-md">` — produce a `consistency/hero-tier` warning and list `changelog` (or both, per the no-modal tie rule) as an outlier.
5. **Issue #9 defect-2 fixture (container):** two pages whose containers are `container-wide` vs `container-wide max-w-3xl` (class-token path) AND a px variant (`max-width:1152px` vs `max-width:768px`) each produce a `consistency/container-width` warning naming the divergent page.
6. **Consistent corpus:** ≥3 pages all sharing the same hero signature and container signature → `issues` empty, `score` 100, `grade` "A", both `outliers` empty.
7. **Modal inference:** 3 pages where 2 share a hero signature and 1 differs → the lone page is the only hero outlier; `consistency.hero.source === "modal"`; reference = the shared signature.
8. **Token override:** when `container_token`/`hero_token` are supplied, the reference equals the token (`source==="token"`) and pages diverging from it are flagged even if they are the majority.
9. `unknown`/empty signatures are not counted as outliers (a page with no declared container and no container class is not a container outlier).
10. `score`/`grade` follow the scoring formula (100/50/0 ↔ A/C/D); `audit_consistency` registered in `index.ts`, tool count 56 → 57, handler returns the result as JSON text.
11. `npm run build` clean; `npm test` fully green (existing suite + new `audit-consistency.test.mjs`).
12. `CHANGELOG.md` `[Unreleased] > Added` documents `audit_consistency` (reference issue #9); `README.md` lists it.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/audit-consistency.ts` | NEW — `auditConsistency()` pure module reusing audit-container helpers | implementer |
| `src/index.ts` | register `audit_consistency` tool (import, Zod schema, handler, description); count 56→57 | implementer |
| `test/audit-consistency.test.mjs` | NEW — deterministic unit tests for AC 1–10, fixtures mirroring issue #9 | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry (reference #9) | doc-updater |
| `README.md` | add `audit_consistency` to the tools list | doc-updater |

## Verification plan

- **Unit:** `node --test test/audit-consistency.test.mjs` → all pass (proves AC 1–10), with fixtures that mirror issue #9's exact `text-display-xl`/`text-display-md` + `container-wide`/`max-w-3xl` examples, plus a px-based container variant, a consistent 3-page corpus, modal inference, and token override.
- **Full suite:** `npm run build && npm test` → 0 fail (AC 11), confirming no regression (audit-container.ts / page-checks.ts untouched).
- **Eyes-on:** main loop calls `auditConsistency` on the issue-#9 fixtures and reads the JSON to confirm the changelog page is flagged on BOTH dimensions and a consistent corpus scores 100.
- **Reviewer:** diff vs this SPEC; flag any edit to audit-container.ts/page-checks.ts (out of scope), extraction-rule drift, scoring drift, missing AC, the no-modal tie-handling, or a tool other than the new one being altered.
- **Main loop (me):** read the result, run the suite, parallel-instance collision re-check, then commit referencing SPEC.md + issue #9 (no push).
