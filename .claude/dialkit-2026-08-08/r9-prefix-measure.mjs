// Measures the PRE-FIX behaviour claimed in each round-9 mutant comment.
// A mutation claim is falsifiable exactly like an assertion (round 6's lesson),
// so "PRE-FIX: 2 pass / 0 fail" is measured here rather than reasoned about.
//
// Each entry reverts ONE round-9 fix in a COPY of the suite (written into the
// same directory, so its relative dist/ import still resolves) and runs the
// mutants that fix owns. A revert reproduces the round-8 DECISION, not its
// source text — what is being measured is what the old rule ANSWERED, and
// transcribing forty lines of deleted code would add its own failure modes.
//
// Sol round 9 (P2) against the round-8 harness: its `run()` read only the
// parsed summary and ignored `status`, `signal` and `error`, so a child that
// printed a summary and then died — an unhandled rejection after the last test,
// a timeout kill, a post-summary crash — was graded as a measurement. Fixed
// here: the exit status and the summary must AGREE, and a killed or unspawnable
// run is never a result.
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUITE = 'test/grab-overlay-voice-alignment.test.mjs';
const PROBE = 'test/__r9-prefix-probe.test.mjs';
const suite = readFileSync(SUITE, 'utf8');
const overlay = readFileSync('browser/raven-grab.js', 'utf8');
const dir = mkdtempSync(path.join(tmpdir(), 'r9-prefix-'));
const ROW = '<label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=';

const mutate = (repl) => {
  const at = overlay.indexOf(ROW);
  if (at === -1 || overlay.indexOf(ROW, at + 1) !== -1) throw new Error('row anchor');
  return overlay.slice(0, at) + repl + overlay.slice(at + ROW.length);
};

// [label, [[find, replace], …]] — the round-9 fix, undone.
const REVERTS = {
  // Fix 1. The class question goes back to round 8's regex over the whole tag
  // text: a real `class` attribute name (`\sclass="`) and the token bounded
  // inside the value. `parseStartTag` still finds the tag — what is reverted is
  // WHO answers "does this element carry this class", which is the finding.
  tokenizer: [[
    '        if (!hasClass(tag.attrs, container.cls)) continue;',
    '        if (!new RegExp(\'\\\\sclass="[^"<>]*(?<![\\\\w-])\' + container.cls + \'(?![\\\\w-])[^"<>]*"\')\n          .test(text.slice(at, tag.end))) continue;'
  ]],
  // Fix 2. Round 8 jumped to the raw-text closer WITHOUT pushing the element.
  rawtext: [[
    '          stack.push(name);\n          tag.lastIndex = close;',
    '          tag.lastIndex = close;'
  ]],
  // Fix 3. Round 8 dropped `<!--` and let every other `<!` / `<?` form through,
  // so a CDATA section's contents were parsed as markup.
  bogus: [[
    `        if (raw[k + 1] === '!' || raw[k + 1] === '?'
          || (raw[k + 1] === '/' && !/[a-zA-Z]/.test(raw[k + 2] || ''))) {
          const end = raw.indexOf('>', k + 1);
          k = end === -1 ? raw.length : end + 1;
          continue;
        }`,
    '        // round-8: no bogus-comment handling'
  ]],
  // Fix 4. Round 8 stripped a grouping paren by ADJACENCY — the `(` had to sit
  // immediately before the identifier — so `(0, f)(x)` was not a call at all.
  grouping: [[
    `      let depth = 0;
      let p = f;
      for (; p >= 0; p -= 1) {
        if (view.glue[p] === ')') depth += 1;
        else if (view.glue[p] === '(') { depth -= 1; if (depth === 0) break; }
      }
      if (p < 0 || depth !== 0 || p > identStart) break;`,
    `      let p = identStart - 1;
      while (p >= 0 && /\\s/.test(view.glue[p])) p -= 1;
      if (p < 0 || view.glue[p] !== '(') break;`
  ]],
  // Fix 5. Rounds 7 and 8 both stopped the backwards walk after 20,000 SOURCE
  // characters. Round 7 stopped silently and reported the row uncovered; round 8
  // stopped loudly and reported the scan capped. Both are RED on correct code,
  // which is the finding, so the minimal revert restores the bound itself.
  cap: [[
    '    while (i > 0 && emitted < REACH) { i -= 1; if (view.content[i]) emitted += 1; }',
    '    const floor = Math.max(0, micAt - 20000);\n    while (i > floor && emitted < REACH) { i -= 1; if (view.content[i]) emitted += 1; }'
  ]]
};

function revert(src, key) {
  let out = src;
  for (const [find, repl] of REVERTS[key]) {
    const at = out.indexOf(find);
    if (at === -1) throw new Error(`revert anchor miss: ${key}`);
    if (out.indexOf(find, at + 1) !== -1) throw new Error(`revert anchor not unique: ${key}`);
    out = out.slice(0, at) + repl + out.slice(at + find.length);
  }
  if (out === src) throw new Error(`no-op revert: ${key}`);
  return out;
}

function run(suiteSrc, assetPath) {
  writeFileSync(PROBE, suiteSrc, 'utf8');
  const check = spawnSync('node', ['--check', PROBE], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`reverted suite does not parse\n${check.stderr}`);
  const out = spawnSync('node', ['--test', PROBE], {
    encoding: 'utf8',
    timeout: 300000,
    env: { ...process.env, RAVEN_GRAB_ASSET_PATH: assetPath, RAVEN_NO_USAGE_LOG: '1' }
  });
  // Sol round 9 (P2). None of these three is visible in the summary, and each
  // one means the run did not finish the way the numbers claim it did.
  if (out.error) throw new Error(`spawn error: ${out.error.message}`);
  if (out.signal) throw new Error(`killed by ${out.signal} — never grade a killed run`);
  const text = (out.stdout || '') + (out.stderr || '');
  const num = (re) => Number((text.match(re) || [])[1] ?? NaN);
  const pass = num(/^ℹ pass (\d+)$/m);
  const fail = num(/^ℹ fail (\d+)$/m);
  const skipped = num(/^ℹ skipped (\d+)$/m);
  const cancelled = num(/^ℹ cancelled (\d+)$/m);
  const ms = num(/^ℹ duration_ms ([\d.]+)$/m);
  if (![pass, fail, skipped, cancelled].every(Number.isFinite)) {
    console.error(text.slice(-1500));
    throw new Error('no summary — never grade a crash as a result');
  }
  if (skipped !== 0) throw new Error(`skipped=${skipped} — the probe gate fired, nothing was measured`);
  if (cancelled !== 0) throw new Error(`cancelled=${cancelled}`);
  if (pass + fail !== 2) throw new Error(`expected exactly 2 tests, saw ${pass + fail}`);
  // The exit status and the summary have to agree, or something happened that
  // the summary does not describe and neither number is trusted.
  if ((out.status === 0) !== (fail === 0)) {
    console.error(text.slice(-1500));
    throw new Error(`exit status ${out.status} disagrees with fail ${fail}`);
  }
  // The ASSERTION LINE, not the line after it — two runs can be red for
  // different reasons and the count cannot tell them apart.
  const detail = (text.match(/AssertionError \[ERR_ASSERTION\]: (.+)/) || [, ''])[1] || '';
  return { pass, fail, ms, detail: detail.trim().slice(0, 76) };
}

const CASES = [
  ['A35 attr text  ', 'tokenizer', mutate(`<div class="raven-grab-loose" title=\\' class="raven-grab-field"\\'><span>Add note…' + voiceButtonMarkup("data-template-note=`)],
  ['A36 dup class  ', 'tokenizer', mutate('<label class="raven-grab-loose" class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A37 CLASS =    ', 'tokenizer', mutate('<label CLASS = "raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A41 single-quot', 'tokenizer', mutate(`<label class=\\'raven-grab-field\\'><span>Add note…' + voiceButtonMarkup("data-template-note=`)],
  ['A42 unquoted   ', 'tokenizer', mutate('<label class=raven-grab-field><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A38 (0, f)(x)  ', 'grouping', mutate('<div class="raven-grab-loose">\' + (0, voiceButtonMarkup)("data-extra-note", "extra") + \'</div><label class="raven-grab-field"><span>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A39 CDATA      ', 'bogus', mutate('<div class="raven-grab-loose"><![CDATA[ <label class="raven-grab-field"><span> ]]>Add note…\' + voiceButtonMarkup("data-template-note=')],
  ['A40 script     ', 'rawtext', mutate('<label class="raven-grab-field"><span>Add note…<script></script>\' + voiceButtonMarkup("data-template-note=')],
  ['A34 dead source', 'cap', mutate(`<label class="raven-grab-field"><span>Add note…' + /*${'x'.repeat(20001)}*/ voiceButtonMarkup("data-template-note=`)]
];

try {
  const clean = run(suite, path.resolve('browser/raven-grab.js'));
  console.log(`pristine suite, pristine overlay: ${clean.pass} pass / ${clean.fail} fail`);
  if (clean.fail !== 0) throw new Error('baseline not green — nothing below is measurable');
  for (const [label, key, mutantSrc] of CASES) {
    const asset = path.join(dir, label.split(' ')[0] + '.js');
    writeFileSync(asset, mutantSrc, 'utf8');
    const parse = spawnSync('node', ['--check', asset], { encoding: 'utf8' });
    if (parse.status !== 0) throw new Error(`syntax error in ${label}\n${parse.stderr}`);
    const before = run(revert(suite, key), asset);
    const after = run(suite, asset);
    console.log(`${label}  PRE-FIX  ${before.pass}p/${before.fail}f ${String(Math.round(before.ms)).padStart(5)}ms  ${before.detail ? `[${before.detail}]` : ''}`);
    console.log(`${' '.repeat(label.length)}  POST-FIX ${after.pass}p/${after.fail}f ${String(Math.round(after.ms)).padStart(5)}ms  ${after.detail ? `[${after.detail}]` : ''}`);
  }
} finally {
  rmSync(PROBE, { force: true });
}
