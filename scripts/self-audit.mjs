#!/usr/bin/env node
// Self-audit: run Raven's own audit_page tool across the demo pages, aggregate
// warnings, ask Claude whether any recurring patterns suggest a missing piece
// of design knowledge, and file GitHub issues for each gap.
//
// The knowledge-PR workflow (Mondays) will then draft PRs from those issues.
//
// Env:
//   ANTHROPIC_API_KEY  — required
//   GITHUB_TOKEN       — provided by Actions (gh CLI uses it)
//   DRY_RUN=1          — skip issue creation (local test)

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMOS_DIR = join(ROOT, "site", "demos");
const PATTERNS_DIR = join(ROOT, "src", "data", "patterns");
const PRINCIPLES_DIR = join(ROOT, "src", "data", "principles");
const MIN_DEMO_HITS = 3; // a warning must appear in >=N demos to count as recurring
const DRY_RUN = process.env.DRY_RUN === "1";
const MODEL = "claude-opus-4-7";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] }).trim();
}

async function runAudits() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(ROOT, "dist", "index.js")],
    cwd: ROOT,
  });
  const client = new Client({ name: "raven-self-audit", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  const demos = readdirSync(DEMOS_DIR).filter((f) => f.endsWith(".html"));
  const results = [];
  for (const file of demos) {
    const html = readFileSync(join(DEMOS_DIR, file), "utf8");
    try {
      const res = await client.callTool({ name: "audit_page", arguments: { html } });
      const text = res.content?.find((b) => b.type === "text")?.text || "{}";
      const parsed = JSON.parse(text);
      results.push({ file, audit: parsed });
      console.log(`  ${file}: ${parsed.summary || "(no summary)"}`);
    } catch (err) {
      console.warn(`  ${file}: audit failed — ${err.message}`);
    }
  }

  await client.close();
  return results;
}

function aggregateWarnings(results) {
  const byRule = new Map();
  for (const { file, audit } of results) {
    for (const w of audit.warnings || []) {
      if (!byRule.has(w.rule)) byRule.set(w.rule, { rule: w.rule, message: w.message, demos: [] });
      byRule.get(w.rule).demos.push({ file, message: w.message });
    }
  }
  return [...byRule.values()]
    .filter((entry) => entry.demos.length >= MIN_DEMO_HITS)
    .sort((a, b) => b.demos.length - a.demos.length);
}

function existingCoverage() {
  const names = [];
  for (const dir of [PATTERNS_DIR, PRINCIPLES_DIR]) {
    try {
      for (const f of readdirSync(dir)) if (f.endsWith(".json")) names.push(f);
    } catch {}
  }
  return names;
}

function existingOpenIssueTitles() {
  try {
    const raw = sh(`gh issue list --state open --label knowledge-request --limit 100 --json title`);
    return JSON.parse(raw).map((i) => i.title.toLowerCase());
  } catch {
    return [];
  }
}

async function askClaudeWhatIsMissing(recurring, coverage) {
  const client = new Anthropic();
  const systemText = `You review audit findings from Raven's own \`audit_page\` tool run across several demo pages that Raven itself produced.

Your job: for each recurring audit warning, decide whether it represents a **gap in Raven's design knowledge** — a principle or pattern that isn't yet documented in \`src/data/\` — and if so, draft a GitHub issue to file.

Skip the warning entirely if:
  - It is a rule/tool bug (too strict, false positives, unclear), not a knowledge gap. Flag these as "rule_refinement" instead.
  - The underlying principle is already well-covered by an existing file in src/data/.

Return JSON with this exact shape, and nothing else:
{
  "issues": [
    {
      "layer": "principles" | "patterns",
      "title": "Short imperative GitHub issue title — no '[knowledge]' prefix",
      "body": "Markdown body for the issue: what's missing, what the pattern should cover, what evidence exists. Must end with 'Target layer: <layer>. Filename: <kebab>.json.'",
      "source_rule": "audit rule name this came from"
    }
  ],
  "rule_refinements": [
    {
      "rule": "audit rule name",
      "reason": "Why this warning is noise rather than signal"
    }
  ]
}`;

  const userText = `Existing knowledge files (don't duplicate these):
${coverage.join(", ")}

Recurring audit warnings (each appears in ${MIN_DEMO_HITS}+ demos):
${recurring
  .map(
    (r, i) =>
      `${i + 1}. Rule: ${r.rule}
   Message: ${r.message}
   Demos affected: ${r.demos.map((d) => d.file).join(", ")}`,
  )
  .join("\n\n")}

For each, decide: is this a knowledge gap worth filing as a Raven issue, a rule-refinement task, or neither?`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON in Claude response:\n${text}`);
  return JSON.parse(text.slice(start, end + 1));
}

function titleTooClose(a, b) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const ta = new Set(normalize(a));
  const tb = new Set(normalize(b));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, 1) > 0.6;
}

function fileIssue(issue, existingTitles) {
  const already = existingTitles.find((t) => titleTooClose(t, issue.title));
  if (already) {
    console.log(`  ⇢ Skipping "${issue.title}" — open issue already exists: "${already}"`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] would open issue: "${issue.title}"`);
    console.log(issue.body.split("\n").map((l) => "    " + l).join("\n"));
    return;
  }
  const bodyFile = join(tmpdir(), `raven-self-audit-${Date.now()}.md`);
  writeFileSync(bodyFile, `${issue.body}\n\n<sub>Drafted automatically by the weekly self-audit on ${new Date().toISOString().slice(0, 10)}. Source rule: \`${issue.source_rule}\`.</sub>\n`);
  sh(`gh issue create --label knowledge-request --title ${JSON.stringify(issue.title)} --body-file "${bodyFile}"`);
  unlinkSync(bodyFile);
  console.log(`  ✓ Filed issue: "${issue.title}"`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  console.log("→ Auditing demo pages…");
  const results = await runAudits();

  console.log(`\n→ Aggregating warnings (≥${MIN_DEMO_HITS} demos)…`);
  const recurring = aggregateWarnings(results);
  if (recurring.length === 0) {
    console.log("  No recurring warnings. Nothing to file.");
    return;
  }
  for (const r of recurring) console.log(`  ${r.rule} → ${r.demos.length} demos`);

  console.log("\n→ Asking Claude which are real knowledge gaps…");
  const plan = await askClaudeWhatIsMissing(recurring, existingCoverage());

  const existingTitles = existingOpenIssueTitles();
  if (plan.issues?.length) {
    console.log(`\n→ Filing ${plan.issues.length} issue(s):`);
    for (const issue of plan.issues) fileIssue(issue, existingTitles);
  } else {
    console.log("\n→ Claude found no new knowledge gaps this week.");
  }

  if (plan.rule_refinements?.length) {
    console.log(`\n→ Rule refinements noted (not filed as knowledge requests):`);
    for (const r of plan.rule_refinements) console.log(`  - ${r.rule}: ${r.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
