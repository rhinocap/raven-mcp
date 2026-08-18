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

---

## Checkpoint — matrix v7 landed, commit `62b9276`, Sol round 3 returned

Everything from item 5 above closed, and the numbers are read from inside the
logs rather than from the background task notifications (a notification
describes the WRAPPER, not the harness verdict).

- **Matrix v7**: 43 mutants, 43 killed, 0 survived, 0 false-failed; 2 controls
  green; `EXIT=0`, against a declared 40/40/0/0 baseline. Pre-flight passed at
  45 anchors. Harness header rewritten v6 → v7.
- **Build clean at 111 tools**; `manifest.json` moved by one line — the first
  round in a while where it actually moved.
- **Full suite 1579 / 1576 / 0 / 3, `EXIT=0`.** The 3 skips read INDIVIDUALLY at
  output lines 109/754/755, not inferred from the total; the gauntlet suite was
  confirmed to have RUN inside the full pass by grepping its own test names out
  of the log, at lines 347–359.
- **Commit `62b9276`** (9 files, +436/−38). Local `main` moved `ceb2138` →
  `62b9276` only after proving all 8 divergent commits are preserved on
  `feat/gauntlet-hairline-provenance` (`git branch -a --contains` per commit).
- `package.json` reads **2.4.1**, observed in the build output — NOT the 2.4.0
  the CLAUDE.md ledger states. The ledger is stale by one patch.

### Sol round 3 — DOES NOT SURVIVE (3 × P1, 1 × P2, 1 × P3)

All three P1s CONFIRMED by reading the source rather than trusting the report,
and all three are the SAME direction the previous round's were: **a confident
wrong hairline**. The organising principle holds — a false RECOVERY is worse
than a false ambiguity, because the caller is handed a number instead of a
warning.

1. **A blocked stylesheet did not prevent a confident recovery.** The caller
   accepted a recovered number and only then consulted `sheetsBlocked`, so every
   UNrecovered 1px edge was flagged ambiguous while the recovered ones — the
   ones carrying an actual claim — were the exception.
2. **Inline style does not win the cascade outright.** A stylesheet declaration
   marked `!important` beats it, so the shipped comment claiming a style
   attribute "stays trustworthy even once that scan overflowed" was false. The
   same path also mishandled an inline `var(--hairline)`: the parse failed and
   it FELL THROUGH to the stylesheet scan, letting a rule the inline
   declaration overrides answer for the edge.
3. **`parseFloat` is not a unit check.** `parseFloat("0.5em")` is `0.5`, so an
   edge authored `.5em` at a 2px font-size — which computes and renders at
   exactly 1px — was reported as a recovered `0.5px` hairline.

P2: G41 and G43 do not independently prove all their declared behaviour —
`assert` aborts at the first failure, so each mutant reddens a value assertion
and the caveat assertion behind it is never reached. P3 was a confirmation
(the `new Set(matched)` numeric dedupe, `matched[0]`, the per-side filters and
the `elTreatments` dedupe are all correct) and needs no action.

### Round-3 dispositions

- **Four new browser tests**, not three: the inline P1 has two distinct doors
  (an `!important` rule outranking the attribute, and an unreadable inline
  value falling through), and one mutant cannot separate them.
- The blocked-sheet fixture's mechanism was **MEASURED, not assumed**: from a
  `file://` page a sibling `file://` `<link rel=stylesheet>` loads, applies, and
  then throws `SecurityError` on `.cssRules` — which is what increments
  `sheetsBlocked`. A `data:text/css` link is READABLE and leaves it at 0, so the
  obvious fixture would have measured nothing. `withFixture` gained an `extra`
  sibling-files parameter for exactly this.
- **Seven new mutants.** G44–G47 are one per fix. G48–G50 are the P2
  disposition and generalise it: they break the DISCLOSURE and nothing else, so
  each caveat assertion is reached on its own — G48 stops the ambiguity being
  counted (widths stay correct, the caveat simply never fires), G49 and G50 drop
  one NAMED cause each.
- **G42 was re-anchored** — its find-string named the keyword test the unit gate
  replaced, so it died exactly as the standing dead-anchor rule predicts. Same
  defect, same declared behaviour, new anchor.
- Suite is 44 tests, 44 pass, 0 fail, 0 skipped. **That is worth nothing until
  the matrix proves each new test red** — matrix v8 is in flight.

### Round-3 measurement

- **Matrix v8**: 50 mutants, 50 killed, 0 survived, 0 false-failed; 2 controls
  green; `EXIT=0`, against a declared 44/44/0/0 baseline. Pre-flight passed at
  52 anchors. Read from inside the log.
- **G44–G47 each at radius 1**, each reddening exactly its own new test — which
  is the only thing that makes those four tests guards rather than comments.
- **G48 at radius 6, and that number IS the P2 disposition.** Six hairline tests
  carry a caveat assertion sitting BEHIND a value assertion, and until G48
  existed not one of the six was falsifiable, because `assert` aborts at the
  first failure. G48 breaks the disclosure and leaves every value assertion
  green, so each caveat is reached on its own. One mechanism, six observables —
  never six independent guards; G49/G50 separate the named causes, one each.
- **Exactly one carried-over radius moved: G42 1 → 2**, checked BY SET against
  the printed red names, not by arithmetic. It picks up the new non-px test
  because `0.5em` IS an unresolved rule and reaches the very push G42 deletes.
  Every other v7 radius held identically; G19 stays 18.
- **G42's anchor died** and was re-cut — this round's `pxLength()` fix rewrote
  the exact line it named. v7's header had called an intact pre-flight "luck
  rather than a property." It was luck.
- Build clean at **111 tools**; `manifest.json` unmoved (no tool added).
- **Full suite 1583 / 1580 / 0 / 3, `EXIT=0`.** The +4 over 1579 is exactly the
  four new browser tests. Skips read INDIVIDUALLY at lines 109/758/759 — the
  same three, shifted only because the new tests print above them — and the
  gauntlet suite was confirmed RUN by grepping its own test names, the four new
  ones at lines 357–360.
- `npm whoami` → `accunliffe`. The E401 that blocked `release.sh` is cleared.

## Provenance gap closed (was missing from this log)

- Commits: `01abec4` — the `auto-save-on-turn.sh` hook swept `src/design-gauntlet.ts`
  and `test/design-gauntlet.test.mjs` into its own generic-message commit mid-turn,
  which is why a `git commit --only` reported 2 files rather than 4. Nothing was
  lost; the content is split across two commits. Then `2d1c12e` — the harness
  header v7→v8 rewrite plus the log entry above.
- Release pre-flight, all green: `DRY_RUN=1 scripts/release.sh minor` reports
  "would bump to 2.5.0" from a current **2.4.1** (the CLAUDE.md ledger still says
  2.4.0 and is stale by one). Clean tree, on `main`, `mcp-publisher` on PATH,
  registry key present, `git pull --ff-only` a no-op — local main 8 ahead / 0 behind.
- `npm pack --dry-run`: `dist/design-gauntlet.js` at 52.7kB is in the payload
  (231 files, 1.1 MB packed / 4.6 MB unpacked). The tool genuinely ships. That is
  the repo-vs-published discipline — `dist/` is gitignored, so `git status` says
  nothing about the npm payload.

## Sol round 4 — DOES NOT SURVIVE (2 × P1, 1 × P3)

Brief `.claude/gauntlet-2026-08-14/SOL-BRIEF-R4.md`, log
`.claude/gauntlet-2026-08-14/agent-output/sol-r4.log`, `SOL_EXIT=0`, 138,426 tokens.
Both P1s are the SAME class as all three round-3 P1s and as each other: **a cascade
source the probe cannot see, producing a confident wrong hairline.** Round 3 fixed
the doors; round 4 found the scan itself was incomplete.

- **P1 — constructed stylesheets bypass the `!important` guard.** `document.
  adoptedStyleSheets` is a SEPARATE collection from `document.styleSheets` and the
  cascade includes both. An adopted `.row { border-top-width: 1px !important }`
  against an inline `0.5px` renders at 1px while the probe saw no conflict and
  recovered 0.5px. CONFIRMED against source. Fixed by scanning the adopted list
  after the document list, counting an unreadable one into `sheetsBlocked` exactly
  as a cross-origin sheet is counted.
- **P1 — an active animation also outranks inline width.** The code's own comment
  said `!important` is "the only thing" that can outrank inline style. CSS Cascade
  places animation declarations above ALL normal author declarations, inline
  included, and the animated value is in no rule this scan collects. CONFIRMED.
  Fixed with `animatedSide(el, side)` — a Web Animations `getAnimations` read that
  matches the effect's own keyframe property names and a transition's
  `transitionProperty`. **The gate sits ahead of BOTH doors, not inside the inline
  branch**, because the stylesheet path is wrong for exactly the same reason. An
  unreadable animation list answers TRUE: the question is "can I trust the cascade
  here", and a probe that cannot see the list cannot answer it.
- **P3 — the `pxLength()` contract was misstated in my own claim.** Keywords return
  `"keyword"` and are DROPPED, not `"unresolved"`. The source comment is accurate;
  the brief's claim 3 was not. Corrected wording, no code change — and it does not
  recover a false sub-pixel value, so the safety outcome was never at risk.
- Claims 1, 4, 5 and 6 SURVIVED, including an independent re-parse of the v8
  matrix log (50/50, two green controls, `EXIT=0`, baseline 44/44/0/0, 52 pre-flight
  anchors, only G42 moved 1→2).

Two new guards, both written to be blind-spot-proof rather than merely present:
the adopted-sheet test is byte-identical in EFFECT to the existing `<style>`
`!important` test, which is the point — a mutant confined to the
`importantConflict` branch cannot see it, so only a scan-source mutant can; and
the animation test carries a second arm animating `border-radius` on the same
geometry, proving the check is PER-PROPERTY and not a blanket refusal for any
animated element.

### Round-4 fix measurements

- Gauntlet suite after the fixes: **46 tests / 46 pass / 0 fail / 0 skipped,
  EXIT=0** (`.claude/gauntlet-2026-08-14/agent-output/suite-r4.log`). The +2 over
  44 is exactly the two new tests — the adopted-stylesheet test and the
  two-armed animation test. Build clean (`BUILD=0`).
- Three mutants added to `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs`, all
  three find-strings taken from the COMPILED `dist/design-gauntlet.js` rather than
  from `src/` (TypeScript reformats multi-line bodies, so a source-shaped anchor
  does not resolve):
  - **G51** — adopted sheets unscanned (the loop iterates `[]`).
  - **G52** — the animation gate deleted (`if (false)`).
  - **G53** — the animation gate made PROPERTY-BLIND (any keyframe matches).
  G52 and G53 pull in OPPOSITE directions on purpose: G52 is the under-refusal
  and G53 is the over-refusal, so a "fix" that simply refuses every animated
  element cannot pass both. That is the A9/A10 pattern from the mic-alignment
  suite, and it is why the animation test has a `border-radius` arm at all.
- `EXPECTED_BASELINE` raised 44 → 46.
- Matrix **v9 launched** (background `bn1dsvimr`), writing to
  `agent-output/mutants-v9.log` with `EXIT=` appended inside the file. Re-run
  WHOLE rather than extended, per the standing rule — the round rewrote the scan
  loop and inserted a gate ahead of both doors, so no carried-over radius can be
  assumed.

### Matrix v9 — and the round-4 guards' own defect, found by grading the mutants

v9 measured **53 mutants, 0 survived, 0 controls false-failed, EXIT=0**, against a
declared baseline of 46/46/0/0 read from inside `agent-output/mutants-v9.log`.
G51, G52 and G53 each killed at radius 1.

**A kill is not evidence the declared assertion fired.** Both G52 and G53 redden
the SAME test, so each was graded by hand — mutant applied to `dist/`, that one
test run by name, the `AssertionError` message read:

- **G53** fires on `an animation on ANOTHER property does not poison the reading`
  — the arm it was written for. Correct.
- **G52** fires on `precondition: the animation actually forces 1px` — NOT the
  harm assertion. The precondition was computed from the same probe output as the
  harm assertion, so deleting the gate emptied the tally of `1px` and the
  precondition aborted the test first. The reader would have been told the
  FIXTURE was broken while the product had regressed. Both new tests had it.

That is round 3's own P2 arriving inside the tests written to close round 4, and
it is worth stating as a rule: **a precondition derived from the artifact under
test is not a precondition — it is a second harm assertion wearing a fixture
label, and it outranks the real one by sitting above it.** The two readings are
genuinely indistinguishable from this output alone (a fixture whose animation
never applied produces the identical tally), so the fix is not a better
discriminator but an ORDER plus an honest message: harm first, message naming
both readings, fixture check immediately below as the separator.

Second gap from the same measurement: **every caveat assertion in the hairline
tests was a comment.** They sit last, and no value-breaking mutant reaches them.
**G54** is the disclosure-only mutant that closes it — it suppresses the
`Hairline caveat` warning and moves no reported number, the G48–G50 pattern
applied to the round-4 tests.

Suite after the reorder: **46 / 46 / 0 / 0, EXIT=0** (`agent-output/suite-r5.log`),
build clean. Matrix **v10 re-run WHOLE** (54 mutants), never extended.

## Matrix v10 — the disclosure gap measured, and the full suite

**Matrix v10, re-run WHOLE** after the assertion reorder. Read from inside
`.claude/gauntlet-2026-08-14/agent-output/mutants-v10.log`:

```
baseline: tests=46 pass=46 fail=0 skipped=0 status=0
summary: 54 mutants, 0 survived, 0 controls false-failed
EXIT=0
```

**G54 killed at radius 10, and that number IS the measurement.** G54 is
disclosure-only — it suppresses the `Hairline caveat` warning and touches no
reported number, so every value assertion stays green and the trailing caveat
assertion is finally the first thing that can fail. Ten tests went red. Before
G54 existed, those ten caveat assertions were **comments**: `assert` aborts at
the first failure, so no value-breaking mutant ever reached one. This is the
G48–G50 pattern generalised, and its radius is the size of the gap it closed.

**Zero carried-over radii moved and zero red SETS changed between v9 and v10** —
the only delta is G54 entering. Verified BY SET against the printed red test
names, in both directions, not by arithmetic on counts. That is the right shape:
the reorder changed *which assertion fires*, not *which tests fail*.

The first attempt at that diff was garbage and is recorded rather than dropped:
I split the harness lines on `|`, but the harness joins multiple red test names
with ` | `, so fields misaligned and 18 bogus "RADIUS MOVED" lines printed. Fixed
with a tab-based extraction (`sed -E 's/^([^:]+): killed, radius ([0-9]+) — (.*)$/\1\t\2\t\3/'`
then `join -t\t`). **A diff instrument is a claim like any other.**

**G52 and G51 re-graded BY HAND after the reorder**, because a kill is not
evidence the declared assertion fired. Both now fire on the harm assertion:

- G52 → `an animated border-width is not answered from the inline declaration —
  a 0.5px here is EITHER the gate missing OR a fixture whose animation never
  applied; the next assertion separates them`
- G51 → `an adopted !important rule outranks the inline declaration — a 0.5px
  here is EITHER the probe trusting inline over an adopted rule OR a fixture
  whose adopted sheet never applied; the next assertion separates them`

Harness header rewritten as a MEASURED v10 block, demoting v8 to history, with a
note that v9 is superseded ONLY because G52 was mis-graded there and that **no
product code differs between v9 and v10**.

### Full suite

`RAVEN_NO_USAGE_LOG=1 npm test`, read from inside
`.claude/gauntlet-2026-08-14/agent-output/full-suite-r5.log`:

**1585 tests / 1582 pass / 0 fail / 0 cancelled / 3 skipped / 0 todo, EXIT=0.**

The **+2** over the previously ledgered 1583 is exactly the two round-4 tests,
confirmed to have RUN inside the full pass by name at log lines 360 (`hairlines:
an ADOPTED stylesheet is part of the cascade this probe reads`) and 361
(`hairlines: a side under an ACTIVE animation is unresolved, never recovered`),
both `✔`. Everything else this round — the reorder, G54, the header rewrite —
moves the count by ZERO.

**The 3 skips are the same three, read INDIVIDUALLY at output lines 109 / 760 /
761** (the file-URL fallback notice and the two removed-capability phase2 tests),
shifted from 109/758/759 by exactly +2 because the two new tests sit above them.

Instrument lesson, same class as the `ℹ`-not-`#` one already in the ledger: the
first skip grep (`↓`, `# SKIP`) returned NOTHING, which is indistinguishable from
a run with no skips. `node --test` emits `﹣` (U+FE63) as its skip marker here.
The silence was re-grepped rather than accepted.

**Nothing is committed or pushed and nothing is on npm.**

---

## Round 5 — Sol verdict DOES NOT SURVIVE (2 P1 + 2 P2 + 2 P3)

Fourth consecutive round to demonstrate the same thing: **a matrix measures the
mechanisms it NAMES and is blind to the ones nobody thought of.** Round 4's
header claimed the cascade scan was complete "for the sources this probe can
read". It was not, and both P1s are round 4's own shape one door over — a
cascade source the probe cannot SEE, producing a confident wrong hairline.

### The two self-corrections owed from round 4, both mine, both now applied

1. **The v10 radius table was transcribed from the v8 header, not derived from
   the v10 log.** Two cells shipped wrong: **G45 1 → 2** and **G48 6 → 8**. Both
   moved at **v8 → v9**, when the two round-4 tests landed. My v9 → v10 *delta*
   diff was correct and could not have caught this, because the error was
   inherited from a version older than the delta. Verified against
   `mutants-v10.log` lines 47 and 50, which print the red SETS. The rule now
   sits in the header: **re-derive every cell from the CURRENT log each round.**
2. **G54's radius of 10 was described as "exactly how many caveat assertions
   were comments before it existed". False.** G48's red set (v10 log line 50) is
   a strict subset of G54's (line 56): G48 already reached **8** of those 10.
   Only **2** were newly reached — the rule-scan-cap and blocked-sheet caveats,
   whose value assertions G48 leaves green. A radius is a fact about one
   mechanism; the DELTA against the mutants already in the matrix is a separate
   question from the count.

### The four product fixes (`src/design-gauntlet.ts`)

- **`@import` is a THIRD rule source, reached through a DIFFERENT property.**
  CSSOM gives a `CSSImportRule` **no `cssRules` at all** — the imported sheet
  hangs off `rule.styleSheet` — so the recursion never descended into one. An
  `!important` rule in an imported sheet outranks an inline width, and the probe
  answered from inline anyway. Now recursed, with the same blocked-sheet
  accounting (a cross-origin imported sheet increments `sheetsBlocked`, which
  stops every recovery).
- **`finished` is not gone.** `animation-fill-mode: forwards|both` keeps applying
  the final keyframe after `playState === "finished"`, and an animation-origin
  value outranks every normal author declaration including inline. The gate
  skipped every finished animation. Only a resolved fill of `none`/`backwards`
  is skippable now, read via `getComputedTiming()`.
- **A FALSE `@supports` branch was recursed into as though active** — the
  conditional-group test asked `rule.media && rule.conditionText`, and
  `CSSSupportsRule` has `conditionText` and NO `media`. That is the OTHER
  direction: a false AMBIGUITY, not a false recovery. Rules that are not on this
  render were collected and then reported as a conflict.
- **`@container` degrades to UNRESOLVED, deliberately.** A shape test cannot
  separate `@supports` from `@container`, and it must not try:
  `CSS.supports("(min-width:400px)")` answers TRUE about a *declaration* while
  identical text is a container query about a *box* this probe is not reading.
  So the subtree is marked unevaluable — widths under it land in
  `unresolvedRules`, where they can force an honest ambiguity and can never be
  handed back as a recovered answer. **The trade is stated rather than hidden:**
  it costs a correct recovery when the query DOES apply, and that is the
  survivable direction, because the same path with a FALSE query would recover a
  width that is not on the render at all.

Discrimination is by **TYPE** (`instanceof CSSSupportsRule` /
`window.CSSContainerRule`), never by shape — the round's transferable rule.

### Two harm-message widenings (Sol P3b)

Round 4's reorder put harm first and named **two** readings. There are **three**:
the probe misbehaving, a fixture whose sheet/animation never applied, and a
fixture that applied the **wrong value**. Naming two when a third exists
mis-attributes a fixture defect as product harm just as confidently as naming
one. Both messages now name all three, with the fixture check below as separator.

### Four new tests

Each fixture had to be designed against `authoredSubPixel()`'s **decision order**
rather than assumed, or it would measure nothing:

- **`@import`** — both readings are covered by the same three assertions. If the
  sibling sheet is readable its `!important` rule is a conflict; if Chromium
  blocks a `file://` sibling read it increments `sheetsBlocked`, which stops
  every recovery. Robust either way.
- **finished-forwards** — `0.01s linear forwards` finishes long before the
  measurement while `getAnimations()` still returns it.
- **false `@supports`** — the false branch must carry `!important`, so the
  pre-fix code produces a false ambiguity (the observable) and the post-fix code
  recovers the honest inline `0.5px`.
- **`@container`** — must have **no inline width** and a **non-important**
  declaration. With either, old and new code answer identically and the test
  measures nothing: a non-important `unresolvedRules` entry only forces
  "unresolved" on the no-inline path.

All four passed on their **first run**, which is worth nothing until a mutant
proves them red — the seventh time this project has recorded that.

### Gauntlet suite

`.claude/gauntlet-2026-08-14/agent-output/suite-r6.log`: **50 tests / 50 pass /
0 fail / 0 skipped**, EXIT=0, all four new tests present by name with `✔`.

### Matrix v11 — five new mutants, and a dead anchor

G55 (`@import` invisible again) · G56 (unconditional `finished` skip) · G57
(false `@supports` branch collected) · G58 / G59 (**one rule at two doors** —
G58 breaks the unevaluable FLAG at the container call site, G59 breaks the PUSH
that honours it; both redden the same single test, separated only by which
mechanism they break — the V14/V16 and V21/V22 pattern).

**G42's anchor died for the SECOND time** and the harness ABORTED rather than
mis-measuring — the uniqueness check working, and the standing dead-anchor rule
landing exactly where it always lands: round 5's demotion arm rewrote the exact
`else if` line G42 was pinned to. Re-cut with its intent unchanged, and its
blast radius is now wider **by construction**, because that one branch also
carries the demotion G59 targets from the other side.

`EXPECTED_BASELINE` bumped 46 → 50. Pre-flight: **61 mutants anchor uniquely and
parse.**

**Nothing is committed or pushed and nothing is on npm.**

**Matrix v11 — measured.** `59 mutants, 0 survived, 0 controls false-failed`,
`EXIT=0` read from INSIDE the log, against a declared 50/50/0/0 baseline; both
controls green. Exactly **five** carried-over radii moved, and every one was
confirmed by a red-set diff rather than by the arithmetic — no set changed while
its count held, no count moved while its set held, and **no mutant LOST a
red-set member**:

| mutant | v10 | v11 | ADDED to red set |
|---|---|---|---|
| G42-unresolved-width-dropped | 2 | 3 | @container |
| G44-blocked-sheet-still-recovers | 1 | 2 | @import |
| G48-ambiguity-not-counted | 8 | 10 | finished-forwards, @container |
| G52-animation-gate-dropped | 1 | 2 | finished-forwards |
| G54-hairline-caveat-undisclosed | 10 | 13 | finished-forwards, @container, @import |

The readable NEGATIVE is the load-bearing half: the FALSE `@supports` test
appears in **no** carried-over mutant's red set at all. That is consistent with
it being the only one of the four new tests asserting a *recovery* rather than
an *ambiguity* — it carries no caveat assertion for G48 or G54 to reach. A test
that moved nothing is evidence about what it measures, not a test that measures
nothing.

### Round 6 — found by HAND-GRADING, which a kill count structurally cannot produce

Both findings are defects in **claims**, not in shipped behaviour, and neither
was reachable from the matrix summary. Hand-grading means applying the mutant to
`dist/` and reading the `AssertionError` — asking WHICH assertion fired, not
whether something did.

**(a) G58 and G59 fail on the IDENTICAL assertion (line 959).** They are one
rule at two doors — G58 breaks the unevaluable FLAG at the `@container` call
site, G59 breaks the PUSH that honours it — so they are separated by mutation
SITE, not by message, and the harm message named only one of the two doors. A
future reader hitting that red would have chased the wrong mechanism. Widened to
name both, plus the fixture reading, with the next assertion doing the
separating.

**(b) The `@import` test's "both readings are covered" was a DISJUNCTION, not
coverage.** The comment claimed either reading satisfied the assertions — a
readable sheet gives an `!important` conflict, a blocked one increments
`sheetsBlocked`. True of the ASSERTIONS and false of the FIXTURE. Measured with
a standalone probe: from a `file://` page `'cssRules' in importRule` is **false**
(the imported sheet hangs off `rule.styleSheet`, which is the entire reason the
recursion missed it) and `importRule.styleSheet.cssRules` **throws
SecurityError**, every time. So that test is deterministically the BLOCKED arm —
and `sheetsBlocked > 0` returns `"unresolved"` **globally**
(`src/design-gauntlet.ts:983`), so it would pass even if the import walk
collected nothing at all. **The conflict arm — an imported `!important` rule
actually COLLECTED and outranking the inline width, which is half of round 5's
fix — was exercised by nothing.** A blunt refusal satisfying every assertion for
entirely the wrong reason is the shape this loop keeps finding.

Notably the file **already contained a comment 40 lines above `withFixture`
documenting that exact SecurityError behaviour** — two comments in one file
contradicted each other for a full round, and only a measurement resolved it.

Closed with four things. `withHttpFixture` serves the page and its imported
sheet over loopback http so the import is same-origin and readable, each
response carrying an explicit `Content-Type` (a stylesheet served as `text/html`
is not applied in standards mode, and the fixture would then measure nothing
while still looking like a passing test). A new test grades the conflict arm,
and **the ABSENCE of the cross-origin cause in the caveat is its whole
discriminator** — without that assertion a mutant forcing the blocked path keeps
it green while deleting the mechanism it exists to guard. The `file://` test's
reading is now PINNED through the caveat's own wording rather than assumed. And
**G60** forces the blocked path on a readable sheet: hand-graded at radius 1, on
its declared assertion, **with the `file://` test staying GREEN** — which is the
measurement that proves the two arms are genuinely separated rather than two
names for one path. G55 cannot do that job; it deletes the whole branch and
reddens both.

The probe grew a loopback `listen` in the same edit, because **a probe covers
every environmental prerequisite the tests use, not just the most obvious one** —
adding an http fixture obliges it. The `listen` gets its own `once('error')`
listener: an emitted `'error'` with nothing listening throws from the EVENT
LOOP, outside any surrounding try/catch, and can therefore never be classified.

One thing was deliberately NOT done: `m.hairlines` does not exist on the outer
measurement (`src/design-gauntlet.ts:617` destructures it out and the counters
surface only as warning text), and the fix was to assert on the two separately
worded caveat causes — **not** to add `hairlines` to the public
`GauntletMeasurement` type. That would be a product change made to satisfy a
test, and the caveat wording is the better discriminator here anyway, because it
names the mechanism instead of a number.

Suite: **51 tests / 51 pass / 0 fail / 0 skipped, EXIT=0**
(`agent-output/suite-r7.log`). `EXPECTED_BASELINE` bumped 50 → 51.

**Nothing is committed or pushed and nothing is on npm.**

## Matrix v12 — measured, and read from inside its own log

`.claude/gauntlet-2026-08-14/agent-output/mutants-v12.log`:

```
summary: 60 mutants, 0 survived, 0 controls false-failed
EXIT=0
```

Declared baseline 51p/0f/0s; pre-flight passed at 62 anchors (60 mutants + 2
controls). Both controls green (`C1-control-key-order-swap`,
`C2-control-decl-order-swap`).

The first background task notification for this run reported exit 0 while the
matrix had produced only its pre-flight line — **a notification describes the
WRAPPER, not the harness verdict**, so `EXIT=` was taken from inside the file.
The Monitor was written to fire on `EXIT=` *or* on the harness process vanishing
without one, because silence is not success.

### v11 → v12 radius delta, diffed BY SET in both directions

Computed by parsing both logs and comparing radius counts AND red-name sets, with
an explicit check for the two shapes arithmetic cannot see: a count that held
while its set changed, and a set that held while its count moved. **59 v11
mutants, 60 v12; G60 is the only entrant, none departed; exactly five
carried-over radii moved, every one +1, every one with an ADDED member, ZERO
lost members, ZERO count/set mismatches.**

| mutant | v11 | v12 | ADDED to red set |
|---|---|---|---|
| G45-inline-wins-unconditionally | 2 | 3 | READABLE-import conflict-arm test |
| G48-ambiguity-not-counted | 10 | 11 | READABLE-import conflict-arm test |
| G50-cross-origin-cause-unnamed | 1 | 2 | the `file://` @import test |
| G54-hairline-caveat-undisclosed | 13 | 14 | READABLE-import conflict-arm test |
| G55-import-sheet-unscanned | 1 | 2 | READABLE-import conflict-arm test |

Three readings worth carrying.

**G55's move was STRUCTURALLY PREDICTED before the run** — it deletes the whole
`rule.styleSheet` branch, so it *must* redden both import tests once a second one
exists. Predicting one cell in advance is what makes the other four readable as
measurements rather than as noise.

**G50 widened on the `file://` test, not on the new one.** That red comes from
this round's *pinning* assertion — the one fixing that fixture's reading through
the caveat's own wording. A pin no mutant can redden is a comment; G50 is the
measurement proving this one is falsifiable.

**G45/G48/G54 each gained the new http test, and v11's readable negative is why
that is worth stating.** In v11 the FALSE `@supports` test appeared in NO
carried-over mutant's red set at all, because it asserts a RECOVERY only. The new
http test asserts a recovery (`!widths.has('0.5px')`) AND a caveat disclosure, so
it reaches the caveat mutants. Which mutants a test moves is evidence about what
that test asserts.

The harness header was rewritten as a MEASURED v12 block, with the entire radius
roster re-derived from `mutants-v12.log` — v10 and v11 demoted to history. The
roster had been carrying **v10** values through the whole of v11, which is
exactly the decay the file's own standing rule warns about ("it was transcribed
from v8 once and shipped wrong in two cells"), and a correctly-measured delta
diff cannot catch an error inherited from a stale table.

## Round 6 close-out

Full suite: **1590 tests / 1587 pass / 0 fail / 3 skipped, EXIT=0**
(`agent-output/full-suite-r7.log`), `EXIT=` read from inside the file. Its **+1**
over the previously ledgered 1589 is exactly the one new browser test — the
READABLE-import conflict-arm test. Every round-6 harness edit, the pinned
`file://` reading, the widened `@container` message and G60 move the count by
ZERO.

**The 3 skips are the same three, read INDIVIDUALLY at output lines 109/765/766**
— the file-URL fallback notice and the two removed-capability phase2 tests — not
inferred from the total. All seventeen `hairlines:` tests were confirmed to have
RUN by name at log lines 351–367, the new one at 363. Grepping the word
"skipped" is the wrong instrument here and says so out loud: line 365 is a
PASSING test whose own name contains it (`a FALSE @supports branch is skipped`).

Sol round 6 was fired against `SOL-BRIEF-R6.md` (nine claims, covering rounds 5
and 6, with round 6's own method claim — *a kill is not evidence the declared
assertion fired* — offered up as claim 9 for falsification).

**Nothing is committed or pushed and nothing is on npm.**

---

## Round 7 — Sol R6's two P1s fixed, guarded, and fanned out

### Sol round 6 verdict: DOES NOT SURVIVE — 2 P1, 1 P2, 4 P3

`SOL-EXIT=0`, 573,424 bytes, read from inside the file.

| # | Pri | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | P1 | Shadow-root sheets are an UNSCANNED FOURTH cascade source; `:host { border-top-width: 1px !important }` beats an inline `0.5px` invisibly and the fast path recovers `0.5px` for an edge painted at 1px | **FIXED** — scan + gate + caveat + 2 tests + G61/G62/G63 |
| 2 | P1 | `@scope` / `@starting-style` recurse as AUTHORED; the scope condition is dropped at collection and only `r.selector` is tested with `el.matches()` | **FIXED** — type whitelist + 1 test + G64 |
| 3 | P2 | Finished-animation test covers `forwards` only; `both` and a refuse-everything mutant stay green | OPEN — round 8 |
| 4 | P3 | Brief claim 4 false: G55 is radius **2**, not 1; the "test line 959" citation is stale (real assertion at test:1055) and repeated at `gauntlet-mutants.mjs:17` | OPEN |
| 5 | P3 | Container-fixture `!important` reasoning wrong — the early refusal needs BOTH inline and importantConflict (`src:1013`) | OPEN |
| 6 | P3 | Container harm message names an impossible independent reading (`src:1065` precondition) | OPEN |
| 7 | P3 | Round 6's method claim too strong — a static consistency check beats hand-grading, and `test:448` already said so | OPEN |

Andrew's call, via AskUserQuestion: **"Fix both P1s, then ship."**

### P1-1 — the shadow root as a fourth rule source

Both stylesheet loops read `document`. CSSOM gives every DocumentOrShadowRoot its
OWN `styleSheets` and `adoptedStyleSheets`, so a shadow sheet appears in neither
— while `:host` matches the host element, which IS measured, because
`querySelectorAll("body *")` returns hosts and simply does not descend into them.
That is the whole defect: the element is in the measurement set and one of the
rule sources that decides its border is not in the scan set.

The fix **COUNTS rather than collects**, and that is the load-bearing decision. A
shadow selector is not evaluable from outside its tree — `el.matches(":host")`
answers false on the host — so recording the rule against an unmatchable selector
would be no record at all, and recording it as authored would be a false
recovery, which is the one direction this probe is forbidden to fail in. A
non-zero count refuses every recovery document-wide, exactly as `sheetsBlocked`
already does one rule source over.

Six edits: `declaresBorderWidth()` (recursive, and an unreadable nested import
counts as "might declare one"), the shadow scan, `let shadowBorderRules = 0`, the
`shadowBorderRules > 0` refusal gate, a dedicated caveat cause sentence, and the
internal `shadowRules` payload field.

**The gate is keyed on a border-width DECLARATION being present, not on a shadow
root existing** — a refusal that never lifts is an outage, not a refusal, and
web-component pages would otherwise lose hairline provenance entirely.

**The caveat needed its own cause sentence, and no test would have caught the
wrong one.** With only the shadow refusal live, the existing wording said the
winner "depends on specificity" — a rule this probe COLLECTED and could not rank.
A shadow rule was never collectable at all. A caller reading "specificity" would
go looking for a conflict that is not on the page. Both sentences appear when
both causes are live.

### P1-2 — an unknown conditional group collected as authored

`@supports`, `@container`, `@media` and `@layer` were discriminated by type and
**everything else fell through to the plain recursion with `unevaluable`
unchanged**. The comment called that "a false ambiguity … in the honest
direction"; it was exactly backwards. The fix inverts the default via an
`isNesting`/`isMedia`/`isLayer` whitelist — an at-rule group off the list
degrades to unresolved. `!!rule.selectorText` is what separates a CSS-nesting
style rule (already collected above, applies as authored) from a real at-rule
group.

### The half-applied state — the reason G61 and G62 both exist

For part of this round the fix shipped with `shadowBorderRules` declared and
incremented and **nothing reading it**. It compiled clean and the entire repo
suite passed while the defect was completely untouched. **A counter nobody reads
is not a fix.** G61 (gate deleted) and G62 (scan never counts) are ONE RULE AT
TWO DOORS in the sharpest form this matrix has carried, because the round
actually shipped with exactly one of the two doors applied.

### Three new tests — 51 → 54

1. `hairlines: a shadow root that declares a border width stops every recovery` —
   `:host { border-top-width: 1px !important }` over 24 inline-`0.5px` rows.
   Asserts the `0.5px` is NOT recovered (harm message names all three readings:
   scan never ran / gate missing / fixture never attached), asserts `1px` IS
   present as a fixture precondition, and asserts the caveat carries the exact
   string `shadow root(s) declare a border width this probe cannot attribute` —
   deliberately NOT a bare "Hairline caveat" check, which would pass on the
   specificity sentence and measure nothing.
2. `hairlines: an ordinary shadow root that declares NO border width costs
   nothing` — the opposite-direction control, and G63's only guard.
3. `hairlines: an UNKNOWN conditional group is unresolved, never collected as
   authored` — `@scope (.absent)`. Asserts `0.25px` absent, `1px` present (also
   the only assertion that would report an engine dropping `@scope` entirely),
   AND `0.5px` absent — that third one is what proves the group DEMOTES rather
   than merely being skipped.

**The benign control failed on its first run and the code was right.** The
fixture declared `span { border-top-width: 0 }`, which IS a border-width
declaration, so `declaresBorderWidth` correctly returned true and the page
refused. A `0` outranks an inline width and DELETES the edge, so counting it is
correct. Fixture replaced with `letter-spacing`, and the reasoning is now a
comment beside it.

Measured: **54 tests / 54 pass / 0 fail / 0 skipped, EXIT=0**
(`agent-output/suite-r8.log`), 54 `✔` lines counted. The +3 over round 6's 51 is
exactly the three new tests.

### Matrix v13 — and an ABORT that was the harness working

First launch died at pre-flight: `ABORT: G58-container-treated-as-plain
find-string not unique`, `EXIT=1`, seconds in. `collectRules(rule.cssRules,
true)` used to occur exactly once; the P1-2 fix added a SECOND site with a
byte-identical body. **A find-string mutant dies the moment its target line is
DUPLICATED, exactly as it dies when the line is edited** — a case this repo had
not hit before, and the uniqueness check caught it rather than silently mutating
whichever site it reached first. Re-anchored on the tail of the container
comment, which no other site shares; G64 owns the other site. Relaunched, and the
pre-flight now reads `66 mutants anchor uniquely and parse`.

### Round 7 adverse pass — FANNED OUT (Andrew: "fan out with open weight model and 5.6 SOL")

Three legs against `SOL-BRIEF-R7.md`, all detached to files, all reading their
own `EXIT=` from inside the log:

- `codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium` → `SOL-R7.out`
- `ow-run z-ai/glm-5.2 16000 high` → `OW-GLM-R7.json`
- `ow-run moonshotai/kimi-k3 16000 high` → `OW-KIMI-R7.json`

The two open-weight legs cannot read files, so their prompt is self-contained:
the brief, the complete `src`+`test` diff, and the four new mutant definitions
inlined. Eight claims under audit, the sharpest being **claim 1** — name a FIFTH
author-origin rule source that outranks an inline width and appears in none of
`document.styleSheets` (recursed), `document.adoptedStyleSheets`,
`CSSImportRule.styleSheet.cssRules`, or a shadow root's own two collections — and
**claim 8**, which asks for another half-applied state that still compiles and
still passes.

**Nothing is committed or pushed and nothing is on npm.**

---

## Round 8 — Sol R7 verdict, and the caveat defect was WIDER than reported

### Sol R7: `SOL-EXIT=0`, 220,774 bytes — **DOES NOT SURVIVE (2 P1, 2 P2)**

Sol reported honestly that `mutants-v13.log` "remained in flight and had reached
only G6 when inspected; G61–G64 and both controls were unmeasured. No browser
suite was rerun. No files were changed by this audit." An adverse pass that says
what it did NOT measure is worth more than one that implies it measured
everything.

| # | Pri | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | P1 | **Closed shadow roots are unscanned.** `host.shadowRoot` is null BY DEFINITION for `{mode:"closed"}`, so a closed `:host { border-top-width:1px !important }` beats an inline `0.5px` with nothing to count — a CONFIDENT 0.5px for an edge painted at 1px. | CONFIRMED by reading → **FIXED** |
| 2 | P1 | **Shadow `adoptedStyleSheets` can regress with no test failing.** Both collections are scanned but `SHADOW_ROWS` delivered CSS only through an inline `<style>`. "Another compile-and-pass half-state." | CONFIRMED by reading → **FIXED** |
| 3 | P2 | **`declaresBorderWidth` counts rules that cannot affect any measured element.** A `.internal { border:1px }` inside a shadow sheet styles a node that is never in `querySelectorAll("body *")`, yet it disables recovery document-wide. The benign control has NO border declaration at all, so it misses this false-refusal case entirely. | **OPEN** — the outage direction |
| 4 | P2 | **The new caveat still falsely reports a specificity conflict.** Every shadow refusal increments the generic `subPixelAmbiguous`, which unconditionally emits the "winner depends on specificity" sentence. | CONFIRMED, found **WIDER** → **FIXED** |

### The discovery: P2-4 is wrong SEVEN ways, not one

Sol named the shadow cause. Reading `authoredSubPixel` end-to-end found it
returns `"unresolved"` from **EIGHT** distinct causes:

1. `sheetsBlocked > 0` (document-wide gate)
2. `shadowBorderRules > 0` (document-wide gate)
3. `ruleOverflow` (document-wide gate)
4. `animatedSide(el, side)` — per-element, and it has **NO cause sentence of its own**
5. an unreadable inline expression (`pxLength` → `"unresolved"`)
6. `inline && importantConflict`
7. an `unresolvedRules` entry matches
8. `new Set(matched).size > 1` ← **the ONLY genuine specificity conflict**

**A caveat sentence that names a MECHANISM is a claim about that mechanism.**
Narrating the total as "the winner depends on specificity" told a caller with a
shadow root, a blocked sheet or an animated border to go hunting for a rule
collision that is not on their page. Wrong seven ways out of eight.

Also noted and deliberately NOT changed: at `src:1177` the clause
`authored === "unresolved" || sheetsBlocked > 0` has a **dead second disjunct** —
`sheetsBlocked > 0` already forced `"unresolved"` at the first gate, so
`typeof authored === "number"` is impossible there. Harmless.

### Six edits to `src/design-gauntlet.ts`

1. **Closed-root capture** — an `addInitScript` wrapper on `Element.prototype.attachShadow`
   stashing every `{mode:"closed"}` root into a non-enumerable, non-writable
   `window.__ravenClosedShadowRoots`. The root object is only ever reachable at
   the moment it is created. Running as an init script is what makes the wrapper
   win: it installs before any page script. Stated in the comment rather than
   defended against: **this is a CORRECTNESS mechanism against ordinary pages,
   NOT a security boundary** — a page that deletes the stash afterwards is back
   to the silent false recovery, the same unclosable pre-injection class this
   repo already documents for the Grab overlay.
2. **The shadow scan reads both root kinds**, re-checking `measured.has(root.host)`
   rather than assuming it — a stash entry whose host is not measured (detached,
   or outside `body *`) cannot change any border this tally reports, and counting
   it would be a page-wide refusal bought for nothing.
3. **New `subPixelConflict` counter**, declared with the eight-cause enumeration
   above as its comment.
4. **Incremented at the ONE site that is a genuine conflict** (`new Set(matched).size > 1`).
5. **Returned in the payload** alongside `subPixelAmbiguous`.
6. **The caveat splits one sentence into two.** The specificity sentence now
   fires only on `subPixelConflict`; the remainder gets a sentence that states
   the refusal WITHOUT naming a mechanism it does not know. The generic sentence
   is **load-bearing, not cosmetic**: without it a fixture with
   `subPixelAmbiguous > 0`, `subPixelConflict === 0` and no document-wide cause
   emits a malformed `"Hairline caveat: . A 1px entry..."`. The now-falsified
   parenthetical `(Both sentences appear when both causes are live.)` was deleted
   from the shadow comment.

### Three new tests — 54 → **57**

`SHADOW_ROWS` gained `mode` and `adopted` as PARAMETERS rather than becoming
three near-identical helpers, because they are the two axes the probe reaches a
shadow sheet through and each is separately breakable.

1. `a CLOSED shadow root stops every recovery too` — differs from the open
   fixture by ONE WORD.
2. `a shadow ADOPTED stylesheet stops every recovery too` — every other shadow
   fixture in the file delivers CSS via `<style>`, so dropping the adopted half
   of the spread left them all green.
3. `a REAL specificity conflict is the one thing that says "specificity"` — the
   **positive control**. Three tests now assert the specificity sentence is
   ABSENT, and **an absence assertion needs a positive control or it passes
   vacuously**: deleting the sentence outright would satisfy all three. Both
   widths in its fixture are deliberately sub-pixel (`0.5px` vs `0.75px`) so the
   winner still paints at 1px and the edge reaches the recovery branch at all —
   a 2px winner computes to 2px and `authoredSubPixel` is never called.

### Measured

- `npx tsc --noEmit` → TSC=0. `npm run build` → BUILD=0, `subPixelConflict`
  appears 7× in `dist/design-gauntlet.js`.
- Gauntlet suite `suite-r9.log`: **57 tests / 57 pass / 0 fail / 0 skipped**,
  `EXIT=0`, all read from INSIDE the log. All three new tests confirmed RUN by
  name at lines 48/49/50. **The `# tests` grep returned nothing and that was the
  documented gotcha, not an absent summary** — `node --test` prefixes totals with
  `ℹ `, so the silence was re-grepped rather than accepted.
- `EXPECTED_BASELINE` in the harness bumped 54 → 57.

### Matrix v13 was KILLED deliberately, not crashed

It was at G25/66 measuring a `dist/` built from the round-7 tree, which the six
new edits superseded. **`npm run build` is `clean && tsc`, so it DELETES `dist/`
— never run it while a mutation harness is mid-run**; it would have wiped the
directory under a running mutation and corrupted both the run and its restore.
`pkill -f gauntlet-mutants.mjs` first, then rebuild. The rebuild regenerates
`dist/` wholesale, so any mutant the kill left applied is gone — verified.

### Still open

- **Sol R7 P2-3** (unreachable shadow rules cause a document-wide false refusal).
- The round-8 fixes are **unmeasured by any mutant**. A green build and a green
  suite were exactly the state the half-applied P1-1 fix produced.
- GLM 5.2 returned `finish_reason: length` with `content_len: 0` for the SECOND
  time at 40000/medium — 40,000 completion tokens spent entirely on reasoning.
  A failed run, never "no findings"; relaunched once at `low`. Kimi K3 in flight.

**Nothing is committed or pushed and nothing is on npm.**

---

## Round 8 (cont.) — closing round 8's own coverage hole

Round 8's `measured.has(root.host)` re-check shipped with **zero coverage**: every
closed-root fixture attached to a measured host, so deleting the clause left them
all green. Added a fourth test — *a DETACHED closed root is stashed but not
counted* (57 → **58**) — whose orphan host declares `1px !important`, i.e. exactly
the rule that WOULD stop every recovery if it were counted. That makes the
assertion a measurement rather than a restatement.

Six mutants added, `EXPECTED_BASELINE` 57 → 58:

- **G65/G66** — the G61/G62 shape one layer out. The closed-root fix is ONE RULE
  AT TWO DOORS: a wrapper that STASHES every closed root, and a scan that READS
  the stash. A stash nobody reads and a reader with an empty stash are
  byte-identical in every observable, both compile clean, and both pass the whole
  repo suite — the half-applied state round 8 exists to make distinguishable.
- **G67** — drops the ADOPTED half of the shadow sheet spread.
- **G68** — drops `measured.has(root.host)`. The OUTAGE direction; reddens the
  DETACHED test alone, which is why that fixture had to exist first.
- **G69/G70** — the caveat's specificity sentence, pulling in OPPOSITE directions
  on one mechanism. G69 reverts the sentence to the total (the shipped defect) and
  reddens the three ABSENCE assertions; G70 stops the counter incrementing so the
  sentence never fires, and reddens the POSITIVE CONTROL alone. **Without G70 the
  three absence assertions would pass vacuously under a mutant deleting the
  sentence outright — an absence assertion needs a positive control or it measures
  nothing.**

**G41 had to be RE-ANCHORED.** The `subPixelConflict++` insertion rewrote the exact
two lines it was pinned to, and matrix v14 aborted at pre-flight in *seconds*
rather than mis-measuring an hour in. Re-anchored onto the braced form, deliberately
KEEPING the increment so it stays a mutation of the conflict RULE, not of the
counter G70 owns. v14 relaunched: **pre-flight 72/72 anchor uniquely and parse,
baseline tests=58 pass=58 fail=0 skipped=0 status=0.**

## Round 9 setup — the open-weight fan-out earned its keep

`ow-run moonshotai/kimi-k3 40000 medium` returned a **real** run —
`finish_reason: stop`, 30,436 completion tokens, 12,689 bytes, $0.47, 877s —
**VERDICT: DOES NOT SURVIVE, P1 ×3.** It independently re-found the closed-shadow-root
P1 (already fixed in round 8) and named **two P1s Sol R7 never did**. Both were
settled by MEASUREMENT rather than argument, in a probe that imports nothing from
`dist/` because the matrix was rewriting it (`.claude/gauntlet-2026-08-14/agent-output/probe-r7b-*.mjs`,
a gitignored `agent-output/` destination).

### CONFIRMED P1 — logical border-width properties are invisible

`border-inline-start-width: 1px !important` measures as
`rule.style.borderLeftWidth === ""`, and the declaration block enumerates
**only** `border-inline-start-width`, while the engine PAINTS `left: 1px`. The
`SIDES` predicate reads the physical longhand at BOTH sites — `declaresBorderWidth`
(`src:868`, the shadow gate) and `collectRules` (`src:894`, the document-level
authored-rule collection). **Wider than Kimi framed it**: it is not only the shadow
gate. A document rule `.row { border-inline-start-width: 1px !important }` over an
inline `border-left: 0.5px` is invisible, and `0.5px` is recovered confidently for
an edge painting `1px` — the round-6 defect class exactly.

### CONFIRMED P1 — CSS nesting, and the combinator SPLITS it into two directions

Kimi's mechanism is right and **its counterexample is backwards**. Chromium
serializes every nested rule's `selectorText` with an `&` prefix — `.row` and
`& .row` both come back as `& .row` — and standalone `&` behaves as `:scope`,
which in `Element.matches()` is the element itself. Nothing throws. So:

| authored | stored selectorText | `matches()` | rule applies? | painted | probe hands back |
|---|---|---|---|---|---|
| `.card { .row { 1px !important } }` | `& .row` | **false** | **YES** | `1px` | inline `0.5px` — silent MISS |
| `.absent { &.row { 0.25px !important } }` | `&.row` | **true** | **NO** | `1px` | `0.25px` — FALSE MATCH |

Kimi's descendant example is refuted (a non-applying descendant rule is correctly
ignored); the compound form reproduces its claim exactly, and the descendant form
is a *second*, opposite defect it did not name. The false-match direction is the
worse one — it recovers a width that appears **nowhere on the render**.

Both flow from one line, `const isNesting = !!rule.selectorText` (`src:964`),
recursing with `unevaluable` UNCHANGED. **The comment "its nested rules apply
exactly as authored" is the same safety claim the `@scope` fallthrough carried,
one whitelist entry over.**

### Measured REFUTATION of a Kimi P2

Kimi doubted the G61/G62/G63 find-strings matched the shipped text and said the
in-flight log was the only arbiter. It is, and it answered: v14 pre-flight reports
**72 mutants anchor uniquely and parse**. The harness aborts on a dead anchor —
it did exactly that for G41 this round — so a phantom kill was never possible.

### Round 9 queue

Three P1 fixes (logical properties at both sites; nesting split by combinator),
plus Sol R7's still-open P2-3, plus Sol R8 when it lands — folded into ONE
convergent round with tests in both directions and mutants per mechanism.

**Nothing is committed or pushed and nothing is on npm. Shipping is not on the
table while three confirmed wrong-answer P1s are open.**

---

## Round 8 adverse fan-out — all three legs RETURNED

Three independent legs ran against the round-8 tree: **Sol R8** (`gpt-5.6-sol`,
medium, detached, `SOL-EXIT=0`, 5316 lines), **GLM 5.2 R7c** (`ow-run`,
`finish_reason: stop`, `content_len: 9283` — a REAL run, not a length-truncation),
and **Kimi K3 R7b** (returned earlier this session). Two model families
independently converged on the same P1, which is the strongest signal the round
produced.

### Sol R8 — VERDICT: DOES NOT SURVIVE (3 P1 + 2 P2)

**P1-1 — declarative closed shadow roots bypass the `attachShadow` wrapper.**
The round-8 wrapper (`src:579`) intercepts JS calls to
`Element.prototype.attachShadow`. The HTML parser does not call it — it invokes
the platform's internal "attach a shadow root" algorithm. Counterexample:

```html
<div class="row" style="border-top:0.5px solid #123456">
  <template shadowrootmode="closed">
    <style>:host { border-top-width:1px !important }</style><slot></slot>
  </template>
  row
</div>
```

`host.shadowRoot` is null, the stash stays empty, the scan at `src:1033` sees
nothing, and the probe confidently recovers the inline `0.5px` over an edge that
paints `1px`. G65/G66 structurally cannot catch it — `SHADOW_ROWS`
(`test:1082`) always creates roots through the wrapped method.

**P1-2 — the four shadow tests miss the closed + adopted composition.** Fixtures
cover open+`<style>`, closed+`<style>`, open+`adoptedStyleSheets` — never
closed+`adoptedStyleSheets`. An implementation scanning both collections for open
roots but only `styleSheets` for closed roots passes every test and still returns
`0.5px`. The shared loop at `src:1054` happens to work; nothing guards it. This
is the third half-applied state the brief asked for.

**P1-3 — the planned round-9 selector filter can CREATE a false recovery.** A
selector-only allowlist must carry nesting context:

```css
:host { & { border-top-width: 1px !important; } }
```

The declaration-bearing nested rule can expose `selectorText === "&"`. Testing
that child independently for `:host` / `:host-context()` / `::slotted()` would
discard it even though the parent makes it host-reaching — converting today's
false REFUSAL into the forbidden false RECOVERY. Reachability must propagate
through nested `CSSStyleRule` ancestors, handle functional forms such as
`:is(:host)`, and fail closed on anything unclassifiable.

**P2-1 — `subPixelConflict` falsely names specificity, and the sentences say the
wrong unit.** The increment (`src:1226`) means only "two matched widths differ".
`.row { border-top: 0.5px }` + `.row { border-top: 0.75px }` is equal
specificity — **source order** decides — yet `src:691` reports "depends on
specificity". Second half: the counters are per EDGE while both new sentences say
"element(s)", so one element with conflicting top and bottom edges reports two.

**P2-2 — G69/G70's declared radii are false and the new positive control is
redundant.** G69 claims three absence assertions; only the open-shadow test has
one (`test:1131`). G70 claims the new control alone; two older tests already
require a specificity caveat (`test:688`, `test:713`). So the comment calling the
new fixture "the only fixture in the suite with a collected conflict" is FALSE,
and deleting the sentence was already guarded. Two sub-pixel widths are
unnecessary — the existing `1px` vs `0.5px` fixture already enters recovery.

**Claims that SURVIVED Sol R8:** `measured.has(root.host)` is correct against the
slotted-content attack; the generic sentence is load-bearing; `animatedSide`
lacking its own cause sentence is a diagnostic limitation, not dishonesty; and
**no `src/`→`dist/` drift exists in the round-8 constructs** (all generated
branches present; `git diff --check` zero).

### GLM 5.2 R7c — VERDICT: DOES NOT SURVIVE (1 P1 + 2 P2 + 4 P3)

- **P1-1 — `declaresBorderWidth` misses logical border-width properties.**
  Independent confirmation of Kimi's P1 from a different model family.
  Counterexample `SHADOW_ROWS(':host { border-block-start-width: 1px !important }')`.
- **P2-1 — dropping `root.adoptedStyleSheets` from the shadow scan compiles clean
  and passes the entire suite.** Same gap Sol calls the third half-applied state.
- **P2-2 — the document-wide refusal is coarser than the scan already allows.**
  The scan iterates per-host; a `Set<Element>` of offending hosts would refuse
  only those elements. 24 `.row`s + one bordered `<my-widget>` loses 23 correct
  recoveries.
- **P3-1 — `@scope` with a matching root always applies**; the whitelist is
  correct in both directions for the at-rules that exist today (GLM's own
  conclusion, honest direction).
- **P3-2 — G63's comment is wrong.** It claims no assertion in the defect
  direction can see it; the benign test's shadow-cause absence assertion DOES
  fail under G63. Mutant still caught, reasoning false.
- **P3-3 — `declaresBorderWidth` counts non-`!important` declarations.**
  `:host { border-top-width: 0 }` sets `"0px"` (truthy) and fires a document-wide
  refusal though it cannot outrank inline. Honest direction, loss for nothing.
- **P3-4 — UA/user-origin `!important` is not scanned.** Rare; the claim's
  author-origin scoping excludes a real cascade source.

## Round 9 — measurements taken BEFORE writing any fix

`probe-r9-nesting-fix.mjs` and `probe-r9-logical.mjs`, both importing `playwright`
ONLY (never `dist/`, which the matrix is rewriting).

### The nesting fix: `&` → `:is(<parent selectorText>)`, recursively

| fixture | resolved selector | painted | authored match | fixed match |
|---|---|---|---|---|
| applies | `:is(.card) .row` | 1px | false (silent miss) | **true** ✓ |
| orphan | `:is(.absent).row` | 1px | true (false match) | **false** ✓ |
| parent LIST | `:is(.a, .b) .row` | 2px | false | **true** ✓ |
| two-deep | `:is(:is(.outer) .mid) .row` | 3px | false | **true** ✓ |

`:is()` rather than a bare paste is **load-bearing**, and the parent-list arm is
what proves it: pasting `.a, .b` raw would regroup the selector.

### CSSOM enumeration — every logical authoring form expands to logical LONGHANDS

| authored | enumerated property names | `style.borderTopWidth` |
|---|---|---|
| `border-block-start: 1px solid` | `border-block-start-{width,style,color}` | `""` |
| `border-block: 1px solid` | both block `-width`/`-style`/`-color` | `""` |
| `border-inline: 1px solid` | both inline `-width`/`-style`/`-color` | `""` |
| `border-inline-start-width: 1px` | `border-inline-start-width` | `""` |
| `border-block-start-width: 1px` | `border-block-start-width` | `""` |
| `border-top-width: 1px` | `border-top-width` | `"1px"` |

**No shorthand survives unexpanded**, so the detector is a four-name set —
`border-{block,inline}-{start,end}-width` — and never needs to parse shorthands.
An INLINE logical declaration behaves identically (`el.style.borderTopWidth` is
`""`, enumeration shows `border-inline-start-width`), which is why the inline
fast path at `src:1184` is a third defect site, not just the two rule sites.

### Two guards the nesting fix cannot skip — both measured

- `el.matches(':is(main::before) .row')` returns **false and does NOT throw.**
  A pseudo-element in the parent makes the resolved selector silently
  unmatchable, which is the false-recovery direction. The guard cannot wait for
  a throw; it must detect `::` textually and refuse.
- A nested selector carrying a quoted `&` serializes as `& [title="a&b"]`. A
  naive `/&/g` replace corrupts the attribute value. Refuse on any quote.

### Sol P1-1 confirmed and its detector measured

Declarative closed root: `shadowRoot === null`, `__ravenClosedShadowRoots` empty,
inline `0.5px`, **painted `1px`** — a confident wrong recovery, exactly as Sol
described. And the main-document response body carries the attribute, so
`/shadowrootmode\s*=\s*["']?closed/i` over `(await page.goto(...)).text()` is a
working detector from outside the page. Narrowed to `closed` because
`shadowrootmode="open"` is already scannable.

### Round-9 fix roster (design decisions, not yet written)

1. **Logical properties** — three sites: `declaresBorderWidth` (`:868`) returns
   true; `collectRules` (`:894`) pushes an `unresolvedRules` entry for ALL FOUR
   sides, since no logical→physical mapping exists without writing-mode; the
   inline fast path (`:1184`) returns `"unresolved"`.
2. **Nesting** — carry `parentSelector` through `collectRules`, store the
   RESOLVED selector. Fail CLOSED on a quote in the child or `::` in the parent,
   into a new document-wide refusal counter with its own gate and cause sentence
   (following the `shadowBorderRules` pattern), because a silently dropped
   `!important` rule is the false-recovery direction.
3. **Declarative closed shadow roots** — response-body detector, page-level
   fail-closed flag. Residuals: iframes, `setHTMLUnsafe` injection.
4. **closed + adopted composition test** — test-only, guards `src:1054`.
5. **Reachability propagation** — Fix 2's `:is(parent)` resolution is the same
   mechanism that answers Sol P1-3.
6. **`subPixelConflict` naming** — stop naming specificity; fix the edge/element
   unit error in both sentences.
7. **G69/G70 radii + redundant control** — correct to Sol's static expectations,
   delete the false "only fixture" claim, drop the second sub-pixel width.

Plus GLM P3-2 (G63's comment), P3-3 (non-`!important` refusal), P2-2 and P3-4 as
stated residuals with reopen conditions, and Kimi's three suggested mutants.

**Nothing is committed or pushed and nothing is on npm.** Six confirmed
wrong-answer P1s are open across three independent adverse legs.

---

## Round 9 — product edits landed in `src/design-gauntlet.ts` (checkpoint)

`npx tsc --noEmit` **EXIT 0**. Eleven edits; the file went from half-applied and
incoherent to coherent and type-clean. Three NEW mechanisms, two CORRECTED
warning sentences. **Zero test coverage and zero mutant coverage so far** — none
of this is committed, pushed, or on npm.

### The five measurements taken BEFORE any product edit

Three of the five changed the design, which is why they were taken first.

**(1) CSSOM enumeration — every logical border form expands to logical LONGHANDS.**
So a four-NAME set suffices and no shorthand parser is needed. Measured, not assumed:

| authored | enumerated | `style.borderTopWidth` |
|---|---|---|
| `border-block-start: 1px solid` | `border-block-start-{width,style,color}` | `""` |
| `border-block: 1px solid` | both block `-width`/`-style`/`-color` | `""` |
| `border-inline: 1px solid` | both inline `-width`/`-style`/`-color` | `""` |
| `border-inline-start-width: 1px` | `border-inline-start-width` | `""` |
| `border-block-start-width: 1px` | `border-block-start-width` | `""` |
| `border-top-width: 1px` | `border-top-width` | `"1px"` |

**(2) The INLINE case is the third door.** `enumerated:
["border-inline-start-width","border-inline-start-style"]`, `borderTopWidth: ""`,
`borderInlineStartWidth: "0.5px"`, **`paintedLeft: "1px"`**. The physical read on
the element sees NOTHING, falls through to the stylesheet scan, and answers
confidently for an edge whose authored width is sitting unread on the element
itself.

**(3) A guard cannot wait for a throw.** `el.matches(':is(main::before) .row')`
returns **`false` with NO throw** — a silently unmatchable rule, which is the
false-recovery direction. Textual detection is required, so the `::` parent guard
is a string test rather than a try/catch.

**(4) A naive `/&/g` corrupts attribute values.** A nested quoted `&` serializes
as `& [title="a&b"]`, hence the quote guard.

**(5) Sol R8 P1-1 CONFIRMED, and its detector measured.** A declarative closed
shadow root gives `shadowRootIsNull: true`, `stashLen: 0`, `inline: "0.5px"`,
**`painted: "1px"`** — the confident false recovery the `attachShadow` wrapper
exists to prevent, arriving through a door the wrapper structurally cannot cover,
because the HTML parser runs the internal algorithm and never calls
`Element.prototype.attachShadow` at all. `responseCarriesAttr: true`, so the main
document's own response BYTES are the one place it is still visible.

**Nesting fix measured correct in all four arms** before it was written:

| fixture | resolved | painted | authored match | fixed match |
|---|---|---|---|---|
| applies | `:is(.card) .row` | 1px | false (silent miss) | **true** ✓ |
| orphan | `:is(.absent).row` | 1px | true (FALSE match) | **false** ✓ |
| parent LIST | `:is(.a, .b) .row` | 2px | false | **true** ✓ |
| two-deep | `:is(:is(.outer) .mid) .row` | 3px | false | **true** ✓ |

The parent-selector-LIST arm is what makes `:is()` load-bearing rather than
stylistic: a raw paste of `.a, .b` regroups the selector. `:is()` also carries the
parent's specificity the way `&` does.

### The eleven edits

1. **`parentSelector` propagation through every `collectRules` recursion site.**
   This is what made the inherited nesting fix LIVE rather than inert. `@supports`,
   `@container` and the unknown-conditional-group site all pass the parent
   through unchanged — a conditional group can itself be nested inside a style
   rule, so dropping it there makes `.card { @supports(...) { .row { … } } }` read
   as a top-level `& .row` again, which is the defect one layer in. `@media` and
   `@layer` likewise introduce no new parent. A NESTING rule becomes the parent
   for its subtree. The `@import` site deliberately passes NO parent — an
   `@import` cannot be nested inside a style rule.
2. **`isNesting && ownSelector === null` → `continue`, not recurse.** Recursing
   with a null parent makes every descendant read as top-level `&`, the
   false-match direction. Skipping costs nothing because the increment above has
   already forced the document-wide refusal.
3. **`nestingUnattributable` fully wired** — it was an assigned-only dead
   counter. Now it has its own cause sentence AND its own gate immediately after
   the `shadowBorderRules` gate. Same reasoning as the shadow sentence one rule
   source over: a nested rule whose selector could not be reconstructed may carry
   an `!important` width that wins on this edge, and there is no element it is
   safe to answer for.
4. **THE THIRD LOGICAL-PROPERTY DOOR — the inline fast path**, refusing before
   the physical `style["border"+Side+"Width"]` read. Refusing is the only honest
   answer available: mapping a logical side to a physical one needs the element's
   writing-mode and direction, and even resolved it would still have to be
   reconciled with whatever the physical longhand says.
5. **Declarative closed shadow root detection — NEW MECHANISM (Sol R8 P1-1).**
   `page.goto` now captures the response; `mainResponse.text()` is matched against
   `/shadowrootmode\s*=\s*(?:"closed"|'closed'|closed\b)/gi`. Detected from
   OUTSIDE the page because nothing inside it can see one. **Best effort by
   construction and stated as such**: a root injected later via
   `setHTMLUnsafe()`, or arriving in a subframe or a fetched fragment, is not in
   these bytes and is not caught. Presence ALONE forces the refusal, because a
   closed root's contents cannot be inspected at all — there is no way to ask
   whether it declares a width.
6. Its **gate** (document-wide) and its **cause sentence**, which gets its own
   wording for the same reason the two above do: the reason it cannot be ranked
   is that it cannot be READ, not that two collected rules collided.
7. `probeInPage` signature + call site now carry `declarativeClosedRoots`.
8. The `hairlines` object gained `nestingUnattributable` and
   `declarativeClosedShadow`.
9–11. **Sol R8 P2-1 — BOTH conflict cause sentences rewritten.** Two corrections
   live in them: (a) the counter is incremented per **EDGE**, not per element —
   `hairlineFor` runs once per side and one element can raise it four times — so
   "element(s)" named the wrong unit and a caller reconciling the number against a
   list of elements would find it did not add up; (b) it said the winner "depends
   on specificity" and the increment site asks nothing of the kind — it fires when
   two MATCHED rules declare DIFFERENT widths, which includes an equal-specificity
   pair separated only by source order and an `!important` pair separated by
   origin. Specificity is one of several tie-breaks and the probe ranks NONE of
   them. New wording: `"edge(s) matched more than one authored width and this
   probe does not rank the cascade"` and `"edge(s) render at 1px with an authored
   width this probe could not resolve"`.

### Sol R8 P1-3 — DISPOSITIONED NOT APPLICABLE

The claim was that a selector filter could CREATE a false recovery
(`:host { & { 1px !important } }` discarded). Verified by READING
`declaresBorderWidth`: the shadow path asks only WHETHER a width is declared, it
recurses into `rule.cssRules` and `rule.styleSheet`, and no selector filter was
implemented there. `resolveNested` never runs on the shadow path. Nothing can be
discarded.

### The wording change broke two assertions — caught by grep, not by a run

`test/design-gauntlet.test.mjs` still holds three references to the deleted
string:

- `:1126` — a comment
- `:1131` — `!m.warnings.some((w) => w.includes('winner depends on specificity'))`,
  a NEGATIVE assertion now **vacuously true**
- `:1204` — the positive control, which will now go **RED**

`:1131` is the dangerous one. It does not fail; it degrades silently into a
tautology — precisely the "a check whose failure mode is indistinguishable from
its success mode is not a check" class this repo documents repeatedly, arriving
through a WARNING-STRING edit rather than through a logic edit. **The general
entry to carry: changing a warning string silently converts every negative
`!includes(...)` assertion that names it into a tautology, and no run reports
it.** Editing the string back in is not enough — the negative direction has to be
proven falsifiable again by the positive control at `:1204`.

### Matrix v14 — STILL RUNNING at this checkpoint

Grades the PRE-round-9 `dist/`, so it is a record of the OLD build only. Pre-flight
and baseline GREEN (`72 mutants anchor uniquely and parse`, 58p baseline); killed
through G40, 0 survivors, 0 false-fails, **no `EXIT=` line yet**. Observed radii:
G13 r1, G14 r1, G15 r2, G16 r2, G17 r2, G18 r1, **G19 r18 (CONTROL)**, G20 r1,
G21 r1, G22 r2, G23 r1, G24 r1, G25 r1, G26 r1, G27 r1, G28 r2, G29 r1, G30 r1,
G31 r1, G32 r1, G33 r1, G34 r1, G35 r1, G38 r3, G39 r1, G40 r1.

**`npm run build` is FORBIDDEN while it runs** — it is `clean && tsc` and would
delete `dist/` under the harness. Editing `src/` alone is safe; mutants anchor on
`dist/`.

Its one repair so far: **G41's anchor died** on the `subPixelConflict++`
insertion and was re-anchored onto the braced form, keeping the increment so G41
stays a mutation of the conflict RULE and G70 owns the counter. Expect more of
the same at v15 — the round-9 edits rewrite the exact lines several mutants
anchor on, and a pre-flight abort there is the harness working, not a survivor.

### Still owed for round 9

Tests in both directions with one mutant per new mechanism: logical properties
(all three doors), nesting (four arms), declarative closed root, closed+adopted
(Sol P1-2), adoptedStyleSheets-dropped (GLM P2-1), the corrected conflict
wording. Then v15 re-run WHOLE with a fresh header replacing the stale v12 block,
radii diffed BY SET in both directions. Then the full suite. Open residuals: Sol
R8 P2-2; GLM P2-2/P3-2/P3-3/P3-4; Kimi's three suggested mutants; Sol R6's
P2-3/P3-5/P3-6/P3-7.

## Round 9, part 2 — the test-side repair, and the nine new tests

### The warning-string repair, and the general lesson it produced

Round 9 rewrote the `subPixelConflict` cause sentence (Sol R8 P2-1: it named
*specificity* for a mechanism whose increment site never asks about specificity —
an equal-specificity pair separated only by source order fires it too). Changing
that string touched **four live assertions across three tests**, and they split
into two very different failure modes:

- **Two would have gone RED** — the two `Hairline caveat` + `'winner depends on
  specificity'` conjunctions, and the positive control. Those are caught by any
  run.
- **One would have gone SILENTLY VACUOUS** — the ABSENCE assertion
  `!warnings.some(w => w.includes('winner depends on specificity'))`. A negative
  `includes` on a string no warning can ever contain **cannot fail**, and no run
  reports it.

That is this repo's own *"a check whose failure mode is indistinguishable from
its success mode is not a check"* arriving through a **string edit** rather than
a logic edit. It is recorded here because nothing mechanical catches it: the
suite stays green, the count stays 58, and the guard is gone.

Two consequences, both now written into the test file itself:

1. The absence assertion is pinned to `'does not rank the cascade'` and its
   comment names the positive control at the bottom of the shadow block as the
   only thing keeping it falsifiable — **if that control ever reddens because
   the sentence moved again, the absence assertion stopped measuring at the same
   moment.**
2. **After changing a product string, grep the CONCEPT, not the literal you
   replaced.** The first repair pass fixed only the two references already in
   hand; a follow-up `grep -n "specificity"` exposed two more live assertions
   (then at `:688` and `:713`) that pass 1 had walked straight past.

Final state: `specificity` survives in the file only in comments, prose and one
fixture `<title>`; the two live assertions on the new wording sit at **1140
(negative)** and **1213 (positive)**.

### Matrix v14 was discarded rather than read

v14 was still running when the test edits landed, and its own log proves the
contamination: **G41's printed radius names the OLD test title** (`…says
"specificity"`) while **G44's names the NEW one** (`…fires the conflict
sentence`). One run, two different suites. It was also grading a pre-round-9
`dist/`. Killed at G47 and thrown away; **v15 is the only matrix that will mean
anything**, and it must be re-run WHOLE with every anchor the round-9 edits
destroyed re-anchored first.

Killing it mid-run leaves a mutant in `dist/` — the exact hazard this ledger
already documents. `npm run build` (`clean && tsc`) replaces the file wholesale,
which is what was run next: **BUILD_EXIT=0**, and the round-9 constructs
(`declarativeClosedRoots`, `LOGICAL_WIDTHS`, `resolveNested`) are present in
`dist/design-gauntlet.js`.

### Nine tests, 58 → 67

Each fixture reuses the shape its standalone probe measured, so the test and the
probe cannot drift.

| test | mechanism | why the OBVIOUS fixture would have measured nothing |
|---|---|---|
| declarative closed root refuses | Sol R8 P1-1 | cannot use `SHADOW_ROWS` — that helper always builds roots **through** the wrapped `attachShadow`, which is precisely the path a declarative root does not take. Hand-written `<template shadowrootmode="closed">`, and served over **http**: the only detector is the main document's response bytes, and Playwright returns a **null response for `file://`**, so a `file://` version would pass on a build with no detector at all |
| …caught when it declares NOTHING | same | pins the refusal to **PRESENCE**. The first test alone stays green under a detector that somehow inspected the root and refused only on a real declaration — which is impossible for a closed root, and that impossibility is the reason presence is the rule |
| CLOSED + ADOPTED composition | Sol R8 P1-2 | the two shadow axes were covered one at a time (`closed`+`<style>`, `open`+adopted). Their composition — how a real closed component ships — was reached by neither, so the stashed-root `adoptedStyleSheets` read worked **by accident** |
| LOGICAL width in a rule | GLM R7c P1-1 | `rule.style.borderTopWidth` reads `""` for every logical form, so the rule is not seen at all: no authored width, no `!important` conflict, inline 0.5px recovered against a rule painting 1px |
| logical SHORTHAND | same | `border-block-start: 1px solid` is what a human writes and what a longhand-only detector would most likely miss. It does not, because the CSSOM expands it to logical **longhands** — which is why the detector is a four-name SET, not a shorthand parser. This fixture makes that a measurement rather than a comment |
| INLINE logical width (third door) | GLM R7c P1-1 | **the observable is the WARNING, not the tally.** Old and new both leave `1px` in the tally; the entire difference is whether the caller is told it is provisional. An assertion on the tally could not see this fix in either direction |
| nested rule APPLIES | round-9 nesting | `&` tested standalone degrades to `:scope`, so the rule is silently MISSED and the inline width is trusted against a rule that outranks it |
| nested rule ORPHAN | same | the dangerous direction: `&.row` under an absent `.absent` standalone reads as `:scope.row` and **falsely matches every row**, suppressing a recovery it has no bearing on. The applies arm grades whether a rule is FOUND; this grades whether one that should not be found is ABSENT |
| nested rule UNRESOLVABLE | round-9 guard | **a guard cannot wait for a throw.** Measured: `el.matches(':is(main::before) .row')` returns **false without throwing**, so a `try/catch` never fires and the rule is quietly discarded — the false-recovery direction. The refusal is TEXTUAL, before any selector is constructed, and the fixture is built so a silent drop and a refusal give OPPOSITE answers |

**GLM R7c P2-1 is CLOSED as already-covered, not fixed** — `test/design-gauntlet.test.mjs:1173`
(`a shadow ADOPTED stylesheet stops every recovery too`) already separates the
`styleSheets` and `adoptedStyleSheets` halves of the scan. Verified by reading
the test, not inferred.

**Still owed after this:** every one of the nine is un-mutant-proven. A test that
passes on its first run is worth nothing until a mutant proves it red — this file
has recorded a test found *detecting rather than encoding* six times now.

## Round 9 — suite verdict, a cwd-drift incident, and the tenth test

### (a) The nine round-9 tests are measured green

`.claude/gauntlet-2026-08-14/agent-output/r9-suite-1.log` — **67 tests / 67 pass / 0 fail / 0 skipped, `EXIT=0`**, the exit code read from INSIDE the log rather than from a wrapper notification.

All nine new tests were confirmed to have RUN **by name**, at log lines 55–63, not inferred from the total:

```
55 ✔ hairlines: a DECLARATIVE closed shadow root refuses every recovery
56 ✔ hairlines: a declarative closed root is caught even when it declares NOTHING
57 ✔ hairlines: a CLOSED root delivering an ADOPTED sheet stops every recovery
58 ✔ hairlines: a LOGICAL border width in a rule is unresolved, never read as absent
59 ✔ hairlines: a logical SHORTHAND is caught by the same four-name set
60 ✔ hairlines: an INLINE logical width refuses — the third door, on the element itself
61 ✔ hairlines: a NESTED rule is resolved against its parent, not tested standalone
62 ✔ hairlines: a nested rule under an ABSENT parent does not falsely match
63 ✔ hairlines: a nested rule this probe cannot resolve is unresolved, never dropped
```

Read the parts, never the total: `ℹ tests 67` alone would be satisfied by a suite that registered nine
tests and ran none of them. And the grep that gets there matters — `node --test` emits `✔`/`✖` and
`ℹ tests/pass/fail`, **not** TAP `ok`/`not ok`, so a `^ok` pattern returns nothing and a wrong pattern
returning nothing is indistinguishable from a clean run.

All ten tests remain **un-mutant-proven** at this point. A test that passes on its first run is worth
nothing until a mutant proves it red — this repo has recorded a test found *detecting rather than
encoding* six times.

### (b) A cwd-drift incident, and why it looked like deleted files

`cd .claude/gauntlet-2026-08-14 && wc -l gauntlet-mutants.mjs` moved the **persistent shell cwd**. Every
relative path after it resolved from the new directory, and the symptom was indistinguishable from
deleted files, in this order:

1. a second `cd .claude/gauntlet-2026-08-14` failed with "no such file or directory";
2. `grep dist/design-gauntlet.js` reported the file missing;
3. `ls dist` failed — at which point I momentarily concluded **`dist/` had been deleted**;
4. I checked `ps` for a stray harness mid-restore (none);
5. I then ran `npm run build` **from the wrong directory**, whose `clean` step is
   `rmSync('dist')` **relative to CWD** — it silently targets the wrong `dist` (or nothing) and still
   exits 0.

What cracked it was a `MODULE_NOT_FOUND` **requireStack**, which printed the actual cwd:
`/Users/accunliffe/projects/raven-mcp/.claude/gauntlet-2026-08-14/[eval]`. Recovered with an absolute
`cd` + `pwd` + `ls dist/design-gauntlet.js`; root `dist/` was **intact**, 16 round-9 construct hits, no
damage.

Three lessons, in the order they bite:

- **A `cd` inside a compound Bash command persists across tool calls.** Use absolute paths.
- **A missing-file error is not evidence of a missing file** — it is evidence about a path, and a path
  has two halves.
- **`npm run build` is destructive and cwd-relative.** Running it to "recover" from a suspected
  deletion is the one move that could have caused one.

### (c) The `::` guard's reachability was MEASURED, and it produced a test rather than a comment

I was about to write a mutant against the textual `if (parent.indexOf("::") !== -1) return null;` clause
in `resolveNested`, on the assumption it was load-bearing. Measuring first
(`.claude/gauntlet-2026-08-14/agent-output/probe-r9-guard-reach.mjs`) showed it is not, on Chromium:

```
:is(.card::before) .row   supports:false  matches:false
:is(main::before) .row    supports:false  matches:false
:is(.card::after).row     supports:false  matches:false
:is(.card) .row           supports:true   matches:true     ← control
```

`selectorParses` has **two paths and they disagree**. The primary asks
`CSS.supports('selector(<sel>)')`, which measures **false** — so the selector is rejected one line later
whether or not the textual guard exists, and a mutant on that clause would have **SURVIVED**. The
fallback, for an engine with no `CSS.supports`, returns true whenever `matches()` does not **throw** —
and `matches(':is(.card::before) .row')` returns **false without throwing**. On that path the clause is
the only thing standing between an unmatchable selector and a silently discarded rule, i.e. the
false-recovery direction.

The honest options were to document the clause as unreachable, or to make it reachable. **A claim that a
clause cannot be tested is itself a claim, and it is falsifiable by writing the test.** So test 10 —
`hairlines: the pseudo-element refusal holds on an engine with no CSS.supports` — simulates that engine
with `<script>delete CSS.supports;</script>` as the document's own first script, which runs before the
probe evaluates anything. Suite is now **68**; test 10 is un-run as of this entry.

### (d) The round-9 mutant plan, G71–G79

Nine mutants written into `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs`, `EXPECTED_BASELINE`
raised 58 → **68**. All nine find-strings verified present-and-unique in `dist/design-gauntlet.js`
before the matrix was launched — presence and uniqueness are answerable without launching anything.

| id | mechanism | predicted red set |
|---|---|---|
| G71-declarative-closed-undetected | blinds the response-body detector | both declarative tests |
| G72-declarative-gate-deleted | opens the gate the detector feeds | both declarative tests |
| G73-logical-rule-unscanned | the logical rule-scan door | logical-rule + logical-shorthand |
| G74-logical-set-block-only | narrows `LOGICAL_WIDTHS` to the block pair | inline-logical ONLY |
| G75-inline-logical-door-deleted | the third door, on the element itself | inline/third-door ONLY |
| G76-nested-rule-tested-standalone | the shipped defect: test nested rules standalone | nested-APPLIES + nested-ORPHAN |
| G77-nesting-drop-instead-of-refuse | stops the unattributable counter | unresolvable-nesting |
| G78-nesting-gate-deleted | opens the gate that counter feeds | unresolvable-nesting |
| G79-pseudo-parent-refusal-deleted | the textual `::` refusal | **test 10 ONLY** |

Two shapes are worth naming because both are easy to misread as coverage.

**G71/G72, G77/G78 are TWO DOORS ON ONE MECHANISM, not two guards.** A detector and the gate it feeds
redden the same set by construction. Reporting that as two independent guards is the radius error this
ledger keeps recording: a radius is a fact about ONE mechanism, never evidence of N guards.

**There is deliberately NO unique mutant for the CLOSED+ADOPTED composition test.** G66
(`closed-stash-never-read`) and G67 (`shadow-adopted-sheets-dropped`) each widen by 1 and nothing
reddens the composition alone, because the path is SHARED — which is precisely Sol R8 P1-2's point that
the composition worked by accident. That is stated rather than papered over with an invented mutant.

**G74 is the only thing that measures the SET's width.** Deleting the door (G73/G75) is a plausible
mutant; halving the name list is the plausible *half-measure*, and only the inline fixture can see it.

### (e) Three anchors died on the round-9 source edits, and the pre-flight found all three at once

The first v15 launch aborted in under three minutes:

```
ABORT: G42-unresolved-width-dropped find-string not present
EXIT=1
```

**The background task-notification for that run reported "exit code 0".** A notification describes the
WRAPPER, not the harness verdict — the log's own `EXIT=` line is the only thing that says what the
harness decided. This ledger has recorded that exact divergence before; it recurred here and was
disregarded in favour of reading the log.

The abort is the uniqueness check working, and it is also the harness failing LATE in one respect: it
stops at the FIRST dead anchor, so a matrix with three of them costs three launches to discover. Rather
than relaunch blind, every find-string in the file was checked against its target in one pass —
presence and uniqueness are answerable without launching anything. **Three were dead, not one:**

| mutant | why it died |
|---|---|
| G42-unresolved-width-dropped | round 9 replaced `rule.selectorText` with the nesting-resolved `ownSelector` on both unresolved pushes |
| G58-container-treated-as-plain | `collectRules` gained a third parameter, the parent selector that travels down a nesting chain |
| G69-specificity-sentence-on-the-total | the sentence it edits was itself rewritten by the round-8 P2 fix — it no longer claims the winner "depends on specificity" |

All three are **third-, second- and second-time re-cuts** respectively, and the reason is always the
same: a find-string mutant dies the moment its target line is edited. G42's re-cut keeps the `else if`
line in the find, because the bare `unresolvedRules.push({ selector: ownSelector, … })` now appears
twice — the logical-width arm added in round 9 is the sibling. G58's two comment lines are load-bearing
in its find for the same reason: `collectRules(rule.cssRules, true, parentSelector)` appears twice.

G69 keeps its id for continuity and its comment now says to read it as *"the conflict sentence counts
the TOTAL"*, which is the defect it has always described. The `otherAmbiguous` subtraction below the
mutated lines is deliberately left untouched, so the mutant double-counts exactly as it did before.

Re-checked after the re-cuts: **81 mutants, 0 dead, 0 duplicate.** A duplicate would be worse than a
dead one — it applies in a place nobody chose.

### (f) The matrix-v15 timeout-kill incident — a wrapper timeout on a long background run

Matrix v15 was launched `run_in_background` with `timeout: 600000` (10 minutes) on the Bash
call. The matrix needs ~95 minutes (81 mutants against a 68-test suite). **A background Bash
call carrying a timeout is KILLED and RESTARTED at that timeout**, and because the launch
redirects with `>`, each relaunch TRUNCATED the log — so every restart was byte-for-byte
indistinguishable from a slow first run.

**How it was caught, and why the log could not catch it.** The log sat at one line
(`pre-flight: 81 mutants anchor uniquely and parse`) for 30+ minutes. That is not, on its own,
evidence of anything — a harness that buffers would look identical. Two measurements separated
them:

- `mutants-v12.log` prints `pre-flight:` → `baseline:` → **one line per mutant**, each carrying
  failing test NAMES. So this harness DOES print incrementally, and a 1-line log after 30
  minutes is a defect rather than buffering.
- `ps -o pid,etime` on the matrix process reported an age of **59 seconds**. The log's own
  `stat` mtime agreed. **Elapsed process age is what named the fault; log content never could.**

**The lesson to carry: never pass a `timeout` to a `run_in_background` Bash call for a long
run.** The wrapper kills and relaunches at that bound, and a `>` redirect erases the evidence on
every relaunch. Background a long run with no timeout and poll by reading the log, confirming the
worker's age with `ps` rather than trusting a quiet file.

**Second-order consequence, handled rather than assumed away.** The run was finally killed by
hand (`kill 24827`, then `pkill` on the suite, confirmed 0 remaining). This harness writes a
mutant into `dist/` and restores it in a `finally` — a SIGTERM mid-mutant can leave a mutated
`dist/` behind, which this repo has recorded happening before (the round-3 forget harness, whose
next run backed up an already-mutated file and reported the same extra test red for every
mutant). So `dist/` was NOT trusted after the kill: `npm run build` (`clean && tsc`, i.e.
`rmSync('dist')` then a full compile) was re-run to exit 0 before the relaunch, which makes
`dist/` provably a function of `src/` rather than of whatever the killed process left behind.

## Round 9 checkpoint, items (g)–(u) — written 2026-08-17, two compactions late

The log stood at round-9 item (f) through two compactions. Everything below was carried in
context rather than on disk, which is exactly the failure this file exists to prevent.

**(g) npm is at 2.4.1, not 2.4.0.** CLAUDE.md's ground-truth block says 2.4.0 and is stale.
Measured: `npm view raven-mcp version time.modified` → `2.4.1`, `2026-08-13T04:57:51.750Z`.
Local `package.json` is also 2.4.1 — repo and npm agree on the version STRING while differing
wildly in CONTENT. `npm pack raven-mcp@2.4.1` → 228 files, **zero** matching `gauntlet`.
A version string is not a content claim; pull the tarball. `release.sh minor` cuts 2.4.1 → 2.5.0.

**(i) A per-mutant CHILD process reads exactly like a harness restart.** A loose
`pgrep -f "node .claude/gauntlet"` matches BOTH the harness and the `node --test` child it spawns
per mutant, so `tail -1` surfaced a 05:28-old child against a 13:28-old harness and read as a
restart. Discriminator: the PARENT pid's age plus a log that never resets to one line —
`ps -eo pid,ppid,etime,command | grep gauntlet`, read the ppid column.

**(k) Nothing needed committing at the "just commit it" moment** — the auto-save hook had already
landed it as `b91224d`, `git status --short` was empty, ahead-count 11.

**(l) Matrix v15 finished with TWO SURVIVORS and EXIT=1** — the first non-clean matrix in this
feature's history. 81 mutants pre-flighted, 79 graded, 2 survived, 0 controls false-failed.

**(n) cwd drift bit again.** A `cd .claude/gauntlet-2026-08-14` persisted into the next Bash call;
`grep test/design-gauntlet.test.mjs` returned `ugrep: warning: … No such file or directory`, which
is INDISTINGUISHABLE from "the fixture does not exist" — and believing that reading would have
produced exactly the wrong diagnosis below. Prefix every call with the absolute cd.

### (o)–(s) Both survivors diagnosed — NEITHER is a product defect

The natural reading of a survivor is "the test is missing." Both tests EXISTED. Pre-flight had
already proven both find-strings anchor uniquely, so both guards are present and correct in shipped
source. What was absent was DETECTION. **A test that exists is not a test that measures** — eighth
recorded instance in this repo, and the first where the harness's own comment stated a prediction
the run falsified.

**(p) G64's masking mechanism, read out of `dist/design-gauntlet.js:1404–1444`.** Line 1405 is
`if (inline && importantConflict) return "unresolved";`. With the border authored INLINE, the mutant
collects the `@scope` rule as authored; it carries `!important` and it matches, so `importantConflict`
goes true and the function returns `"unresolved"` at 1405 — **the same string** the correct path
returns thirty lines down from the `unresolvedRules` loop. Two mechanisms, ONE observable; all four
assertions passed in both arms. Direction of harm is FALSE RECOVERY, the dangerous one: a 0.25px
`!important` width inside a `@scope` that never applies would be handed back as a confident recovery
for an edge that renders at 1px.
Fix: author the border in the stylesheet (`HAIRLINE_ROWS(() => '')`) so the mutant falls past the
short-circuit into `matched[]`, finds TWO widths, and increments `subPixelConflict` — the one
observable the correct path cannot produce, because it returns from `unresolvedRules` first. A fifth
assertion pins the caveat wording `"matched more than one authored width"` (dist:627).

**(q) G68's masking mechanism, MEASURED not reasoned.** New probe
`agent-output/probe-detached-sheet.mjs` returned
`{"detached_styleSheets_len":0,"detached_rule_count":0,"detached_adopted_len":1,`
`"detached_adopted_rules":1,"attached_styleSheets_len":1,"attached_rule_count":1}` —
a DETACHED shadow root's `innerHTML` `<style>` yields **ZERO** stylesheets, so `declaresBorderWidth`
had nothing to find and the `measured.has(root.host)` re-check was never reached with anything to
see. `adoptedStyleSheets` DOES populate on a detached root; that is the lever. Direction of harm is
OVER-REFUSAL (the safe direction) — but the harness comment read **"Reddens the DETACHED test
alone"**, a written prediction that sat green for three rounds. *A written prediction is a claim and
decays exactly like a test, except nothing executes it.*

**(r)/(s) Verification, in order.** Baseline on both rewritten fixtures 2/2/0/**0 skipped** (the
0-skip reading is load-bearing — a skipped browser test is indistinguishable from a pass in a summary
line). G68 applied by perl to `dist/`, anchor count verified 1 → DETACHED test red. Rebuild. G64
applied, anchor count 1 → UNKNOWN-group test red **on the declared assertion, by name**, message
printed verbatim. Rebuild; both anchors verified restored. Full gauntlet suite
**68 tests / 68 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo, EXIT=0**, read from INSIDE
`agent-output/r10-suite.log`; `grep -c "^✖"` = 0. No collateral.

Neither was declared an "expected survivor." Both were constructible, so declaring them expected
would have been exactly the falsehood this ledger keeps recording — unlike the genuine unreachable
cases here (`isIpLiteral`, the local-cap TOCTOU race).

**(h) GLM R7c P3 dispositions.** P3-2 CONFIRMED and FIXED — G63's comment claimed no assertion could
see it; in fact the benign fixture's second assertion also goes red once `shadowBorderRules > 0`, so
G63 kills TWO. Mutant was always killed; only the reasoning was wrong. P3-3 REFUTED as to the gate,
CONFIRMED as to its comment, STILL UNAPPLIED — a non-`!important` `:host` rule cannot outrank an
inline declaration, so the written justification is too narrow, but the gate's real reach is WIDER
(`:host { border-top-width: 0.5px }` with nothing declared in the document decides that edge
outright → false-recovery). Gate stays; comment gets the real reason. P3-4 ACCEPTED as a stated
residual, STILL UNAPPLIED and deliberately deferred — `document.styleSheets` is author-origin only,
so a user/UA `* { border-top-width: 1px !important }` is unreadable from inside the page; naming it
changes a user-visible caveat string, which can move text/count assertions and wants its own matrix.

**(t) COMMITTED as `a1a2384` "Make two hairline guards falsifiable"** — 2 files, +59/-9.
`main` ahead of `origin/main` by **12**. Nothing pushed, nothing on npm.

**(u) THE WHOLE-MATRIX RE-RUN IS OWED AND COLLIDES WITH THE RELEASE.** Standing rule: re-run WHOLE,
never extend (~95 min). `release.sh` opens with `npm run build` = `rmSync('dist') && tsc`, so a live
matrix and a release destroy each other. Deliberately NOT launched — Andrew is poised to fire the
release, and the order is his call. Release-first is cleaner: `release.sh` leaves `dist/` freshly
built from `src/`, which is the baseline the matrix wants.

**Still owed before any completion claim:** whole-matrix v16 with the entire radius roster
re-derived BY SET in both directions (already read: G19=18 — matching the v6 prediction exactly,
since browser fixtures sit outside the rhythm comparison set — G23/24/25/26/27=1, G57/58/59/60=1,
G73=2, G74=1, G75=1, G76=4, G77=2, G78=2, G79=1); full repo suite with the 3 skips read
INDIVIDUALLY; GLM P3-3 and P3-4; done-gate; Sol falsification pass (launched, `sol-r10.txt`).
Deliberately NO unique mutant for the CLOSED+ADOPTED composition test — G66 and G67 each widen by 1
and the path is SHARED, which is precisely Sol R8 P1-2's point that it worked by accident. State
that in the v16 header; do not invent a fake mutant.

---

## Release v2.5.0 — shipped and verified across all four surfaces (2026-08-17)

**(z1) COMMITTED `fba1d4e`** — GLM R7c P3-3 comment correction to `src/design-gauntlet.ts` +
session log. 2 files / 115 insertions. `test/no-private-paths.test.mjs` green (4/4) against the
STAGED INDEX before commit (that gate scans the index, not the worktree).

**(z2) v16 MATRIX LAUNCHED, THEN KILLED AT G2 OF 81** by operator decision, to free `dist/` for
`release.sh` (which opens with `rmSync('dist')` then `tsc`). Log renamed
`mutants-v16-ABORTED-not-a-measurement.log` with an appended footer explaining why.
**No `EXIT=` line — it is not a measurement and must never be read as one.** Two facts DID survive
the abort and are worth keeping: `pre-flight: 81 mutants anchor uniquely and parse` (so no
find-string went stale on the post-fix tree, including the rewritten G64/G68 fixtures) and
`baseline: tests=68 pass=68 fail=0 skipped=0 status=0`. **Neither speaks to Sol R10 P1.**

**A background watcher reporting "completed (exit code 0)" fired on MY KILL, not on the job.**
Read the log, never the notification — a task-notification describes the WRAPPER.

**(z3) Andrew ran `scripts/release.sh minor`** → commit `cebe332` "Release v2.5.0", tag `v2.5.0`
published to origin, `main` 0/0 with origin.

**(z4) FOUR-SURFACE VERDICT — 4/4 GREEN, each MEASURED against the live artifact.**

| # | Surface | Evidence |
|---|---------|----------|
| 1 | npm | `raven-mcp@2.5.0`, **231 files** (228 at 2.4.1), ships `dist/design-gauntlet.{js,js.map,d.ts}`. Installed FRESH into a clean dir and BOOTED: **111 stdio tools, `design_gauntlet` present**; `remote:true` build **56 tools, absent**; gated set 67 entries incl. it. |
| 2 | MCP Registry | `ai.ravenmcp/raven-mcp` @ **2.5.0** — the surface that silently failed on BOTH v2.2.9 and v2.3.0 via registry-JWT expiry. The `release.sh` mint-at-point-of-use fix held. |
| 3 | git tag | `v2.5.0` on **remote** at `cebe332566d2cef…` = HEAD. A local tag proves nothing; `git ls-remote --tags` is the surface. |
| 4 | apex `.mcpb` | Initially **STALE at 2.4.1 / 0 gauntlet** (5,366,365 B vs local 5,398,070 B). Andrew ran `cd web && vercel deploy --prod`. Re-measured: `https://ravenmcp.ai/raven.mcpb` sha256 `9cfe9b74080c7bbe6d256df64ede9b4beceebd2c3c97a4ec8ad8d15a8d8f320f`, **byte-identical to local**, and the manifest read OUT OF THE DOWNLOADED BYTES says version 2.5.0 / 111 tools / `design_gauntlet` present. |

**(z5) THE FROZEN ANON HASH HELD THROUGH THE `main` PUBLISH.** Deployment
`dpl_3rPccz3T1nHuGb2fxeqXVjKYz98b` (production, Ready, 43s build, aliased to `mcp.ravenmcp.ai`).
Anonymous `tools/list` = **45 tools**, sha256
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — exact match. An anonymous
`tools/call` for `design_gauntlet` returns `MCP error -32602: Tool design_gauntlet not found` —
**never registered, not merely refused**, which is the gate holding on the path that SHIPS rather
than in local source.

**Stated limit rather than a claim:** `vercel inspect` does NOT print commit metadata. Build
identity rests on three converging facts — the `site-git-main-*` alias on the deployment, its
8-minute age, and `main` 0/0 with origin at `cebe332` — not on a direct SHA read.

**(z6) THREE ENVIRONMENT LESSONS.**
- `npm pack` plus `tar xzf` gives **no `node_modules`**, so booting the extracted tree throws
  `ERR_MODULE_NOT_FOUND`. Pivoted on the FIRST occurrence (the record is 7 identical retries) to a
  real `npm install raven-mcp@2.5.0` in a fresh dir — which is also literally Andrew's stated use
  case, a different machine.
- The destructive-op guard blocks a recursive-delete-then-recreate of the same path under rule
  `rm-rf-catastrophic`. Use `mktemp -d` and persist the path to a file for later shells.
- **A KILLED MUTATION HARNESS LEAVES `dist/` IN A STATE NO TIMESTAMP CAN VOUCH FOR.** Post-release,
  `dist/design-gauntlet.js` measured 89,230 B at one check and 89,428 B at the next with an
  UNCHANGED mtime of 19:02 (release.sh's build). Both readings cannot be right, and the mtime
  reasoning was the flawed half — a partial restore from the aborted v16 run does not move mtime.
  A clean `npm run build` from committed source gives **89,428**, so 89,428 is true and the earlier
  read was of leftover mutant residue. **A matrix run on a dist you cannot vouch for measures
  nothing** — rebuild before any measurement, never reason from mtime.

**(z7) v16 RELAUNCHED** on a `dist/` rebuilt from `cebe332`, overlay mirror re-confirmed
`cmp`-identical. Log → `.claude/gauntlet-2026-08-14/agent-output/mutants-v16.log` with `EXIT=`
appended IN the file. Diff every red-name set against v15 **BY SET in both directions** — v15 was
79 graded / 2 survived (G64, G68) / 2 controls green.

**Still owed before any completion claim on the GAUNTLET work** (the RELEASE itself is verified and
closed): v16 read and diffed by set; the v16 header written from the measured roster, replacing the
stale v12 block (60 mutants, 51p baseline) and stating that there is deliberately NO unique mutant
for the CLOSED+ADOPTED composition (G66/G67 each widen by 1, the path is SHARED — Sol R8 P1-2's
point that it worked by accident) plus the G63 radius-counts-TESTS-not-assertions note; GLM P3-4;
full repo suite with the 3 skips read INDIVIDUALLY; done-gate; a Sol falsification pass.

**Flagged to Andrew:** `9ec2560` ("Remove homepage tool ordinals") was deliberately left OFF this
release — it conflicts with `origin/main`'s gradient commits `b342d0a`/`d13f00e` and is preserved
on `feat/gauntlet-hairline-provenance`.
