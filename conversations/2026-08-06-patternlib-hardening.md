# 2026-08-06 — Pattern library hardening (per-instance log)

Goal: get the pattern library hand-testable (scroll-cue hero search with picture +
attribution). Ordered items from the /goal, worked in Andrew's order.

## Done (measured)

- **Item 1 — verification_failed falsifiable.** Two tests appended to
  `test/reference-forget.test.mjs` with a `withVerificationOutage` helper:
  `process.env` Proxy (the only ESM-visible seam — `fs` monkeypatching is
  invisible to named imports, measured) redirects `RAVEN_REFERENCE_HOME` to a
  regular-file decoy once the sweep is complete (state-described, not
  call-counted), so exactly the post-sweep re-read gets ENOTDIR. Three mutants
  measured: drop `verificationFailed = error.message` in dist/reference-store.js
  → both new tests red, nothing else (before these tests: suite fully green
  under that mutant); drop the `!result.verification_failed` clause in the tool's
  `cleared` → only the tool test red (dies on "NOT fully cleared"); delete the
  note branch → only the tool test red (dies on "could not run"). First helper
  draft restored env before the async tool call ran — its own self-check caught
  it ("the outage never fired"), now documented in the helper comment.
- **Item 2 (#8) — blast radius measured.** Removing localBlockedHosts' try/catch
  outright fails **74 tests** (catch also covers ENOENT; every temp home lacks
  do-not-capture.json). The isolating mutant (`if ENOENT return []; throw`)
  turns exactly the unreadable-list test red. Comment corrected in
  `test/reference-blocklist.test.mjs` — the old "only this test turns red" claim
  was wrong by 74×.

## Done since (all landed, all mutants measured)

- **Policy #4/#5 narrowed** in `docs/PATTERN-LIBRARY-POLICY.md` (wording only,
  code never widened): #5 now says enforcement ends at the overlay handoff —
  the tool takes a URL argument, so the guarantee is what Raven provides and
  records, not what a caller passes in. #4 names the 16 seeded galleries in an
  em-dash list (no count word, so the sentence can't drift numerically), says
  the list is the only enforcement, and keeps the unenumerable stance as a
  position, not a mechanism. `src/reference-blocklist.ts` header comments
  synced (old ones quoted the superseded "not any other curated library" line).
- **#2 mitigation:** pre-write blocklist re-check in `saveReference`,
  immediately above the record write, recomputing `referenceHome()` freshly
  (that is what a re-check means, and it is the injectable seam). Residual
  few-syscall window accepted by written decision — not a lock.
- **#1 decision written** in `deleteReferencesByHost`: residual window ACCEPTED.
  Bounded harm (one stale success on the first takedown, self-heals via search +
  next forget), no locking primitive exists, multi-process authoring
  unsupported. Reopen if a lock lands for another reason, multi-process
  authoring becomes supported, or a real user reports a resurrected record.
- **#7 prefix acceptance** documented at `fieldMatchesTerm`: 'nav' hits 'navy',
  accepted — a false prefix hit costs one extra ranked result; whole-word
  silently loses scroll/'scrolling', a wrong absence that reads as "Raven has
  nothing" in a small corpus.
- **#6 tests** (+8 to the count): html 8000/8001 boundaries, styles-200,
  per-state-200, state-names-200, two-record monotonicity (inert `.alpha`/
  `.beta` selectors with single-word self-checks), EACCES local list, mid-call
  blocklist change (env-Proxy first-read-real/rest-decoy). Round-trip test
  extended to read the record file raw off disk (13-field presence loop);
  gallery test REPLACED by a doc-reading one: parses the policy's em-dash name
  list, maps names→hosts, asserts set equality both directions against
  `BLOCKED_HOSTS.filter(reason === 'gallery')`.

## Mutant matrix (measured 2026-08-06, dist backups in-memory, restore verified)

| Mutant | Red tests |
|---|---|
| M-A rect symmetric drop | 1 — round-trip only |
| M-B html `>`→`>=` | 1 — 8000 test only |
| M-C html `>`→`> LIMIT+1` | 1 — 8001 test only |
| M-D validateStyleMap `>`→`>=` | 2 — styles-200 + per-state-200 (shared fn) |
| M-E state names `>`→`>=` | 1 — state-names-200 only |
| M-F partialQueryTerms `.slice(0,1)` | 2 — phrase-outranks + two-record test; the one-record 'adding a word' test stays GREEN under it, exactly the blindness the new fixture closes |
| M-G catch→SyntaxError only | **81** — also rethrows ENOENT; proves catch breadth, isolates nothing |
| M-G2 ENOENT-preserving narrowing | 1 — EACCES test only |
| M-H doc drift (rename in policy) | 1 — gallery test only |
| M-I code drift (rename in GALLERY_HOSTS) | 1 — gallery test only |
| M-J delete pre-write re-check | 1 — mid-call test only |

Suite green: **1363 tests / 1360 pass / 0 fail / 3 skipped** (+8 over the 1355
post-item-1 figure, exactly accounted: 2 html + 3 style boundaries + 1
monotonicity + 1 EACCES + 1 mid-call; round-trip extension and gallery
replacement move no count).

## Seed attempt four — FAILED at the cap, stopped per the goal

Command run verbatim. The overlay booted, the readiness guard passed, and the
click at (720, 875) selected `div:nth-of-type(2) > div:nth-of-type(2) >
div.word:nth-of-type(2)` — a per-word text-animation leaf, not
`#home-hero-scroll`. The hard verdict refused to store it ("nothing saved");
verified `~/.raven/references/index.json` still holds `ref_ids: []` and no
record files.

Four attempts, four distinct diagnoses:
1. www redirect refused (fixed).
2. Fixed 4s sleep stored a preloader (fixed: readiness guard).
3. Readiness guard asserted the LEAF from elementFromPoint against per-word
   divs (fixed: point-check readiness-only, hard verdict on the selection).
4. **The click itself selects the leaf.** lusion.co splits its hero text into
   per-word divs inside `#home-hero-scroll`; a synthetic point click gets the
   topmost leaf, and the target is only reachable by WIDENING the selection —
   the overlay's Layers-panel parent traversal, which a human does by hand and
   the seed script does not drive.

Named remedy (not executed — attempt four is the cap): either drive the
overlay's parent-traversal from the script, or seed the first record by hand —
which is literally the use case the goal wants testable. The hand flow needs
no script.

## Post-segment state

- Final clean `npm test` (rebuild + full suite): **1363/1360/0 fail/3 skipped**,
  44.2s. CLAUDE.md ledger updated (+14 accounted: 4 vocabulary tests already in
  `6593897` but missed by the 1349 ledger entry, 2 verification tests, 8 this
  round) plus a new TOCTOU-disposition landmine.
- Adversarial pass: GLM 5.2 failed twice with empty content (`finish: length`
  both runs — its provider ignored the reasoning cap and reasoning ate the
  whole completion budget; a silent clean exit is a FAILED run, not a clean
  bill). Kimi K3 (`effort: low`) carried the pass: six verdicts, three
  refutations, all dispositioned:
  - **Claim 1 REFUTED — fixed.** The gallery test filtered `BLOCKED_HOSTS` by
    `reason === 'gallery'`, so a host appended to `GALLERY_HOSTS` with a
    mislabeled reason escaped both directions — the equality was over the
    LABEL, not the LIST. `GALLERY_HOSTS` is exported now, the test compares
    membership, and a label-pin assert catches the mislabel itself. Mutant
    M-K1 (append a `reason:'takedown'` entry to `GALLERY_HOSTS` in dist)
    measured: exactly the gallery test red.
  - **Claim 2 REFUTED — residual named, not closed.** A non-atomic in-place
    edit of do-not-capture.json observed mid-write parses as garbage, degrades
    to `[]` (the swallow is by design — a corrupt file must not brick every
    capture), and the pre-write re-check passes. Accepted as the cost of the
    swallow direction; the re-check comment now names it instead of claiming
    a few-syscall bracket unconditionally.
  - **Claim 3 SURVIVES** (no env read ahead of the entry check).
  - **Claim 4 REFUTED — disposition: framing, no change.** The doc being a
    test input is claim 1's intended design, not smuggled behavior; the other
    behavior changes in the round (#2 re-check, #7 acceptance, #1 decision)
    were separate declared items, not riders on the policy edit.
  - **Claim 5 SURVIVES** (monotonicity fixtures inert; the singles self-checks
    prevent a vacuous pass).
  - **Claim 6 REFUTED — DECISION reworded, ACCEPT unchanged.** Two real
    escalations of the stated harm: "self-heals" is contingent (the clean
    report is the reason nobody runs the next forget — retention is
    indefinite until someone looks again), and a resurrect via
    `attachReferenceImage` restores record + rendered PNG whose ref_id was
    never in the sweep's plan, so the result cannot name it. The DECISION
    block now states the harm at its worst; the accept stands on the same
    three reopening conditions. CLAUDE.md landmine synced.
  Final suite after fixes: **1363/1360/0/3**. Raw agent output in
  `.claude/patternlib-2026-08-04/agent-output/` (gitignored: GLM-…, KIMI-…);
  hand-written brief at
  `.claude/patternlib-2026-08-04/ADVERSE-BRIEF-2026-08-06.md` (tracked).
- Commit explicit paths, trailer, **NOT pushed** (push deploys mcp.ravenmcp.ai —
  Andrew's call). Local main is 2 ahead of origin; stash@{0} intact.

## Committed

- **`c425150`** — "Harden the pattern library against its own Sol findings, and
  measure every proof" (9 files, 774 insertions, 37 deletions; explicit paths
  via `git commit --only`, trailer present). Post-commit re-run of
  `test/no-private-paths.test.mjs` against the NEW index: 4/4 green. Tree
  clean afterwards; local main now **3 ahead of origin**
  (`c425150`, `6593897`, `1c42ccc`), NOT pushed; stash@{0} intact.
- Final report delivered to Andrew with the two up-front gates (MCP restart;
  empty corpus), the product fork (twelve sites / one scroll cue / galleries
  refused by design), and GLM's #1 refutation quoted verbatim.
- Completion disposition: the goal's done-means offered "one real record …
  **or a stopped-at-four report**" and capped seeding at attempt four
  ("don't grind"); the stopped-at-four branch was taken. The remaining gap to
  the hand test is gated on Andrew: reconnect the MCP server, then hand-seed
  the first record (grab session on lusion.co → widen to `#home-hero-scroll`
  in Layers → `capture_reference`), or authorize teaching
  `scripts/seed-reference.mjs` selection-widening as new scope.

## 2026-08-07 — First record landed; hand test verified end-to-end

Andrew reconnected the MCP server (`/mcp`, "you do the rest") — that
authorization is what unblocked the hand flow the cap had parked. Executed the
named remedy exactly: grab session proxying `https://lusion.co`, bridge opened
in Chrome, click on the cue selected the `div.word` leaf (the diagnosed
failure, reproduced live), **widened via the Layers panel parent row** to
`div#home-hero-scroll` (inspector confirmed 224.6×26.7px — the measured rect),
sent with an instruction, drained one selection, `capture_reference` saved it.

- **`ref_msjbzbd0_hzf7zqdq`** — host lusion.co, owner third-party, taxonomy
  `[scroll-cue, hero]`, tags + note per the seed command, thumbnail
  `ref_msjbzbd0_hzf7zqdq.png` (225×27, fidelity offline), credit "Pattern from
  Lusion (lusion.co) — https://lusion.co".
- **Hand test PASSES:** `search_references("scroll cue hero")` → 1 result,
  score 7, why "Matched note, tags, selector.", `display.image_path` +
  credit + third-party notice all present. Eyes-on the PNG: reads "SCROLL TO"
  in a serif fallback — Aeonik is a remote webfont and the offline render
  blocks it, so the wider fallback wraps "explore" out of the fixed 27px
  height. Documented offline-fidelity cost, honest per design; noted, not fixed.
- Grab session stopped, tab closed, no pending overlay changes left (one
  accidental Move pending from the drag test was Removed before teardown).

## 2026-08-07 — New /goal (four items) + live drag-drop evidence

Andrew's new goal: (1) voice input to the Instructions box and every overlay
input; (2) mood boards from the Taste Engine interview; (3) Higgsfield
brand→design-system flow — BLOCKED on a YouTube link he will share; (4)
drag-and-drop "wasn't working for me yesterday". All four captured in
`.claude/linear-backlog-queue.jsonl` (2026-08-07 entries, verbatim quotes).

Drag-drop evidence, gathered on the live proxied session before teardown:
panel drag-by-header WORKS (panel moved freely), Layers row drag-to-reorder
WORKS (Reorder preview, "Move pending" chip, live page preview, "Send 1
change"). Both function in Chrome via synthetic drag on this machine, so
either Andrew's surface/browser differs or he means direct on-canvas element
dragging, which does not exist. Question to Andrew pending; do not build on a
guess.

## Must reach Andrew up front in the final message

1. Restart/reconnect the MCP server — it runs stale code that silently drops
   taxonomy; corpus is empty until the seed lands.
2. Product fork: twelve sites scanned, one hero scroll cue; the galleries that
   would find more are exactly what the blocklist refuses. His call.

## 2026-08-07 — Drag-drop answered; voice input built

Andrew answered the drag-drop fork: **"Dragging elements on the page itself"**
— direct manipulation of actual page content, a NEW feature, not a repro of
the working panel/row drags. This is `idea_grab_live_move_preview` (captured
2026-07-24) promoted to a confirmed ask: on-canvas drag → optimistic
`insertBefore` preview → pending-changes tray → agent applies. Backlog entry
updated. Build after voice input (same overlay file, serialize).

Voice input v1 SHIPPED to the working tree (not committed at time of writing):
- `browser/raven-grab.js` (+ byte-identical mirror): module-scope `dictation`
  state beside `instructionDraft`; `speechRecognitionCtor()` feature detection
  (button simply absent when no recognizer — required or the vm harness's
  window stub changes behavior for every existing test); mic button rendered
  by `voiceButtonMarkup()` in the existing `.raven-grab-section-heading` flex
  idiom on the Instructions composer AND both use-case textareas; one
  delegated `onPanels("click")` branch; final transcripts append via
  `field.value` + dispatched bubbling `input` event so the existing delegated
  handler updates `instructionDraft`/`componentRequest.useCase` and send
  enablement — one code path with a keystroke. `continuous: true`,
  `interimResults: false`. Fields are queried at result time, never captured
  as nodes (renderPanel rebuilds, 81 call sites). Pulse animation clamped in
  the reduced-motion block (separate rule — the pinned line stays untouched).
- `test/grab-overlay-voice-input.test.mjs` (5 tests, real Chromium, fake
  SpeechRecognition installed by the fixture BEFORE overlay injection —
  headless Chromium ships webkitSpeechRecognition with no speech service, so
  the feature-absent fixture must force BOTH ctors undefined or it measures
  nothing). Falsifiability: five mutants served through
  `RAVEN_GRAB_ASSET_PATH`, each load-checked first; M2–M5 redden exactly one
  test each, M1 (delete the click branch) reddens the four interaction tests —
  shared entry point, radius measured and documented in the file header.
  Runner: scratchpad `run-voice-mutants.mjs` (session-ephemeral, results
  recorded here).
- Live-surface caveat: the fake recognizer proves the wiring; real dictation
  quality/mic permission flow is UNVERIFIED until Andrew tries it on his
  machine (loopback bridge pages are secure contexts, so Chrome will show the
  mic permission prompt on first use).

Mood-board recon+spec drafted by a delegated leg (taste interview mechanics at
src/taste.ts, reuse of pattern-library display objects, taste-portrait.ts as
the artifact template; board = derived artifact keyed by ref_ids so takedowns
hole it automatically). Three open questions for Andrew queued in the final
report. Higgsfield still blocked on his link.

### Adverse pass on voice input (Kimi K3 via ow-run, 2026-08-07) — SURVIVES, 1 P2 + 3 P3, two fixed

Codex is out of credits, so the falsification pass ran through `ow-run moonshotai/kimi-k3 8000 medium` with a fully inline stdin payload (~28KB: brief + diff + test suite + panelQuery/input-handler excerpts) — ow-run is a single-shot OpenRouter call with NO file access, so "read these files" briefs are useless to it. First invocation failed by passing the prompt as an argv (parsed as int max_tokens); the prompt goes on STDIN.

Dispositions:
1. **P2→P3, exclusion verified + pinned in a comment.** Claimed both `[data-use-case]` fields (consumer use-case, maintainer notes) could coexist and first-match `panelQuery` would misroute a transcript. Structurally false: `componentProcessMarkup` (raven-grab.js:9732) renders maintainer OR consumer via one ternary and is consumed exactly once (9742) — at most one `[data-use-case]` in the DOM. The exclusion is now named in `appendDictatedText`'s comment.
2. **P3, FIXED.** The empty-text early return ran before the field-existence check, so a noise-only final (Chrome emits them) arriving after the user navigated away never queried the field and left the recognizer live forever. Reordered: field check first. New test removes the field nodes directly (a re-render would rebuild them) and asserts a `'   '` final stops the recognizer. Mutant M6 (revert the ordering) reddens exactly that test.
3. **P3, FIXED (test + mutant; code was already correct).** The `dictation.recognizer === recognizer` identity guard in onend was load-bearing and unmeasured — the fake's synchronous `stop()`→`onend` can't model real Chrome's async delivery. New test replays a stale onend from a replaced recognizer by hand and asserts the new session survives. Mutant M7 (weaken the guard to bare `dictation`) reddens exactly that test.
4. **P3, ACCEPTED.** `\s+`→space collapse flattens newlines in transcripts. Deliberate normalization; dictated text is spoken prose, and the field is editable.

Mutant radii after the additions (all seven measured): M1 six red (shared click entry), M4 two red (both assert stop() was called), M2/M3/M5/M6/M7 exactly one each. Voice suite now 7 tests.

### Checkpoint: on-canvas drag-and-drop (2026-08-07, in progress)

Voice input is DONE and committed (`0531faf`, explicit paths, not pushed — 6 commits ahead, push is Andrew's call). Active work: /goal item 4, Andrew's answer "Dragging elements on the page itself" — drag a SELECTED element directly on the canvas to reorder/reparent it, optimistic preview, tray row, agent applies from the drain.

**Design decision (Option A): drive the EXISTING layer-move machinery from a canvas gesture. No new payload field, no bridge change.** The Layers tab already has the full draft system and the canvas gesture just becomes a second entry point into it:
- `reorderLayer(fromId, toId)` browser/raven-grab.js:7828 — same-parent; toId = sibling whose index becomes the target (splice semantics: take the sibling's slot — lands after it when dragging down, before it when dragging up; classic list-drag UX, so hovering a sibling = take its slot, NO midpoint math needed for same-parent).
- `reparentLayer(fromId, toParentId, toIndex)` :7933 — cross-parent; guards cycle/shadow-iframe boundary/depth-12 internally, surfaces layerNotice + renderPanel on refusal.
- Both do applyLiveMovePreview (optimistic DOM move) + tray row + sendLayerOrderRecord themselves. Draft removal/revert exists at removeChange ~8704.
- `refreshAppliedLayerTree()` :7469 is SYNCHRONOUS — call it when `!layerTree` before mapping elements to node ids.
- `layerElements` (Map id→element, :190) — reverse lookup by iteration to get a node id from a DOM element.

**Gesture plan:** document-level pointerdown/pointermove/pointerup in CAPTURE next to the existing canvas click listener (:11802), reusing its guard ladder (textEditingElement / armed / bothCollapsed / host-in-composedPath / inIgnoredRegion / button 0). pointerdown only arms when the target is inside `selectedElement`. ~6px threshold before activating (below threshold = plain click, selection works unchanged). While active: `elementsFromPoint` (plural — skip host + dragged subtree, NO inline pointer-events mutation on the page element), walk up to find (a) a sibling of the dragged node → reorder, or (b) a container with a node id → reparent with toIndex from the child under the pointer (+1 past its midpoint along the container's flex axis). Drop indicator = new div in the shadow root beside `highlight` (:1426 idiom). On drop: call reorderLayer/reparentLayer, re-highlight, suppress the trailing click via a one-shot flag consumed at the top of the click listener.

**Proxy mode:** `captureOnly` flag already exists at :50 (`suppliedGrabConfig.authoring === "withheld"`) — gesture never arms when captureOnly; /layers* routes are withheld by the bridge in proxy mode (src/grab-bridge.ts:1100-1121) so a draft could never be sent anyway.

**Verification ladder queued:** cp mirror + cmp; new test/grab-overlay-drag-move.test.mjs (real Chromium: optimistic order change, tray row, removal revert, below-threshold = click, proxy-disabled, reparent boundary refusal); measured mutants via a scratchpad harness (same pattern as run-voice-mutants.mjs); RAVEN_NO_USAGE_LOG=1 npm test full suite; ledger; Kimi K3 adverse pass via ow-run (STDIN payload, ~8000 max_tokens medium); explicit-path commit.

Blocked elsewhere: mood boards on Andrew's 3 answers; Higgsfield on his YouTube link.

### Drag-and-drop mutant measurement, round 1 (2026-08-07)

First run of the 7-mutant falsifiability matrix against `test/grab-overlay-drag-move.test.mjs` falsified two of the header's own claims — exactly the "a first-run-green test is guessed until proven red" rule firing:

- **M1 (never arm): 4 red, not the claimed 5.** Reorder, reparent, remove-revert, trailing-click went red. The below-threshold, Escape, and proxy tests all SURVIVED because they assert the same nothing-happens the mutant produces. The Escape survival is the real defect: the test never asserted a drag was active before Escape, so "nothing to abandon" and "abandoned" were byte-identical in every observable it read.
- **M2 (zero slop): 0 red — the below-threshold test could not fail.** Root cause is geometric: in non-overlapping block flow, any pointer that stays inside the dragged element yields ins === fromIndex → plan "none" → the release changes nothing whether or not the drag armed. A 3px in-place wiggle inside a 48px row makes the zero-slop mutant behaviorally invisible; suppressCanvasClick is likewise invisible for a same-element press.
- M3–M7: exactly 1 red each, each on its intended test — those five rows were honest.

Fixes applied before round 2:
1. **Dense fixture** `#dense` (three 6px-tall rows, no margin) added to FIXTURE_BODY. The below-threshold test now presses 1px above #m1's bottom edge and wiggles 5px down — sub-slop (25 < 36) but past #m2's midpoint, so under zero slop the wiggle applies a REAL reorder ([m2,m1,m3] + draft), which is the accidental-move harm the 6px threshold exists to prevent, made observable.
2. **Escape precondition**: mid-drag `indicatorVisible === true` asserted before Escape, so never-arm now reddens it (M1 expected radius becomes 5).
3. Header matrix rewritten to measured radii with both first-draft failures named in place.

Round 2 of the mutant run in flight; expected M1=5, M2=1 (exactly below-threshold), M3–M7 unchanged at 1 each.

### Drag-and-drop mutant measurement, round 2 (2026-08-07)

Re-run after the dense-fixture and Escape-precondition fixes — all seven radii now measured and matching the header:

- M1 (never arm): **5 red** (reorder, Escape, reparent, remove-revert, trailing-click); below-threshold + proxy survive on the same-nothing-happens principle. The Escape red is the new precondition earning its keep.
- M2 (zero slop): **exactly 1 red** — the below-threshold test, via the dense fixture's sub-slop midpoint crossing. Fixed from 0 red in round 1.
- M3 (no indicator): **2 red**, up from 1 — the Escape mid-drag precondition reads the same indicator as the reorder test. Shared observable, shared radius; header row corrected to say so rather than claiming two independent guards.
- M4 (Escape applies), M5 (no click suppression), M6 (no reparent), M7 (no captureOnly guard): exactly 1 red each, each on its intended test.

Clean suite 7/7 (~1.8s). Full `npm test` + Kimi K3 adverse pass in flight; ledger update and explicit-path commit after both land.

### Drag-and-drop: Kimi K3 adverse pass + round 3 mutant measurement (2026-08-07)

Kimi K3 adverse pass (`ow-run moonshotai/kimi-k3 8000 medium`, $0.15, 632s, truncated mid-finding-8 at the token cap; raw output in gitignored `.claude/agent-output/kimi-drag-adverse-2026-08-07.md`). Eight findings, dispositioned in full:

- **F1 (P1, CONFIRMED — lost pointerup wedges the page).** No `event.buttons` check meant a release outside the window, or over an iframe (whose document swallows the pointerup), left `canvasDrag.active` forever — every subsequent pointermove viewport-wide was preventDefault-ed until the next press. Fix: pointermove now aborts the drag when `(event.buttons & 1) === 0`, plus a window `blur` listener abandons an active drag (window switch delivers neither pointerup nor click).
- **F2 (P1 — teardown untested).** True: no pointercancel, lost-pointerup, foreign-pointer, or second-pointerdown tests existed; a delete-the-pointercancel-handler mutant survived all 7. Fix: tests 11–14 + mutants M8/M9/M10/M13/M14.
- **F3 (P2 — untested branches).** True: flex-row x-axis, upward reorder, and INTO-container reparent were all unexercised. Fix: fixture gained `#row` (flex row) and test 8 (upward, splice arithmetic `[d,a,b,c]`), test 9 (INTO a container's own padding), test 10 (x-axis via order change that is a no-op on the wrong axis); mutants M11/M12/M15.
- **F4 (P2, CONFIRMED — suppression armed on non-click paths).** `suppressCanvasClick` was set unconditionally, so a pointercancel (no click ever follows) left the flag armed to eat a later keyboard-generated click. Fix: `finishCanvasDrag(apply, expectTrailingClick)` — cancel/lost-pointerup/blur pass `false`; pointerup and Escape-with-button-down arm it.
- **F5 (P2, CONFIRMED — second pointerdown overwrote in-flight state).** Stale drag's indicator stranded, plan silently discarded. Fix: `if (canvasDrag) clearCanvasDrag();` at the top of pointerdown; test 14 + M13.
- **F6 (P3 — midpoint arithmetic under transforms/overlap).** ACCEPTED as v1 residual: getBoundingClientRect midpoints are approximate under scale/rotate and overlapping absolute positioning; the tray row is the guard. Documented, not fixed.
- **F7 (P3 — preventDefault at arming).** Deliberate: the selected element's own mousedown handlers are within the constraint's letter ("beyond the selected element"); documented in code.
- **F8 (P3 — Escape/modal ordering unverifiable from the diff).** VERIFIED TRUE by reading both registrations: drag Escape keydown at ~12105, settings-modal keydown at ~12153, same node/phase, registration order holds, `stopImmediatePropagation` protects the modal. Untested residual, accepted.

Round 3 mutant matrix — 15 mutants, all measured, every radius matching prediction:

- M1 (never arm): **12 red** — every local drag test; below-threshold + proxy survive on the nothing-happens principle.
- M2 (zero slop): 1 red (below-threshold, dense fixture). M4 (Escape applies), M7 (captureOnly): 1 each.
- M3 (no indicator): **6 red** — every test asserting the indicator mid-drag (reorder, Escape, lost-pointerup, foreign-pointer, pointercancel, second-pointerdown). Shared observable, shared radius.
- M5 (no click suppression): 1 red — **aborted first on a stale find-string** (the F4 rewrite turned the suppression line conditional); harness corrected, re-run, exactly the trailing-click test. A find-string mutant goes stale the moment its line is edited — re-verify the whole matrix after any fix round, never carry a radius forward.
- M6 (no reparent): **2 red** — both reparent tests (cross-parent leaf + INTO-container) share the killed line.
- M8 (no buttons check) → lost-pointerup only; M9 (no pointercancel) → pointercancel only; M10 (no pointerId check) → foreign-pointer only; M11 (leaf-only reparent) → INTO-container only; M12 (axis always y) → flex-row only; M13 (no stale clear) → second-pointerdown only; M14 (unconditional suppression) → pointercancel only; M15 (`<=` directional no-op, the natural typo) → upward-reorder only.

Suite green 14/14 (~3.3s); overlay parses and `web/public/raven-grab.js` mirror is byte-identical. Full `npm test` + ledger + explicit-path commit next. Not pushed — push is Andrew's call.

**Full-suite catch (2026-08-07):** the blur listener shipped as bare `addEventListener("blur", ...)` — fine in Chromium where the implicit receiver is window, but `grab-bridge.test.mjs`'s `loadOverlayInternals` runs the overlay in a `vm` sandbox that stubs `window`/`document` and defines no global `addEventListener`, so the whole internals load threw. The drag suite (real browser) could never see it; only the full run did. Fixed to `window.addEventListener` (the file's idiom, 15 existing uses) + re-mirrored. Also a harness lesson re-learned: `npm test | tail -12` in a background task made the notification report tail's exit 0, not npm's failure — never pipe a background verification run's output through anything that eats its exit code.
