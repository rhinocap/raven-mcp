import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'raven-decisions-'));
process.env.RAVEN_NO_USAGE_LOG = '1';

const {
  FsDecisionGraphStore,
  LexicalEmbedder,
  NullEmbedder,
  buildGapDigest,
  buildConflictPayload,
  buildExtractionPrompt,
  cosineSimilarity,
  flagRationaleMissing,
  gapScanConfig,
  parseExtractionJson,
  scanGaps,
  similarityThreshold,
} = await import('../dist/decision-graph.js');

beforeEach(() => {
  process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'raven-decisions-'));
});

function decision(id, overrides = {}) {
  return flagRationaleMissing({
    node_kind: 'decision',
    id,
    statement: 'Use the established card primitive',
    rationale: 'It already satisfies the interaction contract.',
    scope: 'checkout',
    component_ref: 'Card',
    alternatives_rejected: ['Create a parallel card'],
    status: 'active',
    superseded_by: null,
    created_at: '2026-07-12T00:00:00.000Z',
    ...overrides,
  });
}

function evidence(id, overrides = {}) {
  return {
    node_kind: 'evidence',
    id,
    type: 'quant',
    source_ref: 'experiment-42',
    result_summary: 'Completion increased by 12%.',
    confidence: 0.9,
    confounds: ['small sample'],
    timestamp: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

function source(id, overrides = {}) {
  return {
    node_kind: 'source',
    id,
    kind: 'research-note',
    ref: 'notes/checkout.md',
    created_at: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

test('addNode and getNode round-trip all three node kinds', async () => {
  const store = new FsDecisionGraphStore();
  const nodes = [decision('decision-1'), evidence('evidence-1'), source('source-1')];

  for (const node of nodes) {
    const added = await store.addNode(node);
    if (node.node_kind === 'decision') assert.equal(added.embedding, null);
    assert.deepEqual(await store.getNode(node.id), added);
  }
});

test('concurrent addNode calls persist every node', async () => {
  const store = new FsDecisionGraphStore();
  const nodes = Array.from({ length: 10 }, (_, index) => decision('decision-concurrent-' + index));

  await Promise.all(nodes.map((node) => store.addNode(node)));

  assert.deepEqual(
    (await store.listActiveDecisions()).map((node) => node.id).sort(),
    nodes.map((node) => node.id).sort(),
  );
});

test('flagRationaleMissing flags null, undefined, and blank rationale only', () => {
  assert.equal(flagRationaleMissing({ rationale: null }).rationale_missing, true);
  assert.equal(flagRationaleMissing({ rationale: undefined }).rationale_missing, true);
  assert.equal(flagRationaleMissing({ rationale: '   ' }).rationale_missing, true);
  assert.equal(flagRationaleMissing({ rationale: 'Because it reduces risk.' }).rationale_missing, false);
});

test('parseExtractionJson accepts arrays, wrappers, and fenced JSON', () => {
  const expected = [{ statement: 'Use cards', rationale: 'They scan well.', alternatives_rejected: ['Use a table'] }];
  assert.deepEqual(parseExtractionJson(JSON.stringify(expected)), { ok: true, items: expected, skipped: 0 });
  assert.deepEqual(parseExtractionJson(JSON.stringify({ decisions: expected })), { ok: true, items: expected, skipped: 0 });
  assert.deepEqual(parseExtractionJson('```json\n' + JSON.stringify(expected) + '\n```'), { ok: true, items: expected, skipped: 0 });
});

test('parseExtractionJson rejects malformed or empty input', () => {
  assert.equal(parseExtractionJson('{nope').ok, false);
  assert.equal(parseExtractionJson('[]').ok, false);
});

test('parseExtractionJson normalizes fields and counts skipped items', () => {
  const result = parseExtractionJson(JSON.stringify([
    { rationale: 'missing statement' },
    { statement: '  Keep the sidebar  ', rationale: '', alternatives_rejected: ['Keep tabs', 42, null] },
  ]));
  assert.deepEqual(result, {
    ok: true,
    items: [{ statement: 'Keep the sidebar', rationale: null, alternatives_rejected: ['Keep tabs'] }],
    skipped: 1,
  });
});

test('buildExtractionPrompt requires distinct decisions and strict JSON only', () => {
  const prompt = buildExtractionPrompt('Speaker: We chose cards because they scan well.');
  assert.match(prompt, /DISTINCT genuine design decisions/);
  assert.match(prompt, /discard chatter, questions, and unresolved debates/i);
  assert.match(prompt, /STRICT JSON array/);
  assert.match(prompt, /rationale.*null/i);
  assert.match(prompt, /no prose outside/i);
  assert.match(prompt, /Speaker: We chose cards because they scan well\./);
});

test('updateNode merges patches and leaves unpatched fields intact', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-update'));

  const updated = await store.updateNode('decision-update', {
    scope: 'checkout/mobile',
    alternatives_rejected: ['Use a modal'],
  });

  assert.equal(updated.statement, 'Use the established card primitive');
  assert.equal(updated.scope, 'checkout/mobile');
  assert.deepEqual(updated.alternatives_rejected, ['Use a modal']);
});

test('superseding retains the old node with status and replacement link', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-old'));
  await store.addNode(decision('decision-new', { statement: 'Use the compact card primitive' }));

  await store.updateNode('decision-old', {
    status: 'superseded',
    superseded_by: 'decision-new',
  });

  const oldNode = await store.getNode('decision-old');
  assert.equal(oldNode.status, 'superseded');
  assert.equal(oldNode.superseded_by, 'decision-new');
});

test('neighbors traverses edges in both directions and filters by edge type', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-neighbor'));
  await store.addNode(evidence('evidence-support'));
  await store.addNode(source('source-origin'));
  await store.addEdge({
    id: 'edge-supports',
    from: 'evidence-support',
    to: 'decision-neighbor',
    type: 'supports',
    created_at: '2026-07-12T00:00:00.000Z',
  });
  await store.addEdge({
    id: 'edge-derived',
    from: 'decision-neighbor',
    to: 'source-origin',
    type: 'derived_from',
    created_at: '2026-07-12T00:00:00.000Z',
  });

  assert.deepEqual(
    (await store.neighbors('decision-neighbor')).map((node) => node.id).sort(),
    ['evidence-support', 'source-origin'],
  );
  assert.deepEqual(
    (await store.neighbors('decision-neighbor', 'supports')).map((node) => node.id),
    ['evidence-support'],
  );
  assert.deepEqual(
    (await store.neighbors('evidence-support', 'supports')).map((node) => node.id),
    ['decision-neighbor'],
  );
});

test('listActiveDecisions excludes superseded decisions and non-decisions', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-active'));
  await store.addNode(decision('decision-superseded', { status: 'superseded', superseded_by: 'decision-active' }));
  await store.addNode(evidence('evidence-not-a-decision'));

  assert.deepEqual((await store.listActiveDecisions()).map((node) => node.id), ['decision-active']);
});

test('decision embeddings are stored and refreshed while NullEmbedder stores null', async () => {
  const calls = [];
  const fakeEmbedder = {
    async embed(text) {
      calls.push(text);
      return [text.length, 0.5];
    },
  };
  const embeddedStore = new FsDecisionGraphStore(fakeEmbedder);
  const added = await embeddedStore.addNode(decision('decision-embedded'));
  assert.deepEqual(added.embedding, [
    'Use the established card primitive\nIt already satisfies the interaction contract.'.length,
    0.5,
  ]);
  assert.deepEqual(calls, ['Use the established card primitive\nIt already satisfies the interaction contract.']);

  const updated = await embeddedStore.updateNode('decision-embedded', { rationale: 'New evidence.' });
  assert.deepEqual(updated.embedding, ['Use the established card primitive\nNew evidence.'.length, 0.5]);
  assert.equal(updated.rationale_missing, false);
  assert.equal(calls.length, 2);

  await embeddedStore.updateNode('decision-embedded', { scope: 'checkout/desktop' });
  assert.equal(calls.length, 2, 'unrelated patches do not trigger re-embedding');

  const nullStore = new FsDecisionGraphStore(new NullEmbedder());
  const nullEmbedded = await nullStore.addNode(decision('decision-null-embedding'));
  assert.equal(nullEmbedded.embedding, null);
});

test('LexicalEmbedder is deterministic and cosineSimilarity handles identical and disjoint text', async () => {
  const embedder = new LexicalEmbedder();
  const first = await embedder.embed('Use the established card primitive');
  const second = await embedder.embed('Use the established card primitive');
  const disjoint = await embedder.embed('zebra quantum waterfall');

  assert.deepEqual(first, second);
  assert.ok(Math.abs(cosineSimilarity(first, second) - 1) < 1e-12);
  assert.ok(Math.abs(cosineSimilarity(first, disjoint)) < 1e-12);
  assert.equal(cosineSimilarity(null, first), 0);
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), 0);
});

test('findSimilarActiveDecisions uses inclusive thresholds and embeds legacy null vectors on the fly', async () => {
  const lexical = new LexicalEmbedder();
  const legacyStore = new FsDecisionGraphStore(new NullEmbedder());
  const existing = await legacyStore.addNode(decision('decision-existing', {
    statement: 'Use the established card primitive',
    rationale: 'It preserves the interaction contract.',
  }));
  assert.equal(existing.embedding, null);

  const store = new FsDecisionGraphStore(lexical);
  const candidate = decision('decision-candidate', {
    statement: 'Use the established card primitive',
    rationale: 'It preserves the interaction contract for checkout.',
  });
  const candidateVector = await lexical.embed(candidate.statement + '\n' + candidate.rationale);
  const existingVector = await lexical.embed(existing.statement + '\n' + existing.rationale);
  const exactSimilarity = cosineSimilarity(candidateVector, existingVector);

  const atBoundary = await store.findSimilarActiveDecisions(candidate, exactSimilarity, candidate.id);
  assert.deepEqual(atBoundary.map((match) => match.decision.id), ['decision-existing']);
  assert.equal(atBoundary[0].similarity, exactSimilarity);
  assert.deepEqual(await store.findSimilarActiveDecisions(candidate, exactSimilarity + Number.EPSILON, candidate.id), []);
  assert.equal((await store.getNode('decision-existing')).embedding, null, 'on-the-fly embedding is not persisted');
});

test('similarityThreshold defaults, parses, and clamps the environment knob', () => {
  const previous = process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD;
  try {
    delete process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD;
    assert.equal(similarityThreshold(), 0.8);
    process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD = '0.65';
    assert.equal(similarityThreshold(), 0.65);
    process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD = '-2';
    assert.equal(similarityThreshold(), 0);
    process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD = '3';
    assert.equal(similarityThreshold(), 1);
    process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD = 'not-a-number';
    assert.equal(similarityThreshold(), 0.8);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD;
    else process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD = previous;
  }
});

test('buildConflictPayload includes side-by-side evidence summaries and explicit resolution tools', async () => {
  const first = decision('decision-conflict-a');
  const second = decision('decision-conflict-b', { statement: 'Create a parallel card primitive' });
  const payload = await buildConflictPayload(first, second, 0.91, async (id) => {
    return id === first.id ? ['Checkout completion increased by 12%.'] : ['Moderated sessions preferred the new card.'];
  });

  assert.deepEqual(payload.decision_a.evidence_summaries, ['Checkout completion increased by 12%.']);
  assert.deepEqual(payload.decision_b.evidence_summaries, ['Moderated sessions preferred the new card.']);
  assert.equal(payload.similarity, 0.91);
  assert.match(payload.resolution_note, /decision_supersede/);
  assert.match(payload.resolution_note, /decision_scope/);
  assert.match(payload.resolution_note, /never auto-resolves/i);
});

test('draft then commit recomputes rationale flag and confirms trust', async () => {
  const store = new FsDecisionGraphStore();
  const drafted = await store.addNode(decision('decision-draft', {
    rationale: null,
    rationale_trust: null,
  }));
  assert.equal(drafted.rationale_missing, true);
  assert.equal(drafted.rationale_trust, null);

  const committed = await store.updateNode('decision-draft', {
    rationale: 'It keeps the working context legible.',
    rationale_trust: 'confirmed',
  });
  assert.equal(committed.rationale_missing, false);
  assert.equal(committed.rationale_trust, 'confirmed');
});

test('transcript candidates link extracted decisions to their source', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(source('source-transcript', { kind: 'meeting', ref: 'Design crit 2026-07-12' }));
  const extracted = await store.addNode(decision('decision-extracted', {
    rationale: 'It reduces visual noise.',
    rationale_trust: 'extracted',
  }));
  await store.addEdge({
    id: 'edge-derived-transcript',
    from: extracted.id,
    to: 'source-transcript',
    type: 'derived_from',
    created_at: '2026-07-12T00:00:00.000Z',
  });

  assert.equal(extracted.rationale_trust, 'extracted');
  assert.deepEqual(
    (await store.neighbors('source-transcript', 'derived_from')).map((node) => node.id),
    ['decision-extracted'],
  );
});

test('scanGaps detects uncovered reference components with their source', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-card'));

  const findings = await scanGaps(store, {
    reference_components: [
      { name: 'Card', source: 'patterns/cards' },
      { name: 'Primary navigation', source: 'patterns/navigation' },
    ],
    config: gapScanConfig(),
  });

  const coverage = findings.filter((finding) => finding.gap_type === 'coverage_gap');
  assert.equal(coverage.length, 1);
  assert.match(coverage[0].what, /Primary navigation/);
  assert.equal(coverage[0].surfaced_by, 'patterns/navigation');
  assert.equal(coverage[0].decision_id, null);
});

test('scanGaps flags missing and thin rationales', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-missing', { rationale: null }));
  await store.addNode(decision('decision-thin', { rationale: 'Too short.' }));

  const findings = await scanGaps(store, {
    reference_components: [],
    config: { ...gapScanConfig(), thinRationaleMinChars: 20 },
  });

  assert.equal(findings.some((finding) => finding.gap_type === 'missing_rationale' && finding.decision_id === 'decision-missing'), true);
  assert.equal(findings.some((finding) => finding.gap_type === 'thin_rationale' && finding.decision_id === 'decision-thin'), true);
});

test('scanGaps ranks configured weights, high traffic, and contested evidence', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-covered', { component_ref: 'Button' }));
  await store.addNode(decision('decision-missing', { rationale: null }));
  await store.addNode(decision('decision-contested', { status: 'contested' }));
  await store.addNode(decision('decision-contested-evidence', { status: 'contested' }));
  await store.addNode(decision('decision-stale', { created_at: '2020-01-01T00:00:00.000Z' }));
  await store.addNode(decision('decision-refreshed', { created_at: '2020-01-01T00:00:00.000Z' }));
  await store.addNode(evidence('evidence-support'));
  await store.addEdge({
    id: 'edge-evidence-support',
    from: 'evidence-support',
    to: 'decision-contested-evidence',
    type: 'supports',
    created_at: '2026-07-12T00:00:00.000Z',
  });
  await store.addEdge({
    id: 'edge-supersedes-activity',
    from: 'decision-covered',
    to: 'decision-refreshed',
    type: 'supersedes',
    created_at: '2021-01-01T00:00:00.000Z',
  });

  const config = {
    staleAfterDays: 90,
    thinRationaleMinChars: 5,
    weights: {
      coverage_gap: 100,
      contested_with_evidence: 90,
      contested: 60,
      missing_rationale: 50,
      thin_rationale: 40,
      stale: 30,
    },
  };
  const findings = await scanGaps(store, {
    reference_components: [
      { name: 'Button', source: 'patterns/button' },
      { name: 'Navigation', source: 'patterns/navigation', traffic: 'high' },
      { name: 'Tooltip', source: 'patterns/tooltip' },
    ],
    config,
  });

  assert.deepEqual(findings.slice(0, 5).map((finding) => finding.score), [150, 100, 90, 60, 50]);
  assert.equal(findings.find((finding) => finding.decision_id === 'decision-contested-evidence').score, 90);
  assert.equal(findings.find((finding) => finding.decision_id === 'decision-contested-evidence').gap_type, 'contested_with_evidence');
  assert.equal(findings.find((finding) => finding.decision_id === 'decision-contested').score, 60);
  assert.equal(findings.find((finding) => finding.decision_id === 'decision-contested').gap_type, 'contested');
  assert.equal(findings.some((finding) => finding.gap_type === 'stale' && finding.decision_id === 'decision-stale'), true);
  assert.equal(findings.some((finding) => finding.gap_type === 'stale' && finding.decision_id === 'decision-refreshed'), false);
});

test('healthy graph produces the quiet digest and gap_scan digest_only contract', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-healthy', {
    statement: 'Use Card for the checkout summary',
    rationale: 'It preserves the established interaction and accessibility contract.',
  }));
  const findings = await scanGaps(store, {
    reference_components: [{ name: 'Card', source: 'patterns/cards' }],
    config: gapScanConfig(),
  });
  assert.deepEqual(buildGapDigest(findings), {
    actionable: false,
    summary: 'Decision graph healthy — no gaps.',
    findings: [],
  });

  const { buildServer } = await import('../dist/index.js');
  const tool = buildServer({})._registeredTools.gap_scan;
  assert.ok(tool);
  const result = await tool.handler({ use_cases: ['Card'], reference_systems: [], digest_only: true }, {});
  assert.deepEqual(JSON.parse(result.content[0].text), {
    actionable: false,
    summary: 'Decision graph healthy — no gaps.',
    findings: [],
  });
});

test('coverage matching is token-boundary, not substring', async () => {
  const store = new FsDecisionGraphStore();
  await store.addNode(decision('decision-discard', { component_ref: 'Discard', statement: 'Discard stale drafts nightly' }));

  const findings = await scanGaps(store, {
    reference_components: [{ name: 'Card', source: 'patterns/cards' }],
    config: gapScanConfig(),
  });
  assert.equal(findings.some((finding) => finding.gap_type === 'coverage_gap' && /Card/.test(finding.what)), true,
    '"Discard" must not count as coverage for "Card"');
});

test('gapScanConfig env overrides for stale days and thin rationale chars apply', async () => {
  const saved = {
    stale: process.env.RAVEN_DECISION_STALE_DAYS,
    thin: process.env.RAVEN_DECISION_THIN_RATIONALE_CHARS,
  };
  try {
    process.env.RAVEN_DECISION_STALE_DAYS = '10000';
    process.env.RAVEN_DECISION_THIN_RATIONALE_CHARS = '200';
    const config = gapScanConfig();
    assert.equal(config.staleAfterDays, 10000);
    assert.equal(config.thinRationaleMinChars, 200);

    const store = new FsDecisionGraphStore();
    await store.addNode(decision('decision-old-but-fine', { created_at: '2020-01-01T00:00:00.000Z' }));
    const findings = await scanGaps(store, { reference_components: [], config });
    assert.equal(findings.some((finding) => finding.gap_type === 'stale'), false, 'huge stale window suppresses staleness');
    assert.equal(findings.some((finding) => finding.gap_type === 'thin_rationale'), true, 'huge thin threshold flags a normal rationale');

    process.env.RAVEN_DECISION_STALE_DAYS = 'not-a-number';
    assert.equal(gapScanConfig().staleAfterDays, 90, 'NaN falls back to default');
  } finally {
    for (const [key, value] of [['RAVEN_DECISION_STALE_DAYS', saved.stale], ['RAVEN_DECISION_THIN_RATIONALE_CHARS', saved.thin]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('gap_scan rejects unknown reference system ids instead of scanning nothing', async () => {
  const { buildServer } = await import('../dist/index.js');
  const tool = buildServer({})._registeredTools.gap_scan;
  const result = await tool.handler({ reference_systems: ['no-such-system'], digest_only: true }, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no-such-system/);
});

test('gapScanConfig environment weight overrides change ordering', async () => {
  const previous = process.env.RAVEN_GAP_WEIGHT_MISSING_RATIONALE;
  try {
    process.env.RAVEN_GAP_WEIGHT_MISSING_RATIONALE = '250';
    const store = new FsDecisionGraphStore();
    await store.addNode(decision('decision-missing', { rationale: null }));
    const findings = await scanGaps(store, {
      reference_components: [{ name: 'Navigation', source: 'patterns/navigation' }],
      config: gapScanConfig(),
    });
    assert.deepEqual(findings.slice(0, 2).map((finding) => finding.gap_type), ['missing_rationale', 'coverage_gap']);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_GAP_WEIGHT_MISSING_RATIONALE;
    else process.env.RAVEN_GAP_WEIGHT_MISSING_RATIONALE = previous;
  }
});

test('decision MCP tools add, get with neighbors, list by status, and stay remote-gated', async () => {
  const { buildServer } = await import('../dist/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const localServer = buildServer({});
  const client = new Client({ name: 'decision-graph-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await localServer.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const addedResult = await client.callTool({
      name: 'decision_add',
      arguments: {
        statement: 'Use the established card primitive',
        scope: 'checkout',
        component_ref: 'Card',
      },
    });
    const added = JSON.parse(addedResult.content[0].text);
    assert.equal(added.rationale, null);
    assert.equal(added.rationale_missing, true);
    assert.equal(added.status, 'active');

    const draftResult = await client.callTool({
      name: 'decision_draft',
      arguments: { statement: 'Keep the sidebar', scope: 'editor', component_ref: 'Sidebar' },
    });
    const draft = JSON.parse(draftResult.content[0].text);
    assert.equal(draft.rationale_missing, true);
    assert.equal(draft.rationale_trust, null);

    const committedResult = await client.callTool({
      name: 'decision_commit',
      arguments: { id: draft.id, rationale: 'It preserves navigation context.' },
    });
    const commitPayload = JSON.parse(committedResult.content[0].text);
    const committed = commitPayload.decision;
    assert.equal(committed.rationale_missing, false);
    assert.equal(committed.rationale_trust, 'confirmed');
    assert.ok(Array.isArray(commitPayload.potential_conflicts));

    const ingestResult = await client.callTool({
      name: 'ingest_transcript',
      arguments: { text: 'We chose cards because they scan well.', source_meta: { ref: 'Design crit' } },
    });
    const ingest = JSON.parse(ingestResult.content[0].text);
    assert.match(ingest.source_id, /^src_/);
    assert.match(ingest.extraction_prompt, /We chose cards because they scan well\./);

    const candidatesResult = await client.callTool({
      name: 'ingest_transcript_results',
      arguments: {
        source_id: ingest.source_id,
        extraction_json: JSON.stringify([
          { statement: 'Use cards', rationale: 'They scan well.', alternatives_rejected: [] },
          { rationale: 'invalid' },
        ]),
      },
    });
    const candidates = JSON.parse(candidatesResult.content[0].text);
    assert.equal(candidates.candidates.length, 1);
    assert.equal(candidates.candidates[0].node.rationale_trust, 'extracted');
    assert.match(candidates.candidates[0].edge_id, /^edge_/);
    assert.equal(candidates.skipped, 1);
    assert.match(candidates.review_note, /nothing is auto-confirmed/i);

    const draftsOnlyResult = await client.callTool({ name: 'decision_list', arguments: { drafts_only: true } });
    const draftsOnly = JSON.parse(draftsOnlyResult.content[0].text);
    assert.deepEqual(draftsOnly.map((node) => node.id).sort(), [added.id, candidates.candidates[0].node.id].sort());

    const getResult = await client.callTool({ name: 'decision_get', arguments: { id: added.id } });
    const fetched = JSON.parse(getResult.content[0].text);
    assert.equal(fetched.node.id, added.id);
    assert.deepEqual(fetched.neighbors, []);

    const activeResult = await client.callTool({ name: 'decision_list', arguments: {} });
    assert.deepEqual(
      JSON.parse(activeResult.content[0].text).map((node) => node.id).sort(),
      [added.id, committed.id, candidates.candidates[0].node.id].sort(),
    );

    const contestedResult = await client.callTool({
      name: 'decision_list',
      arguments: { status: 'contested' },
    });
    assert.deepEqual(JSON.parse(contestedResult.content[0].text), []);

    const oldResult = await client.callTool({
      name: 'decision_add',
      arguments: {
        statement: 'Use tabs for account navigation',
        rationale: 'They keep sections visible.',
        scope: 'account',
        component_ref: 'AccountNav',
      },
    });
    const oldDecision = JSON.parse(oldResult.content[0].text);
    const newerResult = await client.callTool({
      name: 'decision_add',
      arguments: {
        statement: 'Use a sidebar for account navigation',
        rationale: 'It scales to more sections.',
        scope: 'account',
        component_ref: 'AccountNav',
      },
    });
    const newerDecision = JSON.parse(newerResult.content[0].text);
    const newestResult = await client.callTool({
      name: 'decision_add',
      arguments: {
        statement: 'Use grouped sidebar navigation for accounts',
        rationale: 'Groups preserve scanability.',
        scope: 'account',
        component_ref: 'AccountNav',
      },
    });
    const newestDecision = JSON.parse(newestResult.content[0].text);

    const firstSupersedeResult = await client.callTool({
      name: 'decision_supersede',
      arguments: { old_id: oldDecision.id, new_id: newerDecision.id },
    });
    const firstSupersede = JSON.parse(firstSupersedeResult.content[0].text);
    assert.equal(firstSupersede.old_decision.status, 'superseded');
    assert.equal(firstSupersede.old_decision.superseded_by, newerDecision.id);
    assert.equal(firstSupersede.new_decision.id, newerDecision.id);
    assert.equal(firstSupersede.edge.type, 'supersedes');
    assert.equal(firstSupersede.edge.from, newerDecision.id);
    assert.equal(firstSupersede.edge.to, oldDecision.id);

    await client.callTool({
      name: 'decision_supersede',
      arguments: { old_id: newerDecision.id, new_id: newestDecision.id },
    });
    const oldGetResult = await client.callTool({ name: 'decision_get', arguments: { id: oldDecision.id } });
    assert.equal(JSON.parse(oldGetResult.content[0].text).node.id, oldDecision.id, 'superseded decisions remain retrievable');
    const activeAfterSupersede = JSON.parse((await client.callTool({ name: 'decision_list', arguments: {} })).content[0].text);
    assert.equal(activeAfterSupersede.some((node) => node.id === oldDecision.id), false);

    const historyResult = await client.callTool({ name: 'decision_history', arguments: { id: newerDecision.id } });
    assert.deepEqual(
      JSON.parse(historyResult.content[0].text).map((node) => node.id),
      [oldDecision.id, newerDecision.id, newestDecision.id],
    );
    const nodesBeforeRejectedCycle = readFileSync(path.join(process.env.RAVEN_DECISIONS_HOME, 'nodes.json'), 'utf8');
    const edgesBeforeRejectedCycle = readFileSync(path.join(process.env.RAVEN_DECISIONS_HOME, 'edges.json'), 'utf8');
    const rejectedCycle = await client.callTool({
      name: 'decision_supersede',
      arguments: { old_id: newestDecision.id, new_id: oldDecision.id },
    });
    assert.equal(rejectedCycle.isError, true);
    assert.match(rejectedCycle.content[0].text, /would create a cyclic supersede lineage/);
    assert.equal(readFileSync(path.join(process.env.RAVEN_DECISIONS_HOME, 'nodes.json'), 'utf8'), nodesBeforeRejectedCycle);
    assert.equal(readFileSync(path.join(process.env.RAVEN_DECISIONS_HOME, 'edges.json'), 'utf8'), edgesBeforeRejectedCycle);

    const scopeA = JSON.parse((await client.callTool({
      name: 'decision_add',
      arguments: { statement: 'Use cards', scope: 'all checkout', component_ref: 'Checkout' },
    })).content[0].text);
    const scopeB = JSON.parse((await client.callTool({
      name: 'decision_add',
      arguments: { statement: 'Use rows', scope: 'all checkout', component_ref: 'Checkout' },
    })).content[0].text);
    const scopeResult = await client.callTool({
      name: 'decision_scope',
      arguments: { id_a: scopeA.id, id_b: scopeB.id, scope_a: 'checkout/mobile', scope_b: 'checkout/desktop' },
    });
    const scoped = JSON.parse(scopeResult.content[0].text);
    assert.equal(scoped.decision_a.scope, 'checkout/mobile');
    assert.equal(scoped.decision_b.scope, 'checkout/desktop');
    assert.equal(scoped.decision_a.status, 'active');
    assert.equal(scoped.decision_b.status, 'active');
    assert.equal(scoped.edge.type, 'scoped_alongside');

    const scopeSuperseded = await client.callTool({
      name: 'decision_scope',
      arguments: { id_a: oldDecision.id, id_b: scopeB.id, scope_a: 'x', scope_b: 'y' },
    });
    assert.equal(scopeSuperseded.isError, true, 'scoping a superseded decision is refused');

    const extractedCommitResult = await client.callTool({
      name: 'decision_commit',
      arguments: { id: candidates.candidates[0].node.id, rationale: 'They scan well.' },
    });
    const extractedCommit = JSON.parse(extractedCommitResult.content[0].text);
    assert.equal(extractedCommit.decision.rationale_trust, 'confirmed');
    assert.equal(extractedCommit.decision.rationale_missing, false);
    assert.ok(Array.isArray(extractedCommit.potential_conflicts), 'extracted-draft confirm also runs conflict detection');
  } finally {
    await client.close();
    await localServer.close();
  }

  const remoteNames = Object.keys(buildServer({ remote: true })._registeredTools);
  assert.equal(remoteNames.includes('decision_add'), false);
  assert.equal(remoteNames.includes('decision_get'), false);
  assert.equal(remoteNames.includes('decision_list'), false);
  assert.equal(remoteNames.includes('decision_draft'), false);
  assert.equal(remoteNames.includes('decision_commit'), false);
  assert.equal(remoteNames.includes('ingest_transcript'), false);
  assert.equal(remoteNames.includes('ingest_transcript_results'), false);
  assert.equal(remoteNames.includes('decision_supersede'), false);
  assert.equal(remoteNames.includes('decision_scope'), false);
  assert.equal(remoteNames.includes('decision_history'), false);
  assert.equal(remoteNames.includes('gap_scan'), false);
});
