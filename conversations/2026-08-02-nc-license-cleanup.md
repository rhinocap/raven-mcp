# 2026-08-02 — NC-license cleanup (crash-resume instance)

## Where left off / context
Resumed the 2026-08-01 crashed session via its terminal-handoff screenshot. Executed its
next-moves: (1) unstaged `docs/spec-pattern-library.md` (now untracked `??` — deliberately
NOT committed; it belongs to the pattern-library thread, not this one); (2) ran the goal
brief `/tmp/drafts/2026-08-01-raven-nc-license-cleanup-goal.md` in this raven-mcp instance.

## Branch
`chore/nc-license-cleanup` (off main). Confirmed no other live Claude instance in this
worktree before switching (pgrep + lsof cwd check).

## What changed and why
Goal: remove every dependency on NC-licensed upstreams (Laws of UX CC BY-NC-ND 4.0;
Mailchimp style guide CC BY-NC 4.0) so the corpus is safe to monetize, plus a CLA.
Full per-file detail in `docs/nc-license-cleanup.md`. File list:

- `src/data/principles/laws-of-ux.json` — all 21 summaries rewritten from primary literature
- `src/data/brand/principles/visual-hierarchy.json` — lawsofux.com source URL removed
- `src/data/brand/principles/brand-as-system.json` — Mailchimp example → GOV.UK/Polaris/Atlassian
- `src/data/content/principles/ux-writing.json` — 3 Mailchimp citations → plainlanguage.gov/Polaris/NN.g
- `src/data/content/systems/mailchimp.json` — DELETED (option b: rebuilt generic)
- `src/data/content/systems/conversational-product-voice.json` — NEW, original prose
- `src/data/content/systems/registry.json` — entry swapped
- `src/data/service-design/patterns/omnichannel-continuity.json` — example brands swapped
- `NOTICE` — both NC blocks removed; permissive entries added
- `CONTRIBUTING.md` — stale MIT wording → Apache-2.0 + CLA (relicense/dual-license grant)
- `src/index.ts` — 2 description strings (mailchimp → conversational-product-voice); spec amendment, rename-required
- `manifest.json` — regenerated (`node scripts/sync-manifest-tools.mjs`); test-enforced consequence
- `test/taste-remote-full.test.mjs` — ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH → `cb3c1e5e…d9dccd7` (metadata hash; GOLDEN_45_HASH name-set UNCHANGED)
- `docs/nc-license-cleanup.md` — NEW report

## Verification (all run this session)
- `grep -ril "lawsofux\|styleguide.mailchimp" src/ NOTICE` → empty (exit 1)
- Case-insensitive mailchimp sweep → only the report describing the change
- Phrase-overlap harness (old vs new laws-of-ux summaries, git show main: baseline):
  21 entries, worst shared run = 3 generic words
- `RAVEN_NO_USAGE_LOG=1 npm test` → 1153 tests / 1150 pass / 0 fail / 3 skipped (clean run;
  an earlier run had 2 Playwright-teardown flakes that pass in isolation, 46/46)
- Loader smoke via built stdio server (scratchpad/loader-smoke.mjs): 7/7 PASS —
  get_principles(laws-of-ux), list_content_systems, get_content_system(new id),
  get_content_system('mailchimp') graceful not-found, get_brand_principles,
  get_content_principles, get_service_pattern(omnichannel-continuity)

## Flags for Andrew
- **Merging to main changes live mcp.ravenmcp.ai tool METADATA** (2 tool descriptions are
  anon-served). Tool NAME set / golden 45-hash unchanged. His push = the human gate.
- Memory tension: "No IP-cleanup framing in public artifacts" vs goal explicitly ordering a
  public `docs/nc-license-cleanup.md`. Goal (current message) wins; flagged.

## Push state
Committed locally on `chore/nc-license-cleanup`, NOT pushed — Andrew pushes (per goal).

## Sol falsification pass (post-commit) — dispositions
Nine objections on `main...db502a0` (its review predated the last two commits):
1. CONFIRMED — new voice file carried 4–10-word runs from the old mailchimp.json
   (which itself condensed Mailchimp's grammar sections). Fixed: full second rewrite,
   re-checked mechanically; survivors are JSON schema keys only.
2. PARTLY CONFIRMED — report said "20 entries" (it's 21): fixed. Selection-overlap
   with Yablonski's curation: documented as residual risk (category rename = follow-up,
   changes a tool enum). Aesthetic-usability description: grounded in the cited primary
   studies; no rewrite.
3. FIXED BEFORE REVIEW LANDED — README/LAUNCHGUIDE scrubbed in 889f844 (excluded from
   Sol's range). site/web survivors: deliberate follow-up (separate deploy surfaces).
4. FIXED BEFORE REVIEW LANDED — manifest long_description in 38d9544.
5. CONFIRMED — Polaris is not plainly permissive: dropped from the new file's sources,
   NOTICE reworded (original commentary, own license terms), shopify-polaris.json
   flagged as follow-up in the report.
6. CONFIRMED — Tesler/Occam have no primary paper: NOTICE + report now say "primary
   literature or earliest documented attribution".
7. ACKNOWLEDGED — the one-paragraph CLA is goal-specified; ICLA-grade gaps documented
   as residual risk for Andrew.
8. REJECTED — session log commits are standing practice (global CLAUDE.md), committed
   separately from the scoped change.
9. CONFIRMED — report had conclusions, not outputs: verification section now carries
   actual results; phrase-overlap coverage extended to the mailchimp replacement
   (which is what surfaced objection 1).
Post-fix re-verification: full suite 1153/1150/0 fail/3 skipped; loader smoke 7/7.

## Carried forward
- `docs/spec-pattern-library.md` untracked on purpose; §§1–8 unread this session (goal took priority)
- Prior session's pattern-library spec verification sections still untrustworthy per its own handoff
