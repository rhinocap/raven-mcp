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
# The question is NOT whether the two match. Local commits that origin has not
# seen yet are the ordinary state of this worktree (the auto-save-on-turn hook
# commits every turn and never pushes), and they are part of what the suite just
# measured, so releasing them is correct. What must never happen is the reverse:
# origin holding a commit this tree does NOT have, because the old
# `git pull --ff-only` here ran AFTER the test gate and would fast-forward those
# bytes in under a green result. So the assertion is ancestry -- origin/$BRANCH
# must already be contained in HEAD -- which permits ahead and refuses both
# behind and diverged. Measured in all three directions before it was written.
if ! git merge-base --is-ancestor "$REMOTE_HEAD" "$LOCAL_HEAD"; then
  echo "✗ origin/$BRANCH ($REMOTE_HEAD) is not contained in HEAD ($LOCAL_HEAD)."
  echo "  Something landed on origin that this tree has not tested. Whatever was"
  echo "  tested is not what would be published. Integrate it and re-run the full"
  echo "  suite from the new head before releasing."
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

# Re-checked immediately before the first irreversible write, NOT only at the
# top of the script. The gate above runs, then the suite runs, then the build
# runs -- minutes during which a second writer can land on origin/$BRANCH. The
# harm is specific and unrecoverable rather than cosmetic: the atomic branch+tag
# push at the end of this script would REJECT, and the rerun recomputes the same
# version number from different bytes, so the npm shasum guard below correctly
# refuses to continue and that version can never acquire its tag or its apex
# bundle. Re-asking here narrows the PRE-NPM window from minutes to seconds.
#
# Be precise about which window this closes, because an earlier version of this
# comment said "seconds" of the whole thing and that was wrong. Between this
# check and the atomic push at the end sit: the npm publish itself, the registry
# login, up to three registry publish attempts, the registry read-backs, and 20s
# of explicit backoff -- none of it network-bounded. So the residual window is
# not seconds; it is the entire post-npm tail. Whether it is the LARGER half is
# NOT established here and the earlier wording claiming it was has been removed:
# nothing in this script measures either interval, and the pre-npm side contains
# a full test suite and a build. What IS established is that the residual side
# contains unbounded network operations, so it cannot be called small either.
#
# ACCEPTED RESIDUAL, stated rather than implied: this is a narrowing, not a
# lock. A push landing between this check and the push at the end still strands
# the version, and nothing here can prevent that -- claiming the ref before
# publishing would invert the npm-first ordering the block below reasons for and
# leaves a tag with no package on the reverse failure. Accepted because main has
# one human writer and releases are deliberate. REOPEN if main gains automated
# pushes, a second release runner, or multiple regular committers.
echo "→ Re-checking main is still current (last chance before npm)"
git fetch origin "$BRANCH" --quiet
REMOTE_HEAD_NOW=$(git rev-parse "origin/$BRANCH")
if ! git merge-base --is-ancestor "$REMOTE_HEAD_NOW" "$(git rev-parse HEAD)"; then
  echo "✗ origin/$BRANCH moved to $REMOTE_HEAD_NOW while this release was building."
  echo "  Publishing now would strand v$NEW: the final branch+tag push would be"
  echo "  rejected, and a rerun would compute the same version from different"
  echo "  bytes, which npm will not let you republish. Nothing has been published"
  echo "  yet. Integrate, re-run the full suite, and start again."
  exit 1
fi

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
  PUBLISHED_SHASUM_NOW="$PUBLISHED_SHASUM"
else
  npm publish
  # Recorded for the push-retry below: once npm holds these bytes, any later
  # movement of the tree has to be checked against them, not against a memory of
  # what was built.
  # Read it back with retries: the registry can lag a few seconds behind a
  # successful publish, and a transient miss used to leave this EMPTY, which the
  # rebase guard below then read as "nothing to compare" and skipped. An empty
  # value here is not an absence of a problem, it is an absence of a measurement.
  PUBLISHED_SHASUM_NOW=""
  for _attempt in 1 2 3 4 5; do
    PUBLISHED_SHASUM_NOW=$(npm view "raven-mcp@$NEW" dist.shasum 2>/dev/null || echo "")
    [[ -n "$PUBLISHED_SHASUM_NOW" ]] && break
    sleep 3
  done
  if [[ -z "$PUBLISHED_SHASUM_NOW" ]]; then
    echo "⚠ published v$NEW but could not read its shasum back from npm."
    echo "  The rebase check below will REFUSE rather than skip."
  fi
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
#
# RETRIED with bounded backoff, and the reason is the asymmetry of where this
# step sits: npm has ALREADY published by the time control reaches here, and npm
# versions are immutable, so a transient registry rejection that is not retried
# leaves a release whose only recovery is a resume run. The workflow's
# `mcp-publisher validate` preflight does not make that unlikely enough to
# ignore — validate is schema and semantic only, while publish additionally
# applies server-side package-ownership and namespace-authorization checks it
# never sees, and either can fail on registry-side trouble with the manifest
# perfectly well-formed. Three attempts, 5s then 15s apart: enough to ride out a
# restart or a rate limit, short enough that a genuine authorization failure
# still stops the run in under half a minute rather than looping.
#
# The registry is asked DIRECTLY before each retry rather than after the last
# one, because a publish can succeed server-side and still report failure to the
# client, and re-publishing an already-recorded version is the case this whole
# block exists to survive.
registry_records_new() {
  curl -s "https://registry.modelcontextprotocol.io/v0/servers/ai.ravenmcp%2Fraven-mcp/versions" \
    | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{let o;try{o=JSON.parse(b)}catch(e){process.exit(1)}const v=(o.servers||[]).map(x=>x.server&&x.server.version);process.exit(v.includes(process.argv[1])?0:1)})' "$NEW"
}

REGISTRY_BACKOFF=(5 15)
REGISTRY_DONE=0
for attempt in 1 2 3; do
  if mcp-publisher publish; then
    REGISTRY_DONE=1
    break
  fi
  echo "  registry publish attempt $attempt failed — asking the registry whether $NEW is already recorded"
  if registry_records_new; then
    echo "  registry already records $NEW — resuming."
    REGISTRY_DONE=1
    break
  fi
  if [[ $attempt -lt 3 ]]; then
    delay=${REGISTRY_BACKOFF[$((attempt - 1))]}
    echo "  not recorded — retrying in ${delay}s"
    sleep "$delay"
  fi
done
if [[ $REGISTRY_DONE -ne 1 ]]; then
  echo "✗ registry publish failed 3 times and $NEW is not recorded. Stopping."
  echo "  npm already serves $NEW, so this is a resumable partial release:"
  echo "  fix the registry-side cause and re-run scripts/release.sh — the npm"
  echo "  step will resume on the shasum check rather than republish."
  exit 1
fi

echo "→ Committing + tagging"
# build:mcpb writes the bundle to BOTH site/ and web/public/. ravenmcp.ai is
# served by the `web` project, so staging only site/ leaves the public download
# one release behind — that gap is what the v2.2.6 hand-copy commit was.
git add package.json package-lock.json manifest.json server.json site/raven.mcpb web/public/raven.mcpb
# Both of these are no-ops on the resume that reaches here with the commit and
# tag ALREADY made, and both used to be fatal there: `git commit` exits 1 with
# nothing staged and `git tag` exits 1 on an existing name. They are NOT no-ops
# on the other supported resume — npm published, process died before the commit
# — which is exactly the path that must still commit and tag below.
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
RELEASE_COMMIT=$(git rev-parse HEAD)
if git rev-parse -q --verify "refs/tags/v$NEW" >/dev/null; then
  # The name being taken is NOT evidence the release commit landed. A tag left
  # by an aborted run, a hand-made tag, or one pointing at an unrelated commit
  # all satisfy a bare --verify, and the script would then publish $NEW to npm
  # and the Registry while the tag names something else entirely -- a release
  # whose four surfaces disagree about which bytes it is. Ask what the tag
  # POINTS AT, locally and on the remote, and refuse anything but this commit.
  # `^{commit}` peels an annotated tag; the remote query peels with `^{}` and
  # falls back to the unpeeled ref, since `git tag` here writes lightweight tags.
  TAGGED=$(git rev-parse "v$NEW^{commit}")
  if [[ "$TAGGED" != "$RELEASE_COMMIT" ]]; then
    echo "✗ Local tag v$NEW points at $TAGGED, not the release commit $RELEASE_COMMIT."
    echo "  This is not a resume of this release. Inspect the tag and delete it"
    echo "  deliberately if it is stale, then re-run."
    exit 1
  fi
  REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/v$NEW^{}" "refs/tags/v$NEW" \
    | awk '$2 ~ /\^\{\}$/ {peeled=$1} $2 !~ /\^\{\}$/ {plain=$1} END {print (peeled != "" ? peeled : plain)}')
  if [[ -n "$REMOTE_TAG" && "$REMOTE_TAG" != "$RELEASE_COMMIT" ]]; then
    echo "✗ origin already carries tag v$NEW at $REMOTE_TAG, not $RELEASE_COMMIT."
    echo "  That version is published against different bytes. Bump and re-run."
    exit 1
  fi
  echo "  tag v$NEW already exists and points at the release commit — resuming."
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
#
# A REJECTION HERE USED TO STRAND THE VERSION PERMANENTLY. The currency recheck
# above closes the window before npm; it cannot close the one after, because npm
# publish and the Registry publish are network work and main has to be allowed to
# move during them. When it did, this push was rejected, and a later dispatch
# computed the same version from different bytes and died on the shasum
# comparison at :170 — npm holding a version that could never receive its tag,
# Release or apex bundle without advancing the number.
#
# So a rejection is RETRIED, and the retry is gated on the one invariant that
# makes it honest: the packed artifact after rebasing onto the moved main must
# still be byte-identical to what npm already serves. If it is, the tag names a
# tree that produces exactly the published tarball and nothing is being
# misrepresented. If it is NOT, the retry stops and says so — that state
# genuinely needs a new version, and pretending otherwise would tag a release
# whose npm artifact is something else.
push_attempt=0
while :; do
  if push_out=$(git push --atomic origin "$BRANCH" "v$NEW" 2>&1); then
    echo "$push_out"
    break
  fi
  if echo "$push_out" | grep -q "Everything up-to-date"; then
    echo "  branch and tag already pushed — resuming."
    break
  fi
  push_attempt=$((push_attempt + 1))
  if [[ $push_attempt -gt 3 ]]; then
    echo "$push_out"
    echo "✗ branch+tag push still rejected after $((push_attempt - 1)) rebase attempts."
    echo "  npm already serves v$NEW. Do NOT cut a new version to escape this:"
    echo "  rebase onto origin/$BRANCH by hand, confirm \`npm pack --dry-run\` still"
    echo "  reports $PUBLISHED_SHASUM_NOW, then push $BRANCH and v$NEW atomically."
    exit 1
  fi
  echo "  push rejected — origin/$BRANCH moved. Attempt $push_attempt: rebasing."
  git fetch origin "$BRANCH" --quiet
  if ! git rebase "origin/$BRANCH"; then
    git rebase --abort >/dev/null 2>&1 || true
    echo "$push_out"
    echo "✗ could not rebase onto origin/$BRANCH — conflicting changes landed."
    echo "  npm already serves v$NEW. Resolve by hand; do not cut a new version."
    exit 1
  fi
  REBASED_SHASUM=$(npm pack --dry-run --json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].shasum')
  # Fail CLOSED on an unreadable published shasum: skipping the comparison is how
  # npm bytes and the tagged tree could silently diverge.
  if [[ -z "$PUBLISHED_SHASUM_NOW" ]]; then
    echo "✗ rebased onto origin/$BRANCH but the published shasum is unknown."
    echo "    rebased: $REBASED_SHASUM"
    echo "  Cannot prove the tag would name the bytes npm serves. Resolve by hand."
    exit 1
  fi
  if [[ "$REBASED_SHASUM" != "$PUBLISHED_SHASUM_NOW" ]]; then
    echo "✗ rebasing onto origin/$BRANCH changed the packed artifact."
    echo "    npm serves: $PUBLISHED_SHASUM_NOW"
    echo "    rebased:    $REBASED_SHASUM"
    echo "  Tagging this tree would name a release whose npm artifact is different."
    echo "  npm will not replace those bytes: cut the NEXT version instead."
    exit 1
  fi
  # The tag has to follow the rebased commit. Delete and recreate rather than
  # reusing the old object: it points at a sha that is no longer on the branch.
  git tag -d "v$NEW" >/dev/null 2>&1 || true
  git tag "v$NEW"
done

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
