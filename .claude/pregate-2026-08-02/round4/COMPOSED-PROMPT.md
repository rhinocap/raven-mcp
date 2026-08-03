# Arm A — the composed prompt

**Artifact:** `ARM-A-PROMPT.md`
**sha256:** `9861b70f729c2c02c90476b96df91a874c62caa041a528e9d1a4db26f0e20dbe`
**52 lines, 1483 words.** Generated 2026-08-03, before arm assignment and before any build.

## How it was produced

`compose_build_prompt` **is built** — `src/reference-prompt.ts`, registered at
`src/index.ts:2943`, `readOnly` in `TOOL_ACCESS`. So arm A is not hand-derived: it is the
real tool's real output. `compose4.mjs` calls it through `buildServer({remote:false,
tasteStore:new FsTasteStore()})` with the round-4 fixture stores pointed at by
`RAVEN_TASTE_HOME` and `RAVEN_DECISIONS_HOME`. Andrew's live `~/.raven` is never read or
written.

```
intent      moderation queue: a dense reviewable list with bulk selection, bulk actions,
            paging, and its empty states
project_dir round4/arena
profile     kettle
project     kettle
skeleton    (omitted — see below)
```

**Determinism: three independent runs, one hash.** Round 3 required this check and it is
repeated here. `9861b70f…` on all three.

**No `skeleton` argument, deliberately.** Round 4 copies no reference site — the task is
built from the project's own design system — so the grounding-half branch is the honest
one, and the composer reports `skeleton_required: true`. Handing arm A a caller-authored
structure tree would measure the tree, not the composer.

## What the composer actually resolved

```
design_md              round4/arena/DESIGN.md   (resolved via "default")
design_md_resolved_via default            ← the ENOENT fallback rung, exercised
token_count            29
inventory_source       DESIGN.md
component_count        7
binding_resolved       true
decisions_scope        round4/arena/.raven/decisions   ← inside project_dir, no mismatch line
decisions_consulted    dec_rail_position, dec_no_confirm_modal, dec_load_more,
                       dec_selection_persists, dec_rail_before_list, dec_indeterminate_header
contested_decisions    dec_destructive_label
gaps                   1
acceptance             6
```

All six active decisions were read and the contested one was routed into
`## Gaps / decisions for you` as an open question rather than silently resolved. That is
the behaviour §9 specifies, confirmed by effect rather than by reading the call site.

## A property of the composer found while checking this, recorded before any data exists

**The composed prompt never states a decision's chosen position — only the alternatives it
rejected, plus its rationale.** `src/reference-prompt.ts:920-921` is the whole of it:

```ts
if (active[ad].alternatives_rejected.length === 0) continue;
lines.push("- rejected in the Decision Graph (`" + active[ad].id + "`, active …): "
  + active[ad].alternatives_rejected.join(", ")
  + (active[ad].rationale ? " — \"" + active[ad].rationale + "\"" : ""));
```

Two consequences, and they are not implementation slips — §9's output template has no
section for a decision's chosen position at all. Structure/States carry the build shape,
and on the no-skeleton branch those sections do not exist:

1. A decision reaches the agent **by implication**: from what was rejected and why.
2. **An active decision with an empty `alternatives_rejected[]` is dropped silently.**

Checked against this fixture rather than assumed: all six active decisions carry 2–3
rejected alternatives, so **nothing is dropped here** and round 4 is fair to run. The
contested decision has an empty array but reaches the prompt by the separate contested
path. A real project with a bare decision would lose it outright — a finding for the
verdict's recommendations, not a reason to hold the round.

## Traceability — is every primary check reachable from arm A's text?

Asked before the round rather than after, because if the answer were no the endpoint would
be measuring a composer defect rather than the composer. Line numbers are `ARM-A-PROMPT.md`.

| check | reachable | where, and how directly |
|---|---|---|
| D1 rail static, above the rows | yes | L18 rejects bottom-anchored / fixed-top / right-rail; **L22 states "the rail is above the list"** |
| D2 no confirm modal | yes | L19 rejects the modal, type-to-confirm, delayed apply — *"Reversal after the fact is the control that actually works"* |
| D3 undo strip present | yes | L19 as above, plus `ds-undo-strip` in the 7-component inventory and L16/L15 governing its copy and timing |
| D4 explicit load-more | yes | L20 rejects infinite scroll and numbered pagination; `ds-load-more` is a real component |
| D5 selection survives paging | yes | L21 rejects clear-on-fetch and warn-and-clear |
| D6 rail precedes list in DOM | yes | L22 — *"Visual order and DOM order agree here anyway, because the rail is above the list"* |
| D7 indeterminate header | yes | L23 rejects the two-state header and no-header-control |
| D8 contested label surfaced | yes | L26, explicit, with the instruction not to resolve it silently |
| T1 rail height constant | yes | L13 rejects the collapse-when-idle rail, with the 48px shift named |
| T2 outlined pill | yes | L14 rejects the filled chip and signal-hue-on-neutral |
| T3 undo copy shape | yes | L15 rejects three wordings and states the three-word budget |
| T4 8s, no countdown | yes | L16 rejects the countdown ring and 4s — **states 8s explicitly** |
| T5 stable text edge | yes | L17 rejects hover-reveal — **states "the gutter itself stays 40px"** |

13 of 13 reachable. Four are stated outright; the rest are carried by a rejection whose
rationale names the chosen position. Indirect, but present — the endpoint measures the
composer, not a hole in it.

## Files

`compose4.mjs` · `ARM-A-PROMPT.md`
