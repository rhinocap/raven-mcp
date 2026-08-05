# 2026-08-05 — pattern library, round 6 (key-isolation boundary + Sol round-5 dispositions)

Per-instance log. Continues `2026-08-05-pattern-library-round5.md`.

## Where this left off

Rounds 5 through 9 are all dispositioned and every surface is re-verified.
Nothing is pushed. Local `main` is 9 commits ahead of `origin/main` (`985e5ce`);
the round-9 batch (§3e) is the uncommitted tree in §4. Sol round 9 has not run
yet — it is the next action, and no completion claim may reach Andrew before it
is dispositioned.

## 1. Andrew's reported bug — root-caused, reproduced, and now falsifiable

> "when I try to type an instruction in Github's search box starts opening and
> typing in there"

**Correction to the round-5 record:** a fix for this already existed and was
already committed in `7a30303` (`browser/raven-grab.js` ~1190) before the context
break. What this window added is a second, narrower guard for a residual the
first one's own comment named as uncovered — not the fix for the reported bug.

**Reproduction (live github.com through the bridge, both guards removed):**

```
AFTER {"dialogs":1,"active":"INPUT","activeIsRaven":false,
       "fieldValue":"I really like thi","searchDialogOpen":false}
```

The trailing `s` is swallowed and GitHub's dialog opens — the report and the
screenshot exactly. With both guards present: `fieldValue: "I really like this"`,
`dialogs: 0`, focus retained.

Eyes-on evidence, both logged-out github.com through the bridge:
`.claude/patternlib-2026-08-04/out/github-bug-reproduced-both-guards-removed.png`
shows "I really like thi" sitting in the instructions box with GitHub's search
panel open over the page — the defect, on the real site.
`…/github-overlay-on-github-before-typing.png` is the same surface before any
keystroke, for comparison.

**Why two guards, and why neither subsumes the other.**

- **Guard A — host, bubble phase** (`browser/raven-grab.js` ~1190, pre-existing).
  Broad: stops every key event. This is what fixed the reported bug.
- **Guard B — `window`, capture phase** (`browser/raven-grab.js` ~322, new).
  Narrow: unmodified single printable characters originating in a Raven field.
  `stopImmediatePropagation`, never `preventDefault` — the character still has to
  be typed.

Capture descends window → document → … → host, so a guard on the host can never
stop a document-capture listener. Measured with a four-phase spy on a proxied
page: with only Guard A installed, `docBubble`/`winBubble` were empty and
`docCapture`/`winCapture` still received every character, retargeted to the host
`<div>`. Registering on `window` in capture is the only position upstream of a
listener on `document`, and it wins by *position* rather than registration order,
which the overlay cannot control.

**Known residual, by choice:** window-capture stays open. Same-node ordering IS
registration order, and the bridge injects the overlay before `</body>`, so every
page script has already registered. Closing it means moving injection into
`<head>`, which reorders the whole overlay against the page it decorates. Not
worth it for a case no reported bug has hit — bare-letter hotkeys live on
`document` in practice (@github/hotkey, Mousetrap, hotkeys-js all bind there).

**Both guards are independently falsifiable** by the rewritten
`test/grab-overlay-key-isolation.test.mjs`: delete Guard B → test 1 red; delete
Guard A → test 3 red; both present → 3/3 green. The previous version of that file
listened in bubble phase only and passed with Guard B deleted, and used skip
sentinels that turned a broken build into a green run. Both anti-patterns removed.

## 2. Sol round-5 findings — verdict DOES NOT SURVIVE, all three dispositioned

**#1 (P1) drain protocol contradiction — CONFIRMED, FIXED.** `start_grab_session`
tells a proxied agent no `batchCommit` is coming; the drain contradicted it one
call later with "wait for the batchCommit marker from Apply", and proxy mode
withholds the route that would ever produce one. An agent that believes the drain
waits forever and the capture is never kept — the feature failing at its last
step. Added `isProxyGrabSession()` to `src/grab-bridge.ts`, a proxy branch in
`get_grabbed_elements` (`src/index.ts` ~3159), and an e2e assertion at the spot
Sol named.

**#2 (P1) WebSocket origin/cookie bypass — CONFIRMED, FIXED.** Upgrades attached
the session cookie jar unconditionally on the grounds the socket was same-site
"by construction". A WebSocket open is not subject to CORS, so any page can dial
`ws://127.0.0.1:<port>` and have the bridge forward `SameSite=Strict` cookies
upstream on its behalf. The random port is a speed bump, not a boundary. Added an
`Origin` check in `proxyGrabUpgrade` (`src/grab-bridge.ts` ~1122) before the jar
is attached. Causality proven by neutering the check in `dist/` as
`if (false && …)` — the round-6 test goes red on exactly one assertion.

**#3 (P2) release path leaves apex `.mcpb` stale — PARTIALLY STALE, out of
scope.** `release.sh:109` already stages both copies and prints the manual-deploy
notice, so Sol's premise was half wrong. The real residual is that
`.github/workflows/release.yml` prints nothing, so an unattended workflow release
silently leaves `https://ravenmcp.ai/raven.mcpb` on the previous bundle. Not
fixed — release/deploy is Andrew's gate. `CLAUDE.md`'s landmine was corrected to
say what is actually true.

## 3. Verification (all re-run this window)

| Check | Result | Evidence |
|---|---|---|
| `RAVEN_NO_USAGE_LOG=1 npm test` | **1231 / 1228 pass / 0 fail / 3 skipped** (43.6s) | `.claude/patternlib-2026-08-04/out/FULL-SUITE-ROUND6b.log` |
| `node test/e2e-pattern-library.mjs` | **ALL CHECKS PASSED (33)** | `.../out/E2E-ROUND6.log` |
| `SKIP_BUILD=1 bash scripts/build-mcpb.sh` | both copies `10c7309f7b9a3c593cd4405b69a4eeffa3f99bfad87d4a3d503fedcddd251518` | — |
| stdio tool count | **108** (unchanged — an exported function is not a tool) | — |
| live anon endpoint | **45 tools**, `f64bb18…2bb0a6` — matches frozen golden | — |
| `browser/` vs `web/public/` overlay | byte-identical | — |

An earlier full run this window, before the Sol fixes, was 1228/1225/0/3.

## 3b. Round 7 — dispositioning the round-6 adverse pass

Sol round 6 returned **DOES NOT SURVIVE** on four of five claims. Six findings;
four accepted and fixed, two declined.

**F1 (was P1) — plain-HTTP cookie fail-open. FIXED.** The same bug class as the
WebSocket one, on the HTTP path and reachable by a wider set of clients:
`crossSite` was false whenever `sec-fetch-site` was absent, so a foreign page in
Safari <16.4 or a WebView could POST to the guessed loopback port and be handed
the proxied site's Strict jar with a same-origin `Origin` stamped on top. Order
is now Fetch Metadata → `Origin` host → `Referer` host → cross-site.

**F2 (P2) — drain classified by a global read after an await. FIXED.**
`getGrabbedElements` pins the session and returns `proxyMode` on the result.
`src/index.ts` reads that instead of calling `isProxyGrabSession()`.

**F3 (P2) — the server-level GRAB instruction still said "wait for batchCommit"
with no proxy exception. FIXED.** A server-level instruction outranks per-call
prose in practice, so the round-6 fix could lose the argument to it. The
exception now sits at the same level as the rule — **stdio only**, because the
remote surfaces register no grab tools and their instructions are hash-frozen
(putting it in the shared string broke `ANONYMOUS_INSTRUCTIONS_HASH`, which is
how the scoping error was caught).

**F4 (P2) — the capture guard missed IME and dead keys. FIXED.** `key.length
=== 1` excludes `Dead`/`Process`/`Unidentified`, and Android reports keyCode 229
for nearly everything, so every non-Latin and accented keystroke fell through to
the page's document-capture handler. Now also matches `isComposing`, keyCode 229
and those three key names.

**D1/D2 — declined.** The 45-tool hash test running against a local
`buildServer({remote:true})` rather than the deployed endpoint, and the e2e using
`InMemoryTransport`, are both pre-existing characterizations already ledgered in
`CLAUDE.md`, not regressions from this change set. The live endpoint was checked
by hand this session. Re-attacked in the round-7 brief as declines.

**Every fix was proven falsifiable before being believed** — reverted in `dist/`
and the intended test watched go red: F1 → the metadata-less cookie test; F2 →
the parked-drain test; F3 → the instruction test; F4 → the IME test (via
`RAVEN_GRAB_ASSET_PATH` pointed at a neutered overlay copy).

**Two corrections worth carrying forward.** My first race test passed with the
fix reverted — `getGrabbedElements` returns without yielding on the immediate
path, so the interleaving I wrote could never happen. Rewritten to park the drain
on a timeout, which is the only shape of the bug the public API exposes. And my
first F3 neutering silently failed to match (`grep -c` returned 0) while the
tests went green — a "reverted" run that never reverted anything proves nothing.
Check the substitution landed before reading the result.

**Round-4's SameSite test had encoded the defect.** Its first case sent a bare
request with no headers and called it "a same-site request gets the whole jar".
A bare request is exactly what cannot prove same-site. Rewritten so that case
declares `sec-fetch-site: same-origin`, with the metadata-less case added
beneath it — the original trigger still fires, plus the one it missed.

Verification after round 7: **1237 tests / 1234 pass / 0 fail / 3 skipped**
(`.claude/patternlib-2026-08-04/out/FULL-SUITE-ROUND7b.log`), e2e **ALL CHECKS
PASSED / 0 FAIL**, stdio **108**, `buildServer({remote:true})` **45 tools /
`f64bb18…2bb0a6`** unchanged, overlay mirror byte-identical.

Sol round 7 (`briefs/SOL-ROUND7.md`) is running against these fixes and against
both declines.

Committed as **`5ae6909`** — "Fail closed on absent Fetch Metadata, pin the
drain's mode, cover IME keys", 16 explicit paths, deliberately excluding
`SOL-ROUND7.log` because Sol was still writing to it at commit time.

## 3c. Round 8 — dispositioning the round-7 adverse pass

Sol round 7 returned **DOES NOT SURVIVE**: three cookie defects under F1 and one
overlay defect under F4. All four confirmed by reading the source, all four
fixed. F2, F3, D1 and D2 survive untouched — Sol independently re-confirmed that
`main()` connects `buildServer({remote:false})` to stdio at `src/index.ts:7944`,
that `proxyMode` is correct on every path out of `getGrabbedElements`, and that
`test/sync-codex-approvals.test.mjs:32` already drives the real stdio entry with
newline framing, which retires D2's premise entirely.

**G1 — DNS rebinding (P2).** There was no `Host` validation anywhere on the HTTP
path; only the WebSocket upgrade checked `expectedOrigins`. An attacker serving
`rebind.example` and re-pointing its DNS at 127.0.0.1 gets a page the browser
genuinely believes is same-origin: `Origin` equals `Host`, `Sec-Fetch-Site`
truthfully says `same-origin`, and every same-site check in the bridge answers
yes. Binding the listener to loopback does not help — the connection really does
arrive there. The `Host` header is the one thing rebinding cannot forge, so
`isLoopbackHost()` now gates the whole HTTP surface (authoring routes included)
with a **421**, which is the honest code: this server is not authoritative for
that name.

**G2 — Lax on a metadata-less GET (P1).** `topLevelGet` allowed any GET with no
Fetch Metadata, on the theory that it was a user typing the bridge URL into an
old browser. A foreign page's `<img referrerpolicy="no-referrer"
src="http://127.0.0.1:PORT/x">` sends a byte-identical request — no metadata, no
Origin, no Referer — and was handed the entire Lax jar. Now Lax rides only on a
request that *says* `sec-fetch-mode: navigate`. Cost: the first metadata-less
load in Safari <16.4 gets no site cookies, at a point where the jar is empty
anyway; every navigation after it carries a Referer and is recognised same-site.

**G3 — `SameSite=None` without `Secure` (P2).** Every current browser rejects
that combination outright, so a site sending it has no such cookie. Keeping it
manufactured a credential the browser refused — and it is the one setting that
opts a cookie *into* travelling cross-site. Dropped at parse time, matching the
browser.

**G4 — `keyCode === 229` read as composition (P2).** Android reports 229 for
nearly every key, not only composed ones, so the clause swallowed `Enter`,
`Escape` and `Tab` on that entire platform — `Enter` is how the instruction gets
sent, so the panel would simply stop working there. The guard's own comment
promised to leave exactly those keys travelling. Composition is now matched on
the key NAME (`Dead`/`Process`/`Unidentified`) plus `isComposing`; Android's
legacy spelling is `Unidentified` and its modern one sets `isComposing`, so the
keyCode added nothing those two did not already cover.

**A harness defect found on the way, worth more than the fix.** The new round-8
"declared navigation still gets Lax" test failed, and the failure read as a
product bug. It was not: **Node's `fetch` rewrites `sec-fetch-mode` with its own
computed value** — a request sent as `navigate` arrives as `cors` — and it
*forbids* overriding `Host` outright. So anything asserting on Fetch Metadata has
to go over `node:http`, and anything forging a Host has to be written as raw
socket bytes. Both helpers now live at the top of
`test/grab-bridge-proxy-round8.test.mjs` with the measurement recorded in a
comment. This is the harness-expected-values rule firing: I had nearly blamed the
product for the instrument's behaviour.

**Five older suites had to declare `sec-fetch-site: same-origin`.** Making a bare
request correctly cross-site broke four tests across three files, all of the same
shape: they used a bare request as a *neutral carrier* for assertions about
Secure / Domain / prefix / path, and a bare request is no longer neutral. Each
was fixed by declaring same-origin — never by loosening the product rule — with a
comment at every site saying why. Touched:
`test/grab-bridge-proxy-round2.test.mjs` (a `SAME_ORIGIN` const, 6 sites),
`…-round4.test.mjs` (3 sites, plus its own SameSite expectations), and
`test/grab-bridge-proxy-headers.test.mjs` (1 site). **Whether that narrowed what
those tests used to catch is the single most important question in the round-8
brief.**

Falsifiability, proven by reverting each fix and watching exactly one test go
red: G1 → the rebind test; G2 → the metadata-less-Lax test; G3 → the
`SameSite=None` test; G4 → the Android-Enter test (via `RAVEN_GRAB_ASSET_PATH`
pointed at a scratch copy with the 229 clause restored). Note that the
pre-existing chords test stayed **green** with the G4 defect present — Playwright
reports the true keyCode, so the whole Android class is invisible to
browser-driven tests, which is precisely the coverage gap Sol named.

A fifth proof was run to *measure* a claim I had already written into
`CLAUDE.md` rather than assert it: neutering the host bubble guard turned **test
4** red and nothing else, confirming the ledger's remapped test number. Nothing
was left neutered — `dist/grab-bridge.js` was restored and `cmp`-verified, and
the neutered overlay copies only ever existed in the scratchpad.

Verification after round 8: **1242 tests / 1239 pass / 0 fail / 3 skipped**
(`.claude/patternlib-2026-08-04/out/FULL-SUITE-ROUND8c.log`), e2e **ALL CHECKS
PASSED / 33 checks** (`out/E2E-ROUND8.log`), stdio **108**,
`buildServer({remote:true})` **45 tools / `f64bb18…2bb0a6`** unchanged, overlay
mirror byte-identical.

Sol round 8 (`briefs/SOL-ROUND8.md`, **xhigh** — this is a security boundary) is
running against all four fixes and, most importantly, against the test churn.

## 3d. A private-content leak into this public repo, caught before any push

Reading `.gitignore` for an unrelated reason surfaced a rule I had been
violating for five commits:

```
# Raw adverse-pass transcripts (public repo). Codex echoes the loaded skill files
# verbatim — personal quotes, home-directory paths, private rule text — so the log
# itself never ships.
.claude/pregate-*/sol/
```

That rule names **one directory**. This round's evidence lives in
`.claude/patternlib-2026-08-04/out/`, so it never applied, and six Sol
transcripts had been committed through it — `SOL-codex`, `ROUND3`, `ROUND4`,
`ROUND5`, `ROUND6`, `ROUND7`. Between them: ~450 `/Users/accunliffe/...` paths,
a 1642-line private skill file echoed verbatim by a `sed` range, and
cross-project rollout summaries read out of `~/.codex/memories/MEMORY.md`
(other project names, session IDs, past conclusions). **This repository is
public.**

Nothing had been pushed — `origin/main` was still at `985e5ce` — so this was
strippable rather than publishable-and-retractable:

1. Widened the ignore to match the **filename anywhere in the tree**
   (`SOL-*.log`, `sol-*.log`, `**/out/SOL*.log`), committed as `6f84716` with
   the reasoning in the message. A location-scoped rule for sensitive content
   fails silently the moment a directory gets a different name; a filename-scoped
   one cannot.
2. `git filter-branch --index-filter 'git rm --cached --ignore-unmatch …' --
   origin/main..HEAD` over all eight unpushed commits.
3. **filter-branch checks out the rewritten tree when it finishes, which deleted
   the six now-untracked logs from disk.** Noticed because a verification count
   came back `1` where it should have been `7` — restored all six from
   `refs/original/refs/heads/main`, byte sizes 590KB–2.1MB.
4. Confirmed the rewrite touched nothing else:
   `git diff --name-status refs/original/refs/heads/main HEAD` lists exactly six
   `D` lines and nothing more.

Worth naming: the credential-shaped scan I ran *before* committing
(`sk-|token|secret|api_key|password|Bearer`) came back clean, because this leak
class is private **prose and paths**, not credentials. The grep that would have
caught it is `/Users/<name>`, `.agents/skills`, `.codex/memories`. Filed as a
cross-project memory (`feedback-scope-sensitive-ignores-by-filename`).

The transcripts remain on disk locally. Their dispositioned findings are in
§2/§3b/§3c above, which is what the original rule already prescribed.

## 3e. Round 9 — dispositioning the round-8 adverse pass

Sol round 8 (xhigh) returned **DOES NOT SURVIVE — G1 and G3 hold; G2 and G4 fail,
and the tests encode rather than detect both key boundary mistakes.** Its positive
finding mattered as much as its objections: the five carrier rewrites did **not**
narrow detection — every site round 2 and round 4 used to catch still fires.

**G2 P1 — `navigate` was never the same as top-level (real, fixed).**
`src/grab-bridge.ts` released the Lax jar on any cross-site GET declaring
`Sec-Fetch-Mode: navigate`. A foreign page that plants
`<iframe src="http://127.0.0.1:PORT/action">` sends exactly that. The only header
that differs is `Sec-Fetch-Dest` — `iframe` rather than `document` — and it was
not being read, so upstream saw an authenticated request from a frame the
attacker chose. `topLevelGet` now requires `dest === "document"`, an allowlist of
one rather than a denylist, so `frame`/`embed`/`object` and any future
destination lose Lax by default.

**G2 P2 — the comment overclaimed (real, fixed).** It said a metadata-less
browser only loses Lax on the *first* load because every later navigation carries
a `Referer`. False: an address-bar or bookmark navigation carries neither
`Origin` nor `Referer`, so a logged-in user on such a browser can be bounced to a
login screen mid-session. The cost is real and is now written down honestly
rather than minimised; it is still accepted, because a metadata-less GET is
byte-identical to a foreign subresource and the only alternative is trusting a
header a foreign page can set.

**G4 P2 — WebKit bug 165004 (real, fixed).** Dropping `keyCode === 229` was
right for Android and left one case genuinely uncovered: macOS Safari with the
Japanese Hiragana IME fires `compositionend` FIRST, then a keydown with
`key: "Enter"` and `isComposing: false`. That Enter accepted a candidate; the
user never asked to send. The fix tracks composition **lifecycle** and marks the
next keydown.

Two design calls inside that fix, both load-bearing:

- **Placement.** It sits in the send handler, not the window-capture guard. The
  named harm is "clicks Send while the user is only accepting a candidate", and
  Enter must keep reaching the page by design (test 4 asserts Escape/Tab/chords
  travel). Swallowing at capture would be broader than the defect.
- **Ordering, not a clock.** The first version keyed on a 100ms window alone.
  That is wrong: compose, type three more characters, press Enter, and a fast
  typist is still inside any window wide enough to cover a slow one — the send
  gets eaten. The marker is now consumed by the very next keydown whatever it is;
  the 100ms bound survives only so a stale marker cannot outlive the user
  composing, clicking away, and coming back. The falsifiability run proves the
  distinction: reverting the consume-on-next-keydown line fails on **`a
  deliberate Enter stopped sending`**, not on the IME assertion.

**Test churn P1 — the suites encoded the iframe bug (real, fixed).** Both
navigation assertions omitted the destination, so the attack passed them
unchanged. `round8` gained a paired `document`/`iframe` case plus a
`frame`/`embed`/`object` sweep; `round4:209` now declares `dest: document` and
has an `iframe` sibling asserting only the opted-in cookie rides.

**Test churn P3 — "no Fetch Metadata" was sending some (real, fixed).** Measured
on Node 26.5.0 rather than taken on Sol's word, and it is worse than reported:
Node's `fetch` stamps `sec-fetch-mode` on every request AND **overwrites the
value you give it** — a request sent with `navigate` arrives as `cors`. So round
7's priming navigation was not a navigation on the wire either. Those tests now
go out over `node:http`, verified to put exactly the headers given on the socket
and nothing else.

**G1 and G3 confirmed, no action.** Sol found the Host allowlist correct against
case, trailing-dot, IPv6, duplicate and absolute-form variants, and the
`SameSite=None`/`Secure` drop correct per RFC6265bis.

### Falsifiability, one revert at a time

| Reverted | Goes red |
|---|---|
| `dest === "document"` neutralised in `dist/` | 3 tests across rounds 4 and 8 |
| send-handler guard deleted (`RAVEN_GRAB_ASSET_PATH` copy) | the IME commit assertion |
| marker held on a clock instead of the next keydown | the deliberate-Enter assertion |

### Three defects in my own harness, none in the product

The live send verification reported `FAIL the panel never confirmed the capture`
while the drain simultaneously showed the capture arriving — a contradiction that
had to be one or the other. It was the harness, three times over:

1. It read `root.textContent`, which includes the shadow `<style>` block, so the
   check was matching against 900 characters of CSS custom properties.
2. Fixing that, it clicked buttons by matching the *text* `send`/`apply`, which
   hit the feedback dialog's "Send Raven" and left the settings modal open over
   everything the assertions then read. Now it clicks `[data-send-batch]` by
   attribute.
3. Fixing that, it still failed — because the confirmation is a **hold, not a
   final state**. A focused probe caught `"1 pattern captured ✓"` at t=300/800/
   1500ms and `"Send to agent"` from t=2500ms; the harness sampled at 2700ms,
   after the reset. It now samples during the hold and separately asserts the
   reset.

The original version printed `NOTE` whichever way it went, which is a report and
not a check — the exact shape the standing rule names. It asserts now, and prints
what it read in both directions.

**Live surface, re-verified against fresh `dist` on real github.com:** field holds
`"I really like this"`, GitHub sees zero keys in either phase, no search dialog,
zero console errors, zero 4xx/5xx, drain returns `proxyMode: true`, no
`batchCommit`, selector `#hero-section-brand-heading`, instruction intact, 39
style properties captured. Screenshot inspected with eyes.

**Frozen surfaces re-checked:** stdio 108 tools (unchanged — no tool added this
round), anon remote 45 tools, hash `f64bb18…2bb0a6` matches, overlay mirror
byte-identical. Full suite **1245 / 1242 pass / 0 fail / 3 skipped**; the live
e2e passes all 33 checks.

## 4. Uncommitted set

Everything through round 8 is committed (local `main` is 9 commits ahead of
`origin/main` at `985e5ce`; the round-7/8 hashes are post-filter-branch:
`cbba999`, `e675dee`, `ce7a230`, `a6114c4`). What remains uncommitted is the
round-9 batch:

Modified: `CLAUDE.md`, `src/grab-bridge.ts`, `browser/raven-grab.js`,
`web/public/raven-grab.js`, `test/grab-bridge-proxy-round4.test.mjs`,
`test/grab-bridge-proxy-round7.test.mjs`,
`test/grab-bridge-proxy-round8.test.mjs`,
`test/grab-overlay-key-isolation.test.mjs`, and this file.

Untracked evidence: `.claude/patternlib-2026-08-04/out/{FULL-SUITE-ROUND9.log,
E2E-ROUND9.log, probe-send-label.png, github-typing-fixed-live.png,
github-send-capture-only.png}`.

Gitignored, in-project, **not** part of the commit: `.mcpb-stage/verify-github-
typing.mjs`, `.mcpb-stage/verify-github-send.mjs`, `.mcpb-stage/probe-send-
label.mjs`. Six restored Sol transcripts sit on disk, gitignored by filename.

Scratchpad only, ephemeral: `/tmp/raven-r9-falsify/{no-guard.js, clock-only.js}`
(the two neutered overlay copies used for the falsifiability proofs) and
`/tmp/gb-round9-backup.js`.

## 5. Exact next commands

```sh
git fetch origin && git status --porcelain
git commit --only <explicit paths> --file=<message file>   # never a bare git add + commit
codex exec -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
  "$(cat .claude/patternlib-2026-08-04/briefs/SOL-ROUND9.md)" \
  > .claude/patternlib-2026-08-04/out/SOL-ROUND9.log 2>&1 < /dev/null &
# Re-verify after any round-10 fix:
RAVEN_NO_USAGE_LOG=1 npm test
node test/e2e-pattern-library.mjs        # not in npm test — real Chromium, proxies live github.com
```

Round-9 brief must attack: whether `Sec-Fetch-Dest: document` is the *complete*
top-level signal (what about `fencedframe`, or a browser that sends `mode` but
not `dest`?); whether consuming the composition marker on every keydown opens a
new hole; whether the 100ms residual bound can still swallow a real send;
whether the new dest tests genuinely fail with the clause removed (they do —
three of them); and whether round 9 narrowed anything rounds 4/7/8 used to catch.

Note for whoever picks this up: the running MCP server process holds a **pre-fix
`dist/`**. Overlay fixes land on a plain reload (the bridge reads the asset from
disk per request), but bridge-server fixes need a `/mcp` reconnect.

## 6. Blockers — Andrew only

1. `git push` to `main` (6 commits ahead). **This deploys the live MCP endpoint**
   since the 2026-07-27 unpin — human-gated.
2. `npm publish` (passkey 2FA, his terminal).
3. `cd web && vercel deploy --prod` — the only thing that moves the apex marketing
   site and the public `.mcpb` download.
4. No hold-open bridge is currently running; he has nothing to click yet. A fresh
   `start_grab_session` with `proxy_target` is needed before handoff.
