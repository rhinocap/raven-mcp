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
- [ ] Built · commit: `______`
- [ ] `mcp.ravenmcp.ai` attached to this Vercel project (DNS record; no marketing redeploy)
- [ ] PRM doc at `/.well-known/oauth-protected-resource` → live AS metadata
- [ ] garbage Bearer → 401 + correct `WWW-Authenticate` · [ ] wrong-`aud` token rejected
- [ ] MCP Inspector completes full OAuth flow against preview → 45 tools · [ ] anon `/api/mcp` == golden hash
- Preview URL: `______` · Verify evidence: `______`

### P4.2 — Upstash store + identity threading (profile trio un-gated)
- [ ] Built · commit: `______`
- [ ] user A creates profile → reads back **after a fresh redeploy** · [ ] user B sees empty + cannot read A's
- [ ] two parallel authed requests (different tokens) isolated · [ ] anon == golden hash, taste still refused
- Preview URL: `______` · Verify evidence: `______`

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
