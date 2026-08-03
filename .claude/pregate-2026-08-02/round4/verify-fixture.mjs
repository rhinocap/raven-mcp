// Round-4 fixture verification.
//
// The fixture is only a fixture if Raven's OWN code paths can read it. Reading the JSON
// back with require() proves nothing — it proves the file parses. This drives the real
// loaders, the same ones the arms will hit through MCP.
//
// Run:  node .claude/pregate-2026-08-02/round4/verify-fixture.mjs
// Must be run from inside the repo (ESM resolves imports from the script's own location).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

process.env.RAVEN_TASTE_HOME = join(HERE, 'taste');
process.env.RAVEN_DECISIONS_HOME = join(HERE, 'arena', '.raven', 'decisions');
process.env.RAVEN_NO_USAGE_LOG = '1';

const taste = await import(join(REPO, 'dist', 'taste.js'));
const tasteStoreMod = await import(join(REPO, 'dist', 'taste-store.js'));
const graph = await import(join(REPO, 'dist', 'decision-graph.js'));

let fail = 0;
const ok = (cond, label, detail) => {
  if (!cond) fail++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
};

// ---- taste store -----------------------------------------------------------
const store = new tasteStoreMod.FsTasteStore();
const graphStore = new graph.FsDecisionGraphStore();

const profile = await taste.getTasteProfile(store, 'kettle');
ok(profile.rules.length === 18, 'profile loads through getTasteProfile', `${profile.rules.length} rules`);
ok(profile.rules.every((r) => r.scope === 'kettle'), 'every rule scoped to kettle');
ok(
  profile.rules.some((r) => r.rule_id === 'COLOR-depth-not-lightness'),
  'the surface-ramp trap rule is present',
);

const bindings = await taste.listSurfaceBindings(store, 'kettle');
ok(bindings.length === 1, 'one surface binding', `project=${bindings[0]?.project}`);
ok(
  typeof bindings[0]?.design_notes?.motion === 'string' && bindings[0].design_notes.motion.includes('160ms'),
  'design_notes reach the loader intact',
);
ok(
  bindings[0]?.voice_note?.includes('12 selected'),
  'voice_note carries the count-first pattern',
);

// resolveSurfaceBinding is what the composer and audit_taste actually call.
const resolved = await taste.resolveSurfaceBinding(store, 'kettle', { project: 'kettle' });
ok(resolved != null && resolved.project === 'kettle', 'resolveSurfaceBinding(project) resolves');

const decisions = await taste.listTasteDecisions(store, 'kettle', { project: 'kettle' });
const decList = Array.isArray(decisions) ? decisions : decisions?.decisions || [];
ok(decList.length === 5, 'list_taste_decisions returns the 5 dimension decisions', `${decList.length}`);
ok(
  decList.some((d) => d.decision.includes('40px') && d.dimension === 'spacing'),
  'the 40px gutter decision is reachable',
);
ok(
  decList.some((d) => d.decision.includes('8 seconds')),
  'the 8s undo dismissal is reachable',
);

// ---- decision graph --------------------------------------------------------
const activeArr = await graphStore.listDecisions('active');
ok(activeArr.length === 6, 'decision_list(status=active) returns 6', `${activeArr.length}`);

const contestedArr = await graphStore.listDecisions('contested');
ok(contestedArr.length === 1, 'decision_list(status=contested) returns 1', `${contestedArr.length}`);
ok(
  contestedArr[0]?.id === 'dec_destructive_label',
  'the contested decision is the destructive label',
);

// THE TRAP, asserted rather than assumed: the no-status path must NOT surface the
// contested decision. If this fails, the sharpest A-vs-B2 discriminator does not exist
// and the pre-registration has to be rewritten before any build runs.
// This is exactly what decision_list does when `status` is omitted (src/index.ts:7011).
const noStatusArr = await graphStore.listActiveDecisions();
const contestedInDefault = noStatusArr.some((d) => d.id === 'dec_destructive_label');
ok(
  !contestedInDefault,
  'default decision_list() hides the contested decision (the B2 trap)',
  `default returned ${noStatusArr.length}`,
);

ok(
  activeArr.every((d) => Array.isArray(d.alternatives_rejected) && d.alternatives_rejected.length > 0),
  'every active decision carries alternatives_rejected[]',
);

// ---- DESIGN.md -------------------------------------------------------------
const design = readFileSync(join(HERE, 'arena', 'DESIGN.md'), 'utf8');
for (const name of ['ds-queue-row', 'ds-select-cell', 'ds-action-rail', 'ds-status-pill', 'ds-load-more', 'ds-undo-strip', 'ds-empty-rest']) {
  ok(design.includes(name), `DESIGN.md declares ${name}`);
}
ok(!/\b(18|24)\b:/.test(design.split('---')[1] || ''), 'no 18/24 type step in the frontmatter');

// ---- the facts that must NOT be reachable from DESIGN.md + profile ---------
// If a discriminating fact leaks into DESIGN.md or the rule catalog, arm B1 can reach it
// and it stops discriminating. This is the check that makes the primary endpoint honest.
const b1Reachable = design + JSON.stringify(profile) + JSON.stringify(bindings);
const mustNotLeak = [
  ['bottom-anchored / rail position', /bottom-anchored|floating bar|normal flow/i],
  ['no confirmation dialog', /confirmation dialog|confirm modal|no confirm/i],
  ['infinite scroll rejection', /infinite scroll/i],
  ['selection survives paging', /survives|persists across|span pages/i],
  ['DOM order before list', /DOM order/i],
  ['indeterminate header', /indeterminate|tri-state/i],
  ['contested label', /Reject|contested/i],
  ['rail keeps idle height', /idle state|keeps its full height/i],
  ['outlined not filled pill', /outlined pill|filled chip/i],
  ['undo copy pattern', /held\. Undo|cleared\. Undo/i],
  ['8s auto-dismiss', /8 second|8s/i],
  ['40px gutter', /gutter|fixed 40px/i],   // NOT bare /40px/: --space-slack is legitimately 40px
];
console.log('\nLEAK CHECK — these must be absent from DESIGN.md + profile + binding:');
for (const [label, re] of mustNotLeak) {
  const leaked = re.test(b1Reachable);
  if (leaked) fail++;
  console.log(`${leaked ? ' LEAK ' : '  ok  '} ${label}`);
}

console.log(`\n${fail === 0 ? 'FIXTURE OK' : `FIXTURE HAS ${fail} PROBLEM(S)`}`);
process.exit(fail === 0 ? 0 : 1);
