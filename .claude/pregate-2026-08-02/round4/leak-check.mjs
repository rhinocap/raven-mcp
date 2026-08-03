// Did any build transcribe the answer key, or each other?
//
// The builders were told not to open fixtures/conformant/ or another build. That is a
// prose instruction and prose instructions get talked around, so this measures it. A
// build that copied the conformant fixture would score high for a reason that has
// nothing to do with its arm, and would silently corrupt the round.
//
//   node leak-check.mjs
//
// Two signals, both on the raw HTML with whitespace collapsed:
//   LCS   longest common substring, in characters
//   J3    Jaccard over character 12-grams
//
// Neither has an absolute threshold that means anything a priori — all 18 builds solve
// the same brief with the same seeded data and the same seven component names, so a real
// floor of similarity is expected. What matters is whether any pair is an OUTLIER against
// the distribution of all the others. That is what this reports.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IDS = Array.from({ length: 18 }, (_, i) => `b${String(i + 1).padStart(2, '0')}`);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const load = (p) => (existsSync(p) ? norm(readFileSync(p, 'utf8')) : null);

// Longest common substring via rolling-hash binary search — O(n log n), not O(n^2).
function lcsLen(a, b) {
  const has = (len) => {
    if (len === 0) return true;
    const M = 2n ** 61n - 1n, B = 131n;
    let pow = 1n;
    for (let i = 0; i < len; i++) pow = (pow * B) % M;
    const hashes = (s) => {
      const out = new Set();
      let h = 0n;
      for (let i = 0; i < s.length; i++) {
        h = (h * B + BigInt(s.charCodeAt(i))) % M;
        if (i >= len) h = (h - BigInt(s.charCodeAt(i - len)) * pow % M + M) % M;
        if (i >= len - 1) out.add(h);
      }
      return out;
    };
    const A = hashes(a);
    let h = 0n;
    const M2 = M, B2 = B;
    let pw = 1n;
    for (let i = 0; i < len; i++) pw = (pw * B2) % M2;
    for (let i = 0; i < b.length; i++) {
      h = (h * B2 + BigInt(b.charCodeAt(i))) % M2;
      if (i >= len) h = (h - BigInt(b.charCodeAt(i - len)) * pw % M2 + M2) % M2;
      if (i >= len - 1 && A.has(h)) return true;
    }
    return false;
  };
  let lo = 0, hi = Math.min(a.length, b.length);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (has(mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const grams = (s, n = 12) => {
  const out = new Set();
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  return out;
};
const jaccard = (A, B) => {
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
};

const conformant = load(join(HERE, 'fixtures', 'conformant', 'index.html'));
const builds = {};
for (const id of IDS) {
  const h = load(join(HERE, 'builds', id, 'index.html'));
  if (h) builds[id] = h;
}
const present = Object.keys(builds);
console.log(`${present.length}/18 builds present\n`);

const G = Object.fromEntries(present.map((id) => [id, grams(builds[id])]));
const Gc = conformant ? grams(conformant) : null;

console.log('## vs the conformant fixture (the answer key)');
const vsKey = [];
for (const id of present) {
  const j = Gc ? jaccard(G[id], Gc) : NaN;
  const l = conformant ? lcsLen(builds[id], conformant) : NaN;
  vsKey.push({ id, j, l });
}
vsKey.sort((x, y) => y.j - x.j);
for (const { id, j, l } of vsKey) console.log(`  ${id}  J3 ${j.toFixed(4)}  LCS ${l}`);

const js = vsKey.map((v) => v.j);
const mean = js.reduce((s, x) => s + x, 0) / js.length;
const sd = Math.sqrt(js.reduce((s, x) => s + (x - mean) ** 2, 0) / (js.length - 1));
console.log(`\n  mean J3 ${mean.toFixed(4)}  sd ${sd.toFixed(4)}`);
const outliers = vsKey.filter((v) => v.j > mean + 3 * sd);
console.log(outliers.length
  ? `  OUTLIERS (>3sd): ${outliers.map((o) => o.id).join(', ')} — inspect before scoring`
  : '  no build is a >3sd outlier against the answer key');

console.log('\n## build-vs-build (cross-contamination)');
const pairs = [];
for (let i = 0; i < present.length; i++)
  for (let k = i + 1; k < present.length; k++)
    pairs.push({ a: present[i], b: present[k], j: jaccard(G[present[i]], G[present[k]]) });
pairs.sort((x, y) => y.j - x.j);
const pj = pairs.map((p) => p.j);
const pm = pj.reduce((s, x) => s + x, 0) / pj.length;
const ps = Math.sqrt(pj.reduce((s, x) => s + (x - pm) ** 2, 0) / (pj.length - 1));
console.log(`  mean J3 ${pm.toFixed(4)}  sd ${ps.toFixed(4)}   top 5 pairs:`);
for (const p of pairs.slice(0, 5)) {
  const flag = p.j > pm + 3 * ps ? '  <-- >3sd' : '';
  console.log(`    ${p.a}-${p.b}  ${p.j.toFixed(4)}${flag}`);
}
const badPairs = pairs.filter((p) => p.j > pm + 3 * ps);
console.log(badPairs.length
  ? `  ${badPairs.length} pair(s) >3sd — inspect before scoring`
  : '  no pair is a >3sd outlier');
