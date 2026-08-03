# §13 pre-gate — round 3 verdict

> **DO NOT READ THIS BEFORE SUBMITTING YOUR BLIND PICKS.**
> `BLIND-REVIEW.html` is the deciding instrument in this round. Both machine endpoints came back
> uninformative, so your seven forced choices are the only thing left that can settle the clause.
> Reading the machine sections first tells you what the numbers "want" and contaminates the one
> measurement that still has power. Submit picks, then read.

**Status: INCOMPLETE — awaiting the human anchor.** Sections 1–4 are final. Section 5 is empty
until Andrew's picks are in; section 6 cannot be written without it.

---

## 0. What this round was for

Round 2 concluded "no significant difference" and I wrote that up as parity. That was wrong —
non-significance is not equivalence — and it invalidated the round. Round 3 re-ran the §13
falsifier properly, against the six steps named in `round2/VERDICT.md`.

The clause under test, verbatim from the spec:

> compare the composed prompt against a one-line instruction telling the agent to call
> `read_design_md` + `get_taste_profile` + `audit_taste` itself. If it is no better, delete the tool.

The bar is **no better**, not *worse*. Equivalence fires the delete clause. That asymmetry is why
the round cannot be closed on a null result from an instrument that could not have detected a
difference in the first place.

Pre-registration, margins, N, and the decision rule were locked in `PREREGISTRATION.md` before any
build ran. Arm assignment was sealed in `../SEALED-ASSIGNMENT-R3.md` before any build ran.

## 1. Steps 1–4 — the setup, and whether it actually held

| Step | What was required | Status |
|---|---|---|
| 1 | Role/density guard on the emphasis ramp | **Done and reaching the artifact.** `src/reference-prompt.ts` + 7 tests. The composed prompt's gaps #4 and #6 are the guard's own clamps ("sits in a transient surface, where emphasis 2 would have bound `type.h3` … Clamped to `type.body`"). |
| 2 | Skeleton derived by a calling agent, not hand-authored | **Done.** Agent `a63b949d137e847fc`, lint-clean on the first call. The composed prompt reproduced **byte-identical** on an independent re-run. |
| 3 | Surface bound, decisions scoped to the arena project | **Done.** `arena` bound in the real store (one additive write, authorized). Decisions scoped 1-of-14. |
| 4 | Arm prompts identical outside the information block | **Done, verified mechanically** against the running workflow script, not against the file I intended to run. |

Step 1 is worth isolating, because it is the one place the tool demonstrably changed an outcome:
the ramp defect the guard closes is a defect **only the composed path could ever have produced**.
P1 (max text size inside the transient surface) is 16px in all 14 builds, both arms. The guard
fixed a bug the tool introduced. That is a real fix and not a reason to keep the tool.

## 2. Primary endpoint — UNINFORMATIVE (ceiling)

Six deterministic Playwright/Talon checks per build, pre-registered δ = ±1.0 on a 0–6 scale, N = 7/arm.

```
ARM A (composed) 5 5 5 6 5 5 5      mean 5.14 (sd 0.38)
ARM B (one-liner) 5 5 5 5 5 5 5     mean 5.00 (sd 0.00)
diff 0.14   95% CI [-0.17, 0.45]    (δ = ±1.0)

per-check (A/B):  P1 7/7 7/7 | P2 1/7 0/7 | P3 7/7 7/7 | P4 7/7 7/7 | P5 7/7 7/7 | P6 7/7 7/7
ceiling: 13/14 builds share one score
```

The interval sits inside δ. **This is not a parity result.** Five of six checks passed 14/14, so
the measure had almost no capacity to discriminate; an interval inside the margin was close to
arithmetically forced. Reporting this as equivalence would repeat the exact round-2 error.

The one check that varied, P2, is itself invalid: TAL-003 fires on 13/14 builds against `#141414`
and `#1c1c1c` — which are arena `DESIGN.md`'s own `bg-elev` and `bg-card` tokens. P2 therefore
penalises faithful transcription of the design system, and build-08's lone 6 came from *omitting*
a token. I did not drop the rule post-hoc; tuning the instrument after seeing the result is how
you manufacture a verdict. It is recorded as a defect in the endpoint instead.

## 3. Secondary endpoint — UNINFORMATIVE (margin wider than the measure)

Three diverse-lens blind judges per build (craft / brief / repro), mean of three, δ = ±8 on 0–100.
Judges received `index.html` + `after-save.png` only; all 14 `BUILD-LOG.md` were moved out of
`builds/` before judging, and the script told judges no build log exists.

```
ARM A (composed) 83.29 (sd 2.14)
ARM B (one-liner) 83.86 (sd 3.73)
diff -0.57   95% CI [-4.11, 2.97]   (δ = ±8)

per lens (A / B / diff):  craft 81.86 / 85.43 / -3.57 | brief 85.86 / 84.57 / +1.29 | repro 82.14 / 81.57 / +0.57
```

The interval is inside δ, and again that means nothing. Two reasons, both computed rather than asserted:

1. **δ swallows the measure.** The judges spread all 14 builds across 76.33–87.33 — an 11-point
   range. The ±8 equivalence window is 16 points wide, **145% of the entire observed spread**. No
   pair of arms drawn from this population could have failed the equivalence test.
2. **Half the variance is the judges disagreeing with each other.** Decomposing the 42 votes:
   41% between builds, 10% between lenses, **49% residual build×lens disagreement.** Three judges
   looking at the same file disagree about it nearly as much as the files differ.

That is on top of the pre-registered caveat: round 2 measured this instrument's test-retest
correlation on **byte-identical** artifacts at r ≈ 0. A measure that cannot reproduce its own score
on the same input cannot license an equivalence claim about two different inputs.

One blinding caveat, recorded rather than buried: four builds still contained the builder's own
temp verification scripts and screenshots during judging (they were parked in `build-strays/`
afterwards). The only arm-adjacent string in any of them is a comment "snapshots for raven audits"
in build-11 (arm A). No judge referenced any stray file in its output, so the blind is intact, but
the tree was not as clean during judging as it is now.

## 4. Exploratory — spec transfer (NOT part of the decision rule)

Declared exploratory, run after the primary was locked and analysed. Eleven behaviours stated
explicitly in the composed prompt and absent from the one-liner.

```
A 10.71 / 11 (sd 0.49)   B 10.86 / 11 (sd 0.38)   diff -0.14   CI [-0.65, 0.37]
every item 7/7 in both arms except timeout-6s (A 5/7, B 6/7)
```

**Arm B, given one line, independently produced essentially every specific the composed prompt
spells out** — the 6s timeout, hover and focus-within holds, DOM removal rather than CSS hiding,
reverted-vs-dismissed as distinct terminals, inert-on-leaving, the polite live region, reduced-motion
handling, 200/120ms durations, `currentColor` icons, terse copy.

Two honest deflators before this is read as a result: Opus-class agents already know the snackbar
pattern cold, and arm B *did* read `DESIGN.md` and the taste profile — it was told to. So this
measures "does the composed prompt transmit specifics the agent would not otherwise reach", and the
answer on this task is largely no. It is a hypothesis for a harder task, not a verdict on this one.

An early version of this script reported live-region 2/7 for arm A and I nearly wrote up an
"inversion". Arm A sets the attribute via `setAttribute("aria-live","polite")`, which the regex
could not match. Corrected to 7/7 both arms. Second detector bug of the session — both caught by
verifying the effect rather than re-reading the code.

## 5. Human anchor — PENDING

`BLIND-REVIEW.html`, seven forced-choice pairs, one arm-A build against one arm-B build in each,
sides irregular, mapping sealed. Run `node sign-test.mjs "<picks>"` when they arrive.

Stated limitation up front so it cannot be quietly dropped later: with 7 pairs, an exact two-sided
sign test reaches p < 0.05 **only at 7-0**. Anything from 6-1 down returns
UNDERPOWERED-OR-NO-EFFECT, which is not evidence the arms are the same. And a 7-0 sweep is still a
single-rater result.

## 6. Verdict — cannot be written yet

Both machine endpoints are uninformative by construction. Nothing in sections 2–4 licenses either
"keep" or "delete".

What is already decidable, and is a decision for Andrew rather than for me:

- The §13 clause as written fires on **equivalence**, not just on inferiority. If the position is
  "delete unless superiority is demonstrated", then two uninformative endpoints plus a null human
  read closes the gate against the tool, and no further rounds are owed.
- If the position is "delete only on demonstrated equivalence", then this round is a null and the
  honest next step is a harder task where a one-line instruction plausibly *would* fall short —
  the snackbar was too easy, and every arm hit the ceiling.

I am not picking between those. That is a product call.
