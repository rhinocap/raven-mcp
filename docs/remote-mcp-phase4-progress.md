# Phase 4 — Per-User Authenticated Taste Engine — Progress Ledger

> Read this FIRST each iteration → find the next unchecked phase → build ONLY that phase.
> Source of truth: `docs/remote-mcp-phase4-scope.md`. Predecessor ledger (Phases 0/1/3): `docs/remote-mcp-progress.md`.
> **Never check a phase done without a DEPLOYED Vercel preview URL + verification transcript recorded here.**

## Owner decisions (LOCKED 2026-07-05 — no gates pending; P4.1 may start immediately)

- [x] **Access = FREE while in beta** (AuthKit identity only; no Outseta/subscription check).
- [x] **Canonical endpoint = `mcp.ravenmcp.ai`** (attach to THIS repo's Vercel project; PRM `resource` + JWT `aud` bind to it).
- [x] **ChatGPT = HARD P4.4 exit requirement** (Claude.ai + Cursor + ChatGPT all must pass).
- **Stack:** WorkOS AuthKit (AS, resource-server posture) · Upstash Redis (per-user store). Swappable per scope doc.

## Golden invariant (record + re-check every iteration)

- [x] **Anonymous 45-tool golden hash** captured 2026-07-05 from live `/api/mcp` `tools/list` (45 tools): `sha256(sorted names) = f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`
- Every phase's verify MUST re-confirm this hash on the fresh preview + a green `npm test`, else HALT.

## Phases

### P4.0 — Async `TasteStore` interface; fs adapter; stdio byte-identical
- [x] Built · commit: `5c0a80a`
- [x] `npm test` green (492/492) · [x] zero `node:fs` in `taste.ts` outside `FsTasteStore` · [x] `~/.raven/taste` files format-identical (2-space indent, trailing `\n`, same keys — stdio smoke)
- [x] Preview URL: `https://site-1ay3h31x8-cunliffeandrewc-8712s-projects.vercel.app` · anonymous tools/list == golden hash (45 tools, sha `f64bb18…2bb0a6`), gated taste tools absent
- Verify evidence: live `/api/mcp` initialize+tools/list → 45 / golden / no-leak (p40-http-probe); local `buildServer({remote:true})` hash == golden; `FsTasteStore.describe` → absolute path (byte-identical corrupt-store error), `ClosedTasteStore` reads null/[] + writes throw.
- Codex devil's-advocate (verdict FALSIFIED → dispositioned): **(C)** corrupt-sidecar error had drifted from absolute path to logical filename → **FIXED** via `store.describe()` (Fs = absolute path restores byte-identity; non-fs = logical name, since an absolute path is false for Redis). **(B)** `bind_taste_surface` reads `.png` references via `readFile` (`index.ts:5848`), bypassing the store — pre-existing, gated off remote → **deferred to P4.3** (make the image-ref read a store/injected capability, or disallow remote image refs). **(D)** read-modify-write races in bind/record (no atomicity) — benign under serial stdio + throwing remote store → **deferred to P4.2** (atomic mutation semantics before Redis un-gating).

### P4.1 — AuthKit AS + OAuth discovery + authed endpoint skeleton (still 45 tools)
- [x] Built · commit: `f050a13`
- [x] `mcp.ravenmcp.ai` attached to this Vercel project (project `site`, assigned to branch `p4-remote-taste`; GoDaddy CNAME `mcp` → `59de16ab2447e147.vercel-dns-017.com.` added 2026-07-05; no marketing redeploy — `web` project untouched)
- [x] PRM doc at `/.well-known/oauth-protected-resource` (+ `/api/mcp-user` path-suffixed) → live AS metadata (`https://artistic-gold-76-staging.authkit.app`, RFC 8414 proxy also served)
- [x] garbage Bearer → 401 + `WWW-Authenticate: Bearer error="invalid_token", … resource_metadata="…/.well-known/oauth-protected-resource/api/mcp-user"` · [x] wrong-`aud` token rejected (real AuthKit token minted with `resource=https://mcp.ravenmcp.ai/api/mcp-user` → 401 invalid_token on the preview host)
- [x] Full OAuth flow completes against preview → authed `tools/list` = 45 == golden hash (DCR `/oauth2/register` public client + PKCE S256 + `resource` indicator; scripted browser client in lieu of MCP Inspector — sandbox egress cannot reach *.vercel.app, so Inspector could not run; identical protocol path, incl. AuthKit login + consent by Andrew) · [x] anon `/api/mcp` == golden hash (45, `f64bb18…2bb0a6`, no taste tools)
- Preview URL: `https://site-git-p4-remote-taste-cunliffeandrewc-8712s-projects.vercel.app` (deployment `site-p3r23e4xj`, redeployed post-env) · Verify evidence: live transcript 2026-07-05 — anon tools/list 200/45/golden; PRM+AS 200; no-Bearer 401 challenge; garbage 401 invalid_token; AuthKit JWT (`iss` artistic-gold-76-staging, `aud` = preview `/api/mcp-user`) → 200/45/golden, no taste tools; canonical-`aud` token vs preview host → 401. WorkOS: DCR+CIMD enabled; resource indicators = preview alias + canonical. Env (Preview only): `WORKOS_AUTHKIT_DOMAIN`; `RAVEN_MCP_RESOURCE` unset → host-derived `aud` binding (unit-tested in `test/mcp-user-auth.test.mjs`). Local `npm test` 507 pass / 0 fail.

### P4.2 — Upstash store + identity threading (profile trio un-gated)
- [x] Built · commit: `64633d0`
- [x] user A creates profile → reads back **after a fresh redeploy** (deployment `site-kdi086yym`, fresh build, `get_taste_profile p42check` → 200 with created_at intact; Upstash REPL shows `taste:user_01KWTZTZRD18MHR443RXB72J9Y:profile:p42check` + `:profiles` index — physically in Redis, not /tmp)
- [ ] user B sees empty + cannot read A's — **PENDING (only open item)**: B identity exists in AuthKit (`cunliffeandrewc+ravenb@gmail.com`, signed up 2026-07-05 23:27) but its one-time auth code was lost before exchange (Incognito window closed). Morning step: re-run `p42b-user-b-signin.html` → paste redirect URL. Unit-level isolation IS proven (`test/redis-taste-store.test.mjs`: shared client, two subs, zero bleed; B cannot `get` A's profile).
- [ ] two parallel authed requests (different tokens) isolated — pending B token (same morning step)
- [x] anon == golden hash (45, `f64bb18…2bb0a6`) · authed surface = 48 with exactly `create/get/list_taste_profiles` added · [x] local `npm test` 512 pass / 0 fail
- Preview URL: `https://site-git-p4-remote-taste-cunliffeandrewc-8712s-projects.vercel.app` · Verify evidence (partial, 2026-07-06 ~06:00–06:30Z): silent-OAuth A token (aud=preview) → tools/list 48; create/get/list `p42check` live; redeploy → read-back OK; Upstash keys inspected via Vercel REPL. Known cosmetic: authed `create_taste_profile` response still says `"home": "~/.raven/taste"` — misleading on the Redis path, fix queued for P4.3 (authed-path-only change).
- Provisioning note: Upstash store = existing team DB `upstash-kv-charcoal-book` (Upstash for Redis, Free plan) connected to project `site` (all envs), env `KV_REST_API_URL`/`KV_REST_API_TOKEN` injected by the integration — no new marketplace terms needed.

### P4.3 — Full taste subset un-gated for authenticated users
- [ ] Built · commit: `______`
- [ ] create→interview→bind→record_decision→audit_taste (binding echoed in `design_notes`)→label_finding→portrait inline
- [ ] cross-user isolation re-run · [ ] anon == golden hash · [ ] stdio `npm test` green
- Preview URL: `______` · Verify evidence: `______`

### P4.4 — Real-client startup interview end-to-end (Claude.ai + Cursor + ChatGPT)
- [ ] Built/instruction-tuned · commit: `______`
- [ ] Claude.ai: OAuth + interview + persist · [ ] Cursor: OAuth + interview + persist · [ ] **ChatGPT: OAuth + interview + persist (hard gate)**
- [ ] reconnect / 2nd client → same profile returned · [ ] anon == golden hash
- Preview URL: `______` · Verify evidence: `______`

### P4.5 — Privacy, deletion, rate limits, follow-on scope; production promote
- [ ] Built · commit: `______`
- [ ] `delete_taste_data`: create→delete→reads empty + Upstash shows 0 keys for `sub`
- [ ] per-user 429 on authed path while anonymous stays unthrottled · [ ] privacy/retention note in README + scope doc
- [ ] follow-on scope doc for creative subset written (not built)
- [ ] anon == golden hash · [ ] **promoted to production** (this repo's Vercel project; never toward the marketing line)
- Preview URL: `______` · Verify evidence: `______`

## Iteration log

- 2026-07-05 — Phase 4 scope + ledger created; owner decisions locked (free · mcp.ravenmcp.ai · ChatGPT hard). Plan of record: Fable. Next unstarted: **P4.0**.
- 2026-07-05 — **P4.0 shipped** (commit `5c0a80a`, preview `site-1ay3h31x8`): async `TasteStore` + `FsTasteStore`/`ClosedTasteStore`, `taste.ts` fs-free, stdio byte-identical (`describe()` restores corrupt-store error text), 492/492 tests, anon 45/golden hash. Codex adversarial pass dispositioned (C fixed; B→P4.3; D→P4.2). Next unstarted: **P4.1** — blocked on Andrew's provisioning: WorkOS AuthKit account, Upstash Redis via Vercel Marketplace, `mcp.ravenmcp.ai` DNS.
- 2026-07-06 (overnight) — **P4.2 built + verified except the user-B leg** (commit `64633d0`, preview verified live; see P4.2 section — only B-token isolation + parallel-request checks pending, blocked on one morning sign-in; B identity already exists in AuthKit). **P4.3 pre-built locally** (uncommitted in the working tree, to be committed AFTER P4.2's verify closes): all 10 taste tools store-presence-un-gated; portrait inline (no fs) behind remote branch; remote bind refuses .png paths + public-URL-guards reference captures; `audit_taste` url mode added to REMOTE_URL_GUARDED_TOOLS; `home: "cloud:per-user"` on the authed create response. Local suite 516 pass / 0 fail; anon surface still golden 45. Morning order: (1) B sign-in → close P4.2 bar + ledger, (2) CLI agent commits P4.3, (3) preview verify P4.3.
- 2026-07-05 — **P4.1 shipped** (commit `f050a13`, branch `p4-remote-taste`, preview `site-git-p4-remote-taste-…vercel.app`): WorkOS AuthKit provisioned (env `Staging`, tenant `artistic-gold-76-staging.authkit.app`; account created by Andrew; DCR+CIMD enabled; resource indicators = preview alias + `https://mcp.ravenmcp.ai/api/mcp-user`). New `api/_auth.js` + `api/mcp-user.js` + `api/well-known.js` + vercel.json rewrites/CORS — all additive; `api/mcp.js` byte-identical. `mcp.ravenmcp.ai` domain added to project `site` bound to the branch (GoDaddy CNAME live, propagation pending at verify time). Verify: full bar met on the deployed preview incl. real-token 45/golden and deployed wrong-`aud` 401 (see P4.1 section). Deviation from bar-as-written: MCP Inspector replaced by a scripted DCR+PKCE browser client (sandbox egress can't reach *.vercel.app); protocol-equivalent, real clients land in P4.4. Next unstarted: **P4.2** (Upstash Redis via Vercel Marketplace still to provision).
