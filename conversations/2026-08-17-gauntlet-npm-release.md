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

## Blockers — all four need a genuine turn from Andrew

An `AskUserQuestion` earlier in this session returned four answers. **The system then
explicitly flagged that result as an automated background-task event, not user input.**
None of it counts. Re-ask:

1. **Ship or park the four-edge WIP** in this release.
2. **Version bump** — 2.4.1 → 2.5.0 minor was proposed, not chosen.
3. **Push `main`.** Hard gate. Pushing `main` deploys the live MCP endpoint at
   `mcp.ravenmcp.ai`, and getting to npm requires the gauntlet commits on `main`.
   Needs fresh explicit approval in the conversation.
4. **Release scope** — full four-surface runbook (npm + registry + tag + apex `.mcpb`)
   or npm only.

Plus: `npm login` and the passkey `npm publish` are Andrew-only, in a real Terminal.

## Sequence once unblocked

Integrate onto `origin/main` → full suite → `CHANGELOG.md` + `web/data/changelog.json` +
`node scripts/gen-changelog-html.mjs` → `DRY_RUN=1 scripts/release.sh` → `scripts/release.sh
minor` → Andrew publishes → `mcp-publisher publish` → tag/push → `cd web && vercel deploy
--prod` (apex `.mcpb` is stale until this; the workflow path does not print the reminder)
→ rebuild local `dist/` + `/mcp` reconnect.

Verify the anonymous 45-tool hash `f64bb18…2bb0a6` against production **before and after**
any push. `design_gauntlet` is in `REMOTE_GATED_TOOLS`, so it should not move — that is a
claim to measure, not to assume.
