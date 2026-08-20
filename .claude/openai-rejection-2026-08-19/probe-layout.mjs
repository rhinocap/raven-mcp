import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
async function call(n, a) {
  const t = s._registeredTools[n];
  const p = t.inputSchema.safeParse(a);
  if (!p.success) return console.log(n, 'SCHEMA-REJECT', p.error.issues[0].message);
  const r = await t.handler(p.data, { signal: new AbortController().signal });
  console.log('===', n, JSON.stringify(a).slice(0,60), 'isError=', r.isError === true);
  console.log(r.content.map(c => c.text).join('\n').slice(0, 300));
}
await call('audit_layout', { elements: [], viewport: { width: 1440, height: 900 } });
await call('audit_content', { items: [] });
await call('audit_typography', { nodes: [] });
await call('audit_ios_privacy', { info_plist: '   \n  ' });
await call('evaluate_design', { description: '' });
