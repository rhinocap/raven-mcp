# 2026-07-29 — nightly /revisit sweep over the 45-session backlog

## Where this left off

Sweep complete through step 4. `~/.claude` has two local commits (`549e0f0`,
`b678a31`); raven-mcp has one (see below). Nothing pushed — the raven-mcp push
gate is Andrew's, and `~/.claude` has no remote.

## Scope: the backlog was 45 sessions, not two

The task framing implied a small backlog. Measured against disk it is **45
un-revisited session logs** spanning 2026-04-11 → 2026-07-28. Coverage was keyed
on the full filename, per instruction — `conversations/metrics.md` carries 25
table columns and 26 `###` entries, which credit **24** of the 69 eligible logs.

Two reconciliation calls worth recording:

- `2026-06-24-site-awardify.md` + `2026-06-25-revisit.md` are one covered
  session (the 06-25 metrics entry is the revisit output of the 06-24 work).
- The `2026-07-21/24` metrics entry **claims** "batch catch-up covering
  2026-07-21 through 2026-07-24" but its content is a coachmark-tour thread plus
  morven-loop it109-171, and matches none of the 8 logs dated 07-21..07-24 on
  disk. Those 8 were counted un-revisited. The claim in metrics.md is wrong and
  is left in place rather than rewritten, since it is a historical record.

Skipped per the rules: everything matching `-PROPOSAL`/`-DRAFT`/`-TEMPLATE`,
today's `2026-07-29-*` logs, and `PROMOTION-QUEUE.md` /
`ideas-and-innovations.md` / `metrics.md` / `CODEX-HANDOFF.md`.

## Transcript resolution FAILED for all 45 — session logs were used

The prescribed disambiguator
(`grep -l '<log-slug>' ~/.claude/projects/-Users-accunliffe-projects-raven-mcp/*.jsonl`)
resolved to **exactly one transcript for zero of the 45 slugs**. Hit counts ran
2 → 50 files per slug. The reason is structural, not incidental: a session log's
filename is read, grepped, and quoted by every later session that consults it,
so the slug appears in far more transcripts than the one that wrote it. Slug-grep
is not a selective index.

**Every one of the 45 was therefore revisited from its session log**, as the
fallback instruction directs. A better future disambiguator would key on the
`cwd` + first-user-turn timestamp range rather than the slug.

## Step 0 — promotion queue

`## Open` was **empty** (cleared earlier the same day by the manual
working-agreement revisit; all 7 items promoted and grep-confirmed).
`## Needs Andrew` empty. Recorded as **queue already empty** — no work.

## Step 3 — ten rules promoted (commit `549e0f0` in `~/.claude`)

Every candidate was grepped against `~/.claude/CLAUDE.md` first; none already
existed. Seven of the ten **amend an existing bullet** rather than adding a new
one, which was deliberate — it keeps CLAUDE.md inside its size budget and, more
importantly, preserves every case that already triggered the host bullet.

| rule | earned by | landed |
|---|---|---|
| Instrument the live surface before shipping a fix built on an engine-internals theory | 2026-07-23 grab-scroll-fix (2 fixes on a wrong compositor theory; `Lenis.setScroll` found by live forensics) | `<understanding-and-autonomy>` |
| A named URL/surface is BINDING; identity = rendered page-specific content, not route or chrome | 2026-07-20/21/22 video sessions — 4 wrong-surface misses; `/raven-design` called the Playground twice while Marginalia was loaded | new bullet, `<understanding-and-autonomy>` |
| A pasted URL/screenshot is not an assignment, and work stays in this session's repo | 2026-07-28 v2.3.0-prep (edited a portfolio file from a raven-mcp session), 2026-07-17 | new bullet, `<understanding-and-autonomy>` |
| Repo / published / deployed are three claims; pull the artifact you are asserting | 2026-07-25 (`gitBranch` pin, 7 minors stale), 07-27, 07-28 (npm served 100 tools, guard green) | new bullet, `<verification>` |
| Media handoff: verify resolved path, metadata, and first frame are THIS render; collision-proof filenames | 2026-07-20 | new bullet, `<verification>` |
| A derived expected value in a harness is itself a claim | 2026-07-27 (`box-sizing` 1px-border harness bug) | new bullet, `<verification>` |
| Motion restraint: no synthetic captions, no flash/whole-screen blur between same-canvas states, ≤2 emphasis beats, no frozen "Applying…" tail | 2026-07-20/21/22 | appended to the restrained-not-salesy bullet |
| Park WIP on a named branch before any clean checkout or parallel fan-out; prefer `git stash push -- <paths>` over `git checkout --` | 2026-07-17 | new bullet, `<session-memory-and-git>` |
| Read a script's argument parsing before passing it a flag | 2026-07-28 (`./scripts/release.sh minor --dry-run` ran a real release; dry-run is `DRY_RUN=1`) | new bullet, `<coding>` |
| Fourth delegation check: confirm the brief ARRIVED intact; pass big context by file path | 2026-07-10 (a Workflow/Codex wrapper truncated the payload; the agent spec'd the wrong feature) | appended to the three-delegation-checks bullet |

New memories in the canonical pool
(`~/.claude/projects/-Users-accunliffe-projects/memory/`), each with a
`MEMORY.md` index line and a `(Memory: [[slug]])` back-link in CLAUDE.md:
`feedback-named-surface-is-binding`,
`feedback-repo-published-deployed-are-three-claims`.

`CLAUDE.md` went 24,058 → 28,954 bytes. That is inside the ~30 KB ceiling but
close to it, which is why three further findings went to `reference/` instead
(commit `b678a31`):

- Playwright `isMobile: true` invalidates every geometry assertion in the run —
  use `deviceScaleFactor` and leave `isMobile` off (2026-07-20 produced a BLOCK
  finding on compliant tap targets this way). → `verification-incidents.md`
- `getBoundingClientRect().height >= 44` does not prove a 44px tap target; probe
  `elementFromPoint` across the box (2026-07-24). → `verification-incidents.md`
- Codex exposes **at most 50 tools per MCP server** (a 105-tool server is
  silently truncated there), and its `approval_mode="approve"` means
  **pre-approved**, not "ask me" (2026-07-24/26). → `routing-ladder.md`

## A superseded lesson that must NOT be re-promoted

`2026-07-02-taste-interview-robust.md` records
*"Delegate-by-default, main-loop-implement is the exception needing
justification."* The current `~/.claude/CLAUDE.md` `<operating-model>` says the
opposite — implementation stays in the main session; delegation is the
exception — because delegate-by-default is what produced the agent-self-report
failure class. **The current rule wins.** Any future revisit reading that log
must not resurrect the reversed lesson.

## Carried forward

- Nothing in this sweep is blocked. The only open item is cadence: see below.
- **This is not a nightly loop.** No single instance can hold one — the longest
  self-scheduled wakeup is one hour. Making it genuinely nightly needs a launchd
  LaunchAgent (precedent: `~/Library/LaunchAgents/com.accunliffe.claude-improve-pipeline.plist`;
  the crontab already runs three trading-bot jobs). Not created — that is
  Andrew's call.
