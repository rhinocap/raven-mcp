#!/usr/bin/env bash
# Build raven.mcpb — a Claude Desktop Extension (MCP Bundle).
# Output: site/raven.mcpb (served at https://ravenmcp.ai/raven.mcpb).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
STAGE="$ROOT/.mcpb-stage"
OUT="$ROOT/site/raven.mcpb"

echo "→ Cleaning stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"

echo "→ Compiling TypeScript"
npm run build

echo "→ Staging bundle contents"
cp manifest.json "$STAGE/manifest.json"
cp README.md LICENSE "$STAGE/"
cp -R dist "$STAGE/dist"
mkdir -p "$STAGE/src"
cp -R src/data "$STAGE/src/data"
cp site/assets/raven-logo.png "$STAGE/icon.png"

echo "→ Writing minimal package.json"
node -e '
  const pkg = require("./package.json");
  const slim = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    type: pkg.type,
    main: pkg.main,
    dependencies: pkg.dependencies,
    license: pkg.license,
  };
  require("fs").writeFileSync(".mcpb-stage/package.json", JSON.stringify(slim, null, 2));
'

echo "→ Installing production deps into bundle"
(cd "$STAGE" && npm install --omit=dev --silent --no-audit --no-fund --ignore-scripts)

echo "→ Packing .mcpb"
rm -f "$OUT"
(cd "$STAGE" && npx -y @anthropic-ai/mcpb@latest pack . "$OUT")

echo "→ Cleaning stage"
rm -rf "$STAGE"

SIZE=$(du -h "$OUT" | cut -f1)
echo ""
echo "✓ Built: $OUT ($SIZE)"
echo "  Drop into Claude Desktop to install, or host at https://ravenmcp.ai/raven.mcpb"
