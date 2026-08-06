# Adverse falsification brief — round 13

You are an adverse reviewer. **Report only — change no files.** Your job is to
REFUTE the claims below, not to confirm them. Default to "does not survive" when
you are uncertain: a claim that cannot be shown correct from the repo is not
correct.

Repo: `/Users/accunliffe/projects/raven-mcp`, committed at `fa9a87f`. Read the
files on disk.

## Environment note — read this before concluding anything about tests

If your sandbox has no Playwright Chromium, `test/capture.test.mjs`,
`test/grab-overlay-key-isolation.test.mjs` and `node test/e2e-pattern-library.mjs`
will SKIP or refuse to run. **A skip is not a failure.** Round 10's pass reported
"1 fail / 60 skipped" on that basis and was wrong about the fail; round 12's pass
reported 29 fails that were all Mach-port and listener `EPERM` denials in its own
sandbox. Report the skip count separately from the fail count, and if you cannot
run something, say "unverified" rather than inferring a verdict.

Run tests with `RAVEN_NO_USAGE_LOG=1 npm test`. Baseline in a working environment:
**1262 tests / 1259 pass / 0 fail / 3 skipped**.

## What round 13 was

Your round-12 pass returned `OVERALL: DOES NOT SURVIVE` on all five claims. Every
finding was accepted and fixed. The through-line you identified: round 12 secured
OBJECTS and called the mechanisms out of the page's reach, when what each guard
actually depends on is a set of page-realm OPERATIONS. Round 13 is the repair.
Attack the repair.

## Claims to attack

### C1 — the IME verdict now survives a hostile page's realm

`browser/raven-grab.js` (~470–615). `WeakSet.prototype.add/has/delete` are
captured at load through `Function.prototype.call.bind`; the verdict is consumed
on read so one composition suppresses exactly one Enter.

Claim: a page that tampers with `WeakSet.prototype` after the overlay loads
cannot read, erase, forge, or replay the verdict, and the residual that remains
(a `<head>` script poisoning the prototype BEFORE injection) is honestly stated
rather than papered over.

Attack angles: is `Function.prototype.call.bind` itself reachable at the moment
the overlay captures it? Is there another page-realm operation the guard still
looks up at call time? Does consuming the verdict break any legitimate flow —
a browser that dispatches one physical keypress through more than one path, a
framework that re-dispatches, an event replayed by an accessibility tool? Does
`composedPath` remain trustworthy?

### C2 — the 100ms bound is a bound again

`ravenElapsedSince` returns `Infinity` whenever `ravenNow() - stamp` is not a
non-negative number, and `performance.now` is captured at load.

Claim: no page-controlled clock can make the marker outlive its bound.

Attack: can a page make the delta a small NON-NEGATIVE number forever, which
`ravenElapsedSince` accepts by construction? What does `Date.now` fallback do if
`performance` is absent or throws? Is `Infinity` handled correctly by every
comparison downstream? Does the sign check introduce a false positive on a real
machine (clock adjustment, tab suspension, `performance.now` resolution
clamping)?

### C3 — the Max-Age parse now matches RFC 6265 §5.2.2

`src/grab-bridge.ts` (~1736): `Max-Age` is read only when it matches
`/^-?\d+$/`. `test/grab-bridge-proxy-round9.test.mjs` covers `Max-Age=0`,
`Max-Age=-1` (deletes) and `Max-Age=` (ignored).

Claim: the parse and the tests together are load-bearing, and each fails under a
plausible weakening the other tests survive.

Attack: name a §5.2.2 case still wrong — leading/trailing whitespace, `+5`,
a value exceeding `Number.MAX_SAFE_INTEGER`, a huge value overflowing the
`Date.now() + seconds * 1000` arithmetic, `Max-Age` appearing twice, `Max-Age`
vs `Expires` precedence, an attribute name in mixed case. Find a weakening all
three tests still pass.

### C4 — the private-path gate's two bypasses are closed

`test/no-private-paths.test.mjs`: the nested pattern's quantifier is lazy, every
match on a line is examined, and a match containing a `..` segment is never
excluded by the `repoRoot` prefix.

Attack: name a third bypass. Symlinks, a `.` segment, a doubled slash, percent-
or backslash-escaping, a repo root that is itself a prefix of a sibling directory
name, a path split across two lines, a path inside a JSON string with escaped
slashes. Is the 200-character bound reachable as an evasion? Does the lazy
quantifier introduce a FALSE POSITIVE on a legitimate in-repo path? Is the gate
still scanning ITSELF, is `KNOWN_PUBLISHED` still frozen empty, and does it still
scan the INDEX rather than the worktree?

### C5 — `capture.test.mjs` can no longer report a real failure as a skip

The module-load `catch` now rethrows everything except `ERR_MODULE_NOT_FOUND`
whose url is `dist/capture.js` itself.

Attack: can a genuine defect still present as a skip or a pass? Is `err.url`
actually populated by this Node version for that error, and is the
`message.includes(distCapture)` fallback sound? Does the narrowed branch
misclassify a real un-built tree as a failure (which would be noisy but not
unsafe) or a real failure as un-built (which is the dangerous direction)?

### C6 — the round-13 tests encode rather than detect

Seven falsifiability reverts were run, each hitting exactly its own assertion:
prototype lookup at call time, raw subtraction, consume-on-read deleted, the
`Max-Age` digit test removed, the `Max-Age` test narrowed to non-negative, the
gate quantifier made greedy, the gate's `..` rejection removed.

Note the redispatch test FAILED to detect its own defect on the first draft (it
dispatched a second freshly-constructed event, which was never marked) and was
rewritten to dispatch one object twice.

Attack: find another of the round-13 tests that passes against the defect it
claims to cover. Find a plausible weakening of any round-13 fix that ALL the
tests survive.

## Frozen surfaces — verify these independently, do not take my word

- stdio tool count **108**, anonymous remote count **45**, anon golden hash
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
  Note `buildServer()` with no explicit `remote` reads `process.env.RAVEN_REMOTE`
  — pass `{ remote: false, tasteStore: new FsTasteStore() }` for stdio and
  `{ remote: true }` with NO store for the anonymous set. Passing a store to the
  remote server yields 56, not 45.
- `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical.
- `src/grab-bridge.ts` is the ONLY `src/` file changed in round 13. Confirm that,
  and confirm the change is confined to the `max-age` branch.

## Output format

For each claim: `SURVIVES` or `FAILS`, with the specific file/line and the
concrete failing input. End with a single `OVERALL: SURVIVES` or
`OVERALL: DOES NOT SURVIVE` line. Do not soften. Do not edit files.
