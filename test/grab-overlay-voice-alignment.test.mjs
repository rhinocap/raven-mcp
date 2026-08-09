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
// EIGHT mics exist in the source and FIVE of them render in this fixture. The
// fixture asks for the `consumer` role, so the three it never reaches are the
// two template-mode rows (`:8518`, `:8552`) AND the maintainer-only Component
// notes heading (`:10601`) — the source-enumeration test is the only guard on
// all three. That last one is a Sol round 8 (P3) correction: this header named
// Component notes as one of the RENDERED heading mics for several rounds, when
// the heading the consumer path actually renders is the use case one (`:10583`).
// The rendered five are feedback message, Instructions, use case, template name
// and component name.
//
// The property is deliberately measured against the ROW rather than against the
// control below it: two of the five RENDERED mics (Instructions, use case) sit
// in a section heading with no `<label>`, so a control-relative assertion would
// have nothing to compare and would silently skip exactly the two rows that
// were already correct — the control gap is asserted too, but only where a
// control exists.
//
// Mutation matrix v11 — MEASURED, re-run WHOLE after the round-9 fixes: 30
// mutants, 30 killed, 0 survived, plus 12 CONTROLS that must stay green and do.
// The controls arrived in v5 and they are not decoration: a matrix that only
// ever asks "does this turn red" is structurally blind to a FALSE FAIL, and
// a gate that cries wolf on correct code is how a gate gets muted. Round 6
// doubled the control count for a reason — two of its four findings WERE false
// fails, so the round that found them should leave more of the matrix pointing
// that way; round 7 added a fifth, and round 8 a sixth and seventh, because two
// of its own six findings were red-on-correct-code. **Round 9 took the control
// count from 7 to 12, and that is the shape of its verdict**: FIVE of its seven
// findings were red on correct HTML, because round 8 answered a parsing question
// with a better regex instead of a parser. No radius measured in v10 moved in
// v11, and once again that was not a foregone conclusion: round 9 replaced the
// covered-opener patterns with a real start-tag tokenizer, made the raw-text
// skip push its own element, added bogus-comment handling to emittedWindow,
// rewrote the grouping-paren strip as a balance scan and deleted the source cap
// — so the whole matrix was re-measured rather than carried forward.
//
// A34 is the one entry whose CLASSIFICATION moved, and it moved because the
// verdict about it moved: round 8 called it a kill separated only by its
// assertion message, round 9 established that both of its reds were wrong and it
// is a CONTROL. A mutant that is red before and after a fix is not automatically
// evidence the fix worked — ask first whether the mutant is correct code.
//
// v10 stopped ASSERTING pre-fix behaviour in a comment and MEASURED it, and v11
// keeps that: .claude/dialkit-2026-08-08/r9-prefix-measure.mjs reverts each
// round-9 fix individually in a copy of this file and runs the mutants that fix
// owns, so "PRE-FIX: 2 pass / 0 fail" is a reading rather than a recollection.
// (r8-prefix-measure.mjs is PINNED to the round-8 tree and throws on this one —
// it is the round-8 record, not a runnable harness.) That harness exists because
// round 6 established a mutation claim is falsifiable exactly like an assertion.
// Sol round 9 (P2) then found the harness itself grading runs it should have
// refused: it read only the parsed summary and ignored `status`, `signal` and
// `error`, so a child that printed a summary and then died counted as a
// measurement. Both harnesses now require the exit status and the summary to
// agree. Each mutant is a string edit on a copy of
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
// A18/A19/A20/A21 are round 6, and TWO of the four are controls — because two
// of that round's four findings were correct code being reported as a defect,
// which a red-only matrix cannot see at all. Every one was measured against the
// round-5 code first:
//
//   A18 a real call written `voiceButtonMarkup /* gap */ (…)` -> PRE-FIX fail=0
//         8 sites, 0 uncovered: the mic was invisible to BOTH assertions
//   A19 CONTROL literal `voiceButtonMarkup(` in a rendered label
//         PRE-FIX 9 sites -> the count assertion red on correct code
//   A20 CONTROL a covered opener rendered as TEXT after the real one
//         PRE-FIX `lastIndexOf` picked the text -> :8552 falsely uncovered
//   A21 a LineContinuation opening a real <em> wrapper       -> PRE-FIX fail=0
//         8 sites, 0 uncovered, whole suite green on a real misalignment
//
// A18 and A19 are ONE defect in two directions. Finding the call sites is a
// LEXICAL question and round 5 answered it with a substring scan of `code`,
// which blanks comments but keeps string contents — so text that merely LOOKS
// like a call counted as one, and a call with a comment in it did not. The scan
// runs on `glue` now and matches the bare identifier, then walks forward over
// whitespace to require the `(`. A18's kill lands on the COUNT assertion
// (`9 !== 8`) because assert aborts at the first failure and a ninth mic has to
// pass that one first — which is exactly the point, since pre-fix it passed
// neither.
//
// A20 refutes round 5's claim that checking only the LAST occurrence of each
// opener was "sufficient and not a shortcut". That argument was about the GLUE
// predicate and said nothing about the DEPTH WALK that runs after it. Enclosure
// is existential, so the rule is now existential too: every occurrence of every
// opener is a candidate and the mic is covered if ANY of them is both
// concatenation-joined and balanced. Same lesson as the private-path gate's
// round 19 — there is no single correct anchor.
//
// A21's attribution was MEASURED IN TWO STAGES and the result is a genuine
// CONJUNCTION, which is worth stating plainly because this file has twice
// described one mechanism as two and once described two as one:
//
//   compression off, `emits` flag on   -> A21 SURVIVES (2 pass / 0 fail)
//   compression on,  `emits` forced    -> A21 SURVIVES (2 pass / 0 fail)
//
// Neither half kills it. Round 6's first attempt was the `emits` flag alone —
// stop a LineContinuation decoding to a newline — and it reads as a fix while
// measuring nothing, because the two source slots are still PADDING and the tag
// regex requires a letter directly after `<`; `<  em>` is missed exactly as
// `<\nem>` was. Dropping non-emitting positions is what makes the walk see the
// `<em>` the browser renders, and the flag is what stops a newline being emitted
// in their place. Do not remove either believing the other covers it.
//
// A22-A27 are round 7, and unlike rounds 4-6 they are NOT four doors into one
// lexer — each attacks a different half of the enclosure rule, which is the
// reason this round's fixes touch four separate functions. All six anchor on the
// :8552 template-mode row, so the radius grades the SOURCE rule and no rendered
// assertion can cover for them (the A7/A8 discipline). Measured pre-fix:
//
//   A22 a mic written `voiceButtonMarkup?.(…)`             -> PRE-FIX fail=0
//         an OPTIONAL call emits byte-identical markup and was not a site at
//         all: round 6 walked whitespace to the `(` and stopped there
//   A23 free TEXT carrying the heading class                -> PRE-FIX fail=0
//         COVERED[2] was a bare attribute substring, so the same characters
//         outside any tag counted as a container
//   A24 `<em></span>`                                       -> PRE-FIX fail=0
//         a depth COUNTER returns to zero while a browser closes both tags and
//         leaves the mic a sibling — balanced is not well-nested
//   A25 `<!--` inside a quoted attribute VALUE              -> PRE-FIX fail=0
//         dropping HTML comments at scan time blanked the rest of a real tag,
//         deleting the uncovered wrapper the mic was actually sitting in
//   A26 a decoy opener fused across a STATEMENT BOUNDARY    -> PRE-FIX fail=0
//         the glue check ran from the opener's END, so only the decoy's second
//         half was ever tested for concatenation
//   A27 CONTROL forty `\x61` escapes in a covered label      -> PRE-FIX 1 fail
//         REACH bounded SOURCE while feeding EMITTED text, and the ratio is
//         unbounded — correct markup reported as a defect
//
// A23/A24/A25 are one class stated three ways: a cheap approximation of "is this
// mic inside that container" that a browser does not share. A substring is not a
// tag, a counter is not a stack, and a comment is not a comment when it sits
// inside an attribute value. A26 is the round-5 decoy lesson one step further —
// it was already known that an unrendered string can supply an opener, and what
// A26 adds is that HALF of one can.
//
// A28-A34 are round 8. Every one anchors on the :8552 template-mode row, which
// the fixture never renders — a counterexample against the SOURCE rule has to
// live where no browser test can cover for it, or its radius grades the wrong
// guard (the A13 trap, round 4). Radii are 1 each, and the PRE-FIX column is
// MEASURED by r8-prefix-measure.mjs rather than asserted here:
//
//   A28  <label data-class="raven-grab-field"> on an uncovered row
//          PRE 2p/0f -> POST 1p/1f   [mics in a container ... does not cover]
//        `\b` is not an attribute-name boundary. `data-class` satisfies
//        `\bclass="`, so an attribute that has nothing to do with CSS opened a
//        container. The same `\b` is not a CLASS-token boundary either —
//        class="raven-grab-field-x" matched a rule that does not apply to it.
//        Round 8's coveredBy() claimed to ask "the question CSS asks"; round 9
//        (P3) showed that was false and A35-A42 are why — a regex cannot know
//        where one attribute's VALUE ends and the next attribute begins, so it
//        cannot answer "does this element carry this class" at all. What kills
//        A28 today is parseStartTag() plus hasClass(), not a better pattern.
//   A29  CONTROL: class="raven-grab-field extra"  (correct, covered markup)
//          PRE 1p/1f -> POST 2p/0f
//        The old `class="raven-grab-field"` literal demanded the class be the
//        WHOLE attribute value, so an extra class reported correct markup as a
//        defect. A28 and A29 pull in opposite directions on purpose: a "fix"
//        that merely loosened the pattern would pass A29 and lose A28.
//   A30  <em style=display:block;width:100px data-x=y/> inside a covered row
//          PRE 2p/0f -> POST 1p/1f
//        A `/` ending an UNQUOTED attribute value is part of the value, not a
//        solidus, so trim().endsWith('/') read a real <em> as void — the
//        container never opened, the walk balanced, and the mic read covered.
//        selfClosing() requires whitespace or a quote before the slash, and
//        the run is deliberately NOT trimmed first: `<br / >` is a parse error
//        a browser does not honour as self-closing either.
//   A31  1 < 2 <!-- <label class="raven-grab-field"><span> --> in a loose div
//          PRE 2p/0f -> POST 1p/1f
//        emittedWindow flipped inTag on any bare `<`, so the comparison put the
//        scanner "inside a tag", the HTML comment was not dropped, and the
//        commented-out opener counted. A browser opens a tag only when `<` is
//        followed by [a-zA-Z!/?], and a `>` inside a quoted attribute value
//        does not close one; inTag now tracks both.
//   A32  CONTROL: (voiceButtonMarkup)("data-template-note"  (correct, covered)
//          PRE 1p/1f -> POST 2p/0f
//   A33  a NINTH mic, (voiceButtonMarkup)("data-extra-note", "extra"), in a
//        loose wrapper
//          PRE 2p/0f -> POST 1p/1f   [the number of mics in the overlay changed]
//        A grouping paren around the callee emits byte-identical markup, so it
//        is the same call site — but the walk did not see one, leaving the
//        count at 8 and the row unexamined. Stripping it is refused when the
//        `(` is itself a call or an index (preceded by an identifier, `)` or
//        `]`). The window and the CONCATENATION_ONLY check anchor at the
//        OUTERMOST paren, not at the identifier: anchoring at the identifier
//        puts the stripped `(` inside the glue region and reports a correct
//        row red — fixing one direction of this by opening the other.
//   A34  CONTROL: /*<20001 chars>*/ between the opener and the mic
//          PRE 1p/1f -> POST 2p/0f   (round 8 recorded PRE 1p/1f -> POST 1p/1f)
//        This entry has been graded three ways in three rounds, which is the
//        whole lesson. Round 7 called REACH_SOURCE_CAP "a cost bound only" and
//        was wrong; round 8 measured that the cap changes a VERDICT and
//        answered by making the stop LOUD — a separate assertion naming the
//        site — and recorded A34 as the one mutant separated by its message
//        rather than its radius. Round 9 (P1) refused that too, correctly: a
//        comment emits nothing, so the browser puts the mic exactly where the
//        covered opener put it. THIS IS CORRECT CODE, and a better error
//        message does not redeem a red on correct code. The cap is deleted and
//        A34 is a CONTROL. Ask whether a mutant is correct code BEFORE reading
//        a red as evidence the guard works.
//
// A35-A42 are round 9, on the same :8552 row, and seven of the eight exist for
// one finding stated once: a REGEX cannot answer "does this element carry this
// class". It cannot know where an attribute value ends and the next attribute
// begins, so it is wrong in both directions at once — A35/A36 are silent greens
// it allowed and A37/A41/A42 are reds it produced on valid HTML. Round 8 wrote
// a better pattern; round 9 replaced it with parseStartTag(), a real start-tag
// tokenizer, which is the only thing that can be right in every direction.
//
//   A35  <div class="raven-grab-loose" title=' class="raven-grab-field"'>
//          PRE 2p/0f -> POST 1p/1f
//        The element carries no such class. The old opener matched the TEXT of
//        another attribute's value. Whole suite green on the 396px defect.
//   A36  <label class="raven-grab-loose" class="raven-grab-field">
//          PRE 2p/0f -> POST 1p/1f
//        The HTML parser DROPS a duplicate attribute — first wins — so this
//        element's class is raven-grab-loose and nothing else. The old opener
//        scanned the whole tag and found the second one. parseStartTag keeps
//        the first occurrence for exactly this reason.
//   A37  CONTROL: <label CLASS = "raven-grab-field">   (valid, covered markup)
//          PRE 1p/1f -> POST 2p/0f
//        Attribute names are ASCII case-insensitive and whitespace around `=`
//        is legal. `\sclass="` said no to both.
//   A41  CONTROL: <label class='raven-grab-field'>     (valid, covered markup)
//          PRE 1p/1f -> POST 2p/0f
//   A42  CONTROL: <label class=raven-grab-field>       (valid, covered markup)
//          PRE 1p/1f -> POST 2p/0f
//        Round 8's header called single-quoted and unquoted class attributes an
//        ACCEPTED RESIDUAL "whose failure direction is a red, not a silent
//        green". Both halves were false (round 9 P3): they are valid HTML, and
//        a red on valid HTML is not an acceptable residual — it is the failure
//        mode that gets a gate muted. Controls now, not a documented limitation.
//   A38  a NINTH mic written (0, voiceButtonMarkup)("data-extra-note", …) in a
//        loose wrapper
//          PRE 2p/0f -> POST 1p/1f   [the number of mics in the overlay changed]
//        `(0, f)(x)` is the standard indirect-call idiom and emits byte-
//        identical markup, so it is the same call site. Round 8's strip was
//        ADJACENCY-based — the `(` had to sit immediately before the identifier
//        — so this was not a site at all: count stayed 8, the ninth mic was
//        never examined, and the only guard on that row reported nothing. The
//        walk finds the MATCHING paren by balance now, which also covers
//        ((f))(x) and (a ? f : g)(x). A33 reached through a different token.
//   A39  <div class="raven-grab-loose"><![CDATA[ <label class="raven-grab-
//        field"><span> ]]> before the mic
//          PRE 2p/0f -> POST 1p/1f
//        `<![CDATA[` is real only in FOREIGN content (SVG/MathML). In HTML it
//        is a BOGUS COMMENT ending at the first `>` — here the `>` of the
//        <label> inside it — so a browser renders `<span> ]]>` in the loose div
//        and the mic is uncovered. Round 8 dropped `<!--` and let every other
//        `<!` / `<?` form through as markup.
//   A40  CONTROL: <script></script> inside a correctly covered row
//          PRE 1p/1f -> POST 2p/0f
//        Round 8's raw-text skip jumped to the closer WITHOUT pushing the
//        element, so the closer popped an empty stack and EVERY closed raw-text
//        element was a false red — script, style, textarea and title alike. It
//        pushes first now, and the closer only counts when the tag name is
//        followed by whitespace, `/` or `>` (`</scriptx` is text).
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
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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
  // Held outside the try so the outer finally can close it however the probe
  // exits. Round 7 moved the close AFTER the browser navigation, which put the
  // mkdtemp/writeFile/rm steps between `listen` and any close — a throw there
  // would otherwise leak a listening socket for the rest of the run, which is
  // the same defect Sol round 5 found in `withOverlay` and it is not allowed to
  // come back through the probe.
  let probeServer = null;
  try {
    probeServer = createServer((_q, r) => r.end('ok'));
    await new Promise((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    // The temp-directory write is an environmental prerequisite exactly like the
    // socket, and round 5's probe did not cover it. Sol round 6 measured a
    // `mkdtemp` EPERM in its sandbox: on a host where sockets and chromium work
    // but temporary writes do not, the gate passed and the suite reported
    // 1 pass / 1 fail / 0 skipped — an environment reported as a product defect,
    // which is the one thing this probe exists to prevent.
    //
    // The lazy `dist/grab-bridge.js` import and `startGrabSession` are
    // deliberately NOT probed, and that is the boundary rather than an omission:
    // they are PRODUCT CODE. Probing them would make a real bridge defect
    // register as a missing environment and skip, which is the same
    // misclassification pointing the other way.
    const probeDir = await mkdtemp(path.join(tmpdir(), 'raven-mic-probe-'));
    await writeFile(path.join(probeDir, 'probe.txt'), 'ok', 'utf8');
    await rm(probeDir, { recursive: true, force: true });
    // The probe navigates to the LOOPBACK SERVER, not to about:blank, and the
    // server stays open until it has. Sol round 7 (P2): binding a socket from
    // node and launching a browser are two prerequisites, and the browser
    // REACHING that socket is a third — a sandbox can permit the first two and
    // deny the third, at which point the probe passes, `withOverlay` fails on
    // its own `goto`, and the suite reports 1 pass / 1 fail / 0 skipped. That is
    // an environment reported as a product defect, which is the single failure
    // this probe exists to prevent, and it is the fourth time a round has found
    // the probe narrower than the test it gates. Closing the server before the
    // launch is what made the old version unable to ask the question at all.
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

  // Everything after the listen is inside the try, so the upstream server is
  // closed on EVERY path. Round 5 opened it and then did three more awaits —
  // mkdtemp, writeFile, startGrabSession — before entering the try, so a failure
  // in any of them leaked a listening socket for the rest of the run (Sol round
  // 6). `session` and `browser` are declared outside so the finally can tell
  // what was actually started, rather than tearing down what never began.
  let session = null;
  let browser;
  try {
    const dir = await mkdtemp(path.join(tmpdir(), 'raven-mic-align-'));
    const designPath = path.join(dir, 'DESIGN.md');
    await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');
    session = await bridge.startGrabSession(designPath, undefined, upstreamUrl, 'consumer');
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    if (session) await bridge.stopGrabSession();
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
  // An opener must be an actual ELEMENT carrying the class, not the class text
  // by itself. Sol round 7 (P1) measured the difference: the third entry used to
  // be the bare attribute substring, and nothing required it to sit inside a
  // tag, so `'<div class="raven-grab-loose">class="raven-grab-section-heading"'`
  // followed by a mic satisfied the rule with no tags left to unbalance it —
  // the mic renders in the loose div and the suite reported green. `[^<>]*`
  // is what carries the fix: it cannot cross a `>`, so the attribute text has to
  // belong to the tag that opened before it.
  // Sol round 8 (P1) then measured that "an element carrying the class" was
  // still two approximations, one in each direction, and BOTH are what a
  // browser does not do:
  //
  //   `\bclass=`  matches inside a LONGER attribute name, because `\b` sits
  //               between the `-` and the `c` of `data-class`. So rewriting the
  //               :8552 row as `<label data-class="raven-grab-field">` — which
  //               matches no CSS rule at all, and renders the exact 396px
  //               defect — reported all eight sites covered, green.
  //   `…field"`   demanded the closing quote IMMEDIATELY after the class name,
  //               while CSS matches a class as one TOKEN of a space-separated
  //               list. So `class="raven-grab-field extra"` styles correctly and
  //               was reported as a defect: correct code, red.
  //
  // Round 8 answered both with a tighter REGEX — `\s` before `class`, and the
  // value scanned for the class as a token — and called that "asking the question
  // CSS asks". Sol round 9 (P1+P3) refuted the claim three ways at once, because
  // a regex cannot know where an attribute VALUE ends and the next attribute
  // begins:
  //
  //   <label title=' class="raven-grab-field"' class='raven-grab-loose'>
  //               the covered class is TEXT inside another attribute's value. The
  //               element carries only `raven-grab-loose` and renders the 396px
  //               defect; the scan reported it covered. GREEN.
  //   <label class="raven-grab-loose" class="raven-grab-field">
  //               the HTML parser DROPS a duplicate attribute, so the element's
  //               class is `raven-grab-loose`. The regex is happy to match the
  //               second one. GREEN.
  //   <label CLASS = "raven-grab-field">
  //               attribute names are ASCII case-insensitive and whitespace
  //               around `=` is legal, so this is the SAME element the stylesheet
  //               aligns. Reported as a defect: correct code, RED.
  //
  // So the opener is a tokenizer now rather than a pattern. `parseStartTag` walks
  // the tag the way the HTML tokenizer does — name, then attribute names ending
  // at whitespace/`/`/`>`/`=`, then a single-quoted, double-quoted or unquoted
  // value — lowercases the attribute NAME, keeps the FIRST of a duplicated pair,
  // and splits the class value on whitespace so membership is a token test. That
  // also retires the round-8 "accepted residual": a single-quoted or unquoted
  // class attribute is now handled rather than tolerated, and the residual note
  // claiming its failure direction could only be a red was itself false — the
  // `title=` case above is a silent green built out of exactly that gap.
  //
  // The class VALUE stays case-SENSITIVE, which is correct for standards mode.
  const CONTAINERS = [
    { cls: 'raven-grab-feedback-field', tail: '<span>' },
    { cls: 'raven-grab-field', tail: '<span>' },
    { cls: 'raven-grab-section-heading', tail: '' }
  ];
  function parseStartTag(text, at) {
    if (text[at] !== '<' || !/[a-zA-Z]/.test(text[at + 1] || '')) return null;
    let i = at + 1;
    while (i < text.length && /[\w-]/.test(text[i])) i += 1;
    const attrs = new Map();
    for (;;) {
      while (i < text.length && /[\s/]/.test(text[i])) i += 1;
      if (i >= text.length) return null;
      if (text[i] === '>') return { attrs, end: i + 1 };
      const nameAt = i;
      while (i < text.length && !/[\s/>=]/.test(text[i])) i += 1;
      if (i === nameAt) return null;
      const name = text.slice(nameAt, i).toLowerCase();
      while (i < text.length && /\s/.test(text[i])) i += 1;
      let value = '';
      if (text[i] === '=') {
        i += 1;
        while (i < text.length && /\s/.test(text[i])) i += 1;
        if (text[i] === '"' || text[i] === "'") {
          const close = text.indexOf(text[i], i + 1);
          if (close === -1) return null;
          value = text.slice(i + 1, close);
          i = close + 1;
        } else {
          const valueAt = i;
          // A `/` ending an UNQUOTED value is part of the value, not a solidus —
          // the round-8 `selfClosing` lesson, in the one place it is decided.
          while (i < text.length && !/[\s>]/.test(text[i])) i += 1;
          value = text.slice(valueAt, i);
        }
      }
      if (!attrs.has(name)) attrs.set(name, value);
    }
  }
  const hasClass = (attrs, cls) => (attrs.get('class') || '').split(/\s+/).includes(cls);
  // REACH counts EMITTED characters. Round 6 compressed the window it feeds to
  // emitted text and left the bound in SOURCE units, and Sol round 7 (P2)
  // measured the divergence: forty `a` escapes inside a correctly covered
  // label emit forty characters while consuming 240 source ones, which pushed
  // the real opener outside a 200-SOURCE-character window and reported correct
  // markup as a defect (measured 0 pass / 1 fail on the :8552 row). The two
  // units diverge without bound — `\u{1F600}` is ten source characters for one
  // emitted — so raising the number would have been a band-aid on the wrong
  // unit rather than a fix.
  //
  // There is no source cap. `REACH_SOURCE_CAP = 20000` existed for two rounds and
  // was wrong both times, in the same direction and for different stated reasons.
  // Round 7 called it "a COST bound and nothing else"; round 8 measured that it
  // could change a verdict (20,001 characters of block comment between an opener
  // and its call emit NOTHING, so the walk ran out of source before it ran out of
  // emitted text) and answered by making the stop LOUD — an assertion naming the
  // site. Sol round 9 (P1) refused that too, correctly: the markup is byte-
  // identical and correctly aligned, so a better message does not change what the
  // run is. RED on correct code is RED on correct code.
  //
  // The cap was inherited reasoning from a different design. It bounded a lazy
  // REGEX walking a space-permitting class, which is the quadratic shape the
  // private-path gate had to throw away in its own round 17. This walk is one
  // backward pass over a byte array — worst case the whole 580k file, eight
  // times — and this test's own duration is the observable. MEASURED against the
  // 20,001-character mutant that is exactly the pathological case the cap was
  // invented for, three reps each: 63.1 / 63.5 / 65.2 ms with the cap, and
  // 63.3 / 61.2 / 62.8 ms without it. The difference is inside the spread, which
  // is the point — there was no cost to bound. So the walk stops at REACH
  // emitted characters or the top of the file, and nowhere else.
  //
  // 200 is a MEASURED number, and the metric is the distance from the opener's
  // FIRST emitted character (the whole opener has to fit inside the window, or
  // its regex cannot match at all). Measured across all eight sites, emitted:
  //   :2339 54  :8518 47  :8552 47  :10567 94
  //   :10583 114  :10601 97  :10612 51  :10623 52
  // Widest real site is 114, so the margin is 86 emitted characters — 1.75x.
  // The number that moves if this is wrong is the enumeration test's uncovered
  // count: too small and a correct row is reported as a defect (that is exactly
  // the Sol round 7 P2 above, measured 0 pass / 1 fail), too large costs only
  // scan time. Re-measure rather than reason if a wider row is ever written.
  const REACH = 200;
  function windowStartFor(micAt) {
    let i = micAt;
    let emitted = 0;
    while (i > 0 && emitted < REACH) { i -= 1; if (view.content[i]) emitted += 1; }
    return i;
  }

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
  // So the file is scanned ONCE from the top — not from the window, which cannot
  // know whether it began inside a string literal — into FOUR offset-preserving
  // artefacts. This list has been wrong before (it described two views, put the
  // call sites in `code` and the walk over raw `markup`, all three false by round
  // 6), so it is written against what the code below actually does:
  //
  //   code    JS comments blanked, everything else kept. The LEXER's own
  //           lookbehinds read this — "the previous significant character" and
  //           the preceding identifier — so a comment above the cursor can never
  //           decide whether a `/` opens a regex.
  //   glue    `code` with string INTERIORS, their quotes, escape runs and `${`
  //           blanked. Mic CALL SITES are found here (round 6: searching `code`
  //           made the literal text "voiceButtonMarkup(" a ninth site), and
  //           CONCATENATION_ONLY is tested here, which is what stops an
  //           unrendered decoy string from acting as an opener.
  //   markup  only the contents of string literals kept. HTML comments are NOT
  //           dropped here — `<!--` inside a quoted attribute value is ordinary
  //           text, and nothing at scan time knows whether a given `<!--` is
  //           inside a tag. That decision moved into `emittedWindow`, where the
  //           text is linear and "inside a tag" is answerable.
  //   content one byte per source position, marking the positions that actually
  //           EMIT a character. `emittedWindow` walks it to build the string the
  //           browser will see, which is what the enclosure rule runs over.
  //
  // Blanked characters become spaces and newlines are preserved, so one index
  // means the same thing in the source and in every view — that is what lets the
  // call sites, the glue check and the emitted window come from different
  // strings and still be compared by offset.
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
    // Which source positions actually CONTRIBUTE A CHARACTER to the rendered
    // string. A view slot must hold exactly one character or every offset below
    // it shifts, so `markup` pads everything else with blanks — and a blank is
    // not nothing. `\x65` occupies four slots and emits one, a LineContinuation
    // occupies two and emits none, and `'<' + 'em>'` emits `<em>` with four
    // slots of quote-and-operator between the two halves. In every one of those
    // the tag regex, which requires a letter DIRECTLY after `<`, walks past a
    // real tag. Marking the emitting positions lets the enclosure walk run over
    // the characters the browser will see rather than over their padding.
    const content = new Uint8Array(js.length);
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
        // A LineContinuation — `\` immediately before a line terminator — emits
        // NOTHING: JavaScript removes both characters, so the string contains no
        // character at all there. Round 5 decoded it to a newline, and Sol round
        // 6 measured what that costs. `'…<\<LF>em style="display:block">'`
        // renders a real `<em>` that nests the mic in a wide wrapper, while the
        // walk sees `<\nem…>` and its tag regex — which requires a letter
        // DIRECTLY after `<` — misses it entirely: 8 sites, 0 uncovered, the
        // whole suite green on a real misalignment in a template row the browser
        // test cannot render. `\r\n` is ONE terminator and must consume three
        // characters, or the `\n` is read as string content on the next pass.
        //
        // This flag is HALF the fix and measured so (A21, both stages): with the
        // flag and without the `content` compression the mutant still survives,
        // because two padding slots between `<` and `em` defeat the tag regex
        // just as a newline did. The flag stops a character being emitted where
        // none should be; `content` stops the padding being walked. Neither is
        // sufficient alone — see the A21 note in the header before deleting one.
        let emits = true;
        // Written as ESCAPES, never as literals: pasted as characters, U+2028
        // and U+2029 are one editor normalisation away from ordinary spaces,
        // at which point a backslash-space would stop emitting and every
        // escaped space in the overlay would vanish from the markup view. The
        // first draft of this line was normalised exactly that way, and it was
        // caught by reading the bytes back rather than by any test.
        if (next === '\n' || next === '\u2028' || next === '\u2029') {
          emits = false;
        } else if (next === '\r') {
          emits = false;
          width = js[i + 2] === '\n' ? 3 : 2;
        } else if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(js.slice(i + 2, i + 4))) {
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
        if (emits && i + width - 1 < js.length) {
          markup[i + width - 1] = ch;
          content[i + width - 1] = 1;
        }
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
      // NO `<!--` branch here on purpose. Dropping HTML comments while scanning
      // SOURCE cannot know whether the `<!--` sits at text level or inside a
      // quoted attribute value, where it is ordinary text — Sol round 7 (P1)
      // measured a mic reported covered because a comment inside a class value
      // was blanked and the two halves of the class fused. The drop happens in
      // `emittedWindow`, where the text is linear and "inside a tag" has an
      // answer.
      markup[i] = c;
      content[i] = 1;
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
    return { code: code.join(''), markup: markup.join(''), glue: glue.join(''), content, desynced };
  }
  const view = scanSource(source);
  assert.deepEqual(view.desynced, [], `the source scanner lost its string/comment state at:\n  ${view.desynced.join('\n  ')}\nEvery verdict below it is meaningless — fix the lexer, do not adjust the expectations.`);

  // The complete HTML void set, not a sample of it. A void element MISSING here
  // is pushed and never popped, so the walk reports a correct row as a defect —
  // the safe direction, but a false red all the same, and there is no reason to
  // carry one when the list is closed and short.
  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  // Raw-text and escapable-raw-text elements: their CONTENT is not markup, so a
  // `<` inside one is text a browser never reads as a tag. Skipping to the
  // matching close is what keeps the walk agreeing with the parser.
  const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);
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
  // Round 5 claimed that checking only the LAST occurrence of each opener was
  // "sufficient and not a shortcut", on the grounds that an earlier occurrence's
  // glue region is a superset of the later one's. That argument is true of the
  // GLUE predicate and says nothing about the DEPTH WALK that runs after it, and
  // Sol round 6 measured the gap:
  //
  //   '<label class="raven-grab-field"><span>class="raven-grab-field"><span></span>'
  //     + voiceButtonMarkup(…)
  //
  // The first opener genuinely encloses the mic. The second is TEXT that renders
  // as visible characters, and it is balanced by its own `</span>`, so the walk
  // from it lands at -1 and the row was reported uncovered — a correct row
  // reported as a defect, 1 pass / 1 fail on a browser-capable host. Selecting
  // one anchor and letting its verdict stand is the same mistake the private-path
  // gate spent four rounds on: there is no single correct anchor.
  //
  // Enclosure is EXISTENTIAL, so the rule is too. Every occurrence of every
  // opener is a candidate, and the mic is covered if ANY candidate is both
  // concatenation-joined to it and balanced to depth zero. That is not a
  // weakening: a candidate only passes if it really does leave a covered
  // container open at the mic, which is exactly the property being asserted. The
  // A7/A8 escape still fails from every anchor, because the walk from each one
  // crosses the `</span>` that closes the container before the mic is reached.
  //
  // The glue rule is CONSERVATIVE, in the direction that costs a red rather than
  // a green, and round 5 stated its reason too generously. It is not that a
  // function's output is unknowable — it is that this scan does not EVALUATE
  // expressions at all, so a grouping parenthesis is refused on the same footing
  // as a call. Sol round 6 measured that too: `+ ('') +` between the container
  // and the mic emits byte-identical HTML and is reported uncovered. That is a
  // false red on correct code, it is accepted rather than fixed, and the reason
  // is that every widening is a step onto the dataflow analysis a test cannot do
  // — admit `('')` and the next question is `(cond ? a : b)`. The cost is bounded
  // because it is LEGIBLE: the failure message below names the rule, so a future
  // author who writes it is told what to do instead rather than left guessing.
  // All eight of today's sites are pure concatenation, checked by hand.
  const CONCATENATION_ONLY = /^[\s+]*$/;
  // Counting tags is not checking nesting, and Sol round 7 (P1) measured the
  // gap: `<label class="raven-grab-field"><span>Add note…<em></span>` scores +1
  // for `<em>` and -1 for `</span>` and returns to zero, while a browser closes
  // BOTH and leaves the mic a SIBLING of the aligned span — the 396px defect
  // this file exists to prevent, reported green. A stack answers the question a
  // counter only approximates: a closer must name the element it closes, and an
  // unmatched one is a mis-nesting rather than a decrement. `stack.pop()` on an
  // empty stack yields undefined, which never equals a tag name, so the old
  // depth<0 case is covered by the same comparison.
  //
  // Sol round 8 (P1) found the self-closing test was a third approximation: it
  // asked whether the attribute run ENDS in a slash, and a slash that ends an
  // UNQUOTED attribute value is part of the value, not a solidus. Per the HTML
  // tokenizer, `/` opens the self-closing state only from before-attribute-name
  // or after-a-quoted-value — inside attribute-value-unquoted it is just a
  // character. So `<em style=display:block;width:100px data-x=y/>` parses as
  // `data-x="y/"` with `<em>` left OPEN, the mic renders inside a 100px wrapper
  // away from the row edge, and the old rule skipped the `<em>` entirely and
  // called it green. The question is now what precedes the slash: whitespace, a
  // closing quote, or the tag name itself. The run is NOT trimmed first, because
  // `<br / >` is a parse error a browser does NOT treat as self-closing.
  const selfClosing = (attrs) => attrs.endsWith('/')
    && (attrs.length === 1 || /[\s"']/.test(attrs[attrs.length - 2]));
  function wellNested(between) {
    const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
    const stack = [];
    let hit;
    while ((hit = tag.exec(between)) !== null) {
      const name = hit[2].toLowerCase();
      if (hit[1] === '/') {
        if (stack.pop() !== name) return false;
      } else if (!selfClosing(hit[3]) && !VOID_TAGS.has(name)) {
        if (RAW_TEXT_TAGS.has(name)) {
          // A closer only ends a raw-text element when the tag NAME is followed
          // by whitespace, `/` or `>` — `</scriptx` is text inside the script.
          const lower = between.toLowerCase();
          let close = -1;
          for (let at = tag.lastIndex; ;) {
            const found = lower.indexOf('</' + name, at);
            if (found === -1) break;
            if (/[\s/>]/.test(lower[found + name.length + 2] || '')) { close = found; break; }
            at = found + 1;
          }
          // An unclosed raw-text element swallows the rest of the window in a
          // browser too, so there is no opener left to be enclosed by: bail
          // rather than pretend the tags after it are markup.
          if (close === -1) return false;
          // PUSH, then jump to the closer so the regex pops it on the next
          // iteration. Sol round 9 (P1): round 8 jumped WITHOUT pushing, so an
          // ordinary `<script></script>` between a correct opener and its mic
          // popped an empty stack and reported a correctly aligned row as a
          // defect. Every closed raw-text element was a false red — `style`,
          // `textarea` and `title` alike.
          stack.push(name);
          tag.lastIndex = close;
          continue;
        }
        stack.push(name);
      }
    }
    return stack.length === 0;
  }
  // The emitted text of a source range, with a map back to source offsets so a
  // hit inside it can still be judged against `glue`. Everything the runtime
  // does NOT put in the string — escape padding, line continuations, quotes,
  // `+` operators, whitespace between fragments — is absent rather than blanked,
  // so `'…<\<LF>em style="display:block">'` and `'<' + 'em>'` and `'<\x65m>'`
  // all present the walk with the `<em>` a browser would render. Round 5 blanked
  // instead of dropping, which reads as a fix and measures as nothing: the tag
  // regex misses `<  em>` exactly as it missed `<\nem>`.
  function emittedWindow(a, b) {
    let raw = '';
    const rawMap = [];
    for (let i = a; i < b; i += 1) {
      if (view.content[i]) { raw += view.markup[i]; rawMap.push(i); }
    }
    // An HTML comment is dropped only where a browser would read it AS a
    // comment, which is at TEXT level. Sol round 7 (P1) showed the decision
    // cannot be made while scanning source: inside a quoted attribute value
    // `<!--` is ordinary text, so blanking it there fused
    // `class="raven-grab-<!--r7-->field"` back into the covered class and
    // reported a mic in an uncovered row as covered (measured green; the real
    // element's class is `raven-grab-<!--r7-->field` and matches no selector).
    // Here the emitted text is linear, so "inside a tag" is answerable — and
    // round 3's reason for dropping comments at all, `<!-- <em> -->` handing the
    // walk an opener that never renders, is preserved for the text-level case it
    // was actually written for.
    //
    // "Inside a tag" is itself two approximations, and Sol round 8 (P1) broke
    // the first: a bare `<` set the state. A browser opens a tag only when the
    // `<` is followed by an ASCII letter, `/`, `!` or `?` — everything else is
    // TEXT — so `Add note… 1 < 2 <!-- <label class="raven-grab-field"><span> -->`
    // renders as a loose row with the comment removed, while the scanner held
    // `inTag` from the `1 < 2` onwards, kept the comment, and accepted the fake
    // opener inside it. Green, on the 396px defect.
    //
    // The second is the `>`: one inside a QUOTED attribute value does not end
    // the tag, so tracking quotes is what keeps a real `<!--` after such a tag
    // from being dropped as if it were text. Both halves are the same rule —
    // agree with the tokenizer about where a tag starts and where it ends.
    let text = '';
    const map = [];
    let inTag = false;
    let quote = '';
    for (let k = 0; k < raw.length;) {
      if (!inTag && raw[k] === '<') {
        if (raw.startsWith('<!--', k)) {
          const end = raw.indexOf('-->', k + 4);
          k = end === -1 ? raw.length : end + 3;
          continue;
        }
        // BOGUS COMMENT. A `<!` that is not a comment, a `<?`, and a `</` not
        // followed by a letter all take the tokenizer to the same state: consume
        // to the next `>` and emit a comment node — nothing inside becomes an
        // element. Sol round 9 (P1) found the reachable one:
        //   <label class="raven-grab-loose"><![CDATA[<label class="raven-grab-field"><span>]]>
        // CDATA is only real in foreign content (MathML/SVG), so in HTML this is
        // a bogus comment ending at the first `>`, the fake covered label never
        // exists, and the mic renders under `raven-grab-loose`. The scan kept the
        // text, matched the fake opener against the following REAL `<span>`, and
        // reported coverage. GREEN, on the 396px defect.
        if (raw[k + 1] === '!' || raw[k + 1] === '?'
          || (raw[k + 1] === '/' && !/[a-zA-Z]/.test(raw[k + 2] || ''))) {
          const end = raw.indexOf('>', k + 1);
          k = end === -1 ? raw.length : end + 1;
          continue;
        }
      }
      if (inTag) {
        if (quote) { if (raw[k] === quote) quote = ''; }
        else if (raw[k] === '"' || raw[k] === "'") quote = raw[k];
        else if (raw[k] === '>') inTag = false;
      } else if (raw[k] === '<' && /[a-zA-Z/]/.test(raw[k + 1] || '')) {
        // `!` and `?` are gone from this class: they are bogus comments, handled
        // above. What is left is a real start tag or a real end tag.
        inTag = true;
      }
      text += raw[k];
      map.push(rawMap[k]);
      k += 1;
    }
    return { text, map };
  }
  function enclosedByCovered(windowStart, micAt) {
    const { text, map } = emittedWindow(windowStart, micAt);
    // Enclosure is EXISTENTIAL (round 6): every start tag in the window is a
    // candidate and the mic is covered if ANY of them is both
    // concatenation-joined and balanced. There is no "nearest opener" to pick.
    for (let at = 0; at < text.length; at += 1) {
      const tag = text[at] === '<' ? parseStartTag(text, at) : null;
      if (!tag) continue;
      for (const container of CONTAINERS) {
        if (!hasClass(tag.attrs, container.cls)) continue;
        // The two field openers require `><span>`, because the shared rule is
        // `.raven-grab-field > span` — the mic lives one level in, and the tail
        // is what encodes it.
        if (container.tail && !text.startsWith(container.tail, tag.end)) continue;
        // The glue region runs from the opener's FIRST emitted character, not
        // from just past its last. Sol round 7 (P1) measured why: a decoy
        // assembled across a statement boundary — `'<div class="raven-grab-'`,
        // then `var decoy = 'class="raven-grab-'`, then `'field"><span>' +`
        // the mic — fuses in the emitted view into an opener that never renders,
        // and checking only AFTER the fake opener never examines the assignment
        // that proves it is not one. Starting at the opener's own first
        // character puts every source position it spans under the same rule, so
        // an anchor is accepted only when nothing but concatenation of literal
        // fragments builds it AND joins it to the call.
        const startSrc = map[at];
        const after = tag.end + container.tail.length;
        if (CONCATENATION_ONLY.test(view.glue.slice(startSrc, micAt))
          && wellNested(text.slice(after))) return true;
      }
    }
    return false;
  }

  // Finding the call sites is a LEXICAL question, and round 5 answered it with a
  // substring scan of `code` — which keeps string contents. Sol round 6 broke it
  // in both directions, and both are silent:
  //
  //   the literal text "voiceButtonMarkup(" inside a string   -> 9 sites, correct code RED
  //   a real site written `voiceButtonMarkup /* gap */ (…)`   -> 8 sites, the new mic
  //                                                              never examined at all
  //
  // The second is the dangerous one: the count assertion still reads 8, the new
  // mic is in an uncovered container, and on a template-mode row the browser test
  // cannot render the whole suite reports 2 pass / 0 fail.
  //
  // So the scan runs over `glue`, where string interiors AND comments are both
  // blanked — a literal cannot masquerade as a call, and a commented-out call is
  // still not a site (the round-3 property, preserved). The identifier is then
  // required to be a WHOLE token with `(` as its next significant character,
  // which is the round-5 lesson applied to the search itself: a fixed-window
  // regex is defeated by distance, a token read is not. The declaration is
  // skipped by reading the preceding token rather than a 12-character window,
  // for the same reason.
  const IDENT = /[\w$]/;
  const identBefore = (at) => {
    let p = at - 1;
    while (p >= 0 && /\s/.test(view.glue[p])) p -= 1;
    let w = p;
    while (w >= 0 && IDENT.test(view.glue[w])) w -= 1;
    return view.glue.slice(w + 1, p + 1);
  };
  const sites = [];
  const call = /voiceButtonMarkup/g;
  let match;
  while ((match = call.exec(view.glue)) !== null) {
    const end = match.index + 'voiceButtonMarkup'.length;
    if (match.index > 0 && IDENT.test(view.glue[match.index - 1])) continue;
    if (end < view.glue.length && IDENT.test(view.glue[end])) continue;
    let k = end;
    const skipSpace = () => { while (k < view.glue.length && /\s/.test(view.glue[k])) k += 1; };
    skipSpace();
    // A GROUPING parenthesis around the callee emits byte-identical markup:
    // `(voiceButtonMarkup)(…)` is the same call. Sol round 8 (P1) measured both
    // of its directions — with one of today's sites written that way the count
    // reads 7 and the suite goes red on correct code, and with a NINTH mic
    // written that way the count still reads 8, the new mic is never examined,
    // and an uncovered template-mode row reports 2 pass / 0 fail. The second is
    // the round-6 lesson again: a call form the scan does not recognise is a
    // silent hole, not a spelling preference.
    //
    // Balanced groupings are stripped in pairs, so `((f))(…)` reduces too. The
    // `(` must be a GROUPING and not an argument list — `foo(voiceButtonMarkup)(…)`
    // calls whatever `foo` returns, not this function, so a `(` whose preceding
    // significant character is an identifier character, `)` or `]` is refused.
    // This is not the dataflow widening the header rejects: it removes syntax
    // around the callee rather than evaluating anything.
    //
    // Round 8 stripped ONE token on each side, so it only ever recognised a
    // paren sitting immediately before the identifier. Sol round 9 (P1) walked
    // through the gap with the standard indirect-call idiom:
    //   '<div class="raven-grab-loose"><span>Extra'
    //     + (0, voiceButtonMarkup)("data-extra-note", "extra") + '</span></div>'
    // — the same function, a ninth mic, emitted into an uncovered row. The
    // character before the identifier is `,`, so nothing was stripped, the `)`
    // was not a `(`, the site was never recorded, the count still read 8 and the
    // suite reported 2 pass / 0 fail. So the walk finds the MATCHING paren by
    // balance rather than by adjacency, which covers `(0, f)(…)`, `((f))(…)` and
    // `(a ? f : g)(…)` alike. Balance is safe to count in `glue`, where string
    // interiors and comments are already blanked.
    let identStart = match.index;
    for (;;) {
      let f = k;
      while (f < view.glue.length && /\s/.test(view.glue[f])) f += 1;
      if (view.glue[f] !== ')') break;
      let depth = 0;
      let p = f;
      for (; p >= 0; p -= 1) {
        if (view.glue[p] === ')') depth += 1;
        else if (view.glue[p] === '(') { depth -= 1; if (depth === 0) break; }
      }
      if (p < 0 || depth !== 0 || p > identStart) break;
      let q = p - 1;
      while (q >= 0 && /\s/.test(view.glue[q])) q -= 1;
      if (q >= 0 && (IDENT.test(view.glue[q]) || view.glue[q] === ')' || view.glue[q] === ']')) break;
      k = f + 1;
      identStart = p;
      skipSpace();
    }
    // An OPTIONAL call emits byte-identical markup, so it is a site. Round 6
    // walked whitespace to `(` and stopped, which made `voiceButtonMarkup?.(…)`
    // not a call at all — measured on a copy: a mic written that way in an
    // uncovered template-mode row left the count at 8, left the mic unexamined,
    // and the whole suite reported 2 pass / 0 fail on a real misalignment. That
    // is round 6's own A18 finding (a real call the scan does not recognise)
    // reached through a different token, which is why the fix is a token walk
    // rather than another literal spelling.
    //
    // `?` and `.` must be ADJACENT here even though JS allows whitespace either
    // side of the operator, and that adjacency is what keeps a CONDITIONAL out:
    // `voiceButtonMarkup ? (a) : (b)` has a space where the `.` would be, so it
    // falls through to the `(` test and is correctly rejected. `?.name(` is a
    // property access on the function rather than a call of it, and is likewise
    // rejected because the character after the space walk is not `(`.
    if (view.glue[k] === '?' && view.glue[k + 1] === '.') { k += 2; skipSpace(); }
    if (view.glue[k] !== '(') continue;
    if (identBefore(identStart) === 'function') continue;
    // The window and the glue region are anchored at the OUTERMOST grouping
    // paren rather than at the identifier: a stripped `(` sits between the
    // container and the call, so anchoring at the identifier would put it inside
    // the glue region and CONCATENATION_ONLY would report a correct row red —
    // fixing one direction of this finding by opening the other.
    const line = source.slice(0, match.index).split('\n').length;
    sites.push({ line, covered: enclosedByCovered(windowStartFor(identStart), identStart) });
  }

  // A count assertion is what makes the coverage claim hold going forward: a
  // ninth mic added to a fourth kind of row cannot pass by being new.
  // 9 as of the named-style-versions round: the Versions section heading gained
  // a `data-version-name` mic. Four of the nine are never RENDERED by the
  // fixture (the two template-mode rows, the maintainer-only Component notes
  // heading, and the Versions heading — which needs a selection carrying style
  // edits), so for those this scan is the only guard there is.
  assert.equal(sites.length, 9, 'the number of mics in the overlay changed — check the new one sits in a covered row');

  const uncovered = sites.filter((site) => !site.covered).map((site) => `browser/raven-grab.js:${site.line}`);
  assert.deepEqual(uncovered, [], `mics in a container the shared alignment rule does not cover:\n  ${uncovered.join('\n  ')}\n`
    + 'Either the mic really is outside `.raven-grab-field` / `.raven-grab-feedback-field` /\n'
    + '`.raven-grab-section-heading` — put it back inside one — or it is joined to that\n'
    + 'container by something other than plain `+` concatenation of literal fragments.\n'
    + 'This scan does not evaluate expressions, so a call, a grouping, or a conditional\n'
    + 'between the container and the mic reads as uncovered even when its output is inert.\n'
    + 'Concatenate the literal fragments directly rather than widening this rule.');
});
