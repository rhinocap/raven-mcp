/**
 * taste-remote-full.test.mjs — P4.3
 *
 * The FULL authed taste subset over a per-user Redis store (fake client):
 *   - gating: remote+store = 56 tools (45 + all 10 + delete); remote bare = golden 45;
 *     stdio = 105
 *   - the whole loop via the registered tool handlers on a remote+store
 *     server: create → interview → bind → record_decision → list_decisions →
 *     audit_taste (binding echoed in design_notes) → label_finding →
 *     generate_taste_portrait INLINE (no fs writes)
 *   - remote bind_taste_surface refuses .png (local-path) references
 *   - cross-user isolation re-run over the full subset
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { RedisTasteStore } from '../dist/taste-store-redis.js';
import { buildServer } from '../dist/index.js';

const GOLDEN_45_HASH = 'f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6';
// Rebaselined 2026-07-26 when main merged into this branch: the anonymous
// instructions/description TEXT evolved across 364 main commits. These two pins
// guard against authed tuning leaking into an anon build, not against the text
// changing. Re-verified at the merge: anon never contains the authed block, and
// an anon build made AFTER an authed one is byte-identical to an anon-first
// build. GOLDEN_45_HASH — the frozen wire contract — is unchanged.
const ANONYMOUS_INSTRUCTIONS_HASH = '215a17260e7855eac34cffc68a195cc4537309114fbda9ee51f604bc9a0bc903';
const ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH = 'ebceedcfffb7eed83e94a699e8a009723a732e8e364e0352e41e6d1c0822effd';
const AUTHED_STARTUP_INSTRUCTIONS = "AUTHENTICATED STARTUP: this remote endpoint is connected to a per-user taste store. At project kickoff or the first real design/copy/UI work for a project, call get_taste_interview for the connected user's taste profile and project name before choosing direction. Ask the returned questions, then persist the user's answers with bind_taste_surface before generating design work. If the profile name is not known yet, call list_taste_profiles first.";
const AUTHED_INTERVIEW_DESCRIPTION = "AUTHENTICATED STARTUP: on the remote authed endpoint, use this as the first taste step for the connected user's per-user store at project kickoff; if you do not know the profile name, call list_taste_profiles first, then call get_taste_interview with that profile and project name before design/copy/UI decisions.";
const ALL_TASTE = [
  'create_taste_profile', 'get_taste_profile', 'list_taste_profiles',
  'get_taste_interview', 'bind_taste_surface', 'record_taste_decision',
  'list_taste_decisions', 'generate_taste_portrait', 'label_finding', 'audit_taste'
];

function fakeRedis() {
  const kv = new Map();
  const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  return {
    kv,
    async get(key) { return kv.has(key) ? clone(kv.get(key)) : null; },
    async set(key, value) { kv.set(key, clone(value)); return 'OK'; },
    async del(...keys) { let n = 0; for (const k of keys) n += kv.delete(k) ? 1 : 0; return n; },
    async sadd(key, ...members) { if (!(kv.get(key) instanceof Set)) kv.set(key, new Set()); const s = kv.get(key); let n = 0; for (const m of members) { if (!s.has(m)) { s.add(m); n++; } } return n; },
    async srem(key, ...members) { const s = kv.get(key); if (!(s instanceof Set)) return 0; let n = 0; for (const m of members) n += s.delete(m) ? 1 : 0; return n; },
    async smembers(key) { const s = kv.get(key); return s instanceof Set ? [...s] : []; },
    async rpush(key, ...values) { if (!Array.isArray(kv.get(key))) kv.set(key, []); const l = kv.get(key); for (const v of values) l.push(clone(v)); return l.length; },
    async lrange(key, start, stop) { const l = kv.get(key); if (!Array.isArray(l)) return []; const end = stop === -1 ? l.length : stop + 1; return clone(l.slice(start, end)); },
    async scan(cursor, opts) {
      const match = opts && opts.match;
      const re = match ? new RegExp('^' + match.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : null;
      const all = [...kv.keys()].filter((k) => !re || re.test(k));
      const start = Number(cursor) || 0;
      const page = all.slice(start, start + 2);
      const next = start + 2 >= all.length ? '0' : String(start + 2);
      return [next, page];
    },
  };
}

// Invoke a registered tool handler directly (the MCP transport layer is
// exercised by the deployed-preview verification; this tests handler logic).
async function call(server, name, args) {
  const tool = server._registeredTools[name];
  assert.ok(tool, 'tool not registered: ' + name);
  const result = await tool.handler(args, {});
  const text = result.content && result.content[0] && result.content[0].text;
  return { isError: !!result.isError, text, json: safeParse(text) };
}
function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }
function anonymousMetadataPayload(server, names) {
  return JSON.stringify({
    instructions: server.server._options.instructions,
    tools: names.map((name) => ({ name, description: server._registeredTools[name].description || '' }))
  });
}

test('gating: remote+store = 56 (45 + all 10 taste + delete_taste_data); bare remote = golden 45; stdio = 105', () => {
  const bare = buildServer({ remote: true });
  const bareNames = Object.keys(bare._registeredTools).sort();
  assert.equal(bareNames.length, 45);
  assert.equal(createHash('sha256').update(bareNames.join('\n')).digest('hex'), GOLDEN_45_HASH);

  const authed = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', fakeRedis()) });
  const authedNames = Object.keys(authed._registeredTools).sort();
  assert.equal(authedNames.length, 56, '45 + all 10 taste tools + delete_taste_data');
  const extras = authedNames.filter((n) => !bareNames.includes(n)).sort();
  assert.deepEqual(extras, ALL_TASTE.concat('delete_taste_data').sort());

  assert.equal(Object.keys(buildServer({})._registeredTools).length, 105, 'stdio includes audit, template/layer, review/polish, and 14 local Decision Graph tools');
});

test('authed startup tuning appears only on store-backed remote metadata', () => {
  const bare = buildServer({ remote: true });
  const bareNames = Object.keys(bare._registeredTools).sort();
  assert.equal(createHash('sha256').update(bare.server._options.instructions).digest('hex'), ANONYMOUS_INSTRUCTIONS_HASH);
  assert.equal(createHash('sha256').update(bareNames.join('\n')).digest('hex'), GOLDEN_45_HASH);
  assert.equal(createHash('sha256').update(anonymousMetadataPayload(bare, bareNames)).digest('hex'), ANONYMOUS_INSTRUCTIONS_AND_TOOL_DESCRIPTIONS_HASH);
  assert.ok(!bare.server._options.instructions.includes(AUTHED_STARTUP_INSTRUCTIONS));
  assert.equal(bare._registeredTools.get_taste_interview, undefined, 'anonymous remote must not register get_taste_interview');

  const local = buildServer({});
  assert.ok(!local.server._options.instructions.includes(AUTHED_STARTUP_INSTRUCTIONS));
  assert.ok(!local._registeredTools.get_taste_interview.description.includes(AUTHED_INTERVIEW_DESCRIPTION));

  const authed = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', fakeRedis()) });
  assert.ok(authed.server._options.instructions.includes(AUTHED_STARTUP_INSTRUCTIONS));
  assert.ok(authed._registeredTools.get_taste_interview.description.includes(AUTHED_INTERVIEW_DESCRIPTION));
});

// Leak-guard: build an AUTHED server FIRST (which mutates its own instructions),
// then a fresh anon build must still be byte-golden — proves the instructions
// string is per-instance, not a shared reference the authed build pollutes.
test('authed-first build does not leak startup tuning into a later anon build', () => {
  const authedFirst = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', fakeRedis()) });
  assert.ok(authedFirst.server._options.instructions.includes(AUTHED_STARTUP_INSTRUCTIONS), 'authed build carries the tuning');

  const anonAfter = buildServer({ remote: true });
  const anonNames = Object.keys(anonAfter._registeredTools).sort();
  assert.equal(createHash('sha256').update(anonNames.join('\n')).digest('hex'), GOLDEN_45_HASH, 'anon after authed still golden-45');
  assert.equal(createHash('sha256').update(anonAfter.server._options.instructions).digest('hex'), ANONYMOUS_INSTRUCTIONS_HASH, 'anon instructions unchanged after an authed build');
  assert.ok(!anonAfter.server._options.instructions.includes(AUTHED_STARTUP_INSTRUCTIONS), 'no startup tuning leaked into anon');
  assert.notEqual(authedFirst.server._options, anonAfter.server._options, 'each build has its own _options');

  // A second authed build must carry exactly ONE copy of the tuning (no cumulative append).
  const authedSecond = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_B', fakeRedis()) });
  assert.equal((authedSecond.server._options.instructions.match(/AUTHENTICATED STARTUP:/g) || []).length, 1, 'startup tuning not double-appended');
  assert.equal((authedSecond._registeredTools.get_taste_interview.description.match(/AUTHENTICATED STARTUP:/g) || []).length, 1, 'interview suffix not double-appended');
});

test('full loop over the remote+store server handlers', async () => {
  const redis = fakeRedis();
  const server = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', redis) });

  const created = await call(server, 'create_taste_profile', {
    name: 'looptaste',
    rules: [{ rule_id: 'COLOR-mono', clause_text: 'Monochrome with one accent only', category: 'color', severity_default: 'block', negative_prompt: 'Do NOT add a second accent hue' }]
  });
  assert.ok(!created.isError);
  assert.equal(created.json.home, 'cloud:per-user', 'authed path must not claim ~/.raven/taste');

  const interview = await call(server, 'get_taste_interview', { profile: 'looptaste', project: 'siteproj' });
  assert.ok(!interview.isError);
  assert.equal(interview.json.existing_binding, null, 'fresh project has no binding');
  assert.ok(Array.isArray(interview.json.questions) && interview.json.questions.length > 0);

  const bound = await call(server, 'bind_taste_surface', {
    profile: 'looptaste', project: 'siteproj', surface: 'product-site',
    design_notes: { color: 'monochrome, single amber accent', typography: 'grotesk display over humanist text' }
  });
  assert.ok(!bound.isError, bound.text);
  assert.equal(bound.json.binding.project, 'siteproj');

  const rec = await call(server, 'record_taste_decision', {
    profile: 'looptaste', project: 'siteproj', dimension: 'color', decision: 'amber accent', rejected: ['blue'], source: 'user-corrected'
  });
  assert.ok(!rec.isError);

  const decisions = await call(server, 'list_taste_decisions', { profile: 'looptaste', project: 'siteproj' });
  assert.equal(decisions.json.count, 1);

  const audit = await call(server, 'audit_taste', {
    profile: 'looptaste', project: 'siteproj',
    html: '<html><head><style>body{background:#111;color:#eee}</style></head><body><h1>Hello</h1><p>Amber accent everywhere.</p></body></html>'
  });
  assert.ok(!audit.isError, audit.text);
  assert.ok(audit.json.design_notes && audit.json.design_notes.color, 'binding design_notes must be echoed');

  const labeled = await call(server, 'label_finding', {
    profile: 'looptaste', artifact: 'homepage hero', verdict: 'accept', violated_rule: 'COLOR-mono',
    wrong: 'flagged amber accent', right: 'amber accent is the chosen single accent'
  });
  assert.ok(!labeled.isError, labeled.text);

  const portrait = await call(server, 'generate_taste_portrait', { profile: 'looptaste', project: 'siteproj', output_dir: '/tmp/ignored' });
  assert.ok(!portrait.isError, portrait.text);
  assert.equal(portrait.json.inline, true, 'remote portrait must be inline');
  assert.ok(portrait.json.files[0].html.includes('<html') || portrait.json.files[0].html.includes('<!doctype'), 'html returned inline');

  // Nothing may have been written to /tmp/ignored.
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync('/tmp/ignored'), false, 'remote portrait must not touch the filesystem');
});

test('delete_taste_data erases only the connected user taste keyspace', async () => {
  const redis = fakeRedis();
  const server = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', redis) });

  await call(server, 'create_taste_profile', { name: 'deletaste' });
  await call(server, 'bind_taste_surface', {
    profile: 'deletaste', project: 'deleteproj', surface: 'site',
    design_notes: { color: 'dark' }
  });
  await call(server, 'record_taste_decision', {
    profile: 'deletaste', project: 'deleteproj', dimension: 'color', decision: 'dark'
  });
  redis.kv.set('rl:user_A:w', 1);

  const deleted = await call(server, 'delete_taste_data', { confirm: 'DELETE' });
  assert.ok(!deleted.isError, deleted.text);
  assert.equal(deleted.json.remaining, 0);
  assert.equal(deleted.json.ok, true);
  assert.deepEqual([...redis.kv.keys()].filter((k) => k.startsWith('taste:user_A:')), [], 'all user taste keys are gone');
  assert.equal(redis.kv.get('rl:user_A:w'), 1, 'rate-limit key survives');

  const again = await call(server, 'delete_taste_data', { confirm: 'DELETE' });
  assert.ok(!again.isError, again.text);
  assert.equal(again.json.remaining, 0, 'second delete is idempotent');
});

test('remote bind_taste_surface refuses local .png reference paths', async () => {
  const server = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', fakeRedis()) });
  await call(server, 'create_taste_profile', { name: 'reftaste' });
  const bound = await call(server, 'bind_taste_surface', {
    profile: 'reftaste', project: 'refproj', surface: 'portfolio',
    design_notes: { color: 'dark' },
    references: [{ url: '/Users/someone/Desktop/screen.png', liked: 'the grain' }]
  });
  assert.ok(!bound.isError, bound.text);
  assert.ok((bound.json.warnings || []).some((w) => w.includes('rejected: local screenshot paths')), 'png path must be rejected with a warning');
  const ref = bound.json.binding.references[0];
  assert.equal(ref.traits, undefined, 'no traits may be captured from a local path remotely');
});

test('cross-user isolation across the full subset', async () => {
  const redis = fakeRedis();
  const a = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_A', redis) });
  const b = buildServer({ remote: true, tasteStore: new RedisTasteStore('user_B', redis) });

  await call(a, 'create_taste_profile', { name: 'isotaste' });
  await call(a, 'bind_taste_surface', { profile: 'isotaste', project: 'isoproj', surface: 'site', design_notes: { color: 'dark' } });
  await call(a, 'record_taste_decision', { profile: 'isotaste', project: 'isoproj', dimension: 'color', decision: 'dark' });

  const bList = await call(b, 'list_taste_profiles', {});
  assert.deepEqual(bList.json.profiles, [], 'B sees no profiles');
  // Direct handler invocation propagates the throw (the MCP layer would wrap
  // it as isError) — either way, B must not be able to read A's profile.
  await assert.rejects(
    () => call(b, 'get_taste_profile', { name: 'isotaste' }),
    /Taste profile not found: isotaste. Available profiles: \(none\)/,
    'B cannot read A profile and must not see A profile names in the error'
  );
});
