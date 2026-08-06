# Round 16 — adverse falsification brief (report only)

You are auditing round 16 of the Raven pattern-library work in
`/Users/accunliffe/projects/raven-mcp`. **Report only. Do not edit any file.**
Your job is to REFUTE the claims below, not to confirm them. Default to
"does not survive" when you cannot prove a claim.

Round 16 exists because round 15's pass returned `OVERALL: DOES NOT SURVIVE` on
five of six claims — and four of those five were defects in code written *in
round 15* to close an earlier adverse finding. The base rate here is that a
just-written fix is wrong. Treat every claim below as suspect by construction,
and pay particular attention to the fix that was applied to only one of two
call sites, because that is exactly what round 15 got wrong.

The commit under audit is `8476646` on `main`. `git show 8476646` is the diff.

## The claims

**C1 — the cookie parser now applies RFC 6265 §5.2 WSP-only trimming at BOTH
splits.** `src/grab-bridge.ts` uses `trimWsp()` (SP 0x20 and HTAB 0x09 only) at
the attribute split *and* at the cookie name/value split. Round 15 had fixed only
the attribute half, so a value padded with U+00A0 was stored and replayed with
the pad stripped — a credential the server never issued — and a padded NAME was
merged into a different cookie.

Attack it. Is §5.2 actually WSP-only for the name/value pair, or have I
over-corrected in a way that breaks a value a browser would accept? Are there
any REMAINING `.trim()` or `\s`-class normalisations anywhere in the cookie
path — parsing, storage, replay, the `Domain`/`Path`/`Expires` handling, the
header join? Does retaining a non-ASCII pad in the NAME break the jar's lookup,
dedupe, or replay in some way that is worse than stripping it? Does any existing
cookie test now pass for the wrong reason? Construct a `Set-Cookie` the fix
mishandles.

**C2 — the private-path gate now matches paths containing a space, without
generating false positives.** `test/no-private-paths.test.mjs` allows SP in the
nested pattern's middle segment (excluding only `\n`, `\r`, `\t` and quote
characters), and `tightestHit()` re-anchors each match on the NEAREST
home-directory start before the `repoRoot` exclusion is applied.

Attack it. Find an input where `tightestHit()` re-anchors onto the WRONG start
and discards a real leak, or where it loops, or where it is quadratic enough to
matter on an 8MB blob. Find a false positive it now produces on ordinary prose.
Check the interaction with the `..`-escape rule, with the `lastIndex` rewind from
round 15, and with the direct (non-nested) pattern that is checked first and
returns early. What other legal path characters are still excluded — and is any
of them as ordinary as the space was?

**C3 — the span bound is measured AT the boundary.** The fixtures are built from
`NESTED_SPAN_MAX` and asserted at exactly the bound (caught) and one past it
(missed), with a `middleOf()` helper asserting the fixture's middle segment is
the length it claims.

Attack it. Build a mutant of the matcher that both assertions still pass. Is
`middleOf()` measuring what it claims? Does the at-bound fixture actually exercise
the quantifier's upper limit, or is some other part of the pattern consuming
characters the helper attributes to the middle?

**C4 — the `capture.test.mjs` module-load discriminator is now exact and
grounded in the filesystem.** The entry module is imported through
`pathToFileURL(distCapture).href` so both sides percent-encode identically, and
`missingSelf` additionally requires `!existsSync(distCapture)`.

Attack it. Find a real un-built tree the predicate now REJECTS (turning a
legitimate skip into a spurious failure), or a broken tree it still ACCEPTS
(turning a real defect into a silent `process.exit(0)`). Consider symlinks,
case-insensitive filesystems, a path containing `%`, `?` or a space, a race
between the throw and the `existsSync`, and `dist/capture.js` existing but being
empty, a directory, or unreadable.

**C5 — the round-16 tests encode the fixes rather than merely detecting the
current state.** Five reverts were run: restoring `.trim()` at the name/value
split (1 fail), narrowing the middle class back (1 fail), dropping
`tightestHit()` (1 fail, on the whole-tree scan), building the regex with
`NESTED_SPAN_MAX - 1` (1 fail), and the two C4 halves by hand-probe. R2 and R4
land on the same test name and were confirmed to fail on different assertions.

Attack it. Write a mutant of any round-16 fix that the suite does not catch. Is
the new NAME/VALUE cookie test asserting the pad's PRESENCE in a way that a
different bug could also satisfy? Are the C4 predicates testable in-suite at all,
and if not, is the hand-probe evidence sufficient?

**C6 — frozen surfaces are unchanged.** 108 stdio tools; 45 anonymous remote
tools hashing to `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`;
`browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical; no overlay
file in commit `8476646`.

Attack it. Verify each independently. **Probe gotchas that have burned previous
rounds:** bare `buildServer()` is NOT the stdio path — pass
`buildServer({ remote: false, tasteStore: new FsTasteStore() })`. And
`buildServer({ remote: true, tasteStore })` returns 56, not 45 — the anonymous
surface needs `buildServer({ remote: true })` with NO store.

## Environment notes

- Run `RAVEN_NO_USAGE_LOG=1 npm test`. Expected on this machine: **1267 tests /
  1264 pass / 0 fail / 3 skipped**.
- **A skip is not a failure.** If Chromium cannot launch in your sandbox
  (`Permission denied (1100)` Mach-port denials are typical) the capture suite
  skips ~68 additional tests. Report the skip count; do not report it as a
  regression. Round 15's pass saw exactly this.
- `node test/e2e-pattern-library.mjs` is NOT part of `npm test`. It proxies live
  `github.com` and launches real Chromium; if you cannot run it, say so rather
  than guessing.
- Do not run `git push`, `npm publish`, or any deploy.

## Output

For each claim: **SURVIVES** or **FAILS**, with the concrete input, command, or
diff that proves it. End with a single line `OVERALL: SURVIVES` or
`OVERALL: DOES NOT SURVIVE`. A claim you could not test is neither — say so
explicitly and name what blocked you.
