import { buildServer } from "../../dist/index.js";
const s = buildServer({ remote: true });
const t = s._registeredTools;
const sig = new AbortController().signal;
async function call(name, args) {
  const tool = t[name];
  if (!tool) return { name, args, err: "NOT REGISTERED" };
  try {
    const r = await tool.handler(args, { signal: sig });
    const txt = (r?.content?.[0]?.text) || "";
    return { name, args, isError: r?.isError === undefined ? "<ABSENT>" : r.isError, len: txt.length, head: txt.slice(0, 200).replace(/\s+/g, " ") };
  } catch (e) { return { name, args, threw: String(e).slice(0, 160) }; }
}
const cases = [
  // --- fixed defect paths: must now be error OR carry an explicit note
  ["get_design_system", { id: "linear", group: "zzz" }],
  ["compose_system", { components: [{ system: "linear", group: "zzz" }] }],
  ["get_principles", { category: "zzz" }],
  ["get_checklist", { type: "zzz" }],
  ["get_brand_principles", { topic: "zzz" }],
  ["get_content_principles", { context: "zzz" }],
  ["list_design_systems", { category: "zzz" }],
  ["list_content_systems", { category: "zzz" }],
  ["get_research_method", { search: "zzz" }],
  // --- success controls: must stay clean, no error, no note
  ["get_design_system", { id: "linear", group: "color" }],
  ["compose_system", { components: [{ system: "linear", group: "color" }] }],
  ["get_principles", { category: "gestalt" }],
  ["get_checklist", { type: "signup form" }],
  ["get_brand_principles", { topic: "logo" }],
  ["get_content_principles", { context: "error messages" }],
  ["list_design_systems", { category: "fintech" }],
  ["list_content_systems", { category: "government" }],
  ["get_research_method", { category: "usability" }],
];
for (const [n, a] of cases) console.log(JSON.stringify(await call(n, a)));
