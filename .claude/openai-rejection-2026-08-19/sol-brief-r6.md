# Adverse falsification pass — round 6 (report only, no edits)

You are auditing an UNCOMMITTED tree in /Users/accunliffe/projects/raven-mcp.
Full diff vs HEAD: `.claude/openai-rejection-2026-08-19/amended.diff` (62 files,
14,901 insertions / 107 deletions, regenerated after the round-5 fixes and after
the CHANGELOG entry was written — it is current as of this brief).
Do NOT edit any file. Return numbered P1/P2/P3 findings with file:line evidence
and one verdict line: SURVIVES or DOES NOT SURVIVE.

## The claim under audit

The OpenAI plugin-directory rejection named two reasons: (R1) submitted test
cases did not produce correct results, and (R2) tool annotations do not match
tool behaviour / are not explicitly true-or-false on every tool. This tree claims
to close the agent-actionable half of both, on the ANONYMOUS hosted surface
(`mcp.ravenmcp.ai/api/mcp`, 45 tools) as well as the 111-tool stdio build.

Rounds 1–5 each returned DOES NOT SURVIVE; every finding was dispositioned. This
round audits the round-5 fixes plus everything else now in the tree.

## What changed since round 5

1. `test/video-playback.test.mjs` — the test formerly named
   `empty input -> 0 videos, valid shape` was a BLESSING of the defect. Renamed
   to `zero observations is a shape fact, not a tool-level pass` and given a
   comment stating that the aggregator is deliberately empty-agnostic while the
   REFUSAL of a caller-submitted empty array lives at the tool seam.
2. `src/index.ts` — `audit_video_playback` refuses an empty `dom_snapshot`;
   `test/empty-input-refusal.test.mjs` gained the refusal plus a positive
   control (33 -> 35 tests).
3. `src/index.ts` — `audit_url` now publishes `destructiveHint: true` alongside
   `readOnlyHint: false` (the previous value defended itself with an argument
   already refused one line above), and the hosted description gained the
   sentence naming the click refusal and the neither-read-only-nor-idempotent
   consequence.
4. `src/index.ts` — `TOOL_IDEMPOTENT` publishes `idempotentHint` per tool with a
   false default; `openWorldHint` is DERIVED for the remote build from
   `REMOTE_ARG_GUARDS` rather than read from the stdio list.
5. `src/audit-url.ts` / `src/compact.ts` — a `coverage {requested, succeeded,
   complete}` field plus a `PARTIAL COVERAGE` summary prefix, carried through
   compact mode.
6. `src/contrast.ts` — a hosted-capacity "capacity busy" launch error is
   rethrown unchanged instead of being laundered into `CaptureUnavailableError`.
7. `src/index.ts` — `filterTokensByGroup` returns null on an unmatched group so
   `base_system` fails instead of returning a metadata-only token set.
8. `CHANGELOG.md` — a new `## [Unreleased]` section describing all of the above.

## Measurements to attack

- Full suite: 1676 tests / 1673 pass / 0 fail / 3 skipped, EXIT=0
  (`agent-output/full-suite-r5.log`). The 3 skips are read individually at log
  lines 121 / 835 / 836; the +2 over 1674 is exactly the two named
  `audit_video_playback` tests at lines 517 and 529.
- `.claude/openai-rejection-2026-08-19/empty-mutants.mjs` v3, log
  `agent-output/mutants-v3.log`: baseline 35/35/0/0, 19 mutants, 0 survived,
  0 killed the wrong test, 1 control, 0 false-failed, EXIT=0.
- `GOLDEN_45_HASH` (frozen anonymous tool-NAME hash) unmoved;
  `ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH` pin green by test name.

## Try specifically to refute these

- That the CHANGELOG entry is TRUE of the code — every behavioural sentence in
  `## [Unreleased]` is a falsifiable claim; find one the source contradicts.
- That `destructiveHint: true` on `audit_url` is the honest value, and that the
  comment defending it does not repeat an argument the file refuses elsewhere.
- That `idempotentHint` is correct per tool — find an entry marked `true` that
  a second identical call would not leave in the same end state, or a `false`
  that is gratuitous.
- That the derived remote `openWorldHint` cannot disagree with what
  `REMOTE_ARG_GUARDS` actually enforces at request time.
- That the empty-input refusals cover every anonymous tool that can manufacture
  an all-clear from empty or whitespace-only input, and that NO refusal
  over-refuses a legitimate call (a genuinely empty observation set from a real
  browser run must still succeed).
- That `coverage` cannot report `complete: true` on a run that dropped a
  combination, and that the compact-mode passthrough actually fires.
- That the "capacity busy" rethrow matches the real message
  `src/browser-launch.ts` produces, and that the regex cannot swallow or
  mis-classify a genuine chromium-absent failure.
- That `test/video-playback.test.mjs` no longer blesses the defect anywhere else
  in the file, and that the seam refusal is what the new tests actually measure.
- That the mutation harness cannot report a survivor or a kill for the wrong
  reason (dead child, stale find-string, skip drift, unread exit status).
