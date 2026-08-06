# Adverse falsification brief — round 14

You are an adverse reviewer. **Report only — change no files.** Your job is to
REFUTE the claims below, not to confirm them. Default to "does not survive" when
you are uncertain: a claim that cannot be shown correct from the repo is not
correct.

Repo: `/Users/accunliffe/projects/raven-mcp`, committed at `1bbfb11`. Read the
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
**1265 tests / 1262 pass / 0 fail / 3 skipped**.

## What round 14 was

Your round-13 pass returned `OVERALL: DOES NOT SURVIVE` on all six claims and
every finding was accepted. The through-line: round 13 fixed each mechanism
against the specific attack that had been demonstrated, and each fix left a
NEARBY variant open — a backward clock closed, a constant clock not; a prototype
swap closed, feeding the mechanism not; a malformed Max-Age closed, an
unrepresentable one not. Round 14 is the repair. Attack the repair, and attack it
the same way: for each fix, name the adjacent input it still does not cover.

## Claims to attack

### C1 — elapsed time is bounded by two independent clocks

`browser/raven-grab.js` (~545–600). The composition marker stamps both
`performance.now` and `Date.now`, both captured at load, and `ravenElapsedSince`
returns the LARGER of the two deltas, with a non-numeric or negative delta
mapping to `Infinity`.

Claim: no single page-controlled clock can hold the 100ms window open, and the
only residual — a `<head>` script freezing BOTH before injection — is stated.

Attack angles: is there a third path to a small non-negative delta? What if
`performance` is absent, or `performance.now` throws when called, or returns a
non-number, or a BigInt? What does `Function.prototype.call.bind(performance.now,
performance)` do if `performance` is later redefined? Does taking the MAX
introduce a false negative that matters — a wall-clock step, `Date.now` being
coarsened, a suspended tab? Is `stamp.perf === null` handled on every path? Does
`ravenSaneDelta` behave correctly when handed `Infinity`?

### C2 — the IME guard's threat model is now stated honestly

The overlay comment says the guard is a correctness mechanism against browser
event ordering, NOT a security boundary, because the shadow root is open and a
page that can dispatch into it already has strictly more power than a forged
verdict grants.

Claim: that reasoning is correct and the decision not to gate on `isTrusted` is
sound.

Attack: is the harm ceiling actually what the comment says? Find a case where a
forged or suppressed verdict does something WORSE than suppressing one Enter.
Does the overlay expose anything through the open shadow root that a page could
not otherwise reach? Is there a cheaper mitigation than `isTrusted` that was not
considered? Is any OTHER claim in that comment block now false?

### C3 — Max-Age precedence over Expires is correct for every valid value

`src/grab-bridge.ts` (~1716–1790). A value matching `/^-?\d+$/` always sets
`maxAgeApplied` (which suppresses the `Expires` branch) and is clamped to
`[0, MAX_COOKIE_EXPIRY_MS]`.

Claim: the parse now matches RFC 6265 §5.2.2 and §5.3 for every input it can
receive.

Attack: leading/trailing whitespace inside the value, `+5`, `007`, a value with
a Unicode digit, `Max-Age` appearing twice with one valid and one invalid, the
attribute-splitting step upstream, an `Expires` that appears AFTER a valid
Max-Age vs before, a clamped value that should have been a deletion, the
interaction with the jar's own expiry check. Is `MAX_COOKIE_EXPIRY_MS` compared
correctly? Does `Number.isNaN(when)` catch every unrepresentable case?

### C4 — the private-path gate's span bound is no longer a bypass

`test/no-private-paths.test.mjs`: `NESTED_SPAN_MAX = 4096`, documented in the
header's stated-limits list, with a >200-char positive test and a constant
assertion.

Attack: is 4096 actually enough, and is the constant assertion meaningful or
tautological? Does the wider bound introduce catastrophic backtracking or a
measurable slowdown on a real blob? Name a FOURTH bypass. Is the gate still
scanning the INDEX, still scanning itself, and is `KNOWN_PUBLISHED` still frozen
empty?

### C5 — `capture.test.mjs` discriminates on `err.url` alone

The `message.includes(...)` fallback is gone; the branch tests
`new URL(err.url).pathname.endsWith('/dist/capture.js')`.

Attack: verify the Node error shapes claimed in the comment against the Node
version in your sandbox and report any disagreement — the measurement was taken
on v26.5.0. Can a real defect still present as a skip? Can a genuinely un-built
tree now present as a hard failure, and does that matter? Is `new URL(err.url)`
safe for every value `err.url` can hold?

### C6 — the round-14 tests encode rather than detect

Five falsifiability reverts were run: perf-only elapsed (frozen-perf test red),
MIN instead of MAX (both clock tests red), Max-Age anchor `$` dropped (5junk
assertion red), overflow clamp removed (Expires-precedence assertion red), span
bound back to 200 (deep-nesting assertion red).

Attack: find a round-14 test that passes against the defect it claims to cover.
In particular: do the two clock fixtures actually take effect before the overlay
loads, and does the assertion prove what its message says? Find a plausible
weakening of any round-14 fix that ALL the tests survive.

## Frozen surfaces — verify these independently, do not take my word

- stdio tool count **108**, anonymous remote count **45**, anon golden hash
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
  Note `buildServer()` with no explicit `remote` reads `process.env.RAVEN_REMOTE`
  — pass `{ remote: false, tasteStore: new FsTasteStore() }` for stdio and
  `{ remote: true }` with NO store for the anonymous set. Passing a store to the
  remote server yields 56, not 45.
- `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical.
- `src/grab-bridge.ts` is the ONLY `src/` file changed in round 14. Confirm that,
  and confirm the change is confined to the cookie-attribute parser.

## Output format

For each claim: `SURVIVES` or `FAILS`, with the specific file/line and the
concrete failing input. End with a single `OVERALL: SURVIVES` or
`OVERALL: DOES NOT SURVIVE` line. Do not soften. Do not edit files.
