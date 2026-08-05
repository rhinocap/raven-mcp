// Round 6 — the two defects the round-5 adverse pass found.
//
// 1. The drain told the agent to wait for a batchCommit marker even in proxy
//    mode, where start_grab_session had just said none is coming and where the
//    bridge withholds the route that would produce one. An agent that believes
//    it waits forever, and the capture is never kept.
// 2. WebSocket upgrades attached the session cookie jar to every handshake on
//    the grounds that a socket opened from the proxied page is same-site "by
//    construction". A WebSocket open is not subject to CORS, so any page can
//    dial the loopback port and have the bridge forward SameSite=Strict cookies
//    upstream on its behalf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect } from 'node:net';

process.env.RAVEN_NO_USAGE_LOG = '1';

const bridge = await import('../dist/grab-bridge.js');

async function designMd() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-round6-'));
  const file = path.join(dir, 'DESIGN.md');
  await writeFile(file, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');
  return file;
}

// A selection shaped like the overlay's, minimal but real enough to drain.
function selection() {
  return {
    projectName: 'fixture',
    selector: 'h1',
    payload: { selector: 'h1', tagName: 'H1', styles: { color: 'rgb(255,255,255)' } }
  };
}

test('a proxied drain tells the agent to keep the capture, not to wait for a commit', async () => {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body><h1>up</h1></body></html>');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');
    assert.equal(bridge.isProxyGrabSession(), true, 'a proxy session must report itself as one');
    bridge.queueGrabSelection(selection());
    const drained = await bridge.getGrabbedElements();
    assert.equal(drained.count, 1);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('a local session still reports itself as non-proxied', async () => {
  try {
    await bridge.startGrabSession(await designMd(), undefined, undefined, 'consumer');
    assert.equal(bridge.isProxyGrabSession(), false,
      'a local session must not take the capture-only drain protocol');
  } finally {
    await bridge.stopGrabSession();
  }
});

// Raw handshake rather than a WebSocket client: the point is what the bridge does
// with an Origin header, and a client library would refuse to send a forged one.
function handshake(port, origin) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1', () => {
      const lines = [
        'GET /socket HTTP/1.1',
        'Host: 127.0.0.1:' + port,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: ' + Buffer.from('0123456789abcdef').toString('base64'),
        'Sec-WebSocket-Version: 13'
      ];
      if (origin) lines.push('Origin: ' + origin);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
    });
    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString('utf8'); });
    socket.on('close', () => resolve({ closed: true, data }));
    socket.on('error', () => resolve({ closed: true, data }));
    setTimeout(() => { socket.destroy(); resolve({ closed: false, data }); }, 1500);
  });
}

test('a WebSocket upgrade from a foreign origin never reaches upstream', async () => {
  const seen = [];
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body>up</body></html>');
  });
  upstream.on('upgrade', (req, socket) => {
    seen.push({ origin: req.headers.origin || '', cookie: req.headers.cookie || '' });
    socket.destroy();
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  try {
    const session = await bridge.startGrabSession(await designMd(), undefined, upstreamUrl, 'consumer');
    const bridgePort = Number(new URL(session.url).port);

    await handshake(bridgePort, 'http://evil.test');
    assert.deepEqual(seen, [],
      'an attacker-origin upgrade was proxied upstream: ' + JSON.stringify(seen));

    // The legitimate case must still work, or this is a denial of service rather
    // than a fix — the overlay's own page is served from the bridge origin.
    await handshake(bridgePort, 'http://127.0.0.1:' + bridgePort);
    assert.equal(seen.length, 1,
      'the proxied page\'s own WebSocket was rejected: ' + JSON.stringify(seen));
    assert.equal(seen[0].origin, 'http://127.0.0.1:' + bridgePort);
  } finally {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
