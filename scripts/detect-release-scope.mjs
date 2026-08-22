#!/usr/bin/env node
// Decide whether a release should be cut this run, and what the version bump
// should be. Emits GitHub Actions outputs: released, resume, resume_version,
// bump, version, notes.
//
// Bump rules:
//   - INPUT_BUMP explicit (major|minor|patch)  → use that
//   - Any merged PR labelled `breaking` or `major` → major
//   - Any merged PR labelled `feature` or `minor` → minor
//   - Otherwise                                 → patch
//
// Three outcomes, not two:
//   - released=true            → cut a new version, then run the tail
//   - resume=true              → cut NOTHING, run the tail against resume_version
//   - released=false resume=false → nothing to do
//
// A resume exists because a release reaches four surfaces and npm versions are
// immutable, so a tail failure (GitHub Release, changelog, apex deploy, apex
// verify) must be finishable without cutting a new version. It is entered
// either explicitly via the `resume_version` workflow input, or automatically
// when the range since the last tag is empty or holds nothing but that tag's
// changelog commit.

import { execSync, spawnSync } from "node:child_process";
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

// EXPLICIT RESUME, checked before anything else. The automatic detection below
// covers the two states a failed tail usually leaves (no commits since the tag,
// or nothing but the changelog commit), and it is deliberately NOT the only
// route, because it is defeated the moment an ordinary commit lands on main
// after a failed deploy: the range is no longer changelog-only, a NEW version
// is cut, and the earlier version's GitHub Release is stranded permanently.
//
// Detecting that state automatically was tried and refused, and the refusal was
// a MEASUREMENT rather than a preference. "Resume whenever the last tag has no
// GitHub Release" deadlocks on this repo today: the newest tag is v2.5.0 and
// the newest GitHub Release is v1.17.1, so that rule would resume v2.5.0
// forever and never cut anything again. "Resume whenever the changelog commit
// for the last tag is missing" misclassifies in the other direction, since the
// changelog step is 16 of 19 and its commit says nothing about the apex deploy
// or the apex verify that follow it.
//
// So the operator names the version instead. `resume_version` on
// workflow_dispatch runs the tail against exactly that release and skips the
// cut entirely — precise, and no classification to get wrong.
//
// Be exact about WHICH half-deployed states this finishes, because an earlier
// version of this comment claimed there is no state it cannot finish and that
// was false. `released=false` means `release.sh` does not run, and npm publish,
// the Registry publish and the atomic branch+tag push all live INSIDE it
// (`scripts/release.sh:154`, `:182`, `:242`). So this finishes the workflow TAIL
// — GitHub Release, changelog, apex deploy, apex verify — and nothing before it.
// A run that died after npm published but before the tag was pushed is NOT
// recoverable here and is not recoverable by re-running either, because the npm
// version is already taken; that state needs a human and a new patch version.
//
// The version is validated ANCHORED and then checked to EXIST as a tag. Both
// halves are load-bearing and the second is the one that matters: `gh release
// create` auto-creates a missing tag from current default-branch HEAD, so a
// prefix-only regex (which accepted `2.5.0junk`) plus an unvalidated version
// let a fat-fingered dispatch input materialise as a permanent public tag and
// Release pointing at whatever main happened to be. The workflow ALSO passes
// `--verify-tag` — one rule, two doors, because this check reads a checkout
// that could in principle be shallow while `--verify-tag` reads the remote.
const explicitResume = (process.env.INPUT_RESUME_VERSION || "").trim().replace(/^v/, "");
if (explicitResume) {
  if (!/^\d+\.\d+\.\d+$/.test(explicitResume)) {
    console.error(
      `resume_version "${explicitResume}" is not a version number. ` +
        `Expected exactly MAJOR.MINOR.PATCH (an optional leading "v" is stripped).`,
    );
    process.exit(1);
  }
  const tagExists = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/v${explicitResume}`], {
    encoding: "utf8",
  });
  if (tagExists.status !== 0) {
    console.error(
      `resume_version "${explicitResume}" has no tag v${explicitResume} in this checkout. ` +
        `A resume FINISHES an existing release; it can never create one. ` +
        `Cut a release instead, or fetch the tag if this checkout is shallow.`,
    );
    process.exit(1);
  }
  console.log(`Explicit resume of v${explicitResume} — the tail runs, nothing is cut.`);
  setOutput("released", "false");
  setOutput("resume", "true");
  setOutput("resume_version", explicitResume);
  process.exit(0);
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

// RESUME, not "nothing to do". Zero commits since the last tag is the exact
// state a tail failure leaves behind: release.sh published npm, published the
// Registry, committed, tagged and pushed, and then something after it (the
// GitHub Release, the changelog, the Vercel apex deploy, the apex verify) died.
// Reporting released=false there gated every one of those steps off forever, so
// the fourth surface could never be reached by any later run — a release that
// is unfinishable by the machine that started it.
//
// The one-commit-that-is-the-changelog case is the same state seen from the
// other side: the changelog commit lands AFTER the tag, so a bare commit count
// reads it as new work and a rerun would cut an unintended NEW version over a
// release that merely failed to deploy. Both collapse to resume.
const resumeVersion = lastTag.replace(/^v/, "");
const onlyChangelog =
  commits.length > 0 &&
  lastTag &&
  sh(`git log ${commitRange} --format=%s`)
    .split("\n")
    .filter(Boolean)
    .every((subject) => /^Update changelog for v/.test(subject));

if (lastTag && (commits.length === 0 || onlyChangelog)) {
  console.log(
    commits.length === 0
      ? `No commits since ${lastTag} — treating as a resume of ${lastTag}.`
      : `Only the changelog commit since ${lastTag} — treating as a resume, not a new release.`,
  );
  setOutput("released", "false");
  setOutput("resume", "true");
  setOutput("resume_version", resumeVersion);
  process.exit(0);
}

if (commits.length === 0) {
  console.log("No commits and no release tag — nothing to release.");
  setOutput("released", "false");
  setOutput("resume", "false");
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
setOutput("resume", "false");
setOutput("bump", bump);
setOutput("version", nextVersion);
setOutput("notes", notes);
