// Styles and Layers search (spec "Grab panels — search, box model, change rows"
// v0.2 §1). Real Chromium, local bridge, fixture test/fixtures/grab-panels.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanelsOverlay, skipIfNoBrowser, selectElement, shadowEval } from './grab-panels-harness.mjs';

async function run(t, fn, options) {
  try {
    await withPanelsOverlay(fn, options);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
}

// Focus the field by clicking it, the way a person does, so typing goes through
// real key events (and the keystroke-isolation guard).
async function focusSearch(page, role) {
  const point = await shadowEval(page, (root, value) => {
    const field = root.querySelector(`[data-panel-search="${value}"]`);
    if (!field) return null;
    field.scrollIntoView({ block: 'center' });
    const rect = field.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, role);
  if (!point) throw new Error(`no ${role} search field`);
  await page.mouse.click(point.x, point.y);
}

function styleRows(page) {
  return shadowEval(page, (root) => ({
    categories: Array.from(root.querySelectorAll('#raven-grab-styles .raven-grab-style-category-label')).map((el) => el.textContent),
    rows: Array.from(root.querySelectorAll('#raven-grab-styles li[data-style-property]:not([data-style-state])')).map((el) => el.getAttribute('data-style-property')),
    empty: root.querySelector('[data-panel-search-empty="styles"]')?.textContent || '',
    open: root.querySelector('#raven-grab-styles')?.getAttribute('data-open')
  }));
}

function searchState(page, role) {
  return shadowEval(page, (root, value) => {
    const field = root.querySelector(`[data-panel-search="${value}"]`);
    return { value: field ? field.value : null, focused: root.activeElement === field, caret: field ? field.selectionStart : null };
  }, role);
}

function layerRows(page) {
  return shadowEval(page, (root) => Array.from(root.querySelectorAll('.raven-grab-layer-list:not(.raven-grab-layer-drag) .raven-grab-layer-row[data-layer-id]')).map((row) => ({
    label: row.querySelector('.raven-grab-layer-label').textContent,
    match: row.getAttribute('data-search-match') === 'true',
    context: row.getAttribute('data-search-context') === 'true',
    focus: row.getAttribute('data-search-focus') === 'true',
    primary: row.getAttribute('data-primary') === 'true',
    muted: getComputedStyle(row.querySelector('.raven-grab-layer-label')).color
  })));
}

test('Styles search: property names, aliases, categories and the empty message', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await focusSearch(page, 'styles');
    await page.keyboard.type('pad');
    let view = await styleRows(page);
    assert.deepEqual(view.rows, ['padding']);
    assert.deepEqual(view.categories, ['Spacing'], 'a category label shows only when one of its rows matches');

    const cases = [
      ['radius', ['border-radius']],
      ['bg', ['background-color']],
      ['space', ['margin', 'padding', 'gap', 'white-space']],
      ['border', ['__raven-stroke__', 'border-radius']],
      ['colour', ['color', 'background-color']]
    ];
    for (const [query, expected] of cases) {
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type(query);
      view = await styleRows(page);
      assert.deepEqual([...view.rows].sort(), [...expected].sort(), `"${query}"`);
    }
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('font');
    view = await styleRows(page);
    assert.deepEqual(view.categories, ['Typography'], '"font" finds the typography rows');
    assert.ok(view.rows.includes('font-size') && view.rows.includes('line-height'));

    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('zzz');
    view = await styleRows(page);
    assert.deepEqual(view.rows, []);
    assert.equal(view.empty, 'No styles match “zzz”');
  });
});

test('Styles query keeps focus and caret through rebuilds, opens the section, survives a new selection', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    // Collapse Styles first: typing a query must open it.
    await shadowEval(page, (root) => { root.querySelector('[data-section-toggle="styles"]').click(); return true; });
    assert.equal((await styleRows(page)).open, 'false');
    await focusSearch(page, 'styles');
    // Each keystroke rebuilds the panel; typing char by char only lands if focus and
    // caret come back every time.
    await page.keyboard.type('paddin');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('x');
    let state = await searchState(page, 'styles');
    assert.equal(state.value, 'paddxin');
    assert.equal(state.focused, true);
    assert.equal(state.caret, 5, 'the caret stays where it was typed');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('g');
    assert.equal((await searchState(page, 'styles')).value, 'padding');
    assert.equal((await styleRows(page)).open, 'true', 'typing opened the Styles section');

    // A background rebuild (no keystroke) keeps it too.
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await selectElement(page, '#stack');
    state = await searchState(page, 'styles');
    assert.equal(state.value, 'padding', 'the query stays when another element is selected');
    assert.deepEqual((await styleRows(page)).rows, ['padding']);
  });
});

test('Escape clears a non-empty query and is consumed; an empty query lets Escape through', async (t) => {
  await run(t, async (page) => {
    await page.evaluate(() => {
      window.__pageKeys = [];
      document.addEventListener('keydown', (event) => window.__pageKeys.push(event.key));
    });
    await selectElement(page, 'button.cta');
    await focusSearch(page, 'styles');
    await page.keyboard.type('pad');
    await page.keyboard.press('Escape');
    const state = await searchState(page, 'styles');
    assert.equal(state.value, '');
    assert.equal(state.focused, true, 'focus stays in the field after clearing');
    assert.ok((await styleRows(page)).rows.length > 5, 'every row is back');
    const keys = await page.evaluate(() => window.__pageKeys);
    assert.deepEqual(keys, [], 'the page saw neither the typed letters nor the clearing Escape');
    await page.keyboard.press('Escape');
    const fromSearch = await page.evaluate(() => window.__pageKeys.splice(0));
    // Compare with an existing Raven text field: an empty query changes nothing.
    await shadowEval(page, (root) => { root.querySelector('[data-instruction]').focus(); return true; });
    await page.keyboard.press('Escape');
    const fromInstruction = await page.evaluate(() => window.__pageKeys.splice(0));
    assert.deepEqual(fromSearch, fromInstruction, 'with an empty query Escape is handled as in any Raven field');
    assert.equal((await searchState(page, 'styles')).value, '');
  });
});

test('typing in either field does not reach page hotkeys', async (t) => {
  await run(t, async (page) => {
    await page.evaluate(() => {
      window.__hotkeys = [];
      window.addEventListener('keydown', (event) => window.__hotkeys.push(event.key));
      document.addEventListener('keypress', (event) => window.__hotkeys.push('press:' + event.key));
    });
    await selectElement(page, 'button.cta');
    await focusSearch(page, 'styles');
    await page.keyboard.type('s/gk');
    await focusSearch(page, 'layers');
    await page.keyboard.type('t?j');
    assert.deepEqual(await page.evaluate(() => window.__hotkeys), []);
    assert.equal((await searchState(page, 'layers')).value, 't?j');
  });
});

test('Layers search: index terms, ancestors in context, hidden non-matches, drag off', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await focusSearch(page, 'layers');
    await page.keyboard.type('card-b');
    let rows = await layerRows(page);
    const matches = rows.filter((row) => row.match).map((row) => row.label);
    assert.deepEqual(matches, ['div · Card B'], 'the id is found through the index, not the label');
    const context = rows.filter((row) => row.context).map((row) => row.label);
    assert.ok(context.includes('main') && context.includes('div'), `ancestors shown: ${context.join(', ')}`);
    assert.ok(!rows.some((row) => /Card A|Card C|Start free/.test(row.label)), 'non-matching rows are hidden');
    const ctxRow = rows.find((row) => row.context);
    const muted = await shadowEval(page, (root) => getComputedStyle(root.querySelector('.raven-grab-panel')).getPropertyValue('--raven-grab-muted').trim());
    assert.equal(ctxRow.muted, 'rgb(148, 152, 160)', `ancestors use the muted colour (${muted})`);

    const note = await shadowEval(page, (root) => Array.from(root.querySelectorAll('.raven-grab-note')).map((el) => el.textContent).find((text) => /drag/i.test(text)));
    assert.equal(note, 'Clear the search to drag layers.');

    // Class names are indexed too.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('lede');
    rows = await layerRows(page);
    assert.deepEqual(rows.filter((row) => row.match).map((row) => row.label), ['p · Motion and spacing, tuned by hand.']);

    // Drag is off: press and move a row; no drag clone appears.
    const point = await shadowEval(page, (root) => {
      const row = Array.from(root.querySelectorAll('.raven-grab-layer-row[data-search-match]'))[0];
      const rect = row.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x, point.y + 30, { steps: 5 });
    const dragging = await shadowEval(page, (root) => Boolean(root.querySelector('.raven-grab-layer-drag')));
    await page.mouse.up();
    assert.equal(dragging, false, 'dragging is turned off while a query is active');
  });
});

test('Layers search: arrows move between matches inside the field, Enter selects', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await focusSearch(page, 'layers');
    await page.keyboard.type('card');
    let rows = await layerRows(page);
    const labels = rows.filter((row) => row.match).map((row) => row.label);
    assert.deepEqual(labels, ['div', 'div · Card A', 'div · Card B', 'div · Card C'], 'div.cards and the three cards, in tree order');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    rows = await layerRows(page);
    assert.equal(rows.find((row) => row.focus).label, 'div · Card A');
    const field = await searchState(page, 'layers');
    assert.equal(field.focused, true, 'the field keeps focus; it consumed the arrows');
    assert.equal(field.caret, 4, 'ArrowUp did not move the caret to the start');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return /card-a/.test(root.querySelector('[data-selected-selector]')?.getAttribute('data-selected-selector') || '');
    }, null, { timeout: 5000 });
    rows = await layerRows(page);
    assert.equal(rows.find((row) => row.primary).label, 'div · Card A', 'Enter selected the focused match');
  });
});

test('queries clear when Grab closes', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await focusSearch(page, 'styles');
    await page.keyboard.type('pad');
    await focusSearch(page, 'layers');
    await page.keyboard.type('card');
    await page.keyboard.press('Alt+KeyG');
    await page.keyboard.press('Alt+KeyG');
    await page.keyboard.press('ControlOrMeta+Period');
    await selectElement(page, 'button.cta');
    assert.equal((await searchState(page, 'styles')).value, '');
    assert.equal((await searchState(page, 'layers')).value, '');
  });
});

test('page text in the query and the empty message is escaped', async (t) => {
  await run(t, async (page) => {
    const hostile = '<img src=x onerror="window.__pwned=1">';
    await selectElement(page, 'button.cta');
    await shadowEval(page, (root, value) => {
      for (const role of ['styles', 'layers']) {
        const field = root.querySelector(`[data-panel-search="${role}"]`);
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    }, hostile);
    const result = await shadowEval(page, (root) => ({
      imgs: root.querySelectorAll('.raven-grab-panel img').length,
      styles: root.querySelector('[data-panel-search-empty="styles"]')?.textContent,
      layers: root.querySelector('[data-panel-search-empty="layers"]')?.textContent,
      value: root.querySelector('[data-panel-search="styles"]').value
    }));
    assert.equal(result.imgs, 0);
    assert.equal(result.styles, `No styles match “${hostile}”`);
    assert.equal(result.layers, `No layers match “${hostile}”`);
    assert.equal(result.value, hostile);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
  });
});

// Select by clicking the page and waiting for the element chip, for layouts
// where the Styles rows are not on screen (mobile Layers tab, simple mode).
async function clickSelect(page, selector) {
  const at = await page.evaluate((sel) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await page.mouse.move(at.x - 2, at.y - 2);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  // The chip (simple mode) or the selected layer row (mobile Layers tab).
  await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-selected-selector], [data-element-selector], .raven-grab-layer-row[data-primary="true"]')), null, { timeout: 5000 });
}

test('mobile sheet: search in the Styles tab and the Layers tab', async (t) => {
  await run(t, async (page) => {
    // The fixture sits at left 420px; bring it on screen at 390px wide.
    await page.addStyleTag({ content: '.site { left: 10px !important; width: 360px !important; }' });
    await clickSelect(page, 'button.cta');
    const tabs = await shadowEval(page, (root) => {
      const out = {};
      for (const tab of ['styles', 'layers', 'instructions']) {
        root.querySelector(`.raven-grab-mobile-tabs [data-tab="${tab}"]`).click();
        out[tab] = Array.from(root.querySelectorAll('[data-panel-search]'))
          .filter((field) => field.getClientRects().length > 0)
          .map((field) => field.getAttribute('data-panel-search'));
      }
      return out;
    });
    assert.deepEqual(tabs, { styles: ['styles'], layers: ['layers'], instructions: [] });
  }, { viewport: { width: 390, height: 844 } });
});

test('simple mode shows no search fields', async (t) => {
  await run(t, async (page) => {
    await clickSelect(page, 'button.cta');
    const count = await shadowEval(page, (root) => Array.from(root.querySelectorAll('[data-panel-search]')).filter((field) => field.getClientRects().length > 0).length);
    assert.equal(count, 0);
  }, { beforeLoad: (page) => page.addInitScript(() => localStorage.setItem('raven-grab-mode', 'simple')) });
});
