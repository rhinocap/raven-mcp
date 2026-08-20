import { buildServer } from "../../dist/index.js";
import { FsTasteStore } from "../../dist/taste-store.js";
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const t = server._registeredTools["evaluate_design"];
const cases = [
  ["REFUSE-expected: {}", {}],
  ["REFUSE-expected: goals only", { goals: ["accessibility"] }],
  ["REFUSE-expected: goals+context, no description", { goals: ["accessibility"], context: "checkout form" }],
  ["REFUSE-expected: blank description", { description: "   \n  " }],
  ["ALLOW-expected: real description", { description: "a login screen with a blue button" }],
  ["ALLOW-expected: description + goals + context", { description: "a login screen", goals: ["clarity"], context: "onboarding" }],
];
for (const [label, p] of cases) {
  const r = await t.handler(t.inputSchema.parse(p), { signal: new AbortController().signal });
  const txt = r.content[0].text;
  let tp = "n/a";
  try { tp = String(JSON.parse(txt).total_principles); } catch {}
  console.log(`${r.isError === true ? "REFUSED" : "allowed"}  total_principles=${tp}  ${label}`);
}
