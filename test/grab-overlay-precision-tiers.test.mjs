// The three-tier precision rule, measured at its CALL SITES rather than at the
// helper it shares.
//
// Why this file exists: the unit assertions in test/grab-bridge.test.mjs grade
// `scrubPrecisionMode()` and `steppedNumericValue()` directly, and a comment in
// browser/raven-grab.js claimed they "fail if minPrecision is dropped from
// either the helper or a call site". The measured matrix
// (.claude/dialkit-2026-08-08/precision-mutants.mjs) refuted the second half:
// dropping the floor at ANY of the three call sites left the whole suite green.
// The helper was guarded and the wiring was not — the inert-control shape this
// codebase has shipped before, where a guard reads an intermediate rather than
// the thing the user actually receives.
//
// What makes the floor load-bearing, and why a unit test cannot see it: every
// consumer renders through `digits ? toFixed(digits) : Math.round(...)`, and
// `digits` comes from the precision ALREADY IN THE FIELD. On a whole-number
// value like `16px` the fine tier's 0.1 step therefore rounds straight back to
// 16 — the user holds Alt, drags or taps an arrow, and NOTHING MOVES, which is
// indistinguishable from a dead control. So the discriminator here is never
// "is the number formatted nicely"; it is "did the value change at all".
//
// Whole-number fixture values are mandatory for the same reason. A fixture of
// `16.5px` already carries one decimal, `Math.max(precision, minPrecision)`
// returns 1 either way, and every assertion below passes with the floor deleted
// from all three sites.
//
// MEASURED mutant matrix (.claude/dialkit-2026-08-08/precision-mutants.mjs v3,
// which runs BOTH this suite and grab-bridge.test.mjs): 7 mutants, 7 killed, 0
// survived; 1 control, 0 false-failed. v2 — the same matrix without this file —
// was 4 killed and 3 SURVIVED, and the three survivors were exactly P5/P6/P7.
//
//   P5  CALL SITE (pointer scrub): floor dropped from the emitted precision  1
//   P6  CALL SITE (style-editor arrow step): floor not passed                1
//   P7  CALL SITE (size-control arrow step): floor not passed                1
//   P1  the fine tier offers its multiplier with no floor                    4
//   P2  the fine tier steps by a whole unit                                  4
//   P4  the shared formatter ignores the floor it is handed                  3
//   P3  alt tested before shift, so a two-key hold yields fine               1
//
// Two radii carry information beyond "it is guarded". P5/P6/P7 each redden
// exactly ONE test, and a different one each — that is what proves this file
// covers three separate wirings rather than one shared mechanism counted three
// times. And P4 reddens the two ARROW tests but not the scrub, because
// beginStyleScrub re-derives the rounding inline rather than calling
// steppedNumericValue; the two copies are a stated residual (they parse with
// different parsers, so collapsing them is a behaviour change) and both are
// covered here. P3 stays at 1 because no test in this file holds Shift and Alt
// together — the tier-order rule is the unit test's to own.
//
// The harness itself had to be fixed twice before these numbers meant anything:
// once for a radius correction left in the code after its comment was edited
// away (v1 reported 7/7 SURVIVED on a working feature), and once for a lazy
// name regex that truncated every name here at its first parenthesis, collapsing
// three distinct radius-1 kills into the same unattributable string.
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

// Full probe: loopback listen, temp-dir write/remove, launch, and a real
// navigation the browser has to complete. A narrower probe passes in a sandbox
// that permits one of those and denies another, and the resulting environment
// failure then gets reported as a product defect.
let chromiumAvailable = false;
let chromiumProbeError = playwrightError;
if (chromium) {
  let probeServer = null;
  try {
    probeServer = createServer((_q, r) => r.end('ok'));
    await new Promise((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    const probeDir = await mkdtemp(path.join(tmpdir(), 'raven-precision-probe-'));
    await writeFile(path.join(probeDir, 'probe.txt'), 'ok', 'utf8');
    await rm(probeDir, { recursive: true, force: true });
    const probeUrl = `http://127.0.0.1:${probeServer.address().port}/`;
    const probe = await chromium.launch({ headless: true });
    try {
      const probePage = await probe.newPage();
      const probeResponse = await probePage.goto(probeUrl);
      if (!probeResponse || !probeResponse.ok()) throw new Error(`probe navigation to ${probeUrl} did not succeed`);
    } finally {
      await probe.close();
    }
    chromiumAvailable = true;
  } catch (err) {
    chromiumProbeError = err;
  } finally {
    if (probeServer && probeServer.listening) await new Promise((resolve) => probeServer.close(resolve));
  }
}

let bridge = null;

const VIEWPORT = { width: 1280, height: 800 };
const DESIGN_MD = '---\ncolor:\n  text:\n    primary: "#111111"\n---\n\n# Fixture\n';
// Whole numbers on purpose — see the header. A fractional fixture makes every
// assertion in this file pass with the feature deleted.
const FIXTURE_BODY = `<style>
  body { margin: 0; font: 16px system-ui; }
  #card { position: absolute; left: 460px; top: 200px; width: 240px; font-size: 16px; padding: 24px; background: #eef; }
</style>
<div id="card">Precision fixture</div>`;

async function withLocalOverlay(fn) {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-precision-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, DESIGN_MD, 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>precision host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
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

async function selectCard(page) {
  const box = await page.locator('#card').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector('[data-style-property]'));
  }, null, { timeout: 5000 });
}

// The scrub arms on the property LABEL, not the value — the Figma affordance,
// wired at the `[data-style-label]` mousedown. Pressing the value cell instead
// opens the editor, which is a different call site (P6) and would have made this
// test measure that one twice.
function labelPoint(page, property) {
  return shadowEval(page, (root, prop) => {
    const label = root.querySelector('li[data-style-property="' + prop + '"] [data-style-label]');
    if (!label) return null;
    label.scrollIntoView({ block: 'center' });
    const rect = label.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, property);
}

function valueCellPoint(page, property) {
  return shadowEval(page, (root, prop) => {
    const cell = root.querySelector('li[data-style-property="' + prop + '"] code[data-style-value]');
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, property);
}

async function openStyleEditor(page, property) {
  const point = await valueCellPoint(page, property);
  assert.ok(point, `no style row rendered for ${property}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((prop) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const row = root.querySelector('li[data-style-property="' + prop + '"]');
    return Boolean(row && row.querySelector('.raven-grab-style-editor'));
  }, property, { timeout: 5000 });
}

function editorInputValue(page, property) {
  return shadowEval(page, (root, prop) => {
    const row = root.querySelector('li[data-style-property="' + prop + '"]');
    const editor = row && row.querySelector('.raven-grab-style-editor');
    if (!editor) return null;
    const input = editor.querySelector('input[type="text"], input:not([type])');
    return input ? input.value : null;
  }, property);
}

// Releasing the scrub commits AND emits a trailing click on the value cell,
// which opens the style editor and takes that cell out of the DOM — so the row's
// `data-style-raw` reads null after a drag and is not the thing to assert on.
// The inline style written to the element is available either way, and it is the
// stronger measurement anyway: it is what the page actually renders.
function committedValue(page, property, selector) {
  return shadowEval(page, (root, arg) => {
    const cell = root.querySelector('li[data-style-property="' + arg.property + '"] code[data-style-value]');
    const target = document.querySelector(arg.selector);
    return {
      raw: cell ? cell.getAttribute('data-style-raw') : null,
      inline: target ? target.style.getPropertyValue(arg.property) : null
    };
  }, { property, selector });
}

// P5 — the pointer scrub. Alt held across the DRAG, because scrubPrecisionMode
// reads the move event, not the mousedown: the tier is meant to be switchable
// mid-drag.
test('CALL SITE (pointer scrub): a fine-tier drag moves a whole-number value at all', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectCard(page);
    const point = await labelPoint(page, 'font-size');
    assert.ok(point, 'no font-size row rendered');

    const before = await committedValue(page, 'font-size', '#card');
    assert.equal(before.raw, '16px', 'the fixture must start on a WHOLE number or this test measures nothing');
    assert.equal(before.inline, '', 'and nothing has been written to the element yet');

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.keyboard.down('Alt');
    // 5px of travel at the fine tier's 0.1 multiplier is +0.5 — a step that
    // exists only if the floor survives. Without it Math.round pulls 16.5 to 17,
    // so the failure is a WRONG value, not merely an unformatted one.
    await page.mouse.move(point.x + 5, point.y, { steps: 5 });
    await page.keyboard.up('Alt');
    await page.mouse.up();

    const after = await committedValue(page, 'font-size', '#card');
    assert.equal(after.inline, '16.5px', 'the fine tier must reach a half-step, not round it away');
  });
});

// P6 — the style-editor arrow stepper.
test('CALL SITE (style-editor arrow step): Alt+ArrowUp is not a dead key on a whole number', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectCard(page);
    await openStyleEditor(page, 'font-size');
    assert.equal(await editorInputValue(page, 'font-size'), '16', 'the editor must open on a WHOLE number or this test measures nothing');

    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Alt');

    assert.equal(await editorInputValue(page, 'font-size'), '16.1', 'the fine tier must step by a tenth and keep it');
  });
});

// P7 — the size control's own stepper. A separate wiring: width/height render a
// fixed/fill/hug control with its own number input, so it passes the floor
// through its own call to steppedNumericValue.
test('CALL SITE (size-control arrow step): Alt+ArrowUp is not a dead key on a fixed size', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectCard(page);
    await openStyleEditor(page, 'width');

    const opened = await shadowEval(page, (root) => {
      const row = root.querySelector('li[data-style-property="width"]');
      const editor = row && row.querySelector('.raven-grab-style-editor');
      if (!editor) return null;
      const number = editor.querySelector('input');
      const select = editor.querySelector('select');
      if (number) number.focus();
      return { value: number ? number.value : null, hasModeSelect: Boolean(select) };
    });
    assert.ok(opened, 'the width editor did not open');
    // Both preconditions asserted: without the mode select this is the plain
    // number control and the test would be measuring P6 a second time.
    assert.ok(opened.hasModeSelect, 'width must render the size control, not the plain number editor');
    assert.equal(opened.value, '240', 'the size control must open on a WHOLE number or this test measures nothing');

    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Alt');

    const after = await shadowEval(page, (root) => {
      const editor = root.querySelector('li[data-style-property="width"] .raven-grab-style-editor');
      const number = editor && editor.querySelector('input');
      return number ? number.value : null;
    });
    assert.equal(after, '240.1', 'the fine tier must step by a tenth and keep it');
  });
});
