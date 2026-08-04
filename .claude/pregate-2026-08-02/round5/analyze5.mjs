// Round 5 analysis. Written and hashed BEFORE any build ran, so the decision rule could not
// be tuned to the data. Reuses round3/tstat.mjs verbatim — its Welch df is computed, not
// hardcoded, which is what the round-3 falsification pass fixed.
//
//   node analyze5.mjs <scores.json> <assignment.json>
//
// Applies PREREGISTRATION-R5.md §6 exactly, AND IN ITS ORDER:
//   1  DELETE (equivalence)  CI wholly within ±δ
//   2  DELETE (inferior)     CI upper < 0
//   3  PASS                  CI lower > 0
//   4  INCONCLUSIVE          anything else
//
// The order is the fix for round 4's analyze4.mjs, which tested `lo > 0` first and so
// reported PASS for any interval that satisfied both superiority and equivalence — silently
// resolving the ambiguous case in the tool's favour. An interval like [0.5, 1.5] against
// δ = 2 is a difference that is detectable and negligible at the same time, and §13's clause
// is about "no better", so it is a delete.

import { readFileSync } from 'node:fs';
import { welch } from '../round3/tstat.mjs';

const DELTA = 2.0;            // pre-registered in §7, fixed before any build
const PRIMARY_MAX = 16;
const CONTROL_MAX = 8;

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const scores = Array.isArray(raw.results)
  ? Object.fromEntries(raw.results.map((r) => [r.build, r]))
  : raw;
const assignment = JSON.parse(readFileSync(process.argv[3], 'utf8'));

const missing = Object.keys(assignment).filter((id) => !scores[id]);
if (missing.length) {
  console.error(`REFUSING TO ANALYSE: ${missing.length} build(s) unscored — ${missing.join(', ')}`);
  console.error('§11 requires all 18 measured before any result is read.');
  process.exit(1);
}

const by = (arm, field) => Object.entries(assignment)
  .filter(([, a]) => a === arm)
  .map(([id]) => scores[id]?.[field])
  .filter((v) => typeof v === 'number');

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

// §6, in order. The first matching branch decides; nothing below it is consulted.
function verdict(w) {
  if (w.lo >= -DELTA && w.hi <= DELTA) return `DELETE (equivalence) — CI wholly inside ±${DELTA}; "no better" fires`;
  if (w.hi < 0) return 'DELETE (inferior) — A is worse than B2';
  if (w.lo > 0) return 'PASS — A beats B2 by more than δ; §13 satisfied; the composer stays';
  return 'INCONCLUSIVE — neither superiority nor equivalence shown; one more round, then delete';
}

function report(label, a, b, armA, armB, max) {
  const w = welch(a, b);
  console.log(`\n## ${label}   (max ${max})`);
  console.log(`  ${armA}  n=${a.length}  mean ${fmt(w.ma)}  sd ${fmt(w.sdA)}   [${a.join(', ')}]`);
  console.log(`  ${armB}  n=${b.length}  mean ${fmt(w.mb)}  sd ${fmt(w.sdB)}   [${b.join(', ')}]`);
  console.log(`  diff ${fmt(w.diff)}   95% CI [${fmt(w.lo)}, ${fmt(w.hi)}]`);
  console.log(`  se ${fmt(w.se, 3)}   df ${fmt(w.df, 2)}   t* ${fmt(w.t, 4)}`);
  return w;
}

console.log(`# Round 5 — primary endpoint (${PRIMARY_MAX} discriminating checks), δ = ±${DELTA}`);

const pA = by('A', 'primary'), pB1 = by('B1', 'primary'), pB2 = by('B2', 'primary');
const wDeciding = report('A vs B2 — THE DECIDING COMPARISON', pA, pB2, 'A ', 'B2', PRIMARY_MAX);
console.log(`\n  VERDICT: ${verdict(wDeciding)}`);

report('A vs B1 — manipulation check only, not the decision', pA, pB1, 'A ', 'B1', PRIMARY_MAX);
console.log('\n  A > B1 is expected by construction. A tie here means the fixture failed,');
console.log('  not that the arms are equal. It never decides the round.');

console.log(`\n\n# Controls (${CONTROL_MAX} checks reachable by every arm) — reported, never merged`);
const cA = by('A', 'control'), cB1 = by('B1', 'control'), cB2 = by('B2', 'control');
const wc = report('A vs B2 — controls', cA, cB2, 'A ', 'B2', CONTROL_MAX);
report('A vs B1 — controls', cA, cB1, 'A ', 'B1', CONTROL_MAX);
const means = [cA, cB1, cB2].map((v) => v.reduce((s, x) => s + x, 0) / v.length);
const controlSpread = Math.max(...means) - Math.min(...means);
console.log('\n  A material control difference means the arms were not identical outside');
console.log('  the tool restriction, and INVALIDATES the round (§5).');
console.log(`  Largest control mean spread across the three arms: ${fmt(controlSpread)} of ${CONTROL_MAX}.`);
console.log(`  Control CI (A vs B2): [${fmt(wc.lo)}, ${fmt(wc.hi)}]`);

// ── §8 secondary endpoints. Registered before the data; they decide NOTHING. ──────────────
console.log('\n\n# Secondary endpoints (§8) — pre-registered, non-deciding');

// S1 — variance ratio. F = sd(B2)^2 / sd(A)^2 on (nB2-1, nA-1) df, two-sided 90% interval.
// The F quantile is obtained by bisecting its own CDF, which is written in terms of the same
// regularised incomplete beta tstat.mjs already carries — no table, no new dependency.
const varOf = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length;
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); };
// F CDF: P(F <= f) = I_{d1 f/(d1 f + d2)}(d1/2, d2/2). tstat.mjs keeps its incomplete beta
// private, so the same routine is carried here rather than exported and shared — a copy that
// can be diffed beats an edit to a sealed file.
const fCdf = (f, d1, d2) => (f <= 0 ? 0 : betai(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2)));
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
function fInv(p, d1, d2) {
  let lo = 1e-9, hi = 1e9;
  for (let i = 0; i < 300; i++) {
    const mid = Math.sqrt(lo * hi);
    if (fCdf(mid, d1, d2) < p) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}
const vA = varOf(pA), vB2 = varOf(pB2);
const dfA = pA.length - 1, dfB2 = pB2.length - 1;
console.log(`\n## S1 — variance ratio (does the composer raise the FLOOR?)`);
if (vA === 0 && vB2 === 0) {
  console.log('  Both arms have zero variance. The ratio is undefined; nothing to report.');
} else if (vA === 0) {
  console.log(`  sd(A) = 0, sd(B2) = ${fmt(Math.sqrt(vB2))}. The ratio is unbounded above; ` +
    'arm A produced identical scores on all six builds. Reported as a fact, not a test.');
} else {
  const F = vB2 / vA;
  const lo = F / fInv(0.95, dfB2, dfA);
  const hi = F / fInv(0.05, dfB2, dfA);
  console.log(`  sd(A) ${fmt(Math.sqrt(vA))}   sd(B2) ${fmt(Math.sqrt(vB2))}`);
  console.log(`  F = sd(B2)^2 / sd(A)^2 = ${fmt(F)}   90% CI [${fmt(lo)}, ${fmt(hi)}]  on (${dfB2}, ${dfA}) df`);
  console.log(`  ${lo > 1 ? 'Interval excludes 1: B2 is the more variable arm — consistent with a floor effect.'
    : hi < 1 ? 'Interval excludes 1 below: A is the MORE variable arm.'
    : 'Interval contains 1: no variance difference demonstrated.'}`);
}
console.log('\n## S2 — worst build (raw, no test; n = 6 carries no inferential weight in a minimum)');
console.log(`  min(A) ${Math.min(...pA)}   min(B1) ${Math.min(...pB1)}   min(B2) ${Math.min(...pB2)}   of ${PRIMARY_MAX}`);

// ── Per-check diagnostic ─────────────────────────────────────────────────────────────────
console.log('\n\n# Per-check pass rate by arm — diagnostic only, no inference attached');
const CHECKS = [...(raw.discriminating ?? []), ...(raw.controls ?? [])];
const rate = (arm, ck) => {
  const ids = Object.entries(assignment).filter(([, a]) => a === arm).map(([id]) => id);
  const hits = ids.filter((id) => scores[id]?.checks?.[ck] === true).length;
  return `${hits}/${ids.length}`;
};
console.log('  check    A     B1    B2');
for (const ck of CHECKS) {
  console.log(`  ${ck.padEnd(7)} ${rate('A', ck).padEnd(5)} ${rate('B1', ck).padEnd(5)} ${rate('B2', ck)}`);
}
