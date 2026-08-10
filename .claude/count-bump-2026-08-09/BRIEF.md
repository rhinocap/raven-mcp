# Falsification brief — site tool-count bump to 110 (commit 024e81c)

REPORT ONLY. Do not edit files. Your job is to REFUTE the claim below, not confirm it.
Repo: /Users/accunliffe/projects/raven-mcp

## The claim under audit

"The marketing site now correctly states 110 tools — the number a visitor can
install from npm today — and both of its tool enumerations agree with that
number. The push (024e81c) did not change what the live MCP endpoint serves."

## Evidence offered

1. npm `raven-mcp@2.4.0` is published. Its installed `tools/list` answers **110**
   over stdio. (A grep of `dist/` for `server.tool("...")` returns 111 unique
   names and was DISCARDED as an instrument — one matched string is not a
   registration.)
2. `web/lib/counts.ts` `TOOL_COUNT` 105 -> 110.
3. `web/components/tools/ToolsSection.tsx` gained 5 entries:
   capture_reference, search_references, map_reference_to_tokens,
   forget_references (Act 03 Design, 20 -> 24) and generate_mood_board
   (Act 05 Judge, 10 -> 11). Act totals: 18+15+24+26+11+14+2 = 110.
   That file derives LISTED_TOOL_COUNT from its own array and throws at module
   scope on a mismatch. The guard was falsified: TOOL_COUNT=111 fails the build
   with "ToolsSection lists 110 tools but TOOL_COUNT is 111"; restored to 110
   builds clean.
4. `web/app/docs/page.tsx` holds a SECOND enumeration: 19 layers, each declaring
   a per-layer count (`rd-layer-count`) above per-tool cards (`rd-tool-name`).
   Measured before: declared 105 / cards 105 / 19 layers, every layer agreeing.
   Five tool cards added (DESIGN.md & Grab 12->16, Taste Engine 10->11).
   Measured after: declared 110 / cards 110 / 19 layers, every layer agreeing.
   NOTE: this page has NO build-time guard. Stated as a residual.
5. Same file also fixed a stale claim: `list_content_systems` named "Mailchimp",
   removed from the corpus in 3dafabb. Replacement names were read from the
   INSTALLED 2.4.0 package's content registry: GOV.UK, Shopify Polaris,
   Atlassian, conversational-product-voice. The adjacent "12 design systems"
   claim was ALSO measured (12 registry entries, 12 files) and left unchanged.
6. Endpoint untouched: `git diff --name-only origin/main..HEAD` before the push
   listed only web/ and conversations/ files; no src/ or api/.
   Post-push, production deployment dpl_HDKdDiDpze2QHvNz5APoiqRyv1gF reports
   commit 024e81c, branch main, READY, and its alias list carries
   mcp.ravenmcp.ai. Anonymous POST tools/list to https://mcp.ravenmcp.ai/api/mcp
   returns 45 tools, sha256 of newline-joined sorted names =
   f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6 — the frozen
   golden hash, MATCH.
7. Sweep for count-shaped literals bypassing counts.ts across web/ (excluding
   node_modules/.next) found only: public/llms.txt (already says 110 in two
   places) and data/changelog.json (historical per-release notes: 99, 100, 105,
   110 — correct as history and deliberately not edited).

## Explicitly NOT claimed

- ravenmcp.ai (the apex) is NOT updated. The `web` Vercel project has no git
  integration; only a manual `cd web && vercel deploy --prod` moves it, and that
  is the user's to run. So "the live site shows 110" is NOT part of this claim.

## Attack these specifically

a. Is 110 actually the number a visitor installing raven-mcp@2.4.0 gets? Verify
   independently. Is the 111-vs-110 discrepancy explained, or is one tool
   silently registered-but-unlisted / listed-twice / gated in a way that changes
   the honest public number?
b. Do the two enumerations REALLY agree, or does the parse that "measured" them
   have a hole (duplicate ids, a tool card outside a layer, a layer whose
   declared count string is not what the page renders, an entry counted twice)?
   Re-derive both counts yourself with your own parser.
c. Are the 5 added descriptions faithful to the registered tool descriptions in
   src/index.ts, or do they overclaim / describe behaviour the tool lacks?
d. Is the Mailchimp replacement list right? Does the shipped corpus actually
   contain exactly GOV.UK, Shopify Polaris, Atlassian and a conversational
   product voice — no more, no fewer? Check the PUBLISHED package, not just src/.
e. Any OTHER stale claim on the site invalidated by 2.4.0 (design-system count,
   principle count, pattern count, layer count, "12 design systems", "129
   principles", "22 patterns", audit platform list)? Count them in the shipped
   package and name every mismatch.
f. Anything about the push that could have moved the frozen endpoint surface
   that the 45-name hash would NOT catch (schemas, descriptions, annotations,
   server instructions text)?

Report findings as P1/P2/P3 with file:line and the exact command that proves
each. End with a verdict line: SURVIVES or DOES NOT SURVIVE.
