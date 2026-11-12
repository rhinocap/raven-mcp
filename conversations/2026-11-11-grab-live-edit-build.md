# Grab live style editing: build log (2026-11-11)

Goal: `conversations/2026-11-11-grab-live-edit-build-goal.md` in the main checkout. Contract: `docs/spec-grab-live-style-editing.md`.
Worktree `~/projects/raven-mcp-live-edit`, branch `grab-live-style-editing`, base 8d7c4f5. No push, merge, release or publish.

## Fan-out charter

Fan-out runs as shell legs with a ledger (`run-leg.sh`), not a Workflow script.

- Dry: two consecutive falsify rounds in which every lens ran and returned nothing new.
- Out of scope: bridge, payload, MCP tools, `STYLE_CATEGORIES`, everything under the spec's "Not in this change", WebKit, push, merge, release, publish.
- Falsifiers: each lens cites the lines it read; a finding without a line reference is not accepted.
- Consumer: the integrating session verifies each finding in source, then fixes, accepts or defers it.
- Coverage floor: every editor in the spec inventory table and every `activeStyleEditorFlush` site.
- Delegates return text or one diff block. Every overlay edit is applied, built and tested by the integrating session.

## Decisions

a. Single-value `padding` and `margin` shorthand rows measure a % base through their `-left` longhand. The spec says to measure only longhands; this is the narrowest reading that makes a measured conversion reachable in the generic editor in phase 1 (test 20: 13px in a 520px parent reads 2.5%).
b. Test 10 uses `gap` on `#row`. Its kill mutation removes the px guard on the base.
c. Test 20's kill mutation targets the shared `suppressStyleTransitions`, which the before/after check uses.
d. A refused unit change reports through `setGlobalActionStatus(message, "error")`.
e. Kill runs set both `RAVEN_GRAB_ASSET_PATH` (real Chromium, served by the bridge) and `RAVEN_GRAB_TEST_OVERLAY` (fake-DOM suite).
f. Sol and falsify passes run in a no-git snapshot with a report-only brief; the snapshot is refreshed after each applied phase.
g. Fan-out stays as shell legs; this charter stands in for the workflow contract.

## Baseline (before any overlay edit)

Real Chromium on `test/fixtures/grab-live-edit.html`: open `#copy` line-height (26, px), type 30: computed stays 26px. Choose `%`: the editor closes, the row reads `30%`, computed line-height 5.4px. This is the reported bug.

Fixture facts: `#hoverable` has hover rows font-size 36px and line-height 26px; `#row` gap 16px, width 500px; `#item-a` width 242px; `#pad` padding 13px; `#timed` transition-duration reads `0.2s`; `top` has no row.

## Leg ledger

| Leg | Pool | Model | Result | Cost (USD) |
| --- | --- | --- | --- | --- |
| p1-inventory-local | codexlocal | qwen3-coder-32k | failed: "does not support thinking" | 0 |
| p1-wire-local | codexlocal | qwen3-coder-32k | failed: same | 0 |
| p1-helpA-kimi | ow | moonshotai/kimi-k3 | draft | 0.0332 |
| p1-helpB-kimi | ow | moonshotai/kimi-k3 | draft | 0.0140 |
| p1-classify-qwen | qwen | qwen3.8:27b-mlx | 2 close-on-change sites (grab-bridge 5601, 11251) | 0 |
| p1-helpA-glm | ow | z-ai/glm-5.2 | draft | 0.0285 |
| p1-wire-kimi | ow | moonshotai/kimi-k3 | draft | 0.0582 |
| p1-helpB-glm | ow | z-ai/glm-5.2 | draft | 0.0844 |
| p1-wire-glm | ow | z-ai/glm-5.2 | 224 bytes, no usable diff | 0.1633 |
| p1-wire-sol | codex | gpt-6.1-sol | running at checkpoint | n/a |

## Decisions added during phase 1

h. A refused unit change writes the status line one tick later. The unit select's change event bubbles to the panel handler, which calls syncSendButtonDisabled and mountGlobalActions and re-renders the status node empty; a synchronous message is erased.
i. Focus returns to the number field after a refusal and after a unit switch with nothing to convert. Enter and Escape on the unit select are phase 2.
j. The before/after check is skipped for time properties, state rows and a zero value.

## Phase 1 state (after compaction, 2026-11-11)

- Overlay edit applied by the integrating session and mirrored; cmp silent; node --check passes.
- New: styleUnitDecimals, formatConvertedStyleNumber, suppressStyleTransitions, measureStylePercentBase, styleChPx, stateRowFontSizePx, styleUnitPx; in beginStyleEdit: previewCurrent on input, handleUnitChange on the unit select, refuseUnitChange, the session anchor.
- test/grab-overlay-live-edit.test.mjs: 14 tests (T1, T2, T3, T4, T4b, T5, T10, T10c, T14, T19, T19b, T19c, T20, T21), 14 pass on the real overlay.
- Kill-proofs: 12 mutants, 12 killed (kill.py in the session scratchpad). Each expected test fails on its mutant: unit change commits (T1, T4, T14, T19); no anchor (T4); no input preview (T5); non-px base usable (T10); time factor (T14); resting font size for a state row (T19, T19b); transition shorthand (T20); before read outside the suppression (T21); status not deferred (T10); refusal keeps the unit (T10); no focus return (T1); 3-decimal rounding (T1).
- Wiring drafts: Kimi k3 and Sol complete; GLM returned nothing twice (all tokens spent on reasoning, 24000 then 40000); local Codex cannot drive tools with qwen3-coder-32k (returns a malformed tool call as text). Kimi k3.1-pro and luna drafts requested after the fact for comparison.
- Local pool: codex-local failed on every agentic leg; the local pool runs through qwen-local text with inline context.

## Phase 1 review (second checkpoint, 2026-11-11)

- Falsify finding (Kimi, state lens), verified in source and fixed: on a state row whose font-size has no px answer, `ch` fell back to the resting font size. styleUnitPx now refuses ch there, as it does em. Test T19d; mutant k19d killed.
- test/grab-overlay-live-edit.test.mjs: 18 tests. Added T19d, T5b (intermediate values, incomplete expression, empty field), T1b (expression then unit change), T4c (empty field then unit change). T1, T14, T19 and T21 now assert the inline declaration or the state preview rule text.
- Kill matrix: 17 mutants, 17 killed.
- npm test (run while legs were running): tests 2098, pass 2094, fail 1, skipped 3. The failure is test/motion-session.test.mjs "POST /send refusals" with write ECONNRESET; the file passed 16/16 alone three times. Rerun the suite with no legs running before the commit.
- Wiring drafts: four usable (Kimi k3, Sol, Kimi k3.1-pro, luna). GLM returned empty content twice; local Codex cannot drive tools.
- Falsify round 1: state (Kimi) one P1, fixed. Held preview (luna), multi-select (luna), maths (Kimi), measuring (GLM): nothing new. Tests (Sol): P3 gaps, closed except the "refused after a measurement" leg of T20, deferred to phase 3 with test 10b. Maths (GLM): empty. Single controls (Sol): one P1 claim, mixed-priority inline padding lost on Escape; under verification. Style contract (local): not run.
- Local pool: qwen-local text is refused by its memory guard while another process holds 18.6 GB. That process is not this session's and was left alone.
- GLM returns empty content on prompts of about 14k tokens; it answers prompts of about 5k tokens.
- Ledger of record: ledger.tsv in the session scratchpad; the totals go in the handoff.

## Phase 1 review (third checkpoint, 2026-11-11)

- Sol single-controls finding (round 1), verified and fixed: an inline shorthand whose longhands differ in priority (padding-top !important beside three plain sides) reads "" and Escape removed all four sides. captureStyleOriginals records the set longhands (captureInlineLonghands); the restore writes them back (restoreInlineLonghands). Test T20b on fixture `#mixed`.
- Sol gate round 1, one P1, verified and fixed: the same loss on a component-scope sibling ("All siblings"). applyStyleToScopeSiblings records the longhands; both sibling restore functions write them back. Test T20c on fixtures `#card-a` and `#card-b`.
- Not changed: the stroke snapshot (copyStrokeRecord) and the post-send rebase capture do not record longhands. Both run after a commit, when the shorthand is set.
- Sol tests lens (round 2), P3, all closed: T2 compares the whole payload; T19 matches the preview rule with its selector and state; T20 compares the whole inline style; T1b previews a value different from the opening one (24+4, 155.56%). Added T5c (a number the property rejects keeps the last valid preview) and T4d (an unparseable field switches the unit with no preview).
- test/grab-overlay-live-edit.test.mjs: 22 tests, 22 pass. Kill matrix: 21 mutants, 21 killed.
- Falsify round 2: single (Sol), maths (Kimi), multi (luna), contract (local qwen), measuring (GLM): nothing new. Held preview (luna): one claim, rejected. Send during an in-flight dispatch does flush: renderPanel defers while an editor is open, the queued send re-enters dispatchPendingBatch when idle, and a press on Send blurs the field first. State (Kimi k3): empty, hit the token limit. Tests (Sol): the P3 list above. Round 2 was not dry.
- Falsify round 3 and Sol gate round 2 launched on snapshot snap3 (log f3-panel.log in the scratchpad).
- Local pool: qwen-local text works when memory is free; codex-local still cannot drive tools.

## Phase 2 design (built on a scratch copy, not yet in the worktree)

The wiring is a replacement script, `p2/patch.py` in the session scratchpad, applied to a scratch overlay and tested through RAVEN_GRAB_ASSET_PATH and RAVEN_GRAB_TEST_OVERLAY. It goes into the worktree after the phase 1 commit.

- Drafts: full wiring from Kimi k3, Kimi k3.1-pro, Sol and luna; the listener alone from GLM, Kimi k3 and local qwen. Sol's draft and the integrated one agree on structure. No draft handled the press-ordering problem below.
- `openStyleEditor = { editor, row, commit }`, set by `registerOpenStyleEditor(editor, commit)` at all eight `activeStyleEditorFlush = commit` sites. The row is the editor's parent node (the cell, for a box-model field). The record is live while `activeStyleEditorFlush === openStyleEditor.commit` and the editor is connected; it is dropped lazily, so no `activeStyleEditorFlush = null` line changes.
- One window listener set (`wireStyleEditorOutsidePress`), shared with the token-linked dismiss. Linked close is unchanged and synchronous.
- k. The outside-press commit runs one tick after the press, not inside the capture-phase listener. A commit in the capture phase re-renders the panel and removes the pressed control before its own handler runs: two box-model tests failed on it ("with a field open, clicking the next number...", "...a drag on the next number scrubs it"). One tick later, the pressed control's handler and the blur commit have run in today's order, and the deferred commit covers the case where no blur comes. This departs from the letter of spec section 2 ("calls commit()").
- l. commitStyleEdit: when a shorthand replaces side edits, the shorthand's preview is undone before the untouched sides are read. A text preview (new in phase 2) otherwise sent `20px 14px 20px 20px` as the old value instead of `14px`. Two existing box-model tests catch it.
- m. The easing canvas is hidden with `data-hidden="true"` and a CSS rule; `resyncEasing` is a function-scope var, a no-op for the plain-text control.
- n. Box shadow: a picked preset's own string is committed while no control changed after the pick (`presetValue`).
- The outside-press commit is skipped when the event has no `composedPath` (the fake DOM cannot say where the press landed).
- Scratch result: every Grab test file, 717 tests, 15 failures before k and l. Eight are tests the spec lists (three grab-bridge colour tests, three easing drag tests, two spring tests). Three are grab-overlay-queue-draft tests whose `editBoxShadow` helper waits for a preset click to close the editor; it needs an Enter. Four were the box-model tests fixed by k and l.

## Phase 1 review (fourth checkpoint, 2026-11-11)

- Falsify round 3: single (luna), maths (GLM), state (Kimi k3.1-pro), multi (luna), contract (local qwen), measuring (Kimi): nothing new. Tests (luna): no defects. Sol gate round 2: no P1 or P2. Two Sol lens P1s, both verified and fixed (`fix-r3.py` in the scratchpad):
  - Held preview: a preview held on a multi-selection survived the primary's removal, and typing then wrote to the promoted layer. `orderedSelection` undoes the held page writes when the primary detaches with no draft; `previewStyleEdit` writes nothing when reading the targets changed the primary. Test T22.
  - State rows: ch inside font-size was measured in the element's own font. `styleUnitPx` uses the parent's font for font-size, as em does (decision r). Test T19e.
  - luna note: no test stepped with an arrow key before converting. Test T4e.
- test/grab-overlay-live-edit.test.mjs: 25 tests, 25 pass. Kill matrix: 25 mutants; the 5 new or re-anchored ones were run after the fix and killed, the other 20 are to be rerun.
- Every Grab test file on the worktree overlay: tests 720, pass 718, fail 0, skipped 2.
- Falsify round 4 (snapshot snap4): measuring (GLM), state (Kimi k3.1-pro), contract (local qwen), multi (Sol), single (Sol): nothing new. Tests (luna): no defects; notes that rem/vw/vh/mm/cm/in are not all exercised and T4 does not read the computed value at each intermediate unit.
- Sol gate round 3 (the last of three allowed), one P1, verified in source, fix in progress: after the primary is removed and another layer promoted, ArrowUp in the still-open number field calls `previewValue` directly and previews on the promoted layer; Escape then skips the restore.
- Sol state lens, P2, verified, fix planned: a hover or focus rule that changes the font face makes a state-row ch conversion wrong, because `styleChPx` measures in the resting font.
- Sol held-preview lens, P2, source supports it, decision open: `finishActiveDispatch` rebases every draft, including the active one, so a preview held in an open editor on a draft that already has a committed edit is dropped from the page while the field still shows it.
- Kimi maths lens, three P2 claims:
  - Word-spacing % is based on the space advance, not the font size: rejected. Measured in Chromium, `word-spacing: 25%` on 16px text adds 4px per space, the same as `4px`; `letter-spacing: 25%` likewise. The spec table stands.
  - `measureStylePercentBase` under a `max-width` clamp: not yet adjudicated.
  - `in` at three decimals turns 1px into 0.01in: not yet adjudicated.
- Sol gate for phase 1 has used 3 of 3 rounds. The P1 is fixed and reported; the phase 2 Sol pass covers the area again.
- Decisions added: o. the open-editor outside-press path is skipped when `composedPath` is unavailable; p. longhand capture is not applied to the stroke snapshot and the rebase capture; q. Enter after the primary of a multi-selection is removed records the edit against the promoted layer (unchanged behaviour); r. ch in font-size uses the parent's font.

## Phase 1 review (fifth checkpoint, 2026-11-11)

Fixes after round 4 (`fix-r4.py` in the scratchpad), mirrored, `cmp` silent:

- Sol gate round 3 P1: `previewValue` writes nothing when the editor's layer is not the selected one or the field is detached, so an arrow step cannot reach a promoted layer. Test T22 (arrow step added).
- Sol state lens P2: `stateRowFontFaceChanged` is true when the state's rule or a state edit sets a font-face property; `styleUnitPx` then refuses ch on that row (font-size still uses the parent's font). Fixture element `#hover-face`, test T19f.
- Sol held-preview lens P2: `rebaseNextDrafts` calls the open editor's `commit.repreview`, which writes the last previewed value again. Test T23 calls `rebaseNextDrafts` through the harness `expose` option.
- Kimi maths claims, all three rejected: percentage word-spacing is based on the font size in Chromium (measured); three decimals for `in` is the spec's rounding rule; a max-width clamp on a measured base ends in a refusal, which is the specified outcome. The clamp case is worth a test in phase 3 with the Size editor.
- test/grab-overlay-live-edit.test.mjs: 27 tests, 27 pass. Kill matrix: 28 mutants (`kill/p1-run4.log`).
- Falsify round 5 launched on snapshot snap5 (`f5-panel.log`): single (luna), maths (Kimi k3.1-pro), held preview (Sol), state (Sol and Kimi k3), multi (luna), contract (local qwen), measuring (GLM), tests (luna). No further Sol gate round for phase 1: 3 of 3 used.
- Decision s. `commit.repreview` is a property on the flush function, so it is cleared wherever `activeStyleEditorFlush` is cleared. Phase 2 editors can set the same property.

## Phase 2 scratch status

- `p2/patch.py` regenerated against the overlay after `fix-r3.py`; every anchor still unique. Snapshot `snap-p2`.
- Every Grab test file on the scratch overlay: tests 720, pass 706, fail 12, skipped 2. Eleven are tests that need the update the spec lists: three grab-bridge colour tests, three easing drag tests, two spring preset tests, three queue-draft tests through the `editBoxShadow` helper (it needs Enter after the preset click). The twelfth, "Retry keeps the element label the designer saw when it was sent" (grab-overlay-change-rows), passed alone 3 of 3; ten legs were running. Recheck on an idle machine.
- Draft legs returned (legs/ in the scratchpad): `p2-test-g1..g4-{glm,kimi}` (tests 6, 13, 15; 7, 8; 9, 18; 16, 17) and `p2-rw-{bridge,easing,spring}-luna` (rewrites of the failing tests). Not yet read.

## Next

1. Phase 1 close: stale-editor guard in `previewValue` with a T22 extension and a mutant; state-row ch refusal when the state changes the font face (T19f, fixture element, mutant); decide the rebase finding; adjudicate the two remaining maths claims. Mirror, `cmp`, `node --check`, the live-edit file, the full kill matrix (`kill/kill.py p1-mutants.py`).
2. Falsify round 5 on a fresh snapshot with the seen list. Two consecutive dry rounds close the panel; otherwise record what is open.
3. With no legs running: `RAVEN_NO_USAGE_LOG=1 npm test`, read the summary line, `cmp` the mirror, `git commit --only` the seven phase 1 paths.
4. Phase 2: apply `p2/patch.py` to the worktree, mirror, integrate tests 6-9, 13, 15-18 with kill-proofs, apply the luna rewrites and the `editBoxShadow` helper change, rerun the easing mutant matrix, falsify panel, Sol pass, npm test, commit.
5. Phase 3: Size and Stroke conversion, unit filter, typed unit, unitless line-height; tests 10b, 11, 12 and the deferred T20 leg.
6. Final: real-Chromium capture of 144.44 and %, the four manual pointer checks, design-judge, done-gate, handoff with a Raven Grab bridge URL.

## Sixth checkpoint (after falsify round 5)

Round 5 ran nine lenses on the snapshot taken after fix-r4. Results:

| Lens | Model | Result |
|---|---|---|
| single controls | gpt-6-luna | nothing new |
| conversion maths | kimi-k3.1-pro | P1: 0.4ms to s showed and committed `0s`. Fixed (fix-r5) |
| held preview | gpt-6.1-sol | still running when this was written |
| state rows | gpt-6.1-sol | P1: a hover rule's `font` shorthand was ignored as the em base. Fixed (fix-r6) |
| state rows | kimi-k3 | P2 rejected: the unit select is `disabled` on a token-linked row (`setStyleEditorTokenLinked`), so the silent revert cannot be reached |
| multi-select | gpt-6-luna | nothing new |
| contract and mirror | qwen3-coder-32k | nothing new |
| measuring | glm-5.2 | nothing new |
| tests | gpt-6-luna | no defects. Notes: T20 does not exercise a refusal after a measurement (phase 3), T21 does not assert the immediate `before` read |

Fixes:

- fix-r5: `handleUnitChange` refuses when a value that is not zero would read 0 in the new unit. Test T14b (`#timed` 0.4ms to s). Mutant `k14b-nonzero-rounds-to-zero` killed.
- fix-r6: `stateRowFontSizePx` reads the size inside a state rule's `font` shorthand (and inside a session edit to `font`) through a detached element's style. A shorthand with no readable size gives no base, so em and % are refused. Chromium probe before the fix: `p:hover { font: 24px serif; margin-top: 20px }` on 18px text converted 20px to 1.111em; after, 0.833em. Test T19g on new fixture element `#hover-short`. Mutant `k19g-font-shorthand-size-ignored` killed.
- T10 and T14 read the refusal status one tick after the change event (50 ms wait). T10 failed once under load without it. Mutants `k-status-not-deferred` and `k-refusal-keeps-unit` still killed.

State: 29 tests in `test/grab-overlay-live-edit.test.mjs`, 29 pass. 30 mutants in the scratch list; 28 killed in the last full run, plus k14b and k19g killed separately. Mirror identical. Nothing committed yet.

Decision t: a value that is not zero and would format to 0 in the target unit is refused.
Decision u: a state row's em base comes from the state rule's `font-size`, else the size in its `font` shorthand, else the resting size.

Next:

1. Read the held-preview Sol lens when it reports; verify in source.
2. Round 6 on a fresh snapshot with fix-r5 and fix-r6 in the seen list. The panel has not had two dry rounds; rounds 2 to 5 each found something.
3. With no legs running: `RAVEN_NO_USAGE_LOG=1 npm test`, read the summary line, `cmp` the mirror, update the commit message draft (29 tests, zero-rounding and font-shorthand bullets), `git commit --only` the seven phase 1 paths.
4. Phase 2 from the scratch patch script, re-anchored on the overlay after fix-r6.

## Seventh checkpoint (after falsify round 6)

The held-preview Sol lens of round 5 reported after the sixth checkpoint: with two layers selected and an image upload pending, the page removing the primary kept the draft for its attachment and left the open editor's preview on the layer that stayed. Reproduced in Chromium (`#copy` kept `line-height: 30px` after Escape). Fixed (fix-r7) in `orderedSelection`: before that draft is stored, a property with no recorded edit goes back to its original and one with a recorded edit goes back to the recorded value. Tests T22c and T22d. Mutants `k22c-held-preview-kept-with-attachment-draft` and `k22d-recorded-value-not-rewritten` killed.

Round 6, nine lenses on the snapshot after fix-r7:

| Lens | Model | Result |
|---|---|---|
| single controls | gpt-6-luna | nothing new |
| conversion maths | kimi-k3.1-pro | P1 rejected: says typing after a conversion keeps the old anchor. The `input` listener sets `unitAnchor = null` before `previewCurrent`; test T4b covers it. The excerpt the model read did not include that listener |
| held preview | gpt-6.1-sol | P2: with nothing else pending, Send stays disabled while the editor holds a converted value, so Send cannot flush it. Before this change a unit pick committed and enabled Send. Fixed (fix-r9) |
| state rows | gpt-6.1-sol | P1: hover `font-size` then hover `font` edited in one session; em used the `font-size` edit although the later `font` edit sets the size. Fixed (fix-r8) |
| state rows | kimi-k3 | P1 rejected: same anchor claim as the maths lens |
| multi-select | gpt-6.1-sol | nothing new |
| contract and mirror | qwen3-coder-32k | nothing new |
| measuring | glm-5.2 | nothing new |
| tests | gpt-6-luna | P3, already deferred: no test for a refusal that follows a measurement (phase 3) |

fix-r8: `stateRowFontSizePx` walks `stateStyleEdits` in key order, the order `renderStatePreviewStyles` injects them (each `!important`), so the later of `font-size` and `font` sets the base. Chromium probe before the fix: 20px margin read 1em with the hover size at 40px; after, 0.5em. Test T19h on new fixture element `#hover-both`. Mutant `k19h-font-size-edit-always-wins` killed.

State after fix-r8: 32 tests, 32 pass. 33 mutants; the full run before fix-r8 killed 32 of 32, and k19h and k19g were killed after it. Mirror identical.

The panel has not had two dry rounds. Rounds 2 to 6 each found one or more defects; the last three came from the Sol lenses on held previews and state rows, each further from common use (a pending upload during a page-side removal; two hover rules with two session edits). Phase 1 is committed now and rounds continue against the branch, with fixes as follow-up commits.

fix-r9 (Send while a value is held). Chromium probe before the fix: after choosing %, Send was disabled; a press on it blurred the field, which committed and enabled Send; a second press sent. The base overlay sent on one press after a unit pick, and `handlePanelMouseDown` has a guard written for an earlier "had to click Send twice" bug. Fix: the generic editor reports `commit.holdsChange` (an accepted preview that differs from the opening value); `batchUiState` enables Send for it; `syncSendEnabledInPlace` sets `disabled` on the existing button so no press lands on a replaced node. Send then flushes the editor as before. After the fix one press sends `line-height 26px to 144.44%`. Tests T24 and T24b. Five mutants killed.

Decisions:
- v. A held preview is undone before a draft kept for its attachments is stored: a property with no recorded edit returns to its original, a recorded one to its recorded value.
- w. The later of the session edits to `font-size` and `font` sets a state row's em base.
- x. Send is enabled while the generic editor holds a changed value. The label stays "Send to agent" until the edit is recorded; the change tray still shows the edit at commit (spec "Not in this change"). Phase 2 gives the other editors the same `holdsChange`.

State after fix-r9: 34 tests, 34 pass. 38 mutants.

Phase 1 close: `RAVEN_NO_USAGE_LOG=1 npm test` on an idle machine: tests 2118, pass 2115, fail 0, skipped 3. Mutant matrix 38 of 38 killed. `cmp` silent. No added overlay line breaks the style contract.
