# Session: 2026-07-10 — F2+F3 templates & layers (branch `f23-templates-layers`)

## Where we left off
`/goal`: implement Features 2+3 (rung 2) of `docs/feasibility-ds-diff-templates-layers.md` on top of `origin/grab-multi-select`.

## This session
### F2 — Template tab + page-scoped DESIGN.md templates
**What:** Grab overlay Template tab: mark selected elements fixed/flexible, slot-ID inputs, one batched `updateDesignMd` write per save to `templates.<id>.pages.<encoded-page>.slots`; `get_page_template` revalidates every slot selector and flags orphans. Drafts survive rerenders via `captureTemplateDrafts` chained into `capturePanelDrafts`.
**Why:** DESIGN.md-persisted template annotations, never AST/page markup.

### F3 — Layers tab + clone-measured wireframe preview + intent queue
**What:** `buildLayerTree()` DOM tree as rows (shadow/iframe badges, overlay host excluded), HTML5 drag reorder-as-intent (live page never mutated), cloneNode-into-hidden-container measured preview drawn as scaled wireframe boxes, `preview approximate` badge for non-flow layouts, same-parent-only rejection, intents POST `/layers-intent` → GrabOperation state machine proposed→previewed→applied/rejected.

### Bridge + tools
6 new stdio-only tools (in `REMOTE_GATED_TOOLS`; golden-45 remote hash untouched): get_page_template, set_template_slot, list_templates, get_grab_layers, move_grab_layer, get_grab_operation. New routes registered in `bridgeRoute` + `protectedRoute` (proxy mode does NOT forward them). stdio tool ledger 78→84 in two test files.

### Verification (all eyes-on in Chrome vs local harness :8936 proxy→:8935)
- npm test 592/592 ✓
- Template save → single batched write landed in scratch DESIGN.md ✓
- Markup rename → orphan badge in UI + `orphaned:true` server-side ✓
- Flex drag 1→3: wireframe box widths/positions pixel-match a real source-order edit (252/122/152/202 @ 0/264/398/562) ✓
- Cross-parent drag rejected with red "same-parent reorders only", no intent ✓
- Abs-positioned drag → "preview approximate" badge ✓
- Intent drained via harness, fixture edited per intent, reload matched preview first-try, op marked `applied` ✓
- Screenshots (cropped) in scratchpad `shots/` for PR body.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Homebrew node broke mid-session (simdutf dylib gone, likely parallel brew upgrade) | env | `brew reinstall simdutf` fixes; check before blaming code |
| Browser cached proxy HTML with stale capability key after harness restart → overlay 403 | procedure | cache-bust query param after bridge restart |
| Overlay F3 Codex leg died with helpers but no panel wiring | known | fresh direct `codex exec` wiring pass (house rule held) |

### Codex devil's-advocate disposition (report-only pass, no stray edits)
Fixed: save no longer wipes existing slots (merge into payload); moveGrabLayer now previews when measuredRects present (state machine unified with /layers-intent); intent schema validates distinct in-bounds indices; templateId charset + duplicate/`__proto__` slotId rejection; clone-preview flags approximate on pre-reorder rect drift vs live; fixed-role drags require a second drop (cooperative advisory); tool-description copy softened to "display labels only, not enforced". Honest partials (documented, not fixed): clone preview can still be inaccurate under ancestor-scoped selectors/container queries beyond the drift check; layer tree is element-children-only (text nodes/portals excluded by design).

## State at end of session
- Branch `f23-templates-layers`: committed + pushed, PR open — pending Andrew review
- F1 instance's test file rescued to `f1-ds-diff-mvp` (worktree pathspec commit) ✓
