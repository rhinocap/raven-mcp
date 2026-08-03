// Round-2 composition: identical inputs to round 1 EXCEPT skeleton undo-action emphasis 3 -> 1
// (matching docs/spec-pattern-library.md's own snackbar example, which uses [emphasis 1] for the action).
// The composer (src/reference-prompt.ts) is byte-unchanged. Taste store is READ-ONLY.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const base = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const round2 = path.join(base, 'round2');

const { buildServer } = await import('/Users/accunliffe/projects/raven-mcp/dist/index.js');
const { FsTasteStore } = await import('/Users/accunliffe/projects/raven-mcp/dist/taste-store.js');

// NOTE: buildServer({remote:false}) explicitly — bare buildServer() falls back to
// process.env.RAVEN_REMOTE and would silently measure the remote server.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const skeleton = JSON.parse(readFileSync(path.join(round2, 'skeleton-fair.json'), 'utf8'));

const res = await server._registeredTools.compose_build_prompt.handler({
  intent: 'Snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss',
  project_dir: path.join(base, 'arena'),
  profile: 'andrew',
  surface: 'portfolio editor surface',
  skeleton,
}, {});

if (res.isError) { console.error('COMPOSE ERROR:', res.content[0].text); process.exit(1); }
const out = JSON.parse(res.content[0].text);
writeFileSync(path.join(round2, 'composed-fair.json'), JSON.stringify(out, null, 2));
writeFileSync(path.join(round2, 'composed-prompt-fair.md'), out.prompt);
console.log('gaps:', out.gaps.length);
for (const g of out.gaps) console.log('  -', g);
console.log('bindings:', out.bindings.map(b => `${b.kind}:${b.node_id ?? ''}→${b.resolved ?? b.token ?? ''}(${b.confidence ?? ''})`).join(', '));
console.log('prompt chars:', out.prompt.length);
