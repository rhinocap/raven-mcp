# /goal — build the release marketing-preview script

Paste the block below after `/goal`. Body is 3,999 characters (limit 4,000, counted mechanically).

```
Build the approval-gated release marketing preview specced in docs/superpowers/plans/2026-07-23-release-marketing-preview.md but never implemented (0/12 tasks). It is the missing safety net: v2.1.0 shipped tool #100 (`audit`) and the site still said "99 tools" three releases later, caught by hand on 2026-07-24.

OUTCOME
1. `scripts/prepare-marketing-preview.mjs` exists and passes `--self-check`.
2. `scripts/release.sh` invokes it best-effort after `git push --tags`; a preview failure never fails a published release.
3. `npm run marketing:preview -- --version <x.y.z>` produces a Grab-enabled local preview awaiting Andrew's approval. Nothing auto-commits, pushes, or deploys.

SOURCES (read before writing code)
- docs/superpowers/plans/2026-07-23-release-marketing-preview.md — the 12-task plan; follow it, including its two /tmp assertion tests.
- .claude/skills/release/SKILL.md — where this fits in the runbook; update it when this lands.
- scripts/check-site-drift.mjs, scripts/release.sh, web/data/changelog.json, dist/grab-bridge.js, manifest.json.

DRIFT DETECTION — already built, reuse it
`scripts/check-site-drift.mjs` (`npm run check:site`, `--json`) does the mechanical half: tool count vs manifest across web/app/**, coverage vs ToolsSection.tsx, /docs coverage as INFO only, CHANGELOG.md vs web/data/changelog.json. Exit 1 on error. Call it, don't reimplement it, and gate on it: exits 0 and the changelog entry exists → print "site in sync" and exit WITHOUT a worktree or a Codex leg.
What it can't catch, and the preview must: stale prose — a tool whose behavior changed this release while its blurb reads the old way (`move_grab_layer` after v2.2.3). Ground suggestions in the diff; never guess. Historical strings in web/data/changelog.json are as-shipped facts — never rewrite them.

SCOPE
IN: scripts/prepare-marketing-preview.mjs, the release.sh hook, package.json script entry, the release SKILL.md note.
ROUTING: mechanical legs (scaffolding, the release.sh hook, tests) go to `scripts/ow-run z-ai/glm-5.2 12000 low` or `codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium`. ALWAYS pass the reasoning cap — without it Kimi returns empty on finish_reason=length. Log a row per bucket to conversations/openweight-scoreboard.jsonl. Copy judgment and the eyes-on review stay main-loop.
OUT: any production deploy; any redesign of the site; edits to src/, browser/raven-grab.js, or the stdio tool surface; touching legacy site/*.html (a separate decision).

CONSTRAINTS
- The Codex leg may write ONLY inside the preview worktree's web/. Abort before serving if a changed path escapes web/, or nothing changed.
- Skip when CI=true or RAVEN_SKIP_MARKETING_PREVIEW=1. `DRY_RUN=1 scripts/release.sh` stays non-mutating: no worktree, no server.
- Refuse to clobber an existing preview worktree/branch — an unapproved preview must not be silently lost.
- Public-artifact voice throughout; never reference IP, employer, client, or license cleanup.
- Reflect only shipped reality. Never invent a capability.

VERIFICATION (evidence, not assertion)
- `node /tmp/raven-marketing-preview.test.mjs` and `/tmp/raven-release-hook.test.mjs` both fail first, then pass.
- `node scripts/prepare-marketing-preview.mjs --self-check` prints "self-check passed".
- `DRY_RUN=1 RAVEN_SKIP_MARKETING_PREVIEW=1 bash scripts/release.sh` reports the next version and exits clean; `git status --porcelain` unchanged.
- Real run: `npm run marketing:preview -- --version 2.2.3`. It must surface the `audit` tool missing from ToolsSection (via check:site) AND propose the stale `move_grab_layer` blurb — the second is the kill test, since only the preview leg can catch it.
- Eyes-on the rendered preview homepage and /changelog at desktop and 390px, plus audit_taste with project "raven-mcp".
- `RAVEN_NO_USAGE_LOG=1 npm test` green.

HANDOFF
Report the Grab homepage URL, changelog URL, worktree path, branch, exact changed paths, and the one command that approves. Do not merge, push, or deploy.
```

---

# Spec — site changes implied by v2.2.3

Goal: bring ravenmcp.ai in line with what v2.1.0–v2.2.3 actually shipped. In scope: the Next `web/` app only (it serves the apex). Out of scope: redesign, the legacy `site/*.html`, the stdio tool surface.

Acceptance: every claim on the live apex is true of `manifest.json` + `CHANGELOG.md`, verified against the cache-busted production URL.

## Shipped 2026-07-24 (done, verified live)

| # | Change | Evidence |
|---|---|---|
| S1 | `web/data/changelog.json` v2.2.3 entry + regenerated `site/changelog.html` | ravenmcp.ai/changelog shows v2.2.3 |
| S2 | Tool count 99 → 100 across `layout.tsx` (×5 incl. OG/Twitter/JSON-LD), `docs/page.tsx`, `page.tsx`, `design-system/page.tsx` | ravenmcp.ai/docs reads "Raven provides 100 tools" |

## Open — mechanical, do these

**A1 · One registered tool is absent from the homepage tool list.**
`web/components/tools/ToolsSection.tsx` lists 99 of 100. Missing: `audit`.
- Add it to group 01 (Audit), and consider the marquee: it is the dispatcher that detects the surface and runs the applicable `audit_*` set, returning one merged report. It is the headline of v2.1.0 and currently invisible on the site.
- Acceptance: `npm run check:site` reports COVERAGE PASS.

> Corrected 2026-07-24: an earlier hand-grep of this file claimed three missing tools (`audit`, `audit_ios_a11y`, `get_d4d_framework`). Only `audit` is missing — the other two are at lines 27 and 111. All three independently-written detectors agreed against the grep, which is the argument for `scripts/check-site-drift.mjs` existing at all.

**A2 · `move_grab_layer`'s blurb describes pre-2.2.3 behavior.**
Current: "Queue a same-page layer reorder or reparent, previewed from measured rects." As of v2.2.3 the element moves on the real page immediately; the measured-rect preview is no longer the whole story.
- Rewrite to lead with the live move, keep the pending-change truth: the tray still carries the intent and the agent's source edit is what ships.
- Sweep the same range for other stale blurbs — `get_grab_operation` and `get_grab_layers` both predate the layer-move pipeline.

**A3 · Raven Design section copy.**
`web/app/page.tsx` §raven-design subtitle: "Edits land on the page as you make them, then get packaged for your agent." True of style edits since 2.0; now true of structure too. One restrained clause covering layer moves, or leave it — but decide deliberately rather than by omission. The demo video's `aria-label` already says "reordering a layer" and stays accurate.

## Open — judgment calls, not drift (Andrew decides)

**B1 · `/docs` documents 42 of 100 tools.** 58 registered tools have no card, including every `decision_*`, every `talon_*`, `review_diff`, `polish_diff`, `audit`, and the whole taste/grab/creative surface. Either it is a deliberate curated subset — in which case say so on the page, because "Raven provides 100 tools" directly above 42 cards reads as an omission — or it should be completed. It is the largest gap on the site and it is not a v2.2.3 problem.

**B2 · Legacy `site/*.html` is badly stale.** `index.html` says 70 tools, `changelog.html` 99, `design-system.html` 56. Harmless while the apex is served by the `web` project, misleading the moment anything links at the `site` project. Retire it or sync it once; do not keep both by default.

## Verification for A1–A3

- `npm run check:site` exits 0 (COVERAGE PASS; DOCS INFO does not fail).
- `npm run build` in `web/` clean.
- `vercel deploy --prod` from `web/`, then a cache-busted grep of the live apex for `audit` and the new `move_grab_layer` blurb.
- Eyes-on the rendered homepage at desktop and 390px — the added card must not break the group grid.
