// Mutation matrix for test/remote-click-guard.test.mjs (the R2 half of OpenAI's
// 2026-08-19 rejection: annotations that do not match behaviour).
//
// RE-AUTHORED WHOLE on 2026-08-20, not extended. The suite it grades stopped being
// about the hosted CLICK guard: audit_url's `url` is in REMOTE_ARG_GUARDS now, the arg
// guard answers first, and the click guard has NO REACHABLE TRIGGER on the hosted
// build (REMOTE_NO_CLICK_TOOLS has exactly one member and it is audit_url). Its six
// mutants would all read SURVIVED -- correctly, and uselessly. Carrying them forward
// would have printed a matrix measuring a mechanism nothing can reach. A matrix
// measures the mechanisms it NAMES; renaming the mechanism means re-authoring it.
//
// Both DIRECTIONS are covered on purpose. D1/D2/D5/D6/D7/D8 are under-refusal (the
// decline, its sentence or its annotations go missing); D3/D9 are OVER-refusal (the
// decline leaks to another tool, or to the local build). A matrix pulling only one way
// passes a "fix" that simply refuses everything.
//
// House rules this harness obeys, each of which this repo learned the hard way:
//   * mutate dist/, run `node --test <suite>` DIRECTLY -- never `npm test`, whose
//     clean+tsc would clobber the mutant;
//   * assert every find-string is UNIQUE in the PRISTINE file BEFORE spending a
//     run, and `node --check` each mutant before grading it -- a mutant that fails
//     to load fails every test for the wrong reason;
//   * grade against a DECLARED baseline (tests/pass/fail/skip), so a suite that
//     silently shortened or skipped cannot print SURVIVED for the wrong reason;
//   * require the exit STATUS and the summary to AGREE;
//   * report deduped failing test NAMES (node --test prints each pass twice), anchored
//     on the duration suffix;
//   * carry behaviour-NEUTRAL controls -- a red-only matrix is structurally blind
//     to a false fail.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FILE = 'dist/index.js';
const SUITE = 'test/remote-click-guard.test.mjs';
const BASE = { tests: 17, pass: 17, fail: 0, skipped: 0 };

const MUTANTS = [
  { id: 'D1', expect: 'red', why: 'delete audit_url from REMOTE_ARG_GUARDS entirely (the whole mechanism)',
    find: `audit_url: { params: ["url"], message: "audit_url is disabled`,
    repl: `audit_url__disabled_by_mutant: { params: ["url"], message: "audit_url is disabled` },

  { id: 'D2', expect: 'red', why: 'keep the table entry (so annotations and description still derive) but make the WRAPPER never return the decline',
    find: `if (gv !== undefined && gv !== null) {`,
    repl: `if (false && gv !== undefined && gv !== null) {` },

  { id: 'D3', expect: 'red', why: 'OVER-REFUSE per tool: apply audit_url\'s guard to every tool',
    find: `if (guard && input) {`,
    repl: `if ((guard = guard || REMOTE_ARG_GUARDS["audit_url"]) && input) {` },

  { id: 'D5', expect: 'red', why: 'drop the derived description sentence while keeping the guard',
    find: `args[1] += " " + REMOTE_ARG_GUARDS[toolName].message;`,
    repl: `args[1] += "";` },

  { id: 'D6', expect: 'red', why: 'hand-write the sentence instead of reading the table (the drift this rejection was about)',
    find: `args[1] += " " + REMOTE_ARG_GUARDS[toolName].message;`,
    repl: `args[1] += " audit_url is disabled on the hosted (remote) endpoint.";` },

  { id: 'D4', expect: 'red', why: 'OVER-REFUSE per surface: append the hosted sentence on the LOCAL build too',
    find: `if (remote && REMOTE_ARG_GUARDS[toolName] && typeof args[1] === "string") {`,
    repl: `if (REMOTE_ARG_GUARDS[toolName] && typeof args[1] === "string") {` },

  { id: 'D7', expect: 'red', why: 'un-derive the interaction hints: publish read-only:false for a tool that can only decline',
    find: `return !(remote && remoteBlocksNetwork(toolName));`,
    repl: `return !(false && remoteBlocksNetwork(toolName));` },

  { id: 'D8', expect: 'red', why: 'un-derive openWorldHint: keep advertising the open web on a surface that cannot reach it',
    find: `&& !(remote && remoteBlocksNetwork(toolName));`,
    repl: `&& true;` },

  { id: 'D9', expect: 'red', why: 'OVER-REFUSE the derivation: make remoteBlocksNetwork true everywhere, so the LOCAL build claims read-only too',
    find: `return !!guard && guard.params.indexOf("url") !== -1;`,
    repl: `return true;` },

  { id: 'CONTROL-A', expect: 'green', why: 'behaviour-neutral: bind the guard message to a local before returning it',
    find: `return { content: [{ type: "text", text: guard.message }], isError: true };`,
    repl: `var __m = guard.message; return { content: [{ type: "text", text: __m }], isError: true };` },

  { id: 'CONTROL-B', expect: 'green', why: 'behaviour-neutral: restate remoteBlocksNetwork without changing its answer',
    find: `return !!guard && guard.params.indexOf("url") !== -1;`,
    repl: `return guard ? guard.params.indexOf("url") >= 0 : false;` }
];

const pristine = readFileSync(FILE, 'utf8');

// Uniqueness first — cheap, and a dead or ambiguous anchor must ABORT rather than
// silently mis-measure. D5/D6 deliberately SHARE an anchor, as do D9/CONTROL-B:
// uniqueness is a property of the anchor, not of the mutant count.
for (const m of MUTANTS) {
  if (m.tail) continue;
  const n = pristine.split(m.find).length - 1;
  if (n !== 1) { console.error(`ABORT ${m.id}: find-string occurs ${n}× (need exactly 1)`); process.exit(2); }
}

// --test-force-exit is REQUIRED here and the reason is specific, because this repo's
// ledger warns against it in general (it once truncated a suite whose browser tests
// registered after a top-level-await probe, reporting them as passing-by-absence).
//
// That hazard cannot occur in this file: all 17 tests are registered SYNCHRONOUSLY at
// module top level (12 `test(` calls plus a 5-case loop), there is no top-level await,
// and the DECLARED baseline below asserts the registered count, so a truncated run
// aborts rather than grading.
//
// What force-exit buys: every under-refusal mutant lets a HOSTED audit_url call reach
// the browser path, `setRemoteRuntime()` is a one-way per-process latch, and the remote
// playwright-core/@sparticuz stack leaks an egress-proxy handle that keeps the process
// alive AFTER the last test reports. Measured on D1: all 16 tests print, 9 of them ✖,
// and then node never exits -- no summary line, so the harness could only ever abort
// with "summary (fail=null) and exit status disagree". The assertions were doing their
// job and the instrument could not read them.
function runSuite() {
  const r = spawnSync(process.execPath, ['--test', '--test-force-exit', SUITE], {
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
  {
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
