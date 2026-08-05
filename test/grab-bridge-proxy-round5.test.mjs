// The pattern library's whole premise is grabbing from someone ELSE's site, which
// is always proxy mode — and in proxy mode the bridge deliberately withholds the
// authoring routes, /batch-commit among them. The overlay could not see that. It
// ends every send by posting the commit, got the designed 404 back, and rendered
// the result as a failed send: "Retry send", plus a console error, on a grab that
// had already reached Raven's queue and was durable. The refusal was correct; the
// overlay's reading of it was not.
//
// Found by driving the real overlay in a real browser (test/e2e-pattern-library.mjs),
// not by any module-level check — nothing below the browser can see a UI that
// reports success as failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
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

/** The config object the overlay boots from, read out of the injected script tag. */
function injectedConfig(html) {
  const src = (html.match(/<script src="\/raven-grab\.js\?key=[a-f0-9]+&cfg=([^"]+)"><\/script>/) || [])[1];
  return src ? JSON.parse(decodeURIComponent(src.replace(/&amp;/g, '&'))) : null;
}

/** The capability key, which the session only ever hands back inside its script tag. */
function sessionKey(session) {
  return (session.script_tag.match(/raven-grab\.js\?key=([a-f0-9]+)/) || [])[1];
}

test('a proxied page is told the authoring surface is withheld', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>up</title></head><body>x</body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const session = await grabBridgeMod.startGrabSession(
    await fixtureDesignPath(), undefined, 'http://127.0.0.1:' + upstream.address().port);
  try {
    const html = await (await fetch(session.url + '/')).text();
    const config = injectedConfig(html);
    assert.ok(config, 'the overlay script tag must carry a config: ' + html.slice(0, 300));
    assert.equal(config.authoring, 'withheld',
      'the overlay has to learn this from the bridge — the alternative is inferring it from a 404, ' +
      'which is exactly how a deliberate refusal came to read as a failed send');

    // The flag has to be true where it is set, or it is decoration: the same
    // request must actually be refused.
    const commit = await fetch(session.url + '/batch-commit?key=' + sessionKey(session), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"batchId":"b1"}'
    });
    assert.equal(commit.status, 404, 'and the route it describes must genuinely be withheld');
  } finally {
    await grabBridgeMod.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a local session is NOT capture-only — the authoring half is its whole point', { skip: sandboxNoNetwork ? 'sandbox does not permit loopback listeners' : false }, async () => {
  // The inverse half of the same rule. On the designer's own project the commit
  // is what turns a batch into applied work, so a flag that leaked into local
  // mode would silently disable the feature rather than fix a false error.
  const session = await grabBridgeMod.startGrabSession(await fixtureDesignPath());
  try {
    assert.doesNotMatch(session.script_tag, /authoring/,
      'no authoring flag belongs in a local session: ' + session.script_tag);
    const commit = await fetch(session.url + '/batch-commit?key=' + sessionKey(session), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    // 400 here, not 200 — there is no batch to commit in a bare fixture session.
    // What matters is that the handler ANSWERED: 404 is the withheld-route reply,
    // and it must not appear on the designer's own project.
    assert.notEqual(commit.status, 404, 'and /batch-commit stays served locally');
  } finally {
    await grabBridgeMod.stopGrabSession();
  }
});
