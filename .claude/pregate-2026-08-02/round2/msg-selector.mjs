import { chromium } from 'playwright';
import path from 'node:path';
const dirs = process.argv.slice(2).map((d) => path.resolve(d));
const browser = await chromium.launch();
for (const dir of dirs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(dir, 'index.html'), { waitUntil: 'load' });
  await page.getByRole('button', { name: /save/i }).first().click();
  await page.waitForTimeout(700);
  const out = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && +s.opacity > 0.01; };
    const el = [...document.querySelectorAll('p,div,span,output')]
      .filter(vis).find((e) => /^change saved\.?$/i.test((e.textContent || '').trim()));
    if (!el) return { error: 'msg not found' };
    const hits = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules || []) {
        if (rule.style && rule.selectorText && rule.style.fontSize) {
          try { if (el.matches(rule.selectorText)) hits.push({ sel: rule.selectorText, fs: rule.style.fontSize }); }
          catch {}
        }
      }
    }
    return { tag: el.tagName.toLowerCase(), cls: el.className, px: parseFloat(getComputedStyle(el).fontSize), hits };
  });
  console.log(JSON.stringify({ build: path.basename(dir), ...out }));
  await ctx.close();
}
await browser.close();
