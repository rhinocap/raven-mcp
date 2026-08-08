// Every mic in the overlay sits flush with the right edge of the row that holds
// it. A design-judge pass caught the Feedback pane's mic sitting mid-row while
// the Instructions mic was flush; measuring it found the gap was 396px, not the
// "~4px" the note recorded, and — the part eyes did not catch — the SAME row
// shape exists five times. `.raven-grab-field > span` and
// `.raven-grab-feedback-field > span` were both block-level, so the mic
// rendered immediately after the label text on the feedback message, the
// fixed-move note, the template note, the template name and the component name.
// The Instructions and Component-notes mics were already flush because they sit
// in `.raven-grab-section-heading`, which has been flex/space-between all along.
//
// This lives in its own file rather than in test/grab-overlay-voice-input.test.mjs
// on purpose: that suite's harness asserts a run accounts for EXACTLY 40 tests
// and its header carries 57 measured radii, so a 41st test there would force a
// whole 57-mutant browser re-run to guard one CSS rule. A sibling file keeps
// both matrices intact.
//
// The property is deliberately measured against the ROW rather than against the
// control below it: two of the five mics (Instructions, Component notes) sit in
// a section heading with no `<label>`, so a control-relative assertion would
// have nothing to compare and would silently skip exactly the two rows that
// were already correct — the control gap is asserted too, but only where a
// control exists.
//
// Mutation matrix v7 — MEASURED, re-run WHOLE after the round-5 fixes: 15
// mutants, 15 killed, 0 survived, plus 2 CONTROLS that must stay green and do.
// The controls arrived in v5 and they are not decoration: a matrix that only
// ever asks "does this turn red" is structurally blind to a FALSE FAIL, and
// a gate that cries wolf on correct code is how a gate gets muted. No radius
// measured in v6 moved in v7 either — but that was NOT a foregone conclusion
// this round the way it was last round: round 5 rewrote the scanner's
// lookbehinds AND changed the enclosure rule itself, so a moved radius was a
// live possibility and the whole matrix was re-measured rather than carried
// forward. Each is a string edit on a copy of
// browser/raven-grab.js served through RAVEN_GRAB_ASSET_PATH. Radii are
// near-uniform because this file holds TWO tests and each mutant reaches one of
// them — a radius here is mostly a fact about the file, not evidence that a
// mutant is narrowly caught. What separates A1-A3 is the reported set of
// offending rows; what separates A4 from A5 is the reported source LINE:
//
//   A1  the shared row rule reverts to display:block
//         -> component-name, template-name, feedback-message
//   A2  the row is flex but drops justify-content:space-between
//         -> component-name, template-name, feedback-message
//   A3  `.raven-grab-field > span` keeps display:block, so the rule covers
//       the feedback row ONLY
//         -> component-name, template-name   (feedback-message stays flush)
//
// A3 is the load-bearing one: it is the "fixed one of two call sites that share
// a rule" shape this codebase has already paid for twice. Without it, folding
// the two selectors into one rule would look like tidiness rather than the fix.
// A1 and A2 are two different mechanisms with ONE observable — under
// display:block the justify-content never applies either — and that is stated
// rather than dressed up as two independent guards.
//
//   A4  the fixed-move note's mic loses its covered wrapper
//         -> radius 1, source test, reporting browser/raven-grab.js:8518
//   A5  the per-template note's mic loses its covered wrapper
//         -> radius 1, source test, reporting browser/raven-grab.js:8552
//   A6  a ninth mic appears in the overlay
//         -> radius 2 (source test on the count assertion, AND the rendered
//            test, which sees the duplicate push the Instructions mic 109px off
//            the right edge)
//   A7  a mic ESCAPES its covered container into a sibling <div>
//         -> radius 2 (source test, AND the rendered test at 396px)
//   A8  the same escape at the per-template note, which the rendered test
//       structurally cannot reach
//         -> radius 1, source test, reporting browser/raven-grab.js:8552
//
// A4 and A5 are ONE mechanism at two SITES, and both are rows the rendered test
// structurally cannot reach — the fixed-move note and the per-template note
// only exist in template mode. That is the entire reason the source-enumeration
// test exists: the CSS rule is shared, so a row that never renders in a test can
// still lose its mic alignment with nothing red.
//
// A7/A8 are the same pair for a DIFFERENT mechanism, and they exist because the
// first version of the enumeration rule was blind to it. That version asked
// whether a covered opener APPEARS in the 200-character window before the mic —
// and presence is not enclosure. A container that opens, holds its label and
// CLOSES, followed by an uncovered <div> holding the mic, satisfies it while
// rendering the exact 396px defect this file exists to prevent. Both were
// measured under BOTH rules, and the pair is what makes the cost legible:
//
//   A7 (feedback mic, RENDERED)     old rule -> enumeration GREEN, geometry red
//   A8 (template mic, NOT rendered) old rule -> the WHOLE SUITE GREEN, 2 pass
//
// A7 alone understates the defect, because the browser test happens to reach
// that row and would have caught it anyway. A8 is the load-bearing measurement:
// a real misalignment in a container no browser test can render, where the
// enumeration test is the only guard there is — and the old rule let it through
// with nothing red anywhere. The rule is a tag-depth walk now, and it is
// deliberately zero-AND-never-negative rather than a single check, because
// depth > 0 (the mic is nested deeper than the shared rule reaches) and
// depth < 0 (the container closed and the mic is outside it) are two different
// failures.
//
// A9/A10/A11 are round 3, and the lesson is one layer in from A7/A8: the depth
// walk was right about ENCLOSURE and wrong about what it was reading. It walked
// raw JavaScript as if it were HTML, which is wrong in BOTH directions, and the
// pair measures both. A11 covers the lexer the fix needed.
//
//   A9  an UNCOVERED mic whose escape is masked by a JS comment carrying a
//       covered opener
//         -> radius 1 today. PRE-FIX: fail=0 — the whole suite passed on a real
//            misalignment, exactly the A8 failure with a comment in front of it
//   A10 CONTROL: a COVERED mic preceded by `<!-- <em> -->`
//         -> 0 red today, as it must be. PRE-FIX: fail=1 — a correctly built row
//            reported as a defect, because a tag inside an HTML comment was
//            counted as an opener
//   A11 CONTROL: a quote-bearing regex literal a few hundred characters ahead of
//       a mic (behaviour-preserving JavaScript)
//         -> 0 red today. This one does NOT prove its mechanism and says so: the
//            scanner's regex branch is proven by the PRISTINE overlay, where
//            removing it turns the real file red (measured, 1 pass / 1 fail) on
//            `.replace(/"/g, …)` at ~2968. A11 is the forward guard for the next
//            such regex, not the evidence for this one.
//
// A9 and A10 pull in opposite directions on purpose. A red-only matrix would
// have accepted a "fix" that simply refused everything.
//
// A12/A13/A14 are round 4, and all three are ONE finding in three doors: the
// round-3 lexer was incomplete, and every gap failed toward FALSE-COVERED, in
// silence. Quoted text became fake markup (or real markup went missing), the
// fake opener beat the real one at `lastIndexOf` because it sat AFTER it, and
// the newline invariant never fired because the quotes balanced on one line.
// Each was measured surviving BEFORE the fix — all three on rows the browser
// test cannot render, so the whole suite was green on a real misalignment:
//
//   A12 a regex literal after a CONTROL-header `)`  -> PRE-FIX fail=0
//   A13 a JS comment inside `${…}`                  -> PRE-FIX fail=0
//   A14 a real `</span>` written as `\x3c/span>`    -> PRE-FIX fail=0
//
// A13 spent one measurement at the Instructions site and came back radius 1 —
// and the red was the GEOMETRY test, not this one. The enumeration walk was
// fooled exactly as claimed; the browser happened to render that row and
// covered for it. That is the A7-vs-A8 trap again: a counterexample against the
// SOURCE rule has to live on a row no browser test can reach, or its radius
// grades the wrong guard. Read the failure MESSAGE, never the count.
//
// The fixes are three, and none subsumes another. `)` gets a paren STACK,
// because a `)` ending a control header and a `)` ending an expression are
// identical where they sit and only the matching `(` separates them. `${…}` is
// lexed as CODE, because an interpolation body is JavaScript and the overlay
// genuinely uses one at browser/raven-grab.js:10567. Escapes are DECODED rather
// than stripped of their backslash, because `\x3c` has to be able to produce a
// `<` — round 3's version read `\"` correctly and read a real closing tag as
// `x3c/span>`.
//
// A15/A16/A17 are round 5, and A15 is the one that names the CLASS the three
// rounds before it were each attacking one instance of. All three were measured
// surviving before the fix, all three on the per-template row the browser test
// cannot render, so the whole suite was green on a real misalignment:
//
//   A15 an unrendered decoy string carrying a covered opener  -> PRE-FIX fail=0
//   A16 a comment longer than the 24-char control lookback    -> PRE-FIX fail=0
//   A17 a comment between the control-header `)` and the `/`  -> PRE-FIX fail=0
//
// A16 and A17 are ordinary lexer holes and the last of that family: the round-3
// and round-4 lookbehinds read a fixed 24-character window of the RAW source, so
// a comment could defeat them by DISTANCE alone (A16 hides the `if` from the
// control-word check) or by simply sitting where the walk did not skip (A17 —
// `opensRegex` skipped spaces and tabs, never comments, so it never reached the
// `)` and never consulted lastCloseWasControl). Both lookbehinds read `code` now,
// where every comment above the cursor is already blanked, and both read a WHOLE
// identifier rather than a window — which is what makes them token-based instead
// of window-based, and which gives the `notif (` exclusion for free.
//
// A15 has NO lexer error in it at all, and that is the point. It is a string
// literal that is never rendered, carrying a covered opener, sitting between the
// real opener and the mic. The scan is correct and the verdict is still wrong,
// because `lastIndexOf` takes the LAST covered opener in the window and the
// decoy sits after the real one. So "the walk reads markup, not JavaScript" was
// never the property: a string is not markup either — it becomes markup when
// something concatenates it into the output. The fix is a third view, `glue`,
// and a concatenation-only check between anchor and mic; see enclosedByCovered.
//
// The attribution was MEASURED IN TWO STAGES rather than read off the final
// matrix. The lexer fix was applied alone and re-measured first: 15 mutants,
// 14 killed, A15 still surviving. That is what proves the lexer fix owns A16/A17
// and the glue check owns A15 — the glue check would have killed all three, and
// a single final run could not have told those apart.
//
// The first draft of this test asserted per row and was measured NOT to
// separate A1 from A3: assert aborts at the first failure, all three mutants
// break panel/data-template-name first, and the message was byte-identical.
// Violations are collected and asserted once for that reason.
//
// The source test's first draft read ../browser/raven-grab.js by a hardcoded
// path, which would have graded the PRISTINE file under every mutant in this
// matrix and reported three kills it never made. It reads the served overlay
// now, the same file the browser tests exercise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

// A missing playwright is NOT a reason to stop this file. The source-enumeration
// test below reads browser/raven-grab.js and nothing else — no browser, no
// server, no dist/ — and it is the ONLY guard on the two mics that live in
// template-mode rows the browser test cannot render. Round 3 called
// process.exit(0) here, which suppressed it along with the geometry test.
let chromium = null;
let playwrightError = null;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  playwrightError = err;
}

// Availability is measured ONCE here, by a probe that does not go through any
// of the code under test — the same pattern test/capture.test.mjs arrived at
// over rounds 12-19, for the same reason. The first draft of this file caught
// any /browserType\.launch/ failure and turned it into t.skip, which means the
// whole suite could report "1 skipped, 0 failed, exit 0" against all three
// alignment defects: a skip and a pass were indistinguishable. That is not
// hypothetical here — an adverse pass running under a sandbox hit
// "MachPortRendezvousServer ... Permission denied (1100)" and got exactly that
// green run.
//
// If the probe LAUNCHED, chromium is present and any later launch failure is a
// real failure, so it is rethrown. Two limits, stated rather than implied:
// an intermittently-failing probe re-enables skipping for that whole run (the
// safe direction — a flaky probe must not turn a green machine red), and on a
// machine with genuinely no chromium the suite still skips. The skip COUNT is
// the only thing that distinguishes those two environments — read it.
//
// The probe walks the WHOLE path the real test takes before it reaches any
// product code — a loopback listen, launch, newPage at the suite's default
// viewport, a navigation, and close. A launch-only probe answers a narrower
// question than the one being asked: a chromium that starts but cannot open a
// page would satisfy it and then fail the real test, which the suite would
// report as a product defect.
//
// The loopback listen is in the probe because an adverse pass measured exactly
// that gap: chromium came up fine and the geometry test then died on
// `listen EPERM 127.0.0.1` under a sandbox, reporting 1 failure / 0 skips — an
// environment reported as a product defect, which is the failure this probe
// exists to prevent. `withOverlay` binds a loopback server, so the probe binds
// one too. The rule is that the probe covers every environmental prerequisite
// the tests use, not just the most obvious one.
//
// There is deliberately NO test asserting the probe agrees with itself. The
// first version of this file had one, and it could not fail: its skip branch
// and its assertion branch are mutually exclusive by construction, so it read
// as a guard while measuring nothing. Availability is a module-level gate, and
// its observable is the SKIP COUNT plus the reason carried in each skip
// message — not a test of its own.
let chromiumAvailable = false;
let chromiumProbeError = playwrightError;
if (chromium) {
  try {
    const probeServer = createServer((_q, r) => r.end('ok'));
    await new Promise((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    await new Promise((resolve) => probeServer.close(resolve));
    const probe = await chromium.launch({ headless: true });
    try {
      const probePage = await probe.newPage();
      await probePage.goto('about:blank');
    } finally {
      await probe.close();
    }
    chromiumAvailable = true;
  } catch (err) {
    chromiumProbeError = err;
  }
}

// Imported lazily, inside the browser test only. At module scope an unbuilt
// dist/ would throw and take the source-enumeration test down with it — the same
// thing process.exit(0) used to do, one import further along.
let bridge = null;

const HOST_PAGE = '<!doctype html><html><head><title>alignment host</title></head><body>'
  + '<h1 id="heading">Host page</h1></body></html>';

async function withOverlay(fn) {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HOST_PAGE);
  });
  // The 'error' listener is not decoration: `listen` reports EPERM and EADDRINUSE
  // by emitting on the server, and an emitted 'error' with nothing listening
  // throws from the event loop — OUTSIDE this function's caller's try/catch, so
  // it can never be classified. Sol round 5 replayed exactly that under a
  // sandbox: 1 pass / 1 fail / 0 skipped on `listen EPERM 127.0.0.1`, an
  // environment reported as a product defect.
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-mic-align-'));
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

// The gate runs BEFORE any setup, and that placement is the fix rather than a
// tidy-up. Round 4 called this from the geometry test's CATCH, which meant
// `withOverlay` had already booted a server, a session and a browser by the
// time anything asked whether chromium existed — and one of those steps can
// fail in a way the catch never sees (see the 'error' listener above). A gate
// that only runs once setup has succeeded is not a gate.
//
// `!chromiumAvailable` is the WHOLE condition, and the message regex that used
// to sit beside it was a hole rather than a second guard (Sol round 3, P3). The
// probe walks listen -> launch -> newPage -> goto -> close, but the regex only
// recognised `browserType.launch`, so a probe that died at `newPage` set
// chromiumAvailable = false and then reported the identical environment failure
// in every test as a PRODUCT defect. Widening a probe without widening its
// classification is worse than not widening it.
//
// Once the probe has come up, nothing in this file skips: every later failure is
// a real failure and is thrown. Not independently falsifiable on a machine where
// chromium works — reverting it only changes behaviour in a state this suite
// cannot construct — so the probe error travels with the skip to make that state
// legible when it happens.
function skipIfNoBrowser(t) {
  if (!chromiumAvailable) {
    t.skip(`browser unavailable for overlay mic alignment; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
    return true;
  }
  return false;
}

test('every mic is flush with the right edge of the row that holds it', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const rows = await withOverlay(async (page) => {
    // A selection is what makes the Component / Template rows exist at all;
    // page.click fails actionability against the overlay host, so this is a
    // raw mouse click at the heading's own centre.
    const heading = await page.$('#heading');
    const hb = await heading.boundingBox();
    await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.waitForTimeout(300);

    return page.evaluate(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      // The settings modal's markup is built once and kept in the tree, so its
      // mic is present-but-zero-sized while the modal is closed. Measuring a
      // hidden row is measuring nothing; the target-set assertion below is
      // what stops this filter from quietly shrinking the sample.
      const visible = (mic) => mic.getBoundingClientRect().width > 0;
      const measure = (surface) => [...root.querySelectorAll('[data-voice-dictate]')].filter(visible).map((mic) => {
        // closest() from the mic itself lands on .raven-grab-voice-slot, the
        // mic's own inline wrapper, whose right edge is trivially the mic's.
        // The row is the label span or section heading ABOVE that wrapper.
        const row = mic.parentElement.closest('span:not(.raven-grab-voice-slot), .raven-grab-section-heading');
        const label = mic.closest('label');
        const control = label && label.querySelector('input, textarea');
        const micBox = mic.getBoundingClientRect();
        return {
          surface,
          target: mic.getAttribute('data-voice-dictate'),
          hasRow: Boolean(row),
          rowWidth: row ? +row.getBoundingClientRect().width.toFixed(2) : null,
          micWidth: +micBox.width.toFixed(2),
          rowGap: row ? +(row.getBoundingClientRect().right - micBox.right).toFixed(2) : null,
          controlGap: control ? +(control.getBoundingClientRect().right - micBox.right).toFixed(2) : null
        };
      });

      root.querySelector('[data-tab="assets"]').click();
      const panel = measure('panel');
      root.querySelector('[data-settings-open]').click();
      root.querySelector('[data-settings-section="feedback"]').click();
      const settings = measure('settings').filter((row) => row.target === 'data-feedback-message');
      return [...panel, ...settings];
    });
  });

  // Fail loudly if a surface stopped rendering its mics — a shrinking set would
  // otherwise turn this into a test that passes by measuring less.
  const targets = [...new Set(rows.map((row) => row.target))].sort();
  assert.deepEqual(targets, [
    'data-component-name',
    'data-feedback-message',
    'data-instruction',
    'data-template-name',
    'data-use-case'
  ], 'the set of mics reachable from the panel + feedback pane changed');

  // Violations are COLLECTED, not asserted one at a time. assert aborts at the
  // first failure, and every mutant this file is measured against happens to
  // break `panel/data-template-name` first — so a per-row assert reports one
  // identical message whether the rule was deleted outright or narrowed to the
  // feedback row alone, and the two mutants become indistinguishable. The full
  // list is what says WHICH rows lost the rule.
  const violations = [];
  for (const row of rows) {
    const where = `${row.surface}/${row.target}`;
    if (!row.hasRow) {
      violations.push(`${where}: no label row or section heading above the voice slot`);
      continue;
    }
    // Precondition, not decoration: in a row only as wide as the mic, "flush"
    // is true however the row lays out and the check below cannot fail.
    assert.ok(
      row.rowWidth > row.micWidth + 40,
      `${where}: row is ${row.rowWidth}px against a ${row.micWidth}px mic — too narrow for flush to mean anything`
    );
    if (Math.abs(row.rowGap) > 1) {
      violations.push(`${where}: mic is ${row.rowGap}px from the row's right edge, not flush`);
    }
    if (row.controlGap !== null && Math.abs(row.controlGap) > 1) {
      violations.push(`${where}: mic is ${row.controlGap}px from its own field's right edge`);
    }
  }
  assert.deepEqual(violations, [], `mic rows not flush:\n  ${violations.join('\n  ')}`);
});

// The test above renders THREE of the mic-bearing rows. Two more exist and are
// not reachable from a fresh session at a cost worth paying: the fixed-move
// note needs a fixed-position element AND a pending move, and the per-template
// note needs a template built and its layer expanded. An adverse pass named
// exactly that gap — the suite's own header said "five rows" while its
// assertion covered three, so changing either dynamic row's structure would
// leave it green.
//
// This closes the gap in the direction the gap actually runs. What can silently
// break those two rows is not the shared CSS rule (three rendered rows already
// hold that red) — it is one of them being rewritten into a container the rule
// does not cover, or a NEW mic being added to a fourth kind of row. So the
// property asserted here is the enumeration: every voiceButtonMarkup call site
// in the overlay sits inside one of the three containers the stylesheet aligns,
// and there are exactly eight of them.
//
// What this does NOT prove, stated so the next reader does not over-read it:
// it measures source structure, not rendered geometry. A container that is
// named correctly and styled wrongly passes here and fails the test above —
// which is why both exist rather than either alone.
//
// Mutants A4-A6 cover this test and are MEASURED in the file header. Two of
// their results are worth repeating here because a first draft of this comment
// guessed both wrong: A4 and A5 redden this test ALONE (the rendered test cannot
// reach a template-mode row), but A6 reddens BOTH — a duplicated mic is visible
// to geometry as well as to the count.
test('every mic in the overlay source sits in a container the shared rule aligns', async () => {
  // Read the overlay the SESSION serves, not the tracked file, so a mutant
  // handed through RAVEN_GRAB_ASSET_PATH is actually graded. The first draft
  // hardcoded ../browser/raven-grab.js and would have read the pristine source
  // under every mutant in the matrix — reporting a kill it never made.
  const overlayPath = process.env.RAVEN_GRAB_ASSET_PATH
    ? new URL('file://' + process.env.RAVEN_GRAB_ASSET_PATH)
    : new URL('../browser/raven-grab.js', import.meta.url);
  const source = await readFile(overlayPath, 'utf8');

  // The three row containers the stylesheet gives flex/space-between. Any
  // other wrapper renders the mic inline after the label text, which is the
  // 396px defect this file exists to prevent.
  const COVERED = [
    'class="raven-grab-feedback-field"><span>',
    'class="raven-grab-field"><span>',
    'class="raven-grab-section-heading"'
  ];
  // Tight enough that a renamed wrapper at the call site falls out of range
  // rather than matching some earlier row's container further up the file.
  // The widest real site (the Instructions heading, which carries an <h2> and
  // a section title between the container and the mic) measures ~95 chars.
  const REACH = 200;

  // "A covered opener appears somewhere in the window" was the first version of
  // this check and it has a demonstrated FALSE NEGATIVE: a covered container
  // that opens, holds its label and CLOSES, followed by an uncovered <div>
  // holding the mic, satisfies `before.includes(opener)` while rendering the
  // exact 396px defect this file exists to prevent. Presence is not enclosure.
  //
  // So the mic must be a direct child of the nearest covered opener: walk the
  // tags between that opener and the mic and require the depth to return to
  // zero without ever going negative. Zero-and-never-negative is two different
  // failures — depth > 0 means the mic sits inside a nested element the rule
  // does not reach, depth < 0 means the container closed and the mic is outside
  // it altogether, which is Sol's counterexample. The Instructions heading is
  // why the walk exists rather than a "no < between them" test: it legitimately
  // carries a complete <h2>…</h2> before its mic.
  //
  // The two field openers deliberately include `><span>`, because the shared
  // stylesheet rule is `.raven-grab-field > span` — the mic lives inside that
  // span, one level in, and the opener string is what encodes it.
  // Sol round 3 (P2): the first depth walk read raw JavaScript as HTML, and that
  // is wrong in BOTH directions. An UNCOVERED mic preceded by
  // `/* class="raven-grab-field"><span> */` passed, because a comment handed the
  // walk an opener; a correctly COVERED mic preceded by `<!-- <em> --> ` failed,
  // because an HTML comment handed it an unbalanced tag. A comment is not
  // markup, and JavaScript is not markup either.
  //
  // So the file is scanned ONCE from the top — not from the 200-char window,
  // which cannot know whether it began inside a string literal — into two
  // offset-preserving views:
  //
  //   code   JS comments blanked, everything else kept. Mic CALL SITES are found
  //          here, so a commented-out call is not a site.
  //   markup only the contents of string literals kept, with HTML comments
  //          inside them blanked. The depth walk runs here, so JS sitting
  //          between two markup fragments can never be parsed as a tag, and no
  //          comment of either kind can contribute an opener or a closer.
  //
  // Blanked characters become spaces and newlines are preserved, so one index
  // means the same thing in the source and in both views — that is what lets the
  // call sites and the windows come from different strings.
  //
  // REGEX LITERALS ARE PART OF THE LEXER, not a nicety. The first version of
  // this scanner skipped them and desynced on `browser/raven-grab.js:2968` —
  // `.replace(/"/g, '\\"')`, where the quote INSIDE the regex opened a string
  // that ran for thousands of characters and inverted the whole view from there
  // down. It did not fail quietly: two real mic sites read as uncovered and the
  // assertion went red. That is the failure mode this scanner is designed to
  // have, and the invariant below turns it from a symptom into a named cause.
  //
  // A `/` opens a regex when the previous non-whitespace character cannot end an
  // expression — the standard heuristic, and the only ambiguity JavaScript's
  // grammar leaves to a lexer.
  const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>', '\n']);
  const REGEX_KEYWORDS = /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;
  // A `)` is the one preceder that cannot be judged where it sits: it ends a
  // control HEADER (`if (ok) /re/.test(s)` — regex) or an expression
  // (`(a + b) / 2` — division), and nothing local to the `)` separates the two.
  // You have to remember what the matching `(` was, which is why there is a
  // stack below rather than another character in the set above.
  const CONTROL_WORDS = new Set(['if', 'while', 'for', 'switch', 'catch', 'with']);
  // Decoded so an escape can still produce a `<`. Astral code points collapse to
  // a space: a view slot must hold exactly ONE character or every offset below
  // it shifts, and no astral character can be part of a tag anyway.
  const SIMPLE_ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
  function scanSource(js) {
    const code = new Array(js.length);
    const markup = new Array(js.length);
    const glue = new Array(js.length);
    for (let k = 0; k < js.length; k += 1) {
      const blank = js[k] === '\n' ? '\n' : ' ';
      code[k] = js[k];
      markup[k] = blank;
      glue[k] = js[k];
    }
    const blankRange = (...targets) => {
      const to = targets.pop();
      const from = targets.pop();
      for (const target of targets) {
        for (let k = from; k < to && k < js.length; k += 1) target[k] = js[k] === '\n' ? '\n' : ' ';
      }
    };
    const parenIsControl = [];
    let lastCloseWasControl = false;
    // Both lookbehinds read `code`, NEVER the raw source. The scan is strictly
    // left-to-right, so every comment below the cursor is already blanked to
    // spaces there, and "the previous significant character" becomes an
    // ordinary whitespace skip. Sol round 5 hit both halves of reading `js`
    // instead, and both were measured surviving with the whole suite green:
    // `if (Date) /* g */ /re/` never walked back far enough to reach the `)`,
    // and `if /* …longer than 24 chars… */ (Date)` never saw the `if`.
    //
    // Newlines are skipped for the control-word lookbehind (`if\n(x)` is
    // ordinary JavaScript) and NOT for the regex one, where a leading `\n` is a
    // deliberate REGEX_PRECEDERS entry — a line that begins with `/` is a regex
    // far more often than it is a continued division.
    const prevSignificant = (at, skipNewlines) => {
      let k = at - 1;
      while (k >= 0 && (code[k] === ' ' || code[k] === '\t' || (skipNewlines && code[k] === '\n'))) k -= 1;
      return k;
    };
    // The identifier ending at k, or '' if k does not end one. Reading the whole
    // word is what makes this token-based rather than window-based: the
    // 24-character regex it replaces could be defeated by distance alone, and
    // `notif (` was only ever excluded by a `[^\w$]` guard that the word read
    // gives for free.
    const wordEndingAt = (k) => {
      if (k < 0 || !/[\w$]/.test(code[k])) return '';
      let w = k;
      while (w >= 0 && /[\w$]/.test(code[w])) w -= 1;
      return code.slice(w + 1, k + 1).join('');
    };
    const isControlHead = (at) => CONTROL_WORDS.has(wordEndingAt(prevSignificant(at, true)));
    const opensRegex = (at) => {
      const k = prevSignificant(at, false);
      if (k < 0) return true;
      // The `)` at k is necessarily the most recently CLOSED paren: only
      // whitespace and blanked comments were skipped to reach it, so nothing
      // could have closed since.
      if (code[k] === ')') return lastCloseWasControl;
      if (REGEX_PRECEDERS.has(code[k])) return true;
      return REGEX_KEYWORDS.test(wordEndingAt(k));
    };
    const spans = [];
    // Template interpolation frames. `${…}` is CODE inside a template literal,
    // and reading it as string content is how a JS comment inside one becomes
    // markup — R3-1's defect reached through a construct the overlay actually
    // uses (browser/raven-grab.js:10567).
    const interp = [];
    let braceDepth = 0;
    let i = 0;
    let quote = null;
    let start = 0;
    while (i < js.length) {
      const c = js[i];
      if (quote === null) {
        if (c === '/' && js[i + 1] === '*') {
          const end = js.indexOf('*/', i + 2);
          const stop = end === -1 ? js.length : end + 2;
          blankRange(code, glue, i, stop);
          i = stop;
          continue;
        }
        if (c === '/' && js[i + 1] === '/') {
          const end = js.indexOf('\n', i);
          const stop = end === -1 ? js.length : end;
          blankRange(code, glue, i, stop);
          i = stop;
          continue;
        }
        if (c === '/' && opensRegex(i)) {
          // Skip the regex body. A `/` inside a character class does not end it.
          let k = i + 1;
          let inClass = false;
          while (k < js.length) {
            const r = js[k];
            if (r === '\\') { k += 2; continue; }
            if (r === '\n') break;
            if (r === '[') inClass = true;
            else if (r === ']') inClass = false;
            else if (r === '/' && !inClass) { k += 1; break; }
            k += 1;
          }
          i = k;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; start = i; glue[i] = ' '; i += 1; continue; }
        if (c === '(') { parenIsControl.push(isControlHead(i)); i += 1; continue; }
        if (c === ')') { lastCloseWasControl = parenIsControl.length ? parenIsControl.pop() : false; i += 1; continue; }
        if (c === '{') { braceDepth += 1; i += 1; continue; }
        if (c === '}') {
          if (braceDepth === 0 && interp.length) {
            const frame = interp.pop();
            quote = '`';
            start = frame.start;
            braceDepth = frame.braceDepth;
            i += 1;
            continue;
          }
          braceDepth -= 1;
          i += 1;
          continue;
        }
        i += 1;
        continue;
      }
      // Inside a string literal: this is emitted markup.
      if (c === '\\') {
        // DECODE the escape and place the decoded character at the escape's LAST
        // index, blanking the rest, so one source index still means one view
        // index. Round 3 kept the escaped character and dropped the backslash,
        // which reads `\"` correctly and reads `\x3c/span>` as `x3c/span>` — a
        // closing tag that really renders, invisible to the walk.
        const next = js[i + 1];
        let width = 2;
        let ch = next === undefined ? ' ' : next;
        if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(js.slice(i + 2, i + 4))) {
          ch = String.fromCharCode(parseInt(js.slice(i + 2, i + 4), 16));
          width = 4;
        } else if (next === 'u' && js[i + 2] === '{') {
          const close = js.indexOf('}', i + 3);
          const hex = close === -1 ? '' : js.slice(i + 3, close);
          if (close !== -1 && /^[0-9a-fA-F]{1,6}$/.test(hex)) {
            ch = String.fromCodePoint(parseInt(hex, 16));
            width = close - i + 1;
          }
        } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(js.slice(i + 2, i + 6))) {
          ch = String.fromCharCode(parseInt(js.slice(i + 2, i + 6), 16));
          width = 6;
        } else if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, next)) {
          ch = SIMPLE_ESCAPES[next];
        }
        if (ch.length !== 1) ch = ' ';
        if (i + width - 1 < js.length) markup[i + width - 1] = ch;
        blankRange(glue, i, i + width);
        i += width;
        continue;
      }
      if (c === quote) {
        spans.push({ quote, start, text: js.slice(start, i) });
        glue[i] = ' ';
        quote = null;
        i += 1;
        continue;
      }
      if (quote === '`' && c === '$' && js[i + 1] === '{') {
        interp.push({ start, braceDepth });
        blankRange(glue, i, i + 2);
        quote = null;
        braceDepth = 0;
        i += 2;
        continue;
      }
      if (js.startsWith('<!--', i)) {
        const end = js.indexOf('-->', i + 4);
        const stop = end === -1 ? js.length : end + 3;
        blankRange(glue, i, stop);
        i = stop;
        continue;
      }
      markup[i] = c;
      glue[i] = c === '\n' ? '\n' : ' ';
      i += 1;
    }
    // The desync invariant, and it is a real check rather than a hopeful
    // comment: a ' or " string literal CANNOT contain a raw newline in
    // JavaScript, so one that does is proof the scanner lost the thread. This is
    // the exact signature the regex-literal bug produced. Backticks are exempt —
    // the overlay's stylesheet is one 77k-character template literal.
    // A LINE CONTINUATION (`\` then a newline) is legal inside a ' or " literal,
    // so it has to come out before the check or the invariant reports a desync
    // on correct source — the one direction that would get this assertion muted.
    const desynced = spans
      .filter((s) => s.quote !== '`' && s.text.replace(/\\\r?\n/g, '').includes('\n'))
      .map((s) => `browser/raven-grab.js:${js.slice(0, s.start).split('\n').length}`);
    return { code: code.join(''), markup: markup.join(''), glue: glue.join(''), desynced };
  }
  const view = scanSource(source);
  assert.deepEqual(view.desynced, [], `the source scanner lost its string/comment state at:\n  ${view.desynced.join('\n  ')}\nEvery verdict below it is meaningless — fix the lexer, do not adjust the expectations.`);

  const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'source', 'wbr', 'meta', 'link']);
  // Rounds 3 and 4 each fixed one way the scanner could read JavaScript as
  // markup. Sol round 5 then produced a counterexample with NO lexer error in
  // it at all (A15, measured surviving with the whole suite green): a string
  // literal that is never rendered, carrying a covered opener, sitting between
  // the real opener and the mic. The scan was correct and the verdict was still
  // wrong, because `lastIndexOf` takes the LAST covered opener in the window.
  //
  // The honest reading is that "the walk reads markup, not JavaScript" was never
  // the property. A string is not markup either — it becomes markup when
  // something concatenates it into the output. So the anchor must be connected
  // to the mic by nothing but concatenation: every character between the opener
  // and the call site, once string CONTENT is blanked out, has to be whitespace
  // or `+`. That is what `glue` is — `code` with every string interior, quote,
  // escape run, `${`, and in-string HTML comment blanked.
  //
  // A decoy therefore cannot help, whichever side of it the anchor sits on. As
  // the anchor, its own `String(…).slice(0, 0)` wrapper is in the glue and the
  // opener is rejected; as an obstacle, that same wrapper sits between the REAL
  // opener and the mic and rejects that one too. Both rejected means uncovered,
  // which is the correct verdict for A15.
  //
  // Checking only the LAST occurrence of each opener string is sufficient and
  // not a shortcut: an earlier occurrence's glue region is a superset of the
  // later one's, so if the later fails, the earlier fails too.
  //
  // This is CONSERVATIVE, in the direction that costs a red rather than a green.
  // A future site that puts a real function call between its container and its
  // mic — `'…<span>' + escapeHtml(label) + voiceButtonMarkup(…)` — will fail
  // here, and it should: nothing in this scan can tell whether that call emits a
  // `</span>`. All eight of today's sites are pure concatenation.
  const CONCATENATION_ONLY = /^[\s+]*$/;
  function enclosedByCovered(before, windowStart, micAt) {
    let openerEnd = -1;
    for (const opener of COVERED) {
      const at = before.lastIndexOf(opener);
      if (at === -1) continue;
      const end = at + opener.length;
      if (!CONCATENATION_ONLY.test(view.glue.slice(windowStart + end, micAt))) continue;
      if (end > openerEnd) openerEnd = end;
    }
    if (openerEnd === -1) return false;
    const between = before.slice(openerEnd);
    const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
    let depth = 0;
    let hit;
    while ((hit = tag.exec(between)) !== null) {
      if (hit[1] === '/') depth -= 1;
      else if (!hit[3].trim().endsWith('/') && !VOID_TAGS.has(hit[2].toLowerCase())) depth += 1;
      if (depth < 0) return false;
    }
    return depth === 0;
  }

  const sites = [];
  const call = /voiceButtonMarkup\(/g;
  let match;
  while ((match = call.exec(view.code)) !== null) {
    // Skip the declaration itself.
    if (/function\s+$/.test(view.code.slice(Math.max(0, match.index - 12), match.index))) continue;
    const windowStart = Math.max(0, match.index - REACH);
    const before = view.markup.slice(windowStart, match.index);
    const line = source.slice(0, match.index).split('\n').length;
    sites.push({ line, covered: enclosedByCovered(before, windowStart, match.index) });
  }

  // A count assertion is what makes the coverage claim hold going forward: a
  // ninth mic added to a fourth kind of row cannot pass by being new.
  assert.equal(sites.length, 8, 'the number of mics in the overlay changed — check the new one sits in a covered row');

  const uncovered = sites.filter((site) => !site.covered).map((site) => `browser/raven-grab.js:${site.line}`);
  assert.deepEqual(uncovered, [], `mics in a container the shared alignment rule does not cover:\n  ${uncovered.join('\n  ')}`);
});
