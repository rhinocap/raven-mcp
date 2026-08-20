import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
const CASES = [
  ['audit_contrast', { dom_snapshot: [] }],
  ['audit_video_playback', { dom_snapshot: [] }],
  ['audit_consistency', { pages: [{ name: 'a', html: '' }, { name: 'b', html: '' }] }]
];
for (const [n, args] of CASES) {
  const t = s._registeredTools[n];
  const parsed = t.inputSchema.safeParse(args);
  if (!parsed.success) { console.log(`ZOD-REJECT  ${n} :: ${parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ').slice(0,140)}`); continue; }
  try {
    const r = await t.handler(parsed.data, { signal: sig });
    const text = r.content[0].text;
    let j=null; try { j=JSON.parse(text); } catch {}
    const score = j?.score ?? j?.overall_score ?? null;
    const flag = (r.isError !== true && (score === 100 || /all clear|no issues/i.test(text))) ? 'FALSE-ALL-CLEAR' : 'ok';
    console.log(`${flag.padEnd(16)} ${n} isError=${r.isError===true} score=${score} grade=${j?.grade??null} :: ${text.slice(0,120).replace(/\n/g,' ')}`);
  } catch (e) { console.log(`REAL-THROW  ${n} :: ${e.constructor.name}: ${String(e.message).slice(0,110)}`); }
}
