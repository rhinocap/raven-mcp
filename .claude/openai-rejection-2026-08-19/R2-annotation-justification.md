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

## 3b. Two tools drive a real browser against a caller-supplied page, and are annotated as destructive even though they read

`audit_url` (always) and `audit_page` (local builds only) are classified read-only in the
sense that they compute a report, but they **launch a browser and fire interactions —
hovers, focus, and clicks — against an address the caller supplies.** A click on someone
else's page is not a read: it can submit a form, follow a link, or trigger any action that
page exposes. Both therefore publish `readOnlyHint: false`, `destructiveHint: true`,
`idempotentHint: false`, since neither the remote page's state nor the result is
guaranteed to repeat.

`audit_page` is conditional because the hosted build refuses click interactions outright,
so the hosted surface does not carry the caller-interaction risk that the local one does.
This is a dedicated branch in `toolAnnotations()`, not an entry in a table, precisely so
the hint is computed from the surface rather than transcribed.

## 4. Read-only tools

Every tool classified `readOnly` performs no writes of any kind and is safe to call
repeatedly: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`. This
covers the audit family, the knowledge lookups, and the design-system generators, all of
which are pure functions of their arguments plus bundled data.

## 5. `openWorldHint` is derived PER SURFACE, and this is where the reviewed endpoint changed

`openWorldHint` defaults to `true` in the MCP spec, so the load-bearing statement is the
explicit `false` on everything else: those tools read bundled knowledge, local state, or
caller-pasted markup, and never reach an unpredictable host.

Twelve tools take a caller-supplied URL and drive a real browser or fetch against it:
`audit_url`, `audit_contrast`, `audit_tap_targets`, `audit_responsive_visibility`,
`audit_video_playback`, `audit_taste`, `audit_page`, `score_page`, `audit_typography`,
`audit_api_contract`, `audit` (a dispatcher over the same set), and `design_gauntlet`.
`init_design_md` is deliberately absent — its fetch targets one fixed starter base URL, a
closed set, not an open world.

**That list is true of stdio and was FALSE on the hosted endpoint for three of its
members, which is the annotation/behaviour mismatch.** `audit_page`, `score_page` and
`audit_typography` reach the open web only through a `url` argument, and the hosted build
rejects that argument before the handler ever runs. On `mcp.ravenmcp.ai` they cannot leave
the machine at all — yet they were published as `openWorldHint: true`. An annotation that
does not match the behaviour is exactly the finding.

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
