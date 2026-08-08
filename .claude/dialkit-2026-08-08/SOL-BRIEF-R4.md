# Falsification brief — round 4

You are a report-only adversary. Do not edit files. Your job is to REFUTE the
claims below, not to confirm them. Default to "not established" when uncertain.

Repo: `/Users/accunliffe/projects/raven-mcp`. Nothing is committed or pushed;
everything below is working-tree only.

Round 3 returned DOES NOT SURVIVE with three findings. All three were verified
against the code before being accepted, and all three are now fixed. This round
attacks the FIXES. A round-2 fix already introduced a fresh false claim that
round 3 caught (R3-3), so treat "the fix for X" as a new claim with no credit
carried over.

## Claim 1 — R3-1: the enumeration walk now reads markup, not JavaScript

`test/grab-overlay-voice-alignment.test.mjs`. The file is scanned once from the
top into two offset-preserving views: `code` (JS comments blanked; mic call sites
found here) and `markup` (string-literal contents only, HTML comments inside them
blanked; the depth walk runs here).

Attack:
- Find an input where the lexer is wrong and the error is SILENT — i.e. it makes
  a genuinely uncovered mic read as covered. The desync invariant (`no ' or "
  span may contain a raw newline`) is supposed to make desyncs loud; find a
  desync it does not catch, or a false-covered verdict that involves no desync.
- The regex heuristic is `REGEX_PRECEDERS` + `REGEX_KEYWORDS`. Name a construct
  in this overlay, or a plausible future one, that it misclassifies. Division
  after `)` or `]` is deliberately treated as division — is that right here?
- `${}` interpolation inside a template literal is treated as string content.
  Does the overlay contain one where that matters?
- The escape handling copies the ESCAPED character and drops the backslash. Find
  a case where that changes a verdict.
- The 200-character REACH interacts with blanking. Does any real site now depend
  on blanked-out characters counting toward the window?

## Claim 2 — R3-2: `!chromiumAvailable` is the whole skip gate

The launch-only message regex was removed. Claim: if the probe came up, nothing
can skip whatever the error says; if it did not, no test in this file can be
meaningful.

Attack: find a state where the probe succeeds and a test then fails for a purely
environmental reason (so a real failure is reported), or where the probe fails and
skipping hides a genuine product defect. Also check `test/capture.test.mjs` and
the three overlay suites named in `CLAUDE.md` as carrying the same pre-existing
hole — is the fix here consistent with them, or has it created a second dialect?

## Claim 3 — R3-3: E1/E6 are two mutation sites on one path

`test/grab-overlay-easing-control.test.mjs` header and `CLAUDE.md`. Claim:
`timingFunctionCount` has exactly one call site (`browser/raven-grab.js:5259`,
inside `parseEasingValue`) and `classifyStyleControl`'s easing branch always calls
`parseEasingValue`, so the count is not independently reachable.

Attack: verify both halves by grep. If any other caller exists, or any
classification path skips `parseEasingValue`, the corrected claim is wrong for a
THIRD time.

## Claim 4 — the two new controls are meaningful

`.claude/dialkit-2026-08-08/align-mutants.mjs` gained `expect: 'green'`.
Claimed measurements:
- A9 radius 1 today; pre-fix fail=0 (whole suite green on a real misalignment)
- A10 0 red today; pre-fix fail=1 (correct row reported as a defect)
- A11 0 red today; the regex branch is proven by the PRISTINE file going red
  (1 pass / 1 fail) when the branch is removed — NOT by A11

Attack: is A10 actually behaviour-preserving, or does it change what the overlay
renders? Is A9 genuinely a real misalignment, or does the added comment make it
inert? Does the harness's inverted verdict path have a hole — e.g. can a control
pass because the suite crashed rather than because it stayed green?

## Cross-cutting

- Re-verify the mirror (`cmp browser/raven-grab.js web/public/raven-grab.js`).
- Re-verify every mutant anchor is still unique after this round's edits.
- Check `CLAUDE.md` line 5 and the alignment landmine against the code. Any
  number, line reference or radius that has decayed is a finding.
- No product code changed this round. Confirm that — if `browser/raven-grab.js`
  differs from its state before round 3, say so.

Output format: findings as `P1/P2/P3 — file:line — defect — correct behavior`,
then a single line `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
