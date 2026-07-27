# Raven Remote MCP — GA next steps (post-Phase-4 beta)

**Status as of 2026-07-07:** Phase 4 shipped. The remote authenticated MCP server is **live in beta** at `https://mcp.ravenmcp.ai` (ledger commit `42d25ab`). This doc is the spec for taking it from **beta → GA + public announcement**. Nothing here is a blocker for the beta continuing to run; it is the punch-list before a public launch.

---

## Goal
Move the OAuth auth tenant off the WorkOS **Staging** environment onto a dedicated WorkOS **Production** environment, re-verify the three MCP clients against the clean consent domain, then make the public announcement.

## Why (the one real gap)
- The OAuth 2.1 **implementation** is GA-grade and live-verified: JWKS validation, `iss`/`aud`/`exp` enforcement, RFC 9728 PRM discovery, 401 + `WWW-Authenticate` challenge, real tokens from Claude.ai / Cursor / ChatGPT.
- The **tenant** is not: auth runs through WorkOS Staging, whose AuthKit domain `artistic-gold-76-staging.authkit.app` is **user-visible in the consent screen**. A public "Connect Raven" flow showing a `-staging` domain reads as unfinished and undercuts trust. Announcing first means re-pointing auth after users have already onboarded.

## Scope
- **In:** create/point a dedicated WorkOS Production environment; migrate `WORKOS_AUTHKIT_DOMAIN` + resource-indicator env vars (`RAVEN_MCP_RESOURCE` and any WorkOS client/issuer vars) to it in the Vercel `site` project Production target; re-verify the three clients; then announce.
- **Out:** any change to the MCP tool surface, the golden anon hash, the taste tools, rate limits, or the marketing site. This is an auth-tenant + config change only — no code behavior change intended.

## Assumptions & open questions
- A WorkOS Production environment can be created under the same WorkOS org with its own AuthKit domain (or a custom `authkit`/auth subdomain of `ravenmcp.ai`). **Open:** decide whether to use the default WorkOS Prod AuthKit domain or a branded custom domain (`auth.ravenmcp.ai` / `login.ravenmcp.ai`) — the branded domain is the stronger GA look but adds a DNS + WorkOS custom-domain step.
- The Prod environment needs its own OAuth client config, redirect URIs, and JWKS endpoint; the resource indicator `aud` stays `https://mcp.ravenmcp.ai/api/mcp-user` (unchanged — it's the resource, not the AS).
- Env vars must be set via the **fresh POST** path (DELETE + POST with `{type:"encrypted"}`), not `vercel env add` piped over stdin — that silently stored `""` during the promote (verify every var by pulling it back and decrypting).

## Approach
1. In WorkOS: create/confirm the **Production** environment; configure AuthKit (default or custom domain), OAuth client, allowed redirect URIs for the three clients, and note the new issuer + JWKS URL.
2. In Vercel `site` project (`prj_Tdsg7…`), Production target: replace `WORKOS_AUTHKIT_DOMAIN` (and any WorkOS issuer/client vars) with the Prod values via DELETE-then-POST REST; leave `RAVEN_MCP_RESOURCE` pinned to the canonical `aud`. **Verify each var by `vercel env pull` + decrypt** before deploying.
3. Fresh supervised `vercel deploy --prod` to `site` (repo root; never `vercel promote`, never `web/`), then re-alias `mcp.ravenmcp.ai` to the new deploy per the go/no-go runbook §5.
4. Re-run the §4 post-deploy gate against `mcp.ravenmcp.ai` with a real token from the Prod AS.
5. Announce.

## Acceptance criteria (done = all true)
- Consent screen during "Connect Raven" shows the Prod/branded domain — **no `-staging`** anywhere user-visible.
- Anon `/api/mcp` = 45 tools, golden hash `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`; `delete_taste_data` absent + refused on anon.
- Authed `/api/mcp-user` = 56 tools with a token minted by the **Prod** AS; `aud` validates against `https://mcp.ravenmcp.ai/api/mcp-user`; expired/garbage tokens 401 with `WWW-Authenticate`.
- All three clients (Claude.ai, Cursor, ChatGPT incl. the persisted-write cross-client check) connect and authenticate against the Prod tenant.
- Delete round-trip + Upstash SCAN `taste:{sub}:*`=`[0,[]]`, rate-limit `~120×200 + 429` authed vs anon unlimited — unchanged from beta.
- Marketing `web` prod deploy byte-identical before/after (§6).

## Verification plan (what → how proven)
- Consent domain clean → screenshot the actual authorize screen for each client, eyes-on, confirm no `-staging`.
- Tool counts + golden hash → live JSON-RPC `initialize` + `tools/list` against `mcp.ravenmcp.ai`, diff against golden.
- Prod-AS token validates → mint via Prod AS, call `/api/mcp-user`, confirm 56 + `aud` accepted; replay an expired token → expect 401.
- Env vars correct → `vercel env pull` + decrypt each migrated var, string-compare to intended value (guards the silent-empty bug).
- Marketing untouched → capture `web` prod deployment id before/after, assert identical.

## Announcement (gated on all acceptance criteria green)
- Draft copy per Andrew's restrained register (show the thing, don't sell it) → save to `/tmp/drafts/` and open in Zed, don't paste to chat.
- Only after the clean consent domain is live — the announcement links people straight into the connect flow.

## Rollback
- Keep the current beta deploy alias-swappable; if the Prod-AS deploy fails the §4 gate, re-alias `mcp.ravenmcp.ai` back to the last-good beta deploy (auth via Staging AS) — beta keeps working while the Prod env is fixed.
