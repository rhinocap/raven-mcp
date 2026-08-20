import { buildServer } from "../../dist/index.js";
import { FsTasteStore } from "../../dist/taste-store.js";
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const signal = new AbortController().signal;
async function call(name, args) {
  const t = server._registeredTools[name];
  const p = t.inputSchema.safeParse(args);
  if (!p.success) return { zod: p.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; ") };
  const r = await t.handler(p.data, { signal });
  return { isError: r.isError === true, text: r.content[0].text };
}
for (const c of ["", "   ", "zzzznotacompany", "Stripe"]) {
  const r = await call("get_brand_system", { company: c });
  if (r.zod) { console.log(`company=${JSON.stringify(c)} ZOD-REJECT :: ${r.zod}`); continue; }
  const head = r.text.replace(/\s+/g," ").slice(0,160);
  console.log(`company=${JSON.stringify(c)} isError=${r.isError} :: ${head}`);
}
