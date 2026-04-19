#!/usr/bin/env node
// Draft pull requests from open GitHub issues labelled `knowledge-request`.
// For each issue, asks Claude to produce a structured JSON file matching
// Raven's existing schema, commits it on a new branch, and opens a PR.
//
// Env:
//   ANTHROPIC_API_KEY  — required
//   GITHUB_TOKEN       — provided by Actions (gh CLI uses it)
//   DRY_RUN=1          — skip branch/commit/PR (for local testing)
//   MAX_ISSUES=N       — cap how many to process (default 5)

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "claude-opus-4-7";
const MAX_ISSUES = Number(process.env.MAX_ISSUES || 5);
const DRY_RUN = process.env.DRY_RUN === "1";

const client = new Anthropic();

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT, stdio: ["pipe", "pipe", "inherit"], ...opts }).trim();
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function loadExample(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

// ── System prompt: schema, examples, constraints. Cached across issues. ──
const systemBlocks = [
  {
    type: "text",
    text: `You draft additions to the Raven design knowledge base in response to GitHub issues.

Raven exposes four knowledge layers in \`src/data/\`:
  - principles/   — array of principle objects
  - patterns/     — single pattern-collection object
  - business/     — single strategy object
  - tokens/       — design system token files

Your job: read the issue, decide the correct layer and filename, and produce **one JSON file** that matches the existing schema exactly. Match the voice (concise, evidence-backed, actionable). Include \`evidence\` numbers only when you can cite a real source — otherwise omit that field or say so in the PR description.

Return ONLY a single JSON object with this shape:
{
  "layer": "principles" | "patterns" | "business",
  "filename": "something.json",    // kebab-case, no path
  "action": "create" | "append",   // "append" adds one item to an existing array file (principles only)
  "content": { ... }               // the full file body (create) OR the single new item (append)
  "pr_title": "Short imperative title",
  "pr_description": "What this adds, why, source issue reference"
}

Do not wrap in markdown. No prose before or after the JSON.`,
    cache_control: { type: "ephemeral" },
  },
  {
    type: "text",
    text: `── Example: a pattern file (src/data/patterns/cta.json) ──
${loadExample("src/data/patterns/cta.json")}

── Example: a principle entry from src/data/principles/laws-of-ux.json ──
${loadExample("src/data/principles/laws-of-ux.json").slice(0, 4000)}

Match this structure precisely. Keys, nesting, and array shapes matter — Raven's loader is strict.`,
    cache_control: { type: "ephemeral" },
  },
];

function fetchIssues() {
  // Open issues with the knowledge-request label, oldest first, that don't already
  // have a linked PR drafted by this job (we tag them `drafted` after a PR opens).
  const raw = sh(
    `gh issue list --state open --label knowledge-request --limit ${MAX_ISSUES * 3} --json number,title,body,labels`,
  );
  const issues = JSON.parse(raw);
  return issues
    .filter((i) => !i.labels.some((l) => l.name === "drafted"))
    .slice(0, MAX_ISSUES);
}

async function draftForIssue(issue) {
  console.log(`\n── Issue #${issue.number}: ${issue.title} ──`);

  const userMsg = `GitHub Issue #${issue.number}
Title: ${issue.title}

Body:
${issue.body || "(no body)"}

Draft the JSON file that fulfils this request.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: systemBlocks,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`No JSON found in response for issue #${issue.number}:\n${text}`);
  }
  const plan = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

  console.log(`  → layer=${plan.layer} filename=${plan.filename} action=${plan.action}`);
  return plan;
}

function writePlan(plan) {
  const dir = join(ROOT, "src", "data", plan.layer);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, plan.filename);

  if (plan.action === "append") {
    const existing = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(existing)) {
      throw new Error(`append requires an array file; ${plan.filename} is not an array`);
    }
    existing.push(plan.content);
    writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
  } else {
    writeFileSync(path, JSON.stringify(plan.content, null, 2) + "\n");
  }
  return path;
}

function openPR(issue, plan, filePath) {
  const branch = `knowledge/issue-${issue.number}-${slugify(issue.title)}`;
  const relPath = filePath.replace(ROOT + "/", "");

  if (DRY_RUN) {
    console.log(`  [dry-run] would create branch ${branch} and open PR`);
    return;
  }

  sh(`git checkout -b ${branch}`);
  sh(`git add "${relPath}"`);
  sh(
    `git commit -m "${plan.pr_title.replace(/"/g, '\\"')}" -m "Drafted from issue #${issue.number} by the weekly knowledge-PR workflow.${"\n\n"}Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`,
  );
  sh(`git push -u origin ${branch}`);

  const body = `${plan.pr_description}\n\nSource: closes #${issue.number}\n\n— Drafted by the weekly knowledge-PR workflow. Review the diff, edit if needed, merge when ready.`;
  sh(
    `gh pr create --base main --head ${branch} --title "${plan.pr_title.replace(/"/g, '\\"')}" --body ${JSON.stringify(body)}`,
  );

  // Mark issue so we don't re-draft next week
  sh(`gh issue edit ${issue.number} --add-label drafted`);
  sh(`gh issue comment ${issue.number} --body "A draft PR was opened on branch \\\`${branch}\\\` — review it there."`);

  // Back to main for next iteration
  sh(`git checkout main`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const issues = fetchIssues();
  console.log(`Found ${issues.length} issue(s) to draft`);
  if (issues.length === 0) return;

  for (const issue of issues) {
    try {
      const plan = await draftForIssue(issue);
      const filePath = writePlan(plan);
      openPR(issue, plan, filePath);
    } catch (err) {
      console.error(`  ✗ Issue #${issue.number} failed:`, err.message);
      if (!DRY_RUN) {
        try {
          sh(`git checkout main`);
          sh(`git branch -D knowledge/issue-${issue.number}-${slugify(issue.title)} 2>/dev/null || true`);
        } catch {}
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
