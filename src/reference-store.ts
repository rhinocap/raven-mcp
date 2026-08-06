import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var RAVEN_VERSION = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version || "";

var HTML_LIMIT = 8000;
var STYLE_LIMIT = 200;
// The 8 bytes every PNG starts with (PNG spec §5.2).
var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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
  // RECORD files whose JSON could not be read. Only record files — see
  // index_unreadable, which is a different condition with different consequences.
  skipped: string[];
  index_unreadable: boolean;
}

export interface ReferenceSearchResult {
  results: Array<{ reference: PatternReference; score: number; why: string }>;
  total: number;
  corpus_size: number;
  skipped: string[];
  index_unreadable: boolean;
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
  var state = { index_unreadable: false };
  for (var file of recordFiles(state)) {
    try {
      var reference = readRecord(join(referenceHome(), file), file.slice(0, -5));
      if (matchesFilters(reference, opts)) references.push(reference);
    } catch (_error) {
      skipped.push(file);
    }
  }
  references.sort(compareReferences);
  return {
    references: references,
    total: references.length,
    skipped: skipped.sort(),
    index_unreadable: state.index_unreadable,
  };
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
    index_unreadable: corpus.index_unreadable,
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
  // ORDER: the image goes FIRST, and the record only after it is gone.
  //
  // The image is part of the record, so a delete that leaves it behind is not a
  // delete — a third-party pattern removed from the corpus must not survive as a
  // picture of itself. The earlier version unlinked the record first and then the
  // image, which surfaced a failed image unlink honestly and still produced the
  // worse outcome: the record was already gone, so nothing on disk named the
  // surviving PNG any more. A second takedown for that host could not rediscover
  // it — it would match no record, remove nothing, and return a clean, empty,
  // apparently-successful result over a third-party image still sitting there.
  // A false all-clear is the one outcome this path must never produce, and
  // making the failure loud once does not help when the retry is silent.
  //
  // Reversed, every failure is retryable: the record survives a failed image
  // unlink, so it is still matched, still counted, and still reported by the next
  // call. The opposite half-state — record removed, image gone, index not yet
  // rewritten — is repaired by rebuildIndexFromRecords() on the next read, and an
  // orphan RECORD whose image is missing is already handled everywhere (search
  // checks the file rather than trusting the flag).
  try {
    unlinkSync(referenceImagePath(ref_id));
  } catch (error) {
    // Only "it was not there" is fine — most records have no image, and that is
    // the expected case rather than an error. Anything else (EACCES, EISDIR, a
    // busy file) means the picture is STILL ON DISK, so nothing is removed and
    // the caller is told which record still needs a human.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(
        "could not remove its image (" + (error as NodeJS.ErrnoException).code
        + "): " + referenceImagePath(ref_id) + " — the record for " + ref_id
        + " was left in place so this removal can be retried"
      );
    }
  }
  unlinkSync(file);
  atomicWriteJson(indexPath(), { version: 1, ref_ids: index });
  return true;
}

// Remove everything captured from one host.
//
// A takedown request names a SITE, not a ref_id — nobody writes in asking you to
// remove `ref_msh3j20c_ckucnrcp`. Deleting one at a time is also the shape that
// half-completes: you remove four of six, and the corpus still holds work
// somebody asked you to stop holding.
//
// Host matching is exact, on the stored `host` field, plus subdomains of it
// (`app.linear.app` is Linear's; `notlinear.app` is not, and a naive
// `endsWith(host)` says it is). It is deliberately NOT a substring or pattern
// match — over-deleting somebody else's records in response to a takedown is its
// own failure, and the caller gets a count back so a partial result is visible
// rather than assumed.
//
// Corrupt records are counted in `skipped` and their files are left alone. That
// is the honest answer: this function must not report a host cleared while a
// record it could not parse still sits in the directory.
export interface ForgetResult {
  host: string;
  removed: string[];
  skipped: string[];
  // Records this run TRIED to remove and could not — an image that would not
  // unlink, a record file that came back EACCES. Separate from `skipped`, which
  // is unreadable JSON that was never attempted: conflating "we could not parse
  // it" with "we could not delete it" hides the more serious of the two.
  failed: Array<{ ref_id: string; reason: string }>;
  // The INDEX could not be read. Reported separately from `skipped` because it is
  // not a record and nothing is left behind by it: recordFiles falls back to
  // scanning the directory, so every record is still found, still matched and
  // still deleted, and deleteReference rebuilds the index on the way through.
  // Filing it as a skipped record made a fully successful takedown report "N
  // unreadable record(s) were left on disk. This host is NOT fully cleared." —
  // a false NOT-clear, which is the inverse of the error this path guards and
  // just as much a lie about what is on disk.
  index_unreadable: boolean;
  // Records matching the host that were NOT removed because the caller pinned the
  // removal to a preview and these appeared after it. Empty unless expected_ref_ids
  // was supplied.
  appeared_since_preview: string[];
}

// A stored `host` is always `new URL(record.url).hostname` — readRecord enforces
// it — so it is lowercase, punycode, portless, and IPv6 in brackets. The
// REQUESTED host is free text a human typed into a takedown, and comparing raw
// text against a parser's output is comparing two different alphabets:
// `bücher.example` never matches the stored `xn--bcher-kva.example`, and
// `example.com:443` never matches `example.com`. Both were measured against
// dist/. So the request goes through the same parser the record did.
//
// Round-tripping is not optional. `new URL("http://" + raw)` happily accepts
// `linear.app/foo` and hands back the hostname `linear.app` — a typo would widen
// a takedown from one page to a whole site, silently. Anything that is not a
// bare authority is rejected before parsing rather than quietly reinterpreted.
export function canonicalHost(value: string): string {
  var raw = String(value || "").trim().toLowerCase().replace(/^\*\./, "");
  raw = raw.replace(/\.$/, "");
  if (!raw) return "";
  // A bare authority only. Anything carrying a path, query, fragment, userinfo,
  // scheme or whitespace is a different string than the caller thinks it is.
  if (/[\/?#@\\\s]/.test(raw)) return "";
  try {
    var hostname = new URL("http://" + raw + "/").hostname;
    return hostname.replace(/\.$/, "");
  } catch (_error) {
    return "";
  }
}

// An IPv4 literal or a bracketed IPv6 literal, AFTER canonicalHost has run — the
// URL parser normalises the odd IPv4 spellings (`0x7f.1` becomes `127.0.0.1`), so
// this only ever sees the one form.
function isIpLiteral(host: string): boolean {
  return host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function hostMatches(recordHost: string, requested: string): boolean {
  var a = canonicalHost(recordHost);
  var b = canonicalHost(requested);
  if (!a || !b) return false;
  if (a === b) return true;
  // Suffix matching means "is a subdomain of", and an address has no subdomains.
  // The reachable failure was on the REQUESTED side: `"127.0.0.1".endsWith(".0.0.1")`
  // is true, so a takedown typed as `0.0.1` erased a record stored at 127.0.0.1.
  //
  // Canonicalization is what actually closes that, and this clause is
  // belt-and-braces behind it — stated plainly rather than left to look
  // load-bearing. WHATWG reads a trailing all-numeric label as an IPv4
  // candidate, so every numeric tail (`0.0.1`, `0.1`, `1`) canonicalizes to the
  // address 0.0.0.1 and stops being a suffix of anything, and the mirrored case
  // (`x.127.0.0.1` read as a subdomain of the address) cannot arise at all
  // because that string is not a parseable hostname — validatedUrl rejects it at
  // capture, so no record can hold it. Measured on Node 26.5.0, both facts.
  // There is therefore no input reaching this line today; it is here so a future
  // change to canonicalHost cannot quietly reopen the class.
  if (isIpLiteral(a) || isIpLiteral(b)) return false;
  return a.endsWith("." + b);
}

// What a host-wide removal WOULD take. The confirmation prompt and the deletion
// must be answers to the same question — a preview computed by a different rule
// than the delete understates the damage in exactly the moment the user is being
// asked to authorise it. The first version of this called searchReferences({ host }),
// whose host filter is EXACT by design (a search for linear.app should not
// silently include app.linear.app), so it offered "1 record" and removed 2.
export function referencesForHost(host: string): ForgetResult {
  var requested = String(host || "").trim();
  if (!requested) throw new Error("host is required");
  // An unparseable host must not become a silent no-op. canonicalHost returns ""
  // for `linear.app/pricing`, `http://linear.app` and anything else that is not a
  // bare authority; matching would then quietly remove nothing and report a clean
  // result, which reads exactly like "this host was already clear".
  if (!canonicalHost(requested)) {
    throw new Error(
      "host must be a bare hostname like 'linear.app' — got " + JSON.stringify(requested)
    );
  }
  var listed = listReferences();
  var matched: string[] = [];
  for (var reference of listed.references) {
    if (hostMatches(reference.host, requested)) matched.push(reference.ref_id);
  }
  // listReferences() already names what it could not parse. A record whose JSON
  // is unreadable may well be from this host, so reporting the host as cleared
  // while it is still on disk would be a false all-clear.
  return {
    host: requested,
    removed: matched,
    skipped: listed.skipped.slice(),
    failed: [],
    index_unreadable: listed.index_unreadable,
    appeared_since_preview: [],
  };
}

// `expected_ref_ids` is the preview's answer handed back.
//
// The confirmation prompt and the deletion are two separate calls, and each one
// reads the directory for itself — so "the same function computes both" makes
// them the same RULE, never the same SNAPSHOT. Preview linear.app with one
// record, capture app.linear.app, confirm: the prompt said one and the delete
// takes two. Nothing in the earlier version noticed.
//
// When the caller passes the ids it was shown, anything matching the host that is
// NOT in that set is left alone and reported in `appeared_since_preview` — the
// over-delete becomes a visible no-op instead of a silent extra removal. Ids in
// the set that no longer match are simply absent from `removed`. Omitting the
// argument keeps the old unsnapshotted behaviour, which is what a caller who
// genuinely means "everything from this host, now" wants.
export function deleteReferencesByHost(host: string, expected_ref_ids?: string[]): ForgetResult {
  var planned = referencesForHost(host);
  var expected = Array.isArray(expected_ref_ids) ? new Set(expected_ref_ids) : null;
  var removed: string[] = [];
  var failed: Array<{ ref_id: string; reason: string }> = [];
  var appeared: string[] = [];
  for (var ref_id of planned.removed) {
    if (expected && !expected.has(ref_id)) { appeared.push(ref_id); continue; }
    // One record that will not delete must not abandon the rest of the takedown
    // half-done — that is the shape this function exists to avoid. It is
    // recorded and the sweep continues, so the caller learns exactly which
    // records still need a human.
    try {
      if (deleteReference(ref_id)) removed.push(ref_id);
    } catch (error) {
      failed.push({ ref_id: ref_id, reason: (error as Error).message });
    }
  }
  return {
    host: planned.host,
    removed: removed,
    skipped: planned.skipped,
    failed: failed,
    index_unreadable: planned.index_unreadable,
    appeared_since_preview: appeared,
  };
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

// Everything needed to show a pattern honestly, in one object.
//
// The corpus holds other people's design work. Raven does not own it, does not
// license it, and the only defensible way to show it is to show where it came
// from — every time, not in a footer somewhere. The provenance was always stored
// (`url`, `host`, `owner`, `captured_at`); what was missing is that a caller
// could take the picture and drop the source, and nothing stopped it.
//
// So `credit` is a ready-to-display string rather than parts a caller has to
// assemble, and — see the `display` object in search_references — the image path
// is nested UNDERNEATH it. A consumer cannot destructure out the picture without
// carrying the attribution along with it. That is the only version of this rule
// an engine can hold; a line in a tool description is a request.
//
// `notice` is present only for third-party records. The user's own product needs
// no disclaimer, and a notice attached to everything is a notice nobody reads.
export interface ReferenceAttribution {
  source_url: string;
  host: string;
  owner: "self" | "third-party";
  captured_at: string;
  credit: string;
  notice?: string;
}

export var THIRD_PARTY_NOTICE =
  "This pattern belongs to its original site, not to Raven or to you. "
  + "Show the source with it, use it as a reference for your own implementation, "
  + "and do not republish it as your own work.";

export function referenceAttribution(reference: PatternReference): ReferenceAttribution {
  var label = reference.app ? reference.app + " (" + reference.host + ")" : reference.host;
  var attribution: ReferenceAttribution = {
    source_url: reference.url,
    host: reference.host,
    owner: reference.owner,
    captured_at: reference.captured_at,
    credit: reference.owner === "third-party"
      ? "Pattern from " + label + " — " + reference.url
      : "Your own pattern from " + label + " — " + reference.url,
  };
  if (reference.owner === "third-party") attribution.notice = THIRD_PARTY_NOTICE;
  return attribution;
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
  // "Non-empty byte array" accepted a single byte as a PNG. The record then
  // advertises an image that no viewer can open, which is worse than no image:
  // the corpus reports a picture it does not have. Checking the 8-byte signature
  // is not validation of the whole file, and does not claim to be — it is the
  // cheap check that separates "a render came back" from "some bytes came back".
  if (!(png instanceof Uint8Array) || png.length < PNG_SIGNATURE.length) {
    throw new Error("png must be a non-empty byte array");
  }
  for (var i = 0; i < PNG_SIGNATURE.length; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) throw new Error("png must be PNG bytes");
  }
  // Rounded AFTER the check, or 0.4 × 0.4 passes "> 0" and is stored as 0 × 0 —
  // a size no consumer can lay out, recorded as though it were measured.
  var width = Math.round(size.width);
  var height = Math.round(size.height);
  if (!isFiniteNumber(size.width) || !isFiniteNumber(size.height)
    || width <= 0 || height <= 0) {
    throw new Error("image size must be positive numbers");
  }
  var file = ref_id + ".png";
  var target = referenceImagePath(ref_id);
  mkdirSync(dirname(target), { recursive: true });
  // Same temp-then-rename shape as atomicWriteJson: a half-written PNG next to a
  // record that advertises it is worse than no image at all. The temp name is
  // per-call rather than fixed: a fixed `<ref>.png.tmp` is a collision between
  // two processes attaching to the same reference, and the loser writes the
  // other's bytes. Cleaned up in `finally`, because a failed rename otherwise
  // leaves the temp file behind forever.
  var temp = target + "." + process.pid + "-" + Math.random().toString(36).slice(2, 10) + ".tmp";
  try {
    writeFileSync(temp, png);
    renameSync(temp, target);
  } finally {
    try { unlinkSync(temp); } catch (_error) { /* renamed away on the success path */ }
  }
  reference.image = { file: file, width: width, height: height, fidelity: "offline" };
  try {
    atomicWriteJson(recordPath(ref_id), reference);
  } catch (error) {
    // The PNG landed but the record that points at it did not. Leaving it is an
    // orphan copy of somebody's design work with no provenance beside it —
    // exactly what the attribution work exists to prevent — so it goes.
    try { unlinkSync(target); } catch (_cleanup) { /* nothing to remove */ }
    throw error;
  }
  return reference;
}

function recordFiles(state: { index_unreadable: boolean }): string[] {
  var home = referenceHome();
  if (!existsSync(home)) return [];
  var indexed: string[] = [];
  try {
    indexed = readIndex().map(function(id) {
      validateReferenceId(id);
      return id + ".json";
    });
  } catch (_error) {
    // NOT a skipped record. The directory scan below finds every record file
    // regardless, so an unreadable index costs nothing and leaves nothing
    // behind; naming it in `skipped` told a caller that a record it could not
    // read was still on disk when the record had in fact just been deleted.
    state.index_unreadable = true;
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
