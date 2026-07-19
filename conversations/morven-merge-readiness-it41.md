# Morven loop — merge-readiness packet (it41)

*2026-07-19. First iteration of the it40-corrected posture: a merge-readiness / validation program that shrinks Andrew's merge cost, not a park-and-wait. Read-only analysis of the 10 open PRs against `origin/main`; no branch merged (merging is Andrew-only). Deliverable: a safe, cumulatively-simulated merge order for the 2.0 release set, with the one real conflict named.*

## What this packet answers

The it40 zoom-out promised "compute a safe merge order; produce a concise per-PR review-evidence packet." This is that packet — and the first draft's central claim ("all pairwise-clean, integration is low-risk") was **wrong**, caught by a Sol adverse pass and then disproven by direct simulation. The corrected packet is stronger for it.

Three questions, answered from the actual git objects (not PR metadata — GitHub computes mergeability lazily and returned mostly `UNKNOWN`):

1. Does each open PR merge onto **current** `main`?
2. Does the **cumulative** merge of the whole set (not just pairwise) stay clean, and in what order?
3. Are any PRs redundant (one branch already contains another)?

## Method (reproducible, no main-working-tree mutation)

- **vs-main:** `git merge-tree --write-tree --name-only origin/main origin/<b>` per PR — 3-way merge, no checkout.
- **cumulative (the load-bearing check):** throwaway worktree at `origin/main`, then real `git merge --no-edit origin/<b>` for each PR **in sequence**, building the evolving integration tip and recording the first conflict. This is what pairwise `merge-tree` cannot see.
- **containment:** `git merge-base --is-ancestor origin/<x> origin/<y>` for every ordered pair.
- **release-gate build/test:** worktrees at `origin/main` — #35 alone, and #35+#36 — `RAVEN_NO_USAGE_LOG=1 npm run build` + `node --test` + `scripts/sync-manifest-tools.mjs`.

Base: `origin/main` = `915b412` (it40). Scripts: `scratchpad/it41-order.sh`, `it41-cumulative.sh`, `it41-cum2.sh`. All throwaway worktrees removed.

## Result 1 — every loop PR merges CLEAN vs current main

| PR | branch | vs main |
|----|--------|---------|
| #35 manifest-sync · #36 release-enablement · #37 polish-apply-loop · #38 comments-archive · #39 bench-compare · #40 fail-severity-tier · #41 external-packet · #42 comments-paste-path · #43 comments-to-decisions | | **all CLEAN** |
| #2 dropdown-menu-pattern | (months stale) | **CONFLICT** |

Exclude the ancient #2 from the 2.0 set — separate rebase decision, not loop output.

## Result 2 — cumulative merge is code-clean, with exactly ONE unavoidable README conflict

Merging the full set in order `#35 → #36 → #39 → #41 → #38 → #42 → #43 → #37 → #40`: the first **eight** merge cleanly; the **ninth (#40) conflicts on `README.md` only** — no code conflict anywhere in the cumulative integration.

Re-running with a different order (#40 moved to position 3) does **not** remove the conflict — it just relocates it to whichever README-touching PR merges last (#42 in that run). **The README conflict is intrinsic, not an ordering mistake:** six PRs (#36 +10, #37 +8, #38 +6, #40 +8, #42 +12, #43 +2 lines) each append to the same README region (tool list / changelog). Pairwise they auto-merge; cumulatively one always collides.

**So the honest headline is not "no conflicts."** It is: **the entire code merge is conflict-free in sequence; expect exactly one trivial `README.md` conflict, resolved by keeping both insertion blocks** (a 30-second changelog merge, no logic).

This is precisely the failure the pairwise-only first draft missed — logged as the gate working (see Verify).

## Result 3 — two PRs are redundant (containment)

- **#38 (comments-archive) ⊂ #42 (comments-paste-path)** — #42's branch already contains #38's commits.
- **#39 (bench-compare) ⊂ #41 (external-packet)** — #41 already contains #39.

So merging #42 also lands #38, and merging #41 also lands #39. Andrew can **drop #38 and #39 from the merge sequence** (merge #42 and #41 instead) *if* he doesn't need each as a separate review record; if he wants the PR-level history, merge them first (they fast-forward). Either way this removes two merges from the critical path.

## Release-gate proof (built + tested this iteration)

- **#35 alone** onto main: `manifest.json` already carries **93** tool entries pre-sync; `tsc` clean (RC 0); `sync-manifest-tools.mjs` → "Synced 93", `manifest.json` **clean**. → **#35 by itself reconciles the published manifest to main's 93-tool count** (attribution proven standalone, not inferred from the pair).
- **#35 + #36** onto main: `tsc` clean; full suite **772 / 771 pass / 0 fail / 1 skip** (the +4 over main's 768 are #35/#36's own tests).

**Ground-truth note:** the "manifest.json says 51 until #35" ledger line is imprecise. **51 describes only the currently *published npm package*; both `main` and the #35 branch already carry 93.** #35's job is to make the *published* manifest match — it does.

## Recommended merge sequence (2.0 set)

Cumulatively simulated, code-conflict-free:

1. **#35** manifest-sync — release-availability gate; proven standalone above.
2. **#36** release-enablement — proven with #35 (772/771/0/1).
3. **#41** external-packet (brings **#39** bench-compare with it).
4. **#42** comments-paste-path (brings **#38** comments-archive with it).
5. **#43** comments-to-decisions.
6. **#37** polish-apply-loop.
7. **#40** fail-severity-tier — **expect the one `README.md` conflict here; keep both blocks.**

After #40 and #43 land (both touch `src/index.ts` tool registration): re-run `sync-manifest-tools.mjs`, and re-check the anon-45 golden hash (`f64bb18…2bb0a6`) **only if** either changed an anon-surfaced tool. Mechanical, not a blocker.

## Honest limits

- The cumulative merge is a **real simulation**, so the "one README conflict, else clean" claim is empirical, not a pairwise proxy. But **build+test was run only on #35-alone and #35+#36.** #37–#43 are conflict-cleared and their code merges clean cumulatively, but their combined state was **not** build-verified — that is it42's job (loop-buildable, no Andrew gate).
- `git merge` clean proves **textual** integrability, not **semantic** correctness (three PRs edit `src/index.ts`; textually clean tool registrations could still duplicate/misorder — hence the post-merge sync-manifest re-run).
- Nothing here merges or publishes. The highest-value action stays Andrew's: **merge the sequence above, cut 2.0.** This packet reduces that to "order + conflict-clearance already done; one trivial README merge expected at #40."

## Verify

- **Evidence:** two matrices + the cumulative sim + containment audit are regenerated git-object facts (scripts in scratchpad); the two release-gate builds ran in worktrees at `origin/main`.
- **Sol adverse:** ran constrained, report-only, minimal CODEX_HOME (~10k tokens) → **VERDICT: FLAWED**, 9 findings — and it was **materially right**: the first draft's pairwise proof did not establish N-way integrability (findings 1–2), excluded README-overlap conflicts (finding 3), over-stated "low-risk" from a 2-of-9 build sample (finding 4), and attributed the manifest fix to #35 without a #35-alone test (finding 5). **Resolved by doing real work, not hedging:** ran the cumulative sequential simulation (which found the README conflict the pairwise check missed), the containment audit, and the #35-alone build. Language scoped down throughout (findings 6, 9). This is the third consecutive iteration where constrained Sol adverse caught a real error a self-review would have shipped. No Fable (Andrew on usage credits).

## Next

it42: build + smoke #37–#43 from source in the recommended cumulative order (the second half of the de-risk program) — surface any real bug and per-PR build evidence on the combined tip. it45 is the next zoom-out.
