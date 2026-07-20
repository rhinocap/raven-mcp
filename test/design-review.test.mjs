import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

test('exact token values are advisory infos and keep review_diff passing', () => {
  const designMd = `---
colors:
  accent: "#6c5ce7"
spacing:
  md: "16px"
---
`;
  const result = reviewDiff(diffFor('src/card.css', [
    '.card { color: #6c5ce7; padding: 16px; }',
  ]), designMd, []);

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.length, 2);
  assert.deepEqual(result.findings.map((finding) => [finding.severity, finding.rule]), [
    ['info', 'token-value-match'],
    ['info', 'token-value-match'],
  ]);
  assert.match(result.findings[0].message, /#6c5ce7 matches colors\.accent/);
  assert.match(result.findings[1].message, /16px matches spacing\.md/);
});

test('typography lookalikes with different units or family-list structure remain violations', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.points { font-size: 16pt; }',
    '.scaled { font-size: 16sp; }',
    '.family { font-family: Inter sans-serif; }',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'warn');
  assert.deepEqual(result.findings.map((finding) => [finding.severity, finding.rule]), [
    ['warn', 'hardcoded-font-size'],
    ['warn', 'hardcoded-font-size'],
    ['warn', 'hardcoded-font-family'],
  ]);
});

test('quoted CSS family items normalize to the same token family list', () => {
  const result = reviewDiff(diffFor('src/card.css', [
    '.family { font-family: "Inter", sans-serif; }',
  ]), DESIGN_MD, []);

  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.findings.map((finding) => [finding.severity, finding.rule]), [
    ['info', 'token-value-match'],
  ]);
  assert.match(result.findings[0].message, /matches typography\.body\.fontFamily/);
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
  return callDesignReviewTool('review_diff', args);
}

async function callPolishDiff(args) {
  return callDesignReviewTool('polish_diff', args);
}

async function callDesignReviewTool(name, args) {
  const { buildServer } = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = buildServer({});
  const client = new Client({ name: 'design-review-call', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
    await server.close();
  }
}

function createPolishRepo(content) {
  const repo = mkdtempSync(path.join(tmpdir(), 'raven-polish-apply-'));
  execSync('git init -q', { cwd: repo });
  execSync('git config user.name "Raven Test"', { cwd: repo });
  execSync('git config user.email raven-test@example.com', { cwd: repo });
  writeFileSync(path.join(repo, 'card.css'), content, 'utf8');
  execSync('git add card.css', { cwd: repo });
  execSync('git commit -qm baseline', { cwd: repo });
  return repo;
}

function gitDiff(repo) {
  return execSync('git diff -- card.css', { cwd: repo, encoding: 'utf8' });
}

async function applyPolishPatch(repo, violatingContent) {
  writeFileSync(path.join(repo, 'card.css'), violatingContent, 'utf8');
  const inputDiff = gitDiff(repo);
  const call = await callPolishDiff({ diff: inputDiff, design_md: DESIGN_MD });
  assert.equal(call.isError, undefined);
  const result = JSON.parse(call.content[0].text);
  writeFileSync(path.join(repo, 'polish.patch'), result.patch, 'utf8');
  execSync('git apply polish.patch', { cwd: repo });
  return result;
}

test('polish_diff patch applies with plain git apply and leaves a clean review', async () => {
  const repo = createPolishRepo([
    '.card {',
    '  color: var(--ink);',
    '}',
    '',
  ].join('\n'));

  await applyPolishPatch(repo, [
    '.card {',
    '  color: #121212;',
    '}',
    '',
  ].join('\n'));

  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), [
    '.card {',
    '  color: #111111;',
    '}',
    '',
  ].join('\n'));
  const review = await callReviewDiff({ diff: gitDiff(repo) });
  assert.equal(review.isError, undefined);
  assert.deepEqual(JSON.parse(review.content[0].text).findings, []);
});

test('polish_diff post-review matches review_diff after applying its patch in a real repo', async () => {
  const repo = createPolishRepo([
    '.card {',
    '  color: var(--ink);',
    '  padding: var(--space-md);',
    '}',
    '',
  ].join('\n'));

  const polish = await applyPolishPatch(repo, [
    '.card {',
    '  color: #121212;',
    '  padding: 13px;',
    '}',
    '',
  ].join('\n'));
  const reviewCall = await callReviewDiff({ diff: gitDiff(repo), design_md: DESIGN_MD });
  assert.equal(reviewCall.isError, undefined);
  const review = JSON.parse(reviewCall.content[0].text);
  const reviewViolations = review.findings.filter((finding) => finding.rule !== 'token-value-match');

  assert.equal(review.verdict, 'pass');
  assert.equal(reviewViolations.length, 0);
  assert.ok(review.findings.every((finding) => finding.severity === 'info' && finding.rule === 'token-value-match'));
  assert.equal(polish.post_polish.findings_remaining, reviewViolations.length);
  assert.equal(polish.post_polish.findings_remaining, 0);
});

test('polish_diff emits and applies one contextual patch hunk per separated input hunk', async () => {
  const baseline = Array.from({ length: 16 }, (_, index) => {
    if (index === 1 || index === 14) return `.region-${index} { color: var(--ink); }`;
    return `.context-${index} { display: block; }`;
  });
  const violating = baseline.slice();
  violating[1] = '.region-1 { color: #121212; }';
  violating[14] = '.region-14 { padding: 13px; }';
  const repo = createPolishRepo(baseline.join('\n') + '\n');

  const result = await applyPolishPatch(repo, violating.join('\n') + '\n');

  assert.equal((result.patch.match(/^@@/gm) || []).length, 2);
  const expected = baseline.slice();
  expected[1] = '.region-1 { color: #111111; }';
  expected[14] = '.region-14 { padding: 16px; }';
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), expected.join('\n') + '\n');
});

test('polish_diff patch applies when the substituted last line has no trailing newline', async () => {
  const repo = createPolishRepo('.card { color: var(--ink); }');

  const result = await applyPolishPatch(repo, '.card { color: #121212; }');

  assert.match(result.patch, /\\ No newline at end of file/);
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), '.card { color: #111111; }');
});

test('polish_diff proposes a post-image patch and re-verifies deterministic color and spacing fixes', async () => {
  const call = await callPolishDiff({
    diff: diffFor('src/card.css', [
      '.card { color: #121212; }',
      '.card__body { padding: 13px; }',
    ]),
    design_md: DESIGN_MD,
  });
  assert.equal(call.isError, undefined);
  const result = JSON.parse(call.content[0].text);

  assert.equal(result.verdict, 'warn');
  assert.deepEqual(result.proposed_changes, [
    {
      file: 'src/card.css', line: 1,
      before: '.card { color: #121212; }', after: '.card { color: #111111; }',
      token: 'colors.ink', kind: 'color',
    },
    {
      file: 'src/card.css', line: 2,
      before: '.card__body { padding: 13px; }', after: '.card__body { padding: 16px; }',
      token: 'spacing.md', kind: 'spacing',
    },
  ]);
  assert.deepEqual(parseUnifiedDiff(result.patch), [{
    file: 'src/card.css',
    addedLines: [
      { line: 1, content: '.card { color: #111111; }' },
      { line: 2, content: '.card__body { padding: 16px; }' },
    ],
  }]);
  assert.deepEqual(result.post_polish, { findings_resolved: 2, findings_remaining: 0, remaining: [] });
  assert.deepEqual(result.manual, []);
});

test('polish_diff leaves alpha colors manual and counts them after re-verification', async () => {
  const call = await callPolishDiff({
    diff: diffFor('src/card.css', ['.card { color: #12121280; }']),
    design_md: DESIGN_MD,
  });
  const result = JSON.parse(call.content[0].text);

  assert.deepEqual(result.proposed_changes, []);
  assert.equal(result.patch, '');
  assert.deepEqual(result.manual, [{
    file: 'src/card.css',
    line: 1,
    summary: 'Hardcoded color #12121280 bypasses the project color tokens. It has alpha — no token suggestion.',
    why: 'alpha color — needs design judgment',
  }]);
  assert.equal(result.post_polish.findings_resolved, 0);
  assert.equal(result.post_polish.findings_remaining, 1);
  assert.match(result.post_polish.remaining[0], /bare-hex-color/);
});

test('polish_diff combines multiple substitutions on one line into one proposed change', async () => {
  const call = await callPolishDiff({
    diff: diffFor('src/card.css', ['.card { color: #121212; padding: 13px; }']),
    design_md: DESIGN_MD,
  });
  const result = JSON.parse(call.content[0].text);

  assert.equal(result.proposed_changes.length, 1);
  assert.equal(result.proposed_changes[0].before, '.card { color: #121212; padding: 13px; }');
  assert.equal(result.proposed_changes[0].after, '.card { color: #111111; padding: 16px; }');
  assert.deepEqual(result.proposed_changes[0].substitutions, [
    { token: 'colors.ink', kind: 'color' },
    { token: 'spacing.md', kind: 'spacing' },
  ]);
  assert.deepEqual(result.post_polish, { findings_resolved: 2, findings_remaining: 0, remaining: [] });
});

test('polish_diff substitutes font size and family values through the shared checker', async () => {
  const call = await callPolishDiff({
    diff: diffFor('src/card.css', ['.card { font-size: 17px; font-family: Arial, sans-serif; }']),
    design_md: DESIGN_MD,
  });
  const result = JSON.parse(call.content[0].text);

  assert.equal(result.proposed_changes.length, 1);
  assert.equal(result.proposed_changes[0].after, '.card { font-size: 16px; font-family: Inter, sans-serif; }');
  assert.deepEqual(result.proposed_changes[0].substitutions, [
    { token: 'typography.body.fontSize', kind: 'font' },
    { token: 'typography.body.fontFamily', kind: 'font' },
  ]);
  assert.deepEqual(result.post_polish, { findings_resolved: 2, findings_remaining: 0, remaining: [] });
});

test('polish_diff reconstructs repeated file sections against the final sequential post-image', async () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'raven-polish-sequential-'));
  execSync('git init -q', { cwd: repo });
  execSync('git config user.name "Raven Test"', { cwd: repo });
  execSync('git config user.email raven-test@example.com', { cwd: repo });
  writeFileSync(path.join(repo, 'card.css'), '.card { color: var(--ink); }\n', 'utf8');
  writeFileSync(path.join(repo, 'notes.txt'), 'before\n', 'utf8');
  execSync('git add card.css notes.txt', { cwd: repo });
  execSync('git commit -qm baseline', { cwd: repo });

  writeFileSync(path.join(repo, 'card.css'), '.card { color: #121212; }\n', 'utf8');
  const firstCardSection = execSync('git diff -- card.css', { cwd: repo, encoding: 'utf8' });
  execSync('git add card.css', { cwd: repo });
  writeFileSync(path.join(repo, 'notes.txt'), 'after\n', 'utf8');
  const middleSection = execSync('git diff -- notes.txt', { cwd: repo, encoding: 'utf8' });
  writeFileSync(path.join(repo, 'card.css'), '.card { padding: 13px; }\n', 'utf8');
  const finalCardSection = execSync('git diff -- card.css', { cwd: repo, encoding: 'utf8' });

  const call = await callPolishDiff({
    diff: firstCardSection + middleSection + finalCardSection,
    design_md: DESIGN_MD,
  });
  assert.equal(call.isError, undefined);
  const result = JSON.parse(call.content[0].text);
  assert.equal(result.findings.some((finding) => finding.rule === 'bare-hex-color'), false);
  assert.deepEqual(result.proposed_changes.map(({ file, line, before, after }) => ({ file, line, before, after })), [{
    file: 'card.css',
    line: 1,
    before: '.card { padding: 13px; }',
    after: '.card { padding: 16px; }',
  }]);

  writeFileSync(path.join(repo, 'polish.patch'), result.patch, 'utf8');
  execSync('git apply --check polish.patch', { cwd: repo });
  execSync('git apply polish.patch', { cwd: repo });
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), '.card { padding: 16px; }\n');

  const reviewCall = await callReviewDiff({ diff: execSync('git diff -- card.css', { cwd: repo, encoding: 'utf8' }), design_md: DESIGN_MD });
  assert.equal(reviewCall.isError, undefined);
  const review = JSON.parse(reviewCall.content[0].text);
  const reviewViolations = review.findings.filter((finding) => finding.rule !== 'token-value-match');
  assert.equal(result.post_polish.findings_resolved, 1);
  assert.equal(result.post_polish.findings_remaining, reviewViolations.length);
  assert.equal(result.post_polish.findings_remaining, 0);
});

test('polish_diff emits a CRLF-preserving patch that git applies to a CRLF post-image', async () => {
  const repo = createPolishRepo('.card { color: var(--ink); }\r\n');
  writeFileSync(path.join(repo, 'card.css'), '.card { color: #121212; }\r\n', 'utf8');
  const inputDiff = gitDiff(repo);
  assert.match(inputDiff, /^\+.*\r$/m, 'fixture diff must preserve CR on hunk body lines');

  const call = await callPolishDiff({ diff: inputDiff, design_md: DESIGN_MD });
  assert.equal(call.isError, undefined);
  const result = JSON.parse(call.content[0].text);
  writeFileSync(path.join(repo, 'polish.patch'), result.patch, 'utf8');
  execSync('git apply --check polish.patch', { cwd: repo });
  execSync('git apply polish.patch', { cwd: repo });

  const polished = readFileSync(path.join(repo, 'card.css'));
  assert.deepEqual(polished, Buffer.from('.card { color: #111111; }\r\n'));
  assert.equal(polished.toString('utf8').replace(/\r\n/g, '').includes('\n'), false);
  assert.equal(result.post_polish.findings_remaining, 0);
});

test('polish_diff selects nearest font token using the px-normalized pt value', async () => {
  const pointDesignMd = `---
typography:
  small:
    fontSize: "16px"
  large:
    fontSize: "24px"
---
`;
  const call = await callPolishDiff({
    diff: diffFor('src/card.css', ['.card { font-size: 17pt; }']),
    design_md: pointDesignMd,
  });
  assert.equal(call.isError, undefined);
  const result = JSON.parse(call.content[0].text);

  assert.equal(result.proposed_changes.length, 1);
  assert.equal(result.proposed_changes[0].after, '.card { font-size: 24px; }');
  assert.equal(result.proposed_changes[0].token, 'typography.large.fontSize');
});

test('polish_diff keeps valid deletion-only diffs on the shared post-review path', async () => {
  const diff = [
    'diff --git a/card.css b/card.css',
    '--- a/card.css',
    '+++ b/card.css',
    '@@ -1 +0,0 @@',
    '-.card { color: #121212; }',
  ].join('\n');
  const call = await callPolishDiff({ diff, design_md: DESIGN_MD });

  assert.equal(call.isError, undefined);
  const result = JSON.parse(call.content[0].text);
  assert.deepEqual(result.proposed_changes, []);
  assert.equal(result.patch, '');
  assert.deepEqual(result.post_polish, { findings_resolved: 0, findings_remaining: 0, remaining: [] });
});

test('polish_diff fails closed for malformed diffs and propagates missing-token checks', async () => {
  const malformed = await callPolishDiff({ diff: 'this is not a unified diff' });
  assert.equal(malformed.isError, true);
  assert.equal(malformed.content[0].text, 'not a unified diff');

  const missing = await callPolishDiff({ diff: diffFor('src/card.css', ['.card { color: #121212; }']) });
  const result = JSON.parse(missing.content[0].text);
  assert.deepEqual(result.checks_skipped, ['color-tokens', 'spacing-tokens', 'typography-tokens']);
  assert.match(result.note, /token checks skipped/);
});

test('polish_diff never creates or modifies project files', async () => {
  const project = mkdtempSync(path.join(tmpdir(), 'raven-polish-no-write-'));
  const sentinel = path.join(project, 'sentinel.txt');
  writeFileSync(sentinel, 'unchanged', 'utf8');
  const before = statSync(sentinel);

  const call = await callPolishDiff({
    diff: diffFor('src/card.css', ['.card { color: #121212; }']),
    project,
    design_md: DESIGN_MD,
  });
  assert.equal(call.isError, undefined);
  assert.deepEqual(readdirSync(project), ['sentinel.txt']);
  assert.equal(readFileSync(sentinel, 'utf8'), 'unchanged');
  assert.equal(statSync(sentinel).mtimeMs, before.mtimeMs);
});

test('polish_diff enforces the 400KB limit by UTF-8 byte length through MCP', async () => {
  const oversized = diffFor('src/card.css', ['.card { color: #121212; }']) + '\n' + 'é'.repeat(205000);
  assert.equal(oversized.length < 400 * 1024, true, 'fixture must pass the zod character pre-check');
  assert.equal(Buffer.byteLength(oversized, 'utf8') > 400 * 1024, true);

  const call = await callPolishDiff({ diff: oversized, design_md: DESIGN_MD });
  assert.equal(call.isError, true);
  assert.equal(call.content[0].text, 'diff exceeds maximum size of 400KB (409600 bytes)');
});

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
  assert.equal(Object.keys(buildServer({ remote: false })._registeredTools).length, 93);
  const remoteNames = Object.keys(buildServer({ remote: true })._registeredTools).sort();
  assert.equal(remoteNames.length, 45);
  assert.equal(remoteNames.includes('polish_diff'), false);
  assert.equal(createHash('sha256').update(remoteNames.join('\n')).digest('hex'), 'f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6');

  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /FRESH McpServer with all 93 local tools/);
  assert.match(source, /remote = serve only the 45 stateless remote-safe tools/);
  assert.match(source, /gate off the 48 gated tools/);
  assert.match(source, /all 93\./);
});

test('a recorded decision governs a violation on its scoped file: attributes governed_by + governed_findings, verdict unchanged', () => {
  const gov = decision('checkout-color', {
    statement: 'Checkout uses the accent color token, never a raw hex',
    scope: 'checkout',
  });
  const result = reviewDiff(diffFor('src/checkout/Card.tsx', [
    'export const Card = () => <div style={{ color: "#ff5722" }} />;',
  ]), DESIGN_MD, [gov]);

  // additive-only: the generic bare-hex warn is unchanged, verdict does NOT escalate this slice
  assert.equal(result.verdict, 'warn');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, 'bare-hex-color');
  assert.equal(result.findings[0].severity, 'warn');
  // new: the finding is attributed to the specific recorded decision it violates
  assert.deepEqual(result.findings[0].governed_by, {
    id: 'checkout-color',
    statement: 'Checkout uses the accent color token, never a raw hex',
  });
  assert.deepEqual(result.governed_findings, [{
    decision_id: 'checkout-color',
    file: 'src/checkout/Card.tsx',
    line: 1,
    rule: 'bare-hex-color',
  }]);
});

test('a scope-matching decision that never mentions the finding category does NOT govern (keyword-gated, not path-gated)', () => {
  // default decision statement "Use the checkout card primitive" — matches the checkout path but
  // says nothing about color/hex/token, so a bare-hex violation is NOT attributed to it.
  const result = reviewDiff(diffFor('src/checkout/Card.tsx', [
    'export const Card = () => <div style={{ color: "#ff5722" }} />;',
  ]), DESIGN_MD, [decision('checkout-primitive')]);

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, 'bare-hex-color');
  assert.equal(result.findings[0].governed_by, undefined, 'no category keyword ⇒ not governed');
  assert.equal(result.governed_findings, undefined, 'no governed violation ⇒ field absent');
  // proves the decision WAS path-applicable — suppression came from keyword-gating, not path mismatch
  assert.deepEqual(result.applicable_decisions.map((d) => d.id), ['checkout-primitive']);
});
