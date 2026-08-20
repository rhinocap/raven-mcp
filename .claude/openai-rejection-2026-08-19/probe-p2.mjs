import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
async function call(n, args) {
  const t = s._registeredTools[n];
  const p = t.inputSchema.safeParse(args);
  if (!p.success) return { zod: p.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ') };
  const r = await t.handler(p.data, { signal: sig });
  return { isError: r.isError === true, text: r.content[0].text };
}
for (const c of ['', '   ', 'zzzznotacompany']) {
  const r = await call('get_design_system', { company: c });
  if (r.zod) { console.log(`get_design_system company=${JSON.stringify(c)} ZOD-REJECT :: ${r.zod}`); continue; }
  const m = r.text.match(/"?\$?name"?\s*:\s*"([^"]+)"/) || r.text.match(/^#\s*(.+)$/m);
  console.log(`get_design_system company=${JSON.stringify(c)} isError=${r.isError} resolved=${m?m[1]:'?'} :: ${r.text.slice(0,90).replace(/\n/g,' ')}`);
}
const g = await call('generate_design_system', { name: 'Probe', base_system: 'zzzznotasystem' });
console.log(`generate_design_system base_system=zzzznotasystem isError=${g.isError} :: ${g.text.slice(0,200).replace(/\n/g,' ')}`);
