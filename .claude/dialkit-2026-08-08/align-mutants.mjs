// Measured mutant matrix for the shared mic-row alignment rule.
// Fail-closed: anchors must match exactly once BEFORE the baseline, a no-op
// mutation dies in the preflight, every copy is node --check'ed, a missing or
// disagreeing summary aborts, and the baseline must be green.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OVERLAY = path.resolve('browser/raven-grab.js');
const SUITE = 'test/grab-overlay-voice-alignment.test.mjs';
const original = readFileSync(OVERLAY, 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'align-mutants-'));

const SHARED = '.raven-grab-field > span,\n    .raven-grab-feedback-field > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; }';

const MUTANTS = [
  ['A1  the shared row rule reverts to display:block', SHARED,
    '.raven-grab-field > span,\n    .raven-grab-feedback-field > span { display: block; }'],
  ['A2  flex, but no justify-content:space-between', SHARED,
    '.raven-grab-field > span,\n    .raven-grab-feedback-field > span { display: flex; align-items: center; gap: 8px; }'],
  ['A3  the rule covers the feedback row ONLY', SHARED,
    '.raven-grab-field > span { display: block; }\n    .raven-grab-feedback-field > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; }'],
  // A4-A6 grade the SOURCE-ENUMERATION test, which is the only thing in this
  // suite that can see a mic the browser test never renders. A4 and A5 are the
  // same mechanism at two different SITES: both move a mic out of a container
  // the shared rule covers. They redden the same single test, so the radius
  // cannot separate them — the OFFENDING ROW LIST in the failure message is
  // what does, which is why that test collects violations instead of asserting
  // per row.
  ['A4  the fixed-move note mic loses its covered wrapper',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-fixed-move-note"',
    '<label class="raven-grab-fixedmove-field"><span>Add note…\' + voiceButtonMarkup("data-fixed-move-note"'],
  ['A5  the template note mic loses its covered wrapper',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-tplnote-field"><span>Add note…\' + voiceButtonMarkup("data-template-note='],
  ['A6  a ninth mic appears in the overlay',
    '<h2 class="raven-grab-section-title">Instructions</h2>${voiceButtonMarkup("data-instruction", "instructions")}',
    '<h2 class="raven-grab-section-title">Instructions</h2>${voiceButtonMarkup("data-instruction", "instructions")}${voiceButtonMarkup("data-instruction", "instructions")}'],
  // A7/A8 are Sol round 2's counterexample against the FIRST version of the
  // enumeration rule ("a covered opener appears somewhere in the 200-char
  // window"). The covered container opens, holds its label and CLOSES, and the
  // mic then sits in an uncovered <div> — presence satisfied, enclosure did
  // not. Both were measured under BOTH rules, and A8 is the one that shows what
  // the defect actually cost:
  //   A7 (feedback mic, RENDERED)   old rule: enumeration GREEN, geometry red
  //   A8 (template mic, UNRENDERED) old rule: the WHOLE SUITE GREEN, 2 pass
  // A7 alone understates it, because the browser test happens to reach that
  // row. A8 is a real misalignment in a container the browser test cannot
  // render, where the enumeration test is the only guard there is — and the old
  // rule let it through with nothing red anywhere.
  ['A7  a mic escapes its covered container into a sibling div',
    '<span>Message\' + voiceButtonMarkup("data-feedback-message", "feedback message") + \'</span>',
    '<span>Message</span><div class="raven-grab-loose">\' + voiceButtonMarkup("data-feedback-message", "feedback message") + \'</div>'],
  ['A8  the same escape on a mic the browser test cannot render',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' + voiceButtonMarkup("data-template-note='],
  // A9/A10 are Sol round 3's counterexample against the depth walk, and they
  // pull in OPPOSITE directions — which is the whole point, because the walk was
  // reading raw JavaScript as HTML and that is wrong both ways.
  //
  //   A9  an UNCOVERED mic whose escape is masked by a JS comment carrying a
  //       covered opener. Must be RED. Under the pre-fix walk it was GREEN:
  //       lastIndexOf found the opener inside the comment, the text after it
  //       held no tags, depth came back 0, and a real misalignment read as
  //       covered.
  //   A10 a COVERED mic preceded by an HTML comment holding a tag. Must stay
  //       GREEN — it is behaviour-preserving by construction, the comment emits
  //       nothing. Under the pre-fix walk it was RED: <em> inside the comment
  //       was counted as an opener, depth ended at 1, and a correctly built row
  //       was reported as a defect.
  //
  // A10 is a CONTROL, not a mutant: a matrix that only ever measures "does this
  // turn red" cannot see a false-fail, and false-fails are how a gate this noisy
  // gets muted. `expect: green` inverts the verdict for it.
  ['A9  an uncovered mic masked by a JS comment carrying a covered opener',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' /* <label class="raven-grab-field"><span> */ + voiceButtonMarkup("data-template-note='],
  ['A10 CONTROL  a covered mic preceded by an HTML comment holding a tag',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-fixed-move-note"',
    '<label class="raven-grab-field"><span>Add note…<!-- <em> -->\' + voiceButtonMarkup("data-fixed-move-note"',
    'green'],
  // A11 is the FORWARD guard for the scanner's regex-literal branch, and its
  // job is narrower than the other entries — say so rather than let it borrow
  // their authority. The branch is already proven load-bearing by the PRISTINE
  // overlay: remove it and `.replace(/"/g, …)` at ~2968 opens a string that runs
  // for thousands of characters, and the suite goes red on the real file with no
  // mutant involved (measured — 1 pass / 1 fail, and the desync invariant names
  // the line rather than leaving two mics mysteriously uncovered). So A11 is not
  // what makes that branch measured; the baseline is.
  //
  // What A11 adds is the NEXT one: behaviour-preserving JavaScript — a number
  // stringified and stripped of quotes it cannot contain — a few hundred
  // characters ahead of a mic, so a future quote-bearing regex landing near a
  // row is a case the matrix has actually run. It must stay GREEN.
  ['A11 CONTROL  a quote-bearing regex literal sits just ahead of a mic',
    'style="--layer-depth:\' + node.depth + \'"><p class="raven-grab-layer-notice raven-grab-layer-info">You are moving',
    'style="--layer-depth:\' + String(node.depth).replace(/"/g, "") + \'"><p class="raven-grab-layer-notice raven-grab-layer-info">You are moving',
    'green'],
  // A12-A14 are Sol round 4's counterexamples against the round-3 scanner, and
  // all three are the SAME failure in three doors: a construct the lexer reads
  // wrongly turns quoted text into fake markup (or hides real markup), and the
  // fake opener wins `lastIndexOf` because it sits AFTER the real one. Every one
  // of them is silent — the newline invariant never fires, because the quotes
  // balance on the same line. Each must be RED.
  //
  //   A12 a regex literal after a CONTROL-header `)`. `)` cannot end an
  //       expression there, but the round-3 heuristic had no paren stack, read
  //       the `/` as division, and the quotes inside the regex opened a string.
  //   A13 a JS comment inside `${…}`. Round 3 treated an interpolation body as
  //       string content, so a comment inside it was markup — R3-1's own defect,
  //       reachable through a construct the overlay genuinely uses (10567).
  //   A14 a real `</span>` written as `\x3c/span>`. Round 3 kept the ESCAPED
  //       character and dropped the backslash, so the `<` could never appear and
  //       a closer that really renders was invisible to the walk.
  ['A12 a regex after a control-header ) hides an uncovered mic',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' + (function () { if (Date) /\'class="raven-grab-field"><span>\'/.test(\'x\'); return \'\'; }()) + voiceButtonMarkup("data-template-note='],
  // A13 sat at the Instructions site for one measurement and was NOT isolating
  // what it claimed: it came back radius 1, and the red was the GEOMETRY test
  // ("panel/data-instruction: no label row or section heading above the voice
  // slot"). The enumeration walk was fooled exactly as Sol said; the browser
  // happened to render that row and covered for it. Same trap as A7 vs A8 — a
  // counterexample against the SOURCE rule has to live on a row no browser test
  // can reach, or the radius grades the wrong guard.
  ['A13 a JS comment inside ${} hides an uncovered mic',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' + `${/* class="raven-grab-field"><span> */ \'\'}` + voiceButtonMarkup("data-template-note='],
  ['A14 an escaped </span> renders the mic outside its span',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…\\x3c/span>\' + voiceButtonMarkup("data-template-note='],
  // A15-A17 are Sol round 5's counterexamples, and A15 is the one that names the
  // class the four rounds before it were each attacking one instance of.
  //
  //   A15 a string literal that is NEVER RENDERED but contains a covered
  //       opener. No lexer error at all — the scan is correct and the verdict
  //       is still wrong, because `lastIndexOf` takes the LAST covered opener in
  //       the window and a decoy sits after the real one. This is what killed
  //       "the walk reads markup, not JavaScript" as a claim: a string is not
  //       markup either until something concatenates it into the output.
  //   A16 a control keyword separated from its `(` by a comment longer than the
  //       24-character CONTROL_HEAD lookback, so `if` is not seen and the regex
  //       after the `)` is read as division.
  //   A17 a comment between the control-header `)` and the `/`. opensRegex
  //       skipped spaces and tabs only, so it never reached the `)` and never
  //       consulted lastCloseWasControl.
  //
  // A16/A17 are killed by the LEXER fix (measured in isolation before the glue
  // check was added — see the round-5 block in the suite header). The glue check
  // would kill them too, which is why the attribution was measured in two stages
  // rather than read off the final matrix.
  ['A15 an unrendered decoy string carrying a covered opener',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' + String(\'class="raven-grab-field"><span>\').slice(0, 0) + voiceButtonMarkup("data-template-note='],
  ['A16 a comment longer than the control-header lookback hides an uncovered mic',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' + (function () { if /* pad pad pad pad pad pad pad */ (Date) /\'class="raven-grab-field"><span>\'/.test(\'x\'); return \'\'; }()) + voiceButtonMarkup("data-template-note='],
  ['A17 a comment between the control-header ) and the / hides an uncovered mic',
    '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=',
    '<label class="raven-grab-field"><span>Add note…</span><div class="raven-grab-loose">\' + (function () { if (Date) /* g */ /\'class="raven-grab-field"><span>\'/.test(\'x\'); return \'\'; }()) + voiceButtonMarkup("data-template-note=']
];

function apply(source, find, replace) {
  const at = source.indexOf(find);
  if (at === -1) return null;
  if (source.indexOf(find, at + 1) !== -1) return null;
  return source.slice(0, at) + replace + source.slice(at + find.length);
}

let bad = 0;
for (const [name, find, replace] of MUTANTS) {
  const m = apply(original, find, replace);
  if (m === null) { console.error(`ANCHOR MISS or NOT UNIQUE: ${name}`); bad += 1; continue; }
  if (m === original) { console.error(`NO-OP MUTATION: ${name}`); bad += 1; }
}
if (bad) { console.error(`preflight failed (${bad})`); process.exit(1); }
console.log(`preflight ok: ${MUTANTS.length} anchors unique, all mutations change the file`);

function run(overlayPath) {
  const env = { ...process.env, RAVEN_NO_USAGE_LOG: '1' };
  if (overlayPath) env.RAVEN_GRAB_ASSET_PATH = overlayPath;
  const out = spawnSync('node', ['--test', SUITE], { encoding: 'utf8', env, timeout: 300000 });
  const text = (out.stdout || '') + (out.stderr || '');
  // A summary is not a verdict. node --test can print `fail 0` and still exit
  // nonzero — a post-summary crash, an unhandled rejection, a timeout kill — and
  // reading only the parsed numbers grades that as green. Worse for a CONTROL,
  // whose whole job is to prove the suite stayed clean.
  if (out.error) { console.error(`SPAWN ERROR: ${out.error.message}`); process.exit(1); }
  if (out.signal) { console.error(`KILLED BY SIGNAL ${out.signal} — never grade a killed run`); process.exit(1); }
  const num = (re) => Number((text.match(re) || [])[1] ?? NaN);
  const pass = num(/^ℹ pass (\d+)$/m);
  const fail = num(/^ℹ fail (\d+)$/m);
  const cancelled = num(/^ℹ cancelled (\d+)$/m);
  const skipped = num(/^ℹ skipped (\d+)$/m);
  const names = [...new Set([...text.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]))];
  if (![pass, fail, cancelled, skipped].every(Number.isFinite)) {
    console.error('NO SUMMARY — a crash or timeout must never grade as zero red');
    console.error(text.slice(-2000)); process.exit(1);
  }
  if (cancelled !== 0 || skipped !== 0) { console.error(`cancelled=${cancelled} skipped=${skipped}`); process.exit(1); }
  if (pass + fail !== 2) { console.error(`expected exactly 2 tests, saw ${pass + fail}`); process.exit(1); }
  if (names.length !== fail) { console.error(`fail ${fail} disagrees with ${names.length} names`); process.exit(1); }
  // The exit status and the summary have to AGREE. If they disagree, something
  // happened that the summary does not describe, and neither number is trusted.
  if ((out.status === 0) !== (fail === 0)) {
    console.error(`exit status ${out.status} disagrees with fail ${fail}`);
    console.error(text.slice(-2000)); process.exit(1);
  }
  return { pass, fail, names, text, status: out.status };
}

const base = run(null);
if (base.fail !== 0 || base.status !== 0) { console.error('baseline NOT green'); process.exit(1); }
console.log('baseline: 2 pass / 0 fail, exit 0');

let survivors = 0;
let controlsBroken = 0;
let controls = 0;
for (const [name, find, replace, expect] of MUTANTS) {
  const copy = path.join(dir, name.split(' ')[0] + '.js');
  writeFileSync(copy, apply(original, find, replace), 'utf8');
  const parse = spawnSync('node', ['--check', copy], { encoding: 'utf8' });
  if (parse.status !== 0) { console.error(`SYNTAX ERROR in ${name}\n${parse.stderr}`); process.exit(1); }
  const r = run(copy);
  const why = (r.text.match(/AssertionError.*?\n/s) || [''])[0].trim().slice(0, 160);
  const detail = (r.text.match(/^\s+AssertionError[^\n]*\n\s+(.+)$/m) || [, ''])[1] || why;
  if (expect === 'green') {
    // A behaviour-preserving control: red here is a FALSE FAIL, which is the
    // failure mode a red-only matrix structurally cannot see.
    controls += 1;
    if (r.fail !== 0) controlsBroken += 1;
    console.log(`\n${name}\n  control expects 0 red, saw ${r.fail}${r.fail === 0 ? '  ok' : '  *** FALSE FAIL ***'}`);
    if (r.fail) console.log(`    ${detail}`);
    continue;
  }
  if (r.fail === 0) survivors += 1;
  console.log(`\n${name}\n  radius ${r.fail}${r.fail === 0 ? '  *** SURVIVED ***' : ''}`);
  if (r.fail) console.log(`    ${detail}`);
}
const mutants = MUTANTS.length - controls;
console.log(`\nmatrix: ${mutants} mutants, ${mutants - survivors} killed, ${survivors} survived; ${controls} control(s), ${controlsBroken} false-failed`);
process.exit(survivors === 0 && controlsBroken === 0 ? 0 : 2);
