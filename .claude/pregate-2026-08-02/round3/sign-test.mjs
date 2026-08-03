// Step 6 analysis — the human anchor.
// Usage: node sign-test.mjs "1:L  2:R  3:L  4:L  5:R  6:R  7:L"
//
// Andrew's picks arrive as pair:side. We map side -> arm through the sealed key and run
// an exact two-sided sign test. Ties ("=") are dropped, which is the standard treatment
// and costs power — reported explicitly rather than silently.

import { readFileSync } from 'node:fs';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const sealed = readFileSync(R3 + '/SEALED-ASSIGNMENT-R3.md', 'utf8');

// Pair key rows: | 1 | 1L = build-02 | A | 1R = build-01 | B |
const KEY = {};
for (const m of sealed.matchAll(/\|\s*(\d)\s*\|\s*\dL = build-(\d+)\s*\|\s*([AB])\s*\|\s*\dR = build-(\d+)\s*\|\s*([AB])\s*\|/g)) {
  KEY[m[1]] = { L: { build: m[2], arm: m[3] }, R: { build: m[4], arm: m[5] } };
}

const raw = process.argv[2] || '';
const picks = {};
for (const m of raw.matchAll(/([1-7])\s*:\s*([LR=])/gi)) picks[m[1]] = m[2].toUpperCase();

if (Object.keys(picks).length === 0) {
  console.error('No picks parsed. Pass them like: "1:L  2:R  3:L  4:L  5:R  6:R  7:L"');
  process.exit(1);
}

// Exact binomial, two-sided, p = 0.5.
const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
function signTestP(a, n) {
  if (n === 0) return 1;
  let p = 0;
  for (let k = 0; k <= n; k++) {
    const pr = choose(n, k) * Math.pow(0.5, n);
    if (Math.abs(k - n / 2) >= Math.abs(a - n / 2) - 1e-9) p += pr;
  }
  return Math.min(1, p);
}

let winA = 0, winB = 0, ties = 0;
console.log('pair  pick   winner   (L / R)');
for (const n of ['1', '2', '3', '4', '5', '6', '7']) {
  const k = KEY[n];
  if (!k) continue;
  const p = picks[n];
  if (p === undefined) { console.log(`  ${n}   —      not judged`); continue; }
  if (p === '=') { ties++; console.log(`  ${n}   tie    —        (${k.L.arm} / ${k.R.arm})`); continue; }
  const won = k[p].arm;
  if (won === 'A') winA++; else winB++;
  console.log(`  ${n}   ${p}      arm ${won}   build-${k[p].build}   (${k.L.arm} / ${k.R.arm})`);
}

const n = winA + winB;
const pval = signTestP(winA, n);
console.log(`\narm A (composed prompt) won ${winA} of ${n} decided pairs; arm B won ${winB}. Ties dropped: ${ties}.`);
console.log(`exact two-sided sign test: p = ${pval.toFixed(4)}`);

let verdict;
if (n === 0) verdict = 'No decided pairs — the human read returned no signal.';
else if (pval >= 0.05) {
  verdict = `NOT SIGNIFICANT at 0.05. With ${n} decided pairs this test could only have reached ` +
            `significance at ${n}-0 or close to it, so a null here means UNDERPOWERED-OR-NO-EFFECT — ` +
            'it is not evidence the two are the same.';
} else if (winA > winB) verdict = 'Andrew preferred the COMPOSED-PROMPT arm significantly. §13 delete clause does NOT fire.';
else verdict = 'Andrew preferred the ONE-LINER arm significantly. §13 delete clause fires.';
console.log('\nHUMAN VERDICT: ' + verdict);
