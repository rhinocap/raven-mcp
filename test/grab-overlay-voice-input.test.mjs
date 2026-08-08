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
// Round 2 (Andrew, 2026-08-07: "voice would be way better if it live streamed
// it into the box, or had a proper voice attention system with soundwaves"):
// interimResults=true streaming with strip-and-reinject (each event's interim
// snapshot REPLACES the last; dictation.injected tracks the EXACT appended
// chunk, separator and clamp included; a field that no longer ends with the
// injection means the user edited mid-dictation and their text wins), plus a
// [data-voice-wave] canvas beside the active mic driven by a real
// getUserMedia -> AnalyserNode -> rAF loop (fail-soft: SpeechRecognition
// captures its own audio, so a denied wave never costs the dictation). The
// fake's default interimResults is FALSE so the overlay's own assignment is
// what the config assertion measures — a fake defaulting true could never
// fail it. The wave-teardown tests override navigator.mediaDevices via
// defineProperty (it is an accessor with no setter) and hold grants in a
// pending[] queue, because the late-grant race is unreachable with an
// auto-resolving fake.
//
// Mutation matrix v2 — every radius below is MEASURED (27 mutants, each a
// string edit on a copy served through RAVEN_GRAB_ASSET_PATH, load-checked
// before its run so a parse failure cannot masquerade as a detection; ✖
// names deduped because node --test repeats them in its summary). The matrix
// re-ran WHOLE for round 2 — the onresult rewrite stale'd the round-1
// anchors, so every radius here is a fresh measurement, not a carry-forward.
// Harness + raw output: .claude/genesis-2026-08-07/agent-output/
// voice-r2-mutants{.mjs,-run2.out}. 25 killed, TWO expected survivors, one
// clause deliberately unmutated:
//   - delete the onPanels("click") [data-voice-dictate] branch
//       -> FIFTEEN red: every test that clicks a PANEL mic — the config,
//          re-render, toggle-off, self-end, vanished-field, stale-onend and
//          maxLength tests, all five streaming tests, the panel wave-canvas
//          test and both wave-teardown tests. The modal-driven tests survive
//          on the modal's own delegation; the feature-absence test by design.
//   - EXPECTED SURVIVOR — appendDictatedText skips its input-event dispatch:
//          onresult dispatches input unconditionally after every event, so
//          the append-path dispatch is redundant through the only caller. It
//          stays because the function's contract is a self-contained commit
//          (and a double dispatch is idempotent); the survival is measured,
//          documented at the dispatch site, and NOT protected by any test.
//   - drop the speechRecognitionCtor() gate in voiceButtonMarkup
//       -> exactly "no recognizer, no mic button" red
//   - stopDictation clears state without calling recognizer.stop()
//       -> THREE red: toggle-off, vanished-field, feedback-modal — all three
//          assert the recognizer was actually STOPPED (stop-call count).
//   - remove the onend state reset
//       -> exactly "a recognizer that ends on its own resets the button" red
//   - EXPECTED SURVIVOR — swap appendDictatedText's field check behind the
//          empty-text return: round 2's onresult runs its own field pre-check
//          before calling here (its only caller), so the internal ordering
//          has no reachable trigger. Belt-and-braces for a future direct
//          caller; the vanished-field TEST still guards the behavior itself
//          through onresult's pre-check (V1 reddens it).
//   - weaken onend's identity guard from recognizer equality to bare dictation
//       -> exactly "a stale onend from a replaced recognizer" red
//   - delete the settings-modal click delegation for [data-voice-dictate]
//       -> FOUR red: feedback-modal, both value-qualified tests (final and
//          interim routing), and the modal wave-canvas test — all start
//          dictation from a modal button the panel handler can never see.
//   - drop the maxLength clamp in appendDictatedText (finals path)
//       -> exactly "a dictated append honours the field's own maxLength cap"
//          red: .value assignment walks straight past the markup attribute.
//   - drop dictationQuery's settings-modal fallback (query panels only)
//       -> THREE red: feedback-modal + both value-qualified tests — their
//          target fields live in the modal. Shared lookup, shared radius.
//   - make syncModalVoiceButtons a no-op
//       -> TWO red: the feedback-modal test (render-once modal, nothing else
//          re-stamps aria-pressed) and the modal wave-canvas test (the sync
//          is what inserts/removes the modal's canvas).
//   - strip the value qualifier in appendDictatedText's query
//       -> exactly the FINAL-routing value-qualified test red.
//   - strip the value qualifier in ONRESULT's field lookup
//       -> exactly the INTERIM-routing value-qualified test red. This mutant
//          SURVIVED the pre-fix suite: finals route through
//          appendDictatedText's own full-descriptor query, so only interim
//          streaming reaches the wrong sibling — the interim-routing test
//          exists because the matrix caught its absence.
//   - delete the strip-and-reinject block in onresult
//       -> THREE red: interim-replaces, final-replaces-interim, clamp-strip —
//          every test that watches a second event replace the first.
//   - record the RAW interim as dictation.injected (not next.slice(base))
//       -> exactly the clamp-strip test red: the tracked chunk must carry the
//          separator and the clamp or the next strip removes the wrong bytes.
//   - strip unconditionally (drop the ends-with check)
//       -> exactly "a user edit mid-dictation wins" red.
//   - make onresult's input dispatch conditional on finals
//       -> exactly "interim text already in the box survives toggling the mic
//          off" red: an interim-only event must still reach the draft mirror
//          or the streamed text dies on the next panel rebuild.
//   - leave interimResults false
//       -> exactly the config test red (the fake's default is false, so the
//          assertion measures the overlay's assignment and nothing else).
//   - never write the interim into the field
//       -> SIX red: all five streaming tests plus the interim-routing test —
//          the interim write is their shared entry point, a fact about the
//          entry point and not six independent guards.
//   - drop the maxLength clamp on the INTERIM append
//       -> exactly the clamp-strip test red (separate clause from the finals
//          clamp; each has its own mutant).
//   - never render the wave canvas in voiceButtonMarkup
//       -> exactly "the wave canvas appears beside the live panel mic" red.
//   - modal sync never inserts the wave canvas / never removes it
//       -> each exactly the modal wave-canvas test red (it asserts both
//          directions of the render-once modal's lifecycle).
//   - stopDictation skips stopVoiceWave()
//       -> TWO red: both wave-teardown tests — the mic track keeps recording
//          and the AudioContext never closes for a dead session.
//   - delete the late-grant token guard in startVoiceWave
//       -> exactly "a permission grant landing after the session ended
//          releases the mic immediately" red: the permission prompt can
//          outlive the dictation session.
//   - stopVoiceWave never stops tracks / never closes the context
//       -> each exactly the teardown test red (it asserts the track's stop
//          AND the context's close separately).
// Deliberately UNMUTATED, with reason: onresult's `event.resultIndex || 0`
// loop start. The fake always emits resultIndex 0 with a single result (a
// full-snapshot model), so a flip to bare 0 is behaviorally invisible to
// every test — only real Chrome's multi-result continuous events exercise
// it. A clause with no reachable trigger must say so.
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
      // false so the interimResults=true assertion measures the overlay's own
      // assignment — a fake defaulting to true could never fail that test.
      this.interimResults = false;
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
    emitInterim(text) {
      // Real Chrome keeps resultIndex at the first CHANGED result and replaces
      // the interim in place, so each event carries the full current interim
      // snapshot — which is exactly why the overlay strips its previous
      // injection before writing the new one.
      if (this.onresult) this.onresult({
        resultIndex: 0,
        results: [{ 0: { transcript: text }, isFinal: false, length: 1 }]
      });
    }
  };
</script>`;

const HOST_PAGE = `<!doctype html><html><head><title>voice host</title></head><body>
<h1 id="heading">Host page</h1>${FAKE_RECOGNIZER}
</body></html>`;

// Fake media pipeline for the waveform teardown tests. getUserMedia grants are
// held in pending[] so a test controls WHEN the grant lands relative to the
// session ending — the late-grant race is unreachable with an auto-resolving
// fake. navigator.mediaDevices is an accessor with no setter, so the override
// has to go through defineProperty.
const FAKE_MEDIA = `
<script>
  window.__waveFake = { streams: [], contexts: [], pending: [] };
  window.__waveFake.grant = function () {
    const track = { stopCalls: 0, stop() { this.stopCalls += 1; } };
    const stream = { tracks: [track], getTracks() { return this.tracks; } };
    window.__waveFake.streams.push(stream);
    const resolve = window.__waveFake.pending.shift();
    if (resolve) resolve(stream);
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia() {
        return new Promise((resolve) => { window.__waveFake.pending.push(resolve); });
      }
    }
  });
  window.AudioContext = class {
    constructor() { this.closeCalls = 0; window.__waveFake.contexts.push(this); }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 128, getByteTimeDomainData() {} }; }
    createMediaStreamSource() { return { connect() {} }; }
    close() { this.closeCalls += 1; }
  };
</script>`;

const WAVE_HOST_PAGE = `<!doctype html><html><head><title>wave host</title></head><body>
<h1 id="heading">Host page</h1>${FAKE_RECOGNIZER}${FAKE_MEDIA}
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
  assert.equal(result.interimResults, true,
    'round 2 streams interim text live (Andrew, 2026-08-07) — a finals-only recognizer shows nothing until a phrase completes');
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

test('a dictated append honours the field\'s own maxLength cap', async (t) => {
  // maxLength constrains TYPING, not assignment — setting .value walks right
  // past it — so appendDictatedText clamps to the field's own cap or a long
  // dictation ships a value the form promised its consumer it never would
  // (the note fields promise 2000, the feedback form promises 5000). The cap
  // is stamped on the live node here because the instruction textarea carries
  // none of its own; appendDictatedText reads field.maxLength at result time,
  // so the node being queried is the node that was stamped.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        const field = root.querySelector('[data-instruction]');
        field.maxLength = 20;
        fake.emitFinal('this transcript is far longer than twenty characters');
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value.length, 20,
    'the dictated append walked past the field\'s maxLength: ' + JSON.stringify(result.value));
  assert.equal(result.value, 'this transcript is f', 'and the clamp is a truncation, not a rejection');
});

test('the feedback mic dictates into the settings-modal field and syncs its own state', async (t) => {
  // The feedback form lives in the settings modal, which is render-once: unlike
  // the panels its mic never passes back through voiceButtonMarkup, so
  // renderPanel() alone leaves its aria-pressed stale. syncModalVoiceButtons
  // stamps it directly at every dictation state change — delete those calls and
  // the pressed assertions here go red while every panel test stays green.
  // The click also exercises the modal's OWN [data-voice-dictate] delegation:
  // the panel's delegated listener never sees modal clicks (siblings in the
  // shadow root).
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = root.querySelector('.raven-grab-settings-modal') ||
          Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        const mic = modal ? modal.querySelector('[data-voice-dictate="data-feedback-message"]') : null;
        if (!mic) return { error: 'no feedback mic in the settings modal' };
        mic.click();
        const pressedLive = mic.getAttribute('aria-pressed');
        const fake = window.__voiceFake.instances[0];
        fake.emitFinal('The layers tab is hard to find');
        const value = modal.querySelector('[data-feedback-message]').value;
        mic.click();
        const pressedAfter = mic.getAttribute('aria-pressed');
        return { pressedLive, value, pressedAfter, stopped: fake.stopped };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.pressedLive, 'true',
    'the modal mic never learned dictation started — renderPanel cannot reach a render-once modal');
  assert.equal(result.value, 'The layers tab is hard to find',
    'the transcript never reached the feedback field — dictationQuery does not cover the modal');
  assert.equal(result.stopped, 1, 'the second click must stop the recognizer through the modal delegation');
  assert.equal(result.pressedAfter, 'false', 'the modal mic shows dictation live after it ended');
});

test('a value-qualified descriptor routes the transcript to exactly its own instance', async (t) => {
  // data-template-note exists once per expanded note across rebuilds, so its
  // mic carries a value-qualified descriptor (data-template-note='<id>') — the
  // selector text IS the descriptor, and the button, the active-state check,
  // and the result-time query can never disagree about which instance a
  // session belongs to. The fixture plants two instances plus a button in the
  // settings modal because the modal is the one surface renderPanel() never
  // rebuilds — the panel's own template flow would wipe planted nodes at the
  // toggle's first render. Synthetic placement, real mechanism: the click
  // travels the modal delegation, toggleDictation, and appendDictatedText's
  // result-time query exactly as the template tab's own mic does.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        if (!modal) return { error: 'no settings modal to plant the fixture in' };
        const holder = document.createElement('div');
        holder.innerHTML = '<textarea data-template-note="1"></textarea>' +
          '<textarea data-template-note="2"></textarea>' +
          '<button type="button" data-voice-dictate="data-template-note=\\'2\\'">mic</button>';
        modal.appendChild(holder);
        holder.querySelector('button').click();
        const fake = window.__voiceFake.instances[0];
        if (!fake) return { error: 'the value-qualified click never started a recognizer' };
        fake.emitFinal('into slot two');
        return {
          first: holder.querySelector('[data-template-note="1"]').value,
          second: holder.querySelector('[data-template-note="2"]').value
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.second, 'into slot two', 'the qualified instance never received its transcript');
  assert.equal(result.first, '',
    'the transcript leaked into a SIBLING instance of the same attribute — the descriptor\'s ' +
    'value qualifier is being dropped at query time');
});

test('interim text on a value-qualified descriptor streams into exactly its own instance', async (t) => {
  // The final-routing test above cannot see this: finals commit through
  // appendDictatedText, which does its own full-descriptor query, so a
  // qualifier dropped in ONRESULT's field lookup still routes finals
  // correctly while every interim snapshot streams into the FIRST bare-match
  // sibling. Measured — the matrix's V12b mutant survived all 19 prior tests
  // for exactly that reason. Same planted-modal fixture as the final test;
  // only the emission is interim.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        if (!modal) return { error: 'no settings modal to plant the fixture in' };
        const holder = document.createElement('div');
        holder.innerHTML = '<textarea data-template-note="1"></textarea>' +
          '<textarea data-template-note="2"></textarea>' +
          '<button type="button" data-voice-dictate="data-template-note=\\'2\\'">mic</button>';
        modal.appendChild(holder);
        holder.querySelector('button').click();
        const fake = window.__voiceFake.instances[0];
        if (!fake) return { error: 'the value-qualified click never started a recognizer' };
        fake.emitInterim('interim for slot two');
        return {
          first: holder.querySelector('[data-template-note="1"]').value,
          second: holder.querySelector('[data-template-note="2"]').value
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.second, 'interim for slot two', 'the qualified instance never received its interim');
  assert.equal(result.first, '',
    'interim text streamed into a SIBLING instance — onresult\'s field lookup dropped the ' +
    'value qualifier that appendDictatedText still honours');
});

test('interim text streams into the field live, and each snapshot REPLACES the last', async (t) => {
  // Round 2 (Andrew, 2026-08-07: "voice would be way better if it live
  // streamed it into the box"). Chrome re-emits the whole current interim on
  // every result event, so appending naively stacks "make the make the hero"
  // — the strip-and-reinject in onresult is what this test kills.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('make the');
        const first = root.querySelector('[data-instruction]').value;
        fake.emitInterim('make the hero');
        const second = root.querySelector('[data-instruction]').value;
        return { first, second };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.first, 'make the', 'the first interim never reached the field — nothing is streaming');
  assert.equal(result.second, 'make the hero',
    'the second interim stacked beside the first instead of replacing it: ' + JSON.stringify(result.second));
});

test('a final replaces the interim it grew from and resets the injection tracking', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('make the hero');
        fake.emitFinal('make the hero blue');
        const afterFinal = root.querySelector('[data-instruction]').value;
        // If the tracking survived the final, this strip would eat committed
        // text; if it reset, the new interim simply appends.
        fake.emitInterim('and the');
        const afterNextInterim = root.querySelector('[data-instruction]').value;
        return { afterFinal, afterNextInterim };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.afterFinal, 'make the hero blue',
    'the final must replace its own interim, not sit beside it');
  assert.equal(result.afterNextInterim, 'make the hero blue and the',
    'the injection tracking outlived the final and mangled the committed text');
});

test('interim text already in the box survives toggling the mic off (promote-on-stop)', async (t) => {
  // Stopping mid-word must keep what the user watched appear. The toggle-off
  // runs renderPanel(), which rebuilds the textarea from the module draft —
  // so this only holds if the interim writes dispatched input events too.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitFinal('keep the header');
        fake.emitInterim('and the foo');
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value, 'keep the header and the foo',
    'the streamed interim died on the stop re-render — it reached the node but never the draft');
});

test('a user edit mid-dictation wins: the tracking drops instead of eating their text', async (t) => {
  // The strip only fires when the field still ENDS with the injected chunk.
  // A user who edits mid-dictation breaks that suffix — their text must be
  // left alone (the old interim silently promotes to kept text) and the next
  // interim appends after it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('draft one');
        const field = root.querySelector('[data-instruction]');
        field.value = 'user typed something';
        fake.emitInterim('draft two');
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value, 'user typed something draft two',
    'the stale-injection strip ran against user-edited text: ' + JSON.stringify(result.value));
});

test('an interim append clamps to maxLength and the strip removes exactly the clamped chunk', async (t) => {
  // The tracking records what actually LANDED (post-clamp), not what was
  // heard — otherwise the next strip removes more than was injected and eats
  // committed text off the end of the field.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        const field = root.querySelector('[data-instruction]');
        field.maxLength = 20;
        fake.emitInterim('this interim is far longer than twenty characters');
        const clamped = root.querySelector('[data-instruction]').value;
        fake.emitInterim('short');
        const replaced = root.querySelector('[data-instruction]').value;
        return { clamped, replaced };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.clamped.length, 20, 'the interim walked past maxLength: ' + JSON.stringify(result.clamped));
  assert.equal(result.replaced, 'short',
    'the strip did not remove exactly the clamped chunk: ' + JSON.stringify(result.replaced));
});

test('the wave canvas appears beside the live panel mic and leaves with the session', async (t) => {
  // This measures the MARKUP mechanism — voiceButtonMarkup renders the
  // [data-voice-wave] canvas only for the active descriptor, so at most one
  // exists in the tree. The paint pipeline behind it (getUserMedia →
  // AnalyserNode → rAF) is deliberately fail-soft and unasserted here:
  // headless Chromium denies getUserMedia, which is exactly the denial path
  // real users hit, and dictation must survive it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const live = root.querySelectorAll('[data-voice-wave]').length;
        const mic = root.querySelector('[data-voice-dictate="data-instruction"]');
        const inSlot = Boolean(mic.parentNode && mic.parentNode.querySelector('[data-voice-wave]'));
        mic.click();
        const after = root.querySelectorAll('[data-voice-wave]').length;
        return { live, inSlot, after };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.live, 1, 'no wave canvas rendered beside the live mic');
  assert.equal(result.inSlot, true, 'the wave canvas rendered somewhere other than the active mic\'s own slot');
  assert.equal(result.after, 0, 'the wave canvas outlived the dictation session');
});

test('the render-once modal gets its wave canvas inserted and removed by the sync', async (t) => {
  // The panels regenerate the canvas through voiceButtonMarkup; the settings
  // modal never re-renders, so syncModalVoiceButtons owns both directions of
  // its canvas lifecycle. Delete that insert/remove and this goes red while
  // every panel test stays green.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        const mic = modal ? modal.querySelector('[data-voice-dictate="data-feedback-message"]') : null;
        if (!mic) return { error: 'no feedback mic in the settings modal' };
        mic.click();
        const live = modal.querySelectorAll('[data-voice-wave]').length;
        mic.click();
        const after = modal.querySelectorAll('[data-voice-wave]').length;
        return { live, after };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.live, 1, 'the sync never inserted a wave canvas into the render-once modal');
  assert.equal(result.after, 0, 'the sync never removed the modal\'s wave canvas when dictation ended');
});

test('ending dictation releases the wave\'s microphone stream and closes its context', async (t) => {
  // The one real harm in the wave engine: a MediaStreamTrack left running
  // keeps the browser's recording indicator lit after the user stopped
  // dictating. The fake grants immediately, the session ends, and both
  // halves of the teardown must have fired.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(`(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        window.__waveFake.grant();
        await new Promise((r) => setTimeout(r, 0));
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__waveFake;
        return {
          streams: fake.streams.length,
          contexts: fake.contexts.length,
          trackStops: fake.streams.length ? fake.streams[0].tracks[0].stopCalls : 0,
          contextCloses: fake.contexts.length ? fake.contexts[0].closeCalls : 0
        };
      })()`);
    }, WAVE_HOST_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.streams, 1, 'fixture check: the wave never requested the microphone');
  assert.equal(result.contexts, 1, 'fixture check: the wave never built an audio context');
  assert.ok(result.trackStops >= 1,
    'the microphone track was never stopped — the recording indicator stays lit after dictation ends');
  assert.ok(result.contextCloses >= 1, 'the audio context was never closed');
});

test('a permission grant landing after the session ended releases the mic immediately', async (t) => {
  // The permission prompt can outlive the dictation session: the user clicks
  // the mic, a browser prompt appears, they stop dictation, THEN allow. The
  // token guard in startVoiceWave must stop the tracks of that late stream
  // rather than adopt it for a dead session.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(`(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        mic().click(); // session over — the grant is still pending
        window.__waveFake.grant();
        await new Promise((r) => setTimeout(r, 0));
        const fake = window.__waveFake;
        return {
          streams: fake.streams.length,
          trackStops: fake.streams.length ? fake.streams[0].tracks[0].stopCalls : 0,
          contexts: fake.contexts.length
        };
      })()`);
    }, WAVE_HOST_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.streams, 1, 'fixture check: the grant never produced a stream');
  assert.ok(result.trackStops >= 1,
    'a stream granted after the session ended was adopted instead of released — the mic stays hot');
  assert.equal(result.contexts, 0, 'no audio context should be built for a dead session');
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
