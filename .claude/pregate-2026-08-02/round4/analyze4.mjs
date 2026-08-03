// Round 4 analysis. Written BEFORE any build result was read, so the decision rule
// could not be tuned to the data. Reuses round3/tstat.mjs verbatim — its Welch df is
// computed, not hardcoded, which is what the round-3 falsification pass fixed.
//
//   node analyze4.mjs <scores.json> <assignment.json>
//
// Applies PREREGISTRATION.md §5 exactly:
//   PASS                  CI lower  > 0
//   DELETE (equivalence)  CI wholly within ±δ
//   DELETE (inferior)     CI upper  < 0
//   INCONCLUSIVE          straddles 0 and is not contained in ±δ

import { readFileSync } from 'node:fs';
import { welch } from '../round3/tstat.mjs';

const DELTA = 1.5;            // pre-registered, fixed before any build
const PRIMARY_MAX = 13;
const CONTROL_MAX = 8;

// measure.mjs emits {discriminating[], controls[], results:[{build, primary, control,
// checks, notes}]}. Keyed by build id here. Structural adaptation, made pre-data — the
// synthetic-branch validation below was re-run against this shape.
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const scores = Array.isArray(raw.results)
  ? Object.fromEntries(raw.results.map((r) => [r.build, r]))
  : raw;
const assignment = JSON.parse(readFileSync(process.argv[3], 'utf8'));

const missing = Object.keys(assignment).filter((id) => !scores[id]);
if (missing.length) {
  console.error(`REFUSING TO ANALYSE: ${missing.length} build(s) unscored — ${missing.join(', ')}`);
  console.error('§8 requires all 18 measured before any result is read.');
  process.exit(1);
}

const by = (arm, field) => Object.entries(assignment)
  .filter(([, a]) => a === arm)
  .map(([id]) => scores[id]?.[field])
  .filter((v) => typeof v === 'number');

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

function verdict(w) {
  if (w.lo > 0) return 'PASS — A beats B2; §13 satisfied; build the composer';
  if (w.lo >= -DELTA && w.hi <= DELTA) return `DELETE (equivalence) — CI inside ±${DELTA}`;
  if (w.hi < 0) return 'DELETE (inferior) — A is worse than B2';
  return 'INCONCLUSIVE — straddles 0, not contained in ±δ; one more round, then delete';
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

console.log(`# Round 4 — primary endpoint (${PRIMARY_MAX} discriminating checks), δ = ±${DELTA}`);

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
console.log('\n  A material control difference means the arms were not identical outside');
console.log('  the information block, and INVALIDATES the round (§4).');
const controlSpread = Math.max(...[cA, cB1, cB2].map((v) => v.reduce((s, x) => s + x, 0) / v.length))
                    - Math.min(...[cA, cB1, cB2].map((v) => v.reduce((s, x) => s + x, 0) / v.length));
console.log(`  Largest control mean spread across the three arms: ${fmt(controlSpread)} of ${CONTROL_MAX}.`);
console.log(`  Control CI (A vs B2): [${fmt(wc.lo)}, ${fmt(wc.hi)}]`);

console.log('\n\n# Per-check pass rate by arm — diagnostic only, no inference attached');
const CHECKS = ['D1','D2','D3','D4','D5','D6','D7','D8','T1','T2','T3','T4','T5',
                'C1','C2','C3','C4','C5','C6','C7','C8'];
const rate = (arm, ck) => {
  const ids = Object.entries(assignment).filter(([, a]) => a === arm).map(([id]) => id);
  const hits = ids.filter((id) => scores[id]?.checks?.[ck] === true).length;
  return `${hits}/${ids.length}`;
};
console.log('  check    A     B1    B2');
for (const ck of CHECKS) {
  console.log(`  ${ck.padEnd(7)} ${rate('A', ck).padEnd(5)} ${rate('B1', ck).padEnd(5)} ${rate('B2', ck)}`);
}
