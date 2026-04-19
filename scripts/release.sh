#!/usr/bin/env bash
# Cut a Raven release.
#   - Bumps version (patch by default)
#   - Rebuilds the .mcpb into site/
#   - Publishes to npm
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

echo "→ Pulling latest main"
git pull --ff-only

CURRENT=$(node -p "require('./package.json').version")
echo "→ Current version: $CURRENT"

if [[ "$DRY_RUN" == "1" ]]; then
  NEW=$(node -p "const s='${CURRENT}'.split('.').map(Number); const b='${BUMP}'; if(b==='major'){s[0]++;s[1]=0;s[2]=0}else if(b==='minor'){s[1]++;s[2]=0}else{s[2]++}; s.join('.')")
  echo "  [dry-run] would bump to $NEW, rebuild .mcpb, publish to npm, commit, tag, push"
  exit 0
fi

echo "→ Bumping version ($BUMP)"
# --no-git-tag-version: we tag ourselves after the .mcpb is updated so the tag
# commit contains both package.json and the fresh binary.
npm version "$BUMP" --no-git-tag-version
NEW=$(node -p "require('./package.json').version")
echo "  New version: $NEW"

echo "→ Syncing version into manifest.json"
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  m.version = require("./package.json").version;
  fs.writeFileSync("manifest.json", JSON.stringify(m, null, 2) + "\n");
'

echo "→ Rebuilding .mcpb"
npm run build:mcpb

echo "→ Publishing to npm"
npm publish

echo "→ Committing + tagging"
git add package.json package-lock.json manifest.json site/raven.mcpb
git commit -m "Release v$NEW

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git tag "v$NEW"

echo "→ Pushing"
git push
git push --tags

echo ""
echo "✓ Released v$NEW"
echo "  npm:  https://www.npmjs.com/package/raven-mcp/v/$NEW"
echo "  mcpb: https://ravenmcp.ai/raven.mcpb  (auto-deploys via Vercel)"
