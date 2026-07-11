import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
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

async function withUpstream(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function makeDesignFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-grab-proxy-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, `---\ncolors:\n  primary: "#111111"\n---\n# Proxy fixture\n`, 'utf8');
  return designPath;
}

function sessionKey(session) {
  const match = session.script_tag.match(/[?&]key=([a-f0-9]+)/);
  assert.ok(match, 'session script tag should contain its capability key');
  return match[1];
}

function fakeStyle(declarations = {}, priorities = {}) {
  const properties = Object.keys(declarations);
  const style = {
    cssText: properties.map((property) => `${property}: ${declarations[property]};`).join(' '),
    length: properties.length,
    getPropertyValue(property) { return declarations[property] || ''; },
    getPropertyPriority(property) { return priorities[property] || ''; },
    setProperty(property, value, priority = '') {
      declarations[property] = value;
      priorities[property] = priority;
    },
    removeProperty(property) {
      delete declarations[property];
      delete priorities[property];
    }
  };
  properties.forEach((property, index) => { style[index] = property; });
  return style;
}

async function loadOverlayInternals(options = {}) {
  const overlayPath = options.overlayPath || path.resolve(__dirname, '../browser/raven-grab.js');
  const source = await readFile(overlayPath, 'utf8');
  const marker = '  if (grabConfig) {';
  const instrumented = source.replace(marker, `
  globalThis.__ravenGrabTest = {
    bridgeUrl: bridgeUrl,
    tokenMapFor: tokenMapFor,
    interactiveStylesFor: interactiveStylesFor,
    selectionFor: selectionFor,
    alternativesFor: alternativesFor,
    tokenIntentFor: tokenIntentFor,
    computedStylesFor: computedStylesFor,
    beginStyleEdit: beginStyleEdit,
    commitStyleEdit: commitStyleEdit,
    cancelStyleEdit: cancelStyleEdit,
    dismiss: dismiss,
    payloadForSend: payloadForSend,
    styleEditsForSend: styleEditsForSend,
    renderPanel: renderPanel,
    setArmed: typeof setArmed === "function" ? setArmed : undefined,
    collapsePanel: typeof collapsePanel === "function" ? collapsePanel : undefined,
    copyElementSelector: typeof copyElementSelector === "function" ? copyElementSelector : undefined,
    switchTab: typeof switchTab === "function" ? switchTab : undefined,
    toggleSection: typeof toggleSection === "function" ? toggleSection : undefined,
    updateIntent: updateIntent,
    rollbackTokenPreviews: rollbackTokenPreviews,
    sendComponentRequest: typeof sendComponentRequest === "function" ? sendComponentRequest : undefined,
    sendSelection: sendSelection,
    getPanelHtml: function () { return panel.innerHTML; },
    getPanelAttribute: function (name) { return panel.getAttribute(name); },
    getEdgeTabAttribute: function (name) { return typeof edgeTab === "undefined" ? null : edgeTab.getAttribute(name); },
    dispatchEdgeTab: function (type, event) { if (typeof edgeTab !== "undefined") edgeTab.dispatch(type, event); },
    dispatchPanel: function (type, event) { panel.dispatch(type, event); },
    getPanelStyle: function (name) { return panel.style[name]; },
    getPanelCapturedPointer: function () { return panel.capturedPointer; },
    setPanelRect: function (rect) { panel.getBoundingClientRect = function () { return rect; }; },
    getBridgeTokens: function () { return bridgeTokens; },
    setPanelQuery: function (selector, value) { panel.setQuery(selector, value); },
    setStyleContext: function (element, styles, tokens, selector, stateStyles) {
      selectedElement = element;
      currentSelection = { selector: selector || "#target", html: "", rect: {}, styles: styles, tokens: tokens || [], stateStyles: stateStyles || {} };
      styleEdits = Object.create(null);
      styleEditOriginalInline = Object.create(null);
    },
    setTokens: function (tokens) { bridgeTokens = normalizeTokens(tokens); }
  };
${marker}`);
  assert.notEqual(instrumented, source, 'overlay test hook insertion point must exist');

  function fakeElement() {
    const attributes = {};
    const listeners = {};
    const queries = {};
    return {
      nodeType: 1,
      localName: 'div',
      classList: [],
      children: [],
      parentElement: null,
      outerHTML: '<div></div>',
      style: fakeStyle(),
      innerHTML: '',
      textContent: '',
      value: '',
      disabled: false,
      capturedPointer: null,
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(attributes, name) ? attributes[name] : null; },
      removeAttribute(name) { delete attributes[name]; },
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        child.parentNode = this;
      },
      addEventListener(type, listener) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(listener);
      },
      dispatch(type, event) {
        for (const listener of listeners[type] || []) listener(event);
      },
      setPointerCapture(pointerId) { this.capturedPointer = pointerId; },
      hasPointerCapture(pointerId) { return this.capturedPointer === pointerId; },
      releasePointerCapture(pointerId) { if (this.capturedPointer === pointerId) this.capturedPointer = null; },
      focus() {},
      select() {},
      getBoundingClientRect() { return { x: 0, y: 0, top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }; },
      attachShadow() { return { appendChild() {} }; },
      querySelector(selector) { return queries[selector] || null; },
      setQuery(selector, value) { queries[selector] = value; }
    };
  }

  const documentElement = fakeElement();
  documentElement.contains = () => true;
  const documentListeners = {};
  const document = {
    baseURI: 'http://example.test/',
    currentScript: { src: 'http://127.0.0.1:41234/raven-grab.js?key=test-key' },
    documentElement,
    body: documentElement,
    styleSheets: [],
    createElement: fakeElement,
    addEventListener(type, listener) {
      if (!documentListeners[type]) documentListeners[type] = [];
      documentListeners[type].push(listener);
    },
    dispatch(type, event) {
      for (const listener of documentListeners[type] || []) listener(event);
    },
    querySelectorAll() { return []; }
  };
  const window = {
    RavenGrabConfig: options.config,
    ravenGrabConfig: options.lowercaseConfig,
    localStorage: options.localStorage,
    CSS: {
      escape: (value) => value,
      supports: (_property, value) => value !== 'definitely-invalid'
    },
    matchMedia: () => ({ matches: options.reducedMotion === true }),
    addEventListener() {}
  };
  const context = {
    window,
    document,
    location: { protocol: 'http:' },
    URL,
    navigator: { clipboard: options.clipboard },
    console: { error() {}, warn() {}, info() {} },
    encodeURIComponent,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout,
    innerHeight: 900,
    innerWidth: 1440,
    fetch: options.fetch || (async () => ({ ok: true, json: async () => ({ tokens: [] }) })),
    getComputedStyle(element) {
      return element.computedStyle || fakeStyle();
    }
  };
  vm.runInNewContext(instrumented, context, { filename: overlayPath });
  await Promise.resolve();
  await Promise.resolve();
  return { internals: context.__ravenGrabTest, document };
}

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = [];
  return {
    setTimeout(callback, delay) {
      const timer = { id: nextId, at: now + delay, callback };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    tick(duration) {
      const end = now + duration;
      while (true) {
        timers.sort((left, right) => left.at - right.at);
        const timer = timers[0];
        if (!timer || timer.at > end) break;
        timers.shift();
        now = timer.at;
        timer.callback();
      }
      now = end;
    }
  };
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

  assert.equal(stdioNames.length, 82);
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
        styleEdits: [{ property: 'color', oldValue: '#111111', newValue: '#222222' }],
        instruction: 'Swap the primary color to the muted variant.',
        componentRequest: {
          issueType: 'Missing variant',
          issueSize: '100-1,000',
          useCase: 'The billing table needs a compact density variant.',
          email: 'designer@example.com'
        }
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
    assert.deepEqual(grabbed.elements[0].styleEdits, [
      { property: 'color', oldValue: '#111111', newValue: '#222222' }
    ]);
    assert.equal(grabbed.elements[0].instruction, 'Swap the primary color to the muted variant.');
    assert.deepEqual(grabbed.elements[0].componentRequest, {
      issueType: 'Missing variant',
      issueSize: '100-1,000',
      useCase: 'The billing table needs a compact density variant.',
      email: 'designer@example.com'
    });

    const stopped = await client.callTool({ name: 'stop_grab_session', arguments: {} });
    assert.ok(!stopped.isError);
    assert.equal(JSON.parse(stopped.content[0].text).stopped, true);
  });
});

test('grab proxy injects exactly one keyed overlay script before the first closing body tag', async () => {
  const designPath = await makeDesignFixture();
  const original = '<!doctype html><html><body><main>Original content</main></BoDy></html>';

  await withUpstream((req, res) => {
    assert.equal(req.url, '/nested/page?view=full');
    res.writeHead(201, { 'Content-Type': 'text/html; charset=utf-8', 'X-Upstream': 'yes' });
    res.end(original);
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        assert.ok(!started.isError);
        const session = JSON.parse(started.content[0].text);
        const key = sessionKey(session);
        const response = await fetch(`${session.url}/nested/page?view=full`);
        const html = await response.text();
        const injected = `<script src="/raven-grab.js?key=${key}"></script>`;

        assert.equal(response.status, 201);
        assert.equal(response.headers.get('x-upstream'), 'yes');
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        assert.equal(html.split(injected).length - 1, 1);
        assert.equal(html, original.replace(/<\/body>/i, `${injected}</BoDy>`));
        assert.ok(html.indexOf(injected) < html.toLowerCase().indexOf('</body>'));
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('start_grab_session keeps consumer injection unchanged and injects maintainer role config', async () => {
  const designPath = await makeDesignFixture();

  await withClient(indexMod.buildServer({}), async (client) => {
    const consumerStarted = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath }
    });
    const consumerSession = JSON.parse(consumerStarted.content[0].text);
    assert.match(consumerSession.script_tag, /^<script src="http:\/\/127\.0\.0\.1:\d+\/raven-grab\.js\?key=[a-f0-9]+"><\/script>$/);
    assert.doesNotMatch(consumerSession.script_tag, /ravenGrabConfig|role/);

    const maintainerStarted = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath, role: 'maintainer' }
    });
    const maintainerSession = JSON.parse(maintainerStarted.content[0].text);
    assert.match(maintainerSession.script_tag, /^<script>window\.ravenGrabConfig=\{"role":"maintainer"\};<\/script><script src="http:\/\/127\.0\.0\.1:\d+\/raven-grab\.js\?key=[a-f0-9]+"><\/script>$/);
    const maintainerKey = sessionKey(maintainerSession);
    const grabResponse = await fetch(`${maintainerSession.url}/grab?key=${maintainerKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: '#maintainer-target',
        styles: { color: 'rgb(0, 0, 0)' },
        tokens: [{ path: 'colors.primary' }],
        stateStyles: { hover: { declarations: [{ property: 'color', value: 'red' }] } },
        intent: 'create-component',
        userNotes: 'Keep the compact hover treatment.',
        instruction: 'Build this as a reusable component in the design system and update DESIGN.md.'
      })
    });
    assert.equal(grabResponse.status, 202);
    const drained = await client.callTool({ name: 'get_grabbed_elements', arguments: {} });
    const grabbed = JSON.parse(drained.content[0].text).elements[0];
    assert.equal(grabbed.intent, 'create-component');
    assert.equal(grabbed.userNotes, 'Keep the compact hover treatment.');
    assert.deepEqual(grabbed.stateStyles, { hover: { declarations: [{ property: 'color', value: 'red' }] } });
    assert.match(grabbed.instruction, /update DESIGN\.md/);

    await client.callTool({ name: 'stop_grab_session', arguments: {} });
  });
});

test('start_grab_session rejects an empty proxy_target instead of silently disabling proxy mode', async () => {
  const designPath = await makeDesignFixture();

  await withClient(indexMod.buildServer({}), async (client) => {
    const started = await client.callTool({
      name: 'start_grab_session',
      arguments: { path: designPath, proxy_target: '' }
    });
    if (!started.isError) {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
    }

    assert.equal(started.isError, true);
    assert.match(started.content[0].text, /proxy_target/);
  });
});

test('grab proxy preserves HEAD semantics without fabricating an injected body length', async () => {
  const designPath = await makeDesignFixture();

  await withUpstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '123' });
    res.end();
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const response = await fetch(`${session.url}/document`, { method: 'HEAD' });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') || '', /^text\/html/);
        assert.equal(response.headers.get('content-length'), null);
        assert.equal(await response.text(), '');
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab proxy passes non-HTML response bytes through without injection', async () => {
  const designPath = await makeDesignFixture();
  const original = Buffer.from('{"message":"unchanged","bytes":[0,255]}\n', 'utf8');

  await withUpstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': original.length });
    res.end(original);
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const response = await fetch(`${session.url}/data.json`);
        const body = Buffer.from(await response.arrayBuffer());

        assert.deepEqual(body, original);
        assert.equal(body.includes(Buffer.from('raven-grab.js')), false);
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab proxy forwards chunked request bodies without forwarding transfer-encoding', async () => {
  const designPath = await makeDesignFixture();
  let received;

  await withUpstream(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks),
      transferEncoding: req.headers['transfer-encoding']
    };
    res.writeHead(204);
    res.end();
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const response = await new Promise((resolve, reject) => {
          const request = httpRequest(`${session.url}/api/save?draft=1`, { method: 'PATCH' }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
          });
          request.on('error', reject);
          request.write(Buffer.from([0, 1]));
          request.end(Buffer.from([2, 255]));
        });

        assert.equal(response.status, 204);
        assert.equal(received.method, 'PATCH');
        assert.equal(received.url, '/api/save?draft=1');
        assert.deepEqual(received.body, Buffer.from([0, 1, 2, 255]));
        assert.equal(received.transferEncoding, undefined);
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab bridge routes remain available while proxy mode is active', async () => {
  const designPath = await makeDesignFixture();

  await withUpstream((_req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('upstream route');
  }, async (upstreamUrl) => {
    await withClient(indexMod.buildServer({}), async (client) => {
      try {
        const started = await client.callTool({
          name: 'start_grab_session',
          arguments: { path: designPath, proxy_target: upstreamUrl }
        });
        const session = JSON.parse(started.content[0].text);
        const key = sessionKey(session);
        const response = await fetch(`${session.url}/tokens?key=${key}`);
        const tokens = await response.json();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        assert.equal(tokens.path, path.resolve(designPath));
        assert.equal(tokens.count, 1);
      } finally {
        await client.callTool({ name: 'stop_grab_session', arguments: {} });
      }
    });
  });
});

test('grab proxy returns 502 when its upstream is unreachable', async () => {
  const designPath = await makeDesignFixture();
  let unreachableUrl;
  await withUpstream((_req, res) => res.end(), async (upstreamUrl) => {
    unreachableUrl = upstreamUrl;
  });

  await withClient(indexMod.buildServer({}), async (client) => {
    try {
      const started = await client.callTool({
        name: 'start_grab_session',
        arguments: { path: designPath, proxy_target: unreachableUrl }
      });
      const session = JSON.parse(started.content[0].text);
      const response = await fetch(`${session.url}/unreachable`);
      const body = await response.text();

      assert.equal(response.status, 502);
      assert.match(response.headers.get('content-type') || '', /^text\/plain/);
      assert.match(body, /^Bad gateway: /);
    } finally {
      await client.callTool({ name: 'stop_grab_session', arguments: {} });
    }
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

test('overlay captures interactive state declarations, tokens, and disabled presence', async () => {
  const { internals, document } = await loadOverlayInternals();
  internals.setTokens([
    { path: 'colors.accent', name: 'accent', group: 'colors', value: '#00BFFF', cssVar: '--demo-colors-accent' },
    { path: 'colors.primary', name: 'primary', group: 'colors', value: '#F0F0F2', cssVar: '--demo-colors-primary' }
  ]);
  document.styleSheets.push(
    { get cssRules() { throw new Error('cross-origin'); } },
    { cssRules: [
      { selectorText: 'button:hover', style: fakeStyle({ background: 'var(--demo-colors-primary)' }) },
      { selectorText: '.demo-button:hover, .other:hover', style: fakeStyle({ background: 'var(--demo-colors-accent)', color: 'var(--demo-colors-primary)' }) },
      { selectorText: '.demo-button:focus', style: fakeStyle({ outline: '2px solid var(--demo-colors-accent)' }) },
      { selectorText: '.demo-button:active', style: fakeStyle({ color: 'var(--demo-colors-accent)' }) },
      { selectorText: '.demo-button:disabled', style: fakeStyle({ opacity: '0.5' }) }
    ] }
  );
  const element = document.createElement('button');
  element.localName = 'button';
  element.disabled = true;
  element.computedStyle = fakeStyle({
    '--demo-colors-accent': '#00BFFF',
    '--demo-colors-primary': '#F0F0F2'
  });
  element.matches = (selector) => selector === 'button' || selector === '.demo-button';

  const states = JSON.parse(JSON.stringify(internals.interactiveStylesFor(element)));
  assert.deepEqual(states.hover.declarations, [
    { property: 'background', value: 'var(--demo-colors-accent)', important: false },
    { property: 'color', value: 'var(--demo-colors-primary)', important: false }
  ]);
  assert.deepEqual(states.hover.tokens.map((token) => token.path).sort(), ['colors.accent', 'colors.primary']);
  assert.equal(states.focus.declarations[0].property, 'outline');
  assert.equal(states.active.declarations[0].property, 'color');
  assert.equal(states.disabled.active, true);
  assert.equal(states.disabled.declarations[0].property, 'opacity');
});

test('overlay renders state groups in token and raw style sections and sends them', async () => {
  const { internals } = await loadOverlayInternals();
  const stateStyles = {
    hover: {
      declarations: [{ property: 'background', value: 'var(--demo-colors-accent)', important: false }],
      tokens: [{ property: 'background', name: 'accent', path: 'colors.accent', value: '#00BFFF', cssVar: '--demo-colors-accent', bridgeToken: { path: 'colors.accent' } }]
    },
    focus: {
      declarations: [{ property: 'outline', value: '2px solid var(--demo-colors-accent)', important: false }],
      tokens: [{ property: 'outline', name: 'accent', path: 'colors.accent', value: '#00BFFF', cssVar: '--demo-colors-accent', bridgeToken: { path: 'colors.accent' } }]
    },
    active: { declarations: [], tokens: [] },
    disabled: { active: true, declarations: [], tokens: [] }
  };
  internals.setStyleContext({ style: fakeStyle() }, { padding: '16px' }, [], '#state-target', stateStyles);
  internals.renderPanel();

  const html = internals.getPanelHtml();
  assert.match(html, /data-token-state="hover"[\s\S]*HOVER[\s\S]*colors\.accent/);
  assert.match(html, /data-token-state="focus"[\s\S]*FOCUS[\s\S]*colors\.accent/);
  assert.match(html, /data-style-state="hover"[\s\S]*HOVER[\s\S]*data-state-style-property="background"/);
  assert.match(html, /data-style-state="focus"[\s\S]*FOCUS[\s\S]*data-state-style-property="outline"/);
  assert.doesNotMatch(html, /data-token-state="active"|data-style-state="active"/);
  assert.doesNotMatch(html, /data-token-state="disabled"|data-style-state="disabled"/);
  assert.deepEqual(JSON.parse(JSON.stringify(internals.payloadForSend().stateStyles)), stateStyles);
});

test('overlay state capture is wired into selection and playground state fixtures', async () => {
  const overlaySource = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  const playgroundSource = await readFile(path.resolve(__dirname, '../web/app/raven-design/page.tsx'), 'utf8');
  assert.match(overlaySource, /stateStyles:\s*interactiveStylesFor\(element\)/);
  assert.equal((overlaySource.match(/stateStyles:\s*currentSelection\.stateStyles/g) || []).length, 2);
  assert.match(overlaySource, /document\.styleSheets[\s\S]*try\s*\{[\s\S]*\.cssRules/);
  assert.match(overlaySource, /element\.matches\(baseSelector\)/);
  assert.match(playgroundSource, /\.wireframe-button:hover\s*\{/);
  assert.match(playgroundSource, /\.wireframe-field input:focus\s*\{/);
  assert.match(playgroundSource, /\.wireframe-button:disabled\s*\{/);
  assert.match(playgroundSource, /<button[^>]*disabled[^>]*>/);
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

test('overlay computed-style commits preserve the original value across re-edits', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 0, 0)' }) };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });

  assert.equal(internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)'), true);
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(20, 20, 20)' }
  ]);

  assert.equal(internals.commitStyleEdit('color', 'rgb(40, 40, 40)', 'rgb(20, 20, 20)'), true);
  assert.equal(element.style.getPropertyValue('color'), 'rgb(40, 40, 40)');
  assert.deepEqual(Array.from(internals.styleEditsForSend(), (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(40, 40, 40)' }
  ]);
});

test('overlay dismiss rolls back inline computed-style mutations', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(1, 2, 3)' }, { color: 'important' }) };
  internals.setStyleContext(element, { color: 'rgb(1, 2, 3)' });

  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(1, 2, 3)');
  assert.equal(element.style.getPropertyValue('color'), 'rgb(20, 20, 20)');

  internals.dismiss();
  assert.equal(element.style.getPropertyValue('color'), 'rgb(1, 2, 3)');
  assert.equal(element.style.getPropertyPriority('color'), 'important');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
});

test('overlay reverting to the original computed value removes the inline override', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });

  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)');
  internals.commitStyleEdit('color', 'rgb(0, 0, 0)', 'rgb(20, 20, 20)');

  assert.equal(element.style.getPropertyValue('color'), '');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
});

test('overlay invalid computed-style value leaves the displayed value unchanged', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.textContent = 'rgb(0, 0, 0)';
  valueCell.parentElement = row;
  valueCell.parentNode = row;

  internals.beginStyleEdit(valueCell);
  const input = row.child.children.find((child) => child.type === 'text');
  input.value = 'definitely-invalid';
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });

  assert.equal(row.child.textContent, 'rgb(0, 0, 0)');
  assert.equal(element.style.getPropertyValue('color'), '');
  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
});

test('overlay computed-style identical, invalid, and cancelled edits record nothing', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 0, 0)' }) };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });

  assert.equal(internals.commitStyleEdit('color', 'rgb(0, 0, 0)', 'rgb(0, 0, 0)'), false);
  assert.equal(internals.commitStyleEdit('color', 'definitely-invalid', 'rgb(0, 0, 0)'), false);
  const row = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const valueCell = document.createElement('code');
  valueCell.textContent = 'rgb(0, 0, 0)';
  valueCell.parentElement = row;
  valueCell.parentNode = row;
  internals.beginStyleEdit(valueCell);
  const input = row.child.children.find((child) => child.type === 'text');
  input.dispatch('keydown', {
    key: 'Escape',
    preventDefault() {},
    stopPropagation() {}
  });

  assert.deepEqual(Array.from(internals.styleEditsForSend()), []);
  assert.equal(element.style.getPropertyValue('color'), 'rgb(0, 0, 0)');
  assert.equal(row.child.textContent, 'rgb(0, 0, 0)');
});

test('overlay grab payload includes computed style edits', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle({ color: 'rgb(0, 0, 0)' }) };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });
  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)');

  assert.deepEqual(Array.from(internals.payloadForSend().styleEdits, (edit) => ({ ...edit })), [
    { property: 'color', oldValue: 'rgb(0, 0, 0)', newValue: 'rgb(20, 20, 20)' }
  ]);
});

test('overlay appends its script capability key to bridge requests', async () => {
  const { internals } = await loadOverlayInternals();
  assert.equal(internals.bridgeUrl('/tokens'), 'http://127.0.0.1:41234/tokens?key=test-key');
  assert.equal(internals.bridgeUrl('/grab'), 'http://127.0.0.1:41234/grab?key=test-key');
});

test('overlay switches between Design and Request Component tabs', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.renderPanel();

  assert.match(internals.getPanelHtml(), /data-tab="design"[^>]*aria-selected="true"/);
  assert.equal(typeof internals.switchTab, 'function');
  internals.switchTab('request');
  assert.match(internals.getPanelHtml(), /data-tab="request"[^>]*aria-selected="true"/);
  assert.match(internals.getPanelHtml(), /REASON FOR NEW COMPONENT/);
});

test('overlay element chip exposes the full selector and copies it through the clipboard', async () => {
  const writes = [];
  const selector = 'main[data-view="billing"] > section:nth-child(12) .action-row button[data-action="save-and-continue"]';
  const { internals, document } = await loadOverlayInternals({
    clipboard: { writeText: async (value) => { writes.push(value); } }
  });
  internals.setStyleContext({ style: fakeStyle() }, {}, [], selector);
  internals.renderPanel();

  assert.match(
    internals.getPanelHtml(),
    /title="main\[data-view=&quot;billing&quot;\] &gt; section:nth-child\(12\) \.action-row button\[data-action=&quot;save-and-continue&quot;\]"/
  );

  const chip = document.createElement('span');
  chip.closest = (query) => query === '[data-element-selector]' ? chip : null;
  internals.dispatchPanel('click', { target: chip, stopPropagation() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(writes, [selector]);
  assert.equal(chip.textContent, 'Copied');
  assert.equal(chip.getAttribute('data-copied'), 'true');
});

test('overlay token and computed-style sections start collapsed and toggle without losing edits', async () => {
  const { internals } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(element, { color: 'rgb(0, 0, 0)' });
  internals.commitStyleEdit('color', 'rgb(20, 20, 20)', 'rgb(0, 0, 0)');
  internals.renderPanel();

  assert.match(internals.getPanelHtml(), /data-section-toggle="tokens"[^>]*aria-expanded="false"/);
  assert.match(internals.getPanelHtml(), /data-section-toggle="styles"[^>]*aria-expanded="false"/);
  assert.equal(typeof internals.toggleSection, 'function');
  internals.toggleSection('styles');
  assert.match(internals.getPanelHtml(), /data-section-toggle="styles"[^>]*aria-expanded="true"/);
  assert.match(internals.getPanelHtml(), /data-edited="true"/);
});

test('overlay excludes tokenized properties from the not-tokenized styles table', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext(
    { style: fakeStyle() },
    { color: 'rgb(0, 191, 255)', padding: '16px' },
    [{ property: 'color', name: 'primary', value: '#00BFFF', bridgeToken: { path: 'colors.primary' } }]
  );
  internals.renderPanel();

  assert.doesNotMatch(internals.getPanelHtml(), /data-style-property="color"/);
  assert.match(internals.getPanelHtml(), /data-style-property="padding"/);
});

test('overlay keeps consumer component-request markup unchanged when role is absent', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.switchTab('request');

  const html = internals.getPanelHtml();
  assert.match(html, />Request Component<\/button>/);
  assert.match(html, /data-issue-type/);
  assert.match(html, /data-issue-size/);
  assert.match(html, /Send component request to design/);
  assert.doesNotMatch(html, /Add to Design System|Add to design system/);

  const explicit = await loadOverlayInternals({ lowercaseConfig: { role: 'consumer' } });
  explicit.internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  explicit.internals.switchTab('request');
  assert.equal(explicit.internals.getPanelHtml(), html, 'explicit consumer markup must be byte-for-byte identical to the absent-role default');
});

test('maintainer role renders add-to-design-system flow and creates an agent instruction without email framing', async () => {
  const { internals } = await loadOverlayInternals({
    lowercaseConfig: { role: 'maintainer' }
  });
  const stateStyles = {
    hover: {
      declarations: [{ property: 'color', value: 'var(--color-primary)', important: false }],
      tokens: [{ property: 'color', path: 'colors.primary', value: '#111111' }]
    }
  };
  internals.setStyleContext(
    { style: fakeStyle() },
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', path: 'colors.primary', value: '#111111' }],
    '#maintainer-target',
    stateStyles
  );
  internals.switchTab('request');

  const html = internals.getPanelHtml();
  assert.match(html, />Add component<\/button>/);
  assert.match(html, /data-use-case/);
  assert.match(html, /Add to design system/);
  assert.doesNotMatch(html, /data-component-email|data-issue-type|data-issue-size|EMAIL YOURSELF|Send component request/);

  const notes = { value: 'Keep the compact hover treatment.', getAttribute() { return null; } };
  internals.setPanelQuery('[data-use-case]', notes);
  const payload = JSON.parse(JSON.stringify(internals.payloadForSend()));
  assert.equal(payload.intent, 'create-component');
  assert.equal(payload.selector, '#maintainer-target');
  assert.equal(payload.userNotes, 'Keep the compact hover treatment.');
  assert.match(payload.instruction, /Build this as a reusable component in the design system and update DESIGN\.md/);
  assert.deepEqual(payload.styles, { color: 'rgb(0, 0, 0)' });
  assert.deepEqual(payload.tokens, [{ property: 'color', path: 'colors.primary', value: '#111111' }]);
  assert.deepEqual(payload.stateStyles, stateStyles);
  assert.equal(payload.componentRequest, undefined);
});

test('standalone overlay loads configured tokens and POSTs the full component request to the email endpoint', async () => {
  const calls = [];
  const clock = fakeClock();
  const tokens = { 'colors.primary': '#00BFFF' };
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    config: {
      mode: 'standalone',
      tokens,
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request'
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ success: true, mode: 'issue', url: 'https://github.com/o/r/issues/1', message: 'Request created' }) };
    }
  });

  assert.equal(internals.getBridgeTokens().length, 1);
  assert.equal(internals.getBridgeTokens()[0].path, 'colors.primary');
  assert.equal(calls.length, 0, 'standalone token loading must not call GET /tokens');

  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext(
    { style: fakeStyle() },
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    '#request-target'
  );
  internals.renderPanel();
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);
  await internals.sendSelection();
  assert.equal(calls.length, 0, 'null standalone grabEndpoint must not POST');
  assert.match(status.textContent, /^Sent #request-target/);
  assert.equal(status.getAttribute("data-kind"), "sr-only");
  assert.equal(button.getAttribute('data-send-state'), 'collapse');

  assert.equal(typeof internals.sendComponentRequest, 'function');
  await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/component-request');
  assert.equal(calls[0].init.method, 'POST');
  const sentBody = JSON.parse(calls[0].init.body);
  assert.match(sentBody.requestId, /^cr-/);
  delete sentBody.requestId;
  assert.deepEqual(sentBody, {
    selector: '#request-target',
    tokens: [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    styles: { color: 'rgb(0, 0, 0)' },
    stateStyles: {},
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });
});

test('email-flow playground overlay requires an email and posts flow:email', async () => {
  const calls = [];
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    config: {
      mode: 'standalone',
      tokens: {},
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request',
      componentRequestFlow: 'email'
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ success: true, mode: 'email', message: 'Email sent' }) };
    }
  });

  internals.setStyleContext(
    { style: fakeStyle() },
    { color: 'rgb(0, 0, 0)' },
    [{ property: 'color', cssVar: '--color-primary', value: '#111111' }],
    '#request-target'
  );
  internals.renderPanel();
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setPanelQuery('[data-send-email]', button);
  internals.setPanelQuery('[data-status]', status);

  const rejected = await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: ''
  });
  assert.equal(rejected, false, 'email flow must require an email address');
  assert.equal(calls.length, 0);

  const sent = await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  const sentBody = JSON.parse(calls[0].init.body);
  assert.equal(sentBody.flow, 'email');
  assert.equal(sentBody.email, 'designer@example.com');
  assert.equal(status.textContent, 'Email sent');
  clock.tick(820);
  assert.match(button.innerHTML, /Email sent/);
  clock.tick(2300);
  assert.match(button.innerHTML, /Send email/);
});

test('request component shows the clipboard-only setup hint only when no destination is configured', async () => {
  const overlayPath = path.resolve(__dirname, '../web/public/raven-grab.js');
  const stored = {};
  const localStorage = {
    getItem(key) { return Object.hasOwn(stored, key) ? stored[key] : null; },
    setItem(key, value) { stored[key] = String(value); }
  };
  const configurations = [
    {
      config: {
        mode: 'standalone',
        tokens: {},
        grabEndpoint: null,
        componentRequestEndpoint: null
      },
      expected: true
    },
    {
      config: {
        mode: 'standalone',
        tokens: {},
        grabEndpoint: null,
        componentRequestEndpoint: null,
        componentRequestFlow: 'email'
      },
      expected: false
    },
    {
      config: {
        mode: 'standalone',
        tokens: {},
        grabEndpoint: null,
        componentRequestEndpoint: 'https://example.test/component-request'
      },
      expected: false
    }
  ];

  for (const configuration of configurations) {
    const { internals } = await loadOverlayInternals({
      overlayPath,
      config: configuration.config,
      localStorage
    });
    internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
    internals.switchTab('request');

    const html = internals.getPanelHtml();
    if (configuration.expected) {
      assert.match(html, /No destination configured — requests can&#39;t be sent yet\. Ask your agent to set up GitHub routing\./);
      const dismissButton = {
        closest(selector) { return selector === '[data-dismiss-request-hint]' ? this : null; }
      };
      internals.dispatchPanel('click', { target: dismissButton, stopPropagation() {} });
      assert.equal(stored['raven-grab-request-hint-dismissed'], 'true');
      assert.doesNotMatch(internals.getPanelHtml(), /No destination configured/);
      delete stored['raven-grab-request-hint-dismissed'];
    } else {
      assert.doesNotMatch(html, /No destination configured/);
    }
  }
});

test('reselecting and dismissing restore token previews on their original target', async () => {
  const { internals, document } = await loadOverlayInternals();
  const first = document.createElement('div');
  first.style = fakeStyle({ '--color-primary': '#111111' }, { '--color-primary': 'important' });
  const second = document.createElement('div');
  second.id = 'second';
  const select = document.createElement('select');
  select.value = '--color-secondary';
  const newFields = document.createElement('div');
  const token = { property: 'color', cssVar: '--color-primary', value: '#111111', path: 'colors.primary' };

  internals.setTokens([
    { path: 'colors.secondary', name: 'secondary', group: 'colors', value: '#222222', cssVar: '--color-secondary' }
  ]);
  internals.setStyleContext(first, { color: '#111111' }, [token], '#first');
  internals.setPanelQuery('[data-token-choice="0"]', select);
  internals.setPanelQuery('[data-new-token="0"]', newFields);

  internals.updateIntent(0);
  assert.equal(first.style.getPropertyValue('--color-primary'), '#222222');

  document.dispatch('click', {
    target: second,
    altKey: false,
    composedPath: () => [],
    preventDefault() {},
    stopImmediatePropagation() {}
  });
  assert.equal(first.style.getPropertyValue('--color-primary'), '#111111');
  assert.equal(first.style.getPropertyPriority('--color-primary'), 'important');

  internals.setStyleContext(first, { color: '#111111' }, [token], '#first');
  internals.setPanelQuery('[data-token-choice="0"]', select);
  internals.setPanelQuery('[data-new-token="0"]', newFields);
  internals.updateIntent(0);
  internals.dismiss();
  assert.equal(first.style.getPropertyValue('--color-primary'), '#111111');
  assert.equal(first.style.getPropertyPriority('--color-primary'), 'important');
});

test('successful agent send morphs through all five beats and restores the default CTA', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    fetch: async () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  });
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.renderPanel();
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);

  await internals.sendSelection();

  assert.equal(button.getAttribute('data-send-state'), 'collapse');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.disabled, true);
  assert.equal(status.textContent, 'Sent to agent');

  clock.tick(250);
  assert.equal(button.getAttribute('data-send-state'), 'dot');

  clock.tick(120);
  assert.equal(button.getAttribute('data-send-state'), 'trace');

  clock.tick(450);
  assert.equal(button.getAttribute('data-send-state'), 'sent');
  assert.match(button.innerHTML, /Sent to agent/);
  assert.match(button.innerHTML, /raven-grab-border-trace/);

  clock.tick(2299);
  assert.equal(button.getAttribute('data-send-state'), 'sent');

  clock.tick(1);
  assert.equal(button.getAttribute('data-send-state'), 'default');
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.disabled, false);
  assert.match(button.innerHTML, /Send to agent/);
});

test('successful component-request morph shows Request created and restores Create request', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    config: {
      mode: 'standalone',
      tokens: {},
      grabEndpoint: null,
      componentRequestEndpoint: 'https://example.test/component-request'
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, mode: 'issue', url: 'https://github.com/o/r/issues/1', message: 'Request created' }) })
  });
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.setPanelQuery('[data-send-email]', button);
  internals.setPanelQuery('[data-status]', status);

  const sent = await internals.sendComponentRequest({
    issueType: 'Accessibility',
    issueSize: '1,000+',
    useCase: 'Keyboard users need an exposed focus-ring variant.',
    email: 'designer@example.com'
  });

  assert.equal(sent, true);
  assert.equal(button.getAttribute('data-send-state'), 'collapse');
  assert.match(status.innerHTML, /View request/);
  assert.match(status.innerHTML, /https:\/\/github\.com\/o\/r\/issues\/1/);
  assert.equal(status.getAttribute('data-kind'), 'success');

  clock.tick(820);
  assert.equal(button.getAttribute('data-send-state'), 'sent');
  assert.match(button.innerHTML, /Request created/);

  clock.tick(2300);
  assert.equal(button.getAttribute('data-send-state'), 'default');
  assert.match(button.innerHTML, /Create request/);
});

test('reduced motion skips dot and trace beats while preserving sent hold and reset', async () => {
  const clock = fakeClock();
  const { internals, document } = await loadOverlayInternals({
    setTimeout: clock.setTimeout,
    reducedMotion: true,
    fetch: async () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  });
  const button = document.createElement('button');
  const status = document.createElement('p');
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.renderPanel();
  internals.setPanelQuery('[data-send]', button);
  internals.setPanelQuery('[data-status]', status);

  await internals.sendSelection();

  assert.equal(button.getAttribute('data-send-state'), 'sent');
  assert.match(button.innerHTML, /Sent to agent/);
  clock.tick(1799);
  assert.equal(button.getAttribute('data-send-state'), 'sent');
  clock.tick(1);
  assert.equal(button.getAttribute('data-send-state'), 'default');
});

test('overlay form fields set explicit spellcheck behavior', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' });
  internals.renderPanel();
  assert.match(internals.getPanelHtml(), /<textarea class="raven-grab-textarea"[^>]*spellcheck="true"/);

  internals.switchTab('request');
  assert.match(internals.getPanelHtml(), /<textarea class="raven-grab-textarea raven-grab-use-case"[^>]*spellcheck="true"/);

  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(source, /data-component-email[^>]*spellcheck="false"/);
  assert.match(source, /data-style-input[\s\S]{0,120}spellcheck/);
});

test('overlay shows a disabled empty-state panel whenever grabbing is armed without a selection', async () => {
  const { internals } = await loadOverlayInternals();
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'false');
  assert.match(internals.getPanelHtml(), /raven-grab-element-placeholder[^>]*>Click an element to inspect</);
  assert.match(internals.getPanelHtml(), /data-tab="design"[^>]*aria-selected="true"/);
  assert.match(internals.getPanelHtml(), /data-send[^>]*disabled/);

  internals.setArmed(false);
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
  internals.setArmed(true);
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'false');
});

test('overlay collapses to an edge tab without clearing selection and expands from the tab', async () => {
  const { internals } = await loadOverlayInternals();
  internals.setStyleContext({ style: fakeStyle() }, { color: 'rgb(0, 0, 0)' }, [], '#kept-selection');
  internals.renderPanel();

  assert.equal(typeof internals.collapsePanel, 'function');
  internals.collapsePanel();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'true');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelAttribute('inert'), '');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'false');
  assert.match(internals.getPanelHtml(), /#kept-selection/);

  internals.dispatchEdgeTab('click', { stopPropagation() {} });
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'false');
  assert.equal(internals.getPanelAttribute('inert'), null);
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
  assert.match(internals.getPanelHtml(), /#kept-selection/);

  internals.collapsePanel();
  internals.dismiss();
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelAttribute('inert'), null);
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');

  internals.setStyleContext({ style: fakeStyle() }, {}, [], '#disarm-selection');
  internals.renderPanel();
  internals.collapsePanel();
  internals.setArmed(false);
  assert.equal(internals.getPanelAttribute('aria-hidden'), 'true');
  assert.equal(internals.getPanelAttribute('data-collapsed'), 'false');
  assert.equal(internals.getEdgeTabAttribute('aria-hidden'), 'true');
});

test('overlay header drag captures the pointer and clamps the panel inside an 8px viewport margin', async () => {
  const { internals } = await loadOverlayInternals();
  const headerTarget = {
    closest(selector) {
      if (selector === '.raven-grab-header') return this;
      return null;
    }
  };
  internals.setPanelRect({ left: 1080, top: 20, width: 360, height: 400 });

  internals.dispatchPanel('pointerdown', {
    target: headerTarget,
    pointerId: 7,
    button: 0,
    clientX: 1100,
    clientY: 40,
    preventDefault() {}
  });
  assert.equal(internals.getPanelCapturedPointer(), 7);
  assert.equal(internals.getPanelAttribute('data-dragging'), 'true');

  internals.dispatchPanel('pointermove', { pointerId: 7, clientX: 2000, clientY: 0 });
  assert.equal(internals.getPanelStyle('right'), 'auto');
  assert.equal(internals.getPanelStyle('left'), '1072px');
  assert.equal(internals.getPanelStyle('top'), '8px');

  internals.dispatchPanel('pointerup', { pointerId: 7 });
  assert.equal(internals.getPanelCapturedPointer(), null);
  assert.equal(internals.getPanelAttribute('data-dragging'), null);
});

test('overlay renders color swatches beside custom token values and inline color style editors', async () => {
  const { internals, document } = await loadOverlayInternals();
  const element = { style: fakeStyle() };
  internals.setStyleContext(
    element,
    { color: 'rgb(17, 34, 51)', padding: '16px' },
    [{ property: 'background-color', name: 'surface', value: '#112233', cssVar: '--color-surface', bridgeToken: { path: 'colors.surface' } }]
  );
  internals.renderPanel();
  assert.match(internals.getPanelHtml(), /type="color"[^>]*data-new-color="0"[^>]*value="#112233"/);
  assert.match(internals.getPanelHtml(), /data-new-value="0"[^>]*spellcheck="false"/);

  const tokenSelect = document.createElement('select');
  tokenSelect.value = '__new__';
  const newFields = document.createElement('div');
  const nameInput = document.createElement('input');
  nameInput.value = 'surface-custom';
  const valueInput = document.createElement('input');
  valueInput.setAttribute('data-new-value', '0');
  valueInput.value = '#112233';
  internals.setPanelQuery('[data-token-choice="0"]', tokenSelect);
  internals.setPanelQuery('[data-new-token="0"]', newFields);
  internals.setPanelQuery('[data-new-name="0"]', nameInput);
  internals.setPanelQuery('[data-new-value="0"]', valueInput);
  const tokenColor = document.createElement('input');
  tokenColor.setAttribute('data-new-color', '0');
  tokenColor.value = '#abcdef';
  internals.dispatchPanel('input', { target: tokenColor });
  assert.equal(valueInput.value, '#abcdef');
  assert.equal(element.style.getPropertyValue('--color-surface'), '#abcdef');
  assert.equal(internals.payloadForSend().tokenIntents[0].newTokenValue, '#abcdef');

  valueInput.value = 'definitely-invalid';
  internals.dispatchPanel('input', { target: valueInput });
  assert.equal(newFields.getAttribute('data-error'), 'true');
  assert.equal(element.style.getPropertyValue('--color-surface'), '#abcdef');
  assert.equal(internals.payloadForSend().tokenIntents[0].newTokenValue, '#abcdef');

  const colorRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'color' : null; },
    setAttribute() {},
    replaceChild(next) {
      this.child = next;
      next.parentElement = this;
      next.parentNode = this;
    }
  };
  const colorCell = document.createElement('code');
  colorCell.textContent = 'rgb(17, 34, 51)';
  colorCell.parentElement = colorRow;
  colorCell.parentNode = colorRow;
  internals.beginStyleEdit(colorCell);
  assert.equal(colorRow.child.className, 'raven-grab-style-editor');
  assert.equal(colorRow.child.children.some((child) => child.type === 'color'), true);
  assert.equal(colorRow.child.children.some((child) => child.type === 'text' && child.getAttribute('spellcheck') === 'false'), true);
  const styleColor = colorRow.child.children.find((child) => child.type === 'color');
  styleColor.value = '#abcdef';
  styleColor.dispatch('change', {});
  assert.equal(element.style.getPropertyValue('color'), '#abcdef');
  assert.equal(internals.styleEditsForSend().find((edit) => edit.property === 'color').newValue, '#abcdef');

  const paddingRow = {
    child: null,
    getAttribute(name) { return name === 'data-style-property' ? 'padding' : null; },
    setAttribute() {},
    replaceChild(next) { this.child = next; next.parentElement = this; next.parentNode = this; }
  };
  const paddingCell = document.createElement('code');
  paddingCell.textContent = '16px';
  paddingCell.parentElement = paddingRow;
  paddingCell.parentNode = paddingRow;
  internals.beginStyleEdit(paddingCell);
  // Single-value numerics get a number field plus a UNIT DROPDOWN (the unit is a
  // choice — px/pt/rem/cm — not a fixed tag), wrapped in the editor container.
  assert.equal(paddingRow.child.className, 'raven-grab-style-editor');
  const paddingNumber = paddingRow.child.children.find((child) => child.type === 'number');
  assert.ok(paddingNumber, 'padding value should render a number input');
  assert.equal(paddingNumber.value, '16');
  const paddingUnit = paddingRow.child.children.find((child) => child.className === 'raven-grab-style-unit');
  assert.ok(paddingUnit, 'padding value should render a selectable unit control');
  assert.match(paddingUnit.innerHTML, /value="px"[^>]*selected/, 'current unit px is preselected');
  assert.match(paddingUnit.innerHTML, /value="pt"/, 'alternative units are offered');

  const computed = internals.computedStylesFor({
    computedStyle: fakeStyle({
      background: 'rgb(1, 2, 3)',
      'outline-color': 'rgb(4, 5, 6)',
      fill: 'rgb(7, 8, 9)',
      stroke: 'rgb(10, 11, 12)'
    })
  });
  assert.deepEqual(
    ['background', 'outline-color', 'fill', 'stroke'].map((property) => computed[property]),
    ['rgb(1, 2, 3)', 'rgb(4, 5, 6)', 'rgb(7, 8, 9)', 'rgb(10, 11, 12)']
  );
});

test('overlay panel CSS keeps only the body scrollable and provides the collapsed edge tab', async () => {
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  assert.match(source, /\.raven-grab-panel \{[\s\S]*max-height: calc\(100vh - 40px\); overflow: hidden;[\s\S]*flex-direction: column;/);
  assert.match(source, /\.raven-grab-top \{ flex: 0 0 auto;/);
  assert.match(source, /\.raven-grab-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto;/);
  assert.match(source, /\.raven-grab-actions \{ flex: 0 0 auto;/);
  assert.match(source, /\.raven-grab-collapsible-inner \{[^}]*visibility: visible;[^}]*transition: visibility 0s linear;/);
  assert.match(source, /\.raven-grab-collapsible\[data-open="false"\] \.raven-grab-collapsible-inner \{ visibility: hidden; transition-delay: 150ms; \}/);
  assert.doesNotMatch(source, /\.raven-grab-arm\b/);
  assert.match(source, /\.raven-grab-panel\[data-collapsed="true"\] \{[^}]*transform: translateX\(calc\(100vw \+ 100%\)\);[^}]*pointer-events: none;/);
  assert.match(source, /\.raven-grab-edge-tab \{[\s\S]*right: 0; top: 33px;[\s\S]*width: 44px; min-height: 44px;[\s\S]*background: rgba\(22, 44, 66, \.9\);[\s\S]*border-radius: 12px 0 0 12px;/);
  assert.match(source, /\.raven-grab-header \{[\s\S]*cursor: grab;/);
  assert.match(source, /\.raven-grab-panel\[data-dragging="true"\] \.raven-grab-header \{ cursor: grabbing; \}/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /Math\.max\(8, Math\.min\([^;]*innerWidth[^;]*- 8/);
  assert.match(source, /Math\.max\(8, Math\.min\([^;]*innerHeight[^;]*- 8/);
  assert.match(source, /window\.addEventListener\("resize", function \(\) \{[\s\S]*clampPanelToViewport\(\)/);
  assert.match(source, /\.raven-grab-send\[data-send-state="collapse"\]/);
  assert.match(source, /\.raven-grab-send\[data-send-state="dot"\][\s\S]*width: 12px;[\s\S]*height: 12px;[\s\S]*background: #00BFFF;/);
  assert.match(source, /\.raven-grab-send\[data-send-state="trace"\][\s\S]*background: transparent;/);
  assert.match(source, /@keyframes raven-grab-draw[\s\S]*stroke-dashoffset: 0;/);
  assert.match(source, /\.raven-grab-send\[data-send-state="sent"\][\s\S]*background: rgba\(22, 44, 66, \.9\);[\s\S]*border: 1px solid transparent;[\s\S]*backdrop-filter: blur\(6px\);/);
  assert.match(source, /@keyframes raven-grab-static-border[\s\S]*100% \{ border-color: #00BFFF; \}/);
  assert.match(source, /raven-grab-border-trace[\s\S]*pathLength="1"/);
  assert.match(source, /\.raven-grab-border-trace rect[\s\S]*stroke-dasharray: 1;[\s\S]*stroke-dashoffset: 1;/);
  assert.match(source, /@keyframes raven-grab-trace-border[\s\S]*stroke-dashoffset: 0;/);
  assert.match(source, /\.raven-grab-sent-message[\s\S]*clip-path/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.raven-grab-panel, \.raven-grab-send, \.raven-grab-textarea \{ transition: none !important; \}/);
});

test('browser overlay mirrors the web overlay byte-for-byte', async () => {
  const source = await readFile(path.resolve(__dirname, '../browser/raven-grab.js'), 'utf8');
  const mirror = await readFile(path.resolve(__dirname, '../web/public/raven-grab.js'), 'utf8');
  assert.equal(source, mirror);
});
