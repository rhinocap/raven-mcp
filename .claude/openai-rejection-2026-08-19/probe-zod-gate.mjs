// Calling t.handler() bypasses zod, so a throw there is only a REAL defect if the
// declared inputSchema ACCEPTS the same args. This parses first, then calls the
// handler with zod's own parsed output - the exact value the MCP path delivers.
import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
const CASES = [
  ['audit_contrast', { dom_snapshot: { nodes: [] } }],
  ['audit_contrast', { dom_snapshot: { elements: [] } }],
  ['audit_contrast', { dom_snapshot: {} }],
  ['audit_video_playback', { dom_snapshot: { videos: [] } }],
  ['audit_video_playback', { dom_snapshot: {} }],
  ['audit_video_playback', { dom_snapshot: { observations: [] } }]
];
for (const [n, args] of CASES) {
  const t = s._registeredTools[n];
  const parsed = t.inputSchema.safeParse(args);
  if (!parsed.success) {
    console.log(`ZOD-REJECT  ${n} ${JSON.stringify(args)} :: ${parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ').slice(0,120)}`);
    continue;
  }
  try {
    const r = await t.handler(parsed.data, { signal: sig });
    const text = r.content[0].text;
    console.log(`OK-RETURN   ${n} ${JSON.stringify(args)} isError=${r.isError===true} :: ${text.slice(0,90).replace(/\n/g,' ')}`);
  } catch (e) {
    console.log(`REAL-THROW  ${n} ${JSON.stringify(args)} :: ${e.constructor.name}: ${String(e.message).slice(0,90)}`);
  }
}
