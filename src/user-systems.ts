// Stored user-generated design systems — what makes the design system a real
// OUTPUT of the taste engine rather than a string that scrolls past.
// generate_design_system(save:true) writes its token set here, and from then
// on the id works everywhere a bundled id works: base_system, get_design_system,
// list_design_systems, and init_design_md.
//
// ONE module owns the lookup rule (bundled first, user second) because TWO
// consumers read stored systems — loadSystem/getAvailableSystemIds in
// src/index.ts and storedSystemExists/convertStoredSystemToDesignMd in
// src/designmd.ts — and two copies of one rule is how the takedown preview
// once said "1 record" while the delete removed 2. Import from here; do not
// re-derive the rule at a call site.
//
// Remote (hosted) runtime: every read answers "nothing" and the save throws.
// The user dir is per-machine ~/.raven state, which the no-auth endpoint must
// neither mutate (ephemeral serverless fs) nor read (a store-existence oracle).
// Mirrors writeCreativeRecord/readCreativeRecord in src/index.ts. The guards
// live HERE, in the store functions, so a future caller cannot forget them.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { isRemoteRuntime } from "./remote-runtime.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var BUNDLED_SYSTEMS_DIR = join(PKG_ROOT, "src", "data", "tokens", "systems");

// Resolved at CALL time, never cached at module load, so RAVEN_SYSTEMS_HOME
// set after import (tests, or a user relocating their corpus) is honoured on
// the next call — a dir cached at load is the "cached blocklist" defect one
// module over in reference-blocklist.ts, which the same suite proved
// unobservable only because that module never caches.
export function userSystemsDir(): string {
  return process.env.RAVEN_SYSTEMS_HOME || join(homedir(), ".raven", "design-systems");
}

// Same predicate as isSafeDataId in src/index.ts. Not imported from there:
// index.ts imports designmd.ts and designmd.ts imports this module, so
// reaching back up into index.ts would be a cycle. If one changes, change
// both — a test in test/user-systems.test.mjs pins the four rejections.
export function isSafeSystemId(id: string): boolean {
  return typeof id === "string" && id.length > 0
    && !id.includes("/") && !id.includes("\\") && !id.includes("..") && id.charAt(0) !== ".";
}

export function bundledSystemPath(id: string): string | null {
  if (!isSafeSystemId(id)) return null;
  var p = join(BUNDLED_SYSTEMS_DIR, id + ".json");
  return existsSync(p) ? p : null;
}

export function userSystemPath(id: string): string | null {
  if (isRemoteRuntime()) return null;
  if (!isSafeSystemId(id)) return null;
  var p = join(userSystemsDir(), id + ".json");
  // statSync().isFile(), not existsSync: a DIRECTORY named <id>.json answers
  // true to existsSync and then EISDIRs the read — the user dir is hand-
  // editable, so its contents are input, not trusted state. Same reasoning as
  // search_references' image check.
  return isRegularFile(p) ? p : null;
}

function isRegularFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// THE lookup rule: bundled wins, user second. Bundled winning is what makes
// the save-collision refusal below honest — a user system saved under a
// bundled id would write fine and then never load, which is a save that lies.
export function storedSystemPath(id: string): string | null {
  return bundledSystemPath(id) || userSystemPath(id);
}

export function loadStoredSystem(id: string): any | null {
  var p = storedSystemPath(id);
  if (!p) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

// The dir ITSELF is hand-editable state, same as its contents: RAVEN_SYSTEMS_HOME
// can point at a regular file, and a chmod can make the dir unreadable —
// existsSync answers true to BOTH, and readdirSync then throws (ENOTDIR /
// EACCES), which used to kill list_design_systems for every caller while
// per-ENTRY oddities were already survived. One shared read owns the rule so
// the id listing and the health probe below cannot diverge; "never created
// yet" is normal and is NOT a problem.
function readUserSystemsDir(): { files: string[]; problem: string | null } {
  if (isRemoteRuntime()) return { files: [], problem: null };
  var dir = userSystemsDir();
  if (!existsSync(dir)) return { files: [], problem: null };
  try {
    return { files: readdirSync(dir), problem: null };
  } catch (err: any) {
    return { files: [], problem: err && err.message ? err.message : String(err) };
  }
}

// null when the user dir is healthy or simply absent; a message when it exists
// but cannot be read AS a directory. In that state listUserSystemIds degrades
// to [], which is indistinguishable from "no saved systems" — a caller that
// wants to tell the user (rather than render their saved systems as silently
// vanished) reads this. Local-only surface by construction: remote reads
// answer nothing before touching the filesystem.
export function userSystemsDirProblem(): string | null {
  return readUserSystemsDir().problem;
}

export function listUserSystemIds(): string[] {
  var dir = userSystemsDir();
  // Same isRegularFile as userSystemPath — the listing and the lookup must
  // share one rule, or an id appears in one and not the other. It excludes a
  // subdirectory named <x>.json, which would otherwise become a listed id
  // that every loadStoredSystem consumer either EISDIRs on or renders as a
  // phantom entry that can never load. statSync (not Dirent.isFile) so a
  // symlinked system file is treated the same here as at load time.
  return readUserSystemsDir().files
    .filter(function (f) { return f.endsWith(".json") && isRegularFile(join(dir, f)); })
    .map(function (f) { return f.slice(0, -".json".length); })
    .filter(isSafeSystemId)
    .sort();
}

export function saveUserSystem(id: string, system: object): { id: string; path: string } {
  if (isRemoteRuntime()) {
    throw new Error("Design systems cannot be saved on the hosted endpoint.");
  }
  if (!isSafeSystemId(id)) {
    throw new Error("Cannot save design system: '" + id + "' is not a usable id. Use a name that yields letters, numbers, and dashes.");
  }
  if (bundledSystemPath(id)) {
    throw new Error("Cannot save design system as '" + id + "': that id belongs to a bundled system, which always wins on load, so the save would be silently shadowed. Pick another name.");
  }
  var dir = userSystemsDir();
  mkdirSync(dir, { recursive: true });
  var path = join(dir, id + ".json");
  writeFileSync(path, JSON.stringify(system, null, 2) + "\n", "utf-8");
  return { id: id, path: path };
}
