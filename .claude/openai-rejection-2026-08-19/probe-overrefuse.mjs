import { buildServer } from "../../dist/index.js";
const sig = new AbortController().signal;
const s = buildServer({ remote: true });
async function call(name, args) {
  const t = s._registeredTools[name];
  const p = t.inputSchema.safeParse(args);
  if (!p.success) return "SCHEMA-REJECTED " + p.error.issues.map(i=>i.path.join("."));
  let r; try { r = await t.handler(p.data, { signal: sig }); } catch (e) { return "THREW: " + e.message.slice(0,100); }
  return (r.isError ? "REFUSED(bad!) " : "ok ") + r.content.map(c=>c.text).join("").slice(0,90).replace(/\s+/g," ");
}
const el = { label: "Start", rect: { x:24, y:720, w:345, h:50 }, role:"button", fontPt:17, fgColor:"#FFFFFF", bgColor:"#5B3FC4" };
console.log("audit_screen real   |", await call("audit_screen", { elements:[el], viewport:{w:393,h:852} }));
console.log("audit_ios_screen    |", await call("audit_ios_screen", { elements:[el], viewport:{w:393,h:852} }));
console.log("audit_screen shape  |", await call("audit_screen", { viewport:{w:393,h:852} }));
console.log("audit_page real     |", await call("audit_page", { html:"<html><body><h1 style='font-size:32px'>Hi</h1><p style='font-size:16px'>Body copy here.</p></body></html>" }));
console.log("score_creative real |", await call("score_creative", { creative_text:"Ship design decisions your agents can actually read." }));
console.log("gen_ds real         |", await call("generate_design_system", { name:"Acme" }));
console.log("blueprint real      |", await call("generate_service_blueprint", { service_name:"Onboarding", current:[{ label:"Sign up", stage:"onboard" }] }));
console.log("compose real        |", await call("compose_system", { compositions:[{ system:"stripe", group:"color" }] }));
