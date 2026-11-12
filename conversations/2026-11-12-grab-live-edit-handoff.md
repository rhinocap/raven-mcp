# Grab live style editing: handoff (2026-11-12)

All three phases of `docs/spec-grab-live-style-editing.md` are committed on local branch `grab-live-style-editing` in `~/projects/raven-mcp-live-edit`. Nothing was pushed, merged, released or published.

Status: built and tested. Not clean: the last review fix has had no Sol pass (the three rounds were used), the phase 3 panel stopped at its six-round cap, and the four pointer checks are yours. Details below.

## Repeat the reported steps

1. Open the Raven Grab bridge URL given in the session reply (it serves `test/fixtures/grab-live-edit.html` through the bridge from this worktree; the port changes on restart: `cd ~/projects/raven-mcp-live-edit && node scripts/grab-dev.mjs grab-live-edit.html`).
2. Click the first paragraph (18px text on a 26px line).
3. Click the `line-height` value. The editor opens on `26` and `px`.
4. Choose `%`. The editor stays open and reads `144.44` and `%`.

What I saw in Chromium on that URL: editor open, `144.44`, `%`, inline `line-height: 144.44%`. The paragraph is not pixel-identical: Chromium computes a percentage line-height from the whole percent, so the line is 25.92px and the three-line paragraph is 77.77px tall against 78px (spec line 182 accepts this). Choosing `unitless` reads `1.444` and the paragraph is 77.95px.

## Commits

| Hash | Phase |
|---|---|
| `4c90831` | 1: typing previews live; a unit change converts the number |
| `e4cd044` | 2: every style control previews; an editor closes only on Enter, a press outside, Escape or a flush |
| `ee913a7` | 3: Size and Stroke unit selects convert; unit lists are filtered; a typed unit switches the select |

A fourth commit holds this file and the session log.

## Tests

- `RAVEN_NO_USAGE_LOG=1 npm test` on `ee913a7`: `tests 2229`, `pass 2226`, `fail 0`, `skipped 3`.
- `cmp browser/raven-grab.js web/public/raven-grab.js`: silent.
- Overlay style contract (`var` and `function` only in added lines): holds.
- New tests: 45 in `test/grab-overlay-live-edit.test.mjs`, 95 in `test/grab-overlay-live-edit-controls.test.mjs`, real Chromium. No WebKit was touched.
- Kill proof: 190 mutants (38 phase 1, 116 phase 2, 36 phase 3), each an overlay with one change reverted, each failing its named tests.

## Review record

| Phase | Falsify panel | Sol gate (gpt-6.1-sol, report-only) |
|---|---|---|
| 1 | not dry for two rounds | 3 of 3 rounds; its P1 fixed in round 3, not re-reviewed |
| 2 | ten rounds (the cap); rounds 9 and 10 raised no code defect | 3 of 3 rounds; round 3 no P1 or P2. Patches 13 and 14 came after it and were read in the phase 3 gate rounds 2 and 3, with no defect found |
| 3 | six rounds (the cap); rounds 5 and 6 each raised items, round 6 only a test gap | round 1 P1 fixed; round 2 no P1 or P2; round 3 one P2, fixed with test T12i and a killed mutant, not re-reviewed |

Design-judge on the captures (surface: product tool UI, global layer only, no project overlay; sibling: the same editor in its `px` state): no findings, PASS. The change adds no CSS literal, colour or type style. A PASS is a pre-check; you have not seen this UI yet.

Customer walkthrough. Solo indie dev: one click opens the editor, choosing a unit changes the number and nothing closes or jumps. Design-system team: the authored unit reaches the agent as chosen (T10j sends `95%`), and token-linked rows do not take a typed unit or a unit change. While a value is only held, Send and the Pending summary now count it ("Send 1 change", "1 being edited"), fixed 2026-11-12 on Andrew's call.

## Legs and cost

272 legs. Open weight $10.84. Codex 11,131,619 tokens.

| Pool and model | Legs | Cost | Failed or empty |
|---|---|---|---|
| Codex `gpt-6.1-sol` | 78 | 8,304,914 tokens | 0 |
| Codex `gpt-6-luna` | 47 | 2,826,705 tokens | 0 |
| ow `z-ai/glm-5.2` | 47 | $3.83 | 1 by return code; several more returned empty content at the token limit |
| ow `moonshotai/kimi-k3` | 42 | $5.71 | 1 |
| ow `moonshotai/kimi-k3.1-pro` | 30 | $1.30 | 0 |
| local `qwen3-coder-32k` (qwen-local) | 15 | $0 | 2 |
| local `qwen3.8:27b-mlx` | 6 | $0 | 2 |
| local `qwen3-coder-32k` (codex-local) | 7 | $0 | 5: it cannot drive tools |

## Open findings

### Yours to run (a real pointer in headed Chromium; synthetic events do not count)

1. Open the unit select's option list and pick a unit: the editor stays open and the number converts.
2. Open the option list and dismiss it with Escape, and with a press elsewhere in the editor: nothing commits.
3. Open the OS colour panel, drag in it, close it: the editor stays open with the preview.
4. With the colour panel closed, press on the page: the edit commits once.

### In this change, not fixed

- The fix for the phase 3 gate's round 3 P2 (a unit change on a field holding an unoffered unit such as `2q`) has a test and a killed mutant and no Sol pass.
- Fixed 2026-11-12: Send and the Pending summary count a held value (T65–T72).
- Send stays disabled for a held value while a dispatch is "applying".
- Send is enabled for a held invalid value, and the press then sends nothing. Its count now leaves the invalid value out (T67).
- A box-model field retyped to an equal number in another spelling enables Send, and the press sends nothing (P3). Its count now leaves that value out (T68).
- A held preview stays on the staying layer until the next action after the primary layer is removed.
- The outside-press commit is deferred one tick.
- A dispatch finishing while a structured editor's field holds an invalid value shows the recorded value until the next valid input (P3).
- Token detach does not flush another open editor.
- Stroke unit conversions to cm, mm, in or vw are refused at device pixel ratio 1 when the rounded value lands under a whole pixel.
- The Stroke group's `box-sizing: border-box` write can change bounds without the width check seeing it.
- Padding and margin `%` are measured through the `-left` longhand.
- Longhand capture is not applied to the Stroke snapshot and rebase paths.
- The shorthand old-value read has a transition edge.
- The easing canvas is hidden on unparseable text.
- The scrub `rollback` trusts the open-time record.
- `styleUnitChangeHolds` skips the undo if `apply()` throws after writing; no reachable throw was found (P3).
- `1e-322%` underflows in `convertStyleUnitNumber` (P3, rejected as not a value a person enters).
- The trial write is visible to a page MutationObserver (rejected: only the motion-marker observer exists).
- The native colour input has no blur commit, by the spec's design.
- Multi-select conversion uses the primary element's bases (spec line 180). A hover or focus row refuses a measured `%` base (spec line 177).
- Enter on a focused preset button activates it (accepted).

### Test gaps

- Inline `transition-property` restore case.
- The radius commit-failure rollback guard.
- The generic refusal-after-preview path has no direct test.
- The Stroke anchor reset in `loadControlsFromValues`.
- The Stroke empty-field `currentUnit = toUnit` has no killing test (the next valid input sets it).
- A right-side-only stroke has no unit-change test.
- An unparseable Size or Stroke field has no unit-switch test of its own (the empty field takes the same branch).
- Outside-press registration mutants for overflow, Size, radius, box-field and the generic editor were not added.
- T39 and T39c (real touch) do not kill their mutants deterministically; T39d and T39e do.
- T49 covers the mobile sheet tab only. T63 uses a dispatched press because the generic editor covers its row.
- T41 has a rare timing flake. The motion-session and Retry-label tests are load-sensitive; `npm test` was run with nothing else running.

### Present at 84b10bf, left alone

- The Stroke preview writes with no priority, so an inline `!important` border against an `!important` stylesheet `border-style: none` loses its border on any Stroke edit, a unit change included.
- The Stroke editor reloads its width field from the committed model on every input.
- A Stroke commit also sends `outline-width 3px → 0px` and unchanged style and colour entries. `restoreStrokeEditState` reorders stroke records.
- Stroke preview and Escape do not cover component-scope siblings. Stroke colour chips have no Escape or focus-out handler.
- A rebase sets `oldValue` to "" for a box-model side. A box-shadow record is never dropped by a rebase.
- The "Send to agent" label is stale after a text-decoration or box-shadow commit.
- Raven's own committed state edits read back as state declarations.
- A send clears the inline preview in the harness.
- A blur commit loses a tray-toggle click, and the same for the left dock. A token-linked editor is dismissed on pointerdown by a Send, tray-toggle or left-dock press and the click is lost.
- The easing handle drag clamps y to the drawn canvas.
- On a Mixed Size row an emptied number leaves the last preview until close.
- The generic colour format select rewrites the text only (spec "Unchanged").

### Process

- The Sol gates reviewed source only: they did not run tests or check scope and mirror parity. I checked those.
- GLM returned empty content on large prompts several times; Kimi did once at the token limit; the local qwen contract leg timed out twice in phase 3; codex-local could not run tool-driven legs.

## Next actions

1. Run the four pointer checks above on the bridge URL in your own Chrome.
2. Look at the editor at full size on the bridge URL; this is new UI behaviour you have not seen.
3. Decided 2026-11-12: the held-value Send label changes before merge. Done; Sol round 2 left 0 P1/P2.
4. If 1 to 3 are fine, approve a push of the branch and a PR against `main`. Pushing `main` deploys `mcp.ravenmcp.ai`, so the merge needs its own approval.
