/**
 * reference-prompt.test.mjs — Phase 0 of the pattern library
 * (docs/spec-pattern-library.md §12/§13): compose_build_prompt.
 *
 * Drives the REGISTERED tool end-to-end against real FsTasteStore /
 * FsDecisionGraphStore state seeded through the same registered tools a
 * caller would use (create_taste_profile, bind_taste_surface,
 * record_taste_decision, decision_add, decision_contest), then asserts the
 * §13 contract on the composed prompt:
 *   - every in-scope active negative_prompt appears; off/out-of-scope don't
 *   - every design_notes key appears (they are acceptance criteria)
 *   - ≥1 cssVar; zero hex/px literals anywhere in the prompt
 *   - contested decisions land under ## Gaps, active ones under ## Prohibitions
 *   - the no-skeleton branch returns grounding only + the derive instruction
 *   - composing never writes a consultation-trace event (read-path purity)
 *
 * Runs after `npm run build` (imports dist).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RAVEN_NO_USAGE_LOG = '1';
// The consultation-trace purity test below is only meaningful with tracing ON.
delete process.env.RAVEN_NO_CONSULTATION_TRACE;
process.env.RAVEN_AGENT_ID = 'compose-test-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let buildServer, FsTasteStore, getTasteProfile, ruleInScope;
try {
  ({ buildServer } = await import(path.resolve(__dirname, '../dist/index.js')));
  ({ FsTasteStore } = await import(path.resolve(__dirname, '../dist/taste-store.js')));
  ({ getTasteProfile, ruleInScope } = await import(path.resolve(__dirname, '../dist/taste.js')));
} catch (err) {
  const msg = `dist not found - run \`npm run build\` first. (${err.message})`;
  test('reference-prompt modules available', (t) => { t.skip(msg); });
  process.exit(0);
}

// realpathSync: on macOS mkdtemp returns /var/... which is a symlink to
// /private/var/...; the composer compares resolve()d paths as strings, so the
// fixture must hand every store and project the same canonical form.
const tasteHome = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-compose-taste-')));
const decisionsHome = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-compose-decisions-')));
const projectDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-compose-project-')));
process.env.RAVEN_TASTE_HOME = tasteHome;
process.env.RAVEN_DECISIONS_HOME = decisionsHome;

const PROJECT = path.basename(projectDir); // composer defaults project to basename(project_dir)
const PROFILE = 'compose-test';
const SURFACE = 'product notification surface';

// Groups deliberately named type./space./motion.* — those are the prefixes the
// composer's emphasis/density/motion ramps bind against. button omits the
// canonical "loading" state so diff_design_system has a real missing_state to
// surface as a gap; modal matches canonical dialog via its alias.
const DESIGN_MD = `---
colors:
  primary: "#635BFF"
type:
  xs: 12
  sm: 14
  md: 16
  lg: 24
  xl: 40
space:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
motion:
  duration:
    fast: "120ms"
    base: "200ms"
    slow: "400ms"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
components:
  button:
    aliases: [btn, cta]
    states: [hover, focus-visible, active, disabled]
    variants: [primary, secondary]
  modal:
    states: [expanded]
    variants: [modal, sheet]
  snackbar:
    aliases: [toast]
    states: [hover]
---
# Fixture system
`;
writeFileSync(path.join(projectDir, 'DESIGN.md'), DESIGN_MD);

// §9 skeleton exercising every binding rung: alias (snackbar, direct id),
// fuzzy (buttn → button, normalized Levenshtein 0.833), canonical (dialog →
// modal via raven-canonical's dialog aliases), unresolved (sparkline).
// Motion: 210ms snaps to motion.duration.base (200ms, within ±40); 900ms is a
// motion_token_gap. Both easings null (source is not "observed").
const SKELETON = {
  structure: {
    node_id: 'root', role: 'notification region', archetype: 'snackbar',
    containment: 'overlay', order: 0, emphasis: 2, density: 'default',
    children: [
      { node_id: 'action', role: 'dismiss action', archetype: 'buttn', containment: 'inline', order: 1, emphasis: 1, density: 'compact', children: [] },
      { node_id: 'dlg', role: 'detail view', archetype: 'dialog', containment: 'overlay', order: 2, emphasis: 3, density: 'roomy', children: [] },
      { node_id: 'mystery', role: 'decorative flourish', archetype: 'sparkline', containment: 'inline', order: 3, emphasis: 1, density: 'compact', children: [] },
    ],
  },
  states: {
    initial: 'hidden',
    states: [{ name: 'hidden' }, { name: 'visible' }, { name: 'dismissed', terminal: true }],
    transitions: [
      { from: 'hidden', to: 'visible', on: 'trigger', kind: 'inferred' },
      { from: 'visible', to: 'dismissed', on: 'timeout', timeout_ms: 5000, paused_by: ['hover'], kind: 'pattern', pattern_ref: 'mobbin:snackbar-auto-dismiss' },
    ],
  },
  content: [
    { node_id: 'root', slot: 'message', copy: 'Change saved', voice_constraint: 'plain, no exclamation', max_chars: 40, kind: 'designer' },
  ],
  motion: [
    { node_id: 'root', on: 'enter', properties: ['opacity', 'translateY'], from: { opacity: 0, translateY: 16 }, to: { opacity: 1, translateY: 0 }, duration_ms: 210, delay_ms: 0, easing: null, source: 'pattern-knowledge', reduced_motion: 'opacity-only' },
    { node_id: 'root', on: 'exit', properties: ['opacity'], from: { opacity: 1 }, to: { opacity: 0 }, duration_ms: 900, delay_ms: 0, easing: null, source: 'designer', reduced_motion: 'instant' },
  ],
  provenance: [
    { claim: 'Snackbar enters from the bottom edge', kind: 'note', ref_id: 'grab_001' },
  ],
};

const server = buildServer({ remote: false });
const tools = server._registeredTools;

async function call(name, args) {
  return tools[name].handler(args, {});
}
function parse(result) {
  assert.notEqual(result.isError, true, 'unexpected tool error: ' + result.content[0].text);
  return JSON.parse(result.content[0].text);
}

// ── Seed through the registered tools, exactly as a caller would ──
await call('create_taste_profile', {
  name: PROFILE,
  template: 'app',
  rules: [
    { rule_id: 'MOTION-compose-no-bounce', clause_text: 'Motion is quick and functional', category: 'motion', severity_default: 'warn', negative_prompt: 'Do NOT use bounce, spring, or elastic easing' },
    { rule_id: 'LAYOUT-compose-scoped-out', clause_text: 'Marketing pages may use a parallax hero', category: 'layout', severity_default: 'nit', negative_prompt: 'Do NOT stack more than one parallax hero', scope: 'marketing-site' },
    { rule_id: 'VOICE-compose-off', clause_text: 'Body copy stays under 20 words', category: 'voice', severity_default: 'warn', negative_prompt: 'Do NOT exceed twenty words in body copy' },
  ],
});
await call('bind_taste_surface', {
  profile: PROFILE,
  project: PROJECT,
  surface: SURFACE,
  overrides: [{ rule_id: 'VOICE-compose-off', severity: 'off' }],
  voice_note: 'plain register',
  design_notes: { motion: 'quick functional motion', color: 'monochrome with a single accent' },
});
await call('record_taste_decision', {
  profile: PROFILE, project: PROJECT, dimension: 'motion',
  decision: 'fade and rise entrance', rejected: ['bounce'], why: 'bounce reads playful', source: 'user-directed',
});
const activeDecision = parse(await call('decision_add', {
  statement: 'Snackbars auto-dismiss after 5 seconds', rationale: 'support tickets showed lingering toasts',
  scope: 'notifications', component_ref: 'snackbar', alternatives_rejected: ['persistent until dismissed'],
}));
const contestedDecision = parse(await call('decision_add', {
  statement: 'Warnings use amber', scope: 'notifications', component_ref: 'snackbar',
}));
await call('decision_contest', { id: contestedDecision.id, reason: 'conflicts with the monochrome direction' });

// decision_contest itself records a consultation event, so snapshot the trace
// file AFTER seeding — the purity assertion is about compose alone.
const tracePath = path.join(decisionsHome, 'consultations.jsonl');
const traceAfterSeed = existsSync(tracePath) ? readFileSync(tracePath, 'utf8') : null;

test('full composition: every rung bound, prohibitions and gaps carry the stores', async () => {
  const out = parse(await call('compose_build_prompt', {
    intent: 'Copy the Linear-style snackbar', project_dir: projectDir, profile: PROFILE,
    skeleton: SKELETON, reference_url: 'https://linear.app', ref_ids: ['grab_001'],
  }));
  const prompt = out.prompt;

  // Grounding
  assert.equal(out.skeleton_required, false);
  assert.equal(out.grounding.design_md_resolved_via, 'default', 'no .raven/design-system-source.json in the fixture project');
  assert.equal(out.grounding.inventory_source, 'DESIGN.md');
  assert.equal(out.grounding.component_count, 3);
  assert.equal(out.grounding.binding_resolved, true);
  assert.ok(out.grounding.token_count > 0);
  assert.ok(out.grounding.decisions_consulted.includes(activeDecision.id));
  assert.ok(!out.grounding.decisions_consulted.includes(contestedDecision.id), 'a contested decision is no longer active');
  assert.deepEqual(out.grounding.contested_decisions, [contestedDecision.id]);

  // Binding rungs
  const comp = Object.fromEntries(out.bindings.filter((b) => b.kind === 'component').map((b) => [b.node_id, b]));
  assert.equal(comp.root.component, 'snackbar');
  assert.equal(comp.root.confidence, 'alias');
  assert.equal(comp.action.component, 'button');
  assert.equal(comp.action.confidence, 'fuzzy');
  assert.equal(comp.dlg.component, 'modal');
  assert.equal(comp.dlg.confidence, 'canonical');
  assert.equal(comp.mystery.component, null);
  assert.equal(comp.mystery.confidence, 'unresolved');
  // Ramp picks are quantile over the sorted parseable scalars, not declaration order.
  assert.equal(comp.root.emphasis_token, 'type.md');
  assert.equal(comp.root.density_token, 'space.md');

  // Motion snap ±40ms
  const motion = out.bindings.filter((b) => b.kind === 'motion');
  assert.equal(motion.find((b) => b.on === 'enter').duration_token, 'motion.duration.base');
  assert.equal(motion.find((b) => b.on === 'exit').duration_token, null);

  // Gaps: unresolved archetype, motion token gap, diff missing_state on a
  // BOUND component, contested decision, decisions-scope mismatch.
  assert.ok(out.gaps.some((g) => g.includes('sparkline')), 'unresolved archetype gap');
  assert.ok(out.gaps.some((g) => g.startsWith('motion_token_gap: 900ms')), 'motion token gap');
  assert.ok(out.gaps.some((g) => g.includes('(diff_design_system)') && g.toLowerCase().includes('button')), 'diff gap for the bound button missing a canonical state');
  assert.ok(out.gaps.some((g) => g.includes('Contested decision `' + contestedDecision.id + '`') && g.includes('conflicts with the monochrome direction')), 'contested decision is a gap, not a prohibition');
  assert.ok(out.gaps.some((g) => g.startsWith('Decision scope mismatch:')), 'global decision store is outside the fixture project');

  // Prompt sections, in substance
  assert.ok(prompt.startsWith('# Build: Copy the Linear-style snackbar'));
  assert.ok(prompt.includes('(provenance only — never fetched by this tool)'));
  assert.ok(prompt.includes('which is outside the project you named.'));
  assert.ok(prompt.includes('We are **not** copying'));
  assert.ok(prompt.includes('grab_001'));
  assert.ok(prompt.includes('<snackbar> (alias)'));
  assert.ok(prompt.includes('<button> (fuzzy)'));
  assert.ok(prompt.includes('<modal> (canonical)'));
  assert.ok(prompt.includes('no component found in your system'));
  assert.ok(prompt.includes('`hidden` → `visible`'));
  assert.ok(prompt.includes('paused by hover'));
  assert.ok(prompt.includes('[source: pattern mobbin:snackbar-auto-dismiss]'));
  assert.ok(prompt.includes('**source: pattern-knowledge**'));
  assert.ok(prompt.includes('Use `motion.duration.base`.'));
  assert.ok(prompt.includes('Pick the easing from `motion.easing.standard`'));
  assert.ok(prompt.includes('`prefers-reduced-motion`'));
  assert.ok(prompt.includes('"Change saved"'));
  assert.ok(prompt.includes('plain, no exclamation'));

  // Tokens: at least one cssVar, and the closing discipline line.
  assert.match(prompt, /`--[a-z0-9-]+`/);
  assert.ok(prompt.includes('No hex, no px, no font-family literals'));

  // §13: every in-scope, non-off negative_prompt appears — computed from the
  // stored profile with the same ruleInScope the composer uses.
  const store = new FsTasteStore();
  const profile = await getTasteProfile(store, PROFILE);
  const expected = profile.rules.filter((r) => r.negative_prompt && r.rule_id !== 'VOICE-compose-off' && ruleInScope(r, SURFACE));
  assert.ok(expected.some((r) => r.rule_id === 'MOTION-compose-no-bounce'), 'fixture must yield at least the explicit global rule');
  for (const rule of expected) {
    assert.ok(prompt.includes('`' + rule.rule_id + '`: "' + rule.negative_prompt + '"'), 'missing in-scope negative prompt: ' + rule.rule_id);
  }
  assert.ok(!prompt.includes('Do NOT stack more than one parallax hero'), 'out-of-scope rule must not appear');
  assert.ok(!prompt.includes('Do NOT exceed twenty words in body copy'), 'off-override rule must not appear');
  assert.ok(prompt.includes('rejected for motion (taste decision'), 'taste decision rejection');
  assert.ok(prompt.includes('bounce — bounce reads playful'));
  assert.ok(prompt.includes('rejected in the Decision Graph (`' + activeDecision.id + '`'), 'active graph decision rejection');
  assert.ok(prompt.includes('persistent until dismissed'));

  // Acceptance: standing table (A5 present — the skeleton has states) and the
  // design_notes emitted as acceptance criteria (§13 "every design_notes key").
  assert.ok(prompt.includes('## Acceptance criteria'));
  assert.ok(prompt.includes('| A1 |'));
  assert.ok(prompt.includes('| A5 |'));
  assert.ok(prompt.includes('Design notes are acceptance criteria too'));
  assert.ok(prompt.includes('- motion: quick functional motion'));
  assert.ok(prompt.includes('- color: monochrome with a single accent'));

  // Colorless/typeless/sizeless holds for the OUTPUT too: token VALUES are
  // never rendered (paths + cssVars only), so no hex or px literal survives.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(prompt), 'no hex literal anywhere in the prompt');
  assert.ok(!/\b\d+(?:\.\d+)?px\b/i.test(prompt), 'no px literal anywhere in the prompt');
});

test('no-skeleton branch: grounding half only, with the derive instruction', async () => {
  const out = parse(await call('compose_build_prompt', {
    intent: 'Copy the Linear-style snackbar', project_dir: projectDir, profile: PROFILE,
  }));
  assert.equal(out.skeleton_required, true);
  assert.equal(out.skeleton, null);
  assert.deepEqual(out.bindings, []);
  assert.ok(out.prompt.includes('Derive the Structure/States skeleton'));
  assert.ok(!out.prompt.includes('## Structure'));
  assert.ok(!out.prompt.includes('## States'));
  assert.ok(!out.prompt.includes('## Content'));
  assert.ok(out.prompt.includes('## Tokens to use'));
  assert.ok(out.prompt.includes('## Prohibitions'));
  assert.ok(out.prompt.includes('## Acceptance criteria'));
  assert.ok(!out.prompt.includes('| A5 |'), 'no states → no A5 row');
});

test('lint refuses a skeleton that smuggles brand: hex, px, fonts, pixel-kind, non-observed easing', async () => {
  const dirty = {
    structure: {
      node_id: 'root', role: 'hero #FFF000 banner with 24px padding', archetype: 'card',
      containment: 'stack', order: 0, emphasis: 2, density: 'default',
      children: [
        { node_id: 'root', role: 'duplicate id', archetype: 'card', containment: 'stack', order: 1, emphasis: 1, density: 'compact', children: [] },
      ],
    },
    content: [
      { node_id: 'root', slot: 'headline', copy: 'Set in Inter for impact', kind: 'pixel' },
    ],
    motion: [
      { node_id: 'root', on: 'enter', properties: ['opacity'], from: { opacity: 0 }, to: { opacity: 1 }, duration_ms: 200, delay_ms: 0, easing: 'ease-out', source: 'designer', reduced_motion: 'none' },
    ],
  };
  const res = await call('compose_build_prompt', {
    intent: 'dirty skeleton', project_dir: projectDir, profile: PROFILE, skeleton: dirty,
  });
  assert.equal(res.isError, true);
  const text = res.content[0].text;
  assert.match(text, /Skeleton failed lint/);
  assert.match(text, /hex color literal "#FFF000"/);
  assert.match(text, /absolute px literal "24px"/);
  assert.match(text, /duplicate node_id/);
  assert.match(text, /font name "inter"/);
  assert.match(text, /kind "pixel" is not allowed/);
  assert.match(text, /easing must be null unless source is "observed"/);
});

test('failure paths: unknown profile, missing DESIGN.md, unmatched project, unparseable ramps', async () => {
  const unknownProfile = await call('compose_build_prompt', {
    intent: 'x', project_dir: projectDir, profile: 'no-such-profile',
  });
  assert.equal(unknownProfile.isError, true);
  assert.match(unknownProfile.content[0].text, /Taste profile not found/);

  const bareDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-compose-bare-')));
  const noDesign = await call('compose_build_prompt', {
    intent: 'x', project_dir: bareDir, profile: PROFILE,
  });
  assert.equal(noDesign.isError, true);
  assert.match(noDesign.content[0].text, /No readable DESIGN\.md/);
  assert.match(noDesign.content[0].text, /init_design_md/);

  // A project whose DESIGN.md has only ref-chain type tokens, no space/motion
  // groups, and no components: the binding does not match, the inventory is
  // unbound, and neither ramp can bind — all reported as gaps, never invented.
  const refDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-compose-refs-')));
  writeFileSync(path.join(refDir, 'DESIGN.md'), [
    '---',
    'base:',
    '  unit: 8',
    'type:',
    '  sm: "{base.unit}"',
    '  lg: "{base.unit}"',
    '---',
    '# Ref-only fixture',
    '',
  ].join('\n'));
  const minimal = {
    structure: { node_id: 'root', role: 'card', archetype: 'card', containment: 'stack', order: 0, emphasis: 2, density: 'default', children: [] },
  };
  const out = parse(await call('compose_build_prompt', {
    intent: 'x', project_dir: refDir, profile: PROFILE, skeleton: minimal,
  }));
  assert.equal(out.grounding.binding_resolved, false);
  assert.ok(out.gaps.some((g) => g.startsWith('No surface binding matched project')), 'unmatched project is a gap');
  assert.ok(out.gaps.some((g) => g.includes('No component inventory resolved')), 'unbound inventory is a gap');
  assert.ok(out.gaps.some((g) => g.includes('type.* has no parseable numeric ramp')), 'ref-chain ramp cannot bind emphasis');
  assert.ok(out.gaps.some((g) => g.includes('space.* has no parseable numeric ramp')), 'absent space group cannot bind density');
  const root = out.bindings.find((b) => b.kind === 'component');
  assert.equal(root.emphasis_token, null);
  assert.equal(root.density_token, null);
  // Unresolved WITHOUT an archetype gap: with zero components there is nothing
  // to bind against, and the inventory gap already says so once.
  assert.equal(root.confidence, 'unresolved');
  assert.ok(!out.gaps.some((g) => g.includes('Archetype "card"')));
  assert.ok(!out.prompt.includes('| A5 |'));
});

test('composing consults decisions without writing a consultation-trace event', async () => {
  // WEAKER THAN IT LOOKS: this proves compose_build_prompt's read path
  // (listActiveDecisions()/listDecisions() direct) writes nothing — but only
  // because tracing is enabled (RAVEN_NO_CONSULTATION_TRACE deliberately unset
  // at the top of this file) AND the control below proves the same store DOES
  // append on the decision_list tool path. Without the control, a broken or
  // disabled trace pipeline would green-light this test vacuously.
  const before = existsSync(tracePath) ? readFileSync(tracePath, 'utf8') : null;
  assert.equal(before, traceAfterSeed, 'no test above this one may have written a trace event');

  parse(await call('compose_build_prompt', {
    intent: 'trace purity check', project_dir: projectDir, profile: PROFILE, skeleton: SKELETON,
  }));
  const after = existsSync(tracePath) ? readFileSync(tracePath, 'utf8') : null;
  assert.equal(after, before, 'compose must not write consultation events');

  // Control: the decision_list TOOL path appends to the same file.
  await call('decision_list', {});
  assert.ok(existsSync(tracePath), 'control: decision_list must create/extend the trace');
  const control = readFileSync(tracePath, 'utf8');
  assert.ok(control.length > (before ? before.length : 0), 'control: the trace grew on the tool path');
  const lastEvent = JSON.parse(control.trim().split('\n').pop());
  assert.equal(lastEvent.tool, 'decision_list');
});
