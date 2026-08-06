# Correctness review — pattern-library takedown, round 2

You are reviewing a change to an open-source MCP server (`raven-mcp`). The
feature is a **takedown path** for a local corpus of captured third-party web
patterns: a rights-holder or the user asks for a host's stored references to be
removed, and the tool removes the JSON records and their rendered PNG
thumbnails from disk.

This is round 2. A previous review of round 1 returned eight findings; seven
were fixed and one was documented as deliberately out of scope. **Review the
round-2 code on its own merits.** Do not assume the earlier findings were
fixed correctly, and do not assume the reasoning below is sound.

## Files

- `src/reference-store.ts` — the store (records, index, host matching, delete)
- `src/index.ts` — the MCP tool seam (`forget_references`, `search_references`)
- `src/reference-thumbnail.ts` — headless-Chromium render of a stored reference
- `test/reference-forget.test.mjs` — the takedown suite (19 tests)
- `test/reference-thumbnail.test.mjs`
- Unified diff of the source changes: `agent-output/src.diff`

Read the current files in the working tree, not only the diff.

## The claims to test

1. **A failed removal is retryable.** `deleteReference` unlinks the IMAGE first
   and the RECORD second. The stated reason: if the record went first, a failed
   image unlink would destroy the only thing that could rediscover the orphan
   PNG, so a retry would match nothing and return a clean empty result over a
   file still on disk. The claim is that with the new ordering, a failure leaves
   the reference visible to `search_references`, still matched by host, and
   still reported in `failed[]` on every subsequent attempt.
2. **The reverse half-state is benign.** Image gone, record left: claimed safe
   because `search_references` checks the file with `statSync().isFile()`
   rather than trusting a stored flag.
3. **Host matching is sound.** `canonicalHost` normalises both the stored host
   and the requested one; `hostMatches` allows an exact match or a label-boundary
   suffix. Claims: a host that is not a bare hostname is REFUSED (throws) rather
   than silently widened; canonicalization round-trips so a typo like
   `linear.app/pricing` cannot become `linear.app`; and IP literals never
   participate in suffix matching.
4. **`isIpLiteral` has no reachable trigger** and is documented as
   belt-and-braces behind canonicalization. Supporting measurement (Node 26.5.0):
   WHATWG URL parsing treats a trailing all-numeric label as an IPv4 candidate,
   so `x.127.0.0.1`, `foo.1` and `x.[::1]` throw `ERR_INVALID_URL`, while
   `0.0.1`, `0.1` and `1` canonicalize to `0.0.0.1`. Combined with `readRecord`
   enforcing `host === url.hostname`, the claim is that no stored host can reach
   that clause. **Test this claim directly** — if any input reaches it, say so.
5. **Preview and confirm cannot silently diverge.** They are separate MCP calls
   and therefore separate directory reads; `expected_ref_ids` lets the caller pin
   the set, and anything captured in between is reported in
   `appeared_since_preview` rather than removed.
6. **`skipped` vs `index_unreadable` vs `failed` are three distinct states** and
   the tool's `note` only says "cleared" when all three are empty.
7. **`javaScriptEnabled: false` is described honestly** — "no script runs", not
   an inert document — and `serviceWorkers: "block"` means the offline property
   does not depend on that single flag.
8. **The tests encode rather than merely detect.** Each fix has a mutant that
   fails exactly its own test and no others (except where noted). Check whether
   any test would still pass against a plausible weakening of the code it claims
   to guard.

## What to report

Findings only, ranked P1 (correctness or a false all-clear reaching a user) /
P2 (weaker guarantee than claimed, misleading comment, blind test). For each:
the file and line, the concrete input or sequence that produces the wrong
outcome, and what the wrong outcome IS. If a claim above is overstated in one
direction and understated in another, say both. If a claim survives, say so
briefly rather than padding.

A false all-clear — reporting a host as cleared when third-party material is
still on disk — is the outcome this feature exists to prevent, so weight
findings in that class highest. The inverse (reporting NOT-cleared when the
disk is clean) is also a defect, one class down.

Report only. Do not edit files.
