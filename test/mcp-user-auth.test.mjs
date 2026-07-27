/**
 * mcp-user-auth.test.mjs — P4.1
 *
 * The AUTHENTICATED remote endpoint (api/mcp-user.js):
 *   - 401 + WWW-Authenticate w/ resource_metadata when the Bearer is missing
 *   - 401 invalid_token for garbage, wrong-`aud`, wrong-`iss`, and expired JWTs
 *   - a VALID AuthKit-style JWT serves exactly the same 45 remote tools as the
 *     anonymous endpoint — golden-hash-checked (P4.1 un-gates nothing)
 *   - the RFC 9728 PRM document points at the configured authorization server
 *
 * Tokens are signed with an ephemeral RS256 key; its public JWKS is injected
 * through the RAVEN_TEST_JWKS_JSON seam (honored only when VERCEL is unset —
 * i.e. never on a real deployment). Runs after `npm run build` (imports dist).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';

const GOLDEN_45_HASH = 'f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6';
const ISSUER = 'https://test-tenant.authkit.example';
const RESOURCE = 'https://raven-test.example/api/mcp-user';
const sandboxNoNetwork = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
const networkTest = function (name, fn) {
  return test(name, { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, fn);
};

process.env.WORKOS_AUTHKIT_DOMAIN = ISSUER;
process.env.RAVEN_MCP_RESOURCE = RESOURCE;
delete process.env.VERCEL;

let key;          // RS256 private key
let httpServer;   // wraps the Vercel-style handlers
let baseUrl;

// Minimal emulation of Vercel's node runtime: parse JSON into req.body and
// add res.status/json helpers, then delegate to the imported handler.
function vercelish(handler) {
  return (req, res) => {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(obj));
    };
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length > 0 && (req.headers['content-type'] || '').includes('application/json')) {
        try { req.body = JSON.parse(raw); } catch { req.body = raw; }
      }
      handler(req, res).catch((err) => {
        if (!res.headersSent) { res.statusCode = 500; res.end(String(err)); }
      });
    });
  };
}

async function signToken({ iss = ISSUER, aud = RESOURCE, sub = 'user_test_1', expiresIn = '5m' } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key.privateKey);
}

function rpc(path, body, headers = {}) {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

if (!sandboxNoNetwork) before(async () => {
  key = await generateKeyPair('RS256');
  const jwk = await exportJWK(key.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  process.env.RAVEN_TEST_JWKS_JSON = JSON.stringify({ keys: [jwk] });

  const mcpUser = (await import('../api/mcp-user.js')).default;
  const wellKnown = (await import('../api/well-known.js')).default;
  httpServer = createServer((req, res) => {
    if (req.url.startsWith('/api/well-known')) return vercelish(wellKnown)(req, res);
    return vercelish(mcpUser)(req, res);
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + httpServer.address().port;
});

after(() => { httpServer && httpServer.close(); });

networkTest('missing Bearer → 401 with resource_metadata challenge', async () => {
  const res = await rpc('/api/mcp-user', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 401);
  const challenge = res.headers.get('www-authenticate');
  assert.ok(challenge && challenge.startsWith('Bearer'), 'WWW-Authenticate must be a Bearer challenge');
  assert.match(challenge, /resource_metadata="https:\/\/[^"]+\/\.well-known\/oauth-protected-resource\/api\/mcp-user"/);
  // The missing-token challenge must NOT claim invalid_token.
  assert.ok(!challenge.includes('invalid_token'));
});

networkTest('garbage / wrong-aud / wrong-iss / expired tokens → 401 invalid_token', async () => {
  const bad = [
    'not-a-jwt-at-all',
    await signToken({ aud: 'https://some-other-resource.example/api/mcp-user' }),
    await signToken({ iss: 'https://evil-issuer.example' }),
    await signToken({ expiresIn: '-5m' })
  ];
  for (const token of bad) {
    const res = await rpc('/api/mcp-user', { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { authorization: 'Bearer ' + token });
    assert.equal(res.status, 401, 'expected 401 for token: ' + token.slice(0, 24));
    assert.match(res.headers.get('www-authenticate') || '', /error="invalid_token"/);
  }
});

networkTest('valid token → exactly the 45 anonymous remote tools (golden hash)', async () => {
  const token = await signToken();
  const res = await rpc('/api/mcp-user', { jsonrpc: '2.0', id: 7, method: 'tools/list' },
    { authorization: 'Bearer ' + token });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.ok(payload.result && Array.isArray(payload.result.tools), 'tools/list must return tools');
  const names = payload.result.tools.map((t) => t.name).sort();
  assert.equal(names.length, 45);
  const hash = createHash('sha256').update(names.join('\n')).digest('hex');
  assert.equal(hash, GOLDEN_45_HASH, 'authed P4.1 tool surface must equal the anonymous golden 45');
  // No taste tool may leak before P4.2+.
  for (const n of names) assert.ok(!/taste/.test(n), 'no taste tool may be exposed in P4.1: ' + n);
});

networkTest('PRM document points at the configured authorization server', async () => {
  const res = await fetch(baseUrl + '/api/well-known?doc=prm');
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.resource, RESOURCE);
  assert.deepEqual(doc.authorization_servers, [ISSUER]);
  assert.deepEqual(doc.bearer_methods_supported, ['header']);
});

networkTest('resource falls back to the request host when RAVEN_MCP_RESOURCE is unset (preview binding)', async () => {
  const saved = process.env.RAVEN_MCP_RESOURCE;
  delete process.env.RAVEN_MCP_RESOURCE;
  try {
    // Token minted for deployment A must not validate on deployment B.
    const tokenForA = await signToken({ aud: 'https://deploy-a.vercel.app/api/mcp-user' });
    const res = await rpc('/api/mcp-user', { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { authorization: 'Bearer ' + tokenForA, 'x-forwarded-host': 'deploy-b.vercel.app' });
    assert.equal(res.status, 401);

    const tokenForB = await signToken({ aud: 'https://deploy-b.vercel.app/api/mcp-user' });
    const ok = await rpc('/api/mcp-user', { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { authorization: 'Bearer ' + tokenForB, 'x-forwarded-host': 'deploy-b.vercel.app' });
    assert.equal(ok.status, 200);
  } finally {
    process.env.RAVEN_MCP_RESOURCE = saved;
  }
});
