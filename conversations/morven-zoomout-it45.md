# Morven loop — ZOOM-OUT it45 (every-5th; strategic, no build)

*2026-07-19. Fifth-iteration zoom-out. Since the it40 zoom-out, the loop ran the merge-readiness/validation program it40 prescribed: it41 (safe merge order), it42 (combined-tip build+test), it43 (first real competitor bench), it44 (dogfood a landed tool → a real bug, fixed on a branch). This zoom-out asks the standing question — could the paying team cancel Figma today, and what is the single biggest blocker — and re-ranks the backlog. Matrix is fresh (2026-07-18, refresh due 2026-08-01); no re-research. Sol adverse (constrained, report-only) returned **FLAWED with 12 findings** on the first draft and was right on the central point — the draft repeated it40's failure mode in reverse (self-flattery + a manufactured queue to dodge the park question). This version is the corrected one; the 12 resolutions are logged in the it45 loop entry.*

## What the four iterations since it40 changed — precisely

Nothing on the **capability** axis (it30 ruling: cells move only on merge to main; it41–44 merged nothing). They reduced *some* of the risk between "10 open PRs" and "cut 2.0" — but less than the first draft claimed:

- **Merge order** proven by cumulative sequential simulation; one intrinsic auto-unionable README conflict (it41).
- **Combined tip builds + tests green** — 821/820/0/1 (**1 non-pass skip, not asserted harmless**), no dep delta (it42). *Scope, unchanged: integration-health on a **symlinked-deps** tip — NOT a clean-room `npm ci`, NOT pack/publish/artifact-load correctness, NOT a release certification.*
- **Competitor bench exists** — axe ran headless; gap #3 is *understood* (a self-authored corpus can't measure differentiation), not closed (it43).
- **One shipped-tool reliability defect found + fixed on a branch** — `audit_tap_targets`; fix unmerged on `tap-target-desktop-warning` (it44).

## The correction: "fully de-risked / purely human blocker" was wrong

The first draft said the distribution axis carries "zero remaining technical risk" and the blocker is "purely a human action." That **launders unresolved technical validation into Andrew's merge click** — the opposite-direction version of it40's absolutism. Real technical unlocks remain that the loop can close **without Andrew**:

1. **Per-PR review evidence for the 9 PRs.** it40 explicitly prescribed a "per-PR review packet"; the loop computed order/conflict/build/test but **never actually reviewed the PRs**. A passing combined-tip suite does not surface design/security/compatibility/maintainability defects in unreviewed code. This is the biggest missed leg.
2. **Clean-room release smoke.** `npm ci` from a clean tree + `npm pack` + install the tarball + load it as an MCP server + tool-count/`manifest` check — none of which the symlinked-deps build exercised.
3. **Document the 1 skip** — identify it, confirm it is the known conditional, don't wave it through.

So the honest statement: **2.0 is conflict/build/test-clear, NOT release-certified.** The single biggest blocker to *shipping* is still the human merge+release action — but the loop is **not** out of release-critical technical work; the bounded release audit above comes first, and it is entirely no-Andrew.

## Both-persona end-to-end: could the team cancel Figma today?

**No — on two separate axes (kept separate to avoid the it40 conflation trap), and this is a narrowed thesis, not a distribution-delayed win.**

**Axis A — evaluation.** Gated by distribution *for the published product and broad adoption* — **not for all evaluation**: a team that builds from `main`/the combined tip can evaluate the full 93-tool surface **today** (internal/technical/workflow/qualitative). What distribution blocks is convenient product evaluation and adoption at scale. (First draft's "100% gated by distribution" was false — Sol #4.)

**Axis B — replacement.** Even fully distributed, a full cancel independently fails on **prototyping + existing history (files/versions/comments) + admin/SSO** (matrix migration table). And clearing those is **necessary-not-sufficient**: real replacement also needs proof of collaborative-workflow fit, reliability at scale, interoperability, governance, and switching economics — none established. **Honest thesis, named plainly: Morven today is not a Figma-license replacement. It is an intelligence layer that supports a seat *downgrade*.** That is a narrowed ambition and a real loss against "drop your Figma licenses," not merely a timing problem.

- **Team designer (paid):** can evaluate from source now; the *product* evaluation and the *replacement* decision are two different, non-loop-buildable gaps.
- **Engineer (W3):** intent-pull (`review_diff`, Decision Graph) works from a source build; zero npm exposure. it44 showed a landed W2 tool can carry a real reliability defect — so "on main + tests pass" ≠ "correct in the field."

## Single biggest blocker to license replacement

**The merge of #35 + the 2.0 release cut — a human action Andrew owns** — remains #1 *on the shipping axis*, with the it40 refinement intact (necessary-not-sufficient for actual replacement; prototyping/history/admin independently block). Corrected from the first draft: the loop is **not** technically done — the bounded release audit (PR review, clean-room pack-smoke, skip doc) is real, release-critical, no-Andrew work that should precede the ask.

## Is the branch-local queue exhausted? Should the loop park?

**Nearly — and the honest answer is: do the bounded release audit, then slow down.** (First draft manufactured a "renewable dogfood stream" to avoid this — Sol #5/#6/#7/#8. Four tools are finite, not renewable; "it44 proved the stream pays" is n=1 self-crediting.)

- **it46–47: the bounded release audit** — the three residuals above. This is the genuine remaining branch-local value and it directly serves the ship.
- **After that: option value genuinely declines.** More branch-local refinement increases divergence, merge burden, and re-validation churn until Andrew merges. So the loop should **narrow to release-critical evidence only, with an explicit stop condition**, and surface the one human action — not spin up iterations to stay busy. Dogfooding continues **only where it produces release-critical evidence** (e.g. `review_diff`/`polish_diff`, the moat tools most likely to be exercised first by an evaluator), not as a standing program.

## Backlog top-10 (re-ranked; corrected)

1. **Distribution — merge #35 + cut the 2.0 release.** Andrew-only. *The shipping blocker.*
2. **Bounded release audit** (no-Andrew, release-critical): per-PR review evidence for the 9 PRs (the un-delivered it40 leg), clean-room `npm ci`+`npm pack`+install-smoke of the combined tip, document the 1 skip. *The loop's real remaining work.*
3. **Team-shared decision graph + governance** (SSO/ACL/retention/consent/audit-log). Build Andrew-gated — but admits loop **prep**: an admin/SSO requirements doc + a governance acceptance checklist (Sol #9).
4. **Comparative review-outcome benchmark on a NEUTRAL corpus** (it43 scoped the experiment). Spec through the evidentiary gate.
5. **Polish apply loop** (governed apply + re-audit + test).
6. **Direct product-UI generation (W1)** — absent; Figma Agent's 0→1 beta widens it.
7. **Interactive prototyping substitute** — migration blocker; Morven-platform (loop prep: a substitute-options inventory).
8. **Comments→decision extractor (gap 8)** — converts un-migratable comment history into the moat.
9. **Persistent visual canvas + multiplayer (W1)** — Morven-platform.
10. **Code-to-design reconstruction (W1/W3 bridge)** — absent.

Movement vs it40: the **release audit** takes #2 (not dogfooding — that was a manufactured queue). "Andrew-gated" items keep a loop-doable prep leg where one exists, rather than being dismissed.

## Decision Graph health (gap_scan)

The loop machine's local Decision Graph store is effectively empty (autonomous-loop harness, not Andrew's authored store), so `gap_scan` here reflects the harness, not the product — not run against an empty store. Andrew's store is the real one.

## The one human action to surface

**Merge the de-risked 2.0 set and cut the release.** Order `#35→#36→#41(+#39)→#42(+#38)→#43→#37→#40`, one auto-unionable README conflict at #40, combined tip 821/820/0/1 green, no dep delta — with the honest caveat that this is integration-health, not a clean-room release cert (the loop will close the pack-smoke + PR-review residuals in it46–47). Optional, non-blocking: the it44 branch `tap-target-desktop-warning` can ride along or land post-2.0.

## Verify

- **Facts checked, not inferred:** matrix freshness, iteration count (44), it40 continuity all read from origin/main; the four since-it40 deltas are this session's own commits (cebc8ef, e885eeb, 2a4bd4b + branch 6ca95a1).
- **Sol adverse — 7th consecutive session win, and the load-bearing one:** FLAWED, 12 findings. It caught the first draft (a) over-claiming "fully de-risked / zero technical risk / purely human blocker" against it42's own symlinked-deps integration-health scope (#1–#3), (b) manufacturing a "renewable dogfood stream" from n=1 to dodge the park question — the it40 failure mode inverted (#5–#8), (c) "evaluation 100% gated by distribution" false given source builds (#4), (d) conflating "Andrew-gated" with "no loop value" (#9), (e) softening the Figma verdict instead of naming the narrowed thesis (#10–#11), (f) blurring "landed" with "available" (#12). **All resolved by rewrite:** de-risk claim scoped to conflict/build/test-clear; the release-audit residuals (PR review, clean-room pack-smoke, skip doc) named as real no-Andrew work → they become backlog #2 and the it46–47 plan; dogfooding demoted to release-relevant-only; the park question answered honestly (audit then slow, not manufacture iterations); the Figma thesis named as a narrowed intelligence-layer/seat-downgrade ambition, necessary-not-sufficient. No Fable (usage credits).
- **No matrix cell moved** (it30; zoom-out). **No taste ruling.**
