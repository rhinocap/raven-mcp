# Adverse falsification pass — pattern library, round 5

You are auditing the fifth and (intended) final round of work on Raven MCP's
"pattern library" feature. Report only — do not edit files. Your job is to
FALSIFY the claim below, not to confirm it.

## The claim being made

> The pattern library is complete and ready for a human to test: a designer can
> point Raven's grab bridge at a third-party site, click an element in the real
> overlay, send it, and have the agent keep it (`capture_reference`), find it
> later (`search_references`), and map it onto their own design tokens
> (`map_reference_to_tokens`). The reverse proxy that makes this possible is
> hardened against the cookie, TLS-downgrade, and origin-confusion failures found
> in rounds 3 and 4. Round 4's six findings are all dispositioned.

## What changed in round 5 (`git diff` against `c73e98c`, plus untracked files)

1. `src/reference-tokens.ts` — round-4 finding #4. Compound family names
   (`letter-spacing`, `border-radius`, …) are now matched INSIDE a longer path
   segment, so Shopify Polaris's `--p-font-letter-spacing-dense` names its family
   instead of falling to the loose tier and being demoted as ambiguous. Generic
   single words are deliberately NOT scanned inside segments
   (`color.text-primary` must not become a font-size candidate).
   Tests: `test/reference-tokens.test.mjs`, two new tests, both directions.

2. `src/grab-bridge.ts` — round-4 findings #1/#2 (fixed earlier in the batch):
   cookie decisions now reason about the UPSTREAM URL rather than the loopback
   one; `__Secure-`/`__Host-` prefixes are REJECTED when malformed rather than
   upgraded; SameSite is enforced on the bridge because upstream can no longer
   see cross-site-ness; a meta refresh that changes scheme is left absolute
   rather than rewritten bridge-relative.
   Tests: `test/grab-bridge-proxy-round4.test.mjs` (5 tests). Causality proven by
   reverting each behaviour in `dist/` — 5/5 red, then 5/5 green after rebuild.

3. `test/e2e-pattern-library.mjs` — round-4 finding #5, the big one. The script
   used to POST a HAND-WRITTEN selection object to `/grab`. The queue seam was
   real but the payload was fiction: it claimed `width: 50%` where the overlay
   reports the resolved `640px`, wrote `padding-top` where the overlay reports
   the `padding` shorthand, and drained FLAT where the real overlay nests
   everything under `payload`. It now boots real Chromium against a local DOM
   fixture proxied by the bridge, clicks the element with a raw mouse click at a
   panel-free point, lets the REAL overlay extract and send, drains via a real
   MCP client, and feeds `capture_reference` from `element.payload`.
   32/32 checks pass.

4. `src/grab-bridge.ts` + `browser/raven-grab.js` + `web/public/raven-grab.js` —
   a defect the new browser leg found, which no module-level test could see. The
   bridge deliberately withholds `/batch-commit` from a proxied third-party
   origin (404, "Not available while proxying a third-party site"). The overlay
   could not see that, so it ended EVERY send by posting the commit, got the
   designed 404, and rendered it as a failed send: the button read "Retry send"
   and the site's console carried `[Raven Grab] POST /batch-commit failed`. The
   grab had in fact landed in the queue and was durable. Fix: the bridge now
   tells the overlay `authoring: "withheld"` in the injected proxy config; the
   overlay treats registration as terminal in that mode and labels it
   "1 pattern captured ✓". Tests: `test/grab-bridge-proxy-round5.test.mjs`
   (2 tests, both directions) plus two new e2e checks. Causality proven by
   reverting ONLY the bridge flag in `dist/` — the exact original symptom
   reproduced ("Retry send" + the 404 console error), then green after restore.

5. `src/index.ts` — round-4 finding #6. `start_grab_session`'s agent protocol
   said "No HTTP listener is available in this environment" whenever
   `watch_command` was empty, which is true in shim mode but WRONG while
   proxying, where the watcher route is withheld on purpose. Proxy mode now gets
   its own protocol text that tells the agent it is capture-only and that no
   batchCommit marker is coming.

6. `conversations/2026-08-04-pattern-library.md` — round-4 finding #3. Two
   overstated claims corrected in place, with the correction stated rather than
   silently rewritten: "they now force `secure`" (wrong remedy AND wrong
   behaviour — a browser rejects, it does not upgrade) and "the overlay's own
   payload" (it was a literal at the time).

## Evidence you should check rather than trust

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1227 tests, 1224 pass, 0 fail, 3 skipped.
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED (32 checks). Hits live
  github.com and launches Chromium; not part of `npm test`.
- The repo's own ground truth is in `CLAUDE.md` — read the "Ground truth" block.

## Attack these specifically

1. **Is the capture-only change right, or does it hide a real failure?** A send
   that no longer commits also never produces a `batchCommit` marker. Does any
   agent-facing instruction still tell the caller to wait for one in proxy mode?
   Is there a path where a LOCAL session could be told `authoring: "withheld"`?
2. **Does the compound-family matcher over-match?** Find a real design system
   whose token path contains a compound family name that means something else.
   `containsCompoundName` requires hyphen-or-boundary on both sides — is that
   actually sufficient?
3. **Is the new e2e leg load-bearing, or does it pass by construction?** Name an
   input that makes it fail. Check specifically whether its assertions would
   survive the overlay changing its payload shape, and whether the label-recorder
   (`setInterval` at 40ms sampling a transient 1.8s state) can miss.
4. **Cookie/proxy hardening:** find a case rounds 3 and 4 still miss. The bridge
   strips `sec-fetch-*` and rewrites `Origin`. What else does upstream lose that
   it was relying on for security?
5. **Release-side drift.** `dist/` is gitignored. `web/public/raven-grab.js` is a
   byte-identical mirror enforced by a test, but the `web` Vercel project has no
   git integration. What ships wrong if a release is cut right now?

Report each finding as: file:line, what is wrong, the concrete failure it
produces, and how to prove it. Rank by severity. If a section of the claim
survives your attack, say so explicitly — a short list of real findings is worth
more than a long list of speculative ones.
