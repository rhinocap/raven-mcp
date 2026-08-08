// The cubic-bezier curve editor in the Grab overlay's new Motion section.
//
// This needs a real browser. The mechanism under test spans the shadow root, a
// pointer-capture drag on an SVG surface, and the existing blur-commit path —
// and the defect class this feature can produce is a curve that LOOKS right on
// the drag surface while the committed value says something else, which is
// invisible to a fake DOM that never lays anything out.
//
// The parser's own boundaries (what may and may not be called "easing") are
// pinned separately in test/grab-bridge.test.mjs, which owns the overlay
// internals loader; duplicating that loader here would be two copies of one
// rule. This file covers only what the browser can see.
//
// Mutation matrix (MEASURED — every radius is produced by applying the mutation
// to a copy served through RAVEN_GRAB_ASSET_PATH, load-checked before its run,
// and counting the distinct tests that turned red. Radii are recorded for BOTH
// suites, since several mutants redden the parser tests in grab-bridge.test.mjs
// instead of, or as well as, the widget tests here). Re-run the WHOLE matrix
// after any fix round: a find-string mutant dies silently the moment its target
// line is edited.
//
// Run 4 (the whole matrix re-measured after round 2's token-lock fix added E14,
// E15 and one test): 15 mutants, 15 killed, 0 survived.
//
//   E1  drop the easing branch from classifyStyleControl            -> 10
//   E2  classifyStyleControl returns "easing" without the parser    -> 3
//   E3  parseEasingValue skips the x in [0,1] check                 -> 1 (parser)
//   E4  the drag clamps y into the unit square                      -> 1
//   E5  a keyword lookup hands out the shared EASING_KEYWORDS array -> 1 (parser)
//   E6  timingFunctionCount splits on every comma                   -> 10
//   E7  a preset writes the bezier expansion, not the keyword       -> 1
//   E8  the drag redraws the curve but never writes input.value     -> 5
//   E9  unitOptionsForProperty always returns the length list       -> 1 (parser)
//   E10 the motion category carries no properties                   -> 13
//   E11 formatBezierNumber rounds every coordinate to 3 decimals    -> 1
//   E12 a cancelled drag drops its listeners without restoring      -> 2
//   E13 a cancelled drag restores previousValue, not this drag's    -> 1
//   E14 the easing HANDLES ignore the row token lock                -> 1
//   E15 the easing PRESETS are left out of styleValueControlsInEditor -> 1
//
// E1 and E6 have the SAME radius of 10, and the honest description is two
// mutation SITES on ONE path — which is weaker than what this comment claimed
// for one round, and the weaker version is the true one. Round 2 said "one
// mechanism"; the correction said "two mechanisms, independently reachable";
// Sol round 3 refuted the second half by reading the code, and so did I:
// `timingFunctionCount` has exactly ONE call site in the overlay
// (browser/raven-grab.js:5259, inside `parseEasingValue`), and
// `classifyStyleControl`'s easing branch always calls `parseEasingValue`. There
// is no input that reaches the count without going through classification, so
// they are not two production paths. They are two edits to the same one, and
// both land at the same place: the plain-text control, where every widget test
// loses its subject. The radius cannot separate them; the assertion MESSAGE is
// what does. Note this is NOT the shape of the A1/A2 note in the alignment
// suite, which the previous version of this paragraph claimed — those two really
// are separate mechanisms. Getting that wrong twice in two rounds is the reason
// the rule is written here: a radius says how many tests a mutation reddens and
// nothing whatsoever about how the code is wired. Read the call sites.
// E10's 13 is the widest for a different reason one layer up — with no motion
// properties in the capture set there is no row to click at all. E8's 5 and
// E12's 2 are shared preconditions: every drag test asserts the value moved,
// and both cancel tests assert a restore.
//
// E14 and E15 both redden the SINGLE token-lock test, and they are likewise two
// mechanisms rather than one, for a reason the platform forces: `disabled` is
// meaningless on an SVG element, so the handles refuse in their own pointerdown
// while the preset <button>s ride the shared styleValueControlsInEditor lock.
// The test asserts the presets first and the drag second, and `assert` aborts at
// the first failure — so which of the two fired is read off the message, never
// off the radius.
//
// Run 1 measured E1/E6 at 6, E8 at 2 and E10 at 9; run 3 measured them at 9, 5
// and 12. Those numbers did not go up because coverage improved — tests were
// added and they exercise the same mechanisms. That is why the whole matrix is
// re-run rather than carried forward, and why a radius is read as a fact about
// a mechanism.
//
// E13 SURVIVED run 2 and is killed here only because a test was written for it.
// A survivor is either a missing test or a clause with no reachable trigger, and
// which one it is has to be established rather than assumed: reading the code
// showed that pointerup and every preset COMMIT (rebuilding the panel and
// destroying the editor), so the only route to a second drag in one session is
// typing, which redraws without committing. That made the trigger reachable and
// the survivor a coverage hole.
//
// The parser test counts as ONE red however many of its assertions break; the
// radii marked "(parser)" are therefore a floor, not a measurement of how much
// of the parser each mutation reaches.
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
  test('playwright available for overlay easing test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');

// #target carries a real transition so the Motion rows have something to read;
// #stepped carries a steps() timing function, which the editor must refuse;
// #compound carries two transitions, the case where a single dragged handle
// would otherwise rewrite a sub-value nobody touched. Everything sits in the
// horizontal gap between the docked panels at x~640.
// #linked binds its timing function to a DESIGN.md token, which is the one row
// state where the editor must render and refuse: the curve is still worth
// SEEING, and commit() rejects raw writes while the row is linked.
const FIXTURE_BODY = `<style>
  :root { --motion-easing-standard: cubic-bezier(0.4, 0, 0.2, 1); }
  body { margin: 0; font-family: system-ui, sans-serif; }
  #target, #stepped, #compound {
    width: 280px; height: 64px; margin: 24px auto; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; color: #1c2540; background: #dfe7ff;
  }
  #target { transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; }
  #stepped { transition: opacity 300ms steps(4, end) 0ms; background: #f3d9d9; }
  #compound { transition: transform 200ms ease-out 0ms, opacity 400ms linear 0ms; background: #d9f3e2; }
  #precise { transition: transform 200ms cubic-bezier(0.12345, 0.54321, 0.98765, 0.24681) 0ms; background: #efe0f5; }
  #linked {
    width: 280px; height: 64px; margin: 24px auto; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; color: #1c2540; background: #e0efe6;
    transition-property: transform; transition-duration: 200ms;
    transition-timing-function: var(--motion-easing-standard);
  }
</style>
<div id="target">Target</div>
<div id="stepped">Stepped</div>
<div id="compound">Compound</div>
<div id="precise">Precise</div>
<div id="linked">Linked</div>`;

// The token the #linked row binds to. The path decides the CSS variable name
// (`motion.easing.standard` -> `--motion-easing-standard`), so the DESIGN.md
// front matter and the fixture's :root declaration have to agree or the row
// renders as an ordinary unlinked curve and the refusal test measures nothing —
// which is why that test asserts data-token-linked before it drags anything.
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

// #precise carries five decimals on every coordinate BECAUSE Chromium keeps
// them: measured on this host, getComputedStyle returns the literal verbatim.
// If the engine ever starts rounding, the precision test below stops measuring
// the defect it was written for, so it asserts the value it opened with rather
// than assuming.
//
// Both y coordinates sit INSIDE the drawn [-0.5, 1.5] range on purpose. The
// first draft used y2 = 3.45678, which puts handle B off the top of the
// surface: the pointer never landed on it, nothing moved, and the two
// precision assertions passed against an editor that had done nothing at all.
// The notEqual on the dragged coordinate is what caught it, and it stays for
// that reason. Overshoot is covered by its own test above.
const PRECISE_VALUE = 'cubic-bezier(0.12345, 0.54321, 0.98765, 0.24681)';

const VIEWPORT = { width: 1280, height: 720 };

async function withLocalOverlay(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-easing-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, DESIGN_MD, 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>easing host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));

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
// against the overlay host, the same reason the drag suite clicks by point.
async function selectElement(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return Boolean(root.querySelector('[data-style-property]'));
  }, null, { timeout: 5000 });
}

// Open the Styles editor for one property by clicking its value cell.
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
    const canvas = editor.querySelector('.raven-grab-easing-canvas');
    const handles = editor.querySelectorAll('.raven-grab-easing-handle');
    const presets = Array.from(editor.querySelectorAll('.raven-grab-easing-preset')).map((b) => b.textContent.trim());
    let handleBox = null;
    if (handles[0]) {
      const r = handles[0].getBoundingClientRect();
      handleBox = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }
    let canvasBox = null;
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      canvasBox = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return {
      control: editor.getAttribute('data-control'),
      value: input ? input.value : null,
      hasCanvas: Boolean(canvas),
      handleCount: handles.length,
      presets,
      handleBox,
      canvasBox,
      tokenLinked: editor.getAttribute('data-token-linked'),
      presetsDisabled: Array.from(editor.querySelectorAll('.raven-grab-easing-preset')).map((b) => b.disabled)
    };
  }, property);
}

// Releasing the pointer commits, which rebuilds the panel and closes the editor
// — the same path beginStyleScrub takes. So after a drag the value to read is
// the COMMITTED one on the row (and, better, the inline style actually written
// to the element), not a live input that no longer exists.
function committedValue(page, property, selector) {
  return shadowEval(page, (root, arg) => {
    const row = root.querySelector('li[data-style-property="' + arg.property + '"]');
    const cell = row && row.querySelector('code[data-style-value]');
    const editor = row && row.querySelector('.raven-grab-style-editor');
    const input = editor && editor.querySelector('input');
    const target = document.querySelector(arg.selector);
    return {
      raw: cell ? cell.getAttribute('data-style-raw') : null,
      live: input ? input.value : null,
      inline: target ? target.style.getPropertyValue(arg.property) : null
    };
  }, { property, selector });
}

function pointsOf(value) {
  const match = String(value).match(/^cubic-bezier\((.*)\)$/);
  assert.ok(match, `expected a cubic-bezier value, got ${value}`);
  return match[1].split(',').map((n) => parseFloat(n.trim()));
}

test('a cubic-bezier timing function opens the curve editor, not a text field', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const state = await editorState(page, 'transition-timing-function');
    assert.equal(state.control, 'easing');
    assert.equal(state.hasCanvas, true, 'the drag surface must mount');
    assert.equal(state.handleCount, 2, 'a cubic bezier has exactly two draggable control points');
    assert.equal(state.value, 'cubic-bezier(0.4, 0, 0.2, 1)',
      'the text input stays the source of truth for commit and must carry the live value');
    assert.deepEqual(state.presets, ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);
  });
});

test('the handles are round, not stretched by a mismatched viewBox', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const { handleBox, canvasBox } = await editorState(page, 'transition-timing-function');
    // The first draft used a 0..100 square viewBox with preserveAspectRatio
    // "none" inside a wide box, which scales x and y by different factors: every
    // circular handle rendered as a wide ellipse and the grab target was a
    // different size per axis. The viewBox is pinned to the CSS aspect-ratio so
    // the two cannot drift apart again. The width assertion is the fixture's own
    // precondition — in a square box the distortion is unobservable.
    assert.ok(canvasBox.w > canvasBox.h, 'the surface must actually be wider than it is tall, or this measures nothing');
    const ratio = handleBox.w / handleBox.h;
    assert.ok(ratio > 0.9 && ratio < 1.1, `handle rendered ${handleBox.w}x${handleBox.h} — distorted by a mismatched viewBox`);
  });
});

test('dragging a handle rewrites the committed value, not just the drawing', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const before = await editorState(page, 'transition-timing-function');

    // The text input is what commitStyleEdit reads on blur, so a drag that moves
    // the curve without writing input.value draws a change that never lands.
    await page.mouse.move(before.handleBox.x, before.handleBox.y);
    await page.mouse.down();
    await page.mouse.move(before.handleBox.x - 40, before.handleBox.y - 20, { steps: 6 });
    await page.mouse.up();

    const after = await committedValue(page, 'transition-timing-function', '#target');
    assert.notEqual(after.raw, before.value, 'the drag must reach the committed value');
    // The inline style is the only assertion that says the change reached the
    // page rather than only the panel's own bookkeeping.
    assert.equal(after.inline, after.raw, 'the committed curve must be written to the element');
    const points = pointsOf(after.raw);
    assert.equal(points.length, 4);
    assert.ok(points[0] < 0.4, `dragging left must lower x1 (got ${points[0]})`);
    assert.ok(points[1] > 0, `dragging up must raise y1 (got ${points[1]})`);
    // x is clamped to the CSS-legal range whatever the pointer does.
    assert.ok(points[0] >= 0 && points[0] <= 1);
    assert.ok(points[2] >= 0 && points[2] <= 1);
  });
});

test('dragging past the top of the surface keeps y out of the unit square', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const before = await editorState(page, 'transition-timing-function');

    // An overshoot curve is the reason to open this editor by hand. Dragging to
    // the top edge must produce y > 1 — a y clamped into [0,1] flattens exactly
    // the curve someone came here to build.
    await page.mouse.move(before.handleBox.x, before.handleBox.y);
    await page.mouse.down();
    await page.mouse.move(before.handleBox.x, before.canvasBox.y - 30, { steps: 6 });
    await page.mouse.up();

    const points = pointsOf((await committedValue(page, 'transition-timing-function', '#target')).raw);
    assert.ok(points[1] > 1, `y1 came back ${points[1]} — an overshoot curve cannot be drawn`);
  });
});

// An adverse pass found this: the editor ACCEPTED a five-decimal curve and then
// wrote back its own three-decimal approximation, because formatBezierNumber
// rounded on the way to text and ran over all four coordinates every time any
// one handle moved. So pressing a handle — without meaning to move it — rewrote
// the two coordinates the pointer never touched. That is the same
// "accepts a value it cannot represent, destroys the original on commit" defect
// the parser's fallbacks exist to prevent, arriving through the formatter.
//
// The discriminator is the UNTOUCHED handle, not the dragged one: a dragged
// coordinate is a new value and is allowed to be quantised. Handle B is dragged
// and handle A's two coordinates must survive verbatim.
test('dragging one handle leaves the other handle\'s precision intact', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#precise');
    await openStyleEditor(page, 'transition-timing-function');
    const before = await editorState(page, 'transition-timing-function');

    // Asserts the fixture rather than assuming it: if Chromium ever rounds the
    // computed value, there is no precision left to lose and this test would
    // pass while measuring nothing.
    assert.equal(before.value, PRECISE_VALUE, 'the editor did not open on the full-precision curve');

    const handleB = await shadowEval(page, (root) => {
      const handles = root.querySelectorAll('.raven-grab-easing-handle');
      const r = handles[1].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(handleB.x, handleB.y);
    await page.mouse.down();
    await page.mouse.move(handleB.x - 20, handleB.y, { steps: 4 });
    await page.mouse.up();

    const after = await committedValue(page, 'transition-timing-function', '#precise');
    const points = pointsOf(after.raw);
    assert.equal(points[0], 0.12345, `x1 was rewritten to ${points[0]}`);
    assert.equal(points[1], 0.54321, `y1 was rewritten to ${points[1]}`);
    // The dragged handle did move — otherwise the assertions above hold
    // trivially against an editor that commits nothing at all.
    assert.notEqual(points[2], 0.98765, 'the dragged handle did not move, so this test proves nothing');
    assert.equal(after.inline, after.raw, 'the committed curve must reach the element');
  });
});

// The second adverse finding: cancelDrag removed its listeners and returned,
// but pointerdown had ALREADY previewed — so an interrupted gesture left the
// page rendering a curve nobody authored with no matching entry in styleEdits.
// A synthetic pointercancel is the honest way to stage it; a real one comes
// from device interruption or lost pointer capture, neither of which a test can
// produce. Same verdict as finishCanvasDrag(false): restore, do not apply.
test('a cancelled drag restores the curve instead of stranding a preview', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const before = await editorState(page, 'transition-timing-function');

    await page.mouse.move(before.handleBox.x, before.handleBox.y);
    await page.mouse.down();
    await page.mouse.move(before.handleBox.x - 50, before.handleBox.y - 30, { steps: 6 });

    // Precondition: the drag really did write a preview onto the element.
    // Without this the cancel below could be "restoring" a change that never
    // happened, and the test would pass against a no-op editor.
    const midDrag = await committedValue(page, 'transition-timing-function', '#target');
    assert.ok(midDrag.live, 'the editor closed mid-drag — nothing left to cancel');
    assert.notEqual(midDrag.live, before.value, 'the drag did not move the value');
    assert.equal(midDrag.inline, midDrag.live, 'the drag did not preview onto the element');

    await shadowEval(page, (root) => {
      const handle = root.querySelectorAll('.raven-grab-easing-handle')[0];
      handle.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    });

    const after = await committedValue(page, 'transition-timing-function', '#target');
    assert.equal(after.live, before.value, `the editor kept the cancelled value (${after.live})`);
    assert.notEqual(after.inline, midDrag.inline, 'the cancelled preview is still on the element');
  });
});

// The restore point is the value THIS drag started from, not the row's
// original — and that distinction is reachable rather than theoretical. Both
// the pointerup path and every preset COMMIT, which rebuilds the panel and
// destroys the editor, so a second drag inside one editor session is
// impossible by those routes. Typing is the one thing that moves input.value
// without committing: the "input" listener redraws the curve and leaves the
// editor alive. Type a curve, start nudging a handle, lose the pointer, and a
// restore to previousValue throws away work the user did in this session.
//
// This test exists because the mutant that restores previousValue SURVIVED the
// first matrix. A surviving mutant is either a missing test or a clause with no
// reachable trigger; this one was the former, and the difference was decided by
// reading which paths commit — not by assuming.
test('a cancelled drag restores what the user typed, not the row original', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const before = await editorState(page, 'transition-timing-function');

    const TYPED = 'cubic-bezier(0.9, 0.05, 0.15, 0.95)';
    assert.notEqual(TYPED, before.value, 'the typed curve must differ from the row original');

    // Real typing, not a synthetic "input" event: the editor focuses and
    // selects its input on open, so a select-all + type replaces the value the
    // way a person would.
    const inputBox = await shadowEval(page, (root) => {
      const editor = root.querySelector('.raven-grab-style-editor');
      const r = editor.querySelector('input').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(inputBox.x, inputBox.y);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(TYPED);

    const typedState = await committedValue(page, 'transition-timing-function', '#target');
    assert.equal(typedState.live, TYPED, 'typing did not reach the editor input');

    // Handle positions moved when the typed curve redrew, so re-read them.
    const afterTyping = await editorState(page, 'transition-timing-function');
    await page.mouse.move(afterTyping.handleBox.x, afterTyping.handleBox.y);
    await page.mouse.down();
    await page.mouse.move(afterTyping.handleBox.x - 50, afterTyping.handleBox.y - 30, { steps: 6 });

    const midDrag = await committedValue(page, 'transition-timing-function', '#target');
    assert.notEqual(midDrag.live, TYPED, 'the drag did not move the typed value');

    await shadowEval(page, (root) => {
      const handle = root.querySelectorAll('.raven-grab-easing-handle')[0];
      handle.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    });

    const after = await committedValue(page, 'transition-timing-function', '#target');
    assert.equal(after.live, TYPED, `the cancel fell back past the typed value to ${after.live}`);
    assert.notEqual(after.live, before.value, 'the cancel restored the row original, discarding the typing');
  });
});

test('a preset writes the KEYWORD, not its bezier expansion', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    await openStyleEditor(page, 'transition-timing-function');
    const point = await shadowEval(page, (root) => {
      const buttons = Array.from(root.querySelectorAll('.raven-grab-easing-preset'));
      const button = buttons.find((b) => b.textContent.trim() === 'ease-out');
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    assert.ok(point, 'the ease-out preset must render');
    await page.mouse.click(point.x, point.y);

    const applied = await shadowEval(page, (root) => {
      const row = root.querySelector('li[data-style-property="transition-timing-function"]');
      const cell = row && row.querySelector('code[data-style-value]');
      const editor = row && row.querySelector('.raven-grab-style-editor');
      const input = editor && editor.querySelector('input');
      return { committed: cell ? cell.getAttribute('data-style-raw') : null, live: input ? input.value : null };
    });
    // "ease-out" is what a designer reads and what a stylesheet should carry;
    // expanding it to cubic-bezier(0, 0, 0.58, 1) is identical CSS and strictly
    // worse to hand back to an agent that is about to write the file.
    assert.equal(applied.live === null ? applied.committed : applied.live, 'ease-out');
  });
});

test('a steps() timing function stays a plain text field', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#stepped');
    await openStyleEditor(page, 'transition-timing-function');
    const state = await editorState(page, 'transition-timing-function');
    assert.notEqual(state.control, 'easing', 'steps() is not a two-control-point curve');
    assert.equal(state.hasCanvas, false, 'no curve surface may claim a value it cannot represent');
    assert.match(state.value, /steps\(/, 'the original value must survive verbatim');
  });
});

test('a compound timing function stays a plain text field', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#compound');
    await openStyleEditor(page, 'transition-timing-function');
    const state = await editorState(page, 'transition-timing-function');
    assert.equal(state.hasCanvas, false, 'one dragged handle must not be able to rewrite two curves');
    // Both sub-values are still there — the property the text fallback buys.
    assert.match(state.value, /ease-out/);
    assert.match(state.value, /linear/);
  });
});

test('the Motion rows render for a real element and carry live values', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#target');
    const rows = await shadowEval(page, (root) => {
      const out = {};
      for (const property of ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay']) {
        const cell = root.querySelector('li[data-style-property="' + property + '"] code[data-style-value]');
        out[property] = cell ? cell.getAttribute('data-style-raw') : null;
      }
      return out;
    });
    // transition-property rides along because a Motion section reading "0.2s /
    // ease" with no statement of WHAT is animating is contextless.
    assert.equal(rows['transition-property'], 'transform');
    assert.equal(rows['transition-duration'], '0.2s');
    assert.equal(rows['transition-timing-function'], 'cubic-bezier(0.4, 0, 0.2, 1)');
    assert.equal(rows['transition-delay'], '0s');
  });
});

test('a token-linked row renders the curve but refuses to author it', async () => {
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#linked');
    await openStyleEditor(page, 'transition-timing-function');
    const before = await editorState(page, 'transition-timing-function');

    // Preconditions, all three load-bearing. Without the first two a refusal is
    // indistinguishable from an editor that never opened; without the third the
    // row is not linked at all and the drag below would be REQUIRED to work.
    assert.equal(before.control, 'easing', 'a linked row must still get the curve editor');
    assert.equal(before.handleCount, 2, 'the curve is drawn, only its authoring is refused');
    assert.equal(before.tokenLinked, 'true', 'the fixture did not produce a token-linked row');

    // The presets are real <button>s, so the shared lock in
    // setStyleEditorTokenLinked reaches them and `disabled` blocks the click
    // natively. That is the whole mechanism for them.
    assert.ok(before.presetsDisabled.length > 0, 'no preset buttons rendered');
    assert.ok(before.presetsDisabled.every(Boolean), 'a preset button stayed live on a linked row');

    const inlineBefore = await page.evaluate(() =>
      document.querySelector('#linked').style.getPropertyValue('transition-timing-function'));

    // The SVG handles cannot carry `disabled`, so their refusal is a guard in
    // their own pointerdown. Drag one across the surface and nothing may move:
    // not the input, not the element. A preview here would write inline CSS
    // that commit() then declines to record.
    await page.mouse.move(before.handleBox.x, before.handleBox.y);
    await page.mouse.down();
    await page.mouse.move(before.handleBox.x + 60, before.handleBox.y - 40, { steps: 8 });
    const mid = await committedValue(page, 'transition-timing-function', '#linked');
    assert.equal(mid.live, before.value, `the handle drag moved a locked value to ${mid.live}`);
    await page.mouse.up();

    const after = await committedValue(page, 'transition-timing-function', '#linked');
    assert.equal(after.inline, inlineBefore, `the drag wrote inline CSS on a locked row: ${after.inline}`);
  });
});
