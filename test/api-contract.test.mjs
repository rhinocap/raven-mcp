import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distApiContract = path.resolve(__dirname, '../dist/api-contract.js');

let validateShape;
let getPath;
let runApiContract;

try {
  const mod = await import(distApiContract);
  validateShape = mod.validateShape;
  getPath = mod.getPath;
  runApiContract = mod.runApiContract;
} catch (err) {
  const msg = `dist/api-contract.js not found — run \`npm run build\` first. (${err.message})`;
  test('api-contract module available', (t) => { t.skip(msg); });
  process.exit(0);
}

if (
  typeof validateShape !== 'function' ||
  typeof getPath !== 'function' ||
  typeof runApiContract !== 'function'
) {
  test('api-contract exports available', (t) => {
    t.skip('validateShape, getPath, or runApiContract not exported from dist/api-contract.js.');
  });
  process.exit(0);
}

test('getPath and validateShape handle required paths and type mismatches', () => {
  const payload = {
    a: [{ b: 'value' }],
    profile: { name: 'Raven' },
    items: [{ id: 'item-1' }],
  };

  assert.strictEqual(getPath(payload, 'a.0.b'), 'value');

  assert.strictEqual(
    validateShape(payload, { required: ['profile.name'] }).valid,
    true,
  );

  assert.strictEqual(
    validateShape(payload, { required: ['profile.missing'] }).valid,
    false,
  );

  assert.strictEqual(
    validateShape(payload, { types: { items: 'object' } }).valid,
    false,
    'array should not validate as object',
  );

  assert.strictEqual(
    validateShape(payload, { types: { profile: 'array' } }).valid,
    false,
    'object should not validate as array',
  );

  assert.strictEqual(
    validateShape(payload, { types: { 'profile.name': 'object' } }).valid,
    false,
    'string should not validate as object',
  );
});

test('runApiContract classifies valid, wrong, invalid, and uncertain queries', async () => {
  const server = http.createServer((req, res) => {
    const response = apiResponse(req.method || 'GET', req.url || '/');
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response.body));
  });

  const started = await tryListen(server);
  const originalFetch = globalThis.fetch;
  let baseUrl;

  if (started.ok) {
    const address = server.address();
    assert.ok(address && typeof address === 'object', 'server address is available');
    baseUrl = `http://127.0.0.1:${address.port}`;
  } else if (started.error && started.error.code === 'EPERM') {
    baseUrl = 'http://raven-contract-test.local';
    globalThis.fetch = async function fetchFromInProcessServer(input, init = {}) {
      const url = new URL(String(input));
      if (url.origin !== baseUrl) {
        return originalFetch(input, init);
      }

      const response = apiResponse(init.method || 'GET', url.pathname);
      return new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  } else {
    throw started.error;
  }

  try {
    const schema = {
      required: ['ok', 'profile.name', 'items.0.id'],
      types: {
        ok: 'boolean',
        profile: 'object',
        'profile.name': 'string',
        items: 'array',
        'items.0': 'object',
        'items.0.id': 'string',
      },
    };

    const result = await runApiContract(
      baseUrl,
      [
        { name: 'valid shape', path: '/' },
        {
          name: 'wrong expectation',
          path: '/',
          expect: { equals: { 'profile.name': 'Not Raven' } },
        },
        { name: 'bad shape', path: '/bad' },
        { name: 'server error', path: '/error' },
      ],
      schema,
    );

    const verdicts = Object.fromEntries(
      result.results.map((entry) => [entry.name, entry.verdict]),
    );

    assert.strictEqual(verdicts['valid shape'], 'shape-valid');
    assert.strictEqual(verdicts['wrong expectation'], 'confident-wrong');
    assert.strictEqual(verdicts['bad shape'], 'shape-invalid');
    assert.strictEqual(verdicts['server error'], 'uncertain');
    assert.strictEqual(result.shape_valid_count, 1);
    assert.strictEqual(result.confident_wrong_count, 1);
    assert.strictEqual(result.shape_invalid_count, 1);
    assert.strictEqual(result.uncertain_count, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  }
});

function apiResponse(method, url) {
  if (method !== 'GET') {
    return {
      status: 405,
      body: { error: 'method not allowed' },
    };
  }

  if (url === '/') {
    return {
      status: 200,
      body: {
        ok: true,
        profile: { name: 'Raven' },
        items: [{ id: 'item-1' }],
      },
    };
  }

  if (url === '/bad') {
    return {
      status: 200,
      body: {
        ok: true,
        profile: {},
        items: 'not-an-array',
      },
    };
  }

  return {
    status: 500,
    body: { error: 'server error' },
  };
}

function tryListen(server) {
  return new Promise((resolve) => {
    function cleanup() {
      server.off('error', onError);
      server.off('listening', onListening);
    }

    function onError(error) {
      cleanup();
      resolve({ ok: false, error });
    }

    function onListening() {
      cleanup();
      resolve({ ok: true });
    }

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}
