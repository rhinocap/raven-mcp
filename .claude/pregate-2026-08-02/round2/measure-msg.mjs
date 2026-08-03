// Measures the snackbar's own text nodes after a save. Reports every visible leaf
// text element inside the container that holds the Undo button, with computed px.
// Written because capture.mjs's "nearest sibling" heuristic returned null on 10/12 builds.
import { chromium } from 'playwright';
import path from 'node:path';

const dirs = process.argv.slice(2).map((d) => path.resolve(d));
const browser = await chromium.launch();
for (const dir of dirs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(dir, 'index.html'), { waitUntil: 'load' });
  await page.getByRole('button', { name: /save/i }).first().click();
  await page.waitForTimeout(900);
  const out = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && +s.opacity > 0.01; };
    const undo = [...document.querySelectorAll('button')].filter(vis)
      .find((b) => /^\s*undo\s*$/i.test(b.textContent || ''));
    if (!undo) return { error: 'no visible Undo' };
    // walk up to the snackbar root: the highest ancestor still narrower than the viewport
    let root = undo.parentElement;
    while (root && root.parentElement && root.parentElement !== document.body
           && root.parentElement.getBoundingClientRect().width < window.innerWidth * 0.9) {
      root = root.parentElement;
    }
    const leaves = [...root.querySelectorAll('*')].filter(
      (el) => vis(el) && (el.textContent || '').trim().length > 2
        && ![...el.children].some((c) => (c.textContent || '').trim() === (el.textContent || '').trim()));
    return {
      rootClass: root.className || root.tagName,
      undoPx: parseFloat(getComputedStyle(undo).fontSize),
      texts: leaves.map((el) => ({
        px: parseFloat(getComputedStyle(el).fontSize),
        weight: getComputedStyle(el).fontWeight,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 44),
      })),
    };
  });
  console.log(JSON.stringify({ build: path.basename(dir), ...out }));
  await ctx.close();
}
await browser.close();
