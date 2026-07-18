/**
 * compact.test.mjs
 *
 * Tests for the compact response helpers in dist/compact.js.
 * Runs after `npm run build` (tsc must have produced dist/compact.js).
 *
 * Usage:  node --test test/
 *   or:   node --test test/compact.test.mjs
 *
 * All three helpers must be pure (no input mutation) and drop only the
 * documented bulk fields, preserving every decision-grade field verbatim.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Resolve paths ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCompact = path.resolve(__dirname, '../dist/compact.js');

// ── Load built module (skip gracefully if tsc hasn't run yet) ─────────────────

let compactAuditPage;
let compactEvaluation;
let compactAuditUrl;

try {
  const mod = await import(distCompact);
  compactAuditPage = mod.compactAuditPage;
  compactEvaluation = mod.compactEvaluation;
  compactAuditUrl = mod.compactAuditUrl;
} catch (err) {
  // Hard failure, not a silent skip: a missing dist means tsc didn't run (or
  // failed), and exiting 0 here would mask every assertion as a green run.
  console.error(`dist/compact.js not found — run \`npm run build\` first. (${err.message})`);
  process.exit(1);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

// A large base64-like blob (~25 KB) used to simulate screenshot_bytes
const FAKE_BASE64 = 'AAAA'.repeat(6250); // 25000 chars, unique marker

// A full url-mode audit_page result
function makeFullAuditPageResult() {
  return {
    score: 88,
    grade: 'B',
    summary: 'Good page with minor issues.',
    passes: ['rule/a', 'rule/b', 'rule/c'],
    errors: [{ severity: 'error', rule: 'color-contrast', message: 'Insufficient contrast', fix: 'Increase contrast ratio' }],
    warnings: [],
    capture_warnings: ['reveal-gate-false-blank: 50% of text nodes invisible at capture'],
    fix_priority: ['color-contrast: Increase contrast ratio'],
    capture: {
      url: 'http://example.com',
      viewport: { w: 1440, h: 900 },
      scrolledToBottom: true,
      capture_warnings: ['reveal-gate-false-blank: 50% of text nodes invisible at capture'],
      screenshot_bytes: FAKE_BASE64,
    },
  };
}

// A full evaluate_design result
const UNIQUE_PRINCIPLE_BODY = 'This-is-a-unique-principle-summary-body-that-must-not-appear-in-compact-output';
function makeFullEvaluationResult() {
  return {
    design_description: 'A checkout flow redesign',
    context: 'E-commerce, mobile-first',
    goals: ['conversion', 'trust'],
    principles_to_check: [
      {
        id: 'p1',
        name: 'Clarity',
        summary: UNIQUE_PRINCIPLE_BODY,
        common_violations: ['Buried CTA', 'Ambiguous labels'],
        what_to_verify: ['Is the primary action obvious?'],
      },
      {
        id: 'p2',
        name: 'Trust',
        summary: 'Another long principle body text that should be stripped',
        common_violations: ['Missing security badges'],
        what_to_verify: ['Are trust signals present?'],
      },
    ],
    applicable_patterns: [
      {
        id: 'pat1',
        name: 'Progressive Disclosure',
        checklist: ['Show summary first', 'Reveal detail on demand', 'Avoid cognitive overload'],
      },
      {
        id: 'pat2',
        name: 'Social Proof',
        checklist: ['Display reviews', 'Show ratings count'],
      },
    ],
    evaluation_guidance: 'Focus on the above-the-fold region.',
    total_principles: 2,
    total_patterns: 2,
  };
}

// A full audit_url result
const FAKE_SCREENSHOT = 'BBBB'.repeat(6250); // 25000 chars
function makeFullAuditUrlResult() {
  return {
    tool: 'audit_url',
    url: 'http://example.com',
    viewports: ['desktop 1440×900'],
    themes: ['light'],
    captures: [
      {
        viewport: 'desktop 1440×900',
        theme: 'light',
        scrolledToBottom: true,
        capture_warnings: ['reveal-gate-false-blank: 50% of text/content nodes invisible at capture'],
        screenshot_bytes: 1234,
        screenshot: FAKE_SCREENSHOT,
      },
    ],
    findings: [
      { severity: 'error', rule: 'missing-alt', message: 'Image missing alt text', fix: 'Add descriptive alt' },
    ],
    counts: { errors: 1, warnings: 0, passes: 12 },
    summary: 'One critical error found.',
    warnings: ['capture failed (wide 2160×1200/dark): timeout'],
    capture_warnings: ['desktop 1440×900/light: reveal-gate-false-blank: 50% of text nodes invisible at capture'],
  };
}

// ── compactAuditPage tests ────────────────────────────────────────────────────

test('compactAuditPage: drops passes array, adds passes_count', () => {
  const full = makeFullAuditPageResult();
  const compact = compactAuditPage(full);

  assert.ok(!('passes' in compact), 'compact output must not have a passes key');
  assert.equal(compact.passes_count, 3, 'passes_count must equal passes.length');
});

test('compactAuditPage: strips screenshot_bytes from capture, preserves other capture fields', () => {
  const full = makeFullAuditPageResult();
  const compact = compactAuditPage(full);

  assert.ok('capture' in compact, 'capture key must be present');
  assert.ok(!('screenshot_bytes' in compact.capture), 'capture.screenshot_bytes must be stripped');
  assert.equal(compact.capture.url, 'http://example.com', 'capture.url preserved');
  assert.deepEqual(compact.capture.viewport, { w: 1440, h: 900 }, 'capture.viewport preserved');
  assert.equal(compact.capture.scrolledToBottom, true, 'capture.scrolledToBottom preserved');
});

test('compactAuditPage: preserves score, grade, summary, errors, warnings, fix_priority', () => {
  const full = makeFullAuditPageResult();
  const compact = compactAuditPage(full);

  assert.equal(compact.score, 88);
  assert.equal(compact.grade, 'B');
  assert.equal(compact.summary, 'Good page with minor issues.');
  assert.deepEqual(compact.errors, full.errors);
  assert.deepEqual(compact.warnings, full.warnings);
  assert.deepEqual(compact.fix_priority, full.fix_priority);
  assert.deepEqual(compact.capture_warnings, full.capture_warnings, 'capture integrity warnings preserved');
  assert.deepEqual(compact.capture.capture_warnings, full.capture.capture_warnings, 'per-capture warnings preserved');
});

test('compactAuditPage: preserves optional notes, unloaded_video_artifacts, adversarial_verification when present', () => {
  const full = makeFullAuditPageResult();
  full.notes = ['Note A', 'Note B'];
  full.unloaded_video_artifacts = [{ selector: 'video#hero' }];
  full.adversarial_verification = { passed: true, checks: [] };

  const compact = compactAuditPage(full);

  assert.deepEqual(compact.notes, full.notes, 'notes preserved');
  assert.deepEqual(compact.unloaded_video_artifacts, full.unloaded_video_artifacts, 'unloaded_video_artifacts preserved');
  assert.deepEqual(compact.adversarial_verification, full.adversarial_verification, 'adversarial_verification preserved');
});

test('compactAuditPage: html-mode input (no capture key) is handled losslessly', () => {
  const full = makeFullAuditPageResult();
  delete full.capture;

  const compact = compactAuditPage(full);

  assert.ok(!('capture' in compact), 'capture must remain absent for html-mode input');
  assert.equal(compact.passes_count, 3, 'passes_count still set for html-mode');
  assert.ok(!('passes' in compact), 'passes still dropped for html-mode');
});

test('compactAuditPage: does not mutate input (no-mutation)', () => {
  const full = makeFullAuditPageResult();
  const originalClone = structuredClone(full);

  compactAuditPage(full);

  assert.ok(Array.isArray(full.passes), 'input.passes must still be an array after compaction');
  assert.equal(full.passes.length, 3, 'input.passes length unchanged');
  assert.equal(full.capture.screenshot_bytes, FAKE_BASE64, 'input.capture.screenshot_bytes must be untouched');
  assert.deepEqual(full, originalClone, 'input object deep-equal to its pre-call clone');
});

// ── compactEvaluation tests ───────────────────────────────────────────────────

test('compactEvaluation: principles_to_check reduced to [{id,name}] only', () => {
  const full = makeFullEvaluationResult();
  const compact = compactEvaluation(full);

  for (const principle of compact.principles_to_check) {
    const keys = Object.keys(principle);
    assert.deepEqual(keys.sort(), ['id', 'name'].sort(), `principle must have exactly keys id,name — got: ${keys.join(',')}`);
    assert.ok(!('summary' in principle), 'summary must be stripped');
    assert.ok(!('common_violations' in principle), 'common_violations must be stripped');
    assert.ok(!('what_to_verify' in principle), 'what_to_verify must be stripped');
  }
  assert.equal(compact.principles_to_check[0].id, 'p1');
  assert.equal(compact.principles_to_check[0].name, 'Clarity');
  assert.equal(compact.principles_to_check[1].id, 'p2');
  assert.equal(compact.principles_to_check[1].name, 'Trust');
});

test('compactEvaluation: applicable_patterns reduced to [{id,name}] only', () => {
  const full = makeFullEvaluationResult();
  const compact = compactEvaluation(full);

  for (const pattern of compact.applicable_patterns) {
    const keys = Object.keys(pattern);
    assert.deepEqual(keys.sort(), ['id', 'name'].sort(), `pattern must have exactly keys id,name — got: ${keys.join(',')}`);
    assert.ok(!('checklist' in pattern), 'checklist must be stripped');
  }
  assert.equal(compact.applicable_patterns[0].id, 'pat1');
  assert.equal(compact.applicable_patterns[0].name, 'Progressive Disclosure');
});

test('compactEvaluation: preserves counts, design_description, context, goals, evaluation_guidance', () => {
  const full = makeFullEvaluationResult();
  const compact = compactEvaluation(full);

  assert.equal(compact.total_principles, 2);
  assert.equal(compact.total_patterns, 2);
  assert.equal(compact.design_description, 'A checkout flow redesign');
  assert.equal(compact.context, 'E-commerce, mobile-first');
  assert.deepEqual(compact.goals, ['conversion', 'trust']);
  assert.equal(compact.evaluation_guidance, 'Focus on the above-the-fold region.');
});

test('compactEvaluation: preserves fix_confirmed and before_after_diff when present', () => {
  const full = makeFullEvaluationResult();
  full.fix_confirmed = true;
  full.before_after_diff = { before: 'old state', after: 'new state' };

  const compact = compactEvaluation(full);

  assert.equal(compact.fix_confirmed, true, 'fix_confirmed preserved');
  assert.deepEqual(compact.before_after_diff, full.before_after_diff, 'before_after_diff preserved');
});

test('compactEvaluation: does not mutate input (no-mutation)', () => {
  const full = makeFullEvaluationResult();
  const originalClone = structuredClone(full);

  compactEvaluation(full);

  assert.equal(
    full.principles_to_check[0].summary,
    UNIQUE_PRINCIPLE_BODY,
    'input.principles_to_check[0].summary must remain after compaction'
  );
  assert.ok(Array.isArray(full.principles_to_check[0].common_violations), 'input.common_violations must remain');
  assert.ok(Array.isArray(full.applicable_patterns[0].checklist), 'input.checklist must remain');
  assert.deepEqual(full, originalClone, 'input object deep-equal to its pre-call clone');
});

// ── compactAuditUrl tests ─────────────────────────────────────────────────────

test('compactAuditUrl: strips screenshot field from every captures row, retains screenshot_bytes number', () => {
  const full = makeFullAuditUrlResult();
  const compact = compactAuditUrl(full);

  assert.equal(compact.captures.length, 1);
  const row = compact.captures[0];
  assert.ok(!('screenshot' in row), 'screenshot base64 must be stripped from captures row');
  assert.equal(row.screenshot_bytes, 1234, 'screenshot_bytes number preserved');
  assert.equal(row.viewport, 'desktop 1440×900', 'viewport preserved');
  assert.equal(row.theme, 'light', 'theme preserved');
  assert.equal(row.scrolledToBottom, true, 'scrolledToBottom preserved');
});

test('compactAuditUrl: preserves findings, counts, summary verbatim', () => {
  const full = makeFullAuditUrlResult();
  const compact = compactAuditUrl(full);

  assert.deepEqual(compact.findings, full.findings, 'findings preserved');
  assert.deepEqual(compact.counts, full.counts, 'counts preserved');
  assert.equal(compact.summary, full.summary, 'summary preserved');
  assert.deepEqual(compact.warnings, full.warnings, 'warnings preserved verbatim');
  assert.deepEqual(compact.capture_warnings, full.capture_warnings, 'capture integrity warnings preserved');
  assert.deepEqual(compact.captures[0].capture_warnings, full.captures[0].capture_warnings, 'per-capture warnings preserved');
});

test('compactAuditUrl: does not mutate input (no-mutation)', () => {
  const full = makeFullAuditUrlResult();
  const originalClone = structuredClone(full);

  compactAuditUrl(full);

  assert.equal(full.captures[0].screenshot, FAKE_SCREENSHOT, 'input.captures[0].screenshot must be untouched');
  assert.deepEqual(full, originalClone, 'input object deep-equal to its pre-call clone');
});

// ── Size-win tests (AC 5) ─────────────────────────────────────────────────────

test('compactAuditPage: size win — compact JSON is < 20% of full JSON and contains no base64 blob', () => {
  const full = makeFullAuditPageResult();
  const fullLen = JSON.stringify(full).length;
  const compactStr = JSON.stringify(compactAuditPage(full));

  assert.ok(
    compactStr.length < fullLen * 0.2,
    `compact JSON length ${compactStr.length} should be < 20% of full JSON length ${fullLen} (ratio: ${(compactStr.length / fullLen).toFixed(3)})`
  );
  assert.ok(
    !compactStr.includes(FAKE_BASE64),
    'compact JSON must not contain the base64 blob from screenshot_bytes'
  );
});

test('compactEvaluation: size win — compact JSON is < 20% of full JSON and contains no principle body text', () => {
  // Build a more bloated evaluation to make the size contrast dramatic
  const full = makeFullEvaluationResult();
  // Add more principles with long bodies
  for (let i = 3; i <= 15; i++) {
    full.principles_to_check.push({
      id: `p${i}`,
      name: `Principle ${i}`,
      summary: UNIQUE_PRINCIPLE_BODY + ' '.repeat(i * 100) + `END-BODY-${i}`,
      common_violations: Array.from({ length: 10 }, (_, j) => `Violation detail text item ${j} for principle ${i} — very long description`),
      what_to_verify: Array.from({ length: 10 }, (_, j) => `Verification question ${j} for principle ${i} — requires careful inspection`),
    });
    full.applicable_patterns.push({
      id: `pat${i}`,
      name: `Pattern ${i}`,
      checklist: Array.from({ length: 10 }, (_, j) => `Checklist item ${j} for pattern ${i} — detailed instruction text here`),
    });
  }
  full.total_principles = full.principles_to_check.length;
  full.total_patterns = full.applicable_patterns.length;

  const fullLen = JSON.stringify(full).length;
  const compactStr = JSON.stringify(compactEvaluation(full));

  assert.ok(
    compactStr.length < fullLen * 0.2,
    `compact JSON length ${compactStr.length} should be < 20% of full JSON length ${fullLen} (ratio: ${(compactStr.length / fullLen).toFixed(3)})`
  );
  assert.ok(
    !compactStr.includes(UNIQUE_PRINCIPLE_BODY),
    'compact JSON must not contain the unique principle body marker string'
  );
});

test('compactAuditUrl: size win — compact JSON is < 20% of full JSON and contains no screenshot base64', () => {
  const full = makeFullAuditUrlResult();
  const fullLen = JSON.stringify(full).length;
  const compactStr = JSON.stringify(compactAuditUrl(full));

  assert.ok(
    compactStr.length < fullLen * 0.2,
    `compact JSON length ${compactStr.length} should be < 20% of full JSON length ${fullLen} (ratio: ${(compactStr.length / fullLen).toFixed(3)})`
  );
  assert.ok(
    !compactStr.includes(FAKE_SCREENSHOT),
    'compact JSON must not contain the base64 screenshot'
  );
});
