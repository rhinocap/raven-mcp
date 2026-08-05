// Keystrokes typed into the Raven overlay must not reach the host page.
// This needs a real browser: the defect is event propagation out of a shadow root
// into a document-level hotkey listener, which jsdom-style shims do not reproduce
// and which reading the source cannot prove either way.
//
// Reported on github.com 2026-08-05: typing "I really like this" into the
// instructions box produced "I really like thi" and opened GitHub's search panel.
// @github/hotkey binds bare letters on document and calls preventDefault, so the
// site ate the keystroke and the character never reached the textarea.
//
// The overlay answers this in two places and they cover different phases, so the
// fixture below spies on BOTH. An earlier version of this file listened only in
// bubble phase and passed with the capture-phase guard deleted — it could not see
// half of what it existed to check. Reproduced against live github.com with both
// guards removed: fieldValue came back "I really like thi" with GitHub's dialog
// open, which is the reported symptom exactly.
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

// A stand-in for the sites this overlay actually lands on: bare-letter hotkeys
// bound on document, exactly as GitHub, Linear and Notion bind theirs. Both
// phases are recorded because the overlay guards them separately — a page that
// binds in capture (the second listener) is the case a host-level guard cannot
// reach at all.
const HOST_PAGE = `<!doctype html><html><head><title>hotkey host</title></head><body>
<h1 id="heading">Host page</h1>
<script>
  window.__hostKeys = [];
  window.__hostKeysCapture = [];
  document.addEventListener('keydown', function (event) {
    window.__hostKeys.push(event.key);
    if (event.key === 's' || event.key === '/') event.preventDefault();
  });
  document.addEventListener('keydown', function (event) {
    window.__hostKeysCapture.push(event.key);
  }, true);
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

// Focus a real Raven field and report what the page saw. Deliberately throws
// rather than returning a "skip me" sentinel: an overlay whose input cannot be
// found or focused is a defect, and reporting it as an inapplicable test is how
// this file previously stayed green through a broken build.
async function typeIntoRavenField(page, text) {
  const focused = await page.evaluate(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const field = root.querySelector('.raven-grab-textarea');
    if (!field) return 'no .raven-grab-textarea in the overlay';
    if (field.offsetParent === null) return 'the overlay field is not visible';
    field.focus();
    return root.activeElement === field ? null : 'the overlay field refused focus';
  });
  if (focused) throw new Error(focused);

  await page.keyboard.type(text, { delay: 5 });

  return page.evaluate(() => ({
    hostKeys: window.__hostKeys,
    hostKeysCapture: window.__hostKeysCapture,
    fieldValue: document.querySelector('[data-raven-grab-overlay]').shadowRoot.querySelector('.raven-grab-textarea').value
  }));
}

test('typing into a Raven field never reaches the host page hotkeys', async (t) => {
  // "I really like this" is the reported string and it is load-bearing: the
  // trailing "s" is the character GitHub swallowed. A string without a hotkey
  // letter in it would pass against a completely unguarded overlay.
  let result;
  try {
    result = await withOverlay((page) => typeIntoRavenField(page, 'I really like this'));
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.deepEqual(result.hostKeys, [],
    'the host page saw keystrokes typed into the Raven panel: ' + JSON.stringify(result.hostKeys));
  assert.deepEqual(result.hostKeysCapture, [],
    'a capture-phase page listener saw keystrokes typed into the Raven panel: ' + JSON.stringify(result.hostKeysCapture));
  assert.equal(result.fieldValue, 'I really like this',
    'the field lost characters the host page swallowed');
});

test('IME and dead-key composition inside Raven does not reach the host page either', async (t) => {
  // An IME or dead-key press reports key "Process"/"Dead"/"Unidentified" — and
  // Android reports keyCode 229 for nearly everything — so a guard that filters
  // on key.length === 1 lets every non-Latin and every accented keystroke fall
  // through to the page, which can preventDefault it and break the composition.
  // Synthetic dispatch is the right instrument here and only here: what is under
  // test is propagation out of a shadow root, which the DOM handles identically
  // for dispatched and native events. Driving a real IME through Playwright
  // would test the input method, not the boundary.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();
        window.__hostKeys.length = 0;
        window.__hostKeysCapture.length = 0;
        for (const init of [
          { key: 'Process', keyCode: 229 },
          { key: 'Dead', keyCode: 220 },
          { key: 'Unidentified', keyCode: 229 }
        ]) {
          field.dispatchEvent(new KeyboardEvent('keydown', {
            key: init.key, keyCode: init.keyCode, bubbles: true, composed: true, cancelable: true
          }));
        }
        return { bubble: [...window.__hostKeys], capture: [...window.__hostKeysCapture] };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }
  assert.deepEqual(seen.capture, [],
    'a capture-phase page listener saw IME composition typed into Raven: ' + JSON.stringify(seen.capture));
  assert.deepEqual(seen.bubble, [],
    'the host page saw IME composition typed into Raven: ' + JSON.stringify(seen.bubble));
});

test('the host page still receives its own hotkeys when focus is outside Raven', async (t) => {
  // The guard must be scoped to the overlay. Blanket-swallowing keys would break
  // every site the bridge proxies, which is a worse bug than the one being fixed.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      await page.click('#heading');
      await page.keyboard.type('s/', { delay: 5 });
      return page.evaluate(() => ({ bubble: window.__hostKeys, capture: window.__hostKeysCapture }));
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }
  assert.deepEqual(seen.bubble, ['s', '/']);
  assert.deepEqual(seen.capture, ['s', '/']);
});

test('Raven keeps its own chords and non-character keys travelling', async (t) => {
  // The capture-phase guard fires before Raven's own document-level handlers, so
  // over-broad matching there would break the overlay from the inside: Escape
  // (modal dismiss), Tab (focus trap), Cmd+K, Alt+G and Cmd+. are all read off
  // document. Asserting they still reach the page is the cheapest proxy for
  // "they still reach Raven", since both sit downstream of window-capture.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      await page.evaluate(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        root.querySelector('.raven-grab-textarea').focus();
      });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Alt+g');
      return page.evaluate(() => ({ capture: window.__hostKeysCapture, bubble: window.__hostKeys }));
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }
  // "Alt" is its own keydown before the chord's letter arrives — pressing Alt+g
  // emits two events, not one. Written from the measured sequence rather than
  // from what the chord looks like in the source.
  assert.deepEqual(seen.capture, ['Escape', 'Tab', 'Alt', 'g'],
    'the capture guard is swallowing keys Raven itself needs: ' + JSON.stringify(seen.capture));
  // And these are exactly the keys the host guard exists for. The capture guard
  // waves them through by design, so bubble phase is the only thing standing
  // between a page's Escape/Tab/chord handler and a user typing in Raven. This
  // assertion is what makes the host guard falsifiable at all: with the capture
  // guard covering every printable character, deleting the host guard changed
  // nothing else in this file.
  assert.deepEqual(seen.bubble, [],
    'the host page saw Raven-internal keys in bubble phase: ' + JSON.stringify(seen.bubble));
});
