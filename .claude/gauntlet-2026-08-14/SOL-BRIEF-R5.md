# Falsification pass — round 5 (report-only)

Repo: /Users/accunliffe/projects/raven-mcp  (branch main)

## What to attack

Round 4 of an adverse loop on the `design_gauntlet` tool's HAIRLINE PROVENANCE
feature returned DOES NOT SURVIVE (2 P1 + 1 P3). Both P1s were the same shape,
and it is a DIFFERENT shape from rounds 2 and 3: not a door trusting the wrong
thing, but a cascade source the probe could not SEE at all. This round fixed
both and added guards. **Attack the fixes AND the guards.** Prior rounds'
findings are closed; do not re-report them.

Files:
- `src/design-gauntlet.ts` — the fix. `authoredSubPixel()`, the new
  `animatedSide()` helper, and the stylesheet collection loop above them.
- `test/design-gauntlet.test.mjs` — two new browser tests named `hairlines: ...`
  (an ADOPTED stylesheet; a side under an ACTIVE animation), plus a reordering
  of the assertions inside both.
- `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` — mutants G51–G54 and the
  MEASURED v10 header block.

## Claims under audit — falsify each

1. **The scan is now complete for the cascade sources this probe can read.**
   `document.styleSheets` plus `document.adoptedStyleSheets` is claimed to be
   every author-origin rule source that can outrank an inline width, with one
   deliberate exception handled by refusal (animations, claim 2). Falsify by
   naming a THIRD source — a rule that participates in the cascade, outranks an
   inline declaration, and appears in neither collection.
2. **Animation is answered by REFUSAL, and the refusal is per-property.**
   `animatedSide(el, side)` returns true for a side under an active animation or
   transition and false otherwise; a `border-radius` animation on the same
   element must not poison a `border-top-width` reading. It reads keyframe
   property names via `getKeyframes()` (camelCase) and `transitionProperty`
   (hyphen-case, plus `all`), skips `finished`/`idle`, and answers TRUE on
   anything unreadable. Falsify: an active animation on a border width that
   answers FALSE, or an unrelated animation that answers TRUE.
3. **The gate's PLACEMENT is load-bearing.** It sits ahead of both the inline
   fast path and the stylesheet-agreement path, on the claim that the stylesheet
   path is wrong for the same reason the inline path is. Falsify: an input where
   placing it inside the inline branch would give the same answer everywhere,
   which would make the placement decorative.
4. **The two new tests are falsifiable guards.** G51 kills the adopted test, G52
   and G53 kill the animation test from opposite directions (under-refusal and
   over-refusal), each at radius 1, each on its DECLARED assertion — this was
   graded by hand from the AssertionError message, not inferred from the kill.
5. **G54 makes every caveat assertion reachable.** Because `assert` aborts at the
   first failure, a caveat assertion behind a value assertion is unfalsifiable
   unless something leaves the values green. G54 suppresses only the disclosure;
   its radius of 10 is claimed to be exactly the number of caveat assertions
   that were comments before it existed.
6. **The assertion REORDER is correct and not merely different.** Both new tests
   now assert harm first and the fixture check second, on the claim that a
   precondition derived from the artifact under test is a second harm assertion
   wearing a fixture label. Falsify: a case where the reorder now mis-attributes
   a genuinely broken fixture as a product defect in a way the message does not
   cover.
7. **The v10 header's measured block is accurate**: 54 mutants, 54 killed, 0
   survived, 2 controls green, EXIT=0, baseline 46/46/0/0; ZERO carried-over
   radii moved and ZERO red sets changed from v9, the only delta being G54.

## Measurements given (do not re-run the browser suite; it needs Chromium)

- `.claude/gauntlet-2026-08-14/agent-output/mutants-v10.log` — the matrix.
- `.claude/gauntlet-2026-08-14/agent-output/suite-r5.log` — 46/46/0/0, EXIT=0.

## Ground rules

REPORT ONLY — change no files. Rank findings P1/P2/P3. A claim in a COMMENT is
falsifiable exactly like an assertion. Prefer a concrete counterexample input
over an argument. If you believe a mutant does not kill what it is declared
against, say which assertion actually fires.
