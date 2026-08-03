# 2026-08-03 — §13 pre-gate round 2 (blind, N=6 per arm)

## Where left off / context
Picked up from window 10 of `conversations/2026-08-02-nc-license-cleanup.md` (checkpoint 3c11ac3).
The round-1 pre-gate verdict was NOT final: Sol returned 4 REAL objections that compromised the
run as evidence (provenance unreproducible, emphasis unfair to the composer, eyes-on not on disk,
"fix and re-run" not the spec's disposition).

Turned the remaining steps into a goal brief (`/tmp/drafts/2026-08-02-pregate-verdict-goal.md`,
7,693 chars; condensed to `-SHORT.md` at 3,772 for the 4,000-char limit), then Andrew: "Run it as
a workflow fanned deep and wide" — which overrides the brief's own main-session routing constraint
and the CLAUDE.md workflow-triage default (explicit fan-out request is one of the three earns).

## Deviation from the brief, taken deliberately
The brief specified a single controlled re-run of arm A (N=1, arm B's artifact standing).
"Deep and wide" upgrades that to **N=6 per arm, both arms re-run, blind-judged**. This directly
retires Sol's N=1 nitpick and removes experimenter bias, which the round-1 method could not.

## Round-1 objections, disposition
1. **Provenance** — CLOSED. All 5 `Agent` tool_use blocks recovered from the round-1 transcript
   `597ce6a8-fd03-4b4e-badf-6f00d1dc327e.jsonl` (calls #1–#3 were Explore legs mapping TS
   signatures; #4 = arm A, #5 = arm B). Both arm prompts persisted verbatim to
   `.claude/pregate-2026-08-02/ARM-PROMPTS.md` with a provenance header.
2. **Emphasis fairness** — CLOSED. `round2/skeleton-fair.json` changes exactly one value:
   `undo-action.emphasis 3 → 1`, matching the emphasis the spec's own snackbar example gives the
   action (`docs/spec-pattern-library.md` Structure block: `action → <Button variant="ghost"
   size="sm"> [emphasis 1]`). Verified by diff: that value and a trailing newline are the only
   deltas. Measured effect, composer byte-unchanged:
   `emphasis 3 → type.h2` became `emphasis 1 → type.body`. 6 gaps both rounds; 17,209 prompt chars.
3. **Eyes-on not on disk** — CLOSED for round 1. `round2/capture.mjs` rendered both round-1 arms
   headless at deviceScaleFactor 2 and wrote `idle.png` + `postsave.png` into `arm-a/` and `arm-b/`.
   Measured, not recalled: **arm-a Undo 56px vs message 27px; arm-b 16px vs 16px.** Eyes-on
   confirmed on arm-a/postsave.png — the orange Undo dwarfs "Change saved".
4. **"Fix ramp + re-run" is not the spec's disposition** — HONORED. `src/reference-prompt.ts` is
   byte-unchanged. The only change is upstream of the builder (the skeleton), so the gate has not
   moved. Repairing the composer before the gate still needs Andrew's explicit sanction.

## Round-2 method
- 12 anonymized dirs `round2/build-01..12`; 6 arm A (composed prompt), 6 arm B (one-liner).
  Fixed hand-chosen permutation (workflow scripts cannot call `Math.random`).
- **Arm mapping SEALED** at the session scratchpad (`ARM-MAPPING-SEALED.md`), outside the evidence
  dir, so blind judges cannot read it. Copied to `round2/ARM-MAPPING.md` only at synthesis.
- Arm prompts reused **verbatim** with two substitutions only: dead scratchpad base → the persisted
  evidence dir, and arm output dir → that build's own dir. Arm A additionally reads
  `composed-prompt-fair.md`.
- Judges get ONLY `index.html` + the two PNGs, and are forbidden `BUILD-LOG.md` (an arm-A log says
  "composed prompt", an arm-B log says "audit_taste result" — that file is the leak vector).

## Workflow wf_7ac08a99-1e0 (39 agents, 5 phases)
Build (12 × sonnet) → Capture + machine judge (2 × haiku, batch scripts) → blind Judge (12 × sonnet,
schema'd) → Adversarial refute (12 × sonnet, pipelined per build) → methodological Critic (1 × sonnet).
Model guard blocked the first launch for omitting explicit `model:` on every leg; re-issued with
explicit tiers + `[claude-justified:]` tokens (builders must be one identical capable model because
the artifact IS the dependent variable, and arm B must drive raven MCP tools).

## Files added this session
- `.claude/pregate-2026-08-02/ARM-PROMPTS.md`
- `.claude/pregate-2026-08-02/round2/` — `skeleton-fair.json`, `compose-fair.mjs`,
  `composed-prompt-fair.md`, `composed-fair.json`, `capture.mjs`, `judge-batch.mjs`, `build-01..12/`
- `.claude/pregate-2026-08-02/arm-a/{idle,postsave}.png`, `arm-b/{idle,postsave}.png`
- Rebuilt `dist/` (was stale: src 22:50 vs dist 22:20 — compose would have run old code)

## Standing hazards this session
- Auto-save hook tally was 6 at handoff. Every commit here must be `git commit --only <paths>`
  with a `git status` re-check immediately prior. Builds are being written while the workflow runs,
  so do not commit mid-run.
- `stash@{0}` (2026-07-28 accidental-release recovery) must stay intact — never a bare `stash pop`.
- Taste store `~/.raven/taste` is READ-ONLY throughout; audit_taste/get_taste_profile only.

## Round-2 result (wf_7ac08a99-1e0 — 39 agents, 0 errors, 504.7s)
Mapping unsealed at synthesis. A = composed prompt (02,03,06,07,09,12); B = one-liner (01,04,05,08,10,11).

| arm | judge mean | median | range | refuted mean | median | range | ship_ready |
|---|---|---|---|---|---|---|---|
| A composed | 67.8 | 64.0 | 60–83 | 67.5 | 63.5 | 58–81 | **1/6** |
| B one-liner | 83.5 | 85.0 | 76–87 | 82.5 | 83.0 | 78–85 | **5/6** |

Mean delta A−B = **−15.7** judged, **−15.0** after adversarial refutation. 11/12 refutations
sustained the original verdict; the single overturn (build-05, arm B) moved *upward* 76→84.
High-severity defects: arm A **5**, arm B **0**.

## Root cause — measured, not inferred
The composed prompt emits, for the confirmation message node:
`[emphasis 2 → type.h3, density compact → space.sm]`. Arena type scale is
`label 13 / body 16 / lead 20 / h3 27 / h2 56 / h1 96`. So the composer binds a transient toast's
message to a **heading token**.

Live measurement (`round2/measure-msg.mjs`, playwright, all 12 builds post-save):
- message at **27px**: builds 03, 06, 07, 09, 12 — **all arm A**
- message at **16px**: builds 01, 02, 04, 05, 08, 10, 11 — all six arm B, plus arm-A build-02
- Undo at **16px in all 12** — the round-1 fairness fix held (round 1 arm-A Undo was 56px)

build-02 is the lone arm-A build that ignored the prompt's type binding, and it is the lone
arm-A build that scored ship_ready (83/81). The round-1 defect did not disappear when the
skeleton was made fair — it **moved**: `emphasis 3 → type.h2` on the action was masking
`emphasis 2 → type.h3` on the message, which was present in BOTH rounds.

**Correction to an earlier read in this session:** the `--type-h3` lines I first grepped
(build-02 L83, build-03 L74) are the demo-harness heading, not the snackbar. The claim above
rests on the playwright measurement and on `msg-selector.mjs`, which resolves the actual matching
CSS rule (`.snackbar__message` / `.c-toast__message`). Do not re-derive this from grep.

## Methodological critic (blind) — its objection is real
No blindness break found: no judge or refuter named an arm, method, or provenance. But the critic
independently isolated the same 5-build defect cluster and argued the gap is **one repeated wrong
CSS variable, not a capability gap** — "a one-line fix." It named the decisive missing measurement:
ablate that token, re-render, re-score blind. If the gap collapses, the experiment measured one bug.
Residual confound it also flagged: builds narrate their own rationale inline (footers, code
comments), which can leak method identity through the artifact even to a blind judge.

## Ablation (wf_a31a9eb4-b24, in flight)
`round2/ablation/abl-01..12`, fresh sealed permutation at the scratchpad
(`ABLATION-MAPPING-SEALED.md`). `index.html` only — no BUILD-LOG.md copied, removing that leak
vector entirely. In the 5 defective arm-A builds the message rule's `font-size: var(--type-h3…)`
→ `var(--type-body, 16px)`; **only that one declaration, inside that one selector block**
(`make_ablation.py` asserts exactly 1 substitution per file). Verified by live measurement: all 12
now render the message at 16px. Judge + refute prompts reused **verbatim** from wf_7ac08a99-1e0
with only the directory swapped, so scores are comparable across rounds.
`src/reference-prompt.ts` remains byte-unchanged — the ablation patches build artifacts, not the
composer, so it does not move the gate.

## Ablation result (wf_a31a9eb4-b24 — 24 agents, 0 errors, 215s)
The critic was right: the gap collapses when the one token is fixed.

| arm | judge mean | range | refuted | ship-ready | high defects |
|---|---|---|---|---|---|
| A composed | 81.8 | 76–88 | 81.7 | 4/6 | 1 |
| B one-liner | 83.8 | 74–87 | 82.7 | 5/6 | 1 |

Arm A gains ~14 points from a single-declaration change and still does not lead.

**Unplanned test-retest control:** 7 artifacts (all 6 arm B + arm-A build-02) were byte-identical
across both judging rounds and unablated. Their scores moved: mean −0.7, **MAD 5.0, sample sd 7.16,
max swing 13** (build-10: 87 → 74). Test-retest correlation ≈ **−0.21** — the LLM judge barely
agrees with itself build-to-build.

## Sol falsification pass — the verdict did NOT survive
13 REAL objections. My first draft of `VERDICT.md` concluded "no better → §13 delete clause
satisfied." That was **wrong**, and Sol's objection 8 is why:

- **Non-significance ≠ equivalence.** Welch ~95% CI on the ablated gap is **[−8.0, +4.0]** —
  includes zero, admits a meaningful advantage either way. That supports "cannot distinguish",
  not "no better". Re-derived independently; Sol's arithmetic is exact. The as-shipped gap
  −15.7 CI **[−24.0, −7.4]** DOES exclude zero, so that result stands.
- **Objection 3 — the one I should have caught myself.** The arm prompts differ in *enforcement*,
  not only information source: arm B is told to call three tools and audit its own artifact before
  finishing; arm A is told the composed file is complete and to consult no other source. Arm B
  gets a self-audit step arm A is forbidden. Inherited verbatim from round 1 — verbatim reuse was
  chosen for provenance fidelity and carried the flaw forward.
- **Objections 6/7** — the ablation is an *oracle* repair on artifacts after seeing the defect
  cluster, not a repaired-composer counterfactual. My "best case for arm A" framing overclaimed.
- **Objections 1/2** — arm A ran unbound (no surface binding, decisions from outside the project)
  and on a hand-authored skeleton rather than an agent-derived one, so it was not the composer's
  strongest path.
- **Objection 15 — deletion scope was undercounted.** Verified against the repo: no root
  `llms.txt`; the count lives in `site/llms.txt` AND `web/public/llms.txt`, 3 occurrences each
  (L3/L12/L32); `design-review.test.mjs` has 1 numeric + **3** source-string assertions;
  `src/index.ts` has **5** sites (L48 import, L1857 comment, L1915 REMOTE_GATED_TOOLS,
  L2012 TOOL_ACCESS, L2944 list) plus registration/handler.
- Objections 10 and 13 closed on the spot: full judge/refuter corpus, both workflow scripts, and
  canonical exact-match measurements persisted to `round2/raw/`.

**Also found while verifying Sol:** the composer binds the toast **root** to `type.h3` as well as
the message — not just one node.

## Standing verdict
**The §13 gate does NOT close.** Established: a real role-/density-blind binding defect in the
quantile ramp, and that as-shipped the composed prompt produced materially worse builds. NOT
established: that the tool is *no better* than the one-liner, which is what §13 turns on.
`VERDICT.md` was rewritten to say this and names the decisive experiment that was never run.

## Next
1. Commit round-2 + ablation evidence, VERDICT.md, and this log with `git commit --only <paths>`
   (auto-save hook tally 6 — re-check `git status` immediately before).
2. Report to Andrew: gate open, two branches, plus the fact that closing it on current evidence
   needs an explicit "delete unless superiority demonstrated" policy call from him.
3. Still owed: /revisit (clear PROMOTION-QUEUE.md first).
