// Measures ONE surface per process: setRemoteRuntime() is a one-way latch.
// argv[2] = "stdio" | "anon" | "authed"
import { createHash } from "node:crypto";
const mode = process.argv[2];
const { buildServer } = await import("../../dist/index.js");
const { FsTasteStore } = await import("../../dist/taste-store.js");
let server;
if (mode === "stdio") server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
else if (mode === "anon") server = buildServer({ remote: true });
else if (mode === "authed") server = buildServer({ remote: true, tasteStore: new FsTasteStore(), userId: "probe-user" });
else throw new Error("bad mode");

const tools = await (async () => {
  const reg = server._registeredTools || server.server?._registeredTools;
  if (reg) return Object.keys(reg).sort().map(n => ({ name: n, annotations: reg[n].annotations }));
  throw new Error("cannot read registered tools");
})();

const names = tools.map(t => t.name).sort();
const hash = createHash("sha256").update(names.join("\n")).digest("hex");
const missing = tools.filter(t => {
  const a = t.annotations || {};
  return ["readOnlyHint","destructiveHint","idempotentHint","openWorldHint"]
    .some(k => typeof a[k] !== "boolean");
}).map(t => t.name);
const openWorld = tools.filter(t => t.annotations?.openWorldHint === true).map(t => t.name);
const writers = tools.filter(t => t.annotations?.readOnlyHint === false).map(t => t.name);
console.log(JSON.stringify({
  mode, count: tools.length, hash,
  null_or_missing_hints: missing,
  openWorld_count: openWorld.length, openWorld,
  nonReadOnly_count: writers.length,
  generate_design_system: tools.find(t => t.name === "generate_design_system")?.annotations || null,
  bind_taste_surface: tools.find(t => t.name === "bind_taste_surface")?.annotations || null,
  talon_scan: tools.find(t => t.name === "talon_scan")?.annotations || null
}, null, 2));
process.exit(0);
