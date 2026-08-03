// Round 3 derive runner: calls compose_build_prompt WITH the derived skeleton,
// on the same store resolution grounding.md was produced from (live read-only
// taste store — compose_build_prompt is readOnly and never writes — plus the
// round3 isolated decision store).
import { readFileSync, writeFileSync } from 'node:fs';
process.env.RAVEN_NO_USAGE_LOG = '1';
const ROUND3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3';
process.env.RAVEN_DECISIONS_HOME = ROUND3 + '/decisions';

const { buildServer } = await import('/Users/accunliffe/projects/raven-mcp/dist/index.js');
const { FsTasteStore } = await import('/Users/accunliffe/projects/raven-mcp/dist/taste-store.js');
// Explicit remote:false — bare buildServer() falls back to RAVEN_REMOTE.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const call = async (name, args) =>
  (await server._registeredTools[name].handler(args, {})).content[0].text;

const { skeleton } = JSON.parse(readFileSync(ROUND3 + '/skeleton-derived.json', 'utf8'));

const raw = await call('compose_build_prompt', {
  intent: 'snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss',
  project_dir: '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena',
  profile: 'andrew',
  project: 'arena',
  skeleton,
});

let out;
try { out = JSON.parse(raw); } catch {
  console.log('LINT_FAILED_OR_ERROR\n' + raw);
  process.exit(1);
}
if (out.error || /failed lint/i.test(raw)) {
  console.log('LINT_FAILED\n' + JSON.stringify(out, null, 2));
  process.exit(1);
}
writeFileSync(ROUND3 + '/derived-prompt.md', out.prompt);
console.log(JSON.stringify({
  lint_clean: true,
  binding_resolved: out.grounding?.binding_resolved,
  component_count: out.grounding?.component_count,
  bindings: out.bindings,
  gaps: out.gaps,
}, null, 2));
