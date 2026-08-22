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

echo "→ Pulling latest main"
git pull --ff-only

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
npm publish

echo "→ Publishing to MCP Registry"
# The registry JWT expires in MINUTES. Minting it right here — rather than in a
# preflight the operator ran earlier — is the whole point: v2.2.9 and v2.3.0
# both published to npm and then died on an expired token, each leaving a
# half-done release (npm shipped, registry stale, nothing committed or tagged).
mcp-publisher login http --domain ravenmcp.ai --private-key "$(cat "$REGISTRY_KEY")"
mcp-publisher publish

echo "→ Committing + tagging"
# build:mcpb writes the bundle to BOTH site/ and web/public/. ravenmcp.ai is
# served by the `web` project, so staging only site/ leaves the public download
# one release behind — that gap is what the v2.2.6 hand-copy commit was.
git add package.json package-lock.json manifest.json server.json site/raven.mcpb web/public/raven.mcpb
git commit -m "Release v$NEW

Co-Authored-By: Codex Opus 4.6 <noreply@anthropic.com>"
git tag "v$NEW"

echo "→ Pushing"
# ATOMIC. Two separate pushes can half-succeed: the branch lands and the tag
# push then fails (branch protection, a race, a dropped connection), leaving npm
# and the MCP Registry published against a `main` that carries no tag, no
# GitHub Release, no changelog and no apex deploy — and the tag name is by then
# already taken locally, so a retry does not converge. One ref update or none.
git push --atomic origin "$BRANCH" "v$NEW"

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
