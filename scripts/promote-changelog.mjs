#!/usr/bin/env node
// Promote CHANGELOG.md's `## [Unreleased]` block to `## [X.Y.Z] - date` and
// prepend the matching entry to web/data/changelog.json, in one pass.
//
// Run by .github/workflows/release.yml after the tag is cut and before the
// changelog commit + apex deploy, so the apex /changelog page shows the
// version that was just released (v2.6.0 deployed with the page still at
// v2.5.0 because nothing wrote changelog.json). Idempotent: a resume finds
// the version already present in both files and changes nothing.
//
//   node scripts/promote-changelog.mjs --version 2.6.0 [--bump minor] [--date 2026-09-23]
//
// --bump defaults from the version shape (X.Y.0 → minor, X.0.0 → major, else
// patch) because a resume run has no bump output. A patch with an empty
// [Unreleased] promotes nothing; a minor/major with an empty block exits 1.

import { readFileSync, writeFileSync } from "node:fs";
import { bumpFromVersion, promoteChangelog } from "./release-notes.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const version = (opt("version") || "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("::error::promote-changelog: --version X.Y.Z is required");
  process.exit(1);
}
const bump = opt("bump") || bumpFromVersion(version);
if (!["major", "minor", "patch"].includes(bump)) {
  console.error(`::error::promote-changelog: unknown bump "${bump}"`);
  process.exit(1);
}
const date = opt("date") || new Date().toISOString().slice(0, 10);

const MD = "CHANGELOG.md";
const JSON_PATH = "web/data/changelog.json";
const changelogMd = readFileSync(MD, "utf8");
const changelogJson = JSON.parse(readFileSync(JSON_PATH, "utf8"));

let result;
try {
  result = promoteChangelog({ changelogMd, changelogJson, version, bump, date });
} catch (err) {
  console.error(`::error::${err.message}`);
  process.exit(1);
}

if (!result.promoted) {
  console.log(
    result.alreadyPromoted
      ? `v${version}: ${MD} and ${JSON_PATH} already carry this release — nothing to do (resume).`
      : `v${version}: [Unreleased] is empty and the bump is patch — nothing to promote.`,
  );
  process.exit(0);
}
const wroteMd = result.changelogMd !== changelogMd;
const wroteJson = result.changelogJson !== changelogJson;
if (wroteMd) writeFileSync(MD, result.changelogMd);
if (wroteJson) writeFileSync(JSON_PATH, `${JSON.stringify(result.changelogJson, null, 2)}\n`);
console.log(
  `v${version} (${bump}, ${date}): ${MD} ${wroteMd ? "promoted" : "already had the section"}; ${JSON_PATH} ${wroteJson ? `entry added (${result.entry.changes.length} changes, kind ${result.entry.kind})` : "already had the entry"}.`,
);
