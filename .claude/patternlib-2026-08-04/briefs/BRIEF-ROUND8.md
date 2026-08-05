ROLE: adverse falsification pass. REPORT ONLY — do not edit files, do not build,
do not commit. REFUTE the claims; default to "not proven". Rank P1/P2/P3 with
file:line and a concrete failure scenario. If a claim survives, one line and move
on.

REPO: /Users/accunliffe/projects/raven-mcp (public, Apache-2.0), uncommitted tree.
`dist/` is gitignored and built from `src/`.

CONTEXT: this dispositions YOUR OWN round-7 pass. You returned DOES NOT SURVIVE
on F1 (three cookie findings) and F4 (the overlay keyCode). All four were
accepted and fixed. F2, F3, D1 and D2 you passed, and they are unchanged.
Attack the four new fixes AND the test churn they caused.

## Fixes to attack

**G1 — DNS rebinding (your round-7 P2).** `src/grab-bridge.ts`: new
`isLoopbackHost()` plus a guard at the top of `handleGrabRequest` returning 421
unless `req.headers.host` is exactly `127.0.0.1:<port>` or `localhost:<port>`.
Attack: is the Host header comparison sound — case, trailing dot
(`localhost.:PORT`), an IPv6 literal, a duplicated Host header, a Host with
whitespace, an absolute-form request line (`GET http://x/ HTTP/1.1`)? Does any
legitimate caller now get 421 — the overlay's own fetches, `watch_command`, the
`/agent/wait` route, a browser reaching the bridge some other way? Is the guard
early enough to cover EVERY route including the authoring ones? Does the
WebSocket upgrade path get equivalent protection, or does rebinding still work
there? Is `currentSession &&` a fail-open window that matters?

**G2 — Lax only on a declared navigation (your round-7 P1).**
`src/grab-bridge.ts`: `topLevelGet` is now `method === "GET" &&
sec-fetch-mode === "navigate"`. The metadata-less allowance is gone.
Attack: does a real user in Safari <16.4 now lose something load-bearing — walk
the actual sequence of a login through the proxy and say what breaks. Can a
foreign page set `sec-fetch-mode: navigate` (it is a forbidden header — prove or
refute). Does an `<iframe>` navigation now get Lax cookies it should not?

**G3 — `SameSite=None` without `Secure` dropped at parse.**
`src/grab-bridge.ts`, in the Set-Cookie storing loop.
Attack: is dropping right, or should it be downgraded to Lax? Does any real site
depend on the malformed form? Does the drop interact badly with the `__Secure-`
prefix check above it or with the expiry/delete path below it?

**G4 — the overlay no longer treats `keyCode === 229` as composition.**
`browser/raven-grab.js` window-capture guard: `composing` is now
`isComposing === true || ravenCompositionKeys[key]`.
Attack: does this reopen the IME hole you found in round 7? Name a real
platform/IME combination that produces a composed keystroke with `isComposing`
false AND a key name outside {Dead, Process, Unidentified} AND
`key.length !== 1`. Does `isComposing` on a composition-commit `Enter` now get
swallowed, and is that right or wrong for Raven's send-on-Enter? Is
`web/public/raven-grab.js` still byte-identical?

## Test churn to attack — this is the likeliest place a regression hides

Making a bare request cross-site broke five older cookie suites, because they
used a bare request as a NEUTRAL CARRIER for assertions about Secure / Domain /
prefix / path. Each was changed to declare `sec-fetch-site: same-origin`:
`test/grab-bridge-proxy-round2.test.mjs` (a `SAME_ORIGIN` const, 6 call sites),
`test/grab-bridge-proxy-round4.test.mjs` (3 sites + the SameSite test's own
expectations), `test/grab-bridge-proxy-headers.test.mjs` (1 site).
Attack: did any of those rewrites NARROW what the test used to catch? Enumerate
what each test could detect before and confirm it still can. Is there now NO
test covering some case the bare-request spelling used to cover?

Also: `test/grab-bridge-proxy-round8.test.mjs` is new (4 tests). Node's `fetch`
was found to REWRITE `sec-fetch-mode` to `cors`, so that file uses node:http and
a raw socket instead. Attack whether the raw-socket rebinding test actually
proves what it claims, and whether the round-7 tests that still use `fetch` are
now asserting something other than what they say.

## Evidence already gathered — attack the method, not the arithmetic

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1242 tests / 1239 pass / 0 fail / 3 skipped.
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED, 33 checks.
- `buildServer({remote:false,...})` → 108 tools; `buildServer({remote:true})` →
  45 tools hashing to `f64bb18…2bb0a6` (unchanged).
- Each fix proven falsifiable by reverting it and watching exactly the intended
  test go red: G1, G2, G3 via `dist/`; G4 via `RAVEN_GRAB_ASSET_PATH` at a copy
  with the 229 clause restored. The host-guard/test-4 mapping was measured the
  same way rather than assumed.

## Out of scope

Release/deploy mechanics, anything needing a push/publish/Vercel deploy,
style and naming opinions.

## Output

Per item G1–G4 and the test-churn section: SURVIVES or DOES NOT SURVIVE, then
findings. End with one overall verdict line.
