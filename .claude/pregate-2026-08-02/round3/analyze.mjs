// Round 3 PRIMARY analysis. Unseals the arm assignment and applies the pre-registered
// decision rule.
//
// REVISED after the round-3 falsification pass, which found two errors:
//   1. The Welch critical value was hardcoded at 2.16 with a comment claiming it was
//      "conservative for the df we get here". It was not: arm B has zero variance, so the
//      real df is 6 and t(.975) = 2.4469. The interval was understated by ~14%. Now
//      computed from the df (see tstat.mjs, self-checked against published values).
//   2. The verdict called the result "UNINFORMATIVE — ceiling". That was wrong in the
//      tool's favour and is the mirror image of the round-2 error. delta was pre-registered
//      BEFORE the data existed; a CI inside it IS the equivalence result the rule asked for.
//      A ceiling constrains the ESTIMAND ("equivalent on these six checks"), it does not
//      let me discard a pre-registered result after seeing which way it went.
//
// The ceiling and restricted-range facts are still reported — as limits on what the result
// generalises to, which is what they actually are.

import { readFileSync } from 'node:fs';
import { welch } from './tstat.mjs';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const rows = JSON.parse(readFileSync(R3 + '/round3/primary-results.json', 'utf8'));

// Unsealed from ../SEALED-ASSIGNMENT-R3.md, written before any build ran.
const sealed = readFileSync(R3 + '/SEALED-ASSIGNMENT-R3.md', 'utf8');
const ASSIGN = {};
for (const m of sealed.matchAll(/\|\s*build-(\d+)\s*\|\s*([AB])\s*\|/g)) ASSIGN[m[1]] = m[2];

const A = rows.filter((r) => ASSIGN[r.build.split('-')[1]] === 'A');
const B = rows.filter((r) => ASSIGN[r.build.split('-')[1]] === 'B');
const DELTA = 1.0; // pre-registered margin on the 0-6 primary scale

console.log('ARM A (composed prompt):', A.map((r) => r.build + '=' + r.score).join(' '));
console.log('ARM B (one-liner)      :', B.map((r) => r.build + '=' + r.score).join(' '));

const w = welch(A.map((r) => r.score), B.map((r) => r.score));
console.log(`\nprimary  A=${w.ma.toFixed(2)} (sd ${w.sdA.toFixed(2)})  B=${w.mb.toFixed(2)} (sd ${w.sdB.toFixed(2)})`);
console.log(`         diff ${w.diff.toFixed(2)}  95% CI [${w.lo.toFixed(3)}, ${w.hi.toFixed(3)}]` +
            `  (Welch df ${w.df.toFixed(2)}, t ${w.t.toFixed(4)}, delta = +/-${DELTA})`);

console.log('\nper-check pass rate (A / B):');
for (const k of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
  const pa = A.filter((r) => r.checks[k]).length, pb = B.filter((r) => r.checks[k]).length;
  console.log(`  ${k}: ${pa}/${A.length}  ${pb}/${B.length}`);
}

// --- Pre-registered decision rule --------------------------------------------------------------
let verdict;
if (w.lo > 0) verdict = 'ARM A BETTER — the tool adds measurable value; delete clause does NOT fire.';
else if (w.lo >= -DELTA && w.hi <= DELTA) {
  verdict = `EQUIVALENT within +/-${DELTA} on this endpoint. §13 reads "if it is no better, ` +
            'delete the tool", so equivalence FIRES the delete clause.';
} else if (w.hi < -DELTA) verdict = 'ARM A WORSE — delete clause fires a fortiori.';
else verdict = 'INCONCLUSIVE — CI straddles the margin.';
console.log('\nPRIMARY VERDICT (pre-registered rule): ' + verdict);

// --- What the result does NOT license ----------------------------------------------------------
const distinct = new Set(rows.map((r) => r.score));
const modal = Math.max(...[...distinct].map((v) => rows.filter((r) => r.score === v).length));
console.log(`\nESTIMAND LIMIT: ${modal}/${rows.length} builds share one score (observed scores: ` +
            `${[...distinct].sort().join(',')}). Five of six checks passed 14/14, so this is ` +
            'equivalence ON THESE SIX CHECKS, not equivalence of build quality. The endpoint is ' +
            'saturated; it cannot detect a difference it was never sensitive to.');

// --- Pre-specified-rule sensitivity on P2 ------------------------------------------------------
// P2 (zero Talon findings) fires on 13/14 builds against #141414 / #1c1c1c, which are the arena
// DESIGN.md's own bg-elev / bg-card tokens — so it penalises faithful transcription of the design
// system, and the single 6 came from a build that OMITTED a token. Calling that "invalid" after
// seeing the result is post-hoc, so P2 is NOT dropped. It is reported both ways instead.
const drop = (r) => ['P1', 'P3', 'P4', 'P5', 'P6'].filter((k) => r.checks[k]).length;
const w2 = welch(A.map(drop), B.map(drop));
console.log(`\nSENSITIVITY (P2 excluded, labelled post-hoc): A=${w2.ma.toFixed(2)} B=${w2.mb.toFixed(2)} ` +
            `diff ${w2.diff.toFixed(2)} — every build scores ${drop(rows[0])}/5. Total saturation: ` +
            'excluding P2 makes the endpoint perfectly non-discriminating, which strengthens the ' +
            'estimand limit above rather than rescuing either arm.');

// P1 is the check the step-1 emphasis-ramp guard was built to protect. Report it directly.
console.log('\nP1 (max text size inside the transient surface), per build:');
for (const r of rows) {
  console.log(`  ${r.build} [arm ${ASSIGN[r.build.split('-')[1]]}] maxFont=${r.max_font_in_surface}px  root=${r.surface_root}`);
}
