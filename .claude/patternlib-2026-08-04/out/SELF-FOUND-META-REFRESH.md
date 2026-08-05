# Self-found while round 4 was running — the meta-refresh rewriter ignores a scheme change

**P1. Same class as Sol R3-#1, in the path I did not fix.**

`sameProxyHost` (src/grab-bridge.ts:1294) compares hostname and port only. The
redirect handler now pairs it with an explicit `downgrade` guard
(src/grab-bridge.ts:1228), but the meta-refresh rewriter still calls it bare
(src/grab-bridge.ts:1343). So a scheme change in a `<meta http-equiv="refresh">`
is rewritten to a bridge-relative path and then fetched over whatever scheme the
session already holds.

## Verified by effect, not by reading

Session proxying `http://127.0.0.1:PORT`. The page served over plaintext says:

    <meta http-equiv="refresh" content="0; url=https://127.0.0.1:PORT/secure">

The browser receives:

    <meta http-equiv="refresh" content="0; url=/secure">

The site tried to move the visitor to TLS and the proxy discarded the upgrade —
the follow-up goes out over the session's existing plaintext upstream. The
mirror case (https session, page refreshes to `http://same-host/…`) is rewritten
the same way; there the bridge keeps using https, so it is not a strip, but it
is the same missing check.

## Disposition

Require scheme equality in the meta-refresh rewrite: when the scheme differs,
leave the absolute URL alone so the browser navigates off the bridge and makes
its own decision — the same answer the redirect handler now gives a downgrade.
One regression test per direction in `test/grab-bridge-proxy-headers.test.mjs`,
which already owns the meta-refresh coverage.

Held until the round-4 report lands so the fixes go in one batch rather than
editing the tree under a running audit.
