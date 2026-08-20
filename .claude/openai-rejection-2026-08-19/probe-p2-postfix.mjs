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
console.log("--- get_brand_system ---");
for (const c of ["", "   ", "zzzznotacompany", "Stripe", "spotify"]) {
  const r = await call("get_brand_system", { company: c });
  console.log(`company=${JSON.stringify(c)} isError=${r.isError} :: ${r.text.replace(/\s+/g," ").slice(0,120)}`);
}
console.log("--- generate_design_system ---");
for (const b of ["zzzznotasystem", undefined, "stripe"]) {
  const r = await call("generate_design_system", { name: "Probe Design System", base_system: b, format: "dtcg" });
  console.log(`base_system=${JSON.stringify(b)} isError=${r.isError} :: ${r.text.replace(/\s+/g," ").slice(0,120)}`);
}
