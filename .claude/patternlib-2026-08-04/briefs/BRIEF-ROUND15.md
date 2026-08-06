# Round 15 — adverse falsification brief (report only)

You are auditing round 15 of the Raven pattern-library work in
`/Users/accunliffe/projects/raven-mcp`. **Report only. Do not edit any file.**
Your job is to REFUTE the claims below, not to confirm them. Default to
"does not survive" when you cannot prove a claim.

Round 15 exists because round 14's pass returned `OVERALL: DOES NOT SURVIVE` on
four of six claims. Two of those four were defects in code that had *just* been
written to close an earlier adverse finding, so treat every claim here as
suspect by construction.

## The claims

**C1 — the Set-Cookie attribute parser follows RFC 6265 §5.2 on whitespace.**
`src/grab-bridge.ts` now trims attribute names and values with a `trimWsp()`
helper that removes SP (0x20) and HTAB (0x09) and nothing else. The previous
version used JavaScript `.trim()`, which removes the whole Unicode WhiteSpace
set, so `Max-Age=<U+00A0>5` — invalid under the RFC — was laundered into a valid
five-second lifetime that then suppressed the `Expires` on the same header.

Attack it. Is `trimWsp` correct at both call sites and for both halves of an
attribute? Is there any *other* place in the cookie path that still normalises
with `.trim()` or a `\s`-class regex? Does the fix change behaviour for any
value that was previously handled correctly? Does the cookie NAME/VALUE split
(as opposed to the attribute split) have the same defect? And is WSP-only trim
actually what §5.2 says, or have I over-corrected?

**C2 — the private-path gate no longer loses a leak to an overlapping match.**
`test/no-private-paths.test.mjs` rewinds `lastIndex = match.index + 1` when a hit
is excluded by the `repoRoot` prefix, so an overlapping foreign path is still
found. Round 13 had made the scan iterate all matches, which was not sufficient
because `exec` with `/g` resumes past the whole discarded match.

Attack it. Construct an input that still hides a private path. Consider multiple
excluded hits in sequence, a leak that begins before an excluded hit rather than
after it, the interaction with the `..`-escape rule, and the direct
(non-nested) pattern which is checked first and returns early.

**C3 — the span bound is now measured rather than asserted.** The gate's
boundary fixtures are built FROM `NESTED_SPAN_MAX` (caught at `MAX - 1`, missed
at `MAX + 200`) instead of from a fixed 301-character literal plus a standalone
`assert.equal(NESTED_SPAN_MAX, 4096)`.

Attack it. Weaken the matcher in some way the fixtures do not detect, while
leaving every test green. Is `nestAt()` actually producing a span of the length
it claims? Does the `MAX + 200` case fail to match for the intended reason, or
for an incidental one (a stray character class, a `/` in the filler, something
in the exclusion path)?

**C4 — `test/capture.test.mjs` discriminates the two `ERR_MODULE_NOT_FOUND`
shapes correctly.** The `missingSelf` predicate now compares `err.url` for exact
equality against `pathToFileURL(distCapture).href`. Round 14's suffix match
(`pathname.endsWith('/dist/capture.js')`) accepted a missing RELATIVE transitive
specifier that resolved to some other `.../dist/capture.js`.

Two measurements back it, both on Node v26.5.0:
- entry at `<tmp>/a/dist/capture.js` importing a missing `../../b/dist/capture.js`
  → `err.url` under `b/`; exact rejects, suffix accepts.
- a missing entry module reached through a SYMLINK → `err.url` is the
  specifier's own href with symlinks unresolved, so exact still matches.

Attack it. Find a real un-built-tree shape where the exact comparison FAILS to
recognise a genuinely missing entry module, so `npm test` throws instead of
skipping. Consider case-insensitive filesystems, percent-encoding in the path,
a trailing-slash or `.` segment, a bare vs relative specifier, `NODE_OPTIONS`
loaders, and any Node version where the shape differs. Also find any remaining
load failure that still routes into the `process.exit(0)` branch.

**C5 — the round-15 tests encode rather than detect.** Each fix was proven
falsifiable by reverting it and measuring which assertion goes red:

| Revert | Measured |
|---|---|
| restore `.trim()` at both attribute call sites | 1 fail / 5 pass in round 9, on the `accepted as valid and suppressed` assertion |
| drop the `lastIndex` rewind | 1 fail / 3 pass, on the overlapping-path assertion |
| leave the constant at 4096, build the regex `{1,512}` | 1 fail / 3 pass, on the at-bound assertion |
| restore the suffix predicate | no in-suite test; measured by probe |

Attack it. Do these tests pass for the reason claimed? The NBSP fixture writes
its pad as an escape and asserts `charCodeAt(0) === 0xA0` — check that the byte
actually reaches the upstream server as 0xA0 and is not mangled by Node's header
encoding on either the write or the read side. If it is mangled, the test is
measuring something other than what it says.

**C6 — the frozen surfaces did not move.** 108 stdio tools, 45 anonymous, anon
hash `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, and
`browser/raven-grab.js` byte-identical to `web/public/raven-grab.js`. No overlay
change this round.

Verify independently, do not take the numbers on faith.

## How to probe

- Stdio surface: `buildServer({ remote: false, tasteStore: new FsTasteStore() })`.
  Bare `buildServer()` silently measures the REMOTE server.
- Anonymous surface: `buildServer({ remote: true })` with **no** store. Passing a
  store returns 56, not 45.
- `RAVEN_NO_USAGE_LOG=1 npm test` — expect **1266 / 1263 pass / 0 fail / 3
  skipped**. A skip is not a failure: `test/capture.test.mjs` skips when its
  chromium probe cannot launch, which in a sandbox usually means Mach-port
  denials rather than a missing browser. Read the skip COUNT; a large one means
  your environment, not a regression.
- `node test/e2e-pattern-library.mjs` is NOT in `npm test`. It proxies live
  `github.com` and launches real Chromium.
- `dist/` is gitignored and is what the tests import. Rebuild with
  `npm run build` before trusting any behaviour you attribute to `src/`.

## Output

For each claim: SURVIVES or FAILS, with the concrete input and observed output
that proves it. End with a single line `OVERALL: SURVIVES` or
`OVERALL: DOES NOT SURVIVE`. Report only — make no edits.
