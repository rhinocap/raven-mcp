# Falsification brief — named style versions, round 4 (audit the round-3 FIXES)

You are an adverse reviewer. Your job is to REFUTE the claim below, not to confirm it.
Report only — do not edit any file. Default to "does not survive" when uncertain.

## The claim under audit

> Sol round 3 returned DOES NOT SURVIVE on the named-style-versions feature in the
> Raven Grab overlay (4 × P2 + 3 × P3). All four P2s are fixed with a test and a
> mutant each, all three P3s are corrected, and the feature now survives a
> 27-mutant matrix (27 killed, 0 survived, 2 controls green) plus a full suite of
> 1516/1513/0 fail/3 skipped.

## What the feature is

Named style versions: the user saves the active draft's BASE style edits under a
name, then lists / restores / deletes them. Storage is `sessionStorage`, scoped by
CSS selector. Versions cover base styles only and refuse while the draft also holds
a hover/focus state edit, a token intent, or a text edit.

## The five round-3 fixes to attack

1. **Empty edits map** — `.every()` is vacuously true on `{}`, so `{"edits":{}}`
   passed the shape check, rendered a row reading "0 changes", and restoring it
   cleared the live work and applied nothing. `isStyleVersionEdits` now refuses an
   empty map. (`browser/raven-grab.js` ~4575)
2. **Engine probe instead of `CSS.supports`** — the previous fallback returned
   `true` whenever `window.CSS.supports` was unavailable, handing the destructive
   no-op straight back. `styleValueSupported()` now falls back to setting the
   declaration on a detached node and asking whether the property came back set.
   (~4472; called at ~4489 commit gate, ~4599 read filter, ~4926 pre-restore)
3. **Pre-restore appliability check** — the read-side filter structurally cannot
   cover a version saved in THIS session (it never passes through
   `isStyleVersionEdits`), so restore now asks whether it can apply anything
   BEFORE it clears anything.
4. **The mirror's RECEIVING direction** — `outstandingScopeSiblingPreview` asks
   whether the selected element OWNS an outstanding component-scope mirror.
   `foreignScopeSiblingPreview` (~4765) asks whether it is RECEIVING one from
   another selection's stashed draft. Both block save and restore, and the
   refusal names the row to clear.
5. **Persist-failure notice** — a `sessionStorage` quota throw was swallowed, so a
   save that will not survive a reload looked identical to one that will. The
   throw now sets `styleVersionPersistFailed` and the panel says so; the row still
   appears, because the in-memory save DID happen.

## Files to read

- `browser/raven-grab.js` — the feature. Grep `styleVersion`, `styleValueSupported`,
  `ScopeSiblingPreview`, `isStyleVersionEdits`.
- `test/grab-overlay-style-versions.test.mjs` — 21 browser tests + the header,
  which states 14 numbered decisions and the measured matrix.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — the harness. 27 mutants +
  2 controls, a `node --check -` pre-flight, and a declared 21p/0f/0s baseline.

## Attack these specifically

- **Is any fix incomplete in the direction it claims to close?** Round 3 found the
  round-2 validity check had a fallback that handed the defect back; round 2 found
  round 1's scope rule enforced at one door of two. Look for the same shape again.
- **Does any fix have a call site it does not cover?** `styleValueSupported` is
  claimed to be one rule at three call sites. Verify all three, and verify no
  fourth path reaches a restore or a commit without it.
- **Can the empty-map refusal be defeated by a non-empty map of empty things?**
- **Does the engine probe answer correctly for custom properties, shorthands,
  `!important`, or a value the parser accepts but the property ignores?** A probe
  that reports true for garbage is the destructive no-op again.
- **Is `foreignScopeSiblingPreview` reading a stale or an incomplete set of
  drafts?** Name a concrete selection sequence where a mirror exists and neither
  blocker fires.
- **Is `styleVersionPersistFailed` ever cleared, and does the panel recover once a
  later persist succeeds?** A sticky failure notice is its own defect.
- **Are any of the 21 tests passing for the wrong reason** — a fixture that would
  pass with the mechanism deleted, an assertion that cannot fail, a precondition
  that is not asserted? This repo has recorded five tests found detecting rather
  than encoding. The matrix is evidence against this but is NOT proof: a matrix
  measures the mechanisms it names.
- **Is any claim in the suite header or the harness FALSE as written?** Radii,
  "one rule, three call sites", the pre-flight's guarantees, the baseline
  declaration, the controls' behaviour-neutrality.

## Output format

For each finding: severity (P1 blocks the claim / P2 real defect / P3 a false or
imprecise claim), the file and line, the concrete input or sequence that triggers
it, and what the user actually sees. If a claim survives, say which and why.
End with a single verdict line: SURVIVES or DOES NOT SURVIVE.
