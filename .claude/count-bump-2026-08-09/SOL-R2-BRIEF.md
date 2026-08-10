# Adverse falsification brief — round 2 (report only, do not edit files)

You are auditing a DISPOSITION, not a feature. A prior adverse pass (round 1) on the
raven-mcp marketing site returned four findings. This round audits how they were
dispositioned and whether the applied fixes are correct and complete.

Repo: /Users/accunliffe/projects/raven-mcp
Commit under audit: fdd912e (pushed to origin/main). Its parent is 2f46812.
Diff to read: `git show fdd912e`

## The claim you are asked to REFUTE

"All four round-1 findings are correctly dispositioned. Two were fixed and pushed
(P2-2 Mailchimp, P2-3 overclaiming tool summaries); two were reported to the user
unfixed with stated reasons (P2-1 corpus counts, P3-1 nine-vs-19 layers). The fixes
are complete — no remaining live call site makes the corrected claim — and they are
accurate against the shipped code and data. Nothing in the commit touches src/ or
api/, so the live MCP endpoint at mcp.ravenmcp.ai is unchanged; the anonymous
45-tool golden hash was re-measured post-deploy and matches
f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6."

## Round-1 findings and their disposition

P2-2 (FIXED). Mailchimp was removed from the shipped content-system registry in
commit 3dafabb but survived in site copy. Round 1 named one call site. The
disposition claims FOUR live call sites existed and all four are now corrected:
web/app/page.tsx (Content Systems paragraph + tag chip list),
web/app/docs/page.tsx:300 (list_content_systems description),
web/app/docs/page.tsx:~1429 (file-tree diagram comment).
The shipped four systems are claimed to be, read off src/data/content/systems/:
gov-uk, shopify-polaris, atlassian, conversational-product-voice.
Two Mailchimp mentions were LEFT deliberately:
 - web/app/docs/page.tsx:1520 — a provenance sentence about where 132 UX-writing
   principles were curated from. Claimed to be a different, non-falsified claim.
 - web/data/changelog.json:403 — a historical release note. Claimed correct as history.

P2-3 (FIXED). Three tool summaries in web/components/tools/ToolsSection.tsx
promised guarantees the tools do not make:
 - capture_reference "plus a thumbnail" -> "with a thumbnail rebuilt offline where
   the markup allows"
 - search_references "each result carrying its picture" -> "its thumbnail where one
   exists"
 - forget_references "confirmed and pinned" -> "confirmed and pinnable"
Justification claimed: capture_reference commits the record BEFORE attempting the
offline render and returns null on any failure; forget_references takes
expected_ref_ids as an OPTION and reports when an unpinned sweep may have missed
something (see src/index.ts around lines 3600-3630).

P2-1 (REPORTED, NOT FIXED). The site states "129 principles / 22 pattern sets" in
several places while web/app/docs/page.tsx:1520 states 132 and 23. Claimed
pre-existing, not authored by this change, spanning 6+ call sites, and complicated
by a duplicated `peak-end-rule` id making the true unique count 131 rather than 132.

P3-1 (REPORTED, NOT FIXED). The homepage says "Nine layers" while LAYER_COUNT in
web/lib/counts.ts is 19 and the docs page renders 19 groups. Claimed to be two
genuinely different taxonomies, neither page distinguishing them.

## What to attack

1. Is the "four call sites" count actually complete? Search the whole repo — not just
   web/ — for any REMAINING live claim naming Mailchimp as a shipped content system,
   or any other stale system name, in user-facing copy. Include web/public/llms.txt,
   README, manifest.json, site/, and any JSON-LD or metadata.
2. Is "conversational product voice" the correct human-readable name? Read
   src/data/content/systems/registry.json and the individual system JSON files and
   check the name the TOOL actually returns. If the site now says something the tool
   never says, that is a new defect introduced by the fix.
3. Is the count still 4 everywhere it is asserted, and does anything assert a count
   that the registry contradicts?
4. Are the three rewritten tool summaries now ACCURATE, or have they traded an
   overclaim for a different inaccuracy? Read the actual implementations
   (src/reference-store.ts, src/reference-thumbnail.ts, src/index.ts) and check each
   rewritten phrase against what the code does. In particular: does
   "where the markup allows" correctly describe the failure modes, or does it imply
   markup is the only reason a thumbnail can be missing?
5. Is leaving docs/page.tsx:1520 defensible? Read it and decide whether it makes a
   claim about the shipped registry that is now false.
6. Does anything in the commit change what mcp.ravenmcp.ai serves? Verify
   independently of the author's reasoning.
7. Is the build-time guard (LISTED_TOOL_COUNT vs TOOL_COUNT in ToolsSection.tsx)
   still intact and still able to fail?
8. Any factual error in the two REPORTED findings' descriptions — e.g. is the
   duplicated `peak-end-rule` claim true, is 131 the right unique count, is
   LAYER_COUNT really 19?

Report findings as P1/P2/P3 with file:line evidence. End with a single line:
`VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE (<counts>)`.
Report only — make no edits.
