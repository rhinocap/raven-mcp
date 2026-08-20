// The direct-handler sweep reported audit_contrast and audit_video_playback
// THROWING on empty args. That is only a real defect if the throw survives the
// REAL seam, which runs inputSchema.safeParse before the handler. Measure it.
import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const list = (await s.server._requestHandlers.get("tools/list")({ method:"tools/list", params:{} }, {})).tools;
const call = s.server._requestHandlers.get("tools/call");
const CASES = [
  ["audit_contrast", {}], ["audit_contrast", { elements: [] }],
  ["audit_video_playback", {}], ["audit_video_playback", { observations: [] }],
  ["audit_content", { items: [] }], ["audit_typography", { nodes: [] }],
  ["audit_parity", { ios: [], android: [] }], ["evaluate_design", { design_description: "   " }],
];
for (const [name, args] of CASES) {
  if (!list.find(t => t.name === name)) { console.log("ABSENT  ", name); continue; }
  let out;
  try { out = await call({ method:"tools/call", params:{ name, arguments: args } }, {}); }
  catch (e) { console.log("THREW   ", name, JSON.stringify(args), "::", String(e.message).slice(0,90)); continue; }
  const txt = out?.content?.[0]?.text || "";
  const grade = /"grade"\s*:\s*"([^"]+)"/.exec(txt), score = /"score"\s*:\s*([0-9.]+)/.exec(txt);
  console.log(out?.isError ? "REFUSED " : "ANSWERED", name, JSON.stringify(args),
    "grade=" + (grade?grade[1]:"none"), "score=" + (score?score[1]:"none"), "::", txt.replace(/\s+/g," ").slice(0,95));
}
