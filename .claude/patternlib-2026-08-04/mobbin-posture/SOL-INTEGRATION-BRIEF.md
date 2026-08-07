# Falsification brief — pattern-library intent search + do-not-capture gate

You are auditing a commit in the public repo `rhinocap/raven-mcp` (an open-source
MCP server). Your job is to REFUTE the claims below, not to confirm them. Report
only — do not edit any file.

## Read these
- `src/reference-blocklist.ts`      (new)
- `src/reference-store.ts`          (the `saveReference` refusal, and the search
                                     scoring / `expandQuery` / `fieldMatchesTerm`
                                     path)
- `src/reference-taxonomy.ts`       (new)
- `test/reference-blocklist.test.mjs`
- `test/reference-store.test.mjs`
- `test/reference-taxonomy.test.mjs`
- `docs/PATTERN-LIBRARY-POLICY.md`  (the prose the code is meant to enforce)
- `src/index.ts`                    (the `capture_reference` / `search_references`
                                     tool registrations)

## Context
Raven stores design patterns captured from OTHER PEOPLE'S live websites, so a
user can browse them by intent and reimplement one. The policy document promises
Raven never captures from curated pattern galleries (Mobbin, Refero, Dribbble,
...) and that a rights-holder's host can be added to a do-not-capture list. This
commit turns those two prose promises into code.

## Claims to attack

C1. The do-not-capture gate cannot be bypassed by any capture path. The refusal
    is the first check in `saveReference`, and `saveReference` is the single
    function every capture route converges on.

C2. The blocklist and the takedown feature (`forget_references` in
    `src/reference-forget.ts`) can never disagree about whether a host covers
    another, because `blockedEntryFor` takes the matcher as a PARAMETER and is
    handed the same `hostMatches` the takedown uses. Verify this is actually the
    same function and that no second matching rule exists anywhere.

C3. The local `do-not-capture.json` takes effect within a running process, and a
    corrupt or wrong-shaped file degrades to "no local entries" rather than
    breaking every capture.

C4. Search is monotonic in the sense that matters: adding a word to a query can
    re-rank results but can never take a non-empty result set to empty. Try to
    construct a query pair that still empties it.

C5. Word-START matching (`(" " + field).includes(" " + term)`) is correct for
    this corpus: `scroll` reaches `scrolling`, and no unintended mid-word match
    survives. Find a real-world tag/note/selector where it misfires.

C6. Every test in the three test files can actually FAIL. Find any test whose
    fixture cannot exercise the property its name claims — one such test was
    already found and rewritten (`cmd k menu` contained no stop word), so assume
    there are more.

C7. The mutation-proof comments state measured blast radii. Nine were found wrong
    and corrected. Find any remaining comment whose claim is still false.

C8. The `taxonomy` tool parameter is discoverable: its description interpolates
    the valid id list from the same array the validator rejects against, so an
    agent can never be told to use a vocabulary it cannot see.

## Also look for, unprompted
- Anything that makes the gate a false ALL-CLEAR (reporting a host blocked or
  removed when it is not) — that is the one forbidden outcome here.
- Any way a capture of a blocked host still leaves bytes on disk.
- Any place the policy document promises something the code does not do, or the
  code does something the policy does not disclose.
- Reachability: any clause with no input that can trigger it, or any guard whose
  failure mode is indistinguishable from its success mode.

Rank findings P1/P2/P3 and end with a single verdict line: SURVIVES or DOES NOT
SURVIVE.
