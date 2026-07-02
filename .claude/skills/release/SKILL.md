---
name: release
preamble-tier: 2
version: 1.0.0
description: Cut a raven-mcp release — preflight (npm auth, clean main), CHANGELOG, version bump, .mcpb rebuild, npm publish, tag/push, and propagate to local instances. (applies to raven-mcp)
triggers:
  - cut a raven release
  - release raven-mcp
  - ship raven through npm
  - publish raven to npm
  - bump raven version
  - new raven-mcp release
  - ship the new raven tools
allowed-tools:
  - Bash
  - Read
  - Edit
---

# Release raven-mcp

The end-to-end release runbook for `raven-mcp`. `scripts/release.sh` does the mechanical work (version bump, manifest/server sync, `.mcpb` rebuild, `npm publish`, commit, tag, push) — but it has two gaps and one propagation step it does **not** handle, which is why releasing felt hard. This skill wraps it so a release is one predictable pass.

## When to use

Any time merged work on `main` needs to reach Raven consumers — npm (`raven-mcp`), the public `.mcpb` at ravenmcp.ai, and your own machine's instances. Run AFTER the feature PR is merged to `main`, not before.

## How Raven is actually consumed (why "merge to main" is not enough)

1. **Your Claude Code (CLI) instances** load Raven from a **local path**, not npm: `~/.claude.json` registers `raven` as `node /Users/accunliffe/projects/raven-mcp/dist/index.js` (both a global `mcpServers.raven` entry and a project-scoped one). They read the **built `dist/`**, which is gitignored — so a new tool only reaches them after `npm run build` in this working copy AND the instance reconnects its MCP server (a stdio server is spawned once at session start). New sessions auto-pick-up the rebuilt dist; already-running sessions need `/mcp` → reconnect `raven` (or a session restart).
2. **npm package `raven-mcp`** (`bin: raven-mcp → dist/index.js`) — for any consumer wired via `npx raven-mcp` / a dependency. Only updates on `npm publish`.
3. **Claude Desktop extension** `local.mcpb.andrew-cunliffe.raven-mcp` — a **separate packaged copy** under `~/Library/Application Support/Claude/Claude Extensions/`. It does NOT read this working copy. It updates only when you rebuild the `.mcpb` and reinstall the extension in Claude Desktop.

So a full release = publish npm + rebuild/redeploy `.mcpb` + rebuild local `dist` + reconnect/reinstall.

## Procedure

### Step 0 — Preflight (the two things that make it fail)

```bash
cd /Users/accunliffe/projects/raven-mcp
git fetch origin
git rev-parse --abbrev-ref HEAD          # must be: main
git status --porcelain                   # must be EMPTY (release.sh refuses a dirty tree)
git log --oneline -3 origin/main         # confirm the merge you intend to ship is here
npm whoami                               # MUST print your npm user
```

- **If `npm whoami` returns `E401`** (the #1 blocker): the `_authToken` in `~/.npmrc` is expired/revoked. This is interactive and credential-bearing — **do not paste a token into the chat**. Ask Andrew to run, in the session prompt:
  ```
  ! npm login
  ```
  (or to refresh `//registry.npmjs.org/:_authToken=` in `~/.npmrc` himself). Re-run `npm whoami` until it prints the user. Do NOT run `release.sh` until auth succeeds — it bumps the version and rebuilds BEFORE `npm publish`, so an unauthenticated run leaves a half-done release (version bumped, nothing published).
- If the tree is dirty because of the CHANGELOG edit in Step 1, commit that first (Step 1 covers it).

### Step 1 — Update CHANGELOG.md (release.sh does NOT touch it)

`scripts/release.sh` never edits `CHANGELOG.md`. Do it by hand:

1. Add a bullet for every new tool/param/file under the `## [Unreleased]` section, matching the existing Keep-a-Changelog voice (one line per change, note backwards-compat, append the `(#PR)` number). Phrase as routine product changes — never reference IP / employer / license cleanup in this public artifact.
2. Decide the bump (`patch` default; `minor` for new tools/params — Raven has historically shipped new tools under patch, follow the maintainer's call). Rename `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (the version `release.sh` will produce — preview it with the dry run in Step 2), and leave a fresh empty `## [Unreleased]` above it.
3. Stage + commit the CHANGELOG to `main` so the tree is clean for `release.sh`:
   ```bash
   git add CHANGELOG.md && git commit -m "Changelog: vX.Y.Z"
   git push origin main
   ```

### Step 1b — Mirror the entry into the public changelog — MANDATORY (edit the JSON, never the HTML)

The public changelog at https://ravenmcp.ai/changelog is rendered by the **Next `web/` app** from the single source of truth **`web/data/changelog.json`**; the static `site/changelog.html` is **generated** from the same JSON by `scripts/gen-changelog-html.mjs`. Nothing in `release.sh` or Step 1 touches either. Skipping this is exactly how the site stalled at v1.6.1 while npm/`.mcpb`/`CHANGELOG.md` shipped v1.6.2–v1.10.0 (caught 2026-06-19). Hand-editing `site/changelog.html` is the v1.13.0 failure mode (caught 2026-07-01): the apex never sees it because ravenmcp.ai is served by the `web` project, not `site`.

1. Add a new release object at the **top** of `releases` in `web/data/changelog.json`, matching the existing shape: `version` (`"vX.Y.Z"`), `date` (ISO), `category` (`audits`/`knowledge`/`tooling`), `kind` (`new`/`feature`/`improvement`/`fix`), `title` (restrained, not salesy), `changes` (short human-readable bullets covering the same changes as `CHANGELOG.md`).
2. Regenerate the static page: `node scripts/gen-changelog-html.mjs` (writes `site/changelog.html` — never edit it by hand).
3. Commit both files (can ride the same `Changelog: vX.Y.Z` commit, or its own) and push to `main`.
4. **Deploy the apex** — the `web` project has NO git integration; a push alone only updates the `site` project's deployment, not ravenmcp.ai. From `web/`: `vercel deploy --prod` (the alias moves automatically).
5. **Verify the live apex URL** (cache-bust; note `.html` paths 308-redirect since the apex cutover — use `/changelog`):
   ```bash
   curl -sL "https://ravenmcp.ai/changelog?cb=$RANDOM" | grep -o 'cl-version">v[0-9.]*' | head -1   # must show vX.Y.Z
   ```

### Step 2 — Dry run

```bash
DRY_RUN=1 scripts/release.sh            # patch (default) | minor | major
```
Confirm the "would bump to X.Y.Z" matches the version you wrote into the CHANGELOG header.

### Step 3 — Release

```bash
scripts/release.sh                      # or: scripts/release.sh minor
```
This bumps `package.json`, syncs `manifest.json` + `server.json`, rebuilds `site/raven.mcpb`, `npm publish`es, commits, tags `vX.Y.Z`, and pushes (incl. tags).

**2FA gate (`EOTP`) — this account uses a passkey/WebAuthn, NOT a TOTP code:** `--otp=` does not apply. `release.sh` runs `npm publish` non-interactively, which fails `EOTP` after the script has already bumped + rebuilt. The script stops there — no commit, no tag, no push. This is a HALF-DONE release; recover with Step 3a (do NOT re-run `release.sh` — it would `npm version` again and double-bump).

### Step 3a — Recover a half-done release (publish failed at EOTP, version already bumped)

State after an `EOTP` failure: `package.json`/`manifest.json`/`server.json`/`site/raven.mcpb` are modified to the new version but uncommitted; npm still shows the OLD version; no tag exists. Finish it manually:

1. **Publish via the passkey web flow** — Andrew runs, from the repo:
   ```
   ! npm publish
   ```
   npm prints `Open this URL in your browser to authenticate: https://www.npmjs.com/auth/cli/…`. Open that URL, approve with the passkey; npm then completes the publish in the same command. (No code to type. If it times out waiting for browser auth, just run `npm publish` again and re-approve.) Confirm with `npm view raven-mcp version`.
2. **Then do the commit/tag/push `release.sh` would have done** (the bumped files are already on disk):
   ```bash
   git add package.json package-lock.json manifest.json server.json site/raven.mcpb
   git commit -m "Release vX.Y.Z"
   git tag "vX.Y.Z"
   git push origin main && git push --tags
   ```

> To avoid the interactive passkey gate on future releases, use an npm **automation token** (`//registry.npmjs.org/:_authToken=` of type "Automation", which bypasses 2FA for publish) in `~/.npmrc` — Andrew sets this himself; never paste the token into chat.

### Step 4 — Verify the publish (eyes-on the real registry)

```bash
npm view raven-mcp version              # must equal X.Y.Z
git tag --list "vX.Y.Z"                 # tag exists
git log --oneline -2 origin/main        # Release commit pushed
```
The `.mcpb` at https://ravenmcp.ai/raven.mcpb auto-deploys via Vercel from the pushed `site/raven.mcpb` — confirm the changelog page / deploy if the public bundle matters this release.

### Step 5 — Propagate to your machine's instances (the step release.sh can't do)

```bash
git -C /Users/accunliffe/projects/raven-mcp pull --ff-only   # get the Release commit
npm --prefix /Users/accunliffe/projects/raven-mcp run build  # refresh the LOCAL dist CLI instances load
```
- **Claude Code:** new sessions get the new tools automatically; tell already-running instances to `/mcp` → reconnect `raven` (or restart the session).
- **Claude Desktop (only if used):** `npm run build:mcpb`, then reinstall `site/raven.mcpb` as the extension in Claude Desktop — it will not auto-update.

## Done / gate

A release is done only when ALL hold:
1. `npm view raven-mcp version` returns the new version.
2. Tag `vX.Y.Z` is pushed and the Release commit is on `origin/main`.
3. `CHANGELOG.md` has a dated `[X.Y.Z]` section covering every shipped change.
4. `web/data/changelog.json` has the `vX.Y.Z` entry, `site/changelog.html` was regenerated from it, the `web` project was deployed (`vercel deploy --prod` from `web/`), **and the live page at https://ravenmcp.ai/changelog shows it** (Step 1b verify).
5. The local `dist/` is rebuilt (CLI instances) — and the Desktop `.mcpb` reinstalled if that surface is in use.
6. You stated the npm URL `https://www.npmjs.com/package/raven-mcp/v/X.Y.Z` as the verification link.

## Gotchas (learned 2026-06-18)

- **`npm whoami` E401 is the usual blocker** — expired `~/.npmrc` token. Interactive `npm login`, never a pasted token in chat. Pre-check it BEFORE bumping anything.
- **release.sh refuses a dirty tree and non-main branch** — commit the CHANGELOG first.
- **release.sh does not update CHANGELOG.md** — Step 1 is manual and mandatory.
- **A main merge alone changes nothing for consumers** — npm needs `publish`; the local CLI needs a `dist` rebuild + MCP reconnect; the Desktop extension needs a manual reinstall.
- **`dist/` is gitignored** — never assume a fresh clone has it; `npm run build` first.
- The release.sh commit footer currently hardcodes an older Co-Author line; that is cosmetic and does not affect the release.
