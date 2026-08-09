// Measured mutation matrix for the three-tier numeric precision rule.
//
// Same harness contract as spring-mutants.mjs, and for the same reasons: clean
// green baseline first, `node --check` every mutant, find-strings present AND
// unique, exit status must agree with the summary.
//
// The question this matrix is built to ANSWER, not to confirm: the unit test
// grades the shared helper and the shared formatter, so does anything at all
// catch a CALL SITE that reads the multiplier and drops the precision floor?
// That is the inert-control defect, and it is exactly the shape the spring
// round shipped once (a guard reading the generator's intermediate rather than
// the string the browser consumes). P5/P6/P7 are the three call sites.
//
// v2 answered it: NOTHING did. All three survived, on a feature shipped the same
// session, and the overlay comment above scrubPrecisionMode asserted the
// opposite — a claim that decays exactly like a test does, except nothing
// executes it. v3 adds test/grab-overlay-precision-tiers.test.mjs, which drives
// the three controls in a real browser, and re-measures the whole matrix rather
// than carrying v2's radii forward.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = 'browser/raven-grab.js';
const SUITES = ['test/grab-bridge.test.mjs', 'test/grab-overlay-precision-tiers.test.mjs'];
const source = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'precision-mutants-'));

// [id, description, find, replace, expect]
const MUTANTS = [
  ['P1', 'the fine tier offers its multiplier with no precision floor',
    '    if (event && event.altKey) return { multiplier: 0.1, minPrecision: 1 };',
    '    if (event && event.altKey) return { multiplier: 0.1, minPrecision: 0 };', 'red'],
  ['P2', 'the fine tier steps by a whole unit',
    '    if (event && event.altKey) return { multiplier: 0.1, minPrecision: 1 };',
    '    if (event && event.altKey) return { multiplier: 1, minPrecision: 1 };', 'red'],
  ['P3', 'alt is tested before shift, so a two-key hold yields fine instead of coarse',
    '    if (event && event.shiftKey) return { multiplier: 10, minPrecision: 0 };\n    if (event && event.altKey) return { multiplier: 0.1, minPrecision: 1 };',
    '    if (event && event.altKey) return { multiplier: 0.1, minPrecision: 1 };\n    if (event && event.shiftKey) return { multiplier: 10, minPrecision: 0 };', 'red'],
  ['P4', 'the shared formatter ignores the floor it is handed',
    '    var digits = Math.max(parsed.precision || 0, minPrecision || 0);',
    '    var digits = parsed.precision || 0;', 'red'],
  // The three call sites. Each reads the multiplier and drops the floor — the
  // control still MOVES the number and then rounds it away, so the user sees a
  // dead key, not an error.
  ['P5', 'CALL SITE (pointer scrub): the floor is dropped from the emitted precision',
    '      var digits = Math.max(precision, mode.minPrecision);',
    '      var digits = precision;', 'red'],
  ['P6', 'CALL SITE (style-editor arrow step): the floor is not passed',
    '        var stepped = steppedNumericValue(input.value, delta, input.unitSelect ? input.unitSelect.value : "", mode.minPrecision);',
    '        var stepped = steppedNumericValue(input.value, delta, input.unitSelect ? input.unitSelect.value : "");', 'red'],
  ['P7', 'CALL SITE (size-control arrow step): the floor is not passed',
    '          unitSelect.value || "px",\n          mode.minPrecision\n        );',
    '          unitSelect.value || "px"\n        );', 'red'],
  // CONTROL. Renaming a local binding changes the shipped bytes and cannot
  // change any behaviour, so a matrix reporting it red is over-reporting.
  //
  // v1 of this control was NOT behaviour-neutral and therefore was not a
  // control: it renamed `mode` on two lines and left the third line's
  // `mode.minPrecision` referring to a binding that no longer existed, which is
  // a real break dressed as a rename. A control has to be verified neutral, not
  // assumed neutral — the whole point of it is to detect over-reporting, and a
  // broken one reports a false fail every run. All THREE references move here.
  ['C1', 'CONTROL: the scrub renames its local mode binding',
    '      var mode = scrubPrecisionMode(moveEvent);\n      var delta = (moveEvent.clientX - startX) * mode.multiplier;\n      var nextNumber = Number(parsed.number) + delta;\n      // Math.max, not `mode.minPrecision ||` — a value that already carries two\n      // decimals must not LOSE one to the fine tier\'s floor of 1.\n      var digits = Math.max(precision, mode.minPrecision);',
    '      var tier = scrubPrecisionMode(moveEvent);\n      var delta = (moveEvent.clientX - startX) * tier.multiplier;\n      var nextNumber = Number(parsed.number) + delta;\n      // Math.max, not `tier.minPrecision ||` — a value that already carries two\n      // decimals must not LOSE one to the fine tier\'s floor of 1.\n      var digits = Math.max(precision, tier.minPrecision);', 'green']
];

function apply(id, find, replace) {
  const at = source.indexOf(find);
  if (at === -1) throw new Error(`${id}: find-string absent — the target line was edited, re-anchor it`);
  if (source.indexOf(find, at + 1) !== -1) throw new Error(`${id}: find-string not unique`);
  return source.slice(0, at) + replace + source.slice(at + find.length);
}

function runSuite(suite, assetPath) {
  const out = spawnSync('node', ['--test', suite], {
    encoding: 'utf8',
    env: { ...process.env, RAVEN_GRAB_ASSET_PATH: assetPath, RAVEN_GRAB_TEST_OVERLAY: assetPath, RAVEN_NO_USAGE_LOG: '1' }
  });
  if (out.error) throw new Error(`spawn error: ${out.error.message}`);
  if (out.signal) throw new Error(`killed by ${out.signal} — never grade a killed run`);
  const text = (out.stdout || '') + (out.stderr || '');
  const num = (re) => Number((text.match(re) || [])[1] ?? NaN);
  const pass = num(/^ℹ pass (\d+)$/m);
  const fail = num(/^ℹ fail (\d+)$/m);
  const skipped = num(/^ℹ skipped (\d+)$/m);
  if (![pass, fail, skipped].every(Number.isFinite)) {
    console.error(text.slice(-1200));
    throw new Error(`${suite}: no summary — never grade a crash as a result`);
  }
  if ((out.status === 0) !== (fail === 0)) throw new Error(`${suite}: exit ${out.status} disagrees with fail ${fail}`);
  // Failing test NAMES, deduped (node --test prints each ✖ twice — once in the
  // tree and again in the trailing summary). v1 reported counts only, which
  // made every verdict unattributable: with fail === 1 under every mutant there
  // was no way to tell the mirror-identity test from the precision test, and a
  // check whose failure mode is indistinguishable from its success mode is not
  // a check.
  // Anchored on the DURATION suffix node --test always emits, not on the first
  // "(" — v3's first run used a lazy `(.+?) \(` and every call-site test name
  // (which contains a parenthetical) truncated to the same string "CALL SITE",
  // leaving three radius-1 kills mutually indistinguishable. That is the same
  // unattributable-verdict defect this harness was repaired for one version
  // earlier, reintroduced by the test names rather than by the harness.
  const names = [...new Set([...text.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  return { pass, fail, skipped, names };
}

// v3: the call-site suite needs a real browser, so a run that SKIPS measures
// nothing — grading one would report all three call-site mutants as survivors
// on a machine where chromium is unavailable, which is indistinguishable from
// the (real) verdict v2 produced. Demanding zero is the wrong shape, because
// grab-bridge.test.mjs carries two legitimate skips: the number is pinned
// against the baseline instead, so what fails is a skip count that MOVED.
function assertSkipsUnmoved(suite, baseline, run) {
  if (run.skipped !== baseline.skipped) {
    throw new Error(`${suite}: skipped ${run.skipped}, baseline ${baseline.skipped} — a mutant must not change what RAN`);
  }
}

// v4, and this is the hole v3's guard left WIDE OPEN — found by an adverse pass
// reproducing it, not by any check here. Pinning mutant skips to the BASELINE
// says nothing when the baseline itself skipped: under a denied loopback
// (`listen EPERM`, which this suite's probe correctly reports as a skip) the
// precision suite comes back 0 pass / 0 fail / 3 skipped, every mutant matches
// it exactly, and P5/P6/P7 print SURVIVED on a machine where nothing ran. That
// is byte-identical to the real v2 verdict. A relative guard cannot detect a
// baseline that measures nothing, so the expected count is DECLARED per suite
// and the baseline is graded against it.
//
// The numbers are measured, not assumed: grab-bridge.test.mjs carries the two
// removed-capability phase2 skips this repo's ledger has always recorded, and
// the precision suite has none (its probe either passes or the whole suite is
// unmeasurable). Either number moving is a real signal in both directions.
const EXPECTED_BASELINE_SKIPS = {
  'test/grab-bridge.test.mjs': 2,
  'test/grab-overlay-precision-tiers.test.mjs': 0
};

function assertBaselineMeasured(suite, baseline) {
  const expected = EXPECTED_BASELINE_SKIPS[suite];
  if (expected === undefined) throw new Error(`${suite}: no declared baseline skip count — add one before grading it`);
  if (baseline.skipped !== expected) {
    throw new Error(`${suite}: baseline skipped ${baseline.skipped}, expected ${expected} — the baseline measured less than it must, so every mutant below would be graded against a suite that did not run`);
  }
  if (baseline.pass === 0) throw new Error(`${suite}: baseline ran 0 passing tests — nothing here is measurable`);
}

const results = [];
try {
  // No radius correction for the mirror-identity test, deliberately, and the
  // reason is worth stating because the opposite was assumed first: a mutant is
  // written to a TEMP FILE and served through RAVEN_GRAB_ASSET_PATH, so the
  // tracked browser/ and web/public/ copies are never touched and that test
  // passes under every mutant. Subtracting a constant 1 here would have turned
  // every genuine radius-1 kill into a reported SURVIVED.
  const baseline = SUITES.map((s) => runSuite(s, path.resolve(OVERLAY)));
  console.log(`baseline: ${baseline.map((b, i) => `${path.basename(SUITES[i])} ${b.pass}p/${b.fail}f/${b.skipped}s`).join('  ')}`);
  if (baseline.some((b) => b.fail !== 0)) throw new Error('baseline not green — nothing below is measurable');
  SUITES.forEach((s, i) => assertBaselineMeasured(s, baseline[i]));

  for (const [id, description, find, replace, expect] of MUTANTS) {
    const asset = path.join(dir, `${id}.js`);
    writeFileSync(asset, apply(id, find, replace), 'utf8');
    const check = spawnSync('node', ['--check', asset], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`${id}: syntax error\n${check.stderr}`);
    const runs = SUITES.map((s, i) => {
      const run = runSuite(s, asset);
      assertSkipsUnmoved(s, baseline[i], run);
      return run;
    });
    // No correction is subtracted, and this time the code matches the comment.
    // v1 said in prose that no correction was applied while the line still read
    // `- 1`, so every genuine radius-1 kill was reported as SURVIVED — the
    // comment was edited and the code was not, which is how a matrix comes back
    // 7/7 survived on a feature that works.
    const radius = runs.reduce((total, r) => total + r.fail, 0);
    const redNames = [...new Set(runs.flatMap((r) => r.names))];
    const verdict = expect === 'green'
      ? (radius === 0 ? 'OK (green, as expected)' : `FALSE FAIL — ${radius} red`)
      : (radius > 0 ? `killed (radius ${radius})` : 'SURVIVED');
    results.push({ id, verdict });
    console.log(`${id}  ${description}\n     ${verdict}${redNames.length ? '\n     red: ' + redNames.join(' | ') : ''}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const killed = results.filter((r) => r.verdict.startsWith('killed')).length;
const survived = results.filter((r) => r.verdict === 'SURVIVED').length;
const falseFails = results.filter((r) => r.verdict.startsWith('FALSE FAIL')).length;
const controls = MUTANTS.filter((m) => m[4] === 'green').length;
console.log(`\n${MUTANTS.length - controls} mutants, ${killed} killed, ${survived} survived; ${controls} controls, ${falseFails} false-failed`);

// v4: the VERDICT has to reach the exit status. v3 printed survivors and false
// fails and then exited 0 regardless, so `EXIT=0` in a recorded transcript
// proved only that the script reached its last line — a reader (or a future
// wrapper) taking that as "the matrix passed" would be reading a number that
// carries no information about the result. This harness's own rule, applied to
// itself: a check whose failure mode is indistinguishable from its success mode
// is not a check. The throwing guards above already exit non-zero; this covers
// the case where every mutant ran cleanly and the ANSWER was bad.
if (survived > 0 || falseFails > 0) {
  console.error(`\nFAIL: ${survived} unexpected survivor(s), ${falseFails} false fail(s)`);
  process.exitCode = 1;
}
