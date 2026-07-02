# Handoff: Parked-branch landings + Taste Engine — 2026-07-01

Goal (`/goal`): land the 6 parked feature branches on main, then build the Taste Engine (5 new MCP tools modeled on `~/.claude/skills/design-judge/`). **Staged on local main — NOT pushed, NOT released.** Everything below is ready for `/release`.

## Part A — 6 parked branches landed on main (sequential, green gate after each)

All 6 branches (cut from old base `b51d570`) were rebased onto current origin/main in an isolated worktree, ff-merged into the primary repo, and gated with `npm run build && npm test` after EACH landing. Test count grew 248 → 353 with 0 failures at every step. Branches deleted after landing.

| Commit | Branch | What landed |
|--------|--------|-------------|
| `25283ef` | feat/score-page | `score_page` — per-category (0–10) design scores |
| `b5208c7` | feat/audit-video-playback | `audit_video_playback` — detects non-playing/black `<video>` |
| `19dda2f` | feat/audit-consistency | `audit_consistency` — cross-page corpus audit (#9) |
| `bf399d8` | feat/layout-orphan-stretch | `audit_layout` orphan-stretch detection |
| `a61b0bc` | feat/svg-color-compliance | `audit_page` SVG hardcoded-color check (`tokens/svg-hardcoded-color`) |
| `d364255` | feat/dropdown-menu-pattern | `dropdown-menu` pattern (Closes #1) |
| `049ff6e` | — | docs: dedupe README tool rows after the unions |

CHANGELOG `[Unreleased]` deduped into one `### Added` section covering all six.

## Part B — Taste Engine

### New files / changes
- **`src/taste.ts`** (new, ~750 lines, pure logic — no imports from page-checks/contrast/tap-targets): profile CRUD, DESIGN.md-style markdown ingestion, append-only `labelFinding` growth loop, `auditTaste` with deterministic detectors (gradient regex; glow/neon = box/text-shadow blur ≥16px + non-black color; second accent hue via HSL clustering, 40° tolerance; banned-word lists parsed from parenthesized lists in `negative_prompt`; faux-fonts → `not_assessed`). Profiles persist at `~/.raven/taste/<name>.json`, `RAVEN_TASTE_HOME` override.
- **`src/index.ts`**: 5 new `server.tool` registrations — `create_taste_profile`, `get_taste_profile`, `list_taste_profiles`, `label_finding`, `audit_taste` (url mode renders via `capturePage` with scroll-settle and runs delegated `auditContrastUrl` / `auditTapTargetsUrl` / `runPageChecks` for `owner: raven` rules, folding results in as `page_issues`). Plus `extractInsight` cases for the usage log (counts/rule_ids only, no content). The monkey-patched `server.tool` wrapper gives all 5 usage-logging automatically.
- **`test/taste.test.mjs`** (new, 13 tests): profile CRUD roundtrip, markdown ingestion, label append-only, verdict escalation (nit-only = PASS), corpus accept-suppression, rule_id-citation invariant, no-invented-rule_id invariant, `RAVEN_TASTE_HOME` isolation, glow-detector positive+negative+colorless, minimal seed-corpus + owner-default round-trip.
- **README.md**: 5 new tool-table rows. **CHANGELOG.md**: Taste Engine bullet in `[Unreleased]`.
- design-judge skill files untouched (read-only spec source). Marketing site untouched.

### Gates
- `npm run build` green; `npm test`: **366/366 pass** (353 base + 13 taste).
- Server boot: **65 tools, no duplicate names**, `raven-mcp v1.12.1 running on stdio`.
- Parallel-instance collision check: origin/main unchanged (`8d9cd7a`), no remote activity on taste files.

### Live smoke (verbatim excerpts — full raw output below)

Profile: 6 rules adapted from BRAND.md (`raven-brand`): COLOR-monochrome-no-gradient (block), COLOR-single-accent-hue (warn), COLOR-no-glow-neon (block), VOICE-restrained-no-hype (warn, banned-word list), TOKEN-runes-not-bare-literals (warn, `owner: raven` → audit_page), TYPE-no-faux-styles (warn).

Audited `site/index.html` (164,819 bytes, 9 delegated page issues):

- **47 findings, verdict `BLOCK (45 block, 2 warn)`** — every finding cites a real rule_id + line-level evidence.
- Per-rule: 35× COLOR-monochrome-no-gradient, 10× COLOR-no-glow-neon, 1× COLOR-single-accent-hue (green accent alongside blue), 1× TOKEN-runes-not-bare-literals (delegated: "tokens/no-bare-hex: 52 bare hex color values found outside custom property definitions").
- `not_assessed`: TYPE-no-faux-styles — "faux-font detection requires rendered font metrics" (honest silence, no guess).
- Growth loop: `label_finding` accept on the first gradient finding → re-audit dropped 47→46 findings, `suppressed: [{rule_id: COLOR-monochrome-no-gradient, corpus_id: rec_0001}]`, verdict recomputed `BLOCK (44 block, 2 warn)`.

Sample finding (verbatim):

```json
{
  "rule_id": "COLOR-no-glow-neon",
  "clause_cited": "Flat, precise, origami-sharp. No glow, no neon, no soft luminous halos.",
  "severity": "block",
  "owner": "taste",
  "source": "taste",
  "evidence": "line 1017: t: 1; color: var(--accent-blue); text-shadow: 0 0 40px rgba(0,191,255,0.3); margin-bottom: var(--space-2); }",
  "fix": "Avoid use glow or neon effects (large-blur colored shadows)."
}
```

(Aside: the smoke incidentally shows the marketing site violates the BRAND.md monochrome rules heavily — gradients + blue/green glows are all over `site/index.html`. Real signal for a future site pass; out of scope here.)

Full raw smoke output (467 lines) archived at the session scratchpad `smoke-output.txt`; key sections quoted above verbatim.

### Adversarial verification
- **Implementation-time verifier (Sonnet)**: confirmed all 8 test invariants; 1 must-fix (glow detector had zero coverage) → fixed by adding the glow test; 3 note-level objections dispositioned (below).
- **Final report-only Codex devil's-advocate pass** on the complete diff: `git diff --stat` snapshotted before reading its output; objections + dispositions: see "Codex pass" section below.

### Open items for /release
1. Version bump + release notes: `[Unreleased]` now carries 7 bullets (6 Part A + Taste Engine) → suggest **v1.13.0**.
2. Dispositioned verifier notes (accepted, not blocking):
   - Append-only is proven functionally (existing records unchanged after append), not byte-stability of the file — fine for JSON persistence.
   - Delegated page-issue folding uses greedy per-rule token-overlap; an issue attaches to at most one rule. Edge case: two raven rules with heavily overlapping vocabulary could contend — defensible spec interpretation, revisit if a real profile hits it.
3. `audit_taste` faux-font detection needs rendered font metrics — candidate follow-up: wire it through the url/capture path (currently `not_assessed`).
4. Marketing-site brand-compliance findings from the smoke (gradients/glow vs BRAND.md) — separate loop owns the site; parked here as signal only.
5. **url mode is blind to external stylesheets** (found in live E2E vs ravenmcp.ai): taste detectors scan the rendered DOM string, so gradients/glows in external `.css` files (the Next.js port) are invisible — only inline `<style>`/style attributes are judged. Follow-up: fetch/inline stylesheets during capture before judging.
6. ~~Suppression scope over-broad~~ **FIXED post-review** (protocol E2E caught it): an accept precedent used to suppress when `wrong` appeared anywhere in the target page, silencing *different* violations of the same rule. Now evidence-scoped only — an accept suppresses the specific flagged pattern, never siblings. Regression test added (367 total).

## Codex pass (final) — objections + dispositions

A report-only Codex devil's-advocate pass ran on the complete diff (`git diff --stat` checked before reading its output; no stray edits). It raised **5 must-fix + 2 notes**; all were resolved, then a second Codex pass confirmed each fix:

| # | Objection | Disposition |
|---|-----------|-------------|
| 1 | `create_taste_profile` MCP schema allows minimal corpus records but `validateCorpusRecord` required `severity`/`id`/`labeled_at` → seeding via the tool always threw | **FIXED** — `createTasteProfile` now fills `severity: ""`, positional `id: rec_%04d`, `labeled_at: now` for seed records; round-trip + seeded-suppression test added. Codex re-verify: CONFIRMED-FIXED, no id collision with `labelFinding`'s scheme |
| 2 | Rule `owner` schema-optional but implementation-required → schema-valid rule without owner threw | **FIXED** — `validateRule` defaults missing owner to `"taste"` (also heals older stored profiles); test added. CONFIRMED-FIXED |
| 3 | `audit_taste` wrapper accepted html+text+url combos, silently ignoring/overwriting | **FIXED** — enforces exactly one of html/text/url; empty-string `url` normalized to undefined (Codex's follow-up edge). CONFIRMED-FIXED |
| 4 | URL mode had no clean capture-failure path (threw raw instead of the standard chromium guidance) | **FIXED** — try/catch returns the standard `CaptureUnavailableError` message, matching the other URL tools. CONFIRMED-FIXED |
| 5 | `hasGlowColor` treated ANY word (`px`, `inset`) as a color → colorless large-blur shadows misflagged | **FIXED** — now requires an explicit color (hex / rgb() / hsl() / named CSS chromatic incl. prefixed forms like `rebeccapurple`, `darkorange`); colorless/`var()`/`currentColor` shadows are silent (prefer-silence). Tests added both ways. CONFIRMED-FIXED; smoke re-run identical (no findings lost — all real site glows carry explicit rgba) |
| 6 (note) | Codex's own `npm test` showed 15 failures | Environment-only: its sandbox denies `mkdtemp` under `/var/folders`; local runs are 366/366. Not a code defect |
| 7 (note) | Test file skips all taste tests if `dist/taste.js` missing | Matches the repo's existing convention exactly (`page-checks.test.mjs` has the identical skip + `process.exit(0)` pattern). Consistent, not a defect |

Post-fix gates re-run: build green, **366/366 tests**, server boots with 65 tools / 0 dupes, smoke identical (47 findings, BLOCK, suppression loop works).
