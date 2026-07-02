# Promotion Queue

Cross-cutting or repeat-offender rules identified by headless `/revisit` runs (on `/clear`)
that could NOT be promoted directly — a headless run cannot edit `~/.claude/CLAUDE.md` or
`memory/*.md`. Each open item here is a rule waiting for a **manual** `/revisit` (the only
thing that can clear this queue) to: (1) promote it to its `-> target`, (2) grep-confirm it
landed, (3) move the line to `## Promoted`.

Row format:
```
- [ ] YYYY-MM-DD | <slug> | <N>x | <one-line rule> | -> target: CLAUDE.md | memory/<file>.md
```

Never check off / move / delete an item in a headless run. Only a manual `/revisit` clears
entries. If a headless run sees an existing open row for the same slug, bump its count
in place instead of duplicating.

## Open

- [ ] 2026-07-01 | schedulewakeup-not-for-background-wait | 1x | Never call ScheduleWakeup to wait on a background Workflow/Agent notification — that tool is for `/loop` dynamic-mode self-pacing only; the harness auto-notifies on completion, so waiting on a background task requires no tool call at all. | -> target: CLAUDE.md
- [ ] 2026-07-01 | surface-tool-fallback-immediately | 1x | When a primary tool (search API, MCP) fails and an automatic fallback silently takes over, proactively surface the failure+fallback the moment it's known — don't leave it as an end-of-session aside; a silent fallback reads to the user as "broken" and they end up re-asking whether the capability even works. | -> target: CLAUDE.md
- [ ] 2026-07-01 | perplexity-mcp-key-expired | 1x | Perplexity MCP (`mcp__perplexity__*`) is returning 401 (expired/rotated key) as of 2026-07-01 — WebSearch is the working fallback in the meantime. Needs the key rotated in whatever env/credential store backs the Perplexity MCP server. | -> target: memory/reference_perplexity_key_expired.md
- [ ] 2026-07-01 | raven-mcp-parked-branches-count-update | 1x | raven-mcp actually has 6 fully-built, unmerged feature branches parked (feat/score-page, feat/audit-video-playback, feat/audit-consistency, feat/layout-orphan-stretch, feat/svg-color-compliance, feat/dropdown-menu-pattern) cut from base b51d570 — supersedes the existing project memory's count of 2. All zero-risk to land for v1.13.0 prep. | -> target: memory/project_v1_12_0_staged_and_parked_branches.md

## Promoted

(none yet)
