// The fourth adverse pass found that the round-3 cookie hardening reasoned about
// the WRONG URL: it derived "is this channel secure?" and "does this host own
// that Domain?" from `new URL(requestUrl, "http://127.0.0.1")` — the loopback
// request the browser made — instead of the upstream request the bridge was
// about to send. So the scheme was always http and the host was always
// 127.0.0.1. Net effect: a Secure cookie was never replayed at all, a legitimate
// `Domain=<the real site>` was rejected as foreign, and `Domain=127.0.0.1` from
// any site on earth was accepted.
//
// The round-3 regression test could not see any of it, because its fixture
// upstream WAS plaintext 127.0.0.1 — the one place where the right answer and
// the wrong mechanism agree. Every test here runs against a NON-loopback https
// upstream for exactly that reason, and asserts on the header the upstream
// received rather than on what came back to the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandboxNoNetwork = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.resolve(__dirname, '../browser/raven-grab.js');

const grabBridgeMod = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function setCookieResponse(body, cookies, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(body, { status: 200, headers });
}

// An https upstream with no TLS anywhere near it: the point is what the bridge
// DECIDES about the scheme, and a stub records the request it was handed.
async function withStubbedUpstream(origin, respond, fn) {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-grab-r4-'));
  const designPath = path.join(fixtureDir, 'DESIGN.md');
  await writeFile(designPath, '---\nname: "Round 4 Fixture"\n---\n# Fixture\n', 'utf8');
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async function (input, init) {
    const url = String(input);
    const headers = new Headers((init && init.headers) || {});
    sent.push({ url, cookie: headers.get('cookie') || '' });
    return respond(url, sent);
  };
  const session = await grabBridgeMod.startGrabSession(designPath, undefined, origin);
  try {
    return await fn(session, sent);
  } finally {
    globalThis.fetch = originalFetch;
    await grabBridgeMod.stopGrabSession();
  }
}

const ok = (body, type) => new Response(body, { status: 200, headers: { 'Content-Type': type || 'text/plain; charset=utf-8' } });

test('a Secure cookie IS replayed over an https upstream', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The half of the round-3 fix that was silently dead. Refusing to replay a
  // Secure cookie over plaintext is correct; refusing to replay it ever is a
  // broken session — the designer logs in through the bridge and the very next
  // request arrives anonymous, on the https sites that make up most of the web.
  await withStubbedUpstream('https://fixture.test', (url) => {
    if (url.endsWith('/login')) return setCookieResponse('{}', ['sid=abc; Path=/; Secure; HttpOnly']);
    return ok('{}');
  }, async (session, sent) => {
    await request(session.url + '/login');
    // Declared same-origin, so this measures the Secure/Domain/prefix rules and
    // nothing else. A bare request is cross-site as of round 8 — absent Fetch
    // Metadata proves nothing — which would filter the jar by SameSite before
    // these assertions ever saw it, and the test would fail for a reason it is
    // not about.
    await request(session.url + '/echo', { headers: { 'sec-fetch-site': 'same-origin' } });
    assert.equal(sent[1].cookie, 'sid=abc',
      'the upstream request must carry the Secure cookie over its https channel: ' + JSON.stringify(sent));
  });
});

test('Domain is judged against the upstream host, not the loopback one', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // Both directions of the same inversion. `Domain=fixture.test` from
  // fixture.test is the ordinary case every real login uses, and it was being
  // dropped; `Domain=127.0.0.1` is a claim no site on the internet can make, and
  // it was being accepted from anyone.
  await withStubbedUpstream('https://app.fixture.test', (url) => {
    if (url.endsWith('/login')) {
      return setCookieResponse('{}', [
        'own=yes; Path=/; Secure; Domain=fixture.test',
        'exact=yes; Path=/; Secure; Domain=app.fixture.test',
        'loopback=nope; Path=/; Secure; Domain=127.0.0.1',
        'foreign=nope; Path=/; Secure; Domain=example.com',
        'sibling=nope; Path=/; Secure; Domain=notfixture.test'
      ]);
    }
    return ok('{}');
  }, async (session, sent) => {
    await request(session.url + '/login');
    // Declared same-origin, so this measures the Secure/Domain/prefix rules and
    // nothing else. A bare request is cross-site as of round 8 — absent Fetch
    // Metadata proves nothing — which would filter the jar by SameSite before
    // these assertions ever saw it, and the test would fail for a reason it is
    // not about.
    await request(session.url + '/echo', { headers: { 'sec-fetch-site': 'same-origin' } });
    const cookie = sent[1].cookie;
    assert.match(cookie, /own=yes/, 'a parent domain the host is under must be honoured');
    assert.match(cookie, /exact=yes/, 'and so must the host itself');
    assert.doesNotMatch(cookie, /loopback=nope/, 'no site may claim a cookie for 127.0.0.1');
    assert.doesNotMatch(cookie, /foreign=nope/);
    assert.doesNotMatch(cookie, /sibling=nope/,
      'domain-match is a label boundary, not a suffix test (RFC 6265 §5.1.3)');
  });
});

test('a malformed __Secure-/__Host- cookie is rejected, never upgraded', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The prefixes are promises a browser enforces by REJECTING the cookie when
  // the promise is not kept (RFC 6265bis §4.1.3). Upgrading it to secure — which
  // is what the jar did — accepts a malformed cookie and then behaves as though
  // the site had sent a well-formed one, so the jar and the browser disagree
  // about whether the cookie exists at all.
  await withStubbedUpstream('https://fixture.test', (url) => {
    if (url.endsWith('/login')) {
      return setCookieResponse('{}', [
        '__Secure-good=yes; Path=/; Secure',
        '__Secure-bare=no; Path=/',
        '__Host-good=yes; Path=/; Secure',
        '__Host-nopath=no; Secure',
        '__Host-domained=no; Path=/; Secure; Domain=fixture.test',
        '__Host-subpath=no; Path=/app; Secure'
      ]);
    }
    return ok('{}');
  }, async (session, sent) => {
    await request(session.url + '/login');
    // Declared same-origin, so this measures the Secure/Domain/prefix rules and
    // nothing else. A bare request is cross-site as of round 8 — absent Fetch
    // Metadata proves nothing — which would filter the jar by SameSite before
    // these assertions ever saw it, and the test would fail for a reason it is
    // not about.
    await request(session.url + '/echo', { headers: { 'sec-fetch-site': 'same-origin' } });
    const cookie = sent[1].cookie;
    assert.match(cookie, /__Secure-good=yes/);
    assert.match(cookie, /__Host-good=yes/);
    assert.doesNotMatch(cookie, /__Secure-bare/, 'a __Secure- cookie with no Secure is refused, not fixed');
    // Path=/ must be STATED, not merely arrived at: /login's default path is
    // /, so accepting the bare one would let the same header mean different
    // things depending on where the site happened to send it from.
    assert.doesNotMatch(cookie, /__Host-nopath/);
    assert.doesNotMatch(cookie, /__Host-domained/);
    assert.doesNotMatch(cookie, /__Host-subpath/);
  });
});

test('SameSite is enforced on the bridge, because upstream can no longer see it', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The bridge rewrites Origin and strips sec-fetch-* so that Origin-gated SaaS
  // answers at all — which means the proxied site cannot tell a cross-site
  // request from a same-origin one any more. Any page that guesses the loopback
  // port would otherwise get the site's Strict cookies attached to its request
  // with a matching Origin stamped on top. So SameSite is enforced here or
  // nowhere. Absent SameSite is Lax in every current browser, not None.
  await withStubbedUpstream('https://fixture.test', (url) => {
    if (url.endsWith('/login')) {
      return setCookieResponse('{}', [
        'strict=1; Path=/; Secure; SameSite=Strict',
        'lax=1; Path=/; Secure; SameSite=Lax',
        'none=1; Path=/; Secure; SameSite=None',
        'silent=1; Path=/; Secure'
      ]);
    }
    return ok('{}');
  }, async (session, sent) => {
    await request(session.url + '/login');

    // A request that DECLARES itself same-origin gets the whole jar. This case
    // used to be spelled as a bare request with no headers at all, which is not
    // the same claim: absent Fetch Metadata was being read as proof of
    // same-site, and Safari before 16.4 and several WebViews omit it entirely.
    // The round-6 adverse pass named that fail-open as the live hole; the case
    // below it is the one that closes it.
    await request(session.url + '/echo', { headers: { 'sec-fetch-site': 'same-origin' } });
    assert.equal(sent[1].cookie, 'strict=1; lax=1; none=1; silent=1',
      'a same-site request gets the whole jar');

    await request(session.url + '/echo');
    assert.equal(sent[2].cookie, 'none=1',
      'a request with no Fetch Metadata, Origin or Referer must not prove same-site ' +
      'OR top-level navigation — a foreign <img referrerpolicy="no-referrer"> looks ' +
      'exactly like this, so only the cookies that opted in cross-site may ride');

    await request(session.url + '/echo', {
      method: 'POST', body: 'x', headers: { origin: 'http://evil.test' }
    });
    assert.equal(sent[3].cookie, 'none=1',
      'a foreign-Origin POST with no Fetch Metadata kept more than the cookies that opted in');

    await request(session.url + '/echo', {
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document'
      }
    });
    assert.equal(sent[4].cookie, 'lax=1; none=1; silent=1',
      'a cross-site top-level navigation drops Strict and keeps Lax');

    // The destination is what makes it TOP-level. This case used to be spelled
    // without one, which meant an attacker's <iframe src="…127.0.0.1:PORT/echo">
    // — cross-site, navigate, dest=iframe — was indistinguishable from the line
    // above and rode the same Lax jar.
    await request(session.url + '/echo', {
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'iframe'
      }
    });
    assert.equal(sent[5].cookie, 'none=1',
      'a cross-site IFRAME navigation is not top-level and must keep only the ' +
      'cookies that opted in cross-site');

    // The case that separates an ALLOWLIST from a DENYLIST, and the only one that
    // does. Every assertion above is satisfied by `dest !== "iframe"` just as well
    // as by `dest === "document"`, so without this line the check could be
    // rewritten as a denylist and the suite would stay green — while `frame`,
    // `embed`, `object` and every destination the platform adds later silently
    // regained Lax. An OMITTED dest is the general form of that: it is not
    // `iframe`, so a denylist admits it, and it is not `document`, so the
    // allowlist refuses it. Refusing is correct — a browser old enough to send
    // `mode` without `dest` cannot prove the navigation was top-level.
    await request(session.url + '/echo', {
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }
    });
    assert.equal(sent[6].cookie, 'none=1',
      'a cross-site navigation that never said it was top-level was handed the Lax ' +
      'jar — the destination check has become a denylist');

    await request(session.url + '/echo', {
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' }
    });
    assert.equal(sent[7].cookie, 'none=1',
      'a cross-site subresource keeps only the cookies that opted in');
  });
});

test('a meta refresh that changes scheme is left offsite, not rewritten', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // sameProxyHost compares hostname and port only, so `https://fixture.test/x`
  // read as same-site from an http session and was rewritten to a bridge-relative
  // path. The browser then loaded it back over the plaintext session and the
  // site's own upgrade was silently undone — the same TLS strip the redirect
  // handler refuses, arriving through the HTML rewriter instead. A meta refresh
  // is the same navigation by another spelling.
  await withStubbedUpstream('http://fixture.test', (url) => {
    if (url.endsWith('/upgrade')) {
      return ok('<!doctype html><html><head><meta http-equiv="refresh" content="0; url=https://fixture.test/secure"></head><body>x</body></html>', 'text/html; charset=utf-8');
    }
    if (url.endsWith('/stay')) {
      return ok('<!doctype html><html><head><meta http-equiv="refresh" content="0; url=http://fixture.test/onward?q=1"></head><body>x</body></html>', 'text/html; charset=utf-8');
    }
    return ok('landed');
  }, async (session, sent) => {
    const upgrade = await request(session.url + '/upgrade');
    assert.match(upgrade.body, /content="0; url=https:\/\/fixture\.test\/secure"/,
      'the absolute https URL must survive intact: ' + (upgrade.body.match(/<meta[^>]*>/) || [''])[0]);

    // The same-scheme case still gets proxied, and the proof is the URL the
    // SECOND upstream fetch was actually given — not the rewritten attribute,
    // which is only a claim about where the browser will go next.
    const stay = await request(session.url + '/stay');
    const rewritten = (stay.body.match(/content="0; url=([^"]+)"/) || [])[1];
    assert.equal(rewritten, '/onward?q=1', 'a same-scheme refresh is bridge-relative');
    const landed = await request(session.url + rewritten);
    assert.equal(landed.body, 'landed');
    assert.equal(sent[2].url, 'http://fixture.test/onward?q=1',
      'and it reaches the proxied site on the scheme it asked for: ' + sent[2].url);
  });
});
