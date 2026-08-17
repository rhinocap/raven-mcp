# Falsification pass — round 6 (report-only)

Repo: /Users/accunliffe/projects/raven-mcp  (branch main)

## What to attack

Round 5 of an adverse loop on the `design_gauntlet` tool's HAIRLINE PROVENANCE
feature returned DOES NOT SURVIVE (2 P1 + 2 P2 + 2 P3). Both P1s were round 4's
shape one door over: a cascade source the probe could not SEE, producing a
CONFIDENT WRONG HAIRLINE. Round 5 fixed four things and added four guards and
five mutants. **Round 6 then found two more defects BY HAND-GRADING the round-5
matrix** — reading which `AssertionError` each mutant actually produced rather
than trusting its kill — and both were defects in CLAIMS rather than in shipped
behaviour. Round 6 is unaudited and is in scope here alongside round 5.
**Attack the fixes AND the guards.** Prior rounds' findings are closed; do not
re-report them.

Files:
- `src/design-gauntlet.ts` — the fix. The stylesheet collection loop
  (`collectRules`, the `@import` / `@supports` / `@container` branches, the
  `unevaluable` flag and the two pushes) and `animatedSide()`'s `finished` arm.
  **Unchanged in round 6** — every round-6 edit is test-side or harness-side.
- `test/design-gauntlet.test.mjs` — four round-5 browser tests named
  `hairlines: ...` (an `@import`ed sheet; a FINISHED animation still filling
  forwards; a FALSE `@supports` branch; an `@container` block), plus two widened
  harm messages. Round 6 adds: `withHttpFixture` (a loopback same-origin
  server), a FIFTH test grading the READABLE-import conflict arm, a loopback
  `listen` added to the module-load Chromium probe, a PINNED reading on the
  `file://` import test, and a third widening of the `@container` harm message.
- `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` — mutants G55–G59 and the
  re-cut G42 anchor (round 5), **G60** (round 6), and the MEASURED v12 header
  block.

## Claims under audit — falsify each

1. **The scan is now complete for the cascade sources this probe can read.**
   `document.styleSheets` (recursed), `document.adoptedStyleSheets`, and
   `CSSImportRule.styleSheet.cssRules` are claimed to be every author-origin
   rule source that can outrank an inline width, with animations handled by
   refusal. Falsify by naming a FOURTH source — one that participates in the
   cascade, outranks an inline declaration, and appears in none of the three.
   Nested `@import`, `@layer`, `@scope`, constructed sheets adopted on a shadow
   root, and UA/user-origin `!important` are all fair game.
2. **`finished` is not gone, and the new arm reads fill correctly.**
   A `finished` animation is skipped ONLY when `getComputedTiming().fill`
   resolves to `none` or `backwards`; anything else, and anything unreadable,
   refuses. Falsify: a filling animation that answers FALSE, or a genuinely
   irrelevant finished animation that now poisons an unrelated side.
3. **Conditional groups are discriminated by TYPE, never by shape, and the
   `@container` degrade is the correct trade.** `CSSSupportsRule` has
   `conditionText` and no `media`; `CSS.supports()` answers about a DECLARATION
   while identical text may be a container query about a BOX. `@container`
   therefore degrades the whole subtree to UNRESOLVED — it can force an honest
   ambiguity, never a recovered answer. Falsify: a case where the degrade
   produces a WRONG answer rather than a lost one, or a conditional at-rule that
   is neither branch and is silently collected as authored.
4. **The five new tests are falsifiable guards, not comments.** G55/G56/G57/G60
   each at radius 1 on their own test; G58 and G59 are ONE RULE AT TWO DOORS and
   redden the same single test **on the identical assertion (line 959)** —
   separated by mutation SITE, not by message, which is why that message was
   widened to name both doors. Each was graded BY HAND from the AssertionError,
   not inferred from the kill. Falsify: a mutant that kills a different
   assertion than its declaration says, or a new test that passes under a
   plausible wrong revert.
5. **The two `@import` tests grade two genuinely DIFFERENT arms, and each one's
   reading is pinned rather than assumed.** Round 5 claimed one test covered
   both readings; measured, that was a disjunction over the ASSERTIONS and false
   of the FIXTURE — a `file://` import throws SecurityError on `.cssRules` every
   time, and `sheetsBlocked > 0` returns `"unresolved"` GLOBALLY
   (`src/design-gauntlet.ts:983`), so that test passes even if the import walk
   collects nothing. The `file://` test now pins the blocked reading through the
   caveat's own wording; the new http test pins the readable one through the
   ABSENCE of the cross-origin cause, which is its whole discriminator. G60
   (forced blocked path on a readable sheet) is claimed to redden the http test
   ALONE while the `file://` test stays green. Falsify: a third reading; a
   Chromium behaviour satisfying either test for a reason unrelated to the fix;
   an argument that the http test still passes with the `rule.styleSheet`
   recursion deleted; or a defect in `withHttpFixture` itself (Content-Type,
   `once('error')`, teardown, port reuse, or the probe's new loopback `listen`
   being narrower or wider than what the tests actually require).
6. **The `@container` fixture can actually distinguish pre- from post-fix.** It
   deliberately carries NO inline width and a NON-important declaration, on the
   claim that with either, old and new code answer identically. Falsify that
   reasoning against `authoredSubPixel()`'s real decision order.
7. **The widened harm messages name every reading that exists.** The
   `@container` message now names FOUR: the unevaluable FLAG not set at the call
   site, the PUSH honouring it demoting nothing (the two doors G58/G59 hit), a
   fixture whose query never applied, and — via the following assertion — the
   fixture-vs-mechanism separation. Falsify: a fifth reading the message does
   not cover, or a reading it names that cannot actually occur.
8. **The v12 header's measured block is accurate**, including the
   self-corrections it carries forward (G45 1→2 and G48 6→8 were transcription
   errors inherited from the v8 table; G54's radius is NOT that many
   newly-reachable caveat assertions, because G48 already reached most of them)
   and every radius DELTA v11→v12, each of which is claimed to have been diffed
   BY SET in both directions rather than read off the counts.
9. **Round 6's own method claim: a kill is not evidence the declared assertion
   fired.** Both round-6 findings came from hand-grading and neither was
   reachable from a kill count. Falsify: show that one of the two "defects" is
   not a defect, that the measurement behind the `@import` finding is wrong
   (e.g. `'cssRules' in importRule` or the SecurityError behaviour differs), or
   that a cheaper check would have caught either.

## Measurements given (do not re-run the browser suite; it needs Chromium)

- `.claude/gauntlet-2026-08-14/agent-output/mutants-v12.log` — the matrix
  (60 mutants + 2 controls). Read `EXIT=` from INSIDE the log.
- `.claude/gauntlet-2026-08-14/agent-output/suite-r7.log` — 51/51/0/0, EXIT=0.
- `.claude/gauntlet-2026-08-14/agent-output/mutants-v11.log` — the prior matrix,
  for the v11→v12 radius diff.

## Ground rules

REPORT ONLY — change no files. Rank findings P1/P2/P3. A claim in a COMMENT is
falsifiable exactly like an assertion. Prefer a concrete counterexample input
over an argument. If you believe a mutant does not kill what it is declared
against, say which assertion actually fires.
