# 2026-08-04 — pattern library: the capture→apply loop

Per-instance log. Session continues from `2026-08-03-pregate-round2.md`.

## Where this session turned

Andrew, verbatim: *"I explicitly told you I wanted to add clickyhq.com and mobbin.com
functionality to Raven so that anyone could grab other patterns and apply them to their
projects. That was the whole point of this project."* Everything below serves that sentence.

Then: *"Let's start with the proxy and see how it works"* → measured, works (below).
Then: *"Graph engineer it to do A and B … use as many agents as possible, they need to be
Codex and Open Router agents because I am almost at my limits with anthropic tokens."*

## Measured this session — the proxy half already works

`start_grab_session({ proxy_target: "https://linear.app", role: "consumer" })` → port 57157.
HTTP 200, 1,266,460 bytes, real `<title>Linear – The system for product development</title>`,
overlay injected once. Clicking the hero selected `span.hide-mobile:nth-of-type(9)` and the
drain returned a complete payload: font stack, `font-weight: 510`, `font-size: 64px`,
`line-height: 64px`, `letter-spacing: -1.408px`, `color: rgb(247, 248, 248)`, rect, hover
`stateStyles`, and the designer's note bound to the selector.

**Capture works today with zero new code.** Three measured gaps:
1. `tokens: []` — nothing maps the captured CSS onto the user's own design tokens.
2. Nothing persists. The drain is the only copy; close the tab and the pattern is gone.
3. CSP breaks the overlay on github.com / stripe.com (no `'unsafe-inline'`); redirects escape
   the bridge; `Secure` cookies don't survive `http://127.0.0.1`, so login-gated apps fail.

Deliberately did NOT proxy mobbin.com — paywalled, ToS forbids, spec §5 rules it out.

## The graph (launched 22:02)

Five legs, all non-Anthropic. Writers get disjoint files so they cannot conflict; nobody but
the orchestrator builds, tests, or touches git.

| Leg | Executor | Writes | Job |
|---|---|---|---|
| A | codex `gpt-5.6-sol` medium | `src/grab-bridge.ts`, `test/grab-bridge-proxy-headers.test.mjs` | strip CSP/frame headers, non-inline config, rewrite `Location`, rewrite `Set-Cookie` |
| B1 | codex `gpt-5.6-sol` medium | `src/reference-store.ts`, `test/reference-store.test.mjs` | persist + search a grabbed pattern |
| B2 | codex `gpt-5.6-sol` medium | `src/reference-tokens.ts`, `test/reference-tokens.test.mjs` | map captured CSS → the project's own tokens |
| D | OpenRouter `z-ai/glm-5.2` | report only | adversarial: what the A plan misses on real sites |
| E | OpenRouter `moonshotai/kimi-k3` | report only | first-draft `server.tool` registrations for the 3 new tools |

Briefs: `.claude/patternlib-2026-08-04/briefs/`. Outputs: `.claude/patternlib-2026-08-04/out/`.

A and B are independent — A touches only the proxy, B only new modules — so they run fully
parallel. The one true serialization point is `src/index.ts`, which the orchestrator owns
alone because the tool-count contract is frozen and fails loudly.

## Leg A2 — second proxy pass (launched after D's adversarial review)

D (GLM 5.2) named ten failure cases the first pass misses on real sites. Eight became
brief `A2-proxy-round2.md`; two were deferred to documentation. A2 landed all eight:
`Permissions-Policy`/`Feature-Policy`/`Alt-Svc` stripped, meta-CSP removed surgically,
same-origin `<base href>` and meta-refresh rewritten, redirect origin compared on
**host+port not scheme**, outbound `Origin`/`Referer` rewritten and `Sec-Fetch-*` dropped,
`navigator.serviceWorker.register` no-opped from an early external script, and non-UTF-8
HTML passed through byte-identical with `X-Raven-Proxy-Uninjected` instead of transcoded.

**A2 corrected the review twice**, which is why the leg reads the code instead of trusting
the critique: the bridge already tunnels WebSockets (`src/grab-bridge.ts:417-419` →
`proxyGrabUpgrade` at `:1066-1101`), and the proxy path never used the inline
`grabConfigTag()` — that is the non-proxy handoff at `:497`.

## Orchestrator-only work — DONE this window

`src/index.ts` registration of `capture_reference`, `search_references`,
`map_reference_to_tokens`, plus the count contract **105 → 108 local, 60 → 63 gated**.
All three go in `REMOTE_GATED_TOOLS` so the anon 45 hash `f64bb18…2bb0a6` does not move.

Exact sites, verified by grep this session:

- `src/index.ts:1851` "60 gated tools" · `:1857-1858` "45 stateless … from 105 local tools"
  · `:2160` "all 105 local tools" · `:2167` "45 stateless … gate off the 60 gated tools"
  · `:7776` "all 105 tools"
- `test/audit-dispatch.test.mjs:223` (test NAME embeds 105) + `:226`
- `test/decision-import.test.mjs:482`
- `test/design-review.test.mjs:863`, and `:870`/`:873` **regex-match the index.ts comment
  strings themselves** — this is the test that makes the comments a contract
- `test/grab-bridge.test.mjs:886`
- `test/taste-remote-full.test.mjs:6` (header comment), `:81` (test NAME), `:93`
- `test/redis-taste-store.test.mjs:150`

Then `node scripts/sync-manifest-tools.mjs` (reads `dist/`, so build first).

All of the above is applied. Also `README.md:25` (105 → 108 tools). The three tools sit
next to the grab tools in `src/index.ts`, and `capture_reference` deliberately does **not**
drain the bridge itself — draining is `get_grabbed_elements`' job, and doing it here would
steal selections out from under the apply loop. `map_reference_to_tokens` takes `ref_id` +
`design_file_path` so the loop is one call against the project's real DESIGN.md, with
`captured`/`tokens` kept as explicit escapes.

## Integration defects the orchestrator gate caught

Both were introduced by legs and would have shipped on a green self-report.

1. **Quirks mode on every proxied page.** A2's service-worker guard fell back to
   `serviceWorkerScript + html` when a document has no `<head>` tag — which puts a
   `<script>` ahead of `<!doctype html>` and drops the whole page into quirks mode,
   changing box-sizing across a site the designer is trying to measure. Fixed at
   `src/grab-bridge.ts:1193-1206`: fall through `<head>` → `<html>` → doctype, and only
   prepend when the document declares none of them. The e2e run asserts the real
   github.com response still starts with `<!DOCTYPE html>`.

2. **`line-height` bound to the font-size token.** Found by re-deriving a coverage number
   my own harness got wrong — `type.size.hero` and `type.leading.hero` are both exactly
   64px, and B2's tie-break is path LENGTH, so the shorter font-size path won. Exact,
   deterministic, and semantically wrong: the agent then writes
   `line-height: var(--type-size-hero)` and it looks fine. Fixed with a property-family
   affinity tie-break in `src/reference-tokens.ts` that applies only at equal delta —
   verified by disabling it in `dist/` and watching the new test fail, so it is a check
   and not a decoration.

A third finding is documented rather than fixed: `sec-fetch-mode` cannot be stripped.
Undici stamps a constant `cors` on every outgoing fetch and ignores overrides — measured,
not assumed (a fetch sending no sec-fetch headers at all still arrives as `cors`). The
browser's own value never reaches upstream, which is the property that matters, and the
test now asserts that instead of an unreachable `undefined`.

## Verified this window

- `npm run build` clean.
- `RAVEN_NO_USAGE_LOG=1 npm test` → **1182 tests / 1179 pass / 0 fail / 3 skipped**, up
  from the 1153/1150 baseline. The number moved, so the new files are being collected.
- Frozen anonymous surface: **45 tools**, hash `f64bb18…2bb0a6` — **unchanged**.
- `manifest.json` regenerated to 108; `README.md`, `site/llms.txt`, `web/public/llms.txt`
  all read 108.
- `npm pack --dry-run` ships `dist/reference-store.*` and `dist/reference-tokens.*`, with
  no `reference-prompt` or composer leftovers. 213 files, 907.1 kB.
- **Eyes-on, `test/e2e-pattern-library.mjs` against real `https://github.com`:** 549,853
  bytes of genuine GitHub HTML, CSP and X-Frame-Options headers stripped, meta-CSP removed,
  overlay injected with no inline config, doctype intact, overlay asset serving. Then
  capture → search → map end-to-end: 5 of 7 properties bound, percent width and an
  off-ramp letter-spacing returned as stated gaps rather than forced matches.

## Blockers and gates

- **Push to `main` deploys the live `mcp.ravenmcp.ai` endpoint — Andrew-only gate.** Nothing
  here goes to origin without his word.
- `npm publish` is Andrew-only (passkey 2FA, his terminal).
- Unpushed, local-only: `ff9bf9e` (window-21 log), `4e4793e` (verify-arrays cwd fix).
- Vercel MCP in Codex still returns `invalid_grant`; harmless for these legs (no Vercel work).

## Exact next commands

```
pgrep -fl "codex exec"                      # legs alive? notification ≠ completion
git status --short                          # read the DIFF, never the agent's self-report
git diff -- src/grab-bridge.ts
RAVEN_NO_USAGE_LOG=1 npm test               # baseline is 1153/1150 pass/0 fail/3 skipped
```

Baseline before this session's changes: **1153 tests, 1150 pass, 0 fail, 3 skipped, ~49s.**
Three new test files should move that number; if it does not move, the files are not being
collected and that is the finding.

---

## Sol falsification round 1 — 13 defects, all dispositioned

Report: `.claude/patternlib-2026-08-04/out/SOL-FALSIFY.md` (16 kB). Verdict: **"the claim
does not survive."** Read it before touching any of this code — it is the reasoning behind
several non-obvious choices below.

### The two P0s

**#1 — the proxied page can read the bridge capability key.** The overlay is injected as
`<script src="/raven-grab.js?key=…&cfg=…">` *inside the proxied document*, so any upstream
script can walk `document.scripts`, lift the key, and call every bridge route. Same origin
means same capability; there is no fix short of serving the overlay from a different origin
and talking to it over `postMessage`. **Not fixed architecturally — reduced and disclosed:**

- Under proxy, only `/raven-grab.js`, `/tokens`, `/grab` are served at all. The whole
  authoring surface (layer moves, template and component writes, batch commits) is off a
  third-party origin entirely.
- `/tokens` withholds the DESIGN.md **file path** while proxying; token names and values
  are still readable and that is stated, not papered over.
- `start_grab_session` returns a warning saying so in plain words.

A nonce would only have lost a race — anything placed in the document is readable by that
document's scripts. The residual gap is named rather than claimed closed.

**#2 — rewritten cookies leaked across the whole localhost cookie store.** Stripping
`Secure`/`Domain` put a third-party session credential into 127.0.0.1's jar, which is
**not port-scoped**, so every other local dev server and every later proxy session saw it.
Replaced with a **server-side cookie jar** (`proxyCookieJar`, module-level, cleared on
session start *and* stop): upstream `Set-Cookie` never reaches the browser at all.
`"set-cookie"` joined `strippedResponseHeaders`.

**A reverse leak Sol did not notice, closed in the same change:** the browser's own
127.0.0.1 cookies — set by whatever else Andrew runs locally — were being forwarded
upstream to the proxied third-party site. `"cookie"` joined `strippedRequestHeaders` and
the jar's value is set explicitly instead.

### The other eleven

| # | Defect | Disposition |
|---|---|---|
| 3 | `capture_reference` rejected Grab's real `{hover:{declarations:[…]}}` shape | union type + normalizer in the handler; the loop's two halves now actually connect |
| 4 | colour ranking ignored alpha | RGBA distance; same hex at another opacity is a near miss, not an exact hit |
| 5 | numeric proximity bound across token families | family **filter**, not a tie-break; no compatible token → a gap that *names* the cross-family near miss |
| 6 | both `.mcpb` bundles embedded 105 tools | rebuilt; both verified at 108 with all three tools |
| 7 | `/tokens` etc. reserved even when the upstream site owns them | under proxy, a request without the key is forwarded upstream instead of 403'd |
| 8 | test census stale | `CLAUDE.md` now reads 1194/1190/0/3 and distinguishes repo from published |
| 9 | http→https redirect looped for ever | same-host upgrade moves `currentSession.proxyTarget`; a downgrade does not follow |
| 10 | a corrupt index blocked every future capture | `rebuildIndexFromRecords()` self-heals and keeps the corrupt file as `index.corrupt-<ts>.json` |
| 11 | exact colours outside the legacy parser read as gaps | named colours, `hsl()`, and space-separated `rgb()` now parse; unparseable syntax says *which* syntax |
| 12 | broken `$ref` chains only surfaced when nothing else matched | `diagnostics[]` on every result |
| 13 | implemented tie-break no longer matched the stated contract | tool description rewritten to the real rule |

**Sol's own #8 was itself wrong twice:** its test run was environment-broken (`listen
EPERM`, 1098 pass / 1 fail / 83 skipped), and it misquoted the claim as 1179/1176 when the
measured figure was 1182/1179 — its own reported total of 1182 agrees. The defect was real
anyway (the ledger *was* stale); the numbers in it were not.

### Six failures after the fix batch — all stale contracts, not regressions

The suite went 1182 / 1173 pass / 6 fail. Every one was a test encoding a pre-Sol contract
(the DESIGN.md path being exposed, the cookie rewrite being asserted, proximity-only
binding). Each was rewritten to the corrected contract rather than the fix being softened.

One is worth keeping: my first redirect implementation sent an https→http downgrade
offsite, which broke an existing "scheme-only change is same-site" test. Rather than edit
that test, I re-read Sol's finding — the loop is *only* the upgrade direction — and moved
to the asymmetric rule, which is both more correct and leaves the existing test green as
written. A fix that needs an old test changed is a smell; sometimes the old test is right.

## Verified this round (2026-08-04)

- `npm run build` clean (`clean && tsc`).
- `RAVEN_NO_USAGE_LOG=1 npm test` → **1194 tests / 1190 pass / 0 fail / 3 skipped, 43.5s.**
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED against live `https://github.com`;
  5/7 properties bound, `line-height` correctly took `type.leading.hero` over the
  equally-exact `type.size.hero` (the family fix, measured on real bytes).
- Local stdio **108**, gated **63**, anon remote **45**, hash
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — **unmoved**.
- Both `.mcpb` bundles unzipped and their manifests read: 108 tools, all three present.
- `npm pack --dry-run`: 213 files, 915.5 kB, no `reference-prompt`/composer leftovers.

## Still Andrew's, not mine

1. **Reconnect local Raven** (`/mcp` reconnect or restart the session) — the running server
   still holds the pre-build `dist/`, so the three tools are not callable from this session
   until he does. This is the only thing between here and clicking it.
2. **Push to `main`** — deploys the live `mcp.ravenmcp.ai` endpoint. His gate, untouched.
3. **`npm publish`** — passkey 2FA, his terminal. Published `2.3.0` stays 105/60 until then.

---

# 2026-08-05 — keystroke leak, then Sol round 2

## Keystroke leak (Andrew's report) — closed

**Bug.** Typing into the overlay's Instructions box on proxied github.com produced
`I really like thi` — the `s` never landed — and opened GitHub's own search panel.

**Root cause.** Shadow DOM scopes styles, not events. Composed keyboard events bubble
out of the shadow root to `document`, where @github/hotkey binds bare `s` and `/` and
calls `preventDefault()`. GitHub both stole the key and blocked the character.

**Fix.** Bubble-phase `keydown`/`keypress`/`keyup` `stopPropagation()` on the overlay
`host` in `browser/raven-grab.js`, after `shadow.appendChild(edgeTabLeft)`. Safe because
Raven's own global chords are registered in **capture** on `document` (`:11232`, closing
`}, true)` at `:11289`) and have already fired by the time the bubble handler runs.
Mirrored to `web/public/raven-grab.js` — these are manual byte-identical mirrors with no
sync script; both now `18f2c820…`.

**Not covered.** A page listening in *capture* on `window`/`document` runs before the
event ever reaches the overlay. A descendant cannot stop that.

**Test.** `test/grab-overlay-key-isolation.test.mjs`, 2/2. Causality proven by pointing
`RAVEN_GRAB_ASSET_PATH` at the then-unpatched mirror: `hostKeys ["a","b","s"]` unpatched
vs `[]` patched.

**Test-authoring trap worth keeping.** The overlay renders hidden textareas before the
visible one. `root.querySelector('textarea')` grabs a hidden node, `.focus()` silently
no-ops, the keys land on `<body>`, and the test reports a false failure that looks exactly
like the fix not working. Target `.raven-grab-textarea` and assert
`root.activeElement === field`.

**Live confirmation on the real surface** (bridge → github.com, Andrew's reported flow):
`{"githubSawKeys":[], "typedIntoRaven":"I really like this", "githubSearchOpen":false,
"activeIsOverlay":true}`.

## Sol falsification round 2 — verdict "does not survive", 12 defects

Sol's round-2 pass over the round-1 fixes returned **5 fixed / 6 partial / 2 regressed**
and 12 new defects. Every one below is fixed with a regression test.

| Sol # | Fix | File |
|---|---|---|
| R1-#5 regressed | segment-aware token families — `radii.sm` and `typography.body.md` now bind; `type.letter-spacing.none` no longer binds `padding` | `src/reference-tokens.ts` |
| R1-#3 partial | `capture_reference` accepts the `stateStyles` alias — its own description already told callers to pass it | `src/index.ts` |
| R2-#1/#7 regressed | keyed Raven routes get a local 404, never forwarded upstream with the site's cookie *and* Raven's key | `src/grab-bridge.ts` |
| R2-#4 | OPTIONS scoped to bridge routes; upstream preflights forwarded | `src/grab-bridge.ts` |
| R2-#2 | cookie jar keyed by name+path, RFC 6265 §5.1.4 path matching, expiry evaluated at send | `src/grab-bridge.ts` |
| R2-#3 | the proxy warning now discloses the `/grab` queue-**write** path, not only token reads | `src/grab-bridge.ts` |
| R2-#6 | same-host scheme change rebinds the session's upstream origin in both directions; a downgrade is followed but announced via `X-Raven-Proxy-Downgraded` | `src/grab-bridge.ts` |
| R2-#7 | WebSocket upgrade reads the live `currentSession.proxyTarget` | `src/grab-bridge.ts` |
| R2-#8 | premultiplied-alpha colour distance — two fully transparent colours are the same colour | `src/reference-tokens.ts` |
| R2-#9 | CSS channel clamping (`rgb(300 0 0)` IS red) + `turn`/`rad`/`grad` hue units | `src/reference-tokens.ts` |
| R2-#10 | the e2e drives the three tools over a real MCP client instead of importing store/mapper | `test/e2e-pattern-library.mjs` |
| R2-#11 | `site/docs.html` 95 → 108, and added to `sync-manifest-tools.mjs` so it cannot drift again | `scripts/sync-manifest-tools.mjs` |
| R2-#12 | `deleteReference` self-heals a corrupt index | `src/reference-store.ts` |

### Causality, proven rather than assumed

- **Token families** — ran the OLD regexes directly in node: `radii.sm` → `false`,
  `typography.body.md` → `false`, `type.letter-spacing.none` → `true`. The old filter kept
  only `rank === 0`, so `false` = wrongly a gap, `true` = wrongly an exact binding.
- **Route scoping** — reverted just that block, rebuilt: **2 fail** (withheld route,
  preflight). Restored; `src/grab-bridge.ts` shasum matched.
- **Cookie jar** — reverted to name-keyed + send-all, rebuilt: **1 fail**. Restored;
  shasum matched.
- **The e2e itself** — removed the `stateStyles` schema param, rebuilt, ran the e2e:
  `FAIL  the grab's own stateStyles survived the tool schema`. The pre-rewrite version
  called `store.saveReference` directly and would have passed with the seam broken, which
  is the whole of Sol's #10.

### Two older tests were asserting the defects

Both round-2 fixes collided with existing tests, and in both cases the test was pinning
the wrong behaviour — not the fix breaking something real:

- `grab-bridge.test.mjs` "withholds the authoring routes" expected **502** on a keyed
  `/layers` POST, i.e. "it reached the closed upstream, so Raven didn't answer it." Right
  intent, wrong instrument — and the instrument hid the defect, because reaching upstream
  *is* the bug. Now expects **404**, with the round-2 suite asserting upstream received
  nothing at all.
- `grab-bridge-proxy-headers.test.mjs` "scheme-only redirect change as same-site" expected
  a relative `Location`, which was correct but incomplete: with the session still pinned to
  the old scheme the site returns the identical redirect for ever. The fix keeps the
  relative rewrite *and* moves the session origin; the test now asserts the follow-up fetch
  goes to the downgraded origin and that the downgrade is announced.

## Still open

- **R1-#1, the same-origin capability leak** — architectural, not closable by a patch. The
  proxied page runs same-origin with the overlay, so its scripts can read DESIGN.md token
  names and values and post their own selections into the grab queue. Reduced (file path
  and every authoring route withheld) and now honestly disclosed in the warning. Sol's
  judgment: do not ship proxy mode generally until the overlay sits behind a narrow
  cross-origin message protocol, but *"Andrew-only experimental testing with trusted sites
  is defensible."* **That is a product call for Andrew, not a defect to close.**
- **R2-#6 has no live test for the TLS case** — the fix is exercised through a stubbed
  `fetch`, not a real https upstream with a self-signed cert. Judged not worth the fixture
  cost; recorded rather than glossed.

## Verified this round (2026-08-05)

- `npm run build` clean.
- `RAVEN_NO_USAGE_LOG=1 npm test` → **1212 tests / 1209 pass / 0 fail / 3 skipped, 44.0s.**
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED against live `https://github.com`,
  now through the MCP tool surface: 108 tools listed, `stateStyles` survived the schema,
  5/7 properties bound, `line-height` took `type.leading.hero`.
- Anon remote **45**, hash `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`
  — **unmoved**.
- `.mcpb` rebuilt, both copies `bf6b9cbf…`; `raven-grab.js` mirrors both `18f2c820…`.

## Still Andrew's, not mine

1. **Reconnect local Raven** (`/mcp`) — the running server holds the pre-build `dist/`.
2. **Push to `main`** — deploys the live `mcp.ravenmcp.ai` endpoint. His gate.
3. **`npm publish`** — passkey 2FA, his terminal. Published `2.3.0` stays 105/60.
4. **Decide on proxy mode's scope** — Sol's ship recommendation above.

# 2026-08-05 — Sol round 3

Round 3 came back **DOES NOT SURVIVE** with five findings, four of them P1. Three
were real defects in code I had written that same day; one was a defect I had
introduced *while fixing* a round-2 finding, which is the more interesting one.

## The reversal: my own round-2 fix was a TLS strip

Round 2 left a redirect loop: a site that answers `https://…` with
`Location: http://same-host/…` sent the browser round the same bridge path for
ever. I broke the loop by making the proxy treat a scheme-only change as
same-site — rewrite the `Location` to a bridge-relative path, and move the
session's upstream origin to match. Symmetric, tidy, and wrong.

Sol's line: *"avoiding the old loop did not require accepting downgrades."* One
redirect response could move an entire session from TLS to plaintext, and every
subsequent request — including the replayed cookie jar — travelled in the clear
because the site said so. I had even extended the regression test to assert the
new behaviour, so the suite was green on the leak.

The fix is asymmetric, because the two directions are not the same thing:

- **http → https (upgrade)** rebinds. It strictly improves the channel, and a
  site that answers every plaintext request with "use https" needs the session
  to move or it loops.
- **https → http (downgrade)** goes offsite: absolute `Location`,
  `X-Raven-Proxy-Offsite`, no rebind, and the bridge never fetches the plaintext
  destination itself. The browser makes that call, not the proxy.

## The cookie jar, again

Round 2 fixed name+path collapsing and write-time expiry. Round 3 found the jar
still ignored everything else a browser enforces:

- **default path** was hard-coded to `/` rather than derived from the response
  URL (RFC 6265 §5.1.4), so a cookie set at `/account/login` with no `Path`
  replayed on every request the session made — the site-wide leak the round-2
  path fix had just closed for cookies that bothered to say `Path`.
- **`Domain`** was parsed and dropped, so any response could claim a cookie for
  a host it has no authority over.
- **`Secure`** was not retained at all, so a Secure cookie was replayed over an
  http upstream.
- **`__Secure-` / `__Host-` prefixes** are browser-enforced promises; storing
  them without enforcing turns the prefix into a lie, so they now force `secure`.

The regression test Sol named by file and line is the one that made this
concrete: it stored `sid=abc; Secure; Domain=example.com` against a plaintext
`127.0.0.1` fixture and asserted it came back. It now asserts the opposite, and
names both reasons the cookie is dropped.

## `wait_url` advertised a route proxy mode withholds

`/agent/wait` is one of the routes proxy mode refuses, but `startGrabSession`
still returned a keyed `wait_url` and the `watch_command` built from it. That
command is the shape an agent is most likely to run unattended — it loops on
curl and only exits on a selection, so a 404 reads as "the designer hasn't
grabbed anything yet" rather than as a refusal. Both are now empty while
proxying, and the proxy-mode warning was rewritten to say plainly that the
authoring surface is withheld and why.

## The token mapper cross-bound a real family

`FAMILIES` knew singular `letterspacing` but not the actual Chakra segment
`letterSpacings`, so a path naming no *recognised* family fell to the loose tier
and stayed eligible. Runtime counterexample from Sol: `padding-top: 0px` bound to
`letterSpacings.wide: 0.025em` as a "near spacing token at 0.4px".

Two changes: segments are normalised for camel-case and plurals before
classification, and a loose-tier candidate that matches two or more families is
demoted to a gap — `spacing` alone reads as both tracking and gap, and a guess
that fits two families is not a guess worth acting on.

Verified by probe rather than by reading the diff:

| captured | token | before | after |
| --- | --- | --- | --- |
| `padding-top: 0px` | `letterSpacings.wide` | bound (wrong) | **gap** |
| `letter-spacing: 0.025em` | `letterSpacings.wide` | bound | bound |
| `font-size: 16px` | `fontSizes.md` | gap | **bound** |
| `line-height: 64px` | `lineHeights.hero` | gap | **bound** |
| `border-radius: 4px` | `radii.sm` | gap | **bound** |
| `border-radius: 4px` | `brand.cornerRadius` (loose) | bound | bound |
| `height: 2px` | `highlight.height` | gap | gap |

## The e2e was still only half a seam test

Round 2 moved leg B onto a real MCP client, which is what caught the
`stateStyles` schema mismatch. Sol pointed out the other half: the script still
hand-wrote the selection object, so `/grab` and `get_grabbed_elements` could both
be broken and the run would print ALL CHECKS PASSED.

It now posts the overlay's own payload to the proxied `/grab`, drains it with
`get_grabbed_elements`, and feeds *that* returned element into
`capture_reference` — selector, styles, html, rect and state map all come from
the drain. Causality proven by deleting `currentSession.queue.push(item)` from
`dist/` and re-running: two FAILs and an early exit, where the old script would
have been green.

## State

- `RAVEN_NO_USAGE_LOG=1 npm test` → **1218 / 1215 pass / 0 fail / 3 skipped**, ~46s
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED against live github.com
- stdio 108 tools; anon remote 45, hash `f64bb18…2bb0a6` unmoved
- `site/raven.mcpb` and `web/public/raven.mcpb` rebuilt, byte-identical to each other
- `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical, unchanged this round

Andrew's gates are untouched: nothing pushed, nothing published, no deploy.
