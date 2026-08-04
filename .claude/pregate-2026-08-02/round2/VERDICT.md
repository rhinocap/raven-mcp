# §13 pre-gate verdict — `compose_build_prompt`

**Status: the gate does NOT close. Recommendation only — nothing deleted, merged, pushed, or
published. `src/reference-prompt.ts` is byte-unchanged.**

The falsifier, verbatim from `docs/spec-pattern-library.md` §13:

> Cheaper pre-gate, one hour: compare the composed prompt against a one-line instruction telling
> the agent to call `read_design_md` + `get_taste_profile` + `audit_taste` itself. **If it is no
> better, delete the tool.**

---

## Answer

**§13's delete clause is not satisfied on this evidence.** The experiment found a real defect in
the composer and showed that, as shipped, it produces materially worse builds. It did **not**
establish the thing §13 actually asks — that the tool is *no better* than the alternative.

An earlier draft of this file concluded the opposite. It was wrong, in a specific and instructive
way: it treated "the ablated gap is inside the noise floor" as evidence of parity. That is the
non-significance/equivalence fallacy. The correct reading of the same numbers is **underpowered —
cannot tell**. A GPT-5.6-Sol falsification pass caught it (objection 8) along with twelve other
real objections; the arithmetic below is its, re-derived and confirmed independently.

## What IS established

**1. The composer has a real, mechanically-traceable typography defect.** For a `compact`-density
transient toast it binds **both the root and the confirmation message** to a heading token:

```
- transient confirmation surface, bottom of viewport [row] → <toast> … [emphasis 2 → `type.h3`, density compact → `space.sm`]
  - confirmation message text [stack] → <text> …        [emphasis 2 → `type.h3`, density compact → `space.sm`]
```

Arena type scale: `label 13 / body 16 / lead 20 / h3 27 / h2 56 / h1 96`. The quantile emphasis
ramp (`src/reference-prompt.ts` ~305–319, ~362–385) is **role- and density-blind**, and it reports
the binding as resolved — no gap warning. Confirmed by reading the emitted prompt and the ramp,
not inferred from build output.

**2. Builders comply with it.** Measured live across all 12 round-2 builds
(`raw/msg-selector-round2.jsonl`, exact `"Change saved"` match on the rendered page):

| message size | builds | arm |
|---|---|---|
| **27px** (`type.h3`) | 03, 06, 07, 09, 12 | **all arm A** |
| 16px (`type.body`) | 01, 04, 05, 08, 10, 11 + 02 | all arm B, plus arm-A build-02 |

Undo measured 16px in all 12 — the round-1 fairness fix held. build-02 is the only arm-A build
that ignored the binding, and the only arm-A build judged ship-ready.

**3. As shipped, the composed prompt produced worse builds — and that result is outside the
noise floor.** Mean 67.8 vs 83.5, difference **−15.7**, Welch ~95% CI **[−24.0, −7.4]**, which
excludes zero. 1/6 vs 5/6 ship-ready; 5 high-severity defects vs 0.

**4. This defect was present in round 1 and was masked, not introduced.** Round 1's visible
failure (`emphasis 3 → type.h2`, a 56px Undo) came from an unfair skeleton. Correcting the
skeleton did not remove the composer's defect — it **uncovered** it.

## What is NOT established

**The claim §13 turns on: that the composer is no better than the one-liner.**

After hand-repairing the defect in the five affected artifacts, the arms are statistically
indistinguishable — mean 81.8 vs 83.8, difference **−2.0**, Welch ~95% CI **[−8.0, +4.0]**. That
interval **includes zero and admits a meaningful advantage in either direction**. It supports
"cannot distinguish", not "no better". With n=6 per arm and a judge instrument whose test-retest
mean absolute change is 5.0 points (max swing 13 on byte-identical input), the experiment has
nowhere near the power to demonstrate equivalence.

Four further limits, three of them found by the falsification pass and not by me:

- **The ablation is an oracle repair on artifacts, not a repaired composer.** It patches finished
  HTML after seeing the defect cluster, guaranteeing perfect compliance. It licenses "changing
  these five messages from 27px to 16px raised their scores." It does **not** license "a repaired
  composer produces equivalent builds" — a real fix would change builder interpretation and
  compliance too. My earlier "best case for arm A" framing was wrong for the same reason.
- **The two arm prompts differ in enforcement, not only in information source.** Arm B is told to
  call all three tools and audit its own artifact before finishing; arm A is told the composed
  file is complete, to follow it exactly, and to consult no other design source. Arm B gets a
  self-audit step arm A is forbidden. This confound was inherited verbatim from round 1 and is
  not corrected for. It is a genuine flaw in the comparison, independent of sample size.
- **Arm A ran outside the composer's strongest path** — no matching surface binding, and
  decisions read from outside the arena project. Both surfaced as explicit gaps in the composed
  prompt. The spec claims surface `design_notes`, matching hints, and project decisions as core
  benefits; this run largely tested token formatting.
- **The skeleton was hand-authored by me, not derived by a calling agent** as the spec's workflow
  specifies. The load-bearing `message.emphasis: 2` came from that external skeleton. So the
  finding is really about the *interaction* of an externally authored skeleton with a role-blind
  binder — the failure is still the composer's (a resolved binding should not put a toast message
  at heading scale), but the experiment did not test the end-to-end workflow.

Also unaddressed: one component type, one design system, no human ground truth, and judge/refuter
errors correlated (refuters re-verify the judge's cited lines rather than auditing cold, so
"11/12 sustained" is not independent replication). Path blindness was maintained — no judge or
refuter named an arm or method — but builds narrate their own rationale inline, and that is a
channel through which method identity can leak to a nominally blind judge.

## Results

> **Every number in the three tables below was re-derived from `raw/` on 2026-08-03 and matches
> exactly** — all six arm means, both medians, all four ranges, all four refuted means, every
> ship-ready count, every high-defect count, the −15.7 and −2.0 deltas, and all seven noise-floor
> rows including n, mean, mean |Δ|, sd, and max. Reproduce with `node verify-arrays.mjs` from
> this directory; it reads `raw/round2-judges-refuters.json` and
> `raw/ablation-judges-refuters.json`, checks those files for duplicate, missing, extra, and
> non-numeric rows, compares each computed figure against the published one, and **exits 1 on
> any mismatch** rather than printing numbers for a human to eyeball.
>
> **The one step that is not mechanized:** the build→arm maps are transcribed by hand from
> `ARM-MAPPING.md` and `ABLATION-MAPPING.md`, which are prose tables. The script constrains that
> transcription (12 rows each, no duplicates, every id present in `raw/`, six builds per arm) but
> cannot prove an arm label was not swapped. Read the two mapping files if that is what you are
> checking.
>
> This matters because the arrays had been quoted from memory in the session log and were
> flagged **UNVERIFIED** through four windows — a reconstruction that happens to be right is
> still not data until it is read back from the source. It has now been read back. The flag is
> cleared, and the numbers below are KNOWN.

### Round 2 — as shipped (wf_7ac08a99-1e0, 39 agents, 0 errors)

| arm | judge mean | median | range | refuted mean | ship-ready | high defects |
|---|---|---|---|---|---|---|
| **A** composed prompt | 67.8 | 64.0 | 60–83 | 67.5 | **1/6** | **5** |
| **B** one-liner | 83.5 | 85.0 | 76–87 | 82.5 | **5/6** | **0** |

Difference −15.7, ~95% CI [−24.0, −7.4]. 11/12 refutations sustained; the single overturn
(build-05, arm B) moved *upward*, 76→84.

### Ablation — defect hand-repaired in artifacts (wf_a31a9eb4-b24, 24 agents, 0 errors)

| arm | judge mean | median | range | refuted mean | ship-ready | high defects |
|---|---|---|---|---|---|---|
| **A** composed prompt | 81.8 | 81.5 | 76–88 | 81.7 | 4/6 | 1 |
| **B** one-liner | 83.8 | 86.0 | 74–87 | 82.7 | 5/6 | 1 |

Difference −2.0, ~95% CI [−8.0, +4.0] — includes zero. Inconclusive.

### Instrument noise floor

Seven artifacts were byte-identical across both judging rounds (all six arm B, plus arm-A
build-02) and received no ablation — an unplanned test-retest control:

| artifact | round 2 | ablation round | delta |
|---|---|---|---|
| build-01 | 83 | 83 | +0 |
| build-02 | 83 | 76 | −7 |
| build-04 | 85 | 87 | +2 |
| build-05 | 76 | 85 | +9 |
| build-08 | 85 | 87 | +2 |
| build-10 | 87 | 74 | **−13** |
| build-11 | 85 | 87 | +2 |

n=7, mean −0.7, mean absolute change (mean |Δ|) 5.0, sample sd 7.16 (n−1), max 13. Mean |Δ| is the
statistic a noise floor wants — the typical size of a re-judge swing — and is not the same as mean
absolute deviation about the mean, which is 5.3 here. Test-retest correlation on
unchanged input is ≈ **−0.21** — the instrument barely agrees with itself build-to-build. Treat
any single build's score as ±13 and only arm-level aggregates as meaningful.

## Method

- **N=6 per arm**, both arms re-run, blind-judged. Round 1 was N=1 per arm.
- Arm prompts reused **verbatim** from round 1 (`../ARM-PROMPTS.md`, recovered from the round-1
  transcript), with two substitutions applied identically to both arms: dead scratchpad base →
  the persisted evidence dir, and arm output dir → that build's own dir. **This preserved the
  enforcement asymmetry described above** — verbatim reuse was chosen for provenance fidelity,
  and it carried the flaw forward.
- Arm A reads `composed-prompt-fair.md`, composed from `skeleton-fair.json`, which differs from
  round 1 by exactly one value — `undo-action.emphasis 3 → 1`, matching the emphasis the spec's
  own snackbar example gives the action. Verified by diff.
- Arms shuffled across anonymized dirs; mapping sealed outside the evidence dir until synthesis
  (`ARM-MAPPING.md`, `ABLATION-MAPPING.md`). The seal was a file placed outside the tree, not a
  prior cryptographic commitment — it is asserted, not provable after the fact.
- Judges got only `index.html` + two PNGs, forbidden `BUILD-LOG.md` (the leak vector: an arm-A log
  says "composed prompt", an arm-B log says "audit_taste result"). Ablation dirs carry
  `index.html` only, so that vector does not exist there.
- Every judge was followed by an adversarial refuter instructed to **overturn**, not confirm.
- Ablation patched build artifacts only: message rule `font-size: var(--type-h3…)` →
  `var(--type-body, 16px)`, one declaration in one selector block, asserted as exactly one
  substitution per file, verified by live measurement.

## What would actually settle §13

The decisive experiment was never run. It is:

1. Add the role/density guard to the ramp so a compact transient surface cannot bind above
   `type.body`, plus a gap warning when a node resolves to a heading token inside a toast.
2. Regenerate the composed prompt from a skeleton **derived by a calling agent**, not hand-authored.
3. Bind the surface properly and scope decisions to the arena project, so the composer runs on its
   strongest path.
4. Rewrite the two arm prompts so they are identical except for the information block — same
   deliverables, same self-audit instruction, same permission to consult sources.
5. Commission fresh builds both arms, pre-register a practical equivalence margin, and power to it.
6. Anchor with at least one human (Andrew) read, since the LLM instrument's test-retest
   correlation is ≈0.

Short of that, closing §13 on the current evidence requires Andrew to adopt an explicit decision
rule — *"delete unless superiority is demonstrated"* — which is a product-policy call, not an
experimental result, and should be recorded as such rather than smuggled in as a finding.

## The §13 branches (both human-gated; nothing executed)

**Branch 1 — delete.** Not supported by the evidence as it stands; supported only under the
burden-of-proof policy above. Scope, measured against the repo (corrected — the earlier draft
undercounted):
- `src/reference-prompt.ts` (the tool) and `test/reference-prompt.test.mjs`
- `src/index.ts` — **five** sites, not "registration": import (L48), comment (L1857),
  `REMOTE_GATED_TOOLS` (L1915), `TOOL_ACCESS` (L2012), tool list (L2944), plus the registration
  and handler themselves
- Tool count 106 → 105 and gated 61 → 60 across **six** test files:
  `test/design-review.test.mjs` (1 numeric assertion + **3** source-string assertions:
  `all 106 local tools`, `the 61 gated tools`, `all 106.`), `test/audit-dispatch.test.mjs`,
  `test/decision-import.test.mjs`, `test/taste-remote-full.test.mjs` (3 sites),
  `test/grab-bridge.test.mjs`, `test/redis-taste-store.test.mjs`
- `manifest.json` via `node scripts/sync-manifest-tools.mjs`
- `docs/spec-pattern-library.md`, README
- **There is no root `llms.txt`.** The count lives in `site/llms.txt` and `web/public/llms.txt`,
  **three occurrences in each** (lines 3, 12, 32) — and `web/public/` only reaches the public site
  on a manual `vercel deploy --prod` from `web/`.
- The tool is in `REMOTE_GATED_TOOLS`, so the frozen anon-45 hash `f64bb18…2bb0a6` should be
  unchanged — verify by effect against the production alias either side, do not assume.
- **A merge to `main` deploys the live MCP endpoint.** Andrew merges; Claude does not.

**Branch 2 — repair, then re-gate.** Fix the ramp as in step 1 above and run the decisive
experiment before disposing. The ablation is evidence a repair recovers roughly 14 points on these
artifacts; it is not evidence the repaired tool beats or ties the one-liner. Repairing before
disposing moves the gate, which needs Andrew's explicit sanction.

## Evidence

`round2/` — `skeleton-fair.json`, `compose-fair.mjs`, `composed-prompt-fair.md`,
`composed-fair.json`, `capture.mjs`, `measure-msg.mjs`, `msg-selector.mjs`, `judge-batch.mjs`,
`machine-judge.json`, `build-01..12/`, `ablation/abl-01..12/`, `ARM-MAPPING.md`,
`ABLATION-MAPPING.md`.
`round2/raw/` — full judge + refuter corpus for both rounds
(`round2-judges-refuters.json`, `ablation-judges-refuters.json`), both workflow scripts, and the
canonical exact-match message measurements (`msg-selector-round2.jsonl`,
`msg-selector-ablation.jsonl`).
Round-1 eyes-on: `../arm-a/{idle,postsave}.png`, `../arm-b/{idle,postsave}.png`.
Provenance: `../ARM-PROMPTS.md`. Session log: `conversations/2026-08-03-pregate-round2.md`.
