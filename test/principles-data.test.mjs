/**
 * principles-data.test.mjs
 *
 * Data-integrity tests for the two new principle files:
 *   src/data/principles/color-systems.json    (1 principle: color-palette-discipline)
 *   src/data/principles/spacing-systems.json  (2 principles: spacing-base-unit, spacing-scale-count)
 *
 * Guards:
 *  - Valid JSON + non-empty arrays (loader silently skips invalid JSON — this catches silent-fail ships)
 *  - Exact array lengths
 *  - All 9 required schema keys present and non-empty, with minimum array counts
 *  - Exact ids and categories per the SPEC contract
 *  - No duplicate id across the entire principles/ directory
 *  - applies_to coverage per category
 *  - THRESHOLD ALIGNMENT: principle text must carry the same numeric thresholds the audit rules enforce
 *    (drift guard — if a rule threshold changes and the principle is not updated, this test fails)
 *
 * Usage: node --test test/principles-data.test.mjs
 *   or:  node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const principlesDir = path.resolve(__dirname, '../src/data/principles');
const colorSystemsPath = path.join(principlesDir, 'color-systems.json');
const spacingSystemsPath = path.join(principlesDir, 'spacing-systems.json');
const pageChecksPath = path.resolve(__dirname, '../src/page-checks.ts');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load and parse a JSON file. Returns { ok: true, data } or { ok: false, error }.
 */
function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Return the joined text of summary + description + all implications for a principle.
 * Used by the threshold-alignment assertions.
 */
function principleText(p) {
  const parts = [
    p.summary || '',
    p.description || '',
    ...(Array.isArray(p.implications) ? p.implications : []),
  ];
  return parts.join(' ');
}

// ── 1. Both files exist and parse as non-empty arrays ───────────────────────

test('color-systems.json: file exists', () => {
  assert.ok(
    fs.existsSync(colorSystemsPath),
    `color-systems.json not found at ${colorSystemsPath}`
  );
});

test('color-systems.json: valid JSON and non-empty array', () => {
  const result = loadJson(colorSystemsPath);
  assert.ok(result.ok, `JSON.parse failed: ${result.error}`);
  assert.ok(Array.isArray(result.data), 'top-level value must be an Array');
  assert.ok(result.data.length > 0, 'array must not be empty');
});

test('spacing-systems.json: file exists', () => {
  assert.ok(
    fs.existsSync(spacingSystemsPath),
    `spacing-systems.json not found at ${spacingSystemsPath}`
  );
});

test('spacing-systems.json: valid JSON and non-empty array', () => {
  const result = loadJson(spacingSystemsPath);
  assert.ok(result.ok, `JSON.parse failed: ${result.error}`);
  assert.ok(Array.isArray(result.data), 'top-level value must be an Array');
  assert.ok(result.data.length > 0, 'array must not be empty');
});

// ── 2. Exact array lengths ───────────────────────────────────────────────────

test('color-systems.json: has exactly 1 principle', () => {
  const { ok, data } = loadJson(colorSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  assert.strictEqual(data.length, 1, `expected 1 principle, got ${data.length}`);
});

test('spacing-systems.json: has exactly 2 principles', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  assert.strictEqual(data.length, 2, `expected 2 principles, got ${data.length}`);
});

// ── 3. Schema: all 9 required keys, non-empty, minimum array counts ──────────

/**
 * Assert all 9 required keys are present and non-empty for a single principle object.
 * Called once per principle across both files.
 */
function assertPrincipleSchema(p, label) {
  const stringKeys = ['id', 'name', 'category', 'summary', 'description'];
  for (const key of stringKeys) {
    assert.ok(key in p, `${label}: missing key "${key}"`);
    assert.ok(
      typeof p[key] === 'string' && p[key].trim().length > 0,
      `${label}: key "${key}" must be a non-empty string, got: ${JSON.stringify(p[key])}`
    );
  }

  const arrayKeys = ['implications', 'violations', 'applies_to', 'sources'];
  for (const key of arrayKeys) {
    assert.ok(key in p, `${label}: missing key "${key}"`);
    assert.ok(Array.isArray(p[key]), `${label}: "${key}" must be an Array`);
    assert.ok(p[key].length > 0, `${label}: "${key}" must not be empty`);
  }

  assert.ok(
    p.implications.length >= 4,
    `${label}: implications must have >= 4 items, got ${p.implications.length}`
  );
  assert.ok(
    p.violations.length >= 3,
    `${label}: violations must have >= 3 items, got ${p.violations.length}`
  );
  assert.ok(
    p.applies_to.length >= 3,
    `${label}: applies_to must have >= 3 items, got ${p.applies_to.length}`
  );
  assert.ok(
    p.sources.length >= 1,
    `${label}: sources must have >= 1 item, got ${p.sources.length}`
  );
}

test('color-systems.json: every principle passes schema validation', () => {
  const { ok, data } = loadJson(colorSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  for (let i = 0; i < data.length; i++) {
    assertPrincipleSchema(data[i], `color-systems[${i}]`);
  }
});

test('spacing-systems.json: every principle passes schema validation', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  for (let i = 0; i < data.length; i++) {
    assertPrincipleSchema(data[i], `spacing-systems[${i}]`);
  }
});

// ── 4. Exact ids and categories ──────────────────────────────────────────────

test('color-systems.json: id is "color-palette-discipline" and category is "color-systems"', () => {
  const { ok, data } = loadJson(colorSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data[0];
  assert.strictEqual(p.id, 'color-palette-discipline', `expected id "color-palette-discipline", got "${p.id}"`);
  assert.strictEqual(p.category, 'color-systems', `expected category "color-systems", got "${p.category}"`);
});

test('spacing-systems.json: ids and categories match contract', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');

  const ids = data.map((p) => p.id);
  assert.ok(
    ids.includes('spacing-base-unit'),
    `expected id "spacing-base-unit" in spacing-systems.json, got [${ids.join(', ')}]`
  );
  assert.ok(
    ids.includes('spacing-scale-count'),
    `expected id "spacing-scale-count" in spacing-systems.json, got [${ids.join(', ')}]`
  );

  for (const p of data) {
    assert.strictEqual(
      p.category,
      'spacing-systems',
      `principle "${p.id}": expected category "spacing-systems", got "${p.category}"`
    );
  }
});

// ── 5. No duplicate id across the entire principles directory ────────────────

test('no duplicate id across entire src/data/principles/ directory', () => {
  const jsonFiles = fs.readdirSync(principlesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(principlesDir, f));

  const allIds = [];
  for (const filePath of jsonFiles) {
    const result = loadJson(filePath);
    if (!result.ok) continue; // only valid files participate; invalid files are caught by their own test
    if (!Array.isArray(result.data)) continue;
    for (const item of result.data) {
      if (item && typeof item.id === 'string') {
        allIds.push({ id: item.id, file: path.basename(filePath) });
      }
    }
  }

  const idCounts = {};
  for (const { id, file } of allIds) {
    if (!idCounts[id]) idCounts[id] = [];
    idCounts[id].push(file);
  }

  const duplicates = Object.entries(idCounts).filter(([, files]) => files.length > 1);
  assert.strictEqual(
    duplicates.length,
    0,
    `Duplicate ids found across principles/: ${duplicates.map(([id, files]) => `"${id}" in [${files.join(', ')}]`).join('; ')}`
  );
});

// ── 6. applies_to coverage ───────────────────────────────────────────────────

test('color-palette-discipline: applies_to includes required tags', () => {
  const { ok, data } = loadJson(colorSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data.find((x) => x.id === 'color-palette-discipline');
  assert.ok(p, 'principle color-palette-discipline not found');

  const required = ['color', 'design-tokens', 'design-system', 'visual-hierarchy'];
  for (const tag of required) {
    assert.ok(
      p.applies_to.includes(tag),
      `color-palette-discipline applies_to must include "${tag}", got [${p.applies_to.join(', ')}]`
    );
  }
});

test('spacing-base-unit: applies_to includes required tags', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data.find((x) => x.id === 'spacing-base-unit');
  assert.ok(p, 'principle spacing-base-unit not found');

  const required = ['spacing', 'design-tokens', 'layout'];
  for (const tag of required) {
    assert.ok(
      p.applies_to.includes(tag),
      `spacing-base-unit applies_to must include "${tag}", got [${p.applies_to.join(', ')}]`
    );
  }
});

test('spacing-scale-count: applies_to includes required tags', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data.find((x) => x.id === 'spacing-scale-count');
  assert.ok(p, 'principle spacing-scale-count not found');

  const required = ['spacing', 'design-tokens', 'layout'];
  for (const tag of required) {
    assert.ok(
      p.applies_to.includes(tag),
      `spacing-scale-count applies_to must include "${tag}", got [${p.applies_to.join(', ')}]`
    );
  }
});

// ── 7. Threshold-alignment (drift guard) ────────────────────────────────────
//
// The principle TEXT must carry the same numeric thresholds the audit code enforces.
// ALSO assert the exact threshold expressions still exist in src/page-checks.ts so
// that if someone changes a rule threshold, this test fails and forces principle
// text to be re-synced.

test('color-palette-discipline: principle text contains threshold "10"', () => {
  const { ok, data } = loadJson(colorSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data.find((x) => x.id === 'color-palette-discipline');
  assert.ok(p, 'principle color-palette-discipline not found');

  const text = principleText(p);
  assert.ok(
    text.includes('10'),
    `color-palette-discipline summary/description/implications must contain "10" (the palette-size threshold). Got text preview: "${text.slice(0, 200)}"`
  );
});

test('spacing-scale-count: principle text contains threshold "7"', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data.find((x) => x.id === 'spacing-scale-count');
  assert.ok(p, 'principle spacing-scale-count not found');

  const text = principleText(p);
  assert.ok(
    text.includes('7'),
    `spacing-scale-count summary/description/implications must contain "7" (the spacing-scale threshold). Got text preview: "${text.slice(0, 200)}"`
  );
});

test('spacing-base-unit: principle text contains thresholds "8" and "4"', () => {
  const { ok, data } = loadJson(spacingSystemsPath);
  assert.ok(ok, 'file must parse cleanly first');
  const p = data.find((x) => x.id === 'spacing-base-unit');
  assert.ok(p, 'principle spacing-base-unit not found');

  const text = principleText(p);
  assert.ok(
    text.includes('8'),
    `spacing-base-unit summary/description/implications must contain "8" (8px grid threshold). Got text preview: "${text.slice(0, 200)}"`
  );
  assert.ok(
    text.includes('4'),
    `spacing-base-unit summary/description/implications must contain "4" (4px half-step threshold). Got text preview: "${text.slice(0, 200)}"`
  );
});

test('page-checks.ts: uniqueHex.length <= 10 expression still present (palette-size rule threshold)', () => {
  assert.ok(
    fs.existsSync(pageChecksPath),
    `page-checks.ts not found at ${pageChecksPath}`
  );
  const source = fs.readFileSync(pageChecksPath, 'utf-8');
  assert.ok(
    source.includes('uniqueHex.length <= 10'),
    'src/page-checks.ts must contain "uniqueHex.length <= 10" — if the rule threshold changed, update color-palette-discipline principle text and this guard'
  );
});

test('page-checks.ts: uniqueSpacings.length <= 7 expression still present (spacing-scale-count rule threshold)', () => {
  assert.ok(
    fs.existsSync(pageChecksPath),
    `page-checks.ts not found at ${pageChecksPath}`
  );
  const source = fs.readFileSync(pageChecksPath, 'utf-8');
  assert.ok(
    source.includes('uniqueSpacings.length <= 7'),
    'src/page-checks.ts must contain "uniqueSpacings.length <= 7" — if the rule threshold changed, update spacing-scale-count principle text and this guard'
  );
});
