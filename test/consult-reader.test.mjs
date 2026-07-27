import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// consult.mjs is the reader CLI: browse (list, a scan) → targeted get (the credited
// consultation). This locks its match logic + that a get is traced for the matched decision.
test('consult.mjs matches by query and records a targeted-get consultation', () => {
  const store = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-consult-')));
  writeFileSync(path.join(store, 'nodes.json'), JSON.stringify({ version: 1, nodes: [
    { node_kind: 'decision', id: 'dec_a', author: 'andrew', statement: 'Restrict orange to code', rationale: null, rationale_missing: false, scope: 'accent-orange-scope', component_ref: 'x', alternatives_rejected: [], status: 'active', superseded_by: null },
    { node_kind: 'decision', id: 'dec_b', author: 'andrew', statement: 'Serif line-height >= 120%', rationale: null, rationale_missing: false, scope: 'typography', component_ref: 'y', alternatives_rejected: [], status: 'active', superseded_by: null },
  ] }));
  writeFileSync(path.join(store, 'edges.json'), JSON.stringify({ version: 1, edges: [] }));

  // Force tracing on regardless of the ambient RAVEN_NO_CONSULTATION_TRACE the suite may set.
  const readerEnv = { ...process.env, RAVEN_DECISIONS_HOME: store, RAVEN_AGENT_ID: 'frontend-agent', RAVEN_NO_USAGE_LOG: '1' };
  delete readerEnv.RAVEN_NO_CONSULTATION_TRACE;
  const res = spawnSync(process.execPath, ['scripts/consult.mjs', 'orange'], {
    cwd: path.resolve('.'),
    env: readerEnv,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.matched, 1);
  assert.equal(out.decisions[0].id, 'dec_a');

  // The reporter credits the targeted get (non-author) and excludes the list scan.
  const rep = spawnSync(process.execPath, ['scripts/consultation-report.mjs'], {
    cwd: path.resolve('.'), env: { ...process.env, RAVEN_DECISIONS_HOME: store }, encoding: 'utf8',
  });
  assert.equal(rep.status, 0, rep.stderr);
  const report = JSON.parse(rep.stdout);
  assert.equal(report.non_author_consultations, 1);
  assert.deepEqual(report.per_reader, { 'frontend-agent': 1 });

  // Trace has exactly one credited get for the matched decision.
  const events = readFileSync(path.join(store, 'consultations.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const gets = events.filter((e) => e.tool === 'decision_get');
  assert.equal(gets.length, 1);
  assert.deepEqual(gets[0].decision_ids, ['dec_a']);
});
