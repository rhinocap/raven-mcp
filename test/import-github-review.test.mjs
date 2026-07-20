import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'raven-ghreview-'));
process.env.RAVEN_NO_USAGE_LOG = '1';

const { formatGithubReview } = await import('../scripts/import-github-review.mjs');

// A realistic GitHub PR export: two human reviewers with a design ruling each, one bot comment,
// one empty approval, out-of-order timestamps.
const EXPORT = {
  pull_request: { number: 42, title: 'Settings panel', html_url: 'https://github.com/acme/app/pull/42' },
  reviews: [
    { user: { login: 'bob' }, body: 'Prefer a single flat surface over stacked cards here.', state: 'CHANGES_REQUESTED', submitted_at: '2026-07-20T10:05:00Z' },
    { user: { login: 'carol' }, body: '', state: 'APPROVED', submitted_at: '2026-07-20T10:30:00Z' },
  ],
  review_comments: [
    { user: { login: 'alice' }, body: 'Keep the settings groups flat — no nested cards.', path: 'src/Settings.tsx', line: 88, created_at: '2026-07-20T10:00:00Z' },
    { user: { login: 'github-actions[bot]' }, body: 'Coverage decreased by 0.1%.', path: 'x', line: 1, created_at: '2026-07-20T10:01:00Z' },
  ],
  issue_comments: [
    { user: { login: 'bob' }, body: 'Also use the accent color only for primary actions.', created_at: '2026-07-20T10:20:00Z' },
  ],
};

test('formatGithubReview flattens a PR export into an attributed, source-anchored transcript', () => {
  const { text, source_meta } = formatGithubReview(EXPORT);
  const lines = text.split('\n\n');
  // Chronological: alice inline (10:00) -> bob review (10:05) -> bob conversation (10:20). Bot + empty dropped.
  assert.deepEqual(lines, [
    '@alice (on src/Settings.tsx:88): Keep the settings groups flat — no nested cards.',
    '@bob (review: changes_requested): Prefer a single flat surface over stacked cards here.',
    '@bob: Also use the accent color only for primary actions.',
  ]);
  assert.equal(source_meta.kind, 'code-review');
  assert.equal(source_meta.ref, 'https://github.com/acme/app/pull/42');
});

test('a reply (in_reply_to_id) is marked ↳ so the flatten does not read it as its own ruling', () => {
  const { text } = formatGithubReview({
    pull_request: { number: 7, html_url: 'https://github.com/acme/app/pull/7' },
    review_comments: [
      { user: { login: 'alice' }, body: 'Use a flat surface here.', path: 'a.tsx', line: 1, created_at: '2026-07-20T10:00:00Z' },
      { user: { login: 'bob' }, body: 'Agreed, flat it is.', path: 'a.tsx', line: 1, in_reply_to_id: 555, created_at: '2026-07-20T10:05:00Z' },
    ],
  });
  assert.deepEqual(text.split('\n\n'), [
    '@alice (on a.tsx:1): Use a flat surface here.',
    '↳ @bob (on a.tsx:1): Agreed, flat it is.',
  ]);
});

test('formatGithubReview throws when nothing attributable survives (all bot/empty)', () => {
  assert.throws(() => formatGithubReview({
    review_comments: [
      { user: { login: 'dependabot[bot]' }, body: 'Bumps lodash', path: 'p', line: 1 },
      { user: { login: 'alice' }, body: '   ' },
    ],
  }), /No attributable review comments/);
});

// End-to-end: adapter output -> the real ingest_transcript path -> a candidate authored by the
// reviewer with author_trust "extracted" (the model step is simulated as in the it57/it58 tests).
test('adapter output drives ingest_transcript so a reviewer becomes the decision author (extracted)', async () => {
  const { buildServer } = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = buildServer({});
  const client = new Client({ name: 'ghreview-test', version: '1.0.0' }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    const { text, source_meta } = formatGithubReview(EXPORT);
    const ingest = JSON.parse((await client.callTool({
      name: 'ingest_transcript', arguments: { text, source_meta },
    })).content[0].text);
    // The stored source carries the PR ref; the extraction prompt got the attributed transcript.
    assert.match(ingest.source_id, /^src_/);
    assert.match(ingest.extraction_prompt, /@alice \(on src\/Settings\.tsx:88\)/);

    // Simulate the caller's model extracting alice's ruling (same pattern as the it57 test).
    const candidates = JSON.parse((await client.callTool({
      name: 'ingest_transcript_results',
      arguments: {
        source_id: ingest.source_id,
        extraction_json: JSON.stringify([
          { statement: 'Keep settings groups flat, no nested cards', rationale: null, alternatives_rejected: [], author: 'alice' },
        ]),
      },
    })).content[0].text);
    assert.equal(candidates.candidates[0].node.author, 'alice');
    assert.equal(candidates.candidates[0].node.author_trust, 'extracted');
    assert.equal(candidates.candidates[0].node.status, 'candidate');
  } finally {
    await client.close();
    await server.close();
  }
});
