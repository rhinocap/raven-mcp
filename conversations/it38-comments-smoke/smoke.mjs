// it38 comments-pipeline composition smoke (assert-based, self-exiting).
// Proves the #42 paste path -> #43 archive detection contract on REAL paste
// output — the two branches were never composed/tested together.
// Run: RAVEN_NO_USAGE_LOG=1 node smoke.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_DECISIONS_HOME = mkdtempSync(path.join(tmpdir(), 'it38-store-'));

const here = path.dirname(fileURLToPath(import.meta.url));
const pasteScript = path.join(here, 'scripts', 'figma-comments-archive.mjs');
const fixture = path.join(here, 'comments-fixture.txt');

const repo = mkdtempSync(path.join(tmpdir(), 'it38-repo-'));
const archiveDir = path.join(repo, 'figma-comments-archive');
mkdirSync(archiveDir, { recursive: true });

// Leg 1 — REAL #42 paste path, invoked exactly as a user would (stdin redirect).
// (The script reads stdin via readFileSync(0); execFile's async `input` option
//  deadlocks it — the shell `<` redirect is the real invocation.)
await execFileAsync('bash', ['-c',
  `node ${JSON.stringify(pasteScript)} --paste smoke --md --out ${JSON.stringify(archiveDir)} < ${JSON.stringify(fixture)}`]);
const produced = readFileSync(path.join(archiveDir, 'smoke.md'), 'utf8');
assert.match(produced, /^# Figma comments archive: smoke/, 'leg1: title line detection keys on');
assert.equal((produced.match(/^## Thread \d+$/gm) || []).length, 3, 'leg1: 3 thread headings');

const { buildServer } = await import('./dist/index.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

async function withClient(run) {
  const server = buildServer({});
  const client = new Client({ name: 'it38-smoke', version: '1.0.0' }, { capabilities: {} });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try { return await run(client); } finally { await client.close(); await server.close(); }
}
const call = async (client, name, args) =>
  JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

const log = (m) => console.error(`[smoke] ${m}`);
log('leg1 ok, opening client');
await withClient(async (client) => {
  log('client open; decision_import default');
  // Leg 2 — REAL #43 decision_import (default globs): must DETECT the paste artifact
  const def = await call(client, 'decision_import', { repo_path: repo });
  log('default import returned; kinds=' + def.chunks.map((c) => c.kind).join(','));
  assert.equal(def.chunks.every((ch) => ch.kind === 'figma-comments'), true, 'leg2: detected figma-comments, not doc');
  assert.equal(def.counts.doc_files, 1, 'leg2: the one archive discovered by default glob');

  // source node carries figma kind + thread_count from the paste output
  const src = (await call(client, 'decision_get', { id: def.chunks[0].source_id })).node;
  assert.equal(src.kind, 'figma-comments');
  assert.equal(src.thread_count, 3, 'thread_count reflects the 3 pasted threads');

  // Default-cap provenance completeness (the realistic operating condition): every
  // thread's `## Thread n` anchor + the archive title are present in the material the
  // extractor sees, so it can assign a `#Thread n` ref for any decision it finds.
  log('src ok kind=' + src.kind + ' threads=' + src.thread_count);
  const figma = def.chunks.filter((ch) => ch.kind === 'figma-comments');
  const allMaterial = figma.map((ch) => ch.extraction_prompt.split('IMPORTED MATERIAL:\n')[1]).join('\n');
  assert.match(allMaterial, /# Figma comments archive: smoke/, 'archive title anchors the material');
  for (const n of [1, 2, 3]) {
    assert.match(allMaterial, new RegExp('^## Thread ' + n + '\\b', 'm'), `thread ${n} anchor present for provenance`);
  }
  assert.match(figma[0].extraction_prompt, /source_ref MUST be path#Thread <n>/, 'figma extraction prompt');

  // Recorded caveat (not a contract failure): at a small max_chunk_chars a single
  // thread longer than the cap sub-splits into `[continuation k/n]` pieces, and only
  // the first re-carries the `## Thread n` heading — provenance weakens for that one
  // oversized thread. Threads under the cap (the norm) are unaffected.
  const capped = await call(client, 'decision_import', { repo_path: repo, max_chunk_chars: 200 });
  const cappedFigma = capped.chunks.filter((ch) => ch.kind === 'figma-comments');
  const headerless = cappedFigma.filter((ch) => {
    const m = ch.extraction_prompt.split('IMPORTED MATERIAL:\n')[1];
    return m.startsWith('[continuation ') && !/## Thread \d+/.test(m);
  });
  log(`caveat: ${headerless.length}/${cappedFigma.length} small-cap chunks are headerless thread continuations`);

  // provenance validation: in-range ref accepted, out-of-range stripped
  const ing = await call(client, 'ingest_transcript_results', {
    source_id: src.id,
    extraction_json: JSON.stringify([
      { statement: 'Use the compact card layout', rationale: 'Keeps controls above the fold.', alternatives_rejected: [], source_ref: 'figma-comments-archive/smoke.md#Thread 1' },
      { statement: 'Beyond the archive', rationale: null, alternatives_rejected: [], source_ref: 'figma-comments-archive/smoke.md#Thread 4' },
    ]),
  });
  assert.equal(ing.candidates[0].source_ref, 'figma-comments-archive/smoke.md#Thread 1', 'valid thread ref accepted');
  assert.equal(ing.candidates[1].source_ref, null, 'thread 4 (> count) stripped');
  assert.equal(ing.rejected_source_refs[0].reason, 'source_ref names Thread 4 but figma-comments-archive/smoke.md has only 3 thread(s)');
});

console.log('SMOKE PASS: #42 paste -> #43 archive detection composes; 3 threads, per-thread provenance intact.');
process.exit(0);
