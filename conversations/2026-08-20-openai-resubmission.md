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
