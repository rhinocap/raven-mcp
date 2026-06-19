/**
 * audit-url.test.mjs
 *
 * Acceptance tests for the Layer-0 audit_url render-and-capture transport
 * (dist/audit-url.js). Runs after `npm run build`.
 *
 * Reproduces each escape class on test/fixtures/audit-url-fixture.html and
 * asserts audit_url catches all of them and false-positives none. If Playwright
 * chromium is unavailable, all tests skip (rather than fail).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distAuditUrl = path.resolve(__dirname, '../dist/audit-url.js');
const distCapture = path.resolve(__dirname, '../dist/capture.js');
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixtureUrl(name) {
  return pathToFileURL(path.join(fixturesDir, name)).href;
}

let auditUrl;
let CaptureUnavailableError;
try {
  ({ auditUrl } = await import(distAuditUrl));
  ({ CaptureUnavailableError } = await import(distCapture));
} catch (err) {
  const msg = `dist not found — run \`npm run build\` first. (${err.message})`;
  test('audit_url module available', (t) => { t.skip(msg); });
  process.exit(0);
}

const URL = fixtureUrl('audit-url-fixture.html');

// Run the audit ONCE (with interactions) and share the result across tests.
// chromium-unavailable → leave result null and every test skips.
let result = null;
let unavailable = false;
let runError = null;
try {
  result = await auditUrl(URL, {
    viewports: [{ w: 390, h: 800, label: 'iphone' }, { w: 1440, h: 900, label: 'desktop' }],
    themes: ['light'],
    scroll_settle: true,
    interactions: [{ selector: '.theme-fab', event: 'hover', delay_ms: 250 }],
  });
  // The unavailable path returns a result whose summary names the chromium hint.
  if (result && /headless chromium/.test(result.summary)) {
    unavailable = true;
  }
} catch (err) {
  if (CaptureUnavailableError && err instanceof CaptureUnavailableError) {
    unavailable = true;
  } else {
    runError = err;
  }
}

function guard(t) {
  if (runError) throw runError;
  if (unavailable || !result) {
    t.skip('Playwright chromium not installed. Run `npx playwright install chromium`.');
    return false;
  }
  return true;
}

const has = (pred) => result.findings.some(pred);

test('case 1 — responsive: content lede flagged as desktop-visible/mobile-hidden', (t) => {
  if (!guard(t)) return;
  const lede = result.findings.find(
    (f) => f.source === 'responsive-visibility' && (f.selector || '').includes('p')
  );
  assert.ok(lede, 'a responsive-visibility finding for the lede paragraph exists');
  assert.strictEqual(lede.severity, 'error', 'content hidden-on-mobile is an error');
  assert.strictEqual(lede.verdict, 'confirmed', 'verdict is confirmed (computed across breakpoints)');
  assert.match(lede.evidence, /390px=hidden/, 'evidence shows hidden at mobile breakpoint');
});

test('case 2 — video: playing clip NOT flagged, empty container IS flagged', (t) => {
  if (!guard(t)) return;
  const emptyFlagged = has((f) => f.source === 'video' && (f.selector || '').includes('emptyvid'));
  const playingFlagged = has((f) => f.source === 'video' && (f.selector || '').includes('playingvid'));
  assert.ok(emptyFlagged, 'the empty/broken media container is flagged blank');
  assert.ok(!playingFlagged, 'the settled, playing looping video is NOT flagged blank');
});

test('case 3 — hover white-wash caught only when the hover interaction is fired', async (t) => {
  if (!guard(t)) return;
  const wash = result.findings.find((f) => f.source === 'hover-state' && f.rule === 'interaction/state-wash');
  assert.ok(wash, 'the on-hover white-wash is flagged when the interaction fires');
  assert.strictEqual(wash.verdict, 'confirmed');
  assert.match(wash.evidence, /brightness rose/, 'evidence quantifies the brightness wash');

  // And it must NOT appear in a no-interaction audit (proves it is interaction-only).
  const noInteract = await auditUrl(URL, {
    viewports: [{ w: 1440, h: 900, label: 'desktop' }],
    themes: ['light'],
    scroll_settle: true,
  });
  const washWithout = noInteract.findings.some((f) => f.source === 'hover-state');
  assert.ok(!washWithout, 'no hover-state finding without firing the interaction');
});

test('case 4 — sliced image flagged likely-sliced; clean image NOT flagged', (t) => {
  if (!guard(t)) return;
  const sliced = result.findings.find(
    (f) => f.source === 'asset-integrity' && (f.selector || '').includes('sliced')
  );
  assert.ok(sliced, 'the sliced image is flagged');
  assert.strictEqual(sliced.verdict, 'confirmed');
  assert.match(sliced.evidence, /bottom edge/, 'evidence names the cut edge');

  const cleanFlagged = has((f) => f.source === 'asset-integrity' && (f.selector || '').includes('clean'));
  assert.ok(!cleanFlagged, 'the clean image is NOT flagged (no false positive)');
});

test('case 5 — low-contrast text fails AA with a computed ratio; passing text not flagged', (t) => {
  if (!guard(t)) return;
  const fail = result.findings.find(
    (f) => f.source === 'contrast' && (f.selector || '').includes('fails-aa')
  );
  assert.ok(fail, 'the low-contrast text is flagged');
  assert.strictEqual(fail.verdict, 'confirmed');
  assert.match(fail.evidence, /computed ratio [\d.]+:1/, 'evidence carries the computed WCAG ratio');

  const passFlagged = has((f) => f.source === 'contrast' && (f.selector || '').includes('passes-aa'));
  assert.ok(!passFlagged, 'the AA-passing text is NOT flagged');
});

test('case 6 — every finding carries a confirmed/likely-artifact/inconclusive verdict + evidence', (t) => {
  if (!guard(t)) return;
  assert.ok(result.findings.length > 0, 'there are findings to tag');
  const allowed = new Set(['confirmed', 'likely-artifact', 'inconclusive']);
  for (const f of result.findings) {
    assert.ok(allowed.has(f.verdict), `finding ${f.source}/${f.rule} has a valid verdict (${f.verdict})`);
    assert.ok(typeof f.evidence === 'string' && f.evidence.length > 0, `finding ${f.source}/${f.rule} has evidence`);
    assert.ok(['light', 'dark'].includes(f.theme), 'finding tagged with a theme');
    assert.ok(typeof f.viewport === 'string' && f.viewport.length > 0, 'finding tagged with a viewport');
  }
  // counts are internally consistent
  const { total, confirmed, likely_artifact, inconclusive } = result.counts;
  assert.strictEqual(total, result.findings.length, 'counts.total matches findings length');
  assert.strictEqual(confirmed + likely_artifact + inconclusive, total, 'verdict counts sum to total');
});

test('result shape — top-level keys present', (t) => {
  if (!guard(t)) return;
  for (const key of ['tool', 'url', 'viewports', 'themes', 'findings', 'counts', 'summary', 'captures', 'warnings']) {
    assert.ok(key in result, `AuditUrlResult missing key: ${key}`);
  }
  assert.strictEqual(result.tool, 'audit_url');
});
