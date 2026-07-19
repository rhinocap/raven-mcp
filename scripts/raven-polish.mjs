#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "dist", "index.js");
const CWD = process.cwd();

function usage(message) {
  if (message) console.error(`raven-polish: ${message}`);
  console.error('Usage: node scripts/raven-polish.mjs [--range <git-range>] [--apply] [--project <name>] [--design-md <path>] [--verify "<command>"]');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = { range: "HEAD", apply: false, project: undefined, designMd: undefined, verify: undefined };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (["--range", "--project", "--design-md", "--verify"].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--range") options.range = value;
      if (arg === "--project") options.project = value;
      if (arg === "--design-md") options.designMd = value;
      if (arg === "--verify") options.verify = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.verify && !options.apply) throw new Error("--verify is only meaningful with --apply");
  return options;
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: CWD,
    encoding: "utf8",
    input: options.input,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || `git exited ${result.status}`).trim();
    throw new Error(detail);
  }
  return result;
}

function initialDiff(range) {
  return git(["diff", "--no-color", "--no-ext-diff", range, "--"]).stdout;
}

function realDiff(range) {
  if (range === "HEAD") return initialDiff(range);
  const triple = range.match(/^(.*)\.\.\.(.+)$/);
  if (triple) {
    const base = git(["merge-base", triple[1], triple[2]]).stdout.trim();
    return initialDiff(base);
  }
  const double = range.match(/^(.*)\.\.(.+)$/);
  if (double) return initialDiff(double[1]);
  return initialDiff(range);
}

function rangeRightHandSide(range) {
  const triple = range.match(/^.*\.\.\.(.+)$/);
  if (triple) return triple[1];
  const double = range.match(/^.*\.\.(.+)$/);
  if (double) return double[1];
  return range;
}

function guardApplyBase(range) {
  if (range === "HEAD") {
    const staged = git(["diff", "--cached", "--name-only"]).stdout.trim();
    if (staged) {
      throw new Error(`refusing --apply with staged changes: ${staged.split("\n").join(", ")}; commit or unstage them first so staged content is not committed unpolished`);
    }
    return;
  }

  const rhs = rangeRightHandSide(range);
  const headCommit = git(["rev-parse", "HEAD"]).stdout.trim();
  const rhsCommit = git(["rev-parse", rhs]).stdout.trim();
  if (headCommit !== rhsCommit) {
    throw new Error(`refusing --apply for range ${range}: HEAD must equal the range right-hand side ${rhs} because the patch is built against that post-image`);
  }
}

function readDesignMd(option) {
  const explicit = option !== undefined;
  const path = resolve(CWD, option || "DESIGN.md");
  if (!existsSync(path)) {
    if (explicit) throw new Error(`DESIGN.md not found: ${path}`);
    return undefined;
  }
  return readFileSync(path, "utf8");
}

async function withRaven(run) {
  if (!existsSync(SERVER)) throw new Error(`built server not found: ${SERVER}; run npm run build first`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd: ROOT,
    env: {
      ...process.env,
      RAVEN_NO_USAGE_LOG: "1",
      RAVEN_NO_DAILY_DIGEST: "1",
      RAVEN_NO_UPDATE_CHECK: "1",
    },
  });
  const client = new Client({ name: "raven-polish", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

async function callJson(client, name, args) {
  const response = await client.callTool({ name, arguments: args });
  const block = response.content?.find((item) => item.type === "text");
  if (!block) throw new Error(`${name} returned no text content`);
  if (response.isError) throw new Error(block.text);
  try {
    return JSON.parse(block.text);
  } catch (error) {
    throw new Error(`${name} returned invalid JSON: ${error.message}`);
  }
}

function violationCount(findings) {
  return (findings || []).filter((finding) => finding.rule !== "token-value-match").length;
}

function errorCount(findings) {
  return (findings || []).filter((finding) => finding.severity === "error").length;
}

function printPolishReport(polish, applying) {
  console.log(`Raven polish (${applying ? "apply" : "dry-run"})`);
  console.log(`Verdict: ${polish.verdict}`);
  console.log(`Findings: ${polish.findings?.length || 0}`);
  console.log(`Proposed changes: ${polish.proposed_changes?.length || 0}`);
  for (const item of polish.proposed_changes || []) {
    console.log(`  - ${item.file}:${item.line} ${item.before} -> ${item.after}`);
  }
  console.log(`Manual judgment: ${polish.manual?.length || 0}`);
  for (const item of polish.manual || []) {
    console.log(`  - ${item.file}:${item.line} ${item.summary} (${item.why})`);
  }
  console.log(`Post-polish (hypothetical): resolved ${polish.post_polish?.findings_resolved || 0}, remaining ${polish.post_polish?.findings_remaining || 0}`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    return;
  }

  const diff = initialDiff(options.range);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).stdout.trim();
  if (untracked) console.log(`Untracked (not reviewed): ${untracked.split("\n").join(", ")}`);
  if (!diff.trim()) {
    console.log("Raven polish: no changes");
    return;
  }
  const designMd = readDesignMd(options.designMd);
  const toolArgs = { diff };
  if (options.project) toolArgs.project = options.project;
  if (designMd !== undefined) toolArgs.design_md = designMd;

  const result = await withRaven(async (client) => {
    const polish = await callJson(client, "polish_diff", toolArgs);
    printPolishReport(polish, options.apply);

    const proposals = polish.proposed_changes?.length || 0;
    if (!options.apply) {
      return { exitCode: proposals > 0 || errorCount(polish.findings) > 0 ? 1 : 0 };
    }
    guardApplyBase(options.range);
    if (options.range !== "HEAD" && git(["status", "--porcelain"]).stdout.trim()) {
      throw new Error(`refusing --apply for range ${options.range}: worktree is dirty; the patch is built against the range post-image and must match the checkout`);
    }
    let applied = false;
    if (!proposals || !polish.patch) {
      console.log("Apply: no deterministic patch proposed");
    } else {
      const checked = git(["apply", "--check", "-"], { input: polish.patch, allowFailure: true });
      if (checked.status !== 0) {
        const detail = (checked.stderr || checked.stdout || `git apply --check exited ${checked.status}`).trim();
        throw new Error(`git apply --check failed; nothing was applied\n${detail}`);
      }
      console.log("Apply check: passed");
      git(["apply", "-"], { input: polish.patch });
      applied = true;
      console.log(`Applied: ${proposals} proposed change${proposals === 1 ? "" : "s"}`);
    }

    const appliedDiff = realDiff(options.range);
    const review = appliedDiff.trim()
      ? await callJson(client, "review_diff", { ...toolArgs, diff: appliedDiff })
      : { verdict: "pass", findings: [] };
    const before = violationCount(polish.findings);
    const after = violationCount(review.findings);
    const emptySuffix = appliedDiff.trim() ? "" : " (no remaining diff)";
    console.log(`Real re-review: before ${before} violations, after ${after}, verdict ${review.verdict}${emptySuffix}`);

    let verifyFailed = false;
    if (options.verify) {
      console.log(`Verify: ${options.verify}`);
      const verified = spawnSync("sh", ["-c", options.verify], { cwd: CWD, env: process.env, stdio: "inherit" });
      const verifyCode = verified.status ?? 1;
      console.log(`Verify exit code: ${verifyCode}`);
      verifyFailed = verifyCode !== 0;
    }
    return { exitCode: (applied && errorCount(review.findings) > 0) || verifyFailed ? 1 : 0 };
  });
  process.exitCode = result.exitCode;
}

main().catch((error) => {
  console.error(`raven-polish: ${error.message}`);
  process.exitCode = 1;
});
