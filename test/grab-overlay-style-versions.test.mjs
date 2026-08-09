// Named style versions: save the active draft's style edits under a name, then
// restore or delete them. DialKit's "explore variations without losing work",
// which Raven had no equivalent of — every experiment overwrote the last one.
//
// Two decisions carry the whole feature, and neither is visible below the
// browser, which is why this suite exists at all rather than a unit test:
//
//   1. RESTORE REVERTS, THEN APPLIES. A restore that only applies leaves every
//      property the PREVIOUS experiment touched still on the element, so the
//      page shows a blend of two versions while the row's name claims one of
//      them. The revert half IS the feature; applying is the easy part.
//   2. THE REFUSAL. Only `styleEdits` is versioned. A draft also carrying a
//      state (hover/focus) edit, a token intent or a text edit refuses to save,
//      because a version restoring ONE of a draft's four edit kinds leaves the
//      other three on screen — a blend, with the name a lie about what is there.
//      (This line said "two of four" for a round; a version restores exactly one.)
//
// Versions are keyed by SELECTOR: a padding set lifted off one element and
// dropped on another means nothing, and the selector is the only identity that
// survives a reload — draft keys are per-page sequence numbers, reassigned on
// the next load, so a draft-keyed version would point at a different node.
//
// Seven more decisions came out of the two Sol rounds, and each is mutant-proven
// below rather than argued:
//
//   3. HYDRATE RENUMBERS, it does not validate. A stored id is a within-session
//      identity, never a stable reference, so the cheapest correct answer to
//      "what if storage carries a bad id" is to stop reading stored ids at all.
//      That kills duplicates, negatives, fractions and Number.MAX_SAFE_INTEGER
//      in one move — and the last of those is the reason a filter would not
//      have been enough: it is a VALID safe integer that passes any check, and
//      then the increment stops moving at the precision limit.
//   4. SAVE AND RESTORE SHARE THE SCOPE RULE. Refusing component scope only at
//      the save site is insufficient, because the scope can be switched AFTER a
//      save — and a restore under component scope mirrors the version onto
//      every sibling. This is the preview-vs-action drift one level out.
//   5. THE CAP IS ENFORCED IN MEMORY. Evicting only on the way to storage
//      leaves the list on screen longer than the list that reloads. Storage is
//      hand-editable, so the read side caps too (V16) — same rule, both doors.
//   6. AN INSTRUCTION DOES NOT BLOCK A SAVE. Accepted deliberately: a version
//      covers base styles, and an instruction is not a style. V15 inverts it,
//      so the decision is pinned rather than merely undocumented.
//
// And three from Sol round 2, each of which shipped past the sixteen mutants
// above, a green suite and this harness — a matrix measures the mechanisms it
// names and is blind to the ones nobody thought of:
//
//   7. SHAPE IS NOT VALIDITY. A stored edit can be well-typed in every respect
//      and still name a value CSS cannot parse. `restoreStyleVersion` CLEARS the
//      live edits before applying and `commitStyleEdit` refuses anything
//      `CSS.supports` rejects, so a hand-edited {"color":{"newValue":"nonsense"}}
//      wiped the current work, applied nothing, and returned true — a destructive
//      no-op wearing a restore's clothes, which is decision 1's blend arriving
//      through storage rather than through the panel. The read now runs the SAME
//      check the save path already ran, so it can never drop a version saved in
//      this session.
//   8. `editScope` IS A LIVE TOGGLE and says nothing about how the draft on
//      screen was PRODUCED. Edit in component scope, switch back to instance, and
//      componentScopeSiblingElements() returns [] — but nothing reverts the values
//      already mirrored onto the siblings, so decision 4's clause falls silent
//      while the screen is still a blend. Both blockers now also refuse while
//      `styleEditScopeSiblingsOriginal` holds an outstanding preview, and the
//      refusal NAMES the row to clear, because a refusal with no way out is worse
//      than the blend. The toggle's own asymmetry (leaving component scope
//      neither reverts nor re-applies the mirror) is reported, not fixed — it is
//      shared scope-toggle behaviour with its own test surface.
//   9. THE CAP IS PER SELECTOR, BECAUSE THE PANEL IS. A global trim deletes the
//      oldest version of whatever element happens to own it, and that is an
//      element the panel is not showing: the overflow save on #card removed
//      #other's oldest with no row disappearing anywhere on screen, discovered
//      only when #other was selected again. A cap nobody can watch enforce itself
//      is the silent loss this feature calls its one forbidden outcome. Enforced
//      at BOTH doors — V21 the save side, V22 the read side.
//
// And five more from Sol round 3, every one of which shipped past the
// twenty-two mutants above, a green suite and this harness — the third round
// running to say the same thing: a matrix measures the mechanisms it names.
//
//  10. AN EMPTY EDITS MAP IS NOT A VERSION. `.every()` is VACUOUSLY TRUE on {},
//      so `{"edits":{}}` passed the whole of decision 7 by having nothing to
//      validate. The row rendered reading "0 changes", and restoring it cleared
//      the live work and applied nothing — decision 7's own destructive no-op,
//      arriving through the one shape decision 7 did not consider.
//  11. THE VALIDITY CHECK CANNOT REST ON `CSS.supports` — NOT ON ITS EXISTING,
//      AND NOT ON ITS ANSWER. Round 2's fallback returned true whenever
//      `window.CSS.supports` was unavailable, which hands the destructive no-op
//      straight back on any engine lacking it. Round 3 replaced the fallback
//      with an engine probe — a declaration the CSS parser rejects leaves the
//      property unset on a detached node — and left `CSS.supports` as the
//      PRIMARY, so a page assigning `CSS.supports = () => true` was never
//      probed at all (Sol round 4). See decision 15: the probe is unconditional
//      now and `CSS.supports` is ANDed with it.
//  12. RESTORE ASKS WHETHER IT CAN APPLY EVERY PROPERTY BEFORE IT CLEARS
//      ANYTHING. The read-side filter structurally cannot cover a version saved
//      in THIS session: it never passes through isStyleVersionEdits. Without a
//      pre-restore check the revert half runs, the apply half refuses, and the
//      user's live work on the OTHER property is gone under a row that reported
//      success. It uses the same predicate the commit gate uses, so the two
//      cannot disagree — one rule, three call sites. This decision used to read
//      "CAN APPLY ANYTHING", which is the pre-round-4 existential contract and
//      is now FALSE: see decision 16 — `.some()` admits a restore that applies
//      part of a version and silently refuses the rest, which is the blend this
//      feature exists to prevent, assembled by the guard meant to prevent it.
//  13. THE MIRROR HAS TWO DIRECTIONS AND THEY ARE DIFFERENT QUESTIONS.
//      Decision 8 asks whether the element on screen OWNS an outstanding
//      mirror. This asks whether it is RECEIVING one: a mirror belongs to the
//      draft that authored it and drafts are stashed per selection, so #card's
//      bookkeeping sits in styleDrafts — invisible to a check reading only the
//      live globals — while #other is on screen showing a value #card authored.
//      Same blend, arriving under another selection, and the refusal names the
//      direction so it is actionable rather than merely correct.
//  14. A SAVE THAT WILL NOT SURVIVE A RELOAD MUST NOT LOOK LIKE ONE THAT WILL.
//      Decision 9's per-selector cap makes total growth (N selectors × 100)
//      reach a sessionStorage quota at all, and swallowing the throw reported
//      the failure as a success. The row is real — the in-memory save happened —
//      and only its durability is not, which is exactly what the note says. It
//      outranks both blockers in the note's precedence because it is the only
//      one of the three about work already DONE.
//  15. A CROSS-CHECK IS ONLY WORTH ITS DIRECTION. The engine probe is
//      UNCONDITIONAL and `CSS.supports` is ANDed with it, never consulted
//      alone, so a hostile or broken `CSS.supports` can only make the check
//      STRICTER: a lying `true` is overruled by the probe, a lying `false`
//      refuses a restore, which is honest and recoverable. Nothing the page
//      assigns makes it LOOSER, and looser is the only direction that destroys
//      work. Dropping `CSS.supports` outright was drafted and reversed — it
//      closes the finding and makes the pre-restore branch (decision 12)
//      unreachable for in-session versions, since the probe is deterministic
//      across time and every in-session value already passed it at commit. A
//      mechanism with no reachable trigger is not a fix. The `CSS.supports`
//      call carries its own try/catch because a page-installed thrower would
//      otherwise escape the restore CLICK HANDLER; a throw is no opinion.
//      This decision used to carry a RESIDUAL saying post-injection poisoning
//      of CSSStyleDeclaration.prototype.setProperty/getPropertyValue "defeats
//      the APPLY path in the same stroke, so nothing lands and nothing is
//      destroyed". That was FALSE and Sol round 5 refuted it: a SELECTIVE
//      wrapper substituting a valid value for exactly the garbage the probe
//      writes, and delegating everything else natively, leaves the apply path
//      fully working while the probe reports true — which is precisely the
//      asymmetry named one sentence earlier. See decision 18.
//  16. A RESTORE IS ALL-OR-NOTHING. Decision 12's guard asked `.some()`, so one
//      appliable property admitted the whole restore: the revert ran over
//      everything, the appliable half landed and the rest was silently refused
//      — the blend this feature exists to prevent, assembled by the guard meant
//      to prevent it. `.every()` now. The `properties.length > 0` clause has no
//      reachable trigger and says so, and no mutant pretends otherwise.
//      commitStyleEdit's return is IGNORED in the apply loop and the pre-check
//      is what earns that: it returns false for exactly three reasons — no
//      targets (asserted immediately above, same synchronous block), an
//      unsupported value (impossible, `.every()` just asked the same
//      deterministic predicate about every one of them), and
//      newValue === currentValue, which is a NO-OP and a successful restore.
//      Honouring it blanket-style would report a correct restore as broken.
//      Under `.some()` that ignored return WAS a genuine defect.
//  17. "THE SAME PREDICATE" IS A CLAIM, AND MEMOIZATION IS WHAT MAKES IT TRUE.
//      Decision 16 rests on the pre-check and commitStyleEdit asking the same
//      deterministic question, and round 4 simply ASSERTED that in a comment.
//      Nothing enforced it: `CSS.supports` is page-replaceable, so it can be
//      INCONSISTENT rather than merely wrong — `var n = 0; CSS.supports = () =>
//      ++n === 1` answers true to the `.every()` pre-check and false to
//      commitStyleEdit three statements later, so the revert half runs and the
//      apply half is refused. That is round 3's destructive no-op reassembled
//      across two invocations instead of smuggled through one. styleValueSupported
//      is MEMOIZED per (property, value) now, in a NULL-PROTOTYPE map so a page
//      polluting Object.prototype cannot plant a key answering `in` for a pair
//      nothing has probed. The memo is a CORRECTNESS mechanism; that it also
//      saves a probe allocation is incidental.
//
//      THE SCOPE IS ONE RESTORE, NOT THE SESSION, and that is the load-bearing
//      half. A global memo closes the same flip and is strictly worse: every
//      in-session version's values were probed at commit time and every stored
//      version's were probed by isStyleVersionEdits at hydrate, so no version
//      that can exist has a verdict left to change — the decision-16 pre-check
//      becomes UNREACHABLE, which is exactly the outcome round 4 refused when it
//      declined to drop `CSS.supports` from decision 15's AND. That is a
//      MEASUREMENT, not an argument: the global draft was written, run, and
//      turned the two tests owning V25 and V29 red, on unchanged product logic.
//      Outside a restore every ask is live; inside one, the pre-check and every
//      commitStyleEdit under it are one answer. V33 is the mutant that
//      reinstates the global form, and it reddens the two in-session refusal
//      tests — NOT the flip test, which the global form also closes. V30 is the
//      one that deletes the memo outright, and it reddens the flip test alone.
//      Two mutants on one mechanism, separated by which set they redden.
//  18. CAPTURE THE PROBE'S PRIMITIVES AT LOAD — BUT NOT `CSS.supports`.
//      The probe writes through Document.prototype.createElement, the `style`
//      ACCESSOR on HTMLElement.prototype, and
//      CSSStyleDeclaration.prototype.setProperty/getPropertyValue, all FOUR
//      page-replaceable, and decision 15's old residual dismissed that on a
//      false premise (see there). The four are captured at load via
//      Function.prototype.call.bind — this codebase's established move, same as
//      the composition guard's WeakSet methods and performance.now — with the
//      live lookups left as fallbacks for an engine lacking those primitives,
//      and no mutant pretends otherwise.
//      THE `style` ACCESSOR WAS THE ONE LEFT LIVE FOR A FULL ROUND, and it is
//      the same hole one line over: round 5b captured the two methods and then
//      read `probeCreateDiv().style` through a getter the page can redefine, so
//      a decoy declaration already carrying the property makes
//      `getPropertyValue` answer non-empty for garbage the parser rejected and
//      the probe reports TRUE. The AND does not rescue it — the same page hands
//      back a lying `CSS.supports` in the same breath. Found by READING, not by
//      the matrix, which is the standing point that a matrix measures the
//      mechanisms it names. The capture is now ALL-OR-NOTHING: every raw lookup
//      runs before any assignment, so an engine missing one prototype falls
//      back on all four rather than running a half-captured probe.
//      A ROUND-6 P3 THEN FOUND THE try/catch DID NOT DELIVER THAT, and the
//      correction is a `typeof` gate ahead of the four binds.
//      `Function.prototype.call.bind(undefined)` does NOT throw at bind time —
//      measured, not reasoned — so a prototype OBJECT that exists while one of
//      its METHODS is `undefined` sailed past the catch, installed a wrapper
//      that throws on first use, and the probe's own catch returned false,
//      REFUSING every supported edit instead of falling back. NO MUTANT KILLS
//      THAT GATE and the source says so: in a conforming engine an instance
//      method IS the prototype method, so deleting it breaks the captured path
//      and the live fallback identically and no Chromium fixture can separate
//      them. Same treatment as `probeCreateDiv`'s own capture below and as
//      `isIpLiteral` in src/reference-forget.ts — belt-and-braces whose comment
//      states its own uncoveredness rather than letting the matrix imply it.
//      The probe element is built
//      FRESH per uncached call rather than reset with a page-replaceable
//      `cssText` setter; decision 17's memo keeps that cheap inside a restore,
//      and outside one the probe runs on a click, not in a loop.
//      `CSS.supports` is deliberately NOT captured, and this is load-bearing in
//      two directions: capturing it would make decision 15's AND unfalsifiable
//      (a captured honest native is indistinguishable from the AND, so V28
//      would SURVIVE), and the AND is what handles a liar anyway. The memo
//      closes the flip; the AND closes the liar. RESIDUAL, stated rather than
//      guarded: PRE-injection poisoning still wins — unclosable from inside a
//      shared realm, and Raven's shadow root is open, so this is a correctness
//      mechanism against garbage in hand-editable storage, never a security
//      boundary against the page.
//
// MEASURED mutant matrix (.claude/dialkit-2026-08-08/version-mutants.mjs),
// re-run WHOLE after each fix round rather than carried forward — a find-string
// mutant dies the moment its target line is edited, and SEVEN of them have
// (V7's in round 1; V11's, V14's and V16's in round 2; V19's in round 3;
// V25's in round 4; and V24's TWICE — in round 5 and again in round 5b, each
// time because that round's fix rewrote the very line it was anchored to).
// V24's second death is the readable one: round 5b re-anchored it onto
// `probeCreateDiv().style`, and the .style capture rewrote exactly that line
// one fix later. V19's cost 25 minutes and 18 already-measured mutants before
// the harness aborted on it, so the harness gained a PRE-FLIGHT: every mutant
// is applied and piped through `node --check -` before the baseline runs, which
// answers presence, uniqueness and syntax in seconds rather than mid-run.
// `node --check -` was itself measured to discriminate in both directions
// before being trusted — a pre-flight that always passes is the dangerous
// direction.
// 34 mutants, 34 killed, 0 survived; 2 CONTROLS, 0 false-failed, EXIT=0,
// against a declared 27p/0f/0s baseline. The exit status IS captured now
// (`echo "EXIT=$?"` appended inside the log file), which the previous round
// said to do and did not: reading the summary is reading the predicate, since
// `survived` and `falseFails` are the same two counters the summary prints and
// the exit code is set from, but a run that dies before printing anything at
// all is only distinguishable by the status.
// Every test here passed on its FIRST run, which
// under this repo's own rule is worth nothing — five earlier rounds in this
// file's ledger record a test found detecting rather than encoding. So each
// radius below is a measurement, not a reading, and several came back
// different from what was written first.
//
//   V1  restore APPLIES without reverting (the defect the feature exists to
//       avoid: a blend of two versions under one name)              radius 2
//   V2  the state-edit clause is dropped from the save blocker      radius 1
//   V3  the blocker returns "" instead of a reason — the save then
//       PROCEEDS, admitting every state the blocker refuses         radius 9
//   V4  restore ignores the selector scope and applies anywhere     radius 1
//   V5  a duplicate name pushes a second entry instead of updating  radius 1
//   V6  the button label ignores the duplicate and always says Save radius 1
//   V7  the id sequence restarts at 0 after hydrate                 radius 2
//   V8  hydrate does not run at boot (versions die on reload)      radius 10
//   V9  syncActiveStyleDraftKey stops syncing the section, so it
//       never appears after a commit — the shipped-once defect      radius 27
//   V10 hydrate keeps the STORED ids (the pre-Sol behaviour)        radius 1
//   V11 the edits SHAPE check is dropped (a null edit throws, and
//       the read's catch then discards the whole list)              radius 1
//   V12 the component clause is dropped from the save blocker       radius 1
//   V13 restore stops refusing component scope (the FUNCTION guard) radius 1
//   V14 nothing evicts on save, so the list grows past the cap      radius 1
//   V15 an instruction blocks the save (the accepted decision,
//       inverted — so the decision is pinned, not just written)     radius 1
//   V16 the cap is not applied to hand-edited storage on the way IN radius 1
//   V17 a restore the scope refuses still renders as a live button
//       (the MARKUP guard, at render time)                          radius 3
//   V18 the note always explains the SAVE refusal, never the
//       restore one                                                 radius 1
//   V19 the stored VALUE is never checked against CSS (the
//       destructive no-op restore)                                  radius 3
//   V20 a stale component-scope mirror stops blocking either a
//       save or a restore                                           radius 1
//   V21 eviction goes back to a GLOBAL slice (the save side)        radius 1
//   V22 the READ-side cap goes back to a global slice               radius 1
//   V23 the empty-edits refusal is dropped (`.every()` is vacuously
//       true on {})                                                 radius 1
//   V24 the no-CSS.supports fallback returns true again — the
//       destructive no-op, handed straight back                     radius 5
//   V25 restore stops asking whether it can apply anything, so an
//       in-session version clears the live work and applies none    radius 2
//   V26 the RECEIVING direction of the stale mirror stops being
//       checked                                                     radius 1
//   V27 a persist throw is swallowed again, so a save that will not
//       survive a reload looks identical to one that will           radius 1
//   V28 `CSS.supports` answers alone again whenever it is present,
//       so a lying `true` smuggles garbage past the probe        radius 4
//   V29 the appliability check goes back to `.some`, so a partial
//       restore assembles a blend                                radius 1
//   V30 the support verdict is never memoized, so a FLIPPING
//       CSS.supports reassembles the destructive no-op out of two
//       individually honest answers                                 radius 1
//   V31 the probe looks up setProperty live again (a SELECTIVE
//       wrapper launders garbage past it while the apply path,
//       which round 4 said fails "in the same stroke", works)       radius 1
//   V32 the probe looks up getPropertyValue live again (a wrapper
//       forges the parser-rejected signal from the other side)      radius 1
//   V33 the memo goes GLOBAL again, so the round-4 pre-restore
//       guard loses its reachability                                radius 2
//   V34 the probe looks up the `style` ACCESSOR live again (a decoy
//       declaration already carrying the property forges a
//       non-empty read)                                             radius 1
//   C1  CONTROL: findStyleVersion renames its callback binding       green
//   C2  CONTROL: deleteStyleVersion renames its length snapshot      green
//
// A radius is a fact about a MECHANISM, never evidence of independent guards.
// V9's 27 is every test in the file, because it is the entry point they all
// run through — the section is simply never there — and that is one mechanism,
// not twenty-seven. V3's 9 is one blocker feeding the note, the section's
// visibility and both refusals. V8's 10 is every test that reloads the page.
// THIS PARAGRAPH IS A CLAIM AND IT DECAYED ONCE: for a full round it still
// quoted 16/5/7 while the table above it said 21/6/9, which is why it is now
// re-derived from the measurement rather than patched. FIVE radii moved from
// round 5 to round 5b — count them in the list below rather than trusting this
// sentence, which said "four" over a five-item list until it was re-read — and
// every one of them moved because the round added four tests, with no guard
// added to any of them:
//   V1  1→2 and V9 23→27, which widen with any test that restores (V1) or that
//       needs the section to exist at all (V9);
//   V3  6→9, the blocker's own shared radius, for the same reason;
//   V24 2→5 and V28 1→4 — the two `CSS.supports` mutants — because the three
//       new POISON tests all stub `CSS.supports` to `() => true` so the AND
//       cannot reject before the probe runs. That is the single most readable
//       thing in this table: the four probe mutants (V31/V32/V34, plus V24
//       which removes the probe entirely) sit at radius 1, 1, 1 and 5, and the
//       gap is exactly the difference between removing one PRIMITIVE and
//       removing the probe.
//
// V30 vs V33 is what makes the memo's SCOPE measured rather than restated.
// V30 deletes the memo and reddens the flip test alone; V33 makes it GLOBAL —
// which closes the same flip — and reddens the two in-session refusal tests
// instead, and NOT the flip test. A global memo freezes verdicts taken at
// commit and hydrate time, so no version that can exist has a verdict left to
// change, which makes the round-4 pre-restore guard unreachable. The scope is
// the fix; closing the flip is not.
//
// V31 / V32 / V34 are three levers on three objects, not one rule restated:
// two data properties on CSSStyleDeclaration.prototype and one ACCESSOR on
// HTMLElement.prototype, which needs Object.defineProperty rather than an
// assignment to poison. V34 exists because the first version of that fix
// captured the two methods, then read `probeCreateDiv().style` LIVE — the same
// hole one line over, past a green suite and a green 33-mutant matrix, found
// by READING while writing the next adverse brief.
//
// THE THREE POISON FIXTURES ARE SELECTIVE IN TWO DIFFERENT SENSES, and saying
// otherwise was a round-6 P3 that had also been copied into CLAUDE.md. Only
// V34's is RECEIVER-selective — `!this.isConnected && this.tagName === "DIV" &&
// this.attributes.length === 0`, which is exactly the shape the probe builds
// and nothing the apply path ever touches. V31 matches on the (property, value)
// PAIR and V32 on an EMPTY letter-spacing read, and neither can do better,
// because a CSSStyleDeclaration exposes no owner element — there is no
// expression inside `setProperty` that can ask whether `this` belongs to a
// detached div. The consequence is real and is not hidden: under the V31 mutant
// the poison also launders the CONNECTED #card apply to `2px`, and under V32 it
// also rewrites the target's own original-inline capture at
// browser/raven-grab.js:4284.
// THAT DOES NOT WEAKEN THE REFUTATION OF ROUND 4, and the reason is worth
// stating rather than assuming. Round 4's residual said the same poisoning
// defeats the apply path "in the same stroke", so nothing lands and nothing is
// destroyed. What each fixture measures is the opposite on both halves: every
// value OTHER than the probe's own garbage commits natively — that is each
// test's both-directions control, where a supported value still commits and
// saves with the poison installed — and for the garbage pair itself something
// DOES land, a `2px` the user never typed. A value the user never typed
// arriving on the element is precisely the destruction round 4 said could not
// happen.
//
// Three pairs are worth reading as pairs, because each looks like one
// mechanism and is measurably two:
//   * V14 / V16 — same single test, separated only by which half of the cap
//     they break, which is why the cap fixture seeds 101 entries rather than
//     exactly 100: at exactly 100 the read side is never exercised.
//   * V13 / V17 — the same refusal at two layers. The stale-mirror test asserts
//     `restoreDisabled: [true]`, which is the MARKUP guard (V17, driven by
//     styleVersionRestoreBlocker() at render time); V13 removes the guard
//     INSIDE restoreStyleVersion, leaves the button still rendered disabled,
//     and so reddens only the component-scope restore test.
//   * V21 / V22 — the per-selector cap is ONE rule enforced at TWO doors, and a
//     single mutant would leave whichever door it did not touch unmeasured.
//     The two-phase fixture is what makes both reachable: the read-side
//     precondition (#card's own version survived the READ) catches V22, and the
//     post-save assertion (#other keeps all 100) catches V21. The first fixture
//     draft seeded only #other and was structurally blind to V22.
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

// Full probe, matching test/grab-overlay-spring-control.test.mjs: bind a
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
    const probeDir = await mkdtemp(path.join(tmpdir(), 'raven-version-probe-'));
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

// Both targets sit in the horizontal gap between the docked panels so a raw
// mouse click reaches them. `#card` carries a :hover rule so the panel renders a
// hover row — that is what the refusal test needs, and without it that test
// would measure nothing.
const VIEWPORT = { width: 1280, height: 760 };
const FIXTURE_BODY = `<style>
  body { margin: 0; font: 16px system-ui; }
  .box { position: absolute; left: 440px; width: 360px; padding: 24px; background: #eef; }
  #card { top: 100px; font-size: 16px; opacity: 1; }
  #card:hover { opacity: 0.9; }
  #other { top: 260px; font-size: 16px; }
</style>
<div id="card" class="box">Card copy</div>
<div id="other" class="box">Other copy</div>`;

async function withLocalOverlay(fn) {
  if (!bridge) bridge = await import('../dist/grab-bridge.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-versions-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath);
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>versions host</title></head><body>${FIXTURE_BODY}${session.script_tag}</body></html>`);
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT });
    const url = 'http://127.0.0.1:' + fixture.address().port + '/';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForOverlay(page);
    return await fn(page, url);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => fixture.close(resolve));
  }
}

function waitForOverlay(page) {
  return page.waitForFunction(
    () => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot),
    null,
    { timeout: 15000 }
  );
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

// Open the style editor by clicking the VALUE cell, then type and commit with a
// real Enter. Setting styleEdits by hand would skip commitStyleEdit, which is
// the function restore has to agree with — the point is that both go through it.
async function editStyle(page, property, value, styleState) {
  const point = await shadowEval(page, (root, arg) => {
    const rowSelector = arg.state
      ? `li[data-style-property="${arg.property}"][data-style-state="${arg.state}"]`
      : `li[data-style-property="${arg.property}"]:not([data-style-state])`;
    const cell = root.querySelector(rowSelector + ' code[data-style-value]');
    if (!cell) return null;
    cell.scrollIntoView({ block: 'center' });
    const rect = cell.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { property, state: styleState || null });
  assert.ok(point, `no ${styleState ? styleState + ' ' : ''}style row rendered for ${property}`);

  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((arg) => {
    const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
    const rowSelector = arg.state
      ? `li[data-style-property="${arg.property}"][data-style-state="${arg.state}"]`
      : `li[data-style-property="${arg.property}"]:not([data-style-state])`;
    const row = root.querySelector(rowSelector);
    return Boolean(row && row.querySelector('.raven-grab-style-editor input'));
  }, { property, state: styleState || null }, { timeout: 5000 });

  await shadowEval(page, (root, arg) => {
    const rowSelector = arg.state
      ? `li[data-style-property="${arg.property}"][data-style-state="${arg.state}"]`
      : `li[data-style-property="${arg.property}"]:not([data-style-state])`;
    const input = root.querySelector(rowSelector + ' .raven-grab-style-editor input');
    input.focus();
    input.value = arg.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { property, value, state: styleState || null });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
}

async function nameAndSave(page, name) {
  await shadowEval(page, (root, arg) => {
    const field = root.querySelector('[data-version-name]');
    if (!field) throw new Error('the Versions name field is not rendered');
    field.focus();
    field.value = arg;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, name);
  const point = await shadowEval(page, (root) => {
    const button = root.querySelector('[data-save-version]');
    if (!button || button.disabled) return null;
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  assert.ok(point, 'the Save button is missing or disabled — nothing to press');
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(60);
}

function versionsState(page) {
  return shadowEval(page, (root) => {
    const section = root.querySelector('.raven-grab-versions');
    const rows = Array.from(root.querySelectorAll('[data-restore-version]'));
    const button = root.querySelector('[data-save-version]');
    const note = root.querySelector('.raven-grab-version-note');
    return {
      names: rows.map((row) => row.textContent.trim()),
      ids: rows.map((row) => Number(row.getAttribute('data-restore-version'))),
      restoreDisabled: rows.map((row) => row.disabled),
      // Visible, not merely present: the section is always in the DOM so a
      // commit can reveal it without a re-render, so presence says nothing.
      sectionVisible: Boolean(section) && !section.hidden,
      saveLabel: button ? button.textContent.trim() : null,
      saveDisabled: button ? button.disabled : null,
      note: note && !note.hidden ? note.textContent.trim() : null
    };
  });
}

function inlineStyles(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      fontSize: el.style.getPropertyValue('font-size'),
      opacity: el.style.getPropertyValue('opacity'),
      // padding is the discriminator for a PARTIAL restore: it is what the
      // revert half clears, and every refusal path leaves it alone.
      padding: el.style.getPropertyValue('padding')
    };
  }, selector);
}

async function typeInstruction(page, text) {
  await shadowEval(page, (root, arg) => {
    const field = root.querySelector('[data-instruction]');
    if (!field) throw new Error('the Instructions textarea is not rendered');
    field.focus();
    field.value = arg;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, text);
  await page.waitForTimeout(30);
}

function scopeValue(page) {
  return shadowEval(page, (root) => {
    const group = root.querySelector('.raven-grab-scope');
    return group ? group.getAttribute('data-scope-value') : null;
  });
}

const STYLE_VERSION_STORE_KEY = 'raven-grab-style-versions-v1';

function storedVersions(page) {
  return page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || '[]'), STYLE_VERSION_STORE_KEY);
}

function seedStoredVersions(page, entries) {
  return page.evaluate(
    ({ key, value }) => window.sessionStorage.setItem(key, JSON.stringify(value)),
    { key: STYLE_VERSION_STORE_KEY, value: entries }
  );
}

// Storage is HAND-EDITABLE — that is the whole premise of the four tests below —
// but the SELECTOR the overlay mints for a node is its own business, so every
// seed is built by saving one real version and rewriting the entry that comes
// back. Hand-writing `#card` would pass today and measure nothing the day the
// selector strategy changes.
async function reloadAndSelect(page, selector) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForOverlay(page);
  await selectElement(page, selector);
}

async function clickVersionControl(page, attribute, id) {
  const point = await shadowEval(page, (root, arg) => {
    const button = root.querySelector(`[${arg.attribute}="${arg.id}"]`);
    if (!button) return null;
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { attribute, id });
  assert.ok(point, `no [${attribute}="${id}"] control rendered`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(60);
}

// Fires the delegated click handler on a control WITHOUT going through the
// pointer, so a control the markup has disabled can still be driven. A real
// mouse click on a disabled button is swallowed by the platform and `.click()`
// is a no-op on one, but `dispatchEvent` is not filtered — which is exactly what
// separates the function-level refusal from the markup-level one. Two
// mechanisms, two measurements; a test that only ever clicks would report the
// disabled attribute as proof of a guard that had been deleted.
async function dispatchVersionControl(page, attribute, id) {
  const fired = await shadowEval(page, (root, arg) => {
    const button = root.querySelector(`[${arg.attribute}="${arg.id}"]`);
    if (!button) return false;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    return true;
  }, { attribute, id });
  assert.ok(fired, `no [${attribute}="${id}"] control rendered`);
  await page.waitForTimeout(60);
}

function skipUnlessBrowser(t) {
  if (chromiumAvailable) return false;
  t.skip(`browser unavailable for overlay style-version test; probe said: ${chromiumProbeError && chromiumProbeError.message}`);
  return true;
}

// V1 — the load-bearing one. Restoring a version must UNDO the edits made since
// it was saved, not merely re-apply its own. Without the revert half the element
// carries font-size 24px AND opacity .3 while the row says "big type".
test('restoring a version reverts the edits made after it, not just re-applies its own', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'big type');

    // A second experiment on top: a property the saved version does NOT carry.
    await editStyle(page, 'opacity', '0.3');
    const mixed = await inlineStyles(page, '#card');
    assert.equal(mixed.opacity, '0.3', 'precondition: the second experiment really is on the element');

    const saved = await versionsState(page);
    assert.deepEqual(saved.names, ['big type'], 'precondition: exactly the saved version is listed');

    await clickVersionControl(page, 'data-restore-version', saved.ids[0]);

    const after = await inlineStyles(page, '#card');
    assert.equal(after.fontSize, '24px', 'the version\'s own edit is applied');
    assert.equal(after.opacity, '', 'and the edit made after it is REVERTED, not left blended underneath');
  });
});

// V2/V3 — the refusal, and the fact that it explains itself. A hover edit means
// the draft holds something a version cannot carry, so saving is refused with a
// reason printed in the panel rather than a Save button that silently no-ops.
test('a draft carrying a hover edit refuses to save and says why', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');

    const before = await versionsState(page);
    assert.equal(before.note, null, 'precondition: a plain style edit is saveable, with no refusal note');
    assert.equal(before.saveDisabled, true, 'precondition: Save is disabled only because the name is empty here');

    await editStyle(page, 'opacity', '0.5', 'hover');

    const after = await versionsState(page);
    assert.ok(after.note, 'the refusal is printed rather than left as a dead button');
    assert.match(after.note, /hover\/focus/, 'and the note names the edit kind that blocks it');
    assert.equal(after.saveDisabled, true, 'Save stays disabled while the draft holds an unversionable edit');
  });
});

// V4 — selector scope. A version saved off #card must not be offered on #other:
// a padding set lifted from one element and dropped on another means nothing.
test('a version is scoped to the element it was saved from', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'big type');
    assert.deepEqual((await versionsState(page)).names, ['big type'], 'precondition: it is listed on its own element');

    await selectElement(page, '#other');
    const elsewhere = await versionsState(page);
    assert.deepEqual(elsewhere.names, [], 'the other element does not list it');

    // And it is not merely hidden: driving a restore by id from the other
    // element must change nothing on either node.
    await editStyle(page, 'font-size', '30px');
    await page.evaluate(() => {
      const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
      const host = root.querySelector('.raven-grab-versions');
      if (!host) return;
      const probe = document.createElement('button');
      probe.setAttribute('data-restore-version', '1');
      probe.id = 'raven-version-probe';
      host.appendChild(probe);
    });
    await clickVersionControl(page, 'data-restore-version', 1);
    const other = await inlineStyles(page, '#other');
    assert.equal(other.fontSize, '30px', 'a cross-element restore is refused, leaving this element\'s own edit alone');
  });
});

// V5/V6 — saving the same name again UPDATES in place, and the button says so
// BEFORE it is pressed. Overwriting silently under a "Save" label is the
// preview-disagrees-with-action shape this repo has already shipped once.
test('re-using a name updates that version in place, and the button says Update first', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'big type');

    await editStyle(page, 'font-size', '32px');
    await shadowEval(page, (root) => {
      const field = root.querySelector('[data-version-name]');
      field.focus();
      field.value = 'big type';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    const armed = await versionsState(page);
    assert.equal(armed.saveLabel, 'Update', 'the button warns that this overwrites before it is pressed');

    await nameAndSave(page, 'big type');
    const after = await versionsState(page);
    assert.deepEqual(after.names, ['big type'], 'one entry, not two');

    // And the update took: restoring now yields 32px, the value at update time.
    await editStyle(page, 'font-size', '12px');
    await clickVersionControl(page, 'data-restore-version', after.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '32px', 'the stored edits were replaced, not kept');
  });
});

// V7/V8 — versions survive a reload, and the id sequence carries on from what
// hydrate renumbered rather than restarting. Restarting collides with a live id
// immediately, and every restore or delete afterwards targets the wrong version.
// (Before the Sol round this test named the stored MAX id; hydrate no longer
// reads stored ids at all — see hydrateStyleVersions — so what it pins now is
// that the sequence is not RE-derived after a delete.)
test('versions survive a reload and new ids do not collide with stored ones', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page, url) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'first');
    await editStyle(page, 'font-size', '32px');
    await nameAndSave(page, 'second');

    const seeded = await versionsState(page);
    assert.deepEqual(seeded.names, ['first', 'second'], 'precondition: two versions before the reload');

    // Delete the FIRST, so the surviving entry's id is greater than the count —
    // the exact state a length-seeded sequence gets wrong.
    await clickVersionControl(page, 'data-delete-version', seeded.ids[0]);
    assert.deepEqual((await versionsState(page)).names, ['second'], 'precondition: one version, holding the higher id');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForOverlay(page);
    await selectElement(page, '#card');

    const reloaded = await versionsState(page);
    assert.deepEqual(reloaded.names, ['second'], 'the surviving version came back after the reload');

    await editStyle(page, 'font-size', '12px');
    await nameAndSave(page, 'third');
    const grown = await versionsState(page);
    assert.deepEqual(grown.names, ['second', 'third'], 'the new version joined it rather than replacing it');
    assert.equal(new Set(grown.ids).size, 2, 'and it minted a fresh id rather than colliding with the stored one');

    // The collision is only harmful if it misroutes an action, so prove that:
    // deleting "third" must leave "second" alone.
    await clickVersionControl(page, 'data-delete-version', grown.ids[1]);
    assert.deepEqual((await versionsState(page)).names, ['second'], 'the delete hit the version it named');
  });
});

// The empty state: an untouched panel must not grow chrome for a feature the
// user has not started. This is the one assertion that fails if the section
// renders unconditionally.
test('the Versions section is absent until there is something to name', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    const untouched = await versionsState(page);
    assert.equal(untouched.sectionVisible, false, 'no Versions chrome before any style edit');

    await editStyle(page, 'font-size', '24px');
    assert.equal((await versionsState(page)).sectionVisible, true, 'and it appears as soon as there is a change to name');
  });
});

// ---------------------------------------------------------------------------
// The Sol round. Six findings against a feature that had already passed a green
// suite and a 9-mutant matrix — the matrix measured the mechanisms it named and
// was blind to hand-edited storage, to component scope, and to its own corpus.
// Five are guarded below; the sixth was a harness fix.
// ---------------------------------------------------------------------------

// V12 — component scope MIRRORS every write onto the matching siblings, and a
// version stores neither the scope nor the member list. Saving one under
// "All siblings" and restoring it under "This one" reverts the primary and
// leaves every sibling carrying the previous experiment: the blend this feature
// exists to prevent, one level out from the property loop that prevents it.
test('a draft in component scope refuses to save and says why', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await shadowEval(page, (root) => {
      const field = root.querySelector('[data-version-name]');
      field.focus();
      field.value = 'scoped';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });

    // Both preconditions matter. A named, saveable draft is what makes the
    // disabled assertion below mean "the scope blocked it" rather than "the name
    // is empty" — the reading every other refusal in this file would also give.
    const before = await versionsState(page);
    assert.equal(before.note, null, 'precondition: an instance-scope draft is saveable');
    assert.equal(before.saveDisabled, false, 'precondition: Save is live before the scope switch');

    await clickVersionControl(page, 'data-edit-scope', 'component');
    assert.equal(await scopeValue(page), 'component', 'precondition: the scope really switched');

    const after = await versionsState(page);
    assert.ok(after.note, 'the refusal is printed rather than left as a dead button');
    assert.match(after.note, /instance styles only/, 'and the note names the scope as the reason');
    assert.equal(after.saveDisabled, true, 'Save is refused while the draft would mirror onto siblings');
  });
});

// V13 — the other half of that rule. Refusing at the SAVE site alone is not
// enough: the scope can be switched AFTER a version was saved, and the restore
// would then mirror every commitStyleEdit onto the siblings while reverting only
// the primary. The sibling assertion is the one that names the harm.
test('a restore is refused while the scope would mirror it onto siblings', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'small type');
    await editStyle(page, 'font-size', '32px');

    await clickVersionControl(page, 'data-edit-scope', 'component');
    assert.equal(await scopeValue(page), 'component', 'precondition: the scope really switched');
    assert.equal((await inlineStyles(page, '#other')).fontSize, '', 'precondition: the sibling carries nothing yet');

    const saved = await versionsState(page);
    assert.deepEqual(saved.names, ['small type'], 'precondition: the version is still listed');
    // Dispatched, not clicked. The row is disabled under this scope (V17), so a
    // pointer click would be swallowed by the platform and this test would then
    // pass with restoreStyleVersion's own guard deleted — measuring the markup
    // twice and the function not at all.
    await dispatchVersionControl(page, 'data-restore-version', saved.ids[0]);

    assert.equal((await inlineStyles(page, '#card')).fontSize, '32px', 'the restore is refused, leaving the live draft alone');
    assert.equal((await inlineStyles(page, '#other')).fontSize, '', 'and nothing was mirrored onto the sibling');
  });
});

// V11 — `typeof x === "object"` is the weakest question you can ask of a nested
// structure. `{"edits":{"color":null}}` passes it and then throws out of the
// restore CLICK HANDLER: a dead button with a console error rather than a
// refusal. The entry is dropped at read time instead.
test('a stored entry whose edits are malformed is dropped rather than rendered', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 1, 'precondition: exactly the real save is in storage');
    await seedStoredVersions(page, [
      stored[0],
      { id: 99, name: 'malformed', selector: stored[0].selector, edits: { color: null } }
    ]);

    await reloadAndSelect(page, '#card');
    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['good'], 'the malformed entry never reaches the list');

    // And the panel is ALIVE, not merely missing a row: the surviving version
    // still restores. A filter that took the whole list down would satisfy the
    // assertion above and fail this one.
    await editStyle(page, 'font-size', '12px');
    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '24px', 'the good version still restores');
  });
});

// V10 — hydrate RENUMBERS rather than validating. Stored ids are hand-editable,
// and no filter on the stored value catches the nasty one: a stored
// Number.MAX_SAFE_INTEGER is a perfectly VALID safe integer, after which every
// later save mints 9007199254740992 because the increment stops moving at the
// precision limit. This fixture is both bad shapes at once — duplicated AND at
// the limit — because they arrive through the same door.
test('hand-edited stored ids cannot misroute a delete or stall the sequence', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'a');
    await editStyle(page, 'font-size', '32px');
    await nameAndSave(page, 'b');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 2, 'precondition: two real saves in storage');
    await seedStoredVersions(page, stored.map((entry) => ({ ...entry, id: Number.MAX_SAFE_INTEGER })));

    await reloadAndSelect(page, '#card');
    const hydrated = await versionsState(page);
    assert.deepEqual(hydrated.names, ['a', 'b'], 'both entries survive the read');
    assert.equal(new Set(hydrated.ids).size, 2, 'and they hold distinct ids despite the storage saying otherwise');

    // The collision is only harmful if it misroutes an action, so prove that.
    await clickVersionControl(page, 'data-delete-version', hydrated.ids[0]);
    assert.deepEqual((await versionsState(page)).names, ['b'], 'the delete hit one row, not both');

    // The stall is the other half: two further saves must mint two distinct ids.
    await editStyle(page, 'font-size', '18px');
    await nameAndSave(page, 'c');
    await editStyle(page, 'font-size', '20px');
    await nameAndSave(page, 'd');
    const grown = await versionsState(page);
    assert.deepEqual(grown.names, ['b', 'c', 'd'], 'both new versions joined the list');
    assert.equal(new Set(grown.ids).size, 3, 'each with an id of its own');
  });
});

// V14 — the cap is enforced in MEMORY at the save site, so the list on screen is
// the list that reloads. Trimming only on the way to storage means the 101st
// save renders a full list and then the OLDEST row silently disappears on the
// next reload. For a feature whose entire job is "do not lose my work", a
// version vanishing without ever being seen to go is the one forbidden outcome.
test('the version cap is enforced in memory, so the list on screen is the list that reloads', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'seed');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 1, 'precondition: exactly the real save is in storage');
    const template = stored[0];
    // 101, not 100, so the READ-side cap is measured too: hand-edited storage
    // holding more than the limit must not render an unbounded list either.
    await seedStoredVersions(page, Array.from({ length: 101 }, (_v, index) => ({
      ...template, id: index + 1, name: 'v' + (index + 1)
    })));

    await reloadAndSelect(page, '#card');
    const full = await versionsState(page);
    assert.equal(full.names.length, 100, 'precondition: an over-long store is capped on the way in');
    assert.equal(full.names[0], 'v2', 'precondition: capping keeps the NEWEST, dropping the oldest');

    await editStyle(page, 'font-size', '30px');
    await nameAndSave(page, 'overflow');

    const capped = await versionsState(page);
    assert.equal(capped.names.length, 100, 'the rendered list stays at the cap');
    assert.equal(capped.names[0], 'v3', 'the oldest row is gone from the SCREEN, not just from storage');
    assert.equal(capped.names[99], 'overflow', 'and the new version is the one that took its place');
    assert.equal((await storedVersions(page)).length, 100, 'storage agrees with what is rendered');
  });
});

// V15 — the accepted decision, encoded rather than left as prose. Every blocker
// clause names something that CHANGES THE RENDERED ELEMENT; an instruction
// renders nothing — it is a note to the agent that travels with the send,
// unchanged by a restore. So it does NOT block a save, and a version is not a
// snapshot of the whole draft and does not claim to be.
test('an instruction does not block a save — a version is not a whole-draft snapshot', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await typeInstruction(page, 'make this read calmer');
    await editStyle(page, 'font-size', '24px');

    const state = await versionsState(page);
    assert.equal(state.note, null, 'no refusal note — an instruction is not an unversionable edit');

    await nameAndSave(page, 'calmer');
    assert.deepEqual((await versionsState(page)).names, ['calmer'], 'and the save went through');
  });
});

// V17/V18 — the done-gate's eyes-on pass found what all twelve tests above are
// blind to. Every one of them grades BEHAVIOUR, and the behaviour was correct:
// a restore under component scope was refused. What none of them looked at is
// the row, which rendered exactly as it does when it works — full contrast, hand
// cursor, a name that reads like a thing you press. Pressing it did nothing, on
// purpose, silently. Correctness and affordance are two claims, and a refusal
// nobody can SEE is the dead button this feature already fixed once at the Save
// site.
//
// The reload is load-bearing rather than scene-setting: it is what produces
// saved rows with NO live style edit, which is the only state where the two
// blockers disagree. styleVersionSaveBlocker answers "Change a style first —
// there is nothing to name yet" (true of the Save button, silent about the rows
// the scope just disabled) while styleVersionRestoreBlocker answers the scope.
// V18 makes the note take the save blocker unconditionally and turns exactly
// the note assertion red; without the reload both blockers return the same
// string and the mutant survives.
test('a restore refused by the scope renders as refused, and the note says which refusal', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'small type');

    await reloadAndSelect(page, '#card');
    const fresh = await versionsState(page);
    assert.deepEqual(fresh.names, ['small type'], 'precondition: the version survived the reload');
    assert.deepEqual(fresh.restoreDisabled, [false], 'precondition: the row is live under instance scope');
    assert.match(fresh.note, /Change a style first/, 'precondition: with no live edit the note is about SAVING');

    await clickVersionControl(page, 'data-edit-scope', 'component');
    assert.equal(await scopeValue(page), 'component', 'precondition: the scope really switched');

    const after = await versionsState(page);
    assert.deepEqual(after.names, ['small type'], 'the row is still listed — refused, not hidden');
    assert.deepEqual(after.restoreDisabled, [true], 'and it is rendered as refused rather than dead');
    assert.match(after.note, /instance styles only/, 'and the note names the refusal the user just hit');
  });
});

// V20 — `editScope` is a LIVE TOGGLE and says nothing about how the draft on
// screen was PRODUCED. Edit in component scope, switch back to instance, and
// componentScopeSiblingElements() returns [] — but nothing reverts the values
// already mirrored onto the siblings, so the screen is a blend while both
// blockers answered "" and the version named only the primary. The sibling
// assertion AFTER the switch back is what makes this a test about a STALE
// mirror rather than about the component scope V12/V13 already cover: under
// that scope the scope clause fires first and this one never speaks.
test('a stale component-scope mirror refuses both a save and a restore, and names the row', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '20px');
    await nameAndSave(page, 'base');

    const clean = await versionsState(page);
    assert.deepEqual(clean.restoreDisabled, [false], 'precondition: the row is live before the component excursion');

    await clickVersionControl(page, 'data-edit-scope', 'component');
    assert.equal(await scopeValue(page), 'component', 'precondition: the scope really switched');
    await editStyle(page, 'font-size', '24px');
    assert.equal((await inlineStyles(page, '#other')).fontSize, '24px', 'precondition: the edit really mirrored onto the sibling');

    await clickVersionControl(page, 'data-edit-scope', 'instance');
    assert.equal(await scopeValue(page), 'instance', 'precondition: the scope switched back');
    assert.equal((await inlineStyles(page, '#other')).fontSize, '24px', 'precondition: and NOTHING reverted the mirror — this is the stale state');

    // Name it, so `saveDisabled` below reads as the blocker rather than as the
    // empty-name refusal every other state in this file would also give.
    await shadowEval(page, (root) => {
      const field = root.querySelector('[data-version-name]');
      field.focus();
      field.value = 'blend';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(60);

    const stale = await versionsState(page);
    assert.match(stale.note, /All like this/, 'the refusal names the outstanding mirror, not the scope toggle');
    assert.match(stale.note, /font-size/, 'and names the row to clear, so the refusal is actionable');
    assert.equal(stale.saveDisabled, true, 'saving is refused while the screen is a blend');
    assert.deepEqual(stale.restoreDisabled, [true], 'and so is restoring — the same blend either way');
  });
});

// V19 — SHAPE IS NOT VALIDITY. A stored edit can be well-typed in every respect
// and still name a value CSS cannot parse. restoreStyleVersion CLEARS the live
// edits before applying, and commitStyleEdit refuses anything CSS.supports
// rejects, so the old filter let a hand-edited entry wipe the current work,
// apply nothing, and report success — a destructive no-op wearing a restore's
// clothes, which is the blend this feature exists to prevent arriving through
// storage rather than through the panel.
test('a stored version naming an unsupported CSS value is dropped, not restored destructively', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    // The fixture asserts itself: a value Chromium quietly started supporting
    // would make every assertion below pass while measuring nothing.
    const unsupported = await page.evaluate(() => ({
      color: CSS.supports('color', 'definitely-not-a-color'),
      size: CSS.supports('font-size', 'definitely-not-a-size')
    }));
    assert.equal(unsupported.color, false, 'precondition: the fixture value really is unsupported');
    // Two properties, because the check has to be PROPERTY-GENERIC (Sol round 3):
    // a single `color` fixture passes against an implementation that special-cases
    // colours and validates nothing else, which is a filter that only works on the
    // one property the test happened to pick.
    assert.equal(unsupported.size, false, 'precondition: the second fixture value is unsupported too');

    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 1, 'precondition: exactly the real save is in storage');
    // Built FROM a real edit object, so the entry differs from a legitimate one
    // in exactly the property under test. A hand-written shape would be caught
    // by the older type filter too and would measure that instead.
    const realEdit = Object.values(stored[0].edits)[0];
    await seedStoredVersions(page, [
      stored[0],
      { ...stored[0], id: 99, name: 'poisoned', edits: { color: { ...realEdit, newValue: 'definitely-not-a-color' } } },
      { ...stored[0], id: 98, name: 'poisoned-size', edits: { 'font-size': { ...realEdit, newValue: 'definitely-not-a-size' } } }
    ]);

    await reloadAndSelect(page, '#card');
    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['good'], 'the unrestorable entry never reaches the list');

    // And the panel is ALIVE rather than merely missing a row — a filter that
    // took the whole list down would satisfy the assertion above.
    await editStyle(page, 'font-size', '12px');
    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '24px', 'and the good version still restores');
  });
});

// V21 — the cap is PER SELECTOR because the panel is. A global trim deletes the
// oldest version of whatever element happens to own it, and that is an element
// the panel is not showing: the overflow save on #card removes #other's oldest
// with no row disappearing anywhere on screen, discovered only when #other is
// selected again, long after. V14's fixture seeds one selector and structurally
// cannot see this — a cap nobody can watch enforce itself is the silent loss
// this feature calls its one forbidden outcome.
test('the cap never evicts across selectors — a save on one element cannot delete another\'s', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'card version');
    await selectElement(page, '#other');
    await editStyle(page, 'font-size', '22px');
    await nameAndSave(page, 'other version');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 2, 'precondition: one real save per element');
    const cardTemplate = stored[0];
    const otherTemplate = stored[1];
    assert.notEqual(cardTemplate.selector, otherTemplate.selector, 'precondition: the two elements mint different selectors');

    // #other sits exactly AT the cap and #card holds one, so the total is 101 on
    // the way IN and 102 after the save — which is what exercises BOTH halves of
    // the per-selector rule. A global trim reaches #card's own version on the
    // read and #other's oldest on the write, and neither element is over the cap.
    await seedStoredVersions(page, [
      { ...cardTemplate, id: 1, name: 'kept' },
      ...Array.from({ length: 100 }, (_v, index) => ({
        ...otherTemplate, id: index + 2, name: 'o' + (index + 1)
      }))
    ]);

    await reloadAndSelect(page, '#card');
    assert.deepEqual((await versionsState(page)).names, ['kept'], 'precondition: #card\'s own version survived the READ — the cap is not global there either');

    await editStyle(page, 'font-size', '30px');
    await nameAndSave(page, 'mine');

    const after = await storedVersions(page);
    const others = after.filter((entry) => entry.selector === otherTemplate.selector);
    const cards = after.filter((entry) => entry.selector === cardTemplate.selector);
    assert.deepEqual(cards.map((entry) => entry.name), ['kept', 'mine'], 'the new version joined #card without displacing its own');
    assert.equal(others.length, 100, 'and #other keeps every one of its versions');
    assert.ok(others.some((entry) => entry.name === 'o1'), 'including the oldest — the one a global trim reaches first');
  });
});

// V23 — `.every()` IS VACUOUSLY TRUE ON AN EMPTY MAP, so `{"edits":{}}` passed
// the whole round-2 validity filter by having nothing to validate. The row then
// rendered with "0 changes", and restoring it cleared the live work and applied
// nothing — the round-2 destructive no-op arriving through the one shape the
// round-2 fix did not consider. A version naming no properties is not a version.
test('a stored version with an empty edits map is dropped, not rendered', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 1, 'precondition: exactly the real save is in storage');
    await seedStoredVersions(page, [
      stored[0],
      { ...stored[0], id: 97, name: 'empty', edits: {} }
    ]);

    await reloadAndSelect(page, '#card');
    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['good'], 'the empty entry never reaches the list');

    // And the panel is ALIVE rather than merely missing a row — a filter that
    // took the whole list down would satisfy the assertion above.
    await editStyle(page, 'font-size', '12px');
    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '24px', 'and the good version still restores');
  });
});

// V24 — the round-2 validity check fell back to `return true` whenever
// `window.CSS.supports` was unavailable, which hands the destructive no-op
// straight back on any engine that lacks it and on any page that overwrites it.
// The fallback asks the ENGINE the same question instead: a declaration the CSS
// parser rejects leaves the property unset. This test deletes CSS.supports
// BEFORE the overlay boots, so the read filter has nothing but the probe.
test('with CSS.supports missing, an unsupported stored value is still dropped by the engine probe', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 1, 'precondition: exactly the real save is in storage');
    const realEdit = Object.values(stored[0].edits)[0];
    await seedStoredVersions(page, [
      stored[0],
      { ...stored[0], id: 96, name: 'poisoned', edits: { color: { ...realEdit, newValue: 'definitely-not-a-color' } } }
    ]);

    // Before any script on the next navigation, so hydration cannot see it.
    await page.addInitScript(() => { delete window.CSS.supports; });
    await reloadAndSelect(page, '#card');
    assert.equal(
      await page.evaluate(() => typeof window.CSS.supports),
      'undefined',
      'precondition: the fixture really removed CSS.supports before the overlay booted'
    );

    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['good'], 'the unrestorable entry is dropped by the probe, not admitted by a fallback');

    // The probe has to answer BOTH ways or it is a filter that rejects
    // everything, which would satisfy the assertion above while deleting the
    // user's real work.
    await editStyle(page, 'font-size', '12px');
    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '24px', 'and a supported value still commits and restores');
  });
});

// V25 — the read-side filter structurally cannot cover a version saved in THIS
// session: it never passes through isStyleVersionEdits. So restore asks, before
// touching anything, whether it can apply EVERY property — with the same
// predicate the commit gate uses, so the two cannot disagree. (This comment
// used to say "even one property"; that is the pre-round-4 `.some()` contract
// and V29 is the mutant that reinstates it.) Without that
// guard the revert half runs, the apply half refuses, and the user's live work
// on the OTHER property is gone under a row that reported success.
test('an in-session version that can no longer apply refuses instead of clearing the live work', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'opacity', '0.5');
    await nameAndSave(page, 'faded');
    // A DIFFERENT property, so the observable is the revert half. Editing the
    // version's own property instead would make a refused commit and a refused
    // restore look identical, and the test would pass against the defect.
    await editStyle(page, 'font-size', '12px');
    assert.equal((await inlineStyles(page, '#card')).fontSize, '12px', 'precondition: the live edit landed');

    const before = await versionsState(page);
    assert.deepEqual(before.names, ['faded'], 'precondition: the in-session version is listed');
    assert.deepEqual(before.restoreDisabled, [false], 'precondition: and live — the read filter never saw it');

    await page.evaluate(() => { window.CSS.supports = () => false; });
    assert.equal(
      await page.evaluate(() => CSS.supports('opacity', '0.5')),
      false,
      'precondition: the fixture really made every value unsupported'
    );

    await clickVersionControl(page, 'data-restore-version', before.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '12px', 'the live edit survives — the restore refused rather than clearing and applying nothing');
    assert.deepEqual((await versionsState(page)).names, ['faded'], 'and the row is still there to try again');
  });
});

// V28 — round 3 replaced the ABSENT-`CSS.supports` fallback with an engine probe
// and left `CSS.supports` as the PRIMARY path, returning its answer verbatim
// whenever it existed. So a page that REPLACES it with a liar was never probed
// at all (Sol round 4). The V24 fixture cannot see that: deleting the function
// is precisely the case that already reached the probe, and the two fixtures
// differ by one word. The check is an AND now, so a hostile `CSS.supports` can
// only ever make it stricter — never looser, which is the only direction that
// destroys work.
test('a page that replaces CSS.supports with a liar cannot smuggle a bad stored value past the probe', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');

    const stored = await storedVersions(page);
    assert.equal(stored.length, 1, 'precondition: exactly the real save is in storage');
    const realEdit = Object.values(stored[0].edits)[0];
    await seedStoredVersions(page, [
      stored[0],
      { ...stored[0], id: 96, name: 'poisoned', edits: { color: { ...realEdit, newValue: 'definitely-not-a-color' } } }
    ]);

    // A LYING CALLABLE, not a deletion — installed before any script on the next
    // navigation, so the overlay hydrates with it already in place.
    await page.addInitScript(() => { window.CSS.supports = () => true; });
    await reloadAndSelect(page, '#card');
    assert.equal(
      await page.evaluate(() => CSS.supports('color', 'definitely-not-a-color')),
      true,
      'precondition: the fixture really made CSS.supports lie, and it survived the boot'
    );

    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['good'], 'the probe overrules the lie and the unrestorable entry is still dropped');

    // Both directions, or a check that refused everything would satisfy the
    // assertion above while deleting the user's real work.
    await editStyle(page, 'font-size', '12px');
    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    assert.equal((await inlineStyles(page, '#card')).fontSize, '24px', 'and a supported value still commits and restores under the lie');
  });
});

// V29 — a restore is ALL-OR-NOTHING. Round 3's pre-restore guard used `.some()`,
// so ONE appliable property admitted the whole restore: the revert half ran over
// everything, the appliable half landed, and the rest was refused by
// commitStyleEdit with its return value discarded — leaving the saved opacity,
// the newer font-size and no padding at all on screen under one version's name
// (Sol round 4). That is the blend the feature exists to prevent, assembled by
// the guard that was supposed to prevent it. V25 forces EVERY check false, so
// the mixed branch sits outside it entirely.
test('a restore that can apply only PART of its version refuses instead of assembling a blend', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'opacity', '0.5');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'both');

    // Live work made AFTER the save: one property the version also names, and
    // one it does not. The padding is the discriminator — it is what the revert
    // half clears, and no refusal path touches it.
    await editStyle(page, 'font-size', '12px');
    await editStyle(page, 'padding', '20px');
    const before = await inlineStyles(page, '#card');
    assert.equal(before.fontSize, '12px', 'precondition: the newer font-size landed');
    assert.equal(before.padding, '20px', 'precondition: and the padding the version does not name');

    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['both'], 'precondition: the in-session version is listed');
    assert.deepEqual(listed.restoreDisabled, [false], 'precondition: and live — the read filter never saw it');

    // MIXED, not uniformly false: opacity still applies, font-size does not.
    await page.evaluate(() => { window.CSS.supports = (property) => property === 'opacity'; });
    assert.deepEqual(
      await page.evaluate(() => [CSS.supports('opacity', '0.5'), CSS.supports('font-size', '24px')]),
      [true, false],
      'precondition: the fixture really split the version\'s two properties'
    );

    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    const after = await inlineStyles(page, '#card');
    assert.equal(after.padding, '20px', 'the revert never ran — the restore refused rather than clearing what it could not replace');
    assert.equal(after.fontSize, '12px', 'and the live font-size survives, because a version that cannot fully apply is not applied at all');
    assert.deepEqual((await versionsState(page)).names, ['both'], 'and the row is still there to try again');
  });
});

// V26 — the other direction of the stale mirror, and it is a DIFFERENT question.
// outstandingScopeSiblingPreview asks whether the element on screen OWNS a
// mirror; this asks whether it is RECEIVING one. A mirror belongs to the draft
// that authored it and drafts are stashed per selection, so #card's bookkeeping
// is in styleDrafts — invisible to a check that reads only the live globals —
// while #other is on screen showing a value #card authored. That is the blend
// both blockers refuse, arriving under another selection.
test('an element receiving another selection\'s mirror refuses both a save and a restore', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    // #other needs a version of its own, or restoreDisabled has nothing to say.
    // On a DIFFERENT property from the mirror, so re-selecting #other cannot
    // re-apply its own draft over the stale value the test is about.
    await selectElement(page, '#other');
    await editStyle(page, 'opacity', '0.5');
    await nameAndSave(page, 'other base');

    await selectElement(page, '#card');
    await clickVersionControl(page, 'data-edit-scope', 'component');
    assert.equal(await scopeValue(page), 'component', 'precondition: the scope really switched');
    await editStyle(page, 'font-size', '24px');
    assert.equal((await inlineStyles(page, '#other')).fontSize, '24px', 'precondition: the edit really mirrored onto the sibling');
    await clickVersionControl(page, 'data-edit-scope', 'instance');
    assert.equal(await scopeValue(page), 'instance', 'precondition: the scope switched back');

    await selectElement(page, '#other');
    assert.equal((await inlineStyles(page, '#other')).fontSize, '24px', 'precondition: #other still carries the value #card authored — this is the stale state');

    // Name it, so saveDisabled reads as the blocker rather than as the empty-name
    // refusal every other state in this file would also give.
    await shadowEval(page, (root) => {
      const field = root.querySelector('[data-version-name]');
      field.focus();
      field.value = 'received';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(60);

    const state = await versionsState(page);
    assert.match(state.note, /from another selection/, 'the refusal names the direction — received, not owned');
    assert.match(state.note, /font-size/, 'and names the row to clear, so the refusal is actionable');
    assert.equal(state.saveDisabled, true, 'saving is refused while this element shows another selection\'s edit');
    assert.deepEqual(state.restoreDisabled, [true], 'and so is restoring — the same blend either way');
  });
});

// V27 — a save that will NOT survive a reload must not look identical to one
// that will. The per-selector cap makes total growth (N selectors × 100) reach a
// quota at all, and swallowing the throw reported the failure as a success: the
// row is real (the in-memory save happened), only its durability is not, and
// that is exactly what the note has to say. It takes precedence over both
// blockers because it is the only one of the three about work already DONE.
test('a persist failure is reported in the panel, and the row still appears', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');

    // Only the versions key, and on the prototype — assigning to the Storage
    // instance is a named-property write, and taking setItem down wholesale
    // would break the overlay's own pending-draft persistence and measure that
    // instead.
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value: function (name, value) {
          if (name === key) {
            const err = new Error('quota');
            err.name = 'QuotaExceededError';
            throw err;
          }
          return original.call(this, name, value);
        }
      });
    }, STYLE_VERSION_STORE_KEY);

    await nameAndSave(page, 'mine');

    const state = await versionsState(page);
    assert.deepEqual(state.names, ['mine'], 'the row is real — the in-memory save happened');
    assert.match(state.note, /Saved for this tab only/, 'and the panel says the save will not survive a reload');
    assert.deepEqual(await storedVersions(page), [], 'precondition: the write really did fail — nothing reached storage');
  });
});

// V30 — decision 17. Round 4's comment asserted the pre-check and
// commitStyleEdit ask "the same deterministic predicate", and nothing enforced
// it. A page-replaceable CSS.supports can be INCONSISTENT rather than merely
// wrong: this fixture answers true exactly once per (property, value) pair and
// false forever after, so an unmemoized check passes `.every()` and then
// refuses inside commitStyleEdit — the revert half runs, the apply half does
// not, and the destructive no-op is reassembled across two invocations. The
// discriminator is the padding, which no refusal path touches.
test('a CSS.supports that flips between the pre-check and the apply cannot reassemble the destructive no-op', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'big');

    // Live work made AFTER the save: the version's own property, plus one it
    // does not name. The padding is what the revert half clears.
    await editStyle(page, 'font-size', '12px');
    await editStyle(page, 'padding', '20px');

    const listed = await versionsState(page);
    assert.deepEqual(listed.names, ['big'], 'precondition: the in-session version is listed');
    assert.deepEqual(listed.restoreDisabled, [false], 'precondition: and live — the read filter never saw it');

    // TRUE the first time each pair is asked, FALSE every time after. Installed
    // after the boot, so the overlay's own startup probes are not consumed.
    await page.evaluate(() => {
      const seen = new Set();
      window.CSS.supports = (property, value) => {
        const key = property + ' ' + value;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      };
    });
    assert.deepEqual(
      await page.evaluate(() => [CSS.supports('padding', '1px'), CSS.supports('padding', '1px')]),
      [true, false],
      'precondition: the fixture really flips on the second ask for the same pair'
    );

    await clickVersionControl(page, 'data-restore-version', listed.ids[0]);
    const after = await inlineStyles(page, '#card');
    assert.equal(after.fontSize, '24px', 'the version applied — the memo held the first verdict, so the pre-check and the commit could not disagree');
    assert.equal(after.padding, '', 'and the revert ran for real, rather than clearing the work under a restore that then applied nothing');
  });
});

// V31/V32 — decision 18. The probe writes through
// CSSStyleDeclaration.prototype.setProperty and reads back through
// .getPropertyValue, both page-replaceable, and decision 15's OLD residual
// dismissed that by claiming a poisoned setter defeats the apply path "in the
// same stroke". These two fixtures are the refutation: each wrapper is
// SELECTIVE — it lies about exactly what the probe writes or reads and
// delegates everything else to the native method — so the apply path keeps
// working while the probe would report true. The primitives are captured at
// load, so a wrapper installed afterwards never reaches the probe. They are two
// mechanisms, not one rule twice: the write is what puts the value in front of
// the CSS parser, the read is what turns "the parser left it unset" into a
// verdict, and each has its own mutant.
//
// The poison goes in AFTER the overlay has booted, and both halves of that are
// load-bearing. After, because installing it before is the PRE-injection case,
// which is decision 18's stated residual and unclosable from inside a shared
// realm — a fixture using addInitScript would be measuring what the code does
// not claim. And the value has to be one probed for the FIRST TIME after boot,
// because decision 17's memo holds every verdict already taken, so an
// in-session version's own values can never re-reach the probe. That makes the
// commit gate the reachable seam: a refused commit records no style edit, so
// the Versions section has nothing to name and stays hidden, while a probe
// fooled by the poison admits the garbage and reveals it.
test('a page that poisons setProperty after load cannot make the probe accept a bad value', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    assert.equal((await versionsState(page)).sectionVisible, false, 'precondition: nothing to name yet, so the section is the observable');

    // SURGICAL ON THE (property, value) PAIR, not on the receiver — a
    // CSSStyleDeclaration exposes no owner element, so `setProperty` cannot ask
    // whether `this` belongs to the detached div the probe builds (only V34's
    // accessor poison can be receiver-selective). So under the V31 mutant this
    // ALSO launders the connected #card apply to `2px`, and that is the point
    // rather than a leak in the fixture: every OTHER value commits natively —
    // asserted by the both-directions control at the end of this test — while a
    // `2px` the user never typed lands on the element, which is exactly the
    // destruction round 4's "the same poisoning defeats the apply path in the
    // same stroke" residual said could not happen.
    // The lying CSS.supports rides along because the AND (decision 15) would
    // otherwise reject the value before the probe was ever consulted, and the
    // fixture would measure nothing.
    await page.evaluate(() => {
      const proto = CSSStyleDeclaration.prototype;
      const original = proto.setProperty;
      proto.setProperty = function (property, value, priority) {
        if (property === 'letter-spacing' && value === 'definitely-not-a-length') {
          return original.call(this, property, '2px', priority);
        }
        return original.call(this, property, value, priority);
      };
      window.CSS.supports = () => true;
    });
    assert.deepEqual(
      await page.evaluate(() => {
        const el = document.createElement('div');
        el.style.setProperty('letter-spacing', 'definitely-not-a-length');
        el.style.setProperty('word-spacing', 'definitely-not-a-length');
        return [el.style.getPropertyValue('letter-spacing'), el.style.getPropertyValue('word-spacing')];
      }),
      ['2px', ''],
      'precondition: the poisoned setter is live, launders exactly the probe\'s garbage, and delegates everything else'
    );

    await editStyle(page, 'letter-spacing', 'definitely-not-a-length');
    assert.equal(
      await page.evaluate(() => document.querySelector('#card').style.getPropertyValue('letter-spacing')),
      '',
      'the captured setProperty overrules the poisoned one — the commit was refused rather than laundering the garbage onto the element'
    );
    assert.equal((await versionsState(page)).sectionVisible, false, 'and no style edit was recorded, so there is still nothing to name');

    // Both directions, or a probe that had simply stopped working would satisfy
    // the assertions above while refusing the user's real work.
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');
    assert.deepEqual((await versionsState(page)).names, ['good'], 'and a supported value still commits and saves with the poisoned setter installed');
  });
});

test('a page that poisons getPropertyValue after load cannot make the probe accept a bad value', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    assert.equal((await versionsState(page)).sectionVisible, false, 'precondition: nothing to name yet, so the section is the observable');

    // Only ever rewrites an EMPTY letter-spacing read — which is exactly the
    // "the parser rejected it" signal the probe depends on, and never something
    // a computed style produces (computed letter-spacing is `normal` or a
    // length, never the empty string). Selective on the READ, not on the
    // receiver, for the same reason V31 is: under the V31/V32 mutants this also
    // rewrites the target's own original-inline capture at
    // browser/raven-grab.js:4284, where an element with no inline
    // letter-spacing reads "". See the header — that is the destruction round 4
    // said the poison could not cause, not a defect in the fixture.
    await page.evaluate(() => {
      const proto = CSSStyleDeclaration.prototype;
      const original = proto.getPropertyValue;
      proto.getPropertyValue = function (property) {
        const value = original.call(this, property);
        if (property === 'letter-spacing' && value === '') return '2px';
        return value;
      };
      window.CSS.supports = () => true;
    });
    assert.deepEqual(
      await page.evaluate(() => {
        const el = document.createElement('div');
        return [el.style.getPropertyValue('letter-spacing'), el.style.getPropertyValue('word-spacing')];
      }),
      ['2px', ''],
      'precondition: the poisoned reader is live, answers for exactly the unset property the probe asks about, and delegates everything else'
    );

    await editStyle(page, 'letter-spacing', 'definitely-not-a-length');
    assert.equal((await versionsState(page)).sectionVisible, false, 'the captured getPropertyValue overrules the poisoned one — the commit was refused, so there is nothing to name');

    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');
    assert.deepEqual((await versionsState(page)).names, ['good'], 'and a supported value still commits and saves with the poisoned reader installed');
  });
});

// V34 — decision 18. The fourth primitive. `style` is an ACCESSOR, so it needs
// a different lever from the two methods (Object.defineProperty rather than an
// assignment) and its own fixture; it is not the setProperty rule restated.
// The wrapper is SELECTIVE in the same way and for the same reason — it answers
// with the decoy only for a detached, attribute-less <div>, which is exactly
// what the probe builds and nothing the apply path ever touches, so the page
// keeps working while the probe would be fooled. The decoy already carries
// `letter-spacing: 2px`, so writing garbage to it changes nothing and reading
// it back returns a non-empty string — forging the "the parser accepted it"
// signal from the other side.
test('a page that poisons the style accessor after load cannot make the probe accept a bad value', async (t) => {
  if (skipUnlessBrowser(t)) return;
  await withLocalOverlay(async (page) => {
    await selectElement(page, '#card');
    assert.equal((await versionsState(page)).sectionVisible, false, 'precondition: nothing to name yet, so the section is the observable');

    await page.evaluate(() => {
      const decoyHost = document.createElement('div');
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style').get;
      const decoy = original.call(decoyHost);
      decoy.setProperty('letter-spacing', '2px');
      Object.defineProperty(HTMLElement.prototype, 'style', {
        configurable: true,
        get: function () {
          if (!this.isConnected && this.tagName === 'DIV' && this.attributes.length === 0) return decoy;
          return original.call(this);
        },
      });
      window.CSS.supports = () => true;
    });
    assert.deepEqual(
      await page.evaluate(() => {
        const fresh = document.createElement('div');
        fresh.style.setProperty('letter-spacing', 'definitely-not-a-length');
        const card = document.querySelector('#card');
        return [fresh.style.getPropertyValue('letter-spacing'), card.style.getPropertyValue('letter-spacing')];
      }),
      ['2px', ''],
      'precondition: the poisoned accessor is live, hands the decoy to exactly the shape the probe builds, and delegates for a real element'
    );

    await editStyle(page, 'letter-spacing', 'definitely-not-a-length');
    assert.equal((await versionsState(page)).sectionVisible, false, 'the captured style accessor overrules the poisoned one — the commit was refused, so there is nothing to name');

    // Both directions, or a probe that had simply stopped working would satisfy
    // the assertion above while refusing the user's real work.
    await editStyle(page, 'font-size', '24px');
    await nameAndSave(page, 'good');
    assert.deepEqual((await versionsState(page)).names, ['good'], 'and a supported value still commits and saves with the poisoned accessor installed');
  });
});
