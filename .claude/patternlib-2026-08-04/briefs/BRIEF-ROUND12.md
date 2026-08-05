# Adverse falsification brief — round 12

You are an adverse reviewer. **Report only — change no files.** Your job is to
REFUTE the claims below, not to confirm them. Default to "does not survive" when
you are uncertain: a claim that cannot be shown correct from the repo is not
correct.

Repo: `/Users/accunliffe/projects/raven-mcp` (working tree, uncommitted round-12
changes may or may not be staged — read the files on disk).

## Environment note — read this before concluding anything about tests

If your sandbox has no Playwright Chromium, `test/capture.test.mjs`,
`test/grab-overlay-key-isolation.test.mjs` and `node test/e2e-pattern-library.mjs`
will SKIP or refuse to run. **A skip is not a failure.** Round 10's pass reported
"1 fail / 60 skipped" on that basis and was wrong about the fail. Report the skip
count separately from the fail count, and if you cannot run something, say
"unverified" rather than inferring a verdict.

Run tests with `RAVEN_NO_USAGE_LOG=1 npm test`.

## Claims to attack

### C1 — the IME commit verdict is now out of the page's reach
`browser/raven-grab.js` (~419–560) stores the "this Enter is an IME commit"
verdict in a module-private `WeakSet` (`ravenCompositionCommits`) rather than as
an own property on the event. Claim: a page script can neither read, delete, nor
forge that verdict, and a page that calls `Object.preventExtensions(event)` in a
window-capture listener no longer breaks the guard.

Attack angles worth trying: can a page reach the WeakSet through the overlay's
own exports, a shadow-root reference, or `Function.prototype` tampering? Does
anything still write to the event? Does the guard behave correctly when the same
event is dispatched twice? Is the `composedPath()[0]` origin match still correct
now that the verdict moved? Is `web/public/raven-grab.js` byte-identical
(`cmp browser/raven-grab.js web/public/raven-grab.js`)?

### C2 — the 100ms bound was kept deliberately, and the reasoning holds
The comment's fourth residual argues the clock must stay because without it the
mouse-selected-candidate residual is unbounded in time, and blur/`pointerdown`
cannot rescue it because the IME candidate popup is OS chrome. Claim: that
reasoning is correct and the trade is the better one.

Attack it. Is there a DOM-observable signal for a mouse-selected candidate that
the comment misses? Does the clock introduce a failure the comment does not name?

### C3 — the three new test cases are load-bearing
- `test/grab-bridge-proxy-round4.test.mjs` `sent[8]`: cross-site + `navigate` +
  `dest: iframe` + `Sec-Fetch-User: ?1` must get NO Lax cookie.
- `test/grab-bridge-proxy-round7.test.mjs`: a GET with only `sec-fetch-mode:
  navigate` and no `sec-fetch-site` must carry no cookie.
- `test/grab-bridge-proxy-round9.test.mjs`: `Max-Age=0` deletes a cookie.

Claim: each one fails under a plausible weakening of `src/grab-bridge.ts` that
every other test survives. Attack: find a weakening that all three still pass.
Find a case in this family that is STILL uncovered.

### C4 — the private-path gate's matcher covers the real shapes
`test/no-private-paths.test.mjs` now matches `/Users/<name>`, `/home/<name>`
(including `@` in the name), `/root`, and the tooling directory nested under a
project path — with paths inside this checkout excluded by `repoRoot` prefix.

Attack: name a real private-path shape it still misses. Is the `repoRoot`
exclusion exploitable (e.g. a path that starts with the repo root string but is
not inside it)? Does the greedy `[^\s"'`]{1,200}` class create a false negative
when an in-repo path and an out-of-repo path share a line? Is the gate still
scanning ITSELF, and are its own literals still split?

### C5 — `test/capture.test.mjs` no longer skips a real failure
A module-load probe (`import('playwright')` → `chromium.launch()` → close) sets
`chromiumAvailable`. When it is true, both a `CaptureUnavailableError` out of
`capturePage` AND a `file://` static fallback are rethrown as failures instead of
skipped. Measured: injecting a throw into `launchAuditChromium()` in `dist/` took
the suite from 1 fail / 12 skipped to 17 fail / 0 skipped.

Attack: is there still a path where a genuine capture regression presents as a
skip or a pass? Does the probe itself have a false positive (launches, but the
real capture path legitimately cannot)? Does this make the suite flaky on a
machine where chromium launches slowly or intermittently?

## Frozen surfaces — verify these independently, do not take my word

- stdio tool count **108**, anonymous remote count **45**, anon golden hash
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
  Note `buildServer()` with no explicit `remote` reads `process.env.RAVEN_REMOTE`
  — pass `{ remote: false, tasteStore: new FsTasteStore() }` for stdio and
  `{ remote: true }` with NO store for the anonymous set.
- `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical.
- No `src/` file changed in round 12. Confirm that.

## Output format

For each claim: `SURVIVES` or `FAILS`, with the specific file/line and the
concrete failing input. End with a single `OVERALL: SURVIVES` or
`OVERALL: DOES NOT SURVIVE` line. Do not soften. Do not edit files.
