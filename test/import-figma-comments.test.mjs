import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'raven-figma-'));
process.env.RAVEN_NO_USAGE_LOG = '1';

const { formatFigmaComments } = await import('../scripts/import-figma-comments.mjs');

// A realistic Figma comments export (GET /v1/files/:key/comments shape): two designers with a
// ruling each on nodes, one reply (parent_id), one empty comment, out-of-order timestamps.
const EXPORT = {
  file_key: 'ABC123',
  name: 'Settings redesign',
  comments: [
    { id: '2', message: 'Agree — flat groups read cleaner at this density.', user: { handle: 'Bob' }, parent_id: '1', created_at: '2026-07-20T10:05:00Z', client_meta: { node_id: '10:5', node_offset: { x: 4, y: 8 } } },
    { id: '1', message: 'Keep the settings groups flat, no nested cards.', user: { handle: 'Alice' }, created_at: '2026-07-20T10:00:00Z', client_meta: { node_id: '10:5', node_offset: { x: 4, y: 8 } } },
    { id: '3', message: '   ', user: { handle: 'Carol' }, created_at: '2026-07-20T10:10:00Z', client_meta: { x: 100, y: 200 } },
    { id: '4', message: 'Use the accent color only for the primary action.', user: { handle: 'Carol' }, created_at: '2026-07-20T10:20:00Z', client_meta: { x: 100, y: 200 } },
  ],
};

test('formatFigmaComments flattens a comments export into an attributed, source-associated transcript', () => {
  const { text, source_meta } = formatFigmaComments(EXPORT);
  // Chronological: alice (10:00) -> bob reply (10:05, ↳) -> carol canvas pin (10:20). Empty dropped.
  assert.deepEqual(text.split('\n\n'), [
    '@Alice (on node 10:5): Keep the settings groups flat, no nested cards.',
    '↳ @Bob (on node 10:5): Agree — flat groups read cleaner at this density.',
    '@Carol (on canvas): Use the accent color only for the primary action.',
  ]);
  assert.equal(source_meta.kind, 'design-review');
  assert.equal(source_meta.ref, 'https://www.figma.com/file/ABC123 — Settings redesign');
});

test('a resolved comment (resolved_at set) is marked [resolved] so the model can weight/skip it', () => {
  const { text } = formatFigmaComments({
    file_key: 'K',
    comments: [
      { message: 'Drop the drop-shadow on cards.', user: { handle: 'Alice' }, created_at: '2026-07-20T10:00:00Z', resolved_at: '2026-07-21T09:00:00Z', client_meta: { node_id: '2:2' } },
    ],
  });
  assert.equal(text, '@Alice (on node 2:2) [resolved]: Drop the drop-shadow on cards.');
});

test('formatFigmaComments accepts a bare comments array and throws when nothing attributable survives', () => {
  assert.throws(() => formatFigmaComments([
    { message: 'orphan comment, no user', created_at: '2026-07-20T10:00:00Z' },
    { message: '   ', user: { handle: 'Dan' } },
  ]), /No attributable comments/);
});

// End-to-end: adapter output -> the real ingest_transcript path -> a candidate authored by the
// designer with author_trust "extracted" (the model step is simulated as in the it57/it59 tests).
test('adapter output drives ingest_transcript so a designer becomes the decision author (extracted)', async () => {
  const { buildServer } = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = buildServer({});
  const client = new Client({ name: 'figma-test', version: '1.0.0' }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    const { text, source_meta } = formatFigmaComments(EXPORT);
    const ingest = JSON.parse((await client.callTool({
      name: 'ingest_transcript', arguments: { text, source_meta },
    })).content[0].text);
    assert.match(ingest.source_id, /^src_/);
    assert.match(ingest.extraction_prompt, /@Alice \(on node 10:5\)/);

    const candidates = JSON.parse((await client.callTool({
      name: 'ingest_transcript_results',
      arguments: {
        source_id: ingest.source_id,
        extraction_json: JSON.stringify([
          { statement: 'Keep settings groups flat, no nested cards', rationale: null, alternatives_rejected: [], author: 'Alice' },
        ]),
      },
    })).content[0].text);
    assert.equal(candidates.candidates[0].node.author, 'Alice');
    assert.equal(candidates.candidates[0].node.author_trust, 'extracted');
    assert.equal(candidates.candidates[0].node.status, 'candidate');
  } finally {
    await client.close();
    await server.close();
  }
});
