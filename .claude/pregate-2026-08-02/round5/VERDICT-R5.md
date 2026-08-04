# Round 5 verdict — INVALID as a confirmatory test; exploratory evidence favours DELETE

**Status: the round does not certify a §13 outcome.** §5's invalidation trigger fired. That is
the verdict, and it is not the one the numbers on their own would suggest.

Round 4 was invalidated by a leak: all six arm-A builds read the fixture `DESIGN.md` off disk.
Round 5 fixed that completely — the isolation held, verified two ways — and then failed on a
different clause, in the design rather than in the execution.

## What was measured

18 builds, 6 per arm, assignment sealed and committed (`fcd957c`, `448f1a3`) before the first
build started.

| | arm | n | primary mean (of 16) | sd | builds |
|---|---|---|---|---|---|
| **A** | `compose_build_prompt` only | 6 | **9.33** | 1.37 | 8, 9, 9, 12, 9, 9 |
| **B1** | the §13 one-liner tools | 6 | 6.50 | 0.84 | 6, 7, 6, 6, 8, 6 |
| **B2** | full local surface **minus** the composer | 6 | **14.50** | 1.38 | 14, 16, 15, 15, 15, 12 |

Primary, A − B2: **Δ = −5.17**, Welch 95% CI **[−6.93, −3.40]**, df 10.0, δ = ±2.0 fixed before
any build. On §6's ordered rule that is branch 2 — **DELETE (inferior)**.

A > B1 by 2.83 [1.33, 4.33], so the fixture discriminates: the manipulation check passed.

## Why the round is invalid anyway

§5 declares eight controls "reachable by all arms" and states that a material difference on them
"means the arms were not identical outside the tool restriction, and invalidates the round."

    controls (of 8)   A 3.83   B1 7.50   B2 6.83     A−B2 CI [−5.34, −0.66]

The trigger fired. No numeric threshold for "material" was pre-registered, but a 3-point spread
whose interval excludes zero is material under any ordinary reading.

**I proposed reading this as a mis-specified control set rather than a confounded round**, on the
grounds that three of the eight controls demand `DESIGN.md` content arm A structurally cannot
obtain: C3 wants the exact type ramp {12,13,15,19,26}, C4 the seven exact `ds-*` names, C2 the
`recessed` token name — and `compose_build_prompt` emits token *names* but never *values*. Under
that reading the controls are additional discriminating checks, A loses on those too, and DELETE
stands as a real verdict.

**A cold falsification pass (GPT-5.6-Sol, report-only) refuted that, and it is right.** Converting
controls into endpoints after seeing how the arms scored on them is outcome-dependent relabeling.
It is the reading that produces a decision instead of a second invalid round, which is exactly why
it cannot be trusted. Mis-specification is grounds for redesigning a round 6; it is not grounds for
amending round 5 after the results were known.

The check that settles it is one Sol asked for, and it goes against me. Classifying the controls by
what each one *reads* — not by how the arms scored — five are genuinely arm-neutral craft checks
(C1 no colour literals, C5 filter controls carry text, C6 no row entrance animation, C7 no row
transition, C8 44×44 targets), needing no `DESIGN.md` content from anyone:

    arm-neutral controls (of 5)   A 3.00   B1 4.50   B2 4.67

Arm A is worse there too. So the control gap is **not** fully explained by mis-specification. At
n = 6 a general execution-quality difference cannot be excluded, and §5 exists precisely to refuse
the round when it cannot be excluded. Invalid is the honest status.

## What can still be said

- **No reading of this data has arm A passing §13.** If the round is valid, branch 2 deletes. If
  §5 applies literally, invalid — and invalid is not a pass. If every control is treated as
  discriminating, A is worse still. Sol returned REFUTED on the question of whether any reading
  produces a pass.
- **The result is robust to the obvious sensitivity checks.** Dropping arm A's best build:
  Δ = −5.70 [−7.15, −4.25]. Dropping B2's worst: Δ = −5.67 [−7.15, −4.18]. Both widen the gap.
- **The isolation worked.** 0 out-of-arm reads across all 18 transcripts (910 tool-use nodes
  parsed). The checker was positive-controlled — a planted store read and a planted cross-build
  read were both caught — and confirmed not to flag legitimate shim calls. No leak outlier against
  the answer key and no build-vs-build outlier at >3sd. The defect that ended round 4 did not recur.
- **S1 — the "raises the floor" hypothesis is not supported.** F = 1.02, 90% CI [0.20, 5.14].
  Arm A's sds are indistinguishable from B2's. Round 4's hint that the composer's value might be
  consistency rather than quality does not survive a round where the arms were actually isolated.
- **S2 — worst build:** min(A) 8, min(B1) 6, min(B2) 12, of 16.

## Two product findings, independent of the verdict

1. **`compose_build_prompt` crashes on the path it tells callers to take.** A skeleton node missing
   `archetype` passes lint and then dies in the renderer on `.toLowerCase()` of undefined. Two
   arm-A builds lost the second-call pass to it, one after roughly twenty attempts at a
   lint-passing skeleton. Sol independently confirmed this counts as a tool defect rather than a
   harness artifact. Written up with a probe table and a named fix in
   `FINDING-skeleton-archetype-crash.md`; deliberately **not** applied, because the composer is
   this round's independent variable and all 18 builds had to run against one tool.
2. **The composer never emits token values.** It cites `DESIGN.md` as its grounding, lists token
   and CSS-var names, says "no hex, no px" — and cannot hand over what `--color-surface-base`
   actually is. An agent holding only the composer has to invent `#101215`. Both detailed arm-A
   builds did, and said so. This is a contract question the experiment surfaces but does not
   settle: is the composer meant to be sufficient alone, or always called alongside
   `read_design_md`? §13's premise, and this round's arm A, assume the former.

## The methodological problem worth naming

§5's premise is that arms differing only in tools should not differ on controls. When the treatment
*is* how much information a tool hands over, that premise may be incoherent: any check the
information touches is treatment-dependent, and general execution quality is itself downstream of
prompt quality. On this design a true control may not exist. Two rounds have now failed for
different reasons — round 4 on execution, round 5 on design — while the exploratory answer has
pointed the same way both times.

That makes "run a round 6" a real question rather than an obvious next step, and it is Andrew's
call, not mine. The three options are: accept the exploratory evidence and act on §13 without a
certified round; design a round 6 around a control set that can survive an information-asymmetric
treatment; or rewrite §13, since what it asks to be demonstrated may not be constructible in this
form.

**Nothing has been deleted.** `compose_build_prompt` ships unchanged, and the skeleton-lint fix is
queued behind this verdict.
