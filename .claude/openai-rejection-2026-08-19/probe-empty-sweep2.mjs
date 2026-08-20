import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
const s = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const sig = new AbortController().signal;
const targets = ['audit_consistency','audit_content','audit_contrast','audit_parity','audit_responsive_visibility','audit_typography','audit_url','audit_video_playback','evaluate_design'];
for (const n of targets) {
  const t = s._registeredTools[n];
  if (!t) { console.log(`MISSING ${n}`); continue; }
  console.log(`--- ${n}: params=[${Object.keys(t.inputSchema?.shape ?? {}).join(', ')}]`);
}
