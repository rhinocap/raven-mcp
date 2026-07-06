// RedisTasteStore — per-user cloud persistence for the AUTHENTICATED remote
// endpoint (P4.2). One instance is constructed PER REQUEST with the verified
// JWT `sub` and injected into buildServer as an explicit parameter — never
// module-level state (Fluid Compute runs concurrent requests in one process;
// cross-user isolation is structural, not conventional).
//
// The client is injected (an @upstash/redis instance in production, a fake in
// tests) so this module has no dependency on the SDK and no ambient config.
// The client auto-(de)serializes JSON values; decisions live in a Redis LIST
// so appends are atomic (RPUSH) — the lost-update race between two concurrent
// sessions recording decisions cannot occur on the append path.
//
// Key layout (all namespaced by the AuthKit user id):
//   taste:{sub}:profile:{name}    profile JSON
//   taste:{sub}:surfaces:{name}   { version: 1, bindings: [...] }
//   taste:{sub}:decisions:{name}  LIST of decision entries
//   taste:{sub}:profiles          SET index of profile names
// P4.5's delete_taste_data removes `taste:{sub}:*`.

import type { SurfaceBinding, TasteDecision, TasteProfile } from "./taste.js";
import type { TasteStore } from "./taste-store.js";

// The subset of the @upstash/redis surface this store uses. Values are
// serialized/deserialized by the client (objects in, objects out).
export interface MinimalRedisClient {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  rpush(key: string, ...values: unknown[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<unknown[]>;
}

export class RedisTasteStore implements TasteStore {
  private readonly sub: string;
  private readonly redis: MinimalRedisClient;

  constructor(sub: string, redis: MinimalRedisClient) {
    if (typeof sub !== "string" || sub.length === 0) {
      throw new Error("RedisTasteStore requires a non-empty user id (JWT sub)");
    }
    this.sub = sub;
    this.redis = redis;
  }

  private key(kind: "profile" | "surfaces" | "decisions", name: string): string {
    return "taste:" + this.sub + ":" + kind + ":" + name;
  }

  private indexKey(): string {
    return "taste:" + this.sub + ":profiles";
  }

  async getProfile(name: string): Promise<unknown | null> {
    const raw = await this.redis.get(this.key("profile", name));
    return raw === undefined ? null : raw;
  }

  async putProfile(profile: TasteProfile): Promise<void> {
    await this.redis.set(this.key("profile", profile.name), profile);
    await this.redis.sadd(this.indexKey(), profile.name);
  }

  async listProfiles(): Promise<Array<{ name: string; raw: unknown }>> {
    const names = await this.redis.smembers(this.indexKey());
    const out: Array<{ name: string; raw: unknown }> = [];
    for (const name of names.slice().sort()) {
      const raw = await this.redis.get(this.key("profile", name));
      // Tolerate a dangling index entry (profile deleted out-of-band).
      if (raw !== null && raw !== undefined) out.push({ name, raw });
    }
    return out;
  }

  async getSurfaces(name: string): Promise<unknown | null> {
    const raw = await this.redis.get(this.key("surfaces", name));
    return raw === undefined ? null : raw;
  }

  async putSurfaces(name: string, bindings: SurfaceBinding[]): Promise<void> {
    await this.redis.set(this.key("surfaces", name), { version: 1, bindings });
  }

  async getDecisions(name: string): Promise<unknown | null> {
    const entries = await this.redis.lrange(this.key("decisions", name), 0, -1);
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return { version: 1, decisions: entries };
  }

  // Full-array rewrite (delete + repush). Kept for interface parity; the
  // append path below is what record_taste_decision uses on this store.
  async putDecisions(name: string, decisions: TasteDecision[]): Promise<void> {
    const key = this.key("decisions", name);
    await this.redis.del(key);
    if (decisions.length > 0) {
      await this.redis.rpush(key, ...decisions);
    }
  }

  // Atomic single-decision append — RPUSH is atomic in Redis, so two
  // concurrent sessions can both record without a lost update.
  async appendDecision(name: string, decision: TasteDecision): Promise<void> {
    await this.redis.rpush(this.key("decisions", name), decision);
  }

  // Logical name only — an absolute path would be a lie for a Redis store.
  describe(name: string, kind: "profile" | "surfaces" | "decisions"): string {
    if (kind === "surfaces") return name + ".surfaces.json";
    if (kind === "decisions") return name + ".decisions.json";
    return name + ".json";
  }
}
