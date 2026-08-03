// Round 3 analysis. Unseals the arm assignment and applies the PRE-REGISTERED
// decision rule to the primary endpoint. Reports the ceiling honestly rather than
// converting a non-discriminating measure into a parity claim.
import { readFileSync } from 'node:fs';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const rows = JSON.parse(readFileSync(R3 + '/round3/primary-results.json', 'utf8'));

// Unsealed from ../SEALED-ASSIGNMENT-R3.md, written before any build ran.
const sealed = readFileSync(R3 + '/SEALED-ASSIGNMENT-R3.md', 'utf8');
const ASSIGN = {};
for (const m of sealed.matchAll(/\|\s*build-(\d+)\s*\|\s*([AB])\s*\|/g)) ASSIGN[m[1]] = m[2];

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const varr = (a) => a.length < 2 ? 0 : a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1);

// Welch two-sample interval — same machinery round 2 used, so the numbers are comparable.
function welch(a, b) {
  const [ma, mb] = [mean(a), mean(b)];
  const [va, vb] = [varr(a), varr(b)];
  const se = Math.sqrt(va / a.length + vb / b.length);
  const df = se === 0 ? 1 : (va / a.length + vb / b.length) ** 2 /
    ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
  const t = 2.16; // ~t(.975) at df≈13; conservative for the df we get here
  return { ma, mb, diff: ma - mb, sdA: Math.sqrt(va), sdB: Math.sqrt(vb), se, df,
           lo: ma - mb - t * se, hi: ma - mb + t * se };
}

const A = rows.filter(r => ASSIGN[r.build.split('-')[1]] === 'A');
const B = rows.filter(r => ASSIGN[r.build.split('-')[1]] === 'B');

console.log('ARM A (composed prompt):', A.map(r => r.build + '=' + r.score).join(' '));
console.log('ARM B (one-liner)      :', B.map(r => r.build + '=' + r.score).join(' '));
console.log();

const sa = A.map(r => r.score), sb = B.map(r => r.score);
const w = welch(sa, sb);
const DELTA = 1.0; // pre-registered margin on the 0-6 primary scale
console.log(`primary  A=${w.ma.toFixed(2)} (sd ${w.sdA.toFixed(2)})  B=${w.mb.toFixed(2)} (sd ${w.sdB.toFixed(2)})`);
console.log(`         diff ${w.diff.toFixed(2)}  95% CI [${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]  (delta = +/-${DELTA})`);

// Per-check pass rates — where the ceiling actually lives.
console.log('\nper-check pass rate (A / B):');
for (const k of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
  const pa = A.filter(r => r.checks[k]).length, pb = B.filter(r => r.checks[k]).length;
  console.log(`  ${k}: ${pa}/${A.length}  ${pb}/${B.length}`);
}

// Discriminating power: a measure where nearly every unit scores the same cannot
// support an equivalence claim, whatever the interval says.
const distinct = new Set(rows.map(r => r.score));
const modal = Math.max(...[...distinct].map(v => rows.filter(r => r.score === v).length));
console.log(`\nceiling check: ${modal}/${rows.length} builds share one score; distinct scores observed = ${[...distinct].sort().join(',')}`);

let verdict;
if (modal / rows.length >= 0.8) {
  verdict = 'UNINFORMATIVE — ceiling effect. The primary endpoint did not discriminate, so it ' +
            'supports neither superiority nor equivalence. Not a parity result.';
} else if (w.lo > 0) verdict = 'ARM A BETTER — keep the tool.';
else if (w.lo >= -DELTA && w.hi <= DELTA) verdict = 'EQUIVALENT within +/-' + DELTA + ' — delete clause fires.';
else if (w.hi < -DELTA) verdict = 'ARM A WORSE — delete clause fires a fortiori.';
else verdict = 'INCONCLUSIVE — CI straddles the margin.';
console.log('\nPRIMARY VERDICT: ' + verdict);

// P1 is the check the step-1 guard was built to protect. Report it directly.
console.log('\nP1 (max text size inside the transient surface), per build:');
for (const r of rows) {
  console.log(`  ${r.build} [arm ${ASSIGN[r.build.split('-')[1]]}] maxFont=${r.max_font_in_surface}px  root=${r.surface_root}`);
}
