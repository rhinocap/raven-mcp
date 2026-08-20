REPORT ONLY. Do not edit files. Your job is to REFUTE, not to confirm.

CONTEXT
Raven MCP was rejected by the OpenAI plugin directory for two reasons:
(R1) "One or more of your test cases did not produce correct results. Re-run all
submitted test cases and align tool behavior/output with the documented expected
outcomes. Ensure the same test cases pass consistently on both ChatGPT web and mobile."
(R2) "One or more of your tool's annotations do not appear to match the tool's
behavior. Confirm annotations are explicitly set to true or false (not null) for
every tool. Include a clear justification for why the hint is set that way based
on the tool's actual behavior."

The submitted surface is the ANONYMOUS hosted endpoint https://mcp.ravenmcp.ai/api/mcp
(45 tools), not the 111-tool local stdio build.

WHAT TO AUDIT
1. conversations/2026-07-25-submission-dossier.md, section B (from the line
   "## B. OpenAI plugin submission" to the end of the file). This is the text a
   reviewer will read. Every factual claim in it is under audit.
2. The uncommitted working-tree diff: .claude/openai-rejection-2026-08-19/agent-output/amended.diff
   (also readable as `git diff`). Files touched: api/mcp.js, src/audit-url.ts,
   src/compact.ts, src/contrast.ts, src/index.ts, test/taste-remote-full.test.mjs,
   web/app/docs/page.tsx.

WHAT I CLAIM (attack these)
- Every test case in the dossier now carries an inline fixture and an invariant,
  and every stated number was measured against the built tree on 2026-08-19.
- Every soft-error path on the submitted tools now returns isError: true.
- All 45 anonymous tools have all four annotation hints explicitly boolean;
  readOnlyHint=true, destructiveHint=false, idempotentHint=true on all 45;
  openWorldHint=true on exactly 5 (audit_contrast, audit_responsive_visibility,
  audit_tap_targets, audit_url, audit_video_playback).
- audit_page / score_page / audit_typography are openWorldHint=false on the hosted
  surface because the url argument is hard-rejected there by REMOTE_ARG_GUARDS,
  and their hosted descriptions now say so.
- The frozen anonymous 45-tool name hash
  f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6 is unchanged.

WHAT I WANT
Find (a) any claim in the dossier that the code does not support, (b) any
annotation that still does not match behavior, (c) any test case a reviewer could
run and get a different result than documented, (d) anything in the diff that
breaks the frozen anonymous surface or the description pin. Verify by reading the
code, not by trusting the dossier's own account of it.

Output: numbered findings, each with severity P1/P2/P3, the file:line, the exact
claim, and why it is false. Close with a one-line verdict: SURVIVES or DOES NOT SURVIVE.
