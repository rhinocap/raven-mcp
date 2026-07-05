# Raven MCP — Remote Streamable-HTTP Hosting: Scope & Build Plan

> **Status:** decision-ready scope (NOT implementation). A build session executes from this doc.
> **Repo:** `/Users/accunliffe/projects/raven-mcp` · **SDK:** `@modelcontextprotocol/sdk ^1.29.0` · **Tools:** 70
> **Authored:** 2026-07-05. Every "client X supports Y" and every platform limit is traced to a current source (see inline links + §Sources). Every tool classification traces to a grep hit in `src/`.

---

## Executive summary + recommended path

Raven today runs a single stdio MCP server (`src/index.ts`) that most web/mobile clients (ChatGPT, Claude.ai) can't reach because they can't spawn a local process. The additive fix is to serve the **same 70 `server.tool()` registrations over MCP Streamable-HTTP** in parallel, deployed as a Vercel Function via the official `mcp-handler` package, listed as a public remote connector. The one real snag is state: **20 of 70 tools read/write per-user local files** (`~/.raven/taste` and `~/.raven/creative`) and are meaningless on a shared multi-tenant server; **5 more launch headless Chromium** and need a serverless-Chromium shim. **Recommended path: ship the 45 stateless tools remote-first, stateless HTTP mode, no-auth to start, on Vercel** — the taste/creative engine stays local-only (its whole value is a private, per-machine judgment store), and the browser audits ship in phase 3 behind `@sparticuz/chromium` or an external browser service. This reaches every client (Claude Desktop/web/Code, ChatGPT, Cursor, Windsurf, VS Code) with a paste-URL-and-go flow, changes **zero** existing stdio behavior, and defers the two hard problems (per-user cloud state, in-function Chromium) to later phases where they're isolated.

> **Taste model — two tiers (decided 2026-07-05).** The taste layer is roadmapped to two model tiers, and **neither changes the v1 plan**: today no shipped tool invokes any model — `audit_taste` / scoring are pure heuristics — **so the spec below stands as-is for v1.**
> - **Tier 1, near-term — on-device / local-first** (the design-judge LoRA, Qwen2.5-3B/MLX). Runs on the *user's* machine, so every model-backed taste tool is **local-only by construction** — a Vercel Function has no GPU/MLX runtime and can't cold-load a multi-GB model per request. This is a **4th "can't-serve-remote" reason** alongside stateful-files and headless-browser, and it *reinforces* keeping the taste layer local.
> - **Tier 2, eventual — a larger model behind an HTTP API** (self-hosted at home or on a cloud host). This one is different for hosting: a Vercel Function reaches it with an ordinary **outbound HTTPS call + a secret in env** (`RAVEN_TASTE_API_URL` / `RAVEN_TASTE_API_KEY`, never in source) — **no GPU on Vercel required**. So once the API model exists, *compute stops being the blocker* for serving model-backed taste remotely; the only remaining blockers are **per-user personalization state + auth** (whose taste, kept private) — i.e. it collapses into the same Phase-4 question as cloud taste (§8), not a new infra problem.
>
> Net: the remote server **never needs a hosted GPU/inference backend of its own** in any tier — Tier 1 runs on the user's device, Tier 2 is a remote API it merely calls. v1 ships model-free.

**Recommended sequence:** `buildServer()` factory refactor (additive) → stateless HTTP endpoint on Vercel with the 45 CPU-only tools → list on the official MCP registry + Anthropic/OpenAI directories → add the 5 browser tools behind serverless-Chromium → (only if demanded) per-user cloud taste state keyed to OAuth identity.

---

## 1) TRANSPORT — add Streamable-HTTP alongside stdio, without breaking stdio

**Current wiring (verified in source):**
- One module-level singleton: `var server = new McpServer({ name, version }, { instructions })` — `src/index.ts:1562`.
- `server.tool` is monkeypatched at `src/index.ts:1571` to log usage + inject the update banner; all 70 registrations run against that singleton.
- stdio entry: `main()` at `src/index.ts:5847` does `var transport = new StdioServerTransport(); await server.connect(transport);` (`:5848–5849`).

**The API to add:** `StreamableHTTPServerTransport`, imported from `@modelcontextprotocol/sdk/server/streamableHttp.js`. Constructor options (read from SDK v1.29.0 source, `src/server/webStandardStreamableHttp.ts:78–148`):
- `sessionIdGenerator?: () => string` — **omit / `undefined` = stateless mode**; a generator like `randomUUID` = stateful/session mode.
- `enableJsonResponse?: boolean` (default `false` → SSE streaming preferred), `eventStore?` (resumability), `onsessioninitialized?`/`onsessionclosed?`.
- DNS-rebinding options (`allowedHosts`/`allowedOrigins`/`enableDnsRebindingProtection`) are now `@deprecated` in favor of external middleware.
- Wire spec: **Streamable HTTP, protocol revision 2025-11-25** (successor to 2025-06-18; the old HTTP+SSE `SSEServerTransport` remains only for backwards-compat). Source: [typescript-sdk v1.29.0 source](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.29.0/src/server/webStandardStreamableHttp.ts).

**The load-bearing constraint:** a single `McpServer`/`Protocol` instance can be `connect()`-ed to **exactly one transport, ever**. Calling `server.connect()` twice throws *"Already connected to a transport… use a separate Protocol instance per connection"* (`src/shared/protocol.ts:604–612`). A GitHub issue requesting multi-transport support was closed as **not planned** ([issue #961](https://github.com/modelcontextprotocol/typescript-sdk/issues/961)). **Raven currently has exactly the shape the constraint forbids for reuse: one module-level singleton.** So you cannot "add a second `server.connect(httpTransport)`."

**The additive fix — a `buildServer()` factory (does NOT change stdio behavior):**
Refactor the 70 registrations out of module-scope into a function that returns a fresh configured `McpServer`. The tool registrations themselves are **100% transport-agnostic and unchanged** — the official examples put identical `server.tool()` calls inside one `getServer()` reused verbatim by the stdio, stateful-HTTP, and stateless-HTTP servers.

```
// src/server-factory.ts  (NEW — lifts existing registrations verbatim)
export function buildServer(): McpServer {
  const server = new McpServer({ name: "raven-mcp", version: PKG_VERSION }, { instructions });
  wrapToolForUsageLog(server);      // the existing :1571 monkeypatch, applied here
  registerAllTools(server);          // the existing 70 server.tool(...) calls, unchanged
  return server;
}

// src/index.ts  main()  (stdio path — behaviour identical to today)
const server = buildServer();
await server.connect(new StdioServerTransport());

// src/http.ts  (NEW — the remote entry; stateless mode for serverless)
app.post("/mcp", async (req, res) => {
  const server = buildServer();                                    // fresh per request
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.get("/mcp",  (_req, res) => res.status(405).end());            // stateless: no server->client stream
app.delete("/mcp", (_req, res) => res.status(405).end());
```

- **Stateful mode** (if ever needed for resumable/long tool calls): `sessionIdGenerator: randomUUID`, keep a `Mcp-Session-Id → transport` map, wire `app.get`/`app.delete` for the SSE stream + session teardown. Needs sticky routing or an external `eventStore` across nodes — **wrong fit for serverless**; use stateless.
- **Verification that stdio is untouched:** the stdio path still calls `buildServer()` once and connects one `StdioServerTransport` — byte-identical behavior to today's `main()`. The refactor is purely "move registrations into a function both entry points call."

---

## 2) TOOL SPLIT — per-tool classification (every row traces to a grep hit)

70 tools total → **45 stateless (remote-ready as-is)** · **5 browser-heavy (stateless logic, need headless Chromium)** · **20 stateful/local (per-user files — do NOT serve remote as-is)**. State stores confirmed by grep: `RAVEN_TASTE_HOME || ~/.raven/taste` (`taste.ts:216`), `RAVEN_CREATIVE_HOME || ~/.raven/creative` (`index.ts:1139`, writes via `writeCreativeRecord` `index.ts:1292–1306`), `RAVEN_USAGE_LOG || ~/.raven/usage.jsonl`.

### Stateful / LOCAL — 20 (keep local; NOT remote-safe as-is)

| Tool | Store | Grep trace |
|---|---|---|
| create_taste_profile | taste | `taste.ts:1326-1327` writeFileSync profile |
| get_taste_profile | taste | `taste.ts:282` readFileSync |
| list_taste_profiles | taste | `taste.ts:292-293` readdirSync |
| get_taste_interview | taste | `taste.ts:360` reads profile/bindings |
| bind_taste_surface | taste | `taste.ts:682-683` writeFileSync surfaces.json |
| record_taste_decision | taste | `taste.ts:737-738` writeFileSync decisions.json |
| list_taste_decisions | taste | `taste.ts:744-745` readFileSync |
| generate_taste_portrait | taste | `taste-portrait.ts` reads profile |
| label_finding | taste | `taste.ts:311` getTasteProfile + writeProfile |
| audit_taste | taste | reads profile + surface bindings from disk |
| create_brand_profile | creative | `index.ts:5066` writeCreativeRecord "brands" |
| get_brand_profile | creative | reads "brands" record |
| list_brand_profiles | creative | readdir CREATIVE_HOME/brands |
| register_creative_asset | creative | `index.ts:5121` writeCreativeRecord "assets" |
| create_character_profile | creative | `index.ts:5160` writeCreativeRecord "characters" |
| create_generation_job | creative + **subprocess** | writeCreativeRecord "jobs" + `spawnSync RAVEN_CREATIVE_RUNNER` (`index.ts:1419-1428`) |
| get_generation_job | creative | reads "jobs" record |
| list_generation_jobs | creative | readdir CREATIVE_HOME/jobs |
| plan_creative_campaign | creative | `index.ts:5186` writeCreativeRecord "jobs" |
| raven_reflect | usage-log | `index.ts:5431` reads ~/.raven/usage.jsonl — machine-local, not per-user-meaningful remote |

> **Note on `create_generation_job`:** doubly-local — it not only writes a job file but can `spawnSync` an arbitrary local executable (`RAVEN_CREATIVE_RUNNER`). This must **never** be exposed on a shared remote server (arbitrary-process-execution + multi-tenant data bleed). Hard local-only.

### Browser-heavy — 5 (stateless logic; require headless Chromium — see §5)

| Tool | Grep trace | Note |
|---|---|---|
| audit_url | `audit-url.ts:21` imports `capturePage` → `capture.ts:150` `chromium.launch({headless:true})` | url render only |
| audit_contrast | `contrast.ts:281-294` chromium.launch | **url mode** needs Chromium; static html/colors mode is CPU-only |
| audit_tap_targets | `tap-targets.ts:161-178` chromium.launch | url render |
| audit_responsive_visibility | `responsive.ts:99-112` chromium.launch | url render |
| audit_video_playback | `video-playback.ts:158+` chromium | **url mode** needs Chromium; `dom_snapshot` mode is CPU-only |

### Stateless — 45 (serve remote as-is, CPU-only)

- **Knowledge getters (18):** get_principles, get_pattern, get_business_strategy, search_knowledge, get_checklist, get_d4d_framework, get_content_principles, get_content_pattern, get_content_system, list_content_systems, get_research_method, get_metrics_framework, get_service_pattern, get_service_standard, get_brand_principles, get_brand_trends, list_creative_models, list_creative_presets
- **Design systems (6):** list_design_systems, get_design_system, compose_system, generate_design_system, get_brand_system, generate_service_blueprint
- **Audits, CPU-only artifact-in (18):** audit_page, score_page, audit_asset_integrity, audit_device_frame, audit_contract, audit_api_contract, audit_parity, audit_ios_a11y, suggest_contrast_fix, audit_content, audit_typography, audit_layout, audit_swiftui, audit_screen, audit_ios_screen, audit_ios_privacy, audit_rn, audit_consistency
- **Scoring/eval (2):** evaluate_design, score_creative
- **Network (1):** raven_register (POST to `ravenmcp.ai/api/welcome`; no local state)

*Count check: 20 + 5 + 45 = 70 ✓ (`grep -c 'server.tool(' src/index.ts` = 70).*

---

## 3) PER-USER STATE — recommendation

The snag: taste + creative state is **per-user, per-machine, and private by design** (the Taste Engine's value proposition is a local judgment store that "nothing leaves the machine"). On a shared remote server, `list_taste_profiles` would return the server's profiles, not the user's — semantically broken and a privacy leak.

**Recommendation: (a) keep taste/creative local-only; ship only the 45 stateless tools remote first.**
- Rationale: the 45 stateless tools are the broad-reach, zero-state value (audits, knowledge, design systems, scoring) — exactly what a web/mobile user wants without install. The 20 stateful tools are the power-user local loop that already works over stdio and *should* stay local (private corpus, no cloud custody of a person's design judgment, and `create_generation_job`'s subprocess can't be multi-tenant safe).
- **Model dependency reinforces this (near-term).** The Tier-1 taste model is **on-device** (§exec) — so `audit_taste`/scoring are heading toward a local-inference backend a serverless Function *cannot* run anyway. Near-term, keeping taste local is both a state decision and a compute decision: the judgment model lives where the user is.
- **Tier-2 API model doesn't force taste remote either.** When the larger model lands behind an HTTP API (self-hosted/cloud, §exec), the Function could call it — but that only removes the *compute* blocker, not the *personalization* one. Serving one person's calibrated taste remotely still needs per-user cloud state + auth (Phase 4), so the recommendation is unchanged: **taste stays local for v1.**
- The stdio server keeps ALL 70 tools; the remote server exposes the 45. Same codebase, same `buildServer()` — the HTTP entry just registers the stateless subset (or gates the stateful ones off when `process.env.RAVEN_REMOTE` is set).

**Option (b), if per-user cloud taste is ever demanded** (e.g. "my taste follows me across devices in ChatGPT"):
- **Storage:** per-user KV/JSON keyed to the OAuth `sub` (subject) identity — e.g. Vercel-marketplace Redis (Upstash) or a Postgres row per user, replacing the `fs` calls in `taste.ts`/creative store with an async storage interface keyed by user id.
- **Migration cost (medium–high):** `taste.ts` and the creative store are synchronous `fs` (`readFileSync`/`writeFileSync`); moving to keyed cloud storage means (1) an async storage adapter interface, (2) rewriting ~15 call sites to `await`, (3) threading the authenticated user id from the HTTP transport into every stateful handler, (4) an auth system that actually yields a stable per-user `sub` (→ forces full OAuth, §4), (5) data-model + privacy/retention decisions for storing users' private design corpora. This is a project, not a phase — defer until there's demand.

**Decision for Andrew:** confirm (a) local-only taste is acceptable for v1 remote (recommended), or flag that cross-device taste is a requirement (→ (b), and OAuth becomes mandatory).

---

## 4) AUTH — what one-click needs per client

**Spec baseline:** MCP authorization is **entirely OPTIONAL** at the protocol level — a no-auth remote server is spec-legal, and STDIO servers SHOULD NOT do OAuth at all ([spec 2025-06-18 auth](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)). But **there is no "lightweight header auth" blessed by the spec**: the instant a remote HTTP server *does* authenticate, it must be OAuth 2.1 + Protected Resource Metadata (RFC 9728) + Authorization Server Metadata (RFC 8414). The **2025-11-25 revision** demotes Dynamic Client Registration (RFC 7591) from SHOULD to **MAY** (backwards-compat) and promotes **Client ID Metadata Documents (CIMD)** to SHOULD, with client priority order: pre-registered > CIMD > DCR > prompt-user ([spec 2025-11-25 auth](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)). Tokens **MUST** go in the `Authorization: Bearer` header, **never** in a URL query param.

**Per-client reality today (this changes the recommendation — read the Claude.ai row):**

| Client | No-auth? | Static bearer (paste a token)? | OAuth | Source |
|---|---|---|---|---|
| **Claude.ai / Desktop UI connector** | ✅ yes (paste URL, save, no creds) | ❌ **NOT supported** — docs state `static_bearer` "not yet supported"; URL-embedded keys also unsupported; Anthropic-held creds need `mcp-review@anthropic.com` approval | ✅ DCR + CIMD out of the box | [Claude connector auth](https://claude.com/docs/connectors/building/authentication) |
| **Claude API MCP connector** (Messages API, separate) | ✅ | ✅ **yes** — accepts a plain `authorization_token` string; you obtain the token out-of-band | (beta header `mcp-client-2025-11-20`) | [Claude MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) |
| **ChatGPT (Developer Mode / Apps SDK)** | ✅ per-tool `securitySchemes: noauth` | ⚠️ not a first-class "paste token" UI box; hybrid noauth+oauth2 supported | ✅ recommends CIMD | [Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth) |
| **Cursor** | ✅ | ✅ **yes** — static `headers: {Authorization: Bearer ${env:TOKEN}}` in `mcp.json`, zero OAuth | ✅ full auto OAuth 2.1 + DCR + PKCE ("Connect" button); CIMD not yet shipped as of early 2026 | [Cursor MCP](https://cursor.com/docs/mcp.md) |
| **Claude Code / VS Code / Windsurf** | ✅ | ✅ header/token in config | ✅ | §7 sources |

**Minimum that still yields paste-URL-and-go — the ranking:**
1. **No-auth public server** — the ONLY option that is one-click across *every* client including the Claude.ai and ChatGPT **UI** connector flows. Zero config, but exposes the tools to anyone with the URL. **For Raven's 45 stateless, read-only, no-user-data tools this is the correct launch choice** (mitigate compute abuse with rate-limiting + the 4.5MB payload cap).
2. **Static shared bearer** — clean paste-and-go in **Cursor** and the **Claude/OpenAI APIs**, but **Claude.ai's UI connector and ChatGPT's UI connector do not offer a first-class "just paste a token" box** — so a static token is *not* universally one-click. Don't rely on it for broad UI reach.
3. **Full OAuth 2.1 + DCR/CIMD** — the only spec-correct path that works uniformly across Claude.ai UI, ChatGPT UI, and Cursor without per-client special-casing — but it means standing up a real authorization server. Reserve for when per-user identity is actually needed (§3 option b).

**Recommended:** ship the stateless remote server **no-auth** for v1 (universal one-click, no user data at risk). Go to **OAuth 2.1 + CIMD** only if/when per-user cloud taste state (§3b) is built — skip static-bearer as a strategy since it doesn't buy universal UI reach. *(Open: whether SDK `^1.29.0` ships CIMD/PRM discovery out of the box, or it must be hand-rolled — verify at build time.)*

---

## 5) HOSTING — Vercel limits vs Raven's heaviest tools

**Vercel has an official, supported MCP path:** the [`mcp-handler`](https://github.com/vercel/mcp-handler) package (renamed from `@vercel/mcp-adapter`, v1.1.0 2026-03-24, requires SDK ≥1.26.0 — Raven's `^1.29.0` is compatible) running in a Vercel Function on Fluid Compute, using **Streamable HTTP**. Vercel [explicitly recommends Streamable HTTP over SSE](https://vercel.com/blog/building-efficient-mcp-servers) — its own engineering blog (2026-06-12) calls SSE *"an unsustainable choice for MCP servers at scale."* This matches the SDK's **stateless mode** (`sessionIdGenerator: undefined`) = the correct fit for a per-invocation function.

**Current Vercel Function limits** ([functions/limitations](https://vercel.com/docs/functions/limitations), page updated 2026-06-19):
- **Duration:** Hobby 300s (fixed); Pro/Enterprise 300s default, 800s GA max, **1800s beta** (per-function `maxDuration`, runtime-gated).
- **Memory/CPU:** Hobby 2GB/1vCPU fixed; Pro/Enterprise up to 4GB/2vCPU.
- **Payload:** 4.5MB request/response cap.
- **Bundle:** 250MB uncompressed (5GB "Large Functions" beta).
- Duration/memory are all **comfortably fine** for Raven's 45 CPU-only tools.

**THE biting limit is bundle size, not time/memory — and it bites the 5 browser tools.** A stock Playwright install with bundled Chromium (~280MB+) **blows past the 250MB bundle cap on its own** ([Vercel Puppeteer KB](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)).
- **Known-good fix:** `playwright-core` + [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) — ~38MB compressed / ~131MB uncompressed for Chromium — **fits inside 250MB** alongside lean app code. Works with both puppeteer-core and playwright-core.
- **Caveats:** needs 512MB+ RAM (fine — 2GB default); `@sparticuz/chromium` extracts to `/tmp` and reuses on warm starts, but Playwright doesn't auto-clean user-data dirs → manage a unique `--user-data-dir` per run + clean it, or `/tmp` fills over many warm invocations. No first-party Vercel doc for the Playwright+Chromium combo specifically (Puppeteer has one) — it's a **supported-but-DIY** pattern.
- **Fallback if in-function Chromium proves fragile at scale:** offload to an external managed browser — **Browserless or [Browserbase](https://vercel.com/marketplace/browserbase)** (both Vercel Marketplace integrations) — connect the existing Playwright code over a remote CDP/WebSocket instead of launching Chromium in-function.
- **Escape hatch for anything beyond 1800s:** [Vercel Workflows](https://vercel.com/docs/functions/limitations) (stateful pause/resume).

**Architecture flag (open decision):** consider isolating the 5 browser tools in a **separate Vercel project/Function** (own bundle, memory, `maxDuration`, Large-Functions opt-in) from the 45 CPU-only tools, so browser cold-starts and `/tmp` risk don't bleed into fast non-browser calls on a shared warm instance.

**No GPU / inference backend — in any tier (§exec).** The Function never hosts a model: Tier-1 taste runs on the *user's* device, and the eventual Tier-2 larger model is a **remote HTTP API the Function merely calls** (outbound HTTPS + a secret via env — `RAVEN_TASTE_API_URL`/`RAVEN_TASTE_API_KEY`, never in source). So Vercel's no-GPU serverless runtime is never a constraint on the taste layer — the only reason model-backed taste isn't in v1 remote is per-user state + auth (§3, §8), not compute.

---

## 6) DISTRIBUTION — listing paths + effort

| Channel | Requirements | Effort | Source |
|---|---|---|---|
| **Official MCP Registry** (`registry.modelcontextprotocol.io`) | `mcp-publisher` CLI publishes a `server.json`; remote servers declared via top-level `remotes` (streamable-http), supports template vars + required headers; namespace/DNS verification. **In "preview"** (breaking changes possible), **no human review gate documented**. | **Lowest** — CLI publish, do first | [registry quickstart](https://modelcontextprotocol.io/registry/quickstart), [remote-servers](https://modelcontextprotocol.io/registry/remote-servers) |
| **Anthropic Claude Connectors Directory** | **Team or Enterprise Claude.ai org required** (individual plans can't submit); in-app 11-step submission portal (Connection, Tools, Listing, Auth, Data Handling, Test & Launch, Compliance, Review). Turnaround unpublished (community: 2wk–months). | **Medium** — needs a Team/Ent org + full listing materials | [Anthropic submission](https://claude.com/docs/connectors/building/submission) |
| **OpenAI / ChatGPT Apps directory** | OpenAI Platform Dashboard; **org identity verification**, `api.apps.write`, **publicly-hosted MCP server** (local endpoints rejected), full materials (logo, privacy/company policy URLs, tool annotations `readOnlyHint`/`destructiveHint`/`openWorldHint`, test prompts, screenshots). Content/commerce restrictions apply. | **Highest** — identity verification + strict submission bar | [OpenAI submission](https://developers.openai.com/apps-sdk/deploy/submission), [guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines) |
| **Community registries** (mcp.so, Smithery, Glama, awesome-mcp-servers) | Non-exclusive, low-effort listings; each serves a different client audience; best practice = list on all. mcp.so is highest-traffic (~20k servers). Exact submit mechanism (form/PR/crawl) unverified (site 403'd fetch). | **Low** — do after registry | [MCP registries overview](https://roxyapi.com/blogs/mcp-registries-where-to-list-your-server) |

**Order:** official registry first (cheapest, canonical) → community registries → Anthropic directory (needs a Team/Ent org) → OpenAI (highest bar).

---

## 7) CLIENT MATRIX — remote Streamable-HTTP support + add-flow (verified against current docs)

| Client | Remote HTTP MCP? | Add-flow / user steps | Gating | Source |
|---|---|---|---|---|
| **Claude Desktop** | ✅ Yes | Settings → Connectors → "Add custom connector" → paste URL (OAuth or custom header auth) | **Pro/Max/Team/Enterprise** | [Anthropic custom connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers) |
| **Claude.ai (web/mobile)** | ✅ Yes | Same custom-connector flow; Team/Ent needs an Owner to add org-wide first | Paid; Team/Ent Owner | [get started w/ custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |
| **Claude Code (CLI)** | ✅ Yes | `claude mcp add --transport http <name> <url>` (one line); header or OAuth auth | **No tier gate** | [Claude Code MCP](https://code.claude.com/docs/en/mcp) |
| **ChatGPT (web/mobile)** | ✅ Yes | Connectors via **Developer Mode**; add remote MCP server | Paid + business/ent/edu (as of 2025-11-13) | [OpenAI connect ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) |
| **OpenAI Codex (CLI)** | ⚠️ Partial | Manual `config.toml` entry for remote Streamable HTTP; `codex mcp add` is documented mainly for stdio launchers | — | [Codex MCP](https://developers.openai.com/codex/mcp) |
| **Cursor** | ✅ Yes | `mcp.json` (project `.cursor/mcp.json` or global `~/.cursor/mcp.json`); or one-click "Add to Cursor" deeplink; headers/OAuth | No explicit plan gate found | [Cursor MCP](https://cursor.com/docs/mcp) |
| **Windsurf (Cascade)** | ✅ Yes | Global JSON config with a `serverUrl` field + variable interpolation for secrets | — | [Windsurf MCP](https://docs.windsurf.com/windsurf/cascade/mcp) |
| **VS Code (Copilot agent mode)** | ✅ Yes | `mcp.json` via Command Palette wizard or manual edit; tools usable only in Copilot Chat **Agent mode** | Copilot subscription | [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers) |

Across the ecosystem, **SSE is legacy/deprecated and Streamable HTTP is the recommended transport** — Raven targeting Streamable HTTP is the correct, future-proof choice.

**70-tool context flag (open):** 70 tools may overload smaller-context clients' tool lists. Consider exposing only the stateless subset remote (which also solves §3), and/or a curated tool set per surface.

---

## 8) PHASED PLAN + open decisions

**Phase 0 — Additive refactor (no behavior change).** Lift the 70 `server.tool()` registrations + the usage-log wrapper into `buildServer()`. stdio `main()` calls it and connects `StdioServerTransport` exactly as today. *Verify:* stdio server starts, all 70 tools present, existing Codex/Desktop/CLI configs unchanged. **This is the only change to the existing path — and it changes nothing observable.**

**Phase 1 — Stateless remote server (reaches web/mobile clients).** New HTTP entry (`mcp-handler` on Vercel), **stateless mode**, registers the **45 CPU-only tools** (gate off the 20 stateful + 5 browser via `RAVEN_REMOTE`). No-auth (§4). *Verify:* deployed URL added as a remote connector in Claude Desktop + ChatGPT + Cursor; a stateless tool (`audit_page` on pasted HTML, `get_pattern`) returns correctly end-to-end.

**Phase 2 — List it.** Publish `server.json` to the official MCP registry (`remotes` → streamable-http) → community registries → Anthropic directory (needs Team/Ent org) → OpenAI. *Verify:* discoverable + addable from at least the registry + one directory.

**Phase 3 — Browser audits remote.** Add the 5 browser tools behind `playwright-core` + `@sparticuz/chromium` (or Browserbase), ideally an **isolated Function/project**. *Verify:* `audit_url` on a live URL returns from the deployed function; `/tmp` stays bounded across warm invocations under load.

**Phase 4 (only if demanded) — Per-user cloud taste.** Full OAuth 2.1 + DCR, per-user keyed storage, async storage adapter replacing `fs`. Large effort — do only if cross-device taste is a real requirement. **If the Tier-2 API taste model (§exec) is live by then, model-backed audits fold in here for free** — the Function calls the model over HTTPS with a secret; Phase 4's real work is still the per-user state + auth, not the model call.

### Open decisions that need Andrew
1. **Taste stays local-only for v1 remote?** ✅ **Decided 2026-07-05: yes — local-first, skip OAuth for now.** Taste model is Tier-1 on-device near-term; Tier-2 is a larger model behind a self-hosted/cloud **API** later. Neither is in v1 remote; both leave v1 model-free. Cross-device/remote taste is deferred to Phase 4 (gated on per-user state + auth, *not* on compute — see §exec/§5).
2. **Auth for the stateless server:** confirm **no-auth** (recommended — the only universally one-click option across Claude.ai/ChatGPT UI connectors; static bearer is NOT universal, §4). Accept the open-URL abuse risk (mitigated by rate-limiting), or decide OAuth is worth it now.
3. **Which tools ship remote:** all 45 stateless, or a curated subset to avoid flooding client tool-lists?
4. **Browser tools:** same Function as the rest, or an isolated Function/project (recommended for `/tmp` + cold-start isolation)?
5. **Hosting confirm:** Vercel (assumed — native MCP support), or another host?
6. **Distribution reach:** do we have (or will we create) a **Team/Enterprise Claude.ai org** required for the Anthropic directory?

---

## Sources

All links inline above are current official docs (fetched 2026-07-05) unless marked medium/low confidence. Primary anchors: MCP TypeScript SDK v1.29.0 source + [issue #961](https://github.com/modelcontextprotocol/typescript-sdk/issues/961); [Vercel MCP deploy](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel) + [functions limits](https://vercel.com/docs/functions/limitations) + [efficient MCP servers blog](https://vercel.com/blog/building-efficient-mcp-servers); [@sparticuz/chromium](https://github.com/Sparticuz/chromium); [MCP registry](https://modelcontextprotocol.io/registry/quickstart); per-client docs in §7. Tool classifications trace to grep hits in `src/index.ts` and `src/taste.ts` (line numbers inline in §2).
