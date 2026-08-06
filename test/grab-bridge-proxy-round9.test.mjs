// Round 9 — one gap the round-8 adverse pass found by mutation rather than by
// reading: the cookie jar is never observed CHANGING.
//
// Round 8 deliberately seeds `Set-Cookie` on the first response only, because
// re-populating the jar on every response destroys every "the cookie was absent"
// assertion in that file. That fix is right, and it has a cost nobody noticed:
// with only one cookie event in the whole suite, nothing measures what happens
// to the SECOND one. Make `storeProxyCookies` ignore every `Set-Cookie` after
// the jar first becomes non-empty and every existing proxy test still passes —
// while session rotation, logout, and privilege changes are all silently broken
// upstream. A logged-out user would keep sending the dead session cookie, and a
// re-authenticated one would keep sending the pre-escalation cookie forever.
//
// So this file is the opposite fixture from round 8's: the upstream rotates
// deliberately, and the assertions are on the jar tracking it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const bridge = await import('../dist/grab-bridge.js');

async function designMd() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-round9-'));
  const file = path.join(dir, 'DESIGN.md');
  await writeFile(file, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');
  return file;
}

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

const SAME_ORIGIN = {
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document'
};

// An upstream that hands out a DIFFERENT session value on each of the first
// three responses, then stops. Every request is recorded with what it carried.
function rotatingUpstream(seen) {
  const values = ['first', 'second', 'third'];
  let issued = 0;
  return createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued < values.length) {
      headers['Set-Cookie'] = 'session=' + values[issued] + '; Path=/; SameSite=Strict';
      issued += 1;
    }
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
}

test('the jar tracks a rotated session cookie instead of pinning the first one', async () => {
  const seen = [];
  const upstream = rotatingUpstream(seen);
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    // 1st: jar empty, upstream issues session=first.
    await request(session.url + '/a', { headers: SAME_ORIGIN });
    // 2nd: carries session=first, upstream rotates to session=second.
    await request(session.url + '/b', { headers: SAME_ORIGIN });
    // 3rd: carries session=second, upstream rotates to session=third.
    await request(session.url + '/c', { headers: SAME_ORIGIN });
    // 4th: carries session=third, upstream issues nothing further.
    await request(session.url + '/d', { headers: SAME_ORIGIN });

    assert.equal(seen.length, 4, 'not every request reached upstream');
    assert.equal(seen[0].cookie, '',
      'the first request carried a cookie before upstream had issued one');
    assert.equal(seen[1].cookie, 'session=first',
      'the jar did not store the first Set-Cookie at all: ' + seen[1].cookie);
    assert.equal(seen[2].cookie, 'session=second',
      'the jar kept sending the ORIGINAL session cookie after upstream rotated it. ' +
      'A logged-out user keeps presenting a dead session and a re-authenticated one ' +
      'keeps presenting the pre-escalation cookie: ' + seen[2].cookie);
    assert.equal(seen[3].cookie, 'session=third',
      'the jar stopped tracking after the second rotation: ' + seen[3].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a cookie deleted by upstream stops being sent', async () => {
  // The other half of rotation, and the one that matters on logout. Expiring a
  // cookie is spelled as a Set-Cookie with a past date, so a jar that only ever
  // ADDS will keep presenting a session the server has explicitly killed.
  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict';
    if (issued === 1) headers['Set-Cookie'] = 'session=; Path=/; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });   // issues session=live
    await request(session.url + '/page', { headers: SAME_ORIGIN });    // carries it; server logs out
    await request(session.url + '/after', { headers: SAME_ORIGIN });   // must carry nothing

    assert.equal(seen[1].cookie, 'session=live',
      'the control failed — the session cookie was never stored, so the assertion ' +
      'below would pass against a jar that stores nothing at all: ' + seen[1].cookie);
    assert.equal(seen[2].cookie, '',
      'a cookie that upstream expired is still being sent, so a logged-out session ' +
      'keeps presenting its credential: ' + seen[2].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a cookie deleted with Max-Age=0 stops being sent', async () => {
  // The OTHER spelling of logout, and the one round 11's adverse pass found
  // uncovered. RFC 6265 gives two ways to delete a cookie and real sites are
  // split between them; the test above only uses `Expires` in the past. Narrow
  // the Max-Age parse at src/grab-bridge.ts to `seconds > 0` — a plausible
  // "ignore nonsense values" edit — and the Expires deletion above, the rotation
  // test, and round 2's `Max-Age=1` liveness check all stay green while every
  // `Max-Age=0` logout on the internet silently leaves the session cookie in the
  // jar. Max-Age also OUTRANKS Expires, so a site that sends both is not covered
  // by the Expires case at all.
  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict';
    if (issued === 1) headers['Set-Cookie'] = 'session=; Path=/; SameSite=Strict; Max-Age=0';
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });   // issues session=live
    await request(session.url + '/page', { headers: SAME_ORIGIN });    // carries it; server logs out
    await request(session.url + '/after', { headers: SAME_ORIGIN });   // must carry nothing

    assert.equal(seen[1].cookie, 'session=live',
      'the control failed — the session cookie was never stored, so the assertion ' +
      'below would pass against a jar that stores nothing at all: ' + seen[1].cookie);
    assert.equal(seen[2].cookie, '',
      'a cookie deleted with Max-Age=0 is still being sent, so the most common ' +
      'logout spelling leaves the credential in the jar: ' + seen[2].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a NEGATIVE Max-Age deletes, and a malformed one is ignored', async () => {
  // Two more values RFC 6265 §5.2.2 separates and `Number()` does not, both found
  // by an adverse pass that mutated the `Max-Age=0` fix rather than reading it.
  //
  //   * `Max-Age=-1` — a VALID non-positive value, so it deletes. Narrow the
  //     parse to `seconds >= 0` and the zero test above, the Expires test, the
  //     rotation test and round 2's `Max-Age=1` all stay green while a whole
  //     class of real logout headers stops working.
  //   * `Max-Age=` — INVALID, because the first character is neither a digit nor
  //     "-", so the attribute must be ignored and the cookie left alone.
  //     `Number("")` is 0, so the old parse read it as a deletion — a malformed
  //     header silently destroying a live session.
  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict';
    if (issued === 1) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict; Max-Age=';
    if (issued === 2) headers['Set-Cookie'] = 'session=; Path=/; SameSite=Strict; Max-Age=-1';
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });     // issues session=live
    await request(session.url + '/malformed', { headers: SAME_ORIGIN }); // carries it; sends `Max-Age=`
    await request(session.url + '/still-in', { headers: SAME_ORIGIN });  // must STILL carry it
    await request(session.url + '/after', { headers: SAME_ORIGIN });     // logged out via Max-Age=-1

    assert.equal(seen[1].cookie, 'session=live',
      'the control failed — the session cookie was never stored: ' + seen[1].cookie);
    assert.equal(seen[2].cookie, 'session=live',
      'a malformed `Max-Age=` destroyed a live session. RFC 6265 §5.2.2 says an ' +
      'unparseable value means IGNORE the attribute, not expire the cookie: ' + seen[2].cookie);
    assert.equal(seen[3].cookie, '',
      'a cookie deleted with a negative Max-Age is still being sent: ' + seen[3].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

// ───────────────────────────── Round 14 ─────────────────────────────

test('a trailing-garbage Max-Age is ignored, and an overflowing one still beats Expires', async () => {
  // Two more §5.2.2/§5.3 cases an adverse pass found after round 13, both of
  // which every existing cookie test passes through without noticing:
  //
  //   * `Max-Age=5junk` — INVALID. The old anchor was `/^-?\d+$/` which does
  //     reject it, but the pass pointed out that a plausible weakening to
  //     `/^-?\d+/` (drop the `$`) reads it as 5 seconds and every other test
  //     stays green. This is the test that makes the anchor load-bearing.
  //   * A 400-digit Max-Age sent alongside a PAST `Expires`. `Number()` of it is
  //     Infinity, the old parse dropped the attribute for being unrepresentable,
  //     and the Expires branch — which only ran when Max-Age had set nothing —
  //     then deleted a cookie the server had just asked to keep effectively
  //     forever. §5.3 gives Max-Age precedence over Expires whenever it is
  //     SYNTACTICALLY valid; representability is a separate question and the
  //     answer to it is to clamp, not to discard.
  const seen = [];
  let issued = 0;
  const forever = '9'.repeat(400);
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict';
    // Trailing garbage: must be ignored, so `session=live` survives untouched.
    if (issued === 1) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict; Max-Age=5junk';
    // Overflowing Max-Age with a long-past Expires on the same header.
    if (issued === 2) {
      headers['Set-Cookie'] =
        'session=live; Path=/; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=' + forever;
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });     // issues session=live
    await request(session.url + '/garbage', { headers: SAME_ORIGIN });   // carries it; sends Max-Age=5junk
    await request(session.url + '/overflow', { headers: SAME_ORIGIN });  // must STILL carry it
    await request(session.url + '/after', { headers: SAME_ORIGIN });     // must STILL carry it

    assert.equal(seen[1].cookie, 'session=live',
      'the control failed — the session cookie was never stored: ' + seen[1].cookie);
    assert.equal(seen[2].cookie, 'session=live',
      '`Max-Age=5junk` was read as a value instead of being ignored. §5.2.2 ' +
      'requires the WHOLE value to be digits: ' + seen[2].cookie);
    assert.equal(seen[3].cookie, 'session=live',
      'an overflowing but syntactically valid Max-Age was discarded, and the past ' +
      'Expires on the same header then deleted the cookie. §5.3 gives Max-Age ' +
      'precedence — clamp the magnitude, do not drop the attribute: ' + seen[3].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
