## Findings

1. **P1 — CONFIRMED — 10/10:** The cookie jar evaluates the loopback request URL, not the actual upstream URL. [`src/grab-bridge.ts:1163`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1163) constructs `targetPath` against `http://127.0.0.1`; [`src/grab-bridge.ts:1186`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1186) consequently treats every normal upstream request as insecure, while [`src/grab-bridge.ts:1222`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1222) and [`src/grab-bridge.ts:1445`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1445) validate response cookies against `127.0.0.1`.

   Runtime probes confirmed:

   - A `Secure` cookie from `https://fixture.test` was never replayed over HTTPS.
   - A legitimate `Domain=localhost` cookie from an upstream localhost server was rejected.
   - A foreign `Domain=127.0.0.1` cookie from `https://fixture.test` was accepted and replayed to that upstream.

   Prefix handling is also incomplete: [`src/grab-bridge.ts:1450`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1450) upgrades malformed `__Secure-`/`__Host-` cookies instead of rejecting them, and does not enforce `__Host-`’s explicit `Path=/` and no-`Domain` requirements. Those requirements are defined in the [current RFC 6265bis draft](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html).

   **Required disposition:** derive cookie security and domain validation from the actual upstream URL; reject invalid prefixed cookies; add positive HTTPS Secure replay, valid upstream-domain, foreign-domain, insecure-prefix, and `__Host-` tests.

2. **P1 — CONFIRMED — 10/10:** Meta refresh rewriting can suppress an HTTP→HTTPS upgrade. [`src/grab-bridge.ts:1334`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1334) rewrites same-host refreshes without applying the redirect handler’s asymmetric scheme policy.

   Runtime proof: with an HTTP proxy target and:

   ```html
   <meta http-equiv="refresh" content="0;url=https://fixture.test/secure">
   ```

   the bridge emitted `content="0;url=/secure"` and subsequently fetched `http://fixture.test/secure`. The current test at [`test/grab-bridge-proxy-headers.test.mjs:195`](/Users/accunliffe/projects/raven-mcp/test/grab-bridge-proxy-headers.test.mjs:195) does not exercise cross-scheme meta refreshes.

   **Required disposition:** never flatten cross-scheme meta refreshes. Add both scheme directions and assert the actual second upstream URL.

3. **P2 — PLAUSIBLE — 8/10:** SameSite protection is discarded while the bridge makes cross-site requests appear same-origin. `ProxyCookie` stores no SameSite state at [`src/grab-bridge.ts:1423`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1423); parsing ignores it at [`src/grab-bridge.ts:1487`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1487). Meanwhile, [`src/grab-bridge.ts:1172`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1172) removes fetch-metadata headers and [`src/grab-bridge.ts:1189`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1189) rewrites `Origin`.

   A probe carrying `Origin: http://evil.test` and `Sec-Fetch-Site: cross-site` caused a `SameSite=Strict` cookie to be attached upstream, with the Origin rewritten to the target origin. Exploitation requires discovering the loopback port and reaching it from an external page, so the full attack chain remains plausible rather than confirmed.

   **Required disposition:** reject cross-site bridge requests before attaching cookies or forwarding them; alternatively introduce an unguessable per-session path/origin boundary and preserve browser-equivalent SameSite behavior.

4. **P2 — CONFIRMED — 10/10:** `segmentVariants` creates a real-design-system false gap. The overlapping loose-family checks at [`src/reference-tokens.ts:300`](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:300) and ambiguity demotion at [`src/reference-tokens.ts:357`](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:357) classify `font-letter-spacing` as both tracking and font-family.

   Using Shopify Polaris’s real `--p-font-letter-spacing-dense: -0.2px` token produced no binding for a matching `letter-spacing: -0.2px` capture. The token is documented in the official [Polaris font-token reference](https://polaris-react.shopify.com/tokens/font).

   **Required disposition:** recognize specific compound families before generic segments—`font-letter-spacing` must resolve to tracking—and add this exact Polaris path as a regression.

5. **P2 — CONFIRMED — 10/10:** The `/grab` queue is load-bearing, but the claimed overlay-to-grab e2e remains synthetic. [`test/e2e-pattern-library.mjs:64`](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:64) constructs a literal payload; [`test/e2e-pattern-library.mjs:127`](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:127) posts it directly; the drained result is then used at [`test/e2e-pattern-library.mjs:178`](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:178).

   Deleting the queue push would make the test fail, so `/grab → drain → capture` is causal. But broken overlay selection, serialization, or style extraction would not: the literal payload remains valid independently of the fetched GitHub DOM.

   **Required disposition:** execute the actual overlay payload producer against a selectable DOM fixture or live page, then drain that emitted payload. Retain the existing queue mutation check separately.

6. **P3 — CONFIRMED — 10/10:** Recorded claims overstate what is implemented.

   - [`conversations/2026-08-04-pattern-library.md:410`](/Users/accunliffe/projects/raven-mcp/conversations/2026-08-04-pattern-library.md:410) says prefixes “force secure,” which is not browser-correct prefix enforcement.
   - [`conversations/2026-08-04-pattern-library.md:459`](/Users/accunliffe/projects/raven-mcp/conversations/2026-08-04-pattern-library.md:459) calls the literal e2e fixture “the overlay’s own payload.”
   - [`src/index.ts:3116`](/Users/accunliffe/projects/raven-mcp/src/index.ts:3116) says no HTTP listener exists when proxy mode deliberately withholds the watch route despite having a listener.

   **Required disposition:** correct these statements after the corresponding behavior is fixed; distinguish “watch endpoint withheld in proxy mode” from “no listener available.” No contradictory claim was found in `CLAUDE.md`.

## Claims that survived

- The ordinary HTTPS→HTTP redirect path now stays offsite: absolute `Location`, `X-Raven-Proxy-Offsite`, no rebind, and no plaintext fetch by the bridge.
- HTTP→HTTPS response redirects rebind correctly.
- WebSocket forwarding uses the live target and its actual scheme.
- Cross-origin and cross-scheme `<base href>` values are not rewritten.
- Valid `Max-Age` takes precedence over `Expires`; default cookie-path calculation and path matching work; the jar is cleared at session start and stop.
- Proxy mode returns empty `wait_url` and `watch_command`.
- The live-network pattern-library e2e reported `ALL CHECKS PASSED`; its queue/drain portion is genuinely causal.
- The sandbox suite result was 1,218 tests: 1,162 passed, one Chromium-dependent failure, and 55 skipped. This is the environmental split anticipated in the brief, not a contradictory regression.
- Targeted non-browser tests reported 350 tests: 346 passed, zero failed, four browser skips.
- TypeScript checking passed.
- Local stdio exposes 108 tools. Anonymous remote exposes 45, with the claimed SHA-256 `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
- Both claimed mirror pairs are byte-identical. The MCPB archive’s relevant source, distribution, and manifest files also match the worktree.
- `npm pack --dry-run --json --ignore-scripts` contained no `.claude`, conversation, test, or temporary pattern-library artifacts.
- The remote `main` is still `985e5ce`; local HEAD is four commits ahead at `c73e98c`. The local package integrity differs from published `raven-mcp@2.3.0`, supporting the “not pushed or published” gate. Deployment was not independently probed.

VERDICT: DOES NOT SURVIVE


hook: Stop
hook: Stop
hook: Stop
hook: Stop Completed
hook: Stop Completed
hook: Stop Completed
tokens used
323,435
## Findings

1. **P1 — CONFIRMED — 10/10:** The cookie jar evaluates the loopback request URL, not the actual upstream URL. [`src/grab-bridge.ts:1163`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1163) constructs `targetPath` against `http://127.0.0.1`; [`src/grab-bridge.ts:1186`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1186) consequently treats every normal upstream request as insecure, while [`src/grab-bridge.ts:1222`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1222) and [`src/grab-bridge.ts:1445`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1445) validate response cookies against `127.0.0.1`.

   Runtime probes confirmed:

   - A `Secure` cookie from `https://fixture.test` was never replayed over HTTPS.
   - A legitimate `Domain=localhost` cookie from an upstream localhost server was rejected.
   - A foreign `Domain=127.0.0.1` cookie from `https://fixture.test` was accepted and replayed to that upstream.

   Prefix handling is also incomplete: [`src/grab-bridge.ts:1450`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1450) upgrades malformed `__Secure-`/`__Host-` cookies instead of rejecting them, and does not enforce `__Host-`’s explicit `Path=/` and no-`Domain` requirements. Those requirements are defined in the [current RFC 6265bis draft](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html).

   **Required disposition:** derive cookie security and domain validation from the actual upstream URL; reject invalid prefixed cookies; add positive HTTPS Secure replay, valid upstream-domain, foreign-domain, insecure-prefix, and `__Host-` tests.

2. **P1 — CONFIRMED — 10/10:** Meta refresh rewriting can suppress an HTTP→HTTPS upgrade. [`src/grab-bridge.ts:1334`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1334) rewrites same-host refreshes without applying the redirect handler’s asymmetric scheme policy.

   Runtime proof: with an HTTP proxy target and:

   ```html
   <meta http-equiv="refresh" content="0;url=https://fixture.test/secure">
   ```

   the bridge emitted `content="0;url=/secure"` and subsequently fetched `http://fixture.test/secure`. The current test at [`test/grab-bridge-proxy-headers.test.mjs:195`](/Users/accunliffe/projects/raven-mcp/test/grab-bridge-proxy-headers.test.mjs:195) does not exercise cross-scheme meta refreshes.

   **Required disposition:** never flatten cross-scheme meta refreshes. Add both scheme directions and assert the actual second upstream URL.

3. **P2 — PLAUSIBLE — 8/10:** SameSite protection is discarded while the bridge makes cross-site requests appear same-origin. `ProxyCookie` stores no SameSite state at [`src/grab-bridge.ts:1423`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1423); parsing ignores it at [`src/grab-bridge.ts:1487`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1487). Meanwhile, [`src/grab-bridge.ts:1172`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1172) removes fetch-metadata headers and [`src/grab-bridge.ts:1189`](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1189) rewrites `Origin`.

   A probe carrying `Origin: http://evil.test` and `Sec-Fetch-Site: cross-site` caused a `SameSite=Strict` cookie to be attached upstream, with the Origin rewritten to the target origin. Exploitation requires discovering the loopback port and reaching it from an external page, so the full attack chain remains plausible rather than confirmed.

   **Required disposition:** reject cross-site bridge requests before attaching cookies or forwarding them; alternatively introduce an unguessable per-session path/origin boundary and preserve browser-equivalent SameSite behavior.

4. **P2 — CONFIRMED — 10/10:** `segmentVariants` creates a real-design-system false gap. The overlapping loose-family checks at [`src/reference-tokens.ts:300`](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:300) and ambiguity demotion at [`src/reference-tokens.ts:357`](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:357) classify `font-letter-spacing` as both tracking and font-family.

   Using Shopify Polaris’s real `--p-font-letter-spacing-dense: -0.2px` token produced no binding for a matching `letter-spacing: -0.2px` capture. The token is documented in the official [Polaris font-token reference](https://polaris-react.shopify.com/tokens/font).

   **Required disposition:** recognize specific compound families before generic segments—`font-letter-spacing` must resolve to tracking—and add this exact Polaris path as a regression.

5. **P2 — CONFIRMED — 10/10:** The `/grab` queue is load-bearing, but the claimed overlay-to-grab e2e remains synthetic. [`test/e2e-pattern-library.mjs:64`](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:64) constructs a literal payload; [`test/e2e-pattern-library.mjs:127`](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:127) posts it directly; the drained result is then used at [`test/e2e-pattern-library.mjs:178`](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:178).

   Deleting the queue push would make the test fail, so `/grab → drain → capture` is causal. But broken overlay selection, serialization, or style extraction would not: the literal payload remains valid independently of the fetched GitHub DOM.

   **Required disposition:** execute the actual overlay payload producer against a selectable DOM fixture or live page, then drain that emitted payload. Retain the existing queue mutation check separately.

6. **P3 — CONFIRMED — 10/10:** Recorded claims overstate what is implemented.

   - [`conversations/2026-08-04-pattern-library.md:410`](/Users/accunliffe/projects/raven-mcp/conversations/2026-08-04-pattern-library.md:410) says prefixes “force secure,” which is not browser-correct prefix enforcement.
   - [`conversations/2026-08-04-pattern-library.md:459`](/Users/accunliffe/projects/raven-mcp/conversations/2026-08-04-pattern-library.md:459) calls the literal e2e fixture “the overlay’s own payload.”
   - [`src/index.ts:3116`](/Users/accunliffe/projects/raven-mcp/src/index.ts:3116) says no HTTP listener exists when proxy mode deliberately withholds the watch route despite having a listener.

   **Required disposition:** correct these statements after the corresponding behavior is fixed; distinguish “watch endpoint withheld in proxy mode” from “no listener available.” No contradictory claim was found in `CLAUDE.md`.

## Claims that survived

- The ordinary HTTPS→HTTP redirect path now stays offsite: absolute `Location`, `X-Raven-Proxy-Offsite`, no rebind, and no plaintext fetch by the bridge.
- HTTP→HTTPS response redirects rebind correctly.
- WebSocket forwarding uses the live target and its actual scheme.
- Cross-origin and cross-scheme `<base href>` values are not rewritten.
- Valid `Max-Age` takes precedence over `Expires`; default cookie-path calculation and path matching work; the jar is cleared at session start and stop.
- Proxy mode returns empty `wait_url` and `watch_command`.
- The live-network pattern-library e2e reported `ALL CHECKS PASSED`; its queue/drain portion is genuinely causal.
- The sandbox suite result was 1,218 tests: 1,162 passed, one Chromium-dependent failure, and 55 skipped. This is the environmental split anticipated in the brief, not a contradictory regression.
- Targeted non-browser tests reported 350 tests: 346 passed, zero failed, four browser skips.
- TypeScript checking passed.
- Local stdio exposes 108 tools. Anonymous remote exposes 45, with the claimed SHA-256 `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
- Both claimed mirror pairs are byte-identical. The MCPB archive’s relevant source, distribution, and manifest files also match the worktree.
- `npm pack --dry-run --json --ignore-scripts` contained no `.claude`, conversation, test, or temporary pattern-library artifacts.
- The remote `main` is still `985e5ce`; local HEAD is four commits ahead at `c73e98c`. The local package integrity differs from published `raven-mcp@2.3.0`, supporting the “not pushed or published” gate. Deployment was not independently probed.

VERDICT: DOES NOT SURVIVE


