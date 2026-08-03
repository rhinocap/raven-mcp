// Round 3 SECONDARY endpoint — three diverse-lens blind judges per build (craft / brief / repro),
// mean of the three, pre-registered equivalence margin delta = +/- 8 points on the 0-100 scale.
//
// REVISED after the round-3 falsification pass, which found three errors:
//   1. Hardcoded Welch t = 2.18. Real df here is 9.56, t = 2.2422. Now computed (tstat.mjs).
//   2. Verdict called the result "UNINFORMATIVE" because 2*delta (16 pts) exceeds the realised
//      between-build range (11 pts). That comparison is post-hoc: delta was pre-registered
//      against the 0-100 scale before any score existed, and the realised range is data. A
//      narrow realised range limits what the equivalence generalises to; it does not retroactively
//      void a pre-registered margin. The ratio is still reported, as a limit, not as a veto.
//   3. The variance section reported SHARES OF SUMS OF SQUARES as if they were variance
//      components, ignoring df — and with one observation per build x lens cell, interaction and
//      residual are not separable at all. Both are now reported correctly and labelled.

import { readFileSync } from 'node:fs';
import { welch } from './tstat.mjs';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const rows = JSON.parse(readFileSync(R3 + '/round3/secondary-raw.json', 'utf8'));

const sealed = readFileSync(R3 + '/SEALED-ASSIGNMENT-R3.md', 'utf8');
const ASSIGN = {};
for (const m of sealed.matchAll(/\|\s*build-(\d+)\s*\|\s*([AB])\s*\|/g)) ASSIGN[m[1]] = m[2];

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const LENSES = ['craft', 'brief', 'repro'];
const scoreOf = (r, lens) => r.votes.find((v) => v.lens === lens).score;

const per = rows.map((r) => ({
  build: r.build,
  arm: ASSIGN[r.build.split('-')[1]],
  craft: scoreOf(r, 'craft'), brief: scoreOf(r, 'brief'), repro: scoreOf(r, 'repro'),
  mean: mean(LENSES.map((l) => scoreOf(r, l))),
}));

console.log('per build (craft / brief / repro -> mean):');
for (const p of per) {
  console.log(`  ${p.build} [arm ${p.arm}]  ${p.craft}  ${p.brief}  ${p.repro}  ->  ${p.mean.toFixed(2)}`);
}

const A = per.filter((p) => p.arm === 'A').map((p) => p.mean);
const B = per.filter((p) => p.arm === 'B').map((p) => p.mean);
const DELTA = 8;
const w = welch(A, B);

console.log(`\nARM A (composed prompt): ${w.ma.toFixed(2)} (sd ${w.sdA.toFixed(2)})`);
console.log(`ARM B (one-liner)      : ${w.mb.toFixed(2)} (sd ${w.sdB.toFixed(2)})`);
console.log(`diff ${w.diff.toFixed(2)}   95% CI [${w.lo.toFixed(3)}, ${w.hi.toFixed(3)}]` +
            `   (Welch df ${w.df.toFixed(2)}, t ${w.t.toFixed(4)}, delta = +/-${DELTA})`);

console.log('\nper lens (A mean / B mean / diff):');
for (const l of LENSES) {
  const a = per.filter((p) => p.arm === 'A').map((p) => p[l]);
  const b = per.filter((p) => p.arm === 'B').map((p) => p[l]);
  console.log(`  ${l.padEnd(6)} ${mean(a).toFixed(2)}  ${mean(b).toFixed(2)}  ${(mean(a) - mean(b)).toFixed(2)}`);
}

let verdict;
if (w.lo > 0) verdict = 'ARM A BETTER on this endpoint.';
else if (w.lo >= -DELTA && w.hi <= DELTA) {
  verdict = `EQUIVALENT within +/-${DELTA} on expected judge score. Under §13 equivalence FIRES ` +
            'the delete clause.';
} else if (w.hi < -DELTA) verdict = 'ARM A WORSE.';
else verdict = 'INCONCLUSIVE — CI straddles the margin.';
console.log('\nSECONDARY VERDICT (pre-registered rule): ' + verdict);

// --- Limits on the estimand, reported as limits rather than as a veto --------------------------
const allMeans = per.map((p) => p.mean);
const range = Math.max(...allMeans) - Math.min(...allMeans);
console.log(`\nESTIMAND LIMITS`);
console.log(`  realised between-build range ${Math.min(...allMeans).toFixed(2)}..${Math.max(...allMeans).toFixed(2)} ` +
            `= ${range.toFixed(2)} pts; the +/-${DELTA} window is ${(2 * DELTA).toFixed(0)} pts = ` +
            `${((2 * DELTA) / range * 100).toFixed(0)}% of it. The margin was set on the 0-100 scale ` +
            'before any data existed, so this does not void it — but it means the equivalence is over ' +
            'a population of builds that this judge scores within an 11-point band.');
console.log('  round 2 measured this judge\'s test-retest correlation on BYTE-IDENTICAL artifacts at ' +
            'r ~= 0. Unbiased noise costs power rather than logically invalidating an arm-mean ' +
            'comparison, but it means a per-build score here carries almost no information.');

// --- Variance: SS shares AND method-of-moments components, both labelled -----------------------
const all = per.flatMap((p) => LENSES.map((l) => p[l]));
const grand = mean(all);
const nB = per.length, nL = LENSES.length;
const ssTotal = all.reduce((s, x) => s + (x - grand) ** 2, 0);
const ssBuild = per.reduce((s, p) => s + nL * (p.mean - grand) ** 2, 0);
const ssLens = LENSES.reduce((s, l) => s + nB * (mean(per.map((p) => p[l])) - grand) ** 2, 0);
const ssRes = ssTotal - ssBuild - ssLens;
const msBuild = ssBuild / (nB - 1), msLens = ssLens / (nL - 1), msRes = ssRes / ((nB - 1) * (nL - 1));
const vBuild = (msBuild - msRes) / nL, vLens = (msLens - msRes) / nB;
const vTot = vBuild + vLens + msRes;

console.log(`\nvariance over all ${all.length} votes (14 builds x 3 lenses, ONE observation per cell)`);
console.log(`  shares of sums of squares (df ignored — descriptive only):`);
console.log(`    build ${(100 * ssBuild / ssTotal).toFixed(0)}%   lens ${(100 * ssLens / ssTotal).toFixed(0)}%   residual ${(100 * ssRes / ssTotal).toFixed(0)}%`);
console.log(`  mean squares: build ${msBuild.toFixed(3)}  lens ${msLens.toFixed(3)}  residual ${msRes.toFixed(3)}`);
console.log(`  method-of-moments variance components (the figure to actually quote):`);
console.log(`    build ${(100 * vBuild / vTot).toFixed(1)}%   lens ${(100 * vLens / vTot).toFixed(1)}%   residual ${(100 * msRes / vTot).toFixed(1)}%`);
console.log('  CONFOUND: with one observation per cell, build x lens interaction is inseparable from');
console.log('  error. The ~75% residual may be genuine multidimensionality (a build strong on craft');
console.log('  and weak on reproduction) rather than judges disagreeing about the same file. Both');
console.log('  readings are consistent with these data; the design cannot tell them apart.');
