# A2 proxy round 2

## Changes

- `src/grab-bridge.ts:1108-1129` drops outbound `Sec-Fetch-*`, rewrites `Origin` to the upstream origin, and rewrites a bridge-origin `Referer` while preserving its path and query.
- `src/grab-bridge.ts:1153-1161` compares redirect destinations by host and port, so a scheme-only change remains inside the bridge while genuinely different hosts retain `X-Raven-Proxy-Offsite`.
- `src/grab-bridge.ts:1172-1208` leaves declared non-UTF-8 HTML bytes untouched with `X-Raven-Proxy-Uninjected`, rewrites eligible HTML, installs an early external service-worker guard, and keeps the full overlay injection external.
- `src/grab-bridge.ts:1219-1269` removes CSP and report-only CSP meta tags, rewrites only same-origin `<base href>` values, and rewrites only same-host meta-refresh URLs.
- `src/grab-bridge.ts:1285-1305` additionally strips `Permissions-Policy`, legacy `Feature-Policy`, and `Alt-Svc` while preserving benign response headers.
- `src/grab-bridge.ts:1308-1310` documents that cookies from a pre-existing upstream browser session cannot cross into the local bridge origin.
- `src/grab-bridge.ts:1361-1384` serves the early, inline-free service-worker registration no-op separately from the full overlay asset. The comment records that this is a deliberate capability reduction for proxied third-party pages.
- `test/grab-bridge-proxy-headers.test.mjs:49-130` extends the existing effect test for the three newly stripped headers and retains the benign-header positive control.
- `test/grab-bridge-proxy-headers.test.mjs:132-306` adds failing-capable cases for surgical meta-CSP removal (including quoted `>` and `data-http-equiv` controls), exact `href` matching, same/cross-origin bases, same/cross-host meta refresh, HTTPS-target to HTTP same-host redirect, received request headers, proxy-only early service-worker neutralization, unchanged non-proxy asset delivery, and byte-identical non-UTF-8 pass-through with a UTF-8 injection control.

## WebSocket finding

Already handled; no WebSocket code changed. `src/grab-bridge.ts:417-419` registers the server upgrade handler for every bridge session and passes the normalized proxy target into `proxyGrabUpgrade`. `src/grab-bridge.ts:1066-1101` opens the corresponding HTTP(S) upstream upgrade request, rewrites `Host`, mirrors the handshake, forwards buffered bytes, and pipes both sockets. The adversarial review's claim that the bridge has no `upgrade` handler was wrong for the code reviewed in this pass.

## Other review corrections

- The review warned that the proxy might retain the inline `grabConfigTag()`. It does not: the non-proxy handoff still uses it at `src/grab-bridge.ts:497`, while proxy HTML uses only external scripts at `src/grab-bridge.ts:1190-1205`.
- The review's existing-session cookie limitation was correct, but it is an inherent origin boundary rather than a missing request-cookie rewrite; the new comment at `src/grab-bridge.ts:1308-1310` makes that boundary explicit.

## Adverse-pass disposition

The required source-only GPT-5.6-Sol pass found three current defects, all corrected before this report was finalized: `data-*` attribute-name collisions, a service-worker-only response reachable from the non-proxy route, and new fixture code that did not follow the brief's `var, function` constraint. Its fourth finding described the earlier `<meta\b[^>]*>` matcher; the current matcher at `src/grab-bridge.ts:1235-1251` is quote-aware, and the test at `test/grab-bridge-proxy-headers.test.mjs:132-151` now covers a quoted `>` explicitly. A second source-only pass was requested against the corrected files.

## Verification status

Build, TypeScript checks, tests, and git commands were not run, exactly as required by the brief. The orchestrator owns executable verification.
