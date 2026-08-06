import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PATTERN_TAXONOMY, expandQuery, resolveTaxonomy, isStopWord } from "./reference-taxonomy.js";
import { BLOCKED_HOSTS, blockedEntryFor, localBlockedHosts, ReferenceBlockedError } from "./reference-blocklist.js";

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
  taxonomy?: string[];
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
  taxonomy?: string[];
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
  // The do-not-capture check goes FIRST, ahead of every other validation.
  //
  // Its position is the point: a blocked host must be refused for being blocked,
  // not incidentally rescued by a missing selector. Behind the other checks, a
  // well-formed capture from a taken-down site would sail through them all and
  // only then be refused — same outcome — while a MALFORMED one would report a
  // selector problem, get corrected, and be resubmitted. The user would learn
  // the host is off-limits on the second try, from an error that reads like the
  // first one was nearly fine.
  //
  // It also lives in saveReference rather than at the tool seam, because this is
  // the single function every capture path converges on — the MCP handler, the
  // e2e, and any future internal caller. A gate on the handler is a gate one
  // call site can walk around, which is the class of miss this whole feature has
  // been paying for.
  var blocked = blockedEntryFor(
    url.hostname,
    BLOCKED_HOSTS.concat(localBlockedHosts(referenceHome())),
    hostMatches,
  );
  if (blocked) throw new ReferenceBlockedError(blocked, url.hostname);
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
  var taxonomy = validateTaxonomyIds(input.taxonomy);

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
  if (input.taxonomy !== undefined) reference.taxonomy = taxonomy;

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
    } catch (error) {
      // A file the INDEX names but the directory does not hold is not an
      // unreadable record — it is a record that is GONE, with an index that has
      // not caught up. deleteReference unlinks the record and then rewrites the
      // index, so any failure between those two lines lands here on every
      // subsequent read, and recordFiles unions the index with the directory, so
      // the stale id survives the scan. Filing it as `skipped` made a takedown
      // report "N unreadable record(s) were left on disk" about a disk that is
      // clean — and no later call could clear it, because nothing prunes the
      // index for a file that is not there. That is the retryability claim in
      // deleteReference failing in the other direction: not a false all-clear,
      // but a permanent false NOT-clear.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
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
  var query = typeof opts.query === "string" ? opts.query.trim() : "";
  var allExpanded = expandQuery(query);
  var exactTerms = originalQueryTerms(query);
  var expandedTerms = matchableQueryTerms(query, allExpanded, exactTerms);
  var partialTerms = partialQueryTerms(query, allExpanded, exactTerms);
  var results: Array<{ reference: PatternReference; score: number; why: string }> = [];
  for (var reference of corpus.references) {
    if (!matchesFilters(reference, opts)) continue;
    var matches: string[] = [];
    var score = 0;
    if (query) {
      var noteMatch = bestTermMatch([reference.note || ""], expandedTerms, exactTerms, partialTerms);
      var appMatch = bestTermMatch([reference.app || ""], expandedTerms, exactTerms, partialTerms);
      var tagMatch = bestTermMatch(reference.tags.concat(reference.taxonomy || []), expandedTerms, exactTerms, partialTerms);
      var selectorMatch = bestTermMatch([reference.selector], expandedTerms, exactTerms, partialTerms);
      if (noteMatch) { score += weightedMatch(4, noteMatch.tier); matches.push(matchReason("note", noteMatch)); }
      if (appMatch) { score += weightedMatch(3, appMatch.tier); matches.push(matchReason("app name", appMatch)); }
      if (tagMatch) { score += weightedMatch(2, tagMatch.tier); matches.push(matchReason("tags", tagMatch)); }
      if (selectorMatch) { score += weightedMatch(1, selectorMatch.tier); matches.push(matchReason("selector", selectorMatch)); }
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
  // Records still matching the host AFTER the sweep, read back from disk rather
  // than inferred from what this run did. `appeared_since_preview` only ever
  // names what the PIN excluded, so an unpinned call — or a capture that lands
  // after the plan was computed — left material on disk with every failure field
  // empty and the tool reporting the host cleared. The re-read cannot close that
  // window (a capture landing after it is still missed), but it moves the
  // unobserved gap from "the whole sweep" to "the last few syscalls".
  still_present: string[];
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

// canonicalHost NORMALISES; it does not judge. WHATWG hostname parsing accepts
// strings no name server could answer for: `linear..app`, `.linear.app`, `-x.app`
// and a 300-character label all parse and come back unchanged (measured, Node
// 26.5.0). That is harmless for matching and dangerous for a takedown — a host
// typed with one of those in it matches nothing, and "matched nothing" is
// returned as `removed: []` with every failure field empty, which is the exact
// shape of "this host was already clear". The typo produced the empty result,
// not the corpus, and nothing in the answer says so.
//
// The check lives at the REQUEST seam and deliberately NOT inside canonicalHost.
// hostMatches canonicalises the STORED host through the same function, and a
// record captured from a malformed authority has to stay matchable — `-x.app` is
// a subdomain of `app` and must still come out on a takedown for `app`.
// Tightening the shared normaliser would make exactly those records unmatchable
// while still reporting the host cleared, which is the false all-clear this
// function exists to prevent, one layer down.
//
// Underscores are allowed: they are illegal in a DNS hostname and legal in a URL
// authority, browsers resolve them, and a corpus can hold one. Refusing to take
// down a host a record actually has is the inverse failure.
var HOST_LABEL = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/;

export function hostSyntaxProblem(host: string): string | null {
  // An address is not a name and has no labels to check. canonicalHost has
  // already normalised the odd IPv4 spellings by the time this runs.
  if (isIpLiteral(host)) return null;
  if (host.length > 253) return "it is longer than 253 characters, which no hostname is";
  for (var label of host.split(".")) {
    if (!label) return "it has an empty label — two dots in a row, or a leading dot";
    if (label.length > 63) return "the label " + JSON.stringify(label) + " is longer than 63 characters";
    if (!HOST_LABEL.test(label)) {
      return "the label " + JSON.stringify(label) + " is not a legal hostname label";
    }
  }
  return null;
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
  //
  // Plenty of input REACHES this line — `hostMatches("127.0.0.1", "127.0.0.2")`
  // is two addresses and hits it on the first operand. An earlier version of this
  // comment said no input reached it at all, which was simply false and made the
  // clause look like dead code a cleanup could take. What no input does today is
  // reach it and CHANGE the outcome: every case that gets here is one where the
  // suffix test below would have answered false anyway. The clause is here so a
  // future change to canonicalHost cannot quietly reopen the class.
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
  var canonical = canonicalHost(requested);
  if (!canonical) {
    throw new Error(
      "host must be a bare hostname like 'linear.app' — got " + JSON.stringify(requested)
    );
  }
  // Parseable is not the same as real. See hostSyntaxProblem: a takedown for
  // `linear..app` matches nothing and reads back as a clean, cleared host.
  var problem = hostSyntaxProblem(canonical);
  if (problem) {
    throw new Error(
      "host " + JSON.stringify(requested) + " cannot name a site — " + problem
      + ". Nothing was removed; check the spelling. A takedown that matches nothing "
      + "returns an empty result, which reads exactly like 'already cleared'."
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
    // A plan, not a sweep — nothing has been removed yet, so everything matched
    // is still present and naming it here twice would say nothing.
    still_present: [],
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
  // Read the disk back rather than reporting what this run intended.
  //
  // Everything above is computed from ONE scan taken before the first unlink, so
  // the answer describes a directory as it was, not as it is. Two ordinary cases
  // land material outside every failure field: an unpinned call cannot flag what
  // appeared mid-sweep (there is no baseline to compare against), and a capture
  // that finishes after the plan was computed is simply not in it. Both end with
  // `removed` populated, `failed`/`appeared_since_preview` empty, and a record
  // from the host still on disk — reported as cleared.
  //
  // This does not make the sweep atomic and does not claim to: a capture landing
  // after this line is still missed. It narrows the unobserved window from the
  // whole sweep to the gap between the last unlink and this read, and turns the
  // common case from a false all-clear into a named leftover the caller can act on.
  var remaining: string[] = [];
  try {
    for (var stillThere of referencesForHost(host).removed) {
      // Only what is not already named. A pinned-out record and a failed one are
      // both correctly still on disk and both already reported; repeating them
      // here would make every pinned call look like it left something behind.
      if (appeared.indexOf(stillThere) !== -1) continue;
      if (failed.some(function(entry) { return entry.ref_id === stillThere; })) continue;
      remaining.push(stillThere);
    }
  } catch (_error) {
    // The re-read is a check on the sweep, not part of it. If it cannot run, the
    // removals above still happened and are still reported; swallowing here keeps
    // a verification failure from being read as a deletion failure.
  }
  return {
    host: planned.host,
    removed: removed,
    skipped: planned.skipped,
    failed: failed,
    index_unreadable: planned.index_unreadable,
    appeared_since_preview: appeared,
    still_present: remaining,
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

function normalizedSearchTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function originalQueryTerms(query: string): string[] {
  var words = normalizedSearchTerm(query).split(" ").filter(Boolean);
  var phrases = PATTERN_TAXONOMY.flatMap(function(entry) {
    return [entry.id, entry.label].concat(entry.aliases).map(normalizedSearchTerm);
  }).filter(function(term) { return term.includes(" "); }).sort(function(a, b) {
    return b.split(" ").length - a.split(" ").length;
  });
  var exact: string[] = [];
  var i = 0;
  while (i < words.length) {
    var phrase = phrases.find(function(candidate) {
      return candidate.split(" ").every(function(part, offset) { return words[i + offset] === part; });
    });
    // A standalone stop word never becomes an exact term. This is the path that
    // scored at FULL weight, so leaving it here would keep "in" beating a real
    // alias hit even after expandQuery was cleaned up.
    if (phrase || !isStopWord(words[i])) exact.push(phrase || words[i]);
    i += phrase ? phrase.split(" ").length : 1;
  }
  return Array.from(new Set(exact));
}

function matchableQueryTerms(query: string, expandedTerms: string[], exactTerms: string[]): string[] {
  var originalWords = new Set(normalizedSearchTerm(query).split(" ").filter(Boolean));
  var exact = new Set(exactTerms);
  var resolvedTerms = new Set(exactTerms.flatMap(function(term) {
    return resolveTaxonomy(term).flatMap(function(entry) {
      return [entry.id, entry.label].concat(entry.aliases).map(normalizedSearchTerm);
    });
  }));
  // Original tokens remain visible in expandQuery's public result, as promised.
  // A word consumed by a recognized multi-word phrase does not match at full
  // strength, so "scroll down arrow" cannot score a lone "arrow" record like a
  // real hit. Terms produced by the resolved entry survive: "hero image" must
  // still match a reference bound to the one-word taxonomy id "hero".
  return expandedTerms.filter(function(term) {
    var normalizedTerm = normalizedSearchTerm(term);
    return exact.has(normalizedTerm) || resolvedTerms.has(normalizedTerm) || !originalWords.has(normalizedTerm);
  });
}

// The words the filter above held back — the constituents of a recognized
// phrase. They are DEMOTED, not discarded.
//
// Discarding them made the search non-monotonic in the worst direction:
// measured, "pricing" found the pricing record and "toggle" found it, while
// "pricing toggle" found NOTHING, because the phrase is a taxonomy entry, was
// consumed atomically, and no record was bound to it. Adding a word to a query
// deleted every result. On a tool whose whole job is "show me some examples",
// a recall cliff triggered by being more specific is the same failure as having
// no search — and it is invisible in a one-record fixture.
//
// Precision is preserved by rank instead of by exclusion: a record matching the
// whole phrase still outscores one matching only a constituent word, which is
// the property the original suppression was reaching for.
function partialQueryTerms(query: string, expandedTerms: string[], exactTerms: string[]): string[] {
  var matchable = new Set(matchableQueryTerms(query, expandedTerms, exactTerms).map(normalizedSearchTerm));
  var held: string[] = [];
  for (var term of expandedTerms) {
    var normalizedTerm = normalizedSearchTerm(term);
    if (!normalizedTerm || matchable.has(normalizedTerm)) continue;
    held.push(normalizedTerm);
  }
  return Array.from(new Set(held));
}

// Word-START matching, not raw substring.
//
// `field.includes(term)` matched "in" inside "pricing" and would match "cue"
// inside "rescue" — a captured pattern was scoring on letters that happen to
// sit in the middle of an unrelated word. A term only counts where it begins a
// word. Both sides are normalized to space-separated lowercase words by
// normalizedSearchTerm, so testing for a leading space is a token-boundary test
// and needs no regex.
//
// PREFIX rather than whole-word is deliberate, and it is the one place this
// stays deliberately loose: "scroll" must still match a note that says
// "scrolling", which is the most likely way a searcher's word and a captured
// note disagree. The cost is that a short non-stop-word term over-matches by
// prefix ("nav" hits "navigation", wanted; "ui" hits "uikit", tolerable). Stop
// words are what made that cost unacceptable, and they are gone before we get
// here.
function fieldMatchesTerm(field: string, term: string): boolean {
  if (!term) return false;
  return (" " + field).includes(" " + term);
}

type MatchTier = "exact" | "alias" | "partial";

function bestTermMatch(
  fields: string[],
  terms: string[],
  exactTerms: string[],
  partialTerms: string[],
): { term: string; tier: MatchTier } | null {
  var normalizedFields = fields.map(normalizedSearchTerm);
  function hit(term: string): boolean {
    return normalizedFields.some(function(field) { return fieldMatchesTerm(field, term); });
  }
  // Strongest tier wins the field, so a record is never described by a weaker
  // reason than the one it actually earned.
  for (var exact of exactTerms) {
    if (hit(exact)) return { term: exact, tier: "exact" };
  }
  for (var term of terms) {
    var normalizedTerm = normalizedSearchTerm(term);
    if (hit(normalizedTerm)) return { term: normalizedTerm, tier: "alias" };
  }
  for (var partial of partialTerms) {
    if (hit(partial)) return { term: partial, tier: "partial" };
  }
  return null;
}

function weightedMatch(weight: number, tier: MatchTier): number {
  // 0.1 breaks a same-field tie without changing the field hierarchy. 0.5 is
  // larger on purpose: a partial hit is a genuinely weaker claim and must lose
  // to any full hit on the same field, while still ranking above nothing.
  // Both stay under 1 so the 4/3/2/1 field weights are never reordered.
  if (tier === "exact") return weight;
  return tier === "alias" ? weight - 0.1 : weight - 0.5;
}

function matchReason(field: string, match: { term: string; tier: MatchTier }): string {
  if (match.tier === "exact") return field;
  if (match.tier === "alias") return field + ' via alias "' + match.term + '"';
  return field + ' partially via "' + match.term + '"';
}

function validateTaxonomyIds(value: string[] | undefined): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(function(id) { return typeof id === "string"; })) {
    throw new Error("taxonomy must be an array of strings");
  }
  var ids = Array.from(new Set(value));
  var known = new Set(PATTERN_TAXONOMY.map(function(entry) { return entry.id; }));
  for (var id of ids) {
    if (known.has(id)) continue;
    var near = PATTERN_TAXONOMY.map(function(entry) {
      return { id: entry.id, distance: editDistance(id, entry.id) };
    }).sort(function(a, b) { return a.distance - b.distance || a.id.localeCompare(b.id); }).slice(0, 3);
    throw new Error('Unknown taxonomy id "' + id + '". Near matches: ' + near.map(function(item) { return item.id; }).join(", "));
  }
  return ids;
}

function editDistance(a: string, b: string): number {
  var previous = Array.from({ length: b.length + 1 }, function(_, index) { return index; });
  for (var i = 0; i < a.length; i += 1) {
    var current = [i + 1];
    for (var j = 0; j < b.length; j += 1) {
      current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)));
    }
    previous = current;
  }
  return previous[b.length];
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

// The takedown route travels WITH the notice, and that placement is the point.
//
// docs/PATTERN-LIBRARY-POLICY.md states the route, but a rights holder does not
// read the policy file of a tool they have never installed — they encounter this
// corpus through an agent showing them a pattern of theirs, and this string is
// what is attached to it at that moment. A takedown apparatus nobody can find
// from the artifact is the same as not having one, which is most of what
// separates a curated corpus from a scrape.
export var TAKEDOWN_URL = "https://github.com/rhinocap/raven-mcp/issues";

export var THIRD_PARTY_NOTICE =
  "This pattern belongs to its original site, not to Raven or to you. "
  + "Show the source with it, use it as a reference for your own implementation, "
  + "and do not republish it as your own work. "
  + "If you own it and want it removed, open an issue at " + TAKEDOWN_URL
  + " naming the site — a link is enough.";

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
  // The record was read at the top of this function and a headless Chromium
  // render happened in between, so the reference in hand is a cached copy of
  // something that may no longer exist. A takedown landing inside that window
  // removed the record and its image, reported success, and then this write put
  // BOTH back: third-party JSON and a rendered PNG of somebody's design, restored
  // after they were told it was gone. The takedown's report was already sent.
  //
  // Re-reading the path closes the render-sized hole, not the whole race — a
  // removal between this check and the write still resurrects. That residual is
  // two syscalls wide instead of several seconds, and it is stated rather than
  // implied because nothing here can close it: the store has no lock.
  if (!existsSync(recordPath(ref_id))) {
    try { unlinkSync(target); } catch (_cleanup) { /* nothing to remove */ }
    throw new Error(
      "reference " + ref_id + " was removed while its image was being rendered; "
      + "the image was discarded rather than restoring a record that was deleted"
    );
  }
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
  if (value.taxonomy !== undefined) validateTaxonomyIds(value.taxonomy as string[]);
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
