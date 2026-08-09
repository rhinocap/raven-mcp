# Falsification brief — DialKit spring presets, closing round

REPORT ONLY. Do not edit files. Your job is to REFUTE the claims below, not confirm them.
Repo root: /Users/accunliffe/projects/raven-mcp

## The claim under test
The spring-preset feature in the Grab overlay is complete and verified:
1. Its mutation matrix is MEASURED, not asserted: 10 mutants, 10 killed, 0 survived,
   2 controls, 0 false-failed.
2. The suite header now states that matrix accurately, including which mutants are
   invisible to which suite and why.
3. The full suite is 1488/1485/0/3 and the +7 delta is exactly 6 browser tests + 1 unit test.
4. The CLAUDE.md landmine paragraph and Verify block describe what the code actually does.

## Read these
- test/grab-overlay-spring-control.test.mjs   (the new browser suite + its header)
- .claude/dialkit-2026-08-08/spring-mutants.mjs  (the harness of record)
- test/grab-bridge.test.mjs — the test named "REGRESSION: spring -> linear() generation"
  (the unit half, including the S9/S10 call-site guard near the end of it)
- browser/raven-grab.js — search for SPRING_PRESETS, springCurve, springPosition,
  simplifySpringSamples, formatSpringLinear, SPRING_MAX_MS, SPRING_SETTLE_EPSILON
- CLAUDE.md — the landmine beginning "A spring is GENERATIVE-ONLY", and the Verify block

## Attack these specifically
a) Is any statement in the suite header FALSE about the code or the harness? The header
   makes falsifiable claims about radii, about which suite owns which mutant, and about
   why four mutants are invisible to the browser suite. Check each.
b) Is the mutant set BLIND to a real defect? Name a change to the spring code that is
   behaviour-visible to a user and that ALL 10 mutants plus both suites would miss.
   That is the highest-value finding.
c) Are the two bounds in the S9/S10 call-site guard (points <= 45, worst deviation
   <= 0.005) actually falsifiable, or does some arithmetic make one unreachable?
d) The controls C1/C2 are supposed to be behaviour-neutral. Are they? A control that
   secretly changes behaviour makes "0 false-failed" meaningless.
e) The "GENERATIVE-ONLY" contract: can a user reach a state where a committed spring
   value is silently REWRITTEN on a later commit — the destroy-the-original hazard this
   repo has already paid for twice with the bezier editor?
f) Is the settle-time search (last moment OUTSIDE the epsilon band, SPRING_MAX_MS cap)
   correct for all four presets AND for the overdamped/critically-damped branches?
g) Does anything in CLAUDE.md's new paragraph overstate what was measured?

## Output
For each finding: severity P1/P2/P3, the file:line, the concrete input or sequence that
triggers it, and what the correct behaviour would be. If a claim survives, say so plainly.
End with a one-line verdict: SURVIVES or DOES NOT SURVIVE.
