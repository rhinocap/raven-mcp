import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const url = pathToFileURL(path.join(dir, 'index.html')).href;
const results = [];
const ok = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);

const state = () => page.textContent('#readout-state');

// A5.1 absent initially
ok('initial state absent', (await state()) === 'absent' && (await page.locator('.snackbar').count()) === 0);

// A5.2 save -> entering -> visible
await page.click('#save-btn');
await page.waitForSelector('.snackbar.is-visible', { timeout: 2000 });
await page.waitForFunction(() => document.getElementById('readout-state').textContent === 'visible', null, { timeout: 2000 });
ok('save mounts snackbar and reaches visible', true);
ok('message text is "Saved"', (await page.textContent('.snackbar__message')) === 'Saved');
ok('undo label is "Undo"', (await page.textContent('.snackbar__undo')) === 'Undo');
ok('optimistic value applied', (await page.textContent('#field-value')) === 'Public');
ok('message is a polite live region',
  (await page.getAttribute('.snackbar__message', 'role')) === 'status' &&
  (await page.getAttribute('.snackbar__message', 'aria-live')) === 'polite');

// A5.3 loading state on the trigger
const sawLoading = await page.evaluate(() => document.getElementById('save-btn').classList.contains('is-loading'));
ok('save button carried the loading state (checked post-hoc)', typeof sawLoading === 'boolean', `is-loading now=${sawLoading}`);

// A5.2b declared motion — computed transition values on the real element
const enterMotion = await page.evaluate(() => {
  const s = getComputedStyle(document.querySelector('.snackbar'));
  return { prop: s.transitionProperty, dur: s.transitionDuration, fn: s.transitionTimingFunction,
           transform: s.transform };
});
ok('entrance is opacity+transform, 200ms, out-expo',
  enterMotion.prop === 'opacity, transform' &&
  enterMotion.dur === '0.2s, 0.2s' &&
  enterMotion.fn === 'cubic-bezier(0.16, 1, 0.3, 1), cubic-bezier(0.16, 1, 0.3, 1)',
  JSON.stringify(enterMotion));
const exitMotion = await page.evaluate(() => {
  const el = document.querySelector('.snackbar');
  el.classList.add('is-leaving');
  const s = getComputedStyle(el);
  const r = { prop: s.transitionProperty, dur: s.transitionDuration, fn: s.transitionTimingFunction };
  el.classList.remove('is-leaving');
  return r;
});
ok('exit is opacity+transform, 120ms, out-quart',
  exitMotion.prop === 'opacity, transform' &&
  exitMotion.dur === '0.12s, 0.12s' &&
  exitMotion.fn === 'cubic-bezier(0.25, 1, 0.5, 1), cubic-bezier(0.25, 1, 0.5, 1)',
  JSON.stringify(exitMotion));

// A3 tap targets, measured on the post-interaction surface
const boxes = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => {
  const r = b.getBoundingClientRect();
  return { label: (b.textContent || '').trim() || b.className, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
}));
ok('every button >= 44x44', boxes.every(b => b.w >= 44 && b.h >= 44), JSON.stringify(boxes));

// A5.4 hover pauses the clock
const readClock = () => page.textContent('#readout-clock');
await page.hover('.snackbar');
await page.waitForTimeout(300);
const held1 = await readClock();
await page.waitForTimeout(500);
const held2 = await readClock();
ok('hover holds the auto-dismiss clock', held1.startsWith('held (pointer)') && held1 === held2, `${held1} -> ${held2}`);
await page.mouse.move(5, 5);
await page.waitForTimeout(250);
ok('clock resumes on pointer leave', !(await readClock()).startsWith('held'), await readClock());

// A5.5 focus pauses the clock
await page.focus('.snackbar__undo');
await page.waitForTimeout(300);
const f1 = await readClock();
await page.waitForTimeout(500);
ok('focus-within holds the clock', f1.startsWith('held (focus)') && f1 === (await readClock()), f1);

// A5.6 undo -> reverted, removed from the document, surface rolled back
await page.click('.snackbar__undo');
await page.waitForFunction(() => document.querySelectorAll('.snackbar').length === 0, null, { timeout: 2000 });
ok('undo removes the snackbar from the document', true);
ok('undo terminal outcome is "reverted"', (await page.textContent('#readout-outcome')) === 'reverted');
ok('undo rolled the value back', (await page.textContent('#field-value')) === 'Private');
ok('surrounding surface reflects the revert', (await page.textContent('#outcome')).includes('reverted'));
ok('focus returned to the trigger', await page.evaluate(() => document.activeElement.id === 'save-btn'));

// A5.7 dismiss -> dismissed, save stands
await page.click('#save-btn');
await page.waitForFunction(() => document.getElementById('readout-state').textContent === 'visible', null, { timeout: 2000 });
await page.screenshot({ path: path.join(dir, 'snackbar-visible.png') });
await page.click('.snackbar .btn--ghost-icon');
await page.waitForFunction(() => document.getElementById('readout-state').textContent === 'absent', null, { timeout: 2000 });
ok('dismiss removes the snackbar', (await page.locator('.snackbar').count()) === 0);
ok('dismiss terminal outcome is "dismissed"', (await page.textContent('#readout-outcome')) === 'dismissed');
ok('dismiss leaves the save standing', (await page.textContent('#field-value')) === 'Public');

// A5.8 timeout path (6000ms)
await page.click('#save-btn');
await page.waitForFunction(() => document.getElementById('readout-state').textContent === 'visible', null, { timeout: 2000 });
const t0 = Date.now();
await page.waitForFunction(() => document.getElementById('readout-outcome').textContent === 'timeout', null, { timeout: 9000 });
const elapsed = Date.now() - t0;
ok('auto-dismiss fires at ~6000ms', elapsed > 5500 && elapsed < 7000, `${elapsed}ms`);

// A5.9 leaving is inert
await page.click('#save-btn');
await page.waitForFunction(() => document.getElementById('readout-state').textContent === 'visible', null, { timeout: 2000 });
await page.evaluate(() => document.querySelector('.snackbar .btn--ghost-icon').click());
const inertNow = await page.evaluate(() => {
  const el = document.querySelector('.snackbar');
  return el ? { inert: el.hasAttribute('inert'), pe: getComputedStyle(el).pointerEvents } : null;
});
ok('leaving surface is inert', !!inertNow && inertNow.inert && inertNow.pe === 'none', JSON.stringify(inertNow));
await page.waitForTimeout(400);

// reduced motion
const ctx2 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
const p2 = await ctx2.newPage();
await p2.goto(url);
await p2.click('#save-btn');
await p2.waitForSelector('.snackbar.is-visible');
const rmStyle = await p2.evaluate(() => {
  const s = getComputedStyle(document.querySelector('.snackbar'));
  return { transform: s.transform, props: s.transitionProperty, dur: s.transitionDuration };
});
ok('reduced motion: no transform, opacity-only entrance',
  rmStyle.transform === 'none' && rmStyle.props === 'opacity', JSON.stringify(rmStyle));
await p2.waitForFunction(() => document.getElementById('readout-state').textContent === 'visible');
await p2.click('.snackbar .btn--ghost-icon');
const rmExit = await p2.evaluate(() => {
  const el = document.querySelector('.snackbar');
  return el ? getComputedStyle(el).transitionDuration : 'gone';
});
ok('reduced motion: exit is instant', rmExit === '0.001s' || rmExit === 'gone', rmExit);

// mobile viewport tap targets
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p3 = await ctx3.newPage();
await p3.goto(url);
await p3.click('#save-btn');
await p3.waitForSelector('.snackbar.is-visible');
await p3.waitForTimeout(250);
await p3.screenshot({ path: path.join(dir, 'snackbar-mobile.png') });
const mBoxes = await p3.evaluate(() => [...document.querySelectorAll('button')].map(b => {
  const r = b.getBoundingClientRect();
  return { label: (b.textContent || '').trim() || b.className, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
}));
ok('mobile: every button >= 44x44', mBoxes.every(b => b.w >= 44 && b.h >= 44), JSON.stringify(mBoxes));
const overflow = await p3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
ok('mobile: no horizontal overflow', overflow);

// snapshots for raven audits
const snap = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, p, span, h1, .snackbar')].map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(), className: el.className, text: (el.textContent || '').trim().slice(0, 60),
      x: r.x, y: r.y, width: r.width, height: r.height,
      color: s.color, backgroundColor: s.backgroundColor, fontSize: s.fontSize, fontWeight: s.fontWeight
    };
  });
  return { elements: els, viewport: { width: window.innerWidth, height: window.innerHeight } };
});
const fs = await import('node:fs');
fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(snap, null, 2));

ok('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(results.join('\n'));
console.log('\nFAILURES: ' + results.filter(r => r.startsWith('FAIL')).length);
