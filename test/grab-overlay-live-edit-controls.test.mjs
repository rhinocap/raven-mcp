// Live style editing, phase 2: every control previews and the editor closes
// only on Enter, a press outside, Escape or a flush
// (docs/spec-grab-live-style-editing.md, R1 and R2), and phase 3: the Size and
// Stroke unit selects (R3). Real Chromium.
//
// The number after "T" in each name is the row in the spec's test table; the
// rows past 21 cover defects found while building.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectElement, sendBatch, shadowEval } from './grab-panels-harness.mjs';
import {
  run, openRow, editorState, chooseUnit, typeNumber, computed, inlineStyle, statusLine, sentStyleEdits, LIVE_FIXTURE_PATH
} from './grab-live-edit-helpers.mjs';

const ROW = (property, state) => (state
  ? `li[data-style-property="${property}"][data-style-state="${state}"]`
  : `li[data-style-property="${property}"]:not([data-style-state])`);

// The live fixture with extra rules appended to its stylesheet.
async function fixtureWith(css) {
  const base = await readFile(LIVE_FIXTURE_PATH, 'utf8');
  return base.replace('</style>', css + '\n</style>');
}

// Set a control inside the open editor and fire the events a user's change fires.
function setControl(page, property, selector, value, events) {
  return shadowEval(page, (root, arg) => {
    const control = root.querySelector(arg.row + ' .raven-grab-style-editor ' + arg.selector);
    if (!control) throw new Error('no control ' + arg.selector);
    control.focus();
    control.value = arg.value;
    if (control.value !== arg.value) throw new Error('control refused ' + arg.value + ', reads ' + control.value);
    arg.events.forEach((name) => control.dispatchEvent(new Event(name, { bubbles: true })));
    return true;
  }, { row: ROW(property), selector, value, events });
}

function focusControl(page, property, selector) {
  return shadowEval(page, (root, arg) => {
    const control = root.querySelector(arg.row + ' .raven-grab-style-editor ' + arg.selector);
    if (!control) throw new Error('no control ' + arg.selector);
    control.focus();
    return root.activeElement === control;
  }, { row: ROW(property), selector });
}

function editorOpen(page, property, state) {
  return shadowEval(page, (root, sel) => Boolean(root.querySelector(sel + ' .raven-grab-style-editor')), ROW(property, state));
}

function waitEditorClosed(page, property, state) {
  return page.waitForFunction((sel) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return !root.querySelector(sel + ' .raven-grab-style-editor');
  }, ROW(property, state), { timeout: 5000 });
}

// A press on the page, away from the panel, the editor and every fixture element.
async function pressOutside(page) {
  await page.mouse.click(5, 5);
}

// A press inside the panel on something that takes no focus: a section title.
async function pressPanelTitle(page) {
  const point = await shadowEval(page, (root) => {
    const titles = Array.from(root.querySelectorAll('.raven-grab-section-title'));
    for (const title of titles) {
      const rect = title.getBoundingClientRect();
      const x = rect.left + 4;
      const y = rect.top + rect.height / 2;
      if (rect.width > 0 && rect.height > 0 && root.elementFromPoint(x, y) === title) return { x, y };
    }
    throw new Error('no section title on screen');
  });
  await page.mouse.click(point.x, point.y);
}

function sendButton(page) {
  return shadowEval(page, (root) => {
    const button = root.querySelector('[data-send-batch]');
    const label = button.querySelector('.raven-grab-send-label');
    const rect = button.getBoundingClientRect();
    return {
      disabled: button.disabled,
      label: label ? label.textContent : button.textContent,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
}

function grabResponse(page) {
  return page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/grab');
}

test('T6 picking block in the display select previews it and leaves the editor open; Enter commits one edit', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#row');
    await openRow(page, 'display');
    await setControl(page, 'display', 'select.raven-grab-style-select', 'block', ['input', 'change']);

    assert.equal(await editorOpen(page, 'display'), true, 'a pick must not close the editor');
    assert.equal(await computed(page, '#row', 'display'), 'block', 'the pick is previewed on the page');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held pick can be sent');

    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'display');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['display', 'flex', 'block']]);
  });
});

test('T6b a second pick in the display select replaces the first; Escape puts the page back', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#row');
    await openRow(page, 'display');
    await setControl(page, 'display', 'select.raven-grab-style-select', 'block', ['input', 'change']);
    await setControl(page, 'display', 'select.raven-grab-style-select', 'grid', ['input', 'change']);
    assert.equal(await editorOpen(page, 'display'), true);
    assert.equal(await computed(page, '#row', 'display'), 'grid');

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'display');
    assert.equal(await inlineStyle(page, '#row'), '', 'Escape leaves no inline style');
    assert.equal(await computed(page, '#row', 'display'), 'flex');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing was recorded');
  });
});

test('T7 the native colour input previews on input and on change without closing; a press outside commits', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#ff0000', ['input']);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(255, 0, 0)', 'input previews');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    assert.equal(await editorOpen(page, 'color'), true, 'the colour panel closing (change) must not close the editor');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held colour can be sent');

    // Focus sits on the native colour input, which has no blur commit (its OS
    // panel blurs it on opening). Only the press outside can close the editor.
    await focusControl(page, 'color', 'input.raven-grab-color-input');
    assert.equal(await editorOpen(page, 'color'), true, 'moving focus inside the editor keeps it open');
    await pressOutside(page);
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)', 'the press outside commits, it does not cancel');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    const edits = sentStyleEdits(grabBodies[0]);
    assert.deepEqual(edits.map((edit) => [edit[0], edit[2]]), [['color', '#00ff00']]);
  });
});

test('T7c with focus on the native colour input, a press on a panel title commits the held colour', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    // The native colour input has no blur commit, and a section title takes no
    // focus, so nothing but the outside press closes this editor.
    assert.equal(await focusControl(page, 'color', 'input.raven-grab-color-input'), true);
    assert.equal(await editorOpen(page, 'color'), true);

    await pressPanelTitle(page);
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)', 'the press commits, it does not cancel');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    assert.deepEqual(sentStyleEdits(grabBodies[0]).map((edit) => [edit[0], edit[2]]), [['color', '#00ff00']]);
  });
});

test('T7b Enter on the native colour input commits; Escape on it cancels', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#ff0000', ['input', 'change']);
    assert.equal(await focusControl(page, 'color', 'input.raven-grab-color-input'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'color');
    assert.equal(await inlineStyle(page, '#swatch'), '', 'Escape on the colour input cancels');

    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#ff0000', ['input', 'change']);
    assert.equal(await focusControl(page, 'color', 'input.raven-grab-color-input'), true);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'color');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]).map((edit) => [edit[0], edit[2]]), [['color', '#ff0000']]);
  });
});

test('T8 a token chip pick previews and stays open; the press outside commits it with its token', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    const chip = await shadowEval(page, (root, row) => {
      const button = root.querySelector(row + ' .raven-grab-style-editor button.raven-grab-color-suggestion[data-color-source="token"]');
      if (!button) return null;
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { value: button.getAttribute('data-color-suggestion'), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, ROW('color'));
    assert.ok(chip, 'the DESIGN.md colour token renders as a chip');
    await page.mouse.click(chip.x, chip.y);

    assert.equal(await editorOpen(page, 'color'), true, 'a chip pick must not close the editor');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(255, 255, 255)', 'the pick is previewed');

    await pressOutside(page);
    await waitEditorClosed(page, 'color');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    const edit = grabBodies[0].styleEdits.find((entry) => entry.property === 'color');
    assert.ok(edit, 'the colour edit is sent');
    assert.equal(chip.value, '#ffffff');
    assert.equal(edit.newValue, 'rgb(255, 255, 255)', 'recorded in the format the row shows');
    assert.equal(edit.tokenPath, 'color.text.primary', 'the edit keeps the token the chip stood for');
    assert.ok(edit.token, 'and its name');
  });
});

test('T8b typing after a chip pick drops the token: the committed edit is a raw colour', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await shadowEval(page, (root, row) => {
      root.querySelector(row + ' .raven-grab-style-editor button.raven-grab-color-suggestion[data-color-source="token"]').click();
    }, ROW('color'));
    await setControl(page, 'color', 'input.raven-grab-style-input', '#123456', ['input']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'color');
    await sendBatch(page);
    const edit = grabBodies[0].styleEdits.find((entry) => entry.property === 'color');
    assert.equal(edit.newValue, 'rgb(18, 52, 86)', 'recorded in the format the row shows');
    assert.equal(edit.tokenPath, undefined, 'a typed colour is not a token pick');
  });
});

test('T13 a token-linked colour row writes nothing while typing, and a press outside closes it with nothing recorded', async (t) => {
  const html = await fixtureWith('  :root { --color-text-primary: #ffffff; }\n  #swatch { color: var(--color-text-primary); }');
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    const linked = await shadowEval(page, (root, row) => root.querySelector(row + ' .raven-grab-style-editor').getAttribute('data-token-linked'), ROW('color'));
    assert.equal(linked, 'true', 'the fixture binds the row to a token');

    await setControl(page, 'color', 'input.raven-grab-style-input', '#ff0000', ['input']);
    assert.equal(await inlineStyle(page, '#swatch'), '', 'typing in a token-linked editor writes nothing');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(255, 255, 255)');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'and holds nothing to send');

    await pressOutside(page);
    await waitEditorClosed(page, 'color');
    assert.equal(await inlineStyle(page, '#swatch'), '', 'the press outside dismisses it without a write');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
  }, { html });
});

// The box-model diagram's field for one side.
async function openBoxField(page, property) {
  const point = await shadowEval(page, (root, prop) => {
    const cell = Array.from(root.querySelectorAll('[data-box-prop="' + prop + '"]')).find((node) => node.getClientRects().length);
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, property);
  if (!point) throw new Error('no box cell for ' + property);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((prop) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector('[data-box-input="' + prop + '"]'));
  }, property, { timeout: 5000 });
}

function typeBoxField(page, property, text) {
  return shadowEval(page, (root, arg) => {
    const input = root.querySelector('[data-box-input="' + arg.property + '"]');
    if (!input) throw new Error('no box field for ' + arg.property);
    input.focus();
    input.value = arg.text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { property, text });
}

function boxFieldOpen(page, property) {
  return shadowEval(page, (root, prop) => Boolean(root.querySelector('[data-box-input="' + prop + '"]')), property);
}

test('T16 typing in the box-model padding-top field previews on the page; Escape restores 13px', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openBoxField(page, 'padding-top');
    await typeBoxField(page, 'padding-top', '20');

    assert.equal(await boxFieldOpen(page, 'padding-top'), true, 'typing must not close the field');
    // #pad animates every property over 1s, so the write is read from the inline style.
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; padding-top: 20px;', 'typing previews before Enter or blur');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held number can be sent');

    await typeBoxField(page, 'padding-top', '2x');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; padding-top: 20px;', 'an unparseable entry keeps the last preview');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return !root.querySelector('[data-box-input="padding-top"]');
    }, null, { timeout: 5000 });
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s;', 'Escape leaves the inline style as it was');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
  });
});

test('T16b Send while the box-model field holds a typed number: one press sends it', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await openBoxField(page, 'padding-top');
    await typeBoxField(page, 'padding-top', '20');
    const button = await sendButton(page);
    assert.equal(button.disabled, false);
    const response = grabResponse(page);
    await page.mouse.click(button.x, button.y);
    await response;
    assert.equal(grabBodies.length, 1, 'one press sends');
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['padding-top', '13px', '20px']]);
  });
});

test('T17 the text-decoration editor previews a typed colour and a line pick without closing; Escape restores', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    const before = {
      color: await computed(page, '#swatch', 'text-decoration-color'),
      line: await computed(page, '#swatch', 'text-decoration-line')
    };
    assert.equal(before.line, 'underline');
    await openRow(page, 'text-decoration');

    await setControl(page, 'text-decoration', 'input.raven-grab-style-input[aria-label="Text decoration color value"]', 'red', ['input']);
    assert.equal(await computed(page, '#swatch', 'text-decoration-color'), 'rgb(255, 0, 0)', 'a typed colour previews before blur');
    assert.equal(await editorOpen(page, 'text-decoration'), true);

    await setControl(page, 'text-decoration', 'select[aria-label="Text decoration line"]', 'line-through', ['input', 'change']);
    assert.equal(await editorOpen(page, 'text-decoration'), true, 'a line pick must not close the editor');
    assert.equal(await computed(page, '#swatch', 'text-decoration-line'), 'line-through');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held decoration can be sent');

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'text-decoration');
    assert.equal(await computed(page, '#swatch', 'text-decoration-color'), before.color);
    assert.equal(await computed(page, '#swatch', 'text-decoration-line'), 'underline');
    assert.equal(await inlineStyle(page, '#swatch'), '');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
  });
});

test('T24c a slow press on Send while the editor holds a value still sends it once', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await chooseUnit(page, 'line-height', '%');
    const button = await sendButton(page);
    assert.equal(button.disabled, false);

    // Longer between press and release than the one-tick deferral of an outside
    // press: the button under the pointer must still be the one that was pressed.
    const response = grabResponse(page);
    await page.mouse.move(button.x, button.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await response;
    await page.waitForTimeout(100);
    assert.equal(grabBodies.length, 1, 'one press sends once');
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['line-height', '26px', '144.44%']]);
  });
});

test('T25 Enter on the unit select commits the editor; Escape on it cancels', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await focusControl(page, 'line-height', 'select.raven-grab-style-unit'), true);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;', 'Enter on the unit select commits');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '34');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 34px;');
    assert.equal(await focusControl(page, 'line-height', 'select.raven-grab-style-unit'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'line-height');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;', 'Escape on the unit select goes back to the recorded edit');
  });
});

test('T26 an overflow pick previews, stays open and enables Send; one press sends it', async (t) => {
  const html = await fixtureWith('  #pad { overflow: hidden; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await openRow(page, 'overflow');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'auto', ['input', 'change']);

    assert.equal(await editorOpen(page, 'overflow'), true, 'a pick must not close the editor');
    assert.equal(await computed(page, '#pad', 'overflow-x'), 'auto');
    const button = await sendButton(page);
    assert.equal(button.disabled, false, 'the held pick can be sent');

    const response = grabResponse(page);
    await page.mouse.click(button.x, button.y);
    await response;
    assert.equal(grabBodies.length, 1, 'one press sends');
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['overflow', 'hidden', 'auto hidden']]);
  }, { html });
});

test('T26b picking the opening overflow value again leaves nothing to send', async (t) => {
  const html = await fixtureWith('  #pad { overflow: hidden; }');
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'overflow');
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'auto', ['input', 'change']);
    assert.equal(await sendButton(page).then((b) => b.disabled), false);
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'hidden', ['input', 'change']);
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'back at hidden there is nothing to send');
  }, { html });
});

test('T27 Send follows a dispatch that finishes while an editor holds a value', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await editorOpen(page, 'line-height'), true);

    // Read in the same turn as the finish: the label goes back to idle after the hold.
    const done = await shadowEval(page, (root) => {
      window.__ravenGrabPanels.finishActiveDispatch();
      const button = root.querySelector('[data-send-batch]');
      const label = button.querySelector('.raven-grab-send-label');
      return { hold: window.__ravenGrabPanels.SEND_TIMINGS.hold, label: label ? label.textContent : button.textContent };
    });
    assert.match(done.label, /applied|Sent locally|Preview only/, 'the finished dispatch is reported while the editor is open');

    await page.waitForTimeout(done.hold + 300);
    assert.equal(await editorOpen(page, 'line-height'), true, 'the editor stayed open throughout');
    const after = await sendButton(page);
    assert.deepEqual([after.disabled, after.label], [false, 'Send 1 change'], 'once the dispatch is over the held value can be sent');
  }, { expose: ['finishActiveDispatch', 'SEND_TIMINGS'] });
});

test('T28 a rebase while a hover preview is held does not record the preview as the hover rule value', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#hoverable');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');

    await openRow(page, 'font-size', 'hover');
    await typeNumber(page, 'font-size', '40', 'hover');
    await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
    const held = await editorState(page, 'font-size', 'hover');
    assert.deepEqual([held.mounted, held.number], [true, '40'], 'the editor is still open on 40');
    const previewSheet = await page.evaluate(() => document.querySelector('[data-raven-grab-state-preview]').textContent);
    assert.match(previewSheet, /:hover \{ font-size: 40px !important; \}/, 'and the hover preview is still on the page');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'font-size', 'hover');

    // The hover rule still says 36px, so 26px of line height is 72.22% of it.
    await openRow(page, 'line-height', 'hover');
    await chooseUnit(page, 'line-height', '%', 'hover');
    assert.equal(await editorState(page, 'line-height', 'hover').then((s) => s.number), '72.22');
  }, { expose: ['rebaseNextDrafts'] });
});

test('T29 a box-shadow preset previews and leaves the editor open; Enter commits the preset', async (t) => {
  const html = await fixtureWith('  #item-a { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'box-shadow');
    const before = await computed(page, '#item-a', 'box-shadow');
    const point = await shadowEval(page, (root) => {
      const button = root.querySelector('.raven-grab-style-editor[data-control="box-shadow"] [data-shadow-preset="medium"]');
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(point.x, point.y);

    assert.equal(await editorOpen(page, 'box-shadow'), true, 'a preset must not close the editor');
    const previewed = await computed(page, '#item-a', 'box-shadow');
    assert.notEqual(previewed, before, 'the preset is previewed on the page');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held preset can be sent');

    await shadowEval(page, (root) => root.querySelector('.raven-grab-style-editor[data-control="box-shadow"] input').focus());
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'box-shadow');
    assert.equal(await computed(page, '#item-a', 'box-shadow'), previewed, 'Enter commits what was previewed');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [
      ['box-shadow', 'rgba(0, 0, 0, 0.2) 0px 1px 2px 0px', '0 4px 16px rgba(0, 0, 0, 0.18)']
    ]);
  }, { html });
});

test('T30 Send follows the Size editor: a typed width can be sent with one press, an emptied one cannot', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'width');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
    await setControl(page, 'width', 'input[aria-label="width value"]', '320', ['input']);
    // A flex item: the used width is not the declared one, so read the inline style.
    assert.equal(await inlineStyle(page, '#item-a'), 'width: 320px;', 'typing previews');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held width can be sent');

    await setControl(page, 'width', 'input[aria-label="width value"]', '', ['input']);
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'an emptied number is not a value to send');

    await setControl(page, 'width', 'input[aria-label="width value"]', '330', ['input']);
    const button = await sendButton(page);
    assert.equal(button.disabled, false);
    const response = grabResponse(page);
    await page.mouse.click(button.x, button.y);
    await response;
    assert.equal(grabBodies.length, 1, 'one press sends');
    // 242px is the used width of a 300px flex item in the 500px row.
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['width', '242px', '330px']]);
  });
});

test('T31 Send follows the corner radius editor: a typed corner can be sent with one press', async (t) => {
  const html = await fixtureWith('  #item-a { border-radius: 4px; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    // The four-corner editor opens from the row's expand button, not its value.
    const expand = await shadowEval(page, (root, row) => {
      const button = root.querySelector(row + ' [data-radius-expand]');
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, ROW('border-radius'));
    await page.mouse.click(expand.x, expand.y);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('.raven-grab-style-editor[data-control="radius"]'));
    }, null, { timeout: 5000 });
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
    await setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', '12px', ['input']);
    assert.equal(await computed(page, '#item-a', 'border-top-left-radius'), '12px', 'typing previews');
    const button = await sendButton(page);
    assert.equal(button.disabled, false, 'the held radius can be sent');

    const response = grabResponse(page);
    await page.mouse.click(button.x, button.y);
    await response;
    assert.equal(grabBodies.length, 1, 'one press sends');
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['border-radius', '4px', '12px 4px 4px']]);
  }, { html });
});

// --- Found by the phase 2 falsify panel --------------------------------------

function trayToggle(page) {
  return shadowEval(page, (root) => {
    const button = root.querySelector('[data-change-tray-toggle]');
    if (!button) throw new Error('no change tray toggle');
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, expanded: button.getAttribute('aria-expanded') };
  });
}

test('T32 a slow press on the change tray toggle commits the held colour and still toggles the tray', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'font-size');

    await openRow(page, 'color');
    // Focus on the native colour input: no blur commit, so only the press closes it.
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    const toggle = await trayToggle(page);
    assert.equal(toggle.expanded, 'false');

    // Held longer than the commit's deferral: the commit rebuilds the tray, and
    // must not do so between the press and its release.
    await page.mouse.move(toggle.x, toggle.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    assert.equal(await editorOpen(page, 'color'), true, 'the editor waits for the release');
    await page.mouse.up();
    await waitEditorClosed(page, 'color');
    assert.equal(await trayToggle(page).then((b) => b.expanded), 'true', 'the tray opened');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)');
    assert.match(await sendButton(page).then((b) => b.label), /2 changes/, 'and the colour was recorded');
  });
});

test('T33 overflow with a recorded edit: another pick, the recorded pick again, Enter leaves the recorded value on the page', async (t) => {
  const html = await fixtureWith('  #pad { overflow: hidden; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await openRow(page, 'overflow');
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'auto', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'overflow');

    await openRow(page, 'overflow');
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'scroll', ['input', 'change']);
    assert.equal(await computed(page, '#pad', 'overflow-x'), 'scroll');
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'auto', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'overflow');
    assert.equal(await computed(page, '#pad', 'overflow-x'), 'auto', 'the page still shows the recorded edit');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['overflow', 'hidden', 'auto hidden']]);
  }, { html });
});

test('T33b width with a recorded edit: another number, the recorded number again, Enter leaves the recorded width on the page', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '320', ['input']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'width');
    assert.equal(await inlineStyle(page, '#item-a'), 'width: 320px;');

    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '340', ['input']);
    assert.equal(await inlineStyle(page, '#item-a'), 'width: 340px;');
    await setControl(page, 'width', 'input[aria-label="width value"]', '320', ['input']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'width');
    assert.equal(await inlineStyle(page, '#item-a'), 'width: 320px;', 'the page still shows the recorded edit');
  });
});

test('T34 a box-shadow preset followed by a refused blur: Enter keeps the field open; Escape puts the page back and records nothing', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'box-shadow');
    const point = await shadowEval(page, (root) => {
      const button = root.querySelector('.raven-grab-style-editor[data-control="box-shadow"] [data-shadow-preset="medium"]');
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    assert.notEqual(await computed(page, '#item-a', 'box-shadow'), 'none', 'the preset is previewed');

    // A negative blur is not valid CSS: the preview keeps the preset.
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow blur"]', '-1', ['input']);
    await enterHolds(page, 'box-shadow', 'input[aria-label="Box shadow blur"]');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'box-shadow');
    assert.equal(await computed(page, '#item-a', 'box-shadow'), 'none', 'a refused commit leaves no preview behind');
    assert.equal(await inlineStyle(page, '#item-a'), '');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing was recorded');
  });
});

test('T34b a text-decoration pick followed by a refused colour: Enter keeps the field open; Escape puts the page back and records nothing', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'select[aria-label="Text decoration line"]', 'overline', ['input', 'change']);
    assert.equal(await computed(page, '#swatch', 'text-decoration-line'), 'overline', 'the pick is previewed');

    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color value"]', 'notacolour', ['input']);
    await enterHolds(page, 'text-decoration', 'input[aria-label="Text decoration color value"]');
    await enterHolds(page, 'text-decoration', 'input[aria-label="Text decoration color value"]', 'select[aria-label="Text decoration line"]');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'text-decoration');
    assert.equal(await computed(page, '#swatch', 'text-decoration-line'), 'underline', 'a refused commit leaves no preview behind');
    assert.equal(await inlineStyle(page, '#swatch'), '');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing was recorded');
  });
});

test('T35 the native colour panel closing keeps the text-decoration and box-shadow editors open; Escape and Enter still close them', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'text-decoration');
    // setControl leaves focus on the native input, where the panel leaves it.
    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color"]', '#00ff00', ['input', 'change']);
    assert.equal(await editorOpen(page, 'text-decoration'), true, 'change on the native input must not close the editor');
    assert.equal(await computed(page, '#swatch', 'text-decoration-color'), 'rgb(0, 255, 0)');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'text-decoration');
    assert.equal(await inlineStyle(page, '#swatch'), '', 'Escape on the native input restores the page');

    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color"]', '#00ff00', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'text-decoration');
    assert.equal(await computed(page, '#swatch', 'text-decoration-color'), 'rgb(0, 255, 0)');
    // Closed with the colour still on the page: committed, where Escape restores.
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'Enter on the native input commits');

    await openRow(page, 'box-shadow');
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow Y offset"]', '4', ['input']);
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow color"]', '#00ff00', ['input', 'change']);
    assert.equal(await editorOpen(page, 'box-shadow'), true, 'change on the native input must not close the editor');
    assert.match(await computed(page, '#swatch', 'box-shadow'), /^rgba?\(0, 255, 0/);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'box-shadow');
    assert.equal(await computed(page, '#swatch', 'box-shadow'), 'none', 'Escape on the native input restores the page');

    await openRow(page, 'box-shadow');
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow Y offset"]', '4', ['input']);
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow color"]', '#00ff00', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'box-shadow');
    assert.match(await computed(page, '#swatch', 'box-shadow'), /^rgba?\(0, 255, 0/);
    // Send was already enabled by the text-decoration edit, so read what is sent.
    await sendBatch(page);
    const sent = sentStyleEdits(grabBodies[0]).map((edit) => edit[0]);
    assert.ok(sent.indexOf('box-shadow') !== -1, 'Enter on the native input records the box shadow, got ' + sent.join(', '));
  });
});

test('T35b Escape and Enter close the Stroke editor from its native colour input', async (t) => {
  const html = await fixtureWith('  #swatch { border: 2px solid #000000; }');
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Choose Stroke color"]', '#00ff00', ['input', 'change']);
    assert.equal(await editorOpen(page, '__raven-stroke__'), true);
    assert.equal(await computed(page, '#swatch', 'border-top-color'), 'rgb(0, 255, 0)');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, '__raven-stroke__');
    assert.equal(await computed(page, '#swatch', 'border-top-color'), 'rgb(0, 0, 0)', 'Escape restores the page');

    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Choose Stroke color"]', '#00ff00', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, '__raven-stroke__');
    assert.equal(await computed(page, '#swatch', 'border-top-color'), 'rgb(0, 255, 0)');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'Enter commits');
  }, { html });
});

// Select #copy, then add #hoverable with a shift-click. #hoverable is the primary.
async function selectCopyAndHoverable(page) {
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
}

async function openRadiusCorners(page) {
  const expand = await shadowEval(page, (root, row) => {
    const button = root.querySelector(row + ' [data-radius-expand]');
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, ROW('border-radius'));
  await page.mouse.click(expand.x, expand.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector('.raven-grab-style-editor[data-control="radius"]'));
  }, null, { timeout: 5000 });
}

test('T36 Enter after the page removes the primary layer records nothing on the layer that stays', async (t) => {
  await run(t, async (page) => {
    await selectCopyAndHoverable(page);
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await inlineStyle(page, '#copy'), 'line-height: 30px;', 'the preview reaches both layers');
    await page.evaluate(() => document.querySelector('#hoverable').remove());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.equal(await inlineStyle(page, '#copy'), '', 'the layer that stays is back to the value it opened with');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing was recorded');
  });
});

// One structured editor each: open it on two layers, preview, have the page
// remove the primary, change the control twice more, then press Enter.
const STALE_EDITORS = [
  {
    name: 'text-decoration',
    open: (page) => openRow(page, 'text-decoration'),
    change: (page, step) => setControl(page, 'text-decoration', 'select[aria-label="Text decoration line"]', ['underline', 'overline', 'line-through'][step], ['input', 'change'])
  },
  {
    name: 'box-shadow',
    open: (page) => openRow(page, 'box-shadow'),
    change: (page, step) => setControl(page, 'box-shadow', 'input[aria-label="Box shadow Y offset"]', ['4', '6', '8'][step], ['input'])
  },
  {
    name: 'overflow',
    open: (page) => openRow(page, 'overflow'),
    change: (page, step) => setControl(page, 'overflow', 'select[aria-label="Overflow X"]', ['auto', 'scroll', 'hidden'][step], ['input', 'change'])
  },
  {
    name: 'width',
    open: (page) => openRow(page, 'width'),
    change: (page, step) => setControl(page, 'width', 'input[aria-label="width value"]', ['300', '310', '320'][step], ['input'])
  },
  {
    name: 'border-radius',
    open: (page) => openRadiusCorners(page),
    change: (page, step) => setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', ['4px', '6px', '8px'][step], ['input'])
  }
];

for (const stale of STALE_EDITORS) {
  test(`T36b the ${stale.name} editor writes nothing once the page has removed its layer`, async (t) => {
    await run(t, async (page) => {
      await selectCopyAndHoverable(page);
      await stale.open(page);
      await stale.change(page, 0);
      assert.notEqual(await inlineStyle(page, '#copy'), '', 'the preview reaches both layers');

      await page.evaluate(() => document.querySelector('#hoverable').remove());
      // The first change after the removal is the one that notices it.
      await stale.change(page, 1);
      assert.equal(await inlineStyle(page, '#copy'), '', 'the layer that stays is back to the value it opened with');
      await stale.change(page, 2);
      assert.equal(await inlineStyle(page, '#copy'), '', 'a later change does not reach the promoted layer');

      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      assert.equal(await inlineStyle(page, '#copy'), '', 'Enter does not either');
      assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing was recorded');
    });
  });
}

// A synthetic touch on the first visible match, with focus left where it is.
function touchOn(page, selector, steps) {
  return shadowEval(page, (root, arg) => {
    const node = Array.from(root.querySelectorAll(arg.selector)).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!node) throw new Error('nothing on screen for ' + arg.selector);
    const rect = node.getBoundingClientRect();
    arg.steps.forEach((step) => {
      node.dispatchEvent(new PointerEvent(step.type, {
        pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, composed: true, cancelable: true,
        clientX: rect.left + 4 + (step.dx || 0), clientY: rect.top + rect.height / 2 + (step.dy || 0)
      }));
    });
    return true;
  }, { selector, steps });
}

const touchTitle = (page, steps) => touchOn(page, '.raven-grab-section-title', steps);

test('T37 a touch that scrolls keeps the editor open; a touch that lifts where it landed commits', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    await touchTitle(page, [{ type: 'pointerdown' }]);
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'color'), true, 'a touch does not close the editor when it lands');
    await touchTitle(page, [{ type: 'pointermove', dy: 30 }, { type: 'pointerup', dy: 30 }]);
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'color'), true, 'a touch that moved was a scroll');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', 'the held colour is counted');

    await touchTitle(page, [{ type: 'pointerdown' }, { type: 'pointermove', dx: 30 }, { type: 'pointerup', dx: 30 }]);
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'color'), true, 'a touch that moved sideways was a scroll too');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');

    // A finger rarely lifts on the pixel it landed on: 5px of drift is still a tap.
    await touchTitle(page, [{ type: 'pointerdown' }, { type: 'pointermove', dx: 5, dy: 5 }, { type: 'pointerup', dx: 5, dy: 5 }]);
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)');
    assert.match(await sendButton(page).then((b) => b.label), /1 change/, 'the lift committed the colour');
  });
});

test('T24d a touch on Send is left to the Send click: the press and its lift do not close the editor', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held colour enables Send');

    // No click follows a dispatched pointer pair, so nothing flushes the editor.
    await touchOn(page, '[data-send-batch]', [{ type: 'pointerdown' }, { type: 'pointerup' }]);
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'color'), true, 'Send flushes the editor on its click, not on the press');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', 'the held colour is counted');
  });
});

test('T38 an overflow pick held in the open editor is still on the page after a rebase of the drafts', async (t) => {
  const html = await fixtureWith('  #pad { overflow: hidden; }');
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'overflow');
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'auto', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'overflow');

    await openRow(page, 'overflow');
    await setControl(page, 'overflow', 'select[aria-label="Overflow X"]', 'scroll', ['input', 'change']);
    assert.equal(await computed(page, '#pad', 'overflow-x'), 'scroll');
    await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
    assert.equal(await editorOpen(page, 'overflow'), true);
    assert.equal(await computed(page, '#pad', 'overflow-x'), 'scroll', 'the page shows what the editor shows');

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'overflow');
    assert.equal(await computed(page, '#pad', 'overflow-x'), 'auto', 'Escape goes back to the recorded edit');
  }, { html, expose: ['rebaseNextDrafts'] });
});

// --- Found by the phase 2 falsify panel, round 2 ------------------------------
// A real touch tap. Chromium delivers pointerdown, pointerup and the click
// together, ahead of the commit the outside press defers by one task.
async function tapShadow(page, selector) {
  const point = await shadowEval(page, (root, sel) => {
    const node = root.querySelector(sel);
    if (!node) throw new Error('nothing for ' + sel);
    node.scrollIntoView({ block: 'center' });
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.detach();
}

function openEditors(page) {
  return shadowEval(page, (root) => Array.from(root.querySelectorAll('.raven-grab-style-editor')).map((editor) => {
    return editor.closest('li').getAttribute('data-style-property');
  }));
}

test('T39 a touch tap on another row commits the colour the open editor holds, then opens that row', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    await tapShadow(page, ROW('font-size') + ' code[data-style-value]');
    assert.deepEqual(await openEditors(page), ['font-size'], 'one editor is open, on the tapped row');

    await typeNumber(page, 'font-size', '20');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'font-size');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [
      ['color', 'rgb(10, 88, 202)', '#00ff00'],
      ['font-size', '16px', '20px']
    ], 'the colour picked before the tap is sent with the font size');
  });
});

test('T39b Enter on another row commits the text-decoration colour the open editor holds, then opens that row', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color"]', '#00ff00', ['input', 'change']);

    // Focus leaves the native colour input without closing the editor.
    await shadowEval(page, (root, sel) => { root.querySelector(sel).focus(); return true; }, ROW('font-size') + ' code[data-style-value]');
    assert.equal(await editorOpen(page, 'text-decoration'), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction((sel) => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector(sel + ' .raven-grab-style-editor'));
    }, ROW('font-size'), { timeout: 5000 });
    assert.deepEqual(await openEditors(page), ['font-size'], 'one editor is open, on the row Enter was pressed on');
    assert.equal(await computed(page, '#swatch', 'text-decoration-color'), 'rgb(0, 255, 0)');

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'font-size');
    await sendBatch(page);
    const sent = sentStyleEdits(grabBodies[0]);
    assert.equal(sent.length, 1, 'the colour picked before Enter is sent');
    assert.match(sent[0][0], /^text-decoration/);
    assert.match(sent[0][2], /#00ff00/);
  });
});

test('T39c a touch tap on the corner radius button commits the colour the open editor holds', async (t) => {
  const html = await fixtureWith('  #item-a { border-radius: 4px; color: #0a58ca; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    await tapShadow(page, ROW('border-radius') + ' [data-radius-expand]');
    assert.deepEqual(await openEditors(page), ['border-radius'], 'one editor is open, the corner editor');

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'border-radius');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['color', 'rgb(10, 88, 202)', '#00ff00']]);
  }, { html });
});

function waitBoxFieldClosed(page, property) {
  return page.waitForFunction((prop) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return !root.querySelector('[data-box-input="' + prop + '"]');
  }, property, { timeout: 5000 });
}

async function commitBoxField(page, property, text) {
  await openBoxField(page, property);
  await typeBoxField(page, property, text);
  await page.keyboard.press('Enter');
  await waitBoxFieldClosed(page, property);
}

// The page's own stylesheet takes the value an edit asked for, as an agent's write does.
function landOnPage(page, css) {
  return page.evaluate((text) => {
    const sheet = document.createElement('style');
    sheet.textContent = text;
    document.head.appendChild(sheet);
  }, css);
}

// #pad animates its padding over one second. A rebase reads the computed value,
// so these two run without the transition.
const PAD_STILL = '  #pad { transition-duration: 0s !important; }';

test('T40 Escape in the box-model field puts the page back after a rebase dropped the edit the field opened on', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-top', '20');
    await landOnPage(page, '#pad { padding-top: 20px; }');

    await openBoxField(page, 'padding-top');
    await typeBoxField(page, 'padding-top', '30');
    assert.equal(await computed(page, '#pad', 'padding-top'), '30px');
    await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
    assert.equal(await boxFieldOpen(page, 'padding-top'), true);
    assert.equal(await computed(page, '#pad', 'padding-top'), '30px', 'the page shows what the field shows');

    await page.keyboard.press('Escape');
    await waitBoxFieldClosed(page, 'padding-top');
    assert.deepEqual(errors, []);
    assert.equal(await computed(page, '#pad', 'padding-top'), '20px', 'Escape goes back to what the field opened on');
    assert.doesNotMatch(await inlineStyle(page, '#pad'), /padding/, 'nothing of the preview is left inline');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
  }, { html, expose: ['rebaseNextDrafts'] });
});

test('T41 a Send queued behind a dispatch sends the number the box-model field still holds', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-top', '20');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);

    // The first batch has not landed. The same value is recorded again and a third is held.
    await commitBoxField(page, 'padding-top', '20');
    await openBoxField(page, 'padding-top');
    await typeBoxField(page, 'padding-top', '30');
    await shadowEval(page, (root) => { root.querySelector('[data-send-batch]').click(); return true; });
    assert.equal(grabBodies.length, 1, 'the press queues behind the dispatch in flight');
    assert.equal(await boxFieldOpen(page, 'padding-top'), true);

    await landOnPage(page, '#pad { padding-top: 20px; }');
    const hold = await page.evaluate(() => {
      window.__ravenGrabPanels.finishActiveDispatch();
      return window.__ravenGrabPanels.SEND_TIMINGS.hold;
    });
    const deadline = Date.now() + hold + 6000;
    while (grabBodies.length < 2 && Date.now() < deadline) await page.waitForTimeout(50);
    assert.equal(grabBodies.length, 2, 'the queued Send fires for the held number');
    assert.deepEqual(sentStyleEdits(grabBodies[1]), [['padding-top', '20px', '30px']]);
  }, { html, expose: ['finishActiveDispatch', 'SEND_TIMINGS'] });
});

test('T42 a native colour panel that fires change alone still previews, in all three colour editors', async (t) => {
  const html = await fixtureWith('  #swatch { box-shadow: 0 1px 2px #000000; }');
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['change']);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)');
    assert.equal(await editorOpen(page, 'color'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'color');

    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color"]', '#00ff00', ['change']);
    assert.equal(await computed(page, '#swatch', 'text-decoration-color'), 'rgb(0, 255, 0)');
    assert.equal(await editorOpen(page, 'text-decoration'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'text-decoration');

    await openRow(page, 'box-shadow');
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow color"]', '#00ff00', ['change']);
    assert.match(await computed(page, '#swatch', 'box-shadow'), /rgb\(0, 255, 0\)/);
    assert.equal(await editorOpen(page, 'box-shadow'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'box-shadow');
    assert.equal(await inlineStyle(page, '#swatch'), '');
  }, { html });
});

test('T43 Enter on the colour format select commits the editor; Escape on it cancels', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-style-input', '#ff0000', ['input']);
    assert.equal(await focusControl(page, 'color', 'select.raven-grab-style-format'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'color');
    assert.equal(await inlineStyle(page, '#swatch'), '', 'Escape on the select restores the page');

    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-style-input', '#ff0000', ['input']);
    assert.equal(await focusControl(page, 'color', 'select.raven-grab-style-format'), true);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'color');
    await sendBatch(page);
    // The row opened in RGB, so the typed hex is recorded in RGB.
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['color', 'rgb(10, 88, 202)', 'rgb(255, 0, 0)']]);
  });
});

// Each: record one value, reopen, hold another, rebase the drafts. The held
// value is still on the page and Escape goes back to the recorded one.
const REBASE_EDITORS = [
  {
    name: 'text-decoration', selector: '#swatch', css: '',
    open: (page) => openRow(page, 'text-decoration'),
    set: (page, step) => setControl(page, 'text-decoration', 'select[aria-label="Text decoration line"]', ['overline', 'line-through'][step], ['input', 'change']),
    read: (page) => computed(page, '#swatch', 'text-decoration-line'),
    values: ['overline', 'line-through'],
    closed: (page) => waitEditorClosed(page, 'text-decoration')
  },
  {
    name: 'box-shadow', selector: '#item-a', css: '  #item-a { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }',
    open: (page) => openRow(page, 'box-shadow'),
    set: (page, step) => setControl(page, 'box-shadow', 'input[aria-label="Box shadow Y offset"]', ['4', '6'][step], ['input']),
    read: (page) => computed(page, '#item-a', 'box-shadow').then((value) => value.replace(/^.*\) 0px (\d+)px.*$/, '$1')),
    values: ['4', '6'],
    closed: (page) => waitEditorClosed(page, 'box-shadow')
  },
  {
    name: 'width', selector: '#item-a', css: '',
    open: (page) => openRow(page, 'width'),
    set: (page, step) => setControl(page, 'width', 'input[aria-label="width value"]', ['310', '320'][step], ['input']),
    read: (page) => inlineStyle(page, '#item-a'),
    values: ['width: 310px;', 'width: 320px;'],
    closed: (page) => waitEditorClosed(page, 'width')
  },
  {
    name: 'border-radius', selector: '#item-a', css: '  #item-a { border-radius: 4px; }',
    open: (page) => openRadiusCorners(page),
    set: (page, step) => setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', ['6px', '8px'][step], ['input']),
    read: (page) => computed(page, '#item-a', 'border-top-left-radius'),
    values: ['6px', '8px'],
    closed: (page) => waitEditorClosed(page, 'border-radius')
  }
];

for (const editor of REBASE_EDITORS) {
  test('T38b a ' + editor.name + ' value held in the open editor is still on the page after a rebase of the drafts', async (t) => {
    const html = await fixtureWith(editor.css);
    await run(t, async (page) => {
      await selectElement(page, editor.selector);
      await editor.open(page);
      await editor.set(page, 0);
      await page.keyboard.press('Enter');
      await editor.closed(page);
      assert.equal(await editor.read(page), editor.values[0]);

      await editor.open(page);
      await editor.set(page, 1);
      assert.equal(await editor.read(page), editor.values[1]);
      await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
      assert.deepEqual(await openEditors(page), [editor.name]);
      assert.equal(await editor.read(page), editor.values[1], 'the page shows what the editor shows');

      await page.keyboard.press('Escape');
      await editor.closed(page);
      assert.equal(await editor.read(page), editor.values[0], 'Escape goes back to the recorded edit');
    }, { html, expose: ['rebaseNextDrafts'] });
  });
}

// --- Found by the phase 2 falsify panel, round 3 ------------------------------
function leftDockButton(page) {
  return shadowEval(page, (root) => {
    const button = root.querySelector('.raven-grab-global-actions[data-side="left"] .raven-grab-assets-cta');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, marked: button.__t44 === true, connected: button.isConnected };
  });
}

test('T44 a slow press on the left dock commits the held colour on release and leaves the pressed button in place', async (t) => {
  await run(t, async (page) => {
    await shadowEval(page, (root) => { root.querySelector('[data-tab="assets"]').click(); });
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    // Focus on the native colour input: no blur commit, so only the press closes it.
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    const dock = await leftDockButton(page);
    assert.ok(dock, 'the Assets tab shows the left dock');
    await shadowEval(page, (root) => {
      root.querySelector('.raven-grab-global-actions[data-side="left"] .raven-grab-assets-cta').__t44 = true;
    });

    // Held longer than the commit's deferral: the commit rebuilds the dock, and
    // must not do so between the press and its release.
    await page.mouse.move(dock.x, dock.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    assert.equal(await editorOpen(page, 'color'), true, 'the editor waits for the release');
    assert.equal(await leftDockButton(page).then((b) => b.marked), true, 'the pressed button is still the one on the page');
    await page.mouse.up();
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)');
    assert.match(await sendButton(page).then((b) => b.label), /1 change/, 'and the colour was recorded');
  });
});

test('T45 the Size editor takes its preview off the page when the number is emptied or the mode goes back to Fixed with no number', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '320', ['input']);
    assert.equal(await inlineStyle(page, '#item-a'), 'width: 320px;');
    await setControl(page, 'width', 'input[aria-label="width value"]', '', ['input']);
    assert.equal(await inlineStyle(page, '#item-a'), '', 'an emptied number shows the opening width');

    await setControl(page, 'width', 'select[aria-label="width size mode"]', 'hug', ['input', 'change']);
    assert.match(await inlineStyle(page, '#item-a'), /^width: /, 'Hug previews');
    await setControl(page, 'width', 'select[aria-label="width size mode"]', 'fixed', ['input', 'change']);
    assert.equal(await inlineStyle(page, '#item-a'), '', 'Fixed with no number shows the opening width');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);

    await setControl(page, 'width', 'input[aria-label="width value"]', '330', ['input']);
    assert.equal(await inlineStyle(page, '#item-a'), 'width: 330px;', 'typing previews again');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'width');
    assert.equal(await inlineStyle(page, '#item-a'), '');
  });
});

// Each editor: record a value, open again, hold another, the page's own
// stylesheet takes the recorded value, the drafts rebase (the record is
// dropped), Escape. Box shadow is not here: its record is never dropped, because
// the computed value puts the colour first and the recorded one puts it last.
const DROPPED_RECORD_EDITORS = [
  {
    name: 'text-decoration', selector: '#swatch', css: '', inline: /text-decoration/,
    open: (page) => openRow(page, 'text-decoration'),
    set: (page, step) => setControl(page, 'text-decoration', 'select[aria-label="Text decoration line"]', ['overline', 'line-through'][step], ['input', 'change']),
    read: (page) => computed(page, '#swatch', 'text-decoration-line'),
    values: ['overline', 'line-through'],
    closed: (page) => waitEditorClosed(page, 'text-decoration')
  },
  {
    name: 'overflow', selector: '#pad', css: '  #pad { overflow: hidden; }\n' + PAD_STILL, inline: /overflow/,
    open: (page) => openRow(page, 'overflow'),
    set: (page, step) => setControl(page, 'overflow', 'select[aria-label="Overflow X"]', ['auto', 'scroll'][step], ['input', 'change']),
    read: (page) => computed(page, '#pad', 'overflow-x'),
    values: ['auto', 'scroll'],
    closed: (page) => waitEditorClosed(page, 'overflow')
  },
  {
    name: 'width', selector: '#pad', css: PAD_STILL, inline: /width/,
    open: (page) => openRow(page, 'width'),
    set: (page, step) => setControl(page, 'width', 'input[aria-label="width value"]', ['310', '320'][step], ['input']),
    read: (page) => computed(page, '#pad', 'width'),
    values: ['310px', '320px'],
    closed: (page) => waitEditorClosed(page, 'width')
  },
  {
    name: 'border-radius', selector: '#item-a', css: '  #item-a { border-radius: 4px; }', inline: /radius/,
    open: (page) => openRadiusCorners(page),
    set: (page, step) => setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', ['6px', '8px'][step], ['input']),
    read: (page) => computed(page, '#item-a', 'border-top-left-radius'),
    values: ['6px', '8px'],
    closed: (page) => waitEditorClosed(page, 'border-radius')
  },
  {
    name: 'font-size', selector: '#copy', css: '', inline: /font-size/,
    open: (page) => openRow(page, 'font-size'),
    set: (page, step) => typeNumber(page, 'font-size', ['20', '22'][step]),
    read: (page) => computed(page, '#copy', 'font-size'),
    values: ['20px', '22px'],
    closed: (page) => waitEditorClosed(page, 'font-size')
  }
];

for (const editor of DROPPED_RECORD_EDITORS) {
  test('T46 Escape in the ' + editor.name + ' editor leaves nothing inline after a rebase dropped the edit it opened on', async (t) => {
    const html = await fixtureWith(editor.css);
    await run(t, async (page) => {
      await selectElement(page, editor.selector);
      await editor.open(page);
      await editor.set(page, 0);
      await page.keyboard.press('Enter');
      await editor.closed(page);
      assert.equal(await editor.read(page), editor.values[0]);
      // The declaration the edit wrote, as the page's stylesheet will carry it.
      const recorded = await inlineStyle(page, editor.selector);
      assert.match(recorded, editor.inline);

      await editor.open(page);
      await editor.set(page, 1);
      assert.equal(await editor.read(page), editor.values[1]);
      await landOnPage(page, editor.selector + ' { ' + recorded + ' }');
      await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
      assert.deepEqual(await openEditors(page), [editor.name]);
      assert.equal(await editor.read(page), editor.values[1], 'the page shows what the editor shows');

      await page.keyboard.press('Escape');
      await editor.closed(page);
      assert.equal(await editor.read(page), editor.values[0], 'Escape goes back to what the page now has');
      assert.doesNotMatch(await inlineStyle(page, editor.selector), editor.inline, 'nothing of the preview is left inline');
      assert.equal(await sendButton(page).then((b) => b.disabled), true, 'the record was dropped and nothing new is held');
    }, { html, expose: ['rebaseNextDrafts'] });
  });
}

// A touch tap whose click arrives in the same task as its lift, ahead of the
// commit the lift defers. Real touch input (T39, T39c) delivers the click in
// that order or one task later, depending on timing; this fixes the order.
function tapInOneTask(page, selector) {
  return shadowEval(page, (root, sel) => {
    const node = root.querySelector(sel);
    if (!node) throw new Error('nothing for ' + sel);
    node.scrollIntoView({ block: 'center' });
    const rect = node.getBoundingClientRect();
    const at = {
      bubbles: true, composed: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
    };
    node.dispatchEvent(new PointerEvent('pointerdown', at));
    node.dispatchEvent(new PointerEvent('pointerup', at));
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, clientX: at.clientX, clientY: at.clientY }));
    return true;
  }, selector);
}

test('T39d a tap whose click lands before the deferred commit still commits the held colour, then opens the tapped row', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    await tapInOneTask(page, ROW('font-size') + ' code[data-style-value]');
    assert.deepEqual(await openEditors(page), ['font-size'], 'one editor is open, on the tapped row');
    await page.waitForTimeout(50);
    assert.deepEqual(await openEditors(page), ['font-size'], 'and the deferred commit leaves it open');

    await typeNumber(page, 'font-size', '20');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'font-size');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [
      ['color', 'rgb(10, 88, 202)', '#00ff00'],
      ['font-size', '16px', '20px']
    ]);
  });
});

test('T39e a tap on the corner radius button whose click lands before the deferred commit commits the held colour', async (t) => {
  const html = await fixtureWith('  #item-a { border-radius: 4px; color: #0a58ca; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    await tapInOneTask(page, ROW('border-radius') + ' [data-radius-expand]');
    assert.deepEqual(await openEditors(page), ['border-radius'], 'one editor is open, the corner editor');

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'border-radius');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['color', 'rgb(10, 88, 202)', '#00ff00']]);
  }, { html });
});

test('T30b Send follows the Size editor on a Mixed row: an emptied number is not a value to send', async (t) => {
  await run(t, async (page) => {
    // Two paragraphs of different heights: the height row opens on Mixed.
    await selectCopyAndHoverable(page);
    await openRow(page, 'height');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);
    await setControl(page, 'height', 'input[aria-label="height value"]', '90', ['input']);
    assert.equal(await inlineStyle(page, '#copy'), 'height: 90px;');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held height can be sent');

    await setControl(page, 'height', 'input[aria-label="height value"]', '', ['input']);
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'an emptied number is not a value to send');
  });
});

function queueButton(page) {
  return shadowEval(page, (root) => {
    const button = root.querySelector('[data-queue-draft]');
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return {
      disabled: button.getAttribute('aria-disabled') === 'true',
      status: Array.from(root.querySelectorAll('.raven-grab-status')).map((node) => node.textContent).join(' | '),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
}

test('T48 "Add to queue" takes the colour an open editor holds', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    assert.equal((await queueButton(page)).disabled, true, 'nothing to queue before the pick');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    assert.equal((await queueButton(page)).disabled, false, 'the held colour is work the queue can take');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'color');
    assert.equal((await queueButton(page)).disabled, true, 'Escape leaves nothing to queue');

    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    const held = await queueButton(page);
    assert.equal(held.disabled, false);

    await page.mouse.click(held.x, held.y);
    await waitEditorClosed(page, 'color');
    await page.waitForTimeout(80);
    const after = await queueButton(page);
    assert.match(after.status, /Added to queue/, 'the press queues the held colour, got: ' + after.status);
    assert.match(await sendButton(page).then((b) => b.label), /1 change/, 'and the queued change can be sent');
  });
});

test('T49 a tab tapped in the mobile sheet while an editor holds a colour is shown once the colour is committed', async (t) => {
  await run(t, async (page) => {
    // The sheet opens on another tab, so the harness selectElement, which waits
    // for style rows, does not apply.
    const at = await page.evaluate(() => {
      const rect = document.querySelector('#swatch').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(at.x - 2, at.y - 2);
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('[data-tab="styles"]'));
    }, null, { timeout: 5000 });
    const tabs = () => shadowEval(page, (root) => ({
      styles: root.querySelector('[data-tab="styles"]').getAttribute('aria-selected'),
      instructions: root.querySelector('[data-tab="instructions"]').getAttribute('aria-selected')
    }));
    await shadowEval(page, (root) => { root.querySelector('[data-tab="styles"]').click(); return true; });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('li[data-style-property="color"]'));
    }, null, { timeout: 5000 });
    assert.equal((await tabs()).styles, 'true', 'the sheet shows the Styles tab');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);

    // The click reaches the tab before the deferred commit has closed the editor.
    await tapInOneTask(page, '[data-tab="instructions"]');
    await page.waitForFunction(() => !document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('.raven-grab-style-editor'), null, { timeout: 5000 });
    await page.waitForTimeout(80);
    assert.equal((await tabs()).instructions, 'true', 'the tapped tab is rendered after the commit');
    assert.match(await sendButton(page).then((b) => b.label), /1 change/, 'and the held colour was committed');
  }, { viewport: { width: 600, height: 900 } });
});

test('T8c a native colour reported on change alone after a chip pick drops the chip token', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    const chip = await shadowEval(page, (root, row) => {
      const button = root.querySelector(row + ' .raven-grab-style-editor button.raven-grab-color-suggestion[data-color-source="token"]');
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, ROW('color'));
    await page.mouse.click(chip.x, chip.y);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(255, 255, 255)', 'the chip is previewed');

    await setControl(page, 'color', 'input.raven-grab-color-input', '#123456', ['change']);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(18, 52, 86)', 'the native colour replaces it');
    await pressOutside(page);
    await waitEditorClosed(page, 'color');
    await sendBatch(page);
    const edit = grabBodies[0].styleEdits.find((entry) => entry.property === 'color');
    assert.ok(edit, 'the colour edit is sent');
    assert.equal(edit.newValue, '#123456');
    assert.equal(edit.tokenPath, undefined, 'the colour picked last is not the chip token');
    assert.equal(edit.token, undefined);
  });
});

test('T50 a box-shadow preset reached with the keyboard: Escape cancels from it and focus leaving the editor commits', async (t) => {
  const html = await fixtureWith('  #item-a { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    const before = await computed(page, '#item-a', 'box-shadow');
    const focusPreset = () => shadowEval(page, (root) => {
      const button = root.querySelector('.raven-grab-style-editor[data-control="box-shadow"] [data-shadow-preset="medium"]');
      button.focus();
      return root.activeElement === button;
    });

    await openRow(page, 'box-shadow');
    assert.equal(await focusPreset(), true);
    assert.equal(await editorOpen(page, 'box-shadow'), true, 'focus moving to a preset keeps the editor open');
    await page.keyboard.press('Space');
    const previewed = await computed(page, '#item-a', 'box-shadow');
    assert.notEqual(previewed, before, 'Space on the preset previews it');
    assert.equal(await editorOpen(page, 'box-shadow'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'box-shadow');
    assert.equal(await computed(page, '#item-a', 'box-shadow'), before, 'Escape on the preset restores the page');
    assert.equal(await inlineStyle(page, '#item-a'), '');

    await openRow(page, 'box-shadow');
    await focusPreset();
    await page.keyboard.press('Space');
    await shadowEval(page, (root) => { root.activeElement.blur(); return true; });
    await waitEditorClosed(page, 'box-shadow');
    assert.equal(await computed(page, '#item-a', 'box-shadow'), previewed, 'focus leaving the editor commits the preset');
    await sendBatch(page);
    assert.equal(sentStyleEdits(grabBodies[0]).filter((edit) => edit[0] === 'box-shadow').length, 1);
  }, { html });
});

// Names the draft as a version and presses Save, with no editor open.
async function saveVersion(page, name) {
  await typeVersionName(page, name);
  await shadowEval(page, (root) => {
    const button = root.querySelector('[data-save-version]');
    if (!button || button.disabled) throw new Error('Save is missing or disabled');
    button.click();
    return true;
  });
}

function typeVersionName(page, name) {
  return shadowEval(page, (root, arg) => {
    const field = root.querySelector('[data-version-name]');
    if (!field) throw new Error('the Versions name field is not rendered');
    field.value = arg;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, name);
}

const STYLE_VERSION_STORE_KEY = 'raven-grab-style-versions-v1';

test('T52 a version restore tapped while an editor holds a colour applies the version, not the held colour', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#0000ff', ['input', 'change']);
    await pressPanelTitle(page);
    await waitEditorClosed(page, 'color');
    await saveVersion(page, 'blue');

    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#ff0000', ['input', 'change']);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(255, 0, 0)');

    // The click arrives before the commit the tap deferred.
    await tapInOneTask(page, '[data-restore-version]');
    await waitEditorClosed(page, 'color');
    await page.waitForTimeout(50);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 0, 255)', 'the restore is the later choice and stays on the page');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]).map((edit) => [edit[0], edit[2]]), [['color', '#0000ff']]);
  });
});

test('T53 Remove pressed in the change tray while an editor holds a new colour removes the change', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#0000ff', ['input', 'change']);
    await pressPanelTitle(page);
    await waitEditorClosed(page, 'color');
    const toggle = await trayToggle(page);
    if (toggle.expanded !== 'true') await page.mouse.click(toggle.x, toggle.y);

    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#ff0000', ['input', 'change']);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(255, 0, 0)');
    const remove = await shadowEval(page, (root) => {
      const button = root.querySelector('[data-remove-change]');
      if (!button) throw new Error('the tray lists no removable change');
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    // A mouse press on the tray closes the editor on release, and the click
    // comes with that release, before the commit.
    await page.mouse.click(remove.x, remove.y);
    await waitEditorClosed(page, 'color');
    await page.waitForTimeout(80);
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(10, 88, 202)', 'the removal is the later choice');
    assert.equal(await inlineStyle(page, '#swatch'), '');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing is left to send');
  });
});

for (const [label, selector] of [['T54', '[data-edit-scope="component"]'], ['T54b', '[data-scope-track]']]) {
  test(label + ' a scope switch tapped on ' + selector + ' while an editor holds a colour commits the colour before the scope changes', async (t) => {
    await run(t, async (page) => {
      await selectElement(page, '#card-a');
      await openRow(page, 'color');
      await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
      const siblingColor = () => page.evaluate(() => document.querySelector('#card-b').style.getPropertyValue('color'));
      assert.equal(await siblingColor(), '', 'the preview is on the selected card only');

      await tapInOneTask(page, selector);
      await waitEditorClosed(page, 'color');
      await page.waitForTimeout(50);
      const scope = await shadowEval(page, (root) => root.querySelector('.raven-grab-scope').getAttribute('data-scope-value'));
      assert.equal(scope, 'component', 'the tap switched the scope');
      assert.equal(await computed(page, '#card-a', 'color'), 'rgb(0, 255, 0)', 'the held colour was committed');
      assert.equal(await siblingColor(), '', 'in the scope it was previewed in: the sibling was not written');
    });
  });
}

test('T55 Save tapped in Versions while an editor holds a colour saves the colour with the version', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'font-size');
    await typeVersionName(page, 'both');

    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    await tapInOneTask(page, '[data-save-version]');
    await waitEditorClosed(page, 'color');
    await page.waitForTimeout(80);
    const stored = await page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || '[]'), STYLE_VERSION_STORE_KEY);
    assert.equal(stored.length, 1, 'one version was saved');
    assert.deepEqual(Object.keys(stored[0].edits).sort(), ['color', 'font-size'], 'with the colour the page showed when Save was tapped');
  });
});

test('T56 a colour chip reached with the keyboard stays in the editor: Escape cancels from it and focus leaving it commits', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    const opening = await computed(page, '#swatch', 'color');
    // A chip whose colour is not the one the row opened with.
    const focusChip = () => shadowEval(page, (root, arg) => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const rgb = (value) => { probe.style.color = ''; probe.style.color = value; return getComputedStyle(probe).color; };
      const chip = Array.from(root.querySelectorAll(arg.row + ' .raven-grab-color-suggestion'))
        .find((candidate) => rgb(candidate.getAttribute('data-color-suggestion')) !== arg.opening);
      probe.remove();
      if (!chip) throw new Error('no colour chip differs from the opening colour');
      chip.focus();
      return root.activeElement === chip;
    }, { row: ROW('color'), opening });

    await openRow(page, 'color');
    assert.equal(await focusChip(), true);
    assert.equal(await editorOpen(page, 'color'), true, 'focus moving to a chip does not close the editor');
    await page.keyboard.press('Space');
    const picked = await computed(page, '#swatch', 'color');
    assert.notEqual(picked, opening, 'Space on the chip previews it');
    assert.equal(await editorOpen(page, 'color'), true);
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), opening, 'Escape on the chip restores the page');
    assert.equal(await inlineStyle(page, '#swatch'), '');

    await openRow(page, 'color');
    await focusChip();
    await page.keyboard.press('Space');
    await shadowEval(page, (root) => { root.activeElement.blur(); return true; });
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), picked, 'focus leaving the chip commits the pick');
    assert.match(await sendButton(page).then((b) => b.label), /1 change/);
  });
});

test('T58 the box-shadow Inset checkbox and colour format select preview and leave the editor open', async (t) => {
  const html = await fixtureWith('  #item-a { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'box-shadow');
    assert.doesNotMatch(await computed(page, '#item-a', 'box-shadow'), /inset/);

    const checked = await shadowEval(page, (root, row) => {
      const box = root.querySelector(row + ' .raven-grab-style-editor [aria-label="Inset box shadow"]');
      box.focus();
      box.click();
      return box.checked;
    }, ROW('box-shadow'));
    assert.equal(checked, true);
    assert.equal(await editorOpen(page, 'box-shadow'), true, 'the Inset checkbox must not close the editor');
    assert.match(await computed(page, '#item-a', 'box-shadow'), /inset/, 'and its change is on the page');

    const colourText = await shadowEval(page, (root, row) => {
      const editor = root.querySelector(row + ' .raven-grab-style-editor');
      const format = editor.querySelector('select.raven-grab-style-format');
      format.focus();
      format.value = format.value === 'rgb' ? 'hex' : 'rgb';
      format.dispatchEvent(new Event('change', { bubbles: true }));
      return { format: format.value, text: editor.querySelector('.raven-grab-structured-row input.raven-grab-style-input').value };
    }, ROW('box-shadow'));
    assert.equal(colourText.format, 'hex');
    assert.match(colourText.text, /^#/, 'the format select rewrites the colour text');
    assert.equal(await editorOpen(page, 'box-shadow'), true, 'the colour format select must not close the editor');
    assert.match(await computed(page, '#item-a', 'box-shadow'), /inset/, 'the preview is still on the page');

    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'box-shadow');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    const sent = sentStyleEdits(grabBodies[0]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], 'box-shadow');
    assert.match(sent[0][2], /inset/, 'Enter commits the inset shadow');
  }, { html });
});

test('T59 a box-model field left untouched writes nothing when a finished send rebases the drafts', async (t) => {
  const html = await fixtureWith(PAD_STILL + '\n  #pad { padding-top: 13.456px; }');
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openBoxField(page, 'padding-top');
    await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
    assert.equal(await boxFieldOpen(page, 'padding-top'), true);
    // The field shows the number rounded; that text was never typed.
    assert.doesNotMatch(await inlineStyle(page, '#pad'), /padding/, 'a rebase writes back only what the field previewed');
    assert.equal(await computed(page, '#pad', 'padding-top'), '13.456px');
    assert.equal(await sendButton(page).then((b) => b.disabled), true);

    // A typed number is still written again by the rebase.
    await typeBoxField(page, 'padding-top', '20');
    await page.evaluate(() => { window.__ravenGrabPanels.rebaseNextDrafts(); });
    assert.match(await inlineStyle(page, '#pad'), /padding-top: 20px/);
    await page.keyboard.press('Escape');
    await waitBoxFieldClosed(page, 'padding-top');
    assert.doesNotMatch(await inlineStyle(page, '#pad'), /padding/);
  }, { html, expose: ['rebaseNextDrafts'] });
});

// A native colour input has no blur commit, and its panel leaves focus on it.
// A press on something that takes no focus is then the only close.
const NATIVE_COLOUR_EDITORS = [
  {
    label: 'T60 text-decoration',
    row: 'text-decoration',
    css: '',
    async pick(page) {
      await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color"]', '#00ff00', ['input', 'change']);
    },
    async shown(page) { return computed(page, '#swatch', 'text-decoration-color'); },
    expected: /^rgb\(0, 255, 0\)$/,
    sent: /^text-decoration/,
  },
  {
    label: 'T60b box-shadow',
    row: 'box-shadow',
    css: '',
    async pick(page) {
      await setControl(page, 'box-shadow', 'input[aria-label="Box shadow Y offset"]', '4', ['input']);
      await setControl(page, 'box-shadow', 'input[aria-label="Box shadow color"]', '#00ff00', ['input', 'change']);
    },
    async shown(page) { return computed(page, '#swatch', 'box-shadow'); },
    expected: /^rgba?\(0, 255, 0/,
    sent: /^box-shadow$/,
  },
  {
    label: 'T60c Stroke',
    row: '__raven-stroke__',
    css: '  #swatch { border: 2px solid #000000; }',
    async pick(page) {
      await setControl(page, '__raven-stroke__', 'input[aria-label="Choose Stroke color"]', '#00ff00', ['input', 'change']);
    },
    async shown(page) { return computed(page, '#swatch', 'border-top-color'); },
    expected: /^rgb\(0, 255, 0\)$/,
    sent: /^border/,
  },
];

for (const entry of NATIVE_COLOUR_EDITORS) {
  test(entry.label + ': a press on a panel title commits a colour picked in the native input', async (t) => {
    const html = await fixtureWith(entry.css);
    await run(t, async (page, { grabBodies }) => {
      await selectElement(page, '#swatch');
      await openRow(page, entry.row);
      await entry.pick(page);
      assert.equal(await editorOpen(page, entry.row), true);
      await pressPanelTitle(page);
      await waitEditorClosed(page, entry.row);
      assert.match(await entry.shown(page), entry.expected, 'the picked colour stays on the page');
      await sendBatch(page);
      assert.equal(grabBodies.length, 1, 'the press recorded the colour, so Send has something to send');
      const sent = sentStyleEdits(grabBodies[0]).map((edit) => edit[0]);
      assert.ok(sent.some((name) => entry.sent.test(name)), 'sent ' + sent.join(', '));
    }, { html });
  });
}

// A touch tap on the page with Shift held: press, lift and click in one task.
function shiftTapPageInOneTask(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    const rect = node.getBoundingClientRect();
    const at = {
      bubbles: true, composed: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true, shiftKey: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
    };
    node.dispatchEvent(new PointerEvent('pointerdown', at));
    node.dispatchEvent(new PointerEvent('pointerup', at));
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, shiftKey: true, clientX: at.clientX, clientY: at.clientY }));
    return true;
  }, selector);
}

test('T61 a layer added to the selection while an editor holds a value does not receive that value', async (t) => {
  const html = await fixtureWith('  #copy, #hoverable { text-decoration: underline; }');
  await run(t, async (page) => {
    await selectCopyAndHoverable(page);
    // A recorded edit keeps #hoverable the primary when a layer is added.
    await openRow(page, 'color');
    await setControl(page, 'color', 'input.raven-grab-color-input', '#ff0000', ['input', 'change']);
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'color');

    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color"]', '#00ff00', ['input', 'change']);
    assert.equal(await editorOpen(page, 'text-decoration'), true);
    assert.equal(await computed(page, '#hoverable', 'text-decoration-color'), 'rgb(0, 255, 0)');

    await shiftTapPageInOneTask(page, '#swatch');
    await page.waitForTimeout(100);
    assert.equal(await editorOpen(page, 'text-decoration'), false, 'the selection change commits the editor');
    assert.equal(await inlineStyle(page, '#swatch'), '', 'the added layer never showed the preview and gets nothing');
    assert.equal(await computed(page, '#hoverable', 'text-decoration-color'), 'rgb(0, 255, 0)', 'the layers that showed it keep it');
    assert.equal(await computed(page, '#copy', 'text-decoration-color'), 'rgb(0, 255, 0)');
  }, { html });
});

test('T62 the text-decoration Style select previews and keeps the editor open; Escape restores', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    assert.equal(await computed(page, '#swatch', 'text-decoration-style'), 'solid');
    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'select[aria-label="Text decoration style"]', 'wavy', ['input', 'change']);
    assert.equal(await computed(page, '#swatch', 'text-decoration-style'), 'wavy', 'the pick is on the page');
    assert.equal(await editorOpen(page, 'text-decoration'), true, 'a pick does not close the editor');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held style can be sent');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'text-decoration');
    assert.equal(await inlineStyle(page, '#swatch'), '', 'Escape restores the page');
    assert.equal(await computed(page, '#swatch', 'text-decoration-style'), 'solid');
  });
});

test('T63 a press on the open row, outside its editor, keeps the editor open', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    // Focus rests on the native colour input, which has no blur commit.
    await setControl(page, 'color', 'input.raven-grab-color-input', '#00ff00', ['input', 'change']);
    // The editor lies over its row here, so no pointer reaches the label. The
    // press is dispatched on the label: its path holds the row, not the editor.
    await shadowEval(page, (root, sel) => {
      const row = root.querySelector(sel);
      const editor = row.querySelector('.raven-grab-style-editor');
      const label = Array.from(row.children).find((node) => node !== editor && !node.contains(editor));
      if (!label) throw new Error('the row has no label beside its editor');
      const rect = label.getBoundingClientRect();
      const at = {
        bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true,
        clientX: rect.left + 3, clientY: rect.top + rect.height / 2
      };
      label.dispatchEvent(new PointerEvent('pointerdown', at));
      label.dispatchEvent(new PointerEvent('pointerup', at));
      return true;
    }, ROW('color'));
    await page.waitForTimeout(100);
    assert.equal(await editorOpen(page, 'color'), true, 'the row is part of the editor for a press');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(0, 255, 0)');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'color');
    assert.equal(await computed(page, '#swatch', 'color'), 'rgb(10, 88, 202)', 'Escape still restores');
  });
});

test('T64 an Overflow Y pick previews and stays open; Escape puts the page back', async (t) => {
  const html = await fixtureWith('  #pad { overflow: hidden; }');
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'overflow');
    await setControl(page, 'overflow', 'select[aria-label="Overflow Y"]', 'scroll', ['input', 'change']);

    assert.equal(await editorOpen(page, 'overflow'), true, 'a Y pick must not close the editor');
    assert.equal(await computed(page, '#pad', 'overflow-y'), 'scroll');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the held Y pick can be sent');

    await focusControl(page, 'overflow', 'select[aria-label="Overflow Y"]');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'overflow');
    assert.equal(await computed(page, '#pad', 'overflow-y'), 'hidden');
    assert.equal(await inlineStyle(page, '#pad').then((s) => /overflow/.test(s)), false, 'Escape leaves no overflow inline');
  }, { html });
});

// --- Phase 3: the Size and Stroke unit selects --------------------------------
function unitEditorState(page, property, numberLabel, unitLabel) {
  return shadowEval(page, (root, arg) => {
    const editor = root.querySelector(arg.row + ' .raven-grab-style-editor');
    if (!editor) return { mounted: false };
    const number = editor.querySelector('input[aria-label="' + arg.numberLabel + '"]');
    const unit = editor.querySelector('select[aria-label="' + arg.unitLabel + '"]');
    return {
      mounted: true,
      number: number.value,
      unit: unit.value,
      units: Array.from(unit.options).map((option) => option.value),
      focusOnNumber: root.activeElement === number
    };
  }, { row: ROW(property), numberLabel, unitLabel });
}
const sizeState = (page, property) => unitEditorState(page, property, property + ' value', property + ' unit');
const strokeState = (page) => unitEditorState(page, '__raven-stroke__', 'Stroke width', 'Stroke width unit');
const STROKE_FIXTURE = '  #item-a { border: 5px solid #112233; }';

async function errorStatus(page) {
  // The status is set one tick after the change event.
  await page.waitForTimeout(50);
  return statusLine(page).then((lines) => lines.filter((line) => line.kind === 'error').map((line) => line.text));
}

test('T10b width on a flex item cannot convert px to %: the Size editor refuses, keeps 300px and reports an error', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'width');
    const opened = await sizeState(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '300', ['input']);
    const held = await inlineStyle(page, '#item-a');
    const usedBefore = await computed(page, '#item-a', 'width');

    await setControl(page, 'width', 'select[aria-label="width unit"]', '%', ['change']);

    const state = await sizeState(page, 'width');
    assert.equal(state.mounted, true, 'a refused conversion keeps the editor open');
    assert.deepEqual([state.number, state.unit], ['300', opened.unit], 'the number and the unit are as they were');
    assert.equal(state.focusOnNumber, true);
    assert.equal(await inlineStyle(page, '#item-a'), held, 'the page is as it was');
    assert.equal(await computed(page, '#item-a', 'width'), usedBefore);
    assert.deepEqual(await errorStatus(page), ["Can't keep 300px when switching width to % here"]);
  });
});

test('T10e the Size editor converts width px to % and back from the unrounded value; Escape leaves nothing inline', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['494', 'px']);

    await setControl(page, 'width', 'select[aria-label="width unit"]', '%', ['change']);
    let state = await sizeState(page, 'width');
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '95', '%'], '494px in a 520px parent');
    assert.equal(state.focusOnNumber, true, 'focus returns to the number field');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 95%;');
    assert.equal(await computed(page, '#pad', 'width'), '494px');

    await setControl(page, 'width', 'select[aria-label="width unit"]', 'em', ['change']);
    assert.equal(await sizeState(page, 'width').then((s) => s.number), '30.875');
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'px', ['change']);
    state = await sizeState(page, 'width');
    assert.deepEqual([state.number, state.unit], ['494', 'px']);
    assert.deepEqual(await errorStatus(page), []);

    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'width');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s;');
  });
});

test('T10f the Size editor takes a typed unit as typed: 50% in the px field sets the unit select to % and previews 50%', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '50%', ['input']);
    assert.equal(await sizeState(page, 'width').then((s) => s.unit), '%');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 50%;');

    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'width');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['width', '494px', '50%']]);
  });
});

test('T10g the Size editor converts from a typed or stepped number, not from the earlier conversion', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'em', ['change']);
    await setControl(page, 'width', 'input[aria-label="width value"]', '10', ['input']);
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'px', ['change']);
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['160', 'px'], '10em on 16px text');

    await setControl(page, 'width', 'select[aria-label="width unit"]', 'em', ['change']);
    await focusControl(page, 'width', 'input[aria-label="width value"]');
    await page.keyboard.press('ArrowUp');
    assert.equal(await sizeState(page, 'width').then((s) => s.number), '11');
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'px', ['change']);
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['176', 'px'], '11em on 16px text');
  });
});

test('T11 the Stroke width unit select does not offer %', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    const state = await strokeState(page);
    assert.deepEqual([state.number, state.unit], ['5', 'px']);
    assert.equal(state.units.includes('%'), false, 'a border width takes no percentage');
    assert.deepEqual(state.units, ['px', 'pt', 'rem', 'em', 'vw', 'vh', 'ch', 'cm', 'mm', 'in']);
  }, { html });
});

test('T11d the Stroke editor converts 5px to 3.75pt and back; Enter sends the width in pt', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'pt', ['change']);
    let state = await strokeState(page);
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '3.75', 'pt']);
    assert.equal(state.focusOnNumber, true);
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '5px', 'the rendered width is unchanged');
    assert.match(await inlineStyle(page, '#item-a'), /3\.75pt/);

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'rem', ['change']);
    assert.equal(await strokeState(page).then((s) => s.number), '0.313', 'rem from the unrounded 5px, not from 3.75pt');
    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'px', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['5', 'px']);

    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke width"]', '6', ['input']);
    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'pt', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['4.5', 'pt'], 'a typed number replaces the anchor');
    assert.deepEqual(await errorStatus(page), []);

    await page.keyboard.press('Enter');
    await waitEditorClosed(page, '__raven-stroke__');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]).filter((edit) => edit[0] === 'border-width'), [['border-width', '5px', '4.5pt']]);
  }, { html });
});

test('T11e the Stroke editor takes a typed unit as typed: 3pt in the px field sets the unit select to pt', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke width"]', '3pt', ['input']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['3', 'pt']);
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '4px', '3pt is 4px');
  }, { html });
});

test('T11f a Stroke unit change the page cannot render the same is refused and nothing is recorded', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    // 5px is 0.132cm to three decimals, 4.99px, which a device pixel ratio of 1 draws as 4px.
    if (await page.evaluate(() => window.devicePixelRatio) !== 1) { t.skip('needs a device pixel ratio of 1'); return; }
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    const styleBefore = await inlineStyle(page, '#item-a');

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'cm', ['change']);

    const state = await strokeState(page);
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '5', 'px']);
    assert.equal(await inlineStyle(page, '#item-a'), styleBefore, 'the page is as it was');
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '5px');
    assert.equal(await sendButton(page).then((b) => b.disabled), true, 'nothing is held or recorded');
    assert.deepEqual(await errorStatus(page), ["Can't keep 5px when switching stroke width to cm here"]);
  }, { html });
});

test('T12f a token-linked number row ignores a typed unit: the unit select stays and nothing is written', async (t) => {
  const html = await fixtureWith('  :root { --leading-body: 26px; }\n  #copy { line-height: var(--leading-body); }');
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    const linked = await shadowEval(page, (root, row) => root.querySelector(row + ' .raven-grab-style-editor').getAttribute('data-token-linked'), ROW('line-height'));
    assert.equal(linked, 'true', 'the fixture binds the row to a token');
    await typeNumber(page, 'line-height', '30%');
    assert.equal(await editorState(page, 'line-height').then((s) => s.unit), 'px');
    assert.equal(await inlineStyle(page, '#copy'), '');
  }, { html, design: '---\nleading:\n  body: "26px"\n---\n\n# Fixture\n' });
});

test('T10h an arrow step after a typed unit in upper case keeps that unit: 10EM, ArrowUp, Enter sends 11em', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '10EM', ['input']);
    assert.equal(await sizeState(page, 'width').then((s) => s.unit), 'em');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 10em;');

    await page.keyboard.press('ArrowUp');
    const state = await sizeState(page, 'width');
    assert.deepEqual([state.number, state.unit], ['11', 'em'], 'the step keeps the unit the select shows');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 11em;');

    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'width');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['width', '494px', '11em']]);
  });
});

test('T10i the Size editor keeps the unrounded px across unit changes: 27px reads 5.19 in % and 27 again in px', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '27', ['input']);
    await setControl(page, 'width', 'select[aria-label="width unit"]', '%', ['change']);
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['5.19', '%'], '27px in a 520px parent');
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'px', ['change']);
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['27', 'px'], '5.19% alone would read 26.99');
    assert.deepEqual(await errorStatus(page), []);
  });
});

test('T11g an outside stroke is checked on outline-width: a unit change the page cannot render the same is refused', async (t) => {
  const html = await fixtureWith('  #item-a { outline: 5px solid #112233; }');
  await run(t, async (page) => {
    if (await page.evaluate(() => window.devicePixelRatio) !== 1) { t.skip('needs a device pixel ratio of 1'); return; }
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    const outside = await shadowEval(page, (root, row) => root.querySelector(row + ' [data-stroke-position="outside"]').getAttribute('aria-pressed'), ROW('__raven-stroke__'));
    assert.equal(outside, 'true', 'the fixture opens as an outside stroke');
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '0px');
    const styleBefore = await inlineStyle(page, '#item-a');

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'cm', ['change']);

    const state = await strokeState(page);
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '5', 'px']);
    assert.equal(await inlineStyle(page, '#item-a'), styleBefore, 'the page is as it was');
    assert.equal(await computed(page, '#item-a', 'outline-width'), '5px');
    assert.deepEqual(await errorStatus(page), ["Can't keep 5px when switching stroke width to cm here"]);
  }, { html });
});

test('T10j a converted Size value is sent in the chosen unit: 494px, choose %, Enter sends 95%', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    await setControl(page, 'width', 'select[aria-label="width unit"]', '%', ['change']);
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 95%;');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'width');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]), [['width', '494px', '95%']]);
  });
});

test('T10k an emptied Size field switches the unit with no conversion and no preview; the next number converts from that unit', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '', ['input']);
    const emptied = await inlineStyle(page, '#pad');
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'em', ['change']);
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['', 'em']);
    assert.equal(await inlineStyle(page, '#pad'), emptied, 'the unit switch writes nothing');

    await setControl(page, 'width', 'input[aria-label="width value"]', '10', ['input']);
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 10em;');
    await setControl(page, 'width', 'select[aria-label="width unit"]', 'px', ['change']);
    assert.deepEqual(await sizeState(page, 'width').then((s) => [s.number, s.unit]), ['160', 'px'], '10em on 16px text');
    assert.equal(await inlineStyle(page, '#pad'), 'transition-duration: 1s; width: 160px;');
    assert.deepEqual(await errorStatus(page), []);
  });
});

test('T11h a refused Stroke unit change keeps the pending edit: 6px typed down to 5, cm refused, Enter sends 5px', async (t) => {
  const html = await fixtureWith('  #item-a { border: 6px solid #112233; }');
  await run(t, async (page, { grabBodies }) => {
    if (await page.evaluate(() => window.devicePixelRatio) !== 1) { t.skip('needs a device pixel ratio of 1'); return; }
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke width"]', '5', ['input']);
    const styleBefore = await inlineStyle(page, '#item-a');
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '5px');

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'cm', ['change']);

    const state = await strokeState(page);
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '5', 'px']);
    assert.equal(await inlineStyle(page, '#item-a'), styleBefore, 'the page is as it was before the refusal');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'the typed 5px is still pending');
    assert.deepEqual(await errorStatus(page), ["Can't keep 5px when switching stroke width to cm here"]);

    await page.keyboard.press('Enter');
    await waitEditorClosed(page, '__raven-stroke__');
    await sendBatch(page);
    assert.deepEqual(sentStyleEdits(grabBodies[0]).filter((edit) => edit[0] === 'border-width'), [['border-width', '6px', '5px']]);
  }, { html });
});

test('T11i an emptied Stroke width switches the unit with no conversion and no preview; the next number converts from that unit', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke width"]', '', ['input']);
    const emptied = await inlineStyle(page, '#item-a');
    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'pt', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['', 'pt']);
    assert.equal(await inlineStyle(page, '#item-a'), emptied, 'the unit switch writes nothing');

    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke width"]', '6', ['input']);
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '8px', '6pt');
    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'px', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['8', 'px']);
    assert.deepEqual(await errorStatus(page), []);
  }, { html });
});

test('T11j Stroke style none sets the width to 0 and drops the unit anchor: a later unit change converts 0, not the old width', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'pt', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['3.75', 'pt']);

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke style"]', 'none', ['change']);
    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke style"]', 'solid', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['0', 'pt']);

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'px', ['change']);
    assert.deepEqual(await strokeState(page).then((s) => [s.number, s.unit]), ['0', 'px']);
    assert.deepEqual(await errorStatus(page), []);
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '0px');
  }, { html });
});

test('T11k a unit select offers every unit when the page answers no to every support question', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await page.evaluate(() => { CSS.supports = () => false; });
    await openRow(page, '__raven-stroke__');
    const state = await strokeState(page);
    assert.deepEqual(state.units, ['px', 'pt', 'rem', 'em', '%', 'vw', 'vh', 'ch', 'cm', 'mm', 'in']);
  }, { html });
});

test('T11l a Stroke unit change the preview rejects puts the number back: an unreadable colour, pt chosen, the field still reads 5 and px', async (t) => {
  const html = await fixtureWith(STROKE_FIXTURE);
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke color"]', 'junk', ['input']);
    const styleBefore = await inlineStyle(page, '#item-a');

    await setControl(page, '__raven-stroke__', 'select[aria-label="Stroke width unit"]', 'pt', ['change']);

    const state = await strokeState(page);
    assert.deepEqual([state.mounted, state.number, state.unit], [true, '5', 'px']);
    assert.equal(await inlineStyle(page, '#item-a'), styleBefore, 'the page is as it was');
    assert.equal(await computed(page, '#item-a', 'border-top-width'), '5px');
  }, { html });
});

function traySummary(page) {
  return shadowEval(page, (root) => {
    const summary = root.querySelector('[data-change-tray-summary]');
    return summary ? summary.textContent : null;
  });
}

test('T65 Send and the Pending summary count the value an open editor holds, and one press sends that many', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', 'a held value with nothing recorded');
    assert.equal(await traySummary(page), '1 being edited');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    assert.equal(await traySummary(page), '1 pending');

    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 2 changes', 'one recorded and one held');
    assert.equal(await traySummary(page), '1 pending · 1 being edited');
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'font-size');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', 'Escape drops the held value from the count');

    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', 'a re-edit of a recorded property adds no row');
    assert.equal(await traySummary(page), '1 pending');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');

    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 2 changes');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    const sent = sentStyleEdits(grabBodies[0]).map((edit) => edit[0]).sort();
    assert.deepEqual(sent, ['font-size', 'line-height'], 'the press sent the two changes the label counted');
  });
});

test('T66 a re-edit typed back to the page value counts one change fewer', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '26');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [false, 'Send to agent'], 'the held value removes the only change');
    assert.equal(await traySummary(page), '1 pending · 1 undone by this edit');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    assert.equal(await traySummary(page), 'None yet');
  });
});

test('T67 a held value that stops parsing holds Send until it is fixed', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 2 changes');
    await typeNumber(page, 'font-size', 'abc');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [true, 'Fix the value being edited'], 'Send waits instead of dropping the field');
    assert.equal(await traySummary(page), '1 pending · edited value not valid');
  });
});

function fieldInvalid(page, property) {
  return shadowEval(page, (root, sel) => {
    const input = root.querySelector(sel + ' .raven-grab-style-input');
    return input ? { invalid: input.getAttribute('aria-invalid'), border: getComputedStyle(input).borderTopColor, focused: root.activeElement === input } : null;
  }, ROW(property));
}

test('T73 an unparseable held value warns on the field, the tray and Send, and fixing it clears all three', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    assert.equal((await fieldInvalid(page, 'font-size')).invalid, null);
    await typeNumber(page, 'font-size', '20pxx');
    const field = await fieldInvalid(page, 'font-size');
    assert.equal(field.invalid, 'true');
    assert.equal(field.border, 'rgb(255, 92, 92)', 'the field border takes the warning colour');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [true, 'Fix the value being edited']);
    assert.equal(await traySummary(page), 'Edited value not valid');
    await typeNumber(page, 'font-size', '22');
    assert.equal((await fieldInvalid(page, 'font-size')).invalid, null);
    const fixed = await sendButton(page);
    assert.deepEqual([fixed.disabled, fixed.label], [false, 'Send 1 change']);
    assert.equal(await traySummary(page), '1 being edited');
  });
});

test('T74 Add to queue waits on an unparseable held value and keeps the editor open', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await typeNumber(page, 'font-size', 'abc');
    const queue = await queueButton(page);
    assert.equal(queue.disabled, true);
    assert.match(queue.status + ' ' + (await shadowEval(page, (root) => root.querySelector('[data-queue-draft]').getAttribute('title'))), /Fix the value being edited/);
    await page.mouse.click(queue.x, queue.y);
    assert.equal(await editorOpen(page, 'font-size'), true, 'the press leaves the field open to fix');
    assert.equal((await fieldInvalid(page, 'font-size')).focused, true, 'the field keeps focus to be fixed');
    assert.equal(await traySummary(page), '1 pending · edited value not valid', 'nothing was banked');
  });
});

test('T77 a touch on Add to queue leaves an unparseable field open', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await typeNumber(page, 'font-size', 'abc');
    await touchOn(page, '[data-queue-draft]', [{ type: 'pointerdown' }, { type: 'pointerup' }]);
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'font-size'), true, 'the touch does not commit the field');
  });
});

test('T78 a re-edit that stops parsing holds Send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    await typeNumber(page, 'line-height', 'abc');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [true, 'Fix the value being edited']);
  });
});

test('T75 a Send dispatched while the held value does not parse sends nothing and keeps the field', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await typeNumber(page, 'font-size', 'abc');
    // A forced click: the disabled button is the first guard, the dispatch the second.
    await shadowEval(page, (root) => {
      const button = root.querySelector('[data-send-batch]');
      button.disabled = false;
      button.click();
    });
    await page.waitForTimeout(150);
    assert.equal(grabBodies.length, 0, 'nothing was sent');
    assert.equal(await editorOpen(page, 'font-size'), true, 'the field is still open to fix');
    assert.equal(await sendButton(page).then((b) => b.label), 'Fix the value being edited');
  });
});

test('T68 a box-model field retyped to its own value in another spelling adds nothing to the count', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-top', '20');
    await openBoxField(page, 'padding-left');
    await typeBoxField(page, 'padding-left', '13px');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    await typeBoxField(page, 'padding-left', '15');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 2 changes');
  }, { html });
});

test('T69 the padding shorthand held at the original undoes the side edit in the count', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-right', '18');
    await openRow(page, 'padding');
    await typeNumber(page, 'padding', '13px');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send to agent', 'the shorthand at 13px records nothing');
    assert.equal(await traySummary(page), '1 pending · 1 undone by this edit');
    await typeNumber(page, 'padding', '14px');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', 'the shorthand replaces the side edit');
  }, { html });
});

test('T70 while a batch applies, "send N next" counts the value an open field holds', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-top', '20');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    await commitBoxField(page, 'padding-left', '20');
    await openBoxField(page, 'padding-right');
    await typeBoxField(page, 'padding-right', '30');
    assert.match(await sendButton(page).then((b) => b.label), /^Applying 1 · send 2 next$/);
  }, { html, expose: ['finishActiveDispatch', 'SEND_TIMINGS'] });
});

test('T76 while a batch applies, an unparseable held value offers nothing to send next', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '28');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'line-height');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'font-size');
    await openRow(page, 'line-height');
    await typeNumber(page, 'line-height', '30');
    assert.equal(await sendButton(page).then((b) => b.label), 'Applying 1 · send 2 next');
    await typeNumber(page, 'line-height', 'abc');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [true, 'Applying 1 change…'], 'the next send waits for the field');
  }, { expose: ['finishActiveDispatch', 'SEND_TIMINGS'] });
});

test('T71 a held shorthand over uneven sides is counted against the sides the page had', async (t) => {
  const html = await fixtureWith(PAD_STILL + '\n  #pad { padding: 10px 20px 30px 40px; }');
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-top', '50');
    await openRow(page, 'padding');
    await typeNumber(page, 'padding', '10px');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change', '10px on every side is a change from 10px 20px 30px 40px');
    await typeNumber(page, 'padding', '10px 20px 30px 40px');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send to agent', 'the original sides undo the side edit');
  }, { html });
});

test('T72 while a batch applies, the tray and Send count the held value, and a held undo leaves nothing next', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#pad');
    await commitBoxField(page, 'padding-top', '20');
    await sendBatch(page);
    assert.equal(grabBodies.length, 1);
    await commitBoxField(page, 'padding-left', '20');
    await openBoxField(page, 'padding-right');
    await typeBoxField(page, 'padding-right', '30');
    assert.equal(await traySummary(page), '1 active · 2 next');
    await page.keyboard.press('Escape');
    await openBoxField(page, 'padding-left');
    await typeBoxField(page, 'padding-left', '13');
    assert.equal(await traySummary(page), '1 active · 0 next');
    assert.equal(await sendButton(page).then((b) => b.label), 'Applying 1 change…');
  }, { html, expose: ['finishActiveDispatch', 'SEND_TIMINGS'] });
});

// --- An unparseable value in each structured editor holds Send ---------------

function invalidAt(page, selector) {
  return shadowEval(page, (root, sel) => {
    const node = root.querySelector(sel);
    return node ? node.getAttribute('aria-invalid') : 'missing';
  }, selector);
}

function borderAt(page, selector) {
  return shadowEval(page, (root, sel) => getComputedStyle(root.querySelector(sel)).borderTopColor, selector);
}

// Focus leaves the editor for nothing (relatedTarget null), as when the window loses focus.
async function blurOut(page, property) {
  await shadowEval(page, (root) => { if (root.activeElement) root.activeElement.blur(); return true; });
  await page.waitForTimeout(50);
  return editorOpen(page, property);
}

// Enter, from the field or from another control in its editor, keeps the editor
// open with the field marked and focused.
async function enterHolds(page, property, field, from) {
  assert.equal(await focusControl(page, property, from || field), true);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  assert.equal(await editorOpen(page, property), true, 'Enter from ' + (from || field) + ' keeps the editor open');
  const state = await shadowEval(page, (root, arg) => {
    const node = root.querySelector(arg.row + ' .raven-grab-style-editor ' + arg.field);
    return { invalid: node.getAttribute('aria-invalid'), focused: root.activeElement === node };
  }, { row: ROW(property), field });
  assert.deepEqual(state, { invalid: 'true', focused: true }, 'the field stays marked and takes focus');
}

function ringAt(page, selector) {
  return shadowEval(page, (root, sel) => {
    const style = getComputedStyle(root.querySelector(sel));
    return { ring: style.boxShadow, fill: style.backgroundColor };
  }, selector);
}

async function expectHeldInvalid(page, selector, message) {
  const held = await sendButton(page);
  assert.deepEqual([held.disabled, held.label], [true, 'Fix the value being edited'], message);
  assert.equal(await invalidAt(page, selector), 'true', 'the field that does not parse is marked');
  assert.equal(await borderAt(page, selector), 'rgb(255, 92, 92)', 'the marked field shows the warning border');
  assert.deepEqual(await ringAt(page, selector), { ring: 'rgb(255, 92, 92) 0px 0px 0px 2px', fill: 'rgba(255, 92, 92, 0.12)' }, 'the marked field shows the warning ring and fill');
}

test('T79 a size field that stops parsing holds Send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'width');
    await setControl(page, 'width', 'input[aria-label="width value"]', '320', ['input']);
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    await setControl(page, 'width', 'input[aria-label="width value"]', 'abc', ['input']);
    await expectHeldInvalid(page, 'input[aria-label="width value"]', 'the size editor holds Send');
    assert.equal(await blurOut(page, 'width'), true, 'losing focus does not commit and drop the value');
    assert.equal(await focusControl(page, 'width', 'select'), true);
    assert.equal(await blurOut(page, 'width'), true, 'focus leaving from the unit select keeps the field too');
    await enterHolds(page, 'width', 'input[aria-label="width value"]');
    await enterHolds(page, 'width', 'input[aria-label="width value"]', 'select');
  });
});

test('T80 a box-model field that stops parsing holds Send and stays open on Tab', async (t) => {
  const html = await fixtureWith(PAD_STILL);
  await run(t, async (page) => {
    await selectElement(page, '#pad');
    await openBoxField(page, 'padding-top');
    await typeBoxField(page, 'padding-top', '20');
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    await typeBoxField(page, 'padding-top', 'abc');
    await expectHeldInvalid(page, '[data-box-input="padding-top"]', 'the box field holds Send');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    assert.equal(await boxFieldOpen(page, 'padding-top'), true, 'Tab does not commit the field');
    await shadowEval(page, (root) => { root.querySelector('[data-box-input="padding-top"]').focus(); return true; });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    assert.equal(await boxFieldOpen(page, 'padding-top'), true, 'Enter does not commit the field');
    assert.deepEqual(await shadowEval(page, (root) => {
      const input = root.querySelector('[data-box-input="padding-top"]');
      return [input.getAttribute('aria-invalid'), root.activeElement === input];
    }), ['true', true], 'the field stays marked and focused');
  }, { html });
});

test('T81 Tab away from an unparseable field keeps it open and Add to queue blocked', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await typeNumber(page, 'font-size', 'abc');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'font-size'), true, 'Tab does not commit and drop the value');
    assert.equal(await blurOut(page, 'font-size'), true, 'focus leaving the editor does not commit and drop the value');
    assert.equal((await fieldInvalid(page, 'font-size')).invalid, 'true');
    assert.equal(await queueButton(page).then((b) => b.disabled), true);
    assert.equal(await traySummary(page), 'Edited value not valid');
    await enterHolds(page, 'font-size', '.raven-grab-style-input');
    await enterHolds(page, 'font-size', '.raven-grab-style-input', 'select');
  });
});

test('T82 a field that never parsed, with nothing pending, holds Send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', 'abc');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [true, 'Fix the value being edited'], 'Send and the tray agree');
    assert.equal(await traySummary(page), 'Edited value not valid');
  });
});

test('T83 a box-shadow blur that stops parsing holds Send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRow(page, 'box-shadow');
    const preset = await shadowEval(page, (root) => {
      const button = root.querySelector('.raven-grab-style-editor[data-control="box-shadow"] [data-shadow-preset="medium"]');
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(preset.x, preset.y);
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    const blur = '.raven-grab-style-editor[data-control="box-shadow"] input[aria-label="Box shadow blur"]';
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow blur"]', 'abc', ['input']);
    await expectHeldInvalid(page, blur, 'a blur that is not a number holds Send');
    assert.equal(await blurOut(page, 'box-shadow'), true, 'losing focus does not commit and drop the value');
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow blur"]', '-1', ['input']);
    await expectHeldInvalid(page, blur, 'a negative blur holds Send');
    await setControl(page, 'box-shadow', 'input[aria-label="Box shadow blur"]', '4', ['input']);
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    assert.equal(await invalidAt(page, blur), null);
    const colour = '.raven-grab-style-editor[data-control="box-shadow"] input.raven-grab-style-input[type="text"]:not([aria-label])';
    await setControl(page, 'box-shadow', 'input.raven-grab-style-input[type="text"]:not([aria-label])', 'notacolour', ['input']);
    await expectHeldInvalid(page, colour, 'a shadow colour that does not parse holds Send');
    await enterHolds(page, 'box-shadow', 'input.raven-grab-style-input[type="text"]:not([aria-label])');
    await enterHolds(page, 'box-shadow', 'input.raven-grab-style-input[type="text"]:not([aria-label])', 'input[type="color"]');
  });
});

test('T84 a corner radius that stops parsing holds Send', async (t) => {
  const html = await fixtureWith('  #item-a { border-radius: 4px; }');
  await run(t, async (page) => {
    await selectElement(page, '#item-a');
    await openRadiusCorners(page);
    await setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', '12px', ['input']);
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    await setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', '12qq', ['input']);
    await expectHeldInvalid(page, 'input[data-radius-corner="top-left"]', 'the radius editor holds Send');
    assert.equal(await blurOut(page, 'border-radius'), true, 'losing focus does not commit and drop the value');
    await enterHolds(page, 'border-radius', 'input[data-radius-corner="top-left"]');
  }, { html });
});

test('T85 a text-decoration colour that stops parsing holds Send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#swatch');
    await openRow(page, 'text-decoration');
    await setControl(page, 'text-decoration', 'select[aria-label="Text decoration line"]', 'overline', ['input', 'change']);
    assert.equal(await sendButton(page).then((b) => b.label), 'Send 1 change');
    await setControl(page, 'text-decoration', 'input[aria-label="Text decoration color value"]', 'notacolour', ['input']);
    await expectHeldInvalid(page, 'input[aria-label="Text decoration color value"]', 'the colour holds Send');
    assert.equal(await blurOut(page, 'text-decoration'), true, 'losing focus does not commit and drop the value');
    await enterHolds(page, 'text-decoration', 'input[aria-label="Text decoration color value"]', 'input[type="color"]');
  });
});

test('T86 a Stroke colour that stops parsing holds Send and stays open when focus leaves', async (t) => {
  const html = await fixtureWith('  #swatch { border: 2px solid #000000; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#swatch');
    await openRow(page, '__raven-stroke__');
    await setControl(page, '__raven-stroke__', 'input[aria-label="Stroke color"]', 'notacolour', ['input']);
    await expectHeldInvalid(page, '.raven-grab-style-editor input[aria-label="Stroke color"]', 'the Stroke editor holds Send');
    assert.equal(await blurOut(page, '__raven-stroke__'), true, 'losing focus does not commit and drop the value');
    await enterHolds(page, '__raven-stroke__', 'input[aria-label="Stroke color"]');
    await enterHolds(page, '__raven-stroke__', 'input[aria-label="Stroke color"]', 'input[type="color"]');
    assert.equal(grabBodies.length, 0);
  }, { html });
});

test('T87 a press outside the editor leaves an unparseable field open, generic and structured', async (t) => {
  const html = await fixtureWith('  #item-a { border-radius: 4px; }');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', 'abc');
    await pressPanelTitle(page);
    await page.waitForTimeout(50);
    assert.equal(await editorOpen(page, 'font-size'), true, 'a panel press does not drop the field');
    assert.equal((await fieldInvalid(page, 'font-size')).focused, true, 'focus returns to the field to fix');
    // A press on the page selects something else: like Escape, it abandons the field.
    await page.keyboard.press('Escape');
    await waitEditorClosed(page, 'font-size');
    assert.equal(await traySummary(page), 'None yet', 'nothing was recorded');

    await selectElement(page, '#item-a');
    await openRadiusCorners(page);
    await setControl(page, 'border-radius', 'input[data-radius-corner="top-left"]', '12qq', ['input']);
    await pressPanelTitle(page);
    await page.waitForTimeout(50);
    assert.equal(await invalidAt(page, 'input[data-radius-corner="top-left"]'), 'true', 'the corner is still open and marked');
    assert.equal(grabBodies.length, 0);
  }, { html });
});

test('T88 a typed colour that is not a colour holds Send', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#copy');
    await openRow(page, 'font-size');
    await typeNumber(page, 'font-size', '20');
    await page.keyboard.press('Enter');
    await waitEditorClosed(page, 'font-size');
    await selectElement(page, '#swatch');
    await openRow(page, 'color');
    await typeNumber(page, 'color', 'notacolour');
    const held = await sendButton(page);
    assert.deepEqual([held.disabled, held.label], [true, 'Fix the value being edited']);
    assert.equal((await fieldInvalid(page, 'color')).invalid, 'true');
    await enterHolds(page, 'color', '.raven-grab-style-input');
    await typeNumber(page, 'color', 'red');
    assert.equal(await sendButton(page).then((b) => b.disabled), false, 'a real colour clears the hold');
    assert.equal((await fieldInvalid(page, 'color')).invalid, null);
  });
});
