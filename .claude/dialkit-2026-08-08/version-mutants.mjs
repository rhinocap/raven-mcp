// Measured mutation matrix for named style versions.
//
// Same harness contract as precision-mutants.mjs, and for the same reasons:
// clean green baseline first, a DECLARED expected skip count so a baseline that
// measured nothing cannot pass as a result, `node --check` on every mutant,
// find-strings present AND unique, deduped failing test NAMES rather than
// counts, and the exit status must agree with the summary.
//
// The question this matrix answers: nearly every test in this suite passed on
// its FIRST run — the original six, the six the first Sol round added, four from
// round 2, five from round 3, two from round 4, four from round 5b — which under
// this repo's own rule is worth nothing, since five prior rounds here have
// recorded a test found detecting rather than encoding. The 28th is the ONE
// exception and it argues the same way from the other side: it took three
// attempts and TWO of its two failures were defects in its own fixture, not in
// the product (a shim covering one declaration source, then two). Round 8
// corrected this sentence, which had said "every" over a count of 21 against a
// suite of 28. V1 is still the one that matters most: it turns restore into
// apply-without-revert, which is the exact defect the feature exists to avoid
// and the half a reader would most plausibly "simplify" away.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = 'browser/raven-grab.js';
const SUITES = ['test/grab-overlay-style-versions.test.mjs'];
const source = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'version-mutants-'));

// [id, description, find, replace, expect]
const MUTANTS = [
  ['V1', 'restore APPLIES without reverting (a blend of two versions under one name)',
    '      if (!version.edits[property]) clearStyleEdit(property);',
    '      if (false && !version.edits[property]) clearStyleEdit(property);', 'red'],
  ['V2', 'the state-edit clause is dropped from the save blocker',
    '    if (Object.keys(stateStyleEdits).length) return "Versions cover base styles only. Clear the hover/focus edits first.";\n',
    '', 'red'],
  // The description used to say the mutated save "silently no-ops". It does not
  // — with the blocker returning "" the save PROCEEDS, admitting every state the
  // blocker exists to refuse. A mutant description is a claim like any other.
  ['V3', 'the save blocker returns "" instead of a reason (every refusal is admitted)',
    '  function styleVersionSaveBlocker() {\n    if (!currentSelection || !currentSelection.selector) return "Select an element first.";',
    '  function styleVersionSaveBlocker() {\n    return "";\n    if (!currentSelection || !currentSelection.selector) return "Select an element first.";', 'red'],
  ['V4', 'restore ignores the selector scope and applies to whatever is selected',
    '    if (!version || !currentSelection || currentSelection.selector !== version.selector) return false;',
    '    if (!version || !currentSelection) return false;', 'red'],
  ['V5', 'a duplicate name pushes a second entry instead of updating in place',
    '    var existing = findStyleVersionByName(selector, trimmed);',
    '    var existing = null;', 'red'],
  ['V6', 'the button label ignores the duplicate and always reads Save',
    '      button.textContent = duplicate ? "Update" : "Save";',
    '      button.textContent = "Save";', 'red'],
  // RE-ANCHORED after the Sol round. The old V7 mutated a max-seeding loop that
  // no longer exists — hydrate renumbers now — and a find-string mutant dies the
  // moment its target line is edited, which is why this matrix is re-measured
  // WHOLE after every fix round rather than carried forward.
  ['V7', 'the id sequence restarts at 0 after hydrate instead of carrying on',
    '    styleVersionSequence = styleVersions.length;',
    '    styleVersionSequence = 0;', 'red'],
  ['V8', 'hydrate does not run at boot, so versions die on reload',
    '  carriedPending = readCarriedPending();\n  hydrateStyleVersions();',
    '  carriedPending = readCarriedPending();', 'red'],
  // The fix that made the feature reachable at all. A commit deliberately does
  // NOT re-render (that would destroy the open editor mid-keystroke), so without
  // this line the section can never appear on the user's first style edit —
  // which is precisely how the first version of this feature shipped, green
  // `node --check` and all, before these tests existed.
  ['V9', 'the draft-changed hook stops syncing the section (it never appears after a commit)',
    '    syncStyleVersionsSection();\n  }',
    '  }', 'red'],
  // The Sol round. Each of these is a defect that shipped past the nine above,
  // a green suite, and this harness — the matrix measured the mechanisms it
  // named and was blind to hand-edited storage and to component scope.
  ['V10', 'hydrate keeps the STORED ids instead of renumbering (the pre-Sol behaviour)',
    '    styleVersions.forEach(function (version, index) { version.id = index + 1; });\n    styleVersionSequence = styleVersions.length;',
    '    styleVersionSequence = 0;\n    styleVersions.forEach(function (version) {\n      if (version.id > styleVersionSequence) styleVersionSequence = version.id;\n    });', 'red'],
  // RE-ANCHORED after Sol round 2 split isStyleVersionEdits into a SHAPE half and
  // a VALIDITY half. The old find-string was the whole one-line body and is gone.
  // This mutant owns the shape half only: with the type test dropped, a stored
  // {"color": null} reaches the validity check, `edit.newValue` throws, and the
  // read's catch returns [] — so the list goes empty rather than the one bad
  // entry being dropped. V19 owns the validity half, and they are separated
  // because they refuse two different kinds of hand-edited storage.
  ['V11', 'the edits SHAPE check is dropped (a null edit throws the whole list away)',
    '      if (!(edit && typeof edit === "object" && typeof edit.newValue === "string")) return false;',
    '      if (false) return false;', 'red'],
  ['V12', 'the component-scope clause is dropped from the save blocker',
    '    if (editScope === "component") return "Versions cover instance styles only. Switch to “This one” first.";\n',
    '', 'red'],
  // RE-ANCHORED after the done-gate round: the inline scope test became a call
  // to styleVersionRestoreBlocker(), so the old find-string is gone. Its test
  // now DISPATCHES the click rather than pressing it, because V17 disables the
  // row — a pointer click would be swallowed by the platform and V13 would
  // survive, with the markup measured twice and the function not at all.
  ['V13', 'restore stops refusing component scope (it mirrors onto every sibling)',
    '    if (styleVersionRestoreBlocker()) return false;\n',
    '', 'red'],
  // RE-ANCHORED after Sol round 2: the inline global slice became a call to
  // evictStyleVersionsOverCap(selector), so the old find-string is gone. Note the
  // mutant is now strictly stronger than it was — the global persist slice went
  // with the fix, so removing this call leaves NOTHING enforcing the cap.
  ['V14', 'nothing evicts on save, so the list grows past the cap',
    '      evictStyleVersionsOverCap(selector);\n',
    '', 'red'],
  ['V15', 'an instruction blocks the save (the accepted decision, inverted)',
    '    if (textEdit) return "Versions cover base styles only. Clear the text edit first.";',
    '    if (textEdit) return "Versions cover base styles only. Clear the text edit first.";\n    if (instructionDraft) return "Versions cover base styles only. Clear the instruction first.";', 'red'],
  // RE-ANCHORED after Sol round 2: the read-side `.slice(-STYLE_VERSION_LIMIT)`
  // became capStoredVersionsPerSelector(kept), so the old find-string is gone.
  ['V16', 'the cap is not applied to hand-edited storage on the way IN',
    '      return capStoredVersionsPerSelector(kept);',
    '      return kept;', 'red'],
  // The done-gate round. Both are AFFORDANCE, which every mutant above is blind
  // to by construction: they grade what the overlay DOES, and the overlay was
  // already doing the right thing — refusing. What it did not do is say so.
  ['V17', 'a restore the scope refuses still renders as a live button',
    "        + (restoreBlocker ? \" disabled\" : \"\") + '>'\n",
    "        + '>'\n", 'red'],
  ['V18', 'the note always explains the SAVE refusal, never the restore one',
    '    if (savedCount && restoreBlocker) return restoreBlocker;\n',
    '', 'red'],
  // Sol round 2's three fixes, one mutant each — except the cap, which needed two
  // because per-selector is a rule enforced at TWO sites (the read and the save)
  // and a single mutant would leave whichever site it did not touch unmeasured.
  // RE-ANCHORED after Sol round 3: the inline CSS.supports expression became a
  // call to styleValueSupported(), so the old find-string is gone. The mutant
  // is unchanged in intent — drop the VALIDITY half and keep the shape half —
  // and it now reddens the round-3 probe test as well, because both tests grade
  // the same validity mechanism through two different fallbacks. V24 is the one
  // that separates them: it removes the probe and leaves this call in place.
  ['V19', 'the stored VALUE is never checked against CSS (a destructive no-op restore)',
    '      return styleValueSupported(property, edit.newValue);',
    '      return true;', 'red'],
  // The two blockers share ONE predicate on purpose, so one mutant covers both
  // halves — the test asserts the save refusal and the restore refusal together,
  // which is the honest shape when the mechanism really is single.
  ['V20', 'a stale component-scope mirror stops blocking either a save or a restore',
    '    var properties = Object.keys(styleEditScopeSiblingsOriginal);\n    return properties.length ? properties[0] : "";',
    '    return "";', 'red'],
  ['V21', 'eviction goes back to a GLOBAL slice (it deletes another element\'s oldest)',
    '    var mine = styleVersionsForSelector(selector);\n    if (mine.length <= STYLE_VERSION_LIMIT) return;\n    var evict = mine.slice(0, mine.length - STYLE_VERSION_LIMIT);\n    styleVersions = styleVersions.filter(function (version) { return evict.indexOf(version) === -1; });',
    '    if (styleVersions.length > STYLE_VERSION_LIMIT) styleVersions = styleVersions.slice(-STYLE_VERSION_LIMIT);', 'red'],
  ['V22', 'the READ-side cap goes back to a global slice (it drops a selector entirely)',
    '  function capStoredVersionsPerSelector(entries) {\n    var counts = Object.create(null);',
    '  function capStoredVersionsPerSelector(entries) {\n    return entries.slice(-STYLE_VERSION_LIMIT);\n    var counts = Object.create(null);', 'red'],
  ['V23', 'the empty-edits refusal is dropped (`.every()` is vacuously true on {})',
    '    var properties = Object.keys(edits);\n    if (!properties.length) return false;\n',
    '    var properties = Object.keys(edits);\n', 'red'],
  // RE-ANCHORED in round 5b: the shared `styleSupportProbe` element is gone —
  // the probe builds a fresh declaration per uncached call — so the old
  // find-string named a line that no longer exists and the pre-flight aborted.
  ['V24', 'the no-CSS.supports fallback returns true again (the destructive no-op, handed back)',
    '    try {\n      var style = probeGetStyle(probeCreateDiv());',
    '    return true;\n    try {\n      var style = probeGetStyle(probeCreateDiv());', 'red'],
  // Re-anchored in round 5: the `.some()` → `.every()` fix rewrote the very
  // lines this was pinned to, and the pre-flight caught it in seconds.
  ['V25', 'restore stops asking whether it can apply anything (an in-session version clears and applies nothing)',
    '    var properties = Object.keys(version.edits);\n    var appliable = properties.length > 0 && properties.every(function (property) {\n      return styleValueSupported(property, version.edits[property].newValue);\n    });\n    if (!appliable) return false;\n',
    '', 'red'],
  ['V26', 'the RECEIVING direction of the stale mirror stops being checked',
    '  function foreignScopeSiblingPreview() {\n    if (!selectedElement) return "";',
    '  function foreignScopeSiblingPreview() {\n    return "";\n    if (!selectedElement) return "";', 'red'],
  ['V27', 'a persist throw is swallowed again (a save that will not survive a reload looks identical to one that will)',
    '      styleVersionPersistFailed = true;\n      return false;',
    '      return false;', 'red'],
  // V28 and V29 are round 5, one per Sol-R4 P2.
  //
  // V28 restores the round-3 SHAPE: `CSS.supports` answers alone whenever it is
  // present, and the engine probe is only the absent-fallback. V24 cannot see
  // this — its fixture DELETES `CSS.supports`, which is exactly the case that
  // already reached the probe — so the two fixtures differ by one word and the
  // radius separates them.
  ['V28', 'CSS.supports answers alone again when present (a lying `true` smuggles garbage past the probe)',
    '      if (window.CSS && typeof window.CSS.supports === "function" &&\n          !window.CSS.supports(property, value)) {\n        return false;\n      }',
    '      if (window.CSS && typeof window.CSS.supports === "function") {\n        return window.CSS.supports(property, value);\n      }', 'red'],
  // V29 is NOT V25. V25 deletes the appliability check outright and reddens
  // both the all-unsupported test and the partial one; V29 keeps the check and
  // only weakens `.every` to `.some`, which still refuses when EVERY property
  // is unsupported — so it reddens the partial test alone. That is what makes
  // "all-or-nothing" a measured property rather than a restated one.
  ['V29', 'the appliability check goes back to `.some` (a partial restore assembles a blend)',
    'properties.length > 0 && properties.every(function (property) {',
    'properties.some(function (property) {', 'red'],
  // V30..V33 are round 5b, one per Sol-R5b P2 plus the two halves of the memo.
  //
  // V30 and V33 are TWO MUTANTS ON ONE MECHANISM, separated by which tests they
  // redden — the V14/V16 and V25/V29 pattern again. V30 deletes the memo
  // outright, so a page-replaceable `CSS.supports` can answer true to the
  // `.every()` pre-check and false to commitStyleEdit a few statements later:
  // the revert half runs, the apply half is refused, and round 3's destructive
  // no-op is reassembled across two honest-looking invocations. Only the flip
  // test can see it. V33 goes the other way and makes the memo GLOBAL, which
  // closes the flip and takes the pre-restore guard's reachability with it —
  // every in-session value was probed at commit time and every stored value at
  // hydrate, so nothing anywhere has a verdict left to change. It reddens the
  // two in-session refusal tests and NOT the flip test. That was the drafted
  // fix, and it is in the matrix because it was measured red rather than argued
  // against.
  ['V30', 'the support verdict is never memoized (a flipping CSS.supports reassembles the destructive no-op)',
    '    if (!styleSupportMemo) return probeStyleValueSupported(property, value);',
    '    return probeStyleValueSupported(property, value);', 'red'],
  // V31/V32 are the two POST-injection prototype poisons decision 15's old
  // residual dismissed on a false premise. Each drops one captured primitive
  // back to a live lookup; the `createElement` capture shares the mechanism and
  // has NO fixture, which is stated in decision 18 rather than implied by a
  // mutant nobody wrote.
  ['V31', 'the probe looks up setProperty live again (a selective wrapper launders garbage past it)',
    '    probeSetProperty = function (style, property, value) { rawSetProperty(style, property, value); };\n',
    '', 'red'],
  ['V32', 'the probe looks up getPropertyValue live again (a wrapper forges the parser-rejected signal)',
    '    probeGetPropertyValue = function (style, property) { return rawGetPropertyValue(style, property); };\n',
    '', 'red'],
  // V34 is the `style` ACCESSOR, which is a DIFFERENT lever from V31/V32's two
  // methods (a property descriptor, not an assignable data property) and was
  // left live for a full round after those two were captured — the same hole one
  // line over. Its fixture poisons through Object.defineProperty.
  ['V34', 'the probe looks up the `style` accessor live again (a decoy declaration forges a non-empty read)',
    '    probeGetStyle = function (el) { return rawStyle(el); };\n',
    '', 'red'],

  ['V33', 'the memo goes GLOBAL again (the pre-restore guard loses its reachability)',
    '    if (!styleSupportMemo) return probeStyleValueSupported(property, value);',
    '    if (!styleValueSupported.memo) styleValueSupported.memo = Object.create(null);\n    styleSupportMemo = styleValueSupported.memo;', 'red'],

  // V35 — the `typeof` gate round 6 shipped and round 7 proved testable. Round 6
  // claimed no Chromium fixture could separate a guarded build from an unguarded
  // one, on the reasoning that in a conforming engine an instance method IS the
  // prototype method. True, and the conclusion did not follow: the environment
  // the gate is FOR is one where they are different methods, and a page can
  // construct it. Deleting the gate makes `call.bind(undefined)` succeed at bind
  // time and throw on first use, which `probeStyleValueSupported`'s own catch
  // turns into "unsupported" — every supported edit refused, section never shown.
  ['V35', 'the typeof gate is deleted (an instance-shim engine binds undefined and refuses every supported edit)',
    '    if (typeof Document.prototype.createElement !== "function" ||\n        typeof (styleDescriptor && styleDescriptor.get) !== "function" ||\n        typeof CSSStyleDeclaration.prototype.setProperty !== "function" ||\n        typeof CSSStyleDeclaration.prototype.getPropertyValue !== "function") {\n      throw new TypeError("probe primitive missing");\n    }\n',
    '', 'red'],
  // CONTROLS. Renaming a local binding changes the shipped bytes and cannot
  // change behaviour, so a matrix reporting either red is over-reporting. Both
  // move EVERY reference — precision-mutants.mjs shipped a control that left one
  // reference dangling, which is a real break wearing a rename's clothes and
  // reports a false fail on every run.
  ['C1', 'CONTROL: findStyleVersion renames its callback binding',
    '    styleVersions.forEach(function (version) { if (version.id === id) match = version; });',
    '    styleVersions.forEach(function (entry) { if (entry.id === id) match = entry; });', 'green'],
  ['C2', 'CONTROL: deleteStyleVersion renames its length snapshot',
    '    var before = styleVersions.length;\n    styleVersions = styleVersions.filter(function (version) { return version.id !== id; });\n    if (styleVersions.length === before) return false;',
    '    var beforeCount = styleVersions.length;\n    styleVersions = styleVersions.filter(function (version) { return version.id !== id; });\n    if (styleVersions.length === beforeCount) return false;', 'green']
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
  const tests = num(/^ℹ tests (\d+)$/m);
  const cancelled = num(/^ℹ cancelled (\d+)$/m);
  const todo = num(/^ℹ todo (\d+)$/m);
  if (![pass, fail, skipped, tests, cancelled, todo].every(Number.isFinite)) {
    console.error(text.slice(-1200));
    throw new Error(`${suite}: no summary — never grade a crash as a result`);
  }
  if ((out.status === 0) !== (fail === 0)) throw new Error(`${suite}: exit ${out.status} disagrees with fail ${fail}`);
  const names = [...new Set([...text.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  return { pass, fail, skipped, tests, cancelled, todo, names };
}

// Declared, not inferred from the baseline: a baseline that skipped everything
// matches every mutant's skip count exactly, so a relative guard would report
// the whole matrix SURVIVED on a machine where the browser never launched.
const EXPECTED_BASELINE_SKIPS = { 'test/grab-overlay-style-versions.test.mjs': 0 };

// Declared alongside the skip count, and for the same reason one level up: a
// pass/fail/skip triple says nothing about how many tests were REGISTERED. A
// suite shortened by an edit, or one whose describe block half-failed to
// register, reports 1 pass / 0 fail / 0 skipped and satisfies every guard below
// while measuring a sixth of the corpus — the mutants would then be graded
// against tests that do not exist and print SURVIVED for the wrong reason.
const EXPECTED_BASELINE_TESTS = { 'test/grab-overlay-style-versions.test.mjs': 28 };

function assertBaselineMeasured(suite, baseline) {
  const expected = EXPECTED_BASELINE_SKIPS[suite];
  if (expected === undefined) throw new Error(`${suite}: no declared baseline skip count — add one before grading it`);
  if (baseline.skipped !== expected) {
    throw new Error(`${suite}: baseline skipped ${baseline.skipped}, expected ${expected} — every mutant below would be graded against a suite that did not run`);
  }
  const expectedTests = EXPECTED_BASELINE_TESTS[suite];
  if (expectedTests === undefined) throw new Error(`${suite}: no declared test count — add one before grading it`);
  if (baseline.tests !== expectedTests) {
    throw new Error(`${suite}: baseline registered ${baseline.tests} tests, expected ${expectedTests} — grading a corpus that is not the one this matrix describes`);
  }
  if (baseline.cancelled !== 0 || baseline.todo !== 0) {
    throw new Error(`${suite}: baseline cancelled ${baseline.cancelled} / todo ${baseline.todo} — a baseline that abandoned tests is not a baseline`);
  }
  if (baseline.pass === 0) throw new Error(`${suite}: baseline ran 0 passing tests — nothing here is measurable`);
}

// A mutant must not change what RAN — only what PASSED. A dropped or cancelled
// test looks exactly like a test that never had an opinion.
function assertSkipsUnmoved(suite, baseline, run) {
  if (run.skipped !== baseline.skipped) {
    throw new Error(`${suite}: skipped ${run.skipped}, baseline ${baseline.skipped} — a mutant must not change what RAN`);
  }
  if (run.tests !== baseline.tests) {
    throw new Error(`${suite}: registered ${run.tests} tests, baseline ${baseline.tests} — a mutant must not change what RAN`);
  }
  if (run.cancelled !== 0 || run.todo !== 0) {
    throw new Error(`${suite}: cancelled ${run.cancelled} / todo ${run.todo} — never grade a run that abandoned tests`);
  }
}

const results = [];
try {
  // No radius correction: mutants are served from a TEMP FILE through
  // RAVEN_GRAB_ASSET_PATH, so the tracked browser/ and web/public/ copies are
  // untouched and the mirror-identity test in grab-bridge.test.mjs (not run
  // here) is unaffected either way.
  // PRE-FLIGHT, added round 3 after a stale V19 anchor aborted the run 25
  // minutes in, having already spent 18 mutant runs that then had to be thrown
  // away and re-measured. Presence, uniqueness and syntax are all answerable
  // without launching anything, so answer them first: a find-string mutant dies
  // the moment its target line is edited, and this matrix is re-run WHOLE after
  // every fix round precisely because that keeps happening.
  for (const [id, , find, replace] of MUTANTS) {
    const check = spawnSync('node', ['--check', '-'], { encoding: 'utf8', input: apply(id, find, replace) });
    if (check.status !== 0) throw new Error(`${id}: syntax error (pre-flight)\n${check.stderr}`);
  }

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

// The verdict has to reach the exit status, or a recorded EXIT=0 proves only
// that the script reached its last line.
if (survived || falseFails) process.exitCode = 1;
