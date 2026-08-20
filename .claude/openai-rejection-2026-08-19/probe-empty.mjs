import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
async function call(name, args) {
  const t = s._registeredTools[name];
  if (!t) return { name, missing: true };
  try {
    const r = await t.handler(args, { signal: sig });
    const text = r.content[0].text;
    let j = null; try { j = JSON.parse(text); } catch {}
    return { name, isError: r.isError === true, score: j?.score ?? j?.overall_score ?? null, grade: j?.grade ?? null, head: text.slice(0, 180) };
  } catch (e) { return { name, threw: String(e.message).slice(0, 120) }; }
}
console.log(JSON.stringify(await call('audit_ios_a11y', { elements: [] }), null, 1));
console.log(JSON.stringify(await call('audit_rn', { source: '' }), null, 1));
console.log(JSON.stringify(await call('audit_rn', { source: '   \n  ' }), null, 1));
