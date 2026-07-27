# Raven MCP — Remote Server: Privacy & Data Retention

This note describes exactly what the hosted remote server stores, where it stores it, and how to remove it. It covers the two remote endpoints only (`/api/mcp` and `/api/mcp-user`) — the local `npx raven-mcp` server described elsewhere in this repo keeps everything on your own machine and is out of scope here.

## Two endpoints, two data postures

| | `/api/mcp` (anonymous) | `/api/mcp-user` (authenticated) |
|---|---|---|
| Auth | None | Bearer token (AuthKit access JWT) |
| Store injected | None | Per-request `RedisTasteStore(sub)` |
| Taste tools registered | No (45 tools) | Yes (56 tools) |
| Data written to Redis | Never | Yes, namespaced to the caller |

**Anonymous use is fully stateless.** Because no store is injected on `/api/mcp`, the taste tools are not even registered for anonymous callers — there is no code path by which an anonymous request can write anything to Redis. If you never authenticate, Raven retains nothing about you.

**Authenticated use is namespaced per account.** `/api/mcp-user` verifies the bearer token on every request and constructs a fresh `RedisTasteStore` scoped to the token's `sub` (subject/user id) claim. Cross-user isolation is structural, not just a filter: the store is created per request from the verified `sub`, never held as shared module-level state, so one request can never see another user's keys.

## What is stored, and where

All taste data lives in Upstash Redis, namespaced under the caller's `sub`:

```
taste:{sub}:profile:{name}    profile JSON
taste:{sub}:surfaces:{name}   surface bindings — {version:1, bindings:[...]}
taste:{sub}:decisions:{name}  a Redis LIST of recorded decisions (append-only, RPUSH)
taste:{sub}:profiles          a SET index of the caller's profile names
```

This is design-judgment data you create through the Taste Engine tools — profiles, per-surface bindings, and recorded decisions. It is exactly the state you'd otherwise keep in a local `~/.raven/taste` directory, moved into a per-account Redis namespace so it works across sessions and machines.

## Tokens are never persisted

The bearer token on each request is verified and then discarded. No access token, refresh token, or other credential is ever written to Redis or to logs. Nothing about the request's authentication material outlives the request that carried it.

## Rate limiting is operational, not user content

Per-user request counters are separate from the data above, both in purpose and in key space:

```
rl:{sub}:{bucket}    fixed-window request counter (bucket = floor(now / window))
```

- Default: 120 requests per 60-second window (configurable via environment variables).
- Each counter carries a TTL of 2× the window, so counters self-expire — nothing here persists beyond a couple of minutes.
- The limiter fails **open**: a Redis error never blocks a legitimate request.
- Anonymous calls to `/api/mcp` are never rate-limited.

These counters are throwaway bookkeeping, not user content, and live under a distinct `rl:` prefix so they're never touched by taste-data deletion.

## Deletion is full, user-initiated erasure

Authenticated callers can remove everything Raven holds about them with the `delete_taste_data` tool, which requires an exact `confirm: "DELETE"` argument — anything else is refused and deletes nothing.

What it does:

1. Validates the caller's `sub` against `^[A-Za-z0-9_-]+$` before using it in any key pattern, so a malformed or hostile `sub` can never widen the deletion scope.
2. Walks the `taste:{sub}:profiles` index and deletes each known profile, its surface bindings, and its decisions, then deletes the index set itself.
3. Runs a `SCAN` sweep over `taste:{sub}:*` to catch anything the index missed.
4. Runs a final `SCAN` to verify erasure, and returns `{ deleted, remaining }` — `remaining > 0` is treated as an error, not a partial success.

Deletion is scoped strictly to `taste:{sub}:*`. It never touches another user's keys, and it never touches the `rl:{sub}:*` rate-limit counters (those are operational and self-expiring, not user content). Re-running deletion against already-empty data is safe and idempotent — it reports `remaining: 0` and no error.

After deletion completes, subsequent reads for that account come back empty. There is no soft-delete or grace period: this is the erasure path.

## Retention, summarized

| Data | Retention |
|---|---|
| Anonymous requests | None retained |
| Taste profiles, surface bindings, decisions | Kept until you call `delete_taste_data` — no automatic expiry |
| Bearer tokens / credentials | Never persisted |
| Rate-limit counters | Auto-expire (TTL = 2× the window) |
