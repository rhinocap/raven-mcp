#!/usr/bin/env node
/**
 * Mutation matrix for test/design-gauntlet.test.mjs (house style: string-edit
 * mutants on dist/, clean baseline vs DECLARED counts, node --check pre-flight,
 * verified restores, deduped failing-test NAMES, exitCode on survivors or
 * false-fails). Run with:  node .claude/gauntlet-2026-08-14/gauntlet-mutants.mjs
 * NEVER via `npm test` with a mutant applied — clean && tsc clobbers dist/.
 *
 * MEASURED v16 (2026-08-17, agent-output/mutants-v16.log), 68p/0f/0s declared
 * baseline: 79 mutants, 79 killed, 0 survived, 0 controls false-failed; 2
 * CONTROLS green; EXIT=0 and the summary line both read from INSIDE the log.
 * Pre-flight passed at 81 anchors. NO mutant entered and NO product code
 * changed this round — v16 is a WHOLE re-run of the v15 roster, and the whole
 * point of it is the re-run itself.
 *   WHY IT EXISTS: v15 measured 79 mutants with TWO SURVIVORS (G64, G68) and
 *   EXIT=1. Both survivals were FIXTURE defects, not product defects, and both
 *   fixtures were rewritten. Sol R10 then returned DOES NOT SURVIVE on 1 P1 +
 *   1 P2, and NEITHER finding was about correctness — both were about EVIDENCE.
 *   P1: nothing established that the two rewritten fixtures had not MASKED some
 *   other mutant, because the matrix was not re-run whole. P2: the claimed
 *   radius-1 kills had no preserved raw output at all — mutants-v15.log:66 and
 *   :70 still recorded G64 and G68 as SURVIVED, so the repo's only artifact
 *   contradicted the claim. THIS LOG IS THE ANSWER TO BOTH, and the second one
 *   is answered by the log EXISTING rather than by anything written here.
 *   FIVE MUTANTS MOVED AND SEVENTY-FOUR DID NOT, CHECKED BY SET IN BOTH
 *   DIRECTIONS rather than by count — a uniform-looking delta is exactly the
 *   shape that hides one mechanism shrinking while another grows.
 *     G64 SURVIVED -> killed r1 · G68 SURVIVED -> killed r1 (the two fixes)
 *     G59 1 -> 2 · G69 1 -> 2 (GAINED the rewritten unknown-group test)
 *     G45 7 -> 6 (LOST it)
 *   G45'S LOSS IS THE ONLY LOST RED-SET MEMBER ANYWHERE IN THE ROSTER, and it
 *   is the one cell that could have hidden the P1 harm. It did not: G45 is
 *   still killed, at radius 6, so the rewrite narrowed which tests catch it
 *   without unmasking it. Every other one of the 79 either held its set
 *   byte-identical or gained a member. NOTHING became masked; 0 survived.
 *   ALL FIVE MOVES ARE ONE FACT, NOT FOUR. The rewritten "UNKNOWN conditional
 *   group is unresolved, never collected as authored" test left G45's red set
 *   and joined G59, G64 and G69 — that is a fact about ONE fixture's reach, and
 *   reading it as four independent changes would invent three findings.
 *   THERE IS DELIBERATELY NO UNIQUE MUTANT FOR THE CLOSED+ADOPTED COMPOSITION,
 *   and that is a measurement rather than a gap. G66 (closed stash never read)
 *   and G67 (shadow adopted sheets dropped) each redden their OWN single-
 *   mechanism test plus the composed "a CLOSED root delivering an ADOPTED sheet
 *   stops every recovery" test — each at radius 2, neither alone. No mutant
 *   reddens the composed test and nothing else, because THE PATH IS SHARED:
 *   the composition has no code of its own to break. That is Sol R8 P1-2's
 *   point — the composition worked by accident before it worked by design — and
 *   the honest record is to say so. DO NOT INVENT A MUTANT TO FILL THIS ROW; a
 *   mutant with no distinct mechanism behind it is a decoration that reports a
 *   kill it never made.
 *   G63 IS THE RADIUS-COUNTS-TESTS-NOT-ASSERTIONS ENTRY. It fires the shadow
 *   gate on ANY root and is killed at radius 1 by "an ordinary shadow root that
 *   declares NO border width costs nothing" — one TEST, which carries several
 *   assertions. A radius is a count of reddened tests and says nothing about
 *   how many claims inside them broke, nor about how many independent guards
 *   exist; `assert` aborts at the first failure, so a test that would have
 *   failed three ways still counts once. Read the NAMES, never the number.
 *   THIS HEADER DECAYED FOR THREE ROUNDS — it still described v12 (60 mutants,
 *   a 51p baseline) while v13, v14 and v15 came and went, which is this file's
 *   own "a comment describing a measurement is a claim and decays exactly like
 *   a test does, except nothing executes it", landing on the paragraph that
 *   states it. Worse, v13 and v14 CARRY NO `summary:` LINE AND NO `EXIT=` LINE:
 *   the harness prints both only on a completed run, so neither is a
 *   measurement and no radius in either may be quoted as one. Both were renamed
 *   `-ABORTED-not-a-measurement` on 2026-08-17 to match the v16-abort
 *   precedent. A LOG THAT STOPS EARLY LOOKS EXACTLY LIKE A LOG THAT FINISHED
 *   UNLESS YOU CHECK FOR THE SUMMARY.
 *   THE TABLE BELOW IS DERIVED FROM mutants-v16.log. Re-derive every cell from
 *   the CURRENT log each round — it was transcribed from v8 once and shipped
 *   wrong in two cells, and a correctly-measured delta diff cannot catch an
 *   error inherited from a stale table.
 *   G1 1 · G2 1 · G3 1 · G4 6 · G5 2 · G6 2 · G7 3 · G8 2 · G9 2 ·
 *   G10 3 · G11 1 · G12 2 · G13 1 · G14 1 · G15 2 · G16 2 · G17 2 · G18 1 ·
 *   G19 18 · G20 1 · G21 1 · G22 2 · G23 1 · G24 1 · G25 1 · G26 1 · G27 1 ·
 *   G28 2 · G29 1 · G30 1 · G31 1 · G32 1 · G33 1 · G34 1 · G35 1 · G36 1 ·
 *   G37 1 · G38 4 · G39 1 · G40 1 · G41 2 · G42 4 · G43 1 · G44 2 · G45 6 ·
 *   G46 1 · G47 1 · G48 20 · G49 1 · G50 2 · G51 1 · G52 2 · G53 1 · G54 23 ·
 *   G55 2 · G56 1 · G57 1 · G58 1 · G59 2 · G60 1 · G61 4 · G62 4 · G63 1 ·
 *   G64 1 · G65 2 · G66 2 · G67 2 · G68 1 · G69 2 · G70 3 · G71 2 · G72 2 ·
 *   G73 2 · G74 1 · G75 1 · G76 4 · G77 2 · G78 2 · G79 1.
 *
 * MEASURED v12 (2026-08-17, agent-output/mutants-v12.log), 51p/0f/0s declared
 * baseline: 60 mutants, 60 killed, 0 survived, 0 false-failed; 2 CONTROLS
 * green; EXIT=0 and the summary line both read from INSIDE the log — a
 * background task notification describes the WRAPPER, not the harness verdict.
 * Pre-flight passed at 62 anchors. ONE mutant entered (G60).
 *   ROUND 6 FOUND NOTHING BY KILL COUNT AND TWO THINGS BY HAND-GRADING, and
 *   both were defects in CLAIMS rather than in shipped behaviour. No product
 *   code changed this round; every edit is test-side or harness-side.
 *   (a) G58 AND G59 FAIL ON THE IDENTICAL ASSERTION (test:1055, inside the
 *   @container test that opens at test:1039 — round 6 wrote "test line 959",
 *   which is the OPENING LINE OF A DIFFERENT TEST entirely, the readable-@import
 *   conflict-arm one. Caught by Sol R7 P3-4, and worth carrying as its own
 *   entry: A LINE-NUMBER CITATION IS A CLAIM AND DECAYS EXACTLY LIKE A TEST
 *   DOES, EXCEPT NOTHING EXECUTES IT. Re-derive it before quoting it.). They are
 *   one rule at two doors — G58 breaks the unevaluable FLAG at the @container
 *   call site, G59 breaks the PUSH that honours it — so they are separated by
 *   mutation SITE, not by message, and the harm message named only ONE of the
 *   two doors. A future reader hitting that red would have chased the wrong
 *   mechanism. Widened to name both; the following assertion still separates
 *   the fixture reading from the two mechanism readings.
 *   (b) THE @import TEST'S "BOTH READINGS ARE COVERED" WAS A DISJUNCTION, NOT
 *   COVERAGE. The comment claimed either reading satisfied the assertions — a
 *   readable sheet gives an !important conflict, a blocked one increments
 *   sheetsBlocked. True of the ASSERTIONS and false of the FIXTURE. Measured
 *   with a standalone probe: from a file:// page `'cssRules' in importRule` is
 *   FALSE (the imported sheet hangs off rule.styleSheet, which is the whole
 *   reason the recursion missed it) and `importRule.styleSheet.cssRules`
 *   THROWS SecurityError, every time. So that test is deterministically the
 *   BLOCKED arm — and `sheetsBlocked > 0` returns "unresolved" GLOBALLY
 *   (src/design-gauntlet.ts:983), so it passes even if the import walk collects
 *   nothing at all. The CONFLICT arm — an imported !important rule actually
 *   COLLECTED and outranking the inline width, which is half of round 5's fix —
 *   was exercised by NOTHING. A blunt refusal satisfying every assertion for
 *   entirely the wrong reason is the shape this loop keeps finding.
 *   The file ALREADY carried a comment 40 lines above withFixture documenting
 *   that exact SecurityError behaviour: two comments in one file contradicted
 *   each other for a full round, and only a measurement resolved it.
 *   G60 IS THE SEPARATION, AND IT IS WHY G55 COULD NOT BE IT. G55 deletes the
 *   whole rule.styleSheet branch and reddens BOTH import tests, so it cannot
 *   tell one arm from the other. G60 forces the BLOCKED path on a READABLE
 *   sheet: hand-graded at radius 1, on its declared assertion, with the file://
 *   test staying GREEN. That green half is the measurement — without it the two
 *   tests would be two names for one path.
 *   FIVE CARRIED-OVER RADII MOVED, ALL BY +1, EVERY ONE CONFIRMED BY SET rather
 *   than by arithmetic: no mutant LOST a red-set member, no count held while
 *   its set changed, and no set held while its count moved.
 *     G45 2->3 · G48 10->11 · G54 13->14 · G55 1->2 · G50 1->2.
 *   G55's move is the only one that was STRUCTURALLY PREDICTED — it deletes the
 *   branch both import tests exercise — and predicting it before the run is
 *   what makes the other four readable as measurements rather than noise.
 *   G50's move is the one worth carrying. Its added red is the file:// test,
 *   NOT the new http one: it comes from this round's PINNING assertion, which
 *   fixes that fixture's reading through the caveat's own wording. A pin that
 *   no mutant can redden is a comment, and G50 is the proof this one is not.
 *   G45/G48/G54 each gained the NEW http test, and the contrast with v11's
 *   readable negative is the reason to state it: the FALSE @supports test
 *   reached NO caveat mutant, because it asserts a RECOVERY only. The http test
 *   asserts a recovery AND a caveat disclosure, so it reaches the caveat
 *   mutants. Which mutants a test moves is evidence about what it asserts.
 *   THE TABLE BELOW IS DERIVED FROM mutants-v12.log. Re-derive every cell from
 *   the CURRENT log each round — it was transcribed from v8 once and shipped
 *   wrong in two cells, and a correctly-measured delta diff cannot catch an
 *   error inherited from a stale table.
 *   G38 3 · G39 1 · G40 1 · G41 1 · G42 3 · G43 1 · G44 2 · G45 3 · G46 1 ·
 *   G47 1 · G48 11 · G49 1 · G50 2 · G51 1 · G52 2 · G53 1 · G54 14 ·
 *   G55 2 · G56 1 · G57 1 · G58 1 · G59 1 · G60 1.
 *   v11 (agent-output/mutants-v11.log) measured 59 mutants, 0 survived, 0
 *   controls false-failed, EXIT=0 on a 50p baseline, and is superseded here
 *   rather than written up separately. Five radii moved v10 -> v11 (G42 2->3,
 *   G44 1->2, G48 8->10, G52 1->2, G54 10->13) as round 5's four tests landed.
 *   Its readable NEGATIVE is retained because v12 builds on it: the FALSE
 *   @supports test appeared in NO carried-over mutant's red set at all.
 *   G42'S ANCHOR DIED FOR THE SECOND TIME at v11 and the harness ABORTED rather
 *   than mis-measuring — the uniqueness check working, and the standing
 *   dead-anchor rule landing where it always lands: round 5's demotion arm
 *   rewrote the exact `else if` line it was pinned to.
 *
 * MEASURED v10 (2026-08-17, agent-output/mutants-v10.log), 46p/0f/0s declared
 * baseline: 54 mutants, 54 killed, 0 survived, 0 false-failed; 2 CONTROLS
 * green; EXIT=0 and the summary line both read from INSIDE the log. Re-run
 * WHOLE after the Sol ROUND-4 disposition (DOES NOT SURVIVE: 2 P1 + 1 P3) and
 * again after grading its own new mutants by hand.
 *   ROUND 4'S UNIFYING FINDING IS THAT THE SCAN WAS INCOMPLETE, NOT THAT A
 *   DOOR WAS WRONG. Rounds 2 and 3 hardened which branch trusts what; round 4
 *   found two cascade sources the probe could not SEE at all, which is why
 *   neither is reachable by any mutant confined to the importantConflict
 *   branch and why the green v8 matrix was blind to both.
 *   G51 — `document.adoptedStyleSheets` is a SEPARATE collection from
 *   `document.styleSheets`; CSSOM puts constructed sheets outside the
 *   stylesheet list while the cascade includes both. An adopted `!important`
 *   rule was invisible, so the inline fast path recovered 0.5px on an edge
 *   rendering at 1px. FIXED by scanning, not by refusing — constructed sheets
 *   are same-origin by construction and readable.
 *   G52/G53 — a CSS animation declaration outranks EVERY normal author
 *   declaration, inline included, and its value is in no rule this scan
 *   collects, so the answer is REFUSAL rather than a wider scan. The gate sits
 *   ahead of BOTH doors because the stylesheet path is wrong for the same
 *   reason as the inline path. G52 and G53 PULL IN OPPOSITE DIRECTIONS on
 *   purpose — G52 deletes the gate (under-refusal), G53 makes it
 *   property-blind (over-refusal) — so "fix it by refusing every animated
 *   element" cannot pass both. That is the A9/A10 pattern from the
 *   mic-alignment suite, and it is why the animation test has a
 *   `border-radius` arm at all.
 *   A KILL IS NOT EVIDENCE THE DECLARED ASSERTION FIRED, and grading these by
 *   hand is what found the round's real defect. G52 and G53 redden the SAME
 *   test, so each was applied to dist/ and run by name with the
 *   AssertionError message read. G53 landed on its own arm. G52 landed on the
 *   PRECONDITION — because the precondition was computed from the same probe
 *   output as the harm assertion, deleting the gate emptied the tally of 1px
 *   and aborted the test above the line that mattered, reporting a product
 *   regression as a broken fixture. Both round-4 tests had it. THE RULE: a
 *   precondition derived from the artifact under test is not a precondition,
 *   it is a second harm assertion wearing a fixture label, and it outranks the
 *   real one by sitting above it. The two readings are indistinguishable from
 *   this output alone, so the fix is ORDER plus an honest message — harm
 *   first, message naming both readings, fixture check below as the separator
 *   — and both were re-graded by hand afterwards to confirm the harm
 *   assertion now fires.
 *   G54 IS THE ROUND-3 P2 ARRIVING AGAIN AND ITS RADIUS IS A MEASUREMENT — BUT
 *   NOT OF WHAT THIS PARAGRAPH FIRST CLAIMED. It suppresses the `Hairline
 *   caveat` warning, moves no reported number, and reddens 10 tests. The first
 *   wording read that as ten caveat assertions that "were comments before it
 *   existed", and that is FALSE: G48 already reaches 8 of those 10 (its own red
 *   set, v10 log line 50, is a strict subset of G54's at line 56). Only TWO are
 *   newly reached — the rule-scan cap and the blocked-sheet caveats — because
 *   those two tests' caveats sit behind value assertions G48 leaves green. The
 *   correction is the file's own rule turned on the file: a radius is a fact
 *   about ONE mechanism, and the DELTA against the mutants already in the
 *   matrix is a separate question from the count.
 *   ZERO carried-over radii moved and ZERO red SETS changed between v9 and
 *   v10; the only delta is G54 entering. Checked by SET against the printed
 *   red names in both directions, never by arithmetic on counts — a uniform
 *   hold is exactly the shape that would hide one mechanism shrinking while
 *   another grew. G51/G52/G53 each enter at radius 1.
 *   THE TABLE BELOW IS DERIVED FROM mutants-v10.log, NOT FROM THE v8 HEADER.
 *   It was transcribed from v8 once and shipped WRONG in two cells — G45 and
 *   G48 both moved at v8 -> v9 when the two round-4 tests landed, and a
 *   correctly-measured v9 -> v10 delta diff cannot catch an error inherited
 *   from v8. Re-derive every cell from the CURRENT log each round.
 *   G38 3 · G39 1 · G40 1 · G41 1 · G42 2 · G43 1 · G44 1 · G45 2 · G46 1 ·
 *   G47 1 · G48 8 · G49 1 · G50 1 · G51 1 · G52 1 · G53 1 · G54 10.
 *   v9 (agent-output/mutants-v9.log) measured 53/53/0/0 on the same 46p
 *   baseline and is superseded ONLY because G52 was mis-graded there; no
 *   product code differs between v9 and v10.
 *   v8 (2026-08-17, agent-output/mutants-v8.log), 44p/0f/0s declared
 * baseline: 50 mutants, 50 killed, 0 survived, 0 false-failed; 2 CONTROLS
 * green; EXIT=0 and the summary line both read from INSIDE the log, never
 * from the background task notification. Pre-flight passed at 52 anchors.
 * Re-run WHOLE (not extended) after the Sol ROUND-3 disposition: DOES NOT
 * SURVIVE on 3 P1 + 1 P2 + 1 P3, and all three P1s are the SAME direction as
 * round 2's — a CONFIDENT WRONG HAIRLINE. The organising principle is
 * unchanged and is now three rounds old: a false RECOVERY is worse than a
 * false ambiguity, because the caller is handed a number instead of a warning.
 *   G42's ANCHOR DIED and had to be re-cut — this round's pxLength() fix
 *   rewrote the exact line it named (the keyword-drop branch it was pinned to
 *   no longer exists). That is the standing dead-anchor rule landing exactly
 *   where it always lands, one round after v7's header called an intact
 *   pre-flight "luck rather than a property". It was luck.
 *   SEVEN mutants entered. G44–G47 are one per P1 fix, each at radius 1,
 *   each reddening exactly its own new test — which is the only thing that
 *   makes those four tests guards rather than comments. All four passed on
 *   their first run and that was worth nothing until these four proved them
 *   red (the sixth time this project has recorded that).
 *   THE INLINE P1 NEEDED TWO TESTS, NOT ONE, and G45/G46 are why: an inline
 *   width fails in two different ways on one code path — a stylesheet rule
 *   marked !important OUTRANKS the attribute (G45 drops the conflict clause
 *   and trusts inline unconditionally), and an inline value this probe cannot
 *   read used to FALL THROUGH to the stylesheet scan, letting a rule the
 *   inline declaration overrides answer for the edge (G46 deletes the refusal
 *   return). One mutant cannot separate those; two do.
 *   G48–G50 ARE THE P2 DISPOSITION AND THEY GENERALISE IT. Sol's P2 was that
 *   G41 and G43 do not independently prove all their declared behaviour,
 *   because `assert` aborts at the first failure — so a mutant declared
 *   against a test can be graded by a DIFFERENT assertion inside that test,
 *   and every caveat assertion sitting behind a value assertion was never
 *   reached by any mutant in the matrix. The fix is mechanical rather than a
 *   reordering: G48–G50 break the DISCLOSURE and nothing else, leaving every
 *   value assertion green, so each caveat assertion is reached on its own.
 *   G48 (ambiguity never counted) is radius 6 and that number IS the
 *   measurement — six hairline tests carry a caveat assertion behind a value
 *   assertion, and before G48 existed not one of those six was falsifiable.
 *   It is a fact about ONE mechanism (the ambiguity counter every caveat runs
 *   through), never evidence of six independent guards; G49 and G50 are what
 *   separate the individual NAMED causes, one each, at radius 1.
 *   EXACTLY ONE carried-over radius moved: G42 1 -> 2, checked by SET against
 *   the printed red names rather than by arithmetic on the counts. It picks up
 *   the new non-px test because a `0.5em` width IS an unresolved rule, so it
 *   reaches the very push G42 deletes — one mechanism gaining an observable,
 *   not a second guard. Every other v7 radius held IDENTICALLY, which was
 *   verified in both directions rather than believed: a uniform hold is
 *   exactly the shape that would hide one mechanism shrinking while another
 *   grew. G19 stays 18 — the four new tests are hairline assertions outside
 *   the rhythm comparison set.
 *   G38 3 · G39 1 · G40 1 · G41 1 · G42 2 · G43 1 · G44 1 · G45 1 · G46 1 ·
 *   G47 1 · G48 6 · G49 1 · G50 1.
 *   G47 (the unit-blind length) is the cheapest defect in the round and the
 *   one most likely to come back: parseFloat("0.5em") is 0.5, so an edge
 *   authored .5em at a 2px font-size — which computes and renders at exactly
 *   1px — reported as a recovered 0.5px hairline. parseFloat is not a unit
 *   check, and the mutant re-widens the suffix set rather than deleting the
 *   test, because a deletion would be caught by reading and this would not.
 *   v7 (2026-08-17, agent-output/mutants-v7.log), 40p/0f/0s declared
 * baseline: 43 mutants, 43 killed, 0 survived, 0 false-failed; 2 CONTROLS
 * green; EXIT=0 and the summary line both read from INSIDE the log, never
 * from the background task notification — a notification describes the
 * WRAPPER, not the harness verdict. Re-run WHOLE (not extended) after the
 * npm-release round: the Sol adverse pass returned DOES NOT SURVIVE on three
 * P1s, all three the same direction — a CONFIDENT WRONG HAIRLINE — and the
 * organising principle behind every fix is that a false RECOVERY is worse
 * than a false ambiguity, because the caller is handed a number instead of a
 * warning (the house takedown rule, "a false all-clear is the one forbidden
 * outcome", applied to measurement).
 *   THE PRE-FLIGHT PASSING AT 45 IS ITSELF A MEASUREMENT: not one find-string
 *   went stale even though this round rewrote `authoredSubPixel` wholesale.
 *   That is unusual here and worth reading as luck rather than as a property —
 *   the standing dead-anchor rule stands.
 *   Six mutants entered this round and ALL SIX guard work that previously had
 *   none. G38–G40 cover the FOUR-EDGE feature, whose three tests the session
 *   that wrote them called "mutant-proven" on the strength of hand-reverting
 *   dist/ and never encoding the reverts — a hand-probe establishes
 *   point-in-time behaviour and encodes no regression guard, so those tests
 *   were unguarded from the moment that session ended. G41–G43 are one per Sol
 *   P1. All three of THIS round's new tests passed on their first run, which
 *   was worth nothing until G41/G42/G43 proved each red.
 *   EVERY carried-over radius (G1–G37) held IDENTICALLY, checked by SET
 *   against the printed red names rather than by arithmetic on the counts —
 *   a uniform hold is exactly the shape that would hide one mechanism
 *   shrinking while another grew. G19 stays 18: the three new tests are
 *   hairline/border assertions outside the rhythm comparison set.
 *   G38 radius 3 · G39 1 · G40 1 · G41 1 · G42 1 · G43 1.
 *   G38 (SIDES=["Top"]) is the entry point both four-edge assertions run
 *   through, so its radius is a fact about THAT ENTRY POINT and never evidence
 *   of three independent guards — which is precisely why G39 exists: it drops
 *   the per-side FILTER while leaving the four-edge READ intact, and nothing
 *   else separates the two mechanisms. G38 also reddens the overflow-cap test,
 *   for a reason that has nothing to do with the cap, which is why G43 is a
 *   separate mutant rather than a corollary of G38.
 *   G41 restores BOTH halves of the pre-fix shape (`matched.some(w => w >= 1)`
 *   plus last-wins) and MUST leave the pre-existing mixed sub-pixel/full-pixel
 *   conflict test GREEN — that test passes under both shapes, which is exactly
 *   why it could not see this defect and exactly what the new test is for.
 *   G42's row falls to `null` and emits no caveat at all, so the engine's own
 *   rounded 1px reports as measured — the feature inverted on the likeliest
 *   real input there is, a tokenised var() width. G43 still FIRES the cap
 *   caveat; only the recovered VALUE separates it, which is what its test's
 *   first assertion reads.
 *   v6 (2026-08-14, agent-output/mutants-v6.log), 30p/0f/0s declared
 * baseline: 37 mutants, 37 killed, 0 survived, 0 false-failed; 2 CONTROLS
 * green; EXIT=0 read from inside the log. Re-run WHOLE after the Sol ROUND-2
 * disposition (2 CONFIRMED findings, both fixed this round: the P1
 * ancestor-opacity leak — opacity is NOT inherited, so a sized child inside
 * an opacity:0 ancestor reported its own computed "1" and whole invisible
 * subtrees inflated visible_elements; fixed with the memoized hiddenByOpacity
 * ancestor walk, O(n) because querySelectorAll document order caches parents
 * before children ask — and the P2 per-site cap hole: cap() has SEVEN call
 * sites and B2 asserted only surfaces, so a silent .slice(0,100) at any other
 * site recreated the defect with B2 and G28 green; test-side fix, B2 now
 * overflows all seven dimensions and asserts length + warning BY NAME per
 * dimension. G27 re-anchored — the P1 fix rewrote its target line, the
 * standing dead-anchor rule).
 *   EVERY v5 radius held identically in v6; the only table changes are the
 *   seven new mutants entering at radius 1 (checked by set, not just count:
 *   G19 stays 18 because B1/B2 are browser fixtures, outside the rhythm
 *   comparison set).
 *   Measured radii (deduped failing-test names per mutant) — facts about
 *   mechanisms, never counts of independent guards:
 *   G1 vocab-boundary 1 · G2 vocab-empty 1 · G3 vocab-unsorted 1 ·
 *   G4 parse-normal 6 (was 5 in v4; the null-branch fix routes an unparseable
 *   BODY reading through the honest-note branch, so the body FIRE test now
 *   reds under a dead parser too — a radius move caused by a product edit,
 *   not a new guard; the display-unmeasured test stays GREEN under G4 because
 *   a null parse IS its fixture) · G5 ladder-gate 2 · G6 surfaces-budget 2 ·
 *   G7 hairline-budget 3 · G8 text-flat-gate 2 · G9 text-sprawl-budget 2 ·
 *   G10 display-threshold 3 · G11 display-unmeasured 1 · G12 body-threshold 2 ·
 *   G13 accent-floor 1 · G14 type-and-drop 1 · G15 family-floor 2 ·
 *   G16 radii-budget 2 · G17 elev-subject-gate 2 · G18 elev-ref-gate 1
 *   (G17/G18 separate the two halves of one rule — the V21/V22 two-doors
 *   pattern) · G19 rhythm-fires 18 (was 17; the new tracking-body unmeasured
 *   test joins the set because rhythm rows appear in EVERY comparison — a fact
 *   about the diff table's shape, not eighteen guards) · G20 bar-cap-8 1 ·
 *   G21 effect-rank-inverted 1 (bar-cap's slice(0,3) is the only assertion
 *   that reads effect order under mixed effects — the ordering test is
 *   all-high there by design) · G22 dim-rank-tracking 2 · G23 on-par-loose 1
 *   (killed by the ladder test's on_par:false assertion — its fixture has
 *   exactly ONE failing rule, the precise case `<= 1` admits) ·
 *   G24 gating-entry-dropped 1 (killed THROUGH the child process now — the
 *   spawned remote build is what reads the registration table, so the gate
 *   mutant still has exactly one observable) · G25 fix-keyed-dimension 1 ·
 *   G26 null-guard-and 1 (the plausible wrong fix — `||`→`&&` admits a
 *   half-measured pair — reds only the unmeasured-reference unit test) ·
 *   G27 visible-filter-geometry-only 1 (killed by B1's opacity:0 decoys —
 *   GEOMETRY-only visibility counts all 66 sized fixture elements (30 direct
 *   decoys + wrapper + 30 ghosts + 5 visible) and the low-count warning the
 *   test demands never fires; re-anchored in v6 to the rewritten predicate
 *   line) · G31 opacity-own-only 1 (the plausible WRONG revert — own computed
 *   opacity checked, ancestor walk dropped; it reds the SAME test as G27 and
 *   is separated by WHICH assertion fires, the E14/E15 pattern: under G31 the
 *   35 directly-visible elements still clear the low-count guard's harm arm
 *   only through B1's ancestor assertions — the #000f00 tally check and the
 *   <20 count that the 30 wrapped ghosts push to 35+) ·
 *   G28 tally-cap-shrunk 2 (B2 plus the lazy-load test — both fixtures
 *   exceed a cap of 8, one shared TALLY_CAP mechanism; G28 mutates the
 *   CONSTANT, which every site inherits, so it can never see a per-site
 *   silent slice — that is what G32–G37 exist for) ·
 *   G32 borders / G33 text-colors / G34 families / G35 sizes / G36 radii /
 *   G37 shadows cap-silent, 1 each (one per non-surface cap() call site,
 *   each replacing cap("<name>", …) with a bare .slice(0,100) — killed by
 *   B2's per-name assertions: a silent slice keeps length 100 but drops
 *   exactly its own name from the warnings) ·
 *   G29 scroll-limit-captured-once 1 (killed by B3 — a limit captured before
 *   the appends stops the sweep short of the injected content) ·
 *   G30 protocol-any-critic 1.
 *   v5 (agent-output/mutants-v5.log): 30 mutants, 30 killed, 2 controls
 *   green; G26–G30 entered at 1/1/2/1/1; G4 5→6 and G19 17→18 moved on the
 *   round's product edit and new unit test respectively.
 *   v4 (agent-output/mutants-v4.log, 26p baseline): 25 mutants, 25 killed,
 *   2 controls green; G25 entered there at radius 1 on exactly the join test.
 *   v3 matched v2 radius-for-radius — which is what exposed that no mutant
 *   anchored the join fix. (v1 aborted on its own pre-flight: bare
 *   `node --check -` parses stdin as CJS and rejected the PRISTINE ESM file —
 *   the guard firing on the instrument, fixed with --input-type=module,
 *   discriminator re-measured in both directions.)
 *   (Re-run and re-read this header after ANY edit to the suite or module —
 *   a radius table is a claim and decays.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE = path.join(ROOT, 'dist', 'design-gauntlet.js');
const INDEX = path.join(ROOT, 'dist', 'index.js');
const SUITE = path.join(ROOT, 'test', 'design-gauntlet.test.mjs');

// Declared, not derived. This was stale at 30 against a 37-test suite for a
// whole round — a baseline that lags the suite makes the harness abort rather
// than mis-measure, which is the guard working, but it also means nobody ran it.
const EXPECTED_BASELINE = { tests: 68, pass: 68, fail: 0, skipped: 0 };

const MUTANTS = [
  { id: 'G1-vocab-boundary-exclusive', file: MODULE,
    find: 'if (seen >= coverage * total)', replace: 'if (seen > coverage * total)' },
  { id: 'G2-vocab-empty-reads-one', file: MODULE,
    find: 'if (total === 0)\n        return 0;', replace: 'if (total === 0)\n        return 1;' },
  { id: 'G3-vocab-unsorted', file: MODULE,
    find: 'const sorted = tally.slice().sort((a, b) => b.count - a.count);',
    replace: 'const sorted = tally.slice();' },
  { id: 'G4-parse-normal-null', file: MODULE,
    find: 'if (/^normal/.test(value))', replace: 'if (false)' },
  { id: 'G5-ladder-gate-unreachable', file: MODULE,
    find: 'const worse = rv >= 2 && sv <= 1;', replace: 'const worse = rv >= 99 && sv <= 1;' },
  { id: 'G6-surfaces-budget-plus-4', file: MODULE,
    find: 'vocabularyCount(r.surfaces.tally);\n            const worse = sv > rv + 3;',
    replace: 'vocabularyCount(r.surfaces.tally);\n            const worse = sv > rv + 4;' },
  { id: 'G7-hairline-budget-plus-3', file: MODULE,
    find: 'vocabularyCount(r.borders.tally);\n            const worse = sv > rv + 2;',
    replace: 'vocabularyCount(r.borders.tally);\n            const worse = sv > rv + 3;' },
  { id: 'G8-text-flat-gate', file: MODULE,
    find: 'const worse = rv >= 3 && sv < 3;', replace: 'const worse = rv >= 99 && sv < 3;' },
  { id: 'G9-text-sprawl-budget-plus-4', file: MODULE,
    find: 'vocabularyCount(r.text.tally);\n            const worse = sv > rv + 3;',
    replace: 'vocabularyCount(r.text.tally);\n            const worse = sv > rv + 4;' },
  { id: 'G10-display-threshold-widened', file: MODULE,
    find: 'const worse = se - re > 0.005;', replace: 'const worse = se - re > 0.5;' },
  { id: 'G11-unmeasured-counts-as-worse', file: MODULE,
    // Re-anchored for v5: the P1 #2 fix gave tracking-body the same unmeasured
    // shape, so the old find-string stopped being unique. Anchored on the
    // DISPLAY note now.
    find: 'worse: false,\n                    note: "Display tracking could not be measured',
    replace: 'worse: true,\n                    note: "Display tracking could not be measured' },
  { id: 'G12-body-threshold-widened', file: MODULE,
    // Re-anchored for v5: the null branch now precedes this line, so the
    // se !== null and re === null clauses are gone from it.
    find: 'const worse = se > 0.001 && re <= 0.001;',
    replace: 'const worse = se > 0.1 && re <= 0.001;' },
  { id: 'G13-accent-floor-dropped', file: MODULE,
    find: 'const budget = Math.max(r.accent.usesInFirstViewport, 2);',
    replace: 'const budget = r.accent.usesInFirstViewport;' },
  { id: 'G14-type-scale-drops-reference-clause', file: MODULE,
    find: 'const worse = sv > 10 && sv > rv;', replace: 'const worse = sv > 10;' },
  { id: 'G15-family-floor-raised', file: MODULE,
    find: 'const budget = Math.max(rv, 2);', replace: 'const budget = Math.max(rv, 3);' },
  { id: 'G16-radii-budget-plus-3', file: MODULE,
    find: 'vocabularyCount(r.radii.tally);\n            const worse = sv > rv + 2;',
    replace: 'vocabularyCount(r.radii.tally);\n            const worse = sv > rv + 3;' },
  { id: 'G17-elev-subject-gate-closed', file: MODULE,
    find: 'sShadows >= 2 && sInsetRatio < 0.25;', replace: 'sShadows >= 2 && sInsetRatio < 0;' },
  { id: 'G18-elev-ref-gate-opened', file: MODULE,
    find: 'rInsetRatio >= 0.5 && sShadows', replace: 'rInsetRatio >= 0 && sShadows' },
  { id: 'G19-rhythm-fires', file: MODULE,
    find: 'worse: false,\n                note: "Container width is a deliberate choice',
    replace: 'worse: true,\n                note: "Container width is a deliberate choice' },
  { id: 'G20-bar-cap-8', file: MODULE,
    find: 'ordered.slice(0, 7)', replace: 'ordered.slice(0, 8)' },
  { id: 'G21-effect-rank-inverted', file: MODULE,
    find: 'const EFFECT_RANK = { high: 0, medium: 1, low: 2 };',
    replace: 'const EFFECT_RANK = { high: 2, medium: 1, low: 0 };' },
  { id: 'G22-dimension-rank-tracking-last', file: MODULE,
    find: 'tracking: 0, text: 1, hairlines: 2, surfaces: 3,',
    replace: 'tracking: 9, text: 1, hairlines: 2, surfaces: 3,' },
  { id: 'G23-on-par-loose', file: MODULE,
    find: 'on_par: failing.length === 0,', replace: 'on_par: failing.length <= 1,' },
  { id: 'G24-gating-entry-dropped', file: INDEX,
    find: 'golden hash unchanged.\n    "design_gauntlet",', replace: 'golden hash unchanged.' },
  // G25 encodes the e2e-found join-contract fix permanently: a fix entry keyed
  // by any field other than `mechanism` silently breaks the by-name join with
  // verdict.failing_mechanisms (loop-protocol step 2). The manual dist
  // string-revert proved it red once; a hand-probe encodes no regression guard.
  { id: 'G25-fix-keyed-dimension-not-mechanism', file: MODULE,
    find: 'const fix = { fix: res.fix, mechanism: res.mechanism, effect: res.effect };',
    replace: 'const fix = { fix: res.fix, dimension: res.mechanism, effect: res.effect };' },
  // G26–G30 enter in v5, one per Sol-disposition mechanism. G26's wrong-fix
  // direction is the JS gotcha that WAS the shipped defect: with || weakened
  // to &&, an unmeasured reference reaches `re <= 0.001` and null <= 0.001
  // is true, so the rule fires against a value nobody measured.
  { id: 'G26-null-guard-and', file: MODULE,
    find: 'which is the one thing GAUNTLET_DISCIPLINE_NOTICE forbids.\n            if (se === null || re === null) {',
    replace: 'which is the one thing GAUNTLET_DISCIPLINE_NOTICE forbids.\n            if (se === null && re === null) {' },
  // G27 reverts the guard's visibility predicate to geometry-only — the exact
  // pre-fix shape (30 sized opacity:0 decoys satisfy the count while every
  // tally measures nothing). Only the B1 browser fixture can see it.
  // Re-anchored in v6: the R2-P1 fix rewrote the predicate line to consult
  // hiddenByOpacity, and the old find-string died with it (house rule: a
  // find-string mutant dies the moment its target line is edited).
  { id: 'G27-visible-filter-geometry-only', file: MODULE,
    find: 'return s.visibility !== "hidden" && s.display !== "none" && !hiddenByOpacity(el);',
    replace: 'return true;' },
  // G31 is the plausible WRONG revert distinct from G27: keep the own-opacity
  // check, drop only the ancestor recursion. Opacity is not inherited, so
  // sized opacity:1 children under an opacity:0 wrapper pass it — B1's
  // ancestor arm (count 35 >= 20 kills the warning assertion, and the greens
  // reach the surfaces tally) is the only thing that separates it (Sol R2 P1).
  { id: 'G31-opacity-own-only', file: MODULE,
    find: 'const verdict = getComputedStyle(el).opacity === "0" ||\n            (parent !== null && hiddenByOpacity(parent));',
    replace: 'const verdict = getComputedStyle(el).opacity === "0";' },
  // G32–G37: one silent .slice(0, 100) per non-surface cap() call site (Sol
  // R2 P2 — G28 mutates the shared CONSTANT and B2 used to read only the
  // surfaces site, so any per-site silent slice stayed green; B2's per-name
  // warning assertions are what kill each of these individually, at the same
  // truncated LENGTH the cap produces, so only the missing warning separates).
  { id: 'G32-borders-cap-silent', file: MODULE,
    find: 'borders: { tally: cap("borders", tally(borderValues)) },',
    replace: 'borders: { tally: tally(borderValues).slice(0, 100) },' },
  { id: 'G33-text-cap-silent', file: MODULE,
    find: 'text: { tally: cap("text colors", tally(textColors)) },',
    replace: 'text: { tally: tally(textColors).slice(0, 100) },' },
  { id: 'G34-families-cap-silent', file: MODULE,
    find: 'families: cap("font families", tally(families)),',
    replace: 'families: tally(families).slice(0, 100),' },
  { id: 'G35-sizes-cap-silent', file: MODULE,
    find: 'sizes: cap("font sizes", tally(sizes)),',
    replace: 'sizes: tally(sizes).slice(0, 100),' },
  { id: 'G36-radii-cap-silent', file: MODULE,
    find: 'radii: { tally: cap("radii", tally(radiusValues)) },',
    replace: 'radii: { tally: tally(radiusValues).slice(0, 100) },' },
  { id: 'G37-shadows-cap-silent', file: MODULE,
    find: 'elevation: { shadows: cap("shadows", tally(shadowValues)), insetOnly },',
    replace: 'elevation: { shadows: tally(shadowValues).slice(0, 100), insetOnly },' },
  // G28 shrinks TALLY_CAP — B2's exact-100 length assertion is the only thing
  // that pins the cap's VALUE rather than its existence.
  { id: 'G28-tally-cap-shrunk', file: MODULE,
    find: 'const TALLY_CAP = 100;', replace: 'const TALLY_CAP = 8;' },
  // G29 captures the scroll limit ONCE — the exact pre-fix defect. Only B3's
  // two-stage lazy fixture separates it: stage 1 grows the page past the
  // captured limit, and stage 2's marker is unreachable without the re-read.
  { id: 'G29-scroll-limit-captured-once', file: MODULE,
    find: 'const limitNow = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);\n            let y = 0;\n            for (let steps = 0; y <= limitNow() && steps < 60; steps++, y += step) {',
    replace: 'const limit0 = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);\n            let y = 0;\n            for (let steps = 0; y <= limit0 && steps < 60; steps++, y += step) {' },
  // G30 softens the protocol's exit gate — the exact-phrase pin (Sol P2 #6)
  // is what catches it; the old includes('on_par') substring pin did not.
  { id: 'G30-protocol-any-critic', file: MODULE,
    find: 'binary, no scores. ALL critics must pass.',
    replace: 'binary, no scores. ANY critic passing suffices.' },
  // ---- G38–G40: the FOUR-EDGE work, which shipped with no mutants at all.
  // The session that added it proved its three tests red by hand-reverting
  // dist/ and never encoded the reverts, so "mutant-proven" was true of that
  // afternoon and of nothing since. A hand-probe establishes point-in-time
  // behaviour and encodes no regression guard — the standing rule.
  { id: 'G38-sides-top-only', file: MODULE,
    find: 'const SIDES = ["Top", "Right", "Bottom", "Left"];',
    replace: 'const SIDES = ["Top"];' },
  // G39 is the load-bearing one: it drops the per-side FILTER while leaving the
  // four-edge READ intact, which is the only thing that separates the two
  // mechanisms. G38 alone would not — the SIDES list is the entry point both
  // assertions run through, so its radius is a fact about that entry point and
  // never evidence of two independent guards.
  { id: 'G39-recovery-ignores-side', file: MODULE,
    find: 'for (const r of authoredRules) {\n            if (r.side !== side)\n                continue;',
    replace: 'for (const r of authoredRules) {\n            if (false)\n                continue;' },
  // G40 drops the dedupe without touching the iteration contract, so an
  // undeduped uniform box quadruples its own weight in the 90%-coverage tally.
  { id: 'G40-treatments-not-deduped', file: MODULE,
    find: 'const elTreatments = new Set();',
    replace: 'const elTreatments = { _a: [], add(v) { this._a.push(v); }, [Symbol.iterator]() { return this._a[Symbol.iterator](); } };' },
  // ---- G41–G43: one per Sol P1 of the release round. All three defects are
  // the SAME direction — a confident wrong hairline — and the principle behind
  // every fix is that a false RECOVERY is worse than a false ambiguity, because
  // the caller is handed a number instead of a warning.
  // G41 is the exact pre-fix shape, both halves: the `>= 1` guard only ever
  // caught a sub-pixel rule paired with a FULL-pixel one, and the answer it
  // then gave was source order. It must leave the mixed conflict test GREEN —
  // that test passes under both shapes, which is precisely why it could not
  // see this defect.
  { id: 'G41-conflict-mixed-only-last-wins', file: MODULE,
    // RE-ANCHORED in round 8: the `subPixelConflict++` counter was inserted into
    // the exact two lines this was pinned to, and the pre-flight aborted on the
    // dead anchor in seconds rather than mis-measuring an hour in. The mutation
    // is unchanged in meaning — the conflict test becomes a threshold test and
    // the winner becomes last-wins — and it deliberately KEEPS the increment, so
    // it stays a mutation of the conflict RULE and not of the counter G70 owns.
    find: 'if (new Set(matched).size > 1) {\n            subPixelConflict++;\n            return "unresolved";\n        }\n        const only = matched[0];',
    replace: 'if (matched.some((w) => w >= 1)) {\n            subPixelConflict++;\n            return "unresolved";\n        }\n        const only = matched[matched.length - 1];' },
  // G42 drops the unresolved-expression record. The row then matches no
  // collected rule, `authoredSubPixel` answers null, and the engine's own
  // rounded 1px is reported as measured with no caveat — the feature inverted
  // on the likeliest real input there is, a tokenised var() width.
  // G42 was RE-ANCHORED in round 3: its find-string named the keyword test that
  // the unit-gate fix (G47 below) replaced, so it died exactly as the standing
  // dead-anchor rule predicts. Same defect, same declared behaviour — drop the
  // unresolved-expression record and the row matches no collected rule, so
  // `authoredSubPixel` answers null and the engine's own rounded 1px is
  // reported as measured with no caveat.
  { id: 'G42-unresolved-width-dropped', file: MODULE,
    // ANCHOR RE-CUT FOR v11 (second time for this mutant): round 5 rewrote this
    // exact line, adding the `unevaluable` demotion arm to the same else-if.
    // The harness ABORTED on it rather than mis-measuring, which is the
    // uniqueness check working. The edit's INTENT is unchanged — delete the
    // unresolved push — but its blast radius is now wider by construction,
    // because the same branch also carries the demotion G59 targets from the
    // other side. That is a fact about the branch, not a second guard.
    // ANCHOR RE-CUT FOR v15 (third time for this mutant): round 9 replaced
    // `rule.selectorText` with the nesting-RESOLVED `ownSelector` on both
    // unresolved pushes. The edit's intent is unchanged; the `else if` line is
    // what keeps this find unique against the sibling push in the logical arm.
    find: '                    else if (n === "unresolved" || (unevaluable && typeof n === "number"))\n                        unresolvedRules.push({ selector: ownSelector, side, important });\n',
    replace: '' },
  // G43 trusts the truncated table. The cap can stop MID-RULE, so what was
  // collected is not a prefix of the cascade; a kept 0.5px with the winning
  // 1px cut off becomes a confident hairline on a page that renders at 1px.
  // The caveat still fires under this mutant — only the recovered VALUE
  // separates it, which is what the test's first assertion reads.
  { id: 'G43-overflow-still-recovers', file: MODULE,
    find: '        if (ruleOverflow)\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  // ---- G44–G47: one per Sol ROUND-3 P1/P1/P1 fix. Same direction again — a
  // confident wrong hairline — reached through three doors the round-2 fixes
  // left open, plus the one the caller's own comment claimed was closed.
  // G44 is the blocked-sheet door. It is G43's defect one gate over: an
  // unreadable cross-origin sheet may carry the rule that WINS, so a value
  // recovered from the sheets that did parse is a number for an edge whose
  // authored width is unknown. Pre-fix the caller checked sheetsBlocked only
  // AFTER accepting a recovered number, which made the recovered edges the
  // exception to a caveat that covered every other one.
  { id: 'G44-blocked-sheet-still-recovers', file: MODULE,
    find: '        if (sheetsBlocked > 0)\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  // G45 restores the shipped claim that inline style "stays trustworthy" —
  // it does not, because a stylesheet declaration marked `!important` beats it.
  // The later `if (inline && importantConflict)` line goes unreachable under
  // this mutant, which is the pre-fix shape exactly.
  { id: 'G45-inline-wins-unconditionally', file: MODULE,
    find: '        const inline = el.style && el.style["border" + side + "Width"];\n        if (inline && !importantConflict) {',
    replace: '        const inline = el.style && el.style["border" + side + "Width"];\n        if (inline) {' },
  // G46 restores the FALL-THROUGH on an inline width this probe cannot read.
  // `parseFloat("var(--hairline)")` is NaN, and continuing to the stylesheet
  // scan then answers the edge with a rule the inline declaration OVERRIDES —
  // a width that appears nowhere on the rendered page.
  { id: 'G46-inline-unreadable-falls-through', file: MODULE,
    find: '            const n = pxLength(inline);\n            if (typeof n === "number")\n                return n > 0 && n < 1 ? n : null;\n            return n === "unresolved" ? "unresolved" : null;\n',
    replace: '            const n = pxLength(inline);\n            if (typeof n === "number")\n                return n > 0 && n < 1 ? n : null;\n' },
  // G47 makes the length gate unit-BLIND, which is what `parseFloat` was: it
  // reads "0.5em" as 0.5, so an edge authored .5em at a 2px font-size — which
  // computes at exactly 1px — is reported as a recovered 0.5px hairline.
  { id: 'G47-unit-blind-length', file: MODULE,
    find: '        const m = /^([+-]?(?:\\d+\\.?\\d*|\\.\\d+))px$/i.exec(t);',
    replace: '        const m = /^([+-]?(?:\\d+\\.?\\d*|\\.\\d+))(?:px|em|rem|pt)$/i.exec(t);' },
  // ---- G48–G50 exist because of Sol's round-3 P2, and the finding generalises:
  // `assert` aborts at the first failure, so a mutant declared against a test
  // can be graded by a DIFFERENT assertion inside it. Every caveat assertion in
  // this suite sat behind a value assertion that the value mutants redden
  // first, which left the DISCLOSURE half of each claim unguarded. These three
  // break the disclosure and nothing else, so each caveat assertion is reached.
  // G48 stops the ambiguity from being COUNTED: the widths stay correct and the
  // caveat simply never fires, which is the silent-unknown outcome the whole
  // hairline feature exists to prevent.
  { id: 'G48-ambiguity-not-counted', file: MODULE,
    find: '                    else if (authored === "unresolved" || sheetsBlocked > 0)\n                        subPixelAmbiguous++;',
    replace: '                    else if (false)\n                        subPixelAmbiguous++;' },
  // G49 and G50 drop one NAMED cause each. The caveat still fires, so only the
  // assertions that read the cause by name can see them — which is what makes
  // "the caller can tell a busy page from a conflicted one" a measurement
  // rather than a sentence in a comment.
  { id: 'G49-cap-cause-unnamed', file: MODULE,
    find: '            if (hairlines.ruleOverflow)\n                causes.push("the authored-rule scan hit its cap");\n',
    replace: '' },
  { id: 'G50-cross-origin-cause-unnamed', file: MODULE,
    find: '                causes.push(hairlines.sheetsBlocked + " cross-origin stylesheet(s) could not be read");',
    replace: '                causes.push("a stylesheet could not be read");' },
  // ---- G51–G53 are Sol's round-4 P1s. Both findings are the SAME class as all
  // three round-3 P1s and as each other: a cascade source the probe cannot see,
  // producing a confident wrong hairline. Round 3 hardened the DOORS; round 4
  // found the SCAN itself was incomplete, which is why neither is reachable by
  // any mutant confined to the importantConflict branch.
  // G51 drops the adopted-stylesheet scan. `document.adoptedStyleSheets` is a
  // separate collection from `document.styleSheets` and the cascade includes
  // both, so an adopted `!important` rule was invisible and the inline fast
  // path recovered 0.5px on an edge rendering at 1px.
  { id: 'G51-adopted-sheets-unscanned', file: MODULE,
    find: '        for (const sheet of Array.from(document.adoptedStyleSheets || [])) {',
    replace: '        for (const sheet of Array.from([])) {' },
  // G52 deletes the animation gate outright. An animation declaration outranks
  // every normal author declaration INCLUDING inline, and its value is in no
  // rule this scan collects — so "!important is the only thing that can outrank
  // inline" was false by a second, independent path.
  { id: 'G52-animation-gate-dropped', file: MODULE,
    find: '        if (animatedSide(el, side))\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  // G53 is the OTHER direction and is why the animation test carries a second
  // arm. Making the gate blanket-refuse for ANY animated element closes the
  // finding and is still wrong: an element animating border-radius has a
  // perfectly readable border-width. G52 and G53 pull opposite ways, so a fix
  // that merely refused everything could not pass both — the A9/A10 pattern.
  { id: 'G53-animation-gate-property-blind', file: MODULE,
    find: '                for (const f of frames)\n                    if (Object.prototype.hasOwnProperty.call(f, prop))\n                        return true;',
    replace: '                for (const f of frames)\n                    if (f)\n                        return true;' },
  // G54 is DISCLOSURE-ONLY, the G48-G50 pattern applied to the round-4 tests.
  // Every hairline test asserts a value and THEN the caveat; `assert` aborts at
  // the first failure, so no value-breaking mutant ever reaches a caveat
  // assertion and all of them are comments until something leaves the values
  // green. This suppresses the warning and touches no reported number.
  { id: 'G54-hairline-caveat-undisclosed', file: MODULE,
    find: '        if (hairlines.subPixelAmbiguous > 0 || hairlines.sheetsBlocked > 0 || hairlines.ruleOverflow) {',
    replace: '        if (false) {' },
  // ROUND 5 (G55-G59). The round-4 header called the scan complete for the
  // sources this probe can read. It was not, and BOTH P1s are the round-4
  // shape again: a cascade source the probe cannot SEE, producing a confident
  // wrong hairline — the outcome this feature exists to prevent — reached
  // through doors round 4 did not enumerate. Fourth consecutive round to
  // demonstrate that a matrix measures the mechanisms it NAMES and is blind to
  // the ones nobody thought of.
  // G55 — @import is a THIRD rule source and it is reached through a DIFFERENT
  // property: CSSOM gives a CSSImportRule no `cssRules` at all, exposing the
  // imported sheet as `rule.styleSheet`, so the recursion never saw one. The
  // mutant restores that blindness exactly (the rule then falls to the
  // `rule.cssRules` test, which is undefined, and is skipped entirely).
  { id: 'G55-import-sheet-unscanned', file: MODULE,
    find: '            if (rule.styleSheet) {\n                if (rule.media && rule.media.mediaText) {',
    replace: '            if (false) {\n                if (rule.media && rule.media.mediaText) {' },
  // G56 — FINISHED IS NOT GONE. `animation-fill-mode: forwards|both` keeps
  // applying the final keyframe after the animation ends, and an
  // animation-origin value outranks every normal author declaration, inline
  // included. The mutant restores the unconditional skip on `finished`.
  { id: 'G56-finished-fill-ignored', file: MODULE,
    find: '                    if (fill === "none" || fill === "backwards")\n                        continue;',
    replace: '                    if (true)\n                        continue;' },
  // G57 — the OTHER direction from G55/G56: a false AMBIGUITY, not a false
  // recovery. The old conditional-group test asked `rule.media &&
  // rule.conditionText`, and CSSSupportsRule has conditionText and NO media, so
  // every @supports branch was recursed into as though active. The mutant makes
  // the evaluated verdict inert, collecting rules that are not on this render.
  { id: 'G57-supports-branch-blind', file: MODULE,
    find: '                    if (applies === false)\n                        continue;',
    replace: '                    if (false)\n                        continue;' },
  // G58/G59 are ONE RULE AT TWO DOORS and both redden the SAME single test,
  // separated only by which mechanism they break — the V14/V16 and V21/V22
  // pattern. A container query is decided by a box this probe is not reading,
  // so its subtree degrades to UNRESOLVED: it can force an honest ambiguity and
  // can never be handed back as a recovered answer. G58 breaks the FLAG at the
  // call site (the block becomes ordinary nested rules); G59 breaks the PUSH
  // that honours it (widths under an unevaluable condition land in
  // authoredRules again). Either way the container width is recovered.
  // RE-ANCHORED in round 7. `collectRules(rule.cssRules, true)` used to occur
  // exactly once; the P1-2 unknown-group fix added a SECOND site with a
  // byte-identical body, so the old find-string stopped being unique and the
  // harness ABORTED at pre-flight rather than mutating whichever one it reached
  // first. That abort is the uniqueness check working — a find-string mutant
  // dies the moment its target line is duplicated, exactly as it dies when the
  // line is edited. The anchor now carries the tail of the CONTAINER comment,
  // which no other site shares. G64 owns the other site.
  { id: 'G58-container-treated-as-plain', file: MODULE,
    find: '                    // unresolved, which degrades to a stated ambiguity and never to a\n                    // recovery.\n                    collectRules(rule.cssRules, true, parentSelector);\n                    continue;',
    // ANCHOR RE-CUT FOR v15: round 9 gave collectRules a third parameter, the
    // parent selector that travels down a nesting chain. The two comment lines
    // are load-bearing in this find — the bare call is not unique.
    replace: '                    // unresolved, which degrades to a stated ambiguity and never to a\n                    // recovery.\n                    collectRules(rule.cssRules, unevaluable, parentSelector);\n                    continue;' },
  { id: 'G59-unevaluable-push-ignored', file: MODULE,
    find: '                    if (typeof n === "number" && !unevaluable)',
    replace: '                    if (typeof n === "number")' },
  // G60 — ROUND 6, and it exists because HAND-GRADING the round-5 matrix found
  // a claim in a comment that a kill could never have caught. The file://
  // @import fixture asserted that "either reading is covered": readable sheet
  // gives an !important conflict, blocked sheet increments sheetsBlocked. That
  // is true of the assertions and FALSE of the fixture — measured directly, a
  // file:// import throws SecurityError on .cssRules every time, so the
  // conflict arm was exercised by NOTHING while a green test looked like it
  // covered both. G55 cannot separate them (it deletes the whole branch and
  // reddens both import tests). G60 forces the BLOCKED path on a readable
  // sheet, which leaves the file:// test green and the http test red on its
  // discriminator — the ABSENCE of the cross-origin cause in the caveat. (That
  // assertion was DRAFTED as `sheetsBlocked === 0` and could not ship: the
  // counters are destructured out at src/design-gauntlet.ts:617 and never
  // re-emitted, so they surface only as warning TEXT. The wording is the better
  // discriminator anyway — it names the mechanism instead of a number, and
  // adding `hairlines` to the public type to satisfy a test would be a product
  // change made for a test's convenience.) That is the arm proving the imported
  // rules are actually COLLECTED rather than blanket-refused.
  { id: 'G60-readable-import-forced-blocked', file: MODULE,
    find: '                try {\n                    collectRules(rule.styleSheet.cssRules, unevaluable);\n                }',
    replace: '                try {\n                    throw new Error("forced");\n                }' },
  // G61/G62 — ROUND 7, and they are ONE RULE AT TWO DOORS in the sharpest form
  // this matrix has carried, because the round shipped with exactly one of the
  // two doors applied. The shadow scan COUNTS (G62's door) and the refusal gate
  // READS that count (G61's door), and a counter nobody reads compiles clean,
  // passes every test in the repo, and leaves the defect completely untouched.
  // G61 deletes the gate while the scan still runs; G62 leaves the gate in place
  // and stops the scan ever incrementing. Both redden the shadow test alone, and
  // both must exist or the half-applied state is indistinguishable from the fix.
  { id: 'G61-shadow-refusal-gate-deleted', file: MODULE,
    find: '        if (shadowBorderRules > 0)\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  { id: 'G62-shadow-scan-never-counts', file: MODULE,
    find: '                    if (declaresBorderWidth(sheet.cssRules)) {\n                        shadowBorderRules++;',
    replace: '                    if (false) {\n                        shadowBorderRules++;' },
  // G63 — the OTHER direction on the same gate, and the reason the benign
  // shadow fixture is a guard rather than a comment. Counting a shadow root
  // rather than a shadow BORDER RULE refuses every page that uses shadow DOM at
  // all, which on a component-based site is the whole recovery gone. A refusal
  // that never lifts is an outage, not a refusal.
  //
  // CORRECTED after GLM round 7c (P3-2): this comment used to close with "no
  // assertion in the defect direction can see it, because refusing more is never
  // a wrong ANSWER", and that is FALSE. The benign fixture's SECOND assertion —
  // that the shadow cause is not claimed — goes red the moment shadowBorderRules
  // is non-zero, so G63 kills TWO assertions, not zero. The mutant was killed the
  // whole time; only the reasoning was wrong. Left as a warning, because the SAME
  // sentence pattern in G68 below produced a false PREDICTION rather than merely a
  // false explanation, and that one cost a survivor.
  { id: 'G63-shadow-gate-fires-on-any-root', file: MODULE,
    find: '                    if (declaresBorderWidth(sheet.cssRules)) {\n                        shadowBorderRules++;',
    replace: '                    if (true) {\n                        shadowBorderRules++;' },
  // G64 — reverts the unknown-conditional-group default. The pre-fix code fell
  // through to the plain recursion with `unevaluable` UNCHANGED, so an at-rule
  // group the probe cannot evaluate was collected as AUTHORED. This is the exact
  // shipped defect: `@scope (.absent)` never applies, its condition is dropped
  // at collection, and only `r.selector` is tested with el.matches() — so a
  // width on no render outranks the inline declaration and is handed back as a
  // recovery. Reddens the unknown-group test alone; @supports, @container,
  // @media and @layer all take earlier branches and are untouched.
  //
  // SURVIVED MATRIX v15, and the fixture was the reason. The unknown-group test
  // authored its border INLINE, and an inline width plus a matching !important
  // authored rule returns "unresolved" at the `inline && importantConflict`
  // short-circuit — the SAME string the unevaluable-group path returns further
  // down. Two mechanisms, one observable; all four assertions read identically in
  // both arms. The fixture authors the border in the stylesheet now, which sends
  // the mutant past that short-circuit into matched[], where TWO widths increment
  // subPixelConflict, and a fifth assertion pins the caveat WORDING. Re-measured
  // 2026-08-17: killed at radius 1, on the declared assertion by name.
  { id: 'G64-unknown-group-collected-as-authored', file: MODULE,
    find: '                if (!isNesting && !isMedia && !isLayer) {',
    replace: '                if (false) {' },
  // G65/G66 — ROUND 8, and they are the G61/G62 shape one layer out: the closed
  // shadow-root fix is ONE RULE AT TWO DOORS, an `attachShadow` wrapper that
  // STASHES every `{mode:"closed"}` root (G65's door) and a scan that READS that
  // stash (G66's door). A stash nobody reads and a reader with an empty stash are
  // byte-identical in every observable, both compile clean, and both pass the
  // whole repo suite — which is precisely the half-applied state round 7 shipped
  // and round 8 was written to make distinguishable. Both redden the CLOSED test
  // alone; the open-root path never touches either door.
  { id: 'G65-closed-root-never-stashed', file: MODULE,
    find: '                        if (init && init.mode === "closed")\n                            stash.push(root);',
    replace: '                        if (false)\n                            stash.push(root);' },
  { id: 'G66-closed-stash-never-read', file: MODULE,
    find: '        if (closed && typeof closed.length === "number") {',
    replace: '        if (false) {' },
  // G67 — drops the ADOPTED half of the shadow sheet spread. A shadow root has
  // TWO sheet collections and every other shadow fixture in the suite delivers
  // its CSS through an inline `<style>`, so this half regressing left them all
  // green. Reddens the shadow-ADOPTED test alone.
  { id: 'G67-shadow-adopted-sheets-dropped', file: MODULE,
    find: '                ...Array.from(root.adoptedStyleSheets || []),\n            ];',
    replace: '            ];' },
  // G68 — drops the `measured.has(root.host)` re-check, so a stashed closed root
  // whose host is not measured at all counts anyway. This is the OUTAGE
  // direction: a rule that cannot affect any border in the tally refuses the
  // whole page's recovery.
  //
  // SURVIVED MATRIX v15, AND THIS COMMENT PREDICTED THE KILL IN WRITING — it read
  // "Reddens the DETACHED test alone", and the run falsified it. The fixture built
  // its detached root with `r.innerHTML = "<style>…</style>"`, and a DETACHED
  // shadow root exposes ZERO entries in root.styleSheets (measured in Chromium by
  // agent-output/probe-detached-sheet.mjs, not reasoned about), so
  // declaresBorderWidth had nothing to find and the re-check this mutant deletes
  // was never reached with anything to see. adoptedStyleSheets DOES populate on a
  // detached root; the fixture uses a constructed sheet now. Re-measured
  // 2026-08-17: killed at radius 1. A written prediction is a claim like any
  // other, and this one sat green in the harness for three rounds.
  { id: 'G68-detached-closed-root-counted', file: MODULE,
    find: '                if (root && root.host && measured.has(root.host))',
    replace: '                if (root && root.host)' },
  // G69/G70 — the caveat's specificity sentence, and they pull in OPPOSITE
  // directions on one mechanism, separated only by which set they redden.
  // `subPixelAmbiguous` counts refusals from EIGHT causes and only ONE of them
  // is a specificity conflict, so narrating the total as "the winner depends on
  // specificity" is wrong seven ways out of eight.
  //
  // G69 reverts the sentence to the total — the shipped defect — and reddens the
  // three ABSENCE assertions (open shadow, closed shadow, adopted shadow), which
  // is the measurement that those three are guarding something.
  // G70 stops the counter incrementing, so the sentence never fires at all, and
  // reddens the POSITIVE CONTROL alone. Without G70 the three absence assertions
  // would pass vacuously under a mutant that deletes the sentence outright — an
  // absence assertion needs a positive control or it measures nothing.
  { id: 'G69-specificity-sentence-on-the-total', file: MODULE,
    // ANCHOR RE-CUT FOR v15: the sentence this mutant edits was itself rewritten
    // — it no longer claims the winner "depends on specificity", because the
    // increment site asks nothing of the kind. The id is kept for continuity;
    // read it as "the conflict sentence counts the TOTAL", which is the defect
    // it has always described. The `otherAmbiguous` subtraction below is left
    // untouched on purpose, so the mutant double-counts exactly as before.
    find: '            if (hairlines.subPixelConflict > 0) {\n                causes.push(hairlines.subPixelConflict + " edge(s) matched more than one authored width and this probe does not " +',
    replace: '            if (hairlines.subPixelAmbiguous > 0) {\n                causes.push(hairlines.subPixelAmbiguous + " edge(s) matched more than one authored width and this probe does not " +' },
  { id: 'G70-conflict-counter-never-increments', file: MODULE,
    find: '            subPixelConflict++;\n            return "unresolved";',
    replace: '            return "unresolved";' },
  // ---- ROUND 9 ----------------------------------------------------------
  // G71/G72 — the DECLARATIVE closed shadow root, two doors on one mechanism.
  // A declarative root never calls Element.prototype.attachShadow, so the
  // in-page wrapper cannot see it and `host.shadowRoot` is null: it is detected
  // from OUTSIDE, in the main document's response bytes. G71 blinds the
  // DETECTOR, G72 opens the GATE the detector feeds. Both redden the same two
  // tests, which is the honest reading — they are two doors, not two rules.
  { id: 'G71-declarative-closed-undetected', file: MODULE,
    find: '            declarativeClosedRoots = hits ? hits.length : 0;',
    replace: '            declarativeClosedRoots = 0;' },
  { id: 'G72-declarative-gate-deleted', file: MODULE,
    find: '        if (declarativeClosedRoots > 0)\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  // G73 — the LOGICAL rule-scan door. `rule.style.borderTopWidth` reads "" for
  // every logical authoring form, so without this branch the rule is not seen
  // at all: no authored width, no !important conflict, and an inline 0.5px is
  // recovered against a rule painting 1px. Reddens BOTH logical rule tests —
  // the longhand and the shorthand are two authoring forms of ONE mechanism.
  { id: 'G73-logical-rule-unscanned', file: MODULE,
    find: '                if (declaresLogicalWidth(rule.style)) {',
    replace: '                if (false) {' },
  // G74 — narrows LOGICAL_WIDTHS to the BLOCK pair. This is what separates the
  // four-name SET from a plausible half-measure: the block fixtures stay green
  // and only the INLINE one reddens, so the set's width is measured rather than
  // asserted.
  { id: 'G74-logical-set-block-only', file: MODULE,
    find: '        "border-block-start-width", "border-block-end-width",\n        "border-inline-start-width", "border-inline-end-width",',
    replace: '        "border-block-start-width", "border-block-end-width",' },
  // G75 — the THIRD logical door, the only one on the element itself. Its
  // observable is the WARNING, not the tally: with no matched rules the
  // recovery returns null either way, so `1px` sits in the tally under both the
  // old behaviour and the new. An assertion on the tally alone could not see
  // this fix in either direction, which is why its test asserts the caveat.
  { id: 'G75-inline-logical-door-deleted', file: MODULE,
    find: '        if (el.style && declaresLogicalWidth(el.style))\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  // G76 — the shipped nesting defect: test a nested rule STANDALONE, where `&`
  // degrades to `:scope`. It reddens the two nesting-resolution tests in
  // OPPOSITE directions, which is why both fixtures had to exist. Under it the
  // APPLIES arm misses a real rule (false recovery) while the ORPHAN arm
  // falsely matches an absent parent (a suppressed recovery it has no bearing
  // on). One mutant, two harms, and neither fixture can see the other's.
  { id: 'G76-nested-rule-tested-standalone', file: MODULE,
    find: '                ownSelector = parentSelector === null\n                    ? rule.selectorText\n                    : resolveNested(rule.selectorText, parentSelector);',
    replace: '                ownSelector = rule.selectorText;' },
  // G77/G78 — the unattributable-nesting refusal, counter and gate. Same
  // two-door shape as G71/G72: G77 stops the count, G78 opens the gate it
  // feeds. Both redden the unresolvable-parent test.
  { id: 'G77-nesting-drop-instead-of-refuse', file: MODULE,
    find: '                nestingUnattributable++;',
    replace: '                ;' },
  { id: 'G78-nesting-gate-deleted', file: MODULE,
    find: '        if (nestingUnattributable > 0)\n            return "unresolved";',
    replace: '        if (false)\n            return "unresolved";' },
  // G79 — the TEXTUAL `::` refusal, and it is killable only by the fixture that
  // removes CSS.supports. Measured: on Chromium
  // `CSS.supports('selector(:is(.card::before) .row)')` is FALSE, so
  // selectorParses rejects the selector one line later and this clause has no
  // reachable trigger at all. On the DOM fallback — an engine with no
  // CSS.supports — the same selector is ACCEPTED, because the fallback returns
  // true whenever matches() does not throw and that call returns false without
  // throwing. So the clause is load-bearing on exactly one path, and the mutant
  // reddens exactly the test that constructs it.
  { id: 'G79-pseudo-parent-refusal-deleted', file: MODULE,
    find: '        if (parent.indexOf("::") !== -1)\n            return null;',
    replace: '        if (false)\n            return null;' },
  // Controls — behaviour-neutral by CONSTRUCTION (object-literal key order and
  // declaration order carry no semantics), never merely unasserted.
  // Deliberately NOT a control: reordering SIDES. The previous session's log
  // called it one on the strength of a green run, and green is not the claim a
  // control makes. `tally`'s sort is stable, so equal-count entries break ties
  // by Map insertion order — which SIDES order decides — and `cap` then slices
  // at TALLY_CAP, so a reorder can change which entries survive the slice on a
  // page with ties at the boundary. It is unobservable in the RECOVERY path
  // (G43's fix turns recovery off past the cap), and that is a narrower claim
  // than behaviour-neutral.
  { id: 'C1-control-key-order-swap', file: MODULE, expect: 'green',
    find: 'fix: "Remove positive letter-spacing from body text.",\n                kind: "mechanical", effect: "medium"',
    replace: 'fix: "Remove positive letter-spacing from body text.",\n                effect: "medium", kind: "mechanical"' },
  { id: 'C2-control-decl-order-swap', file: MODULE, expect: 'green',
    find: 'const mechanical = [];\n    const needsDecision = [];',
    replace: 'const needsDecision = [];\n    const mechanical = [];' }
];

function runSuite() {
  const res = spawnSync('node', ['--test', SUITE], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' }
  });
  const out = (res.stdout || '') + (res.stderr || '');
  const num = (label) => {
    const m = out.match(new RegExp('^ℹ ' + label + ' (\\d+)$', 'm'));
    return m ? Number(m[1]) : null;
  };
  const names = new Set();
  for (const m of out.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)) names.add(m[1].trim());
  return {
    tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'),
    status: res.status, names: [...names]
  };
}

function checkSyntax(source) {
  // dist/ files are ESM: bare `node --check -` parses stdin as CJS and rejects
  // the PRISTINE file on its first import (measured v1 abort, 2026-08-14).
  const res = spawnSync('node', ['--input-type=module', '--check', '-'], { input: source, encoding: 'utf8' });
  return res.status === 0;
}

const originals = new Map([[MODULE, readFileSync(MODULE, 'utf8')], [INDEX, readFileSync(INDEX, 'utf8')]]);

// Pre-flight: every mutant must anchor uniquely and produce parseable output
// BEFORE anything runs — a dead find-string must abort in seconds, not minutes.
for (const m of MUTANTS) {
  const src = originals.get(m.file);
  const first = src.indexOf(m.find);
  if (first === -1) { console.error(`ABORT: ${m.id} find-string not present`); process.exit(1); }
  if (src.indexOf(m.find, first + 1) !== -1) { console.error(`ABORT: ${m.id} find-string not unique`); process.exit(1); }
  const mutated = src.replace(m.find, m.replace);
  if (!checkSyntax(mutated)) { console.error(`ABORT: ${m.id} fails node --check`); process.exit(1); }
}
console.log(`pre-flight: ${MUTANTS.length} mutants anchor uniquely and parse`);

const baseline = runSuite();
console.log(`baseline: tests=${baseline.tests} pass=${baseline.pass} fail=${baseline.fail} skipped=${baseline.skipped} status=${baseline.status}`);
if (baseline.tests !== EXPECTED_BASELINE.tests || baseline.pass !== EXPECTED_BASELINE.pass ||
    baseline.fail !== EXPECTED_BASELINE.fail || baseline.skipped !== EXPECTED_BASELINE.skipped ||
    baseline.status !== 0 || baseline.pass <= 0) {
  console.error('ABORT: baseline does not match the DECLARED expectation — grading against it would measure nothing.');
  process.exit(1);
}

let survived = 0, falseFails = 0;
for (const m of MUTANTS) {
  const src = originals.get(m.file);
  writeFileSync(m.file, src.replace(m.find, m.replace));
  const run = runSuite();
  writeFileSync(m.file, src);
  if (readFileSync(m.file, 'utf8') !== src) { console.error(`ABORT: restore of ${m.file} failed`); process.exit(1); }

  // A NON-GREEN RUN IS NOT AUTOMATICALLY A KILL (Sol R11 P2, hardened 2026-08-18).
  // The grading below used to classify ANY non-green result as `killed`, which
  // folds three different events into one word: a genuine assertion failure, a
  // child that died before `node --test` printed its totals, and a run whose
  // summary could not be parsed at all. The last two say nothing about the
  // mutant and must never be scored as evidence against it. Two facts separate
  // them, and both are already in hand: unparsed totals (`tests === null`),
  // and — the sharper one — a non-green run whose `names` list is EMPTY, since
  // `names` is populated only from real `✖ <name> (Nms)` lines, so a red with
  // no named test is a run that never got as far as failing an assertion.
  // This ABORTS rather than counting, because a matrix carrying one void row is
  // not a matrix with one bad cell — it is a measurement of unknown coverage.
  const voidRun =
    run.tests === null || run.pass === null || run.fail === null || run.skipped === null ||
    run.status === null ||
    (run.fail !== 0 && run.names.length === 0);
  if (voidRun) {
    console.error(`ABORT: ${m.id} produced a VOID run, not a verdict — ` +
      `tests=${run.tests} pass=${run.pass} fail=${run.fail} skipped=${run.skipped} ` +
      `status=${run.status} namedFailures=${run.names.length}. ` +
      `Neither a kill nor a survival may be read from it.`);
    process.exit(1);
  }

  const green = run.fail === 0 && run.status === 0 && run.pass === EXPECTED_BASELINE.pass && run.skipped === EXPECTED_BASELINE.skipped;
  if (m.expect === 'green') {
    if (green) console.log(`CONTROL ${m.id}: green (correct)`);
    else { console.log(`CONTROL ${m.id}: FALSE-FAILED — ${run.fail} red: ${run.names.join(' | ')}`); falseFails++; }
  } else if (green) {
    console.log(`${m.id}: SURVIVED`);
    survived++;
  } else {
    console.log(`${m.id}: killed, radius ${run.names.length} — ${run.names.join(' | ')}`);
  }
}

// PROVENANCE OF THE TWO LINES A READER GRADES THIS RUN BY (corrected 2026-08-18,
// Sol R11 P2). `summary:` below is written by THIS harness off the same two
// counters `process.exitCode` is set from, so reading it IS reading the
// predicate. `EXIT=` is NOT written here — it is appended by the INVOKING SHELL
// (`… ; echo "EXIT=$?"`), so it reports that the shell reached its last line and
// nothing about the harness's verdict. Both lines land in the same log file,
// which is what made them easy to conflate. Grade on `summary:` plus the
// per-mutant lines; treat `EXIT=` as corroboration only.
console.log(`\nsummary: ${MUTANTS.filter((m) => m.expect !== 'green').length} mutants, ${survived} survived, ${falseFails} controls false-failed`);
if (survived > 0 || falseFails > 0) process.exitCode = 1;
