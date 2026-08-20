# Report-only adversarial audit — round 9

Repo: /Users/accunliffe/projects/raven-mcp (uncommitted worktree). DO NOT EDIT ANY FILE.
Return only numbered P1/P2/P3 findings with file:line evidence, then one verdict line:
SURVIVES or DOES NOT SURVIVE.

## Context
OpenAI rejected the Raven MCP plugin submission on 2026-08-19 for two reasons:
R1 "test cases did not produce correct results"; R2 "tool annotations do not appear to
match the tool's behavior... confirm annotations are explicitly true or false (not null)
for every tool, with justification based on actual behavior."

## Claims under audit — try to REFUTE each, do not confirm them

1. The R1 fix class is: a tool that returns a score, grade, or pass-verdict computed from
   empty input. Guards were added to audit_tap_targets, audit_content, audit_typography,
   audit_ios_privacy, and evaluate_design in src/index.ts. CLAIM: no remaining tool on any
   surface returns an affirmative verdict from empty-but-schema-valid input. Attack the
   guard SHAPES: `!x` is false for `[]`; a whitespace string is truthy. Look for guards
   that check the wrong field, fire on legitimate input, or sit after the work.

2. evaluate_design refuses only when it has NEITHER a description NOR before/after
   screenshots (src/index.ts ~2781). CLAIM: this cannot refuse a legitimate
   screenshot-only pixel diff, and cannot pass a call with nothing to evaluate. Attack
   both directions.

3. `toolAnnotations()` in src/index.ts emits four literal booleans for every tool and
   throws if a tool is unclassified, so `null` is unreachable. CLAIM: there is no
   default-through path. Find one.

4. openWorldHint is derived per surface:
   `TOOL_OPEN_WORLD.includes(t) && !(remote && remoteBlocksNetwork(t))`.
   CLAIM: this makes the hint match behaviour on BOTH surfaces, and cannot drift from
   REMOTE_ARG_GUARDS. Attack: is there a tool that reaches the network by some route other
   than a `url` param? Is any TOOL_OPEN_WORLD member missing? Is any non-member reaching
   an open world? Check `audit` (the dispatcher), design_gauntlet, init_design_md,
   audit_api_contract.

5. Five TOOL_IDEMPOTENT entries were flipped true->false. CLAIM: every remaining `true` is
   earned — calling twice with identical args leaves the same end state. Find a remaining
   `true` that writes, appends, timestamps, or emails.

6. CLAIM: TOOL_IDEMPOTENT is consulted ONLY in the destructive branch; the readOnly branch
   hard-codes idempotentHint:true. So a readOnly-classified tool that is NOT idempotent
   would publish a false hint with no way to correct it via the map. Is there such a tool?

7. .claude/openai-rejection-2026-08-19/R2-annotation-justification.md is a hand-written
   document Andrew will paste to OpenAI. CLAIM: every factual statement in it is true of
   the code. Check it line by line against src/index.ts. A false statement here is worse
   than a code defect — it is a false statement to a reviewer.

8. CLAIM: no tool was added or removed, so the frozen anonymous 45-tool name hash
   f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6 is unmoved.

## Also attack the instruments, not just the product
- test/empty-input-refusal.test.mjs (50 tests) and test/idempotent-annotations.test.mjs:
  find any test that passes against the defect it names, or asserts something weaker than
  the sentence it backs.
- .claude/openai-rejection-2026-08-19/empty-mutants.mjs (v5) — find a mutant whose declared
  red test is wrong, or a mechanism with no mutant.
- .claude/openai-rejection-2026-08-19/empty-sweep.mjs — its exit status is derived from a
  positive control. Can it report clean while measuring nothing?

Measured facts you may assume were run (verify if cheap): full suite 1704/1701/0/3 EXIT=0;
matrix v5 32 mutants 0 survived 1 control 0 false-failed EXIT=0; surfaces 111/45/56.
