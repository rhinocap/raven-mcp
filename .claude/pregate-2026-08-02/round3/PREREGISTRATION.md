# Round 3 pre-registration — written BEFORE any build ran

Locked 2026-08-03, before the first arm-A or arm-B builder was dispatched. Nothing below
may be changed after the first build exists; if something has to change, it is recorded as an
amendment with its reason and the analysis is reported both ways.

## What is being tested

Spec §13's delete clause: *"compare the composed prompt against a one-line instruction telling
the agent to call `read_design_md` + `get_taste_profile` + `audit_taste` itself. If it is no
better, delete the tool."*

Rounds 1–2 could not answer this. Round 2's as-shipped gap was **−15.7, 95% CI [−24.1, −7.2]**
(arm A worse, interval excludes zero) but ran the composer on a broken path; the oracle-ablated
gap was **−2.0, CI [−8.0, +4.0]**, which includes zero AND admits a meaningful effect either
way — *cannot distinguish*, not equivalence.

## What changed before round 3

1. **Role/density guard** on the emphasis ramp (`src/reference-prompt.ts`). A compact transient
   surface can no longer bind above `type.body`, and a clamp is reported as a gap.
   Measured on the arena ramp: snackbar root and message both `type.h3` (27px) → `type.body`.
2. **Skeleton derived by a calling agent**, not hand-authored.
3. **Surface bound** (`arena` → component-scale calibration) and **decisions scoped** to the
   portfolio system: 13 of 14 dropped, 1 governs. Round 1–2 fed arm A "the stdio MCP surface
   must stay byte-identical" in a prompt to build a snackbar.
4. **Arm prompts matched** — self-audit and source permission are now a common floor given to
   both arms; only the information block differs. Verified mechanically.

## Primary endpoint — deterministic, pre-specified

The 0–100 LLM judge is **demoted to secondary**. Round 2 measured its test-retest correlation on
byte-identical artifacts at **≈ −0.21** with MAD 5.0. An instrument that does not correlate with
itself cannot be fixed by adding N: averaging noise yields a precise estimate of nothing.

Primary endpoint is a composite of checks that are deterministic and re-runnable:

| # | Check | Instrument | Pass |
|---|---|---|---|
| P1 | Snackbar message font-size resolves within the body band | `msg-selector.mjs` (rendered page, resolves the matching CSS rule) | ≤ 20px |
| P2 | Deterministic color/spacing/motion detectors | `talon_scan` | 0 findings ≥ warning |
| P3 | Interactive targets ≥ 44px both axes | `audit_tap_targets` | 0 violations |
| P4 | Text contrast ≥ 4.5:1 | `audit_contrast` | 0 violations |
| P5 | No bare hex / font-size / font-family literal in component CSS | `review_diff` / grep on component rules | 0 |
| P6 | `prefers-reduced-motion` guard present and non-empty | grep on rendered CSS | present |

Primary statistic: **count of P1–P6 passed, per build (0–6).** Reported per arm as a mean with
a Welch 95% CI, and as the per-check pass rate.

## Secondary endpoint

Mean of 3 diverse-lens LLM judges per build (lenses: craft/restraint, correctness against the
brief, does-it-reproduce). Reported with its interval and an explicit reliability caveat.

## Equivalence margin — pre-registered

**δ = ±8 points** on the secondary 0–100 scale.

Justification, not convenience: the margin cannot honestly be tighter than the instrument can
resolve. Round 2's test-retest on byte-identical artifacts gave MAD 5.0 and sd 7.16. A ±5 margin
sits inside the instrument's own noise and would be unfalsifiable. ±8 is the tightest defensible
claim this instrument supports.

On the primary 0–6 scale: **δ = ±1.0 checks.**

## Power and N

Welch CI half-width ≈ 1.96·sd·√(2/n). At sd = 7.16 and δ = 8 → **n ≥ 7 per arm**.

**N = 7 per arm, 14 builds total.** Three judges per build reduces the instrument component to
sd ≈ 4.13, so the interval should fit inside ±8 with margin to spare. If the observed sd exceeds
9.0 the study is under-powered at this N and the result will be reported as **inconclusive**,
not as equivalence.

## Decision rule — fixed in advance

Let Δ = arm A (composed) − arm B (one-liner), on the primary endpoint.

- **Δ CI entirely above 0** → composed prompt is better. Gate does not fire; keep the tool.
- **Δ CI entirely inside ±δ** → demonstrated equivalence. §13's "no better" is satisfied; the
  delete clause fires and the recommendation is deletion.
- **Δ CI entirely below −δ** → composed prompt is worse. Delete clause fires a fortiori.
- **CI spans δ in either direction** → **inconclusive**. Report as inconclusive. Do NOT convert
  a non-significant result into a parity claim; that error is what invalidated round 2's verdict.

## Human anchor — required, not optional

Because the LLM instrument's test-retest is ≈0, the machine result **cannot close §13 by itself**.
Andrew reads a blind, shuffled sample of the artifacts and ranks them. His read is the anchor;
where the machine and the human disagree, the human wins. This is recorded as a required exit
condition, not a nice-to-have.

## Blinding

Build directories carry no arm information. The arm→build permutation is written to a sealed file
OUTSIDE this directory and unsealed only at synthesis. Workflow scripts cannot call `Math.random`,
so the permutation is a fixed hand-chosen assignment, recorded verbatim.

## Stores

`bind_taste_surface` wrote one additive binding (`arena`) to the live store, authorized by Andrew
2026-08-03. The decision store is an isolated scoped copy at `round3/decisions`; the live store is
never written. Both arms read the same taste store, so the comparison stays fair.
