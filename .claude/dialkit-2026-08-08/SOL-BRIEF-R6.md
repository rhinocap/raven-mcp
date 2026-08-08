# Falsification brief — round 6

Report-only. Do not edit any file. Your job is to find where the round-5 fixes
are WRONG, not to agree that they are better than round 4.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, open-source MCP server).

## What changed in round 5

Round 5 was itself an adverse round against round 4. It found four defects and
fixed all four, **all test-side — no product code changed in rounds 3, 4 or 5.**
Everything below is the new attack surface.

### Target file

`test/grab-overlay-voice-alignment.test.mjs` (~800 lines). Two tests:

1. `:348` — a rendered geometry test: boots a bridge session, injects the real
   overlay into a Chromium page, and asserts every mic is flush with the right
   edge of its row.
2. `:460` — a SOURCE-ENUMERATION test: reads `browser/raven-grab.js` (via
   `RAVEN_GRAB_ASSET_PATH` when set), finds all 8 `voiceButtonMarkup(` call
   sites, and asserts each is enclosed by one of three covered containers. It is
   the ONLY guard on the two mics in template-mode rows the browser test
   structurally cannot render.

### Fix 1 — token-based lookbehinds (`:542`, `:578`, `:588`, `:594`, `:595`)

`CONTROL_HEAD`, a regex over 24 characters of the RAW source, was replaced by:

- `CONTROL_WORDS` — a Set of `if while for switch catch with`
- `prevSignificant(at, skipNewlines)` — walks back over spaces/tabs (and
  newlines when asked) in the `code` view
- `wordEndingAt(k)` — reads a whole `[\w$]+` identifier ending at `k`
- `isControlHead(at)` / `opensRegex(at)` — both now read `code`, never raw `js`

The claimed justification: the scan is strictly left-to-right, so every comment
BELOW the cursor is already blanked to spaces in `code`, which turns "the
previous significant character" into an ordinary whitespace skip.

### Fix 2 — a THIRD view, `glue`, and a concatenation-only enclosure rule

`scanSource` (`:547`) now builds three offset-preserving views:

- `code` — JS comments blanked; call sites are found here
- `markup` — string-literal CONTENTS only, in-string HTML comments blanked; the
  tag-depth walk runs here
- `glue` — `code` with every string interior, opening quote, closing quote,
  escape run, `${`, and in-string HTML comment blanked

`enclosedByCovered(before, windowStart, micAt)` at `:774` now requires
`CONCATENATION_ONLY = /^[\s+]*$/` (`:773`) to match `glue.slice(windowStart + end, micAt)`
before accepting a covered opener as the anchor.

The stated reframing: **"the walk reads markup, not JavaScript" was never the
property — a string is not markup either; it becomes markup when something
CONCATENATES it into the output.**

Two claims in the comment are load-bearing and are exactly what you should try
to break:

- **Sufficiency of `lastIndexOf`.** "Checking only the LAST occurrence of each
  opener string is sufficient and not a shortcut: an earlier occurrence's glue
  region is a superset of the later one's, so if the later fails, the earlier
  fails too."
- **Accepted conservatism.** A site writing
  `'…<span>' + escapeHtml(label) + voiceButtonMarkup(…)` is expected to fail
  RED, deliberately, because nothing in the scan can tell whether that call
  emits a `</span>`.

### Fix 3 — the probe gate (`:296`, `:340`, `:349`)

- `withOverlay`'s `listen` promise gained `upstream.once('error', reject)`
- the skip moved from the geometry test's `catch` to its FIRST line (`:349`)
- `skipIfNoBrowser(t)` lost its second parameter; `!chromiumAvailable` is the
  whole condition

The module-load probe at `:258` walks listen → launch → newPage → goto → close.

## Measured evidence you are attacking

Do not re-derive these; attack them.

```
matrix v7 (.claude/dialkit-2026-08-08/agent-output/align-r5-v7.out)
  17 anchors unique; baseline 2 pass / 0 fail
  A1,A2,A3 = 1   A4 = 1 @:8518   A5 = 1 @:8552   A6 = 2   A7 = 2
  A8,A9,A12,A13,A14 = 1 @:8552   A15,A16,A17 = 1 @:8552
  A10, A11 CONTROLS: 0 red  ok
  15 mutants, 15 killed, 0 survived; 2 controls, 0 false-failed   EXIT=0

pre-fix (align-r5-prefix.out): A15, A16, A17 all radius 0 *** SURVIVED ***
lexer-only (align-r5-lexeronly.out): 15 mutants, 14 killed — A15 still surviving

full suite:      1481 / 1478 / 0 / 3, EXIT=0
browser-absent:  PLAYWRIGHT_BROWSERS_PATH=/nonexistent -> 2 tests / 1 pass / 1 skipped, EXIT=0
mirror:          cmp browser/raven-grab.js web/public/raven-grab.js  -> identical
```

The mutant harness is `.claude/dialkit-2026-08-08/align-mutants.mjs`
(string-edit mutants applied to a COPY served through `RAVEN_GRAB_ASSET_PATH`;
preflight asserts every anchor is unique and every mutation changes the file).

## What to attack, in rough priority order

1. **The `glue` view's own correctness.** It is produced by the same lexer whose
   holes rounds 3, 4 and 5 each patched. Find a construct where `glue` is
   MISALIGNED with reality — a string form, escape form, template-literal
   nesting, or comment shape where a character is blanked that should not be, or
   left that should be blanked. Nested template literals and `${}` inside a
   string inside an interpolation are the obvious places to push.
2. **The `lastIndexOf` sufficiency claim.** Construct an input where an EARLIER
   occurrence of a covered opener would be accepted and the later one rejected,
   contradicting the superset argument. `COVERED` holds three DIFFERENT opener
   strings and each is searched independently — does the superset argument
   survive that?
3. **The conservatism trade.** Is there a construct in the CURRENT overlay, or
   one a plausible edit would introduce, that now fails RED incorrectly? A false
   fail is the failure mode the two CONTROLS exist for and a matrix that only
   asks "does this turn red" is blind to it.
4. **The token lookbehinds.** `wordEndingAt` reads `[\w$]`. What about a
   Unicode identifier, a keyword reached across a newline that
   `prevSignificant(at, false)` will not skip, or a `)` that is NOT the most
   recently closed paren — the comment at `:598` asserts it necessarily is.
5. **The `parenIsControl` stack and `lastCloseWasControl`.** Round 4 introduced
   them; round 5 changed what pushes onto them. Is there a paren shape that
   desyncs the stack (arrow-function parameter lists, `for` headers with
   parenthesised expressions, an optional-call `?.(`)?
6. **The relocated gate.** With the skip at the top of the test, is any
   environmental prerequisite still unprobed? The probe binds a loopback server,
   launches, opens a page, navigates and closes. `withOverlay` also does
   `mkdtemp`, `writeFile`, and builds a bridge session. Can any of those fail in
   a way now reported as a product defect?
7. **Anything in the header comment that is now FALSE.** Rounds 2, 3, 4 and 5
   each found a comment claiming more than the code delivers. Comments in this
   file are treated as claims and decay like tests, except nothing executes
   them.

## Rules

- A finding is a CLAIM until it is measured. Where you can, state the exact
  construct and what the suite would report — pass/fail counts, not adjectives.
- Distinguish a real defect from a stylistic preference. P1 = the suite reports
  green on a real misalignment, or red on a correct one. P2 = a narrower or
  harder-to-reach version of that. P3 = a false claim in a comment.
- Do not propose adding tests as a finding in itself; name the DEFECT.
- Report only. End with `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
