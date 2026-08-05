import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.RAVEN_NO_USAGE_LOG = '1';

const {
  AUDIT_ROUTES,
  detectAuditSurface,
  dispatchAudit,
  routeAuditTools,
} = await import('../dist/audit-dispatch.js');
const { buildServer } = await import('../dist/index.js');

test('detects each supported surface and refuses ambiguous screenshot-only input', () => {
  const cases = [
    [{ url: 'https://example.com' }, 'web'],
    [{ html: '<main>Hello</main>' }, 'web'],
    [{ nodes: { elements: [] } }, 'web'],
    [{ source: 'Screen.swift' }, 'ios'],
    [{ source: 'import SwiftUI\nstruct Screen: View {}', screenshot: 'png' }, 'ios'],
    [{ source: 'Screen.tsx' }, null],
    [{ source: "import { View } from 'react-native'" }, 'react-native'],
    [{ source: "import { StyleSheet } from 'react-native'\nStyleSheet.create({})" }, 'react-native'],
    [{ diff: 'diff --git a/a b/a' }, 'diff'],
    [{ source: 'diff --git a/a b/a' }, 'diff'],
    [{ url: 'https://example.com/demo.mp4' }, 'video'],
    [{ surface: 'ios', html: '<main>override</main>' }, 'ios'],
  ];
  for (const [input, expected] of cases) assert.equal(detectAuditSurface(input), expected, JSON.stringify(input));
  assert.equal(detectAuditSurface({ screenshot: 'png' }), null);
});

test('web routing returns the full web audit set and selects URL capture when supplied', () => {
  assert.deepEqual(routeAuditTools('web', { html: '<main />' }), [...AUDIT_ROUTES.web]);
  assert.deepEqual(routeAuditTools('web', { url: 'https://example.com' }), [
    'audit_url', 'audit_contrast', 'audit_tap_targets', 'audit_typography',
    'audit_layout', 'audit_responsive_visibility', 'audit_consistency',
    'audit_content', 'audit_taste',
  ]);
});

test('an intent that does not intersect the surface route falls back to the full route, never empty', () => {
  // react-native's only route tool is audit_rn; the a11y intent lists web/ios a11y
  // tools. The intersection is empty, so it must fall back to audit_rn, not run nothing.
  assert.deepEqual(routeAuditTools('react-native', { source: "from 'react-native'", intent: 'accessibility' }), ['audit_rn']);
});

test('contrast intent runs only audit_contrast', async () => {
  const called = [];
  const report = await dispatchAudit(
    {
      html: '<p>Muted</p>',
      intent: 'contrast',
      nodes: [{ selector: 'p', color: '#777', bgColor: '#fff' }],
    },
    { run(tool) { called.push(tool); return { aa_fail_count: 0, warnings: [] }; } },
  );
  assert.deepEqual(called, ['audit_contrast']);
  assert.deepEqual(report.ran, ['audit_contrast']);
  assert.deepEqual(Object.keys(report.findings), ['contrast']);
});

test('merged summary counts native content and typography failures and warnings', async () => {
  const report = await dispatchAudit(
    {
      html: '<h1>Solutions</h1>',
      intent: 'content',
      nodes: { typography: [{ selector: 'h1', fontPx: 32 }] },
    },
    {
      run(tool) {
        if (tool === 'audit_content') return { summary: { total: 2, pass: 0, warn: 1, fail: 1 }, items: [] };
        return { findings: [{ severity: 'warning' }] };
      },
    },
  );
  assert.deepEqual(report.summary, { grade: 'B', failures: 1, warnings: 2 });
});

test('merged summary counts nested device and diff-audit verdicts', async () => {
  const deviceReport = await dispatchAudit(
    {
      surface: 'ios',
      nodes: {
        device_frame: {
          frames: [{ selector: '.phone', verdict: 'cropped' }],
          clips: [{ label: 'hero', verdict: 'inconclusive', warnings: ['no decoder'] }],
        },
      },
    },
    {
      run(tool) {
        if (tool === 'audit_device_frame') {
          return {
            frames: [{ selector: '.phone', verdict: 'cropped' }],
            clips: [{ label: 'hero', verdict: 'inconclusive', warnings: ['no decoder'] }],
            edge_frames: [],
          };
        }
        return {};
      },
    },
  );
  assert.deepEqual(deviceReport.summary, { grade: 'B', failures: 1, warnings: 1 });

  const diffReport = await dispatchAudit(
    {
      surface: 'diff',
      diff: 'diff --git a/a b/a',
      nodes: {
        api_contract: { endpoint_url: 'https://example.com', queries: [], expected_shape_schema: {} },
        asset_integrity: { image_paths: ['/tmp/example.png'] },
      },
    },
    {
      run(tool) {
        if (tool === 'audit_api_contract') return { shape_invalid_count: 0, confident_wrong_count: 0, uncertain_count: 1 };
        if (tool === 'audit_asset_integrity') return { results: [{ verdict: 'likely-sliced', warnings: [] }] };
        return {};
      },
    },
  );
  assert.deepEqual(diffReport.summary, { grade: 'B', failures: 1, warnings: 1 });
});

test('a throwing sub-audit is skipped while the remaining report returns', async () => {
  const report = await dispatchAudit(
    {
      url: 'https://example.com',
      html: '<main>Hello</main>',
      nodes: {
        contrast: [{ selector: 'main', color: '#111', bgColor: '#fff' }],
        tap_targets: [{ selector: 'button', w: 44, h: 44 }],
        typography: [{ selector: 'main', fontPx: 16 }],
        layout: {
          elements: [{ selector: 'main', rect: { x: 0, y: 0, w: 100, h: 100 } }],
          viewport: { w: 100, h: 100 },
        },
        pages: [{ name: 'one', html: '<main>One</main>' }, { name: 'two', html: '<main>Two</main>' }],
        items: [{ type: 'prose', text: 'Hello' }],
      },
    },
    {
      run(tool) {
        if (tool === 'audit_layout') throw new Error('layout exploded');
        return { findings: [], warnings: [] };
      },
    },
  );
  assert.ok(report.ran.includes('audit_url'));
  assert.ok(report.ran.includes('audit_content'));
  assert.ok(!report.ran.includes('audit_layout'));
  assert.deepEqual(report.skipped.find((item) => item.tool === 'audit_layout'), {
    tool: 'audit_layout',
    reason: 'layout exploded',
  });
  assert.deepEqual(report.skipped.find((item) => item.tool === 'audit_taste'), {
    tool: 'audit_taste',
    reason: 'no taste binding',
  });
});

test('ambiguous input returns a clarification without running audits', async () => {
  let calls = 0;
  const report = await dispatchAudit({}, { run() { calls++; return {}; } });
  assert.equal(report.surface, null);
  assert.match(report.clarification, /Which surface/);
  assert.deepEqual(report.ran, []);
  assert.equal(calls, 0);
});

test('registered audit surfaces muted landing-page contrast and points to suggest_contrast_fix', async () => {
  const server = buildServer({ remote: false });
  const html = '<main style="background:#faf8f5"><p class="muted" style="color:#b9b3a8">Quiet proof</p></main>';
  const call = await server._registeredTools.audit.handler({
    html,
    intent: 'contrast',
    nodes: [{ selector: '.muted', color: '#b9b3a8', bgColor: '#faf8f5', fontPx: 16, text: 'Quiet proof' }],
  }, {});
  const report = JSON.parse(call.content[0].text);
  assert.deepEqual(report.ran, ['audit_contrast']);
  assert.equal(report.findings.contrast.aa_fail_count, 1);
  assert.equal(report.findings.contrast.aa_failures[0].foreground, '#b9b3a8');
  assert.match(report.next, /suggest_contrast_fix/);
});

test('remote dispatcher guards use the existing guard message before invoking a sub-audit', async () => {
  const message = "audit_typography url-capture is disabled on the hosted (remote) endpoint. Pass a 'nodes' snapshot instead of 'url'.";
  const called = [];
  const report = await dispatchAudit(
    { url: 'https://example.com', html: '<p>Content</p>', intent: 'content' },
    {
      remote: true,
      remoteArgGuards: { audit_typography: { params: ['url'], message } },
      run(tool) { called.push(tool); return {}; },
    },
  );
  assert.deepEqual(called, ['audit_content']);
  assert.deepEqual(report.skipped, [{ tool: 'audit_typography', reason: message }]);
});

test('project alone binds the taste audit (project auto-matches a binding, so it runs)', async () => {
  const report = await dispatchAudit(
    { html: '<main>Hello</main>', project: 'demo' },
    { run() { return {}; } },
  );
  assert.equal(report.skipped.find((item) => item.tool === 'audit_taste'), undefined);
  assert.deepEqual(report.ran, ['audit_page', 'audit_content', 'audit_taste']);
});

test('taste is skipped only when neither project nor profile is supplied', async () => {
  const report = await dispatchAudit(
    { html: '<main>Hello</main>' },
    { run() { return {}; } },
  );
  assert.deepEqual(report.skipped.find((item) => item.tool === 'audit_taste'), {
    tool: 'audit_taste',
    reason: 'no taste binding',
  });
});

test('audit is a local tool (108 total) and remains outside the frozen anonymous 45-tool surface', () => {
  const localNames = Object.keys(buildServer({ remote: false })._registeredTools);
  const remoteNames = Object.keys(buildServer({ remote: true })._registeredTools).sort();
  assert.equal(localNames.length, 108);
  assert.equal(localNames.includes('audit'), true);
  assert.equal(remoteNames.length, 45);
  assert.equal(remoteNames.includes('audit'), false);
  assert.equal(
    createHash('sha256').update(remoteNames.join('\n')).digest('hex'),
    'f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6',
  );
});
