# OpenAI plugin directory — RESUBMISSION copy-paste

Authored 2026-08-21. **Nothing here has been submitted.** Every value below was measured
against the LIVE anonymous endpoint on 2026-08-21, not carried over from the 2026-07-25
dossier — see §0, which exists because the carried-over version was wrong.

Companion documents, both current: `R1-test-cases.md`, `R2-annotation-justification.md`.

---

## §0 — Do not paste from `conversations/2026-07-25-submission-dossier.md`

That dossier's section B annotation table is **stale and would reintroduce R2 verbatim.**
It publishes, for `audit_url` on the hosted endpoint, `readOnlyHint: false`,
`destructiveHint: true`, `idempotentHint: false`, and lists `openWorldHint: true` on five
tools. Measured live 2026-08-21, the endpoint serves the opposite on all four, and it is
the endpoint that is correct: `audit_url` now declines on the hosted surface, and a tool
that can only decline is read-only, is idempotent, destroys nothing, and reaches no host.

That table was written when hosted `audit_url` still rendered pages. **Pasting a
justification that contradicts the live surface is the exact finding OpenAI rejected on.**
This file supersedes it.

---

## §1 — Form fields

| Field | Value |
|---|---|
| MCP server URL | `https://mcp.ravenmcp.ai/api/mcp` |
| Authentication | None. All 45 tools answer anonymously; no account, key, or reviewer credential. |
| Privacy policy | `https://ravenmcp.ai/privacy` — verified HTTP 200 on 2026-08-21 |
| Homepage | `https://ravenmcp.ai` — verified HTTP 200 |
| Domain verification | `https://ravenmcp.ai/.well-known/openai-apps-challenge` — verified HTTP 200, 43 bytes, served bare |
| Repository | `https://github.com/rhinocap/raven-mcp` |
| License | Apache-2.0 |
| Support contact | `cunliffeandrewc@gmail.com` — see the open item in §7 before choosing |

**Name**

```
Raven
```

**Description**

```
Design intelligence for coding agents. Raven audits pages, screens, and diffs for
contrast, layout, tap targets, typography, and consistency, and carries a design system
and a taste profile the agent can consult before it writes UI code — so the design
judgment survives being handed to a model.
```

**Starter prompts** — each routes to a tool that is fully functional on the hosted
endpoint. None routes to a tool that declines here.

```
Check this palette for WCAG contrast failures before I ship it.
What does our design system say the primary color and type scale are?
Grade this page's HTML for typography, spacing, and accessibility.
What are the design principles I should be applying to a pricing page?
```

---

## §2 — Response to R1 (test cases that did not reproduce)

**The finding was correct and the cause was ours.** The submitted cases recorded *captured
numbers taken off a live, changing input* — our own marketing site, which we redeploy. The
expectation "373 text elements" reads 344 today. Nothing regressed; the input moved. A
third case (`get_principles`, submitted as 28, returns 26) had the same defect and simply
was not flagged.

**The fix is structural, not a re-capture.** Every case below either supplies its entire
input inline — so the expected output is a pure function of the request the reviewer
pastes — or states an invariant that is stable under corpus growth. No case depends on a
URL we control, on page content, or on a headless browser run.

All eight were replayed verbatim against production on **2026-08-21: 8 cases, 9 calls,
0 failing.**

### Positive cases

**P1 — `audit_contrast`, fully pinned input.** Two rows supplied inline
(`#111111` on `#ffffff`, `#bbbbbb` on `#ffffff`, both 16px non-bold).
Expected: `total_text_elements` 2; `p.ok` → `pass`, ratio `18.88`, `aa` true;
`p.fail` → `fail`, ratio `1.92`, `delta_to_aa` `2.58`; `aa_fail_count` 1.
These are WCAG relative-luminance computations over constants and cannot drift.

**P2 — `audit_tap_targets`, pinned elements.** `48×48` and `20×20` supplied inline.
Expected: `minSize` 44, `total` 2, `passing` 1, `failing` 1; `fix_table` holds exactly the
`20×20` entry with `deficit_w` 24 and `deficit_h` 24.

**P3 — `get_principles`, stated as an invariant.** Expected: response parses with
`context`, `category`, `count`, `principles`; `count === principles.length` and
`count >= 20`; every principle carries non-empty `id`, `name`, `category`, `summary`; the
set includes id `color-palette-discipline`. **The count is deliberately not the
expectation** — pinning it would re-create the R1 defect. (It is 26 today.)

**P4 — `list_design_systems` + `get_design_system`.** Expected: `count === systems.length`
and the set includes `stripe`, `linear`, `apple-hig`, `material-design`; the exact count is
not the expectation. Then `get_design_system` for `stripe` returns `primary.$value` exactly
`#635BFF` — a shipped brand constant in tracked repo data, which is why it is safe to pin
where the counts are not.

**P5 — `get_checklist`.** Expected: `pattern_match` `"matched"`, `platform`
`"responsive"`, and a `pattern_checklists` entry with `source` `"Landing Page"` and a
non-empty `items` array. The item count is not pinned.

### Negative cases

**N1 — `audit_url` declines on the hosted endpoint and says why.** Expected: HTTP 200
carrying a JSON-RPC *result* with `isError: true`, whose text contains verbatim
`audit_url is disabled on the hosted (remote) endpoint`, the measured reason, and the two
routes that do work (`npx raven-mcp`, `audit_page`). Sub-second in every observed run
against a 95 s floor — the ratio is the point, not the millisecond figure.

**N2 — a hosted tool that CAN reach the web is not swept up in the decline.**
`audit_contrast` with `url: "https://example.com"` is *not* declined: no `isError`, and
the payload carries the `url` field and a text tally. **The tallies are explicitly not the
expectation** — `example.com` is not ours. This case exists to prove the refusal is scoped
to one tool rather than applied blanket-fashion, and it is the direct behavioural evidence
for `openWorldHint: true` on this tool.

**N3 — missing required argument, and the transport shape is the point.**
`get_design_system` with `{}` returns HTTP 200 with a JSON-RPC *result* carrying
`isError: true` — **not** a top-level JSON-RPC `error` object. `content[0].text` begins
`MCP error -32602: Input validation error:` and the body names `"path": ["id"]`,
`"expected": "string"`, `"received": "undefined"`, `"message": "Required"`.
**A reviewer scripting this case must read `result.isError`, not `response.error.code`,
which is `undefined` on this surface.** The local stdio build returns the same shape
(measured), so the validation content is schema-derived and stable while only the envelope
is transport-specific.

> **Recorded rather than quietly patched:** our own earlier draft of N3 expected a
> protocol-level `-32602` error object and claimed to have measured it. It had not, and
> the explanation first offered for it — that the local stdio build returns that envelope —
> was also unmeasured, and is false. That is the R1 failure class reproduced *inside the
> document written to fix R1*, found by replaying all eight cases against production.
> The general lesson is now the standard we hold ourselves to: **transport shapes an
> error's form, so an expected value must name the surface it was measured on** — and a
> correction that explains a defect by naming a different surface must measure that
> surface too.

### How to reproduce all eight

Every case is a single `tools/call` POST to `https://mcp.ravenmcp.ai/api/mcp` with no
authentication, no fixture file and no local checkout. Seven return in well under a
second; **N2 is the exception at roughly 0.7–4 s, because it is the one case that
deliberately renders a live external page** — that latency is the evidence for its
`openWorldHint: true`, not an anomaly. **Latencies are context, never expectations.**

---

## §3 — Response to R2 (annotations that do not match behaviour)

### Every hint is an explicit boolean by construction, not by convention

`toolAnnotations()` is the single function every tool registration passes through. It
emits all four hints as literal booleans and **throws** for any tool not classified in the
`TOOL_ACCESS` map — an unclassified tool fails to register and the server does not start.
`null` is unreachable rather than merely avoided.

**Measured live on `https://mcp.ravenmcp.ai/api/mcp`, 2026-08-21:** 45 tools;
`readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` each a boolean on
**45 of 45**; `title` present on 45 of 45.

### The live values, and why each is true of the actual behaviour

| Hint | Live value | Justification |
|---|---|---|
| `readOnlyHint` | `true` on 45/45 | The anonymous endpoint has no writable state. Every tool that persists anything — taste profiles, decisions, saved design systems, the pattern library, grab sessions — is withheld from this surface and is **not registered at all** (an anonymous call returns `Tool not found`, not a refusal). A scan of all 45 input schemas finds no `save`/`persist`/`write`/`delete`/`overwrite` parameter; `generate_design_system` has its `save` key omitted from the remote schema, and its persistence helper additionally throws under `isRemoteRuntime()`. |
| `destructiveHint` | `false` on 45/45 | Follows from the same fact: with nothing writable in scope, these tools cannot remove or overwrite anything. The server classifies 36 tools as destructive; every one is gated off this surface. |
| `idempotentHint` | `true` on 45/45 | These outputs are computed, not sampled — the same input returns a byte-identical result. **No tool on this surface calls a language model.** The package has four runtime dependencies (`@modelcontextprotocol/sdk`, `@upstash/redis`, `jose`, `zod`) and no LLM SDK among them, and every source file that issues an outbound `fetch()` backs a tool that is **not registered on this surface** — verified live, tool by tool. Idempotency is never assumed for anything that writes: an explicit `TOOL_IDEMPOTENT` map covers all 36 destructive tools, **defaults to `false`**, and marks **28 of the 36** non-idempotent, each with a written reason. None of the 36 is served here. |
| `openWorldHint` | `true` on **exactly 4**, `false` on 41 | `true` on `audit_contrast`, `audit_tap_targets`, `audit_responsive_visibility`, `audit_video_playback` — each renders or loads a caller-supplied URL, and N2 above is live behavioural proof for the first. `false` on the other 41: they operate only on content passed in the arguments plus knowledge bundled with the server. |

### What was actually wrong, and what fixed it

**The deployed defect was narrower than our own first analysis assumed, and we measured it
rather than reasoning about it.** Before the fix, the endpoint served `audit_url` with
`openWorldHint: true` **and no `idempotentHint` key at all**. The read-only and destructive
hints were already correct. So the two real deltas were a missing hint and an
`openWorldHint` of `true` on a tool that cannot reach any host — because `audit_url`,
`audit_page`, `score_page` and `audit_typography` reach the open web only through a `url`
argument that the hosted build rejects **before the handler is entered.**

The fix is that the hint is now **derived from the guard rather than written out as a
second list**:

```
openWorld = TOOL_OPEN_WORLD.includes(tool) && !(remote && remoteBlocksNetwork(tool))
```

`remoteBlocksNetwork` reads the same guard table the request wrapper itself enforces, so
lifting a guard moves the annotation in the same edit and the two cannot drift apart.
**This is the structural answer to R2**: the previous mismatch was possible because the
annotation and the behaviour were two independent statements. They are now one.

The same derivation covers the interaction hints. Our first attempt at this fix hardcoded
`audit_url` as unconditionally interaction-firing, which made the endpoint publish
`readOnlyHint: false` / `destructiveHint: true` for a tool that can only decline — **the
identical annotation-mismatch finding, reintroduced by the fix for it.** Reading the guard
table is what makes that unrepeatable.

### Descriptions were corrected in the same round

A description promising a browser fetch, on a tool annotated closed-world, is the same
mismatch in prose. Verified live 2026-08-21: `audit_url`, `audit_page`, `score_page` and
`audit_typography` each carry an explicit sentence on the hosted surface stating that the
`url` argument is disabled there and naming the route that does work.

### Why `audit_url` declines rather than being removed

`audit_url` drives a real browser through every requested viewport and theme. We measured
it at **95 s in its cheapest possible configuration** and past 120 s with defaults —
beyond the per-call budget of hosted clients, so every hosted call to it was going to end
as a timeout regardless of what the tool does. **A decline in 200 ms is a true answer; a
timeout at 120 s is not an answer at all.** It stays registered so a client discovers the
limitation from the tool's own description and its own answer, rather than from a hang.

### What did not change

No tool was added or removed. The endpoint serves exactly 45 tools, and the sha256 of its
newline-joined sorted tool names is unchanged at
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — **verified live
2026-08-21, exact match.** The `tools/list` payload does change, because the annotations
inside it are what this round corrects; the tool set does not.

---

## §4 — Optional short cover note

Short enough for a constrained free-text field:

```
Both findings were correct and both causes were ours.

R1: our test cases recorded numbers captured off a live page we redeploy, so they were
snapshots, not expectations. Every case is rewritten to supply its input inline or to
state an invariant, so the expected output is a pure function of the request you paste.
No case now depends on a URL we control, on page content, or on a browser run. All eight
were replayed verbatim against production on 2026-08-21: 8 cases, 0 failing.

R2: audit_url, audit_page, score_page and audit_typography reach the network only through
a url argument that the hosted build rejects before the handler runs, yet they published
openWorldHint: true — and audit_url was missing idempotentHint entirely. All four hints
are now explicit booleans on 45 of 45 tools, and openWorldHint is derived from the same
guard table the request wrapper enforces, so an annotation and the behaviour it describes
can no longer drift apart. The tool descriptions were corrected in the same round.

The tool set is unchanged: still exactly 45 anonymous tools, same sha256 of sorted names.
```

---

## §5 — Verify any of this in one command

```
curl -s https://mcp.ravenmcp.ai/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

No authentication. Every claim in §3 is readable off that one response.

---

## §6 — Measured state at authoring time (2026-08-21)

| Check | Result |
|---|---|
| Live `tools/list` | HTTP 200, 45 tools |
| Frozen anon name hash | `f64bb185…7bb0a6`, exact match |
| All four hints boolean | 45/45 on each |
| `openWorldHint: true` set | exactly 4, all genuinely network-reaching |
| Hosted decline sentence in description | present on all 4 guarded tools |
| Eight-case production replay | 8 cases / 9 calls / **0 failing** |
| `ravenmcp.ai/privacy` | HTTP 200 |
| `/.well-known/openai-apps-challenge` | HTTP 200, 43 bytes |

---

## §7 — Open before Andrew submits

1. **Support contact.** `andrew@ravenmcp.ai` was never confirmed to receive mail; a bounce
   reads to a reviewer as an abandoned submission. §1 defaults to the Gmail address that
   is known to work. Swap it only after sending a test message to the custom domain.
2. **Identity verification** in the OpenAI Platform dashboard — Andrew only.
3. **The submission itself.** Every artifact is ready and every claim is measured; sending
   it is Andrew's call, not an agent's.
