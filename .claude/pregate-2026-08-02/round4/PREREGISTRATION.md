# §13 pre-gate — round 4 pre-registration

**Written before any build runs. Nothing below may be changed after the first builder starts.**
Amendments, if any, are appended with a timestamp and a reason, never edited in place.

Governing clause: `docs/spec-pattern-library.md` §13 "Falsification gate", as amended
2026-08-03. The original clause and the four amending conditions are both binding.

---

## 0. Why there is a round 4 at all

Round 3 returned equivalence on both pre-registered endpoints. Under §13 as originally
written that fires the delete clause. Andrew's call was to amend the clause first and
re-run on a harder task, leaving the tool alive and on probation. Round 3's failure mode
was diagnosed, not hand-waved: the snackbar task was one an Opus-class agent knows cold,
so every arm ceilinged and the endpoints could not discriminate. Amended condition 1
exists to stop that recurring.

## 1. The three arms

All arms receive `TASK.md` verbatim. They differ **only** in the information block that
precedes it.

- **A — composed.** The prompt produced by executing the composition algorithm in §13's
  spec. `compose_build_prompt` is not built, so the prompt is derived by a separate agent
  executing the spec against the round-4 stores, before arm assignment. Round 3 established
  that this derivation reproduces byte-identical on an independent re-run; that check is
  repeated here and recorded in `COMPOSED-PROMPT.md` with its hash.
- **B1 — the literal §13 one-liner.** Verbatim: *"Call `read_design_md`, `get_taste_profile`
  and `audit_taste` yourself, then do the task."*
- **B2 — the generous one-liner.** *"A Raven MCP server is connected with the full local
  tool surface, including the design system, the taste profile and its bindings, per-project
  taste decisions, and the project's Decision Graph. Use whatever you need, then do the task."*

**B2 is the deciding comparison, and A > B1 is expected by construction.** The primary
endpoint is built from facts reachable only outside B1's three tools, so a positive A−B1
would confirm little beyond "the fixture is wired correctly". It is measured anyway, as a
manipulation check on the fixture. Amended condition 2 is the operative rule: **A must beat
B2.** If A beats B1 but ties B2, the composer is a convenience wrapper over tools the agent
would have reached unaided, and that is a delete on different grounds.

## 2. Sample size, and what it can and cannot detect

**n = 6 per arm, 18 builds.** Stated in advance rather than discovered afterwards:

At n = 6/arm on a 0–13 scale, the 95% CI half-width on an arm difference is
`t(10) × sd × sqrt(2/6) ≈ 1.29 × sd`. At an anticipated sd of 1.5 that is **±1.9 points of
13**. This design can resolve a large A-vs-B2 difference and cannot resolve a small one.
Round 2's error was calling a null "parity"; the guard against repeating it is §5's explicit
inconclusive branch, which is a real outcome here and not a formality.

## 3. Primary endpoint — 13 discriminating conformance checks

Each check is a deterministic Playwright assertion (or, for D8, a regex over `NOTES.md`).
Score = count passed, 0–13. **Every one of these turns on a fact that exists only in the
Decision Graph or in `list_taste_decisions`** — verified absent from `DESIGN.md`, the rule
catalog, and the surface binding by the leak check in `verify-fixture.mjs`.

From the **Decision Graph** (8):

| id | check | source |
|---|---|---|
| D1 | `.ds-action-rail` computed `position` ∈ {static, relative}; its box top is above the first row | `dec_rail_position` |
| D2 | Destructive bulk action applies with no `<dialog>` / `[role=dialog]` / `[role=alertdialog]` appearing, rows change within 500ms | `dec_no_confirm_modal` |
| D3 | `.ds-undo-strip` is present and visible after that action | `dec_no_confirm_modal` |
| D4 | `.ds-load-more` is a real button; scrolling to the bottom without clicking it appends no rows | `dec_load_more` |
| D5 | Three rows selected on page 1 remain selected after `.ds-load-more`; appended rows arrive unselected | `dec_selection_persists` |
| D6 | `.ds-action-rail` precedes the first `.ds-queue-row` in document order | `dec_rail_before_list` |
| D7 | With some-but-not-all rows selected, the header control reports `indeterminate === true` or `aria-checked="mixed"` | `dec_indeterminate_header` |
| D8 | `NOTES.md` → **Open questions** names the destructive action's label as unresolved | `dec_destructive_label` |

From **`list_taste_decisions`** (5):

| id | check | source |
|---|---|---|
| T1 | `.ds-action-rail` height and the first row's `top` are unchanged (±1px) between idle and armed | `dec_1` |
| T2 | `.ds-status-pill` background is transparent or equals its parent's; border ≥ 1px in a signal hue | `dec_2` |
| T3 | Undo strip text matches `/^\d+ \w+\. Undo$/` — count first, past tense, no "you", no "items" | `dec_3` |
| T4 | Undo strip shows no countdown (no animating width/transform, no changing digit) and disappears between 7.5s and 8.5s | `dec_4` |
| T5 | The x of the row's first text content is identical (±1px) across resting, hovered, and selected rows | `dec_5` |

**D8 is the sharpest check and deserves naming.** `decision_list` with no `status` calls
`listActiveDecisions()` (src/index.ts:7011) and cannot return a contested decision;
`include_candidates` adds candidates, not contested. Verified by direct assertion in
`verify-fixture.mjs`, not assumed. So B2 reaches the contested label only by explicitly
passing `status: "contested"`, or by `decision_get`/`decision_history` on an id it has no
reason to know. Arm A gets it if and only if the composition algorithm asks for it.

**T5 measures the stability property, not the number.** `--space-slack` is legitimately
40px, so a build could hit "40px gutter" by picking a token at random. The invariant that
cannot be hit by luck is that the text edge does not move.

## 4. Controls — manipulation check, not part of the decision rule

Eight checks reachable by **all** arms from `DESIGN.md` + `get_taste_profile` (which returns
bindings — confirmed at src/index.ts:7335, so `design_notes` and `voice_note` are *not*
discriminators):

C1 tokens-only · C2 hover uses `--surface-recessed` not `--surface-raised` · C3 every
computed font-size ∈ {13,14,16,20,28} and row text = 13 · C4 all seven `ds-*` names present,
no `Checkbox|Toolbar|Toast|Badge|Snackbar` · C5 every pill carries text · C6 no row entrance
animation · C7 no transition on the row's selected background · C8 every clickable rect
≥ 44×44.

**These should not differ between arms.** A material control difference means the arms were
not identical outside the information block, and invalidates the round — the same way round 2
was invalidated. Reported with the primary, never merged into it.

## 5. Decision rule

Let `Δ = mean(A) − mean(B2)` on the primary, with a Welch 95% CI computed by `tstat.mjs`
(the round-3 falsification pass killed hardcoded critical values; df is computed, not assumed).

| Outcome | Condition | Consequence |
|---|---|---|
| **PASS** | CI lower bound > 0 | A beats B2. §13 is satisfied. The composer is built. |
| **DELETE (equivalence)** | CI wholly within ±δ | "No better" — the original clause fires. Drop `compose_build_prompt` from the spec. |
| **DELETE (inferior)** | CI upper bound < 0 | A is worse than B2. Delete. |
| **INCONCLUSIVE** | CI straddles 0 and is not contained in ±δ | Neither superiority nor equivalence shown. **Not a pass.** See below. |

**The inconclusive branch is bounded, so it cannot become a permanent reprieve.** If round 4
returns inconclusive, the tool stays on probation for exactly one more round. A second
consecutive inconclusive result fires the delete clause: a tool that cannot be shown to help
after four attempts to show it is not earning its place in the spec.

Reported alongside, not deciding: `A − B1` (fixture manipulation check), the per-check
pass matrix for all 21 checks, and the control comparison.

## 6. δ is set from the harness's demonstrated range, not its nominal scale

Amended condition 3. Round 3's δ = ±8 was set on a nominal 0–100 scale and turned out to be
145% of the realised between-build range, which made the equivalence result true but nearly
vacuous. Round 4 fixes δ *after* harness validation and *before* any build:

1. `measure.mjs` is run against two fixtures written for the purpose:
   - `fixtures/conformant/` — deliberately satisfies all 21 checks. Must score **21/21**.
   - `fixtures/defective/` — deliberately violates every one. Must score **0/21**.
2. If either fixture does not hit its target exactly, the harness is broken and is fixed
   before anything else happens. A harness that cannot fail cannot measure.
3. `δ = 0.15 × (demonstrated range) = 0.15 × 13 = 1.95`, **rounded down to δ = ±1.5 points**.
   Recorded here as a number, before any build, so it is not chosen to fit a result.

Both fixture scores are reported in the verdict whatever they are.

## 7. Deliberate omissions, stated rather than quietly dropped

- **No blind judge panel.** Round 2 measured this judge's test-retest correlation on
  byte-identical artifacts at r ≈ 0, and round 3's judge endpoint returned equivalence with
  74.6% of variance in the residual. It carries too little information to justify 54 agents.
  This round is decided on the deterministic endpoint alone.
- **No `inventory_design_system` / `diff_design_system` leg**, which amended condition 1
  mentions. `read_design_md` already returns the full component inventory and its canonical
  states from the frontmatter, so an inventory tool adds nothing B1 cannot already reach, and
  a `diff_design_system` leg would need an external configured source built solely to create
  a difference. It would be a manufactured discriminator, not a real one. Recorded as a
  deviation from the amendment.
- **No human forced-choice anchor.** Round 3 established its power at 21% against a true
  80/20 preference. It is available if Andrew wants a taste read; it decides nothing.

## 8. Order of operations

1. Fixture verification — **done**, `verify-fixture.mjs` reports FIXTURE OK (23 assertions
   plus a 12-item leak check).
2. Write `measure.mjs` and both validation fixtures. Validate. Record both scores.
3. Derive arm A's composed prompt; verify byte-identical on re-run; hash it.
4. Seal arm assignment to `SEALED-ASSIGNMENT-R4.md`.
5. Run 18 builds.
6. Measure. Analyse with `tstat.mjs`. Write `VERDICT-R4.md`.
7. Falsification pass over the analysis before it reaches Andrew.

Steps 2–4 must all complete before step 5 begins. No build result may be seen before step 4
is sealed.

---

## Amendment 1 — 2026-08-03, harness validation results

Appended, not edited in place, per this document's own rule. **No build has been run and no
arm result has been seen.** Everything below is measured on purpose-built fixtures.

### Validation (§6 step 1–2)

```
fixtures/conformant   primary 13/13   control 8/8
fixtures/defective    primary  0/13   control 0/8
```

Both exact, first run. δ stands at **±1.5** on the demonstrated 13-point range.

### Mutation matrix — because 21/21 on a reference implementation proves almost nothing

A harness that scores its own reference build 21/21 has only shown that it agrees with the
thing it was written alongside. So each of the 18 checks got a single-defect mutant of the
conformant fixture, and the requirement was that **exactly one check flips**.

16 of 18 flipped exactly one check. The two that did not were both informative:

1. **A real harness bug, found by a mutation that did nothing.** Setting `hidden` on the undo
   strip changed no measured behaviour, because `.ds-undo-strip { display: flex }` beats the
   UA's `[hidden] { display: none }`. Chasing that down showed **D3 was checking height and
   `display` but not opacity** — so a build whose undo strip existed in the layout and never
   faded in would have scored the point. D3 now requires `opacity > 0.05` and
   `visibility !== hidden`, matching the T4 probe. Re-run with a correct mutant: D3 flips.
2. **A malformed mutant**, which moved `#queue` after the script and broke the page outright
   (1/13). Redone properly by relocating the rail markup: flips D1 and D6, see below.

Also patched pre-data: **D8** now accepts a bolded `**Open questions**` as well as a `#`
heading. `TASK.md` prescribes the heading, but losing the point on markdown formatting would
measure compliance with a formatting instruction rather than whether the contested decision
was surfaced.

An unmutated control was re-measured after both patches: still 13/13 + 8/8.

### Two known couplings — the primary is 13 checks, not 13 independent bits

- **D3 → T4.** With no visible undo strip there is nothing to time, so T4 is unassessable and
  scores 0. A build that omits the strip loses both.
- **D6 → D1.** In normal flow, putting the rail after the list in document order also puts it
  below the list visually, so both the order check and the position check fail together.

Neither is a defect; both are real properties of what is being measured. They are recorded
here so the verdict does not describe the score as 13 independent observations, and so a
two-point gap on either pair is not read as two separate findings.

### Files

`measure.mjs` · `fixtures/conformant/{index.html,NOTES.md}` ·
`fixtures/defective/{index.html,NOTES.md}` · `verify-fixture.mjs`

---

## Amendment 2 — 2026-08-03, arm A is the real tool's output

Still pre-data: no build has run, no arm has been assigned.

**§1 said arm A's prompt would be "derived by a separate agent executing the spec against
the round-4 stores." That is superseded, in the tool's favour.** `compose_build_prompt` is
built — `src/reference-prompt.ts`, registered at `src/index.ts:2943` — so arm A is the
composer's actual output, not a human-or-agent reconstruction of what it would emit. This
removes the largest soft spot in the design: rounds 1–3 could always be answered with "you
graded your own paraphrase of the tool." Round 4 cannot.

`compose4.mjs` calls it against the fixture stores. Determinism re-checked as §1 required:
three independent runs, one hash, `9861b70f…`. Recorded in `COMPOSED-PROMPT.md`.

**Called without a `skeleton`, deliberately.** Round 4 copies no reference, so the
grounding-half branch is the honest one and `skeleton_required` comes back `true`. Giving
arm A a hand-authored structure tree the other arms cannot have would measure the tree.

### One composer property, found while checking and recorded before any data exists

The composed prompt **never states a decision's chosen position** — only its rejected
alternatives and its rationale (`src/reference-prompt.ts:920-921`), and it **skips any
active decision whose `alternatives_rejected[]` is empty**. This is a §9 template gap, not
an implementation slip: there is no output section for a chosen position, and on the
no-skeleton branch Structure/States do not exist.

Two things follow, and neither is a reason to hold the round:

- **Nothing is dropped in this fixture** — checked, not assumed: all six active decisions
  carry 2–3 rejected alternatives.
- **All 13 primary checks are reachable from arm A's text** — verified line by line in
  `COMPOSED-PROMPT.md`'s traceability table before the round, precisely so that a low arm-A
  score cannot later be waved away as an unreachable endpoint. Four checks are stated
  outright (the rail's position, the 8s dismissal, the 40px gutter, the contested label);
  the other nine are carried by a rejection whose rationale names the chosen position.

If arm A loses, it will not be because the endpoint was unreachable. That question is
closed now, in advance, rather than argued afterwards.

---

## Amendment 3 — 2026-08-03, two operational findings, still pre-data

Builds are running; **no build result has been read.** Both items below came out of
exercising the shim, not out of any score.

### 1. A real asymmetry that favours arm A. Disclosed, not corrected.

`inventory_design_system` and `diff_design_system` **throw ENOENT** when given
`project_dir` for a project that never ran `configure_design_system_source` —
`resolveDesignSystemPath` → `readSourceConfig` is a bare `readFileSync` with no existence
check (`src/design-system-diff.ts:41-43`). §9 documents this.

**The composer catches it and falls back** to `<project_dir>/DESIGN.md` — arm A's grounding
reports `design_md_resolved_via: "default"`, the fallback rung, resolved cleanly. **The raw
tools do not.** So a B2 agent reaching for the inventory the obvious way hits a hard error
where arm A never sees one.

Checked before treating it as fatal: **B2 has a working path.** Passing `design_file_path`
explicitly returns the full inventory and the diff, and the ENOENT message names the exact
missing file, so the recovery is discoverable from the error itself. It costs B2 one failed
call, not the capability.

Left in place deliberately. Papering over it would mean hand-tuning the B2 arm after seeing
how it behaves — and "the composer handles a rough edge the bare tools expose" is a real
property of the thing under test, not an artifact of this round. It is recorded here so the
verdict can say how much of any A-over-B2 gap it accounts for, rather than discovering it
afterwards.

### 2. `analyze4.mjs` adapted to `measure.mjs`'s native output shape

`measure.mjs` emits `{discriminating[], controls[], results[{build, primary, control,
checks, notes}]}`; the analysis was written against a per-build map. Keyed on load. Also
added a hard refusal when any of the 18 is unscored, enforcing §8's "no result read before
all 18 exist" in the script rather than in my own discipline.

**All four decision branches re-validated against the real shape after the change** —
PASS / equivalence / inferior / inconclusive each fired on synthetic arrays, and the
refusal branch exits 1 on a 17-build file. `analyze4.mjs` was written before any data
existed and is not in `SEAL-HASHES.txt`; this records that it changed and why.
