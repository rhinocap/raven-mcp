// Measured mutant matrix for the Motion / cubic-bezier easing control.
//
// Fail-closed by construction, following the lessons already paid for by the
// voice suite's harness:
//   - every anchor must match EXACTLY ONCE, checked BEFORE the baseline runs;
//     a stale find-string exits nonzero instead of printing "not applied" and
//     letting the run reach exit 0
//   - the mutation is literal (a function replacer), and a mutation whose
//     CONSTRUCTED output equals the original dies in the preflight — a no-op
//     replace would run the pristine overlay and report a survivor about nothing
//   - the baseline must be green before any mutant runs
//   - a mutant copy that fails to LOAD is a syntax error, not a detection, so
//     every copy is parse-checked
//
// Two suites are graded per mutant, because several of these mutations are
// only visible to the pure-function tests and others only to the browser:
//   test/grab-bridge.test.mjs          (RAVEN_GRAB_TEST_OVERLAY)
//   test/grab-overlay-easing-control.test.mjs (RAVEN_GRAB_ASSET_PATH)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = path.resolve('browser/raven-grab.js');
const original = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'easing-mutants-'));

const MUTANTS = [
  ['E1  drop the easing branch from classifyStyleControl',
    'if (isTimingFunctionProperty(property)) return parseEasingValue(raw) ? "easing" : "text";',
    'if (false) return "text";'],
  ['E2  classifyStyleControl returns easing without consulting the parser',
    'if (isTimingFunctionProperty(property)) return parseEasingValue(raw) ? "easing" : "text";',
    'if (isTimingFunctionProperty(property)) return "easing";'],
  ['E3  parseEasingValue skips the x in [0,1] check',
    'if ((i === 0 || i === 2) && (n < 0 || n > 1)) return null;',
    'if (false) return null;'],
  ['E4  the drag clamps y into the unit square',
    'y = Math.min(1.5, Math.max(-0.5, y));',
    'y = Math.min(1, Math.max(0, y));'],
  ['E5  a keyword lookup hands out the shared EASING_KEYWORDS array',
    'if (keyword) return keyword.slice();',
    'if (keyword) return keyword;'],
  ['E6  timingFunctionCount splits on every comma',
    '    if (!text) return 0;\n    return text.split(/,(?![^(]*\\))/)',
    '    if (!text) return 0;\n    return text.split(/,/)'],
  ['E7  a preset writes the bezier expansion instead of the keyword',
    'input.value = keyword;',
    'input.value = formatCubicBezier(easingPoints);'],
  ['E8  the drag redraws the curve but never writes input.value',
    'input.value = formatCubicBezier(easingPoints);\n        pendingTokenPick = null;',
    'pendingTokenPick = null;'],
  ['E9  unitOptionsForProperty always returns the length list',
    'return isTimeProperty(property) ? TIME_UNIT_OPTIONS : STYLE_UNIT_OPTIONS;',
    'return STYLE_UNIT_OPTIONS;'],
  ['E11 formatBezierNumber rounds every coordinate to three decimals',
    'function formatBezierNumber(n) {\n    return String(n);',
    'function formatBezierNumber(n) {\n    return String(Math.round(n * 1000) / 1000);'],
  ['E12 a cancelled drag drops its listeners without restoring the curve',
    '            easingPoints = dragStartPoints.slice();\n            input.value = dragStartValue;\n            drawEasing();\n            if (dragStartPreviewed) previewed = previewValue(dragStartValue) || previewed;\n            else rollbackPreviewState();',
    '            void dragStartPoints;'],
  ['E13 a cancelled drag restores the row original instead of this drag start',
    '            easingPoints = dragStartPoints.slice();\n            input.value = dragStartValue;',
    '            easingPoints = parseEasingValue(previousValue) || dragStartPoints.slice();\n            input.value = previousValue;'],
  ['E14 the easing handles ignore the row token lock',
    '          if (editor.getAttribute("data-token-linked") === "true") return;\n          event.preventDefault();',
    '          event.preventDefault();'],
  ['E15 the easing presets are left out of the style-value control list',
    '      || cls.indexOf("raven-grab-easing-preset") !== -1;',
    '      || false;'],
  ['E10 the motion category carries no properties',
    'properties: ["transition-property", "transition-duration", "transition-timing-function", "transition-delay"]',
    'properties: []']
];

function applyMutation(source, find, replace) {
  const at = source.indexOf(find);
  if (at === -1) return null;
  if (source.indexOf(find, at + 1) !== -1) return null;
  return source.slice(0, at) + replace + source.slice(at + find.length);
}

// ---- preflight: fail closed before anything runs -------------------------
let bad = 0;
for (const [name, find, replace] of MUTANTS) {
  const mutated = applyMutation(original, find, replace);
  if (mutated === null) { console.error(`ANCHOR MISS or NOT UNIQUE: ${name}`); bad += 1; continue; }
  if (mutated === original) { console.error(`NO-OP MUTATION: ${name}`); bad += 1; }
}
if (bad) { console.error(`preflight failed (${bad})`); process.exit(1); }
console.log(`preflight ok: ${MUTANTS.length} anchors unique, all mutations change the file`);

const SUITES = [
  ['parser', 'test/grab-bridge.test.mjs', 'RAVEN_GRAB_TEST_OVERLAY'],
  ['widget', 'test/grab-overlay-easing-control.test.mjs', 'RAVEN_GRAB_ASSET_PATH']
];

function run(suite, envName, overlayPath) {
  const env = { ...process.env, RAVEN_NO_USAGE_LOG: '1' };
  if (overlayPath) env[envName] = overlayPath;
  const out = spawnSync('node', ['--test', suite], { encoding: 'utf8', env, timeout: 600000 });
  const text = (out.stdout || '') + (out.stderr || '');
  const pass = Number((text.match(/^ℹ pass (\d+)$/m) || [])[1] ?? NaN);
  const fail = Number((text.match(/^ℹ fail (\d+)$/m) || [])[1] ?? NaN);
  const cancelled = Number((text.match(/^ℹ cancelled (\d+)$/m) || [])[1] ?? NaN);
  const names = [...new Set([...text.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]))];
  if (!Number.isFinite(pass) || !Number.isFinite(fail) || !Number.isFinite(cancelled)) {
    console.error(`NO SUMMARY from ${suite} — a crash or timeout must never grade as zero red`);
    console.error(text.slice(-2000));
    process.exit(1);
  }
  if (cancelled !== 0) { console.error(`CANCELLED tests in ${suite}`); process.exit(1); }
  if (names.length !== fail) {
    console.error(`fail count ${fail} disagrees with ${names.length} distinct names in ${suite}`);
    process.exit(1);
  }
  return { pass, fail, names };
}

// ---- baseline ------------------------------------------------------------
for (const [label, suite, envName] of SUITES) {
  const result = run(suite, envName, null);
  if (result.fail !== 0) {
    console.error(`baseline ${label} is NOT green (${result.fail} red) — a mutant result would be meaningless`);
    console.error(result.names.join('\n'));
    process.exit(1);
  }
  console.log(`baseline ${label}: ${result.pass} pass / 0 fail`);
}

// ---- matrix --------------------------------------------------------------
let survivors = 0;
for (const [name, find, replace] of MUTANTS) {
  const mutated = applyMutation(original, find, replace);
  const copy = path.join(dir, name.split(' ')[0] + '.js');
  writeFileSync(copy, mutated, 'utf8');

  // A copy that cannot parse fails every test for the wrong reason.
  const parse = spawnSync('node', ['--check', copy], { encoding: 'utf8' });
  if (parse.status !== 0) {
    console.error(`SYNTAX ERROR in mutant ${name}\n${parse.stderr}`);
    process.exit(1);
  }

  const red = [];
  for (const [label, suite, envName] of SUITES) {
    const result = run(suite, envName, copy);
    for (const testName of result.names) red.push(`${label}: ${testName}`);
  }
  if (red.length === 0) survivors += 1;
  console.log(`\n${name}\n  radius ${red.length}${red.length === 0 ? '  *** SURVIVED ***' : ''}`);
  for (const entry of red) console.log(`    ${entry}`);
}

console.log(`\nmatrix: ${MUTANTS.length} mutants, ${MUTANTS.length - survivors} killed, ${survivors} survived`);
process.exit(survivors === 0 ? 0 : 2);
