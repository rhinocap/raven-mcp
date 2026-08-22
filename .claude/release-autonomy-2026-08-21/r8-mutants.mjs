// Mutation matrix for the round-8 fixes to scripts/detect-release-scope.mjs.
//
// WHAT THIS GRADES, AND WHY IT IS NOT `npm test`. The detector is a standalone
// script the release workflow shells out to; nothing in `npm test` executes it,
// so its two round-8 fixes (P1-1, the whitespace resume input; P1-2, classify a
// resume by CHANGED PATHS rather than by commit SUBJECT) had no test at all and
// therefore no mutant could exist. This file is that suite AND its matrix: it
// declares seven cases, runs them against a pristine copy first, and then runs
// them again under each mutant applied to a COPY of the detector -- the tracked
// file is never written.
//
// Fixtures are real git repositories in a temp dir. `gh` is stubbed to a
// failing binary on PATH, which is safe because every case passes INPUT_BUMP,
// and the detector's own catch only fails closed when the bump is `auto`.
//
// Standing harness rules from this repo's ledger, all applied here:
//   - a clean baseline runs FIRST and the run aborts if it is not green
//   - the expected case count is DECLARED, not pinned relatively, because a
//     pass/fail pair says nothing about how many cases were REGISTERED
//   - every mutant is pre-flighted through `node --check` before anything runs,
//     so a dead anchor or a syntax error aborts in seconds rather than being
//     reported as a survivor
//   - failing case NAMES are printed, never counts -- a count cannot attribute
//   - CONTROLS are behaviour-neutral edits expected to stay GREEN; a red-only
//     matrix is structurally blind to a false fail
//   - process.exitCode = 1 on any unexpected survivor or false fail, so a
//     recorded EXIT=0 carries information about the ANSWER and not merely about
//     the script reaching its last line

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(REPO, "scripts", "detect-release-scope.mjs");
const PRISTINE = readFileSync(SOURCE, "utf8");

const EXPECTED_BASELINE_CASES = 7;

const root = mkdtempSync(join(tmpdir(), "r8-mutants-"));
const bin = join(root, "bin");
mkdirSync(bin);
// A `gh` that always fails. Every case declares INPUT_BUMP, so the detector's
// catch degrades to warn-and-continue rather than exiting -- which is what makes
// these fixtures hermetic (no network, no GitHub auth, no remote).
writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 1\n");
chmodSync(join(bin, "gh"), 0o755);

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
}

// Three fixtures, all built on one base: v2.5.0 tagged over src/index.ts,
// site/changelog.html and CHANGELOG.md.
function buildFixture(name, mutate) {
  const dir = join(root, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "site"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "src", "index.ts"), "a\n");
  writeFileSync(join(dir, "site", "changelog.html"), "c\n");
  writeFileSync(join(dir, "CHANGELOG.md"), "m\n");
  // The detector reads the CURRENT version out of package.json to compute the
  // bump, so a fixture without one dies before any classification happens.
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", version: "2.5.0" }) + "\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "tag", "v2.5.0");
  if (mutate) mutate(dir);
  return dir;
}

// SPOOF is the only fixture that separates content-classification from
// subject-classification: real work in src/, wearing the changelog subject.
const SPOOF = buildFixture("spoof", (dir) => {
  writeFileSync(join(dir, "src", "index.ts"), "a\nreal work\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Update changelog for v2.5.0");
});
const GENUINE = buildFixture("genuine", (dir) => {
  writeFileSync(join(dir, "site", "changelog.html"), "c\nnew entry\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Update changelog for v2.5.0");
});
const EMPTY = buildFixture("empty", null);

let runSeq = 0;
function runDetector(script, cwd, env) {
  const outFile = join(root, `out-${runSeq++}`);
  writeFileSync(outFile, "");
  const res = spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_OUTPUT: outFile,
      INPUT_RESUME_VERSION: "",
      INPUT_BUMP: "",
      ...env,
    },
  });
  const outputs = {};
  for (const line of readFileSync(outFile, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { status: res.status, outputs, stderr: res.stderr, stdout: res.stdout };
}

// Each case asserts either an exit STATUS or a set of outputs. `expect` returns
// null on success or a one-line reason on failure -- the reason is printed, so a
// kill is attributed to an assertion and not merely to a number.
const CASES = [
  {
    name: "a whitespace-only resume input is refused",
    cwd: () => SPOOF,
    env: { INPUT_RESUME_VERSION: "   ", INPUT_BUMP: "major" },
    expect: (r) => (r.status === 1 ? null : `expected exit 1, got ${r.status} with ${JSON.stringify(r.outputs)}`),
  },
  {
    name: "a tab-only resume input is refused",
    cwd: () => SPOOF,
    env: { INPUT_RESUME_VERSION: "\t", INPUT_BUMP: "major" },
    expect: (r) => (r.status === 1 ? null : `expected exit 1, got ${r.status} with ${JSON.stringify(r.outputs)}`),
  },
  {
    name: "a bare v resume input is refused",
    cwd: () => EMPTY,
    env: { INPUT_RESUME_VERSION: "v", INPUT_BUMP: "major" },
    expect: (r) => (r.status === 1 ? null : `expected exit 1, got ${r.status}`),
  },
  {
    // The load-bearing other direction: the refusal must not swallow the
    // ordinary cut. An unset input is the commonest dispatch there is.
    name: "an absent resume input still cuts a release",
    cwd: () => SPOOF,
    env: { INPUT_RESUME_VERSION: "", INPUT_BUMP: "major" },
    expect: (r) =>
      r.status === 0 && r.outputs.released === "true" && r.outputs.version === "3.0.0"
        ? null
        : `expected a 3.0.0 cut, got status ${r.status} ${JSON.stringify(r.outputs)}`,
  },
  {
    name: "a valid resume input resumes the named version",
    cwd: () => EMPTY,
    env: { INPUT_RESUME_VERSION: "v2.5.0", INPUT_BUMP: "major" },
    expect: (r) =>
      r.status === 0 &&
      r.outputs.resume === "true" &&
      r.outputs.explicit_resume === "true" &&
      r.outputs.resume_version === "2.5.0"
        ? null
        : `expected an explicit resume of 2.5.0, got status ${r.status} ${JSON.stringify(r.outputs)}`,
  },
  {
    // THE SPOOF CASE. Real work in src/ carrying the changelog subject must be
    // RELEASED. This is the only case that distinguishes classification by
    // changed path from classification by commit subject.
    name: "work in src wearing the changelog subject is still a cut",
    cwd: () => SPOOF,
    env: { INPUT_BUMP: "major" },
    expect: (r) =>
      r.status === 0 && r.outputs.released === "true" && r.outputs.resume !== "true"
        ? null
        : `a spoofed subject swallowed real work: status ${r.status} ${JSON.stringify(r.outputs)}`,
  },
  {
    name: "a genuine changelog-only commit is an automatic resume",
    cwd: () => GENUINE,
    env: { INPUT_BUMP: "major" },
    expect: (r) =>
      r.status === 0 &&
      r.outputs.resume === "true" &&
      r.outputs.explicit_resume === "false" &&
      r.outputs.resume_version === "2.5.0"
        ? null
        : `expected an automatic resume, got status ${r.status} ${JSON.stringify(r.outputs)}`,
  },
];

const SUBJECT_REVERT = `const onlyChangelog =
  commits.length > 0 &&
  Boolean(lastTag) &&
  commits.every((c) => c.replace(/^\\S+\\s/, "") === \`Update changelog for \${lastTag}\`);`;

const CHANGED_PATH_BLOCK = `const RESUME_SAFE_PATHS = new Set(["site/changelog.html", "CHANGELOG.md"]);
const changedSinceTag = lastTag
  ? sh(\`git diff --name-only \${lastTag} HEAD\`).split("\\n").filter(Boolean)
  : [];
const onlyChangelog =
  commits.length > 0 &&
  Boolean(lastTag) &&
  changedSinceTag.every((p) => RESUME_SAFE_PATHS.has(p));`;

const MUTANTS = [
  {
    id: "D1",
    why: "P1-1: revert the presence test to the TRIMMED value (round 7's incomplete fix)",
    find: "if (rawInput) {",
    replace: "if (rawResume) {",
    expect: "red",
  },
  {
    id: "D2",
    why: "P1-2: revert to classifying a resume by commit SUBJECT equality",
    find: CHANGED_PATH_BLOCK,
    replace: SUBJECT_REVERT,
    expect: "red",
  },
  {
    id: "D3",
    why: "CONTROL: behaviour-neutral rewrite of the commit-count test",
    find: "  commits.length > 0 &&\n  Boolean(lastTag) &&",
    replace: "  commits.length !== 0 &&\n  lastTag !== \"\" &&",
    expect: "green",
  },
  {
    id: "D4",
    why: "CONTROL: behaviour-neutral rewrite of the raw-input default",
    find: 'const rawInput = process.env.INPUT_RESUME_VERSION || "";',
    replace: 'const rawInput = process.env.INPUT_RESUME_VERSION ?? "";',
    expect: "green",
  },
];

function runSuite(script) {
  const reds = [];
  for (const c of CASES) {
    let reason;
    try {
      reason = c.expect(runDetector(script, c.cwd(), c.env));
    } catch (err) {
      reason = `threw: ${err.message}`;
    }
    if (reason) reds.push({ name: c.name, reason });
  }
  return reds;
}

// PRE-FLIGHT. Presence, uniqueness and syntax are all answerable without
// running a single case, and a dead find-string must abort rather than be
// reported as a survivor. A find-string mutant dies the moment its target line
// is edited, and that has happened seven times in this repo's history.
const scripts = new Map();
for (const m of MUTANTS) {
  const count = PRISTINE.split(m.find).length - 1;
  if (count !== 1) {
    console.error(`✗ ${m.id}: find-string matches ${count} times, expected exactly 1. Re-anchor it.`);
    process.exit(1);
  }
  const path = join(root, `detector-${m.id}.mjs`);
  writeFileSync(path, PRISTINE.replace(m.find, m.replace));
  const check = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (check.status !== 0) {
    console.error(`✗ ${m.id}: mutant does not parse.\n${check.stderr}`);
    process.exit(1);
  }
  scripts.set(m.id, path);
}
console.log(`pre-flight: ${MUTANTS.length} mutants anchor uniquely and parse`);

// BASELINE FIRST. A matrix graded against a baseline that measured nothing
// prints SURVIVED for every mutant and is byte-identical to a real clean run.
const basePath = join(root, "detector-pristine.mjs");
writeFileSync(basePath, PRISTINE);
if (CASES.length !== EXPECTED_BASELINE_CASES) {
  console.error(`✗ baseline registers ${CASES.length} cases, declared ${EXPECTED_BASELINE_CASES}.`);
  process.exit(1);
}
const baseReds = runSuite(basePath);
if (baseReds.length) {
  console.error("✗ baseline is not green — refusing to grade any mutant:");
  for (const r of baseReds) console.error(`    ${r.name}: ${r.reason}`);
  process.exit(1);
}
console.log(`baseline: ${CASES.length}/${CASES.length} green\n`);

let survived = 0;
let falseFails = 0;
for (const m of MUTANTS) {
  const reds = runSuite(scripts.get(m.id));
  const label = m.expect === "green" ? "CONTROL" : "mutant";
  if (m.expect === "green") {
    if (reds.length) {
      falseFails++;
      console.log(`✗ ${m.id} ${label} FALSE-FAILED (${reds.length} red) — ${m.why}`);
      for (const r of reds) console.log(`      ${r.name}\n        ${r.reason}`);
    } else {
      console.log(`✓ ${m.id} ${label} green — ${m.why}`);
    }
    continue;
  }
  if (!reds.length) {
    survived++;
    console.log(`✗ ${m.id} SURVIVED — ${m.why}`);
  } else {
    console.log(`✓ ${m.id} killed, radius ${reds.length} — ${m.why}`);
    for (const r of reds) console.log(`      ${r.name}\n        ${r.reason}`);
  }
}

console.log(
  `\n${MUTANTS.filter((m) => m.expect === "red").length} mutants, ` +
    `${MUTANTS.filter((m) => m.expect === "red").length - survived} killed, ${survived} survived; ` +
    `${MUTANTS.filter((m) => m.expect === "green").length} CONTROLS, ${falseFails} false-failed`,
);
rmSync(root, { recursive: true, force: true });
if (survived || falseFails) process.exitCode = 1;
