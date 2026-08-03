import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(new URL(import.meta.url).pathname);
const url = pathToFileURL(path.join(dir, 'index.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url);
await page.click('#save-btn');
await page.waitForSelector('.snackbar.is-visible');
await page.waitForFunction(() => document.getElementById('readout-state').textContent === 'visible');
await page.hover('.snackbar'); // hold the clock so the snapshot is stable

const out = await page.evaluate(() => {
  const sel = el => {
    const c = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + c;
  };
  const effBg = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const isText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

  const dom_snapshot = [...document.querySelectorAll('body *')]
    .filter(el => isText(el) && el.getBoundingClientRect().width > 0 && !el.classList.contains('sr-only'))
    .map(el => {
      const s = getComputedStyle(el);
      return {
        selector: sel(el), color: s.color, bgColor: effBg(el),
        fontPx: parseFloat(s.fontSize), bold: parseInt(s.fontWeight, 10) >= 700,
        text: (el.textContent || '').trim().slice(0, 50)
      };
    });

  const targets = [...document.querySelectorAll('a, button, [role=button], input, select, summary, [tabindex]')]
    .map(el => {
      const r = el.getBoundingClientRect();
      return { selector: sel(el), role: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 30),
               x: r.x, y: r.y, w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    });

  const elements = [...document.querySelectorAll('body *')]
    .filter(el => el.getBoundingClientRect().width > 0 && !el.classList.contains('sr-only'))
    .map(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        selector: sel(el),
        rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
        computed: { color: s.color, background: s.backgroundColor, fontSize: s.fontSize,
                    padding: s.padding, margin: s.margin, gap: s.gap }
      };
    });

  return { dom_snapshot, targets, elements, viewport: { w: window.innerWidth, h: window.innerHeight } };
});

fs.writeFileSync(path.join(dir, 'post-interaction-snapshot.json'), JSON.stringify(out, null, 2));
console.log('elements:', out.elements.length, 'text:', out.dom_snapshot.length, 'targets:', out.targets.length);
await browser.close();
