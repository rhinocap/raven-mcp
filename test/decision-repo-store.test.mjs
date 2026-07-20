// it49 — repo-store slice (i): discovery + shadowing + fail-closed reads.
// Proves a project's checked-in .raven/decisions/ shadows the global ~/.raven store,
// that RAVEN_DECISIONS_HOME still wins, and that a corrupt store fails closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const { discoverRepoStore, decisionsHome } = await import('../dist/decision-graph.js');

function makeRepo(withStore = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'raven-repostore-'));
  const deep = path.join(root, 'packages', 'app', 'src');
  mkdirSync(deep, { recursive: true });
  if (withStore) mkdirSync(path.join(root, '.raven', 'decisions'), { recursive: true });
  return { root, deep };
}

test('discoverRepoStore walks up to the nearest .raven/decisions', () => {
  const { root, deep } = makeRepo();
  assert.equal(discoverRepoStore(deep), path.join(root, '.raven', 'decisions'));
});

test('discoverRepoStore returns the NEAREST store when nested ones exist', () => {
  const { root, deep } = makeRepo();
  const inner = path.join(root, 'packages', 'app');
  mkdirSync(path.join(inner, '.raven', 'decisions'), { recursive: true });
  assert.equal(discoverRepoStore(deep), path.join(inner, '.raven', 'decisions'));
});

test('discoverRepoStore returns null when no store exists in the subtree', () => {
  const { deep } = makeRepo(false);
  // ponytail: tmpdir has no .raven ancestor; walk terminates at fs root → null.
  assert.equal(discoverRepoStore(deep), null);
});

test('decisionsHome: RAVEN_DECISIONS_HOME wins even when a repo store is present', () => {
  const { root, deep } = makeRepo();
  const explicit = mkdtempSync(path.join(tmpdir(), 'raven-explicit-'));
  const savedEnv = process.env.RAVEN_DECISIONS_HOME;
  const savedCwd = process.cwd();
  try {
    process.env.RAVEN_DECISIONS_HOME = explicit;
    process.chdir(deep);
    assert.equal(decisionsHome(), explicit);
  } finally {
    process.chdir(savedCwd);
    if (savedEnv === undefined) delete process.env.RAVEN_DECISIONS_HOME;
    else process.env.RAVEN_DECISIONS_HOME = savedEnv;
    void root;
  }
});

test('decisionsHome: no env → a repo store shadows the global home', () => {
  const { root, deep } = makeRepo();
  const savedEnv = process.env.RAVEN_DECISIONS_HOME;
  const savedCwd = process.cwd();
  try {
    delete process.env.RAVEN_DECISIONS_HOME;
    process.chdir(deep);
    // realpathSync: macOS tmpdir is a /var -> /private/var symlink; cwd resolves it.
    assert.equal(decisionsHome(), path.join(realpathSync(root), '.raven', 'decisions'));
  } finally {
    process.chdir(savedCwd);
    if (savedEnv !== undefined) process.env.RAVEN_DECISIONS_HOME = savedEnv;
  }
});

test('a corrupt repo store fails closed on read — never a silent empty list', async () => {
  const store = mkdtempSync(path.join(tmpdir(), 'raven-corrupt-store-'));
  writeFileSync(path.join(store, 'nodes.json'), '{ this is not valid json', 'utf8');
  const savedEnv = process.env.RAVEN_DECISIONS_HOME;
  process.env.RAVEN_DECISIONS_HOME = store;
  try {
    const { buildServer } = await import('../dist/index.js');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = buildServer();
    const client = new Client({ name: 'repo-store-test', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([server.connect(b), client.connect(a)]);
    let surfaced = '';
    try {
      surfaced = JSON.stringify(await client.callTool({ name: 'decision_list', arguments: {} }));
    } catch (error) {
      surfaced = error instanceof Error ? error.message : String(error);
    }
    assert.match(surfaced, /[Cc]orrupt decision store/, 'corrupt store must surface an error, not empty results');
    await client.close();
  } finally {
    if (savedEnv === undefined) delete process.env.RAVEN_DECISIONS_HOME;
    else process.env.RAVEN_DECISIONS_HOME = savedEnv;
  }
});
