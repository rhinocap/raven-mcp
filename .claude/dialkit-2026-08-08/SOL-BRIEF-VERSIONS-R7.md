## READ THIS FIRST — the browser gate is unavailable to you, and that is expected

Rounds 5 and 6 both had an attempt spend its budget trying to execute the browser
suite and the mutation matrix, hit the host sandbox (`MachPortRendezvousServer …
Permission denied (1100)`), and return a status note with NO findings and NO
verdict. Do not repeat that.

- **Do NOT run `npm test`, the style-versions suite, or `version-mutants.mjs`.**
  Chromium cannot launch in your sandbox. The suite will register 27 tests and
  skip all 27; the matrix will correctly abort on its declared 0-skip baseline.
  Neither outcome tells you anything about the code.
- **Do NOT search the web.** Everything you need is in the repo.
- **This is a CODE-READING audit.**
- The measurements below are GIVEN. You may argue they are the wrong measurement,
  or that a passing test proves less than it is claimed to prove — that is a
  legitimate and valuable finding — but you cannot re-run them, so do not try:
    - style-versions suite: 27 tests / 27 pass / 0 fail / 0 skipped, EXIT=0
    - matrix v7: 34 mutants, 34 killed, 0 survived; 2 controls, 0 false-failed,
      EXIT=0, against a declared 27p/0f/0s baseline, re-run WHOLE after the
      product edit below
    - full suite: 1522 tests / 1519 pass / 0 fail / 3 skipped, EXIT=0
- **You must end with findings and a verdict line.** If you run low on budget,
  write the findings you have rather than a status note.

# Falsification brief — named style versions, round 7 (audit the round-6 FIXES)

You are an adverse reviewer. Your job is to REFUTE the claim below, not to confirm it.
Report only — do not edit any file. Default to "does not survive" when uncertain.

## The claim under audit

> Sol round 6 returned DOES NOT SURVIVE on the named-style-versions feature
> (3 × P3, no product defect claimed). All three are dispositioned: one produced a
> real product fix, one corrected a false claim in three places, one was refuted as
> cited and confirmed one file over. The feature survives a re-measured 34-mutant
> matrix (0 survived, 2 controls green) against a declared 27p/0f/0s baseline,
> plus a full suite.

## What round 6 actually changed

Round 6 is the first round in this cadence whose findings were ALL claim defects.
Two of the three touched a file; the third touched only a brief.

### P3-1 — the ALL-OR-NOTHING fallback claim was false. **Product fix.**

`browser/raven-grab.js` ~4554. The probe captures four primitives at load via
`Function.prototype.call.bind(...)` — `Document.prototype.createElement`, the
`style` getter off `Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style")`,
`CSSStyleDeclaration.prototype.setProperty`, `…getPropertyValue` — inside a
try/catch, with live-lookup fallbacks assigned before the try. The comment claimed
the capture is ALL-OR-NOTHING: an engine missing one primitive falls back on all
four rather than running a half-captured probe.

**The try/catch did not deliver that.** `Function.prototype.call.bind(undefined)`
does NOT throw at bind time — measured:

    bind did NOT throw
    call threw: TypeError

So a prototype OBJECT that exists while one of its METHODS is `undefined` sailed
past the catch, installed a wrapper that throws on first use, and
`probeStyleValueSupported`'s own catch returned false — **REFUSING every supported
edit** rather than falling back to the live lookup. A missing prototype object or
a missing `style` descriptor DOES throw at lookup, which is why the catch covered
those and only those.

**Fix:** a `typeof` gate ahead of the four binds, throwing into the existing catch,
with `styleDescriptor` hoisted so a missing descriptor is caught by the gate rather
than by a throwing `.get`.

**NO MUTANT KILLS THIS GATE, and the source, the suite header and decision 18 all
say so.** In a conforming engine an instance method IS the prototype method, so
deleting `CSSStyleDeclaration.prototype.setProperty` breaks the captured path and
the live fallback identically, and no Chromium fixture can separate a guarded build
from an unguarded one. The environment where it bites is a shim putting these on
each declaration INSTANCE. It is kept on the `isIpLiteral` precedent
(`src/reference-forget.ts`): a clause with no reachable trigger in the test
environment must SAY so rather than let a matrix imply coverage.

### P3-2 — the fixtures' selectivity claim was false. **Comments only.**

The suite header, the V31 fixture comment and the V32 fixture comment all claimed
each poison fixture "answers with the decoy only for the detached, attribute-less
`<div>` the probe builds". Only V34's does. V31 matches on the (property, value)
PAIR; V32 on an EMPTY `letter-spacing` read. Neither can do better — a
`CSSStyleDeclaration` exposes no owner element. Consequence now stated rather than
hidden: under V31 the poison also launders the CONNECTED `#card` apply to `2px`,
and under V32 it also rewrites the target's own original-inline capture at
`browser/raven-grab.js:4284`.

The refutation of round 4's "the same poisoning defeats the apply path in the same
stroke" is claimed to SURVIVE anyway, because each test asserts both directions:
every value other than the probe's garbage commits natively, and for the garbage
pair a `2px` the user never typed DOES land.

### P3-3 — the stale baseline. **Brief only.**

Refuted as to the files Sol cited (`grep -n "26p/0f/0s"` on the suite and the
harness returns nothing) and confirmed one file over: the round-6 brief's own
claim-under-audit paragraph said 26 while the GIVEN measurements at the top of the
same brief said 27. Fixed in the brief; no repo number changed.

## Files to read

- `browser/raven-grab.js` — grep `probeCreateDiv`, `probeGetStyle`,
  `probeSetProperty`, `probeGetPropertyValue`, `probeStyleValueSupported`,
  `styleValueSupported`, `styleSupportMemo`, `restoreStyleVersion`,
  `applyStyleVersionRestore`, `commitStyleEdit`, `captureStyleOriginals`.
- `test/grab-overlay-style-versions.test.mjs` — 27 tests + a header with 18
  numbered decisions and the measured matrix.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — 34 mutants + 2 controls.
- `web/public/raven-grab.js` — must stay byte-identical to `browser/raven-grab.js`.

## Attack these specifically

- **Is the `typeof` gate correct AND complete?** It tests four things. Name any
  primitive the probe reaches that the gate does NOT test, and any way a value can
  pass `typeof x === "function"` and still make the bound wrapper throw or lie.
  `styleDescriptor` is read once and used twice — is that read itself safe?
- **Does the gate change behaviour in the conforming case?** It must not. Name any
  engine or page state where a healthy Chromium now takes the fallback path that
  did not before. If it does, this is a P1 — the fix would be refusing edits it
  used to accept, which is the very harm it claims to remove.
- **Is `throw new TypeError(...)` into the shared catch sound?** The catch swallows
  everything. Can the gate's own throw be confused with a real capture failure in a
  way that matters, or mask a different error thrown by one of the lookups?
- **Is the "no mutant can kill it" claim TRUE?** Construct the Chromium fixture that
  separates a guarded build from an unguarded one, or state plainly that none exists.
  If one exists, the claim is false and the guard is untested by choice rather than
  by necessity — a P2.
- **Is the `isIpLiteral` precedent applied honestly, or is it a licence to ship
  unfalsifiable code?** Round 4 refused a mechanism with no reachable trigger. State
  the property that separates the two cases, and check the source states THAT
  property and not a different one.
- **Is the corrected selectivity paragraph now TRUE?** Read all three fixtures. Is
  V34's predicate genuinely receiver-selective and genuinely unreachable by the apply
  path? Does the `2px` laundering under V31 reach anything the tests assert about,
  such that a test is passing for a reason other than the one claimed?
- **Does the round-4 refutation actually survive?** The argument is that something
  lands under the poison. Trace it: name the element, the property, the value, and
  the assertion that would change if it did not.
- **Is the original-inline capture at `browser/raven-grab.js:4284` a defect in its
  own right** under either poison, beyond being a consequence worth naming?
- **Is any OTHER claim in the suite header or the harness false as written?** Radii,
  decisions 11/12/15/16/17/18, the baseline declaration, the controls'
  behaviour-neutrality, V24's twice-re-anchored find-string, the count of tests.
- **Are the 27 tests passing for the wrong reason** — a fixture that would pass with
  the mechanism deleted, an assertion that cannot fail, a precondition that is not
  asserted? This repo has recorded five tests found detecting rather than encoding.
  The matrix is evidence against this but is NOT proof: a matrix measures the
  mechanisms it names.

## Output format

For each finding: severity (P1 blocks the claim / P2 real defect / P3 a false or
imprecise claim), the file and line, the concrete input or sequence that triggers
it, and what the user actually sees. If a claim survives, say which and why.
End with a single verdict line: SURVIVES or DOES NOT SURVIVE.
