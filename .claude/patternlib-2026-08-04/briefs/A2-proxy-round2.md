# Leg A2 — second pass on the grab-bridge proxy, from an adversarial review

Repo: `/Users/accunliffe/projects/raven-mcp`. Leg A already landed CSP-header stripping,
non-inline config, `Location` rewriting, and `Set-Cookie` rewriting in `src/grab-bridge.ts`.
An independent adversarial review then named ten concrete failure cases the first pass misses
on real, popular websites. Full review: `.claude/patternlib-2026-08-04/out/D-proxy-adversarial.json`
(JSON, the prose is in the `content` field — read it).

Fix the eight below. Two of the ten are deliberately deferred and are listed at the end;
do not implement those, document them instead.

## 1. Response-header set is incomplete

Add to the stripped set in `copyProxyResponseHeaders`: `permissions-policy`, `feature-policy`
(the overlay's clipboard/screenshot affordances are silently disabled by these), and `alt-svc`
(the browser caches an `h2=":443"` mapping against `127.0.0.1:<port>` and later loads hang
with `ERR_CONNECTION_CLOSED`).

## 2. `<meta http-equiv="Content-Security-Policy">` survives the header strip

Stripping the header does nothing about a CSP declared in the document. This is the single
most likely cause of "the panel just never appears" — Notion public pages, Google properties,
many WordPress plugins. In the HTML injection pass, remove any
`<meta ... http-equiv="content-security-policy" ...>` tag, case-insensitive, attribute order
independent. Also remove `content-security-policy-report-only` in meta form.

## 3. `<base href>` sends every relative URL back to the upstream origin

Shopify storefronts, Blogger, many WordPress themes. After a `<base href="https://upstream/">`
every relative asset and link resolves off the bridge: styling 404s, and the first click leaves
127.0.0.1 and the overlay is gone. In the injection pass, rewrite a `<base href>` whose resolved
origin equals the proxy target's to a bridge-relative path; leave a genuinely cross-origin base
alone (do not silently start proxying an origin the session was never pointed at).

## 4. `<meta http-equiv="refresh">` navigates off the bridge before the overlay binds

Legacy SSO interstitials and redirectors. Rewrite the URL inside a meta-refresh the same way
`Location` is rewritten — same-origin becomes bridge-relative, cross-origin is left alone.

## 5. Origin comparison for redirects is scheme-sensitive

`http://host` vs `https://host` is currently treated as offsite, so a login flow that redirects
with a different scheme escapes the bridge and the session is lost. Compare on **host + port**,
not full origin, when deciding whether to rewrite `Location` (and the meta-refresh above).
Keep the `X-Raven-Proxy-Offsite` header for genuinely different hosts.

## 6. Request-side `Origin` / `Referer` / `Sec-Fetch-*` leak `127.0.0.1` upstream

Any SaaS that gates state changes on `Origin` — GitHub, Stripe, Linear, Vercel — returns 403/422
or bounces to login, and the designer sees buttons that silently do nothing. In
`proxyGrabRequest`, before `fetch`: rewrite `origin` and `referer` to the proxy target's origin
(preserving the path of a same-origin referer), and drop `sec-fetch-site`, `sec-fetch-mode`,
`sec-fetch-dest`, `sec-fetch-user` from the forwarded headers so the upstream sees a normal
navigation rather than a cross-site one.

## 7. Service workers install against the bridge origin and stick

X, YouTube, Spotify, Instagram register `/sw.js`; it installs scoped to `127.0.0.1:<port>`,
then on the next reload serves cached upstream-shaped responses and the page goes blank or
"offline" — and because it is cached, it stays broken. Neutralize it: in the injected script
(the `/raven-grab.js` config prefix is the right place — it runs before page scripts only if it
is injected early, so put the no-op in a small inline-free head-safe form the existing injection
can carry), make `navigator.serviceWorker.register` a resolved no-op. Explain in a comment that
this is a deliberate capability reduction for a proxied third-party page, not a bug.

## 8. Charset — do not transcode, just be honest

Non-UTF-8 pages (`charset=gb2312` and friends) are currently decoded as UTF-8, re-encoded as
UTF-8, and served with the original charset header, producing mojibake. Do NOT write a
transcoder. Instead: only perform HTML injection when the response's charset is UTF-8 or
unspecified; for any other declared charset, pass the body through **untouched** and set a
response header `X-Raven-Proxy-Uninjected: charset=<value>` so the operator can see why the
overlay is absent. Losing the overlay on a gb2312 page is acceptable; corrupting the page is not.

## Deferred — document, do not implement

- **WebSockets.** The review flags them, but `src/grab-bridge.ts` already has `server.on("upgrade", …)`
  at ~`:417` and an upstream upgrade path at ~`:1081`. **Read both before writing anything.** If
  they already tunnel the proxy case, say so in your report and change nothing. If they do not,
  say that, and still change nothing — it is out of scope for this leg.
- **Pre-existing browser sessions do not carry over.** Cookies the browser holds for the upstream
  origin are never sent to `127.0.0.1`. This is inherent to same-origin proxying. Add a comment
  above `rewriteProxyCookie` stating it, so nobody later reads the cookie rewriting as a promise
  that "log in once in Chrome and the proxy is authenticated too."

## Tests — extend `test/grab-bridge-proxy-headers.test.mjs`

Add a case per fix, each able to fail, each with a positive control on the same response where an
absence is being asserted:
- `permissions-policy` / `alt-svc` stripped while a benign fixture header survives.
- Upstream HTML containing a meta-CSP → served HTML has no meta-CSP, and the surrounding markup
  is otherwise byte-identical (proves surgical removal, not a mangled document).
- `<base href="<upstreamOrigin>/app/">` → rewritten to `/app/`; a cross-origin base is untouched.
- Meta-refresh to the upstream origin → rewritten; cross-origin → untouched.
- 302 to `http://<upstreamHost>` while the target is `https://<upstreamHost>` — assert it is
  rewritten, i.e. treated as same-site. (Use a fixture where you control both.)
- The forwarded request seen by the fake upstream has `origin`/`referer` equal to the upstream
  origin and carries no `sec-fetch-*` — assert on what the upstream RECEIVED, not on the response.
- A `charset=gb2312` HTML response is byte-identical to what upstream sent, carries
  `x-raven-proxy-uninjected`, and contains no `raven-grab.js`; a UTF-8 response on the same
  fixture server IS injected. That pair is the positive control.

## Constraints — hard

- Touch **only** `src/grab-bridge.ts` and `test/grab-bridge-proxy-headers.test.mjs`.
- **Do not run build, tsc, tests, or any git command.** The orchestrator is editing
  `src/index.ts` concurrently and owns build/test.
- The NON-proxy grab path (local dev server, ~`:497`) stays behaviourally identical.
- `var`, `function`, Node built-ins, no new dependencies.

## Deliverable

Code, then `.claude/patternlib-2026-08-04/out/A2-report.md`: what you changed with line numbers,
the WebSocket finding (already handled or not, with the line numbers you read), and anything the
adversarial review got wrong about the current code.
