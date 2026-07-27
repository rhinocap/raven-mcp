# Staged Linear backlog — Raven MCP

Fire these into Linear the moment the claude.ai Linear connector is authed
(`/mcp` → claude.ai Linear → authorize). Team/project: **Raven MCP** (create if absent).
Standing rule: `~/.claude/CLAUDE.md` trigger sweep + memory `feedback_idea_capture_linear`.

## Item 1 — the originating idea (2026-07-22)
**Prioritization judge for Raven MCP** — design-judge-shaped skill for product/business
calls, personalization focus. **STATUS: built** (`~/.claude/skills/prioritization-judge/`).
Backlog entry = "Done / shipped as skill" for the record; link the skill dir.

## Andrew-owed items the morven-loop already tracks (backfill as issues)
- #41 — grade / close
- #42, #43 — Figma-paste (validate comments parser against a REAL paste — it fabricates
  replies from timestamp-looking lines)
- #38, #39 — close
- Telemetry decision — Andrew-owned call on postinstall.cjs (ships in 2.1.0/2.2.0)
- Dogfood pass — `review_diff --fail_on_governed` on a real diff (opens the governance substrate)
- CLAUDE.md ledger flip 2.1.0 → 2.2.0 (still reads 2.1.0)

Each product/business item → score with `/prioritization-judge` (Ladder /30) before ranking.
