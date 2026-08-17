# Adverse falsification pass — raven-mcp v2.5.0 release integration

REPORT ONLY. Do not edit files. Your job is to falsify the claims below, not to confirm them.
Repo: /Users/accunliffe/projects/raven-mcp — branch `release/gauntlet-2.5.0`.

## Claims under audit

**C1 — The four-edge border change in `src/design-gauntlet.ts` is correct.**
The probe previously read `borderTopWidth` only. It now reads all four edges (`SIDES = ["Top","Right","Bottom","Left"]`), dedupes treatments per element via an `elTreatments` Set, and matches authored sub-pixel rules per side (`if (r.side !== side) continue`).

**C2 — `AUTHORED_RULE_CAP` 300 → 1200 is the right correction.**
Reasoning given: the cap counts ENTRIES, one rule now contributes up to four, so 300 bounded 75 rules. 4x restores the per-rule reach. Falsify: is the cap actually per-entry? Does the `break` in the inner SIDES loop vs the `return` in the outer loop leave a reachable state where `ruleOverflow` is set but some rules are silently half-read (some sides captured, others not) — and does a HALF-READ rule produce a WRONG answer rather than an ambiguous one? A partially populated `authoredRules` could make `matched` contain only the sub-pixel side and skip the >=1 side that should have forced ambiguity. That would be a false RECOVERY, which is worse than a false ambiguity. Check this specifically.

**C3 — The three new tests in `test/design-gauntlet.test.mjs` are falsifiable guards, not decoration.**
Measured mutants: `SIDES=["Top"]` radius 2; dropping `if (r.side !== side) continue` radius 1 (per-side test only, dying on its declared assertion "the bottom hairline is recovered on its own side"); dropping the `elTreatments` Set radius 1; a control reordering SIDES stays green. Falsify: is the SIDES-reorder control genuinely behaviour-neutral, or does push order into `authoredRules` change `matched[matched.length-1]` (the "last wins" source-order proxy) for any constructible input — e.g. when the cap truncates? Are there per-side defects NO mutant here would catch?

**C4 — The cherry-pick onto `origin/main` lost nothing that belongs in this release.**
Three commits were cherry-picked onto `origin/main`: `80d4f52` (design_gauntlet), `0e66cc2` (hairlines + device_scale_factor), `ceed571` (four edges). Deliberately LEFT BEHIND on `feat/gauntlet-hairline-provenance`: several `auto-save:` commits and `9ec2560` "Remove homepage tool ordinals". One conflict was resolved: `.claude/linear-backlog-queue.jsonl`, union-merged and deduped. Falsify: does any left-behind commit carry product code the gauntlet depends on? Did the union merge of the JSONL drop or duplicate anything? Did `manifest.json` / `README.md` / `CLAUDE.md` auto-merge into an inconsistent state (e.g. a tool count that disagrees between README, manifest, llms.txt, site/docs.html and the six count-asserting test suites)?

**C5 — The anonymous remote surface does not move.**
`design_gauntlet` is in `REMOTE_GATED_TOOLS`. Live production was measured BEFORE any push: 45 tools, sha256 of the newline-joined sorted names = `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, gauntlet absent. Falsify: is there any path by which this release changes the anonymous `tools/list` payload — including tool DESCRIPTIONS, schemas or server instructions, which the name-hash cannot see? Note the ledger's own warning that the 45-name hash under-specifies.

**C6 — The changelog surfaces are consistent and honest.**
`CHANGELOG.md` gained a `[2.5.0] - 2026-08-17` section; `web/data/changelog.json` gained a `v2.5.0` release; `site/changelog.html` was regenerated (34 releases). Falsify: do the two prose copies contradict each other or the code? Does either claim a behaviour the tool does not have? Is the stdio count stated (110 → 111) correct against the built `dist/`?

## Evidence available to you
- `RAVEN_NO_USAGE_LOG=1 npm test` on the pre-integration tree: 1576 tests / 1573 pass / 0 fail / 3 skipped, EXIT=0. Skips at log lines 109/751/752, the same three this repo has always carried.
- Gauntlet suite alone: 37/37, 0 skipped.
- `node scripts/sync-manifest-tools.mjs` → "Synced 111 tools", and `git diff manifest.json` was EMPTY afterwards.
- Session log: `conversations/2026-08-17-gauntlet-npm-release.md`.
- Ledger: `CLAUDE.md` "Ground truth" block — note its standing rules that repo/published/deployed are three different claims, that a count delta is not a coverage measurement, and that a mutation claim is falsifiable exactly like an assertion.

## Acceptance criteria
The release may proceed only if: the suite is green with the same three skips; the stdio surface is 111 with `design_gauntlet` absent from a `remote: true` build; the anon 45-name hash is unchanged; and no prose surface states a number or behaviour the code does not have.

## Target customer (attack from this angle too)
Primary: a product/design team making design decisions durable across people and AI agents; evaluates with IT/admin approval and data-handling questions in the room. Free tier: a solo indie developer, moderately technical, new to the MCP category, skeptical of AI-marketing fluff, bounces on vague copy and on anything that looks less polished than competing tools. Ask whether the changelog prose reads as concrete show-don't-tell to that solo dev, and whether `design_gauntlet`'s output would confuse someone who has never heard of the category.

Prioritise findings P1 (ship-blocking) / P2 (real defect, not ship-blocking) / P3 (claim or documentation defect). End with an explicit verdict line: SURVIVES or DOES NOT SURVIVE.
