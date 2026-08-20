import { buildServer } from "../../dist/index.js";
const s = buildServer({ remote: true });
const reg = s._registeredTools;
async function call(name, args) {
  const t = reg[name];
  if (!t) return { __missing: true };
  try { return await t.handler(args, { signal: new AbortController().signal }); }
  catch (e) { return { __threw: String(e && e.message || e) }; }
}
function j(r) {
  const txt = r && r.content && r.content[0] && r.content[0].text;
  return { isError: r && Object.prototype.hasOwnProperty.call(r, "isError") ? r.isError : "<ABSENT>", text: (txt||"").slice(0,220) };
}
const names = Object.keys(reg).sort();
console.log("TOOLS", names.length);
// hint census
let missing = 0, ow = [];
for (const n of names) {
  const a = reg[n].annotations || {};
  for (const k of ["readOnlyHint","destructiveHint","idempotentHint","openWorldHint"])
    if (typeof a[k] !== "boolean") { missing++; console.log("NONBOOL", n, k, String(a[k])); }
  if (a.openWorldHint === true) ow.push(n);
}
console.log("HINTS missing/nonbool:", missing);
console.log("OPENWORLD count:", ow.length, ow.join(","));

console.log("\n--- F2 negative fixtures ---");
console.log("audit_page{}       ", JSON.stringify(j(await call("audit_page", {}))));
console.log("suggest_contrast_fix{pairs:[]}", JSON.stringify(j(await call("suggest_contrast_fix", { pairs: [] }))));

console.log("\n--- F3 score_page html contrast ---");
const sp = await call("score_page", { html: "<html><body><p style='color:#777;background:#fff'>hi</p></body></html>" });
const spt = sp.content && sp.content[0] && sp.content[0].text;
try { const o = JSON.parse(spt); console.log("contrast:", JSON.stringify(o.contrast)); }
catch { console.log("raw:", (spt||"").slice(0,300)); }

console.log("\n--- F6 soft error paths ---");
console.log("compose_system unknown ", JSON.stringify(j(await call("compose_system", { system: "zzz-nope" }))));
console.log("audit_ios_privacy empty", JSON.stringify(j(await call("audit_ios_privacy", {}))));
console.log("get_metrics_framework  ", JSON.stringify(j(await call("get_metrics_framework", { framework: "zzz-nope" }))));

console.log("\n--- F1 descriptions ---");
for (const n of ["audit_page","score_page","audit_typography"]) {
  const d = reg[n] && (reg[n].description || "");
  console.log(n, "::", d.slice(0,240).replace(/\n/g," "));
}
