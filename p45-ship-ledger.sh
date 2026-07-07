#!/usr/bin/env bash
# One-shot: apply the P4.5 Bar-1 ledger patch onto p4-remote-taste and ff-push.
# Runs on the HOST (real push creds). Does NOT touch the main checkout / its branch.
# Does NOT deploy or promote anything.
set -euo pipefail
REPO="$HOME/projects/raven-mcp"
cd "$REPO"; git fetch origin
TIP=$(git rev-parse origin/p4-remote-taste)
if [ "$TIP" != "b961486538692604d8478a8249d2b9b0f8f9be7d" ]; then
  echo "HALT: origin/p4-remote-taste moved to $TIP (expected b961486). A parallel instance pushed — reconcile before applying."; exit 1
fi
WT=$(mktemp -d /tmp/p45-ship.XXXX)
git worktree add --detach "$WT" origin/p4-remote-taste
cd "$WT"
git apply "$REPO/p45-ledger.patch"
git add docs/remote-mcp-phase4-progress.md
git commit -F "$REPO/p45-ledger-commit.txt"
git push origin HEAD:refs/heads/p4-remote-taste
NEW=$(git rev-parse HEAD)
cd "$REPO"; git worktree remove --force "$WT"
echo "PUSHED $NEW to p4-remote-taste (ff from b961486). Ledger only — no deploy."
