# Spec: live style editing and unit conversion in the Grab overlay

**Status:** Spec, not built.
**Date:** 2026-11-11
**Scope:** `browser/raven-grab.js` and its byte-identical mirror `web/public/raven-grab.js`, plus tests. No bridge, payload-schema or MCP tool change.
**Line numbers:** `browser/raven-grab.js` at commit `84b10bf`.
**Browser facts:** measured in headless Chromium 149.0.7827.55 on 2026-11-11. Firefox and Safari were not measured.

## Reported behaviour and its cause

A line-height row shows `26px` on 18px text. Choosing `%` in the unit dropdown closes the editor and sets `line-height: 26%`. That computes to 4.68px, so the lines overlap.

| Symptom | Cause | Source |
|---|---|---|
| The editor closes when the unit changes | The unit select's `change` handler is `commit`, and `commit` unmounts the editor through `replaceStyleInput` | 9084, 9471 |
| 26px becomes 26% | `readValue` joins the unchanged number to the new unit | 9405–9411 |
| Typing a number does not change the page until Enter or blur | The generic editor has no `input` listener for the number, colour-text or plain-text field. Only ArrowUp and ArrowDown preview | 9476–9487 |

## Target rules

- **R1, live.** Every change to every control in an open style editor is written to the page at once, whenever the resulting value is valid.
- **R2, open until dismissed.** The editor closes on Enter (commit), on a press outside it or focus leaving it (commit), on Escape (cancel, restores the value the row had when it opened), and on the overlay actions that already flush an open editor (Send, queue, selection change). No control inside the editor closes it.
- **R3, a unit change keeps the rendered value.** Changing only the unit rewrites the number so the computed value stays the same. 26px on 18px text becomes 144.44%.

**Model:** preview while open, commit once on close. The Size and Stroke editors already work this way (8497, 7646), so this adds no new kind of state. While an editor is open the page holds a previewed value and `styleEdits` is written at close. `activeStyleEditorFlush` is already read by Send (13114), queue (4753), the panel re-render guard (14382) and the layer poll (11069, 11939). The change tray shows the edit at commit, as it does today.

## Inventory: every editor and control

| Editor | Control | Today | Target |
|---|---|---|---|
| Generic `beginStyleEdit` (9003) | Number field, typing | No page write until Enter or blur | Preview on `input` |
| | Number field, arrow keys | Preview (9477) | Unchanged |
| | Unit select | Commit and close, number unchanged (9084) | Convert the number, preview, stay open, return focus to the number field |
| | Enum select (display, font-weight, text-align and the rest) | Commit and close (9502) | Preview, stay open |
| | Colour text, typing | No page write | Preview when the text parses as a colour |
| | Native colour panel, dragging | Preview (9126) | Unchanged |
| | Native colour panel, dismissed | Commit and close (9127) | Preview only |
| | Colour format select | Rewrites the text, same colour (9108) | Unchanged |
| | Colour suggestion chip | Commit and close (9141) | Preview, keep `pendingTokenPick`, stay open |
| | Easing handle, dragging | Preview (9221) | Unchanged |
| | Easing handle, released | Commit and close (9254) | Stay open with the preview |
| | Easing preset, spring preset | Commit and close (9302, 9357) | Preview, stay open |
| | Easing text, typing | Redraws the curve only (9315) | Also preview when the value parses |
| | Plain text field, typing | No page write | Preview when `CSS.supports` accepts the value |
| Text decoration (8007) | Line select, style select | Preview, commit and close (8143) | Preview |
| | Colour panel dismissed | Commit and close (8156) | Preview |
| Box shadow (8162) | Number fields, colour text | Preview on `input` (8382) | Unchanged |
| | Inset checkbox, colour format | Commit and close (8380) | Preview |
| | Preset button | Preview, commit and close (8371–8372) | Preview |
| | Colour panel dismissed | Commit and close (8399) | Preview |
| Overflow (8407) | Axis selects | Preview, commit and close (8482) | Preview |
| Size (8497) | Mode, number, unit | Preview, stay open | Unchanged for R1 and R2 |
| | Unit select | Number unchanged (8637) | Convert the number |
| Stroke (7646) | Every control | Preview, stay open | Unchanged for R1 and R2 |
| | Width unit select | Number unchanged (7956). Offers `%`, which `border-width` rejects | Convert the number. Offer only units the property accepts |
| Radius (10020), box-model fields (9833), label scrub (9505) | | Already live. No unit select | Unchanged |
| Hover and focus state rows | Same generic editor with `styleState` | Preview through `previewStateStyleEdit` (4275) | Same targets as the generic editor |
| Token-linked rows | Raw controls disabled until detach. `commit` refuses (9434) | | Unchanged. Preview also refuses while `data-token-linked="true"` |

## Design

### 1. One preview helper in the generic editor

Add inside `beginStyleEdit`, beside `previewValue` (9385):

```js
function previewCurrent() {
  if (finished) return;
  if (editor.getAttribute("data-token-linked") === "true") return;
  if (editorTarget !== selectedElement || input.isConnected === false) return;
  var value = readValue();
  if (value === null) return;                              // unparseable: keep the last valid preview
  if (value === "") { rollbackPreviewState(); return; }    // emptied: show the value the row opened with
  previewed = previewValue(value) || previewed;
}
```

- Wire it to `input` on the number, colour-text, easing-text and plain-text fields, and to `change` on the enum select.
- Replace each `commit()` call marked "Target: preview" in the inventory with `previewCurrent()`, after the control has written `input.value`.
- The easing `up` handler (9248–9255) stops calling `commit()`. The drag-start snapshot and `cancelDrag` restore (9244–9275) stay as they are; the repository rule "restore drag-start values on cancellation" still applies, and a second drag in one session becomes reachable by pointer as well as by typing.
- Every valid intermediate value is written. Typing `144` passes through `1` and `14`. This matches Chrome DevTools. No debounce: a delay removes the immediate feedback this change is for. Revisit only if the eyes-on pass shows the flash is a problem.
- `previewValue` returns false when `CSS.supports` rejects the value, so the last valid preview stays on the page.

The structured editors (text decoration, box shadow, overflow) already have a `preview()`; they only lose the `commit()` calls listed in the inventory.

### 2. Closing

Kept as they are: Enter (9488), Escape (9491), blur to anything outside the editor (9497–9501), and the flush paths.

Added: **a press outside commits.** Once picks stop committing, blur alone is not enough. The native colour input has no blur handler on purpose (9128–9131), so after the colour panel closes no control that could commit holds focus. Today the `change` commit covers that case. After this change nothing would, which is the stranded-preview failure recorded at 9137–9141.

- Generalise the linked-editor listener (6876–6940). Keep one module-level `openStyleEditor = { editor, row, commit }`, set at mount and cleared by `commit` and `cancel`.
- One `window` `pointerdown` listener in the capture phase: a press whose `composedPath()` contains neither the editor nor its row calls `commit()`.
- Touch uses the existing lift-without-moving rule (6911–6937), so a scroll does not close the editor.
- `commit()` is already idempotent through `finished`, so blur and the outside press can both fire.
- Applies to every editor that sets `activeStyleEditorFlush`: generic, stroke, text decoration, box shadow, overflow, size, radius.

Keyboard: in the generic editor the unit select, colour format select and native colour input get the same Enter (commit) and Escape (cancel) handlers the structured editors already put on their selects (8662–8666).

After a unit change, focus returns to the number field with its text selected. The select's blur then has the number field as `relatedTarget`, which `handleBlur` already ignores (9498).

### 3. Unit conversion

New helpers beside `STYLE_UNIT_OPTIONS` (6685).

`styleUnitPx(element, property, unit)` returns the px length of one unit, or `null`.

| Unit | Px per unit | Source |
|---|---|---|
| px, pt, in, cm, mm, pc, q | 1, 96/72, 96, 96/2.54, 96/25.4, 16, 96/101.6 | CSS constants |
| em | Computed font-size of the element. Of its parent when the property is `font-size` | `getComputedStyle` |
| rem | Computed font-size of `documentElement` | `getComputedStyle` |
| vw, vh | `innerWidth / 100`, `innerHeight / 100` | window |
| ch | Width of a hidden `100ch` span in the overlay shadow root that carries the element's computed font-family, font-size, font-weight, font-style and font-stretch, divided by 100 | Probe. No write to the page |
| % on line-height, letter-spacing, word-spacing | Element font-size / 100 | Measured: `letter-spacing: 10%` renders the same width as `0.1em`, `word-spacing: 50%` the same as `0.5em`, and `line-height: 100%` computes to 18px on 18px text |
| % on font-size | Parent font-size / 100 | Measured: 100% computes to the parent's 16px |
| % on any other property | Measured on the element, procedure below | Computed px at `100%`, divided by 100 |
| Unitless, line-height only (decision D2) | Element font-size | Measured: `1.444` computes to 25.992px on 18px text |
| ms, s | 1 and 1000, as times | CSS constants |

**Measuring a percentage base on the element.** Reading a computed value straight after writing it returns the old value when the element has a transition (measured: 26px straight after setting `100%` under `transition: line-height 1s`). The procedure:

1. Save the inline value and priority of `transition` and of the property.
2. Set `transition: none !important` and the property to `100% !important`. Read `getComputedStyle`.
3. Restore the property. Read `getComputedStyle` again, so the restored value is committed while transitions are still off. Restore `transition`.
4. Accept the reading only if it matches `/^-?[\d.]+px$/`.

Measured with this procedure: `padding-left` and `width` return 800px in an 800px parent; the inline style is restored exactly; no animation is running afterwards. `text-indent`, `gap`, `top` on a static element, `letter-spacing` and `border-radius` return `100%`, not px, so they have no measurable base.

**Converting.** On a unit change from `a` to `b`:

- `px = number × styleUnitPx(a)`, `result = px / styleUnitPx(b)`. If either factor is `null`, refuse (below).
- Round to 2 decimals for px, %, vw, vh, pt, mm and ms; 3 decimals for em, rem, ch, cm, in, s and unitless. Trim trailing zeros.
- 26px on 18px text with a 16px root gives `144.44%`, `1.444em`, `1.625rem`, `19.5pt`.
- **Session anchor.** Keep the unrounded px of the last value the user typed or stepped. Later unit changes in the same session convert from that anchor, so px, %, em and back to px shows 26, not 25.99. Typing or stepping replaces the anchor.
- A field holding an expression (`24+2`) is evaluated by `parseNumericExpression` first; the converted number replaces the expression.
- An empty or unparseable field switches the unit with no conversion and no preview.
- 0 converts to 0 with no measurement.
- ms and s convert by 1000 with no check: 200ms becomes 0.2s.

**Checking the result before accepting it.** The live preview already holds the pre-change value, so:

1. `before` is the computed value of the property on the primary element.
2. Apply the converted value with transitions suppressed as in the measuring procedure. `after` is the computed value.
3. When both are px and `|after − before| > max(0.5, 1% of |before|)`, refuse.
4. When either is not px (`normal`, `auto`, a percentage), accept the arithmetic.

**Refusing.** The unit select returns to the previous unit, the number and the page are left as they were, and the status line (`setGlobalActionStatus`, 15339) says why, for example "Can't keep 300px when switching width to % here". Cases measured to refuse in this version:

- A flex item: `width: 300px` is used at 250px, and `100%` measures 526px, so the base is wrong. `30%` would have been correct.
- `height` in % under a parent with no set height: `50%` computes to the content height.
- Properties whose percentage has no measurable base and no table entry (`border-radius`, `text-indent`, `gap`).

**Typed units, the way round a refusal.** `parseNumericExpression` rejects a typed unit that differs from the select (6720). Change: when the typed unit is one of the select's options, set the select to it and use the number as typed, with no conversion. Typing `30%` into a px field applies 30%.

**Unit options.** Build each unit select from the units the property accepts: keep a unit only when `styleValueSupported(property, "1" + unit)` is true. Measured: `border-width` and `outline-offset` reject `%`. The current value's own unit always stays in the list (9077).

**Hover and focus state rows.** Convert with the same bases, read from the element at rest. Skip the check, because the preview is a stylesheet rule that applies only in that state.

**Multi-select and "All N like this".** Bases come from the primary element. The same converted string is written to every target, as any edit is today. A target with a different font-size renders a different px value, as it would for any % or em edit across a mixed selection.

**Chromium and percentage line-height.** Chromium 149 truncates a percentage line-height to a whole percent: `144.44%`, `144.5%` and `144.99%` all compute as 144% (28.8px on 20px text). On 18px text `144.44%` computes to 25.92px, 0.08px under 26px, which passes the 0.5px check. Unitless `1.444` and `1.444em` compute to 25.992px. The field still shows `144.44`, the arithmetically correct value. This is the reason for decision D2.

### 4. Size and Stroke editors

Both already stay open and preview. Their unit `change` handlers (8637, 7956) call the same conversion and check before `preview()`. Box shadow has no unit select (its unit is carried in the model, 7270), so it is unchanged.

## Invariants to keep

- Escape after any number of live changes and unit switches restores exactly the value the row opened with (`rollbackPreviewState`, 9390).
- A commit from a stale editor is still dropped (9438). `previewCurrent` carries the same guard.
- `commitStyleEdit` takes its baseline from the caller's `previousValue`, not from the live computed value (5584–5593), so a previewed value is never mistaken for a no-op.
- px, %, px and close: `readValue` returns `26px`, equal to `previousValue`, so nothing is committed and the preview is rolled back (9458–9463).
- px, % and Enter commits `line-height: 144.44%` with `oldValue: 26px`. The unit change is the edit.
- Arrow steps use the precision already in the field (6783–6789), so `144.44` steps at two decimals. `scrubPrecisionMode` and its three consumers are untouched.
- Springs stay generative-only and their serialized value is unchanged. Only the moment of commit moves.
- Both keyboard propagation guards are untouched.
- `browser/raven-grab.js` and `web/public/raven-grab.js` stay byte-identical.
- `STYLE_CATEGORIES` is not edited, so the Grab payload contract is unchanged. `styleEdits[].newValue` already carries any unit.

## Customer check

- **Solo indie dev.** No setup change. The value on the page follows the field, and a unit change no longer breaks the layout.
- **Design-system-mature team.** The authored unit reaches the agent exactly as chosen (`144.44%`, `1.625rem`, unitless). Token-linked rows still refuse raw edits until detached.

## Tests

Existing tests that encode close-on-change must change in the same commit:

- `test/grab-bridge.test.mjs` has three `dispatch('change'` sites. The colour case at 5601–5603 asserts a committed edit straight after `change`; it needs an Enter or a flush first.
- `test/grab-overlay-easing-control.test.mjs` states at 105 and 485 that pointerup and every preset commit and destroy the editor. Its tests "dragging a handle rewrites the committed value" (358), "a preset writes the KEYWORD" (540) and the two cancelled-drag tests (454, 496) need a commit step or new expectations. This file is graded by mutants, so re-run the mutant matrix; survivors must be explained.
- `test/grab-overlay-spring-control.test.mjs`: "a spring preset commits a linear() that re-opens verbatim" (431) and "two different springs write two different curves" (480) need a commit step.
- Run the full suite to find the rest. Only the three files above were read.

New tests. Conversion depends on computed style, which the fake DOM cannot supply, so the conversion tests run in Chromium through `test/grab-panels-harness.mjs`. Each is proved by the kill procedure in `.claude/skills/grab-falsify-loop/SKILL.md`: it fails against a scratch overlay with the one change reverted (`RAVEN_GRAB_TEST_OVERLAY`), and passes against the real one.

| # | Behaviour | Reverted change that must make it fail |
|---|---|---|
| 1 | line-height 26px on 18px text: choose `%`. Field reads `144.44`, select reads `%`, the editor is still mounted, computed line-height is within 0.5px of 26 | Unit `change` calls `commit` |
| 2 | Then Enter: `styleEdits` holds line-height `26px` to `144.44%`, editor closed | |
| 3 | Escape after px to %: the inline style equals the value before the editor opened, no `styleEdits` entry | |
| 4 | px, %, em, px shows `26` | Convert from the displayed number, not the anchor |
| 5 | Typing `30` in the number field changes the computed line-height before Enter or blur | Remove the `input` listener |
| 6 | Changing a `display` select updates the page and leaves the editor mounted; Enter commits | Enum `change` calls `commit` |
| 7 | Colour panel `change` leaves the editor open; a press outside commits; `styleEdits` matches the inline style | Remove the outside-press listener |
| 8 | Colour chip, then a press outside: committed with its token name and path | Clear `pendingTokenPick` on preview |
| 9 | Two easing handle drags in one session; `pointercancel` during the second restores the first drag's result; Enter commits the final curve | `up` calls `commit` |
| 10 | Flex item width, px to %: select returns to px, number and page unchanged, status line set | Remove the before/after check |
| 11 | Stroke width unit select does not offer `%` | Remove the option filter |
| 12 | Typing `30%` into a px field sets the select to `%` and applies 30% | Restore the mismatch rejection at 6720 |
| 13 | Token-linked row: `input` events do not write to the page | Remove the linked guard in `previewCurrent` |
| 14 | 200ms to s shows `0.2`; computed duration unchanged | |
| 15 | Send while an editor holds a previewed value: the payload carries the edit | |

Verification before calling it done: `RAVEN_NO_USAGE_LOG=1 npm test` exits 0, `cmp browser/raven-grab.js web/public/raven-grab.js` is silent, an eyes-on pass in the harness on a page with real paragraph text repeats the reported steps, and the adverse review runs for at most three rounds.

## Phases

Each phase ships on its own.

1. **The reported bug.** Generic number editor: preview on `input`, unit change converts and stays open, conversion helpers, the check and refusal. Tests 1–5, 10, 14.
2. **Stay open everywhere.** Outside-press listener; enum, colour, easing, springs, text decoration, box shadow, overflow. Tests 6–9, 13, 15, plus the existing-test updates.
3. **The other unit selects.** Size and Stroke conversion, unit option filter, typed-unit switch, and D2 if accepted. Tests 11, 12.

## Decisions

Each has a default the spec is written to. Change any of them before the build.

| # | Decision | Default | Alternative |
|---|---|---|---|
| D1 | A conversion that cannot be checked or fails the check | Refuse the unit change and say why in the status line. A typed unit still works | Switch the unit and keep the number, which is today's behaviour and can break the layout |
| D2 | A unitless option in the line-height unit select | Yes. It is the form most design systems store, and Chromium renders it at full precision while it truncates a percentage to a whole percent | Leave the list as it is |
| D3 | Picks: colour chip, easing, spring and shadow presets, colour panel dismissed, handle released | Stay open like every other control, which is what R2 says | Keep closing on a pick, on the grounds that a pick is a finished choice |

## Not in this change

- A percentage base for width and height on flex and grid items. It needs the containing block resolved rather than measured.
- Debouncing live typing.
- Showing a preview in the change tray before commit.
- Bridge, payload-schema and MCP tool changes. None are needed.
