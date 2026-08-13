// "Add to queue" — an explicit bank for the live draft — and the style-only
// grab-loss path it was reported alongside.
//
// Andrew, 2026-08-10, verbatim: "I want a button on the the styles panel under
// instrucitons that says 'add to que' and ehen clicked it adds it to pending, I
// am losing grabs becasue they are not making it to the que". That is a feature
// request and a bug report in one sentence, and they need different fixes.
//
// THE BUG. lastConnectedPending is the rescue memo the 2026-08-08 detached-draft
// work added: a snapshot taken while the element is still CONNECTED, which
// carryDetachedDraft() promotes once the node goes. Its only writer is
// serializeLivePending(), reached only through persistPendingNow().
// commitStyleEdit() itself ends at syncActiveStyleDraftKey() and the editor
// commit only calls replaceStyleInput(), which rebuilds the row's value cell —
// so the persist has to come from somewhere else on the way out.
//
// This paragraph has been wrong TWICE, in two different ways, which is why it now
// carries its own re-measure command. Version 1 said NO style commit reached a
// persist; mutant Q6 refuted that. Version 2 got the count right and named the
// WRONG PAIR (it said the stroke composite editor and box-shadow). Re-measured
// against `grep -n "commitStyleEdit(" browser/raven-grab.js`: six of the eight
// call sites reach a persist — applyStyleVersionRestore (5305) schedules its own,
// and overflow (7472), size (7622), the generic editor (8456), the pointer scrub
// (8564) and border-radius (8658) all end at syncSendButtonDisabled(), which
// schedules one. EXACTLY TWO reach none: beginTextDecorationEdit (7127) and
// beginBoxShadowEdit (7350). beginStrokeEdit is on the list in NEITHER direction —
// it is not a commitStyleEdit call site at all, and it does reach
// syncSendButtonDisabled (6913/6923/6948), so version 2 had it wrong in both
// halves. There is no ninth call site. On those two paths, changing a style left NO
// snapshot and advancing the slide dropped the draft silently; that is what the fix
// in syncActiveStyleDraftKey() closes. Tests 2 and 3 are driven through the Effects
// row for that reason, and test 3 has no button in it.
//
// Every line number above is a claim that decays on the next edit to the overlay —
// they moved by +6 between the measurement and the write-up once already. Re-run
// the grep before quoting one.
//
// THE BUTTON. The sweep only ever walks STASHED drafts, so the live singleton is
// not carried at the moment its element detaches — and widening the sweep to the
// active draft is not the fix, because it would clear the panel out from under
// someone still typing. An explicit bank is. Its persist is SYNCHRONOUS on
// purpose: every ordinary edit reaches the memo through a 250ms debounce, and a
// slide advance beats a debounce. Test 4 is the only one that can see that, and
// it queues and detaches inside ONE task so no timer can have fired.
//
// Needs a real browser and a LOCAL session (a third-party proxied session is
// capture-only): real selection through raw mouse events, the real shadow-DOM
// panel, real commitStyleEdit, real detachment, real sessionStorage.
//
// SOL ROUND 3 — verdict DOES NOT SURVIVE, 1 × P1 + 1 × P2, both confirmed by
// reading the code and both fixed. That round's browser gate was environment-
// blocked (0 pass / 8 skipped), so it was a code-reading pass and found two real
// defects anyway; an environment-blocked adverse run is never a clean bill.
//
// P1 — CROSS-PAGE KEY COLLISION, and it is the reported bug arriving by a second
// route. styleDraftClientSequence is a module var that RESETS TO 0 on every page
// load, so the first live draft on any fresh page is always `style-draft-1` and its
// persisted entry key is always `live:style-draft-1`. readCarriedPending() restored
// stored keys VERBATIM, so a grab banked on the previous slide-deck page came back
// under exactly the key this page's first grab would mint — and then
// carryDetachedDraft() saw `already === true`, declined to push, and returned
// false, while sweepStaleStyleDrafts() calls dropStyleDraft() REGARDLESS of that
// return value. The new grab was silently gone and the surviving row wore the
// previous page's element. Two more consequences of one key: persistPendingNow()
// concats two entries under it, and one Remove click deletes both rows through
// removeChange()'s key filter. Hydrate now RENUMBERS every restored entry to
// `stored:N` — index-based, so it is stateless and cannot itself collide — on the
// named-style-versions precedent that an id is a within-session identity and
// validation cannot survive garbage. T9 is the test; Q17 is the mutant.
// The rejected alternative was worse: gating the sweep's drop on the carry's return
// value trades a silent loss for a permanent zombie row, because a legitimately
// already-carried draft must still drop.
//
// P2 — THE PRESSED CONTROL CONTRADICTED ITSELF THE INSTANT IT WORKED.
// queueActiveDraft() calls renderPanel() BEFORE the handler reports anything, so
// the note beside the button re-rendered from queueDraftBlocker() — correctly true
// again, the draft having just been banked and EMPTIED — and read "Change a style
// or write an instruction first" on success. The only confirmation went to
// setGlobalActionStatus(), whose candidate order used to accept a status line inside
// a collapsed panel, away from the control pressed.
// queueNoteText() is now the SINGLE rule both doors consume (the renderPanel markup
// path and syncQueueButton's in-place sync) — one rule, two doors, which is this
// repo's recurring drift class. The notice masks QUEUE_NEEDS_WORK and nothing else,
// compared through a shared constant so a reworded refusal cannot silently become
// maskable. T10 is the test; Q18 and Q19 are the two mutants.
// Candidate order remains shared, but statusNodeIsReachable() now skips hidden or
// inert candidates. T14 and Q26 measure that routing.
//
// MEASURED mutant matrix — .claude/queue-draft-2026-08-10/queue-mutants.mjs, v12:
// 28 mutants, 28 killed, 0 survived, 0 killed the wrong test, 0 hit the wrong
// assertion; 1 CONTROL, 0 false-failed, EXIT=0, against a declared 14 tests /
// 14p / 0f / 0s baseline. Re-run WHOLE, never extended.
// There is no expected-survivor category any more — see Q7.
//   Q1  in-place button sync on a style commit ........ radius 1 (T2)
//   Q2  in-place button sync on instruction typing .... radius 8 (T1 T4 T5 T7 T10 T11 T13 T14)
//   Q3  the blocker never refuses ..................... radius 6 (T1 T2 T5 T10 T11 T12)
//   Q4  the instruction box is left full after banking . radius 5 (T1 T4 T10 T11 T12)
//   Q5  the bank schedules instead of persisting ...... radius 2 (T4 T8)
//   Q6  no persist on the Effects commit path ......... radius 1 (T3)
//   Q7  the draft key ignores the instruction box ..... radius 1 (T6)
//   Q8  the click never reaches queueActiveDraft ...... radius 10 (T1 T4 T5 T7 T8 T10 T11 T12 T13 T14)
//   Q9  the detach clause is gone (the P1 returns) .... radius 1 (T5)
//   Q10 the refusal is BLANKET, memo clause dropped ... radius 2 (T7 T8)
//   Q11 the refusal states no reason .................. radius 1 (T5)
//   Q12 the title is never updated IN PLACE ........... radius 4 (T5 T10 T11 T12)
//   Q14 the title is absent from the RENDERED markup .. radius 3 (T2 T11 T12)
//   Q13 the refusal does not sync the button first .... radius 1 (T5)
//   Q15 the carry promotes the memo VERBATIM .......... radius 1 (T8)
//   Q16 the carry keeps only the FRESH edits .......... radius 1 (T8)
//   Q17 hydrate restores the stored key VERBATIM ...... radius 1 (T9)
//   Q18 the click handler never sets the notice ....... radius 3 (T10 T11 T12)
//   Q19 the in-place sync bypasses queueNoteText() .... radius 3 (T10 T11 T12)
//   Q20 the notice NEVER EXPIRES ...................... radius 1 (T11)
//   Q21 the predicate NEVER ADMITS the notice ......... radius 3 (T10 T11 T12)
//   Q22 hydrate renumbers into the LIVE namespace ..... radius 1 (T9)
//   Q23 the notice is expired from removeChange() ..... radius 1 (T12)
//   Q24 the visible confirmation is changed to sr-only  radius 1 (T13)
//   Q25 the visible status paints transparent text ..... radius 1 (T13)
//   Q26 the resolver accepts a hidden/inert status ..... radius 1 (T14)
//   Q27 the resolver ignores aria-hidden alone ......... radius 1 (T14)
//   Q28 the resolver ignores inert alone ............... radius 1 (T14)
//   C1  CONTROL, local rename in queueActiveDraft ..... green
// (Q14 prints before Q13 — the table keeps the harness's own order, so a
// matrix output needs no reordering.)
//
// The later layout direction removed the local note and made the shared status the
// one visible confirmation. T13 therefore measures PAINTED PIXELS, not geometry:
// Q24 restores the obsolete sr-only treatment and Q25 keeps the box while painting
// transparent text; both turn only T13 red. T14 collapses Assets before banking and
// proves the resolver skips status nodes under aria-hidden or inert ancestors; Q26
// disables that skip and turns only T14 red. The product routing helper was already
// present, so v12 adds guards, not a second implementation.
//
// SEVEN radii moved in v9, one round earlier — Q2 5→6, Q3 4→6, Q4 3→5, Q8 6→8,
// Q14 1→3, Q18 1→3, Q19 1→3 — and all seven moved for one reason: that round added
// T11 and T12 and added no guard to any of them. Six picked up BOTH new tests; Q2
// picked up T11 only, because T12 never types an instruction. Nothing shrank.
// Before that, FIVE moved from the v5 table — Q2 4→5, Q3 3→4, Q4 2→3, Q8 5→6,
// Q12 1→2 — when T9 and T10 arrived, and T9 moved nothing because it never presses
// the button. Q14's line was unchanged in the v7 table and was NOT unchanged in the
// harness: its find-string still named `queueBlockerAtRender`, which the P2 fix
// renamed to `queueNoteAtRender`, so it was a DEAD anchor that would have aborted
// the run. A find-string mutant dies the moment its target line is edited; that is
// why the matrix is re-run whole after every fix round rather than carried forward,
// and v10 re-ran whole for the same reason (Q21 re-declared, Q23 new).
//
// (e) Q18, Q19 and Q21 have BYTE-IDENTICAL red sets, and that identity is what
// turns "one mechanism, not three guards" from a reading of the code into a
// MEASUREMENT. Every test that reads the queue confirmation runs through the
// post-bank QUEUE_NEEDS_WORK state, so a predicate that never admits the notice
// (Q21), a handler that never sets it (Q18) and a second door that never consults
// the shared rule (Q19) all redden T10, T11 and T12 for the same reason. Compare
// Q20 (T11 alone) and Q23 (T12 alone): those two are what separate the two ENDS of
// the expiry rule from that shared mechanism and from each other.
//
// (f) Q21 came back WRONG ASSERTION in v9 and that is the harness earning its keep.
// It was declared against T12's post-removal message and reddened T12's
// PRECONDITION instead: under an always-false predicate the notice is blanked in
// the post-bank state, so the confirmation never survives long enough to be lost
// and `and the confirmation is there to be lost` aborts before the removal ever
// runs. A MUTANT DECLARED AGAINST A TEST CAN BE GRADED BY A DIFFERENT ASSERTION
// INSIDE THAT SAME TEST, and only the declared-message check makes that visible —
// a kill is not enough. Q21 is re-declared against T10, where its harm lands.
//
// (g) The sharper half of that finding: until Q23 existed, T12's closing
// assertions were guarded by NOTHING. T12 was written to make the predicate's
// narrowness measured, and the only mutant pointed at it aborted on a precondition.
// A TEST WHOSE OWN ASSERTION NO MUTANT REACHES IS A COMMENT. Q23 is the plausible
// WRONG FIX and it is the wrong SHAPE rather than the wrong predicate — expiring
// the notice from removeChange() on ANY removal, the right rule in the wrong place,
// this repo's one-rule-two-doors drift in a third form after preview-vs-action and
// listing-vs-lookup. Measured at radius 1 with T10 and T11 GREEN, and T11 staying
// green is the load-bearing half: it is the test that WANTS the notice gone, so a
// mutant reddening both would not separate the wrong-place fix from the
// wrong-predicate one.
//
// (h) SCOPE LIMIT of the expiry rule, deliberate and pinned by T12 rather than left
// to read as full coverage: the notice expires when the queue is EMPTY. Bank a row,
// remove it while OTHER rows remain, and the confirmation still rides — it is still
// TRUE beside a row that is still queued. Tracking per-row identity would be a
// heavier mechanism than the reproduced defect warrants.
//
// TWO mutants were designed and then REJECTED on measurement grounds rather than
// added as survivors, both written up beside the mutant list in the harness.
// (i) "the render bypasses queueNoteText()" would SURVIVE, because
// queueActiveDraft() calls renderPanel() BEFORE the handler sets the notice and
// T10 triggers no later render — the render door never displays the confirmation at
// all, so a mutant there records a survivor with no test behind it.
// (ii) "widen the mask" (`blocker === QUEUE_NEEDS_WORK` → `blocker`) has NO
// REACHABLE TRIGGER: emptiness is checked first so an empty draft always yields
// QUEUE_NEEDS_WORK, any new work spends the notice through the next sync, and
// resetSelectionLocalContext() clears it on deselection. On the isIpLiteral
// precedent, a clause with no reachable trigger must SAY so rather than have a
// mutant pretend to kill it.
//
// Six things about that table are worth more than the numbers in it.
//
// (a) A radius here is a fact about a MECHANISM and never evidence of N
// independent guards. Q2 and Q8 sit high because they break the entry point every
// other assertion runs through, and Q9/Q11/Q12/Q13 all sit at radius 1 on the
// SAME test — they are four separate mechanisms separated by which assertion
// inside T5 fails, so read the failure message, not the radius.
//
// (a2) v5 made that reading MACHINE-CHECKED, because Q15 and Q16 are two
// mechanisms that redden the same single test and a name-matching grader cannot
// tell them apart — both would have read `killed (radius 1)` on T8 whichever one
// actually broke. Each mutant now declares the assertion MESSAGE it must fire on
// as well as the test, and a declared message absent from the output is a WRONG
// ASSERTION rather than a kill. `assert` aborts at the first failure, which is
// what makes it discriminate: under Q15 the styleEdits assertion goes first,
// under Q16 that one passes and the frozen-half assertion goes. Proven in BOTH
// directions rather than only the passing one — declaring the two messages
// SWAPPED reports WRONG ASSERTION on both and exits 1
// (.claude/queue-draft-2026-08-10/measurements/v5-message-check-falsification.log);
// a check that only ever passes is the dangerous direction. Q9/Q11/Q12/Q13 do NOT
// yet carry message expectations, so their attribution still rests on reading the
// output by hand — stated, not closed.
//
// (b) Q7 was declared an EXPECTED SURVIVOR for a round, on my own claim that its
// harm needed a race. Reading serializeLivePending() refuted that: it returns
// early on any draft whose target is already detached, so once the node goes
// nothing can re-memoize under the rotated key and the loss is permanent, not
// racy. Test 6 stages it deterministically and Q7 is an ordinary radius-1 kill.
// A claim that something cannot be tested is itself a claim, and it is
// falsifiable by writing the test.
//
// (c) Q12 and Q14 are the two ends of one a11y fix and are SEPARATE mechanisms,
// which only the harness's expected-red-TEST enforcement established. Q12 was
// first declared against T2 on the assumption that the idle title comes from
// syncQueueButton(); it does not — instructionsMarkup renders `title` inline, so
// T2's idle read is satisfied by the RENDER (Q14's territory) and Q12 is visible
// only where the title has to be updated in place after the element detaches. A
// harness grading on `fail > 0` would have filed that as a clean kill and the
// mis-declaration would never have surfaced.
//
// (d) Q15/Q16 are the two ENDS of the fix test 8 exists for, and they are why the
// carry is an OVERLAY rather than either half alone. The bank persists
// synchronously, so `lastConnectedPending` is fresh at the moment of the click —
// but an edit committed AFTER that, inside the 250ms debounce, only ever reaches
// the memo when the debounce fires, and a slide advance beats a debounce. Q15
// restores that exact P1: promote the memo verbatim and the newer edit is dropped
// under a status line reading "Added to queue", which is the silent loss the whole
// feature exists to stop. Q16 is the opposite trade and the reason a rebuild is
// not the answer: keep only the fresh edits and the entry loses the selector,
// markup and computed styles, which a DETACHED node cannot regenerate at all
// (payloadForSend throws ravenSelectionGone there). The frozen DOM half and the
// live edit half each supply what the other cannot, so freshenedCarryEntry lays
// the second over the first.
//
// Both of test 8's assertions passed on their FIRST run and that was worth nothing
// until Q15 and Q16 proved them red — the same lesson the v1 paragraph below
// records, arriving again in the round that was written knowing it.
//
// v1 of this matrix had Q1, Q5 and Q6 all SURVIVING — the tests passed on their
// first run and were encoding rather than detecting. Every one of the three was a
// fixture defect, not a missing guard: Q1/Q6 because font-size is committed
// through a path that ALSO calls syncSendButtonDisabled(), and Q5 because a
// focused instruction field is rescued by the focusout hook. Both are written up
// at their fixtures below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

process.env.RAVEN_NO_USAGE_LOG = '1';

let chromium = null;
let playwrightError = null;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  playwrightError = err;
}

// Full probe, matching test/grab-overlay-detached-draft.test.mjs: bind a
// loopback socket, write and remove a temp dir, launch chromium, and have the
// browser actually REACH the socket. A narrower probe passes in a sandbox that
// permits binding and launching but denies the connection, and the real test's
// environment failure then gets reported as a product defect. Deliberately does
// NOT probe startGrabSession or dist/grab-bridge.js — those are product code,
// and probing them would turn a real bridge defect into a skip.
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
    const probeDir = await mkdtemp(path.join(tmpdir(), 'raven-queue-probe-'));
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

// Lazy, inside the tests: at module scope an unbuilt dist/ would take the whole
// file down as a crash rather than a skip.
let bridge = null;

// Two "slides", one visible at a time, in the horizontal gap between the docked
// panels. Advancing REMOVES the outgoing slide's node — a deck using display:none
// leaves the node connected, the sweep never fires, and nothing is ever at risk.
const VIEWPORT = { width: 1280, height: 700 };
const FIXTURE_BODY = `<style>
  body { margin: 0; font: 16px system-ui; }
  .slide { position: absolute; left: 440px; top: 120px; width: 400px; }
  /* box-shadow is here because it is ONE OF THE TWO style controls whose commit
     path reaches no persist of its own (the other is text-decoration) — see
     editBoxShadow below. A row only renders for a property with a non-default
     value. */
  .headline { padding: 28px; background: #eef; text-align: center; font-size: 24px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }
</style>
<div id="slide1" class="slide"><div id="a" class="headline">Slide one headline</div></div>
<div id="slide2" class="slide" hidden><div id="b" class="headline">Slide two headline</div></div>`;

// The second parameter exists for test 9 alone, and the eight call sites above stay
// one-argument. A carried row can only be staged from sessionStorage written BEFORE
// the overlay's IIFE runs — readCarriedPending() is called once at load — and the
// `page` object does not exist until newPage(), so the seam has to sit between
// newPage() and goto() and nowhere else. beforeLoad receives the SESSION too,
// because readCarriedPending's own filter drops any entry without an `endpoint` and
// only the session knows the bridge port.
async function withLocalOverlay(fn, options) {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-queue-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>deck host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT });
    if (options && options.beforeLoad) await options.beforeLoad(page, session);
    await page.goto('http://127.0.0.1:' + fixture.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot),
      null,
      { timeout: 15000 }
    );
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => fixture.close(resolve));
  }
}

function shadowEval(page, fn, arg) {
  return page.evaluate(({ body, value }) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    // eslint-disable-next-line no-new-func
    return new Function('root', 'arg', `return (${body})(root, arg);`)(root, value);
  }, { body: fn.toString(), value: arg });
}

// The overlay host covers the viewport, so page.click() fails actionability;
// raw mouse events are what a designer's pointer actually produces.
async function selectElement(page, selector) {
  const at = await page.evaluate((sel) => {
    const rect = document.querySelector(sel).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]')?.shadowRoot;
    return Boolean(root && root.querySelector('[data-style-property]'));
  }, null, { timeout: 5000 });
}

// Open the style editor by clicking the VALUE cell, then commit with a real
// Enter. Setting styleEdits by hand would skip commitStyleEdit, and
// commitStyleEdit is exactly the path that was missing a persist.
async function editStyle(page, property, value) {
  const point = await shadowEval(page, (root, arg) => {
    const cell = root.querySelector(`li[data-style-property="${arg.property}"]:not([data-style-state]) code[data-style-value]`);
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { property });
  assert.ok(point, `no style row rendered for ${property}`);

  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((arg) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const row = root.querySelector(`li[data-style-property="${arg.property}"]:not([data-style-state])`);
    return Boolean(row && row.querySelector('.raven-grab-style-editor input'));
  }, { property }, { timeout: 5000 });

  await shadowEval(page, (root, arg) => {
    const input = root.querySelector(`li[data-style-property="${arg.property}"]:not([data-style-state]) .raven-grab-style-editor input`);
    input.focus();
    input.value = arg.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { property, value });
  await page.keyboard.press('Enter');
}

// WHY THE EFFECTS ROW AND NOT font-size. Re-measured across all eight
// commitStyleEdit call sites (see the header for the command and for the two
// earlier versions of this paragraph that were wrong): six of them already reach
// a persist — overflow (7472), size (7622), the generic editor (8456), the
// pointer scrub (8564) and border-radius (8658) all end at
// syncSendButtonDisabled(), which schedules one, and applyStyleVersionRestore
// (5305) schedules its own. Exactly TWO reach no persist at all:
// beginTextDecorationEdit (7127) and beginBoxShadowEdit (7350), both of which end
// at `var ok = commitStyleEdit(...); ... replaceStyleInput(...)` and nothing else.
// beginStrokeEdit is neither — it is not a commitStyleEdit call site and it does
// reach syncSendButtonDisabled (6913/6923/6948).
// So a font-size fixture cannot see either the in-place button sync or the
// persist added inside syncActiveStyleDraftKey() — syncSendButtonDisabled()
// covers for both, and mutants Q1 and Q6 SURVIVED a font-size version of tests
// 2 and 3. The Effects row is where those two mechanisms are load-bearing.
//
// Driven by its PRESET buttons rather than its five numeric fields: a preset
// click is `applyPreset -> preview -> commit(next)` in one handler, and its
// mousedown preventDefault keeps focus on the editor so no blur-commit races it.
async function editBoxShadow(page, presetId) {
  const cellPoint = await shadowEval(page, (root) => {
    const cell = root.querySelector('li[data-style-property="box-shadow"]:not([data-style-state]) code[data-style-value]');
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  assert.ok(cellPoint, 'the Effects box-shadow row is rendered');
  await page.mouse.click(cellPoint.x, cellPoint.y);

  const presetPoint = await page.waitForFunction((id) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const editor = root.querySelector('.raven-grab-style-editor[data-control="box-shadow"]');
    const button = editor && editor.querySelector(`[data-shadow-preset="${id}"]`);
    if (!button) return null;
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, presetId, { timeout: 5000 }).then((handle) => handle.jsonValue());

  await page.mouse.click(presetPoint.x, presetPoint.y);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    return !root.querySelector('.raven-grab-style-editor[data-control="box-shadow"]');
  }, null, { timeout: 5000 });
}

async function clickQueueButton(page) {
  const point = await shadowEval(page, (root) => {
    const button = root.querySelector('[data-queue-draft]');
    if (!button) throw new Error('the Add to queue button is not rendered');
    if (button.getAttribute('aria-disabled') === 'true') return null;
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  assert.ok(point, 'the Add to queue button is enabled and clickable');
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(60);
}

// Shared page-side helper, interpolated into both probes below rather than
// written twice. It answers ONE question: which elements state <pattern> as text
// a human can actually read?
//
// Two filters, and each is load-bearing. INNERMOST — textContent aggregates
// descendants, so a match on <p> also matches every ancestor up to the panel,
// and an unfiltered scan would report one sentence as a dozen surfaces. PAINTED
// — `hidden`, `display: none` and the sr-only clip all collapse the box, and the
// question this suite asks after 2026-08-10 is not "is the string in the DOM" but
// "is it on screen" (the note it replaced was in the DOM and legible and that was
// the defect). `> 1` rather than `> 0` because a visually-hidden node still has a
// 1px box.
const VISIBLE_PROSE_FN = `
  const visibleProse = (re) => Array.from(root.querySelectorAll('*'))
    .filter((n) => re.test(n.textContent || ''))
    .filter((n) => !Array.from(n.children).some((c) => re.test(c.textContent || '')))
    .map((n) => {
      const r = n.getBoundingClientRect();
      return { cls: n.className || n.tagName, text: (n.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter((e) => e.w > 1 && e.h > 1);
`;

// Every reason queueDraftBlocker() can return — all four, not just the one Andrew
// named. Before 2026-08-10 each of these rendered as visible prose beside the
// button; the ask removed the element they rendered into, so the property this
// suite now holds is that NONE of them is painted anywhere in the panel.
const BLOCKER_PROSE_RE = "/write an instruction|Select an element first|gone from the page/";

const readState = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  const button = root.querySelector('[data-queue-draft]');
  const field = root.querySelector('[data-instruction]');
  ${VISIBLE_PROSE_FN}
  return {
    carriedRows: root.querySelectorAll('[data-remove-change^="carried:"]').length,
    draftRows: root.querySelectorAll('[data-remove-change^="draft-"]').length,
    stored: window.sessionStorage.getItem('raven-grab-pending-v1') || '',
    buttonPresent: Boolean(button),
    // aria-disabled, not .disabled — see syncQueueButton(). A natively-disabled
    // button is out of the tab order, so the reason never reaches a screen reader.
    buttonDisabled: button ? button.getAttribute('aria-disabled') === 'true' : null,
    buttonTitle: button ? button.getAttribute('title') : null,
    // The <p class="raven-grab-queue-note"> Andrew had removed. Counted rather
    // than read: an element that comes back is a red test instead of a silent
    // regression, and there is nothing else in this suite that would notice.
    queueNoteCount: root.querySelectorAll('.raven-grab-queue-note').length,
    visibleBlockerProse: visibleProse(${BLOCKER_PROSE_RE}),
    // Every status line in the panel, joined: setGlobalActionStatus picks the first
    // of four candidates and which one it lands on is not this suite's business.
    statusText: Array.from(root.querySelectorAll('.raven-grab-status')).map((n) => n.textContent).join(' | '),
    instructionValue: field ? field.value : null
  };
})()`;

test('Add to queue banks the live draft and empties the instruction box', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      if (!field) throw new Error('the Instructions field is not rendered');
      field.focus();
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Tighten this headline');

    await clickQueueButton(page);

    const after = await page.evaluate(readState);
    assert.equal(after.draftRows, 1, 'the banked draft renders as a pending row');
    // Not cosmetic: stashActiveStyleDraft copies instructionDraft onto the draft
    // but does not empty the shared box, so leaving it renders the same
    // instruction twice — once from the queued row, once from the rebuilt active
    // draft.
    assert.equal(after.instructionValue, '', 'the instruction box is emptied, so the same words are not queued twice');
    assert.ok(after.stored.includes('Tighten this headline'), 'and the typed words are persisted, not only rendered');
    assert.equal(after.buttonDisabled, true, 'with nothing left to bank the button refuses again');
  });
});

test('Add to queue states its reason and enables the moment a style is committed', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');

    const idle = await page.evaluate(readState);
    assert.equal(idle.buttonPresent, true, 'the button is in the DOM from the first render');
    assert.equal(idle.buttonDisabled, true, 'with no work it refuses');
    // Andrew asked for the visible "Change a style or write an instruction first"
    // prose to go — twice. The first pass (2026-08-10, earlier) only MASKED it,
    // leaving the <p> in the layout rendering ''; he then sent a screenshot of the
    // panel with the ADDED-to-queue sentence wrapped to four lines left of the
    // waveform and asked for the element itself. So this is no longer a pair of
    // assertions about that element's state — the element is gone, and these two
    // assertions are what keep it gone.
    //
    // Written as a COUNT plus a SCAN rather than as `note === null`, because those
    // are two different regressions. The count catches the element coming back by
    // its own class; the scan catches the same sentence arriving in any other
    // painted element, which is what a well-meaning "put the reason back where the
    // user can see it" edit would actually do. Neither subsumes the other.
    assert.equal(idle.queueNoteCount, 0, 'the removed queue-note element stays removed');
    assert.deepEqual(
      idle.visibleBlockerProse,
      [],
      `no blocked reason is painted anywhere in the panel (found ${JSON.stringify(idle.visibleBlockerProse)})`
    );
    // The reason has to be attached to the CONTROL, not only printed beside it: a
    // natively-disabled button is not keyboard-focusable, so a sighted user reads the
    // note and a screen-reader user in focus mode reaches neither. aria-disabled keeps
    // it focusable and `title` is its accessible description. Since the ask, `title`
    // is the ONLY place the reason survives, which makes this the load-bearing
    // assertion of the pair rather than the corroborating one it used to be.
    //
    // It is deliberately NOT written `buttonTitle === noteText` as it was before the
    // ask: there is no note to compare against, and comparing against '' would pass
    // on a button carrying no reason at all — an assertion that cannot fail. It
    // matches the REASON instead, which is what the test's own name ("states its
    // reason") actually claims.
    assert.match(idle.buttonTitle, /style or write an instruction/, 'and the button itself carries the reason, since nothing else does now');

    // A style commit deliberately does NOT renderPanel(), so the only thing that
    // can enable the button here is the in-place sync inside
    // syncActiveStyleDraftKey(). This is the shipped-once defect the Versions
    // section already documents: markup built only by renderPanel() can never
    // appear when the user's first edit lands. The Effects row is the fixture
    // that can SEE that — every other editor also calls syncSendButtonDisabled(),
    // which syncs the button a second time and covers for a missing first.
    await editBoxShadow(page, 'medium');

    const armed = await page.evaluate(readState);
    assert.equal(armed.buttonDisabled, false, 'a committed style edit enables the button in place, with no re-render');
    // The reason is REMOVED from the control, not merely made stale. Without this the
    // armed half of the test rests entirely on aria-disabled, and a button that is
    // clickable while still advertising "change a style first" is the
    // output-disagrees-with-state shape this file documents elsewhere. It is the only
    // assertion here that can see the `removeAttribute("title")` branch of
    // syncQueueButton(), and since the ask it is the only assertion anywhere that can
    // see either branch — the title is now the sole surface the reason reaches.
    assert.equal(armed.buttonTitle, null, 'and the button stops advertising a reason that no longer applies');
  });
});

test('a style-only draft survives its slide being removed', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    // The Effects row again, for the other half of the reason: its commit reaches
    // no persist of its own, so this draft is memoized only by the
    // schedulePersistPending() added inside syncActiveStyleDraftKey().
    await editBoxShadow(page, 'medium');
    // Past the 250ms persist debounce: the point is that an ORDINARY style edit
    // now reaches the rescue memo by itself, with no button pressed.
    await page.waitForTimeout(400);

    const before = await page.evaluate(readState);
    assert.ok(
      before.stored.includes('box-shadow'),
      'the style edit is snapshotted while its element is still connected'
    );

    await page.evaluate(() => {
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
    });
    await selectElement(page, '#b');

    const after = await page.evaluate(readState);
    assert.equal(after.carriedRows, 1, 'the orphaned style edit is kept as a Carried row, not swept');
    assert.ok(after.stored.includes('0 4px 16px'), 'and the changed value itself survives in the persisted payload');
  });
});

test('Add to queue banks synchronously, before any debounce could have run', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');

    // Typing, queueing and the slide advance all in ONE task, so no 250ms timer
    // can possibly have fired in between. That is the whole claim: a slide
    // advance beats a debounce, which is why the button persists synchronously
    // rather than scheduling. The click is dispatched rather than mouse-driven
    // for the same reason — a real pointer needs round-trips, and a round-trip is
    // exactly the window this test exists to close. Test 1 covers the real
    // pointer path.
    //
    // The field is deliberately NOT focused, and that one line decides whether
    // this test measures anything. MEASURED in Chromium: removing the focused
    // textarea fires blur AND focusout, and the focusout still reaches a
    // DELEGATED listener on the container it was removed from. So a focused field
    // means queueActiveDraft()'s own renderPanel() destroys it, the overlay's
    // onPanels("focusout") hook fires persistPendingNow() synchronously while the
    // element is still connected, and the memo exists whether the button
    // persisted or merely scheduled — mutant Q5 SURVIVED the focused version of
    // this test. The input handler reads event.target.value, so focus buys
    // nothing here anyway.
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      const button = root.querySelector('[data-queue-draft]');
      // aria-disabled, NOT button.disabled. The button never carries the native
      // attribute (see syncQueueButton() for why), so `button.disabled` is
      // permanently false and this guard could not fire — a check whose failure mode
      // is indistinguishable from its success mode is not a check.
      if (button.getAttribute('aria-disabled') === 'true') throw new Error('the button was still disabled after typing — syncQueueButton did not run');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
      return true;
    }, 'Bank me before the timer');

    await selectElement(page, '#b');

    const after = await page.evaluate(readState);
    assert.equal(after.carriedRows, 1, 'the banked draft is carried across the detachment');
    assert.ok(after.stored.includes('Bank me before the timer'), 'and its words survive, which a debounced persist could not have written');
  });
});

// Sol round-1 P1. The button's own persist is what destroys the draft here, and the
// first version reported success over it. Chain, every link read: the blocker checked
// only that selectedElement was TRUTHY, so a detached node passed; stashActiveStyleDraft
// put the draft into styleDrafts with a detached target; persistPendingNow ->
// serializeLivePending -> allStyleDrafts -> sweepStaleStyleDrafts saw
// isConnected === false, found no memo to carry (an instruction-only draft has no
// needsRecheck, so draftAwaitingReconnect is false too) and DROPPED it — after which
// queueActiveDraft still returned true and the status line still said "Added to queue".
// A false all-clear that destroys the work, in exactly the flow Andrew is in when he
// notices a grab went missing after the slide moved.
//
// The fixture must stay inside ONE task for the same reason test 4 does, but for the
// opposite half: past the 250ms debounce the memo EXISTS, the sweep's carry works, and
// the bank is genuinely real — so a test that waited would be measuring the case the
// defect never covered. Typing, the slide advance and the click are one synchronous
// block, so no timer can have run.
test('Add to queue refuses a draft whose element has already gone, instead of reporting success over it', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');

    const armedBeforeDetach = await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      // Read the precondition BEFORE the detachment: without it a refusal is
      // indistinguishable from a button that never armed at all, and the test would
      // pass against a blocker that refuses everything.
      const armed = root.querySelector('[data-queue-draft]').getAttribute('aria-disabled') !== 'true';
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
      root.querySelector('[data-queue-draft]').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      return armed;
    }, 'Reword this slide');
    assert.equal(armedBeforeDetach, true, 'the button was enabled while the element was still there');

    const after = await page.evaluate(readState);
    assert.doesNotMatch(after.statusText, /Added to queue/, 'the refusal is not dressed up as a successful bank');
    assert.match(after.statusText, /gone from the page/, 'and it says what actually happened');
    // The sharpest discriminator: this is the WORK. Under the defect the click
    // stashed it, the sweep dropped it and queueActiveDraft cleared the shared box,
    // so the words existed nowhere afterwards.
    assert.equal(after.instructionValue, 'Reword this slide', 'the typed words are still in the box, not consumed by a bank that dropped them');
    assert.equal(after.buttonDisabled, true, 'and the stale-enabled button the user pressed is disabled by the refusal');
    assert.match(after.buttonTitle, /gone from the page/, 'with the reason on the control itself');
  });
});

// Sol round-1 P3, and the reason this test exists rather than a corrected comment:
// the claim it refutes was MINE — "the Q7 harm requires a race, so no deterministic
// test can stage it" — and this repo has already recorded once (the round-6/7 typeof
// gate) that a claim something cannot be tested is itself a claim, falsifiable by
// writing the test. It was false, and serializeLivePending() line 11100 is why: it
// skips any draft whose target is detached, so once the node is gone NO later persist
// can ever write a memo under the rotated key. There is no window to lose; the loss is
// permanent from the moment of the revert.
//
// The rotation is reached by ordinary use. commitStyleEdit() itself calls
// clearStyleEdit() when the committed value equals the original, so retyping the old
// value IS the revert — there is no other user route to clearing one style edit, and it
// ends at syncActiveStyleDraftKey(), which under Q7 nulls the key because the four
// style collections are empty while the instruction box is not. The next
// activeStyleDraft() then mints a fresh key, and carryDetachedDraft() looks the memo up
// under that one.
//
// Revert and detach are one synchronous block: the revert arms a 250ms persist, and if
// that fires while the element is still connected it re-memoizes under the NEW key and
// nothing is lost. That is a deterministic ordering, not a race — the same one-task
// technique as test 4.
test('reverting the last style edit does not orphan the instruction that is still in the draft', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Keep this instruction');
    await editStyle(page, 'font-size', '32px');
    // Past the debounce on purpose: the memo MUST exist under the original key, or
    // this measures a draft that was never rescuable and the revert is irrelevant.
    await page.waitForTimeout(400);

    const memoized = await page.evaluate(readState);
    assert.ok(memoized.stored.includes('Keep this instruction'), 'the draft is snapshotted while its element is connected');

    // Open the editor with real clicks, then revert and detach in ONE task. The Enter
    // is dispatched rather than pressed for exactly that reason — page.keyboard.press
    // is another round-trip, and a round-trip is a task boundary the 250ms timer could
    // fire in.
    const cell = await shadowEval(page, (root) => {
      const node = root.querySelector('li[data-style-property="font-size"]:not([data-style-state]) code[data-style-value]');
      node.scrollIntoView({ block: 'center' });
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(cell.x, cell.y);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('li[data-style-property="font-size"]:not([data-style-state]) .raven-grab-style-editor input'));
    }, null, { timeout: 5000 });

    await shadowEval(page, (root) => {
      const input = root.querySelector('li[data-style-property="font-size"]:not([data-style-state]) .raven-grab-style-editor input');
      input.focus();
      input.value = '24px';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
      return true;
    });

    await selectElement(page, '#b');

    const after = await page.evaluate(readState);
    assert.equal(after.carriedRows, 1, 'the instruction-only remainder is carried, not dropped under a key nobody memoized');
    assert.ok(after.stored.includes('Keep this instruction'), 'and the words themselves survive the reverted style edit');
  });
});

// The OTHER direction of the P1 clause, and the only thing that makes its
// narrowness measured rather than asserted. The refusal in test 5 is conditional on
// three things, and a blanket "the element is detached, refuse" would pass test 5
// while being a red on correct code here: once a memo exists the sweep's carry
// works, so the bank is real and refusing it would tell the user their work is gone
// while it is sitting in sessionStorage. Waiting past the 250ms debounce is what
// separates the two cases, so this test waits where test 5 must not.
//
// The clause's third condition — draftAwaitingReconnect() — has NO test here and
// no mutant pretending otherwise: it needs a style edit carrying needsRecheck,
// which this fixture has no route to produce. Stated rather than covered.
test('Add to queue still banks a detached draft that was already snapshotted', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Snapshotted before the slide moved');
    await page.waitForTimeout(400);

    const memoized = await page.evaluate(readState);
    assert.ok(memoized.stored.includes('Snapshotted before the slide moved'), 'the debounce wrote the snapshot while the element was connected');

    await page.evaluate(() => {
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
    });
    await clickQueueButton(page);

    const after = await page.evaluate(readState);
    assert.match(after.statusText, /Added to queue/, 'a rescuable draft is banked, not refused');
    assert.doesNotMatch(after.statusText, /gone from the page/, 'and the refusal does not fire on a draft that can still be carried');
    assert.equal(after.carriedRows, 1, 'it lands as a Carried row');
    assert.ok(after.stored.includes('Snapshotted before the slide moved'), 'with its words intact');
  });
});

// Sol round-2 P1, MEASURED before it was believed:
// .claude/queue-draft-2026-08-10/measurements/probe-race2.log read statusText
// "Added to queue" against stored edits [] at 1491 bytes. Test 7 above proves the
// bank is real once a memo exists; this one proves it is FAITHFUL, which is a
// different claim and was false. The memo has one writer and every ordinary edit
// reaches it through a 250ms debounce, so an edit committed inside that window is
// absent from the snapshot the carry promotes — and the carry promoted it verbatim.
// A false all-clear, in the one control whose entire job is not losing grabs.
//
// The fixture needs BOTH halves of the window and they pull opposite ways, which is
// why it waits once and then must not wait again. Past the debounce so a memo
// EXISTS (or the blocker refuses and this becomes test 5); then the style commit,
// the detachment and the bank in ONE synchronous block, so the timer the commit
// arms cannot have fired. JavaScript is single-threaded, so that ordering is
// deterministic rather than hoped-for — the probe log's own 0ms measurement was a
// race that merely happened to be won, and this is not.
//
// font-size, not the Effects row, and that inversion of tests 2/3 is deliberate:
// its commit path reaches syncSendButtonDisabled() and therefore SCHEDULES a
// persist, which is exactly the mechanism under test. It is also reachable by
// dispatched events, so the whole block stays inside one task.
test('Add to queue carries the edit committed inside the persist debounce, not the stale snapshot', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Snapshot me first');
    await page.waitForTimeout(400);

    // Structural, never a substring match on the whole blob: an earlier version of
    // this probe matched /box-shadow/ and was satisfied by the property NAME sitting
    // inside the captured computed styles, so it reported REFUTED while measuring
    // nothing. Parse the store and read the styleEdits array itself.
    const readCarried = `(() => {
  const raw = window.sessionStorage.getItem('raven-grab-pending-v1') || '[]';
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) { return { parseError: String(err) }; }
  return {
    parseError: null,
    entries: (Array.isArray(parsed) ? parsed : []).map((entry) => ({
      key: entry.key,
      instruction: entry.payload && entry.payload.instruction,
      styleEdits: ((entry.payload && entry.payload.styleEdits) || []).map((intent) => intent.property + '=' + intent.newValue),
      hasSelector: Boolean(entry.payload && entry.payload.selector),
      htmlLength: entry.payload && typeof entry.payload.html === 'string' ? entry.payload.html.length : 0,
      styleKeys: entry.payload && entry.payload.styles ? Object.keys(entry.payload.styles).length : 0
    }))
  };
})()`;

    const before = await page.evaluate(readCarried);
    assert.equal(before.parseError, null, 'the snapshot parses');
    assert.equal(before.entries.length, 1, 'exactly one memoized entry to reason about');
    assert.deepEqual(before.entries[0].styleEdits, [], 'the snapshot predates the style edit — otherwise this measures the case the defect never covered');
    assert.equal(before.entries[0].instruction, 'Snapshot me first', 'and it holds the instruction');

    // Real clicks to OPEN the editor, outside the block on purpose: opening is not
    // the mechanism under test, and each round-trip is a task boundary the timer
    // could fire in.
    const cell = await shadowEval(page, (root) => {
      const node = root.querySelector('li[data-style-property="font-size"]:not([data-style-state]) code[data-style-value]');
      node.scrollIntoView({ block: 'center' });
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(cell.x, cell.y);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      return Boolean(root.querySelector('li[data-style-property="font-size"]:not([data-style-state]) .raven-grab-style-editor input'));
    }, null, { timeout: 5000 });

    const armed = await shadowEval(page, (root) => {
      const input = root.querySelector('li[data-style-property="font-size"]:not([data-style-state]) .raven-grab-style-editor input');
      input.focus();
      input.value = '44px';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
      // Precondition read INSIDE the block, before the detachment: a carried entry
      // holding the fresh edit proves nothing if the commit never landed, and the
      // test would pass on a fixture that edited nothing at all.
      const committed = document.querySelector('#a').style.fontSize;
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
      const button = root.querySelector('[data-queue-draft]');
      if (button.getAttribute('aria-disabled') === 'true') throw new Error('the button refused a draft that HAS a memo — that is test 5s case, not this one');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      return committed;
    });
    assert.equal(armed, '44px', 'the style edit really committed to the element before it was detached');

    const status = await page.evaluate(readState);
    assert.match(status.statusText, /Added to queue/, 'the bank reports success');
    // Read carried-ness off the RENDERED row, not off the stored key: carriedPending
    // holds the memo entry verbatim, so its stored key stays "live:<clientKey>" and
    // only renderPanel() prefixes "carried:". A filter on the stored key matches
    // nothing and would fail this test on correct code.
    assert.equal(status.carriedRows, 1, 'the draft was carried rather than dropped');

    const after = await page.evaluate(readCarried);
    assert.equal(after.parseError, null, 'the carried snapshot still parses');
    // The live memo is gone — serializeLivePending() skips a detached draft — so the
    // one remaining entry is the carried one.
    const carried = after.entries;
    assert.equal(carried.length, 1, 'and it is the only thing left in the store');
    // THE defect. Under it this array was [] while the status line said "Added to
    // queue" — Andrew told his edit was banked while it was being thrown away.
    assert.deepEqual(
      carried[0].styleEdits,
      ['font-size=44px'],
      'the edit committed inside the debounce is what got carried, not the stale snapshot'
    );
    // The other half, and the reason this is an OVERLAY rather than a rebuild:
    // payloadForSend throws ravenSelectionGone on a detached target, so the
    // DOM-derived fields can only ever come from the frozen snapshot. Discarding
    // them to take the fresh edits would trade one loss for another.
    assert.equal(carried[0].hasSelector, true, 'the frozen snapshot still supplies the selector a detached node cannot');
    assert.ok(carried[0].htmlLength > 0, 'and its captured markup');
    assert.ok(carried[0].styleKeys > 0, 'and its computed styles');
    assert.equal(carried[0].instruction, 'Snapshot me first', 'with the instruction intact across the overlay');
  });
});

// Sol round-3 P1, and the gap Sol named exactly: "the matrix never starts with a
// restored carried entry, so none of its mutants detect this". Every test above
// begins on a clean store, and the defect lives entirely in the transition from one
// page load to the next.
//
// The collision. A live draft's clientKey is "style-draft-" + a counter that RESETS
// TO 0 on every page load (browser/raven-grab.js:159), the memo entry it persists is
// keyed "live:" + that clientKey, and readCarriedPending used to restore those keys
// verbatim. So page B's first draft mints the identical key page A already banked,
// and carryDetachedDraft's de-dupe on entry.key finds the prior page's row "already"
// there, declines to push, and returns false — while sweepStaleStyleDrafts drops the
// draft regardless of that return value (correctly: a draft already carried must
// still drop). The NEWER grab vanishes and the surviving row carries the OLD page's
// element, which is the reported symptom exactly: a grab that does not make it to
// the queue.
//
// Three preconditions are asserted rather than assumed, because each one silently
// turns this into a test of nothing:
//   - the seeded entry is renumbered to "stored:1" (if it were not restored at all,
//     there is no first row to collide with);
//   - this page's live memo really is keyed "live:style-draft-1" (two code paths
//     increment that counter, and at style-draft-2 there is no collision to see);
//   - the seeded row and the live row name DIFFERENT elements, so "two rows" cannot
//     be satisfied by the same grab counted twice.
// Selecting #b is what runs the sweep — the same trigger test 6 uses — and this test
// deliberately never presses Send, because drainCarriedPending() has exactly one
// caller (dispatchPendingBatch) and a drain would empty the thing under test.
test('a carried row restored from a previous page load does not swallow this page grab', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }

  // Read the RENDERED rows and the store together. The row ids are the only place
  // the restored key is observable, and the labels are the only place "which element
  // did this row come from" is.
  const readRows = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  const raw = window.sessionStorage.getItem('raven-grab-pending-v1') || '[]';
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) { return { parseError: String(err) }; }
  return {
    parseError: null,
    rowKeys: Array.from(root.querySelectorAll('[data-remove-change^="carried:"]')).map((n) => n.getAttribute('data-remove-change').replace(/^carried:/, '')),
    rowLabels: Array.from(root.querySelectorAll('[data-remove-change^="carried:"]')).map((n) => {
      const row = n.closest('.raven-grab-change-row');
      const label = row && row.querySelector('.raven-grab-change-copy span[title]');
      return label ? label.getAttribute('title') : null;
    }),
    entries: (Array.isArray(parsed) ? parsed : []).map((entry) => ({
      key: entry.key,
      label: entry.label,
      instruction: entry.payload && entry.payload.instruction
    }))
  };
})()`;

  await withLocalOverlay(async (page) => {
    const seeded = await page.evaluate(readRows);
    assert.equal(seeded.parseError, null, 'the seeded store parses');
    // Deliberately NOT `deepEqual(rowKeys, ['stored:1'])`. That pins the renumbering
    // FORMAT as a precondition, and `assert` aborts at the first failure — so the
    // mutant that restores the stored key verbatim died here, on the mechanism,
    // and every assertion below (the harm the user actually reports) was never
    // reached by any mutant at all. Measured: matrix v6 graded it WRONG ASSERTION.
    // The precondition asserts only what the harm needs to be observable — that the
    // seed was accepted and renders as its own element — and the namespace fact is
    // asserted at the BOTTOM, after the behaviour it explains.
    assert.equal(seeded.rowKeys.length, 1, 'the previous page grab is restored');
    assert.deepEqual(seeded.rowLabels, ['#old'], 'and it renders as the element it was taken from');

    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'This pages grab');
    // Past the 250ms debounce, because the memo is what carryDetachedDraft promotes
    // and the collision is between the memo's key and the restored one.
    await page.waitForTimeout(400);

    const armed = await page.evaluate(readRows);
    const live = armed.entries.filter((entry) => entry.instruction === 'This pages grab');
    assert.equal(live.length, 1, 'this page memoized its own draft');
    assert.equal(
      live[0].key,
      'live:style-draft-1',
      'and it minted the very key the previous page banked — without this the test measures no collision'
    );

    await page.evaluate(() => {
      document.querySelector('#slide1').remove();
      document.querySelector('#slide2').removeAttribute('hidden');
    });
    await selectElement(page, '#b');

    const after = await page.evaluate(readRows);
    assert.equal(after.parseError, null, 'the store still parses after the carry');
    // THE defect. Under it this is 1 — the restored row, alone, wearing the previous
    // page's element — and the grab the user just made is gone with no error.
    assert.equal(after.rowKeys.length, 2, 'both grabs are queued: the restored one and this pages');
    assert.deepEqual(after.rowLabels.sort(), ['#a', '#old'], 'and they name the two different elements they were taken from');
    const instructions = after.entries.map((entry) => entry.instruction).sort();
    assert.deepEqual(instructions, ['Prior page grab', 'This pages grab'], 'with both payloads intact in the store');
    // The MECHANISM, asserted last, and INDEPENDENTLY FALSIFIABLE — guarded by mutant
    // Q22. This comment used to claim the opposite: that any hydrate
    // leaving a restored key in the live namespace collapses the two rows above first,
    // so no mutant could turn this line red on its own. A Sol round-4 pass called that
    // false and it WAS: mutant Q22 renumbers into the live namespace under a number this
    // page's counter never reaches, which collides with nothing, leaves all three harm
    // assertions green, and reddens exactly this line (measured, matrix v9, radius 1).
    // The claim that something cannot be tested is itself a claim — and it was refuted
    // by writing the test rather than argued about.
    assert.ok(
      !/^live:/.test(seeded.rowKeys[0]),
      'because hydrate renumbered the restored entry out of the live key namespace'
    );
  }, {
    beforeLoad: async (page, session) => {
      await page.addInitScript((entry) => {
        try {
          window.sessionStorage.setItem('raven-grab-pending-v1', JSON.stringify([entry]));
        } catch (err) { /* the initial about:blank has no usable storage — the real document runs this again */ }
      }, {
        // Verbatim the shape serializeLivePending() writes, including the key it
        // wrote on the previous page. `endpoint` is load-bearing: readCarriedPending
        // filters on it, so a seed without one is dropped and every assertion here
        // would fail for the wrong reason.
        key: 'live:style-draft-1',
        pathname: '/',
        endpoint: 'http://127.0.0.1:' + session.port + '/grab',
        label: '#old',
        payload: {
          selector: '#old',
          html: '<div id="old" class="headline">Previous slide headline</div>',
          instruction: 'Prior page grab',
          styleEdits: [],
          styles: { 'font-size': '24px' },
          rect: { x: 440, y: 120, width: 400, height: 80 }
        }
      });
    }
  });
});

// Sol round-3 P2, and it is a COPY defect with a mechanical cause. queueActiveDraft()
// calls renderPanel() before the handler reports anything, so the reason attached to
// the button re-renders from queueDraftBlocker() — which is now correctly true again,
// the draft having just been banked and emptied — and reads "Change a style or write
// an instruction first" the instant the press succeeds. Both personas read that as a
// failure: the control they just pressed immediately tells them it did nothing.
//
// The original fix rendered the confirmation as prose beside the button AND sent it to
// setGlobalActionStatus, on a comment claiming that function prefers the STRUCTURE
// panel's status line and so lands somewhere that may be collapsed. That comment was
// FALSE — statusNodeIsReachable() skips any candidate under an aria-hidden or inert
// ancestor, so a collapsed structure panel falls THROUGH to the design panel's own
// [data-status], which is in the same panel as the button. Andrew then removed the
// visible prose (62 characters in an 11px `flex: 1 1 auto; min-width: 0` slot, wrapping
// to four lines beside the waveform), so what survives to be graded here is the
// button's own accessible reason plus the status channel.
//
// statusText joins every .raven-grab-status in the panel on purpose ("which one it
// lands on is not this suite's business"), which makes it sound for ARRIVAL and NOT
// for disappearance — a live region retains its last message. That asymmetry is why
// T11 below asserts the expiry on the title alone.
test('a successful bank confirms itself instead of immediately re-refusing', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Bank this and tell me you did');

    const before = await page.evaluate(readState);
    assert.equal(before.buttonDisabled, false, 'the button is live before the press — otherwise this measures a refusal');

    await clickQueueButton(page);

    const after = await page.evaluate(readState);
    // THE HARM FIRST. This is the defect Sol named and `assert` aborts at the first
    // failure, so a mutant has to reach it before it reaches any mechanism assertion.
    assert.doesNotMatch(
      after.buttonTitle,
      /write an instruction first/,
      'the control that was just pressed does not immediately contradict itself'
    );
    // The button is aria-disabled rather than natively disabled precisely so its reason
    // stays reachable; with the visible prose gone, `title` is the confirmation a
    // sighted user can still get AT the control that was pressed.
    assert.match(after.buttonTitle, /Added to queue/, 'and the accessible reason says the bank happened');
    assert.match(after.statusText, /Added to queue/, 'and the status channel carries it too');
  });
});

// Remove ONE pending row through the control a user presses. Returns the number of
// rows that matched, so a test can assert its own precondition rather than pass
// vacuously when the selector finds nothing.
async function removeFirstDraftRow(page) {
  const found = await shadowEval(page, (root) => {
    const buttons = root.querySelectorAll('[data-remove-change^="draft-"]');
    if (!buttons.length) return { count: 0, point: null };
    buttons[0].scrollIntoView({ block: 'center' });
    const rect = buttons[0].getBoundingClientRect();
    return {
      count: buttons.length,
      point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    };
  });
  if (found.point) await page.mouse.click(found.point.x, found.point.y);
  await page.waitForTimeout(60);
  return found.count;
}

// Sol round-4 P2. The notice ASSERTS that work is in the queue, and it was written
// once and never expired: remove the sole banked row and the panel kept saying
// "Added to queue" over an empty queue, in the note AND in the accessible reason.
// Reproduced live before it was fixed (.claude/queue-draft-2026-08-10/probe-stale-notice.mjs),
// which is what separates this from a reading of queueNoteText().
//
// An INSTRUCTION-ONLY draft is load-bearing: it banks exactly one row, so removing
// it empties the queue completely. Add a style edit and a second row survives, which
// is the case the companion test below covers — and under which the notice must STAY.
test('removing the last banked row stops the panel claiming it is in the queue', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Tighten this headline');

    await clickQueueButton(page);

    const banked = await page.evaluate(readState);
    assert.equal(banked.draftRows, 1, 'the bank produced exactly one pending row — otherwise the removal below cannot empty the queue');
    assert.match(banked.buttonTitle, /Added to queue/, 'and the confirmation is honest at this point');

    const removed = await removeFirstDraftRow(page);
    assert.equal(removed, 1, 'exactly one row was there to remove');

    const after = await page.evaluate(readState);
    // THE HARM FIRST: assert aborts at the first failure, so a mutant must reach
    // the user-visible claim before it reaches any mechanism.
    assert.equal(after.draftRows, 0, 'the queue is empty after the removal');
    assert.doesNotMatch(
      after.buttonTitle,
      /Added to queue/,
      'because the panel must not claim work is queued beside an empty queue'
    );
    // What it says INSTEAD, which is the difference between an expired notice and a
    // blanked one: queueDraftBlocker()'s own reason. The `title` is the ONLY surface
    // that can answer this. statusText cannot — a live region keeps its last message,
    // so an expired notice and a notice that was merely superseded are byte-identical
    // there, and renderPanel()'s effect on it is unverified. Since Andrew's 2026-08-10
    // ask there is no visible prose to read it off either.
    assert.equal(after.buttonDisabled, true, 'the button refuses again, rather than staying armed over an empty queue');
    assert.match(
      after.buttonTitle,
      /Change a style or write an instruction first/,
      'and the reason falls back to the live blocker rather than going silent'
    );
    // The blocker is reachable as the button's accessible reason and is NOT painted as
    // prose anywhere in the panel. That is the whole content of Andrew's removal ask,
    // and it has to be asserted on the far side of a real state change or a mutant
    // that re-renders the removed element only after a bank would survive.
    assert.deepEqual(
      after.visibleBlockerProse,
      [],
      'and no blocker reason is painted as prose anywhere in the panel'
    );
  });
});

// The other direction, and the reason it exists: a fix that simply stopped writing
// the notice, or expired it unconditionally, passes the test above. The expiry is
// deliberately narrow — pendingLogicalCount() > 0, so the notice rides for as long
// as anything is actually in the queue. Q10's precedent: a red-on-correct-code
// direction is what makes a narrowness measured rather than asserted.
test('removing one of two banked rows leaves the queue confirmation standing', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Tighten this headline');
    // A style edit alongside the instruction, so the bank produces TWO rows.
    await editBoxShadow(page, 'soft');

    await clickQueueButton(page);

    const banked = await page.evaluate(readState);
    assert.ok(banked.draftRows >= 2, `the bank produced two pending rows (got ${banked.draftRows}) — with one row this test degenerates into the one above`);
    assert.match(banked.buttonTitle, /Added to queue/, 'and the confirmation is there to be lost');

    await removeFirstDraftRow(page);

    const after = await page.evaluate(readState);
    assert.ok(after.draftRows >= 1, `a row is still queued after the removal (got ${after.draftRows})`);
    assert.match(
      after.buttonTitle,
      /Added to queue/,
      'because the claim is still TRUE beside a row that is still queued'
    );
  });
});

// Read every node in the panel that carries the confirmation string. Reachability
// and paint are separate: aria-hidden/inert decide whether AT can reach a node;
// screenshots decide whether a sighted user can see its pixels.
const readConfirmationSurfaces = `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  const mic = root.querySelector('.raven-grab-queue .raven-grab-voice');
  const button = root.querySelector('[data-queue-draft]');
  const ancestry = (n) => {
    let hidden = false;
    let inert = false;
    for (let walk = n; walk; walk = walk.parentNode) {
      if (walk.nodeType !== 1) continue;
      if (walk.getAttribute('aria-hidden') === 'true') hidden = true;
      if (walk.hasAttribute('inert')) inert = true;
    }
    return { hiddenAncestor: hidden, inertAncestor: inert };
  };
  const micRect = mic ? mic.getBoundingClientRect() : null;
  const buttonRect = button ? button.getBoundingClientRect() : null;
  return {
    // The mic/button gap, SIGNED, measured AFTER a successful bank. See the pair
    // assertion in T13 for why it is measured here rather than left to the alignment
    // suite, which only ever sees the row at rest.
    pairGap: micRect && buttonRect ? Math.round((buttonRect.left - micRect.right) * 100) / 100 : null,
    hasPair: Boolean(micRect && buttonRect),
    statuses: Array.from(root.querySelectorAll('.raven-grab-status'))
      .filter((n) => /Added to queue/.test(n.textContent))
      .map((n) => Object.assign({
        kind: n.getAttribute('data-kind'),
        live: n.getAttribute('aria-live'),
        text: n.textContent,
        side: n.closest('.raven-grab-panel')?.getAttribute('data-side') || 'right'
      }, ancestry(n)))
  };
})()`;

// Paint is measured, not inferred from geometry or CSS. Hiding the candidate with
// `visibility:hidden` is layout-neutral; if the before/after screenshots are
// identical, the node contributed no visible pixel even if its box is large.
async function paintedPixelDelta(page) {
  const clip = await shadowEval(page, (root) => {
    const node = Array.from(root.querySelectorAll('.raven-grab-status')).find((candidate) => /Added to queue/.test(candidate.textContent));
    if (!node) return null;
    node.setAttribute('data-paint-probe', '');
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(rect.left) - 2),
      y: Math.max(0, Math.floor(rect.top) - 2),
      width: Math.max(1, Math.ceil(rect.width) + 4),
      height: Math.max(1, Math.ceil(rect.height) + 4)
    };
  });
  assert.ok(clip, 'the confirmation status exists before its paint is measured');
  const before = PNG.sync.read(await page.screenshot({ clip }));
  await shadowEval(page, (root) => {
    root.querySelector('[data-paint-probe]').style.visibility = 'hidden';
  });
  const hidden = PNG.sync.read(await page.screenshot({ clip }));
  await shadowEval(page, (root) => {
    const node = root.querySelector('[data-paint-probe]');
    node.style.removeProperty('visibility');
    node.removeAttribute('data-paint-probe');
  });
  let changed = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    if (before.data[i] !== hidden.data[i]
      || before.data[i + 1] !== hidden.data[i + 1]
      || before.data[i + 2] !== hidden.data[i + 2]
      || before.data[i + 3] !== hidden.data[i + 3]) changed += 1;
  }
  return changed;
}

// This test has been RIGHT TWICE ABOUT OPPOSITE THINGS, and the reason is worth more
// than either verdict. A design-judge pass (OTHER-no-load-bearing-decoration) counted
// the confirmation rendering twice — once as visible prose beside the button, once
// through setGlobalActionStatus — and the fix made the status call "sr-only": one
// announcement, one visible confirmation, at the control that was pressed. That was
// correct at the time and it is the house pattern (four sibling success calls do the
// same: "Saved <selector>", the send label, "Sent to agent", "Email sent").
//
// Then Andrew sent a screenshot. The visible half was a 62-character sentence in a
// `flex: 1 1 auto; min-width: 0` slot at 11px, wrapping to FOUR lines and pushed
// leftmost by `order: -1`, crowding the waveform and the mic — and he asked for the
// element gone. **A test asserting a string is rendered says nothing about whether it
// is rendered legibly**, and this file's own green run is what let that ship.
//
// Removing the visible copy INVERTS the sr-only fix's premise: with nothing else
// rendering it, a visually-hidden status is the only confirmation there is, i.e. none
// at all for a sighted user. So the kind was dropped and the assertions below flip
// with it. The duplication is still measured — by `statuses.length === 1`, which is
// what "announces itself once and renders itself once" now means end to end.
//
// The "is it painted" assertion comes before the mechanism ones, because it is the
// harm and `assert` aborts at the first failure — the Q21 lesson from v9, where a
// precondition aborted ahead of the assertion its mutant was declared against.
test('a successful bank announces itself once and renders itself once', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    await shadowEval(page, (root, arg) => {
      const field = root.querySelector('[data-instruction]');
      field.value = arg;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, 'Bank this once, not twice');

    await clickQueueButton(page);

    const surfaces = await page.evaluate(readConfirmationSurfaces);

    // Dropping the setGlobalActionStatus call entirely would satisfy every
    // not-duplicated assertion and is the wrong fix, so ARRIVAL is asserted first —
    // and `=== 1` is what keeps "once" measured after the visible prose was removed.
    assert.equal(surfaces.statuses.length, 1, 'the bank reaches the shared status channel exactly once');

    // THE HARM, ahead of the mechanism. A clipped/transparent node can retain a large
    // box, so geometry cannot establish sighted visibility. Compare painted pixels.
    const paintedPixels = await paintedPixelDelta(page);
    assert.ok(
      paintedPixels > 0,
      `and it actually paints pixels (got ${paintedPixels} changed pixels)`
    );
    // The mechanism, second: no kind at all. setGlobalActionStatus REMOVES the
    // attribute rather than blanking it (browser/raven-grab.js:12805-12806), so this
    // reads null and not ''. Asserting it alongside the painted-pixel delta separates a
    // deliberately visible status from one that happens to paint because some other
    // rule overrode the clip.
    assert.equal(surfaces.statuses[0].kind, null, 'with no sr-only kind clipping it away');
    assert.equal(surfaces.statuses[0].live, 'polite', 'on a live region, so it is announced when it happens');
    assert.equal(surfaces.statuses[0].hiddenAncestor, false, 'with no aria-hidden ancestor excluding it from accessibility APIs');
    assert.equal(surfaces.statuses[0].inertAncestor, false, 'with no inert ancestor excluding it from focus and assistive technology');

    // AND the layout Andrew asked for survives a successful bank. This is the only
    // place in either suite that can measure it AFTER a state change: the alignment
    // suite only ever sees the row at rest, and queueActiveDraft() calls renderPanel(),
    // so the whole row is rebuilt between the press and this read. The markup order is
    // mic -> button now; the `order: -1` declaration that used to pull a notice element
    // back to the left of the mic went with the element itself, which is why no mutant
    // is declared against it any more.
    // Signed on purpose: a negative gap is the mic sitting to the RIGHT of the button,
    // the opposite of the ask, and Math.abs of the gap alone would accept it.
    assert.ok(surfaces.hasPair, 'the queue row still has both a mic and an Add-to-queue button');
    assert.ok(
      Math.abs(surfaces.pairGap - 8) <= 1,
      `and the mic still sits immediately left of the button after a bank (gap ${surfaces.pairGap}px, want 8px)`
    );
  });
});

test('a successful bank routes around a collapsed Assets status region', async (t) => {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay queue test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return;
  }
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#a');
    const staged = await shadowEval(page, (root) => {
      root.querySelector('[data-tab="assets"]').click();
      const leftStatus = root.querySelector('[data-status-b]');
      root.querySelector('[data-panel-preset="right"]').click();
      const leftPanel = root.querySelector('.raven-grab-panel[data-side="left"]');
      return {
        leftStatusMounted: Boolean(leftStatus),
        leftHidden: leftPanel && leftPanel.getAttribute('aria-hidden'),
        leftInert: Boolean(leftPanel && leftPanel.hasAttribute('inert'))
      };
    });
    assert.deepEqual(
      staged,
      { leftStatusMounted: true, leftHidden: 'true', leftInert: true },
      'Assets owns a mounted status region inside the collapsed aria-hidden and inert left panel'
    );
    // The panel preset animates its transform. The queue helper uses a real raw
    // pointer, so let that transition settle before measuring/clicking coordinates.
    await page.waitForTimeout(350);
    async function bankWithOneCollapsedAttribute(suppressedAttribute, instruction) {
      await shadowEval(page, (root, arg) => {
        const leftPanel = root.querySelector('.raven-grab-panel[data-side="left"]');
        if (root.__restoreReachabilityProbe) root.__restoreReachabilityProbe();
        if (arg.suppressedAttribute === 'inert') {
          const original = leftPanel.toggleAttribute.bind(leftPanel);
          leftPanel.setAttribute('aria-hidden', 'true');
          leftPanel.removeAttribute('inert');
          leftPanel.toggleAttribute = function(name, force) {
            if (name === 'inert') { this.removeAttribute('inert'); return false; }
            return original(name, force);
          };
          root.__restoreReachabilityProbe = function() { delete leftPanel.toggleAttribute; };
        } else {
          const original = leftPanel.setAttribute.bind(leftPanel);
          leftPanel.toggleAttribute('inert', true);
          leftPanel.setAttribute = function(name, value) {
            return original(name, name === 'aria-hidden' ? 'false' : value);
          };
          leftPanel.setAttribute('aria-hidden', 'false');
          root.__restoreReachabilityProbe = function() { delete leftPanel.setAttribute; };
        }
        root.querySelectorAll('.raven-grab-status').forEach((node) => { node.textContent = ''; });
        const field = root.querySelector('[data-instruction]');
        field.value = arg.instruction;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }, { suppressedAttribute, instruction });
      await clickQueueButton(page);
      const surfaces = await page.evaluate(readConfirmationSurfaces);
      const statusDebug = await shadowEval(page, (root) => Array.from(root.querySelectorAll('.raven-grab-status')).map((node) => ({
        text: node.textContent,
        side: node.closest('.raven-grab-panel')?.getAttribute('data-side') || 'right',
        connected: node.isConnected
      })));
      assert.deepEqual(
        surfaces.statuses.map(({ side, hiddenAncestor, inertAncestor }) => ({ side, hiddenAncestor, inertAncestor })),
        [{ side: 'right', hiddenAncestor: false, inertAncestor: false }],
        `the bank uses one reachable right status region (got ${JSON.stringify(statusDebug)})`
      );
    }

    await bankWithOneCollapsedAttribute('inert', 'Route around aria-hidden alone');
    await bankWithOneCollapsedAttribute('aria-hidden', 'Route around inert alone');
  });
});
