// Shared helpers for the live style editing tests (docs/spec-grab-live-style-editing.md).
// Not a test file itself: the suite glob is test/**/*.test.mjs.
//
// Real Chromium through grab-panels-harness.mjs, on test/fixtures/grab-live-edit.html.
// Conversion depends on computed style, which the fake DOM in grab-bridge.test.mjs
// cannot supply.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPanelsOverlay, skipIfNoBrowser, shadowEval } from './grab-panels-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LIVE_FIXTURE_PATH = path.join(here, 'fixtures', 'grab-live-edit.html');

export async function run(t, fn, options = {}) {
  try {
    const html = options.html || await readFile(LIVE_FIXTURE_PATH, 'utf8');
    await withPanelsOverlay(fn, { ...options, html });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
}

function rowSelector(property, state) {
  return state
    ? `li[data-style-property="${property}"][data-style-state="${state}"]`
    : `li[data-style-property="${property}"]:not([data-style-state])`;
}

// Click a Styles row's value so its editor opens. `state` is "hover" or "focus" for a state row.
export async function openRow(page, property, state) {
  const selector = rowSelector(property, state);
  const point = await shadowEval(page, (root, sel) => {
    const cell = root.querySelector(sel + ' code[data-style-value]');
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  if (!point) throw new Error(`no style row rendered for ${property}${state ? ' (' + state + ')' : ''}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((sel) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector(sel + ' .raven-grab-style-editor'));
  }, selector, { timeout: 5000 });
}

// What the open editor shows. `mounted` is false once the row is back to its value cell.
export function editorState(page, property, state) {
  return shadowEval(page, (root, sel) => {
    const row = root.querySelector(sel);
    const editor = row && row.querySelector('.raven-grab-style-editor');
    if (!editor) {
      const cell = row && row.querySelector('code[data-style-value]');
      return { mounted: false, text: cell ? cell.textContent : null, edited: row ? row.getAttribute('data-edited') : null };
    }
    const input = editor.querySelector('input.raven-grab-style-input');
    const unit = editor.querySelector('select.raven-grab-style-unit');
    const active = root.activeElement;
    return {
      mounted: true,
      number: input ? input.value : null,
      unit: unit ? unit.value : null,
      units: unit ? Array.from(unit.options).map((option) => option.value) : [],
      focusOnNumber: Boolean(input && active === input),
      selection: input && typeof input.selectionStart === 'number' ? [input.selectionStart, input.selectionEnd] : null
    };
  }, rowSelector(property, state));
}

// Pick a unit the way the select reports it: set the value, fire `change`.
// A synthetic event cannot open the native option list; that is a manual check.
export function chooseUnit(page, property, unit, state) {
  return shadowEval(page, (root, arg) => {
    const select = root.querySelector(arg.sel + ' .raven-grab-style-editor select.raven-grab-style-unit');
    if (!select) throw new Error('no unit select');
    if (!Array.from(select.options).some((option) => option.value === arg.unit)) throw new Error('unit not offered: ' + arg.unit);
    select.focus();
    select.value = arg.unit;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { sel: rowSelector(property, state), unit });
}

// Replace the number field's text as typing does: one `input` event, no Enter, no blur.
export function typeNumber(page, property, text, state) {
  return shadowEval(page, (root, arg) => {
    const input = root.querySelector(arg.sel + ' .raven-grab-style-editor input.raven-grab-style-input');
    if (!input) throw new Error('no number field');
    input.focus();
    input.value = arg.text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { sel: rowSelector(property, state), text });
}

export function computed(page, selector, property) {
  return page.evaluate((arg) => getComputedStyle(document.querySelector(arg.selector)).getPropertyValue(arg.property), { selector, property });
}

export function px(value) {
  const match = /^(-?[\d.]+)px$/.exec(String(value).trim());
  if (!match) throw new Error('not a px value: ' + value);
  return Number(match[1]);
}

export function inlineStyle(page, selector) {
  return page.evaluate((sel) => document.querySelector(sel).style.cssText, selector);
}

export function statusLine(page) {
  return shadowEval(page, (root) => Array.from(root.querySelectorAll('[data-status], [data-status-b]'))
    .map((node) => ({ text: node.textContent, kind: node.getAttribute('data-kind') }))
    .filter((entry) => entry.text));
}

// The style edits the agent would receive, as [property, oldValue, newValue].
export function sentStyleEdits(body) {
  return (body.styleEdits || []).map((edit) => [edit.property, edit.oldValue, edit.newValue]);
}
