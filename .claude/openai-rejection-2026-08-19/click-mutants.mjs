// Mutation matrix for test/remote-click-guard.test.mjs (the R2 half of OpenAI's
// 2026-08-19 rejection: annotations that do not match behaviour).
//
// House rules this harness obeys, each of which this repo learned the hard way:
//   * mutate dist/, run `node --test <suite>` DIRECTLY — never `npm test`, whose
//     clean+tsc would clobber the mutant;
//   * assert every find-string is UNIQUE in the PRISTINE file BEFORE spending a
//     run, and `node --check` each mutant before grading it — a mutant that fails
//     to load fails every test for the wrong reason;
//   * grade against a DECLARED baseline (tests/pass/fail/skip), so a suite that
//     silently shortened or skipped cannot print SURVIVED for the wrong reason;
//   * require the exit STATUS and the summary to AGREE;
//   * report deduped failing test NAMES (node --test prints each ✖ twice), anchored
//     on the duration suffix;
//   * carry one behaviour-NEUTRAL control — a red-only matrix is structurally blind
//     to a false fail.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FILE = 'dist/index.js';
const SUITE = 'test/remote-click-guard.test.mjs';
const BASE = { tests: 15, pass: 15, fail: 0, skipped: 0 };

const MUTANTS = [
  { id: 'C1', expect: 'red', why: 'delete the click guard outright',
    find: `if (list[ci] && list[ci].event === "click") {`,
    repl: `if (false && list[ci] && list[ci].event === "click") {` },
  { id: 'C2', expect: 'red', why: 'inspect only the FIRST interaction (a click hidden behind a hover survives)',
    find: `for (var ci = 0; ci < list.length; ci++) {`,
    repl: `for (var ci = 0; ci < Math.min(1, list.length); ci++) {` },
  { id: 'C3', expect: 'red', why: 'over-refuse: refuse EVERY interaction, not just click',
    find: `if (list[ci] && list[ci].event === "click") {`,
    repl: `if (list[ci] && list[ci].event !== "__never__") {` },
  { id: 'C4', expect: 'red', why: 'drop the derived description sentence while keeping the guard',
    find: `args[1] += " On the hosted endpoint click interactions are refused`,
    repl: `args[1] += "".slice(0,0) + ("" && " On the hosted endpoint click interactions are refused` ,
    tail: true },
  { id: 'C5', expect: 'red', why: 'append the derived sentence on the LOCAL build too',
    find: `if (remote && REMOTE_NO_CLICK_TOOLS[toolName] && typeof args[1] === "string") {`,
    repl: `if (REMOTE_NO_CLICK_TOOLS[toolName] && typeof args[1] === "string") {` },
  { id: 'C6', expect: 'red', why: 'PREPEND the derived sentence instead of appending it',
    find: `args[1] += " On the hosted endpoint click interactions are refused (hover and focus still run), so the read-only and idempotent annotations hold.";`,
    repl: `args[1] = "On the hosted endpoint click interactions are refused (hover and focus still run), so the read-only and idempotent annotations hold. " + args[1];` },
  { id: 'CONTROL', expect: 'green', why: 'behaviour-neutral: rename the guard loop variable',
    find: `var list = input[clickParam];`,
    repl: `var list = input[clickParam]; var __unused_control = list.length;` }
];

const pristine = readFileSync(FILE, 'utf8');

// Uniqueness first — cheap, and a dead or ambiguous anchor must ABORT rather than
// silently mis-measure. C4's replacement is hand-built, so it is excluded here.
for (const m of MUTANTS) {
  if (m.tail) continue;
  const n = pristine.split(m.find).length - 1;
  if (n !== 1) { console.error(`ABORT ${m.id}: find-string occurs ${n}× (need exactly 1)`); process.exit(2); }
}

function runSuite() {
  const r = spawnSync(process.execPath, ['--test', SUITE], {
    encoding: 'utf8', env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' }, timeout: 300000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = (k) => { const mm = out.match(new RegExp('^\\u2139 ' + k + ' (\\d+)$', 'm')); return mm ? Number(mm[1]) : null; };
  const names = [...new Set([...out.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((x) => x[1]))]
    .filter((n) => !n.startsWith(SUITE));
  return { out, status: r.status, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'), names };
}

const b = runSuite();
if (b.tests !== BASE.tests || b.pass !== BASE.pass || b.fail !== BASE.fail || b.skipped !== BASE.skipped) {
  console.error(`ABORT: baseline is ${b.tests}/${b.pass}/${b.fail}/${b.skipped}, declared ${BASE.tests}/${BASE.pass}/${BASE.fail}/${BASE.skipped}`);
  process.exit(2);
}
if (b.status !== 0) { console.error(`ABORT: baseline summary is clean but exit status is ${b.status}`); process.exit(2); }
console.log(`baseline: ${b.tests} tests / ${b.pass} pass / ${b.fail} fail / ${b.skipped} skipped, EXIT=0`);

let survived = 0, falseFails = 0;
for (const m of MUTANTS) {
  let mutated;
  if (m.tail) {
    // C4: neutralise the append without deleting the line (keeps the string in the
    // file so nothing else that greps for it is disturbed).
    mutated = pristine.replace(
      `args[1] += " On the hosted endpoint click interactions are refused (hover and focus still run), so the read-only and idempotent annotations hold.";`,
      `args[1] += ("" ? " On the hosted endpoint click interactions are refused (hover and focus still run), so the read-only and idempotent annotations hold." : "");`);
    if (mutated === pristine) { console.error(`ABORT ${m.id}: anchor did not apply`); process.exit(2); }
  } else {
    mutated = pristine.split(m.find).join(m.repl);
  }
  writeFileSync(FILE, mutated);
  const chk = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
  if (chk.status !== 0) { writeFileSync(FILE, pristine); console.error(`ABORT ${m.id}: mutant does not parse\n${chk.stderr}`); process.exit(2); }

  const r = runSuite();
  writeFileSync(FILE, pristine);
  if (readFileSync(FILE, 'utf8') !== pristine) { console.error(`ABORT ${m.id}: restore failed`); process.exit(2); }

  const summaryRed = r.fail > 0;
  const agrees = (summaryRed && r.status !== 0) || (!summaryRed && r.status === 0);
  if (!agrees) { console.error(`ABORT ${m.id}: summary (fail=${r.fail}) and exit status (${r.status}) disagree`); process.exit(2); }
  if (r.tests !== BASE.tests || r.skipped !== BASE.skipped) {
    console.error(`ABORT ${m.id}: mutant run registered ${r.tests} tests / ${r.skipped} skipped, expected ${BASE.tests}/${BASE.skipped}`);
    process.exit(2);
  }

  if (m.expect === 'red') {
    if (!summaryRed) { survived++; console.log(`${m.id} SURVIVED  (${m.why})`); }
    else console.log(`${m.id} killed r=${r.names.length}  ${m.why}\n     ${r.names.join('\n     ')}`);
  } else {
    if (summaryRed) { falseFails++; console.log(`${m.id} FALSE-FAILED r=${r.names.length}  (${m.why})\n     ${r.names.join('\n     ')}`); }
    else console.log(`${m.id} neutral   ${m.why}`);
  }
}

console.log(`\n${MUTANTS.filter((m) => m.expect === 'red').length} mutants, ${MUTANTS.filter((m) => m.expect === 'red').length - survived} killed, ${survived} survived; ${MUTANTS.filter((m) => m.expect === 'green').length} control, ${falseFails} false-failed`);
if (survived || falseFails) process.exitCode = 1;
