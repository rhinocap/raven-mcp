# Correctness review — round 18

**Mode: REPORT ONLY.** Do not edit, stage, commit, or reset anything in this
repo. If you need to check a hypothesis, copy files to a temp directory outside
the repo and work there. A previous round's nested reviewer tripped this repo's
auto-save hook and created a commit; please avoid that.

Repo: `/Users/accunliffe/projects/raven-mcp`, branch `main`, HEAD `b22875d`.
Node v26.5.0. macOS. This is an open-source MCP server; the review is of my own
code, on my own machine, for correctness.

## What to review

Six claims about this commit. For each, tell me whether it holds. I want
disagreement where I am wrong, and one line where I am right — do not manufacture
a finding. Prefer a measured counterexample over an argument.

Your previous round found five real defects across these same areas. Each fix
below is a response to one of them, so the useful question is whether the fix is
correct and complete rather than whether the original problem was real.

### C1 — cookie-date calendar validity is now correct and complete

`parseCookieDate` in `src/grab-bridge.ts` previously ended in `Date.UTC(...)`.
The 1–31 day-of-month test RFC 6265 §5.1.1 step 5 specifies is not a calendar
check, and `Date.UTC` normalises rather than failing, so `31 Apr 2020` became
`1 May 2020`. §5.1.1 step 6 says a date that does not exist must fail to parse.
The tail now round-trips all six fields (year, month, day, hour, minute, second)
through `new Date(Date.UTC(...))` and returns null on any mismatch.

Claims: (a) the round-trip rejects exactly the nonexistent dates and no valid
ones; (b) leap years, leap-day boundaries, the two-digit-year mapping and the
year ≥ 1601 floor still behave; (c) nothing else in the parse path can produce a
normalised date. Where does this reject a date browsers accept, or accept one
they reject? Quote the header bytes.

### C2 — the private-path gate's two end-based discriminators are correct

`test/no-private-paths.test.mjs` stops absolute filesystem paths from someone's
home directory into agent-tooling directories (`.claude`, `.codex`, `.agents`,
`.gstack`, `.cursor`) from being committed to this public repo — they carry
unrelated context. It is a hygiene check, not a security control. This repo's
own `.claude/` is legitimately named in docs and must never be flagged.

Your last round showed the `PROSE_JOIN` middle-of-span heuristic misclassified in
both directions. It is deleted. Two discriminators replace it, both looking at
where a path ends:

1. a matched span beginning with `repoRoot + ' '` is skipped — this checkout's
   root followed by something else, and whatever follows gets its own anchor;
2. a tooling-directory hit whose immediately preceding character is a space is
   skipped — it begins its own rooted token, because a path segment cannot be
   empty, so a genuine continuation always has a non-space character before the
   separator.

Claims: (a) no false negative — a real leak is still reported regardless of
spaces, prose, or repo-root text nearby; (b) no false positive on this repo's own
legitimately-named directory; (c) the scan is still linear-ish and the per-hit
bound still holds.

Construct inputs that defeat either discriminator. Both directions matter — a
noisy gate gets muted, which is how earlier versions of this failed.

### C3 — the span-bound sweep

The single interior fixture was replaced by a deterministic 21-point sweep across
`1 … NESTED_SPAN_MAX`, and the comment now states that no finite fixture set can
prove contiguity — the sweep raises the cost of a passing mutant rather than
establishing the property.

Claim: that statement is honest and the sweep is well chosen. Is there a
plausible implementation change that passes all 21 points while under-scanning a
range a real path could occupy?

### C4 — the module-load discriminator classifies broken trees correctly

`entryPresent` in `test/capture.test.mjs` previously read every `lstat` failure
as "entry absent", so a broken tree exited 0 having executed nothing. Now only
`ENOENT` counts as absent; every other errno returns "present" (rethrow), and the
`ENOENT` case walks up the ancestor chain — an ancestor that exists but is not a
directory means broken, a real directory above the entry means absent. Fixtures
are real trees in a temp directory: regular-file ancestor, dangling directory
symlink, plus a control for an absent entry under absent directories.

Claim: exactly a genuinely unbuilt tree classifies as unbuilt; every other
failure mode rethrows. Are those the errnos Node v26.5.0 and macOS actually
produce? Is there a real failure mode still classified as "unbuilt", or a
legitimately unbuilt checkout now misclassified as broken? Consider permissions,
symlink loops, and case-insensitive filesystems.

### C5 — the cookie name/value tests now cover both ends

Every U+00A0 fixture in the previous three rounds padded the leading edge. §5.2
removes WSP from both ends of the name and both ends of the value, so a trailing
pad is a separate path through the same rule. A trailing-pad test was added and
verified against a mutant that adds `0xa0` to the trailing-trim loop: the new
test fails, the leading-pad test passes clean.

Claim: the round-9 suite now fails on any incorrect replayed header. What wrong
implementation does it still pass? Consider other whitespace classes, the
attribute split, multiple `Set-Cookie` headers, and pairs with no `=`.

### C6 — frozen surfaces are unchanged

108 stdio tools, 45 anonymous remote, sha256 of the sorted anonymous tool names
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`,
`browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical, and no
overlay file in commit `b22875d`. Verify independently.

## Environment notes — read before reporting a failure

- Run tests with `RAVEN_NO_USAGE_LOG=1 npm test`. Expected on this machine:
  **1271 tests / 1268 pass / 0 fail / 3 skipped**, ~44s.
- **A SKIP IS NOT A FAILURE.** Without Mach-port access, Chromium launches fail
  with `Permission denied (1100)` and browser-backed tests skip. Your last run
  saw 71 skips for this reason. Report the skip count; do not report skips as
  failures.
- Probe gotchas: bare `buildServer()` is NOT the stdio path — pass
  `buildServer({ remote: false, tasteStore: new FsTasteStore() })` for stdio and
  `buildServer({ remote: true })` with NO store for the anonymous 45.
- `node test/e2e-pattern-library.mjs` is not in `npm test`; it fetches live
  github.com and needs real Chromium.

## Output contract

One section per claim (C1…C6) with a verdict of HOLDS or DOES NOT HOLD, and for
every DOES NOT HOLD: the concrete input, what happens, and why it matters.
Rank them by real-world consequence. Say "uncertain" where you are uncertain.

End your report with a line of exactly this form:

`SUMMARY: ALL CLAIMS HOLD`

or

`SUMMARY: SOME CLAIMS DO NOT HOLD`
