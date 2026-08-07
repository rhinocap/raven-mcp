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
