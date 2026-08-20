import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const t = s._registeredTools;
const sig = new AbortController().signal;
async function call(label, name, args) {
  if (!t[name]) { console.log(label.padEnd(48), "TOOL ABSENT"); return; }
  try {
    const r = await t[name].handler(args, { signal: sig });
    const e = r.isError === undefined ? "-" : String(r.isError);
    console.log(label.padEnd(48), "isError", e.padEnd(6), (r.content?.[0]?.text || "").replace(/\s+/g," ").slice(0, 100));
  } catch (err) { console.log(label.padEnd(48), "THREW", err.message.slice(0,70)); }
}
await call("search_knowledge no hits", "search_knowledge", { query: "zzzqqqxyz" });
await call("search_knowledge bogus category", "search_knowledge", { query: "color", category: "zzz" });
await call("get_checklist bogus", "get_checklist", { type: "zzz" });
await call("get_pattern bogus", "get_pattern", { type: "zzz" });
await call("get_principles bogus", "get_principles", { category: "zzz" });
await call("get_research_method bogus", "get_research_method", { method: "zzz" });
await call("get_metrics_framework bogus", "get_metrics_framework", { framework: "zzz" });
await call("list_design_systems bogus category", "list_design_systems", { category: "zzz" });
await call("get_brand_trends bogus", "get_brand_trends", { category: "zzz" });
await call("get_brand_principles bogus", "get_brand_principles", { category: "zzz" });
await call("get_content_principles bogus", "get_content_principles", { category: "zzz" });
await call("list_content_systems", "list_content_systems", {});
await call("get_design_system bogus group", "get_design_system", { id: "linear", group: "zzz" });
