# Submission dossier — copy-paste values

Prepared 2026-07-25. Nothing here has been submitted. Companion to `2026-07-25-anthropic-distribution.md`.

---

## A. Claude Code Plugin Directory — SUBMITTED 2026-07-25, pending review

Andrew ticked the consent checkbox. I filled steps 2 and 3 and then submitted it by accident on a Back/Next verification pass — see the session log. Status: "Submitted and pending review"; no withdraw or edit control is exposed.

**Step 3 values as submitted:** supported platform — Claude Code only (Cowork untested, left unticked); license — `Apache-2.0`; privacy policy URL — `https://ravenmcp.ai/privacy`; contact email — `cunliffeandrewc@gmail.com` (prefilled; chosen over `andrew@ravenmcp.ai`, which is unconfirmed).

Step 2's fields, as submitted:

**Link to plugin**
```
https://github.com/rhinocap/raven-mcp
```

**Path within repository**
```
plugin/raven-mcp
```

**Plugin homepage**
```
https://ravenmcp.ai
```

**Plugin name**
```
Raven
```

**Plugin description**

> Design intelligence for coding agents. Raven audits pages, screens, and diffs for contrast, layout, tap targets, typography, and consistency, and carries a design system and a taste profile the agent can consult before it writes UI code — so the design judgment survives being handed to a model.

**Example use cases**

> - "Audit this page" — Raven renders the live URL at three viewports and two themes and returns per-element WCAG contrast, tap-target failures, and layout findings tagged confirmed or inconclusive.
> - "Check this diff before I push" — `review_diff` reads the repo's DESIGN.md and active design decisions and flags the changes that contradict them.
> - "What did we decide about card elevation?" — the decision graph answers from recorded decisions instead of re-litigating it in a thread.
> - "Set up a design system for this project" — an interview binds the surface's taste rules, and every later audit is judged against them rather than a generic rubric.

Both blocks are ready as written; they say what it does before they say why it matters, which is the register the directory listings around it use.

---

## B. OpenAI plugin submission — `platform.openai.com/plugins`

Blocked on two things only Andrew can do: identity verification in the OpenAI Platform dashboard, and hosting the domain-verification token the portal issues.

**Domain verification.** The portal gives you a token. Serve it bare — no JSON wrapper, no second token — at:
```
https://ravenmcp.ai/.well-known/openai-apps-challenge
```
In the Next.js `web/` project that is `web/app/.well-known/openai-apps-challenge/route.ts` returning `new Response(TOKEN)`. I have not written it, because writing it before the token exists means committing a placeholder that later 200s with the wrong value — worse than a 404.

**Server URL to submit:** `https://mcp.ravenmcp.ai/api/mcp` (45 anonymous tools, no auth). Submitting the authenticated `/api/mcp-user` surface would require reviewer credentials that work with no MFA — see the open gap below.

**Privacy policy:** `https://ravenmcp.ai/privacy` — built, awaiting deploy.

> **READ THIS BEFORE RESUBMITTING — the surface described below does not exist yet.**
> Every measured number in section B was taken against the **built working tree**,
> not against the live endpoint. `mcp.ravenmcp.ai` is built from `main`, and the
> annotation fix (`idempotentHint`) plus the `isError` and description corrections
> are **uncommitted working-tree changes**. Measured 2026-08-19 against the live
> anonymous endpoint: `readOnlyHint` 45/45, `destructiveHint` 45/45,
> `openWorldHint` 45/45, **`idempotentHint` 0/45 — absent on every tool**, which
> is precisely the second rejection reason. `git log -S idempotentHint` is empty:
> that hint has never been in any commit. **Resubmitting before Andrew pushes to
> `main` would be graded against the same surface that was already rejected.**
> The push is an Andrew-gated action (see section C).

**Support contact:** `andrew@ravenmcp.ai`. **Confirm this mailbox actually receives mail before submitting** — reviewers use it, and a bounce reads as an abandoned submission.

### Test cases — read this first

The first rejection said test cases did not produce correct results. The root
cause was not a broken tool: the previous version of this section documented
**captured numbers taken off a live site**, and one of them
("373 text elements / 373 AA passes / 0 failures" from `audit_contrast` on a
live URL) was already unreproducible on the day it was written — the tri-state
pass/fail/**indeterminate** return landed in `488b315` on 2026-07-18, a week
before that line was typed. A reviewer re-running it saw a different shape and
correctly filed it as a mismatch.

So every case below states an **invariant** — a property that holds for any
correct run — and carries its own **inline fixture**, so the expected output is
reproducible rather than remembered. Where a number appears, it was measured
against the built tree on 2026-08-19 with that exact fixture. Numbers that
depend on a live third-party page appear nowhere.

### Five positive test cases

1. **Audit pasted markup — `audit_page`.**
   ```json
   {"html": "<html><body style=\"font-family:sans-serif\"><p style=\"font-size:10px;color:#777;background:#fff\">Tiny grey copy</p><button style=\"padding:2px 4px;background:#0a84ff\">Go</button></body></html>"}
   ```
   Invariant: returns `score` (0–100), `grade` (A–D), `summary`, and arrays
   `passes` / `errors` / `warnings` / `fix_priority`; every finding names a
   `rule` id, a human-readable `message` and a concrete `fix` (findings carry no
   CSS selector -- `audit_page` is a pure string analysis, and several rules,
   e.g. a missing `lang` attribute, have no element to point at);
   **no browser and no network are used**.
   Measured with this fixture: `score: 71`, `grade: "C"`,
   `summary: "8/14 checks passed — 4 issues to fix"`.

2. **Score a page — `score_page`.** Same `html` fixture as case 1.
   Invariant: returns `overall` (`score`, `grade`, `summary`), a `categories`
   array of seven 0–10 category scores, `weakest_category`, and a `contrast`
   block. In **html mode `contrast.assessed` is `false`** with counts `null` and
   a `note` saying contrast needs a rendered page — that is the correct result,
   not a failure. Measured: `overall.score: 71`, `overall.grade: "C"`,
   `weakest_category: "structure"`.

3. **Retrieve design principles — `get_principles`.**
   ```json
   {"context": "pricing page", "category": "accessibility", "format": "brief"}
   ```
   Invariant: returns `context`, `count`, and a `principles` array of
   `{id, name, summary}`; bundled knowledge only — nothing leaves the machine.
   Measured: `count: 6`, first id `color-contrast`.

4. **Check contrast — `audit_contrast` (dom_snapshot mode).**
   ```json
   {"dom_snapshot": [{"selector":"p","color":"#777777","bgColor":"#ffffff","fontPx":10,"bold":false}]}
   ```
   Invariant: `dom_snapshot` mode returns **one `rows` entry per supplied
   element**, each with `status` ∈ {`pass`,`fail`,`indeterminate`}, `ratio`,
   `required_aa` and `delta_to_aa`, plus `aa_failures` / `aa_fail_count`.
   Measured: `aa_fail_count: 1`, row `status: "fail"`, `ratio: 4.48`,
   `required_aa: 4.5`, `delta_to_aa: 0.02`.
   **Note the mode difference, which the tool description now states:** in
   **url** mode the per-element rows for *passing* elements are omitted (a real
   page produces hundreds of thousands of characters of them) and the response
   is counts plus `aa_failures` and `indeterminate_bg_rows`. Do not expect a row
   per element from a url run.

5. **Get a passing color — `suggest_contrast_fix`,** fed the failing pair from case 4.
   ```json
   {"pairs": [{"selector":"p","fg":"#777777","bg":"#ffffff","fontPx":10}], "level": "AA"}
   ```
   Invariant: one `results` entry per suggestible pair, each with
   `currentRatio`, `targetRatio`, `passes`, `fgFix` and `bgFix`
   (`{color, ratio, direction}`), `reachable`, and a prose `recommendation`;
   **every returned fix ratio clears the target** — pure offline math.
   Measured: `currentRatio: 4.48`, `fgFix: rgb(118, 118, 118)` @ `4.54`,
   `bgFix: rgb(6, 6, 6)` @ `4.52`.

All five run on the anonymous endpoint with no account and no credentials, and
none of the five touches the network.

**Deliberately not submitted as a test case: `audit_url`.** It is the one
anonymous tool that reaches the open web and launches a browser, so its output
depends on whichever third-party page is fetched and on capture succeeding in
the hosting environment. That is exactly the class the first rejection caught.
It remains registered and callable; it is simply not something a reviewer should
grade against a fixed expected output.

### Three negative test cases

1. **Missing required input — `audit_page` with neither `html` nor `url`.**
   Expect `isError: true` and the text `Provide either html or url`.
   Measured 2026-08-19: `isError: true`, exactly that text.

2. **Gated argument on the hosted endpoint — `audit_page` with a `url`.**
   Expect `isError: true` and
   `audit_page url-capture is disabled on the hosted (remote) endpoint. Pass the page HTML via the 'html' argument instead.`
   The guard rejects before the handler runs. Measured 2026-08-19: exact match.
   The same guard covers `score_page` and `audit_typography`, and each of those
   three now **says so in its own hosted description** — that mismatch between a
   description promising `url` and a surface refusing it is what the annotation
   half of the rejection was pointing at.

3. **Missing required argument — `suggest_contrast_fix` with an empty `pairs`.**
   Expect `isError: true` and a message naming the required shape.
   Measured 2026-08-19: `isError: true`, text
   `Provide pairs: [{ selector?, fg, bg, fontPx?, bold?, targetRatio? }]. …`

**Every soft error on this surface now carries `isError: true`.** The previous
version of this document said the opposite — "this comes back as a normal text
result, not an MCP `isError: true`" — and that sentence is now false: every
return-shaped soft-error path on the tools above was corrected to carry the flag.
Measured 2026-08-19: `src/index.ts` carries **73** `isError: true` returns against
**47** at `HEAD`, so **26** sites gained the flag in this round. Thrown errors were
already flagged by the SDK. Five of the 26 were found by an adversarial pass after
the first sweep and are worth naming, because each returned an error-shaped result
that a client would have read as success: `compose_system` with an unknown system,
`compose_system` with a **token group that matches nothing** (which additionally
returned a successful-looking *empty* composition and now fails while naming the
groups the system does have), `audit_ios_privacy` with no input and with
unparseable `app_json`, and `get_metrics_framework` with an unknown `id`.

**A negative case that is deliberately absent: DNS failure.** The earlier draft
promised `ERR_NAME_NOT_RESOLVED` in `warnings[]` for an unresolvable host. That
is **unverified and cannot be verified on the development host**: the remote
build bundles `@sparticuz/chromium`, a Linux/Lambda binary, so a macOS run fails
`spawn ENOEXEC` in ~120 ms — before DNS is ever consulted. What *is* measured is
the shape: `isError: true`, `captures: []`,
`coverage: {requested: 6, succeeded: 0, complete: false}`, a `summary` that
opens by saying the audit did not run, and the cause in `warnings[]`. The exact
cause string is environment-dependent and is not promised here.

### Tool annotations — every hint explicitly set, with justification

The second rejection reason asked for hints explicitly `true`/`false` (never
`null`) on every tool, with a justification grounded in actual behavior.

**Explicitness is enforced by construction, not by review.** Every tool is
classified in a `TOOL_ACCESS` map and `toolAnnotations()` **throws** for any tool
that is not — so a tool cannot be registered without all four hints. Verified by
probing the built server directly: on the anonymous remote build, **45 tools, 0
missing hints, 0 non-boolean values**; on the local stdio build, **111 tools, 0
missing, 0 non-boolean**.

**That measurement is of the built working tree, and the live endpoint does not
match it yet.** A live `tools/list` on 2026-08-19 returned `idempotentHint` on
**0 of 45** tools — the hint is emitted by working-tree code that has never been
committed. The table below therefore describes the surface as it will be **after
the push to `main`**, not as it is served today.

**No hint is uniform across all 45 anonymous tools.** `readOnlyHint`,
`destructiveHint` and `idempotentHint` are each uniform across **44 of 45**, with
`audit_url` the single documented exception in all three — it drives a real
browser at a caller-named URL and fires a caller-supplied interaction list, so
`readOnlyHint` and `idempotentHint` are not honestly `true` for it and
`destructiveHint` is not honestly `false`. `openWorldHint` varies across five
tools. The justification for each:

(An earlier version of this paragraph called `destructiveHint` "the uniform one"
and the table below published `false` for every tool including `audit_url`. That
was corrected on 2026-08-19 — see the `destructiveHint` row.)

| Hint | Value | Why it is true of the actual behavior |
|---|---|---|
| `readOnlyHint` | `true` on 44, **`false` on `audit_url`** | The anonymous endpoint has no writable state. Every tool that persists anything — taste profiles, decisions, saved design systems, the pattern library, grab sessions — is withheld from this surface by `REMOTE_GATED_TOOLS` and is **not registered at all** here (an anonymous call returns `Tool not found`, not a refusal). A scan of all 45 input schemas finds **no `save` / `persist` / `write` / `delete` / `overwrite` parameter**; `generate_design_system` in particular has its `save` key omitted from the schema in remote mode, and its persistence helpers fail closed under `isRemoteRuntime()`. **The exception is `audit_url`**: it navigates headless chromium to a URL the caller names and dispatches a caller-supplied interaction list at that page. The hosted build refuses the `click` event outright (enforced at the shared registration wrapper in `buildServer`, so no second registration path can bypass it), but `hover` and `focus` still dispatch **real** events, so the third-party page's own `mouseenter` / `focus` handlers run (`src/capture.ts:499`) and can submit a same-origin request or call `.click()` themselves. Narrowing the blast radius is not the same as being read-only, so the hint is published as an explicit `false` rather than justified away. |
| `destructiveHint` | `false` on 44, **`true` on `audit_url`** | The 44 follow from the same fact as `readOnlyHint`: with nothing writable in scope, those tools cannot remove or overwrite anything. The server classifies exactly 36 tools as destructive (verified: the `TOOL_IDEMPOTENT` key set and the destructive-annotated tool set are identical, 36 for 36), every one of them is in `REMOTE_GATED_TOOLS`, and none is registered on this surface — which is precisely why the other 44 can carry an honest `false`. **`audit_url` is `true`, and the reason is the same fact that makes its `readOnlyHint` false.** A hover or focus dispatched at a caller-named selector runs the third-party page's own handler, and nothing in this server can know what that handler does; a focus handler that deletes a record is a destructive update this tool caused. Publishing `false` would be a positive claim that any resulting update is only additive, and that claim cannot be made about arbitrary third-party code. `true` is also the MCP spec's own default when `readOnlyHint` is `false`, and the honest reading of "MAY perform destructive updates" — *may*, not *does*. Set by the same `toolFiresCallerInteractions()` scoping described in the `idempotentHint` row, so it is per surface rather than per tool name. |
| `idempotentHint` | `true` on 44, **`false` on `audit_url`** | A read-only tool has no side effect to repeat, so repeated calls with identical arguments add nothing. The outputs are computed, not sampled: the same input returns a byte-identical result — spot-measured on the three tools whose names most suggest generation (`generate_design_system`, `evaluate_design`, `score_creative`), each byte-identical across two consecutive calls. No tool on this surface calls a language model: the codebase contains no LLM client at all, and the only outbound HTTP calls in it are a version check and two tools (`audit_api_contract`, `raven_register`) that are gated off this surface. Idempotency is not assumed for anything that writes: every destructive tool's idempotency is enumerated in an explicit `TOOL_IDEMPOTENT` map that **defaults to `false`** (13 of the 36 are marked idempotent, 23 are not), so a tool minting an id, appending to a log, or applying a relative change is annotated `idempotentHint: false`. None of those 36 is on this surface. **`audit_url` is the exception for the same reason it is not read-only**: repeating a call re-dispatches hover and focus at a live third-party page, and whatever those handlers do happens again. Its result is not guaranteed identical either — the remote page can change between calls. Both hints are set per tool by `toolFiresCallerInteractions()` in `src/index.ts`, which also covers **local** `audit_page` (the local build accepts a `url`; the hosted build rejects one), so the scoping is per surface rather than per tool name. |

**`openWorldHint` is the third hint that varies, and it is set per tool by whether
that tool can reach the network on this surface.** Exactly five of the 45 are
`true`:

| Tool | `openWorldHint` | Justification |
|---|---|---|
| `audit_url` | `true` | Fetches an arbitrary user-supplied URL and renders it in headless chromium. |
| `audit_contrast` | `true` | Accepts a `url` and renders it; also has an offline `dom_snapshot` mode. |
| `audit_tap_targets` | `true` | Same — renders a supplied URL. |
| `audit_responsive_visibility` | `true` | Same — renders a supplied URL at multiple viewports. |
| `audit_video_playback` | `true` | Same — loads and plays media from a supplied URL. |

The other **40 are `openWorldHint: false`**, and that is a claim about this
surface specifically: they operate only on content passed in the arguments plus
knowledge bundled with the server, and nothing leaves the machine.

**Three tools deserve a note, because they are the ones the first review most
plausibly flagged as a mismatch.** `audit_page`, `score_page` and
`audit_typography` all accept a `url` on the local stdio build — where they are
correctly annotated `openWorldHint: true` — but the hosted endpoint **hard-rejects
the `url` argument** before the handler runs (see negative test case 2). They are
therefore annotated `openWorldHint: false` here, which is accurate, and their
descriptions on this surface now say the `url` argument is rejected instead of
describing a browser render. The earlier submission carried the local wording on
the hosted surface; a description promising a fetch on a tool annotated as
closed-world is exactly the kind of mismatch the rejection pointed at, and it is
corrected.

### Starter prompts

```
Audit ravenmcp.ai for contrast and tap-target failures.
Check this component against our design system before I commit it.
What are the layout problems on this screen?
```

---

## C. Open, needs Andrew

| | What | Why it blocks |
|---|---|---|
| 1 | `vercel deploy --prod` from `web/` | `ravenmcp.ai/privacy` 404s until then; both directories require a live policy URL, and `manifest.json` now points at it. |
| 2 | `npm publish` (passkey) | Annotations don't reach npm consumers, and the registry publish is gated behind it. |
| 3 | Confirm `andrew@ravenmcp.ai` receives mail | Listed as the support contact on two submissions. |
| 4 | Reviewer test account, no MFA | Only needed if an authenticated surface is submitted. Submitting the anonymous endpoint avoids it entirely — my recommendation for the first pass. |
| 5 | Team seat decision | Connectors Directory only. Everything else is open on the current plan. |
| 6 | OpenAI identity verification + domain token | Whole OpenAI channel. |
| 7 | **Push the annotation + `isError` fixes to `main`** | **This is the actual delivery of the R2 fix.** Pushing `main` deploys `mcp.ravenmcp.ai`; until then the live endpoint serves the rejected surface and every number in section B is unshipped. Human-gated (Andrew only) by standing rule. |
| 8 | Keep-or-remove call on the hosted `audit_url` **`interactions` argument** | **Both remedies this item originally offered have now been taken**, so what is left is narrower than it was. Hosted `click` is refused at the shared registration wrapper, and `readOnlyHint` / `idempotentHint` are published as explicit `false` on **both** surfaces via `toolFiresCallerInteractions()` (`src/index.ts`). The residual product call is whether the `interactions` argument should be on the anonymous surface **at all**: `hover` and `focus` still dispatch real events, so a third-party page's own handlers run (`src/capture.ts:499`) and can mutate that page. Refusing them too would make the hosted tool a plain render and let both hints go back to `true`; keeping them preserves hover/focus-state auditing. A product call, not an agent's. |
| 9 | Concurrency cap in `src/browser-launch.ts:401,403` | Proposed 2→1 for the hosted environment; changes hosted throughput, so it is Andrew's call. |
| 10 | Paste the annotation justifications into the submission form | The reviewer asked for a written justification per hint; section B's tables are the source text, but only after item 7 makes them true of the live surface. |
