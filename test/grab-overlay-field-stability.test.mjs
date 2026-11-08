// Opening or typing in a field never moves it or any other field
// (Andrew, 2026-11-08: "It should stay right where it's at. It should never move fields.").
// Real Chromium, local bridge, fixture test/fixtures/grab-panels.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withPanelsOverlay, skipIfNoBrowser, selectElement, editStyle, shadowEval, FIXTURE_PATH } from './grab-panels-harness.mjs';

async function run(t, fn, options) {
  try {
    await withPanelsOverlay(fn, options);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
}

// Every visible Styles row, the value field inside it, and every box number, as
// rounded rects. Keys carry the state group, so a property listed under Hover too
// does not overwrite the base row. A field is the row's value cell (the ghost
// while a popover is open) or its one-line editor; only its left edge and
// vertical centre are compared, because a one-line editor is larger than the
// text it replaces.
function layout(page) {
  return shadowEval(page, (root) => {
    const out = {};
    const r = (n) => { const b = n.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(','); };
    const at = (n) => { const b = n.getBoundingClientRect(); return [b.left, b.top + b.height / 2].map((v) => Math.round(v * 2) / 2).join(','); };
    for (const li of root.querySelectorAll('li[data-style-property]')) {
      if (!li.getClientRects().length) continue;
      const key = (li.getAttribute('data-style-state') || 'base') + ':' + li.getAttribute('data-style-property');
      out['row:' + key] = r(li);
      const field = li.querySelector(':scope > code, :scope > .raven-grab-style-editor:not([data-popover])');
      if (field) out['field:' + key] = at(field);
    }
    for (const cell of root.querySelectorAll('[data-box-prop]')) if (cell.getClientRects().length) out['box:' + cell.getAttribute('data-box-prop')] = r(cell);
    return out;
  });
}

// A key that disappears counts as moved, so a row that vanishes cannot pass.
function moved(before, after) {
  return Object.keys(before).filter((key) => after[key] !== before[key]).map((key) => `${key} ${before[key]} -> ${after[key]}`);
}

function rowValuePoint(page, property) {
  return shadowEval(page, (root, prop) => {
    const li = Array.from(root.querySelectorAll(`li[data-style-property="${prop}"]`)).find((n) => n.getClientRects().length);
    li.scrollIntoView({ block: 'center' });
    const r = li.querySelector('code').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, property);
}

function boxPoint(page, property) {
  return shadowEval(page, (root, prop) => {
    const cell = Array.from(root.querySelectorAll(`[data-box-prop="${prop}"]`)).find((n) => n.getClientRects().length);
    cell.scrollIntoView({ block: 'center' });
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, property);
}

test('box model: opening a number and typing moves no number', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    const point = await boxPoint(page, 'padding-right');
    const before = await layout(page);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type('123456');
    assert.equal(await shadowEval(page, (root) => root.querySelector('[data-box-input]').value), '123456', 'the field opens with its value selected');
    assert.deepEqual(moved(before, await layout(page)), []);
  });
});

test('Styles: a one-line field (padding, font-size, display) opens inside its row; nothing moves', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    for (const property of ['padding', 'font-size', 'display']) {
      const point = await rowValuePoint(page, property);
      const before = await layout(page);
      await page.mouse.click(point.x, point.y);
      await page.keyboard.type('2');
      const open = await shadowEval(page, (root, prop) => Boolean(root.querySelector(`li[data-style-property="${prop}"] .raven-grab-style-editor`)), property);
      assert.equal(open, true, `${property} editor opened`);
      assert.deepEqual(moved(before, await layout(page)), [], property);
      await page.keyboard.press('Escape');
    }
  });
});

test('Styles: a larger editor (size, color, stroke, easing) floats over the list; nothing moves and it closes cleanly', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    for (const property of ['width', 'color', '__raven-stroke__', 'transition-timing-function']) {
      const point = await rowValuePoint(page, property);
      const before = await layout(page);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(80);
      const state = await shadowEval(page, (root, prop) => {
        const li = Array.from(root.querySelectorAll(`li[data-style-property="${prop}"]`)).find((n) => n.getClientRects().length);
        const editor = li.querySelector('.raven-grab-style-editor');
        let node = li.parentNode;
        let top = 0; let bottom = innerHeight;
        while (node && node.nodeType === 1) {
          const cs = getComputedStyle(node);
          if (cs.overflowY !== 'visible') { const b = node.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
          node = node.parentNode;
        }
        const e = editor.getBoundingClientRect();
        return { popover: editor.getAttribute('data-popover'), inside: e.top >= top - 0.5 && e.bottom <= bottom + 0.5, value: li.querySelector('code').textContent };
      }, property);
      assert.equal(state.popover, 'true', `${property} is a popover`);
      assert.equal(state.inside, true, `${property} stays inside the visible list`);
      assert.ok(state.value.length > 0, `${property} row still shows its value`);
      assert.deepEqual(moved(before, await layout(page)), [], property);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(60);
      const after = await shadowEval(page, (root, prop) => {
        const li = Array.from(root.querySelectorAll(`li[data-style-property="${prop}"]`)).find((n) => n.getClientRects().length);
        return { codes: li.querySelectorAll(':scope > code').length, editor: !!li.querySelector('.raven-grab-style-editor'), ghost: !!li.querySelector('[data-style-ghost]') };
      }, property);
      assert.deepEqual(after, { codes: 1, editor: false, ghost: false }, `${property} closed cleanly`);
    }
  });
});

test('mobile sheet: Styles editors and the box number open without moving anything', async (t) => {
  await run(t, async (page) => {
    await page.addStyleTag({ content: '.site { left: 10px !important; width: 360px !important; }' });
    const at = await page.evaluate(() => { const r = document.querySelector('button.cta').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(at.x - 2, at.y - 2);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(400);
    const tab = async (name) => {
      const p = await shadowEval(page, (root, n) => { const r = root.querySelector(`.raven-grab-mobile-tabs [data-tab="${n}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, name);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(300);
    };
    await tab('styles');
    for (const property of ['padding', 'width', 'transition-timing-function']) {
      const point = await rowValuePoint(page, property);
      const before = await layout(page);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(80);
      assert.deepEqual(moved(before, await layout(page)), [], property);
      await page.keyboard.press('Escape');
    }
    await tab('instructions');
    const point = await boxPoint(page, 'padding-right');
    const before = await layout(page);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.type('20');
    assert.deepEqual(moved(before, await layout(page)), []);
  }, { viewport: { width: 390, height: 844 } });
});

function rowState(page, property) {
  return shadowEval(page, (root, prop) => {
    const li = Array.from(root.querySelectorAll(`li[data-style-property="${prop}"]`)).find((n) => n.getClientRects().length);
    const editor = li.querySelector('.raven-grab-style-editor');
    return { editor: !!editor, popover: editor ? editor.getAttribute('data-popover') : null, linked: editor ? editor.getAttribute('data-token-linked') : null, ghost: !!li.querySelector('[data-style-ghost]'), codes: li.querySelectorAll(':scope > code').length };
  }, property);
}

test('Styles: the four-corner radius editor floats over the list; nothing moves', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    const point = await shadowEval(page, (root) => {
      const btn = Array.from(root.querySelectorAll('li[data-style-property="border-radius"] [data-radius-expand]')).find((n) => n.getClientRects().length);
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const before = await layout(page);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
    const open = await rowState(page, 'border-radius');
    assert.equal(open.popover, 'true', 'the radius editor is a popover');
    assert.deepEqual(moved(before, await layout(page)), []);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
    const closed = await rowState(page, 'border-radius');
    assert.deepEqual([closed.editor, closed.ghost, closed.codes], [false, false, 1]);
  });
});

test('Styles: a token-linked value closes on Escape and on a click elsewhere, and writes nothing', async (t) => {
  const html = (await readFile(FIXTURE_PATH, 'utf8')).replace('</style>', ':root { --color-text-primary: #ffffff; } button.cta { color: var(--color-text-primary); }\n</style>');
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    let point = await rowValuePoint(page, 'color');
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
    const open = await rowState(page, 'color');
    assert.equal(open.linked, 'true', 'the fixture really binds the token');
    assert.equal(open.popover, 'true');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
    let closed = await rowState(page, 'color');
    assert.deepEqual([closed.editor, closed.ghost, closed.codes], [false, false, 1], 'Escape closes it');
    point = await rowValuePoint(page, 'color');
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
    point = await rowValuePoint(page, 'display');
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
    closed = await rowState(page, 'color');
    assert.deepEqual([closed.editor, closed.ghost, closed.codes], [false, false, 1], 'opening another field closes it');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelector('button.cta').getAttribute('style') || ''), '', 'no style was written');
  }, { html });
});

test('the changes tray keeps its place: a first change, and a change while others apply, move nothing', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    const tops = () => shadowEval(page, (root) => {
      const q = (sel) => Array.from(root.querySelectorAll(sel)).find((n) => n.getClientRects().length);
      const top = (sel) => Math.round(q(sel).getBoundingClientRect().top);
      return { box: top('[data-box-model]'), instructions: top('[data-instruction]'), tray: top('.raven-grab-changes') };
    });
    const empty = await tops();
    await editStyle(page, 'padding', '18px');
    assert.deepEqual(await tops(), empty, 'first change');
    const send = await shadowEval(page, (root) => { const r = root.querySelector('[data-send-batch]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(send.x, send.y);
    await page.waitForTimeout(300);
    assert.deepEqual(await tops(), empty, 'while applying');
    await editStyle(page, 'font-size', '18px');
    assert.deepEqual(await tops(), empty, 'a change while others apply');
    const headers = await shadowEval(page, (root) => Array.from(root.querySelectorAll('[data-change-tray-toggle]')).filter((n) => n.getClientRects().length).map((n) => n.textContent.replace(/\s+/g, ' ').trim()));
    assert.equal(headers.length, 1, 'one section header');
    assert.match(headers[0], /1 active · 1 next/);
  });
});
