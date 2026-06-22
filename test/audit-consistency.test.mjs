/**
 * audit-consistency.test.mjs
 *
 * Deterministic unit tests for the `audit_consistency` feature.
 * Asserts acceptance criteria AC 1–10 from SPEC.md (2026-06-21).
 * Fixtures mirror the issue #9 real examples:
 *   - hero: get-started (text-display-xl) vs changelog (text-display-md)
 *   - container: container-wide vs container-wide max-w-3xl (class path)
 *              + max-width:1152px vs max-width:768px (px path)
 *
 * Usage:  node --test test/audit-consistency.test.mjs
 *   or:   npm run build && node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Resolve module path ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distModule = path.resolve(__dirname, '../dist/audit-consistency.js');

// ── Load built module — single failing test if absent (exit 1, NOT exit 0) ──

let auditConsistency;

try {
  const mod = await import(distModule);
  auditConsistency = mod.auditConsistency;
  if (typeof auditConsistency !== 'function') {
    throw new Error(
      `dist/audit-consistency.js found but auditConsistency is not a function (got ${typeof auditConsistency})`
    );
  }
} catch (err) {
  test('dist/audit-consistency.js: module available', () => {
    assert.fail(
      `dist/audit-consistency.js not found or does not export auditConsistency — run \`npm run build\` first.\n` +
      `(${err.message})`
    );
  });
  // Exit 1 so a missing build is NOT masked as a pass
  process.exit(1);
}

// ── HTML fixture helpers ─────────────────────────────────────────────────────

/**
 * Wrap content in a minimal but valid HTML page.
 */
function page(name, bodyHtml) {
  return {
    name,
    html: `<!doctype html><html><body>${bodyHtml}</body></html>`,
  };
}

// ── AC4 — Issue #9 hero defect fixture ──────────────────────────────────────
//
// get-started uses text-display-xl (the canonical hero tier on the site)
// changelog  uses text-display-md  (off-system, exactly as in issue #9)
//
// Expected: consistency/hero-tier warning; changelog is among hero outliers.
// The no-modal tie rule on exactly-2 pages allows both to be outliers, but
// the spec says "changelog (or both, per the no-modal tie rule)".
// We assert: issue exists AND changelog is in the outliers array.

test('AC4 — hero defect (issue #9): consistency/hero-tier warning emitted; changelog is a hero outlier', () => {
  const pages = [
    page('get-started', `
      <div class="container-wide">
        <h1 class="font-display font-extrabold text-display-xl">Welcome to Get Started</h1>
        <p>Introduction copy.</p>
      </div>
    `),
    page('changelog', `
      <div class="container-wide">
        <h1 class="text-display-md">Changelog</h1>
        <p>Release notes.</p>
      </div>
    `),
  ];

  const result = auditConsistency(pages);

  // An issue with rule consistency/hero-tier must exist
  const heroIssue = result.issues.find((i) => i.rule === 'consistency/hero-tier');
  assert.ok(
    heroIssue !== undefined,
    `Expected a consistency/hero-tier issue but got issues: ${JSON.stringify(result.issues.map((i) => i.rule))}`
  );
  assert.strictEqual(
    heroIssue.severity,
    'warning',
    `consistency/hero-tier must have severity "warning", got "${heroIssue.severity}"`
  );

  // changelog must be in the hero outliers
  const heroOutliers = result.consistency.hero.outliers;
  assert.ok(
    Array.isArray(heroOutliers),
    'consistency.hero.outliers must be an array'
  );
  assert.ok(
    heroOutliers.includes('changelog'),
    `"changelog" must be in consistency.hero.outliers, got [${heroOutliers.join(', ')}]`
  );
});

// ── AC5a — Issue #9 container defect: class-token path ──────────────────────
//
// home:      container-wide
// changelog: container-wide max-w-3xl
//
// Expected: consistency/container-width warning; the page with the extra
// max-w-3xl class is flagged (changelog).

test('AC5a — container defect class path: consistency/container-width warning; narrowed page is a container outlier', () => {
  const pages = [
    page('home', `
      <div class="container-wide">
        <h1 class="text-display-xl">Home</h1>
        <p>Main content.</p>
      </div>
    `),
    page('changelog', `
      <div class="container-wide max-w-3xl">
        <h1 class="text-display-xl">Changelog</h1>
        <p>Release notes.</p>
      </div>
    `),
  ];

  const result = auditConsistency(pages);

  const containerIssue = result.issues.find((i) => i.rule === 'consistency/container-width');
  assert.ok(
    containerIssue !== undefined,
    `Expected a consistency/container-width issue but got issues: ${JSON.stringify(result.issues.map((i) => i.rule))}`
  );
  assert.strictEqual(
    containerIssue.severity,
    'warning',
    `consistency/container-width must have severity "warning", got "${containerIssue.severity}"`
  );

  const containerOutliers = result.consistency.container.outliers;
  assert.ok(
    Array.isArray(containerOutliers),
    'consistency.container.outliers must be an array'
  );
  assert.ok(
    containerOutliers.includes('changelog'),
    `"changelog" must be in consistency.container.outliers for the max-w-3xl narrowed page, got [${containerOutliers.join(', ')}]`
  );
});

// ── AC5b — Issue #9 container defect: px-style path ─────────────────────────
//
// standard: max-width:1152px  (canonical container token on the site)
// narrow:   max-width:768px   (off-system, exactly as in issue #9)
//
// Expected: consistency/container-width warning; the 768px page is flagged.

test('AC5b — container defect px path: consistency/container-width warning; 768px page is a container outlier', () => {
  const pages = [
    page('features', `
      <div style="max-width:1152px;margin:0 auto">
        <h1 class="text-display-xl">Features</h1>
      </div>
    `),
    page('changelog', `
      <div style="max-width:768px;margin:0 auto">
        <h1 class="text-display-xl">Changelog</h1>
      </div>
    `),
  ];

  const result = auditConsistency(pages);

  const containerIssue = result.issues.find((i) => i.rule === 'consistency/container-width');
  assert.ok(
    containerIssue !== undefined,
    `Expected a consistency/container-width issue but got issues: ${JSON.stringify(result.issues.map((i) => i.rule))}`
  );

  const containerOutliers = result.consistency.container.outliers;
  assert.ok(
    containerOutliers.includes('changelog'),
    `"changelog" (768px page) must be in consistency.container.outliers, got [${containerOutliers.join(', ')}]`
  );
});

// ── AC6 — Consistent 3-page corpus ──────────────────────────────────────────
//
// All 3 pages share the same hero class and the same container width.
// Expected: issues === [], score === 100, grade === "A", both outlier arrays empty.

test('AC6 — consistent corpus: no issues, score 100, grade A, no outliers', () => {
  const pages = [
    page('home', `
      <div style="max-width:1152px;margin:0 auto">
        <h1 class="text-display-xl">Home</h1>
      </div>
    `),
    page('about', `
      <div style="max-width:1152px;margin:0 auto">
        <h1 class="text-display-xl">About</h1>
      </div>
    `),
    page('contact', `
      <div style="max-width:1152px;margin:0 auto">
        <h1 class="text-display-xl">Contact</h1>
      </div>
    `),
  ];

  const result = auditConsistency(pages);

  assert.deepEqual(
    result.issues,
    [],
    `Expected no issues for consistent corpus, got: ${JSON.stringify(result.issues)}`
  );
  assert.strictEqual(result.score, 100, `Expected score 100, got ${result.score}`);
  assert.strictEqual(result.grade, 'A', `Expected grade "A", got "${result.grade}"`);
  assert.deepEqual(
    result.consistency.hero.outliers,
    [],
    `Expected no hero outliers, got [${result.consistency.hero.outliers.join(', ')}]`
  );
  assert.deepEqual(
    result.consistency.container.outliers,
    [],
    `Expected no container outliers, got [${result.consistency.container.outliers.join(', ')}]`
  );
});

// ── AC7 — Modal inference ────────────────────────────────────────────────────
//
// 3 pages: 2 use text-display-xl, 1 uses text-display-md.
// Expected: the lone page (page3) is the only hero outlier;
//           consistency.hero.source === "modal";
//           reference = "text-display-xl".

test('AC7 — modal inference: lone divergent page is the only hero outlier, source=modal', () => {
  const pages = [
    page('page1', `<div><h1 class="text-display-xl">Page One</h1></div>`),
    page('page2', `<div><h1 class="text-display-xl">Page Two</h1></div>`),
    page('page3', `<div><h1 class="text-display-md">Page Three</h1></div>`),
  ];

  const result = auditConsistency(pages);

  assert.strictEqual(
    result.consistency.hero.source,
    'modal',
    `Expected source "modal", got "${result.consistency.hero.source}"`
  );

  // Reference should be the shared majority signature
  assert.ok(
    result.consistency.hero.reference !== null &&
    result.consistency.hero.reference.includes('text-display-xl'),
    `Expected reference to contain "text-display-xl", got "${result.consistency.hero.reference}"`
  );

  const heroOutliers = result.consistency.hero.outliers;
  assert.deepEqual(
    heroOutliers,
    ['page3'],
    `Expected only ["page3"] as hero outlier, got [${heroOutliers.join(', ')}]`
  );

  // Issues should include consistency/hero-tier since there's an outlier
  const heroIssue = result.issues.find((i) => i.rule === 'consistency/hero-tier');
  assert.ok(
    heroIssue !== undefined,
    'Expected consistency/hero-tier issue when there is a hero outlier'
  );
});

// ── AC8 — Token override ─────────────────────────────────────────────────────
//
// 3 pages: 2 use max-width:768px (majority), 1 uses max-width:1152px.
// Supply container_token: 1152 — the majority 768px pages should be outliers,
// not the 1152px page.
// Expected: source === "token", reference === "1152",
//           both 768px pages are container outliers.

test('AC8 — container token override: token-provided reference wins over modal majority', () => {
  const pages = [
    page('landing', `<div style="max-width:1152px;margin:0 auto"><h1 class="text-display-xl">Landing</h1></div>`),
    page('pricing', `<div style="max-width:768px;margin:0 auto"><h1 class="text-display-xl">Pricing</h1></div>`),
    page('about',   `<div style="max-width:768px;margin:0 auto"><h1 class="text-display-xl">About</h1></div>`),
  ];

  const result = auditConsistency(pages, { container_token: 1152 });

  assert.strictEqual(
    result.consistency.container.source,
    'token',
    `Expected source "token" when container_token supplied, got "${result.consistency.container.source}"`
  );

  // Reference must reflect the token value
  assert.ok(
    String(result.consistency.container.reference) === '1152',
    `Expected reference "1152" from token, got "${result.consistency.container.reference}"`
  );

  const containerOutliers = result.consistency.container.outliers;
  assert.ok(
    containerOutliers.includes('pricing'),
    `"pricing" (768px) must be an outlier vs token 1152, got [${containerOutliers.join(', ')}]`
  );
  assert.ok(
    containerOutliers.includes('about'),
    `"about" (768px) must be an outlier vs token 1152, got [${containerOutliers.join(', ')}]`
  );
  assert.ok(
    !containerOutliers.includes('landing'),
    `"landing" (1152px) must NOT be an outlier when token is 1152, got [${containerOutliers.join(', ')}]`
  );

  // Issue must be present
  const containerIssue = result.issues.find((i) => i.rule === 'consistency/container-width');
  assert.ok(
    containerIssue !== undefined,
    'Expected consistency/container-width issue when token-flagged outliers exist'
  );
});

// ── AC8b — hero_token override ───────────────────────────────────────────────
//
// 2 pages use text-display-md (majority), 1 uses text-display-xl.
// Supply hero_token: "text-display-xl" — the 2 majority pages must be flagged.

test('AC8b — hero token override: majority pages are flagged when they diverge from hero_token', () => {
  const pages = [
    page('home',     `<div><h1 class="text-display-xl">Home</h1></div>`),
    page('docs',     `<div><h1 class="text-display-md">Docs</h1></div>`),
    page('support',  `<div><h1 class="text-display-md">Support</h1></div>`),
  ];

  const result = auditConsistency(pages, { hero_token: 'text-display-xl' });

  assert.strictEqual(
    result.consistency.hero.source,
    'token',
    `Expected source "token" when hero_token supplied, got "${result.consistency.hero.source}"`
  );

  const heroOutliers = result.consistency.hero.outliers;
  assert.ok(
    heroOutliers.includes('docs'),
    `"docs" must be a hero outlier vs token text-display-xl, got [${heroOutliers.join(', ')}]`
  );
  assert.ok(
    heroOutliers.includes('support'),
    `"support" must be a hero outlier vs token text-display-xl, got [${heroOutliers.join(', ')}]`
  );
  assert.ok(
    !heroOutliers.includes('home'),
    `"home" (text-display-xl) must NOT be an outlier vs token text-display-xl`
  );
});

// ── AC9 — Unknown/empty signatures are not outliers ──────────────────────────
//
// Two pages: one has a declared container (1152px), one has NO container class
// and NO max-width. The no-container page must not appear in container.outliers.

test('AC9 — page with no container declaration is NOT a container outlier', () => {
  const pages = [
    page('home',        `<div style="max-width:1152px;margin:0 auto"><h1 class="text-display-xl">Home</h1></div>`),
    page('minimal',     `<div><h1 class="text-display-xl">Minimal</h1></div>`),
  ];

  const result = auditConsistency(pages);

  const containerOutliers = result.consistency.container.outliers;
  assert.ok(
    !containerOutliers.includes('minimal'),
    `"minimal" (no container declaration) must NOT be a container outlier, got [${containerOutliers.join(', ')}]`
  );
});

// ── AC3 — Per-page extraction ─────────────────────────────────────────────────
//
// Assert that result.pages[i].container.classes is a sorted unique array,
// hero.classes comes from the first <h1>, and page_count === pages.length.

test('AC3 — per-page extraction: container.classes sorted+unique, hero.classes from first h1, page_count correct', () => {
  const pages = [
    page('alpha', `
      <div class="max-w-3xl container-wide max-w-3xl w-full">
        <h1 class="text-display-xl font-bold">Alpha</h1>
        <h1 class="text-display-md">Should be ignored</h1>
      </div>
    `),
    page('beta', `
      <div class="container-wide">
        <h1 class="text-display-xl">Beta</h1>
      </div>
    `),
  ];

  const result = auditConsistency(pages);

  // page_count must equal the number of input pages
  assert.strictEqual(
    result.page_count,
    pages.length,
    `Expected page_count ${pages.length}, got ${result.page_count}`
  );

  // Check alpha's extraction
  const alphaPage = result.pages.find((p) => p.name === 'alpha');
  assert.ok(alphaPage, 'result.pages must contain an entry for "alpha"');

  // container.classes must be a sorted, unique array
  const classes = alphaPage.container.classes;
  assert.ok(Array.isArray(classes), 'container.classes must be an array');

  // Sorted: each element must be <= the next
  for (let i = 1; i < classes.length; i++) {
    assert.ok(
      classes[i - 1] <= classes[i],
      `container.classes must be sorted: found "${classes[i - 1]}" before "${classes[i]}"`
    );
  }

  // Unique: no duplicates
  const unique = [...new Set(classes)];
  assert.strictEqual(
    classes.length,
    unique.length,
    `container.classes must be unique, got duplicates: [${classes.join(', ')}]`
  );

  // hero.classes must come from the FIRST h1 (text-display-xl font-bold), not the second
  assert.ok(
    typeof alphaPage.hero.classes === 'string',
    'hero.classes must be a string'
  );
  assert.ok(
    alphaPage.hero.classes.includes('text-display-xl'),
    `hero.classes must come from the first <h1> (text-display-xl), got "${alphaPage.hero.classes}"`
  );
  assert.ok(
    !alphaPage.hero.classes.includes('text-display-md'),
    `hero.classes must NOT come from the second <h1> (text-display-md), got "${alphaPage.hero.classes}"`
  );
});

// ── AC10 — Scoring formula ────────────────────────────────────────────────────
//
// failCount 0: score 100, grade A
// failCount 1: score 50,  grade C
// failCount 2: score 0,   grade D

test('AC10 — scoring: failCount=0 → score 100, grade A', () => {
  // Already covered by AC6 above; restate here for clarity
  const pages = [
    page('p1', `<div style="max-width:1152px"><h1 class="text-display-xl">P1</h1></div>`),
    page('p2', `<div style="max-width:1152px"><h1 class="text-display-xl">P2</h1></div>`),
  ];
  const result = auditConsistency(pages);
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.grade, 'A');
});

test('AC10 — scoring: failCount=1 → score 50, grade C', () => {
  // Container consistent, hero diverges (2 pages)
  const pages = [
    page('p1', `<div style="max-width:1152px"><h1 class="text-display-xl">P1</h1></div>`),
    page('p2', `<div style="max-width:1152px"><h1 class="text-display-md">P2</h1></div>`),
  ];
  const result = auditConsistency(pages);
  // hero diverges → 1 fail
  assert.strictEqual(result.score, 50, `Expected score 50 (1 failing dimension), got ${result.score}`);
  assert.strictEqual(result.grade, 'C', `Expected grade "C" (1 failing dimension), got "${result.grade}"`);
});

test('AC10 — scoring: failCount=2 → score 0, grade D', () => {
  // Both hero and container diverge
  const pages = [
    page('p1', `<div style="max-width:1152px"><h1 class="text-display-xl">P1</h1></div>`),
    page('p2', `<div style="max-width:768px"><h1 class="text-display-md">P2</h1></div>`),
  ];
  const result = auditConsistency(pages);
  // Both dimensions fail → score 0, grade D
  assert.strictEqual(result.score, 0, `Expected score 0 (2 failing dimensions), got ${result.score}`);
  assert.strictEqual(result.grade, 'D', `Expected grade "D" (2 failing dimensions), got "${result.grade}"`);
});

// ── AC10 — Result shape & JSON-serialisable ──────────────────────────────────

test('AC10 — result shape: all required top-level keys present and JSON-serialisable', () => {
  const pages = [
    page('p1', `<div style="max-width:1152px"><h1 class="text-display-xl">P1</h1></div>`),
    page('p2', `<div style="max-width:1152px"><h1 class="text-display-xl">P2</h1></div>`),
  ];

  const result = auditConsistency(pages);

  // Top-level keys per the ConsistencyResult contract
  const requiredKeys = ['page_count', 'pages', 'consistency', 'issues', 'score', 'grade', 'summary'];
  for (const key of requiredKeys) {
    assert.ok(
      key in result,
      `ConsistencyResult missing required key: "${key}"`
    );
  }

  // Nested consistency shape
  assert.ok('container' in result.consistency, 'consistency.container must exist');
  assert.ok('hero' in result.consistency, 'consistency.hero must exist');

  for (const dim of ['container', 'hero']) {
    const d = result.consistency[dim];
    assert.ok('reference' in d, `consistency.${dim}.reference must exist`);
    assert.ok('source' in d, `consistency.${dim}.source must exist`);
    assert.ok('outliers' in d, `consistency.${dim}.outliers must exist`);
    assert.ok(Array.isArray(d.outliers), `consistency.${dim}.outliers must be an array`);
    assert.ok(
      ['token', 'modal', 'none'].includes(d.source),
      `consistency.${dim}.source must be "token" | "modal" | "none", got "${d.source}"`
    );
  }

  // Must be fully JSON-serialisable (no circular refs, no undefined values in required fields)
  let serialised;
  assert.doesNotThrow(
    () => { serialised = JSON.stringify(result); },
    'ConsistencyResult must be JSON.stringify-able without throwing'
  );
  assert.ok(typeof serialised === 'string' && serialised.length > 0, 'serialised result must be a non-empty string');
});

// ── AC2 — Exactly 2 pages does not throw ─────────────────────────────────────

test('AC2 — calling with exactly 2 pages does not throw', () => {
  const pages = [
    page('first',  `<div><h1 class="text-display-xl">First</h1></div>`),
    page('second', `<div><h1 class="text-display-xl">Second</h1></div>`),
  ];
  assert.doesNotThrow(
    () => auditConsistency(pages),
    'auditConsistency must not throw when called with exactly 2 pages'
  );
});
