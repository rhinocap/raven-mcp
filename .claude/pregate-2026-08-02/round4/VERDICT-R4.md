# Round 4 — verdict

**The round does not support a verdict on §13.** The pre-registered arithmetic returns
INCONCLUSIVE, but a validity precondition failed: **the arms were never isolated.** All six
arm-A builds read `arena/DESIGN.md` off disk, and four of six B1 builds read the Decision
Graph directly. Arm A is therefore not "the composed prompt"; it is "the composed prompt
plus the design system". The contrast the round was built to measure did not exist.

That is my error, not the builders'. It is written up below rather than smoothed over.

This replaces an earlier draft of this file that reported INCONCLUSIVE as the result and
called it robust. A GPT-5.6-Sol report-only falsification pass raised nine objections; three
were fatal and are sustained. The re-check those objections prompted is what found the arm
breach.

---

## 1. What invalidates the round

`arm-integrity2.mjs` (written after the falsification pass) asks the question the original
integrity script never did: did a builder simply **read the fixture files from the shell**,
rather than through the tool shim? The original checked MCP `tool_use` blocks and
`raven-cli.mjs` invocations only.

| arm | builds that read fixture material outside their arm |
|---|---|
| **A** | **6 of 6** — every one read `arena/DESIGN.md`; b01 and b07 also read `.raven/decisions/nodes.json` |
| **B1** | **4 of 6** — b12, b16, b17 read `nodes.json`; b10 enumerated and sized it |
| B2 | 0 of 6 out of arm (B2 holds the full surface, so a direct read is redundant with what it could already fetch) |

**The ground rules permitted it.** `make-prompts.mjs:65-71` says *"Do not read anything under
this round's directory other than what you are pointed at above"*, and names only
`fixtures/`, `measure.mjs`, `PREREGISTRATION.md`, and other `builds/` directories. Arm A's
own composed prompt points at the file, on line 3:

> Grounded in: `…/round4/arena/DESIGN.md` (resolved via default) · taste `kettle/…`

So the composer cited the path, and the rules said material you are pointed at is fair game.
Six independent builders did the obvious thing. `PREREGISTRATION.md:22-23` claims the
information block is the only difference between arms; in practice it was not.

**What this does and does not contaminate.** `DESIGN.md` carries the tokens and the
seven-component inventory but **not** the taste decisions — the pill rule and the undo-copy
rule live in `taste/kettle.decisions.json`, which no arm-A build read. So the T2/T3 results
are not explained by the breach. Everything resting on tokens, component names, and
structure is contaminated, which is most of the D and C blocks.

I am not re-analysing around it. Dropping the affected checks after seeing the scores is
exactly the laundering the pre-registration exists to prevent.

---

## 2. The pre-registered arithmetic, reported for the record only

It is arithmetically correct and it does not bear on §13, because the arms it compares were
not the arms that were specified.

| arm | n | mean | sd | scores |
|---|---|---|---|---|
| A | 6 | 10.83 | 0.41 | 11, 11, 11, 10, 11, 11 |
| B2 | 6 | 9.67 | 3.27 | 6, 12, 12, 12, 5, 11 |
| B1 | 6 | 9.33 | 1.86 | 10, 10, 11, 7, 7, 11 |

A vs B2: Δ = +1.17, Welch 95% CI **[−2.26, +4.59]**, se 1.344, df 5.16 → straddles 0, wider
than δ = ±1.5 → INCONCLUSIVE. A vs B1: Δ = +1.50, CI [−0.45, +3.45].

Controls: A−B2 = −0.33 [−1.30, +0.64]; A−B1 = −0.50 [−1.51, +0.51]; largest spread 0.50 of
8. **No control difference was detected. That is not the same as equivalence** — the
pre-registration never set a control materiality bound, and at n = 6 the interval remains
compatible with a real 1.3-point gap (Sol, objection 6, sustained).

---

## 3. Disposition of the falsification pass

| # | severity | objection | disposition |
|---|---|---|---|
| 1 | MINOR | PASS and equivalence branches overlap; `analyze4.mjs` silently prefers PASS | **Sustained.** Did not bind — CI [−2.26, +4.59] hits neither. Round 5 must make the branches mutually exclusive. |
| 2 | FATAL | Arm A was the composer's *grounding half*, and its own text tells the builder to call `compose_build_prompt` again — which arm A had no tools to do | **Sustained, verified.** `ARM-A-PROMPT.md:2` reads: *"…call compose_build_prompt again with it as `skeleton` — this response is the grounding half only."* Arm A tested the grounding half presented to a builder who could not complete the second call. The no-skeleton choice was deliberate (a hand-authored skeleton would have measured my tree), but the consequence was not thought through. |
| 3 | FATAL | Provenance unverifiable | **Partly sustained.** `shasum -c SEAL-HASHES.txt`: `TASK.md`, `measure.mjs`, `ARM-A-PROMPT.md`, `SEALED-ASSIGNMENT-R4.md`, `raven-cli.mjs`, `compose4.mjs` all **OK** — the harness and prompt of record are provably unmodified. `PREREGISTRATION.md` **FAILED**, because three amendments were appended; the seal cannot distinguish an append from a rewrite of §5. `analyze4.mjs` was never sealed, so "written before any score was read" is an assertion. Nothing is committed — 81 files staged, no history. |
| 4 | MATERIAL | The composer-defect story contradicts the round's own pre-data traceability note | **Sustained.** `COMPOSED-PROMPT.md:79-102` graded all 13 checks reachable and concluded *"the endpoint measures the composer, not a hole in it."* The earlier draft of this file claimed the 0/6 results **confirmed a prediction**. They did the opposite: they **falsified my pre-round judgement**, which had counted inference-from-a-rejection as reachability for 9 of 13 checks. Corrected in §4 below. |
| 5 | MATERIAL | "T3 is valid" is false, and `posthoc-t2.mjs` changed more than the stated predicate | **Sustained.** `measure.mjs:387` accepts `"3 items. Undo"` — it enforces neither past tense nor the no-"items" rule that `PREREGISTRATION.md:79` claims for it. And `posthoc-t2.mjs` used a broader `[class*="pill"]` selector than `measure.mjs`. Sol's own rescoring: dropping T3 → Δ = 1.83, CI [−1.05, +4.72]; corrected T2 with tolerant T3 → Δ = 1.17. Neither reaches PASS. |
| 6 | MATERIAL | Controls do not establish arm equivalence | **Sustained.** Wording corrected in §2. |
| 7 | MATERIAL | The arms differed in workflow, not just information block | **Sustained, and it is worse than stated** — see §1. |
| 8 | FATAL | The integrity scripts can report "no breach" for breaches they cannot see | **Sustained, and it caught a real one.** Two sub-claims tested separately: the `mcp__claude_ai_Raven_MCP__*` namespace gap is **real but unexercised** — a rescan for `tool_use` blocks in *any* `mcp__` namespace returns **zero across all 18 builds**. The shell-read gap is **real and was exercised**: it is how §1 was found. |
| 9 | MATERIAL | Operational assertions lack durable artifacts | **Sustained.** `STORE-BASELINE.txt` holds one unlabelled hash set; the before/mid/after comparisons were run in-session and not captured. `/tmp/r4-scores.json` and `/tmp/r4-analysis.txt` are unsealed and live in `/tmp`. |

Sol's own bottom line — *"INCONCLUSIVE arithmetic holds, but treatment fidelity, sealing,
controls, integrity, and the composer-causality claim do not"* — is accepted.

---

## 4. What survives, stated at its real strength

**A narrow, verified code defect.** `src/reference-prompt.ts:914-921` emits only
`alternatives_rejected` plus `rationale`. There is no field for a decision's chosen
position, and `if (active[ad].alternatives_rejected.length === 0) continue;` drops any
active decision that has no rejected alternatives. Both are true by reading, independent of
this round.

**Suggestive but uncontrolled evidence that it costs something.** No arm-A build drew the
specified 1px signal-hue pill border (0/6, `posthoc-t2.mjs`), and none produced the undo
copy's terminal period (0/6) — both facts live only in the taste decisions, which arm A's
prompt carried as rejections and which no arm-A build read directly. B1, reading
`DESIGN.md` and the profile, got the pill right 6/6. That is consistent with the defect
mattering. It is **not** a controlled result, because the arms were broken, no
chosen-position ablation was run, and my own pre-round note had predicted these checks
would be reachable.

**Clean sub-results.** The fixture store hashed identically before, mid-round, and after
all 18 builds. No build is a >3sd lexical outlier against the answer key; both flagged
build-pairs share only the 12 seed rows handed to every builder in `TASK.md`. Zero MCP
tool_use blocks in any namespace. Four of six B2 builds reached for `compose_build_prompt`
and were refused in code — the arm restriction that *was* enforced in code held.

---

## 5. What round 5 has to do

1. **Isolate the arms mechanically.** Copy the fixture store outside the round tree, or run
   each builder in a worktree that contains only its own directory. Prose that says "don't
   read that" is not isolation, and the current ground rules did not even say it.
2. **Decide what arm A is.** Either drive the full two-call composer workflow (skeleton, then
   the composed prompt), or state plainly that `compose_build_prompt` has no single-call
   mode for a from-scratch build and test the grounding half on purpose.
3. **Seal the analysis too**, and commit the tree before the first build so the timeline is
   in git rather than in an assertion. Append amendments to a separate file so the
   pre-registration's own hash keeps verifying.
4. **Fix the harness before sealing**: T2's `unfilled` clause contradicts the decision it
   scores; T3 does not test the properties `PREREGISTRATION.md:79` claims for it.
5. **Make the decision branches mutually exclusive**, and pre-register the endpoint that
   matches the claim — if the claim is reliability rather than peak quality, six per arm
   cannot resolve it against an sd of 3.3.
6. **Fold the shell-read check into the integrity script** rather than leaving it post-hoc.

---

## 6. Open, and not mine to settle

`PREREGISTRATION.md:5` spends the probation clock on an inconclusive round: one more, then
delete. Round 4 was not inconclusive — it was **invalid, for a reason that has nothing to do
with the tool's performance**. Whether an invalid round burns a probation slot is not
specified, and it changes the stakes of round 5.

My recommendation: it should not. The failure was in my isolation design. But deciding that
myself, in a process built specifically to stop me from grading my own work, is the wrong
shape — so it goes to Andrew.

---

## Files

| file | role |
|---|---|
| `PREREGISTRATION.md` | the rule; **seal FAILS** (three amendments appended) |
| `SEAL-HASHES.txt` | 6 of 7 artifacts verify; `analyze4.mjs` was never sealed |
| `ARM-A-PROMPT.md` | the real `compose_build_prompt` output, seal **OK** |
| `measure.mjs` | harness of record, seal **OK**, unedited after the data |
| `analyze4.mjs` | analysis of record — unsealed, so its pre-data provenance is asserted |
| `arm-integrity.mjs` | original check — MCP and shim calls only; **missed the shell reads** |
| `arm-integrity2.mjs` | **post-hoc**, found the arm breach in §1 |
| `posthoc-t2.mjs` | **post-hoc**, T2 sensitivity; uses a broader selector than `measure.mjs` |
| `inspect-pair.mjs` | **post-hoc**, prints the shared substring behind a similarity flag |
| `/tmp/sol-r4-falsify.txt` | the falsification pass |
