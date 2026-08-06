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
//
// WHAT THIS FILE DOES NOT COVER, stated so the next reader does not assume it
// does. A later adverse pass showed the claim "this suite fails on any incorrect
// replayed header" was too strong: break the ATTRIBUTE split in
// `readCookieAttributes` — `index === -1 ? attribute : attribute.slice(0, index)`
// weakened so a bare attribute yields an empty name — and every test here still
// passes, while round 4 goes red on two. That is not a hole to plug here. This
// suite's upstream is plaintext http, so the attributes whose loss is observable
// (`Secure`, and the `__Secure-`/`__Host-` prefix rules that depend on it) cannot
// be exercised over it at all; a fixture added here to "cover" the attribute
// split would measure nothing, which is the failure mode this file's own
// round-9 rewrite exists to prevent. The attribute split is
// `test/grab-bridge-proxy-round4.test.mjs`'s job, on its https fixtures. This
// file covers the NAME/VALUE split and jar mutation.
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

// ───────────────────────────── Round 15 ─────────────────────────────

test('a Max-Age padded with non-WSP whitespace is invalid, and Expires then wins', async () => {
  // RFC 6265 §5.2 strips leading and trailing **WSP** — SP and HTAB — and nothing
  // else. JavaScript's `.trim()` strips the whole Unicode WhiteSpace set, so
  // `Max-Age=<U+00A0>5` arrived at the digit test as a clean "5": a value the RFC
  // says is INVALID became a valid five-second lifetime, which then SUPPRESSED
  // the `Expires` on the same header and kept a cookie the server had asked to
  // delete. Found by an adverse pass with a live bridge probe, not by reading.
  //
  // The interesting part is that this defect is invisible to the Max-Age tests
  // above AND to the precedence fix that shipped with them — over-trimming makes
  // an invalid value valid, and every existing case feeds the parser a value that
  // is already clean.
  //
  // The pad is written as an ESCAPE rather than a literal. A literal U+00A0 in a
  // source file is one editor normalisation away from becoming an ordinary space
  // - at which point the header is well-formed, the cookie is correctly retained,
  // and this test passes while measuring nothing. NBSP is asserted below for the
  // same reason the conforming-IME test asserts its own fixture.
  const NBSP = '\u00A0';
  assert.equal(NBSP.charCodeAt(0), 0xA0, 'the fixture pad is not U+00A0');

  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) headers['Set-Cookie'] = 'session=live; Path=/; SameSite=Strict';
    // Max-Age must be IGNORED, so the past Expires on the same header applies.
    if (issued === 1) {
      headers['Set-Cookie'] =
        'session=live; Path=/; SameSite=Strict; Max-Age=' + NBSP + '5; ' +
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });   // issues session=live
    await request(session.url + '/nbsp', { headers: SAME_ORIGIN });    // carries it; sends the NBSP header
    await request(session.url + '/after', { headers: SAME_ORIGIN });   // must be logged out

    assert.equal(seen[1].cookie, 'session=live',
      'the control failed — the session cookie was never stored: ' + seen[1].cookie);
    assert.equal(seen[2].cookie, '',
      'a Max-Age padded with U+00A0 was accepted as valid and suppressed the past ' +
      'Expires, so a cookie the server deleted is still being sent. §5.2 strips ' +
      'SP and HTAB only — `.trim()` strips far more: ' + seen[2].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

// ───────────────────────────── Round 16 ─────────────────────────────

test('the cookie NAME/VALUE split trims WSP only, like the attribute split', async () => {
  // Round 15 fixed the ATTRIBUTE split and left the name/value split above it
  // still calling `.trim()`. §5.2 applies WSP-only removal to both: it strips
  // the pair, then each attribute, with the same rule. So `sid=<U+00A0>live`
  // must be stored and replayed with the pad intact — over-trimming here does
  // not just mis-parse a lifetime, it silently RENAMES the site's cookie value,
  // and the bridge then replays a credential the server never issued.
  //
  // §5.2 also does not validate the name as a token, so a non-ASCII pad on the
  // NAME stays part of the name. That is a different cookie, which is exactly
  // what a browser would send.
  const NBSP = '\u00A0';
  assert.equal(NBSP.charCodeAt(0), 0xA0, 'the fixture pad is not U+00A0');

  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) {
      headers['Set-Cookie'] = [
        'sid=' + NBSP + 'live; Path=/; SameSite=Strict',
        NBSP + 'pad=plain; Path=/; SameSite=Strict'
      ];
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });
    await request(session.url + '/replay', { headers: SAME_ORIGIN });

    // Asserted as an EXACT header, not by substring presence. A round-16
    // adverse pass showed why: a replay that emits BOTH the raw pair and a
    // `.trim()`-ed duplicate satisfies every `includes()` check while sending a
    // credential the server never issued. Presence is not the property under
    // test — the exact set of pairs is.
    const replayed = seen[1].cookie;
    assert.equal(replayed, 'sid=' + NBSP + 'live; ' + NBSP + 'pad=plain',
      'the replayed header is not exactly the two pairs the server set. A ' +
      'stripped pad means the bridge invented a value or merged two cookies; an ' +
      'EXTRA pair means it is replaying a credential alongside the real one: ' +
      JSON.stringify(replayed));
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

// ───────────────────────────── Round 17 ─────────────────────────────

test('an Expires that fails RFC 6265 §5.1.1 is ignored, not read as the epoch', async () => {
  // The last `.trim()`-shaped laundering in the cookie path was not a `.trim()`
  // at all — it was `Date.parse`. U+00A0 is a NON-delimiter under §5.1.1, so
  // `<U+00A0>01` is one date-token that matches no production; the day is never
  // found, the cookie-date FAILS to parse, and §5.2.1 says the attribute is
  // ignored — leaving a live session cookie. `Date.parse` tolerates the pad and
  // returns 0, which the jar reads as a past expiry and deletes the session.
  //
  // The second cookie is the control that keeps this honest: a WELL-FORMED past
  // Expires must still delete. Without it, "ignore every Expires" passes.
  const NBSP = '\u00A0';
  assert.equal(NBSP.charCodeAt(0), 0xA0, 'the fixture pad is not U+00A0');

  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) {
      headers['Set-Cookie'] = [
        'kept=yes; Path=/; SameSite=Strict; Expires=Thu, ' + NBSP + '01 Jan 1970 00:00:00 GMT',
        'gone=yes; Path=/; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      ];
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });
    await request(session.url + '/after', { headers: SAME_ORIGIN });

    assert.equal(seen[1].cookie, 'kept=yes',
      'an Expires the RFC says is unparseable was applied anyway, so a malformed ' +
      'header logged the user out — or the well-formed past Expires beside it ' +
      'failed to delete, which would mean Expires is being ignored wholesale: ' +
      JSON.stringify(seen[1].cookie));
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

// ───────────────────────────── Round 18 ─────────────────────────────

test('the NAME/VALUE split trims WSP only at the END as well as the start', async () => {
  // Round 16 fixed the name/value split and round 17 asserted it exactly — but
  // every fixture in both rounds pads the LEADING edge. §5.2 removes WSP from
  // both ends of the name and both ends of the value, so a trailing pad is a
  // separate code path through the same rule, and the round-17 assertion walks
  // straight past it: add `|| value.charCodeAt(end - 1) === 0xa0` to the
  // trailing-trim loop and every existing cookie test stays green while
  // `sid=live<U+00A0>` is stored and replayed as `sid=live`.
  //
  // That is the same harm as the leading case and not a smaller one: the bridge
  // sends upstream a credential the server never issued. Fixing one end of a
  // two-ended rule is the round-16 lesson (one of two call sites) one layer in.
  const NBSP = '\u00A0';
  assert.equal(NBSP.charCodeAt(0), 0xA0, 'the fixture pad is not U+00A0');

  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) {
      headers['Set-Cookie'] = [
        'sid=live' + NBSP + '; Path=/; SameSite=Strict',
        'pad' + NBSP + '=plain; Path=/; SameSite=Strict'
      ];
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });
    await request(session.url + '/replay', { headers: SAME_ORIGIN });

    const replayed = seen[1].cookie;
    assert.equal(replayed, 'sid=live' + NBSP + '; pad' + NBSP + '=plain',
      'a TRAILING U+00A0 was stripped from the cookie name or value, so the ' +
      'bridge is replaying a credential the server never issued — or an extra ' +
      'pair appeared alongside the real one: ' + JSON.stringify(replayed));
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('an Expires naming a day that does not exist fails to parse, and is ignored', async () => {
  // §5.1.1 step 5 checks the day-of-month against 1–31, which is what the RFC
  // says and which is NOT a calendar check: April 31 and February 30 both pass
  // it. Step 6 then says "let the parsed-cookie-date be the date whose [fields]
  // are [the parsed values]. If no such date exists, abort these steps and fail
  // to parse the cookie-date."
  //
  // `Date.UTC` NORMALISES instead of failing — `Date.UTC(2025, 3, 31)` is
  // 2025-05-01 — so a nonexistent date silently became a real one. Any such date
  // in the past deletes a cookie the RFC says to KEEP as a session cookie,
  // because the attribute should have been ignored. Chromium validates the
  // exploded date for the same reason.
  //
  // The second cookie is the control: a well-formed past Expires must still
  // delete, or "ignore every Expires" passes this test.
  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) {
      headers['Set-Cookie'] = [
        // 31 April 2020 does not exist. Un-normalised it is in the past, so a
        // normalising parser deletes this cookie; the RFC keeps it.
        'kept=yes; Path=/; SameSite=Strict; Expires=Thu, 31 Apr 2020 00:00:00 GMT',
        'gone=yes; Path=/; SameSite=Strict; Expires=Wed, 01 Apr 2020 00:00:00 GMT'
      ];
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });
    await request(session.url + '/after', { headers: SAME_ORIGIN });

    assert.equal(seen[1].cookie, 'kept=yes',
      'a cookie-date naming a day that does not exist was normalised into a real ' +
      'one and applied, so a malformed header logged the user out — or the ' +
      'well-formed past Expires beside it failed to delete, which would mean ' +
      'Expires is being ignored wholesale: ' + JSON.stringify(seen[1].cookie));
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a Set-Cookie with no "=" is ignored, not split at character zero', async () => {
  // §5.2 step 1: if the name-value pair contains no `=`, ignore the Set-Cookie
  // header entirely. The guard is `separator <= 0`, which folds two different
  // rejections together — `indexOf` returning -1 (no `=` at all) and returning 0
  // (an empty name). Weaken it to `=== 0` and every existing fixture still
  // passes, because none of them sends a pair without an `=`.
  //
  // The failure is not a dropped cookie, it is an INVENTED one: `flag` with no
  // separator gets stored under a name sliced at -1 and replayed as `fla=flag`,
  // so the bridge sends upstream a credential no server ever set. That is the
  // same harm class as the U+00A0 cases above, reached through the other branch.
  const seen = [];
  let issued = 0;
  const upstream = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie || '' });
    const headers = { 'Content-Type': 'text/html; charset=utf-8' };
    if (issued === 0) {
      headers['Set-Cookie'] = [
        'flag; Path=/; SameSite=Strict',          // no `=` at all: must be ignored
        '=orphan; Path=/; SameSite=Strict',       // empty name: must be ignored
        'real=yes; Path=/; SameSite=Strict'       // the control: must be kept
      ];
    }
    issued += 1;
    res.writeHead(200, headers);
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    await request(session.url + '/login', { headers: SAME_ORIGIN });
    await request(session.url + '/replay', { headers: SAME_ORIGIN });

    assert.equal(seen[1].cookie, 'real=yes',
      'a Set-Cookie with no "=" (or an empty name) was stored and replayed — the ' +
      'bridge is sending upstream a credential the server never set. The control ' +
      'cookie must survive, or the header is being ignored wholesale: ' +
      JSON.stringify(seen[1].cookie));
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
