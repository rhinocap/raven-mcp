// A5 state-machine assertions + A3 tap-target measurement for build-03.
// Lives inside the raven-mcp repo so ESM resolves playwright from node_modules.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = pathToFileURL(path.join(import.meta.dirname, 'index.html')).href;
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); };

const browser = await chromium.launch();

// --- run 1: normal motion, timeout path + hover hold --------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(file);

  ok('initial state is absent (no .snackbar in DOM)',
    (await page.locator('.snackbar').count()) === 0 &&
    (await page.locator('#record-state').textContent()) === 'absent');

  const startValue = await page.locator('#record-value').textContent();

  await page.locator('#save-button').click();
  await page.waitForSelector('.snackbar', { state: 'attached' });
  ok('save inserts the snackbar and flips the value optimistically',
    (await page.locator('#record-value').textContent()) !== startValue);
  ok('message copy is "Saved"', (await page.locator('.snackbar__message').textContent()) === 'Saved');
  ok('undo label is "Undo"', (await page.locator('.snackbar__undo').textContent()) === 'Undo');
  ok('dismiss carries accessible label "Dismiss"',
    (await page.locator('.snackbar__dismiss').getAttribute('aria-label')) === 'Dismiss');
  ok('mount point is a polite live region',
    (await page.locator('#snackbar-host').getAttribute('aria-live')) === 'polite');

  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'visible', null, { timeout: 2000 });
  ok('entering -> visible on entrance-motion-end', true);
  ok('snackbar is visible to the user', await page.locator('.snackbar').isVisible());

  // A3 tap targets, measured on the post-interaction surface
  const boxes = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a[href], [role="button"]').forEach(el => {
      const r = el.getBoundingClientRect();
      out.push({ sel: el.className || el.tagName, w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out;
  });
  const small = boxes.filter(b => b.w < 44 || b.h < 44);
  ok('every interactive target >= 44x44 CSS px', small.length === 0, JSON.stringify(boxes));

  // hover holds the clock past the dwell
  await page.locator('.snackbar').hover();
  await page.waitForTimeout(7000);            // > the 6000ms dwell token
  ok('hover holds the auto-dismiss clock past the full dwell',
    (await page.locator('#record-state').textContent()) === 'visible');

  // keyboard focus also holds it
  await page.mouse.move(5, 5);
  await page.locator('.snackbar__undo').focus();
  await page.waitForTimeout(7000);            // > the 6000ms dwell token
  ok('focus-within holds the auto-dismiss clock past the full dwell',
    (await page.locator('#record-state').textContent()) === 'visible');

  // release -> timeout -> leaving -> dismissed
  await page.locator('#save-button').focus();
  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'dismissed', null, { timeout: 9000 });
  ok('visible -> leaving -> dismissed on timeout after release', true);
  ok('dismissed removes the node from the document', (await page.locator('.snackbar').count()) === 0);
  ok('dismissed outcome is distinct', (await page.locator('#record-outcome').textContent()).includes('kept'));

  // undo path
  const before = await page.locator('#record-value').textContent();
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'visible', null, { timeout: 2000 });
  await page.locator('.snackbar__undo').click();
  ok('visible -> reverted on undo-activated',
    (await page.locator('#record-state').textContent()) === 'reverted');
  ok('undo restores the previous value', (await page.locator('#record-value').textContent()) === before);
  ok('reverted removes the node from the document', (await page.locator('.snackbar').count()) === 0);
  ok('reverted outcome is distinct from dismissed',
    (await page.locator('#record-outcome').textContent()).includes('reverted'));
  ok('focus returns to the trigger after undo',
    await page.evaluate(() => document.activeElement && document.activeElement.id === 'save-button'));

  // explicit dismiss path
  await page.locator('#save-button').click();
  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'visible', null, { timeout: 2000 });
  await page.locator('.snackbar__dismiss').click();
  ok('dismiss-activated enters leaving',
    ['leaving', 'dismissed'].includes(await page.locator('#record-state').textContent()));
  // late click during leaving must not re-enter the machine
  const leavingInert = await page.evaluate(() => {
    const n = document.querySelector('.snackbar');
    return n ? (n.inert === true && getComputedStyle(n).pointerEvents === 'none') : 'already-removed';
  });
  ok('leaving surface is inert to further input', leavingInert === true || leavingInert === 'already-removed', String(leavingInert));
  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'dismissed', null, { timeout: 3000 });
  ok('leaving -> dismissed on exit-motion-end', (await page.locator('.snackbar').count()) === 0);

  ok('no page errors', errors.length === 0, errors.join(' | '));

  // motion values actually resolved from tokens
  await page.locator('#save-button').click();
  const anim = await page.evaluate(() => {
    const n = document.querySelector('.snackbar');
    const cs = getComputedStyle(n);
    return { name: cs.animationName, dur: cs.animationDuration, ease: cs.animationTimingFunction };
  });
  ok('enter animation uses motion.duration.base + out-expo',
    anim.name === 'snackbar-enter' && anim.dur === '0.2s' && anim.ease === 'cubic-bezier(0.16, 1, 0.3, 1)',
    JSON.stringify(anim));

  await page.screenshot({ path: path.join(import.meta.dirname, 'visible.png') });
  await ctx.close();
}

// --- run 2: reduced motion ----------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(file);
  await page.locator('#save-button').click();
  await page.waitForSelector('.snackbar');
  const t = await page.evaluate(() => {
    const n = document.querySelector('.snackbar');
    const kf = n.getAnimations()[0];
    const frames = kf ? kf.effect.getKeyframes() : [];
    return { hasTransform: frames.some(f => f.transform && f.transform !== 'none'), n: frames.length };
  });
  ok('reduced motion: entrance is opacity-only (no transform keyframe)', t.hasTransform === false, JSON.stringify(t));
  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'visible', null, { timeout: 2000 });
  await page.locator('.snackbar__dismiss').click();
  await page.waitForFunction(() => document.getElementById('record-state').textContent === 'dismissed', null, { timeout: 2000 });
  ok('reduced motion: exit still terminates in dismissed', true);
  await ctx.close();
}

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  -- ' + r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
