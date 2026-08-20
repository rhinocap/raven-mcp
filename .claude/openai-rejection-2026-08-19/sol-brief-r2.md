# Adversarial audit — round 2, OpenAI rejection remediation (REPORT ONLY, do not edit any file)

Repo: /Users/accunliffe/projects/raven-mcp (public, real external consumers).
Complete uncommitted diff: `.claude/openai-rejection-2026-08-19/agent-output/amended.diff`
— generated with `git diff HEAD` (round 1 used plain `git diff`, which is blind to
staged content; that was your own finding 7). Regenerate it yourself if you doubt it.

## What OpenAI rejected

R1: "test cases did not produce correct results ... ensure the same test cases pass
consistently on both ChatGPT web and mobile."
R2: "annotations do not appear to match the tool's behavior ... explicitly set to
true or false (not null) for every tool, with justification."

Reviewed surface = the ANONYMOUS endpoint `https://mcp.ravenmcp.ai/api/mcp` (45 tools).

## What round 1 established, so you do not re-derive it

The live endpoint is built from `main` and serves COMMITTED code. Every fix in this
diff is UNCOMMITTED. So live-endpoint evidence cannot refute a working-tree claim,
and vice versa. Round 1's findings 1a/1c/2/3 were all "already fixed in the tree,
unshipped"; 4/5/6/7 were genuine. This round audits the TREE.

Build first: `npm run build` (dist/ is gitignored; never reason from mtime).
A registered tool's callable is `handler`, not `callback`:
`await s._registeredTools[name].handler(args, { signal: new AbortController().signal })`.
Calling `handler` directly BYPASSES zod validation — a throw reached that way is a
probe artifact, not a reachable path. Re-test any error path with a schema-valid
payload before calling it a defect.

## Claims to REFUTE (do not confirm — try to break each)

1. `conversations/2026-07-25-submission-dossier.md` now states honestly that the
   surface it documents does not exist until Andrew pushes to `main`. Refute by
   finding any remaining sentence in it that asserts a live property as current.
2. Every measured number in section B is reproducible against the built tree with
   the stated inline fixture. Re-run them. Any that is not is a P1 — this is the
   exact class that caused R1.
3. Every return-shaped soft-error path on the 45 anonymous tools now carries
   `isError: true`. Enumerate them exhaustively (do not trust the 73-vs-47 count in
   the dossier; derive your own) and find one that still returns error-shaped text
   without the flag.
4. No tool on the anonymous surface returns a SUCCESSFUL-looking result for an input
   that produced nothing. `compose_system` with an unmatched token group was exactly
   this and is claimed fixed. Find another (empty filters, unmatched ids, no-op
   arguments that silently yield an empty-but-valid object).
5. The remote build emits all four annotation hints as booleans on all 45 tools, and
   `openWorldHint` is `true` on exactly the tools that can reach the network on THIS
   surface. Refute either half.
6. The `api/mcp.js` Accept-header normalization is safe: the endpoint is stateless,
   never opens an SSE stream, and always answers JSON — so accepting
   `text/event-stream` on the client's behalf promises nothing undelivered. Refute by
   finding a request shape where it now opens a stream, changes status semantics
   beyond the documented 406→-32600 case, or breaks a conformant client.
7. The dossier's `audit_page` description matches `src/page-checks.ts`: findings carry
   `severity, rule, message, fix` and no selector, and that absence is now stated.

## Known-open, do NOT report as new

- `audit_url` is annotated readOnly/idempotent while executing `page.click()`
  (`src/index.ts:4627-4643`, `src/capture.ts:499-512`). Andrew-gated product call.
- `src/browser-launch.ts:401,403` concurrency cap. Andrew-gated.
- The push to `main` itself. Andrew-gated.

Return ONLY numbered P1/P2/P3 findings with file:line evidence, then one verdict line:
SURVIVES or DOES NOT SURVIVE.
