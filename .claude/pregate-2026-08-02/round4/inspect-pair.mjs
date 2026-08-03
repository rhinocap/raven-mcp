// Prints the actual longest common substring for a pair, so a >3sd Jaccard flag can be
// dispositioned by reading what is shared rather than by arguing about a number.
//
//   node inspect-pair.mjs b02 b17
//   node inspect-pair.mjs b07 KEY
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const path = (id) => id === 'KEY'
  ? join(HERE, 'fixtures', 'conformant', 'index.html')
  : join(HERE, 'builds', id, 'index.html');

const [x, y] = process.argv.slice(2);
const a = norm(readFileSync(path(x), 'utf8'));
const b = norm(readFileSync(path(y), 'utf8'));

// Straight DP is too big here; use suffix-free sliding over the shorter string with a map
// of the longer one's substrings at the candidate length, binary-searched.
const has = (len) => {
  if (len === 0) return '';
  const seen = new Map();
  for (let i = 0; i + len <= a.length; i++) seen.set(a.slice(i, i + len), i);
  for (let i = 0; i + len <= b.length; i++) {
    const s = b.slice(i, i + len);
    if (seen.has(s)) return s;
  }
  return null;
};

let lo = 0, hi = Math.min(a.length, b.length), best = '';
while (lo < hi) {
  const mid = Math.ceil((lo + hi) / 2);
  const hit = has(mid);
  if (hit !== null) { lo = mid; best = hit; } else hi = mid - 1;
}

console.log(`${x} vs ${y} — longest common substring: ${best.length} chars\n`);
console.log(JSON.stringify(best));
