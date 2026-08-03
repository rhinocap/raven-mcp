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

---

## Window 11 — round 3: the decisive experiment, run

Andrew sanctioned the six steps from `round2/VERDICT.md` §"What would actually settle §13",
which unblocked editing `src/reference-prompt.ts`.

### Steps 1–4 (all verified from artifacts, not self-reports)
1. **Role/density guard** added to the emphasis ramp (`src/reference-prompt.ts`): a compact
   transient surface cannot bind above `type.body`, and the clamp is reported as a gap rather
   than silently re-scaled. 7 tests added. Full suite **1165 / 1162 pass / 0 fail / 3 skipped**
   (the CLAUDE.md ground-truth block still says 1153/1150/0/3 — stale, needs updating).
2. **Skeleton derived by a calling agent** (`round3/skeleton-derived.json`), lint-clean on the
   first call. I re-ran the composer against it myself and got a **byte-identical** prompt, so
   the artifact is reproduced rather than trusted.
3. **Surface bound** (`arena`) and decisions scoped 1-of-14. Rounds 1–2 had fed arm A thirteen
   decisions of which zero governed the artifact.
4. **Arm prompts matched** — verified mechanically against the *running workflow script*, not
   just the design doc: identical outside the information block, and both match the reviewed file.

### Step 5 — pre-registered, then run
`round3/PREREGISTRATION.md` locked before any build existed. Two consequential calls:
- **LLM judge demoted to secondary.** Its round-2 test-retest correlation on byte-identical
  artifacts was ≈ −0.21. No N fixes that.
- **Primary endpoint = 6 deterministic checks** (P1–P6), δ = ±1.0 checks; secondary δ = ±8 pts,
  N = 7/arm. Decision rule fixed in advance *including an explicit inconclusive verdict*.
- Arm assignment sealed in `../SEALED-ASSIGNMENT-R3.md` before builds ran.

14 builds commissioned (`wf_f54bf268-643`), 14 returned, 0 errors.

### Primary result — UNINFORMATIVE (ceiling), not parity
A = 5.14 (sd 0.38), B = 5.00 (sd 0.00), diff 0.14, 95% CI [−0.17, 0.45].
The CI fits inside δ=±1.0, but **13 of 14 builds share one score** — the measure has no
demonstrated ability to detect a 1.0 difference, so it supports neither superiority nor
equivalence. Recorded as UNINFORMATIVE. This is precisely the round-2 error not repeated.

**Why the ceiling:** P1/P3/P4/P5/P6 pass 7/7 in both arms. P2 fails 13/14 on **TAL-003**, and
the flagged pair is `#141414`/`#1c1c1c` — arena DESIGN.md's own `bg-elev`/`bg-card` tokens. P2
therefore penalises faithful transcription of the design system; build-08's lone 6 comes from
*omitting* a token, not from being better. TAL-003 was NOT dropped post-hoc — dropping it to
manufacture variance would be tuning the instrument to get a result.

### Harness discipline
`round3/measure.mjs` was validated against hand-written fixtures **before** scoring anything
real: a clean fixture scores 6/6, a deliberately defective one 3/6, failing exactly the three
checks it was built to fail. Two harness bugs found and fixed during that validation (relative
`file://` → ERR_INVALID_URL; a `page.evaluate` string evaluated as an expression that returned
the collector function instead of calling it). Two amendments recorded in `round3/AMENDMENTS.md`,
both decided from fixtures and applied identically to both arms. Amendment A2 (excluding talon
category `structure`) turned out **inert on the real data** — 0 findings excluded — so it cannot
be accused of shifting the result.

### Notable observations
- **P1 = 16px max text in the transient surface, in all 14 builds, both arms.** The step-1 guard
  closes a defect that only the *composed* path ever produced; the one-liner arm never had it.
- Arm B build-07's copy reads "Display name is now A. Cunliffe." — violating a voice constraint
  ("no restating the object that was saved") that only arm A was handed. Deterministic checks
  cannot see this; it is exactly what the judges and Andrew are for.
- Self-audit verdicts: 12 PASS, 2 WARN — both WARNs in arm B (n far too small to mean anything).
- Arm A build logs run 10.7–14.4KB vs arm B 7.3–9.3KB — arm A had gaps and reported choices to
  account for. Descriptive, not a quality measure.

### Step 6 — the human anchor, ready for Andrew
`round3/BLIND-REVIEW.html` (self-contained, 884KB, screenshots inlined): **7 forced-choice pairs**,
each one arm-A build against one arm-B build, side order irregular, pair key sealed. Ranking 14
artifacts is a weak human instrument; a 7-pair sign test gives p=0.016 two-sided if all seven fall
one way. Blinding is **enforced mechanically** — all 14 BUILD-LOG.md files were moved to
`round3/build-logs/` so a judge physically cannot read the arm, and a grep confirms no
arm-identifying string remains in `builds/`.

### Where this leaves §13
The machine cannot close it. The primary endpoint hit a ceiling and the secondary instrument
cannot re-score identical artifacts. **Andrew's blind read is the deciding instrument**, and the
"delete unless superiority demonstrated" burden-of-proof call is still his and still open.

### Next
1. Collect the 42-judge secondary pass (`wf_b5c51ef8-321`), report it *with* its reliability caveat.
2. Hand Andrew `round3/BLIND-REVIEW.html`; unseal and run the sign test on his picks.
3. Update the CLAUDE.md ground-truth test count (1153 → 1165).
4. `src/reference-prompt.ts` + tests still UNCOMMITTED; `d6aef1a`/`8df47bb` still unpushed —
   pushing `src/` is human-gated (it moves the live endpoint).
5. Still owed: /revisit (clear PROMOTION-QUEUE.md first).

---

## Window 12 — the secondary endpoint lands, and it is uninformative too

### Secondary result (42 judges, 3 diverse lenses × 14 builds, 0 errors)
Raw corpus persisted to `round3/secondary-raw.json` (152KB); analysis in `round3/secondary.mjs`.

```
ARM A (composed)  83.29 (sd 2.14)
ARM B (one-liner) 83.86 (sd 3.73)
diff -0.57   95% CI [-4.11, 2.97]   (delta = +/-8)
per lens (A/B/diff): craft 81.86/85.43/-3.57 | brief 85.86/84.57/+1.29 | repro 82.14/81.57/+0.57
```

The CI sits inside delta and it means nothing. Two computed reasons, both written into the script
so they are re-derivable rather than asserted:

1. **The margin is wider than the measure.** All 14 builds span 76.33–87.33 = an 11-point range.
   The ±8 window is 16 points wide — **145% of the entire observed spread**. No two arms drawn
   from this population could have failed the equivalence test. This is the round-2 error wearing
   a different hat: an interval inside a margin that the instrument could not have exceeded.
2. **Half the variance is judges disagreeing with each other.** One-way decomposition over 42
   votes: 41% between builds, 10% between lenses, **49% residual build×lens disagreement.**

Plus the pre-registered caveat: round 2 measured this instrument's test-retest correlation on
byte-identical artifacts at r ≈ 0.

So **both machine endpoints are uninformative** — primary by ceiling (13/14 builds share one
score), secondary by margin-swallows-measure. Neither supports keep OR delete.

### Blinding verified, with one recorded caveat
Read the *executed* workflow script (not the one I intended to run): judges were given
`builds/build-NN/index.html` + `after-save.png` only, and told explicitly no build log exists.
Confirmed no arm-identifying string in the judge prompts.

Caveat recorded rather than buried: **four builds still held the builder's own temp scripts during
judging** — build-03, 05, 10, 11 (all arm A) and build-12 (arm B) had `verify.mjs`, `capture.mjs`,
`build.diff`, extra screenshots. The only arm-adjacent string in any of them is a comment
"snapshots for raven audits" in build-11. No judge referenced any stray file in its output.
All 21 strays are now parked in `round3/build-strays/<build>/`; `builds/` is uniformly
`index.html` + `after-save.png`. My previous log entry said this was a build-12-only problem —
it was not, it was 5 builds, and enumerating rather than assuming is what found the other four.

### Spec-transfer detector bug (second of the session)
First run reported live-region 2/7 for arm A vs 6/7 for arm B and I nearly wrote up an "arm A
ignores its own spec" inversion. Arm A sets it via `setAttribute("aria-live","polite")`, which the
markup-only regex could not match. Corrected → 7/7 both arms. Both detector bugs this session were
caught by measuring the effect rather than re-reading the code. Final exploratory numbers:
A 10.71/11, B 10.86/11, diff -0.14 — arm B reaches essentially every specific from one line.

### Written
- `round3/secondary.mjs`, `round3/secondary-raw.json` — secondary endpoint + raw corpus
- `round3/VERDICT-R3.md` — sections 0–4 final; **section 5 (human anchor) empty, section 6 blocked**.
  Carries a DO-NOT-READ-BEFORE-PICKS banner so the file does not contaminate the one instrument
  with power left.
- `round3/build-strays/` — 21 parked builder temp artifacts

### Where §13 stands
Unchanged and now sharper: the machine has had two properly-powered attempts and settled nothing.
**Andrew's 7 blind picks are the only remaining instrument**, and even a 7-0 sweep is single-rater.
The burden-of-proof question is his call and still open:
- "delete unless superiority is demonstrated" → two uninformative endpoints + a null human read
  closes the gate against the tool, no further rounds owed.
- "delete only on demonstrated equivalence" → this is a null; the honest next step is a harder
  task where a one-liner plausibly falls short. The snackbar was too easy; everything ceilinged.

### Next
1. Await Andrew's picks → `cd round3 && node sign-test.mjs "<picks>"` → fill VERDICT-R3 §5–6.
2. Get the burden-of-proof policy call from Andrew.
3. `src/reference-prompt.ts` + tests still UNCOMMITTED; `d6aef1a`/`8df47bb` still unpushed —
   pushing `src/` is human-gated (it moves the live MCP endpoint).
4. Still owed: /revisit (clear PROMOTION-QUEUE.md first).

## Window 12b — the falsification pass reversed my framing

I wrote up both endpoints as "UNINFORMATIVE (ceiling / margin-swallows-measure)". The Sol
report-only pass refuted that, correctly, and it was the round-2 error run backwards: round 2
laundered non-significance into equivalence; I laundered a pre-registered equivalence result into
"no result" — which happened to protect the tool. δ was fixed before the data existed. A CI inside
it IS the equivalence the rule asked for. Ceiling limits the ESTIMAND, it does not void the result.

Four objections landed, all fixed rather than argued with:

1. **Hardcoded Welch t.** `analyze.mjs` used 2.16, `secondary.mjs` 2.18, both commented
   "conservative for the df we get here". Neither was. Arm B has sd 0, so the primary's real df is
   **6**, t = 2.4469 — I understated the interval by ~14%. Wrote `round3/tstat.mjs` (bisection on
   the regularised incomplete beta, self-checked against published values: df 6 → 2.4469,
   9.5605 → 2.2421, 13 → 2.1604, 30 → 2.0423, 1 → 12.7062). Corrected CIs:
   primary **[-0.207, 0.492]** (df 6.00), secondary **[-4.216, 3.073]** (df 9.56). Both still
   inside δ. This is the "verify the EFFECT, not the code" rule biting me — the comment asserted
   conservatism and I never checked the number it produced.
2. **P2 dismissal was post-hoc.** Conceded. P2 retained and reported; added a labelled sensitivity
   analysis — excluding P2, every build scores 5/5, total saturation.
3. **Variance decomposition miscomputed.** I reported SS shares (41/10/49) as if they were variance
   components. Method-of-moments components are **17.0 / 8.4 / 74.6**, and with one observation per
   build×lens cell interaction is inseparable from error, so "judges disagree with each other" is
   only one of two readings the design can support.
4. **"The human read is the only instrument with power" was wrong.** It is the only instrument
   LEFT; its power is 21.0% at a true 80/20 preference, 47.8% at 90/10, rejection region 7-0 only.
   Added the power table to `sign-test.mjs` so a future null cannot be mistaken for sameness.

### Result after correction
Both pre-registered endpoints return **EQUIVALENCE within margin**. §13 says "if it is no better,
delete the tool" — equivalence fires the clause. `round3/VERDICT-R3.md` rewritten accordingly;
DO-NOT-READ banner removed, because the blind review is no longer the deciding instrument.

The honest counter is that both equivalences are over saturated, low-information measures on a task
an Opus-class agent already knows cold. That argues for a better task, not for reading these
results as anything but what they are. Three routes put to Andrew: honour §13 and delete; amend §13
and re-run once on a harder task; or delete the clause and keep the tool on judgement (recorded as
overriding the project's own falsifier).

### Committed
- `ab46ec8` round 3 evidence tree (94 files) — taste-store snapshot deliberately EXCLUDED pending
  a publish decision; this repo is public and it is 230KB of 173 decisions + 22 surface bindings.
- `217543e` emphasis-ramp guard + 7 tests. Suite 1165 / 1162 pass / 0 fail / 3 skipped.
- Neither pushed. `217543e` touches `src/`, which since the 2026-07-27 unpin rebuilds the live
  mcp.ravenmcp.ai endpoint — human-gated.

---

## Window 13 — Andrew's call, the §13 amendment, and the round-4 fixture

### Decisions taken (AskUserQuestion, disambiguating "do both")
- **§13: amend, then re-run on a harder task.** Nothing is deleted. `compose_build_prompt`
  stays alive, on probation.
- **Taste snapshot: gitignore it.** `round3/taste/` stays on disk, never reaches the public
  repo. `.gitignore` entry + `git rm --cached -r` (the auto-save hook had already staged it).

### §13 amended — `docs/spec-pattern-library.md:555`
Original clause kept verbatim (rounds 1–3 were run against it), superseded by four conditions:
1. The task must be one the agent **cannot do cold** — it must turn on facts that exist only in
   this project's stores. A pattern with a well-known canonical shape is disqualified by
   construction. This is round 3's diagnosed failure mode, not a post-hoc excuse.
2. **Three arms.** A = composed, B1 = the literal §13 one-liner, B2 = a generous one-liner
   granting every Raven tool. **A must beat B2**, not merely B1. A beating B1 while tying B2
   means the composer is a convenience wrapper — a delete on different grounds.
3. **The endpoint must be shown able to fail** before it is trusted, and δ is pre-registered
   against the endpoint's demonstrated range, not its nominal scale.
4. **Equivalence still fires the delete.** What changed is that "no better on a task where
   better was impossible" no longer counts as having run the gate.

### Round-4 fixture — `.claude/pregate-2026-08-02/round4/`
"Kettle", an internal T&S moderation console. Deliberately project-specific throughout.

- `arena/DESIGN.md` — 4-step **depth** ramp (recessed is the row hover, darker than the page),
  5 type steps with no 18/24, 7 `ds-*` components with real names.
- `arena/.raven/decisions/nodes.json` — 7 decisions, 6 active with `alternatives_rejected[]`,
  1 **contested** (`dec_destructive_label`: Reject vs Remove, T&S ops vs legal).
- `taste/kettle.{json,surfaces,decisions}.json` — 18 rules, 1 binding, 5 dimension decisions.

### Three things that were checked rather than assumed
1. **`get_taste_profile` returns `surfaces`** (src/index.ts:7335). So `design_notes` and
   `voice_note` reach EVERY arm — they are not discriminators, and the amendment's condition 1
   was wrong to imply they were. The Decision Graph and `list_taste_decisions` carry the load.
2. **`decision_list` with no `status` calls `listActiveDecisions()`** (src/index.ts:7011);
   `include_candidates` adds candidates, not contested. The contested decision is genuinely
   unreachable on the default path. Asserted in `verify-fixture.mjs`, not assumed. This is the
   sharpest A-vs-B2 discriminator.
3. **The leak check found a real leak and a false positive.** The binding's `layout` note said
   "the action rail sits above the list in normal flow" — that handed `dec_rail_position` to
   every arm; removed. And a `/40px/` detector was matching `--space-slack: 40px`, a legitimate
   token; tightened, and T5 reframed to measure the *stability of the text edge*, which cannot
   be hit by guessing a token value.

### Pre-registration — `round4/PREREGISTRATION.md`
3 arms, n=6, 18 builds. Primary = 13 checks (D1–D8 from the Decision Graph, T1–T5 from
`list_taste_decisions`), all verified absent from every B1-reachable source. 8 controls reported
separately as a manipulation check, never merged. δ = ±1.5 on a 13-point scale, derived from the
demonstrated range. Explicit **inconclusive** branch, bounded: one more round, then delete.

Stated deviations rather than quiet drops: no blind judge panel (round-2 test-retest r ≈ 0; round-3
residual 74.6%), no `inventory_design_system`/`diff_design_system` leg (`read_design_md` already
returns the inventory, so it would be a manufactured discriminator), no human forced-choice anchor
(21% power).

Also recorded: **A > B1 is expected by construction** — the primary is built from B1-unreachable
facts — so it is a fixture manipulation check, not evidence. A vs B2 decides.

### Harness — `round4/measure.mjs`
21 Playwright checks. Validated against two purpose-built fixtures before any build runs:
`fixtures/conformant/` → **21/21**, `fixtures/defective/` → **0/21**. First run, both exact.
Mutation testing in progress (18 single-defect mutants) — a harness that scores its own reference
implementation 21/21 proves very little on its own.

Harness bugs caught during construction: C7 was matching a substring of the `transition` shorthand
(now parses the longhand arrays); T4 reconstructed elapsed time from a hardcoded 2.25s offset (now
stamps `performance.now()` in-page at the click); C8 measured hidden controls inside pre-rendered
empty states and would have failed every build that has them (now visible-only, with a ≥4 floor so
a build cannot pass by hiding everything).

### Carried forward
- Run the mutation matrix, then derive arm A's composed prompt, seal `SEALED-ASSIGNMENT-R4.md`,
  run 18 builds.
- Uncommitted: `.gitignore`, `docs/spec-pattern-library.md` (§13 amendment), all of `round4/`.
- Still unpushed: `d6aef1a`, `8df47bb`, `ab46ec8`, `217543e`, `9cbfc12`. `217543e` touches `src/`
  → human-gated.
- **UNVERIFIED, flagged:** the round-2 ablation arrays quoted earlier in this log were
  reconstructed from memory, not read from `round2/raw/`. Not data.

## Window 14 — arm A composed, round 4 sealed and running

**The premise I carried in was wrong, and it changed the round for the better.**
`compose_build_prompt` is **built** — `src/reference-prompt.ts` (50KB), registered at
`src/index.ts:2943`, `readOnly` in `TOOL_ACCESS`. I had it recorded as spec-only. So arm A
is the real tool's real output, not a hand-derived reconstruction, which closes the biggest
soft spot rounds 1–3 all had: nobody can say I graded my own paraphrase of the tool.

### Step 3 — arm A (`COMPOSED-PROMPT.md`, `ARM-A-PROMPT.md`, `compose4.mjs`)

`compose_build_prompt` called against the fixture stores via `RAVEN_TASTE_HOME` /
`RAVEN_DECISIONS_HOME`. Andrew's live `~/.raven` untouched. **Three independent runs, one
hash** — `9861b70f…`, 52 lines. Resolved: 29 tokens, 7 components, `binding_resolved:true`,
6 active decisions consulted, `dec_destructive_label` routed into `## Gaps` as an open
question. Called **without** a skeleton on purpose — round 4 copies no reference, so the
grounding-half branch is the honest one.

**Composer property found while checking, recorded pre-data.** The prompt never states a
decision's *chosen position* — only its rejected alternatives plus rationale
(`src/reference-prompt.ts:920-921`) — and it **silently drops any active decision with an
empty `alternatives_rejected[]`**. That is a §9 template gap, not an implementation slip:
there is no output section for a chosen position. Checked rather than assumed: all six
active fixture decisions carry 2–3 rejections, so nothing is dropped here. And all 13
primary checks were traced line-by-line to arm A's text *before* the round, so a low arm-A
score cannot later be waved away as an unreachable endpoint.

### Step 4 — sealed (`SEALED-ASSIGNMENT-R4.md`, `SEAL-HASHES.txt`)

Seeded Fisher–Yates, run once, 6/6/6, opaque build ids. Hashes recorded at seal time.

**`raven-cli.mjs` — the B arms needed tool access they did not have.** The session's MCP
server resolves its taste store from `~/.raven`, which has no `kettle` profile, so a B-arm
agent calling `get_taste_profile` would have got "not found" and had no tools at all. The
shim runs the same registered handlers against the fixture stores. **The arm restriction is
enforced in the shim, not in the builder's prompt** — B1 gets exactly the three tools §13
names and nothing else; `compose_build_prompt` is denied to both B arms.

**B2 is the stronger arm on paper, deliberately.** Verified through the shim: `decision_list`
hands B2 each decision's full `statement` — the chosen position outright — where arm A only
gets rejections and must infer. `list_taste_decisions` gives it all five dimension decisions
in full text. The single thing B2 must think to ask for is the contested decision:
`decision_list {}` returns the six active ones and hides `dec_destructive_label`; only
`{"status":"contested"}` surfaces it. So on 12 of 13 checks B2 has the *more direct* access.

### Step 5 — running

18 prompts generated (`make-prompts.mjs`); task body confirmed byte-identical across arms.
Builds dispatched 4 at a time per the sealed protocol. Builder model deliberately left at
the session model — round 3's diagnosis turns on what an Opus-class agent knows cold, so
changing the builder tier would change the thing being measured.

### Pre-data validation completed this window

- `analyze4.mjs` written **before** any result existed; **all four decision branches fired
  correctly** on synthetic data (PASS / equivalence / inferior / inconclusive).
- `tstat.mjs` reused verbatim from round 3; self-check passes on five published t values.
- `leak-check.mjs` written; its LCS **matches brute force on 400 random cases**. It looks
  for a build that transcribed the conformant fixture or another build — the prose "don't
  read the answer key" instruction measured rather than trusted.

### Carried forward

1. Finish the 18 builds, then `measure.mjs` → `leak-check.mjs` → `analyze4.mjs` → `VERDICT-R4.md`.
2. Sol falsification pass over the analysis before any of it reaches Andrew.
3. Commit the round-4 tree + `.gitignore` + the §13 amendment — all still uncommitted.
4. Push decision on `d6aef1a`, `8df47bb`, `ab46ec8`, `217543e`, `9cbfc12` — Andrew's call;
   `217543e` touches `src/` so it is human-gated.
5. **UNVERIFIED, still flagged:** the round-2 ablation arrays were reconstructed from
   memory, never read from `round2/raw/`. Not data.

### Window 15 — arm integrity, and a near-miss on the fixture store

**Dispatch state at checkpoint:** b01–b12 dispatched. Complete: b01–b08. In flight: b09,
b10, b11, b12. Not yet dispatched: b13–b18. Cap held at 4 throughout, per the sealed
protocol.

**No build score has been read.** §8 forbids it until all 18 exist, and `analyze4.mjs` now
refuses to run on a partial file (exit 1, names the missing ids).

#### Arm integrity is measured, not asserted

Subagents inherit this session's MCP config, so a builder could have called
`mcp__raven__*` directly against Andrew's real `~/.raven` store and bypassed
`raven-cli.mjs` and its arm restriction entirely. `arm-integrity.mjs` parses each agent's
JSONL for actual `tool_use` blocks and counts them.

The first version of that check was worthless: `grep -o 'mcp__raven__[a-z_]*'` matched the
*deferred-tool listing in every agent's system prompt*, so it returned ~105 tool names for
every build including arm A, which has no tools at all. Parsing the JSONL was the fix.

Second correction: b08 (B1) was flagged for calling `__list__`. That is the
deliberately-bad-tool-name probe the shim explicitly invites ("Run it with a bad tool name
to see the list"). Probe names are now excluded, and a **BREACH** (going around the shim)
is separated from a **refused reach** (asking the shim and being told no — the gate
working).

Result across the six builds checked so far:

```
b01 [A ]  mcp=0  cli=0                                    arm intact
b02 [B2]  mcp=0  cli=10   reached for and was refused: compose_build_prompt
b03 [A ]  mcp=0  cli=0                                    arm intact
b04 [B2]  mcp=0  cli=12   reached for and was refused: compose_build_prompt
b06 [B1]  mcp=0  cli=3  (read_design_md, get_taste_profile)
b08 [B1]  mcp=0  cli=8  (read_design_md, get_taste_profile, audit_taste)
```

`mcp=0` everywhere — nobody went around the shim. Arm A used zero tools. B1 stayed inside
its three. **Both completed B2 builds reached for `compose_build_prompt` and were refused
in code.** That is the payoff for enforcing the arm restriction in `raven-cli.mjs` rather
than in prose, and it is a reportable finding whichever way the round lands.

#### Near-miss: b04 called `decision_scope` against the fixture store

`decision_scope` is classified **destructive**. Checked immediately rather than after the
round: the store mtimes are 13:12–13:16, which predate every build, and
`verify-fixture.mjs` still reports `FIXTURE OK`. **No mutation occurred.**

Chose detection over prevention. `chmod`-ing the store read-only mid-round would change
the conditions the first eleven builds ran under, which is exactly what the
pre-registration exists to prevent. Instead `STORE-BASELINE.txt` now pins every input:

```
8f991eee…  arena/.raven/decisions/edges.json
0f416aea…  arena/.raven/decisions/nodes.json
c8d5ee85…  taste/kettle.decisions.json
59b8d15c…  taste/kettle.json
80d93ea9…  taste/kettle.surfaces.json
221c6b0c…  arena/DESIGN.md
```

Re-verifying these after build 18 proves all 18 read an identical store. If they moved, the
round is void — and it will say so rather than being quietly rationalised.

`agent-map.txt` records the agent-id → build-id mapping so the integrity check can be
re-run over the full set at the end.

#### An asymmetry, disclosed rather than corrected

`inventory_design_system` and `diff_design_system` throw ENOENT on `project_dir` when a
project has no `.raven/design-system-source.json` (`src/design-system-diff.ts:41-43`). The
composer catches that and falls back; the raw tools do not. That favours arm A. B2 still
has a working path via `design_file_path` — verified through the shim, returns full
inventory and diff — so it costs B2 one failed call, not the capability. Recorded in
PREREGISTRATION Amendment 3 and deliberately left in place; changing the fixture mid-round
is the worse sin.

#### Carried forward (supersedes the previous list)

1. Dispatch b13–b18, refilling to the cap of 4.
2. `measure.mjs builds /tmp/r4-scores.json` → `leak-check.mjs` → `arm-integrity.mjs` over
   all 18 → re-verify `STORE-BASELINE.txt` → `analyze4.mjs` → `VERDICT-R4.md`.
3. Sol falsification pass over the analysis before any of it reaches Andrew.
4. Commit the round-4 tree + `.gitignore` + the §13 amendment — all still uncommitted.
5. Push decision on `d6aef1a`, `8df47bb`, `ab46ec8`, `217543e`, `9cbfc12` — Andrew's call;
   `217543e` touches `src/` so it is human-gated.
6. **UNVERIFIED, still flagged:** the round-2 ablation arrays were reconstructed from
   memory, never read from `round2/raw/`. Not data.

---

## Window 16 — round 4 completed, measured, falsified, and found INVALID

### The headline

**Round 4 does not bear on §13.** It ran cleanly to 18/18, the arithmetic is correct, and
the verdict it produces is worthless, because **the arms were never isolated**. All six
arm-A builds read `round4/arena/DESIGN.md` off disk. Arm A was therefore not "the composed
prompt alone" — it was "the composed prompt plus the design system". The contrast the round
exists to measure did not exist.

That is a design error of mine, not builder misconduct. Details in §4 below.

### Run completion

18/18 builds, no re-runs, no failures. Fixture store hashed identically at three points:
before dispatch, twelve builds in, and after all eighteen (`STORE-BASELINE.txt`). Zero MCP
`tool_use` blocks in any namespace across all 18 transcripts — the shim held; four of six
B2 builds reached for `compose_build_prompt` and were refused in code.

Leak check: no build is a >3sd lexical outlier against the answer key. Two build-pairs
tripped the 12-gram Jaccard threshold; `inspect-pair.mjs` (written to print the literal
longest common substring rather than argue about a number) showed both share only the 12
seed rows handed verbatim to every builder in `TASK.md`. Dispositioned, not suppressed.

### Pre-registered result (reported, not decisive)

| arm | n | mean | sd | scores |
|---|---|---|---|---|
| A | 6 | 10.83 | 0.41 | 11, 11, 11, 10, 11, 11 |
| B2 | 6 | 9.67 | 3.27 | 6, 12, 12, 12, 5, 11 |
| B1 | 6 | 9.33 | 1.86 | 10, 10, 11, 7, 7, 11 |

A−B2 = +1.17, Welch 95% CI [−2.26, +4.59], se 1.344, df 5.16 → INCONCLUSIVE. A−B1 = +1.50
[−0.45, +3.45]. Controls: A−B2 −0.33 [−1.30, +0.64]; A−B1 −0.50 [−1.51, +0.51].

The one non-obvious pattern: arm A's sd is **0.41** against B2's **3.27**. A never fell
below 10; B2 produced two 5s and two 12s. If the composer buys anything it looks like floor,
not ceiling — and n=6 against sd 3.3 cannot resolve that. Round 5 should pre-register the
endpoint that matches the claim.

### My own harness bug, found by reading failures rather than code

`measure.mjs:262` T2 requires the pill background be `rgba(0,0,0,0)`, `transparent`, or
equal to the parent's. The taste decision it scores says the pill is *"a 1px border in the
signal hue with --ink-primary text **on --surface-base**"*. `--surface-base` is `#0e1113`,
an opaque colour. **The literally-correct rendering scores FAIL.** The check encodes
"transparent" where the source says "on --surface-base".

`measure.mjs` was NOT edited — it verifies against the seal and stays the harness of record.
`posthoc-t2.mjs` re-opens all 18 builds and reports both scorings side by side: A 0/6 → 0/6,
B1 6/6 → 6/6, **B2 0/6 → 6/6**. So the bug had been *favouring the tool*. Corrected, Δ falls
to +0.17 [−3.26, +3.59] — still inconclusive.

### The arm-isolation failure

Sol's objection 8 named a gap in `arm-integrity.mjs`: it inspects MCP `tool_use` blocks and
`raven-cli.mjs` invocations, and never asks whether a builder simply **read the fixture files
from the shell**. I wrote `arm-integrity2.mjs` to close it. The trick is stripping shim
invocations before grepping, so a legitimate `raven-cli.mjs B2 read_design_md '{"path":...}'`
is not counted as a raw read of its own argument.

| arm | out of arm |
|---|---|
| **A** | **6 of 6** — all read `arena/DESIGN.md`; b01, b07 also read `.raven/decisions/nodes.json` |
| **B1** | **4 of 6** — b12, b16, b17 read `nodes.json`; b10 enumerated and sized it |
| B2 | 0 (full surface — a direct read is redundant with what it could fetch) |

**The ground rules permitted it.** `make-prompts.mjs:65-71` says *"Do not read anything under
this round's directory other than what you are pointed at above"* and its "Specifically:"
list names only `fixtures/`, `measure.mjs`, `PREREGISTRATION.md`, and other `builds/`. And
`ARM-A-PROMPT.md:3` — the composer's own output — cites the DESIGN.md path. So the treatment
told the builder where the file was and the rules said pointed-at material was fair game.

This is the "enforce gates in the engine, not in prose" rule failing in my own harness, in a
round built to test rigour. The B2 arm restriction *was* enforced in code and held perfectly
across 18 builds; the arm-A information boundary was prose and broke 6/6.

**What it does and does not contaminate:** `DESIGN.md` carries tokens and the component
inventory but **not** the taste decisions — the pill-outline and undo-copy rules live in
`taste/kettle.decisions.json`, which no arm-A build read. So T2/T3 are not explained by the
breach. The token/structure checks are. I am not re-analysing around it; dropping checks
after seeing scores is the laundering the pre-registration exists to prevent.

### Sol falsification pass — 9 objections, 3 FATAL, "would not sign"

All nine sustained in whole or part, each dispositioned individually in `VERDICT-R4.md` §3.
The ones that changed the document:

- **OBJ2 (FATAL)** — `ARM-A-PROMPT.md:2` reads *"…call compose_build_prompt again with it as
  `skeleton` — this response is the grounding half only."* Arm A was handed a prompt that
  declares itself incomplete and instructs a second call the arm had no tools to make.
- **OBJ3 (FATAL)** — seal verifies OK for `TASK.md`, `measure.mjs`, `ARM-A-PROMPT.md`,
  `SEALED-ASSIGNMENT-R4.md`, `raven-cli.mjs`, `compose4.mjs`. `PREREGISTRATION.md` FAILS
  (three appended amendments — and the seal cannot tell an append from a rewrite of §5).
  `analyze4.mjs` was never sealed. Nothing is committed, so provenance is assertion.
- **OBJ4 (MATERIAL)** — `COMPOSED-PROMPT.md:79-102`, written *before* the data, graded all
  13 checks reachable and concluded *"the endpoint measures the composer, not a hole in it."*
  My first verdict draft then claimed the 0/6 results **confirmed a predicted defect**. They
  did the opposite: they **falsified my own pre-round judgement**, which had counted
  inference-from-a-rejection as reachability. Corrected in writing.
- **OBJ1** — verified live: `analyze4.mjs:44-45` returns PASS before testing equivalence, so
  an interval like [+0.5, +1.2] satisfies both branches and silently reports PASS. Did not
  bind this round; must be made mutually exclusive.
- **OBJ5** — verified live: T3's `/^\d+\s+\w+\.\s*Undo$/i` accepts `"3 items. Undo"`. It
  enforces neither past tense nor the no-"items" rule `PREREGISTRATION.md:79` claims for it.
  Also true: `posthoc-t2.mjs` used a broader pill selector than `measure.mjs`. Unresolved.
- **OBJ8** — its stated mechanism (a `mcp__claude_ai_Raven_MCP__*` bypass) is **refuted**:
  zero such blocks exist. Its *other* half found the round-invalidating breach.

The general lesson, worth keeping: **the objection that mattered was refuted on its stated
mechanism and correct about the underlying gap.** Verifying it away on the mechanism alone
would have shipped an invalid round as a result.

### What survives

A narrow, verified code defect, independent of this round: `src/reference-prompt.ts:914-921`
emits only `alternatives_rejected` + `rationale`, has no field for a decision's chosen
position, and `continue`s past any active decision with an empty `alternatives_rejected[]`.
True by reading. The evidence that it *costs* something is suggestive and uncontrolled.

### Carried forward (supersedes the previous list)

1. **Ask Andrew the probation-clock question.** `PREREGISTRATION.md:5` fires the delete after
   a second inconclusive round. Round 4 was **invalid**, for a reason unrelated to the
   tool's performance. Whether that burns a slot is unspecified and is his call — my
   recommendation (it should not) is self-serving by construction.
2. Commit the round-4 tree + `.gitignore` + `docs/spec-pattern-library.md` — still 81 staged
   additions, zero history.
3. Push decision on `d6aef1a`, `8df47bb`, `ab46ec8`, `217543e`, `9cbfc12`; `217543e` touches
   `src/` so it is human-gated.
4. Round 5 requirements, if there is one: isolate arms **mechanically** (per-build worktree
   or a fixture store outside the round tree); decide what arm A *is* (drive both composer
   calls, or test the grounding half on purpose and say so); seal `analyze4.mjs`; commit the
   pre-registration to git before the first build; fix T2 and T3 before sealing; make the
   decision branches mutually exclusive; fold the shell-read check into the integrity script.
5. `/revisit` retrospective still owed (clear `conversations/PROMOTION-QUEUE.md` first).
6. **UNVERIFIED, still flagged:** the round-2 ablation arrays were reconstructed from memory,
   never read from `round2/raw/`. Not data.
