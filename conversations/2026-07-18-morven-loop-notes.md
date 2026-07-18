
## Standing constraint (Andrew, 2026-07-18, verbatim intent)
- Andrew's active two-panel grab work lives in worktree /private/tmp/raven-f23, branch f23-templates-layers, 52 LOCAL-ONLY commits ahead of origin (tip a83d592). **"Don't touch that"** — the loop must never read/write/push/back up that worktree or branch, and must not modify browser/raven-grab.js, web/public/raven-grab.js, or test/grab-bridge.test.mjs anywhere (his files, being developed with Grok 4.5 in Cursor).
- Risk flagged to Andrew (no action taken): /private/tmp is periodically cleaned by macOS; the 52 commits are unpushed. Backup/push is his call only.
- Loop it18 in flight: manifest tools sync (manifest.json 51→93 + release.sh wiring + drift test), built by Sol in scratchpad worktree wt-manifest-sync, branch manifest-sync. Disjoint from his files.
