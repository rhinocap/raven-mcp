import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compareScript = path.join(rootDir, "bench", "compare.mjs");

const manifest = [
  { id: "alpha-seeded", family: "alpha", expected: { collection: "findings" } },
  { id: "alpha-clean", family: "alpha", expected: "clean" },
  { id: "beta-seeded", family: "beta", expected: { collection: "findings" } },
  { id: "beta-clean", family: "beta", expected: "clean" },
];

const ravenResults = {
  generated_with: "fixture-commit",
  bench_date: "2026-07-18",
  cases: [
    { id: "alpha-seeded", family: "alpha", expected: "seeded", outcome: "TP", fp_count: 0 },
    { id: "alpha-clean", family: "alpha", expected: "clean", outcome: "TN", fp_count: 0 },
    { id: "beta-seeded", family: "beta", expected: "seeded", outcome: "FN", fp_count: 0 },
    { id: "beta-clean", family: "beta", expected: "clean", outcome: "FP-control", fp_count: 2 },
  ],
};

const validExternal = {
  tool: "fixture-tool",
  version: "1.2.3",
  graded_by: "Test Grader",
  graded_at: "2026-07-18",
  notes: "Raw output: /tmp/fixture-tool-output.txt",
  cases: [
    { id: "alpha-seeded", detected: true, evidence: "Flagged alpha." },
    { id: "alpha-clean", detected: true, evidence: "Flagged a clean control." },
    { id: "beta-seeded", detected: false, evidence: "No actionable finding." },
    { id: "beta-clean", detected: false, evidence: "No actionable finding." },
  ],
};

async function makeFixture(externalName = "fixture-tool.json", externalData = validExternal, results = ravenResults) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "raven-bench-compare-"));
  const benchDir = path.join(fixtureRoot, "bench");
  await mkdir(path.join(benchDir, "corpus"), { recursive: true });
  await mkdir(path.join(benchDir, "external"), { recursive: true });
  await writeFile(path.join(benchDir, "corpus", "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(benchDir, "results.json"), JSON.stringify(results, null, 2));
  if (externalName) {
    await writeFile(path.join(benchDir, "external", externalName), JSON.stringify(externalData, null, 2));
  }
  return { fixtureRoot, benchDir };
}

async function writeExternal(benchDir, file, data) {
  await writeFile(path.join(benchDir, "external", file), JSON.stringify(data, null, 2));
}

async function comparisonExists(benchDir) {
  try {
    await access(path.join(benchDir, "COMPARISON.md"));
    return true;
  } catch {
    return false;
  }
}

function runCompare(benchDir) {
  return spawnSync(process.execPath, [compareScript, "--dir", benchDir], {
    cwd: rootDir,
    encoding: "utf8",
  });
}

test("scores Raven and a valid external tool by family and deterministically", async (t) => {
  const fixture = await makeFixture("fixture-tool.json", validExternal);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const first = runCompare(fixture.benchDir);
  assert.equal(first.status, 0, first.stderr);
  const firstOutput = await readFile(path.join(fixture.benchDir, "COMPARISON.md"), "utf8");
  assert.match(firstOutput, /BENCH_DATE: 2026-07-18/);
  assert.match(firstOutput, /Raven clean cases flagged/);
  assert.match(firstOutput, /Raven unexecuted/);
  assert.match(firstOutput, /\| alpha \| 1\/1 \(100\.0%\) \| 0 \| 0 \| 1\/1 \(100\.0%\) \| 1 \|/);
  assert.match(firstOutput, /\| beta \| 0\/1 \(0\.0%\) \| 1 \| 0 \| 0\/1 \(0\.0%\) \| 0 \|/);
  assert.match(firstOutput, /\| OVERALL \| 1\/2 \(50\.0%\) \| 1 \| 0 \| 1\/2 \(50\.0%\) \| 1 \|/);
  assert.match(firstOutput, /Raven finding-level FPs incl\. seeded pages: 2/);
  assert.match(firstOutput, /human-graded self-reports.*cannot verify/i);
  assert.match(firstOutput, /not a general head-to-head product comparison/i);
  assert.match(firstOutput, /Test Grader/);
  assert.match(firstOutput, /\/tmp\/fixture-tool-output\.txt/);

  const second = runCompare(fixture.benchDir);
  assert.equal(second.status, 0, second.stderr);
  const secondOutput = await readFile(path.join(fixture.benchDir, "COMPARISON.md"), "utf8");
  assert.equal(secondOutput, firstOutput);
});

test("rejects an external result with a missing case and names the file", async (t) => {
  const invalid = { ...validExternal, cases: validExternal.cases.slice(0, -1) };
  const fixture = await makeFixture("missing-case.json", invalid);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing-case\.json/);
  assert.match(result.stderr, /missing case id: beta-clean/);
});

test("rejects null detected values with a pointer to the grading README", async (t) => {
  const nullTemplate = {
    ...validExternal,
    tool: "example-tool",
    cases: validExternal.cases.map((entry) => ({ ...entry, detected: null })),
  };
  const fixture = await makeFixture("null-template.json", nullTemplate);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /null-template\.json/);
  assert.match(result.stderr, /bench\/external\/README\.md/);
});

test("rejects a seeded case with a clean-only outcome", async (t) => {
  const invalidResults = structuredClone(ravenResults);
  invalidResults.cases[0].outcome = "TN";
  const fixture = await makeFixture(null, null, invalidResults);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /results\.json/);
  assert.match(result.stderr, /alpha-seeded/);
  assert.match(result.stderr, /seeded case.*TN/i);
});

test("rejects FP-control with fp_count zero", async (t) => {
  const invalidResults = structuredClone(ravenResults);
  invalidResults.cases[3].fp_count = 0;
  const fixture = await makeFixture(null, null, invalidResults);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /results\.json/);
  assert.match(result.stderr, /beta-clean/);
  assert.match(result.stderr, /FP-control.*fp_count.*at least 1/i);
});

test("rejects UNEXECUTED results without writing COMPARISON.md", async (t) => {
  const incompleteResults = structuredClone(ravenResults);
  incompleteResults.cases[0].outcome = "UNEXECUTED";
  incompleteResults.cases[0].error = "browser unavailable";
  const fixture = await makeFixture(null, null, incompleteResults);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNEXECUTED/);
  assert.match(result.stderr, /alpha-seeded/);
  assert.equal(await comparisonExists(fixture.benchDir), false);
});

test("rejects duplicate normalized external tool names", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));
  await writeExternal(fixture.benchDir, "duplicate.json", {
    ...validExternal,
    tool: "\u200bFIXTURE-TOOL\u200e",
  });

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate normalized tool name/i);
  assert.match(result.stderr, /duplicate\.json/);
});

test("rejects the reserved external tool name Raven", async (t) => {
  const fixture = await makeFixture("reserved.json", { ...validExternal, tool: " RAVEN " });
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reserved\.json/);
  assert.match(result.stderr, /reserved tool name.*Raven/i);
});

test("rejects external results whose notes do not reference preserved raw output", async (t) => {
  const fixture = await makeFixture("empty-notes.json", { ...validExternal, notes: "" });
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /empty-notes\.json/);
  assert.match(result.stderr, /notes.*raw output reference/i);
});

test("rejects a malformed shipped template before exempting it from scoring", async (t) => {
  const malformedTemplate = {
    ...validExternal,
    tool: "example-tool",
    notes: "Synthetic ungraded template.",
    cases: validExternal.cases.slice(0, -1).map((entry) => ({ ...entry, detected: null })),
  };
  const fixture = await makeFixture("example-tool.json", malformedTemplate);
  t.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const result = runCompare(fixture.benchDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /example-tool\.json/);
  assert.match(result.stderr, /missing case id: beta-clean/);
});
