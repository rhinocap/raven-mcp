# Falsification pass — round 4 (report-only)

Repo: /Users/accunliffe/projects/raven-mcp  (branch main, HEAD 2d1c12e)

## What to attack

Round 3 of an adverse loop on the `design_gauntlet` tool's HAIRLINE PROVENANCE
feature returned DOES NOT SURVIVE (3 P1 + 1 P2 + 1 P3). All three P1s were the
same direction: a CONFIDENT WRONG HAIRLINE. This round fixed them and added
guards. **Attack the fixes AND the guards.** Prior rounds' findings are closed;
do not re-report them.

Files:
- `src/design-gauntlet.ts` — the fix. Look at `pxLength()` and
  `authoredSubPixel()` and the warning emission that follows.
- `test/design-gauntlet.test.mjs` — four new browser tests, all named
  `hairlines: ...`, plus the `withFixture` `extra` sibling-file parameter.
- `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` — mutants G44–G50 and the
  MEASURED v8 header block.

## Claims under audit — falsify each

1. A BLOCKED stylesheet (cross-origin / unreadable `.cssRules`) now stops EVERY
   sub-pixel recovery, not merely the elements that sheet touched. Claim: no
   input produces a recovered authored width while `sheetsBlocked > 0`.
2. Inline style is trusted ONLY when no `!important` stylesheet rule can
   outrank it, and an inline width this probe cannot parse REFUSES outright
   rather than falling through to the stylesheet scan.
3. `pxLength()` is a real unit check. CORRECTED after round 4 (P3): keywords
   (`thin|medium|thick`) return `"keyword"` and are DROPPED — they are
   engine-defined integers and can never be the sub-pixel case — while every
   OTHER non-px form returns `"unresolved"`. The original wording here said
   keywords were unresolved too, which the source contradicts. The safety
   claim is unaffected and stands: no non-px authored length can be reported
   as a recovered px hairline.
4. The four new tests are FALSIFIABLE guards, not comments. Each is claimed
   killed at radius 1 by its own mutant (G44/G45/G46/G47).
5. G48–G50 make the CAVEAT assertions reachable. Claim: because `assert` aborts
   at the first failure, a caveat assertion sitting behind a value assertion is
   unfalsifiable unless some mutant leaves the value assertions GREEN — G48/G49/
   G50 are claimed to do exactly that, G48 at radius 6.
6. The v8 header's measured block is accurate: 50 mutants, 50 killed, 0
   survived, 2 controls green, EXIT=0, baseline 44/44/0/0, pre-flight 52; and
   exactly ONE carried-over radius moved (G42 1→2, because a `0.5em` width is
   an unresolved rule and reaches the push G42 deletes).

## Measurements given (do not re-run the browser suite; it needs Chromium)

- `.claude/gauntlet-2026-08-14/agent-output/mutants-v8.log` — the matrix.
- Full suite: 1583 tests / 1580 pass / 0 fail / 3 skipped, EXIT=0. The 3 skips
  are at output lines 109/758/759 and are pre-existing.

## Ground rules

REPORT ONLY — change no files. Rank findings P1/P2/P3. A claim in a COMMENT is
falsifiable exactly like an assertion. Prefer a concrete counterexample input
over an argument. If you believe a mutant does not kill what it is declared
against, say which assertion actually fires.
