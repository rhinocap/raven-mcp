// Eyes-on capture for the pre-gate. Usage: node capture.mjs <dir> [<dir> ...]
// Each <dir> must contain index.html; writes <dir>/idle.png and <dir>/postsave.png.
//
// Lives inside the repo deliberately: ESM resolves `playwright` from this file's own
// location, and NODE_PATH is ignored (a scratchpad copy throws ERR_MODULE_NOT_FOUND).
//
// Loads over file:// rather than an http.server: every arm artifact is one self-contained
// HTML file with no external requests, so rendering is identical, and it removes the
// port-contention/serialization risk of many readers against one single-threaded server.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2).map((d) => path.resolve(d));
if (!dirs.length) { console.error('usage: node capture.mjs <dir> [<dir> ...]'); process.exit(1); }

const browser = await chromium.launch();
const results = [];

for (const dir of dirs) {
  const html = path.join(dir, 'index.html');
  const name = path.basename(dir);
  if (!existsSync(html)) { results.push(`${name}: MISSING index.html`); continue; }
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,             // full-resolution eyes-on
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('file://' + html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'idle.png') });

  // The build contract mandates a single "Save change" button that simulates an optimistic save.
  let clicked = false;
  const byRole = page.getByRole('button', { name: /save/i }).first();
  if (await byRole.count()) { await byRole.click(); clicked = true; }
  else {
    const anyBtn = page.locator('button', { hasText: /save/i }).first();
    if (await anyBtn.count()) { await anyBtn.click(); clicked = true; }
  }

  await page.waitForTimeout(900);      // enter animation settles; auto-dismiss is >=5s
  await page.screenshot({ path: path.join(dir, 'postsave.png') });

  // Measured proportion evidence: computed font sizes of the snackbar's message vs its action.
  const metrics = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && +s.opacity > 0.01;
    };
    const btns = [...document.querySelectorAll('button')].filter(vis);
    const undo = btns.find((b) => /^\s*undo\s*$/i.test(b.textContent || ''));
    if (!undo) return { undo: null };
    // nearest visible text node sibling group = the confirmation message
    const host = undo.closest('div,section,aside,output') || document.body;
    const texts = [...host.querySelectorAll('*')].filter(
      (el) => vis(el) && el !== undo && !el.contains(undo) && (el.textContent || '').trim().length > 3
        && ![...el.children].some((c) => (c.textContent || '').trim() === (el.textContent || '').trim())
    );
    const msg = texts[0] || null;
    const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    return {
      undo: { fontPx: px(undo), text: (undo.textContent || '').trim() },
      message: msg ? { fontPx: px(msg), text: (msg.textContent || '').trim().slice(0, 60) } : null,
    };
  });

  results.push(JSON.stringify({ build: name, clicked, metrics, errors: errors.slice(0, 5) }));
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(r);
