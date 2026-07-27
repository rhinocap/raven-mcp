// Per-user fixed-window rate limiter for the AUTHENTICATED remote endpoint.
// Imported ONLY by api/mcp-user.js; anonymous api/mcp.js is untouched.
// Keys use the rl:{sub}:{window} prefix — a SEPARATE namespace from taste:{sub}:*,
// so delete_taste_data's taste-sweep never touches these counters.
// FAIL-OPEN: missing client or any Redis error => { allowed: true }.
const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_S = 60;
export async function checkRateLimit(client, sub) {
  if (!client || typeof sub !== "string" || sub.length === 0) return { allowed: true };
  const limit = Number(process.env.RAVEN_USER_RATE_LIMIT) > 0 ? Number(process.env.RAVEN_USER_RATE_LIMIT) : DEFAULT_LIMIT;
  const windowS = Number(process.env.RAVEN_USER_RATE_LIMIT_WINDOW_S) > 0 ? Number(process.env.RAVEN_USER_RATE_LIMIT_WINDOW_S) : DEFAULT_WINDOW_S;
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowS);
  const key = "rl:" + sub + ":" + bucket;
  try {
    const count = await client.incr(key);
    // Re-arm the TTL on every hit (EXPIRE is idempotent) rather than only on the
    // first: if EXPIRE ever fails right after INCR created the key, the next
    // request self-heals it instead of leaking a no-TTL rl: key forever.
    await client.expire(key, windowS * 2);
    if (count > limit) {
      const retryAfter = (bucket + 1) * windowS - now;
      return { allowed: false, retryAfter: retryAfter > 0 ? retryAfter : windowS, limit };
    }
    return { allowed: true, count, limit };
  } catch {
    return { allowed: true };
  }
}
