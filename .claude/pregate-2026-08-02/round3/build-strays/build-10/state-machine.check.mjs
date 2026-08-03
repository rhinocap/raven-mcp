// A5 verification — drives the built component through every documented
// transition and asserts the state machine. Lives inside the repo so ESM
// resolves `playwright` from raven-mcp/node_modules.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = pathToFileURL(path.resolve(process.argv[2] ?? new URL('./index.html', import.meta.url).pathname)).href;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

async function newPage(reducedMotion) {
  const ctx = await browser.newContext({ reducedMotion, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(file);
  return { ctx, page, errs };
}

const SB = '[data-testid="snackbar"]';

// ---- 1. absent -> entering -> visible, and content ----
{
  const { ctx, page, errs } = await newPage('no-preference');
  check('A5.1 absent: no snackbar in the document before commit', await page.locator(SB).count() === 0);
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.locator(SB).waitFor({ state: 'attached', timeout: 2000 });
  const entered = await page.locator(SB).getAttribute('data-state');
  check('A5.2 entering on optimistic-save-committed', entered === 'entering' || entered === 'visible', `data-state=${entered}`);
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  check('A5.3 entering -> visible on entrance-motion-end', true);
  check('A5.4 snackbar visible', await page.locator(SB).isVisible());
  check('A5.5 message copy is "Saved" in a polite live region',
    (await page.locator('[data-testid="snackbar-message"]').textContent())?.trim() === 'Saved'
    && await page.locator('[data-testid="snackbar-message"]').getAttribute('role') === 'status'
    && await page.locator('[data-testid="snackbar-message"]').getAttribute('aria-live') === 'polite');
  check('A5.6 optimistic write applied to the surrounding surface',
    (await page.locator('#setting-value').textContent())?.trim() === 'Public');
  check('A5.7 no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ---- 2. visible -> leaving -> dismissed on the 6s timeout ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'leaving', null, { timeout: 9000 });
  const dwell = Date.now() - t0;
  check('A5.8 visible -> leaving on ~6000ms timeout', dwell > 5500 && dwell < 7000, `dwell=${dwell}ms`);
  const inert = await page.locator(SB).getAttribute('inert');
  check('A5.9 leaving is inert to further input', inert !== null);
  await page.locator(SB).waitFor({ state: 'detached', timeout: 3000 });
  check('A5.10 leaving -> dismissed: removed from the document (not CSS-hidden)', await page.locator(SB).count() === 0);
  check('A5.11 dismissed: the save stands', (await page.locator('#setting-value').textContent())?.trim() === 'Public');
  await ctx.close();
}

// ---- 3. hover holds the clock ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  await page.locator(SB).hover();
  await page.waitForTimeout(7500);
  check('A5.12 auto-dismiss paused by hover (still visible after 7.5s)',
    await page.locator(SB).getAttribute('data-state') === 'visible');
  await page.mouse.move(10, 10);
  await page.waitForFunction(() => !document.querySelector('[data-testid="snackbar"]'), null, { timeout: 9000 });
  check('A5.13 clock resumes on pointerleave', true);
  await ctx.close();
}

// ---- 4. keyboard focus-within holds the clock ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  await page.locator('[data-testid="snackbar-undo"]').focus();
  await page.waitForTimeout(7500);
  check('A5.14 auto-dismiss paused by focus-within (still visible after 7.5s)',
    await page.locator(SB).getAttribute('data-state') === 'visible');
  await ctx.close();
}

// ---- 5. dismiss control -> leaving -> dismissed ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  await page.getByRole('button', { name: 'Dismiss' }).click();
  const st = await page.locator(SB).getAttribute('data-state');
  check('A5.15 visible -> leaving on dismiss-activated', st === 'leaving', `data-state=${st}`);
  await page.locator(SB).waitFor({ state: 'detached', timeout: 2000 });
  check('A5.16 dismissed: removed, save stands', (await page.locator('#setting-value').textContent())?.trim() === 'Public');
  await ctx.close();
}

// ---- 6. undo -> reverted (terminal, distinct from dismissed) ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  await page.getByRole('button', { name: 'Undo' }).click();
  check('A5.17 visible -> reverted: surface removed from the document', await page.locator(SB).count() === 0);
  check('A5.18 reverted is distinct from dismissed: the save was rolled back',
    (await page.locator('#setting-value').textContent())?.trim() === 'Private');
  await ctx.close();
}

// ---- 7. reduced motion: no translation, near-zero durations, machine intact ----
{
  const { ctx, page } = await newPage('reduce');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.locator(SB).waitFor({ state: 'attached', timeout: 2000 });
  const m = await page.locator(SB).evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      enter: cs.getPropertyValue('--snackbar-enter-duration').trim(),
      exit: cs.getPropertyValue('--snackbar-exit-duration').trim(),
      enterShift: cs.getPropertyValue('--snackbar-enter-shift').trim(),
      exitShift: cs.getPropertyValue('--snackbar-exit-shift').trim()
    };
  });
  check('A5.19 prefers-reduced-motion collapses durations to near-zero',
    m.enter === '1ms' && m.exit === '1ms', JSON.stringify(m));
  check('A5.20 prefers-reduced-motion removes all translation (opacity-only)',
    m.enterShift === '0px' && m.exitShift === '0px', JSON.stringify(m));
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  check('A5.21 machine still reaches visible under reduced motion', true);
  await ctx.close();
}

// ---- 8. motion tokens (A5 corroboration; duration/easing remain agent-asserted) ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.locator(SB).waitFor({ state: 'attached', timeout: 2000 });
  const t = await page.locator(SB).evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      enter: cs.getPropertyValue('--snackbar-enter-duration').trim(),
      exit: cs.getPropertyValue('--snackbar-exit-duration').trim(),
      easing: cs.getPropertyValue('--snackbar-easing').trim(),
      enterShift: cs.getPropertyValue('--snackbar-enter-shift').trim(),
      exitShift: cs.getPropertyValue('--snackbar-exit-shift').trim()
    };
  });
  check('A5.22 enter 200ms / exit 120ms / out-quart / 16px in / 8px out, all token-derived',
    t.enter === '200ms' && t.exit === '120ms' && t.easing === 'cubic-bezier(0.25, 1, 0.5, 1)'
    && t.enterShift === '16px' && t.exitShift === '8px', JSON.stringify(t));
  await ctx.close();
}

// ---- 9. tap targets, post-interaction ----
{
  const { ctx, page } = await newPage('no-preference');
  await page.getByRole('button', { name: 'Save change' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="snackbar"]')?.dataset.state === 'visible', null, { timeout: 2000 });
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: (b.textContent || b.getAttribute('aria-label') || '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
    }));
  const small = boxes.filter((b) => b.w < 44 || b.h < 44);
  check('A5.23 every interactive target >= 44x44 CSS px (post-interaction)', small.length === 0, JSON.stringify(boxes));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
