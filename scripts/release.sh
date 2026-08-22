#!/usr/bin/env bash
# Cut a Raven release.
#   - Bumps version (patch by default)
#   - Rebuilds the .mcpb into site/
#   - Publishes to npm
#   - Publishes to the MCP Registry
#   - Commits, tags, and pushes
#
# Usage:
#   scripts/release.sh           # patch bump
#   scripts/release.sh minor     # minor bump
#   scripts/release.sh major     # major bump
#   DRY_RUN=1 scripts/release.sh # preview only
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
DRY_RUN="${DRY_RUN:-0}"

# Guardrails
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is dirty. Commit or stash first."
  git status --short
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ Release must be cut from main (currently on $BRANCH)."
  exit 1
fi

# Everything the registry step needs is checked HERE, before anything is bumped
# or published. The old script checked for the CLI after `npm publish`, so a
# missing CLI left a half-done release.
REGISTRY_KEY="${RAVEN_REGISTRY_KEY_FILE:-$HOME/.raven-mcp-registry-key}"
if ! command -v mcp-publisher >/dev/null 2>&1; then
  echo "✗ mcp-publisher CLI not found on PATH. Install it before releasing."
  exit 1
fi
if [[ ! -f "$REGISTRY_KEY" ]]; then
  echo "✗ Registry signing key not found at $REGISTRY_KEY."
  echo "  Namespace ai.ravenmcp/* needs HTTP domain auth against ravenmcp.ai."
  exit 1
fi

# NOT a pull. In CI the full suite has ALREADY run against the checked-out SHA by
# the time this script starts, so pulling here would move the tree underneath a
# green test result and publish bytes nothing tested — an ordinary push landing
# during the ~10-minute test window is enough to do it. Locally the same applies
# to whatever the operator ran before invoking this. So the currency requirement
# is asserted rather than satisfied: if main has moved, stop and make the caller
# re-run from the new head, tests included.
echo "→ Checking main is current"
git fetch origin "$BRANCH" --quiet
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse "origin/$BRANCH")
if [[ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]]; then
  echo "✗ HEAD ($LOCAL_HEAD) is not origin/$BRANCH ($REMOTE_HEAD)."
  echo "  Whatever was tested is not what would be published. Update and re-run"
  echo "  the full suite from the new head before releasing."
  exit 1
fi

CURRENT=$(node -p "require('./package.json').version")
echo "→ Current version: $CURRENT"

if [[ "$DRY_RUN" == "1" ]]; then
  NEW=$(node -p "const s='${CURRENT}'.split('.').map(Number); const b='${BUMP}'; if(b==='major'){s[0]++;s[1]=0;s[2]=0}else if(b==='minor'){s[1]++;s[2]=0}else{s[2]++}; s.join('.')")
  echo "  [dry-run] would bump to $NEW, rebuild .mcpb, publish to npm + MCP Registry, commit, tag, push"
  exit 0
fi

echo "→ Bumping version ($BUMP)"
# --no-git-tag-version: we tag ourselves after the .mcpb is updated so the tag
# commit contains both package.json and the fresh binary.
npm version "$BUMP" --no-git-tag-version
NEW=$(node -p "require('./package.json').version")
echo "  New version: $NEW"

echo "→ Compiling stdio server for manifest sync"
npm run build

echo "→ Syncing version into manifest.json"
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  m.version = require("./package.json").version;
  fs.writeFileSync("manifest.json", JSON.stringify(m, null, 2) + "\n");
'
node scripts/sync-manifest-tools.mjs

echo "→ Syncing version into server.json (MCP Registry / marketplace metadata)"
node -e '
  const fs = require("fs");
  const v = require("./package.json").version;
  const s = JSON.parse(fs.readFileSync("server.json", "utf8"));
  s.version = v;
  if (Array.isArray(s.packages)) {
    for (const p of s.packages) p.version = v;
  }
  fs.writeFileSync("server.json", JSON.stringify(s, null, 2) + "\n");
'

echo "→ Rebuilding .mcpb"
SKIP_BUILD=1 npm run build:mcpb

echo "→ Publishing to npm"
# npm publish is the first IRREVERSIBLE step and the Registry, the commit and the
# tag all come after it, so any failure downstream leaves a rerun facing a version
# npm already holds — and npm refuses to overwrite, so a naive rerun cannot
# converge. Detect that state and resume through it instead of dying on it.
#
# The artifact is verified rather than assumed identical: `npm pack --dry-run`
# was measured on npm 11.17.0 to produce a shasum that is stable across runs and
# independent of file mtimes, so comparing it to the published `dist.shasum` is a
# real byte-identity check of the tree about to be tagged. A MISMATCH is fatal on
# purpose: npm will not let those bytes be replaced, so continuing would tag and
# announce a release whose npm artifact is something else.
if npm view "raven-mcp@$NEW" version >/dev/null 2>&1; then
  echo "  raven-mcp@$NEW is already on npm — resuming a partial release."
  LOCAL_SHASUM=$(npm pack --dry-run --json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].shasum')
  PUBLISHED_SHASUM=$(npm view "raven-mcp@$NEW" dist.shasum)
  if [[ "$LOCAL_SHASUM" != "$PUBLISHED_SHASUM" ]]; then
    echo "✗ npm already serves $NEW with a DIFFERENT artifact."
    echo "    published: $PUBLISHED_SHASUM"
    echo "    local:     $LOCAL_SHASUM"
    echo "  npm does not allow republishing a version. Cut the next version instead."
    exit 1
  fi
  echo "  published artifact matches this tree ($LOCAL_SHASUM) — continuing."
else
  npm publish
fi

echo "→ Publishing to MCP Registry"
# The registry JWT expires in MINUTES. Minting it right here — rather than in a
# preflight the operator ran earlier — is the whole point: v2.2.9 and v2.3.0
# both published to npm and then died on an expired token, each leaving a
# half-done release (npm shipped, registry stale, nothing committed or tagged).
mcp-publisher login http --domain ravenmcp.ai --private-key "$(cat "$REGISTRY_KEY")"
# Resume-tolerant for the same reason npm is: on a rerun after a downstream
# failure the Registry may already hold this version, and a publish that refuses
# a duplicate would strand the tag/apex surfaces the rerun exists to reach. The
# failure is not TRUSTED to mean "already published" — the registry is asked
# directly, and only a version it actually reports lets the run continue.
if ! mcp-publisher publish; then
  echo "  registry publish failed — checking whether $NEW is already recorded"
  if curl -s "https://registry.modelcontextprotocol.io/v0/servers/ai.ravenmcp%2Fraven-mcp/versions" \
     | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{let o;try{o=JSON.parse(b)}catch(e){process.exit(1)}const v=(o.servers||[]).map(x=>x.server&&x.server.version);process.exit(v.includes(process.argv[1])?0:1)})' "$NEW"; then
    echo "  registry already records $NEW — resuming."
  else
    echo "✗ registry publish failed and $NEW is not recorded. Stopping."
    exit 1
  fi
fi

echo "→ Committing + tagging"
# build:mcpb writes the bundle to BOTH site/ and web/public/. ravenmcp.ai is
# served by the `web` project, so staging only site/ leaves the public download
# one release behind — that gap is what the v2.2.6 hand-copy commit was.
git add package.json package-lock.json manifest.json server.json site/raven.mcpb web/public/raven.mcpb
# Both of these are no-ops on a resume, and both used to be fatal there: `git
# commit` exits 1 with nothing staged and `git tag` exits 1 on an existing name.
# A tag that already exists is the exact state P1-2 describes — the tag landed
# and something downstream (GitHub Release, changelog, Vercel, apex verify)
# failed — and detect-release-scope.mjs then sees zero commits since that tag and
# reports released=false, so the apex never gets deployed by any later run. The
# resume path is what makes the remaining surfaces reachable.
if git diff --cached --quiet; then
  echo "  nothing to commit — release commit already exists, resuming."
else
  git commit -m "Release v$NEW

Co-Authored-By: Codex Opus 4.6 <noreply@anthropic.com>"
fi
if git rev-parse -q --verify "refs/tags/v$NEW" >/dev/null; then
  echo "  tag v$NEW already exists — resuming."
else
  git tag "v$NEW"
fi

echo "→ Pushing"
# ATOMIC. Two separate pushes can half-succeed: the branch lands and the tag
# push then fails (branch protection, a race, a dropped connection), leaving npm
# and the MCP Registry published against a `main` that carries no tag, no
# GitHub Release, no changelog and no apex deploy — and the tag name is by then
# already taken locally, so a retry does not converge. One ref update or none.
# `--atomic` still fails when BOTH refs are already published (a resume that got
# this far last time), so an up-to-date push is not an error here. Anything else
# is.
if ! push_out=$(git push --atomic origin "$BRANCH" "v$NEW" 2>&1); then
  if echo "$push_out" | grep -q "Everything up-to-date"; then
    echo "  branch and tag already pushed — resuming."
  else
    echo "$push_out"
    exit 1
  fi
else
  echo "$push_out"
fi

echo ""
echo "✓ Released v$NEW"
echo "  npm:  https://www.npmjs.com/package/raven-mcp/v/$NEW"
echo "  mcpb: https://ravenmcp.ai/raven.mcpb  (NOT live yet — the \`web\` Vercel"
echo "        project has no git integration; run \`cd web && vercel deploy --prod\`)"

if [[ "${CI:-}" != "true" && "${RAVEN_SKIP_MARKETING_PREVIEW:-0}" != "1" ]]; then
  echo "→ Preparing approval-gated marketing preview"
  node scripts/prepare-marketing-preview.mjs --version "$NEW" ||
    echo "⚠ Release succeeded; marketing preview needs a manual rerun: npm run marketing:preview -- --version $NEW"
fi
