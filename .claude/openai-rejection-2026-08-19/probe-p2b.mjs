import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
for (const c of ['', '   ', 'zzzznotacompany', 'Stripe']) {
  const t = s._registeredTools['get_brand_system'];
  const p = t.inputSchema.safeParse({ company: c });
  if (!p.success) { console.log(`company=${JSON.stringify(c)} ZOD-REJECT`); continue; }
  const r = await t.handler(p.data, { signal: sig });
  const text = r.content[0].text;
  const m = text.match(/^#\s*(.+)$/m) || text.match(/"\$name"\s*:\s*"([^"]+)"/);
  console.log(`company=${JSON.stringify(c).padEnd(20)} isError=${r.isError===true} resolved=${m?m[1].trim():'?'}`);
}
