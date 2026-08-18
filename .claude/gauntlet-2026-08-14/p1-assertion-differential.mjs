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
// fixture and the NEW one, scoped to that single test by name, and compares the
// first-failure assertion message from each arm.
//
// WHAT THIS ESTABLISHES, STATED NARROWLY (Sol R12): a SAME-MESSAGE result says
// the mutant's FIRST OBSERVABLE HARM is unchanged by the rewrite. It does NOT
// say the three mutants are discriminated from one another -- G48 and G54 break
// DIFFERENT mechanisms and converge on the SAME assertion (the duplicate message
// lives at test/design-gauntlet.test.mjs:1066 and :1327). Same first harm is the
// question P1 asked; mechanism discrimination is not, and is not claimed.
//
// SOL R12 P1 — THIS DRIVER USED TO FAIL OPEN, AND AN ARTIFACT THAT FAILS OPEN IS
// NOT AN INSTRUMENT. It read test/design-gauntlet.OLDFIXTURE.test.mjs without
// creating it; that file was deliberately deleted after the first run (untracked,
// inside npm test's test/**/*.test.mjs glob, would have been swept in by
// `git add -A`), so a re-run reported `OLD: tests=undefined … status=1`,
// `ONE ARM GREEN — inspect`, and EXIT 0. It also exited 0 when the CURRENT
// fixture merely SKIPPED because Chromium could not launch. Three repairs:
//   (1) the OLD fixture is materialised BY THIS SCRIPT from git and removed in a
//       finally, at a path OUTSIDE the *.test.mjs glob, so the measurement is
//       reproducible and cannot leak into the suite;
//   (2) both baselines are ASSERTED at exactly tests=1 pass=1 fail=0 status=0,
//       which is what closes the Chromium-skip hole -- a skip is pass=0;
//   (3) every non-measurement verdict exits NONZERO. A check whose failure mode
//       is indistinguishable from its success mode is not a check.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE = resolve(ROOT, 'dist/design-gauntlet.js');
const NEW = 'test/design-gauntlet.test.mjs';
// NOT `.test.mjs` -- npm test globs test/**/*.test.mjs and auto-save-on-turn.sh
// runs `git add -A`, so a fixture named with that suffix joins the suite and the
// index the moment it exists.
const OLD = 'test/design-gauntlet.OLDFIXTURE.mjs';
const OLD_ABS = resolve(ROOT, OLD);
const OLD_REV = 'a1a2384^:test/design-gauntlet.test.mjs';
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

function die(msg) { console.error(`ABORT: ${msg}`); process.exit(1); }

function num(out, label) {
  const m = out.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'm'));
  return m ? Number(m[1]) : null;
}

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
  // An unparsed message must NEVER compare equal to another unparsed message --
  // the first version of this driver reported "IDENTICAL MESSAGE" three times
  // because both arms failed to parse. A null is not a measurement.
  return { failed, status: res.status,
           tests: num(out, 'tests'), pass: num(out, 'pass'),
           fail: num(out, 'fail'), skipped: num(out, 'skipped'),
           line: site ? site[1] : null,
           message: m ? m[1].trim().slice(0, 220) : null };
}

const pristine = readFileSync(MODULE, 'utf8');
// KIMI R12 F2 — MESSAGE EQUALITY IS WEAKER THAN ASSERTION IDENTITY. The literal
// `the ambiguity is disclosed` occurs TWICE in the current fixture (:1066 and
// :1327), so two arms can carry the same message string and still be different
// assertion sites. The line NUMBER cannot be compared across the two fixtures --
// they differ in length above the test by construction (1319/1327 vs 1299/1307) --
// but the SOURCE TEXT at the failing line can, and it identifies the site exactly.
// Reported and compared alongside the message; a SAME verdict now requires both.
function lineText(file, line) {
  if (line === null) return null;
  try {
    const src = readFileSync(resolve(ROOT, file), 'utf8').split('\n');
    const t = src[line - 1];
    return t === undefined ? null : t.trim();
  } catch { return null; }
}

let nonMeasurements = 0;

try {
  // Materialise the pre-rewrite fixture. The test NAME is byte-identical in both,
  // which is what makes a name-scoped run possible at all.
  const show = spawnSync('git', ['show', OLD_REV], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (show.status !== 0 || !show.stdout) die(`could not materialise ${OLD_REV}: ${(show.stderr || '').trim()}`);
  if (!show.stdout.includes(PATTERN)) die(`${OLD_REV} does not contain the test name ${JSON.stringify(PATTERN)}`);
  writeFileSync(OLD_ABS, show.stdout);

  // BASELINE — both arms must be a real green single-test run. `pass === 1` is
  // the half that closes the skip hole: a Chromium that will not launch reports
  // tests=1 pass=0 skipped=1 status=0, which the old driver walked straight past.
  console.log('=== BASELINE (no mutant) — both fixtures must be GREEN on this test ===');
  for (const [label, f] of [['NEW', NEW], ['OLD', OLD]]) {
    const r = run(f);
    console.log(`  ${label}: tests=${r.tests} pass=${r.pass} fail=${r.fail} skipped=${r.skipped} status=${r.status}`);
    if (r.tests !== 1 || r.pass !== 1 || r.fail !== 0 || r.status !== 0) {
      die(`${label} baseline is not a green single-test run (need tests=1 pass=1 fail=0 status=0). ` +
          `Nothing below this line would be a measurement.`);
    }
  }

  for (const m of MUTANTS) {
    const first = pristine.indexOf(m.find);
    if (first === -1) die(`${m.id} find-string not present`);
    if (pristine.indexOf(m.find, first + 1) !== -1) die(`${m.id} find-string not unique`);
    writeFileSync(MODULE, pristine.replace(m.find, m.replace));
    let a, b;
    try {
      a = run(NEW); b = run(OLD);
    } finally {
      writeFileSync(MODULE, pristine);
      if (readFileSync(MODULE, 'utf8') !== pristine) die('restore failed');
    }
    console.log(`\n=== ${m.id} ===`);
    console.log(`  NEW fixture: red=${a.failed} tests=${a.tests} fail=${a.fail} status=${a.status} @${NEW}:${a.line} :: ${a.message}`);
    console.log(`  OLD fixture: red=${b.failed} tests=${b.tests} fail=${b.fail} status=${b.status} @${OLD}:${b.line} :: ${b.message}`);
    // A `✖` is not proof an assertion ran: node --test prints one for a FILE that
    // fails to load. The test COUNT is the discriminator a name list cannot give.
    const aText = lineText(NEW, a.line), bText = lineText(OLD, b.line);
    console.log(`  NEW source @${a.line}: ${aText}`);
    console.log(`  OLD source @${b.line}: ${bText}`);
    const verdict =
        (a.tests !== 1 || b.tests !== 1) ? 'TEST COUNT MOVED — the run did not execute the fixture, not a measurement'
      : (!a.failed || !b.failed)         ? 'ONE ARM GREEN — the mutant was not detected in both arms, not a measurement'
      : (a.message === null || b.message === null) ? 'UNPARSED — not a measurement, fix the driver'
      : (aText === null || bText === null) ? 'NO SOURCE LINE — not a measurement, fix the driver'
      : (a.message !== b.message)        ? 'DIFFERENT ASSERTION MESSAGE — inspect whether the new one is weaker'
      : (aText !== bText)                ? 'SAME MESSAGE, DIFFERENT ASSERTION SITE — this IS assertion-level masking'
      :                                    'SAME ASSERTION — same message AND same source line text';
    console.log(`  VERDICT: ${verdict}`);
    if (!verdict.startsWith('SAME ASSERTION —')) nonMeasurements++;
  }
} finally {
  rmSync(OLD_ABS, { force: true });
}

console.log(`\nsummary: ${MUTANTS.length} mutants compared, ${nonMeasurements} non-SAME verdict(s)`);
if (nonMeasurements > 0) process.exitCode = 1;
