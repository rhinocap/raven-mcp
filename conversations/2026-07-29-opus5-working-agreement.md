# 2026-07-29 — Opus 5 working agreement (rule-corpus rework)

Per-instance log. Not a raven-mcp code session — the repo is only the cwd; every artifact is in
`~/.claude/` except the promotion queue and metrics, which live here.

## Where this left off

All 9 approved items applied and grep-confirmed. A GPT-5.6-Sol medium falsification pass is the
last gate before the word "done" (that gate is itself one of the new rules, applying to its own
rollout). Two decisions are open and belong to Andrew — see **Open for Andrew** below.

## What Andrew asked for

He opened saying he's been having trouble working with me and suspected his rules were fighting my
system prompt. He asked for (a) a goal for how he can best work with Opus 5, measured against what
`/revisit` measures, (b) a Fable consult — noting the earlier "give Opus the reasoning of Fable"
exercise may have been the wrong direction, and (c) that we work it out together. Mid-turn he
redirected: **"Don't write anything on your own, com bak with findings and let's sepc it out."**
Findings first, collaborative spec, no unilateral writing. That redirect is the shape of the whole
session.

## What we found

The friction is a **measurement problem, not a rules-vs-harness problem** — Fable's framing, which
I adopted over my own. The system scores never-asking (autonomy) and error-catching (hook catches),
so it evolved toward both. The two numbers Andrew actually cares about paid for it:

| Metric | Actual | Target |
|---|---|---|
| First-attempt accuracy | 74–85% | 90% |
| Round-trips per task | 1.6–2.0 | 1 |
| Autonomy | 97–99% | 90% |

Autonomy overshooting its target by 9 points is not a bonus. It is the mechanism: suppressed
questions get paid back as rework, and rework is exactly what the other two numbers measure.

Seven literal contradictions in the corpus, ranked by fire rate. **Three produced live specimens
during this session itself:**

1. `/revisit` force-fired on an empty transcript because the word "/revisit" appeared descriptively
   in a message.
2. Three binding `INSTRUCTION` lines injected on a *background task notification* — no user message
   existed to instruct against. A `Stop` hook fires after a turn; it can never be proactive.
3. The routing hook **blocked the Fable consult Andrew requested by name**, verbatim, in the same
   message. A `PreToolUse` hook receives only the tool call, never the user's message — so
   intent-based gating there is structurally impossible, not merely mistuned.

And the weighting finding that drove the rest: **all four dominant failure classes in
`PROMOTION-QUEUE.md` occur BEFORE the first attempt**, while the corpus carried 18 post-claim
verification bullets against roughly one pre-attempt clause. The rules were guarding the wrong end
of the task.

## Decisions Andrew made

Eight, via two `AskUserQuestion` rounds plus free text:

- Autonomy becomes a **~90% band, not a score**. ~1 question per 10 tasks is budgeted.
- Ponytail **off** for this collaboration.
- Implementation returns to the **main session**; the routing **deny path is deleted**.
- The done-gate triggers on **the word** "done" — not on a class of surface. ("I want it on anytime
  you say something is 'done.'")
- **done-gate + a single Sol pass.** The second serial Fable review leg is removed — no distinct
  catches on record, and it is metered.
- On the Fable-vs-Stop-hook question he asked for Fable's recommendation and took it: **keep the
  hook, delete the prose demand.** A zero-cost net catching ≥3/session is working; prose measures
  ~50% compliance.
- Metrics: annotate the changeover date, log hook catches in their **own column** rather than
  dropping them.
- "Amend 47, keep 67 and 71 loaded, projects/memory is the right path, it should include all of my
  projects not just Raven."

## Changes and why

| File | Change | Why |
|---|---|---|
| `~/.claude/CLAUDE.md` L6 | Autonomy → a ~90% band; "99% is a symptom, not a score" | The lever, not the trophy |
| `~/.claude/CLAUDE.md` L13 | Pre-edit spec: every file, surface, capability axis, human gate | Kills the post-hoc "also had to touch X" (queue: 5x) |
| `~/.claude/CLAUDE.md` L14 | Name the failure mode, verify THAT — never a proxy | DNA §3, the one part worth keeping resident |
| `~/.claude/CLAUDE.md` L15 | Implementation stays in the main session | Delegation is the mechanism behind the 8x self-report class |
| `~/.claude/CLAUDE.md` L47 | Hook INSTRUCTION → strong default, with three named override conditions | Andrew's "Amend 47"; specimens 1 and 2 above |
| `~/.claude/CLAUDE.md` `<verification>` | 18 bullets → 10; done-gate bound to the WORD | Weight moved forward; L67/L71 kept loaded per his call |
| `~/.claude/CLAUDE.md` `<routing>` | 5 bullets → 2; doctrine, not gate | The gate blocked a by-name request |
| `~/.claude/CLAUDE.md` | Scope lock: "Edit nothing unrequested" | An adjacent problem gets ONE report line, not a fix |
| `~/.claude/reference/verification-incidents.md` | NEW — 9 relocated bullets, by surface | Nothing deleted; just not resident in every session |
| `~/.claude/settings.json` L171 | `ponytail@ponytail` → `false` (backup `/tmp/settings.json.bak-20260729`) | His call; JSON re-validated after write |
| `~/.claude/scripts/openai-routing-reminder.sh` | `deny()` → log-only | Structural, not tunable. Log still records what WOULD have blocked, so auditing is unaffected |
| `~/.claude/fable_5_dna.md` | Archived in place, not deleted | §2-spirit/§3/§5 folded into CLAUDE.md; **§9 deleted as harmful**; still valid for Sonnet-class successors |
| `~/.claude/SUCCESSION.md` | Inheritor framing scoped; DNA notice; rule 7 → single-Sol on the word | "Outside those documented surfaces, your judgment IS the deliverable" |
| `~/.claude/skills/revisit/SKILL.md` step 4 | Band scoring + hook-catch row | Stop double-billing the guardrail |
| `conversations/metrics.md` | Hook-catch row + changeover and band annotations | The series is NOT continuous across today |
| `conversations/PROMOTION-QUEUE.md` | All 7 open items → Promoted, grep-confirmed | First manual clear since 2026-07-08 |
| memory (canonical pool) | `feedback_working_style` rewritten; 2 new feedback files + index | The old file literally said "never ask 'should I…?'" |

## Lessons

- **The Fable exercise was half-right.** Its reasoning content (decompose · name the risk · KNOWN vs
  GUESSED) was worth keeping; its §9 routing doctrine made delegation a first-class obligation, and
  delegation is the mechanism behind the single largest measured accuracy loss. Fable audited its
  own artifact and reached that verdict — the archive header records it in her words.
- **Fable overruled me on the Stop hook and was right.** I had proposed moving design-judge off it.
  Keep the hook, delete the prose. I stated the change of position rather than quietly adopting it.
- **A counting bug I caught and reported:** `ls "$d"/*.md` on directories whose names start with `-`
  makes `ls` parse the path as options, silently reporting 0 files everywhere. Real state: 408 files
  across 13 dirs, via `find`.
- **This session's own redirect is the finding.** "Don't write anything on your own" arrived because
  I had started writing. The 90% band exists so that redirect doesn't have to.

## Open for Andrew

1. **Memory is fragmented across 13 cwd-scoped directories** (408 files: portfolio 121, projects 87,
   HighLvl 66, raven-mcp 39, Blacksheep 31, openclaw-video 18, accunliffe 13, gethighlvl-landing 10,
   highlvl-android 9, trading-bot 7, financeKing 4, prompt-graph 3). His stated intent — one pool
   covering all projects — **cannot be reached by editing a CLAUDE.md line**, because the harness
   derives the memory directory from cwd. Two real options: symlink each project's memory dir to the
   shared pool, or migrate only `user`/`feedback` entries to the shared pool and leave
   `project`/`reference` cwd-scoped. My lean is the second — it matches the memory type taxonomy,
   and a symlink farm breaks the first time the harness writes a per-repo index. Not started:
   consolidating 13 directories is not mine to begin unasked under the new scope lock.
2. **The `superpowers:using-superpowers` 1% rule** — "if you think there is even a 1% chance a skill
   might apply you ABSOLUTELY MUST invoke the skill… BEFORE any response or action" — is
   unsatisfiable at ~200 skills, and it is injected at every session start. I made no recommendation
   because it depends on how much of superpowers he actually uses. Still unanswered.

## Sol falsification pass — 9 objections, dispositioned

GPT-5.6-Sol medium, report-only, prompted to prove the change set is NOT done. Verdict: A BROKEN,
B BROKEN, C BROKEN, D BROKEN (3 of 7 promotions false), E BROKEN, F UNVERIFIABLE. Six were real
and are fixed; three are noted below rather than actioned. It was worth running — it found a
false-completion claim I had made in the same change set that exists to prevent them.

**Fixed:**

1. **Stale autonomy copies in cwd-scoped memory.** `-Users-accunliffe/memory/feedback_autonomy.md`
   and `user_andrew.md` still said "full autonomy granted / never ask." Both rewritten to the band,
   plus their `MEMORY.md` index lines. Swept all 13 pools; those were the two that mattered.
2. **`routing-ladder.md:12` still MANDATED routing multi-file / 50+ line implementation to Codex** —
   a direct contradiction of "implementation stays in the main session." Marked SUPERSEDED with the
   reason. `SUCCESSION.md`'s "Codex for heavy autonomous coding" line narrowed to match.
3. **The routing hook still injected "hook-enforced" and "MUST route"** after the deny path was
   removed. Reworded to advisory. *(My first rewrite used `\$0` inside jq's JSON string and broke
   the hook's output — caught on re-verify, fixed to "zero marginal cost". The hook was emitting
   invalid JSON for the length of one edit.)*
4. **"Edit nothing unrequested" vs "diagnosis executes its fix"** were two mutually exclusive
   instructions for a report-only task. Added explicit precedence: fix the problem you were ASKED
   about, always; an explicit "report only", a file allowlist, or the current message's scope
   overrides every proactive-sweep rule.
5. **I narrowed the done-gate and called it a re-binding.** The old rule covered "any substantive
   completion claim — including specs, plans, audits, and research." My replacement triggered on four
   literal words, so "ready", "complete", "all checks pass" walked straight through. Restored the
   class trigger *and* kept the word list, in CLAUDE.md and the digest. This was the single worst
   defect in the change set and it was mine.
6. **Three of the seven promotions were false.** cwd-check, background-exit, and clean-advisor-context
   went only to the canonical memory pool — which does **not** load inside a repo session. They are
   now a compressed bullet in CLAUDE.md, the queue notes are corrected, and CLAUDE.md's memory rule
   now states the loading caveat outright. Also fixed: `fable_5_dna.md` still said "target: Opus,
   load before every task" under an archive header saying the opposite; SUCCESSION's own header still
   paired itself with the DNA file; CLAUDE.md pointed at SUCCESSION's "ten rules" when the newly
   added autonomy band is rule **11**.

**Verified rather than assumed:** replayed 14 real `Agent`/`Workflow` payloads pulled from actual
transcripts across 32 project directories through the changed routing hook — 14/14 `allow`, valid
JSON, no false negatives — per the CLAUDE.md rule that a keyword-gate fix is not closed on synthetic
payloads. The `routing-denials.log` audit trail still records every would-have-blocked call (12
today), so removing the deny path cost enforcement, not visibility.

**Noted, not actioned:**

- **E — "the two enforcement removals make things worse."** Sol is arguing against decisions Andrew
  made explicitly today, with the trade stated. Recording the objection is right; reversing it on a
  model's say-so is not. The routing log preserves the audit; the hook-waiver rule requires saying so
  in one line, which puts every waiver in front of Andrew.
- **F — premature specification lock-in.** The sharpest objection: name every file before the first
  edit, execute immediately, verify only the named failure mode, and don't edit outside scope — a
  model that guesses three files and then discovers a shared schema either omits the required change
  or breaks its own rule. Partially fixed by making the spec explicitly a hypothesis that gets
  amended out loud. Whether that holds is an empirical question for the next few sessions.
- **Measurement (Sol's #9).** The metrics series is discontinuous across today by design, so the
  core bet cannot be cleanly attributed yet. Needs a fixed-rubric sample after the changeover.

## Carried forward

- Sol falsification pass output → disposition every real objection before the word "done."
- Re-measure at the next few `/revisit` runs: accuracy should rise, autonomy should FALL toward
  90–95. If autonomy stays at 97+ the band did not take, and the next lever is the SessionStart
  hook digest, which re-injects "8. Full autonomy" as a numbered kernel rule outside CLAUDE.md.
