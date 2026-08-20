# R2 — annotation justification (draft for Andrew to paste into the submission form)

> OpenAI's finding, verbatim: "One or more of your tool's annotations do not appear to
> match the tool's behavior. Please confirm annotations are explicitly set to true or
> false (not null) for every tool. Include a clear justification for why the hint is set
> that way based on the tool's actual behavior."

## 1. Every hint is an explicit boolean, by construction — not by convention

`toolAnnotations()` (src/index.ts) is the single function every tool registration passes
through. It emits `readOnlyHint`, `destructiveHint`, `idempotentHint` and
`openWorldHint` as literal booleans on every tool, and it **throws at build time** if a
tool is not classified in `TOOL_ACCESS`. There is no default-through path and no way for
a tool to ship with a missing or null hint: an unclassified tool fails to register, so
the server cannot start. `null` is therefore unreachable rather than merely avoided.

## 2. `idempotentHint` means end state, not response bytes

We read `idempotentHint: true` as: calling the tool twice with identical arguments leaves
the same end state. Auditing that claim tool by tool found five tools where it was
over-claimed, and all five are corrected. Over-claiming is the finding; under-claiming
costs a client one retry, so the default in this map is `false` and a `true` has to be
earned.

| Tool | Was | Now | Why (actual behaviour) |
|---|---|---|---|
| `create_brand_profile` | true | **false** | `writeCreativeRecord` rewrites `updated_at` on every call, so a repeat leaves a different record. |
| `raven_register` | true | **false** | Each call POSTs to the registration API; a repeat sends a second welcome email. |
| `decision_get` | true | **false** | A read of the decision graph, but it appends a line to `consultations.jsonl` on every call, so the store differs after the second call. |
| `decision_list` | true | **false** | Same — it records its own consultation trace per call. |
| `bind_taste_surface` | true | **false** | Persists a fresh `bound_at` timestamp on every bind. |

**Which surface these five are on, measured rather than inferred.** Four
(`create_brand_profile`, `raven_register`, `decision_get`, `decision_list`) are stdio-only
— absent from both hosted surfaces. One, `bind_taste_surface`, IS served on the
authenticated hosted endpoint. **None of the five is on the anonymous endpoint under
review.** Measured by building each surface and listing its registered tools:
`buildServer({remote:false})` → 111 tools; `buildServer({remote:true})` → **45**;
`buildServer({remote:true, tasteStore})` → 56 (the 45 plus 11 taste tools, which register
only when a store is supplied). So these five corrections harden the wider product; the
annotation changes that reach the reviewed 45 are the `openWorldHint` corrections in §5.

## 3. Two consultation-logging reads are annotated conservatively, deliberately

`decision_get` and `decision_list` read the decision graph and return no destructive
result to the caller — but they append a consultation record as a side effect. We have
kept `destructiveHint: true` on both rather than presenting a side-effecting call as a
pure read. The hint describes what the call does to the server's state, and these calls
write. A client that treats them as retry-unsafe and requiring consent is behaving
correctly for what actually happens.

## 3b. Two tools drive a real browser against a caller-supplied page, and both are annotated PER SURFACE

`audit_url` and `audit_page` compute a report, but on a build that can actually run them
they **launch a browser and fire interactions — hovers, focus, and clicks — against an
address the caller supplies.** A click on someone else's page is not a read: it can submit
a form, follow a link, or trigger any action that page exposes. A caller-named hover or
focus is no safer in kind, because it runs that page's own handler and nothing here can
know what the handler does. On a build that can run them, both therefore publish
`readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`.

**On the hosted endpoint neither of them can run at all, and the annotations say so.**
Both take their target through a `url` argument that the hosted build rejects before the
handler is entered, so on `mcp.ravenmcp.ai` they publish `readOnlyHint: true`,
`destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` — a tool that can
only decline is read-only, repeating a decline changes nothing, and a decline reaches no
host.

**What actually changed on the DEPLOYED endpoint, measured rather than reasoned.** Before
commit `ba8f0b3`, `mcp.ravenmcp.ai` served `audit_url` as
`{ readOnlyHint: true, destructiveHint: false, openWorldHint: true }` with **no
`idempotentHint` key at all**. So the deployed defect was narrower than the local
reasoning above assumed: the read-only and destructive hints were already correct on the
hosted surface, and the two real deltas were an `openWorldHint` of `true` on a tool that
cannot reach any host, and a missing hint. Both are fixed; §8 is the measured proof.

The verdict is **derived, not transcribed**:

```
toolFiresCallerInteractions(tool, remote)
  = (tool === "audit_url" || tool === "audit_page")
    && !(remote && remoteBlocksNetwork(tool))
```

`remoteBlocksNetwork` reads the same guard table the request wrapper enforces, so lifting a
guard moves the annotation in the same edit. The first version of this fix hardcoded
`audit_url` as unconditionally interaction-firing; once its `url` was guarded, that made the
endpoint publish `readOnlyHint: false` / `destructiveHint: true` for a tool that can only
decline — **the identical annotation-does-not-match-behaviour finding, reintroduced by the
fix for it.** Reading the table is what makes that unrepeatable.

## 4. Read-only tools

Almost every tool classified `readOnly` performs no writes of any kind and is safe to
call repeatedly: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.
This covers the audit family and the knowledge lookups, which are pure functions of their
arguments plus bundled data.

**One tool in that class is read-only on the hosted endpoint and NOT on a local stdio
install, and its hint is derived per surface rather than asserted.** `generate_design_system`
accepts `save: true`, which persists the generated token set to `~/.raven/design-systems`
via `saveUserSystem()` (`src/user-systems.ts:139`, an unconditional `writeFileSync` — a
re-save under the same id overwrites). That write is unreachable on `mcp.ravenmcp.ai`: the
`save` key is omitted from the remote schema entirely, and `saveUserSystem` additionally
throws when `isRemoteRuntime()` is set. So the annotation is computed with the same gate
the registration wrapper uses:

```
writesLocally = TOOL_LOCAL_ONLY_WRITE.includes(tool) && !remote && !isRemoteRuntime()
readOnlyHint    = !writesLocally
destructiveHint =  writesLocally
```

Measured on all three builds: stdio publishes `readOnlyHint: false, destructiveHint: true`,
and both the anonymous and authenticated hosted builds publish `readOnlyHint: true,
destructiveHint: false`. `destructiveHint` follows `readOnlyHint` because the reachable
write is an overwrite, which is a destructive update rather than an append.
`idempotentHint` stays `true` on every surface: the same arguments write the same bytes,
so calling twice leaves the same end state.

A blanket reclassification would have been wrong in the other direction — it would publish
`destructiveHint: true` on an endpoint that cannot write at all.

## 5. `openWorldHint` is derived PER SURFACE, and this is where the reviewed endpoint changed

`openWorldHint` defaults to `true` in the MCP spec, so the load-bearing statement is the
explicit `false` on everything else: those tools read bundled knowledge, local state, or
caller-pasted markup, and never reach an unpredictable host.

Fourteen tools take a caller-supplied URL and drive a real browser or fetch against it.
Measured off a built `remote:false` server rather than transcribed: `audit`,
`audit_api_contract`, `audit_contrast`, `audit_page`, `audit_responsive_visibility`,
`audit_tap_targets`, `audit_taste`, `audit_typography`, `audit_url`,
`audit_video_playback`, `bind_taste_surface`, `design_gauntlet`, `score_page`,
`talon_scan`.

Two of those — `bind_taste_surface` and `talon_scan` — were published as
`openWorldHint: false` and are corrected in this round. `bind_taste_surface` captures each
`references[].url` live to derive page traits (`src/index.ts:8567`); `talon_scan` renders a
caller-supplied `url`. Both genuinely leave the machine, so `false` was the same class of
mismatch as the three below. `bind_taste_surface` is served on the AUTHENTICATED hosted
surface and keeps `openWorldHint: true` there, because no `url` guard applies to it — that
is a live fact about a hosted tool fetching caller-supplied addresses, and it is now
annotated honestly rather than understated. `talon_scan` is not served on either hosted
surface.

`init_design_md` is deliberately absent — its fetch targets one fixed starter base URL, a
closed set, not an open world.

**That list is true of stdio and was FALSE on the hosted endpoint for four of its
members, which is the annotation/behaviour mismatch.** `audit_page`, `score_page`,
`audit_typography` and `audit_url` reach the open web only through a `url` argument, and
the hosted build rejects that argument before the handler ever runs. On `mcp.ravenmcp.ai`
they cannot leave the machine at all — yet they were published as `openWorldHint: true`.
An annotation that does not match the behaviour is exactly the finding.

(`audit_url` joins that set in this round: its `url` was not guarded when the first three
were audited. See §7 — it was guarded for a latency reason, and the annotation followed
automatically because it is derived from the guard rather than written out separately.
That is the property this whole section is arguing for, observed working.)

The hint is now computed as:

```
openWorld = TOOL_OPEN_WORLD.includes(tool) && !(remote && remoteBlocksNetwork(tool))
```

where `remoteBlocksNetwork` reads the guard table that the request wrapper itself
enforces. The remote answer is **derived from the guard rather than written out as a
second list**, so lifting a guard moves the annotation in the same edit and the two cannot
drift apart.

## 6. What did not change

No tool was added or removed. The anonymous endpoint still serves exactly 45 tools, and
the sha256 of its newline-joined sorted tool names is unchanged at
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — re-measured against a
locally built `remote:true` server, an exact match to the frozen value. The `tools/list`
payload does change, because the annotations inside it are what this round corrects; the
tool SET does not.

## 7. `audit_url` declines on the hosted endpoint, and the annotations describe the decline

This is where R2 and R1 meet, so it is stated plainly rather than left implicit.

`audit_url` drives a real browser through every requested viewport and theme. We measured
it at **95 seconds in its cheapest possible configuration** — one viewport, one theme,
`scroll_settle:false`, `compact:true` — and past 120 seconds with its defaults. That is
beyond the per-call budget of the hosted clients that call it, so on the hosted endpoint
every call to it was going to end as a timeout regardless of what the tool does.

**A decline in 200ms is a true answer; a timeout at 120s is not an answer at all.** The
hosted endpoint therefore rejects `audit_url`'s `url` argument outright and returns a
refusal that names both routes out: run the tool locally (`npx raven-mcp`), where there is
no request deadline, or pass the page's HTML to `audit_page` here for a static grade.

The tool remains **registered** rather than removed. Removing it would have changed the
tool set on an endpoint whose set is deliberately frozen; keeping it registered and always
declining means a client discovers the limitation from the tool's own description and its
own answer, rather than from a hang.

Three consequences for the annotations, all derived rather than asserted:

- `openWorldHint: false` on the hosted surface (§5) — it reaches no host.
- `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` on the hosted
  surface (§3b) — a decline reads nothing, writes nothing, and repeats identically.
- The sentence appended to the hosted description **is the refusal string itself**, not a
  paraphrase of it. One string, so the description and the behaviour cannot drift.

On a local stdio install nothing about `audit_url` changed: it still runs, and it still
publishes `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`,
`openWorldHint: true`.

---

## 8. Per-tool declaration — read off the DEPLOYED endpoint, 2026-08-20

OpenAI's guidance asks for a justification for **each** tool. The sections above justify
by class, because that is how the values are produced — no hint anywhere in this server is
hand-written per tool. This section is the resulting per-tool surface, fetched from
`https://mcp.ravenmcp.ai/api/mcp` via `tools/list` after commit `ba8f0b3`. It is a
measurement of what a reviewer receives, not a transcription of source.

**Three facts a reviewer can check in one pass:**

1. **45 tools, and all four hints are present and boolean on every one of them.**
   Measured: 0 absent, 0 non-boolean, across 45 × 4 = 180 values. This is the §1 claim
   ("explicit boolean, by construction") stated as a number.
2. **On this surface every tool is `readOnlyHint: true`, `destructiveHint: false`,
   `idempotentHint: true` — all 45, no exceptions.** That is not a coincidence and not a
   blanket default: the anonymous endpoint deliberately serves only the read-only subset
   of the server. The tools that legitimately write, log, or fire browser interactions
   (and are therefore annotated `readOnlyHint: false` / `destructiveHint: true`, per §3
   and §3b) are **not registered on this surface at all** — they are gated, and a
   `tools/call` for one answers "Tool not found" rather than being refused at runtime.
   §3 and §3b describe the local `npx raven-mcp` surface; they are included because the
   same package ships both, and the annotations differ between them by derivation.
3. **`openWorldHint` is the only axis that varies here, and it splits 4 / 41.** The four
   `true` are exactly the tools that fetch a caller-supplied address on this endpoint:
   `audit_contrast`, `audit_responsive_visibility`, `audit_tap_targets`,
   `audit_video_playback`. Test case N2 demonstrates one of them actually reaching the
   open web from the hosted endpoint; test case N1 demonstrates `audit_url`, now
   `openWorldHint: false`, declining without a network attempt in 0.304 s. **The two
   directions are both evidenced** — a fix that flipped every tool to `false` would
   satisfy N1 and fail N2.

| Tool | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- |
| `audit_consistency` | `true` | `false` | `true` | `false` |
| `audit_content` | `true` | `false` | `true` | `false` |
| `audit_contrast` | `true` | `false` | `true` | `true` |
| `audit_ios_a11y` | `true` | `false` | `true` | `false` |
| `audit_ios_privacy` | `true` | `false` | `true` | `false` |
| `audit_ios_screen` | `true` | `false` | `true` | `false` |
| `audit_layout` | `true` | `false` | `true` | `false` |
| `audit_page` | `true` | `false` | `true` | `false` |
| `audit_parity` | `true` | `false` | `true` | `false` |
| `audit_responsive_visibility` | `true` | `false` | `true` | `true` |
| `audit_rn` | `true` | `false` | `true` | `false` |
| `audit_screen` | `true` | `false` | `true` | `false` |
| `audit_swiftui` | `true` | `false` | `true` | `false` |
| `audit_tap_targets` | `true` | `false` | `true` | `true` |
| `audit_typography` | `true` | `false` | `true` | `false` |
| `audit_url` | `true` | `false` | `true` | `false` |
| `audit_video_playback` | `true` | `false` | `true` | `true` |
| `compose_system` | `true` | `false` | `true` | `false` |
| `evaluate_design` | `true` | `false` | `true` | `false` |
| `generate_design_system` | `true` | `false` | `true` | `false` |
| `generate_service_blueprint` | `true` | `false` | `true` | `false` |
| `get_brand_principles` | `true` | `false` | `true` | `false` |
| `get_brand_system` | `true` | `false` | `true` | `false` |
| `get_brand_trends` | `true` | `false` | `true` | `false` |
| `get_business_strategy` | `true` | `false` | `true` | `false` |
| `get_checklist` | `true` | `false` | `true` | `false` |
| `get_content_pattern` | `true` | `false` | `true` | `false` |
| `get_content_principles` | `true` | `false` | `true` | `false` |
| `get_content_system` | `true` | `false` | `true` | `false` |
| `get_d4d_framework` | `true` | `false` | `true` | `false` |
| `get_design_system` | `true` | `false` | `true` | `false` |
| `get_metrics_framework` | `true` | `false` | `true` | `false` |
| `get_pattern` | `true` | `false` | `true` | `false` |
| `get_principles` | `true` | `false` | `true` | `false` |
| `get_research_method` | `true` | `false` | `true` | `false` |
| `get_service_pattern` | `true` | `false` | `true` | `false` |
| `get_service_standard` | `true` | `false` | `true` | `false` |
| `list_content_systems` | `true` | `false` | `true` | `false` |
| `list_creative_models` | `true` | `false` | `true` | `false` |
| `list_creative_presets` | `true` | `false` | `true` | `false` |
| `list_design_systems` | `true` | `false` | `true` | `false` |
| `score_creative` | `true` | `false` | `true` | `false` |
| `score_page` | `true` | `false` | `true` | `false` |
| `search_knowledge` | `true` | `false` | `true` | `false` |
| `suggest_contrast_fix` | `true` | `false` | `true` | `false` |

*(Generated by `tools/list` against the production alias; the tool set hashes to the
frozen anonymous-surface digest `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, unchanged by this remediation.)*
