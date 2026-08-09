## READ THIS FIRST — the browser gate is unavailable to you, and that is expected

Round 5's first attempt spent its whole budget trying to execute the browser suite
and the mutation matrix, hit the host sandbox (`MachPortRendezvousServer …
Permission denied (1100)`), and returned a status note with NO findings and NO
verdict. Do not repeat that.

- **Do NOT run `npm test`, the style-versions suite, or `version-mutants.mjs`.**
  Chromium cannot launch in your sandbox. The suite will register 27 tests and
  skip all 27; the matrix will correctly abort on its declared 0-skip baseline.
  Neither outcome tells you anything about the code.
- **Do NOT search the web.** Everything you need is in the repo.
- **This is a CODE-READING audit.** Read the source, the tests and the harness,
  and refute the claim from what they actually say and do.
- The measurements below are GIVEN. You may argue they are the wrong measurement,
  or that a passing test proves less than it is claimed to prove — that is a
  legitimate and valuable finding — but you cannot re-run them, so do not try:
    - style-versions suite: 27 tests / 27 pass / 0 fail / 0 skipped, EXIT=0
    - matrix v6: 34 mutants, 34 killed, 0 survived; 2 controls, 0 false-failed,
      EXIT=0, against a declared 27p/0f/0s baseline, re-run WHOLE
    - full suite: 1522 tests / 1519 pass / 0 fail / 3 skipped, EXIT=0
    - measured radii: V30=1 (flip test alone), V33=2 (the two in-session
      refusal tests, NOT the flip test), V31=V32=V34=1 each, V24=5, V28=4
- **You must end with findings and a verdict line.** If you run low on budget,
  write the findings you have rather than a status note.

# Falsification brief — named style versions, round 6 (audit the round-5b FIXES)

You are an adverse reviewer. Your job is to REFUTE the claim below, not to confirm it.
Report only — do not edit any file. Default to "does not survive" when uncertain.

## The claim under audit

> Sol round 5b returned DOES NOT SURVIVE on the named-style-versions feature in the
> Raven Grab overlay (2 × P2 + 1 × P3). All three are dispositioned — two fixed with
> a browser test and a mutant each, one comment corrected — and the feature now
> survives a re-measured mutant matrix (0 survived, 2 controls green) against a
> declared 27p/0f/0s baseline, plus a full suite.

## What the feature is

Named style versions: the user saves the active draft's BASE style edits under a
name, then lists / restores / deletes them. Storage is `sessionStorage`, scoped by
CSS selector. Versions cover base styles only and refuse while the draft also holds
a hover/focus state edit, a token intent, or a text edit.

## The three round-5b findings and what was done about them

### P2-1 — the support verdict could FLIP between the pre-check and the apply

`restoreStyleVersion` asks `styleValueSupported` for every property (`.every()`),
then reverts, then calls `commitStyleEdit` per property — and `commitStyleEdit`
asks the SAME predicate again. A page-replaceable `CSS.supports` can answer true
the first time and false the second, which reassembles round 3's destructive
no-op out of two individually honest invocations: the revert runs, nothing lands.

**Fix — the verdict is memoized per `(property, value)` FOR THE DURATION OF ONE
RESTORE.** `styleSupportMemo` is `null` outside a restore (every ask is live);
`restoreStyleVersion` saves the outer value, installs a fresh `Object.create(null)`
map, delegates the whole body to `applyStyleVersionRestore(version)`, and restores
the outer in a `finally`.

**The scope is the load-bearing half, and it was decided by MEASUREMENT.** The first
draft of this fix used a GLOBAL memo. That closes the same flip and is strictly
worse: every in-session version's values were probed at commit time and every stored
version's by `isStyleVersionEdits` at hydrate, so no version that can exist has a
verdict left to change — which makes the round-4 pre-restore guard UNREACHABLE,
exactly the outcome round 4 refused when it declined to drop `CSS.supports` from the
AND. The global draft was written, run, and turned the two tests owning V25 and V29
red on unchanged product logic. It is mutant **V33**; **V30** deletes the memo
outright. Two mutants on one mechanism, separated by which set they redden.

### P2-2 — the round-4 residual's justification was FALSE

Round 4 declined to guard against poisoning `CSSStyleDeclaration.prototype.setProperty`
/ `getPropertyValue` on the argument that the same poisoning defeats the APPLY path
"in the same stroke", so nothing lands and nothing is destroyed. Sol refuted it with
a **selective wrapper**: a `setProperty` that substitutes a valid value for exactly
the garbage the probe writes and delegates everything else natively leaves the apply
path working while the probe reports true.

**Fix — the probe's FOUR primitives are captured at load** via
`Function.prototype.call.bind(...)` on `Document.prototype.createElement`, the
`style` GETTER off `Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style")`,
`CSSStyleDeclaration.prototype.setProperty` and `…getPropertyValue`, with
live-lookup fallbacks. The residual now stated honestly: PRE-injection poisoning
is unclosable from inside a shared realm, and Raven's shadow root is open, so this
is a correctness mechanism against garbage in hand-editable storage, NOT a security
boundary against the page.

**The fourth primitive was found by READING, one round late, and that is itself
worth attacking.** The first version of this fix captured three and then wrote
`probeCreateDiv().style` — reading the accessor live, so a page that redefines
the `style` getter post-load hands back a decoy declaration already carrying the
property, `getPropertyValue` returns non-empty for garbage the parser rejected,
and the probe reports TRUE. That is the destructive direction, and decision 15's
AND does not rescue it because the same page hands back a lying `CSS.supports`
in the same breath. The matrix at the time was green and blind to it. The capture
is now **ALL-OR-NOTHING** — every raw lookup runs before any assignment — so an
engine missing one prototype falls back on all four rather than running a
half-captured probe whose covered half is impossible to reason about.
**Assume there is a fifth. Enumerate every DOM operation the probe performs and
every property lookup each one goes through.**

### P3 — a comment described the pre-round-4 contract

Header decision 12 still read "CAN APPLY ANYTHING BEFORE IT CLEARS ANYTHING", the
existential contract round 4 replaced with `.every()`. Corrected, along with the V25
comment.

## Files to read

- `browser/raven-grab.js` — the feature. Grep `styleVersion`, `styleSupportMemo`,
  `styleValueSupported`, `probeStyleValueSupported`, `probeCreateDiv`,
  `probeGetStyle`, `probeSetProperty`, `probeGetPropertyValue`, `restoreStyleVersion`,
  `applyStyleVersionRestore`, `isStyleVersionEdits`, `commitStyleEdit`.
- `test/grab-overlay-style-versions.test.mjs` — 27 browser tests + the header,
  which states 18 numbered decisions and the measured matrix.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — the harness. 34 mutants +
  2 controls, a `node --check -` pre-flight, and a declared 27p/0f/0s baseline.
- `web/public/raven-grab.js` — must stay byte-identical to `browser/raven-grab.js`.

## Attack these specifically

- **Is the memo's SCOPE correct?** Name any path that reaches a revert or a
  `commitStyleEdit` for a version restore WITHOUT passing through
  `restoreStyleVersion` (and therefore without the memo). Name any path that
  reaches `styleValueSupported` INSIDE a restore whose answer should NOT be frozen.
- **Is the `finally` sound?** Can `styleSupportMemo` be left installed after a
  restore — an exception, an early return, a reentrant call, an event handler that
  runs synchronously inside the apply loop and calls back into the overlay? A memo
  that leaks into normal operation reinstates the global form and its unreachable
  guard, silently.
- **Is the KEY injective?** The key is `property + " " + value`. State the property
  under which two distinct `(property, value)` pairs cannot produce the same key,
  and check the comment in the source states THAT property and not a different one.
  Values contain spaces; property names are the half that must not.
- **Is `Object.create(null)` enough?** `key in map` on a null-prototype object — can
  a page still plant a key, or make `in` lie?
- **Does the memo make the round-4 guard reachable in PRACTICE, or only in
  principle?** Name the concrete sequence in which an in-session version's verdict
  legitimately changes between its commit and its restore. If none exists, the
  round-5b fix has merely moved the unreachability, and the two tests owning V25 and
  V29 are passing for a reason other than the one claimed.
- **Do the captured primitives actually cover the probe?** Read
  `probeStyleValueSupported` and name every DOM operation it performs. Any operation
  reached through an uncaptured page-replaceable property is the same hole one step
  over — `style` itself, `cssText`, `removeProperty`, the element's own prototype.
- **Is the `Function.prototype.call.bind` capture itself safe?** It is evaluated at
  load; name what must already be poisoned for it to capture a liar, and confirm the
  stated pre-injection residual covers exactly that and not less.
- **Are the live-lookup fallbacks a bypass?** If a captured primitive is missing at
  load, the code falls back to a live lookup. Name the environment where that fires
  and whether it is distinguishable from the poisoned case.
- **Is V34 genuinely distinct from V31/V32?** `style` is an accessor and the other
  two are data properties on a different prototype, so the claim is that they are
  three levers on three objects and not one rule restated. If the three poison
  fixtures collapse into one mechanism, say so.
- **Are the FOUR new tests passing for the wrong reason** — a fixture that would
  pass with the mechanism deleted, an assertion that cannot fail, a precondition
  that is not asserted? This repo has recorded five tests found detecting rather
  than encoding. The matrix is evidence against this but is NOT proof: a matrix
  measures the mechanisms it names.
- **Is V30 genuinely distinct from V33?** The claim is that V30 (memo deleted)
  reddens the flip test alone and V33 (memo global) reddens the two in-session
  refusal tests and NOT the flip test. If they collapse, "the scope is the
  load-bearing half" is restated rather than measured.
- **The `probeCreateDiv` capture has NO mutant and no fixture**, and the suite header
  says so. Is that honest, or is it a mechanism claiming coverage it does not have?
- **Is any claim in the suite header or the harness FALSE as written?** Radii,
  decisions 11/12/15/16/17/18, the baseline declaration, the controls'
  behaviour-neutrality, V24's re-anchored find-string.

## Output format

For each finding: severity (P1 blocks the claim / P2 real defect / P3 a false or
imprecise claim), the file and line, the concrete input or sequence that triggers
it, and what the user actually sees. If a claim survives, say which and why.
End with a single verdict line: SURVIVES or DOES NOT SURVIVE.
