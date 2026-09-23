import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_GRAB_INBOX = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-grab-followups-inbox-')));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  test('playwright available for overlay followups', (t) => t.skip(`playwright not installed (${err.message})`));
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');
const dirname = path.dirname(fileURLToPath(import.meta.url));
const heroBytes = readFileSync(path.join(dirname, 'fixtures', 'attachments', 'hero.png'));
const HOST_PAGE = `<!doctype html><html><head><title>followups host</title><style>
  body { margin: 0; }
  .stage { position: absolute; left: 440px; top: 120px; display: grid; gap: 24px; }
  .stage > div { width: 160px; height: 90px; }
  #gradient { background-image: linear-gradient(red, blue); }
  #url { background-image: url('/old.png'); }
  #layered { background-image: linear-gradient(red, blue), url('/old.png'); }
</style></head><body><div class="stage">
  <div id="gradient"></div><div id="url"></div><div id="layered"></div>
</div></body></html>`;

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function withOverlay(fn) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HOST_PAGE);
  });
  const upstreamUrl = await listen(upstream);
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'raven-grab-followups-'));
  const designPath = path.join(fixtureDir, 'DESIGN.md');
  writeFileSync(designPath, '# Followups fixture\n', 'utf8');
  const session = await bridge.startGrabSession(designPath, undefined, upstreamUrl, 'consumer');
  if (session.mode !== 'server') {
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
    throw new Error(session.warning || 'Sandboxed environment: no real HTTP server is listening');
  }
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

function overlayTest(name, fn) {
  test(name, async (t) => {
    try { await withOverlay(fn); }
    catch (err) {
      if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
        t.skip(`browser unavailable for overlay followups (${err.message})`);
        return;
      }
      throw err;
    }
  });
}

async function selectAt(page, selector, dx, dy) {
  const at = await page.evaluate(({ sel, dx, dy }) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + dx, y: rect.top + dy };
  }, { sel: selector, dx, dy });
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    return root && root.querySelector('.raven-grab-label')?.style.display === 'block';
  }, null, { timeout: 5000 });
}

async function typeInstruction(page, text) {
  await page.evaluate((text) => {
    const field = document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-instruction]');
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

async function pastePath(page, text) {
  await page.evaluate((value) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const data = new DataTransfer();
    data.setData('text/plain', value);
    root.querySelector('[data-instruction]').dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data, bubbles: true, cancelable: true
    }));
  }, text);
}

async function readyChip(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-attachment-chip][data-state="ready"]')));
  return page.evaluate(() => {
    const chip = document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-attachment-chip][data-state="ready"]');
    return { id: chip.getAttribute('data-attachment-id'), state: chip.getAttribute('data-state'), thumb: chip.querySelector('img.raven-grab-attachment-thumb')?.getAttribute('src') };
  });
}

async function send(page) {
  await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-queue-draft]').click());
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-send-batch]');
    return Boolean(button && !button.disabled);
  });
  await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-send-batch]').click());
}

overlayTest('gradient background target has backgroundHasUrl false', async (page) => {
  await selectAt(page, '#gradient', 8, 8);
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  await typeInstruction(page, 'Replace this image');
  await send(page);
  const target = (await request).postDataJSON().imageTarget;
  assert.equal(target.kind, 'background');
  assert.equal(target.backgroundHasUrl, false);
});

for (const [selector, name] of [['#url', 'url()'], ['#layered', 'layered gradient and url()']]) {
  overlayTest(`${name} background target has backgroundHasUrl true`, async (page) => {
    await selectAt(page, selector, 8, 8);
    const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
    await typeInstruction(page, 'Replace this image');
    await send(page);
    const target = (await request).postDataJSON().imageTarget;
    assert.equal(target.kind, 'background');
    assert.equal(target.backgroundHasUrl, true);
  });
}

for (const [input, expected, name] of [
  ["'/abs/My Folder/x.png'", '/abs/My Folder/x.png', 'quoted path'],
  ['"/abs/My Folder/x.png"', '/abs/My Folder/x.png', 'double-quoted path'],
  ['/abs/My\\ Folder/x.png', '/abs/My Folder/x.png', 'shell-escaped path'],
  ['~/x.png', '~/x.png', 'home path']
]) {
  overlayTest(`${name} posts normalized path and reaches a ready chip`, async (page) => {
    const posts = [];
    await page.route((url) => url.pathname === '/attachment', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'att-path', name: 'x.png', mime: 'image/png', bytes: heroBytes.length, width: 16, height: 9 }) });
    });
    await selectAt(page, '#url', 8, 8);
    await pastePath(page, input);
    const chip = await readyChip(page);
    assert.equal(chip.state, 'ready');
    assert.deepEqual(posts, [{ path: expected, origin: 'path' }]);
  });
}

overlayTest('path chip renders bridge thumbnail and removal never revokes the bridge URL', async (page) => {
  const id = 'att-with-id';
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route((url) => url.pathname === '/attachment', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id, name: 'x.png', mime: 'image/png', bytes: heroBytes.length, width: 16, height: 9 }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'image/png', body: heroBytes });
    }
  });
  await selectAt(page, '#url', 8, 8);
  await page.evaluate(() => {
    window.revokedAttachmentUrls = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { window.revokedAttachmentUrls.push(url); revoke(url); };
  });
  await pastePath(page, '/abs/x.png');
  const chip = await readyChip(page);
  assert.ok(chip.thumb, 'ready chip has an img.raven-grab-attachment-thumb');
  assert.match(chip.thumb, /\/attachment\?key=[^&]*&id=att-with-id$/);
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('img.raven-grab-attachment-thumb');
    return img?.naturalWidth === 16;
  });
  await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-attachment-remove]').click());
  assert.equal(await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelectorAll('[data-attachment-chip]').length), 0);
  assert.deepEqual(await page.evaluate(() => window.revokedAttachmentUrls), []);
  assert.deepEqual(pageErrors, []);
});
