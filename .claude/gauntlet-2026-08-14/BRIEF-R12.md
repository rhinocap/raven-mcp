# Adverse falsification pass — REPORT ONLY, do not edit files

Repo: `/Users/accunliffe/projects/raven-mcp`. Target commit: `2981f58` on `main` (not pushed).
Your job is to FALSIFY the claims below. Every finding needs a file:line or a reproducible
command. Report P1/P2/P3. End with exactly one line: `SURVIVES` or `DOES NOT SURVIVE`.

You are auditing the DISPOSITION of three findings from a previous pass (Sol R11) on the
`design_gauntlet` tool's hairline-provenance evidence. R11's findings were:

- **P1**: the v15→v16 mutant-matrix set diff records only deduplicated failing TEST NAMES and
  discards assertion messages, so it is blind to a mutant killed in both runs by a DIFFERENT
  assertion inside the same test. Two fixtures were rewritten in `a1a2384`; nothing established
  the rewrite preserved WHICH harm detects each mutant.
- **P2**: the harness classifies any non-green mutant run as `killed`, so a dead child or an
  unparsed summary would be scored as evidence against a mutant; and `summary:` + `EXIT=0` was
  described in the session log as jointly harness-written, which was false.
- **P3**: the origin-limit residual comment in `src/design-gauntlet.ts` called the
  matrix-re-run cost the load-bearing reason for documenting rather than guarding, which is
  backwards — reachability is.

## Claim A — P1 is closed by measurement

The argument: the blind spot is only the INTERSECTION of the mutants carrying the rewritten
"UNKNOWN conditional group" test in both runs (v16: G42 G48 G54 G59 G64 G69; v15: G42 G45 G48
G54 → intersection G42 G48 G54), because gained and lost red-set members are already visible to
the set diff. `.claude/gauntlet-2026-08-14/p1-assertion-differential.mjs` applies each of those
three to `dist/design-gauntlet.js`, runs the CURRENT fixture and the pre-rewrite fixture
(`git show a1a2384^:test/design-gauntlet.test.mjs`) scoped by
`--test-name-pattern 'UNKNOWN conditional group'`, and compares the FIRST assertion message.
Reported result: all three SAME MESSAGE, with G42's message differing from G48/G54's — offered
as proof the comparison discriminates rather than defaulting.

Attack specifically:
- Is the intersection really the whole blind spot? Name a masking mode it misses.
- Run the differential yourself. Does it reproduce? Does `--test-name-pattern` scoping change
  what the mutant can be detected by, versus a full-suite run (this repo has a documented
  landmine where `--test-force-exit` truncates this suite — is `--test-name-pattern` safe here)?
- "First assertion message" is the discriminator. Can two DIFFERENT harms produce the same
  first message? G48 and G54 both report `the ambiguity is disclosed` at the same line —
  is that one assertion covering two mechanisms, and does that weaken or void the claim?
- Is the OLD fixture actually the pre-rewrite one, and is the test NAME genuinely identical?
- Does restoring `dist/` after each mutant actually verify? Is `dist/` pristine now?

## Claim B — P2 is closed forward, and refuted for v16 retrospectively

Forward: `gauntlet-mutants.mjs` now ABORTS on a VOID run — unparsed totals, null status, or a
non-green run with an EMPTY named-failure list. Claimed proven in both directions with a
fault-injected copy (control reaches `summary:`; injected copy aborts at exit 1).
Retrospective: for `mutants-v16.log`, all 79 graded lines are claimed to carry `radius >= 1`
with named tests, none at radius 0, so no void run was scored as a kill in that measurement.

Attack specifically:
- Verify the 79/radius claim against the log yourself. Count it.
- Is "non-green with empty names" actually sufficient? Name a void run that still prints a `✖`.
- Could the new guard ABORT on a legitimate run — i.e. is it red-on-correct-code anywhere?
- The fault injection replaced `runSuite`'s spawn while leaving the predicate untouched. Is
  that a legitimate seam or is it grading a reimplementation?

## Claim C — P3's rewrite is correct and behaviour-neutral

`src/design-gauntlet.ts` now says reachability is load-bearing (own headless Chromium, no
persistent profile, no CDP attach, no caller-supplied launch args, no parameter that can point
the probe at a foreign context) and explicitly demotes the matrix cost to a non-reason.

Attack specifically:
- Is the reachability claim TRUE? Read `src/browser-launch.ts` and the `design_gauntlet` tool
  schema in `src/index.ts`. Find any path — env var, option, remote/local branch, existing
  context, CDP endpoint, launch flag — that lets a caller choose the browsing context.
- Is the change really comment-only? `git show 2981f58 -- src/design-gauntlet.ts`.
- Does the comment now overstate anything?

## Claim D — the round is behaviour-neutral and measured

`tsc --noEmit` exit 0; comments DO reach `dist/` here (no `removeComments`), so anchor
uniqueness was re-measured after a clean build: "81 mutants anchor uniquely and parse". Full
suite `.claude/gauntlet-2026-08-14/agent-output/full-suite-r12.log`: 1607 tests / 1604 pass /
0 fail / 3 skipped, EXIT=0, three skips read individually at lines 109/782/783.

The whole 79-mutant matrix was deliberately NOT re-run, on the stated judgement that the
harness change can only ABORT and cannot flip a kill to a survival or move a radius.

Attack specifically:
- Is that judgement true? Find any way the harness edit changes a verdict or a radius.
- Verify the suite numbers and the three skip lines yourself.
- Is there any other stale claim in the v16 header block of `gauntlet-mutants.mjs`?

## Ground rules
- Read the actual files and logs. Do not take any table here on trust.
- A claim that something cannot be tested is itself a claim — falsify it by writing the test if
  you can describe it.
- Report only. No edits, no commits.
