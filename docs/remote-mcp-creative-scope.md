# Raven MCP — Phase 4.6 (proposed): Per-User Authenticated Creative Engine (Remote) — Scope Document

**Status: WRITTEN, NOT BUILT.** This is the P4.5 follow-on scope deliverable — a design for exposing a creative/brand/generation subset on `/api/mcp-user`, mirroring exactly how the Phase 4 Taste Engine subset was un-gated. No code in this repo changes as a result of this document.

## 0) Why this is a separate phase, not an extension of P4.3

The taste subset (P4.2→P4.4) was un-gated because every one of its 10 tools reduces to **synchronous read/write against a small JSON blob per project name**, and the Redis primitives (`get`/`set`/`sadd`/`rpush`/`lrange`) map onto that shape 1:1. The creative subset shares the store-injection pattern but adds two problems the taste subset never had: **large binary reference inputs** (images/video, §5) and **a genuinely asynchronous job model** (§4). Those are real deltas, not just "more tools," which is why this is scoped as its own phase rather than folded into P4.3/P4.5.

## 1) Candidate tools

All ten currently sit in `REMOTE_GATED_TOOLS` (src/index.ts:1599) as stateful/local, and none are in `AUTHED_USER_TASTE_TOOLS` (src/index.ts:1637) today — the taste subset never touched them. Per-user state each needs if un-gated:

| Tool | Per-user state needed |
|---|---|
| `create_brand_profile` | Write `brand:{sub}:profile:{id}` (name, colors, fonts, tone, audience, product, constraints, asset_ids) + index entry. |
| `get_brand_profile` | Read `brand:{sub}:profile:{id}`. |
| `list_brand_profiles` | Read the per-user brand index set + hydrate each summary. |
| `register_creative_asset` | Write `creative:{sub}:asset:{id}` (uri/path, type, tags, metadata) + index. Local-path existence check (`fsExists`) is meaningless for a remote caller's machine — see §5, this tool is the one that most wants an out-of-band upload instead of a bare `uri` string. |
| `create_character_profile` | Write `creative:{sub}:character:{id}`, plus **reads back** the caller's own `asset:{id}` records to resolve `reference_asset_ids` into a training payload — same per-user namespace as assets, not a separate one. |
| `create_generation_job` | Write `job:{sub}:{id}` (draft/queued state + provider payload) + index; if `execute:true`, hand off to the async worker in §4 instead of `runCreativeRunner`'s local `spawnSync`. |
| `get_generation_job` | Read `job:{sub}:{id}` — this is also the **poll** endpoint for the async model in §4, so its per-user state now includes job status that mutates out-of-band (by the worker), not just by the owning tool call. |
| `list_generation_jobs` | Read the per-user job index, filtered/sorted, same shape as `list_generation_records` today. |
| `plan_creative_campaign` | Writes one or more `job:{sub}:{id}` records (the multi-asset draft jobs it spins up) — no new state shape, just N writes through the same job store. |
| `score_creative`'s `brand_profile_id` path | Read-only `brand:{sub}:profile:{id}` lookup to fold brand context into an otherwise-stateless score. Today this path is arg-guarded off remotely (src/index.ts:1682); un-gating it needs the same store, not a new one. |

Net new store surfaces: **brands**, **assets**, **characters**, **jobs** — four record kinds, all namespaced under the same `sub`, no new *kind* of state beyond "namespaced JSON record + index set," which is exactly the taste subset's shape.

## 2) The gating latch

Nothing about the remote-safety mechanism changes. The invariant that made P4.2–P4.4 safe by construction is:

> **A tool only registers on the remote authed path if BOTH `remote===true` AND a per-user store was injected into `buildServer()`.** The anonymous endpoint (`api/mcp.js`) never injects a store, so `hasUserStore` is always `false` there — its 45-tool surface cannot change no matter what gets added to any authed-only set, by construction, not by convention.

Concretely, this proposal adds:

```ts
const AUTHED_USER_CREATIVE_TOOLS = new Set<string>([
  "create_brand_profile", "get_brand_profile", "list_brand_profiles",
  "register_creative_asset", "create_character_profile",
  "create_generation_job", "get_generation_job", "list_generation_jobs",
  "plan_creative_campaign"
  // score_creative is NOT in this set — it already registers remotely today
  // (stateless path); only its brand_profile_id ARG GUARD needs conditional
  // relaxation when hasUserStore, handled in the wrapper, not by adding the
  // whole tool to a gate set.
]);
```

and the wrapper's existing gate check (src/index.ts ~1738):

```ts
if (remote && REMOTE_GATED_TOOLS.has(toolName)
    && !(hasUserStore && AUTHED_USER_TASTE_TOOLS.has(toolName))
    && !(hasUserStore && AUTHED_USER_CREATIVE_TOOLS.has(toolName))) {
  return undefined;
}
```

(Or fold both sets into one `AUTHED_USER_TOOLS` — cosmetic; the two-set form documents which subset shipped in which phase, matching how P4.3 widened `AUTHED_USER_TASTE_TOOLS` from a 3-tool trio to all 10 in place rather than introducing a second set.)

`score_creative`'s `brand_profile_id` guard in `REMOTE_ARG_GUARDS` (src/index.ts:1682) needs the same `hasUserStore`-conditional relaxation the taste subset's `project`/`profile` guards never needed (those tools were fully gated, not arg-guarded) — this is the one spot where an *already-remote-safe* tool gains a new authed-only argument path rather than a whole new tool being un-gated. The guard becomes: reject `brand_profile_id` unless `remote && hasUserStore`, in which case resolve it against `RedisBrandStore(sub)` instead of the local fs.

**Invariant restated for this phase:** anon 45-tool surface is unaffected by adding entries to `AUTHED_USER_CREATIVE_TOOLS` or by relaxing `score_creative`'s guard behind `hasUserStore`, because the anon endpoint never sets `hasUserStore`. This is the same proof structure as P4.2–P4.4; no new reasoning is required, only a new set.

## 3) `RedisBrandStore(sub)`

Per-request, per-user, constructed from the verified JWT `sub` and injected into `buildServer()` exactly like `RedisTasteStore` — never module-level (same Fluid-Compute concurrent-request isolation argument as `taste-store-redis.ts`'s header comment).

**Proposed key layout**, following `taste:{sub}:...`'s pattern:

```
brand:{sub}:profile:{id}       brand profile JSON
brand:{sub}:profiles           SET index of brand profile IDs
creative:{sub}:asset:{id}      creative asset JSON
creative:{sub}:assets          SET index of asset IDs
creative:{sub}:character:{id}  character profile JSON
creative:{sub}:characters      SET index of character IDs
job:{sub}:{id}                 generation job JSON (status mutates async — see §4)
job:{sub}:jobs                 SET index of job IDs (or a sorted set on updated_at,
                                 since list_generation_jobs sorts by updated_at today —
                                 a plain SET means list still needs N `get`s to sort,
                                 same cost `RedisTasteStore.listProfiles` already pays)
```

No `decisions`-style LIST kind is needed here — nothing in the creative subset has taste's append-only-log shape (no analog of `record_taste_decision`).

**Interface**, optional-methods, mirroring `TasteStore`'s pattern in `taste-store.js` so `FsTasteStore`/`ClosedTasteStore` stay byte-identical and untouched:

```ts
export interface CreativeStore {
  getBrand?(id: string): Promise<unknown | null>;
  putBrand?(profile: unknown): Promise<void>;
  listBrands?(): Promise<Array<{ id: string; raw: unknown }>>;

  getAsset?(id: string): Promise<unknown | null>;
  putAsset?(asset: unknown): Promise<void>;

  getCharacter?(id: string): Promise<unknown | null>;
  putCharacter?(character: unknown): Promise<void>;

  getJob?(id: string): Promise<unknown | null>;
  putJob?(job: unknown): Promise<void>;
  listJobs?(): Promise<Array<{ id: string; raw: unknown }>>;
}
```

Every method is optional (all `?`) for the same reason `TasteStore`'s stayed a strict required interface only after `FsTasteStore`/`ClosedTasteStore`/`RedisTasteStore` all implemented it fully — a `CreativeStore` has no `Fs`/`Closed` implementors planned (creative tools are remote-authed-only from birth; there is no local-stdio creative store to keep byte-identical), so making the methods optional is what lets a **minimal fake** (used in tests, matching `fakeRedis()` in `test/taste-remote-full.test.mjs`) implement only the subset a given test exercises, without a `ClosedCreativeStore` stub for the untested methods. `buildServer()` receives it as a fifth-ish opt alongside `tasteStore`:

```ts
buildServer({ remote: true, tasteStore, creativeStore: new RedisBrandStore(sub, client) })
```

`hasUserStore` in the wrapper gate should probably become `hasUserStore = !!(opts.tasteStore || opts.creativeStore)` (or split into `hasTasteStore`/`hasCreativeStore` if the two subsets should ever be independently enableable — e.g. a client that only wants taste, not creative). Splitting is the more honest design: a taste-only client should not see 9 creative tools it never asked to enable, and P4.2→P4.4 never had two independent subsets to reason about, so this phase is where that fork in the gating model first has to be decided.

## 4) Serverless job model — the biggest delta from the taste subset

Every taste tool is synchronous: call in, Redis round-trip, call out. `create_generation_job` today is **also** synchronous on stdio — `writeCreativeRecord` writes the draft, and if `execute:true`, `runCreativeRunner` (src/index.ts:1454) does a **blocking `spawnSync`** against a local executable named by `RAVEN_CREATIVE_RUNNER`, with a default 300-second timeout (src/index.ts:1463).

Neither half of that survives serverless as-is:

- **No local executable exists on Vercel.** `RAVEN_CREATIVE_RUNNER` names a path on Andrew's machine; a Vercel function has no such binary and no way to be given one per-request.
- **A 300s `spawnSync` blocks a serverless function for the same 300s**, which exceeds Vercel's function duration on most plans and burns compute the whole time regardless — the wrong shape even if a runner *could* run inline (real image/video generation providers routinely take 10s–120s+, and some queue-based ones — video especially — take minutes).

So the authed remote path needs `create_generation_job` to become **fire-and-poll**, not fire-and-block:

```
create_generation_job(execute:true)
  → resolve brand/character/asset refs via RedisBrandStore(sub)   (synchronous, same as today)
  → write job:{sub}:{id} = { status: "queued", provider_payload, ... }
  → enqueue a work item referencing {sub, id}                      (see worker options below)
  → return { job: {...status:"queued"...}, next_step: "poll get_generation_job" }

[worker, out of band, NOT the request that called create_generation_job]
  → dequeue {sub, id}
  → read job:{sub}:{id}
  → call the actual provider (Higgsfield/etc — same shape as CREATIVE_MODEL_CATALOG
    entries today, just invoked over HTTP instead of via spawnSync to a local CLI)
  → write job:{sub}:{id} = { status: "completed"|"failed", outputs, ... }

get_generation_job(id)
  → read job:{sub}:{id}  — status may be queued/running/completed/failed
  → (unchanged shape from today's tool — this is the one creative tool that
     was ALREADY designed to be polled, since RAVEN_CREATIVE_RUNNER submission
     was already async-shaped; only the execution substrate moves)
```

Two worker substrates, both viable, pick one at build time rather than scoping both now:

- **Vercel Cron** — a scheduled function (minimum 1-minute interval) scans `job:*:*:queued` (needs a global-ish index or a queued-jobs list Redis key, since per-user SET indexes alone don't give a cross-user "what's pending" view) and advances each. Simplest to build, worst latency floor (~1 min minimum before a job even starts).
- **A real queue** (Vercel Queues if/when GA, or Upstash's own QStash product, which is the natural pairing since Redis is already Upstash) — push on create, a queue-triggered function processes near-immediately. Better latency, one more piece of provisioned infra (mirrors how P4.1 needed WorkOS AuthKit provisioned before any code could run against it).

Either way: **`execute:true` on the remote authed endpoint can never mean "call `runCreativeRunner`."** That code path stays stdio-only (`isRemoteRuntime()` already guards `writeCreativeRecord`/`readCreativeRecord`/`listCreativeRecords` at src/index.ts:1320/1340/1355 — the same fail-closed pattern needs to cover `runCreativeRunner` explicitly, since right now it isn't reachable remotely only because its *callers* are gated, not because it self-guards; once `create_generation_job` un-gates, that implicit protection disappears and `runCreativeRunner` needs its own `isRemoteRuntime()` check or to simply never be called from the authed path).

## 5) 400KB body-cap interplay

`api/mcp-user.js`'s `MAX_BODY_BYTES = 400_000` (api/mcp-user.js:38) applies to the **whole JSON-RPC request body**, checked twice — once against `content-length` before parsing, once against the actual serialized size after (api/mcp-user.js ~78/~100). This cap was sized for audit payloads (HTML/DOM snapshots); it was never exercised against creative tool inputs because none were remote-reachable before this phase.

Creative inputs blow past it trivially:

- `register_creative_asset`'s `uri` is fine (a string), but any workflow that wants to hand Raven the actual image/video bytes inline (base64 in a `metadata` field, or a hypothetical future `asset_bytes` param) does not fit — a single base64-encoded reference photo is commonly 200KB–2MB+ before JSON overhead.
- `create_character_profile` and `create_generation_job`'s reference-asset flows are designed around `reference_asset_ids` (pointers into the asset store), which is already the right shape — the cap only becomes a problem if a caller tries to skip `register_creative_asset` and inline bytes directly into `create_generation_job`'s params, which the current schema doesn't even offer a field for.

**Required precondition, stated as a rule for this phase:** the creative subset must **never** accept inline base64 asset bytes as a tool argument on the remote endpoint. `register_creative_asset` is the only ingestion path, and it must ingest via **out-of-band upload** (Vercel Blob, given this is already a Vercel deployment — `@vercel/blob`'s client-upload flow lets the calling MCP client PUT bytes directly to Blob storage and hand Raven only the resulting URL) rather than any tool argument carrying the bytes. This keeps every creative tool call, including asset registration, well under 400KB — the tool call itself only ever carries a URL/handle string, matching how `register_creative_asset`'s `uri` field is already documented ("Raven stores metadata and a URI/path, not the file bytes" — src/index.ts:5304). No schema or cap change to `api/mcp-user.js` is needed if this precondition holds; it only breaks if a future revision adds a bytes-carrying parameter to any creative tool.

## 6) Non-goals

- **No anonymous exposure.** Every tool in this scope stays in `REMOTE_GATED_TOOLS` for the no-store anonymous path; only `hasUserStore` un-gates them, same as taste.
- **No cross-user sharing.** No shared brand libraries, no "team" namespace, no read access to another `sub`'s records under any circumstance — same posture as the taste subset's per-`sub` isolation (proven live in P4.2 for taste; this phase inherits the identical proof obligation, not a new one).
- **`delete_creative_data` is in-scope-later, not now.** P4.5 ships `delete_taste_data` for the taste subset; a `delete_creative_data` (or a combined `delete_taste_data` that also wipes `brand:{sub}:*`/`creative:{sub}:*`/`job:{sub}:*`) is a follow-on once the creative subset itself ships — do not build deletion for state that doesn't exist yet.
- **No provider selection/billing here.** Which providers `create_generation_job`'s worker actually calls (Higgsfield, others) and who pays for the API usage is a separate decision outside this document's scope — this document only covers the MCP-surface plumbing (gating, storage, job polling, upload precondition), not the provider integration itself.

## 7) Golden-hash invariant

Restated, unchanged from P4.0–P4.4: **authed-only creative tools must never appear on the anonymous endpoint.** The anon 45-tool, name-sorted `sha256` (`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, `GOLDEN_45_HASH` in `test/taste-remote-full.test.mjs`, `test/redis-taste-store.test.mjs`, `test/mcp-user-auth.test.mjs`) and the anon-instructions hashes (`ANONYMOUS_INSTRUCTIONS_HASH`, `ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH`) stay frozen across this phase exactly as they did across P4.2–P4.4 — none of those phases ever moved the golden hash, and this one must not either.

A test extends the count assertion the same way P4.5's `delete_taste_data` is expected to move it (55→56): this phase's authed-surface count assertion in `test/taste-remote-full.test.mjs` (`assert.equal(authedNames.length, 55, ...)` today, or 56 post-P4.5) moves again to **`55|56 + 9`** (the 9 tools in `AUTHED_USER_CREATIVE_TOOLS` from §1 — `score_creative` doesn't add to the count since it already registers remotely) once this phase ships, with the same three-way shape the existing test already asserts: bare remote == golden 45 (untouched), authed == the new total, stdio == 70 (or 71+, whatever local-only tool count is current, also untouched). The bare-remote and stdio legs of that assertion are the actual golden-hash proof; the authed-count leg is bookkeeping on top of it, not a substitute for it.
