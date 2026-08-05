// Round 7 — the round-6 adverse pass. Each test below goes red if its fix is
// reverted; that is the only reason any of them exist.
//
// 1. The plain-HTTP proxy read a MISSING sec-fetch-site as "not cross-site" and
//    attached the Strict cookie jar, then rewrote Origin to the upstream origin
//    on top. Safari before 16.4 and several WebViews omit Fetch Metadata
//    entirely, so a foreign page in one of them could POST to the guessed
//    loopback port and have upstream see an authenticated same-origin request.
//    CORS hides the response; it does not stop the request.
// 2. The drain classified proxy-vs-local by reading a mutable global AFTER an
//    await that can block for timeout_ms, so a concurrent start_grab_session
//    could hand session A's selections session B's protocol.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const bridge = await import('../dist/grab-bridge.js');

async function designMd() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-round7-'));
  const file = path.join(dir, 'DESIGN.md');
  await writeFile(file, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');
  return file;
}

function selection(selector) {
  return {
    projectName: 'fixture',
    selector: selector,
    payload: { selector: selector, tagName: 'H1', styles: { color: 'rgb(255,255,255)' } }
  };
}

// An upstream that hands out a SameSite=Strict session cookie on first contact
// and then records what it is given back. Strict is the interesting one: it is
// the attribute a real site uses for the cookie that authenticates a mutation.
function upstreamWithStrictCookie(seen) {
  return createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie || '' });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': 'session=secret-value; Path=/; SameSite=Strict'
    });
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
}

test('a request with no Fetch Metadata at all never carries the Strict session cookie', async () => {
  const seen = [];
  const upstream = upstreamWithStrictCookie(seen);
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');

    // A legitimate top-level navigation, which is how the jar gets populated.
    await fetch(session.url + '/', {
      headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }
    });
    assert.ok(seen.length >= 1, 'the first navigation never reached upstream');

    // Now the attack: an old-browser page that sends no sec-fetch-* headers at
    // all, POSTing to the guessed loopback port. Sending no Origin either is the
    // strongest form of the case — it is exactly what the old code read as
    // "same-site by absence".
    seen.length = 0;
    await fetch(session.url + '/transfer', { method: 'POST', body: 'amount=1' });
    assert.equal(seen.length, 1, 'the POST did not reach upstream at all');
    assert.equal(seen[0].cookie, '',
      'a metadata-less cross-site POST was given the Strict session cookie: ' + seen[0].cookie);

    // And a foreign Origin must not help either, even with no Fetch Metadata.
    seen.length = 0;
    await fetch(session.url + '/transfer', {
      method: 'POST', body: 'amount=1', headers: { origin: 'http://evil.test' }
    });
    assert.equal(seen[0].cookie, '',
      'a foreign-Origin POST was given the Strict session cookie: ' + seen[0].cookie);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('the proxied page\'s own request still gets its session cookie back', async () => {
  // Without this the fix is a denial of service rather than a boundary: the
  // overlay page is served from the bridge origin and its fetches must work.
  const seen = [];
  const upstream = upstreamWithStrictCookie(seen);
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');
    await fetch(session.url + '/', {
      headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }
    });

    seen.length = 0;
    // No Fetch Metadata, but an Origin that IS the bridge — the shape a same-page
    // fetch takes in a browser too old to send sec-fetch-*.
    await fetch(session.url + '/api/thing', {
      method: 'POST', body: '{}', headers: { origin: session.url }
    });
    assert.match(seen[0].cookie, /session=secret-value/,
      'the proxied page\'s own POST lost its session cookie: ' + JSON.stringify(seen[0]));
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a drain that parked reports the mode of the session it parked on, not the one that replaced it', async () => {
  // The interleaving that matters: a drain with timeout_ms parks for as long as
  // minutes, and a start_grab_session during that window replaces the global the
  // old code consulted afterwards. This is the deterministic form of it — park,
  // swap, let the wait end — and the assertion is on the CLASSIFICATION, not the
  // payload: `count` is 0 here because the replaced session's queue went with
  // it. Read against the reverted fix, proxyMode comes back false, which is the
  // whole defect: a proxied capture handed the local protocol.
  //
  // The immediate-drain path cannot be raced from outside — it returns without
  // ever yielding — so this is the only shape of the bug the public API exposes.
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');
    const draining = bridge.getGrabbedElements(400);
    await new Promise((resolve) => setTimeout(resolve, 50));

    await bridge.startGrabSession(await designMd(), undefined, undefined, 'consumer');
    assert.equal(bridge.isProxyGrabSession(), false, 'the new session should be local');

    const drained = await draining;
    assert.equal(drained.proxyMode, true,
      'a drain that parked on the proxied session was classified by the local one ' +
      'that replaced it — the agent gets told to wait for a batchCommit that cannot arrive');
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('the stdio server carries the proxy exception to its own batchCommit rule, and the remote surface does not', async () => {
  // The standing GRAB instruction tells the agent to wait for a batchCommit on
  // every plain drain. In proxy mode that commit can never arrive, and a
  // server-level instruction outranks a per-call tool result in practice — so
  // the exception has to live at the same level as the rule, or the drain's own
  // wording loses the argument. Local only: the remote surfaces register no grab
  // tools and their instructions are hash-frozen, so this must NOT appear there.
  const indexMod = await import('../dist/index.js');
  const local = indexMod.buildServer({ remote: false }).server._options.instructions;
  const remote = indexMod.buildServer({ remote: true }).server._options.instructions;

  assert.match(local, /proxyMode/,
    'the stdio instructions never mention proxy mode, so the standing "wait for batchCommit" rule stands unqualified');
  assert.match(local, /capture_reference/,
    'the proxy exception does not say what to do instead of waiting');
  assert.doesNotMatch(remote, /proxyMode/,
    'the proxy paragraph leaked onto the remote surface, whose instructions are hash-frozen');
});

test('a local drain reports proxyMode false', async () => {
  try {
    await bridge.startGrabSession(await designMd(), undefined, undefined, 'consumer');
    bridge.queueGrabSelection(selection('h2'));
    const drained = await bridge.getGrabbedElements();
    assert.equal(drained.count, 1);
    assert.equal(drained.proxyMode, false,
      'a local drain claimed proxy mode, which would tell the agent its edits are capture-only');
  } finally {
    await bridge.stopGrabSession();
  }
});
