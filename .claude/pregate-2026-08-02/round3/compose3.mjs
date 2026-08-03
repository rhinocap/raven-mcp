// Round 3 composer. Runs the composer on its STRONGEST path, per VERDICT.md
// steps 2+3: real surface binding resolved (project: andrewcunliffe-portfolio,
// the calibration the arena DESIGN.md was derived from) and the decision graph
// scoped to decisions that actually govern this system. Both stores are
// ISOLATED COPIES — Andrew's live ~/.raven is never written.
import { writeFileSync } from 'node:fs';
process.env.RAVEN_NO_USAGE_LOG = '1';
const { buildServer } = await import('/Users/accunliffe/projects/raven-mcp/dist/index.js');
const { FsTasteStore } = await import('/Users/accunliffe/projects/raven-mcp/dist/taste-store.js');
// Explicit remote:false — bare buildServer() falls back to RAVEN_REMOTE.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const call = async (name, args) => JSON.parse(
  (await server._registeredTools[name].handler(args, {})).content[0].text);

const BASE = {
  intent: 'snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss',
  project_dir: '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena',
  profile: 'andrew',
  project: 'andrewcunliffe-portfolio',
};
const out = await call('compose_build_prompt', { ...BASE, ...JSON.parse(process.argv[2] || '{}') });
writeFileSync(process.argv[3], out.prompt);
console.error(JSON.stringify({
  binding: out.surface_binding ?? out.binding ?? null,
  decisions: out.decision_source ?? out.decisions_from ?? null,
  gaps: out.gaps?.length ?? 0,
  keys: Object.keys(out),
}, null, 2));
