# 2026-08-05 — pattern library, round 6 (key-isolation boundary + Sol round-5 dispositions)

Per-instance log. Continues `2026-08-05-pattern-library-round5.md`.

## Where this left off

Rounds 5 through 10 are all dispositioned and every surface is re-verified.
Sol round 9 returned **DOES NOT SURVIVE** — C1 survived, C2/C3/C4 failed, plus an
independent P1 on the privacy leak — and all four are now dispositioned in §3g.
The round-10 work is **uncommitted** in the working tree; local `main` is 10
commits ahead of `origin/main` (`985e5ce`) and nothing is pushed.

The most important of those: the round-9 WebKit IME fix was **eating a deliberate
Enter on every non-WebKit browser**, which is a worse bug than the one it fixed.
Narrowed and now covered in both orderings (§3g).

A private-content leak reopened for the **third** time, and the glob has been
retired in favour of an engine gate — `test/no-private-paths.test.mjs`, which
fails the suite on any tracked file containing an absolute private-tooling path
(§3g). One file, `SOL-VERDICT-RAW.txt`, is already **published** in `2487fb5`;
removing it from history is a force-push to a public repo and is Andrew's call,
not mine. It sits in a capped quarantine list until he decides.

**Sol round 10 has not been run yet** against the round-10 fixes. No completion
claim may reach Andrew before it is run and dispositioned.

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

## 3f. The same leak reopened one round later, because §3d's fix was an enumeration

The pre-commit evidence scan for round 9 found four MORE agent transcripts
already committed in the unpushed range:

| file | `/Users/accunliffe/…` paths | `.claude/skills` refs | `.codex/memories` refs |
|---|---|---|---|
| `A-codex.log` | 24 | 3 | 3 |
| `A2-codex.log` | 38 | 3 | 1 |
| `B1-codex.log` | 50 | 2 | 1 |
| `B2-codex.log` | 23 | 3 | 1 |

These are from the **same fan-out** as the Sol logs §3d stripped, sitting in the
**same directory**, committed in the **same range**. The §3d fix did not touch
them.

The reason is worth stating plainly, because I wrote the wrong fix while
explicitly congratulating myself on writing the right one. §3d correctly
identified that a *location*-scoped rule (`.claude/pregate-*/sol/`) fails when the
directory gets a different name, and replaced it with a *filename*-scoped rule
(`SOL-*.log`). But `SOL-*` is an **enumeration of one agent**. The class is "raw
agent or tool transcript", and Codex writes `*-codex.log`. Trading one narrow
predicate for a differently-narrow predicate is not generalisation — and it is
exactly the trigger-set-narrowing failure mode already recorded in
`~/.claude/CLAUDE.md` under *"when rewriting a rule, diff the TRIGGER SET, not the
prose."* I had that rule loaded and still shipped the narrowing.

The rule is now the class:

```
.claude/pregate-*/sol/
.claude/**/*.log
SOL-*.log
sol-*.log
```

No `.log` under `.claude/` ships, whoever wrote it. That also sweeps in the
test-suite captures (`FULL-SUITE-*`, `E2E-*`, `HOLD-BRIDGE`), which are clean but
are 113KB of regenerable noise whose numbers belong in this file anyway. What
SHOULD ship as evidence is prose and screenshots — both of which a human reads
before committing, which is the actual safety property.

Verified with `git check-ignore -v --no-index`, matching `.gitignore:77` on both
an already-tracked `A2-codex.log` and a new `E2E-ROUND6.log` — not by grepping
for the filename in `.gitignore`, which is how a rule gets confirmed present and
non-functional.

Stripped the same way as §3d, over all 10 unpushed commits:
`git filter-branch --index-filter 'git rm --cached --ignore-unmatch
".claude/patternlib-2026-08-04/out/*.log"' -- origin/main..HEAD`, 13 files
removed. Two details that bit or nearly bit:

1. **`refs/original/` from §3d's run still existed**, and filter-branch refuses to
   overwrite it. The reflex is `-f`; the right move is to look at what it holds
   first — it was the round-8 pre-strip lineage, divergent from HEAD and still
   carrying 19 transcripts. Preserved it as `refs/pre-strip/round8-main` rather
   than discarding it, then cleared `refs/original`.
2. **The final checkout deletes the now-untracked files from disk again** — the
   same thing §3d recorded. Copied all 24 to the scratchpad *before* running the
   rewrite this time, and restored with `cp -n` after. 24 on disk, tree clean.

Rewrite proven surgical: `git diff --name-status refs/original/refs/heads/main
HEAD` is exactly 13 `D` lines, zero non-`.log` entries, zero non-`D` statuses, and
`git rev-list --count origin/main..HEAD` still reads 10.

Still true, and still the thing that would have caught this on day one: a
credential-shaped grep never fires on this class. The scan that works is
`/Users/<name>`, `.agents/skills`, `.codex/memories` — and it has to run against
`git ls-tree -r HEAD`, not against `git status`, because the leak was already
committed both times.

## 3g. Round 10 — dispositioning Sol round 9, and the third leak

Sol round 9 ran at **xhigh**, report-only, detached to a file. Verbatim verdict:

> `OVERALL: DOES NOT SURVIVE — C1 survives; C2/C3/C4 fail; the public-repo privacy violation is independently P1.`

| Claim | Sol | Disposition |
|---|---|---|
| C1 — `dest === "document"` allowlist is the right check | SURVIVES | no change |
| C2 — the metadata-less cost comment is accurate | FAILS | comment rewritten |
| C3 — IME commit is separated from a deliberate send | FAILS (P2) | guard narrowed + new test |
| C4 — the tests encode the boundary rather than detect it | FAILS (P2) | three test defects fixed |
| Frozen surface — private material in a published commit | FAILS (P1) | §3f + engine gate; published half is Andrew's call |

### C3 — the WebKit fix was eating everyone else's send

The round-9 guard armed its commit marker on **every** `compositionend`. That is
correct only for WebKit's inverted ordering. Every other browser dispatches the
committing Enter FIRST, with `isComposing` true, and fires `compositionend`
after it — so the marker armed *after* the commit was already handled, pointing
at whatever the user typed next. A deliberate Enter within 100ms was swallowed
with no feedback.

That is a strictly worse trade than the bug being fixed: WebKit's defect costs a
stray send to CJK users on one browser; this cost a **swallowed send to everyone
on every other browser**. Arming is now conditioned on `compositionend` not
having been preceded by a commit Enter, which is exactly what separates the two
orderings. `ravenCommitEnterAlreadySeen` is assigned (never OR-ed) on each
keydown, so a character key clears a commit Enter that never produced a
`compositionend` — some IMEs accept a candidate mid-composition without ending
it, and a stale `true` would disarm the next real WebKit commit.

One residual is written into the comment rather than hidden: accepting a
candidate with the **mouse** also ends composition with no commit Enter, so it
arms. An Enter within 100ms of that click is swallowed. It is indistinguishable
from WebKit's ordering by construction — identical event streams — and costs one
retry.

The 100ms bound was deliberately **not** tightened. WebKit is banned on this
host, so the timing cannot be measured, and a speculative narrowing would be
worse than the known bound.

### C4 — three ways the tests were detecting rather than encoding

1. **Round 4 had no allowlist-vs-denylist discriminator.** Every existing
   assertion was satisfied by `dest !== "iframe"` just as well as by
   `dest === "document"`, so the check could have been rewritten as a denylist
   with the suite still green — while `frame`, `embed`, `object` and every
   future destination silently regained Lax. Added the omitted-`dest` case,
   which is the general form: not `iframe` (a denylist admits it), not
   `document` (the allowlist refuses it).
2. **Round 7 never tested partial metadata**, which is the shape the deployed
   world actually produces — `sec-fetch-mode` present, `sec-fetch-site` absent.
   Added a POST carrying only `mode: cors`. It pins the classifier to `site`
   specifically, so a rewrite asking "did this carry *any* `sec-fetch-*` header?"
   cannot conclude the absent `site` means same-origin.
3. **Round 8's jar control was invalid.** The fixture upstream sent `Set-Cookie`
   on *every* response, so each request re-populated the jar — which destroys
   every absence assertion in the file. Fixed at the source (seed once), and the
   iframe control moved to run **before** the assertion it defends. The
   nested-destination test had no control at all: three absences against an empty
   jar are three passes for the wrong reason. It now has one on each side.

### Falsifiability, measured one revert at a time

Every fix was proven falsifiable before being believed.

- **C3** — reverted the guard in a copy pointed at by `RAVEN_GRAB_ASSET_PATH`.
  Exactly one test red, the new one, failing on `the Enter immediately after a
  conforming commit was swallowed`. The WebKit test stayed green, proving the fix
  narrowed the arming rather than deleting the mechanism. The fixture also
  asserts `isComposing` read back as `true`, so a Chromium that stopped honouring
  the init member shows up as a broken fixture instead of a silent pass.
- **Allowlist → denylist** in `dist/` — two red: round 4's new omitted-`dest`
  case and round 8's `frame`/`embed`/`object` loop. The iframe test correctly
  stayed green, since a denylist still blocks `iframe`.
- **Absent `sec-fetch-site` read as same-origin** in `dist/` — one red, the new
  partial-metadata case. The two pre-existing assertions in that same test both
  passed, so it covers a hole they did not.
- **Round 8's control fix** got the strongest demonstration, because a test-only
  change cannot be falsified by breaking the product alone. Simulated a jar that
  drops the priming navigation's `Set-Cookie`, then ran both shapes against it:

  | test | old shape | new shape |
  |---|---|---|
  | metadata-less GET gets no Lax | **pass** | fail |
  | cross-site iframe gets no Lax | **pass** | fail |
  | nested navigation judged by destination | **pass** | fail |
  | `SameSite=None` without `Secure` dropped | fail | fail |

  Three of four passed against a jar that never stored anything. Only the one
  test that already asserted presence and absence in the *same request* caught
  it — which is the shape the other three now have.

### C2 — the cost comment was wrong in the other direction

The comment claimed a metadata-less browser "never receives Lax cookies through
the proxy." False: the `crossSite` ladder falls through to `Origin` and then
`Referer`, and both common cases clear it — the Fetch spec sets `Origin` on every
non-GET, and an in-page link or subresource carries a `Referer`. Those get the
full jar, Strict included, on the oldest browser there is.

The real failure is confined to a request with no metadata, no `Origin` **and**
no `Referer` — in practice a bare top-level navigation: address bar, bookmark, or
a link out of another app. Those lose the Lax jar, and since an unattributed
`Set-Cookie` parses as Lax, that is the ordinary session cookie. A
`Secure; SameSite=None` cookie still rides, and a reload from the resulting page
works because it has a `Referer`.

Two successive versions of this comment were wrong in opposite directions — one
claimed every later navigation carries a `Referer`, the other that Lax never
travels at all. Worth naming as its own lesson: **a comment describing a
security trade-off is a claim, and it decays exactly like a test does.** Neither
wrong version was caught by any check, because nothing executes a comment.

### The third leak, and why the glob was retired

`.claude/**/*.log` — §3f's fix — was itself an enumeration, by file
**extension**. `SOL-ROUND2.md` is a 794KB, 11,485-line raw transcript that
happens to end in `.md`, carrying 135 gstack markers and five `sed`-range dumps
of a 1,642-line private skill file.

Three narrowings in a row (directory → agent name → extension) is the signal that
a glob is the wrong instrument: a pattern has to predict the **filename**, and
the thing that defines this class is the **content**. The gate is now
`test/no-private-paths.test.mjs`, which fails the suite if any tracked file
contains an absolute path into a private agent-tooling directory. It carries its
own falsifiability test, and a `KNOWN_PUBLISHED` quarantine capped at one entry
so it cannot become an escape hatch.

Calibration mattered: a first draft flagged 40 files, almost all documentation —
README install steps legitimately say `~/.codex/config.toml`. Tilde forms are
excluded deliberately; only **absolute** private paths match. A gate that noisy
gets muted, which is worse than no gate.

**My own leak-scan had also been broken**, and this is the second instance this
session of the same class: `FILES=$(git diff --name-only …); for f in $FILES`
does not word-split in zsh, so the loop ran once with one giant filename, failed
`[ -f "$f" ]`, and printed `total hits: 0` — indistinguishable from clean. Sol
found real hits in the same range. Rewritten as `| while IFS= read -r f` **with a
positive control** proving the loop iterates. *A check whose failure mode is
indistinguishable from its success mode is not a check.*

### Root cause of the published half

`~/.claude/scripts/auto-save-on-turn.sh` runs `git add -A` and then `git commit`,
with no push. That is how `SOL-VERDICT-RAW.txt` reached commit `2487fb5` on the
public repo without anyone choosing to commit it. Consequence: **`.gitignore` is
the only defense at commit time**, and the test gate is the second layer before
push. Nothing else stands between a written file and a commit.

### Round-10 verification

- `RAVEN_NO_USAGE_LOG=1 npm test` — **1249 tests / 1246 pass / 0 fail / 3
  skipped / 43.6s**. The +4 over round 9's 1245 is one new test (the conforming
  ordering) plus the three in the private-path gate, which did not exist when
  that baseline was taken.
- `node test/e2e-pattern-library.mjs` — **33/33, exit 0**, live github.com
  through the proxy with real Chromium.
- stdio **108**, anon **45**, hash
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — matches
  the frozen golden.
- `cmp browser/raven-grab.js web/public/raven-grab.js` — byte-identical.
- `dist/` rebuilt clean after every revert; no revert survives in the tree.
- Full suite re-run **after** the history rewrite below: still 1249/1246/0.

### The strip, and a wrong assumption caught by the verification

`SOL-ROUND2.md` was stripped from the unpushed range with

```sh
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --index-filter \
  'git rm --cached --ignore-unmatch --quiet ".claude/patternlib-2026-08-04/out/SOL-ROUND2.md"' \
  -- origin/main..HEAD
```

The surgical check disagreed with what I expected, and the disagreement was the
useful part. `git diff --name-status refs/original/refs/heads/main HEAD` printed
a `D` for that path, which it should not have if the round-10 commit had already
recorded the deletion. It had not — `git ls-tree refs/original/…` still held the
blob at the old tip, and `git show --stat <commit> -- <path>` came back empty, so
the staged deletion never made it into the commit despite the path being passed
to `git commit --only`. **Had I not run the tree diff and instead trusted the
staged `D` in `git status`, the file would have stayed in the tree.** The
filter-branch outcome is strictly better than the deletion I thought I had: the
blob is absent from *every* commit in the range rather than merely removed at the
tip.

Verified: 12 commits ahead before and after; `git log origin/main..HEAD -- <path>`
empty; the same query against the preserved old lineage still names `a524383`,
which proves the strip did something rather than the query being broken.

The pre-strip refs (`refs/pre-strip/round8-main`, `round9a-main`,
`round10-main`) still hold the sensitive blobs locally. That is the recovery
path and is deliberate — `git push` only sends `refs/heads/*`, so they cannot
leave the machine. Delete them once the range is pushed and settled.

**`SOL-VERDICT-RAW.txt` was NOT stripped and cannot be by me.** It is in
`2487fb5`, an ancestor of `origin/main`, so it is published; removing it means
force-pushing a public repo, which breaks every existing clone and still leaves
the object retrievable by SHA on GitHub. It is deleted going forward and
quarantined in the gate's `KNOWN_PUBLISHED`. **The call is Andrew's.**

## 3h. Round 11 — dispositioning Sol round 10

Sol round 10 (xhigh, detached, report-only) returned
`OVERALL: DOES NOT SURVIVE — C1, C2, C3, and C4 all fail.` All four, plus one
defect outside the claims. Every one was real.

| Claim | Sol | Disposition |
|---|---|---|
| C1 — IME guard separates both commit orderings | FAILS | guard rewritten, three narrowings, +2 tests |
| C2 — Fetch Metadata cost comment accurate | FAILS | comment rewritten a **third** time |
| C3 — the three changed tests detect rather than encode | FAILS | three gaps closed |
| C4 — the private-path gate closes the class | FAILS | gate rewritten: index-based, self-scanning, empty quarantine |
| outside — `test/capture.test.mjs:749` | defect | fixed, falsifiability measured |
| frozen surfaces | intact | Sol independently confirmed 108 / 45 / hash / mirror |

### C1 — the guard fired on compositions that were CANCELLED, not committed

`compositionend` does not mean "committed". The UI Events spec fires it on
Escape, blur, focus change and IME dismissal too. Round 9's guard armed on any
`compositionend` inside Raven, so an Escape-cancelled composition armed the
marker and the very next Enter — a deliberate send — was eaten. That is the same
class of bug round 10 was supposed to have fixed, one layer in.

Three narrowings, all in `browser/raven-grab.js` (~419–480):

1. **Arm only on non-empty `event.data`.** A cancellation carries `data: ""`; a
   commit carries the committed string. That is the discriminator the spec
   actually gives you.
2. **Match the element.** The marker records `origin` from `composedPath()[0]`
   and the keydown honours it only when the origins are `===`. Both sides use
   `composedPath()[0]` rather than `event.target`, because from `window` a
   shadow-tree target retargets to the host — with `target`, every element inside
   the overlay is indistinguishable, and a composition ending in one field
   absorbed another's Enter.
3. **Stamp the verdict on the event, not a global.** `ravenIsCompositionCommit`
   now reads only `event.__ravenCompositionCommit`, written by a window-capture
   keydown listener. A module global is readable by anything running between the
   bookkeeping listener and the send handler, including a page capture handler
   that synchronously dispatches another keydown.

Plus `compositionstart` clears both pieces of state, so a commit in the *page's*
own field cannot disarm Raven's next composition.

The comment documents three residuals rather than claiming coverage: a
mouse-selected candidate (no keydown at all); an IME that reports raw pre-edit
text as `data` on cancel; and a page script registering a window-capture
`compositionend` listener before the overlay loads and calling
`stopImmediatePropagation()` — *"this cannot be closed from inside the page, only
noted."*

### C2 — the comment was wrong a third time, in a third direction

`src/grab-bridge.ts` ~1319. Round 8's version, round 9's correction of it, and
round 10's correction of that were each wrong somewhere. The current text opens
by saying so, and states the RULE with examples rather than asserting a boundary
it cannot enforce:

> A comment describing a security trade-off is a claim, and it decays exactly
> like a test does, except that nothing executes it.

What it now gets right: `Origin` is exempted on GET **and HEAD**, not GET alone;
`no-referrer` strips `Referer` from same-origin links and subresources too; a
no-CORS POST under `no-referrer` sends `Origin: null`, which throws at `new URL`
and falls to the cross-site default; a bare top-level navigation loses the Lax
jar and that is not limited to the first load; `Secure; SameSite=None` rides only
over https (verified at `proxyCookieHeader:1772`); a reload recovers only if the
page's referrer policy still emits a `Referer`.

### C3 — three tests that encoded the fix instead of detecting the defect

1. **`…-round4`: `Sec-Fetch-Dest: fencedframe`.** My own comment claimed the
   `iframe` case was the only one separating an allowlist of exactly `document`
   from an enumerated denylist. Sol showed that was false — round 8's
   `frame`/`embed`/`object` loop already separates them. Corrected the comment
   and added the case that *does* kill the enumerated-denylist mutation: a
   destination nobody enumerated.
2. **`…-round7`: `sec-fetch-mode: navigate` with no `sec-fetch-site`.** The
   existing `cors` case stays green under
   `if (!fetchSite && fetchMode === "navigate") crossSite = false;` — and that is
   the more tempting mutation of the two, because `navigate` sounds like the user
   did it. Nothing in that header says *whose* page issued the navigation.
3. **`…-round9` (new file, 2 tests): the jar is never observed CHANGING.** Round
   8 deliberately seeds `Set-Cookie` on the first response only — correct, and it
   left the suite with exactly one cookie event, so nothing measured the second.
   Make `storeProxyCookies` ignore every `Set-Cookie` once the jar is non-empty
   and every pre-existing proxy test still passes, while session rotation,
   logout and privilege changes are all silently broken upstream. The new file's
   fixture rotates deliberately; the second test expires a cookie and asserts it
   stops being sent, with a control on the preceding request so the assertion
   cannot pass against a jar that stores nothing at all.

### C4 — the gate scanned the worktree, so staging a leak passed cleanly

`test/no-private-paths.test.mjs`, rewritten. `git ls-files` reads the **index**;
`readFileSync` reads the **worktree**. Stage a leaking blob, then clean the
worktree, and the old shape hit `ENOENT` and `continue`d — while the staged
content is exactly what publishes.

It now enumerates `git ls-files -s -z`, reads every blob through one
`git cat-file --batch`, and matches the staged bytes. Three further changes, each
answering a specific Sol objection: it asserts the batch walk did not
desynchronise (`contents.size === entries.length`), it asserts the gate file
scans **itself** (its own literals are split so it is not its own false
positive — the previous version excluded itself, which is a hole shaped exactly
like the thing it guards), and it freezes the quarantine with
`assert.deepEqual([...KNOWN_PUBLISHED], [])`, because a `<= N` cap is not a
quarantine when a new offender can take a departed one's slot.

The header now enumerates what it does NOT catch — private prose with no
absolute path, encoded forms, `$HOME`/Windows paths, the `SKIP_EXT`/8MB/NUL
skips — and ends: *"Do not read a green run as 'nothing private is committed'."*

The gate went red on its first run. That was correct: the index still held the
old file with literal paths in it. It passed after `git add`.

### Outside the claims — the harness could not skip

`test/capture.test.mjs:749`. `assert.rejects` swallows the original error and
throws its own `AssertionError` when the predicate returns false, so on a machine
with no Chromium `runOrSkip` never saw `CaptureUnavailableError` and the test
reported a hard failure. The predicate now re-throws it and returns a boolean
otherwise.

This is also why Sol reported "1249 tests / 1188 pass / 1 fail / 60 skipped"
against my 1249/1246/0/3 — a contradiction worth chasing rather than dismissing.
Its sandbox has no Chromium. The disagreement was a real harness defect.

### Falsifiability, measured one revert at a time

Every fix was proven falsifiable before being kept. Overlay reverts ran against a
modified copy via `RAVEN_GRAB_ASSET_PATH`; bridge reverts were applied to
`dist/`, then `dist/` was restored from a pristine copy and re-verified with
`cmp`.

| Revert | Result |
|---|---|
| drop the empty-`data` check | 1 red — *"the Enter after an ESCAPE-cancelled composition was swallowed"* |
| drop the origin match | 1 red — *"a composition that ended in a DIFFERENT element still absorbed this field's Enter"* |
| drop the `compositionstart` clear | 1 red — the page-field test |
| enumerated denylist instead of `dest === "document"` | 1 red — the `fencedframe` assertion; round 8's loop stayed green |
| `!fetchSite && mode === "navigate"` ⇒ same-site | 1 red — the new navigate assertion; the `cors` case stayed green |
| ignore `Set-Cookie` once the jar is non-empty | both round-9 tests red; rounds 4/7/8 all green |
| gate: stage a leaking blob, delete the worktree copy | new gate red; old shape would have `continue`d |
| `capture.test.mjs` old predicate, no Chromium | 1 fail → new predicate 0 fail / 13 skipped |

### Round-11 verification

- `RAVEN_NO_USAGE_LOG=1 npm test` — **1254 tests / 1251 pass / 0 fail / 3
  skipped**, 43.4s. (+5 over round 10's 1249: two overlay, two round-9, one gate.)
- `node test/e2e-pattern-library.mjs` — 33/33, real Chromium against proxied live
  `github.com`.
- `cmp browser/raven-grab.js web/public/raven-grab.js` — byte-identical.
- Frozen surfaces — `108 45
  f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, unchanged.

## 3i. Round 12 — dispositioning Sol round 11

Sol round 11 (xhigh, detached, report-only) returned **`OVERALL: DOES NOT
SURVIVE`**. Five objections, four of them real. It independently re-derived the
frozen surfaces (108 stdio / 45 anon / the golden hash / the overlay mirror) and
agreed they were unchanged, and it confirmed C2 — the third rewrite of the
Fetch Metadata cost comment — **SURVIVES**. That is the first claim in this run
to survive an adverse pass without an edit.

| Claim | Sol | Disposition |
|---|---|---|
| C1 — the IME guard's per-event verdict | FAILS | rewritten: expando → module-private `WeakSet` |
| C2 — the Fetch Metadata cost comment | **SURVIVES** | no change |
| C3 — the round 4/7/9 tests encode the fix | FAILS | three cases added |
| C4 — the private-path gate's matcher | FAILS | matcher widened to three real shapes |
| outside the claims — `capture.test.mjs` skips | FAILS | availability now probed, not inferred |

### C1 — the per-event verdict was written where the page can reach it

Round 11 stamped the composition-commit verdict on the event itself
(`event.__ravenCompositionCommit`), specifically so anything running between the
bookkeeping listener and the send handler could not substitute a module global.
Sol pointed out that an own property is exactly the thing a page CAN reach, and
proved the worse half with a live probe rather than an argument:

```
TypeError: Cannot add property __ravenCompositionCommit, object is not extensible
```

A page that calls `Object.preventExtensions(event)` in a window-capture listener
makes the assignment **throw**. This file is `"use strict"`, so the throw kills
the rest of that listener — including the `ravenCommitEnterAlreadySeen` update on
the very next line, which is the state the conforming-browser narrowing depends
on. And a page that does not seal the event can simply `delete` the property or
write `false` onto it. Both directions of the mechanism were reachable from the
page it was defending against.

The fix is a module-private `WeakSet` closed over by the overlay's IIFE:

- The page has no reference to it, so it can neither read nor forge the verdict.
- `WeakSet.add` works on a non-extensible object, so sealing the event no longer
  throws — the guard degrades to "still correct" instead of "half-executed".
- It is still strictly per-event, which was the whole reason round 11 moved off
  a module global in the first place. Entries are collected with the event.

Two new tests in `test/grab-overlay-key-isolation.test.mjs` (now 11) pin both
directions, and both need a real host page rather than a fixture literal —
`withOverlay` takes an optional host page now:

- **the sealing page** — a `<head>` script registers a window-capture listener
  that calls `Object.preventExtensions(event)` on every keydown. The test asserts
  `sealed === true` first, so a Chromium that stopped honouring
  `preventExtensions` would fail the fixture instead of silently passing the case.
- **the forging page** — a window-capture listener registered at evaluate time
  (therefore LAST on the same node and phase, i.e. after the overlay's) tries
  `delete event.__ravenCompositionCommit` then writes `false`, inside a
  `try`/`catch` so it survives a sealed event too.

Revert the `WeakSet` back to the expando and **exactly those two go red**; the
other nine stay green.

**One judgment call kept against Sol's advice, and stated rather than buried.**
Sol argued the 100ms bound is now pure downside — ordering alone decides the
verdict, so the clock can only ever produce a false negative for a very slow
typist. That is true as far as it goes, and it is not the whole trade. Without
the clock the documented mouse-selected-candidate residual becomes **unbounded in
time**: accept a candidate with the mouse, walk away, come back minutes later and
press Enter, and the send is eaten. Clearing the marker on blur or `pointerdown`
does not rescue it, because an IME candidate popup is OS chrome and fires no DOM
event in the page. A bounded false negative for a very slow typist is a better
trade than an unbounded false negative for everyone who uses a mouse with an IME.
The residual is now documented as the comment's **fourth** entry with that
reasoning attached, rather than left for a fifth round to rediscover.

### C3 — three tests that still encoded the fix

Same class as round 10's C4, one layer further in. Each of these passes under a
plausible weakening of the code it is supposed to guard:

1. **`sec-fetch-dest: iframe` + `Sec-Fetch-User: ?1`** (round 4). Nothing
   separated the `document` allowlist from "top-level means the user did it".
   They are orthogonal: a user clicking a link **inside an iframe** produces a
   nested navigation carrying `Sec-Fetch-User: ?1`, so treating user activation
   as evidence of top-level hands the whole Lax jar to a planted frame the user
   happened to click in. Added as `sent[8]`; the no-cors case renumbered to
   `sent[9]`. Admit `?1` as top-level and **only** the round-4 test goes red —
   rounds 7 and 8 stay green, which is what makes the new case load-bearing.
2. **A metadata-partial GET** (round 7). The suite had `sec-fetch-mode` present
   with `sec-fetch-site` absent only for a POST. Reinstating the old
   `!fetchSite && navigate && GET → same-site` allowance therefore cost nothing.
   A GET to `/admin` carrying only `sec-fetch-mode: navigate` must now arrive
   with no cookie; with the allowance restored, **only** that test goes red.
3. **`Max-Age=0`** (round 9). RFC 6265 has two logout spellings and `Max-Age`
   outranks `Expires`; the suite only ever used `Expires` in the past. Narrow the
   parse to `seconds > 0` — a plausible "ignore nonsense values" edit — and the
   `Expires` deletion, the three-way rotation, and round 2's `Max-Age=1` liveness
   check all stay green while every `Max-Age=0` logout on the internet silently
   leaves the session cookie in the jar. Measured: with that narrowing, **only**
   the new test fails.

### C4 — the private-path matcher walked past three real machine layouts

Round 11 moved the gate onto the index, which was the right fix for the
worktree-vs-index hole. Sol attacked the matcher instead, and named three shapes
that are ordinary rather than exotic:

- **a realm-qualified home directory** — `/home/` + a name like
  `alice@example.com` + the tooling dir. That is what an AD/LDAP-joined Linux box
  hands every user, and `@` was outside the username class.
- **root's own home** — `/root/` + the tooling dir, with no username segment at
  all. This is the shape *every container agent running as root* produces, which
  is precisely the environment a CI transcript comes from.
- **a project-scoped tooling directory** — a home dir, then a project path, then
  the tooling dir. The old pattern only ever saw the tooling dir sitting
  *directly* in `$HOME`.

(Those three are described rather than spelled out, because this file is scanned
by the gate it describes — see below.)

The third one cannot simply be folded in, and that is the interesting part: **this
repo's own `.claude/` has exactly that shape**, and it is named legitimately in
docs, runbooks and session logs. A rule that flags it is a false-positive
generator, and a noisy gate gets muted — which is the failure mode that let this
class through three times already. So the nested form is a separate pattern with
a `repoRoot` prefix exclusion: it fires only when the path is outside this
checkout, which is exactly the condition that makes it someone else's machine.
Two negative assertions pin that exclusion.

The old matcher misses all three (measured directly against each fixture, not
just via the aggregate test), so each new case is independently load-bearing.

**The gate immediately caught my own edit.** Documenting the nested rule meant
writing a nested path in the header comment, which staged a matching literal into
the very file that scans itself. It went red on the next run. That is the gate
working, not a bug — and it is the same reflex the header now warns about: expect
RED right after editing a file that contained a literal path.

### Outside the claims — a skip that could hide a failure

`src/capture.ts` flattens every launch failure into one `CaptureUnavailableError`:
a missing `playwright` module, a missing browser revision, and a genuine bug
inside `launchAuditChromium()` all arrive wearing the same type. `runOrSkip` read
that type as "chromium isn't installed" and skipped. A real regression in the
launch path therefore turned the whole capture suite green-with-skips.

Availability is now **measured once at module load** by a probe that does not go
through the product code at all — import `playwright`, `chromium.launch()`, close.
If chromium launches for the probe, a `CaptureUnavailableError` out of
`capturePage` cannot mean "not installed", and it is rethrown with that stated.
A small test asserts the probe agrees with its environment, so
`0 fail / 13 skipped` and `0 fail / 0 skipped` stop being indistinguishable in a
CI log.

**The first version of this fix was not enough, and the measurement is what
showed it.** Injecting a deliberate throw into `launchAuditChromium()` with
chromium installed produced **1 fail / 12 skipped** — because for a `file://`
fixture `capturePage` swallows the launch failure entirely and returns a
static-extraction result with a warning, so the broken path never reaches
`runOrSkip` at all. The second face of the same mute. The verdict is now enforced
inside `usedFileFallback()`, the single point all sixteen call sites already pass
through: if chromium launched, the fallback firing is a regression, not an
environment fact. Same injection now produces **17 fail / 0 skipped**, and a clean
run is unchanged at 38 pass / 1 skip.

**No product code changed for this.** `src/capture.ts` keeps flattening launch
errors, because that behaviour is part of the frozen stdio surface; only the
test's interpretation of it changed.

### Falsifiability, measured one revert at a time

| Revert | Expected | Measured |
|---|---|---|
| `WeakSet` → expando property on the event | the 2 new overlay tests red | 2 fail / 9 pass |
| `Sec-Fetch-User: ?1` counts as top-level | only round 4 red | 1 fail / 15 pass (r4+r7+r8) |
| metadata-less `navigate` GET → same-site | only round 7 red | 1 fail / 18 pass (r4+r7+r8+r9) |
| `Max-Age` narrowed to `seconds > 0` | only round 9 red | 1 fail / 13 pass (r2+r8+r9) |
| private-path matcher → the round-11 regex | the gate's fixture test red | 1 fail / 3 pass |
| `launchAuditChromium()` throws, chromium present | capture tests fail, not skip | 17 fail / 0 skipped (was 1 fail / 12 skipped) |

### Round-12 verification

- `RAVEN_NO_USAGE_LOG=1 npm test` — **1258 tests / 1255 pass / 0 fail / 3
  skipped**, 44.0s. (+4 over round 11's 1254: two overlay, one round-9 `Max-Age`,
  one chromium probe. The round-4 and round-7 additions are assertions inside
  existing tests and move no count.)
- `node test/e2e-pattern-library.mjs` — 33/33, `ALL CHECKS PASSED`, real Chromium
  against proxied live `github.com`.
- `cmp browser/raven-grab.js web/public/raven-grab.js` — byte-identical.
- Frozen surfaces — `108 45
  f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, unchanged.

## 3j. Round 13 — dispositioning Sol round 12

Sol round 12 (xhigh, detached, cwd confirmed) returned **`OVERALL: DOES NOT
SURVIVE` with all five claims FAILING**. It confirmed the frozen surfaces
independently — 108 stdio, 45 anon, hash unchanged, mirror byte-identical, no
`src/` change in round 12 — and then took every claim apart.

| Claim | Sol's finding | Round-13 disposition |
|---|---|---|
| C1 — the verdict is out of the page's reach | FAILS. A `WeakSet` *object* is unreachable; `WeakSet.prototype.add/has/delete` are ordinary page-realm properties a page can replace. Separately, a `KeyboardEvent` can be dispatched more than once, and the verdict was never consumed — a page redispatching the user's commit Enter has it swallowed forever. | Fixed and the claim softened |
| C2 — the 100ms bound holds | FAILS. `performance.now` is page-replaceable, and the expiry is a subtraction over two of its return values: return a large value at `compositionend` and a small one much later and the delta is **negative**, which satisfies any `< 100` test. Bounded becomes unbounded. | Fixed |
| C3 — the new cookie tests are load-bearing | FAILS. `Max-Age=-1` was uncovered, and `Max-Age=` (empty) was *incorrectly deleting* the cookie — RFC 6265 §5.2.2 says ignore an unparseable value. | Fixed in `src/` + two new tests |
| C4 — the private-path matcher covers the real shapes | FAILS. Two bypasses, **and the gate was RED on the committed tree**. | Fixed; gate green |
| C5 — `capture.test.mjs` no longer skips a real failure | FAILS. The module-load `catch` still swallowed every load error as "not built yet" and exited 0. Plus two limits the comment did not state. | Fixed + stated |

### The committed-red incident

`a4829f7` was committed with its own gate failing. The sequence: I ran the full
suite, *then* wrote §3i into this log, then committed without re-running. §3i
spelled out the three machine layouts round 12 had just widened the matcher to
catch — so the prose describing the fix was itself a leak the fix now detects.

The rule this earns is mechanical, not a resolution: **any edit to a scanned file
after the last green run invalidates that run.** The gate scans the index, so a
session log written between `npm test` and `git commit` is exactly the blind spot.
Re-run before committing, always. The three bullets are now de-literalized —
"a realm-qualified home", "root's own home", "the tooling directory nested under
a project" — which says the same thing and does not trip the gate.

Note what this proves about the gate: it caught its own author's prose, on the
very shapes it was written for, one commit after being widened. That is the
argument against a `KNOWN_PUBLISHED` escape hatch in a sentence.

### C1 — a closed-over WeakSet is not a closed-over WeakSet method

The round-12 comment claimed "the page holds no reference to it". True of the set,
false of the operations. `ravenWeakSetAdd/Has/Delete` are now captured at load via
`Function.prototype.call.bind`, so post-injection tampering with the prototype
cannot reach them. What that does **not** buy: a `<head>` script that poisons
`WeakSet.prototype` *before* the overlay is injected still wins, and that is
unclosable from inside a shared realm. The comment now says so instead of
claiming immunity.

The redispatch hole is closed by consuming the entry on read —
`ravenIsCompositionCommit` deletes it before returning true. One mark, one
suppression. A redispatched event is a fresh decision.

### C2 — a clock you do not own is not a bound

Same shape as C1, one layer down: `performance.now` is captured at load, and
`ravenElapsedSince` returns `Infinity` whenever the delta is not a non-negative
number. That is the arithmetic half, and it is the one that matters — capturing
the function stops a *later* swap, but a page that replaced `performance.now`
before injection still hands back whatever it likes, and a negative delta is the
only value that turns a bound into no bound at all. Rejecting it closes the hole
regardless of who owns the clock.

### C3 — `Number("")` is 0, and a malformed header was deleting sessions

`Max-Age` now has to match `/^-?\d+$/` before it is read as a number. Two values
RFC 6265 §5.2.2 separates and `Number()` does not:

- `Max-Age=-1` — a **valid non-positive** value, so it deletes. Narrow the parse
  to `seconds >= 0` and every other cookie test in the repo stays green while a
  whole class of real logout headers stops working.
- `Max-Age=` — **invalid**, first character is neither DIGIT nor `-`, so the
  attribute is ignored and the cookie survives. `Number("")` is 0, so the old
  parse read it as a deletion: a malformed header silently destroying a live
  session.

Both are now in `test/grab-bridge-proxy-round9.test.mjs`, in one fixture that
proves the malformed case does **not** delete (a third request still carrying the
cookie) before the negative case deletes.

### C4 — two bypasses in the nested matcher

1. **`..` escape.** The `repoRoot` exclusion is a string prefix, not path
   resolution, so a path that starts with the repo root and then walks out of it
   satisfied `startsWith(repoRoot + '/')` and was discarded. A match containing a
   `..` segment is now never excluded.
2. **The greedy class ate two paths as one.** With `[^\s"'`]{1,200}` greedy, an
   in-repo path followed by a delimiter and an out-of-repo path matched as a
   *single* span starting inside the repo — discarded by the prefix exclusion,
   taking the real leak with it. The quantifier is now lazy, so each match is the
   shortest span and the scan resumes at the next candidate. The scan also
   iterates all matches on a line rather than taking the first.

Both bypasses are pinned by assertions reproducing exactly the inputs Sol
demonstrated.

### C5 — the mute one layer earlier

`runOrSkip` and `usedFileFallback` were hardened in round 12; the module-load
`catch` above them was not. It reported *every* load failure as "run npm run
build", registered one skipped test, and called `process.exit(0)` — so a syntax
error in `dist/capture.js`, a throwing top-level statement, or a missing
transitive dependency all produced a green run that executed nothing, with the
test count silently collapsing to one.

Only one failure is legitimately an un-built tree: the entry module itself not
existing. That is `ERR_MODULE_NOT_FOUND` **with a url matching `dist/capture.js`** —
and the url check is the load-bearing half, because a missing dependency *inside*
capture.js raises the identical code. Everything else rethrows. `process.exit(0)`
stays in the narrow branch on purpose and the comment says why: nothing below can
run without the module, so every later test would fail on an undefined
`capturePage` rather than skip.

Two limits are now stated in the probe comment rather than implied away: the probe
walks only the **local** branch of `launchAuditChromium()` (`src/browser-launch.ts:294`)
and says nothing about the remote `playwright-core` + `@sparticuz/chromium` stack;
and an intermittently-failing probe re-enables skipping for that run, which is the
right direction to fail in but means "skipped" reports *the probe did not launch*,
not *chromium is absent*.

### A test that passed against the defect, caught by its own revert

The redispatch test did not work on the first draft, and only the falsifiability
revert showed it: with consume-on-read deleted, the suite stayed **14/14 green**.

The draft dispatched a *second, freshly-constructed* event. That event was never
marked, so it sails through whether or not the verdict is consumed — the test was
measuring nothing. It now dispatches ONE event object twice, which is the actual
attack, and `defaultPrevented` only ever goes false → true so reading it after
each dispatch is a valid before/after despite being sticky.

Third occurrence of "detecting rather than encoding" in this file. Operating rule:
**a new test does not work until a revert proves it red.** Writing it and watching
it pass proves only that the tree is currently green.

### Falsifiability, measured one revert at a time

| Revert | Expected | Measured |
|---|---|---|
| `WeakSet` methods looked up on the prototype at call time | only the prototype-tampering test red | 1 fail / 13 pass |
| `ravenElapsedSince` → raw subtraction | only the backwards-clock test red | 1 fail / 13 pass |
| consume-on-read deleted | only the redispatch test red | 1 fail / 13 pass (**0 fail before the test was rewritten**) |
| `Max-Age` digit test removed entirely | only the new round-9 test red | 1 fail / 14 pass (r2+r8+r9) |
| `Max-Age` narrowed to non-negative digits | only the new round-9 test red | 1 fail / 14 pass, on the negative-value assertion |
| gate quantifier → greedy | the greedy-bypass assertion red | 1 fail / 3 pass, on that assertion's own message |
| gate `..` rejection removed | the `..`-bypass assertion red | 1 fail / 3 pass, on that assertion's own message |

The two gate reverts share a test name, so the messages were read to confirm they
fail on different assertions — a shared name is exactly how two reverts can look
like one measurement.

### Round-13 verification

- `RAVEN_NO_USAGE_LOG=1 npm test` — **1262 tests / 1259 pass / 0 fail / 3
  skipped**, 43.9s. (+4 over round 12: three overlay tests and one `Max-Age`
  test. The gate and `capture.test.mjs` changes are assertions and control flow
  inside existing tests and move no count.)
- `node test/e2e-pattern-library.mjs` — 33/33, `ALL CHECKS PASSED`, real Chromium
  against proxied live `github.com`.
- `cmp browser/raven-grab.js web/public/raven-grab.js` — byte-identical.
- Frozen surfaces — `108 45
  f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, unchanged.
  `src/grab-bridge.ts` changed this round, so `dist/` was rebuilt
  (`npm run build` = `clean && tsc`) before any of the above.

## 4. Committed set — round 12

Round 12 committed: `CLAUDE.md`, `browser/raven-grab.js`, `web/public/raven-grab.js`,
`test/grab-overlay-key-isolation.test.mjs`, `test/grab-bridge-proxy-round4.test.mjs`,
`test/grab-bridge-proxy-round7.test.mjs`, `test/grab-bridge-proxy-round9.test.mjs`,
`test/no-private-paths.test.mjs`, `test/capture.test.mjs`, this log, and
`.claude/patternlib-2026-08-04/briefs/BRIEF-ROUND12.md`. Explicit paths, no bare
`git add`. **No `src/` change in this round** — every fix was in the overlay asset
or in the tests. `origin/main` is unmoved and nothing is pushed; read the current
count with `git log --oneline origin/main..HEAD | wc -l` rather than trusting a
number written here.

Round 11 committed: `CLAUDE.md`, `src/grab-bridge.ts`, `browser/raven-grab.js`,
`web/public/raven-grab.js`, `test/grab-overlay-key-isolation.test.mjs`,
`test/grab-bridge-proxy-round4.test.mjs`, `test/grab-bridge-proxy-round7.test.mjs`,
`test/grab-bridge-proxy-round9.test.mjs` (new), `test/no-private-paths.test.mjs`,
`test/capture.test.mjs`, this log, and `…/briefs/BRIEF-ROUND11.md`. Explicit
paths, no bare `git add`. **`origin/main` is still `985e5ce` and nothing is
pushed.** Read the current count with `git log --oneline origin/main..HEAD | wc -l`
rather than trusting a number written here.

Round 10 landed as `de1c46f` ("Stop the IME guard eating a deliberate Enter, and
make three tests encode"), 22 files, +730/−5346, at **12 commits ahead**.

Because the strip rewrote the whole unpushed range again, **every hash written
earlier in this file is stale, including §3f's and §3g's.** Current lineage,
oldest first: `ff9bf9e → 4e4793e → 433b566 → 184ee63 → 394a408 → a9dd740 →
cb482e0 → 0c53276 → 31ce513 → 96801bf → 4197458 → de1c46f`. Re-read with
`git log --oneline origin/main..HEAD` rather than trusting any hash here.

Committed in `de1c46f`: `.gitignore`, `CLAUDE.md`, `src/grab-bridge.ts`,
`browser/raven-grab.js`, `web/public/raven-grab.js`, the four test files
(`…-round4`, `…-round7`, `…-round8`, `grab-overlay-key-isolation`), the new
`test/no-private-paths.test.mjs`, both conversation logs, the round-10 brief, and
the deletion of `SOL-VERDICT-RAW.txt`.

**Briefs were renamed `SOL-ROUND*.md` → `BRIEF-ROUND*.md`.** The ignore pattern
correctly refused to commit a round-10 brief still using the old name — a glob
cannot tell my prose from an agent's transcript when both are called
`SOL-ROUND10.md`. The fix was to rename the file, *not* to add a negation for
`briefs/`; a negation there would let the next raw transcript dropped into that
directory ship. The convention is now explicit in `.gitignore`: `SOL-ROUND*` is
agent OUTPUT and never ships, `BRIEF-ROUND*` is input prose and does.

On disk, gitignored, **never committed**: 24 `.log` files under
`.claude/patternlib-2026-08-04/out/`, and the three harnesses
`.mcpb-stage/{verify-github-typing,verify-github-send,probe-send-label}.mjs`.

Scratchpad only, ephemeral: `/tmp/raven-r9-falsify/{no-guard.js, clock-only.js}`
(the two neutered overlay copies used for the falsifiability proofs),
`/tmp/gb-round9-backup.js`, and the pre-rewrite log backup.

## 5. Exact next commands

Sol round 11 is **running** — launched detached at xhigh against
`.claude/patternlib-2026-08-04/briefs/BRIEF-ROUND11.md`, writing to
`.claude/patternlib-2026-08-04/out/SOL-ROUND11.log` (confirm cwd with
`lsof -a -p <pid> -d cwd`, never assume it). Its verdict is not yet
dispositioned, so **no completion claim may reach Andrew until it is.**

The brief warns Sol explicitly that a Chromium-less sandbox will SKIP
`test/capture.test.mjs`, and that a skip is not a failure — round 10's report
contained a spurious "1 fail / 60 skipped" for exactly that reason.

```sh
# read the verdict when it lands
tail -80 .claude/patternlib-2026-08-04/out/SOL-ROUND11.log

# re-verify after any round-11 fix
RAVEN_NO_USAGE_LOG=1 npm test
node test/e2e-pattern-library.mjs        # not in npm test — real Chromium, proxies live github.com
cmp browser/raven-grab.js web/public/raven-grab.js

# frozen surfaces
node --input-type=module -e "import { createHash } from 'node:crypto'; \
  import('./dist/index.js').then(({buildServer}) => { \
    const l = Object.keys(buildServer({remote:false})._registeredTools); \
    const r = Object.keys(buildServer({remote:true})._registeredTools).sort(); \
    console.log(l.length, r.length, createHash('sha256').update(r.join('\n')).digest('hex')); })"
# expect: 108 45 f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6

# committing: explicit paths only, never a bare git add + commit
git fetch origin && git status --porcelain
git commit --only <explicit paths> --file=<message file>
```

Round 11's brief hands Sol all four round-10 failures as claims, plus the outside
`capture.test.mjs` defect, and asks whether each disposition is real or cosmetic
— **and whether any introduced a new defect.** Two rounds have now shipped a
regression through a fully green suite, so it says *"treat 'the tests pass' as
worth nothing here"* and asks for arguments from event and HTTP semantics rather
than from test output. The specific attacks: an IME/browser pairing where a
cancellation delivers non-empty `data` or a commit delivers empty `data`; a real
machine where the WebKit `compositionend`→keydown gap exceeds 100ms, or a fast
typist whose deliberate Enter lands inside it; whether writing
`__ravenCompositionCommit` on a page-owned event object is observable to the page
or breaks a sealed event; a factual error in the FOURTH version of the Fetch
Metadata comment; a concrete one-line product edit that keeps each new test green
while breaking real behaviour; and the `git cat-file --batch` offset arithmetic
at a blob boundary, an empty blob, a missing OID, and a `maxBuffer` overflow —
specifically whether an overflow fails loudly or truncates the scan and reports
PASS.

Note for whoever picks this up: the running MCP server process holds a **pre-fix
`dist/`**. Overlay fixes land on a plain reload (the bridge reads the asset from
disk per request), but bridge-server fixes need a `/mcp` reconnect.

## 6. Blockers — Andrew only

1. `git push` to `main` (**12 commits ahead**). **This deploys the live MCP
   endpoint** since the 2026-07-27 unpin — human-gated. The history was rewritten
   three times locally (§3d, §3f, and the round-10 strip); the range has never
   been pushed, so this is still a plain fast-forward push, not a force.
2. **Whether to force-push to strip `SOL-VERDICT-RAW.txt` from published history.**
   It is in `2487fb5`, already an ancestor of `origin/main`, so it is public. I
   deleted it going forward and quarantined it in the gate's `KNOWN_PUBLISHED`,
   but removing it from history means rewriting a public repo: every existing
   clone breaks, and GitHub keeps unreachable objects retrievable by SHA anyway,
   so the rewrite buys less than it costs. **Andrew's call, not mine.** Doing
   nothing is a defensible answer — the file is Sol's own verdict prose, not a
   credential.
3. `npm publish` (passkey 2FA, his terminal).
4. `cd web && vercel deploy --prod` — the only thing that moves the apex marketing
   site and the public `.mcpb` download.
5. No hold-open bridge is currently running; he has nothing to click yet. A fresh
   `start_grab_session` with `proxy_target` is needed before handoff.
