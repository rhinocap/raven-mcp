import test from "node:test";
import assert from "node:assert/strict";

import { checkRateLimit } from "../api/_ratelimit.js";

test("checkRateLimit allows when client is null", async function () {
  assert.deepEqual(await checkRateLimit(null, "user-1"), { allowed: true });
});

test("checkRateLimit fails open when incr throws", async function () {
  const throwingClient = {
    async incr() {
      throw new Error("redis unavailable");
    },
    async expire() {}
  };

  assert.deepEqual(await checkRateLimit(throwingClient, "user-1"), { allowed: true });
});

test("checkRateLimit enforces fixed-window limit with rl-prefixed keys", async function () {
  const previousLimit = process.env.RAVEN_USER_RATE_LIMIT;
  const previousWindow = process.env.RAVEN_USER_RATE_LIMIT_WINDOW_S;
  process.env.RAVEN_USER_RATE_LIMIT = "3";
  delete process.env.RAVEN_USER_RATE_LIMIT_WINDOW_S;

  const fakeClient = {
    counts: new Map(),
    lastKey: null,
    async incr(key) {
      this.lastKey = key;
      const next = (this.counts.get(key) || 0) + 1;
      this.counts.set(key, next);
      return next;
    },
    async expire() {}
  };

  try {
    assert.deepEqual(await checkRateLimit(fakeClient, "user-1"), { allowed: true, count: 1, limit: 3 });
    assert.deepEqual(await checkRateLimit(fakeClient, "user-1"), { allowed: true, count: 2, limit: 3 });
    assert.deepEqual(await checkRateLimit(fakeClient, "user-1"), { allowed: true, count: 3, limit: 3 });

    const exceeded = await checkRateLimit(fakeClient, "user-1");
    assert.equal(exceeded.allowed, false);
    assert.equal(exceeded.limit, 3);
    assert.equal(typeof exceeded.retryAfter, "number");
    assert.ok(exceeded.retryAfter > 0);
    assert.ok(fakeClient.lastKey.startsWith("rl:user-1:"));
  } finally {
    if (previousLimit === undefined) delete process.env.RAVEN_USER_RATE_LIMIT;
    else process.env.RAVEN_USER_RATE_LIMIT = previousLimit;

    if (previousWindow === undefined) delete process.env.RAVEN_USER_RATE_LIMIT_WINDOW_S;
    else process.env.RAVEN_USER_RATE_LIMIT_WINDOW_S = previousWindow;
  }
});
