#!/usr/bin/env node
// Decide whether a release should be cut this run, and what the version bump
// should be. Emits GitHub Actions outputs: released, bump, version, notes.
//
// Bump rules:
//   - INPUT_BUMP explicit (major|minor|patch)  → use that
//   - Any merged PR labelled `breaking` or `major` → major
//   - Any merged PR labelled `feature` or `minor` → minor
//   - Otherwise                                 → patch
//
// If no commits exist since the last tag, released=false.

import { execSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }).trim();
}

function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return console.log(`[local] ${key}=${value}`);
  const safe = String(value).replace(/\r?\n/g, "\n");
  if (safe.includes("\n")) {
    const delim = `EOF_${Math.random().toString(36).slice(2)}`;
    appendFileSync(out, `${key}<<${delim}\n${safe}\n${delim}\n`);
  } else {
    appendFileSync(out, `${key}=${safe}\n`);
  }
}

const inputBump = (process.env.INPUT_BUMP || "auto").toLowerCase();
let lastTag = "";
try {
  // Match release tags ONLY. A bare `--tags` takes the most recent reachable
  // tag of ANY kind, so one `benchmark-2026-08-21` or `pregate-r5` truncates
  // the commit range and the PR window, and the run then computes its bump off
  // a fraction of the actual release scope.
  lastTag = sh('git describe --tags --abbrev=0 --match "v[0-9]*" 2>/dev/null');
} catch {
  lastTag = "";
}

const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const commitRange = lastTag ? `${lastTag}..HEAD` : "";
const commits = commitRange
  ? sh(`git log ${commitRange} --oneline`).split("\n").filter(Boolean)
  : sh(`git log --oneline -20`).split("\n").filter(Boolean);

if (commits.length === 0) {
  console.log("No commits since last tag — nothing to release.");
  setOutput("released", "false");
  process.exit(0);
}

// Pull merged PR titles + labels since the last tag for notes + bump detection.
let mergedPRs = [];
try {
  const sinceFlag = lastTag ? `--search "merged:>=$(git log -1 --format=%cI ${lastTag})"` : "";
  const raw = sh(
    `gh pr list --state merged --base main --limit 50 --json number,title,labels,mergedAt,url ${sinceFlag}`,
  );
  mergedPRs = JSON.parse(raw);
} catch (err) {
  // Fail CLOSED when the bump is being derived from labels. A transient
  // `gh pr list` failure previously left mergedPRs empty, which silently
  // defaults to `patch` — so an API blip could ship a `breaking` PR as a patch
  // release. With an explicit INPUT_BUMP the labels are not consulted at all,
  // so the failure is only degraded release notes and the run may continue.
  console.warn("Could not fetch merged PRs:", err.message);
  if (!["major", "minor", "patch"].includes(inputBump)) {
    console.error(
      "::error::Cannot derive the version bump: merged PRs could not be fetched and INPUT_BUMP is 'auto'. Re-run with an explicit bump, or retry once the API recovers.",
    );
    process.exit(1);
  }
}

if (lastTag) {
  let tagDate;
  try {
    tagDate = new Date(sh(`git log -1 --format=%cI ${lastTag}`));
  } catch {
    tagDate = null;
  }
  if (tagDate) {
    mergedPRs = mergedPRs.filter((pr) => new Date(pr.mergedAt) > tagDate);
  }
}

// Determine bump.
let bump = "patch";
if (["major", "minor", "patch"].includes(inputBump)) {
  bump = inputBump;
} else {
  const labels = mergedPRs.flatMap((pr) => pr.labels.map((l) => l.name.toLowerCase()));
  if (labels.some((l) => ["breaking", "major"].includes(l))) bump = "major";
  else if (labels.some((l) => ["feature", "minor"].includes(l))) bump = "minor";
}

// Compute the next version.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
let nextVersion;
if (bump === "major") nextVersion = `${maj + 1}.0.0`;
else if (bump === "minor") nextVersion = `${maj}.${min + 1}.0`;
else nextVersion = `${maj}.${min}.${pat + 1}`;

// Build release notes from merged PR titles grouped by label.
const groups = {
  breaking: [],
  feature: [],
  fix: [],
  knowledge: [],
  other: [],
};
for (const pr of mergedPRs) {
  const labels = pr.labels.map((l) => l.name.toLowerCase());
  const line = `- ${pr.title} (#${pr.number})`;
  if (labels.includes("breaking") || labels.includes("major")) groups.breaking.push(line);
  else if (labels.includes("feature") || labels.includes("minor")) groups.feature.push(line);
  else if (labels.includes("bug") || labels.includes("fix")) groups.fix.push(line);
  else if (labels.includes("knowledge-request") || labels.includes("drafted") || /^knowledge\//.test(pr.title.toLowerCase())) groups.knowledge.push(line);
  else groups.other.push(line);
}
const sections = [];
if (groups.breaking.length) sections.push(`### Breaking\n${groups.breaking.join("\n")}`);
if (groups.feature.length) sections.push(`### Features\n${groups.feature.join("\n")}`);
if (groups.knowledge.length) sections.push(`### New design knowledge\n${groups.knowledge.join("\n")}`);
if (groups.fix.length) sections.push(`### Fixes\n${groups.fix.join("\n")}`);
if (groups.other.length) sections.push(`### Changes\n${groups.other.join("\n")}`);
if (sections.length === 0) {
  sections.push(`### Changes\n${commits.map((c) => `- ${c}`).join("\n")}`);
}

const notes = [
  `Raven v${nextVersion} — ${bump} release`,
  "",
  sections.join("\n\n"),
  "",
  "**Install:** `claude mcp add raven -- npx -y raven-mcp@latest`",
  "**Claude Desktop:** [download raven.mcpb](https://ravenmcp.ai/raven.mcpb)",
].join("\n");

console.log(`Releasing v${nextVersion} (${bump}) — ${mergedPRs.length} PRs, ${commits.length} commits.`);
setOutput("released", "true");
setOutput("bump", bump);
setOutput("version", nextVersion);
setOutput("notes", notes);
