You are a hostile falsification reviewer. Report only — do not edit files. Your job is
to REFUTE the claim below, not to confirm it. Default to "not survived" when uncertain.

REPO: /Users/accunliffe/projects/raven-mcp (public, Apache-2.0, real external consumers)

CLAIM UNDER TEST
"The Sol round-2 defects are dispositioned. Eleven were fixed with regression tests;
two (R1-#1 same-origin capability leak, and the TLS case of R2-#6) are disclosed as open
rather than closed. The suite is 1212/1209/0 fail/3 skipped, the hand-run e2e passes
through the real MCP tool surface against live github.com, the anon-45 golden hash is
unmoved, and the .mcpb bundles and raven-grab.js mirrors are byte-identical."

WHAT CHANGED SINCE YOUR ROUND-2 REPORT (.claude/patternlib-2026-08-04/out/SOL-ROUND2.md)
1. src/reference-tokens.ts — AFFINITY substring table replaced by a segment-aware FAMILIES
   table with a 4-rank affinity (0 names this family only, 1 names it alongside another,
   2 names no family but reads like this one, 3 out of family); filter now rank <= 2.
   Colour distance premultiplies alpha. Colour parser clamps channels and accepts
   deg/grad/rad/turn.
2. src/index.ts — capture_reference accepts a `stateStyles` alias alongside `state_styles`;
   snake_case wins when both are supplied.
3. src/grab-bridge.ts — (a) keyed Raven authoring routes answered with a local 404 and never
   forwarded upstream; unkeyed collisions still forwarded. (b) OPTIONS scoped to bridge routes.
   (c) cookie jar keyed by name+path with RFC 6265 5.1.4 path matching and send-time expiry.
   (d) same-host scheme-only redirect rebinds currentSession.proxyTarget in BOTH directions and
   sets X-Raven-Proxy-Downgraded on a downgrade. (e) WebSocket upgrade reads the live
   currentSession.proxyTarget. (f) the proxy warning text now discloses the /grab queue-WRITE path.
4. src/reference-store.ts — deleteReference rebuilds a corrupt index instead of throwing.
5. test/e2e-pattern-library.mjs — leg B now drives capture_reference / search_references /
   map_reference_to_tokens over an InMemoryTransport MCP client instead of importing the
   store and mapper modules directly.
6. scripts/sync-manifest-tools.mjs — site/docs.html added to COUNT_SURFACES.
7. Two pre-existing tests were CHANGED to match the new behaviour:
   test/grab-bridge.test.mjs (502 -> 404 on keyed authoring routes) and
   test/grab-bridge-proxy-headers.test.mjs (scheme-only redirect now also asserts the rebind).
   Attack this hardest: a test edited to match a fix is the classic way a regression is laundered.
   Decide independently whether each OLD expectation was the correct contract.

ATTACK THESE SPECIFICALLY
- Does the rank<=2 loose fallback re-introduce the cross-family mis-binding it was meant to fix?
  Find a real-world token path where it binds the wrong property. Read the FAMILIES regexes.
- Is the scheme-only rebind a security regression? It silently moves a session opened over
  https to plaintext http on the site's say-so. Is announcing it via a response header adequate?
  Can it be driven into a loop or used to strip TLS?
- Does the 404-on-keyed-route change break any legitimate flow (the overlay's own routes, the
  agent long-poll, batch commit) when proxying? Enumerate the withheld list against the routes
  the overlay actually calls.
- Is the cookie jar still wrong (domain attribute ignored? Secure ignored? HttpOnly? SameSite?
  jar shared across sessions and never cleared on stopGrabSession?).
- Does the e2e rewrite actually close #10, or does it still have a path where a broken tool
  seam yields ALL CHECKS PASSED?
- Anything in the tree that would ship broken: dist/ leftovers, manifest drift, count drift
  across README/llms.txt/docs.html/manifest.json, .mcpb staleness.

Read the actual files. Cite file:line for every finding. Rank findings by whether they would
reach a user. End with an explicit verdict line: SURVIVES or DOES NOT SURVIVE.
