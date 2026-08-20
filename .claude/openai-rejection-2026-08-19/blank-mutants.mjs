// Mutation matrix for the two silent-fallback fixes (get_brand_system blank
// company; generate_design_system unknown base_system).
//
// House rules this harness follows, each of which this repo has been burned by:
//  - mutate dist/, run `node --test <suite>` DIRECTLY. `npm test` is `clean &&
//    tsc`, which clobbers the mutant and grades pristine code.
//  - assert the find-string is UNIQUE before applying; a stale or ambiguous
//    anchor must ABORT, never silently mis-measure.
//  - restore by string equality, and verify it.
//  - grade a DECLARED baseline (tests/pass/fail/skipped/status) first. A
//    relative guard cannot see a baseline that measured nothing.
//  - require the exit STATUS and the summary to agree; `node --test` can print
//    `fail 0` and still exit non-zero.
//  - report failing test NAMES, deduped (node --test prints each ✖ twice).
//  - CONTROLS expected green: a red-only matrix is structurally blind to a
//    false fail.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIST = "dist/index.js";
const SUITE = "test/blank-resolution-refusal.test.mjs";
const BASE = { tests: 9, pass: 9, fail: 0, skipped: 0 };

const MUTANTS = [
  { id: "B1", why: "delete the blank guard entirely - both match phases see the whole registry again",
    find: "var candidates = searchTerm ? registry.systems : [];",
    with: "var candidates = registry.systems;", expect: "red" },
  { id: "B2", why: "revert ONLY the fuzzy loop to registry.systems - the second door of the one rule",
    find: "for (var s of candidates) {", with: "for (var s of registry.systems) {", expect: "red" },
  // B3a and B3b are the SAME line pulled in opposite directions, and they are two
  // mutants rather than one because they redden DIFFERENT sets: a blank company and
  // an unknown company are different problems with different fixes, so a single
  // message for both is a defect whichever message survives.
  { id: "B3a", why: "always emit the UNKNOWN message - a blank company is misdiagnosed as a failed lookup",
    find: `error: searchTerm\n                                ? "No matching design system found for '" + company + "'"`,
    with: `error: true\n                                ? "No matching design system found for '" + company + "'"`,
    expect: "red" },
  { id: "B3b", why: "always emit the BLANK message - a real unknown company is told it passed no name",
    find: `error: searchTerm\n                                ? "No matching design system found for '" + company + "'"`,
    with: `error: false\n                                ? "No matching design system found for '" + company + "'"`,
    expect: "red" },
  { id: "B4", why: "delete the generate_design_system seam refusal - an unknown base is silently swallowed again",
    find: "if (params.base_system && !loadSystem(params.base_system)) {",
    with: "if (false) {", expect: "red" },
  { id: "B5", why: "over-refuse: reject EVERY base_system. A guard that refuses everything must not pass",
    find: "if (params.base_system && !loadSystem(params.base_system)) {",
    with: "if (params.base_system) {", expect: "red" },
  { id: "C1", why: "CONTROL: pure parenthesisation of the guard expression, behaviour-neutral by construction",
    find: "var candidates = searchTerm ? registry.systems : [];",
    with: "var candidates = (searchTerm ? registry.systems : []);", expect: "green" },
];

function run() {
  const r = spawnSync("node", ["--test", SUITE], { encoding: "utf8", env: { ...process.env, RAVEN_NO_USAGE_LOG: "1" } });
  const out = (r.stdout || "") + (r.stderr || "");
  const num = (k) => { const m = out.match(new RegExp("^ℹ " + k + " (\\d+)$", "m")); return m ? Number(m[1]) : null; };
  const red = [...new Set([...out.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  return { tests: num("tests"), pass: num("pass"), fail: num("fail"), skipped: num("skipped"),
           status: r.status, signal: r.signal, error: r.error ? String(r.error) : null, red, out };
}

const pristine = readFileSync(DIST, "utf8");

const b = run();
if (b.error || b.signal !== null) throw new Error(`baseline child died: ${b.error} ${b.signal}`);
if (b.tests !== BASE.tests || b.pass !== BASE.pass || b.fail !== BASE.fail || b.skipped !== BASE.skipped || b.status !== 0)
  throw new Error(`baseline does not match declared ${JSON.stringify(BASE)} status 0 -- measured ${JSON.stringify({ tests: b.tests, pass: b.pass, fail: b.fail, skipped: b.skipped, status: b.status })}`);
console.log(`baseline: ${b.tests} tests / ${b.pass} pass / ${b.fail} fail / ${b.skipped} skipped, status 0`);

// Pre-flight EVERY anchor before running anything: presence and uniqueness are
// answerable without launching a single test, and a dead anchor found 20
// minutes in is the harness failing late.
for (const m of MUTANTS) {
  const n = pristine.split(m.find).length - 1;
  if (n !== 1) throw new Error(`${m.id}: find-string occurs ${n} times in the PRISTINE file (need exactly 1) -- re-anchor it`);
}
console.log(`pre-flight: ${MUTANTS.length} anchors, each unique in the pristine file (some are shared by design)\n`);

let survived = 0, falseFails = 0;
for (const m of MUTANTS) {
  writeFileSync(DIST, pristine.replace(m.find, m.with));
  const r = run();
  writeFileSync(DIST, pristine);
  if (readFileSync(DIST, "utf8") !== pristine) throw new Error(`${m.id}: restore did not reproduce the pristine file`);
  if (r.error || r.signal !== null) throw new Error(`${m.id}: child died: ${r.error} ${r.signal}`);
  const isRed = r.fail > 0 || r.status !== 0;
  const ok = m.expect === "red" ? isRed : !isRed;
  if (!ok) { if (m.expect === "red") survived++; else falseFails++; }
  console.log(`${m.id} ${ok ? (m.expect === "red" ? "KILLED" : "control green") : (m.expect === "red" ? "*** SURVIVED ***" : "*** CONTROL FALSE-FAILED ***")}  radius=${r.red.length}  fail=${r.fail} status=${r.status}`);
  console.log(`    ${m.why}`);
  for (const name of r.red) console.log(`    red: ${name}`);
}

console.log(`\n${MUTANTS.filter(m => m.expect === "red").length} mutants, ${MUTANTS.filter(m => m.expect === "red").length - survived} killed, ${survived} survived; ${MUTANTS.filter(m => m.expect === "green").length} CONTROLS, ${falseFails} false-failed`);
if (survived || falseFails) process.exitCode = 1;
