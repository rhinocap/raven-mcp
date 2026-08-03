// POST-HOC. Written AFTER the data was seen. Not part of the pre-registered analysis and
// it does not change the verdict — `analyze4.mjs` over `measure.mjs` is the result of
// record. This exists because reading the T2 failures showed the check does not measure
// the property it names.
//
// The taste decision (kettle, `color`) says verbatim:
//
//   "ds-status-pill is a 1px border in the signal hue with --ink-primary text on
//    --surface-base. It is an outlined pill, not a filled chip."
//
// `--surface-base` is `#0e1113` = `rgb(14, 17, 19)`. So the specified rendering has an
// OPAQUE background equal to --surface-base. measure.mjs's T2 requires
//
//   bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || bg === parentBg
//
// and the immediate parent computes to `rgba(0, 0, 0, 0)` (the paint comes from an
// ancestor), so a build that writes `background: var(--surface-base)` — the literal
// instruction — is scored FAIL. The check encodes "transparent" where the source says
// "on --surface-base".
//
// This corrects only the `unfilled` clause to also accept --surface-base. The border
// clause is untouched. Reports both scorings side by side over ALL pills, not just the
// first, since the original predicate is an .every().
//
//   node posthoc-t2.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IDS = Array.from({ length: 18 }, (_, i) => `b${String(i + 1).padStart(2, '0')}`);
const ASSIGNMENT = JSON.parse(readFileSync(join(HERE, 'assignment.json'), 'utf8'));

const SIGNAL_HUES = ['#d4573a', '#c08a2e', '#4a8f6d'];
const SURFACE_BASE = 'rgb(14, 17, 19)';
const asRgb = (hex) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const signalRgb = SIGNAL_HUES.map(asRgb);

const bordered = (p) => parseFloat(p.bw) >= 1 && signalRgb.some((s) => p.bc.startsWith(s.slice(0, -1)));
const unfilledOriginal = (p) => p.bg === 'rgba(0, 0, 0, 0)' || p.bg === 'transparent' || p.bg === p.parentBg;
const unfilledCorrected = (p) => unfilledOriginal(p) || p.bg === SURFACE_BASE;

const browser = await chromium.launch();
const rows = [];

for (const id of IDS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('file://' + resolve(join(HERE, 'builds', id, 'index.html')));
  await page.waitForTimeout(500);

  const pills = await page.evaluate(`(() => {
    const els = Array.from(document.querySelectorAll('[class*="status-pill"], [class*="statusPill"], [data-pill], .pill, [class*="pill"]'));
    return els.slice(0, 12).map((p) => {
      const cs = getComputedStyle(p);
      const parentBg = p.parentElement ? getComputedStyle(p.parentElement).backgroundColor : '';
      return { bg: cs.backgroundColor, parentBg, bw: cs.borderTopWidth, bc: cs.borderTopColor, text: p.textContent.trim() };
    });
  })()`);

  const orig = pills.length > 0 && pills.every((p) => unfilledOriginal(p) && bordered(p));
  const corr = pills.length > 0 && pills.every((p) => unfilledCorrected(p) && bordered(p));
  const anyBorder = pills.some(bordered);

  rows.push({ id, arm: ASSIGNMENT[id], n: pills.length, orig, corr, anyBorder, sample: pills[0] });
  await ctx.close();
}
await browser.close();

console.log('build arm  pills  T2-as-shipped  T2-corrected  has-signal-border');
for (const r of rows) {
  console.log(`${r.id}  ${r.arm.padEnd(2)}   ${String(r.n).padStart(2)}      ${String(r.orig).padEnd(13)} ${String(r.corr).padEnd(13)} ${r.anyBorder}`);
}

const tally = (arm, key) => rows.filter((r) => r.arm === arm && r[key]).length;
console.log('\narm  T2-as-shipped  T2-corrected');
for (const arm of ['A', 'B1', 'B2']) {
  console.log(`${arm.padEnd(3)}  ${tally(arm, 'orig')}/6            ${tally(arm, 'corr')}/6`);
}
