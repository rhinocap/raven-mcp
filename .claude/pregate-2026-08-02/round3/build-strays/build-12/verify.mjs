import { chromium } from 'playwright';

const url = 'file:///Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3/builds/build-12/index.html';
const results = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);

const value = () => page.locator('#visibility-value').innerText();
const state = () => page.locator('#readout-state').innerText();
const remaining = () => page.locator('#readout-remaining').innerText();
const bar = page.locator('.snackbar');

ok('initial idle, no snackbar', (await state()) === 'idle' && (await bar.count()) === 0);

// --- save -> optimistic value + snackbar
await page.click('#save-button');
ok('value flipped optimistically', (await value()) === 'Public', await value());
ok('snackbar present', (await bar.count()) === 1);
ok('confirmation copy', (await page.locator('.snackbar__message').innerText()) === 'Visibility set to Public.');
ok('undo action present', (await page.locator('.snackbar__action').count()) === 1);
ok('state visible', (await state()) === 'visible', await state());

// --- tap targets
const sizes = await page.evaluate(() => [...document.querySelectorAll('.snackbar__action,.snackbar__dismiss,#save-button')]
  .map(el => { const r = el.getBoundingClientRect(); return [el.className || el.id, Math.round(r.width), Math.round(r.height)]; }));
ok('tap targets >= 44x44', sizes.every(s => s[1] >= 44 && s[2] >= 44), JSON.stringify(sizes));

// --- pause on hover
await page.waitForTimeout(900);
await page.hover('.snackbar__message');
await page.waitForTimeout(120);
const pausedState = await state();
const r1 = await remaining();
await page.waitForTimeout(700);
const r2 = await remaining();
ok('hover pauses countdown', pausedState === 'paused' && r1 === r2, `${pausedState} ${r1} -> ${r2}`);

// --- resume on unhover
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
const r3 = await remaining();
ok('unhover resumes countdown', (await state()) === 'visible' && parseFloat(r3) < parseFloat(r2), `${r2} -> ${r3}`);

// --- keyboard focus pauses
await page.locator('.snackbar__action').focus();
await page.waitForTimeout(200);
ok('focus pauses countdown', (await state()) === 'paused', await state());

// --- undo
await page.locator('.snackbar__action').click();
ok('undo reverts value', (await value()) === 'Private', await value());
ok('revert copy', (await page.locator('.snackbar__message').innerText()) === 'Reverted to Private.');
ok('revert snackbar has no undo', (await page.locator('.snackbar__action').count()) === 0);
ok('only one snackbar in dom', (await bar.count()) === 1);

// --- explicit dismiss
await page.locator('.snackbar__dismiss').click();
await page.waitForTimeout(400);
ok('explicit dismiss removes node from DOM', (await bar.count()) === 0);
ok('state back to idle', (await state()) === 'idle', await state());

// --- escape dismiss
await page.click('#save-button');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ok('escape dismisses', (await bar.count()) === 0);

// --- focus returns to trigger when focus was inside
await page.click('#save-button');
await page.locator('.snackbar__dismiss').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
ok('focus returns to trigger', await page.evaluate(() => document.activeElement && document.activeElement.id === 'save-button'));

// --- auto dismiss
await page.click('#save-button');
await page.mouse.move(5, 5);
const t0 = Date.now();
await page.waitForFunction(() => document.querySelectorAll('.snackbar').length === 0, null, { timeout: 12000 });
const elapsed = Date.now() - t0;
ok('auto-dismiss near 6s', elapsed > 5000 && elapsed < 8000, `${elapsed}ms`);

// --- repeated saves replace, never stack
await page.click('#save-button');
await page.click('#save-button');
await page.waitForTimeout(150);
ok('repeat save does not stack', (await bar.count()) === 1, String(await bar.count()));

// --- reduced motion
const rmPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await rmPage.goto(url);
await rmPage.click('#save-button');
await rmPage.waitForTimeout(120);
const opacity = await rmPage.locator('.snackbar').evaluate(el => getComputedStyle(el).opacity);
ok('reduced motion: snackbar immediately opaque', opacity === '1', opacity);
const mobileFits = await rmPage.locator('.snackbar').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth + 1);
ok('mobile: snackbar within viewport', mobileFits);
const hScroll = await rmPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
ok('mobile: no horizontal scroll', hScroll);

ok('no console errors', errors.length === 0, errors.join(' | '));

await page.screenshot({ path: new URL('./shot-desktop.png', import.meta.url).pathname, fullPage: false });
await rmPage.screenshot({ path: new URL('./shot-mobile.png', import.meta.url).pathname });

await browser.close();
console.log(results.join('\n'));
console.log(results.some(r => r.startsWith('FAIL')) ? '\nRESULT: FAIL' : '\nRESULT: ALL PASS');
