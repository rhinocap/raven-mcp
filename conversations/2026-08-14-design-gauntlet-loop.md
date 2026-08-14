# 2026-08-14 — Design Gauntlet Loop (/goal)

## Goal (verbatim intent)
Create a workflow delegating to cheaper models (mostly open weights) to ingest: yt NAumQObJEwM, the Notion "Design Loop" free guide (https://app.notion.com/p/The-Design-Loop-Free-Guide-3b8e8d6bd13781ff8bf2fc06fd5d0aac), and `/Users/accunliffe/Downloads/design-teardown-skill` — then improve Raven so users can compare their site/app to a benchmark (vercel.com, linear.app, …), diagnose why theirs looks worse, spec the polish work, and only call it done at parity. Stop hook enforces.

## State
- Preflight DONE: prompt-coach decode ([Gates: bound]), goal-consult (5 similar runs; failure tags false-done / wrapper-stall / scope-drift), spec block emitted.
- INGESTION COMPLETE (all three legs):
  - Leg A (main session): SKILL.md, measurement-protocol.md, measure.js read in full. Method: 9-dimension computed-CSS probe (surfaces/hairlines/text-roles/tracking/accent/type-scale/radii/elevation/rhythm; first four dominate), token diff, fixes ranked mechanical vs needs-a-decision, measure-never-recall, take-the-discipline-not-the-identity. Traps: zero-height pre-layout, lazy-load, long-tail-vs-vocabulary, webfont fallback, color-scheme.
  - Leg B (GLM 5.2 via ow-run, $0.008): yt-distilled.md read. Video = gauntlet-loop lineage (Matt Shumer), critic triad proof/design/visual-impact, screenshot-benchmark trigger, loop-until-bar. Design-OS material out of scope.
  - Leg C (Chrome capture): notion-guide.md — builder + 3 fresh-context critics (Brief/Sonnet, System/Haiku, Craft/strongest; renders not code, blind side-by-side), binary verdicts, all must pass, no fixed rounds; failure modes: vague bar, self-judging builder, soft critic, fixed rounds, over-specifying.
- Gap analysis: no existing Raven tool does two-URL comparative visual measurement (gap_scan = decision coverage; polish_diff = token substitution on diffs; audit_parity = mobile snapshots). Capture stack is the substrate.
- SPEC (v1): new gated tool `design_gauntlet` — src/design-gauntlet.ts (probe + pure comparator), register in index.ts (TOOL_ACCESS + REMOTE_GATED_TOOLS + annotations), 110→111 stdio / 65→66 gated, six count suites + manifest, comparator tests mutation-proven, response embeds fresh-critic loop protocol + binary on_par exit gate.
- Next: build → full suite → real-pair e2e → Sol falsification → done-gate. NO push to main (deploys live endpoint).

## Changed files
- `src/design-gauntlet.ts` — NEW: probe (`measureGauntletPage`, real Chromium via launchAuditChromium, all three protocol traps coded: visible-count guard + retry, full-page scroll for lazy-load, fonts.ready race + fonts_status; color-scheme emulated + reported) + pure comparator (`compareGauntletMeasurements`, 13 rules over 9 dimensions, `vocabularyCount` 90%-coverage long-tail rule, bar capped at 7, fixes split mechanical/needs_a_decision, binary `verdict.on_par`) + `GAUNTLET_LOOP_PROTOCOL` (6-step fresh-critic loop) + `GAUNTLET_DISCIPLINE_NOTICE`
- `src/index.ts` — import, `design_gauntlet` in `REMOTE_GATED_TOOLS` (anon 45-hash preserved) + `TOOL_ACCESS: readOnly` + `TOOL_OPEN_WORLD`, four count comments 110→111 (incl. the two design-review-pinned ones), full registration after talon_rules (talon_scan template: zod shape, CaptureUnavailableError early-return)
- Six count suites 110→111: audit-dispatch:223/226, decision-import:482, design-review:863/870/873, redis-taste-store:150, taste-remote-full:6/83/95, grab-bridge:898. No separate 65-gated assertion exists (the 56 remote+store pair doesn't move for a gated tool — verified by grep).

## Progress (post-compaction checkpoint)
- build + sync-manifest DONE. `test/design-gauntlet.test.mjs` WRITTEN, green 26/26. One fixture bug found+fixed: mkTally(11) reads as vocab 10 at the inclusive 90% boundary, so type-scale fixture uses mkTally(12)/mkTally(13) — that first-run red incidentally proved the test can fail.
- Mutant harness `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` WRITTEN (24 mutants G1–G24 + 2 construction-neutral controls; anchors pre-verified unique against dist; `node --check -` pre-flight; declared baseline 26/26/0/0; deduped ✖-name attribution; verified restores; exitCode on survivor/false-fail). Header radius table is a PREDICTION until the run lands — re-derive it from the measured log.

## Progress (checkpoint 2, post-compaction)
- Mutation matrix v2 COMPLETE: 24/24 killed, 0 survived, 2 controls green, EXIT=0 (`.claude/gauntlet-2026-08-14/agent-output/mutants-v2.log`). v1 aborted because bare `node --check -` parses stdin as CJS and rejected the PRISTINE ESM file — fixed with `--input-type=module`, discriminator measured both directions; harness header re-derived from MEASURED radii (G4 5 not 6 — parser is shared entry; G19 17 — rhythm rows sit in every comparison; G21/G23 kill attribution documented).
- Full suite ran: 1565 tests / 1561 pass / **1 FAIL** / 3 skipped, EXIT=1 (`agent-output/full-suite.log`). The one failure: `test/design-review.test.mjs:861` — every count and the frozen anon 45-hash PASSED; only the prose pin `/gate off the 64 gated tools/` failed. src/index.ts:2193 already says "gate off the 66 gated tools" (66 = 111−45); the TEST regex was the stale side. Fixed: regex now pins 66.
- 1565 = 1539 + 26 (exactly the new suite); the 3 skips are the same three, read individually at log lines 109/740/741; the gauntlet suite's names grepped from the log (present).

## Progress (checkpoint 3 — e2e round)
- Count-pin fix landed: test/design-review.test.mjs:872 regex 64→66 (src/index.ts:2193 already said 66; the TEST was the stale side). Full suite then green: **1565/1562/0/3, EXIT=0** (`agent-output/full-suite-2.log`); the 3 skips read individually at log lines 109/740/741 — same three as always.
- Real-pair e2e revealed TWO defects, one in the script and one REAL in the product:
  1. Script: `_registeredTools[x].callback` doesn't exist (the SDK exposes `handler`); rewritten to drive a real MCP client over `InMemoryTransport.createLinkedPair()` so the zod schema layer runs — calling the handler directly would skip exactly the seam the e2e exists for.
  2. **Product (P2): the fixes join was broken.** `GauntletFix` was keyed `dimension` while `bar[].mechanism` and `verdict.failing_mechanisms` carry mechanism names — loop-protocol step 2 tells a consumer to join fixes to failing mechanisms BY NAME, and that join silently matched nothing. The 26-test unit suite was green through it (it counted fixes, never checked the key). Fixed: `GauntletFix.mechanism`, with a comment naming the contract; a join assertion added inside the "bar caps at 7" test, proven falsifiable by string-reverting the key in dist/ (exactly that one test red, restore verified byte-checked).
- E2e then fully green: **32/32 checks** against live ravenmcp.ai vs linear.app. Live verdict is credible: on_par=false with exactly one failing mechanism — display tracking (Linear's display type at −0.022em; ravenmcp.ai looser than the 0.005em threshold) — 1 mechanical fix, bar names the reference value, both pages laid out (758 / 2379 visible elements), fonts loaded, no warnings.
- No mutant anchor touched the renamed line (grep verified), but the matrix is re-run WHOLE after the fix per the standing rule — queued behind the suite (harness mutates dist/ in place; the suite rebuilds dist; never concurrent).

## Progress (checkpoint 4 — final verification legs)
- Final full suite GREEN: **1565/1562/0/3, EXIT=0** (`agent-output/full-suite-3.log`, cancelled 0 / todo 0; the 3 skips read individually at log lines 109/740/741 — same three as always).
- Matrix v3 GREEN: 24/24 killed, 0 survived, 2 controls green, EXIT=0 inside the log (`agent-output/mutants-v3.log`). Radii diffed line-for-line against v2: **byte-identical** — which exposed that NO mutant anchors the join-contract fix (the manual dist string-revert proved it red once, but a hand-probe encodes no regression guard). Added **G25-fix-keyed-dimension-not-mechanism** (reverts `mechanism:` → `dimension:` in the fix assembly) and re-running whole as v4 (`agent-output/mutants-v4.log`).
- Sol falsification pass in flight (`agent-output/sol-gauntlet.log`, 200KB+ of active comparator probing observed mid-run).

## Pending
- Read final full suite (`agent-output/full-suite-3.log`, expect 1565/1562/0/3 — the join assertion lives inside an existing test, count moves by ZERO) → re-run mutant matrix whole (`agent-output/mutants-v3.log`) → read Sol pass (`agent-output/sol-gauntlet.log`; empty output = FAILED run) and disposition every finding → done-gate + CLAUDE.md ledger + backlog entry. NO push to main.
- (superseded, kept for the record) Re-run full suite backgrounded (expect 1565/1562/0/3 EXIT=0; re-read the 3 skips individually) → real-pair e2e `node .claude/gauntlet-2026-08-14/e2e-real-pair.mjs` (live network + real Chromium; serialized after the suite — the suite rebuilds dist) → Sol falsification (detached, gpt-5.6-sol medium, `< /dev/null`, output under agent-output/) → done-gate + CLAUDE.md ledger (110→111 / 65→66 + new test figure + matrix record) + backlog entry. NO push to main.

## Blockers
- (none)

## Checkpoint 5 — Sol dispositions implemented (pre-rebuild)

- Matrix v4: 25 mutants / 25 killed / 0 survived, EXIT=0 (`.claude/gauntlet-2026-08-14/agent-output/mutants-v4.log`).
- Sol falsification pass: SOL_EXIT=0, 7 findings (3 P1 + 4 P2), ALL confirmed real. Backlog entry appended to `.claude/linear-backlog-queue.jsonl`.
- Seven edits DONE this window:
  1. P1 #2 — `src/design-gauntlet.ts` tracking-body: unmeasured on either side is `worse:false` + honest note (the shipped shape fired on `null <= 0.001 === true`).
  2. P2 #4 — lazy-scroll limit re-read per iteration (`limitNow()`), bounded at 60 steps.
  3. P1 #1 — guard reads the probe's own `visibleCount` (geometry + computed-style), `countVisible` deleted; retry once after 2.5s.
  4. P1 #3 — probe `cap()` helper: seven comparison-feeding tallies capped at TALLY_CAP=100 with per-name `truncated` reporting; display-only tallies keep small slices.
  5. P2 #5 — `src/index.ts` design_gauntlet catch: `isError:true` + JSON body for CaptureUnavailableError (deliberate divergence from audit_* siblings, stated in comment; branch untestable in-process, stated).
  6. Unit test: tracking-body unmeasured-reference → on_par true, reference 'unmeasured', worse false.
  7. P2 #6 — protocol test exact-phrase pins ('ALL critics must pass', 'exits only when verdict.on_par is true', 'never report the work finished while verdict.on_par is false').
- Suite header rewritten: browser probe now exercised (3 fixture tests being added).
- REMAINING: browser tests B1 (opacity-decoy → visible_elements < 20 + low-count warning), B2 (120 unique surfaces → tally.length === 100 + cap warning), B3 (two-stage lazy-load → '#090807' in surfaces tally); `npm run build`; full suite (expect 1569/1566/0/3); harness G26–G30, baseline 30/30/0/0, matrix v5 WHOLE; ledger + commit (NO push).

## Checkpoint 6 — browser tests written, build done, suite in flight

- Browser fixture tests B1/B2/B3 written into `test/design-gauntlet.test.mjs` (suite now 30 tests): module-load probe outside product code (playwright import → launch → newPage → file:// goto → close, plus mkdtemp/writeFile/rm), `withFixture()` helper, each test `t.skip`s with the probe reason when chromium is unavailable.
  - B1: 30 sized opacity:0 decoys + 5 visible — asserts `visible_elements < 20`, low-count warning fires, no cap warning, decoy color absent from tallies.
  - B2: 120 unique background colors — asserts `surfaces.tally.length === 100` and the 'surfaces tally hit the in-page cap' warning.
  - B3: two-stage lazy-load (stage 1 appends 3000px at near-bottom, stage 2 appends the '#090807' div only reachable if the limit is re-read) — asserts both stage colors present.
- `npm run build` done; all mutant anchors re-verified against fresh dist (null branch :209, worse-line :218, protocol phrase :411, scroll loop :455–457, visibility predicate :548, TALLY_CAP :670; G24 unique via trailing design_gauntlet line).
- Harness updated to v5 spec: `EXPECTED_BASELINE` 30/30/0/0; G11/G12 re-anchored (fix rewrote their lines); G26 (null-guard `||`→`&&`), G27 (visibility predicate → geometry-only), G28 (TALLY_CAP→8), G29 (scroll limit captured once), G30 (protocol ALL→ANY) added. isError branch deliberately unmutated (no deterministic seam; stated in src/index.ts).
- Standalone gauntlet suite running backgrounded (task b9di5keg1) — ~9 min elapsed at this checkpoint (3 chromium launches + probe + B1's deliberate 2.5s retry are the expected cost).
- REMAINING: read b9di5keg1 (expect 30/30/0/0) → full suite backgrounded (expect 1569/1566/0/3, skips read individually) → matrix v5 WHOLE detached (`agent-output/mutants-v5.log`, EXIT inside the log; never concurrent with suite/build) → header radii rewrite from v5 → Sol round-2 judgment → ledger 110→111 / 65→66 + figures → commit explicit paths (NO push).

## Checkpoint 7 — the four-failure/hang mystery: one root cause (2026-08-14)

Full-run evidence (`.claude/gauntlet-2026-08-14/agent-output/gauntlet-suite-b.log`): 4 ✖ out of 30, then a 10-minute hang at 0% CPU with no chromium processes and no summary line.

**Failure 1 (unit):** the tracking-body unmeasured-reference test asserted `row.worse`; diff rows carry `subject_worse` (mapped from RuleResult's `worse` in `compareGauntletMeasurements`, src/design-gauntlet.ts:429-436). Test-side fix applied.

**Failures 2–4 + the hang (one cause):** test #27 called `buildServer({ remote: true })` in-process. `setRemoteRuntime()` is a one-way per-process latch, and `launchAuditChromium()` (dist/browser-launch.js:284) branches on `isRemoteRuntime()` — so the three browser tests, running after #27, took the playwright-core/@sparticuz remote path (fast failures: 146ms/11ms/7ms, chromium never launched), and the remote branch's `ensureEgressProxy()` net-server/slot machinery leaked the open handle that kept node alive after the last test. B1 proven correct standalone (`probe-b1.mjs`: visible_elements=5, low-count warning fires, decoy #010000 absent, ~3.7s).

**Fix:** the remote half of #27 now runs in a spawned child (house pattern from test/user-systems.test.mjs — "the child is load-bearing because setRemoteRuntime() is a one-way per-process latch"). Test count stays 30.

**Grading gotchas established:** never grade this suite with `--test-force-exit` (the browser tests register only after the module's top-level-await probe; force-exit truncates to 27 and reports them as passing-by-absence); the `--test-name-pattern` "tests 1, pass 1" shape was the same truncation, not a match failure.

**Lesson for the ledger:** a one-way runtime latch makes registration ORDER a hidden test dependency — any browser test and any `remote: true` build cannot share a process, whatever order they appear in the file, because a later edit reordering them reintroduces the contamination silently.

**Post-fix standalone run (gauntlet-suite-c.log):** 30 tests / 30 pass / 0 fail / 0 skipped, EXIT=0, duration ~7.0s, clean process exit — the hang disappeared with the latch fix, confirming the leaked handle was the remote egress-proxy machinery. `subject_worse` unit fix also proven green in this run. Full suite now in flight (expect 1569/1566/0/3).

**Full suite (full-suite-final.log):** 1569 tests / 1566 pass / 0 fail / 3 skipped, EXIT=0, ~43.7s. The 3 skips are the standing three, read individually at log lines 109/744/745 (file-URL fallback notice; the two removed-capability phase2 tests). All four repaired gauntlet tests confirmed RUN inside the full pass by name (log lines 337, 347–350): the subject_worse unit test, the child-process registration test (415ms — the spawn cost), and the three browser tests. +30 over the prior ledgered 1539 is exactly the design-gauntlet suite. Matrix v5 launched detached.

**Matrix v5 (mutants-v5.log):** 30 mutants, 30 killed, 0 survived; 2 controls, 0 false-failed; EXIT=0 read from inside the log, against the declared 30/30/0/0 baseline. Two radii moved v4→v5 and both are explained by this round's edits, not new guards: G4 5→6 (the null-branch product fix routes an unparseable BODY reading through the honest-note branch, so the body FIRE test now reds under a dead parser) and G19 17→18 (the new tracking-body unmeasured test joins the rhythm blast radius). G24 kills THROUGH the child process now, still radius 1. G26–G30 entered at 1/1/2/1/1 — G28's radius 2 is B2 plus the lazy-load test sharing the one TALLY_CAP mechanism. Harness header rewritten from the v5 measurement. Sol round-2 falsification pass launched detached (brief: SOL-BRIEF-R2.md, code-reading scope, browser gate named unavailable up front).

## Checkpoint 8 — Sol round 2: 2 CONFIRMED, both fixed; matrix v6 in flight (2026-08-14)

**Sol round-2 verdict (sol-round2.log, read whole; EXIT=0 inside log): DOES NOT SURVIVE — 1 P1 + 1 P2 CONFIRMED, 0 P3; seven claims attempted and held.**

- **P1 CONFIRMED — ancestor opacity.** The visibility predicate checked each element's OWN computed opacity only, and opacity is NOT inherited: a sized child inside an `opacity:0` ancestor reports computed opacity "1" while rendering nothing, so whole invisible subtrees inflated `visible_elements` and polluted every tally. B1's 30 decoys all applied opacity DIRECTLY, so the fixture passed against exactly this defect — the house "detects rather than encodes" class. **Fix (src/design-gauntlet.ts):** memoized ancestor walk `hiddenByOpacity` — O(n) because `querySelectorAll` returns document order, so a parent's verdict is cached before its children ask. display:none subtrees are already caught by geometry (zero rect); `visibility` IS inherited AND a `visibility:visible` child of a hidden parent genuinely renders, so the own-style read is CORRECT there — opacity is the one ancestor leak. **Guard:** B1 gains an `opacity:0` WRAPPER holding 30 sized `opacity:1` children (`#000f00` greens); asserts both the low-count warning (the ancestor arm alone leaves 35 visible ≥ 20 under a revert) and `#000f00` absent from the surfaces tally. **Mutants:** G27 re-anchored to the new predicate line; NEW G31 = the plausible wrong revert (own-opacity only, ancestor walk dropped) — only B1's ancestor assertions separate G31 from G27.
- **P2 CONFIRMED — per-site cap coverage.** `cap()` has SEVEN call sites and B2 asserted only the surfaces tally + warning, so a silent `.slice(0,100)` at any non-surface site recreated the original defect with B2 and G28 both green (G28 mutates the shared constant, which every site inherits). Implementation itself correct — fix is test-side. **Guard:** B2's fixture now overflows all seven capped dimensions at once (120 distinct values per dimension per div: background, border color, text color, font-family, font-size, radius, shadow) and asserts, per dimension BY NAME, `tally.length === 100` AND the truncation warning naming that dimension — a per-site silent slice drops exactly its own name and reds. **Mutants:** NEW G32–G37, one per non-surface cap site (borders / text colors / families / sizes / radii / shadows), each `cap("<name>", …)` → bare `.slice(0,100)`.
- **Held (attempted, not broken):** tracking-null branch (G26), lazy-scroll (B3/G29), isError shape (code-reading only, stated), protocol pins (G30), browserless-abort, the child-process latch fix (G24 dies through the child), header/log consistency.
- Rebuild after the P1 fix: BUILD_EXIT=0 (build-r2.log). Standalone suite post-fix: 30/30/0/0 EXIT=0 (gauntlet-suite-r2.log). Matrix v6 launched WHOLE (39 = 37 mutants + 2 controls; probe, tests and anchors all changed) → mutants-v6.log, in flight at this checkpoint.
- REMAINING: grade v6 (expect 37 killed / 0 survived / 2 controls green, radii diffed vs v5 header) → header v5→v6 rewrite → full suite re-run (expect 1569/1566/0/3) → CLAUDE.md ledger → commit explicit paths (NO push).

## Checkpoint 9 — round 2 closed: v6 clean, full suite green, ledger updated (2026-08-14)

- **Matrix v6 (mutants-v6.log): 37 mutants / 37 killed / 0 survived / 0 false-failed; 2 controls green; baseline 30/30/0/0; EXIT=0 read inside the log.** Every v5 radius held identically (checked by set — G19 stays 18 because B1/B2 are browser fixtures outside the rhythm comparison set); G27 re-anchored kills at 1; G31–G37 entered at radius 1 each. G31 reds the same test as G27 and is separated by which ASSERTION fires (E14/E15 pattern); G32–G37 are killed by B2's per-name warning assertions — a silent per-site slice keeps length 100 but drops exactly its own name.
- **Full suite re-run (full-suite-r2.log): 1569 / 1566 / 0 / 3, EXIT=0.** The 3 skips are the standing three, read individually at log lines 109/744/745; the three browser guards + the unmeasured-reference unit test confirmed RUN by name at lines 337, 348–350.
- Harness header rewritten v5→v6 from the measurement (v5 history compressed below it, house pattern).
- CLAUDE.md ledger updated: worktree 111 stdio / 66 gated (origin/main still 110/65 until Andrew pushes), Verify figure 1569/1566/0/3 + matrix v6, the three carry-forward lessons (ancestor opacity; shared-constant mutant blind to per-site defects; one-way latch makes registration order a hidden dependency), the force-exit grading gotcha.
- Committing explicit paths next; NO push (pushing main deploys the live endpoint — Andrew's gate).
