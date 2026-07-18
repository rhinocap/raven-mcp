
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
