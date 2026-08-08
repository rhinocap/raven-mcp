// Two generations of one rule live in this file's history. Round 5 originally
// pinned "proxying implies capture-only" after the real overlay (driven in a
// real browser by test/e2e-pattern-library.mjs) rendered the bridge's designed
// /batch-commit 404 as a failed send. The overlay now learns the intent from
// the injected `authoring` flag instead of inferring it from a status code.
//
// The rule itself then narrowed (2026-08-07): capture-only is a property of a
// THIRD-PARTY upstream, not of proxying. A proxy of the designer's OWN
// loopback dev server keeps the full authoring surface — the trust boundary is
// identical to a script-tag local session, and withholding authoring there
// silently killed drag, layers, templates, and commits in the standard
// proxy-the-preview flow (Andrew's "drag wasn't working" report). ONE function
// owns the judgment: proxyCaptureOnly in src/grab-bridge.ts — hostname LITERAL
// against the three loopback spellings, never DNS.
//
// Trigger-set diff for that narrowing: the withheld direction did NOT go away,
// it moved to upstreams that are genuinely non-loopback — which is why the
// withheld tests here run against a STUBBED non-loopback origin (round 4's
// pattern: swap globalThis.fetch, assert on what the bridge decided). The old
// fixture for the withheld case WAS loopback, the one place where the old rule
// and the new rule disagree, so keeping it would have flipped the test rather
// than preserved the trigger.
//
// Measured mutant matrix for the narrowing (string edits on dist/grab-bridge.js,
// clean baseline first, per-mutant import load-check, string-verified restores;
// radii over proxy rounds 2/5/7 + grab-bridge.test.mjs, 299 tests):
//   - proxyCaptureOnly answers true for every parseable host (the old rule)
//       -> TWO red: the loopback grant and the [::1] spelling — exactly the
//          tests that exist because the two generations disagree there.
//   - weaken the localhost check to endsWith("localhost")
//       -> exactly the foo.localhost test red.
//   - derive the drain's captureOnly from proxyMode
//       -> exactly the loopback test red: its drain is the one place the two
//          fields must diverge (proxyMode true, captureOnly false).
//   - the loopback branch serves bridge routes UN-keyed (bridgeRoute = true)
//       -> TWO red: round 2's un-keyed /layers collision and this file's
//          un-keyed /components forwarding — the key requirement is what keeps
//          the proxied app's own routes reachable through the grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer, request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandboxNoNetwork = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.resolve(__dirname, '../browser/raven-grab.js');

const grabBridgeMod = await import(path.resolve(__dirname, '../dist/grab-bridge.js'));

async function fixtureDesignPath() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-r5-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\nname: "Round 5 Fixture"\n---\n# Fixture\n', 'utf8');
  return designPath;
}

// node:http, not fetch — the stubbed-upstream tests replace globalThis.fetch to
// impersonate the upstream, so the test's own requests to the bridge must not
// travel through the thing being stubbed.
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

/** The config object the overlay boots from, read out of the injected script tag. */
function injectedConfig(html) {
  const src = (html.match(/<script src="\/raven-grab\.js\?key=[a-f0-9]+&cfg=([^"]+)"><\/script>/) || [])[1];
  return src ? JSON.parse(decodeURIComponent(src.replace(/&amp;/g, '&'))) : null;
}

/** The capability key, which the session only ever hands back inside its script tag. */
function sessionKey(session) {
  return (session.script_tag.match(/raven-grab\.js\?key=([a-f0-9]+)/) || [])[1];
}

const PAGE = '<!doctype html><html><head><title>up</title></head><body>x</body></html>';

// The upstream never exists: the point is what the bridge DECIDES about the
// origin string, and a stub records nothing here because these tests assert on
// the bridge's own outputs (config, routes, session fields, drain).
async function withStubbedUpstream(origin, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    return new Response(PAGE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  const session = await grabBridgeMod.startGrabSession(await fixtureDesignPath(), undefined, origin);
  try {
    return await fn(session);
  } finally {
    globalThis.fetch = originalFetch;
    await grabBridgeMod.stopGrabSession();
  }
}

test('a THIRD-PARTY proxied page is told the authoring surface is withheld', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  await withStubbedUpstream('https://fixture.test', async (session) => {
    const html = (await request(session.url + '/')).body;
    const config = injectedConfig(html);
    assert.ok(config, 'the overlay script tag must carry a config: ' + html.slice(0, 300));
    assert.equal(config.authoring, 'withheld',
      'the overlay has to learn this from the bridge — the alternative is inferring it from a 404, ' +
      'which is exactly how a deliberate refusal came to read as a failed send');

    // The flag has to be true where it is set, or it is decoration: the same
    // request must actually be refused.
    const commit = await request(session.url + '/batch-commit?key=' + sessionKey(session), { method: 'POST' });
    assert.equal(commit.status, 404, 'and the route it describes must genuinely be withheld');

    // The watcher is part of the withheld surface: no wait_url means the agent
    // protocol cannot park on a commit that can never arrive.
    assert.equal(session.wait_url, '', 'no watcher on a third-party proxy');
    assert.equal(session.watch_command, '', 'no watch command on a third-party proxy');
    assert.match(String(session.warning || ''), /capture-only/,
      'the session warning is the agent-side copy of the same rule');

    // And the drain says so in-band: captureOnly is the field the agent
    // protocol keys on, pinned to the session the selections came from.
    const drained = await grabBridgeMod.getGrabbedElements();
    assert.equal(drained.proxyMode, true);
    assert.equal(drained.captureOnly, true);
  });
});

test('a subdomain of localhost is NOT loopback — foo.localhost stays capture-only', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The judgment is an exact hostname match, not a suffix rule. `foo.localhost`
  // resolves to 127.0.0.1 on many systems, but the literal the caller typed is
  // a NAME, and names are what DNS rebinding plays with — the same reason the
  // Host check (round 8) refuses names. A suffix rule here (endsWith
  // "localhost") would hand the authoring surface to any origin that dresses
  // itself in the right suffix.
  await withStubbedUpstream('http://foo.localhost:5173', async (session) => {
    const config = injectedConfig((await request(session.url + '/')).body);
    assert.ok(config, 'the overlay script tag must carry a config');
    assert.equal(config.authoring, 'withheld', 'foo.localhost is a name, not the designer\'s own server');
  });
});

test('a LOOPBACK proxy keeps the full authoring surface', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // Andrew's actual flow: "previews ship with Raven up" proxies his own dev
  // server through the bridge, so this session shape is where drag, layers,
  // templates, and commits actually run. A real upstream, not a stub — the
  // granted direction should exercise the same wire path a designer does.
  const upstream = createServer((req, res) => {
    if (req.url === '/components') {
      // Marker for the un-keyed forwarding assertion below.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"upstream":"owns this route"}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const session = await grabBridgeMod.startGrabSession(
    await fixtureDesignPath(), undefined, 'http://127.0.0.1:' + upstream.address().port);
  try {
    const html = await (await fetch(session.url + '/')).text();
    const config = injectedConfig(html);
    assert.ok(config, 'the overlay script tag must carry a config: ' + html.slice(0, 300));
    assert.ok(!('authoring' in config),
      'a loopback proxy carries NO authoring flag at all — the overlay must be indistinguishable ' +
      'from a script-tag local session, where the flag has never existed: ' + JSON.stringify(config));

    // The commit route answers. 400 here, not 200 — there is no batch to commit
    // in a bare fixture session. What matters is that the handler ANSWERED:
    // 404 is the withheld-route reply, and it must not appear on the
    // designer's own server.
    const key = sessionKey(session);
    const commit = await fetch(session.url + '/batch-commit?key=' + key, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"batchId":"b1"}'
    });
    assert.notEqual(commit.status, 404, '/batch-commit is served on a loopback proxy');

    // The key requirement survives the grant: /components is an ordinary path
    // the proxied app may own, so an UN-keyed request is not Raven's and must
    // forward upstream instead of being answered by the bridge.
    const unkeyed = await fetch(session.url + '/components');
    assert.equal(await unkeyed.text(), '{"upstream":"owns this route"}',
      'an un-keyed request for a bridge-owned path forwards to the proxied app');

    // The watcher is served: the agent parks on /agent/wait and the commit IS
    // coming, exactly as in a local session.
    assert.match(session.wait_url, /\/agent\/wait\?key=/, 'loopback proxy gets the watcher');
    assert.notEqual(session.watch_command, '', 'and the watch command that drives it');
    assert.match(String(session.warning || ''), /full authoring surface/,
      'the warning names the grant so the agent protocol reads wait-for-commit');

    // And the drain protocol agrees: proxyMode says HOW the page is served,
    // captureOnly says whether a batchCommit can arrive. They must diverge
    // here — collapsing them is the exact defect this round fixed.
    const drained = await grabBridgeMod.getGrabbedElements();
    assert.equal(drained.proxyMode, true, 'a loopback proxy is still a proxy');
    assert.equal(drained.captureOnly, false, 'but its commit is coming — wait for it');
  } finally {
    await grabBridgeMod.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('the [::1] loopback spelling is granted too', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // Vite on an IPv6-first machine prints http://[::1]:5173/. Stubbed rather
  // than a real IPv6 listener so the test does not depend on the host having
  // IPv6 loopback at all — the decision under test is about the LITERAL.
  await withStubbedUpstream('http://[::1]:5173', async (session) => {
    const config = injectedConfig((await request(session.url + '/')).body);
    assert.ok(config, 'the overlay script tag must carry a config');
    assert.ok(!('authoring' in config), '[::1] is the designer\'s own machine: ' + JSON.stringify(config));
  });
});

test('a local session is NOT capture-only — the authoring half is its whole point', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The inverse half of the same rule, unchanged across both generations. On
  // the designer's own project the commit is what turns a batch into applied
  // work, so a flag that leaked into local mode would silently disable the
  // feature rather than fix a false error.
  const session = await grabBridgeMod.startGrabSession(await fixtureDesignPath());
  try {
    assert.doesNotMatch(session.script_tag, /authoring/,
      'no authoring flag belongs in a local session: ' + session.script_tag);
    const commit = await fetch(session.url + '/batch-commit?key=' + sessionKey(session), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.notEqual(commit.status, 404, 'and /batch-commit stays served locally');
    const drained = await grabBridgeMod.getGrabbedElements();
    assert.equal(drained.proxyMode, false);
    assert.equal(drained.captureOnly, false);
  } finally {
    await grabBridgeMod.stopGrabSession();
  }
});
