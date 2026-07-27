# Morven loop — W2 decision-graph stack merge guide (as of it65, 2026-07-20)

Purpose: make the loop's it49→it64 branch stack **reviewable and mergeable in one pass**. Written because the honest bottleneck is distribution/adoption (Andrew/platform-gated), and the one thing the loop *can* do to help is make the already-built substrate easy to land. Nothing here is new product surface.

## The key fact
The loop stack is **one linear chain**: `it49 → it52 → it53 → it54 → it57 → it58 → it59 → it61 → it62 → it63 → it64`. Each branch is a git ancestor of the next, and **it64's tip (`445627f`) contains all of them**. So:

> **Merging the `it64-decision-governed-block` tip merges the entire linear W2 stack in a single merge.** You do not need to merge 11 branches individually.

Verify: `git merge-base --is-ancestor it49-repo-decision-store it64-decision-governed-block` → true; `git log --oneline origin/main..it64-decision-governed-block` shows the whole chain.

## What lands (in dependency order) if you merge it64
| Branch | Tip | Adds | Surface / safety |
|---|---|---|---|
| it49-repo-decision-store | e1d9e02 | `.raven/decisions/` fs store + decision graph (DecisionNode/Evidence/edges), decision_* tools | new tools; the substrate everything else builds on |
| it52-decision-instrumentation | e92b45d | consultation instrumentation on decision reads | tool-traced metric plumbing (metric (b)) |
| it53-consultation-proof | 536f866 | outcome-linked consultation proof | proves metric clause (c) |
| it54-consult-first-instruction | 9624bf2 | consult-first AGENTS.md installer nudge | habit-formation, no tool change |
| it57-author-attribution | 9bd42aa | `author` field on captured decisions | schema add |
| it58-author-trust | 499fb87 | `author_trust` (extracted vs confirmed) provenance gate | schema add; spoofable via env (NOT authenticated identity — see ceiling) |
| it59-github-review-import | b48f6b7 | `scripts/import-github-review.mjs` (pure formatter) | script only, no network/token |
| it61-figma-comments-import | 6cee744 | `scripts/import-figma-comments.mjs` (pure formatter) | script only, no network/token |
| it62-contrast-polish-closure | bb30940 | `scripts/raven-polish.mjs` (propose→apply→re-audit loop, rescued from it24) + contrast-closure test | CLI; applies token fixes to real files behind git-apply guards |
| it63-decision-attributed-findings | 68b58b1 | `governed_by` on findings + `governed_findings[]` in review_diff | **additive; byte-identical when no decision governs** |
| it64-decision-governed-block | 445627f | opt-in `fail_on_governed` (governed findings → fail verdict) | **additive; byte-identical when absent/false** |

Test tally at the tip: **807 pass / 0 fail / 1 known-skip** (1 pre-existing AC9 score_page concurrency flaky, documented in raven-opportunities.md — passes in isolation). Anonymous 45-tool golden hash **unaffected** (it57–it64 added no MCP tools; it49/it52 added the decision_* tools which are local-stdio only).

## Three things that need a decision at merge
1. **`fail_on` vs `fail_on_governed` overlap (Fable branch).** A separate branch `origin/fail-severity-tier` (`2cee698`, a Fable 5 session, forked *before* it63) independently added a **rule-based** `fail_on: string[]` to the same `review_diff`. it64 added a **governance-based** `fail_on_governed: boolean`. Both only raise finding severity to `error`, so they compose semantically, but they **collide** on the 5th positional param of `reviewDiff` and on the `severity_policy` result shape. Recommended reconciliation: fold both into one options bag — `reviewDiff(diff, designMd, decisions, project?, { fail_on?: string[], fail_on_governed?: boolean })` — and union `severity_policy` to `{ fail_on?: string[]; fail_on_governed?: boolean }`. Both are off-by-default so neither regresses existing callers.
2. **it51-dogfood-decisions (`df162bc`) is NOT in the linear stack** — it forks from a different main base (`75efb12`) and is not an ancestor of it64. It's dogfood test data (self-authored decisions). Merge it only if you want that seed data in the store; it does not gate any of it52→it64. Likely obsolete — safe to drop.
3. **Telemetry (`scripts/postinstall.cjs`)** — the one loop-side 2.0 checklist item; recommendation stands: remove it before the 2.0 cut (Andrew's call).

## Honest ceiling on what this stack IS (so the merge isn't oversold)
- The decision graph is **single-file local** — no shared/hosted store, no authenticated identity, no multiplayer. The paid thesis (multiplayer graph → hosted org tier) is **not in this stack** and is Andrew/platform-gated.
- review_diff's decision governance (it63 association + it64 escalation) is **lexical scope+category match, NOT verified contradiction** — a strict-mode signal a team opts into, not a turnkey safe blocker.
- The leading metric (organic non-author consultation) is **0** — this stack is capture + gate *mechanism*; it does not create adoption. The dogfood `.raven` graph currently holds **0 decisions**.
- Everything is **branch-local/unmerged and unadopted**; nothing here has been validated by a second user.

This guide is descriptive only. The loop does not merge to main or cut releases — that's Andrew's.
