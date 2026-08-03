# Round 3 arm prompts — matched except for the information block

**Why these differ from rounds 1–2.** Sol's falsification pass (objection 3) found the arms
differed in **enforcement**, not only in information source:

| | round 1–2 arm A (composed) | round 1–2 arm B (one-liner) |
|---|---|---|
| may consult other sources | **no** — "Do not consult any other design source." | yes — told to call three tools |
| must self-audit before finishing | **no instruction** | **yes** — "audit_taste on your built artifact before you finish" |
| build log records audit result | no | yes |

So arm B had a mandatory QA step arm A was denied, and arm A was forbidden the sources arm B
was told to use. Any measured gap conflates *information source* with *whether the builder
checked its own work*. Round 3 makes the self-audit and the source permission a **common floor**
given identically to both arms, so the only remaining difference is the INFORMATION BLOCK.

Everything outside the marked block below is byte-identical between the two arms except the
output directory. Both arms: `subagent_type: general-purpose`, no model override, and neither
is told a comparison is running.

`{OUT}` is that build's own directory, e.g. `.../round3/build-07`.

---

## Arm A — build from the composed prompt

```
You are building a UI component for the project at /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena (its DESIGN.md holds the concrete token values — read it to fill in real values for the CSS variables).

<<<INFORMATION BLOCK>>>
Your build prompt is the file /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3/composed-prompt.md — read it and follow it. It is a specification: structure, states, motion, content, tokens, prohibitions, and acceptance criteria. Where it asks you to report a choice (e.g. which easing you picked), record that in your build log. Where it flags a gap, use your judgment and record what you did.
<<<END INFORMATION BLOCK>>>

You may consult any other design source you judge useful.

Deliverables:
1. {OUT}/index.html — ONE self-contained HTML file (all CSS/JS inline, no external requests) implementing the component on a demo page: dark page background per the token set, plus a minimal demo harness (a single "Save change" button that simulates an optimistic save) so the component's full state machine can be exercised by hand. Define the tokens as CSS custom properties with the concrete values from DESIGN.md and author all component CSS against the variables.
2. {OUT}/BUILD-LOG.md — a short log: choices you were asked to report, gaps you resolved and how, anything you could not satisfy, and your audit result.

Before you finish, audit your own artifact: call audit_taste on the HTML you built (profile "andrew", project "arena") and record its verdict and findings in your build log. (The mcp__raven__* tools are available — load them via ToolSearch first, e.g. "select:mcp__raven__read_design_md,mcp__raven__get_taste_profile,mcp__raven__audit_taste".)

Work until both files exist and the HTML is complete and valid. Your final message should be a one-paragraph summary of what you built and any deviations.
```

## Arm B — build from the one-line instruction

```
You are building a UI component for the project at /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena (its DESIGN.md holds the concrete token values — read it to fill in real values for the CSS variables).

<<<INFORMATION BLOCK>>>
Task: Build a snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss. Ground yourself in the project's design system and the owner's taste by calling the Raven MCP tools yourself: read_design_md (project path above) and get_taste_profile (profile name "andrew").
<<<END INFORMATION BLOCK>>>

You may consult any other design source you judge useful.

Deliverables:
1. {OUT}/index.html — ONE self-contained HTML file (all CSS/JS inline, no external requests) implementing the component on a demo page: dark page background per the token set, plus a minimal demo harness (a single "Save change" button that simulates an optimistic save) so the component's full state machine can be exercised by hand. Define the tokens as CSS custom properties with the concrete values from DESIGN.md and author all component CSS against the variables.
2. {OUT}/BUILD-LOG.md — a short log: choices you were asked to report, gaps you resolved and how, anything you could not satisfy, and your audit result.

Before you finish, audit your own artifact: call audit_taste on the HTML you built (profile "andrew", project "arena") and record its verdict and findings in your build log. (The mcp__raven__* tools are available — load them via ToolSearch first, e.g. "select:mcp__raven__read_design_md,mcp__raven__get_taste_profile,mcp__raven__audit_taste".)

Work until both files exist and the HTML is complete and valid. Your final message should be a one-paragraph summary of what you built and any deviations.
```

---

## Diff between the arms

Outside the information block the two prompts are identical. Verify with:

```
node -e '
const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8");
const b=[...m.matchAll(/```\n([\s\S]*?)\n```/g)].map(x=>x[1]);
const strip=s=>s.replace(/<<<INFORMATION BLOCK>>>[\s\S]*?<<<END INFORMATION BLOCK>>>/,"<<<BLOCK>>>");
console.log(strip(b[0])===strip(b[1]) ? "IDENTICAL outside the information block" : "DIFFER — investigate");
' .claude/pregate-2026-08-02/round3/ARM-PROMPTS-R3.md
```

## What is still asymmetric, deliberately

Arm A reads a file; arm B makes tool calls. That IS the treatment under test — §13 asks whether
the composed prompt beats a one-line instruction telling the agent to call the tools itself.
It is not a confound to be removed.
