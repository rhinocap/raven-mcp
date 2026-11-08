// Change tray: collapsed by default, change first, then the element
// (spec "Grab panels — search, box model, change rows" v0.2 §3).
// Real Chromium, local bridge, fixture test/fixtures/grab-panels.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  withPanelsOverlay, skipIfNoBrowser, selectElement, editStyle, typeInstruction,
  setScope, sendBatch, readTray, normalizePayload, shadowEval
} from './grab-panels-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(await readFile(path.join(here, 'fixtures', 'baselines', 'grab-change-rows-payload.json'), 'utf8'));

async function run(t, fn, options) {
  try {
    await withPanelsOverlay(fn, options);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
}

function toggleSection(page, role) {
  return shadowEval(page, (root, value) => {
    root.querySelector(`[data-change-tray-toggle="${value}"]`).click();
    return true;
  }, role);
}

test('style + instruction: payload matches the pre-change baseline, rows read change first', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    await typeInstruction(page, 'make this feel calmer');
    const before = await readTray(page);
    assert.equal(before.length, 1);
    assert.equal(before[0].heading, 'Pending changes');
    assert.equal(before[0].summary, '2 pending');
    assert.equal(before[0].expanded, 'false', 'the section starts collapsed');
    assert.deepEqual(before[0].rows.map((row) => [row.line1, row.line2]), [
      ['Style – padding', '14px → 18px – button.cta'],
      ['Instruction', 'make this feel calmer – button.cta']
    ]);
    assert.equal(before[0].rows[0].title, 'button.cta', 'the full selector is the title; "instance" is not shown');
    await sendBatch(page);
    const after = await readTray(page);
    const submitted = after.flatMap((section) => section.rows);
    assert.deepEqual(submitted.map((row) => [row.line1, row.line2]), before[0].rows.map((row) => [row.line1, row.line2]),
      'a row reads the same before and after Send');
    assert.deepEqual(grabBodies.map((body) => normalizePayload(body)), baseline.styleAndInstruction,
      'the dispatched payload is unchanged');
  });
});

test('all-siblings scope: label ends in (all siblings), payload matches the baseline', async (t) => {
  await run(t, async (page, { grabBodies }) => {
    await selectElement(page, '#card-a');
    await setScope(page, 'component');
    await editStyle(page, 'padding', '20px');
    const tray = await readTray(page);
    assert.deepEqual([tray[0].rows[0].line1, tray[0].rows[0].line2], ['Style – padding', '12px → 20px – div#card-a (all siblings)']);
    assert.match(tray[0].rows[0].title, /all siblings/);
    await sendBatch(page);
    assert.deepEqual(grabBodies.map((body) => normalizePayload(body)), baseline.siblingScope);
  });
});

test('open state survives rebuilds and selection changes, and resets when Grab closes', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    assert.equal((await readTray(page))[0].expanded, 'false');
    await toggleSection(page, 'pending');
    assert.equal((await readTray(page))[0].expanded, 'true');
    await editStyle(page, 'margin', '10px 0 0');
    assert.equal((await readTray(page))[0].expanded, 'true', 'still open after a rebuild');
    await selectElement(page, '#hero');
    await editStyle(page, 'padding', '40px');
    const tray = await readTray(page);
    assert.equal(tray[0].expanded, 'true', 'still open after selecting another element');
    assert.equal(tray[0].summary, '3 pending');
    // Close Grab (Alt+G), reopen, make a change: the section starts collapsed again.
    await page.keyboard.press('Alt+KeyG');
    await page.keyboard.press('Alt+KeyG');
    // A bare re-arm opens with both panels shut; ⌘. opens them, as a user would.
    await page.keyboard.press('ControlOrMeta+Period');
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '22px');
    assert.equal((await readTray(page))[0].expanded, 'false', 'dismiss() resets every role');
  });
});

test('a collapsed header still shows the error count', async (t) => {
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    await page.route((url) => url.pathname === '/grab', (route) => route.fulfill({ status: 500, body: '{"error":"nope"}' }));
    await shadowEval(page, (root) => { root.querySelector('[data-send-batch]').click(); return true; });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('[data-change-tray-errors]'));
    }, null, { timeout: 5000 });
    const tray = await readTray(page);
    const section = tray.find((entry) => entry.errorSummary);
    assert.ok(section, 'a section carries an error count');
    assert.equal(section.expanded, 'false', 'the section is collapsed');
    assert.equal(section.errorSummary, '1 needs review');
    const color = await shadowEval(page, (root) => getComputedStyle(root.querySelector('[data-change-tray-errors]')).color);
    assert.equal(color, 'rgb(255, 64, 96)', 'the count uses the error colour');
  });
});

test('every row kind in the table', async (t) => {
  await run(t, async (page) => {
    const rows = await page.evaluate(() => {
      const api = window.__ravenGrabPanels;
      const button = document.querySelector('button.cta');
      const card = document.querySelector('#card-a');
      const draft = (target, selector, fields) => Object.assign({
        clientKey: 'k-' + selector, selector, target, selection: { selector, styles: {} },
        styleEdits: {}, stateStyleEdits: {}, tokenIntents: {}, editScope: 'instance', instruction: '', attachments: []
      }, fields);
      const out = [];
      const push = (list) => list.forEach((row) => out.push([row.line1, row.change ? row.change + ' – ' + row.element : row.element]));
      push(api.rowsForStyleDraft(draft(button, 'button.cta', { styleEdits: { 'padding-right': { property: 'padding-right', oldValue: '14px', newValue: '18px' } } }), false));
      push(api.rowsForStyleDraft(draft(button, 'button.cta', { stateStyleEdits: { 'hover:background-color': { state: 'hover', property: 'background-color', oldValue: '#fff', newValue: '#eee' } } }), false));
      push(api.rowsForStyleDraft(draft(document.querySelector('p.lede'), 'p.lede', { tokenIntents: { 0: { property: 'color', oldTokenPath: 'text/muted', newTokenPath: 'text/primary' } } }), false));
      push(api.rowsForStyleDraft(draft(card, 'div.card', { selection: { selector: 'div.card', styles: { 'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px', 'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid', 'border-left-style': 'solid', 'border-top-color': 'rgb(221, 221, 221)', 'border-right-color': 'rgb(221, 221, 221)', 'border-bottom-color': 'rgb(221, 221, 221)', 'border-left-color': 'rgb(221, 221, 221)', 'outline-width': '0px', 'outline-style': 'none' } }, styleEdits: Object.fromEntries(['top', 'right', 'bottom', 'left'].flatMap((side) => [
        [`border-${side}-width`, { property: `border-${side}-width`, oldValue: '1px', newValue: '2px', groupId: 'stroke' }],
        [`border-${side}-color`, { property: `border-${side}-color`, oldValue: 'rgb(221, 221, 221)', newValue: 'rgb(0, 0, 0)', groupId: 'stroke' }]
      ])) }), false));
      push(api.rowsForStyleDraft(draft(document.querySelector('a.hero-cta'), 'a.hero-cta', { textEdit: { oldText: 'Get started', newText: 'Start free' } }), false));
      push(api.rowsForStyleDraft(draft(document.querySelector('#hero'), 'section.hero', { instruction: 'make this feel calmer' }), false));
      push(api.rowsForStyleDraft(draft(document.querySelector('#hero'), 'section.hero', { attachments: [{ id: 'a1', name: 'hero.png', state: 'ready' }] }), false));
      return { out, move: api.changeElementLabel(card, null, 'main > div.cards > div.card') };
    });
    assert.deepEqual(rows.out[0], ['Style – padding-right', '14px → 18px – button.cta']);
    assert.deepEqual(rows.out[1], ['Hover – background-color', '#fff → #eee – button.cta']);
    assert.deepEqual(rows.out[2], ['Token – color', 'text/muted → text/primary – p.lede']);
    assert.equal(rows.out[3][0], 'Stroke');
    assert.match(rows.out[3][1], /^1px .* → 2px .* – div#card-a$/);
    assert.deepEqual(rows.out[4], ['Copy', '“Get started” → “Start free” – a.hero-cta']);
    assert.deepEqual(rows.out[5], ['Instruction', 'make this feel calmer – section#hero']);
    assert.deepEqual(rows.out[6], ['Attachment', 'hero.png – section#hero']);
    assert.equal(rows.move, 'div#card-a');
  }, { expose: ['rowsForStyleDraft', 'changeElementLabel'] });
});

test('page-derived text in rows and titles is escaped', async (t) => {
  const hostile = '<img src=x onerror="window.__pwned=1"> & "quoted" \'single\'';
  await run(t, async (page) => {
    await selectElement(page, 'button.cta');
    await editStyle(page, 'padding', '18px');
    await typeInstruction(page, hostile);
    await toggleSection(page, 'pending');
    const tray = await readTray(page);
    const instruction = tray[0].rows.find((row) => row.line1 === 'Instruction');
    assert.equal(instruction.line2, hostile.replace(/\s+/g, ' ') + ' – button.cta');
    const injected = await shadowEval(page, (root) => root.querySelectorAll('.raven-grab-change-list img').length);
    assert.equal(injected, 0, 'no element was created from the text');
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    const markup = await page.evaluate((text) => window.__ravenGrabPanels.changeTrayRowsMarkup([{ id: 'x"y', kind: 'style', line1: text, change: text, element: text, title: text, status: text, removable: true }]), hostile);
    assert.doesNotMatch(markup, /<img/);
    assert.doesNotMatch(markup, /title="[^"]*"quoted/);
  }, { expose: ['changeTrayRowsMarkup'] });
});
