# RavenMCP 2.0 — release readiness (for the release instance)

*2026-07-19, Morven loop instance. Andrew wants 2.0 published TODAY. This is the pre-flight the Morven loop can do from its side; the merge + version bump + publish belong to the release instance (and Andrew's passkey). All checks below were run live at ~2026-07-19T12:30Z against main @ 1ff9117.*

## Verified ready ✅

| Check | Result |
|---|---|
| Test suite on main (`RAVEN_NO_USAGE_LOG=1 npm test`) | 768 pass / 0 fail / 1 conditional skip, 42s |
| PR #35 (manifest 51→93, `manifest-sync`) | MERGEABLE / CLEAN vs main |
| PR #36 (release-enablement, `release-enablement`) | MERGEABLE / CLEAN vs main |
| #35 ↔ #36 mutual conflict (`git merge-tree`) | zero conflicts — merge in either order |
| Anon remote golden hash (mcp.ravenmcp.ai, 45 tools) | `f64bb18…2bb0a6` — intact |
| Morven contamination in shipped surfaces | zero "morven" refs in src/, web/, site/, api/; npm `files` whitelist excludes conversations/ and .claude/ |
| Site + remote MCP | both 200 |

## Release path (in order)

1. **Merge #35** — without it the published manifest advertises 51 tools and 2.0 ships with half the surface invisible. This is the availability gate.
2. **Merge #36** — release-enablement pack (Codex approval sync, upgrade docs, digest fix).
3. **Version bump to 2.0.0 + publish** — via `.claude/skills/release/SKILL.md` runbook (`scripts/release.sh`, Andrew's passkey 2FA) or `workflow_dispatch` on `.github/workflows/release.yml` with `bump: major` (OIDC, no npm token). package.json is at 1.17.1; the bump is the release instance's edit, not done here.
4. **Post-publish:** re-verify the anon-45 golden hash and stdio byte-identity per the runbook; propagate to local `dist/`.

## Explicitly OFF the release path — do not merge for 2.0

PRs **#37–#43** (polish apply loop, comments-archive, bench-compare, fail-severity-tier, external packet, comments paste path, comments-to-decisions) — all Andrew-gated feature work, independent of 2.0. PR **#2** — stale, recommend close. Leaving all of these open does not block or degrade 2.0.

## Frozen invariants the release must not violate

- stdio MCP behavior byte-identical; tool count 93 stdio (no adds/removes/renames in this release beyond what #35 exposes in the manifest).
- Anon remote stays 45 tools, hash `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
- Production promote to mcp.ravenmcp.ai is Andrew-only, single supervised `vercel deploy --prod`, never `vercel promote`, never from `web/`. (2.0 npm publish does not require a promote.)
- Raven ⊂ Morven boundary: nothing Morven-branded ships — verified above.

## Not verified from this side (release instance owns)

- CI green on the #35/#36 branches themselves (mergeStateStatus CLEAN implies passing checks, but re-confirm at merge time).
- Post-merge full-suite rerun on main before the publish (baselines are per-worktree; run it on the release checkout).
- CHANGELOG/release notes for 2.0 — the 07-18 landing (#22–#33: decision graph, review_diff/polish_diff, port-fidelity, bench, contrast compositing, capture settle, tap-target emulation, rebind carry-forward) is the headline content.
