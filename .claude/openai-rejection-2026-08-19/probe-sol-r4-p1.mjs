// Sol P1-1: does audit_contrast with dom_snapshot:[] manufacture an all-clear?
// Measured through the REAL tools/call seam, not by calling the handler.
import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const call = s.server._requestHandlers.get("tools/call");
const CASES = [
  ["audit_contrast", { dom_snapshot: [] }],
  ["audit_contrast", { dom_snapshot: [], url: undefined }],
  ["audit_video_playback", { dom_snapshot: [] }],
  ["audit_page", { dom_snapshot: [] }],
];
for (const [name, args] of CASES) {
  let r;
  try { r = await call({ method: "tools/call", params: { name, arguments: args } }, {}); }
  catch (e) { console.log("REFUSED(zod) " + name, JSON.stringify(args), "::", String(e.message).slice(0, 90)); continue; }
  const txt = r.content.map(c => c.text).join("");
  console.log((r.isError ? "REFUSED     " : "ANSWERED    ") + name, JSON.stringify(args));
  console.log("   " + txt.replace(/\s+/g, " ").slice(0, 260));
}
