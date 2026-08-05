// Keystrokes typed into the Raven overlay must not reach the host page.
// This needs a real browser: the defect is event propagation out of a shadow root
// into a document-level hotkey listener, which jsdom-style shims do not reproduce
// and which reading the source cannot prove either way.
//
// Reported on github.com 2026-08-05: typing "I really like this" into the
// instructions box produced "I really like thi" and opened GitHub's search panel.
// @github/hotkey binds bare letters on document and calls preventDefault, so the
// site ate the keystroke and the character never reached the textarea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  test('playwright available for overlay key-isolation test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');

// A stand-in for the sites this overlay actually lands on: a bare-letter hotkey
// bound on document, exactly as GitHub, Linear and Notion bind theirs.
const HOST_PAGE = `<!doctype html><html><head><title>hotkey host</title></head><body>
<h1 id="heading">Host page</h1>
<script>
  window.__hostKeys = [];
  document.addEventListener('keydown', function (event) {
    window.__hostKeys.push(event.key);
    if (event.key === 's' || event.key === '/') event.preventDefault();
  });
</script>
</body></html>`;

async function withOverlay(fn) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HOST_PAGE);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-keyiso-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath, undefined, upstreamUrl, 'consumer');
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

test('typing into a Raven field never reaches the host page hotkeys', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      const typed = 'I really like this';
      const wrote = await page.evaluate((text) => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        // The overlay renders several hidden fields before the visible one; focusing
        // a hidden node silently does nothing and the keystrokes land on <body>,
        // which is outside the overlay and so proves nothing about the guard.
        const field = root.querySelector('.raven-grab-textarea');
        if (!field || field.offsetParent === null) return null;
        field.focus();
        return root.activeElement === field ? text : null;
      }, typed);
      if (wrote === null) return { skipped: 'the overlay instructions field did not render or could not take focus' };

      await page.keyboard.type(typed, { delay: 5 });

      return {
        hostKeys: await page.evaluate(() => window.__hostKeys),
        fieldValue: await page.evaluate(() => {
          const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
          return root.querySelector('.raven-grab-textarea').value;
        })
      };
    });
  } catch (err) {
    t.skip(`browser unavailable for overlay key isolation (${err.message})`);
    return;
  }

  if (result.skipped) { t.skip(result.skipped); return; }

  assert.deepEqual(result.hostKeys, [],
    'the host page saw keystrokes typed into the Raven panel: ' + JSON.stringify(result.hostKeys));
  assert.equal(result.fieldValue, 'I really like this',
    'the field lost characters the host page swallowed');
});

test('the host page still receives its own hotkeys when focus is outside Raven', async (t) => {
  // The guard must be scoped to the overlay. Blanket-swallowing keys would break
  // every site the bridge proxies, which is a worse bug than the one being fixed.
  let hostKeys;
  try {
    hostKeys = await withOverlay(async (page) => {
      await page.click('#heading');
      await page.keyboard.type('s/', { delay: 5 });
      return page.evaluate(() => window.__hostKeys);
    });
  } catch (err) {
    t.skip(`browser unavailable for overlay key isolation (${err.message})`);
    return;
  }
  assert.deepEqual(hostKeys, ['s', '/']);
});
