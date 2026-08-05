ROLE: adverse falsification pass. REPORT ONLY — do not edit files, do not build,
do not commit. REFUTE the claims; default to "not proven". Rank P1/P2/P3 with
file:line and a concrete failure scenario. If a claim survives, one line and move
on.

REPO: /Users/accunliffe/projects/raven-mcp (public, Apache-2.0), uncommitted tree.
`dist/` is gitignored and built from `src/`.

CONTEXT: this is the disposition of YOUR OWN previous pass. Four findings were
accepted and fixed; two were declined. Attack both halves — the fixes may be
wrong or incomplete, and the declines may be wrong to decline.

## Fixes to attack

**F1 — the plain-HTTP cookie fail-open (was your P1).**
`src/grab-bridge.ts`, the `crossSite` / `topLevelGet` derivation just above the
`proxyCookieHeader` call. Previously `crossSite` was false whenever
`sec-fetch-site` was absent. Now: Fetch Metadata wins if present; else Origin
host vs `req.headers.host`; else Referer host vs `req.headers.host`; else
cross-site. `topLevelGet` additionally true for a GET with no metadata and no
Origin and no Referer.
Attack: can an attacker page make `originHost === bridgeHost`? Is `req.headers.host`
trustworthy for this comparison (an attacker controls the Host header on a
non-browser client — does that matter here, given the threat model is a foreign
PAGE)? Does the new metadata-less top-level-GET allowance let a foreign page get
Lax cookies onto a state-changing GET (e.g. via `<img>` or a Referrer-Policy:
no-referrer subresource)? Is `proxyCookieHeader`'s Secure/path logic still
correct? Does anything else on the proxy path attach cookies or rewrite Origin
BEFORE this decision? Are there non-cookie authenticated side channels on the
same path (the bridge's own capability key, the token routes)?

**F2 — drain mode pinning (was your P2 race).**
`src/grab-bridge.ts` `getGrabbedElements` now pins `var session = currentSession`
and returns `{...result, proxyMode: Boolean(session.proxyTarget)}`;
`GrabBridgeDrainResult` gained optional `proxyMode`; `src/index.ts`
`get_grabbed_elements` reads `grabbed.proxyMode` instead of calling
`isProxyGrabSession()`.
Attack: is `proxyMode` right on EVERY path out of that function, including the
timeout path and the waiter path? Does the added field break any consumer — the
`/agent/wait` HTTP route, the generated `watch_command` shell loop, the `.mcpb`
manifest, anything that deep-compares the drain payload? Is `isProxyGrabSession`
now dead or still correctly used anywhere?

**F3 — the server-level instruction contradiction (was your P2).**
`src/index.ts`, immediately after the `remote && hasUserStore` instructions
append: a `if (!remote)` block appends a GRAB PROXY MODE paragraph. Deliberately
local-only because grab tools are not registered on the remote surfaces and the
anonymous instructions are hash-frozen (`ANONYMOUS_INSTRUCTIONS_HASH`,
`ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH` in
`test/taste-remote-full.test.mjs`).
Attack: does the new paragraph actually reach the stdio server an agent connects
to (check `src/index.ts` `main()`), or only a `buildServer` a test calls? Does it
contradict anything else in the instructions or in the `start_grab_session` /
`get_grabbed_elements` tool descriptions? Is the local-only scoping right — is
there any remote path that DOES register grab tools?

**F4 — the overlay capture guard and IME (was your P2).**
`browser/raven-grab.js`, the window-capture key guard. It now also stops events
where `isComposing === true`, `keyCode === 229`, or key is
`Dead`/`Process`/`Unidentified`.
Attack: does stopping those break anything Raven itself needs (its own
document-level handlers for Escape/Tab/Cmd+K/Alt+G/Cmd+.)? Is `keyCode === 229`
over-broad on any real platform? Does `isComposing` appear on keyup/keypress in a
way that changes behavior? Is `web/public/raven-grab.js` still byte-identical?

## Declines to attack

**D1 — you said the 45-tool hash test uses a local `buildServer({remote:true})`
rather than the deployed endpoint.** Declined as a known, documented limitation:
`CLAUDE.md` states the tests do not check the anon hash and gives the live curl,
and the live endpoint was checked by hand this session (45 tools, hash
`f64bb18…2bb0a6`). Attack the DECLINE: is there a cheap way this should be
automated, and does anything in THIS change set actually move the deployed
surface?

**D2 — you said the e2e uses `InMemoryTransport`, so stdio framing and byte
identity are untested, and the three pattern-library tools necessarily change the
stdio tool-list bytes.** Declined: adding tools to stdio was an accepted,
ledgered change (105 → 108); "stdio byte-identical" in this repo's ground truth
means existing tool behavior, not a frozen tool count. Attack the DECLINE: is
that reading of the frozen-surface rule wrong, and is there a real regression
risk the InMemoryTransport path hides for THESE tools specifically?

## Evidence already gathered — attack the method, not the arithmetic

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1236 tests / 1233 pass / 0 fail / 3 skipped.
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED, 0 FAIL lines.
- `buildServer({remote:false,...})` → 108 tools; `buildServer({remote:true})` →
  45 tools hashing to `f64bb18…2bb0a6`.
- Each fix was proven falsifiable by reverting it in `dist/` and watching exactly
  the intended test go red: F1 → the metadata-less-cookie test; F2 → the
  parked-drain test; F4 → the IME test (via `RAVEN_GRAB_ASSET_PATH` pointed at a
  neutered overlay). F3 has NO such proof — say whether that is a gap and what
  would close it.
- New tests: `test/grab-bridge-proxy-round7.test.mjs`. Changed:
  `test/grab-bridge-proxy-round4.test.mjs` (the bare-request case was rewritten —
  check that the rewrite did not narrow what the test used to catch),
  `test/grab-bridge.test.mjs` `/agent/wait` shape,
  `test/grab-overlay-key-isolation.test.mjs` (new IME test).

## Out of scope

Release/deploy mechanics, anything needing a push/publish/Vercel deploy,
style and naming opinions.

## Output

Per item F1–F4 and D1–D2: SURVIVES or DOES NOT SURVIVE, then findings. End with
one overall verdict line.
