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
