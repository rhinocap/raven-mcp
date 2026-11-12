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

## Eighth checkpoint (before context compaction)

- Phase 1 committed as `4c90831` (7 files). `npm test`: tests 2118, pass 2115, fail 0, skipped 3. Mutants 38 of 38 killed.
- Falsify round 7 for phase 1 launched on a snapshot of `4c90831`: nine report-only legs (luna, Sol, Kimi, kimi-k3.1-pro, GLM, local qwen). Seen items include fix-r8 and fix-r9.
- Phase 2 wiring patch (a merge of the kimi, kimi-k3.1-pro, luna and Sol drafts) regenerated against the committed phase 1 overlay; passes `node --check`; not yet applied to the tree.
- Phase 2 additions planned on top of the patch: `commit.holdsChange` and the in-place Send sync for the text-decoration, box-shadow, overflow, size and box-field editors; the generic native colour preview routed through `previewValue`; `commit.repreview` where a held structured preview must survive `rebaseNextDrafts`.
- Next: apply the patch and additions, mirror, `cmp`; run `test/grab*.test.mjs` to list existing tests that fail; apply the luna rewrites by hand; add tests 6, 7, 8, 9, 13, 16, 17, 18 with one mutant each; phase 2 falsify panel; Sol gate; idle `npm test`; commit.

## Checkpoint 9 (phase 2 in progress, uncommitted)

- Phase 1 falsify round 7: five lenses reported nothing new. Kimi P1 (an earlier `font-size` wins over a later `font` in one rule) refuted by a CSSOM probe: the earlier declaration is dropped. Sol P2 (Send stays disabled after a dispatch finishes while a value is held) and Sol P1 (a rebase records a held hover preview as the declared value) confirmed in source; both fixed inside the phase 2 overlay. Luna listed three P3 assertion gaps (T3 row text after Escape, T14 commit and payload, T19c page preview).
- Phase 2 overlay is in the tree and its mirror. It is the phase 1 overlay plus three patch steps kept in the session scratchpad: the merged wiring diff (outside-press listener, picks preview only, Enter and Escape on selects and the colour input), the Send and rebase hooks for every structured editor (`holdStylePreview`), and three fixes (a press on Send is not an outside press; Send follows a dispatch while an editor is open; a rebase suspends a held state preview).
- Defect found by probe: a slow press on Send while an editor held a value sent nothing, because the deferred outside-press commit replaced the button between press and release. Fixed by exempting `[data-send-batch]` from the outside press. Needs its own test (a fast click does not catch it).
- Existing tests: 11 expected failures after the overlay. grab-bridge (3) and easing (3) rewritten and passing. Spring (2) and queue-draft (3) remain.
- New tests to write: T6, T7, T8, T13, T16, T17, T24c, T25 to T29 in `test/grab-overlay-live-edit.test.mjs`; T9 in the easing file; T18 in the spring file. Each gets a one-change mutant.

## Checkpoint 10 (2026-11-12, phase 2 tests and kill-proof)

- Existing tests updated for picks that preview: `grab-bridge` (four colour tests), `grab-overlay-easing-control` (drag release and keyword preset keep the editor open; Enter commits), `grab-overlay-spring-control` (preset previews, Enter commits), `grab-overlay-queue-draft` (Enter after the box-shadow preset).
- New file `test/grab-overlay-live-edit-controls.test.mjs`, 20 tests: T6, T6b (display select), T7, T7b, T7c (native colour input; T7c is the outside press with no blur path), T8, T8b (token chip), T13 (token-linked row), T16, T16b (box-model field), T17 (text-decoration), T24c (slow press on Send), T25 (Enter and Escape on the unit select), T26, T26b (overflow), T27 (Send follows a finished dispatch), T28 (rebase with a held hover preview), T29 (box-shadow preset), T30 (Size), T31 (corner radius).
- Assertions added to T3, T14, T19c and the spring preset test.
- Defect found by T17 and fixed: Escape in a structured editor that held a preview left Send enabled with nothing to send. `cancelStyleEdit` now calls `syncSendEnabledInPlace()`.
- Kill-proof: 29 phase 2 mutants, all KILLED. One survived the first run (`m7-outside-press-no-commit`: a press on the page also blurs the field, and blur commits). T7c presses a panel section title with focus on the native colour input, where only the outside press can close the editor; the mutant now fails T7c.
- All Grab test files together: tests 729, pass 726, fail 1, skipped 2. The failure is "Retry keeps the element label the designer saw when it was sent", which passes outside the concurrent run (load-sensitive).
- Style contract on the phase 2 diff: no hits. Mirror `cmp` silent.
- Harness facts: a send clears the element's inline preview (so before phase 2 too); `#pad` animates every property over 1s, so tests read the inline style; colour rows record in the row's format unless the native picker set hex; the four-corner radius editor opens from `[data-radius-expand]`.
- Running: phase 1's 38 mutants against the phase 2 overlay; phase 2 falsify panel round 1 (eight legs: luna, Sol, Kimi, GLM, Kimi 3.1 pro).
- Next: verify panel findings in source, Sol gate, idle `npm test`, commit phase 2, then phase 3.

### Checkpoint 10b (2026-11-12): phase 2 falsify round 1 triage

- Phase 1's 38 mutants against the phase 2 overlay: 36 killed. `k24-send-not-synced-in-place` no longer applies (the anchor moved when `syncSendEnabledInPlace` began setting the label). `k24b-first-preview-not-counted` is killed by T24b only; T3 no longer fails under it. Both need the mutant list updated.
- Phase 2 falsify round 1: eight legs (luna x2, Sol x3, Kimi, GLM, Kimi 3.1 pro). Two reported nothing new. Findings, each to be checked in source before a fix:
  - Overflow and Size commits have no stale-target guard, so a commit after the page removes the primary of a multi-selection records against the promoted layer (luna, P1; confirmed in source).
  - Box shadow: a preset preview followed by an invalid field value and a commit leaves the preset inline with nothing recorded (Sol, P1).
  - Structured editors' repreview after a rebase has no stale-target guard (Sol, P1).
  - A press on Send with a token-linked editor open dismisses the editor first, because the linked branch runs before the Send exclusion (Kimi, P2).
  - A slow press on the pending-changes tray toggle loses its click when the deferred commit replaces the tray (Sol, P2).
  - A cancelled first easing drag may leave Send enabled (GLM, P2).
  - Test gaps (Sol): the spring preset resync, `commit.repreview` on structured editors, native colour `change` in text decoration and box shadow, the touch outside-press rule.
- T9 (easing) and T18 (spring) are drafted in the scratchpad and not yet applied.
- Next: verify each finding, apply one overlay fix step (patch5), add the tests and mutants, re-run both mutant lists, panel round 2, Sol gate, idle `npm test`, commit phase 2.

### Checkpoint 11 (2026-11-12): phase 2 falsify round 1 fixes (patch5) and tests T32–T38

Round 1 panel: eight legs, all rc=0. Each finding was checked in source and with a scratch probe before any edit.

Confirmed and fixed in patch5 (uncommitted, built, mirror identical, style contract clean):
- Sol B-outside P2: a slow press on the change tray toggle, with focus on the native colour input, lost its click because the commit rebuilt the tray between press and release. A press on the tray now closes the editor on release (`heldPress`, `onRelease`).
- Found while verifying: Overflow and Size with a recorded edit, another pick, the recorded pick again, Enter: the page went back to the original while the record kept the edit. Both now restore to what the editor opened with (`restoreOpened`).
- Sol C-held P1: a box-shadow preset then a refused blur (-1) then Enter left the preset inline with nothing recorded. Text-decoration and box-shadow now restore on a refused or empty commit.
- luna F-multi P1 (also the open phase 1 finding): Enter after the page removed the primary layer recorded the edit on the promoted layer. `commitStyleEdit` now has the promotion guard `previewStyleEdit` has.
- Sol C-held P1 #2: structured `preview()` had no stale-target guard. Added to text-decoration, box-shadow, overflow, Size and radius.

Refuted, no change:
- Kimi D-state P2 (token-linked editor dismissed by a Send press): base 84b10bf dismissed it on any outside press, the linked editor writes nothing, and Send still sends the pending change.
- GLM E-easing P2 (cancelled first drag leaves Send enabled): `rollbackPreviewState()` ends with `syncHeldChange()`.
- luna A-single and Kimi 3.1 E-easing reported nothing new.

Open, pre-existing: with a text field focused, the blur commit happens at mousedown and a tray-toggle click is still lost (probe A3; same at base).

Tests: T9 (easing pointercancel) and T18 (spring resync) applied and passing. T32–T38 appended to `test/grab-overlay-live-edit-controls.test.mjs` (T32 tray press, T33/T33b recorded-value restore, T34/T34b refused commit, T35 native colour change, T36/T36b removed primary, T37 touch rule, T38 structured repreview). First run: 54 of 55 pass; T35 fails on its own Escape step and is being fixed. Four mutants added for T9/T18; mutants for T32–T38 still to add.

Remaining for phase 2: T35 fix, mutants and kill-proof run, p1 mutant list re-anchor (k24, k24b), full Grab test set, panel round 2, Sol gate pass, idle `npm test`, commit.

### Checkpoint 12 (2026-11-12): patch6, T24d, T32–T38 kill-proof, round 2 launched

- T35 found a gap this change opened: with focus on the native colour input of the text-decoration or box-shadow editor, Enter and Escape did nothing (the input's `change` no longer closes the editor, so focus can rest there). patch6 gives that input the Enter/Escape handler in text-decoration, box-shadow and Stroke. Tests T35, T35b.
- Pre-existing, left open: after a text-decoration or box-shadow commit the Send label reads "Send to agent" (enabled) until the next panel render. Same on 84b10bf and 4c90831 (probe on both overlays).
- Controls file now has T32, T33, T33b, T34, T34b, T35, T35b, T36, T36b (five editors), T37, T24d, T38. Four live-edit files: 90 of 90 pass before T24d; T24d, T37, T17 pass after.
- Phase 2 mutants: 54 of 54 killed. Three definitions repaired: m17 re-anchored after patch6; m24c now expects T24d (T24c no longer sees a Send press treated as outside, because a press on the action bar closes on release); m18-handle-ignores-hidden dropped (the guard predates the branch and the mutant throws where the original returns, with the same visible result).
- Phase 1 mutant list: k24 re-anchored to `button.disabled = !ui.enabled;`; k24 and k24b-first-preview expect T24b only, because phase 2's `cancelStyleEdit` resyncs Send and T3 no longer sees them. Re-run in progress.
- Falsify round 2 launched on a fresh snapshot with the round 1 findings and verdicts in the prompts.

Remaining for phase 2: read round 2, full Grab test set, G-contract local leg, Sol gate pass, idle `npm test`, commit.

## Checkpoint 13 (2026-11-12, phase 2 falsify round 2)

- Phase 1 mutant list re-run on the phase 2 overlay: 37 of 38 killed. `k22-preview-lands-on-promoted-layer` has an ambiguous anchor (patch5 added the same guard line to `commitStyleEdit`); re-anchor with the comment line above it.
- Phase 2 mutant list: 54 of 54 killed after T24d and the m17 re-anchor.
- Round 2 panel: single controls (luna), easing (GLM and Kimi 3.1), multi-select (luna) reported nothing new.
- Round 2, Sol outside-press P1, confirmed with real Chromium touch input: colour held with focus on the native input, a touch tap on the font-size value cell opened a second editor before the deferred commit ran; the colour pick was never recorded and Send sent font-size only. Fix `patch7.py`: `flushedStyleRow(row)` commits an open editor and re-finds the row; the click path, the radius-expand path and the Enter/Space path go through it. Probe after the fix: one editor mounted, Send sends colour and font-size.
- Round 2, Kimi state-rows P1 (`rebaseNextDrafts` restores `activeStateStylePreview` without checking the editor or target): not yet verified.
- Round 2, Sol test gaps (P2): native colour `change`-only event; Enter/Escape on the colour-format select; repreview after rebase for editors other than overflow.
- Round 2, Sol held-preview lens: output pending at this checkpoint.
- Next: test and mutant for patch7; verify the Kimi finding; close the three test gaps; re-run both mutant lists; round 3 on a fresh snapshot; Sol gate pass; idle npm test; commit phase 2; phase 3.

## Checkpoint 14 (2026-11-12, round 2 closed, round 3 launched)

- `patch7.py` (touch tap and Enter on another row commit the open editor first) and `patch8.py` (box-model rollback after a rebase dropped the record; a queued Send fires for a held value) are built into the overlay; mirror identical, style contract clean.
- Sol held-preview lens, round 2: P1 box-model cancel threw on a record a rebase deleted (the dereference predates the branch; typing previews made it reachable) and P2 queued Send skipped a held value. Both fixed in patch8.
- Kimi state-rows P1 rejected after reading the source: the preview sheet covered every selected layer before the rebase, the restore shows what was shown, Escape on the stale editor clears it. It is the recorded open item about a held preview staying on the staying layer.
- New tests, all passing: T39, T39b, T39c, T40, T41, T42, T43, T38b (four editors). T40 and T41 run with `#pad`'s one-second padding transition off, because a rebase compares the computed value.
- New open item, predates the branch: a rebase sets `oldValue` to "" for a box-model side.
- Mutants: 15 added (69 in the phase 2 list); k22 re-anchored. Both lists running. Round 3 panel running on a fresh snapshot.
- Next: read both; G-contract local leg when no browser tests run; Sol gate pass; idle npm test; commit phase 2; phase 3.

## Checkpoint 15 (2026-11-12, round 3 read, patch9 drafted, phase 3 drafts launched)

- Round 3 panel: eight legs. Multi-select (luna) and easing (Kimi 3.1) reported nothing new.
- Accepted, luna single-controls P2: Size editor, clear the number, Mode Hug, Mode Fixed leaves the Hug preview on the page with an empty Fixed field. Fix in `patch9.py`: an emptied number puts the opening value back, and the mode handler previews on the way back to Fixed.
- Accepted, Sol outside-press P2: a press on the left dock (`structureActions`) was not held until release, so the deferred commit rebuilt the dock and the click was lost. Fix in `patch9.py`: the dock is held like the change tray.
- Accepted, Sol held-preview P1: text-decoration, box-shadow, overflow, Size, border-radius and the generic editor wrote the opened value inline on Escape after a rebase deleted the record they opened on. Fix in `patch9.py`: each rollback checks `styleEdits[property]` before restoring the committed value. The scrub rollback has the same shape and is left as it is (no repreview hook, the drag ends before a rebase can run); recorded as open.
- Accepted, Sol tests lens, two P2 gaps: T18 does not assert the redrawn curve; the typed-easing test does not assert the page value after typing.
- Rejected, Kimi state-rows P2: `setStyleEditorTokenLinked(editor, false)` is called at the end of `detachTokenFromStyleEditor`, past the excerpt.
- Rejected, GLM easing P1: `parseEasingValue` returns null for x outside 0 to 1, the canvas is hidden and `pointerdown` returns; the scenario cannot start.
- New open item, present at 84b10bf, not probed: the Stroke editor reloads its width field from the committed model on every input, so typing `1.` is rewritten to `1`.
- `patch9.py` dry-run on the patch8 overlay: `node --check` and the style contract pass. Not installed: the mutant run is still reading the worktree (phase 2 list 44 of 69 killed, none survived, at this checkpoint).
- Phase 3 wiring drafts launched from five models (Sol, luna, Kimi, GLM, Kimi 3.1) on the patch8 snapshot. Brief: shared conversion helpers for Size and Stroke, unit options filtered by `styleValueSupported`, typed unit switches the select, unitless option for line-height.
- Next: install patch9 after the mutant run; tests T44 (left dock), T45 (Size emptied), T46 (rollback after rebase, six editors), the two Sol assertions; mutants; round 4; Sol gate pass; idle npm test; commit phase 2; phase 3.

## Checkpoint 16 (2026-11-12, patch9 installed, round 3 tests pass, round 3 mutants running)

- `patch9.py` is built into the overlay (`BUILD_OK`, mirror identical, style contract clean): left dock press held until release; Size emptied number and Fixed-with-no-number take the preview off; rollbacks in text-decoration, overflow, Size, the generic editor and border-radius check the record still exists.
- The box-shadow rollback is back to its phase 1 form. Probe: a box-shadow record holds `0px 4px 2px 0px rgba(0, 0, 0, 0.2)` and the computed value reads `rgba(0, 0, 0, 0.2) 0px 4px 2px 0px`, so the rebase's strict compare never matches and the record is never dropped. The guard had no reachable case. New open item, predates the branch: a rebase never drops a box-shadow record.
- New tests, all passing (14 of 14 in the targeted run): T44 (left dock), T45 (Size emptied, Hug, Fixed), T46 for five editors (text-decoration, overflow, width, border-radius, font-size), T39d and T39e (a tap whose click lands in the same task as its lift), the redrawn-curve assertion in T18 and the page-value assertion in the typed-easing test.
- Why T39d and T39e: on the patch8 overlay three mutants survived (`m39-open-does-not-flush` partly, `m39-click-opens-directly`, `m39c-radius-opens-directly`). Real CDP touch delivers the click before or after the deferred commit depending on load, so T39 and T39c pass on the unfixed path. The new tests dispatch pointerdown, pointerup and click in one task.
- Mutants: the three m39 expectations re-pointed to T39d and T39e; ten added (m44, m45 x2, m46 x5, m18, mE). The phase 2 list is 79. The 13 are running by name; both full lists run after.
- The earlier full run was stopped at 57 of 69 killed, only the three m39 survivors; the phase 1 list had not started.
- Phase 3 drafts: luna (sketch) and Kimi 3.1 (complete) are in; GLM returned empty twice and Kimi once (token limit); Sol and the Kimi retry are running.
- Open, no test: the radius commit-failure rollback guard.
- Next: read the 13; both full lists in the background; G-contract local leg when no browser tests run; round 4 panel on a fresh snapshot; full Grab set; Sol gate pass; idle npm test; commit phase 2; phase 3 from the Kimi 3.1 draft merged with Sol's.

## Checkpoint 17 (2026-11-12)

Phase 2 round 3: the 13 new or re-pointed mutants are all killed (`r3-new.log`, exit 0). `m32-tray-not-on-release` no longer matched the overlay after patch9 (anchor count 0); re-anchored on `return { open: open, onRelease: onDock };`. Both full mutant lists (38 + 79) are running in the background.

Phase 3 drafts: Kimi k3 (retry, low reasoning) and Kimi 3.1 complete; luna a sketch; GLM empty twice on this brief (`finish_reason: length`); Sol still running.

Phase 3 design, merged from the two Kimi drafts and my read of the code:

1. Shared module-level helpers: the conversion arithmetic (anchor, zero, rounds-to-zero gives null); a before/after check `(element, checkProperty, apply, revert)` inside one `suppressStyleTransitions`, tolerance `max(0.5, 1% of before)`; a deferred refusal status with the same message text; a typed-unit helper that sets the select and returns the adopted option.
2. `parseNumericExpression(value, defaultUnit, allowedUnits)`: a typed unit that differs from the field's is accepted only when it is in `allowedUnits`. Only input handlers pass the list. Two-argument callers are unchanged.
3. `unitOptionsForProperty(property)` keeps a unit only when `styleValueSupported(property, "1" + unit)`; falls back to the full list when everything is rejected (fake DOM); adds unitless for line-height. The generic select is built when the value has a unit or the property is line-height.
4. Size: own `currentUnit` and `unitAnchor`; typing and arrow steps reset the anchor; a unit change converts, previews, and is refused with the number, select and Send state put back when the used value moves.
5. Stroke: checks `outline-width` outside, `border-top-width` uniform inside, the first selected side per side. Snapshot with `snapshotStrokeEditState` plus the controls, `sides`, `model`, `dirty` and `data-edited` before applying; a refusal restores all of it.
6. Expected refusal for the Stroke test: 5px to cm (0.132cm is 4.989px, which Chromium snaps to 4px). To confirm in the harness.

Eleven phase 1 mutants are anchored inside the generic `handleUnitChange` and `refuseUnitChange`; each needs re-anchoring if phase 3 moves that text.

Next: read both full mutant lists; G-contract local leg; round 4 panel on a fresh snapshot; full Grab set; Sol gate pass on phase 2; idle npm test; commit phase 2; then the phase 3 patch series.

## Checkpoint 18 (2026-11-12): phase 2 mutant lists, phase 3 built in scratch

Phase 2 is still uncommitted; the worktree overlay is the phase 2 build.

- Phase 1 mutant list against the phase 2 overlay: 38 of 38 killed.
- Phase 2 mutant list (79): running. One survivor so far, `m30-size-emptied-held`. After the round 3 fix an emptied Fixed number clears the preview, so the guard the mutant removes only matters on a Mixed row. New test T30b (Mixed height row: 90 enables Send, emptied disables it) fails on the mutant in scratch. To do once the run ends: append T30b to the controls test file and point m30 at it.
- Phase 3 wiring drafts: four in (Sol, Kimi, Kimi 3.1 pro, luna). GLM returned nothing on the wiring brief twice.
- Phase 3 as built in scratch (not installed in the worktree):
  - Shared helpers after `styleUnitPx`: `convertStyleUnitNumber`, `styleUnitChangeHolds`, `styleUnitTrialHolds`, `refuseStyleUnitChange`, `adoptTypedStyleUnit`.
  - `parseNumericExpression` takes the select's option list; a typed unit the select offers is taken, any other unit is invalid.
  - `unitOptionsForProperty` keeps units the browser accepts for the property and adds a unitless option for line-height, labelled "unitless".
  - Size and Stroke unit selects convert and check before `preview()`; a typed unit sets the select with no conversion; a typed or stepped number clears the anchor.
  - The generic editor uses the same helpers; token-linked rows ignore a typed unit.
  - Not adopted from the drafts: preserving the Stroke width text, Stroke arrow stepping, token-linked guards in Size and Stroke, whole-map record snapshots.
- Phase 3 tests in scratch against the scratch overlay: T11b, T12, T12b to T12e (6 pass); T10b, T10e, T10f, T10g, T11, T11d, T11e, T11f, T12f (9 pass). T12f needs a DESIGN.md token (`leading.body`) passed through the harness `design` option; a CSS variable alone does not link a row.
- A scratch overlay run needs both `RAVEN_GRAB_ASSET_PATH` and `RAVEN_GRAB_TEST_OVERLAY`; the panels harness reads the first.
- Chromium probe, ratio 1: line-height offers 11 units plus unitless; 26px to unitless reads 1.444 (computed 25.992px); Stroke 5px converts to 3.75pt and 0.313rem, and is refused for cm, mm, in and vw because the rounded value draws as 4px.
- Still to do for phase 3: build script, install, mutants for every new test, re-anchor six phase 1 mutants that moved into the shared helpers, both earlier mutant lists again, panel, Sol pass, full test run, commit.

New open findings:
- Stroke unit changes to cm, mm, in or vw are refused at ratio 1 when the rounded value lands under a whole pixel. This follows the spec's rounding and check.
- The generic editor's refusal after a preview has no direct test; it is reachable only when the percent base is mis-measured.
- The Stroke anchor reset in `loadControlsFromValues` and the number restore after a failed `preview()` have no test.
- A Stroke commit also sends `outline-width 3px to 0px` and unchanged style and colour entries (present before this change).
- On a Mixed Size row an emptied number leaves the last preview on the page until close (present before this change).
- GLM returned empty or truncated output on the phase 3 test briefs.

## Checkpoint 19 (2026-11-12)

- Phase 2 mutant lists: p1 38 of 38 killed; p2 79 of 79 after T30b was appended to the controls file (57 tests) and m30 was pointed at it.
- Phase 3 is scratch only: overlay `p3/raven-grab.p3a.js` (patch10 over the phase 2 overlay), tests `p3/tailA.mjs` and `p3/tailB.mjs` (15 of 15 pass on p3a), mutant list `kill/p3-mutants.py` (26, not yet run), panel builder `build9.py`.
- T12f needed a DESIGN.md token through the harness `design` option; a CSS variable alone does not token-link a row.
- Round 4 panel (phase 2) on a fresh snapshot: A-single, E-easing (two models) and G-contract report nothing new. Five findings to verify in source:
  1. B-outside (Sol, P2): mobile tabbed sheet, held colour pick, tap on the Instructions tab; the tab may not render after the deferred commit.
  2. C-held (Sol, P2): "Add to queue" with only a held value reports "Change a style or write an instruction first"; the blocker runs before the flush.
  3. D-state (Kimi, P2): a token-linked open editor plus a press on the tray toggle or left dock loses the click.
  4. F-multi (luna, P2): Stroke preview and Escape do not cover component-scope siblings.
  5. H-tests (Sol): T37 has no horizontal case; T35's box-shadow Enter assertion is satisfied by the earlier record; T41 waits a fixed time.
- Sol gate round 1 for phase 2 is running (`legs/p2-gate-r1-sol.txt`); its snapshot predates any round 4 fix.
- Next: verify the five against 84b10bf, fix phase 2 defects as patch11 with tests and mutants, rerun mutant lists, round 5 panel, idle npm test, commit phase 2, then install phase 3.

## Checkpoint 20 (2026-11-12 02:15 PST)

- Sol gate round 1 for phase 2: no P1, three P2. All three fixed in patch11 (overlay build p2j): preset buttons reached with Tab committed the editor; box-shadow presets had no Escape or blur handler; a native colour reported on `change` alone kept the token of an earlier chip pick.
- Round 4 panel findings fixed in the same patch: "Add to queue" ignored a value an open editor holds (`queueDraftBlocker` now counts `styleEditorHoldsChange()`, `syncSendEnabledInPlace` calls `syncQueueButton`); a tab tapped in the mobile sheet while an editor held a value was not shown after the commit (`panelRenderSkipped`, render after the deferred commit in `closeTarget`).
- New tests: T48 (queue), T49 (mobile sheet tab, viewport 600×900), T8c (change-only colour), T50 (box-shadow preset keys) in `test/grab-overlay-live-edit-controls.test.mjs` (61 tests); T51 (easing and spring presets) in `test/grab-overlay-spring-control.test.mjs`. Test fixes: T37 sideways case, T35 reads the sent payload, T41 waits with a deadline.
- Phase 2 mutant list is 93 entries. The 15 new or re-anchored mutants are all killed. Full reruns of the 38 phase 1 and 93 phase 2 mutants on p2j started 02:10 (`kill/p1-full2.log`, `kill/p2-full2.log` in the scratchpad).
- Recorded open, unchanged from 84b10bf: a press on the tray toggle or left dock while a token-linked editor is open dismisses it on pointerdown and loses the click; Stroke preview and Escape do not cover component-scope siblings. Accepted: Enter and Space on a focused preset button activate the button.
- Phase 3 patch (patch10) applies over p2j and parses; all three mutant lists anchor against it. Phase 3 is not installed.
- Running now: round 5 falsify panel (8 remote legs on a fresh snapshot), Sol gate round 2.
- Next: read round 5 and gate round 2, verify each finding against the base, fix phase 2 P1/P2 with tests and mutants; G-contract local leg when no browser test runs; idle `npm test`; commit phase 2 with `git commit --only`; install phase 3 (`p3/build.sh`), append its tests, run its mutants, panel, Sol gate, npm test, commit; final captures, design-judge, done-gate, handoff.

## Checkpoint 21 (2026-11-12 02:25 PST)

- Round 5 panel (8 legs) and Sol gate round 2 for phase 2 are read and checked in source. Gate round 2: no P1, two P2.
- Fixed in patch12 (overlay build p2k, installed, mirror identical, style contract clean):
  1. A tapped or release-held panel action ran before the deferred commit of a held value. Version restore, version save, the scope chip, the scope track and tray Remove now call `commitOpenStyleEditorFirst()`.
  2. Colour suggestion chips reached with the keyboard had no Escape or blur handling; they are wired with `wirePresetButton`.
  3. The plain-text timing field was not in `relatedInternal`, so focus coming back to it from a spring preset committed.
- Test gaps closed: T28 asserts the hover preview sheet after the rebase; T37's committing tap moves 5px.
- New tests: T52 (restore), T53 (tray Remove), T54 and T54b (scope chip and track), T55 (save), T56 (colour chip keys) in the controls file (67 tests); T51b in the spring file (10 tests). All pass on p2k.
- Rejected after reading the source: "rebase re-previews an emptied generic number" (`rollbackPreviewState` nulls `lastPreviewValue`); "Tab from the native colour input leaves the editor open" (Tab leaves through the colour format select, whose blur commits).
- Recorded open (my severity P3, the lens said P2): a dispatch that finishes while a structured editor's field holds an invalid value puts the recorded value on the page, not the last valid preview, until the next valid input.
- Mutants: p1 full rerun 38 of 38 killed on p2j. The p2 full rerun on p2j was stopped at 16 of 93 (all killed) because p2k supersedes it. Phase 2 list is 103 entries; the 12 new or re-anchored ones are running (`kill/p2-patch12.log`).
- Phase 3 build script now reads p2k. `f9-panel.sh` is written.
- Next: full p1 and p2 mutant reruns on p2k; round 6 panel on a fresh snapshot and Sol gate round 3 of 3; idle `npm test`; commit phase 2; install phase 3.

## Checkpoint 22 (2026-11-12 02:50 PST)

- Sol gate round 3 of 3 for phase 2: "NO P1 OR P2", no P3 (`legs/p2-gate-r3-sol.txt`).
- Mutants on the final phase 2 overlay (p2k): phase 1 list 38 of 38 killed; phase 2 list 106 of 106 killed (103 in the full rerun, 3 added after it for T57 and T58, plus the two T27 mutants rerun after the T27 edit).
- Round 6 panel: four legs report nothing new. No defect confirmed. Rejected in source: the colour format select not writing the page (the spec's table keeps it unchanged); a shift-click on the page not flushing (it is an outside press); the easing canvas shown with no curve for a keyword (the easing control is chosen only when the value parses). Recorded open at P3: a box-model field retyped as an equal number (13 to 13.0) enables Send and the press sends nothing.
- Round 6 test gaps closed: T57 (typing in the plain-text timing field previews; spring file, 11 tests), T58 (box-shadow Inset checkbox and colour format select; controls file, 68 tests), T27 reads the finished-dispatch label in the call that finishes the dispatch.
- Running: round 7 panel on a fresh snapshot with the local contract leg.
- Next: read round 7; idle `npm test`; commit phase 2; install phase 3 (`sh p3/build.sh`, tails A and B, `kill/p3-mutants.py`), phase 3 panel and Sol gate.

## Checkpoint 23 (2026-11-12 03:15 PST)

- Round 7 panel: seven of nine legs report nothing new. One defect confirmed in source and fixed (patch13, overlay p2l): a box-model field opened and left untouched wrote its rounded number inline when a finished dispatch rebased the drafts; the rebase hook now writes again only what the field previewed. The lens rated it P1; the write was under 0.005px and was taken off on close, so P3 by effect. Test T59, mutant `m59-box-repreview-unconditional` killed.
- Round 7 test gap closed: a press on a panel title after a native colour pick in the text-decoration, box-shadow and Stroke editors (T60, T60b, T60c; three registration mutants killed). Controls file: 72 tests. Phase 2 mutant list: 110.
- The Sol gate's three rounds for phase 2 were used before patch13; the one-line change is covered by the phase 3 gate, which reads the whole overlay.
- T41 failed once in the m60b mutant run (a deadline wait); rerun it alone on the real overlay before the full test run.
- Running: full rerun of the 38 phase 1 and 110 phase 2 mutants on p2l. Then round 8 panel, idle `npm test`, commit.
- 03:40: full rerun on p2l: 38 of 38 phase 1 and 110 of 110 phase 2 mutants killed. T41 failed in two unrelated mutant runs out of about 170 full-file runs; 24 of 24 full-file runs on the real overlay under the same three-stream load passed and the failure did not repeat on either mutant overlay. Recorded open as a rare timing flake. Round 8 panel started.

## Checkpoint 24 (2026-11-12 04:25 PST)

- Round 8 panel: six of nine legs report nothing new. One defect reproduced with a test and fixed (patch14, overlay p2m): a Shift-tap that adds a layer while the primary stays pinned did not flush the open editor, and the deferred commit then wrote the held value to the added layer. `applySelection` now commits the open editor before it reads the selection. Test T61. With a mouse the deferred commit or the blur ran before the click, so this needed a tap with Shift held.
- Round 8 test gaps closed: T62 (text-decoration Style select), T18 asserts no page error on the hidden handle press. Controls file 74 tests, spring file 11. Phase 2 mutant list 114; the four new ones are killed.
- Next: round 9 panel, then the full mutant rerun on p2m, idle `npm test`, commit. Panel cap: round 10.
- 04:55: round 9 panel: seven legs report nothing new, the Kimi state leg returned an empty body. No code defect. Rejected: the easing drag clamps y to the drawn canvas (identical at 84b10bf). Test gap closed: T63, a press on the open row outside its editor (mutant `m63-row-press-is-outside` killed). Controls file 75 tests; phase 2 mutant list 115. Round 10 is the last panel round.

### Checkpoint 25 (2026-11-12, after compaction)
- Overlay = p2m (patches 1-9, 11-14), mirror identical, contract clean. Nothing committed for phase 2 yet.
- Controls file 75 tests (through T63), spring file 11. p2 mutant list 115.
- Full mutant rerun on p2m: p1 38/38, p2 58+57 = 115/115 KILLED, 0 survived, exit=0 (p1-full5, p2-full5a/b logs).
- Panel round 9: no code defect (easing y clamp rejected as identical at base; T63 added for a test gap).
- Panel round 10 (declared cap): 6 lenses nothing new; 3 P2 reports to verify in source: Stroke colour chip Tab/Escape (luna), native colour input focus-out (Sol; spec line 98), overflow Y axis has no test (Sol).
- Next: verify the three, fix or record, idle npm test, commit phase 2, sh $S/p3/build.sh.
- Round 10 dispositions (panel cap; rounds 9 and 10 had no code defect, so the panel ends dry for two rounds, 10 rounds in all):
  - Stroke colour chip has no Escape or focus-out handling (luna, P2): the call site is byte-identical at 84b10bf (Stroke passed null for relatedInternal there too). Recorded open, pre-existing.
  - Generic colour editor: focus leaving through the native colour input does not commit (Sol, P2): the spec keeps the native input without a blur handler on purpose (Closing section); the outside press commits. Already recorded open.
  - Overflow Y had no test (Sol, P2 test gap): T64 added; mutant m64-overflow-y-commits KILLED. Controls file 76 tests, p2 mutant list 116.
- Phase 2 idle npm test: tests 2199, pass 2196, fail 0, skipped 3, exit=0.
- Phase 2 committed e4cd044. Phase 3: sh p3/build.sh BUILD_OK (patch10 over p2m), contract clean; tailA (6 tests) and tailB (9 tests) appended; live-edit file 40/40, controls file 85/85; anchors 38/116/26 with 0 bad. Mutant proof (p3-full1, p1-full6, p2-full6a/b) and panel round 1 running as background task b7k270grh.

### Phase 3, round 1 (2026-11-12)

- First mutant run on the phase 3 overlay: 21 killed, 5 survived. Phase 1 list 38 of 38 and phase 2 list 116 of 116 still killed.
- Panel round 1 (9 remote legs, 1 local): one confirmed defect. Size width, type `10EM`, ArrowUp, Enter sent `11px`: the arrow step assigned the typed "EM" to the unit select, which cleared it. Fixed: the step keeps the unit the select shows. Test T10h.
- Two Stroke lines were redundant (the preview reloads the controls from the recorded stroke) and were removed; their two mutants go with them.
- Rejected: multi-select conversion checked on the primary only (the spec gives primary-element bases); `apply()` throwing after a write (no reachable throw; recorded P3).
- Test gaps closed: T10i (the Size anchor: 27px reads 5.19 in % and 27 again in px), T12g (a typed unit in upper case).
- Open from this round: the local contract leg timed out (903 s, no output); GLM returned empty content on the maths lens at the token limit; no unit-change test for an outside stroke or a single side.
- Capture dry run: after choosing % the editor stays open showing 144.44 and %; computed line-height is 25.92px (Chromium truncates the percentage), so the three-line paragraph is 0.23px shorter.
- Next: mutant list edits, full mutant runs on all three lists, panel round 2, Sol gate, npm test, commit.

### Phase 3, round 2 (2026-11-12)

- Mutants on the round 1 overlay: phase 3 list 28 of 28, phase 1 list 38 of 38, phase 2 list 116 of 116 killed.
- Panel round 2 (9 remote legs, local contract leg returned this time): no code defect. Three test gaps closed: T10j, T10k, T11h, each with a killing mutant (3 of 3 killed). T11g added for an outside stroke.
- Rejected: a hover row refusing a measured % base (the spec says it refuses); the trial write being visible to a MutationObserver (only the motion-marker observer exists).
- GLM returned empty content on the maths lens again at the token limit.
- Next: panel round 3 with the Sol gate round 1 in parallel.

### Phase 3, round 3 and Sol gate round 1 (2026-11-12)

- Panel round 3: no code defect; two test gaps closed (T4f zero conversion, T11i emptied Stroke width).
- Sol gate round 1: one P1, confirmed in source. In a unitless line-height field, `2q` then ArrowUp previewed `3q` while the field and the commit said unitless 3: the arrow step parsed without the unit list. Fixed: `steppedNumericValue` takes the unit list and the generic editor passes it. Test T12h, mutant killed.
- The Stroke empty-field `currentUnit = toUnit` has no killing test (the next valid input reloads the controls and sets it); the line stays and the mutant is not in the list.
- Next: full mutant runs on the new overlay, panel round 4, Sol gate round 2.

### Phase 3, round 4 and Sol gate round 2 (2026-11-12)

- Mutants on the gate-fix overlay: phase 3 list 31 of 31, phase 1 list 38 of 38, phase 2 list 116 of 116 killed.
- Sol gate round 2: NO P1 OR P2, no new P3.
- Panel round 4: one confirmed P2. Stroke px to pt, style none, solid, pt to px was refused: style none wrote 0 into the width field and kept the old width's unit anchor. Fixed (the handler clears the anchor); test T11j proved failing before the fix. Test gap closed: T11k (unit list fallback). Rejected: a 1e-322% underflow.
- The local contract leg timed out again (902 s, no output) while the mutant streams were finishing.
- Next: full mutant runs on the new overlay, panel round 5, Sol gate round 3 (the last).

## Phase 3, round 5 and Sol gate round 3 (2026-11-12)

- Mutants on the p3e overlay (patch10 + 15 + 16 + 17): phase 3 33 of 33, phase 1 38 of 38, phase 2 116 of 116 killed.
- Panel round 5: seven lenses answered NOTHING NEW. Sol Stroke lens: P1 by inspection, not reproduced — an inline `border: 5px solid … !important` against a stylesheet `border-style: none !important`; the width-only trial accepts and the Stroke preview then rewrites `border-style` without its priority. Sol tests lens: P3, no test requires the 1% tolerance above 0.5px.
- Sol gate round 3 (3 of 3 used): P2 — the generic unit-change handler parses the field without the unit list, so `2q` in a unitless line-height field reads as 2, a conversion is attempted and refused. Spec line 150 wants the unit switched with no conversion.
- Next: verify each in source; patch18 for the gate P2 with a test and a mutant; tolerance test and mutant; panel round 6 (the cap); then `npm test`, commit, captures, design-judge, done-gate, handoff.

## Phase 3, round 6 (the cap) and close (2026-11-12)

- Gate round 3 P2 verified in source and fixed (patch18): the generic unit change passes the unit list to its parse. Test T12i; mutant `p3-generic-unit-change-ignores-unit-choices` killed. Not re-reviewed by Sol: the three gate rounds are used.
- Round 5 Stroke `!important` item: verified pre-existing. `setStyleOnTargets` writes with no priority at 84b10bf and the base unit select called `preview()` directly. Recorded open, not fixed.
- Round 5 tolerance gap closed: T4g (100px line on 72px text reads 138.89%, computes 99.36px); mutant `p3-tolerance-flat-half-pixel` killed.
- Mutants on the p3f overlay: phase 3 35 of 35, phase 1 38 of 38, phase 2 116 of 116 killed. A 36th phase 3 mutant (`p3-stroke-failed-preview-keeps-number`, T11l) was added after and killed.
- Panel round 6: eight lenses NOTHING NEW (GLM state lens returned a provider error, empty). Sol Stroke lens: P3 test gap, the number restore after a rejected composite preview; closed with T11l.
- Panel stop rule: rounds 5 and 6 raised items, so phase 3 ends at the declared cap of six rounds, not on two clean rounds. No code defect was raised in round 6.
- Test files: live-edit 45, controls 95.
- Phase 3 `RAVEN_NO_USAGE_LOG=1 npm test`: tests 2229, pass 2226, fail 0, skipped 3.
