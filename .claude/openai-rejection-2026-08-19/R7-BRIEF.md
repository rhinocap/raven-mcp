# Round 7 — adverse falsification brief (report-only)

You are auditing the round-6 fixes to the release path. **Report only.** Do not run
any command that publishes, tags, releases, deploys, pushes, or mutates a credential.
Do not modify any file under audit.

## Files
- `.github/workflows/release.yml`
- `scripts/detect-release-scope.mjs`
- `scripts/release.sh`

## Claims to falsify

**C1.** An explicit `resume_version` can never cause a tag or a GitHub Release to be
created that did not already exist, for ANY input — malformed, nonexistent, or
crafted. Two independent checks are claimed: the detector's anchored regex plus tag
existence, and `--verify-tag` on both `gh release create` branches.

**C2.** On a resume, the bundle uploaded to the GitHub Release and deployed to the
apex is built from `refs/tags/v$VERSION`, not from current `main` — including the
sha256 the apex-verify step compares against.

**C3.** The resume-only worktree build cannot corrupt the primary checkout, leak a
worktree across reruns, or leave the changelog commit operating on the wrong ref.

**C4.** The automatic (non-explicit) resume path and the ordinary cut path are
behaviourally UNCHANGED by the round-6 edits.

**C5.** Every comment in the three files is true of the code beside it — in
particular the detector's statement about which half-deployed states a resume can and
cannot finish, and `release.sh`'s withdrawn "LARGER half" claim.

**C6.** No `${{ }}` expression reaches shell source in any `run:` block.

Grade each SURVIVES / DOES NOT SURVIVE with severity and `file:line` citations.
