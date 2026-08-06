# Correctness review — round 17

**Mode: REPORT ONLY.** Do not edit, stage, commit, or reset anything in this
repo. If you need to check a hypothesis, copy files to a temp directory outside
the repo and work there. A previous round's nested reviewer tripped this repo's
auto-save hook and created a commit; please avoid that.

Repo: `/Users/accunliffe/projects/raven-mcp`, branch `main`, HEAD `975b909`.
Node v26.5.0. macOS. This is an open-source MCP server; the review is of my own
code, on my own machine, for correctness.

## What to review

Six claims I made about this commit. For each, tell me whether it holds. I want
disagreement where I am wrong, and one line where I am right — do not manufacture
a finding. Prefer a measured counterexample over an argument.

### C1 — `Expires` parsing conforms to RFC 6265 §5.1.1

`src/grab-bridge.ts` gained `isCookieDateDelimiter` / `parseCookieDate` /
`COOKIE_MONTHS`, and the `expires` branch no longer calls `Date.parse`. The
motivation: `Date.parse` accepts inputs §5.1.1 rejects, and returned `0` for a
date whose day-of-month was preceded by U+00A0 — which the surrounding code then
read as a past expiry.

Claims to check against the RFC text:

- a cookie-date that fails to parse causes the attribute to be ignored (§5.2.1),
  never treated as `0` or as a past date;
- the delimiter set matches §5.1.1 exactly (`%x09`, `%x20-2F`, `%x3B-40`,
  `%x5B-60`, `%x7B-7E`), and everything at or above 0x7F is a non-delimiter;
- the day-of-month / time / year productions are anchored correctly, the month
  match is a case-insensitive 3-char prefix, the two-digit year mapping
  (70–99→+1900, 0–69→+2000) is right, and the post-checks (day 1–31, year ≥
  1601, hour ≤ 23, min/sec ≤ 59) are complete;
- `Max-Age` precedence over `Expires` (§5.3) is unchanged.

Where does this disagree with the RFC, or with what browsers actually do? An
integer or `Date.UTC` edge case, a well-formed date it rejects, a malformed one
it accepts, an ordering issue. Quote the header bytes.

### C2 — `test/no-private-paths.test.mjs` classifies paths correctly

This test stops absolute filesystem paths from someone's home directory into
agent-tooling directories (`.claude`, `.codex`, `.agents`, `.gstack`, `.cursor`)
from being committed to this public repo — they carry unrelated context. It is a
hygiene check, not a security control.

The nested regex was replaced. The scan now walks backward from each
tooling-directory hit to the nearest span break, enumerates every
home-directory start in that window, and reports a hit if any anchor is outside
the repo root. An anchor whose middle contains a space immediately followed by
another rooted home start is treated as prose rather than one path.

Claims: (a) it flags nested cases the previous version missed; (b) it does not
flag this repo's own legitimately-named `.claude/` directory, which appears in
docs and runbooks; (c) it is no longer quadratic in input length.

Check all three. False positives matter as much as misses here — a noisy gate
gets muted, which is how earlier versions of this failed. The prose-join
heuristic is the part I trust least; tell me where it misclassifies.

### C3 — the span-bound fixtures measure contiguity, not just endpoints

There is a fixture at `NESTED_SPAN_MAX / 2` plus two adjacent boundary fixtures.
Claim: a matcher covering the endpoints but not the interior now fails the
suite. Is there a plausible implementation change that passes all three fixtures
while still under-scanning?

### C4 — the module-load discriminator in `test/capture.test.mjs` is correct

`entryPresent` uses `lstat` rather than `existsSync` (which follows symlinks, so
a dangling entry symlink was misread as "this tree was never built" and the run
exited 0 having executed nothing). `isMissingEntryModule` is extracted and
driven in-suite against real fixtures: absent file, dangling symlink, present
regular file, transitive failure with a foreign `url`, transitive failure with
no `url`, syntax error.

Claim: only a genuinely absent entry module classifies as an unbuilt tree;
everything else rethrows. Are those the error shapes Node v26.5.0 actually
produces? Is there a real failure mode still classified as "unbuilt"?

### C5 — the cookie tests encode the property rather than merely detecting a defect

The round-16 name/value assertions were `includes()` checks; they are now an
exact header-string comparison. I verified the exact form fails against a
deliberately wrong implementation that emits both the raw pair and a trimmed
duplicate, where `includes()` passes clean.

Claim: the round-9 suite now fails on any incorrect replayed header. What wrong
implementation does it still pass?

### C6 — frozen surfaces are unchanged

108 stdio tools, 45 anonymous remote, sha256 of the sorted anonymous tool names
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`,
`browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical, and no
overlay file in commit `975b909`. Verify independently.

## Environment notes — read before reporting a failure

- Run tests with `RAVEN_NO_USAGE_LOG=1 npm test`. Expected on this machine:
  **1269 tests / 1266 pass / 0 fail / 3 skipped**, ~44s.
- **A SKIP IS NOT A FAILURE.** Without Mach-port access, Chromium launches fail
  with `Permission denied (1100)` and browser-backed tests skip. A prior round
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
