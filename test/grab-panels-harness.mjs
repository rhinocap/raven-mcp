// Shared harness for the Grab panel search / box model / change-row tests
// (spec: motion-lab docs "Grab panels — search, box model, change rows").
// Not a test file itself: the suite glob is test/**/*.test.mjs.
//
// Real Chromium, a LOCAL bridge session, the fixture at
// test/fixtures/grab-panels.html with the session's script tag appended, and
// raw mouse events (the overlay host covers the viewport, so page.click()
// fails actionability).
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RAVEN_NO_USAGE_LOG = '1';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PATH = path.join(here, 'fixtures', 'grab-panels.html');

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }

let bridge = null;
export async function getBridge() {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  return bridge;
}

export function skipIfNoBrowser(t, err) {
  if (!chromium || /browserType\.launch|Executable doesn't exist/.test(err && err.message)) {
    t.skip(`browser unavailable (${err && err.message})`);
    return true;
  }
  return false;
}

export async function withPanelsOverlay(fn, options = {}) {
  if (!chromium) throw new Error("browserType.launch: playwright is not installed");
  const b = await getBridge();
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-panels-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');
  const html = options.html || await readFile(FIXTURE_PATH, 'utf8');
  const session = await b.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html.replace('</body>', `${options.beforeScript || ''}${session.script_tag}</body>`));
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: options.viewport || { width: 1440, height: 900 } });
    const grabBodies = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/grab') {
        try { grabBodies.push(request.postDataJSON()); } catch { /* non-JSON */ }
      }
    });
    if (options.beforeLoad) await options.beforeLoad(page, session);
    await page.goto('http://127.0.0.1:' + fixture.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('.raven-grab-panel')),
      null,
      { timeout: 15000 }
    );
    return await fn(page, { session, bridge: b, grabBodies });
  } finally {
    if (browser) await browser.close();
    await b.stopGrabSession();
    await new Promise((resolve) => fixture.close(resolve));
  }
}

export function shadowEval(page, fn, arg) {
  return page.evaluate(({ body, value }) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    // eslint-disable-next-line no-new-func
    return new Function('root', 'arg', `return (${body})(root, arg);`)(root, value);
  }, { body: fn.toString(), value: arg });
}

export async function selectElement(page, selector) {
  const at = await page.evaluate((sel) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    return Boolean(root && root.querySelector('[data-style-property]'));
  }, null, { timeout: 5000 });
}

// Open the generic editor on a Styles row, type a value, press Enter.
export async function editStyle(page, property, value) {
  const point = await shadowEval(page, (root, arg) => {
    const cell = root.querySelector(`li[data-style-property="${arg.property}"]:not([data-style-state]) code[data-style-value]`);
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { property });
  if (!point) throw new Error(`no style row rendered for ${property}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((arg) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const row = root.querySelector(`li[data-style-property="${arg.property}"]:not([data-style-state])`);
    return Boolean(row && row.querySelector('.raven-grab-style-editor input'));
  }, { property }, { timeout: 5000 });
  await shadowEval(page, (root, arg) => {
    const input = root.querySelector(`li[data-style-property="${arg.property}"]:not([data-style-state]) .raven-grab-style-editor input`);
    input.focus();
    input.value = arg.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { property, value });
  await page.keyboard.press('Enter');
}

export async function typeInstruction(page, text) {
  await shadowEval(page, (root, value) => {
    const field = root.querySelector('[data-instruction]');
    field.focus();
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, text);
}

export async function setScope(page, scope) {
  await shadowEval(page, (root, value) => {
    const button = root.querySelector(`[data-edit-scope="${value}"]`);
    if (!button) throw new Error('no scope control');
    button.click();
    return true;
  }, scope);
}

export async function sendBatch(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-send-batch]');
    return Boolean(button && !button.disabled);
  }, null, { timeout: 5000 });
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/grab');
  await shadowEval(page, (root) => { root.querySelector('[data-send-batch]').click(); return true; });
  await response;
}

// Change-tray rows as the user reads them: heading/summary per section, and per
// row its two visible lines, the title, the status and whether it is an error.
export function readTray(page) {
  return shadowEval(page, (root) => {
    return Array.from(root.querySelectorAll('section.raven-grab-changes')).map((section) => {
      const toggle = section.querySelector('[data-change-tray-toggle]');
      return {
        role: toggle && toggle.getAttribute('data-change-tray-toggle'),
        expanded: toggle && toggle.getAttribute('aria-expanded'),
        heading: section.querySelector('.raven-grab-changes-heading strong')?.textContent || '',
        summary: section.querySelector('.raven-grab-changes-heading > span')?.textContent || '',
        errorSummary: section.querySelector('[data-change-tray-errors]')?.textContent || '',
        rows: Array.from(section.querySelectorAll('li.raven-grab-change-row')).map((row) => ({
          line1: row.querySelector('[data-change-line1]')?.textContent ?? row.querySelector('strong')?.textContent ?? '',
          line2: row.querySelector('[data-change-line2]')?.textContent ?? '',
          title: row.querySelector('[data-change-line2]')?.getAttribute('title') ?? row.querySelector('.raven-grab-change-copy > span')?.getAttribute('title') ?? '',
          legacyTarget: row.querySelector('.raven-grab-change-copy > span')?.textContent ?? '',
          status: row.querySelector('.raven-grab-change-status')?.textContent || '',
          error: row.getAttribute('data-error')
        }))
      };
    });
  });
}

// Volatile fields that change on every run (time, ids, layout noise) are
// replaced with a type tag so a baseline compare checks SHAPE and VALUES of
// everything the agent reads, not the clock.
const VOLATILE_KEYS = new Set(['clientId', 'batchId', 'clientKey', 'clientSequence', 'sequence', 'receivedAt', 'capturedAt', 'timestamp', 'sentAt', 'createdAt', 'id', 'sessionKey', 'key', 'url', 'pageUrl', 'dispatchId']);
export function normalizePayload(value, keyName) {
  if (Array.isArray(value)) return value.map((entry) => normalizePayload(entry));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalizePayload(value[key], key);
    return out;
  }
  if (keyName && VOLATILE_KEYS.has(keyName)) return `<${typeof value}>`;
  if (typeof value === 'string') return value.replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:<port>');
  return value;
}
