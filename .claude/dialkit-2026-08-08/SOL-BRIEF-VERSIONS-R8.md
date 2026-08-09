## READ THIS FIRST — the browser gate is unavailable to you, and that is expected

Rounds 5 and 6 each had an attempt spend its budget trying to execute the browser
suite and the mutation matrix, hit the host sandbox (`MachPortRendezvousServer …
Permission denied (1100)`), and return a status note with NO findings and NO
verdict. Do not repeat that.

- **Do NOT run `npm test`, the style-versions suite, or `version-mutants.mjs`.**
  Chromium cannot launch in your sandbox. The suite will register 28 tests and
  skip all 28; the matrix will correctly abort on its declared 0-skip baseline.
  Neither outcome tells you anything about the code.
- **Do NOT search the web.** Everything you need is in the repo.
- **This is a CODE-READING audit.**
- The measurements below are GIVEN. You may argue they are the wrong measurement,
  or that a passing test proves less than it is claimed to prove — that is a
  legitimate and valuable finding — but you cannot re-run them, so do not try:
    - style-versions suite: 28 tests / 28 pass / 0 fail / 0 skipped, EXIT=0
    - matrix v7: 35 mutants, 35 killed, 0 survived; 2 controls, 0 false-failed,
      EXIT=0, against a declared 28p/0f/0s baseline, re-run WHOLE after the
      round-7 edits. Exactly ONE radius moved vs v6: V9 27 -> 28. V35 enters
      at radius 1, reddening only "an engine that carries setProperty on each
      declaration INSTANCE still commits supported edits".
    - full suite: 1523 tests / 1520 pass / 0 fail / 3 skipped, EXIT=0. The 3
      skips were read individually at output lines 109 / 714 / 715 and are the
      same three this repo has always carried; none is from the versions suite.
- **You must end with findings and a verdict line.** If you run low on budget,
  write the findings you have rather than a status note.

# Falsification brief — named style versions, round 8 (audit the round-7 FIXES)

You are an adverse reviewer. Your job is to REFUTE the claim below, not to confirm it.
Report only — do not edit any file. Default to "does not survive" when uncertain.

## The claim under audit

> Sol round 7 returned DOES NOT SURVIVE on the named-style-versions feature
> (1 × P2 + 2 × P3). All three are dispositioned. The P2 — "no Chromium fixture can
> separate a guarded build from an unguarded one" — was a FALSE CLAIM, and the
> disposition is the fixture itself: a 28th browser test plus mutant V35. The two
> P3s are comment corrections. The feature survives a re-measured matrix against a
> declared 28p/0f/0s baseline, plus a full suite.

## What round 7 changed

### P2-1 — the "no mutant kills the typeof gate" claim was FALSE. **Test + mutant.**

Round 6 added a `typeof` gate ahead of the probe's four `Function.prototype.call.bind`
captures (`browser/raven-grab.js` ~4575) and shipped it asserting that no Chromium
fixture could separate a guarded build from an unguarded one — reasoning that in a
conforming engine an instance method IS the prototype method, so deleting
`CSSStyleDeclaration.prototype.setProperty` breaks the captured path and the live
fallback identically. It was kept on the `isIpLiteral` precedent: a clause with no
reachable trigger must SAY so rather than let a matrix imply coverage.

**The reasoning was sound and the conclusion did not follow.** The environment the
gate exists FOR is one where the two are NOT the same method — a shim carrying
these on each declaration INSTANCE — and a fixture can construct exactly that. So
the new test injects, via `page.addInitScript` (BEFORE overlay boot), a shim that:

- redefines the `style` accessor on `HTMLElement`, `SVGElement` and `CSSStyleRule`
  prototypes to pass every declaration through one `shim()` that installs own
  `setProperty` / `getPropertyValue` delegating to the natives,
- wraps `window.getComputedStyle` the same way,
- then DELETES `setProperty` and `getPropertyValue` from
  `CSSStyleDeclaration.prototype`.

**Sol's own recipe for this fixture was under-specified, and so was the first
correction to it.** Sol shimmed `element.style` alone; the overlay also reads
`getComputedStyle(...).getPropertyValue` in seven places, so the guarded build dies
too and the test separates nothing. Adding `getComputedStyle` was still not enough:
measured with a `pageerror` probe, the guarded build then threw
`style.getPropertyValue is not a function` from `declarationsFor`
(`browser/raven-grab.js:3325`), which walks `CSSStyleRule.style` out of the page's
own stylesheets. THREE sources, not one.

Assertions, in order: a precondition `deepEqual` that the prototype methods are gone
and all three sources carry their own; a supported edit (`font-size: 24px`) commits,
makes the Versions section visible and reaches the element; the version saves; and —
the other direction — `letter-spacing: definitely-not-a-length` is still refused.

**V35** deletes the `typeof` gate. The source comment, the suite header and the
CLAUDE.md ledger all previously said no mutant kills it; all three now say the
opposite and explain why the `isIpLiteral` precedent does not transfer.

### P3-2 — the fixtures' selectivity claim was false. **Comments only.**

The header claimed all three poison fixtures answer with the decoy only for the
detached, attribute-less `<div>` the probe builds. Only V34's does. V31 matches on
the (property, value) PAIR; V32 on an EMPTY `letter-spacing` read.

Round 7 then verified the round-6 correction and narrowed it further: **V31 measures
landing and V32 does not.** V32 poisons only `getPropertyValue`, so the NATIVE setter
still rejects the garbage and no `2px` is ever written to `#card` — its red comes
from the `sectionVisible === false` assertion, i.e. from the invalid edit being
RECORDED. A latent consequence is now stated rather than hidden: the V32 poisoned
reader corrupts the original-inline capture at `browser/raven-grab.js:4284`, so a
later clear/revert would write a value the user never typed. Real, unasserted.

### P3-3 — `src/reference-forget.ts` does not exist. **Citation only.**

The `isIpLiteral` precedent is in `src/reference-store.ts:479`. Corrected in the
source comment, the suite header and the ledger.

## Files to read

- `browser/raven-grab.js` — grep `probeCreateDiv`, `probeGetStyle`,
  `probeSetProperty`, `probeGetPropertyValue`, `probeStyleValueSupported`,
  `styleValueSupported`, `styleSupportMemo`, `restoreStyleVersion`,
  `declarationsFor`, `commitStyleEdit`, `captureStyleOriginals`.
- `test/grab-overlay-style-versions.test.mjs` — 28 tests; the new one is LAST.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — mutants + controls, a
  `node --check -` pre-flight, and a declared 28p/0f/0s baseline.
- `web/public/raven-grab.js` — must stay byte-identical to `browser/raven-grab.js`.

## Attack these specifically

- **Does the new test measure the GATE, or does it measure the shim?** State the
  exact behavioural difference between the guarded and unguarded builds under this
  fixture, and name the assertion that changes. If every assertion would also pass
  with the gate deleted for some other reason, V35's kill is an artefact.
- **Is the shim now complete?** Assume there is a FOURTH source of a
  `CSSStyleDeclaration`. Enumerate every way the overlay obtains one. `cssText`,
  `removeProperty`, `CSSKeyframeRule`, `CSSPageRule`, `CSSFontFaceRule`,
  `element.attributeStyleMap`, `document.styleSheets` insertion, a declaration
  reached through a constructed `CSSStyleSheet` — does any reach the overlay?
- **Is `addInitScript` + pre-boot injection a violation of this suite's own
  boundary?** Every other poison fixture injects AFTER load, and the stated residual
  is that pre-injection is unclosable. The new test's comment argues it models a
  benign non-conforming ENGINE rather than a hostile page. Is that distinction real,
  or is the test quietly measuring the unclosable case and calling it a fixture?
- **Does the shim change the CONFORMING build's behaviour beyond the gate?** Name
  anything the overlay does that behaves differently under the shim for a reason
  unrelated to the gate — a `hasOwnProperty` check, a `Object.keys` walk, an
  identity comparison between two reads of `.style`, a `for…in`. If so, the test's
  green is contingent and its comment does not say so.
- **Is the `SVGElement` entry honest?** The comment says it is unexercised on this
  path today and included cheaply. Is that true, or does the overlay actually read
  an SVG element's `style` during selection or rendering — in which case the comment
  understates its load-bearing-ness.
- **The precondition SCANS for the first rule carrying `style` and a string
  `selectorText`.** Can that scan select a rule from an OVERLAY-injected stylesheet
  rather than the fixture's own, and does it matter? Can it return null and throw a
  confusing error instead of a clean precondition failure?
- **Is the closing negative-direction assertion falsifiable?** It reads
  `#card`'s inline `letter-spacing` and demands `''`. Name the mutation that makes
  the probe accept everything and confirm this assertion goes red under it — and
  confirm it would NOT already be `''` for an unrelated reason.
- **Are the two corrected P3 claims now TRUE as written?** Read the V31 and V32
  fixtures and the header paragraph. Does V31 genuinely land a `2px` the user never
  typed on a CONNECTED element, and does V32 genuinely land nothing?
- **Is any OTHER claim in the suite header or the harness false as written?** Radii,
  decisions 11/12/15/16/17/18, the baseline declaration, the controls'
  behaviour-neutrality, the count of tests, V24's twice-re-anchored find-string.
- **Are the 28 tests passing for the wrong reason** — a fixture that would pass with
  the mechanism deleted, an assertion that cannot fail, a precondition that is not
  asserted? This repo has recorded five tests found detecting rather than encoding,
  and TWO of the new test's own three failures before it went green were defects in
  its own assertions, not in the product.

## Output format

For each finding: severity (P1 blocks the claim / P2 real defect / P3 a false or
imprecise claim), the file and line, the concrete input or sequence that triggers
it, and what the user actually sees. If a claim survives, say which and why.
End with a single verdict line: SURVIVES or DOES NOT SURVIVE.
