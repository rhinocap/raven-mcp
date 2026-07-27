# it75 ZOOM-OUT — is the hold still honest?

**Date:** 2026-07-20 · **Slot:** every-5th zoom-out · **Build:** none (doc-only)
**Verified this firing:** `origin/main` @ `fe457b0` · npm `raven-mcp` `1.17.1` · coord tail = the it49→it64 stack merge record (`9c608b6`) · no gate event since it71.
**Session note:** machine restart ~13:30 PDT killed loop session `6df77a7c` mid-flight. State recovered from transcript and re-verified against origin before this firing — nothing below is carried on memory alone.
**Adverse:** constrained Sol (report-only, medium) returned **NOT SOUND** on rev 1 — 0 P0, 5 P1, 6 P2, all calibration over-claims, none rejecting the reframe. This is rev 2; every finding resolved inline and marked `[Sol]`.

---

## 0. The finding that reframes this zoom-out

The it71 merge was **not** the merge the loop has been waiting on since it35.

Two distinct bodies of loop output exist, and only one merged:

| Body | Content | Status |
|---|---|---|
| it49→it64 stack | decision store, capture adapters, polish loop, governance (`fail_on_governed`) | **MERGED** to main at `9c608b6` |
| it22→it39 queue (#35–#43) | manifest sync, release enablement, polish-apply, comments archive/paste/→decisions, bench harness, fail-severity-tier, external packet | **STILL OPEN — 9 PRs** |

Measured divergence of each open PR from merged main:

```
manifest-sync          ahead=1  behind=70
release-enablement     ahead=1  behind=63
polish-apply-loop      ahead=1  behind=61
comments-archive       ahead=1  behind=57
comments-paste-path    ahead=2  behind=57
bench-compare          ahead=1  behind=55
external-packet        ahead=2  behind=55
fail-severity-tier     ahead=1  behind=53
comments-to-decisions  ahead=1  behind=49
```

Every one is 49–70 commits behind. The it71 merge did not drain this queue — it moved main further from every branch in it.

**[Sol P1] What that does and does not establish.** Behind-count measures ancestry distance only. It is not evidence of conflicts, review burden, or semantic incompatibility, and this document does not claim it is. What it establishes is that no branch in the queue has been evaluated against the main that now exists — the integration risk is *unmeasured*, not *demonstrated*. That is the actual finding, and it is what §4 item 2 exists to resolve.

**A concrete candidate for that risk (structural, unexecuted):** #35 ships `scripts/sync-manifest-tools.mjs` plus `test/manifest-tools.test.mjs`, whose assertion is `assert.deepEqual(manifest.tools, derivedTools)` where `derivedTools` comes from spawning the **live built server**. #35's checked-in `manifest.json` carries 95 tools, generated at a base 70 commits back; the merged stack added decision-graph code to that server.

**[Sol P1] Held to what the evidence supports:** this makes it *plausible* that #35's committed manifest no longer matches the live surface, not certain. A changed server does not prove a changed tool list — filtering, build state, or tools already represented could leave it identical. The claim is therefore: **#35's mergeability is unverified and its own test is the thing that would decide it.** Not "#35's test fails" and not "#35 cannot merge as-is." One rebase + rebuild settles it, which is exactly why it is it76 item 1 rather than a conclusion here.

Structural evidence only (behind-counts + reading the test). Not verified by rebase-and-build.

---

## 1. Is the dogfood-evidence gate still the right gate?

**Partly. It is the right gate for the thing it governs, and it has quietly been allowed to govern more than that.**

Right: contradiction-grade governance is interpretive, expensive, and reversible only at cost. Building it before knowing whether `governed_by`/`fail_on_governed` actually false-positives repeats the it65 manufacture-surface mistake Sol reversed. That reasoning holds and is not weakened by time passing.

Wrong: the gate has become the reason the loop does *nothing*, when it only ever justified not doing *one specific build*. it72, it73, and it74 were three consecutive no-change hold-checks. §4 lists work that is available now, is not a build, and is not Andrew-gated.

**[Sol P2] Scoped honestly:** rev 1 said that work "was unblocked the entire time." That is retrospective certainty this document cannot support — the merge that created the divergence landed at it71, and what was visible or authorized during it72–it74 is not established here. The defensible claim is narrower and still damning enough: **as of this firing, non-build unblocked work exists, and the three preceding firings closed with "nothing to do."**

**The gate is not indefinite-in-principle** — it names four concrete re-open events including "any new Andrew instruction," and the runbook is already in Andrew's hands. But it has been applied as though "no gate event" means "nothing to do," when it only ever meant "nothing to *build on that branch*."

Honest correction: keep the gate for contradiction-grade governance. Stop letting it gate the merge-readiness program.

## 2. Both-persona walk — stack on main, not published

**Team designer.** Their reachable surface is `npm i raven-mcp` @ `1.17.1`, which predates the entire 2026-07-18 landing *and* the it49→it64 stack. **[Sol P2]** Precisely: the decision graph is absent from the **published package** — not from every installable form, since a source build of `origin/main` exists and the engineer persona below uses exactly that. The claim is about what this persona will actually install, not about physical availability.

**[Sol P2]** Rev 1 said "net change from the merge: zero." Corrected: **zero on the published axis, conditional on this persona consuming npm rather than building from source** — a modelling assumption about a designer's tooling appetite, not a fact. A designer willing to build from source gets the same gain the engineer does. Separately, a full Figma cancel independently still fails on prototyping, existing history, and admin/SSO — carried from the it40 matrix, not re-established here, and flagged as inherited rather than freshly evidenced.

**Engineer.** Real but source-gated. From a build of `origin/main` they now get the decision store, capture adapters, and `fail_on_governed` in one linear chain — previously that required stacking 11 branches. That is a genuine improvement in *evaluability*, and it is what makes Andrew's dogfood possible at all. It is worth nothing to anyone who installs from npm.

**The distinction that matters:** the merge moved the **dogfoodability** axis, not the **exposure** axis. Those are different, and conflating them is how "we merged" gets mistaken for "we shipped."

## 3. Biggest blocker, per axis (keeping it40's split)

- **Published-product axis: distribution.** **[Sol P1]** Rev 1 named this as "merge #35 and cut a release" and called it "cheapest, highest-certainty, already-built." All three are corrected: #35 is the *manifest* gate, but **#36 is release-enablement** and this document gives no basis for treating #35 as sufficient alone — the release path is at minimum #35 + #36, and possibly more. And no cost comparison against the alternatives was performed, so "cheapest / highest-certainty" is withdrawn. What survives: distribution is the axis where already-written code is closest to reaching users, and it remains **Andrew-authorized only**. Its true cost is unknown until §4 items 1–3 run.
- **License-replacement axis:** prototyping, existing history (files/versions/comments), and admin/SSO. Independently blocking, unmoved by anything since it40, and mostly not loop-buildable under the current freeze. (Inherited from the it40 matrix.)

Neither outranks the other. They are different questions, and the loop has previously blurred them into a single "biggest blocker" claim it could not support.

## 4. Loop work that needs no dogfood evidence and manufactures no surface

Not none. Four items. **[Sol P1] Precisely scoped** — all four are *investigation and preparation*, none is a merge, and item 4's decision remains Andrew's:

1. **Rebase #35 onto merged main in a throwaway worktree, rebuild, regenerate the manifest, run its own test.** Settles §0's open question by execution. Note this *diagnoses* #35; actually updating the PR branch is a push, and merging is Andrew's. — *it76 candidate.*
2. **Smoke #36–#43 from source against merged main**, recording which build, which tests pass, and which have real conflicts with the merged decision-graph code. This is where the unmeasured integration risk of §0 gets measured.
3. **Compute a safe merge order and detect cross-PR overlap** — #42 and #43 are known *not* stacked (it38's load-bearing finding); the same check has never been run for the rest against post-merge main.
4. **Prepare the `fail_on` (#40, rule-based) / merged `fail_on_governed` collision analysis** — the 5th-positional-param + `severity_policy` mechanics are loop-work. **The reconciliation decision itself stays Andrew-owed**; this only makes it one read instead of one investigation.

**[Sol P2]** Rev 1 claimed these "shrink Andrew's queue." Corrected: they shrink the *unknowns per PR*, not the PR count. Items 2 and 3 may well surface additional work. What they satisfy is the it35 course-correction's intent — **add no new PRs** — which the loop had been satisfying by idling instead.

## 5. One human action request

**Andrew: run the dogfood pass, or tell the loop it isn't coming.**

**[Sol P1] Rev 1 said "either answer unblocks." That was false and is withdrawn.** Precisely what each answer does:

- **False-positives observed** → re-opens contradiction-grade governance with the evidence that build needs. Genuinely unblocking.
- **Clean run** → weak evidence only. One person's sample does not establish that governance won't false-positive at large, and it does not by itself prove the moat lever is the shared/hosted graph. It lowers the priority of the governance build; it does not settle it.
- **"Not doing it"** → does not resolve the product question, and does not justify retiring the gate on the merits. What it does resolve is the *loop's* posture: the gate stops being a live expectation, and the loop stops holding a slot for evidence that isn't coming.

The one thing that does not work is the current state, where the gate stays nominally live and the loop reads it as a reason to idle.

Standing offer, unchanged and not a build: (a) point your MCP at a local build of `origin/main`, (b) generate a starter `DESIGN.md` + seed decisions for a project you name.

---

## Verdict

**HOLD stands for contradiction-grade governance — correctly, and for the original reason.**
**HOLD does not stand for the loop as a whole.** it72–it74's three no-change firings were a mistake of scope, not of the gate. The merge-readiness program (§4) is available now, needs no dogfood evidence, and is what it76 opens with — starting with the one item that converts §0's plausible claim into a verified one.

**Matrix cell moved:** none (it30 merge-gated ruling holds; this is a zoom-out).
**Taste ruling:** none → no `record_taste_decision`.
**Adverse split:** Sol-only 11/11 (5 P1 + 6 P2, 0 P0); no Fable (Andrew on usage credits). All resolved in rev 2.
