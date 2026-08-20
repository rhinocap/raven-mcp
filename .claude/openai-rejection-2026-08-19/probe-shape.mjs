import { buildServer } from "../../dist/index.js";
const s = buildServer({ remote: true });
const t = s._registeredTools["audit_page"];
console.log("keys:", Object.keys(t));
console.log("cb len:", t.callback && t.callback.length);
const r = await t.callback({}, { signal: new AbortController().signal });
console.log("RAW:", JSON.stringify(r).slice(0, 600));
