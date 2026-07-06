# Raven MCP — Phase 4: Per-User Authenticated Taste Engine (Remote) — Scope & Build Plan

> **Status:** decision-ready scope (NOT implementation). A build loop executes from this doc.
> **Source of truth for the Phase-4 loop.** Higher-level hosting rationale lives in `docs/remote-mcp-scope.md` (§3/§4/§8). Ledger: `docs/remote-mcp-phase4-progress.md`.
> **Authored:** 2026-07-05 (plan of record: Fable). Builds ON the shipped Phases 0/1/3 (`buildServer()` factory, stateless `api/mcp.js` serving 45 no-auth tools, 5 browser tools behind the SSRF egress proxy).

---

## Goal

A **remote** user (Claude.ai / ChatGPT / Cursor) can run the taste-engine **interview on project startup**, build their **own** taste profile, and have it **persist privately** across sessions and devices — the exact capability gated OFF today. This is the payoff that justifies the whole hosting effort.

## Owner decisions (LOCKED 2026-07-05)

1. **Access = FREE while in beta.** AuthKit identity alone gates the authenticated tools; **no Outseta/subscription check.** (Rationale: AuthKit free to 1M MAU, Upstash free tier, abuse handled by P4.5 rate-limiting — no cost forces a paywall. Billing is a future bolt-on, out of scope for this loop.)
2. **Canonical endpoint = `mcp.ravenmcp.ai` from the start.** The OAuth `resource` (RFC 9728 PRM) and JWT `aud` bind to this hostname; choosing it now avoids a breaking reconnect-migration later. Attach the subdomain to **THIS repo's Vercel project** (a domain-add + one DNS record — does NOT redeploy the marketing site, which is a separate git line). During per-phase verification, a `RAVEN_MCP_RESOURCE` **preview-URL override** is used so JWT `aud` matches the deployment under test.
3. **ChatGPT is a HARD P4.4 exit requirement.** Claude.ai + Cursor + ChatGPT must all complete OAuth and run the interview to pass P4.4. Budget extra iterations for ChatGPT DCR/scope quirks.

## Stack (recommended; swappable)

- **Auth: WorkOS AuthKit** as the external OAuth 2.1 authorization server. **Raven stays a pure resource server** — it serves one static RFC 9728 PRM document and validates JWTs via JWKS (`iss` / `aud` / `exp`) in stateless middleware. Zero hand-rolled auth. `sub` claim = stable per-user id. (Runner-up: Stytch Connected Apps — swap only if AuthKit's DCR misfires against ChatGPT in P4.4.)
- **Storage: Upstash Redis** (Vercel Marketplace). Small per-profile JSON docs with read-modify-write; Redis gives atomic decision appends (kills the lost-update race between two concurrent sessions), per-user key namespacing, one-click provisioning, and a one-line delete-my-data via `SCAN`. Durable (persisted), not cache-only. (Runner-up: Neon Postgres — the P4.0 storage interface makes it a swap, not a rewrite.)

## Architecture — DUAL ENDPOINTS (forced, not a fork)

MCP clients only start OAuth on a **401 challenge**, so the anonymous endpoint must keep returning **200 byte-for-byte**. Therefore two URLs, zero regression by construction:

| URL | Auth | Tools | File |
|-----|------|-------|------|
| `mcp.ravenmcp.ai/api/mcp` | none | 45 stateless (unchanged) | `api/mcp.js` — **untouched** |
| `mcp.ravenmcp.ai/api/mcp-user` | Bearer (required) | 45 + 10 taste | `api/mcp-user.js` — **new** |

No/invalid Bearer on `/api/mcp-user` → **401 + `WWW-Authenticate: Bearer resource_metadata="…"`**. Valid JWT → same stateless fresh-server-per-request serving, plus a per-request `RedisTasteStore(claims.sub)` injected into `buildServer`.

**Taste subset to un-gate for authenticated users (10):** `create_taste_profile`, `get_taste_profile`, `list_taste_profiles`, `get_taste_interview`, `bind_taste_surface`, `record_taste_decision`, `list_taste_decisions`, `generate_taste_portrait`, `label_finding`, `audit_taste`. (The creative subset — brand/character/generation/campaign/`raven_reflect` — is an explicit FOLLOW-ON, scoped but not built in this loop.)

---

## Phases (one per loop iteration)

### P4.0 — Async `TasteStore` interface; fs adapter; stdio byte-identical
**Goal:** move the taste store behind an async interface without changing local/stdio behavior.
**Work:** define `TasteStore` (async: `getProfile/putProfile/listProfiles/getSurfaces/putSurfaces/getDecisions/appendDecision/deleteAll`) in a new leaf module. Implement `FsTasteStore` (wraps today's exact sync-fs logic + paths at `tasteHome()`) and `ClosedTasteStore` (empty reads / throwing writes — reproduces today's remote latch). Convert all **16 sync-fs call sites in `src/taste.ts`** to go through an **injected** store — **explicit parameter threading, NEVER module-level "current store/user" state** (Fluid Compute runs concurrent requests in one process). Taste functions become async → ripple through `src/index.ts` handlers + `test/taste.test.mjs`. In taste paths, `remote-runtime` latch checks become "which store was injected" (**creative-store latch checks stay untouched**). Store selection: stdio → `FsTasteStore`; `buildServer({remote:true})` with no injected store → `ClosedTasteStore`. Restate (do not delete) `test/remote-store-invariant.test.mjs`.
**Verify:** full `npm test` green; local stdio smoke — create/get/bind a profile, confirm `~/.raven/taste` files are **format-identical** to pre-P4.0; grep gate: **zero `node:fs` imports in `taste.ts` outside `FsTasteStore`**; deploy preview → anonymous `tools/list` == recorded **45-tool golden hash**, gated tools still absent.

### P4.1 — AuthKit AS + OAuth discovery + authed endpoint skeleton (still 45 tools for everyone)
**Goal:** stand up auth end-to-end with zero tools yet un-gated.
**Work:** provision WorkOS AuthKit (env only: `WORKOS_*`, `RAVEN_MCP_RESOURCE` for the canonical resource URL **with a preview-URL override** since `aud` must match the deployment under test). New `api/well-known.js` (or `vercel.json` rewrite) serving the RFC 9728 PRM doc at `/.well-known/oauth-protected-resource` (+ path-suffixed variant) pointing at AuthKit's RFC 8414 metadata. New `api/mcp-user.js`: no/invalid Bearer → 401 + `WWW-Authenticate` with `resource_metadata`; valid JWT (JWKS-verified; `iss`+`aud`+`exp` enforced) → the **same 45-tool** stateless serving as `/api/mcp` (reuse body-cap + fresh-server pattern). **`api/mcp.js` untouched.** Attach `mcp.ravenmcp.ai` to this Vercel project (domain-add + DNS record; no marketing-site redeploy).
**Verify (preview URL):** anonymous `/api/mcp` tools/list == golden hash; PRM doc fetches + points at live AS metadata; garbage Bearer → 401 with correct `WWW-Authenticate`; **MCP Inspector completes the full OAuth flow** against the preview and lists 45 tools; a token minted for a different `aud` is **rejected**.

### P4.2 — Upstash store + identity threading (profile trio un-gated)
**Goal:** real per-user cloud persistence, proven isolated.
**Work:** provision Upstash Redis via Marketplace (env only). Implement `RedisTasteStore(sub)` with keys `taste:{sub}:profile:{name}`, `:surfaces:{name}`, `:decisions:{name}` (a Redis **list** for atomic append) + a `taste:{sub}:profiles` index set. `buildServer` accepts `{ remote, tasteStore }`; `api/mcp-user.js` constructs `RedisTasteStore(claims.sub)` per request and injects it. Un-gate exactly `create_taste_profile`, `get_taste_profile`, `list_taste_profiles` when a store is injected (gating becomes store-presence-based for the taste subset). Reject local-path/`isPngPathReference` reference inputs on the remote path (server-file oracle).
**Verify (preview URL):** authed user A creates a profile; **after a fresh redeploy** (kills warm-`/tmp` false positives) A reads it back; user B (2nd test identity) `list_taste_profiles` → empty, and cannot `get` A's profile by name; two **parallel** authed requests with different tokens each see only their own data; anonymous `/api/mcp` == golden hash and still refuses all taste tools.

### P4.3 — Full taste subset un-gated for authenticated users
**Goal:** the remaining 7 taste tools work per-user, remote-safe.
**Work:** un-gate `get_taste_interview`, `bind_taste_surface`, `record_taste_decision`, `list_taste_decisions`, `generate_taste_portrait`, `label_finding`, `audit_taste` when a user store is injected. `generate_taste_portrait` on the remote path returns HTML **inline (size-capped)** instead of `writeFileSync` (touch `taste-portrait.ts` write path only behind the remote branch). `audit_taste` profile/project resolution runs against the injected store; `label_finding` corpus append goes through `putProfile`. Confirm typical `bind_taste_surface` payloads clear the 400KB body cap (raise the cap **only on `mcp-user.js`** if needed — never `mcp.js`).
**Verify (preview URL, MCP Inspector w/ real token):** the whole loop — create → interview → answer → bind → record_decision → `audit_taste` with the binding echoed in `design_notes` → label_finding → portrait returned inline; cross-user isolation re-run from P4.2; anonymous golden hash; stdio `npm test` green.

### P4.4 — Real-client startup interview end-to-end (THE payoff; ChatGPT = hard gate)
**Goal:** the promise delivered from actual clients.
**Work:** connect the authed URL as a custom connector in **Claude.ai, Cursor, AND ChatGPT** (all three required per decision 3). Run the PROJECT-KICKOFF interview from a fresh chat exactly as the server instructions prescribe. Fix what reality surfaces: DCR/CIMD client-registration quirks (esp. ChatGPT), refresh-token behavior on long sessions, consent-screen naming, instruction-text nudges so remote clients actually call `get_taste_interview` at kickoff.
**Verify (preview URL):** from a brand-new chat in **each of the three clients**, OAuth completes, the interview runs conversationally, `bind_taste_surface` persists; disconnect/reconnect (and a second device or second client) → `list_taste_profiles`/`get_taste_profile` return the same profile; anonymous golden hash unchanged.

### P4.5 — Privacy, deletion, rate limits, follow-on scope; production promote
**Goal:** make it safe to leave running, then ship.
**Work:** authed-only `delete_taste_data` tool (`SCAN` + `DEL` of `taste:{sub}:*`, returns counts); per-user rate limiting on `mcp-user.js` (`@upstash/ratelimit`, keyed by `sub`; anonymous endpoint untouched); no-PII logging audit on the authed path; short privacy/retention section in `README` + `docs/remote-mcp-scope.md`; **write (not build)** the follow-on scope doc for the creative subset + lifting `project`/`profile` arg-guards on `audit_swiftui`/`audit_rn`/`audit_screen`/`audit_ios_screen` for authed users.
**Verify (preview URL):** create → delete → all reads empty + Upstash console shows zero keys for that `sub`; hammered authed requests hit **429** while anonymous stays unthrottled; anonymous golden hash. **Then** promote to production (this repo's Vercel project — **NEVER `--prod` toward the marketing domain's separate line**).

---

## Top 3 risks ("done but wrong")

1. **Cross-user data leak via process-shared state.** A module-level "current user"/store under Fluid Compute concurrency serves A's profile to B, or writes B's decisions into A's namespace. Mitigation is structural — store injected per request as an explicit parameter, no module mutability. **Caught by P4.2's two-identity isolation + parallel-request test**, re-run in P4.3.
2. **Anonymous-path regression.** A shared `buildServer`/gating change makes `/api/mcp` 401, drop a tool, or change output shape — breaking every existing no-auth user. Mitigation: auth lives in a new file; the gate change is additive (store-presence). **Caught by the golden 45-tool hash check in EVERY phase's verify**, first at P4.0.
3. **Phantom persistence.** A missed fs call site (or `taste-portrait.ts`'s write path) silently writes to serverless `/tmp`; a warm instance reads it back so naive tests pass, and the profile evaporates on the next cold start. Mitigation: P4.0's zero-fs-imports grep gate. **Caught by P4.2's read-back-across-a-redeploy bar + direct Upstash key inspection.**

## Standing invariant (every iteration, regardless of phase)

Anonymous `tools/list` on the fresh preview **== the ledger's golden 45-tool hash**, AND the full local test suite is green. A mismatch **halts the loop** even if the phase's own bar passed.

## Stop condition

The loop stops when the ledger records a **passing P4.5 verify** — or immediately, handing back to Andrew, if **any phase's verify bar fails twice on the same phase**.
