// Proves each of the four §6 branches can fire, and that the ORDER is what round 4 got
// wrong. Synthetic scores only — run before any real build result exists.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));

const CASES = [
  { name: 'PASS',                 A: [14, 15, 14, 15, 16, 14], B2: [7, 8, 6, 9, 7, 8],      want: /^PASS/ },
  { name: 'DELETE (equivalence)', A: [10, 10, 10, 10, 10, 10], B2: [10, 10, 10, 10, 10, 10], want: /^DELETE \(equivalence\)/ },
  { name: 'DELETE (inferior)',    A: [5, 6, 5, 6, 5, 6],       B2: [13, 14, 13, 14, 13, 14], want: /^DELETE \(inferior\)/ },
  { name: 'INCONCLUSIVE',         A: [12, 4, 14, 3, 13, 5],    B2: [5, 13, 4, 12, 6, 11],    want: /^INCONCLUSIVE/ },
  // The case round 4's ordering resolved in the tool's favour: detectably better, and
  // negligibly better. Under §6 this is a delete, and this row is the proof it is.
  { name: 'both-true → equivalence wins', A: [10, 10, 11, 10, 10, 11], B2: [9, 9, 9, 9, 9, 9], want: /^DELETE \(equivalence\)/ },
];

let bad = 0;
for (const c of CASES) {
  const assignment = {}, results = [];
  const push = (arm, vals) => vals.forEach((v, i) => {
    const id = `${arm}${i}`;
    assignment[id] = arm;
    results.push({ build: id, primary: v, control: 8, checks: {} });
  });
  push('A', c.A); push('B1', c.A); push('B2', c.B2);
  writeFileSync('/tmp/r5-val-scores.json', JSON.stringify({ discriminating: [], controls: [], results }));
  writeFileSync('/tmp/r5-val-assign.json', JSON.stringify(assignment));
  const out = execFileSync(process.execPath,
    [join(HERE, 'analyze5.mjs'), '/tmp/r5-val-scores.json', '/tmp/r5-val-assign.json'], { encoding: 'utf8' });
  const line = (out.match(/VERDICT: (.*)/) ?? [])[1] ?? '(none)';
  const ok = c.want.test(line);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(32)} → ${line}`);
}
console.log(bad === 0
  ? '\nall four branches reachable, and the ambiguous case resolves as a delete.'
  : `\n${bad} branch(es) wrong`);
process.exit(bad ? 1 : 0);
