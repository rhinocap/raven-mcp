# design_gauntlet → npm (2026-08-17)

Andrew: *"I wanna get the design gauntlet onto NPM so that I could use it on a different machine."*

## Measured state

**npm 2.4.1 does NOT contain `design_gauntlet`.** Established by unpacking the published
tarball rather than by reading the repo: `grep -i gauntlet` on the file list returns
nothing (exit 1) and `grep -c "design_gauntlet" package/dist/index.js` returns 0. That
is the fact that makes a release necessary — not the ledger, which describes the
worktree.

**Branch topology.** The gauntlet work is on `feat/gauntlet-hairline-provenance`
(= local `main` + `0e66cc2`). Local `main` carries 8 unique commits — mostly auto-save
noise plus `80d4f52` (design_gauntlet) and `9ec2560` — and is **behind `origin/main`
by 9 commits**, including the entire v2.4.1 release. So the gauntlet work has to be
INTEGRATED onto `origin/main`, never pushed over it. The 81-file diff against
`origin/main` includes `site/`, `web/` and `web/data/changelog.json` deletions that
are artifacts of being behind, not intentional reverts — do not carry them forward.

Note `git branch -vv` reported "ahead 8, behind 7" while `git log main..origin/main`
enumerated **9**. Trust the enumeration.

**CHANGELOG.md is missing its 2.4.1 section** for the same reason — local `main` predates
the release.

**Suite before this session's edits:** 1573 / 1570 / 0 fail / 3 skipped, EXIT=0. The +4
over the ledgered 1569 is the `device_scale_factor` commit, not the WIP. The 3 skips are
the same three, read individually at log lines 109/748/749. The gauntlet suite was
confirmed to have RUN by grepping its own test names out of the log.

**`npm whoami` → E401 Unauthorized.** Andrew's to fix (`npm login`, his own terminal).
Per the runbook this must be resolved BEFORE `scripts/release.sh` runs, because the
script bumps and rebuilds before `npm publish` — an unauthenticated run leaves a
half-done release needing the §3a recovery path.

## What this session changed

The uncommitted WIP in `src/design-gauntlet.ts` (+49/−21) rewrote the border probe to
read all four edges instead of the top alone, and to dedupe treatments per element. It
shipped with **no tests**. Two things were done to it.

**1. `AUTHORED_RULE_CAP` 300 → 1200.** The WIP silently changed the cap's UNIT: it counts
ENTRIES, and reading four edges means one rule contributes up to four of them, so the
300 that bounded 300 rules now bounded 75. The failure is not a crash — it reports MORE
elements ambiguous, which reads to the caller as a page with unresolvable hairlines
rather than as a probe that stopped looking. 4× holds the per-rule reach exactly where
it was. Comment says why.

**2. Three browser tests**, each proven red by a revert rather than trusted for passing:

| Mutant | Radius | Kills |
|---|---|---|
| M1 `SIDES = ["Top"]` (revert the four-edge read) | 2 | per-side reading + per-side recovery |
| M2 drop `if (r.side !== side) continue` | 1 | per-side recovery ONLY |
| M3 drop the `elTreatments` Set | 1 | dedupe ONLY |
| CONTROL reorder `SIDES` | green | 37 pass / 0 fail |

M1's radius of 2 is one mechanism (the SIDES list is the entry point both assertions run
through), **not two independent guards**. M2 is the load-bearing one: it reddens only
test B, which is what separates the per-side FILTER from the four-edge READ — M1 alone
would not have. Checked that M2 dies on its DECLARED assertion ("the bottom hairline is
recovered on its own side"), not on some earlier one that `assert` happens to reach first.

The defect M2 guards is worth carrying: without the side filter, `matched` for the bottom
edge becomes `[3, 0.5]` in SIDES push order, the last entry is 0.5 so the `>= 1` early
return does not fire, and `matched.some(w => w >= 1)` then reports the row AMBIGUOUS. So
a real hairline is silently downgraded to "unresolvable" by a border on an *unrelated
edge*, with the caveat warning firing on a page that has no conflict in it. Not a wrong
number — a wrong verdict about the page.

Gauntlet suite: 33 → **37 tests, 37 pass, 0 skipped**.

## The four decisions — ANSWERED

An `AskUserQuestion` earlier in this session returned four answers which the system then
explicitly flagged as an **automated background-task event, not user input**. None of that
counted, so all four were re-asked in prose. Andrew then answered for real:

> *"1. Ship it its important for the gauntlet  2. I already said yes to this  3. yes.
> 4. full, I already answered these"*

1. **Ship the four-edge WIP** in this release.
2. **2.5.0 minor.**
3. **Push `main`: YES** — fresh, explicit, in-conversation approval, which is what the hard
   gate requires. Pushing `main` deploys the live MCP endpoint at `mcp.ravenmcp.ai`.
4. **Full four-surface runbook** — npm + MCP Registry + git tag + apex `.mcpb`.

Do not re-litigate any of the four; the tone read as impatience at being re-asked.

Still Andrew-only, in a real Terminal: `npm login` (currently **E401**) and the passkey
`npm publish`.

## Integration

Branch **`release/gauntlet-2.5.0`**, cut from `origin/main` (not from local `main`, which
is 9 behind). Three commits cherry-picked in order:

```
40e93d4  Add design_gauntlet (111 stdio / 66 gated)
6ed6f09  Recover authored sub-pixel hairlines; add device_scale_factor
dbe69b0  Read all four border edges, guarded by three mutant-proven tests
a1dfdaf  Changelog surfaces for 2.5.0
```

Cherry-pick over rebase, deliberately: rebasing drags the auto-save noise and the
`site/`/`web/` deletions, which are artifacts of being behind rather than intentional
reverts.

**Left behind on purpose — flag to Andrew:** `9ec2560` "Remove homepage tool ordinals".
Unrelated product work, and it conflicts with `origin/main`'s homepage gradient commits
(`b342d0a`, `d13f00e`). It is not lost; it is still on `feat/gauntlet-hairline-provenance`
and needs its own pass.

One conflict, `.claude/linear-backlog-queue.jsonl`, resolved by union merge with a node
script that validates each line as JSON and dedupes: **kept 28, invalid 0, dupes 0**.

WIP rescue before the branch switch: **`stash@{0}`** — "pre-release-integration: backlog
queue autosave". (`stash@{1}` is older and unrelated, from an accidental `release.sh minor`
run.) Pop `stash@{0}` when the release is done.

## Verification on the integrated tree

**Full suite: 1576 / 1573 pass / 0 fail / 3 skipped, EXIT=0** — the exit code read from
inside the log, not from the background task's notification, which describes the wrapper.
The 3 skips are the same three this repo has always carried, read **individually** at log
lines 109/751/752 (the file-URL fallback notice and the two removed-capability phase2
tests), not inferred from the total. Identical to the pre-integration figure, so the
cherry-pick cost nothing.

`node scripts/sync-manifest-tools.mjs` → "Synced 111 tools" with an **empty** diff — the
manifest was already correct.

Anon production hash measured BEFORE any push: 45 tools, `f64bb18…2bb0a6`, `design_gauntlet`
absent. Note the hash is computed over the **newline-joined** sorted names —
`printf '%s' "$(cat …)" | shasum -a 256`; a trailing newline gives `fa10e4cd…` and reads as
a false mismatch.

## Remaining sequence

1. Sol adverse pass (running, `.claude/gauntlet-2026-08-14/agent-output/SOL-RELEASE.out`)
   → disposition every real finding.
2. Andrew: `npm login`.
3. `DRY_RUN=1 scripts/release.sh` → `scripts/release.sh minor`.
4. Andrew: `npm publish` (passkey, his terminal).
5. `mcp-publisher publish` → git tag → push `main` (approved).
6. Re-verify the anon 45-tool hash against production **after** the push.
7. `cd web && vercel deploy --prod` — the apex `.mcpb` and the marketing changelog stay
   stale until this, and the workflow path does not print the reminder.
8. Rebuild local `dist/` + `/mcp` reconnect; `git stash pop`.

## Sol adverse pass — verdict DOES NOT SURVIVE (3 × P1, 3 × P2, 2 × P3)

The nested self-refutation run came back **INDETERMINATE**, not clean: the sandbox
denied `sandbox_apply` and even `pwd`, and the release branch is not publicly
reachable on GitHub, so it could not read the tree it was asked to attack. Per the
standing rule an environment-blocked adverse output is a FAILED run and must never
be dispositioned as "no findings" — so the primary pass's eight findings stand
unrefuted. Every one was then confirmed independently against the source rather
than accepted from the report.

### The organising principle

**A false RECOVERY is worse than a false ambiguity.** This is the house takedown
rule — "a false all-clear is the one forbidden outcome" — applied to measurement.
A caller handed `0.5px` acts on a number; a caller handed a caveat knows to look.
Every fix below chooses the second when the probe cannot honestly produce the first.

### P1 — three ways `authoredSubPixel` produced a confident wrong hairline

1. **Two SUB-PIXEL rules that disagree were answered by SOURCE ORDER.** The old
   guard was `matched.some(w => w >= 1)`, which only ever caught a sub-pixel rule
   paired with a full-pixel one. `0.25px` against `0.5px` is decided by specificity
   exactly as much as `0.5px` against `1px`, and the probe computes specificity for
   neither — yet it silently answered whichever rule came last in the sheet, with no
   caveat at all. That is a **fabricated hairline vocabulary reported with full
   confidence**. Now: `new Set(matched).size > 1` → `"unresolved"`. Any disagreement
   at all is unresolvable.

2. **A width the CSSOM hands back unresolved was DROPPED, and the drop inverted the
   feature.** `border-top-width: var(--hairline)` is how a tokenised design system
   writes this — the likeliest real case, not an exotic one. It parses to NaN, was
   discarded, the row then matched no collected rule, and the probe answered the
   engine's own computed `1px` as a confident measurement. A page authored at half a
   pixel reported as having a 1px vocabulary it does not have. Now recorded in a new
   `unresolvedRules` collection; a matching element returns `"unresolved"`.
   Keywords (`thin`/`medium`/`thick`) are still dropped deliberately — they are
   engine-defined integers, never the sub-pixel case this recovers.

3. **Past the rule-scan cap, stylesheet-derived values were still trusted.** The cap
   can stop **MID-RULE**, so the collected set past that point is not a prefix of the
   cascade — it is an arbitrary truncation of it. A later rule's winning `1px` can be
   missing while an earlier `0.5px` on the same side was kept, and the retained value
   reads as a confident recovery of an edge that really renders at 1px. Now
   `if (ruleOverflow) return "unresolved"` — past the cap **no** stylesheet-derived
   value is trusted for any element. That also makes `SIDES` order unobservable in
   the recovery path, which is the only reason the truncation is safe.

`authoredSubPixel`'s return type widened to `number | "unresolved" | null`. Inline
style is read off the element rather than from the capped scan, so it stays
trustworthy past overflow and needs no conflict handling — it wins the cascade
outright. The caller no longer re-tests `ruleOverflow` (that would count the same
edge twice); it branches on `typeof authored === "number"`.

### P2/P3 — four prose claims that were false as written

- The `AUTHORED_RULE_CAP` comment claimed the 4× raise merely "held the reach where
  it was". It now also states what hitting the cap MEANS: not a quiet narrowing but
  a full shutoff of stylesheet-derived recovery.
- `src/index.ts:~1858` claimed 64 gated / 110 stdio, and its per-category split
  summed to **63** against its own stated 64. Both fixed to 66/111 and the decayed
  split **deleted** rather than patched — only the totals the count-asserting suites
  actually enforce are claimed now.
- `design_gauntlet`'s tool description front-loaded "family budget", "elevation
  strategy", `subject_worse` and `verdict.on_par` with no example — jargon-first for
  the bound solo-dev lens. Rewritten to open with the question the tool answers
  ("why does my page look less polished than theirs?"), name concrete references,
  and give a worked bar. **Consequence: `manifest.json` carries tool descriptions,
  so `sync-manifest-tools.mjs` must re-run AFTER the build and will show a non-empty
  diff this time.** The anon 45-name hash cannot see it — gauntlet is gated and the
  hash is name-only.
- CHANGELOG 2.5.0 claimed the unresolvable case was "two rules of different
  specificity both matching". That was narrower than the code even before this round
  and false after it; rewritten to name all four causes. `web/data/changelog.json`'s
  sentence is true as written and was deliberately left alone.

Also: `.claude/linear-backlog-queue.jsonl` carried a **semantic** duplicate the
earlier union merge missed — lines 24/25 had identical `title` and `body`, differing
only in `source`, and the merge deduped by exact line. Line 25 dropped;
revalidated at **27 lines, 0 invalid JSON, 0 duplicate titles** (was 28).

### Found here, not by Sol: the SIDES-reorder "CONTROL" is not provably neutral

`tally`'s `sort` is stable, so equal-count entries break ties by `Map` insertion
order — which depends on `SIDES` order — and `cap` then slices at `TALLY_CAP`. A
reorder can therefore change which entries survive the slice on a page with ties at
the boundary. It is green in practice, but "green" and "behaviour-neutral by
construction" are different claims, and a matrix's control has to be the second.
Reclassification pending in the harness rewrite.

### Measured

Gauntlet suite **40 tests / 40 pass / 0 fail / 0 skipped, EXIT=0**
(`node --test test/design-gauntlet.test.mjs` — never `--test-force-exit`, which
truncates the run and reports the browser tests as passing-by-absence). 37 → 40 is
exactly the three new browser tests, one per P1.

**All three passed on their first run, which by this repo's own standing rule is
worth nothing until a mutant proves each red.** That is the open work.

### Harness state — STALE, blocks the completion claim

`.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` would ABORT immediately against
the current tree: `EXPECTED_BASELINE` is `{tests:30, pass:30}` — already stale at 30
against a 37-test suite before this round, now against 40. And
`grep -E 'SIDES|elTreatments|r.side !== side'` returns **nothing**: the four-edge
work has no mutants at all, so the three tests the previous session called
"mutant-proven" were proven by hand-reverts that were never encoded. Outstanding:

1. ~~`EXPECTED_BASELINE` → 40/40/0/0.~~ **DONE.**
2. ~~Three mutants for the four-edge work.~~ **DONE** — G38 `SIDES=["Top"]`,
   G39 neuters the `r.side !== side` filter while leaving the four-edge READ
   intact (the only thing that separates the two mechanisms — G38 alone would
   not, since the SIDES list is the entry point both assertions run through),
   G40 swaps the `elTreatments` Set for a push-through array so an undeduped
   uniform box quadruples its own weight in the 90%-coverage tally.
3. ~~Three mutants for this round's fixes.~~ **DONE** — G41 restores the exact
   pre-fix shape of BOTH halves (`matched.some(w => w >= 1)` + last-wins) and
   must leave the existing mixed conflict test GREEN, which is precisely why
   that test could not see the defect; G42 drops the unresolved-expression
   record so a `var()` width falls to `null` and the engine's own rounded 1px
   is reported as measured; G43 turns off the overflow refusal, which still
   fires the cap caveat — only the recovered VALUE separates it.
4. ~~Reclassify the SIDES-reorder control.~~ **DONE, and the premise was wrong:**
   the file contained no such control to reclassify. Only C1 (object-literal
   key order) and C2 (declaration order) exist, both behaviour-neutral by
   CONSTRUCTION. The previous session's "CONTROL reorder SIDES" row was a
   hand-run that was never encoded — the same unencoded-hand-probe class as the
   four-edge tests, one file over. It is now written into the harness as
   deliberately NOT a control: `tally`'s sort is stable, so equal-count entries
   break ties by Map insertion order (which SIDES order decides) and `cap` then
   slices at `TALLY_CAP`, so a reorder can change which entries survive the
   slice on a page with ties at the boundary. It is unobservable in the
   RECOVERY path only — a narrower claim than behaviour-neutral, and green is
   not the claim a control makes.
5. **IN FLIGHT** — matrix v7 re-run WHOLE (45 mutants), header rewrite pending
   its result. Pre-flight passed at **45 anchor uniquely and parse**, which is
   itself worth reading: no find-string went stale despite this round rewriting
   `authoredSubPixel` wholesale. Baseline read from inside the log at
   **tests=40 pass=40 fail=0 skipped=0 status=0**. Through G30 at last read,
   every carried-over radius matches v6 exactly.

Also closed this session, unrecorded above: `site/changelog.html` regenerated
(`node scripts/gen-changelog-html.mjs` → 34 releases) and the diff is **empty** —
it was already correct from `a1dfdaf`. A no-op regeneration is still worth running,
because "already correct" and "never generated" are indistinguishable without it.
