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
