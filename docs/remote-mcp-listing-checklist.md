# Raven MCP — Remote Connector Listing Checklist (one page)

> Prereq: the hosted Streamable-HTTP endpoint is live and verified (Phase 3 ✓). This is the
> submission runbook for getting Raven listed as a **public remote connector**. Two real
> gates (below) are Andrew's to clear — everything else is mechanical.

## 0. Preconditions (Andrew — blocking, not code)

- [ ] **Durable domain cutover.** `server.json` points `remotes[0].url` at `https://ravenmcp.ai/api/mcp`,
      but that path is **not live yet** — `ravenmcp.ai` is served by a separate production deploy
      **outside this git line** (aliasing it to a CLI preview would regress the marketing site ~9KB/16h).
      The `/api/mcp` function must be merged into whatever source deploys `ravenmcp.ai` (git integration /
      production branch) so the custom domain serves it **without** rolling back the site. Until then the
      only working URL is the preview (`site-<hash>…vercel.app/api/mcp`), which rotates and is unsuitable
      for a public listing.
- [ ] **Vercel WAF rate-limit** on `/api/mcp` (~60 req/min/IP) — the accepted-residual mitigation for a
      no-auth endpoint (scope §9). Dashboard config, zero code. Do before public listing.
- [ ] **Org identity verification** (only for the Anthropic + OpenAI *directories*, step 3–4): needs
      Andrew's Team/Enterprise Claude.ai org and OpenAI org verification. The open MCP registry (step 1)
      and community lists (step 2) need neither.

## 1. Official MCP Registry (`registry.modelcontextprotocol.io`) — primary, no gatekeeping

- [ ] `server.json` finalized — schema `2025-12-11`, `name: ai.ravenmcp/raven-mcp`, both a `packages`
      (npm/stdio) entry AND the `remotes` (streamable-http) entry. **Validate** against the published
      schema before submit.
- [ ] Prove **namespace ownership** of `ai.ravenmcp/*` — DNS TXT record on `ravenmcp.ai`
      (`mcp-verify=…`) per the registry's domain-verification flow (the `ai.ravenmcp` reverse-DNS
      namespace requires control of `ravenmcp.ai`).
- [ ] Publish via the registry CLI / `POST /v0/publish` with the signed `server.json`.
- [ ] Confirm the listing resolves and the `remotes` URL is reachable from a clean client.

## 2. Community connector lists (fast, no identity gate)

- [ ] PR to the community "awesome-mcp-servers" / connector directories (one-line entry + URL).
- [ ] Ensure the repo `README` documents the remote URL + the 45-tool remote surface (stdio = 70).

## 3. Anthropic connector directory (Claude web/desktop)

- [ ] Requires org identity verification (precondition 0). Submit through the Anthropic connector
      intake with the durable `https://ravenmcp.ai/api/mcp` URL, no-auth, tool list + descriptions.
- [ ] Note the remote surface excludes stateful/browser-gated tools by design (security, scope §9).

## 4. OpenAI (ChatGPT connectors / apps)

- [ ] Requires OpenAI org identity verification (precondition 0). Submit the same durable URL.

## What ships remote (say this in every listing)

- **45 tools** over Streamable-HTTP (stateless, no-auth): 40 CPU-only design-intelligence tools + 5
  headless-Chromium browser audits (`audit_url`, `audit_contrast`, `audit_tap_targets`,
  `audit_responsive_visibility`, `audit_video_playback`).
- **Gated OFF remote** (local-only, by design): 20 stateful `~/.raven` taste/creative tools + 5
  fs/network/side-effect tools. The full 70-tool surface is available via the **stdio** npm package.
- Hardening summary: capability-axis gating + 400KB body cap + in-process SSRF egress proxy for the
  browser tools (details: `docs/remote-mcp-scope.md §9 / §9a`, evidence: `docs/remote-mcp-progress.md`).

## Explicitly OUT of scope (v1)

- **Phase 2** full directory submission automation — needs the org accounts above.
- **Phase 4** per-user cloud taste — needs OAuth + per-user keyed storage.
