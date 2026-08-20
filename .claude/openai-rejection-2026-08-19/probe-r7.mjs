import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const l = await buildServer({ remote: false });
const sig = new AbortController().signal;
async function call(label, srv, name, args) {
  const t = srv._registeredTools;
  if (!t[name]) { console.log(label.padEnd(44), "TOOL ABSENT"); return; }
  try {
    const r = await t[name].handler(args, { signal: sig });
    const e = r.isError === undefined ? "<ABSENT>" : String(r.isError);
    console.log(label.padEnd(44), "isError", e.padEnd(9), (r.content?.[0]?.text || "").replace(/\s+/g," ").slice(0, 80));
  } catch (err) { console.log(label.padEnd(44), "THREW", err.message.slice(0,70)); }
}
await call("get_brand_system no match", s, "get_brand_system", { company: "zzzqqq" });
await call("get_brand_system stripe OK", s, "get_brand_system", { company: "stripe" });
await call("[local] get_brand_profile missing", l, "get_brand_profile", { id: "zzz" });
await call("[local] get_generation_job missing", l, "get_generation_job", { id: "zzz" });
await call("[local] audit_taste two inputs", l, "audit_taste", { html: "<p>x</p>", text: "x" });
await call("[local] talon_scan no input", l, "talon_scan", {});
