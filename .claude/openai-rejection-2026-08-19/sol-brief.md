REPORT ONLY. Do not edit any file. Your job is to REFUTE the claims below, not confirm them.
Default to "objection" when you cannot independently verify a claim from the repo.

## Context
This is `raven-mcp`, an open-source design-intelligence MCP server. OpenAI rejected its
plugin submission for two reasons:

R1: "One or more of your test cases did not produce correct results. Please re-run all
     submitted test cases and align tool behavior/output with the documented expected
     outcomes. Ensure the same test cases pass consistently on both ChatGPT web and mobile."
R2: "One or more of your tool's annotations do not appear to match the tool's behavior.
     Please confirm annotations are explicitly set to true or false (not null) for every
     tool. Include a clear justification for why the hint is set that way based on the
     tool's actual behavior."

The REVIEWED surface is the ANONYMOUS remote build (`buildServer({ remote: true })`,
45 tools), NOT the 111-tool stdio build.

## The diff under audit
`.claude/openai-rejection-2026-08-19/agent-output/session.diff` (450 lines, vs HEAD).
Read it in full. Nothing in it is committed or pushed.

## The claims you must try to break

C1. ACCEPT HEADER. `api/mcp.js` now normalizes a missing or partial `Accept` header to
    "application/json, text/event-stream" before constructing the server. Claim: the MCP SDK's
    Web-standard transport (`webStandardStreamableHttp.js:375-380` for POST, `:188-189` for GET)
    applies an UNCONDITIONAL 406 gate using substring `includes()` tests, so a client sending
    `*/*` or only `application/json` gets a 406 before any tool runs; and that gate IS on the
    shipping path (`streamableHttp.js` is a thin delegating wrapper). REFUTE if: the gate is
    not actually reached on this path, the normalization is placed where it cannot affect the
    request the SDK reads, it mutates a header object that is a copy, it would break a
    conforming client, or it silently changes behavior for non-MCP requests to the same handler.

C2. isError. Claim: the SDK ALREADY produces `isError:true` for THROWN errors
    (`@modelcontextprotocol/sdk/dist/esm/server/mcp.js:118-139` wraps the call in try/catch),
    so ONLY return-shaped soft errors needed it, and 12 such sites plus the `audit_url`
    all-captures-failed case were given `isError: true as const`. REFUTE if: the SDK claim is
    wrong or version-dependent, any of the 12 sites is not actually a soft error, a genuine
    soft-error site was MISSED (search for other early-return error text in src/index.ts),
    or adding isError changes behavior for an existing consumer in a way that is itself a
    correctness regression.

C3. audit_url PREDICATE. The `audit_url` handler now sets isError when `captures.length === 0`.
    Note `auditUrl()`'s per-viewport catch (`src/audit-url.ts:168-174`) does
    `warnings.push(...); continue`, so an unreachable host returns NORMALLY. REFUTE the choice
    of `captures.length` over `warnings.length`: find a case where a PARTIAL failure (some
    viewports captured, some not) should be an error and now is not, or where zero captures is
    legitimately NOT an error.

C4. DESCRIPTION. `list_creative_models`' description no longer advertises a
    `RAVEN_CREATIVE_RUNNER` route, because the execution tool that route needs is NOT on the
    anonymous surface — a negative-case scope collision. Claim: sentence 1 is byte-identical,
    which is why `manifest.json` did not change (`scripts/sync-manifest-tools.mjs:146-156`
    takes only the first sentence via Intl.Segmenter then truncates at 120 chars, and
    `test/manifest-tools.test.mjs:10-17` deepEquals manifest.tools to the derived list).
    REFUTE if: sentence 1 is not byte-identical, the manifest SHOULD have changed, the new
    text is itself inaccurate about what the tool does, or other anon-surface tool descriptions
    have the SAME scope-collision defect and were left unfixed (this is the highest-value
    objection available to you — go looking).

C5. HASH REBASELINE. `test/taste-remote-full.test.mjs`'s
    ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH was rebaselined from
    fda3c22dbacc65455d42401a89abf850a6b87d84aab23c5046869a1dbd961e2d to
    2337775946122e3019e990939b2cb46c27daa65b0fb327c19c91305b105fdbd7. Claim: this pin is a
    LEAK-guard (authed tuning must not appear in an anon build), not a freeze-guard; it has been
    rebaselined twice before; and the move was MEASURED, not assumed — substituting only
    list_creative_models' old description back into the payload reproduced the old hash exactly,
    proving no other description moved. REFUTE if: the pin is load-bearing in a way the
    rebaseline defeats, the measurement does not establish what is claimed, or the golden
    45-tool NAME hash f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6 or the
    instructions hash 3ccce9cf2e9366439f0ffed251815176bb7ee7b78ace0f03252c6c7807090658 moved.
    THESE TWO MUST NOT HAVE MOVED — verify independently.

C6. src/contrast.ts. A launch-catch classification change rethrowing /capacity busy/i.
    Verify it cannot swallow or mislabel a real failure, and that the rethrow cannot escape
    somewhere that previously degraded gracefully.

C7. COMPLETENESS AGAINST R1/R2. The strongest objection you can raise: given the two rejection
    reasons verbatim above, what in this diff FAILS to address them, and what has been changed
    that OpenAI did not ask for and that could introduce a NEW test-case mismatch? Specifically
    consider: does anything here change the OUTPUT of a documented test case in a way the
    submission dossier (`conversations/2026-07-25-submission-dossier.md` section B) no longer
    describes correctly?

## How to verify
`npm run build` then `node --test test/<file>` for targeted suites. Do NOT run the full suite.
Do NOT edit source. Note that `setRemoteRuntime()` is a one-way per-process latch, so a
remote:true build and a local build cannot share a node process. An ad-hoc script importing
project deps must live inside this repo, never /tmp.

## Output
A numbered list of OBJECTIONS ranked most-severe first. For each: the claim, why it fails, the
file:line evidence, and the concrete failure scenario. Then a short list of claims you
independently CONFIRMED with the command you used. Say "no objection" only where you actually
checked.
