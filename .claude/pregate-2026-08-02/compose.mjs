import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const base = '/private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate';
const { buildServer } = await import('/Users/accunliffe/projects/raven-mcp/dist/index.js');
const { FsTasteStore } = await import('/Users/accunliffe/projects/raven-mcp/dist/taste-store.js');

const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const skeleton = JSON.parse(readFileSync(path.join(base, 'skeleton.json'), 'utf8'));

const res = await server._registeredTools.compose_build_prompt.handler({
  intent: 'Snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss',
  project_dir: path.join(base, 'arena'),
  profile: 'andrew',
  surface: 'portfolio editor surface',
  skeleton,
}, {});

if (res.isError) { console.error('COMPOSE ERROR:', res.content[0].text); process.exit(1); }
const out = JSON.parse(res.content[0].text);
writeFileSync(path.join(base, 'composed.json'), JSON.stringify(out, null, 2));
writeFileSync(path.join(base, 'composed-prompt.md'), out.prompt);
console.log('gaps:', out.gaps.length);
for (const g of out.gaps) console.log(' -', g);
console.log('bindings:', out.bindings.map(b => `${b.kind}:${b.node_id ?? ''}→${b.resolved ?? b.token ?? ''}(${b.confidence ?? ''})`).join(', '));
console.log('prompt chars:', out.prompt.length);
