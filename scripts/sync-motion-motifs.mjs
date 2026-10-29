#!/usr/bin/env node
// Copies motif sources from Motion Lab into src/data/motion/ and records their sha256 in
// src/data/motion/motifs.lock.json. Motion Lab stays the source of truth for motifs until phase 3;
// test/motion-playground.test.mjs fails if a copy no longer matches the lock, so a hand edit in
// src/data/motion/<motif>/ is caught. template.html is a Raven fork (Copy for Raven, framed copy,
// no bundled font), so it is not overwritten; the lock records the upstream hash it was forked from.
//
//   node scripts/sync-motion-motifs.mjs            copy + rewrite the lock
//   node scripts/sync-motion-motifs.mjs --check    report upstream drift, write nothing (exit 1 on drift)
//
// MOTION_LAB_DIR overrides the default ~/projects/motion-lab.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
const TEMPLATE_UPSTREAM = "src/keyfob/template.html";

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

if (!existsSync(labDir)) {
  console.error(`Motion Lab not found at ${labDir}. Set MOTION_LAB_DIR.`);
  process.exit(2);
}
const check = process.argv.includes("--check");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;

if (check) {
  let drift = 0;
  for (const files of Object.values(MOTIFS)) {
    for (const [dest, src] of Object.entries(files)) {
      const upstream = sha256(join(labDir, src));
      if (lock?.files?.[dest] !== upstream) { drift++; console.log(`drift: ${src} -> ${dest}`); }
    }
  }
  if (lock?.template?.upstream_sha256 !== sha256(join(labDir, TEMPLATE_UPSTREAM))) {
    drift++;
    console.log(`drift: ${TEMPLATE_UPSTREAM} changed since template.html was forked; port the change by hand`);
  }
  console.log(drift ? `${drift} file(s) drifted` : "in sync");
  process.exit(drift ? 1 : 0);
}

const files = {};
for (const motifFiles of Object.values(MOTIFS)) {
  for (const [dest, src] of Object.entries(motifFiles)) {
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
  template: {
    forked_from: TEMPLATE_UPSTREAM,
    upstream_sha256: lock?.template?.upstream_sha256 ?? sha256(join(labDir, TEMPLATE_UPSTREAM)),
  },
};
writeFileSync(lockPath, JSON.stringify(next, null, 2) + "\n");
console.log(`synced ${Object.keys(files).length} file(s) from ${commit ?? labDir}`);
