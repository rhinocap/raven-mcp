// R2 acceptance check: every tool on the REMOTE (reviewed) build must carry all
// four annotation hints EXPLICITLY as booleans - never null, never absent.
import { buildServer } from "../../dist/index.js";
const server = await buildServer({ remote: true });
const tools = (await server.server._requestHandlers.get("tools/list")({ method: "tools/list", params: {} }, {})).tools;
const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
let bad = 0;
for (const t of tools) {
  const a = t.annotations || {};
  const missing = HINTS.filter(h => typeof a[h] !== "boolean");
  if (missing.length || typeof a.title !== "string" || !a.title) { bad++; console.log("BAD", t.name, missing.join(","), JSON.stringify(a)); }
}
console.log("tools=" + tools.length, "bad=" + bad);
