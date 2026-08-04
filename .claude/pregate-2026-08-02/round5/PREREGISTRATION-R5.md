# §13 pre-gate — round 5 pre-registration

**Written before any build runs. Nothing below may be changed after the first builder starts.**
Amendments are appended with a timestamp and a reason, never edited in place.

Governing clause: `docs/spec-pattern-library.md` §13 "Falsification gate", as amended
2026-08-03. All four amending conditions bind.

---

## 0. Why there is a round 5

Round 4 did not return a weak result. It returned **no result**: `arm-integrity2.mjs` found
that all six arm-A builds read the fixture `DESIGN.md` off disk, because the composed prompt
cited that file's absolute path on its third line and the ground rules permitted reading what
the prompt pointed at. The contrast the round was built to measure — composed prompt versus
tools — did not exist in the six builds that were supposed to embody it. Round 4's own verdict
records this as invalidating, not as a caveat.

The failure was structural and it is worth naming precisely, because round 5's design is a
direct answer to it: **the B2 restriction lived in code and held across all eighteen builds;
the arm-A boundary lived in prose and broke six times out of six.** Everything below moves
a boundary out of prose and into the shim.

### What that means for the probation clock

Round 3 returned equivalence. Under §13 as written that fires the delete clause; Andrew's
call was to amend and re-run. Round 4 was that re-run and produced nothing measurable.

This document proceeds on the reading that **an invalid round is not a reprieve** — round 5
is round 4's replacement, not an extra life. Concretely: if round 5 returns INCONCLUSIVE, the
tool gets exactly one more round, and a second consecutive inconclusive fires the delete
clause. If round 5 returns equivalence or inferiority, the delete clause fires now. That is
the same bounded rule round 4 pre-registered, restarted rather than extended. Andrew may rule
otherwise; the question is flagged here rather than settled quietly in the tool's favour.

## 1. The three arms — all three are tool arms

Every arm receives `TASK.md` byte-identically and drives the same shim,
`raven-cli.mjs <arm> <tool> '<json>'`. The arms differ in exactly one thing: which tools the
shim will run.

- **A — composer only.** `compose_build_prompt`, and nothing else. Arm A executes the
  composer's real two-call workflow itself: one call for grounding, then a second passing the
  Structure/States skeleton it derives. In round 4 arm A was handed a pre-composed block of
  text and no tools at all, which meant it was told to make a second call it had no way to
  make, and meant the arms differed in workflow as well as in information. That confound is
  gone.
- **B1 — the literal §13 one-liner.** `read_design_md`, `get_taste_profile`, `audit_taste`.
- **B2 — the full local surface minus the composer.** Every registered tool except
  `compose_build_prompt`, including `decision_list`, `list_taste_decisions`, `decision_get`,
  `decision_history`, `inventory_design_system`, and `diff_design_system`.

**B2 is the deciding comparison. A > B1 is expected by construction** and is measured only as
a manipulation check on the fixture. Amended condition 2 is operative: **A must beat B2.** A
result where A beats B1 and ties B2 is a delete — it would mean the composer is a convenience
wrapper over tools the agent reaches unaided.

`verify-fixture5.mjs` asserts, and this is the assertion that makes the comparison fair, that
**every one of the sixteen discriminating facts is reachable by B2 through the raw tools.**
The round tests orchestration, not access.

## 2. Mechanical isolation — the four changes from round 4

1. **The fixture store lives outside the repository**, at a path that appears in no prompt.
   Round 4's arena sat inside the round directory, and is now public in git besides, which
   would make an in-repo round-5 fixture a fixture beside its own answer key.
   The store and the builders' **workspace are separate directories**, and only the workspace
   is ever named. The first cut of `make-prompts5.mjs` put the shim and the eighteen build
   directories *inside* the store, so every prompt disclosed the store's path on its own tool
   invocation line — round 4's defect rebuilt one directory over. What sits in the workspace
   now is a two-line stub that forwards into the round's harness directory; the store's path
   is written down once, behind a boundary `arm-integrity5.mjs` treats as invalidating, so
   there is no route to it that is not also a detected one. `make-prompts5.mjs` greps all
   eighteen generated prompts for the store path and exits non-zero if one contains it.
2. **Every absolute path is redacted from every tool result, in every arm, uniformly.** Both
   raw and JSON-escaped forms, plus the home prefix. Content is untouched — what a tool
   *returns* is returned in full; only the location of files on disk is removed. Verified by
   sweep: 11 arm/tool combinations, all non-empty, zero absolute paths in any output.
3. **Path arguments are injected from the tool's own zod schema**, not from a hand-maintained
   list, so no builder ever needs — or learns — a path, and no tool silently receives nothing.
   The hand-maintained version of this had already produced one silently-broken B1 tool during
   harness development; that is precisely the class of bug that skews an arm.
4. **The round-4 ENOENT asymmetry is removed.** `inventory_design_system` and
   `diff_design_system` throw on a project with no configured source while the composer
   catches and falls back; round 4 disclosed this as favouring arm A and left it in. Injecting
   `design_file_path` removes the handicap.

Ground rules in `TASK.md` still prohibit filesystem exploration for design material, reading
another build's directory, and reading anything under a `pregate` directory. Those are prose,
and prose is exactly what failed in round 4 — which is why they are now the *second* line of
defence rather than the only one, and why `arm-integrity5.mjs` audits every transcript for
reads outside the build directory regardless.

## 3. Sample size, and what it can and cannot detect

**n = 6 per arm, 18 builds.** Stated in advance:

At n = 6/arm on a 0–16 scale, the 95% CI half-width on an arm difference is
`t(≈10) × sd × sqrt(2/6) ≈ 1.29 × sd`. At an anticipated sd of 2.0 that is **±2.6 points of
16**. This design resolves a large A-vs-B2 difference and cannot resolve a small one. §5's
inconclusive branch is a real outcome, not a formality.

## 4. Primary endpoint — 16 discriminating conformance checks

Score = count passed, 0–16. Each check turns on a fact that exists **only** in the Decision
Graph or in `list_taste_decisions` — verified absent from `DESIGN.md`, the rule catalog, and
the surface binding by `verify-fixture5.mjs`, which greps for paraphrase as well as quotation.

From the **Decision Graph** (11):

| id | check | source |
|---|---|---|
| D1 | reconcile bar follows the last row in document order *and* sits at or below its bottom edge | `bar_below` |
| D2 | the selected rows are gone after the bulk action, with no dialog and no second step | `no_confirm` |
| D3 | a visible report of the action appears afterwards | `no_confirm` |
| D4 | a numbered pager exists, no load-more control, and scrolling appends nothing | `paginate` |
| D5 | a chip selection is still active after changing page | `filter_persists` |
| D6 | two chips are simultaneously active | `filter_multi` |
| D7 | negative amounts are ink-primary, leading minus, never parenthesised | `negative_ink` |
| D8 | row height identical resting / hovered / selected (±1px) | `row_height_stable` |
| D9 | header control reports `indeterminate` or `aria-checked="mixed"` on a partial selection | `header_tristate` |
| D10 | no marker carries `title`, `aria-describedby`, or a nested tooltip | `marker_no_tooltip` |
| D11 | `NOTES.md` → **Open questions** names the unmatched-entry label as unresolved | `break_label` (contested) |

From **`list_taste_decisions`** (5):

| id | check | source |
|---|---|---|
| T1 | marker is a 4–10px filled shape in a signal hue carrying no text of its own | `color` |
| T2 | batch note text matches `/^Undo\s*[—–-]\s*\d+\s+reconciled$/i` — affordance first | `content` |
| T3 | note still present and unchanged after 9.5s, with no animating width/transform | `motion` |
| T4 | total footer bottom is within 4px of the viewport bottom, before and after a scroll | `layout` |
| T5 | amount cell's right edge is 56px from the row's right edge, identical on every row | `spacing` |

**Two of these deliberately invert round 4's answers.** The marker is a filled dot where round
4 wanted an outlined pill, and the batch note leads with the affordance where round 4 led with
the count. Round 4's material is public in this repository; a builder who found it would be
misled by it, not helped.

**D11 is the sharpest check.** `decision_list` with no `status` returns only active decisions
— asserted directly in `verify-fixture5.mjs`, which confirms the contested statement is absent
from the default call and present under `status: "contested"`. B2 reaches it only by asking
for contested decisions explicitly; arm A gets it only if the composer surfaces it.

**T5 measures the invariant, not the number.** `--space-column` is legitimately 56px, so a
build could hit the number by picking a token at random. What cannot be hit by luck is that
the gap is *identical on every row* — the check requires max−min ≤ 1px across all rows as well
as the value.

## 5. Controls — manipulation check, not part of the decision rule

Eight checks reachable by **all** arms from `DESIGN.md` + `get_taste_profile`:

C1 tokens-only (the `:root` declaration block excluded — a token definition is necessarily
literal) · C2 hover uses `--surface-recessed`, not `--surface-raised` · C3 every computed
font-size ∈ {12,13,15,19,26} and row text = 13 · C4 all seven `ds-*` names present, no
`Table|Grid|Chip|Toast|Modal|Snackbar` · C5 every filter control carries text · C6 no row
entrance animation · C7 no non-zero-duration transition on the row background · C8 every
interactive rect ≥ 44×44.

**These should not differ between arms.** A material control difference means the arms were
not identical outside the tool restriction, and invalidates the round. Reported alongside the
primary, never merged into it.

## 6. Decision rule — equivalence is tested first

Let `Δ = mean(A) − mean(B2)` on the primary, with a Welch–Satterthwaite 95% CI (df computed,
never assumed). **Branches are evaluated in this order, and the first match decides.** Round 4's
`analyze4.mjs` returned PASS before it ever tested equivalence, so an interval that satisfied
both would silently report the outcome favourable to the tool; ordering makes the branches
mutually exclusive.

| order | outcome | condition | consequence |
|---|---|---|---|
| 1 | **DELETE (equivalence)** | CI wholly within ±δ | "No better" — the original clause fires. Drop `compose_build_prompt` from the spec. |
| 2 | **DELETE (inferior)** | CI upper bound < 0 | A is worse than B2. Delete. |
| 3 | **PASS** | CI lower bound > 0 | A beats B2 by more than δ. §13 satisfied. The composer stays and is built out. |
| 4 | **INCONCLUSIVE** | anything else | Neither superiority nor equivalence shown. **Not a pass.** See §0 for the clock. |

An interval like [0.5, 1.5] with δ = 2 satisfies both branch 1 and branch 3. Under this
ordering it is a **delete**: a difference smaller than δ is statistically detectable and
practically negligible, which is exactly what §13's "no better" clause is about.

Reported alongside, deciding nothing: `A − B1` (fixture manipulation check), the per-check
pass matrix for all 24 checks, and the control comparison.

## 7. δ, fixed before any build

Amended condition 3. δ is set from the harness's **demonstrated** range, after validation and
before any build:

```
fixtures/conformant   primary 16/16   control 8/8
fixtures/defective    primary  0/16   control 0/8
```

Both exact. `δ = 0.15 × 16 = 2.4`, **rounded down to δ = ±2.0 points**. Recorded here as a
number before any build so it cannot be chosen to fit a result.

## 8. Secondary endpoints — pre-registered so they are not post-hoc

Round 4's arms, invalid as they were, hinted that the composer's value might be a **floor**
rather than a ceiling: arm A's sd was 0.41 against B2's 3.27. That is a different claim from
"higher mean", and testing it after seeing round 5's data would be fishing. So it is registered
now, and it **decides nothing** — §13 is decided by §6 alone.

- **S1 — variance ratio.** `F = sd(B2)² / sd(A)²` with a two-sided 90% F interval on
  (5, 5) df. A ratio significantly above 1 supports "the composer raises the floor".
- **S2 — worst build.** `min(A)` vs `min(B2)`, reported as raw numbers with no test attached
  — at n = 6 a minimum carries no inferential weight, and pretending otherwise would be worse
  than reporting it plainly.

If §6 returns a delete and S1 is strongly positive, that is a real finding and goes in the
verdict as one: it would mean the composer's benefit is consistency, which is not what §13
asks about, and would be an argument for re-writing §13 rather than for keeping the tool.

## 9. Deliberate omissions

- **No blind judge panel.** Round 2 measured this judge's test-retest correlation on
  byte-identical artifacts at r ≈ 0; round 3's judge endpoint returned equivalence with 74.6%
  of variance in the residual. It carries too little information to justify the agents.
- **No human forced-choice anchor.** Round 3 established its power at 21% against a true 80/20
  preference. Available if Andrew wants a taste read; it decides nothing.

## 10. Residual isolation risk, stated rather than implied

Honesty about what is still prose rather than code:

- **A builder could still, in principle, search the filesystem for the store.** The path is
  undisclosed and redacted, not permission-blocked. `arm-integrity5.mjs` audits every
  transcript for reads outside the build directory and any round with a breach is reported as
  invalid, exactly as round 4 was. Detection, not prevention.
- **Two `cat`s away, both of them detected.** The workspace stub names the harness directory,
  and the harness's `raven-cli.mjs` names the store. So a builder that reads its own stub
  learns where to look next — and looking there is a forbidden read that the integrity audit
  reports. The claim being made is not "unreachable"; it is "not handed over, and not
  reachable without leaving a mark".
- **Arm A's workflow is not separable from the composer.** Arm A's prompt says only *"call
  `compose_build_prompt` and follow what it gives you"* — the two-call instruction comes from
  the composer's own grounding response, which is deliberate, since putting it in the prompt
  would confound in prose as well as in the tool. But the confound is not removed by that,
  only moved: if arm A wins, "the composer helped" and "a two-pass workflow helped" are still
  not separated by this design. Recorded now so it cannot be discovered as a convenient
  explanation later.
- **The couplings D3→T3 and D4→D5 are structural**, established by the mutation matrix: a
  build with no visible batch note cannot demonstrate persistence, and a build with no pager
  has no mechanism through which filter persistence can be observed. The primary is 16 checks,
  not 16 independent bits.

## 11. Order of operations

1. Composer fix + tests — done (`b6e81a4`; chosen positions now reach the prompt).
2. Fixture store seeded through registered tools; `verify-fixture5.mjs` passes.
3. `measure5.mjs` validated: conformant 16/16 + 8/8, defective 0/16 + 0/8 — both exact.
4. Mutation matrix: 24 single-defect mutants, **24/24 flip their own check**, no co-flips
   outside the two declared couplings.
5. Seal assignment and hash every harness file **including `analyze5.mjs`**.
6. **Commit to git before the first build.**
7. Run 18 builds.
8. Measure → arm integrity → leak check → `analyze5.mjs` → falsification pass → `VERDICT-R5.md`.

Steps 1–6 must complete before step 7 begins. No build result may be seen before step 5 is
sealed.
