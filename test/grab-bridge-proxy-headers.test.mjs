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

async function request(url, options = {}) {
  return await new Promise(function (resolve, reject) {
    var req = httpRequest(url, options, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        var rawBody = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: rawBody.toString('utf8'), rawBody });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function withUpstream(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('grab proxy hardens policy, config, redirects, and cookies by effect', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-proxy-headers-'));
  const designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '---\nname: "Proxy Header Fixture"\n---\n# Proxy headers\n', 'utf8');

  let upstreamOrigin = '';
  await withUpstream((req, res) => {
    if (req.url === '/page') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "script-src 'none'",
        'Permissions-Policy': 'clipboard-write=()',
        'Feature-Policy': "clipboard-write 'none'",
        'Alt-Svc': 'h2=":443"',
        'X-Fixture-Marker': 'preserved',
        'Set-Cookie': [
          'sid=abc; Path=/; Secure; HttpOnly; SameSite=None; Domain=example.com',
          'pref=insecure-mode; Path=/'
        ]
      });
      res.end('<!doctype html><html><body><main>Fixture</main></body></html>');
      return;
    }
    if (req.url === '/same') {
      res.writeHead(302, { Location: upstreamOrigin + '/next?from=proxy#section' });
      res.end();
      return;
    }
    if (req.url === '/offsite') {
      res.writeHead(302, { Location: 'https://example.net/out' });
      res.end();
      return;
    }
    if (req.url === '/echo-cookie') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cookie: req.headers.cookie || '' }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (origin) => {
    upstreamOrigin = origin;
    const session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      const page = await request(session.url + '/page');
      assert.equal(page.headers['content-security-policy'], undefined);
      assert.equal(page.headers['permissions-policy'], undefined);
      assert.equal(page.headers['feature-policy'], undefined);
      assert.equal(page.headers['alt-svc'], undefined);
      assert.equal(page.headers['x-fixture-marker'], 'preserved');
      assert.doesNotMatch(page.body, /<script>window\.ravenGrabConfig/);
      assert.match(page.body, /raven-grab\.js\?key=/);

      const scriptSrc = page.body.match(/<script src="([^"]*raven-grab\.js[^"]*cfg=[^"]*)"><\/script>/);
      assert.ok(scriptSrc, 'proxy HTML should contain the external overlay script');
      const script = await request(new URL(scriptSrc[1], session.url).toString());
      assert.match(script.body, /^window\.ravenGrabConfig=/);
      assert.match(script.body, /"projectName":"Proxy Header Fixture"/);

      const key = new URL(scriptSrc[1], session.url).searchParams.get('key');
      assert.ok(key);
      const malformed = await request(session.url + '/raven-grab.js?key=' + key + '&cfg=%7Bbroken');
      assert.equal(malformed.status, 200);
      assert.doesNotMatch(malformed.body, /^window\.ravenGrabConfig=/);

      const sameOrigin = await request(session.url + '/same');
      assert.equal(sameOrigin.headers.location, '/next?from=proxy#section');
      assert.equal(sameOrigin.headers['x-raven-proxy-offsite'], undefined);

      const offsite = await request(session.url + '/offsite');
      assert.equal(offsite.headers.location, 'https://example.net/out');
      assert.equal(offsite.headers['x-raven-proxy-offsite'], 'https://example.net');

      // Upstream cookies must not reach the browser at all. Rewriting them into
      // 127.0.0.1 cookies (dropping Secure/Domain) put a third-party session
      // credential into a cookie store that is not port-scoped, so every other
      // local dev server and every later proxy session would receive it.
      assert.equal(page.headers['set-cookie'], undefined,
        'upstream Set-Cookie must never reach the localhost cookie store');

      // They are held server-side for this session and replayed upstream instead —
      // and the browser's own localhost cookies never travel the other way.
      //
      // `sid` is deliberately BOTH Secure and Domain=example.com while the fixture
      // upstream is plaintext 127.0.0.1, and this test used to assert it replayed
      // anyway. That is two leaks in one line: a Secure cookie disclosed over
      // http, and a cookie claiming a domain the responding host is not allowed
      // to set — which a browser drops outright. A proxy is not exempt from
      // either, so only the cookie the site was actually entitled to send comes
      // back.
      const replayed = await request(session.url + '/echo-cookie', { headers: { Cookie: 'other_local_app=leak' } });
      const seen = JSON.parse(replayed.body);
      assert.equal(seen.cookie, 'pref=insecure-mode');
      assert.doesNotMatch(seen.cookie, /sid=abc/,
        'a Secure cookie for a foreign Domain must not be replayed over plaintext');
      assert.doesNotMatch(seen.cookie, /other_local_app/,
        "the browser's 127.0.0.1 cookies must not be forwarded to the proxied site");
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
});

test('grab proxy removes only meta CSP declarations', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-meta-csp-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Meta CSP\n', 'utf8');
  var protectedMarkup = '<script>var tpl=\'<meta http-equiv="Content-Security-Policy" content="fake">\';</script><template><meta http-equiv="Content-Security-Policy" content="template"></template><!-- <meta http-equiv="Content-Security-Policy" content="comment"> -->';
  var source = '<!doctype html><html><head><meta data-a="1" content="default > src none" HTTP-EQUIV="Content-Security-Policy"><title>Kept</title><meta http-equiv=content-security-policy-report-only content="report-uri /csp"><meta data-http-equiv="Content-Security-Policy" content="keep">' + protectedMarkup + '</head><body><main>Byte exact</main></body></html>';
  var expected = '<!doctype html><html><head><title>Kept</title><meta data-http-equiv="Content-Security-Policy" content="keep">' + protectedMarkup + '</head><body><main>Byte exact</main></body></html>';
  await withUpstream(function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(source);
  }, async function (origin) {
    var session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      var page = await request(session.url + '/');
      assert.equal(page.body.replace(/<script src="[^"]*raven-grab\.js[^"]*"><\/script>/g, ''), expected);
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
});

test('grab proxy rewrites only same-origin base hrefs', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-base-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Base href\n', 'utf8');
  var source = '';
  await withUpstream(function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(source);
  }, async function (origin) {
    source = '<html><head><base data-a="1" href="' + origin + '/app/"><base data-href="' + origin + '/keep/"><base href="https://cdn.example.net/assets/"></head><body>Base</body></html>';
    var session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      var page = await request(session.url + '/');
      assert.match(page.body, /<base data-a="1" href="\/app\/">/);
      assert.match(page.body, new RegExp('<base data-href="' + origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/keep/">'));
      assert.match(page.body, /<base href="https:\/\/cdn\.example\.net\/assets\/">/);
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
});

test('grab proxy rewrites only same-host meta refresh URLs', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-refresh-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Meta refresh\n', 'utf8');
  var source = '';
  await withUpstream(function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(source);
  }, async function (origin) {
    source = '<html><head><meta content="0; URL=' + origin + '/next?via=meta#done" http-equiv="refresh"><meta http-equiv="refresh" content="5; url=https://example.net/out"></head><body>Refresh</body></html>';
    var session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      var page = await request(session.url + '/');
      assert.match(page.body, /content="0; URL=\/next\?via=meta#done"/);
      assert.match(page.body, /content="5; url=https:\/\/example\.net\/out"/);
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
  var localSession = await grabBridgeMod.startGrabSession(designPath);
  try {
    var keyMatch = /raven-grab\.js\?key=([a-f0-9]+)/.exec(localSession.script_tag);
    assert.ok(keyMatch);
    var localAsset = await request(localSession.url + '/raven-grab.js?key=' + keyMatch[1] + '&sw=1');
    assert.match(localAsset.body, /window\.__RAVEN_GRAB__/);
  } finally {
    await grabBridgeMod.stopGrabSession();
  }
});

test('grab proxy sends an https-to-http redirect offsite instead of downgrading the session', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-scheme-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Scheme redirect\n', 'utf8');
  var originalFetch = globalThis.fetch;
  var fetched = [];
  globalThis.fetch = async function (input) {
    fetched.push(String(input));
    return new Response(null, { status: 302, headers: { Location: 'http://fixture.test:443/next?scheme=http' } });
  };
  var session = await grabBridgeMod.startGrabSession(designPath, undefined, 'https://fixture.test:443');
  try {
    // Rewriting this to a bridge-relative path and moving the session's upstream
    // to http would break the redirect loop, and an earlier revision did exactly
    // that. It is a TLS strip wearing a loop fix's clothes: every subsequent
    // request for that session, including replayed cookies, would travel in the
    // clear because one response said so. The scheme is not a detail the
    // redirect gets to change on the user's behalf — so the downgrade leaves the
    // proxy entirely and the browser makes its own decision about it.
    var response = await request(session.url + '/redirect');
    assert.equal(response.headers.location, 'http://fixture.test:443/next?scheme=http');
    assert.equal(response.headers['x-raven-proxy-offsite'], 'http://fixture.test:443');
    assert.equal(response.headers['x-raven-proxy-downgraded'], undefined,
      'a downgrade is refused, not announced-and-followed');
    assert.equal(fetched.length, 1, 'the bridge must not fetch the plaintext destination itself');
  } finally {
    globalThis.fetch = originalFetch;
    await grabBridgeMod.stopGrabSession();
  }
});

test('grab proxy rebinds an http-to-https upgrade and keeps proxying it', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-upgrade-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Scheme upgrade\n', 'utf8');
  var originalFetch = globalThis.fetch;
  var fetched = [];
  globalThis.fetch = async function (input) {
    fetched.push(String(input));
    if (fetched.length === 1) {
      return new Response(null, { status: 302, headers: { Location: 'https://fixture.test/next?scheme=https' } });
    }
    return new Response('landed', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  };
  var session = await grabBridgeMod.startGrabSession(designPath, undefined, 'http://fixture.test');
  try {
    // The upgrade is the asymmetric half: it strictly improves the channel, and
    // a site that answers every plaintext request with "use https" would loop
    // for ever if the session stayed on http. So this one rebinds.
    var response = await request(session.url + '/redirect');
    assert.equal(response.headers.location, '/next?scheme=https');
    assert.equal(response.headers['x-raven-proxy-offsite'], undefined);
    var next = await request(session.url + '/next?scheme=https');
    assert.equal(next.body, 'landed');
    assert.ok(fetched[1].startsWith('https://fixture.test/next'),
      'the follow-up fetch must go to the upgraded origin: ' + fetched[1]);
  } finally {
    globalThis.fetch = originalFetch;
    await grabBridgeMod.stopGrabSession();
  }
});

test('grab proxy rewrites browser identity headers before forwarding', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-request-headers-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Request headers\n', 'utf8');
  var receivedHeaders;
  await withUpstream(function (req, res) {
    receivedHeaders = req.headers;
    res.writeHead(204);
    res.end();
  }, async function (origin) {
    var session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      await request(session.url + '/save', { headers: {
        Origin: session.url,
        Referer: session.url + '/form?step=2',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-User': '?1'
      } });
      assert.equal(receivedHeaders.origin, origin);
      assert.equal(receivedHeaders.referer, origin + '/form?step=2');
      assert.equal(receivedHeaders['sec-fetch-site'], undefined);
      assert.equal(receivedHeaders['sec-fetch-dest'], undefined);
      assert.equal(receivedHeaders['sec-fetch-user'], undefined);
      // sec-fetch-mode is the one we cannot delete: undici stamps a constant
      // 'cors' on every outgoing fetch and ignores any override. What matters is
      // that the BROWSER's value never reaches upstream — measured, not assumed
      // (a fetch with no sec-fetch headers at all still arrives as 'cors').
      assert.notEqual(receivedHeaders['sec-fetch-mode'], 'navigate',
        "the browser's own sec-fetch-mode must not be forwarded upstream");
      assert.equal(receivedHeaders['sec-fetch-mode'], 'cors');
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
});

test('grab proxy installs the service-worker no-op before upstream scripts', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-service-worker-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Service worker\n', 'utf8');
  await withUpstream(function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><head data-note="a > b"><script src="/upstream.js"></script></head><body>SW</body></html>');
  }, async function (origin) {
    var session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      var page = await request(session.url + '/');
      var noOpSrc = page.body.match(/<script src="([^"]*raven-grab\.js[^"]*sw=1[^"]*)"><\/script>/);
      assert.ok(noOpSrc);
      assert.match(page.body, /<head data-note="a > b"><script src="[^"]*sw=1[^"]*"><\/script><script src="\/upstream\.js">/);
      assert.ok(page.body.indexOf(noOpSrc[0]) < page.body.indexOf('<script src="/upstream.js">'));
      var noOp = await request(new URL(noOpSrc[1], session.url).toString());
      assert.match(noOp.body, /serviceWorker\.register=function\(\)/);
      assert.doesNotMatch(noOp.body, /window\.__RAVEN_GRAB__/);
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
});

test('grab proxy preserves non-UTF-8 bytes and still injects UTF-8 HTML', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async function () {
  var fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-charset-'));
  var designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '# Charset\n', 'utf8');
  var gb2312Body = Buffer.from([0x3c, 0x70, 0x3e, 0xd6, 0xd0, 0xce, 0xc4, 0x3c, 0x2f, 0x70, 0x3e]);
  await withUpstream(function (req, res) {
    if (req.url === '/gb2312') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=gb2312' });
      res.end(gb2312Body);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body>UTF-8</body></html>');
  }, async function (origin) {
    var session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
    try {
      var untouched = await request(session.url + '/gb2312');
      assert.deepEqual(untouched.rawBody, gb2312Body);
      assert.equal(untouched.headers['x-raven-proxy-uninjected'], 'charset=gb2312');
      assert.doesNotMatch(untouched.body, /raven-grab\.js/);
      var injected = await request(session.url + '/utf8');
      assert.equal(injected.headers['x-raven-proxy-uninjected'], undefined);
      assert.match(injected.body, /raven-grab\.js/);
    } finally {
      await grabBridgeMod.stopGrabSession();
    }
  });
});
