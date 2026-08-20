# OpenAI plugin-directory rejection — forensics and fix plan

2026-08-19. Raven 1.0.0 was submitted to the OpenAI plugin directory 2026-07-26 and
**rejected**. Andrew: "Graph engineer a workflow to see why OpenAI rejected Raven and fix it."

## The rejection, verbatim

- **R1** — "One or more of your test cases did not produce correct results. Please re-run all
  submitted test cases and align tool behavior/output with the documented expected outcomes.
  Ensure the same test cases pass consistently on both ChatGPT web and mobile."
- **R2** — "One or more of your tool's annotations do not appear to match the tool's behavior.
  Please confirm annotations are explicitly set to true or false (not null) for every tool.
  Include a clear justification for why the hint is set that way based on the tool's actual behavior."

The reviewed surface is the **anonymous** `https://mcp.ravenmcp.ai/api/mcp` endpoint — 45 tools —
not the 111-tool stdio build. Every finding below is scoped to those 45.

## The graph

`.claude/openai-rejection-2026-08-19/rejection-forensics.workflow.js` — 3 phases
(Evidence / Refute / Synthesize), 4 parallel `sonnet` lenses (testcases, annotations,
web-vs-mobile, policy), then a `pipeline()` refute stage running two adversarial angles
(`reproduce`, `relevance`) per finding, then an `opus` synthesis leg. Read-only on the repo by
hard scope limit; scratch under the gitignored `.claude/**/agent-output/`.

- run id `wf_22ebef51-3bd`, **43 agents / 6,509,335 subagent tokens / 363 tool calls / ~16.8 min**
- output file: `/private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/cb441317-6661-4bb8-8fcb-9b4edf7564f5/tasks/w5ec80xo3.output`
- extraction (the file WRAPS the payload — the root is not the result):
  `node -e '…JSON.parse(raw.slice(raw.indexOf("{"))).result…' <file>`
- 4/4 lenses alive, 0 dead, 0 thin. **19 raw → 19 deduped → 17 confirmed, 0 unproven, 2 refuted.**

**Instrument limits, stated rather than buried.** 3 refute agents died on
`StructuredOutput retry cap (5) exceeded`, leaving `p2-tap-targets-latency-risk`,
`transport-strict-accept-header` and `outputschema-recommended-not-required` as single-vote
confirms. 4 more hit a rate-limited safety classifier. And the voting rule resolves a
1-confirmed/1-refuted tie to **confirmed**, so several "confirmed" verdicts below are weak.

## Root cause — R2 (this one is established)

**CONFIRMED MISMATCH, and it is the blocker.** `audit_page`, `score_page` and
`audit_typography` are published with `openWorldHint: true` on the anonymous endpoint OpenAI
reviewed — while on that exact surface they cannot reach the network at all.
`REMOTE_ARG_GUARDS` (`src/index.ts:1984`) rejects a `url` argument **pre-handler**
(`src/index.ts:2262`) with `isError: true`. Live calls confirm it: `audit_page{url}` returns
"audit_page url-capture is disabled on the hosted (remote) endpoint".

The cause in code is structural: `TOOL_OPEN_WORLD` (`src/index.ts:2151`) is one flat array and
`toolAnnotations()` (`src/index.ts:2174`) takes only a tool NAME — it has no notion of which
surface it is registering for, so stdio's truth is published verbatim where it is false. The
submission's claimed 8/37 open-world split is wrong for the reviewed surface; the true set there
is the 5 in `REMOTE_URL_GUARDED_TOOLS`, i.e. **5/40**.

Contributing: all 45 anon tools carry byte-identical `readOnlyHint:true`/`destructiveHint:false`,
varying only `openWorldHint` — and the 135 justification fields are exactly 3 × 45. That reads as
a template fill rather than per-tool assessment, which is precisely what R2's second sentence asks for.

Narrowing, do NOT over-weight: `idempotentHint` is absent on all 45, but current OpenAI docs list
it **Optional** (Required = readOnly/destructive/openWorld). Whether it was Required on
2026-07-26 is UNPROVEN. Adding it is cheap insurance, not the primary lever. `outputSchema`
absence (0/45) is documented as "should declare" and is not established as an R2 driver.

## Root cause — R1 (three non-exclusive mechanisms, none certain)

No OpenAI harness artifact is readable and the only record of the submitted cases is our own
session log, so which case failed is unknown.

**(a) Value drift.** P1's expected "373 text elements / 373 AA passes / 0 failures" no longer
reproduces: `audit_contrast` on `https://ravenmcp.ai` returns **344** today, because the marketing
site was redeployed repeatedly after 2026-07-26. Pass/fail composition drifted too — many rows now
`"status":"indeterminate"`, `indeterminate_reason: "ancestor-opacity"`. Drift confirmed; the
reviewer's observation of it is unproven, since their re-run date is nowhere on record.

**(b) Payload and latency fragility**, on exactly the two url-mode cases. P1 returns a single
**412,915-char / 457,881-byte** blob (645 selector rows) in **12.3s**. P2 takes **40.9s**.
`audit_url` — not submitted, but present on the surface — takes **95.2s** in its cheapest
single-viewport/single-theme configuration and **>120s** with defaults. No OpenAI page publishes a
numeric size or timeout ceiling (verified against developers.openai.com/apps-sdk); the ~60s
timeout and ~72–75k-token truncation figures rest on convergent community reports. But "consistently
on both web and mobile" is the exact signature of a size/latency-sensitive result.

**(c) Negative-case scope collision.** `list_creative_models`' description advertises image/video/3D
capability slots whose execution tool (`create_generation_job`) is not on the anon surface at all;
`get_brand_principles` names "logos" as a trigger keyword; the a11y audits name real WCAG success
criteria (~2 of ~50) with no scope disclaimer.

P3, P4 and P5 reproduce their submitted values exactly (`get_principles` 28;
`list_design_systems` 12 with Stripe `color.primary` `#635BFF`; `get_checklist` landing-page),
all at ~0.15–0.2s.

## PROMOTED FINDING — `audit_contrast` is intermittently broken

Both refute agents independently observed, on the exact submitted P1 call, across 6 attempts:
`isError: true` with "page.evaluate: Target page, context or browser has been closed",
"page.goto: net::ERR_INSUFFICIENT_RESOURCES", and "audit_contrast url mode needs headless
chromium" — with only SOME calls returning 344. This is the best fit for "did not produce correct
results … consistently", and it appeared only inside refuter `counter_evidence`, never itemised as
its own finding. It is promoted here to first-class and still needs diagnosis (headless-Chromium
crash / resource exhaustion on the shared serverless endpoint).

## The 19 actions

Repo code (claude): (1) thread the surface flag — `toolAnnotations(toolName, remote)`, deriving the
remote open-world set from the guard table so the two can never drift; (2) emit `idempotentHint`
explicitly per tool; (3) `outputSchema` on the numeric-output tools; (4) shrink `audit_contrast`
url-mode output; (5) narrow `list_creative_models`' description; (6) WCAG-scope disclaimers;
(9) relax the transport `Accept` check so `application/json` alone does not 406; (10) full suite +
`node scripts/sync-manifest-tools.mjs` after the build.

Andrew-gated: (7) DECISION — `audit_url` at 95.2s minimum cannot complete inside any plausible
timeout; option (a) apply the same url arg-guard (hash-safe, recommended) or (b) drop it from the
anon surface, **which changes the frozen 45-name hash**; (8) implement whichever; (11) push `main`
— this IS the live-endpoint deploy, no agent may do it; (15) rewrite the 135 justifications
per-tool; (16) rewrite the 3 negative cases to expect a decline-with-scope-explanation;
(17) ask OpenAI for the real size ceiling and timeout, and whether web and mobile differ;
(18) check whether the form wants a well-known/manifest URL (all candidates 404 today); (19) resubmit.

Deploy-time (claude): (12) re-verify the live anon surface after READY — 45-name sha256 still
`f64bb18…`, `openWorldHint:false` on the three tools, `idempotentHint` present and boolean 45/45;
(13) re-baseline every test case against the DEPLOYED endpoint with `curl -w time_total`;
(14) re-point P1 and P2 at a PINNED `html` fixture, which removes both the drift and the latency
mechanism from the graded path.

## Resubmission blockers

1. P1's stored expected value (373) is dead — 344 today; resubmitting it guarantees an R1 repeat.
2. `openWorldHint:true` on the three guarded tools — the single finding matching R2's wording
   literally. Must be fixed in code AND deployed.
3. `audit_url` at 95.2s / >120s — Andrew's decision; removal breaks the frozen hash.
4. `audit_contrast(url)`'s 412,915-char payload.
5. The 135 template justifications.
6. None of the code fixes reach the reviewed surface without Andrew pushing `main`.
7. We could not establish what the harness actually observed — a second R1 rejection stays possible.

## Open questions

`idempotentHint`'s Required/Optional status on 2026-07-26 · OpenAI's real size ceiling, timeout,
and whether web and mobile differ · which positive case failed and on which client · whether
N1/N2/N3 passed · the reviewer's re-run date relative to the redeploys · whether the form wants a
manifest URL · which of the 36 destructive tools are genuinely idempotent.

## Refuted — do not carry forward

`get-principles-response-size` (65,867 bytes, but no documented cap) and
`support-contact-not-a-dedicated-page` (the privacy page's embedded address plus the GitHub issues
link satisfies the requirement).

## Measured facts for the fix

`TOOL_ACCESS` holds **112** entries — **36 destructive, 76 readOnly**. Every one of the 36 is in
`REMOTE_GATED_TOOLS`, so **none is on the anon 45**: the reviewed surface is entirely read-only,
which makes `idempotentHint: true` honest and uniform there. For the 36 stdio-only destructive
tools the hint is set from an explicit table that **defaults to false** — under-claiming
idempotency can never be the behaviour mismatch R2 punishes, over-claiming can.

Observed and reported, not acted on: `decision_get` and `decision_list` are classified
`destructive` in `TOOL_ACCESS` despite being reads. Arguably its own annotation mismatch, but
conservative in direction and not on the reviewed surface.

---

## Code change — R2 fixed locally (appended after this log's first write)

**Files changed: `src/index.ts` only.** `manifest.json` was regenerated and came back
byte-identical (it carries names and descriptions, not annotations). Nothing committed,
staged, pushed or published.

### What changed

1. `TOOL_OPEN_WORLD` keeps its 12 entries and gains a header saying the list is the
   **stdio truth and is false on the hosted endpoint** for three of its members.
2. New `remoteBlocksNetwork(toolName)` reads `REMOTE_ARG_GUARDS` directly and answers
   whether the hosted endpoint blocks a tool's only route to the open web. The remote
   answer is **derived, never a second list** — lift a guard and the annotation follows
   it in the same edit.
3. New `TOOL_IDEMPOTENT` table, 36 destructive tools, **default false**. Under-claiming
   idempotency costs a client one retry it chose not to make; over-claiming is exactly
   the annotation-does-not-match-behaviour finding this file exists to prevent. All 36
   are in `REMOTE_GATED_TOOLS`, so the table describes the stdio surface only.
4. `toolAnnotations(toolName, remote)` returns **all four hints explicitly**, every one
   a real boolean. The new `remote` parameter is load-bearing, not decoration.

### Measured, not inferred

Two **separate processes**, because the `setRemoteRuntime()` latch is one-way:

    [stdio]  tools=111  missing_hints=0  non_boolean=0
    [remote] tools=45   missing_hints=0  non_boolean=0
             name-sha256=f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
             openWorld=true (5): audit_contrast, audit_responsive_visibility,
                                 audit_tap_targets, audit_url, audit_video_playback

The remote name-hash is an **exact match for the frozen anon hash**. `0 missing / 0
non-boolean` on both surfaces is literally what R2 asked for.

**Whole-payload diff** against the pre-change cached live response
(`agent-output/anon-tools.json`, 63,641 B), because the name-hash under-specifies:

- 45 vs 45 tools, **name diffs NONE, description diffs 0**, input schemas untouched
- all 45 gain `idempotentHint` — it was **absent**, i.e. `null`, before
- exactly **3** `openWorldHint` flips true to false: `audit_page`, `score_page`,
  `audit_typography` — the three `REMOTE_ARG_GUARDS` rejects `url` on

The 5 unpushed commits touch only `src/design-gauntlet.ts`, and `design_gauntlet` is
remote-gated, so they cannot move the anon payload; the diff isolates this change.

### Suite

`RAVEN_NO_USAGE_LOG=1 npm test` gives **1607 tests / 1604 pass / 0 fail / 3 skipped**,
`EXIT=0` written inside the log file. The **+38 over the ledgered 1569 is not this
change** — read by parts, exactly one test file has moved since that measurement
(`test/design-gauntlet.test.mjs`, across six committed Sol gauntlet rounds), and
`git diff --name-only HEAD -- test/` is empty. The **3 skips are the same three, read
individually** at output lines 109 / 782 / 783 (the file-URL fallback notice and the two
removed-capability phase2 tests). Zero failure lines. No count-asserting suite moved,
because this adds no tool.

### Still open

R1 is untouched. The intermittent `audit_contrast` failure is still undiagnosed and is
the best fit for "did not produce correct results ... consistently". The drifted expected
outputs (P1 373 to 344, P2 at ~41s), the `audit_contrast` payload size, the
`list_creative_models` description, the WCAG scope disclaimers, `outputSchema`, and the
transport `Accept` relaxation are all unstarted. **The push to `main` deploys the live
endpoint and is Andrew's call; `npm publish` is Andrew-only.**

---

## R1 recon — measured facts from reading the source (2026-08-19, post-R2)

All read-only. Every line below is a direct read, not an agent report.

**`src/index.ts:4456–4496` — the `audit_contrast` registration is where all three R1 mechanisms are visible at once.**

1. **The 412,915-char blob is PRETTY-PRINTED.** Both success branches return
   `JSON.stringify(ct, null, 2)`. A meaningful share of the payload is indentation
   whitespace on ~645 selector rows. Dropping the `null, 2` argument is a zero-risk
   first cut; the real fix is summary + failing rows, full rows behind an opt-in.
2. **`auditContrastUrl(url)` is called with NO opts**, so the viewport/theme/timeout
   parameters the function accepts are unreachable from the tool and `timeout` is the
   30000ms default.
3. **`CaptureUnavailableError` returns a NORMAL text result, not `isError: true`** —
   "audit_contrast url mode needs headless chromium…" is delivered as a SUCCESS. So is
   the no-argument branch ("Provide either url or dom_snapshot"). The dossier's negative
   case 2 documents this class for `audit_page`; it applies to `audit_contrast` too, and
   here it lands on the exact tool the reviewer's P5 case exercises.

**`src/browser-launch.ts` — the intermittency surface.**

4. **`browserConcurrencyCap()` defaults to 2** (`RAVEN_BROWSER_MAX_CONCURRENCY`). Two
   full Chromium instances inside one serverless container is the leading mechanism for
   the observed `net::ERR_INSUFFICIENT_RESOURCES` and
   `Target page, context or browser has been closed`.
5. **A slot LEAK is ruled out.** `auditContrastUrl` closes the browser in a `finally`,
   and `wrapRemoteBrowser`'s `close` override runs `release()` in its own `finally`.
   Cleanup is correct; resource PRESSURE is the live hypothesis, not accounting.

**Two greps that settle open findings.**

6. **`grep -rn "outputSchema" src/` returns EMPTY** — "no outputSchema anywhere" is now
   directly measured rather than inferred.
7. **No Accept-header check exists in `api/mcp.js`** — the only `Accept` match in the
   file is the 405 message string. The `transport-strict-accept-header` finding (a
   single-vote confirm; its refuter died on the StructuredOutput retry cap) is UNLOCATED
   in repo code. Locate it in the MCP SDK transport or refute it before editing anything.

**One unresolved inconsistency.**

8. `src/contrast.ts:568` sets `ELEMENT_CAP = 600`, yet the measured P1 response reported
   **645** selector rows. Not yet explained; resolve before quoting either number.

### Item 8 RESOLVED — 645 rows vs ELEMENT_CAP=600 was never a cap violation

Read `src/contrast.ts` directly. Two facts settle it:

1. The collection loop (`src/contrast.ts:775-799`) pushes exactly ONE result object
   per element and breaks on `results.length >= cap`. `ELEMENT_CAP = 600`
   (`src/contrast.ts:568`) genuinely holds; no path pushes twice.
2. `ContrastResult` exposes THREE overlapping row arrays — `rows`, `aa_failures`,
   `indeterminate_bg_rows`. The latter two are subsets of `rows` duplicated
   VERBATIM as full row objects, each carrying its own `bgLayers`/`bgColors`.

So the measured "645 selector rows" counted `"selector"` occurrences ACROSS ALL
THREE ARRAYS, not audited elements. The cap is fine; the measurement named a
different quantity than it counted.

Why it matters more than the bookkeeping: it relocates the payload-bloat root
cause. The 412,915-char blob is redundant BY CONSTRUCTION, roughly 1.5-2x, BEFORE
`JSON.stringify(x, null, 2)` inflates it again. Dropping the pretty-print argument
is the cheap half of the fix, not the whole fix.

CONSTRAINT ON ACTING — measured, not assumed. Deleting the duplicate arrays from
the type is a BREAKING change with real coverage:
  - `test/contrast.test.mjs:261` and `:675` assert an EXACT required-keys list
    naming all three arrays.
  - `src/audit-dispatch.ts:376` reads `aa_fail_count`; `:278`/`:288` read it and
    `indeterminate_bg_count` through the generic count extractor.
  - `test/audit-dispatch.test.mjs:184` and `test/contrast-polish-closure.test.mjs`
    (:65, :69, :107) read `aa_failures[...]` members directly.
Therefore the surgical fix keeps `ContrastResult` INTACT and changes only what the
`audit_contrast` handler SERIALIZES. Response shape and internal type are two
different decisions; conflating them is what makes the cheap fix look expensive.

Method note: the inconsistency was logged "not yet explained" rather than settled
by picking whichever number read better. One pass over the source resolved it and
produced a better fix than either number would have.

### R1 fixes 1 and 2 applied ahead of their adversaries — both came back with real defects

Two edits landed before their adversary verdicts were read. That ordering is the
finding. Both verdicts returned needs-revision, and on reading the code directly
BOTH P0 objections were CONFIRMED rather than merely plausible.

CONFIRMED P0 (intermittency) — the src/contrast.ts edit was a REGRESSION on
score_page. src/index.ts:4200-4202 caught the contrast call with
`if (!(contrastError instanceof CaptureUnavailableError)) throw contrastError;`,
and the outer catch only special-cases CaptureUnavailableError before rethrowing.
Laundering capacity-busy USED to make score_page degrade to a DOM-only score;
rethrowing it unchanged made it a hard failure on one of the anonymous 45 and on
reviewer positive case P4 — never in the reviewer's failing set. src/audit-url.ts
:425-428 degrades gracefully, so audit_url was unaffected. That asymmetry across
callers of one function is this repo's own two-copies-of-one-rule drift class.

FIXED by enumerating all four callers of auditContrastUrl and deciding each
deliberately rather than uniformly:
  - audit-url.ts:325   degrade + warnings.push        (pre-existing, correct)
  - score_page:4200    degrade + capture warning       (FIXED — supplementary
                       enrichment; the DOM scorer already has its answer)
  - audit_contrast:4485 isError:true on capacity busy  (fixed earlier)
  - audit_taste:8263   isError:true on capacity busy   (FIXED — deliberately NOT
                       the score_page treatment: delegated contrast rows feed
                       pageIssues, which feed the BLOCK/WARN/PASS verdict, so
                       degrading would report PASS on a page whose contrast was
                       never measured. A false all-clear is the forbidden outcome.)

CONFIRMED-BUT-NARROWER P0 (payload-size) — the earlier "in-process consumers read
the object" check was incomplete. The `audit` dispatcher (src/index.ts:8500-8511)
calls the REGISTERED HANDLER and JSON.parse()s its text into findings.contrast, so
an over-the-wire audit(url) caller does lose findings.contrast.rows. Measured
impact is smaller than the adversary framed it: `.rows` appears NOWHERE in
src/audit-dispatch.ts; severityCounts() reads only aa_fail_count and
indeterminate_bg_count, both preserved; audit-dispatch.ts:375 reads
aa_fail_count, preserved; test/audit-dispatch.test.mjs:183-184 assert
aa_fail_count and aa_failures[0].foreground, both preserved and driven through
the untouched dom_snapshot path. Disposition: ACCEPT the trim, and the trim's
comment — which claimed all consumers read the object — is corrected in place to
name the dispatcher as a third consumer that reads the STRING. Losing rows[] over
the wire IS the payload fix, since those rows were the bulk of the 412,915 chars.

CLOSED: outputschema — adversary STANDS, 0 problems, verified against SDK 1.29.0
source. do-not-apply is correct and final.

Graph: the iserror spec DID return (journal 21/22, apply-with-caution) — ~9 known
return sites each needing a one-line isError:true, no shared-mechanism rewrite.
Its refute leg (a580d47ef150aaeae) is running.

Suite after fixes 1+2: 1607 / 1604 pass / 0 fail / 3 skipped, EXIT=0, skips read
INDIVIDUALLY (file-URL fallback + the two phase2 removed-capability tests).

Still true: nothing committed, nothing pushed, nothing published.

---

## Accept-header item: nearly dismissed on a wrong read, then confirmed

The adversary for this item was the PLACEHOLDER (journal 18, attacked:"test"), so it
was hand-verified instead. That verification went wrong once and the correction is
the entry worth keeping.

`api/mcp.js` imports the NODE transport
(`@modelcontextprotocol/sdk/server/streamableHttp.js`), and grepping that file for
`acceptHeader` / "Not Acceptable" returns NOTHING — matches exist only in
`webStandardStreamableHttp.js` (`:188-189` GET, `:379-380` POST). I read that as the
item being REFUTED. It is not: `esm/server/streamableHttp.js` is a 160-line WRAPPER
(750 lines in webStandard) that imports `WebStandardStreamableHTTPServerTransport` at
`:10`, constructs it at `:52`, and forwards every request at `:60` and `:136`. So the
unconditional 406 IS live on the shipping path.
**LESSON: absence of a check in a file is not absence of the check — read the
delegation before concluding a refutation.**

FIXED (`api/mcp.js`): normalize `req.headers["accept"]` to
`"application/json, text/event-stream"` immediately before `buildServer({remote:true})`,
whenever it is missing or lacks either type. Safe because this endpoint is stateless
and never opens an SSE stream (`sessionIdGenerator: undefined`, `enableJsonResponse:
true`), so accepting `text/event-stream` on the client's behalf promises nothing we do
not deliver. `enableJsonResponse` does NOT bypass the check (`_enableJsonResponse` is
read only at `:474/:702/:722`, all downstream of the rejection).
`node --check api/mcp.js` -> SYNTAX_OK. `api/mcp.js` is not TypeScript and is not
built into `dist/`, so no rebuild was required for it.
Note `*/*` — an ordinary client default — ALSO fails that gate today, since the SDK
uses a substring `includes()` test.

## Workflow complete; both remaining journal entries read

`wmw2mxwww` / `wf_9f23fe54-530`. 13 agents, 13 done, 0 errors, 0 skipped, 0 empty,
2,338,775 subagent tokens, 301 tool uses, 1,244,151 ms.
health = `{items:6, deadSpecs:0, deadVerdicts:0, gaveUp:[]}` — the synthesis CORRECTS
that: the accept-header adversary (journal 18) was a placeholder, so item 1 is
adversarially UNVERIFIED even though its mechanism is hand-proven.

Journal 26 = opus synthesis, an ORDERED APPLY PLAN. Ranking:
 1 APPLY accept-header (done)
 2 APPLY isError, `audit_url` all-captures-failed case (done)
 3 APPLY isError mechanical additions (done)
 4 HOLD intermittency cap 2->1 — Andrew's call; edit #1 already landed makes
   capacity-busy VISIBLE, and cap 1 makes it MORE FREQUENT. Serializing may convert
   a flaky wrong answer into a reliable timeout, which reads to a reviewer the same
   way. Measurement question, and ChatGPT's tool-call timeout is unknown.
 5 HOLD/rewrite descriptions — the spec's own replacement text was WRONG: it merged
   three sentences into one 197-char sentence, and `shortDescription()`
   (`scripts/sync-manifest-tools.mjs:146-156`) takes only the FIRST SENTENCE and
   ellipsis-truncates at 120, so `manifest.json` would become a mid-phrase fragment
   and `test/manifest-tools.test.mjs:10-17` deepEqual would go red.
 6 DO NOT APPLY outputSchema — closed.

Journal 24 = isError adversary, needs-revision, 3 problems. Problem 2 is the one
that matters and it is a real correction to my own model of the codebase:
**the SDK ALREADY converts any THROWN handler error into `isError:true`.**
`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:118-139` wraps the
whole request in try/catch and returns `createToolError(...)` -> `{content, isError:true}`.
Verified by reading the SDK source directly. So the P1-observed failures
(`page.evaluate: Target page, context or browser has been closed`,
`net::ERR_INSUFFICIENT_RESOURCES`) are ALREADY isError today — `audit_contrast`
rethrows them (`src/index.ts:4499-4502`). Only RETURN-shaped soft errors needed
patching. Problem 1 (blocker) = the spec's own headline case (`audit_url`) had NO
executable edit; problem 3 (minor) = `audit_page`/`score_page` chromium branches were
omitted. Both are now fixed.

## Edits applied

`src/index.ts`:
 (A) `audit_url` handler (~:4611): `captures.length === 0` -> `isError:true`, with a
     comment stating the predicate is `captures.length` and deliberately NOT
     `warnings.length` (3 viewports x 2 themes per call, `audit-url.ts:93-99`, so
     warnings are routine and the partial degrade at `audit-url.ts:174` is the design).
 (B) `isError:true` added to 12 soft-error RETURN sites: 8 single-line
     "needs headless chromium"/"Playwright chromium not available" returns, the 2
     multi-line "Playwright chromium not available" blocks (`audit_page` :3993,
     `score_page` :4216), and the 2 multi-line "Provide either html or url" blocks
     (:4009 audit_page, :4232 score_page). Every anchor uniqueness-asserted in the
     patch script; the two byte-identical pairs asserted at count==2.
 (C) `list_creative_models` description (:6700): third sentence
     "Use a configured RAVEN_CREATIVE_RUNNER to route jobs to any local CLI or API
     wrapper." -> "Each entry lists typical inputs and best-for guidance."
     SENTENCE 1 LEFT BYTE-IDENTICAL on purpose.
`web/app/docs/page.tsx:1174` — same sentence swap on the docs mirror.

`npm run build` EXIT=0. `node scripts/sync-manifest-tools.mjs` ->
"Synced 111 tools into manifest.json", and `git diff --stat manifest.json` is EMPTY
— the byte-identical-first-sentence trick held, so manifest did not move and
`test/manifest-tools.test.mjs` stays green.

## The one regression, and why the rebaseline is legitimate

That batch turned the suite red at 1607 / 1603 / **1 fail** / 3 skipped, EXIT=1:
`authed startup tuning appears only on store-backed remote metadata`
(`test/taste-remote-full.test.mjs:98`), failing at `:103` — the
`ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH` pin.

Two mechanical notes. The extraction that found it had to use `✖` — `node --test`
does not emit TAP `not ok`, and my first awk pattern returned nothing, which is
indistinguishable from "no failures printed". And the two hashes asserted immediately
ABOVE the failing line — `GOLDEN_45_HASH` (names) and `ANONYMOUS_INSTRUCTIONS_HASH`
— both passed, which already localized the change to description TEXT.

That pin's own comment says it "guard[s] against authed tuning leaking into an anon
build, not against the text changing", and it carries two prior rebaselines
(2026-07-26, 2026-08-07). So this is a legitimate rebaseline — but it was MEASURED
rather than asserted: a script rebuilt the anon payload and substituted ONLY
`list_creative_models`' previous description back in, reproducing the old pin
`fda3c22d…961e2d` byte-exactly. That is what proves no other description moved.
New pin `2337775946122e3019e990939b2cb46c27daa65b0fb327c19c91305b105fdbd7`, with
that reasoning written above the constant.

Suite after the rebaseline: **1607 tests / 1604 pass / 0 fail / 3 skipped, EXIT=0**
(`/tmp/suite-rebaselined.log`), the 3 skips read INDIVIDUALLY at lines 109/782/783 —
the same three (file-URL fallback + the two phase2 removed-capability tests).

Two-surface annotation probe re-run, one process each:
`[remote] tools=45 missing_hints=0 non_boolean=0`,
name-sha256 `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`
(the frozen golden, UNMOVED), `openWorld=true (5)`;
`[stdio] tools=111 missing_hints=0 non_boolean=0`, `openWorld=true (12)`.
The whole-payload property has CHANGED shape and is now stated deliberately rather
than carried forward: names are unchanged, annotations changed on all 45 (as before),
and descriptions are no longer 0 — exactly ONE description differs, by design.

Still true: nothing committed, nothing pushed, nothing published.

---

## Segment 3 — second workflow, dead leg, Sol verdict

### Workflow #2 (`r1-testcases.workflow.js`) — 7/7 agents, ONE DEAD LEG

Task `whm53d5e1`, run `wf_731b6901-61a`. Reported `agents_done: 7`,
`agents_error: 0`, `agents_empty_result: 0`, `nulls: 0`. **All four counters were
green and one leg was dead.** Leg C (positive-case size/latency) returned
**89 characters**:

> "I'll stop checking now and wait for the Monitor notification to arrive before continuing."

Its adversary correctly returned `REFUTED — nothing to reproduce`. Detected by
reading the load-bearing field of EVERY leg out of `journal.jsonl` — result
lengths in positional order 6914 / 5059 / **89** / 1129 / 4069 / 2900 / 11053 —
not by any counter. **`agents_empty_result: 0` and `nulls: 0` cannot see a leg
that returns a status line instead of a report.** The standing screen is
null AND incomplete; this is the incomplete half arriving in a run where the
null half was clean.

### `git diff` vs `git diff HEAD` — the audit diff was truncated by a third

`src/index.ts` is `MM` (staged AND modified). Bare `git diff` reads
worktree-vs-index and therefore **omits the staged half**: first capture was
304 lines with `src/index.ts | 103 +++`. Re-captured with `git diff HEAD --` →
**450 lines**, `src/index.ts | 215 +++`. Caught BEFORE launching the
falsification pass, so Sol audited the complete change. Had it not been caught,
Sol would have come back clean for the wrong reason — the strongest possible
false negative.

### R1 root cause — NAMED

The dossier documented **fixed numbers taken off a live surface**.
`audit_contrast` on a live URL has returned a tri-state (pass / fail /
**indeterminate**) since commit `488b315` (2026-07-18) — **one week before the
dossier was written** — so the documented "373 text elements / 373 AA passes /
0 failures" was already unreproducible on the day it was written, and drifts
again today because the page changes. **The fix is to document INVARIANTS, not
captured numbers.**

### Not established, carried forward as open

- **N1 (`ERR_NAME_NOT_RESOLVED`) is UNVERIFIED and stays that way on this host.**
  Under `buildServer({remote:true})` on macOS the `@sparticuz/chromium` binary is
  a Linux/Lambda ELF and fails `spawn ENOEXEC` in ~117–195 ms, *before* DNS
  resolution is attempted; `capture.ts`'s catch-all folds that into the generic
  "Playwright chromium not available". The adversary independently reproduced the
  ENOEXEC and confirmed the leg was RIGHT to refuse to report it as a DNS result.
  Needs a Linux host or the live Lambda runtime.
- **The 373 → 344 denominator drop is inference, not measurement** — the code
  path was proven architecturally incapable of moving `total_text_elements`.
- **The synthesis emitted specific measured values for positive cases P2–P5, and
  the leg assigned to measure them is the one that died.** Provenance
  unestablished. Pasting them into a resubmission dossier would reproduce the
  exact R1 failure OpenAI cited. Every one must be independently re-measured.

### Sol falsification pass — 8 OBJECTIONS, 6 independent confirmations

`codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium -c 'mcp_servers={}'`,
detached, pid 81084, 7267 lines, 200,973 tokens.

Confirmed independently (not taken on my word): the SDK transport delegation and
the unconditional two-substring POST gate; that the SDK already returns
`isError` for THROWN errors; that `list_creative_models`' first sentence is
unchanged and `manifest-tools` passes; **all four hashes re-derived from its own
probe**, including the old-description substitution reproducing `fda3c2…1e2d`;
and 45 tools with zero missing / zero non-boolean hints over a real
`tools/list`.

Objections, as filed:

1. **R2 is TWO requirements and only one is fixed.** Explicit booleans ship; the
   per-tool behavioral justification does not exist anywhere — not in
   `tools/list`, not in the dossier, not in a test.
2. **Dossier line 79 now documents the wrong expected result** — it states
   `audit_page` with neither input returns plain text WITHOUT `isError`, which
   the diff changed. Another documented-output mismatch under R1.
3. **The anonymous scope collision survives in three more places.**
   `list_creative_models` still RETURNS `execution.runner_env:
   "RAVEN_CREATIVE_RUNNER"` while `create_generation_job` is absent remotely
   (probe: `list_creative_models:true`, `create_generation_job:false`); and
   `score_page` and `audit_typography` descriptions both still say "pass url"
   while `REMOTE_ARG_GUARDS` rejects exactly that.
4. **Six more return-shaped soft errors were missed** — `audit_contrast`,
   `suggest_contrast_fix`, `audit_typography`, `audit_tap_targets`,
   `audit_video_playback` missing-both-inputs, and `get_pattern` unknown id.
5. **`captures.length === 0` misses materially incomplete audits** — one
   successful capture out of six returns success while the summary still claims
   "3 viewports × 2 themes".
6. **`audit_contrast(url)`'s payload trim contradicts its own description**,
   which still promises ratios "for every text element".
7. **`score_page(url)`'s widened catch now swallows every contrast failure**,
   not just `CaptureUnavailableError` — a real regression returns a successful,
   potentially inflated score.
8. **The Accept normalization applies to any object-shaped POST**, including
   non-MCP ones that previously got the SDK's 406. Low severity; MCP-only
   endpoint.

Sol's own limit, stated by it: `audit-url` skipped 9/9 browser cases, `contrast`
4, `score-page` 2, all for absent Chromium. Its green targeted runs are
therefore narrower than they look.

---

## Fix legs applied (objections 3–8) — 2026-08-19, uncommitted

Every edit below is in the worktree only. Nothing is committed, nothing is
pushed, nothing is published. Pushing `main` deploys the live endpoint and is
Andrew's call in the current conversation.

### Objection 4 — six missed `isError` sites (APPLIED)

`isError: true as const` added to the return-shaped soft errors in `get_pattern`
(unknown id), `audit_contrast`, `suggest_contrast_fix`, `audit_typography`,
`audit_tap_targets`, `audit_video_playback`. The MCP SDK (1.29.0) already emits
`isError` for THROWN errors via `createToolError(...)`; only the return-shaped
soft errors needed it. Twelve earlier sites were fixed in the preceding leg.

### Objection 7 — `score_page(url)` swallowed every contrast failure (APPLIED)

The widened catch degraded on ANY contrast error, not just
`CaptureUnavailableError`, so a genuine regression came back as a clean,
potentially inflated score. Fixes:

- programming errors (`TypeError` / `ReferenceError` / `RangeError`) are
  rethrown; everything else still degrades,
- the failure reason is captured into `captureWarnings`,
- a post-`scorePage` block rewrites `result.contrast` to
  `{ assessed: false, pass_count: null, fail_count: null, indeterminate_count: null, note: … }`.

**Self-caught defect in my own first version, worth recording.** That block was
originally gated on `contrastFailure !== null`, with an `else` stamping
`assessed: true`. In **html mode** no contrast pass is attempted at all, so the
`else` would have stamped `assessed: true` on a `0/0/0` result — a false
all-clear one layer over the one being fixed. The gate is
`typeof scoreContrast === "undefined"` now, with a distinct html-mode reason
string. Verified by printing the block back off disk, not from the edit's
self-report.

### Objection 6 — `audit_contrast(url)` description contradicted its payload (APPLIED)

Sentence 2 now states the url-mode response shape (counts + `aa_failures` +
`indeterminate_bg_rows`, per-element PASSING rows omitted). Sentence 1 left
byte-identical on purpose — `scripts/sync-manifest-tools.mjs:146` takes only the
first sentence, so `manifest.json` does not move.

### Objection 3 — anonymous scope collision in three places (APPLIED)

The hosted endpoint rejects `url` via `REMOTE_ARG_GUARDS`, while three surfaces
advertised it anyway. All three use the `generate_design_system` house pattern
(`src/index.ts:5337`) — `(remote || isRemoteRuntime())`, the `isRemoteRuntime()`
half included because the latch is one-way per process:

1. `score_page` description — remote text says the url argument is REJECTED here.
2. `audit_typography` description — sentence 1 still says "(pass url)" **on
   purpose**, because rewriting it would move `manifest.json`; the closing
   sentence carries the remote truth instead.
3. `list_creative_models` handler — the `execution` / `runner_env` /
   `runner_contract` block is omitted from the remote response body. The runner
   contract is only actionable where `create_generation_job` exists, and that
   tool is not registered remotely.

### Objection 5 — incomplete audits claimed full coverage (APPLIED, and ESCALATED)

Sol named the `captures.length === 0` predicate in `src/index.ts`. Reading
`src/audit-url.ts:454` showed the defect was one layer deeper and Sol's framing
understated it:

> The summary claims "N viewport(s) × M theme(s)" — the REQUESTED counts — even
> when only 1 of 6 rendered. That's exactly the coverage-claim defect. Best fix:
> in audit-url.ts itself, since that's where the summary lies, and it's the true
> owner. … the summary lie affects every caller equally and is a genuine defect.
> Fixing at source is right here (unlike score_page, where the scorer genuinely
> couldn't know).

Fixed at source, four anchors in `src/audit-url.ts`:

- `requestedCombos = viewports.length * themes.length`,
- a `PARTIAL COVERAGE — only X of Y requested viewport×theme combinations
  rendered` prefix,
- the summary now counts `captures.length + " of " + requestedCombos`,
- a new `coverage: { requested, succeeded, complete }` on BOTH return paths
  (main and `unavailableResult()`).

`compactAuditUrl` (`src/compact.ts:55`) is an **allowlist**, not a filter, so
`coverage` had to be added there too or compact mode would silently drop it and
reinstate the claim it exists to correct.

**The `isError` predicate is deliberately UNCHANGED.** `auditUrl()`'s
per-viewport catch (`src/audit-url.ts:168-174`) does `warnings.push(...);
continue` — a partial run is a designed degrade and must stay a SUCCESS.
`warnings.length` was the wrong predicate and Sol agreed. What changed is that a
partial run no longer CLAIMS the coverage it did not get.

### Objection 8 — Accept normalization narrows non-MCP POST behavior (DECIDED, accepted)

`api/mcp.js` normalizes the Accept header unconditionally, so a non-MCP POST
that used to get the SDK's 406 now reaches the transport and comes back as a
JSON-RPC error instead (`POST {}` with `Accept: */*` was 406, is now `-32600`).
Accepted with a written rationale in the file rather than discovered later:
406 answers a question nobody asked about a body malformed for a different
reason, and `-32600 Invalid Request` names the actual defect. The alternative —
narrowing the normalization to bodies carrying a `jsonrpc` field — was
considered and **refused in the comment**: a client that omits `jsonrpc` is
exactly the client that needs the accurate error, and gating on it would hand
that caller the misleading 406 back.

### Verification of this leg

`RAVEN_NO_USAGE_LOG=1 npm test` → **tests 1607 / pass 1603 / fail 1 / skipped 3**.
The single failure was the predicted one and nothing else:
`ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH` in
`test/taste-remote-full.test.mjs:106`, actual
`08d79dd3c0b1671ff8ff469a93401d8bf131e9273ed6ca32cbaa70485c01a731`.

Rebaselined by **measured substitution**, not by pasting the actual:
`.claude/openai-rejection-2026-08-19/verify-anon-hash.mjs` builds the anon
payload and substitutes ONLY the three changed descriptions
(`audit_contrast`, `score_page`, `audit_typography`) back to their previous text
— that reproduces the previous pin `2337775946…fdbd7` **exactly**, which is what
proves no OTHER description moved. Note the first attempt reverted only two of
the three and did NOT reproduce the pin; the miss was visible precisely because
the method is a reproduction rather than an eyeball.

Also verified this leg:

- `ANONYMOUS_INSTRUCTIONS_HASH` (`3ccce9cf…`) asserted green in the same test —
  the server instructions did not move.
- `GOLDEN_45_HASH` `f64bb185…7bb0a6` **unchanged**, and the counts test
  (`bare remote = 45`, `remote+store = 56`, `stdio = 111`) passed.
- `node scripts/sync-manifest-tools.mjs` after the build → `git diff
  manifest.json` **empty**. Every description edit preserved sentence 1 for
  exactly this reason.
- Two-surface annotation probe re-run in two SEPARATE node processes (the
  `setRemoteRuntime()` latch is one-way):
  `[remote] tools=45 missing_hints=0 non_boolean=0`, `openWorld=true (5)`;
  `[stdio] tools=111 missing_hints=0 non_boolean=0`, `openWorld=true (12)`.
  `audit_page`, `score_page` and `audit_typography` are open-world on stdio
  (where url genuinely works) and NOT on the anonymous surface — which is the R2
  root cause, closed.
- `npm run build` clean.

### Still open (nothing here is a completion claim)

1. **Objection 1** — per-tool annotation justifications for the submission form.
   Andrew pastes; I draft.
2. **Objection 2** — `conversations/2026-07-25-submission-dossier.md` section B
   rewrite. Line 79 ("**Known behavior:** this comes back as a normal text
   result, not an MCP `isError: true`") is now FALSE. Line 78 is doubly wrong:
   `ERR_NAME_NOT_RESOLVED` is unverifiable on this host, and the summary shape
   changed. Lines 68 and 71 both gained fields (`coverage`, `contrast.assessed`).
3. **P2–P5 numbers have unestablished provenance** — the workflow leg assigned to
   measure them died (89-character journal entry). Pasting unverified numbers
   into a resubmission dossier reproduces the exact R1 failure OpenAI cited, so
   every one gets independently re-measured.
4. done-gate + a fresh Sol falsification pass on the amended diff.
5. Delete the scratch `apply-obj*.mjs` / probe scripts before any commit.

**Andrew-gated, not to be done by an agent:** the push to `main` (which deploys
the live endpoint), `cd web && vercel deploy --prod`, `npm publish`, the
`src/browser-launch.ts` concurrency-cap edit, the annotation justification text,
confirming `andrew@ravenmcp.ai` receives mail, and the resubmission itself.

---

## Segment 3 — dossier section B rewritten, objection 3 reopened and widened

### Full-suite runs 2 and 3

Run 2 (`agent-output/full-suite-postfix2.log`):
`ℹ tests 1607 / suites 6 / pass 1604 / fail 0 / cancelled 0 / skipped 3 / todo 0`,
`EXIT=0`. Run 3, after the pin rebaseline
(`agent-output/full-suite-postfix3.log`): identical — 1607 / 1604 / 0 / 3,
`EXIT=0`, zero `✖` in the whole log.

**The 3 skips were read INDIVIDUALLY, at log lines 109 / 782 / 783** — the
file-URL fallback notice and the two removed-capability phase2 tests, the same
three this ledger has always carried. A pass/fail/skip triple says nothing about
which tests skipped, and a background task notification reporting "exit code 0"
describes the nohup WRAPPER, not the harness verdict; both runs were graded off
the `EXIT=` line written INSIDE the log by the launcher.

### R1 — every submitted test-case value re-measured

All against `buildServer({ remote: true })`, i.e. the surface OpenAI reviews.
Shared fixture, inline in the dossier so the expected output is reproducible
rather than remembered:

```json
{"html": "<html><body style=\"font-family:sans-serif\"><p style=\"font-size:10px;color:#777;background:#fff\">Tiny grey copy</p><button style=\"padding:2px 4px;background:#0a84ff\">Go</button></body></html>"}
```

Positives — `audit_page` → `score 71`, `grade "C"`,
`summary "8/14 checks passed — 4 issues to fix"`. `score_page` → `overall.score
71`, `weakest_category "structure"`, and the obj-7 block live:
`contrast {"assessed":false,"pass_count":null,"fail_count":null,"indeterminate_count":null,"note":"…"}`.
`get_principles({context:'pricing page',category:'accessibility',format:'brief'})`
→ `count 6`, first id `color-contrast`. `audit_contrast` in dom_snapshot mode →
`aa_fail_count 1`, row `status "fail"`, `ratio 4.48`, `required_aa 4.5`,
`delta_to_aa 0.02`. `suggest_contrast_fix` → `currentRatio 4.48`,
`fgFix rgb(118,118,118) @ 4.54`, `bgFix rgb(6,6,6) @ 4.52`.

Negatives, all measured `isError: true` — `audit_page({})` →
`Provide either html or url`; `audit_page({url})` on remote → the
`REMOTE_ARG_GUARDS` message verbatim; `suggest_contrast_fix({pairs:[]})` → the
required-shape message.

**KEY FINDING — the dead workflow leg's numbers do not reproduce.** Leg C had
claimed `ratio 3.45 / delta_to_aa 1.05 / bgFix rgb(35,35,35) @ 4.55`. The
measured fixture gives `4.48 / 0.02 / rgb(6,6,6) @ 4.52`. (`fgFix` matched
coincidentally.) Those were fixture-dependent numbers with **no recorded
fixture** — which is precisely the R1 failure mode OpenAI cited, reproduced by
my own workflow before it could reach a resubmission. Every number in the
dossier now carries its fixture inline.

### Provenance of the R1 root cause, verified rather than asserted

`git log -1 488b315` → `2026-07-18 Contrast audit composites over the real
rendered backdrop, not assumed white`; `git show 488b315 | grep -c indeterminate`
→ **106**. The tri-state `pass`/`fail`/`indeterminate` return therefore predates
the 2026-07-25 dossier by a week, confirming the submitted `audit_contrast`
numbers ("373 text elements / 373 AA passes / 0 failures") were **stale on the
day they were typed**. The reviewer re-ran them, saw a different shape, and
correctly filed a mismatch.

### Objection 2 — dossier section B rewritten (102 → 203 lines)

Restructured around **invariants** (properties that hold for any correct run)
with an inline fixture per case, plus a `### Test cases — read this first`
preamble stating the root cause above. Two deliberate withdrawals, each with its
reason stated in the document rather than left as an omission:

- **`audit_url` is not submitted as a test case.** It is the one anonymous tool
  that reaches the open web and launches a browser; its output depends on a
  third-party page. It stays registered and callable — it is simply not
  gradeable against a fixed expected output.
- **The DNS-failure negative is absent.** The remote build bundles
  `@sparticuz/chromium`, a Linux/Lambda ELF, so a macOS run fails `spawn ENOEXEC`
  in ~120 ms — before DNS is consulted. `ERR_NAME_NOT_RESOLVED` is therefore
  **unverifiable on this host** and is not promised. Only the shape is:
  `isError: true`, `captures: []`,
  `coverage: {requested: 6, succeeded: 0, complete: false}`.

**One overclaim of mine was caught before it shipped.** I had written "eighteen
return-shaped soft-error sites." Measured —
`git diff -U0 -- src/ | grep 'isError: true' | grep -c '^+'` → **6**. The text
now names six and cites the diff.

### Objection 3 REOPENED — `audit_page` was still advertising url capture on the hosted endpoint

Verifying my own sentence ("each of those three now says so in its own hosted
description") found it **FALSE for `audit_page`**. `score_page` and
`audit_typography` had been corrected in the earlier obj-3 pass; `audit_page` —
the flagship, and the third member of the same `REMOTE_ARG_GUARDS` url set —
had not. It described url capture unconditionally in both its tool description
and its `url` parameter description while the guard hard-rejects that argument
there.

Found by **re-reading `REMOTE_ARG_GUARDS`, not by any test.** The description pin
structurally cannot detect this: it cannot distinguish a description that SHOULD
have moved from one that correctly did not. Rather than soften the sentence I
fixed the code — leaving it would have shipped exactly the defect class OpenAI
cited, on the flagship tool.

Then, one layer under it: even after that fix, `score_page` and
`audit_typography` still carried `url` **parameter** descriptions promising a
render. Fixing the tool-level text and not the parameter text is the
fix-one-of-two-call-sites drift this repo's ledger documents repeatedly. Both
were corrected (obj-3b, obj-3c). Sentence 1 of every description is left
byte-identical throughout, because `shortDescription()` in
`scripts/sync-manifest-tools.mjs` takes only the first sentence — which is what
lets a description change ship with a **zero-diff `manifest.json`** (verified).

### Pin rebaseline, proven by substitution rather than accepted

`test/taste-remote-full.test.mjs:47`:
`08d79dd3c0b1671ff8ff469a93401d8bf131e9273ed6ca32cbaa70485c01a731` →
`36c46c94187dc34b1c9cab12bdc4622533ab350cc8faf160d0f4bd9c823c07a1`.

The rebaseline is only legitimate because reverting **all four** description
changes in-process reproduces the pre-pass pin
`2337775946122e3019e990939b2cb46c27daa65b0fb327c19c91305b105fdbd7` **exactly**
(`restored === OLD_PIN? true`). Had I rebaselined without that proof, an
unaccounted description change could have ridden along invisibly — the earlier
segment's first attempt reverted only two of three and did NOT reproduce the old
pin, which is how the third was found.

**The frozen anonymous name-hash did not move:** tools = 45,
`name-sha256 = f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.

Stated in the pin's own provenance comment so it is not mistaken for guarded:
`inputSchema` is NOT in `anonymousMetadataPayload()`, so **a parameter
description can change without moving any pin here.**

### Still open (nothing here is a completion claim)

1. Objection 1 — per-tool annotation justifications for the submission form.
2. Re-read the rewritten dossier section B end-to-end for any remaining unmeasured claim.
3. done-gate + a fresh Sol falsification pass on the amended diff.
4. Delete the fifteen scratch `.mjs` scripts under `.claude/openai-rejection-2026-08-19/` before any commit.

Andrew-gated set unchanged from the previous section.

## Segment 4 — objection 1 closed: per-tool annotation justifications, every claim measured

**What landed.** `conversations/2026-07-25-submission-dossier.md` gained a new
section, `### Tool annotations — every hint explicitly set, with justification`,
inserted immediately before `### Starter prompts` (203 → 252 lines, then edited
in place twice more; see the two corrections below). It answers OpenAI's second
rejection reason directly: hints explicitly `true`/`false` on every tool, with a
justification grounded in actual behavior rather than in intent.

**Explicitness is enforced by construction, not by review.** Every tool is
classified in `TOOL_ACCESS` and `toolAnnotations()` **throws** for any tool that
is not, so a tool cannot be registered without all four hints. Probed on both
surfaces: remote **45 tools / 0 missing / 0 non-boolean**, stdio **111 / 0 / 0**.

**The measurement, re-run against a freshly rebuilt `dist/` after every source
edit in this session** (`npm run build`, exit 0):

- All 45 anonymous tools: `readOnlyHint true`, `destructiveHint false`,
  `idempotentHint true`. The probe prints any tool deviating from that triple and
  printed nothing.
- `openWorldHint true` on exactly **5**: `audit_contrast`,
  `audit_responsive_visibility`, `audit_tap_targets`, `audit_url`,
  `audit_video_playback`. The other 40 are `false`.
- Name-hash re-read off the same probe:
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — **exact
  match to the frozen golden hash**, so none of this session's description and
  guard edits moved the anonymous tool set.

**Four supporting facts, each run rather than asserted:**

1. A scan of all 45 input schemas finds **no** `save` / `persist` / `write` /
   `delete` / `remove` / `overwrite` parameter. `generate_design_system` was
   re-probed on the remote build specifically: `has save key: false`.
2. The three tools whose names most suggest generation —
   `generate_design_system`, `evaluate_design`, `score_creative` — are each
   **byte-identical across two consecutive calls** with identical arguments
   (lengths 33504 / 185019 / 1594). Idempotency is a measured property here, not
   an inference from "it's read-only".
3. **`TOOL_IDEMPOTENT` and the destructive set are the same 36 tools**, verified
   by diffing the two name lists: the map's 36 keys and the 36
   destructive-classified tools are **identical, 36 for 36**, and none is on the
   anonymous 45. Split: 13 marked idempotent, 23 not.
4. The codebase contains **no LLM client at all** —
   `grep -rln "api.anthropic.com|api.openai.com|new Anthropic|new OpenAI|openrouter" src/`
   returns nothing — and the only outbound `fetch(` sites are `src/index.ts:920`
   (npm version check, not a tool), `src/index.ts:7293` (`raven_register`, gated)
   and `src/api-contract.ts` (`audit_api_contract`, gated).

**Two claims I wrote and then corrected on re-reading, both from over-reading my
own measurements:**

- *"All 36 tools that are genuinely destructive live behind the gate."* I had
  taken `TOOL_IDEMPOTENT`'s 36 keys as a count of destructive tools without
  checking that the sets coincide. They do — but only because I went and diffed
  them (fact 3 above). The sentence now cites the diff instead of implying it.
- *"Idempotency is not assumed by default anywhere in the server."* **False.**
  `toolAnnotations()` gives every read-only tool `idempotentHint: true`
  unconditionally; the `TOOL_IDEMPOTENT[toolName] === true` default-false lookup
  applies **only to the destructive branch**. Measured: 88 of 111 stdio tools
  carry `idempotentHint: true` (76 read-only + 12 of the destructive 35), which
  is arithmetic a 36-key map could never produce. Rewritten to say what is true —
  idempotency is not assumed for anything that *writes*.

**One incidental finding worth keeping.** `delete_taste_data` is classified
`destructive` and is **not registered on the default stdio build at all** (it
needs a per-user store), which is why the stdio destructive probe returns 35 and
not 36. It is in `REMOTE_GATED_TOOLS`, so it is absent from the anonymous 45; it
appears only on the authenticated `/api/mcp-user` surface, which is **not** the
surface being submitted. A tool named `delete_*` showing up read-only on a
submitted surface would have been exactly the R2 mismatch — it does not.

**Still owed at the close of this segment:** done-gate plus a fresh Sol
falsification pass on the amended diff, then a disposition per objection, then
deleting the scratch `.mjs` probes under `.claude/openai-rejection-2026-08-19/`.
Nothing is committed, pushed, or published.

## Segment 5 — verification: full suite green, three skips read individually

**Full suite (`RAVEN_NO_USAGE_LOG=1 npm test`, detached, `EXIT=$?` written inside the log)** —
`.claude/openai-rejection-2026-08-19/agent-output/full-suite-final.log`:

```
ℹ tests 1607
ℹ suites 6
ℹ pass 1604
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
EXIT=0
```

`grep -c '✖'` → **0**. Graded off the in-file `EXIT=` line, not off a task notification
(a notification describes the WRAPPER, never the harness verdict).

**The 3 skips were read INDIVIDUALLY by line, not inferred from the total** — and they are
the same three this ledger has always carried:

- `:109` — `file URL fallback marks reveal and settle checks as unavailable`
  `# browser available — fallback path not used`
- `:782` — `[phase2D fix B] a later committed batch applies on the first poll while the head is pending`
  `# removed capability: overlapping committed batches`
- `:783` — `[phase2C tray] overlapping committed batches both finish and Apply counts only batch B`
  `# removed capability: overlapping committed batches + deleted queued-count markup`

Their line numbers moved from the previously ledgered 109/782/783 by **zero**, which is
consistent with this session adding no test and removing none.

**Count movement vs the last ledgered figure.** The ledger's 2026-08-14 entry reads
1569/1566/0/3. This run reads 1607/1604/0/3. **That +38 is NOT this session's work** — this
session added no test file and no test; it changed descriptions, arg guards and six
`isError: true` sites, all of which move the count by zero. The delta is prior drift from
the gauntlet rounds recorded in commits after that ledger entry (`main` is 5 ahead of
`origin/main`). Read the parts, never the total.

**Scratch cleanup done.** All 24 ad-hoc `.mjs` probes under
`.claude/openai-rejection-2026-08-19/` deleted; the staged root-level `measure-task-c.mjs`
(157 lines, a workflow leg's scratch that had been `git add`ed) was `git rm --cached`'d and
deleted. Deliberately kept: the three `.workflow.js` scripts, `sol-brief.md`,
`sol-brief-final.md`, `suite-r1a.log`, and `agent-output/`.

## Segment 6 — R2's ACTUAL root cause, measured on the live surface (not the local build)

**The live anonymous endpoint omits `idempotentHint` on all 45 tools.** Fetched fresh from
`https://mcp.ravenmcp.ai/api/mcp`, `tools/list`:

```
LIVE tools: 45
readOnlyHint    present on 45 / 45
destructiveHint present on 45 / 45
idempotentHint  present on  0 / 45
openWorldHint   present on 45 / 45
example: {"title":"Get Principles","readOnlyHint":true,"destructiveHint":false,"openWorldHint":false}
```

That is OpenAI's R2 verbatim — *"confirm annotations are explicitly set to true or false
(not null) for every tool."* **An omitted key is exactly what a reviewer reads as null.**
Three of four hints were explicit; the fourth was absent on every single tool.

**Provenance, verified rather than assumed:**

- `git show origin/main:src/index.ts | grep -c idempotentHint` → **0**
- `git show HEAD:src/index.ts | grep -c idempotentHint` → **0**
- `git log --oneline -S idempotentHint -- src/index.ts` → **no commit, ever**
- worktree `grep -c idempotentHint src/index.ts` → **4**, and `git diff HEAD -- src/index.ts`
  shows `TOOL_IDEMPOTENT` and all three `idempotentHint` sites as **added lines**

So `idempotentHint` has **never shipped on any surface** and exists only in this session's
uncommitted working tree. CLAUDE.md's own ground-truth block corroborates it independently:
it enumerates the annotations as "`title`, `readOnlyHint`, `destructiveHint`, `openWorldHint`
— stated explicitly on every tool" and **does not list `idempotentHint`**. The ledger was
right; the surface was incomplete.

**The fix is already in the tree and is carried by the push.** `api/mcp.js:24,152` imports
`buildServer` from `../dist/index.js` and calls `buildServer({ remote: true })`, so the
hosted endpoint is built from this repo's source — pushing `main` is precisely what puts
the fourth hint on the wire. Local remote-build probe against the freshly rebuilt `dist/`:
**45 tools, 0 missing hints, 0 non-boolean hints**, and the tool-name hash is an EXACT match
to the frozen golden `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, so
the fix adds a hint without moving the frozen anonymous tool set.

### Self-correction — I graded the wrong artifact

Earlier this session I wrote that the annotation triple "holds on all 45" and reported
`missing 0 nonbool 0`. **That measurement was taken against a LOCAL
`buildServer({remote:true})`, never against the live payload**, and I let it stand as a
statement about the submitted surface. It is the repo-vs-published-vs-deployed rule this
ledger already carries, hit head-on: repo-consistent was true and deployed-consistent was
false, and only the second one is what OpenAI reviewed. **The lead came from the Sol pass
mid-run, not from any check of mine** — my own probe was structurally incapable of seeing it
because it never fetched the thing under review.

Consequence for the dossier: the annotation justification text in section B is correct for
the surface that exists **after** the push, and is wrong about the one live right now.
It must not be pasted into the submission form until the push lands.

---

## Segment 7 — the Sol falsification pass came back DOES NOT SURVIVE (7 findings), every one measured against the tree

The report-only Sol pass over `sol-brief-final.md` **exited** with verdict
**DOES NOT SURVIVE** and seven numbered findings. Raw log:
`.claude/openai-rejection-2026-08-19/agent-output/sol-final.log` (19,845 lines;
verdict lines 19496 / 19521 / 19800 / 19843, findings immediately above 19496).

### The measurement rule this round turned on

Findings 1, 2, 3 and 6 were all taken from the **live** anonymous endpoint,
which is built from `main` and therefore serves **committed** code. Every
correction made this session is an **uncommitted working-tree** change. So the
first question for each finding is not "is Sol right about the live surface" —
it is — but **"does the working tree already answer it."** Measured, per finding,
against a freshly rebuilt `dist/` rather than assumed:

| # | Sol's finding | Measured verdict |
|---|---|---|
| 1a | `idempotentHint` absent on all 45 live tools | **FIXED in tree, UNSHIPPED.** Tree: 45 tools, 0 missing / 0 non-boolean hints |
| 1b | live has 8 open-world, dossier says 5 | **NOT A DEFECT.** Tree = 5. Live's 8 predates the `remoteBlocksNetwork` gating in `openWorld` |
| 1c | `audit_page` / `score_page` / `audit_typography` publish URL-capable descriptions | **STALE.** All three carry the remote-rejection note in the tree |
| 2 | negative fixtures omit `isError` | **FIXED in tree.** `audit_page {}` → `isError:true` "Provide either html or url"; `suggest_contrast_fix {pairs:[]}` → `isError:true` |
| 3 | `score_page` html contrast reports 0/0/0 | **FIXED in tree.** Returns `assessed:false`, counts `null`, plus the explanatory note |
| 4 | `audit_page` findings carry no selector | **GENUINE.** `PageIssue` (`src/page-checks.ts:12-17`) has only `severity, rule, message, fix` |
| 5 | `audit_url` executes clicks under read-only/idempotent hints | **GENUINE.** Andrew-gated product call |
| 6 | other anonymous soft-error paths omit `isError` | **GENUINE.** Three reachable paths confirmed |
| 7 | `amended.diff` is incomplete | **GENUINE.** Built with plain `git diff`, which is blind to staged content |

### Two probe defects caught mid-measurement, both of which nearly produced false confirmations

**(a) A registered MCP tool's callable is `handler`, not `callback`.** The probe
called `t.callback(...)`, which does not exist; its own `try/catch` swallowed the
`TypeError` and reported `{isError:"<ABSENT>", text:""}` for **every** tool. That
output is **byte-indistinguishable from confirmation of findings 2, 3 and 6** —
an instrument failure wearing a measurement's clothes. Caught only by dumping
`Object.keys(t)` (`probe-shape.mjs`), which gives the real key set:
`title, description, inputSchema, outputSchema, annotations, execution, _meta,
handler, enabled, disable, enable, remove, update`. Corrected results reversed the
reading on F2 and F3 completely.

**(b) Calling `handler` directly BYPASSES zod validation, so a throw reached that
way is a probe artifact, not a reachable path.** `compose_system {}` threw a
`TypeError` and was briefly read as a live crash; `compositions` is a required zod
array, so a real MCP client is rejected by the SDK first. Retracted before it was
reported and re-tested with schema-valid payloads. **Any error path found by
calling `handler` must be re-measured with a schema-valid argument before it can
be called a defect.**

### One defect Sol did not find

`compose_system` with a **valid system and a bogus token group** returned a
successful-looking **empty** composition:

```json
{ "$name": "Custom Composition", "$description": "Composed from: linear/zzz" }
```

No tokens, no warning, no `isError`. `filterTokensByGroup` simply matched nothing
and the loop contributed nothing. This is R1-class in its purest form — the tool
produced a wrong result and reported it as a correct one — and it is worse than
finding 6, because finding 6's paths at least return text that reads like an
error.

### Fixes applied this segment (all in `src/index.ts` unless noted)

1. `compose_system` unknown system → `isError: true`.
2. `compose_system` unmatched group → `isError: true`, naming the groups that
   system actually has (`linear` → `color, color-light, typography, spacing,
   radius, elevation, motion`). The empty-success path is gone.
3. `audit_ios_privacy` with no input → `isError: true`.
4. `audit_ios_privacy` with unparseable `app_json` → `isError: true`.
5. `get_metrics_framework` unknown `id` → `isError: true`.

Re-measured after `npm run build` (`probe-r5.mjs`), with **success controls in the
same run** so the change is proven selective rather than blanket:

```
compose_system unknown system: isError true   "System 'zzz' not found. Available: airbnb, apple-hig, …"
compose_system bogus group   : isError true   "Token group 'zzz' not found in system 'linear'. Groups available…"
compose_system VALID         : isError ABSENT  (linear/color tokens returned)
audit_ios_privacy empty      : isError true
audit_ios_privacy bad json   : isError true
get_metrics_framework zzz    : isError true
get_metrics_framework heart  : isError ABSENT  (framework returned)
```

Count check, measured rather than recalled: `src/index.ts` holds **73**
`isError: true` returns against **47** at `HEAD` — **26** sites gained the flag
this round. (An earlier segment claimed "eighteen"; that number was never
measured and is superseded.)

### Dossier corrections

- **F4 corrected rather than papered over.** The claim "every finding names a
  selector and a concrete fix" is false and cannot be made true cheaply:
  `audit_page` is a pure string analysis, and several rules — a missing `lang`
  attribute, a missing viewport meta — have **no element to point at**. Adding a
  selector field would mean inventing one. The dossier now says findings name a
  `rule` id, a `message` and a `fix`, and states the absence explicitly.
- **A banner now opens section B stating that the surface it describes does not
  exist yet**, with the live census (`idempotentHint` 0/45) and the fact that
  `git log -S idempotentHint` is empty. Resubmitting before the push would be
  graded against the surface that was already rejected.
- **Section C gained four Andrew-gated items** that were missing: the push to
  `main` (item 7 — the actual delivery of the R2 fix), the `audit_url`
  keep-or-remove call (8), the `src/browser-launch.ts:401,403` concurrency cap
  (9), and pasting the annotation justifications into the form (10).
- `amended.diff` regenerated with **`git diff HEAD`**. The previous one used plain
  `git diff`, which reports nothing for staged content — so Sol's audit never saw
  `src/contrast.ts`, `web/app/docs/page.tsx`, or the entire `idempotentHint`
  implementation. **F7 means the audit graded a diff that was missing the fix it
  was auditing.**

### Still open

- **F5 (`audit_url`)** — annotated `readOnlyHint: true` / `idempotentHint: true`
  while accepting arbitrary `click` interactions and calling `page.click()`.
  Either the interaction argument comes off the hosted surface or both hints go
  `false`. Product call, Andrew's.
- **F1a/F1c reach the live endpoint only on a push to `main`.** Nothing an agent
  does closes R2.

---

## Segment 8 — refuting my own round-2 brief (claims 3 and 4)

### Claim 3 ("every soft-error path carries isError") was FALSE. I refuted it myself.

A brace-matching scan of `src/index.ts` found **12** unflagged soft-error returns on real
MCP tools. A second, broader scan — the first regex lacked the phrase "no matching" —
found **3** more. All 15 patched.

| line | tool |
|---|---|
| 2564 | `get_business_strategy` |
| 2876 | `get_d4d_framework` |
| 3052 | `get_design_system` |
| 4846 | `get_brand_system` (no match) |
| 4861 | `get_brand_system` (token file missing) |
| 6499 | `get_content_system` |
| 6572 | `get_content_pattern` |
| 6661 | `get_service_pattern` |
| 6679 | `get_service_standard` |
| 6876 | `get_brand_profile` |
| 7027 | `get_generation_job` |
| 7191 | `audit_consistency` |
| 7315 | `raven_register` |
| 8324 | `audit_taste` |
| 8429 | `talon_scan` |

`grep -c "isError: true"` → src **88**, dist **88**. Two rebuilds, `EXIT=0` both
(`agent-output/build-r3.log`, `build-r4.log`).

**Deliberately NOT patched, with reasons:**
- `1707 / 1714 / 1733 / 1735` — internal document-reader helper returning
  `{ content: null, reason: … }`. Not an MCP tool result; no `isError` contract.
- `3672` — a success `note:` ("Removed N record(s)…"), not an error.
- `5857` — `auditScreenSnapshot`'s "provide a structured snapshot" branch. This is the
  deliberate two-step handshake for `audit_screen` / `audit_ios_screen`, not a failure.

**Lesson: a soft-error scan is only as good as its vocabulary.** The first regex was
built from the error phrases I already knew about, so it re-found exactly those and
reported the file clean. The three it missed were found by reading the source around a
probe that threw, not by any scan.

### Verification — probes r6 / r7

Every fixed path now reports `isError true`; every success control stays `<ABSENT>`, so
the change is selective rather than blanket:

```
get_business_strategy zzz              isError true
get_business_strategy monetization OK  isError <ABSENT>
get_design_system zzz                  isError true
get_design_system linear OK            isError <ABSENT>
get_brand_system no match              isError true
get_brand_system stripe OK             isError <ABSENT>
get_content_pattern zzz                isError true
audit_consistency 1 page               isError true
[local] get_brand_profile missing      isError true
[local] get_generation_job missing     isError true
[local] audit_taste two inputs         isError true
[local] talon_scan no input            isError true
```

### Three probe results RETRACTED as artifacts

Calling `t[name].handler(args, …)` directly **bypasses zod validation**, so a wrong param
name throws inside the handler where a real MCP client would have been rejected first.

- `get_brand_system {url:…}` threw `Cannot read properties of undefined (reading
  'toLowerCase')` — the param is `company`, not `url`. Not a defect.
- `search_knowledge {category:…}` returned 47 results — there is no `category` param.
  Not a defect.
- `search_knowledge {layer:"zzz"}` returning `count: 0` — `layer` is a
  `ZodEnum(["principles","patterns","business","all"])`, so a conformant client can never
  send it. Unreachable, not a defect.

Mechanics worth carrying: real param names come from `t[name].inputSchema.shape`;
`Object.keys(t[name].inputSchema)` returns zod internals (`spa, _def, parse, …`) and is
useless. This file has **no `registerTool`** — the idiom is `server.tool(` on its own
line with the name on the next.

### Claim 4 ("no tool returns a successful-looking result for an input that produced
nothing") — two confirmed R1-class defects and a silent-filter set

`get_design_system {id:"linear", group:"zzz"}` returns a token object with **zero**
non-`$`-prefixed keys, reported as a success. This is the identical defect already fixed
in `compose_system` last segment — same shared helper, `filterTokensByGroup`
(`src/index.ts:301-315`), which unconditionally passes `$`-prefixed keys through.
Measured:

```
group=undefined | keys: color,color-light,typography,spacing,radius,elevation,motion
group=color     | keys: color,color-light
group=zzz       | keys:            <-- ZERO, returned as success
```

`get_checklist {type:"zzz"}` returns `pattern_checklists: []` plus a generic
accessibility checklist, as a success. `type` is a bare `ZodString`, so this IS reachable
from a conformant client.

Silently-ignored filter params, each read against its own documented description:

| tool.param | bogus value returns | documented as |
|---|---|---|
| `get_principles.category` | all 59 principles | "Filter to category: <closed list of 10>" |
| `get_brand_principles.topic` | all 24 | "…or a freeform search term. Omit to return all" |
| `get_content_principles.context` | all 11 | "Omit to get all …" |
| `get_research_method.category` | `count: 0` | "Which family of methods. Default: all." |
| `list_design_systems.category` | `count: 0` | "Filter by category: <closed list of 5>" |

### Hazards recorded at this point

- `amended.diff` is STALE — regenerated at 3497 lines / 14 files, then 15 more edits landed.
- Sol round 2 (pid 36811) is auditing that stale tree. **Any finding it reports about a
  missing `isError` must be re-checked against the current tree before dispositioning.**
- The full suite has not been re-run since the 15 edits. Baseline to beat:
  `1607 / 1604 / 0 / 3`, `EXIT=0`, skips read individually at lines 109 / 782 / 783.

---

## Segments 9–13 — the Accept-header fix, the empty-input class, and two P2 confirmations

Checkpoint written after the log had fallen five segments behind. Everything below
was measured, not inferred; each measurement names the file it was written to.

### Segment 9 — Sol round 2's P1-1 confirmed, and my own counter-argument was wrong

Sol's P1-1 said the anonymous endpoint refuses a request whose `Accept` header is
`*/*`. I initially argued this could not be true, on the grounds that `api/mcp.js`
mutates `req.headers` before handing off. **That was wrong and I withdrew it.**
The SDK's node `StreamableHTTPServerTransport` imports `getRequestListener` from
`@hono/node-server` (line 9), and hono's `newHeadersFromIncoming` reads
**`req.rawHeaders`**, not `req.headers` — so mutating the parsed object is inert.

Fix: `api/mcp.js` now rebuilds `req.rawHeaders`, collapsing duplicate `Accept`
pairs into one compliant value. Measured after the fix:

```
Accept: application/json                          -> 200, 45 tools
Accept: */*                                       -> 200, 45 tools
Accept: application/json, text/event-stream       -> 200, 45 tools
```

Two mutants (one per half of the rebuild) each turned the two non-compliant arms
red with **HTTP 406**, control green, restores byte-identical.

**This is the single best mechanical explanation of the rejection's "Ensure the
same test cases pass consistently on both ChatGPT web and mobile" clause** —
`*/*` is the near-universal client default and was being refused, while a
spec-compliant client succeeded. A reviewer switching clients would see exactly
"sometimes works, sometimes doesn't."

Guarded by `test/anon-accept-header.test.mjs` (3 tests, 3/3, 2-mutant matrix,
both killed).

### Segment 10 — Sol P1-2: three tools returned 100/A on an EMPTY audit

An empty input is not a clean bill of health. Measured pre-fix:

| tool | empty input | returned |
|---|---|---|
| `audit_ios_a11y` | `{elements: []}` | **score 100, grade A** |
| `audit_swiftui` | `{source: ""}` | **score 100, grade A** |
| `audit_swiftui` | `{source: "   \n  "}` | **score 100, grade A** |
| `audit_rn` | `{source: ""}` | **score 100, grade A** |
| `audit_rn` | `{source: "   \n  "}` | **score 100, grade A** |

The mechanism is the grade formula's `total > 0 ? … : 100` fallback, so **nothing
in the scoring path could ever have caught this** — a zero-element audit divides
into the all-clear branch by construction. `audit_ios_privacy` already refused
this way; the three source/snapshot audits did not.

Fixed in `src/index.ts` with the house refusal shape mirrored from
`audit_ios_privacy` (`isError: true`, plain-text JSON body naming the tool and
what to supply). **Whitespace-only is treated as empty**, and that is a
measurement rather than a preference: `{source: '   \n  '}` was measured at 100/A,
so a `=== ""` check would have left the defect reachable through one space.

Post-fix sweep:

```
ok  audit_ios_a11y   isError=true score=null grade=null
ok  audit_swiftui    isError=true score=null grade=null
ok  audit_rn         isError=true score=null grade=null
```

Guarded by `test/empty-input-refusal.test.mjs` — 11 tests (8 refusal cases + 3
positive controls), 11/11 green. Each refusal test asserts `notEqual(score, 100)`
and `notEqual(grade, "A")` **head-on**, not merely `isError === true`, so the
forbidden outcome is the thing under assertion.

Mutation-proven — `.claude/openai-rejection-2026-08-19/empty-mutants.mjs`:

```
baseline: 11 tests / 11 pass / 0 fail / 0 skipped, status 0
KILLED  E1 audit_ios_a11y guard deleted            radius 2
KILLED  E2 audit_swiftui guard deleted             radius 3
KILLED  E3 audit_rn guard deleted                  radius 3
KILLED  E4 swiftui whitespace not empty (=== "")   radius 1
KILLED  E5 rn whitespace not empty (=== "")        radius 1
ALL MUTANTS KILLED   EXIT=0
```

E4/E5 are what make the whitespace half MEASURED rather than assumed — each
reddens exactly its own whitespace test and nothing else.

### Segment 11 — the sweep extended, and two phantom P1s caught before they were reported

The nine tools skipped in round 1 were enumerated by their real param names and
probed empty. **No further false all-clears.** `audit_consistency` refuses at the
SCHEMA (`.min(1)`, the strongest form); `audit_content`, `audit_parity`,
`audit_typography`, `audit_contrast`, `audit_video_playback` and `evaluate_design`
all return explicit zero-count structures with no score and no all-clear language.

Two apparent crashes — `audit_contrast` "elements is not iterable" and
`audit_video_playback` "observations.map is not a function" — were traced to **my
own malformed probe input**. Calling `t.handler(args, {signal})` directly
**BYPASSES zod validation**; every one of those inputs is zod-rejected
(`dom_snapshot: Expected array, received object`) and therefore unreachable from a
real client. Re-probed with `dom_snapshot: []`: both clean, `isError=false`, no
score.

**This is the third time this session that the direct-handler idiom has produced a
false "throws".** The probe idiom is now: `inputSchema.safeParse(args)` FIRST, then
`handler(parsed.data, …)` — a throw only counts as a defect if the schema ACCEPTS
the input. Had I skipped that self-catch, two phantom P1s would have gone to Andrew.

### Segment 12 — Sol's P2 half (a) confirmed, on a different tool than reported

Sol attributed the fuzzy-company defect to `get_design_system`. `get_design_system`
takes `id`, and all three probe arms came back `ZOD-REJECT :: id: Required`. Reading
`src/index.ts` showed the `company` param belongs to **`get_brand_system` (Tool 12)**.
Re-probed the right tool:

```
company=""                   isError=false     <-- phantom match
company="   "                isError=false     <-- phantom match
company="zzzznotacompany"    isError=true      <-- correct refusal
company="Stripe"             isError=false     <-- correct
```

An empty or whitespace-only company silently resolves to a real design system
while a genuinely unknown one correctly refuses — **the inverse of the right
behaviour.** Mechanism: `searchTerm` is `""`, `"".split(/\s+/)` yields `[""]`, and
`haystack.includes("")` is TRUE for every string (+2), as is
`category.includes("")` (+3) — so `bestScore` reaches 5 on the FIRST registry
system and strict `>` pins it there. A truly unknown company correctly falls to
`bestScore === 0` and refuses.

### Segment 13 — Sol's P2 half (b) confirmed

```
generate_design_system base_system=zzzznotasystem  isError=false
  :: <!DOCTYPE html>… "Probe Design System" …
```

A user asking to build on a nonexistent base gets generated defaults **with no
notice at all** — `src/index.ts:593` silently sets `tokens = {}`, which is
byte-identical to passing no base system whatsoever.

### State at this checkpoint

- **Nothing is committed, pushed, or published.**
- R1 empty-input class: CLOSED at exactly three tools, mutation-proven.
- R1 Accept-header: CLOSED, mutation-proven.
- Both P2 halves: CONFIRMED REAL, **not yet fixed**.
- R2 (annotations): the tree is 45/45 boolean on all four hints; the live anon
  endpoint still reports `idempotentHint 0/45`. **The fix reaches the reviewed
  surface only via Andrew's push to `main`. Nothing an agent does closes R2.**

## Segment 14 — the two P2 silent-fallback fixes, their tests, and their matrix

Sol's P2 named two tools that answered a bad input with a confident-looking
success instead of a refusal. Both were confirmed by measurement in Segment 13;
this segment fixed, tested and mutation-proved them.

### (a) `get_brand_system` resolved a BLANK company and refused an unknown one

Behaviour was exactly inverted. Measured pre-fix, verbatim:

```
company=""                isError=false :: { "brand": "Apple HIG", …
company="   "             isError=false :: { "brand": "Apple HIG", …
company="zzzznotacompany" isError=true  :: { "error": "No matching design system found for 'zzzznotacompany'" …
company="Stripe"          isError=false :: { "brand": "Stripe", …
```

Sol's specific Apple HIG claim reproduced exactly. The mechanism is the same one
behind the empty-input class in Segment 10: `"".split(/\s+/)` yields `[""]`, and
`haystack.includes("")` is TRUE for every string (+2), as is
`category.includes("")` (+3) — so a blank company scored 5 against the FIRST
registry system and strict `>` pinned it there. A genuinely unknown company
correctly fell to `bestScore === 0` and refused.

The fix computes the rule ONCE and feeds BOTH match phases from it:

```ts
var candidates: any[] = searchTerm ? registry.systems : [];
```

with the fuzzy loop rebound from `registry.systems` to `candidates`. A check per
loop would be the two-copies-of-one-rule drift this repo documents for
preview-vs-action and listing-vs-lookup; one variable cannot disagree with
itself. The refusal message is conditional, because a blank company and an
unknown company are different problems with different fixes — telling someone
"No matching design system found for ''" is not actionable.

### (b) `generate_design_system` silently swallowed an unknown `base_system`

Pre-fix, `base_system="zzzznotasystem"` returned `isError=false` and a full
generated system with no notice: `generateTokenSet()` fell back to `tokens = {}`,
byte-identical to passing no base at all, so a typo'd id produced a
confident-looking system built on nothing the user asked for.

The refusal is at the TOOL SEAM, not inside the generator, and that placement was
measured rather than assumed: `generateTokenSet` has exactly ONE call site
(`src/index.ts:5444`), so the seam is the single door. It resolves through the
SAME `loadSystem()` the generator uses, so the guard and the consumer cannot
drift. The surviving `tokens = {}` branch is annotated as defensive-only, with an
explicit statement that no client input turns it on and no test pretends to kill
it — this repo's standing rule that a clause with no reachable trigger must say so.

### Post-fix verification, verbatim

```
--- get_brand_system ---
company=""                isError=true  :: { "error": "No company name provided. Pass 'company' as a non-empty name …
company="   "             isError=true  :: { "error": "No company name provided. …
company="zzzznotacompany" isError=true  :: { "error": "No matching design system found for 'zzzznotacompany'" …
company="Stripe"          isError=false :: { "brand": "Stripe", …
company="spotify"         isError=false :: { "brand": "Spotify", …
--- generate_design_system ---
base_system="zzzznotasystem" isError=true  :: { "error": "Unknown base_system 'zzzznotasystem'. …
base_system=undefined        isError=false :: { "$name": "Probe Design System", …
base_system="stripe"         isError=false :: { "$name": "Probe Design System", …
```

Build `EXIT=0`, read from inside `agent-output/build-r6.log` — the first attempt
piped to `tail` and reported `tail`'s status, the documented trap in this repo's
own ledger.

### `test/blank-resolution-refusal.test.mjs` — 9 tests, 9/9

Every refusal is paired with a POSITIVE CONTROL, because a guard that refuses
everything satisfies `isError === true` on every negative case here. Whitespace
is tested separately from `""` because BOTH were measured resolving to Apple HIG
— a `=== ""` check would have left the defect reachable through one space. The
tab/newline case exists for the same reason one layer out.

Two assertions are stronger than `isError` and deliberately so. Each refusal
asserts its OWN message (`/No company name provided/` vs `/No matching design
system found/`), which is what makes the two problems distinguishable to a caller.
And the `base_system: "stripe"` positive control compares its output against the
SAME call with no base at all — `isError === false` is satisfied by a guard that
resolves the id and then IGNORES it, which is the defect one layer in.

### Matrix v2 — 6 mutants, 6 killed, 0 survived; 1 CONTROL, 0 false-failed, EXIT=0

Against a declared 9 tests / 9p / 0f / 0s / status-0 baseline.

| id | radius | what it breaks |
|----|--------|----------------|
| B1 | 3 | delete the blank guard entirely |
| B2 | 3 | revert ONLY the fuzzy loop to `registry.systems` |
| B3a | 3 | always emit the UNKNOWN message |
| B3b | 1 | always emit the BLANK message |
| B4 | 1 | delete the `base_system` seam refusal |
| B5 | 1 | over-refuse: reject EVERY `base_system` |
| C1 | — | CONTROL: pure parenthesisation, behaviour-neutral by construction |

**B1, B2 and B3a have a BYTE-IDENTICAL red set, and that is recorded rather than
read as three guards** — they are three mutation sites on ONE path, all ending at
a blank company reaching the scorer. What separates them is B3b: same anchor as
B3a, pulled the other way, reddening the unknown-company test ALONE. Two mutants
on one line separated by which SET they redden is this repo's V14/V16 and
Q21/Q23 pattern. B5 is the over-refusal direction and is why the positive
controls exist at all.

**v1 of this matrix reported `radius=0` on every mutant** and was unattributable —
its red-name regex anchored on `✘` where `node --test` emits `✖`. That is
precisely the "counts cannot attribute a failure" defect this repo's harness
rules were written for, arriving in a harness written AFTER those rules. Its B3
also mutated the ternary in the wrong direction, exercising the unknown branch
while its comment claimed the blank one — caught because `fail=1` disagreed with
the three blank tests the description named. **A mutant's description is a claim
and it is falsifiable by its own radius.**

### State at this checkpoint

Nothing is committed, pushed, or published. The two P2 fixes join the Accept-header
fix (`api/`), the three empty-input guards (`src/`) and the annotation fix behind
the same gate: **every one of them reaches the reviewed anonymous endpoint only on
Andrew's push to `main`.** No agent action closes R2.

### Verification tail — full suite r5, and what was read rather than inferred

`RAVEN_NO_USAGE_LOG=1 npm test`, captured as
`{ …; echo "EXIT=$?"; } > agent-output/full-suite-r5.log 2>&1` so the status is
read from INSIDE the file rather than off a pipe:

```
ℹ tests 1636
ℹ pass 1633
ℹ fail 0
ℹ skipped 3
EXIT=0
```

**1636 is exactly 1627 + 9**, the nine tests in the new
`test/blank-resolution-refusal.test.mjs` and nothing else — the two P2 product
fixes, the `dist/` rebuild, the mutant harness and every comment edit move the
count by ZERO.

**The 3 skips are the same three this ledger has always carried, read
INDIVIDUALLY at log lines 121 / 811 / 812** (the file-URL fallback notice and the
two removed-capability phase2 tests), not inferred from the total. None of the
four new suites is among them.

All four new suites were confirmed to have RUN inside the full pass **by name**,
which is not the same claim as the total moving:

- `blank-resolution-refusal` — 9 named tests present.
- `empty-input-refusal` — 11 present.
- `anon-accept-header` — 3, at lines 23–25.
- `documented-categories` — 3 of its 6 located by suffix.

**One correction worth carrying: `grep -c '^test('` returned 0 for two of those
suites and that was the GREP, not the suites.** `anon-accept-header` and
`documented-categories` declare their tests inside loops with indented
template-literal names, so an anchored `^test(` matches nothing. A wrong pattern
returning nothing is indistinguishable from a suite that never ran — the silence
was re-grepped on the fixed name SUFFIXES instead of accepted. This is the same
lesson this repo already recorded when `# ` vs `ℹ ` broke a summary grep.

`amended.diff` was regenerated to cover the final tree: **5819 lines, 44 file
diffs**, built as tracked `git diff HEAD` (excluding the diff file itself) plus a
per-untracked-file `git diff --no-index --binary /dev/null` loop, because
`git diff HEAD` silently omits untracked files and all four new test suites are
untracked. **Nothing was staged** — the git index is shared with other sessions.

---

## Round: the `audit_url` click guard (R2, closed by changing the BEHAVIOUR)

R2 said the annotations do not match the behaviour. The tool it is true of is
`audit_url`, and it was MEASURED before anything was edited: the remote build
accepted `{event:"click"}` on a public URL and nothing refused it, while the tool
is published `readOnlyHint:true, idempotentHint:true`. A click on a page the
caller does not own can change state (falsifies read-only) and a second call is
not free of additional effect (falsifies idempotent). Hover and focus falsify
neither.

There were two ways to close it and only one is honest. Flipping the annotations
to false describes the tool accurately and makes it useless to a reviewer looking
for read-only audit tools — and it would have been a change to the SUBMISSION
rather than to the product. Refusing the click makes the annotation true **by
construction**, and costs nothing real: the white-wash detection this tool exists
for needs hover, not click.

Four edits in `src/index.ts`:

1. `REMOTE_NO_CLICK_TOOLS` (`:2037`), a table mapping a tool name to the name of
   the parameter that carries its interaction list — `{ audit_url: "interactions" }`.
   A table rather than an `if`, because the next tool with the same shape must
   join a list rather than grow a second copy of the rule.
2. The description append at the shared registration wrapper (`:2386`), DERIVED
   from that same table. This is the load-bearing half: an annotation promising
   read-only sitting beside a description advertising clicks is precisely the
   drift this rejection was about, so the sentence cannot be written out a second
   time by hand. Lift the guard and the sentence goes with it in the same edit.
3. Enforcement inside the handler wrapper (`:2412`).
4. Nothing in the local path. Local stdio still drives clicks — a local caller
   chose their own pages.

**Enforcement sits at the shared registration wrapper in `buildServer()`, not
inside the `audit_url` handler**, for the reason this repo has now recorded three
times in other places: a rule with two homes drifts. Every tool registers through
that one wrapper, so a future second registration path cannot bypass it, and the
description and the refusal are computed from one table in one function.

The guard order at that wrapper is fixed and it MATTERS: `REMOTE_ARG_GUARDS`
(parameter presence) → `REMOTE_NO_CLICK_TOOLS` (a value inside an array) →
`REMOTE_URL_GUARDED_TOOLS` (the async public-URL check). The click guard fires
BEFORE the URL guard, which is what makes a non-public URL usable as a click
fixture — the refusal is reached on its own terms rather than incidentally
rescued by the URL being unreachable, so it is true for the public URL the
reviewer actually ran.

Verified in four directions after the rebuild: remote+click refused with the
click message; remote+hover and remote+focus NOT carrying it; remote description
carrying the derived sentence; local description not carrying it and the local
handler not refusing a click.

## Round: Sol r3, and the empty-input class (the mechanical core of R1)

Sol's third pass returned SURVIVES with six findings. The one that matters is a
class rather than a case: **an empty or blank input was being answered with a
clean bill of health.** `!elements` is FALSE for `[]`, so a caller handing over
an empty array got "no issues found" — which for an audit tool is the one
forbidden output, and is the most plausible mechanical reading of R1's "test
cases did not produce correct results".

Fixed with one shared helper, `refuseEmptyInput()` (plus `isBlankString`, where
whitespace counts as empty), and seven call sites: `compose_system`,
`audit_page`, `generate_design_system`, `auditScreenSnapshot` (which covers both
`audit_screen` and `audit_ios_screen`), `generate_service_blueprint`,
`score_creative`. Three older inline refusals (`audit_ios_a11y`, `audit_swiftui`,
`audit_rn`) were left as they are and are noted as debt — the class has two
shapes where it should have one.

Rebuilt clean, and an over-refusal control was run alongside: `audit_screen` and
`audit_ios_screen` called with `{}` must still return their INSTRUCTIONS
affordance rather than an error, because omitting `elements` entirely is the
documented way to ask the tool what it wants. A guard widened to plain
truthiness would have eaten that, which is exactly what mutant E7 measures.

## Round: the schema census

Before writing any fixture, the zod requirements of all nine guarded tools were
read and written down, because a fixture the schema rejects measures nothing and
this session had already produced four probes that failed that way. The census
is preserved in the ledger; the two entries that changed the test design:
`audit_ios_a11y` requires BOTH `elements` and `viewport`, while the shared
`screenElementSchema` makes both OPTIONAL — which is why omitting `elements`
legally reaches the instructions affordance on the screen tools and cannot on the
iOS a11y one. And `audit_swiftui` / `audit_rn` take `source` as a required
union of string or string-array, so `""`, `"   \n  "` and `[]` are all
schema-VALID and reach the handler.

## Round: the P3-6 suite rewrite and the v2 matrix

Sol P3-6: `test/empty-input-refusal.test.mjs` called `t.handler(args, {signal})`
directly, which **bypasses zod entirely**, and two of its eleven fixtures were
schema-invalid — so they were measuring the handler against inputs no real caller
could ever send.

Rewritten at the SCHEMA SEAM: every call does `inputSchema.safeParse(args)`
first and asserts success with the parse issues in the message, then calls the
handler with `parsed.data`. A fixture the schema rejects is now a hard failure of
the FIXTURE, named as such, rather than a silent pass. 11 → 31 tests: 19 refusal
cases across nine tools, positive controls, and the two shape-affordance
controls.

Matrix v2: **15 mutants, 15 killed, 0 survived; 1 behaviour-neutral control, 0
false-failed, EXIT=0**, read from the `EXIT=` line inside the log. Two entries
worth carrying. **E7** widens the screen guard to plain truthiness and reddens
ONLY the two affordance controls — which is what proves the controls are load
bearing rather than decorative, since every refusal test stays green under it.
**E14** splits the blueprint guard's two halves, because a single mutant on a
two-clause guard grades whichever clause `assert` reaches first.

Matrix v1 had two defects of its own, both recorded because they are general:
its failing-name regex was anchored on `✘` where `node --test` emits `✖`, so
every radius read 0; and its B3 mutant flipped a ternary in the direction that
happened to preserve behaviour, which is why it is now B3a/B3b. **A mutant's
description is a claim and is falsifiable by its own radius.**

## Round: the descriptions pin — proof, then rebaseline

`test/taste-remote-full.test.mjs` went 6/7 when the click-guard round moved the
anonymous tool-DESCRIPTIONS hash. The frozen 45-NAME wire hash
(`f64bb18…2bb0a6`) and the instructions hash never moved and were re-asserted;
only the descriptions pin did.

**A rebaseline that absorbs an unnoticed second change is how a leak-guard
becomes decoration**, so the number was not simply updated. The harness
(`.claude/openai-rejection-2026-08-19/verify-anon-hash.mjs`) does a SUBSTITUTION
PROOF: it rebuilds the hashed payload with one named description reverted to its
literal at HEAD, and asks whether that reproduces the PREVIOUS pin exactly. It
does — reverting `audit_url` ALONE reproduces `1abc908c…`, the pin this file
carried before the click guard landed. **That equality is the whole argument, not
the diff**: if any other description had moved, no single-tool revert could
reproduce the old hash. Only then was the pin rebaselined to `c914c26c…` and the
header rewritten from SIX to SEVEN with the full measured chain, so the next
reader inherits the proof rather than the number.

Two mechanics that had to be got right first. **A SUPERSET control is worthless**
— reverting a tool whose description never moved is a no-op and still reproduces
the HEAD pin, measured rather than reasoned — so the real control is every
SUBSET: dropping any ONE member must stop reproducing the HEAD pin, which makes
the set minimal as well as sufficient. And **the description extractor must
anchor on `server.tool(\n  "<name>",\n  "`**; anchoring on the bare
`\n  "<name>",` shape silently matches the plain tool-NAME arrays in the same
file, where the next line is another NAME, and returns that name as the
"description" — which produced absurd 10–17 character HEAD descriptions and two
false MISMATCHes before it was caught.

Result: 7/7, EXIT=0, and `verify-anon-hash.mjs` ALL CHECKS PASSED across four
pins, seven subset controls, and the differing-set assertion.

## Round — the click-guard suite hung, and the hang was the one-way remote latch

The suite (`test/remote-click-guard.test.mjs`, 15 tests) printed fifteen `✔` lines
and then **never exited**: no summary line, no `EXIT=`. Three PIDs had to be killed
by hand. That is worth recording as a finding rather than a hiccup — **a suite that
passes every assertion and never exits is not a passing suite**, and the only thing
that says so is the log's own `EXIT=` line, whose ABSENCE is the signal. A task
notification would have reported the wrapper's exit code and told me nothing.

Bisecting did not reproduce it: a single `{remote:true}` click call exited 0, a
single `{remote:true}` hover call exited 0, and a single local click call exited 0.
The leak needed the COMBINATION, which is what named the cause — `setRemoteRuntime()`
is a **one-way per-process latch**. Building the remote server first flips it, so the
LOCAL `audit_url` call afterwards routes through the remote `playwright-core` /
`@sparticuz` stack and leaks the egress-proxy handle. This repo already recorded
exactly that shape once, for `test/design-gauntlet.test.mjs`: *a browser test and a
`remote:true` build can never share a process.* The house fix is the same one —
child-process the half that must not see the latch (pattern: `test/user-systems.test.mjs`).

Here the remote assertions are the bulk of the file, so it is the LOCAL handler call
that moved into a child. Reading a local DESCRIPTION stays in-process, deliberately:
the latch only reaches the browser path, and description drift is the other half of
what this file guards.

**The clock is the proof, not the argument.** In-process the local call took 170 ms
and returned the HOSTED endpoint's URL-guard message; in a clean child it takes
814 ms — which matches the 752 ms measured in isolation before any of this. The
suite had been asserting against a local build that was quietly running remote.

Two smaller entries from the same round.

* Renaming the fixture constant `URL` was not tidiness. The suite declared
  `const URL = 'http://127.0.0.1:9/nothing'`, which SHADOWS the global `URL` for the
  whole module scope, so the child-process wiring added at the top of the file
  (`new URL('../dist/index.js', import.meta.url)`) hit the const's temporal dead zone
  and the file threw at load: `ReferenceError: Cannot access 'URL' before
  initialization`. It is `FIXTURE_URL` now, so the class cannot recur.
* Two apparent product anomalies earlier in this round — remote+click returning the
  URL-guard message, local returning the hosted message — were re-measured
  individually and **did not reproduce**. They were an artifact of a shell `for` loop
  with `set -- $combo` and `tail -3` interleaving its children's output. A phantom
  read off a loop is not a finding; re-measure the single case before reporting it.

## Round — the click-guard mutant matrix (v1)

`.claude/openai-rejection-2026-08-19/click-mutants.mjs`, graded against a DECLARED
15/15/0/0 baseline with the exit status and the summary required to agree:
**6 mutants, 6 killed, 0 survived; 1 CONTROL, 0 false-failed**, EXIT=0.

| id | mutation | r | red set |
|----|----------|---|---------|
| C1 | delete the guard | 5 | the four refusal tests + the ordering test |
| C2 | inspect only `list[0]` | 2 | click-after-hover, click-buried-after-focus |
| C3 | refuse EVERY interaction, not just click | 3 | the three over-refusal controls |
| C4 | drop the derived description sentence | 2 | description-states-refused, the equality |
| C5 | append the sentence on the LOCAL build too | 2 | local-description, the equality |
| C6 | PREPEND the sentence instead of appending | 2 | description-states-refused, the equality |

Three readings worth carrying.

**C3 is what makes the over-refusal controls load-bearing.** Its red set is exactly
the three controls and nothing else — so without them, a guard that refused every
interaction list would satisfy all four refusal tests and the whole suite would be
green on a tool that had stopped doing its job. A refusal test cannot tell "refuses
clicks" from "refuses everything"; only the control can.

**C4 and C6 have an IDENTICAL red set, and that is not a redundancy** — it was
checked rather than assumed, because this ledger already records a mutant graded by
a different assertion than the one it was declared against. Run individually, C4
fails on `the remote description must carry the derived sentence` and C6 on `the
derived sentence is appended, so it must be last`. Two mutants, one test, two
assertions; the radius alone could not have separated them.

**C1's radius of 5 is a fact about the wrapper, not evidence of five guards.** All
five assertions run through the single registration-wrapper choke point, which is the
property the file exists to keep: enforcement lives in ONE place so a future second
registration path cannot bypass it.

---

## Round: full-suite verification, diff regeneration, and the `refuseEmptyInput` unification

**Full suite: 1671 tests / 1668 pass / 0 fail / 3 skipped, EXIT=0** (`.claude/openai-rejection-2026-08-19/agent-output/full-suite-r9.log`, 153,661 bytes, duration 46,713 ms). `grep -c '^✖'` over the whole log returns **0**.

The check is the **from-parts derivation, never the total**: 1636 (previously ledgered) + 20 (the empty-input suite growing 11 → 31) + 15 (the new click-guard suite) = 1671, and the log agrees exactly. A bare total would have been satisfied by a suite that silently stopped running while another grew by the same amount.

**The three skips are the same three, read INDIVIDUALLY at their own output lines 121 / 831 / 832** — the file-URL fallback notice and the two removed-capability phase2 tests. Their line numbers moved from the historically-ledgered 109/714/715 purely because the five new suites' output sits above them; **a moved line number is not a changed skip**, and the only way to know that is to read the lines rather than the total.

All five new suites were proven to have RUN inside the full pass by name: click-guard **15**, empty-input **31**, blank-resolution **9**, anon-accept **3**, documented-categories **6**.

**One instrument was found lying before any product claim rested on it.** blank-resolution first counted **5** against an expected 9, which reads exactly like a suite that half-ran. The cause was my own regex: it covered `get_brand_system refuses a blank company` and `still resolves a real company` and omitted the four `generate_design_system` names. Reading the contiguous log region **86–94** showed all nine present. **A shortfall reported by a grep is a claim about the grep until the region is read.** The general form is worse than it looks here — most tests in these suites are named with TEMPLATE LITERALS inside loops, so extracting static `test('...')` names and grepping them found 5 of 15 in the click suite and **0** in four others. Count by name SHAPE, or read the log region; do not grade a suite with an instrument that cannot see its names.

`.claude/openai-rejection-2026-08-19/amended.diff` regenerated at **6,997 lines / 53 files**, now including all five new test suites and `click-mutants.mjs`. `git diff HEAD` silently omits untracked files, so the working method is the tracked diff PLUS a per-untracked-file `git diff --no-index --binary /dev/null <file>` loop. **Nothing is staged.**

### The three remaining inline empty-input refusals, unified

`audit_ios_a11y` (`src/index.ts:4645`), `audit_swiftui` (`:5876`) and `audit_rn` (`:6547`) still hand-rolled the `{ isError:true, content:[{type:"text", text: JSON.stringify({...}, null, 2)}] }` shape that `refuseEmptyInput` already owns. Each substitution was made only after asserting the source text occurred **exactly once**, with a backup at `/tmp/index.ts.bak`; `grep -c 'refuseEmptyInput' src/index.ts` went **7 → 10**.

The change is behaviour-neutral **by construction, not by inspection**: `refuseEmptyInput(error, extra)` emits `JSON.stringify({ error, ...extra }, null, 2)`, so `error` stays first and `tool`/`platform` second — byte-identical to what the three inline forms produced. Proven anyway: `npm run build` → `BUILD_EXIT=0`, and `node --test` over the three refusal suites → **55 tests / 55 pass / 0 fail / 0 skipped, EXIT=0** (`agent-output/refactor-check.log`).

**Four inline `isError` returns were deliberately NOT touched**, because they are not this class: `:6298` and `:6320` (audit_ios_privacy's either/or and malformed-JSON messages), `:7127` (brand profile not found), `:7278` (generation job not found). Folding those into an "empty input" helper would put the wrong sentence on a different failure.

### The refactor killed two mutant anchors, and the harness said so before it mis-measured

`empty-mutants.mjs`'s `SWIFT_G` and `RN_G` embedded the pre-refactor compiled `return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "No SwiftUI source…` text, which no longer exists in `dist/index.js`. **A find-string mutant dies the moment its target line is edited** — the fourth time this repo has recorded it — and E2/E3/E4/E5 all depended on those two anchors. E1 was unaffected because it anchors on the `if (…)` line, which the refactor did not touch.

Both were re-anchored on the surviving guard `if` plus the new `return refuseEmptyInput("No SwiftUI source` / `"No React Native source` head, and the matrix was **re-run WHOLE rather than extended**, per the standing rule:

**15 mutants, 15 killed, 0 survived; 1 CONTROL, 0 false-failed**, EXIT=0, against a declared 31 tests / 31 pass / 0 fail / 0 skipped baseline.

Radii re-measured rather than carried forward: E2 and E3 at **3** (empty string, whitespace-only, empty array all route through the one guard), E4 and E5 at **1** (the whitespace clause alone), E1 at 1, E6 at 3, E7 at 2, E8 at 2, E9 at 1, E10 at 2, E11 at 1, E12 at 2, E13 at 2, E14 at 1, E15 at 1. E6's radius of 3 remains a fact about ONE shared mechanism — `audit_screen` and `audit_ios_screen` both route through `auditScreenSnapshot` — and never evidence of three independent guards.

## Round: done-gate Path A, and the measured root cause of R2

Path A, `[Gates: exempt — no visual/user surface; MCP protocol + submission metadata]`.
Step 0 skipped: no user turn pending, and the acceptance criteria are fixed by the
rejection email's own two reasons. R1 and R2 ARE the checklist.

### R2 — root cause MEASURED on the reviewed surface, not inferred

Every prior entry in this log treated R2 as "annotations need to be explicit". That
was the remediation, never the diagnosis. The diagnosis is now measured, and it is
narrower and more damning than the guess:

    LIVE  https://mcp.ravenmcp.ai/api/mcp  tools=45
      missing-per-hint: readOnly 0, destructive 0, idempotent 45, openWorld 0
    BUILT buildServer({remote:true})       tools=45
      missing-per-hint: readOnly 0, destructive 0, idempotent 0, openWorld 0
      titles-missing: 0

**Three of the four hints were present on all 45 tools and `idempotentHint` was absent
on all 45.** OpenAI's wording — "explicitly set to true or false (not null) for every
tool" — describes that exactly. This is why the ledger's standing claim that every tool
"carries full MCP annotations (`title`, `readOnlyHint`, `destructiveHint`,
`openWorldHint`)" reads as satisfied and still failed review: **that list is four names
long and one of them is not `idempotentHint`.** The ledger enumerated the set it
implemented rather than the set the spec defines, so the omission was invisible to
every check that consulted the ledger. A completeness claim quoting its own enumeration
cannot detect a missing member.

Gates: `gate-annotations.mjs` → `tools=45 bad=0` (all four hints boolean + non-empty
title). `gate-hint-delta.mjs` → the BUILT half of the table above.

### R1 — two apparent crashes were the INSTRUMENT, not the product

`probe-empty-sweep3.mjs` reported `audit_contrast` ("elements is not iterable") and
`audit_video_playback` ("observations.map is not a function") THROWING on empty input.
Both evaporated when re-measured through the shipping seam. The probe calls handlers
DIRECTLY; the real path is `tools/call`, which runs `inputSchema.safeParse` first.
Through it (`gate-zod-throw.mjs`) both are cleanly REFUSED with a helpful either/or
message, and `audit_parity` refuses with `MCP error -32602`.

**A probe that bypasses the shipping seam measures a path that does not exist.** This is
the same class as Sol's earlier P3-6 — a test bypassing zod — recurring one layer out,
in a probe instead of a test. The lesson generalises past both: an instrument aimed at
an internal function grades a call graph the client cannot reach, in BOTH directions —
it invents crashes, and it would equally hide a refusal that only the seam performs.

### R1 — the three tools that still ANSWER on empty input: dispositioned, not fixed

`audit_content`, `audit_typography`, `evaluate_design` return a normal (non-error)
result on vacuous input. Read in full, none of them makes R1's named harm — an
affirmative false claim — because **none emits a grade or a score**:

- `audit_typography` — `nodes_analyzed: 0` plus a named finding
  `typography/no-nodes` ("No text nodes provided for analysis.") with a fix line.
  It announces the emptiness explicitly.
- `evaluate_design` — `total_principles: 0`, `total_patterns: 0`,
  `principles_to_check: []`. It is a guidance scaffolder, not a scorer; with no
  input it returns nothing to check, which is honest.
- `audit_content` — `summary: {total:0, pass:0, warn:0, fail:0}`. An empty tally.
  Zero passed, which is not "all passed".

ACCEPTED, with the boundary stated rather than left implicit: the guards this session
added exist to stop a tool MANUFACTURING a verdict from nothing (the `100/A on empty
input` shape). A tool that returns an empty tally and no verdict is not that. The
residual worth naming is that `audit_content` is the only one of the three that does
NOT annotate its own emptiness the way `audit_typography` does — a reader must infer it
from `total: 0`. That is a legibility gap, not an R1 defect, and it is deliberately NOT
being fixed mid-audit while Sol r4 reads this tree.

### Frozen surfaces — re-verified, unmoved

- `verify-anon-hash.mjs` → ALL CHECKS PASSED (4 description pins + 2 set controls).
- Golden anon NAME hash recomputed from the BUILT remote server:
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, count 45 —
  byte-exact. No tool was added or removed this session, so the six count-asserting
  suites and `manifest.json` are untouched by construction.

### A stale-artifact correction, recorded rather than dropped

An earlier adverse leg reported that `amended.diff` OMITTED staged `src/contrast.ts`,
`web/app/docs/page.tsx` and the annotation implementation. Re-checked against the
regenerated diff: **all three are PRESENT** (53 files, 7031 lines) and both named files
genuinely differ from HEAD. The leg was reading the PREVIOUS diff, which predated the
regeneration. An audit artifact is a snapshot with a timestamp, and a finding against it
is only as current as the snapshot the auditor happened to open — regenerate before
handing it to a leg, and re-check any finding that names a file as missing from it.

---

## Sol round 4 — verdict `DOES NOT SURVIVE`, five findings, all dispositioned

Log: `.claude/openai-rejection-2026-08-19/agent-output/sol-r4.log` (533,525 bytes, 196,426
tokens). Recorded verbatim, in Sol's own numbering, with the disposition each reached.

1. **P1 — Empty `audit_contrast` still manufactures an all-clear.** `dom_snapshot: []` is
   schema-valid and reaches `auditContrastSnapshot` with no emptiness guard
   (`src/index.ts:4682`, `:4738`). Returns `isError:false`, `aa_fail_count:0`,
   `"No background rows need review"` (`src/contrast.ts:545`). The new empty-input suite
   never covered this anonymous tool (`test/empty-input-refusal.test.mjs:70`). Reproduced
   against both the built tree and the live endpoint. — **FIXED.**
2. **P1 — `audit_url` remains neither reliably read-only nor idempotent.** Only literal
   `click` events are refused (`src/index.ts:2415`); hosted hover and focus still execute
   through Playwright (`src/capture.ts:499`). Third-party `mouseenter`/`focus` handlers can
   submit same-origin requests, call `.click()`, or otherwise mutate state, so the assertion
   that these events "leave the remote host untouched" is false (`src/index.ts:2024`).
   Publishing `readOnlyHint:true` and `idempotentHint:true` is therefore unsound
   (`src/index.ts:2313`). — **FIXED.**
3. **P2 — The click test's over-refusal control bypasses the real seam**
   (`test/remote-click-guard.test.mjs:104`). — **FIXED, and proven by a mutant.**
4. **P2 — The submission dossier contradicts current source**
   (`conversations/2026-07-25-submission-dossier.md:282` vs `src/index.ts:2412`). — **FIXED.**
5. **P3 — `empty-mutants.mjs` can report a dead child as a killed mutant**
   (`.claude/openai-rejection-2026-08-19/empty-mutants.mjs:65`, graded at `:94`).
   `spawnSync` returns `status: null` on signal termination, and a null status compared
   against a nonzero expectation reads as a kill. — **FIXED.**

### The R2 root cause, measured on the exact surface OpenAI reviewed

Live anonymous endpoint: `tools=45`, `missing-per-hint:
{readOnlyHint:0, destructiveHint:0, idempotentHint:45, openWorldHint:0}`.
Built tree: `tools=45`, all four hints 0 missing, `titles-missing: 0`.
**`idempotentHint` was absent on every one of the 45 tools the reviewer called** — that is
R2's cause, and it is fixed in the tree and unshipped until Andrew pushes `main`.

### P1-2 — an annotation is fixed where an annotation belongs

The pre-existing click guard narrowed BEHAVIOUR and the test file claimed that made the
read-only hint "true BY CONSTRUCTION". That was the defect. Playwright `hover` and `focus`
dispatch **real** events, so the page's own `mouseenter`/`focus` handlers run
(`src/capture.ts:499`) and can submit a same-origin request, call `.click()` themselves, or
otherwise mutate the third-party host. Refusing the literal `click` shrinks the blast
radius; it does not make the remaining two events side-effect-free.

The honest triple for `audit_url` is `readOnlyHint:false`, `idempotentHint:false`,
`destructiveHint:false` — nothing here is destructive BY DESIGN, because the side effect
belongs to the third-party page rather than to the tool.

**The boundary is the caller-supplied INTERACTION LIST, not "renders a URL."** A plain
navigation is what any browser does when someone visits a page; treating that as a write
would make every fetching tool non-read-only.

**And the scoping is PER SURFACE.** `toolFiresCallerInteractions(toolName, remote)` returns
`true` for `audit_url` on both builds and `!remote` for `audit_page`, because the hosted
endpoint disables `audit_page` url-capture outright (`REMOTE_DISABLED_PARAMS`,
`src/index.ts:2001`) while the local build drives a real browser at a caller-named url.
Covering only `audit_url` would have been the fix-one-of-two-call-sites drift this repo
documents for preview-vs-action and listing-vs-lookup. Measured after the change:
remote 45 tools, `readOnlyHint:false` on exactly `audit_url`; local 111 tools,
`readOnlyHint:false` on 37 including both `audit_page` and `audit_url`; **zero missing or
non-boolean hints on either build.**

### P2-3 — an absence assertion is weaker than the claim it carries

The over-refusal controls asserted that the response did **not** contain the click-refusal
substring. That is satisfied by a guard which blanket-refuses every non-click interaction
using different wording — precisely the over-refusal the controls exist to detect. The
assertion is POSITIVE now: it asserts the exact NEXT-downstream refusal,
`The hosted endpoint only audits public http(s) URLs.`, which only a request that CLEARED
the click guard can reach.

Proven falsifiable rather than asserted. Mutant M1 (`if (list[ci]) {` plus a reworded
message) turned all three hover/focus controls red — 16 tests, 7 pass, 8 fail — while
`no interactions at all` correctly stayed green, since it has no list to refuse. Under the
old absence-only assertion those three would have stayed GREEN, which is the finding.
Restore verified with `cmp -s`.

One residual is stated in the file rather than papered over: **a fixture refused at
validation cannot prove execution.** The controls use `http://127.0.0.1:9/nothing`, a
private URL that is refused before any browser launches, so they prove the click guard
passed hover and focus through and nothing more. The executing half is covered by the local
build's real launch at the end of the same file.

### P2-4 — the dossier is the text OpenAI reads

Four passages in `conversations/2026-07-25-submission-dossier.md` had become false the
moment the annotation changed, and this is the document the reviewer is handed:

- The lead-in claimed "three of the four hints are uniform across all 45". Exactly ONE is
  now uniform (`destructiveHint`); `readOnlyHint` and `idempotentHint` are 44-of-45 with
  `audit_url` the documented exception, and `openWorldHint` varies across five.
- The `readOnlyHint` and `idempotentHint` table rows each carry the `audit_url` exception
  and its behavioural justification, since R2 asked for a per-hint justification grounded
  in actual behavior.
- The `openWorldHint` sentence no longer calls itself "the one hint that varies".
- Open item 8 offered two remedies — refuse hosted clicks, or flip the two hints — and
  **both have now been taken**. It is restated as the narrower genuine product call: whether
  the `interactions` argument belongs on the anonymous surface AT ALL, since hover and focus
  still fire real handlers. Refusing them too would make the hosted tool a plain render and
  let both hints return to `true`. That is Andrew's call, not an agent's.

### The regression guard for the per-surface half

`test/remote-click-guard.test.mjs` now pins BOTH directions of the `audit_page` split:
hosted read-only and idempotent, local neither. A future edit narrowing the helper to
`audit_url` alone turns the local half red; one widening it to every build turns the hosted
half red. Measured: mutant M2 (`audit_page` → `return false`) reddens exactly that one test
at radius 1, `EXIT=1`; restore `cmp -s`-verified. Suite reads **16 tests / 16 pass / 0 fail
/ 0 skipped, EXIT=0** (`agent-output/click-guard-p12b.log`).

### The empty-input matrix after the r4 fixes

`test/empty-input-refusal.test.mjs` is **33 tests / 33 pass / 0 fail / 0 skipped**, and the
matrix re-ran WHOLE: **17 mutants, 17 killed, 0 survived; 1 control, 0 false-failed,
EXIT=0** against a declared 33/33/0/0 baseline
(`agent-output/empty-mutants-v2.log`).

Two entries worth carrying. **An empty-input guard is enumerated per PARAMETER, not per
tool** — that is why `audit_contrast` slipped through the first pass: the tool was in the
suite, its `dom_snapshot` parameter was not. And **E16/E17 are two mutants on one mechanism
separated by DIRECTION rather than radius** (the V14/V16 and Q21/Q23 pattern): E16 deletes
the guard and only the REFUSAL test sees it; E17 widens it to refuse everything and only
the POSITIVE CONTROL sees it. A positive control must be able to fail, so it asserts
`aa_fail_count === 1` on a known sub-AA pair rather than `>= 0`.

### Where this leaves the delivery

**Every fix in this tree reaches the surface OpenAI reviewed only on Andrew's push to
`main`.** Since the 2026-07-27 unpin, that push IS the deploy of `mcp.ravenmcp.ai`, and it
is human-gated by standing rule. Nothing here is committed, pushed, or published. The
anonymous 45-tool golden NAME hash is unmoved and was re-verified byte-exact — annotations
and descriptions sit outside that hash, which is exactly why the payload legitimately
changes while the freeze holds.

## Full-suite close-out — the one failure was a stale pin, and proving that was a measurement

The whole-suite run after the Sol r4 fixes came back **1674 tests / 1670 pass / 1
fail / 3 skipped, `EXIT=1`** (`agent-output/full-suite-final.log`). The single
failure was `test/taste-remote-full.test.mjs:157`, the
`ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH` pin: got
`5181c149…`, pinned `c914c26c…`.

Read the two assertions ABOVE it before reading the failure, because they are
what says this is not a regression: `ANONYMOUS_INSTRUCTIONS_HASH` PASSED and the
frozen `GOLDEN_45_HASH` PASSED. The wire contract — 45 anonymous tool names —
did not move. Only description TEXT did, which is exactly what the R2 work was
supposed to move, and that pin's own comment says it guards against authed
tuning leaking into an anon build, **not** against the text changing.

**But "only descriptions moved" is a claim, and the proof is an EQUALITY rather
than a diff.** `.claude/openai-rejection-2026-08-19/verify-anon-hash.mjs` reverts
a NAMED SET of descriptions to their HEAD literals and rebuilds the payload.
Reverting `audit_url` ALONE from the current tree still reproduces
`1abc908c…` — the pin this file carried before the click guard landed — so
every other description in the anonymous build is byte-identical to that state,
and the entire `c914c26c → 5181c149` delta belongs to `audit_url`. All four chain
checks plus both set controls now MATCH, `ALL CHECKS PASSED`, EXIT=0.

The moved text is the corrected derived sentence. Measured off both builds: the
remote `audit_url` description ends *"On the hosted endpoint click interactions
are refused; hover and focus still run and can fire handlers on the page, so this
tool is published as neither read-only nor idempotent."* The local build carries
no derived sentence at all.

`inputSchema` is NOT in this payload, so a parameter description can move without
touching this pin — those are guarded by `test/documented-categories.test.mjs`.

**The pin's own provenance comment had decayed and was corrected in the same
edit.** It still said the R2 case was *"closed by changing the BEHAVIOUR rather
than the annotation"* — the exact reading Sol r4 P1-2 refuted. Narrowing the
blast radius is not the same as being read-only; hover and focus falsify both
hints, and the annotation WAS changed. A comment describing a decision is a claim
and decays exactly like a test does, except nothing executes it.

Two smaller entries from the same stretch. A task notification said "exit code
0" for a run whose own log line read `EXIT=1` — a notification describes the
WRAPPER, not the harness verdict. And a `node -e` probe of the two descriptions
produced no output because the `2>/dev/null ||` chaining swallowed it; the probe
had to be written as an in-project `.mjs` file, per the standing rule that an
ad-hoc script importing a project dependency must live inside the project.

### Re-run after the rebaseline

`RAVEN_NO_USAGE_LOG=1 npm test` → **1674 tests / 1671 pass / 0 fail / 3 skipped,
EXIT=0** (`agent-output/full-suite-rebaselined.log`, read from the log's own `ℹ`
and `EXIT=` lines, not from the shell status and not from the task
notification). The +1 in `pass` over the previous run is exactly the pin test
that had been red; the total is unchanged at 1674, which is what says the
rebaseline added no test and removed none.

**The 3 skips were read INDIVIDUALLY rather than inferred from the total** — log
lines 121, 833 and 834: the file-URL fallback notice ("browser available —
fallback path not used") and the two removed-capability phase2 tests. Same three
this ledger has always carried.

`amended.diff` regenerated: 57 files, 13,983 insertions, 106 deletions. Nothing
staged by me; the ~46 staged index entries are the repo's own
`auto-save-on-turn.sh` hook.

## Sol round 5 — verdict and disposition (2026-08-19)

Sol round 5 returned **DOES NOT SURVIVE: 2 × P1 + 1 × P2** (log 769,584 bytes,
`.claude/openai-rejection-2026-08-19/agent-output/`).

**P1-1 — `audit_video_playback` returns an all-clear on an empty
`dom_snapshot`.** Verified real by reading `src/index.ts` (the `dom_snapshot`
branch), `src/video-playback.ts:110-135` and `test/video-playback.test.mjs`. On
`{ dom_snapshot: [] }` the tool answered `isError:false`, `total_videos: 0` and
the affirmative summary `"No <video> elements found."` — byte-identical to a page
measured clean. This is the SAME all-clear-from-empty class already closed on
`audit_contrast`, one tool over, and it survived the round-4 sweep because that
sweep enumerated the tools it already knew about rather than every tool taking a
snapshot ARRAY. **A schema can say a field is PRESENT; it cannot say there is
anything IN it, and `!x` is FALSE for `[]`** — the guard is always
`Array.isArray(x) && x.length === 0`.

The refusal belongs at the TOOL SEAM, not in the pure aggregator:
`auditVideoPlaybackSnapshot([])` legitimately returns zero rows, because the
browser path really can observe a page with no `<video>`. What must be refused is
a CALLER-SUBMITTED empty array. Fixed with `refuseEmptyInput` at the top of the
`dom_snapshot` branch; `test/empty-input-refusal.test.mjs` gained the refusal case
plus a bespoke positive control (a tool with no `score` field needs one that
asserts a NON-ZERO count, or a scorer that measured nothing also reports 0). The
unit test in `test/video-playback.test.mjs` that documented the old output was a
BLESSING and was rewritten rather than supplemented — renamed to say it is a
shape fact about the aggregator, with a comment pointing at the seam guard.

**P1-2 — `audit_url` published `destructiveHint:false` defended by an argument
already refused one line above.** `readOnlyHint:false` is published precisely
BECAUSE a caller-named hover/focus runs the third-party page's own handler;
publishing `destructiveHint:false` on the grounds that "the side effect belongs
to the page, not to the tool" re-uses exactly that refuted argument. Nothing here
can know what a third-party handler does — a focus handler that deletes a record
is a destructive update this tool caused. `false` is a POSITIVE claim that updates
are only additive, which cannot be made about arbitrary third-party code;
`destructiveHint:true` is the MCP spec's own default and the honest reading of
"MAY perform destructive updates". Flipped in `toolAnnotations()`'s
`toolFiresCallerInteractions` branch, with the reasoning in the source comment.

That flip invalidates two assertions and two paragraphs of prose, all of which
move in the same edit as the code, because **a comment describing a decision is a
claim and decays exactly like a test does, except nothing executes it**:
`test/remote-click-guard.test.mjs:93` and `:118` (the latter's assertion message
literally states the refuted reasoning), and the annotation table in
`conversations/2026-07-25-submission-dossier.md` — its `destructiveHint | false`
row, the closing sentence of its `readOnlyHint` row, and the sentence above the
table calling `destructiveHint` "the uniform one".

**P2 — the mutant harness grades per-mutant runs by `isRed` alone.** The BASELINE
is graded against `EXPECTED_TESTS`/`EXPECTED_PASS`/`EXPECTED_SKIP` and every
find-string is pre-flighted for uniqueness, but a mutant run is graded on
`fail > 0 || status !== 0` — so a mutant that SHORTENS the suite, or reddens some
OTHER test, counts as a kill. Fix: grade each mutant the way the baseline is
already graded, and require the DECLARED test name to be in the red set.

## Sol round 5 — P1-1 and P1-2 closed, P2 closed (2026-08-19)

### P1-1 — `audit_video_playback` all-clear from an empty snapshot (CLOSED)

`dom_snapshot: []` came back `isError: false` with "No `<video>` elements
found." — the exact R1 class OpenAI rejected on. The refusal went in at the TOOL
SEAM, not in `auditVideoPlaybackSnapshot`, which legitimately returns zero rows
for zero input; what must be refused is a CALLER-SUBMITTED empty array. Same
split as `audit_contrast`. `test/empty-input-refusal.test.mjs` gained the refusal
case AND a bespoke positive control — this tool has no `score` field, so the
control asserts a NON-ZERO `total_videos`, because a classifier that measured
nothing also reports zero. The pre-existing test in `test/video-playback.test.mjs`
that recorded the old output was a BLESSING of the defect and was rewritten
rather than supplemented.

### P1-2 — annotation/test/dossier reconciliation (CLOSED)

`toolAnnotations()`'s interaction branch now publishes `destructiveHint: true`.
That is the MCP spec's own default when `readOnlyHint` is false, and the honest
reading of "MAY perform destructive updates" for a tool that fires caller-supplied
clicks. Both assertions in `test/remote-click-guard.test.mjs` were flipped in the
SAME edit as the source, and three paragraphs of
`conversations/2026-07-25-submission-dossier.md` were corrected with them
(uniformity now "44 of 45"; the refuted trailing sentence deleted from the
`readOnlyHint` row; the `destructiveHint` row rewritten to `false` on 44,
**`true` on `audit_url`**). A comment describing a decision is a claim and decays
exactly like a test does, except nothing executes it — so the code, the
assertions and the dossier move together or not at all.

Targeted re-run after the rebuild:
`RAVEN_NO_USAGE_LOG=1 node --test test/remote-click-guard.test.mjs test/empty-input-refusal.test.mjs`
→ **51 tests / 51 pass / 0 fail / 0 skipped, EXIT=0** (16 + 35).

### P2 — the mutant harness graded per-mutant runs by `isRed` alone (CLOSED)

The baseline was graded against declared counts and every find-string was
pre-flighted for uniqueness, but each mutant run was graded on
`fail > 0 || status !== 0`. Two things that are not kills counted as one: a
mutant that SHORTENS the suite (so the guard's own test never ran) and a mutant
that reddens some OTHER test. `empty-mutants.mjs` is v3 now:

- `EXPECTED_TESTS`/`EXPECTED_PASS` 33 → 35.
- Every mutant run must still register `EXPECTED_TESTS` with `EXPECTED_SKIP`
  skips. A moved shape **ABORTS** the matrix rather than being scored — it is a
  broken measurement, not a result.
- Every red mutant DECLARES the exact test it is supposed to redden, as a fifth
  array element, and that name must appear in the run's red set. A radius says
  how many tests failed and never WHICH, so without the declared name a kill is
  unattributable. A new `wrongTest` counter folds into the summary line and
  `process.exitCode`.

**One finding the P2 work turned up on its own:** adding the video guard made
`CONTRAST_G` match **TWICE** in `dist/index.js` (`:4361` and `:7018`) — two
guards one tool apart carrying a byte-identical predicate line — and the
harness's own uniqueness pre-flight would have aborted on it. That abort is the
harness working. Both find-strings are anchored on the line BENEATH the
predicate (the `audit_contrast` refusal message; the `audit_video_playback`
comment, chosen over its message because that message carries em dashes), which
is what names the tool. E16/E17 were rebuilt on the anchored string and E18/E19
added as the same two DIRECTIONS one tool over — E18 deletes the guard (only the
refusal test sees it), E19 widens it to refuse every snapshot (only the positive
control sees it), which is the measurement that the control is load-bearing and
not decoration.

Matrix v3, re-run WHOLE rather than extended (find-strings die the moment their
target line is edited), log
`.claude/openai-rejection-2026-08-19/agent-output/mutants-v3.log`:
**19 mutants, 19 killed, 0 survived, 0 killed the wrong test; 1 CONTROL, 0
false-failed**, EXIT=0, against a declared 35/35/0/0 baseline. Every kill is
attributed to its declared test by name. E2/E3/E6 sit at radius 3 and E7/E8/E10/
E12/E13 at radius 2 — facts about shared mechanisms (one guard covers both
`audit_screen` and `audit_ios_screen`; one covers all three source shapes), never
evidence of independent guards.

### Still owed at this checkpoint

The full-suite re-run, the `CHANGELOG.md [Unreleased]` decision, `amended.diff`
regeneration, Sol round 6 and the done-gate. And the blocker that outranks all of
them: **every fix in this tree reaches the reviewed anonymous endpoint ONLY on
Andrew's push to `main`**, which is his explicit call in the current conversation
and has not been given.

### Full suite, r5 — measured

`RAVEN_NO_USAGE_LOG=1 npm test`, backgrounded, log
`.claude/openai-rejection-2026-08-19/agent-output/full-suite-r5.log`, graded from the log's own
lines rather than from a task notification or a shell exit code:

```
ℹ tests 1676
ℹ pass 1673
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
EXIT=0
```

**The +2 over the previously ledgered 1674 is exactly two tests, and they are named rather than
inferred from the total:** `audit_video_playback refuses empty dom_snapshot array instead of
producing an artifact about nothing` (log line 517) and its bespoke positive control
`audit_video_playback still classifies a real dom_snapshot` (line 529), both in
`test/empty-input-refusal.test.mjs`, which went 33 → 35. Everything else in the P1-1 fix moves the
count by ZERO: the `src/index.ts` seam guard, and the rewrite of
`test/video-playback.test.mjs`'s blessing test — that one is a RENAME plus a nine-line comment
(`empty input → 0 videos, valid shape` → `zero observations is a shape fact, not a tool-level
pass`), so the suite is still 23 there and the delta cannot be read off it.

**The 3 skips are the same three this ledger has always carried, read INDIVIDUALLY at log lines
121 / 835 / 836** — the file-URL fallback notice and the two removed-capability phase2 tests, each
still carrying its own `#` reason. They shifted from 121/833/834 by exactly two lines because the
two new tests print above them, which is the same +2 arriving from the other direction. None of
the new tests is among them.

**The `taste-remote-full` anon pin was CONFIRMED rather than assumed** — this session changed
annotations and two tool descriptions, and `ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH`
(`5181c149…`, rebaselined earlier this session and proven by equality) covers instructions and
descriptions but not annotations. Both owning tests are green in the full run by name:
`gating: remote+store = 56 …; bare remote = golden 45; stdio = 111` (line 1582) and
`authed startup tuning appears only on store-backed remote metadata` (line 1583). The golden
45-NAME hash is likewise green at line 1142 — no tool was added or removed this session, so it
could not have moved, and it did not.

### CHANGELOG `[Unreleased]` written — measured

`CHANGELOG.md` is 421 lines; `## [Unreleased]` at line 7, `## [2.5.0] - 2026-08-17`
moved from line 9 to line 29. Written via a heredoc plus a python3 splice guarded
by `assert s.count(old) == 1`, so the insertion point could not be ambiguous.

House style was read off 2.5.0 / 2.4.1 / 2.4.0 before writing rather than assumed:
`### Added` / `### Changed` / `### Fixed`, prose paragraphs that state the
measurement decision rather than a bullet list of verbs. No OpenAI, rejection,
IP, employer or license framing anywhere in it — every item is phrased as the
product change it is.

`### Changed` carries three items: all four annotation hints stated explicitly
with `idempotentHint` defaulting to false and `openWorldHint` DERIVED per build
from the guard table; `audit_url` published as neither read-only nor idempotent
with the hosted click refusal named; and `audit_url`'s `coverage` field.
`### Fixed` carries four: the eleven empty-input refusals (with the
whitespace-only 100/A measurement stated), the `base_system` unmatched-group
failure, the `audit_contrast` backpressure passthrough, and the
`list_creative_models` documentation correction.

Every sentence in it is a falsifiable claim about the code, which is what the
round-6 brief points Sol at first.

### `amended.diff` regenerated whole-tree — measured

Sol r5's P1 was that the audit artifact was SCOPED and therefore omitted staged
files — `src/contrast.ts`, `web/app/docs/page.tsx` and the annotation
implementation were all absent from the diff the auditor was reading. Measured
both ways: scoped to `src/ test/ web/ docs/ CHANGELOG.md` gives 13 files / 1,491
insertions; `git diff HEAD` whole-tree gives 62 files. The artifact is the
whole-tree diff now, and that is the point — an audit artifact that a scope
argument can shrink is not an audit artifact.

Regenerated after the CHANGELOG entry landed, so it is current:
486,958 bytes, 62 `diff --git` headers,
`62 files changed, 14901 insertions(+), 107 deletions(-)`.
`amended.stat` (3,872 bytes) written alongside. Each of `src/index.ts`,
`src/contrast.ts`, `src/audit-url.ts`, `src/compact.ts`, `web/app/docs/page.tsx`
and `CHANGELOG.md` appears exactly once.

`amended.diff` is NOT gitignored, so the repo's `auto-save-on-turn.sh` hook will
stage it — which means `test/no-private-paths.test.mjs` scans it. Checked
proactively rather than waiting for a red suite: 0 hits for an absolute path into
a home-directory `.{claude,codex,agents,gstack,cursor}`.

### Sol round 6 launched

`.claude/openai-rejection-2026-08-19/sol-brief-r6.md` (83 lines), in the r5
format: claim under audit, eight numbered changes since round 5, the
measurements to attack, and the refutation targets. Launched detached with
`< /dev/null` to `agent-output/sol-r6.log`.

The refutation list leads with the CHANGELOG, because a changelog entry is the
one artifact in this round that makes behavioural claims with nothing executing
them.

---

## Round 7 — the guard round, the annotation round, and what the matrix caught

### The "Eleven → Twelve → Thirteen" correction

The CHANGELOG's tool count was written from a regex sweep that under-counted.
It read "Twelve tools" when the true figure is **thirteen**, because the pattern
matched a call shape `audit_tap_targets` does not use. Corrected in place, with
the tool appended to the named list. **A count derived from a regex is a claim
about the regex, not about the code** — the same lesson this repo's ledger
records for `parseCookieDate`, one artifact over.

### The sweep, three times

1. **Broken.** The first armed sweep called `t.callback`, which does not exist on
   a registered tool — every probe threw, every throw was swallowed by the
   `continue`, and it printed **zero hits on a tree with real defects**. Fixed to
   `t.handler`, and a **positive control** was added in the same edit: a sweep
   that can only ever print zero is not a sweep.
2. **Hung.** The next run never finished. A handler given empty input can still
   make a live network call or launch a browser. A sweep that never terminates
   reports nothing at all, which is byte-identical to a clean bill. Fixed with an
   8s per-probe `Promise.race`, and — the load-bearing half — a timed-out probe is
   recorded in `timeouts[]` as **NO VERDICT**, never silently skipped. "No verdict"
   is a result; reading it as "no defect" is the same false-clean the control exists
   to prevent.
3. **Triaged.** 41 raw hits. Not every non-error from empty input is a defect:
   a knowledge lookup returning the corpus for an empty filter is honest, and a
   `count: 0` with an explicit `*_note` is honest. **The defect class is narrower
   than the sweep's predicate: a score, a grade, or a pass-verdict computed from
   nothing.** `audit_layout` was cleared by measurement rather than by reading —
   `viewport` is required, so zod rejects the bare call and the refusal is the
   schema's, already correct.

### Five guards added (R1)

`audit_tap_targets` (`elements`), `audit_content` (`items`),
`audit_typography` (`nodes`), `audit_ios_privacy` (`info_plist`/`app_json`),
`evaluate_design` (`description`). Two guard shapes were wrong in the codebase
and both are now written the same way everywhere:

- **`!x` is FALSE for `[]`** — an array guard must be
  `Array.isArray(x) && x.length === 0`.
- **`"   \n  "` is TRUTHY** — a string guard must be `isBlankString(v)`.

`evaluate_design` carries a third distinction that no refusal test can see on its
own: a **blank** description is refused, an **omitted** one is not, because
omitting it routes to the screenshot pixel-diff path. Mutant E29 widens the guard
to swallow the omitted case; every refusal test still passes and only the
omitted-vs-blank control turns red.

### Five annotations corrected (R2)

Five `TOOL_IDEMPOTENT` entries flipped `true` → `false`, each with its inline
behavioural reason. `idempotentHint` means *calling twice with identical
arguments leaves the same end state* — under-claiming costs a client one retry;
over-claiming **is** the R2 finding, so the default is false.

One structural fact decided how this had to be guarded. `toolAnnotations()` is a
**three-branch function over a binary tier** (`TOOL_ACCESS: "readOnly" |
"destructive"`), and **`TOOL_IDEMPOTENT` is consulted ONLY in the `"destructive"`
branch** — the `readOnly` branch hard-codes `idempotentHint: true`. A flip on a
readOnly-classified tool would therefore be a **silent no-op**: a constant edited
in a file nobody reads. Mutant **E30** is what measures that the entry is
actually reached and the published annotation actually changed.

`destructiveHint: true` on `decision_get` / `decision_list` is a **deliberate,
recorded non-fix** — those reads log a consultation, and splitting `TOOL_ACCESS`
into a third tier to express that is not worth it. The justification is written
into the test file as a comment and belongs in the submission text, not in a
refactor. **Do not re-litigate.**

### Three of my own tests were wrong, and none of them was a product defect

- The `audit_ios_privacy` positive control asserted `score < 100`. The tool
  returns `100 / "A"` for a real plist with an empty usage string, because that
  condition raises a **warning**, not an error. **A positive control must assert
  what the measurement actually distinguishes** — here, how many checks RAN:
  blank → `1/1 … all clear` with empty `warnings`; real → `2/3` with a non-empty
  `warnings`.
- `delete_taste_data` is **not registered on the local (`remote:false`) build**,
  so it cannot serve as a local annotation control. Replaced with
  `update_design_md`.
- The `decision_get`/`decision_list` pair test asserted `readOnlyHint: true`,
  which contradicts the recorded non-fix above. Rewritten to pin the non-fix.

### Measurements

- Full suite: **`tests 1703 / pass 1700 / fail 0 / skipped 3`, `EXIT=0`**
  (`agent-output/full-suite-r7.log`, summary at 1761–1769). The **3 skips are the
  same three, read INDIVIDUALLY at output lines 121 / 849 / 850** — the file-URL
  fallback notice and the two removed-capability phase2 tests.
  The **+27 over the ledgered 1676 accounts EXACTLY**:
  `test/empty-input-refusal.test.mjs` 35 → 49 (+14) plus the whole new
  `test/idempotent-annotations.test.mjs` (13). 1676 + 14 + 13 = 1703.
- Matrix **v4b**, re-run WHOLE (two suites under one runner, baseline re-declared
  from a measurement at 62): **30 mutants, 0 survived, 0 killed the wrong test;
  1 control, 0 false-failed, `EXIT=0`** (`agent-output/mutants-v4b.log`).
- No tool added or removed. The frozen anonymous 45-name hash is unmoved by
  construction; annotations and descriptions sit outside the name hash, which is
  the entire point of R2.

### The lesson this round actually produced

The v4 run came back `EXIT=1` with **three `WRONG-TEST` results** — E26, E27,
E28. Every one of the three had reddened a real, correct, relevant test. The
harness rejected them because my **declared** red-test name carried an article
the real test name does not (`"refuses a whitespace-only Info.plist"` vs
`"refuses whitespace-only Info.plist"`). That is the attribution check working
exactly as designed: **a radius says how many tests failed and never which**, so
a kill without a matching declared name is unattributable and must not be graded
as a kill. Three string repairs, re-run WHOLE, `EXIT=0`. **No `src/` change was
implied by any of it.**

E26 vs E27 is also the separator earning its keep: E27 weakens blankness to
falsiness, which still refuses `""`, so it reddens the whitespace test **alone** —
one test, not two. Two mutants on one mechanism, separated by which SET they
redden.

One prediction of mine was wrong and is recorded rather than dropped: I expected
`SCREEN_G` to have gone non-unique now that `audit_tap_targets` shares the
`x.length === 0` shape. Measured, it is still unique — the tap-targets guard has
no `Array.isArray`, so it is a different string. No re-anchor was needed.

### Standing blocker

**Every fix in this tree reaches the reviewed anonymous endpoint ONLY on
Andrew's push to `main`.** That push is his explicit call in the current
conversation and has not been given. Nothing is committed, staged, pushed, or
published.

## Round 8 — the refutation, the guard it exposed, and two constants my own edits invalidated

### The sweep's second run

`agent-output/sweep-r2.log`: `anon tools: 56`, `NON-ERROR FROM EMPTY INPUT: 35`, `timed-out probes: 0`.
Down from 41. The six that cleared are the six guards added in round 7.

Its positive control read **false** — exactly as predicted, and that prediction is the
reason the control was worth reading rather than trusting. It asserted
`audit_tap_targets { elements: [] }` still appeared in the hit list, and that hit was
FIXED this round. **A control that a fix retires cannot tell you whether the harness
stopped probing or whether the defect went away — the two causes are indistinguishable
from the count alone.** So it was retired deliberately and in writing (the comment
records the old fixture and why it went), and re-pointed at
`audit_screen { screenshot: "" }` — chosen because it is legitimate AND permanent: a
discovery affordance returning snapshot instructions is correct behaviour, independently
pinned by mutant E7, so no future fix can retire this control the way the last one was
retired.

### `evaluate_design`'s goals/context rows: REFUTED

Going into this round I expected the three `evaluate_design` sweep rows
(`{goals: []}`, `{context: ""}`, `{context: "   \n  "}`) to be surviving R1
empty-input defects. They are not, and the refutation is a measurement rather than an
argument: `probe-eval.mjs` called it with REAL inputs —
`{goals:["accessibility"], context:"checkout form"}` — and got back the identical
zero-principle scaffold. Reading the handler then explained why. Principle and pattern
matching sit inside `if (hasDescription)`; `goals` and `context` only widen `searchText`
INSIDE that branch. `total_principles === 0` is therefore the NORMAL result of any call
without a description, and a guard keyed on it would fire on legitimate calls.

**A row in a sweep is a hypothesis about a defect, not the defect.**

### The real defect one step over, and where the guard had to be keyed

The probe did expose a genuine R1 hit next door: a call with **neither** a description
**nor** a before/after screenshot pair returned a scaffold with zero principles, zero
patterns, and `evaluation_guidance` instructing the caller to "review the design against
each principle's common violations" — **guidance about an empty set, which reads as an
evaluation that happened.**

The guard is keyed on `!hasDescription && !hasBeforeAfterScreenshots` (src/index.ts:2781),
explicitly NOT on the emptiness of the output. **Guard the inputs that decide whether
work is POSSIBLE, never the emptiness of the result** — every call that CAN produce
output satisfies one of the two conditions, so this can never fire on a legitimate call,
and the probe confirms it in both directions (6/6: four refusals, two allowed, the
description-only path still matching 132 principles).

### A test of mine was standing guard over the defect

`test("evaluate_design with no description at all is not refused")` existed already, and
my new guard contradicted it. It was not a conflict — it was a defective test.
Its COMMENT reasoned correctly about the screenshot path; its FIXTURE asserted that
contract with `{ goals: ["accessibility"] }`, a call carrying no screenshots at all. So
it was pinning the hollow scaffold it was written to exclude.

**A test's comment can be right while its fixture is wrong, and the fixture is what
executes.** Rewritten onto a real before/after pair (two hard-coded 4×4 PNG literals,
generated once with pngjs so the fixture cannot drift), with the missing negative
direction added as a second test over five argument shapes. The retired fixture is
recorded in a CORRECTION block rather than silently swapped. Suite 49 → **50**,
`ℹ tests 50 / pass 50 / fail 0 / skipped 0`.

That rewrite is also what makes the new guard's second mutant visible: under the OLD
fixture, E32 (weakening `&&` to `||`, which refuses the legitimate screenshot-only pixel
diff) was invisible.

### Renaming a test is a matrix edit

Two constants in `empty-mutants.mjs` were left stale by my own edits in the same
segment, and neither was in the file I was editing:

- `EXPECTED_TESTS`/`EXPECTED_PASS` still read 62 against a 63-test run shape.
- E29's DECLARED red test was the OLD name of the test I had just renamed.

The harness ABORTS on a moved run shape ("A suite that shortened is not a mutant that was
killed") and reports `WRONG-TEST` on a declared name that is not in the red set — so both
would have been caught rather than mis-measured, which is the attribution machinery
working. But the lesson is upstream of the catch: **renaming a test is a matrix edit**,
in exactly the way editing a source line is a find-string edit. Both repaired before v5
ran; E31/E32 added in the same pass, pulling in opposite directions on purpose.

## Round 9 — the surfaces measured, a harness that finished and never exited, and the R2 text rewritten from the source

### Three surfaces, measured by building each one, never inferred from a grep

`buildServer` has three shapes and this session had been conflating them. Measured by
constructing each and listing `_registeredTools` — in three separate processes, because
`setRemoteRuntime()` is a one-way per-process latch and a second build in the same
process measures the first one's mode:

- `buildServer({ remote: false })` → **111** tools (stdio)
- `buildServer({ remote: true })` → **exactly 45** (anonymous, `api/mcp.js` — the surface
  OpenAI reviewed)
- `buildServer({ remote: true, tasteStore: new FsTasteStore() })` → **56** (authenticated,
  `api/mcp-user.js`)

56 = 45 + 11, the eleven being the taste tools, which register only when a store is
supplied: `audit_taste, bind_taste_surface, create_taste_profile, delete_taste_data,
generate_taste_portrait, get_taste_interview, get_taste_profile, label_finding,
list_taste_decisions, list_taste_profiles, record_taste_decision`.

**The frozen golden hash is unmoved.** sha256 of the 45 newline-joined sorted names is
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, an exact match to the
ledger's frozen value. No tool was added or removed this round. The `tools/list` payload
DOES change — the annotations inside it are the whole point of R2 — but the tool SET does
not, which is what the name hash pins.

That measurement corrected a claim I had made earlier in the session in the other
direction, and both readings are kept rather than overwritten. Having established the five
`idempotentHint` flips are absent from the anonymous 45, I called them "stdio-only". The
tasteStore delta then showed `bind_taste_surface` on the authed remote surface. The honest
statement is **four stdio-only, one authed-remote, none anonymous** — so those five
corrections harden the wider product and the annotation change that actually reaches the
reviewed endpoint is the `openWorldHint` per-surface derivation.

### A harness can finish its work and still never exit — and my earlier diagnosis of it was wrong

Two rounds were lost to a missing `full-suite-r8.log`, which I had recorded as "the chained
background shell was terminated at the turn boundary", on the strength of a `pgrep` that
returned nothing at the time. That was wrong. Re-measuring with
`ps -eo pid,etime,command` found **four live orphaned `empty-sweep` node processes**,
elapsed 42:52 / 19:59 / 08:05 / 03:47, **every one of which had already written its
complete 37-line report.**

`buildServer()` leaves a live handle on the event loop, so the sweep prints everything it
has to say and then hangs forever. Chained ahead of `npm test`, that means the **suite
never starts** — which presents as a *missing log* rather than as a hang, a failure mode
that is indistinguishable from a killed background shell. That is why two rounds went to
the wrong theory. The three "failed with exit code 144" notifications that followed were
my own `pkill` reaping the orphans; three background tasks had been silently blocked for
up to 42 minutes.

The fix is an explicit exit, and the status is **derived, never a bare `exit(0)`**, on this
repo's own rule that a check whose failure mode is indistinguishable from its success mode
is not a check:

```js
process.exit(control ? 0 : 1);
```

The positive control is the one property the sweep asserts about itself. If it is absent
the sweep is no longer probing, and a report of zero hits would be indistinguishable from a
clean surface. Verified by observing `SWEEP_EXIT=0` in `sweep-r5.log`, not by assuming it.

### Sweeps r3 and r4 are byte-identical

`cmp -s` reports IDENTICAL, 37 lines each. Two independent runs agreeing is stronger
evidence than one run: `authed-remote tools: 56`, `positive control (audit_screen
screenshot:"") present: true`, `timed-out probes (NO VERDICT, not a pass): 0`,
`NON-ERROR FROM EMPTY INPUT: 32` (was 35), and `grep -c evaluate_design` → **0**. The three
`evaluate_design` rows cleared, exactly the predicted delta from the nothing-to-evaluate
guard.

The 32 remaining hits are triaged as correct rather than outstanding: discovery affordances
and honest knowledge lookups. One residual, P3 at most — `get_principles { context: "" }`
returns `count: 0` with no `*_note` where its siblings all carry one, while
`get_brand_principles { topic: "" }` returns the whole corpus for the same shape. An
inconsistency, not an all-clear.

### Matrix v5

`agent-output/mutants-v5.log`: baseline `63 tests / 63 pass / 0 fail / 0 skipped, status 0`;
**32 mutants, 0 survived, 0 killed the wrong test; 1 control, 0 false-failed**, `EXIT=0`.
E29 killed at radius 1, E31 at radius 1, E32 at radius 2.

E32 is the load-bearing one. The `evaluate_design` guard is
`!hasDescription && !hasBeforeAfterScreenshots`, and E32 weakens the `&&` to `||`, which
refuses every call missing EITHER input — killing the legitimate screenshot-only pixel
diff. A guard keyed on the OUTPUT being empty (`total_principles === 0`) would have fired
on real calls, because zero principles is the normal result of a legitimate no-description
call. **Guard the inputs that decide whether work is possible, never the emptiness of the
output.**

Two of my own constants were left stale by my own edits and both ABORTED rather than
mis-measuring, which is the attribution machinery working: `EXPECTED_TESTS/EXPECTED_PASS`
still read 62 against a 63-test shape, and E29's declared red-test name was still the
pre-rename string.

### Three findings from reading `toolAnnotations()` rather than remembering it

1. It is a **three-branch** function, and `TOOL_IDEMPOTENT` is consulted only in the
   `"destructive"` branch. The `readOnly` branch hard-codes `idempotentHint: true`, so a
   flip on a readOnly tool is a silent no-op — pinned by mutant E30.
2. The middle branch publishes `audit_url` (always) and `audit_page` (local only) as
   `destructiveHint: true` despite a readOnly classification, because both fire real
   interactions against a caller-supplied page. That branch was missing from the R2 draft
   entirely.
3. **`openWorldHint` is derived per surface, not read off a static list:**
   `TOOL_OPEN_WORLD.indexOf(tool) !== -1 && !(remote && remoteBlocksNetwork(tool))`, where
   `remoteBlocksNetwork` reads `REMOTE_ARG_GUARDS[tool].params.indexOf("url") !== -1`.
   Three members — `audit_page`, `score_page`, `audit_typography` — are `true` on stdio and
   `false` on the hosted endpoint, and the source comment names that mismatch as exactly
   what OpenAI rejected Raven for. Deriving the remote answer from the guard table rather
   than writing a second list is what stops the two drifting.

### The R2 justification draft, and four defects repaired in it

`.claude/openai-rejection-2026-08-19/R2-annotation-justification.md` is a hand-written
draft for Andrew to paste into the submission form. It was written before those source
reads and carried four defects, all now repaired:

- **§5 was the most R2-relevant section and was wrong.** It named only `audit_url` where
  the list has twelve members, omitted the per-surface derivation entirely, and never
  mentioned the three tools deliberately `false` on the hosted endpoint — which IS the
  annotation-matches-behaviour argument the reviewer asked for. Rewritten from the source.
- The third `toolAnnotations()` branch was missing; added as §3b.
- §2 implied the five idempotent flips are visible on the reviewed anonymous surface.
  Measured false; corrected with the four/one/none split.
- A new §6 states what did NOT change, with the golden hash as evidence.

### Suite

`agent-output/full-suite-r8.log`: `ℹ tests 1704 / pass 1701 / fail 0 / skipped 3`,
`EXIT=0` read from the line the launcher wrote INSIDE the log. The **+1** over the
previously ledgered 1703 is exactly the one test added to
`test/empty-input-refusal.test.mjs` (49 → 50) for the nothing-to-evaluate guard; nothing
else moved. **The 3 skips are the same three, read INDIVIDUALLY at output lines
121/850/851** — the file-URL fallback notice and the two removed-capability phase2 tests —
shifted from 849/850 purely because the refusal suite's new test sits above them. Not
inferred from the total, and not read off a task notification: a notification describes the
wrapper, never the harness verdict.

### The blocker, which outranks everything above

**Every fix in this tree reaches the reviewed anonymous endpoint only on Andrew's push to
`main`.** Since the 2026-07-27 unpin, a push to `main` touching `src/` or `api/` deploys
the live endpoint, and that push is his explicit call in the current conversation. It has
not been given. Nothing here is committed, staged, pushed, or published.
