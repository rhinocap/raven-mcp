# Falsification brief — round 7

Report-only. Do not edit any file. Your job is to find where the round-6 fixes
are WRONG, not to agree that they are better than round 5.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, open-source MCP server).

## What changed in round 6

Round 6 was itself an adverse round against round 5. It returned DOES NOT
SURVIVE with 4 × P1 + 1 × P2, and all five were fixed — **all test-side; no
product code changed in rounds 3, 4, 5 or 6.** Everything below is the new
attack surface.

### Target file

`test/grab-overlay-voice-alignment.test.mjs` (~900 lines). Two tests:

1. a rendered geometry test: boots a bridge session, injects the real overlay
   into a Chromium page, and asserts every mic is flush with the right edge of
   its row.
2. a SOURCE-ENUMERATION test: reads `browser/raven-grab.js` (via
   `RAVEN_GRAB_ASSET_PATH` when set), finds all 8 `voiceButtonMarkup(` call
   sites, and asserts each is enclosed by one of three covered containers. It is
   the ONLY guard on the two mics in template-mode rows the browser test
   structurally cannot render.

### Fix 1 — lexical call-site enumeration

The scan moved from `view.code` (comments blanked, string contents KEPT) to
`view.glue` (string interiors, quotes, escape runs, `${` and in-string HTML
comments all blanked). It now matches the bare identifier `voiceButtonMarkup`,
rejects a hit with an identifier character on either side, walks forward over
whitespace to require `(`, and rejects the declaration by reading the preceding
TOKEN via `identBefore` and comparing it to `function`.

### Fix 2 — existential enclosure

`enclosedByCovered(windowStart, micAt)` no longer uses `lastIndexOf`. Every
occurrence of every opener in `COVERED` is a candidate; the mic is covered if
ANY candidate satisfies both `CONCATENATION_ONLY = /^[\s+]*$/` over the glue
region and `balancedToDepthZero` over the walk region.

### Fix 3 — `content` and `emittedWindow`

`scanSource` now returns `content`, a `Uint8Array` marking source positions that
contribute a character to the rendered string. `emittedWindow(a, b)` builds the
emitted text plus a map back to source offsets, and the enclosure rule runs over
that instead of over `view.markup` slices. The escape decoder gained an `emits`
flag so a LineContinuation (`\` before LF, CR, CRLF, U+2028, U+2029) emits
nothing.

Claimed consequence, which is exactly what you should try to break: fusing
string fragments is safe **because the glue predicate already requires the
anchor-to-mic region to be nothing but whitespace and `+`.**

### Fix 4 — accepted conservatism, with a legible message

`+ ('') +` between the container and the mic is still reported UNCOVERED. This
is accepted, not fixed; the mitigation is the assertion message, which names
both readings and tells the author to concatenate literal fragments.

### Fix 5 — widened probe, relocated cleanup

The module-load probe now walks listen → mkdtemp → writeFile → rm → launch →
newPage → goto → close. `withOverlay` moved all setup inside its `try` so the
upstream server is closed on every path; `session` and `browser` are declared
outside so the `finally` tears down only what started. The lazy
`dist/grab-bridge.js` import and `startGrabSession` are deliberately NOT probed
on the grounds that they are product code.

## Measured evidence you are attacking

Do not re-derive these; attack them.

```
matrix v8 (.claude/dialkit-2026-08-08/agent-output/align-r6-v8.out)
  21 anchors unique; baseline 2 pass / 0 fail
  A1,A2,A3 = 1   A4 = 1 @:8518   A5 = 1 @:8552   A6 = 2   A7 = 2
  A8,A9,A12,A13,A14,A15,A16,A17 = 1 @:8552
  A18 = 1 (count assertion, 9 !== 8)      A21 = 1 @:8553
  A10, A11, A19, A20 CONTROLS: 0 red  ok
  17 mutants, 17 killed, 0 survived; 4 controls, 0 false-failed   EXIT=0

A21 two-stage attribution (a CONJUNCTION, both halves necessary):
  compression off, `emits` on     -> A21 SURVIVES  2 pass / 0 fail
  compression on,  `emits` forced -> A21 SURVIVES  2 pass / 0 fail

full suite:      1481 / 1478 / 0 / 3, EXIT=0
browser-absent:  PLAYWRIGHT_BROWSERS_PATH=/nonexistent -> 2 tests / 1 pass / 1 skipped, exit 0
mirror:          cmp browser/raven-grab.js web/public/raven-grab.js -> identical
```

The mutant harness is `.claude/dialkit-2026-08-08/align-mutants.mjs`
(string-edit mutants applied to a COPY served through `RAVEN_GRAB_ASSET_PATH`;
preflight asserts every anchor is unique and every mutation changes the file).

## What to attack, in rough priority order

1. **The existential rule's own false-positive surface.** Round 5's single
   anchor was too narrow; is "any anchor" now too wide? Construct an input where
   some occurrence of a covered opener passes both predicates while the mic is
   genuinely NOT inside a covered container at runtime. Fusion across string
   fragments is the obvious place to push, since `emittedWindow` concatenates
   every emitting position in the window regardless of which literal it came
   from — can two unrelated fragments fuse into an opener that never exists in
   the output?
2. **`content` correctness.** It is set in exactly two places. Is there a
   construct where a position emits a character and is not marked, or is marked
   and emits nothing? Template literals, `${}` frames re-entered after an
   interpolation, the `<!--` in-string branch, an unterminated string at EOF, an
   astral escape collapsed to a space, and the `ch.length !== 1` fallback are
   all candidates.
3. **`emittedWindow`'s offset map.** `endSrc = map[at + opener.length - 1] + 1`.
   Is `+ 1` right when the opener's last emitted character came from a
   multi-slot escape? Does the glue slice then start inside the escape run, and
   does that matter?
4. **REACH is still 200 SOURCE characters** while the window it feeds is now
   measured in EMITTED characters. Compression means 200 source characters can
   carry far fewer emitted ones. Is there a plausible site where the real opener
   is now out of reach, and does the constant still mean what its comment says?
5. **`identBefore` and the call-site predicate.** It skips whitespace backward
   in `glue` and reads a `[\w$]` word. What about `new voiceButtonMarkup(`, a
   property access `obj.voiceButtonMarkup(`, an optional call
   `voiceButtonMarkup?.(`, a Unicode identifier, or a `function` keyword reached
   across a newline? Which of those would misclassify, and in which direction?
6. **The widened probe.** Is any environmental prerequisite still unprobed, and
   is the product-code boundary drawn in the right place? `withOverlay` also
   reads `dist/grab-bridge.js` — an UNBUILT tree is arguably environmental, not
   a product defect. What does the suite report today on a tree with no `dist/`?
7. **Anything in the header comment or the landmine paragraph that is now
   FALSE.** Rounds 2 through 6 each found a comment claiming more than the code
   delivers. Comments here are treated as claims and decay like tests, except
   nothing executes them. The A21 conjunction claim and the "fusing is safe
   because glue already constrains the region" claim are the two most
   load-bearing.

## Rules

- A finding is a CLAIM until it is measured. Where you can, state the exact
  construct and what the suite would report — pass/fail counts, not adjectives.
- Distinguish a real defect from a stylistic preference. P1 = the suite reports
  green on a real misalignment, or red on a correct one. P2 = a narrower or
  harder-to-reach version of that. P3 = a false claim in a comment.
- Do not propose adding tests as a finding in itself; name the DEFECT.
- Report only. End with `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
