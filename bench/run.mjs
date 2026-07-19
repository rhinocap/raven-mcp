import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.RAVEN_NO_USAGE_LOG = "1";

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(benchDir, "..");
const corpusDir = path.join(benchDir, "corpus");
const distDir = path.join(rootDir, "dist");
const resultsPath = path.join(benchDir, "RESULTS.md");
const resultsJsonPath = path.join(benchDir, "results.json");
const manifestPath = path.join(corpusDir, "manifest.json");
const fixedViewport = { w: 390, h: 844 };

async function requireDist() {
  const required = ["contrast.js", "tap-targets.js", "typography.js", "responsive.js", "taste.js", "taste-store.js"];
  try {
    await Promise.all(required.map((file) => access(path.join(distDir, file))));
  } catch {
    throw new Error("bench requires built dist/ modules; run `npm run build` first");
  }
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function startCorpusServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
      const file = path.resolve(corpusDir, "." + pathname);
      if (!file.startsWith(corpusDir + path.sep)) throw new Error("outside corpus");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}

function rowsAt(result, collection) {
  const rows = result && result[collection];
  return Array.isArray(rows) ? rows : [];
}

function matcherMatches(result, matcher) {
  return rowsAt(result, matcher.collection).filter((row) => {
    if (matcher.selector_includes && !String(row.selector || "").includes(matcher.selector_includes)) return false;
    if (matcher.rule_equals && row.rule !== matcher.rule_equals) return false;
    if (matcher.rule_id_equals && row.rule_id !== matcher.rule_id_equals) return false;
    if (matcher.category_equals && row.category !== matcher.category_equals) return false;
    if (matcher.evidence_includes) {
      const evidence = `${row.evidence || ""} ${row.context || ""}`.toLowerCase();
      if (!evidence.includes(matcher.evidence_includes.toLowerCase())) return false;
    }
    return true;
  });
}

function warnPlusFindings(family, result) {
  if (family === "contrast") return rowsAt(result, "aa_failures");
  if (family === "tap-targets") return rowsAt(result, "fix_table");
  if (family === "typography") {
    return rowsAt(result, "findings").filter((row) => row.severity === "error" || row.severity === "warning");
  }
  if (family === "responsive-visibility") {
    return rowsAt(result, "flagged").filter((row) => row.category === "likely-oversight");
  }
  if (family === "taste-banned-language") {
    return rowsAt(result, "findings").filter((row) => row.severity === "block" || row.severity === "warn");
  }
  return [];
}

async function buildAuditContext() {
  const [contrast, tap, typography, responsive, taste, tasteStore] = await Promise.all([
    import(pathToFileURL(path.join(distDir, "contrast.js")).href),
    import(pathToFileURL(path.join(distDir, "tap-targets.js")).href),
    import(pathToFileURL(path.join(distDir, "typography.js")).href),
    import(pathToFileURL(path.join(distDir, "responsive.js")).href),
    import(pathToFileURL(path.join(distDir, "taste.js")).href),
    import(pathToFileURL(path.join(distDir, "taste-store.js")).href),
  ]);
  const priorTasteHome = process.env.RAVEN_TASTE_HOME;
  const tasteHome = await mkdtemp(path.join(tmpdir(), "raven-bench-taste-"));
  process.env.RAVEN_TASTE_HOME = tasteHome;
  const store = new tasteStore.FsTasteStore();
  await taste.createTasteProfile(store, {
    name: "bench-content-port",
    rules: [{
      rule_id: "CONTENT-RESTRAINT",
      clause_text: "Avoid persuasion verbs (proven, shipped, unlocks).",
      category: "content",
      severity_default: "warn",
      negative_prompt: "Do NOT use persuasion verbs (proven, shipped, unlocks).",
      owner: "taste",
      delegate_to: "",
    }],
  });
  return {
    modules: { contrast, tap, typography, responsive, taste },
    store,
    cleanup: async () => {
      if (priorTasteHome === undefined) delete process.env.RAVEN_TASTE_HOME;
      else process.env.RAVEN_TASTE_HOME = priorTasteHome;
      await rm(tasteHome, { recursive: true, force: true });
    },
  };
}

async function runAudit(entry, baseUrl, context) {
  const url = `${baseUrl}/${encodeURIComponent(entry.file)}`;
  const viewport = entry.audit.viewport || fixedViewport;
  if (entry.audit.tool === "audit_contrast") {
    return context.modules.contrast.auditContrastUrl(url, { viewport });
  }
  if (entry.audit.tool === "audit_tap_targets") {
    return context.modules.tap.auditTapTargetsUrl(url, { viewport, minSize: 44 });
  }
  if (entry.audit.tool === "audit_typography") {
    return context.modules.typography.auditTypographyUrl(url, { viewport });
  }
  if (entry.audit.tool === "audit_responsive_visibility") {
    return context.modules.responsive.captureResponsiveVisibility(
      url,
      entry.audit.breakpoints,
      { viewportHeight: entry.audit.viewport_height }
    );
  }
  if (entry.audit.tool === "audit_taste") {
    const target = await readFile(path.join(corpusDir, entry.file), "utf8");
    const source = await readFile(path.join(corpusDir, entry.source), "utf8");
    const isClean = entry.expected === "clean";
    if (isClean && source !== target) throw new Error("verbatim control source and target differ");
    if (!isClean && source === target) throw new Error("seeded source and target are identical");
    return context.modules.taste.auditTaste(context.store, { profile: entry.audit.profile, text: target });
  }
  throw new Error(`unknown audit tool: ${entry.audit.tool}`);
}

function pct(numerator, denominator) {
  return denominator === 0 ? "n/a" : `${(100 * numerator / denominator).toFixed(1)}%`;
}

function scoreRows(entries) {
  const families = [...new Set(entries.map((row) => row.family))];
  const scored = [];
  for (const family of families) {
    const rows = entries.filter((row) => row.family === family);
    const tp = rows.filter((row) => row.status === "TP").length;
    const fn = rows.filter((row) => row.status === "FN" || (row.status === "UNEXECUTED" && row.seeded)).length;
    const fp = rows.reduce((sum, row) => sum + row.fpCount, 0);
    const tn = rows.filter((row) => row.status === "TN").length;
    const unexecuted = rows.filter((row) => row.status === "UNEXECUTED").length;
    scored.push({ family, tp, fp, fn, tn, unexecuted, precision: pct(tp, tp + fp), recall: pct(tp, tp + fn) });
  }
  const total = scored.reduce((acc, row) => ({
    tp: acc.tp + row.tp, fp: acc.fp + row.fp, fn: acc.fn + row.fn, tn: acc.tn + row.tn,
    unexecuted: acc.unexecuted + row.unexecuted,
  }), { tp: 0, fp: 0, fn: 0, tn: 0, unexecuted: 0 });
  return { families: scored, total: { family: "OVERALL", ...total, precision: pct(total.tp, total.tp + total.fp), recall: pct(total.tp, total.tp + total.fn) } };
}

function renderReport(caseRows, scores, commit) {
  const date = process.env.BENCH_DATE ?? "unset";
  const unexecuted = caseRows.filter((row) => row.status === "UNEXECUTED");
  const lines = [
    "# W2 review-outcome benchmark",
    "",
    `BENCH_DATE: ${date}`,
    `COMMIT: ${commit}`,
    "",
    "| Family | TP | FP | FN | TN | UNEXECUTED | Precision | Recall |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of [...scores.families, scores.total]) {
    lines.push(`| ${row.family} | ${row.tp} | ${row.fp} | ${row.fn} | ${row.tn} | ${row.unexecuted} | ${row.precision} | ${row.recall} |`);
  }
  lines.push("", "## Cases", "", "| Case | Family | Outcome | FP |", "|---|---|---|---:|");
  for (const row of caseRows) lines.push(`| ${row.id} | ${row.family} | ${row.status} | ${row.fpCount} |`);
  if (unexecuted.length > 0) {
    lines.push("", "## Unexecuted", "");
    for (const row of unexecuted) lines.push(`- ${row.id}: ${row.error}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  await requireDist();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const server = await startCorpusServer();
  const context = await buildAuditContext();
  const caseRows = [];
  try {
    for (const entry of manifest) {
      const seeded = entry.expected !== "clean";
      try {
        const result = await runAudit(entry, server.baseUrl, context);
        const actionable = warnPlusFindings(entry.family, result);
        if (!seeded) {
          const fpCount = actionable.length;
          caseRows.push({ id: entry.id, family: entry.family, seeded, status: fpCount > 0 ? "FP" : "TN", fpCount });
        } else {
          const expectedMatches = new Set(matcherMatches(result, entry.expected));
          const credited = actionable.filter((row) => expectedMatches.has(row));
          const fpCount = actionable.filter((row) => !expectedMatches.has(row)).length;
          caseRows.push({ id: entry.id, family: entry.family, seeded, status: credited.length > 0 ? "TP" : "FN", fpCount });
        }
      } catch (error) {
        caseRows.push({
          id: entry.id,
          family: entry.family,
          seeded,
          status: "UNEXECUTED",
          fpCount: seeded ? 0 : 1,
          error: error.message,
        });
      }
    }
  } finally {
    await context.cleanup();
    await server.close();
  }
  const scores = scoreRows(caseRows);
  let commit = "unknown";
  try {
    const { execFileSync } = await import("node:child_process");
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: rootDir, encoding: "utf8" }).trim() !== "";
    if (dirty) commit += "-dirty";
  } catch { /* provenance is best-effort; report still renders */ }
  const report = renderReport(caseRows, scores, commit);
  await writeFile(resultsPath, report, "utf8");
  await writeFile(resultsJsonPath, JSON.stringify({
    generated_with: commit,
    bench_date: process.env.BENCH_DATE ?? "unset",
    cases: caseRows.map((row) => {
      const result = {
        id: row.id,
        family: row.family,
        expected: row.seeded ? "seeded" : "clean",
        outcome: row.status === "FP" ? "FP-control" : row.status,
        fp_count: row.fpCount,
      };
      if (row.status === "UNEXECUTED") result.error = row.error;
      return result;
    }),
  }, null, 2) + "\n", "utf8");
  process.stdout.write(report);
  if (scores.total.unexecuted > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`W2 benchmark could not start: ${error.message}\n`);
  process.exitCode = 1;
});
