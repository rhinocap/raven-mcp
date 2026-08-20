import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const t = s._registeredTools;
const sig = new AbortController().signal;
async function call(name, args) {
  const r = await t[name].handler(args, { signal: sig });
  return { isError: r.isError === undefined ? "<ABSENT>" : r.isError, text: (r.content?.[0]?.text || "").slice(0, 180) };
}
console.log("compose_system unknown system:", JSON.stringify(await call("compose_system", { compositions: [{ system: "zzz", group: "color" }] })));
console.log("compose_system bogus group  :", JSON.stringify(await call("compose_system", { compositions: [{ system: "linear", group: "zzz" }] })));
console.log("compose_system VALID        :", JSON.stringify(await call("compose_system", { compositions: [{ system: "linear", group: "color" }] })));
console.log("audit_ios_privacy empty     :", JSON.stringify(await call("audit_ios_privacy", {})));
console.log("audit_ios_privacy bad json  :", JSON.stringify(await call("audit_ios_privacy", { app_json: "{not json" })));
console.log("get_metrics_framework zzz   :", JSON.stringify(await call("get_metrics_framework", { id: "zzz" })));
console.log("get_metrics_framework heart :", JSON.stringify(await call("get_metrics_framework", { id: "heart" })));
