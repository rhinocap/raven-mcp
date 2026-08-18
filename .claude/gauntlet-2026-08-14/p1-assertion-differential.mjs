// SOL R11 P1 — ASSERTION-LEVEL differential, not a test-name differential.
//
// The v15→v16 red-set diff compares deduplicated failing TEST NAMES. The
// UNKNOWN-conditional-group fixture was REWRITTEN in a1a2384 (4 assertions -> 5,
// and its border moved from inline to the stylesheet), so a mutant could fail
// an OLD assertion in v15 and a DIFFERENT, weaker assertion in v16 while the
// recorded red set stayed byte-identical. `assert` aborts at the first failure,
// so a test reports one message however many ways it would have broken.
//
// Exactly three mutants carry that test in BOTH runs -- G42, G48, G54. (G45 LOST
// it, G59/G64/G69 GAINED it; a gained or lost member is visible to the set diff
// and is not the blind spot.) This runs each of the three against the OLD
// fixture and the NEW one, scoped to that single test by name, and prints the
// first-failure assertion message from each arm.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE = resolve(ROOT, 'dist/design-gauntlet.js');
const NEW = 'test/design-gauntlet.test.mjs';
const OLD = 'test/design-gauntlet.OLDFIXTURE.test.mjs';
const PATTERN = 'UNKNOWN conditional group';

const MUTANTS = [
  { id: 'G42-unresolved-width-dropped',
    find: '                    else if (n === "unresolved" || (unevaluable && typeof n === "number"))\n                        unresolvedRules.push({ selector: ownSelector, side, important });\n',
    replace: '' },
  { id: 'G48-ambiguity-not-counted',
    find: '                    else if (authored === "unresolved" || sheetsBlocked > 0)\n                        subPixelAmbiguous++;',
    replace: '                    else if (false)\n                        subPixelAmbiguous++;' },
  { id: 'G54-hairline-caveat-undisclosed',
    find: '        if (hairlines.subPixelAmbiguous > 0 || hairlines.sheetsBlocked > 0 || hairlines.ruleOverflow) {',
    replace: '        if (false) {' },
];

function run(file) {
  const res = spawnSync('node', ['--test', '--test-name-pattern', PATTERN, file], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' }
  });
  const out = (res.stdout || '') + (res.stderr || '');
  const failed = /^✖ /m.test(out);
  // node --test prints `AssertionError [ERR_ASSERTION]: <message>` in the
  // failing-tests block, followed by the fixture line that threw. Take the
  // FIRST -- `assert` aborts there, which is the whole reason a test name
  // under-specifies WHICH harm was detected.
  const m = out.match(/AssertionError \[ERR_ASSERTION\]: (.*)/);
  const site = out.match(/at TestContext\.<anonymous> \(file:[^)]*?:(\d+):\d+\)/);
  const tests = (out.match(/^ℹ tests (\d+)$/m) || [])[1];
  const pass = (out.match(/^ℹ pass (\d+)$/m) || [])[1];
  const fail = (out.match(/^ℹ fail (\d+)$/m) || [])[1];
  // An unparsed message must NEVER compare equal to another unparsed message --
  // the first version of this driver reported "IDENTICAL MESSAGE" three times
  // because both arms failed to parse. A null is not a measurement.
  return { failed, status: res.status, tests, pass, fail,
           line: site ? site[1] : null,
           message: m ? m[1].trim().slice(0, 220) : null };
}

const pristine = readFileSync(MODULE, 'utf8');
console.log('=== BASELINE (no mutant) — both fixtures must be GREEN on this test ===');
for (const [label, f] of [['NEW', NEW], ['OLD', OLD]]) {
  const r = run(f);
  console.log(`  ${label}: tests=${r.tests} pass=${r.pass} fail=${r.fail} status=${r.status}`);
}

for (const m of MUTANTS) {
  const first = pristine.indexOf(m.find);
  if (first === -1) { console.error(`ABORT: ${m.id} find-string not present`); process.exit(1); }
  if (pristine.indexOf(m.find, first + 1) !== -1) { console.error(`ABORT: ${m.id} find-string not unique`); process.exit(1); }
  writeFileSync(MODULE, pristine.replace(m.find, m.replace));
  const a = run(NEW), b = run(OLD);
  writeFileSync(MODULE, pristine);
  if (readFileSync(MODULE, 'utf8') !== pristine) { console.error('ABORT: restore failed'); process.exit(1); }
  console.log(`\n=== ${m.id} ===`);
  console.log(`  NEW fixture: red=${a.failed} fail=${a.fail} @${NEW}:${a.line} :: ${a.message}`);
  console.log(`  OLD fixture: red=${b.failed} fail=${b.fail} @${OLD}:${b.line} :: ${b.message}`);
  const verdict = (!a.failed || !b.failed) ? 'ONE ARM GREEN — inspect'
    : (a.message === null || b.message === null) ? 'UNPARSED — not a measurement, fix the driver'
    : (a.message === b.message) ? 'SAME ASSERTION MESSAGE — no assertion-level masking'
    : 'DIFFERENT ASSERTION — inspect whether the new one is weaker';
  console.log(`  VERDICT: ${verdict}`);
}
