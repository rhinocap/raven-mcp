import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distContract = path.resolve(__dirname, '../dist/contract.js');

let auditContract;

try {
  const mod = await import(distContract);
  auditContract = mod.auditContract;
} catch (err) {
  const msg = `dist/contract.js not found — run \`npm run build\` first. (${err.message})`;
  test('contract module available', (t) => { t.skip(msg); });
  process.exit(0);
}

if (typeof auditContract !== 'function') {
  test('auditContract export available', (t) => {
    t.skip('auditContract not exported from dist/contract.js.');
  });
  process.exit(0);
}

const TOKENS = ['@LOG', '@UNLOG', '@WORKOUT', '@UNWORKOUT'];
const LONGEST_SAFE_CONTENT = [
  '@UNWORKOUT',
  '@WORKOUT',
  '@UNLOG',
  '@LOG',
].join('\n');

test('tokens mode passes when all layers contain tokens in longest-safe order', () => {
  const result = auditContract(
    { mode: 'tokens', tokens: TOKENS },
    [
      { path: 'layer-a.ts', content: LONGEST_SAFE_CONTENT },
      { path: 'layer-b.ts', content: LONGEST_SAFE_CONTENT },
    ],
  );

  assert.strictEqual(result.verdict, 'PASS');
  assert.deepStrictEqual(result.cross_layer.inconsistent_tokens, []);
});

test('tokens mode blocks when a token is inconsistent across layers', () => {
  const result = auditContract(
    { mode: 'tokens', tokens: TOKENS },
    [
      { path: 'layer-a.ts', content: LONGEST_SAFE_CONTENT },
      {
        path: 'layer-b.ts',
        content: [
          '@WORKOUT',
          '@UNLOG',
          '@LOG',
        ].join('\n'),
      },
    ],
  );

  assert.strictEqual(result.verdict, 'BLOCK');
  assert.ok(result.cross_layer.inconsistent_tokens.includes('@UNWORKOUT'));
});

test('tokens mode blocks shorter-before-longer ordering risks only when unsafe', () => {
  const unsafe = auditContract(
    { mode: 'tokens', tokens: TOKENS },
    [
      {
        path: 'unsafe.ts',
        content: [
          '@WORKOUT',
          '@UNWORKOUT',
          '@UNLOG',
          '@LOG',
        ].join('\n'),
      },
    ],
  );

  assert.strictEqual(unsafe.verdict, 'BLOCK');
  assert.ok(
    unsafe.layers[0].ordering_issues.some((issue) => (
      issue.includes('@WORKOUT') && issue.includes('@UNWORKOUT')
    )),
    'expected @WORKOUT before @UNWORKOUT to be reported',
  );

  const safe = auditContract(
    { mode: 'tokens', tokens: TOKENS },
    [
      {
        path: 'safe.ts',
        content: LONGEST_SAFE_CONTENT,
      },
    ],
  );

  assert.strictEqual(safe.verdict, 'PASS');
  assert.deepStrictEqual(safe.layers[0].ordering_issues, []);
});

test('envelope mode blocks schema version drift and passes aligned envelopes', () => {
  const spec = {
    mode: 'envelope',
    fields: ['id', 'schemaVersion', 'status'],
    schemaVersionPattern: 'schemaVersion\\s*[=:]\\s*(\\d+)',
  };

  const drift = auditContract(
    spec,
    [
      { path: 'api.ts', content: 'schemaVersion = 1\nid\nstatus' },
      { path: 'worker.ts', content: 'schemaVersion = 2\nid\nstatus' },
    ],
  );

  assert.strictEqual(drift.verdict, 'BLOCK');
  assert.deepStrictEqual(drift.cross_layer.schema_versions, {
    'api.ts': '1',
    'worker.ts': '2',
  });

  const aligned = auditContract(
    spec,
    [
      { path: 'api.ts', content: 'schemaVersion = 1\nid\nstatus' },
      { path: 'worker.ts', content: 'schemaVersion = 1\nid\nstatus' },
    ],
  );

  assert.strictEqual(aligned.verdict, 'PASS');
  assert.deepStrictEqual(aligned.cross_layer.schema_versions, {
    'api.ts': '1',
    'worker.ts': '1',
  });
});
