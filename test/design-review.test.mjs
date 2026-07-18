import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'raven-review-diff-'));
const usageDir = mkdtempSync(path.join(tmpdir(), 'raven-review-usage-'));
process.env.RAVEN_USAGE_LOG = path.join(usageDir, 'usage.jsonl');
delete process.env.RAVEN_NO_USAGE_LOG;
delete process.env.RAVEN_NO_DAILY_DIGEST;

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(12, 0, 0, 0);
writeFileSync(process.env.RAVEN_USAGE_LOG, JSON.stringify({
  t: yesterday.toISOString(),
  tool: 'audit_page',
  ms: 12,
  input: {},
  insight: { warnings: ['color/raw-hex'] },
}) + '\n', 'utf8');

const { parseUnifiedDiff, reviewDiff } = await import('../dist/design-review.js');

beforeEach(() => {
  process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'raven-review-diff-'));
});

const DESIGN_MD = `---
colors:
  ink: "#111111"
  paper: "#ffffff"
spacing:
  sm: "8px"
  md: "16px"
typography:
  body:
    fontSize: "16px"
    fontFamily: "Inter, sans-serif"
---
# Design intent
`;

function diffFor(file, lines) {
  return [
    'diff --git a/' + file + ' b/' + file,
    '--- a/' + file,
    '+++ b/' + file,
    '@@ -0,0 +1,' + lines.length + ' @@',
    ...lines.map((line) => '+' + line),
  ].join('\n');
}

function decision(id, overrides = {}) {
  return {
    node_kind: 'decision',
    id,
    statement: 'Use the checkout card primitive',
    rationale: 'It preserves hierarchy.',
    scope: 'checkout',
    component_ref: 'Card',
    alternatives_rejected: [],
    status: 'active',
    superseded_by: null,
    rationale_missing: false,
    rationale_trust: 'confirmed',
    created_at: '2026-07-18T00:00:00.000Z',
    embedding: null,
    ...overrides,
  };
}

test('flags a bare hex color and suggests the nearest project color token', () => {
  const result = reviewDiff(diffFor('src/checkout/Card.tsx', [
    'export const Card = () => <div style={{ color: "#121212" }} />;',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'warn');
  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.findings[0], {
    file: 'src/checkout/Card.tsx',
    line: 1,
    severity: 'warn',
    rule: 'bare-hex-color',
    message: 'Hardcoded color #121212 bypasses the project color tokens.',
    suggestion: 'Use colors.ink (#111111).',
  });
});

test('code using only project tokens passes with zero findings', () => {
  const result = reviewDiff(diffFor('src/checkout/Card.tsx', [
    'export const Card = () => <div className="text-ink gap-sm font-body" />;',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.findings, []);
});

test('without DESIGN.md only !important can produce a finding', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { color: #123456; padding: 13px !important; font-size: 19px; }',
  ]), null, []);

  assert.equal(result.verdict, 'warn');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, 'important');
  assert.deepEqual(result.checks_skipped, ['color-tokens', 'spacing-tokens', 'typography-tokens']);
  assert.equal(result.note, 'token checks skipped: no DESIGN.md tokens found — pass reflects only universal rules');
});

test('reports only token kinds missing from a partial DESIGN.md without changing a pass verdict', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { color: var(--ink); }',
  ]), '# Tokens\n--ink: #111111\n', []);

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.checks_skipped, ['spacing-tokens', 'typography-tokens']);
  assert.equal(result.note, 'token checks skipped: no DESIGN.md tokens found — pass reflects only universal rules');
});

test('spacing literals suggest the nearest spacing token', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { padding: 14px; }',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'pass', 'info-only findings do not elevate the verdict');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].severity, 'info');
  assert.equal(result.findings[0].rule, 'hardcoded-spacing');
  assert.equal(result.findings[0].suggestion, 'Use spacing.md (16px).');
});

test('font size and unquoted CSS font family literals suggest typography tokens', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { font-size: 17px; font-family: Arial, sans-serif; }',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'warn');
  assert.deepEqual(result.findings.map((finding) => finding.rule), [
    'hardcoded-font-size',
    'hardcoded-font-family',
  ]);
  assert.equal(result.findings[0].suggestion, 'Use typography.body.fontSize (16px).');
  assert.equal(result.findings[1].suggestion, 'Use typography.body.fontFamily (Inter, sans-serif).');
});

test('lightweight CSS and Sass token declarations provide review vocabulary', () => {
  const designMd = '# Tokens\n--ink: #111111\n$space-sm: 8px\n';
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { color: rgb(18, 18, 18); gap: 7px; }',
  ]), designMd, []);

  assert.deepEqual(result.findings.map((finding) => finding.rule), [
    'bare-hex-color',
    'hardcoded-spacing',
  ]);
  assert.equal(result.findings[0].suggestion, 'Use --ink (#111111).');
  assert.equal(result.findings[1].suggestion, 'Use $space-sm (8px).');
});

test('Markdown list and table token declarations provide review vocabulary', () => {
  const designMd = '# Tokens\n- $space-sm: 8px\n| --ink | #111111 |\n';
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { color: #121212; gap: 7px; }',
  ]), designMd, []);

  assert.deepEqual(result.findings.map((finding) => finding.rule), [
    'bare-hex-color',
    'hardcoded-spacing',
  ]);
  assert.equal(result.findings[0].suggestion, 'Use --ink (#111111).');
  assert.equal(result.findings[1].suggestion, 'Use $space-sm (8px).');
});

test('font literals require a property-colon context across file types', () => {
  const diff = [
    diffFor('src/card.css', ['.card { font-size: 1.125rem; }']),
    diffFor('src/Card.tsx', ['const style = { fontSize: 17 };']),
    diffFor('ios/Card.swift', ['Text("Card").font(.custom("Arial", size: 17))']),
    diffFor('android/Card.kt', ['Text("Card", fontSize = 17.sp)']),
  ].join('\n');
  const result = reviewDiff(diff, DESIGN_MD, []);

  assert.deepEqual(result.findings.map((finding) => [finding.file, finding.rule]), [
    ['src/card.css', 'hardcoded-font-size'],
    ['src/Card.tsx', 'hardcoded-font-size'],
    ['ios/Card.swift', 'hardcoded-font-size'],
  ]);
});

test('skips comment lines, token declarations, URL fragments, paths, and non-property literals', () => {
  const result = reviewDiff(diffFor('src/Card.tsx', [
    '// color: #121212; padding: 13px; font-size: 17px;',
    '/* color: rgb(18, 18, 18); */',
    '* color: #121212;',
    ':root { --brand: #121212; }',
    '$brand: #121212;',
    'const anchor = "https://example.com/#121212";',
    'const asset = "/icons/#121212.svg";',
    'const props = { href: "#121212", src: "/icons/#121212.svg" };',
    'const background = { backgroundImage: "url(#121212)" };',
    'const typed: string = "#121212";',
    'const raw = "#121212";',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.findings, []);
});

test('still flags literals in property-colon contexts', () => {
  const result = reviewDiff(diffFor('src/Card.tsx', [
    'const color = { color: "#121212" };',
    'const spacing = { padding: "13px" };',
    'const size = { fontSize: "17px" };',
    'const family = { fontFamily: "Arial" };',
  ]), DESIGN_MD, []);

  assert.deepEqual(result.findings.map((finding) => finding.rule), [
    'bare-hex-color',
    'hardcoded-spacing',
    'hardcoded-font-size',
    'hardcoded-font-family',
  ]);
});

test('!important comments in non-CSS code do not create style findings', () => {
  const result = reviewDiff(diffFor('src/Card.tsx', [
    '// Migration note: legacy CSS used !important here.',
  ]), null, []);

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.findings, []);
});

test('!important is limited to CSS contexts and Vue or Svelte style blocks', () => {
  const diff = [
    diffFor('src/Card.tsx', [
      'const note = "legacy used !important";',
      'const style = "color: red !important";',
    ]),
    diffFor('src/Card.vue', ['<style>', '.card { color: red !important; }', '</style>']),
    diffFor('src/Card.svelte', ['<style>', '.card { color: red !important; }', '</style>']),
  ].join('\n');
  const result = reviewDiff(diff, null, []);

  assert.deepEqual(result.findings.map((finding) => [finding.file, finding.line]), [
    ['src/Card.tsx', 2],
    ['src/Card.vue', 2],
    ['src/Card.svelte', 2],
  ]);
});

test('matching active decisions attach while superseded decisions do not', () => {
  const result = reviewDiff(diffFor('src/checkout/Card.tsx', ['export const Card = null;']), null, [
    decision('active-checkout'),
    decision('superseded-checkout', { status: 'superseded', superseded_by: 'active-checkout' }),
    decision('active-settings', { statement: 'Keep settings compact', scope: 'settings' }),
  ]);

  assert.deepEqual(result.applicable_decisions, [{
    id: 'active-checkout',
    statement: 'Use the checkout card primitive',
    scope: 'checkout',
  }]);
});

test('decision matching uses exact whole tokens instead of substring containment', () => {
  const result = reviewDiff(diffFor('src/settings/Card.tsx', ['export const Card = null;']), null, [
    decision('checkout-only'),
    decision('ui-build', { statement: 'Keep build output stable', scope: 'ui' }),
    decision('settings-card', { statement: 'Keep the settings card compact', scope: 'settings-card' }),
  ]);

  assert.deepEqual(result.applicable_decisions.map((item) => item.id), ['settings-card']);
});

test('non-UI diffs pass without checking added lines', () => {
  const diff = diffFor('docs/README.md', ['Color: #123456', 'Spacing: 13px']);
  const result = reviewDiff(diff, DESIGN_MD, []);

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.stats, { files_changed: 1, ui_files: 0, added_lines_checked: 0 });
});

test('multi-file parser preserves new-file line numbers, renames, and /dev/null', () => {
  const diff = [
    'diff --git a/src/old.css b/src/new.css',
    'similarity index 90%',
    'rename from src/old.css',
    'rename to src/new.css',
    '--- a/src/old.css',
    '+++ b/src/new.css',
    '@@ -10,2 +20,3 @@',
    ' context',
    '-old',
    '+first',
    '+second',
    'diff --git a/src/deleted.tsx b/src/deleted.tsx',
    'deleted file mode 100644',
    '--- a/src/deleted.tsx',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-deleted',
    'diff --git a/src/new.tsx b/src/new.tsx',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/src/new.tsx',
    '@@ -0,0 +7,2 @@',
    '+alpha',
    '+beta',
  ].join('\n');

  assert.deepEqual(parseUnifiedDiff(diff), [
    { file: 'src/new.css', addedLines: [{ line: 21, content: 'first' }, { line: 22, content: 'second' }] },
    { file: 'src/deleted.tsx', addedLines: [] },
    { file: 'src/new.tsx', addedLines: [{ line: 7, content: 'alpha' }, { line: 8, content: 'beta' }] },
  ]);
});

test('parser accepts a plain unified diff without git preamble lines', () => {
  const diff = [
    '--- a/src/card.css',
    '+++ b/src/card.css',
    '@@ -3 +3,2 @@',
    ' existing',
    '+added',
  ].join('\n');

  assert.deepEqual(parseUnifiedDiff(diff), [
    { file: 'src/card.css', addedLines: [{ line: 4, content: 'added' }] },
  ]);
});

test('parser strips timestamp metadata from unified diff filenames', () => {
  const diff = [
    '--- a/src/card.css\t2026-07-17 10:00:00',
    '+++ b/src/card.css\t2026-07-18 10:00:00',
    '@@ -1 +1 @@',
    '+.card { color: #121212; }',
  ].join('\n');

  assert.deepEqual(parseUnifiedDiff(diff), [
    { file: 'src/card.css', addedLines: [{ line: 1, content: '.card { color: #121212; }' }] },
  ]);
});

test('8-digit hex and translucent rgba colors omit token suggestions', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.a { color: #12121280; }',
    '.b { color: rgba(18, 18, 18, 0.5); }',
    '.c { color: rgba(18, 18, 18, 1); }',
  ]), DESIGN_MD, []);

  assert.equal(result.findings.length, 3);
  assert.equal('suggestion' in result.findings[0], false);
  assert.equal('suggestion' in result.findings[1], false);
  assert.match(result.findings[0].message, /has alpha — no token suggestion/);
  assert.match(result.findings[1].message, /has alpha — no token suggestion/);
  assert.equal(result.findings[2].suggestion, 'Use colors.ink (#111111).');
});

async function callReviewDiff(args) {
  const { buildServer } = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = buildServer({});
  const client = new Client({ name: 'design-review-call', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: 'review_diff', arguments: args });
  } finally {
    await client.close();
    await server.close();
  }
}

test('review_diff stays parseable when usage logging has a pending daily digest', async () => {
  const call = await callReviewDiff({
    diff: diffFor('src/card.css', ['.card { color: #121212; }']),
    design_md: DESIGN_MD,
  });

  assert.doesNotThrow(() => JSON.parse(call.content[0].text));
});

test('review_diff fails closed for empty and malformed diffs', async () => {
  const empty = await callReviewDiff({ diff: '' });
  assert.equal(empty.isError, true);
  assert.equal(empty.content[0].text, 'empty diff');

  const malformed = await callReviewDiff({ diff: 'this is not a unified diff' });
  assert.equal(malformed.isError, true);
  assert.equal(malformed.content[0].text, 'not a unified diff');
});

test('review_diff enforces the 400KB limit by UTF-8 byte length', async () => {
  const oversized = diffFor('src/card.css', ['.card { color: #121212; }']) + '\n' + 'é'.repeat(205000);
  assert.equal(oversized.length < 400 * 1024, true, 'fixture must pass the zod character pre-check');
  assert.equal(Buffer.byteLength(oversized, 'utf8') > 400 * 1024, true);

  const call = await callReviewDiff({ diff: oversized, design_md: DESIGN_MD });
  assert.equal(call.isError, true);
  assert.equal(call.content[0].text, 'diff exceeds maximum size of 400KB (409600 bytes)');
});

test('review_diff is callable through MCP and uses active stored decisions', async () => {
  const { buildServer } = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = buildServer({});
  const client = new Client({ name: 'design-review-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'raven-review-project-'));
    writeFileSync(path.join(projectDir, 'DESIGN.md'), DESIGN_MD, 'utf8');
    await client.callTool({
      name: 'decision_add',
      arguments: {
        statement: 'Use the checkout card primitive',
        rationale: 'It preserves hierarchy.',
        scope: 'checkout',
        component_ref: 'Card',
      },
    });
    const call = await client.callTool({
      name: 'review_diff',
      arguments: {
        diff: diffFor('src/checkout/Card.tsx', ['export const Card = () => <div style={{ color: "#121212" }} />;']),
        project: projectDir,
      },
    });
    const result = JSON.parse(call.content[0].text);
    assert.equal(result.verdict, 'warn');
    assert.equal(result.findings[0].rule, 'bare-hex-color');
    assert.equal(result.applicable_decisions.length, 1);
    assert.equal(result.applicable_decisions[0].scope, 'checkout');

    const inlineOverride = `---\ncolors:\n  accent: "#eeeeee"\n---\n`;
    const overrideCall = await client.callTool({
      name: 'review_diff',
      arguments: {
        diff: diffFor('src/checkout/Card.tsx', ['export const Card = () => <div style={{ color: "#ededed" }} />;']),
        project: projectDir,
        design_md: inlineOverride,
      },
    });
    const overrideResult = JSON.parse(overrideCall.content[0].text);
    assert.equal(overrideResult.findings[0].suggestion, 'Use colors.accent (#eeeeee).');
  } finally {
    await client.close();
    await server.close();
  }

  const remoteNames = Object.keys((await import('../dist/index.js')).buildServer({ remote: true })._registeredTools);
  assert.equal(remoteNames.includes('review_diff'), false);
});

test('tool-count comments match the registered local and anonymous surfaces', async () => {
  const { buildServer } = await import('../dist/index.js');
  assert.equal(Object.keys(buildServer({ remote: false })._registeredTools).length, 91);
  assert.equal(Object.keys(buildServer({ remote: true })._registeredTools).length, 45);

  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /FRESH McpServer with all 91 local tools/);
  assert.match(source, /remote = serve only the 45 stateless remote-safe tools/);
  assert.match(source, /gate off the 46 gated tools/);
  assert.match(source, /all 91\./);
});
