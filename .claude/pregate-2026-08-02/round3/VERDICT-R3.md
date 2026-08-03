# §13 pre-gate — round 3 verdict

**Both pre-registered endpoints returned EQUIVALENCE within their margins. §13 reads "if it is no
better, delete the tool", so equivalence fires the delete clause. The gate closes against the
composed-prompt tool unless Andrew changes the burden of proof.**

This document was rewritten once. The first version called both endpoints "uninformative" on
ceiling/restricted-range grounds. A falsification pass refuted that, and it was refuted correctly —
see §6. The earlier framing was the round-2 error run backwards: round 2 laundered non-significance
into equivalence; I was laundering a pre-registered equivalence result into "no result", which
happened to protect the tool.

---

## 0. What was under test

> compare the composed prompt against a one-line instruction telling the agent to call
> `read_design_md` + `get_taste_profile` + `audit_taste` itself. If it is no better, delete the tool.

The bar is **no better**, not *worse*. Equivalence fires the clause. Round 2 was invalidated for
reporting non-significance as parity; round 3 pre-registered margins, N, blinding and the decision
rule in `PREREGISTRATION.md`, and sealed arm assignment in `../SEALED-ASSIGNMENT-R3.md`, both
before any build ran. 14 builds, 7 per arm, same snackbar/undo task, arms identical outside the
information block.

## 1. Steps 1–4 — setup

| Step | Required | Status |
|---|---|---|
| 1 | Role/density guard on the emphasis ramp | Done, and reaching the artifact. `src/reference-prompt.ts` + 7 tests (commit `217543e`, local only). Composed-prompt gaps #4/#6 are the clamps firing. |
| 2 | Skeleton derived by a calling agent, not hand-authored | Done. Agent `a63b949d137e847fc`, lint-clean first call; composed prompt reproduced **byte-identical** on independent re-run. |
| 3 | Surface bound, decisions scoped to the arena project | Done. `arena` bound in the real store (one additive write, authorised). Decisions scoped 1-of-14. |
| 4 | Arm prompts identical outside the information block | Done, verified mechanically against the *running* workflow script. |

Step 1 deserves isolating because it is the one place the tool demonstrably changed an outcome —
and it changed it by fixing a bug the tool itself introduced. The ramp could bind `type.h3` inside
a 46px snackbar; the guard clamps it to `type.body`. P1 (max text size in the transient surface)
measures 16px in **all 14 builds, both arms**. The one-liner arm never had the defect to fix.

## 2. Primary endpoint — EQUIVALENT within δ = ±1.0

Six deterministic Playwright/Talon checks per build, 0–6 scale.

```
A (composed)  5 5 5 6 5 5 5     mean 5.14 (sd 0.38)
B (one-liner) 5 5 5 5 5 5 5     mean 5.00 (sd 0.00)
diff 0.14   95% CI [-0.207, 0.492]   Welch df 6.00, t 2.4469   δ = ±1.0

per-check (A/B): P1 7/7 7/7 | P2 1/7 0/7 | P3 7/7 7/7 | P4 7/7 7/7 | P5 7/7 7/7 | P6 7/7 7/7
```

CI wholly inside δ → **equivalent → delete clause fires on this endpoint.**

**What this equivalence is over, and what it is not.** 13/14 builds share one score and five of six
checks passed 14/14. So the claim is *equivalence on these six checks*, not equivalence of build
quality. The endpoint is saturated and cannot detect a difference it was never sensitive to. That
limits the estimand; it does not void a margin fixed before the data existed.

**P2, reported both ways rather than dismissed.** P2 (zero Talon findings) fires on 13/14 builds
against `#141414`/`#1c1c1c` — the arena `DESIGN.md`'s own `bg-elev`/`bg-card` tokens — so it
penalises faithful transcription of the design system, and arm A's lone 6 came from a build that
*omitted* a token. Calling P2 invalid after seeing that it produced the only apparent A advantage
is post-hoc, and it is fair to say so. P2 was **not** dropped. Pre-specified sensitivity: excluding
P2, every build scores 5/5 and the endpoint becomes perfectly non-discriminating. That strengthens
the estimand limit; it rescues neither arm.

## 3. Secondary endpoint — EQUIVALENT within δ = ±8

Three diverse-lens blind judges per build (craft / brief / repro), mean of three, 0–100.
Judges received `index.html` + `after-save.png` only; all 14 `BUILD-LOG.md` were moved out of
`builds/` first and the script told judges no build log exists.

```
A 83.29 (sd 2.14)   B 83.86 (sd 3.73)
diff -0.57   95% CI [-4.216, 3.073]   Welch df 9.56, t 2.2422   δ = ±8

per lens (A / B / diff):  craft 81.86 / 85.43 / -3.57 | brief 85.86 / 84.57 / +1.29 | repro 82.14 / 81.57 / +0.57
```

CI wholly inside δ → **equivalent → delete clause fires on this endpoint too.**

Limits, again reported as limits rather than as a veto:

- The realised between-build range is 11.00 pts (76.33–87.33); the ±8 window is 16 pts, 145% of it.
  δ was set on the 0–100 scale before any score existed, so this does not void it — it means the
  equivalence holds over a population this judge scores within an 11-point band.
- Round 2 measured this judge's test-retest correlation on **byte-identical** artifacts at r ≈ 0.
  Unbiased noise costs power rather than invalidating an arm-mean comparison, but a single per-build
  score here carries almost no information.
- Variance over the 42 votes: SS shares 41% build / 10% lens / 49% residual, but those ignore df.
  The method-of-moments components are **17.0% build / 8.4% lens / 74.6% residual**. And with one
  observation per build×lens cell, interaction is inseparable from error — the residual may be
  genuine multidimensionality (strong on craft, weak on reproduction) rather than judges disagreeing.
  The design cannot tell those apart.

Blinding caveat, recorded not buried: four builds still held the builder's own temp scripts and
screenshots during judging (now parked in `build-strays/`). The only arm-adjacent string in any of
them is a comment "snapshots for raven audits" in build-11 (arm A). No judge referenced any stray
file in its output.

## 4. Exploratory — spec transfer (not part of the decision rule)

Eleven behaviours stated explicitly in the composed prompt and absent from the one-liner.

```
A 10.71/11 (sd 0.49)   B 10.86/11 (sd 0.38)   diff -0.14   CI [-0.65, 0.37]
every item 7/7 both arms except timeout-6s (A 5/7, B 6/7)
```

Declared exploratory after the primary was locked, so it can establish nothing. Descriptively it
**hurts** the tool: arm B, from one line, reached the 6s timeout, hover and focus-within holds, DOM
removal over CSS hiding, reverted-vs-dismissed as distinct terminals, inert-on-leaving, the polite
live region, reduced-motion handling, 200/120ms durations, `currentColor` icons and terse copy —
slightly more reliably than the arm that was handed all of it.

Deflators: Opus-class agents know the snackbar pattern cold, and arm B *did* read `DESIGN.md` and
the taste profile — it was told to. So this measures "does the composed prompt transmit specifics
the agent would not otherwise reach", and on this task the answer is no.

An early version of this script reported live-region 2/7 for arm A and I nearly wrote up an
"inversion". Arm A sets it via `setAttribute("aria-live","polite")`, which the markup-only regex
could not match. Corrected to 7/7 both arms — second detector bug of the session, both caught by
measuring the effect rather than re-reading the code.

## 5. Human anchor — available, but it cannot decide this

`BLIND-REVIEW.html`, seven forced-choice pairs, sides irregular, mapping sealed. Still worth
Andrew's time as a taste read. It is **not** the deciding instrument, and the earlier claim that it
was "the only instrument left with power" was wrong — it is the only instrument left, and its power
is poor:

```
rejection region is 7-0 only; actual size 0.0156
true per-pair preference 0.70 -> power  8.3%
                         0.80 -> power 21.0%
                         0.90 -> power 47.8%
```

A 6-1 split is p = 0.125 — not significant, and descriptively not nothing. At 21% power against a
strong 80/20 preference, a null here would carry almost no information either way.

## 6. Falsification pass — what it refuted

Run report-only against the analysis before any of this reached Andrew. Four objections landed;
all four are fixed above rather than argued with.

1. **Hardcoded Welch critical values.** `analyze.mjs` used `t = 2.16` and `secondary.mjs` `2.18`,
   both commented "conservative for the df we get here". Neither was. Arm B has zero variance, so
   the primary's real df is **6**, t = 2.4469 — the interval was understated by ~14%. Fixed:
   `tstat.mjs` computes t from the df by bisection on the regularised incomplete beta, self-checked
   against published values. Corrected CIs are in §2 and §3; both still sit inside δ.
2. **"Uninformative" was wrong, and wrong in the tool's favour.** A ceiling and a narrow realised
   range constrain the *estimand*; they do not let me discard a pre-registered equivalence result
   after seeing it. Verdict reframed throughout.
3. **The P2 dismissal was post-hoc.** Conceded. P2 retained, reported, and given a labelled
   sensitivity analysis (§2).
4. **The variance decomposition was miscomputed and misread.** SS shares are not variance
   components, and with one observation per cell interaction and error are inseparable. Both
   corrected in §3.

Also refuted: the claim that the human read is the instrument with power (§5).

## 7. Verdict, and the one call that is not mine

Under §13 exactly as written, this round closes the gate **against** the composed-prompt tool:
two independent pre-registered endpoints both returned equivalence, the exploratory measure points
the same way, and no endpoint shows a credible positive benefit.

The honest counter-argument, and the reason this is a product call rather than a statistical one:
both equivalence results are over saturated, low-information measures on a task an Opus-class agent
already knows how to do. "Equivalent on a snackbar" is weak grounds for deleting a tool meant to
carry design-system specifics into harder work. That is an argument for a **better task**, not for
reading these results as anything other than what they are.

So the choice in front of Andrew is:

- **A. Honour §13 as written.** Equivalence fires the clause. Delete the composed-prompt tool.
  No further rounds owed; round 3 is a clean, pre-registered result.
- **B. Amend §13 first**, then re-run once on a task where a one-liner plausibly falls short
  (multi-surface, unfamiliar design system, real token vocabulary the agent cannot guess). The
  snackbar was too easy; every arm ceilinged.
- **C. Delete the clause, keep the tool on judgement.** Legitimate, but it should be recorded as
  overriding a falsifier the project itself wrote, not as passing it.

I am not picking. Every route out of here is a product decision.
