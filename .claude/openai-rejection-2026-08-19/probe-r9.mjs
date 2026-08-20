import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const t = s._registeredTools;
const sig = new AbortController().signal;
async function call(label, name, args) {
  try {
    const r = await t[name].handler(args, { signal: sig });
    const e = r.isError === undefined ? "-" : String(r.isError);
    console.log(label.padEnd(46), "isError", e.padEnd(6), (r.content?.[0]?.text || "").replace(/\s+/g," ").slice(0, 95));
  } catch (err) { console.log(label.padEnd(46), "THREW", err.message.slice(0,70)); }
}
await call("get_checklist type=zzz", "get_checklist", { type: "zzz" });
await call("get_checklist type=form (control)", "get_checklist", { type: "form" });
await call("get_principles ctx=ui category=zzz", "get_principles", { context: "ui", category: "zzz" });
await call("get_research_method category=zzz", "get_research_method", { category: "zzz" });
await call("get_research_method search=zzz", "get_research_method", { search: "zzzqqq" });
await call("list_design_systems category=zzz", "list_design_systems", { category: "zzz" });
await call("get_design_system linear group=zzz", "get_design_system", { id: "linear", group: "zzz" });
await call("get_design_system linear group=color", "get_design_system", { id: "linear", group: "color" });
await call("get_brand_principles topic=zzz", "get_brand_principles", { topic: "zzz" });
await call("get_content_principles context=zzz", "get_content_principles", { context: "zzz" });
await call("search_knowledge layer=zzz", "search_knowledge", { query: "color", layer: "zzz" });
