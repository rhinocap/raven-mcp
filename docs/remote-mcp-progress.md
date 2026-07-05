# Raven MCP — Remote Hosting: Build Progress Ledger

> Companion to `docs/remote-mcp-scope.md` (the source-of-truth spec).
> One phase per loop iteration. A phase is only ✓ when its verify evidence — a **deployed URL Andrew can open**, or a reproducible command + output — is recorded here.
> **Invariant across every phase: the stdio server keeps working byte-for-byte identically. Additive only.**

Legend: `[ ]` unstarted · `[~]` in progress · `[x]` done (evidence recorded)

---

## Phase 0 — Additive refactor: `buildServer()` factory
**Goal:** Lift the 70 `server.tool()` registrations + the usage-log/update-banner monkeypatch into a `buildServer()` factory that returns a FRESH `McpServer` per call (SDK #961: one server → one transport). stdio `main()` calls `buildServer()` then connects `StdioServerTransport` exactly as today. Zero observable change.

- [x] `buildServer()` factory created; returns a fresh `McpServer` with all 70 tools + wrapper (`src/index.ts` — `export function buildServer(): McpServer` wraps registrations 1562→5843, `return server`; verified importable: `buildServer typeof: function | server has connect: true`)
- [x] stdio `main()` uses `buildServer()`; behavior identical (`const server = buildServer()` then `StdioServerTransport` as before)
- [x] `npm run build` (tsc) passes — `tsc --noEmit` clean, `npm run build` clean
- [x] stdio server boots (`node dist/index.js`) — banner `raven-mcp v1.15.0 running on stdio — design intelligence ready`
- [x] all 70 tools enumerate over stdio (JSON-RPC `tools/list`) — count **70** before and after
- [x] existing test suite still green — **481/481 pass, 0 fail**
- [x] **byte-for-byte identical stdio wire contract** — golden JSON-RPC transcript (initialize + tools/list + tools/call `get_principles`) piped through `node dist/index.js`: `diff before.jsonl after.jsonl` **empty (STDOUT IDENTICAL)**, stderr **empty (STDERR IDENTICAL)**. This is the exact byte stream a client receives → any client that worked before works now. Tool call still wraps handler (monkeypatch intact, 100981-char result).
- [x] **entry-guard matrix** (Fable-flagged risk): import → no server/no banner ✓; **bin symlink → starts + lists 70** ✓ (realpath regression test — the naive guard would have silently killed every installed instance); tsx dev → starts + 70 ✓; direct `node` → starts + 70 ✓. `.mcpb` launches `node ${__dirname}/dist/index.js` (direct real path) → safe.

**Verify evidence / URL:** Local stdio verification (no deploy needed for Phase 0 — it changes only the local entry). Golden-transcript diff empty + 481/481 tests + 4-mode guard matrix all pass. Reproduce: `printf '…initialize/tools/list…' | node dist/index.js` → 70 tools, byte-identical to pre-refactor. Codex adversarial pass: _(running — finalize on clear)_.

---

## Phase 1 — Stateless remote HTTP (45 tools) on Vercel
**Goal:** New HTTP entry via `mcp-handler`, stateless mode (`sessionIdGenerator: undefined`), register ONLY the 45 stateless tools; gate the 20 stateful + 5 browser tools off behind `RAVEN_REMOTE`. No-auth. Secrets via env ONLY.

- [ ] HTTP entry added (Vercel Function via `mcp-handler`), stateless mode
- [ ] Only the 45 stateless tools registered when `RAVEN_REMOTE` is set; 20 stateful + 5 browser gated off
- [ ] Deployed to Vercel; **stdio path still byte-for-byte unchanged**
- [ ] Added as a remote connector in a real client
- [ ] `audit_page` (pasted HTML) returns end-to-end from the deployed URL
- [ ] `get_pattern` returns end-to-end from the deployed URL

**Verify evidence / URL:** _(pending — must be a deployed Vercel URL)_

---

## Phase 3 — Browser audits remote (5 tools)
**Goal:** Add the 5 browser tools with `playwright-core` + `@sparticuz/chromium`, ideally an isolated Function. Manage `/tmp` (unique user-data-dir per run + cleanup) so warm invocations don't fill disk.

- [ ] 5 browser tools wired with `playwright-core` + `@sparticuz/chromium` (fits 250MB bundle)
- [ ] `/tmp` bounded across warm invocations (unique user-data-dir + cleanup)
- [ ] Deployed
- [ ] `audit_url` on a live URL returns from the deployed function

**Verify evidence / URL:** _(pending — must be a deployed Vercel URL)_

---

## Post-Phase-3 — Listing prep (then STOP)
Once Phase 3 verifies:
- [ ] `server.json` draft (official MCP registry format; `remotes` → streamable-http)
- [ ] One-page listing checklist (registry → community → Anthropic dir → OpenAI)

---

## Skipped (out of v1 scope)
- **Phase 2** — registry/directory listing submission: needs Andrew's Team/Ent Claude.ai org + OpenAI org identity verification. (server.json draft prepped above, but submission is out of scope.)
- **Phase 4** — per-user cloud taste: out of v1 scope (needs full OAuth + per-user keyed storage).

---

## Iteration log
- **Iter 1 (2026-07-05):** Created ledger. Analyzed `src/index.ts` structure for Phase 0. Starting Phase 0.
