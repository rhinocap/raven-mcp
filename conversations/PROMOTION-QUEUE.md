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

(empty)

## Promoted

- [x] 2026-07-01 | schedulewakeup-not-for-background-wait | 1x | Never call ScheduleWakeup to wait on a background Workflow/Agent notification — `/loop` dynamic-mode self-pacing only; harness auto-notifies on completion. | landed in ~/.claude/CLAUDE.md "Never ScheduleWakeup to wait on harness-tracked background work — HARD RULE" (2026-07-04)
- [x] 2026-07-01 | surface-tool-fallback-immediately | 1x | Surface a primary-tool failure + silent fallback the moment it happens, not as an end-of-session aside. | landed in ~/.claude/CLAUDE.md "Surface a tool failure + silent fallback the MOMENT it happens — HARD RULE" (2026-07-04)
- [x] 2026-07-01 | perplexity-mcp-key-expired | 1x | Perplexity MCP 401 (expired/rotated key) since 2026-07-01; WebSearch fallback; rotate key. | landed in memory/reference_perplexity_key_expired.md + MEMORY.md index (2026-07-04)
- [x] 2026-07-01 | raven-mcp-parked-branches-count-update | 1x | 6 parked branches supersede memory count of 2. | dropped — superseded: all 6 branches landed in v1.13.0 (shipped 2026-07-01, recorded in memory/project_v1_13_0_released.md); no stale memory to correct remains (2026-07-04)
- [x] 2026-07-02 | exhaustive-verdict-mapping-audit | 1x | Categorical mappers over multi-scheme corpora need an explicit branch per scheme; silent default-returns only surface as downstream instability. | landed in ~/.claude/CLAUDE.md "Categorical mappers over multi-scheme corpora — HARD RULE" (2026-07-04)
