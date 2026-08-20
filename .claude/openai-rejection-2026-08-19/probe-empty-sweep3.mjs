// Round 2 of the empty-input sweep: the nine tools round 1 skipped because they
// carry no source/html/elements-shaped param. Their real collection params are
// filled empty here. URL-taking tools are probed with their non-network params
// only, so a network refusal is not mistaken for an input refusal.
import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
const CASES = [
  ['audit_consistency', { pages: [] }],
  ['audit_content',     { items: [] }],
  ['audit_contrast',    { dom_snapshot: { nodes: [] } }],
  ['audit_parity',      { ios: [], android: [] }],
  ['audit_typography',  { nodes: [] }],
  ['audit_video_playback', { dom_snapshot: { videos: [] } }],
  ['evaluate_design',   { description: '' }],
  ['evaluate_design',   { description: '   ' }]
];
for (const [n, args] of CASES) {
  const t = s._registeredTools[n];
  if (!t) { console.log(`MISSING ${n}`); continue; }
  try {
    const r = await t.handler(args, { signal: sig });
    const text = r.content[0].text;
    let j = null; try { j = JSON.parse(text); } catch {}
    const score = j?.score ?? j?.overall_score ?? null;
    const grade = j?.grade ?? null;
    const flag = (r.isError !== true && (score === 100 || /all clear|no issues/i.test(text))) ? 'FALSE-ALL-CLEAR' : 'ok';
    console.log(`${flag.padEnd(16)} ${n.padEnd(24)} isError=${r.isError===true} score=${score} grade=${grade} args=[${Object.keys(args)}] :: ${text.slice(0,110).replace(/\n/g,' ')}`);
  } catch (e) { console.log(`THREW           ${n.padEnd(24)} ${String(e.message).slice(0,110)}`); }
}
