// Round 4 arm A. Calls the REAL compose_build_prompt against the round-4 fixture
// stores. Modeled on round3/compose3.mjs; only the stores and the intent change.
//
// No `skeleton` argument, deliberately. Round 4 has no reference site being copied
// — the task is built from the project's own design system — so the honest branch
// is the grounding half. Handing arm A a caller-authored structure tree the other
// arms cannot have would measure the tree, not the composer.
//
// Andrew's live ~/.raven is never touched: both stores are fixture paths.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = '/Users/accunliffe/projects/raven-mcp';

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_TASTE_HOME = join(HERE, 'taste');
process.env.RAVEN_DECISIONS_HOME = join(HERE, 'arena', '.raven', 'decisions');

const { buildServer } = await import(`${REPO}/dist/index.js`);
const { FsTasteStore } = await import(`${REPO}/dist/taste-store.js`);

// Explicit remote:false — bare buildServer() falls back to RAVEN_REMOTE.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const call = async (name, args) => JSON.parse(
  (await server._registeredTools[name].handler(args, {})).content[0].text);

const out = await call('compose_build_prompt', {
  intent: 'moderation queue: a dense reviewable list with bulk selection, bulk actions, paging, and its empty states',
  project_dir: join(HERE, 'arena'),
  profile: 'kettle',
  project: 'kettle',
});

writeFileSync(process.argv[2], out.prompt);
console.error(JSON.stringify({
  skeleton_required: out.skeleton_required,
  grounding: out.grounding,
  gaps: out.gaps,
  acceptance_count: out.acceptance?.length ?? 0,
  keys: Object.keys(out),
}, null, 2));
