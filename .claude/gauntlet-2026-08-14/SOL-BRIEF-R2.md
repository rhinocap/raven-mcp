# Sol falsification round 2 — design_gauntlet Sol-disposition round

You are an adversarial reviewer. Your job is to REFUTE the claim below, not to
confirm it. Report findings as P1/P2/P3 with file:line evidence, or state
plainly which claims you attempted to break and could not. An empty report is
a failed run, not a clean bill.

ENVIRONMENT NOTE (up front): your sandbox likely cannot launch Chromium or
bind loopback sockets. Do NOT attempt to run the browser tests or the
mutation matrix — scope this pass to CODE READING of the diffs and the
measurement logs. The measurements are already taken and cited below; your
job is to find where the reasoning or the fixtures are wrong, not to re-run
them.

## Claim under audit

Round-1's seven findings were dispositioned correctly and completely:

1. P1 guard-via-probe: `measureGauntletPage`'s visibility predicate now
   requires computed opacity/visibility, guarded by browser test B1 (30
   opacity:0 decoys, 5 visible) + mutant G27 (predicate → `return true`).
2. P1 tracking-body null branch: unmeasured reference returns worse:false
   with an honest note (src/design-gauntlet.ts ~:284-292), guarded by a unit
   test asserting `row.subject_worse` + G26 (`||`→`&&`).
3. P1 tally caps: TALLY_CAP=100 truncation WARNS, guarded by B2 + G28
   (cap→8; radius 2, shared with B3's fixture).
4. P2 lazy-scroll: the scroll loop re-reads document height each iteration,
   guarded by B3 (content appended DURING the scroll) + G29 (limit captured
   once).
5. P2 isError shape: comment only, deliberately unmutated — a claim, stated.
6. P2 exact-phrase pins: G30 (protocol ALL→ANY critic).
7. P2 matrix-blind-to-probe: the three browser tests exist; the matrix
   baseline pins skips at 0 so a browserless run aborts instead of grading.

Plus one defect found during verification, fixed this round: test #27's
`buildServer({ remote: true })` flipped the one-way `setRemoteRuntime()`
latch, sending the three browser tests down the remote
playwright-core/@sparticuz path (in-suite failures at 146/11/7ms while
passing standalone) and leaking the egress-proxy handle that hung the run
after the last test. Fix: the remote half now runs in a spawned child
(house pattern, test/user-systems.test.mjs). Standalone suite after the fix:
30/30/0/0 EXIT=0, ~7s, clean exit. Full suite: 1569/1566/0/3 EXIT=0, the 3
skips the standing three.

## Measurements of record

- `.claude/gauntlet-2026-08-14/agent-output/mutants-v5.log` — matrix v5,
  30 mutants / 30 killed / 0 survived; 2 controls green; baseline
  30/30/0/0; EXIT=0. Radii in the harness header
  (`.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs`).
- `.claude/gauntlet-2026-08-14/agent-output/gauntlet-suite-c.log` — suite
  post-fix.
- `.claude/gauntlet-2026-08-14/agent-output/full-suite-final.log` — full run.

## Files to read

- test/design-gauntlet.test.mjs (whole file — especially the browser probe,
  the three browser fixtures, the child-process registration test)
- src/design-gauntlet.ts (measureGauntletPage, compareGauntletMeasurements,
  the tracking-body null branch, TALLY_CAP, the scroll loop)
- .claude/gauntlet-2026-08-14/gauntlet-mutants.mjs (header + G26–G30)

## Attack surfaces to prioritize

- Can any of B1/B2/B3 pass against the defect they were written for?
  (House history: fixtures that "detect rather than encode" — check the
  fixtures' own preconditions.)
- Does the child-process registration test still prove what the in-process
  version proved? (It reads `_registeredTools` in the child — can the child
  pass while the parent-visible surface differs?)
- Is the latch contamination fully closed, or can another test in this suite
  (or an import side effect) still flip `setRemoteRuntime()` before the
  browser tests run?
- Are the G26–G30 find-strings anchored to lines the fixes rewrote (stale
  anchors)?
- Any claim in the harness v5 header that the logs do not support.
