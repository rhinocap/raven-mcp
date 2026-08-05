# Adverse falsification pass — Raven pattern library, round 4

You are a hostile reviewer. Your job is to REFUTE the claim below, not to confirm it.
Report only. Do not edit any file. Repo root: /Users/accunliffe/projects/raven-mcp

## The claim under test

All five findings from round 3 (`.claude/patternlib-2026-08-04/out/SOL-ROUND3.md`, read it
first) are closed, with a regression test per fix, and the pattern-library feature
(capture_reference / search_references / map_reference_to_tokens) plus the hardened
grab-bridge reverse proxy are correct and ready for Andrew to test by hand. Nothing is
pushed, published or deployed — those are his gates.

## What changed since round 3 (uncommitted or newly committed in the working tree)

1. `src/grab-bridge.ts`
   - The https→http redirect downgrade is REVERTED to offsite: absolute `Location`,
     `X-Raven-Proxy-Offsite`, no session rebind, bridge never fetches the plaintext target.
     The http→https upgrade still rebinds. This reverses my own round-2 "fix" that you
     correctly called a TLS strip.
   - Cookie jar: `ProxyCookie` now carries `secure`; default path derived from the response
     URL per RFC 6265 §5.1.4 (`defaultCookiePath`); foreign `Domain` rejected via
     `domainMatches` (§5.1.3); `__Secure-`/`__Host-` prefixes force `secure`; a `secure`
     cookie is never sent over an http channel (`proxyCookieHeader` takes `secureChannel`).
   - `wait_url` and `watch_command` are empty in proxy mode; the proxy warning was rewritten.
2. `src/reference-tokens.ts` — `segmentVariants` normalizes camel-case and plurals before
   family classification; a loose-tier candidate matching 2+ families is demoted to a gap.
3. Tests: `test/grab-bridge-proxy-headers.test.mjs` (offsite-downgrade + upgrade-rebind split,
   cookie expectation inverted), `test/grab-bridge-proxy-round2.test.mjs` (default-path +
   foreign-Domain), `test/grab-bridge.test.mjs` (no wait_url in proxy mode),
   `test/reference-tokens.test.mjs` (3 camel-case/ambiguity tests),
   `test/e2e-pattern-library.mjs` (now posts to `/grab`, drains via `get_grabbed_elements`,
   and feeds THAT into `capture_reference`).

## Evidence I claim (falsify each)

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1218 tests / 1215 pass / 0 fail / 3 skipped, ~46s.
  (Your sandbox lacks Chromium; ~55 browser tests will skip and one may fail. Say so rather
  than reporting a different split as a contradiction.)
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED (needs live network to github.com).
- Causality for the e2e: deleting `currentSession.queue.push(item)` from `dist/grab-bridge.js`
  turns it red. Re-derive this yourself if you can.
- stdio 108 tools via `buildServer({ remote: false })`; anon remote 45 tools, sha256 of
  newline-joined sorted names = f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
- `site/raven.mcpb` and `web/public/raven.mcpb` byte-identical to each other;
  `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical to each other.

## Attack these specifically

1. Is the offsite-downgrade actually safe, or did I move the leak somewhere else? Can a
   session still be downgraded by any other path — a meta refresh, a rewritten base href, a
   WebSocket target, an absolute URL rewritten in HTML, the initial `proxy_target` itself?
2. Is the cookie jar now RFC-correct enough to not leak? Check `Max-Age` vs `Expires`
   precedence, `SameSite`, host-only vs domain cookies, `__Host-` requiring `Path=/` and no
   `Domain`, case sensitivity, and whether the jar is cleared between sessions.
3. Does `segmentVariants` create NEW wrong binds? Find a real token path from a real design
   system (Chakra, Radix, Tailwind, Material, Shopify Polaris) that now cross-binds where it
   should gap, or that now gaps where it should bind. Run it.
4. Is the e2e's `/grab` leg actually load-bearing, or does something downstream still pass if
   the drain returns garbage?
5. Does anything here move the stdio surface, the anon 45, the manifest count, or byte-identity
   of the stdio path? Does `npm pack --dry-run` carry anything it should not?
6. Anything in `CLAUDE.md` or `conversations/2026-08-04-pattern-library.md` that is now false.

## Output format

`## Findings` — numbered, each with severity (P1/P2/P3), CONFIRMED/PLAUSIBLE, a confidence
out of 10, file:line citations, and a concrete required disposition.
`## Claims that survived` — what you checked and could not break.
End with a single line: `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
