/**
 * Phase 3 hosted-browser gate tests.
 *
 * Runs after `npm run build`. The remote server branch is exercised in a child
 * process because `setRemoteRuntime()` is intentionally process-global and
 * one-way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  REMOTE_URL_GUARD_MESSAGE,
  isPrivateOrInternalAddress,
  remoteRequestShouldAbort,
  remoteUrlGuardError,
} from '../dist/remote-url-guard.js';
import { validateAndResolve } from '../dist/browser-launch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

function runChild(snippet) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', snippet], {
    env: { ...process.env },
    encoding: 'utf8',
  });
}

test('egress proxy validation rejects private literals without resolving DNS', async () => {
  let calls = 0;
  const result = await validateAndResolve('169.254.169.254', 80, async () => {
    calls++;
    return [{ address: '93.184.216.34' }];
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(calls, 0);
});

test('egress proxy validation accepts public literals with the same vetted IP', async () => {
  let calls = 0;
  const result = await validateAndResolve('93.184.216.34', 443, async () => {
    calls++;
    return [{ address: '169.254.169.254' }];
  });

  assert.deepEqual(result, { ok: true, address: '93.184.216.34' });
  assert.equal(calls, 0);
});

test('egress proxy validation accepts public hostnames using exactly one DNS lookup', async () => {
  let calls = 0;
  const result = await validateAndResolve('public.evil.test', 443, async (host) => {
    calls++;
    assert.equal(host, 'public.evil.test');
    return [{ address: '93.184.216.34' }];
  });

  assert.deepEqual(result, { ok: true, address: '93.184.216.34' });
  assert.equal(calls, 1);
});

test('egress proxy validation rejects hostnames that resolve to private addresses', async () => {
  let calls = 0;
  const result = await validateAndResolve('internal.evil.test', 80, async (host) => {
    calls++;
    assert.equal(host, 'internal.evil.test');
    return [{ address: '169.254.169.254' }];
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(calls, 1);
});

test('egress proxy validation reuses the single vetted DNS result for the connect IP', async () => {
  let calls = 0;
  const result = await validateAndResolve('rebinding.evil.test', 443, async (host) => {
    calls++;
    assert.equal(host, 'rebinding.evil.test');
    if (calls === 1) {
      return [{ address: '93.184.216.34' }];
    }
    return [{ address: '169.254.169.254' }];
  });

  assert.deepEqual(result, { ok: true, address: '93.184.216.34' });
  assert.equal(calls, 1);
});

test('remote URL guard rejects local/private/internal URL inputs and accepts a public URL', async () => {
  const blocked = [
    'file:///etc/passwd',
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:9001',
    'http://localhost',
    'http://2130706433/',
    'http://[::1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://10.0.0.1/',
    'http://127.0.0.1.nip.io/',
  ];

  for (const url of blocked) {
    assert.equal(await remoteUrlGuardError(url), REMOTE_URL_GUARD_MESSAGE, url);
  }

  assert.equal(await remoteUrlGuardError('https://example.com'), null);
});

test('IP range predicate covers private IPv4, IPv4-mapped IPv6, and public addresses', () => {
  assert.equal(isPrivateOrInternalAddress('127.0.0.1'), true);
  assert.equal(isPrivateOrInternalAddress('169.254.169.254'), true);
  assert.equal(isPrivateOrInternalAddress('::1'), true);
  assert.equal(isPrivateOrInternalAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrInternalAddress('::ffff:a9fe:a9fe'), true);
  assert.equal(isPrivateOrInternalAddress('::ffff:169.254.169.254'), true);
  assert.equal(isPrivateOrInternalAddress('::ffff:7f00:1'), true);
  assert.equal(isPrivateOrInternalAddress('::ffff:0a00:1'), true);
  assert.equal(isPrivateOrInternalAddress('64:ff9b::a9fe:a9fe'), true);
  assert.equal(isPrivateOrInternalAddress('64:ff9b::169.254.169.254'), true);
  assert.equal(isPrivateOrInternalAddress('::a9fe:a9fe'), true);
  assert.equal(isPrivateOrInternalAddress('::169.254.169.254'), true);
  assert.equal(isPrivateOrInternalAddress('8.8.8.8'), false);
  assert.equal(isPrivateOrInternalAddress('::ffff:8.8.8.8'), false);
  assert.equal(isPrivateOrInternalAddress('::ffff:0808:0808'), false);
  assert.equal(isPrivateOrInternalAddress('64:ff9b::8.8.8.8'), false);
  assert.equal(isPrivateOrInternalAddress('2606:4700:4700::1111'), false);
});

test('remote request route guard aborts DNS-resolved private targets and fails closed', async () => {
  const fake = async (host) => {
    if (host === 'public.evil.test') {
      return [{ address: '93.184.216.34' }];
    }
    if (host === 'internal.evil.test') {
      return [{ address: '169.254.169.254' }];
    }
    if (host === 'example.com') {
      return [{ address: '93.184.216.34' }];
    }
    throw new Error('unexpected host: ' + host);
  };

  assert.equal(await remoteRequestShouldAbort('http://internal.evil.test/latest/meta-data/', fake), true);
  assert.equal(await remoteRequestShouldAbort('https://public.evil.test/', fake), false);
  assert.equal(await remoteRequestShouldAbort('http://169.254.169.254/latest/meta-data/', fake), true);
  assert.equal(await remoteRequestShouldAbort('http://whatever.test/', async () => {
    throw new Error('SERVFAIL');
  }), true);

  const mustNotResolve = async () => {
    throw new Error('resolve should not be called');
  };
  assert.equal(await remoteRequestShouldAbort('data:text/html,<h1>x', mustNotResolve), false);
  assert.equal(await remoteRequestShouldAbort('about:blank', mustNotResolve), false);
  assert.equal(await remoteRequestShouldAbort('blob:https://example.com/uuid', mustNotResolve), false);
  assert.equal(await remoteRequestShouldAbort('https://example.com/', fake), false);
});

test('remote server registers the 5 browser tools and URL-guards them before launch', () => {
  const indexUrl = JSON.stringify(pathToImport('index.js'));

  const out = runChild(
    `import { buildServer } from ${indexUrl};
     import { Client } from '@modelcontextprotocol/sdk/client/index.js';
     import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
     const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
     const server = buildServer({ remote: true });
     const client = new Client({ name: 'remote-browser-gate-test', version: '1.0.0' }, { capabilities: {} });
     await server.connect(serverTransport);
     await client.connect(clientTransport);
     const listed = await client.listTools();
     const required = ['audit_url', 'audit_contrast', 'audit_tap_targets', 'audit_responsive_visibility', 'audit_video_playback'];
     const names = listed.tools.map(t => t.name);
     const calls = [];
     for (const name of required) {
       calls.push(await client.callTool({ name, arguments: { url: 'http://127.0.0.1:9001' } }));
     }
     await client.close();
     await server.close();
     console.log(JSON.stringify({ names, calls }));`
  );

  const result = JSON.parse(out.trim().split('\n').pop());
  const required = ['audit_url', 'audit_contrast', 'audit_tap_targets', 'audit_responsive_visibility', 'audit_video_playback'];
  for (const name of required) {
    assert.equal(result.names.includes(name), true, `${name} should be remote-registered`);
  }
  assert.equal(result.names.length, 45, 'remote tools/list should expose 45 tools after Phase 3 gate flip');

  // audit_url is the one exception and it is asserted SEPARATELY rather than loosened
  // into the loop: its `url` is in REMOTE_ARG_GUARDS, so the hosted build declines every
  // call outright (it was measured at 95s at its cheapest configuration, past any hosted
  // client's deadline) and the private-URL guard downstream is never reached. Reading
  // this through a real MCP client is what says the decline is on the SHIPPING path, and
  // asserting the URL-guard message is ABSENT here while REQUIRED for the other four is
  // what says the guard is keyed per tool rather than blanket-refusing the browser set.
  for (let i = 0; i < required.length; i++) {
    const call = result.calls[i];
    assert.equal(call.isError, true);
    if (required[i] === 'audit_url') {
      assert.match(call.content[0].text, /audit_url is disabled on the hosted \(remote\) endpoint/);
      assert.match(call.content[0].text, /raven-mcp/, 'the decline must name the local route out');
      assert.doesNotMatch(call.content[0].text, /hosted endpoint only audits public http\(s\) URLs/,
        'the arg guard runs first, so the URL guard must never answer for audit_url');
    } else {
      assert.match(call.content[0].text, /hosted endpoint only audits public http\(s\) URLs/);
      assert.doesNotMatch(call.content[0].text, /audit_url is disabled/,
        'the audit_url decline must not leak onto another tool');
    }
  }
});

function pathToImport(file) {
  return new URL('file://' + path.join(distDir, file)).href;
}
