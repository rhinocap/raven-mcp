# /loop — release readiness (prepare, then ask)

A self-paced watcher that detects unreleased shippable work in raven-mcp and **prepares the release up to the publish gate, then stops for Andrew's one-word go**. It never publishes to npm unattended — by design (npm publish is irreversible, and this account's passkey/WebAuthn 2FA can't be automated without an `~/.npmrc` automation token).

Run it as:

```
/loop <paste the prompt block below>
```

(No interval → self-paced. Because "prepare then ask" needs Andrew present to approve the publish, fire it on-demand when you're around — or `/schedule` it daily if you want the *prepare + notify* to run durably and ping you to publish later.)

Pairs with the `marketing-site-sync` loop (which syncs `site/` after a version ships) and the release skill at `.claude/skills/release/` (the canonical runbook this loop automates the front half of).

---

## The prompt

```
Detect unreleased shippable work in raven-mcp and PREPARE a release up to — but NOT
including — npm publish. Then STOP and ask Andrew for the one-word go. NEVER run
`npm publish` / `scripts/release.sh` (non-dry-run) without his explicit go in the
current message. This is the front half of the release skill (.claude/skills/release/);
read that skill for the canonical steps.

PRE-FLIGHT (always):
- Parallel-instance collision check: `git fetch origin`; inspect `git log --oneline -5
  origin/main` and `git for-each-ref --sort=-committerdate refs/remotes/origin | head`.
  If another instance already released the pending work (npm version moved, a Release commit
  / tag landed on origin/main), STOP — reconcile to what's there, don't double-release.
- `npm whoami` — if it returns E401, the ~/.npmrc token is expired: note it in the ask (the
  publish step will need `! npm login` first). Do NOT block the PREPARE phase on it.

DETECT shippable work:
1. Parked branches ahead of origin/main: for each local `feat/*` / `fix/*` branch,
   `git log --oneline origin/main..<branch>` — non-empty = unreleased work.
2. CHANGELOG.md: any content under `## [Unreleased]` (on main or on the parked branches)
   not yet in a dated `## [X.Y.Z]` section.
If NOTHING is pending: write nothing, log "nothing to release — <date>", exit 0.

DECIDE the bump (SemVer): MAJOR for any breaking change; MINOR if any new tool or new
param/capability (a `feat:` commit, e.g. a new `server.tool(...)`); else PATCH (only `fix:`
/ docs). State your reasoning. Preview the exact version with `DRY_RUN=1 scripts/release.sh
<bump>` and confirm it matches what you'll write in the CHANGELOG header.

PREPARE (local only — no publish, no tag, no push of a Release commit):
- From a clean tree, on `main` (verify local main == origin/main first; fast-forward if
  behind and safe). Merge each parked branch into main. Resolve CHANGELOG.md by COMBINING
  every parked branch's `## [Unreleased]` bullets into ONE dated `## [X.Y.Z] - YYYY-MM-DD`
  section (preserve Added/Changed/Fixed subheads, dedupe), leaving a fresh empty
  `## [Unreleased]` above it. Keep the public-artifact voice (routine product changes; NEVER
  mention IP / employer / client / license cleanup).
- `npm run build` clean AND `npm test` fully green. If red, STOP and report — do not prepare
  a broken release.
- Stage (but the release script will own the actual bump/tag/push on go): leave the merged
  main with the dated CHANGELOG committed locally. Do the site mirror (site/changelog.html
  new <article class="release">) now per release skill Step 1b, OR defer it to the
  marketing-site-sync loop post-publish — note which.

ASK (the gate — end the turn here):
Present a concise readiness report and ask for the one-word go:
- version (X.Y.Z) + bump rationale, the branches folded in, the combined CHANGELOG section,
  `npm run build`/`npm test` result, the `DRY_RUN=1` confirmation, and the `npm whoami` state
  (note if `! npm login` will be needed).
- Then ask Andrew to confirm publish. Do NOT proceed to publish in the same turn.

ON GO (only when Andrew says go/yes/ship/publish in a later message):
- Run the release skill end-to-end: `scripts/release.sh <bump>` (handle the EOTP/passkey
  recovery flow if it stops at publish — see release skill Step 3a; never re-run release.sh
  after a half-done bump), verify `npm view raven-mcp version`, then propagate (pull,
  `npm run build`) and invoke the `marketing-site-sync` loop to sync ravenmcp.ai. Delete the
  merged parked branches. Report the npm URL + live changelog URL as verification.

GUARDRAILS:
- NEVER publish/tag/push a release without Andrew's explicit go in the current message.
- NEVER push without `npm test` green. Collision-check before any commit/branch/push.
- One release prepared per run. Report the staged release (or "nothing to release").
```
