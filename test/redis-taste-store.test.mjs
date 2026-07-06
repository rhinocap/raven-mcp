/**
 * redis-taste-store.test.mjs — P4.2
 *
 * RedisTasteStore semantics against a faithful in-memory fake of the
 * @upstash/redis client (auto-JSON semantics, LIST/SET commands):
 *   - profile round-trip + index; taste.js high-level functions work on it
 *   - cross-user isolation: same client, two subs, zero bleed
 *   - decisions: atomic appendDecision path + list read-back; unique ids
 *   - buildServer gating: remote+store → 45 + exactly the profile trio;
 *     remote without store → the golden 45 (hash-asserted)
 *
 * Runs after `npm run build` (imports dist).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { RedisTasteStore } from '../dist/taste-store-redis.js';
import { createTasteProfile, getTasteProfile, listTasteProfiles, recordTasteDecision, listTasteDecisions } from '../dist/taste.js';
import { buildServer } from '../dist/index.js';

const GOLDEN_45_HASH = 'f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6';
const TRIO = ['create_taste_profile', 'get_taste_profile', 'list_taste_profiles'];

// In-memory fake mirroring @upstash/redis behavior used by the store:
// values are structured-cloned (JSON semantics), lists ordered, sets unique.
function fakeRedis() {
  const kv = new Map(); // key -> value | array (list) | Set
  const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  return {
    kv,
    async get(key) { return kv.has(key) && !(kv.get(key) instanceof Set) && !Array.isArray(kv.get(key)) ? clone(kv.get(key)) : (kv.has(key) ? clone(kv.get(key)) : null); },
    async set(key, value) { kv.set(key, clone(value)); return 'OK'; },
    async del(...keys) { let n = 0; for (const k of keys) n += kv.delete(k) ? 1 : 0; return n; },
    async sadd(key, ...members) { if (!(kv.get(key) instanceof Set)) kv.set(key, new Set()); const s = kv.get(key); let n = 0; for (const m of members) { if (!s.has(m)) { s.add(m); n++; } } return n; },
    async srem(key, ...members) { const s = kv.get(key); if (!(s instanceof Set)) return 0; let n = 0; for (const m of members) n += s.delete(m) ? 1 : 0; return n; },
    async smembers(key) { const s = kv.get(key); return s instanceof Set ? [...s] : []; },
    async rpush(key, ...values) { if (!Array.isArray(kv.get(key))) kv.set(key, []); const l = kv.get(key); for (const v of values) l.push(clone(v)); return l.length; },
    async lrange(key, start, stop) { const l = kv.get(key); if (!Array.isArray(l)) return []; const end = stop === -1 ? l.length : stop + 1; return clone(l.slice(start, end)); },
  };
}

test('profile round-trip, index, and taste.js functions over RedisTasteStore', async () => {
  const redis = fakeRedis();
  const store = new RedisTasteStore('user_A', redis);

  await createTasteProfile(store, { name: 'mytaste' });
  const profile = await getTasteProfile(store, 'mytaste');
  assert.equal(profile.name, 'mytaste');

  const listed = await listTasteProfiles(store);
  assert.deepEqual(listed.map((p) => p.name), ['mytaste']);

  // Keys are namespaced under the sub.
  assert.ok(redis.kv.has('taste:user_A:profile:mytaste'));
  assert.ok([...redis.kv.get('taste:user_A:profiles')].includes('mytaste'));
});

test('cross-user isolation on a shared client', async () => {
  const redis = fakeRedis();
  const a = new RedisTasteStore('user_A', redis);
  const b = new RedisTasteStore('user_B', redis);

  await createTasteProfile(a, { name: 'aprofile' });

  assert.deepEqual(await listTasteProfiles(b), [], 'B must not see A profiles');
  await assert.rejects(() => getTasteProfile(b, 'aprofile'), /Taste profile not found/, 'B cannot read A profile by name');

  await createTasteProfile(b, { name: 'bprofile' });
  assert.deepEqual((await listTasteProfiles(a)).map((p) => p.name), ['aprofile']);
  assert.deepEqual((await listTasteProfiles(b)).map((p) => p.name), ['bprofile']);
});

test('decisions use the atomic append path with collision-free ids', async () => {
  const redis = fakeRedis();
  const store = new RedisTasteStore('user_A', redis);
  await createTasteProfile(store, { name: 'mytaste' });

  // Concurrent appends: both must land (no lost update), ids unique.
  await Promise.all([
    recordTasteDecision(store, 'mytaste', { project: 'proj1', dimension: 'color', decision: 'monochrome' }),
    recordTasteDecision(store, 'mytaste', { project: 'proj1', dimension: 'type', decision: 'grotesk' }),
  ]);
  const decisions = await listTasteDecisions(store, 'mytaste');
  assert.equal(decisions.length, 2, 'both concurrent decisions must persist');
  assert.notEqual(decisions[0].id, decisions[1].id, 'ids must not collide');
  assert.equal(redis.kv.get('taste:user_A:decisions:mytaste').length, 2, 'stored as a Redis list');
});

test('buildServer gating: store injection un-gates exactly the profile trio', async () => {
  const hash = (names) => createHash('sha256').update(names.join('\n')).digest('hex');

  const bare = buildServer({ remote: true });
  const bareNames = Object.keys(bare._registeredTools).sort();
  assert.equal(bareNames.length, 45);
  assert.equal(hash(bareNames), GOLDEN_45_HASH, 'anonymous surface must stay golden');

  const store = new RedisTasteStore('user_A', fakeRedis());
  const authed = buildServer({ remote: true, tasteStore: store });
  const authedNames = Object.keys(authed._registeredTools).sort();
  assert.equal(authedNames.length, 48, '45 + the profile trio');
  for (const t of TRIO) assert.ok(authedNames.includes(t), 'missing ' + t);
  const extras = authedNames.filter((n) => !bareNames.includes(n)).sort();
  assert.deepEqual(extras, TRIO.slice().sort(), 'ONLY the trio may be added in P4.2');
});

test('stdio (non-remote) surface is unaffected by the P4.2 change', async () => {
  const local = buildServer({});
  const names = Object.keys(local._registeredTools);
  assert.equal(names.length, 70, 'stdio keeps all 70 tools');
});
