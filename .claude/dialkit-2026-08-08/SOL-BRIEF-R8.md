# Falsification brief — round 8

Report only. Do not edit any file. End with `VERDICT: SURVIVES` or
`VERDICT: DOES NOT SURVIVE`.

## Target

`test/grab-overlay-voice-alignment.test.mjs` in this repo. Two tests:

1. a rendered-geometry test (real Chromium, the overlay served against a fixture)
2. a SOURCE-ENUMERATION test that reads `browser/raven-grab.js` and asserts every
   `voiceButtonMarkup(...)` call sits inside a container the shared stylesheet
   rule aligns

Test 2 is the only guard on two mics that live in template-mode rows the browser
test structurally cannot render. If test 2 can be fooled on one of those rows,
the whole suite reports green on a real misalignment.

## What changed in round 7

Seven fixes, all test-side. No product code has changed in rounds 3–7.

1. The three covered-container openers became REGEXES requiring a real element
   tag (`/<[a-zA-Z][\w-]*(?=[\s>])[^<>]*\bclass="…"[^<>]*>/`). Previously the
   section-heading opener was a bare attribute substring, so the same characters
   in free text counted as a container.
2. The depth COUNTER became a stack (`wellNested`): `<em></span>` balances to
   zero but a browser closes both tags, leaving the mic a sibling.
3. The `CONCATENATION_ONLY` glue check now runs from the opener's FIRST EMITTED
   character (`map[hit.index]`), not from its end. A decoy opener fused across a
   statement boundary previously passed.
4. HTML-comment dropping moved OUT of `scanSource` and INTO `emittedWindow`,
   where it only fires when `!inTag`. `<!--` inside a quoted attribute value is
   ordinary text.
5. Call-site detection walks tokens: whitespace, an ADJACENT `?.`, whitespace,
   then `(`. An optional call emits byte-identical markup.
6. `REACH = 200` now counts EMITTED characters via `windowStartFor`, which walks
   the `content` byte array backwards. `REACH_SOURCE_CAP = 20000` is a cost
   bound only.
7. The chromium probe navigates to a live loopback server and checks
   `response.ok()`; the server close moved to an outer `finally`.

## Measured evidence to attack

```
matrix v9  22 mutants, 22 killed, 0 survived; 5 controls, 0 false-failed
npm test   1481 tests / 1478 pass / 0 fail / 3 skipped, exit 0
mirror     browser/raven-grab.js == web/public/raven-grab.js
no browser 2 tests / 1 pass / 1 skipped, node exit 0
emitted distance opener->mic, all 8 sites:
  :2339 54  :8518 47  :8552 47  :10567 94
  :10583 114  :10601 97  :10612 51  :10623 52
  widest 114 against REACH 200 -> 86 margin
```

## Attack surfaces, named from round 7's own fixes

Do not limit yourself to these.

1. **The opener regexes.** `[^<>]*\bclass="…"[^<>]*>` — can a real covered
   container be written so it does NOT match (false fail), or an uncovered one
   so it does (false pass)? Consider: the class attribute written with single
   quotes or unquoted, another attribute whose VALUE contains `class="raven-…"`,
   `class` appearing as part of a longer attribute name, the `\b` boundary, a
   tag split across a concatenation so `<label` and its class arrive separately,
   and a self-closing form.
2. **`wellNested`.** Void elements are skipped by a hardcoded `VOID_TAGS` set and
   a `/>`-suffix test on the attribute run. What about a void tag not in the set,
   `<br/>` with a space before the slash, an attribute value ending in `/`, an
   unclosed `<p>` or `<li>` that HTML parsing auto-closes, `<template>`, raw-text
   elements (`<script>`, `<style>`, `<textarea>`, `<title>`) whose contents are
   not markup, and case sensitivity.
3. **The glue-from-opener-start rule.** Is it now too STRICT? A covered opener
   legitimately built from two concatenated literals is correct markup, and the
   glue between them is `' + '` — does that pass? If it does, does that reopen
   the A26 decoy? Find the boundary.
4. **`emittedWindow`'s `inTag` tracking.** It flips on bare `<` and `>` with no
   awareness of quoting. A `>` inside an attribute VALUE clears `inTag` early; a
   `<` inside an attribute value sets it. Construct the case where that
   mis-classifies a real `<!--` or a real comment.
5. **The `?.` adjacency walk.** `identBefore(match.index) === 'function'` is the
   only exclusion. What about `obj.voiceButtonMarkup(`, `new voiceButtonMarkup(`,
   `voiceButtonMarkup` as a property KEY (`{ voiceButtonMarkup(x) {} }`), a
   line comment between the identifier and the `(` (the walk skips `\s` in
   `glue`, where comments are NOT blanked — `glue` is derived from `code`, so
   they are; verify that claim rather than trusting this sentence), and
   `voiceButtonMarkup?.call(`.
6. **`windowStartFor`.** It walks backwards from `micAt` until `REACH` emitted
   characters or `REACH_SOURCE_CAP` source characters. The window start can land
   in the MIDDLE of a tag or a multi-slot escape. Does a truncated opener at the
   window edge ever match a regex it should not, or fail to match one it should?
   Is the 86-character margin actually a margin, given the window is measured
   from the mic and the openers are measured from their own start?
7. **The probe.** It now covers listen → mkdtemp/writeFile/rm → launch → newPage
   → goto(loopback) → ok() → close. Name a prerequisite `withOverlay` uses that
   the probe still does not, or an environment failure the probe would classify
   as a product defect. Note the deliberate boundary: `dist/grab-bridge.js` and
   `startGrabSession` are PRODUCT CODE and are not probed on purpose.
8. **Every claim in the file's header and in `CLAUDE.md`'s alignment landmine.**
   Both were rewritten this round. A false comment is a P3.

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
