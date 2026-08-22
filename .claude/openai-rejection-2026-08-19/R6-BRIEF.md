# Adverse falsification pass — round 6, release-path fixes

Report only. Change no files. Run NO command that publishes, tags, creates a
release, deploys, or mutates a credential. Read-only git/grep/node --check/bash -n
are fine.

## Under audit
- `.github/workflows/release.yml`
- `scripts/release.sh`
- `scripts/detect-release-scope.mjs`

## Round-5 findings these edits claim to answer
- R5-1 (P1): resume was lost when any ordinary commit landed after the release
  tag, so a half-deployed vX stranded and a new immutable npm version was cut.
- R5-2 (P1): the pre-npm ancestry re-check's residual window was described as
  "seconds" when the post-npm tail is the larger half.
- R5-3 (P2): a resumed `gh release create` could succeed with EMPTY notes.
- R5-4 (P2): the Vercel preflight proves read access, not deploy permission.

## Claims to falsify
C1. `resume_version` makes EVERY half-deployed state finishable by the machine,
    with no state left that requires a human to hand-edit or force-push.
C2. `resume_version` cannot cause a version to be cut, skipped, or misnamed —
    including bad input, whitespace, a `v` prefix, or a version that was never
    released.
C3. The automatic zero-commit / changelog-only resume path is unchanged in
    behaviour by this edit (the empty-input direction was measured identical).
C4. The `--generate-notes` fallback cannot itself produce a wrong or empty
    Release, and cannot fire on a normal (non-resume) cut.
C5. No `${{ }}` expression reaches shell SOURCE in any run block.
C6. The three comments (release.sh residual window, Vercel preflight limits,
    detect-release-scope header) are now TRUE statements about the code, with no
    remaining claim that overstates what is guaranteed.

Grade each SURVIVES / DOES NOT SURVIVE with severity and file:line citations.
