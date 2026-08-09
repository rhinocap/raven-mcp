## READ THIS FIRST — the browser gate is unavailable to you, and that is expected

Attempt 1 of this pass spent its whole budget trying to execute the browser suite
and the mutation matrix, hit the host sandbox (`MachPortRendezvousServer …
Permission denied (1100)`), and returned a status note with NO findings and NO
verdict. Do not repeat that.

- **Do NOT run `npm test`, the style-versions suite, or `version-mutants.mjs`.**
  Chromium cannot launch in your sandbox. The suite will register 23 tests and
  skip all 23; the matrix will correctly abort on its declared 0-skip baseline.
  Neither outcome tells you anything about the code.
- **Do NOT search the web.** Everything you need is in the repo.
- **This is a CODE-READING audit.** Read the source, the tests and the harness,
  and refute the claim from what they actually say and do.
- The measurements below are GIVEN. You may argue they are the wrong measurement,
  or that a passing test proves less than it is claimed to prove — that is a
  legitimate and valuable finding — but you cannot re-run them, so do not try:
    - full suite: 1518 tests / 1515 pass / 0 fail / 3 skipped, exit 0
    - matrix v5: 29 mutants, 29 killed, 0 survived; 2 controls, 0 false-failed,
      against a declared 23p/0f/0s baseline
- **You must end with findings and a verdict line.** If you run low on budget,
  write the findings you have rather than a status note.

# Falsification brief — named style versions, round 5 (audit the round-4 FIXES)

You are an adverse reviewer. Your job is to REFUTE the claim below, not to confirm it.
Report only — do not edit any file. Default to "does not survive" when uncertain.

## The claim under audit

> Sol round 4 returned DOES NOT SURVIVE on the named-style-versions feature in the
> Raven Grab overlay (2 × P2 + 1 × P3). Both P2s are fixed with a browser test and
> a mutant each, the P3 is corrected, and the feature now survives a re-measured
> 29-mutant matrix (0 survived, 2 controls green) plus a full suite.

## What the feature is

Named style versions: the user saves the active draft's BASE style edits under a
name, then lists / restores / deletes them. Storage is `sessionStorage`, scoped by
CSS selector. Versions cover base styles only and refuse while the draft also holds
a hover/focus state edit, a token intent, or a text edit.

## The two round-5 fixes to attack

1. **`styleValueSupported` is now an AND, not a fallback** (`browser/raven-grab.js`
   ~4490). The engine probe (set the declaration on a detached `<div>`, ask whether
   the property came back set) is UNCONDITIONAL; `window.CSS.supports` is consulted
   first and can only return `false` early. The claim is that a page-replaced
   `CSS.supports` can now only make the check STRICTER, never looser, and that
   looser is the only direction that destroys work. The `CSS.supports` call has its
   own try/catch; a throw is treated as no opinion.
   - Called at three sites: the commit gate, the read-side filter
     (`isStyleVersionEdits`), and the pre-restore appliability check.
   - Stated residual: poisoning `CSSStyleDeclaration.prototype.setProperty` /
     `getPropertyValue` defeats the probe. The argument for not guarding it is that
     the same poisoning defeats the APPLY path (`commitStyleEdit`, `clearStyleEdit`,
     `restoreStyleEdit` all write through those two methods), so nothing lands and
     nothing is destroyed. **Attack that argument.**
2. **The pre-restore guard is `.every()`, not `.some()`** (~4940). A restore is
   all-or-nothing: under `.some()` one appliable property admitted the whole
   restore, the revert ran over everything, and the rest was silently refused.
   `commitStyleEdit`'s return is still ignored in the apply loop, and the claim is
   that the pre-check earns that — it can only return false for no-targets
   (asserted immediately above), an unsupported value (excluded by `.every()`), or
   `newValue === currentValue`, which is a no-op and a successful restore.

## Files to read

- `browser/raven-grab.js` — the feature. Grep `styleVersion`, `styleValueSupported`,
  `restoreStyleVersion`, `isStyleVersionEdits`.
- `test/grab-overlay-style-versions.test.mjs` — 23 browser tests + the header,
  which states 16 numbered decisions and the measured matrix.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — the harness. 29 mutants +
  2 controls, a `node --check -` pre-flight, and a declared 23p/0f/0s baseline.

## Attack these specifically

- **Is the AND actually monotone?** Name any input where the AND is LOOSER than the
  probe alone, or where an honest engine's `CSS.supports` returns `false` for a
  value the probe (and the real apply path) would accept — that is a false refusal
  and a usability defect of its own.
- **Does the probe answer correctly for custom properties, shorthands, `!important`,
  logical properties, or a value the parser accepts but the property ignores?** A
  probe reporting true for garbage is the destructive no-op again; reporting false
  for a legitimate value refuses restores that should work.
- **Is the probe node reused safely?** It is a module-level `<div>` reset with
  `style.cssText = ""` before each use. Name a sequence where residue survives.
- **Is the try/catch around `CSS.supports` swallowing something it should not?**
- **Does `.every()` have a call site it does not cover?** Name a path that reaches a
  revert or an apply without passing the guard.
- **Is the "ignored return is legitimate" enumeration complete?** Read
  `commitStyleEdit` and list every `return false` it can take. If there is a fourth,
  the fix is incomplete.
- **Are the two new tests passing for the wrong reason** — a fixture that would pass
  with the mechanism deleted, an assertion that cannot fail, a precondition that is
  not asserted? This repo has recorded five tests found detecting rather than
  encoding. The matrix is evidence against this but is NOT proof: a matrix measures
  the mechanisms it names.
- **Is V29 genuinely distinct from V25?** The claim is that V25 (delete the guard)
  reddens both the all-unsupported and the partial test while V29 (`.every` →
  `.some`) reddens only the partial one. If they collapse, "all-or-nothing" is
  restated rather than measured.
- **Is any claim in the suite header or the harness FALSE as written?** Radii,
  decisions 11/15/16, the baseline declaration, the controls' behaviour-neutrality.

## Output format

For each finding: severity (P1 blocks the claim / P2 real defect / P3 a false or
imprecise claim), the file and line, the concrete input or sequence that triggers
it, and what the user actually sees. If a claim survives, say which and why.
End with a single verdict line: SURVIVES or DOES NOT SURVIVE.
