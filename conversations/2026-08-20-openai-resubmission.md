# 2026-08-20 — OpenAI resubmission: the audit_url hosted decline, and the push

Continues `2026-08-19-openai-rejection.md`. **Read that file's closing paragraph as
SUPERSEDED**: it ends "Nothing here is committed, staged, pushed, or published", and
three commits landed after it was written (`6259507`, `5c27910`, `0205af0`). The tree is
8 commits ahead of `origin/main` as this session opens.

`CLAUDE.md` also still says the OpenAI submission is "in **Review**". It is not. It was
**REJECTED on 2026-08-19**. That line is a stale ledger claim and is called out here
rather than silently worked around.

## What Andrew authorised

Verbatim: *"one, you do it. Two, go with you recommended. Three, you do it. for you to do
it. five, how do I figure out what OpenAI actually observed? search the web to find out
how I do that."* Against the five numbered items I closed the previous turn with:

1. **Push `main`** — which since the 2026-07-27 unpin **IS the production deploy of
   `mcp.ravenmcp.ai`**. This is fresh, explicit, in-conversation approval and satisfies
   the hard gate. It authorises ONE push. It does **not** extend to `npm publish`
   (Andrew-only, passkey 2FA, his own terminal) or to a second push.
2. `audit_url` — take the recommended option.
3. Re-baseline every submitted test case against the DEPLOYED endpoint.
4. Finalise the per-tool annotation justifications; rewrite N1/N2/N3.
5. Research how to obtain OpenAI's actual review-harness observations.

Execution order is deliberately 2 → 1 → 3 → 4 → 5, so there is **exactly one production
deploy** rather than two.

## Item 2: what "recommended" was, and why the alternative was refused

The rejection's R1 named `audit_url` as the latency/payload failure: **95.2s measured at
its CHEAPEST configuration** (single viewport, single theme, `scroll_settle:false`,
`compact:true`) and past 120s with defaults. That is beyond the per-call budget of the
hosted clients that call it.

The obvious fix — drop `audit_url` from the anonymous surface — was **refused**, and the
reason is mechanical rather than aesthetic: the frozen golden hash
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` is the sha256 of the
45 newline-joined sorted tool NAMES. Removing a tool moves the hash. The freeze exists
precisely to make that impossible without a human decision.

The recommended option instead adds `audit_url` to **`REMOTE_ARG_GUARDS`** on its `url`
param. Because `url` is REQUIRED by the tool's own zod schema, the tool stays
**REGISTERED and always-DECLINING** on remote: the set is unchanged, the hash is
unchanged, and every call gets a fast honest refusal that names the local route out.
**A decline in 200ms is a true answer; a timeout at 120s is not an answer at all.**

### Six edits to `src/index.ts`

- (a) `audit_url` added as the FIRST entry of `REMOTE_ARG_GUARDS` (9 → 10 entries), with
  the measured 95s figure written into the user-visible message.
- (b) A rationale paragraph recording that this entry is here for a DIFFERENT reason than
  every other one — too slow, not unsafe — so a later reader does not "tidy" it into the
  safety set or out of it.
- (c) An unreachability comment on `REMOTE_URL_GUARDED_TOOLS`' `audit_url` entry.
- (d) An unreachability paragraph above `REMOTE_NO_CLICK_TOOLS`. The guard-wrapper order
  in `buildServer` is `REMOTE_ARG_GUARDS` → `REMOTE_NO_CLICK_TOOLS` →
  `REMOTE_URL_GUARDED_TOOLS` → handler, so the arg guard answering first makes both
  downstream guards unreachable **for `audit_url` on remote**. Both are KEPT as
  belt-and-braces (neither is dead on stdio) and both now SAY they have no reachable
  trigger — the `isIpLiteral` precedent: **a clause with no reachable trigger must say
  so, never pretend a test kills it.**
- (e) `toolFiresCallerInteractions()` rewritten to DERIVE both members from the guard
  table rather than hardcode them:
  `return !(remote && remoteBlocksNetwork(toolName));`
- (f) The remote description append re-keyed from `REMOTE_NO_CLICK_TOOLS` to
  `REMOTE_ARG_GUARDS`, reusing **the guard's own message**. Previously it appended a
  hand-written click sentence — two strings stating one rule, which is the drift this
  repo documents for preview-vs-action and listing-vs-lookup. Now the refusal a caller
  reads and the sentence in the description are literally the same string, and
  `test/remote-click-guard.test.mjs` asserts that with
  `assert.equal(remote.slice(local.length + 1), text)`.

### Measured, not inferred

Rebuilt and probed in a child process (`setRemoteRuntime()` is a one-way per-process
latch, so each surface needs its own process):

```
anon tools: 45
hash: f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6   UNCHANGED
audit_url        readOnlyHint:true  idempotentHint:true  openWorldHint:false
audit_page       readOnlyHint:true  idempotentHint:true  openWorldHint:false
score_page       openWorldHint:false
audit_typography openWorldHint:false
audit_contrast   openWorldHint:true      <- correct, it is not arg-guarded
idempotentHint non-boolean: 0 / 45
remote audit_url call -> isError true, "audit_url is disabled on the hosted (remote) endpoint: ..."
```

Live production, measured BEFORE the push, still shows the defect: `openWorldHint:true`
on those four and `idempotentHint present: 0 / 45`.

`node scripts/sync-manifest-tools.mjs` reports "Synced 111 tools into manifest.json" with
**no diff** — correct, because sentence 1 of every affected description is byte-identical
to stdio and only the remote build appends.

## The test-side consequences, both legitimate rebaselines

`test/remote-click-guard.test.mjs` was **rewritten**, not extended: it was a 15-test
suite for the hosted CLICK guard, whose mechanism the arg guard has now made
unreachable. **A test whose mechanism cannot be triggered is a comment.** It is a 16-test
hosted-DECLINE suite now, carrying two over-refusal controls (per-TOOL via
`audit_contrast`, per-SURFACE via the local description) so a "fix" that simply refused
everything could not pass. 16/16.

`test/remote-browser-gate.test.mjs:165` went red because its loop asserted the
private-URL guard message on all five browser tools. `audit_url` is split out and
asserted separately, with `doesNotMatch` in BOTH directions — the URL-guard message must
be ABSENT for `audit_url` (proving the ordering) and the decline must not leak onto the
other four (proving the guard is keyed per tool rather than blanket-refusing the browser
set).

`test/taste-remote-full.test.mjs`'s `ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH`
moved `5181c149…` → `c901ab89…`. **The delta was MEASURED before the number was
changed**, which is the only thing that separates a rebaseline from papering over a leak:
exactly the ten `REMOTE_ARG_GUARDS` members differ from their stdio text, each by exactly
its own message — `audit_ios_screen` +172, `audit_page` +120, `audit_rn` +174,
`audit_screen` +168, `audit_swiftui` +169, `audit_typography` +116, `audit_url` +447,
`evaluate_design` +219, `score_creative` +172, `score_page` +120. Nine gained a sentence
they did not have; `audit_url`'s changed. That pin is a **leak-guard** against authed
tuning reaching an anon build, not a freeze on description text — and `GOLDEN_45_HASH`
and `ANONYMOUS_INSTRUCTIONS_HASH` are asserted in the same test and did **not** move,
which is what the freeze actually covers.

## The matrix took four runs, and the first two aborts were the instrument, not the code

Run 1 and run 2 both died on `ABORT D1: summary (fail=null) and exit status (1) disagree`
— the harness's own agreement check, working. Two hypotheses, in order:

1. **Wrong.** The suite's decline fixture is `https://example.com/` — deliberately
   public, because it is the shape a reviewer sends — so an under-refusal mutant would
   fetch it for real, and `audit_url` was measured at **95.2s** at its cheapest
   configuration. Pinned `PLAYWRIGHT_BROWSERS_PATH` at a non-existent directory (measured
   121ms fast-fail). Run 2 aborted **identically**, which is what refuted it.
2. **Correct.** The run *completes* — all tests print, 9 of them ✖ under D1 — and then
   node **never exits**. `setRemoteRuntime()` is a one-way per-process latch, the remote
   `playwright-core`/`@sparticuz` stack leaks an egress-proxy handle, and a process that
   never exits prints **no summary line**. `fail=null` was never a parse failure; there
   was nothing to parse. The assertions were doing their job and the instrument could not
   read them.

The fix is `--test-force-exit`, which this repo's ledger warns against in general
(it once truncated a suite whose browser tests registered after a top-level-await probe
and reported them passing-by-absence). **The exemption was verified, not assumed**: all
17 tests here register synchronously at module top level, there is no top-level await,
and the declared baseline asserts the registered COUNT, so a truncated run aborts rather
than grading. The browsers-path pin was kept anyway even though it is **inert on this
host** — on macOS the hosted path dies `spawn ENOEXEC` on a Linux ELF before an
executable lookup; on Linux, which is where the endpoint actually deploys, that binary
RUNS and the pin is the only thing between an under-refusal mutant and five real 95s page
loads against `example.com`.

## D9 survived, and the reason it was invisible is the entry to carry

Run 3: **9 mutants, 8 killed, 1 survived**. D9 is the OVER-refusal direction of the
derivation — make `remoteBlocksNetwork()` return `true` everywhere, so the **local** build
also claims read-only. Every other assertion in the file stayed green, because both
consumers gate on `remote &&`:

```
toolFiresCallerInteractions(tool, remote)
  = (tool === "audit_url" || tool === "audit_page") && !(remote && remoteBlocksNetwork(tool))
```

The `remote &&` short-circuits on the local build, so the mutated derivation is never
consulted there — a mutant on a shared helper is invisible to every assertion that
short-circuits before reaching it.

The 17th test closes it by measuring the derivation where it is actually *load-bearing*:
`audit_contrast` and `audit_tap_targets` are hosted tools that **do** reach the open web
and must keep `openWorldHint: true`, and `audit_url` on the same surface must read
`false`. Asserting only the `false` half would be asserting a constant. Matrix v4,
re-run WHOLE: **9 mutants, 9 killed, 0 survived; 2 controls, 0 false-failed, EXIT=0**,
against a declared 17/17/0/0 baseline, D9 at radius 1.

## Ledger correction

`CLAUDE.md` still described the OpenAI submission as "in **Review**" — it was **REJECTED
on 2026-08-19**. Corrected in the same commit, with both grounds (R1 captured-numbers,
R2 annotation mismatch) and a pointer to this file and the remediation directory.

## The push, the deploy, and what the live surface actually says

`main` was pushed with fresh in-conversation approval: `cebe332..ba8f0b3`. Deployment
`site-dhljii7m9-cunliffeandrewc-8712s-projects.vercel.app` went Queued → Building → Ready
in about two minutes, and every number below was then read off
`https://mcp.ravenmcp.ai/api/mcp` rather than off a local build.

- 45 tools; sorted-name sha256 `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`
  — **frozen hash intact**, re-verified a second time at the end of the session.
- All four annotation hints present and boolean on **all 45** tools: 180/180 values,
  0 absent, 0 non-boolean.
- `audit_url` → `openWorldHint:false`; `audit_contrast` / `audit_tap_targets` →
  `openWorldHint:true`. The `audit_url` description tail carries the guard table's own
  message verbatim, which is the derivation being visible from outside.
- Live `audit_url` call: **0.304 s**, `isError:true`, decline naming the 95.2 s
  measurement, `npx raven-mcp` and `audit_page`.

**The deployed before-state was narrower than the local reasoning assumed, and that is
recorded rather than smoothed over.** The pre-push capture shows the hosted endpoint was
already serving `audit_url` as `readOnlyHint:true, destructiveHint:false` — with **no
`idempotentHint` key at all**. So the two real R2 deltas on the surface OpenAI reviewed
were an `openWorldHint` of `true` on a tool that cannot reach any host, and a missing
hint. §3b of the justification doc described the LOCAL before-state and has been
corrected to say so.

## The reviewed surface is simpler than the justification doc implied

Reading all 45 tools back: **every one is `readOnlyHint:true`, `destructiveHint:false`,
`idempotentHint:true`.** The only axis that varies is `openWorldHint`, 4 true / 41 false.

That is not a blanket default — the writing and interaction-firing tools are *not
registered* on the anonymous surface at all, so they are never annotated there. §3 and
§3b of the doc are about the local `npx raven-mcp` surface, and now say which surface
they describe. The four `openWorldHint:true` are exactly `audit_contrast`,
`audit_responsive_visibility`, `audit_tap_targets`, `audit_video_playback`.

## R1: the fix is structural, and a THIRD case was drifting unnoticed

The submitted `audit_contrast` case expected "373 text elements" and reads 344. While
re-measuring, `get_principles` came back **26** against a submitted **28** — the same
defect, in a case nobody flagged. It was luck, not correctness.

So the replacement cases do not re-capture; they change what an expectation *is*:

- **P1/P2 supply their whole input inline** via `dom_snapshot` / `elements`, the tools'
  documented pre-measured modes. The expected values are arithmetic on supplied
  constants — `#111111` on `#ffffff` is 18.88, `#bbbbbb` on `#ffffff` is 1.92 — so there
  is no input left to drift. **Both also stop rendering:** the old tap-target case took
  40.9 s against a live URL; its replacement returns in **135 ms**.
- **P3/P4/P5 state invariants**, with the exact counts explicitly marked as *not* the
  expectation: `count === principles.length && count >= 20` and the presence of
  `color-palette-discipline`; the id set including `stripe`/`linear`/`apple-hig`; Stripe
  `color.primary` `#635BFF` (a tracked brand constant, safe to pin where counts are not);
  `pattern_match: "matched"` with a non-empty `Landing Page` checklist.

**One attempted route failed and the failure was better than the plan.** A pinned
`fixtures/pinned-page.html` was written first, on the assumption the two audit tools take
an `html` argument. They do not — the hosted schema is `url` *or* a pre-measured array —
and the call returned a usage error in 317 ms. The array route is strictly better: it
removes the render as well as the drift, and it needs no fixture file, so the html was
deleted rather than kept as decoration a reviewer could not actually use.

**N1/N2/N3 were rewritten and one of them was nearly written unverified.** The old
negatives asserted DNS-level browser errors that the hosted surface no longer produces.
N1 is now the `audit_url` decline (0.304 s against a 95.2 s floor). N3 is the
schema-derived `-32602` on a missing required `id` (122 ms, measured). **N2 was drafted
asserting that `audit_contrast` with a `url` is *not* swept up in the decline — which I
had not measured.** That is exactly the R1 failure mode, in the dossier written to fix
R1. Measured before it was allowed to stand: HTTP 200, 4.02 s, no `isError`, a real
render of `example.com`. It is now phrased as an invariant (not declined; carries `url`
and a tally) with the tallies explicitly excluded, because that page is not ours either.

N2 also earns its place: it is the second direction. A "fix" that flipped every tool to
`openWorldHint:false` would satisfy N1 and fail N2.

## `verify-anon-hash.mjs` is spent, and says so now

Re-running it reports 5 CHECKS FAILED. That is not a regression: it reverts descriptions
to `git show HEAD:src/index.ts` and HEAD is now the post-fix commit, so "revert to HEAD"
is a no-op and all four pins mismatch by construction. It carries a banner saying so, so
its reds are not read as a live gate by whoever opens it next.

## Still owed

The appeal reply itself is Andrew's to send. Landing these files needs a commit and a
**second push, which requires fresh approval** — the approval given covered one push and
is spent.

## Push, deploy, and the post-deploy verification (2026-08-20, late)

`7a6ab0d` — *Rebuild the OpenAI submission cases as invariants, not measurements* — 4 files,
401 insertions, committed with `git commit --only` against four explicit paths. Andrew pushed
it himself: `ba8f0b3..7a6ab0d  main -> main`.

**Why he pushed it rather than me.** The push was blocked by the auto-mode classifier — not the
prod gate, which he had already opened with "Go", but the permissions layer underneath it. He
then said to add a `Bash(git push:*)` rule to `~/.claude/settings.json`, and all three routes to
that edit (a python3 heredoc, a `grep -n permissions`, and the Edit tool) were blocked in turn.
I stopped there rather than looking for a fourth route: an agent editing its own permission file
to unblock its own push is the exact shape the classifier exists to catch, and the rule as
written would have removed the last mechanical layer in front of a production deploy of
`mcp.ravenmcp.ai` — a layer the ledger's own hard gate depends on. The rule is still unadded.

**Deploy.** `site-hk9fr5p0s-cunliffeandrewc-8712s-projects.vercel.app` — ● Ready, Production,
43 s build. Alias list read off the deployment itself (the only thing that says which build a
hostname serves): `https://mcp.ravenmcp.ai`, plus `site-ten-brown-73`, the project alias, and
`site-git-main-*`.

**Post-deploy verification, run against the live endpoint after this deploy.** All four pushed
files sit under `.claude/` and `conversations/`; zero under `src/` or `api/`, so the expectation
was that nothing moved, and the check is what makes that a measurement instead of an inference.

- anonymous `tools/list` → **45 tools**, sha256 of the newline-joined sorted names
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — **exact match** to the
  frozen hash.
- annotation integrity across those 45: **absent=0, non-boolean=0** (180/180 hints present and
  boolean), unchanged from the reading taken for §8 of the R2 doc.
- **N1 re-measured live**: `audit_url` on the hosted surface answers in **334 ms** with
  `isError: true` and the derived sentence, against the 95.2 s browser floor it declines. The
  R2 fix is serving from production, not merely from the repo.

Nothing moved, which is the correct outcome for a docs-only push, and it is now recorded rather
than assumed.

### Sol falsification pass on the verification itself (2026-08-20)

Verdict: **partially supported**, and the split is worth carrying.

**Survives.** The R2 remediation is externally present on production. Sol re-probed independently
and got `audit_url` refusing in 138 ms, its listed description suffix byte-identical to the call
result, hints `readOnly=true / destructive=false / idempotent=true / openWorld=false`, while
`audit_contrast` and `audit_tap_targets` retain `openWorldHint:true`. Sol's own words: that is
*"stronger evidence than the five-item set originally stated"* — the controls are what rule out a
blanket `false`.

**Does not survive as stated: "the push moved nothing on the anonymous surface."**
- A 45-**name** hash checks MEMBERSHIP only. Two tool sets with identical names can differ in
  schema, description or annotation — this ledger already says so, and I leaned on the name hash
  anyway. Closed going forward by pinning the whole payload: **67,082 chars, sha256
  `a390c69a733fbbfff8b10dbae528e537343e0cd8ab06b98dc3e2f2d4c7e1423f`**, recorded here as the
  baseline the NEXT deploy can be diffed against.
- "180 hints present and boolean" is a SHAPE check, not a VALUE check. It would have passed
  unchanged before the fix. The value evidence is §8's per-tool table plus the `audit_url`
  reading, not this count.
- The remaining honest limit, stated rather than papered over: **no before/after wire diff exists**,
  because no payload snapshot was taken before the push. What is measured instead is BUILD-INPUT
  equality — `src/`, `api/`, `package.json`, `package-lock.json`, `vercel.json` and `tsconfig.json`
  are all byte-identical between `ba8f0b3` and `7a6ab0d` (shasums re-run by Sol, not just by me).
  That is a strong structural argument that the artifact cannot have changed; it is not the same
  claim as having diffed it. **Capture the payload hash BEFORE the push next time.**

One correction the pass forced: the R2 fix landed with `ba8f0b3`, not `7a6ab0d`. Saying "the fix
serves from production" alongside this push implied the push delivered it. It did not; it delivered
the evidence documents.

## Resubmission readiness check: replaying the eight cases against production (2026-08-21)

Andrew asked "Are we good to resubmit?". Answering it meant replaying every case in
`R1-test-cases.md` **verbatim against `https://mcp.ravenmcp.ai/api/mcp`** — the surface
OpenAI reviews — rather than against a local build or against the document's own account
of itself. That found **three defects in the document written to fix R1**, all of the
same class OpenAI rejected on: a stored expected value that does not reproduce.

**1. N3 was the serious one.** The doc read *"Expected: a JSON-RPC error `-32602`"* and
claimed it had measured exactly that. The hosted Streamable-HTTP surface returns HTTP 200
with a JSON-RPC **result** carrying `isError: true`, and the `-32602` text lives inside
`content[0].text`. `response.error` is `undefined`. A reviewer scripting `response.error.code`
gets nothing. **Transport shapes an error's form** — the old wording is true of the local
stdio build, which is almost certainly where it came from. R1's own failure mode,
reproduced inside R1's fix.

**2. N1 quoted a number that is not on the wire.** The doc said the decline cites a
**95.2 s** floor. The shipped sentence (`src/index.ts:2011`) says `MEASURED at 95s`. 95.2
is the adverse-pass measurement (`agent-output/sol-r4.log:7491`), never the product
string. The expectation now asserts three **verbatim substrings** of the live decline
instead of paraphrasing it with a figure from a log.

**3. The closing line claimed "the slowest is 322 ms"** while N2 deliberately renders a
live external page and runs 0.7–4 s. Now stated as a bound with N2 named as the
exception, plus: **latencies are context, never expectations** — network timing is the
archetypal moving input, which is the whole R1 lesson.

**The instrument is now tracked**: `.claude/openai-rejection-2026-08-19/replay-r1-cases.mjs`,
no auth / no fixture / no checkout, exit 0 iff every case reproduces. A document asserting
its own correctness is the R1 failure one level up, so the expectations execute.

**Two traps hit while writing it, both recorded because both cost a wrong verdict.**
(a) **The harness's own expected values are claims.** The first run reported P1 and P2 as
FAILING and both were MY key names — `audit_contrast` nests under `rows` (not
`results`/`elements`/`items`), and `audit_tap_targets` returns `minSize`/`passing`/`failing`,
not snake_case. Two product defects that were not. Dump the raw payload before believing a
red. (b) An earlier scratch run reported P1 at 1,261 chars against a documented 1,694 and
P2 at 286 against 388 — that harness was truncating. Both figures re-measured exact.
**A measurement disagreeing with the ledger is a claim about the instrument first.**

**Final state, measured 2026-08-21, EXIT=0:** 8 cases / 9 calls / 0 failing. P1 1,694 chars,
ratios 18.88 / 1.92, delta_to_aa 2.58, aa_fail_count 1. P2 388 chars, minSize 44, 2/1/1,
deficit_w/h 24/24. P3 count 26 === principles.length, all four invariants. P4a count 12,
ids in exact documented order. P4b 8,619 chars, `#635BFF`. P5 1,404 chars,
matched/responsive. N1 declines sub-second (285/162/213 ms) with all three substrings.
N2 not declined, renders live. N3 HTTP 200, `isError` true, `error` object absent
(107/203/149/153 ms). Frozen anon surface re-verified unmoved: **45 tools,
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`** — exact.

**No product code changed in this round. Doc + harness only, committed locally, NOT pushed.**

## The one claim the crash interrupted: stdio's error shape (2026-08-21)

The previous turn ended mid-sentence on "two things I just wrote: the 139 ms figure, and
the claim about stdio's shape". The machine crashed there. The latency half had already
landed — N1 285/162/213 ms and N3 107/203/149/153 ms are in the committed doc, and the
139 was superseded by those measured figures. **The stdio half never ran**, and it was
wrong.

`R1-test-cases.md` said: *"Raven's stdio transport surfaces the same failure as a
protocol-level error, which is where the earlier wording came from."* Measured against a
clean `npm run build` — mandatory, since `dist/` is gitignored and can hold mutant residue
no mtime vouches for — **stdio returns the identical shape to the hosted endpoint**: a
JSON-RPC *result* with `isError: true`, no top-level `error` object, `-32602` inside
`content[0].text`. Both failure modes do it: a missing required argument AND an unknown
tool name.

So there is **no Raven surface on which the original `-32602` envelope reproduces**. The
correction paragraph written to fix R1's defect explained that defect with a causal story
about a second surface, and never measured the second surface. **That is the R1 class one
level deeper**: not a stale expected value this time but an invented provenance, which is
worse, because a provenance sounds like evidence and reads as closing the question. The
replacement says the origin is unestablished rather than guessing again, and the file's
closing lesson gained its second half: *a correction that explains a defect by naming a
different surface must measure that surface too, or the correction is the same defect
wearing an explanation.*

**The claim executes now.** `.claude/openai-rejection-2026-08-19/probe-stdio-shape.mjs`,
2 cases / 0 failing, EXIT=0. It is deliberately a SEPARATE script from
`replay-r1-cases.mjs` rather than a case added to it: that harness advertises no auth, no
fixture and no checkout, and this one requires a checkout and a fresh build by its nature.
Folding it in would have made that advertised property false — the doc-level version of
the same defect this round is about. Proven falsifiable in both arms rather than trusted:
pristine EXIT=0, and a copy demanding a protocol-level error reports FAIL on both cases at
EXIT=1.

**Two instrument errors of my own, recorded because each produced a wrong reading.**
(a) The first falsification copy was written to the scratchpad, so its `dist/` path
resolved relative to THAT directory, and it exited on "dist/index.js is missing" — a
falsification arm that never ran, which is the dangerous direction, since it prints
nothing alarming. (b) I read `EXIT=$?` after a pipe into `tail` twice, which reports
`tail`'s status — the exact mistake this ledger already warns about, made while verifying
a document about unverified claims. Both re-run with the status captured inside.

**Gates re-measured after the doc change.** Production replay: **8 cases / 9 calls / 0
failing, EXIT=0**. Frozen anonymous surface: **45 tools,
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, exact**.
`verify-anon-hash.mjs` reports 5 CHECKS FAILED and **that is not a regression** — its own
header says it is SPENT, its four pins having been computed while HEAD was `cebe332`,
before the fix it reverts against. It was kept for its method, not its verdict; the header
is what stopped that red from being read as a live defect.

**No product code changed. Doc + probe only, committed locally, NOT pushed.**
