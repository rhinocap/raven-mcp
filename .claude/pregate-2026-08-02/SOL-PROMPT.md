# Adversarial falsification pass — REPORT ONLY, change nothing

You are the adverse reviewer. Your job is to REFUTE the claim below, not confirm it. Attack the methodology, the evidence, and the attribution. Default to skepticism.

## The claim under test

A pre-gate comparison (per `docs/spec-pattern-library.md` §13, line 555: "compare the composed prompt against a one-line instruction telling the agent to call read_design_md + get_taste_profile + audit_taste itself. If it is no better, delete the tool") was run on raven-mcp's new `compose_build_prompt` tool. Verdict being claimed:

1. **Arm A** (agent built a snackbar from the composed 17,313-char prompt) and **Arm B** (agent built the same snackbar from a one-line instruction telling it to call the three tools itself) both PASS `audit_taste` (0 findings each, 29 not_assessed each). Talon: A has 1 minor finding (near-dup grays #141414/#1c1c1c), B has the same + a 44ch measure warning. Machine judges near-tied.
2. **Eyes-on decides**: Arm A's visible post-save state has a serious proportion defect — the inline "Undo" action renders at 56px (the DESIGN.md h2 size) in accent orange next to a 27px message, because the composer's EMPHASIS_QUANTILE mapping ({1:0.25, 2:0.5, 3:0.85} over the type ramp) mapped emphasis:3 on an inline action node to `type.h2` with no role/density guard, and the builder followed the prompt literally (its BUILD-LOG even flags the oversize). Arm B's visible state is a clean, conventionally-proportioned bottom-left snackbar (≈15px message, small accent Undo, quiet ×, hairline border).
3. **Attribution**: the defect is composer-caused (the quantile ramp), not builder-caused.
4. **Countervailing point being reported honestly**: Arm A followed the skeleton's content/state/timing contract exactly (copy "Change saved"/"Undo", 5s timeout, 210ms→base motion snap, reduced-motion opacity-only); Arm B invented its own copy ("Visibility set to Public"), an 8s timeout, and added unprompted quality touches (hover-pause timer, 44px targets). Contract fidelity is real composer value, but B never had the skeleton so this is not a defect for B.
5. **Verdict as stated**: on this run the composed prompt was NOT better on the load-bearing axis (visible quality); per the spec's own falsifier the default disposition is delete, with the alternative being a single attributable fix (cap inline-action/compact nodes at body scale in the emphasis mapping) + one re-run.

## Evidence on disk (read it)

Base: /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/
- composed.json / composed-prompt.md — the composer output (arm A's input)
- skeleton.json, arena/DESIGN.md — shared arena inputs
- arm-a/index.html, arm-a/BUILD-LOG.md, arm-a/audit-taste.json, arm-a/talon-scan.json
- arm-b/index.html, arm-b/BUILD-LOG.md, arm-b/audit-taste.json, arm-b/talon-scan.json
- Spec: /Users/accunliffe/projects/raven-mcp/docs/spec-pattern-library.md (§13)

## Attack surface — questions to press

- Is the 56px Undo actually in arm-a/index.html (check the CSS/markup), and is it genuinely traceable to the composed prompt's emphasis binding rather than builder license?
- Is the comparison fair? Same model/agent type, same arena, same output contract? Does arm B's extra freedom (no skeleton) invalidate the comparison, or is that exactly what the spec's one-liner arm means?
- N=1: is a single-pattern, single-run comparison sufficient to trigger the spec's delete clause, or does the spec demand more?
- Is "machine judges near-tied" accurate given talon gave A strictly fewer findings than B?
- Is the recommended disposition (fix ramp + one re-run before delete) consistent with the spec's falsifier, or is it rationalizing survival?
- Anything in the build logs or HTML contradicting the narrative?

## Output format

Numbered objections, each labeled REAL (would change the verdict/disposition) or NITPICK, with file:line evidence. If the claim survives, say so plainly. REPORT ONLY — do not modify any file.
