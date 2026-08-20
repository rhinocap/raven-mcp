# Adverse falsification pass — round 5 (report only, no edits)

You are auditing an UNCOMMITTED tree in /Users/accunliffe/projects/raven-mcp.
Full diff vs HEAD: `.claude/openai-rejection-2026-08-19/amended.diff` (57 files).
Do NOT edit any file. Return numbered P1/P2/P3 findings with file:line evidence
and one verdict line: SURVIVES or DOES NOT SURVIVE.

## The claim under audit

The OpenAI plugin-directory rejection named two reasons: (R1) submitted test
cases did not produce correct results, and (R2) tool annotations do not match
tool behaviour / are not explicitly true-or-false on every tool. This tree claims
to close the agent-actionable half of both, on the ANONYMOUS hosted surface
(`mcp.ravenmcp.ai/api/mcp`, 45 tools) as well as the 111-tool stdio build.

Round 4 (Sol) returned DOES NOT SURVIVE with five findings; all five were
dispositioned. This round audits THOSE fixes plus the rebaseline that followed.

## What changed since round 4

1. `src/index.ts` — `audit_contrast` now refuses an empty `dom_snapshot` instead
   of manufacturing an all-clear; `toolFiresCallerInteractions()` plus a third
   `toolAnnotations` branch publish `readOnlyHint:false, idempotentHint:false,
   destructiveHint:false` for `audit_url` (both builds) and for local
   `audit_page`; the derived remote description and the click-refusal error text
   were corrected.
2. `test/remote-click-guard.test.mjs` — 16 tests, over-refusal control rewritten
   to go through the real registration seam.
3. `test/empty-input-refusal.test.mjs` — 33 tests; `empty-mutants.mjs` at 17
   mutants + 1 control, dead-child guard added.
4. `test/taste-remote-full.test.mjs` — `ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH`
   rebaselined `c914c26c…` → `5181c149…`, and the provenance comment's stale
   claim ("closed by changing the BEHAVIOUR rather than the annotation")
   corrected.
5. `conversations/2026-07-25-submission-dossier.md` — six passages realigned.

## Measurements to attack

- Full suite: 1674 tests / 1671 pass / 0 fail / 3 skipped, EXIT=0
  (`agent-output/full-suite-rebaselined.log`). The 3 skips are the file-URL
  fallback notice and the two removed-capability phase2 tests, at log lines
  121 / 833 / 834.
- `.claude/openai-rejection-2026-08-19/verify-anon-hash.mjs`: ALL CHECKS PASSED.
  Its load-bearing claim is that reverting `audit_url`'s description ALONE
  reproduces the pre-click-guard pin `1abc908c…`, therefore the entire
  `c914c26c → 5181c149` delta is `audit_url` and nothing else moved.
- `GOLDEN_45_HASH` (frozen anonymous tool-NAME hash) is unmoved and passes.

## Try specifically to refute these

- That the rebaseline is legitimate rather than masking a real change — is
  `verify-anon-hash.mjs`'s equality argument actually sound, and does its
  HEAD-literal extractor read what it claims to read?
- That `readOnlyHint:false / idempotentHint:false` on `audit_url` is now HONEST
  on both builds, and that no OTHER tool in the 45 has an annotation its
  behaviour falsifies (audits that navigate, write files, hit the network, or
  are non-deterministic).
- That every one of the 45 anonymous tools emits all four hints explicitly, non-null.
- That the empty-input refusals cover every anonymous tool that can manufacture
  an all-clear from empty input — find one that still returns isError:false with
  a zero-finding "pass" on empty or degenerate input.
- That the click guard cannot be bypassed (aliasing, nesting, casing, arrays,
  unknown interaction verbs) and that its tests would catch a bypass.
- That the submission dossier no longer contradicts source.
- That the mutation harnesses cannot report a survivor or a kill for the wrong
  reason (dead child, stale find-string, skip drift, unread exit status).
