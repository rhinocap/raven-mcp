// Measured mutation matrix for the spring -> linear() generator.
//
// Every mutation is applied to a COPY of browser/raven-grab.js and served to
// both suites at once: `RAVEN_GRAB_ASSET_PATH` is what the bridge serves to the
// browser, `RAVEN_GRAB_TEST_OVERLAY` is what grab-bridge.test.mjs's internals
// loader reads. A mutant that only reached one of them would report a radius
// measured against half the guards.
//
// Rules this harness enforces, each of which this repo has paid for once:
//   - a clean baseline runs FIRST and must be green, or nothing below is a
//     measurement;
//   - every mutant is `node --check`ed before its run, because a mutant that
//     fails to load fails every test for the wrong reason;
//   - every find-string must be present and UNIQUE, so a mutant whose target
//     line was edited ABORTS rather than silently measuring nothing;
//   - the exit status and the summary line must AGREE — `node --test` can print
//     `fail 0` and still exit non-zero;
//   - a non-zero skip count is a failed measurement, not a result;
//   - CONTROLS (expect: 'green') are in the matrix because a red-only matrix is
//     structurally blind to a mutation that reports a defect in correct code.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = 'browser/raven-grab.js';
const SUITES = ['test/grab-overlay-spring-control.test.mjs', 'test/grab-bridge.test.mjs'];
const source = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'spring-mutants-'));

// [id, description, find, replace, expect]
const MUTANTS = [
  ['S1', 'the spring block keys on the CONTROL, not the property',
    '    if (isTimingFunctionProperty(property)) {\n      var springs = document.createElement("div");',
    '    if (control === "easing") {\n      var springs = document.createElement("div");', 'red'],
  ['S2', 'the spring block renders for every property',
    '    if (isTimingFunctionProperty(property)) {\n      var springs = document.createElement("div");',
    '    if (true) {\n      var springs = document.createElement("div");', 'red'],
  ['S3', 'a preset writes its label instead of the generated curve',
    '          input.value = value;\n          pendingTokenPick = null;',
    '          input.value = preset[0];\n          pendingTokenPick = null;', 'red'],
  ['S4', 'every preset writes the same curve',
    '        var curve = springCurve(preset[1], preset[2], preset[3]);',
    '        var curve = springCurve(SPRING_PRESETS[0][1], SPRING_PRESETS[0][2], SPRING_PRESETS[0][3]);', 'red'],
  ['S5', 'the presets are left out of styleValueControlsInEditor',
    '      || cls.indexOf("raven-grab-spring-preset") !== -1;',
    '      || false;', 'red'],
  ['S6', 'formatSpringLinear emits bare values with no percentage stops',
    '      return String(value) + " " + Math.round(point[0] * 1000) / 10 + "%";',
    '      return String(value);', 'red'],
  ['S7', 'the curve is not pinned to end at exactly 1',
    '    samples[steps][1] = 1;',
    '    samples[steps][1] = samples[steps][1];', 'red'],
  ['S8', 'settle is the FIRST moment inside the epsilon band, not the last',
    '      if (Math.abs(springPosition(probe / 1000, omega0, zeta) - 1) >= SPRING_SETTLE_EPSILON) settleMs = probe;',
    '      if (!settleMs && Math.abs(springPosition(probe / 1000, omega0, zeta) - 1) < SPRING_SETTLE_EPSILON) settleMs = probe;', 'red'],
  ['S9', 'simplification is skipped — every sample is emitted',
    '    return { points: simplifySpringSamples(samples, 0.002), settleMs: settleMs, zeta: zeta };',
    '    return { points: samples, settleMs: settleMs, zeta: zeta };', 'red'],
  ['S10', 'the simplification tolerance is loose enough to flatten the curve',
    '    return { points: simplifySpringSamples(samples, 0.002), settleMs: settleMs, zeta: zeta };',
    '    return { points: simplifySpringSamples(samples, 0.05), settleMs: settleMs, zeta: zeta };', 'red'],
  // CONTROLS. Both change the shipped bytes and neither changes any behaviour
  // under test, so a matrix reporting either as red is over-reporting.
  ['C1', 'CONTROL: the section hint reads "springs" instead of "spring"',
    '      springHint.textContent = "spring";',
    '      springHint.textContent = "springs";', 'green'],
  ['C2', 'CONTROL: the settle search cap drops to 9s (every preset settles in <1s)',
    '  var SPRING_MAX_MS = 10000;',
    '  var SPRING_MAX_MS = 9000;', 'green']
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
    env: {
      ...process.env,
      RAVEN_GRAB_ASSET_PATH: assetPath,
      RAVEN_GRAB_TEST_OVERLAY: assetPath,
      RAVEN_NO_USAGE_LOG: '1'
    }
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
  if ((out.status === 0) !== (fail === 0)) {
    throw new Error(`${suite}: exit status ${out.status} disagrees with fail ${fail}`);
  }
  if (skipped !== 0 && suite.includes('spring-control')) {
    throw new Error(`${suite}: skipped=${skipped} — the probe gate fired, nothing was measured`);
  }
  return { pass, fail };
}

const results = [];
try {
  const baseline = SUITES.map((s) => runSuite(s, path.resolve(OVERLAY)));
  console.log(`baseline: ${baseline.map((b, i) => `${path.basename(SUITES[i])} ${b.pass}p/${b.fail}f`).join('  ')}`);
  if (baseline.some((b) => b.fail !== 0)) throw new Error('baseline not green — nothing below is measurable');

  for (const [id, description, find, replace, expect] of MUTANTS) {
    const asset = path.join(dir, `${id}.js`);
    writeFileSync(asset, apply(id, find, replace), 'utf8');
    const check = spawnSync('node', ['--check', asset], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`${id}: syntax error\n${check.stderr}`);
    const runs = SUITES.map((s) => runSuite(s, asset));
    const radius = runs.reduce((total, r) => total + r.fail, 0);
    const verdict = expect === 'green'
      ? (radius === 0 ? 'OK (green, as expected)' : `FALSE FAIL — ${radius} red`)
      : (radius > 0 ? `killed (radius ${radius}: ${runs.map((r, i) => `${path.basename(SUITES[i]).replace('.test.mjs', '')} ${r.fail}`).join(', ')})` : 'SURVIVED');
    results.push({ id, verdict });
    console.log(`${id}  ${description}\n     ${verdict}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const killed = results.filter((r) => r.verdict.startsWith('killed')).length;
const survived = results.filter((r) => r.verdict === 'SURVIVED').length;
const falseFails = results.filter((r) => r.verdict.startsWith('FALSE FAIL')).length;
const controls = MUTANTS.filter((m) => m[4] === 'green').length;
console.log(`\n${MUTANTS.length - controls} mutants, ${killed} killed, ${survived} survived; ${controls} controls, ${falseFails} false-failed`);
if (survived || falseFails) process.exitCode = 1;
