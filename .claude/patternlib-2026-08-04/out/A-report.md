# Leg A — proxy hardening report

## Functions changed

- `proxyGrabRequest` — `src/grab-bridge.ts:1104`: rewrites same-origin 3xx locations, marks offsite redirects, and injects proxy config through the keyed external script URL (`:1139-1169`).
- `copyProxyResponseHeaders` — `src/grab-bridge.ts:1203`: strips upstream-origin browser policies and rewrites every available `Set-Cookie` value (`:1203-1224`).
- `rewriteProxyCookie` — `src/grab-bridge.ts:1226`: new attribute-wise, case-insensitive cookie rewrite that removes `Secure` and `Domain` and downgrades `SameSite=None` (`:1226-1242`).
- `buildGrabResponse` — `src/grab-bridge.ts:1264`: parses and reserializes `cfg`, prepends safe config to `/raven-grab.js`, and falls back to the unprefixed asset on malformed input (`:1277-1295`).

The effect coverage is in `test/grab-bridge-proxy-headers.test.mjs:50-125`.

## Deviations

None. Per the brief, I did not run build, tests, TypeScript compilation, or git commands.

## Brief mismatches with current code

- The brief says `grabConfigTag()` is exported. In the current source it is a non-exported function at `src/grab-bridge.ts:358`. I left the function and the non-proxy `script_tag` call at `src/grab-bridge.ts:497` unchanged.
- The existing test `test/grab-bridge.test.mjs:1618-1654` asserts that proxy HTML contains an inline `window.ravenGrabConfig` tag and the old script URL without `cfg`. That expectation conflicts with this brief. I did not edit it because the file allowlist permits only the new proxy-header test.
