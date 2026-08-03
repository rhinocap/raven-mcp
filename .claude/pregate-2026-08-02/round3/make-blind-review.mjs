// Step 6 — the human anchor. Builds a self-contained blind pairwise-comparison page.
//
// Ranking 14 artifacts is a poor human instrument: it is slow and the middle of the
// ranking carries almost no signal. Seven forced-choice pairs, each pairing one arm-A
// build against one arm-B build, is a sign test — if all seven fall the same way,
// p = 0.016 two-sided, which is a real result from one sitting.
//
// Pair membership and side are FIXED here (Math.random is avoided so the page is
// reproducible) and recorded in the sealed file. Andrew never sees which is which.

import { readFileSync, writeFileSync } from 'node:fs';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3';

// left/right chosen irregularly on purpose — a strict A,B,A,B alternation is a pattern
// a reader can notice and then unconsciously track.
const PAIRS = [
  { n: 1, left: '02', right: '01' },
  { n: 2, left: '04', right: '03' },
  { n: 3, left: '05', right: '06' },
  { n: 4, left: '08', right: '07' },
  { n: 5, left: '09', right: '10' },
  { n: 6, left: '12', right: '11' },
  { n: 7, left: '14', right: '13' },
];

const b64 = (id) =>
  'data:image/png;base64,' +
  readFileSync(`${R3}/builds/build-${id}/after-save.png`).toString('base64');

const panel = (pair, side, id) => `
      <figure class="side">
        <figcaption>
          <span class="code">${pair.n}${side}</span>
          <a class="open" href="builds/build-${id}/index.html" target="_blank" rel="noopener">open it live &rarr;</a>
        </figcaption>
        <img src="${b64(id)}" alt="Build ${pair.n}${side} after the save was triggered">
      </figure>`;

const pairs = PAIRS.map((p) => `
    <section class="pair" data-pair="${p.n}">
      <h2>Pair ${p.n}</h2>
      <div class="sides">
${panel(p, 'L', p.left)}
${panel(p, 'R', p.right)}
      </div>
      <div class="choose">
        <span class="q">Which is the better piece of work?</span>
        <button data-pick="L">${p.n}L</button>
        <button data-pick="R">${p.n}R</button>
        <button data-pick="=" class="tie">no real difference</button>
      </div>
    </section>`).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blind pair review — §13 pre-gate round 3</title>
<style>
  :root {
    --bg:#050505; --elev:#141414; --fg:#f2f0ed; --muted:#9a9793; --dim:#6a6764;
    --line:#242424; --line-strong:#3a3a3a; --accent:#ed4609;
    --measure: 64ch;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--fg);
    font:400 16px/1.55 ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif;
    padding:64px 40px 120px;
  }
  .wrap { max-width:1400px; margin:0 auto; }
  header { max-width:var(--measure); margin-bottom:72px; }
  h1 { font-size:40px; line-height:1.1; font-weight:700; margin:0 0 20px; letter-spacing:-0.02em; }
  header p { color:var(--muted); margin:0 0 12px; }
  header .why { color:var(--dim); font-size:15px; }
  .pair { border-top:1px solid var(--line); padding-top:28px; margin-bottom:64px; }
  .pair h2 { font-size:13px; letter-spacing:0.08em; text-transform:uppercase;
             color:var(--dim); font-weight:500; margin:0 0 20px; }
  .sides { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
  @media (max-width:900px){ .sides { grid-template-columns:1fr; } }
  .side { margin:0; }
  figcaption { display:flex; justify-content:space-between; align-items:baseline;
               margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  .code { font:500 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing:0.06em; }
  .open { color:var(--muted); font-size:14px; text-decoration:none; border-bottom:1px solid transparent; }
  .open:hover { color:var(--fg); border-bottom-color:var(--accent); }
  img { width:100%; height:auto; display:block; border:1px solid var(--line); }
  .choose { display:flex; align-items:center; gap:12px; margin-top:20px; flex-wrap:wrap; }
  .q { color:var(--muted); font-size:15px; margin-right:4px; }
  button {
    font:500 15px/1 inherit; color:var(--fg); background:transparent;
    border:1px solid var(--line-strong); padding:11px 18px; min-height:44px; cursor:pointer;
  }
  button:hover { border-color:var(--fg); }
  button[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); }
  button.tie { color:var(--muted); }
  .result { position:sticky; bottom:0; margin-top:56px; padding:20px 0 0;
            border-top:1px solid var(--line-strong); background:var(--bg); }
  .result p { color:var(--muted); font-size:15px; margin:0 0 10px; }
  #picks { font:400 15px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
           color:var(--fg); word-break:break-all; }
</style></head>
<body><div class="wrap">
  <header>
    <h1>Blind pair review</h1>
    <p>Seven pairs. In each, one build came from Raven&rsquo;s composed build prompt and the other
       from a one-line instruction telling the agent to call the tools itself. Which is which is
       sealed, and the left/right order is irregular.</p>
    <p>Look at each pair, open them live if you want to feel the interaction &mdash; hover holds the
       auto-dismiss clock, Undo and dismiss are meant to be different outcomes &mdash; then pick the
       better piece of work.</p>
    <p class="why">This is the anchor for the whole experiment. The machine judge could not re-score
       byte-identical artifacts consistently, so your read is the instrument that decides it.</p>
  </header>
${pairs}
  <div class="result">
    <p>Your picks &mdash; paste this back to me:</p>
    <div id="picks">nothing picked yet</div>
  </div>
</div>
<script>
  const picks = {};
  document.querySelectorAll('.pair').forEach(function (sec) {
    const n = sec.dataset.pair;
    sec.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        picks[n] = b.dataset.pick;
        sec.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        const out = Object.keys(picks).sort().map(function (k) { return k + ':' + picks[k]; }).join('  ');
        document.getElementById('picks').textContent =
          out + (Object.keys(picks).length === 7 ? '   — all seven done' : '');
      });
    });
  });
</script>
</body></html>`;

writeFileSync(R3 + '/BLIND-REVIEW.html', html);
console.log('wrote BLIND-REVIEW.html  (' + Math.round(html.length / 1024) + ' KB)');
console.log('pairs:', PAIRS.map((p) => `${p.n}L=build-${p.left} ${p.n}R=build-${p.right}`).join(' | '));
