# 2026-08-06 — Mobbin posture: integration, search fixes, do-not-capture gate

Main-session log. The delegated half is `2026-08-06-mobbin-posture-leg-b.md`;
its two false claims are corrected at the bottom of that file.

## Where we left off

Andrew: **"Let's just do it the same way mobbin does"** — adopt Mobbin's posture
(a curated corpus of other people's patterns, browsable by intent, attributed at
source, with a real takedown apparatus) rather than a corpus-of-one that never
leaves the machine. Running as a standing loop: *"keep working like this is a
/loop or /goal workflow until everything is done and ready for me to test."*

Delegation constraint still in force: **Codex and OpenRouter only, never
Anthropic** — he is near his Anthropic limits.

## This session

### 1. Two search defects closed

**The ranking inversion the leg shipped.** Phrase expansion suppressed the
constituent words of a matched phrase, so `pricing` → 1 result, `toggle` → 1,
`pricing toggle` → **0**. Adding a word to a query deleted every result. Fixed by
demoting constituents into a third "partial" tier instead of discarding them: a
longer query can now re-rank but never empty the corpus. Guarded by
*"adding a word to a query does not delete every result"*.

**The ranking test that could not fail.** Its two fixtures both carried selectors
the query happened to hit, so the fragment record picked up a second partial hit
on its own `.arrow` selector and tied the score at 2.0 — the assertion read
`2 must beat 2`. Both selectors are inert now (`.alpha` / `.beta`) with the
confounder named in a comment, so tags are the only field in play.

**Matching is word-START, not substring** — `(" " + field).includes(" " + term)`.
A token-boundary test that needs no regex, since both sides normalize to
space-separated lowercase words. Prefix rather than whole-word is deliberate:
`scroll` must match `scrolling`.

### 2. A test that measured nothing

`a stop word inside a recognized alias is not stripped` used the fixture
`cmd k menu`, which **contains no stop word**. It passed under every mutant,
including the one deleting the behaviour it names. Measured which aliases
actually carry stop words, rewrote around `sign in with google`, and the test now
asserts its own fixture (`isStopWord('in') === true`) so a taxonomy edit that
removes the property turns it red rather than making it vacuous.

### 3. Four false mutation claims corrected, then five more

The search matrix had four "Only this test turns red" comments that had never
been run. All corrected in place with the measured blast radius. The sharpest:
the claim that reverting `fieldMatchesTerm` turns the discrimination test red is
**false** — with stop words gone, `.includes` on "scroll cue"/"hero" reaches
neither the pricing record nor the footer.

Same discipline applied to the new blocklist matrix, which found five more of my
own: B1 (6 red, claimed 2), B4 (3, claimed 1), B5 (3, claimed 1), B9 (2, claimed
1), B10 (3, claimed 1). **B4 and B5 turn exactly the same three tests red**, and
that is not fixable — reading the list once is a strict subset of the observable
effects of never reading it, so no input can separate "cached" from "never read".
Both are caught, neither is isolated, and the comment now says so instead of
claiming an isolation it does not have.

### 4. The policy document became a refusal

`docs/PATTERN-LIBRARY-POLICY.md` made two promises in prose — *"Raven does not
scrape pattern galleries"* and *"the host is added to a do-not-capture list"*.
A gate that lives only in prose gets bypassed by the next agent that reads it, so
`src/reference-blocklist.ts` is the same promise as code:

- 16 seeded gallery hosts (Mobbin, Refero, Screensdesign, Clicky, Screenlane,
  Pttrns, UI Patterns, Collect UI, Land-book, Godly, Lapa, SiteInspire, SaaS
  Landing Page, Awwwards, Dribbble, Behance), each with a note saying **what to
  capture instead**. A block with no route forward is an obstacle the user routes
  around by disabling the check.
- `TAKEDOWN_HOSTS`, seeded empty.
- A local `do-not-capture.json` read **on every check, never cached** — a cache
  means a host added mid-session keeps being captured, the one behaviour a
  do-not-capture list must not have. Corrupt or wrong-shaped file is ignored
  rather than thrown: bricking every capture is the worse direction.
- **No `owner: "self"` exemption.** A Dribbble shot is an uploaded image whoever
  posted it, so capturing your own records the grid, not the pattern.

Two design decisions carry the weight:

**Position.** The refusal is the FIRST check in `saveReference`, ahead of the
other validations, so a blocked host is refused for being blocked rather than
incidentally rescued by a missing selector.

**The matcher is a parameter.** `blockedEntryFor(host, entries, hostMatches)` has
no matching rule of its own to drift from the takedown's rule. This is the
generalized form of the defect the takedown leg already shipped once — its
preview said "1 record would be removed" and confirming removed 2, because the
preview and the action computed the same question two different ways. A blocklist
matching exact hosts while takedown matched subdomains would be that defect in
its most damaging direction: a host taken down at `example.com` still accepting
captures from `www.example.com` while reporting the site cleared.

`THIRD_PARTY_NOTICE` now carries `TAKEDOWN_URL` — a corpus of other people's work
needs a route for its owners, and one that exists only in a doc is not a route.

### 5. Taxonomy parameter made discoverable

The leg's `taxonomy` param told an agent to use "Raven's controlled vocabulary"
with no way to see the 36 ids, while `saveReference` throws on an unknown one.
The description now **interpolates the id list from `PATTERN_TAXONOMY`** at
registration, so it cannot drift from the validator that rejects unknown ids.
Interpolate, don't transcribe.

## Verification

- `RAVEN_NO_USAGE_LOG=1 npm test` → **1349 total / 1346 pass / 0 fail / 3 skipped**
  (baseline 1324; +8 leg, +3 taxonomy, +3 store, +11 blocklist — accounted exactly).
- Search mutation matrix: **14/14 detected**.
- Blocklist mutation matrix: **11/11 detected**.
- Both harnesses run a clean baseline and abort if it is not green, and
  `import()`-check every mutant so a syntax error is never mistaken for a
  detection.
- Tool count **109 stdio / 64 gated**, `manifest.json` untouched — no new tools.
- Golden anonymous-45 hash `f64bb18…2bb0a6` green in all six asserting suites.

## State at end of session

- Committed locally. **Not pushed** — a push to `main` touching `src/` deploys
  the live `mcp.ravenmcp.ai` endpoint and is Andrew-gated. The earlier
  "go ahead and push" authorized one specific push and does not carry forward.
- npm remains at 2.3.0 / 105 tools. Repo, published and deployed still disagree,
  by design.

## Carried forward

1. Orchestrator-owned done-gate + Sol falsification pass before any completion
   claim reaches Andrew.
2. CLAUDE.md ground-truth block: test count, the blocklist suite, the
   preview/action-matcher landmine, the intent-search notes.
3. **Leg C (seed corpus)** — blocked on Andrew: does a curated set of third-party
   captures get committed to this PUBLIC repo, or ship as a fetched artifact?
4. **Leg D** — the browse/pick surface, then the implement hand-off left open
   when `compose_build_prompt` was deleted. This is the half of his use case
   still missing: *"I could have chosen one and it would then implement for me."*
5. Grab session on port 63499 (proxying github.com) still up — offer to stop it.
6. Andrew's open gates: `npm publish`, `cd web && vercel deploy --prod`, the
   force-push decision, and whether he wants a dedicated takedown address rather
   than GitHub issues.
