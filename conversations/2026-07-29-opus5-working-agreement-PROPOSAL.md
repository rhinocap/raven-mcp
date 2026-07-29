# Opus 5 working agreement — proposed diff

**Status: PROPOSAL. Nothing applied.** Drafted 2026-07-29 after the Fable 5 consult.
Decisions locked by Andrew this session: autonomy band · ponytail off · delegation home ·
done-trigger · DNA retirement · verification relocation · Stop-hook accounting · queue clearing.

Files touched: 10. Two items at the bottom are **flagged undecided** — they were not among the
four decisions and need your call before they go in.

---

## Why these edits and not others

The measured problem (`conversations/metrics.md:7-10`, ~25 sessions): autonomy runs 97–99% against
a 90% target while first-attempt accuracy runs 74–85% against 90% and round-trips run 1.6–2.0
against 1. Every one of the four dominant failure classes in `PROMOTION-QUEUE.md` happens **before
the first attempt** — trusting a delegate's input, missing a capability axis in the spec, gating
after the claim, iterating without computing the target. The corpus currently carries 18 bullets of
post-claim verification against roughly one clause of pre-attempt specification, and the ponytail
output cap suppresses even that. So: move weight from *after* the shot to *before* it.

---

## 1. `~/.claude/CLAUDE.md`

### 1a. Line 6 — autonomy becomes a band

```diff
-- Operate with full project autonomy: decide, execute, and report; ask the one load-bearing
-  question only when its answer prevents a materially wrong outcome.
+- Operate with full project autonomy: decide, execute, and report. Autonomy targets a ~90% BAND,
+  not a maximum — roughly one question per ten tasks is budgeted and expected. Ask when the answer
+  would change what gets built; a suppressed question is paid back as rework, and 99% autonomy is
+  a symptom, not a score.
```

**Why:** Fable's sharpest finding. A 90% target prices in one question per ten tasks; running at 99%
means the questions that would have prevented rework got suppressed. The coachmark session is the
proof — the four-field interview got run *anyway*, after a full wasted build, when you answered
"all four axes broken" (`metrics.md:18`).

### 1b. Line 13 — the pre-edit spec, with axis enumeration

This is Fable's single "add first." It replaces the vaguer scan-and-plan line.

```diff
-- Begin each task with a visible Skill/MCP scan, compact spec, and verification plan, then
-  execute immediately.
+- Before the first Edit or Write on any non-trivial task, post a ≤10-line spec naming every file,
+  surface, capability axis (state · network · filesystem · browser/render · on-device model ·
+  compute), and human gate the change touches — then execute immediately. The miss this prevents
+  is the post-hoc "also had to touch X" that wasn't in the spec.
+- Name the failure mode in one line before acting, and verify THAT named mode — never a proxy.
+  "It compiled" does not verify "the user can see it."
```

**Why:** clears `scope-doc-enumerate-capability-axes` (5x in the queue — four separate Codex
adversarial rounds each found a different missed axis on Phase 1 alone). Second bullet folds in
DNA §3, which Fable rated still load-bearing for Opus 5.

### 1c. Line 14 — delegation comes home

```diff
-- Under `/goal`, solo-authoring one cohesive design artifact is acceptable, but fan the
-  audit/verify/critique legs out to parallel agents from the start of that phase — not after a nudge.
+- Implementation stays in the main session. Delegate only genuinely parallel or bulk-mechanical
+  legs — and read delegated code from the worktree diff or the filesystem, never from the agent's
+  own self-report.
```

**Why:** clears the 8x repeat offender. The queue's own verdict: *"the root defect has recurred in
8 straight sessions and needs a structural fix."* Also resolves the head-on collision with the
session prompt's "Do not call the AgentTool unless the user requested it."

### 1d. Lines 37–41 — `<routing>` demoted from mandate to doctrine

```diff
 <routing>
-- Treat subscriptions as finite pools: use the cheapest adequate executor and preserve premium
-  capacity for work that needs it.
-- Route local-free mechanical work first, then Codex subscription, then GPT-5.6-Sol medium.
-- Use paid Anthropic tiers only when cheaper adequate OpenAI execution is unavailable; keep final
-  eyes-on, MCP-bound work, and load-bearing taste synthesis in the main session.
-- State the routing tier (agent type or model plus justification) on the first draft of every
-  Agent, Workflow, or Task delegation call — never wait for the routing hard-block hook to force it.
-- Routing commands, open-weight benchmark rules, hard-block gotchas, and recovery details live in
-  `~/.claude/reference/routing-ladder.md`.
+- For legs that ARE delegated, prefer the cheapest adequate executor and state the tier in the
+  call. This is doctrine, not a gate — it never outranks getting the answer right.
+- Commands, benchmarks, and recovery details live in `~/.claude/reference/routing-ladder.md`.
 </routing>
```

**Why:** Fable's "cut first." Cost-routing pressure is implicated in the largest failure class,
inflates round-trips with disposition rounds, and blocked a consult you requested by name. Cost
awareness survives; the mandate doesn't.

### 1e. Line 55 — the done-trigger, bound to the word

```diff
-- Before any substantive completion claim — including specs, plans, audits, and research — run
-  done-gate, then serial adverse review: GPT-5.6-Sol medium report-only falsification, then Fable
-  review of artifact + findings; resolve every real objection. Only trivial conversational or
-  single mechanical work is exempt; doubt means run it.
+- Never say done, fixed, shipped, or matches without first running done-gate AND one GPT-5.6-Sol
+  medium report-only falsification pass (`codex exec`, $0 marginal), then dispositioning every real
+  objection. The trigger is the WORD, not the surface class — if you are about to claim completion,
+  the gate runs. Only trivial conversational work is exempt; doubt means run it.
```

**Why:** your call, and a better trigger than Fable's proposed release/prod/public narrowing — it
can't be gamed by arguing a surface doesn't qualify. The Fable leg drops: metered, forbidden by the
session prompt, blocked by the hook, and Fable found no distinct catches from it in the metrics.
Sol's catches are on the record (2 real issues 2026-07-02, 2 real Medium bugs in P4.5).

### 1f. New bullets into `<verification>`

```diff
+- Mark KNOWN (verified this session against a primary source, cited) vs GUESSED (inferred,
+  remembered, extrapolated) — never launder a guess into the sentence rhythm of a fact. A delegated
+  agent's self-report, a browser tool's success message, and a background job's file list are all
+  GUESSED until read from the artifact itself.
+- When a target is computable — a character cap, a count, a coordinate — compute the delta and the
+  edit plan FIRST. Two measure-edit cycles maximum on a bounded task; a third means you are
+  iterating instead of solving.
```

**Why:** first folds in DNA §5 (Fable: still load-bearing) and closes three queue items at once —
`agent-output-placeholder` (8x), `browser-automation-success-lies-about-state`,
`background-write-race-looks-like-missing-file`. Second closes `goal-char-cap-iterative-trim` (the
11-round trim loop, 5× over budget) and is one of the two round-trip levers.

### 1g. New bullet into `<understanding-and-autonomy>` — scope lock

```diff
+- Edit nothing unrequested. An adjacent problem you notice gets ONE report line, not a fix.
```

**Why:** the role-toggle incident — a proactive "fix" you hadn't asked for, which broke the page
("the page is all messed up now") and had to be reverted (`metrics.md:18`).

### 1h. Lines 137–138 — `<succession>` retargeted

```diff
-- Non-Fable models read `~/.claude/SUCCESSION.md` and their reasoning manual before the first
-  substantive task, run the manual self-test, and prefer repository successor-critical ground truth
-  over inference.
-- Sonnet 5 and Opus 4.8 use Fable 5 for non-trivial planning, ambiguity, design, architecture,
-  two-failure escalation, and risky irreversible work; if unavailable, use the succession documents
-  as plan-of-record.
+- Repository successor-critical ground truth and `~/.claude/SUCCESSION.md`'s ten rules outrank your
+  own inference, always.
+- `~/.claude/fable_5_dna.md` is ARCHIVED — its still-live ideas are folded into this file. Read it
+  only if you are Sonnet-class or weaker. No self-test mandate for Opus-5-class models.
+- Fable 5 consults are for PRE-CODE architecture forks and stuck-after-two-failures escalation —
+  never a post-hoc review leg.
```

**Why:** Fable's own audit of its own file: ~70% redundant for Opus 5, §9 actively harmful, header
still reads "Target executor: Opus 4.8." The pre-code consult is where the measured value is — it
caught 4 real hidden dependencies before any code was written in P4.5 (`metrics.md:27`).

### 1i. Verification section — 11 bullets relocate

Stay loaded (6): 54 (completion language + prod URL) · 55 (rewritten above) · 58 (report at 80%) ·
59 (user-visible: real-surface capture + eyes-on + customer walkthrough) · 60+63 merged (eyes
overrule metrics; reproduce on Andrew's surface before theorizing) · 69 (truth ledger same change).

Move to a new `~/.claude/reference/verification-incidents.md`, loaded on demand (11): 56
quantifiable checklist · 57 interpretive/taste options · 61 mobile/device QA handshake · 62
non-visual output · 64 compiled build / hard-reload · 65 `visibilityState`/`hasFocus` · 66 Vercel
prod alias · 67 observable side effects · 68 Figma pixel diff · 70 re-verify prior capabilities ·
71 keyword-gate validation.

**Why:** Fable's framing was *"relocate, don't just compress"* — these are correct rules that don't
need to be resident every session. Nothing is lost; the attention tax is.

> **Two judgment calls I'd flag rather than bury.** #67 ("never infer a side effect from an adjacent
> successful step") is cheap and general — I'd keep it loaded. #71 (validate keyword gates against
> real transcripts) is *directly* about the hook edits below — I'd keep it loaded at least through
> this change. Say the word and both stay.

---

## 2. `~/.claude/settings.json` — ponytail off

```diff
-    "ponytail@ponytail": true
+    "ponytail@ponytail": false
```

Line 171. `~/.claude/.ponytail-active` (currently `full`) becomes inert; leave or delete.

**Why:** it contradicts your reporting contract (three-line output cap vs. gates-upfront +
next-steps closers + per-element checklists) *and its own scope clause* — Boundaries says "governs
what you build, not how you talk," Output governs exactly how I talk. Its build philosophy is
already covered by Opus 5's base prompt plus your reuse rules at CLAUDE.md:78. Two personas
arbitrating every response is the friction you opened this session describing.

---

## 3. `~/.claude/scripts/openai-routing-reminder.sh` — deny path removed

One-line change. Keeps the audit log, drops the wall:

```diff
 deny() {
   echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $TOOL $1" >> "$LOG"
-  jq -n --arg r "$1" '{hookSpecificOutput:{... permissionDecision:"deny" ...}}'
-  exit 0
+  allow_with_reminder   # 2026-07-29: log-only. A PreToolUse hook cannot see the user's message,
+                        # so it blocked a Fable consult Andrew requested BY NAME. Not tunable.
 }
```

**Why:** structural, not a tuning problem — `openai-routing-reminder.sh:27` greps the *Agent call's*
prompt for the justification token, never your message. `routing-denials.log` keeps recording what
*would* have been blocked, so you lose no visibility.

---

## 4. `~/.claude/fable_5_dna.md` — archive header, file preserved

```diff
+> **ARCHIVED 2026-07-29.** Not a load surface for Opus-5-class models — §2's spirit, §3, and §5 are
+> folded into `~/.claude/CLAUDE.md`; §9 ("route before you reason") is DELETED as harmful: it made
+> delegation an obligation, and delegation is the mechanism behind the 8x placeholder failure class.
+> Still valid for Sonnet-class or weaker successors — read it in full if that's you.
```

**My one refinement against Fable here:** keep the file on disk. A model auditing its own artifact
has an incentive to over-correct, its own header says it works for Sonnet 5, and SUCCESSION's whole
premise is that a weaker model may inherit this system. Retire it from the load path; don't delete
the archive.

---

## 5. `~/.claude/SUCCESSION.md` — three edits

- **Lines 9–12**, the inheritor framing (*"The quality bar does NOT live in your judgment — it lives
  in artifacts"*): scope it to frozen surfaces, ledgers, and ground-truth blocks, where it's correct.
  Generalized, it's an instruction to defer — in sessions where you're asking for judgment.
- **Lines 19–22**: drop the DNA load mandate and self-test for Opus-5-class; keep the pointer for
  Sonnet-class successors.
- **Rule 7 (line 49)**: align to single-Sol-on-the-word-"done", matching CLAUDE.md 1e.

---

## 6. `~/.claude/reference/verification-incidents.md` — NEW

The 11 relocated bullets, verbatim, each keeping its originating incident. Referenced from the
surviving `<verification>` block by one pointer line.

---

## 7. `conversations/metrics.md` — new column + changeover annotation

Per your alignment:

- New row: **`Hook catches (design-judge Stop, not counted as misses)`** — carries the ≥3/session
  figure forward as its own series.
- Annotation under the table: `**2026-07-29 changeover.** From this date, design-judge Stop-hook
  catches are logged in their own row and NOT deducted from first-attempt accuracy. Pre-2026-07-29
  accuracy figures include them; the series is not continuous across this line.`

**Why:** dropping the double-billing raises reported accuracy without behavior changing. Annotating
keeps 25 sessions of history readable instead of silently breaking the series.

---

## 8. `conversations/PROMOTION-QUEUE.md` — all 7 open items cleared

23 days stale, against a skill that calls clearing it *"a BLOCKING GATE… the FIRST job of this run."*

| Item | Lands |
|---|---|
| `agent-output-placeholder-content-check` (8x) | CLAUDE.md 1f + memory |
| `scope-doc-enumerate-capability-axes` (5x) | CLAUDE.md 1b |
| `goal-char-cap-iterative-trim` | CLAUDE.md 1f |
| `codex-worker-cwd-mismatch-self-check-void` | memory (same file as 8x) |
| `background-write-race-looks-like-missing-file` | memory (same file) |
| `browser-automation-success-lies-about-state` | CLAUDE.md 1f + `verification-incidents.md` |
| `advisor-fork-inherits-and-drifts` | memory |

Each moves to `## Promoted` as `- [x] … | landed in <file> (2026-07-29)`, grep-confirmed.

---

## 9. `memory/` — 2 new files + MEMORY.md lines

- `feedback_delegated_output_is_guessed_until_read.md` — the 8x rule plus its cwd-mismatch and
  write-race variants, all one failure: trusting a worker's account of its own work.
- `feedback_advisor_consult_needs_clean_context.md` — no context-inheriting fork for a fresh advisor
  consult.

> **Discrepancy to flag, not silently fix.** `CLAUDE.md:97` points memory at
> `~/.claude/projects/-Users-accunliffe-projects/memory/`. The path actually loaded this session is
> `-Users-accunliffe-projects-raven-mcp/memory/`. One of those is stale and I don't know which you
> intend. Tell me and I'll correct the line.

---

## 10. `~/.claude/skills/revisit/SKILL.md` — step 4

- Autonomy scored as distance from a 90% **band**; <90 and >95 are equally off-target.
- Stop-hook catches recorded in their own row, explicitly **not** deducted from first-attempt
  accuracy, and no longer written up as execution-discipline misses.

**Why:** Fable's closing diagnosis — *"the system measures never-asking and error-catching, so it
evolved toward both, and the two numbers you actually care about paid for it."* This is the only
edit that changes the measurement rather than the content.

---

## FLAGGED — not among your four decisions, needs your call

### A. `CLAUDE.md:47` — binding injected instructions

Fable rated this the **highest-frequency conflict in the system**, above delegation.
`rule-keeper.py:61-64` injects up to three `INSTRUCTION: invoke Skill(X) NOW` lines per prompt;
CLAUDE.md:47 makes every one binding. A keyword router over ~200 skills will misfire, and a
*binding* misfire is a mandated wrong action.

Three specimens this session alone: `revisit` force-fired a full retrospective on an empty
transcript because you used the word descriptively; a background task notification with no message
from you injected three binding instructions (`done-gate` with no completion claim, `prompt-coach`
with no prompt); `prompt-coach` fired again on "Go."

```diff
-  treat every injected INSTRUCTION or LOOP_REQUIRED line as binding
+  treat every injected INSTRUCTION or LOOP_REQUIRED line as a strong default — follow it unless it
+  is plainly misfiring on this turn (fired on a background event with no user message, names a skill
+  irrelevant to the actual request, or repeats one already run this session), in which case say so
+  in one line and proceed
```

Alternative, if you'd rather fix the router than the rule: prune `skill-rules.json` and keep
CLAUDE.md:47 binding. That's more work and, per CLAUDE.md:71, needs validation by replaying real
transcript excerpts across unrelated topics — not synthetic payloads.

### B. `superpowers:using-superpowers` — the 1% rule

*"If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke the
skill… BEFORE any response or action — including clarifying questions."* At ~200 skills that
threshold is met by something on essentially every prompt, so it's unsatisfiable as written and I
arbitrate it silently every turn. It's a plugin file, so amending it means either disabling the
plugin or overriding it explicitly in CLAUDE.md. No recommendation from me without knowing how much
of superpowers you actually use.

---

## Order of application, once approved

1. `CLAUDE.md` (all of §1) — the load-bearing surface
2. `verification-incidents.md` created, so nothing is lost when §1i lands
3. `settings.json` ponytail off · routing hook deny path · DNA + SUCCESSION headers
4. `PROMOTION-QUEUE.md` cleared + memory files written + `MEMORY.md` index lines
5. `metrics.md` column + annotation · `revisit/SKILL.md` step 4
6. grep-confirm every promoted rule landed on a loading surface — then done-gate + one Sol
   falsification pass before I use the word "done"

Ponytail-off and the CLAUDE.md changes only take effect in a **new session** — this one keeps the
old context loaded.
