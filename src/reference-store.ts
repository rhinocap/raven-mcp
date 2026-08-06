import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var RAVEN_VERSION = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version || "";

var HTML_LIMIT = 8000;
var STYLE_LIMIT = 200;

export interface PatternReference {
  ref_id: string;
  url: string;
  host: string;
  app?: string;
  owner: "self" | "third-party";
  selector: string;
  html?: string;
  html_truncated?: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  state_styles?: Record<string, Record<string, string>>;
  note?: string;
  tags: string[];
  image?: ReferenceImage;
  captured_at: string;
  raven_version: string;
}

// A stored reference is HTML plus computed styles, which nobody can look at.
// The image is what makes a corpus pickable — you cannot choose "that scrolling
// mouse cue" from a style map.
//
// `fidelity` is on the record rather than assumed, because the render is
// deliberately OFFLINE: the page is rebuilt from the stored markup with every
// external request blocked, so a stored reference can never phone the site it
// came from later. That is a privacy and a correctness property (the source page
// may have changed, or require a login), and it costs remote images and
// webfonts. A thumbnail that silently omits them while presenting itself as a
// picture of the pattern is the failure mode; naming the fidelity is the fix.
export interface ReferenceImage {
  file: string;
  width: number;
  height: number;
  fidelity: "offline";
}

export interface SaveReferenceInput {
  url: string;
  app?: string;
  owner: "self" | "third-party";
  selector: string;
  html?: string;
  rect?: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  state_styles?: Record<string, Record<string, string>>;
  note?: string;
  tags: string[];
}

export interface ReferenceFilters {
  host?: string;
  owner?: PatternReference["owner"];
  tags?: string[];
}

export interface SearchReferenceOptions extends ReferenceFilters {
  query?: string;
}

export interface ReferenceListResult {
  references: PatternReference[];
  total: number;
  skipped: string[];
}

export interface ReferenceSearchResult {
  results: Array<{ reference: PatternReference; score: number; why: string }>;
  total: number;
  corpus_size: number;
  skipped: string[];
}

export function referenceHome(): string {
  return process.env.RAVEN_REFERENCE_HOME || join(homedir(), ".raven", "references");
}

export function saveReference(input: SaveReferenceInput): PatternReference {
  var url = validatedUrl(input.url);
  if (input.owner !== "self" && input.owner !== "third-party") {
    throw new Error('owner must be "self" or "third-party"');
  }
  if (typeof input.selector !== "string" || input.selector.trim().length === 0) {
    throw new Error("selector must be a non-empty string");
  }
  if (input.app !== undefined && typeof input.app !== "string") throw new Error("app must be a string");
  if (input.html !== undefined && typeof input.html !== "string") throw new Error("html must be a string");
  if (input.note !== undefined && typeof input.note !== "string") throw new Error("note must be a string");
  if (input.rect !== undefined && (
    !isRecord(input.rect)
    || !isFiniteNumber(input.rect.x)
    || !isFiniteNumber(input.rect.y)
    || !isFiniteNumber(input.rect.width)
    || !isFiniteNumber(input.rect.height)
  )) throw new Error("rect must contain numeric x, y, width, and height");
  validateStyleMap(input.styles, "styles");
  if (input.state_styles !== undefined) {
    if (!isRecord(input.state_styles)) throw new Error("state_styles must be an object");
    var states = Object.keys(input.state_styles);
    if (states.length > STYLE_LIMIT) {
      throw new Error("state_styles has " + states.length + " properties; maximum is " + STYLE_LIMIT);
    }
    for (var state of states) {
      validateStyleMap(input.state_styles[state], "state_styles." + state);
    }
  }
  if (!Array.isArray(input.tags) || !input.tags.every(function(tag) { return typeof tag === "string"; })) {
    throw new Error("tags must be an array of strings");
  }

  var html = input.html;
  var truncated = typeof html === "string" && html.length > HTML_LIMIT;
  var reference: PatternReference = {
    ref_id: newReferenceId(),
    url: input.url,
    host: url.hostname.toLowerCase(),
    owner: input.owner,
    selector: input.selector,
    styles: Object.assign({}, input.styles),
    tags: normalizeTags(input.tags),
    captured_at: new Date().toISOString(),
    raven_version: RAVEN_VERSION,
  };
  if (input.app !== undefined) reference.app = input.app;
  if (html !== undefined) reference.html = html.slice(0, HTML_LIMIT);
  if (truncated) reference.html_truncated = true;
  if (input.rect !== undefined) reference.rect = Object.assign({}, input.rect);
  if (input.state_styles !== undefined) reference.state_styles = cloneStateStyles(input.state_styles);
  if (input.note !== undefined) reference.note = input.note;

  // A half-written index must not brick every future capture. Search already
  // recovers by scanning record files; do the same here, keep the corrupt file
  // for diagnosis, and let the next write commit a repaired index.
  var index: string[];
  try {
    index = readIndex();
  } catch (_error) {
    index = rebuildIndexFromRecords();
  }
  atomicWriteJson(recordPath(reference.ref_id), reference);
  index.push(reference.ref_id);
  atomicWriteJson(indexPath(), { version: 1, ref_ids: index });
  return reference;
}

export function getReference(ref_id: string): PatternReference | null {
  validateReferenceId(ref_id);
  var file = recordPath(ref_id);
  if (!existsSync(file)) return null;
  return readRecord(file, ref_id);
}

export function listReferences(opts: ReferenceFilters = {}): ReferenceListResult {
  var skipped: string[] = [];
  var references: PatternReference[] = [];
  for (var file of recordFiles(skipped)) {
    try {
      var reference = readRecord(join(referenceHome(), file), file.slice(0, -5));
      if (matchesFilters(reference, opts)) references.push(reference);
    } catch (_error) {
      skipped.push(file);
    }
  }
  references.sort(compareReferences);
  return { references: references, total: references.length, skipped: skipped.sort() };
}

export function searchReferences(opts: SearchReferenceOptions): ReferenceSearchResult {
  var corpus = listReferences();
  var query = typeof opts.query === "string" ? opts.query.trim().toLowerCase() : "";
  var results: Array<{ reference: PatternReference; score: number; why: string }> = [];
  for (var reference of corpus.references) {
    if (!matchesFilters(reference, opts)) continue;
    var matches: string[] = [];
    var score = 0;
    if (query) {
      if ((reference.note || "").toLowerCase().includes(query)) { score += 4; matches.push("note"); }
      if ((reference.app || "").toLowerCase().includes(query)) { score += 3; matches.push("app name"); }
      if (reference.tags.some(function(tag) { return tag.includes(query); })) { score += 2; matches.push("tags"); }
      if (reference.selector.toLowerCase().includes(query)) { score += 1; matches.push("selector"); }
      if (score === 0) continue;
    }
    results.push({
      reference: reference,
      score: score,
      why: matches.length > 0 ? "Matched " + matches.join(", ") + "." : "Matched the requested filters.",
    });
  }
  results.sort(function(a, b) {
    return b.score - a.score || compareReferences(a.reference, b.reference);
  });
  return {
    results: results,
    total: results.length,
    corpus_size: corpus.references.length,
    skipped: corpus.skipped,
  };
}

export function deleteReference(ref_id: string): boolean {
  validateReferenceId(ref_id);
  var file = recordPath(ref_id);
  if (!existsSync(file)) return false;
  // Same recovery as capture: a corrupt index must not be the thing that stops
  // you deleting a record. Throwing here left the store unfixable through its own
  // API — you could not delete, and only a later capture would repair the index.
  var existing: string[];
  try {
    existing = readIndex();
  } catch (_error) {
    existing = rebuildIndexFromRecords();
  }
  var index = existing.filter(function(id) { return id !== ref_id; });
  unlinkSync(file);
  // The image is part of the record, so a delete that leaves it behind is not a
  // delete. This is the takedown path: a third-party pattern removed from the
  // corpus must not survive as a picture of itself sitting next to a gap in the
  // index. Unlinked BEFORE the index is rewritten, and tolerated if absent —
  // most records have no image, and a missing file is the expected case rather
  // than an error.
  try {
    unlinkSync(referenceImagePath(ref_id));
  } catch (_error) {
    // no image, or already gone
  }
  atomicWriteJson(indexPath(), { version: 1, ref_ids: index });
  return true;
}

function validatedUrl(value: string): URL {
  var url: URL;
  try {
    url = new URL(value);
  } catch (_error) {
    throw new Error("url must be a valid http: or https: URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("url must use http: or https:");
  }
  return url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateStyleMap(value: unknown, name: string): asserts value is Record<string, string> {
  if (!isRecord(value)) throw new Error(name + " must be an object");
  var keys = Object.keys(value);
  if (keys.length > STYLE_LIMIT) {
    throw new Error(name + " has " + keys.length + " properties; maximum is " + STYLE_LIMIT);
  }
  if (!keys.every(function(key) { return typeof value[key] === "string"; })) {
    throw new Error(name + " values must be strings");
  }
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(function(tag) { return tag.trim().toLowerCase(); }).filter(Boolean)));
}

function cloneStateStyles(styles: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  var copy: Record<string, Record<string, string>> = {};
  for (var state of Object.keys(styles)) copy[state] = Object.assign({}, styles[state]);
  return copy;
}

function matchesFilters(reference: PatternReference, opts: ReferenceFilters): boolean {
  if (opts.host !== undefined && reference.host !== opts.host.trim().toLowerCase()) return false;
  if (opts.owner !== undefined && reference.owner !== opts.owner) return false;
  var tags = normalizeTags(opts.tags || []);
  return tags.every(function(tag) { return reference.tags.includes(tag); });
}

function compareReferences(a: PatternReference, b: PatternReference): number {
  return b.captured_at.localeCompare(a.captured_at) || a.ref_id.localeCompare(b.ref_id);
}

function newReferenceId(): string {
  var id: string;
  do {
    id = "ref_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  } while (existsSync(recordPath(id)));
  return id;
}

function validateReferenceId(ref_id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(ref_id)) throw new Error("ref_id must be URL-safe");
}

function recordPath(ref_id: string): string {
  return join(referenceHome(), ref_id + ".json");
}

function indexPath(): string {
  return join(referenceHome(), "index.json");
}

export function referenceImagePath(ref_id: string): string {
  validateReferenceId(ref_id);
  return join(referenceHome(), ref_id + ".png");
}

// Attach a rendered thumbnail to an already-saved record.
//
// Separate from saveReference on purpose. saveReference is synchronous and must
// stay that way — the capture itself has to survive a browser that will not
// launch, a render that times out, or a machine with no chromium at all. A
// reference with no image is a usable reference; a capture that FAILS because
// its picture did not render is a lost grab. Every caller treats this as
// best-effort, and the record is the same record either way.
export function attachReferenceImage(
  ref_id: string,
  png: Uint8Array,
  size: { width: number; height: number },
): PatternReference {
  var reference = getReference(ref_id);
  if (!reference) throw new Error("no reference with ref_id " + ref_id);
  if (!(png instanceof Uint8Array) || png.length === 0) {
    throw new Error("png must be a non-empty byte array");
  }
  if (!isFiniteNumber(size.width) || !isFiniteNumber(size.height)
    || size.width <= 0 || size.height <= 0) {
    throw new Error("image size must be positive numbers");
  }
  var file = ref_id + ".png";
  var target = referenceImagePath(ref_id);
  mkdirSync(dirname(target), { recursive: true });
  // Same temp-then-rename shape as atomicWriteJson: a half-written PNG next to a
  // record that advertises it is worse than no image at all.
  var temp = target + ".tmp";
  writeFileSync(temp, png);
  renameSync(temp, target);
  reference.image = {
    file: file,
    width: Math.round(size.width),
    height: Math.round(size.height),
    fidelity: "offline",
  };
  atomicWriteJson(recordPath(ref_id), reference);
  return reference;
}

function recordFiles(skipped: string[]): string[] {
  var home = referenceHome();
  if (!existsSync(home)) return [];
  var indexed: string[] = [];
  try {
    indexed = readIndex().map(function(id) {
      validateReferenceId(id);
      return id + ".json";
    });
  } catch (_error) {
    skipped.push("index.json");
  }
  var discovered = readdirSync(home).filter(function(file) {
    return file.endsWith(".json") && file !== "index.json" && !file.startsWith("index.corrupt-");
  });
  return Array.from(new Set(indexed.concat(discovered)));
}

function readRecord(file: string, expectedId: string): PatternReference {
  var value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!isRecord(value)) throw new Error("record must be an object");
  validateReferenceId(typeof value.ref_id === "string" ? value.ref_id : "");
  if (value.ref_id !== expectedId) throw new Error("record ref_id does not match its file name");
  var url = validatedUrl(typeof value.url === "string" ? value.url : "");
  if (typeof value.host !== "string" || value.host !== url.hostname.toLowerCase()) throw new Error("record host does not match url");
  if (value.owner !== "self" && value.owner !== "third-party") throw new Error("record owner is invalid");
  if (typeof value.selector !== "string" || value.selector.length === 0) throw new Error("record selector is invalid");
  validateStyleMap(value.styles, "record styles");
  if (!Array.isArray(value.tags) || !value.tags.every(function(tag) { return typeof tag === "string"; })) throw new Error("record tags are invalid");
  var storedTags = value.tags as string[];
  if (JSON.stringify(storedTags) !== JSON.stringify(normalizeTags(storedTags))) throw new Error("record tags are not normalized");
  if (
    typeof value.captured_at !== "string"
    || !Number.isFinite(Date.parse(value.captured_at))
    || new Date(value.captured_at).toISOString() !== value.captured_at
  ) throw new Error("record captured_at is invalid");
  if (typeof value.raven_version !== "string") throw new Error("record raven_version is invalid");
  if (value.app !== undefined && typeof value.app !== "string") throw new Error("record app is invalid");
  if (value.html !== undefined && (typeof value.html !== "string" || value.html.length > HTML_LIMIT)) throw new Error("record html is invalid");
  if (value.html_truncated !== undefined && typeof value.html_truncated !== "boolean") throw new Error("record html_truncated is invalid");
  if (value.note !== undefined && typeof value.note !== "string") throw new Error("record note is invalid");
  if (value.rect !== undefined && (
    !isRecord(value.rect)
    || !isFiniteNumber(value.rect.x)
    || !isFiniteNumber(value.rect.y)
    || !isFiniteNumber(value.rect.width)
    || !isFiniteNumber(value.rect.height)
  )) throw new Error("record rect is invalid");
  if (value.state_styles !== undefined) {
    if (!isRecord(value.state_styles) || Object.keys(value.state_styles).length > STYLE_LIMIT) throw new Error("record state_styles is invalid");
    for (var state of Object.keys(value.state_styles)) validateStyleMap(value.state_styles[state], "record state_styles." + state);
  }
  return value as unknown as PatternReference;
}

function rebuildIndexFromRecords(): string[] {
  var home = referenceHome();
  var corrupt = indexPath();
  if (existsSync(corrupt)) {
    try {
      renameSync(corrupt, join(home, "index.corrupt-" + Date.now() + ".json"));
    } catch (_error) {
      // Keeping the corrupt copy is best-effort; recovering the store matters more.
    }
  }
  if (!existsSync(home)) return [];
  return readdirSync(home)
    .filter(function(file) { return file.endsWith(".json") && file !== "index.json" && !file.startsWith("index.corrupt-"); })
    .map(function(file) { return file.slice(0, -".json".length); })
    .filter(function(id) { return /^[A-Za-z0-9_-]+$/.test(id); })
    .sort();
}

function readIndex(): string[] {
  var file = indexPath();
  if (!existsSync(file)) return [];
  var parsed: { ref_ids?: unknown };
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as { ref_ids?: unknown };
  } catch (error) {
    throw new Error("Corrupt reference store " + file + ": invalid JSON (" + (error instanceof Error ? error.message : String(error)) + ")");
  }
  if (!Array.isArray(parsed.ref_ids) || !parsed.ref_ids.every(function(id) { return typeof id === "string"; })) {
    throw new Error("Corrupt reference store " + file + ': expected an object with a "ref_ids" array');
  }
  return parsed.ref_ids;
}

function atomicWriteJson(target: string, value: unknown): void {
  mkdirSync(referenceHome(), { recursive: true });
  var temporary = target + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2);
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
