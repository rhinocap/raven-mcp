# /goal — build the release marketing-preview script

Paste the block below after `/goal`. Body is 3,992 characters (limit 4,000, counted mechanically).

```
Build the approval-gated release marketing preview specced in docs/superpowers/plans/2026-07-23-release-marketing-preview.md but never implemented (0/12 tasks). It is the missing safety net: v2.1.0 shipped tool #100 (`audit`) and the site still said "99 tools" three releases later, caught by hand on 2026-07-24.

OUTCOME
1. `scripts/prepare-marketing-preview.mjs` exists and passes `--self-check`.
2. `scripts/release.sh` invokes it best-effort after `git push --tags`; a preview failure never fails an already-published release.
3. `npm run marketing:preview -- --version <x.y.z>` produces a Grab-enabled local preview awaiting Andrew's approval. Nothing auto-commits, pushes, or deploys.
4. It DETECTS drift, not just drafts prose — see DRIFT below.

SOURCES (read before writing code)
- docs/superpowers/plans/2026-07-23-release-marketing-preview.md — the 12-task plan; follow it, including its two /tmp assertion tests.
- .claude/loops/marketing-site-sync.md — the manual drift-catcher; lift its detection rules, retargeted from legacy `site/*.html` to the Next `web/` app that serves the apex.
- .claude/skills/release/SKILL.md — where this fits in the runbook; update it when this lands.
- scripts/release.sh, web/data/changelog.json, dist/grab-bridge.js, manifest.json.

DRIFT DETECTION (the part the plan under-specifies — make it mechanical)
Compare shipped reality against what `web/` shows, and put the deltas in the preview:
- Tool count: `manifest.json`.tools.length vs every "N tools" string in web/app/**. Historical strings inside web/data/changelog.json entries are as-shipped facts — never rewrite them.
- Tool coverage: manifest tool names vs the names listed in web/components/tools/ToolsSection.tsx and web/app/docs/page.tsx. Report anything registered but unlisted.
- Changelog: newest dated CHANGELOG.md section vs newest web/data/changelog.json entry.
- Stale blurbs: a tool whose behavior changed in this release range but whose site description still reads the old way. Report as a suggestion; never guess silently.
If nothing drifted, say "site in sync" and exit without creating a worktree.

SCOPE
IN: scripts/prepare-marketing-preview.mjs, the release.sh hook, package.json script entry, the release SKILL.md note.
OUT: any production deploy; any redesign of the site; edits to src/, browser/raven-grab.js, or the stdio tool surface; touching legacy site/*.html (a separate decision).

CONSTRAINTS
- The Codex leg may write ONLY inside the preview worktree's web/. Abort before serving if any changed path escapes web/, or if nothing changed.
- Skip when CI=true or RAVEN_SKIP_MARKETING_PREVIEW=1. `DRY_RUN=1 scripts/release.sh` must stay non-mutating: no worktree, no server.
- Refuse to clobber an existing preview worktree/branch — an unapproved preview must not be silently lost.
- Public-artifact voice in every generated string; never reference IP, employer, client, or license cleanup.
- Reflect only shipped reality: registered tools, published version, dated CHANGELOG sections. Never invent a capability.

VERIFICATION (evidence, not assertion)
- `node /tmp/raven-marketing-preview.test.mjs` and `/tmp/raven-release-hook.test.mjs` both fail first, then pass.
- `node scripts/prepare-marketing-preview.mjs --self-check` prints "self-check passed".
- `DRY_RUN=1 RAVEN_SKIP_MARKETING_PREVIEW=1 bash scripts/release.sh` reports the next version and exits clean; `git status --porcelain` unchanged.
- Real run: `npm run marketing:preview -- --version 2.2.3`. It must independently rediscover the three tools missing from ToolsSection (`audit`, `audit_ios_a11y`, `get_d4d_framework`) — that is the kill test for the detector.
- Eyes-on the rendered preview homepage and /changelog at desktop and 390px, plus audit_taste with project "raven-mcp".
- `RAVEN_NO_USAGE_LOG=1 npm test` green.

HANDOFF
Report the Grab homepage URL, the changelog URL, worktree path, branch, the exact changed paths, and the one command that approves. Do not merge, push, or deploy.
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

**A1 · Three registered tools are absent from the homepage tool list.**
`web/components/tools/ToolsSection.tsx` lists 97 of 100. Missing: `audit`, `audit_ios_a11y`, `get_d4d_framework`.
- `audit` → group 01 (Audit), marquee-worthy: it is the dispatcher that detects the surface and runs the applicable `audit_*` set, returning one merged report. It is the headline of v2.1.0 and currently invisible on the site.
- `audit_ios_a11y` → the iOS/mobile group, beside `audit_ios_screen`.
- `get_d4d_framework` → the knowledge group, beside `get_principles`.
- Acceptance: `manifest.json` names minus ToolsSection names = empty set.

**A2 · `move_grab_layer`'s blurb describes pre-2.2.3 behavior.**
Current: "Queue a same-page layer reorder or reparent, previewed from measured rects." As of v2.2.3 the element moves on the real page immediately; the measured-rect preview is no longer the whole story.
- Rewrite to lead with the live move, keep the pending-change truth: the tray still carries the intent and the agent's source edit is what ships.
- Sweep the same range for other stale blurbs — `get_grab_operation` and `get_grab_layers` both predate the layer-move pipeline.

**A3 · Raven Design section copy.**
`web/app/page.tsx` §raven-design subtitle: "Edits land on the page as you make them, then get packaged for your agent." True of style edits since 2.0; now true of structure too. One restrained clause covering layer moves, or leave it — but decide deliberately rather than by omission. The demo video's `aria-label` already says "reordering a layer" and stays accurate.

## Open — judgment calls, not drift (Andrew decides)

**B1 · `/docs` documents 40 of 100 tools.** 60 registered tools have no card, including every `decision_*`, every `talon_*`, `review_diff`, `polish_diff`, `audit`, and the whole taste/grab/creative surface. Either it is a deliberate curated subset — in which case say so on the page, because "Raven provides 100 tools" directly above 40 cards reads as an omission — or it should be completed. It is the largest gap on the site and it is not a v2.2.3 problem.

**B2 · Legacy `site/*.html` is badly stale.** `index.html` says 70 tools, `changelog.html` 99, `design-system.html` 56. Harmless while the apex is served by the `web` project, misleading the moment anything links at the `site` project. Retire it or sync it once; do not keep both by default.

## Verification for A1–A3

- `comm -23 <(manifest names) <(ToolsSection names)` → empty.
- `npm run build` in `web/` clean.
- `vercel deploy --prod` from `web/`, then cache-busted grep of the live apex for `audit`, `audit_ios_a11y`, `get_d4d_framework` and the new `move_grab_layer` blurb.
- Eyes-on the rendered homepage at desktop and 390px — three added cards must not break the group grid.
