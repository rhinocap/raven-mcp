# SOL falsification — grab loop

Verdict: **the claim does not survive**. The local/anonymous count arithmetic, clean TypeScript build, clean npm payload, reference-id traversal defense, and the two no-side-effect tool-description claims survive. The end-to-end loop does not: a proxied hostile page receives the bridge capability, state styles do not round-trip into `capture_reference`, the mapper can return semantically and visually wrong bindings, both `.mcpb` bundles are stale, and the asserted test census is already three tests behind the current tree.

## Ranked defects

### 1. P0 — a proxied third-party page receives the key that unlocks local DESIGN.md data

- **Evidence:** `src/grab-bridge.ts:1195-1197`, `src/grab-bridge.ts:1374-1377`, `src/grab-bridge.ts:1406-1415`.
- **Trigger:** proxy any page containing an upstream script. Raven injects `/raven-grab.js?key=<capability>&cfg=...` into that page. The upstream script can enumerate `document.scripts`, read the key, then call same-origin `/tokens?key=<key>`.
- **Wrong output/effect:** the third-party page can read the local DESIGN.md path and flattened token contents and can call other key-protected bridge routes. Removing CSP/COEP/CORP increases the set of upstream scripts allowed to run, but the only acknowledgement says the proxy is “user-initiated”; it does not disclose that the viewed page gains the local bridge capability.
- **Fix:** do not place a privileged bridge key in the proxied document. Run the overlay in an isolated origin/world and mediate a narrow message protocol, with untrusted page content unable to call `/tokens`, `/grab`, template, layer, or agent routes. Add an explicit trust warning until that boundary exists.

### 2. P0 — rewritten upstream cookies leak across unrelated localhost services and proxy sessions

- **Evidence:** `src/grab-bridge.ts:1327-1344`; shutdown at `src/grab-bridge.ts:514-535` does not expire cookies.
- **Trigger:** upstream sends `Set-Cookie: sid=secret; Secure; Domain=example.com; HttpOnly; SameSite=None`. Raven removes `Secure` and `Domain` and changes `SameSite=None` to `Lax`.
- **Wrong output/effect:** the credential becomes a host-only cookie for `127.0.0.1`, and cookies are not port-scoped. It can be sent to an unrelated local server or a later Raven proxy on another port; same-name cookies from two upstream sites can overwrite or contaminate each other. `__Secure-`/`__Host-` cookies may instead be rejected after `Secure` is removed, breaking login. This is a security downgrade with no user warning or consent.
- **Fix:** keep upstream cookies in a server-side, per-session jar scoped to the real upstream origin; do not emit them into the browser's localhost cookie store. Clear the jar on session stop and document that existing browser-origin sessions do not carry over.

### 3. P1 — `capture_reference` cannot accept the state-style shape returned by Grab

- **Evidence:** Grab returns `{ stateStyles: { hover: { declarations: [...], tokens?, active? } } }` at `src/grab-bridge.ts:43-48` and `src/grab-bridge.ts:576-582`; the tool tells callers to pass that selection at `src/index.ts:3173-3183`, but its input is `state_styles: record(record(string))` at `src/index.ts:3191-3194`.
- **Trigger:** pass a real drained selection such as `{ stateStyles: { hover: { declarations: [{ property: "color", value: "red" }] } } }` to `capture_reference`, either verbatim or renamed to `state_styles`.
- **Wrong output:** verbatim `stateStyles` is not the declared argument and is dropped/rejected; renamed `state_styles` fails because `declarations` is an array, not a string. The advertised hover/focus persistence loop is not a direct round-trip.
- **Fix:** accept the actual `GrabStateStyles` schema and convert declarations deliberately in the handler, or store that shape verbatim. Use the same field name on producer and consumer and add a handler-level round-trip test using a real drained selection.

### 4. P1 — colour selection ignores alpha when ranking candidates

- **Evidence:** `src/reference-tokens.ts:161-170` computes and sorts only RGB distance; alpha changes the verdict text but not the distance.
- **Trigger:** captured `rgba(0,0,0,0.1)` with tokens `color.wrong-alpha = rgba(0,0,0,1)` and `color.right-alpha = #0100001a`.
- **Wrong output:** `color.wrong-alpha` wins with `delta: 0`, even though its alpha is off by 0.9 while `color.right-alpha` has essentially the right alpha and RGB distance 1.
- **Fix:** include alpha in the ranking metric (preferably compare premultiplied RGBA), expose both RGB and alpha deltas, and test competing candidates rather than only asserting that one alpha mismatch is labelled `near`.

### 5. P1 — numeric proximity can bind a CSS property to the wrong token family

- **Evidence:** all resolved tokens are compared at `src/reference-tokens.ts:87-91`; affinity is only a tie-break at `src/reference-tokens.ts:241-244`. The test at `test/reference-tokens.test.mjs:116-123` explicitly preserves “closer numeric match wins” across families.
- **Trigger:** captured `{ "font-size": "16px" }` with `space.4 = 16px` and `type.body = 17px`.
- **Wrong output:** exact binding to `space.4`, yielding `font-size: var(--space-4)`. This is deterministic but semantically wrong, so “never a forced match” and “uses your type ramp” are false for overlapping scales.
- **Fix:** filter or rank candidates by explicit property-to-token-family compatibility before distance; if no compatible ramp exists, emit a gap. Do not infer compatibility solely from a loose path regex.

### 6. P1 — both distributed `.mcpb` bundles still expose 105 tools and omit all three new tools

- **Evidence:** `site/raven.mcpb` embedded `manifest.json:57` and `web/public/raven.mcpb` embedded `manifest.json:57` each contain 105 tools and none of `capture_reference`, `search_references`, or `map_reference_to_tokens`. The rebuild/copy path is `scripts/build-mcpb.sh:20-23` and `scripts/build-mcpb.sh:56-60`.
- **Trigger:** install either checked-in `.mcpb` instead of running local source/npm `dist`.
- **Wrong output:** the installed product remains the old 105-tool surface, so the loop is absent even though root `manifest.json` and local `dist` say 108.
- **Fix:** rebuild the bundle from the clean current `dist`, regenerate both copies, then inspect the embedded manifest and run its `tools/list` before handoff.

### 7. P1 — common upstream paths are captured by Raven instead of proxied

- **Evidence:** `src/grab-bridge.ts:1035-1041` reserves `/tokens`, `/template`, `/components`, `/batch`, `/grab`, `/layers`, and other root paths whenever proxying.
- **Trigger:** a third-party application legitimately requests `GET /components` or `GET /tokens` without Raven's key.
- **Wrong output:** Raven handles it as a bridge route and returns 403 instead of forwarding it upstream. A site using any colliding path can lose data/API calls or fail to render.
- **Fix:** namespace every bridge endpoint under an unguessable Raven prefix and proxy every ordinary upstream pathname unchanged.

### 8. P1 — the exact test claim is stale and was not reproduced

- **Evidence:** the current three new test files register 29 tests, including three mapper-affinity tests at `test/reference-tokens.test.mjs:105-130`. A direct current-tree run registered **1182**, not 1179. `CLAUDE.md:5` still records the older 1153/1150/0/3 baseline.
- **Trigger:** run the current `test/**/*.test.mjs` corpus.
- **Wrong output:** the claimed `1179 / 1176 / 0 / 3` cannot describe this tree. In this sandbox the read-only test run produced 1182 total, 1098 pass, 1 fail, 83 skipped; the one failure was `listen EPERM` and browser/loopback tests were unavailable, so that run is environmental evidence, not a product failure. The exact zero-fail/three-skip claim remains unverified here.
- **Fix:** rerun the standard suite in the permitted physical-host Chromium environment, record the now-current 1182-test census, and update the ledger with verified pass/skip counts. Do not install or run Playwright WebKit on the physical host.

### 9. P2 — an HTTP-to-HTTPS redirect can loop forever because scheme is discarded but the upstream origin is not updated

- **Evidence:** redirects are reduced to a relative path at `src/grab-bridge.ts:1158-1166`; `sameProxyHost` ignores scheme at `src/grab-bridge.ts:1210-1215`; every subsequent request still uses the original fixed `proxyTarget` at `src/grab-bridge.ts:1104-1107`.
- **Trigger:** `proxy_target=http://example.test`; upstream responds `301 Location: https://example.test/account`.
- **Wrong output:** Raven rewrites to `/account`; the browser requests the bridge; Raven fetches `http://example.test/account` again. A normal HTTPS upgrade becomes a redirect loop or continues on the weaker scheme rather than following the upstream destination.
- **Fix:** compare effective origins, and when a permitted scheme transition is followed, update/encode the upstream origin for the next bridged request. Do not erase a scheme change into a relative URL while retaining the old target.

### 10. P2 — corrupt-index recovery works for search but permanently blocks new captures

- **Evidence:** `recordFiles` catches a bad index and scans record files at `src/reference-store.ts:268-284`, but `saveReference` calls the throwing `readIndex()` before writing at `src/reference-store.ts:124-127`; parse failure is fatal at `src/reference-store.ts:323-335`.
- **Trigger:** `index.json` contains a partial write such as `{"version":1,"ref_ids":[`.
- **Wrong output:** `listReferences()` returns with `skipped:["index.json"]`, but every subsequent `capture_reference` fails with “Corrupt reference store … invalid JSON”; the store cannot self-heal.
- **Fix:** rebuild the index from validated record filenames when index parsing fails, preserve the corrupt file for diagnosis, then atomically write the repaired index before saving.

### 11. P2 — exact CSS colours outside the legacy parser become false gaps

- **Evidence:** `src/reference-tokens.ts:161-164` delegates to `parseKnownColor`; `src/contrast.ts:120-170` supports hex, comma-form rgb/rgba, black, white, and transparent only.
- **Trigger:** captured `rgb(255, 0, 0)` with an exact project token value `red`, `hsl(0 100% 50%)`, or an equivalent `oklch(...)` value.
- **Wrong output:** no binding and “No project token is within the RGB distance threshold,” although an exact token exists.
- **Fix:** parse the CSS colour syntaxes DESIGN.md permits, including ordinary named colours and modern functional forms, or narrow the tool/README claim to the actually supported forms and return an unsupported-token-value diagnostic.

### 12. P2 — broken reference chains are only reported when no other token matches

- **Evidence:** broken refs are collected at `src/reference-tokens.ts:68-70` but appended to a gap only inside the no-winner branch at `src/reference-tokens.ts:94-98`.
- **Trigger:** captured `#fff` with `color.good = #fff` plus `color.broken -> missing`.
- **Wrong output:** an exact `color.good` binding with `gaps: []`; the promised named broken-chain gap disappears because an unrelated valid winner exists.
- **Fix:** return token diagnostics independently of property gaps, or always surface broken reference chains in a dedicated diagnostics array.

### 13. P2 — the implemented tie-break no longer matches the stated deterministic contract

- **Evidence:** the stated order is delta, shortest path, lexicographic path; current code inserts affinity before path length at `src/reference-tokens.ts:241-244` and the new expectation is encoded at `test/reference-tokens.test.mjs:105-114`.
- **Trigger:** equal 64px tokens `type.size.hero` and longer `type.leading.hero` for `line-height`.
- **Wrong output:** `type.leading.hero` wins even though the documented order requires the shorter `type.size.hero`. This may be a better semantic choice, but it is an undocumented contract change and makes the original determinism claim false.
- **Fix:** either restore the specified order, or explicitly revise the contract/tool description to delta → compatible family → shortest path → lexicographic and test false-positive affinity cases.

## Claims that survive

- **Reference path containment survives.** `ref_id` rejects separators and traversal at `src/reference-store.ts:256-262`; tested `../escape` and `a/b` throw. HTTP(S) URL text is stored as JSON data and is never used to construct a path. `index` is an awkward reserved-name collision but does not escape the directory.
- **Atomic replacement survives on this POSIX host.** `src/reference-store.ts:338-346` writes a unique sibling temp then renames it; a crash can leave an ignored temp/orphan record, while record discovery recovers committed record files. The corrupt-index availability defect above is separate.
- **Reference cycles survive.** `src/reference-tokens.ts:139-156` detects self and multi-node cycles without hanging and names the chain when the property has no valid winner.
- **Zero unitless values survive the stated relative-only rule.** `src/reference-tokens.ts:188-196` accepts exact zero and refuses nonzero “near” values because relative error from zero is undefined; returning a gap is safer than inventing a denominator.
- **The non-proxy path survives source inspection.** Proxy rewriting is entered only under `proxyTarget` at `src/grab-bridge.ts:1038-1041`; the service-worker no-op is conditional at `src/grab-bridge.ts:1386-1391`. Runtime loopback proof was blocked by `listen EPERM`.
- **Local and anonymous counts survive.** Current `dist` registers 108 local tools; anonymous remote registers 45, hashes to `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, and contains none of the three new tools. Root `manifest.json` contains 108. README and both `llms.txt` files say 108. The stale `.mcpb` artifacts are the distribution exception.
- **Build/dist/npm payload survive.** A clean TypeScript compile into `/tmp` passed and its key JS/declaration outputs were byte-identical to current `dist`. `npm pack --dry-run --ignore-scripts` listed the new reference store/mapper JS, declarations, and maps; no deleted `reference-prompt` implementation remained. The dry-run was retried with a temporary npm cache because the user cache returned `EPERM`.
- **`capture_reference` does not drain Grab.** Its handler at `src/index.ts:3196-3208` calls only `saveReference`; no grab queue function is called.
- **`map_reference_to_tokens` uses no network and no model.** Its handler at `src/index.ts:3251-3273` performs local reference/DESIGN.md reads and calls the deterministic mapper. It does filesystem I/O when `ref_id` or `design_file_path` is supplied, but its narrower “no network, no model” claim is accurate.

## Contract drift outside the ranked runtime defects

- `CLAUDE.md:3` correctly records the still-published npm v2.3.0 surface as 105, but it does not separately record the working-tree 108/63 state and later says “All 105” as though one number described both. `CLAUDE.md:5` is also the old test census. Preserve the published 105 as historical/current-npm truth; add separate repo/pending-release 108/63 and current test evidence rather than globally replacing every historical 105/60.
- `docs/spec-pattern-library.md:158`, `:499`, `:509`, `:544-550`, `:593`, and `:699` still contain baseline/planned 105/60 arithmetic. Some are legitimate historical phase math; the phrases “today” and current source-line assertions are stale and should be labelled as a pre-implementation snapshot or updated selectively.

## Verification boundary

No Git command was run and no implementation was changed. The only repository write is this report. Strict-CSP proxy runtime behavior, cookie behavior in a real browser, and the claimed three-skip full-suite result are **not runtime-confirmed in this sandbox** because loopback listeners fail with `EPERM`; their source paths and concrete browser effects above remain directly falsifiable.
