import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseBenchDir() {
  const dirFlag = process.argv.indexOf("--dir");
  if (dirFlag !== -1) {
    if (!process.argv[dirFlag + 1]) throw new Error("--dir requires a path");
    return path.resolve(process.argv[dirFlag + 1]);
  }
  if (process.env.BENCH_DIR) return path.resolve(process.env.BENCH_DIR);
  return path.dirname(fileURLToPath(import.meta.url));
}

async function readJson(file, missingMessage) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" && missingMessage) throw new Error(missingMessage);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path.basename(file)}: invalid JSON (${error.message})`);
  }
}

function requireString(value, field, file, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`${file}: ${field} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
}

function manifestIndex(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("manifest.json: expected a non-empty array");
  const byId = new Map();
  for (const entry of manifest) {
    requireString(entry && entry.id, "case id", "manifest.json");
    requireString(entry && entry.family, `family for ${entry.id}`, "manifest.json");
    if (byId.has(entry.id)) throw new Error(`manifest.json: duplicate case id: ${entry.id}`);
    byId.set(entry.id, {
      id: entry.id,
      family: entry.family,
      expected: entry.expected === "clean" ? "clean" : "seeded",
    });
  }
  return byId;
}

function validateCaseCoverage(cases, manifestById, file, validateCase) {
  if (!Array.isArray(cases)) throw new Error(`${file}: cases must be an array`);
  const byId = new Map();
  for (const entry of cases) {
    requireString(entry && entry.id, "case id", file);
    if (!manifestById.has(entry.id)) throw new Error(`${file}: unknown case id: ${entry.id}`);
    if (byId.has(entry.id)) throw new Error(`${file}: duplicate case id: ${entry.id}`);
    validateCase(entry, manifestById.get(entry.id));
    byId.set(entry.id, entry);
  }
  for (const id of manifestById.keys()) {
    if (!byId.has(id)) throw new Error(`${file}: missing case id: ${id}`);
  }
  return byId;
}

function validateRavenResults(results, manifestById) {
  requireString(results && results.generated_with, "generated_with", "results.json");
  requireString(results && results.bench_date, "bench_date", "results.json");
  const allowedOutcomes = new Set(["TP", "FN", "TN", "FP-control", "UNEXECUTED"]);
  return validateCaseCoverage(results.cases, manifestById, "results.json", (entry, manifestEntry) => {
    if (entry.family !== manifestEntry.family) {
      throw new Error(`results.json: family mismatch for ${entry.id}`);
    }
    if (entry.expected !== manifestEntry.expected) {
      throw new Error(`results.json: expected mismatch for ${entry.id}`);
    }
    if (!allowedOutcomes.has(entry.outcome)) {
      throw new Error(`results.json: invalid outcome for ${entry.id}: ${entry.outcome}`);
    }
    if (!Number.isInteger(entry.fp_count) || entry.fp_count < 0) {
      throw new Error(`results.json: fp_count for ${entry.id} must be a non-negative integer`);
    }
    const allowedForExpected = manifestEntry.expected === "clean"
      ? new Set(["TN", "FP-control", "UNEXECUTED"])
      : new Set(["TP", "FN", "UNEXECUTED"]);
    if (!allowedForExpected.has(entry.outcome)) {
      throw new Error(`results.json: ${manifestEntry.expected} case ${entry.id} cannot have outcome ${entry.outcome}`);
    }
    if (entry.outcome === "FP-control" && entry.fp_count < 1) {
      throw new Error(`results.json: FP-control for ${entry.id} requires fp_count of at least 1`);
    }
    if (entry.outcome === "TN" && entry.fp_count !== 0) {
      throw new Error(`results.json: TN for ${entry.id} requires fp_count of 0`);
    }
  });
}

function normalizedToolName(name) {
  return name
    .normalize("NFKC")
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replaceAll("ς", "σ");
}

function notesReferenceRawOutput(notes) {
  return /(?:https?:\/\/|file:\/\/|(?:^|\s)(?:\/|\.{1,2}\/|[A-Za-z]:\\)\S+|(?:^|\s)\S+\.[A-Za-z0-9]{1,8}(?=\s|$))/i.test(notes);
}

function validateExternal(data, manifestById, file, allowNullGrades = false) {
  requireString(data && data.tool, "tool", file);
  requireString(data && data.version, "version", file);
  requireString(data && data.graded_by, "graded_by", file);
  requireString(data && data.graded_at, "graded_at", file);
  requireString(data && data.notes, "notes", file, true);
  if (data.notes.trim() === "") {
    throw new Error(`${file}: notes must include a raw output reference (path or URL)`);
  }
  if (!allowNullGrades && !notesReferenceRawOutput(data.notes)) {
    throw new Error(`${file}: notes must include a raw output reference (path or URL)`);
  }
  const cases = validateCaseCoverage(data.cases, manifestById, file, (entry) => {
    if (typeof entry.detected !== "boolean" && !(allowNullGrades && entry.detected === null)) {
      throw new Error(`${file}: detected for ${entry.id} must be true or false; see bench/external/README.md`);
    }
    requireString(entry.evidence, `evidence for ${entry.id}`, file);
  });
  if (allowNullGrades && [...cases.values()].some((entry) => entry.detected !== null)) {
    throw new Error(`${file}: the shipped template must keep every detected value null until replaced with a graded external file`);
  }
  const normalizedTool = normalizedToolName(data.tool);
  if (normalizedTool === "") throw new Error(`${file}: tool must contain visible characters`);
  return {
    file,
    tool: data.tool.trim(),
    normalizedTool,
    version: data.version,
    graded_by: data.graded_by,
    graded_at: data.graded_at,
    notes: data.notes,
    cases,
  };
}

function pct(detected, total) {
  return total === 0 ? "n/a" : `${(100 * detected / total).toFixed(1)}%`;
}

function scoreTool(name, manifestById, detectedFor, cleanFlaggedFor, unexecutedFor = () => false) {
  const familyNames = [...new Set([...manifestById.values()].map((entry) => entry.family))];
  const families = new Map();
  let detectedTotal = 0;
  let seededTotal = 0;
  let cleanFlaggedTotal = 0;
  let unexecutedTotal = 0;
  for (const family of familyNames) {
    const entries = [...manifestById.values()].filter((entry) => entry.family === family);
    const seeded = entries.filter((entry) => entry.expected === "seeded");
    const detected = seeded.filter(detectedFor).length;
    const cleanFlagged = entries.filter((entry) => entry.expected === "clean" && cleanFlaggedFor(entry)).length;
    const unexecuted = entries.filter(unexecutedFor).length;
    families.set(family, { detected, total: seeded.length, cleanFlagged, unexecuted });
    detectedTotal += detected;
    seededTotal += seeded.length;
    cleanFlaggedTotal += cleanFlagged;
    unexecutedTotal += unexecuted;
  }
  return {
    name,
    families,
    overall: { detected: detectedTotal, total: seededTotal, cleanFlagged: cleanFlaggedTotal, unexecuted: unexecutedTotal },
  };
}

function recallCell(score) {
  return `${score.detected}/${score.total} (${pct(score.detected, score.total)})`;
}

function markdownText(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderComparison(results, manifestById, ravenScore, externalScores, skippedTemplate, ravenFindingLevelFps) {
  const tools = [ravenScore, ...externalScores.map((entry) => entry.score)];
  const families = [...new Set([...manifestById.values()].map((entry) => entry.family))];
  const header = ["Family"];
  const alignment = ["---"];
  for (const [index, tool] of tools.entries()) {
    header.push(`${tool.name} recall`, `${tool.name} clean cases flagged`);
    alignment.push("---:", "---:");
    if (index === 0) {
      header.push(`${tool.name} unexecuted`);
      alignment.push("---:");
    }
  }
  const lines = [
    "# Benchmark comparison",
    "",
    `BENCH_DATE: ${results.bench_date}`,
    `RAVEN_RESULT: ${results.generated_with}`,
    "",
    `| ${header.join(" | ")} |`,
    `|${alignment.join("|")}|`,
  ];
  for (const family of families) {
    const cells = [family];
    for (const [index, tool] of tools.entries()) {
      const score = tool.families.get(family);
      cells.push(recallCell(score), String(score.cleanFlagged));
      if (index === 0) cells.push(String(score.unexecuted));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  const overall = ["OVERALL"];
  for (const [index, tool] of tools.entries()) {
    overall.push(recallCell(tool.overall), String(tool.overall.cleanFlagged));
    if (index === 0) overall.push(String(tool.overall.unexecuted));
  }
  lines.push(`| ${overall.join(" | ")} |`);

  lines.push(
    "",
    `Raven finding-level FPs incl. seeded pages: ${ravenFindingLevelFps} — stricter than the case-level unit used for comparison; external tools are not graded at finding level.`,
    "",
    "## Fairness caveats",
    "",
    "- This corpus was self-authored with knowledge of Raven's audits and is biased toward Raven's rule vocabulary.",
    "- External results are human-graded self-reports. The harness cannot verify them against tool output; graders must link preserved raw output in `notes`.",
    "- Clean-case comparison is case-level: a clean case counts once when flagged. Raven finding-level FPs, including seeded pages, are reported separately because external tools are not graded at finding level.",
    "- This scores coverage of the corpus's labeled defect classes side-by-side; it is not a general head-to-head product comparison or ranking.",
    "- Misses remain in the denominator. Grader, grading date, tool version, notes, and per-case evidence are recorded for every scored external result.",
  );
  if (skippedTemplate) {
    lines.push("", "The shipped `example-tool.json` template is ungraded and was excluded from scoring.");
  }
  lines.push("", "## Tool metadata", "", `### Raven`, "", `- Generated with: ${markdownText(results.generated_with)}`, `- Benchmark date: ${markdownText(results.bench_date)}`);
  for (const external of externalScores) {
    lines.push(
      "",
      `### ${markdownText(external.tool)}`,
      "",
      `- Version: ${markdownText(external.version)}`,
      `- Graded by: ${markdownText(external.graded_by)}`,
      `- Graded at: ${markdownText(external.graded_at)}`,
      `- Notes: ${markdownText(external.notes)}`,
      `- Source: \`bench/external/${markdownText(external.file)}\``,
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const benchDir = parseBenchDir();
  const manifest = await readJson(path.join(benchDir, "corpus", "manifest.json"));
  const manifestById = manifestIndex(manifest);
  const results = await readJson(
    path.join(benchDir, "results.json"),
    "bench/results.json is missing; run bench/run.mjs first",
  );
  const ravenCases = validateRavenResults(results, manifestById);
  const unexecutedIds = [...ravenCases.values()]
    .filter((entry) => entry.outcome === "UNEXECUTED")
    .map((entry) => entry.id);
  if (unexecutedIds.length > 0) {
    process.stderr.write(`WARNING: incomplete benchmark contains UNEXECUTED cases: ${unexecutedIds.join(", ")}; COMPARISON.md was not written\n`);
    process.exitCode = 1;
    return;
  }

  const externalDir = path.join(benchDir, "external");
  let files = [];
  try {
    files = (await readdir(externalDir)).filter((file) => file.endsWith(".json")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const external = [];
  let skippedTemplate = false;
  const toolNames = new Map([["raven", "reserved Raven result"]]);
  for (const file of files) {
    const data = await readJson(path.join(externalDir, file));
    const shippedTemplate = file === "example-tool.json" && data && data.tool === "example-tool";
    const validated = validateExternal(data, manifestById, file, shippedTemplate);
    if (validated.normalizedTool === "raven") {
      throw new Error(`${file}: reserved tool name Raven cannot be used for an external result`);
    }
    if (toolNames.has(validated.normalizedTool)) {
      throw new Error(`${file}: duplicate normalized tool name ${JSON.stringify(validated.tool)}; already used by ${toolNames.get(validated.normalizedTool)}`);
    }
    toolNames.set(validated.normalizedTool, file);
    if (shippedTemplate) {
      skippedTemplate = true;
      process.stderr.write(`${file}: ungraded template skipped; fill it using bench/external/README.md before scoring\n`);
      continue;
    }
    external.push(validated);
  }

  const ravenScore = scoreTool(
    "Raven",
    manifestById,
    (entry) => ravenCases.get(entry.id).outcome === "TP",
    (entry) => ravenCases.get(entry.id).outcome === "FP-control",
    (entry) => ravenCases.get(entry.id).outcome === "UNEXECUTED",
  );
  const externalScores = external.map((tool) => ({
    ...tool,
    score: scoreTool(
      tool.tool,
      manifestById,
      (entry) => tool.cases.get(entry.id).detected,
      (entry) => tool.cases.get(entry.id).detected,
    ),
  }));
  const ravenFindingLevelFps = [...ravenCases.values()].reduce((sum, entry) => sum + entry.fp_count, 0);
  const output = renderComparison(results, manifestById, ravenScore, externalScores, skippedTemplate, ravenFindingLevelFps);
  await writeFile(path.join(benchDir, "COMPARISON.md"), output, "utf8");
  process.stdout.write(output);
}

main().catch((error) => {
  process.stderr.write(`Benchmark comparison failed: ${error.message}\n`);
  process.exitCode = 1;
});
