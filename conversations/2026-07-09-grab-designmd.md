# Session: 2026-07-09 — react-grab + DESIGN.md into RavenMCP

## Where we left off
Fresh /goal: two-way click-to-change (grab overlay + token panel) + DESIGN.md as first-class design-system format.

## This session
### Grab + DESIGN.md feature (spec → implement → E2E verify)
**What:** `docs/grab-designmd-spec.md`; `browser/raven-grab.js` (vanilla overlay: hover/click, token panel w/ swap dropdowns + live preview, arm pill + Alt+G, POST /grab); `src/grab-bridge.ts` (loopback bridge: /raven-grab.js, /tokens, /grab); `src/designmd.ts` (subset YAML parse/serialize, flatten, init from blank/system/getdesign.md starter, surgical update); 6 MCP tools in `src/index.ts`, all REMOTE_GATED (anon remote stays 45); manifest + package.json files whitelist; tests (8 new; suite 539/539).
**Why:** /goal — Impeccable-class click-to-change, DESIGN.md ecosystem.
**Fixes during E2E:** (1) CSSOM pending-substitution — shorthands using var() expand to EMPTY longhands; tokenMapFor now parses declaration.cssText, not indexed longhands. (2) flattenDesignTokens skips top-level metadata scalars (version/name). (3) runner needed argv.
**E2E (eyes-on, Chrome):** click Buy now → panel matched `accent #e8315f` + `md 8px` → swapped to `primary · #315fe8` → button visibly turned blue (live preview) → Sent → bridge drained tokenIntents `{background, accent→primary}` → updateDesignMd applied `colors.cta: {colors.primary}`, body preserved.
**Pushed:** pending (commit after DA pass).

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Token matching shipped against indexed CSSOM longhands (empty under var()-shorthand) | assumption | Pending-substitution: parse cssText for var() detection |

## State at end of session
- Implementation + tests: ✓ 540/540
- Live E2E: ✓ full round trip verified (eyes-on live preview swap)
- DA pass (gpt-5.6-sol): ✓ ran; verdict ~65-70%. Fixed same-turn: composite-ref validation (getdesign.md starters), set/rename collision guards, react-grab listener ordering, stale reactMetadata, ref-token "[object Object]", bridge body/queue caps, shim-mode honesty. Regression test added.
- Committed: 9770926 on explore/tools-redesign (pathspec; web/ excluded). NOT pushed.
- Pending (carried forward):
  - Comment-preserving YAML serializer (update rewrites frontmatter; full-line comments dropped, inline comments mis-parsed)
  - Cascade precedence in overlay token matching (overridden rules reported as "used"); shadow-DOM composedPath targeting; cross-origin sheets
  - Type-safe dropdown grouping for composite typography; intents should carry full token paths
  - Capability token for bridge (currently wildcard CORS, loopback-only); Chrome Local Network Access permission guidance
  - Official typography CSS-var namespace (--font-button vs --typography-button-fontFamily)
  - README/public docs for the feature (indie-dev setup section)
  - Branch isolation: feature commit sits on explore/tools-redesign with unrelated web redesign — cherry-pick to clean branch before landing to main
  - Panel nit: token header shows `md`, not `rounded.md`
