# Adversarial pass — FINAL tree (round 3). REPORT ONLY. Edit nothing.

## Standing warning about earlier rounds
`agent-output/sol-r2.log` graded a **stale tree**. Its P1-1 (Accept header),
P1-2 (empty-input false all-clears) and P2 (silent fallbacks) have since all been
CONFIRMED by measurement and FIXED. Do not re-report them as open; DO try to
refute the fixes.

## Context
Raven was rejected by the OpenAI plugin directory for two reasons:
- R1: "test cases did not produce correct results ... ensure the same test cases
  pass consistently on both ChatGPT web and mobile"
- R2: "annotations do not appear to match behavior ... explicitly true or false
  (not null) for every tool"

The reviewed surface is the ANONYMOUS endpoint `https://mcp.ravenmcp.ai/api/mcp`
(45 tools), not the 111-tool stdio build. **The live endpoint is built from
`main` and NOTHING in this working tree is pushed**, so the live endpoint still
exhibits every defect below. Report on the WORKING TREE.

## The full change set to attack
`.claude/openai-rejection-2026-08-19/amended.diff` (regenerated, 44 files,
includes untracked new test suites).

1. `api/mcp.js` — rebuilds `req.rawHeaders` so a client sending only
   `application/json` (or `*/*`) is not 406'd. Claim: the SDK transport imports
   `getRequestListener` from `@hono/node-server`, so hono reads `rawHeaders` and
   mutating `req.headers` alone is INERT. Refute if you can.
2. `src/index.ts` — empty/whitespace input now refused by `audit_ios_a11y`,
   `audit_swiftui`, `audit_rn` (all three previously returned score 100 / grade A
   on `""` and on `"   \n  "`).
3. `src/index.ts` — `get_brand_system` refuses a blank/whitespace `company`
   (previously resolved to Apple HIG) via one `candidates` variable feeding BOTH
   the direct-match and fuzzy loops.
4. `src/index.ts` — `generate_design_system` refuses an unknown `base_system` at
   the TOOL SEAM (previously silently fell back to `tokens = {}`).
5. Annotation work: every tool now sets all four hints explicitly.

## What to try hardest to refute
- Is `idempotentHint` genuinely boolean on ALL tools in the TREE, and does any
  hint CONTRADICT the tool's actual behaviour? (`audit_url` performs network
  fetches and possibly click interactions while annotated readOnly/idempotent —
  this is the most likely surviving R2 defect.)
- Are there MORE tools that return a confident success on empty, whitespace,
  malformed, or nonsense input? Probe broadly across all 45 anon tools.
- Do any of the four new test suites pass for the wrong reason — an assertion
  that cannot fail, a fixture that reproduces nothing, a positive control that
  would also pass with the guard deleted?
- **Critical probe idiom**: calling `tool.handler(args)` directly BYPASSES zod.
  Run `tool.inputSchema.safeParse(args)` FIRST; a throw from input the schema
  would have REJECTED is not a defect. Two phantom P1s died on this already.
- A correct refusal is returned as `isError:true` with text, so unconditional
  `JSON.parse` throws on CORRECT behaviour. Wrap parses.

Return only numbered P1/P2/P3 findings with file:line evidence, and one verdict
line: SURVIVES or DOES NOT SURVIVE.
