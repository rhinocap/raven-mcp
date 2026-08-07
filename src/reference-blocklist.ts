import { readFileSync } from "node:fs";
import path from "node:path";

// Hosts Raven refuses to capture from, and WHY it refuses — the two reasons are
// different promises and must stay distinguishable in the refusal a user reads.
//
// docs/PATTERN-LIBRARY-POLICY.md makes both of them in prose:
//   "Raven refuses captures from the curated galleries it knows about" — the
//    named-list mechanism, which the doc-reading test in
//    test/reference-blocklist.test.mjs holds equal to GALLERY_HOSTS in both
//    directions;
//   "the host is added to a do-not-capture list"
// A promise that lives only in a document is kept by whoever happens to have
// read it. This module is the same promise as a refusal.
export type BlockReason = "gallery" | "takedown";

export interface BlockedHost {
  host: string;
  reason: BlockReason;
  // Shown verbatim in the refusal. It is the whole value of the entry to the
  // person who hit it: "blocked" without "here is what to do instead" is an
  // obstacle, not a policy.
  note: string;
}

// Curated galleries. Capturing from one of these is not the same act as
// capturing from the live product a pattern ships in: the gallery's corpus IS
// its curation, mirroring it is what its terms forbid, and its screenshots are
// a third party's rendering rather than a measurement of a running page.
//
// This list is NOT exhaustive and is not a legal determination — it names the
// galleries the policy document names plus their obvious peers. A gallery that
// is missing is a gap in this list, not permission. The policy's wording is
// deliberately split to match: the named list is the ONLY enforcement, and its
// stance sentence ("covers every curated library") is the position the code
// cannot enumerate — this is the enforceable subset of it.
//
// Exported so the doc-parity test compares MEMBERSHIP in this array, not the
// `reason` label — filtering BLOCKED_HOSTS by reason === "gallery" let an
// entry added here with a mislabeled reason escape the doc equality entirely
// (Kimi adverse pass, 2026-08-06, claim 1: the equality was over the label,
// not the list).
export var GALLERY_HOSTS: BlockedHost[] = [
  { host: "mobbin.com", reason: "gallery", note: "Mobbin is a curated pattern library. Capture the pattern from the live product instead — the app or site Mobbin screenshotted." },
  { host: "refero.design", reason: "gallery", note: "Refero is a curated pattern library. Capture from the live product it screenshotted." },
  { host: "screensdesign.com", reason: "gallery", note: "Screensdesign is a curated pattern library. Capture from the live app instead." },
  { host: "clickyhq.com", reason: "gallery", note: "Clicky is a curated pattern library. Capture from the live product instead." },
  { host: "screenlane.com", reason: "gallery", note: "Screenlane is a curated pattern library. Capture from the live app instead." },
  { host: "pttrns.com", reason: "gallery", note: "Pttrns is a curated pattern library. Capture from the live app instead." },
  { host: "ui-patterns.com", reason: "gallery", note: "UI Patterns is a curated pattern library. Capture from a live product using the pattern." },
  { host: "collectui.com", reason: "gallery", note: "Collect UI republishes Dribbble shots. Capture from the live product instead." },
  { host: "land-book.com", reason: "gallery", note: "Land-book is a curated gallery. Capture from the site it links to." },
  { host: "godly.website", reason: "gallery", note: "Godly is a curated gallery. Capture from the site it links to." },
  { host: "lapa.ninja", reason: "gallery", note: "Lapa Ninja is a curated gallery. Capture from the site it links to." },
  { host: "siteinspire.com", reason: "gallery", note: "SiteInspire is a curated gallery. Capture from the site it links to." },
  { host: "saaslandingpage.com", reason: "gallery", note: "SaaS Landing Page is a curated gallery. Capture from the site it links to." },
  { host: "awwwards.com", reason: "gallery", note: "Awwwards is a curated gallery. Capture from the site it awarded." },
  // Portfolio platforms rather than pattern galleries, and included for the same
  // reason: what is on the page is a static image someone uploaded, not the
  // running interface. A capture here would record the grid, not the pattern —
  // including for your OWN work, which is why there is no `owner: "self"`
  // exemption anywhere in this module.
  { host: "dribbble.com", reason: "gallery", note: "A Dribbble shot is an uploaded image, not a running interface. Capture from the live product." },
  { host: "behance.net", reason: "gallery", note: "A Behance project is an uploaded image, not a running interface. Capture from the live product." },
];

// Hosts removed on a rights-holder's request. Seeded empty — nothing has been
// requested. An entry added here ships in the next release and refuses future
// captures; removing the records already on a user's disk is forget_references'
// job, and the policy is honest that installed copies cannot be reached.
var TAKEDOWN_HOSTS: BlockedHost[] = [];

export var BLOCKED_HOSTS: BlockedHost[] = GALLERY_HOSTS.concat(TAKEDOWN_HOSTS);

// A local list, so a takedown does not have to wait for a release and a user can
// add their own hosts. Read on every check rather than cached: the file is tiny,
// and a cache would mean a host added mid-session keeps being captured — the one
// behaviour a do-not-capture list must not have.
//
// Shape: ["example.com", {"host": "example.com", "note": "..."}] — a bare string
// is the common case. Anything unreadable or malformed is IGNORED rather than
// thrown, and that direction is deliberate: a corrupt local file must not brick
// every capture. The cost is that a typo'd entry silently protects nothing, so
// the file is not where a rights-holder request should end up — that belongs in
// TAKEDOWN_HOSTS where it is reviewed and shipped.
export var LOCAL_BLOCKLIST_FILE = "do-not-capture.json";

export function localBlockedHosts(referenceHome: string): BlockedHost[] {
  var file = path.join(referenceHome, LOCAL_BLOCKLIST_FILE);
  var parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (_error) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  var entries: BlockedHost[] = [];
  for (var item of parsed) {
    if (typeof item === "string" && item.trim()) {
      entries.push({ host: item.trim(), reason: "takedown", note: "This host is on your local do-not-capture list (" + LOCAL_BLOCKLIST_FILE + ")." });
      continue;
    }
    if (item && typeof item === "object" && typeof (item as any).host === "string" && (item as any).host.trim()) {
      var note = typeof (item as any).note === "string" && (item as any).note.trim()
        ? (item as any).note.trim()
        : "This host is on your local do-not-capture list (" + LOCAL_BLOCKLIST_FILE + ").";
      entries.push({ host: (item as any).host.trim(), reason: "takedown", note: note });
    }
  }
  return entries;
}

// The matcher is a PARAMETER, and that is the whole design of this function.
//
// The blocklist and forget_references are answering the same question — does
// this host cover that one — and the takedown leg already learned what happens
// when a preview and its action compute the same question two different ways:
// the prompt said one record and confirming removed two. A blocklist that
// matched exact hosts while takedown matched subdomains would be that defect in
// its most damaging direction: a host taken down at `example.com` would keep
// accepting captures from `www.example.com` while reporting the site cleared.
//
// Passing hostMatches in means this module has no matching rule of its own to
// drift. It cannot be fixed on one side and not the other, because there is only
// one side.
export function blockedEntryFor(
  host: string,
  entries: BlockedHost[],
  matches: (recordHost: string, requested: string) => boolean,
): BlockedHost | null {
  if (!host) return null;
  for (var entry of entries) {
    if (matches(host, entry.host)) return entry;
  }
  return null;
}

export class ReferenceBlockedError extends Error {
  host: string;
  reason: BlockReason;
  constructor(entry: BlockedHost, host: string) {
    super(
      (entry.reason === "gallery"
        ? "Raven does not capture from " + entry.host + ", which is a curated pattern gallery. "
        : "Raven does not capture from " + entry.host + " — it is on the do-not-capture list. ")
      + entry.note
      + " (See docs/PATTERN-LIBRARY-POLICY.md.)",
    );
    this.name = "ReferenceBlockedError";
    this.host = host;
    this.reason = entry.reason;
  }
}
