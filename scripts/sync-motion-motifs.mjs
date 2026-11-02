#!/usr/bin/env node
// Copies motif and timeline sources from Motion Lab into src/data/motion/ and records their sha256 in
// src/data/motion/motifs.lock.json. Motion Lab stays the source of truth for these files;
// test/motion-playground.test.mjs fails if a copy no longer matches the lock, so a hand edit in
// src/data/motion/<motif>/ is caught. template.html and timeline-template.html are Raven forks (Copy for
// Raven, Send through Grab, no bundled font), so they are not overwritten; the lock records the upstream
// hash each was forked from and the fork's own hash, so an edit to a fork is re-locked on purpose by a sync. timeline/ mirrors Motion Lab's own layout (scripts/, src/timeline/, schemas/)
// so the validator's relative imports resolve unchanged; timeline/package.json (Raven's, not synced) marks
// the .js files CommonJS.
//
//   node scripts/sync-motion-motifs.mjs            copy + rewrite the lock
//   node scripts/sync-motion-motifs.mjs --check    report upstream drift, write nothing (exit 1 on drift)
//   node scripts/sync-motion-motifs.mjs --fork timeline-template.html
//                                                  also record a fork's new upstream hash, after porting by hand
//
// MOTION_LAB_DIR overrides the default ~/projects/motion-lab.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(repoRoot, "src", "data", "motion");
const lockPath = join(dataDir, "motifs.lock.json");
const labDir = process.env.MOTION_LAB_DIR || join(homedir(), "projects", "motion-lab");

// motif id -> { raven-relative path: motion-lab-relative path }
const MOTIFS = {
  keyfob: {
    "keyfob/schema.json": "schemas/examples/keyfob.json",
    "keyfob/runtime.js": "src/keyfob/runtime.js",
  },
};
// The playground contract every motif is validated against (src/motion-playground/validate.ts).
const CONTRACT = { "playground.schema.json": "schemas/playground.schema.json" };
// The timeline engine, its validator and its schemas, at the same relative paths as in Motion Lab.
const TIMELINE = Object.fromEntries([
  "scripts/validate-timeline.mjs",
  "scripts/validate.mjs",
  "src/timeline/evaluator.js",
  "src/timeline/export.js",
  "src/timeline/swiftui.js",
  "src/timeline/outline.js",
  "schemas/timeline.schema.json",
  "schemas/playground.schema.json",
].map((f) => ["timeline/" + f, f]));
// Raven fork -> the Motion Lab file it was forked from.
const TEMPLATES = { "template.html": "src/keyfob/template.html", "timeline-template.html": "src/timeline/template.html" };
const SYNCED = [...Object.values(MOTIFS), CONTRACT, TIMELINE];

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

if (!existsSync(labDir)) {
  console.error(`Motion Lab not found at ${labDir}. Set MOTION_LAB_DIR.`);
  process.exit(2);
}
const check = process.argv.includes("--check");
const refork = process.argv.flatMap((a, i, all) => (all[i - 1] === "--fork" ? [a] : []));
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;

if (check) {
  let drift = 0;
  for (const files of SYNCED) {
    for (const [dest, src] of Object.entries(files)) {
      const upstream = sha256(join(labDir, src));
      if (lock?.files?.[dest] !== upstream) { drift++; console.log(`drift: ${src} -> ${dest}`); }
    }
  }
  for (const [fork, upstream] of Object.entries(TEMPLATES)) {
    if (lock?.templates?.[fork]?.upstream_sha256 !== sha256(join(labDir, upstream))) {
      drift++;
      console.log(`drift: ${upstream} changed since ${fork} was forked; port the change by hand`);
    }
    if (lock?.templates?.[fork]?.fork_sha256 !== sha256(join(dataDir, fork))) {
      drift++;
      console.log(`drift: ${fork} was edited since the last sync; run a sync to re-lock it`);
    }
  }
  console.log(drift ? `${drift} file(s) drifted` : "in sync");
  process.exit(drift ? 1 : 0);
}

const files = {};
for (const group of SYNCED) {
  for (const [dest, src] of Object.entries(group)) {
    mkdirSync(dirname(join(dataDir, dest)), { recursive: true });
    copyFileSync(join(labDir, src), join(dataDir, dest));
    files[dest] = sha256(join(dataDir, dest));
  }
}
let commit = null;
try { commit = execFileSync("git", ["-C", labDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
const next = {
  source: "rhinocap/motion-lab",
  source_commit: commit,
  motifs: Object.keys(MOTIFS),
  files,
  // A fork's upstream hash is recorded when the fork is first synced and moves only with --fork <name>,
  // after the upstream change has been ported by hand.
  templates: Object.fromEntries(Object.entries(TEMPLATES).map(([fork, upstream]) => [fork, {
    forked_from: upstream,
    // The pre-timeline lock kept the keyfob fork's hash under "template".
    upstream_sha256: (!refork.includes(fork) && (lock?.templates?.[fork]?.upstream_sha256 ?? (fork === "template.html" ? lock?.template?.upstream_sha256 : undefined)))
      || sha256(join(labDir, upstream)),
    fork_sha256: sha256(join(dataDir, fork)),
  }])),
};
writeFileSync(lockPath, JSON.stringify(next, null, 2) + "\n");
console.log(`synced ${Object.keys(files).length} file(s) from ${commit ?? labDir}`);
