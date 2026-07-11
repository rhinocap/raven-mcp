# Session: 2026-07-11 — grab auto-delivery

## This session
### Auto-deliver grab sends to the agent (/goal)
**What:** Added key-protected GET /agent/wait long-poll to the grab bridge; start_grab_session returns wait_url + POSIX watch_command; agent_protocol instructs launching it as a background task (harness re-invokes agent the moment the user hits Send). Shim mode → empty watcher fields + manual-drain fallback; watcher exits after 5 consecutive curl failures. Tests: 8 new incl. real-shell watcher execution + stop-during-wait. 602/602 green.
**Why:** /goal "when someone sends to an agent it should automatically get the message". Figma file 0fOhyQa7yxDkx7j8ZCCAuO "Send to agent flow" promises real delivery (Send to agent → spinner-check → ✓ Sent to agent); copy now truthful.
**Pushed:** f82f8de on f23-templates-layers
**Notes:** Codex implemented via Workflow; Codex falsifier found 5 real defects (shim watch_command, tight curl loop, string-only test, missing stop-wait test, dense copy) — all fixed. Adapter work (746f7dd etc.) already merged to origin/main; no duplication.
