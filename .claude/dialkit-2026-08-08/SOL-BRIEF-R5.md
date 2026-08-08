# Falsification brief — round 5

You are a report-only adversary. Do not edit files. Your job is to REFUTE the
claims below, not to confirm them. Default to "not established" when uncertain.

Repo: `/Users/accunliffe/projects/raven-mcp`. Nothing is committed or pushed;
everything below is working-tree only. No product code changed in rounds 3 or 4 —
only `test/grab-overlay-voice-alignment.test.mjs`, the harness
`.claude/dialkit-2026-08-08/align-mutants.mjs`, and `CLAUDE.md`.

Round 4 returned DOES NOT SURVIVE with 7 findings. All 7 were verified before
being accepted — the three lexer ones by MEASUREMENT, each built as a mutant and
confirmed to survive the pre-fix scanner — and all 7 are now fixed. This round
attacks the FIXES. Rounds 2, 3 and 4 each found a fresh false claim introduced by
the previous round's fix, so treat "the fix for X" as a new claim with no credit
carried over.

## Claim 1 — the scanner is now a correct-enough JavaScript lexer

`test/grab-overlay-voice-alignment.test.mjs`, `scanSource`. Three round-4 changes:
a paren stack so a `/` after a control-header `)` opens a regex; `${…}` bodies
lexed as code via an interpolation frame stack; escapes DECODED (`\xNN`,
`\uNNNN`, `\u{…}`, the control set) and placed at the escape's last index.

Attack — the bar is a SILENT false-covered verdict (a genuinely uncovered mic
reading as covered) with no desync assertion firing:
- The paren stack. `CONTROL_HEAD` looks back 24 characters for
  `if|while|for|switch|catch|with`. Find a case it misjudges in either direction:
  a control keyword that is actually part of an identifier or a string, a
  control header longer than 24 characters before the `(`, `do {…} while (x) /re/`,
  an arrow function or `async (…) =>`, a `)` with no matching `(` recorded.
- `lastCloseWasControl` is a single variable, not indexed by position. The comment
  claims the `)` at `k` is necessarily the most recently closed paren because only
  whitespace was skipped. Is that true across newlines, comments, or when
  `opensRegex` is called from inside a nested scan?
- Interpolation frames. `braceDepth` is saved and restored per frame. Find an
  input where an object literal, a block, or a nested template inside `${…}`
  desynchronises the frame stack. What happens on unbalanced braces inside a
  string inside an interpolation?
- Escape decoding. A view slot must hold exactly ONE character. Find an escape
  that violates that, or one where `width` overruns the closing quote and eats it
  (e.g. `'\u{'`, `'\x'` at end of string, `'\u12'`).
- The line-continuation strip in the desync invariant: does it weaken the
  invariant enough to hide a real desync?

## Claim 2 — the probe now covers every environmental prerequisite

A loopback `listen` was added before the chromium launch, because round 4's pass
hit `listen EPERM 127.0.0.1` with the probe green.

Attack: name another prerequisite the tests use that the probe still does not
exercise (tmpdir writes, `startGrabSession`, DNS, port exhaustion, the
`waitForFunction` timeout). Is a probe that binds ONE ephemeral port evidence
that the test's own bind will succeed?

## Claim 3 — the source test now survives a missing browser

`process.exit(0)` deleted; `dist/grab-bridge.js` imported lazily inside
`withOverlay`. Measured with `PLAYWRIGHT_BROWSERS_PATH=/nonexistent`: 2 tests,
1 pass, 1 skipped, exit 0.

Attack: does that measurement actually exercise the claimed path (a MISSING
playwright vs a missing browser binary are different failures)? Is there any
remaining module-scope import or top-level await that can still take the source
test down? Does the skip message distinguish the two causes?

## Claim 4 — the harness cannot grade a crash as green

`run()` now aborts on `spawnSync` error or signal and requires
`(status === 0) === (fail === 0)`.

Attack: find a run where status and summary agree and the result is still wrong —
e.g. the suite silently executing fewer tests than intended, a mutant that makes
the file fail to parse at the TEST level, or the `pass + fail !== 2` guard being
the thing that actually catches it rather than the new check.

## Claim 5 — the three round-4 mutants measure what they claim

A12/A13/A14, each radius 1 today and each measured `fail=0` before the fix.
A13 was moved off the Instructions site after its radius was found to come from
the geometry test rather than the enumeration test.

Attack: is each mutant's PRE-FIX survival attributable to the mechanism named, or
to something incidental? Is each one a genuine misalignment when rendered, or is
any of them inert? Could any of them pass post-fix for a reason other than the
fix?

## Cross-cutting

- Re-verify the mirror (`cmp browser/raven-grab.js web/public/raven-grab.js`).
- Confirm no product code changed in rounds 3–4.
- Check `CLAUDE.md` line 5 and the alignment landmine against the code. Any
  number, line reference or radius that has decayed is a finding — round 4 found
  one there ("8 alignment mutants" against a v5 matrix of 9).
- The full suite is 1481/1478/0/3. Confirm round 4 added and deleted no test.

Output format: findings as `P1/P2/P3 — file:line — defect — correct behavior`,
then a single line `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
