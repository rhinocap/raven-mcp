# Derive brief — round 3 skeleton

You are the calling agent for Raven's `compose_build_prompt` tool. Your job is to derive
a Structure/States skeleton for a component and get it past the composer's linter.

## The component

A **snackbar for an optimistic save**: a confirmation that appears after a save, carrying an
inline **Undo** affordance, an **auto-dismiss** timeout, and an **explicit dismiss** control.
It sits at the bottom of the viewport on a dark editorial portfolio surface.

## What you have

`compose_build_prompt` called without a skeleton returns the grounding half — tokens, component
inventory, prohibitions, acceptance criteria — and asks the caller to derive the skeleton. That
grounding is already written out for you at:

    /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3/grounding.md

Read it. The design system's DESIGN.md is at:

    /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena/DESIGN.md

## What to produce

A JSON object with `structure`, `states`, `content`, `motion`, and optionally `provenance`.

- `structure` is a single root `StructureNode` with `children[]`. Each node:
  `{ node_id, role, archetype, containment: "stack"|"row"|"overlay"|"inline", order,
     emphasis: 1|2|3, density: "compact"|"default"|"roomy", children: [] }`
  - `role` is what the node IS in plain words. `archetype` is the component kind
    (it gets bound against the project's real component inventory).
  - `emphasis` and `density` are RELATIVE ranks, not sizes.
- `states` is `{ initial, states: [{name, terminal?}], transitions: [{from, to, on, timeout_ms?,
  paused_by?, kind: "note"|"pattern"|"inferred"|"designer", pattern_ref?}] }`
- `content` is `[{ node_id, slot, copy, voice_constraint?, max_chars?, kind }]`
- `motion` is `[{ node_id, on, properties[], from{}, to{}, duration_ms, delay_ms,
  easing, source, reduced_motion }]`

**The skeleton is strictly colorless, typeless and sizeless.** No hex, no px, no font names,
no font sizes, no named colors. The composer's linter REFUSES a skeleton that smuggles any of
these, and it is the composer's job — not yours — to bind structure to tokens.

## How to work

1. Load the Raven tools: ToolSearch `select:mcp__raven__compose_build_prompt,mcp__raven__read_design_md`
2. Read the grounding file and the DESIGN.md.
3. Derive the skeleton from the component description above and what the grounding tells you.
4. Call `compose_build_prompt` with:
   `intent: "snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss"`,
   `project_dir: "/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena"`,
   `profile: "andrew"`, `project: "arena"`, and your `skeleton`.
5. If it returns lint findings, fix the skeleton and call again. Iterate until it lints clean.
6. Write the final skeleton to
   `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3/skeleton-derived.json`
   as a JSON object with a single top-level key `skeleton`.

## Return

Your final message is the return value, not a human-facing note. Return JSON:
`{"lint_clean": true|false, "iterations": <n>, "node_count": <n>, "notes": "<anything the linter
refused and how you resolved it>"}`
