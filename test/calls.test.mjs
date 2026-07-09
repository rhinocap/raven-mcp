import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same RAVEN_NO_USAGE_LOG-before-import guard as test/taste.test.mjs — index.js
// reads it into a module-level const exactly once at import time.
const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
process.env.RAVEN_NO_USAGE_LOG = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distTasteStore = path.resolve(__dirname, '../dist/taste-store.js');
const distIndex = path.resolve(__dirname, '../dist/index.js');

let tasteStoreMod;
let indexMod;
try {
  tasteStoreMod = await import(distTasteStore);
  indexMod = await import(distIndex);
} catch (err) {
  const msg = `dist not found - run \`npm run build\` first. (${err.message})`;
  test('calls module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

const CALL_NAMES = ['preen', 'appraise', 'cadence', 'plumage', 'truesight'];

async function withClient(store, fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ tasteStore: store });
  const client = new Client({ name: 'calls-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

async function withTasteHome(fn) {
  const previous = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-calls-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    const store = new tasteStoreMod.FsTasteStore();
    await fn(store);
  } finally {
    if (previous === undefined) {
      delete process.env.RAVEN_TASTE_HOME;
    } else {
      process.env.RAVEN_TASTE_HOME = previous;
    }
  }
}

test('all 5 P1 Calls are registered and discoverable via prompts/list', async () => {
  await withTasteHome(async (store) => {
    await withClient(store, async (client) => {
      const listed = await client.listPrompts();
      const names = listed.prompts.map((p) => p.name);
      for (const name of CALL_NAMES) {
        assert.equal(names.includes(name), true, `${name} should be registered as an MCP prompt`);
      }
    });
  });
});

test('each Call returns non-empty, well-formed prompt content when uncalibrated', async () => {
  await withTasteHome(async (store) => {
    await withClient(store, async (client) => {
      for (const name of CALL_NAMES) {
        const result = await client.getPrompt({ name, arguments: {} });
        assert.ok(Array.isArray(result.messages) && result.messages.length > 0, `${name} should return at least one message`);
        const msg = result.messages[0];
        assert.equal(msg.role, 'user');
        assert.equal(msg.content.type, 'text');
        assert.ok(typeof msg.content.text === 'string' && msg.content.text.trim().length > 0, `${name} text should be non-empty`);
        // No shipped copy anywhere in a Call's text may use the banned word.
        assert.doesNotMatch(msg.content.text.toLowerCase(), /\bslop\b/, `${name} must never use the word "slop"`);
      }
    });
  });
});

test('plumage cites a color-systems.json principle by id', async () => {
  await withTasteHome(async (store) => {
    await withClient(store, async (client) => {
      const result = await client.getPrompt({ name: 'plumage', arguments: {} });
      const text = result.messages[0].content.text;
      assert.match(text, /\[color-palette-discipline\]/, 'plumage should cite the color-palette-discipline principle id');
    });
  });
});

test('cadence cites typography.json principles by id', async () => {
  await withTasteHome(async (store) => {
    await withClient(store, async (client) => {
      const result = await client.getPrompt({ name: 'cadence', arguments: {} });
      const text = result.messages[0].content.text;
      assert.match(text, /\[type-scale\]/, 'cadence should cite the type-scale principle id');
      assert.match(text, /\[line-height-spacing\]/, 'cadence should cite the line-height-spacing principle id');
    });
  });
});

test('truesight names the mechanical scan tool and explicitly disclaims taste/LLM judgment', async () => {
  await withTasteHome(async (store) => {
    await withClient(store, async (client) => {
      const result = await client.getPrompt({ name: 'truesight', arguments: {} });
      const text = result.messages[0].content.text;
      assert.match(text, /talon_scan/, 'truesight should name talon_scan now that it is registered');
      assert.match(text, /no taste rules, no subjective judgment/i);
    });
  });
});

test('a Call degrades gracefully (no throw) when given a profile that does not exist', async () => {
  await withTasteHome(async (store) => {
    await withClient(store, async (client) => {
      const result = await client.getPrompt({ name: 'appraise', arguments: { profile: 'does-not-exist', project: 'foo' } });
      const text = result.messages[0].content.text;
      assert.match(text, /uncalibrated/i);
    });
  });
});

test('appraise reflects a bound taste surface and its recorded decisions when present', async () => {
  await withTasteHome(async (store) => {
    const taste = await import(path.resolve(__dirname, '../dist/taste.js'));
    await taste.createTasteProfile(store, { name: 'tester', rules: [] });
    await taste.bindTasteSurface(store, 'tester', {
      project: 'my-portfolio',
      surface: 'portfolio-monochrome',
      overrides: [],
      voice_note: 'restrained, editorial',
      design_notes: {}
    });
    await taste.recordTasteDecision(store, 'tester', {
      project: 'my-portfolio',
      dimension: 'accent-color',
      decision: 'single muted accent only',
      rejected: ['saturated blue'],
      why: 'reads as editorial, not marketing',
      source: 'user-directed'
    });

    await withClient(store, async (client) => {
      const result = await client.getPrompt({ name: 'appraise', arguments: { profile: 'tester', project: 'my-portfolio' } });
      const text = result.messages[0].content.text;
      assert.match(text, /my-portfolio/);
      assert.match(text, /portfolio-monochrome/);
      assert.match(text, /restrained, editorial/);
      assert.match(text, /accent-color: single muted accent only/);
    });
  });
});
