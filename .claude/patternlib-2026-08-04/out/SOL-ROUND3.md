## Findings

1. **P1, CONFIRMED (10/10) — HTTPS downgrade leaks cookies marked `Secure`.**  
   Any same-host redirect can rebind the entire session from HTTPS to HTTP without consent ([src/grab-bridge.ts:1224](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1224)). The cookie jar does not retain or enforce `Secure` ([src/grab-bridge.ts:1416](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1416), [src/grab-bridge.ts:1444](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1444)). The regression test explicitly stores a `Secure` cookie and expects it replayed over the HTTP fixture ([test/grab-bridge-proxy-headers.test.mjs:65](/Users/accunliffe/projects/raven-mcp/test/grab-bridge-proxy-headers.test.mjs:65), [test/grab-bridge-proxy-headers.test.mjs:131](/Users/accunliffe/projects/raven-mcp/test/grab-bridge-proxy-headers.test.mjs:131)). `X-Raven-Proxy-Downgraded` is carried on an automatically followed redirect, not presented as a user gate, and does not prevent the plaintext request. The edited test launders a security regression: avoiding the old loop did not require accepting downgrades.  
   **Required disposition:** refuse HTTPS→HTTP redirects or require an explicit new HTTP session; never replay `Secure` cookies over HTTP.

2. **P1, CONFIRMED (10/10) — the keyed-route test now canonizes broken Raven flows.**  
   Proxy mode permits only `/raven-grab.js`, `/tokens`, and `/grab`; every other keyed bridge route gets 404 ([src/grab-bridge.ts:1046](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1046), [src/grab-bridge.ts:1077](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1077)). Yet `startGrabSession` still returns a keyed `/agent/wait` URL and watch command ([src/grab-bridge.ts:497](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:497)), while the overlay calls:

   - `/template`, `/template-validation` ([browser/raven-grab.js:6082](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:6082))
   - `/components` ([browser/raven-grab.js:6375](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:6375))
   - `/layers`, `/layers-intent`, `/layers-operation` ([browser/raven-grab.js:7008](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:7008), [browser/raven-grab.js:7656](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:7656), [browser/raven-grab.js:7680](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:7680))
   - `/batch`, `/batch-commit` ([browser/raven-grab.js:7726](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:7726), [browser/raven-grab.js:8354](/Users/accunliffe/projects/raven-mcp/browser/raven-grab.js:8354))

   The edited test deliberately expects `/batch`, `/batch-commit`, and `/agent/wait` to fail ([test/grab-bridge.test.mjs:967](/Users/accunliffe/projects/raven-mcp/test/grab-bridge.test.mjs:967)). The old upstream-forwarding behavior was unsafe for authoring calls, but blanket 404 is not the correct contract for the agent long-poll or advertised batch flow.  
   **Required disposition:** move trusted agent/authoring traffic to a page-inaccessible channel, or suppress those controls and stop returning an unusable `wait_url` in proxy mode.

3. **P1, CONFIRMED (10/10) — `rank <= 2` still cross-binds a real token family.**  
   `FAMILIES` recognizes singular `letterspacing` but not the real plural camel-case segment `letterSpacings`; its loose regex matches both tracking and generic spacing ([src/reference-tokens.ts:300](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:300)). A path naming no declared family receives rank 2 and remains eligible ([src/reference-tokens.ts:329](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:329)); rank 2 is admitted by the filter ([src/reference-tokens.ts:101](/Users/accunliffe/projects/raven-mcp/src/reference-tokens.ts:101)).

   Runtime counterexample: `padding-top: 0px` bound to `letterSpacings.wide: 0.025em` as a near spacing token at 0.4px. Chakra officially uses the `letterSpacings.wide` category/value, specifically for `letter-spacing`, not padding. [Chakra token documentation](https://chakra-ui.com/docs/theming/tokens)  
   **Required disposition:** normalize camel-case/plural segments before classification and reject candidates that loose-match multiple families.

4. **P1, CONFIRMED (9/10) — cookie handling remains materially non-RFC.**  
   The jar is cleared on session start and stop, and name+path matching plus expiry are fixed. However, cookie storage receives no response URL ([src/grab-bridge.ts:1397](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1397)), defaults every missing `Path` to `/`, and ignores `Domain`, `Secure`, and cookie-prefix constraints ([src/grab-bridge.ts:1429](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1429), [src/grab-bridge.ts:1444](/Users/accunliffe/projects/raven-mcp/src/grab-bridge.ts:1444)). A cookie set at `/account/login` without `Path` is therefore replayed site-wide instead of defaulting to `/account`; an invalid foreign `Domain` is accepted. `HttpOnly` is effectively preserved because cookies never enter browser JavaScript.  
   **Required disposition:** derive default path from the response URL and enforce Domain, Secure, and prefix rules.

5. **P2, CONFIRMED (10/10) — round-2 #10 is only partially closed.**  
   Leg B now genuinely crosses the MCP schemas and handlers through `InMemoryTransport` ([test/e2e-pattern-library.mjs:89](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:89), [test/e2e-pattern-library.mjs:102](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:102)). It does not execute the injected overlay, post `/grab`, drain `get_grabbed_elements`, or feed that returned selection into `capture_reference`. Leg A only fetches HTML and the script asset ([test/e2e-pattern-library.mjs:48](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:48)); Leg B constructs `captured` and `stateStyles` manually ([test/e2e-pattern-library.mjs:121](/Users/accunliffe/projects/raven-mcp/test/e2e-pattern-library.mjs:121)). Breaking `/grab` still yields `ALL CHECKS PASSED`.  
   **Required disposition:** drive one selection through overlay → `/grab` → `get_grabbed_elements` → `capture_reference`.

## Claims that survived

- The live GitHub hand-run check passed, including the three real MCP tool calls.
- Live anonymous remote: 45 tools, hash `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
- `browser/raven-grab.js` and `web/public/raven-grab.js` are byte-identical.
- Both `.mcpb` files are byte-identical; their manifest, current `dist`, and Grab payloads match the working tree.
- Manifest, README, both `llms.txt` files, and `site/docs.html` consistently report 108 tools.
- OPTIONS scoping, WebSocket live-target lookup, state-style alias precedence, premultiplied alpha, angle parsing/clamping, and corrupt-index deletion recovery are present.
- The suite registers 1,212 tests. This host produced 1,156 pass, 1 fail, 55 skipped because Chromium is unavailable; therefore the claimed 1,209/0/3 split was not independently reproduced. The failure is the browser-dependent timeout assertion at [test/capture.test.mjs:726](/Users/accunliffe/projects/raven-mcp/test/capture.test.mjs:726), not a pattern-library regression.

**VERDICT: DOES NOT SURVIVE**


