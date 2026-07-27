# Morven loop — ZOOM-OUT (it40)

*2026-07-19, every-5th-iteration zoom-out. Not a build. gap_scan the matrix, walk both personas end-to-end ("could this team cancel Figma today?"), re-rank the top-10, name the single biggest license-replacement blocker — and, this round, an honest audit of the loop itself.*

## Hard state (facts, not vibes)

- **`npm live == main == v1.17.1`** (checked). The 2026-07-18 landing — Decision Graph (11 `decision_*` + `decision_import`), `review_diff`, `polish_diff`, contrast compositing, mobile tap-targets, 93 stdio tools — is **on `main` only**. The published package still serves the pre-landing v1.17.1 with a 51-tool manifest.
- **10 open PRs**, and they are *the entire loop output* it22→it39: #35 manifest-sync (the release-availability gate), #36 release-enablement, #37 polish-apply, #38 comments-archive, #39 bench-compare, #40 fail_on, #41 external-packet, #42 comments-paste, #43 comments-to-decisions, plus the old #2 dropdown pattern. **None merged.**
- Every matrix cell that reads "(on main; undistributed)" is therefore a claim about a **repository**, not a **product**.

## Both-persona end-to-end walk — "cancel Figma today?"

**Team designer (primary paid customer):** No — and it's worse than "the wedge isn't ready." They can't even *evaluate* the wedge from the published product: `npm i raven-mcp` installs v1.17.1, which predates the Decision Graph, `review_diff`, and `polish_diff` entirely. On top of that, a full cancel still fails on three **blocking** migration surfaces (prototyping; existing comments/version/file history; admin/SSO/ACL/retention) per the migration table. So the honest answer is two layers deep: (1) the landed intelligence layer isn't installable, and (2) even installed, it's a *downgrade-not-cancel* (seat reduction + Morven as intelligence layer), not a replacement.

**Engineer (W3 — pull design intent):** Partially, but only against a **from-source `main` build**, not the published package. `decision_*`, `review_diff`, and DESIGN.md/token pull exist on `main`; a developer who clones and builds gets the self-serve intent story. A developer who installs from npm gets none of it. So W3 is "real in the repo, absent in the product" — the same repo-vs-product gap.

**Combined verdict:** two distinct gaps, and the zoom-out must not conflate them (Sol adverse finding 1). (i) **Product-exposure gap:** ~8 iterations of landed capability aren't in the *published npm package*, so a consumer who `npm i`s can't see the wedge. (ii) **License-replacement gap:** even fully published, "cancel Figma" stays blocked by prototyping, existing history, and admin/SSO — *independent* of distribution. The landing IS evaluable *today* from a source/branch/local build and can be benchmarked internally and demoed in sales (finding 3); "zero consumers" is true only of the published-npm surface, not of evaluation as such.

## Single biggest blocker — scoped, not overstated

**To exposing the landed wedge through the product: distribution — merge #35 and cut a release.** Now *quantified*: four iterations after the last refresh (it35→it39), npm is still v1.17.1. This one Andrew-only action moves ~8 iterations of work from repository to published product and unblocks every "(undistributed)" cell.

**But it is necessary, not sufficient, for license replacement** (findings 1–2). It is *not* asserted to outrank building prototyping / history-migration / enterprise-admin — those are independently blocking and could each matter more to a given team's cancel decision even before publication. What is defensible: distribution is the **cheapest, highest-certainty, already-built** unlock, and it is the prerequisite for turning any of the landed wedge into revenue or a benchmark. That is a strong #1 *on the published-product axis* — not a claim that the product is one merge from replacing Figma.

## Reprioritized top-10 (owner-tagged; [A]=Andrew-gated)

1. **Merge #35 (manifest-sync) + cut a release.** [A] — distributes the 93-tool landing; unblocks every wedge claim.
2. **Merge #36 (release-enablement:** Codex approval sync, upgrade docs). [A] — removes the post-upgrade client-breakage the loop documented.
3. **Merge #37–#43** (polish-apply, bench harness+packet, comments pipeline, fail_on). [A] — lands the it24–it39 wedge work.
4. **Team-shared decision graph + governance** (SSO/ACL/retention/deletion/audit). [A, Morven-platform] — the paying team's procurement bounce cluster; spec exists (it23), build is platform-side.
5. **Comparative benchmark — real second column** (Open Design lint / Stitch / Figma Agent critique vs `bench/`). [A-seat or external tool access] — until a competitor is actually graded, "differentiated" is the ceiling (gap #3).
6. **Polish apply + re-audit + test loop** (the remaining W2 distance beyond `polish_diff` propose-only). Buildable — but #37 must merge first.
7. **Code-to-design reconstruction script** (it39 spec, headless, no tool-count change). [A surface-nod] — first real *build* candidate once merges clear.
8. **Real-Figma-clipboard comments smoke** (it38 residual). [A-seat] — the one piece the synthetic smoke can't stand in for.
9. **Direct product-UI generation (W1).** [Morven-platform, large] — Figma Agent's 0→1 beta widens this on the incumbent's side.
10. **Interactive prototyping substitute** (migration blocker). [Morven-platform, large].

Items 1–5 and 8 are Andrew-gated or seat/access-gated. Only 6 (post-merge) and 7 (post-nod) are loop-buildable, and both have a gate in front of them.

## Honest audit of the loop itself (standing devil's-advocate — corrected by Sol adverse)

it35→it39 produced **five prep docs and zero merges.** My first draft read that as "diminishing returns, park and wait." **Sol adverse (FLAWED) corrected this on both ends** and the correction is right:

- **Zero merges is the *bottleneck's* measure, not the loop's** (finding 5). Merging is human-only; attributing "near-worthless" to autonomous work because it hasn't merged is defeatist mis-attribution.
- **"Park and wait" is a false binary and actively harmful** (findings 4, 6). Parking *preserves* a 10-PR backlog that carries review burden, conflict, and integration risk — longer idle makes the human bottleneck worse, not better. There is a **third path the draft missed: a merge-readiness / validation program** — the loop's highest-leverage move while merges are gated.
- **"Stop writing specs" over-corrected** (finding 7). The right gate is *evidentiary*, not categorical.

**Corrected posture for it41+ — a merge-readiness / validation program, with an explicit work-selection policy (finding 9), highest-value first:**

1. **De-risk the merge (top priority, all unblocked, none Andrew-gated):** dogfood the landed `main` tools to find *real* bugs; build & smoke each unmerged branch (#35–#43) from source; detect cross-PR overlap and conflicts; compute a safe merge order; produce a concise per-PR review-evidence packet. This directly *shrinks* Andrew's merge cost and the backlog risk — the concrete version of "help the #1 blocker," replacing the vague "keep the runbook current" (which is make-work unless release facts materially changed — finding 8).
2. **Genuinely-unblocked customer work:** the bench real-second-column (gap #3/#5) *if* a non-Figma competitor is runnable against `bench/` without Andrew — probe access first; internal benchmarking of the landed tools needs no publication (finding 3).
3. **Specs — only through an evidentiary gate** (finding 7): permitted solely when the item names a consumer, a decision it resolves, a validation method, and a likely execution path. Generic prep fails the gate.
4. **Park only after** the read-only / branch-local queue in (1) is demonstrably exhausted — and then log the exhaustion, don't just idle.
5. **Periodically surface one concise human action request** (not every iteration): the highest-value action for the whole effort remains Andrew's — merge #35 + cut a release — but framed as "here is the validated, safe-ordered merge set," not a nag.

## Verify

- **Evidence:** the npm-vs-main version check (both v1.17.1), the 10-open-PR list, and the migration table are hard facts gathered this iteration.
- **Sol adverse:** ran (constrained, report-only, minimal CODEX_HOME, 9.8k tokens) → **VERDICT: FLAWED**, 9 findings — and they materially improved the read, catching over-claim in judgment A (distribution ≠ sole license-replacement blocker; landing IS evaluable off-published-surface) *and* defeatism in judgment B (park-and-wait preserves the backlog; a merge-readiness program is the missing third path). **All 9 resolved above** — the biggest-blocker claim is now scoped to the published-product axis, and the loop's posture is a concrete validation program with a thresholded work-selection policy, not "idle." No Fable (Andrew on usage credits).

## Next

it41 opens the merge-readiness program: dogfood the landed `main` tools + smoke the unmerged branches from source, surfacing real bugs and a safe merge order. it45 is the next zoom-out.
