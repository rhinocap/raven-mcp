// Live style editing and unit conversion in the Grab overlay
// (docs/spec-grab-live-style-editing.md). Real Chromium: conversion reads
// computed style, which the fake DOM in grab-bridge.test.mjs cannot supply.
//
// The number after "T" in each name is the row in the spec's test table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectElement, sendBatch, shadowEval } from './grab-panels-harness.mjs';
import {
  run, openRow, editorState, chooseUnit, typeNumber, computed, px, inlineStyle, statusLine, sentStyleEdits
} from './grab-live-edit-helpers.mjs';

test('T1 line-height 26px on 18px text: choosing % shows 144.44, keeps the editor open and the paragraph unchanged', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    assert.deepEqual(
      await editorState(page, 'line-height').then((s) => [s.number, s.unit]),
      ['26', 'px']
    );
    const heightBefore = await page.evaluate(() => document.querySelector('#copy').getBoundingClientRect().height);

    await chooseUnit(page, 'line-height', '%');

    const state = await editorState(page, 'line-height');
    assert.equal(state.mounted, true, 'the unit select must not close the editor');
    assert.equal(state.number, '144.44');
    assert.equal(state.unit, '%');
    assert.equal(state.focusOnNumber, true, 'focus returns to the number field');
    assert.deepEqual(state.selection, [0, 6], 'the converted number is selected');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 144.44%;', 'the converted value is previewed on the page');
    const lineHeight = px(await computed(page, '#copy', 'line-height'));
    assert.ok(Math.abs(lineHeight - 26) <= 0.5, `computed line-height ${lineHeight}px is not within 0.5px of 26`);
    const heightAfter = await page.evaluate(() => document.querySelector('#copy').getBoundingClientRect().height);
    assert.ok(Math.abs(heightAfter - heightBefore) <= 2, `paragraph height moved from ${heightBefore} to ${heightAfter}`);
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);
  });
});

test('T2 line-height 26px on 18px text: choosing % then Enter commits 144.44% and closes the editor', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    assert.deepEqual(
      await editorState(page, 'line-height').then((s) => [s.number, s.unit]),
      ['26', 'px']
    );

    await chooseUnit(page, 'line-height', '%');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '144.44');
    await page.keyboard.press('Enter');

    const closed = await editorState(page, 'line-height');
    assert.equal(closed.mounted, false, 'Enter must close the editor');
    assert.equal(closed.text, '144.44%');

    await sendBatch(page);
    const edits = sentStyleEdits(grabBodies[grabBodies.length - 1]);
    assert.deepEqual(edits, [['line-height', '26px', '144.44%']], 'the agent receives this edit and no other');
  });
});

test('T3 choosing % then Escape cancels: no inline style, computed 26px, nothing to send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');

    await chooseUnit(page, 'line-height', '%');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '144.44');
    await page.keyboard.press('Escape');

    const closed = await editorState(page, 'line-height');
    assert.equal(closed.mounted, false, 'Escape must close the editor');
    assert.deepEqual([closed.text, closed.edited], ['26px', 'false'], 'the row reads its opening value and is not marked edited');
    assert.equal(await inlineStyle(page, '#copy'), '');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');
    assert.equal(
      await shadowEval(page, (root) => root.querySelector('[data-send-batch]').disabled),
      true,
      'a cancelled edit leaves nothing to send'
    );
  });
});

test('T4 %, em, px in one session converts from the unrounded anchor: 144.44, 1.444, 26; Enter commits nothing', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');

    await chooseUnit(page, 'line-height', '%');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '144.44');

    await chooseUnit(page, 'line-height', 'em');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '1.444');

    await chooseUnit(page, 'line-height', 'px');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '26');

    await page.keyboard.press('Enter');

    const closed = await editorState(page, 'line-height');
    assert.equal(closed.mounted, false);
    assert.equal(await inlineStyle(page, '#copy'), '', 'returning to the original value commits no inline style');
    assert.equal(
      await shadowEval(page, (root) => root.querySelector('[data-send-batch]').disabled),
      true,
      'back at the opening value, nothing is sent'
    );
  });
});

test('T4b typing 27 replaces the anchor: % reads 150, px reads 27 again', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');

    await typeNumber(page, 'line-height', '27');
    assert.equal(await computed(page, '#copy', 'line-height'), '27px');

    await chooseUnit(page, 'line-height', '%');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '150');

    await chooseUnit(page, 'line-height', 'px');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '27');
  });
});

test('T5 typing in the number field changes the computed line-height before Enter or blur', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');

    await typeNumber(page, 'line-height', '30');

    assert.equal(await computed(page, '#copy', 'line-height'), '30px');
    const state = await editorState(page, 'line-height');
    assert.equal(state.mounted, true);
    assert.equal(state.focusOnNumber, true);
  });
});

test('T5b every valid intermediate value is written; an unparseable entry keeps the last one; an emptied field shows the opening value', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');

    for (const text of ['1', '14', '144']) {
      await typeNumber(page, 'line-height', text);
      assert.equal(await computed(page, '#copy', 'line-height'), `${text}px`);
    }
    await typeNumber(page, 'line-height', '20');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 20px;');

    await typeNumber(page, 'line-height', '20+');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 20px;', 'an unparseable entry keeps the last valid preview');

    await typeNumber(page, 'line-height', '');
    assert.equal(await inlineStyle(page, '#copy'), '', 'an emptied field removes the preview');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');
    assert.equal((await editorState(page, 'line-height')).mounted, true);
  });
});

test('T1b an expression is evaluated before conversion: 24+4 px previews 28px and reads 155.56 after choosing %', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '24+4');
    assert.equal(await computed(page, '#copy', 'line-height'), '28px', 'the expression previews its result');

    await chooseUnit(page, 'line-height', '%');

    const state = await editorState(page, 'line-height');
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '155.56', '%']);
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 155.56%;');
  });
});

test('T5c a number the property rejects keeps the last valid preview', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;');

    await typeNumber(page, 'line-height', '-1');

    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;', 'a negative line-height is not valid CSS');
    assert.equal((await editorState(page, 'line-height')).mounted, true);
  });
});

test('T4d an unparseable field switches the unit with no conversion and no preview', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '20');
    await typeNumber(page, 'line-height', '20+');

    await chooseUnit(page, 'line-height', '%');

    const state = await editorState(page, 'line-height');
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '20+', '%']);
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 20px;', 'the page keeps the last valid preview');
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);
  });
});

test('T4c an empty field switches the unit with no conversion and no preview; a number typed next uses the new unit', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '');

    await chooseUnit(page, 'line-height', '%');

    let state = await editorState(page, 'line-height');
    assert.deepEqual([state.mounted, state.number, state.unit, state.focusOnNumber], [true, '', '%', true]);
    assert.equal(await inlineStyle(page, '#copy'), '', 'nothing is previewed for an empty field');
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);

    await typeNumber(page, 'line-height', '200');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 200%;');
    await chooseUnit(page, 'line-height', 'px');
    state = await editorState(page, 'line-height');
    assert.deepEqual([state.number, state.unit], ['36', 'px'], '200% of 18px is 36px');
  });
});

test('T10 gap on #row cannot convert px to %: refusal keeps 16px and reports an error', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#row');
    await openRow(page, 'gap');
    assert.deepEqual(
      await editorState(page, 'gap').then((s) => [s.number, s.unit]),
      ['16', 'px']
    );

    await chooseUnit(page, 'gap', '%');

    const state = await editorState(page, 'gap');
    assert.equal(state.mounted, true, 'a refused conversion must not close the editor');
    assert.equal(state.unit, 'px', 'the select goes back to the previous unit');
    assert.equal(state.number, '16', 'the number is unchanged');
    assert.equal(await computed(page, '#row', 'gap'), '16px');
    assert.equal(await inlineStyle(page, '#row'), '');
    // The status is set one tick after the change event.
    await page.waitForTimeout(50);
    assert.deepEqual(await statusLine(page), [
      { text: "Can't keep 16px when switching gap to % here", kind: 'error' }
    ]);
  });
});

test('T10c Enter after a refused conversion closes the editor and nothing is sent', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#row');
    await openRow(page, 'gap');
    await chooseUnit(page, 'gap', '%');
    assert.equal((await editorState(page, 'gap')).mounted, true);

    await page.keyboard.press('Enter');

    const state = await editorState(page, 'gap');
    assert.equal(state.mounted, false, 'Enter still closes the editor after a refusal');
    assert.equal(state.text, '16px');
    assert.equal(await computed(page, '#row', 'gap'), '16px');
    assert.equal(await inlineStyle(page, '#row'), '');
    const sendDisabled = await shadowEval(page, (root) => root.querySelector('[data-send-batch]').disabled);
    assert.equal(sendDisabled, true, 'nothing to send: the row was never changed');
  });
});

test('T14 transition-duration on #timed converts between s and ms from the unrounded value', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#timed');
    await openRow(page, 'transition-duration');
    assert.deepEqual(
      await editorState(page, 'transition-duration').then((s) => [s.number, s.unit]),
      ['0.2', 's']
    );

    await chooseUnit(page, 'transition-duration', 'ms');
    let state = await editorState(page, 'transition-duration');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '200');
    assert.equal(state.unit, 'ms');
    assert.equal(state.focusOnNumber, true);
    assert.equal(await computed(page, '#timed', 'transition-duration'), '0.2s');
    assert.equal(await inlineStyle(page, '#timed'), 'transition-duration: 200ms;', 'the converted value is previewed on the page');

    await chooseUnit(page, 'transition-duration', 's');
    state = await editorState(page, 'transition-duration');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '0.2');
    assert.equal(state.unit, 's');
    assert.equal(await computed(page, '#timed', 'transition-duration'), '0.2s');

    await chooseUnit(page, 'transition-duration', 'ms');
    await typeNumber(page, 'transition-duration', '250');
    await chooseUnit(page, 'transition-duration', 's');
    state = await editorState(page, 'transition-duration');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '0.25');
    assert.equal(state.unit, 's');
    assert.equal(await computed(page, '#timed', 'transition-duration'), '0.25s');
    assert.equal(await inlineStyle(page, '#timed'), 'transition-duration: 0.25s;');

    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);

    await page.keyboard.press('Enter');
    assert.equal(await editorState(page, 'transition-duration').then((s) => s.mounted), false);
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['transition-duration', '0.2s', '0.25s']]);
  });
});

test('T19 hover line-height row: choosing % converts against the hover rule font-size (26/36 = 72.22)', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hoverable');
    await openRow(page, 'line-height', 'hover');
    assert.deepEqual(
      await editorState(page, 'line-height', 'hover').then((s) => [s.number, s.unit]),
      ['26', 'px']
    );

    await chooseUnit(page, 'line-height', '%', 'hover');

    const state = await editorState(page, 'line-height', 'hover');
    assert.equal(state.mounted, true, 'the unit select must not close the editor');
    assert.equal(state.number, '72.22');
    assert.equal(state.unit, '%');
    assert.equal(state.focusOnNumber, true, 'focus returns to the number field');
    assert.deepEqual(state.selection, [0, 5], 'the converted number is selected');
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);
    const previewRule = await page.evaluate(() => {
      const node = document.querySelector('[data-raven-grab-state-preview]');
      return node ? node.textContent : '';
    });
    assert.match(previewRule, /^[^{]*hoverable[^{]*:hover \{ line-height: 72\.22% !important; \}$/, 'one rule, for this element\'s hover state, carries the converted value');
    assert.ok(!previewRule.includes(':focus'), `the preview must not reach the focus state: ${previewRule}`);
    assert.equal(await inlineStyle(page, '#hoverable'), '', 'a hover row writes no resting inline style');
  });
});

test('T19b hover line-height row: % then em shows 0.722, then px shows 26 again', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hoverable');
    await openRow(page, 'line-height', 'hover');

    await chooseUnit(page, 'line-height', 'em', 'hover');
    let state = await editorState(page, 'line-height', 'hover');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '0.722');
    assert.equal(state.unit, 'em');

    await chooseUnit(page, 'line-height', 'px', 'hover');
    state = await editorState(page, 'line-height', 'hover');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '26');
    assert.equal(state.unit, 'px');
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);
  });
});

test('T19c resting line-height row on #hoverable: choosing % converts against the resting 18px font-size (144.44)', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hoverable');
    await openRow(page, 'line-height');
    assert.deepEqual(
      await editorState(page, 'line-height').then((s) => [s.number, s.unit]),
      ['26', 'px']
    );

    await chooseUnit(page, 'line-height', '%');

    const state = await editorState(page, 'line-height');
    assert.equal(state.mounted, true, 'the unit select must not close the editor');
    assert.equal(state.number, '144.44');
    assert.equal(state.unit, '%');
    assert.equal(state.focusOnNumber, true, 'focus returns to the number field');
    assert.deepEqual(state.selection, [0, 6], 'the converted number is selected');
    assert.equal(await inlineStyle(page, '#hoverable'), 'line-height: 144.44%;', 'the resting row previews on the element');
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);
  });
});

test('T19d hover row whose rule sets font-size in em: ch, em and % are refused, pt converts (30px is 22.5pt)', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hover-em');
    await openRow(page, 'line-height', 'hover');
    assert.deepEqual(
      await editorState(page, 'line-height', 'hover').then((s) => [s.number, s.unit]),
      ['30', 'px']
    );

    for (const unit of ['ch', 'em', '%']) {
      await chooseUnit(page, 'line-height', unit, 'hover');
      await page.waitForTimeout(50);
      const refused = await editorState(page, 'line-height', 'hover');
      assert.equal(refused.mounted, true, `the editor stays open after a refused ${unit}`);
      assert.deepEqual([refused.number, refused.unit], ['30', 'px'], `a font-relative ${unit} has no base here and must be refused`);
      assert.deepEqual(await statusLine(page), [
        { text: `Can't keep 30px when switching line-height to ${unit} here`, kind: 'error' }
      ]);
    }

    await chooseUnit(page, 'line-height', 'pt', 'hover');
    const converted = await editorState(page, 'line-height', 'hover');
    assert.deepEqual([converted.number, converted.unit], ['22.5', 'pt']);
  });
});

test('T20 Escape reverts #pad padding after a % conversion; a refused % conversion on #timed-row gap leaves the inline style untouched', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'padding');
    assert.deepEqual(
      await editorState(page, 'padding').then((s) => [s.number, s.unit]),
      ['13', 'px']
    );

    await chooseUnit(page, 'padding', '%');

    const state = await editorState(page, 'padding');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '2.5');
    assert.equal(state.unit, '%');
    const styleDuring = await inlineStyle(page, '#pad');
    assert.equal(styleDuring, 'transition-duration: 1s; padding: 2.5%;', 'only the padding declaration is added');

    await page.keyboard.press('Escape');

    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s;');
    const after = await editorState(page, 'padding');
    assert.equal(after.mounted, false);
    assert.equal(after.text, '13px');
    assert.notEqual(after.edited, 'true');
  });

  await run(t, async (page) => {
    await selectElement(page, '#timed-row');
    await openRow(page, 'gap');
    assert.deepEqual(
      await editorState(page, 'gap').then((s) => [s.number, s.unit]),
      ['16', 'px']
    );

    await chooseUnit(page, 'gap', '%');

    const state = await editorState(page, 'gap');
    assert.equal(state.mounted, true, 'a refused conversion keeps the editor open');
    assert.equal(state.number, '16');
    assert.equal(state.unit, 'px', 'the select goes back to the previous unit');
    assert.equal(await inlineStyle(page, '#timed-row'), 'transition-duration: 1s;');
    // The status is set one tick after the change event.
    await page.waitForTimeout(50);
    assert.deepEqual(await statusLine(page), [
      { text: "Can't keep 16px when switching gap to % here", kind: 'error' }
    ]);
  });
});

test('T20b Escape restores inline padding sides whose priorities differ, which the shorthand cannot express', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#mixed');
    // Declaration order is not preserved by a restore; each side's value and priority is.
    const sides = () => page.evaluate(() => {
      const style = document.querySelector('#mixed').style;
      return ['top', 'right', 'bottom', 'left'].map((side) => [
        style.getPropertyValue('padding-' + side), style.getPropertyPriority('padding-' + side)
      ]);
    });
    const before = await sides();
    assert.deepEqual(before, [['13px', 'important'], ['13px', ''], ['13px', ''], ['13px', '']]);
    await openRow(page, 'padding');
    await typeNumber(page, 'padding', '14');
    assert.equal(await computed(page, '#mixed', 'padding-top'), '14px', 'typing previews on the page');
    assert.equal(await computed(page, '#mixed', 'padding-left'), '14px');

    await page.keyboard.press('Escape');

    assert.equal((await editorState(page, 'padding')).mounted, false, 'Escape must close the editor');
    assert.deepEqual(await sides(), before, 'every side and its priority is back');
    assert.equal(await computed(page, '#mixed', 'padding-top'), '13px');
  });
});

test('T20c Escape restores a sibling\'s inline padding sides when the edit applies to all siblings', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#card-a');
    const scopeOn = await shadowEval(page, (root) => {
      const button = root.querySelector('[data-edit-scope="component"]');
      if (!button) return null;
      button.click();
      return root.querySelector('.raven-grab-scope').getAttribute('data-scope-value');
    });
    assert.equal(scopeOn, 'component', 'the fixture must offer the all-siblings scope');
    const sides = () => page.evaluate(() => {
      const style = document.querySelector('#card-b').style;
      return ['top', 'right', 'bottom', 'left'].map((side) => [
        style.getPropertyValue('padding-' + side), style.getPropertyPriority('padding-' + side)
      ]);
    });
    const before = await sides();
    assert.deepEqual(before, [['13px', 'important'], ['13px', ''], ['13px', ''], ['13px', '']]);
    await openRow(page, 'padding');
    await typeNumber(page, 'padding', '14');
    assert.equal(await computed(page, '#card-a', 'padding-top'), '14px', 'typing previews on the selected card');
    assert.equal(await computed(page, '#card-b', 'padding-left'), '14px', 'and on its sibling');

    await page.keyboard.press('Escape');

    assert.equal((await editorState(page, 'padding')).mounted, false, 'Escape must close the editor');
    assert.equal(await inlineStyle(page, '#card-a'), 'padding: 13px;');
    assert.deepEqual(await sides(), before, 'every side of the sibling and its priority is back');
    assert.equal(await computed(page, '#card-b', 'padding-left'), '13px');
  });
});

test('T21 typing 30 then choosing % in one shadowEval on #eased line-height converts to 166.67 and the transition settles at 30px', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#eased');
    await openRow(page, 'line-height');
    assert.deepEqual(
      await editorState(page, 'line-height').then((s) => [s.number, s.unit]),
      ['26', 'px']
    );

    await shadowEval(page, (root) => {
      const input = root.querySelector('li[data-style-property="line-height"]:not([data-style-state]) .raven-grab-style-editor input.raven-grab-style-input');
      const select = root.querySelector('li[data-style-property="line-height"]:not([data-style-state]) .raven-grab-style-editor select.raven-grab-style-unit');
      if (!input || !select) throw new Error('editor fields missing');
      input.focus();
      input.value = '30';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      select.value = '%';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const state = await editorState(page, 'line-height');
    assert.equal(state.mounted, true);
    assert.equal(state.number, '166.67');
    assert.equal(await inlineStyle(page, '#eased'), 'line-height: 166.67%;', 'the converted value is previewed on the page');
    assert.equal(state.unit, '%');
    assert.equal(state.focusOnNumber, true);
    assert.deepEqual(state.selection, [0, 6]);
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);

    await page.waitForTimeout(1200);
    const lineHeight = px(await computed(page, '#eased', 'line-height'));
    assert.ok(Math.abs(lineHeight - 30) <= 0.5, `computed line-height ${lineHeight}px is not within 0.5px of 30`);
  });
});

// 1ch in the font of `selector`'s parent, which is what ch means inside font-size.
function parentChPx(page, selector) {
  return page.evaluate((sel) => {
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;visibility:hidden;padding:0;border:0;width:100ch;';
    document.querySelector(sel).parentElement.appendChild(span);
    const width = span.getBoundingClientRect().width;
    span.remove();
    return width / 100;
  }, selector);
}

test('T19e font-size to ch converts against the parent font, on the resting row and on the hover row', async (t) => {
  await run(t, async (page) => {
    const ch = await parentChPx(page, '#copy');
    assert.ok(ch > 0, 'the fixture parent has a measurable ch');

    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    assert.deepEqual(await editorState(page, 'font-size').then((s) => [s.number, s.unit]), ['18', 'px']);
    await chooseUnit(page, 'font-size', 'ch');
    await page.waitForTimeout(50);
    const resting = await editorState(page, 'font-size');
    assert.equal(resting.unit, 'ch', 'the conversion is accepted');
    assert.ok(Math.abs(Number(resting.number) * ch - 18) < 0.05, `${resting.number}ch at ${ch}px per ch is not 18px`);
    assert.ok(Math.abs(px(await computed(page, '#copy', 'font-size')) - 18) <= 0.5, 'the text keeps its size');
    assert.deepEqual(await statusLine(page).then((lines) => lines.filter((l) => l.kind === 'error')), []);
    await page.keyboard.press('Escape');

    await selectElement(page, '#hoverable');
    await openRow(page, 'font-size', 'hover');
    assert.deepEqual(await editorState(page, 'font-size', 'hover').then((s) => [s.number, s.unit]), ['36', 'px']);
    await chooseUnit(page, 'font-size', 'ch', 'hover');
    const hover = await editorState(page, 'font-size', 'hover');
    assert.equal(hover.unit, 'ch');
    assert.ok(Math.abs(Number(hover.number) * ch - 36) < 0.05, `${hover.number}ch at ${ch}px per ch is not 36px`);
  });
});

test('T22 a held preview on two selected layers is undone on the one that stays when the page removes the primary', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    const at = await page.evaluate(() => {
      const rect = document.querySelector('#hoverable').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.keyboard.down('Shift');
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(150);
    // Move off the paragraph so its hover rule does not apply.
    await page.mouse.move(5, 5);

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;', 'the preview reaches both layers');
    assert.equal(await inlineStyle(page, '#hoverable'), 'line-height: 30px;');

    await page.evaluate(() => document.querySelector('#hoverable').remove());
    // The field is still open and still accepts typing.
    await typeNumber(page, 'line-height', '8');
    assert.equal(await inlineStyle(page, '#copy'), '', 'the layer that stays is back to the value it opened with');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');

    // An arrow step in the same field writes nothing either.
    await page.keyboard.press('ArrowUp');
    assert.equal(await inlineStyle(page, '#copy'), '', 'an arrow step does not reach the promoted layer');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');

    await page.keyboard.press('Escape');
    assert.equal(await inlineStyle(page, '#copy'), '');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');
    assert.equal(
      await shadowEval(page, (root) => root.querySelector('[data-send-batch]').disabled),
      true,
      'nothing was recorded, so there is nothing to send'
    );
  });
});

// Two layers selected, `#hoverable` the primary, and an image upload that never
// finishes: the draft is kept for its attachment when the page removes the primary.
async function selectTwoWithPendingUpload(page) {
  await page.route((url) => url.pathname === '/attachment', () => {});
  await selectElement(page, '#copy');
  const at = await page.evaluate(() => {
    const rect = document.querySelector('#hoverable').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.keyboard.down('Shift');
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
  await page.mouse.move(5, 5);
}

function startPendingUpload(page) {
  return page.evaluate(() => {
    window.__ravenGrabPanels.uploadAttachmentFile(new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' }), 'paste');
  });
}

test('T22c with an upload pending, a held preview is undone on the layer that stays when the page removes the primary', async (t) => {
  await run(t, async (page) => {
    await selectTwoWithPendingUpload(page);
    await startPendingUpload(page);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('[data-attachment-chip][data-state="uploading"]'));
    }, null, { timeout: 5000 });

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;');

    await page.evaluate(() => document.querySelector('#hoverable').remove());
    await typeNumber(page, 'line-height', '31');
    assert.equal(await inlineStyle(page, '#copy'), '', 'the kept draft records no line-height, so the page shows none');

    await page.keyboard.press('Escape');
    assert.equal(await inlineStyle(page, '#copy'), '');
    assert.equal(await computed(page, '#copy', 'line-height'), '26px');
  }, { expose: ['uploadAttachmentFile'] });
});

test('T22d with an upload pending, a preview over a recorded edit goes back to the recorded value when the page removes the primary', async (t) => {
  await run(t, async (page) => {
    await selectTwoWithPendingUpload(page);
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 28px;');

    await startPendingUpload(page);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('[data-attachment-chip][data-state="uploading"]'));
    }, null, { timeout: 5000 });

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '31');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 31px;');

    await page.evaluate(() => document.querySelector('#hoverable').remove());
    await typeNumber(page, 'line-height', '32');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 28px;', 'the kept draft records 28px');
  }, { expose: ['uploadAttachmentFile'] });
});

test('T4e an arrow step replaces the anchor: 26px, ArrowUp, then % reads 150 and the page shows 27px', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await chooseUnit(page, 'line-height', '%');
    await chooseUnit(page, 'line-height', 'px');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '26');

    await page.keyboard.press('ArrowUp');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '27');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 27px;', 'the step is previewed');

    await chooseUnit(page, 'line-height', '%');
    const state = await editorState(page, 'line-height');
    assert.deepEqual([state.number, state.unit, state.mounted], ['150', '%', true]);
  });
});

test('T19g hover row whose rule sets the font shorthand: em uses the size inside it', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hover-short');
    await openRow(page, 'margin-top', 'hover');
    assert.deepEqual(
      await editorState(page, 'margin-top', 'hover').then((s) => [s.number, s.unit]),
      ['20', 'px']
    );

    // `font: 24px serif` sets the hover font size. 20px is 0.833em of 24px,
    // not 1.111em of the resting 18px.
    await chooseUnit(page, 'margin-top', 'em', 'hover');
    const converted = await editorState(page, 'margin-top', 'hover');
    assert.equal(converted.mounted, true);
    assert.deepEqual([converted.number, converted.unit], ['0.833', 'em']);
  });
});

test('T19h hover rows font-size then font edited in one session: em uses the later edit', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hover-both');
    await openRow(page, 'font-size', 'hover');
    await typeNumber(page, 'font-size', '20', 'hover');
    await page.keyboard.press('Enter');
    await openRow(page, 'font', 'hover');
    await typeNumber(page, 'font', '40px serif', 'hover');
    await page.keyboard.press('Enter');

    // Both edits are injected !important in the order they were made, so the
    // hover size is the shorthand's 40px. 20px is 0.5em of it.
    await openRow(page, 'margin-top', 'hover');
    await chooseUnit(page, 'margin-top', 'em', 'hover');
    const converted = await editorState(page, 'margin-top', 'hover');
    assert.deepEqual([converted.number, converted.unit], ['0.5', 'em']);
  });
});

test('T19f hover row whose rule changes the font family: ch is refused, em converts', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hover-face');
    await openRow(page, 'line-height', 'hover');
    assert.deepEqual(
      await editorState(page, 'line-height', 'hover').then((s) => [s.number, s.unit]),
      ['27', 'px']
    );

    await chooseUnit(page, 'line-height', 'ch', 'hover');
    await page.waitForTimeout(50);
    const refused = await editorState(page, 'line-height', 'hover');
    assert.equal(refused.mounted, true, 'the editor stays open after the refusal');
    assert.deepEqual([refused.number, refused.unit], ['27', 'px'], 'the hover font is not the one that can be measured');
    assert.deepEqual(await statusLine(page), [
      { text: "Can't keep 27px when switching line-height to ch here", kind: 'error' }
    ]);

    await chooseUnit(page, 'line-height', 'em', 'hover');
    const converted = await editorState(page, 'line-height', 'hover');
    assert.deepEqual([converted.number, converted.unit], ['1.5', 'em'], 'em does not depend on the font face');
  });
});

test('T23 a preview held in an open editor is still on the page after a finished send rebases the drafts', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return !root.querySelector('.raven-grab-style-editor');
    }, null, { timeout: 5000 });
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 28px;');

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;');

    // What a finished dispatch does to every draft, the one being edited included.
    await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
    const state = await editorState(page, 'line-height');
    assert.deepEqual([state.mounted, state.number], [true, '30'], 'the editor is still open on 30');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;', 'the page shows what the field shows');

    await page.keyboard.press('Escape');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 28px;', 'Escape goes back to the recorded edit');
  }, { expose: ['rebaseNextDrafts'] });
});

test('T14b a duration too small for the unit is refused: 0.4ms does not become 0s', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#timed');
    await openRow(page, 'transition-duration');
    await chooseUnit(page, 'transition-duration', 'ms');
    await typeNumber(page, 'transition-duration', '0.4');
    assert.equal(await inlineStyle(page, '#timed'), 'transition-duration: 0.4ms;');

    await chooseUnit(page, 'transition-duration', 's');
    await page.waitForTimeout(50);
    const state = await editorState(page, 'transition-duration');
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '0.4', 'ms'], 'the field keeps the value that was typed');
    assert.equal(await inlineStyle(page, '#timed'), 'transition-duration: 0.4ms;', 'the page keeps it too');
    assert.deepEqual(await statusLine(page), [
      { text: "Can't keep 0.4ms when switching transition-duration to s here", kind: 'error' }
    ]);
  });
});

// Where the Send button is and whether a press on it does anything.
function sendButton(page) {
  return shadowEval(page, (root) => {
    const button = root.querySelector('[data-send-batch]');
    const rect = button.getBoundingClientRect();
    return { disabled: button.disabled, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

test('T24 Send while the editor holds a converted value: one press sends 26px to 144.44%', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await chooseUnit(page, 'line-height', '%');
    assert.equal(await editorState(page, 'line-height').then((s) => s.mounted), true, 'the editor is still open');

    const button = await sendButton(page);
    assert.equal(button.disabled, false, 'Send is enabled while the editor holds a changed value');

    const response = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/grab');
    await page.mouse.click(button.x, button.y);
    await response;
    assert.equal(grabBodies.length, 1, 'one press sends');
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['line-height', '26px', '144.44%']]);
  });
});

test('T24b Send follows the held value: enabled when it differs from the opening value, disabled when it does not', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'an editor that changed nothing leaves Send disabled');

    await chooseUnit(page, 'line-height', '%');
    assert.equal(await sendButton(page).then((b) => b.disabled), false);
    await chooseUnit(page, 'line-height', 'px');
    assert.equal(await editorState(page, 'line-height').then((s) => s.number), '26');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'back at 26px there is nothing to send');

    await typeNumber(page, 'line-height', '30');
    assert.equal(await sendButton(page).then((b) => b.disabled), false);
    await typeNumber(page, 'line-height', '');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'an emptied field goes back to the opening value');

    await typeNumber(page, 'line-height', '31');
    assert.equal(await sendButton(page).then((b) => b.disabled), false);
    await page.keyboard.press('Escape');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'Escape leaves nothing to send');
  });
});
