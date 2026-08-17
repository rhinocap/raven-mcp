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
