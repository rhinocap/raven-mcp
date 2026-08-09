// The spring presets in the Grab overlay's Motion section — the last DialKit
// motion gap, and the only way CSS can express a spring at all.
//
// This needs a real browser for one specific reason: the load-bearing decision
// is WHERE the block attaches. Springs key on the PROPERTY, not on the control,
// so a timing row that fell back to the plain-text editor (steps(), an existing
// linear(), a compound list) must still be able to become a spring. Nothing
// below the browser can see that — `classifyStyleControl` returns "text" in all
// three cases and a unit test would agree with itself.
//
// The generator's own arithmetic — settle time, overshoot, simplification, the
// refusals — is pinned in test/grab-bridge.test.mjs, which owns the overlay
// internals loader. Duplicating that loader here would be two copies of one
// rule. This file covers only what the browser can see.
//
// GENERATIVE-ONLY is the contract under test in test 4: a committed spring must
// re-open in the PLAIN-TEXT control carrying the exact string that was written.
// Many springs sample to visually identical curves, so a linear() cannot be read
// back into stiffness/damping/mass, and a control that pretended otherwise would
// rewrite the value on commit — the hazard this file already documents for the
// bezier editor's parser.
//
// Mutation matrix (MEASURED — every mutation is applied to a copy of the overlay
// and served through BOTH `RAVEN_GRAB_ASSET_PATH` (what the bridge serves the
// browser) and `RAVEN_GRAB_TEST_OVERLAY` (what grab-bridge.test.mjs's internals
// loader reads), load-checked with `node --check` before its run, with the
// radius the count of distinct tests that turned red). Re-run the WHOLE matrix
// after any fix round: a find-string mutant dies silently the moment its target
// line is edited.
//
// The harness is .claude/dialkit-2026-08-08/spring-mutants.mjs (tracked); its
// run of record is agent-output/spring-matrix-v3.txt, which is GITIGNORED, so
// the figures are reproduced here rather than referenced — 13 mutants, 13
// killed, 0 survived, plus 2 CONTROLS (expect: green), 0 false-failed, on a
// baseline of spring-control 7p/0f and grab-bridge 286p/0f. Radii below are
// the count across BOTH suites, since the harness serves each mutant to both at
// once — a mutant reaching only one of them would report a radius measured
// against half the guards.
//
//   S1  keys on the CONTROL, not the property                  radius 3 (here 3)
//   S2  renders for every property                             radius 1 (here 1)
//   S3  a preset writes its label, not the generated curve      radius 2 (here 2)
//   S4  every preset writes the SAME curve                      radius 2 (here 2)
//   S5  the presets are left out of styleValueControlsInEditor  radius 1 (here 1)
//   S6  bare values with no percentage stops                    radius 1 (bridge)
//   S7  the curve is not pinned to end at exactly 1             radius 2 (1 + 1)
//   S8  settle is the FIRST moment inside the epsilon band      radius 1 (bridge)
//   S9  simplification is skipped — all 101 samples emitted     radius 1 (bridge)
//   S10 the tolerance is loose enough to flatten the curve      radius 1 (bridge)
//   S11 the formatter rounds values to ONE decimal, not four    radius 1 (bridge)
//   S12 the tolerance drifts 0.002 -> 0.005                     radius 1 (bridge)
//   S13 springs gated on a SINGLE timing function               radius 1 (here 1)
//
// Only S1 moved between v2 and v3, 2 -> 3, because the compound-list test added
// in the same round shares its mechanism — a fact about the mechanism, not an
// extra guard. S11/S12/S13 and the C1 replacement all come out of the round-1
// adverse pass and are described where they matter: S11 and S12 below, S13 at
// the compound test, C1 in the harness.
//
// S11 and S12 both redden the SAME assertion in the same test — the 0.0025
// bound on the emitted curve's worst deviation — and `assert` aborts at the
// first failure, so which one fired is read off the reported NUMBER (0.048877
// for S11, 0.005017 for S12) and off nothing else. That is worth stating rather
// than letting two radius-1 rows imply two independent guards.
//
// SIX of those thirteen are invisible to this file (S6/S8/S9/S10/S11/S12; six
// more are invisible to the unit test, and S7 alone reddens both), and that is
// a measurement
// rather than an omission. S6 is the instructive one: dropping the percentage
// stops silently retimes the curve, and no assertion HERE can see it — every
// one of them reads a DOM property or a committed string, and Chromium
// re-serializes both the stopped and the bare form into the same
// `linear(0 0%, …, 1 100%)` shape, so the two are indistinguishable to
// anything short of sampling an animation in flight. That is a limit of this
// suite's instruments, NOT a claim that the defect is unobservable in a
// browser: a rendered element would move differently, and a test that ran the
// transition and sampled getComputedStyle mid-flight would catch it. It does
// not exist because the arithmetic is cheaper to grade directly. S8, S9, S10,
// S11 and S12 are arithmetic outright. The unit test in test/grab-bridge.test.mjs
// owns all six; this file owns placement, wiring and the round trip.
//
// S9 is why the count is 13 and not 12. It SURVIVED the first matrix: every
// simplification assertion drove the simplifier in ISOLATION, which a
// springCurve handing back all 101 raw samples satisfies completely. The guard
// added at the call site kills it, and S10 covers the inverse defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

let chromium = null;
let playwrightError = null;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  playwrightError = err;
}

// The probe walks EVERY environmental prerequisite the tests use, in the order
// they use them: bind a loopback socket, write and remove a temp directory,
// launch chromium, and have the browser actually REACH the socket. That last
// step is a third prerequisite distinct from the first two — a sandbox can
// permit binding and launching and deny the connection, at which point a
// narrower probe passes and the real test's failure is reported as a product
// defect. This suite is written to the alignment suite's rounds-4-through-7
// pattern rather than the older `catch -> t.skip` shape precisely so it does not
// join the three files already carrying that known hole.
//
// `startGrabSession` and the `dist/grab-bridge.js` import are deliberately NOT
// probed: they are PRODUCT code, and probing them would make a real bridge
// defect register as a missing environment and skip.
let chromiumAvailable = false;
let chromiumProbeError = playwrightError;
if (chromium) {
  let probeServer = null;
  try {
    probeServer = createServer((_q, r) => r.end('ok'));
    await new Promise((resolve, reject) => {
      // `listen` reports EPERM/EADDRINUSE by EMITTING, and an emitted 'error'
      // with nothing listening throws from the event loop, outside any
      // surrounding try — where it can never be classified.
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    const probeDir = await mkdtemp(path.join(tmpdir(), 'raven-spring-probe-'));
    await writeFile(path.join(probeDir, 'probe.txt'), 'ok', 'utf8');
    await rm(probeDir, { recursive: true, force: true });
    const probeUrl = `http://127.0.0.1:${probeServer.address().port}/`;
    const probe = await chromium.launch({ headless: true });
    try {
      const probePage = await probe.newPage();
      const probeResponse = await probePage.goto(probeUrl);
      if (!probeResponse || !probeResponse.ok()) {
        throw new Error(`probe navigation to ${probeUrl} did not succeed`);
      }
    } finally {
      await probe.close();
    }
    chromiumAvailable = true;
  } catch (err) {
    chromiumProbeError = err;
  } finally {
    if (probeServer && probeServer.listening) {
      await new Promise((resolve) => probeServer.close(resolve));
    }
  }
}

// Lazy, inside the tests: at module scope an unbuilt dist/ would throw and take
// the whole file down as a crash rather than a skip.
let bridge = null;

// #target is an ordinary cubic-bezier row (the curve editor opens).
// #stepped carries steps(4), which the curve editor must refuse — that row falls
//   back to the plain-text control and is where the property-not-control
//   decision is actually visible.
// #linked binds its timing function to a DESIGN.md token: the one row state
//   where the presets must render and refuse.
const FIXTURE_BODY = `<style>
  :root { --motion-easing-standard: cubic-bezier(0.4, 0, 0.2, 1); }
  body { margin: 0; font-family: system-ui, sans-serif; }
  #target, #stepped, #linked, #compound {
    width: 280px; height: 64px; margin: 24px auto; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; color: #1c2540; background: #dfe7ff;
  }
  #target { transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; }
  #stepped { transition: opacity 300ms steps(4, end) 0ms; background: #f3d9d9; }
  /* Two timing functions in one declaration. The header claims a compound list
     still reaches the presets, and until this fixture existed that claim had
     nothing behind it — a gate reading isTimingFunctionProperty(property) AND
     timingFunctionCount(previousValue) === 1 left every other fixture green
     while silently dropping springs here. (No backticks in this comment: it
     lives inside a template literal, and the first draft closed the fixture
     string and took the whole file down at parse time.) */
  #compound {
    background: #f5eede;
    transition: transform 200ms ease-in 0ms, opacity 300ms ease-out 0ms;
  }
  #linked {
    background: #e0efe6;
    transition-property: transform; transition-duration: 200ms;
    transition-timing-function: var(--motion-easing-standard);
  }
</style>
<div id="target">Target</div>
<div id="stepped">Stepped</div>
<div id="compound">Compound</div>
<div id="linked">Linked</div>`;

// The token #linked binds to. The PATH decides the CSS variable name
// (`motion.easing.standard` -> `--motion-easing-standard`), so this front matter
// and the fixture's :root declaration have to agree or the row renders unlinked
// and the refusal test measures nothing — which is why that test asserts
// data-token-linked before it clicks anything.
const DESIGN_MD = [
  '---',
  'color:',
  '  text:',
  '    primary: "#ffffff"',
  'motion:',
  '  easing:',
  '    standard: "cubic-bezier(0.4, 0, 0.2, 1)"',
  '---',
  '',
  '# Fixture',
  ''
].join('\n');

const VIEWPORT = { width: 1280, height: 720 };

async function withLocalOverlay(fn) {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-spring-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, DESIGN_MD, 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>spring host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto('http://127.0.0.1:' + fixture.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => fixture.close(resolve));
  }
}

function shadowEval(page, fn, arg) {
  return page.evaluate(([source, value]) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    // eslint-disable-next-line no-new-func
    return new Function('root', 'arg', 'return (' + source + ')(root, arg);')(root, value);
  }, [fn.toString(), arg === undefined ? null : arg]);
}

// A raw mouse click at the element's centre: page.click fails actionability
// against the overlay host, the same reason the drag and easing suites click by
// point.
async function selectElement(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector('[data-style-property]'));
  }, null, { timeout: 5000 });
}

async function openStyleEditor(page, property) {
  const point = await shadowEval(page, (root, prop) => {
    const cell = root.querySelector('li[data-style-property="' + prop + '"] code[data-style-value]');
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, property);
  assert.ok(point, `no style row rendered for ${property}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((prop) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const row = root.querySelector('li[data-style-property="' + prop + '"]');
    return Boolean(row && row.querySelector('.raven-grab-style-editor'));
  }, property, { timeout: 5000 });
}

function editorState(page, property) {
  return shadowEval(page, (root, prop) => {
    const row = root.querySelector('li[data-style-property="' + prop + '"]');
    const editor = row && row.querySelector('.raven-grab-style-editor');
    if (!editor) return null;
    const input = editor.querySelector('input');
    const springs = Array.from(editor.querySelectorAll('.raven-grab-spring-preset'));
    return {
      control: editor.getAttribute('data-control'),
      value: input ? input.value : null,
      hasCanvas: Boolean(editor.querySelector('.raven-grab-easing-canvas')),
      easingPresets: editor.querySelectorAll('.raven-grab-easing-preset').length,
      springs: springs.map((b) => b.textContent.trim()),
      springTitles: springs.map((b) => b.title),
      springsDisabled: springs.map((b) => b.disabled),
      tokenLinked: editor.getAttribute('data-token-linked')
    };
  }, property);
}

// A spring preset commits, which rebuilds the panel and destroys the editor —
// the same path the easing presets take. So the value to read afterwards is the
// committed row value and, better, the inline style actually written to the
// element.
function committedValue(page, property, selector) {
  return shadowEval(page, (root, arg) => {
    const row = root.querySelector('li[data-style-property="' + arg.property + '"]');
    const cell = row && row.querySelector('code[data-style-value]');
    const target = document.querySelector(arg.selector);
    return {
      raw: cell ? cell.getAttribute('data-style-raw') : null,
      inline: target ? target.style.getPropertyValue(arg.property) : null
    };
  }, { property, selector });
}

async function clickSpringPreset(page, property, label) {
  const point = await shadowEval(page, (root, arg) => {
    const row = root.querySelector('li[data-style-property="' + arg.property + '"]');
    const editor = row && row.querySelector('.raven-grab-style-editor');
    const button = editor && Array.from(editor.querySelectorAll('.raven-grab-spring-preset'))
      .find((b) => b.textContent.trim() === arg.label);
    if (!button) return null;
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { property, label });
  assert.ok(point, `no "${label}" spring preset rendered for ${property}`);
  await page.mouse.click(point.x, point.y);
}

// Once the probe has come up, nothing in this file skips: every later failure is
// a real failure and is thrown. Not independently falsifiable on a machine where
// chromium works, so the probe error travels with the skip to make the state
// legible when it happens.
function skipIfNoBrowser(t) {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay spring control; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return true;
  }
  return false;
}

function springValues(value) {
  const match = String(value).match(/^linear\((.*)\)$/);
  assert.ok(match, `expected a linear() value, got ${value}`);
  return match[1].split(',').map((part) => parseFloat(part.trim()));
}

test('a bezier timing row keeps its curve editor AND gains the spring presets', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const state = await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    return editorState(page, 'transition-timing-function');
  });
  // The bezier editor is untouched: this feature APPENDS, and a mutation that
  // moved the spring block inside the easing branch would still pass the spring
  // half of this assertion while failing test 2.
  assert.equal(state.control, 'easing');
  assert.ok(state.hasCanvas, 'the curve editor still opens');
  assert.equal(state.easingPresets, 5, 'and its five keyword presets are still there');
  assert.deepEqual(state.springs, ['gentle', 'smooth', 'snappy', 'bouncy']);
  // The settle time is a HINT, never a written value: linear() is a normalised
  // progress curve, so this row owns the shape and transition-duration still
  // owns the speed. A preset whose hint named no time would be decoration.
  state.springTitles.forEach((title, index) => {
    assert.match(title, /natural settle ≈ \d+ms$/, `preset ${index} states its settle time`);
    assert.ok(title.startsWith(state.springs[index]), 'and states which spring it belongs to');
  });
});

test('a steps() timing row falls back to text and STILL offers springs', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const state = await withLocalOverlay(async (page) => {
    await selectElement(page, '#stepped');
    await openStyleEditor(page, 'transition-timing-function');
    return editorState(page, 'transition-timing-function');
  });
  // This is the whole placement decision, and it is only visible here. The curve
  // editor correctly refuses steps() — but the ROW is still a timing function,
  // and a spring is exactly what someone opening a steps() row is likely to
  // want. Keying the block on the control instead of the property would leave
  // this row, an existing linear(), and every compound list with no spring at
  // all, while every other test in this file stayed green.
  assert.equal(state.control, 'text', 'steps() has no two control points to drag');
  assert.equal(state.hasCanvas, false);
  assert.equal(state.easingPresets, 0);
  assert.deepEqual(state.springs, ['gentle', 'smooth', 'snappy', 'bouncy']);
});

test('a COMPOUND timing list falls back to text and STILL offers springs', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const state = await withLocalOverlay(async (page) => {
    await selectElement(page, '#compound');
    await openStyleEditor(page, 'transition-timing-function');
    return editorState(page, 'transition-timing-function');
  });
  // The third fallback the header names, and the one that had no fixture for a
  // full round — an unmeasured claim in a comment is a defect by this repo's
  // own rule, and the adverse pass found it by writing the gate that exploits
  // it. `steps()` and a compound list reach the plain-text control by two
  // DIFFERENT routes: steps() is a single unparseable function, this is two
  // parseable ones separated by a top-level comma. A gate keyed on the count
  // rather than the property passes the steps() test and fails only here.
  assert.equal(state.control, 'text', 'a two-function list has no single curve to drag');
  assert.equal(state.hasCanvas, false);
  assert.equal(state.easingPresets, 0);
  assert.deepEqual(state.springs, ['gentle', 'smooth', 'snappy', 'bouncy']);
  // Asserting the fixture is genuinely compound, or a browser that collapsed
  // the shorthand would turn this into a second steps()-shaped test measuring
  // nothing.
  assert.ok(state.value.includes(','), `fixture is a compound list, got ${state.value}`);
});

test('a non-timing motion row offers no springs', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const state = await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-duration');
    return editorState(page, 'transition-duration');
  });
  // transition-duration is the closest neighbour there is — same section, same
  // element, one row away — so it is the row that catches a block attached to
  // the section rather than to the property.
  assert.deepEqual(state.springs, []);
});

test('a spring preset commits a linear() that re-opens verbatim', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const result = await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    await clickSpringPreset(page, 'transition-timing-function', 'bouncy');
    await page.waitForFunction(() => {
      const target = document.querySelector('#target');
      return target.style.getPropertyValue('transition-timing-function').startsWith('linear(');
    }, null, { timeout: 5000 });
    const committed = await committedValue(page, 'transition-timing-function', '#target');
    // Re-open the row. This is the generative-only contract: a spring that had
    // to be PARSED back would be re-derived here, and any rounding or
    // re-sampling in that round trip is a value the user never authored.
    await openStyleEditor(page, 'transition-timing-function');
    const reopened = await editorState(page, 'transition-timing-function');
    return { committed, reopened };
  });

  assert.ok(result.committed.inline.startsWith('linear('),
    `the element itself carries the spring, got ${result.committed.inline}`);
  const values = springValues(result.committed.inline);
  assert.equal(values[0], 0, 'a step response starts at 0');
  assert.equal(values[values.length - 1], 1, 'and ends at exactly 1');
  assert.ok(Math.max(...values) > 1.1, 'bouncy overshoots — that is what makes it a spring');
  // Percentage stops, not bare values. The browser spreads bare values EVENLY,
  // which is precisely wrong after simplification: the kept points are
  // deliberately no longer evenly spaced, so a value list would render a
  // different curve from the one that was generated.
  assert.match(result.committed.inline, /\d+(\.\d+)?%/, 'interior points carry their own stops');

  assert.equal(result.reopened.control, 'text',
    'linear() is not a bezier, so it re-opens in the control that round-trips it');
  // Against the ROW, not against the element. Chromium re-serialises the inline
  // value with explicit `0 0%` and `1 100%` endpoints, so an equality against
  // `inline` compares the generator's output to the ENGINE'S NORMALISATION of it
  // and fails on correct code — which is exactly what the first draft of this
  // assertion did. A derived expected-value is as falsifiable as the thing it
  // grades.
  assert.equal(result.reopened.value, result.committed.raw,
    'the row re-opens carrying the string that was written, not a re-derivation of it');
  // And that normalisation is itself the strongest evidence available that the
  // value is VALID CSS: an unparseable timing function leaves the inline
  // declaration empty, so a serialised value at all means Chromium accepted it,
  // and the endpoints it chose to spell out confirm where ours landed.
  assert.match(result.committed.inline, /^linear\(0 0%,.*, 1 100%\)$/,
    'Chromium parsed the curve and agrees about both endpoints');
});

test('two different springs write two different curves', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const both = await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    await clickSpringPreset(page, 'transition-timing-function', 'smooth');
    await page.waitForFunction(() => document.querySelector('#target').style
      .getPropertyValue('transition-timing-function').startsWith('linear('), null, { timeout: 5000 });
    const smooth = (await committedValue(page, 'transition-timing-function', '#target')).inline;
    await openStyleEditor(page, 'transition-timing-function');
    await clickSpringPreset(page, 'transition-timing-function', 'bouncy');
    await page.waitForFunction((prev) => {
      const now = document.querySelector('#target').style.getPropertyValue('transition-timing-function');
      return now.startsWith('linear(') && now !== prev;
    }, smooth, { timeout: 5000 });
    const bouncy = (await committedValue(page, 'transition-timing-function', '#target')).inline;
    return { smooth, bouncy };
  });

  // Without this, four buttons emitting one shared curve would satisfy every
  // other test in the file — the labels would be decoration and the feature
  // would be one preset wearing four hats.
  assert.notEqual(both.smooth, both.bouncy);
  assert.ok(Math.max(...springValues(both.smooth)) <= 1, 'smooth never overshoots');
  assert.ok(Math.max(...springValues(both.bouncy)) > 1.1, 'bouncy does');
});

test('a token-linked timing row renders the springs and refuses them', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const result = await withLocalOverlay(async (page) => {
    await selectElement(page, '#linked');
    await openStyleEditor(page, 'transition-timing-function');
    const state = await editorState(page, 'transition-timing-function');
    await clickSpringPreset(page, 'transition-timing-function', 'bouncy');
    // A disabled <button> fires no click, so the page needs a beat to prove
    // nothing happened rather than to prove something did.
    await page.waitForTimeout(150);
    const after = await committedValue(page, 'transition-timing-function', '#linked');
    return { state, after };
  });

  // Asserted BEFORE the refusal, because an unlinked row would refuse nothing
  // and a row with no presets would refuse everything — either way the click
  // below would measure the wrong thing.
  assert.equal(result.state.tokenLinked, 'true', 'the fixture row really is token-linked');
  assert.equal(result.state.springs.length, 4, 'and the presets still render — seeing them is worth keeping');
  assert.deepEqual(result.state.springsDisabled, [true, true, true, true],
    'the row token lock covers the spring presets');
  // The harm this prevents is not a refused click; it is a click that PREVIEWS a
  // curve onto the element and then commits nothing, because commit() returns
  // early while the row is linked. That is output-disagreeing-with-state.
  assert.equal(result.after.inline, '', 'nothing was written to the element');
});
