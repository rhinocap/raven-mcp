// Round 3 SECONDARY endpoint — three diverse-lens blind judges per build (craft / brief / repro),
// mean of the three, pre-registered equivalence margin delta = +/- 8 points on the 0-100 scale.
//
// The pre-registration flags this endpoint as SUSPECT before it was ever run: round 2 measured the
// LLM judge's test-retest correlation on byte-identical artifacts at r ~= 0. This script therefore
// reports the interval AND the two things that decide whether the interval means anything:
//   (a) the between-build spread the judges actually produced, against delta; and
//   (b) how much of the total variance is the LENS rather than the BUILD.
// If delta swallows the observed range, or lens explains more variance than build, the interval is
// arithmetic, not evidence.

import { readFileSync } from 'node:fs';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const rows = JSON.parse(readFileSync(R3 + '/round3/secondary-raw.json', 'utf8'));

const sealed = readFileSync(R3 + '/SEALED-ASSIGNMENT-R3.md', 'utf8');
const ASSIGN = {};
for (const m of sealed.matchAll(/\|\s*build-(\d+)\s*\|\s*([AB])\s*\|/g)) ASSIGN[m[1]] = m[2];

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const varr = (a) => (a.length < 2 ? 0 : a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1));
const sd = (a) => Math.sqrt(varr(a));

const LENSES = ['craft', 'brief', 'repro'];
const scoreOf = (r, lens) => r.votes.find((v) => v.lens === lens).score;

const per = rows.map((r) => ({
  build: r.build,
  arm: ASSIGN[r.build.split('-')[1]],
  craft: scoreOf(r, 'craft'),
  brief: scoreOf(r, 'brief'),
  repro: scoreOf(r, 'repro'),
  mean: mean(LENSES.map((l) => scoreOf(r, l))),
}));

console.log('per build (craft / brief / repro -> mean):');
for (const p of per) {
  console.log(`  ${p.build} [arm ${p.arm}]  ${p.craft}  ${p.brief}  ${p.repro}  ->  ${p.mean.toFixed(2)}`);
}

const A = per.filter((p) => p.arm === 'A').map((p) => p.mean);
const B = per.filter((p) => p.arm === 'B').map((p) => p.mean);

// Welch, same machinery as the primary so the two are comparable.
const se = Math.sqrt(varr(A) / A.length + varr(B) / B.length);
const diff = mean(A) - mean(B);
const t = 2.18; // ~t(.975), df ~= 12; conservative
const lo = diff - t * se, hi = diff + t * se;
const DELTA = 8;

console.log(`\nARM A (composed prompt): ${mean(A).toFixed(2)} (sd ${sd(A).toFixed(2)})`);
console.log(`ARM B (one-liner)      : ${mean(B).toFixed(2)} (sd ${sd(B).toFixed(2)})`);
console.log(`diff ${diff.toFixed(2)}   95% CI [${lo.toFixed(2)}, ${hi.toFixed(2)}]   (delta = +/-${DELTA})`);

// Per lens, in case one lens carries a signal the mean washes out.
console.log('\nper lens (A mean / B mean / diff):');
for (const l of LENSES) {
  const a = per.filter((p) => p.arm === 'A').map((p) => p[l]);
  const b = per.filter((p) => p.arm === 'B').map((p) => p[l]);
  console.log(`  ${l.padEnd(6)} ${mean(a).toFixed(2)}  ${mean(b).toFixed(2)}  ${(mean(a) - mean(b)).toFixed(2)}`);
}

// --- (a) Does delta swallow the measure? -------------------------------------------------------
const allMeans = per.map((p) => p.mean);
const range = Math.max(...allMeans) - Math.min(...allMeans);
const ratio = (2 * DELTA) / range;
console.log(`\nobserved between-build range: ${Math.min(...allMeans).toFixed(2)} .. ${Math.max(...allMeans).toFixed(2)}  (spread ${range.toFixed(2)} pts)`);
console.log(`equivalence window is +/-${DELTA} = ${2 * DELTA} pts wide = ${(ratio * 100).toFixed(0)}% of the entire observed spread`);

// --- (b) Is the score about the build, or about the lens? --------------------------------------
// One-way decomposition across the 42 votes: how much variance is between builds vs between lenses.
const all = per.flatMap((p) => LENSES.map((l) => p[l]));
const grand = mean(all);
const ssTotal = all.reduce((s, x) => s + (x - grand) ** 2, 0);
const ssBuild = per.reduce((s, p) => s + 3 * (p.mean - grand) ** 2, 0);
const ssLens = LENSES.reduce((s, l) => s + per.length * (mean(per.map((p) => p[l])) - grand) ** 2, 0);
console.log(`\nvariance decomposition over all ${all.length} votes:`);
console.log(`  between builds  ${(100 * ssBuild / ssTotal).toFixed(0)}%`);
console.log(`  between lenses  ${(100 * ssLens / ssTotal).toFixed(0)}%`);
console.log(`  residual        ${(100 * (ssTotal - ssBuild - ssLens) / ssTotal).toFixed(0)}%  (build x lens disagreement)`);

// --- verdict ------------------------------------------------------------------------------------
let verdict;
if (ratio >= 1) {
  verdict = `UNINFORMATIVE — the pre-registered margin (+/-${DELTA}) is wider than the whole range the ` +
            'judges produced across 14 builds. An interval inside that window was arithmetically ' +
            'unavoidable and is not evidence of equivalence.';
} else if (lo > 0) verdict = 'ARM A BETTER on the secondary endpoint.';
else if (lo >= -DELTA && hi <= DELTA) verdict = `EQUIVALENT within +/-${DELTA} — but see the reliability caveat below.`;
else if (hi < -DELTA) verdict = 'ARM A WORSE.';
else verdict = 'INCONCLUSIVE — CI straddles the margin.';

console.log('\nSECONDARY VERDICT: ' + verdict);
console.log(
  '\nRELIABILITY CAVEAT (pre-registered, not post-hoc): round 2 measured this instrument\'s\n' +
  'test-retest correlation on BYTE-IDENTICAL artifacts at r ~= 0. A measure that cannot reproduce\n' +
  'its own score on the same input cannot license an equivalence claim about two different inputs.\n' +
  'This endpoint is reported for completeness. It does not decide the gate.');
