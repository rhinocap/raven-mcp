#!/usr/bin/env bash
# Install (or reinstall) the Raven daily-digest launchd agent.
#   - Generates ~/Library/LaunchAgents/ai.ravenmcp.daily-digest.plist from
#     scripts/launchd/ai.ravenmcp.daily-digest.plist.template, baking in the
#     current absolute paths.
#   - Unloads any existing instance and loads the new one.
#   - The agent fires at 18:00 local time every day.
#
# Uninstall:
#   launchctl unload ~/Library/LaunchAgents/ai.ravenmcp.daily-digest.plist
#   rm ~/Library/LaunchAgents/ai.ravenmcp.daily-digest.plist
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_PATH="$REPO_ROOT/scripts/reflect-daily.mjs"
NODE_BIN="$(command -v node)"
AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENT_DIR/ai.ravenmcp.daily-digest.plist"
LOG_PATH="$HOME/.raven/daily-digest.log"
TEMPLATE="$REPO_ROOT/scripts/launchd/ai.ravenmcp.daily-digest.plist.template"

if [[ -z "$NODE_BIN" ]]; then
  echo "✗ node not found on PATH. Install Node 18+ first."
  exit 1
fi

mkdir -p "$AGENT_DIR" "$HOME/.raven"

# Ensure dist/ is built so the agent can spawn the server.
if [[ ! -f "$REPO_ROOT/dist/index.js" ]]; then
  echo "→ Building Raven (dist/ missing)…"
  (cd "$REPO_ROOT" && npm run build)
fi

# Unload any running copy so changes take effect.
if launchctl list 2>/dev/null | grep -q "ai.ravenmcp.daily-digest"; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Generate the plist from the template.
sed \
  -e "s|{{NODE_BIN}}|$NODE_BIN|g" \
  -e "s|{{SCRIPT_PATH}}|$SCRIPT_PATH|g" \
  -e "s|{{REPO_ROOT}}|$REPO_ROOT|g" \
  -e "s|{{LOG_PATH}}|$LOG_PATH|g" \
  "$TEMPLATE" > "$PLIST_PATH"

# Load the agent.
launchctl load "$PLIST_PATH"

echo "✓ Installed daily-digest agent"
echo "  plist:      $PLIST_PATH"
echo "  script:     $SCRIPT_PATH"
echo "  node:       $NODE_BIN"
echo "  fires at:   18:00 local, every day"
echo "  digest log: $LOG_PATH"
echo "  markdown:   $HOME/.raven/daily-digest-YYYY-MM-DD.md"
echo ""
echo "Test run right now:"
echo "  node $SCRIPT_PATH"
echo ""
echo "Uninstall:"
echo "  launchctl unload \"$PLIST_PATH\" && rm \"$PLIST_PATH\""
