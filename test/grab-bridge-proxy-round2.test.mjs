// The second adverse pass over the reverse proxy found four defects that a
// header-level test could not see, because each one is about which side of the
// bridge a request ends up on rather than what the response looks like. Every
// assertion below is written against what the UPSTREAM received, not only what
// the browser got back — the whole class of bug here is Raven quietly sending
// something to a third-party origin, and the response can look correct while it
// happens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandboxNoNetwork = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.resolve(__dirname, '../browser/raven-grab.js');

const grabBridgeMod = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));

function request(url, options = {}) {
  const { body, ...rest } = options;
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, rest, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// Records every request the proxied site actually received, which is the only
// thing that answers "did Raven forward this?".
async function withUpstream(handler, fn) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie || '' });
    handler(req, res, seen);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, seen);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withSession(origin, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-proxy-r2-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\nname: "Round 2 Fixture"\n---\n# Fixture\n', 'utf8');
  const session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
  try {
    const page = await request(session.url + '/page');
    const scriptSrc = page.body.match(/<script src="([^"]*raven-grab\.js[^"]*)"><\/script>/);
    assert.ok(scriptSrc, 'the proxied page must carry the overlay script tag');
    const key = new URL(scriptSrc[1], session.url).searchParams.get('key');
    assert.ok(key);
    return await fn(session, key);
  } finally {
    await grabBridgeMod.stopGrabSession();
  }
}

const html = (res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body><main>Fixture</main></body></html>');
};

test('a withheld authoring route is answered here, never forwarded upstream', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // Withholding the authoring surface was implemented as "not a bridge route",
  // which fell through to the forwarder. So the overlay's own layer move went to
  // the proxied site as a POST carrying that site's session cookie AND Raven's
  // capability key. A site that happens to own /layers could be made to act on a
  // request the designer never issued, and the overlay's move silently did
  // nothing. Refusing locally is the only correct answer for Raven's own traffic.
  await withUpstream((req, res) => {
    if (req.url.startsWith('/page')) return html(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"upstream":true}');
  }, async (origin, seen) => {
    await withSession(origin, async (session, key) => {
      const before = seen.length;
      const moved = await request(session.url + '/layers?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'move', from: 1, to: 2 })
      });
      assert.equal(moved.status, 404);
      assert.equal(seen.length, before,
        'a keyed Raven route must not reach the proxied site: ' + JSON.stringify(seen.slice(before)));
    });
  });
});

test('the same path without the key still belongs to the site that owns it', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The other half of the same decision. /layers, /tokens and /components are
  // ordinary paths a real site may own, and answering 403 there would break the
  // site the designer came to measure.
  await withUpstream((req, res) => {
    if (req.url.startsWith('/page')) return html(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"upstream":true}');
  }, async (origin, seen) => {
    await withSession(origin, async (session) => {
      const collision = await request(session.url + '/layers', { method: 'POST', body: '{}' });
      assert.equal(collision.status, 200);
      assert.match(collision.body, /"upstream":true/);
      assert.ok(seen.some((entry) => entry.url === '/layers'), 'the unkeyed collision must reach upstream');
    });
  });
});

test('an upstream preflight reaches upstream instead of getting Raven\'s 204', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // OPTIONS was excluded from forwarding wholesale, so every preflight on the
  // proxied site got Raven's own 204 advertising GET/POST and Content-Type.
  // Any real cross-origin API there — anything sending Authorization, or a PUT
  // or DELETE — was refused by a response the site never sent.
  await withUpstream((req, res) => {
    if (req.url.startsWith('/page')) return html(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'X-Fixture-Preflight': 'upstream'
      });
      res.end();
      return;
    }
    res.writeHead(200); res.end('ok');
  }, async (origin, seen) => {
    await withSession(origin, async (session) => {
      const preflight = await request(session.url + '/api/resource', {
        method: 'OPTIONS',
        headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization' }
      });
      assert.equal(preflight.headers['x-fixture-preflight'], 'upstream',
        'the preflight must be answered by the proxied site, not by the bridge');
      assert.match(preflight.headers['access-control-allow-methods'] || '', /PUT/);
      assert.ok(seen.some((entry) => entry.method === 'OPTIONS' && entry.url === '/api/resource'));
    });
  });
});

test('cookies are scoped by path and expire while the session is still open', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The jar was a Map keyed by cookie name, which is not a cookie jar: a site
  // setting `sid` for /app and a different `sid` for / has two cookies, and
  // collapsing them replayed the /app identity on every request for /. Expiry
  // was evaluated once at write time, so a Max-Age=1 cookie that arrived alive
  // stayed in the jar for the rest of the session.
  await withUpstream((req, res) => {
    if (req.url.startsWith('/page')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': ['sid=root; Path=/', 'sid=app; Path=/app', 'ttl=alive; Path=/; Max-Age=1']
      });
      res.end('<!doctype html><html><body><main>Fixture</main></body></html>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cookie: req.headers.cookie || '' }));
  }, async (origin) => {
    await withSession(origin, async (session) => {
      const atRoot = JSON.parse((await request(session.url + '/echo')).body).cookie;
      assert.match(atRoot, /sid=root/);
      assert.doesNotMatch(atRoot, /sid=app/, 'the /app session must not be sent to /');

      const atApp = JSON.parse((await request(session.url + '/app/echo')).body).cookie;
      assert.match(atApp, /sid=app/, 'the more specific cookie must win under /app');

      // /application must not match the /app cookie — RFC 6265 §5.1.4 requires a
      // boundary, and a plain prefix test leaks the cookie to a sibling route.
      const atSibling = JSON.parse((await request(session.url + '/application/echo')).body).cookie;
      assert.doesNotMatch(atSibling, /sid=app/);

      assert.match(atRoot, /ttl=alive/);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const afterExpiry = JSON.parse((await request(session.url + '/echo')).body).cookie;
      assert.doesNotMatch(afterExpiry, /ttl=alive/, 'an expired cookie must stop being replayed');
      assert.match(afterExpiry, /sid=root/, 'expiry must not clear the rest of the jar');
    });
  });
});

test('a cookie with no Path belongs to its directory, and a foreign Domain is refused', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // Two holes the path-scoping fix left open. The default path was hard-coded to
  // "/" instead of derived from the response URL (RFC 6265 §5.1.4), so a login
  // cookie set at /account/login replayed on every request the session made —
  // the exact site-wide leak the path fix had just closed for cookies that
  // bothered to say Path. And Domain was parsed and dropped, so any response
  // could claim a cookie for a host it has no authority over; a browser rejects
  // that outright, and a proxy standing in for one has to as well.
  await withUpstream((req, res) => {
    if (req.url.startsWith('/page')) return html(res);
    if (req.url === '/account/login') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': [
          'acct=deep',
          'own=yes; Path=/; Domain=127.0.0.1',
          'foreign=nope; Path=/; Domain=example.com'
        ]
      });
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cookie: req.headers.cookie || '' }));
  }, async (origin) => {
    await withSession(origin, async (session) => {
      await request(session.url + '/account/login');

      const atAccount = JSON.parse((await request(session.url + '/account/echo')).body).cookie;
      assert.match(atAccount, /acct=deep/, 'the default path is the response directory, so /account keeps it');

      const atRoot = JSON.parse((await request(session.url + '/echo')).body).cookie;
      assert.doesNotMatch(atRoot, /acct=deep/,
        'a Path-less cookie set at /account/login must not replay site-wide');
      assert.match(atRoot, /own=yes/, 'a Domain the responding host actually matches is honoured');
      assert.doesNotMatch(atRoot, /foreign=nope/,
        'a cookie claiming a Domain the host does not match must be dropped');
      assert.doesNotMatch(atAccount, /foreign=nope/);
    });
  });
});
