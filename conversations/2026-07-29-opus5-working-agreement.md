# 2026-07-29 — Opus 5 working agreement (rule-corpus rework)

Per-instance log. Not a raven-mcp code session — the repo is only the cwd; every artifact is in
`~/.claude/` except the promotion queue and metrics, which live here.

## Where this left off

All 9 approved items applied and grep-confirmed. Three GPT-5.6-Sol medium falsification passes ran
and every real objection is dispositioned below (that gate is itself one of the new rules, applying
to its own rollout). The two questions that were open for Andrew are CLOSED — he returned both as
counter-questions and both were answered by measurement; see **Both open items — answered by
measurement**. Nothing is pending on him from this session.

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

## Both open items — answered by measurement, not opinion

Andrew answered my two open questions with two counter-questions: "1. Memory is fragmented can't
you use graphite or another knowledge graph for this? 2. I honestly don't know how much I use, can
you not measure it?" Both were the right correction — I had asked him to decide things that were
measurable. The pattern to keep: **when a question is answerable by counting, count it.**

### Q2 — superpowers usage (measured, then fixed)

| Quantity | Count |
|---|---|
| Skills on disk | 625 (28 under `superpowers:`) |
| `Skill` invocations across 400 transcripts | 237 |
| Of those, `superpowers:*` | **4 (1.7%)**, only 2 distinct skills |
| `superpowers:systematic-debugging` | 3 of the 4 |
| For scale — `design-judge` | 105 |

Fix: one CLAUDE.md line subordinating the "1% chance → you ABSOLUTELY MUST invoke before any
response" mandate, **not** a plugin disable — the skill's own text says CLAUDE.md takes precedence,
and disabling would also cost `systematic-debugging`, the one of the 28 that earns its keep. The
line explicitly keeps that one as worth reaching for unprompted.

### Q1 — memory fragmentation (the ladder, walked in the open)

Measured first: 397 memory files, **218 cross-cutting** (`user`/`feedback` — i.e. how to work with
Andrew, applies in every repo), only 6 same-slug duplicates. Then the three rungs:

| Option | Cost | Verdict |
|---|---|---|
| Consolidate + auto-load all bodies | **~90,597 tokens/session** | Impossible |
| Load the index only | **~17,223 tokens** | A 218-line wall of skimmable one-liners; expensive and unread |
| Retrieve the few relevant to the actual message | **~200 tokens/turn** | Correct |

**This reversed my own prior recommendation in this same session** — the "Open for Andrew" text I
wrote an hour earlier proposed migrating `user`/`feedback` into one shared pool. At 90k tokens that
plan was never viable; I had recommended it without costing it. Retrieval is the answer and I said
so plainly rather than defending the earlier lean.

On graphify specifically: it has the right primitives (`query`, `--memory-dir`, `--budget N`,
outcome tracking) but is the wrong *first* rung — 397 name/description lines need no artifact kept
fresh, and a graph adds a staleness surface. It is the documented upgrade path if keyword scoring
proves weak, recorded in the hook's own docstring so the next instance finds it.

### What was built — `~/.claude/hooks/memory-recall.py`

`UserPromptSubmit` (the only hook event that actually receives the user's message; `PreToolUse`
never does, `Stop` fires too late). Scores the message against every cross-cutting memory's
headline, injects the top 6 as **pointers, explicitly framed as stale-able and needing a Read**.

Tuning took exactly two cycles, per the new two-cycle rule:
1. Body-only matches were noise → require a headline-term hit, let body overlap break ties.
2. Promiscuous terms dominated (`active-task-is-blocker` was hitting 4 unrelated prompts) → IDF
   weighting with a floor.

Result on 21 real prompts from 9 different project transcripts (real excerpts across unrelated
topics, per the rule against synthetic payloads): fires on 47%, ~213 tokens average, 0 errors.
Cold cache 45ms, warm 22ms against a 5s timeout. Secrets scan of the injected headline lines: no
credential material (31 regex hits were all long kebab-case slugs).

> I originally recorded "~70% precision" here. **That number is withdrawn** — it was an eyeball,
> not a measurement, and it was tuned twice on this same 21-prompt sample with no holdout. See
> **Sol falsification pass #2 → Retracted** below for what is and is not actually measured.

Two bugs found by verifying rather than trusting the write:
- `build_index()`'s early return handed back a list where callers do `index["entries"]` — would
  have silently disabled the hook forever, swallowed by fail-open. Added `INDEX_VERSION` so a
  stale-format cache is rejected instead of crashed on.
- The original `except Exception: pass` failed open but also **failed silent** — a permanently dead
  hook is indistinguishable from "no memory matched". Now logs a stack trace to
  `~/.claude/.memory-recall-errors.log` and still exits 0.

### The rule that paid for itself twice

`ps eww` / `lsof` before trusting a background worker. Sol's second falsification pass looked
finished — 354KB written, timestamp settled — and `lsof` showed pid 35825 still holding the fd. Had
I read it as final I'd have dispositioned a truncated report.

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

## Sol falsification pass #2 (the recall hook) — dispositioned

Verdicts: A BROKEN, B BROKEN, C BROKEN, D BROKEN, E UNVERIFIABLE, F BROKEN. Worth running: it
found a real bug I had verified around, and it forced me to retract a number.

### Fixed in code (7)

| Defect | Reality |
|---|---|
| **cwd penalty was a no-op** | `basename(dirname("/Users/…/projects/raven-mcp"))` = `projects`, a substring of *every* path under `~/.claude/projects/` — so all 223 entries got the same penalty and it cancelled to nothing. Now maps cwd→pool the way the harness does (`cwd.replace("/","-")`). **Sol's best catch; I had "verified" the penalty by reading it, not by testing it.** |
| 5 memories silently invisible | `feedback_*.md` files with no parseable `type:` were dropped. Now falls back to the filename prefix. Corpus 218 → 223 — a delta of **five**, not four: `bind_literal_video_surface_url`, `builder_velocity_design_gap`, `dm_proof_isnt_public_copy`, `gridline_content_gutter`, `swatch_square_geometry`. (Sol pass 3 caught the miscount; I had reported 4 against my own +5 corpus delta in the same sentence.) |
| Valid-JSON/wrong-shape cache | `{"v":2}` passed the version check, then `index["entries"]` raised into the silent catch — recall dead for an hour. Now shape-validated. |
| Non-atomic cache write | A concurrent hook or a kill mid-`json.dump` left a partial cache. Now temp + `os.replace`. |
| Unreadable pool killed everything | `os.listdir` on a project root raised outside the per-file guard. Now guarded at both levels. |
| Unbounded prompt tokenisation | Now capped at 20k chars. |
| Duplicate slugs ate slots | 6 slugs exist in two pools; the same rule could take two of six slots. Now deduped. |

Plus the pre-emptive one: `except Exception: pass` failed open **and silent**. Now logs a stack
trace to `~/.claude/.memory-recall-errors.log` and still exits 0.

Verified after: cold 36ms / warm p50 20ms (5s timeout), 1.2MB prompt 0.03s, malformed / list /
string / null stdin all exit 0 silently, corrupt and wrong-shape caches both rebuild, no tmp
litter, a memory added mid-TTL is recalled without waiting out the hour, replay stable at 47% /
211 tokens / 0 errors.

### Retracted

**"precision ~70%" was an eyeball, not a measurement** — and it was tuned on the same 21 prompts
twice, so that sample was a training set with no holdout. Sol is right and the number is withdrawn.

I then tried to measure the false-negative rate properly and **the harness failed**. Ground truth
was "the user message preceding a memory's mtime is a known-relevant query for it." First run said
95% FN — bogus, because slash-command expansions, the `/clear` summariser prompt and compaction
continuations all sit in the `user` role, and batch-written memories all inherit one shared
message. Tightened to genuine turns with a single memory written within 20 min: n=9, 100% FN —
still bogus, because `feedback_enumerate_gates_upfront` was paired with "Where is this? Settings →
Apps → Advanced". Memories are written at session end; the message that earned them is often 50
turns back. **Honest state: the false-negative rate is unmeasured.** Reported as unmeasured rather
than as either of two numbers I could have quoted.

What the failed harness *did* yield is better than a rate — a characterised ceiling. "this visual
bug only shows on my viewport" recalls `feedback-eyes-first-for-visual-bugs`; "the six dots at the
bottom are misaligned" recalls **nothing**. The gap is lexical, silence is the failure mode, and
that is now written into the CLAUDE.md line along with graphify as the escalation path.

### Declined, with reasons

Sol's remaining asks — gold-label relevance sets, MRR/nDCG, confidence intervals, held-out
time-separated evaluation, p95/p99 under concurrency, corpus-growth runs at 1,000 entries, a real
tokenizer, prompt-injection fixtures, controlled before/after skill trials — are the right
demands for a production IR system. This is a ~200-token nudge on one person's machine that fails
open and whose worst failure is a missing hint. Building an evaluation apparatus larger than the
thing evaluated is the over-engineering the ladder exists to stop. The trigger that would change
that: the lexical gap costing a real miss in practice → graphify.

On privacy (A): the emitted names/descriptions include employer, residence and client-clearance
metadata. Real, but this is Andrew's own memory in Andrew's own session, and it already auto-loads
in the pool that owns it — the delta is cross-project surfacing, gated on relevance. Noted, not
mitigated.

On E: Sol concedes the formal precedence case (the skill's own text defers to CLAUDE.md; and
`<EXTREMELY_IMPORTANT>` is emphasis, not a higher instruction tier). Its survivorship point is
fair — 4 invocations could mean the mandate was ignored, not that the skills lack value. That is a
default-setting judgment, not a proven claim, and the override deliberately preserves
`systematic-debugging`. Andrew's to revisit.

### The rule that earned its keep, twice

`lsof`/`pgrep` before trusting a background worker. Sol's output looked finished — 354KB, timestamp
settled — and the fd was still open; 82KB more arrived after. Reading it early would have meant
dispositioning a truncated report and calling it a full pass.

## Carried forward

- ~~Sol falsification pass output → disposition every real objection~~ — DONE. Three passes ran;
  all real objections dispositioned in this log. Pass 3 (on the revisit artifacts themselves)
  refuted the completion claim with 11 findings, 10 real; see **Sol falsification pass #3**.
- Re-measure at the next few `/revisit` runs: accuracy should rise, autonomy should FALL toward
  90–95. If autonomy stays at 97+ the band did not take, and the next lever is the SessionStart
  hook digest, which re-injects "8. Full autonomy" as a numbered kernel rule outside CLAUDE.md.

## Session tail — the rule corpus got version control

Andrew asked whether the other session writing to `~/.claude/CLAUDE.md` was correct behavior. It
is — revisit step 3 mandates it and step 0 exists precisely because the headless nightly cannot.
Measured rather than opined: 0 duplicate bullets across both sessions' 12 additions, and the file
**net shrank** (78,560 B on 2026-07-01 → 26,754 B on 07-26 → 23,780 B now, 84 bullets, ~6,427
tokens/session) because the rebalance moved detail into `reference/*.md`. That overturned my own
"it's bloating" instinct.

The real exposure the question surfaced: `~/.claude` was **not a git repo at all**. Twelve rule
edits landed in one day — one of them a silent narrowing of the done-gate that only an adverse pass
caught — with no diff to review and no way back, just four ad-hoc `CLAUDE.md.bak-*` copies.

Two commits in a new `~/.claude` repo (local only, no remote — private rules):
- `47a0a36` — allowlist baseline, 117 files / 672K: `CLAUDE.md`, `rules-digest.md`, `SUCCESSION.md`,
  `rules/`, `reference/`, `hooks/`, `commands/`, `skills/*/SKILL.md` (90 definitions, top level only).
- `5018765` — the 14 `projects/*/memory/` pools, 418 `.md` / 1.9M.

**My first proposed commands were wrong and I caught it before running them, after he had already
authorized them.** The draft allowlist included `!skills/` + `!skills/**`. `skills/` is **1.5 GB
across 25,441 files** and contains key-shaped literals in gstack's redaction test fixtures — that
would have been a 1.5 GB commit possibly carrying secrets. Two more traps in the same pass:
`skills/gstack` is its own git repo and staged as a bare gitlink (unstaged with `git reset --`, not
`rm --cached -f`, which the destructive-op guard blocks); and `hooks/__pycache__/*.pyc` needed
excluding. `settings*.json` stays untracked because MCP configs can carry API keys.

Lesson, and it is the sharper version of the spec rule: **an authorization is for the goal, not for
the literal commands.** He approved "version the rule corpus." The commands I had drafted to do it
were unsafe, and running them as approved would have been obedience to the wrong artifact. Measure
the target before executing a plan, even a plan that has already been signed off.

Also written: `/tmp/drafts/2026-07-29-nightly-revisit-loop.md`, the pasteable nightly `/revisit`
loop prompt he asked for. Verified no nightly automation exists yet (no crontab match, no
LaunchAgent beyond `claude-improve-pipeline`, `CronList` empty), so there is no double-log risk. The
prompt hard-forbids pushing — a push to raven-mcp `main` redeploys the live MCP endpoint — and tells
the instance to commit `~/.claude` after each promotion, which the baseline above now makes possible.

### Sol pass #3, final two items closed
- **F2 (add the missing "Ideas flagged" section)** — done. The skill's step-7 format requires it and
  the report skipped it. Five cards, rendered and eyes-on at full size; div balance 86/86, every
  badge class defined.
- **F4 (cross-link the promoted rules)** — half done, half declined on measurement. Added the
  "Promoted to a global rule (2026-07-29)" note to `feedback_verify_effect_not_code.md` and
  `feedback_validate_ground_truth_before_reporting_a_rate.md`; the other three already had it. The
  `(Memory: [[slug]])` back-link into `CLAUDE.md` I declined: **0 of 84 bullets in that file use
  wikilinks.** The format is prescribed by the revisit skill template but was never adopted in the
  actual file, so adding it to five bullets would introduce an inconsistent minority convention on
  the always-loaded surface. The direction that matters — memory → "this is global" — already
  exists. Same template-vs-file conflict as the Inter/Untitled Sans one, resolved the same way:
  keep the file's real convention, name the divergence.

## Sol falsification pass #4 — 9 findings, 7 confirmed, claim refuted again

Fired because the `~/.claude` baseline, the loop prompt, and the F2/F4 closures were new substantive
work with a completion claim attached. Verdict: *"the corpus is incomplete, contains non-public
personal metadata, and the revisit violates its own step-3 contract."* All seven confirmed findings
are fixed; the two speculative ones were Sol's sandbox having no DNS, and I had verified both live.

**F1 — 42 tracked symlinks, and a credential scan that was reading outside the repo.** Of the "90
skill definitions" I claimed, 42 were absolute-path symlinks into the *ignored* gstack tree — a clone
without that 1.1 GB payload gets broken links. Worse, this invalidated my own all-clear: the single
`AKIAIOSFODNN7EXAMPLE` hit I had explained away as an AWS docs placeholder was not in a tracked blob
at all. `grep` had followed a symlink out of the tracked set. **`git grep HEAD` finds nothing.** The
real count is 47 definitions. Lesson: a scan over `git ls-files` output is not a scan over the repo
unless you also assert file *type* — symlinks silently widen the search past the thing you're auditing.

**F2 — the control plane was left unversioned.** `settings.json` invokes `scripts/`,
`statusline-command.sh`, `statusline-agents.py` and `skill-rules.json` at seven separate lines, and
`SUCCESSION.md:24` names both DNA manuals as successor instructions. All were ignored. So the
enforcement layer could change with no diff while I claimed the rule corpus had safe version control.
I had versioned the *rules* and missed the *machinery that runs them*.

**F3 — the worst one. I aggregated personal data into permanent history.** Tracking the memory pools
swept in `user_credit_cards.md`, `user_military.md`, `user_profile.md` (employer role and internal
strategic goals) and `reference_credentials.md` (credential *locations* plus Slack identity). No live
key, so my regex said clean — but a credential regex cannot detect privacy exposure, and git history
is permanent even if the file is later deleted. Rebuilt the repo from scratch so those blobs never
entered reachable history (`git update-ref -d` + `reflog expire` + `gc --prune=now`, verified 0
reachable hits), and excluded them by pattern. They are not rules, so excluding them is
scope-correct.

**F5 — my F4 decline was rationalization.** I had refused the mandated `(Memory: [[slug]])`
back-links because 0 of 84 `CLAUDE.md` bullets used wikilinks. Sol: that demonstrates corpus-wide
non-adoption, not exemption — and the relevant denominator is *promoted cross-cutting rules*, not all
84, so of course the convention starts as a minority. My cost objection also failed its own test:
the five links are **278 bytes, ~70 tokens.** I had invoked "the always-loaded surface" without
measuring what it cost, in a session whose primary finding is that measurable things must be
measured. Added, plus the per-rule `✓ landed in <file>` report step 3 requires.

Fixing that surfaced a gap the adverse pass missed: the skill-scan override rule at `CLAUDE.md:51`
had **no memory file at all**, so its measurement (625 skills on disk, 4 of 237 invocations were
`superpowers:*`) lived only on the always-loaded surface. Written, indexed, linked both ways.

**F6 — the nightly prompt would have misfired on its first run.** Seven concrete defects, all
verified: coverage keyed by date when **five sessions share 2026-07-02** and four share 07-01 (and
`metrics.md` already uses `date (slug)` columns, so I had ignored the existing convention); the glob
swept in two `-PROPOSAL` documents; "that session's JSONL" pointed at 136 UUID-named files with no
mapping (a slug `grep -l` resolves it 1:1 — now in the prompt); and it told the instance to park
ambiguous items in `## Open`, which step 0 then force-clears — a contradiction that would have
forced exactly the guesses the instruction existed to prevent. Added a `## Needs Andrew` section to
`PROMOTION-QUEUE.md` that step 0 is explicitly exempt from, plus clean-tree/fetch/explicit-path
guards for both repos.

The honest one: **"schedule yourself nightly" is not something an instance can do.** Max wakeup is
one hour. Wrote the launchd runner + plist instead, and resolved the binary path rather than guessing
it — `command -v claude` answers `claude` because it is a shell *function*; launchd has no profile,
so a bare `claude` would have failed silently into a log file.

**F4/F7 — report and ideas log.** Two "Ideas flagged" statuses were outside the skill's
`new/unblocked/actionable/shipped` vocabulary, and one card was not an idea at all. Moved the
promotion report into its own section, reused the `.card ul` CSS verbatim from `2026-06-20.html`
rather than inventing it, and corrected the stale `218/397` figures to `229/405` in both the report
and the ideas log. Render evidence is now durable in `render-evidence/` — "rendered and viewed"
being a bare self-report was itself a valid finding.

### The pattern across all four passes
Every pass found defects in the *verification*, not the substance: a gate narrowed while being
called a re-binding, a threshold that cancelled to zero, a miscount stated in the same sentence as
the correct delta, a scan reading outside its own audit boundary, and a cost objection asserted
without measuring the cost. Four passes and each one still found something real — the fourth found
the most serious issue of the whole session. The lesson is not "run more passes"; it is that my own
review of my own verification is the least reliable step, and the cheapest fix is an adversary who
does not share my framing.

---

## Window 4 — draining the sign-off backlog, and the two things that turned out wrong about it

### Where this left off
Andrew ticked all 25 Section B items in `improve/review/2026-07-29-consolidated.md`. Applied 21,
dropped 1 on his explicit say-so, confirmed 2 already live, and one — B24 — I escalated to him as
blocked. Committed as `~/.claude` `cc38ea6` (23 files, +195/−64, local only; the pre-push hook blocks
`~/.claude` from ever reaching a remote, override `ALLOW_CLAUDE_PUSH=1`).

### Sol refuted the commit: 8 real defects out of 14 claimed
The falsification pass earned its keep. Working invocation, after two failures:
`codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium -C ~/.claude < /dev/null`
— `gpt-5.6-sol-medium` as a model name is rejected on a ChatGPT account, and it **exits 0 while
producing nothing**, which is only visible by reading the output file. An nohup'd run from `~/.claude`
also exited 0 with 72 lines and no report; foreground with explicit `-C` worked.

What it found:
1. **Six rules had "landed" in `reference/*.md` that nothing routes to.** Only `~/.claude/CLAUDE.md`,
   the rules-digest, and the **CWD-scoped** memory pool auto-load. `reference/` and `skills/` are
   read on demand, and the canonical cross-project pool does not load inside a repo session. Filing a
   rule there without a loaded pointer is a write-only promotion. Fixed by extending the three
   CLAUDE.md pointer lines to name the new categories — diffing the trigger set, not the prose.
2. **Two Section A citations were wrong.** My `check()` helper grepped for a rule's vocabulary and
   reported the FILE that matched. Silent-tool-fallback is at `reference/diagnostic-rules.md:16`; my
   citation pointed at a line about *device* fallback. `codex-rescue`-is-a-forwarder lived only in
   `reference/highlvl-craft-rules.md`, read during HighLvl work and nowhere else.
3. **Two more of the same in B22** — gen-video's real home is
   `memory/reference_higgsfield_is_a_cli.md:19`, and the "kickoff-gate" grep hit an unrelated "carry
   both bindings" clause. Three false LIVE verdicts in one session, all one mechanism.
4. **B10/B11 were filed only in the canonical pool**, which does not load in the repo they govern.
   B11 refiled into the portfolio's CWD-scoped pool.

Sol's defect 13 is wrong — it flagged B18 as approved-then-dropped, having no way to see Andrew's
*"I'm ok with your take on B18, disregard me response."* The annotation now quotes him verbatim so
the next reader or pass does not re-raise it.

**Rule promoted from this:** confirming a rule "already exists" means reading the MATCHED LINE, not
the matching filename. A pattern loose enough to match a paraphrase is loose enough to match an
unrelated rule. Use `grep -n`, read the hit, and for anything in `reference/` or `skills/` also
confirm a loaded pointer routes a reader there at the moment it matters.

### B24 was never blocked — I asked Andrew for a fact I could have measured
I told him, upfront and in the gate preflight, that there was no IEP deck to audit. The deck is
inside the portfolio repo: `src/lib/deck/iep-layout.json` (19 slides), with `dh-layout.json` (28)
next to it. I had searched `~/projects` for a *project* named for the deck and stopped there. This
is exactly the "if a question is answerable by counting, count it" rule, and it was the only item on
the gate list that turned out not to need him at all — B21 resolved itself too (the Perplexity key
works; the memory claiming otherwise was stale and is deleted).

Built as portfolio `862d26d` (local, **unpushed** — that repo requires his fresh explicit approval
per the rule this same session refiled):
- `scripts/audit-deck-geometry.mjs` — 9 checks over the layout JSON, exit 1 on FAIL.
- `scripts/audit-deck-geometry.fixtures.mjs` — 7 injected defects, each asserting the check that must
  report it, exit 1 if any goes unreported.
- `.claude/skills/deck-slide-geometry-audit/SKILL.md` — two-half gate; the script covers every slide,
  the rendered pass covers what the JSON cannot see (glyphs, wrapping, real overflow).

### Two calibration findings, and one that was almost shipped broken
**Optical margins are not box coordinates.** A global "every text block starts on the x=400 rail"
assertion flagged every finished slide. A 300px display numeral sits at x=342 so its *optical* left
lands on the rail, and its caption at x=356 aligns to the numeral's stem. The audit clusters columns
and checks intra-column consistency instead. Residual ceiling documented: an offset under
`max(24, 0.25 × largest type)` — 75px on a 300px numeral — reads as deliberate side bearing.

**The one I nearly shipped: per-deck constants.** `TEMPLATE_PANEL` and a one-entry `IEP-06` allowlist
were hardcoded from the IEP deck. Running the audit against `dh` produced 10 false `panel-band` WARNs
(dh's own dominant band is `y=400 h=1656`, not `h=2080`) and a false `panel-count` FAIL on DH-20 —
whose 2-up is the identical nested-comparison pattern IEP-06 was allowlisted for. Worse, the same
constant made `panel-band` **tautological on iep**: it matched all 14 single-card slides exactly and
skipped IEP-06, so the check had never once fired on real data. A green run and a dead check produce
identical output. Both are now derived from the deck being audited — the band from its own majority
(silent with no majority), and "top-level card" from strict containment, so nested comparison cards
are structural rather than named. This is `feedback-verify-effect-not-code` recurring a third time in
one day; per the promoted-rule-needs-a-mechanical-trigger rule, the fix is the fixtures harness, not
another paragraph. `isContainer` also went through a wrong intermediate form — left-rail anchoring
does not describe the IEP standard card (x=1960, text to its left), and right-rail anchoring makes
`panel-rail` tautological. Containment was the only formulation that works for both decks.

One fixture miss worth remembering: `overflow` at `+400px` read as an uncaught defect when the check
was fine — the block ends at x=1760 and never reached the 4720 rail. **An under-sized fixture is a
broken fixture, not a broken check.** Size the mutation against the invariant.

### State at the end of this window
- `~/.claude`: `cc38ea6` + one follow-up commit (pointer lines, the matched-line rule, general-video
  §6 gate, portfolio-pool memory, 4 corrected annotations, 2 changelog entries). Local only, always.
- `~/projects/andrewcunliffe-portfolio`: `862d26d` on `main`, local, **needs his approval to push**.
  Two older unpushed commits (`b466957`, `9796dda`) sit under it from a prior window.
- Baseline the audit now holds: `iep` 0 FAIL / 1 deliberate WARN, `dh` 0 FAIL / 0 WARN, 7/7 checks
  proven to fire.
- Nothing on the original human-gate list still requires Andrew. The only open decision is whether
  to push the portfolio commit.

### Two more adverse rounds on the audit tool, and what each one cost
Ran Sol against the committed deck audit twice. Both refuted it. Neither round found a defect in the
*substance* — the checks measure what they claim — and both found defects in the **calibration and
the completeness claim**, which is the same pattern as the first three passes.

**Round 1 (against `862d26d`) — 5 real defects.**
- Counting top-level cards falsely FAILed `apple` S4 and `openai` S4-OAI: three side-by-side agenda
  cards with no outer container to nest inside. A FAIL exits 1, so the tool would have gated a claim
  on a false positive. Two background cards **overlapping** is what the defect actually is.
- A 1px-inset duplicate read as a nested child. Nesting now requires being materially smaller.
- A block drifting 400px left became its slide's leftmost column and inherited `orphan-column`'s
  exemption. **My first fix here was worse than the bug** — a `left-rail` FAIL failed 8 iep / 10 dh /
  5 apple slides, because x=342 recurs across three decks on both 300px and 30px type, so it is a
  deck-wide optical origin, not an inset that scales with type size. Reverted; replaced with
  `rogue-origin`.
- A figure `src` outside `/api/asset/` was skipped silently, which reads as a pass.
- The harness's baseline filter matched `id+check`, so it also swallowed any *new* `panel-band`
  finding on IEP-06 — the one slide it must not be blind on. And `JSON.parse` in the `execFile`
  callback threw outside the promise chain, leaking the transient fixture file.

**Round 2 (against `b0f7a6f`) — 5 more, one of them the worst of the session.**
The harness printed **"All 10 checks fire"** while its 10 fixtures covered only **8 of 13** production
checks. Sol disabled `panel-band`, `column-drift`, `top-margin`, the rules-loop `right-rail`,
`figure-in-panel` and `near-flush` in a copy, and the harness stayed green. A fire-proof that reports
false completeness is the exact failure it exists to catch, one level up — counting fixtures is not
counting checks. It now greps the check names out of the audit source and exits 1 if any lacks a
fixture: **13 checks, 16 fixtures, all firing.**

Also: an 89%-area contained duplicate passed as nesting (threshold 0.9 → 0.5, against a measured
21.9%/23.0% for real nested cards); `rogue-origin` warned on openai's legitimate one-off agenda origin
at x=809 (now bounded to blocks left of the rail); `figure-in-panel` was keyed to the single-container
case and so did **nothing** on every multi-card slide; and `panel-band`'s detail embedded a deck-wide
card count, so it changed whenever a fixture added a panel anywhere and turned baseline noise into an
apparent catch. Sol also caught the skill claiming apple/openai's WARNs were all agenda warnings —
false, apple has three `column-drift` on S11/S13/S15 — now a per-deck per-check table with apple's
trio marked **unreviewed** rather than implied deliberate.

**The through-line across five adverse passes this session.** Every one found a defect in the
verification rather than the work: a gate narrowed while being called a re-binding, a threshold that
cancelled to zero, a citation pointing at the wrong rule, a calibration constant that made its own
check tautological, and a fire-proof green on 5 uncovered checks. My own review of my own verification
is the least reliable step in the loop, and the two cheap structural answers are (1) an adversary that
does not share my framing and (2) a mechanical coverage gate rather than a count I assert.

Final state: `ca3c07c` on portfolio `main`, local, **unpushed**. 0 FAIL on all five decks, 13/13
checks covered and firing, no leaked fixture, clean tree.

### Round three, and the finding that justified running it
I ran a third pass because rounds one and two had each found real defects and round two's fixes were
verified only by my own command output. It REFUTED again — 8 defects, and the top one is the sharpest
of the day. Two process notes first, because both cost me time:

**The pass nearly went unread.** I used `kill -0 <pid>` to poll for the worker, the PID got RECYCLED
onto an unrelated 2-minute-old process, and my liveness check reported "still running" for four
straight windows while the output file sat static. I concluded Sol had died mid-report and started
fixing on partial findings. It had actually completed and written a full verdict. Both the earlier
`pgrep` pattern miss and this are the same rule — *confirm the worker EXITED* — failing on two
different mechanisms. The reliable signal was the harness's own task notification, which I already had.

**Sol's four structural HIGHs were all LATENT.** Zero slides use `template`, zero lack `blocks`, zero
have a null-sized figure, zero use `clip`. Checking that before fixing mattered: it changed each one
from "the audit is currently lying about five decks" to "the audit goes blind the moment someone uses
a supported feature." Still worth fixing — two of them blind `panel-count`, the original defect this
tool exists for — but the severity claim in the report was not the severity on disk. Verify the
adversary's premise, not just its logic.

**What was real and is now fixed (`a9f3dce`).**
- `template` slides. `slides.ts:300` renders `[...templatePanels(s.template), ...(s.panels ?? [])]`;
  the audit reads raw JSON. Add `template:"card"` to a slide with an explicit card and the runtime
  draws two overlapping cards while the audit says clean. It now FAILs rather than measuring panels
  the deck does not render — refusing to measure beats measuring the wrong thing.
- `clip`. It is an INDEX into the slide's panels, and a clipped figure is *designed* to bleed past
  that panel and be masked. The audit applied raw canvas bounds, so a legitimate `{x:-100,clip:0}`
  device bleed would FAIL and exit 1. A false FAIL is the worst direction for an audit: it gates a
  true claim, and a table that does that gets ignored, which is how the original defects shipped.
- Missing `blocks`. `ExactSlide.tsx:298` calls `layout.blocks.map` unguarded while every sibling
  access uses `?? []` — so a slide that CRASHES the deck passed the audit clean. `arr(v) => v ?? []`
  is what makes the geometry checks tolerant of optional fields, and the same tolerance is what
  swallowed this.
- `video`/`poster` assets. The only ACTIVE defect: 8 real figures carry those instead of `src`, so
  neither asset check ever looked at them. A video pointing at a provably absent file returned
  `findings: []` and exit 0. Now 2 FAIL. All 8 resolve on disk today, so the baseline did not move.

**And the two the harness itself was missing.** Round two's lesson was "counting fixtures is not
counting checks." Round three's is one level finer: **coverage of a NAME is not coverage of a BRANCH.**
Sol gated `panel-rail` on `containers.length === 1` — killing it on every multi-card slide — and the
harness exited 0, because that check's only fixture mutates a single-container slide. Exactly the
`figure-in-panel` bug from round two, in a different check, surviving the gate built to stop it.
No iep slide has two top-level cards, so the fixture had to synthesize one. I mutation-tested the fix
rather than reading it: with the guard reintroduced the harness now exits 1. Separately, the gate's
name regex was evadable — a reachable ``warn(id, `synthetic-check`, …)`` was invisible to it, so the
gate now counts every emit site and errors on any name it cannot read.

**Dispositioned without a code change.** Sol called apple's three `column-drift` WARNs false
positives: S11/S13/S15 indent list items to x=481 under x=400 headings, the same 81px each time,
which reads like a list indent. It is probably right, and `column-drift` cannot tell indentation from
drift. But it is a WARN, not a FAIL, and the honest state is unreviewed-pending-the-rendered-pass —
so it stays visible and is now written down as a ceiling rather than silenced. Its S4/S4-OAI
"structural false positive" point was already documented in the skill's baseline table.

Final: **15 checks, 21 fixtures**, all firing, plus a negative case proving `clip` stays silent.
0 FAIL on all five decks with identical WARN counts — three rounds of hardening cost zero new false
positives on real data. `a9f3dce` local, still unpushed.

**Six adverse passes today, six refutations, and every single one found the defect in the
verification rather than in the work.** A gate narrowed while I called it a re-binding; a threshold
that cancelled to zero; a citation pointing at the wrong rule; a constant that made its own check
tautological; a fire-proof green on 5 uncovered checks; and now a coverage gate blind to branches
and to its own unreadable names. The pattern is not that I write bad checks — it is that I cannot
audit my own audit, because the same inference that wrote the gap reads the code and agrees with it.
The two things that actually worked were an adversary with no access to my framing, and mutation
testing — inverting the guard and watching the harness fail. Both are cheap. Neither is optional.

---

## Window 5 — the three-task close-out, and a doc that failed its own rule

### The other instance had already pushed my work
"Go for it" (portfolio push approval) turned out to be moot. PID 6162 is a live `claude`
process with cwd in the portfolio repo; it had committed `8cd8499` and `2f4b121` and
pushed. All six of my portfolio commits (`862d26d`, `b0f7a6f`, `ca3c07c`, `a9f3dce`,
`b466957`, `9796dda`) were verified individually on origin with `git merge-base
--is-ancestor` — they went up as passengers on its push.

Two things worth carrying:
- **A shared worktree means another session can publish your work without asking you.**
  The approval I was holding had already been spent by someone else's push. Check origin
  *before* asking for a push approval in a repo with a live sibling instance.
- **Its commit `2f4b121` swept in a file I deliberately left untracked** — the 7952-line
  Sol pass-3 transcript at `conversations/adverse-passes/`. A bare `git add` in a shared
  tree takes your untracked artifacts too, not just their own. The repo is private, which
  contains it; I did not rewrite their commit because that instance is live and owns it.

### raven-mcp logs pushed
`3ace2e6..b4aecc3`, six commits, `conversations/` + `.claude/raven-opportunities.md` only.
Gate run first: 1153 tests / 1150 pass / 0 fail / 3 skipped — matches ground truth exactly.
No `src/` or `api/` in the diff, so the endpoint should not move; verified after the push
anyway, because "repo-consistent" is not "deployed-consistent": live `tools/list` returned
45 tools hashing to `f64bb18…2bb0a6`. Unchanged.

### The export doc refuted itself
Wrote `~/Documents/claude-rules/opus5-working-rules-2026-07-30.md` — the rule corpus,
sanitized for a second machine. Then ran the cold Sol pass the document itself mandates.
**CLAIM REFUTED, 20 findings, 15 real.** The one that justified the pass:

> "Park uncommitted work on a named branch BEFORE any clean checkout"

is **wrong as written**. Naming or creating a branch preserves nothing — dirty changes
follow you across the checkout and are still overwritable. The rule as it lives in
`CLAUDE.md` has the same defect. It needs `git commit` onto the WIP branch, `git stash
push -u`, or a patch backup, plus a re-confirm. **This has been sitting in the loaded rule
corpus teaching a habit that loses work, and it was written *from* an incident where work
was lost.** → carried forward as a `CLAUDE.md` fix.

Other real ones: `false FAIL is the worst direction` stated absolutely (true for advisory
gates, inverted for irreversible ones — release/migration/payment gates must fail closed);
the completion gate demanding a deployment URL for artifacts that have no deployment;
"edit nothing unrequested" vs "diagnosis ships with its fix" reading as a flat
contradiction without the precedence clause; "shell scripts ignore unknown args" stated as
categorical when many reject them; and the export naming `done-gate` plus two runtime hooks
that a second machine does not get, making three rules inert on arrival.

Declined: the "leaked specifics" findings — the corpus measurements are Andrew's own
non-sensitive machine stats going to his own second machine, and they are the *evidence*
that makes the count-it-don't-ask-it rule persuasive rather than assertive.

**The pattern holds at eight passes: every one found the defect in the verification, not
the substance.** This one found it in a document whose central claim is that you must run
this pass.

### Carried forward
1. Fix the park-WIP rule in `~/.claude/CLAUDE.md` and its memory file — it is wrong, not
   just imprecise.
2. Qualify the false-FAIL direction rule in the same pass (advisory vs irreversible).
3. `2f4b121` is unpushed and belongs to the live portfolio instance — left for it.
