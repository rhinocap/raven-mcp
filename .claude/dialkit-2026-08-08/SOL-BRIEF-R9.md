# Falsification brief — round 9

Report only. Do not edit any file. End with `VERDICT: SURVIVES` or
`VERDICT: DOES NOT SURVIVE`.

## Target

`test/grab-overlay-voice-alignment.test.mjs` in this repo. Two tests:

1. a rendered-geometry test (real Chromium, the overlay served against a fixture)
2. a SOURCE-ENUMERATION test that reads `browser/raven-grab.js` and asserts every
   `voiceButtonMarkup(...)` call sits inside a container the shared stylesheet
   rule aligns

Eight mics exist in the source. The fixture asks for the `consumer` role, so it
renders only FIVE. Test 2 is the only guard on the other three: the two
template-mode rows (`:8518`, `:8552`) and the maintainer-only Component notes
heading (`:10601`). If test 2 can be fooled on one of those rows, the whole
suite reports green on a real misalignment.

## What changed in round 8

Six fixes, all test-side. **No product code has changed in rounds 3–8.**

1. The three covered-opener regexes became a `coveredBy(cls, tail)` factory:
   `\sclass="` (a real attribute, not any name ending in `class`) and the token
   bounded inside the value by `(?<![\w-])` / `(?![\w-])`. Previously `\b`
   accepted `data-class="…"` and `class="raven-grab-field-x"`, and the literal
   value match rejected `class="raven-grab-field extra"`.
2. `selfClosing(attrs)` requires whitespace or a quote before the `/`, so a `/`
   ending an UNQUOTED attribute value is no longer read as a solidus. The
   attribute run is deliberately not trimmed first. `RAW_TEXT_TAGS`
   (`script`/`style`/`textarea`/`title`) skip to their own close tag.
3. `emittedWindow` tracks tag state properly: a tag opens only on `<` followed
   by `[a-zA-Z!/?]`, and quoting is tracked so a `>` inside an attribute value
   does not close a tag. HTML-comment dropping still happens here, not in
   `scanSource`.
4. The call-site walk strips balanced grouping parens around the callee
   (`(voiceButtonMarkup)(…)`), refusing when the `(` is itself a call or index.
   The window and the `CONCATENATION_ONLY` check anchor at the OUTERMOST paren
   (`identStart`), not at the identifier.
5. `windowStartFor` returns `capped`, and a new assertion fails the test naming
   every site that hit `REACH_SOURCE_CAP` before reading `REACH` emitted
   characters. It was documented as a cost bound only; it can change a verdict.
6. The header's mic accounting corrected from two unrendered mics to three.

## Measured evidence to attack

```
matrix v10  27 mutants, 27 killed, 0 survived; 7 controls, 0 false-failed
npm test    1481 tests / 1478 pass / 0 fail / 3 skipped, exit 0
mirror      browser/raven-grab.js == web/public/raven-grab.js
no browser  2 tests / 1 pass / 0 fail / 1 skipped, node exit 0
emitted distance opener->mic, all 8 sites (product untouched since round 7):
  :2339 54   :8518 47   :8552 47   :10567 94
  :10583 114 :10601 97  :10612 51  :10623 52
  widest 114 against REACH 200 -> 86 margin
pre-fix measurement harness: .claude/dialkit-2026-08-08/r8-prefix-measure.mjs
```

## Attack surfaces, named from round 8's own fixes

Do not limit yourself to these.

1. **`coveredBy`.** `'<[a-zA-Z][\\w-]*(?=[\\s>])[^<>]*\\sclass="[^"<>]*(?<![\\w-])'
   + cls + '(?![\\w-])[^"<>]*"[^<>]*>' + tail`. The class attribute must be
   double-quoted — single-quoted and unquoted forms are an ACCEPTED residual
   whose stated failure direction is a red, not a silent green. Verify that
   claim: is there an unquoted or single-quoted form that produces a silent
   GREEN instead? Also: `[^"<>]*` inside the value, an attribute whose value
   legitimately contains `<` or `>`, uppercase `CLASS=`, a tag name with a
   colon or a dot, whitespace around the `=`, a duplicated `class` attribute,
   and whether the `tail` (`<span>`) can be satisfied by something that is not
   the row's own span.
2. **`selfClosing` and `RAW_TEXT_TAGS`.** The raw-text skip does
   `between.toLowerCase().indexOf('</' + name, tag.lastIndex)` and jumps
   `tag.lastIndex` to it. What about `</script >`, `</scriptx`, a `</script` in
   an attribute value, a nested `<textarea>` inside a `<title>`, and the case
   where the close tag is BEFORE `tag.lastIndex`? Does the jump ever land
   mid-tag? Is a foreign-content element (`<svg>`, `<math>`) parsed the way
   this walk assumes — `<svg><path/></svg>` versus `<svg><path></svg>`?
3. **`emittedWindow`'s tag state.** `<` followed by `[a-zA-Z!/?]` opens; quotes
   are tracked inside a tag. Construct a case where a real comment is dropped
   that should not be, or a real container is lost. Consider `<!` forms that
   are not comments (`<!DOCTYPE`, `<![CDATA[`), an unterminated quote, a `<`
   inside an attribute value while `inTag` is true, and the interaction with
   the escape-decoding and `content` byte map from `scanSource`.
4. **The grouping-paren strip.** The refusal test reads the token before the
   `(` and breaks on an identifier, `)` or `]`. What about `((f))(x)`,
   `(0, voiceButtonMarkup)(x)`, `(a ? voiceButtonMarkup : g)(x)`,
   `(voiceButtonMarkup)` used as a VALUE and not called, a `new` before it, and
   a paren pair that is a comma expression? Which of these emit byte-identical
   markup (and so are the same site) and which do not? Does anchoring at
   `identStart` ever put something into the glue region that should not be
   there, or leave something out that should?
5. **The cap assertion.** It reports `capped` when `emitted < REACH && i > 0`.
   Is `i > 0` the right exclusion — can the walk legitimately reach the top of
   the file with `emitted < REACH` on a site that IS covered, and would that be
   a silent pass? Conversely can a covered site be reported capped? Is the
   assertion ordering right relative to the coverage assertion (`assert` aborts
   at the first failure)?
6. **The pre-fix harness itself.** `r8-prefix-measure.mjs` writes a copy of the
   suite into `test/` and reverts one fix per case. Are the revert anchors
   still unique after the header rewrite? Can a revert change more than the one
   fix it names? Does the harness's own summary parsing have a failure mode
   that reads as a result?
7. **Every claim in the file's header (matrix v10, the A28–A34 block) and in
   `CLAUDE.md`'s alignment landmine round-8 paragraph.** Both were written this
   round. A false claim is a P3. In particular: "no v9 radius moved",
   "27 killed, 0 survived", "A34 is the only mutant not separated by its
   radius", and the three-unrendered-mics accounting.
8. **The probe.** listen → mkdtemp/writeFile/rm → launch → newPage →
   goto(loopback) → ok() → close. Name a prerequisite `withOverlay` uses that
   the probe still does not, or an environment failure the probe would classify
   as a product defect. Deliberate boundary: `dist/grab-bridge.js` and
   `startGrabSession` are PRODUCT CODE and are not probed on purpose.

## Rules

- **P1** = a counterexample that makes the suite report GREEN on a real
  misalignment, or RED on correct code.
- **P2** = a narrower version of the same, or a hole that needs another
  counterexample to become P1.
- **P3** = a claim in a comment, header or ledger that is false.
- Give a concrete counterexample for every finding — the exact source edit and
  what the suite reports before and after.
- If you cannot run chromium in your sandbox, say so and reason from the source;
  do not report an environment failure as a product defect.
- Report only. End with the verdict line.
