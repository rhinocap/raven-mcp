// Round 8 — the round-7 adverse pass, which broke the round-7 cookie fix in
// three places. Each test below goes red if its fix is reverted.
//
// 1. DNS rebinding: a name the attacker controls, re-pointed at 127.0.0.1, is
//    same-origin as far as the browser is concerned — Origin equals Host and
//    Sec-Fetch-Site legitimately says same-origin. Binding the listener to
//    loopback does not help, because the connection really does arrive there.
//    The Host header is the one thing rebinding cannot forge.
// 2. Lax was riding on any metadata-less GET on the theory that it was a user
//    typing the bridge URL into an old browser. A foreign page's
//    `<img referrerpolicy="no-referrer">` is byte-for-byte the same request.
// 3. `SameSite=None` without `Secure` is rejected by every current browser, so
//    keeping it in the jar manufactures a cross-site credential the site never
//    successfully set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const bridge = await import('../dist/grab-bridge.js');

async function designMd() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-round8-'));
  const file = path.join(dir, 'DESIGN.md');
  await writeFile(file, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');
  return file;
}

// Node's fetch derives Host from the URL and forbids overriding it, which is the
// correct browser behaviour and exactly why it cannot express this attack. A
// rebound name reaches the same socket with a different Host, so the request has
// to be written by hand.
function rawRequest(port, headerLines) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(headerLines.join('\r\n') + '\r\n\r\n');
    });
    let received = '';
    socket.on('data', (chunk) => { received += chunk.toString('utf8'); });
    socket.on('end', () => resolve(received));
    socket.on('error', reject);
    setTimeout(() => { socket.destroy(); resolve(received); }, 2000).unref();
  });
}

// Node's fetch REWRITES sec-fetch-mode with its own value — a request sent with
// `navigate` arrives as `cors` — so anything asserting on Fetch Metadata has to
// go out over node:http, which sends the headers as given. Measured, after a
// "declared navigation" test failed for that reason and not for the product's.
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function upstreamRecording(seen, setCookie) {
  return createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (setCookie) headers['Set-Cookie'] = setCookie;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
}

async function withProxySession(seen, setCookie, body) {
  const upstream = upstreamRecording(seen, setCookie);
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;
  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');
    await body(session);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

test('a request arriving under a rebound hostname is refused before it can proxy anything', async () => {
  const seen = [];
  await withProxySession(seen, 'session=secret-value; Path=/; SameSite=Strict', async (session) => {
    const port = Number(new URL(session.url).port);

    // Populate the jar the way the designer would: a real navigation.
    await request(session.url + '/', {
      headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }
    });
    assert.ok(seen.length >= 1, 'the first navigation never reached upstream');

    // The attack. Everything here is what a browser genuinely sends for a page
    // served from a name that now resolves to 127.0.0.1: Origin matches Host, and
    // Fetch Metadata truthfully reports same-origin. Only the name is foreign.
    seen.length = 0;
    const response = await rawRequest(port, [
      'GET /account HTTP/1.1',
      'Host: rebind.example:' + port,
      'Origin: http://rebind.example:' + port,
      'Sec-Fetch-Site: same-origin',
      'Connection: close'
    ]);

    assert.match(response, /^HTTP\/1\.1 421/,
      'a rebound hostname was served instead of refused: ' + response.split('\r\n')[0]);
    assert.equal(seen.length, 0,
      'the rebound request was proxied upstream, carrying: ' + JSON.stringify(seen[0] || null));
  });
});

test('the ordinary loopback names still work, so the host check is a boundary and not an outage', async () => {
  const seen = [];
  await withProxySession(seen, null, async (session) => {
    const port = Number(new URL(session.url).port);
    for (const host of ['127.0.0.1:' + port, 'localhost:' + port]) {
      seen.length = 0;
      const response = await rawRequest(port, [
        'GET /page HTTP/1.1',
        'Host: ' + host,
        'Connection: close'
      ]);
      assert.match(response, /^HTTP\/1\.1 200/, host + ' was refused: ' + response.split('\r\n')[0]);
      assert.equal(seen.length, 1, host + ' did not reach upstream');
    }
  });
});

test('a metadata-less GET does not get Lax cookies, because a foreign subresource looks identical', async () => {
  const seen = [];
  await withProxySession(seen, ['lax=1; Path=/; SameSite=Lax', 'none=1; Path=/; Secure; SameSite=None'], async (session) => {
    await request(session.url + '/', {
      headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }
    });

    // No sec-fetch-*, no Origin, no Referer — an <img referrerpolicy="no-referrer">
    // on a foreign page in a browser with no Fetch Metadata sends exactly this.
    seen.length = 0;
    await request(session.url + '/pixel');
    assert.equal(seen.length, 1, 'the request did not reach upstream at all');
    assert.doesNotMatch(seen[0].cookie, /lax=1/,
      'a metadata-less cross-site GET was given the Lax jar: ' + seen[0].cookie);

    // A declared navigation is still Lax-eligible — that is the case the
    // attribute exists for, and removing it would be a different bug.
    seen.length = 0;
    await request(session.url + '/page', {
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }
    });
    assert.match(seen[0].cookie, /lax=1/,
      'a declared cross-site top-level navigation lost its Lax cookie: ' + seen[0].cookie);
  });
});

test('SameSite=None without Secure is dropped rather than replayed cross-site', async () => {
  const seen = [];
  await withProxySession(seen, ['loose=1; Path=/; SameSite=None', 'proper=1; Path=/; SameSite=Lax'], async (session) => {
    await request(session.url + '/', {
      headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }
    });

    // Same-origin: the whole jar rides, so anything missing here is missing
    // because it was refused at set time, not filtered at send time.
    seen.length = 0;
    await request(session.url + '/echo', { headers: { 'sec-fetch-site': 'same-origin' } });
    assert.match(seen[0].cookie, /proper=1/, 'the well-formed cookie was lost: ' + seen[0].cookie);
    assert.doesNotMatch(seen[0].cookie, /loose=1/,
      'a SameSite=None cookie with no Secure was kept; a browser rejects it outright, so ' +
      'the bridge would be replaying a cross-site credential the site never managed to set: ' + seen[0].cookie);
  });
});
