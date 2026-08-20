# Sol falsification pass — round 4 (report only, no edits)

You are auditing a tree that is NOT committed and NOT pushed. Repo: /Users/accunliffe/projects/raven-mcp.
The complete change set is `.claude/openai-rejection-2026-08-19/amended.diff` (7031 lines, 53 files). Read it first.

## Context
OpenAI rejected Raven's plugin-directory submission on 2026-08-19 for two stated reasons:
(R1) "test cases did not produce correct results ... align tool behavior/output with the documented expected outcomes"
(R2) "tool's annotations do not appear to match the tool's behavior ... explicitly set to true or false (not null) for every tool"
The reviewed surface is the ANONYMOUS endpoint https://mcp.ravenmcp.ai/api/mcp (45 tools), not the 111-tool stdio build.
NOTE: the live endpoint still serves the OLD code. Every fix in this tree reaches it only on a human push to `main`.
So: judge the SOURCE tree, and use the live endpoint only to establish what is still unfixed there.

## Your job
Try to REFUTE these claims. Do not confirm them.
1. Every anonymous tool now returns a refusal (isError:true) rather than an affirmative artifact for empty/whitespace input.
   Hunt for an anonymous tool that still manufactures a passing grade, a 100/A, or a "no issues" artifact from empty,
   whitespace-only, or structurally-vacuous input. src/index.ts, helper `refuseEmptyInput` / `isBlankString`.
2. `refuseEmptyInput` unification (src/index.ts, audit_ios_a11y / audit_swiftui / audit_rn) is behaviour-neutral:
   identical JSON key order and identical message text vs the inline forms it replaced. Refute by diffing the emitted bytes.
3. Every tool's annotations are explicitly true/false, never null/absent, and each hint MATCHES observed behavior.
   Especially: a tool annotated readOnlyHint:true or idempotentHint:true that in fact mutates or is non-idempotent.
4. audit_url on the hosted build refuses `click` interactions (see test/remote-click-guard.test.mjs and the
   derived description sentence). Refute: find an interaction shape that still performs a click, or a path that
   bypasses the guard, or a case where the guard over-refuses valid input.
5. The new tests are FALSIFIABLE, not decorative. Find an assertion that cannot fail, a fixture that passes against
   the defect it names, or a test that bypasses the real seam (e.g. skips zod `inputSchema.safeParse`).
6. The mutation harnesses grade honestly: `.claude/openai-rejection-2026-08-19/{empty,blank,click}-mutants.mjs`.
   Find a dead find-string, a mutant that fails to load, a control that is not behaviour-neutral, a declared baseline
   that no longer matches, or a survivor being reported as a kill.
7. Documented-vs-actual: conversations/2026-07-25-submission-dossier.md and web/app/docs/page.tsx claim behaviors.
   Find any claim there that the code does not actually deliver — that is literally R1.

Independently probe the live anonymous endpoint where useful.
Return ONLY numbered P1/P2/P3 findings with file:line evidence, then one final line: SURVIVES or DOES NOT SURVIVE.
