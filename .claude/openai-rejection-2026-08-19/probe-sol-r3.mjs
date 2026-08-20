import { buildServer } from "../../dist/index.js";
const sig = new AbortController().signal;
const s = buildServer({ remote: true });
async function call(name, args) {
  const t = s._registeredTools[name];
  if (!t) return "NOT REGISTERED";
  const p = t.inputSchema.safeParse(args);
  if (!p.success) return "SCHEMA-REJECTED: " + p.error.issues.map(i=>i.path.join(".")+":"+i.code).slice(0,3).join(", ");
  let r;
  try { r = await t.handler(p.data, { signal: sig }); }
  catch (e) { return "THREW: " + String(e.message).slice(0,120); }
  const text = r.content.map(c=>c.text).join("\n");
  let head = text.slice(0,160).replace(/\s+/g," ");
  return (r.isError ? "isError:TRUE  " : "isError:false ") + head;
}
const cases = [
  ["audit_screen empty",      "audit_screen",      { elements: [], viewport: { w:393, h:852 } }],
  ["audit_ios_screen empty",  "audit_ios_screen",  { elements: [], viewport: { w:393, h:852 } }],
  ["audit_page blank html",   "audit_page",        { html: "" }],
  ["audit_page ws html",      "audit_page",        { html: "   \n " }],
  ["score_creative blank",    "score_creative",    { creative_text: "" }],
  ["score_creative ws",       "score_creative",    { creative_text: "   " }],
  ["generate_design_system blank name", "generate_design_system", { name: "" }],
  ["generate_service_blueprint blank",  "generate_service_blueprint", { service_name: "", current: [] }],
  ["compose_system empty",    "compose_system",    { compositions: [] }],
];
for (const [label, name, args] of cases) {
  console.log(label.padEnd(36), "|", await call(name, args));
}
