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

- [ ] 2026-07-05 | agent-output-placeholder-content-check | 6x | Subagent/tool results can pass schema/shape validation while the CONTENT is a stub/placeholder (literal "test" fields, example.com URLs, "waiting for background task" / "Task started in background as task-XXXX") — sanity-check content, not just shape; on detection, re-run the leg with a tightened/blocking prompt or fall back to a direct manual check immediately rather than polling passively or trusting it. NEW this bump: the `codex:codex-rescue` agent is a pure single-invocation forwarder — it launches a detached Codex task and returns immediately, and explicitly refuses ("I am not permitted to call status, poll, block...") if you try to "resume" it expecting a blocking result. Hit AGAIN (6th time) on the 2026-07-06 Next.js-migration session's content+CSS port task (agentId `af36109337d8f0bf5`) — same confusion, same fix needed: poll the on-disk job-state JSON directly or arm a background Bash watcher, never resume the rescue agent itself expecting a blocking result. | -> target: CLAUDE.md
- [ ] 2026-07-05 | scope-doc-enumerate-capability-axes | 5x | When classifying tools/components for a hosting/architecture-scope doc, explicitly enumerate ALL blocking-capability axes (state/persistence, network/external-API, browser/headless-render, GPU/ML-inference/on-device-model) as a checklist rather than only the axes the prompt named — a missed axis (e.g. an on-device model dependency) surfaces as the user having to ask "did you account for X?" NEW this bump: executing the remote-mcp-scope.md classification against real code surfaced the SAME root cause 4 more times across 4 rounds of Codex adversarial review on Phase 1 alone — each round found a distinct capability axis the original state/browser split missed (fs+network read/SSRF, path traversal, local-store read/write oracle, side-effecting/compute-DoS tools). One capability-axis checklist up front would have caught all four in round 1 instead of four separate rounds. | -> target: CLAUDE.md
- [ ] 2026-07-05 | advisor-fork-inherits-and-drifts | 1x | When consulting an advisor/planner subagent (e.g. Fable 5 via the Agent tool) for a FRESH, self-contained question, do not use a context-inheriting `fork` — it can read the entire prior conversation (122k tokens in this instance), make zero tool calls, and return a non-answer that just echoes conversation status instead of independently reasoning. Fix: relaunch as a clean, self-contained agent (e.g. `subagent_type: "Plan"`) with a fully self-contained prompt and no inherited context. Cross-cutting: applies to any Fable/Opus advisor consult under the "Advisor strategy" CLAUDE.md rule, not just this project. | -> target: CLAUDE.md
- [ ] 2026-07-06 | browser-automation-success-lies-about-state | 1x | Browser-automation tool calls (`resize_window`, programmatic `scrollTo`/`window.scrollTo`) can report success while the DOM/viewport state is actually unchanged — always verify with a follow-up JS read (`innerWidth`/`innerHeight`/`scrollY`/`getBoundingClientRect`) rather than trusting the tool's own success message. A CSS `scroll-behavior:smooth` fight can also silently block an instant programmatic scroll — use `window.scroll({behavior:'instant'})` to bypass it. Hit during the Next.js migration's terminal-uniformity + hero-grid verification pass. | -> target: CLAUDE.md
- [ ] 2026-07-06 | content-port-verbatim-fidelity-diff | 1x | When a subagent (esp. Codex) is tasked with a byte-identical content port (HTML→JSX, copy migration), it can silently substitute words that violate an established voice rule even while preserving structure/build-correctness — caught here via Raven's `audit_taste`, not via any build/structural check, when Codex swapped "Field-tested" → "Proven" and "the pattern that works" → "the proven pattern" (banned persuasion verbs per [[feedback-restrained-not-salesy]]). After ANY delegated port/transplant of existing copy, diff the ported text word-for-word against the source (not just structurally) before trusting it verbatim. | -> target: CLAUDE.md

## Promoted

- [x] 2026-07-01 | schedulewakeup-not-for-background-wait | 1x | Never call ScheduleWakeup to wait on a background Workflow/Agent notification — `/loop` dynamic-mode self-pacing only; harness auto-notifies on completion. | landed in ~/.claude/CLAUDE.md "Never ScheduleWakeup to wait on harness-tracked background work — HARD RULE" (2026-07-04)
- [x] 2026-07-01 | surface-tool-fallback-immediately | 1x | Surface a primary-tool failure + silent fallback the moment it happens, not as an end-of-session aside. | landed in ~/.claude/CLAUDE.md "Surface a tool failure + silent fallback the MOMENT it happens — HARD RULE" (2026-07-04)
- [x] 2026-07-01 | perplexity-mcp-key-expired | 1x | Perplexity MCP 401 (expired/rotated key) since 2026-07-01; WebSearch fallback; rotate key. | landed in memory/reference_perplexity_key_expired.md + MEMORY.md index (2026-07-04)
- [x] 2026-07-01 | raven-mcp-parked-branches-count-update | 1x | 6 parked branches supersede memory count of 2. | dropped — superseded: all 6 branches landed in v1.13.0 (shipped 2026-07-01, recorded in memory/project_v1_13_0_released.md); no stale memory to correct remains (2026-07-04)
- [x] 2026-07-02 | exhaustive-verdict-mapping-audit | 1x | Categorical mappers over multi-scheme corpora need an explicit branch per scheme; silent default-returns only surface as downstream instability. | landed in ~/.claude/CLAUDE.md "Categorical mappers over multi-scheme corpora — HARD RULE" (2026-07-04)
