// A5 verification — state machine assertions against the built surface.
// Run: node .claude/pregate-2026-08-02/round3/builds/build-05/verify.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'index.html');
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); };

const browser = await chromium.launch();

async function fresh() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  return { page, errors };
}

// --- 1. absent initially -----------------------------------------------------
{
  const { page, errors } = await fresh();
  check('initial state is absent (no .snackbar in DOM)', await page.locator('.snackbar').count() === 0);
  check('readout says absent', (await page.locator('#readout').textContent()) === 'absent');
  check('no console/page errors on load', errors.length === 0, errors.join(' | '));
  await page.close();
}

// --- 2. absent -> entering -> visible ---------------------------------------
{
  const { page } = await fresh();
  await page.click('#save');
  await page.waitForSelector('.snackbar', { state: 'attached' });
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'visible', null, { timeout: 3000 });
  const bar = page.locator('.snackbar');
  check('snackbar is visible after save', await bar.isVisible());
  check('data-state=visible', await bar.getAttribute('data-state') === 'visible');
  const op = await bar.evaluate(el => getComputedStyle(el).opacity);
  check('opacity settles at 1', op === '1', `opacity=${op}`);
  const tf = await bar.evaluate(el => getComputedStyle(el).transform);
  check('translateY settles at 0', tf === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(tf), tf);
  check('message text is "Saved"', (await page.locator('.snackbar__message').textContent()).trim() === 'Saved');
  check('message is a polite live region',
    await page.locator('.snackbar__message[role="status"][aria-live="polite"]').count() === 1);
  check('undo control present', (await page.locator('.snackbar [data-action="undo"]').textContent()).trim() === 'Undo');
  check('dismiss control has accessible name "Dismiss"',
    await page.locator('.snackbar [data-action="dismiss"]').getAttribute('aria-label') === 'Dismiss');
  check('optimistic value already changed', (await page.locator('#field-value').textContent()) === 'A. Cunliffe');
  // tap targets
  for (const sel of ['.snackbar [data-action="undo"]', '.snackbar [data-action="dismiss"]', '#save']) {
    const box = await page.locator(sel).boundingBox();
    check(`tap target >= 44x44 :: ${sel}`, box.width >= 44 && box.height >= 44,
      `${Math.round(box.width)}x${Math.round(box.height)}`);
  }
  await page.close();
}

// --- 3. visible -> leaving -> dismissed on timeout, paused by hover ----------
{
  const { page } = await fresh();
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'visible', null, { timeout: 3000 });
  await page.hover('.snackbar__message');
  await page.waitForTimeout(7000); // longer than the 6000ms dwell
  check('clock held by hover: still visible after 7s of hover',
    (await page.locator('#readout').textContent()) === 'visible');
  await page.mouse.move(10, 10);
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'dismissed', null, { timeout: 9000 });
  check('auto-dismiss resumes on pointer leave -> dismissed', true);
  check('snackbar removed from the document', await page.locator('.snackbar').count() === 0);
  check('outcome reflects dismissed', (await page.locator('#outcome').textContent()).startsWith('dismissed'));
  check('save stands after dismiss', (await page.locator('#field-value').textContent()) === 'A. Cunliffe');
  await page.close();
}

// --- 4. focus also holds the clock ------------------------------------------
{
  const { page } = await fresh();
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'visible', null, { timeout: 3000 });
  await page.locator('.snackbar [data-action="undo"]').focus();
  await page.waitForTimeout(7000);
  check('clock held by keyboard focus: still visible after 7s',
    (await page.locator('#readout').textContent()) === 'visible');
  await page.keyboard.press('Enter');
  check('undo via keyboard -> reverted', (await page.locator('#readout').textContent()) === 'reverted');
  check('value rolled back', (await page.locator('#field-value').textContent()) === 'Andrew Cunliffe');
  check('reverted outcome is distinct from dismissed',
    (await page.locator('#outcome').textContent()).startsWith('reverted'));
  check('snackbar removed on revert', await page.locator('.snackbar').count() === 0);
  await page.close();
}

// --- 5. explicit dismiss -----------------------------------------------------
{
  const { page } = await fresh();
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'visible', null, { timeout: 3000 });
  await page.click('.snackbar [data-action="dismiss"]');
  const st = await page.locator('.snackbar').getAttribute('data-state').catch(() => null);
  check('dismiss enters leaving state', st === 'leaving' || (await page.locator('#readout').textContent()) === 'dismissed', String(st));
  const pe = await page.locator('.snackbar').evaluate(el => getComputedStyle(el).pointerEvents).catch(() => 'none');
  check('leaving surface is inert to input', pe === 'none', pe);
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'dismissed', null, { timeout: 3000 });
  check('leaving -> dismissed on exit-motion-end', await page.locator('.snackbar').count() === 0);
  await page.close();
}

// --- 6. reduced motion -------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' });
  await page.goto(url);
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'visible', null, { timeout: 3000 });
  const tf = await page.locator('.snackbar').evaluate(el => getComputedStyle(el).transform);
  check('reduced motion: entrance is opacity-only (no transform)', tf === 'none', tf);
  await page.click('.snackbar [data-action="dismiss"]');
  check('reduced motion: exit is instant', await page.locator('.snackbar').count() === 0);
  await page.close();
}

// --- 7. no external requests -------------------------------------------------
{
  const page = await browser.newPage();
  const external = [];
  page.on('request', r => { if (!r.url().startsWith('file://')) external.push(r.url()); });
  await page.goto(url);
  await page.click('#save');
  await page.waitForTimeout(500);
  check('zero external network requests', external.length === 0, external.join(' | '));
  await page.close();
}

// --- 8. mobile tap targets ---------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('readout').textContent === 'visible', null, { timeout: 3000 });
  for (const sel of ['.snackbar [data-action="undo"]', '.snackbar [data-action="dismiss"]', '#save']) {
    const box = await page.locator(sel).boundingBox();
    check(`mobile 390px tap target >= 44x44 :: ${sel}`, box.width >= 44 && box.height >= 44,
      `${Math.round(box.width)}x${Math.round(box.height)}`);
  }
  const doc = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('no horizontal overflow at 390px', doc);
  await page.close();
}

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
