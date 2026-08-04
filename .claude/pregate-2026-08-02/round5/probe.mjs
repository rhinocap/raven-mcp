import { chromium } from 'playwright';
const HELPERS = (await import('node:fs')).readFileSync('/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round5/measure5.mjs','utf8');
const H = HELPERS.split('const HELPERS = `')[1].split('\n`;')[0];
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
await p.goto('file:///Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round5/fixtures/conformant/index.html');
await p.addScriptTag({content: H.replace(/\$\{JSON\.stringify\(SURFACE_RECESSED\)\}/,'"rgb(11, 13, 15)"')});
await p.waitForTimeout(300);
console.log(await p.evaluate(`(() => {
  const chips = window.__chips();
  const out = { n: chips.length, cls: chips.map(c=>c.className+"|"+(c.textContent||"").trim()), vis: chips.map(window.__visible) };
  if (chips.length>=2){ chips[0].click(); chips[1].click();
    out.afterClick = chips.slice(0,2).map(c=>({cls:c.className, ap:c.getAttribute('aria-pressed'), bg:getComputedStyle(c).backgroundColor, act: window.__isActive(c)}));
  }
  const pager = Array.from(document.querySelectorAll('button,a,[role="button"],li')).filter(x=>/^\\s*\\d+\\s*$/.test(x.textContent||''));
  out.pager = pager.map(x=>x.tagName+":"+(x.textContent||'').trim());
  return out;
})()`));
await b.close();
