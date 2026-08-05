# Leg A — harden the grab-bridge reverse proxy for third-party sites

Repo: `/Users/accunliffe/projects/raven-mcp` (TypeScript, ESM, Node built-ins only).

## Context you need

`src/grab-bridge.ts` runs a same-origin reverse proxy so a designer can point Raven's
grab overlay at ANY site, not just their own dev server. `startGrabSession(path, port,
proxyTarget, role)` binds `http://127.0.0.1:<port>` and `proxyGrabRequest()` (~line 1104)
forwards every request to `proxyTarget` and injects the overlay into HTML responses.

It was measured live against `https://linear.app` and works. It measurably BREAKS on
three classes of site. Fix all three.

## Defect 1 — Content-Security-Policy blocks the overlay

`copyProxyResponseHeaders()` (~line 1183) strips only
`content-length, content-encoding, transfer-encoding, connection`. Every other upstream
header passes through, **including `Content-Security-Policy`**. `grabConfigTag()`
(~line 358) emits an INLINE `<script>window.ravenGrabConfig={...}</script>`, so any site
whose CSP lacks `'unsafe-inline'` in `script-src` silently drops the overlay's config and
the panel never boots. Verified broken on github.com and stripe.com; verified working on
linear.app / vercel.com / notion.so only because those allow `'unsafe-inline'`.

Fix BOTH halves — belt and braces, because either alone is fragile:

1. **Stop depending on inline script.** Keep `grabConfigTag()` exported and unchanged for
   the NON-proxy path (line 497 uses it and that path must stay byte-identical). In the
   proxy path only, pass the same config object through the existing same-origin script
   URL instead: `<script src="/raven-grab.js?key=<key>&cfg=<encodeURIComponent(json)>"></script>`.
   Then in the `/raven-grab.js` route handler, when `cfg` is present, prepend
   `window.ravenGrabConfig=<parsed-and-reserialized json>;` to the served JS body.
   Reserialize through `JSON.parse` → `JSON.stringify` so a malformed or hostile `cfg`
   cannot inject arbitrary JS; on parse failure serve the JS with no config prefix.
   Preserve the existing `<` → `<` escaping discipline.
2. **Strip the upstream CSP.** Add to the stripped set in `copyProxyResponseHeaders`:
   `content-security-policy`, `content-security-policy-report-only`,
   `x-frame-options`, `cross-origin-embedder-policy`, `cross-origin-opener-policy`,
   `cross-origin-resource-policy`, `report-to`, `reporting-endpoints`.
   Put a comment above the set stating WHY: the bridge is a local, key-gated,
   user-initiated proxy of a page the user is already allowed to view; the upstream
   policy is written for the upstream origin and cannot be satisfied from 127.0.0.1.

## Defect 2 — redirects escape the bridge

`fetch(..., { redirect: "manual" })` plus a verbatim `Location` header means a 3xx sends
the browser straight to the real origin and the session is lost. Rewrite `Location` on any
3xx: if the resolved absolute URL's origin equals `proxyTarget`'s origin, replace it with a
bridge-relative path (`pathname + search + hash`). If the origin DIFFERS, leave it alone —
do not silently proxy an unrelated origin the session was never pointed at — but add a
response header `x-raven-proxy-offsite: <origin>` so the operator can see it happened.

## Defect 3 — cookies do not survive

Logged-in sites break because upstream `Set-Cookie` carries `Secure` (dropped over plain
`http://127.0.0.1`) and a `Domain=` for the upstream host (rejected). In
`copyProxyResponseHeaders`, rewrite each cookie string before setting it:
drop `Secure`, drop `Domain=...`, and downgrade `SameSite=None` to `SameSite=Lax`.
Leave `HttpOnly`, `Path`, `Expires`, `Max-Age` untouched. Parse attribute-wise and
case-insensitively; do not regex the whole cookie blindly — a cookie VALUE can contain
the substring `secure`.

## Constraints — these are hard

- Touch **only** `src/grab-bridge.ts` and create **only** `test/grab-bridge-proxy-headers.test.mjs`.
  Do not edit `src/index.ts`, `package.json`, `manifest.json`, any other test file, or `dist/`.
- **Do not run `npm run build`, `tsc`, `npm test`, or any git command.** Other agents are
  writing this same worktree concurrently; the orchestrator builds and tests. Write source only.
- The NON-proxy grab path (local dev server, line ~497) must stay behaviourally identical.
  Its script tag, its config, its headers. No change.
- Style: match the file — `var` declarations, `function` keyword, no new dependencies,
  Node built-ins only. Comments explain WHY, not what.

## Test file to write

`test/grab-bridge-proxy-headers.test.mjs`, `node:test` + `node:assert/strict`, matching the
style of the existing `test/grab-bridge.test.mjs`. Stand up a throwaway `http.createServer`
as a fake upstream and point a grab session at it. Assert by EFFECT, and make each assertion
able to fail:

1. Upstream sends a hostile `Content-Security-Policy: script-src 'none'` → the proxied
   response has NO `content-security-policy` header. Positive control on the same response:
   a benign upstream header (e.g. `x-fixture-marker`) IS still present, so the test proves
   selective stripping rather than "no headers at all".
2. The injected script tag is NOT inline — assert the served HTML contains no
   `<script>window.ravenGrabConfig` and DOES contain `raven-grab.js?key=`.
3. `GET /raven-grab.js?key=<key>&cfg=<encoded>` returns a body starting with
   `window.ravenGrabConfig=` and containing the config's `projectName`; a malformed `cfg`
   returns the JS WITHOUT a config prefix and does not 500.
4. Upstream 302 with `Location: <upstreamOrigin>/next` → proxied `Location` is `/next`.
   Upstream 302 to a different origin → `Location` unchanged AND `x-raven-proxy-offsite` set.
5. Upstream `Set-Cookie: sid=abc; Path=/; Secure; HttpOnly; SameSite=None; Domain=example.com`
   → proxied cookie keeps `sid=abc`, `Path=/`, `HttpOnly`; has no `Secure`, no `Domain=`;
   and has `SameSite=Lax`.
6. A cookie whose VALUE contains `secure` (e.g. `pref=insecure-mode; Path=/`) survives with
   its value intact — the guard against a naive regex.

## Deliverable

Write the code. Then write to `.claude/patternlib-2026-08-04/out/A-report.md`: the exact
functions you changed with line numbers, any place where you deviated from this brief and
why, and anything you found that this brief got wrong about the current code.
