# Release Marketing Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a local Raven release push, generate changelog and relevant marketing-site updates in an isolated worktree, build them, and open a Raven Grab-enabled local preview for Andrew's approval.

**Architecture:** A single Node orchestrator derives the released tag range, creates `marketing-preview/v<version>` in `/tmp`, and runs Codex against only `web/`. It validates that the agent touched no non-web files, builds the Next.js app, then serves it through the existing Raven Grab bridge. `scripts/release.sh` invokes this best-effort after a successful non-CI push; the same flow remains manually runnable from `package.json`.

**Tech Stack:** Node.js standard library, git worktrees, Codex CLI, Next.js 14, existing Raven Grab bridge.

## Global Constraints

- Never edit, merge, push, or deploy production marketing files automatically.
- `web/data/changelog.json` may be generated automatically; homepage and product-page edits remain in the preview branch until Andrew approves.
- Generated changes may touch only `web/`.
- Reuse `scripts/release.sh`, `web/data/changelog.json`, and `dist/grab-bridge.js`; add no dependency or service.
- Skip automatic preview generation in CI and when `RAVEN_SKIP_MARKETING_PREVIEW=1`.
- A preview failure must not turn an already-published release into a failed release.

---

### Task 1: Build the isolated release-marketing preview

**Files:**
- Create: `scripts/prepare-marketing-preview.mjs`
- Modify: `package.json`
- Test: `/tmp/raven-marketing-preview.test.mjs`

**Interfaces:**
- Consumes: `--version <semver>` (optional), the latest git tags, `codex`, `web/node_modules`, and `dist/grab-bridge.js`.
- Produces: `/tmp/raven-marketing-v<version>`, branch `marketing-preview/v<version>`, a built Next.js site, and Raven Grab bridge URLs for `/` and `/changelog`.

- [ ] **Step 1: Write the failing smoke test**

```js
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const output = execFileSync('node', [
  'scripts/prepare-marketing-preview.mjs',
  '--self-check',
], { encoding: 'utf8' })

assert.match(output, /self-check passed/)
```

- [ ] **Step 2: Run the smoke test and confirm it fails**

Run: `node /tmp/raven-marketing-preview.test.mjs`

Expected: FAIL because `scripts/prepare-marketing-preview.mjs` does not exist.

- [ ] **Step 3: Implement the minimum orchestrator**

Implement these direct checks in `scripts/prepare-marketing-preview.mjs`:

```js
const VERSION_RE = /^\d+\.\d+\.\d+$/
const allowedPath = (file) => file === 'web' || file.startsWith('web/')
```

The main flow must:

1. Resolve `version`, `headRef`, and `range` from `--version`, an exact `v*` tag at `HEAD`, or the current package version plus the latest tag.
2. Refuse to overwrite an existing worktree/branch so an unapproved preview cannot be lost.
3. Create `/tmp/raven-marketing-v<version>` from the release tag or `HEAD`.
4. Reuse `web/node_modules` by symlink when available.
5. Run `codex exec -m gpt-5.6-sol -c model_reasoning_effort="medium" -s workspace-write --ephemeral --ignore-user-config` with a release-diff prompt that:
   - updates or replaces the `web/data/changelog.json` entry;
   - proposes only source-supported homepage/product-page changes;
   - filters `auto-save:` and internal-only commits;
   - consults `node scripts/consult.mjs`;
   - does not commit, push, deploy, or start a server.
6. Abort before serving if any changed path is outside `web/` or if no files changed.
7. Run `npm run build` in the preview worktree's `web/`.
8. Start `next dev` on a free loopback port, wrap it with `startGrabSession`, open the bridge homepage, and print both the homepage and changelog bridge URLs.

- [ ] **Step 4: Expose the manual command**

Add:

```json
"marketing:preview": "node scripts/prepare-marketing-preview.mjs"
```

Run: `node /tmp/raven-marketing-preview.test.mjs`

Expected: `self-check passed`

### Task 2: Trigger the preview after release pushes

**Files:**
- Modify: `scripts/release.sh`
- Test: `/tmp/raven-release-hook.test.mjs`

**Interfaces:**
- Consumes: the release script's existing `NEW` version after `git push --tags`.
- Produces: a best-effort local invocation of `prepare-marketing-preview.mjs`.

- [ ] **Step 1: Write the failing hook assertion**

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('scripts/release.sh', 'utf8')
assert.match(source, /RAVEN_SKIP_MARKETING_PREVIEW/)
assert.match(source, /prepare-marketing-preview\.mjs --version "\$NEW"/)
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node /tmp/raven-release-hook.test.mjs`

Expected: FAIL because the release hook is absent.

- [ ] **Step 3: Add a non-blocking local-only hook**

Append after both pushes:

```bash
if [[ "${CI:-}" != "true" && "${RAVEN_SKIP_MARKETING_PREVIEW:-0}" != "1" ]]; then
  echo "→ Preparing approval-gated marketing preview"
  node scripts/prepare-marketing-preview.mjs --version "$NEW" ||
    echo "⚠ Release succeeded; marketing preview needs a manual rerun: npm run marketing:preview -- --version $NEW"
fi
```

- [ ] **Step 4: Verify the release dry-run remains non-mutating**

Run: `DRY_RUN=1 RAVEN_SKIP_MARKETING_PREVIEW=1 bash scripts/release.sh`

Expected: reports the next version and exits without publishing, creating a worktree, or starting a server.

### Task 3: Generate and inspect the v2.2.1 preview

**Files:**
- Generated, isolated: `/tmp/raven-marketing-v2.2.1/web/**`
- No tracked source-tree marketing files may change.

**Interfaces:**
- Consumes: current `v2.2.0..HEAD` release range.
- Produces: a local Grab-enabled marketing preview awaiting Andrew's approval.

- [ ] **Step 1: Run targeted checks**

Run:

```bash
node /tmp/raven-marketing-preview.test.mjs
node /tmp/raven-release-hook.test.mjs
node scripts/prepare-marketing-preview.mjs --self-check
```

Expected: all pass.

- [ ] **Step 2: Generate the preview**

Run: `npm run marketing:preview -- --version 2.2.1`

Expected: Codex edits only `/tmp/raven-marketing-v2.2.1/web/**`, the web build passes, and the script prints Raven Grab URLs.

- [ ] **Step 3: Verify visually and as the release maintainer**

Capture the rendered homepage and `/changelog`, inspect both at desktop and mobile widths, run `audit_taste` with `project: "raven-mcp"`, and confirm:

- the release story matches `v2.2.0..HEAD`;
- the changelog contains one `v2.2.1` entry;
- homepage/product edits are restrained, source-backed, and useful;
- no production deployment or source-tree marketing edit occurred.

- [ ] **Step 4: Leave the preview awaiting approval**

Report the Grab homepage URL, changelog URL, worktree path, branch, changed paths, and exact approval action. Do not merge, push, or deploy.
