# SPEC — compact response mode for the heavy audit/eval tools

**Date:** 2026-06-21
**Branch:** `feat/compact-response-mode` (off `origin/main`)
**Backlog rank this run:** #1 by (impact × reach) ÷ effort. Maximum reach — it taxes **every** call of the two heaviest tools; bounded effort — a response-shaping flag, no change to analysis logic.
**Source:** raven-opportunities ledger 2026-06-21 (P2): "evaluate_design (171K chars) and audit_page (4.4M) blow the tool-result budget every call, forcing file-spill + subagent parsing → add a compact/summary-only response mode (scores + violations + fix_priority, no embedded principle bodies/DOM/screenshots)."

---

## Problem statement

Three tools emit payloads large enough to blow the MCP tool-result budget on a routine call, forcing the caller to spill the result to a file and parse it with a subagent:

1. **`audit_page`** (url mode): `result.capture.screenshot_bytes` is misnamed — it holds the **full base64 PNG string** (`cap.screenshotBase64`, `src/index.ts:2279`), which is megabytes. This is the 4.4M case.
2. **`evaluate_design`**: `principles_to_check` embeds the **full body** of every matched principle (`summary`, `common_violations[]`, `what_to_verify[]`) and `applicable_patterns` embeds each pattern's full `checklist[]`. With many matches this is the 171K case.
3. **`audit_url`**: each `captures[]` row may carry a base64 `screenshot`, and the `findings[]` array is large.

In every case the **decision-grade signal** the caller needs is small: score/grade/summary, the violations (errors/warnings/findings), and fix_priority. The bulk is embedded reference material (principle prose, raw DOM/pixels) the caller did not ask for on that call.

## Goal / intent

Add an opt-in `compact` flag to these three tools. When `compact: true`, return only the decision-grade signal — scores + violations + fix_priority — and strip the embedded principle/pattern bodies, DOM, and screenshots. **Default behavior (flag absent/false) is byte-for-byte unchanged.** The stripping logic lives in a **pure, exported, unit-tested** module so it is testable without spinning up the MCP server or a browser.

## Scope

**In:**
- **NEW `src/compact.ts`** — three pure exported functions, each takes a fully-built result object and returns a new compacted object (does not mutate input):
  - `compactAuditPage(result)` 
  - `compactEvaluation(evaluation)`
  - `compactAuditUrl(result)`
- **`src/index.ts`** — add `compact: z.boolean().optional()` to the input schema of `audit_page`, `evaluate_design`, `audit_url`. In each handler, when `compact === true`, pass the assembled result through the matching helper **immediately before** `JSON.stringify`. No other handler logic changes.
- **`test/compact.test.mjs`** — `node --test` unit tests importing the three helpers from `dist/compact.js` (match how the other `.test.mjs` import compiled output).
- **Docs:** README tool lines for the three tools note the `compact` flag; CHANGELOG `[Unreleased] > Added`.

**Out (not this run):**
- No change to the analysis/measurement logic of any tool (rule engine, contrast math, principle matching, capture pipeline).
- No new tool, no rename of existing fields, no removal of any field from the **default** (non-compact) response.
- No version bump / publish / push beyond the commit.
- `compact` is not added to other tools this run (audit_screen/audit_swiftui/etc. share audit_page's shape but are out of the named-pain set; a follow-up can extend the same helper).

## Constrained valid values (the contract)

### `compact` parameter
- Type: `boolean`, optional. Default (absent or `false`) → **unchanged** full response. Only `true` triggers compaction.

### `compactAuditPage(result) -> object`
Returns a new object preserving these keys verbatim: `score`, `grade`, `summary`, `errors`, `warnings`, `fix_priority`, and `notes`, `unloaded_video_artifacts`, `adversarial_verification` **when present**. Transformations:
- `passes: string[]` → drop the array, add `passes_count: number` (= `passes.length`).
- `capture`: if present, keep `{ url, viewport, scrolledToBottom }` and **drop `screenshot_bytes`** (the base64). If `capture` was absent, stay absent.
- No other keys added.

### `compactEvaluation(evaluation) -> object`
Returns a new object preserving `design_description`, `context`, `goals`, `evaluation_guidance`, `total_principles`, `total_patterns`, and `fix_confirmed` + `before_after_diff` **when present**. Transformations:
- `principles_to_check: [{id,name,summary,common_violations,what_to_verify}]` → `[{ id, name }]` only.
- `applicable_patterns: [{id,name,checklist}]` → `[{ id, name }]` only.

### `compactAuditUrl(result) -> object`
Returns a new object preserving `tool`, `url`, `viewports`, `themes`, `findings`, `counts`, `summary`, `warnings` verbatim. Transformation:
- `captures: [{viewport,theme,scrolledToBottom,screenshot_bytes,screenshot?}]` → keep `{ viewport, theme, scrolledToBottom, screenshot_bytes }` and **drop the base64 `screenshot`** field.
- `findings` are preserved in full — they ARE the decision signal. (Compaction strips reference bulk, not violations.)

### Purity rules (all three)
- Do not mutate the input object (clone what you keep).
- Missing optional keys are simply omitted, never set to `undefined`/`null`.
- An input already lacking the heavy field is returned losslessly minus the transform (e.g. html-mode audit_page with no `capture`).

## Acceptance criteria

1. The three helpers are pure, exported from `src/compact.ts`, and do not mutate their input.
2. `compactAuditPage`: drops the base64 (`capture.screenshot_bytes` gone), `passes` replaced by integer `passes_count`, and `score`/`grade`/`summary`/`errors`/`warnings`/`fix_priority` preserved identically. `notes`/`adversarial_verification`/`unloaded_video_artifacts` preserved when present; html-mode input (no `capture`) handled losslessly.
3. `compactEvaluation`: `principles_to_check` and `applicable_patterns` each reduced to `[{id,name}]` (no `summary`/`common_violations`/`what_to_verify`/`checklist` keys remain), counts preserved, `fix_confirmed`/`before_after_diff` preserved when present.
4. `compactAuditUrl`: every `captures[]` row has no `screenshot` key; `findings`/`counts`/`summary` preserved identically.
5. **Size win proven:** a test builds a representative bloated payload for each tool (a multi-KB fake base64 / full principle bodies) and asserts the compact JSON is dramatically smaller (e.g. `< 20%` of the full serialized length) AND contains none of the stripped markers (no base64 blob, no principle-body keys).
6. **No-regression:** the `compact` flag absent/false yields a response identical to current `main` (a test compacts nothing and the handler path is unchanged — assert helper is only invoked under `compact===true`).
7. `npm run build` clean; `npm test` fully green — all existing tests still pass plus the new `compact.test.mjs`.
8. CHANGELOG `[Unreleased] > Added` documents the flag; README notes it on the three tool lines.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/compact.ts` | NEW — `compactAuditPage`, `compactEvaluation`, `compactAuditUrl` pure exported helpers | implementer |
| `src/index.ts` | add `compact` boolean param to `audit_page`, `evaluate_design`, `audit_url`; gate helper call on `compact===true` right before `JSON.stringify`; import from `./compact.js` | implementer |
| `test/compact.test.mjs` | NEW — purity, per-helper field transforms, size-win, no-mutation, missing-optional-key cases | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry | doc-updater |
| `README.md` | note `compact` flag on the three tool descriptions | doc-updater |

## Verification plan

- **Targeted:** `node --test test/compact.test.mjs` → all pass (proves AC 1–6).
- **Full suite:** `npm run build && npm test` → 0 fail (AC 7), confirming no existing test regressed and the default path is untouched.
- **Reviewer:** diff working tree vs this SPEC; flag drift — any change to analysis logic, any field dropped from the DEFAULT response, any non-pure helper, any unstripped base64/principle-body in compact output.
- **Main loop (me):** read merged diff, confirm `compact===true` gating (default path identical), run suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push/PR).
