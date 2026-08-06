# Correctness review — is this branch safe to push to a live production endpoint?

Report-only. Do not edit files. Return findings ranked by severity, each with the
concrete sequence or input that produces the wrong outcome. If a concern is
theoretical rather than reachable, say so explicitly.

## The claim under review

"These 36 commits on `main` are safe to push. The full suite passes, the frozen
anonymous tool surface is unchanged, and pushing will not change what anonymous
callers of the hosted endpoint see."

## Why the stakes are real

`mcp.ravenmcp.ai` is a hosted remote MCP endpoint with real per-user OAuth
(WorkOS AuthKit) and per-user Redis storage. It was unpinned from a feature
branch on 2026-07-27 and now follows production `main`. So **a push to `main`
touching `src/` or `api/` deploys straight to that live endpoint.** This branch
touches six `src/` files: `contrast.ts`, `grab-bridge.ts`, `index.ts`,
`reference-store.ts`, `reference-thumbnail.ts`, `reference-tokens.ts`.

There is a frozen invariant: the ANONYMOUS surface must expose exactly 45 tools
whose newline-joined sorted names sha256 to
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
Everything beyond those 45 must sit in `REMOTE_GATED_TOOLS`.

## Evidence gathered before the push

1. `RAVEN_NO_USAGE_LOG=1 npm test` — 1324 tests, 1321 pass, 0 fail, 3 skipped,
   44.3s.
2. Local frozen probe against a freshly built `dist/`, constructing the stdio
   server explicitly as `buildServer({ remote: false, tasteStore: new
   FsTasteStore() })` — printed `109 45 f64bb18…2bb0a6`. That is 109 stdio
   tools, 45 anonymous, hash matching the golden.
3. Live production probe BEFORE the push — POST `tools/list` to
   `https://mcp.ravenmcp.ai/api/mcp`, 45 tools, hash matched the golden exactly.
4. The one user-facing fix in this branch (overlay panel scroll preservation)
   was confirmed by the user on his own live surface, not only in a fixture.

## What to attack

1. **Is the local probe measuring the thing that ships?** `dist/` is gitignored
   and the deployed endpoint is built from source by Vercel. Name any way the
   locally built `dist/` and the deployed build could disagree about the tool
   set — stale artifacts, a build step the probe skips, environment-dependent
   registration, a tool registered only under some `process.env` condition.
2. **Is the 45-tool hash the right invariant, or does it under-specify?** Two
   tool sets with identical NAMES can differ in schema, annotations, description,
   or behaviour. Does anything in these six `src/` files change what an existing
   anonymous tool DOES, or what it accepts, while leaving its name alone? That
   would pass every check above and still be a live behaviour change for
   anonymous callers.
3. **`src/index.ts` and `src/grab-bridge.ts` specifically.** The grab bridge is a
   local stdio-only surface, but it lives in the same module graph. Can anything
   it now does execute in the hosted runtime — a top-level side effect, a listener,
   a filesystem touch, an import with a cost — where there is no local filesystem
   and the process is shared?
4. **The pattern-library tools** (`capture_reference`, `search_references`,
   `map_reference_to_tokens`, `forget_references`) are claimed to be gated. Verify
   the gating actually holds on the REMOTE path rather than only in the stdio
   construction the probe used. A gate that is applied in one construction path
   and not the other passes a stdio-built probe and leaks in production.
5. **Filesystem assumptions.** `reference-store.ts` and `reference-thumbnail.ts`
   write records and render PNGs through headless Chromium. In a serverless
   runtime there is no persistent writable filesystem and no bundled browser.
   If any of that can be reached remotely, what does it do — throw a clean error,
   hang, or crash the function for every other caller sharing the instance?
6. **Rollback.** If the deploy is wrong, what is the actual recovery, and is any
   of this one-way? Per-user Redis writes, a schema change to stored records, or
   anything that a redeploy of the previous commit would NOT undo.
7. **Anything else in the diff that reaches production and was not named above.**

Return: findings ranked by severity, each with its reproduction sequence, and an
explicit verdict on whether the claim SURVIVES or DOES NOT SURVIVE.
