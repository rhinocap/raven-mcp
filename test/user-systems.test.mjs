// Stored user-generated design systems (src/user-systems.ts) — the save half
// of generate_design_system and the shared lookup rule both its consumers
// (src/index.ts loadSystem, src/designmd.ts storedSystemExists/convert) import
// instead of re-deriving.
//
// The remote test runs in a CHILD process on purpose: setRemoteRuntime() is a
// one-way per-process latch, so latching it here would poison every later test
// in this file. The child seeds a user dir WITH content and asserts remote
// answers "nothing" anyway — an empty dir would pass under a guard that was
// deleted, so the seeded dir is the load-bearing half of that fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
process.env.RAVEN_NO_USAGE_LOG = '1';

const us = await import(path.resolve(repoRoot, 'dist/user-systems.js'));
const designmd = await import(path.resolve(repoRoot, 'dist/designmd.js'));
const indexMod = await import(path.resolve(repoRoot, 'dist/index.js'));

function withSystemsHome(fn) {
  const previous = process.env.RAVEN_SYSTEMS_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-user-systems-'));
  process.env.RAVEN_SYSTEMS_HOME = home;
  return Promise.resolve()
    .then(() => fn(home))
    .finally(() => {
      if (previous === undefined) delete process.env.RAVEN_SYSTEMS_HOME;
      else process.env.RAVEN_SYSTEMS_HOME = previous;
      rmSync(home, { recursive: true, force: true });
    });
}

async function withClient(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ remote: false });
  const client = new Client({ name: 'user-systems-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('save then load round-trips the exact object, and the id lists', async () => {
  await withSystemsHome(async (home) => {
    const system = { $name: 'Round Trip', $description: 'x', color: { primary: { value: '#123456' } } };
    const saved = us.saveUserSystem('round-trip', system);
    assert.equal(saved.id, 'round-trip');
    assert.equal(saved.path, path.join(home, 'round-trip.json'));
    assert.deepEqual(us.loadStoredSystem('round-trip'), system);
    assert.deepEqual(us.listUserSystemIds(), ['round-trip']);
  });
});

test('a user file under a bundled id never wins the lookup', async () => {
  await withSystemsHome(async (home) => {
    // Written with fs directly — saveUserSystem refuses this id, and the
    // refusal is only honest if the lookup would indeed shadow the file.
    writeFileSync(path.join(home, 'stripe.json'), JSON.stringify({ $name: 'DECOY' }), 'utf-8');
    const loaded = us.loadStoredSystem('stripe');
    assert.ok(loaded && loaded.$name !== 'DECOY', 'bundled stripe must win over the user decoy');
    // And the merged id list does not duplicate it.
    const dupes = us.listUserSystemIds().filter((id) => id === 'stripe');
    assert.deepEqual(dupes, ['stripe'], 'the user dir itself still lists the file');
  });
});

test('saving under a bundled id is refused and writes nothing', async () => {
  await withSystemsHome(async (home) => {
    assert.throws(() => us.saveUserSystem('stripe', { $name: 'x' }), /bundled/);
    assert.deepEqual(readdirSync(home), [], 'a refused save must leave no file behind');
  });
});

test('unsafe ids are refused by the predicate, the save, and the path lookup', async () => {
  await withSystemsHome(async () => {
    for (const bad of ['a/b', 'a\\b', 'a..b', '.hidden', '']) {
      assert.equal(us.isSafeSystemId(bad), false, `isSafeSystemId(${JSON.stringify(bad)})`);
      assert.throws(() => us.saveUserSystem(bad, {}), /usable id/, `saveUserSystem(${JSON.stringify(bad)})`);
      assert.equal(us.userSystemPath(bad), null, `userSystemPath(${JSON.stringify(bad)})`);
    }
    assert.equal(us.isSafeSystemId('fine-id-2'), true);
  });
});

test('RAVEN_SYSTEMS_HOME is read at call time, not import time', async () => {
  await withSystemsHome(async () => {
    us.saveUserSystem('call-time', { $name: 'Call Time' });
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'raven-user-systems-b-'));
    const before = process.env.RAVEN_SYSTEMS_HOME;
    try {
      process.env.RAVEN_SYSTEMS_HOME = elsewhere;
      assert.equal(us.loadStoredSystem('call-time'), null, 'a dir cached at import would still find it');
      process.env.RAVEN_SYSTEMS_HOME = before;
      assert.ok(us.loadStoredSystem('call-time'), 'switching back must find it again');
    } finally {
      process.env.RAVEN_SYSTEMS_HOME = before;
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

test('generate_design_system save:true persists, reports, and the id works in get_design_system', async () => {
  await withSystemsHome(async (home) => {
    await withClient(async (client) => {
      const res = await client.callTool({ name: 'generate_design_system', arguments: { name: 'Test Brand', brand_color: '#E8442E', style: 'bold', format: 'dtcg', save: true } });
      assert.equal(res.isError ?? false, false);
      assert.equal(res.content.length, 2, 'saved note travels as its own block ahead of the output');
      assert.match(res.content[0].text, /Saved as 'test-brand'/);
      assert.ok(res.content[0].text.includes(path.join(home, 'test-brand.json')), 'the note names the real path');
      assert.ok(existsSync(path.join(home, 'test-brand.json')));
      const fetched = await client.callTool({ name: 'get_design_system', arguments: { id: 'test-brand' } });
      const tokens = JSON.parse(fetched.content[0].text);
      assert.equal(tokens.$name, 'Test Brand');
      assert.ok(tokens.color, 'the stored set carries the generated palette');
    });
  });
});

test('without save, nothing is written — the default is the old behavior exactly', async () => {
  await withSystemsHome(async (home) => {
    await withClient(async (client) => {
      const res = await client.callTool({ name: 'generate_design_system', arguments: { name: 'No Save Brand', format: 'dtcg' } });
      assert.equal(res.content.length, 1, 'no saved-note block when nothing was saved');
      assert.deepEqual(readdirSync(home), []);
    });
  });
});

test('a colliding save fails the whole call rather than returning output that reads as saved', async () => {
  await withSystemsHome(async (home) => {
    await withClient(async (client) => {
      const res = await client.callTool({ name: 'generate_design_system', arguments: { name: 'Stripe', save: true, format: 'dtcg' } });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /bundled/);
      assert.deepEqual(readdirSync(home), []);
      // $name cannot discriminate — the bundled system is also named 'Stripe'.
      // The generated set stamps its own $description; the bundled one has none
      // of that phrasing.
      const bundled = JSON.parse((await client.callTool({ name: 'get_design_system', arguments: { id: 'stripe' } })).content[0].text);
      assert.ok(!(bundled.$description || '').includes('generated by Raven MCP'), 'the bundled system is untouched');
    });
  });
});

test('init_design_md consumes a saved system in one chain, as a system and not a starter slug', async () => {
  await withSystemsHome(async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'generate_design_system', arguments: { name: 'Genesis Brand', brand_color: '#3366FF', save: true, format: 'dtcg' } });
      const dir = mkdtempSync(path.join(tmpdir(), 'raven-designmd-'));
      try {
        // Before the save, normalizeInitSource reads an unknown string as a
        // STARTER slug and goes to the network — kind 'system' is the whole
        // feature.
        const result = await designmd.initDesignMd(path.join(dir, 'DESIGN.md'), 'genesis-brand');
        assert.equal(result.source.kind, 'system');
        assert.equal(result.source.id, 'genesis-brand');
        assert.ok(Object.keys(result.frontmatter.colors || {}).length > 0, 'the generated palette landed in frontmatter');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

test('list_design_systems lists a saved system as category user and finds it by search', async () => {
  await withSystemsHome(async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'generate_design_system', arguments: { name: 'Listed Brand', save: true, format: 'dtcg' } });
      const all = JSON.parse((await client.callTool({ name: 'list_design_systems', arguments: {} })).content[0].text);
      const mine = all.systems.find((s) => s.id === 'listed-brand');
      assert.ok(mine, 'the saved system appears in the listing');
      assert.equal(mine.category, 'user');
      assert.equal(mine.tokens_available, true);
      const searched = JSON.parse((await client.callTool({ name: 'list_design_systems', arguments: { search: 'listed brand' } })).content[0].text);
      assert.ok(searched.systems.some((s) => s.id === 'listed-brand'), 'search reaches user systems');
      const fintech = JSON.parse((await client.callTool({ name: 'list_design_systems', arguments: { category: 'fintech' } })).content[0].text);
      assert.ok(!fintech.systems.some((s) => s.id === 'listed-brand'), 'a category filter excludes it like any other non-member');
    });
  });
});

test('one malformed user entry cannot kill the listing, and a directory named *.json is not an id', async () => {
  await withSystemsHome(async (home) => {
    us.saveUserSystem('healthy', { $name: 'Healthy', $description: 'fine' });
    // Both fixtures are things a hand-editable dir actually grows: a corrupt
    // JSON file, and a subdirectory whose name happens to end in .json.
    writeFileSync(path.join(home, 'broken.json'), '{broken', 'utf-8');
    mkdirSync(path.join(home, 'dir.json'));

    // The directory is not an id anywhere: not listed, not resolvable.
    assert.deepEqual(us.listUserSystemIds(), ['broken', 'healthy']);
    assert.equal(us.userSystemPath('dir'), null, 'a directory must not resolve as a system path');

    await withClient(async (client) => {
      const res = await client.callTool({ name: 'list_design_systems', arguments: {} });
      assert.equal(res.isError ?? false, false, 'one bad entry must not fail the whole listing');
      const all = JSON.parse(res.content[0].text);
      assert.ok(all.systems.some((s) => s.id === 'healthy' && s.category === 'user'), 'the healthy entry still lists');
      const bad = all.systems.find((s) => s.id === 'broken');
      assert.ok(bad, 'the unreadable entry is LISTED, not silently omitted — hiding it hides the file that needs fixing');
      assert.ok(bad.tags.includes('unreadable'));
      assert.match(bad.description, /could not be read/);
      assert.ok(!all.systems.some((s) => s.id === 'dir'), 'no phantom entry for the directory');

      // Asking for the corrupt id directly errors honestly rather than
      // reading as not-found — the file exists and the caller should know why
      // it will not load.
      const direct = await client.callTool({ name: 'get_design_system', arguments: { id: 'broken' } });
      assert.equal(direct.isError, true);
    });
  });
});

test('base_system consumes a saved system through the same lookup as every other consumer', async () => {
  await withSystemsHome(async () => {
    await withClient(async (client) => {
      const parentRes = await client.callTool({ name: 'generate_design_system', arguments: { name: 'Parent', style: 'bold', format: 'dtcg', save: true } });
      const parent = JSON.parse(parentRes.content[1].text);
      // Child inherits the non-color groups from its base; default style is
      // minimal, so inherited-bold typography is the discriminator.
      const childRes = await client.callTool({ name: 'generate_design_system', arguments: { name: 'Child Brand', base_system: 'parent', format: 'dtcg' } });
      assert.equal(childRes.isError ?? false, false);
      const child = JSON.parse(childRes.content[0].text);
      assert.deepEqual(child.typography, parent.typography, 'the saved parent must be found and inherited');
      // Control: without the base the same call falls back to the minimal
      // preset. If this were equal to bold typography the assertion above
      // would be measuring nothing — the control is what proves it can fail.
      const controlRes = await client.callTool({ name: 'generate_design_system', arguments: { name: 'No Base Control', format: 'dtcg' } });
      const control = JSON.parse(controlRes.content[0].text);
      assert.notDeepEqual(control.typography, parent.typography, 'bold and minimal presets must differ or the test is confounded');
    });
  });
});

test('a user decoy under a bundled id yields ONE listing entry, the curated one', async () => {
  await withSystemsHome(async (home) => {
    writeFileSync(path.join(home, 'stripe.json'), JSON.stringify({ $name: 'DECOY' }), 'utf-8');
    await withClient(async (client) => {
      const all = JSON.parse((await client.callTool({ name: 'list_design_systems', arguments: {} })).content[0].text);
      const stripes = all.systems.filter((s) => s.id === 'stripe');
      assert.equal(stripes.length, 1, 'bundled wins on load, so a second "user" stripe entry could never load as itself');
      assert.notEqual(stripes[0].category, 'user');
    });
  });
});

test('local schema carries save; remote omits it, hides the user dir, and refuses the write', async () => {
  // Local half in-process: the param must exist here or the feature is dead.
  await withClient(async (client) => {
    const tools = await client.listTools();
    const gen = tools.tools.find((t) => t.name === 'generate_design_system');
    assert.ok(gen.inputSchema.properties.save, 'stdio schema must offer save');
  });

  // Remote half in a child process (setRemoteRuntime is a one-way latch).
  const seeded = mkdtempSync(path.join(tmpdir(), 'raven-user-systems-remote-'));
  writeFileSync(path.join(seeded, 'seeded.json'), JSON.stringify({ $name: 'Seeded' }), 'utf-8');
  try {
    const script = `
      import assert from 'node:assert/strict';
      const us = await import('./dist/user-systems.js');
      const { buildServer } = await import('./dist/index.js');
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
      async function schemaSave(opts) {
        const [ct2, st2] = InMemoryTransport.createLinkedPair();
        const s = buildServer(opts);
        const c = new Client({ name: 'schema-probe', version: '1.0.0' }, { capabilities: {} });
        await s.connect(st2); await c.connect(ct2);
        const t = (await c.listTools()).tools.find((x) => x.name === 'generate_design_system');
        await c.close(); await s.close();
        return t.inputSchema.properties.save;
      }
      // Local FIRST, in the same process the remote build runs in: the schema
      // literal must be created per buildServer call. Hoist it to module scope
      // and this local build ADDS the save key that the remote build below can
      // never remove — the remote assertion is what goes red.
      assert.ok(await schemaSave({ remote: false }) !== undefined, 'pristine local schema offers save');
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const server = buildServer({ remote: true }); // latches isRemoteRuntime
      const client = new Client({ name: 'remote-child', version: '1.0.0' }, { capabilities: {} });
      await server.connect(st);
      await client.connect(ct);
      // The seeded dir has a system in it; remote must answer "nothing" anyway.
      assert.deepEqual(us.listUserSystemIds(), []);
      assert.equal(us.userSystemPath('seeded'), null);
      assert.equal(us.loadStoredSystem('seeded'), null);
      assert.throws(() => us.saveUserSystem('anything', {}), /hosted endpoint/);
      assert.ok(us.loadStoredSystem('stripe'), 'bundled systems stay readable');
      const tools = await client.listTools();
      const gen = tools.tools.find((t) => t.name === 'generate_design_system');
      assert.ok(gen, 'generate_design_system is anon-served');
      assert.equal(gen.inputSchema.properties.save, undefined, 'remote schema must not advertise save');
      assert.ok(!gen.description.includes('save:true'), 'remote description unchanged');
      await client.close(); await server.close();
      // Local AFTER remote: the latch is one-way, so this process's stores now
      // throw — a schema still advertising save here would be a dead param.
      // This is the only assertion that separates the gate's !isRemoteRuntime()
      // clause from plain !remote.
      assert.equal(await schemaSave({ remote: false }), undefined, 'post-latch local schema must not advertise a save that throws');
      console.log('REMOTE_CHILD_OK');
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repoRoot,
      env: { ...process.env, RAVEN_SYSTEMS_HOME: seeded, RAVEN_NO_USAGE_LOG: '1' },
      encoding: 'utf-8',
      timeout: 60000
    });
    assert.equal(run.status, 0, `child failed:\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /REMOTE_CHILD_OK/);
  } finally {
    rmSync(seeded, { recursive: true, force: true });
  }
});
