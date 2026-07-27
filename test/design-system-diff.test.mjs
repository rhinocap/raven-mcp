import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const diff = await import('../dist/design-system-diff.js');
const fixture = path.join(__dirname, 'fixtures/design-system/DESIGN.md');

test('taxonomy and Raven canonical baseline load', () => {
  const taxonomy = diff.loadTaxonomy();
  const baseline = diff.loadBaseline('raven-canonical');
  assert.equal(taxonomy.states.hover.applies.includes('touch'), false);
  assert.equal(baseline.label, 'Raven canonical baseline');
  assert.equal(baseline.provenance.source, 'raven-curated');
  assert.ok(baseline.components.length >= 12);
  assert.throws(() => diff.loadBaseline('material'), /Available: raven-canonical/);
});

test('config writes, reads, and rejects unsupported kinds', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-ds-'));
  const config = diff.configureSource(dir, { source: { kind: 'design-file', path: 'DESIGN.md' }, platform: 'web-pointer', aliases: { cta: 'button' } });
  assert.deepEqual(diff.readSourceConfig(dir), config);
  assert.throws(() => diff.configureSource(dir, { source: { kind: 'figma', path: 'x' }, platform: 'web-pointer' }), /figma not yet supported/);
});

test('token-only DESIGN.md reports unknown coverage, never missing components', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-ds-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await import('node:fs/promises').then((fs) => fs.writeFile(designPath, '---\ncolors:\n  primary: black\n---\nBody'));
  const report = diff.diffDesignSystem(diff.inventoryFromDesignMd(designPath), 'raven-canonical', { platform: 'web-pointer' });
  assert.equal(report.coverage.components.pct, null);
  assert.equal(report.errors.some((finding) => finding.type === 'missing_component'), false);
  assert.match(report.summary, /unknown/i);
});

test('hover is required for web-pointer but not touch-class platforms', () => {
  const inventory = {
    source: 'test', tokens: [], diagnostics: [],
    components: [{ id: 'button', aliases: [], variants: ['primary', 'secondary'], states: ['focus-visible', 'active', 'disabled', 'loading'], anatomy: ['label'], tokens: {}, evidence: 'declared', confidence: 'declared' }]
  };
  const pointer = diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'web-pointer' });
  assert.equal(pointer.warnings.some((finding) => finding.type === 'missing_state' && finding.detail.includes('hover')), true);
  for (const platform of ['web-touch', 'ios', 'android']) {
    const report = diff.diffDesignSystem(inventory, 'raven-canonical', { platform });
    assert.equal(report.warnings.some((finding) => finding.type === 'missing_state' && finding.detail.includes('hover')), false, platform);
  }
  assert.throws(() => diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'ios-touch' }), /web-pointer.*web-touch.*ios.*android/);
});

test('exact component id wins before project aliases', () => {
  const inventory = { source: 'test', tokens: [], diagnostics: [], components: [{ id: 'button', aliases: [], variants: [], states: [], anatomy: [], tokens: {}, evidence: 'declared', confidence: 'declared' }] };
  const report = diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'web-pointer', projectAliases: { button: 'input' } });
  assert.equal(report.errors.some((finding) => finding.id === 'missing-component-button'), false);
  assert.equal(report.errors.some((finding) => finding.id === 'missing-component-input'), true);
});

test('baseline aliases win before project aliases', () => {
  const inventory = { source: 'test', tokens: [], diagnostics: [], components: [{ id: 'btn', aliases: [], variants: [], states: [], anatomy: [], tokens: {}, evidence: 'declared', confidence: 'declared' }] };
  const report = diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'web-pointer', projectAliases: { btn: 'input' } });
  assert.equal(report.errors.some((finding) => finding.id === 'missing-component-button'), false);
  assert.equal(report.errors.some((finding) => finding.id === 'missing-component-input'), true);
});

test('dangling component token refs warn and do not count as faithful', () => {
  const inventory = {
    source: 'test', tokens: [{ path: 'colors.primary', group: 'colors', name: 'primary', value: '#000', kind: 'scalar', cssVar: '--color-primary' }], diagnostics: [],
    components: [{ id: 'button', aliases: [], variants: [], states: [], anatomy: [], tokens: { background: '{colors.missing}', foreground: '{colors.primary}' }, evidence: 'declared', confidence: 'declared' }]
  };
  const report = diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'web-pointer' });
  assert.equal(report.coverage.token_fidelity, 50);
  assert.equal(report.warnings.some((finding) => finding.type === 'token_dangling_ref' && finding.detail.includes('colors.missing')), true);
});

test('a baseline component is consumed once and duplicate matches warn', () => {
  const component = (id) => ({ id, aliases: [], variants: [], states: [], anatomy: [], tokens: {}, evidence: 'declared', confidence: 'declared' });
  const report = diff.diffDesignSystem({ source: 'test', tokens: [], diagnostics: [], components: [component('button'), component('btn')] }, 'raven-canonical', { platform: 'web-pointer' });
  assert.equal(report.coverage.components.covered, 1);
  assert.ok(report.coverage.components.pct <= 100);
  assert.equal(report.warnings.some((finding) => finding.type === 'ambiguous_match' && finding.component === 'btn'), true);
});

test('unmatched optional baseline components emit informational pass notes', () => {
  const inventory = { source: 'test', tokens: [], diagnostics: [], components: [{ id: 'button', aliases: [], variants: [], states: [], anatomy: [], tokens: {}, evidence: 'declared', confidence: 'declared' }] };
  const report = diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'web-pointer' });
  assert.equal(report.passes.some((finding) => finding.type === 'optional_component' && finding.component === 'tooltip' && finding.severity === 'info'), true);
});

test('missing focus-visible caps an otherwise above-cap report at score 74 and grade C', async () => {
  const baseline = diff.loadBaseline('raven-canonical');
  const components = baseline.components.map((component) => ({
    id: component.id, aliases: [], variants: component.variants.slice(),
    states: component.states.filter((state) => !(component.id === 'button' && state === 'focus-visible')),
    anatomy: component.anatomy.slice(), tokens: {}, evidence: 'declared', confidence: 'declared'
  }));
  const capped = diff.diffDesignSystem({ source: 'test', tokens: [], diagnostics: [], components }, 'raven-canonical', { platform: 'web-pointer' });
  assert.equal(capped.score, 74);
  assert.equal(capped.grade, 'C');
  assert.match(capped.summary, /caps the score at 74 and grade at C/);

  const report = diff.diffDesignSystem(diff.inventoryFromDesignMd(fixture), 'raven-canonical', { platform: 'web-pointer' });
  const critical = report.errors.filter((finding) => finding.type === 'missing_state' && finding.component === 'button');
  assert.deepEqual(critical.map((finding) => finding.detail), ['Missing required state: focus-visible']);
  assert.ok(['C', 'D', 'F'].includes(report.grade));
  assert.match(report.fix_priority[0], /button.*focus-visible/i);
  const sample = JSON.parse(await readFile(path.join(__dirname, 'fixtures/design-system/sample-diff-report.json'), 'utf8'));
  assert.deepEqual(report, sample);
});
