import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RAVEN_NO_USAGE_LOG = '1';
// realpath matters on macOS, where the temporary directory commonly resolves
// through /private. The bridge's path validation intentionally rejects escapes.
process.env.RAVEN_GRAB_INBOX = realpathSync(mkdtempSync(path.join(tmpdir(), 'raven-grab-attachments-inbox-')));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  test('playwright available for overlay attachment test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');
const dirname = path.dirname(fileURLToPath(import.meta.url));
const attachmentDir = path.join(dirname, 'fixtures', 'attachments');
const heroPath = realpathSync(path.join(attachmentDir, 'hero.png'));
const heroBytes = Array.from(readFileSync(heroPath));

// Fixture elements sit on the open canvas (right of the left panel, below the
// top bar); a click on an element under the overlay host is ignored by design.
const HOST_PAGE = `<!doctype html><html><head><title>attachment host</title><style>
  body { margin: 0; }
  .stage { position: absolute; left: 440px; top: 120px; display: grid; gap: 24px; }
  img, #background-c { display: block; width: 160px; height: 90px; }
  #background-c { background-image: url('/old-c.png'); background-size: cover; }
</style></head><body><div class="stage">
  <img id="image-a" src="/old-a.png" alt="A">
  <picture id="picture-b"><source srcset="/old-b.webp" type="image/webp"><img id="picture-image" src="/old-b.png" alt="B"></picture>
  <div id="background-c"></div>
  <div id="wrapper-d" style="padding: 24px; border: 1px dashed #999"><picture><source srcset="/old-d.webp" type="image/webp"><img id="wrapper-image" src="/old-d.png" alt="D"></picture></div>
</div></body></html>`;

function standalonePage() {
  return HOST_PAGE.replace('<head>', '<head><script>window.RavenGrabConfig = { mode: "standalone", grabEndpoint: "https://example.invalid/grab" };</script>');
}

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

async function withOverlay(fn, hostPage = HOST_PAGE) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(hostPage);
  });
  const upstreamUrl = await listen(upstream);
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'raven-grab-attachments-'));
  const designPath = path.join(fixtureDir, 'DESIGN.md');
  writeFileSync(designPath, '# Attachment fixture\n', 'utf8');
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
    return await fn(page, session, fixtureDir);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

function skipIfNoBrowser(t, err) {
  if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
    t.skip(`browser unavailable for overlay attachments (${err.message})`);
    return true;
  }
  return false;
}

// The overlay host covers the viewport, so page.click() fails actionability;
// raw mouse events at the element's centre are what a pointer produces.
async function select(page, selector) {
  const at = await page.evaluate((sel) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    return root && root.querySelector('.raven-grab-label')?.style.display === 'block';
  }, null, { timeout: 5000 });
}

async function transfer(page, kind, { bytes = heroBytes, name = 'hero.png', type = 'image/png', text = '' } = {}) {
  await page.evaluate(({ kind, bytes, name, type, text }) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const target = kind === 'paste' ? root.querySelector('[data-instruction]') : root.querySelector('.raven-grab-composer');
    const dt = new DataTransfer();
    if (bytes) dt.items.add(new File([new Uint8Array(bytes)], name, { type }));
    if (text) dt.setData('text/plain', text);
    const event = kind === 'paste'
      ? new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      : new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
  }, { kind, bytes, name, type, text });
}

async function readyChip(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-attachment-chip][data-state="ready"]')));
  return page.evaluate(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const chip = root.querySelector('[data-attachment-chip][data-state="ready"]');
    return {
      id: chip?.getAttribute('data-attachment-id'),
      state: chip?.getAttribute('data-state'),
      name: chip?.querySelector('[data-attachment-name]')?.textContent,
      dims: chip?.querySelector('[data-attachment-dims]')?.textContent,
      placeholder: root.querySelector('[data-instruction]')?.getAttribute('placeholder')
    };
  });
}

async function notice(page) {
  return page.evaluate(() => document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-attachment-notice]')?.textContent);
}

async function send(page) {
  await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-queue-draft]').click());
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    const button = root?.querySelector('[data-send-batch]');
    return Boolean(button && !button.disabled);
  });
  await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-send-batch]').click());
}

test('drop of a PNG File on the composer', async (t) => {
  try {
    await withOverlay(async (page) => {
      const attachmentRequests = [];
      page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/attachment') attachmentRequests.push(request); });
      await select(page, '#image-a');
      const attachmentResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/attachment');
      await transfer(page, 'drop');
      const chip = await readyChip(page);
      assert.deepEqual({ state: chip.state, name: chip.name, dims: chip.dims }, { state: 'ready', name: 'hero.png', dims: '16×9' });
      assert.equal(chip.placeholder, 'Replace this image with the attached one');
      assert.equal(attachmentRequests.length, 1);
      assert.equal((await attachmentResponse).status(), 202);
      await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-tab="assets"]').click());
      await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-tab="layers"]').click());
      assert.equal((await readyChip(page)).id, chip.id, 'attachment survives a panel re-render');
    });
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

test('paste with clipboardData.files', async (t) => {
  try {
    await withOverlay(async (page) => {
      await select(page, '#image-a');
      await transfer(page, 'paste');
      const chip = await readyChip(page);
      const grabResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/grab');
      await send(page);
      await grabResponse;
      const drained = await bridge.getGrabbedElements();
      assert.equal(chip.name, 'hero.png');
      assert.equal(drained.elements[0].attachments[0].origin, 'paste');
    });
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

test('text/plain drop of an absolute path to hero.png', async (t) => {
  try {
    await withOverlay(async (page, _session, projectDir) => {
      // The path route accepts files under the home directory or the session's
      // project directory; a checkout outside both must not fail the test.
      // The dropped path has to be a realpath (a symlinked one is refused);
      // the bridge's project dir is the tmpdir form, which on macOS goes through
      // a symlink, so this also covers containment against a symlinked project.
      const projectHero = path.join(projectDir, 'hero.png');
      writeFileSync(projectHero, readFileSync(heroPath));
      await select(page, '#image-a');
      await transfer(page, 'drop', { bytes: null, text: realpathSync(projectHero) });
      const chip = await readyChip(page);
      assert.deepEqual({ name: chip.name, dims: chip.dims }, { name: 'hero.png', dims: '16×9' });
      assert.equal(await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-instruction]').value), '');
    });
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

test('drop with no selection', async (t) => {
  try {
    await withOverlay(async (page) => {
      let requests = 0;
      page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/attachment') requests += 1; });
      await transfer(page, 'drop');
      await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-attachment-notice]')?.textContent === 'Select the image to replace first');
      assert.equal(await notice(page), 'Select the image to replace first');
      assert.equal(requests, 0);
    });
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

test('drop of notes.txt', async (t) => {
  try {
    await withOverlay(async (page) => {
      let requests = 0;
      page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/attachment') requests += 1; });
      await select(page, '#image-a');
      await transfer(page, 'drop', { bytes: Array.from(readFileSync(path.join(attachmentDir, 'notes.txt'))), name: 'notes.txt', type: 'text/plain' });
      await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-attachment-notice]')?.textContent));
      assert.match(await notice(page), /text\/plain/);
      assert.equal(requests, 0);
    });
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

test('selection switch', async (t) => {
  try {
    await withOverlay(async (page) => {
      await select(page, '#image-a');
      await transfer(page, 'drop');
      const chip = await readyChip(page);
      await select(page, '#picture-b');
      assert.equal(await page.evaluate(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelectorAll('[data-attachment-chip]').length), 0);
      await select(page, '#image-a');
      assert.equal((await readyChip(page)).id, chip.id);
    });
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

// One session per carrier: in authoring mode the overlay holds the next send
// until the agent has applied the previous change, so three sends in one
// session would block on the second by design.
test('send', async (t) => {
  try {
    for (const [selector, kind] of [['#image-a', 'img'], ['#picture-b', 'picture'], ['#background-c', 'background']]) {
      await withOverlay(async (page) => {
        const grabBodies = [];
        page.on('request', (request) => {
          if (request.method() === 'POST' && new URL(request.url()).pathname === '/grab') grabBodies.push(request.postDataJSON());
        });
        await select(page, selector);
        await transfer(page, 'drop');
        const chip = await readyChip(page);
        const grabResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/grab');
        await send(page);
        await grabResponse;
        const drained = await bridge.getGrabbedElements();
        assert.equal(drained.count, 1, `${selector}: one drained element`);
        const item = drained.elements[0];
        assert.equal(item.attachments[0].id, chip.id, `${selector}: drained attachment id matches the chip`);
        assert.equal(existsSync(item.attachments[0].path), true, `${selector}: attachment path exists on disk`);
        assert.equal(item.imageTarget.kind, kind, `${selector}: imageTarget.kind`);
        const body = grabBodies.at(-1);
        assert.deepEqual(body.attachments, [{ id: chip.id }], `${selector}: /grab body carries only the id`);
        assert.equal('bytes' in body.attachments[0], false);
        assert.equal('base64' in body.attachments[0], false);
        assert.equal(body.imageTarget.kind, kind, `${selector}: /grab body imageTarget.kind`);
      });
    }
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

test('window.RavenGrabConfig = { mode: "standalone", grabEndpoint: "https://example.invalid/grab" }', async (t) => {
  try {
    await withOverlay(async (page) => {
      let requests = 0;
      page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/attachment') requests += 1; });
      await select(page, '#image-a');
      await transfer(page, 'drop');
      await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]')?.shadowRoot?.querySelector('[data-attachment-notice]')?.textContent === 'Attachments need the local Raven bridge');
      assert.equal(await notice(page), 'Attachments need the local Raven bridge');
      assert.equal(requests, 0);
    }, standalonePage());
  } catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
});

// Observe ownership through the real DOM and URL API; no overlay internals are exposed.
async function trackThumbs(page) {
  await page.evaluate(() => {
    window.attachmentUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.attachmentUrls.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => { window.attachmentUrls.revoked.push(url); revoke(url); };
  });
}

async function clickOverlay(page, selector) {
  await page.evaluate((selector) => {
    const button = document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector(selector);
    if (!button) throw new Error(`Missing overlay control: ${selector}`);
    button.click();
  }, selector);
}

async function typeInstruction(page, text) {
  await page.evaluate((text) => {
    const field = document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-instruction]');
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

async function holdUpload(page) {
  let release;
  let started;
  const held = new Promise((resolve) => { release = resolve; });
  const requested = new Promise((resolve) => { started = resolve; });
  await page.route((url) => url.pathname === '/attachment', async (route) => {
    started();
    await held;
    await route.continue();
  });
  return { requested, release };
}

function lifecycleTest(name, fn) {
  test(name, async (t) => {
    try { await withOverlay(fn); }
    catch (err) { if (skipIfNoBrowser(t, err)) return; throw err; }
  });
}

lifecycleTest('mid-upload panel rebuild and A→B→A preserve the stashed chip identity', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  const upload = await holdUpload(page);
  try {
    await transfer(page, 'drop');
    await upload.requested;
    await clickOverlay(page, '[data-tab="assets"]');
    await clickOverlay(page, '[data-tab="layers"]');
    assert.equal(await page.locator('[data-attachment-chip][data-state="uploading"]').count(), 1);
    await select(page, '#picture-b');
    assert.equal(await page.locator('[data-attachment-chip]').count(), 0);
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/attachment' && r.request().method() === 'POST');
    upload.release();
    await response;
    await select(page, '#image-a');
    assert.equal((await readyChip(page)).name, 'hero.png');
    assert.deepEqual(await page.evaluate(() => window.attachmentUrls.revoked), []);
  } finally { upload.release(); }
});

lifecycleTest('removing the active instruction tray row preserves its attachment', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  await transfer(page, 'drop');
  const chip = await readyChip(page);
  await typeInstruction(page, 'Replace this');
  await clickOverlay(page, '[data-remove-change^="draft-instruction:"]');
  assert.equal((await readyChip(page)).id, chip.id);
  assert.equal(await page.locator('[data-instruction]').inputValue(), '');
  assert.deepEqual(await page.evaluate(() => window.attachmentUrls.revoked), []);
});

lifecycleTest('A→B tray removal of A’s stashed attachment does not resurrect on A', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  await transfer(page, 'drop');
  await readyChip(page);
  await select(page, '#picture-b');
  await clickOverlay(page, '[data-remove-change^="draft-attachment:"]');
  await select(page, '#image-a');
  assert.equal(await page.locator('[data-attachment-chip]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.attachmentUrls.revoked), await page.evaluate(() => window.attachmentUrls.created));
});

lifecycleTest('direct tray send of an active attachment revokes its thumbnail exactly once', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  await transfer(page, 'drop');
  const chip = await readyChip(page);
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  // Deliberately bypass Add to queue: active and frozen snapshots share the chip.
  await clickOverlay(page, '[data-send-batch]');
  assert.deepEqual((await request).postDataJSON().attachments, [{ id: chip.id }]);
  assert.equal(await page.locator('[data-attachment-chip]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.attachmentUrls.revoked), await page.evaluate(() => window.attachmentUrls.created));
});

lifecycleTest('dismiss clears both active and stashed attachment URLs exactly once', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  await transfer(page, 'drop');
  await readyChip(page);
  await select(page, '#picture-b');
  await transfer(page, 'drop');
  await readyChip(page);
  await page.keyboard.press('Alt+g');
  const urls = await page.evaluate(() => window.attachmentUrls);
  assert.equal(urls.created.length, 2);
  assert.deepEqual([...urls.revoked].sort(), [...urls.created].sort());
});

lifecycleTest('batch send blocks an upload in a stashed draft while another draft has work', async (page) => {
  await select(page, '#image-a');
  const upload = await holdUpload(page);
  try {
    await transfer(page, 'drop');
    await upload.requested;
    assert.equal(await page.locator('[data-queue-draft]').getAttribute('title'), 'Wait for the upload to finish');
    await select(page, '#picture-b');
    await typeInstruction(page, 'Keep this image');
    assert.equal(await page.locator('[data-send-batch]').isDisabled(), true);
    assert.equal(await page.locator('[data-send-batch]').textContent(), 'Wait for the upload to finish');
    const requests = [];
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/grab' && r.method() === 'POST') requests.push(r); });
    // Also exercise the handler, even if a stale button was enabled before upload.
    await page.evaluate(() => {
      const button = document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-send-batch]');
      button.disabled = false;
      button.click();
    });
    assert.equal(requests.length, 0);
    await select(page, '#image-a');
    upload.release();
    await readyChip(page);
    assert.equal(await page.locator('[data-send-batch]').isDisabled(), false);
  } finally { upload.release(); }
});

lifecycleTest('error-only draft is not queue work and error chips never reach a payload', async (page) => {
  await page.route((url) => url.pathname === '/attachment', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid image' }) }));
  await select(page, '#image-a');
  await transfer(page, 'drop');
  await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-attachment-chip][data-state="error"]'));
  assert.equal(await page.locator('[data-queue-draft]').getAttribute('aria-disabled'), 'true');
  assert.equal(await page.locator('[data-send-batch]').isDisabled(), true);
  assert.equal(await page.locator('[data-remove-change^="draft-attachment:"]').count(), 0);
  await typeInstruction(page, 'Keep the original');
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  await send(page);
  assert.deepEqual((await request).postDataJSON().attachments, []);
});

lifecycleTest('detached queued draft refreshes attachment IDs after tray removal and revokes URLs', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  await transfer(page, 'drop');
  const first = await readyChip(page);
  await transfer(page, 'paste', { name: 'second.png' });
  await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelectorAll('[data-attachment-chip][data-state="ready"]').length === 2);
  const ids = await page.locator('[data-attachment-chip]').evaluateAll((chips) => chips.map((chip) => chip.getAttribute('data-attachment-id')));
  await clickOverlay(page, '[data-queue-draft]');
  // Remove and detach in one task, before the debounced persistence can freshen.
  await page.evaluate((id) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    root.querySelector(`[data-remove-change$=":${id}"]`).click();
    document.querySelector('#image-a').remove();
    root.querySelector('[data-tab="assets"]').click();
  }, first.id);
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  await clickOverlay(page, '[data-send-batch]');
  assert.deepEqual((await request).postDataJSON().attachments, [{ id: ids.find((id) => id !== first.id) }]);
  const urls = await page.evaluate(() => window.attachmentUrls);
  assert.deepEqual([...urls.revoked].sort(), [...urls.created].sort());
});

lifecycleTest('active multi-select draft detached during upload keeps its context in the carried attachment', async (page) => {
  await trackThumbs(page);
  await select(page, '#image-a');
  await page.keyboard.down('Shift');
  try { await select(page, '#picture-b'); } finally { await page.keyboard.up('Shift'); }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('react-grab:element-selected', {
    detail: { componentName: 'Hero', filePath: 'src/Hero.tsx', line: 12 }
  })));
  const upload = await holdUpload(page);
  try {
    await transfer(page, 'drop');
    await upload.requested;
    await page.evaluate(() => {
      document.querySelector('#picture-b').remove();
      document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-tab="assets"]').click();
    });
    assert.deepEqual(await page.evaluate(() => window.attachmentUrls.revoked), []);
    upload.release();
    await page.waitForFunction(() => document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('[data-remove-change^="carried:"]'));
    const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
    await clickOverlay(page, '[data-send-batch]');
    const body = (await request).postDataJSON();
    assert.equal(body.selector, '#picture-image');
    assert.equal(body.imageTarget.kind, 'picture');
    assert.equal(body.componentName, 'Hero');
    assert.equal(body.filePath, 'src/Hero.tsx');
    assert.equal(body.line, 12);
    assert.equal(body.multiSelect.length, 2);
    assert.deepEqual(body.multiSelect.map((item) => item.selector), ['#image-a', '#picture-image']);
    assert.equal(body.attachments.length, 1);
    assert.deepEqual(Object.keys(body.attachments[0]), ['id']);
    assert.deepEqual(await page.evaluate(() => window.attachmentUrls.revoked), await page.evaluate(() => window.attachmentUrls.created));
  } finally { upload.release(); }
});

lifecycleTest('multi-select drop belongs only to the primary draft and its imageTarget', async (page) => {
  await select(page, '#image-a');
  await page.keyboard.down('Shift');
  try { await select(page, '#picture-b'); } finally { await page.keyboard.up('Shift'); }
  await transfer(page, 'drop');
  const chip = await readyChip(page);
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  await send(page);
  const body = (await request).postDataJSON();
  assert.deepEqual(body.attachments, [{ id: chip.id }]);
  assert.equal(body.imageTarget.kind, 'picture');
  assert.equal(body.multiSelect.length, 2);
  assert.ok(body.multiSelect.every((selection) => !('attachments' in selection)));
});

lifecycleTest('chip stacks the name above the dimensions', async (page) => {
  await select(page, '#image-a');
  await transfer(page, 'drop');
  await readyChip(page);
  const boxes = await page.evaluate(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const name = root.querySelector('[data-attachment-name]').getBoundingClientRect();
    const dims = root.querySelector('[data-attachment-dims]').getBoundingClientRect();
    return { nameBottom: name.bottom, dimsTop: dims.top, nameLeft: name.left, dimsLeft: dims.left };
  });
  assert.ok(boxes.dimsTop >= boxes.nameBottom - 1, `dims (top ${boxes.dimsTop}) must sit below the name (bottom ${boxes.nameBottom})`);
  assert.equal(Math.round(boxes.dimsLeft), Math.round(boxes.nameLeft));
});

// ---- adverse-pass findings (L10) ----

// Click inside the padding so the wrapper itself, not its image, is hit.
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

lifecycleTest('a wrapper around a single <picture> reports that picture as the target', async (page) => {
  await selectAt(page, '#wrapper-d', 6, 6);
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  await typeInstruction(page, 'Swap this');
  await send(page);
  const body = (await request).postDataJSON();
  assert.equal(body.selector, '#wrapper-d');
  assert.equal(body.imageTarget?.kind, 'picture', `expected a picture target, got ${JSON.stringify(body.imageTarget)}`);
  assert.equal(body.imageTarget.selector, '#wrapper-image');
});

lifecycleTest('a File with an empty MIME type uploads with the type inferred from its name', async (page) => {
  await select(page, '#image-a');
  await transfer(page, 'drop', { type: '' });
  const chip = await readyChip(page);
  assert.equal(chip.name, 'hero.png');
  assert.equal(chip.dims, '16×9');
});

lifecycleTest('a stored draft keeps its own React source file in imageTarget', async (page) => {
  await select(page, '#image-a');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('react-grab:element-selected', { detail: { componentName: 'HeroA', filePath: 'src/HeroA.tsx', line: 3 } })));
  await transfer(page, 'drop');
  await readyChip(page);
  await clickOverlay(page, '[data-queue-draft]');
  await select(page, '#picture-b');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('react-grab:element-selected', { detail: { componentName: 'HeroB', filePath: 'src/HeroB.tsx', line: 9 } })));
  const request = page.waitForRequest((r) => new URL(r.url()).pathname === '/grab' && r.method() === 'POST');
  await clickOverlay(page, '[data-send-batch]');
  const body = (await request).postDataJSON();
  assert.equal(body.filePath, 'src/HeroA.tsx');
  assert.equal(body.imageTarget?.sourceFile?.filePath, 'src/HeroA.tsx', `expected the draft's own source file, got ${JSON.stringify(body.imageTarget?.sourceFile)}`);
});
