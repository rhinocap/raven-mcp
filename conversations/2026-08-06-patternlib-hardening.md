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

### Checkpoint — mood boards (goal item 2) spec + Higgsfield candidate (2026-08-07)

Drag-and-drop (goal item 4) closed as `aea64e9`; voice (item 1) as `0531faf`; both local, 7 commits ahead. NEVER push — Andrew's call.

**Mood-board spec (defaults decided after Andrew never answered the 3 questions; posted in-chat):**
- New stdio tool `generate_mood_board` (110th). In `REMOTE_GATED_TOOLS`, NOT `AUTHED_USER_TASTE_TOOLS`; `TOOL_ACCESS` "destructive" (writes files). Golden anon 45 unmoved; remote+store 56 unmoved.
- New `src/mood-board.ts`: `buildMoodBoardDocument(data)` — pure, self-contained HTML (no scripts, no external loads; pattern PNGs as data URIs with nested credit; reference URLs as text/anchors; never invent hex from prose — scheme/luminance traits pick the ground; note text as chips). `generateMoodBoard({store, profile, project?, mode?, output_dir?})` → writes `<tasteHome()>/moodboards/<profile>--<project>.html` (or output_dir), idempotent overwrite, + best-effort full-page PNG reusing the reference-thumbnail offline pattern (javaScriptEnabled:false, route-abort, serviceWorkers:block). Example mode = canned data clearly labeled EXAMPLE (the "show an example to get their thinking" half of the goal). Board mode with no binding throws naming get_taste_interview. Footer names generate_design_system as the NEXT step — approval stop, never auto-run.
- `src/taste.ts`: kickoff `more_questions` gains `{id:"mood_board", skippable:true, priority:"extended"}`; mention in thenFirstRun/thenFull.
- Decided assumptions: (a) file-on-disk HTML+PNG, no Grab-served surface (creation surfaces live in Morven); (b) composed from stored binding references + pattern-library thumbnails, no drag-arrange; (c) approval stop before design-system generation.
- Count bumps 109→110: taste-remote-full:93, audit-dispatch:226 (+223 title), decision-import:482, redis-taste-store:150, design-review:863 (+ two source-comment regexes at 870/873 → update src/index.ts comments), grab-bridge:886. No test asserts the gated set size (verified by grep — the ledger's "64 gated" is a ledger fact only).
- Then: build, `node scripts/sync-manifest-tools.mjs` (reads dist/), new test/mood-board.test.mjs, measured mutant pass, `ow-run moonshotai/kimi-k3` adverse pass (raw → .claude/**/agent-output/), full `RAVEN_NO_USAGE_LOG=1 npm test` (no tail pipe), ledger, session log, explicit-path commit.

**Higgsfield (goal item 3), GUESSED candidate from a search agent:** "Claude Design 3.0 Destroys AI Slop" — Jack Roberts, https://www.youtube.com/watch?v=wJWO91mi5o0 (~85%). Workflow: Claude Design interview → Higgsfield skill generates brand asset pack via CLI → website → export zip → Claude Code. Awaiting Andrew's actual link before speccing incorporation.

### Mood boards — implementation landed (2026-08-07)
- `src/mood-board.ts` written in full: `moodBoardGround` (majority dark wins, tie/none/mixed → light — a measurement, never prose), `buildMoodBoardDocument` (pure; escapeHtml everywhere; safeHref allows http(s) only, anything else renders as inert text; EXAMPLE banner; footer names generate_design_system and never runs it), `exampleMoodBoardData` (canned dark board, placeholder pattern cards — no fabricated PNGs), `generateMoodBoard` (board mode requires a binding or throws naming get_taste_interview; patterns via per-host searchReferences over the binding's reference hosts, dedup by ref_id, credit from referenceAttribution, PNG embedded as data URI under a 2.5MB per-image / 8MB total cap with named skips; best-effort board PNG per the reference-thumbnail offline-render pattern).
- The `statSync().isFile()` clause turned out belt-and-braces, not load-bearing — a directory at the image path lands in the same catch via EISDIR either way — so the source comment now says so instead of a test pretending otherwise (repo rule: a clause with no reachable trigger must say so).
- `src/index.ts`: tool registered, REMOTE_GATED_TOOLS + TOOL_ACCESS "destructive", comments 109→110. `src/taste.ts`: moodBoardQuestion in fullQuestions (rides the id-set invariant into more_questions on first_run), thenFirstRun/thenFull name the tool. manifest.json resynced (110).
- `test/mood-board.test.mjs`: 11 tests, all green — ground measurement, escaping + safeHref + self-containment on the pure builder, no-invented-swatch (hex whitelist = the fixed chrome palette), example mode (banner, no data URIs, approval stop), no-binding throw, host-matched embed with credit + non-match absent + exact byte round-trip, idempotent path + honest empty-board warning, per-image cap, total budget cap, best-effort PNG under the chromium probe (probe green → null render is FAILURE), interview wiring both depths.
- 14-mutant measured matrix in flight (dist string-edits, clean-baseline-first, load-check, restore-verified). Remaining: matrix radii → suite header, Kimi adverse pass, full suite, ledger, explicit-path commit. NOT pushed; push is Andrew's call.

### Mood boards — Kimi K3 adverse pass dispositioned (2026-08-07, raw in .claude/mood-board-2026-08-07/agent-output/kimi-adverse.json, 12,632 prompt tokens = brief arrived intact, $0.079)
Five breaks claimed; four fixed, one refuted, one design gap accepted:
1. **FIXED** — `data.ground` interpolated unescaped into the meta line (also self-caught pre-verdict). `escapeHtml(data.ground)`; hostile-ground fixture in the new type-violating-data test.
2. **FIXED** — `png_data_uri` unescaped in the `src` attribute of the exported pure builder. `escapeHtml()`; base64 passes through escaping untouched, so the internal producer is unaffected.
3. **FIXED** — record names a thumbnail, file gone → placeholder with NO warning, contradicting "never silent drops". Both the `isFile()` else and the catch now push a ref_id-named warning (same text on purpose — the isFile clause stays belt-and-braces and its comment stays true). New test unlinks the PNG.
4. **(a) REFUTED with evidence** — Kimi claimed the tool is not remote-gated; it read a registration excerpt that didn't include the set. `src/index.ts:1881` has it in REMOTE_GATED_TOOLS. `output_dir` on a local stdio tool writing the caller's own disk is the standing contract; comment added. **(b) ACCEPTED** — safeFilename slug collisions can silently overwrite a sibling project's board; the board is regenerable in one call, so hash-suffix naming was weighed and refused; DECISION comment at the fileStem line.
5. **FIXED** — "measured from references" printed when zero scheme-bearing references existed. Meta now says "(default — no reference schemes to measure)" when nothing voted; sparse test asserts both directions. Also found the canned example contradicting the policy it demonstrates (1-1 tie declared dark): stripe.com swapped for vercel.com (genuinely dark), with the reason in a comment.
6. **ACCEPTED (design gap)** — the majority vote is unweighted because traits carry no confidence field; nothing to weight by.
Test critiques taken: assertSelfContained widened (iframe/object/embed/frame, srcset, single-quote/whitespace src variants); empty-board warning now pinned in BOTH directions (absence asserted on a populated board); PNG-test chromium dependence is the standing probe idiom (skip count reveals the environment) — accepted as-is; budget-test embed-order untested — stated in its comment, accepted.
Also: full `npm test` caught four exact interview-id-list assertions in test/taste.test.mjs (1168/1188/1248/1306) that the id-set invariant test doesn't cover — 'mood_board' inserted after 'references' in all four. And the first full-suite run was piped through tail, eating the exit code (the exact carried lesson); rerun without a pipe.

### Mood boards — closed out (2026-08-07)

- Full suite green after the four `test/taste.test.mjs` id-list fixes: **1397 tests / 1394 pass / 0 fail / 3 skipped in ~44.2s**, exit code read from inside the log file (`SUITE_EXIT:0`), never from a pipe. The +13 over 1384/1381 is exactly `test/mood-board.test.mjs`.
- 18-mutant matrix all killed, radii measured (node --test prints each failure twice; halved): fifteen ×1, escape-nothing ×2, tie-reads-dark ×2, never-embed ×3 — each wide radius one shared mechanism. `statSync().isFile()` deliberately unmutated (EISDIR lands in the same catch, same warning; comment admits belt-and-braces).
- CLAUDE.md ledger updated: headline figure, 109/64 → 110/65 with generate_mood_board named as the fifth gated addition and explicitly LOCAL-only ("do not quote 110 as shipped").
- Committed with explicit paths (hash recorded below after commit). NOT pushed — push deploys live mcp.ravenmcp.ai and is Andrew's call.
- Commit: `d384727` — 18 files, 1036 insertions. Local only; 8 commits ahead of origin/main (origin unmoved, verified by fetch before commit).

### Higgsfield incorporation — analysis drafted, video link still pending (2026-08-07)

**Source status: the specific video is GUESSED.** Andrew said he'd share the link in a subsequent input; it has not arrived. Search found FIVE plausible candidates (Louis Borrego "Claude Design 3.0 (Higgsfield + Claude = $5K+ Websites)" spFlkNscexQ, Jack Roberts "Claude Design 3.0 Destroys AI Slop" wJWO91mi5o0, Andy Stauring kwQhj8kaaY8, Creating with Conor xwSVLN4qPhk, Chase AI 7FU98O0JLHs) — the earlier single-candidate 85% guess was overconfident and is withdrawn. The WORKFLOW below is KNOWN from written sources (Higgsfield's own MCP page, MindStudio's walkthrough), not from any video.

**The workflow class:** Higgsfield connects to Claude two ways — an MCP connector (`https://mcp.higgsfield.ai/mcp`) for exploration, a CLI for Claude Code automation. It generates brand imagery across 15+ models, supports mood boards and reference images as INPUT, locks brand colors to exact hex/RGB, and keeps reusable brand kits + campaign presets. The "brand from scratch" demos have Claude Code orchestrate research → naming/identity → product lines → asset generation.

**Incorporation proposal (draft for Andrew's call — nothing built):**
1. **Cold-start references, not a new dependency.** Raven's taste engine currently assumes the user has references to capture from live sites. The Higgsfield flow fills the cold-start gap: a user with NO product yet generates brand exploration imagery there, and those images become the taste interview's references / mood-board input. The integration point is making Raven's reference intake accept LOCAL IMAGE FILES (with palette/trait extraction), not bundling Higgsfield — the open-source server should not hard-depend on a paid third-party, and the user connects Higgsfield's own MCP themselves.
2. **Hex-locked brand kits → design tokens.** Higgsfield brand kits carry exact hex values; `generate_design_system` is the taste engine's core output (Andrew: "the design system is the core piece upfront"). A small importer — brand-kit colors/type in → token scale out — makes the generated brand land as a REAL design system in Claude Code rather than vibes.
3. **A flow skill, not a tool.** The chain (Higgsfield MCP generate → save locally → mood board → approve → generate_design_system) is orchestration an agent can already do; what's missing is the documented path. A `.claude/skills/` flow doc (or a docs page) is the cheap first ship, and it exercises `generate_mood_board`'s approval stop exactly as designed.
4. **Existing creative surface:** Raven already has `create_generation_job` / `register_creative_asset` / `score_creative` — if deeper integration is wanted later, Higgsfield slots in as a generation backend behind the existing job model rather than as new tool surface.

**Blocked on Andrew:** the actual video link (to confirm/adjust against what he saw) and a direction call among 1–4.

### Higgsfield — all five candidate videos watched via transcript; incorporation grounded (2026-08-07)

**Video identified by CONTENT MATCH, not by link:** transcripts of all five candidates were pulled with yt-dlp and read. Jack Roberts, "Claude Design 3.0 Destroys AI Slop" (wJWO91mi5o0) matches Andrew's description point for point — Higgsfield creates the brand, the result becomes a design system, the design system is imported into Claude Code, and "get the initial design system correct and you can do anything" is the video's own thesis. The other four are content-creation/photo-shoot tutorials with 0–1 design-system mentions (measured by grep). Still needs Andrew's confirmation, but whichever of the five he saw, it has now been watched.

**The video's actual flow (Jack Roberts):**
1. A pasted skill connects Claude to Higgsfield via CLI.
2. Claude INTERVIEWS the user about the brand — product, name, vibe, hero products, what to avoid — for someone starting with NOTHING (the demo brand is invented on the spot).
3. Higgsfield generates the brand pack: logos, product photography, texture packs, palette research, plus a brand explainer doc.
4. The generated files are uploaded into Claude Design's "design systems" feature → a reusable, shareable design system.
5. "The handover": export the design system as a zip, reimport it into Claude Code, and tell Claude to reference it for all future design work. Plus a "one moving piece" showstopper (Higgsfield video / UI sniping from 21st.dev, aceternity, reactbits).

**Refined incorporation thesis:** the video's flow is five manual steps across two products with a ZIP-FILE handover — and Raven natively IS steps 2, 4 and 5. `get_taste_interview` is the brand interview; `generate_design_system` + DESIGN.md is the design system living where the coding agent already reads it (no export/reimport); the new `generate_mood_board` is the approval surface between generation and system. The genuine gaps, in build order:
1. **Local-image reference intake** — `capture_reference` takes a URL + live DOM; a Higgsfield brand pack is a DIRECTORY OF IMAGES. Accept local image files as references (owner:'self', palette extraction for scheme/trait votes) and the whole pack flows into mood board → design system.
2. **Brand-genesis interview mode** — the existing interview calibrates an EXISTING project; the video's interview invents a brand from nothing (name, vibe, avoid-list). A `mode:'genesis'` (or a genesis question set) closes the cold-start gap, and its output brief is exactly what the user pastes into Higgsfield.
3. **Flow skill/docs page** — the documented chain: genesis interview → generate in Higgsfield (user's own MCP/CLI account, never bundled) → import pack as references → mood board → approve → generate_design_system → DESIGN.md. Cheapest ship, exercises the approval stop as designed.

**Remaining user-only inputs:** confirm the video (or supply the real link if it is none of the five), and the direction call on gaps 1–3.

### Higgsfield — incorporation SHIPPED as docs/brand-genesis-flow.md (2026-08-07)

The flow that works with today's tools is now a real artifact, not a proposal: `docs/brand-genesis-flow.md` (linked from README's taste-engine section, so it has a loaded pointer). Interview-as-brand-brief → generate in the user's own Higgsfield (never bundled; their MCP is `https://mcp.higgsfield.ai/mcp`) → mood-board approval stop → `generate_design_system(brand_color, style)` → DESIGN.md. **Verification caught a false claim before it shipped:** the doc's first draft said `init_design_md` consumes the generated system — read the source (`convertStoredSystemToDesignMd` reads `SYSTEMS_DIR` only; `generate_design_system` persists nothing), so the one-call chain does not exist. Step 5 now tells the truth (init from blank/bundled + agent transcribes the DTCG), and the miss became gap 3 in the doc + a backlog entry: storing generated systems is the highest-value fix for "design system as taste-engine output." Tool-surface gaps (local-image references, genesis interview mode, stored generated systems) are left as Andrew's direction call — they change the product, not the docs.

### Stored generated systems — recon + build start (2026-08-07)

Item 3's video-independent directive ("the design system … should be one of the outputs of the taste engine") is gap 3 of the genesis doc, and it is buildable now. Recon established: `generateTokenSet` output shape (`$name`,`$description`,`color`,`color-dark`,`typography`,`spacing`,`radius`,`elevation`,`motion`) is IDENTICAL to the bundled `src/data/tokens/systems/*.json` shape (verified against stripe.json), so persistence is pure serialization. TWO consumers read `SYSTEMS_DIR` with separate copies of the lookup rule — `loadSystem`/`getAvailableSystemIds` (src/index.ts:238) and `storedSystemExists`/`convertStoredSystemToDesignMd` (src/designmd.ts) — so the user-dir lookup goes in ONE new module both import, per the blocklist lesson (one function owns the rule, or preview and action drift). Plan: `~/.raven/design-systems/` (env-overridable `RAVEN_SYSTEMS_HOME`, matching `RAVEN_CREATIVE_HOME` precedent), `generate_design_system` gains `save?: boolean` default false (no new tool — stdio count stays 110, six count suites untouched), refuse a bundled-id collision (bundled wins on load, so a shadowed save is a silent lie), `init_design_md`/`base_system`/`list_design_systems` all see the user dir. Hazard to respect: `normalizeInitSource` silently reads an unknown string as a starter slug — once saved, `storedSystemExists` answers true and the string routes correctly. Next: spec, implement, mutant matrix, Kimi adverse pass. NEVER push.

### Stored generated systems — BUILT, mutant-measured, Kimi-hardened (2026-08-07)

**Shipped (working tree, committed below):** `src/user-systems.ts` (new module owning the lookup rule: bundled first, user second; `RAVEN_SYSTEMS_HOME` read at call time; every read answers nothing and the save throws under `isRemoteRuntime()`), `save?: boolean` on `generate_design_system` (schema key OMITTED in remote mode so the anon tools/list payload never changes — stronger than an arg-guard), all four consumers wired: `base_system` (via `loadSystem`), `get_design_system`, `list_design_systems` (category `user`), `init_design_md` (via `storedSystemPath` in designmd.ts, which also lost its private `SYSTEMS_DIR` copy of the rule). No new tool — stdio count stays 110/65, manifest regenerated UNCHANGED, six count suites untouched.

**Suite:** 1408/1405/0/3, exit 0 (pre-Kimi); +11 over 1397 = exactly `test/user-systems.test.mjs`. Post-Kimi: 14 tests in that file (see below), full suite re-run pending in this checkpoint's follow-up.

**Mutant matrix (pre-Kimi): 13/13 killed, radii measured** — M1 lookup-flip→1, M2 no-collision-gate→2, M3 dir-cached→3, M4 predicate-allows-dotdot→1, M5–M8 (remote reads/list/save/schema)→1 each (all the child-process test: one observable, four mechanisms), M9 never-save→4, M10 refusal-not-error→1, M11/M12 list/ids drop user→1 each, M13 designmd-never-system→1. Harness at scratchpad `user-systems-mutants.mjs`; clean-baseline-first, import()-load-check, string-verified restores.

**Kimi K3 adverse pass (ow-run, 7,883 prompt tokens — brief arrived):** 8 findings, dispositioned:
- **P2-1 REAL, fixed:** a corrupt `broken.json` or a DIRECTORY named `*.json` in the hand-editable user dir killed `list_design_systems` for every caller (EISDIR/SyntaxError thrown mid-listing). Fix: `isRegularFile` (statSync) in `userSystemPath` AND `listUserSystemIds` (one rule for listing and lookup — Dirent.isFile would have split symlink behavior between them); per-entry try/catch in the list handler that LISTS the unreadable entry marked `unreadable` rather than omitting it (silent omission hides the file that needs fixing). Direct `get_design_system` on the corrupt id still errors honestly.
- **P2-2 mechanism REFUTED, test gap REAL, closed:** `base_system` does route through `loadSystem` → the shared lookup (src/index.ts:581) — but nothing pinned it. New seam test: bold parent saved, child inherits its typography; minimal-preset control proves the assertion can fail.
- **P2-3 REAL as a test gap, closed:** byte-identity rested on the schema literal being function-scoped, unpinned. Child process now builds local-FIRST-then-remote (a hoisted schema literal would leak `save` into the remote build and redden the existing assertion).
- **P3-4 REAL, fixed:** the listing didn't dedupe user entries against curated/bundled ids — a decoy `stripe.json` listed twice, one a phantom that can never load as itself. Filter added + test.
- **P3-5 REAL, fixed:** save ran BEFORE formatting, so a formatter throw after a completed save would report an error over a persisted file — "output disagrees with state" mirrored. Reordered save after formatting. NO discriminating test exists (no injectable formatter-failure seam); stated here rather than pretended.
- **P3-6 REFUTED:** the mutant harness exists (scratchpad); Kimi wasn't handed it.
- **P3-7 REAL, fixed:** one-way latch + per-call `remote` flag meant a local server built after a remote one advertised a `save` that always throws. Gate is now `!remote && !isRemoteRuntime()` (description string too); child asserts post-latch local schema omits save — the only assertion separating the latch clause from plain `!remote`.
- **P3-8 ACCEPTED residual:** the isSafeDataId/isSafeSystemId duplication pin covers five dangerous inputs, not the property; already documented in both comments.

**Post-Kimi additions:** 3 new tests + extended child (14 total in the file), 6 new mutants (M14 listing-dies-on-corrupt, M15 no-dedupe, M16/M17 directory-accepted in path/list, M18 base-never-looked-up, M19 gate-drops-latch-clause) + M8/M10 find-strings re-anchored to the moved code. Matrix re-run in progress at checkpoint time.

### Round-2 adverse pass on the fixes — DOES NOT SURVIVE, 3 fixed + 1 accepted (2026-08-07)

**The first round-2 run was a FAILED run, not a clean bill:** `ow-run moonshotai/kimi-k3` came back `ok: true, finish_reason: 'length'` with EMPTY content — the 8000 max_tokens were consumed entirely by reasoning. Per the silent-clean-exit rule, an empty output is never dispositioned as "no findings"; re-ran at 16000 tokens / medium effort, which returned a real 6KB verdict (`finish: stop`). Raw outputs in `.claude/user-systems-2026-08-07/agent-output/` (check-ignore verified).

**Verdict: DOES NOT SURVIVE — 1 P1, 1 P2, 2 P3, all verified against source before fixing:**
- **F1 P1 REAL, fixed:** the round-1 fix hardened the dir's CONTENTS and not the dir ITSELF. `existsSync` answers true for a regular file at the dir path AND for a chmod-000 dir; unguarded `readdirSync` then threw ENOTDIR/EACCES and killed `list_design_systems` for every caller — curated systems included — exactly the shape round 1 claimed eliminated, one level up. Fix: one shared `readUserSystemsDir()` owns the read (listing and health probe cannot diverge); `listUserSystemIds` degrades to `[]`; new export `userSystemsDirProblem()` feeds a `user_systems_note` on the listing payload, because [] alone renders saved systems as silently vanished — the note is what separates "none saved" from "cannot be read". Healthy dir carries NO note (asserted).
- **F2 P2 REAL, fixed:** the unreadable entry shipped `tokens_available: true` — the id listing never parses the file, so `broken` IS in `getAvailableSystemIds()`, and the one field a caller pipelines on lied about a file that cannot load. Gated on the `unreadable` tag (the single marker set where the failure was seen — read it, don't re-derive readability).
- **F3 P3 REAL, fixed:** `loadStoredSystem` returns null (no throw) when the file stops resolving between listing and load; the map only marked THROWN errors, so the entry rendered healthy while `get_design_system` answered not-found. Null-and-unmarked now sets `unreadable`. Test uses the reference-forget env-Proxy seam — the getter discriminates by CALLER (`new Error().stack.includes('listUserSystemIds')`), not call count, so a read reordering fails loudly instead of passing silently; a no-proxy control proves the fixture can fail.
- **F4 P3 ACCEPTED:** `err.message` + the absolute user-dir path interpolate into the listing description/note. Local-only surface by construction (remote lists no user systems before touching the fs), and the path IS the fix instruction — same stance as the per-entry description. Documented in the handler comment.
- **Non-findings (Kimi attacked, held):** schema gate child ordering, save-after-formatting, dedupe vs case-insensitive fs.

**Post-fix measurements:** suite file 17 tests green; mutant matrix re-run WHOLE (drag-feature precedent — M6's find-string had gone stale when the remote guard moved into the shared read; re-anchored): **23/23 killed, restores verified.** New radii: M20 dir-error-rethrow→2 (both dir-level tests), M21 problem-always-null→2, M22 tokens-ungated→2, M23 vanished-not-marked→1. Re-measured old radii widened where the new tests share mechanisms: M3 dir-cached 4→7, M11 2→3, M12 1→2 — shared mechanism, not extra guards. Full suite: see ledger (expect 1414/1411/0/3).

### Video link CONFIRMED + new directives (Andrew, 2026-08-07)

- Andrew's link **https://youtu.be/wJWO91mi5o0** matches the content-match identification exactly (Jack Roberts, "Claude Design 3.0"). Goal item 3's video question is CLOSED; `docs/brand-genesis-flow.md` was already written against this video and names no video, so no doc edit needed.
- **New directive: build gaps 1 and 2.** Verbatim: "Build one and two. The taste interview, etcetera, should always be a genesis because it's when a project kicks off, and it should ask if you already have that stuff. But if not, it should help you generate all of it like the video does." — genesis is not a separate mode; the kickoff should ask what exists and route to generation for what doesn't.
- **Push authorized, release NOT:** "go ahead and push just get it to git. I don't wanna release it yet." Push to origin/main (deploys mcp.ravenmcp.ai — anon 45-hash verified `f64bb18…2bb0a6` pre-push, full payload captured for post-push byte-diff). No npm release, no tag.

### Push record + gaps 1/2 build state (checkpoint, 2026-08-07)

**Pushed d75b77c..6a182f0 (16 commits, Andrew-authorized "just get it to git", NO release/tag).** Post-push anon watcher (b1d5c35z1) CLEAN: "post tools: 45", golden hash MATCH (`f64bb18…2bb0a6`), payload byte-identical (normalized) 66720 → 66720 chars. The stored-generated-systems feature and both Kimi rounds are live on origin/main; npm untouched at 2.3.0.

**Gaps 1+2 in progress (uncommitted working tree, source COMPLETE, tests written, NOT built/run):**
- Gap 1 — local-image intake on `generate_mood_board` (`image_paths?: string[]`): src/mood-board.ts (sniffImageMime from BYTES never extension — png/jpeg/gif/webp, SVG excluded as scriptable; localImages() with per-path resolve/statSync-isFile/read/sniff/cap ladder, every skip warned by path; ONE shared embed budget — locals embed FIRST, `embeddablePatterns(hosts, warnings, alreadyEmbeddedBytes)` continues from their byte count; "Your assets" section, no third-party credit on the user's own material; example mode ignores image_paths with a named warning; escapeHtml on name AND data URI in the exported builder). src/index.ts: schema + description. counts gains `images`.
- Gap 2 — genesis question (kickoff IS genesis): src/taste.ts new core `genesisQuestion` at index 1 (skippable, core; asks what exists — brand/design system/brand assets — and routes what's missing to generation: mood board approval stop w/ image_paths → generate_design_system save:true → init_design_md; existing system → configure_design_system_source or base_system; stored as design_notes.genesis). First-run is now **5 core questions**; "genesis" added to reserved dimension keys; thenFirstRun/thenFull carry the routing. src/index.ts: server instructions + get_taste_interview description + depth describe all moved 4→5.
- Tests: test/taste.test.mjs updated (4 full-list assertions, 5-core deepEqual, new genesis test incl. no-duplicate-learned-question); test/mood-board.test.mjs: counts gain `images: 0` in 2 deepEquals + 6 new local-image tests (embed-by-bytes incl. misnamed .txt, skip-with-named-warning, per-image cap + SHARED budget 3×2.4MB locals + 1MB pattern, example-ignores, exported-builder escaping).
- No new tool: 110 stdio / 65 gated unchanged, six count suites untouched; manifest regenerates for schema/description changes.

**Remaining ladder:** build → taste+mood-board suites → full suite → re-measure the WHOLE 18-mutant mood-board matrix (anchor `let embeddedBytes = 0` was EDITED — stale find-string risk) + new mutants (never-embed-local, sniff-by-extension, silent-skip, budget-not-shared `= 0`, example-silent, unescape ×2, section-drop; taste: genesis-dropped, not-in-core-set, reserved-drop, then-drops-route) → Kimi K3 adverse (16000/medium, `< /dev/null`, raw to agent-output/) → manifest regen → ledger → explicit-path commit → protocol push (pre-capture, post-push byte-diff watcher). NO npm release.

### Kimi K3 adverse round on gaps 1/2 + fix round (2026-08-07)

Round ran clean (ow-run moonshotai/kimi-k3, finish:stop, 8205/3342 tokens, $0.0747; raw archived at `.claude/genesis-2026-08-07/agent-output/kimi-round1{.json,-content.md}`). Six findings, three wiring demands, four claims survived. Dispositions:

- **P2-1 FIXED — readFileSync before any size check (OOM):** the per-image cap is now enforced from `stat.size` BEFORE the read; post-read check stays (file can change between stat and read). The total budget is deliberately NOT pre-checked — anything passing the cap is safe to read, and the budget stays one post-read authority on the bytes actually embedded (the property Kimi verified). Test discriminator: an over-cap chmod-000 file must warn "per-image embed cap", never "could not be read (EACCES)" — the observable stand-in for the 12GB file no test can afford. Root caveat documented in the test.
- **P2-2 FIXED — p.trim() corrupted legal paths and the warning named the wrong fact:** raw path used everywhere; trim survives only in the whitespace-only emptiness refusal. Test: a `logo.png ` (trailing space) file embeds.
- **P3-3 FIXED — PNG sniff checked 4 of 8 signature bytes:** all eight now; `\x89PNGXXXX…` fixture added to the unusable-path test.
- **P3-4 FIXED — no exact-boundary tests:** new test pins both exclusive bounds — a file at exactly 2,500,000 embeds (3 of them + 500,000 land the budget at exactly 8,000,000, all embed) and the first byte past is refused. Four `>`→`>=` mutants (stat cap, post-read cap, budget) + precheck-dropped now in the matrix.
- **P3-5 ACCEPTED — `find(q => q.id === "design:aesthetic")` non-null pattern:** pre-existing; the dimension is static in the same module and the taste suite's first_run deepEqual pins its presence — a rename reds that test before it ships. No code change.
- **P3-6 FIXED (documented) — relative paths resolve against server cwd, `~` never expanded:** stated in the `image_paths` schema description ("use absolute paths"). Gated tool, so no anon-hash movement.
- **Demand 1 (remote gating) REFUTED-AS-GAP:** `generate_mood_board` verified in `REMOTE_GATED_TOOLS` (src/index.ts:1882) and the gated count is pinned by test/taste-remote-full.test.mjs.
- **Demand 2 (pre-existing genesis decision → duplicate question) REFUTED:** learned questions are DERIVED from decisions at read time (dist/taste.js:641 knownDimensionKeys), never persisted; `genesis` in the reserved set means an old store's genesis-keyed decision stops spawning a learned question. The new taste test records exactly that decision and asserts no duplicate.
- **Demand 3 (voice_note/surface/profile escaping) COVERED:** pre-existing escape tests (document-escapes-third-party-text + type-violating-builder) exercise those fields.

**Post-fix measurements (Kimi round):** mood-board+taste suites 104/104; FULL suite **1423 / 1420 pass / 0 fail / 3 skipped** (+3 over pre-fix = exactly the three fix-round tests; half-signature fixture rode inside an existing test). Mutant matrix v3: **41 mutants, 40 killed, 1 EXPECTED survivor** — M22 post-read local cap deletion, reachable only by a file growing between stat and read (TOCTOU; fs monkeypatching invisible to ESM named imports); documented in the code comment, the harness, and the suite header rather than pretended killed. Radii re-measured whole: sniff mutant find-string had gone stale on the 8-byte fix (re-anchored); never-embed-local 2→4, local-budget-dropped 1→2 (new tests share those mechanisms). Manifest: zero diff. Anon-instructions pins passed in the full run (gated description change moved nothing). Harness + raw output archived to `.claude/genesis-2026-08-07/agent-output/{mood-board-mutants-v2.mjs,matrix-v3.out}`. Ledger updated: Verify headline 1414→1423 chain-preserved; push-state line corrected (d75b77c..6a182f0 delivered generate_mood_board; gaps-1/2 + Kimi round are the LOCAL delta).

### Protocol push + deploy watcher (2026-08-07)

- **Commit `4da1d91`** "Add local-image intake to the mood board and make kickoff a genesis interview" — 9 explicit paths (`git commit --only`): CLAUDE.md, this log, docs/brand-genesis-flow.md, src/index.ts, src/mood-board.ts, src/taste.ts, test/mood-board.test.mjs, test/taste-remote-full.test.mjs, test/taste.test.mjs. 590 insertions, 89 deletions. manifest.json unchanged and correctly excluded.
- **Pre-push anon probe** (mcp.ravenmcp.ai): 45 tools, golden hash MATCH (`f64bb18…2bb0a6`), normalized payload 63,453 chars, instructions sha256 `215a17260e…` (the OLD pin, len 6831) — captured to a name-sorted normalized snapshot for the post-push byte-diff.
- **Push `6a182f0..4da1d91`** to origin/main (Andrew-authorised: "go ahead and push just get it to get. I don't wanna release it yet"). NO npm release, NO tag.
- **Deploy watcher (backgrounded, content-matched — polls the anon instructions hash, never a table row):** flipped on poll 4 (~80s). Post-push probe: 45 tools, golden hash MATCH, normalized 63,453 chars, `tools/list` payload **byte-identical** pre/post (`cmp` on the two snapshots), instructions sha256 flipped to **exactly the rebaselined pin** `3ccce9cf2e9366439f0ffed251815176bb7ee7b78ace0f03252c6c7807090658` (len 7294) — the authorised genesis-feature change, nothing else moved. Frozen anon contract HOLDS on the deployed endpoint.
- Ledger push-state line corrected in the same change: gaps-1/2 pushed in `6a182f0..4da1d91`, watcher-verified; nothing on `main` unpushed as of that verification.

### Done-gate falsification pass (Kimi K3, 2026-08-07)

Codex out of credits → `ow-run moonshotai/kimi-k3 16000 medium` (finish:stop, 2741/5090 tokens, $0.0846; brief + raw verdict archived at `.claude/genesis-2026-08-07/agent-output/dogate-{brief.txt,verdict.json}`). Brief was given cold: git state, watcher script + output, probe script, ledger/log excerpts, and asked to REFUTE the completion claim. Six findings:

- **F1 (byte-identical tools/list = stale deploy or dead feature) REFUTED by gating context the cold brief withheld:** `generate_mood_board` is in `REMOTE_GATED_TOOLS`, so the anon `tools/list` NOT changing is the frozen contract holding, exactly as designed; the schema change ships on the stdio/authenticated path, whose behavior is pinned by the 1423-test suite run on this very tree. The instructions-hash flip is the feature's one legitimate anon observable, and it landed on the pre-authorized pin.
- **F2 (instructions hash pins a STRING, not a commit — a rollback serving the same text would pass) CONFIRMED and CLOSED:** read the production deployment directly via API — `dpl_BYuFVtGbyjuWiHGioUJWV4zqSgxA`, commit `4da1d91a05…` exact match, branch main, READY, alias list carries `mcp.ravenmcp.ai`. The alias list names the serving build; the watcher alone never did.
- **F3 (record uncommitted; "nothing on main is unpushed" decays the moment it is committed) CONFIRMED and CLOSED:** the decaying sentence is deleted from the ledger and replaced with the deployment-identity evidence; this record-keeping commit is itself pushed (below).
- **F4 (npm view shows current state, no baseline) CLOSED:** `npm view raven-mcp time` — registry `modified` 2026-07-28T22:17Z = the v2.3.0 publish; nothing published since. No release happened.
- **F5 (push range asserted, origin tip not demonstrated; local-only tag check) CLOSED:** `git ls-remote origin main` → `4da1d91a05…` — the remote tip IS the pushed commit, read from the remote, not the local ref; the npm-time check covers what a remote tag would matter for (no release cut).
- **F6 (63,453 chars vs 63,597 bytes) CONFIRMED, wording fixed:** the probe prints JS string length, `cmp` compared 63,597-byte files; multibyte content accounts for the difference. Ledger now states both numbers and which is which.

Verdict as written was "does not survive"; F1 was refuted with evidence and F2–F6 each closed with a direct measurement, so the completion claim now rests on: suite green on the pushed tree, remote tip = pushed commit, production deployment = pushed commit serving mcp.ravenmcp.ai, anon contract byte-identical, instructions on the authorized pin, npm registry untouched.

### Andrew's five ASAP asks (voice note, 2026-08-07 — arrived after the genesis push)

1. **Voice on the instructions box** (and any input) — transmits to the coding agent. INVESTIGATING: overlay already has a voice-input feature (2026-08-06); establishing which fields carry it.
2. **Mood boards from the taste engine at interview time, with an example to prime thinking** — SHIPPED in `d75b77c..6a182f0` + `4da1d91` (kickoff `mood_board` question, `mode:'example'` sample board).
3. **Higgsfield brand → design-system import** — BLOCKED on the YouTube link Andrew will share in a subsequent input.
4. **Design system as core upfront taste-engine output** — SHIPPED in `4da1d91` (genesis routes missing assets: mood board approval stop → `generate_design_system save:true` → `init_design_md`).
5. **Drag-and-drop on screen with Raven panels up** — "wasn't working yesterday." Prime suspect: proxied grab sessions are capture-only by design, drag never arms there. Reproducing before theorizing.

### Phase-2 build state (checkpoint, 2026-08-07 — post-compaction)

**Root cause for asks 1 & 5 (established pre-compaction):** both features were committed TODAY by a parallel session (voice `0531faf` 12:49, drag `aea64e9` 13:55) — they postdate Andrew's "yesterday" complaint; the stale-npm theory was wrong. The remaining REAL gap: proxied sessions are capture-only, which kills drag (and the whole authoring surface) in Andrew's standard flow, because "previews ship with Raven up" proxies his own dev servers through the bridge. Voice gap: mics existed only on data-instruction and the two data-use-case fields.

**Spec (posted pre-compaction):** (A) mic on every agent-bound text field in the Grab overlay; (B) authoring enabled when the proxy upstream is the user's OWN loopback server; third-party proxies stay capture-only. Files: browser/raven-grab.js (+ mirror), src/grab-bridge.ts, src/index.ts, tests voice-input/round5/round7. Trigger-set diff: before = every proxy withheld; after = non-loopback proxy withheld; round5 keeps the withheld direction via a stubbed non-loopback upstream (round4's withStubbedUpstream pattern).

**DONE — src/grab-bridge.ts:** `proxyCaptureOnly(proxyTarget)` is THE one owning function (hostname LITERAL judgment: exact "127.0.0.1"/"localhost"/"[::1]"; `foo.localhost` refused; unparseable → capture-only, fail closed). Five consumers wired: route withholding (loopback → `bridgeRoute = keyed` for ALL bridge routes), injected `authoring:"withheld"` flag (loopback carries NO flag, matching local sessions), session warning (loopback gets its own wait-for-batchCommit warning), waitUrl (loopback server-mode gets the watcher), drain result gains `captureOnly` field (proxyMode = how served; captureOnly = whether batchCommit can arrive).

**DONE — src/index.ts:** stdio instruction at ~2223 rewritten to key on `captureOnly` (loopback proxy = proxyMode true, captureOnly FALSE → wait for commit); get_grabbed_elements condition `grabbed.proxyMode` → `grabbed.captureOnly`; start_grab_session else-if comment updated. Instruction is inside `if (!remote)` — anon pins untouched.

**DONE — browser/raven-grab.js (mirror synced, node --check clean):** descriptor pattern (`targetAttr` = CSS attribute descriptor; value-qualified `data-template-note='<id>'`), `dictationQuery` (panel || settingsModal), `syncModalVoiceButtons()` called at all four dictation state-change sites, maxLength clamp in appendDictatedText, `data-voice-label` on buttons. Mics added at: template name, component name, fixed-move note, template note (value-qualified), settings-modal feedback message (textarea gained `data-feedback-message`). Modal click listener gained `[data-voice-dictate]` delegation (panel handler never sees modal clicks).

**ZERO overlay changes needed for drag itself:** overlay `captureOnly` (line ~50) derives from `authoring === "withheld"`; loopback configs now omit the flag → drag gate at ~12040 stays open.

**PENDING:** round5 rewrite (loopback fixture becomes the GRANTED case; withheld direction moves to stubbed non-loopback upstream), round7 update (instruction pin text, drain shape gains captureOnly), new bridge tests (unparseable target, foo.localhost, loopback wait_url, drain captureOnly both ways), voice-input test extension (value-qualified selector, maxlength clamp, modal scope/sync mechanisms + mutants), build, full suite (baseline 1423/1420/0/3), measured mutants, Kimi adverse pass (ow-run, raw → agent-output/), eyes-on mic capture, explicit-path commit (include this log + .claude/linear-backlog-queue.jsonl 3 entries, still uncommitted). NOT pushed — push = deploy = Andrew's gate; current directive does not authorize one.

### Phase-2 build — tests migrated, matrices measured (2026-08-07)

**Suites done:** round5 REWRITTEN (5 tests: third-party withheld via stubbed `https://fixture.test`, foo.localhost refused, loopback GRANTED against a real upstream with un-keyed forwarding + watcher + drain divergence, `[::1]` granted, local unchanged); round7 updated (park-race upstream → non-loopback stub + `captureOnly:true` assert; instruction test pins `captureOnly` local-only); voice suite +3 tests (maxLength clamp, feedback-modal mic, value-qualified descriptor). Then the 5 legacy failures migrated — the trigger-set move, withheld direction preserved on non-loopback fixtures, never deleted: grab-bridge.test.mjs :944 and :1579 → `https://fixture.invalid`, :1520 deepEqual gains `captureOnly:false`; round2 :85 → recorded globalThis.fetch stub on `https://fixture.test`; drag-move `withProxiedOverlay` → stubbed `https://fixture.test` (capture-only test keeps its trigger) + NEW `withLoopbackProxiedOverlay` granted test (indicator mid-drag, reorder applied, draft queued — Andrew's actual preview flow at the browser level). Stale pointerdown comment fixed (third-party, not "proxy"), mirror re-synced byte-identical.

**Full suite: 1430 / 1427 pass / 0 fail / 3 skipped** (+7 over 1423 baseline = 3 voice + 3 round5 net + 1 loopback drag).

**Measured mutants (harnesses in .claude/genesis-2026-08-07/agent-output/, gitignored):** voice matrix re-ran WHOLE, 12 mutants, all killed — panel-delegation 7 red (maxLength test joined), stop-without-stop 3 (feedback test asserts stop-call count), modal-delegation 2, modal-fallback 2 (shared lookup), sync-modal-buttons 1, value-qualifier-stripped 1, maxLength-clamp 1, others 1 each. Drag re-measured: never-arm 12→13, no-indicator 6→7 (loopback test joined both), captureOnly-guard exactly 1. Headers updated with re-measured radii. NOTE: harness ✖-regex double-counts node --test's summary repeat — radii above are deduped. Bridge mutants COMPLETE (B1 always-capture-only, B2 endsWith-localhost widening, B3 drain captureOnly=proxyMode, B4 loopback drops keyed): all four killed against dist/, restores string-verified — B1 reddens TWO (loopback + [::1] granted-direction tests), B2 exactly the foo.localhost test, B3 exactly the loopback drain-divergence test, B4 TWO (round2 un-keyed collision + round5 un-keyed /components forwarding). Matrix recorded in round5's header.

**Eyes-on (2026-08-07):** real-Chromium capture of both mic placements via capture-mics.mjs (agent-output/) — panel Instructions mic renders right-aligned in the section heading beside the textarea; settings-modal Feedback mic renders beside the Message label with the dimmed backdrop intact. Full-page shot confirms both panels and the modal co-render cleanly at 1440×900.

### Phase-2 Kimi K3 adverse round (2026-08-07)

First run was the documented failure mode again — `finish_reason: 'length'`, EMPTY content, all 16k tokens consumed by reasoning; never disposition that as "no findings". The verdict below came from the 32k-token medium-reasoning re-run (raw in agent-output/phase2-kimi-verdict2.json). Kimi's verdict was "do not ship as-claimed" on two P2s; disposition:

- **P2-1 (loopback grant + upstream redirect = fail-open) — REFUTED with evidence.** Kimi assumed fetch follows redirects ("nothing in the diff disables redirect following") because it only saw the diff. The bridge fetches with `redirect: "manual"` (src/grab-bridge.ts:1467) and a cross-host redirect takes the offsite branch (1496–1498): the upstream's ABSOLUTE Location passes through, the browser leaves the bridge, and the third-party document is never fetched, never injected, never keyed. Already pinned on a LOOPBACK upstream by test/grab-bridge-proxy-headers.test.mjs:119–120 (`location: 'https://example.net/out'` + X-Raven-Proxy-Offsite). The mid-session `currentSession.proxyTarget` rewrite only fires under `sameProxyHost`, so it cannot move a session's hostname off loopback. Residual, stated not hidden: a loopback dev server that itself reverse-proxies third-party bytes as a 200 serves them as its own — identical trust to a local script-tag session embedding third-party content, so the grant opens nothing a local session didn't.
- **P2-2 (node.id interpolated raw into the descriptor/attribute) — FIXED, fail closed.** The "internal numeric ids never need escaping" comment was an ASSUMED invariant; nothing enforced it, and the descriptor lands verbatim in an HTML attribute and is reused as a selector. `voiceButtonMarkup` now rejects any descriptor failing `/^[A-Za-z-]+(='[A-Za-z0-9_-]+')?$/` and renders NO mic (fail closed). No current call site can produce a violating descriptor (ids are a numeric counter plus "truncated-N"), so no test can turn exactly this clause red — the comment says so per the house rule; it guards future id shapes. All 10 voice tests green after the guard, which is itself evidence the grammar accepts every live descriptor.
- **P3-3 (stop-without-stop radius partly inherited) — ACCEPTED as a reading caveat.** The modal test's stop assertion overlaps the panel tests'; the modal-SPECIFIC coverage is delegation/fallback/sync (radii 2/2/1). Shared observable, shared radius — a fact about the mechanism, already the ledger's standing framing.
- **P3-4 (mic inside <label> triggers label activation) — ACCEPTED, deliberate.** The label's default click focuses the labeled field — focusing the field you are about to dictate into is the desired behavior, not a defect.
- **P3-5 through P3-8 — survive (Kimi's own verdict):** trigger-set migration preserved, loopback allowlist has no fail-open (WHATWG canonicalizes 127.1/0x7f000001/2130706433 INTO the granted spellings — semantically correct grants), drain protocol coherent, voice staleness paths hold.

Post-fix: voice/drag mutant matrix re-run WHOLE (per the fix-round rule) + full suite re-run — results recorded when complete. Eyes-on captures of both mic placements taken from the real overlay (agent-output/mic-*.png).

Post-fix verification complete: voice/drag matrix re-ran WHOLE after the P2-2 guard — all 15 mutants killed, every radius identical to round 1 (the guard sits above the mutated lines and disturbs nothing). Full suite after the guard: 1430 / 1427 / 0 fail / 3 skipped, fresh tsc build. Phase-2 build is verification-complete; committing locally, not pushing (push is Andrew-gated).
