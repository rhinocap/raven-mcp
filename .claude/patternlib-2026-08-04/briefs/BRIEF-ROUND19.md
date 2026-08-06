# Correctness review — round 19

**Mode: REPORT ONLY.** Do not edit, stage, commit, or reset anything in this
repo. If you need to check a hypothesis, copy files to a temp directory outside
the repo and work there. An earlier round's nested reviewer tripped this repo's
auto-save hook and created a commit; please avoid that.

Repo: `/Users/accunliffe/projects/raven-mcp`, branch `main`, HEAD `4882d1b`.
Node v26.5.0. macOS. This is an open-source MCP server; the review is of my own
code, on my own machine, for correctness.

## What to review

Six claims about this commit. For each, tell me whether it holds. I want
disagreement where I am wrong, and one line where I am right — do not manufacture
a finding. Prefer a measured counterexample over an argument.

Your previous round found four real defects (C1, C2, C4, C5) and confirmed two
claims (C3, C6). Every change below is a response to one of those four, so the
useful question is whether the fix is correct and complete rather than whether
the original problem was real.

### C1 — the private-path gate's anchor rule is the right choice, correctly stated

`test/no-private-paths.test.mjs` stops absolute filesystem paths from someone's
home directory into agent-tooling directories (`.claude`, `.codex`, `.agents`,
`.gstack`, `.cursor`) from being committed to this public repo — they carry
unrelated context. It is a hygiene check, not a security control. This repo's
own `.claude/` is legitimately named in docs and must never be flagged.

You showed both end-based discriminators misclassifying. They are deleted. My
conclusion from your counterexamples was that the question is undecidable from
raw text — a space is a legal path character, so `A /B/.claude` is at once one
path whose directory name ends in a space and two space-separated tokens — and
that the honest move is to pick a reading, state it, and pin the residual.

The rule now: a tooling-directory hit belongs to the **nearest home-directory
start that begins a token**. An anchor preceded by `[A-Za-z0-9._-]` continues a
segment name; one preceded by anything else (space, `/`, `:`, start-of-span)
begins a token. An `outermost` fallback applies when no anchor qualifies.

Claims: (a) the undecidability conclusion is correct — there is no discriminator
that gets both readings right; (b) nearest-token-start is a defensible choice and
the header states its residual accurately; (c) no false negative on any input
where the reading is unambiguous; (d) no false positive on this repo's own
directory. Construct inputs that defeat it. Both directions matter — a noisy gate
gets muted, which is how earlier versions of this failed. If you think a
different reading is better, say which and what it costs.

### C2 — the four new gate fixtures encode rather than detect

Four assertions replaced the two you refuted: (a) repo root + space + a foreign
path; (b) a foreign home whose directory name ends in a space; (c) prose naming
a foreign path and then this repo's own tooling directory (must stay null);
(d) the documented residual, asserted null on purpose.

Isolating (a) from (b) required two separate mutants, because they live in one
test function and `assert` aborts at the first failure.

Claim: each fixture fails on the defect it names and on no other, and (d)
genuinely pins a residual rather than blessing a bug. Is there a wrong
implementation that passes all four?

### C3 — the module-load discriminator now resolves symlinks correctly

`entryPresent` in `test/capture.test.mjs` walked ancestors with `lstat` alone, so
a `dist -> /real/build` symlink pointing at a live directory was classified as a
broken tree. The symlink branch now calls `statSync`: a target that resolves to a
real directory is transparent (entry absent, unbuilt tree); dangling, looping or
non-directory targets are broken. Fixture (h) covers the live-directory case.

Claim: exactly a genuinely unbuilt tree classifies as unbuilt; every other
failure mode rethrows. Consider relative symlink targets, symlink chains, loops
(ELOOP), permission errors on the resolved target, and case-insensitive
filesystems. Is there still a broken tree that reads as unbuilt, or an unbuilt
checkout that now reads as broken?

### C4 — the cookie name/value split is fully covered

`if (separator <= 0)` folds two rejections together — `indexOf` returning -1 (no
`=`) and returning 0 (empty name). No fixture sent a pair without an `=`, so
`=== 0` passed the suite while replaying `flag; Path=/` upstream as `fla=flag`.
A fixture now sends the no-`=` pair, an empty-name pair, and a control that must
survive, asserting the exact replayed header.

Claim: the round-9 suite now fails on any incorrect replayed header. What wrong
implementation does it still pass? Consider the attribute split, multiple
`Set-Cookie` headers on one response, duplicate names, `__Host-`/`__Secure-`
prefixes, and other whitespace classes.

### C5 — the Expires comment now separates RFC conformance from browser parity

You showed the comment claiming browser equivalence it does not have. It now
states that RFC-conformant and browser-equivalent are two claims and that this is
the first only, naming the measured divergence: §5.1.1 floors the year at ≥1601
and Chromium accepts 1600, so `Expires=1600 April 15 21:01:22` is ignored here
(cookie stays a live session cookie) and expired there. The floor stays at the
RFC value. The comment also names the direction: an ignored `Expires` keeps a
cookie the server was trying to kill.

Claims: (a) the divergence is stated accurately and is the only one of its kind
in this parser; (b) keeping the RFC floor is the right call for a proxy that
replays cookies upstream; (c) the round-trip still rejects exactly the
nonexistent dates. Quote header bytes for any disagreement.

### C6 — frozen surfaces are unchanged

108 stdio tools, 45 anonymous remote, sha256 of the sorted anonymous tool names
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`,
`browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical, and no
overlay file in commit `4882d1b`. Verify independently.

## Environment notes — read before reporting a failure

- Run tests with `RAVEN_NO_USAGE_LOG=1 npm test`. Expected on this machine:
  **1272 tests / 1269 pass / 0 fail / 3 skipped**, ~45s.
- **A SKIP IS NOT A FAILURE.** Without Mach-port access, Chromium launches fail
  with `Permission denied (1100)` and browser-backed tests skip. Your last two
  runs saw many skips for this reason. Report the skip count; do not report skips
  as failures.
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
