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
- Hardening pass (stop-hook mandated, all DONE via Codex gpt-5.6-sol legs A+B + main-loop fixes):
  - ✓ Comment-preserving DESIGN.md updates (line-based surgical frontmatter edits, validate-before-write)
  - ✓ Cascade precedence in overlay token matching (specificity + source-order + !important + inline)
  - ✓ Type-safe dropdown grouping incl. property-first typography paths; intents carry full token paths (oldTokenPath/newTokenPath — E2E verified in grabbed.json)
  - ✓ Capability token for bridge (?key= on script tag; 403 without — curl-verified)
  - ✓ Official typography CSS-var namespace (--font/-text/-font-weight/-leading/-tracking)
  - ✓ README "Click-to-change (grab) + DESIGN.md" section (dual-customer pass done)
  - ✓ Regression found+fixed in leg B's declarationsFor: cssText fallback only ran when style.length===0, dropping var() shorthands in mixed rules ("No design tokens matched") — now always merges cssText declarations missed by indexed iteration; full live E2E re-verified eyes-on (match → typed swap → live preview → send → full-path intents)
  - Suite 547/547; tsc clean
- Pending (carried forward):
  - Branch isolation: feature commits sit on explore/tools-redesign with unrelated web redesign — other instance is separating; do NOT push from here
  - Panel nit: token header shows `md`, not `rounded.md` (dropdown/group context makes it unambiguous)
  - ✓ Proxy mode (zero-paste): start_grab_session proxy_target serves the dev server with the overlay auto-injected into every HTML response — live E2E on clean HTML (no script tag in source): pill present, click → tokens → swap → send → full-path intents. Suite 554/554.
  - ✓ Inline computed-style editing (/goal, Codex gpt-5.6-sol): click value → prefilled input → Enter commits via style.setProperty (live preview), CSS.supports validation, Escape cancels, styleEdits in POST /grab + bridge schema. Live E2E eyes-on: padding 12px 24px → 20px 48px, button visibly grew, edited row cyan-highlighted.
  - ✓ Overlay restyled to ravenmcp.ai site language (Codex leg from extracted style spec): dark glass panel #212129, JetBrains Mono technical text, cyan #00BFFF accents, glass pill w/ glow dot, 44px targets, #FF4060 errors. CSS-only — behavior/DOM/protocol unchanged. Live E2E verified.
  - ✓ Figma deliverable: https://www.figma.com/design/0fOhyQa7yxDkx7j8ZCCAuO — Grab Panel component + Grab Pill variants (default/hover), full auto-layout, "Grab Overlay Tokens" variable collection (colors/spacing/radii) bound to fills/strokes.
  - ✓ Grab-receipt agent protocol: get_grabbed_elements appends agent_protocol when count>0 (summarize changes, ask "write a goal or wait for direction", never implement unasked); server instructions updated to drain during active sessions. Suite 557/557.
  - ✓ DA pass on inline editing (gpt-5.6-sol) found 4 P2s — all fixed by dedicated Codex leg: original-inline-value capture + rollback on dismiss/new selection, revert restores prior inline declaration, invalid CSS preserves displayed value + #FF4060 flash, keyboard/ARIA/hover affordance on editable values. 3 VM regression tests added. Suite 560/560 local. Eyes-on re-verified in Chrome: invalid `banana!!` → red flash, value stays `12px 24px`; valid `30px 80px` → button grew; dismiss → button reverted (no stray inline override).
  - NOTE: running raven session serves pre-inline-edit dist — styleEdits absent from live drains until rebuild+reconnect (tests cover new round trip).

### Panel v2 + Playground + send-morph (/goal round 2, this session)
**What:**
- Panel v2 per Figma 3-136 (docs/grab-panel-v2-spec.md): tabbed Design | Request Component, #212129 glass, JBMono/cyan, collapsible DESIGN TOKENS + COMPUTED STYLES sections (collapsed by default, caret, grid-rows animation), scrollable body with pinned header/tabs + footer CTA, element chip hover-tooltip + click-copies-selector, centered arm pill.
- Request Component triage loop: issue type/size selects + use-case textarea → email step ("EMAIL YOURSELF THE COMPONENT") → componentRequest {issueType,issueSize,useCase,email} through bridge schema + drains (VM tests).
- Playground page web/app/playground/page.tsx (ravenmcp.ai style) + /api/component-request (Resend, both-emails triage packet + generated component spec, 5/min/IP rate limit, 503 JSON without RESEND_API_KEY). Standalone overlay mode (config tokens, grabEndpoint:null → "Would send…" summary).
- Send-button morph (Figma 6-626), Codex gpt-5.6-sol leg: CTA → 44px outlined ✓ circle → "✓ Sent to agent"/"Email sent" outlined pill → back to ✓ → restored, ~250ms steps, reduced-motion honored, aria-busy/live, failure path unmorphed. Eyes-on verified via Playwright captures (all 3 states, text unclipped).
**Bugs found + fixed during E2E:**
- Standalone token match failure: config tokens normalized to --colors-* but demo card uses --demo-* → pass explicit cssVar per token in playground config.
- Token swap preview invisible: preview set var on documentElement, masked by component-local --demo-* definition → preview now sets inline var on the SELECTED element (previewOriginals store target for rollback).
- Sent-pill clipped ("Sent to a…"): --raven-grab-sent-width measured from button.scrollWidth while 44px wide → offscreen max-content probe clone.
- "1 token changes" pluralization.
- Chrome-MCP note: occluded tab freezes CSS transitions (currentTime stuck 0) — computed-style/visual timing checks unreliable there; Playwright headless is the eyes-on path. Shadow root flipped closed→open to enable programmatic verification.
**Verify:** npm test 568/568 (was 566; +morph VM tests); playground E2E eyes-on (grab → 4 matched tokens → swap visibly white → Would send summary → morph; Request Component → email → 503 JSON graceful "Try again"). Stale stash bqriu207z dropped (superseded).
**Pending:** DA pass (b54cfseoe) disposition; commit (pathspec, NO push — branch shared with web redesign); Vercel preview of web/ + RESEND_API_KEY into web project env (Andrew, not in chat); /mcp reconnect for componentRequest in live drains.
