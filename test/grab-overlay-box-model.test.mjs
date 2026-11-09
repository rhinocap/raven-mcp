// Box model: margin, border, padding and the content box of the selection,
// edited as longhands through commitStyleEdit
// (spec "Grab panels — search, box model, change rows" v0.2 §2).
// Real Chromium, local bridge, fixture test/fixtures/grab-panels.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  withPanelsOverlay, skipIfNoBrowser, selectElement, editStyle, sendBatch,
  readTray, shadowEval, FIXTURE_PATH
} from './grab-panels-harness.mjs';

async function run(t, fn, options) {
  try {
    await withPanelsOverlay(fn, options);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
}

// Every visible box number: text, edited, read-only and its reason.
function readBox(page) {
  return shadowEval(page, (root) => {
    const out = {};
    for (const cell of root.querySelectorAll('[data-box-prop]')) {
      if (!cell.getClientRects().length) continue;
      out[cell.getAttribute('data-box-prop')] = {
        text: cell.textContent,
        edited: cell.getAttribute('data-edited') === 'true',
        readonly: cell.getAttribute('data-readonly') === 'true',
        title: cell.getAttribute('title') || ''
      };
    }
    return out;
  });
}

function cellPoint(page, property) {
  return shadowEval(page, (root, prop) => {
    const cell = Array.from(root.querySelectorAll(`[data-box-prop="${prop}"]`)).find((node) => node.getClientRects().length);
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, property);
}

function computed(page, selector, properties) {
  return page.evaluate(({ sel, props }) => {
    const style = getComputedStyle(document.querySelector(sel));
    return Object.fromEntries(props.map((prop) => [prop, style.getPropertyValue(prop)]));
  }, { sel: selector, props: properties });
}

function boxInputOpen(page) {
  return shadowEval(page, (root) => {
    const input = root.querySelector('[data-box-input]');
    return input ? { property: input.getAttribute('data-box-input'), value: input.value, focused: root.activeElement === input } : null;
  });
}

// Click a number (no movement), type into the field, press Enter.
async function typeInBox(page, property, value) {
  const point = await cellPoint(page, property);
  if (!point) throw new Error(`no box cell for ${property}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((prop) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector(`[data-box-input="${prop}"]`));
  }, property, { timeout: 5000 });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

// Shift-click another element to add it to the selection.
async function addToSelection(page, selector) {
  const at = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  await page.keyboard.down('Shift');
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
}

async function focusCell(page, property) {
  await shadowEval(page, (root, prop) => {
    Array.from(root.querySelectorAll(`[data-box-prop="${prop}"]`)).find((node) => node.getClientRects().length).focus();
    return true;
  }, property);
}

test('shows the selection: margin, border, padding, content box, in the right footer', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    const box = await readBox(page);
    assert.equal(box['margin-top'].text, '8');
    assert.equal(box['margin-left'].text, '0');
    assert.equal(box['border-top-width'].text, '1');
    assert.equal(box['padding-right'].text, '14');
    // button is border-box: 98.2px wide minus 28px padding and 2px border.
    assert.equal(box.width.text, '68.2');
    const layout = await shadowEval(page, (root) => {
      const model = root.querySelector('[data-box-model]');
      const instruction = root.querySelector('[data-instruction]');
      return {
        height: model.getBoundingClientRect().height,
        above: model.getBoundingClientRect().bottom <= instruction.getBoundingClientRect().top,
        right: model.getBoundingClientRect().left > window.innerWidth / 2
      };
    });
    // Enlarged on 2026-11-08 (12px numbers, bigger fields); the Styles list gives up the height.
    assert.ok(layout.height <= 160, `box model is ${layout.height}px tall`);
    assert.ok(layout.above, 'the box model sits above Instructions');
    assert.ok(layout.right, 'the box model is in the right panel');
  });
});

test('an edit in Styles shows in the box model at once', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    await editStyle(page, 'margin', '10px 0 0');
    const box = await readBox(page);
    assert.equal(box['padding-right'].text, '18');
    assert.equal(box['padding-right'].edited, true);
    assert.equal(box['margin-top'].text, '10');
    assert.equal(box.width.text, '68.2', 'content width is unchanged; the border box grew');
  });
});

test('click opens a field; Enter commits a longhand that reads like any Styles edit', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    const point = await cellPoint(page, 'padding-left');
    // A press that moves under 3px is a click.
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 2, point.y);
    await page.mouse.up();
    const open = await boxInputOpen(page);
    assert.deepEqual(open, { property: 'padding-left', value: '14', focused: true });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('20');
    await page.keyboard.press('Enter');
    assert.equal((await computed(page, 'button.cta', ['padding-left']))['padding-left'], '20px');
    const box = await readBox(page);
    assert.equal(box['padding-left'].text, '20');
    assert.equal(box['padding-left'].edited, true);
    assert.equal(box['padding-right'].edited, false);
    const tray = await readTray(page);
    assert.deepEqual([tray[0].rows[0].line1, tray[0].rows[0].line2], ['Style – padding-left', '14px → 20px – button.cta']);
    const focused = await shadowEval(page, (root) => root.activeElement && root.activeElement.getAttribute('data-box-prop'));
    assert.equal(focused, 'padding-left', 'focus returns to the number');
  });
});

test('drag past 3px scrubs with a live preview and never opens the field; Escape mid-scrub restores', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    let point = await cellPoint(page, 'padding-top');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 4, point.y);
    await page.mouse.move(point.x + 10, point.y);
    assert.equal((await computed(page, 'button.cta', ['padding-top']))['padding-top'], '24px', 'live preview while dragging');
    await page.mouse.up();
    assert.equal(await boxInputOpen(page), null, 'a scrub does not open the field');
    assert.equal((await readBox(page))['padding-top'].text, '24');
    assert.equal((await readTray(page))[0].rows[0].line2, '14px → 24px – button.cta');

    point = await cellPoint(page, 'margin-top');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 20, point.y);
    assert.equal((await computed(page, 'button.cta', ['margin-top']))['margin-top'], '28px');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal((await computed(page, 'button.cta', ['margin-top']))['margin-top'], '8px', 'Escape restores the page');
    assert.equal(await boxInputOpen(page), null);
    const rows = (await readTray(page))[0].rows.map((row) => row.line1);
    assert.deepEqual(rows, ['Style – padding-top'], 'the cancelled scrub left no edit');
    assert.equal(await shadowEval(page, (root) => Boolean(root.querySelector('[data-box-model]'))), true, 'Grab is still open');
  });
});

test('arrow keys step by 1 (Shift by 10); in the field they preview and Escape cancels', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await focusCell(page, 'padding-bottom');
    await page.keyboard.press('ArrowUp');
    assert.equal((await computed(page, 'button.cta', ['padding-bottom']))['padding-bottom'], '15px');
    await page.keyboard.press('Shift+ArrowUp');
    assert.equal((await computed(page, 'button.cta', ['padding-bottom']))['padding-bottom'], '25px');
    await page.keyboard.press('ArrowDown');
    assert.equal((await readBox(page))['padding-bottom'].text, '24');
    assert.equal((await readTray(page))[0].rows.length, 1, 'repeated steps stay one row');

    await focusCell(page, 'padding-top');
    await page.keyboard.press('Enter');
    assert.equal((await boxInputOpen(page)).property, 'padding-top');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    assert.equal((await computed(page, 'button.cta', ['padding-top']))['padding-top'], '16px', 'arrows preview in the field');
    await page.keyboard.press('Escape');
    assert.equal((await computed(page, 'button.cta', ['padding-top']))['padding-top'], '14px', 'Escape restores');
    assert.equal(await boxInputOpen(page), null);
    assert.equal((await readBox(page))['padding-top'].edited, false);
    // Padding can't go below zero; margin can.
    await focusCell(page, 'padding-left');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('-5');
    await page.keyboard.press('Enter');
    assert.equal((await computed(page, 'button.cta', ['padding-left']))['padding-left'], '0px');
    await typeInBox(page, 'margin-left', '-6');
    assert.equal((await computed(page, 'button.cta', ['margin-left']))['margin-left'], '-6px');
  });
});

test('auto works for margin, not for padding', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'margin-left', 'auto');
    assert.equal((await readBox(page))['margin-left'].edited, true);
    const tray = await readTray(page);
    assert.deepEqual(tray[0].rows.map((row) => row.line2), ['0px → auto – button.cta']);
    await typeInBox(page, 'padding-left', 'auto');
    assert.equal((await computed(page, 'button.cta', ['padding-left']))['padding-left'], '14px');
    assert.equal((await readTray(page))[0].rows.length, 1, 'auto padding is not an edit');
  });
});

test('no stroke: border numbers are read-only with a reason', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, '#card-a');
    const box = await readBox(page);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.equal(box[`border-${side}-width`].readonly, true);
      assert.equal(box[`border-${side}-width`].title, 'Add a stroke first');
    }
    const point = await cellPoint(page, 'border-top-width');
    await page.mouse.click(point.x, point.y);
    assert.equal(await boxInputOpen(page), null, 'a read-only number does not open');
    await focusCell(page, 'border-top-width');
    await page.keyboard.press('ArrowUp');
    assert.equal((await computed(page, '#card-a', ['border-top-width']))['border-top-width'], '0px');
  });
});

test('content box: width converts back for border-box, and is direct for content-box', async (t) => {
  await run(t, async (page) => {
    // #card-a is content-box: what you type is the width. (It is a shrinking flex
    // item, so its used width is under 150; read the declared value.)
    await selectElement(page, '#card-a');
    const shown = (await readBox(page)).width.text;
    assert.equal(shown, String(Math.round(parseFloat((await computed(page, '#card-a', ['width'])).width) * 100) / 100));
    await typeInBox(page, 'width', '160');
    assert.equal(await page.evaluate(() => document.querySelector('#card-a').style.getPropertyValue('width')), '160px');
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'width', '80');
    const style = await page.evaluate(() => document.querySelector('button.cta').style.getPropertyValue('width'));
    assert.equal(style, '110px', '80 content + 28 padding + 2 border');
    assert.equal((await readBox(page)).width.text, '80');
    await typeInBox(page, 'height', '2rem');
    const height = await page.evaluate(() => document.querySelector('button.cta').style.getPropertyValue('height'));
    assert.match(height, /^calc\((2rem \+ 30px|30px \+ 2rem)\)$/);
  });
});

test('payload: longhands in edit order; re-editing moves a property to the end', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'padding-right', '18');
    await typeInBox(page, 'margin-top', '10');
    await typeInBox(page, 'padding-right', '20');
    await sendBatch(page);
    const edits = grabBodies.at(-1).styleEdits.map((edit) => [edit.property, edit.oldValue, edit.newValue]);
    assert.deepEqual(edits, [
      ['margin-top', '8px', '10px'],
      ['padding-right', '14px', '20px']
    ]);
  });
});

test('a side edit shows on the shorthand row; a later shorthand edit replaces the sides', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'padding-right', '18');
    const row = await shadowEval(page, (root) => {
      const li = root.querySelector('li[data-style-property="padding"]:not([data-style-state])');
      return { value: li.querySelector('code[data-style-value]').textContent, edited: li.getAttribute('data-edited') };
    });
    assert.deepEqual(row, { value: '14px 18px 14px 14px', edited: 'true' });
    await editStyle(page, 'padding', '20px');
    await page.waitForTimeout(50);
    const status = await shadowEval(page, (root) => Array.from(root.querySelectorAll('[data-status], [data-status-b]')).map((node) => node.textContent).join('|'));
    assert.match(status, /Padding sides replaced by padding/);
    assert.equal((await readTray(page))[0].rows.length, 1);
    assert.equal((await readBox(page))['padding-right'].edited, true, 'the shorthand edit marks every side');
    await sendBatch(page);
    assert.deepEqual(grabBodies.at(-1).styleEdits.map((edit) => [edit.property, edit.oldValue, edit.newValue]), [['padding', '14px', '20px']]);
  });
});

test('side, then the shorthand back to the original: no edit, page restored', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'padding-right', '18');
    await editStyle(page, 'padding', '14px');
    assert.equal((await readTray(page)).length, 0, 'nothing pending');
    assert.deepEqual(await computed(page, 'button.cta', ['padding-top', 'padding-right']), { 'padding-top': '14px', 'padding-right': '14px' });
    assert.equal(await page.evaluate(() => document.querySelector('button.cta').getAttribute('style') || ''), '');
  });
});

test('a pending Stroke group owns the border widths: one Stroke row', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, 'button.cta');
    const point = await shadowEval(page, (root) => {
      const cell = root.querySelector('li[data-style-property="__raven-stroke__"] code[data-style-value]');
      cell.scrollIntoView({ block: 'center' });
      const rect = cell.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await shadowEval(page, (root) => {
      const input = root.querySelector('input[aria-label="Stroke width"]');
      input.focus();
      input.value = '2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    await page.keyboard.press('Enter');
    await typeInBox(page, 'border-left-width', '4');
    const widths = await computed(page, 'button.cta', ['border-top-width', 'border-left-width']);
    assert.deepEqual(widths, { 'border-top-width': '2px', 'border-left-width': '4px' });
    const rows = (await readTray(page))[0].rows;
    assert.deepEqual(rows.map((row) => row.line1), ['Stroke'], 'still one Stroke row');
    assert.equal((await readBox(page))['border-left-width'].edited, true);
    await sendBatch(page);
    const sent = grabBodies.at(-1).styleEdits;
    assert.ok(sent.every((edit) => edit.groupId === 'stroke'), 'every border edit belongs to the Stroke group');
    assert.equal(sent.find((edit) => edit.property === 'border-left-width').newValue, '4px');
    assert.equal(sent.find((edit) => edit.property === 'border-top-width').newValue, '2px');
    assert.equal(sent.some((edit) => edit.property === 'border-width'), false);
  });
});

test('a number linked to a token is read-only until detached', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8'))
    .replace('</style>', ':root { --spacing-md: 16px; } .stack { padding-left: var(--spacing-md); }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, '#stack');
    const box = await readBox(page);
    assert.equal(box['padding-left'].readonly, true);
    assert.equal(box['padding-left'].title, 'Linked to a token. Detach it in Styles first.');
    assert.equal(box['padding-right'].readonly, false);
  }, { html, design: '---\nspacing:\n  md: "16px"\n---\n\n# Fixture\n' });
});

test('mobile sheet: the box model is in the Instructions tab', async (t) => {
  await run(t, async (page) => {
    await page.addStyleTag({ content: '.site { left: 10px !important; width: 360px !important; }' });
    const at = await page.evaluate(() => {
      const rect = document.querySelector('button.cta').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(at.x - 2, at.y - 2);
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-layer-row[data-primary="true"], [data-selected-selector]')), null, { timeout: 5000 });
    const tabs = await shadowEval(page, (root) => {
      const out = {};
      for (const tab of ['styles', 'layers', 'instructions']) {
        root.querySelector(`.raven-grab-mobile-tabs [data-tab="${tab}"]`).click();
        const model = root.querySelector('[data-box-model]');
        out[tab] = Boolean(model && model.getClientRects().length);
      }
      return out;
    });
    assert.deepEqual(tabs, { styles: false, layers: false, instructions: true });
  }, { viewport: { width: 390, height: 844 } });
});

test('simple mode has no box model', async (t) => {
  await run(t, async (page) => {
    const at = await page.evaluate(() => {
      const rect = document.querySelector('button.cta').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(at.x - 2, at.y - 2);
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    // Simple mode keeps the Element chip; it is the selection readout there.
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-element-selector]')), null, { timeout: 5000 });
    assert.equal(await shadowEval(page, (root) => root.querySelectorAll('[data-box-model]').length), 0);
  }, { beforeLoad: (page) => page.addInitScript(() => localStorage.setItem('raven-grab-mode', 'simple')) });
});

test('box model markup is only its own elements, with values as text', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    const tags = await shadowEval(page, (root) => Array.from(root.querySelectorAll('[data-box-model] *')).map((node) => node.tagName).filter((tag) => !/^(DIV|SPAN)$/.test(tag)));
    assert.deepEqual(tags, []);
  });
});

// --- Regressions from the independent review of b593efe ---------------------

const inlineStyle = (page) => page.evaluate(() => document.querySelector('button.cta').getAttribute('style') || '');

async function scrubThenEscape(page, property) {
  const point = await cellPoint(page, property);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 6, point.y);
  await page.mouse.move(point.x + 12, point.y);
  await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('shorthand, a side, the shorthand back to the original, then a cancelled side scrub: page stays clean', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    await typeInBox(page, 'padding-right', '24');
    await editStyle(page, 'padding', '14px');
    assert.equal((await readTray(page)).length, 0, 'nothing pending');
    assert.equal(await inlineStyle(page), '');
    await scrubThenEscape(page, 'padding-right');
    assert.equal((await computed(page, 'button.cta', ['padding-right']))['padding-right'], '14px');
    assert.equal(await inlineStyle(page), '', 'no stale side value written back');
  });
});

test('after a shorthand replaces a side, a cancelled scrub on that side keeps the shorthand on the page', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'padding-right', '24');
    await editStyle(page, 'padding', '20px');
    await scrubThenEscape(page, 'padding-right');
    assert.deepEqual(await computed(page, 'button.cta', ['padding-top', 'padding-right']), { 'padding-top': '20px', 'padding-right': '20px' });
    const rows = (await readTray(page))[0].rows;
    assert.deepEqual(rows.map((row) => [row.line1, row.line2]), [['Style – padding', '14px → 20px – button.cta']]);
  });
});

test('an inline-styled element: a side then the shorthand back to the original restores the inline style', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('class="cta"', 'class="cta" style="padding: 14px"');
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'padding-right', '24');
    await editStyle(page, 'padding', '14px');
    assert.equal((await readTray(page)).length, 0, 'nothing pending');
    assert.equal((await computed(page, 'button.cta', ['padding-right']))['padding-right'], '14px');
    assert.equal(await inlineStyle(page), 'padding: 14px;');
  }, { html });
});

test('clicking a fractional number and pressing Enter without typing is not an edit', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>', 'button.cta { width: 100.3333px; padding-left: 13.3333px; }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    for (const property of ['width', 'padding-left']) {
      const point = await cellPoint(page, property);
      await page.mouse.click(point.x, point.y);
      await page.keyboard.press('Enter');
    }
    assert.equal((await readTray(page)).length, 0, 'nothing pending');
  }, { html });
});

test('with a field open, clicking the next number commits the first and opens the second', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    let point = await cellPoint(page, 'padding-top');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('20');
    point = await cellPoint(page, 'padding-right');
    await page.mouse.click(point.x, point.y);
    assert.equal((await boxInputOpen(page))?.property, 'padding-right', 'the second click opens its field');
    assert.equal((await computed(page, 'button.cta', ['padding-top']))['padding-top'], '20px');
  });
});

test('with a field open, a drag on the next number scrubs it', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    let point = await cellPoint(page, 'padding-top');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('20');
    point = await cellPoint(page, 'padding-right');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(point.x + i, point.y);
    await page.mouse.up();
    const after = await computed(page, 'button.cta', ['padding-top', 'padding-right']);
    assert.equal(after['padding-top'], '20px');
    assert.notEqual(after['padding-right'], '14px', 'the scrub moved padding-right');
  });
});

test('a pending Outside stroke makes the border numbers read-only', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await page.evaluate(() => {
      const api = window.__ravenGrabPanels;
      api.commitStrokeEdit(
        { position: 'outside', width: '2px', style: 'solid', color: 'rgb(255, 0, 0)' },
        { position: 'inside', width: '1px', style: 'solid', color: 'rgb(0, 0, 0)' }
      );
      api.renderPanel();
    });
    const box = await readBox(page);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.equal(box[`border-${side}-width`].readonly, true, side);
      assert.equal(box[`border-${side}-width`].title, 'Edit this stroke in Stroke');
    }
    assert.equal((await computed(page, 'button.cta', ['outline-width']))['outline-width'], '2px', 'the outline stays');
  }, { expose: ['commitStrokeEdit', 'renderPanel'] });
});

test('multi-select under border-box with different padding: the content size reads Mixed and is read-only', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>',
    '#card-a, #card-b { box-sizing: border-box; width: 200px; flex: none; }\n#card-b { padding: 20px; }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, '#card-a');
    await addToSelection(page, '#card-b');
    const box = await readBox(page);
    assert.equal(box['padding-left'].text, 'Mixed', 'the selection really is mixed');
    assert.equal(box.width.text, 'Mixed');
    assert.equal(box.width.readonly, true);
    assert.equal(box.width.title, 'Padding or border differs across the selection. Make those match first.');
  }, { html });
});

test('shorthand, then a side over it, then Send: the page keeps no leftover inline padding', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    await typeInBox(page, 'padding-right', '24');
    await sendBatch(page);
    assert.equal(await page.evaluate(() => document.querySelector('button.cta').getAttribute('style') || ''), '');
    assert.deepEqual(await computed(page, 'button.cta', ['padding-top', 'padding-right']), { 'padding-top': '14px', 'padding-right': '14px' });
  });
});

test('multi-select: typing into a Mixed side makes every selected element match', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>', '#card-b { padding-left: 20px; }\n</style>');
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#card-a');
    await addToSelection(page, '#card-b');
    const before = await readBox(page);
    assert.equal(before['padding-left'].text, 'Mixed');
    assert.equal(before['padding-left'].readonly, false, 'a Mixed number can be typed into');
    const point = await cellPoint(page, 'padding-left');
    await page.mouse.click(point.x, point.y);
    const open = await boxInputOpen(page);
    assert.equal(open.property, 'padding-left');
    assert.equal(open.value, '', 'the field starts empty');
    assert.equal(await shadowEval(page, (root) => root.querySelector('[data-box-input]').placeholder), 'Mixed');
    await page.keyboard.type('24');
    await page.keyboard.press('Enter');
    assert.equal((await computed(page, '#card-a', ['padding-left']))['padding-left'], '24px');
    assert.equal((await computed(page, '#card-b', ['padding-left']))['padding-left'], '24px');
    const after = await readBox(page);
    assert.equal(after['padding-left'].text, '24', 'they match, so the box shows the value');
    assert.equal(after['padding-left'].edited, true);
    await sendBatch(page);
    const edits = JSON.stringify(grabBodies.at(-1));
    assert.match(edits, /"property":"padding-left"[^}]*"newValue":"24px"/);
  }, { html });
});

test('multi-select: an empty Enter on a Mixed number changes nothing', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>', '#card-b { padding-left: 20px; }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, '#card-a');
    await addToSelection(page, '#card-b');
    const card = await computed(page, '#card-a', ['padding-left']);
    const point = await cellPoint(page, 'padding-left');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('Enter');
    assert.deepEqual(await computed(page, '#card-a', ['padding-left']), card);
    assert.equal((await computed(page, '#card-b', ['padding-left']))['padding-left'], '20px');
    assert.equal((await readTray(page)).length, 0, 'no pending change');
  }, { html });
});

test('multi-select: a Mixed content width with matching padding takes one typed value', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>',
    '#card-a, #card-b { box-sizing: border-box; flex: none; }\n#card-a { width: 180px; }\n#card-b { width: 220px; }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, '#card-a');
    await addToSelection(page, '#card-b');
    assert.equal((await readBox(page)).width.text, 'Mixed');
    await typeInBox(page, 'width', '150');
    const a = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#card-a')); return parseFloat(s.width) - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth); });
    const b = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#card-b')); return parseFloat(s.width) - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth); });
    assert.equal(a, 150);
    assert.equal(b, 150);
    assert.equal((await readBox(page)).width.text, '150');
  }, { html });
});

test('multi-select: sides that differ but add up the same keep one content width you can type into', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>',
    '#card-a, #card-b { box-sizing: border-box; width: 200px; flex: none; }\n#card-a { padding-left: 10px; padding-right: 20px; }\n#card-b { padding-left: 20px; padding-right: 10px; }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, '#card-a');
    await addToSelection(page, '#card-b');
    const content = (sel) => page.evaluate((s) => { const c = getComputedStyle(document.querySelector(s)); return parseFloat(c.width) - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - parseFloat(c.borderLeftWidth) - parseFloat(c.borderRightWidth); }, sel);
    const box = await readBox(page);
    assert.equal(box['padding-left'].text, 'Mixed', 'the sides really differ');
    assert.equal(box.width.text, String(await content('#card-a')), 'both content widths are equal, so the box shows the number');
    assert.equal(box.width.readonly, false);
    await typeInBox(page, 'width', '150');
    assert.equal(await content('#card-a'), 150);
    assert.equal(await content('#card-b'), 150);
  }, { html });
});

test('a box border edit, then a Stroke edit: one Stroke row from the true original', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'border-left-width', '2');
    const point = await shadowEval(page, (root) => {
      const cell = root.querySelector('li[data-style-property="__raven-stroke__"] code[data-style-value]');
      cell.scrollIntoView({ block: 'center' });
      const rect = cell.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await shadowEval(page, (root) => {
      const input = root.querySelector('input[aria-label="Stroke width"]');
      input.focus();
      input.value = '3';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    await page.keyboard.press('Enter');
    // The sides already differ, so Stroke edits per side: top changes, left keeps the box edit.
    assert.deepEqual(await computed(page, 'button.cta', ['border-top-width', 'border-left-width']), { 'border-top-width': '3px', 'border-left-width': '2px' });
    const rows = (await readTray(page))[0].rows;
    assert.deepEqual(rows.map((row) => row.line1), ['Stroke'], 'the box edit joined the Stroke row');
    assert.match(rows[0].line2, /^1px solid /, 'the Stroke starts from the original 1px');
    await sendBatch(page);
    const sent = grabBodies.at(-1).styleEdits;
    assert.ok(sent.every((edit) => edit.groupId === 'stroke'), 'no plain border edit is left over');
    const left = sent.filter((edit) => edit.property === 'border-left-width');
    assert.equal(left.length, 1);
    assert.deepEqual([left[0].oldValue, left[0].newValue], ['1px', '2px']);
  });
});

test('mobile sheet: the box model sits above Instructions and the field is still reachable', async (t) => {
  await run(t, async (page) => {
    await page.addStyleTag({ content: '.site { left: 10px !important; width: 360px !important; }' });
    const at = await page.evaluate(() => { const r = document.querySelector('button.cta').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(at.x - 2, at.y - 2);
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-layer-row[data-primary="true"], [data-selected-selector]')), null, { timeout: 5000 });
    const tab = await shadowEval(page, (root) => { const r = root.querySelector('.raven-grab-mobile-tabs [data-tab="instructions"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(tab.x, tab.y);
    const order = await shadowEval(page, (root) => {
      const box = root.querySelector('[data-box-model]').getBoundingClientRect();
      const field = root.querySelector('[data-instruction]');
      field.scrollIntoView({ block: 'nearest' });
      const rect = field.getBoundingClientRect();
      return { boxAbove: box.top < field.getBoundingClientRect().top, hit: root.elementFromPoint(rect.left + rect.width / 2, rect.top + 12) === field, x: rect.left + rect.width / 2, y: rect.top + 12 };
    });
    assert.equal(order.boxAbove, true);
    assert.equal(order.hit, true, 'nothing covers the field once scrolled to');
    await page.mouse.click(order.x, order.y);
    await page.keyboard.type('Tighten this');
    assert.equal(await shadowEval(page, (root) => root.querySelector('[data-instruction]').value), 'Tighten this');
  }, { viewport: { width: 390, height: 844 } });
});

test('a box border edit, then a uniform Stroke: the Stroke covers every side, one row', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, 'button.cta');
    await typeInBox(page, 'border-left-width', '2');
    await page.evaluate(() => {
      const api = window.__ravenGrabPanels;
      api.commitStrokeEdit(
        { position: 'inside', width: '3px', style: 'solid', color: 'rgb(221, 221, 221)' },
        { position: 'inside', width: '1px', style: 'solid', color: 'rgb(221, 221, 221)' }
      );
      api.renderPanel();
    });
    assert.equal((await computed(page, 'button.cta', ['border-left-width']))['border-left-width'], '3px');
    const rows = (await readTray(page))[0].rows;
    assert.deepEqual(rows.map((row) => row.line1), ['Stroke']);
    assert.match(rows[0].line2, /^1px solid .* → 3px solid /);
    await sendBatch(page);
    const sent = grabBodies.at(-1).styleEdits;
    assert.ok(sent.every((edit) => edit.groupId === 'stroke'));
    assert.equal(sent.some((edit) => edit.property === 'border-left-width'), false, 'the box edit is absorbed');
  }, { expose: ['commitStrokeEdit', 'renderPanel'] });
});

// Andrew's live check found W and H overlapping at 140% panel text. Every
// number must stay inside the margin ring and clear of its neighbours from
// 80% to 140%, in the narrow 1024 panel and the wider 1440 one.
test('at 80–140% panel text the box numbers never overlap or leave the box', async (t) => {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    for (const scale of ['0.8', '1', '1.2', '1.4']) {
      await run(t, async (page) => {
        await selectElement(page, '#card-b');
        await page.evaluate((fs) => {
          const host = document.querySelector('[data-raven-grab-overlay]');
          for (const node of [host, ...host.shadowRoot.querySelectorAll('*')]) {
            if (node.style && node.style.getPropertyValue('--raven-grab-font-scale')) node.style.setProperty('--raven-grab-font-scale', fs);
          }
          host.style.setProperty('--raven-grab-font-scale', fs);
        }, scale);
        const bad = await shadowEval(page, (root) => {
          const visible = (s) => Array.from(root.querySelectorAll(s)).filter((n) => n.getClientRects().length);
          const cells = visible('.raven-grab-box-num').map((n) => ({ prop: n.getAttribute('data-box-prop'), r: n.getBoundingClientRect() }));
          const ring = visible('.raven-grab-box-ring[data-ring="margin"]')[0].getBoundingClientRect();
          const out = [];
          for (const c of cells) if (c.r.left < ring.left - 0.5 || c.r.right > ring.right + 0.5) out.push(`${c.prop} outside`);
          for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
            const p = cells[i].r, q = cells[j].r;
            if (p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5) out.push(`${cells[i].prop}/${cells[j].prop} overlap`);
          }
          return out;
        });
        assert.deepEqual(bad, [], `${viewport.width}px at ${scale}`);
      }, { viewport });
    }
  }
});
