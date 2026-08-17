#!/usr/bin/env node
/**
 * Mutation matrix for test/design-gauntlet.test.mjs (house style: string-edit
 * mutants on dist/, clean baseline vs DECLARED counts, node --check pre-flight,
 * verified restores, deduped failing-test NAMES, exitCode on survivors or
 * false-fails). Run with:  node .claude/gauntlet-2026-08-14/gauntlet-mutants.mjs
 * NEVER via `npm test` with a mutant applied — clean && tsc clobbers dist/.
 *
 * MEASURED v7 (2026-08-17, agent-output/mutants-v7.log), 40p/0f/0s declared
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
const EXPECTED_BASELINE = { tests: 44, pass: 44, fail: 0, skipped: 0 };

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
    find: 'if (new Set(matched).size > 1)\n            return "unresolved";\n        const only = matched[0];',
    replace: 'if (matched.some((w) => w >= 1))\n            return "unresolved";\n        const only = matched[matched.length - 1];' },
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
    find: '                    else if (n === "unresolved")\n                        unresolvedRules.push({ selector: rule.selectorText, side, important });\n',
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

console.log(`\nsummary: ${MUTANTS.filter((m) => m.expect !== 'green').length} mutants, ${survived} survived, ${falseFails} controls false-failed`);
if (survived > 0 || falseFails > 0) process.exitCode = 1;
