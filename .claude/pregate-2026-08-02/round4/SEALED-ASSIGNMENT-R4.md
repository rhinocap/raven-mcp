# Round 4 — sealed assignment

**Written 2026-08-03, before any build ran.** Nothing below may change once the first
builder starts. `PREREGISTRATION.md` §8 forbids seeing any build result before this file
exists.

## Assignment

Seeded Fisher–Yates (`s = 20260803`, LCG) over six of each arm, run once and not re-rolled.
Build ids are opaque so that running them in order reveals nothing.

| id | arm | | id | arm | | id | arm |
|---|---|---|---|---|---|---|---|
| b01 | A | | b07 | A | | b13 | B2 |
| b02 | B2 | | b08 | B1 | | b14 | A |
| b03 | A | | b09 | A | | b15 | B2 |
| b04 | B2 | | b10 | B1 | | b16 | B1 |
| b05 | A | | b11 | B2 | | b17 | B1 |
| b06 | B1 | | b12 | B1 | | b18 | B2 |

6 / 6 / 6.

## What every builder gets, identically

1. Its **information block** (below — the only thing that differs).
2. `TASK.md`, **verbatim**, byte-identical across all 18.
3. A writable output directory `builds/<id>/`, and nothing else in the round-4 tree.

## What no builder gets

- Any other arm's information block, or any other build.
- `PREREGISTRATION.md`, `measure.mjs`, `COMPOSED-PROMPT.md`, this file, or the
  `fixtures/` directory. **The conformant fixture is a complete correct answer**; a builder
  that saw it would be transcribing, not building.
- `compose_build_prompt`, in arms B1 and B2 — denied in `raven-cli.mjs`, not in the prompt.

## The three information blocks

### A — composed

`ARM-A-PROMPT.md` verbatim, sha256 `9861b70f…`, prefaced by one line: *"The following build
prompt was composed for you. Then do the task below."* No tool access — arm A is the
prompt, which is the claim under test.

### B1 — the literal §13 one-liner

> Call `read_design_md`, `get_taste_profile` and `audit_taste` yourself, then do the task.
>
> A Raven MCP server is connected. Invoke a tool with:
> `node <round4>/raven-cli.mjs B1 <tool> '<json-args>'`
> The design system is at `<round4>/arena`; the taste profile is named `kettle` and the
> project is `kettle`.

`raven-cli.mjs` permits exactly those three tools to B1 and refuses everything else with
the list of what it does have.

### B2 — the generous one-liner

> A Raven MCP server is connected with the full local tool surface, including the design
> system, the taste profile and its bindings, per-project taste decisions, and the
> project's Decision Graph. Use whatever you need, then do the task.
>
> Invoke a tool with: `node <round4>/raven-cli.mjs B2 <tool> '<json-args>'`
> Run it with no arguments to list every tool available to you.
> The design system is at `<round4>/arena`; the taste profile is named `kettle` and the
> project is `kettle`.

Full surface minus the composer.

## Deviation from §13's literal wording, and why it is the honest direction

§13's one-liner assumes a connected MCP server. The one connected to this session resolves
its taste store from `~/.raven`, which has **no `kettle` profile** — a B-arm agent calling
`get_taste_profile` through it gets "profile not found", and the arm has no tools at all.
`raven-cli.mjs` runs the same registered handlers against the fixture stores instead.

This deviates toward **strengthening the B arms**, which is the direction that can only
hurt the tool under test. Recorded rather than buried.

## B2 is the stronger arm on paper, and that is deliberate

Checked before the round, not argued after it. Through the shim, B2 can reach:

- `decision_list` → each active decision's **`statement`** — the chosen position, stated
  outright. Arm A never gets a chosen position at all; it gets rejections plus rationale
  and has to infer (`COMPOSED-PROMPT.md`, and `src/reference-prompt.ts:920-921`).
- `list_taste_decisions` → all five dimension decisions in full text.
- `inventory_design_system`, `diff_design_system`, `list_design_system_components`.

**The one thing B2 must think to ask for is the contested decision.** Verified through the
shim: `decision_list {}` returns the six active decisions and does not include
`dec_destructive_label`; only `{"status":"contested"}` does. Arm A is handed it in
`## Gaps / decisions for you` with an explicit instruction not to resolve it silently.

So on 12 of the 13 primary checks B2 has the **more direct** access, and on one it has to
know to look. If arm A wins here it is winning against a stacked-against-it comparison. If
it loses, the amended §13 condition 2 is unambiguous about what follows.

## Run protocol

- One agent per build, no shared state, each writing only `builds/<id>/`.
- Concurrency capped at 4. No build reads another's directory.
- A build that fails to produce `index.html` is re-run once with the identical prompt, and
  the re-run is recorded. A second failure is scored as-is — dropping it would bias the arm.
- No build result is read until all 18 exist. `measure.mjs` runs over the whole set at once.

## Hashes at seal time

```
ARM-A-PROMPT.md   9861b70f729c2c02c90476b96df91a874c62caa041a528e9d1a4db26f0e20dbe
```
`TASK.md` and `measure.mjs` hashes are recorded by `seal.sh` alongside this file.
