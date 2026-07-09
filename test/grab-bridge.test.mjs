import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_ASSET_PATH = path.join(tmpdir(), 'missing-raven-grab.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.resolve(__dirname, '../dist/index.js');

let indexMod;
try {
  indexMod = await import(distIndex);
} catch (err) {
  const msg = `dist/index.js not found - run \`npm run build\` first. (${err.message})`;
  test('grab bridge module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

async function withClient(server, fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'grab-bridge-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function fakeStyle(declarations = {}) {
  const properties = Object.keys(declarations);
  const style = {
    cssText: properties.map((property) => `${property}: ${declarations[property]};`).join(' '),
    length: properties.length,
    getPropertyValue(property) { return declarations[property] || ''; },
    getPropertyPriority() { return ''; },
    setProperty(property, value) { declarations[property] = value; },
    removeProperty(property) { delete declarations[property]; }
  };
  properties.forEach((property, index) => { style[index] = property; });
  return style;
}

async function loadOverlayInternals() {
  const overlayPath = path.resolve(__dirname, '../browser/raven-grab.js');
  const source = await readFile(overlayPath, 'utf8');
  const marker = '  fetch(bridgeUrl("/tokens"))';
  const instrumented = source.replace(marker, `
  globalThis.__ravenGrabTest = {
    bridgeUrl: bridgeUrl,
    tokenMapFor: tokenMapFor,
    alternativesFor: alternativesFor,
    tokenIntentFor: tokenIntentFor,
    setTokens: function (tokens) { bridgeTokens = normalizeTokens(tokens); }
  };
${marker}`);
  assert.notEqual(instrumented, source, 'overlay test hook insertion point must exist');

  function fakeElement() {
    return {
      style: fakeStyle(),
      setAttribute() {},
      removeAttribute() {},
      appendChild() {},
      addEventListener() {},
      attachShadow() { return { appendChild() {} }; },
      querySelector() { return null; }
    };
  }

  const documentElement = fakeElement();
  documentElement.contains = () => true;
  const document = {
    baseURI: 'http://example.test/',
    currentScript: { src: 'http://127.0.0.1:41234/raven-grab.js?key=test-key' },
    documentElement,
    body: documentElement,
    styleSheets: [],
    createElement: fakeElement,
    addEventListener() {},
    querySelectorAll() { return []; }
  };
  const window = {
    CSS: { escape: (value) => value },
    addEventListener() {}
  };
  const context = {
    window,
    document,
    location: { protocol: 'http:' },
    URL,
    console: { error() {}, warn() {}, info() {} },
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    innerHeight: 900,
    innerWidth: 1440,
    fetch: async () => ({ ok: true, json: async () => ({ tokens: [] }) }),
    getComputedStyle(element) {
      return element.computedStyle || fakeStyle();
    }
  };
  vm.runInNewContext(instrumented, context, { filename: overlayPath });
  return { internals: context.__ravenGrabTest, document };
}

test('tool gating keeps the anonymous remote surface at 45 and gates the six DESIGN.md/grab tools', async () => {
  const stdio = indexMod.buildServer({});
  const remote = indexMod.buildServer({ remote: true });

  const stdioNames = Object.keys(stdio._registeredTools).sort();
  const remoteNames = Object.keys(remote._registeredTools).sort();
  const newTools = [
    'read_design_md',
    'init_design_md',
    'update_design_md',
    'start_grab_session',
    'get_grabbed_elements',
    'stop_grab_session'
  ];

  assert.equal(stdioNames.length, 78);
  for (const name of newTools) {
    assert.equal(stdioNames.includes(name), true, `${name} should be registered on stdio`);
    assert.equal(remoteNames.includes(name), false, `${name} should be gated off remote anonymous`);
  }
  assert.equal(remoteNames.length, 45, 'remote anonymous endpoint must stay at 45 tools');
});

test('start_grab_session requires its capability key, serves DESIGN.md tokens, queues grabs, and stops cleanly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-bridge-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, `---\ncolors:\n  primary: "#111111"\nspacing:\n  md: "16px"\n---\n# Bridge fixture\n`, 'utf8');

  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({ name: 'start_grab_session', arguments: { path: designPath } });
    assert.ok(!started.isError);
    const session = JSON.parse(started.content[0].text);
    assert.ok(session.port > 0, 'bridge should allocate a loopback port');
    const scriptTagMatch = session.script_tag.match(/<script src="http:\/\/127\.0\.0\.1:\d+\/raven-grab\.js\?key=([a-f0-9]+)"><\/script>/);
    assert.ok(scriptTagMatch, 'script tag should carry a random hex capability key');
    const key = scriptTagMatch[1];

    const forbiddenTokensRes = await fetch(`http://127.0.0.1:${session.port}/tokens`);
    assert.equal(forbiddenTokensRes.status, 403, 'missing capability key must be rejected');

    const forbiddenOverlayRes = await fetch(`http://127.0.0.1:${session.port}/raven-grab.js?key=wrong`);
    assert.equal(forbiddenOverlayRes.status, 403, 'wrong capability key must be rejected before asset lookup');

    const forbiddenGrabRes = await fetch(`http://127.0.0.1:${session.port}/grab?key=wrong`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#unauthorized' })
    });
    assert.equal(forbiddenGrabRes.status, 403, 'wrong capability key must not queue a grab');

    const tokensRes = await fetch(`http://127.0.0.1:${session.port}/tokens?key=${key}`);
    assert.equal(tokensRes.status, 200);
    assert.equal(tokensRes.headers.get('access-control-allow-origin'), '*');
    const tokens = await tokensRes.json();
    assert.equal(tokens.path, path.resolve(designPath));
    assert.equal(tokens.count, 2);
    assert.equal(tokens.tokens.find((token) => token.path === 'colors.primary').cssVar, '--color-primary');

    const overlayRes = await fetch(`http://127.0.0.1:${session.port}/raven-grab.js?key=${key}`);
    assert.equal(overlayRes.status, 404, 'missing browser asset must 404 gracefully');

    const grabRes = await fetch(`http://127.0.0.1:${session.port}/grab?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: '#cta',
        html: '<button id="cta">Save</button>',
        rect: { x: 10, y: 20, w: 120, h: 44 },
        instruction: 'Swap the primary color to the muted variant.'
      })
    });
    assert.equal(grabRes.status, 202);
    const queued = await grabRes.json();
    assert.equal(queued.queued, true);
    assert.equal(queued.count, 1);

    const drained = await client.callTool({ name: 'get_grabbed_elements', arguments: {} });
    assert.ok(!drained.isError);
    const grabbed = JSON.parse(drained.content[0].text);
    assert.equal(grabbed.count, 1);
    assert.equal(grabbed.elements[0].selector, '#cta');
    assert.equal(grabbed.elements[0].instruction, 'Swap the primary color to the muted variant.');

    const stopped = await client.callTool({ name: 'stop_grab_session', arguments: {} });
    assert.ok(!stopped.isError);
    assert.equal(JSON.parse(stopped.content[0].text).stopped, true);
  });
});

test('overlay token matching keeps only cascade-winning var declarations', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.setTokens([
    { path: 'colors.class', group: 'colors', name: 'class', value: '#111', cssVar: '--color-class' },
    { path: 'colors.id', group: 'colors', name: 'id', value: '#222', cssVar: '--color-id' },
    { path: 'colors.inline', group: 'colors', name: 'inline', value: '#333', cssVar: '--color-inline' },
    { path: 'colors.old', group: 'colors', name: 'old', value: '#444', cssVar: '--color-old' },
    { path: 'colors.new', group: 'colors', name: 'new', value: '#555', cssVar: '--color-new' },
    { path: 'spacing.old', group: 'spacing', name: 'old', value: '8px', cssVar: '--spacing-old' },
    { path: 'spacing.new', group: 'spacing', name: 'new', value: '12px', cssVar: '--spacing-new' }
  ]);
  document.styleSheets = [{ cssRules: [
    { selectorText: '.card', style: fakeStyle({ color: 'var(--color-class)', 'background-color': 'var(--color-old)', 'padding-left': 'var(--spacing-old)' }) },
    { selectorText: '#target', style: fakeStyle({ color: 'var(--color-id)' }) },
    { selectorText: '.card', style: fakeStyle({ 'background-color': 'var(--color-new)' }) },
    { selectorText: '.card.special', style: fakeStyle({ padding: 'var(--spacing-new)' }) }
  ] }];
  const element = {
    matches: () => true,
    style: fakeStyle({ color: 'var(--color-inline)' }),
    computedStyle: fakeStyle({
      '--color-class': '#111', '--color-id': '#222', '--color-inline': '#333',
      '--color-old': '#444', '--color-new': '#555', '--spacing-old': '8px', '--spacing-new': '12px'
    })
  };

  const cssVars = Array.from(internals.tokenMapFor(element), (token) => token.cssVar).sort();
  assert.deepEqual(cssVars, ['--color-inline', '--color-new', '--spacing-new']);
});

test('overlay alternatives match nested token leaf names within the same group', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setTokens([
    { path: 'typography.body.fontFamily', group: 'typography', name: 'body.fontFamily', value: 'Inter', cssVar: '--font-body' },
    { path: 'typography.caption.fontFamily', group: 'typography', name: 'caption.fontFamily', value: 'Inter', cssVar: '--font-caption' },
    { path: 'typography.body.fontSize', group: 'typography', name: 'body.fontSize', value: '16px', cssVar: '--text-body' },
    { path: 'colors.fontFamily', group: 'colors', name: 'fontFamily', value: '#000', cssVar: '--color-font' }
  ]);

  const alternatives = internals.alternativesFor({
    group: 'typography',
    cssVar: '--font-body',
    bridgeToken: { path: 'typography.body.fontFamily' }
  });
  assert.deepEqual(Array.from(alternatives, (token) => token.path), ['typography.caption.fontFamily']);

  internals.setTokens([
    { path: 'typography.font-family.body', group: 'typography', name: 'font-family.body', value: 'Inter', cssVar: '--font-family-body' },
    { path: 'typography.font-family.caption', group: 'typography', name: 'font-family.caption', value: 'Inter', cssVar: '--font-family-caption' },
    { path: 'typography.font-size.body', group: 'typography', name: 'font-size.body', value: '16px', cssVar: '--font-size-body' }
  ]);
  const propertyFirstAlternatives = internals.alternativesFor({
    group: 'typography',
    cssVar: '--font-family-body',
    bridgeToken: { path: 'typography.font-family.body' }
  });
  assert.deepEqual(Array.from(propertyFirstAlternatives, (token) => token.path), ['typography.font-family.caption']);
});

test('overlay token intents include old and new full token paths', async () => {
  const { internals } = await loadOverlayInternals();
  const token = {
    property: 'font-family',
    group: 'typography',
    name: 'body.fontFamily',
    bridgeToken: { path: 'typography.body.fontFamily' }
  };
  const alternative = {
    path: 'typography.caption.fontFamily',
    name: 'caption.fontFamily',
    value: 'Inter'
  };

  assert.deepEqual(
    { ...internals.tokenIntentFor(token, alternative) },
    {
      property: 'font-family',
      oldToken: 'body.fontFamily',
      oldTokenPath: 'typography.body.fontFamily',
      newToken: 'caption.fontFamily',
      newTokenPath: 'typography.caption.fontFamily',
      newTokenValue: 'Inter'
    }
  );
  assert.deepEqual(
    { ...internals.tokenIntentFor(token, null, 'display.fontFamily', 'Newsreader') },
    {
      property: 'font-family',
      oldToken: 'body.fontFamily',
      oldTokenPath: 'typography.body.fontFamily',
      newToken: 'display.fontFamily',
      newTokenPath: 'typography.display.fontFamily',
      newTokenValue: 'Newsreader'
    }
  );
});

test('overlay appends its script capability key to bridge requests', async () => {
  const { internals } = await loadOverlayInternals();
  assert.equal(internals.bridgeUrl('/tokens'), 'http://127.0.0.1:41234/tokens?key=test-key');
  assert.equal(internals.bridgeUrl('/grab'), 'http://127.0.0.1:41234/grab?key=test-key');
});
