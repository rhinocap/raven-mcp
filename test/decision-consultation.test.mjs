import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.RAVEN_NO_USAGE_LOG = '1';

const { buildServer } = await import('../dist/index.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

async function withDecisionClient(run) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  const client = new Client({ name: 'decision-consultation-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

function newStore() {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-consultation-')));
}

function traceEvents(store) {
  return readFileSync(path.join(store, 'consultations.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
}

function report(store) {
  const result = spawnSync(process.execPath, ['scripts/consultation-report.mjs'], {
    cwd: path.resolve('.'),
    env: { ...process.env, RAVEN_DECISIONS_HOME: store },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('a targeted decision_get by a non-author is reported as a consultation; a list scan is not', async () => {
  const store = newStore();
  process.env.RAVEN_DECISIONS_HOME = store;
  delete process.env.RAVEN_NO_CONSULTATION_TRACE;
  process.env.RAVEN_AGENT_ID = 'andrew';
  await withDecisionClient(async (client) => {
    const created = JSON.parse((await client.callTool({
      name: 'decision_add',
      arguments: { statement: 'Keep the panel flat', scope: 'layout', component_ref: 'Panel' },
    })).content[0].text);
    assert.equal(created.author, 'andrew');

    process.env.RAVEN_AGENT_ID = 'engineer';
    const tracedRead = await client.callTool({ name: 'decision_get', arguments: { id: created.id } });
    const events = traceEvents(store);
    assert.equal(events.length, 1);
    assert.equal(events[0].reader, 'engineer');
    assert.equal(events[0].tool, 'decision_get');
    assert.ok(events[0].decision_ids.includes(created.id));
    assert.deepEqual(events[0].authors, ['andrew']);
    process.env.RAVEN_NO_CONSULTATION_TRACE = '1';
    const untracedRead = await client.callTool({ name: 'decision_get', arguments: { id: created.id } });
    assert.equal(untracedRead.content[0].text, tracedRead.content[0].text, 'tracing must not change tool response bytes');
    delete process.env.RAVEN_NO_CONSULTATION_TRACE;

    // The targeted get is credited; a subsequent list scan is browsing, not consultation.
    await client.callTool({ name: 'decision_list', arguments: {} });
    assert.deepEqual(report(store), {
      non_author_consultations: 1,
      per_reader: { engineer: 1 },
      scans_excluded: 1,
      ambiguous_provenance_excluded: 0,
      untrusted_author_excluded: 0,
    });
  });
});

test('an author reading their own decision does not increment the non-author count', async () => {
  const store = newStore();
  process.env.RAVEN_DECISIONS_HOME = store;
  delete process.env.RAVEN_NO_CONSULTATION_TRACE;
  process.env.RAVEN_AGENT_ID = 'andrew';
  await withDecisionClient(async (client) => {
    const created = JSON.parse((await client.callTool({
      name: 'decision_add',
      arguments: { statement: 'Keep the panel flat', scope: 'layout', component_ref: 'Panel' },
    })).content[0].text);
    await client.callTool({ name: 'decision_get', arguments: { id: created.id } });
    assert.equal(traceEvents(store).length, 1);
    assert.deepEqual(report(store), {
      non_author_consultations: 0,
      per_reader: {},
      scans_excluded: 0,
      ambiguous_provenance_excluded: 0,
      untrusted_author_excluded: 0,
    });
  });
});

test('an extracted-author read is DROPPED; committing the author promotes trust and the same read COUNTS', async () => {
  const store = newStore();
  process.env.RAVEN_DECISIONS_HOME = store;
  delete process.env.RAVEN_NO_CONSULTATION_TRACE;
  await withDecisionClient(async (client) => {
    // Capture a decision from a transcript: author 'jordan' is MODEL-EXTRACTED, not confirmed.
    process.env.RAVEN_AGENT_ID = 'engineer';
    const ingest = JSON.parse((await client.callTool({
      name: 'ingest_transcript',
      arguments: { text: 'Jordan: Use cards.', source_meta: { ref: 'Review thread' } },
    })).content[0].text);
    const candidates = JSON.parse((await client.callTool({
      name: 'ingest_transcript_results',
      arguments: {
        source_id: ingest.source_id,
        extraction_json: JSON.stringify([
          { statement: 'Use cards', rationale: null, alternatives_rejected: [], author: 'jordan' },
        ]),
      },
    })).content[0].text);
    const id = candidates.candidates[0].node.id;
    assert.equal(candidates.candidates[0].node.author_trust, 'extracted');

    // engineer (≠ jordan) reads it while the author is only extracted.
    await client.callTool({ name: 'decision_get', arguments: { id } });
    let events = traceEvents(store);
    assert.deepEqual(events[0].author_trusts, ['extracted'], 'trust is snapshotted at read time');
    // DROPPED: a spoofable extracted author cannot establish non-authorship (Sol #2).
    assert.deepEqual(report(store), {
      non_author_consultations: 0,
      per_reader: {},
      scans_excluded: 0,
      ambiguous_provenance_excluded: 0,
      untrusted_author_excluded: 1,
    });

    // A human commit confirms the attribution.
    const committed = JSON.parse((await client.callTool({
      name: 'decision_commit', arguments: { id, rationale: 'Cards scan well.' },
    })).content[0].text);
    assert.equal(committed.decision.author_trust, 'confirmed');

    // The SAME engineer reads the SAME decision — now with a confirmed author.
    await client.callTool({ name: 'decision_get', arguments: { id } });
    events = traceEvents(store);
    assert.deepEqual(events[1].author_trusts, ['confirmed']);
    // COUNTS now; the earlier extracted-era read stays dropped.
    assert.deepEqual(report(store), {
      non_author_consultations: 1,
      per_reader: { engineer: 1 },
      scans_excluded: 0,
      ambiguous_provenance_excluded: 0,
      untrusted_author_excluded: 1,
    });
  });
});

test('a mixed-trust decision (one confirmed + one extracted author) is DROPPED, not counted', () => {
  // Directly craft the trace: the confirmed author would normally establish non-authorship, but the
  // extracted "jordn" may be a misspelling of reader "jordan" — a mis-attributed real author. The
  // gate must not count this (Sol it58 adverse #1: multi-author bypass).
  const store = newStore();
  writeFileSync(path.join(store, 'consultations.jsonl'),
    JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', reader: 'jordan', tool: 'decision_get',
      decision_ids: ['dec_x'], authors: ['andrew', 'jordn'], author_trusts: ['confirmed', 'extracted'] }) + '\n' +
    // Control: same shape but both authors confirmed and neither is the reader → counts.
    JSON.stringify({ ts: '2026-01-01T00:00:01.000Z', reader: 'engineer', tool: 'decision_get',
      decision_ids: ['dec_y'], authors: ['andrew', 'jordan'], author_trusts: ['confirmed', 'confirmed'] }) + '\n');
  assert.deepEqual(report(store), {
    non_author_consultations: 1,           // only the all-confirmed control
    per_reader: { engineer: 1 },
    scans_excluded: 0,
    ambiguous_provenance_excluded: 0,
    untrusted_author_excluded: 1,          // the mixed-trust read is dropped
  });
});

test('RAVEN_NO_CONSULTATION_TRACE disables trace writes', async () => {
  const store = newStore();
  process.env.RAVEN_DECISIONS_HOME = store;
  process.env.RAVEN_NO_CONSULTATION_TRACE = '1';
  process.env.RAVEN_AGENT_ID = 'engineer';
  await withDecisionClient(async (client) => {
    await client.callTool({
      name: 'decision_add',
      arguments: { statement: 'Keep the panel flat', scope: 'layout', component_ref: 'Panel', author: 'andrew' },
    });
    await client.callTool({ name: 'decision_list', arguments: {} });
  });
  assert.equal(existsSync(path.join(store, 'consultations.jsonl')), false);
});
