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

A focused second Sol pass on the rewritten voice file then found six STRUCTURAL
traceability findings (identity metaphor, humor-fade rule, billing sequence, never-list
order, pattern selection/order, bad-button set) — word swaps had passed the mechanical
check while the architecture still tracked the predecessor. Third version re-architected
(new tone contexts incl. waiting-and-progress, new never membership, new
destructive-confirmations pattern, reordered grammar/patterns, new framings). Overlap
harness after: one 4-word run ("example good we couldn't" — JSON keys + a generic
contraction). Full suite + loader smoke green again. Lesson logged: a mechanical
word-run check does not verify structural independence; the two checks are different
claims.

## Carried forward
- `docs/spec-pattern-library.md` untracked on purpose; §§1–8 unread this session (goal took priority)
- Prior session's pattern-library spec verification sections still untrustworthy per its own handoff

## Pattern-library spec verification fan-out (post-cleanup, same session)
Andrew: "Go, and make sure to fan out far and wide" → 29-agent Workflow (wf_96eed626-115)
verified every claim in docs/spec-pattern-library.md against the tree at 5747efb:
15 section verifiers + 2 web agents (licensing/product facts) → adversarial refute stage
on all 19 negative findings → cross-section completeness critic. 406 claims checked,
4 findings overturned by refuters (incl. a false alarm on the Mobbin/Refero/Screensdesign
ToS claim — the refuter fetched all three ToS docs and confirmed the spec), 11 survived.
Corrections appended to the spec as §17 (now 718 lines): textSearch can't rank (Phase 2
decision), framer-motion 12 is WAAPI-hybrid (scrub path live on the worked example's own
target), audit_layout has no url param, evaluate_design already ships the pixel-diff
trick, voyage free tier is lifetime not monthly, parakeet is CC-BY-4.0 (voice rationale),
Web-Speech "per MDN" misattributed, Mobbin doctrine renamed fair use, Excalidraw ~345KB,
count fixes (11-tool taste surface, ten inputs, three bridge routes, spacing regex :554),
scroll_settle path exists. Three browser-platform claims remain GUESSED, marked in §17.
The handoff's "verification sections untrustworthy" flag is cleared with §17 applied.

## Auto-save hook incidents (running tally: 3)
The auto-save hook committed docs/spec-pattern-library.md onto this branch twice more
after the first rebase-out: (2) commit 0ac31bb as HEAD — removed by resetting HEAD back
one commit (mixed); (3) re-staged (AM) after the §17 append — removed by unstaging the
path. Spec is untracked (??) with a current backup at the session scratchpad
spec-pattern-library.SAVE.md. Any future commit on this branch must use explicit-path
commits only and must re-check status immediately before committing. Branch remains
8 commits, spec in zero of them.

## Next (pattern-library thread)
Blocked on Andrew's NC push. Then: branch feat/pattern-library off updated main, commit
the spec (with §17), Phase 0 per §13 — spec claims now pre-verified, drift pre-corrected.

## Sol falsification pass on §17 (done-gate disposition)
GPT-5.6-Sol (medium, read-only) falsified the §17 addendum itself. Four objections,
all real, all against §17's own accounting (Sol spot-checked corrections 1/3/4/11
against source and corroborated them): (1) "4 overturned" was wrong — the raw journal
holds exactly 3; (2) the framer-motion correction upgraded a "likely" finding to
"verified" — downgraded to expected-pending-live-probe, Phase 3 pre-measurement is the
probe; (3) the licensing web agent dispositioned 14 of its 15 claims — coverage gap
now stated in §17; (4) "every checkable claim" contradicted the GUESSED list —
narrowed to repo claims. All four fixed in the spec (§17 header, correction 2, new
coverage-gap note). Scratchpad backup refreshed. Auto-save incident #4 (re-staged AM
after the edits) — unstaged; tally now 4; spec still untracked, in zero commits.

## Branch pushed (Andrew: "Push it")
Pushed chore/nc-license-cleanup to origin at ab000dd (10 commits). Pre-push: fetch +
remote reconcile clean, full suite 1153/1150/0/3 green. Post-push: ls-remote sha equals
local HEAD; spec in zero pushed commits; no workflow triggers on push (all cron or
manual dispatch); production untouched — merge to main remains the human-gated,
endpoint-touching step. Sol falsification pass on the push claim: one real objection —
the auto-save hook had committed the spec onto the LOCAL tip (68b6e3d) after the push
(incident #5); remote confirmed clean (PUSHED_SPEC_ABSENT), local tip reset back to
ab000dd, spec untracked again. Tally now 5. The no-IP-framing tension was re-checked
against the transcript: the goal's ordered public report won and Andrew pushed with
that flag — the public cleanup framing is the approved state.

## Merged to main and live (Andrew: "Merge it")
Pre-merge: production anon hash probed and equal to golden. PR #52 (base main,
verified) merged at e34503d. Deploy live ~50s later; post-deploy verification against
the running endpoint: 45 tools, golden hash unchanged, both updated description
strings serving, "mailchimp" absent from the live payload. Sol falsification pass on
the merge-and-deploy claim: NO OBJECTIONS. Branch feat/pattern-library created off
e34503d; spec committed there as 1f1ca04 (spec alone via --only; the hook had staged
an unrelated scoreboard file). NC-cleanup thread is fully closed; Phase 0
(compose_build_prompt) begins.

## Phase 0 build: compose_build_prompt (post-crash resume, twice-compacted)
Task #1–#4 complete on feat/pattern-library, committed 836e171 (explicit --only paths,
13 files). src/reference-prompt.ts (~720 lines): §9 skeleton types, lint (colorless/
typeless/sizeless — hex/px/font/pixel-kind throw), binding ladder alias→canonical→
fuzzy(≥0.8 Levenshtein)→unresolved, quantile ramps (type./space.), ±40ms motion snap
vs motion.duration.*, DESIGN.md→registry.json→repo-scan inventory ladder, fixed-order
prompt with prohibitions from in-scope negative_prompts + taste decisions + active
graph decisions read DIRECTLY via listActiveDecisions() (never decision_list —
consultation-trace purity proven by test with a decision_list control). Contested
decisions land under ## Gaps. Late amendment: design_notes now emitted in the
Acceptance section (§13 "every design_notes key" requires it — the composer had only
fed them to buildHints). Registration: readOnly, REMOTE_GATED_TOOLS (anon 45 + golden
hash verified by effect at registration time), counts 105→106/60→61 across three
comment blocks + six tests. manifest.json/README/both llms.txt regenerated. New test
file: 5 tests, all first-run green; full suite 1158/1155/0/3.

Auto-save incident #6: the hook committed the foreign openweight-scoreboard.jsonl as
278d72f on this branch. Unpushed + HEAD-only → soft-reset to 0c27553, file returned
to working tree untouched. Tally now 6.

Next: push feat/pattern-library, open PR (Andrew gates the merge — main deploys the
endpoint), then the one-hour pre-gate comparison (composed prompt vs one-line
instruction; "if it is no better, delete the tool") and Andrew's blind A/B.
