// Handler-level tests for the three pattern-library tools. The module-level
// tests in reference-store/reference-tokens cover the logic; these cover the
// seam that logic tests cannot see — whether the shapes the tools ACCEPT are the
// shapes the rest of the loop actually produces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.RAVEN_NO_USAGE_LOG = '1';
const indexMod = await import(path.resolve(__dirname, '../dist/index.js'));

async function withClient(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ remote: false });
  const client = new Client({ name: 'pattern-library-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-patternlib-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return await fn(client, home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
    await client.close();
    await server.close();
  }
}

const call = async (client, name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

test('capture_reference accepts the state-style shape get_grabbed_elements actually returns', async () => {
  // Grab returns { hover: { declarations: [{ property, value }] } }. The tool told
  // callers to pass the drained selection straight through while declaring
  // record<record<string>>, so a real selection was rejected — the loop's two
  // halves did not connect at exactly the seam the feature exists to close.
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'h1.hero',
      styles: { 'font-size': '64px' },
      owner: 'third-party',
      tags: ['hero'],
      state_styles: {
        hover: { declarations: [{ property: 'color', value: 'rgb(255, 255, 255)' }, { property: 'opacity', value: '0.9' }] }
      }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'rgb(255, 255, 255)', opacity: '0.9' } });
  });
});

test('capture_reference still accepts a plain per-state style map', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      selector: 'h1.hero',
      styles: { 'font-size': '64px' },
      owner: 'third-party',
      tags: ['hero'],
      state_styles: { hover: { color: 'rgb(255, 255, 255)' } }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'rgb(255, 255, 255)' } });
  });
});

test('the three tools compose into one capture -> search -> map loop', async () => {
  await withClient(async (client, home) => {
    const designPath = path.join(home, 'DESIGN.md');
    await writeFile(designPath, '---\ntype:\n  size:\n    hero: "64px"\n  leading:\n    hero: "64px"\ncolor:\n  text:\n    primary: "#f7f8f8"\n---\n\n# Fixture\n', 'utf8');

    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/features',
      app: 'Linear',
      selector: 'h1.hero',
      styles: { 'font-size': '64px', 'line-height': '64px', color: 'rgb(247, 248, 248)' },
      owner: 'third-party',
      tags: ['hero', 'typography'],
      note: 'The hero headline weight is the detail worth keeping.'
    });

    const found = await call(client, 'search_references', { query: 'hero headline' });
    assert.equal(found.total, 1);
    assert.equal(found.results[0].reference.ref_id, saved.ref_id);

    const mapped = await call(client, 'map_reference_to_tokens', { ref_id: saved.ref_id, design_file_path: designPath });
    const bound = Object.fromEntries(mapped.bindings.map((binding) => [binding.property, binding.token]));
    assert.equal(bound['font-size'], 'type.size.hero');
    assert.equal(bound['line-height'], 'type.leading.hero');
    assert.equal(bound.color, 'color.text.primary');
    assert.deepEqual(mapped.diagnostics, []);
  });
});

test('map_reference_to_tokens says which input is missing rather than failing opaquely', async () => {
  await withClient(async (client) => {
    const noSource = await client.callTool({ name: 'map_reference_to_tokens', arguments: { tokens: [] } });
    assert.equal(noSource.isError, true);
    assert.match(noSource.content[0].text, /ref_id or captured/);

    const noVocabulary = await client.callTool({ name: 'map_reference_to_tokens', arguments: { captured: { color: '#fff' } } });
    assert.equal(noVocabulary.isError, true);
    assert.match(noVocabulary.content[0].text, /design_file_path or tokens/);
  });
});

// Sol round 2, round-1 defect #3 re-opened. The previous fix accepted Grab's
// `{declarations:[...]}` VALUE shape but kept the snake_case FIELD name, and the
// tool's own description told the agent to pass the selection's `stateStyles`.
// An MCP schema strips unknown keys before the handler runs, so the documented
// call did not error — it just silently stored a reference with no states at all,
// which is the failure mode you find weeks later in a wrong hover colour.
test('capture_reference accepts stateStyles, the field name get_grabbed_elements returns', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      selector: '.cta',
      owner: 'third-party',
      tags: ['cta'],
      styles: { color: 'rgb(255, 255, 255)' },
      stateStyles: { hover: { declarations: [{ property: 'color', value: 'rgb(0, 0, 0)' }] } }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'rgb(0, 0, 0)' } });
  });
});

test('the snake_case field still wins when both are supplied', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      selector: '.cta',
      owner: 'third-party',
      tags: ['cta'],
      styles: { color: 'rgb(255, 255, 255)' },
      state_styles: { hover: { color: 'red' } },
      stateStyles: { hover: { color: 'blue' } }
    });
    assert.deepEqual(saved.reference.state_styles, { hover: { color: 'red' } });
  });
});
