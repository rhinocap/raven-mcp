import { buildServer } from "../../dist/index.js";
const s = buildServer({ remote: true });
const reg = s._registeredTools;
async function call(n, a) { try { return await reg[n].handler(a, { signal: new AbortController().signal }); } catch (e) { return { __threw: String(e.message||e) }; } }
function j(r){ const t=r&&r.content&&r.content[0]&&r.content[0].text; return {isError: r&&('isError' in r)?r.isError:'<ABSENT>', text:(t||JSON.stringify(r)).slice(0,200)}; }

console.log("== compose_system schema keys ==");
console.log(Object.keys(reg.compose_system.inputSchema || {}));
console.log(JSON.stringify(reg.compose_system.inputSchema).slice(0,400));
console.log("compose_system {}          ", JSON.stringify(j(await call("compose_system", {}))));
console.log("compose_system {system:zzz}", JSON.stringify(j(await call("compose_system", {system:"zzz"}))));
console.log("compose_system {base:zzz}  ", JSON.stringify(j(await call("compose_system", {base_system:"zzz"}))));

console.log("\n== get_metrics_framework schema ==");
console.log(JSON.stringify(reg.get_metrics_framework.inputSchema).slice(0,300));
console.log("gmf {id:zzz}", JSON.stringify(j(await call("get_metrics_framework", {id:"zzz"}))));

console.log("\n== descriptions: url mentions ==");
for (const n of ["audit_page","score_page","audit_typography"]) {
  const d = reg[n].description || "";
  const hits = d.split(/(?<=\.)\s+/).filter(x=>/url/i.test(x));
  console.log("###", n, "(len", d.length + ")");
  hits.forEach(h=>console.log("   *", h.trim().slice(0,300)));
}
console.log("\n== audit_page finding shape ==");
const ap = await call("audit_page", { html: "<html><body><p style='font-size:9px'>x</p><div onclick='x'>y</div></body></html>" });
const t = ap.content && ap.content[0] && ap.content[0].text;
try { const o = JSON.parse(t); const f=(o.issues||o.findings||[]); console.log("n=",f.length,"keys:", f.length?Object.keys(f[0]).join(","):"-"); console.log(JSON.stringify(f.slice(0,2))); }
catch { console.log("raw:", (t||"").slice(0,400)); }
