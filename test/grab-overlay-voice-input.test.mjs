// Voice dictation on the overlay's Instructions box (Andrew, /goal 2026-08-07:
// "Anytime we have any sort of input, we should be able to have voice").
//
// This needs a real browser because the mechanism under test spans the shadow
// root, the delegated panel listeners, and renderPanel()'s wholesale DOM
// rebuild — the defect class is a transcript that lands in the textarea NODE
// but never in the module-level draft, which reads perfectly until the next
// background render throws it away. No fake-DOM shim reproduces that rebuild.
//
// The recognizer itself is faked: headless Chromium ships the
// webkitSpeechRecognition constructor but no speech service, so a live
// SpeechRecognition can never produce a result in CI. The fixture installs
// window.SpeechRecognition BEFORE the bridge injects the overlay (fixture
// scripts run first — the overlay tag is appended before </body>), and the
// overlay's feature detection reads SpeechRecognition ahead of the webkit
// prefix, so the fake wins deterministically.
//
// Mutation matrix — every radius below is MEASURED (seven mutants, each a
// string edit on a copy served through RAVEN_GRAB_ASSET_PATH, load-checked
// before its run so a parse failure cannot masquerade as a detection):
//   - delete the onPanels("click") [data-voice-dictate] branch
//       -> SIX tests red (every interaction test clicks through that branch;
//          only the feature-absence test survives). A wide radius here is the
//          entry point being shared, not six independent guards.
//   - appendDictatedText sets field.value but skips the input-event dispatch
//       -> exactly "a dictated transcript ... survives a panel re-render" red
//   - drop the speechRecognitionCtor() gate in voiceButtonMarkup
//       -> exactly "no recognizer, no mic button" red
//   - stopDictation clears state without calling recognizer.stop()
//       -> TWO red: the toggle-off test and the vanished-field test, because
//          both assert the recognizer was actually stopped, not just the state
//          cleared.
//   - remove the onend state reset
//       -> exactly "a recognizer that ends on its own resets the button" red
//   - move the empty-text early return back ahead of the field check
//       -> exactly "a noise-only final against a vanished field" red
//   - weaken onend's identity guard from recognizer equality to bare dictation
//       -> exactly "a stale onend from a replaced recognizer" red
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
  test('playwright available for overlay voice-input test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');

// The fake mirrors the two structural facts the overlay's onresult handler
// depends on: results is indexable from event.resultIndex, and each result
// carries isFinal plus an alternatives list whose [0] has a transcript.
const FAKE_RECOGNIZER = `
<script>
  window.__voiceFake = { instances: [] };
  window.SpeechRecognition = class {
    constructor() {
      this.started = 0;
      this.stopped = 0;
      this.continuous = false;
      this.interimResults = true;
      window.__voiceFake.instances.push(this);
    }
    start() { this.started += 1; }
    stop() {
      this.stopped += 1;
      if (this.onend) this.onend({});
    }
    emitFinal(text) {
      if (this.onresult) this.onresult({
        resultIndex: 0,
        results: [{ 0: { transcript: text }, isFinal: true, length: 1 }]
      });
    }
  };
</script>`;

const HOST_PAGE = `<!doctype html><html><head><title>voice host</title></head><body>
<h1 id="heading">Host page</h1>${FAKE_RECOGNIZER}
</body></html>`;

// Both constructors forced absent: headless Chromium DOES define
// webkitSpeechRecognition, so without this the button renders everywhere and
// the feature-detection test measures nothing.
const NO_SPEECH_PAGE = `<!doctype html><html><head><title>no speech</title></head><body>
<h1 id="heading">Host page</h1>
<script>
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
</script>
</body></html>`;

async function withOverlay(fn, hostPage) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(hostPage || HOST_PAGE);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-voice-'));
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

function skipIfNoBrowser(t, err) {
  if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
    t.skip(`browser unavailable for overlay voice input (${err.message})`);
    return true;
  }
  return false;
}

const shadowEval = (fnBody) => `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  ${fnBody}
})()`;

test('clicking the mic starts a correctly configured recognizer and marks the button live', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const mic = root.querySelector('[data-voice-dictate="data-instruction"]');
        if (!mic) return { error: 'no instructions mic button in the overlay' };
        mic.click();
        const fake = window.__voiceFake.instances[0];
        const after = root.querySelector('[data-voice-dictate="data-instruction"]');
        return {
          instances: window.__voiceFake.instances.length,
          started: fake ? fake.started : 0,
          continuous: fake ? fake.continuous : null,
          interimResults: fake ? fake.interimResults : null,
          pressed: after ? after.getAttribute('aria-pressed') : null
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 1, 'exactly one recognizer per dictation session');
  assert.equal(result.started, 1, 'the recognizer was never started');
  assert.equal(result.continuous, true, 'dictation must be continuous — the default cuts off after one phrase');
  assert.equal(result.interimResults, false, 'interim results would append half-recognized text');
  assert.equal(result.pressed, 'true', 'the re-rendered mic button does not show dictation as live');
});

test('a dictated transcript lands in the textarea and survives a panel re-render', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitFinal('Make the hero blue');
        const liveValue = root.querySelector('[data-instruction]').value;
        fake.emitFinal('and the footer dark');
        const appendedValue = root.querySelector('[data-instruction]').value;
        // Toggling off runs renderPanel(), which rebuilds the textarea from the
        // module-level draft. If the transcript only ever touched the NODE, it
        // dies right here — this is the assertion the input-event dispatch
        // mechanism exists for.
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const survivedValue = root.querySelector('[data-instruction]').value;
        return { liveValue, appendedValue, survivedValue };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.liveValue, 'Make the hero blue', 'the first final transcript never reached the textarea');
  assert.equal(result.appendedValue, 'Make the hero blue and the footer dark',
    'a second final transcript must append with a separating space, not replace');
  assert.equal(result.survivedValue, 'Make the hero blue and the footer dark',
    'the transcript died on a panel re-render: it reached the node but never the instruction draft');
});

test('toggling the mic off stops the recognizer and releases the button state', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const after = root.querySelector('[data-voice-dictate="data-instruction"]');
        return { stopped: fake.stopped, pressed: after.getAttribute('aria-pressed') };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 1,
    'the recognizer was never stopped — the mic keeps listening after the button reads off');
  assert.equal(result.pressed, 'false', 'the button still shows dictation as live after toggling off');
});

test('a recognizer that ends on its own resets the button', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        // Chrome ends recognition unilaterally after silence; the overlay only
        // learns about it from onend. No stop() call happens in this path.
        fake.onend({});
        const after = root.querySelector('[data-voice-dictate="data-instruction"]');
        return { pressed: after.getAttribute('aria-pressed'), stopped: fake.stopped };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 0, 'fixture check: this path must not have called stop()');
  assert.equal(result.pressed, 'false',
    'the button shows dictation as live after the recognizer ended on its own');
});

test('a noise-only final against a vanished field still ends the session', async (t) => {
  // Adverse-pass finding (Kimi K3, 2026-08-07): the empty-text early return
  // used to run BEFORE the field-existence check, so a whitespace-only final
  // — which Chrome emits on ambient noise — arriving after the user
  // navigated away left the recognizer live forever. The field nodes are
  // removed directly (not via a re-render, which would rebuild them) so
  // panelQuery genuinely finds nothing.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        root.querySelectorAll('[data-instruction]').forEach((el) => el.remove());
        fake.emitFinal('   ');
        return { stopped: fake.stopped };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 1,
    'a noise-only final skipped the field check and left the mic listening against a panel with no field');
});

test('a stale onend from a replaced recognizer does not kill the live session', async (t) => {
  // On real Chrome, onend arrives on a later task after stop() — the fake's
  // synchronous onend cannot model that, so the stale delivery is replayed
  // by hand: recognizer 1 is stopped and a NEW session started, then
  // recognizer 1's onend fires again. Only the dictation.recognizer
  // identity guard keeps the new session alive.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        const first = window.__voiceFake.instances[0];
        mic().click(); // off — first.stop() fires its sync onend, a no-op
        mic().click(); // on again with a fresh recognizer
        first.onend({}); // the async delivery real Chrome would send late
        return {
          instances: window.__voiceFake.instances.length,
          pressed: mic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.instances, 2, 'fixture check: the second toggle-on must mint a fresh recognizer');
  assert.equal(result.pressed, 'true',
    'a stale onend from the replaced recognizer tore down the live session — the identity guard is gone');
});

test('no recognizer, no mic button — and the composer is otherwise intact', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        return {
          micButtons: root.querySelectorAll('[data-voice-dictate]').length,
          hasInstructions: Boolean(root.querySelector('[data-instruction]'))
        };
      `));
    }, NO_SPEECH_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.micButtons, 0,
    'a mic button rendered with no SpeechRecognition available — feature detection is gone');
  assert.equal(result.hasInstructions, true,
    'fixture check: the composer itself must render regardless of speech support');
});
