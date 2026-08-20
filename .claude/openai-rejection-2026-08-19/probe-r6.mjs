import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const t = s._registeredTools;
const sig = new AbortController().signal;
async function call(label, name, args) {
  if (!t[name]) { console.log(label.padEnd(46), "TOOL ABSENT ON REMOTE SURFACE"); return; }
  try {
    const r = await t[name].handler(args, { signal: sig });
    const e = r.isError === undefined ? "<ABSENT>" : String(r.isError);
    console.log(label.padEnd(46), "isError", e.padEnd(9), (r.content?.[0]?.text || "").replace(/\s+/g," ").slice(0, 90));
  } catch (err) { console.log(label.padEnd(46), "THREW", err.message.slice(0,80)); }
}
await call("get_business_strategy zzz", "get_business_strategy", { type: "zzz" });
await call("get_business_strategy monetization OK", "get_business_strategy", { type: "monetization" });
await call("get_d4d_framework", "get_d4d_framework", {});
await call("get_design_system zzz", "get_design_system", { id: "zzz" });
await call("get_design_system linear OK", "get_design_system", { id: "linear" });
await call("get_brand_system zzz", "get_brand_system", { url: "https://zzz.invalid" });
await call("get_content_system zzz", "get_content_system", { id: "zzz" });
await call("get_content_pattern zzz", "get_content_pattern", { type: "zzz" });
await call("get_service_pattern zzz", "get_service_pattern", { type: "zzz" });
await call("get_service_standard", "get_service_standard", {});
await call("audit_consistency 1 page", "audit_consistency", { pages: [{ name: "a", html: "<p>x</p>" }] });
await call("audit_taste two inputs", "audit_taste", { html: "<p>x</p>", text: "x" });
await call("talon_scan no input", "talon_scan", {});
