# Pre-gate arm prompts — provenance record

**Why this file exists:** Sol's falsification pass on the round-1 pre-gate verdict (objection 1)
found the arm provenance unreproducible — the arm prompts, agent types, and output contracts
existed only in a session transcript, never on disk. `compose.mjs` only reproduced arm A's *input*,
not the instruction that drove the builder.

**Source:** `~/.claude/projects/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e.jsonl`
— the round-1 session transcript. Extracted 2026-08-03 by walking every `tool_use` block with
`name == "Agent"` (5 total; calls #1–#3 were `Explore` agents mapping TypeScript signatures during
the Phase 0 build and are unrelated to the pre-gate). Prompts below are **verbatim**, including the
now-dead `/private/tmp/.../597ce6a8-.../scratchpad/pregate` paths — that scratchpad has since been
garbage-collected, which is why the evidence was copied to `.claude/pregate-2026-08-02/`.

Both arms: `subagent_type: general-purpose`, no `model` override (inherited the session model),
identical deliverable contract (one self-contained `index.html` + a `BUILD-LOG.md`), and neither
was told a comparison was running.

---

## Arm A (round 1) — build from the composed prompt
`description: "Arm A: build from composed prompt"` · `subagent_type: general-purpose` · uuid `0ea62028-8b7c-404b-970c-24261cbf8d0f` · prompt_len 1813

```
You are building a UI component for the project at /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/arena (its DESIGN.md holds the concrete token values — read it to fill in real values for the CSS variables).

Your build prompt is the file /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/composed-prompt.md — read it and follow it exactly. It is your complete specification: structure, states, motion, content, tokens, prohibitions, and acceptance criteria. Where it asks you to report a choice (e.g. which easing you picked), record that in your build log. Where it flags a gap, use your judgment and record what you did. Do not consult any other design source.

Deliverables:
1. /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/arm-a/index.html — ONE self-contained HTML file (all CSS/JS inline, no external requests) implementing the component on a demo page: dark page background per the token set, plus a minimal demo harness (a single "Save change" button that simulates an optimistic save) so the component's full state machine can be exercised by hand. Define the tokens as CSS custom properties with the concrete values from DESIGN.md and author all component CSS against the variables.
2. /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/arm-b/../arm-a/BUILD-LOG.md — a short log: choices you were asked to report, gaps you resolved and how, anything you could not satisfy.

Work until both files exist and the HTML is complete and valid. Your final message should be a one-paragraph summary of what you built and any deviations.
```

## Arm B (round 1) — build from the one-line instruction
`description: "Arm B: build from one-liner"` · `subagent_type: general-purpose` · uuid `87c279af-ea15-4027-a141-4aadc8c295c8` · prompt_len 1715

```
You are building a UI component for the project at /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/arena.

Task: Build a snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss. Ground yourself in the project's design system and the owner's taste by calling the raven MCP tools yourself: read_design_md (project path above), get_taste_profile (profile name "andrew"), and audit_taste on your built artifact before you finish. (The mcp__raven__* tools are available — load them via ToolSearch first, e.g. "select:mcp__raven__read_design_md,mcp__raven__get_taste_profile,mcp__raven__audit_taste".)

Deliverables:
1. /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/arm-b/index.html — ONE self-contained HTML file (all CSS/JS inline, no external requests) implementing the component on a demo page: dark page background per the project's token set, plus a minimal demo harness (a single "Save change" button that simulates an optimistic save) so the component's full behavior can be exercised by hand. Define the design tokens as CSS custom properties with the concrete values from the project's DESIGN.md and author all component CSS against the variables.
2. /private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate/arm-b/BUILD-LOG.md — a short log: what the tools told you, choices you made, and your audit_taste result.

Work until both files exist and the HTML is complete and valid. Your final message should be a one-paragraph summary of what you built and any deviations.
```

---

## Round 2 (2026-08-03) — what changed and what did not

Round 2 re-runs **both** arms at N=6 each (round 1 was N=1 per arm, which Sol flagged as a
nitpick and which the spec itself wrote). The prompts above are reused **verbatim** with exactly
two substitutions, applied identically to both arms:

1. the dead scratchpad `.../pregate` base → `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02`
2. the arm output dir (`arm-a/`, `arm-b/`) → that build's own `round2/build-NN/`

Arm A additionally reads `round2/composed-prompt-fair.md` instead of `composed-prompt.md`. That is
the **only** substantive change in the experiment, and it is upstream of the builder: the skeleton's
`undo-action.emphasis` went `3 → 1` (`round2/skeleton-fair.json`), matching the emphasis the spec's
own snackbar example gives the action (`docs/spec-pattern-library.md`, Structure block:
`action → <Button variant="ghost" size="sm"> [emphasis 1]`).

Measured effect of that one change, composer byte-unchanged:

| | round 1 | round 2 |
|---|---|---|
| composed line | ``emphasis 3 → `type.h2` `` | ``emphasis 1 → `type.body` `` |
| gaps reported | 6 | 6 |
| prompt chars | 17,3xx | 17,209 |

`src/reference-prompt.ts` is **not** modified — repairing the composer before the gate would move
the gate, which needs Andrew's explicit sanction. The residual composer defect stands on the record:
it silently maps an inline action to `type.h2` with no role/density guard and no gap warning.

Build-index → arm mapping is held outside this directory until judging completes, so the blind
judges cannot infer an artifact's arm from its path. It is written to `round2/ARM-MAPPING.md`
at synthesis time.
