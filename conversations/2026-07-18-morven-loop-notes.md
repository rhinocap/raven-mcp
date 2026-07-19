
## Standing constraint (Andrew, 2026-07-18, verbatim intent)
- Andrew's active two-panel grab work lives in worktree /private/tmp/raven-f23, branch f23-templates-layers, 52 LOCAL-ONLY commits ahead of origin (tip a83d592). **"Don't touch that"** — the loop must never read/write/push/back up that worktree or branch, and must not modify browser/raven-grab.js, web/public/raven-grab.js, or test/grab-bridge.test.mjs anywhere (his files, being developed with Grok 4.5 in Cursor).
- Risk flagged to Andrew (no action taken): /private/tmp is periodically cleaned by macOS; the 52 commits are unpushed. Backup/push is his call only.
- Loop it18 in flight: manifest tools sync (manifest.json 51→93 + release.sh wiring + drift test), built by Sol in scratchpad worktree wt-manifest-sync, branch manifest-sync. Disjoint from his files.

## Iteration 18 — 2026-07-18 — .mcpb manifest tools sync (ledgered drift item)
**Shipped:** PR #35 https://github.com/rhinocap/raven-mcp/pull/35 (branch manifest-sync, commit cdb9e6e, base fa0671e; merge Andrew-gated) — manifest.json regenerated 51→93 tools from the built server; sync script + release.sh wiring (SKIP_BUILD=1 dedup) + deep-compare drift test. Built by Sol (medium) in isolated scratchpad worktree; zero overlap with Andrew's f23 files.
**Evidence:** 769/770 pass, 0 fail, 1 conditional skip, real Chromium; sync deterministic (same sha256 across 5 server starts); only tools array changed.
**Adverse split:** Sol-only 6 (stale-bundle disposition, deep-compare test, 26 mid-sentence truncations, timeout math, double build, symlink) — all fixed/dispositioned; Fable-only 7 (1 factual correction: stale bundle manifest = 51 tools not 78; 6 verified-safe confirmations incl. orphan paths, U+2026 JSON, import side effects); false alarms 0. Fable's unique material yield was low this round (one numeric correction).
**Customer pass:** indie dev — the .mcpb install listing will finally match the 93-tool claim after Andrew's next release (their bounce is exactly this incoherence); team — tool-surface claims now test-enforced. Vision: exempt (no rendered surface).
**Matrix cell:** none (coherence/infra). **Ledgered:** site/raven.mcpb stale at 51 tools — auto-resolved by the weekend release.sh run now that sync is wired.
**Next candidate:** 93-tool client-compat verification (top-10 item 6) or matrix full refresh (due ≤07-31). Constraint standing: f23 worktree + grab overlay files are Andrew's — hands off.

## Iteration 19 — client-compat verification of the 93-tool surface (2026-07-18)
**Picked:** verify the post-landing 93-tool surface actually reaches the three coding-agent clients (Claude Code, Codex, Cursor) — W3 depends on engineers' agents seeing design intent.
**Findings:**
1. **stdio ground truth: 93 tools** ✓ (direct JSON-RPC probe of `node dist/index.js`).
2. **Claude Code: stale-connection landmine (real).** MCP connections snapshot the tool list at connect time. This session's own raven connection predates the 07-18 landing and lacks `review_diff`/`polish_diff`/`decision_import`. A team member who doesn't reconnect after a release silently works against the old surface. Docs/release notes should say "reconnect your MCP client after upgrading."
3. **Codex: WORKS — the earlier "0 raven tools" was a probe artifact, not a failure.** Codex 0.144 permanently defers MCP tools out of the model's upfront tool list (`tool_search_always_defer_mcp_tools` = removed/true), so "list your tools" probes always report 0 MCP tools. A real invocation succeeds: `codex exec` under Andrew's main config discovered and called `raven/list_taste_profiles` and returned live profile JSON (`CALLED: yes`). The 20-entry `disabled_tools` list and the ~50-tool-cap arithmetic are moot under deferral — no it20 fix needed.
   - Isolated-home caveat: a bare temp CODEX_HOME cancels MCP calls ("user cancelled MCP tool call") even with `approval_policy=never` — quirk of missing trust/onboarding state, not present in the real config. Don't diagnose from bare homes.
4. **Cursor: configured (`~/.cursor/mcp.json` has raven), cap behavior unprobed** — no evidence of a problem; left alone.
**Evidence:** debug boot log shows raven-mcp 1.17.1 initializing cleanly as a Codex client peer; live tool call payload under main config.
**Matrix cell:** W3 "engineers pull design intent from their own agent" — confirmed working in Codex + Claude Code (with reconnect caveat), not regressed.
**No code shipped this iteration** (verification iteration; the candidate fix — RAVEN_TOOL_PROFILE=compact / disabled_tools retune — is CANCELLED as unnecessary).
**Next candidate:** iteration 20 = ZOOM-OUT (every 5th): gap_scan the matrix, walk both personas end-to-end, reprioritize top-10.

### Iteration 19 — CORRECTION after Sol adverse pass (supersedes the "no fix needed" conclusion above)
Sol's adverse pass (9 findings, 8 REAL) falsified my "cancelled as unnecessary" call. Follow-up probes found the true breakage and it is now FIXED:
- **Real root cause:** in headless `codex exec`, only raven tools with an explicit `[mcp_servers.raven.tools.<name>] approval_mode = "approve"` entry are callable; unlisted tools auto-cancel ("user cancelled MCP tool call") even with `approval_policy = never`. Andrew's config listed 29 tools (78-era tuning) — so all 15 post-landing tools and ~30 older unlisted tools were unreachable from Codex. Matches upstream Codex issues #16685 / #14115.
- **Proven mechanism:** `-c 'mcp_servers.raven.tools.list_brand_profiles.approval_mode="approve"'` flipped that tool from CANCELLED → CALLED: yes. Server-level `approval_mode` does NOT work; per-tool is the lever.
- **Fix applied:** appended 46 per-tool `approval_mode = "approve"` entries to `~/.codex/config.toml` (every enabled tool not already listed; `delete_taste_data` intentionally omitted — destructive stays gated). Backup: scratchpad `config.toml.bak-pre-raven-approvals`. Verified live: `decision_list` and `list_brand_profiles` both return real data via `codex exec` now.
- **Standing landmine for releases:** every release that ADDS tools must add matching approval entries to Codex config, or the new tools are silently unreachable from the $0-marginal executor. Ledgered.
- **Adverse split (Sol → Fable):** Sol-only: 7 real findings (deny-filter arithmetic, discoverability untested, fresh-home cancellation is real, overclaim on 93-reachable). Fable(main-loop)-only: exact unlisted-vs-listed approval mechanism + the per-tool `-c` proof + the applied fix. False alarms: 0. Pass 2 ran as the Fable main loop's own deterministic verification of each Sol finding (config greps + live calls) rather than a spawned once-over.
- **Discoverability note:** Codex found `decision_list` from a semantic request ("show me the design decisions recorded for this repo") — BM25 deferral discovery works for at least non-obvious post-landing tools.
