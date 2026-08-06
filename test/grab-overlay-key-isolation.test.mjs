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

async function withOverlay(fn, hostPage) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(hostPage || HOST_PAGE);
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
  // An IME or dead-key press reports key "Process"/"Dead"/"Unidentified", so a
  // guard that filters on key.length === 1 lets every non-Latin and every
  // accented keystroke fall through to the page, which can preventDefault it and
  // break the composition. Matched on the key NAME, never on keyCode 229 — see
  // the Android test below for what that costs.
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

test('an Android Enter still reaches Raven, even though Android reports it as keyCode 229', async (t) => {
  // Android reports keyCode 229 for nearly every key, not only composed ones, so
  // reading 229 as proof of composition swallows Enter, Escape and Tab on that
  // whole platform — Enter is how the instruction gets sent, so the panel would
  // simply stop working there while every other test in this file stayed green.
  // The composition signals are the three key NAMES plus isComposing; the keyCode
  // adds nothing they do not already cover and costs exactly this.
  //
  // The capture guard sits upstream of both the page's listeners and Raven's own
  // document-level ones, so "the page's capture listener saw it" is the same
  // measurement as "Raven could see it" — which is the assertion the IME test
  // above cannot make on its own.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(() => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();
        window.__hostKeysCapture.length = 0;
        for (const key of ['Enter', 'Escape', 'Tab']) {
          field.dispatchEvent(new KeyboardEvent('keydown', {
            key: key, keyCode: 229, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          }));
        }
        return { capture: [...window.__hostKeysCapture] };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }
  assert.deepEqual(seen.capture, ['Enter', 'Escape', 'Tab'],
    'keyCode 229 is being read as composition, so Android loses the keys Raven runs on: ' +
    JSON.stringify(seen.capture));
});

test('the Enter that commits an IME candidate does not send, but the next one does', async (t) => {
  // The other half of dropping keyCode 229 — and the case that made the keyCode
  // look load-bearing in the first place. WebKit bug 165004 (fixed on main only
  // in April 2026): with the Japanese Hiragana IME, macOS Safari fires
  // `compositionend` FIRST and then a keydown whose key is "Enter" and whose
  // isComposing is already false. That Enter accepted a candidate; the user has
  // not asked to send anything. Nothing on the event itself separates it from a
  // deliberate press, so the separator has to be the composition lifecycle.
  //
  // The observable is `defaultPrevented`, not a network call: the send handler
  // calls preventDefault before it looks for the button, so the flag is true
  // exactly when the handler decided this Enter meant send. Asserting on the
  // button instead would pass against a broken guard whenever the button
  // happened to be absent or disabled.
  //
  // Both halves are load-bearing. Without the second assertion this test passes
  // just as well against an overlay that swallowed EVERY Enter — which would
  // break sending for everyone, not only IME users.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        const press = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return event.defaultPrevented;
        };

        // Safari's ordering, reproduced exactly: compositionend, then the Enter.
        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const commit = press();

        // The user now presses Enter again, meaning it this time.
        const deliberate = press();

        // And an Enter that follows a composition but is not the next key must
        // also send — the marker belongs to one keydown, not to a stretch of
        // time. A clock-only guard fails this one.
        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        field.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'a', keyCode: 65, bubbles: true, composed: true, cancelable: true
        }));
        const afterTyping = press();

        return { commit, deliberate, afterTyping };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.commit, false,
    'the Enter that only committed an IME candidate was treated as a send — on macOS ' +
    'Safari every Japanese/Chinese/Korean user would fire the instruction off mid-word');
  assert.equal(seen.deliberate, true,
    'a deliberate Enter stopped sending, which breaks the panel for everyone');
  assert.equal(seen.afterTyping, true,
    'an Enter that followed a composition but not immediately was swallowed — the ' +
    'commit marker is being held on a clock instead of on the next keystroke');
});

test('the CONFORMING commit ordering does not cost the user their next Enter', async (t) => {
  // The mirror image of the test above, and the case the WebKit fix originally
  // broke. Every browser except WebKit dispatches the committing Enter FIRST,
  // with isComposing true, and fires `compositionend` after it. Arming the
  // commit marker on every `compositionend` therefore armed it AFTER the commit
  // had already been handled — pointing it at whatever the user typed next. If
  // that was a deliberate Enter inside the window, their send vanished with no
  // feedback.
  //
  // That is a strictly worse trade than the bug being fixed: the WebKit defect
  // costs a stray send to Japanese/Chinese/Korean users on one browser, and this
  // one costs a swallowed send to everyone on every other browser. So arming is
  // conditioned on `compositionend` NOT having been preceded by the commit
  // Enter, which is exactly what distinguishes the two orderings.
  //
  // `fixtureIsComposing` guards the fixture itself: if Chromium ever stopped
  // honouring the `isComposing` init member, every assertion below would still
  // pass while measuring nothing at all.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        const press = (isComposing) => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: isComposing,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return { prevented: event.defaultPrevented, composing: event.isComposing };
        };

        // A character of the composition, so the lifecycle starts where a real
        // one does rather than with the commit.
        field.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'n', keyCode: 78, isComposing: true,
          bubbles: true, composed: true, cancelable: true
        }));

        // The conforming order: commit Enter, THEN compositionend.
        const commit = press(true);
        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));

        // The user now presses Enter meaning it — immediately, well inside the
        // 100ms window. This is the press the old code ate.
        const deliberate = press(false);

        return {
          commit: commit.prevented,
          fixtureIsComposing: commit.composing,
          deliberate: deliberate.prevented
        };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.fixtureIsComposing, true,
    'the fixture could not set isComposing, so this test was measuring nothing — ' +
    'the conforming-ordering assertions below are void until this passes');
  assert.equal(seen.commit, false,
    'the Enter that committed a candidate with isComposing true was treated as a send');
  assert.equal(seen.deliberate, true,
    'the Enter immediately after a conforming commit was swallowed — on every ' +
    'browser but WebKit this is the user pressing send and getting nothing');
});

test('a CANCELLED composition does not eat the Enter that follows it', async (t) => {
  // `compositionend` does not mean "a candidate was committed". The UI Events
  // spec fires it whenever a composition completes OR CANCELS — Escape, a blur,
  // an IME dismissal. An adverse pass caught the guard documenting its residual
  // as "mouse-selected candidates only" while actually arming on every one of
  // those, so Escape-then-Enter — cancel the IME, then send — lost the send.
  //
  // A cancellation carries an empty `data`; a commit carries the committed
  // string. That is the discriminator, and this pins it. All three cases below
  // are in one evaluate so they share a lifecycle, the way a real one does.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        const enter = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return event.defaultPrevented;
        };

        // Compose, then hit Escape. The Escape keydown comes FIRST, then the
        // cancelling compositionend — which is why consuming the marker on the
        // next keydown does not save this case on its own.
        field.dispatchEvent(new CompositionEvent('compositionstart', {
          data: '', bubbles: true, composed: true
        }));
        field.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', keyCode: 27, bubbles: true, composed: true, cancelable: true
        }));
        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: '', bubbles: true, composed: true
        }));
        const afterCancel = enter();

        // Same shape, but the composition ended somewhere else in the overlay —
        // the blur/focus-switch case. The Enter lands in a different element, so
        // it is a different intent and must send.
        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const afterCommitHere = enter();

        const elsewhere = root.querySelector('.raven-grab-panel') || root.firstElementChild;
        elsewhere.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const afterCommitElsewhere = enter();

        return { afterCancel, afterCommitHere, afterCommitElsewhere };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.afterCancel, true,
    'the Enter after an ESCAPE-cancelled composition was swallowed — cancelling the ' +
    'IME and then pressing send silently does nothing');
  assert.equal(seen.afterCommitHere, false,
    'the control failed: a genuine commit in this field stopped being absorbed, so ' +
    'the assertion above would pass against a guard that armed on nothing at all');
  assert.equal(seen.afterCommitElsewhere, true,
    'a composition that ended in a DIFFERENT element still absorbed this field\'s ' +
    'Enter — the marker is not bound to where the composition happened');
});

test('a commit in the page\'s own field does not disarm Raven\'s next composition', async (t) => {
  // `ravenCommitEnterAlreadySeen` is assigned on every keydown page-wide, but
  // only a Raven-scoped `compositionend` consumes it. So an IME commit in the
  // PAGE's search box sets the flag and the page's own compositionend — filtered
  // out by the origin check — never clears it. The next real WebKit commit
  // inside Raven then reads as already-handled and is released as a send.
  //
  // In practice a following keydown usually clears it, because composing
  // requires typing. `compositionstart` is the lifecycle-correct clearing point
  // that does not depend on that: a new composition makes any pending Enter
  // irrelevant by definition. This test isolates the mechanism by leaving no
  // intervening keydown, which is also the real shape for handwriting and voice
  // input, where a composition begins with no keydown at all.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');

        // The page's own field, outside the overlay entirely.
        const pageInput = document.createElement('input');
        document.body.appendChild(pageInput);
        pageInput.focus();
        pageInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, isComposing: true,
          bubbles: true, composed: true, cancelable: true
        }));
        pageInput.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));

        // Now the user composes inside Raven on a WebKit-ordering browser.
        field.focus();
        field.dispatchEvent(new CompositionEvent('compositionstart', {
          data: '', bubbles: true, composed: true
        }));
        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const commit = new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, isComposing: false,
          bubbles: true, composed: true, cancelable: true
        });
        field.dispatchEvent(commit);

        pageInput.remove();
        return { commitSent: commit.defaultPrevented };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.commitSent, false,
    'a stale commit flag left over from the PAGE\'s own IME commit disarmed Raven\'s ' +
    'guard, so the next WebKit candidate-commit Enter fired the instruction off');
});

// A host page that seals every keydown before the overlay's own listener can
// touch it. The `<head>` placement is load-bearing: the bridge injects the
// overlay before `</body>`, and same-node/same-phase listeners run in
// registration order, so this one is guaranteed to run FIRST.
const HOST_PAGE_SEALING = `<!doctype html><html><head><title>sealing host</title>
<script>
  window.__hostKeys = [];
  window.__hostKeysCapture = [];
  window.addEventListener('keydown', function (event) {
    Object.preventExtensions(event);
  }, true);
</script>
</head><body><h1 id="heading">Host page</h1></body></html>`;

test('a page that seals the event object cannot break the IME guard', async (t) => {
  // Sol round 11, proven with a live probe: `Object.preventExtensions(event)`
  // makes a strict-mode expando assignment THROW. The overlay is `"use strict"`,
  // so the old `event.__ravenCompositionCommit = …` line threw inside the
  // bookkeeping listener and took the rest of that listener with it — including
  // the `ravenCommitEnterAlreadySeen` update on the following line. The verdict
  // is now held in a module-private WeakSet, and `WeakSet.add` works fine on a
  // non-extensible object.
  //
  // Reverting to the expando fails this on the FIRST assertion: with the stamp
  // gone, WebKit's candidate-commit Enter reaches the send handler unmarked.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        const press = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return event.defaultPrevented;
        };

        // Confirm the fixture actually sealed something, or this test would pass
        // against a page whose listener never ran.
        const probe = new KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true });
        field.dispatchEvent(probe);
        const sealed = !Object.isExtensible(probe);

        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const commit = press();
        const deliberate = press();

        return { sealed, commit, deliberate };
      });
    }, HOST_PAGE_SEALING);
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.sealed, true,
    'the fixture never sealed the event, so this test proves nothing — the head ' +
    'script did not run before the overlay, or preventExtensions stopped applying');
  assert.equal(seen.commit, false,
    'a page that seals the keydown object disabled the IME guard: the candidate-commit ' +
    'Enter fired the instruction off. The verdict must not be an expando property');
  assert.equal(seen.deliberate, true,
    'a deliberate Enter stopped sending on a sealing page');
});

test('a page listener between the marker and the send handler cannot forge the verdict', async (t) => {
  // The other half of the same objection. A window-capture listener registered
  // AFTER Raven's runs after it in the same phase — squarely in the gap between
  // recording the verdict and the panel's bubble-phase read. An own property is
  // readable AND writable there; a WeakSet closed over by the overlay's IIFE is
  // neither.
  //
  // Reverting to the expando fails this on the first assertion: the saboteur
  // deletes the stamp and WebKit's commit Enter is read as a deliberate send.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        // Registered now, so strictly after the overlay's own window-capture
        // listeners. Both directions: erase a real verdict, and forge a false one.
        window.addEventListener('keydown', function (event) {
          try {
            delete event.__ravenCompositionCommit;
            event.__ravenCompositionCommit = false;
          } catch (ignored) { /* a sealed event is the other test */ }
        }, true);

        const press = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return event.defaultPrevented;
        };

        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const commit = press();
        const deliberate = press();

        return { commit, deliberate };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.commit, false,
    'a page listener running between the overlay\'s bookkeeping listener and its send ' +
    'handler erased the IME verdict, so the candidate-commit Enter sent the instruction');
  assert.equal(seen.deliberate, true,
    'a deliberate Enter stopped sending while a page listener was writing the flag');
});

// ── Round 13 — three holes an adverse pass found in the round-12 fix ──────────
//
// All three share one shape: round 12 secured an OBJECT and called the mechanism
// out of the page's reach, when what the guard actually depends on is a set of
// page-realm OPERATIONS. A WeakSet the page cannot name is still manipulated
// through `WeakSet.prototype.*`, which the page owns; a bound in milliseconds is
// still a subtraction over `performance.now()`, which the page owns; and an
// event marked once is still an object the page can dispatch again.

test('a page that replaces WeakSet.prototype after load cannot break the IME guard', async (t) => {
  // The round-12 comment claimed "the page holds no reference to it". True of the
  // SET, false of the operations on it. `WeakSet.prototype.add/has/delete` are
  // ordinary page-realm properties, so a page that swaps them out reaches the
  // verdict without ever naming the set: make `has` return false and every IME
  // commit is read as a deliberate send; make it return true and every Enter is
  // swallowed. The overlay now captures all three at load through
  // `Function.prototype.call.bind`.
  //
  // Reverting that capture fails this on the first assertion. What it does NOT
  // buy — and the overlay comment says so rather than claiming immunity — is
  // protection from a `<head>` script that poisons the prototype BEFORE the
  // overlay is injected. That is unclosable from inside a shared realm, which is
  // why this fixture tampers after load: it is exactly the case the fix covers.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        // Both directions of sabotage at once: nothing is ever recorded, and
        // every lookup answers "no verdict here".
        WeakSet.prototype.add = function () { return this; };
        WeakSet.prototype.has = function () { return false; };
        WeakSet.prototype.delete = function () { return false; };

        const press = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return event.defaultPrevented;
        };

        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));
        const commit = press();
        const deliberate = press();

        return { commit, deliberate };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.commit, false,
    'a page that replaced WeakSet.prototype.has neutralised the IME guard: the ' +
    'candidate-commit Enter fired the instruction off. The overlay must capture ' +
    'the WeakSet methods at load, not look them up on the prototype at call time');
  assert.equal(seen.deliberate, true,
    'a deliberate Enter stopped sending on a prototype-tampering page');
});

test('the same commit Enter redispatched a second time is not swallowed again', async (t) => {
  // A `KeyboardEvent` is an object, and `dispatchEvent` may be called on it as
  // many times as a page likes. Round 12 MARKED the event and never consumed the
  // mark, so a page that re-dispatched the user's own commit Enter had it
  // suppressed on every pass — a silent, unbounded "Enter does nothing" for as
  // long as the page keeps replaying it. One mark, one suppression: the read
  // deletes the entry before returning true.
  //
  // Reverting the consume-on-read fails this on `second`. Note the first two
  // assertions are the controls — without them a guard that never fires at all
  // would pass the third.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        // ONE event object, dispatched twice — that is the whole point. A second
        // freshly-constructed event was never marked in the first place, so it
        // would sail through whether or not the verdict is consumed, and the
        // test would pass against the defect. (It did, on the first draft.)
        // `defaultPrevented` only ever goes false → true here, so reading it
        // after each dispatch is a valid before/after despite being sticky.
        const event = new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, isComposing: false,
          bubbles: true, composed: true, cancelable: true
        });

        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));

        field.dispatchEvent(event);
        const first = event.defaultPrevented;
        field.dispatchEvent(event);
        const second = event.defaultPrevented;

        return { first, second };
      });
    });
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.first, false,
    'the control failed — the candidate-commit Enter was not suppressed at all, ' +
    'so the assertion below proves nothing');
  assert.equal(seen.second, true,
    'the Enter after a consumed IME commit did not send. The verdict must be ' +
    'consumed on read, so one composition suppresses exactly one Enter');
});

const HOST_PAGE_BACKWARDS_CLOCK = `<!doctype html><html><head><title>backwards clock host</title>
<script>
  // Poisoned BEFORE the overlay is injected, so capturing performance.now at
  // load does not help — the overlay captures this one. The only thing that
  // saves the bound is refusing to believe a negative elapsed time.
  var __ravenFakeClock = 1e9;
  performance.now = function () {
    __ravenFakeClock -= 1e6;   // every reading is far EARLIER than the last
    return __ravenFakeClock;
  };
</script>
</head><body><h1 id="heading">Host page</h1></body></html>`;

test('a page whose clock runs backwards cannot make the 100ms bound unbounded', async (t) => {
  // The marker's expiry is a subtraction over two `performance.now()` readings,
  // and `performance.now` is a page-realm property. Hand back a LARGE value when
  // the composition ends and a SMALL one at a much later Enter and the delta is
  // negative — which satisfies `delta < 100` forever. The bound stops bounding
  // anything, and the mouse-selected-candidate residual the bound exists to
  // cap becomes unbounded in time, which is the trade the overlay comment says
  // it is buying.
  //
  // `ravenElapsedSince` now returns Infinity whenever the delta is not a
  // non-negative number. Reverting it to a raw subtraction fails this test's
  // second assertion: the Enter long after the composition is swallowed.
  let seen;
  try {
    seen = await withOverlay(async (page) => {
      return page.evaluate(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        // Confirm the fixture actually took, or this passes against a page whose
        // head script never ran.
        const a = performance.now();
        const b = performance.now();
        const clockRunsBackwards = b < a;

        const press = () => {
          const event = new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, isComposing: false,
            bubbles: true, composed: true, cancelable: true
          });
          field.dispatchEvent(event);
          return event.defaultPrevented;
        };

        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));

        // Well past the 100ms bound in real time. Under a backwards clock the
        // measured delta only gets MORE negative, so a raw subtraction reads
        // this as "0ms ago".
        await new Promise((resolve) => setTimeout(resolve, 300));
        const late = press();

        return { clockRunsBackwards, late };
      });
    }, HOST_PAGE_BACKWARDS_CLOCK);
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return;
    }
    throw err;
  }

  assert.equal(seen.clockRunsBackwards, true,
    'the fixture never replaced performance.now, so this test proves nothing — ' +
    'the head script did not run before the overlay loaded');
  assert.equal(seen.late, true,
    'an Enter 300ms after the composition was still swallowed, so a page-controlled ' +
    'clock turned the 100ms bound into no bound at all. A negative elapsed time ' +
    'must be treated as expired, not as "just now"');
});

// ───────────────────────────── Round 14 ─────────────────────────────
// The backwards-clock test above closes a clock that runs BACKWARD and nothing
// else. An adverse pass pointed out the simpler attack it does not cover: a
// CONSTANT clock. `performance.now = () => 0` makes every delta exactly `0 - 0`,
// which is non-negative, passes the sign check, and satisfies `< 100` forever.
// The fix is to stamp BOTH clocks and take the LARGER delta, so a page has to
// freeze both. These two tests pin each half of that:
//   * freeze `performance.now` only  → falsifies the old perf-only reading
//   * freeze `Date.now` only         → falsifies taking the MIN instead of the MAX
// Neither passes against the other's defect, which is the point.

function constantClockHost(which) {
  return `<!doctype html><html><head><title>constant ${which} host</title>
<script>
  // Frozen BEFORE the overlay is injected, so the load-time capture grabs this
  // one. Every reading is identical, so the delta is 0 forever — non-negative,
  // and therefore invisible to a sign check.
  ${which === 'performance'
      ? 'performance.now = function () { return 0; };'
      : 'Date.now = function () { return 1700000000000; };'}
</script>
</head><body><h1 id="heading">Host page</h1></body></html>`;
}

async function lateEnterUnderFrozenClock(t, which) {
  try {
    return await withOverlay(async (page) => {
      return page.evaluate(async (frozen) => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const field = root.querySelector('.raven-grab-textarea');
        field.focus();

        // Confirm the fixture actually took. Without this the test passes
        // against a page whose head script never ran, which is exactly how a
        // test ends up detecting nothing.
        const read = () => (frozen === 'performance' ? performance.now() : Date.now());
        const a = read();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const clockIsFrozen = read() === a;

        field.dispatchEvent(new CompositionEvent('compositionend', {
          data: 'にほんご', bubbles: true, composed: true
        }));

        // Well past the 100ms bound in real time. The frozen clock reports 0ms.
        await new Promise((resolve) => setTimeout(resolve, 300));

        const event = new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 13, isComposing: false,
          bubbles: true, composed: true, cancelable: true
        });
        field.dispatchEvent(event);

        return { clockIsFrozen, late: event.defaultPrevented };
      }, which);
    }, constantClockHost(which));
  } catch (err) {
    if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
      t.skip(`browser unavailable for overlay key isolation (${err.message})`);
      return null;
    }
    throw err;
  }
}

test('a page that freezes performance.now cannot make the 100ms bound unbounded', async (t) => {
  const seen = await lateEnterUnderFrozenClock(t, 'performance');
  if (!seen) return;

  assert.equal(seen.clockIsFrozen, true,
    'the fixture never froze performance.now, so this test proves nothing — ' +
    'the head script did not run before the overlay loaded');
  assert.equal(seen.late, true,
    'an Enter 300ms after the composition was still swallowed under a CONSTANT ' +
    'performance.now. A frozen clock reports a 0ms delta forever, which no sign ' +
    'check can catch — elapsed time must consult Date.now as well and believe ' +
    'whichever clock reports progress');
});

test('a page that freezes Date.now cannot make the 100ms bound unbounded', async (t) => {
  const seen = await lateEnterUnderFrozenClock(t, 'date');
  if (!seen) return;

  assert.equal(seen.clockIsFrozen, true,
    'the fixture never froze Date.now, so this test proves nothing — ' +
    'the head script did not run before the overlay loaded');
  assert.equal(seen.late, true,
    'an Enter 300ms after the composition was still swallowed under a CONSTANT ' +
    'Date.now, even though performance.now was reporting real progress. Elapsed ' +
    'time must be the LARGER of the two deltas, not the smaller — taking the ' +
    'minimum lets either single frozen clock hold the marker open');
});
