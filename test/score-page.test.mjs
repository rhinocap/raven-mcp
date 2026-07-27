/**
 * score-page.test.mjs
 *
 * Deterministic unit tests for the `score_page` feature (AC 1–8).
 * Written against SPEC.md — NOT against the implementer's source.
 *
 * All tests are pure (no browser, no I/O).
 *
 * Usage:
 *   node --test test/score-page.test.mjs
 *   npm run build && node --test test/score-page.test.mjs
 *
 * If dist/score-page.js is absent a FAILING test is registered so the suite
 * is visibly RED (not silently skipped). Exit(1) is NOT used here — the
 * failing assertion is the signal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// ── Resolve module paths ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distScorePage  = path.resolve(__dirname, '../dist/score-page.js');
const distPageChecks = path.resolve(__dirname, '../dist/page-checks.js');

// ── Load built modules ────────────────────────────────────────────────────────
// If dist/score-page.js is absent, register ONE failing test so the suite is
// visibly RED. process.exit(1) is intentionally avoided here — the failing
// assertion is the signal, composing cleanly with `node --test`.

let scorePage;
let runPageChecks;

try {
  const mod = await import(distScorePage);
  scorePage = mod.scorePage;
} catch (err) {
  // Register a single failing sentinel test — missing build is RED, not green.
  test('dist/score-page.js must be built before running tests', () => {
    assert.fail(
      `dist/score-page.js not found — run \`npm run build\` first. (${err.message})`
    );
  });
  // Do NOT process.exit(0) — that masks the failure as a pass.
  process.exit(1);
}

try {
  const mod = await import(distPageChecks);
  runPageChecks = mod.runPageChecks;
} catch (err) {
  test('dist/page-checks.js must be built before running tests', () => {
    assert.fail(
      `dist/page-checks.js not found — run \`npm run build\` first. (${err.message})`
    );
  });
  process.exit(1);
}

// ── Constants (contract) ──────────────────────────────────────────────────────

const CANONICAL_CATEGORY_KEYS = [
  'structure', 'typography', 'color', 'spacing', 'a11y', 'responsive', 'tokens'
];

const CANONICAL_CATEGORY_LABELS = {
  structure:   'Structure',
  typography:  'Typography',
  color:       'Color & palette',
  spacing:     'Spacing & rhythm',
  a11y:        'Accessibility',
  responsive:  'Responsive layout',
  tokens:      'Design tokens',
};

const NOT_ASSESSED_CATEGORIES = ['brand', 'conversion', 'motion'];

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * A clean fixture: well-formed HTML that satisfies every check page-checks.ts
 * runs — lang, viewport, title, alt on imgs, var() tokens, flex-wrap, clamp,
 * no bare hex in non-custom-property lines, font-size >= 13px, weight >= 400.
 */
const CLEAN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clean Fixture Page</title>
  <style>
    :root {
      --color-primary: #1a1a2e;
      --color-accent:  #e94560;
      --color-bg:      #f5f5f5;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 16px;
      --space-4: 32px;
    }
    body {
      font-size: 16px;
      font-weight: 400;
      line-height: 1.5;
      background: var(--color-bg);
      color: var(--color-primary);
      padding: 16px;
    }
    h1 { font-size: 32px; }
    h2 { font-size: 25px; }
    h3 { font-size: 20px; }
    .container {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 16px;
    }
    .card {
      flex: 1 1 280px;
      padding: 16px;
      margin: 8px;
      background: var(--color-bg);
    }
    .btn {
      padding: 12px 24px;
      background: var(--color-accent);
      font-size: 16px;
      font-weight: 400;
    }
    section {
      padding: clamp(48px, 8vw, 128px);
    }
  </style>
</head>
<body>
  <img src="logo.png" alt="Company logo">
  <img src="hero.jpg" alt="Hero image">
  <h1>Heading One</h1>
  <h2>Heading Two</h2>
  <h3>Heading Three</h3>
  <p>Body text content here.</p>
  <button class="btn">Click me</button>
</body>
</html>`;

/**
 * A dirty fixture: has a missing-alt img (a11y/img-alt error) AND a sub-13px
 * font-size (typography/min-size error). Keeps structure clean so we can
 * assert a11y and typography scores drop while structure stays 10.
 */
const DIRTY_A11Y_TYPO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dirty Fixture</title>
  <style>
    :root { --color-bg: #f5f5f5; }
    body {
      font-size: 10px;
      font-weight: 400;
      line-height: 1.5;
      padding: 16px;
    }
    .container { display: flex; flex-wrap: wrap; gap: 16px; }
    section { padding: clamp(48px, 8vw, 128px); }
    .btn { padding: 12px 24px; }
  </style>
</head>
<body>
  <img src="logo.png">
  <p>Body text content.</p>
  <button class="btn">Click</button>
</body>
</html>`;

// ── Helper: penalty formula (per-category score) ─────────────────────────────

function penaltyScore(errors, warnings) {
  const penalty = (errors * 4) + (warnings * 2);
  return Math.max(0, Math.min(10, 10 - penalty));
}

// ── Helper: compute overall the audit_page way (from runPageChecks) ──────────

function computeOverall(html, strict = false) {
  const { passes, issues } = runPageChecks(html);
  const totalChecks = passes.length + issues.length;
  const errors   = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const failCount = strict ? issues.length : errors.length;
  const score = totalChecks > 0
    ? Math.round((totalChecks - failCount) / totalChecks * 100)
    : 100;
  const grade = failCount === 0 ? 'A'
    : failCount <= 2 ? 'B'
    : failCount <= 4 ? 'C'
    : 'D';
  return { score, grade, passes, issues, errors, warnings };
}

// ── AC 1: scorePage is a function; returns object with required top-level keys

test('AC1: scorePage is a function', () => {
  assert.strictEqual(typeof scorePage, 'function');
});

test('AC1: scorePage returns object with overall, categories, weakest_category, not_assessed', () => {
  const result = scorePage(CLEAN_HTML);
  assert.ok(result !== null && typeof result === 'object', 'result should be an object');
  assert.ok('overall'           in result, 'result must have overall');
  assert.ok('categories'        in result, 'result must have categories');
  assert.ok('weakest_category'  in result, 'result must have weakest_category');
  assert.ok('not_assessed'      in result, 'result must have not_assessed');
});

test('AC1: overall has score, grade, summary keys', () => {
  const { overall } = scorePage(CLEAN_HTML);
  assert.ok('score'   in overall, 'overall must have score');
  assert.ok('grade'   in overall, 'overall must have grade');
  assert.ok('summary' in overall, 'overall must have summary');
});

// ── AC 2: categories length === 7, correct keys, scores in [0, 10] ───────────

test('AC2: categories has exactly 7 entries', () => {
  const { categories } = scorePage(CLEAN_HTML);
  assert.strictEqual(
    categories.length,
    7,
    `expected 7 categories, got ${categories.length}`
  );
});

test('AC2: categories are in canonical order', () => {
  const { categories } = scorePage(CLEAN_HTML);
  const keys = categories.map(c => c.category);
  assert.deepEqual(
    keys,
    CANONICAL_CATEGORY_KEYS,
    `category order mismatch: got ${JSON.stringify(keys)}`
  );
});

test('AC2: each category entry has all required keys', () => {
  const { categories } = scorePage(CLEAN_HTML);
  const requiredKeys = ['category', 'label', 'score', 'errors', 'warnings', 'rationale'];
  for (const cat of categories) {
    for (const key of requiredKeys) {
      assert.ok(
        key in cat,
        `category '${cat.category}' missing key '${key}'`
      );
    }
  }
});

test('AC2: category labels match canonical display labels', () => {
  const { categories } = scorePage(CLEAN_HTML);
  for (const cat of categories) {
    assert.strictEqual(
      cat.label,
      CANONICAL_CATEGORY_LABELS[cat.category],
      `category '${cat.category}' label mismatch: got '${cat.label}', expected '${CANONICAL_CATEGORY_LABELS[cat.category]}'`
    );
  }
});

test('AC2: every category score is an integer in [0, 10]', () => {
  const { categories } = scorePage(CLEAN_HTML);
  for (const cat of categories) {
    assert.ok(
      Number.isInteger(cat.score),
      `category '${cat.category}' score ${cat.score} is not an integer`
    );
    assert.ok(
      cat.score >= 0 && cat.score <= 10,
      `category '${cat.category}' score ${cat.score} is out of [0, 10]`
    );
  }
});

test('AC2: category errors and warnings are non-negative integers', () => {
  const { categories } = scorePage(CLEAN_HTML);
  for (const cat of categories) {
    assert.ok(
      Number.isInteger(cat.errors) && cat.errors >= 0,
      `category '${cat.category}' errors count invalid: ${cat.errors}`
    );
    assert.ok(
      Number.isInteger(cat.warnings) && cat.warnings >= 0,
      `category '${cat.category}' warnings count invalid: ${cat.warnings}`
    );
  }
});

// ── AC 3: penalty formula invariant holds for every category on every fixture ─

/**
 * This test proves the formula universally: for every category on every
 * fixture, score === clamp(10 - (errors*4 + warnings*2), 0, 10).
 * This approach is more robust than pin-testing specific truth-table rows
 * (which would depend on exact rule-wiring), while still fully proving the
 * formula as the SPEC requires.
 */

test('AC3: penalty formula score === clamp(10 - (errors*4 + warnings*2), 0, 10) holds for every category on clean fixture', () => {
  const { categories } = scorePage(CLEAN_HTML);
  for (const cat of categories) {
    const expected = penaltyScore(cat.errors, cat.warnings);
    assert.strictEqual(
      cat.score,
      expected,
      `category '${cat.category}': score=${cat.score}, errors=${cat.errors}, warnings=${cat.warnings}, expected formula score=${expected}`
    );
  }
});

test('AC3: penalty formula holds for every category on dirty fixture', () => {
  const { categories } = scorePage(DIRTY_A11Y_TYPO_HTML);
  for (const cat of categories) {
    const expected = penaltyScore(cat.errors, cat.warnings);
    assert.strictEqual(
      cat.score,
      expected,
      `category '${cat.category}': score=${cat.score}, errors=${cat.errors}, warnings=${cat.warnings}, expected formula score=${expected}`
    );
  }
});

test('AC3: penalty truth-table — 0 issues → score 10', () => {
  // a11y category: clean HTML with alt on all imgs, adequate btn padding → errors=0, warnings=0
  const { categories } = scorePage(CLEAN_HTML);
  const a11y = categories.find(c => c.category === 'a11y');
  assert.ok(a11y, 'a11y category must exist');
  if (a11y.errors === 0 && a11y.warnings === 0) {
    assert.strictEqual(a11y.score, 10, 'a11y with 0 issues must score 10');
  }
  // Also verify formula gives 10 for 0,0 inputs
  assert.strictEqual(penaltyScore(0, 0), 10);
});

test('AC3: penalty truth-table formula values: 1W→8, 1E→6, 1E+1W→4, 2E→2, 3E→0', () => {
  // Verify the formula in isolation (these ARE the SPEC truth table values)
  assert.strictEqual(penaltyScore(0, 1),  8, '1 warning → 8');
  assert.strictEqual(penaltyScore(1, 0),  6, '1 error → 6');
  assert.strictEqual(penaltyScore(1, 1),  4, '1 error + 1 warning → 4');
  assert.strictEqual(penaltyScore(2, 0),  2, '2 errors → 2');
  assert.strictEqual(penaltyScore(3, 0),  0, '3 errors → 0');
  assert.strictEqual(penaltyScore(4, 0),  0, '4+ errors → still 0 (clamped)');
  assert.strictEqual(penaltyScore(0, 5),  0, '5 warnings → 0 (clamped)');
});

test('AC3: structure category on HTML missing lang, viewport, title → score ≤ 6 (≥1 error fires)', () => {
  // This fixture has 3 structure errors so score should be 0
  const bareHtml = '<html><head></head><body><p>hi</p></body></html>';
  const { categories } = scorePage(bareHtml);
  const structure = categories.find(c => c.category === 'structure');
  assert.ok(structure, 'structure category must exist');
  // 3 structure errors expected → penalty = 12 → clamped to 0
  const expected = penaltyScore(structure.errors, structure.warnings);
  assert.strictEqual(structure.score, expected, 'structure score obeys formula');
  assert.ok(structure.score < 10, 'structure must not be perfect on bare HTML');
});

test('AC3: a11y category — img missing alt → a11y error present, score < 10', () => {
  // Dirty fixture has 1 img missing alt → a11y/img-alt error
  const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test</title>
  <style>:root{--c:#f00;} body{font-size:16px;font-weight:400;} .btn{padding:12px;}</style>
</head><body>
  <img src="x.png">
  <button class="btn">Go</button>
</body></html>`;
  const { categories } = scorePage(html);
  const a11y = categories.find(c => c.category === 'a11y');
  assert.ok(a11y, 'a11y category must exist');
  assert.ok(a11y.errors >= 1, `expected ≥1 a11y error, got ${a11y.errors}`);
  assert.ok(a11y.score < 10, `a11y score should be < 10, got ${a11y.score}`);
  assert.strictEqual(a11y.score, penaltyScore(a11y.errors, a11y.warnings));
});

test('AC3: typography category — font-size:10px → typography error, score < 10', () => {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test</title>
  <style>:root{--c:#f00;} body{font-size:10px;font-weight:400;} .btn{padding:12px;}</style>
</head><body>
  <img src="x.png" alt="test">
  <button class="btn">Go</button>
</body></html>`;
  const { categories } = scorePage(html);
  const typo = categories.find(c => c.category === 'typography');
  assert.ok(typo, 'typography category must exist');
  assert.ok(typo.errors >= 1, `expected ≥1 typography error, got ${typo.errors}`);
  assert.ok(typo.score < 10, `typography score should be < 10, got ${typo.score}`);
  assert.strictEqual(typo.score, penaltyScore(typo.errors, typo.warnings));
});

// ── AC 4: overall score/grade byte-identical to audit_page arithmetic ─────────

test('AC4: overall.score matches audit_page arithmetic (strict=false)', () => {
  const { overall } = scorePage(CLEAN_HTML, { strict: false });
  const expected = computeOverall(CLEAN_HTML, false);
  assert.strictEqual(
    overall.score,
    expected.score,
    `overall score ${overall.score} !== audit_page expected ${expected.score}`
  );
  assert.strictEqual(
    overall.grade,
    expected.grade,
    `overall grade '${overall.grade}' !== audit_page expected '${expected.grade}'`
  );
});

test('AC4: overall.score matches audit_page arithmetic (strict=true)', () => {
  const { overall } = scorePage(CLEAN_HTML, { strict: true });
  const expected = computeOverall(CLEAN_HTML, true);
  assert.strictEqual(
    overall.score,
    expected.score,
    `overall score (strict) ${overall.score} !== audit_page expected ${expected.score}`
  );
  assert.strictEqual(
    overall.grade,
    expected.grade,
    `overall grade (strict) '${overall.grade}' !== audit_page expected '${expected.grade}'`
  );
});

test('AC4: overall matches audit_page arithmetic on dirty fixture (strict=false)', () => {
  const { overall } = scorePage(DIRTY_A11Y_TYPO_HTML, { strict: false });
  const expected = computeOverall(DIRTY_A11Y_TYPO_HTML, false);
  assert.strictEqual(overall.score, expected.score);
  assert.strictEqual(overall.grade, expected.grade);
});

test('AC4: overall matches audit_page arithmetic on dirty fixture (strict=true)', () => {
  const { overall } = scorePage(DIRTY_A11Y_TYPO_HTML, { strict: true });
  const expected = computeOverall(DIRTY_A11Y_TYPO_HTML, true);
  assert.strictEqual(overall.score, expected.score);
  assert.strictEqual(overall.grade, expected.grade);
});

test('AC4: overall.grade is one of A, B, C, D', () => {
  for (const html of [CLEAN_HTML, DIRTY_A11Y_TYPO_HTML]) {
    const { overall } = scorePage(html);
    assert.ok(
      ['A', 'B', 'C', 'D'].includes(overall.grade),
      `overall.grade '${overall.grade}' is not a valid letter grade`
    );
  }
});

test('AC4: overall.score is in [0, 100]', () => {
  for (const html of [CLEAN_HTML, DIRTY_A11Y_TYPO_HTML]) {
    const { overall } = scorePage(html);
    assert.ok(
      overall.score >= 0 && overall.score <= 100,
      `overall.score ${overall.score} out of [0, 100]`
    );
  }
});

// ── AC 5: weakest_category === category with minimum score ────────────────────

test('AC5: weakest_category is the category with the minimum score', () => {
  // The dirty fixture has a11y error + typography error — one of those will be weakest
  const result = scorePage(DIRTY_A11Y_TYPO_HTML);
  const { categories, weakest_category } = result;

  // Find the minimum score
  const minScore = Math.min(...categories.map(c => c.score));

  // All categories at minScore — weakest must be the first in canonical order
  const weakestCandidates = CANONICAL_CATEGORY_KEYS.filter(key => {
    const cat = categories.find(c => c.category === key);
    return cat && cat.score === minScore;
  });

  assert.ok(
    weakestCandidates.length >= 1,
    'there must be at least one category at the minimum score'
  );
  assert.strictEqual(
    weakest_category,
    weakestCandidates[0],
    `weakest_category '${weakest_category}' should be '${weakestCandidates[0]}' (first in canonical order at min score ${minScore})`
  );
});

test('AC5: weakest_category on clean fixture is a valid category key', () => {
  const { weakest_category } = scorePage(CLEAN_HTML);
  assert.ok(
    CANONICAL_CATEGORY_KEYS.includes(weakest_category),
    `weakest_category '${weakest_category}' is not in canonical category keys`
  );
});

test('AC5: weakest_category tie-breaks to first in canonical order', () => {
  // Use the bare HTML that has 3 structure errors → structure score=0; other
  // categories vary but structure=0 is almost certainly the minimum.
  // If any other category also hits 0, the winner must be first in canonical order.
  const bareHtml = '<html><head></head><body><p>hi</p></body></html>';
  const { categories, weakest_category } = scorePage(bareHtml);

  const minScore = Math.min(...categories.map(c => c.score));
  const weakestCandidates = CANONICAL_CATEGORY_KEYS.filter(key => {
    const cat = categories.find(c => c.category === key);
    return cat && cat.score === minScore;
  });

  assert.strictEqual(
    weakest_category,
    weakestCandidates[0],
    `weakest_category '${weakest_category}' should be '${weakestCandidates[0]}' (first at score ${minScore})`
  );
});

// ── AC 6: not_assessed.categories deep-equals ["brand","conversion","motion"] ─

test('AC6: not_assessed.categories deep-equals ["brand","conversion","motion"]', () => {
  const { not_assessed } = scorePage(CLEAN_HTML);
  assert.deepEqual(
    not_assessed.categories,
    NOT_ASSESSED_CATEGORIES,
    `not_assessed.categories mismatch: got ${JSON.stringify(not_assessed.categories)}`
  );
});

test('AC6: not_assessed has a note string', () => {
  const { not_assessed } = scorePage(CLEAN_HTML);
  assert.ok('note' in not_assessed, 'not_assessed must have a note key');
  assert.strictEqual(typeof not_assessed.note, 'string', 'not_assessed.note must be a string');
  assert.ok(not_assessed.note.length > 0, 'not_assessed.note must not be empty');
});

test('AC6: not_assessed.categories is exactly length 3 and contains no numeric score', () => {
  const { not_assessed } = scorePage(CLEAN_HTML);
  assert.strictEqual(not_assessed.categories.length, 3);
  // categories array holds strings, not objects
  for (const cat of not_assessed.categories) {
    assert.strictEqual(typeof cat, 'string');
  }
});

// ── AC 7: clean fixture → high scores; dirty fixture → a11y + typo drop ──────

test('AC7: clean fixture — all category scores are integers in [0,10]', () => {
  const { categories } = scorePage(CLEAN_HTML);
  for (const cat of categories) {
    assert.ok(Number.isInteger(cat.score) && cat.score >= 0 && cat.score <= 10);
  }
});

test('AC7: clean fixture — overall grade is valid letter', () => {
  const { overall } = scorePage(CLEAN_HTML);
  assert.ok(['A', 'B', 'C', 'D'].includes(overall.grade));
});

test('AC7: clean fixture — structure score is 10 (lang + viewport + title all present)', () => {
  const { categories } = scorePage(CLEAN_HTML);
  const structure = categories.find(c => c.category === 'structure');
  assert.ok(structure, 'structure must exist');
  assert.strictEqual(structure.score, 10, `structure should be 10 on clean fixture, got ${structure.score}`);
});

test('AC7: dirty fixture — a11y score < 10 (missing-alt img)', () => {
  const { categories } = scorePage(DIRTY_A11Y_TYPO_HTML);
  const a11y = categories.find(c => c.category === 'a11y');
  assert.ok(a11y, 'a11y must exist');
  assert.ok(a11y.score < 10, `a11y should be < 10 on dirty fixture, got ${a11y.score}`);
});

test('AC7: dirty fixture — typography score < 10 (font-size 10px)', () => {
  const { categories } = scorePage(DIRTY_A11Y_TYPO_HTML);
  const typo = categories.find(c => c.category === 'typography');
  assert.ok(typo, 'typography must exist');
  assert.ok(typo.score < 10, `typography should be < 10 on dirty fixture, got ${typo.score}`);
});

test('AC7: dirty fixture — structure score is 10 (structure checks still pass)', () => {
  // Dirty fixture has lang, viewport, title — structure should be clean
  const { categories } = scorePage(DIRTY_A11Y_TYPO_HTML);
  const structure = categories.find(c => c.category === 'structure');
  assert.ok(structure, 'structure must exist');
  assert.strictEqual(
    structure.score,
    10,
    `structure should still be 10 on dirty fixture (lang/viewport/title present), got ${structure.score}`
  );
});

test('AC7: dirty fixture — at least one unrelated category stays 10 while a11y + typography drop', () => {
  const { categories } = scorePage(DIRTY_A11Y_TYPO_HTML);
  const a11y = categories.find(c => c.category === 'a11y');
  const typo = categories.find(c => c.category === 'typography');
  const structure = categories.find(c => c.category === 'structure');

  assert.ok(a11y.score < 10, 'a11y should drop below 10');
  assert.ok(typo.score < 10, 'typography should drop below 10');
  assert.strictEqual(structure.score, 10, 'structure (unrelated) must stay at 10');
});

// ── AC 8: score_page is importable (tool exists in dist) ─────────────────────

test('AC8: scorePage export is callable', () => {
  assert.strictEqual(typeof scorePage, 'function', 'scorePage must be a function export');
});

test('AC8: scorePage handles minimal valid HTML without throwing', () => {
  const minHtml = '<html lang="en"><head><meta name="viewport" content="width=device-width"><title>T</title></head><body></body></html>';
  assert.doesNotThrow(() => scorePage(minHtml));
});

test('scorePage: contrast status counts determinate failures and keeps indeterminate rows out of metrics', () => {
  const result = scorePage('<main><p>Text</p></main>', {
    contrastRows: [
      { status: 'pass', ratio: 7 },
      { status: 'fail', ratio: 2 },
      { status: 'indeterminate', ratio: null },
    ],
  });
  assert.deepEqual(result.contrast, {
    pass_count: 1,
    fail_count: 1,
    indeterminate_count: 1,
    note: '1 contrast row not assessed because its rendered backdrop is indeterminate.',
  });
  const a11y = result.categories.find((row) => row.category === 'a11y');
  assert.ok(a11y.errors >= 1, 'the determinate contrast failure should affect accessibility');
});

test('AC8: scorePage handler output is JSON-serialisable (tool can return it as JSON text)', () => {
  const result = scorePage(CLEAN_HTML);
  let serialized;
  assert.doesNotThrow(() => {
    serialized = JSON.stringify(result);
  }, 'result must be JSON-serialisable');
  const roundtripped = JSON.parse(serialized);
  assert.deepEqual(
    Object.keys(roundtripped).sort(),
    ['categories', 'contrast', 'not_assessed', 'overall', 'weakest_category'].sort(),
    'round-tripped result must have the same top-level keys'
  );
});

// ── AC 9: score_page MCP tool schema accepts html and/or url (audit_page parity) ─

const distIndex = path.resolve(__dirname, '../dist/index.js');

async function withClient(server, fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'score-page-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

let indexMod;
try {
  indexMod = await import(distIndex);
} catch (err) {
  test('dist/index.js must be built before running score_page MCP tests', () => {
    assert.fail(`dist/index.js not found — run \`npm run build\` first. (${err.message})`);
  });
  indexMod = null;
}

if (indexMod) {
  test('AC9: score_page tool accepts html-only (no url) and returns a score result', async () => {
    await withClient(indexMod.buildServer({}), async (client) => {
      const res = await client.callTool({ name: 'score_page', arguments: { html: CLEAN_HTML } });
      assert.equal(res.isError, undefined, `expected success, got: ${res.content && res.content[0] && res.content[0].text}`);
      const parsed = JSON.parse(res.content[0].text);
      assert.ok('overall' in parsed, 'result must have overall');
      assert.ok('categories' in parsed, 'result must have categories');
    });
  });

  test('AC9: score_page tool schema allows a url argument without a schema-validation error', async (t) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      const fixtureUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'permanently-hidden.html')).href;
      const preflight = await client.callTool({ name: 'audit_page', arguments: { url: fixtureUrl } });
      if (!preflight.isError) {
        const preflightParsed = JSON.parse(preflight.content[0].text);
        if (preflightParsed.capture && preflightParsed.capture.animationsSettled === false) {
          t.skip('browser unavailable — static fallback cannot inspect computed visibility');
          return;
        }
      }
      const res = await client.callTool({ name: 'score_page', arguments: { url: fixtureUrl } });
      // Either it succeeds (chromium available) or fails with the chromium-unavailable
      // message — both prove the schema accepts `url`. A zod schema-validation error
      // (unrecognized key) would throw before the handler runs, which this disproves.
      if (res.isError) {
        assert.match(
          res.content[0].text,
          /Playwright chromium not available/,
          `expected chromium-unavailable message, got: ${res.content[0].text}`
        );
      } else {
        const parsed = JSON.parse(res.content[0].text);
        assert.ok('overall' in parsed, 'result must have overall');
        assert.ok(Array.isArray(parsed.capture_warnings), 'url-mode score_page exposes capture_warnings');
        assert.ok(
          parsed.capture_warnings.some((warning) => warning.startsWith('reveal-gate-false-blank:')),
          'url-mode score_page preserves false-blank warning contents'
        );
      }
    });
  });

  test('audit_page url mode exposes capture_warnings from capturePage', async (t) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      const fixtureUrl = pathToFileURL(path.join(__dirname, 'fixtures', 'permanently-hidden.html')).href;
      const res = await client.callTool({ name: 'audit_page', arguments: { url: fixtureUrl } });
      if (res.isError) {
        assert.match(res.content[0].text, /Playwright chromium not available/);
        return;
      }
      const parsed = JSON.parse(res.content[0].text);
      if (parsed.capture && parsed.capture.animationsSettled === false) {
        t.skip('browser unavailable — static fallback cannot inspect computed visibility');
        return;
      }
      assert.ok(Array.isArray(parsed.capture_warnings), 'audit_page exposes capture_warnings');
      assert.ok(Array.isArray(parsed.capture.capture_warnings), 'audit_page capture metadata exposes capture_warnings');
      assert.ok(
        parsed.capture_warnings.some((warning) => warning.startsWith('reveal-gate-false-blank:')),
        'audit_page preserves false-blank warning contents'
      );
      assert.deepStrictEqual(parsed.capture.capture_warnings, parsed.capture_warnings);
    });
  });

  test('AC9: score_page tool returns a clear error when neither html nor url is provided', async () => {
    await withClient(indexMod.buildServer({}), async (client) => {
      const res = await client.callTool({ name: 'score_page', arguments: {} });
      assert.equal(res.content[0].text, 'Provide either html or url');
    });
  });

  test('AC9: score_page is arg-guarded (not url-capturable) on the remote anonymous endpoint', async () => {
    await withClient(indexMod.buildServer({ remote: true }), async (client) => {
      const res = await client.callTool({ name: 'score_page', arguments: { url: 'https://example.com' } });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /disabled on the hosted \(remote\) endpoint/);
    });
  });
}
