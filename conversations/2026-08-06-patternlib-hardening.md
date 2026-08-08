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

### Design-judge pass on the mic UI (2026-08-07)

Ran the design-judge skill against the eyes-on captures (`.claude/genesis-2026-08-07/agent-output/mic-{1,2,3}-*.png`), global layer only, surface = raven-mcp product-site binding. **Verdict: PASS** — zero block/warn findings; one nit (SPACING-generous-negative-space): the Feedback pane's mic sits ~4px off the "Message" label while the Instructions row right-aligns its mic to the field edge, two idioms in one surface. Remedy if wanted: right-align the mic at the `data-feedback-message` call site (browser/raven-grab.js ~1859). Not applied — outside the asked scope, reported as one line. Completion claim stands: `9ebc27c` committed locally, not pushed.

### Round 2 UX (2026-08-07, in progress)
Andrew's feedback on phase 2: (a) drag was "really hard to grab" — diagnosed to the selection-prerequisite arming (pointerdown returns unless the pressed element is already selectedElement, so dragging takes click, release, press again, with no affordance); (b) voice should live-stream interim text into the field and show a waveform.

- **Drag fix (implementing now):** select-on-press. Remove the `!selectedElement` and target-not-selected gates in the pointerdown handler (~12094/12099); drag element = selectedElement when the press is on/inside it (sticky container), else the press target itself; skip html/body (dragging the page root is refused anyway — arming it would spam the notice); promote selection in activateCanvasDrag via selectTarget(el, false, "canvas") at slop-crossing so a plain click still selects through the click path; global grabbing cursor via injected `*{cursor:grabbing !important}` style while active, torn down in clearCanvasDrag. New tests in test/grab-overlay-drag-move.test.mjs + whole-matrix mutant re-run (find-strings go stale).
- **Voice round 2 (next):** interimResults=true strip-and-reinject streaming with promote-on-stop; [data-voice-wave] canvas waveform (getUserMedia→AnalyserNode→rAF, re-query per frame, fail-soft); 1-2 pattern-library reference captures as visual grounding (dogfood).
- Higgsfield (#3) still blocked on Andrew's YouTube link.
- Baseline: 1430/1427/0/3. Local main 2 ahead of origin (9ebc27c, d8e408c), unpushed.

**Round-2 drag: COMPLETE except header docs (2026-08-07).** Select-on-press landed; suite is 21 tests, all green. Matrix re-ran WHOLE twice: run 1 (drag-r2-mutants.out) had D17-promotion-deleted SURVIVE 0 red — tests 16/17 asserted the canvas labelText, which hover paints on the way to the press and the drop path repaints from drag.element directly (12099), so it never measured the selection. Fixed by asserting the panel Element chip `[data-element-selector]` (title = currentSelection.selector, absent with no selection). Run 2 (drag-r2-mutants-run2.out): ALL 20 KILLED — D1 never-arm 17, D3 no-indicator 8, D6 cross-parent-null 3, D2/D5/D16/D17 2 each, D4/D7–D15/D18–D20 exactly 1. Harness: agent-output/drag-r2-mutants.mjs (re-anchored find-strings, copies via RAVEN_GRAB_ASSET_PATH, dedupe ✖ via Set). Remaining on #4: rewrite the suite header's matrix block with these measured radii + the D17 hover-label lesson.

**Voice round 2 (in progress):** onresult streaming rewrite LANDED in browser/raven-grab.js (~1614–1680): interimResults=true, continuous=true, dictation.injected tracks the exact appended interim chunk, strip-only-if-field-still-ends-with-it (user edit mid-dictation wins = silent promotion), finals via appendDictatedText from event.resultIndex, interim appended with same separator/clamp, unconditional input dispatch. MIRROR OUT OF SYNC — cp browser/raven-grab.js web/public/raven-grab.js after remaining edits. Remaining: injected:"" in the dictation literal; waveform engine (startVoiceWave/drawVoiceWaveFrame/stopVoiceWave — typeof-guarded for the vm sandbox, rAF re-queries [data-voice-wave] per frame, gUM fail-soft); voiceButtonMarkup slot span + active canvas; syncModalVoiceButtons canvas insert/remove; CSS .raven-grab-voice-slot/.raven-grab-voice-wave; wire start/stop at the 4 transitions; flip test 1's interimResults pin to true; emitInterim on the fake + ~6 new tests; re-run voice matrix WHOLE (V1–V12 onresult find-strings now STALE — re-anchor).

**Drag round 2 CLOSED (2026-08-07):** suite header rewritten with the run2 measured radii (D1–D20) plus the D17 lesson (hover paints the canvas label en route to the press; the drop path repaints from drag.element at 12099 — the selection-derived observable is the panel Element chip `[data-element-selector]`). Comment-only change; 21/21 green.

**Voice round 2 implementation COMPLETE (2026-08-07):** everything from the remaining-list landed — `injected:""` in the dictation literal + startVoiceWave() at session start; full waveform engine (voiceWave module state, startVoiceWave with typeof guards for mediaDevices/AudioContext/rAF + token-guarded gUM grant that stops a late stream's tracks, drawVoiceWaveFrame re-querying [data-voice-wave] each frame — panelQuery then settingsModal — 12 peak-deviation bars off the 128 midline, accent fill w/ #00BFFF fallback; stopVoiceWave cancels rAF, stops tracks, closes ctx, all try/catch); voiceButtonMarkup wraps in .raven-grab-voice-slot and renders the canvas ONLY for the active descriptor; syncModalVoiceButtons inserts/removes the canvas in the render-once modal; two CSS rules after the pulse keyframes; stopVoiceWave wired at stopDictation/onerror/onend. Mirror re-synced BYTE-IDENTICAL (node --check + cp + cmp). Voice suite extended to 19 tests, ALL GREEN: fake default interimResults flipped to false (a fake defaulting true makes the overlay's assignment unfalsifiable — same class as D17) + emitInterim (resultIndex 0, isFinal false, full-snapshot semantics); 9 new tests — interim streams+replaces, final replaces interim + tracking reset, promote-on-stop survives re-render, user edit mid-dictation wins, interim clamps to maxLength and strip removes exactly the clamped chunk, wave canvas in the mic's slot + gone after stop, modal canvas insert/remove, teardown stops the track + closes the context (FAKE_MEDIA defineProperty override, pending[] grant queue), late grant after session end → tracks stopped + zero contexts. Two `\\'` escape bugs in assertion messages caught by re-inspection before running.

**Remaining on #5:** voice mutant matrix WHOLE re-run (V1–V12 re-anchored — onresult strings STALE — plus ~10 new mutants for the new mechanisms), header matrix rewrite, then fresh-build full suite (expect ~1445/1442/0/3), eyes-on waveform capture, design-judge, Kimi pass, gates, explicit-path commit. Push Andrew-gated.

**Voice round-2 mutant matrix COMPLETE (2026-08-07):** 27 mutants, 25 killed, TWO expected survivors, one clause deliberately unmutated — harness + raw runs in agent-output/voice-r2-mutants{.mjs,.out,-run2.out}. Run 1 lessons: (a) V2/V9/V12 finds were substrings of the 6-space onresult copies of the same lines (`split()` counts substrings, not anchored lines) — re-anchored with a leading `\n`; (b) V12b SURVIVED for a REAL reason: finals route through appendDictatedText's own full-descriptor query, so a value qualifier dropped only in ONRESULT's lookup streams every interim into the first bare-match sibling while the final-routing test stays green — closed with a 20th test (interim on a value-qualified descriptor), which is the only test V12b reddens in run 2. Run-2 radii: V1 panel-delegation 15; V8 modal-delegation 4; V10 modal-fallback 3; N1 strip-deleted 3; N6 interim-never-written 6; V4 3; V11/N11 2; everything else exactly 1. EXPECTED SURVIVORS, both the same class (onresult took over the duty through appendDictatedText's only caller): V2 (append-path input dispatch — onresult dispatches unconditionally; kept as the function's self-contained-commit contract, double dispatch idempotent) and V6 (field-check ordering — onresult's own pre-check owns vanished-field). Both documented in the harness header AND at the overlay call sites (two comment-only edits; anchor uniqueness re-verified programmatically for all 27 finds instead of re-running 30 min of suites — comment edits cannot change behavior, only stale anchors). UNMUTATED with reason: `event.resultIndex || 0` (fake is full-snapshot at index 0 — no reachable trigger). Suite header matrix block rewritten to the run-2 measurements (v2, 27 mutants). Accidental lesson recorded: importing the ESM harness for a "count check" executes it top-level — the foreground re-run's output was complete and clean, so it was persisted as the legitimate run-2 record.

**Eyes-on wave capture (2026-08-07):** agent-output/capture-wave.mjs — real Chromium with --use-fake-{ui,device}-for-media-stream + grantPermissions(microphone) drives the SHIPPED getUserMedia→AnalyserNode→rAF path; fake SpeechRecognition installed pre-load (headless has the ctor but no service). Pixel-readback probe asserts painted>0: painted=96/960 = exactly 12 bars × 4px × 2px MIN height — the fake tone was silent at the sampled instant, so the bars read flat; mechanism proven painting, capture undersells the motion. fieldValue "make the hero headline bolder and tighten the" = final+interim composition live in the field. Shots: wave-{1,2,3}-*.png.

Remaining on #5: fresh-build full suite (expect ~1446/1443/0/3 = 1430+6 drag+10 voice — verify), design-judge on the captures (flat-bars caveat), Kimi K3 adverse pass, gates, session-log finalize, explicit-path commit. Push Andrew-gated.

**Voice round-2 adverse verdicts + fix round (2026-08-07, post-compaction checkpoint):** Both adverse passes complete and dispositioned. Kimi K3 (voice-r2-kimi-verdict.md): 2 P2 + 5 P3. Sol GPT-5.6 (voice-r2-sol-verdict.md, "Sol has credits again" per Andrew): DOES NOT SURVIVE — 2 P1 + 2 P2; V2/V6 survivors and `event.resultIndex || 0` confirmed SAFE. Joint disposition: Sol#1 (resultIndex>0 deletes unchanged interims) FIXED — finals commit from resultIndex, interim tail rebuilt by scanning ALL non-final entries of event.results. Sol#2 = Kimi F1 (hidden-not-removed surfaces strand a hot mic) FIXED — stopDictationIfFieldInside(container) hooked into closeSettingsModal + setPanelCollapsed, plus dictation stop in dismiss(). Kimi F2 (stop() flushes a trailing final BEFORE onend in real Chrome; nulling dictation first drops short utterances) FIXED — dictation.stopping flag; onresult commits FINALS ONLY while stopping (interim forced ""); UI reads stopping as inactive; second stop while stopping hard-clears (wedge escape). Kimi F3 (onresult pre-check load-bearing for the STRIP block) comment corrected, test+mutant pending. Kimi F4 FIXED (recognizer.lang = navigator.language || documentElement.lang || en-US). Kimi F5 FIXED (escapeHtml on label/caption in voiceButtonMarkup attributes). Kimi F7 FIXED (AudioContext resume() if suspended in grant handler). Sol#4 FIXED (shared clampDictatedValue backs off one unit when the cut lands after a high surrogate). Sol#3 = Kimi F6 ACCEPTED+narrowed: suffix equality is heuristic, not provenance — claim narrowed to "never eats user text THAT DIFFERS from the injected chunk"; final-resurrects-deleted-preview pinned as intended (deletion doesn't unsay speech). ALL NINE overlay fixes LANDED in browser/raven-grab.js (node --check clean); mirror re-synced byte-identical. dismiss() hook has NO cheap page-side trigger (internal setArmed(false) only, line 2571) — no dedicated test; harm bounded because dismiss REMOVES fields so the tested vanished-field guard ends the session; stated in suite header, mutant documented as review-verified.
Remaining: 8 new tests (F1-modal, F1-panel, F2-flush, second-stop hard-clear, F3-interim-pending-vanished, Sol#1 multi-result, F6 pin, Sol#4 surrogate) + lang assertions in config test (DONE, first two edits post-compaction); ~11 new mutants; whole-matrix re-run (fix round staled onresult/stopDictation/clamp find-strings); header matrix v3 rewrite; mirror re-sync if overlay touched again; fresh-build full suite (count grows from 1446); Sol done-gate falsification pass on the completion claim; explicit-path commit (browser/raven-grab.js web/public/raven-grab.js test/grab-overlay-drag-move.test.mjs test/grab-overlay-voice-input.test.mjs conversations/2026-08-06-patternlib-hardening.md). Push Andrew-gated. Higgsfield (#3) still blocked on the YouTube link.

## Voice round 2 — fix-round tests + matrix v3 (2026-08-07, post-compaction)

- All eight fix-round tests written and green, then TWO more gaps found during mutant planning:
  - Kimi F7 resume() was unobservable — the fake AudioContext had no `state`, so the shipped
    resume branch never executed in any test. Fixture now starts `state: 'suspended'` with a
    `resumeCalls` counter; new test asserts resumeCalls >= 1 after grant.
  - N11 went behaviorally stale under the stopping flag — onend now performs the full clear
    (identity guard passes), so with the fake's synchronous stop()->onend, deleting
    stopDictation's own stopVoiceWave survived the teardown tests. New test noops fake.stop
    and asserts trackStops >= 1 BEFORE onend: the mic releases at STOP time, not when Chrome
    eventually flushes.
- Suite is 30/30 green (test/grab-overlay-voice-input.test.mjs).
- Matrix v3: 39 mutants (27 re-run whole + 12 new: F1a/b/c, F2a/b/c, F3, Sol1, Sol4, F4, F7,
  N15); V9/N7 re-anchored to the clampDictatedValue call sites, N11 to the stopping-flag path.
  Run COMPLETE -> .claude/genesis-2026-08-07/agent-output/voice-r2-mutants-run3.out:
  37 killed, exactly the two documented expected survivors (V2 append-path dispatch, V6
  ordering swap), zero find-string misses, zero syntax skips. Every traced radius confirmed:
  F2a -> flush + hard-clear (2); F3 -> ONLY the new interim-pending test (the old
  vanished-field test is rescued by appendDictatedText's own guard — that discrimination is
  why the new test exists); V9 -> clamp + surrogate (2, shared clamp); N15 -> 9 incl. the
  PINNED resurrect test (a pin that cannot go red pins nothing). Radii that WIDENED under
  re-measurement (V1 15->24, V4 3->9, N6 6->9, V8 4->5, V10 3->4, N1 3->4, N13 1->2) are
  facts about shared mechanisms, not extra guards — recorded as such in the header.
- Suite header rewritten to matrix v3 (measured radii, the two gap lessons, F5
  review-verified-no-mutant, dismiss()-no-hook decision, Sol#3 narrowed claim, finals-loop
  `resultIndex || 0` deliberately unmutated with the interim loop now Sol1-mutated).
  Comment-only edit; suite re-run 30/30 green.
- First fresh-build full suite: 1456 tests, 1452 pass, 1 FAIL, 3 skipped — the panel-collapse
  hook turned `if (next) hidePanelPresetTooltip();` into a block, and grab-bridge.test.mjs
  (~5836) pins that exact single-statement shape. The pinned PROPERTY (collapse hides the
  tooltip) is intact; the regex was updated to the block form
  (`/if \(next\) \{\s*hidePanelPresetTooltip\(\);/`) with a comment naming the voice hook.
  Test edit only — overlay untouched, mirror still byte-identical. Lesson: the wrapper's
  appended `echo exit:$?` reported 0 for the WRAPPER; the suite's own exit lives in the
  .done file — read the file, never the notification's exit code.
- Remaining: full-suite re-run (expect 1456/1453/0/3), Sol done-gate, explicit-path
  local commit now INCLUDING test/grab-bridge.test.mjs (push is Andrew-gated).

## Voice round 3 — Sol done-gate DOES NOT SURVIVE, all four findings fixed (2026-08-08)

The mandatory Sol done-gate on the round-2 completion claim returned DOES NOT SURVIVE
(1 P1, 1 P2, 2 P3 — .claude/genesis-2026-08-07/agent-output/voice-r2-donegate-sol.md).
Dispositions, all FIXED:

- **#1 P1 — rebuild drops the field, mic stays hot.** switchTab (or any renderPanel rebuild)
  that drops a tab-scoped dictation field left the session live: onresult's vanished-field
  guard only fires when the user SPEAKS, so a silent user kept a hot microphone with its only
  off switch gone. Fix: a rebuild guard as renderPanel's LITERAL LAST statement (~10311) —
  `if (dictation && !dictation.stopping && !dictationQuery(...)) stopDictation()`. Last on
  purpose (must see the final rebuilt DOM); `!stopping` bounds the recursion
  (stopDictation→renderPanel) and protects a tearing-down session's flush.
- **#2 P2, upgraded by my own trace to DETERMINISTIC loss.** Sol called it a stopping+second-
  click race; the sibling is certain: a different-target mic click on a live session ALWAYS
  loses the pending flush in real Chrome, because `dictation = {new}` clobbers the old session
  in the same task while its last final is still in flight (the fake's synchronous stop→onend
  hides it). Fix: `flushingDictation` park slot — one slot, newest wins; onresult/onerror/onend
  resolve sessions by recognizer identity across BOTH slots; a parked session is always
  `stopping` so its flush commits finals-only to its OWN field; parked failure paths release
  the slot instead of calling stopDictation (which would kill the LIVE session).
- **#3 P3 — header claimed "dismiss() deliberately gets NO hook" while dismiss() at ~10410
  calls stopDictation(). Rewritten to state the eager stop; the "every fix has its own
  test and mutant" sentence now carries the explicit Kimi F5 exception.**
- **#4 P3 — mutant harness baseline accepted exit-0/no-✖, so an all-skip Chromium-less run
  read green. Baseline now pins the exact pass count and zero skips.**

State: overlay edited (6 edits, node --check clean), mirror re-synced byte-identical (cmp),
suite at 33/33 (three new tests: rebuild-guard via the assets-tab `data-template-name` field —
`data-instruction` rides footer-A through every tab and cannot fixture this; park-flush
commits to its own field with the live session untouched, made observable post-onend by
redispatch; parked-vanished-field releases the slot without killing the live session, with the
append-failure parked clause documented as unreachable belt-and-braces, deliberately
unmutated). Harness EXPECTED_PASS bumped 32→33; stale find-strings re-anchored
(N1/N2/N3/N6/F2b/F3/V5 — the `dictation.`→`session.` rename); five R3 mutants added
(R3a rebuild guard, R3b never-park, R3c onresult ignores parked, R3d onend never releases,
R3e parked vanished-release deleted). WHOLE matrix v4 (44 mutants) running in background →
voice-r2-mutants-run4.out.

Remaining: read run4 (expect V2+V6 survivors only; V1 radius grows with the new panel-mic
tests), header → matrix v4, full suite fresh-build (expect 1459/1456/0/3 — +3 voice tests over
1456/1453), Sol re-gate on the round-3 fix claim, explicit-path local commit
(browser/raven-grab.js, web/public/raven-grab.js, test/grab-bridge.test.mjs,
test/grab-overlay-voice-input.test.mjs, this log). Push is Andrew-gated. Higgsfield (#3)
still blocked on his YouTube link.

### Matrix v4 + suites (same day, post-checkpoint)
- Matrix v4 run COMPLETE -> voice-r2-mutants-run4.out: 44 mutants, 42 killed, exactly the two
  documented expected survivors (V2, V6), zero find-string misses, zero syntax skips. Baseline
  pinned 33/0-skips and passed. All five R3 mutants redden exactly their own test. F3 widened
  1->2 (its `if (false)` form neutralizes the whole pre-check block, which also contains the
  parked release — shared block, not two guards). Radii widened by the three new tests:
  V1 24->27, V4 9->11, V5 2->3, V7 1->2, V10 4->5, N1 4->5, N15 9->10 — shared mechanisms,
  recorded as such. Header rewritten to matrix v4 (incl. the second deliberately-unmutated
  clause: the append-failure parked early-return, unreachable by same-descriptor argument).
- Voice suite 33/33/0/0; fresh-build full suite 1459/1456/0/3 (exits read from inside the out
  files, never the wrapper). Mirror cmp-verified byte-identical.
- Sol round-3 RE-GATE launched (gpt-5.6-sol medium, detached) -> voice-r3-donegate-sol.md;
  brief at voice-r3-donegate-brief.md. Commit held until the verdict is dispositioned.

### Sol round-4 re-gate verdict arrived — DOES NOT SURVIVE, one P2 (2026-08-08)
- voice-r3-donegate-sol.md (5660 lines, sol-exit:0). Everything else RECONCILES per Sol's own
  closing: mirrors byte-identical, run4 consistent (44/42, V2+V6 only, no failed anchors),
  header corrections + hardened 33-pass/zero-skip baseline present. Sol's fresh browser rerun
  was environment-blocked (MachPortRendezvousServer Permission denied 1100, all 33 skipped —
  Sol's sandbox, not the code; the hardened harness itself would reject that run).
- THE finding (P2, confidence 10/10, raven-grab.js:1815): `flushingDictation` is ONE slot,
  newest wins. A->B parks A; B->C overwrites the slot with B; A's delayed final resolves to
  neither live nor parked and is discarded. Harm bounded (recognizer stopped — no hot mic, no
  wedge) but the first utterance's flush is silently lost across a rapid three-field switch,
  refuting the unqualified "different-target switching no longer loses pending flushes" claim.
- DISPOSITION: FIX. One slot -> identity-keyed LIST (`flushingDictations` array +
  parkedDictationFor/releaseParkedDictation), the natural generalization of the mechanism the
  round-3 fix built. New three-field interleave test (34th), new mutant reintroducing the
  one-slot overwrite, re-anchor R3b–R3e/V5, EXPECTED_PASS 34, WHOLE 45-mutant matrix v5 re-run,
  header to v5, suites, Sol round-5 re-gate. Commit stays held.

### Round-4 fix landed + matrix v5 COMPLETE (2026-08-08)
- Fix ON DISK: `flushingDictation` slot -> `flushingDictations` LIST + `parkedDictationFor(recognizer)`
  / `releaseParkedDictation(session)` helpers; 6 edit sites in browser/raven-grab.js (declaration,
  helpers, park site, onresult identity resolution, both parked early-returns, onerror/onend
  releases). node --check SYNTAX-OK; mirror re-synced, cmp byte-identical (MIRROR-OK).
- 34th test added: 'two parked flushes both survive a third-field switch — the park is a list,
  not a slot' (mics on data-instruction / data-template-name / settings-modal data-feedback-message;
  two parks in flight, both delayed finals commit to their own fields, onend replays commit nothing,
  third session stays live). Voice suite 34/34/0/0.
- Harness -> 45 mutants: R3b–R3e/V5 re-anchored to the new code, R4-park-overwrites-oldest added
  (reintroduces one-slot newest-wins verbatim: `flushingDictations.length = 0;` before the push),
  EXPECTED_PASS 34, anchor check mutants=45 badAnchors=0.
- Matrix v5 run COMPLETE -> voice-r2-mutants-run5.out (task b9l8gs2l2; run was accidentally
  launched via a load-check import — importing the harness EXECUTES it — and was kept as the real
  run since mutants run from copies via RAVEN_GRAB_ASSET_PATH). Baseline green 34/0-skips.
  45 mutants, 43 killed, survivors exactly V2+V6 (documented expected), zero find misses, zero
  syntax skips, "tracked file untouched". R4 reddens EXACTLY the new three-field test. Radii
  widened by the new test joining shared mechanisms (facts about the mechanisms, not new guards):
  V1 27->28, V4 11->12, V5 3->4, V7 2->3, V8 5->6, V10 5->6, V11 2->3, N1 5->6, N15 10->11,
  R3b/R3c/R3d each 1->2. Task wrapper exited 1 from a trailing broken third statement (SyntaxError
  after "done") — noise; the verdict is read from inside the output, never the wrapper exit.
- NEXT: header v5 rewrite, voice suite re-run, full suite fresh build, Sol round-5 re-gate,
  then the held explicit-path local commit.
- Header v5 rewritten (suite + harness), voice suite re-run 34/34/0/0, fresh-build full suite
  1460/1457/0/3 (the predicted +1; exits read from inside the out files). git fetch: local is
  3 auto-save commits ahead of origin/main (4e1284b), 0 behind. Sol ROUND-5 re-gate launched
  (gpt-5.6-sol medium, detached) -> voice-r4-donegate-sol.md; brief at voice-r4-donegate-brief.md.
  Commit held until the verdict is dispositioned.
- Sol ROUND-5 gotcha: voice-r4-donegate-sol.md contains the ROUND-4 session's closing verdict
  REPLAYED mid-file (lines ~4122-4145: one-slot finding at 1815, run4 44/42 counts, the 33-skip
  browser run, "tokens used 124,410"), followed by my wrapper's premature "sol-exit:0" — the
  codex parent exited while a live child (pid 52200) kept writing. Every concrete fact in that
  block belongs to the pre-fix tree; do NOT disposition it. The fresh analysis continues after
  it (reads flushingDictations at 188/1818-1826, counts 34 tests, finds the three-field test).
  The real verdict is at the file's true END, after pid 52200 exits (Monitor armed).

### Sol round-5 verdict arrived — DOES NOT SURVIVE, one P2 (2026-08-08)
- voice-r4-donegate-sol.md finished (pid 52200 exited; 6097 lines). The file contains a REPLAYED
  round-4 verdict at ~4122–4145 with a premature sol-exit:0 — the live verdict is at the true
  tail and lacks the "VERDICT:" prefix. Do not disposition the mid-file block.
- Live verdict: DOES NOT SURVIVE, exactly one finding (P2, 10/10, raven-grab.js:1839): a parked
  entry whose recognizer never emits onend is retained FOREVER — the successful onresult flush
  path (dispatch at :1948) never releases; releases exist only at :1882/:1928 (dead-end parked
  paths), :1960 (onerror), :1970 (onend). stopDictation's own hard-clear comment (:1782–1784)
  names "onend never arrived" as a real state, and the declaration comment at :185–187 claims
  release-on-flush, which the code deliberately does NOT do. The 34th test supplies both onends,
  so it never exercises the path; matrix v5 has no missing-terminal-event mutant. Everything
  else RECONCILES per Sol: run5 internally consistent (45/43, V2+V6 only, R4 exact), mirror
  byte-identical, A->B->C overwrite genuinely fixed.
- DISPOSITION: FIX, but NOT Sol's grace-timer — a time window bounds nothing (unboundedly many
  parks fit inside it) and needs a clock the synchronous harness cannot honestly drive. Instead:
  MAX_PARKED_DICTATIONS = 8, evict OLDEST at the push site (while length >= MAX, shift).
  Retention-until-onend stays — releasing on successful flush would be WRONG (a stopped
  recognizer may deliver multiple finals before onend; releasing at the first would discard the
  rest, reintroducing the lost-flush class). Evicting the oldest past 8 simultaneous unresolved
  recognizers loses that entry's late flush — the pre-list behavior — at a concurrency real
  Chrome does not produce. Also correcting the :185–187 declaration comment (the false
  release-on-flush claim). New 35th flood test + 3 mutants (cap-deleted / evicts-newest /
  off-by-one), EXPECTED_PASS 35, WHOLE matrix v6 re-run, header v6, suites, Sol round-6.
  Commit stays held.

### Matrix v6 COMPLETE — expected result, header rewritten (2026-08-08)

Run: `.claude/genesis-2026-08-07/agent-output/voice-r2-mutants-run6.out` (task beygxylis, matrix-exit:0, "tracked file untouched"). Baseline green 35 pass / 0 skipped. 48 mutants, 46 killed, survivors exactly V2+V6 (documented expected), zero find-string misses — the eviction line went above the push, so R4/R3b anchors held without re-anchoring.

R5a/R5b/R5c each redden EXACTLY the flood test. Radii widened by the flood test joining shared mechanisms (facts about the mechanisms, not extra guards): V1 28→29, V4 12→13, N15 11→12, R3b 2→3, R3c 2→3, R4 1→2. The v5 header's "ONLY that one" claim for R4 was true at v5 and is now false — measured v6: R4 reddens three-field + flood (one-slot newest-wins under nine parks keeps only the newest, park0..park7 vanish). Header rewritten to v6 with the measured radii, the R5 section, and the corrected R4 claim. All other radii unchanged (V5 4, V7 3, V8 6, V10 6, V11 3, N1 6, R3d 2, R3e 1, singles as at v5).

Remaining: voice suite re-run (expect 35/35/0/0), fresh-build full suite (expect 1461/1458/0/3), Sol round-6 re-gate on the cap fix, then the held explicit-path commit (push Andrew-gated).

### Sol round-6 verdict → FIX landed → matrix v7 COMPLETE (2026-08-08)

- **Sol round-6 (voice-r5-donegate-sol.md, sol-exit:0): DOES NOT SURVIVE — exactly ONE P2 (8/10).** Two halves: (a) the eviction comment's "a concurrency real Chrome does not produce" was an unevidenced claim — the flood test proves the memory bound, not unreachability; (b) plain oldest-eviction is refutable — a valid interleaving leaves the OLDEST entry the only recognizer still owed its FIRST final while newer entries have already flushed and await only onend. Everything else reconciled (matrix v6 counts, find-string uniqueness, mirror parity, saved full-suite totals); Sol's fresh browser run was env-blocked (`listen EPERM 127.0.0.1`) and correctly not treated as verification. Out-file had verdict blocks at lines 3393 AND 3408 — read the TRUE TAIL only (third occurrence of this trap, handled per the standing rule).
- **Disposition: FIX, both remedy halves.** (1) Comment rewritten honestly: the bound is bounded-loss MITIGATION, no unreachability claim. (2) Eviction is FLUSH-AWARE: onresult marks a parked entry that delivers a post-stop final (`session.flushedOnce = true`, guarded by `session !== dictation && finals`); the push-site eviction scans for the oldest FLUSHED entry (onend is all it's owed) and falls back to oldest-overall only when none has flushed. Flood test unchanged in behavior (none flushed there → fallback). `node --check` clean; mirror `cp`+`cmp` byte-identical.
- **36th test added:** "eviction prefers an already-flushed entry — an older unflushed park keeps its spoken text". Ten alternating panel mics; s1 flushes early (asserted fixture precondition `earlyTemplate === 'park1'`); at the cap the scan must evict flushed s1 over older unflushed s0; discriminator: park0 COMMITS (instruction = "park0 park2 park4 park6 park8") — plain oldest-eviction kills s0 and goes red. `park1-late` on the evicted entry commits nothing (the accepted bounded loss made observable). Suite 36/36/0/0 green.
- **Harness v7 (50 mutants, EXPECTED_PASS 36):** R5a/R5b find-strings STALED by the fix (the one-line eviction became a block) and were re-anchored; all 50 pre-verified anchoring exactly once before the run (`{"mutants":50,"bad":[]}`). R5a = delete the whole while-block; R5b = fallback evicts newest; R5c unchanged; NEW R5d = delete the flushedOnce scan (plain oldest verbatim); NEW R5e = neutralize the marking line (`if (false && …)`).
- **Matrix v7 run (voice-r2-mutants-run7.out, matrix-exit:0): baseline 36/0 skips, 50 mutants, 48 killed, survivors exactly V2+V6, zero find misses, tracked file untouched.** R5d and R5e each redden EXACTLY the new test (one per mechanism half). Measured widenings vs v6, each = the new test joining a shared mechanism: V1 29→30, V4 13→14, N15 12→13, R3b 3→4, R3c 3→4, R4 2→3, R5a 1→2, R5c 1→2. One prediction corrected by measurement: **R5b stays at 1 (flood only)** — in the new test an entry HAS flushed, so the scan finds it and the fallback line R5b mutates never executes. Suite header rewritten to v7 from run7.out's measured radii (never predictions).
- Next: voice suite re-run (expect 36/36/0/0) → fresh-build full suite (expect 1462/1459/0/3) → Sol round-7 brief + detached run → on SURVIVES, explicit-path local commit (push Andrew-gated).

### Sol round-7 verdict → FIX landed → 37th test green → harness v8 in progress (2026-08-08)

- **Sol round-7 (voice-r6-donegate-sol.md, true sol-exit:0 at line 4458): DOES NOT SURVIVE — exactly ONE P2 (9/10).** The whitespace-only-final false-mark: `appendDictatedText` returns success on a whitespace-only final without committing anything (`if (!text) return true;` after trim), but the mark tested the RAW string's truthiness (`session !== dictation && finals`) — so an entry that committed NOTHING got marked flushedOnce, was preferentially evicted at capacity, and its subsequent substantive final found no owner and was discarded. Two comment halves also false: "onend is all it is still owed" contradicts the code's own multiple-post-stop-finals design, and the 36th test's park1-late comment called a genuine FURTHER final a "replay/redispatch". Everything else reconciled: mirror parity, all 50 anchors unique, 48/50 kill accounting, R5b's one-test radius, saved suite totals. **Out-file trap, FOURTH occurrence, NEW VARIANT:** the file's first ~2314 lines were a complete REPLAY of the round-6 session INCLUDING a replayed `sol-exit:0` at line 2314 — only the LAST sol-exit line marks the true tail; grep line numbers first, read only past the final marker's preceding verdict block (4444–4458 here).
- **Disposition: FIX, all three parts.** (1) Mark only on non-whitespace: `if (session !== dictation && /\S/.test(finals)) session.flushedOnce = true;` — mirrors appendDictatedText's own trim-based emptiness rule exactly. (2) Declaration comment rewritten: flush-preference is "a least-bad victim, not a safe one"; an evicted flushed entry may still be owed FURTHER finals — the accepted bounded loss, pinned observable in the eviction test; whitespace rule stated; accepted residual stated (a final clamped to nothing by a FULL field still marks — later finals to that field are equally unclampable, so the eviction loses nothing the cap would not drop). (3) The 36th test's three "replay" wordings corrected to "genuine FURTHER final … PINS the loss class; it does not bless it". `node --check` SYNTAX-OK, ES5 clean, mirror `cp`+`cmp` MIRROR-OK.
- **37th test added:** "a whitespace-only final does not mark a parked entry flushed — its real text is still coming". Same ten-click flood; s1's early parked final is PURE WHITESPACE (`'  \t '`), asserted fixture precondition `earlyTemplate === ''` (it committed nothing — a substantive string there would mark legitimately and measure nothing). DOUBLE discriminator: under fixed code nothing is flushed at eviction → fallback evicts oldest s0 → instruction "park2 park4 park6 park8" AND s1's later substantive park1 commits → template "park1 park3 park5 park7"; under the raw-truthiness defect s1 is evicted, park1 dies, park0 commits — BOTH fields flip. Suite 37/37/0/0 green.
- **Harness v8 plan (next):** R5e's find-string STALED by the fix (anchors the old raw-truthy line) — re-anchor to the `/\S/` line; NEW R5f = revert the mark to raw truthiness (the round-7 defect verbatim), expected to redden exactly the whitespace test; EXPECTED_PASS 37; header prose → v8. Predictions to be MEASURED, not asserted: whitespace test likely joins V1/V4/N15/R3b/R3c/R4/R5a/R5c AND R5b (it exercises the fallback path); R5d/R5e should stay exactly the 36th test. Then: pre-verify 51 anchors → whole matrix v8 → run8.out → header v8 from measured radii → voice suite (37) → fresh-build full suite (expect 1463/1460/0/3) → Sol round-8 → on SURVIVES the held explicit-path commit (push Andrew-gated).

### Matrix v8 COMPLETE → Sol round-8 verdict → FIX landed → 38th test green → matrix v9 in progress (2026-08-08)

- **Matrix v8 run (voice-r2-mutants-run8.out, matrix-exit:0): baseline 37/0 skips, 51 mutants, 49 killed, survivors exactly V2+V6, zero find misses, tracked file untouched.** R5f (raw-truthiness revert, the round-7 defect verbatim) reddened EXACTLY the whitespace test. R5d/R5e each stayed exactly the eviction-prefers-flushed test. R5b widened 1→2 as predicted-and-measured (flood + whitespace — both legitimately reach the fallback; the widening is the fix working). Other widenings from the 37th test joining shared mechanisms: V1 30→31, V4 14→15, N15 13→14, R3b 4→5, R3c 4→5, R4 3→4, R5a 2→3, R5c 2→3. Header rewritten to v8 from run8's measured radii. Voice suite 37/37/0/0; fresh-build full suite 1463/1460/0/3; mirror cmp clean.
- **Sol round-8 (voice-r7-donegate-sol.md, true tail 2844–2859, sol-exit:0; 114,189 tokens): DOES NOT SURVIVE — exactly ONE P2 (9/10).** The round-7 "accepted residual" rested on a FALSE invariant: the declaration comment claimed a final clamped to nothing by a full field loses nothing because later finals are "equally unclampable" — but every append clamps against the field's CURRENT value and capped voice fields stay user-editable (e.g. the 2,000-char fixed-move note). Loss path: full field → substantive final commits nothing but /\S/ still marks flushedOnce → user SHRINKS the field → capacity eviction prefers the marked entry → its later final, which now FITS, is discarded with no owner. The 37th test's field is uncapped, so nothing falsified it. Out-file trap FIFTH occurrence, new variant: verdict-looking lines mid-file at 439/452 where Sol QUOTED the round-7 file inside its own transcript — only the LAST sol-exit marks the true tail.
- **Disposition: FIX, sharpened one step past Sol's letter.** Sol demanded "mark only when the append actually changes the field"; the bare value delta still marks a SEPARATOR-ONLY commit (one char of room → field gains exactly ' ', no delivered speech) — same defect one character over. The mark is now a NON-WHITESPACE field delta: `var beforeAppend = field.value;` snapshotted immediately before onresult's append (after the injected-strip, which also mutates the field), then `if (session !== dictation && field.value.replace(/\s+/g, "") !== beforeAppend.replace(/\s+/g, "")) session.flushedOnce = true;`. Subsumes the round-7 /\S/ rule (a whitespace final never writes → values equal). Marking-site comment rewritten (delivery vs intent); declaration comment's residual sentence REWRITTEN — the residual is fixed, and the old "equally unclampable" claim is named as false with the reason (capped fields user-editable, clamp is against current value). `node --check` SYNTAX-OK, ES5 clean, mirror `cp`+`cmp` MIRROR-OK.
- **38th test added:** "a final clamped away by a full field does not mark the entry — the field can shrink and its text still land". Sharpest fixture: template field value 'full' under maxLength 5 — exactly ONE char of room — so s1's early substantive final 'park1x' commits ONLY the separator space. That single fixture separates the fixed mark from BOTH wrong forms at once: /\S/ marks (carried text) and a bare delta marks (field changed by ' '); only the non-whitespace comparison declines. Precondition asserted: `earlyTemplate === 'full '`. Then user-shrink (value='' + input; cap raise is fixture convenience, the mark decision already happened) → flood → eviction must take s0 not s1 → s1's later 'park1' lands in the shrunken field. Double discriminator as in tests 36/37. **Fixture lesson (first draft failed honestly):** a mic click rebuilds the panel and the recreated field carries its DRAFT value and no node-level maxLength — a fixture set before the clicks is silently erased (read back 'park1x', unfilled and uncapped). Set the fixture after the clicks, immediately before the final, and mirror the value into the draft with an input dispatch. Suite 38/38/0/0 green.
- **Harness v9 (53 mutants, EXPECTED_PASS 38):** R5e AND R5f both STALED (both anchored the /\S/ line) — re-anchored to the field-delta line; NEW R5g = revert to /\S/ (the round-8 defect verbatim, expect exactly the clamp test); NEW R5h = weaken to bare value delta (expect exactly the clamp test — the separator-only fixture is the one separator); R5f's radius expected to widen (clamp test's 'park1x' is truthy). All 53 anchors pre-verified `{"mutants":53,"bad":[]}`. Matrix v9 running backgrounded → run9.out. Then: header v9 from measured radii → voice suite (38) → fresh-build full suite (expect 1464/1461/0/3) → Sol round-9 → on SURVIVES the held explicit-path commit (push Andrew-gated).

### Matrix v9 COMPLETE and clean (2026-08-08)

- **Matrix v9 run (voice-r2-mutants-run9.out, matrix-exit:0): baseline 38/0 skips, 53 mutants, 51 killed, survivors exactly V2+V6, zero find misses, tracked file untouched.** R5g (revert to /\S/ — the round-8 defect verbatim) and R5h (bare value delta) each reddened EXACTLY the new clamp test; R5f widened 1→2 (whitespace + clamp — 'park1x' is truthy, so the raw mark marks the clamped-away entry too); R5d/R5e each stayed exactly the eviction-prefers-flushed test (under the fixed code the clamp test marks nothing, so scan and fallback pick the same victim — the fix working). Widenings from the 38th test joining shared mechanisms: V1 31→32, V4 15→16, N15 14→15, R3b 5→6, R3c 5→6, R4 4→5, R5a 3→4, R5b 2→3 (flood + whitespace + clamp — all three legitimately reach the fallback), R5c 3→4.
- **One unpredicted-but-legitimate widening, investigated before writing it into the header: F3 2→3.** The noise-only-final test (an OLD test) joined the field-pre-check-deleted radius because the round-8 fix put `var beforeAppend = field.value;` BETWEEN the pre-check and appendDictatedText — with the pre-check neutralized, ANY final against a vanished field now throws TypeError at the snapshot before appendDictatedText's own guard can rescue it, so no stop path runs. At v8 the noise-only final fell through to appendDictatedText's re-query, failed there, and the failure path still stopped the session — which is why the header said TWO. The pre-check's load-bearing duty grew from "the STRIP block only" to "the strip block AND the snapshot"; header F3 entry rewritten accordingly. V9 (finals clamp dropped) also widened 2→3 for the stated fixture reason: the clamp test's `earlyTemplate === 'full '` precondition depends on the append clamp itself — without it 'park1x' commits fully.
- Next: header v9 rewrite from run9's measured radii → voice suite re-run (38) → fresh-build full suite (expect 1464/1461/0/3) → Sol round-9 brief + detached run → on SURVIVES the held explicit-path commit (push Andrew-gated).
- Header v9 rewritten from run9's measured radii (F3 entry carries the snapshot-widening explanation; R5g/R5h entries added; R5f now TWO; stale-reference sweep clean — remaining "v8" mentions are deliberate history). Voice suite 38/38/0/0 (voice-suite-v9header.out); fresh-build full suite 1464/1461/0/3 (full-suite-r8fix.out); mirror cmp MIRROR-OK. Sol round-9 brief written (voice-r8-donegate-brief.md — claim: round-8 defect fixed via non-whitespace field delta, sharpened past Sol's bare-delta letter; attack angles include snapshot placement after the injected-strip, Unicode \s vs the append's normalization, the one-char-of-room fixture's honesty, R5g/R5h verbatim-ness, header-vs-run9 reconciliation) and launched detached → voice-r8-donegate-sol.md.

### Sol round-9 verdict → FIX landed → tests 39/40 green → matrix v10 launching (2026-08-08)

- **Sol round-9 (voice-r8-donegate-sol.md, true tail 5187–5207, final sol-exit at 5210): DOES NOT SURVIVE — exactly ONE P2 (8/10).** JS `\s` does NOT match U+200B ZERO WIDTH SPACE or U+2060 WORD JOINER (it does match NBSP and U+FEFF — measured). So an invisible-only final survived the append's normalize+trim, appended unseeable junk, and the mark's `\s`-strip comparison read the delta as delivery → flushedOnce marked → capacity eviction prefers the marked entry → its later substantive final discarded. Deterministic loss path. Everything else reconciled (mirrors byte-identical, all 53 anchors unique, run9 accounting, Sol's fresh browser run env-blocked `listen EPERM` — not a finding). **Out-file trap SIXTH occurrence:** TWO sol-exit lines (a replayed one at 1038 after a mid-file verdict block at 1026); only the block before the FINAL sol-exit is the verdict.
- **Disposition: FIX, sharpened past Sol's letter.** Sol's remedy said "normalize explicit default-ignorable characters before append and marking" — but STRIPPING would corrupt legitimate dictation (ZWNJ is load-bearing Persian orthography; ZWJ builds emoji sequences). Instead ONE shared predicate `dictatedVisibleContent(value)` — "does this string contain anything the user can SEE" — that inspects but never edits. Two callers: (a) append noise gate `if (!dictatedVisibleContent(text)) return true;` (invisible-only finals decline, the established whitespace-only semantic; finals CARRYING visible content pass verbatim); (b) mark comparison runs both sides through the predicate (closes the clamp-truncation case the gate alone cannot: a final `ZWSP+'park1x'` passes the gate, clamps to separator+ZWSP — a field change with no visible delta). Character class is an ES5 approximation of Unicode default-ignorables (soft hyphen, ALM, Mongolian vowel sep, ZWSP..RLM, WJ..invisible ops, deprecated formatting, BOM); accepted residual in comment: a lone variation selector still reads as content. MAX_PARKED_DICTATIONS comment updated. `node --check` SYNTAX-OK, ES5 clean, mirror `cp`+`cmp` MIRROR-OK.
- **Tests 39+40 added (suite 40/40/0/0, voice-suite-r9fix.out).** Test 39: invisible-only final (fromCharCode 0x200B,0x2060) neither writes nor marks — earlyTemplate === '' precondition, flood, eviction must take s0. Test 40: maxLength-6 clamp retains only separator+ZWSP — the ONLY test separating the visibility comparison from `\s`-only; asserts earlyCodes '66,75,6c,6c,20,200b'. **Escape-conversion gotcha (NEW, binding for the rest of this repo's life):** writing `\uXXXX` through Edit/Write tool params lands LITERAL invisible chars (the JSON layer decodes them) — the regex had to go in via perl; all test fixtures use String.fromCharCode (pure ASCII); verify with `cat -v`.
- **Harness v10 patched via Python (never retyping backslash-bearing strings — every one extracted from existing file bytes):** V6 re-anchored (insert-early-copy form — same trigger set, still expected survivor: onresult pre-checks the field); R5e–R5h finds re-anchored to the new mark line (R5e's replace too); NEW R5i = revert mark to the round-8 whitespace-strip (the round-9 defect verbatim, expect exactly test 40) and R5j = revert append gate to bare emptiness (expect exactly test 39); EXPECTED_PASS 38→40; v10 preamble + R5i/R5j descriptions added. All 55 finds pre-verified anchoring exactly once (a first scanner pass missed N8's double-quoted find and mis-checked it against N9's — scanner fixed to handle both quote styles before trusting the result). Harness `node --check` clean.
- **Predictions to be MEASURED, never asserted:** R5g widens 1→3 (`/\S/` matches ZWSP so tests 38/39/40), R5h 1→2 (38/40), R5f likely widens (invisible finals are truthy); shared-mechanism widenings expected on V1/V4/N15/R3b/R3c/R4/R5a/R5b/R5c from tests 39/40 joining the flood shape. Investigate ANY unpredicted radius before writing the header.
- Next: matrix v10 backgrounded → run10.out → header v10 from measured radii → voice suite (40) → fresh-build full suite (expect 1466/1463/0/3 — measure) → Sol round-10 brief + detached → on SURVIVES the held explicit-path commit (push Andrew-gated). Higgsfield still blocked on Andrew's YouTube link.

### Matrix v10 COMPLETE → header v10 → suites green → Sol round-10 launching (2026-08-08)

- **Matrix v10 run (voice-r2-mutants-run10.out, matrix-exit:0): baseline 40/0 skips, 55 mutants, 53 killed, survivors exactly V2+V6, zero find misses, tracked file untouched.** R5i (whitespace-strip mark revert — the round-9 defect verbatim) reddened EXACTLY test 40 (zero-width-clamp); R5j (bare-emptiness gate revert) reddened EXACTLY test 39 (invisible-only). Every one of the 15 changed radii matched a pre-run prediction — the first fix round in this ladder with zero unpredicted radii: V1 32→34, V4 16→18, V9 3→4 (test 40's precondition depends on the clamp; test 39 correctly did NOT join — the gate declines its final before the clamp), N15 15→17, R3b 6→8, R3c 6→8, R4 5→7, R5a 4→6, R5b 3→5 (both new tests reach the fallback), R5c 4→6, R5f 2→4 (invisible finals are truthy), R5g 1→3 (`/\S/` matches ZWSP/WJ — tests 38/39/40), R5h 1→2 (38/40; test 39's field never changes). R5d/R5e stayed exactly the eviction-prefers-flushed test; F3 stayed 3. V6's insert-early-copy re-anchor survived as documented (same trigger set).
- **Header rewritten to v10 from run10's measured radii** (~16 edits: matrix intro with the scanner-N8 lesson "a checker whose failure mode is a silent skip is not a check", V1/V4/V9/N15/R3b/R3c/R4/R5a/R5b/R5c/R5d-prose/R5f/R5g/R5h counts, R5 preamble → rounds 5–9 with the visible-content-delta mark, new R5i/R5j entries with the gate-masks-mark rationale written into R5i's honesty tail).
- **Suites: voice 40/40/0/0 post-header (voice-suite-v10header.out); fresh-build full suite 1466 tests / 1463 pass / 0 fail / 3 skipped (full-suite-r9fix.out, exit 0) — measured, matches the +2 prediction over 1464/1461.** Mirror cmp MIRROR-OK.
- **Sol round-10 brief written (voice-r9-donegate-brief.md)** — claim: round-9 P2 fixed via the shared `dictatedVisibleContent` predicate (inspect-don't-strip, sharpened past Sol's normalize remedy because stripping corrupts ZWNJ/ZWJ); attack angles include character-class completeness (Hangul filler/Braille blank direction-of-harm), other `\s` decision sites, the gate-masks-mark claim, test 40's clamp arithmetic, V6's re-anchored trigger set, R5i/R5j verbatim-ness, header-vs-run10 reconciliation, ES5, rounds 3–8 regression. Out-file trap warning embedded (round-9 file had TWO sol-exit lines; true verdict 5187–5207).
- Next: Sol round-10 detached → on SURVIVES the held explicit-path commit (push Andrew-gated). Higgsfield still blocked on Andrew's YouTube link.

## Checkpoint — Sol round-10 verdict + round-11 fix in progress (2026-08-08)

Sol round-10 (`.claude/genesis-2026-08-07/agent-output/voice-r9-donegate-sol.md`, tail
verdict before the FINAL sol-exit line): **DOES NOT SURVIVE** — one P2 at confidence
10/10. The predicate's class omits U+FE00-FE0F variation selectors and U+2066-2069 bidi
isolates, and because the append gate AND the flushedOnce mark share the ONE predicate,
any invisible char it wrongly calls visible both writes unseeable junk and marks the
parked entry -> preferential eviction -> a later substantive final is lost. That refutes
the round-9 comment's residual claim ("a spurious mark, not a lost final") — a lone
U+FE00 final reproduces the round-9 loss path exactly. Sol's fresh browser run was
env-blocked (listen EPERM), reported as such, not a finding.

Round-11 fix plan: widen the class to the COMPLETE Unicode Default_Ignorable_Code_Point
set plus \s (BMP enumerated; supplementary via surrogate-pair alternations incl. the
whole plane-14 block via \uDB40[\uDC00-\uDFFF]); widen test 39 fixture to
200B,2060,FE00,2066 and test 40 to 200B,FE00,2066 under maxLength 8; add mutant R5k
(class narrowed back to the round-9 form) predicted to redden exactly tests 39+40 —
closing Sol's observation that R5i/R5j revert the call sites but never mutate the class
boundary itself; whole matrix v11 re-run; header v11 from measured radii; suites; Sol
round-11.

State at this checkpoint: predicate comment rewrite LANDED in browser/raven-grab.js
(names the old sentence FALSE, commits the class to the named property, references R5k);
regex line replacement, mirror sync, fixture widening, harness v11 all PENDING. Mirror
is OUT OF SYNC until the cp lands.

## Round-11 complete — matrix v11 clean, suites measured, Sol round-11 launched (2026-08-08)

- **Class replacement LANDED** (browser/raven-grab.js:1695): the return line now strips
  the COMPLETE Default_Ignorable_Code_Point set plus \s — BMP 00AD 034F 061C 115F-1160
  17B4-17B5 180B-180F 200B-200F 202A-202E 2060-206F 3164 FE00-FE0F FEFF FFA0 FFF0-FFF8,
  supplementary via surrogate pairs \uD82F[\uDCA0-\uDCA3] (1BCA0-1BCA3),
  \uD834[\uDD73-\uDD7A] (1D173-1D17A), \uDB40[\uDC00-\uDFFF] (whole plane-14 block).
  Built from ASCII pieces by scratchpad patch-class-v11.py (no \uXXXX through tool
  params); node --check clean; cat -v pure ASCII. Lone surrogates stay content,
  deliberately. Mirror cp + cmp → MIRROR-OK.
- **Fixtures widened**: test 39 invisible run = fromCharCode(200B,2060,FE00,2066)
  self-asserted '200b,2060,fe00,2066'; test 40 leads with 200B,FE00,2066 under
  maxLength 8, cut char U+2066 not a high surrogate so no back-off, earlyCodes
  '66,75,6c,6c,20,200b,fe00,2066' + exact string value.
- **Harness v11 adds R5k** (class narrowed back to the round-9 form) — closes Sol's
  observation that R5i/R5j revert the two call sites but never mutate the class
  boundary; the round-9 class shipped 53/55 with that gap unmeasured. Harness strings
  JS-escaped with backslashes DOUBLED (js_sq helper; single-backslash would decode
  into literal invisibles and the find would miss). All 56 anchors pre-verified.
- **Matrix v11 MEASURED clean** (voice-r2-mutants-run11.out, matrix-exit:0): baseline
  40 pass / 0 skips; 56 mutants, 54 killed, survivors exactly V2+V6 (documented
  expected); zero find misses; R5k reddened EXACTLY tests 39+40 as predicted; every
  other radius byte-for-byte identical to v10 (V1 34, V4 18, V9 4, N15 17, R3b 8,
  R3c 8, R4 7, R5a 6, R5b 5, R5c 6, R5d 1, R5e 1, R5f 4, R5g 3, R5h 2, R5i 1, R5j 1,
  F3 3). Second consecutive zero-surprise round.
- **Header v11 rewritten from run11's measured radii** — intro tells the round-10
  story (class rewrite staled NOTHING because no mutant anchored the return line —
  the exact gap R5k closes; any future class change must move R5k's find-string or
  the harness aborts), R5 preamble extended, new R5k entry, R5h/R5i descriptions
  corrected from single-ZWSP to the widened three-invisible-leads fixtures, raw
  pointer → run11.out, "54 killed".
- **Suites MEASURED**: voice 40/40/0/0 (voice-suite-v11header.out, voice-exit:0);
  fresh-build full suite 1466 tests / 1463 pass / 0 fail / 3 skipped
  (full-suite-v11.out, suite-exit:0) — matches the no-new-tests prediction exactly
  (fixture widening only this round).
- **Sol round-11 brief written** (voice-r10-donegate-brief.md) — claim: complete-DI
  class + R5k boundary mutant + widened fixtures, falsifiably tested. Attack angles:
  DI enumeration vs DerivedCoreProperties (180E absence, Hangul fillers, FFA0),
  surrogate-pair alternation semantics + lone-surrogate harm direction, ES5 validity
  of the (?:...) group without /u, the shared-predicate architecture itself, fixture
  honesty (clamp arithmetic at maxLength 8, self-assert strength vs editor
  normalization), R5k verbatim-ness + harness escaping, header-vs-run11
  reconciliation, comments-as-claims, rounds 3-9 regression. Out-file trap warning
  embedded.
- Next: Sol round-11 detached → on SURVIVES the held explicit-path local commit
  ("committed locally, not yet pushed" — push is Andrew-gated). Higgsfield still
  blocked on Andrew's YouTube link.

## Checkpoint — Sol round-11 verdict + round-12 fix in flight (2026-08-08)

Sol round-11 (voice-r10-donegate-sol.md, tail verdict before the FINAL sol-exit line):
**DOES NOT SURVIVE** — one P2 at 10/10, and it is real surrogate arithmetic: the v11
plane-14 alternation used a single lead surrogate, which covers only U+E0000-E03FF —
the block's first QUARTER. U+E0400 begins at lead 0xDB41; U+E0FFF is lead 0xDB43. A
U+E0400-only final reproduces the loss path while every BMP fixture stays green, and
R5k cannot see it (its replace is the round-9 BMP form — narrowing the lead range
stays green under the whole v11 matrix). Sol's remedy verified by hand: the four-lead
range 0xDB40-0xDB43 x any trail maps exactly onto U+E0000-E0FFF, no over-match; the
other two alternations' math re-derived and correct. Sol's fresh browser run was
env-blocked (listen EPERM), reported as such, not a finding.

Round-12 fix, LANDED so far: overlay return line now carries the four-lead range
(patch-class-v12.py, ASCII pieces; node --check clean — the patcher's own first draft
had a literal plane-14 char leak into a comment via the tool-param escape layer,
scrubbed before running: the hazard the convention exists for, caught by cat -v);
predicate comment names the round-11 lead miss and points at R5k/R5l; test 39's
fixture gains U+E0400 as DB41 DC00 with the self-assert switched to split('')
per-UTF-16-unit (Array.from would fuse the pair and hide its trail), expecting
'200b,2060,fe00,2066,db41,dc00'; harness at v12 — R5k's find moved to the v12 line,
new R5l (lead narrowed back to single 0xDB40, predicted to redden exactly test 39),
preamble rewritten; all 57 anchors pre-verified; mirror MIRROR-OK. Matrix v12 running
(run12.out). Predictions: baseline 40/0; R5l exactly test 39; R5k still exactly
39+40; all other radii unchanged from v11; survivors V2+V6.

Pending: matrix v12 result -> header v12 (from measured radii) -> voice suite ->
fresh-build full suite (expect 1466/1463/0/3, MEASURE) -> Sol round-12 -> on SURVIVES
the held explicit-path commit (push Andrew-gated).

## Round-12 completion — matrix v12 clean, header v12, suites measured (2026-08-08)

Matrix v12 (voice-r2-mutants-run12.out, matrix-exit:0): baseline 40 pass / 0 skips;
57 mutants, 55 killed, survivors exactly V2+V6 (both documented expected), zero find
misses, tracked file untouched. Every prediction confirmed: R5l reddened EXACTLY
test 39 (invisible-only — its U+E0400 is the only assertion separating the lead
RANGE from the single lead; test 40 stays green honestly, BMP-only leads); R5k
still EXACTLY tests 39+40; every other radius byte-for-byte identical to v11
(V1 34, V4 18, V9 4, N15 17, R3b 8, R3c 8, R4 7, R5a 6, R5b 5, R5c 6, F3 3, the
rest per run12.out). The fix STALED R5k's anchor as the header promised a class
change would — migrated to the v12 line before the run, uniqueness check earning
its keep.

Header rewritten to v12 from run12's MEASURED radii (57 mutants / 55 killed /
run12.out; v12 story leads, v11 story demoted; R5k tail now names R5k+R5l as the
two class-boundary mutants and records the anchor migration; new R5l entry).
Code-point references in the header written as 0x/U+ notation, never backslash-u
(the tool-param escape hazard) — and the hazard bit anyway: the Sol round-12 BRIEF
came out of Write with a literal U+E0FFF character embedded where the text discussed
it (index 4242, caught by a post-write python scan, scrubbed via python). Writing
ABOUT plane-14 characters through tool params is how they leak; scan every artifact
that names them.

Post-header suites, MEASURED: voice suite 40/40/0/0 (voice-suite-v12header.out,
voice-exit:0); full suite on a fresh build pending in full-suite-v12.out (expect
1466/1463/0/3 — no new tests this round, fixture+header only). Mirror MIRROR-OK
post-round. Sol round-12 brief at voice-r12-donegate-brief.md — invites attack on
the lead-range arithmetic itself, other multi-lead supplementary DI ranges, fixture
honesty (split('') vs Array.from), the shared R5k/R5l anchor, and header-vs-run12
reconciliation.

Full suite MEASURED: 1466 tests / 1463 pass / 0 fail / 3 skipped on a fresh build
(full-suite-v12.out, suite-exit:0) — matches the v11 figure exactly, as expected for
a fixture+header-only round. Sol round-12 launched detached.

## Round 13 — Sol round-12 verdict + harness fail-closed fix (2026-08-08)

- Sol round-12 verdict read (voice-r12-donegate-sol.md, 6105 lines; duplicate-verdict trap applied — the true block is the one immediately before the FINAL sol-exit line): **DOES NOT SURVIVE — one P3, confidence 10/10.** The mutation harness's anchor handling was FAIL-OPEN: anchors were checked inside the mutation loop and a miss printed "not applied" then continued to matrix-exit:0, contradicting the suite header's abort claim — a matrix could report clean while a mutant never ran. Everything substantive was CONFIRMED by Sol: the v12 regex repair is complete against Unicode 17 ("independent exhaustive comparison under Node's Unicode 17 data found zero missing or extra code points" — only U+1BCA0-1BCA3, U+1D173-1D17A, U+E0000-E0FFF are supplementary DI ranges); run12 itself had no anchor misses (57 records, 55 killed, survivors exactly V2+V6, R5l reddening test 39); fixture and R5l exercise U+E0400 honestly; voice 40/40, full suite exit 0, mirror byte-exact. Sol's fresh browser run was env-blocked (listen EPERM) — reported as environment-blocked, not as verification and not as a finding.
- Harness fix LANDED in .claude/genesis-2026-08-07/agent-output/voice-r2-mutants.mjs: (a) fail-closed anchor preflight BEFORE the baseline — all 57 find-strings must match exactly once against the pristine overlay or the run exits 1 before any Chromium launch; (b) the in-loop anchor check DELETED (the preflight owns the rule — two copies of one rule is how they drift); (c) a syntax-failing mutant now aborts the run (exit 1) instead of being skipped with exit 0, same fail-closed rule.
- Negative test PROVEN: a doctored harness copy (first find-string prefixed ZZZ-BROKEN-) exits 1 in milliseconds — "V1-panel-delegation-deleted: FIND-STRING MATCHES 0 TIMES — fatal / 1 bad anchor(s) — aborting before any run." — fail-closed AND pre-baseline (no browser launched). node --check on the fixed harness: HARNESS-SYNTAX-OK.
- Header honesty corrections in test/grab-overlay-voice-input.test.mjs: the v12 story now credits the EXTERNAL pre-run anchor scan for catching R5k's staled anchor at run12 time and names Sol round-12 P3 plus the in-harness preflight fix; the R5k tail's "the harness aborts on a stale anchor — the round-11 fix proved it" (false as history — nothing aborted, the migration happened before the run) rewritten to date the abort to the round-13 preflight. Run-file pointer moved to voice-r2-mutants-run12b.out.
- Next: whole-matrix re-run under the fixed harness (run12b — expect the preflight line, baseline 40/0, radii identical to run12, survivors exactly V2+V6, matrix-exit:0), voice suite re-run post-header-edit, Sol round-13 brief + detached run, then on SURVIVES the held explicit-path commit (push stays Andrew-gated).

### Round 13 measured results (2026-08-08)

- Voice suite post-header-edit: 40 tests / 40 pass / 0 fail / 0 skipped, voice-exit:0 (voice-suite-v12b-header.out) — comment-only edits moved nothing.
- Matrix run12b under the FIXED harness (voice-r2-mutants-run12b.out, matrix-exit:0): first line is "anchor preflight: all 57 find-strings match exactly once" — the fail-closed preflight guarded the run that produced these radii. Reconciled against run12 with a raw diff: the two files differ by EXACTLY that one added preflight line; all 57 mutant records byte-identical, survivors exactly V2+V6, baseline 40/0. Suite header's run-file pointer already moved to run12b.
- Sol round-13 launched detached (voice-r13-donegate-brief.md → voice-r13-donegate-sol.md): narrow claim — round-12's P3 fixed fail-closed and proven; invited attack on any remaining fail-open path (runSuite output parsing, unmutated-copy runs now the in-loop check is gone, replace-string validity), negative-test scope (one broken anchor vs all), header-vs-history honesty, and the judgment not to re-run the full suite for comment-only edits.

## Round 14 — Sol round-13 verdict: two more fail-open paths + the pointer I forgot (2026-08-08)

- Sol round-13 (voice-r13-donegate-sol.md; true verdict = block before FINAL sol-exit): **DOES NOT SURVIVE — three P3s, all real.** (1) 10/10: runSuite graded ONLY from parsed ✖ lines, never the summary — a timed-out or crashed node --test parsed as zero ✖ and reported "0 red — SURVIVED" with matrix-exit:0 (Sol demoed it live with a spawnSync ETIMEDOUT reading "0 red — SURVIVED"). (2) 9/10: nothing proved a mutant copy differed from the pristine overlay — a replace===find entry would run UNMUTATED and report a survivor. (3) 10/10: the header's "Harness + raw output" pointer still named run12.out — the "update after the re-run" step from the compaction summary that never got done. Sol also confirmed: run12b reconciles (preflight line precedes 40/0 baseline, remaining lines byte-identical to run12, survivors V2+V6), mirrors byte-identical and predating both runs, node --check passes.
- Fixes LANDED in voice-r2-mutants.mjs: runSuite now parses the FULL summary (tests/pass/fail/cancelled/skipped + spawn error) and a new validateRun() aborts (exit 1) on ANY unmeasurable run — spawn error, status null, missing summary lines, skips, cancels, tests !== 40, pass+fail !== tests, distinct ✖ names !== fail, or exit status disagreeing with fail count — applied to the baseline AND every mutant. The preflight additionally rejects replace===find (with count===1, that is the one way a copy can equal the original), so a no-op mutant dies before any run; preflight success line now reads "…match exactly once and mutate".
- Negative tests PROVEN, one per mechanism: a 50ms-timeout doctored copy exits 1 at baseline ("RUN NOT MEASURABLE — spawn error: ETIMEDOUT; summary line missing: …"); a duplicate-R5l-with-replace===find copy exits 1 in the preflight ("REPLACE EQUALS FIND — a no-op mutant measures nothing — fatal"). HARNESS-SYNTAX-OK; both copies also node --check clean before running.
- Header edits: story block extended with the round-13 findings and fixes (honest history — the false-survivor path and the unproven-mutation gap both named); raw-output pointer corrected run12.out → run12c.out. Non-ASCII scan clean (only pre-existing typography + three new ✖ in prose about the ✖ parsing).
- Round-14 chain launched backgrounded: voice suite (voice-suite-v12c-header.out) → whole-matrix re-run under the hardened harness (voice-r2-mutants-run12c.out; expect the new preflight line, baseline 40/0, radii identical to run12/run12b, survivors exactly V2+V6, matrix-exit:0). Then Sol round-14, then the held explicit-path commit (push Andrew-gated).

### Round 14 measured results (2026-08-08)

- Voice suite post-header-edit (voice-suite-v12c-header.out): 40 tests / 40 pass / 0 fail / 0 skipped, voice-exit:0.
- Matrix run12c (voice-r2-mutants-run12c.out, 61 lines): diff vs run12b is EXACTLY line 1 — the preflight success line gained the "and mutate" suffix, which is the in-band proof the round-14 preflight (no-op rejection) guarded this run. All 57 mutant records byte-identical to run12b/run12; survivors exactly V2+V6 (documented expected); baseline green 40/0; matrix-exit:0. (diff exit 1 read as "files differ", body inspected — never the code alone.)
- Sol round-14 launched detached (voice-r14-donegate-brief.md → voice-r14-donegate-sol.md): claim = all three round-13 P3s fixed fail-closed with per-mechanism negative tests, run12c radii unchanged, header honest with the pointer at run12c. Invited attack on: validateRun residual fail-open paths (✖-name regex merge/truncation vs the fail-count cross-check, summary-shape variants, TDZ), the (fail===0)===(status===0) consistency check's legitimate-disagreement edge cases, writeFileSync failure, String.replace $-pattern expansion making an UNDECLARED mutation, negative-test scope (baseline vs mid-matrix timeout), header honesty, run12c reconciliation, and the no-full-suite-re-run judgment (uncontested in round 13).

## Round 15 — Sol round-14 verdict: the $-pattern hole in the no-op check (2026-08-08)

- Sol round-14 (voice-r14-donegate-sol.md, 1447 lines; true verdict = block before FINAL sol-exit): **DOES NOT SURVIVE — one P3, 10/10**, the String.replace $-pattern attack the brief invited: the preflight compared find===replace as STRINGS while the mutation used the two-arg string form, which gives the replacement $-pattern semantics — replace:'$&' differs from its find yet expands to the match and reproduces the pristine overlay, so pristine code could be graded a survivor and reach matrix-exit:0. Sol confirmed the current 57 mutants all produce changed copies, so run12c's radii are unaffected. Remedy taken verbatim: construct the mutated source in the preflight and reject mutated===original; function replacer so replacement text is literal.
- Fix LANDED in voice-r2-mutants.mjs: one `applyMutation(source, m) = source.replace(m.find, () => m.replace)` (function replacer — replacement literal) shared by preflight and run loop; the preflight's find===replace check replaced by `applyMutation(original, m) === original` → fatal "MUTATION PRODUCES NO CHANGE" — the guard is on the CONSTRUCTED output, never a string proxy. HARNESS-SYNTAX-OK.
- Measured (verify-r15-semantics.mjs): all 57 declared mutations byte-identical under string vs function semantics (the two `$`-containing replaces are `/\s$/` regex anchors, `$` before `/` is not a special pattern) — so the switch can move no radius; every mutation differs from the original; Sol's demo reproduced both directions (string semantics reproduce the original, function replacer does not).
- Negative tests, all three PROVEN exit 1 under the fixed harness: replace===find copy dies in preflight ("MUTATION PRODUCES NO CHANGE"); a string-semantics-reverted + replace:'$&' copy dies in preflight the same way (the effect-check, not the replacer switch, is the fail-closed backstop); the 50ms-timeout copy still dies at baseline ("RUN NOT MEASURABLE — spawn error: ETIMEDOUT"). All copies node --check clean first.
- Header edits: story extended with the round-14 finding and round-15 fix; pointer run12c.out → run12d.out. Non-ASCII scan clean (+2 em-dashes only).
- Round-15 chain launching backgrounded: voice suite (voice-suite-v12d-header.out) → whole-matrix run12d (expect: preflight line unchanged, baseline 40/0, all 57 records byte-identical to run12c, survivors V2+V6, matrix-exit:0). Then Sol round-15, then the held explicit-path commit (push Andrew-gated).

### Round 15 measured results (2026-08-08)

- Voice suite post-header-edit (voice-suite-v12d-header.out): 40/40/0/0, voice-exit:0.
- Matrix run12d (voice-r2-mutants-run12d.out, 61 lines): BYTE-IDENTICAL to run12c (diff exit 0 — and identical IS the expectation this round: the preflight success-line text did not change in round 15, only the mechanism behind it). Survivors exactly V2+V6, baseline 40/0, matrix-exit:0.
- Sol round-15 launched detached (voice-r15-donegate-brief.md → voice-r15-donegate-sol.md). Invited attack on: fix-matches-remedy (any residual two-arg string replace), function-replacer edge cases, the no-change check's blind spots (behaviorally-inert mutations), negative-test (b) honesty, run12d reconciliation, header honesty, and the fifth-layer question (does the preflight's `original` match what the baseline and mutants actually run — OVERLAY constant, RAVEN_GRAB_ASSET_PATH plumbing, scratch-dir staleness).

## Round 16 — Sol round-15 verdict: the evidence was ephemeral (2026-08-08)

- Sol round-15 (voice-r15-donegate-sol.md, 3087 lines; true verdict = block before FINAL sol-exit): **DOES NOT SURVIVE — one P3, 10/10, about retention, not the fix.** Sol independently re-verified the round-15 semantics with its own script (57 mutants, zero string-vs-function semantic diffs, zero function-replacer no-ops, the `$&` demo confirmed both directions) — the FIX stands. The finding: `verify-r15-semantics.mjs` lived only in the session scratchpad (ephemeral, garbage-collected — the ledger named it without quoting it), and the three negative tests existed only as prose summaries with no fabrication commands or raw outputs, so negative test (b) could not be audited to establish the `$&` entry — rather than some other malformed edit — caused the stated preflight failure.
- Round-16 response (no harness or tracked-file edits — evidence retention only): `verify-r15-semantics.mjs` copied to agent-output; `make-broken-harnesses-r15.mjs` written there as the durable fabricator (four copies into agent-output/negative-copies/); everything re-run with raw output captured to `voice-r15-negative-tests.out`, including the harness sha256 the copies were fabricated from (1925f6ed…6007).
- The new fourth copy is the discriminator Sol asked for: (c) stringsem+`$&` and (d) stringsem CONTROL share the identical semantics revert and differ ONLY by the `$&` entry — (d) prints the preflight PASS line then dies at the 50ms baseline (ETIMEDOUT), (c) dies IN the preflight naming `ZZZ-dollar-amp-mutant: MUTATION PRODUCES NO CHANGE`. The revert alone clears the preflight (consistent with the measured all-57-mutate-under-either-semantics), so the `$&` entry is provably the trigger.
- All four raw outcomes in the out-file: (a) noop exit 1 preflight; (b) timeout50 exit 1 baseline after preflight pass; (c) exit 1 preflight; (d) exit 1 baseline after preflight pass. All four node --check clean first.
- Judgment stated for Sol round-16: no tracked file and no harness byte changed this round, so neither the voice suite nor the matrix re-ran — run12d remains the current matrix and voice-suite-v12d-header.out the current suite run.

Sol round-16 brief written (`voice-r16-donegate-brief.md`) and launched detached (gpt-5.6-sol, medium, read-only) to `voice-r16-donegate-sol.md` — attacks the retention response: fabricator honesty, the (c)/(d) control's discrimination, run12d currency via the sha256 tie.
