// Measures the PRE-FIX behaviour claimed in each round-8 mutant comment.
// A mutation claim is falsifiable exactly like an assertion (round 6's lesson),
// so "PRE-FIX: 2 pass / 0 fail" is measured here rather than reasoned about.
//
// Each entry reverts ONE round-8 fix in a COPY of the suite (same directory, so
// its relative dist/ import still resolves) and runs the mutants that fix owns.
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUITE = 'test/grab-overlay-voice-alignment.test.mjs';
const PROBE = 'test/__r8-prefix-probe.test.mjs';
const suite = readFileSync(SUITE, 'utf8');
const overlay = readFileSync('browser/raven-grab.js', 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'r8-prefix-'));
const ROW = '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=';

const mutate = (repl) => {
  const at = overlay.indexOf(ROW);
  if (at === -1 || overlay.indexOf(ROW, at + 1) !== -1) throw new Error('row anchor');
  return overlay.slice(0, at) + repl + overlay.slice(at + ROW.length);
};

// [label, find, replace] — the round-8 fix, undone.
const REVERTS = {
  opener: [
    `  const COVERED = [
    coveredBy('raven-grab-feedback-field', '<span>'),
    coveredBy('raven-grab-field', '<span>'),
    coveredBy('raven-grab-section-heading', '')
  ];`,
    `  const COVERED = [
    /<[a-zA-Z][\\w-]*(?=[\\s>])[^<>]*\\bclass="raven-grab-feedback-field"[^<>]*><span>/g,
    /<[a-zA-Z][\\w-]*(?=[\\s>])[^<>]*\\bclass="raven-grab-field"[^<>]*><span>/g,
    /<[a-zA-Z][\\w-]*(?=[\\s>])[^<>]*\\bclass="raven-grab-section-heading"[^<>]*>/g
  ];`],
  selfClosing: [
    "      } else if (!selfClosing(hit[3]) && !VOID_TAGS.has(name)) {",
    "      } else if (!hit[3].trim().endsWith('/') && !VOID_TAGS.has(name)) {"],
  tagState: [
    `      if (inTag) {
        if (quote) { if (raw[k] === quote) quote = ''; }
        else if (raw[k] === '"' || raw[k] === "'") quote = raw[k];
        else if (raw[k] === '>') inTag = false;
      } else if (raw[k] === '<' && /[a-zA-Z!/?]/.test(raw[k + 1] || '')) {
        inTag = true;
      }`,
    `      if (raw[k] === '<') inTag = true;
      else if (raw[k] === '>') inTag = false;`],
  grouping: [
    "      if (view.glue[f] !== ')' || p < 0 || view.glue[p] !== '(') break;",
    "      if (true) break;"],
  cap: [
    "    return { start: i, capped: emitted < REACH && i > 0 };",
    "    return { start: i, capped: false };"]
};

function revert(src, key) {
  const [find, repl] = REVERTS[key];
  const at = src.indexOf(find);
  if (at === -1) throw new Error(`revert anchor miss: ${key}`);
  if (src.indexOf(find, at + 1) !== -1) throw new Error(`revert anchor not unique: ${key}`);
  return src.slice(0, at) + repl + src.slice(at + find.length);
}

function run(suiteSrc, assetPath) {
  writeFileSync(PROBE, suiteSrc, 'utf8');
  const out = spawnSync('node', ['--test', PROBE], {
    encoding: 'utf8',
    env: { ...process.env, RAVEN_GRAB_ASSET_PATH: assetPath, RAVEN_NO_USAGE_LOG: '1' }
  });
  const text = (out.stdout || '') + (out.stderr || '');
  const num = (re) => Number((text.match(re) || [])[1] ?? NaN);
  const pass = num(/^ℹ pass (\d+)$/m);
  const fail = num(/^ℹ fail (\d+)$/m);
  const skipped = num(/^ℹ skipped (\d+)$/m);
  if (![pass, fail, skipped].every(Number.isFinite)) {
    console.error(text.slice(-1500));
    throw new Error('no summary — never grade a crash as a result');
  }
  if (skipped !== 0) throw new Error(`skipped=${skipped} — the probe gate fired, nothing was measured`);
  // The ASSERTION LINE, not the line after it: A34 is red before and after the
  // fix and both messages name the same source line, so printing the path would
  // show the two runs as identical when the whole finding is that the author is
  // now told something different.
  const detail = (text.match(/AssertionError \[ERR_ASSERTION\]: (.+)/) || [, ''])[1] || '';
  return { pass, fail, detail: detail.trim().slice(0, 72) };
}

const CASES = [
  ['A28 data-class', 'opener', mutate('<label data-class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A29 class list ', 'opener', mutate('<label class="raven-grab-field extra"><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A30 unq. slash ', 'selfClosing', mutate('<label class="raven-grab-field"><span>Add note…<em style=display:block;width:100px data-x=y/>\' + voiceButtonMarkup("data-template-note=')],
  ['A31 bare <     ', 'tagState', mutate('<div class="raven-grab-loose">Add note… 1 < 2 <!-- <label class="raven-grab-field"><span> -->\' + voiceButtonMarkup("data-template-note=')],
  ['A32 (f)(x)     ', 'grouping', mutate('<label class="raven-grab-field"><span>Add note…\' + (voiceButtonMarkup)("data-template-note=')],
  ['A33 9th (f)(x) ', 'grouping', mutate('<div class="raven-grab-loose">\' + (voiceButtonMarkup)("data-extra-note", "extra") + \'</div><label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A34 dead source', 'cap', mutate(`<label class="raven-grab-field"><span>Add note…' + /*${'x'.repeat(20001)}*/ voiceButtonMarkup("data-template-note=`)]
];

try {
  const clean = run(suite, path.resolve('browser/raven-grab.js'));
  console.log(`pristine suite, pristine overlay: ${clean.pass} pass / ${clean.fail} fail`);
  if (clean.fail !== 0) throw new Error('baseline not green — nothing below is measurable');
  for (const [label, key, mutantSrc] of CASES) {
    const asset = path.join(dir, label.split(' ')[0] + '.js');
    writeFileSync(asset, mutantSrc, 'utf8');
    const check = spawnSync('node', ['--check', asset], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`syntax error in ${label}\n${check.stderr}`);
    const before = run(revert(suite, key), asset);
    const after = run(suite, asset);
    console.log(`${label}  PRE-FIX ${before.pass}p/${before.fail}f  ${before.detail ? `[${before.detail}]` : ''}`);
    console.log(`${' '.repeat(label.length)}  POST-FIX ${after.pass}p/${after.fail}f  ${after.detail ? `[${after.detail}]` : ''}`);
  }
} finally {
  rmSync(PROBE, { force: true });
}
