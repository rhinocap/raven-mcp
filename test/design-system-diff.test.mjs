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

test('touch-only platform does not require hover', () => {
  const inventory = diff.inventoryFromDesignMd(fixture);
  const report = diff.diffDesignSystem(inventory, 'raven-canonical', { platform: 'web-touch' });
  assert.equal(report.warnings.some((finding) => finding.type === 'missing_state' && finding.detail.includes('hover')), false);
});

test('missing focus-visible is the sole accessibility-critical button state error and caps the grade', async () => {
  const report = diff.diffDesignSystem(diff.inventoryFromDesignMd(fixture), 'raven-canonical', { platform: 'web-pointer' });
  const critical = report.errors.filter((finding) => finding.type === 'missing_state' && finding.component === 'button');
  assert.deepEqual(critical.map((finding) => finding.detail), ['Missing required state: focus-visible']);
  assert.ok(['C', 'D', 'F'].includes(report.grade));
  assert.match(report.fix_priority[0], /button.*focus-visible/i);
  const sample = JSON.parse(await readFile(path.join(__dirname, 'fixtures/design-system/sample-diff-report.json'), 'utf8'));
  assert.deepEqual(report, sample);
});
