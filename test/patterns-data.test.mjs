/**
 * patterns-data.test.mjs
 *
 * Data-integrity tests for src/data/patterns/dropdown-menu.json and the full
 * patterns corpus.
 *
 * Guards:
 *  - dropdown-menu.json parses as valid JSON (the loader silently skips invalid
 *    JSON — explicit parse here catches that silent-skip failure)
 *  - Schema: all required keys present, non-empty, minimum array counts
 *  - id === "dropdown-menu"; no duplicate id across src/data/patterns/
 *  - Topic coverage: listbox / menu / combobox / type-ahead / escape /
 *    bottom-sheet / max-height / native-select / aria all appear in the file
 *  - ARIA role distinction: all three of listbox, menu, combobox co-occur
 *  - All pattern files in the corpus are valid JSON and have a non-empty id
 *
 * Usage:
 *   node --test test/patterns-data.test.mjs
 *   or: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ── Resolve paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const patternsDir = path.resolve(__dirname, '../src/data/patterns');
const dropdownMenuPath = path.join(patternsDir, 'dropdown-menu.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load and parse a JSON file.
 * Returns { ok: true, data } or { ok: false, error }.
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
 * Return all *.json filenames (full paths) in the patterns directory.
 */
function allPatternFiles() {
  return fs
    .readdirSync(patternsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(patternsDir, f));
}

// ── 1. dropdown-menu.json parses as valid JSON ───────────────────────────────
//
// The loader (loadJsonDir) silently skips files that fail JSON.parse.
// Parsing explicitly here catches a malformed file that would otherwise
// be swallowed and cause a silent missing-pattern ship.

test('patterns-data: dropdown-menu.json exists', () => {
  assert.ok(
    fs.existsSync(dropdownMenuPath),
    `dropdown-menu.json not found at ${dropdownMenuPath}`
  );
});

test('patterns-data: dropdown-menu.json parses as valid JSON', () => {
  const result = loadJson(dropdownMenuPath);
  assert.ok(
    result.ok,
    `JSON.parse failed for dropdown-menu.json: ${result.error}`
  );
});

// ── 2. Schema validation for dropdown-menu ───────────────────────────────────

test('patterns-data: dropdown-menu schema — id is "dropdown-menu"', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');
  assert.strictEqual(
    data.id,
    'dropdown-menu',
    `expected id "dropdown-menu", got "${data.id}"`
  );
});

test('patterns-data: dropdown-menu schema — name, category, summary are non-empty strings', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');

  for (const key of ['name', 'category', 'summary']) {
    assert.ok(
      key in data,
      `dropdown-menu.json: missing required key "${key}"`
    );
    assert.ok(
      typeof data[key] === 'string' && data[key].trim().length > 0,
      `dropdown-menu.json: "${key}" must be a non-empty string, got: ${JSON.stringify(data[key])}`
    );
  }
});

test('patterns-data: dropdown-menu schema — principles_referenced is array length ≥3', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');

  assert.ok(
    'principles_referenced' in data,
    'dropdown-menu.json: missing required key "principles_referenced"'
  );
  assert.ok(
    Array.isArray(data.principles_referenced),
    'dropdown-menu.json: "principles_referenced" must be an Array'
  );
  assert.ok(
    data.principles_referenced.length >= 3,
    `dropdown-menu.json: "principles_referenced" must have ≥3 items, got ${data.principles_referenced.length}`
  );
});

test('patterns-data: dropdown-menu schema — patterns is array length ≥5 with valid sub-pattern objects', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');

  assert.ok(
    'patterns' in data,
    'dropdown-menu.json: missing required key "patterns"'
  );
  assert.ok(
    Array.isArray(data.patterns),
    'dropdown-menu.json: "patterns" must be an Array'
  );
  assert.ok(
    data.patterns.length >= 5,
    `dropdown-menu.json: "patterns" must have ≥5 entries, got ${data.patterns.length}`
  );

  data.patterns.forEach((entry, i) => {
    const label = `dropdown-menu.patterns[${i}] ("${entry.name || '<no name>'}")`;

    // name — non-empty string
    assert.ok(
      typeof entry.name === 'string' && entry.name.trim().length > 0,
      `${label}: "name" must be a non-empty string`
    );

    // description — non-empty string
    assert.ok(
      typeof entry.description === 'string' && entry.description.trim().length > 0,
      `${label}: "description" must be a non-empty string`
    );

    // evidence — non-empty string
    assert.ok(
      typeof entry.evidence === 'string' && entry.evidence.trim().length > 0,
      `${label}: "evidence" must be a non-empty string`
    );

    // do — array length ≥4 of non-empty strings
    assert.ok(
      Array.isArray(entry.do),
      `${label}: "do" must be an Array`
    );
    assert.ok(
      entry.do.length >= 4,
      `${label}: "do" must have ≥4 items, got ${entry.do.length}`
    );
    entry.do.forEach((item, j) => {
      assert.ok(
        typeof item === 'string' && item.trim().length > 0,
        `${label}.do[${j}] must be a non-empty string`
      );
    });

    // dont — array length ≥4 of non-empty strings
    assert.ok(
      Array.isArray(entry.dont),
      `${label}: "dont" must be an Array`
    );
    assert.ok(
      entry.dont.length >= 4,
      `${label}: "dont" must have ≥4 items, got ${entry.dont.length}`
    );
    entry.dont.forEach((item, j) => {
      assert.ok(
        typeof item === 'string' && item.trim().length > 0,
        `${label}.dont[${j}] must be a non-empty string`
      );
    });
  });
});

test('patterns-data: dropdown-menu schema — checklist is array length ≥10 of non-empty strings', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');

  assert.ok(
    'checklist' in data,
    'dropdown-menu.json: missing required key "checklist"'
  );
  assert.ok(
    Array.isArray(data.checklist),
    'dropdown-menu.json: "checklist" must be an Array'
  );
  assert.ok(
    data.checklist.length >= 10,
    `dropdown-menu.json: "checklist" must have ≥10 items, got ${data.checklist.length}`
  );

  data.checklist.forEach((item, i) => {
    assert.ok(
      typeof item === 'string' && item.trim().length > 0,
      `dropdown-menu.json: checklist[${i}] must be a non-empty string`
    );
  });
});

// ── 3. Topic coverage ────────────────────────────────────────────────────────
//
// Build a single lowercased corpus string from the entire file and assert that
// every required topic appears. Assertion messages name the missing topic so a
// failure is immediately actionable.

test('patterns-data: dropdown-menu topic coverage — all required topics present', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');

  const corpus = JSON.stringify(data).toLowerCase();

  const requiredTopics = [
    { regex: /listbox/,          label: 'listbox (ARIA role for value-selection)' },
    { regex: /\bmenu(item)?\b/,  label: 'menu / menuitem (ARIA role for command menus)' },
    { regex: /combobox/,         label: 'combobox (ARIA role for input+popup pattern)' },
    { regex: /type[- ]?ahead/,   label: 'type-ahead keyboard navigation' },
    { regex: /escape/,           label: 'Escape key to close' },
    { regex: /bottom[- ]?sheet/, label: 'bottom-sheet mobile pattern' },
    { regex: /max-?height/,      label: 'max-height (overflow/scroll constraint)' },
    { regex: /native\s+<?select/,label: 'native <select> element consideration' },
    { regex: /aria/,             label: 'ARIA attributes/roles (general)' },
  ];

  for (const { regex, label } of requiredTopics) {
    assert.ok(
      regex.test(corpus),
      `dropdown-menu.json: missing topic — "${label}" not found. Add substantive coverage to patterns[] or checklist.`
    );
  }
});

// ── 4. ARIA role distinction — listbox, menu, combobox all co-occur ──────────
//
// Each of the three distinct ARIA roles must be named. This is a correctness
// guard: a dropdown pattern that conflates these roles is inaccurate.

test('patterns-data: dropdown-menu ARIA role distinction — listbox, menu, and combobox all present', () => {
  const { ok, data } = loadJson(dropdownMenuPath);
  assert.ok(ok, 'file must parse cleanly first');

  const corpus = JSON.stringify(data).toLowerCase();

  const roles = [
    { term: 'listbox',  label: 'listbox' },
    { term: 'menu',     label: 'menu / menuitem' },
    { term: 'combobox', label: 'combobox' },
  ];

  for (const { term, label } of roles) {
    assert.ok(
      corpus.includes(term),
      `dropdown-menu.json: ARIA role "${label}" must be present — all three roles (listbox, menu, combobox) must co-occur to correctly distinguish use cases.`
    );
  }
});

// ── 5. No duplicate id across all pattern files ──────────────────────────────

test('patterns-data: no duplicate id across all src/data/patterns/*.json files', () => {
  const files = allPatternFiles();
  const idToFiles = {};

  for (const filePath of files) {
    const result = loadJson(filePath);
    if (!result.ok) continue; // invalid files caught by test #6; don't participate here
    const { data } = result;
    if (data && typeof data.id === 'string') {
      const id = data.id;
      if (!idToFiles[id]) idToFiles[id] = [];
      idToFiles[id].push(path.basename(filePath));
    }
  }

  const duplicates = Object.entries(idToFiles).filter(([, files]) => files.length > 1);
  assert.strictEqual(
    duplicates.length,
    0,
    `Duplicate ids found across patterns/: ${duplicates
      .map(([id, fs]) => `"${id}" in [${fs.join(', ')}]`)
      .join('; ')}`
  );
});

test('patterns-data: "dropdown-menu" id is present among all pattern files', () => {
  const files = allPatternFiles();
  const allIds = [];

  for (const filePath of files) {
    const result = loadJson(filePath);
    if (!result.ok) continue;
    const { data } = result;
    if (data && typeof data.id === 'string') {
      allIds.push(data.id);
    }
  }

  assert.ok(
    allIds.includes('dropdown-menu'),
    `"dropdown-menu" id not found among pattern files. IDs found: [${allIds.join(', ')}]`
  );
});

// ── 6. All pattern files are valid JSON and have a non-empty id ───────────────
//
// Guards the entire patterns corpus — mirrors the principles test.
// If any existing or future file ships with malformed JSON the loader
// silently drops it; this test surfaces the failure.

test('patterns-data: all *.json files in src/data/patterns/ are valid JSON with a non-empty id', () => {
  const files = allPatternFiles();

  assert.ok(
    files.length > 0,
    `No *.json files found in ${patternsDir} — check the directory path`
  );

  for (const filePath of files) {
    const basename = path.basename(filePath);
    const result = loadJson(filePath);

    assert.ok(
      result.ok,
      `${basename}: JSON.parse failed — ${result.error}`
    );

    const { data } = result;

    assert.ok(
      data !== null && typeof data === 'object' && !Array.isArray(data),
      `${basename}: top-level value must be a plain object (not null, array, or primitive)`
    );

    assert.ok(
      typeof data.id === 'string' && data.id.trim().length > 0,
      `${basename}: "id" must be a non-empty string, got: ${JSON.stringify(data.id)}`
    );
  }
});
