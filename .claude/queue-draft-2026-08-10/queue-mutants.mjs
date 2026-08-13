// Measured mutation matrix for "Add to queue" and the style-only grab-loss path
// (Andrew, 2026-08-10: "I am losing grabs becasue they are not making it to the que").
//
// Harness contract, carried verbatim from .claude/overlay-controls-2026-08-08/detached-draft-mutants.mjs
// with the one addition that round's adverse pass asked for: the REGISTERED test
// count is declared, not just pass/fail/skip. A pass/fail/skip triple says
// nothing about how many tests ran, so a shortened suite reports 1 pass / 0 fail
// / 0 skipped, satisfies every guard, and prints SURVIVED for the wrong reason.
//
// Clean green baseline FIRST, `node --check` every mutant, find-strings present
// AND unique, exit status must agree with the summary, and failing TEST NAMES
// rather than a count — a radius with no names cannot attribute a failure.
//
// v3, from the round-1 adverse pass, and both changes are about the verdict rather
// than the mutants. (a) EVERY graded mutant now declares the test it is expected to
// redden, and a kill only counts when that name is among the reds — otherwise a
// mutant that breaks something unrelated reads as proof of a guard that does not
// exist. Sol found the old `run.fail > 0` version accepting any nonzero count.
// (b) There is no 'survive' expectation any more. Q7 was declared an expected
// survivor on the claim that its harm needed a race; reading
// serializeLivePending() refuted that — it skips any draft whose target is
// detached, so once the node is gone NO later persist can re-memoize under the
// rotated key and the loss is permanent, not racy. A harness that categorises a
// killed expected-survivor as `killed` and exits 0 cannot tell you the declaration
// decayed, which was the other half of the same finding.
//
// v5 adds a MESSAGE expectation alongside the test expectation, because Q15 and
// Q16 are two mechanisms that redden the SAME test and the v3 grader cannot tell
// them apart — it matches test NAMES, so both would read `killed (radius 1)` on
// T8 whichever one actually broke. That is the exact shape the round-1 finding
// rejected one level up ("`fail > 0` accepts a mutant that broke something
// unrelated"), and this file's own header already records Q9/Q11/Q12/Q13 as four
// mechanisms at radius 1 on T5 whose attribution rests on reading the message by
// hand. It is machine-checked now: a declared message absent from the output is a
// WRONG ASSERTION, not a kill. `assert` aborts at the first failure, which is what
// makes this discriminate — under Q15 the styleEdits assertion fails first, under
// Q16 that one passes and the frozen-half assertion fails.
//
// No radius correction is applied and none is needed: mutants are written to a
// temp file and served through RAVEN_GRAB_ASSET_PATH, so the tracked browser/
// and web/public/ copies are untouched and the mirror-identity test in
// grab-bridge.test.mjs is not in this suite anyway.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = 'browser/raven-grab.js';
const SUITE = 'test/grab-overlay-queue-draft.test.mjs';
// Declared and measured: 14 tests, all passing, none skipped.
const EXPECTED_BASELINE_TESTS = 14;
const EXPECTED_BASELINE_PASS = 14;
const EXPECTED_BASELINE_SKIPS = 0;
const source = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'queue-mutants-'));

// The test names, so a mutant declares the one it must redden rather than a
// count. Typos are caught by construction: an expected name absent from the
// baseline's own test list aborts before anything is graded.
const T1 = 'Add to queue banks the live draft and empties the instruction box';
const T2 = 'Add to queue states its reason and enables the moment a style is committed';
const T3 = 'a style-only draft survives its slide being removed';
const T4 = 'Add to queue banks synchronously, before any debounce could have run';
const T5 = 'Add to queue refuses a draft whose element has already gone, instead of reporting success over it';
const T6 = 'reverting the last style edit does not orphan the instruction that is still in the draft';
const T7 = 'Add to queue still banks a detached draft that was already snapshotted';
const T8 = 'Add to queue carries the edit committed inside the persist debounce, not the stale snapshot';
const T9 = 'a carried row restored from a previous page load does not swallow this page grab';
const T10 = 'a successful bank confirms itself instead of immediately re-refusing';
const T11 = 'removing the last banked row stops the panel claiming it is in the queue';
const T12 = 'removing one of two banked rows leaves the queue confirmation standing';
const T13 = 'a successful bank announces itself once and renders itself once';
const T14 = 'a successful bank routes around a collapsed Assets status region';

// [id, description, find, replace, expect, expectRed, expectMessage]
let MUTANTS = [
  ['Q1', 'a committed style edit does not sync the button in place (the shipped-once defect class: markup built only by renderPanel can never appear when the first edit lands)',
    '    syncStyleVersionsSection();\n    syncQueueButton();',
    '    syncStyleVersionsSection();', 'red', T2],
  ['Q2', 'typing an instruction does not sync the button — the half that never touches the style collections',
    '    schedulePersistPending();\n    // The instruction box is the half of "is there work" that never touches the\n    // style collections, so syncActiveStyleDraftKey never fires for it. Typing\n    // the first character of an instruction has to enable Add to queue.\n    syncQueueButton();',
    '    schedulePersistPending();', 'red', T1],
  ['Q3', 'the button never refuses, so it offers to bank an empty draft',
    '  function queueDraftBlocker() {\n    if (!selectedElement) return "Select an element first";',
    '  function queueDraftBlocker() {\n    return "";\n    // eslint-disable-next-line no-unreachable\n    if (!selectedElement) return "Select an element first";', 'red', T2],
  ['Q4', 'the instruction box is left full after banking, so the same words render twice',
    '    instructionDraft = "";\n    persistPendingNow();\n    renderPanel();',
    '    persistPendingNow();\n    renderPanel();', 'red', T1],
  ['Q5', 'the bank SCHEDULES instead of persisting — a slide advance beats the 250ms debounce, which is the bug the button exists for',
    '    instructionDraft = "";\n    persistPendingNow();\n    renderPanel();\n    return true;',
    '    instructionDraft = "";\n    schedulePersistPending();\n    renderPanel();\n    return true;', 'red', T4],
  // Re-anchored: the original find-string named a comment line that the corrected
  // DEFECT-3 wording rewrote. A find-string mutant dies the moment its target line
  // is edited, which is why the whole matrix is re-run rather than carried forward.
  ['Q6', 'a style commit reaches no persist at all — the primary loss path, and the half no button can fix',
    '    schedulePersistPending();\n  }\n\n  function clearActiveStyleDraftState() {',
    '    if (false) schedulePersistPending();\n  }\n\n  function clearActiveStyleDraftState() {', 'red', T3],
  // Was declared an expected survivor on my own claim that its harm needed a race.
  // Reading serializeLivePending() refuted that (it returns early on any draft whose
  // target is detached, so nothing can re-memoize under the rotated key and the loss
  // is permanent), and test 6 stages it deterministically. Graded like every other
  // mutant now.
  ['Q7', 'the draft key ignores the instruction box again, so dropping the last style edit rotates the identity the memo is filed under',
    'textEdit || instructionDraft.trim()) ensureActiveStyleDraftKey();',
    'textEdit) ensureActiveStyleDraftKey();', 'red', T6],
  ['Q8', 'the click never reaches queueActiveDraft — the delegation branch is gone',
    '    if (event.target.closest("[data-queue-draft]")) {',
    '    if (false && event.target.closest("[data-queue-draft]")) {', 'red', T1],
  // Q9-Q11 all redden test 5 and are three separate mechanisms, separated by WHICH
  // assertion in it fails — read the message, not the radius. Q9: the blocker never
  // refuses, so the status says "Added to queue" over destroyed work (the P1 itself).
  // Q10: the refusal happens but says nothing, so the status carries no reason.
  // Q11: the reason is stated while the button the user just pressed stays drawn
  // enabled.
  ['Q9', 'the detach clause is gone — the P1 returns: a detached draft is stashed, the button\'s own persist sweeps it, and the status reports success over work that no longer exists',
    '    if (target.isConnected === false\n      && !draftAwaitingReconnect({ styleEdits: styleEdits, tokenIntents: tokenIntents })\n      && !lastConnectedPending[activeStyleDraftKey]) {',
    '    if (false\n      && !draftAwaitingReconnect({ styleEdits: styleEdits, tokenIntents: tokenIntents })\n      && !lastConnectedPending[activeStyleDraftKey]) {', 'red', T5],
  ['Q10', 'the refusal is BLANKET — the memo clause is dropped, so a detached draft that WAS snapshotted is refused and the user is told their work is gone while it sits in sessionStorage (the red-on-correct-code direction, and the only thing that makes the clause\'s narrowness measured)',
    '      && !lastConnectedPending[activeStyleDraftKey]) {',
    '      ) {', 'red', T7],
  ['Q11', 'the refusal states no reason — the click handler reports the generic fallback instead of the blocker',
    '      setGlobalActionStatus(queueDraftBlocker() || "Nothing to add yet");',
    '      setGlobalActionStatus("Nothing to add yet");', 'red', T5],
  // Q12 and Q14 are the two ends of the a11y P2 fix and are SEPARATE mechanisms,
  // which the v3 expected-red-test enforcement is what established. Q12 was declared
  // against test 2 on the assumption that the idle title comes from
  // syncQueueButton(); it does not — instructionsMarkup renders `title` inline
  // (browser/raven-grab.js:11864), so the idle assertion is satisfied by the RENDER
  // and Q12 is only visible where the title has to be UPDATED IN PLACE after the
  // element detaches. A `run.fail > 0` verdict would have filed this under `killed`
  // and the mis-declaration would have gone unrecorded, which was exactly the
  // round-1 finding.
  ['Q12', 'the title is never updated in place, so after the element goes the button still carries whatever reason the last render left on it',
    '        button.setAttribute("aria-disabled", "true");\n        button.setAttribute("title", blocker);',
    '        button.setAttribute("aria-disabled", "true");', 'red', T5],
  ['Q14', 'the title is absent from the rendered markup, so a blocked button at rest has no programmatically reachable reason',
    '${queueNoteAtRender ? \' aria-disabled="true" title="\' + escapeHtml(queueNoteAtRender) + \'"\' : ""}',
    '${queueNoteAtRender ? \' aria-disabled="true"\' : ""}', 'red', T2],
  ['Q13', 'the refusal does not sync first, leaving the stale-enabled button the user just pressed still drawn enabled',
    '      syncQueueButton();\n      // The || arm has no reachable trigger',
    '      // The || arm has no reachable trigger', 'red', T5],
  // Q15 and Q16 are the two ends of the FINDING-B fix and they redden the SAME
  // test, separated ONLY by which assertion inside it aborts first — which is why
  // this round added the message expectation. Q15 restores the shipped P1 exactly:
  // the memo is promoted verbatim, so the edit committed inside the 250ms debounce
  // is thrown away under a status line reading "Added to queue". Q16 is the
  // opposite failure and the reason the fix is an OVERLAY rather than a rebuild:
  // take the fresh edits and drop the frozen snapshot, and the carried entry loses
  // the selector, markup and computed styles a detached node can no longer supply
  // (payloadForSend throws ravenSelectionGone there) — one loss traded for another.
  ['Q15', 'the overlay never fires — carryDetachedDraft promotes the memo verbatim, which is the shipped P1: an edit committed inside the persist debounce is banked as "Added to queue" and dropped',
    '    if (!entry) return false;\n    entry = freshenedCarryEntry(entry, draft);',
    '    if (!entry) return false;', 'red', T8, 'the edit committed inside the debounce is what got carried'],
  ['Q16', 'the frozen DOM half is discarded — only the fresh edits ship, so the carried entry has no selector, no markup and no computed styles, which a detached node cannot regenerate',
    '    Object.keys(entry.payload).forEach(function (key) { payload[key] = entry.payload[key]; });\n    Object.keys(fresh).forEach(function (key) { payload[key] = fresh[key]; });',
    '    Object.keys(fresh).forEach(function (key) { payload[key] = fresh[key]; });', 'red', T8, 'the frozen snapshot still supplies the selector'],
  // Q17 restores the Sol round-3 P1 exactly: hydrate hands the stored key back
  // verbatim instead of renumbering it into the `stored:` namespace. It is the ONLY
  // mutant in this matrix that a carried row from a PREVIOUS page load can see, which
  // is precisely the gap Sol named — "the matrix never starts with a restored carried
  // entry, so none of its mutants detect this". Under it, page B's first draft mints
  // `style-draft-1` again (the sequence resets on load), its memo entry key collides
  // with the restored `live:style-draft-1`, carryDetachedDraft's de-dupe declines to
  // push, and sweepStaleStyleDrafts drops the draft anyway: one row survives and it
  // names the PREVIOUS page's element.
  ['Q17', 'hydrate restores the stored key verbatim, so a carried row from a previous page load collides with this page first live draft and silently swallows it',
    '        .map(function (entry, index) {\n          entry.key = "stored:" + (index + 1);\n          return entry;\n        });',
    '        .map(function (entry) {\n          return entry;\n        });', 'red', T9,
    'both grabs are queued: the restored one and this pages'],
  // Q18 and Q19 are the two ends of the Sol round-3 P2 fix, and — unlike Q15/Q16 —
  // the v5 message check CANNOT separate them: both leave the note reading
  // QUEUE_NEEDS_WORK after a successful bank, so both abort test 10 at the same
  // assertion. They are recorded as two mechanisms anyway, on the same footing as
  // Q9/Q11/Q12/Q13, because each is a distinct line whose deletion ships the defect:
  // Q18 never sets the notice at all, Q19 sets it and then has the sync read the raw
  // blocker instead of the shared rule — the second door disagreeing with the first,
  // which is the drift queueNoteText() exists to make impossible.
  ['Q18', 'the click handler never sets the notice, so a successful bank re-renders as "change a style or write an instruction first" — the control contradicting itself the instant it worked',
    '        queueNotice = QUEUE_ADDED_NOTICE;\n        syncQueueButton();',
    '        syncQueueButton();', 'red', T10, "actual: 'Change a style or write an instruction first'"],
  ['Q19', 'the in-place sync bypasses the shared rule and reads queueDraftBlocker() directly, so the confirmation is written by one door and thrown away by the other',
    '    var blocker = queueNoteText();',
    '    var blocker = queueDraftBlocker();', 'red', T10, "actual: 'Change a style or write an instruction first'"],
  // Q20/Q21/Q23 are the three ends of the Sol round-4 P2 fix, and they are separable
  // from Q18/Q19 because the fix is a PREDICATE — which has two wrong answers — and
  // because "expire the notice" can also be written in the WRONG PLACE.
  //
  // Q20 never expires it (the shipped defect: "Added to queue" over an empty queue).
  //
  // Q21 was DECLARED against T12 and measured against T10 instead, which is a fact
  // about the mechanism worth writing down rather than papering over. An always-false
  // predicate does not "expire the notice on a removal" at all: right after a bank the
  // blocker IS QUEUE_NEEDS_WORK, so the confirmation never survives long enough to be
  // seen, and T12's precondition ('and the confirmation is there to be lost') goes red
  // before the removal ever happens. Its radius of 3 is therefore ONE mechanism and not
  // three guards — every test that reads the confirmation runs through that state — and
  // it is graded on T10's own harm assertion, where the harm actually lands. MEASURED,
  // v10: killed at radius 3 on that message, and its red set is BYTE-IDENTICAL to Q18's
  // and Q19's, which is what turns "one mechanism, not three guards" from a reading into
  // a measurement.
  //
  // Q23 is what that left uncovered, and it is the mutant T12 exists for: the plausible
  // wrong fix is not a broken predicate, it is expiring the notice from removeChange()
  // on ANY removal — the right rule in the WRONG PLACE, this repo's one-rule-two-doors
  // drift in a third form. MEASURED, v10: radius 1, T12 red on its own post-removal
  // assertion with T10 and T11 green (T11 WANTS the notice gone), so the predicate's
  // narrowness is measured rather than asserted. Until Q23 existed, T12's closing
  // assertions were guarded by nothing — a test whose own assertion no mutant reaches
  // is a comment.
  ['Q20', 'the notice never expires, so removing the sole banked row leaves the panel claiming "Added to queue" over an empty queue',
    '      if (pendingLogicalCount() > 0) return queueNotice;\n      queueNotice = "";\n      return blocker;',
    '      return queueNotice;', 'red', T11,
    'because the panel must not claim work is queued beside an empty queue'],
  ['Q21', 'the predicate never admits the notice, so the confirmation never survives the state that immediately follows a bank — the control is silent about the one thing it just did',
    '      if (pendingLogicalCount() > 0) return queueNotice;',
    '      if (false) return queueNotice;', 'red', T10,
    "actual: 'Change a style or write an instruction first'"],
  // Q22 exists to ANSWER a question rather than to guard a line, and it is the reason
  // T9's closing assertion no longer calls itself unfalsifiable. Sol round-4 P3 claimed
  // that assertion is independently killable: a hydrate that renumbers into the LIVE
  // namespace under a number this page's counter never reaches collides with nothing,
  // so all three harm assertions above it stay green (two rows, both labels, both
  // instructions) and only the namespace line goes red. This repo's own round-7
  // precedent says a claim that something cannot be tested is falsifiable by writing
  // the test — so the claim was measured instead of argued. MEASURED, v9 and again in
  // v10: it kills T9 on the declared assertion at radius 1. Sol was right, the "NOT
  // INDEPENDENTLY FALSIFIABLE" label on that assertion was false, and the label is gone.
  ['Q22', 'hydrate renumbers into the LIVE namespace instead of the stored one — no collision, so the rows are all correct and the restored entry is nonetheless sitting in the namespace this page mints from',
    '          entry.key = "stored:" + (index + 1);',
    '          entry.key = "live:style-draft-" + (index + 900);', 'red', T9,
    'because hydrate renumbered the restored entry out of the live key namespace'],
  ['Q23', 'the notice is expired from removeChange() on ANY removal, so a removal that leaves work in the queue throws away a confirmation that is still TRUE beside it — the wrong PLACE rather than the wrong predicate',
    '  function removeChange(id) {',
    '  function removeChange(id) {\n    queueNotice = "";', 'red', T12,
    'because the claim is still TRUE beside a row that is still queued'],
  // The later layout direction removed the local note and made this shared status
  // the visible confirmation. Q24 restores the obsolete sr-only treatment; Q25
  // retains its geometry but removes its paint. T13's pixel comparison catches both.
  ['Q24', 'the only queue confirmation is visually hidden — restoring sr-only leaves no sighted confirmation after the local prose was removed',
    '        setGlobalActionStatus("Added to queue");',
    '        setGlobalActionStatus("Added to queue", "sr-only");', 'red', T13,
    'and it actually paints pixels'],
  ['Q25', 'the status keeps its full geometry but paints transparent text — a box-size visibility predicate would survive',
    '    .raven-grab-status { min-height: 18px; margin: 8px 2px 0; color: var(--raven-grab-tertiary);',
    '    .raven-grab-status { min-height: 18px; margin: 8px 2px 0; color: transparent !important;', 'red', T13,
    'and it actually paints pixels'],
  ['Q26', 'the resolver accepts the first status candidate even when it is inside the collapsed aria-hidden and inert Assets panel',
    '      if (statusNodeIsReachable(candidates[i])) { status = candidates[i]; break; }',
    '      if (true) { status = candidates[i]; break; }', 'red', T14,
    'the bank uses one reachable right status region'],
  ['Q27', 'the resolver ignores aria-hidden when inert is absent',
    '      if (walk.getAttribute("aria-hidden") === "true") return false;',
    '      if (false) return false;', 'red', T14,
    'the bank uses one reachable right status region'],
  ['Q28', 'the resolver ignores inert when aria-hidden is false',
    '      if (walk.hasAttribute("inert")) return false;',
    '      if (false) return false;', 'red', T14,
    'the bank uses one reachable right status region'],
  // DELIBERATELY NOT MUTATED, and each for a measured reason rather than an oversight.
  //
  // (a) "the render bypasses queueNoteText()" would SURVIVE. queueActiveDraft() calls
  //     renderPanel() BEFORE the handler sets the notice, and test 10 triggers no
  //     later render, so the render door is never the one that displays the
  //     confirmation. Adding it would record a survivor with no test behind it, not a
  //     guard.
  // (b) "widen the mask" (`if (blocker === QUEUE_NEEDS_WORK)` -> `if (blocker)`) has NO
  //     REACHABLE TRIGGER. queueDraftBlocker() checks emptiness first, so an empty
  //     draft always yields QUEUE_NEEDS_WORK; any new work spends the notice through
  //     the very next sync; and resetSelectionLocalContext() clears it on deselection.
  //     A clause with no reachable trigger must SAY so rather than have a mutant
  //     pretend to kill it — the isIpLiteral precedent.
  // CONTROL. Renaming a local binding changes the shipped bytes and cannot change
  // any behaviour. A red-only matrix is structurally blind to a false fail — the
  // failure mode that produced two wrong P1s in the alignment round. Verified
  // neutral by reading every use: `draft` is read exactly once, on the next line.
  ['C1', 'CONTROL: queueActiveDraft renames its local stash binding',
    '    var draft = stashActiveStyleDraft();\n    if (!draft) return false;',
    '    var stashed = stashActiveStyleDraft();\n    if (!stashed) return false;', 'green']
];

// ONLY=Q15,Q16 runs a subset. A filtered run is NOT a matrix result and must never
// be recorded as one — it exists because re-anchoring a dead find-string otherwise
// costs a full 16-mutant pass, and because proving the message check discriminates
// needs a deliberately-wrong declaration run against two mutants, not sixteen.
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
if (ONLY.length) {
  const missing = ONLY.filter((id) => !MUTANTS.some((m) => m[0] === id));
  if (missing.length) throw new Error(`ONLY names no such mutant: ${missing.join(', ')}`);
  MUTANTS = MUTANTS.filter((m) => ONLY.includes(m[0]));
  console.log(`SUBSET RUN (${ONLY.join(', ')}) — not a matrix result`);
}

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
  const tests = num(/^ℹ tests (\d+)$/m);
  const pass = num(/^ℹ pass (\d+)$/m);
  const fail = num(/^ℹ fail (\d+)$/m);
  const skipped = num(/^ℹ skipped (\d+)$/m);
  const cancelled = num(/^ℹ cancelled (\d+)$/m);
  if (![tests, pass, fail, skipped, cancelled].every(Number.isFinite)) {
    console.error(text.slice(-1500));
    throw new Error('no summary — never grade a crash as a result');
  }
  if ((out.status === 0) !== (fail === 0)) throw new Error(`exit ${out.status} disagrees with fail ${fail}`);
  // A registered-count check, not just pass/fail/skip: a mutant that prevents a
  // test from being registered at all would otherwise read as a clean run.
  if (tests !== EXPECTED_BASELINE_TESTS) throw new Error(`${tests} tests registered, expected ${EXPECTED_BASELINE_TESTS} — a shortened suite measures nothing`);
  if (cancelled !== 0) throw new Error(`${cancelled} cancelled — nothing here is measurable`);
  // A skipped run measures nothing; grading it would report every mutant as a
  // survivor on a machine where the browser is simply unavailable.
  if (skipped !== EXPECTED_BASELINE_SKIPS) throw new Error(`${skipped} skipped, expected ${EXPECTED_BASELINE_SKIPS} — the browser probe did not pass`);
  // Names, not just a count. Deduped, because node --test prints each ✖ twice —
  // once in the tree and again in the trailing failure summary. Anchored on the
  // duration suffix, not the first "(" — a lazy match truncates any test name
  // containing a parenthetical and silently collapses distinct failures into one.
  const names = [...new Set([...text.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  // Every registered name, red or green. Only used on the baseline, and only to
  // catch a declared expectation that no longer names a real test — a typo or a
  // renamed test would otherwise make every mutant look like it broke the wrong
  // thing, which is indistinguishable from the harness working.
  const all = [...new Set([...text.matchAll(/^[✔✖] (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  // The raw output, for the message check. Whitespace is collapsed because the
  // reporter may wrap or indent a long assertion message across lines, and a
  // message check that silently stops matching on a wrap is a check whose failure
  // mode is indistinguishable from its success mode.
  return { tests, pass, fail, skipped, names, all, flat: text.replace(/\s+/g, ' ') };
}

const results = [];
try {
  const baseline = runSuite(path.resolve(OVERLAY));
  console.log(`baseline: ${baseline.tests} tests / ${baseline.pass} pass / ${baseline.fail} fail / ${baseline.skipped} skipped`);
  if (baseline.fail !== 0) throw new Error('baseline not green — nothing below is measurable');
  if (baseline.pass !== EXPECTED_BASELINE_PASS) throw new Error(`baseline pass ${baseline.pass} != declared ${EXPECTED_BASELINE_PASS}`);
  for (const [id, , , , expect, expectRed] of MUTANTS) {
    if (expect === 'green') continue;
    if (!expectRed) throw new Error(`${id}: no expected-red test declared — a graded mutant without one can only be judged by a count`);
    if (!baseline.all.includes(expectRed)) throw new Error(`${id}: declared test not in the suite — "${expectRed}"`);
  }

  for (const [id, description, find, replace, expect, expectRed, expectMessage] of MUTANTS) {
    const asset = path.join(dir, `${id}.js`);
    writeFileSync(asset, apply(id, find, replace), 'utf8');
    const check = spawnSync('node', ['--check', asset], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`${id}: syntax error — a mutant that cannot load fails every test for the wrong reason\n${check.stderr}`);
    const run = runSuite(asset);
    // A kill counts only when the DECLARED test is among the reds. `fail > 0`
    // accepts a mutant that broke something unrelated and reads it as proof of a
    // guard that does not exist — the round-1 finding.
    const verdict = expect === 'green'
      ? (run.fail === 0 ? 'OK (green, as expected)' : `FALSE FAIL — ${run.fail} red`)
      : run.fail === 0
        ? 'SURVIVED'
        : !run.names.includes(expectRed)
          ? `WRONG TEST (radius ${run.fail}) — declared "${expectRed}" stayed green`
          // Two mutants can redden one test and be separated only by which
          // assertion inside it aborts first (Q15/Q16). Where a message is
          // declared, the kill counts only if that assertion is the one that fired.
          : expectMessage && !run.flat.includes(expectMessage.replace(/\s+/g, ' '))
            ? `WRONG ASSERTION (radius ${run.fail}) — "${expectRed}" is red but not on "${expectMessage}"`
            : `killed (radius ${run.fail})`;
    results.push({ id, verdict });
    console.log(`${id}  ${description}\n     ${verdict}${run.names.length ? '\n     red: ' + run.names.join(' | ') : ''}`);
    if (verdict.startsWith('WRONG ASSERTION')) console.log(`     output tail: ${run.flat.slice(-1200)}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const killed = results.filter((r) => r.verdict.startsWith('killed')).length;
const survived = results.filter((r) => r.verdict === 'SURVIVED').length;
const wrongTest = results.filter((r) => r.verdict.startsWith('WRONG TEST')).length;
const wrongAssertion = results.filter((r) => r.verdict.startsWith('WRONG ASSERTION')).length;
const falseFails = results.filter((r) => r.verdict.startsWith('FALSE FAIL')).length;
const controls = MUTANTS.filter((m) => m[4] === 'green').length;
const graded = MUTANTS.length - controls;
console.log(`\n${graded} mutants, ${killed} killed, ${survived} survived, ${wrongTest} killed the wrong test, ${wrongAssertion} hit the wrong assertion; ${controls} control, ${falseFails} false-failed`);

// The verdict has to reach the exit status: printing "SURVIVED" and then exiting
// 0 makes a recorded EXIT=0 carry no information about the result. There is no
// expected-survivor category any more — a mutant whose declaration decays is a
// finding, and a harness that files it under `killed` cannot tell you so.
if (survived > 0 || wrongTest > 0 || wrongAssertion > 0 || falseFails > 0) {
  console.error(`\nFAIL: ${survived} survivor(s), ${wrongTest} wrong-test kill(s), ${wrongAssertion} wrong-assertion kill(s), ${falseFails} false fail(s)`);
  process.exitCode = 1;
}
