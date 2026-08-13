# 2026-08-10 — "Add to queue" button + the grab-loss path behind it (Thread B)

Andrew, verbatim: *"I want a button on the the styles panel under instrucitons that
says "add to que" and ehen clicked it adds it to pending, I am losing grabs becasue
they are not making it to the que"*

That is a feature request AND a bug report. He reviews a slide deck through Grab and
**the URL does not change between slides** — the slides swap IN PAGE, so no
navigation and no `pagehide`.

Thread A (the three approved copy/token items) is logged separately in
`conversations/2026-08-10-approved-items.md`. Its items 2 and 3 are PARKED at his
request and must not be resumed without his word.

## State

Feature written, mirrored, tested, mutation-measured, and then **hardened by a Sol
round-1 falsification pass whose verdict was DOES NOT SURVIVE (1 P1 + 3 P2 + 3 P3)**.
**Not built, not committed, not pushed.** `main` is still `f4c4cf6`.

Changed this thread:
- `browser/raven-grab.js` — 16 edits (8 below + Fix A + 6 from the Sol round + the
  re-measured call-site comment), `node --check` clean
- `web/public/raven-grab.js` — `cp` mirror, `cmp`-verified byte-identical
- NEW `test/grab-overlay-queue-draft.test.mjs` — **7** tests, full probe pattern
- NEW `.claude/queue-draft-2026-08-10/queue-mutants.mjs` — **v4: 14 mutants + 1 control,
  14 killed, 0 survived, 0 wrong-test, EXIT=0**

Still modified from Thread A: `site/about.html`, `site/docs.html`, `site/index.html`,
`src/data/service-design/principles/service-design-principles.json`, plus the
untracked Thread A log.

## The three defects found by reading

1. **FIXED — `syncActiveStyleDraftKey()` ignored the instruction box.** It nulled
   `activeStyleDraftKey` when the four style collections were empty without
   consulting `instructionDraft`, so removing the last style edit from a draft that
   also carried an instruction rotated the draft identity: the next
   `activeStyleDraft()` minted a fresh key while `lastConnectedPending` still held
   the snapshot under the old one, and `carryDetachedDraft()` found nothing.
   `activeStyleDraft()` and `pruneEmptyStyleDraft()` both already encoded the
   correct rule — this was the third copy and the only wrong one.

   **The "harm requires a race, so no deterministic test can stage it" claim that
   stood here was FALSE, and reading `serializeLivePending()` is what refuted it.**
   Its first line skips any draft whose `target.isConnected === false`, so once the
   node is gone NO later persist can re-memoize under the rotated key — the loss is
   permanent, not racy. Test 6 stages it in one synchronous task (revert the last
   style edit via the editor, remove the slide, reselect) and mutant Q7 is now a
   graded kill at radius 1. **A claim that something cannot be tested is itself a
   claim, and it is falsifiable by writing the test.**

2. **REPORTED, not fixed — `sweepStaleStyleDrafts()` walks stashed drafts only**, so
   the LIVE active draft is never carried at the moment its element detaches.
   Widening the sweep to the active draft is not the fix: it would clear the panel
   out from under someone still typing. The explicit button is the deliberate
   remedy.

3. **FIXED ("Fix A") — two commit paths reached NO persist at all. THE ORIGINAL
   WORDING OF THIS ENTRY WAS FALSE AND IS CORRECTED HERE.**

   It said "a style-only draft is never memoized at all" and that no
   `commitStyleEdit` path persists. **The mutation matrix refuted that** — Q6 (a
   mutant deleting the new persist) SURVIVED v1 of the matrix, which forced me to
   read all eight `commitStyleEdit` call sites instead of reasoning about two:

   **The table below was ALSO wrong, in both halves, and is re-measured here** (the
   Sol round's P3-b). It named the stroke composite editor as one of the two
   no-persist paths; `beginStrokeEdit` is not a `commitStyleEdit` call site at all
   AND it does reach `syncSendButtonDisabled` (6907/6917/6942). The real pair is
   text-decoration and box-shadow. Line numbers are current as of the 15 edits:

   | call site | enclosing function | reaches a persist? |
   |---|---|---|
   | 5299 | `applyStyleVersionRestore` | YES — schedules its own at 5303 |
   | **7121** | **`beginTextDecorationEdit`** | **NO** |
   | **7344** | **`beginBoxShadowEdit`** | **NO** |
   | 7466 | `beginOverflowEdit` | YES |
   | 7616 | `beginSizeEdit` | YES |
   | 8450 | `beginStyleEdit` (generic) | YES |
   | 8558 | `beginStyleScrub` | YES |
   | 8652 | `beginRadiusEdit` | YES |

   There is no ninth call site, which is why this is a P3 and not a defect: the fix
   covers all eight either way. So the loss was real but narrower: exactly two of
   eight editors. Both end at
   `commitStyleEdit(...)` + `replaceStyleInput(...)` and stop. **Fix A** puts
   `schedulePersistPending()` at the end of `syncActiveStyleDraftKey()` — the one
   function that already means "the edit set changed" and which every commit path
   passes through — rather than patching the two editors, which would be the
   two-copies-of-one-rule drift this repo documents repeatedly.

   The corrected claim is written into the overlay comment, the mirror, and the
   suite header. It still makes the button's SYNCHRONOUS `persistPendingNow()`
   load-bearing: a 250ms debounce loses a race with a slide advance (mutant Q5).

## The 8 edits in `browser/raven-grab.js`

1. `syncActiveStyleDraftKey()` — added `|| instructionDraft.trim()` (defect 1) and a
   `syncQueueButton()` call.
2. `queueActiveDraft()` — flush the open editor, `capturePanelDrafts()`,
   `stashActiveStyleDraft()`, clear `instructionDraft` (the stash copies it onto the
   draft but does not empty the shared box — leaving it renders the instruction
   twice), `persistPendingNow()` **synchronously**, `renderPanel()`.
3. `queueDraftBlocker()` — returns the REASON string, not a boolean.
4. `syncQueueButton()` — in-place sync of `[data-queue-draft]` disabled state and
   `.raven-grab-queue-note`, because a style commit deliberately does not
   `renderPanel()`.
5. `syncSendButtonDisabled()` — added `syncQueueButton()` (the instruction box is
   the half of "is there work" that never touches the style collections).
6. Markup in `instructionsMarkup`, which renders in BOTH the desktop Styles/Design
   footer and the mobile Instructions tab. Button and note are ALWAYS in the DOM
   (note merely `hidden`), per the `styleVersionsMarkup` precedent.
7. CSS `.raven-grab-queue{,-add,-note}`, cloned from `.raven-grab-version-save`.
8. Click delegation after the `[data-save-version]` branch; on success only,
   `setGlobalActionStatus("Added to queue")`.

9. **Fix A** — `schedulePersistPending()` at the end of `syncActiveStyleDraftKey()`,
   with the measured eight-call-site table above written in as a comment.

No new `voiceButtonMarkup(` call site, so the mic source-enumeration test in
`test/grab-overlay-voice-alignment.test.mjs` is unaffected.

## The test suite and its matrix

`test/grab-overlay-queue-draft.test.mjs` — 7 tests, FULL probe pattern (loopback
`listen` with `once('error')`, mkdtemp/writeFile/rm, launch, newPage, `goto` with
`.ok()`, close), a real local session, a two-slide fixture, raw mouse selection.
Baseline **7 tests / 7 pass / 0 fail / 0 skipped**.

1. banks the live draft into pending and empties the instruction box
2. states its reason and enables the moment a style is committed
3. a style-only draft survives its slide being removed
4. banks synchronously, so a slide advance in the same tick cannot beat it
5. refuses a draft whose element has already gone, instead of reporting success
6. reverting the last style edit does not orphan the instruction still in the draft
7. still banks a detached draft that WAS already snapshotted

**Matrix v4 (`node .claude/queue-draft-2026-08-10/queue-mutants.mjs`), re-run WHOLE:**

```
baseline: 7 tests / 7 pass / 0 fail / 0 skipped
Q1  killed (radius 1) T2       Q8  killed (radius 4) T1 T4 T5 T7
Q2  killed (radius 4) T1 T4 T5 T7   Q9  killed (radius 1) T5
Q3  killed (radius 3) T1 T2 T5      Q10 killed (radius 1) T7
Q4  killed (radius 2) T1 T4         Q11 killed (radius 1) T5
Q5  killed (radius 1) T4            Q12 killed (radius 1) T5
Q6  killed (radius 1) T3            Q13 killed (radius 1) T5
Q7  killed (radius 1) T6            Q14 killed (radius 1) T2
C1  CONTROL … OK (green, as expected)
14 mutants, 14 killed, 0 survived, 0 killed the wrong test; 1 control, 0 false-failed
EXIT=0
```

**The harness now grades by TEST NAME, and that is what caught its own
mis-declaration.** v3 came back `EXIT=1` with `Q12 WRONG TEST` — Q12 was declared
against T2 on my assumption that a blocked button's `title` comes from
`syncQueueButton()`, and it does not: `instructionsMarkup` renders `title` inline,
so T2's idle read is satisfied by the RENDER and Q12 is only visible where the
title has to be updated IN PLACE after the element detaches. Two ends of one a11y
fix, two mechanisms, so Q12 was retargeted to T5 and **Q14** added for the
render-time half. A harness grading on `fail > 0` would have filed v3's Q12 as a
clean kill and the mis-declaration would never have surfaced — which was exactly
Sol's finding about this harness.

**Radii are facts about mechanisms, not counts of guards.** Q2 and Q8 sit at
radius 4 because they break the entry point every other assertion runs through.
Q9/Q11/Q12/Q13 all sit at radius 1 on the SAME test and are four separate
mechanisms, separated by which assertion inside T5 fails — read the message.

**v1 of that matrix had Q1, Q5 and Q6 all SURVIVING.** All four tests passed on
their first run and all three survivors were fixture defects, not missing guards —
the fourth time this repo has caught a test encoding rather than detecting:

- **Q1 survived** because `syncQueueButton()` was reached TWICE on the
  generic-editor path (`commitStyleEdit` → `syncActiveStyleDraftKey` → sync, AND
  the editor's own `syncSendButtonDisabled()` → sync). Fixed by driving test 2
  through the **box-shadow (Effects)** editor, which calls neither.
- **Q6 survived** because six of eight commit paths already persist — see the
  corrected DEFECT 3. Test 3 now goes through the Effects row too. That is why the
  fixture carries `box-shadow: 0 1px 2px rgba(0,0,0,0.2)` on `.headline`: a style
  row only renders for a property with a non-default value.
- **Q5 survived** because test 4 called `field.focus()`. **MEASURED in Chromium
  with a throwaway probe** (since deleted): removing the focused textarea fires
  `blur` then `focusout`, and that focusout **still reaches a DELEGATED listener on
  the container it was removed from** — probe output
  `{"focusedBefore":"t","log":["direct-blur","direct-focusout","delegated-focusout"],"activeAfter":"BODY"}`.
  The `onPanels("focusout")` hook at 13468 then persisted synchronously while `#a`
  was still connected, masking the debounce. Fixed by dropping `field.focus()`.
  Consequence worth carrying: **the mask only ever covers a draft whose instruction
  box had focus** — a style-only bank has nothing standing in for it.
- **Q6's find-string went stale** the moment I rewrote the comment it was anchored
  to, caught by the harness's own presence check and re-anchored to the
  `schedulePersistPending(); }` boundary. Standing rule earning its keep again.

**Q7 was a declared EXPECTED SURVIVOR for a round, and that declaration was
wrong.** I claimed defect 1's harm needed a race — the node detaching before the
next persist re-memoizes under the rotated key — so no deterministic test could
stage it. Reading `serializeLivePending()` refuted it: it returns early on any
draft whose target is already detached, so once the node is gone NOTHING can
re-memoize under either key and the loss is permanent rather than racy. Test 6
stages it deterministically and Q7 is now an ordinary radius-1 kill. There is no
expected-survivor category left in this harness. **A claim that something cannot
be tested is itself a claim, and it is falsifiable by writing the test.**

## The regression the feature caused, and why the TEST was the thing repaired

The full suite came back **EXIT=1 — 1527 tests / 1523 pass / 1 fail / 3 skipped**. All
four queue tests passed. The single failure was `a preset writes the KEYWORD, not its
bezier expansion` (`test/grab-overlay-easing-control.test.mjs:512`, assertion at :536):
`actual: 'cubic-bezier(0.4, 0, 0.2, 1)'` against `expected: 'ease-out'` — i.e. the row
kept its ORIGINAL value, which reads exactly like the preset having written an
expansion.

**Causality was measured, not inferred.** The same suite run against the HEAD overlay
via `RAVEN_GRAB_ASSET_PATH=/tmp/overlay-head.js` is 12/12 green; against my overlay it
is 11 pass / 1 fail. Deterministic, and mine.

**The mechanism, from a throwaway DIAG copy of the suite (since deleted):**

```
{"pt":{"x":1144.4140625,"y":432.03125},"viewport":{"w":1280,"h":720},
 "hostHit":"DIV#","deepHit":null}
```

Nothing of the shadow tree is at the preset's own measured centre — `deepHit` is null
and the topmost element is a fixture div, so the click never reached the button.
`instructionsMarkup` is composed into `actionMarkupA`, the **pinned actions chrome**, so
the new "Add to queue" row shrank the flex styles list and pushed the editor's
bottom-most preset row below the list's clipped edge. The rect stays a perfectly valid
layout rect, which is why the failure presented as a value mismatch rather than as a
missing element. The handle-drag tests still pass because the SVG surface sits higher in
the editor.

**Layout kept, test repaired.** Andrew asked for a button under Instructions; the
vertical space is the feature, not the bug. What was actually broken is an IMPLICIT
precondition the test had been relying on — that the preset is hit-testable where it is
measured. It now `scrollIntoView`s, measures, and asserts
`root.elementFromPoint(x, y) === button` before clicking. **Different coverage, not
a strict superset** — and the first version of this paragraph said "strictly
stronger, not weaker", which is false and is the exact shape of claim this thread
keeps having to correct.

The repair has two halves and only one of them is additive. The hit-test IS a gain:
a mis-scoped click now fails with a named precondition instead of a value mismatch
pointing at the wrong code. The `scrollIntoView` is a LOSS, and specifically the
loss of the regression that started this: a preset row pushed below the styles
list's clipped edge is now scrolled back into view before it is measured, so the
chrome-height change I made would no longer turn this test red. That is a
deliberate trade — the test's subject is "a preset writes the keyword", not "the
preset row fits" — but it is a narrowing, and calling it a superset would have
buried the one thing a future reader needs to know: **nothing in this suite guards
the pinned chrome's height against the styles list any more.** An at-rest
actionability assertion is deliberately NOT stacked on top of the hit-test; two
preconditions guarding one mechanism is the drift documented elsewhere in this
repo. Post-repair: **12 tests / 12 pass / 0 fail / 0 skipped**.

**E15's anchor was dead and the harness caught it.** Re-running the easing matrix WHOLE
per the standing rule aborted in pre-flight with zero mutants measured:

```
ANCHOR MISS or NOT UNIQUE: E15 the easing presets are left out of the style-value control list
preflight failed (1)
```

Diagnosed by reading rather than guessing: **absent, not non-unique, and not caused by
this thread.** E15's find-string ended in `!== -1;` because the easing clause used to
terminate the `||` chain in `isStyleValueControl`; the spring-presets round
(2026-08-08, later the same day) appended a `raven-grab-spring-preset` clause below it
and took the semicolon with it. The anchor has been dead since that round — nothing
between then and now re-ran this matrix, which is the only reason it went unnoticed.
Re-anchored WITHOUT the semicolon (`… !== -1\n` → `|| false\n`), so the replacement
leaves the chain unterminated for the spring clause to end; restoring the semicolon
would make the mutant a syntax error rather than a detection.

## Measured (2026-08-10, both runs read from their own logs)

**Full suite** — `RAVEN_NO_USAGE_LOG=1 npm test`, log `/tmp/t-full.log`:
**1530 tests / 1527 pass / 0 fail / 3 skipped**, `EXIT=0`, read off the runner's own
summary line. The **+7** over the ledgered 1523/1520 is exactly the seven tests in
`test/grab-overlay-queue-draft.test.mjs` and nothing else — the sixteen overlay edits,
the four corrected claim blocks in that suite's header and the easing test's repair all
move the count by zero. **The earlier prediction in this section was +4 and it was
wrong**, because it was written when the suite held four tests and was never re-derived
after tests 5–7 (the gone-element refusal, the orphaned-instruction key, and the
snapshotted-detached bank) landed. A delta predicted from a stale count is arithmetic,
not a measurement. The **3 skips are the same three this ledger has always carried** and
were read INDIVIDUALLY at output lines **109 / 714 / 715** (the file-URL fallback notice
and the two removed-capability phase2 tests) rather than inferred from the total; none of
the seven new tests is among them, and the queue suite uses the FULL probe pattern.

**Easing matrix, re-run WHOLE** — `node .claude/overlay-controls-2026-08-08/easing-mutants.mjs`,
log `/tmp/easing-matrix-v5.log`: **15 mutants, 15 killed, 0 survived**, `EXIT=0`,
against green baselines of parser **287/0** and widget **12/0**. Every one of the fifteen
radii was diffed against the suite header's own Run 5 table and **all fifteen match**
(E1 10, E2 4, E3 1, E4 1, E5 1, E6 11, E7 1, E8 5, E9 1, E10 13, E11 1, E12 2, E13 1,
E14 1, E15 1). That header was written from a run and is now CONFIRMED by an independent
one rather than trusted — the check that mattered was E2 3→4 and E6 10→11, the two radii
the spring round's generative-only assertion block moved, plus E15 answering at all after
its find-string had been dead for two days. **A header claiming a measurement is a claim
like any other; this one held.**

## Exact next commands

1. Done-gate, then one detached Sol round 2 — report-only falsification over the
   queue feature, the v4 matrix and the two corrected claim blocks:
   `codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium … < /dev/null > /tmp/sol-queue-round2.log`
   then READ the file. Detached because a real audit outruns the 10-minute Bash cap,
   and an empty or environment-blocked output is never dispositioned as "no findings".
2. Disposition every real objection it returns; re-run the queue matrix WHOLE if any
   fix touches `browser/raven-grab.js`, and re-run the easing matrix too if the fix
   touches a predicate a second harness anchors (the cross-feature gap that left E15
   dead — see the report-only list below).
3. Then the human gates below — nothing is built, committed or pushed.

## Report-only (one line each, do NOT fix)

1. **DEFECT 2** — the one-line issue held back deliberately from this scope.
2. **The matrix-anchor rule is written per FEATURE and needs to be per PREDICATE.** A
   shared predicate like `isStyleValueControl` is anchored by more than one harness, so
   the spring round's edit left E15's find-string dead for two days and nothing noticed,
   because that round re-ran only its own matrix.
3. **`site/index.html` still says "104 tools"** — npm ships 105.
4. **`docs/nc-license-cleanup.md` is tracked in this public repo.**

## Human gates (Andrew's alone)

1. **Push to `main`** — moves the git-integrated `site` project, i.e. the gated
   `mcp.ravenmcp.ai`. Re-verify the anonymous 45-tool hash `f64bb18…2bb0a6` against
   the production alias afterwards.
2. **`cd /Users/accunliffe/projects/raven-mcp/web && vercel deploy --prod --yes`** —
   the apex has no git integration, so the overlay mirror stays publicly invisible
   until he runs it.
3. **Reload the deck tab** — the running overlay in his browser is the old one.

---

# Checkpoint — Sol round 2 + the eyes-on pass (post-compaction)

Two independent adverse signals landed in the same minute. Both are recorded here
before either is fixed, because the previous context window ended without this
checkpoint reaching a file.

## Mirror re-confirmed by an independent party

Sol ran `cmp -s browser/raven-grab.js web/public/raven-grab.js` itself and reported
`CMP_EXIT=0`. That is a second party measuring the byte-identity the suite asserts,
not my own re-read.

## FINDING A (mine, from the eyes-on capture) — the panel claims "pending" over nothing durable

`capture-queue-button.mjs` gained two probes at lines 117–118: `pendingHeaderText`
(the "N pending" card header) and `storedBytes` (the length of
`sessionStorage["raven-grab-pending-v1"]`). The key was **verified by grep**, not
recalled — `PENDING_STORE_KEY = "raven-grab-pending-v1"` at `browser/raven-grab.js:11090`,
read at 11095, written at 11141, removed at 11142. Distinct from
`STYLE_VERSION_STORE_KEY` (4923/4982/4984) and the literal `"raven-grab-batch-committed"`
(11018/11054).

Measured, `/tmp/queue-capture-v2.log`, EXIT=0:

| state | draftRows | pendingHeaderText | storedBytes |
|---|---|---|---|
| 1 — selected, nothing to bank | 0 | `null` | 0 |
| 2 — a box-shadow edit is live | 1 | **"1 pending"** | **0** |
| 3 — instruction typed as well | 2 | **"2 pending"** | **0** |
| 4 — after the click | 2 | "2 pending" | **1694** |

The card says "1 pending" and then "2 pending" while **nothing at all is durable**.
Only the click produces bytes. **This is Andrew's own sentence reflected back by the
UI** — he was told his grabs were pending, and they were not; he lost them on the
next slide. No test caught it because every test reads `draftRows` or `stored` and
none asked whether the visible LABEL overstates durability.

**Honest caveat, recorded rather than buried:** the capture waits only 60ms after the
instruction `input` event, which is inside the 250ms debounce, so state 3's zero is
*partly* the debounce not having fired yet. **State 2 is not explained that way** —
`beginBoxShadowEdit` (call site 7350) reaches no persist at all, so "1 pending" with
zero bytes is structural, not a race. Verifying that is part of the probe below.

## FINDING B (Sol round 2) — a stale memo permits "success" while losing newer work

Verdict **`DOES NOT SURVIVE`**, exactly one finding, verbatim:

> **P1 — A stale memo permits "success" while losing newer work.** Input: persist
> instruction A; then commit a new style edit and detach the slide before the 250 ms
> debounce; press **Add to queue**. `queueDraftBlocker()` accepts any memo for the key
> without checking freshness (browser/raven-grab.js:4182). The sweep carries the old
> snapshot (browser/raven-grab.js:4322), drops the current draft, and the click reports
> "Added to queue" (browser/raven-grab.js:12841). Test 7 never mutates the draft after
> memoization, so it misses this case (test/grab-overlay-queue-draft.test.mjs:648).

### Sol's own run was ENVIRONMENT-BLOCKED, and my harness refused to grade it

Chromium died at launch inside Sol's sandbox:

```
[FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS.
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.69153: Permission denied (1100)
exception while trying to kill process: Error: kill EPERM
<process did exit: exitCode=null, signal=SIGTRAP>
```

The suite came back `tests 7 / pass 0 / fail 0 / skipped 7`, and
`.claude/queue-draft-2026-08-10/queue-mutants.mjs:164` threw
`Error: 7 skipped, expected 0 — the browser probe did not pass`. **The v4 baseline
guard earned its keep on the first sandbox that produced this shape** — a run that
measured nothing was refused rather than graded, which is exactly why the guard was
added. Consequence: **Sol's P1 is a READING finding with no measurement behind it**,
so it is GUESSED until I measure it myself.

### Structurally confirmed by reading, and SHARPER than Sol stated

`queueDraftBlocker()`'s third condition (`browser/raven-grab.js:4182`) is
`!lastConnectedPending[activeStyleDraftKey]` — it asks whether a memo **EXISTS**,
never whether it is **FRESH**. `carryDetachedDraft()` (4322) then pushes that `entry`
**verbatim**, and `dropStyleDraft()` discards the fresher live draft, clearing the memo
last and unconditionally. So the mechanism holds.

**The route Sol did not name is deterministic and needs no 250ms race.** Because
`beginBoxShadowEdit` (7350) and `beginTextDecorationEdit` (7127) are the two
`commitStyleEdit` call sites that reach **no persist**, a memo written from an
instruction-only state is stale **by construction** the moment a box-shadow edit is
committed. That is **DEFECT 3 joined to the existence-only memo check** — I had
recorded both halves separately and never connected them.

`.claude/queue-draft-2026-08-10/probe-stale-memo.mjs` measures exactly that: instruction →
400ms (memo written, asserted) → box-shadow commit → 600ms (is it in storage?) →
detach `#slide1` → click → does the status say "Added to queue" while storage lacks
the box-shadow value?

### Fix direction (decided only after the measurement)

The third condition must ask **freshness**, not existence — either the memo must
correspond to the current draft's content, or the bank must refresh the memo
synchronously before consulting it. Whatever the shape, it needs **two** mutants on
the T5/T7 pattern already used for Q9/Q10: one proving the refusal fires, one proving
it stays NARROW. A blanket "a memo may be stale → refuse" is a red on correct code,
and the clause's own comment says so.

## Still owed on the gate

1. Measure the probe, disposition Finding B, then re-run the queue matrix **WHOLE**
   (any fix moves find-strings).
2. Disposition Finding A — same false-reassurance family, and literally Andrew's
   sentence, so decide in-scope vs report-only rather than silently widening.
3. Read `/tmp/queue-capture/3-instruction-typed.png` and `4-after-bank.png` (+ `-full`)
   with vision. 3 of 5 PNGs read so far.
4. Dual target-customer walkthrough (the grab/DESIGN.md override binds BOTH lenses),
   then `design-judge` on the rendered button BEFORE any completion claim, then the
   Fable 5 once-over logging Sol-only / Fable-only / both.

---

## CORRECTION — two of the previous entry's own claims are refuted (2026-08-10, later)

The checkpoint above is partly stale and partly wrong. Both corrections came from
measurement, and both reverse something I wrote confidently.

### My first probe's discriminator was INERT, so its "P1 REFUTED" verdict was worthless

`.claude/queue-draft-2026-08-10/probe-stale-memo.mjs` v1 tested `/box-shadow/` against the
whole stored blob. The captured computed styles carry the PROPERTY NAME whether or not an
edit exists, so it read `hasShadowEdit: true` at stage A — **before any box-shadow edit had
been made**. Line 1 of `/tmp/probe-stale-memo.log` is the proof. Its row selectors were
wrong too: `carriedRows: 0 / draftRows: 0` after a successful bank, because the real
attribute value is `carried:live:style-draft-1` and I was guessing prefixes.

This is a self-inflicted instance of the class this repo documents over and over: a check
whose failure mode is indistinguishable from its success mode is not a check. v2 walks the
payload STRUCTURALLY — `styleEdits` / `stateStyleEdits` / `tokenIntents` property/value
pairs, every `data-remove-change` value verbatim, `parseError`, `entryKeys` — and reports
anything it cannot find as a shape surprise rather than as a false negative. It reads
`edits: []` at stage A and `styleEdits:0="0 4px 16px rgba(0, 0, 0, 0.18)"` at stage B, so
it now discriminates in BOTH directions.

### The "deterministic staleness route" I proposed DOES NOT EXIST — and my own shipped fix is why

I asserted that because `beginBoxShadowEdit` (7350) reaches no persist of its own, the memo
is stale by construction and Sol's P1 needs no race. Measured (`/tmp/probe-shape.log`,
EXIT=0): storage grew **1491 -> 1666 bytes** across that commit and the edit appeared in the
memo. Reading `browser/raven-grab.js:4050-4090` explains it — **`syncActiveStyleDraftKey()`
ends in `schedulePersistPending()` at line 4082**, which is the line THIS FEATURE added to
close the two no-persist call sites. The two-no-persist fact is true of the CALL SITES and
irrelevant to persistence, because the shared sync hook covers them.

So on the >250ms route the feature behaves correctly end to end:

| stage | memo instruction | memo edits | live inline | rows | status |
|---|---|---|---|---|---|
| A instruction typed, +400ms | KEEP THIS INSTRUCTION | `[]` | `""` | `draft-instruction:*` | — |
| B box-shadow committed, +600ms | KEEP THIS INSTRUCTION | `styleEdits:0="0 4px 16px rgba(0, 0, 0, 0.18)"` | `rgba(0, 0, 0, 0.18) 0px 4px 16px` | `draft-style:*:box-shadow`, `draft-instruction:*` | — |
| C slide detached, then banked | KEEP THIS INSTRUCTION | same value, preserved | `null` (gone) | `carried:live:style-draft-1` | **Added to queue** |

`aria-disabled` was `null` at press time. The bank was honest: it reported success over work
that genuinely survived.

### What is STILL OPEN, narrowed

Sol's P1 specified detaching the slide **before the 250ms debounce fires**. My probe waited
600ms at stage B and therefore never tested Sol's route at all — it tested a route I
invented and then refuted. The structural gap Sol named is real and unchanged:
`browser/raven-grab.js:4182` asks `!lastConnectedPending[activeStyleDraftKey]`, which is an
EXISTENCE test and never a FRESHNESS test. So the open question is exactly:

> If detachment and the bank happen INSIDE the debounce window, is the carried memo stale,
> and does the bank still report "Added to queue" over work it dropped?

### FINDING A's key claim is RETRACTED pending re-measurement

FINDING A said state 2's `storedBytes: 0` "is not explained by the debounce, because the
box-shadow call site reaches no persist." That reasoning is dead with the premise. The
capture script reads state 2 immediately after `editBoxShadow` with **no wait at all**, so
the zero is most likely just the 250ms debounce, exactly as at state 3. The finding may
reduce to "the panel shows pending rows for up to 250ms before they are durable" — a much
smaller claim, though a slide advance inside that window is still a real loss window.
**Must be re-measured with a 400ms wait at states 2 and 3 before dispositioning.**

---

## FINDING B — CONFIRMED. Sol round 2's P1 is real, and it is a false all-clear.

Measured 2026-08-10. Raw numbers copied out of the ephemeral `/tmp` into
`.claude/queue-draft-2026-08-10/measurements/probe-race2.log` (plus `probe-race.log`, the
refused run, and `probe-shape.log`, the >250ms route).

### The verdict

With the debounce window **provably** hit:

```
{ "windowHit": true, "liveEntryCount": 1, "liveDraftHadStyleEdit": true,
  "storedEditsBefore": [ [] ],
  "ariaDisabledAtPress": null, "buttonHiddenAtPress": false,
  "statusAfter": "Added to queue",
  "storedEditsAfter": [ [] ],
  "storedInstructionAfter": [ "KEEP THIS INSTRUCTION" ],
  "removeChangeAfter": [ "carried:live:style-draft-1" ],
  "rawBytesAfter": 1491, "msFromCommitReturnToRaceBlock": 0 }

VERDICT saidSuccess=true styleEditSurvived=false
P1 CONFIRMED: "Added to queue" reported while the newer style edit was dropped.
```

The button said **"Added to queue"**. Storage afterwards still reads `edits: []` at 1491
bytes — the same 1491 the instruction-only memo occupied. The box-shadow edit the user had
just committed was dropped while they were told it was queued. That is precisely the class
of loss Andrew reported, and a false all-clear is the one forbidden outcome for a control
whose entire job is not losing grabs.

### The mechanism

Three facts, each read from the source rather than inferred:

1. `lastConnectedPending` has exactly **one** writer — `serializeLivePending()` (11103),
   reached only via `persistPendingNow()`. Every ordinary edit arrives there through
   `syncActiveStyleDraftKey()` → `schedulePersistPending()` (4082), a **250ms debounce**.
   Detachment is instantaneous. So the memo lags every commit by up to 250ms.
2. `queueDraftBlocker()` (4182) asks only whether a memo **exists**
   (`!lastConnectedPending[activeStyleDraftKey]`). It is an existence test and never a
   freshness test.
3. `carryDetachedDraft()` (4320) promotes `lastConnectedPending[draft.clientKey]`
   **verbatim**.

So any commit inside the debounce window is invisible to the carry, and nothing anywhere
notices.

### Blast radius is wider than the new button

`carryDetachedDraft()` is **shared with the automatic sweep** (`sweepStaleStyleDrafts`,
4338–4346), so the pre-existing detached-draft rescue — the slide-deck fix shipped
2026-08-08 — carries the same staleness. The fix belongs in that one shared place, not in
the queue path.

### Three instrument fixes were needed before the measurement could be trusted

The first race run **refused to return a verdict** (`windowHit: false`) and that refusal was
correct: `sessionStorage.removeItem` after `page.reload()` came too late, because the overlay
had already hydrated stage C's carried entry and re-persisted it, so the precondition summed
edits over **two** entries and reported a missed window on a window it may well have hit.

- A fresh `browser.newContext()` instead of a reload (`const page` → `let page` at line 194).
- The precondition scoped to `/^live:/` entries — summing over every entry lets an unrelated
  carried row answer the question.
- `windowHit` made a **three-state** predicate (`beforeEdits === 0 && liveBefore.length > 0`):
  a live memo carrying the edit means the debounce already fired, but **no live memo at all**
  means the instruction never persisted either, which is a different failure and not a hit.
- `msFromCommitReturnToRaceBlock` added, so a future miss is diagnosable rather than mute.

The whole race runs inside **one** `page.evaluate` block on purpose: JavaScript is
single-threaded, so a pending `setTimeout` cannot interleave with a synchronous block — that
makes the window deterministic rather than hoped-for.

### Why the payload can be repaired at all

`payloadForSend` (12338) throws `ravenSelectionGone` on a detached target, so the
DOM-derived half — `selector/html/rect/styles/tokens/stateStyles`, plus `multiSelect` —
genuinely cannot be rebuilt after the node leaves; that snapshot is the entire point of
memoizing while connected. The **edit-bearing** half is draft data:

- `scopedIntentForSend` (read verbatim) returns the intent **untouched** when
  `scope !== "component"`, and under component scope it already has an explicit detached
  branch that reads the frozen `selection.componentScope` instead of resnapshotting. It does
  not throw and does not need a live node.

So the fix overlays the draft's **current** edits onto the frozen snapshot. Not a rebuild
(impossible) and not the stale payload (a lie).

## FIX B IMPLEMENTED — `freshenedCarryEntry`, green but not yet mutant-proven

**Where.** `browser/raven-grab.js:4351` (`freshenedCarryEntry`), wired at `:4388` inside
`carryDetachedDraft` as `entry = freshenedCarryEntry(entry, draft);` — after the `!entry`
early exit, before the `already` check, so dedupe keys are untouched. Mirrored to
`web/public/raven-grab.js`, `cmp -s` identical, `node --check` clean.

**What it does.** Overlays the draft's CURRENT edit-bearing fields (`tokenIntents`,
`styleEdits`, `stateStyleEdits`, `instruction`, conditional `textEdit`) onto the frozen
`lastConnectedPending` snapshot, keeping its DOM-derived half (`selector`, `html`, `rect`,
`styles`, `tokens`, `stateStyles`, `multiSelect`).

**Five decisions, each in the code comment.** (a) The DOM half genuinely cannot be
rebuilt — `payloadForSend` throws `ravenSelectionGone` on a detached target — so overlay,
never rebuild, never ship the stale one. (b) Unconditional, no staleness predicate; also
fixes the inverse bug (a row REMOVED inside the window was carried as though still
wanted). (c) No emptiness guard, because `pruneEmptyStyleDraft` makes that state
unreachable. (d) Deep-clone through JSON as `serializeLivePending` does — the entry reaches
`sessionStorage`, and one unserializable intent would poison the whole store; a throw
returns the stale-but-real entry rather than nothing. (e) `if (!draft.target) return entry;`
because `scopedIntentForSend`'s `target || selectedElement` would rescope a component-scope
intent against a DIFFERENT element.

**Rejected:** refreshing the memo synchronously at commit time — `syncActiveStyleDraftKey`
has fifteen callers including the instruction input handler, so that is a full
`payloadForSend` per keystroke. The debounce exists for that reason.

**The blocker at `queueDraftBlocker` was NOT widened.** A memo must exist to have a DOM
snapshot at all; Q10 already proves a blanket detached refusal is a red on correct code.

**Test 8** added to `test/grab-overlay-queue-draft.test.mjs`: *'Add to queue carries the
edit committed inside the persist debounce, not the stale snapshot'*. Memo established past
400ms, `styleEdits: []` asserted as a precondition, font-size editor opened with real
clicks, then commit-to-44px + `#slide1.remove()` + bank click in ONE `shadowEval` block.
Discriminators: `deepEqual(carried[0].styleEdits, ['font-size=44px'])` and the frozen-half
trio (`hasSelector`, `htmlLength > 0`, `styleKeys > 0`).

**Test-side error worth carrying:** my first reader filtered STORED entries on `/^carried:/`
and got 0. `carriedPending` holds the memo entry verbatim, so its stored key stays
`live:<clientKey>`; only `renderPanel()` prefixes `carried:` onto `data-remove-change`.
Carried-ness is read off the RENDERED row now, with a comment saying a stored-key filter
would fail on correct code.

**Measured:** `node --test test/grab-overlay-queue-draft.test.mjs` → 8 tests / 8 pass /
0 fail / 0 skipped. `echo "EXIT=${PIPESTATUS[0]}"` after a `| tail` returned EMPTY in both
runs — capture the status directly, never behind a pipe.

## HARNESS v5 — the message expectation, and why it was needed

Q15 and Q16 redden the SAME test and are separated only by which assertion aborts first, so
the v3 grader (which matches test NAMES) would print `killed (radius 1)` for both whichever
one actually broke. That is the round-1 finding one level up. `queue-mutants.mjs` now takes
an optional 7th tuple field `expectMessage`, checked against the whitespace-collapsed run
output — collapsed because a wrapped or indented assertion message would otherwise stop
matching silently, which is a check whose failure mode is indistinguishable from its
success mode. A red test on the wrong assertion is `WRONG ASSERTION`, counted separately
and reaching `process.exitCode`.

- **Q15** — the overlay never fires (delete the `freshenedCarryEntry` call), which restores
  the shipped P1 exactly. Expected red: T8 on *'the edit committed inside the debounce is
  what got carried'*.
- **Q16** — the frozen DOM half is discarded (drop the `entry.payload` spread). Expected
  red: T8 on *'the frozen snapshot still supplies the selector'*.

Baseline declaration bumped 7 → 8 tests / 8 pass / 0 skipped.

**REPORT-ONLY (not fixed, deliberately):** Q9/Q11/Q12/Q13 are four mechanisms all at radius
1 on T5 and still carry no `expectMessage`, so their attribution rests on reading the output
by hand — the same gap v5 just closed for Q15/Q16, left as one line rather than a fix.

**NOT DONE:** the WHOLE matrix re-run (in flight), the full-suite re-measure, FINDING A, the
two remaining PNG vision reads, the dual customer walkthrough, `design-judge`, Fable, and a
fresh Sol pass on `freshenedCarryEntry` + test 8.

**Tree:** HEAD `f4c4cf6`. Nothing built, committed, or pushed. Gates: Andrew's push, his
`cd web && vercel deploy --prod --yes`, and his tab reload — the overlay running in his
browser right now is the old one.

---

## v5 MEASURED, and the message check proven in BOTH directions

`.claude/queue-draft-2026-08-10/measurements/matrix-v5.log` — re-run WHOLE, exit status captured
inside the log:

```
baseline: 8 tests / 8 pass / 0 fail / 0 skipped
16 mutants, 16 killed, 0 survived, 0 killed the wrong test, 0 hit the wrong assertion;
1 control, 0 false-failed
EXIT=0
```

**The message check was then falsified deliberately**, because a guard proven only in the
passing direction is unproven — this repo's own rule, from the `node --check -` pre-flight.
A copy of the harness with Q15's and Q16's `expectMessage` values SWAPPED reports **WRONG
ASSERTION on both** and exits 1
(`.claude/queue-draft-2026-08-10/measurements/v5-message-check-falsification.log`). That also
confirms the attribution claim from the other side: each mutant's red lands on the OTHER's
declared assertion when swapped, which is what "separated only by which assertion aborts
first" actually means.

Running that subset needed an `ONLY=` filter, which shipped assigning to `const MUTANTS` —
fixed to `let` before the run. A filtered run prints `SUBSET RUN … — not a matrix result` and
must never be recorded as one.

### Radius diff, read against the header table and NOT against memory

**EXACTLY THREE radii moved: Q5 1→2, Q8 4→5, Q10 1→2**, all picking up T8, all because the
round added a test and no guard to any of them. **My own pre-write note had Q2 among the
moved and Q2 did not move** — radius 4 in v4, radius 4 here. That is the standing rule
earning its keep in the exact way it is written: a radius diff is a DIFF, so read it against
the table, never against a recollection of the previous run.

Suite header rewritten to v5: the new table, the three moved radii named as mechanism-sharing
rather than new guards, a new **(a2)** paragraph on the machine-checked attribution and its
two-directional proof, and a new **(d)** paragraph on why the carry is an OVERLAY (Q15 and
Q16 are the two losses it sits between).

## Full suite re-measured — 1531 / 1528 / 0 fail / 3 skipped, EXIT=0

`.claude/queue-draft-2026-08-10/measurements/full-suite-after-v5.log`. **+1 over 1530 is exactly
test 8**, the only test added since that figure. The 3 skips were read INDIVIDUALLY at output
lines **109 / 714 / 715** — the file-URL fallback notice and the two removed-capability
phase2 tests, the same three this ledger has always carried. Test 8 is not among them.

## FINDING A — DISPOSITIONED. Its key claim is REFUTED by measurement.

`.claude/queue-draft-2026-08-10/probe-finding-a.mjs` → `measurements/probe-finding-a.log`. Each
state read TWICE, immediately and after 400ms (250ms debounce + 150ms margin), and the store
payload PARSED rather than weighed — bytes are a proxy, and a stored entry can carry empty
edit collections, which is exactly what the FINDING B probe measured.

| state | header | draftRows | bytes @0ms | bytes @400ms | entries with real work @400ms |
|---|---|---|---|---|---|
| 1 selected | `null` | 0 | 0 | — | — |
| 2 box-shadow edit | "1 pending" | 1 | **0** | **1645** | 1 (`styleEdits` + selector) |
| 3 instruction typed | "2 pending" | 2 | 1645 | **1694** | 1 (instruction now present) |

**`beginBoxShadowEdit` DOES reach a persist.** FINDING A's escalated half — "state 2's zero is
not explained by the debounce, because that call site reaches no persist at all" — is dead,
and it was already retracted on reading before this run confirmed it. The zero was the
debounce, at both states.

**What survives is much smaller and is REPORTED, not fixed:** the panel's "N pending" label
LEADS durability by up to 250ms. Inside that window no memo exists yet, and `carryDetachedDraft`
requires one — established by test 5, which is the refusal path — so a detach plus a reselect
inside the window drops the draft unrecoverably. Not fixed because the fix would be a
synchronous persist on every commit, which is the thing the debounce exists to avoid; **and the
button IS the escape hatch**, since its persist is synchronous and its refusal is honest. The
pre-existing automatic sweep is what carries the residual, not anything this feature added.

## Sol round 3 launched

`.claude/queue-draft-2026-08-10/SOL-ROUND3-BRIEF.md`, detached to `agent-output/SOL-ROUND3.out`
(gitignored by the `agent-output/` class rule). Scoped to code reading up front because
rounds 2 and several prior rounds came back browser-blocked, and an environment-blocked
adverse output must never be dispositioned as "no findings". It carries both customer lenses
verbatim and explicitly asks for an attack on the COPY and the FEEDBACK, not just the code.

## Sol round 3 — DOES NOT SURVIVE (1 P1 + 1 P2). Both CONFIRMED by reading the code.

655,689 bytes, process exited. **Its browser gate was blocked** (`MachPortRendezvousServer …
Permission denied (1100)`, 8 tests / 0 pass / 0 fail / 8 skipped) and it said so up front, as
the brief demanded, then scoped itself to source reading and explicitly noted it *"did not treat
historical v5 logs as a live baseline"*. That is a legitimately scoped pass, **not** "no findings".

Neither finding was taken on trust. Both were re-derived from the file.

### P1 — cross-page `clientKey` reuse silently discards the NEWER queued grab (refutes claims 3 and 5)

`var styleDraftClientSequence = 0;` (`browser/raven-grab.js:159`) **resets on every page load**, and
it is the whole of a draft's identity: `newStoredStyleDraft` mints `clientKey: "style-draft-" + n`
(~10943), `serializeLivePending` files the entry under `key: "live:" + draft.clientKey` (~11168), and
`readCarriedPending` (11158) restores those keys **verbatim** — it filters for shape and renumbers
nothing.

So: page A banks `style-draft-1` → persisted `live:style-draft-1` → reload → `carriedPending` holds
that exact key → page B's first draft is **also** `style-draft-1` → its memo entry key is **also**
`live:style-draft-1` → the slide advances → `carryDetachedDraft` (4384) computes
`already === true`, declines to push, and returns false → `sweepStaleStyleDrafts` (4402) calls
`dropStyleDraft(draft, true)` **regardless of that return value**. Page B's grab is gone and the
surviving row carries page A's element.

Two corroborating consequences of the same collision: `persistPendingNow` (11197) writes
`carriedPending.concat(serializeLivePending())`, so storage can hold **two entries under one key**;
and `removeChange` (10859) filters by key, so one Remove click deletes both rows.

**The comment at ~11153 claims carried rows have "no live target, no clientKey collision, no batch
interaction" — the middle clause is what fails.** Sol's note that the matrix never starts from a
restored carried entry, so no existing mutant can see this, is accurate.

**Fix chosen: renumber at hydrate**, in `readCarriedPending`, into a namespace no live key can mint
(`stored:N`). This follows the named-style-versions precedent in this repo — *renumber, don't
validate*: a stored id is a within-session identity, and validation cannot survive garbage
(`Number.MAX_SAFE_INTEGER` is a valid safe integer that passes any check and then stops
incrementing). One change kills the collision, the duplicate storage keys and malformed stored ids
at once, and makes the ~11153 comment true. `removeChange`'s `carried:` prefix strip still resolves
(`carried:stored:1` → `stored:1`).

**Explicitly REJECTED: making the sweep's `dropStyleDraft` conditional on the carry's return.** A
legitimate "already carried" (the same draft swept twice) must still drop, so that would leave a
detached draft alive forever — trading a silent loss for a permanent zombie.

### P2 — success is routed AWAY from the pressed control, which simultaneously shows contradictory copy

`setGlobalActionStatus` (12664) resolves its target as `structureActions [data-status-b]` **first**,
i.e. the left/structure panel. The queue button lives in the design/right panel under Instructions.
And `queueActiveDraft` (4131) ends with `renderPanel()`, which runs **before** the click handler
(12905) sets the status — so the note beside the button re-renders from `queueDraftBlocker()` as
*"Change a style or write an instruction first"* while the only confirmation lands on the other
panel, invisible if it is collapsed. This is the mechanism behind the two design observations
already being held for `design-judge`.

**Fix chosen:** a module-scoped `queueNotice`, set after a successful bank, rendered by
`syncQueueButton` (4211) in place of the blocker while live — **one combined string** so it reads as
success and still says what to do next, with the same string on the button's `title` so the
accessible reason survives; self-clearing when `queueDraftBlocker()` returns `""` (real work exists
again) and in `resetSelectionLocalContext` (13776) on a selection change. `syncQueueButton` has
exactly two callers (`syncActiveStyleDraftKey` 4056, `syncSendButtonDisabled`), so that is the whole
of the sync surface.

**Deliberately NOT changing `setGlobalActionStatus`'s panel priority** — it is shared by many
handlers, and re-ordering it would move every other status message in the overlay. One-line report.

### Claims that SURVIVED

Claim 6 (radius honesty) was independently verified against `matrix-v5.log`: *"Q5 2, Q8 5, Q10 2,
Q2 unchanged at 4"*, plus the mirror `cmp` and both `node --check` runs. Claims 1, 2 and 4 went
unchallenged.

## Sol round 3 fixes LANDED (browser/raven-grab.js, mirrored)

**P1** — `readCarriedPending` now RENUMBERS every restored entry to `stored:N` (index-based, so it
is stateless and cannot itself collide) instead of restoring `live:<clientKey>` verbatim. The
falsified "no clientKey collision" clause in the comment at ~11190 is corrected in place and now
states all three consequences of the collision: silent loss via `carryDetachedDraft`'s `entry.key`
de-dupe combined with `sweepStaleStyleDrafts`'s unconditional `dropStyleDraft`; two entries under
one key via `persistPendingNow`'s concat; one Remove click deleting both rows via `removeChange`'s
key filter.

Verified safe rather than assumed: `drainCarriedPending` re-pushes the SAME entry object on a failed
send, so a renumbered key survives the re-carry; `removeChange`'s `carried:` prefix strip still
resolves (`carried:stored:1` -> `stored:1`); `stored:` and `live:` are disjoint namespaces, and no
live key can ever mint a `stored:` one.

Rejected alternative: making the sweep's `dropStyleDraft` conditional on the carry's return value. A
legitimately already-carried draft must still drop, so that trades a silent loss for a permanent
zombie row.

**P2** — five edits: module vars `QUEUE_NEEDS_WORK` / `QUEUE_ADDED_NOTICE` / `queueNotice`;
`queueDraftBlocker` returns the constant; `queueNoteText()` is the SINGLE rule both doors consume
(the `renderPanel` markup path and `syncQueueButton`'s in-place sync); the click handler sets
`queueNotice` then calls `syncQueueButton()` then `setGlobalActionStatus("Added to queue")`;
`resetSelectionLocalContext` clears `queueNotice`; `queueBlockerAtRender` renamed
`queueNoteAtRender` at three sites, because the variable can now hold a success string.

The notice masks `QUEUE_NEEDS_WORK` and nothing else, compared through a shared constant so a
reworded refusal cannot silently become maskable. `setGlobalActionStatus`'s left-panel priority is
deliberately NOT changed — it is shared by many handlers — reported, not fixed.

`node --check` SYNTAX OK; `cp` to `web/public/raven-grab.js`; `cmp -s` IDENTICAL.

## Investigation for T9/T10 (read-only, nothing changed)

- `drainCarriedPending()` has exactly ONE caller: `dispatchPendingBatch()`
  (`browser/raven-grab.js:11553`), i.e. only on Send. A seeded carried entry therefore survives page
  load undrained — T9 is stageable.
- Carried rows render as id `"carried:" + entry.key`, type `"Carried"`, target
  `entry.label || "element"`, status `"Pending"` (10808-10810), so a seeded entry wants a `label`.
- `readCarriedPending`'s filter requires `entry && entry.payload && entry.endpoint` — a seed missing
  `endpoint` is dropped silently.
- `serializeLivePending` entry shape: `{key, pathname, endpoint, label, payload}`.
- `withLocalOverlay(fn)` takes ONE argument and owns browser+page, so T9 needs an options parameter
  (`page.addInitScript` before `goto`) — the page is not reachable before navigation.
- `readState` (line 371) joins EVERY `.raven-grab-status`; its own comment says which node the
  status lands on "is not this suite's business", which is exactly why the existing 8 tests cannot
  see the P2 defect. T10 must read `noteText`/`buttonTitle` beside the button, not `statusText`.

## STALE MEASUREMENTS — do not quote

Matrix v5 (16/16/0) and full suite 1531/1528/0/3 both PREDATE the two fixes. Find-strings that will
abort: `queueDraftBlocker`'s literal refusal string, `syncQueueButton`'s first line, the click
handler's success branch, the render's `queueDraftBlocker()` call.

## Tree state

HEAD f4c4cf6. NOTHING built, committed, or pushed. Push to main and the web apex deploy are
Andrew-gated. Andrew must reload his deck tab.

## T9 and T10 LANDED (test/grab-overlay-queue-draft.test.mjs, 8 tests -> 10)

`node --check` SYNTAX_OK; `grep -c "^test("` -> 10. One test per Sol round-3 finding.

**T9 — the P1, and it closes exactly the gap Sol named** ("the matrix never starts with a
restored carried entry, so none of its mutants detect this"). A `page.addInitScript` seed writes
one entry keyed `live:style-draft-1` into `raven-grab-pending-v1` before navigation, using the
`beforeLoad(page, session)` seam and `http://127.0.0.1:${session.port}/grab` for the endpoint
(`readCarriedPending` drops a seed with no `endpoint`). It never presses Send, because
`drainCarriedPending()` has exactly one caller — `dispatchPendingBatch()` — so a drain would empty
the thing under test.

Three preconditions are asserted rather than assumed, each because without it the test measures
nothing: the seeded row is restored AND renumbered to `stored:1`; this page's own memo really does
mint `live:style-draft-1` (the collision must exist before the carry can be graded); and the two
surviving rows name DIFFERENT elements (`#a` and `#old`), which is what separates "both grabs
queued" from "one row, wrong element".

**T10 — the P2, read BESIDE the button and never from `statusText`.** `readState` joins EVERY
`.raven-grab-status` on purpose — its own comment says which node the status lands on "is not this
suite's business" — which is precisely why none of the eight existing tests could see a success
routed to a collapsible left panel while the pressed control still read
`QUEUE_NEEDS_WORK`. T10 asserts the button is live BEFORE the press (otherwise it measures a
refusal), then reads `noteHidden`, `noteText`, and `buttonTitle`, including a
`doesNotMatch(/write an instruction first/)` so the control cannot contradict itself.

## Harness updated to v6 (.claude/queue-draft-2026-08-10/queue-mutants.mjs)

- `EXPECTED_BASELINE_TESTS` / `EXPECTED_BASELINE_PASS` 8 -> 10; skips stay 0.
- `T9` / `T10` name constants added, verified character-for-character against the test titles.
- **Q14 re-anchored.** Its find-string still named `queueBlockerAtRender`, which the P2 fix renamed
  to `queueNoteAtRender` at three sites — a DEAD anchor that would have aborted the run. Every
  other find-string was audited against the current source: Q1/Q3/Q4/Q5/Q8/Q9/Q10/Q11/Q12/Q13/Q15/
  Q16/C1 all still resolve.
- **Three mutants added.** Q17: hydrate restores the stored key verbatim (the P1 returns) ->
  expectRed T9. Q18: the click handler never sets `queueNotice` -> expectRed T10. Q19:
  `syncQueueButton` reads `queueDraftBlocker()` instead of the shared `queueNoteText()` -> expectRed
  T10.
- **Attribution limit, recorded rather than papered over:** Q18 and Q19 are two mechanisms that
  redden the SAME test at the SAME assertion, so the v5 message check cannot separate them — the
  same standing as Q9/Q11/Q12/Q13. Q15/Q16 remain the pair the message check DOES separate.

**Two mutants were designed and then REJECTED on measurement grounds, rather than added as
survivors.** (a) "the render bypasses `queueNoteText()`" would SURVIVE: `queueActiveDraft()` calls
`renderPanel()` BEFORE the handler sets the notice, and T10 triggers no later render, so the render
door never displays the confirmation — adding it would record a survivor with no test behind it.
(b) "widen the mask" (`if (blocker === QUEUE_NEEDS_WORK)` -> `if (blocker)`) has NO REACHABLE
TRIGGER: emptiness is checked first so an empty draft always yields `QUEUE_NEEDS_WORK`, any new
work spends the notice through the next sync, and `resetSelectionLocalContext()` clears it on
deselection. Both dispositions are written into the harness beside the mutant list, on the
`isIpLiteral` precedent — a clause with no reachable trigger must say so.

## Matrix v6 in flight

Launched detached to `.claude/queue-draft-2026-08-10/measurements/matrix-v6.log` with `EXIT=$?`
appended INSIDE the file. 19 graded mutants + 1 control against a declared 10p/0f/0s baseline. Every
radius must be re-measured and read against the header table, never against memory — three radii
came back different from what was written down in the last comparable round.

## Still stale, still unquotable

Matrix v5 (16/16/0) and full-suite 1531/1528/0/3 both predate the two fixes and the two new tests.
The full suite has not been re-run since either landed.

## T9 was measuring the MECHANISM instead of the HARM — matrix v6 caught it, v7 confirms the fix

Matrix v6 came back `19 mutants, 18 killed, 0 survived, 0 killed the wrong test, **1 hit the wrong
assertion**` / `EXIT=1`. The one wrong-assertion grade was Q17, verbatim from the log:

> `"a carried row restored from a previous page load does not swallow this page grab" is red but not
> on "both grabs are queued: the restored one and this pages"`

**The plan going in was to re-declare Q17's `expectMessage` to whatever T9 was actually aborting
on. Reading the code overrode that: the declaration was right and the TEST was wrong.** T9 opened
with `assert.deepEqual(seeded.rowKeys, ['stored:1'], …)` as a precondition — which pins the
renumbering FORMAT — and `assert` aborts at the first failure, so the mutant that restores the
stored key verbatim died right there, on the mechanism. **Every assertion below it — the harm Andrew
actually reports, two rows naming two different elements with both payloads intact — was
unreachable by any mutant in the matrix.** Unfalsifiable decoration wearing a guard's clothes, in
the test written to close exactly the gap Sol had named.

The general rule, now written into the suite: **assert the HARM before the MECHANISM, or no mutant
ever reaches the harm.** Two edits:

- the precondition asserts only what the harm needs in order to be observable —
  `rowKeys.length === 1` ("the previous page grab is restored") plus
  `rowLabels === ['#old']` ("and it renders as the element it was taken from") — with a comment
  recording that v6 graded the old form WRONG ASSERTION, so a future reader cannot "tighten" it
  back;
- the namespace fact moved to the BOTTOM of T9 as
  `assert.ok(!/^live:/.test(seeded.rowKeys[0]), 'because hydrate renumbered the restored entry out
  of the live key namespace')`, labelled **NOT INDEPENDENTLY FALSIFIABLE** — any hydrate that leaves
  a restored key in the live namespace collapses the two rows above it first, so no mutant can turn
  that line red on its own. It is documentation-in-assert-form and says so, on the same footing as
  fixture (h) in `test/no-private-paths.test.mjs`.

## Matrix v7 — the result of record

`.claude/queue-draft-2026-08-10/measurements/matrix-v7.log`, verbatim tail:

```
baseline: 10 tests / 10 pass / 0 fail / 0 skipped
19 mutants, 19 killed, 0 survived, 0 killed the wrong test, 0 hit the wrong assertion; 1 control, 0 false-failed
EXIT=0
```

Radii: `Q1 1 · Q2 5 · Q3 4 · Q4 3 · Q5 2 · Q6 1 · Q7 1 · Q8 6 · Q9 1 · Q10 2 · Q11 1 · Q12 2 ·
Q13 1 · Q14 1 · Q15 1 · Q16 1 · Q17 1 · Q18 1 · Q19 1 · C1 green`. Re-run WHOLE, never extended.

**The v6 → v7 diff is the fix's signature: the ONLY change is the wrong-assertion line
disappearing.** Every radius and every red list is otherwise identical, which is exactly what a
change to WHICH ASSERTION ABORTS — and not to which tests go red — should look like. Both logs are
kept; v6 is the evidence that the T9 restructure was measurement-driven rather than a preference.

**The v5 → v7 diff is FIVE radii, all attributable and none of them a new guard:** Q2 4→5, Q3 3→4,
Q4 2→3, Q8 5→6, Q12 1→2 — T10 types an instruction, presses the button and reads the title, so it
runs through the instruction-typing sync, the blocker, the box-emptying, the click delegation and
the in-place title. T9 moved nothing: it never presses the button. **That diff was read against
`matrix-v5.log` itself, not against a memory of it** — the v5 entry in this log records getting
exactly that comparison wrong once already (I had Q2 among the moved when it had not moved).

## Suite header rewritten v5 → v7

`test/grab-overlay-queue-draft.test.mjs` — `node --check` SYNTAX_OK, still 10 tests. The header now
carries: the Sol round-3 verdict and both findings stated as defects rather than as changes; the
19-mutant table with Q17/Q18/Q19; the five-moved-radii paragraph with the explicit "read against
THIS TABLE and against matrix-v5.log, never against a memory" line; Q14's dead-anchor repair
(`queueBlockerAtRender` → `queueNoteAtRender`, which would have ABORTED the run rather than
mis-measured — the harness's uniqueness check earning its keep again); and both rejected-mutant
dispositions, on the `isIpLiteral` precedent that a clause with no reachable trigger must say so
rather than have a mutant pretend to kill it.

**The Q17 mis-measurement is recorded in the header as a CORRECTION**, same class as note (c)'s v3
Q12 mis-declaration: a mutant that dies on a precondition is not measuring the harm, and a matrix
that grades it a kill would have been lying in the reassuring direction.

## Sol round-4 brief authored

`.claude/queue-draft-2026-08-10/SOL-ROUND4-BRIEF.md` — report-only, four claims to refute (the P1
hydrate renumber and its key space; the P2 pressed-control confirmation; that T9/T10 measure the
harm and not the mechanism — **including the T9 mis-measurement offered as itself a claim to
attack**; and that harness v7 grades correctly). Opens by stating the sandbox may deny Chromium and
that round 3 was environment-blocked yet returned two real findings, so an environment-blocked run
must never be reported as "no findings". Measurement block now filled with the v7 figures. Carries
the known-and-not-fixed list and the dual target-customer block verbatim.

## Still open before any completion claim

Full suite re-running now (the 1531/1528/0/3 figure predates both fixes and both new tests and
**may not be quoted**). Then: dual target-customer walkthrough, `design-judge` on a FRESH capture
(the `/tmp/queue-capture/*.png` shots predate the confirmation-note copy), Fable 5 once-over, and
the Sol round-4 pass itself. Nothing built, committed or pushed; push to `main` and the `web` apex
deploy are Andrew's alone, and he must reload his deck tab because the overlay in his browser is
still the old one.

## Full suite after both round-3 fixes — 1533 / 1530 / 0 / 3

`scratchpad/full-suite-2026-08-10.log`, verbatim: `ℹ tests 1533 / suites 6 / pass 1530 / fail 0 /
cancelled 0 / skipped 3 / todo 0`, `EXIT=0` (written INSIDE the file, because a pipe eats the exit
code). **The +2 over the ledgered 1531 is exactly T9 and T10** — the two tests the round-3 fixes
brought with them — and all ten queue tests are ✔ at log lines 839–848. **The three skips were read
INDIVIDUALLY at lines 109 / 714 / 715**, not inferred from the total: the file-URL fallback notice
and the two removed-capability phase2 tests, the same three this ledger has always carried. An
unchanged skip total is exactly the shape that would hide a suite silently not running.

The ledger figure in CLAUDE.md still says 1531/1528/0/3 and **must be updated to 1533/1530/0/3**,
stating that the +2 is T9 and T10 and that the skips were read one by one.

## Fresh capture — `/tmp/queue-capture-v2/` (8 PNGs, EXIT=0)

The `/tmp/queue-capture/` shots predate the confirmation-note copy and **may not be used for the
judge pass**. The v2 capture is 2560×1400 (1280×700 @ DPR2) across all four states:

- **STATE 1** (nothing) — label "Add to queue", `aria-disabled "true"`, title and note both
  "Change a style or write an instruction first", opacity .45, 104.4×31.6px, draftRows 0,
  pendingHeaderText null, **storedBytes 0**
- **STATE 2** (one style edit) — `aria-disabled null`, title null, opacity 1, noteHidden true,
  draftRows 1, "1 pending", storedBytes 0
- **STATE 3** (+ instruction) — draftRows 2, "2 pending", storedBytes 0
- **STATE 4** (after the press) — `aria-disabled "true"`, title AND note both "Added to queue —
  change a style or write an instruction to add another", opacity .45, instructionValue "",
  draftRows 2, status "Added to queue", pendingHeaderText "2 pending", **storedBytes 1694**

**The pending count does NOT move across the press — "2 pending" before and "2 pending" after.**
What moves is `sessionStorage`: 0 → 1694 bytes. That is correct by design, because the queue is
DERIVED (`pendingLogicalRows()` → `allStyleDrafts()` → `localStyleDrafts()` → `activeStyleDraft()`)
and a count that moved would be the Q4 double-count defect. But it is exactly the customer-legibility
question the walkthrough has to answer: the only visible evidence the press worked is the note, the
emptied instruction box, and the status line. Durability is invisible.

## design-judge — layer state, measured not assumed

`ls` on the global skill dir found all three files. **No project overlay and no root `DESIGN.md` in
raven-mcp**, so this runs **global-only** — 37 portable rules, no Layer 1. Surface binding
`raven-mcp` = **product-site**, so the monochrome one-warm-orange-accent scope is **INACTIVE** and
the overlay's cyan accent is not itself a finding.

## Sol round 4 launched

`.claude/queue-draft-2026-08-10/SOL-ROUND4-BRIEF.md` → detached to
`.claude/queue-draft-2026-08-10/agent-output/SOL-ROUND4.out`, **pid 50779**, in flight and unread at the
time of writing. Its brief opens by stating the sandbox may deny Chromium and that round 3 was
environment-blocked yet still returned two real findings, so an environment-blocked run must never be
dispositioned as "no findings".

## The glow grep gave a FALSE ALL-CLEAR — read the block, not the line

`grep "raven-grab-send" | grep -iE "shadow|glow"` returned only line 1540 (`:disabled { … box-shadow:
none }`) and an accent-colour grep returned nothing. **That read as "no glow authored" and it was
wrong**: the pattern required the selector and the declaration on the SAME line, and
`.raven-grab-send` is a multi-line block. Reading `browser/raven-grab.js:1486-1495` directly found

```
1491    box-shadow: 0 4px 20px rgba(0, 191, 255, .4);
```

**A grep miss is not evidence of absence.** Same class as this repo's own
"confirming a rule exists means reading the MATCHED LINE, not the matching filename", one direction
over: here the filename matched and the line never did.

## `measure-judge-questions.mjs` — the three visual questions, answered from the ENGINE

`.claude/queue-draft-2026-08-10/measure-judge-questions.mjs` — `node --check` SYNTAX_OK, run `EXIT=0`,
output at `scratchpad/judge-measure.log`. Its header states it is **NOT a test**; the harness
(`shadowEval`, `selectElement`, `editBoxShadow`, the DESIGN.md temp fixture, the two-slide
`FIXTURE_BODY`) is lifted **verbatim** from `capture-queue-button.mjs`, so the surface measured is
the surface photographed is the surface the tests drive.

**Q1 — the glow is REAL, and the state difference is not the glow appearing.**

```
state 1 (nothing pending): disabled true,  opacity "0.5", boxShadow "none"
state 4 (2 pending):       disabled false, opacity "1",   boxShadow "rgba(0, 191, 255, 0.4) 0px 4px 20px 0px"
```

A 20px blur of the button's own fill hue (`rgb(0,191,255)`), zero spread, 4px offset — a glow, not a
shadow. State 1 reads `none` purely because `:disabled` at line 1540 zeroes it. `filter` is `none` in
both, so nothing else is manufacturing it. **Pre-existing CSS, OUTSIDE this change's diff** — a
report line, not a fix, per "edit nothing unrequested"; but the feature is what makes the
enabled-and-glowing state routinely reachable.

**Q2 — INCONCLUSIVE, and the instrument is why.** `overlapsNext` compares a heading's bottom to its
next visible sibling's top, which is meaningless inside a **flex row**: "Instructions" flagged only
because its mic sibling sits higher in the same row (bottom 275.8 > nextTop 256). And "Motion" is not
in the query set at all — it is a `STYLE_CATEGORIES` label (declared line 89, iterated at 124 and
11927), not a `.raven-grab-section-heading`/h2/h3. So the vision pass's "Motion overlap" is
**neither flagged nor cleared**: the instrument answers nothing in either direction. Per the
false-positive gate, silence.

**Q3 — the queue row's real geometry, and it corrects two figures.**

```
button: { w: 104.4, h: 31.6 }
note:   { w: 173.6, h: 46.2, lineHeight: 15.4, lines: 3, chars: 70 }
sendHeight: 44
otherControlHeights: 18px × 8  (the style-value cells)
```

Two corrections to what was written down earlier: the note is **70** chars, not 68; and the queue
button is **NOT** the shortest interactive control in the panel — the style-value cells are **18px**,
well under its 31.6px.

## Tap targets DELEGATED to Raven, not hand-ruled

`SPACING-tap-targets-44px` is `owner: raven`, so the measured hit box went to
`audit_tap_targets` (`minSize: 44`) rather than being judged with a hand-rolled ruler. Raven:
`total 2, passing 1, failing 1` — `.raven-grab-queue-add` `deficit_h 12.4`, fix
`add min-height: 44px (or add padding-top/bottom: 7px)`; the Send CTA passes. **The Send row's width
(274) was INFERRED from `width: 100%` and is not a measurement** — its height 44 and the queue
button's 104.4 × 31.6 are measured, and the finding rests only on the measured pair.

## The duplicate block in this log — PROVEN, not eyeballed, then deleted

Lines 962–1052 were repeated verbatim at 1053–1143. That was first noticed by two identical `##`
headings, which is a **suspicion and not a finding** — so it was measured: `sed -n '962,1052p'` and
`sed -n '1053,1143p'` into two files, 91 lines each, `cmp -s` → identical. Only then deleted
(`sed -i '' '1053,1143d'`), 1258 → 1167 lines, with the seam re-read at 1048–1058 and
`grep -c '^## T9 was measuring the MECHANISM'` back to **1**. A pre-image is at
`/tmp/log-before-dedup.md`. `scratchpad/log-append-4.md` was ALREADY in the file and was not
re-appended — the check that established that is the same one: read the destination before writing
to it.

## The four judge findings, and the one that became a fix

`design-judge` ran global-only (37 portable rules; no project overlay and no root `DESIGN.md` in
this repo), surface binding `raven-mcp` = **product-site**, so the monochrome one-warm-accent scope
is INACTIVE and the overlay's cyan is not itself a finding. `Verdict: BLOCK (2 block findings, 1
warn, 1 nit)`.

The one inside my own diff was the tap target, and it was **delegated, not hand-ruled** —
`SPACING-tap-targets-44px` is `owner: raven`, so the measured hit box went to `audit_tap_targets`
(`minSize: 44`): `total 2, passing 1, failing 1`, `.raven-grab-queue-add` `deficit_h 12.4`, fix
`add min-height: 44px`. Fixed at `browser/raven-grab.js:1066` — `min-height: 44px` on
`.raven-grab-queue-add`, with the comment naming the measured 104.4 × 31.6 and the deficit. Mirrored
(`cp browser/raven-grab.js web/public/raven-grab.js`), `cmp -s` → MIRROR IDENTICAL, `node --check`
SYNTAX_OK. Re-audited through Raven, not by eye: `total 1, passing 1, failing 0`, engine reporting
**104.4 × 44**.

The other three are **pre-existing and outside this diff**, so they are report lines rather than
edits, per "edit nothing unrequested":

- `COLOR-no-gradient-no-glow` — `box-shadow: 0 4px 20px rgba(0, 191, 255, .4)` at line 1491 on
  `.raven-grab-send`. **A grep gave a false all-clear on this first**: the pattern required selector
  and declaration on one line and `.raven-grab-send` is a multi-line block. Found by reading
  1486–1495. A grep miss is not evidence of absence.
- The **18px style-value cells** — eight of them, well under the same 44px clause the queue button
  was just fixed against. Same rule, pre-existing, larger blast radius than this feature.
- `OTHER-no-load-bearing-decoration` (warn) — the duplicate "Added to queue" confirmation, once in
  the note and once through `setGlobalActionStatus` at 12977. **This one IS in my diff** and is
  still undecided: either drop the status call (re-mirror, re-run the suite, re-run the matrix —
  Q18/Q19 guard the note, and Q4/Q8/Q12's red lists include the status assertion) or keep it with a
  written reason.

## Post-fix full suite and matrix v8 — read by PARTS, because the total could not move

Suite: `scratchpad/full-suite-postfix.log`, `ℹ tests 1533 / suites 6 / pass 1530 / fail 0 /
cancelled 0 / skipped 3 / todo 0 / duration_ms 47834.578583`, `EXIT=0`. Three skips read
**individually at lines 109 / 714 / 715**; all ten queue tests ✔ at 839–848.

Matrix **v8**, re-run WHOLE per the standing rule: `baseline: 10 tests / 10 pass / 0 fail / 0
skipped`, then `19 mutants, 19 killed, 0 survived, 0 killed the wrong test, 0 hit the wrong
assertion; 1 control, 0 false-failed`, `EXIT=0`. Radii in printed order (the harness emitted Q14
before Q13 — concurrency, both radius 1):

```
Q1 1 · Q2 5 · Q3 4 · Q4 3 · Q5 2 · Q6 1 · Q7 1 · Q8 6 · Q9 1 · Q10 2 · Q11 1 · Q12 2
Q14 1 · Q13 1 · Q15 1 · Q16 1 · Q17 1 · Q18 1 · Q19 1 · C1 green
```

**Identical to v7 — not one radius moved.** For a CSS-only change that is the correct signature, and
it is only readable as a signature because the baseline line and the individual radii were read
rather than the summary total. An unchanged table is exactly the shape that would hide a suite
silently not running.

## Sol round 4 — environment-blocked and still not empty

`.claude/queue-draft-2026-08-10/agent-output/SOL-ROUND4.out`, 4,586 lines / 347,293 bytes,
`gpt-5.6-sol`, effort medium, 126,392 tokens. Chromium was denied in its sandbox
(`MachPortRendezvousServer … Permission denied (1100)`) and all 10 browser tests skipped — the brief
had declared that gate unavailable up front and scoped the pass to code reading, so the run was
**never dispositioned as "no findings"**. Verdict `DOES NOT SURVIVE`, 1 × P2 + 1 × P3.

**P2 — the success notice outlives the success.** `queueNotice` is set on a bank and cleared only by
new work (`browser/raven-grab.js:4251`) or a selection reset (13867) — never by a removal and never
by a dispatch. So `queueNoteText()`'s second clause hands the old success notice back for exactly the
`QUEUE_NEEDS_WORK` blocker:

```js
function queueNoteText() {
  var blocker = queueDraftBlocker();
  if (!queueNotice) return blocker;
  if (blocker === QUEUE_NEEDS_WORK) return queueNotice;
  queueNotice = "";
  return blocker;
}
```

I did not take that at face value — it was checked against all five `queueNotice` sites (4171, 4177,
4249/4250/4251, 12980, 13867), `syncQueueButton()`, `pruneEmptyStyleDraft()` and the whole of
`removeChange()`, and then **reproduced live**.

**P3 — T9's closing namespace assertion is mislabelled.** T9 asserts the harm before the mechanism
(correct, because `assert` aborts at the first failure), but that ordering does not cover the whole
key-space claim: a faulty hydrate mapping the seed to `live:style-draft-2` leaves every harm
assertion green and fails only the closing
`assert.ok(!/^live:/.test(seeded.rowKeys[0]), …)`, and Q17 mutates only verbatim restoration. So the
**"NOT INDEPENDENTLY FALSIFIABLE" label on that assertion is FALSE as written**. Unfixed.

## P2 reproduced — and the reproduction had to be re-run past the debounce

`.claude/queue-draft-2026-08-10/probe-stale-notice.mjs` (header states it is NOT a test; harness lifted
verbatim from `measure-judge-questions.mjs`). Bank an **instruction-only** draft — deliberately, so
removing its sole row empties the queue completely; a style edit would leave a second row — then
remove that row through the same control a user presses.

`scratchpad/probe-stale-notice-v2.log`, `EXIT=0`: at `draftRows 0` / `removeIds []`, **both** the
note and the button title still read *"Added to queue — change a style or write an instruction to add
another"*. `DEFECT REPRODUCED: YES`.

The v1 run waited **160ms** after the removal, which is **under the 250ms persist debounce**
(`schedulePersistPending()`, 11279) — that reading could not tell "the removal was never persisted"
from "the debounce had not fired yet". Raised to 600ms; the verdict is unchanged past it, so P2 is
not a timing artifact.

## The P2 fix's one door is cleared for recursion, and the predicate is still undecided

The fix belongs in `queueNoteText()` **only** — one rule, one door, which is what
`queueNoteAtRender` and `syncQueueButton()` already share. That requires calling
`pendingLogicalRows()` from inside it, so the recursion risk was cleared by reading, not assumed:
`pendingLogicalRows()` → `allStyleDrafts()` → `sweepStaleStyleDrafts()` (4447–4455), which calls only
`carryDetachedDraft()` (guarded debounced persist) and `dropStyleDraft()` — **no `renderPanel()`, no
`syncQueueButton()`**. `syncQueueButton()` has exactly four call sites — 4061, 12255, 12981, 12992 —
and none is reachable from the sweep.

Accepted cost, stated rather than hidden: `syncQueueButton()` runs on every instruction keystroke, so
this adds one `allStyleDrafts()` + `localLayerDrafts()` walk per keystroke — the same work
`pendingLogicalCount()` already does per render.

**Still undecided, and it must be decided before the edit:** `pendingLogicalCount() > 0` (which adds
`carriedPending`) versus `pendingLogicalRows().length > 0` (which does not). A carried row IS in the
queue, so the rows-only form would keep the notice suppressed in a state where the queue is genuinely
non-empty. `pendingLogicalCount() > 0` is the probable answer.

## I published a refutation from an uncontrolled single arm, and my own control caught it

The probe's second question was the one Sol did not name: `removeChange()`'s stored-draft branches
(`draft-stroke:`, `draft-style:`, `draft-text:`, `draft-token:`, `draft-instruction:`) all end at
`pruneEmptyStyleDraft(...)` and fall through to a bare `renderPanel()` at ~10983 with **no persist** —
only the `carried:` branch calls `persistPendingNow()`. So a reload should resurrect the row the user
just deleted.

The removal arm said otherwise: `storedBytes 0`, `storedShape null`, `removeIds []`, note *"Select an
element first"* → `REMOVAL SURVIVES A RELOAD: YES (nothing came back)`. **I wrote that up as a
refutation, and it was not evidence** — the panel was showing nothing selected and no pending list,
so an empty `removeIds` is exactly what a *blind* instrument returns. A check whose failure mode is
indistinguishable from its success mode is not a check.

So I added a **`SKIP_REMOVAL=1` control arm** — everything identical, the row simply left in place —
and it **inverted the reading**: `scratchpad/probe-stale-notice-control.log`, `EXIT=0`, after the same
reload `removeIds ["carried:stored:1"]` with `storedBytes 1491` retained. The instrument IS sighted
with nothing selected. That both rescues the removal arm's result and convicts the way I had reported
it.

Second-order: `carried:stored:1` is live confirmation that hydrate really does renumber
`live:style-draft-1` out of the `live:` namespace — the exact property T9's closing assertion claims
and that Sol's P3 says is mislabelled as unfalsifiable.

## "A length is not content" — and then the contradiction resolved somewhere else entirely

The two arms now disagreed while both reading **1491 bytes** at reload time, which is impossible on
identical input. The flaw was in the instrument: `storedBytes` is a LENGTH, and two payloads of equal
length are not thereby the same payload. Added a `storedShape` field that parses the payload and
prints entry count, keys and instructions, then ran **both** arms again
(`scratchpad/probe-shape-removal.log`, `scratchpad/probe-shape-control.log`, both `EXIT=0`).

Both arms, at bank AND after the removal step:

```
storedBytes: 1491
storedShape: { topLevelKeys "(array)", entryCount 1,
               entryKeys ["live:style-draft-1"],
               entryInstructions ["Tighten this headline"] }
```

Indistinguishable in every field printed — and then divergent across the reload (removal arm 0 bytes
/ `storedShape null` / `removeIds []`; control arm 1491 bytes / same shape / `carried:stored:1`).

**The resolution was not in the payload at all.** `browser/raven-grab.js:14673` registers
`window.addEventListener("pagehide", persistPendingNow)`, and `pagehide` fires on a **reload** — so
the payload hydrate reads is not the payload I measured; it is rewritten during the teardown.
`persistPendingNow()` (11267) writes `carriedPending.concat(serializeLivePending())` and, at
11275, **`removeItem` when that set is empty**:

```js
var all = carriedPending.concat(serializeLivePending());
if (all.length) window.sessionStorage.setItem(PENDING_STORE_KEY, JSON.stringify(all.slice(-100)));
else window.sessionStorage.removeItem(PENDING_STORE_KEY);
```

Removal arm: live pending is empty at teardown → `removeItem` → 0 bytes → nothing hydrates. Control
arm: the draft is still live → re-serialized → 1491 bytes → hydrates as `carried:stored:1`. Both
readings follow, and the code's own comment at 11270–11272 states this as the design — "a
freeze/delete that drops a live draft naturally drops it from storage on the next persist, so
already-sent work never resurrects as a zombie."

**Disposition, one report line, no fix:** the stale-at-rest `sessionStorage` after a removal is real
and confirmed in the code, but the named harm — a removed row resurrecting on the next load — does
not occur on any teardown that fires `pagehide`, which is every navigation, reload and tab close.
The residual is a teardown where `pagehide` never fires (browser crash, tab discard, OS kill): the
stale payload survives and the removed row comes back. Narrow, low harm, and in pre-existing code
outside this diff. **The other residual is the sequence itself** — only one was measured
(instruction-only draft, sole row removed, same-tab reload); removing one of two rows, and an in-page
slide advance with no reload followed by a later persist, are untested.

Two instrument lessons out of this, both recorded because both were mine: a single-arm measurement is
not a measurement, and a length standing in for content will produce an impossible result that looks
like a mystery in the product.

## Sol round-4 P2, fixed — and the predicate was the whole decision

The defect: `queueNoteText()` handed the SUCCESS notice back for `QUEUE_NEEDS_WORK`, which is the
normal state right after a bank (the draft moved into pending, so nothing live is left to bank). But
a removal drains pending without ever touching `queueNotice` — remove the sole banked row and the
panel claimed "Added to queue" over an empty queue, in the note AND in the button's accessible
reason. A control that contradicts the list beside it is worse than one that says nothing.

The fix is four lines inside `queueNoteText()` (`browser/raven-grab.js:4247`), which is the ONE
function both doors pass through — the render path via `queueNoteAtRender` and the in-place path via
`syncQueueButton()`. An earlier attempt at this masked the notice inside `syncQueueButton()` alone,
i.e. a second door with a different rule, which is the drift `queueNoteText()` exists to make
impossible; that attempt was thrown away rather than kept.

**The predicate was the decision, and I picked `pendingLogicalCount() > 0` over
`pendingLogicalRows().length > 0`.** The rows-only form counts THIS page's drafts and ignores
`carriedPending`, so it would expire the notice in a state where the claim is still TRUE — a row
hydrated from a previous page load is genuinely in the queue. Accepted cost, written into the comment
rather than left to be discovered: `syncQueueButton()` runs on every instruction keystroke, so this
adds one `allStyleDrafts()` + `localLayerDrafts()` walk per keystroke, the same work
`pendingLogicalCount()` already does per render.

**Re-entrancy was cleared by reading, not assumed:** `pendingLogicalRows()` reaches
`sweepStaleStyleDrafts()`, which calls only `carryDetachedDraft()` (a guarded debounced persist) and
`dropStyleDraft()` — no `renderPanel()`, no `syncQueueButton()`. The four `syncQueueButton()` call
sites are 4061, 12255, 12981, 12992 and none is reachable from the sweep, so neither door can
re-enter the function through the predicate.

**Scope limit, stated rather than left to read as complete coverage:** the notice expires when the
queue is EMPTY. Bank a row, remove it while OTHER rows remain, and the notice still rides — arguably
still misleading, but tracking row identity is a heavier mechanism than the reproduced defect
warrants.

### Verified in BOTH arms, because one arm cannot tell a fix from a blanket blanking

`probe-stale-notice.mjs` re-run post-fix:

- **Removal arm** — `DEFECT REPRODUCED: NO`. `draftRows 0`, and both `noteText` and `buttonTitle`
  now read `"Change a style or write an instruction first"`: the live blocker, not silence. `EXIT=0`.
- **Control arm** (`SKIP_REMOVAL=1`) — byte-for-byte unchanged from its pre-fix reading.
  `draftRows 1`, note and title still `"Added to queue — …"`. `EXIT=0`.

That second arm is the whole point. Without it, "the notice expires when the queue empties" and "the
notice was blanked everywhere" produce the same removal-arm log. This is the same instrument lesson
the previous section records, applied before publishing rather than after being caught by it.

## T11 and T12 — and T12 is the one that measures the narrowness

Two tests, not one. **T11** banks an instruction-only draft (load-bearing: it produces exactly one
row, so removing it empties the queue completely — add a style edit and a second row survives),
removes the sole row, and asserts the note and the title BOTH stop claiming "Added to queue", then
that the note falls back to the blocker's own reason. Harm assertions first: `assert` aborts at the
first failure, so a mutant has to reach the user-visible claim before it reaches any mechanism.

**T12** is the red-on-correct-code direction, on the Q10 precedent. A fix that simply stopped writing
the notice, or expired it unconditionally, passes T11 — so T12 banks TWO rows, removes one, and
asserts the confirmation is still standing beside the row that is still queued. The narrowness of the
predicate is measured by that test rather than asserted in a comment.

Suite: 12 tests, 12 pass, `EXIT=0`. Both new tests passed on their FIRST run, which is worth nothing
until the matrix proves them red — this file has recorded a test found detecting rather than encoding
enough times now that a first-run pass is treated as unmeasured by default.

## Sol round-4 P3 answered by measurement, not by argument

Sol claimed T9's closing assertion — the one labelled NOT INDEPENDENTLY FALSIFIABLE — is in fact
independently killable: a hydrate that renumbers into the LIVE namespace under a number this page's
counter never reaches collides with nothing, so all three harm assertions above it stay green (two
rows, both labels, both instructions) and only the namespace line goes red.

Rather than reason about the id counter, the claim goes to the harness. This repo's own round-7
precedent is the rule: **a claim that something cannot be tested is itself a claim, and it is
falsifiable by writing the test.** Q22 mutates `readCarriedPending()`'s renumber from
`"stored:" + (index + 1)` to `"live:style-draft-" + (index + 900)`; the harness grades whether it
reddens T9 on the DECLARED closing-assertion message. Either outcome is a result — a kill means the
label is false and must be corrected with Q22 as its guard; a WRONG ASSERTION or an earlier red means
the label is defensible and Sol's P3 is refuted by measurement.

Q20 and Q21 are the two ends of the P2 fix, and unlike Q18/Q19 they ARE separable, because a
predicate has two wrong answers: Q20 never expires the notice (the shipped defect), Q21 expires it
unconditionally. Q21's radius is expected to be wide and that is one mechanism rather than several
guards — right after a successful bank the blocker IS `QUEUE_NEEDS_WORK`, so the notice's whole
existence depends on surviving exactly that state, and every test that reads the confirmation runs
through it.

## Matrix v9: the P3 confirmed, and a coverage hole nobody had named

`.claude/queue-draft-2026-08-10/measurements/matrix-v9.log`, read by parts rather than by its total:

```
baseline: 12 tests / 12 pass / 0 fail / 0 skipped        (matches the declared baseline)
22 mutants, 21 killed, 0 survived, 0 killed the wrong test, 1 hit the wrong assertion;
1 control, 0 false-failed
FAIL: 0 survivor(s), 0 wrong-test kill(s), 1 wrong-assertion kill(s), 0 false fail(s)
EXIT=1
```

**The background task-notification for that run said "exit code 0" and the log said `EXIT=1`.** The
notification describes the wrapper, not the harness verdict. Reading the file is the only reason the
wrong-assertion kill was seen at all.

Radii, in the log's own printed order (Q14 prints before Q13):

`Q1 1 · Q2 6 · Q3 6 · Q4 5 · Q5 2 · Q6 1 · Q7 1 · Q8 8 · Q9 1 · Q10 2 · Q11 1 · Q12 2 · Q14 3 ·
Q13 1 · Q15 1 · Q16 1 · Q17 1 · Q18 3 · Q19 3 · Q20 1 · Q21 WRONG ASSERTION (radius 3) · Q22 1 ·
C1 green`

Diffed against the v8 table (`Q1 1 · Q2 5 · Q3 4 · Q4 3 · Q5 2 · Q6 1 · Q7 1 · Q8 6 · Q9 1 · Q10 2 ·
Q11 1 · Q12 2 · Q14 1 · Q13 1 · Q15 1 · Q16 1 · Q17 1 · Q18 1 · Q19 1`), seven moved: **Q2 +1,
Q3 +2, Q4 +2, Q8 +2, Q14 +2, Q18 +2, Q19 +2.** Six of the seven picked up BOTH new tests and Q2
picked up T11 only. Nothing shrank, and no move needs an explanation beyond the two tests sharing
those mechanisms — a radius is a fact about a mechanism, never evidence of an added guard. The diff
is taken against the header table, not against a memory of the previous run.

### Q20 and Q22

**Q20 killed T11 at radius 1 on its declared message** — the P2 fix's shipped-defect end.

**Q22 killed T9 at radius 1 on its declared message.** So **Sol's round-4 P3 is CONFIRMED, by
measurement**: a hydrate renumbering into the live namespace under a number this page's counter never
mints collides with nothing, leaves all three harm assertions green, and reddens exactly the
namespace line. The `NOT INDEPENDENTLY FALSIFIABLE` label on that assertion was FALSE, and the label
is gone — replaced by a comment that records the measurement and cites Q22 as its guard. This is the
round-7 precedent run in reverse: **a claim that something cannot be tested is itself a claim, and it
was refuted by writing the test rather than argued about.** Cost: one mutant.

### Q21 came back WRONG ASSERTION — and that is the harness earning its keep

Q21 was declared against T12's post-removal message and reddened T12's **precondition** instead. The
cause was read out of the code, not re-measured: under an always-false predicate the notice is blanked
in the post-bank `QUEUE_NEEDS_WORK` state, so the confirmation never survives long enough to be lost,
and `and the confirmation is there to be lost` aborts before `removeFirstDraftRow` is ever called.
`assert` aborts at the first failure.

Two consequences, both acted on.

1. **Q21 is re-declared against T10** and its description rewritten to what it actually is: the
   never-appears end of the predicate. Its red set (T10 | T11 | T12) is identical to Q18/Q19's, which
   is ONE mechanism and not three guards — every test that reads the confirmation runs through that
   state. It is graded on T10's own harm assertion, `and it says the bank happened`, where the harm
   actually lands.

2. **The sharper finding: until Q23 existed, T12's closing assertions were guarded by nothing.** T12
   was written to make the predicate's narrowness measured, and the only mutant pointed at it aborted
   on its precondition. **A test whose own assertion no mutant reaches is a comment.**

**Q23** closes it — `queueNotice = "";` injected at the top of `removeChange(id)` (anchor verified
unique). That is the plausible WRONG FIX, and it is the wrong SHAPE rather than the wrong predicate:
the right rule in the wrong place. This repo's one-rule-two-doors drift class in a third form, after
preview-vs-action and listing-vs-lookup. Expected: T10 green (no removal happens), T11 green (it
WANTS the notice gone), T12 red at radius 1 on its own post-removal message. If T10 or T11 go red,
Q23 is not isolating what it claims.

A general entry from this round, worth carrying: **a mutant declared against a test can be graded by
a DIFFERENT assertion inside that same test**, and only the declared-message check makes that
visible. A kill is not enough.

## Matrix v10 — both predictions held, and the "one mechanism" claim is now measured

`.claude/queue-draft-2026-08-10/measurements/matrix-v10.log`, re-run WHOLE rather than extended (Q21 was
re-declared and Q23 is new, so nothing was carried forward):

```
baseline: 12 tests / 12 pass / 0 fail / 0 skipped
23 mutants, 23 killed, 0 survived, 0 killed the wrong test, 0 hit the wrong assertion;
1 control, 0 false-failed
EXIT=0
```

Radii diffed line-for-line against the v9 table: **every one identical**, with exactly the two changes
the round was for.

- **Q21 killed at radius 3** on T10's `and it says the bank happened`. Its red set is
  `a successful bank confirms itself at the button | removing the last banked row stops the panel
  claiming it is in the queue | removing one of two banked rows leaves the queue confirmation
  standing` — **byte-identical to Q18's and Q19's.** That identity is what turns "one mechanism, not
  three guards" from a reading of the code into a measurement: every test that reads the confirmation
  runs through the post-bank `QUEUE_NEEDS_WORK` state, so a predicate that never admits the notice
  reddens all three for one reason.
- **Q23 killed at radius 1** on T12's `because the claim is still TRUE beside a row that is still
  queued`, with **T10 and T11 green.** T11 staying green is the load-bearing half — it is the test
  that WANTS the notice gone, so a mutant that reddened both would not be isolating the wrong-place
  fix from the wrong-predicate one. T12's closing assertions now have a guard.
- Q20 stays radius 1 (T11 alone) and Q22 stays radius 1 (T9 alone), so the two ends of the predicate
  and the P3 answer are each still separated from everything else.

`C1` green, as expected — a red-only matrix is structurally blind to a false fail.

The harness comment now records both as MEASURED rather than as predictions, and Q22's records that
it killed on the declared assertion in v9 and again in v10.

## Full suite after the P2 fix — 1535/1532/0/3, and the +2 is exactly T11 and T12

```
ℹ tests 1535
ℹ pass 1532
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
EXIT=0
```

Exactly the predicted 1535. The **+2** over the prior ledgered 1533 is exactly the two browser tests
this round added to `test/grab-overlay-queue-draft.test.mjs` (12 now) — T11 (`removing the last banked
row stops the panel claiming it is in the queue`) and T12 (`removing one of two banked rows leaves the
queue confirmation standing`). The `queueNoteText()` P2 fix in `browser/raven-grab.js`, its mirror, the
Q21 re-declaration, the new Q23 mutant and every harness comment edit all move the count by **zero**.

**The 3 skips are the same three, read INDIVIDUALLY at their own line numbers rather than inferred from
the total** — and their line numbers did not even shift:

- `109` — file URL fallback marks reveal and settle checks as unavailable *(browser available — fallback
  path not used)*
- `714` — `[phase2D fix B]` a later committed batch applies on the first poll while the head is pending
  *(removed capability)*
- `715` — `[phase2C tray]` overlapping committed batches both finish and Apply counts only batch B
  *(removed capability)*

Neither new test is among them.

**The queue suite was confirmed to have RUN inside the full pass**, by grepping its own twelve test
names out of the full-run log rather than by trusting the total — T11 at line 849 and T12 at line 850,
both `✔`. An unchanged-looking total is exactly the shape that would hide a suite silently not running,
which is why the check is by name and not by arithmetic.

A note on the grep that got there: `^# (tests|pass|…)` returned **nothing** on this log, because
`node --test`'s totals are prefixed `ℹ `, not `# `. A wrong pattern returning nothing is
indistinguishable from a suite that printed no summary at all — so the silence was re-grepped rather
than accepted, which is the only reason the real figures were read.

Both background task-notifications this segment said "exit code 0", and both were disregarded in favour
of reading the log file. That discipline was earned one round earlier: v9's notification said exit 0
while its log said `EXIT=1` with a wrong-assertion kill. This time the files genuinely say `EXIT=0`.

---

## The design-judge pass, and the finding that no existing assertion could see

The `design-judge` gate was run on the shipped queue confirmation surface **before** any completion
claim was drafted — which is the whole point of the rule, since a judge pass fired after the claim
exists can only confirm it.

Its live finding: the successful bank painted **"Added to queue" twice**. Once as the note beside the
button (the visual confirmation, and — through the button's `title` — the accessible NAME read when the
button is visited), and once as a visible line in `[data-status-b]`, which is a shared status channel
living in a *different* panel the user may have collapsed.

**That finding was nearly dispositioned on taste rather than on measurement, and was not.** "Two
confirmations reads as noise" is an opinion; what makes it a defect is a number. The duplicate was
measured with `getBoundingClientRect()` on the live surface:

```
{"kind":null,"live":"polite","text":"Added to queue","w":282,"h":18,"visible":true}
```

**282 × 18px of duplicate visible text, on an `aria-live="polite"` region.** That is the finding.

### The fix is one argument, and the decision is which of two obvious fixes

Two candidate fixes, and only one is right:

- **Delete the `setGlobalActionStatus` call.** Wrong. `[data-status-b]` carries `aria-live="polite"`
  and is the ONLY thing that *announces* the bank at the moment it happens. The note is read when the
  button is visited, which is a different moment and a different modality. Deleting the call silently
  drops screen-reader users from "told" to "can find out".
- **Render it `sr-only`.** Right, and it is the **house pattern**. Four sibling success calls already do
  exactly this, each because their visible confirmation lives elsewhere: `"Saved " + payload.selector`
  (12719), the send label (12725), `"Sent to agent"` (12862), `"Email sent"` (12881).

So the shipped change is one argument:

```js
queueNotice = QUEUE_ADDED_NOTICE;
syncQueueButton();
setGlobalActionStatus("Added to queue", "sr-only");
return;
```

behind a ~20-line comment recording the two-modalities decision, naming all four precedents, stating
**"Do NOT simplify by deleting the call instead"**, and citing the mutant that holds it.

**The note and the status are two MODALITIES, not two copies.** That sentence is the reason a
"simplification" of either one is a regression, and it is written at the call site rather than only
here.

### Why nothing in the repo could see this change, in either direction

`sr-only` is a CSS clip — `position:absolute; width:1px; height:1px; clip-path: inset(50%)`
(`browser/raven-grab.js:1551`). **A CSS clip does not change `textContent`.**

That cuts two ways, and both matter:

- It is what makes the change **test-safe**: the five pre-existing status assertions (697/698/821/822/926)
  read the same string before and after, and stayed green with no edit.
- It is what makes the change **invisible to the entire matrix**: every mutant up to v10 grades text.
  **Nothing in this repo could detect this fix, or its removal, in either direction.**

So T13 measures **geometry**, and Q24 is the only mutant in the matrix whose observable is geometry.
`visible` tests `r.width > 1 && r.height > 1` rather than `> 0`, because an `sr-only` node still has a
1px box — `> 0` would call the fixed state visible and the guard would measure nothing.

### T13 — the harm is asserted BEFORE the mechanism

`test('a successful bank announces itself once and renders itself once', …)`, via a
`readConfirmationSurfaces` helper.

Two assertions, in this order, and the order is the v9 Q21 lesson applied at authoring time — `assert`
aborts at the first failure, so whichever assertion runs first is the one a kill reports:

1. **the harm** — the confirmation is not ALSO rendered visibly in a status line
2. **the mechanism** — the announcement still exists, on a live region

**Both halves are asserted because a mutant's DIRECTION matters, not only its kill.** The plausible
*wrong* fix — deleting the call — would satisfy assertion 1 perfectly. Only assertion 2 separates
"stopped duplicating" from "stopped announcing", which is exactly the fix the comment forbids.

### Q24, measured in two arms rather than declared

```js
['Q24', 'the confirmation is ALSO rendered visibly in the other panel — the kind is dropped, so the bank paints "Added to queue" twice and the duplicate lands on a panel the user may have collapsed',
  '        setGlobalActionStatus("Added to queue", "sr-only");',
  '        setGlobalActionStatus("Added to queue");', 'red', T13,
  'the confirmation is not ALSO rendered visibly in a status line'],
```

Measured, not asserted:

```
=== ARM A (pristine) ===   13 tests / 13 pass / 0 fail / 0 skipped   EXIT=0
=== ARM B (Q24 mutant) === 13 tests / 12 pass / 1 fail / 0 skipped   EXIT=1
✖ a successful bank announces itself once and renders itself once (240.814083ms)
```

Radius 1, on the DECLARED assertion. **ARM A is the load-bearing half**: without it, a fixture that
renders the status node hidden for some unrelated reason would let Q24 survive, and the guard would be
decorative. The baseline was bumped 12 → 13 in the harness (`EXPECTED_BASELINE_TESTS` and
`EXPECTED_BASELINE_PASS`).

**A correction recorded rather than quietly dropped:** the ~20-line comment was written claiming
"Guarded by mutant Q24" *before* Q24 existed. The sentence was made TRUE by writing the mutant, not
softened by editing the claim.

---

## Header v11, and a radius diff that was refused as arithmetic

Full suite, read from the log rather than from the notification:

```
ℹ tests 1536 / suites 6 / pass 1533 / fail 0 / cancelled 0 / skipped 3 / todo 0
duration_ms 44483.587375
EXIT=0
```

The **+1** over the prior ledgered 1535 is exactly T13 — read by NAME at log line **851** `✔`, not
inferred from the total. The 3 skips were read **individually** at 109 / 714 / 715; their line numbers
did not shift, and T13 is not among them.

Matrix v11, re-run **WHOLE** rather than extended (mandatory — the overlay changed):

```
baseline: 13 tests / 13 pass / 0 fail / 0 skipped
24 mutants, 24 killed, 0 survived, 0 killed the wrong test, 0 hit the wrong assertion;
1 control, 0 false-failed
C1 OK (green, as expected)
EXIT=0
```

**Seven radii moved and every one moved by exactly +1** — Q2 6→7, Q3 6→7, Q4 5→6, Q8 8→9, Q18 3→4,
Q19 3→4, Q21 3→4.

**A uniform +1 on seven lines is exactly the shape that would hide one mechanism shrinking while
another grew, so it was NOT accepted as arithmetic.** It was checked by SET, in both directions:

- T13 appears in the printed red set of **all seven** that moved.
- T13 is absent from the red set of **all sixteen** whose radius held.

So the diff is exactly "one new test joined seven existing mechanisms, plus its own mutant" — nothing
compensating, nothing hidden. **A radius diff is a diff of SETS, not of counts.**

The header was then rewritten to v11: the Q24 row, the seven-radii-moved paragraph with the
both-directions statement, and three new lettered sections — **(j)** Q24 is the only geometry mutant
and why that is forced, carrying the measured 282×18 line and the ARM-A note; **(k)** direction matters,
so T13 asserts both halves harm-first; **(l)** two modalities not two copies, the four `sr-only`
precedents, and the KNOWN residual below.

### The checker, re-falsified rather than re-trusted

`check-header-table.mjs` derives Tn from the suite's own `test()` source order and asserts **radius AND
red set** per mutant against the log. Repointed at `matrix-v11.log`, count assertion raised to 13:

```
OK — 24 mutants: radius AND red set match the log for every one.
CHECKER_EXIT=0
```

**A checker that only ever prints OK is not a check**, so it was falsified again in two arms, in an
isolated copy tree:

- **ARM A** — Q24 radius 1 → 2 in the header: `Q24: header radius 2 != log radius 1`
- **ARM B** — Q18's set T13 → T9, **radius left at 4**:
  `Q18: header set T9 T10 T11 T12 != log set T10 T11 T12 T13`

**ARM B is the load-bearing arm**: same radius, wrong set, caught. A count-only checker passes it.

`CLAUDE.md`'s ledger then went 1535/1532/0/3 → **1536/1533/0/3**, with the 1535 entry demoted rather
than overwritten.

### Residual — reported, not fixed

**`aria-live` in a hidden subtree does not announce.** With the structure panel collapsed, the
announcement is lost — and that is true of **all fourteen** literal status call sites, not just this
one. Pre-existing shared-channel behaviour, outside this diff, and now written down instead of
implied.

### A note on the instrument, twice

Two background task-notifications this segment reported "exit code 0"; both were disregarded in favour
of reading the log. **A notification describes the WRAPPER, not the harness verdict** — v9's said exit 0
while its log said `EXIT=1`.

And `grep -no` on `CLAUDE.md` returned 82.8KB and had to be persisted rather than read: the ledger
paragraph is now too large for exploratory grep, so the edit was made as a targeted exact-string
replace on a known substring instead.

---

## The walkthrough, as the bound customer — and the finding the pixels produced

Eight PNGs at `deviceScaleFactor: 2`, from `.claude/queue-draft-2026-08-10/capture-queue-button.mjs`
(harness lifted VERBATIM from the suite, so the surface photographed is the surface the tests drive).
Three read at full resolution this segment; `4-after-bank` was read in the prior one.

**A clipped screenshot cannot answer a layout question.** `1-selected-no-draft.png` cut the two-line
note mid-sentence, which made it unjudgeable — the truncation was the CLIP, not the UI, and reading
the `-full` variant is what established that. Both variants are written on every shot for exactly
this reason.

What the four states measure:

| | label state | note | instruction | draftRows | pending header | storedBytes |
|---|---|---|---|---|---|---|
| 1 selected, nothing to bank | `aria-disabled=true`, opacity .45 | "Change a style or write an instruction first" | `""` | 0 | *(no section)* | **0** |
| 2 style edit live | enabled, opacity 1 | hidden | `""` | 1 | **1 pending** | **0** |
| 3 instruction typed | enabled | hidden | the sentence | 2 | **2 pending** | **0** |
| 4 after the click | `aria-disabled=true`, opacity .45 | "Added to queue — change a style or write an instruction to add another" | `""` | 2 | **2 pending** | **1694** |

### The sharpest thing the capture found, and it is a READING problem not a code defect

In STATE 2 the **enabled** "Add to queue" button sits directly ABOVE a **"Pending changes / 1 pending"**
block whose single `Style` row (`#a · box-shadow · rgba(0, 0, 0, …`) is **already labelled "Pending"**,
with "Send 1 change" below it. So the affordance is offered for an item the panel already calls
queued.

**That is exactly the mental model that produces Andrew's report.** It is honest by construction — the
live draft IS in the send set, and a count that MOVED on the bank would be the Q4 double-count defect —
but the difference the button actually makes is **durability only**: `2 pending` is byte-identical in
STATE 3 (`storedBytes 0`) and STATE 4 (`storedBytes 1694`). The only signals carrying the bank are the
emptied instruction box and the note.

Concrete remedy, and it is **his call not mine**: differentiate the live row (e.g. label it `Editing`
until banked). That is shared pending-list rendering, outside "a button under Instructions", so it is
ONE report line. Not a Path C wall — the literal ask is met, and the loss he reported is fixed by the
P1 detached-draft carry, which is a different mechanism entirely.

Two smaller reads from the same shots, reported not fixed: the note slot does **double duty**
(blocked-reason AND success-confirmation), so the success message is transient and no persistent panel
trace says the last bank succeeded; and the pending row truncates as `rgba(0, 0, 0, …` (pre-existing
rendering, not this diff).

---

## Sol round 5 — `DOES NOT SURVIVE`, and only one of the five claims it attacked survived

`.claude/queue-draft-2026-08-10/agent-output/sol-round5.log`, 583,564 bytes, complete, EXITED (confirmed
with `pgrep`, because the launch **task-notification said "completed (exit code 0)" while pid 11693 was
still running** — a notification describes the WRAPPER, not the verdict, hit again).

**An instrument lesson on the way in:** `grep` over a 583KB agent log returned 287.7KB and was
PERSISTED rather than displayed, so it produced no information at all. A python slice of the tail
(`s[-16000:]`) is the read that works. Same class as the `grep -no` on `CLAUDE.md` at 82.8KB.

Five findings, verbatim by file:line:

- **P2 — T13 equates live-region markup with an actual announcement.**
  `test/grab-overlay-queue-draft.test.mjs:1384`, `browser/raven-grab.js:12750`. Steps: open Assets,
  collapse the left panel, bank from the right panel. `setGlobalActionStatus` prioritizes
  `structureActions`, whose status is now inside an `aria-hidden`/`inert` panel
  (`browser/raven-grab.js:2730`). T13 still sees one `sr-only` node with `aria-live="polite"` and
  PASSES although the subtree is excluded from AT. No VoiceOver/NVDA transcript captured, so audibility
  is unverified. Correct version: cover both routing states and assert the selected live region has no
  hidden/inert ancestor.
- **P2 — `width > 1 && height > 1` is wrong in BOTH directions, leaving a matrix survivor.**
  `test/grab-overlay-queue-draft.test.mjs:1325`, `browser/raven-grab.js:1551`. False negative: remove
  only `overflow:hidden; clip-path:inset(50%)` and keep the 1px box — glyphs paint outside it, T13
  reports `visible:false`, everything passes. False positive: an ordinary status in a collapsed,
  translated-offscreen panel keeps a large rect and reads visible while painting nothing.
  **That CSS mutation is ABSENT from the 24-mutant matrix.** Correct version: assert actual painted
  viewport pixels, including ancestor clipping, transforms, opacity and viewport intersection.
- **P3 — the claimed destination is not invariant and T13 never checks it.**
  `browser/raven-grab.js:172`, `:11887`, test `:1331`. On a cold/default load `activeTabB` is `layers`,
  so `structureActions` is DETACHED and resolution falls back to the right-panel `[data-status]` — the
  confirmation is not in `[data-status-b]` and not necessarily in a different panel. T13 scans every
  `.raven-grab-status`, erasing the distinction.
- **P3 — the comments incorrectly call `title` the button's accessible NAME.**
  `browser/raven-grab.js:12997`, test `:1344`. The button already has visible text `Add to queue`
  (`browser/raven-grab.js:12015`), which supplies the name; `title` supplies a DESCRIPTION.
- **P3 — "all fourteen literal status call sites" counts two non-announcements.** test `:172`,
  `CLAUDE.md:5`. Two calls set an empty string purely to CLEAR status
  (`browser/raven-grab.js:12709`, `:12822`) and cannot lose an announcement. Correct version:
  "12 non-empty direct-literal messages plus two clears."

**The one claim that survived: the in-place sync / two-modalities decision.** Nothing in the report
argues for deleting the `setGlobalActionStatus` call.

---

## Dispositioning Sol round 5 — the four code sites read verbatim first

Sol's findings name four sites and **one of its citations is wrong**, which is worth recording because it
changes which function the P2-1 fix lands in: it cites `browser/raven-grab.js:11887` for the resolution
order, and `:11887` is inside **`mountGlobalActions`**. The function is `setGlobalActionStatus`, at
**`:12750`**, found by `grep -n` rather than by trusting the line reference.

### What the reads established (both facts are what make the fix bounded)

**1. The detached-`structureActions` case ALREADY falls through — so the fix's only behaviour change is
the hidden/inert skip.** `setGlobalActionStatus` is a four-way `||` chain:

```js
var status = (structureActions && structureActions.querySelector("[data-status-b]"))
  || (globalActions && globalActions.querySelector("[data-status]"))
  || panelQuery("[data-status-b]")
  || panelQuery("[data-status]");
```

and `mountGlobalActions` (`:11860`) does this whenever the left panel is not on Assets:

```js
} else if (structureActions.parentNode) {
  structureActions.parentNode.removeChild(structureActions);
  structureActions.innerHTML = "";
}
```

`innerHTML = ""` means the first candidate's `querySelector` returns **null** on a cold/default load
(`activeTabB === "layers"`), so resolution reaches the right-panel `[data-status]` on its own. **That is
Sol's P3-1 confirmed mechanically rather than accepted on its say-so** — and it also bounds the P2-1
patch: nothing about which node is chosen changes except when the chosen one is unreachable.

**2. Collapse sets BOTH `aria-hidden` and `inert`, so a reachability walk must test both** (`:2726`):

```js
el.setAttribute("data-collapsed", next ? "true" : "false");
el.setAttribute("aria-hidden", next ? "true" : "false");
if (next) el.setAttribute("inert", "");
else el.removeAttribute("inert");
...
mountGlobalActions();
```

Either attribute alone removes the subtree from the accessibility tree. Testing one and not the other
would be the one-of-two-call-sites drift this repo documents for preview-vs-action.

### The disposition, finding by finding

- **P2-1 → PRODUCT + TEST.** `setGlobalActionStatus` skips a candidate with a hidden/inert ancestor and
  falls through to a live one; only when EVERY candidate is hidden does it take the first, so the text
  still lands somewhere rather than nowhere. **The scope widening is deliberate and flagged rather than
  silent:** the standing rule is that an unlisted dependency the change genuinely REQUIRES is in scope
  and an adjacent problem that merely bothers me is not — and the fix's ENTIRE justification for
  choosing `sr-only` over deleting the call is that the announcement happens, so delivery is required,
  not adjacent. It improves all 12 non-empty call sites and regresses none. Test side: a
  no-hidden/inert-ancestor assertion in T13, plus a new **T14** that opens Assets, collapses the left
  panel, banks, and asserts the announcement still reaches a live region with no hidden/inert ancestor.
  Without the product fix that assertion is RED — so either write both or neither. **Real-AT audibility
  (a VoiceOver/NVDA transcript) is NOT achievable headlessly and is stated as a residual, not papered
  over.**
- **P2-2 → TEST.** The `> 1` geometry predicate is replaced by **painted pixels**: screenshot, set
  `visibility: hidden` on the candidate, screenshot again, restore — any delta means it painted.
  `visibility: hidden` rather than `display: none` because it is **layout-neutral**, so no reflow is
  mistaken for the node's own paint. `elementFromPoint` was refused (blind to glyphs painting outside a
  1px box — exactly Sol's false negative) and `Element.checkVisibility()` was refused (does not account
  for `clip-path`). New **Q25** strips `overflow:hidden; clip-path:inset(50%)` from the `sr-only` rule
  (`:1551`) keeping the 1px box — the mutation Sol names and the matrix did not have. New **Q26** breaks
  the hidden/inert skip.
- **Which ARM grades which property is load-bearing**, and it is the Q24 lesson one layer on: in a
  collapsed-panel arm the pixel measure correctly reads "invisible" even for a non-`sr-only` status, so
  **Q24 would SURVIVE if the harm assertion lived there.** The harm assertion stays in the DEFAULT arm;
  the announcement-reachability assertion runs in both.
- **P3-1, P3-2, P3-3 → PROSE, four places each** (product decision comment, suite header, this log, the
  `CLAUDE.md` ledger): say "the shared live-status channel" and record `data-status` vs `data-status-b`
  identity plus owning panel; call `title` a **DESCRIPTION** with the visible text `Add to queue`
  supplying the accessible NAME (decided: do NOT build an AX-name harness for it); replace "fourteen
  literal status call sites" with **"12 non-empty direct-literal messages plus two clears"**.

Consequences of any of the above, none optional: `cp browser/raven-grab.js web/public/raven-grab.js`
plus `cmp -s`, the full suite re-measured, and **the matrix re-run WHOLE** because the overlay changes.

---

## P2-1 landed (product half), and the four source facts behind it

`setGlobalActionStatus` no longer resolves through a four-way `||` chain. It builds the same four
candidates in the same order and skips any whose ancestor chain carries `aria-hidden="true"` or
`inert`, falling back to the first available candidate only when EVERY one is unreachable — so the
text lands somewhere rather than nowhere. New helper `statusNodeIsReachable(node)` at
**`:12760`**, called at **`:12791`**, behind a decision comment stating that this is required by the
`sr-only` fix rather than adjacent to it (that fix's whole justification for keeping the call is that
the bank ANNOUNCES, so delivery is the thing being claimed).

Verified in one command: `node --check` → `SYNTAX OK`; `cp` to `web/public/raven-grab.js` →
`cmp -s` **MIRROR IDENTICAL**.

The comment names a mutant **Q26 that does not exist yet** — same situation as Q24 last round, and it
gets the same treatment: the comment is a claim, so the mutant gets written rather than the comment
softened.

Four source facts read rather than assumed, each of which bounds the patch or the T14 route:

1. **`mountGlobalActions` never consults collapse state** (`:11860–11897`) — the left dock is gated
   purely on `activeTabB === "assets"`. That is what makes Sol's P2-1 reachable: with Assets open the
   `[data-status-b]` node stays mounted INSIDE a collapsed left panel.
2. **`setPanelCollapsed(el, next)` (`:2717`) writes at `:2730–2734`** — `data-collapsed`,
   `aria-hidden`, AND `inert` (added/removed). Either attribute alone removes the subtree from the
   accessibility tree, which is why the walk tests both.
3. **T14's only UI route into collapse is `[data-panel-preset="right"]`** — there is no
   `data-collapse` attribute anywhere in the overlay. `applyPanelPreset("right")` (`:2802`) sets
   `leftCollapsed = true, rightCollapsed = false`; click handler at `:12964`.
4. **`applyPanelPreset("right")` does NOT touch `propertiesDismissed`** — so the right panel is still
   there to receive the fallback, which is the whole point of the arm.

The collapsed panel is **translated off-screen, not sized to zero** (`:835–836`,
`transform: translateX(calc(100vw + 100%))`) — confirmed in source, and that is Sol's false-POSITIVE
case for the `> 1` geometry predicate.

---

## Andrew's next instruction, mid-turn — it reorders the remaining work

> *"Get rid of this Change a style or write an instruction first and make the button right aligned. to
> the intructions box and move the mic button down to the left of the add to que button, it should be
> the same height"*

Three asks on one row: **(a)** drop the `QUEUE_NEEDS_WORK` note text, **(b)** right-align **Add to
queue** to the Instructions box, **(c)** move the Instructions mic down beside the button, same
height.

**This lands ahead of the Sol round-5 bookkeeping deliberately** — it rewrites the exact markup the
tests and mutants anchor to, so doing the prose and the new mutants first would mean doing them twice.

### What the recon established before touching anything

- **One template, TWO surfaces.** `instructionsMarkup` (`:12003–12018`) renders in BOTH the desktop
  footer and the mobile Instructions tab (its own comment says so). Any layout change here lands on
  both at once — a spec fact, not a detail.
- **The height delta is real and measured:** `.raven-grab-queue-add` carries `min-height: 44px`
  (`:1071`), `.raven-grab-voice` is a fixed `width: 24px; height: 24px` (`:969`). 44 vs 24. The 24px
  mic is also under the 44px tap-target floor, so matching heights fixes that incidentally.
- **`.raven-grab-queue` (`:1065`)** is `display:flex; align-items:center; gap:8px; margin-top:8px` with
  no `justify-content` — the row is left-aligned today.
- **The blocking constraint on (c) is `test/grab-overlay-voice-alignment.test.mjs`.** Its
  source-enumeration test asserts every `voiceButtonMarkup(` call site sits inside one of exactly
  **three** covered containers (`:807–811`): `raven-grab-feedback-field`, `raven-grab-field`,
  `raven-grab-section-heading` — checked by a real start-tag tokenizer plus a tag-depth walk
  (`hasClass(tag.attrs, container.cls)` at `:1431`). Moving the Instructions mic out of
  `.raven-grab-section-heading` and into `.raven-grab-queue` turns that test RED unless
  `.raven-grab-queue` joins the covered set **and** the shared flush CSS rule in the same change.
  That suite has survived NINE Sol rounds, 30 mutants and 12 controls: extend its rule, never weaken
  it, and never patch one of the two halves — two copies of one rule is the drift this repo documents
  for preview-vs-action and listing-vs-lookup.

### Two more constraints on (c), read rather than assumed

**The geometry test breaks too — it is not only the source-enumeration half.** `test/grab-overlay-voice-alignment.test.mjs`:

- **`:652`** resolves each mic's row as
  `mic.parentElement.closest('span:not(.raven-grab-voice-slot), .raven-grab-section-heading')`.
  A mic inside `div.raven-grab-queue` matches **neither** selector → `hasRow` false → `:696–698`
  pushes `panel/data-instruction: no label row or section heading above the voice slot` → the
  collected-violations assert at `:713` goes RED.
- **`:679–685`** is a hard `assert.deepEqual` on the mic target SET
  (`data-component-name`, `data-feedback-message`, `data-instruction`, `data-template-name`,
  `data-use-case`) with the message *"the set of mics reachable from the panel + feedback pane
  changed"* — so `data-instruction` must stay RENDERED and non-zero-width (`visible = width > 0`
  at `:647`). Moving the mic is allowed; dropping it is not.
- **`:702–705`** is a PRECONDITION assert: `row.rowWidth > row.micWidth + 40`. With the mic grown
  to 44px the containing row must exceed 84px — true for the full-width queue row, but it is a
  real constraint and it is why the mic cannot simply be dropped into a shrink-to-fit wrapper.

So (c) touches THREE things in that suite, not one: the covered-container set, the geometry row
selector, and the shared flush CSS rule. Extending all three together is the non-weakening form;
patching one is the two-copies-of-one-rule drift.

**`.claude/overlay-controls-2026-08-08/align-mutants.mjs:38–39` is a DEAD ANCHOR the moment (c) lands.**
Mutant **A6** ("a ninth mic appears in the overlay") finds on the literal

```
<h2 class="raven-grab-section-title">Instructions</h2>${voiceButtonMarkup("data-instruction", "instructions")}
```

which is exactly the markup (c) rewrites. The harness requires each anchor to match exactly once
BEFORE the baseline, so it will **ABORT** rather than mis-measure — the uniqueness check working, the
same way V7/V11/V14/V16/V19/V24/V25 died in the versions matrix. A6 gets re-anchored to the mic's new
site and the alignment matrix is re-run WHOLE. Three further mentions in that file are prose, not
anchors, and get read for decay: `:121` quotes the geometry violation message, `:225` is the A23
bare-attribute-substring comment, `:247` embeds `raven-grab-section-heading` in an A-series fixture.

---

## Andrew's three asks — CSS half landed

> *"Get rid of this Change a style or write an instruction first and make the button right aligned. to
> the intructions box and move the mic button down to the left of the add to que button, it should be
> the same height"*

**(a)** stop rendering `QUEUE_NEEDS_WORK` as visible prose · **(b)** right-align **Add to queue** to
the Instructions box · **(c)** mic down beside the button, same height.

### Two CSS edits, verbatim

`.raven-grab-queue` (now `:1073`) gained `justify-content: flex-end` behind the reason it is NOT folded
into the shared mic-row rule:

```css
/* The queue row is deliberately NOT folded into the shared mic-row rule
   (`.raven-grab-field > span, .raven-grab-feedback-field > span`). The two rules
   want opposite values: a label row is space-between, because its mic sits at the
   far right of a row whose left end is the label; this row is flex-end, because
   the mic and the button travel TOGETHER at the right edge with the note taking
   the slack. Folding them would give one of the two the wrong justification.
   Both are covered by test/grab-overlay-voice-alignment.test.mjs — the label rows
   by the flush-right rule, this one by the paired gap/height/flush assertions. */
.raven-grab-queue { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px; }
/* The mic matches the button's height rather than the 24px it uses in a label row.
   Andrew asked for "the same height"; it also lifts this instance over the 44px
   tap-target floor the button already meets. Scoped to this row on purpose — the
   global .raven-grab-voice stays 24px, where a taller mic would blow out the
   label rows' line height. */
.raven-grab-queue .raven-grab-voice { width: 44px; height: 44px; border-radius: 8px; }
```

`.raven-grab-queue-note` (now `:1094`) gained `flex: 1 1 auto; min-width: 0`:

```css
/* flex: 1 1 auto is what keeps the mic+button pair flush right whether or not the
   note is showing: visible, it absorbs every spare pixel from the left; hidden, it
   is out of layout entirely and flex-end does the same job. min-width: 0 lets it
   shrink rather than pushing the pair off the right edge. */
```

The 44px is a **measured** delta, not a guess: `.raven-grab-queue-add` carries `min-height: 44px`,
`.raven-grab-voice` is a fixed `24px × 24px`. The scoping matters in both directions — a global mic
change would blow out the label rows' line height, and the 24px mic was under the 44px tap-target
floor anyway.

**Post-edit line map** (net +19, re-grepped rather than arithmetic): `.raven-grab-queue` **1073**,
`.raven-grab-queue .raven-grab-voice` **1079**, `.raven-grab-queue-add` **1085**, `:hover` **1088**,
`[aria-disabled="true"]` **1089**, `.raven-grab-queue-note` **1094**,
`panelQueryAll(".raven-grab-queue-note")` **4302**, `queueNoteAtRender` **12027**, markup
**12028–12036**.

### The markup order was REVERSED before it shipped, and the reason is the round-5 glue check

The obvious DOM order for (b)/(c) is `note → mic → button` inside `.raven-grab-queue`. It is wrong,
and the alignment suite would have caught it as a **red on correct markup**.

Round 5 of that suite established that the anchor-to-mic region must satisfy `/^[\s+]*$/` over the
**`glue`** view — `code` with every string interior, quote, escape run, `${` and in-string HTML
comment blanked. **A `${...}` interpolation's BODY survives in `glue` as code.** So putting
`<p …>${escapeHtml(queueNoteAtRender)}</p>` between the container opener and the mic leaves
`escapeHtml(queueNoteAtRender)` sitting in the glue region, the `CONCATENATION_ONLY` check refuses the
anchor, and the mic reports **uncovered**.

Widening the glue rule to admit it is exactly the move nine Sol rounds forbid — extend the rule, never
relax it. So the DOM order is **mic → note → button** (nothing but literal markup between the opener
and the mic) and the note is pulled left visually with `.raven-grab-queue-note { order: -1 }`.

Consequences checked rather than assumed:
- the geometry test reads `getBoundingClientRect()`, so it sees the **visual** order — mic left of
  button, pair flush right — satisfied;
- the source enumeration reads **source** order — satisfied;
- focus order stays mic → button, which matches visual left-to-right (the note is not focusable), so
  the usual `order` a11y objection does not bite here.

### What the enumeration comment says, read rather than remembered

`test/grab-overlay-voice-alignment.test.mjs:727–741`: the property is *"every voiceButtonMarkup call
site in the overlay sits inside one of the three containers the stylesheet aligns, and there are
exactly eight of them"*; it *"measures source structure, not rendered geometry. A container that is
named correctly and styled wrongly passes here and fails the test above — which is why both exist
rather than either alone."* And the radius fact that must survive A6's re-anchor: *"A4 and A5 redden
this test ALONE … but A6 reddens BOTH — a duplicated mic is visible to geometry as well as to the
count."*

`CONTAINERS` is at `:807–811` and is consumed through `parseStartTag` + `hasClass` — a real start-tag
tokenizer, not a substring test (that is round 9's fix). `.raven-grab-queue` joins it with `tail: ''`,
the same shape as `raven-grab-section-heading`.

**`SHARED` (`align-mutants.mjs:15`) stays byte-identical** — the queue row wants `flex-end` and the
label rows want `space-between`, so folding them would give one the wrong justification and A1/A2/A3
keep their anchors. Only **A6** needs re-anchoring.

---

## The geometry half of Andrew's three asks — written, green, and (as of writing) UNMEASURED

`test/grab-overlay-voice-alignment.test.mjs` took **five** edits, and the fifth is a rename, because the
test's own name had become a false claim.

### The rule was EXTENDED, not relaxed — and that was the whole shape of the work

Seven of the eight mics ARE the rightmost thing in their row. The Instructions mic is now deliberately
**second-from-right**, because Andrew asked for it "to the left of the add to que button". So:

- asserting `rowGap ≈ 0` on the queue row asserts something **false** — its `rowGap` is legitimately the
  button's width plus the 8px gap;
- dropping the row from the loop leaves the layout he just asked for **measured by nothing**.

The chosen non-weakening form is a queue-only branch placed AHEAD of the flush rule, carrying three
paired assertions that cover the same ground the flush rule covered:

1. `pairFlush` ≤ 1px — the pair is still flush right; only WHICH element is rightmost changed.
2. `pairGap - 8` ≤ 1px, **signed, not `Math.abs` of the gap** — a negative gap is the mic sitting to the
   RIGHT of the button, which is the opposite of the ask.
3. `micHeight - pairHeight` ≤ 1px — "it should be the same height", asserted directly.

Plus a queue-specific width precondition (`rowWidth > micWidth + pairWidth + 40`), for the same reason the
non-queue path has one: in a row only as wide as its two controls, "the pair is flush right" is true
however the row lays out, so the assertion would measure nothing.

A missing button is its own violation (`hasPair`) rather than a silently-skipped assertion — the shape
this repo's history keeps warning about. Violations stay COLLECTED and asserted once (a per-row assert
makes two mutants indistinguishable).

### Five edits

1. `CONTAINERS` gained `{ cls: 'raven-grab-queue', tail: '' }` as its FOURTH entry (`tail: ''` = mic is a
   direct child, same shape as `raven-grab-section-heading`).
2. The enumeration property comment: "three containers" → **"FOUR containers"**, dated, with the reason.
3. The container-list lead-in rewritten — it said "the three row containers the stylesheet gives
   flex/space-between", which is now false of one of the four.
4. `measure()`'s row selector widened to include `.raven-grab-queue`, and six new fields returned
   (`isQueue`, `micHeight`, `hasPair`, `pairWidth`, `pairHeight`, `pairGap`, `pairFlush`).
5. The test renamed: `'every mic is flush with the right edge of the row that holds it'` →
   **`'every mic is flush right in its row, or paired flush right with Add to queue'`**.

Checked with grep BEFORE renaming: `align-mutants.mjs` embeds **no** test-name constant — only a prose
mention at `:120` — so the rename cannot silently break a declared-name kill check. This file's own
history is a list of comments that decayed into lies; a test name is a claim like any other.

### A6 re-anchored, its property RE-DERIVED rather than carried

A6 ("a ninth mic appears in the overlay") was anchored to the Instructions section heading with the mic
inside it — exactly the markup these asks rewrote. The harness would have ABORTED on a dead anchor
rather than mis-measured, which is the uniqueness check working (V7/V11/V14/V16/V19/V24/V25 in the
versions matrix all died the same way).

Its documented property is *"A4 and A5 redden the enumeration test ALONE, but A6 reddens BOTH"*, and
that had to survive the move. Re-derived from the new markup rather than assumed:

- **enumeration** red because nine call sites is not eight;
- **geometry** red because the row is `justify-content: flex-end`, so the duplicate lands between the
  original and the button — the LEFT mic then measures 8 + 44 + 8 = **60px** from Add-to-queue and fails
  the 8px pair-gap check.

The target SET is unmoved: both mics carry `data-instruction`, deduped through a `Set`.

### Three new mutants, one deliberately NOT written here

Ids **A43/A44/A45** — grepped the tail of `MUTANTS` first and found A35–A42 already taken, so writing
A35 would have produced duplicate ids.

- **A43** the queue row loses `justify-content: flex-end` → geometry alone.
- **A44** the queue mic loses its row-scoped 44px box → geometry alone.
- **A45** the Instructions mic escapes the queue row into a sibling div → BOTH (the A7/A8 escape at the
  new site: enumeration because the mic is no longer in a covered container, geometry because `closest()`
  then resolves no row at all).

Each mechanism gets its OWN mutant rather than one mutant for "the queue row".

**The `order: -1` on `.raven-grab-queue-note` is deliberately NOT mutated in this matrix.** The note is
HIDDEN in this suite's fixture (nothing has been edited, so the blocked reason resolves and — since ask
(a) — renders as nothing), and an out-of-layout element's `order` has no observable effect. Its mutant
belongs in `.claude/queue-draft-2026-08-10/queue-mutants.mjs`, whose fixture banks a draft and therefore
shows the notice. **A mutant that cannot change what a suite measures does not belong in that suite's
matrix.**

### Measured so far

`node --test test/grab-overlay-voice-alignment.test.mjs` → **2 tests / 2 pass / 0 fail / 0 cancelled /
0 skipped / 0 todo**, 968.7ms (geometry 524.9ms, enumeration 52.5ms).

**That is worth nothing until the matrix proves them red** — five times in this repo a test has been
found detecting rather than encoding. Matrix launched detached to
`.claude/overlay-controls-2026-08-08/measurements/align-v12.log` with `EXIT=$?` written INSIDE the file.

The harness's declared baseline was checked before launching rather than assumed: it pins the test COUNT
(`pass + fail !== 2`, `:463`) rather than a name list, and requires a green baseline (`:475`). The count
is still 2, so no repair was needed.

**Harness slip worth recording:** `node --test … | tail -40; echo "EXIT=${PIPESTATUS[0]}"` printed
`EXIT=` — empty. `PIPESTATUS` was not readable at that point. The summary lines are the measurement; the
standing rule (append `EXIT=$?` INSIDE the log file) is the fix and is what the matrix launch used.

---

## The alignment matrix measured (v12), and then an ordinal decay found in fourteen places

### v12 — 33 mutants, 33 killed, 0 survived; 12 controls, 0 false-failed

`.claude/overlay-controls-2026-08-08/measurements/align-v12.log`, `EXIT=0` written INSIDE the file. Head:
`preflight ok: 45 anchors unique, all mutations change the file` / `baseline: 2 pass / 0 fail, exit 0`.
Entry count 45 = 33 + 12 ✓.

The four new/re-anchored rows, verbatim:

```
A6  a ninth mic appears in the overlay
  radius 2
    panel/data-instruction: mic sits 60px left of Add-to-queue, not the 8px row gap

A43 the queue row loses justify-content:flex-end
  radius 1
    panel/data-instruction: Add-to-queue is 129.56px from the row's right edge, not flush

A44 the queue mic loses its row-scoped 44px box
  radius 1
    panel/data-instruction: mic is 24px tall against a 44px button — not the same height

A45 the Instructions mic escapes the queue row into a sibling div
  radius 2
    panel/data-instruction: no label row or section heading above the voice slot
```

**A43 kills ask (b), A44 kills ask (c).** A6's re-derived 60px property (8 + 44 + 8, hand-derived
BEFORE the run) is exactly what the harness printed — the prediction and the measurement agree, which
is the only thing that makes the re-anchor a re-derivation rather than a re-guess.

**The no-radius-moved claim was made as a DIFF, not as a carried reading.** There is no v11 log on
disk; `agent-output/align-r8-v10.out` (34 entries = 27 mutants + 7 controls) is a valid baseline only
because the suite header states no v10 radius moved in v11. Joined against v12: **ZERO moved.** The
11 v12-only rows are A35–A42 (round 9's additions, first LOGGED measurement) plus A43/A44/A45, and
45 − 11 = 34 with 27 + 7 = 34 corroborates that the join actually compared rather than silently
under-matching.

**Instrument slip:** `grep -c 'control expects green'` returned **0** on a log whose summary says 12
controls. The wording is `control expects 0 red, saw 0  ok`. Same class this repo keeps paying for —
assert a pattern, get silence, and silence is indistinguishable from absence. Fixed by grepping the
actual lines rather than the remembered ones.

### Three stale prose claims in the suite, fixed

In the file whose own header warns about exactly this class:

- A6's list entry quoted **109px**, invalidated by the re-anchor → rewritten to 60px.
- The header said **EIGHT mics / THREE unrendered** with line numbers `:8518`/`:8552`/`:10601`, while
  the assertion says **9** and its inline comment says **four of nine**. Resolved by COUNTING the nine
  real `voiceButtonMarkup(` call sites rather than picking a side; line numbers re-grepped to `:9975`,
  `:10009`, `:12109`, `:5513` after drifting by hundreds of lines.
- Line 497 said the source test is the ONLY guard on *"the two mics"* → **FOUR**.

### Then: `ninth mic` appears in FOURTEEN places, and had been false since before these asks

The obvious repair was `ninth` → `tenth`. **That re-arms the same decay on the next mic.** An ordinal
meaning "one more than the current count" is a decay generator, and it had already gone false twice:

- the real mic count went **8 → 9** at the named-style-versions round, which left every "a ninth mic"
  describing the ninth REAL one;
- my own queue-row change took `CONTAINERS` **3 → 4**, which made "a fourth kind of row" false too.

So the ordinal was **removed**, not incremented. Live claims now read *"an EXTRA mic"* / *"an added
mic"* / *"a kind of row `CONTAINERS` does not cover"* — forms that are true at any count.

**History was protected rather than overwritten.** Five of the fourteen are dated pre-fix measurements
attributed to Sol rounds 8 and 9 (`align-mutants.mjs:365`: *"the count stayed 8, the ninth mic was
never examined"*). Those were correct when measured; renumbering them would make them FALSE. Each was
read in context and classified **live claim** vs **historical dated measurement** before any edit, and
the historical ones now carry an explicit `HISTORY — … dated and correct, do not "update" them` marker
so the next reader does not "repair" them into lies.

**Six edits to `.claude/overlay-controls-2026-08-08/align-mutants.mjs`:** A6/A33/A38 labels → "an EXTRA mic…",
with a five-line comment above A6 recording why; `:186`'s "a ninth mic must pass that one first" → "an
added mic"; A33's and A38's pre-fix blocks marked HISTORY.

**Seven comment-only edits to `test/grab-overlay-voice-alignment.test.mjs`:** the three list-entry
labels; the `9 !== 8` claim rewritten to name the count it was measured against; the count-assertion
property statement rewritten with no ordinals at all plus a paragraph naming both decayed numbers and
the fourteen-occurrence finding; two round-8 figure blocks put in past tense and marked HISTORY.

### The label/log divergence was surfaced, not left to be discovered

Renaming three mutant descriptions makes `align-v12.log`'s printed labels disagree with the harness.
**A description is element 0 of the tuple and is never an anchor** — the find/replace strings are
untouched, so the measurement is unaffected. But a reader diffing the two would see a mismatch and
reasonably suspect the matrix, so a new header paragraph states the mismatch, its cause, and why the
measurement stands.

### Measured, not asserted

Seven comment edits cannot change a test result — that is reasoning, not evidence. The suite was
re-run anyway:

```
✔ every mic is flush right in its row, or paired flush right with Add to queue (510.427708ms)
✔ every mic in the overlay source sits in a container the shared rule aligns (51.306084ms)
ℹ tests 2  ℹ pass 2  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0  ℹ todo 0
EXIT=0
```

`node --check` on both files → **SYNTAX OK**. Re-grep leaves 5 `ninth mic` occurrences, all
legitimate: 2 new comments quoting the old wording, 3 attributed historical measurements now
explicitly marked.

### Scope note owed to Andrew

The ordinal decay is **pre-existing** (from the named-style-versions round), not introduced by his
three asks. It was fixed rather than merely reported because the v12 header I wrote asserts NINE,
which made the file internally contradictory in a way my own edit exposed. That is a deliberate scope
deviation and it gets one report line.

### Where this leaves the three asks

Product + mirror complete. **Alignment half: written, green, MEASURED (v12), header current.**
**Queue suite half: still RED** at `test/grab-overlay-queue-draft.test.mjs:599–605` — under ask (a) the
blocked note renders `""` and is `hidden` while the button `title` still carries the reason, so `:599`
and `:600` invert and `:605` must compare `buttonTitle` against the REASON rather than `noteText`.
`:618` survives unchanged. No completion claim is available: the full suite and the queue matrix are
stale against the tree, and eyes-on plus a Sol pass are still owed.
