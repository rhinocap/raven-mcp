import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
const names = Object.keys(s._registeredTools).filter(n => n.startsWith('audit') || n === 'score_page' || n === 'evaluate_design');
const EMPTY = { source: '', html: '', elements: [], screens: [], files: [], code: '', markup: '', text: '', file_paths: [] };
for (const n of names) {
  const t = s._registeredTools[n];
  const shape = t.inputSchema?.shape ?? {};
  const args = {};
  for (const k of Object.keys(shape)) if (k in EMPTY) args[k] = EMPTY[k];
  if (Object.keys(args).length === 0) { console.log(`SKIP ${n} (no empty-able param; params=${Object.keys(shape).join(',')})`); continue; }
  try {
    const r = await t.handler(args, { signal: sig });
    const text = r.content[0].text;
    let j = null; try { j = JSON.parse(text); } catch {}
    const score = j?.score ?? j?.overall_score ?? null;
    const grade = j?.grade ?? null;
    const flag = (r.isError !== true && (score === 100 || /all clear|no issues/i.test(text))) ? 'FALSE-ALL-CLEAR' : 'ok';
    console.log(`${flag.padEnd(16)} ${n.padEnd(28)} isError=${r.isError === true} score=${score} grade=${grade} args=[${Object.keys(args)}]`);
  } catch (e) { console.log(`THREW           ${n.padEnd(28)} ${String(e.message).slice(0,90)}`); }
}
