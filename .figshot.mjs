import { chromium } from 'playwright';
const b = await chromium.launch();
const SP = process.env.SP;
for (const [w, tag] of [[900,'720'],[380,'380']]) {
  const p = await b.newPage({ deviceScaleFactor: 2 });
  await p.setViewportSize({ width: w, height: 1000 });
  await p.goto('http://localhost:8791/figures-contact-sheet.html');
  await p.evaluate(() => document.fonts.ready);
  const figs = await p.$$('figure');
  for (let i = 0; i < figs.length; i++)
    await figs[i].screenshot({ path: `${SP}/fig-0${i+1}-${tag}.png` });
  await p.close();
}
await b.close();
