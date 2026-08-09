// Measured mutation matrix for the detached-draft rescue (Andrew's deck bug).
//
// Harness contract, same as the spring and alignment rounds: clean green
// baseline FIRST, `node --check` every mutant, find-strings present AND unique,
// exit status must agree with the summary — and, fixing the defect that made
// the precision matrix unreadable, report the failing TEST NAMES, not just a
// count. A radius with no names cannot attribute a failure, and this codebase's
// own rule is that a check whose failure mode is indistinguishable from its
// success mode is not a check.
//
// No radius correction is applied and none is needed: mutants are written to a
// temp file and served through RAVEN_GRAB_ASSET_PATH, so the tracked
// browser/ and web/public/ copies are untouched and the mirror-identity test in
// grab-bridge.test.mjs is not in this suite anyway.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = 'browser/raven-grab.js';
const SUITE = 'test/grab-overlay-detached-draft.test.mjs';
const source = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'detached-mutants-'));

// [id, description, find, replace, expect]
const MUTANTS = [
  // EXPECTED SURVIVOR, stated rather than discovered. The `!draft.target` arm is
  // pre-existing defensive code — a draft is built as
  // `target: styleEditTarget || selectedElement` (browser/raven-grab.js:3963),
  // so reaching it needs a draft created with nothing selected, and no input
  // that does was found. The carry belongs there for symmetry (if it IS ever
  // reached, dropping the work is the same defect), but no test kills it and
  // this matrix does not pretend otherwise.
  ['D1', 'the sweep drops a draft whose target is gone entirely, without carrying it',
    '      if (!draft.target) { carryDetachedDraft(draft); dropStyleDraft(draft, true); return; }',
    '      if (!draft.target) { dropStyleDraft(draft, true); return; }', 'survive'],
  ['D2', 'the sweep drops a DETACHED draft without carrying it — the shipped defect',
    '        carryDetachedDraft(draft);\n        dropStyleDraft(draft, true);',
    '        dropStyleDraft(draft, true);', 'red'],
  ['D3', 'no snapshot is memoized while the node is still connected',
    '        lastConnectedPending[draft.clientKey] = entry;',
    '        void entry;', 'red'],
  ['D4', 'the rescue promotes nothing because the memo is cleared before it reads it',
    '      if (draft.target.isConnected === false && !draftAwaitingReconnect(draft)) {\n        carryDetachedDraft(draft);\n        dropStyleDraft(draft, true);',
    '      if (draft.target.isConnected === false && !draftAwaitingReconnect(draft)) {\n        dropStyleDraft(draft, true);\n        carryDetachedDraft(draft);', 'red'],
  ['D5', 'the instruction blur does not flush, so the 250ms debounce owns the snapshot',
    '      persistPendingNow();\n    }\n    var preset = panelPresetTrigger(event.target);',
    '    }\n    var preset = panelPresetTrigger(event.target);', 'red'],
  // CONTROL. Renaming a local binding changes the shipped bytes and cannot
  // change any behaviour. A matrix with no control is structurally blind to a
  // false fail — the failure mode that produced two wrong P1s in the alignment
  // round.
  ['C1', 'CONTROL: the sweep renames its local draft binding',
    '  function sweepStaleStyleDrafts() {\n    localStyleDrafts().forEach(function (draft) {\n      if (!draft.target) { carryDetachedDraft(draft); dropStyleDraft(draft, true); return; }\n      if (draft.target.isConnected === false && !draftAwaitingReconnect(draft)) {\n        carryDetachedDraft(draft);\n        dropStyleDraft(draft, true);\n      }\n    });\n  }',
    '  function sweepStaleStyleDrafts() {\n    localStyleDrafts().forEach(function (pending) {\n      if (!pending.target) { carryDetachedDraft(pending); dropStyleDraft(pending, true); return; }\n      if (pending.target.isConnected === false && !draftAwaitingReconnect(pending)) {\n        carryDetachedDraft(pending);\n        dropStyleDraft(pending, true);\n      }\n    });\n  }', 'green']
];

function apply(id, find, replace) {
  const at = source.indexOf(find);
  if (at === -1) throw new Error(`${id}: find-string absent — the target line was edited, re-anchor it`);
  if (source.indexOf(find, at + 1) !== -1) throw new Error(`${id}: find-string not unique`);
  return source.slice(0, at) + replace + source.slice(at + find.length);
}

function runSuite(assetPath) {
  const out = spawnSync('node', ['--test', SUITE], {
    encoding: 'utf8',
    env: { ...process.env, RAVEN_GRAB_ASSET_PATH: assetPath, RAVEN_NO_USAGE_LOG: '1' }
  });
  if (out.error) throw new Error(`spawn error: ${out.error.message}`);
  if (out.signal) throw new Error(`killed by ${out.signal} — never grade a killed run`);
  const text = (out.stdout || '') + (out.stderr || '');
  const num = (re) => Number((text.match(re) || [])[1] ?? NaN);
  const pass = num(/^ℹ pass (\d+)$/m);
  const fail = num(/^ℹ fail (\d+)$/m);
  const skipped = num(/^ℹ skipped (\d+)$/m);
  if (![pass, fail, skipped].every(Number.isFinite)) {
    console.error(text.slice(-1500));
    throw new Error('no summary — never grade a crash as a result');
  }
  if ((out.status === 0) !== (fail === 0)) throw new Error(`exit ${out.status} disagrees with fail ${fail}`);
  // A skipped run measures nothing; grading it would report every mutant as a
  // survivor on a machine where the browser is simply unavailable.
  if (skipped !== 0) throw new Error(`${skipped} skipped — the browser probe did not pass, nothing here is measurable`);
  // Names, not just a count: without them a radius cannot say WHICH guard fired.
  // Deduped, because node --test prints each ✖ twice — once in the tree and
  // again in the trailing failure summary — and a doubled list reads as twice
  // the blast radius.
  // Anchored on the duration suffix, not the first "(" — a lazy match truncates
  // any test name containing a parenthetical, which silently collapses distinct
  // failures into one string (measured in precision-mutants v3, where three
  // separate call-site kills all reported as "CALL SITE").
  const names = [...new Set([...text.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  return { pass, fail, names };
}

const results = [];
try {
  const baseline = runSuite(path.resolve(OVERLAY));
  console.log(`baseline: ${baseline.pass} pass / ${baseline.fail} fail`);
  if (baseline.fail !== 0) throw new Error('baseline not green — nothing below is measurable');

  for (const [id, description, find, replace, expect] of MUTANTS) {
    const asset = path.join(dir, `${id}.js`);
    writeFileSync(asset, apply(id, find, replace), 'utf8');
    const check = spawnSync('node', ['--check', asset], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`${id}: syntax error — a mutant that cannot load fails every test for the wrong reason\n${check.stderr}`);
    const run = runSuite(asset);
    const verdict = expect === 'green'
      ? (run.fail === 0 ? 'OK (green, as expected)' : `FALSE FAIL — ${run.fail} red`)
      : expect === 'survive'
        ? (run.fail === 0 ? 'SURVIVED (expected — see the note on this mutant)' : `killed (radius ${run.fail}) — the note claiming it is unreachable is now WRONG`)
        : (run.fail > 0 ? `killed (radius ${run.fail})` : 'SURVIVED');
    results.push({ id, verdict });
    console.log(`${id}  ${description}\n     ${verdict}${run.names.length ? '\n     red: ' + run.names.join(' | ') : ''}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const killed = results.filter((r) => r.verdict.startsWith('killed')).length;
const survived = results.filter((r) => r.verdict === 'SURVIVED').length;
const expectedSurvivors = results.filter((r) => r.verdict.startsWith('SURVIVED (expected')).length;
const falseFails = results.filter((r) => r.verdict.startsWith('FALSE FAIL')).length;
const controls = MUTANTS.filter((m) => m[4] === 'green').length;
const graded = MUTANTS.length - controls;
console.log(`\n${graded} mutants, ${killed} killed, ${survived} survived unexpectedly, ${expectedSurvivors} expected survivor; ${controls} control, ${falseFails} false-failed`);

// The verdict has to reach the exit status — same fix as precision-mutants v4,
// found by an adverse pass on that harness and applied here because the defect
// is identical: printing "SURVIVED" and then exiting 0 makes a recorded EXIT=0
// carry no information about the result. Note what is NOT counted: `survived`
// here already excludes D1, whose survival is declared in the matrix and
// EXPECTED. An expected survivor that turns out to be KILLED is graded by its
// own verdict string, which says the note claiming it unreachable is now wrong.
if (survived > 0 || falseFails > 0) {
  console.error(`\nFAIL: ${survived} unexpected survivor(s), ${falseFails} false fail(s)`);
  process.exitCode = 1;
}
