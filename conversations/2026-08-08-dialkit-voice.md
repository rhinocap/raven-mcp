# 2026-08-08 — DialKit gap close (round 1) + voice closeout

Per-instance log. Three threads came in on one `/goal`; this session is
executing thread B and closing out thread C.

## Where left off

Round 1 of the DialKit gap is BUILT and TESTED LOCALLY, thread C's four
closeout items are all applied, and **Sol round 1 has been read and every
finding dispositioned in code**. Nothing committed, nothing pushed, no release,
no endpoint change. Suite figure after the Sol fixes: **1481 / 1478 / 0 / 3,
exit 0**. Still open: Sol round 2 on the fixes themselves — no completion claim
before it is read.

## Threads

**A — Higgsfield video.** Andrew chose "do the brand-genesis flow yourself":
walk it end to end for a real brand (interview -> Higgsfield brand pack ->
`generate_mood_board` -> `generate_design_system` -> DESIGN.md). BLOCKED on one
thing only: **Andrew must name the brand.** Preflight is clear — CLI authed,
ultra plan, 3762 credits, Raven stdio connected. Runbook is
`docs/brand-genesis-flow.md`.

**B — DialKit gap.** "Add anything DialKit has that Raven is missing." Fanned
out; the synthesis mapped all 50 DialKit capabilities against the Grab overlay.

**C — Voice inputs.** Round-16 Sol verdict resolved; four closeout items below.

## What the DialKit fan-out actually found

My starting hypothesis was wrong in both directions and the evidence narrowed
it. The overlay ALREADY has drag-to-scrub, arrow-key nudge with Shift x10,
color pickers, enum selects, folders/categories, live DOM preview,
export-to-agent and sessionStorage persistence. A large block of DialKit's
surface is structurally N/A here — framework adapters, dynamic config
reconciliation, stable IDs, inline mode, the production gate, TS types, package
exports — because Raven operates on the DOM, not on a React tree.

The real gap was WIDER than "no easing branch": `transition-*` and
`animation-*` appeared nowhere in `STYLE_CATEGORIES`, so motion properties
never reached the panel **or** the capture set. An agent reading a Grab payload
could not see motion at all.

Two dispositions, both reported rather than silently narrowed:

1. **Spec 1 (`set_grabbed_style`, ranked #1 by the synthesis) is HELD, not
   dropped.** It is a new inbound actuation channel into a live browser tab.
   Raven's authoring is human-gated by construction — the mood board is an
   approval stop, `batch-commit` needs a human Send, and the
   loopback-vs-third-party proxy rule has been re-fought three times.
   **Unhold condition:** Andrew says the word, AND `proxyCaptureOnly()` gating
   is wired through it first.
2. **The timeline (DialKit #27-40, 12 of the 50 capabilities) is out of scope.**
   That is Jitter/Morven territory, not a design-audit server's job.

## Changed files

- `browser/raven-grab.js` — 7 edits (below)
- `web/public/raven-grab.js` — byte-identical mirror, re-synced with `cp`
- `test/grab-bridge.test.mjs` — parser test + internals exports + the
  category-list guard, which correctly went red
- `test/grab-overlay-easing-control.test.mjs` — NEW, real-Chromium widget suite

### The seven overlay edits

1. `motion` category in `STYLE_CATEGORIES`, between `effects` and
   `interaction`. This is the single lever: `STYLE_PROPERTIES` is derived from
   it and is what `computedStylesFor` captures, so it controls the panel rows
   AND the capture set. `transition-property` rides along because a Motion
   section reading "0.2s / ease" with no statement of WHAT is animating is
   contextless.
2. Parser block — `EASING_KEYWORDS`, `timingFunctionCount`,
   `parseEasingValue`, `formatBezierNumber`, `formatCubicBezier`.
3. `easing` branch in `classifyStyleControl`, placed AFTER the
   `MIXED_STYLE_VALUE` check on purpose.
4. `unitOptionsForProperty` — durations get `["ms","s"]`, not the length list.
5. The ~140-line curve editor in `beginStyleEdit`.
6. CSS for the drag surface, handles and presets.
7. `EASING_VIEW_W`/`EASING_VIEW_H` shared by the SVG viewBox and the CSS
   `aspect-ratio`.

### Decisions inside that build worth not re-litigating

- **The parser is the risky half, not the widget.** A control that accepts a
  value it cannot represent writes back its own approximation on commit and
  destroys the original. So `steps()`, `step-start`, `step-end`, `linear()`,
  any compound value, and Mixed all fall back to plain text — the established
  box-shadow precedent, reusing `shadowLayerCount`'s exact
  `split(/,(?![^(]*\))/)` top-level-comma regex.
- **x is clamped, y is NOT.** Per CSS Easing L1 the x coordinates must be in
  [0,1] or the declaration is invalid; the y coordinates are unbounded.
  Overshoot and anticipation curves live outside the unit square and are the
  whole reason to open a curve editor by hand — clamping y would flatten
  exactly them. The drag surface draws y over [-0.5, 1.5] so those handles stay
  on screen; that is a limit of the picture, not of the value.
- **A preset writes the KEYWORD, not its bezier expansion.** `ease-out` is what
  the author meant and what a token would hold; expanding it to
  `cubic-bezier(0, 0, 0.58, 1)` makes every later diff read as a change nobody
  made.
- **Self-caught before any test ran:** the first draft used a `0 0 100 100`
  viewBox with `preserveAspectRatio="none"` in a ~240x96 box, which scales x by
  2.5 and y by 0.96 — every circular handle rendered as a wide ellipse and the
  grab target was a different size per axis. Fixed by pinning the viewBox to
  the CSS aspect ratio via shared constants. The widget suite now asserts the
  handle's own width/height ratio, with the surface's wider-than-tall shape as
  an explicit precondition (in a square box the distortion is unobservable).
- **Releasing the pointer COMMITS**, matching `beginStyleScrub`. The first
  draft of the drag tests read a live input that no longer existed after the
  rebuild; they read the committed cell AND the element's inline style now,
  which is the only assertion that says the change reached the page.
- **Cross-realm arrays**: the overlay runs in a `vm` context, so an array it
  returns fails `deepStrictEqual` against a host literal on prototype identity
  alone. `realm()` in the parser test re-homes it — a failure about realms is
  not a failure about the value.

## Mutant matrix (build round) — 10 mutants, 10 killed, 0 survived

Superseded by the v3 re-run recorded further down; kept for the harness notes.

Harness ran fail-closed: every anchor must match exactly once BEFORE the
baseline, a no-op mutation dies in the preflight, a mutant copy is
`node --check`ed, a missing/disagreeing test summary aborts, and the baseline
must be green. Radii recorded in the suite header. Two notes recorded there
rather than left implied: E1 and E6 share a radius of 6 because both collapse
every bezier to plain text (one mechanism, not two guards), and the parser test
counts as ONE red however many of its assertions break, so parser-only radii
are a floor.

Harness lives in the session scratchpad; copy it to a durable path if it is
going to be re-run after this session.

## Thread C — voice closeout (4 items, ALL APPLIED)

1. **DONE.** Round-16 Sol verdict recorded (DOES NOT SURVIVE — two P3s, both
   10/10, both about the ledger's own PROSE, neither a product nor a harness
   bug) and the two false claims at
   `conversations/2026-08-06-patternlib-hardening.md:1005` corrected in place:
   "no tracked file changed this round" was false (that file itself changed),
   and negative copies (c) and (d) do not differ by only one variable ((c)
   keeps `timeout: 300000`, (d) uses `timeout: 50`). The loop had converged
   onto prose accuracy — recorded, corrected, stopped.
2. **DONE, as a deliberate documented exclusion.** All three `type="email"`
   fields (feedback `:2309`, component-request required `:10244`, optional
   `:10248`) carry NO mic, and the reasoning is written at BOTH sites rather
   than in one place a reader of the other will never find. An address is the
   one input dictation reliably gets wrong — no spoken form for `@` or the
   dot, homophone-dense local parts — and the failure is silent: the report
   sends, the reply never arrives. On the component-request branch it is
   worse, because that address is how the component reaches the person who
   asked for it. `autocomplete="email"` is the faster path to the same value.
   This runs against Andrew's literal "anytime we have any sort of input, we
   should be able to have voice", so it is flagged for his one-word overrule.
3. **DONE — and the recorded premise was wrong by two orders of magnitude.**
   The design-judge note said the Feedback mic was "~4px off". Measured in
   real Chromium: the Instructions mic sits at `right - field.right = 0`, the
   Feedback mic at **-396.41px**. Worse, the same row shape exists **five
   times**, not once: `.raven-grab-field > span` and
   `.raven-grab-feedback-field > span` were both `display:block`, so the mic
   rendered immediately after the label text on the feedback message, the
   fixed-move note, the template note, the template name and the component
   name. The Instructions and Component-notes mics were already flush only
   because they sit in `.raven-grab-section-heading`, which has been
   flex/space-between all along.
   The fix is **ONE shared rule across both selectors**, not two copies —
   the five rows are the same row and drift the moment they are two
   declarations. The `display: block` on `.raven-grab-field > span` was
   removed rather than left to be overridden.
   Guarded by the new `test/grab-overlay-voice-alignment.test.mjs` (real
   Chromium, 1 test) with a **measured 3-mutant matrix, 3 killed, 0
   survived**. A3 — narrowing the rule to the feedback row only — is the
   load-bearing mutant: it is the "fixed one of two call sites that share a
   rule" shape this codebase has already paid for twice, and without it
   folding the selectors together would read as tidiness rather than the fix.
   **Lesson recorded in the suite header:** the first draft asserted per row
   and was MEASURED not to separate A1 from A3 — `assert` aborts at the first
   failure, all three mutants break `panel/data-template-name` first, and the
   message was byte-identical. Violations are collected and asserted once.
   A second draft failed with `row is 0px against a 0px mic`: the settings
   modal's markup is built once and kept in the tree, so its mic is
   present-but-zero-sized while closed. A `visible()` filter fixes it, and the
   `deepEqual` on the target set is what stops that filter from quietly
   shrinking the sample.
   Placed in its own file on purpose: `test/grab-overlay-voice-input.test.mjs`
   asserts a run accounts for EXACTLY 40 tests and carries 57 measured radii,
   so a 41st test there would force a whole 57-mutant browser re-run to guard
   one CSS rule.
4. **DONE.** Ledger reconciled — see below.

## Ledger drift — reconciled

CLAUDE.md claimed **1430 / 1427**. Figure after the build round: **1476 / 1473
/ 0 / 3**. Figure after the Sol round-1 fixes: **1481 tests / 1478 pass / 0 fail
/ 3 skipped, `npm-test-exit:0`** — exactly **+5**, and it accounts precisely:
three easing tests (precision preserved on the handle nobody dragged, a
cancelled drag restores rather than stranding its preview, a cancelled drag
restores what the user TYPED) and two alignment tests (the Chromium probe's own
self-check, and the source enumeration of all eight mic sites).

**Read the +46 as TWO separate things.** The ledger was ALREADY STALE on
arrival: the tree measured **1466 / 1463 / 0 / 3 BEFORE any of the day's
edits**, so 36 of the 46 are prior drift nobody accounted for and must not be
attributed to this round. This round is exactly **+10**: eight browser tests in
`test/grab-overlay-easing-control.test.mjs`, one cubic-bezier parser test in
`test/grab-bridge.test.mjs`, one in `test/grab-overlay-voice-alignment.test.mjs`.

A background full-suite run straddled two comment edits and its figure was
DISCARDED rather than reported — a number about a tree that no longer exists is
not a measurement. `cmd | tail; echo $?` reports tail's exit, so the real run
redirects to a file with the exit code appended IN the file.

Overlay suites alone (7 files): **378 tests / 376 pass / 0 fail / 2 skipped,
exit 0.**

## CLAUDE.md changes this round

Ledger figure reconciled as above, plus three landmines added immediately
before the byte-identical-mirror landmine:

- `STYLE_CATEGORIES` is not a panel-layout list — it is the CAPTURE SET.
- A style control that ACCEPTS a value it cannot represent destroys the
  original on commit, so the parser is the risky half of any editor, not the
  widget (x clamped, y not; preset writes the keyword; release commits).
- A mic belongs to a ROW, and there are five of those rows, not one — plus the
  email exclusion.

The last two were EXTENDED after the Sol round: the parser landmine now carries
the formatter/precision defect and the pointercancel rollback (including why the
restore point is this drag's start rather than the row original), and the mic
landmine now carries the source-enumeration test, its hardcoded-path near-miss,
the module-load Chromium probe, and the three sibling suites that still have the
skip-vs-pass hole.

## Sol round 1 — verdict DOES NOT SURVIVE, four findings, all fixed

Brief at `.claude/dialkit-2026-08-08/SOL-BRIEF.md`; raw output (7,449 lines) at
`.claude/dialkit-2026-08-08/agent-output/sol-round1.out`, gitignored by the
`.claude/**/agent-output/` rule — this is a public repo and that file dumps
private skill content, which is exactly the class that rule exists for.

Sol confirmed SURVIVES on C2 (x clamped, y unbounded in the parser, zero-rect
returns without writing), C3 (preset writes the keyword), C4's normal pointerup
path, and C5's production selector. Its C6 verification was RUNTIME-BLOCKED —
all eight browser tests failed to launch under its sandbox — so the claimed
easing matrix was never independently re-run there. **That block is itself
finding 4.**

**F1 — the formatter destroys coordinates the user never touched (P2, product).**
`formatBezierNumber` rounded to three decimals and runs over ALL FOUR
coordinates whenever ANY handle moves. Opening
`cubic-bezier(0.12345, -2.34567, 0.98765, 3.45678)` and pressing a handle
without moving it committed `cubic-bezier(0.123, -2.346, 0.988, 3.457)`. This
is the editor's own documented defect class arriving through the formatter
instead of the parser. Fixed: rounding belongs where a PIXEL becomes a number
(`setEasingFromPointer`), never where a number becomes text — the formatter is
`String(n)`, lossless, and still prints "0.5" rather than "0.500" because a
dragged coordinate was already quantised at capture. Mutant E11, radius 1.

**F2 — a cancelled drag stranded its preview (P2, product).** `pointercancel`
removed its listeners and returned, but pointerdown had ALREADY previewed —
leaving the page rendering a curve nobody authored with no entry in
`styleEdits`. Same verdict as `finishCanvasDrag(false)`: restore, do not apply.
Mutant E12, radius 2 (both cancel tests assert a restore — one shared
precondition, not two guards).

The restore point is the value THIS drag started from, not `previousValue`. The
mutant for that (E13) **SURVIVED the first matrix**, and rather than accept it,
reading the code settled whether the trigger was reachable: pointerup and every
preset COMMIT, which rebuilds the panel and destroys the editor, so a second
drag by those routes is impossible — but TYPING redraws without committing. So
type-a-curve → nudge-a-handle → lose-the-pointer is a real path that would have
discarded the typing. It got a test, and E13 is killed at radius 1.

**F3 — two of the eight mics are unreachable by the rendered test (P2, test).**
The fixed-move note and the per-template note only exist in template mode, so
the CSS rule they share could be broken with nothing red. A second test
enumerates the `voiceButtonMarkup(` call sites in the overlay SOURCE and asserts
each sits in one of the three covered containers. Its first draft read
`../browser/raven-grab.js` by hardcoded path — which would have graded the
pristine file under every mutant and reported three kills it never made; it
reads `RAVEN_GRAB_ASSET_PATH` when set. Mutants A4/A5 (radius 1 each, separated
by the reported source LINE) and A6 (radius 2 — a duplicated mic is visible to
geometry as well as to the count).

**F4 — a skip and a pass were indistinguishable (P2, test).** The naive
`skipIfNoBrowser` turned any launch failure into `t.skip`, so the whole
alignment suite could report "1 skipped, 0 failed, exit 0" against all three
defects. Not hypothetical: Sol's sandbox hit
`MachPortRendezvousServer … Permission denied (1100)` and got exactly that green
run. Fixed with the `test/capture.test.mjs` rounds 12–19 pattern — probe
Chromium ONCE at module load, outside the code under test, plus a test that
asserts the probe agrees with the environment it is gating.

**Owed report line, deliberately NOT fixed:**
`test/grab-overlay-drag-move.test.mjs`, `test/grab-overlay-voice-input.test.mjs`
and `test/grab-overlay-scroll-preservation.test.mjs` all still carry the F4
skip-vs-pass hole. Pre-existing, outside this round's scope, now named in
CLAUDE.md so it is known debt rather than a future discovery.

## Matrices — both RE-RUN WHOLE, not carried forward

A find-string mutant dies the moment its target line is edited, and both fixed
sites were edited, so neither matrix was trusted from its previous run.

- **Easing v3: 13 mutants, 13 killed, 0 survived.** E1/E6 rose 6→9, E8 2→5,
  E10 9→12 — purely because the three new tests share those mechanisms. A
  radius is a fact about a mechanism, never evidence that coverage grew.
- **Alignment v2: 6 mutants, 6 killed, 0 survived.**

One harness run reported `exit 0` having printed only its preflight line and
nothing else — no baseline, no matrix. It was re-run as a tracked process rather
than read as a result: a check whose failure mode is indistinguishable from its
success mode is not a check.

## Verification state

- `browser/raven-grab.js` -> `web/public/raven-grab.js` re-synced, `cmp` clean.
- Full suite **1481 / 1478 / 0 / 3, exit 0**, run to a file with the exit code
  appended IN the file (`cmd | tail; echo $?` reports tail's exit).
- Sol round 2 on the fixes is the remaining gate. **No completion claim until
  it is read and dispositioned.**

## Next actions

1. Launch Sol round 2 (detached, `< /dev/null`) on the four fixes and their
   tests; read the file, disposition every real objection.
2. Thread A stays blocked until Andrew names the brand.
3. Thread B: spec 2 (named presets/versions) is the optional next DialKit gap;
   spec 1 (`set_grabbed_style`) stays HELD.

Nothing is committed and nothing is pushed — the correct phrasing for this
round's state is **"changed in the working tree only"**.

---

## Sol round 2 — verdict DOES NOT SURVIVE (2 P2 + 2 P3)

Brief: `.claude/dialkit-2026-08-08/SOL-BRIEF-R2.md`. Raw output (gitignored):
`.claude/dialkit-2026-08-08/agent-output/sol-round2.out`, 5185 lines.

**F1 and F2 drew no fire.** Sol confirmed the x-clamp / y-unbounded asymmetry,
the preset-writes-keyword rule, the normal pointerup path and the production
selector, and re-confirmed the mirror byte-identical. What it found instead is
one real product gap the round-1 work created a surface for, and three test /
comment defects of my own.

**Sol's own environment had no Chromium, and the alignment suite reported
3 tests / 1 pass / 0 fail / 2 SKIPPED there.** That is the F4 fix working
exactly as designed — the skip is visible in the count instead of reading as a
green pass. Recorded here because it is the only independent observation of F4
that exists.

### R2-1 — P2, `browser/raven-grab.js:6484`: token locking omits the easing controls

Sol, verbatim:

> On a token-linked timing-function row, the SVG handles and preset buttons are
> not returned by `styleValueControlsInEditor()`. Dragging a handle therefore
> previews a raw curve; pointerup reaches `commit()`, which returns at line 7120
> because the row remains linked, leaving changed inline CSS with no matching
> `styleEdits` entry. Correct behavior: handles and presets must be inert while
> linked, or their handlers must refuse before previewing.

**Confirmed real by reading the code, not by agreeing with the report.**
`isStyleValueControl` (6464-6476) matches `data-style-input`,
`data-color-suggestion`, and the classes `raven-grab-style-input|select|unit|
format` / `raven-grab-color-input|suggestion`. `.raven-grab-easing-handle` and
`.raven-grab-easing-preset` carry none of those, so `styleValueControlsInEditor`
never returns them and `setStyleEditorTokenLinked(editor, true)` never disables
them. `setEasingFromPointer` ends with `previewed = previewValue(input.value)`,
and `commit()` returns early at `data-token-linked === "true"`. Output
disagreeing with state — the class this file's landmines already document twice.

In scope: a defect in the editor this round shipped, not an adjacent problem.

### R2-2 — P2, `test/grab-overlay-voice-alignment.test.mjs:317`: the enumeration heuristic has a false negative

The source test asserts each `voiceButtonMarkup(` call site sits within 200
characters after one of three covered container openers, via
`COVERED.some((opener) => before.includes(opener))`. That only proves the opener
appears SOMEWHERE in the preceding window — Sol produced a counterexample where
an unrelated `<span>` opener earlier in the same label satisfies it while the
mic itself sits in an uncovered `<div>`. The test would go green on exactly the
misalignment it exists to catch.

### R2-3 — P3, same file:117: the probe self-check is a tautology

`if (!chromiumAvailable) skip; else assert.equal(chromiumProbeError, null)` —
the two branches are mutually exclusive by construction, so the assertion can
never fail. It measures nothing.

### R2-4 — P3, `test/grab-overlay-easing-control.test.mjs:39`: E1/E6 mis-stated

The header says E1 and E6 share a radius of 9 because they are ONE mechanism.
They are two mechanisms with one observable — the same shape the alignment
header's A1/A2 note already states correctly. Wording defect, not a coverage
defect, and it is the kind of claim that decays into a licence to delete one of
the two clauses later.

## Round-2 dispositions — all four fixed, each proven falsifiable

### R2-1 (P2, PRODUCT) — fixed with two deliberately separate mechanisms

Confirmed by reading the code rather than trusting the report:
`setStyleEditorTokenLinked` disables everything `styleValueControlsInEditor`
returns, and the easing SVG handles were in neither list. A drag on a
token-linked row previewed a curve onto the element and then committed NOTHING,
because `commit()` returns early while linked — inline CSS moved with no
`styleEdits` entry behind it, which is the output-disagrees-with-state shape
this repo has already paid for twice.

Two mechanisms, because the platform gives the two control types different
levers, and this is NOT two guards over one rule:

- the preset **`<button>`s** join `isStyleValueControl` (`.raven-grab-easing-preset`),
  so the shared lock disables them natively;
- the SVG **handles** refuse in their own `pointerdown`, because `disabled` is
  meaningless on an SVG element — and `className` on one is an
  `SVGAnimatedString`, so they cannot even be matched by class in the shared
  list.

The row still RENDERS the curve. That is the point: the curve is worth seeing
on a linked row, only its authoring is refused. The editor is already at
`opacity: .45` while linked, so a silent return matches what the disabled
sibling controls do.

The test asserts three preconditions before it drags anything — control is
`easing`, two handles exist, `data-token-linked === "true"` — so a refusal can
never be confused with an editor that simply never opened. The fixture needed a
real DESIGN.md token whose path (`motion.easing.standard`) produces the CSS
variable the fixture's `:root` declares, or the row is not linked at all and the
test measures nothing.

**Easing matrix v4 — 15 mutants, 15 killed, 0 survived.** E1→10, E2→3,
E3→1(parser), E4→1, E5→1(parser), E6→10, E7→1, E8→5, E9→1(parser), E10→13,
E11→1, E12→2, E13→1, **E14→1, E15→1**. E14 and E15 both redden the single
token-lock test; the presets assertion runs before the drag assertions and
`assert` aborts at the first failure, so which mechanism broke is read off the
assertion MESSAGE, never off the radius.

### R2-2 (P2, TEST) — fixed, and the sharper measurement is what justifies it

Sol was right: presence is not enclosure. The rule is a tag-depth walk now —
from the nearest covered opener to the mic, the depth must return to zero
without ever going negative. Zero-and-never-negative is two failures, not one:
`depth > 0` means the mic is nested deeper than the shared rule reaches,
`depth < 0` means the container closed and the mic is outside it (Sol's case).
The walk exists rather than a cruder "no `<` between them" test because the
Instructions heading legitimately carries a complete `<h2>…</h2>` before its mic.

Two standing mutants encode it, and the PAIR is what makes the cost legible —
each measured under both the old rule and the new one:

| mutant | row | old presence rule | new depth walk |
|---|---|---|---|
| A7 | feedback mic, **rendered** | enumeration GREEN, geometry red | both red |
| A8 | template mic, **not rendered** | **whole suite GREEN, 2 pass** | enumeration red |

A7 alone understates the defect — the browser test happens to reach that row.
A8 is the load-bearing one: a real misalignment in a container no browser test
can render, where the enumeration test is the only guard there is, and the old
rule let it through with nothing red anywhere.

**Align matrix v3 — 8 mutants, 8 killed, 0 survived.** A1→1, A2→1, A3→1, A4→1
(`browser/raven-grab.js:8518`), A5→1 (`:8552`), A6→2, A7→2, A8→1 (`:8552`).
A4/A5's reported lines moved by +30 from the v2 header because the R2-1 product
edits sit above them — a header line number is a claim that decays like any
other.

### R2-3 (P3) — the vacuous probe test DELETED, not repaired

Its two branches are mutually exclusive by construction, so it read as a guard
while measuring nothing. Availability is a module-level gate and its observable
is the SKIP COUNT plus the reason carried in each skip message — not a test of
its own, so the probe's error now travels in the skip message. The probe was
also WIDENED to walk the whole path the real test takes before touching product
code (launch → `newPage` → `goto` → close): a launch-only probe answers a
narrower question, and a chromium that starts but cannot open a page would
satisfy it and then fail the real test, which the suite would report as a
product defect.

The harness caught its own stale shape here — its hardcoded `pass + fail !== 3`
guard fired the moment the file went to 2 tests, which is the fail-closed
behaviour earning its keep.

### R2-4 (P3) — the E1/E6 claim corrected in place

Rewritten as TWO mechanisms with ONE observable, matching the alignment header's
A1/A2 wording. Classification and the compound-value count are independently
reachable — a single-value bezier row is classified without consulting the
count, a comma-separated list is counted without the branch mattering — but both
end at the plain-text control, where every widget test loses its subject. The
old wording was a licence to delete one of the two clauses later.

### Test-count arithmetic — read the parts, not the number

+1 (the new token-lock test) −1 (the deleted probe test) = **no net change**.
This is exactly the coincidence CLAUDE.md warns about: an unchanged number is
not proof that nothing moved.

## Round-3 dispositions — three findings, all real, all fixed

Sol round 3 verdict: **DOES NOT SURVIVE**, three findings. Every one was verified
against the code before being accepted; none was taken on the report alone. Sol
could not replay the radii — Chromium cannot launch in its sandbox
(`MachPortRendezvousServer … Permission denied (1100)`) — and its harnesses
correctly refused to grade rather than reporting zero red. Its cross-checks that
did run passed: mirror parity, A4/A5 at 8518/8552, all 15/8 anchors unique.

### R3-3 (P3) — my round-2 fix replaced a wrong claim with a differently wrong one

Round 2 said E1/E6 were "one mechanism". Correcting it, I wrote "TWO mechanisms
with ONE observable … independently reachable". That is also false, and reading
the code settles it: `timingFunctionCount` has exactly **one** call site —
`browser/raven-grab.js:5259`, inside `parseEasingValue` — and
`classifyStyleControl`'s easing branch always calls `parseEasingValue`. No input
reaches the count without going through classification. They are two mutation
SITES on ONE path.

The paragraph now says that, and says the A1/A2 comparison it drew was wrong too
(those genuinely are separate mechanisms). Getting the same relationship wrong in
two consecutive rounds is why the rule is now written into the header: **a radius
says how many tests a mutation reddens and nothing about how the code is wired.
Read the call sites.**

### R3-1 (P2) — the depth walk was reading JavaScript as HTML

Sol's two counterexamples, both real, pulling opposite ways:

| shape | pre-fix | why |
|---|---|---|
| uncovered mic preceded by `/* class="raven-grab-field"><span> */` | **passes** | a comment handed the walk an opener |
| covered mic preceded by `<!-- <em> -->` | **fails** | a tag inside an HTML comment counted as an opener |

Fixed by scanning the file **once from the top** — a 200-char window cannot know
whether it began inside a string literal — into two offset-preserving views:
`code` (JS comments blanked; mic call sites are found here, so a commented-out
call is not a site) and `markup` (only string-literal contents, HTML comments
inside them blanked; the depth walk runs here). Blanked characters become spaces
and newlines are preserved, so one index means the same thing in all three
strings.

**The first version of that scanner was wrong and the suite said so immediately.**
It had no regex-literal handling and desynced on `browser/raven-grab.js:2968` —
`.replace(/"/g, '\\"')`, where the quote inside the regex opened a string that ran
for thousands of characters and inverted every verdict below it. Two real mic
sites read as uncovered; baseline went red. I found the cause by looking for the
signature rather than by guessing: a `'` or `"` literal **cannot** contain a raw
newline in JavaScript, so a span that does is proof the lexer lost the thread.
That is now an assertion in the file, not a comment — it turns a desync from two
mysteriously-uncovered mics into a named line number.

### R3-2 (P3) — widening the probe without widening the classification

Round 2 widened the Chromium probe from launch-only to launch → newPage → goto →
close. `skipIfNoBrowser`'s regex stayed launch-only. So a probe dying at `newPage`
set `chromiumAvailable = false` and then every test reported the identical
environment failure as a **product** defect — worse than not widening the probe at
all. The regex is gone: `!chromiumAvailable` was always the whole gate (if the
probe came up, nothing can skip whatever the error says; if it did not, no test in
this file can be meaningful). Stated in the comment as **not independently
falsifiable** on a machine where chromium works — reverting it only changes
behaviour in a state this suite cannot construct.

### Matrix v5 — and the first CONTROLS in this suite

A red-only matrix is structurally blind to a **false fail**, which is how a noisy
gate gets muted. The harness now takes `expect: 'green'`.

| mutant | today | pre-fix |
|---|---|---|
| A9 uncovered mic masked by a JS comment carrying a covered opener | radius 1 | **fail=0 — whole suite green on a real misalignment** |
| A10 CONTROL covered mic preceded by `<!-- <em> -->` | 0 red ✓ | **fail=1 — correct row reported as a defect** |
| A11 CONTROL quote-bearing regex ahead of a mic | 0 red ✓ | n/a — see below |

Measured: **9 mutants, 9 killed, 0 survived; 2 controls, 0 false-failed.**

A11 is deliberately labelled as carrying less weight than it looks like it does.
It does **not** prove the regex branch — the pristine overlay does that: remove
the branch and the real file goes red with no mutant involved (measured, 1 pass /
1 fail, desync invariant naming the line). A11 is the forward guard for the *next*
quote-bearing regex that lands near a row.

### Two watcher failures this round, both mine, both stated rather than buried

1. `pgrep -f "gpt-5.6-sol"` matched **my own polling shell**, whose command line
   contained the literal string — so "STILL RUNNING" was partly self-referential.
   Wait on a PID, not a pattern.
2. I read `wc -c` out of background task files whose `sleep` had not fired, got
   the same byte count twice, and concluded Sol had been silent for 15 minutes
   when it had run ~2 (`date` moved 16s between the two checks). File mtime
   against `date` is the honest signal.

Both are the same shape as the rule already in CLAUDE.md: a check whose failure
mode is indistinguishable from its success mode is not a check.

### Not fixed, named as debt

`test/capture.test.mjs:293` carries the identical tautology Sol flagged as R2-3 —
a probe self-check whose skip branch and assert branch are mutually exclusive by
construction. Different file, outside the asked scope.

## Round-3 verification — measured, not asserted

All four numbers below were read from files, not inferred from a green-looking step.

**Alignment matrix v5** (`.claude/dialkit-2026-08-08/align-mutants.mjs`):

```
preflight ok: 11 anchors unique, all mutations change the file
baseline: 2 pass / 0 fail
radii — A1=1 A2=1 A3=1 A4=1 A5=1 A6=2 A7=2 A8=1 A9=1
A10 control expects 0 red, saw 0  ok
A11 control expects 0 red, saw 0  ok
matrix: 9 mutants, 9 killed, 0 survived; 2 control(s), 0 false-failed
EXIT=0
```

**Easing matrix v5** (`.claude/dialkit-2026-08-08/easing-mutants.mjs`):

```
preflight ok: 15 anchors unique, all mutations change the file
baseline parser: 285 pass / 0 fail
baseline widget:  12 pass / 0 fail
matrix: 15 mutants, 15 killed, 0 survived
EXIT=0
```

The radii printed in array order as `10, 3, 1, 1, 1, 10, 1, 5, 1, 1, 2, 1, 1, 1, 13`,
which does NOT read left-to-right as E1…E15 — E10 sits last in the MUTANTS array.
I did not accept the multiset matching the header as proof; I re-read the labelled
lines and paired each name with its own radius:

| E1 10 | E2 3 | E3 1 | E4 1 | E5 1 | E6 10 | E7 1 | E8 5 | E9 1 | E11 1 | E12 2 | E13 1 | E14 1 | E15 1 | E10 13 |

That is the header's table exactly, per label. **No radius moved in round 3** — which
is the expected result, since round 3 changed a test-side scanner and a skip gate and
touched no product code. A matching multiset would have been consistent with two
mutants having swapped radii; only the per-label read rules that out.

**Full suite** (`RAVEN_NO_USAGE_LOG=1 npm test`, exit code written INTO the file):

```
ℹ tests 1481   ℹ pass 1478   ℹ fail 0   ℹ cancelled 0   ℹ skipped 3
EXIT=0
```

Unchanged from the pre-round figure, and that is correct rather than lucky: round 3
added no test and deleted none. The desync invariant is an `assert.deepEqual` INSIDE
the existing enumeration test, so it can turn that test red without moving the count.
Read the parts, never the total — a non-delta is no more evidence that nothing changed
than a delta is evidence that coverage grew.

**Mirror:** `cmp browser/raven-grab.js web/public/raven-grab.js` → identical.

### Ledger edits that landed

`CLAUDE.md` line 5 — the E1/E6 claim was replaced rather than patched. It had been
wrong twice in opposite directions (round 2: "one mechanism"; the round-2 correction:
"two mechanisms, independently reachable"), and the replacement states the call-site
evidence and the general rule: *a radius says how many tests a mutation reddens and
nothing whatsoever about how the code is wired; read the call sites.* The alignment
landmine gained a round-3 paragraph covering the two-view scanner, the regex desync at
~2968 found by its signature, the invariant assertion, `widening a probe without
widening its classification is worse than not widening it`, and matrix v5 with its
first two controls.

### State

Working tree only. Nothing committed, nothing pushed, no release, no endpoint change.
Sol round 4 is out against `.claude/dialkit-2026-08-08/SOL-BRIEF-R4.md`, attacking the
round-3 FIXES with no credit carried over — a round-2 fix already introduced a fresh
false claim that round 3 caught, so the fixes are new claims, not settled ones.

## Round-4 dispositions — seven findings, all real, all fixed

Sol round 4 returned **DOES NOT SURVIVE**: 6 P2 + 1 P3. Every one verified against
the code before acceptance, and the three lexer findings were verified by
MEASUREMENT — built as mutants and confirmed to survive the pre-fix scanner.

### The three lexer holes (R4-1, R4-2, R4-3)

One finding in three doors. The round-3 scanner was an incomplete JavaScript
lexer, and every gap failed toward FALSE-COVERED, silently: quoted text became
fake markup (or real markup went missing), the fake opener beat the real one at
`lastIndexOf` purely by sitting AFTER it, and the newline invariant never fired
because the quotes balanced on one line.

| mutant | construct | pre-fix | post-fix |
|---|---|---|---|
| A12 | regex after a control-header `)` | **fail=0, survived** | radius 1 |
| A13 | JS comment inside `${…}` | **fail=0, survived** | radius 1 |
| A14 | real `</span>` written `\x3c/span>` | **fail=0, survived** | radius 1 |

All three sit on rows the browser test cannot render, so pre-fix the WHOLE SUITE
was green on a real misalignment. That is the A8 measurement repeated — and it is
the only shape that shows what the defect costs.

Three fixes, none subsuming another:

- **`)` gets a paren stack.** A `)` ending a control header and a `)` ending an
  expression are identical where they sit; only the matching `(` separates them.
  So `)` is deliberately NOT another character in `REGEX_PRECEDERS`.
- **`${…}` is lexed as code.** An interpolation body is JavaScript, and the
  overlay genuinely uses one (`browser/raven-grab.js:10567`).
- **Escapes are decoded, not stripped of their backslash.** `\x3c` has to be able
  to produce a `<`. Decoded characters are placed at the escape's LAST index with
  the rest blanked, so one source index still means one view index; an astral
  code point collapses to a space, because a view slot holding two characters
  shifts every offset below it.

**A13 was caught grading the wrong guard.** Its first version sat at the
Instructions site and came back radius 1 — and the red was the GEOMETRY test
(`panel/data-instruction: no label row or section heading above the voice slot`).
The enumeration walk was fooled exactly as Sol said; the browser happened to
render that row and covered for it. Moved to the template-note row. This is the
A7-vs-A8 trap one round later: **a counterexample against the source rule has to
live where no browser test can reach, or its radius grades a different test.**
Read the failure message, never the count.

Also added: the desync invariant now strips line continuations (`\` + newline is
legal inside a `'`/`"` literal) before checking, or it would report a desync on
correct source — the one direction that gets an assertion muted.

### R4-4 — the probe answered a narrower question than the tests ask

Sol RAN the suite and hit it live: chromium came up healthy, and the geometry test
then died on `listen EPERM 127.0.0.1` under its sandbox — **1 failure / 0 skips,
an environment reported as a product defect**, which is the exact failure the
probe exists to prevent. `withOverlay` binds a loopback server; the probe walked
launch → newPage → goto → close and never touched a socket. It binds one now.
The rule is that a probe covers every environmental prerequisite the tests use,
not just the most obvious one — which is the same lesson as round 3's "widening a
probe without widening its classification is worse than not widening it", one
prerequisite over.

### R4-5 — `process.exit(0)` suppressed a test that needs no browser

The source-enumeration test reads `browser/raven-grab.js` and nothing else: no
browser, no server, no `dist/`. It is also the ONLY guard on the two mics in
template-mode rows. A missing playwright killed it. Removed; the `dist/grab-bridge.js`
import moved inside `withOverlay` for the same reason, since an unbuilt tree
would otherwise take it down one import further along. Measured with the browser
forced unavailable (`PLAYWRIGHT_BROWSERS_PATH=/nonexistent`): **2 tests, 1 pass,
1 skipped, exit 0** — the source guard runs, the browser test skips.

The playwright-import-missing branch itself is not independently falsifiable
in-suite (this file cannot make its own import fail) and the comment says so
rather than implying a guard.

### R4-6 — a summary is not a verdict

The harness parsed `pass/fail/cancelled/skipped` and never looked at `spawnSync`
status, signal or error. `node --test` can print `fail 0` and still exit nonzero —
a post-summary crash, an unhandled rejection, a timeout kill — and that graded as
green. Worst for a CONTROL, whose entire job is to prove the suite stayed clean.
Status and summary must now AGREE, and a signal-killed run is never graded.

### R4-7 — the ledger decayed exactly as it warns

`CLAUDE.md` line 5 still said "8 alignment mutants" a full round after the
landmine paragraph below it was updated to 9. Nothing checks that; a Sol pass
caught it. Fixed to 12 mutants + 2 controls, with the miss recorded in place.

### Round-4 verification

```
align matrix v6: preflight ok 14 anchors unique
                 baseline 2 pass / 0 fail, exit 0
                 A1..A9 = 1,1,1,1,1,2,2,1,1   A12,A13,A14 = 1,1,1
                 A10, A11 controls: 0 red  ok
                 12 mutants, 12 killed, 0 survived; 2 controls, 0 false-failed
full suite:      1481 / 1478 / 0 / 3, EXIT=0   (unchanged — no test added or deleted)
browser-absent:  2 tests / 1 pass / 1 skipped, EXIT=0
mirror:          browser/raven-grab.js == web/public/raven-grab.js
product code:    untouched in rounds 3 and 4 (overlay mtime 10:59, test file 11:51)
```

No v5 radius moved, which is the expected result rather than a happy one: round 4
changed a test-side lexer and two gates and touched no product code.

---

## Sol round 5 — DOES NOT SURVIVE (4 × P2), all four fixed

Brief: `.claude/dialkit-2026-08-08/SOL-BRIEF-R5.md`.
Raw verdict: `.claude/dialkit-2026-08-08/agent-output/SOL-R5.out` (5213 lines).

Round 5 attacked round 4's fixes, and — as in rounds 2, 3 and 4 — found a fresh
false claim introduced by the previous round's fix. No credit carries over.

### The four findings

| # | Site | Claim |
|---|---|---|
| R5-1 | `:471` | every JS string is treated as rendered markup; a syntax-valid, NEVER-RENDERED decoy string containing a covered opener false-covers an uncovered mic |
| R5-2 | `:500` | `CONTROL_HEAD` reads only 24 raw characters, so `if /* …>24 chars… */ (x)` loses its control classification |
| R5-3 | `:518` | `opensRegex` skips spaces and tabs but not comments, so `if (x) /* g */ /re/` never reaches the `)` and never consults `lastCloseWasControl` |
| R5-4 | `:219` | the probe does not protect the real setup path: `withOverlay` still runs when the probe fails, and its `listen` promise has no error listener |

### Verified by MEASUREMENT before accepting, not by reading

Three counterexamples built as mutants A15/A16/A17, all anchored on the
**per-template note row at `browser/raven-grab.js:8552`** — deliberately a row
the browser test structurally cannot render, so the radius grades the
enumeration test rather than the geometry test. That is the A7-vs-A8 trap, and
this is the third round it has had to be honoured explicitly.

```
align-r5-prefix.out
  A15 an unrendered decoy string carrying a covered opener      radius 0  *** SURVIVED ***
  A16 a comment longer than the control-header lookback …       radius 0  *** SURVIVED ***
  A17 a comment between the control-header ) and the / …        radius 0  *** SURVIVED ***
  matrix: 15 mutants, 12 killed, 3 survived; 2 control(s), 0 false-failed   EXIT=2
```

Radius 0 means the WHOLE SUITE passed green on a real misalignment. A1–A14 all
held their v6 radii in that same pre-fix run, so the three survivals are the
finding and not a broken harness.

R5-4 was verified by reading instead: the skip sat in the geometry test's
`catch` (`48:  } catch (err)` / `49:    if (skipIfNoBrowser(t, err)) return;`),
and `upstream.listen` had no `'error'` listener. An emitted `'error'` with
nothing listening throws from the event loop — **outside** any surrounding
try/catch — so it can never be classified. Sol replayed exactly that under a
sandbox: 1 pass / 1 fail / 0 skipped on `listen EPERM 127.0.0.1`.

### The fixes, and why R5-1's is a reframing rather than a patch

**R5-2/R5-3 — token-based lookbehinds.** `CONTROL_HEAD` (a 24-char regex over
the RAW source) became a `CONTROL_WORDS` Set plus `prevSignificant(at, skipNewlines)`
and `wordEndingAt(k)`, both reading `code` — the view where every comment above
the cursor is already blanked to spaces, so "the previous significant character"
collapses to an ordinary whitespace skip. Reading a WHOLE identifier rather than
a fixed window is what makes it token-based: the old regex could be defeated by
distance alone, and the word read gives the `notif (` exclusion for free.

**R5-1 — the third view.** Rounds 3 and 4 each fixed one way the scanner could
read JavaScript as markup. A15 has no lexer error in it at all: the scan is
correct and the verdict is still wrong, because `lastIndexOf` takes the LAST
covered opener in the window and the decoy sits after the real one.

The honest reading is that **"the walk reads markup, not JavaScript" was never
the property**. A string is not markup either — it becomes markup when something
concatenates it into the output. So `scanSource` now returns a third view,
`glue` (= `code` with every string interior, quote, escape run, `${`, and
in-string HTML comment blanked), and `enclosedByCovered(before, windowStart, micAt)`
requires `/^[\s+]*$/` over the glue between anchor and mic.

A decoy cannot help whichever side of it the anchor sits on: as the anchor, its
own `String(…).slice(0, 0)` wrapper is in the glue and the opener is rejected;
as an obstacle, that same wrapper sits between the REAL opener and the mic and
rejects that one too. Both rejected → uncovered, the correct verdict.

Checking only `lastIndexOf` is **sufficient, not a shortcut**: an earlier
occurrence's glue region is a superset of a later one's, so if the later fails
the earlier fails too.

Accepted conservatism, written into the code rather than discovered later: a
future site putting a real call between container and mic —
`'…<span>' + escapeHtml(label) + voiceButtonMarkup(…)` — fails RED here, and it
should. Nothing in this scan can tell whether that call emits a `</span>`. All
eight of today's sites are pure concatenation; that was checked by hand against
each before the rule was written.

Sol's two suggested alternatives were both refused with reasons: "track actual
HTML-producing expressions" needs dataflow analysis a test cannot do, and
"render the template rows" needs a fixed-position element with a pending move
plus a built template with an expanded layer — a cost this suite's header
already documents refusing.

**R5-4 — two changes, and the placement IS the fix.** `upstream.listen` gained
`upstream.once('error', reject)`, and the skip moved from the geometry test's
`catch` to its first line. A gate that only runs once setup has succeeded is not
a gate: round 4's version meant a server, a session and a browser had all booted
before anything asked whether chromium existed, and one of those steps fails in
a way the catch never sees. `skipIfNoBrowser` also lost its second parameter —
`!chromiumAvailable` is the whole condition, and the message regex beside it was
a hole rather than a guard (Sol round 3, P3).

### Attribution measured in TWO stages, not read off the final matrix

The lexer fix was applied alone and re-measured before the glue check existed:

```
align-r5-lexeronly.out
  matrix: 15 mutants, 14 killed, 1 survived    (A16, A17 killed; A15 still surviving)
```

That is what proves the lexer fix owns A16/A17 and the glue check owns A15. The
glue check would have killed all three, and a single final run could not have
told those apart.

### Round-5 verification

```
align matrix v7: preflight ok 17 anchors unique, all mutations change the file
                 baseline 2 pass / 0 fail, exit 0
                 A1,A2,A3 = 1   A4 = 1 @:8518   A5 = 1 @:8552   A6 = 2   A7 = 2
                 A8,A9,A12,A13,A14 = 1 @:8552   A15,A16,A17 = 1 @:8552
                 A10, A11 controls: 0 red  ok
                 15 mutants, 15 killed, 0 survived; 2 controls, 0 false-failed  EXIT=0
full suite:      1481 / 1478 / 0 / 3, EXIT=0   (unchanged — no test added or deleted)
browser-absent:  PLAYWRIGHT_BROWSERS_PATH=/nonexistent
                 2 tests / 1 pass / 1 skipped / 0 fail, EXIT=0
                 skip message carries the probe error, so the two environments stay legible
mirror:          browser/raven-grab.js == web/public/raven-grab.js  (cmp clean)
product code:    untouched in rounds 3, 4 and 5 — every fix is test-side
```

**No v6 radius moved in v7 — and unlike round 4, that was not a foregone
conclusion.** Round 5 rewrote the scanner's lookbehinds AND changed the
enclosure rule itself, so a moved radius was a live possibility; the whole
matrix was re-measured rather than carried forward, which is the standing rule
earning its keep for the second time in this file (the round-3 stale
find-string was the first).

### State

Working tree only. Nothing committed, nothing pushed, no release, no endpoint
change. Next: round-6 Sol brief attacking the round-5 fixes — the glue view's
own lexing dependence, the concatenation rule's false-positive surface, the
token lookbehinds, and the relocated gate.

---

## Round 6 — Sol adverse pass on the round-5 fixes

Brief: `.claude/dialkit-2026-08-08/SOL-BRIEF-R6.md`. Raw output:
`.claude/dialkit-2026-08-08/agent-output/SOL-R6.out` (3097 lines, gitignored).

**VERDICT: DOES NOT SURVIVE — 4 × P1 + 1 × P2.** Three of the four P1s are
defects in round 5's own fixes, which is the fifth consecutive round where the
previous round's fix introduced the next round's finding. All five confirmed by
reading the code before any edit, and all five fixed.

### R6-1 (P1) — call-site enumeration was not lexical

`/voiceButtonMarkup\(/g` ran on `view.code`, which blanks JS comments but
RETAINS string contents. So the enumeration — the half of the test that decides
what even gets examined — was the one consumer still reading text that may never
be code. Measured both directions:

- behaviour-neutral literal text `"voiceButtonMarkup("` inside a string →
  **9 sites**, count assertion red on correct code (a FALSE FAIL)
- a real template-only mic written `voiceButtonMarkup /* gap */ (…)` →
  **8 sites / 0 uncovered**, whole suite **2 pass / 0 fail** on an uncovered mic

The second is the serious one: the site is invisible to BOTH assertions, so the
only guard on the two template-mode mics silently stops covering a third.

Fix: the scan runs on `glue` and matches the bare identifier, then walks
forward over whitespace to require `(`. Identifier boundaries are checked on
both sides (so `xvoiceButtonMarkup` and `voiceButtonMarkupFoo` are not sites),
and `identBefore` skips the declaration by rejecting a preceding `function`
token. A `/* gap */` between the name and its paren is blanked in `glue`, so the
whitespace walk crosses it; a comment CANNOT hide a call site any more.

### R6-2 (P1) — the `lastIndexOf` sufficiency claim was false

Round 5's comment argued that checking only the LAST occurrence of each opener
is sufficient because "an earlier occurrence's glue region is a superset of the
later one's". That is true of the GLUE predicate and **says nothing about the
DEPTH WALK that runs after it**. Sol's construct:

```js
'<label class="raven-grab-field"><span>class="raven-grab-field"><span></span>' + voiceButtonMarkup(…)
```

The first occurrence is a real opener and correctly encloses the mic. The second
is rendered TEXT inside the label — it opens a `<span>` and closes it, so it is
balanced to depth zero, `lastIndexOf` selects it, the walk then sees the trailing
`</span>` as negative depth and rejects the row. Measured: **8 sites, `:8552`
falsely uncovered → 1 pass / 1 fail** on a correctly built row.

Fix: **enclosure is EXISTENTIAL, so the rule is too.** There is no single
correct anchor — the same lesson the private-path gate spent four rounds
learning (round 19 there: leftmost, innermost and both end-based discriminators
were each a bet on one reading, each refuted). Every occurrence of every opener
is tried and the row passes if ANY of them satisfies both the glue predicate and
the depth walk. That is not a weakening: a candidate only passes if it really
does leave a covered container open at the mic. `balancedToDepthZero` was
extracted so the two halves are separately readable.

### R6-3 (P1) — `glue` rejects provably safe concatenation

`'…<span>' + ('') + voiceButtonMarkup(…)` emits byte-identical HTML and measured
**8 sites, `:8552` falsely uncovered → 1 pass / 1 fail**. Round 5's comment
justified the conservatism as "nothing in this scan can tell whether that call
emits a `</span>`", which is the right answer for a function call and the wrong
description of what is happening: **it is not that a function's output is
unknowable — it is that this scan does not EVALUATE expressions at all.**

Disposition: ACCEPTED, with the reasoning corrected in place rather than the
rule widened. Admitting `('')` immediately raises `(cond ? a : b)`, and the step
after that is dataflow analysis a test cannot do. The cost is bounded because it
is LEGIBLE, so the mitigation is the failure MESSAGE: it now names both
possibilities — the mic really is outside a covered container, or it is joined
to one by something other than plain `+` concatenation of literal fragments —
and tells the reader to concatenate the fragments directly rather than widen the
rule. A false red that explains itself is a different thing from one that does
not.

### R6-4 (P1) — line continuations misaligned `markup` with runtime output

Round 5's escape decoder placed every escape's decoded character into `markup`.
A **LineContinuation** — `\` immediately before a line terminator — emits
NOTHING: JavaScript removes both characters. Decoding it to a newline meant:

```js
'…<\
em style="display:block;width:100px">' + voiceButtonMarkup(…)
```

renders a real, wide `<em>` wrapper at runtime while the scanner sees
`<\nem…>` — and its tag regex requires a letter DIRECTLY after `<`, so it misses
the tag entirely. Measured **8 sites / 0 uncovered → 2 pass / 0 fail** on a mic
inside an uncovered wrapper.

First attempt: an `emits` flag on the decode branch. LF, U+2028, U+2029 and CR
all emit nothing; `\r\n` is ONE terminator and consumes three characters. The
desync invariant already exempted line continuations
(`s.text.replace(/\\\r?\n/g, '')`), so it needed no change.

**That attempt was measured and it was not a fix.** Building the mutant is what
caught it: the views are OFFSET-PRESERVING, so a non-emitting escape cannot be
removed, only blanked — and `<` followed by two blanks followed by `em` defeats
the tag regex exactly as `<\nem` did. Measured against the round-6 code with the
flag in place and nothing else, A21 came back **2 pass / 0 fail — SURVIVED**.
This is the file's own recurring lesson landing on me rather than on Sol: an
edit that addresses the described symptom is not a fix until a mutant says so.

Real fix: `scanSource` now also returns `content`, a byte per source position
marking the ones that actually CONTRIBUTE A CHARACTER to the rendered string,
and the enclosure walk runs over `emittedWindow(a, b)` — the emitted characters
only, with a map back to source offsets so the glue check can still be applied.
Padding is absent rather than blank, so `'…<\<LF>em …>'`, `'<' + 'em>'` and
`'<\x65m>'` all present the walk with the `<em>` a browser would render. The
last two are a hole Sol did not name and the same class; fusing fragments is
safe here precisely because the glue predicate already requires the anchor-to-mic
region to be nothing but concatenation.

Attribution measured in two stages, and the answer is a genuine CONJUNCTION:

```
compression off, `emits` on        A21 SURVIVES   2 pass / 0 fail
compression on,  `emits` forced    A21 SURVIVES   2 pass / 0 fail
both                               A21 KILLED     radius 1 @ :8553
```

Neither half kills it. Both comments now say so — this file has twice described
one mechanism as two and once described two as one, so the measurement is
recorded rather than the reasoning.

**Near-miss worth recording as a lesson, not a footnote.** The first draft wrote
U+2028 and U+2029 as literal characters, and they were silently normalised to
ordinary spaces — producing `if (next === '\n' || next === ' ' || next === ' ')`,
which would have made every `\<space>` escape emit nothing and deleted escaped
spaces from the markup view. It was caught by reading the bytes back
(`JSON.stringify` on the line), not by any test; the follow-up `Edit` then
failed with "String to replace not found" because my replacement string was
normalised the same way, so the fix had to route around the editor entirely. The
cookie suite learned this with NBSP and wrote it down; the rule is **write
special characters as escapes, never as literals**, and a comment at the site now
says so.

### R6-5 (P2) — the probe did not cover the path it claimed

Round 5's probe walked listen → launch → newPage → goto → close, and the header
called that "the whole path". `withOverlay` also does `mkdtemp` and `writeFile`.
Sol measured a `mkdtemp` EPERM in its sandbox: sockets and chromium both fine,
temporary writes refused → **1 pass / 1 fail / 0 skipped**, an environment
reported as a product defect. That is precisely the misclassification the probe
exists to prevent, and it is the third time in this file a probe has been found
narrower than the test it gates.

Fix: the probe now also does `mkdtemp` → `writeFile` → `rm`. The lazy
`dist/grab-bridge.js` import and `startGrabSession` are deliberately NOT probed,
and that is the boundary rather than an omission: **they are product code**, and
probing them would make a real bridge defect register as a missing environment
and skip — the same misclassification pointing the other way.

Same finding's second half: round 5 opened the upstream server and then did
three more awaits before entering the try, so a failure in any of them leaked a
listening socket for the rest of the run. All setup moved inside the try;
`session` and `browser` are declared outside so the `finally` tears down only
what actually started.

### State

Working tree only. Nothing committed, nothing pushed, no release, no endpoint
change. Product code still untouched in rounds 3, 4, 5 and 6 — every fix in all
four is test-side.

Post-fix baseline: `node --check` clean, `node --test
test/grab-overlay-voice-alignment.test.mjs` → **2 pass / 0 fail / 0 skipped**,
and the enumeration still finds exactly 8 sites through `glue` (the real risk of
moving the scan onto a more aggressively blanked view).

Next: round-6 mutants, matrix re-run WHOLE → v8 (round 6 edited the enumeration
scan, the enclosure rule, the escape decoder and the probe — every one of those
is a mutant target surface and find-strings may have gone stale), full suite,
mirror, missing-browser path, header, ledger, then a round-7 brief.

### Round 6 verification

```
matrix v8        .claude/dialkit-2026-08-08/agent-output/align-r6-v8.out
                 preflight ok: 21 anchors unique, all mutations change the file
                 baseline 2 pass / 0 fail, exit 0
                 A1,A2,A3 = 1     A4 = 1 @:8518    A5 = 1 @:8552
                 A6 = 2           A7 = 2           A8,A9 = 1 @:8552
                 A10, A11 CONTROLS 0 red  ok
                 A12,A13,A14,A15,A16,A17 = 1 @:8552
                 A18 = 1 (count assertion, 9 !== 8)
                 A19, A20 CONTROLS 0 red  ok
                 A21 = 1 @:8553
                 17 mutants, 17 killed, 0 survived; 4 controls, 0 false-failed
                 EXIT=0
full suite       RAVEN_NO_USAGE_LOG=1 npm test
                 1481 tests / 1478 pass / 0 fail / 3 skipped, EXIT=0  (unchanged)
browser-absent   PLAYWRIGHT_BROWSERS_PATH=/nonexistent
                 2 tests / 1 pass / 1 skipped / 0 fail, node exit 0
                 the widened probe still classifies a missing browser as a skip
mirror           cmp browser/raven-grab.js web/public/raven-grab.js  -> identical
product code     untouched in rounds 3, 4, 5 and 6 — every fix is test-side
```

**No v7 radius moved in v8**, and that was again not a foregone conclusion:
round 6 rewrote the call-site enumeration, the enclosure rule and the escape
decoder, so the whole matrix was re-measured rather than carried forward. The
control count went 2 → 4, deliberately: two of round 6's four findings were
correct code reported as a defect, so the round that found them leaves more of
the matrix pointing in that direction.

The test count is unchanged because every round-6 fix lives inside an existing
test or in the scanner those tests share, and the four new mutants live outside
`npm test` entirely. Read the parts, not the total.

## Round 7 — launched

Brief: `.claude/dialkit-2026-08-08/SOL-BRIEF-R7.md`. Attack surface, named from
round 6's own fixes rather than left for Sol to find: the existential
all-anchors rule's false-POSITIVE surface (round 5 was too narrow — is "any
anchor" now too wide?); `content` correctness at its two write sites; the
`endSrc = map[…] + 1` offset arithmetic when an opener's last emitted character
came from a multi-slot escape; `REACH = 200` now counting SOURCE characters
while the window it feeds is measured in EMITTED ones; `identBefore` against
`new`, `obj.`, `?.(` and a Unicode identifier; the widened probe's remaining
unprobed prerequisites and whether the product-code boundary is drawn right;
and any claim in the v8 header or the round-6 landmine that is now false.

### Pre-checked before Sol returned

Measured directly rather than argued, because REACH is exactly the kind of
tunable the standing rule says to verify by its EFFECT:

```
source distance, covered opener -> mic, all 8 sites
  :2339   11      :8518   13      :8552   13      :10567  57
  :10583  77      :10601  62      :10612  17      :10623  18
max from opener END = 77     max from opener START = 111     REACH = 200
```

The binding metric is the one from opener START, because the window is
`match.index - REACH` and the opener must fall inside it: **111**, leaving 89
characters of headroom. The header comment claims the widest real site
"measures ~95 chars", which is the max in NEITHER metric — 96 is the
`:10601` site measured from its opener's start, so the figure was taken off one
site rather than the widest. Stale by 16 characters and understating the true
maximum. P3, found here rather than by Sol, corrected below.

### Sol round 7 — VERDICT: DOES NOT SURVIVE (5 P1, 2 P2, 1 P3)

Sol's chromium verification was blocked in its own sandbox
(`MachPortRendezvousServer … Permission denied (1100)`), so every counterexample
it gave was a source injection I measured here. All eight dispositioned; seven
fixed, one was a comment correction.

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | P1 | `COVERED[2]` was a bare attribute substring, so free TEXT carrying `class="raven-grab-section-heading"` counted as a container | the three openers are regexes requiring a real element tag; `[^<>]*` cannot cross a `>`, so attribute text has to belong to the tag that opened before it |
| 2 | P1 | `<em></span>` returns a depth COUNTER to zero while a browser closes both and leaves the mic a sibling | `wellNested` keeps a stack; `pop()` on empty yields `undefined`, which never equals a tag name, so the old `depth < 0` case falls out of the same comparison |
| 3 | P1 | the glue check ran from the opener's END, so a decoy fused across a statement boundary passed — only its second half was ever tested | glue is taken from the opener's FIRST emitted character (`map[hit.index]`) |
| 4 | P1 | `<!--` inside a quoted attribute VALUE is ordinary text; blanking it at scan time deleted the rest of a real tag | the drop moved into `emittedWindow`, where the text is linear and `inTag` is answerable |
| 5 | P1 | `voiceButtonMarkup?.(…)` was not a call site at all | token walk: whitespace, an adjacent `?.`, whitespace, then `(` — the adjacency is what keeps `x ? (a) : (b)` out |
| 6 | P2 | `REACH` bounded SOURCE while feeding EMITTED text | `windowStartFor` walks `content` in emitted units; `REACH_SOURCE_CAP` is a cost bound only |
| 7 | P2 | the probe closed its loopback server before launching, so browser→loopback was never verified | it navigates to the live server with an `.ok()` check; the close moved to an outer `finally` so the temp-dir steps cannot leak the socket |
| 8 | P3 | the scanner header described two views, sites found in `code`, walk over `markup` — all three false | rewritten against what the code does: four artefacts (`code`, `glue`, `markup`, `content`), each with the reason it exists |

**#5 was found here before Sol reported it**, by walking the round-6 fix's own
blind spot rather than waiting: a mic written `voiceButtonMarkup?.(…)` in an
uncovered template-mode row left the count at 8, left the mic unexamined, and
the whole suite reported **2 pass / 0 fail** on a real misalignment.

Nothing in `browser/raven-grab.js` changed. **No product code has changed in
rounds 3, 4, 5, 6 or 7** — every fix in all five is test-side.

### Measured after the round-7 fixes

```
matrix v9  22 mutants, 22 killed, 0 survived; 5 controls, 0 false-failed
           (re-run WHOLE — round 7 rewrote the openers, the nesting rule,
            the comment handling and the window bound)
           no v8 radius moved: A6 and A7 are 2, every other mutant is 1
npm test   1481 tests / 1478 pass / 0 fail / 3 skipped, exit 0
mirror     browser/raven-grab.js == web/public/raven-grab.js
no browser 2 tests / 1 pass / 1 skipped, node exit 0
```

REACH is now a measured number in the unit it actually consumes. Emitted
distance from each covered opener's first character to its mic:

```
:2339 54   :8518 47   :8552 47   :10567 94
:10583 114 :10601 97  :10612 51  :10623 52
widest real site 114, REACH 200 -> 86 characters of margin (1.75x)
```

The source figures recorded above this section (max 111) were the right
measurement of the wrong quantity — correct for the round-6 code, which bounded
source, and superseded the moment fix #6 changed the unit.

## Round 8 — Sol falsification (13:14) — `DOES NOT SURVIVE`, 5 × P1 + 1 × P3

Sol's chromium was blocked in its sandbox again (`listen EPERM` on the suite's
own probe, `mkdtemp EPERM` on a direct launch; the pristine target reported
1 pass / 0 fail / 1 skipped), so every counterexample is a SOURCE claim. Each
was replayed here and confirmed. All six dispositioned, all six fixed, all
test-side. **No product code has changed in rounds 3–8.**

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | P1 | `\b` is not an attribute-name boundary: `data-class="raven-grab-field"` satisfies `\bclass="…"`, so an uncovered row wearing that attribute read as covered. `\b` is not a CLASS-token boundary either — `class="raven-grab-field-x"` matched. | The three literal regexes became a `coveredBy(cls, tail)` factory asserting a real `class` attribute (`\sclass="`) and lookaround `(?<![\w-])cls(?![\w-])` inside the value — the question CSS asks. |
| 2 | P1 | `hit[3].trim().endsWith('/')` reads an UNQUOTED attribute value ending in `/` as a self-closing solidus: `<em style=display:block;width:100px data-x=y/>` was treated as void, so the container never opened and the walk balanced. | `selfClosing(attrs)` requires the `/` to be preceded by whitespace or a quote, i.e. a real solidus and not part of a value. The run is deliberately NOT trimmed — `<br / >` is a parse error a browser does not treat as self-closing. Raw-text elements (`script`/`style`/`textarea`/`title`) now skip to their own close tag rather than parsing their contents as markup. |
| 3 | P1 | `emittedWindow`'s `inTag` flipped on any bare `<`/`>`: `1 < 2 <!-- <label class="raven-grab-field"><span> -->` put the scanner "inside a tag", so the HTML comment was NOT dropped and its commented-out opener counted as a container. | A browser opens a tag only when `<` is followed by `[a-zA-Z!/?]`, and a `>` inside a quoted attribute value does not close one. `inTag` now tracks the quote state and the open condition. |
| 4 | P1 | A grouping paren around the callee — `(voiceButtonMarkup)("data-template-note", …)` — emits byte-identical markup and was not a call site at all, so the mic count stayed at 8 and the row went unexamined. | The call-site walk strips balanced grouping parens around the identifier, refusing when the `(` is itself a call/index (preceded by an identifier, `)` or `]`). The window and the `CONCATENATION_ONLY` check anchor at `identStart` (the OUTERMOST paren), not the identifier — anchoring at the identifier would put the stripped `(` inside the glue region and report a correct row RED. |
| 5 | P1+P3 | `REACH_SOURCE_CAP = 20000` was documented as "a cost bound only". It is not: 20,001 characters of dead source between the opener and the mic stopped the backwards walk short of `REACH` emitted characters, and the row was reported UNCOVERED — a red on correct code, and the comment claiming otherwise is false. | `windowStartFor` returns `capped`, and a new assertion fails the test naming every site that hit the cap, with a message saying explicitly that this is NOT a coverage verdict. The comment now says a bound that can change a verdict is a correctness bound whatever its comment says. |
| 6 | P3 | The header said only TWO mics are unrendered by the fixture. Three are: the two template-mode rows (`:8518`, `:8552`) AND the maintainer-only Component notes heading (`:10601`) — the fixture asks for role `consumer`. | Header corrected: eight mics exist, five render (feedback message, Instructions, use case, template name, component name), and the source-enumeration test is the only guard on all three others. |

### Pre-fix vs post-fix — MEASURED, not asserted

A mutation claim is falsifiable exactly like an assertion (round 6's lesson), so
`.claude/dialkit-2026-08-08/r8-prefix-measure.mjs` reverts each round-8 fix
individually in a COPY of the suite (written into `test/` so its relative
`dist/` import still resolves) and runs the mutants that fix owns. It refuses to
grade a run with no summary line or with `skipped !== 0`.

```
pristine suite, pristine overlay: 2 pass / 0 fail
A28 data-class   PRE 2p/0f                        -> POST 1p/1f [mics in a container the shared alignment rule does not cover:]
A29 class list   PRE 1p/1f [mics in a container…] -> POST 2p/0f
A30 unq. slash   PRE 2p/0f                        -> POST 1p/1f [mics in a container…]
A31 bare <       PRE 2p/0f                        -> POST 1p/1f [mics in a container…]
A32 (f)(x)       PRE 1p/1f [the number of mics…]  -> POST 2p/0f
A33 9th (f)(x)   PRE 2p/0f                        -> POST 1p/1f [the number of mics in the overlay changed…]
A34 dead source  PRE 1p/1f [mics in a container…] -> POST 1p/1f [the scan hit REACH_SOURCE_CAP before reading 200 emitted characters at:]
```

A28/A30/A31/A33 each measured **2 pass / 0 fail pre-fix** — the whole suite
green on a real misalignment, which is the P1 direction. A29/A32 measured
**1 pass / 1 fail pre-fix** — red on correct code, which is why they are
CONTROLS rather than kills. **A34 is red both ways and is separated only by its
MESSAGE**, which is the entire finding: the author used to be told the row was
uncovered and is now told the scan ran out of source. Its comment says so, since
its radius cannot separate it.

All seven mutants anchor on the `:8552` template-mode row — a counterexample
against the SOURCE rule must live where no browser test can render it, or its
radius grades the wrong guard (the round-4 A13 trap).

### Measured after the round-8 fixes

```
baseline    2 tests / 2 pass / 0 fail / 0 skipped, EXIT=0
matrix v10  27 mutants, 27 killed, 0 survived; 7 controls, 0 false-failed, EXIT=0
            A28/A30/A31/A33/A34 radius 1 each; A29/A32 controls green
            re-run WHOLE — round 8 rewrote the openers, the void/self-closing
            rule, the tag-state tracking, the call-site walk and the window bound
npm test    1481 tests / 1478 pass / 0 fail / 3 skipped, EXIT=0  (unchanged —
            every fix lives inside the two existing tests or the scanner they
            share, and the new mutants are outside npm test)
mirror      cmp browser/raven-grab.js web/public/raven-grab.js -> MIRROR OK
no browser  2 tests / 1 pass / 0 fail / 1 skipped
product     git diff --stat browser/ web/public/ -> empty
```

## Round 9 — the last round — `DOES NOT SURVIVE`, 5 × P1 + 1 × P2 + 1 × P3

Andrew, while round 9 was in flight: *"Let's stop this after this round comes
back."* So this is the end of the cadence — round 9's findings are dispositioned
and no round 10 is launched. Sol's chromium was sandbox-blocked again
(`MachPortRendezvousServer … Permission denied (1100)`), so every counterexample
is a SOURCE claim; each was replayed here before being believed. Sol edited no
repo file. **No product code changed in rounds 3–9 — every fix in all seven is
test-side.**

**The round's shape, stated once:** round 8 answered a PARSING question with a
better regex. A regex cannot know where one attribute's value ends and the next
attribute begins, so it cannot answer "does this element carry this class" at
all — and it was wrong in BOTH directions at once. Five of round 9's seven
findings are reds on valid HTML, which is why the control count went 7 → 12.

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | P1 | `coveredBy` fooled by attribute TEXT: `title=' class="raven-grab-field"'` on an uncovered row read as covered, and a duplicate `class` matched the second occurrence where the HTML parser keeps the FIRST. In the other direction it rejected `CLASS = "…"`, `class='…'` and `class=…` — all valid HTML — as defects. | The three opener regexes became `parseStartTag()`, a real start-tag tokenizer: attribute names lowercased, whitespace around `=` skipped, quoted and unquoted values read to their real end, first occurrence wins. `hasClass()` then asks the class question of a parsed attribute map. |
| 2 | P1 | `(0, voiceButtonMarkup)(x)` — the standard indirect-call idiom — was not a call site. Round 8 stripped a grouping paren by ADJACENCY, so a comma expression left the count at 8 and the ninth mic unexamined. | The walk finds the MATCHING paren by balance rather than adjacency, which covers `(0, f)(x)`, `((f))(x)` and `(a ? f : g)(x)` alike. Balance is safe to count in `glue`, where string interiors and comments are already blanked. |
| 3 | P1 | `<![CDATA[ <label class="raven-grab-field"><span> ]]>` supplied a fake covered opener. CDATA is real only in FOREIGN content; in HTML it is a BOGUS COMMENT ending at the first `>`, so a browser renders `<span> ]]>` and the mic is uncovered. Round 8 dropped `<!--` and let every other `<!` / `<?` form through. | `emittedWindow` drops a bogus comment to the next `>`, and the tag-open class narrowed to `[a-zA-Z/]` — `!` and `?` are handled above it now, not by it. |
| 4 | P1 | Every CLOSED raw-text element was a false RED. The round-8 skip jumped to the closer WITHOUT pushing, so `<script></script>` between a correct opener and its mic popped an empty stack. `style`, `textarea`, `title` alike. | Push, then jump. The closer only counts when the tag name is followed by whitespace, `/` or `>` — `</scriptx` is text inside the script. |
| 5 | P1 | `REACH_SOURCE_CAP` still rejected correct code. Round 8 answered the same finding by making the stop LOUD; a better error message does not redeem a red on correct code. | The cap is DELETED. Measured against the 20,001-character mutant — exactly the pathological case it was invented for — 3 reps each: 63.1 / 63.5 / 65.2 ms with the cap, 63.3 / 61.2 / 62.8 ms without. The difference is inside the spread. There was no cost to bound; it was inherited reasoning from the quadratic-regex design this walk replaced. |
| 6 | P2 | `r8-prefix-measure.mjs`'s `run()` read only the parsed summary and ignored `out.status`, `out.signal` and `out.error`, so a child that printed a summary and then died was graded as a measurement. | Both harnesses now require the exit status and the summary to AGREE, and reject a killed or unspawnable run. `r9-prefix-measure.mjs` is the live one; r8's is PINNED to the round-8 tree (four of its five anchors no longer resolve) and its header says so. |
| 7 | P3 | Two round-8 claims false: that `coveredBy` "asks the question CSS asks" (a regex cannot), and that single-quoted / unquoted class attributes were an accepted residual "whose failure direction is a red, not a silent green" — both halves wrong, since they are valid HTML and a red on valid HTML is not acceptable. Both appeared in the suite header AND `CLAUDE.md`. | Corrected in place in both, with the reason rather than a softened wording. A41/A42 turn the ex-residual into controls. |

Sol found no contrary evidence for the 27/27 matrix count, the unchanged v9
radii, or the three-unrendered-mic accounting.

### Pre-fix vs post-fix — MEASURED, not asserted

`.claude/dialkit-2026-08-08/r9-prefix-measure.mjs`. A revert reproduces the
round-8 DECISION, not its source text — what is measured is what the old rule
ANSWERED, and transcribing forty lines of deleted code would add its own failure
modes.

```
pristine suite, pristine overlay: 2 pass / 0 fail
A35 attr text    PRE 2p/0f  -> POST 1p/1f  [mics in a container … does not cover]
A36 dup class    PRE 2p/0f  -> POST 1p/1f  [mics in a container … does not cover]
A37 CLASS =      PRE 1p/1f  -> POST 2p/0f
A41 single-quot  PRE 1p/1f  -> POST 2p/0f
A42 unquoted     PRE 1p/1f  -> POST 2p/0f
A38 (0, f)(x)    PRE 2p/0f  -> POST 1p/1f  [the number of mics in the overlay changed]
A39 CDATA        PRE 2p/0f  -> POST 1p/1f  [mics in a container … does not cover]
A40 script       PRE 1p/1f  -> POST 2p/0f
A34 dead source  PRE 1p/1f  -> POST 2p/0f
```

A35/A36/A38/A39 measured **2 pass / 0 fail pre-fix** — the whole suite green on a
real misalignment, the P1 direction. A37/A40/A41/A42/A34 measured **1 pass /
1 fail pre-fix** — red on correct code, which is why they are CONTROLS.

**A34 is the entry worth carrying forward.** It has been graded three ways in
three rounds: a silent stop (round 7), a kill separated only by its assertion
message (round 8), and finally a CONTROL — because it was correct code the whole
time and both reds were wrong. **A mutant that is red before AND after a fix is
not automatically evidence the fix worked; ask first whether the mutant is
correct code.**

### Measured after the round-9 fixes

```
baseline    2 tests / 2 pass / 0 fail / 0 skipped, EXIT=0 (source test 44.8ms)
matrix v11  30 mutants, 30 killed, 0 survived; 12 controls, 0 false-failed, EXIT=0
            A35/A36/A38/A39 radius 1 each; A34/A37/A40/A41/A42 controls green
            re-run WHOLE — round 9 replaced the openers with a tokenizer, made
            the raw-text skip push, added bogus-comment handling, rewrote the
            grouping strip as a balance scan and deleted the source cap
            no v10 radius moved; A34's change is a RECLASSIFICATION, not a radius
r9-prefix   all nine claims measured, EXIT=0 (table above)
cap cost    3 reps each on the 20,001-char mutant: 63.1/63.5/65.2 ms with the
            cap, 63.3/61.2/62.8 ms without — inside the spread
npm test    1481 tests / 1478 pass / 0 fail / 3 skipped, EXIT=0 (unchanged; every
            fix lives inside the two existing tests or the scanner they share,
            and the eight new mutants run outside npm test)
mirror      cmp browser/raven-grab.js web/public/raven-grab.js -> MIRROR OK
no browser  playwright resolution forced to throw: 2 tests / 1 pass / 0 fail /
            1 skipped, EXIT=0 — and the SOURCE test still ran (43ms), which is
            the point, since it is the only guard on the three unrendered mics
product     git diff --stat browser/ web/public/ -> empty
```

### Where this stands

The Sol falsification cadence on the mic-alignment suite is **closed at round 9**,
on Andrew's instruction. Nine rounds, seven of them (3–9) fixing only test-side
code: rounds 1–2 found real product defects in the easing control and the mic
CSS; rounds 3–9 found nine successive ways the SOURCE-enumeration guard answered
a question a browser does not ask. The guard is now a hand-written HTML start-tag
tokenizer with an existential enclosure walk over an emitted-character view, and
its matrix carries 12 controls precisely because five of round 9's seven findings
were reds on correct code.

Changed in the working tree only (the auto-save hook commits locally; nothing
pushed). No release, no endpoint change, npm untouched. Repo `main` stays at
110 stdio / 65 gated; npm v2.3.0 at 105/60; the anon 45-tool hash is unmoved
because nothing in `src/` was touched.

Open, unchanged: **Thread A (Higgsfield)** is blocked until Andrew names the
brand — the runbook is `docs/brand-genesis-flow.md`. **Thread B spec 2** (named
motion presets/versions) is the optional next DialKit gap; **spec 1**
(`set_grabbed_style`) stays HELD pending Andrew's word AND `proxyCaptureOnly()`
gating wired first.

Known debt, deliberately untouched and named rather than discovered: the same
probe-self-check tautology at `test/capture.test.mjs:293`, and the same
skip-vs-pass hole in `test/grab-overlay-drag-move.test.mjs`,
`test/grab-overlay-voice-input.test.mjs` and
`test/grab-overlay-scroll-preservation.test.mjs`.

---

## Thread B build — spring → `linear()`, DialKit's last motion gap

Spec posted before the first edit. Built in the working tree only; nothing
pushed, nothing released, `src/` untouched, so the anon-45 hash and the 110/65
stdio count cannot have moved.

**Why this was the gap.** Re-derived from primary sources (the DialKit page plus
greps of the 13,220-line overlay) rather than from my earlier framing, which
narrowed "anything DialKit has that Raven is missing" to exactly two items:
theme, and spring editing. CSS has exactly one way to express a spring —
`linear()`, a sampled progress curve — and a cubic-bezier has two control points
and cannot oscillate. Round 1's `motion` capture category is what made this
reachable at all.

**The load-bearing decision is GENERATIVE-ONLY.** Many springs sample to
visually identical curves, so a `linear()` cannot be read back into
stiffness/damping/mass. The control never claims to have parsed anything; it
only ever REPLACES. That is the direct answer to the lesson this repo has now
paid for twice: a control that ACCEPTS a value it cannot represent destroys the
original on commit. The springs are therefore attached on the PROPERTY, after
the whole control if/else chain — not inside the easing branch — so a row that
fell back to plain text (`steps()`, an existing `linear()`, a compound list)
still gets them, and the bezier editor plus its 15-mutant matrix are untouched.

**Product changes — the first product code to change since round 2** (rounds
3–9 were all test-side):

- `browser/raven-grab.js` — new spring block after `isTimingFunctionProperty`
  (~:5317): `SPRING_PRESETS`, `springPosition`, `SPRING_SETTLE_EPSILON`,
  `SPRING_MAX_MS`, `springCurve`, `simplifySpringSamples`,
  `formatSpringLinear`. `raven-grab-spring-preset` added to
  `isStyleValueControl` (~:6609). UI block appended AFTER the control chain,
  gated on `isTimingFunctionProperty(property)`. CSS at ~:1128–1131.
- `web/public/raven-grab.js` — `cp` mirror, re-verified with `cmp`.

**Three details that are decisions, not incidentals.** Settle is the LAST moment
outside the epsilon band, never the first moment inside it: an underdamped
spring crosses 1 on every oscillation, so first-crossing lands mid-bounce and
truncates the entire overshoot. Percentage stops are mandatory after RDP
simplification, because bare values are spread EVENLY by the browser and
simplified points are deliberately not evenly spaced. And the position is
solved analytically in three branches (ζ<1, ζ=1, ζ>1) rather than integrated,
because an integrator's error depends on its step size and that step size would
silently decide how bouncy the emitted curve looks.

**Test changes:** `test/grab-bridge.test.mjs` — five internals exported, plus a
new `REGRESSION: spring -> linear() generation`. NEW
`test/grab-overlay-spring-control.test.mjs`, 6 browser tests on the FULL probe
pattern (loopback listen with `once('error')`, mkdtemp/writeFile/rm, launch,
newPage, goto with `.ok()`, close) — deliberately not the older
`catch → t.skip` shape, so it does not join the three files carrying the known
skip-vs-pass hole.

**Measured.** `node --test test/grab-bridge.test.mjs` → 288 / 286 pass / 0 fail
/ 2 skipped, EXIT=0. `node --test test/grab-overlay-spring-control.test.mjs` →
6 / 6 pass / 0 fail / 0 skipped, EXIT=0. Spring math probe: gentle ζ=0.913
settle 579ms 21pts peak 1.0000 · smooth ζ=0.969 617ms 22pts 1.0000 · snappy
ζ=0.693 597ms 27pts 1.0489 · bouncy ζ=0.391 995ms 38pts 1.2628; all four
invalid-input cases return `null`. Cost probe 1.63 / 1.02 / 1.05 ms for all four
presets, which is what justifies the explicit **not memoised** decision — and
the comment carries the numbers, so the decision is falsifiable rather than
asserted.

**One false fail, caught and recorded.** Test 4 asserted
`reopened.value === committed.inline` and went red on correct code: Chromium
re-serializes an inline `linear(0, …, 1)` as `linear(0 0%, …, 1 100%)`, so the
assertion was comparing the generator's output to the ENGINE'S NORMALISATION of
it. Split into two assertions that each measure what they claim — verbatim
against `committed.raw`, and `/^linear\(0 0%,.*, 1 100%\)$/` on `inline` as the
strongest available evidence that Chromium PARSED it, since an unparseable
timing function leaves the declaration empty. This repo's own rule, hit live: a
derived expected-value is exactly as falsifiable as the thing it grades.

**Two decisions owed to Andrew, each for a one-word overrule.** Theme /
`prefers-color-scheme` is DECLINED as a deliberate design position — an overlay
over arbitrary sites needs a stable dark boundary, and a light theme over a
light page loses it; reported, not built. And the `type="email"` mic exclusion
from Thread C still awaits his word.

### Spring mutation matrix — measured, two rounds

Harness `.claude/dialkit-2026-08-08/spring-mutants.mjs`. It serves each mutant to
BOTH suites at once (`RAVEN_GRAB_ASSET_PATH` is what the bridge serves the
browser, `RAVEN_GRAB_TEST_OVERLAY` is what `grab-bridge.test.mjs`'s internals
loader reads) — a mutant reaching only one would report a radius measured against
half the guards. It runs a clean baseline first and aborts if it is not green,
`node --check`s every mutant, requires each find-string to be present AND unique,
requires the exit status and the summary line to AGREE, treats a non-zero skip
count in the browser suite as a failed measurement, and carries CONTROLS because
a red-only matrix is structurally blind to a false fail.

**v1: 9 mutants, 8 killed, 1 SURVIVED, 2 controls, 0 false-failed (EXIT=1).** The
survivor was S9 — `springCurve` skips simplification and emits all 101 raw
samples. It survived because every simplification test drove
`simplifySpringSamples` in ISOLATION, which that mutation satisfies completely.
Measured before writing the guard: the presets keep 21/22/27/38 of 101 points,
worst vertical deviation 0.00197 against the 0.002 tolerance, `linear()` string
233/242/299/432 chars; at tolerance 0.05 bouncy collapses to 7 points, at 0.2 to 4.

**Guard added** in `test/grab-bridge.test.mjs`, inside the existing spring test so
no test-count changes: a loop over `SPRING_PRESETS` asserting
`curve.points.length <= 45` and worst vertical deviation `<= 0.005`, both bounds
with their measured margin recorded in the comment. Two bounds because the two
directions fail differently — too many points is an unreadable ~1100-character
value in a row a human reads, too few is a curve that no longer traces the
spring. S10 (tolerance 0.002 → 0.05) added for that inverse defect.

**v2, re-run WHOLE per the standing rule: 10 mutants, 10 killed, 0 survived; 2
controls, 0 false-failed (EXIT=0).** Baseline spring-control 6p/0f, grab-bridge
286p/0f. Radii (spring-control, grab-bridge): S1 2 (2,0) · S2 1 (1,0) · S3 2
(2,0) · S4 2 (2,0) · S5 1 (1,0) · S6 1 (0,1) · S7 2 (1,1) · S8 1 (0,1) · S9 1
(0,1) · S10 1 (0,1). C1/C2 green.

**S6 is the interesting radius and it is an honest boundary, not a gap to paper
over:** dropping the percentage stops reddens ONLY the unit test, because
Chromium re-serializes both the correct form and the evenly-spread form into the
same `linear(0 0%, …, 1 100%)` shape and nothing in a rendered assertion measures
timing. The browser suite is structurally blind to it; the unit test owns it, and
the header says so.

The suite header carried an UNMEASURED matrix declaration for a full round (S1–S7
with stale labels and no radii) — an unmeasured claim in a comment is a defect by
this repo's own rule. Replaced with the v2 figures, the four-invisible-mutants
note, and the S9 story. Its "served through RAVEN_GRAB_ASSET_PATH" sentence was
also false once the harness gained the second env var; corrected in the same pass.

**Mirror verified:** `cmp browser/raven-grab.js web/public/raven-grab.js` →
byte-identical.

---

## Gates on the spring feature — all green (2026-08-08)

**Full suite** `RAVEN_NO_USAGE_LOG=1 npm test` → **1488 tests / 1485 pass / 0 fail
/ 3 skipped, EXIT=0** — exactly the predicted +7 (6 browser + 1 unit). The 3 skips
are the pre-existing ones at output lines 109/713/714 (the file-URL fallback
notice and the two removed-capability phase2 tests); **none is the new suite**,
checked by READING the skip lines rather than inferred from the total being
unchanged. All 6 spring browser tests passed (output lines 838–843) plus the unit
test (line 636).

**Browser-absent path**, measured separately with playwright resolution forced to
throw: 6 tests / 0 pass / 0 fail / **6 skipped**, exit 0, each skip carrying
`# browser unavailable for overlay spring control; probe said: Cannot find
package 'playwright'`. My first invocation passed `NOPW_RESOLVER=1` and got
`ERR_MODULE_NOT_FOUND … '/Users/accunliffe/projects/raven-mcp/1'` — the env var
is the resolver PATH, not a flag.

**Mirror** byte-identical. **Private-paths gate** 4/4 green *after* `git add` —
it scans the INDEX, not the worktree.

**Three header claims were false when read, and each is corrected:** it named a
single env var where the harness serves two; it pointed at
`agent-output/spring-matrix-v2.txt` as the run of record, which is GITIGNORED, so
the figures are reproduced inline instead; and it carried an unmeasured S1–S7
declaration with stale labels and no radii for a full round.

## Sol falsification round 1 on the spring feature — DOES NOT SURVIVE

Log `.claude/dialkit-2026-08-08/agent-output/spring-sol.log`, 1,613,974 bytes (so
not a silent clean exit). Brief at `.claude/dialkit-2026-08-08/spring-sol-brief.md`.
Verdict **4 × P2 + 2 × P3**. Every arithmetic claim was independently reproduced
with my own probe before any fix — none accepted on report.

**P2-1 (REAL, fixed) — the matrix was blind to formatter precision loss.** The
call-site guard measured `curve.points`, the numbers BEFORE `formatSpringLinear`,
and the browser consumes the STRING. The formatter loses precision twice: values
`Math.round(v*10000)/10000`, stops `Math.round(x*1000)/10` (0.1%). Coarsen the
value rounding to ONE decimal and the emitted curve's worst deviation goes
0.001930 → 0.048877 while every `curve.points` assertion stays green. The guard
now parses the emitted `linear()` back and grades THAT.

**P2-3 (REAL, fixed by the same edit) — the 0.002 tolerance was not pinned.**
Loosening `simplifySpringSamples(samples, 0.002)` to `0.005` yields worst 0.005017,
which the old `<= 0.005` bound passed. A single **0.0025** bound on the FORMATTED
curve kills both, with ~30% headroom over the measured 0.001930.

**P2-4 (REAL, fixed) — compound-list placement was claimed and never exercised.**
The header names three plain-text fallbacks (`steps()`, an existing `linear()`, a
compound list) and only `steps()` had a fixture; a gate of
`isTimingFunctionProperty(property) && timingFunctionCount(previousValue) === 1`
left every fixture green while silently dropping springs from a compound row.
Added `#compound` to the fixture and a 7th browser test. **The first draft of that
comment took the whole file down at parse time** — it quoted the gate in backticks
inside the fixture's template literal and closed the string; the comment now says
so, since the next person to document a JS expression in that block will reach for
backticks too.

**P2-2 (REAL, DOCUMENTED not guarded) — the 10s cap can pin an unsettled curve.**
`samples[steps][1] = 1` is unconditional, so a spring too slow to settle inside
`SPRING_MAX_MS` gets its unfinished tail yanked to 1. Measured against the
product's own `springPosition`: `springCurve(0.0001, 0.02, 1)` returns
`settleMs = 10001` (cap+1) with a true position there of 0.004680 — a **0.9953
vertical jump**, which is a snap, not a spring. NOT guarded, deliberately: the
four presets are the only inputs any surface can produce (there is no
stiffness/damping/mass field, by the generative-only decision this feature rests
on) and they settle in 579/617/597/995ms, where the pin moves the endpoint by
<0.001. A refusal would be a mechanism guarding a non-problem. The comment states
the harm at its worst and names the reopen condition (a custom-spring input).

**P3-1 (REAL, fixed) — control C1 was not behaviour-neutral.** It changed the
section hint from "spring" to "springs", which is text a human READS, so its
greenness said only that no assertion happened to cover the copy. Replaced with a
swap of the two RDP recursion pushes: `keep` is a set keyed by index and the
result is an index-ordered filter, so processing order cannot reach the output.

**P3-2 (REAL, fixed) — "NOTHING rendered can see it" was false.** Corrected in
BOTH the suite header and the CLAUDE.md landmine: this suite's assertions read DOM
properties and committed strings, and Chromium re-serializes the stopped and bare
forms identically — but a rendered element WOULD move differently, so it is a
limit of the instruments, not a claim the defect is unobservable.

**New durable artifact: `scripts/measure-spring-settle.mjs`.** Both comments now
cite numbers, and the scratchpad probes that produced them are garbage-collected,
so the measurement of record is a tracked script. It slices `springPosition`,
`simplifySpringSamples` and `formatSpringLinear` VERBATIM out of the overlay and
evaluates them — grading the product's own arithmetic, not a reimplementation —
and each slice is shape-checked, because the failure mode of a text-anchored
extractor is silently grabbing the wrong span. Output: settle time, how far the
pin moves the endpoint, kept/101, emitted characters and worst FORMATTED deviation
per preset, plus the unsettled branch stated at its worst.

**Three mutants added** (S11 one-decimal formatting, S12 tolerance drift to 0.005,
S13 the compound gate) and the WHOLE matrix re-run per the standing rule — a
find-string mutant dies silently the moment its target line is edited.

### Round-1 dispositions all landed; matrix v3 and both gates re-run on the fixed tree

**Matrix v3** (`.claude/dialkit-2026-08-08/agent-output/spring-matrix-v3.txt`,
gitignored): baseline spring-control **7p/0f**, grab-bridge **286p/0f**;
**13 mutants, 13 killed, 0 survived; 2 controls, 0 false-failed, EXIT=0.**
Re-run WHOLE per the standing rule. Radii: S1 3 · S2 1 · S3 2 · S4 2 · S5 1 ·
S6 1 (bridge) · S7 2 (1+1) · S8 1 (bridge) · S9 1 (bridge) · S10 1 (bridge) ·
S11 1 (bridge) · S12 1 (bridge) · S13 1 (spring-control).

**Only S1 moved between v2 and v3 (2 → 3)** — the new compound test shares its
mechanism. A fact about the mechanism, not an extra guard.

**S11 and S12 redden the SAME assertion** (the 0.0025 bound) and are separated
only by the number in its message (0.048877 vs 0.005017). Stated in the suite
header so two radius-1 rows do not read as two independent guards.

**Full suite** `RAVEN_NO_USAGE_LOG=1 npm test` → **1489 tests / 1486 pass /
0 fail / 3 skipped, EXIT=0** — exactly the predicted +1. Skip lines READ, not
inferred: line 109 (`file URL fallback marks reveal and settle checks as
unavailable # browser available — fallback path not used`), 713 and 714 (the two
removed-capability phase2 tests). **None is the spring suite.**

**Browser-absent path**: 7 tests / 0 pass / 0 fail / **7 skipped**, exit 0, each
carrying `# browser unavailable for overlay spring control; probe said: Cannot
find package 'playwright'`.

**Mirror** `cmp browser/raven-grab.js web/public/raven-grab.js` → byte-identical
(re-done after the P2-2 comment landed in the overlay).

**Private-paths gate** `node --test test/no-private-paths.test.mjs` →
**4 tests / 4 pass / 0 fail**, run AFTER `git add` — it scans the INDEX, not the
worktree.

**Staged (8 explicit paths):** `M .claude/dialkit-2026-08-08/spring-mutants.mjs` ·
`M CLAUDE.md` · `M browser/raven-grab.js` ·
`M conversations/2026-08-08-dialkit-voice.md` ·
`A scripts/measure-spring-settle.mjs` · `M test/grab-bridge.test.mjs` ·
`M test/grab-overlay-spring-control.test.mjs` · `M web/public/raven-grab.js`.

**Not committed by me, not pushed, no release. `src/` untouched** — the anon-45
hash and the 110/65 stdio count cannot have moved.

**No Sol round 2 on the fixed tree, deliberately.** Andrew ended the cadence
("Let's stop this after this round comes back") while round 9 of the
mic-alignment suite was in flight. The spring suite's round 1 came back, every
finding is dispositioned, and opening a second round here would be the thing he
stopped. The consequence is stated rather than hidden: **the round-1 FIXES have
not themselves been adversarially reviewed**, so this is reported as changed in
the working tree, not as finished work.

### Still owed to Andrew — two decisions and one blocker

1. **Theme / `prefers-color-scheme`: DECLINED as a deliberate design position**,
   reported for his overrule rather than built. The overlay sits over arbitrary
   third-party sites and its dark chrome is what separates Raven's surface from
   the page underneath; a light theme over a light page loses that boundary.
   DialKit is a standalone app and has no such constraint.
2. **The `type="email"` mic exclusion** (three address inputs carry no mic)
   stands against the standing "any input should take voice" rule, because
   dictated addresses fail silently. Awaiting his one-word overrule.
3. **Thread A (Higgsfield) is blocked on one thing only: Andrew must name the
   brand.** Runbook is `docs/brand-genesis-flow.md` — interview →
   `generate_mood_board` (approval stop) → `generate_design_system({brand_color,
   style, format:"all", save:true})` → `init_design_md({source:"<slug>"})`.

---

## Checkpoint — Andrew's deck bug, and the coverage hole my own matrix found

### Deck bug — FIXED, working tree only

Report: *"I am trying to give feedback on my deck on my portfolio, and I can
only give instructions on one slide at a time, when I navigate to a new one I
lose the rest"*; confirmed *"the url does not change for each slide, it stays
the same"* — so every slide swap is an in-page node swap, not a navigation.

Diagnosis: an instruction-only draft has nothing making `draftAwaitingReconnect`
hold it, so selecting on the NEXT slide stashes the previous draft and the very
next sweep drops it for having a detached target. The cross-navigation carry
(sessionStorage + `pagehide`) never applied — `pagehide` does not fire on an
in-page swap. A detached node reports empty computed styles, so the rescue has
to be a snapshot taken WHILE the node is still connected.

Six edits in `browser/raven-grab.js`, mirrored byte-identical to
`web/public/raven-grab.js`. New `test/grab-overlay-detached-draft.test.mjs`
(2 tests, full chromium probe, local session, two-slide fixture whose outgoing
slide is REMOVED).

Mutant matrix v2 (`.claude/dialkit-2026-08-08/detached-draft-mutants.mjs`):
**5 mutants, 4 killed, 0 unexpected survivors, 1 EXPECTED survivor; 1 control,
0 false-failed.** D2/D3/D4/D5 each radius 2. D1 (`!draft.target` arm) is an
expected survivor — drafts are built `target: styleEditTarget || selectedElement`
(`browser/raven-grab.js:3963`), so no constructible input reaches it. Both tests
passed on the first run, which was worth nothing until the matrix proved them red.

**Andrew must reload his deck page** — the bridge serves the overlay from disk
per request, so the running tab still has the old one.

### Precision matrix repaired — and it found a real hole in my own feature

v1 was defective (7/7 survived, control false-failed). Three faults, all mine:
the `- 1` radius correction was still in the CODE while only its COMMENT had
been edited away; the control renamed `mode` on two of three lines and was
therefore a real break, not a control; and it reported counts with no failing
test names.

v2 answered the question it was built to ask, in the wrong direction:
**4 killed, 3 survived, and the three survivors were exactly the three CALL
SITES.** Nothing observed whether the pointer scrub or either arrow-step passed
the precision floor through. The comment above `scrubPrecisionMode` claimed the
opposite.

### Closing it

New `test/grab-overlay-precision-tiers.test.mjs` — 3 browser tests, one per call
site, on a whole-number fixture (`font-size: 16px`, `width: 240px`) where an
unfloored fine-tier step rounds straight back and the control is observably dead.

Two things had to be corrected before it measured anything:

- The scrub arms on the property **LABEL** (`[data-style-label]` mousedown), not
  the value cell. Pressing the value opens the editor — a different call site —
  so the first draft measured the arrow-step site twice and its scrub assertion
  read `null`/`''`.
- Reading `data-style-raw` after a scrub reads null: the mouseup's trailing click
  opens the editor and takes that cell out of the DOM. The element's inline style
  is available either way and is the stronger measurement.

**Matrix v3 (`agent-output/precision-matrix-v3.txt`): 7 mutants, 7 killed, 0
survived; 1 control, 0 false-failed.** P5/P6/P7 each radius 1, a *different*
test each — that is what proves three separate wirings. P4 (shared formatter
ignores its floor) reddens the two ARROW tests but NOT the scrub, because
`beginStyleScrub.move()` re-derives the rounding inline rather than calling
`steppedNumericValue`. Stated residual, not fixed: the two use different parsers
(`parseNumericValue` vs `parseNumericExpression`), so collapsing them is a
behaviour change. Both copies are covered.

Two further harness repairs, both found by v3 itself:
- The name regex was lazy and truncated at the first `(`, so all three call-site
  names collapsed to `CALL SITE` — unattributable again, one version after being
  fixed for exactly that. Anchored on the duration suffix now, in both harnesses.
- `skipped === 0` was the wrong shape: `grab-bridge.test.mjs` carries two
  legitimate skips and the guard aborted the matrix on a healthy tree. The count
  is pinned against the BASELINE now, so what fails is a count that MOVED.

`browser/raven-grab.js` comment above `scrubPrecisionMode` rewritten to say what
actually measures what.

### Measured

`RAVEN_NO_USAGE_LOG=1 npm test` → **1495 tests / 1492 pass / 0 fail / 3 skipped**,
EXIT=0. +3 over 1492 is exactly the three new call-site tests. The 3 skips READ
at output lines 109/714/715 — the file-URL fallback notice and the two
removed-capability phase2 tests. Mirror `cmp` clean.

CLAUDE.md updated: ledger figure 1492 → 1495 with the accounting, the harness
landmine extended with faults (d) and (e), and a new landmine for the precision
call sites.

### Thread-B correction owed to Andrew

I told him the open DialKit items were "spring time mode and panel
repositioning". This log is the durable record and it says otherwise: **spec 1
(`set_grabbed_style`) is HELD** — unhold is his word AND `proxyCaptureOnly()`
gating wired through it first — and **spec 2 (named presets/versions) is
optional-next**. The timeline (DialKit #27–40) is OUT of scope: Jitter/Morven
territory. Corrected to him in-line.

### State

Nothing committed, nothing pushed, `src/` untouched — so the anon-45 golden hash
and the 110/65 stdio count cannot have moved. Thread A still blocked on Andrew
naming the brand. The `type="email"` mic exclusion stands until he overrules it.

---

## Sol falsification round on the precision call-site work (2026-08-08, late)

**Verdict: DOES NOT SURVIVE — 2 × P2 + 2 × P3, all four real, all four fixed.**

The FIRST Sol run was a failed run wearing a clean bill: exit 0, 1094 bytes, no
model turn at all — output stopped after the UserPromptSubmit hooks. Recorded
here because the standing rule says never disposition an empty adverse output as
"no findings"; the re-run produced 680KB and the verdict above.

### P2 (f) — a relative skip guard cannot detect a baseline that measures nothing

v3 pinned each mutant's skip count to the BASELINE's. Sol reproduced the hole
under a denied loopback (`listen EPERM`): the precision suite returns
0 pass / 0 fail / 3 skipped, every mutant matches it exactly, the guard passes,
and P5/P6/P7 print SURVIVED on a machine where nothing ran. That output is
byte-identical to the real v2 verdict that started this entire round — the
instrument could not tell "the call sites are unguarded" from "chromium is
unavailable".

Fixed with `EXPECTED_BASELINE_SKIPS` declared per suite (grab-bridge 2,
precision 0 — both MEASURED off the baseline line, not assumed) plus a
`pass > 0` floor, graded before any mutant runs.

### P2 (g) — `EXIT=0` proved only that the script reached its last line

v3 printed survivors and false-fails and then exited 0 regardless. Since the
matrix result is captured to a file with `echo "EXIT=$?"` appended and read
back later, that number was pure noise. Both harnesses now set
`process.exitCode = 1` on an unexpected survivor or a false fail; the
detached-draft harness excludes its one DECLARED expected survivor (D1).

### P3 — "rounds straight back to 16" was false of one of the three sites

The comment (and the CLAUDE.md landmine) said an unfloored fine tier rounds back
to its start and the control is observably dead, of all three sites. True of the
two ARROW steppers (16 -> 16.1 -> `Math.round` -> 16, dead key). FALSE of the
pointer SCRUB, which accumulates: a 5px drag is +0.5 and rounds to **17**. Not
dead — snapping by a whole unit, i.e. the COARSE behaviour wearing the fine
tier's label. Same defect, two different symptoms. Corrected in both places.

### P3 — radius 1 does not prove separate wiring

Sol cited this repo's own standing rule back at it: a radius is a fact about a
mechanism, never evidence of independent guards, and two mutations on ONE
execution path can each redden the same single test. What actually establishes
three separate wirings is that P5/P6/P7 sit at three distinct source locations
and each reddens a **different NAMED test** — readable only because the harness
reports names rather than counts. Radius 1 adds the narrower fact that no call
site is covered incidentally by another site's test. Corrected in both places.

### Measured after the fixes

- Matrix **v4**, re-run WHOLE per the standing rule: baseline
  `grab-bridge 287p/0f/2s  precision 3p/0f/0s`; **7 mutants, 7 killed, 0
  survived; 1 control, 0 false-failed.** No radius moved from v3 (P1 4, P2 4,
  P3 1, P4 3, P5/P6/P7 1 each) — expected, since the only product change is a
  comment, but re-measured rather than carried forward.
- Both new guards proven FALSIFIABLE rather than asserted:
  - Probe A — a copy with the declared expectation deliberately wrong (3 vs the
    measured 0) aborts on its own named assertion, exit 1.
  - Probe B — a copy declaring the behaviour-neutral control as `red` reports
    SURVIVED and exits 1.
- Mirror `cmp` clean after the comment edit.

**Probe B's verdict was written above before it was read** — the wrapper had
reported completion, but a background wrapper's exit code is the shell's, not
the probe's, and the probe wrote its own status into the file as
`PROBE_B_EXIT=$?`. Read afterwards: `SURVIVED`, then
`FAIL: 1 unexpected survivor(s), 0 false fail(s)`, then `PROBE_B_EXIT=1`. The
claim above is therefore correct — but it was correct by luck at the moment it
was typed, which is the same shape as everything else this round found.

### Closed out

- Full suite re-measured: **1495 tests / 1492 pass / 0 fail / 3 skipped**,
  unchanged, which is what a comment-only product change should produce. The
  three skips were READ at output lines 109/714/715 (the file-URL fallback
  notice and the two removed-capability phase2 tests), not inferred from the
  total being unchanged.
- `test/no-private-paths.test.mjs` re-run against the re-staged INDEX: 4/4.
- Committed **`d3b0859`** — 13 files, +2012/−68, via `git commit --only` with
  every path named, because a bare commit takes the whole index and this
  worktree is shared.
- **NOT pushed.** A push to `main` moves the `site` production deploy; this
  commit touches no `src/` or `api/`, so the anon-45 golden hash and the
  110/65 stdio count cannot have moved, but the push is Andrew's call.

### Still owed

- Andrew must RELOAD his deck tab — the bridge serves `raven-grab.js` from disk
  per request, so an already-open page is still running the pre-fix overlay and
  the detached-draft rescue is not in it.
- The `type="email"` mic exclusion stands until he overrules it.
- Thread B spec 2 (named presets / versions) is the remaining optional build.

## Thread A resumed — brand genesis run per "do the brand-genesis flow yourself"

The Stop hook was right that I was standing by on five items; three were already
decided and I was the one holding them. Andrew's earlier AskUserQuestion answer
WAS "Do the brand-genesis flow yourself", so thread A was never blocked on him
naming a brand — it was blocked on me running it. Autonomy is a ~90% band and I
was well under it.

### Gate found, and it is mechanical

`claude mcp list` → `raven: node …/raven-mcp/dist/index.js ✔ Connected`. The
BUILD is current (probed `dist/` directly: **110 tools, `generate_mood_board`
present: true**); the CONNECTION is stale — this session attached before the
rebuild. Two independent confirmations through the live tools:
`get_taste_interview` returned only the FOUR core questions (no `genesis`), and
`generate_design_system`'s schema carries no `save` param. Needs a `/mcp`
reconnect, which only Andrew can do. Until then steps 3–5 of
`docs/brand-genesis-flow.md` cannot be driven through the live tool surface.

**A stale MCP connection is invisible from the tool list alone** — the missing
tool reads exactly like a missing feature until the build is probed directly.

### Done through the live connection

- `bind_taste_surface(profile=andrew, project=smash-grab-burger-co)` — surface
  "product-site brand-marketing food", host `smashgrab.example`, voice_note +
  7 design_notes. `bound_at` 2026-08-09T04:53:12.164Z.
- Brand is the runbook's own example (Smash & Grab Burger Co) so the doc and the
  video agree — reuse-last-good, change only the new requirement.
- Colour decision: `#E8442E` as the single accent, near-black ground, the
  photography carries all the colour.

### Raven defect found and CAPTURED, not fixed

`build_hints` fire on NEGATED technique mentions. `design_notes.motion` says
"**No** parallax, no marquee, no auto-playing hero video" and the bind returned
a full recipe for IMPLEMENTING parallax, plus "an expensive note is NOT license
to drop it". The matcher is lexical and cannot see negation, so a note
FORBIDDING a technique instructs the builder to build it — the exact inversion
of the user's decision. Filed to `.claude/linear-backlog-queue.jsonl` (24 lines)
with repro, harm and fix direction; not fixed here, because an adjacent problem
gets one report line, not a fix.

### Higgsfield

Preflight: cunliffeandrewc@gmail.com, ultra plan, **3762 credits** before spend.
The first `--enhance-only` call returned "Cannot reach …/product-photoshoot/
enhance"; that was NOT taken at face value — curl proved the host reachable
(401 on the endpoint, 404 on root), `account status` and `model list` both
answered, and a minimal `--json --enhance-only` call succeeded. Transient, not
an entitlement or auth failure. The real enhance-only pass then honoured the
binding: near-black ground, single hard gridded strobe, cheese as the sole
chromatic punctuation, no steam/hands/props.

Real generation launched backgrounded (task **b6xylrrua**), `--mode product_shot
--count 3 --timeout 9m`, cwd `~/projects/raven-genesis-demo/pack`.

### Pack generated, read, and LOOKED AT — 21 credits

Task b6xylrrua completed. **Its exit code 0 was the shell's**, and the thing
that mattered was in the artifact: three CloudFront URLs and **nothing on
disk** — the CLI returns links and downloads nothing, so `~/projects/
raven-genesis-demo/pack/` was EMPTY at "completion". Fetched by hand:
`smashgrab-hero-01/02/03.png`, 2048×2048 RGB PNG, 6.7/6.4/7.8 MB.

Credits **3762 → 3741 = 21 spent** (two enhance calls + three generations).

Eyes-on at 900px, all three — not inferred from the prompt. Against the
binding: near-black ground ✅, cheese the only saturated element ✅, no hands /
steam / props ✅. Where they differ, honestly:

- **01 is the hero.** The overhead three-quarter angle the brief actually asked
  for, one hard source throwing a long sharp cast shadow to the upper left,
  crisp lacy edges on both patties, pickle-and-onion build correct.
- **02 is a usable alternate** — eye-level, softer falloff, cheese landslide.
  Its patties are thick and ragged rather than smashed; it is a pub burger
  wearing a smash burger's caption.
- **03 is a reject.** Top-down, and from directly overhead the bun reads as a
  lid on a spill rather than a burger.

None carries `#E8442E` in frame, which is CORRECT: the binding puts the accent
in the UI as punctuation and lets the photography carry its own colour.

### Still owed on thread A
- `/mcp` reconnect (Andrew) before mood board → `save:true` system → DESIGN.md
  can run through the tools.
- Push `d3b0859..ad36eeb` — Andrew's call; touches no `src/` or `api/`.

## Thread B spec 2 — named style versions (Grab overlay)

Spec, posted before the first edit:
1. **Goal:** save the active draft's edit set under a name, list/restore/delete
   — DialKit's "explore variations without losing work", the last non-held gap.
2. **Files:** `browser/raven-grab.js`, `web/public/raven-grab.js` (byte-identical
   mirror), new `test/grab-overlay-style-versions.test.mjs`, new
   `.claude/dialkit-2026-08-08/version-mutants.mjs`.
3. **Axes:** state (in-memory + sessionStorage) · browser/render (panel row).
   No network, filesystem, on-device model, or compute.
4. **Human gates:** none new — versions are local overlay state; nothing leaves
   without the existing human Send.
5. **Out of scope, stated not silently narrowed:** `set_grabbed_style` (spec 1,
   HELD); the timeline (Jitter/Morven); shipping versions IN the drain payload,
   which is a payload-contract change.

### What landed in `browser/raven-grab.js`
- State decls (`styleVersions`, `styleVersionNameDraft`, `styleVersionSequence`).
- `clearStyleEdit(property)` EXTRACTED above `commitStyleEdit` and called from
  its no-op branch. Order is load-bearing: `restoreStyleEdit` reads
  `styleEditOriginalInline[property]`, so both deletes must follow it.
- Versions block before `var STROKE_SIDES`: sessionStorage key
  `raven-grab-style-versions-v1`, NAME_MAX 40, LIMIT 100, shape-filtered read,
  hydrate (sequence seeded from stored MAX, never length),
  `styleVersionSaveBlocker()` returning the REASON string, save (same
  name+selector UPDATES), delete, `restoreStyleVersion` (REVERTS then APPLIES).
- `syncStyleVersionSaveButtons()` + `syncStyleVersionsSection()` — in-place
  sync; typing must NOT `renderPanel()` or the caret dies each keystroke.
- Markup at the styles collapsible; click + input delegation; boot hydrate; CSS.
- `test/grab-overlay-voice-alignment.test.mjs:1569` mic count 8 → 9.

### The defect the tests found, which `node --check` and a green suite did not
The section never appeared. Root cause: **a style commit deliberately does not
re-render** (that would destroy the open editor mid-keystroke), so a section
built only by `renderPanel()` can never appear when the user's first edit lands.
Fixed at the ONE function that already means "the draft's edit set changed" —
`syncActiveStyleDraftKey()`, which reads exactly the four collections the
blocker reads and is called from all fifteen mutation sites. Hooking those
sites individually would be the two-copies-of-one-rule drift this repo
documents. The section is now always in the DOM and `hidden` when there is
nothing saved and nothing saveable; the note likewise.

### Measured, not asserted
- `test/grab-overlay-style-versions.test.mjs` — 6 tests, full-probe pattern
  (loopback listen + mkdtemp/writeFile/rm + launch + newPage + goto `.ok()`), so
  it does NOT join the three overlay suites carrying the skip-vs-pass hole.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — **9 mutants, 9 killed,
  0 survived; 2 CONTROLS, 0 false-failed**, EXIT=0. All six tests passed on
  their first run, which is worth nothing until reverted; two radii written down
  before measuring came back different (V8 was 1, not 2), and V9 — the
  sync hook, i.e. the shipped-once defect — has radius 6 because it is the entry
  point every other assertion runs through.

### Full suite
`RAVEN_NO_USAGE_LOG=1 npm test` → **1501 / 1498 / 0 fail / 3 skipped**, EXIT=0
(measured 2026-08-08, backgrounded to `/tmp/raven-full-suite.log`). The **+6**
over the previous ledgered 1495/1492 is exactly the six browser tests in the new
`test/grab-overlay-style-versions.test.mjs`; the three-edit product fix in
`browser/raven-grab.js`, its mirror, and the mic-count line in
`test/grab-overlay-voice-alignment.test.mjs` move the count by zero. **The 3
skips are the same three this ledger has always carried and neither new test is
among them** — read individually at output lines 109 / 714 / 715 (the file-URL
fallback notice and the two removed-capability phase2 tests), not inferred from
the total.

## Sol falsification round on named style versions (2026-08-08)

Verdict **DOES NOT SURVIVE — 5 × P2 + 1 × P3**, all six dispositioned as real.
Only claim 4 (the in-place sync) survived. Sol's own runtime verification was
environment-blocked (`MachPortRendezvousServer … Permission denied (1100)`,
0 pass / 0 fail / 6 skipped) — and **the harness's v4 baseline guard correctly
rejected that baseline and exited 1 before grading a single mutant**, which is
the v4 fix earning its keep on a real environment rather than on a fixture.

The shape of the round: a feature that had already passed a green suite AND a
nine-mutant matrix. The matrix measured the mechanisms it named and was blind to
hand-edited storage, to component scope, and to its own corpus completeness.

### The six findings and their disposition
1. **P2 — save-and-restore must share a rule.** The blocker refused nothing about
   `editScope`. Component scope MIRRORS every write onto the matching siblings,
   and a version stores neither the scope nor the member list, so a version saved
   under one scope and restored under the other reverts the primary and leaves
   every sibling carrying the previous experiment — the blend the feature exists
   to prevent, one level out. FIXED in BOTH directions: refusing only at the save
   site is not enough, because the scope can be switched AFTER a save, so
   `restoreStyleVersion` refuses too. Same shape as the preview-vs-action defect
   this repo has already shipped once.
2. **P3 — `instructionDraft` is not in the blocker.** VERIFIED against the source
   rather than accepted, then **ACCEPTED with a written decision**: every blocker
   clause names something that CHANGES THE RENDERED ELEMENT; an instruction
   renders nothing. A version is not a whole-draft snapshot and does not claim to
   be. The decision is encoded as a test, not left as prose.
3. **P2 — stored ids are hand-editable.** My first fix was the wrong shape —
   `Number.isSafeInteger` plus a `seen` dedupe patches each bad shape one clause
   at a time and still cannot fix minting past the safe range. Replaced with
   **RENUMBER on hydrate**: an id is a within-session identity, never a stable
   reference, so the cheapest correct answer is to stop reading stored ids at
   all. That kills duplicates, negatives, fractions and the nasty one — a stored
   `Number.MAX_SAFE_INTEGER` is a perfectly VALID safe integer that passes any
   filter, after which the next two saves both mint `9007199254740992` because
   the increment stops moving at the precision limit.
4. **P2 — `typeof x === "object"` is the weakest question you can ask of a nested
   structure.** `{"edits":{"color":null}}` passed it and then threw out of the
   restore CLICK HANDLER — a dead button with a console error rather than a
   refusal. `isStyleVersionEdits()` now requires a string `newValue` per property
   and the entry is dropped at read time.
5. **P2 — the cap was enforced only on the way to storage.** The 101st save
   renders a full list and the OLDEST row silently disappears on the next reload.
   For a feature whose entire job is "do not lose my work", a version vanishing
   without ever being seen to go is the one forbidden outcome. Eviction moved
   into memory at the save site; the storage slice stays as belt-and-braces and
   the comment says it is deliberately not the guard.
6. **P2 — the harness could grade a corpus that is not the one it describes.** A
   pass/fail/skip triple says nothing about how many tests were REGISTERED: a
   shortened suite reports 1 pass / 0 fail / 0 skipped, satisfies every guard,
   and the mutants print SURVIVED for the wrong reason. `EXPECTED_BASELINE_TESTS`
   is declared per suite now, with cancelled/todo pinned at zero in both the
   baseline check and the per-mutant check.

### The fix round's own tests
Six new browser tests (12 in the suite now), one per fixed finding plus the
encoded decision. The cap test seeds **101**, not 100, so the read-side cap is
measured too. Every seed is built by saving one real version and rewriting what
comes back — hand-writing `#card` would pass today and measure nothing the day
the selector strategy changes. All twelve passed on the first run, which under
this repo's own rule is worth nothing until the matrix proves them red.

**V7 had to be re-anchored, not carried forward.** Its find-string named the
max-seeding loop the renumber fix deleted, so the harness would have ABORTED on
"find-string absent" — which is the uniqueness check working, not a survivor.

### The re-measured matrix (measured, not carried forward)
`node .claude/dialkit-2026-08-08/version-mutants.mjs` → baseline 12p/0f/0s,
**16 mutants, 16 killed, 0 survived; 2 CONTROLS, 0 false-failed**, EXIT=0. The
suite header was rewritten FROM that output, and three radii came back different
from what was written down first — V3 is 3 (not 2), V7 is 2 (not 1) and V8 is 4
(not 1), all because the six new tests share those mechanisms. V9 is 12, i.e.
every test in the file: it is the entry point they all run through, which is a
fact about that one mechanism and **not** evidence of twelve guards. V14 and V16
redden the SAME single test and are separated only by which half of the cap they
break — which is exactly why the cap fixture seeds 101 rather than 100: at 100
the read side is never exercised and V16 survives.

### Full suite after the fix round
`RAVEN_NO_USAGE_LOG=1 npm test` → **1507 tests / 1504 pass / 0 fail / 3 skipped**,
duration 46915ms, EXIT=0. The **+6** over 1501 is exactly the six new browser
tests; the five-part product fix, its mirror, the seven new mutants, the
corrected corpus expectation and the rewritten suite header all move the count
by zero. The 3 skips are the same three this ledger has always carried, read
individually at output lines 109/714/715 rather than inferred from the total,
and all six new tests were read BY NAME in the full run's output (lines 857–862)
rather than assumed present.

CLAUDE.md is updated: the Verify figure with the delta broken out, the Sol round
appended to the style-versions landmine paragraph, and the now-false "seeded from
the stored MAX id" clause corrected in place with a note not to restore it from
that sentence — the renumber fix deleted that mechanism.

### Still owed
- Second Sol falsification pass on the FIX round, before any completion claim.
  **In flight** — `.claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R2.md`, detached
  to `.claude/dialkit-2026-08-08/agent-output/SOL-VERSIONS-R2.out` (gitignored).
- Commit `d3b0859..HEAD` is Andrew's call to push. Touches no `src/` or `api/`,
  so the live endpoint is not involved.
- **Andrew must reload his deck tab** — the bridge serves `raven-grab.js` from
  disk per request, so an already-open page still runs the pre-fix overlay.

## Sol round 2 on named style versions — VERDICT: DOES NOT SURVIVE

`.claude/dialkit-2026-08-08/agent-output/SOL-VERSIONS-R2.out` (377,669 bytes,
complete, gitignored). Four P2, three P3. **It graded the tree BEFORE the
restore-affordance fix landed**, so its dead-enabled-restore-button P2 was
already closed when the output arrived — read a pass's timestamp against the
tree, not against the claim it was handed.

The v2 matrix that preceded it: baseline 13p/0f/0s, **18 mutants, 18 killed, 0
survived; 2 CONTROLS, 0 false-failed**, EXIT=0. V17 and V18 each radius 1.

### The three live P2s and what each one actually was

**Shape is not validity.** `isStyleVersionEdits` checked types and never asked
whether the VALUE is CSS. `restoreStyleVersion` clears the current edits before
applying, and `commitStyleEdit` refuses anything `CSS.supports` rejects — so a
hand-edited `{"color":{"newValue":"nonsense"}}` wiped the live font-size edit,
applied nothing, and returned `true`. A destructive no-op reported as a
successful restore, which is the blend this feature exists to prevent, arriving
through storage. The added check is the SAME check the save path already ran, so
it can never drop a version saved this session.

**A cap nobody can watch enforce itself is a silent loss.** Eviction was global
(`slice(-100)`) while the panel renders per selector: the 101st save on selector
B deleted selector A's oldest with no row disappearing anywhere on screen. Now
per-selector at the save site (`evictStyleVersionsOverCap`, identity-filtered so
it survives the renumber hydrate performs), per-selector on the way IN
(`capStoredVersionsPerSelector`, walking from the end so the newest survive), and
the global slice on the persist path is DELETED. That is an accepted trade, not a
free win: the total is now bounded only by sessionStorage's quota, so a quota
failure keeps versions in memory for the session and they do not survive a
reload. Preferred over deleting a row while the user is looking at it; a
persist-failure notice in the panel is the named follow-up if it is ever reached.

**`editScope` is a live toggle and says nothing about how the draft was
produced.** Edit in component scope → the value mirrors onto siblings; switch to
instance → `componentScopeSiblingElements()` returns `[]`, so siblings keep the
first experiment while the primary moves on. `setEditScope` neither reverts nor
re-applies the mirror, so the screen is a blend while both blockers answered `""`.
New shared `outstandingScopeSiblingPreview()` reads
`styleEditScopeSiblingsOriginal` — the bookkeeping that PROVES a stale mirror
exists — and both the save and restore blockers refuse on it, naming the row to
clear. `restoreStyleEdit → restoreStyleScopeSiblings` deletes the key and is the
user's way out.

### Deliberately out of scope, reported not fixed (Path C)
The scope toggle's own asymmetry: leaving component scope neither reverts nor
re-applies the mirrored sibling previews. Remedy named — symmetric apply/revert
inside `setEditScope`. Not implemented here because it changes shared
scope-toggle behaviour with its own test surface, and shipping it untested inside
a version round is how a "fix" becomes the next landmine. The version half is
closed by the new refusal.

### State at this checkpoint
All three product fixes are in `browser/raven-grab.js`, mirrored (MIRROR-OK,
`node --check` clean), plus one of the three P3 doc corrections. **No tests, no
mutants, no suite re-run yet — the three fixes currently have zero guards**, so
the spec's acceptance criterion ("one new mutant per fix, each reddening exactly
its own test; matrix re-measured whole") is UNMET. Two P3s still open: V3's
description in `version-mutants.mjs` falsely says `saveStyleVersion` "silently
no-ops" when the mutant makes it proceed, and the harness header still describes
the superseded six-test corpus.

### Guards for those fixes — tests, then the v3 matrix

Three tests appended to `test/grab-overlay-style-versions.test.mjs` (13 → 16),
one per fix, each written so a fixture that could not fail is visible:

- **stale component-scope mirror** — edit in component scope, switch back to
  instance, and assert *before* naming anything that the sibling still carries
  the mirrored value. That assertion is what makes this a test about a STALE
  mirror rather than about component scope itself (which V12/V13 already cover,
  and where the scope clause fires first so this one never speaks). It then names
  the version, so `saveDisabled` reads as the blocker rather than as the
  empty-name refusal every other state in the file would also give.
- **unsupported CSS value** — the fixture asserts itself first
  (`CSS.supports('color','definitely-not-a-color') === false`), because a value
  Chromium quietly started supporting would make every later assertion pass while
  measuring nothing. The poisoned entry is built FROM a real saved edit, so it
  differs from a legitimate one in exactly the property under test; a hand-written
  shape would be caught by the older type filter and would measure that instead.
  It ends by restoring the good version, so a filter that took the whole list down
  cannot satisfy it.
- **per-selector cap** — seeds one `#card` version plus 100 `#other` versions, so
  the total is 101 on the way IN and 102 after the save. That exercises BOTH
  halves of the rule: a global trim reaches `#card`'s own version on the read and
  `#other`'s oldest on the write, and neither element is individually over the cap.
  The first fixture draft seeded only `#other` and could not see the read half.

`RAVEN_NO_USAGE_LOG=1 node --test test/grab-overlay-style-versions.test.mjs` →
**16 tests / 16 pass / 0 fail / 0 skipped**, 7976ms. All three green on the first
run, which by this repo's own rule is worth nothing until a mutant proves them red.

### Re-anchoring, because a find-string mutant dies when its target line is edited

The fixes moved three of the sixteen existing anchors, and the harness aborts on
"find-string absent" rather than silently mis-measuring — that abort is the rule
earning its keep for the third time in this file's history:

- **V11** — `isStyleVersionEdits` split into a shape half and a validity half, so
  the old one-line body is gone. It now owns the SHAPE half only: with the type
  test dropped, `{"color": null}` reaches the validity check, `edit.newValue`
  throws, and the read's catch returns `[]` — the list goes empty rather than the
  one bad entry being dropped. V19 owns the validity half; they are separated
  because they refuse two different kinds of hand-edited storage.
- **V14** — the inline global slice became `evictStyleVersionsOverCap(selector)`.
  The mutant is strictly stronger now: the global persist slice went with the fix,
  so removing this call leaves NOTHING enforcing the cap.
- **V16** — the read-side `.slice(-STYLE_VERSION_LIMIT)` became
  `capStoredVersionsPerSelector(kept)`.

Four new mutants, not three: the cap needed two (V21 save-side, V22 read-side)
because per-selector is one rule enforced at two sites, and a single mutant would
leave whichever site it did not touch unmeasured. V20 is a single mutant covering
both blockers because they genuinely share one predicate — the honest shape when
the mechanism really is single, and the test asserts both refusals together.
`EXPECTED_BASELINE_TESTS` 13 → 16. Both open P3s closed: V3's description now says
the mutated save *proceeds* (it never no-oped), and the header describes the real
corpus.

### v3 matrix — MEASURED

`node .claude/dialkit-2026-08-08/version-mutants.mjs > /tmp/version-matrix-v3.log`
baseline: grab-overlay-style-versions.test.mjs **16p/0f/0s**
**22 mutants, 22 killed, 0 survived; 2 controls, 0 false-failed; EXIT=0.**

Radii, re-measured WHOLE rather than carried forward:
V1 1 · V2 1 · V3 5 · V4 1 · V5 1 · V6 1 · V7 2 · V8 7 · V9 16 · V10 1 · V11 1 ·
V12 1 · V13 1 · V14 1 · V15 1 · V16 1 · V17 2 · V18 1 · V19 1 · V20 1 · V21 1 ·
V22 1 · C1 green · C2 green.

Three radii moved and all three moved for the same reason — the round added three
tests, not because any guard was added: V3 3→5, V8 4→7, V9 12→16. Everything else
is unchanged.

Two readings the measurement settled rather than confirmed:
- **V13 (radius 1) and V17 (radius 2) are two mechanisms, not one.** The new
  stale-mirror test asserts `restoreDisabled: [true]`, which is the MARKUP guard
  (V17, driven by `styleVersionRestoreBlocker()` at render time) — not the
  function guard inside `restoreStyleVersion` (V13). V13 removing the function
  guard leaves the button still rendered disabled, so it reddens only the
  component-scope restore test.
- **V21 and V22 both redden the SAME single test at radius 1**, separated only by
  which half of the per-selector cap they break — the V14/V16 pattern one round
  later. The two-phase fixture is what makes both reachable: the read-side
  precondition (`#card`'s own version survived the READ) catches V22, the
  post-save assertion (`#other` keeps all 100) catches V21. The first fixture
  draft seeded only `#other` and was structurally blind to V22.

The suite header was rewritten from that measurement: the corrected matrix line,
the full V1–V22 enumeration (V17/V18 had been omitted entirely), the three new
numbered decisions (7 shape-is-not-validity, 8 editScope-is-a-live-toggle,
9 the-cap-is-per-selector), and the three mechanism pairs read as pairs.

### Git state correction
Local HEAD is **`ad36eeb`** ("Record the probe-B read-back, the suite
re-measurement, and the commit"), IN SYNC with `origin/main`. The pre-compaction
note that HEAD was `d3b0859` with unpushed work was stale — `d3b0859` and
`ad36eeb` are both already on origin. Nothing is unpushed; the versions round is
entirely uncommitted working-tree state.

### Full suite — MEASURED, and the delta was +4 not +3

`RAVEN_NO_USAGE_LOG=1 npm test` → **1511 tests / 1508 pass / 0 fail / 3 skipped**,
EXIT=0, duration 44.2s. Skips read individually at output lines 109/714/715 — the
same three this ledger has always carried (the file-URL fallback notice and the two
removed-capability phase2 tests); the versions suite ran 16/16.

The expected figure going in was 1510 (+3). It came back 1511, so the delta was
MEASURED rather than trusted: `git show :test/grab-overlay-style-versions.test.mjs
| grep -c '^test('` reports **12** for the blob the 1507 figure was taken against,
the working tree reports **16**, and `git diff --name-only` confirms no other test
file moved. So this round added **four** tests, not three — the restore-refusal
RENDER test (V17/V18) landed alongside the three fix tests and was easy to miscount
as pre-existing, which is also why V17/V18 were missing from the header's
enumeration. 1507 + 4 = 1511 exactly.

CLAUDE.md updated: the Verify figure, its measured delta and the reconciliation
command, plus the style-versions landmine extended with round 2's three defects
(shape-is-not-validity, editScope-is-a-live-toggle, a cap denominated in what the
panel shows), the V21/V22 one-rule-two-doors note, the V13/V17 two-mechanisms
finding, and the fixture revision that made V22 reachable.

### Sol round 3 (falsification) — DOES NOT SURVIVE

`codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium --skip-git-repo-check … < /dev/null > .claude/dialkit-2026-08-08/agent-output/SOL-R3.out 2>&1`
Brief: `.claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R3.md`. 160,475 tokens.
Verdict **DOES NOT SURVIVE — 4 × P2 + 3 × P3.**

Sol's own runtime replay was environment-blocked (`MachPortRendezvousServer … Permission
denied (1100)`; suite 0 pass / 16 skipped) and the harness's v4 baseline guard correctly
REFUSED that baseline and exited 1 before grading a mutant — the third sandbox to produce
that shape, and the guard earning its keep again. Sol therefore states the 22/22
measurement is not independently confirmed; the local measurement stands on its own log
(`/tmp/version-matrix-v3.log`, EXIT=0).

Findings:
- **P2 `browser/raven-grab.js:4543`** — an empty `edits: {}` map passes
  `Object.keys(edits).every(...)` vacuously, the row renders, and restoring it clears the
  live edit and applies nothing while returning `true`. The round-2 destructive-no-op
  defect, arriving through a shape the fix did not consider.
- **P2 `browser/raven-grab.js:4560`** — the `!window.CSS || typeof window.CSS.supports !==
  "function"` fallback reopens that same destructive no-op wherever `CSS.supports` is
  absent or overwritten.
- **P2 `browser/raven-grab.js:4692`** — `outstandingScopeSiblingPreview()` early-returns ""
  when `styleEditScopeSiblingsTarget !== selectedElement`, so a stale mirror owned by
  ANOTHER element blocks neither a save nor a restore.
- **P2 `browser/raven-grab.js:4622`** — `persistStyleVersions()` swallows every `setItem`
  throw and `saveStyleVersion` still returns `true`, so a quota failure is reported as a
  successful save. In scope because the per-selector cap makes N × 100 growth reachable —
  and the existing comment already names "a persist-failure notice in the panel" as the
  follow-up.
- **P3 `test/grab-overlay-style-versions.test.mjs:916`** — the validity test uses only
  `color`, so an implementation validating `color` alone passes it.
- **P3 `.claude/dialkit-2026-08-08/version-mutants.mjs:9`** — the corpus comment says
  6 + 4 + 3 = 16, which is 13. The SAME miscount the ledger reconciliation caught.
- **P3 `test/grab-overlay-style-versions.test.mjs:863`** — the V19/V20 labels in the test
  comments are reversed relative to the harness.

Sol REFUTED nothing offered: V13/V17 survived attack as separate function-versus-affordance
mechanisms, and V21/V22 as separate save-versus-read doors. Mirror parity and all three
`node --check`s passed under its own run.

### Round 3 fixes — IMPLEMENTED, NOT YET TESTED

All four P2s fixed in `browser/raven-grab.js`, mirrored (`cmp` MIRROR-OK),
`node --check` SYNTAX-OK. Nothing measured yet — no new test, no mutant, no
suite run. The three P3s are still open.

1. P2-1 (empty edits map) — `isStyleVersionEdits` now refuses a zero-property
   map before `.every()` can be vacuously true.
2. P2-2 (no-`CSS.supports` fallback) — closed with TWO mechanisms, deliberately
   not one. (a) A new `styleValueSupported(property, value)` replaces the inline
   `CSS.supports` expression at BOTH the commit gate and the read-side validity
   check, so the save path and the read path can never disagree — a read filter
   asking a different question would silently drop work the user legitimately
   saved, which is worse than the bug. Its fallback asks the ENGINE via a
   detached probe element rather than returning `true`. (b) `restoreStyleVersion`
   refuses BEFORE touching anything when there are no application targets or no
   property could apply — a version saved in THIS session never passes through
   `isStyleVersionEdits`, so the read filter alone does not cover it.
3. P2-3 (foreign stale mirror) — new `foreignScopeSiblingPreview()` scans
   `localStyleDrafts()` (a pure read; deliberately NOT `allStyleDrafts()`, which
   sweeps and can carry a detached draft — side effects no render-time blocker
   should run) plus the live globals when they are not this element's own, for a
   sibling-original entry whose `element === selectedElement`.
   `scopeSiblingPreviewBlocker()` now returns two distinct messages: owning a
   mirror vs receiving one.
4. P2-4 (silent persist failure) — `persistStyleVersions()` returns a boolean and
   sets `styleVersionPersistFailed`; `styleVersionNoteText()` renders that first,
   ahead of both blockers, because it is the only one of the three about work
   already done rather than work being refused. `saveStyleVersion` still returns
   true (the in-memory save is real); only durability is in question, and that
   is what the note says.

Still open: three P3s (property-generic validity fixture at test:916; harness
corpus comment 6+4+3=16 which is 13; reversed V19/V20 labels at test:863), four
new tests, four new mutants, matrix re-run WHOLE, full suite, CLAUDE.md, commit.

### Round 3 — three P3s closed, five tests + five mutants written, NOTHING MEASURED

P3 fixes (all test-side, no product code moved):
- `.claude/dialkit-2026-08-08/version-mutants.mjs` header — the corpus
  enumeration read "the original six, the four the done-gate round added, and
  the three from Sol round 2" (6+4+3=13) against a 16-test suite. Corrected to
  "the original six, the six the first Sol round added, the four from round 2
  and the five from round 3" (= 21), derived from the CLAUDE.md ledger's own
  deltas (6 -> 12 -> 16).
- `test/grab-overlay-style-versions.test.mjs` — the V19/V20 comment labels were
  REVERSED against the harness (harness V19 = the CSS-validity mutant, V20 = the
  stale-mirror mutant). Swapped.
- The validity fixture at the (now) V19 test was `color`-only, so an
  implementation special-casing colours and validating nothing else passed it.
  It now asserts BOTH `color: definitely-not-a-color` and
  `font-size: definitely-not-a-size` are unsupported, and seeds a second
  poisoned entry (`id: 98`, `poisoned-size`) keyed on `font-size`.

Five new tests (suite is 21 now; `node --check` SYNTAX-OK; count measured with
`grep -c '^test('`, not inferred):
  V23  an empty `edits: {}` map is dropped, not rendered
  V24  with `CSS.supports` deleted before boot, an unsupported stored value is
       still dropped by the engine probe — and a supported one still commits
  V25  an in-session version that can no longer apply refuses instead of
       clearing the live work (the observable is a DIFFERENT property from the
       version's own)
  V26  an element RECEIVING another selection's mirror refuses both save and
       restore, and the note names the direction
  V27  a persist failure is reported in the panel and the row still appears

Five new mutants V23-V27 added to version-mutants.mjs before the CONTROLS block.

NOT DONE at the time of writing: `EXPECTED_BASELINE_TESTS` still 16 (must become
21); suite header still claims "22 mutants ... against a 16p/0f/0s baseline" and
enumerates only V1-V22 — decisions 10-13 and the five new radius lines are
unwritten and must be MEASURED, not reasoned; matrix not re-run; full suite not
run; CLAUDE.md not updated; nothing committed; nothing pushed.

### Round 3 — matrix re-run WHOLE, V19 re-anchored, harness gained a pre-flight

- `EXPECTED_BASELINE_TESTS` bumped 16 -> 21 (version-mutants.mjs:207). Baseline
  re-measured green at 21p/0f/0s in BOTH runs.
- Run 1 aborted at V19 after 18 mutants (~25 min):
  `Error: V19: find-string absent — the target line was edited, re-anchor it`,
  EXIT=1. The round-3 fix replaced the inline CSS.supports expression with a
  call to styleValueSupported(), so V19's anchor died exactly as predicted.
  That abort is the harness working.
- V19 re-anchored to `      return styleValueSupported(property, edit.newValue);`
  -> `      return true;` (verified unique: one hit, browser/raven-grab.js:4599).
- HARNESS: added a PRE-FLIGHT loop that apply()s every mutant and pipes it
  through `node --check -` BEFORE the baseline, so presence/uniqueness/syntax
  are answered in seconds rather than 25 minutes in. `node --check -` was
  MEASURED to read stdin and to discriminate both ways (valid exit 0, invalid
  exit 1) rather than assumed — a pre-flight that always passes is the
  dangerous direction. All 27 mutants cleared pre-flight on run 2.

RUN 2 RESULT (/tmp/version-matrix-v4.log): **27 mutants, 27 killed, 0 survived;
2 CONTROLS green, 0 false-failed, EXIT=0**, against the declared 21p/0f/0s
baseline. Each of the five new mutants reddens exactly its own test:
  V23 radius 1 -> a stored version with an empty edits map is dropped
  V24 radius 1 -> with CSS.supports missing, the engine probe still drops it
  V25 radius 1 -> an in-session version that cannot apply refuses instead of clearing
  V26 radius 1 -> an element RECEIVING another selection's mirror refuses both
  V27 radius 1 -> a persist failure is reported in the panel, and the row still appears

FIVE radii moved between round 2 and round 3 (V3 5->6, V8 7->9, V9 16->21,
V17 2->3, V19 1->2) and every one moved because the round added five tests that
share those mechanisms — no guard was added to any of them. V19's move is the
readable one: it now reddens the probe test as well, because both tests grade
the same validity mechanism through two different fallbacks, and V24 is what
separates them.

FULL SUITE (/tmp/raven-full-suite.log): **1516 tests / 1513 pass / 0 fail /
3 skipped**, EXIT=0. The +5 over the ledgered 1511 is exactly the five browser
tests this round added. PROVENANCE CORRECTION: the earlier plan was to diff the
staged blob, and that is no longer possible — the auto-save hook re-staged the
file mid-session, so the index now holds 21 too, and
`git log --all -- test/grab-overlay-style-versions.test.mjs` is EMPTY (the suite
has never been committed, so there is no blob anywhere holding 16). What IS
measured: only two test files differ from HEAD, and
`test/grab-overlay-voice-alignment.test.mjs` counts 2 in HEAD and 2 in the
worktree, so no other test file moved. The 16 figure is the ledger's own prior
measurement, carried as a record rather than re-derived.
The 3 skips are the same three, READ INDIVIDUALLY at output lines 109 / 714 /
715 (the file-URL fallback notice and the two removed-capability phase2 tests),
never inferred from the total; none of the five new tests is among them — the
versions suite ran 21/21 under the FULL probe pattern.

- Mirror confirmed byte-identical (`cmp` -> MIRROR-OK).
- Suite header updated from measurement: decisions 10-14 added, five new radius
  lines, five moved radii corrected, baseline restated as 21p/0f/0s, and the
  pre-flight recorded alongside the five dead find-strings it now catches early.

NOT DONE: Sol falsification pass not yet run on round 3; CLAUDE.md ledger not
yet updated; nothing committed; nothing pushed.

### Round 4 — Sol falsification pass on the round-3 fixes: DOES NOT SURVIVE

Brief: .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R4.md
Raw:   .claude/dialkit-2026-08-08/agent-output/SOL-R4.out (931,316 bytes — a real
       run, not a silent empty exit; 178,290 tokens used)
Launch: nohup codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium \
        --skip-git-repo-check "$(cat .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R4.md)" \
        > .claude/dialkit-2026-08-08/agent-output/SOL-R4.out 2>&1 < /dev/null &

VERDICT: DOES NOT SURVIVE (2 x P2 + 1 x P3).

P2-1 OVERWRITTEN CSS.supports BYPASSES THE ENGINE PROBE (browser/raven-grab.js:4473).
  The round-3 fallback only runs when window.CSS.supports is ABSENT. A page that
  assigns `CSS.supports = () => true` before overlay hydration is never checked by
  the probe at all: an invalid stored value (`color: definitely-not-a-color`)
  passes all three call sites, setProperty silently ignores it, and restore CLEARS
  the user's live font-size work and returns success. That is round 3's own
  destructive no-op, arriving through the door round 3 left open.
  V24 (test:1117) only DELETES CSS.supports; it never installs a LYING callable.
  This also makes the suite header's "any page that overwrites it" claim FALSE
  (test:84) — a claim I wrote this round.

P2-2 THE PRE-RESTORE GUARD PERMITS PARTIAL RESTORES (browser/raven-grab.js:4925).
  It uses `.some()`, so ONE appliable property admits the whole restore. Sequence:
  save an in-session version with opacity + font-size; change font-size and add
  padding; have CSS.supports return true only for opacity. The revert clears
  padding, opacity applies, font-size is refused by commitStyleEdit — and that
  false return is IGNORED at browser/raven-grab.js:4939. Restore still returns
  true. The user sees a blend (saved opacity + newer font size + lost padding)
  under one version name — the exact blend decision 1 exists to prevent.
  V25 (test:1159) forces EVERY check false, so the mixed branch is outside the
  matrix entirely.

P3-3 THE SUITE HEADER NOW CONTRADICTS ITSELF (test:176). I updated the measured
  radius TABLE (V3 6, V8 9, V9 21) and did NOT update the explanatory paragraph
  beneath it, which still reads "V9's 16 is every test in the file ... V3's 5 is
  one blocker ... V8's 7 is every test that reloads the page. Exactly three radii
  moved between round 1 and round 2 (V3 3->5, V8 4->7, V9 12->16)". Two
  contradictory accounts of one matrix in one header.

SURVIVED Sol's inspection: the empty-map refusal, the receiving-mirror scan, and
persistence recovery — styleVersionPersistFailed IS cleared after any later
successful write (browser/raven-grab.js:4668), and save/delete re-render.

Sol's own replay was ENVIRONMENT-BLOCKED: Chromium died with
`MachPortRendezvousServer ... Permission denied (1100)`, giving 0 pass / 21
skipped, and the harness's v4 baseline guard REFUSED that baseline rather than
grading mutants against it. Same shape as round 2 — the guard earning its keep.
Mirror parity and all three syntax checks passed under Sol.

STATE at the time of the verdict: nothing committed, nothing pushed.
HEAD = ad36eeb = origin/main.

### Round 5 — fixing Sol R4's two P2s and one P3

Spec posted before the first edit:
  Goal   — close Sol R4's two P2s and one P3 on named style versions.
  Files  — browser/raven-grab.js + web/public/raven-grab.js (mirror),
           test/grab-overlay-style-versions.test.mjs,
           .claude/dialkit-2026-08-08/version-mutants.mjs, CLAUDE.md, session log.
  Axes   — browser/render + sessionStorage only. No src/, no api/, no network.
  Gates  — none new; push stays Andrew's.
  Accept — one new mutant per fix, each reddening exactly its own test; matrix
           re-run WHOLE; full suite green.

FIX 1 (P2-1) — styleValueSupported, browser/raven-grab.js ~4471.
  FIRST ATTEMPT WAS REVERSED MID-EDIT AND THAT REVERSAL IS THE INTERESTING PART.
  I initially deleted the CSS.supports branch entirely (probe-only). That closes
  Sol's finding but (a) breaks the V25 test's only seam — it makes a value
  unsupported with `window.CSS.supports = () => false` — and (b) makes the whole
  pre-restore appliability branch UNREACHABLE for in-session versions, since the
  probe is deterministic across time and every in-session value already passed
  the same probe at commit. A mechanism with no reachable trigger is not a fix.
  Shipped instead: the probe is UNCONDITIONAL and CSS.supports is ANDed with it.
  A hostile CSS.supports can now only make the check STRICTER — a lying `true`
  is overruled by the probe, a lying `false` refuses a restore (honest and
  recoverable). Nothing the page assigns makes it looser, which is the only
  direction that destroys work. The CSS.supports call is wrapped in its own
  try/catch (a page-installed thrower would otherwise escape the restore CLICK
  HANDLER); a throw is treated as no opinion and the probe still answers.
  Residual stated in the comment rather than guarded: poisoning
  CSSStyleDeclaration.prototype.setProperty/getPropertyValue defeats the probe.
  Pre-injection is unclosable from inside a shared realm (the composition-guard
  WeakSet precedent). Post-injection is not worth a mechanism, because it
  defeats the APPLY path in the same stroke — commitStyleEdit, clearStyleEdit
  and restoreStyleEdit all write through those same two methods, so nothing
  lands and nothing is destroyed. The harm was always the ASYMMETRY of a check
  that lies while the writes still work.

FIX 2 (P2-2) — restoreStyleVersion's pre-restore guard, ~4925.
  `.some()` -> `properties.length > 0 && properties.every(...)`. A restore is
  ALL-OR-NOTHING: under .some() one appliable property admitted the whole
  restore, the revert ran over everything, the appliable half landed and the
  rest was silently refused — the blend the feature exists to prevent,
  assembled by the guard meant to prevent it. The length clause has NO
  reachable trigger and says so (saveStyleVersion refuses an empty styleEdits
  map at ~4808; isStyleVersionEdits refuses an empty stored map at ~4583); no
  mutant pretends otherwise.
  commitStyleEdit's ignored return in the apply loop is now DOCUMENTED as
  legitimate rather than changed: it returns false for exactly three reasons —
  no targets (asserted immediately above, same synchronous block), an
  unsupported value (impossible, .every() just asked the same deterministic
  predicate about every property), and newValue === currentValue, which is a
  NO-OP and a successful restore. Honoring it blanket-style would report a
  correct restore as broken. Under .some() it WAS a genuine defect.

FIX 3 (P3-3) — the explanatory paragraph under the radius table (~test:176)
  contradicted the table it explains. Rewritten from the NEW measurement.

TESTS — two added, suite is 23 tests now (was 21):
  'a page that replaces CSS.supports with a liar cannot smuggle a bad stored
   value past the probe'  (a LYING CALLABLE via page.addInitScript, not the V24
   deletion; asserts both directions so a refuse-everything check cannot pass it)
  'a restore that can apply only PART of its version refuses instead of
   assembling a blend'  (CSS.supports = (p) => p === 'opacity'; padding is the
   discriminator — it is what the revert half clears and no refusal path touches
   it; asserts the fixture really split the two properties)
  Shared helper inlineStyles() gained `padding` (no test deepEquals the whole
  object; padding is a real row, STYLE_CATEGORIES 'spacing').

MEASURED: cp mirror + cmp MIRROR-OK; node --check both files SYNTAX-OK;
  grep -c '^test(' = 23; node --test test/grab-overlay-style-versions.test.mjs
  = EXIT=0, tests 23 / pass 23 / fail 0 / skipped 0. BOTH NEW TESTS PASSED ON
  THEIR FIRST RUN, WHICH IS WORTH NOTHING UNTIL THE MATRIX PROVES THEM RED.

MUTANTS — V25 re-anchored (its .some() line no longer exists; the `node --check -`
  pre-flight answered presence in seconds rather than aborting 18 mutants in, as
  V19's dead anchor did last round). V28 restores the round-3 shape (CSS.supports
  answers alone when present) and V29 weakens .every back to .some. V29 is NOT
  V25: V25 deletes the check outright and reddens both the all-unsupported and
  the partial test, V29 keeps it and reddens the partial one alone — which is
  what makes all-or-nothing a measured property rather than a restated one.
  EXPECTED_BASELINE_TESTS 21 -> 23.

### Round 5 — measurements

MATRIX v5 (/tmp/version-matrix-v5.log), re-run WHOLE, ~60 min detached:
  baseline: grab-overlay-style-versions.test.mjs 23p/0f/0s
  29 mutants, 29 killed, 0 survived; 2 controls, 0 false-failed.
  EXIT STATUS NOT CAPTURED — launched with nohup and no `echo EXIT=$?`. It adds
  nothing here and the header says so: `survived` and `falseFails` are the same
  two counters the summary line prints and `process.exitCode` is set from,
  computed in adjacent statements off one `results` array, and a throw (baseline
  not green, syntax error, skip drift) prints no summary line at all. Reading the
  summary IS reading the predicate. Capture it anyway next round.
  FIVE radii moved from v4, all for the same reason — the round added two tests,
  no guard was added to any of them:
    V8  9→10   every test that reloads the page
    V9  21→23  every test in the file (the sync hook is their shared entry point)
    V19 2→3    the new liar test grades the same stored-value check
    V24 1→2    ditto, through the no-CSS.supports fallback
    V25 1→2    deleting the appliability check breaks the partial-restore test too
  V28 radius 1 (only the liar test), V29 radius 1 (only the partial-restore test).
  V29 is NOT V25: V25 deletes the check and reddens both, V29 weakens .every to
  .some and still refuses when EVERY property is unsupported, so it reddens the
  partial test alone. That separation is what makes all-or-nothing MEASURED.

FULL SUITE (/tmp/full-suite-r5.log): RAVEN_NO_USAGE_LOG=1 npm test
  tests 1518 / suites 6 / pass 1515 / fail 0 / cancelled 0 / skipped 3 / todo 0
  duration_ms 44239.8, EXIT=0.
  The 3 skips READ INDIVIDUALLY at output lines 109 / 714 / 715 — the file-URL
  fallback notice and the two phase2 removed-capability tests. Same three the
  ledger has always carried; neither new test is among them.
  +2 over 1516 is exactly the two new browser tests in
  test/grab-overlay-style-versions.test.mjs (23 now, was 21).

HEADER EDITS (all move the count by zero): decision 11 corrected (the round-3
  wording claimed the check was engine-independent while CSS.supports was still
  the PRIMARY), decisions 15 and 16 added, the radius table re-measured, the
  27-mutant/EXIT=0 paragraph replaced, and the P3-3 explanatory paragraph
  re-derived from the v5 measurement rather than patched — it had decayed once
  already (quoting 16/5/7 under a table saying 21/6/9).

SOL ROUND 5 — ATTEMPT 1 RETURNED NOTHING, AND THAT IS NOT "NO FINDINGS".
  Brief at .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R5.md, launched detached
  (pid 25220), output → .claude/dialkit-2026-08-08/agent-output/SOL-R5-VERSIONS.out
  (638KB, gitignored). It contains NO findings and NO verdict line — grep for
  P1/P2/P3/SURVIVES returns nothing. Its final message is a status note only:
  the host sandbox blocked Chromium (`MachPortRendezvousServer … Permission
  denied (1100)`), the suite registered 23 tests and SKIPPED all 23, and the
  matrix correctly aborted at its declared 0-skip baseline — the v4 guard
  working. It then burned the remaining budget on web searches.
  Same class as the round-2 stored-generated-systems run that came back with
  `finish_reason: 'length'` and empty content: an environment-blocked or
  budget-exhausted adverse output must NEVER be dispositioned as a clean pass.
  The ONE thing it did establish, static and worth carrying: the 29/2 mutant and
  control counts, the harness syntax, and browser/public parity all check out by
  reading. That is not a verdict.
  Attempt 2 re-launched with an amended brief that states the browser gate is
  unavailable up front and scopes the pass to code reading.

### Round 5 — ledger updated, Sol re-run returned DOES NOT SURVIVE

CLAUDE.md EDITED (2 edits, both on the single-line ledger entries):
  (1) Verify line: figure 1516/1513 -> **1518 tests / 1515 pass / 0 fail /
      3 skipped** (measured live 2026-08-09 after the FOURTH Sol round), with
      the +2 provenance, the uncaptured-exit-status disposition, the five moved
      radii, the V29-vs-V25 separation, and the "an environment-blocked adverse
      output is not 'no findings'" paragraph. The old 1516/1513 entry was
      DEMOTED to "The previous ledgered figure was 1516/1513 ...", not deleted.
  (2) Named-style-versions landmine: appended the round-4 findings and round-5
      fixes after "...pre-flights every mutant through `node --check -` before the
      baseline." - the AND cross-check + direction argument, why dropping
      CSS.supports was drafted and REVERSED, the prototype-poisoning residual,
      V28-vs-V24, all-or-nothing `.every()` + the three-reason enumeration that
      earns commitStyleEdit's ignored return, and the P3 comment-decay fix.

VERIFIED: `cmp browser/raven-grab.js web/public/raven-grab.js` -> MIRROR-OK.
STATE: nothing committed, nothing pushed. HEAD = ad36eeb = origin/main.

SOL ROUND 5b - VERDICT: DOES NOT SURVIVE.
  Attempt 1 (pid 25220, SOL-R5-VERSIONS.out, 638KB) returned NOTHING - no
  findings, no verdict, only a status note that the host sandbox blocked
  Chromium (MachPortRendezvousServer ... Permission denied 1100), the suite
  registered 23 tests and SKIPPED all 23, and the matrix correctly aborted on
  its declared 0-skip baseline (the v4 guard working). It then burned its
  remaining budget on web searches. NOT a clean bill - same class as the
  round-2 finish_reason:'length' empty-content run.
  Attempt 2: brief at .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R5b.md
  (R5 brief + a READ-THIS-FIRST preamble: do not run npm test / the suite /
  version-mutants.mjs, do not web-search, this is a CODE-READING audit, the
  measurements are GIVEN, you MUST end with findings and a verdict line).
  Launched detached pid 44732, output ->
  .claude/dialkit-2026-08-08/agent-output/SOL-R5b-VERSIONS.out (340,040 bytes,
  gitignored).

  FINDINGS (read 2026-08-09):
  - P2-1 CHECK/USE RACE through a replaceable CSS.supports. The round-4 claim
    said the predicate is deterministic. It is not: `let n=0;
    CSS.supports=()=>++n===1` answers true to the `.every()` pre-check and
    false to the later `commitStyleEdit` call, so the revert runs, the apply
    refuses, and the newer edit is destroyed - the exact destructive no-op the
    guard exists to prevent, reassembled across two invocations.
  - P2-2 SELECTIVE prototype poisoning refutes the written "same stroke"
    acceptance. A wrapper can arm on a CSS.supports call and make only the
    NEXT getPropertyValue (the probe read) return non-empty, delegating every
    later target read/write natively - so the probe passes garbage while the
    apply path keeps working. Poisoning the probe need not disable apply.
  - P3-3 The suite header still states the pre-round-4 existential contract
    ("anything", "even one property") against decision 16's all-or-nothing.
  Sol explicitly UPHELD: the AND is monotone for a single stable invocation,
  cssText="" leaves no residue, every restore entry point reaches the guard,
  commitStyleEdit has only the three documented false-return branches, V28
  asserts both directions, and V29 is genuinely distinct from V25.

### Round 5b fixes — IN FLIGHT, tree is mid-edit

browser/raven-grab.js EDITED (2 edits, product code, syntax-checked OK):
  (1) styleValueSupported is now MEMOIZED per (property, value) in a
      null-prototype map, and the probe body moved into a new
      probeStyleValueSupported(). Closes Sol R5b P2-1 (the check/use race: a
      page-replaceable CSS.supports can answer true to the .every() pre-check
      and false to commitStyleEdit three statements later, so the revert runs
      and the apply refuses).
  (2) The probe's own primitives are CAPTURED AT LOAD via
      Function.prototype.call.bind on Document.prototype.createElement,
      CSSStyleDeclaration.prototype.setProperty and .getPropertyValue, with the
      live lookups left as fallbacks. The probe element is created FRESH per
      uncached call instead of a module-level div reset with cssText="".
      Closes Sol R5b P2-2 and REPLACES the false "same stroke" residual.
  (3) The restore comment's "same deterministic predicate" claim now names the
      memo as what makes it true.

DECISION, load-bearing: CSS.supports is deliberately NOT captured at load.
  Capturing it would make the AND unfalsifiable AND would make mutant V28
  ("CSS.supports answers alone again when present") SURVIVE, because a captured
  honest native cannot be told from the AND. The memo closes the flip; the AND
  closes the liar.

NOT YET DONE:
  - web/public/raven-grab.js NOT re-mirrored -> test/grab-bridge.test.mjs WILL
    FAIL until `cp browser/raven-grab.js web/public/raven-grab.js`.
  - P3-3 not fixed: test/grab-overlay-style-versions.test.mjs:93 ("anything")
    and ~:1200 ("even one property") still state the pre-round-4 existential
    contract against decision 16's all-or-nothing.
  - 3 new browser tests + 3 new mutants (V30/V31/V32) not written.
  - Matrix not re-run. V19/V24/V28 find-strings may be DEAD (the probe body was
    rewritten) — the harness pre-flights with `node --check -` and aborts.
  - Full suite not re-run (was 1518/1515/0/3).

### Round 5b fixes — tests + comments landed, harness NOT updated

DONE:
  - P3-3 fixed in test/grab-overlay-style-versions.test.mjs: header decision 12
    now reads "CAN APPLY EVERY PROPERTY BEFORE IT CLEARS ANYTHING" (was
    "ANYTHING", the pre-round-4 existential contract); the V25 comment now reads
    "EVERY property" and names V29 as the mutant reinstating `.some()`.
  - Decision 15's RESIDUAL rewritten: the old "post-injection poisoning defeats
    the APPLY path in the same stroke" claim is marked FALSE, with Sol R5's
    selective-wrapper refutation, pointing at new decision 18.
  - Decisions 17 and 18 added to the header.
  - THREE new browser tests appended (23 -> 26): a CSS.supports that flips
    between the pre-check and the apply; a page poisoning setProperty after
    load; a page poisoning getPropertyValue after load.
  - web/public/raven-grab.js re-mirrored; cmp MIRROR-OK.

TEST-DESIGN CORRECTIONS made before running (both would have measured nothing):
  - V31/V32 were first written with page.addInitScript. hydrateStyleVersions()
    is called at browser/raven-grab.js:14264, synchronously in the overlay IIFE
    at boot, so an init script is PRE-injection relative to the primitive
    capture — the residual decision 18 states is unclosable. Poison now goes in
    with page.evaluate AFTER boot.
  - The restore path is unreachable for these fixtures because the memo holds
    every verdict taken at commit time. The reachable seam is the COMMIT gate on
    a value probed for the FIRST TIME after boot; the observable is
    versionsState().sectionVisible staying false.
  - Property went outline-color -> color -> letter-spacing. outline-color has no
    row (STYLE_CATEGORIES excludes stroke longhands, browser/raven-grab.js:88);
    color classifies as the structured "color" control
    (classifyStyleControl:5796). letter-spacing classifies as plain text and its
    COMPUTED value is never "", which is exactly the "parser rejected it" signal
    the getPropertyValue poison has to forge.

### Round 5b, second half — the GLOBAL memo was measured wrong and replaced

The backgrounded run (task bbjt5pi89) came back EXIT=1 with TWO PRE-EXISTING
tests red on unchanged product logic:
  - 'an in-session version that can no longer apply refuses instead of clearing
    the live work'  ('' !== '12px', test line 1271)
  - 'a restore that can apply only PART of its version refuses instead of
    assembling a blend'  ('' !== '20px', test line 1359)

Diagnosis, and it is the round's real finding: a GLOBAL memo makes the
decision-16 pre-restore guard UNREACHABLE. Every in-session version's values
were probed at commit time and every stored version's by isStyleVersionEdits at
hydrate, so no version that can exist has a verdict left to change. That is
exactly the outcome round 4 refused when it declined to drop CSS.supports from
decision 15's AND — arriving by another route, and caught as a MEASUREMENT
rather than an argument.

FIX: the memo is SCOPED TO ONE RESTORE. Outside a restore every ask is live
(guard stays reachable); inside one, the pre-check and every commitStyleEdit
under it are one answer (P2-1 closed).

ALSO FOUND, unrelated and worse: a literal NUL byte had been written into
browser/raven-grab.js as the memo key separator — `property + "\x00" + value`.
test/no-private-paths.test.mjs SKIPS NUL-containing blobs, so that byte would
have silently exempted the largest file in the repo (and its mirror) from the
private-path leak gate. Replaced with a space.

Edits made:
  - browser/raven-grab.js: `var styleSupportMemo = null;` + an early live-probe
    return in styleValueSupported; restoreStyleVersion opens the memo and
    restores the outer in a `finally`, with the body extracted as
    applyStyleVersionRestore(version); three comment paragraphs corrected.
  - test header decisions 17 and 18 rewritten for the scoped form.
  - Mutant numbering fixed to V33 = global form (V30 = memo deleted).
  - node --check OK on both files; mirror re-copied, cmp MIRROR-OK.

### Round 5b — harness updated

.claude/dialkit-2026-08-08/version-mutants.mjs:
  - V24 RE-ANCHORED. Its find-string named `styleSupportProbe`, the cached probe
    element the fresh-probe-per-call rewrite deleted, so the `node --check -`
    pre-flight would have aborted the whole run. Now anchors on
    `    try {\n      var style = probeCreateDiv().style;`.
  - V30 added — memo deleted outright. Expected red: the flip test alone.
  - V31 added — probeSetProperty capture dropped back to a live lookup.
  - V32 added — probeGetPropertyValue capture dropped back to a live lookup.
  - V33 added — the memo goes GLOBAL again. Expected red: the two in-session
    refusal tests, NOT the flip test (the global form closes the flip too).
    V30 and V33 are two mutants on ONE mechanism separated by which set they
    redden — the V14/V16 and V25/V29 pattern again. V33 is in the matrix
    because it was MEASURED red, not argued against.
  - EXPECTED_BASELINE_TESTS 23 -> 26.
  - The probeCreateDiv capture shares the mechanism and has NO fixture; that is
    stated in decision 18 rather than implied by a mutant nobody wrote.
  - node --check OK; 33 mutant entries.

NOT YET DONE:
  - Suite not re-run since the scoping fix. Matrix not re-run WHOLE. Full suite
    not re-run (was 1518/1515/0/3).
  - CLAUDE.md Verify figure + named-style-versions landmine not updated.
  - done-gate not run. Nothing committed. Nothing pushed.

### Round 5b, third half — a FOURTH page-replaceable primitive, found by reading

While drafting the round-6 Sol brief I read probeStyleValueSupported and found
the same defect class P2-2 had just closed, one line over:

    var style = probeCreateDiv().style;      // HTMLElement.prototype.style — LIVE

createElement, setProperty and getPropertyValue were captured at load; `.style`
is an ACCESSOR on HTMLElement.prototype and is page-replaceable exactly like
them. Redefine the getter post-load to hand back a declaration that already
carries the property, and getPropertyValue returns a non-empty string for
garbage the parser rejected — the probe reports TRUE, which is the destructive
direction. Decision 15's AND does not rescue it: the same page replaces
CSS.supports with a liar in the same breath.

FIX (browser/raven-grab.js):
  - probeGetStyle added, captured via
    Function.prototype.call.bind(Object.getOwnPropertyDescriptor(
      HTMLElement.prototype, "style").get)
  - the probe reads `probeGetStyle(probeCreateDiv())`
  - the capture is ALL-OR-NOTHING and the comment now says so: every raw lookup
    happens before any assignment, so an engine missing one prototype falls back
    on all four rather than running a half-captured probe.
  - ALSO corrected: the memo-key comment stated the wrong injectivity reason
    ("a space cannot START a CSS property name"). The real property is that a
    CSS property NAME contains no whitespace, so the FIRST space always
    delimits; values legitimately contain spaces.
  - node --check OK; mirror re-copied, cmp MIRROR-OK; NUL count 0.

The v6 matrix run was KILLED at 15/35 (task bkbhuxwi0) rather than finished —
the fix invalidates it, and editing the suite mid-run would have moved the
26p/0f/0s baseline it had already declared. Confirmed first that the harness
writes only to a mkdtemp dir and serves mutants via RAVEN_GRAB_ASSET_PATH, so
no tracked file was left mutated (git status clean of surprises).

### Round 5b, third half — the test, the mutant, the re-measurement

TEST (test/grab-overlay-style-versions.test.mjs, now 27):
  "a page that poisons the style accessor after load cannot make the probe
  accept a bad value". Marker `// V34 — decision 18.`

  The lever is different from V31/V32's: `style` is an ACCESSOR, so the poison
  is Object.defineProperty on HTMLElement.prototype, not an assignment to a
  data property. The wrapper is SELECTIVE for the same reason the other two
  are — it answers with the decoy only for a detached, attribute-less <div>,
  which is exactly what the probe builds and nothing the apply path touches —
  so the "same stroke" argument is refuted here too: the page keeps working
  while the probe alone would be fooled. The decoy already carries
  `letter-spacing: 2px`, so writing garbage to it changes nothing and reading
  it back returns non-empty, forging the "the parser accepted it" signal from
  the other side. window.CSS.supports is stubbed to `() => true` or the AND
  rejects before the probe ever runs.

  Preconditions asserted, not assumed: sectionVisible === false before the
  edit (the observable), and a deepEqual proving the poison is BOTH live and
  selective — a fresh detached div reads '2px' (decoy) while #card reads its
  own real value (delegated). Then the both-directions control: font-size 24px
  still commits and saves under the poisoned accessor, so a probe that had
  simply stopped working could not satisfy the test.

HEADER decision 18 rewritten: three primitives -> four, naming the accessor,
the all-or-nothing capture, and the fact that this one was found by READING
one round after the other three were captured — the standing point that a
matrix measures the mechanisms it names.

HARNESS (.claude/dialkit-2026-08-08/version-mutants.mjs):
  - V24 RE-ANCHORED A SECOND TIME. Its find-string named the exact line the
    .style fix rewrote; the previous re-anchor was one round old. Now anchored
    on `try {\n      var style = probeGetStyle(probeCreateDiv());`.
  - V34 added (probeGetStyle reverts to a live lookup).
  - EXPECTED_BASELINE_TESTS 26 -> 27.
  - All four find-strings verified present EXACTLY ONCE in browser/raven-grab.js
    before launching, rather than trusting the pre-flight to catch it late.

MEASURED: suite 27 tests / 27 pass / 0 fail / 0 skipped, EXIT=0
(/tmp/versions-r5d.log). Matrix re-run WHOLE, accepted the 27p/0f/0s baseline.

### Round 5b — measured, and the header re-derived from the measurement

MATRIX v6 (/tmp/version-matrix-v6.log), re-run WHOLE:
  34 mutants, 34 killed, 0 survived; 2 CONTROLS, 0 false-failed, EXIT=0,
  against a declared 27p/0f/0s baseline.

The exit STATUS is captured this time (`echo "EXIT=$?"` appended INSIDE the
log), which the previous round's header said to do and did not.

FULL SUITE: 1522 tests / 1519 pass / 0 fail / 3 skipped, EXIT=0
(/tmp/full-suite-r5d.log). The +4 over 1518 is exactly the four tests this
round added to test/grab-overlay-style-versions.test.mjs (27 now): the
CSS.supports FLIP test and the three POISON tests (setProperty,
getPropertyValue, and the .style accessor). Nothing else in the round moves
the count — the product fix, the mirror, the five new mutants, the V24
re-anchor and the whole header rewrite are all count-neutral.
The 3 skips are the same three, READ INDIVIDUALLY at output lines
109/714/715 (the file-URL fallback notice and the two removed-capability
phase2 tests), not inferred from the total; none of the four new tests is
among them, and the versions suite ran 27/27 under the FULL probe pattern.

RADII, all re-measured (never carried forward):
  V1=2 V2=1 V3=9 V4=1 V5=1 V6=1 V7=2 V8=10 V9=27 V10=1 V11=1 V12=1 V13=1
  V14=1 V15=1 V16=1 V17=3 V18=1 V19=3 V20=1 V21=1 V22=1 V23=1 V24=5 V25=2
  V26=1 V27=1 V28=4 V29=1 V30=1 V31=1 V32=1 V33=2 V34=1

FIVE radii moved from round 5 (count the list, do not trust the adjective —
this line said FOUR over a five-item list until it was re-read), all for the
same reason — the round added four tests and no guard was added to any of
them:
  V1 1→2 and V9 23→27 (widen with any test that restores / needs the
    section to exist);
  V3 6→9 (the blocker's shared radius, same reason);
  V24 2→5 and V28 1→4 — the two CSS.supports mutants — because all three
    poison tests stub `CSS.supports = () => true` so the AND cannot reject
    before the probe runs.
That last claim was VERIFIED against the log's own red lists rather than
reasoned: V24's five reds and V28's four reds are exactly the named tests.
The gap between V24=5 and V31/V32/V34=1 is exactly the difference between
removing the probe entirely and removing ONE primitive.

V30 vs V33 is what makes the memo's SCOPE measured rather than restated:
V30 (memo deleted) reddens the flip test ALONE; V33 (memo global) reddens
the two in-session refusal tests and NOT the flip test.

HEADER rewritten in test/grab-overlay-style-versions.test.mjs:
  - dead find-strings five → SEVEN (V24's died TWICE — round 5 and again in
    round 5b, the second time because the .style capture rewrote the exact
    line the first re-anchor had chosen);
  - summary line 29/29 vs 23p → 34/34 vs 27p, EXIT=0;
  - radius table updated + five new rows V30–V34;
  - interpretation paragraph re-derived from the measurement.

VERIFIED: cmp browser/raven-grab.js web/public/raven-grab.js → MIRROR-OK;
NUL count 0 in browser/raven-grab.js.

SOL ROUND 6 LAUNCHED detached, pid 36027:
  nohup codex exec -m gpt-5.6-sol -c model_reasoning_effort=high \
    --skip-git-repo-check "$(cat .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R6.md)" \
    > .claude/dialkit-2026-08-08/agent-output/SOL-ROUND6.out 2>&1 < /dev/null &
  Confirmed RUNNING, 13,275 bytes written. agent-output/ is gitignored.

NOT YET DONE:
  - Sol round 6 still running; its output must be READ from the file, and an
    environment-blocked or empty result must NOT be dispositioned as "no
    findings" (round 5 attempt 1 and the round-2 stored-systems run both
    came back that way).
  - CLAUDE.md NOT updated: the Verify figure still says 1518/1515/0/3 and
    must become 1522/1519/0/3 with the +4 accounted; the named-style-versions
    landmine needs the round-5b entry (memo scope global-vs-restore-scoped,
    the FOUR captured primitives, the .style find-by-reading).
  - done-gate not run. Nothing committed. Nothing pushed.

### Sol round 6 — DOES NOT SURVIVE (3 × P3, no product defect claimed), all three dispositioned

Sol round 6 exited. pid 36027, output 522,937 bytes at
`.claude/dialkit-2026-08-08/agent-output/SOL-ROUND6.out` (gitignored).
Verdict line: DOES NOT SURVIVE. Three findings, all P3, all CLAIM defects —
Sol's own closing line: "this audit does not indicate a required product-code
change." What it says SURVIVES: every apply enters through
`restoreStyleVersion`; the `finally` restores nested memo state; V30 and V33
exercise distinct scopes; the key invariant is correct for accepted property
names; null-prototype storage blocks the claimed `Object.prototype` pollution;
the four runtime probe operations are covered; the mirror is byte-identical.

**P3-1 — "the fallback claim is false." CONFIRMED, and FIXED with product code
(against Sol's own "no product change needed" framing).** `browser/raven-grab.js`
~4554. `Function.prototype.call.bind(undefined)` does NOT throw at bind time, so
a prototype whose METHOD is `undefined` — as opposed to a missing prototype
OBJECT — never selected the live fallback; the bound wrapper threw later, the
probe's own catch swallowed it, and the probe returned false, REFUSING every
supported edit. Verified by measurement, not by reading:

    node -e '...Function.prototype.call.bind(undefined)...'
    → "bind did NOT throw" / "call threw: TypeError"

Fix: a `typeof` gate ahead of the four binds (`createElement`, the `style`
descriptor's getter, `setProperty`, `getPropertyValue`), throwing into the
existing catch so the ALL-OR-NOTHING property the comment already claimed is
actually delivered. **NO MUTANT KILLS IT and both the source and the suite
header say so**: in a conforming engine an instance method IS the prototype
method, so deleting `CSSStyleDeclaration.prototype.setProperty` breaks the
captured path and the live fallback identically and no Chromium fixture can
separate a guarded build from an unguarded one. The environment where it bites
is a shim putting these on each declaration INSTANCE. Kept on the `isIpLiteral`
precedent — a clause with no reachable trigger in the test environment must SAY
so rather than let a matrix imply coverage. Round 4's opposite precedent ("a
mechanism with no reachable trigger is not a fix") does not apply: that one made
an EXISTING guard unreachable, a net loss; this one costs three lines and makes
a written claim true.

**P3-2 — "the V31/V32 fixtures are not selective in the way the header claims."
CONFIRMED by reading all three fixtures.** Only V34's poison is RECEIVER-
selective (`!this.isConnected && this.tagName === "DIV" &&
this.attributes.length === 0`). V31 matches on the (property, value) PAIR and
V32 on an EMPTY `letter-spacing` read — and **neither can do better**, because a
`CSSStyleDeclaration` exposes no owner element, so nothing inside `setProperty`
can ask whether `this` belongs to a detached div. Consequences confirmed in the
source: under the V31 mutant the poison also launders the CONNECTED `#card`
apply to `2px`, and under V32 it also rewrites the target's own original-inline
capture at `browser/raven-grab.js:4284` (`element.style.getPropertyValue(property)`,
which reads `""` for an element with no inline letter-spacing).

**The mutants stay killed and the refutation of round 4 stands** — what was
false is only the characterisation. Round 4's residual said the same poisoning
defeats the apply path "in the same stroke", so nothing lands and nothing is
destroyed. Each fixture measures the opposite on BOTH halves: every value other
than the probe's own garbage commits natively (each test's both-directions
control), and for the garbage pair itself a `2px` the user never typed DOES land
on the element. A value the user never typed arriving on the element is exactly
the destruction round 4 said could not happen.

Corrected in three places, because the false sentence had been copied out of the
suite header into the ledger this session: the header's V31/V32/V34 paragraph,
the two fixture comments (V31's "Nothing about the apply path breaks — which is
the whole point" was the same claim inline), and CLAUDE.md's landmine paragraph.

**P3-3 — "the audited baseline claim is stale (26p/0f/0s vs 27)." REFUTED as
cited, but there IS a stale 26 and it is in the BRIEF.**

    grep -n "26p/0f/0s" test/grab-overlay-style-versions.test.mjs \
      .claude/dialkit-2026-08-08/version-mutants.mjs   → NO MATCH, exit 1
    suite header reads "against a declared 27p/0f/0s baseline"
    harness line 276: EXPECTED_BASELINE_TESTS = { '…-style-versions.test.mjs': 27 }
    grep -n "26p/0f/0s" .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R6.md
      → 38:> declared 26p/0f/0s baseline, plus a full suite.

So the number is correct everywhere it is enforced, and stale exactly once — in
the round-6 brief's quoted round-5b claim paragraph, which I carried forward
without re-measuring. Sol read the brief, attributed the staleness to the files,
and got the location wrong while being right that a 26 existed. **A brief is a
claim like any other and decays the same way; the GIVEN measurements at the top
of the brief said 27 and the claim paragraph said 26, and nothing reconciled
them.** No repo number changed.

ALSO THIS SESSION, before Sol returned:
  - CLAUDE.md Verify figure 1518/1515/0/3 → 1522/1519/0/3, +4 accounted as
    exactly the four new tests, 3 skips named at output lines 109/714/715,
    matrix 34/34/0 + 2 controls EXIT=0 vs a declared 27p/0f/0s baseline,
    seventh dead find-string (V24's, SECOND time), FIVE radii moved, and the
    V30-vs-V33 scope separation carried as the entry to remember.
  - CLAUDE.md named-style-versions landmine extended with the whole round-5b
    entry.
  - A MISCOUNT IN MY OWN WRITING, caught by re-reading: both the suite header
    and the session log said "Four radii moved" over a FIVE-item list
    (V1 1→2, V3 6→9, V9 23→27, V24 2→5, V28 1→4). Corrected in both; the
    header line now tells the next reader to count the list rather than trust
    the adjective.
  - VERIFIED: `cmp browser/raven-grab.js web/public/raven-grab.js` → MIRROR-OK;
    `node --test test/no-private-paths.test.mjs` → 4 tests / 4 pass / 0 fail.

STATE AT THIS POINT: product code changed (the `typeof` gate), so the mirror was
re-copied (`cmp` → MIRROR-OK), `node --check` is SYNTAX-OK on both edited files,
the suite still registers 27 tests, and **matrix v7 is running WHOLE**
(`/tmp/version-matrix-v7.log`, `EXIT=` appended INSIDE the file). The three
find-strings that touch the capture block anchor on the `probeSetProperty` /
`probeGetPropertyValue` / `probeGetStyle` ASSIGNMENT lines, none of which the fix
rewrote, so no dead anchor is expected — the harness's `node --check -`
pre-flight is what will say so. Full suite after the matrix. Not committed, not
pushed, done-gate not yet run.

#### Round-6 measurements (both re-run, not carried forward)

Matrix v7 — `/tmp/version-matrix-v7.log`, EXIT written INSIDE the file:

    baseline: grab-overlay-style-versions.test.mjs 27p/0f/0s
    34 mutants, 34 killed, 0 survived; 2 controls, 0 false-failed
    EXIT=0

Re-run WHOLE because product code changed. No dead find-string this time — the
three capture-block mutants anchor on the `probeSetProperty` /
`probeGetPropertyValue` / `probeGetStyle` ASSIGNMENT lines and the `typeof` gate
sits above them, so nothing they pin was rewritten; the harness's `node --check -`
pre-flight confirmed it rather than my reading of it.

**Radii diffed v6 → v7 and are IDENTICAL** (`diff` over the mutant+radius lines →
RADII-IDENTICAL-v6-v7). That is the expected answer and is worth stating rather
than assuming: the round added no tests and no guards, so a moved radius would
have meant something changed that nobody accounted for. Every previous round in
this cadence moved several, because every previous round added tests.

Full suite — `/tmp/full-suite-r6.log`, EXIT written INSIDE the file:

    ℹ tests 1522   (line 1580)
    ℹ pass 1519
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 3
    ℹ todo 0
    EXIT=0

**Count UNCHANGED from the round-5b figure, and that is also expected rather than
a non-event**: round 6's product fix added no test (deliberately — no Chromium
fixture can separate a guarded build from an unguarded one) and its other two
findings were comment-only. The 3 skips were read INDIVIDUALLY at output lines
109 / 714 / 715 rather than inferred from the unchanged total:

    109: ﹣ file URL fallback marks reveal and settle checks as unavailable
           # browser available — fallback path not used
    714: ﹣ [phase2D fix B] a later committed batch applies on the first poll …
           # removed capability: overlapping committed batches …
    715: ﹣ [phase2C tray] overlapping committed batches both finish …
           # removed capability: overlapping committed batches …

The same three this ledger has always carried. None is in the style-versions
suite, which ran 27/27 under the FULL probe pattern.

#### Round 7 launched

`.claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R7.md`, run as
`codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium --sandbox read-only
… < /dev/null`, output to the gitignored `agent-output/SOL-ROUND7.out` with
`EXIT=` appended inside. The brief states the browser gate is unavailable UP
FRONT and scopes the pass to code reading — rounds 5 and 6 each lost an attempt
to the sandbox (`MachPortRendezvousServer … Permission denied (1100)`) and came
back with a status note and no verdict, which must never be dispositioned as
"no findings".

Two attacks in it are aimed at claims I made rather than at the code:
  - **Does the `typeof` gate change behaviour in the CONFORMING case?** It must
    not. A fix that starts refusing edits a healthy Chromium used to accept is
    the exact harm it was written to remove, arriving from the other direction —
    that would be a P1, not a P3.
  - **Is "no mutant can kill it" TRUE?** Sol is asked to construct the Chromium
    fixture that separates a guarded build from an unguarded one, or to state
    plainly that none exists. If one exists, the guard is untested by CHOICE
    rather than by necessity, and the `isIpLiteral` precedent does not cover it.

DOC FIXES LANDED THIS ROUND
  .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R6.md:38 — 26p/0f/0s → 27p/0f/0s
    (verified: grep now reports 27 at lines 20, 38 and 120, and nothing at 26)
  CLAUDE.md — the false "each of the three poison fixtures is SELECTIVE" sentence
    replaced with what the fixtures actually do, why neither V31 nor V32 can be
    receiver-selective, the two consequences (the laundered #card apply, the
    rewritten original-inline capture at browser/raven-grab.js:4284), and why the
    refutation of round 4 survives anyway. Plus a full round-6 entry: the
    measured bind-of-undefined fact, the typeof gate, its deliberate
    uncoveredness on the isIpLiteral precedent, why round 4's opposite precedent
    does not apply, and the P3-3 split verdict.

### Sol round 7 — DOES NOT SURVIVE (1 × P2 + 2 × P3) — verification in progress

Sol round 7 exited. 385,612 bytes at
.claude/dialkit-2026-08-08/agent-output/SOL-ROUND7.out (gitignored), EXIT=0,
159,960 tokens. Verdict line: DOES NOT SURVIVE.

P2-1 — "the typeof gate IS testable in Chromium; the 'no fixture can separate a
guarded build from an unguarded one' claim is FALSE."
  browser/raven-grab.js:4555, test/grab-overlay-style-versions.test.mjs:204,
  .claude/dialkit-2026-08-08/version-mutants.mjs:199
  Sol CONSTRUCTED the fixture I said could not exist:
    - before overlay load, retain the native `style` getter and the native
      declaration methods
    - redefine HTMLElement.prototype.style so every returned declaration
      receives WORKING OWN setProperty / getPropertyValue
    - DELETE those two methods from CSSStyleDeclaration.prototype
    - load the overlay and commit a SUPPORTED value
  Guarded build: the typeof gate sees the missing prototype methods, throws into
  the catch, takes the live fallbacks, which reach the working INSTANCE methods —
  the edit commits. Unguarded build (mutant deletes the gate): binds `undefined`,
  the probe throws on first use, its own catch returns false, and the user sees
  EVERY SUPPORTED EDIT REFUSED with the Versions section never appearing.
  This is exactly the instance-shim environment the comment names, and Chromium
  CAN host it. Sol also refuted my use of the precedent: isIpLiteral is reachable
  but OUTCOME-NEUTRAL (canonicalization forces the same result,
  src/reference-store.ts:529), whereas this gate CHANGES OBSERVABLE BEHAVIOUR in
  its claimed environment. So "unfalsifiable by necessity" was wrong — it is
  untested BY CHOICE, and the round-6 disposition rested on that.
  → OWED: a browser test + mutant V35, and a rewrite of the claim in three places
    (browser/raven-grab.js comment, suite header, decision 18) plus CLAUDE.md.

P3-2 — "the header falsely says BOTH V31 and V32 prove that 2px LANDS."
  test/grab-overlay-style-versions.test.mjs:371 (header), :1678 (V34 fixture),
  browser/raven-grab.js:4284
  Under V32 the poisoned READER makes the probe admit the invalid edit and
  records `2px` as the supposed original inline value — but the captured NATIVE
  SETTER rejects the garbage and the fixture never clears or restores that
  property, so 2px is NEVER WRITTEN during that test. It turns red because the
  invalid edit makes the Versions section visible at line 1713, not because it
  measures landing. V31 DOES prove landing (its setter substitutes 2px on the
  CONNECTED #card; the assertion at :1663–1666 observes that write).
  So the round-4 refutation survives THROUGH V31, and the claim that EACH
  fixture measures landing does not. This is the round-6 correction being
  corrected again — I widened the claim from V34-only to all-three in the same
  breath as fixing it.
  → OWED: correct the header paragraph, the V32 fixture comment, and the
    identical sentence I just wrote into CLAUDE.md this segment.

P3-3 — "the cited precedent file does not exist." CONFIRMED BY MEASUREMENT:
    ls src/reference-forget.ts            → No such file or directory
    grep -rn isIpLiteral src/             → src/taste.ts:1038 (a local const,
                                            a DIFFERENT thing), and the real
                                            function at src/reference-store.ts:479
                                            (+ call sites :508, :545)
    grep -rc "reference-forget\.ts"       → test/grab-overlay-style-versions.test.mjs:1
                                            CLAUDE.md:1
                                            browser/raven-grab.js:1
  NOTE THE TRAP: grep -c counts LINES, not occurrences, and CLAUDE.md's line 5
  is one enormous line — re-count with `grep -o … | wc -l` before assuming one
  fix closes it.
  test/reference-forget.test.mjs DOES exist, which is how the wrong src name
  became plausible; deleteReference is at src/reference-store.ts:335.
  → OWED: three citation fixes (overlay comment, suite header/decision 18,
    CLAUDE.md), all `src/reference-forget.ts` → `src/reference-store.ts:479`.

CLAIMS SOL SAYS SURVIVE (do not re-litigate without new evidence)
  - a healthy Chromium takes the captured path; all four checked members are functions
  - `throw new TypeError` into the shared catch is sound for selecting the
    conservative live fallback
  - typeof === "function" cannot GUARANTEE behaviour (a callable proxy can throw
    or lie), and the capture setup also reaches unchecked
    Object.getOwnPropertyDescriptor and Function.prototype.call.bind — but all of
    that needs PRE-INJECTION poisoning, which the source already excludes
  - V34 is genuinely receiver-selective; orderedSelection() removes disconnected
    targets before style application
  - V31 still refutes round 4's "the apply path fails in the same stroke"
  - the mirror is byte-identical; the source declares 27 tests, 34 mutants,
    2 controls and the 27-test baseline

MEASUREMENTS THIS ROUND (both re-run WHOLE, not carried forward)
  matrix v7  /tmp/version-matrix-v7.log
    line 1: baseline: grab-overlay-style-versions.test.mjs 27p/0f/0s
    34 mutants, 34 killed, 0 survived; 2 controls, 0 false-failed
    EXIT=0
    radii diffed v6 → v7 = RADII-IDENTICAL-v6-v7 (expected: the round added no
    tests and no guards, so a MOVED radius would have meant something
    unaccounted for — every prior round in this cadence moved several)
  full suite  /tmp/full-suite-r6.log
    line 1580: ℹ tests 1522 / pass 1519 / fail 0 / cancelled 0 / skipped 3 / todo 0
    EXIT=0 (written INSIDE the log)
    the 3 skips read INDIVIDUALLY, marker is `﹣` (U+FE63) not `-`:
      109: file URL fallback marks reveal and settle checks as unavailable
           # browser available — fallback path not used
      714: [phase2D fix B] a later committed batch applies on the first poll …
      715: [phase2C tray] overlapping committed batches both finish …
    count UNCHANGED, which is expected: round 6's product fix deliberately added
    no test and its other two findings were comment-only

STATE: nothing committed, nothing pushed, done-gate NOT run on any round-7 claim.
HEAD = ad36eeb = origin/main.

#### Round-7 verification — P3-2 and P3-3 CONFIRMED, P2-1 confirmed but Sol's RECIPE is under-specified

P3-2 CONFIRMED by reading the fixtures. V32 poisons ONLY getPropertyValue; the
NATIVE setter still rejects `definitely-not-a-length`, so no `2px` is ever
written to #card during that test. Its red comes from the `sectionVisible ===
false` assertion — the invalid edit being RECORDED makes the Versions section
appear. V31 DOES measure landing: its poisoned setter substitutes 2px on the
connected #card and its assertion reads #card's letter-spacing and asserts ''.
Latent consequence stated rather than hidden: the V32 poisoned reader corrupts
the original-inline capture at browser/raven-grab.js:4284, so a later
clear/revert would WRITE a value the user never typed. Real, unasserted — a
documented consequence, not the thing the test measures.

P2-1 CONFIRMED that a fixture exists — but SOL'S RECIPE AS WRITTEN WOULD BREAK
THE GUARDED BUILD TOO. Measured: getComputedStyle(...).getPropertyValue at
browser/raven-grab.js lines 1858, 3228, 3474, 4245, 5277, 5492, 6459. Deleting
getPropertyValue from CSSStyleDeclaration.prototype while shimming only
`element.style` leaves every COMPUTED declaration without the method, so the
overlay dies wholesale in both builds. An adverse report's construction is a
claim like any other.

Hazards checked before designing the shim:
  grep -n "\.style = " browser/raven-grab.js  -> NOTHING (getter-only redefinition
                                                is safe; a setter is included anyway)

#### Round-7 fixes LANDED, then the matrix baseline went RED — a THIRD declaration source

Landed this segment:
  - test/grab-overlay-style-versions.test.mjs: NEW 28th test, the instance-shim
    fixture Sol said could not exist. Suite header decision 18 rewritten (the
    "no mutant kills it" claim is now false and says so; citation corrected to
    src/reference-store.ts:479). Selectivity paragraph rewritten (V31 measures
    landing, V32 does not). V32 fixture comment narrowed.
  - .claude/dialkit-2026-08-08/version-mutants.mjs: mutant V35 added (deletes the
    typeof gate); EXPECTED_BASELINE_TESTS 27 -> 28. Harness syntax OK; V35
    find-string verified present AND unique in browser/raven-grab.js.
  - browser/raven-grab.js: the "NO MUTANT KILLS THE typeof GATE" comment replaced
    with the corrected one. Mirrored to web/public/raven-grab.js, cmp clean.
  - CLAUDE.md: both false claims corrected; the single remaining
    "src/reference-forget.ts" string is inside the new text that names it as
    nonexistent.

BLOCKER — the matrix ABORTED at baseline (the v4 guard working):
  baseline: grab-overlay-style-versions.test.mjs 27p/1f/0s
  Error: baseline not green — nothing below is measurable        EXIT=1
The NEW test is the 1 fail. Direct run: 28 tests / 27 pass / 1 fail, failing at
selectElement's waitForFunction (5000ms timeout), reached via reloadAndSelect.

ROOT CAUSE, measured with a pageerror probe (.claude/dialkit-2026-08-08/agent-output/
probe.test.mjs, gitignored):
  PAGEERROR: style.getPropertyValue is not a function
      at declarationsFor (raven-grab.js:3325:21)
      at winningDeclarationsFromMatches (:3389/:3390)
      at winningDeclarations (:3404)
      at tokenMapFor (:3490:44)
There is a THIRD source of CSSStyleDeclaration objects the shim does not cover:
CSS RULE declarations (`rule.style` off CSSStyleRule.prototype), which
declarationsFor walks. Sol's recipe missed getComputedStyle; my correction to it
missed CSSStyleRule.style. The overlay boots fine under the shim (host: true,
shadow: true) — the throw only fires on SELECTION.

NEXT: add CSSStyleRule.prototype.style to the shim's pass-through, re-run the
suite, then re-run the matrix WHOLE, then the full suite, then done-gate.

STATE: nothing committed, nothing pushed. HEAD = ad36eeb = origin/main.

#### The shim now covers all three sources — suite GREEN at 28p/0f/0s

A SHIM HAS TO COVER EVERY SOURCE OF A DECLARATION, and there were three, not
one. The `addInitScript` no longer names a prototype; it loops
`[HTMLElement, SVGElement, CSSStyleRule]`, redefining each one's `style` accessor
to pass its declaration through the same `shim()`, plus `window.getComputedStyle`.
`SVGElement` rides along because it carries its own `style` accessor and the
overlay renders SVG — unexercised on this path today, and cheaper than the next
debugging round.

Two further self-inflicted failures before green, both in the NEW assertions and
neither in the product:
  1. `document.styleSheets[0].cssRules[0].style` — sheet 0 rule 0 is not
     guaranteed to be a CSSStyleRule on this fixture. The precondition now SCANS
     for the first rule carrying both `style` and a string `selectorText`.
  2. The closing negative-direction assertion read `.letterSpacing` off the
     shared `inlineStyles()` helper, which returns only fontSize / opacity /
     padding — so it compared `undefined !== ''` and failed on correct code.
     It reads letter-spacing directly now, the way V31/V32 already do; the
     shared helper was deliberately NOT widened.

Measured: node --test test/grab-overlay-style-versions.test.mjs
  28 tests / 28 pass / 0 fail / 0 skipped   EXIT=0

The green is worth nothing until V35 turns it red — matrix launched detached to
.claude/dialkit-2026-08-08/agent-output/matrix-v7.log with the exit code written
INSIDE the file.

#### The first v7 matrix run was DISCARDED — I edited the test file while it ran

Nine mutants in, I made a behaviour-neutral edit to the new test's precondition
(a null rule-scan reported itself instead of throwing "Cannot read properties of
null"). That is still a tree change mid-measurement, so the run stopped being a
measurement of one tree. Killed it, confirmed the process EXITED (`pgrep`), and
confirmed the kill left no mutant applied — `cmp browser/raven-grab.js
web/public/raven-grab.js` clean and the only diff in the overlay is last
segment's intended comment rewrite. Re-ran the suite on the final tree
(28p/0f/0s, EXIT=0) and relaunched the matrix WHOLE. The aborted log is kept as
matrix-v7-ABORTED-mid-edit.log rather than deleted.

Worth carrying: it recorded V9 at **radius 28** — the draft-changed sync hook is
the entry point every other assertion runs through, which is a fact about that
mechanism and NOT evidence of 28 independent guards. Its red list already
included the new instance-shim test.

Two attack points from the round-8 brief were checked against the source before
handing it to Sol, and both came back clean:
  - No `for…in` / `Object.keys` / `Object.entries` over a declaration, no
    `'setProperty' in …`, no identity comparison between two `.style` reads. The
    three `.style ===` hits (5314/5378/5387) are border-style STRING compares on
    parsed objects, not declaration identity. `Object.defineProperty` defaults to
    non-enumerable, so the shim cannot pollute an enumeration either way.
  - `grep -nE "SVGElement|ownerSVGElement" browser/raven-grab.js` -> NOTHING, so
    the shim's `SVGElement` entry is genuinely unexercised and its comment
    ("unexercised on this path today, and cheaper than the next debugging round")
    is true rather than generous.
  - `browser/raven-grab.js:3323` does numeric index access (`style[i]`) on a rule
    declaration; the shim adds own methods and touches neither `length` nor the
    indexed properties.

#### Matrix v7 clean re-run: 35 mutants, 35 killed, 0 survived; 2 CONTROLS, 0 false-failed, EXIT=0

Declared baseline 28p/0f/0s. The exit code was written INSIDE the log by the
launcher (`; echo "EXIT=$?"`), so it is a fact about the harness's own verdict
and not about whether the shell reached its last line.

V35 — "the typeof gate is deleted (an instance-shim engine binds undefined and
refuses every supported edit)" — KILLED at radius 1, reddening exactly:
  "an engine that carries setProperty on each declaration INSTANCE still
   commits supported edits"

That is the whole point of round 7's P2 disposition. Round 6 shipped the gate
asserting NO MUTANT KILLS IT, on the reasoning that in a conforming engine an
instance method IS the prototype method. The reasoning was sound and the
conclusion did not follow: the environment the gate exists FOR is one where they
are NOT the same method, and `page.addInitScript` constructs exactly that. A
claim that something cannot be tested is itself a claim, and it is falsifiable
by writing the test.

RADIUS DIFF vs v6 — EXACTLY ONE MOVED: V9 27 -> 28. Everything else is
byte-identical to the v6 table in the suite header (V1 2, V2 1, V3 9, V4 1,
V5 1, V6 1, V7 2, V8 10, V10 1, V11 1, V12 1, V13 1, V14 1, V15 1, V16 1,
V17 3, V18 1, V19 3, V20 1, V21 1, V22 1, V23 1, V24 5, V25 2, V26 1, V27 1,
V28 4, V29 1, V30 1, V31 1, V32 1, V33 2, V34 1), plus V35 entering at 1.

CORRECTION TO MY OWN EARLIER READ: mid-run I said V7 moved 1->2 and V8 1->10.
Both were ALREADY 2 and 10 in v6 — I read them off the partial log without
diffing the header table. The true statement is that ONE radius moved. Do not
carry the wrong version into the ledger.

That single move is the readable signal rather than noise: the new test can only
reach the save path through the draft-changed sync hook, so V9 (radius 28, the
entry point every other assertion runs through — a fact about that MECHANISM,
never evidence of 28 independent guards) picks it up and nothing else does.
V35's radius of 1 says the same thing from the other side: the gate is covered
by exactly one test and not incidentally by any other mechanism.

#### Full suite: 1523 / 1520 pass / 0 fail / 3 skipped, EXIT=0 (duration 44.2s, 6 suites)

+1 over the previously ledgered 1522/1519, and the +1 is exactly the one new
browser test in test/grab-overlay-style-versions.test.mjs (28 now, was 27).
The comment rewrites in browser/raven-grab.js and its mirror, V35 and the
baseline bump 27->28 in version-mutants.mjs, and the header/decision-18 edits
all move the count by ZERO.

THE 3 SKIPS WERE READ INDIVIDUALLY AT THEIR OWN OUTPUT LINES (109 / 714 / 715),
not inferred from the total, and none is from the versions suite:
  109  file URL fallback marks reveal and settle checks as unavailable
       # browser available — fallback path not used
  714  [phase2D fix B] a later committed batch applies on the first poll while
       the head is pending  # removed capability
  715  [phase2C tray] overlapping committed batches both finish and Apply counts
       only batch B  # removed capability
Same three this ledger has always carried. The versions suite ran 28/28 under
the FULL probe pattern.

Note for the next reader: `grep -E "^# (tests|pass|fail|skipped)"` returns
NOTHING on this log — npm test uses the SPEC reporter, whose summary lines are
prefixed with the info glyph, not TAP's `#`. Grep for the glyph or read the
tail; a silent grep here is a grep failure, not a clean run.

NEXT (exact order):
  1. CLAUDE.md ledger: 1523/1520/0/3, matrix v7 = 35/35/0 + 2 controls, V35
     entry, one-radius-moved note, the three-declaration-source lesson.
  2. Sol round-8, DETACHED to a file, using
     .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R8.md.
     NEVER foreground (10-min Bash cap kills it at exit 143). An empty,
     length-truncated or environment-blocked output is NOT "no findings".
  3. git commit --only <explicit paths>.
  4. Push is Andrew's call. Touches no src/ or api/.

#### Sol round 8 LAUNCHED and RETURNED

Launched detached (never foreground — the 10-min Bash cap kills a real audit at
exit 143):

  nohup bash -c 'codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium \
    "$(cat .claude/dialkit-2026-08-08/SOL-BRIEF-VERSIONS-R8.md)" \
    > .claude/dialkit-2026-08-08/agent-output/SOL-ROUND8-VERSIONS.out 2>&1 \
    < /dev/null; echo "SOL-R8-EXIT=$?" >> \
    .claude/dialkit-2026-08-08/agent-output/SOL-ROUND8-VERSIONS.out' &

Monitor bcsjw6886 fired: SOL-R8-DONE SOL-R8-EXIT=0 bytes=845317, 6002 lines.
The monitor carried an explicit "process gone with no EXIT= line -> FAILED RUN,
not no-findings" branch, so the clean return is a real return.

READING THE FILE: two attempts overflowed the tool-output cap. The shape that
WORKED is a bounded slice from the END, never a grep over the whole file:
  awk 'NR>5850' <file> | head -160
A compound grep re-prints Sol's echo of my own CLAUDE.md ledger paragraph
(~line 839) and blows the size. TWO overflow incidents now, same cause.

DEGRADATION CHECK: grep for finish_reason / MachPortRendezvousServer /
"Permission denied (1100)" hits ONLY at lines 17-18 (the brief's own preamble
quoting the round-5/6 sandbox failure) and line 839 (Sol quoting my ledger).
Both are INPUT ECHO. The run was NOT degraded and NOT budget-truncated.

#### Sol round 8 VERDICT: DOES NOT SURVIVE — 4 x P3, NO product defect claimed

All four verified against the files this session before dispositioning.

P3-1 CONFIRMED (test/grab-overlay-style-versions.test.mjs:1922) — the closing
  negative assertion in test 28 reads #card's inline letter-spacing and demands
  ''. It is NOT falsifiable. Under V24 (which injects `return true;` at the top
  of probeStyleValueSupported, i.e. the accept-all probe) native
  CSS.supports('letter-spacing','definitely-not-a-length') returns false FIRST —
  decision 15's AND short-circuits — so nothing commits and the assertion stays
  green. WORSE THAN SOL SAID: even with the probe accepting, the NATIVE setter
  rejects the garbage, so the inline value is '' regardless. This is exactly the
  ledger's own V31-vs-V32 lesson (V31 measures LANDING, V32 does not) arriving
  in a fixture written after that lesson was recorded. The assertion measures
  "nothing landed", which is true and worth keeping, but its message claims
  "the fallback probe is answering", which it cannot show.

P3-2 CONFIRMED (same file:1882) — the precondition deepEqual proves OWN-ness for
  only ONE of the three declaration sources:
    Object.prototype.hasOwnProperty.call(card.style, 'setProperty')   -> true
    typeof getComputedStyle(card).getPropertyValue                    -> 'function'
    (rule declaration) typeof d.getPropertyValue                      -> 'function'
  The last two are typeof only, so a method inherited from some other prototype
  satisfies them. The assertion MESSAGE says "all three declaration sources
  carry their own", which is an overclaim.

P3-3 CONFIRMED (same file:252/275/327) — the header's measured ledger is still
  ROUND-6 DATA: "34 mutants, 34 killed ... against a declared 27p/0f/0s
  baseline", V9 at "radius 27", the table ends at V34 + C1/C2 with NO V35 row,
  and the trailing paragraph says "V9's 27 is every test in the file". Given
  round-7 measurement is 35 mutants / 28p baseline / V9 radius 28 / V35 radius 1.
  Same decay class this file has recorded twice already (the radius paragraph
  quoting 16/5/7 under a 21/6/9 table).

P3-4 CONFIRMED (.claude/dialkit-2026-08-08/version-mutants.mjs:9-15) — "every
  test in this suite has passed on its FIRST run — the original six, the six the
  first Sol round added, the four from round 2 and the five from round 3" = 21,
  and the suite is 28. The claim is also FALSE for the 28th: it took three
  attempts and two of the failures were defects in its own assertions. The same
  false sentence exists in the SUITE header too ("Every test here passed on its
  FIRST run", ~line 259) — Sol named only the harness copy; fix BOTH.

WHAT SOL SAID SURVIVES (recorded so it is not re-litigated):
  - The gate itself survives. Guarded -> live instance methods commit 24px and
    sectionVisible === true; gate deleted -> call.bind(undefined) throws on
    first probe use and that assertion flips to false. V35's kill is GENUINE,
    not a shim artefact.
  - The three-source enumeration is SUFFICIENT for this path. Keyframe,
    font-face and page declarations, attributeStyleMap, and adopted or merely
    constructed stylesheets do NOT reach declarationsFor. The rule scan's null
    case fails cleanly (returns 'NO-RULE-DECLARATION').
  - The round-7 V31/V32 corrections are now TRUE as written: V31 genuinely lands
    a 2px the user never typed on the CONNECTED element; V32 records without
    landing.
  - browser/raven-grab.js and web/public/raven-grab.js are byte-identical.

#### Round 8 fixes APPLIED

P3-1 + P3-2 — test/grab-overlay-style-versions.test.mjs, test 28 restructured
  onto the ESTABLISHED V31/V32/V34 pattern:
   * `window.CSS.supports = () => true` added INSIDE the addInitScript, so
     decision 15's AND falls entirely to the probe. Without this the negative
     direction is green under V24 for a reason unrelated to the probe.
   * the precondition deepEqual now asks hasOwnProperty for ALL THREE
     declaration sources (was: typeof for two of them). Expectation goes
     ['undefined','undefined',true,'function','function'] ->
     ['undefined','undefined',true,true,true]. Strictly stronger and cannot
     fail on correct code — the shim installs own properties on all three.
   * the negative direction moved BEFORE the positive so the
     `sectionVisible === false` precondition is available, and now asserts the
     RECORDED observable (sectionVisible) instead of the LANDED one (the inline
     value). The landed read could not fail: the native setter rejects the
     garbage whatever the probe says.

P3-3 — suite header matrix table rewritten from the round-8 measurement.
P3-4 — provenance claim corrected in BOTH version-mutants.mjs and the suite
  header: 21 of 28 was written as "every"; and the 28th is the one exception,
  which took three attempts with both failures in its own fixture.

CONSEQUENCE: P3-1 and P3-2 are TEST changes, so the suite AND the WHOLE matrix
re-run (35 mutants) plus the full suite. No product code changed, so NO mirror
cp is needed and the mirror stays cmp-clean.

STATE at the start of the fixes: HEAD c9d838f, local main 3 AHEAD of
origin/main (ad36eeb). Touches no src/ or api/, so it does not move the live
MCP endpoint. Push is Andrew's call and has NOT been given.

#### Round 8 measurement

versions suite after the fixes: 28 tests / 28 pass / 0 fail / 0 skipped, EXIT=0,
0 ✖ lines. The declared 28p/0f/0s baseline in version-mutants.mjs still holds
unchanged, so EXPECTED_BASELINE_TESTS=28 / EXPECTED_BASELINE_SKIPS=0 needed no
edit this round.

Matrix launched WHOLE (never extended), backgrounded, EXIT captured INSIDE the
log. Monitor bl9lijow2 armed on it with a filter covering MATRIX-DONE, EXIT=,
SURVIVED, false-fail, abort, assert and "not green" — silence is not success, so
the filter had to cover every terminal state.

The `node --check -` PRE-FLIGHT PASSED: it runs before the baseline, and the log
reached `baseline: grab-overlay-style-versions.test.mjs 28p/0f/0s`, so all 35
find-strings are present, unique and syntactically valid. Expected — no product
code changed this round, so no anchor could have died.

Mirror re-verified: `cmp browser/raven-grab.js web/public/raven-grab.js` →
MIRROR-IDENTICAL. No `cp` needed; no product code changed.

MATRIX v8 RESULT (read from the harness's own summary AND the EXIT= line):

  35 mutants, 35 killed, 0 survived; 2 controls, 0 false-failed
  EXIT=0

against the declared 28p/0f/0s baseline.

THREE radii moved, read against the HEADER TABLE and not against a memory of the
previous run (this file's own rule, and the exact thing that went wrong when V7
and V8 were mis-read as having moved in an earlier round):

  V3   9 → 10   the save blocker's shared radius. The restructured test 28 now
                asserts `sectionVisible === false` as a precondition, so a
                blocker returning "" — which admits every state it should refuse
                — turns test 28 red alongside the nine it already reddened. One
                blocker, one more observable. NOT a new guard.
  V24  5 → 6    the no-CSS.supports fallback returning true again.
  V28  4 → 5    CSS.supports answering alone again when present.

V24 and V28 moved for ONE reason and it is the round-8 P3-1 fix stated as a
measurement: the restructure stubs `window.CSS.supports = () => true` inside the
init script, exactly as the three POISON tests do. Before that, decision 15's AND
short-circuited on a NATIVE CSS.supports, so the negative direction of test 28
was green under V24 for a reason that had nothing to do with the probe. The two
radii ARE the evidence that the fixture now reaches the mechanism it names —
that is what a non-falsifiable assertion looks like once it becomes falsifiable.

Everything else is byte-identical to the v7 table. V9 stays at 28 (it moved
27→28 in round 7, and the header had never been updated — that WAS P3-3). V35
stays at radius 1, reddening only "an engine that carries setProperty on each
declaration INSTANCE still commits supported edits".

Round 8 added NO test and NO guard. It restructured one. The count is still 28.

#### Round 8 P3-3 APPLIED (the header rewrite)

Written from the measurement above, never predicted ahead of it — the header
paragraph carries its own "THIS PARAGRAPH IS A CLAIM AND IT DECAYED ONCE"
warning, and writing a table from expectation and correcting it later is exactly
that decay. Changes:

  * 34 mutants / 27p baseline  →  35 mutants / 28p baseline
  * V3 radius 9 → 10, V9 27 → 28, V24 5 → 6, V28 4 → 5
  * a V35 row ADDED (it did not exist; the table ended at V34 + C1/C2)
  * "V9's 27 is every test in the file" → 28; "V3's 9" → 10
  * the four probe mutants read "radius 1, 1, 1 and 5" → "1, 1, 1 and 6"
  * the radius-moved paragraph REPLACED: it described the round-5→5b moves and
    is now derived from the round-7 and round-8 measurements, and it records the
    SECOND decay explicitly — the whole table sat at round-6 data through the
    entirety of round 7.
  * "Every test here passed on its FIRST run" → corrected. That was the second
    copy of P3-4: it covered 21 of 28 tests, and it is FALSE for the 28th, which
    took three attempts with both failures in its own fixture.

`node --check test/grab-overlay-style-versions.test.mjs` → SYNTAX-OK.
Comments only; no assertion changed, so the matrix does not re-run for this.

STATE: three files modified, uncommitted:
  .claude/dialkit-2026-08-08/version-mutants.mjs
  conversations/2026-08-08-dialkit-voice.md
  test/grab-overlay-style-versions.test.mjs
Local main is AHEAD of origin/main. Touches no src/ or api/, so it does not move
the live MCP endpoint. Push is Andrew's call and has NOT been given.

#### Round 8 CLOSED — committed 2ace0d3

Full suite read from `.claude/dialkit-2026-08-08/agent-output/R8-FULLSUITE.log`,
from the runner's own summary lines and NOT from the shell exit code:

    ℹ tests 1523 / suites 6 / pass 1520 / fail 0 / cancelled 0 / skipped 3 / todo 0
    ℹ duration_ms 44096.000541
    EXIT=0   FULLSUITE-DONE
    grep -c '✖' -> 0

The 3 skips READ INDIVIDUALLY (`grep '﹣'`), not inferred from the total — the
same three this ledger has always carried:

    109  file URL fallback marks reveal and settle checks as unavailable
         # browser available — fallback path not used
    714  [phase2D fix B] a later committed batch applies on the first poll while
         the head is pending   # removed capability
    715  [phase2C tray] overlapping committed batches both finish and Apply counts
         only batch B          # removed capability

NEAR MISS WORTH CARRYING: `grep -nc 'style-versions' R8-FULLSUITE.log` returns
ZERO, and that is NOT evidence the suite did not run — `node --test`'s SPEC
reporter prints no file paths. Confirmed the suite ran by grepping its own TEST
NAMES: 3 hits on distinctive names including "an engine that carries setProperty
on each declaration INSTANCE still commits supported edits", and 14 `✔ .*version`
lines. An unchanged total is exactly the shape that would hide a suite silently
not running, so the check has to be by name.

CLAUDE.md ledger updated by python exact-substring replace (`Read` fails on the
file, 25601 tokens > 25000). Anchor:

    '(measured live 2026-08-09 after the SEVENTH Sol falsification round on named
     style versions). Its **+1** over 1522'

with `assert s.count(old) == 1`. Round 8 entry inserted; round 7 demoted to "The
previous ledgered figure was 1523/1520 (…SEVENTH…)".

COMMITTED: `2ace0d3` "Make the instance-shim test falsifiable and re-derive the
matrix table" — 4 files changed, 297 insertions(+), 54 deletions(-), via
`git commit --only` on four explicit paths with the body from a scratch file.
Pre-commit: `git fetch origin`; `origin/main` = `ad36eeb`, an ANCESTOR of local
HEAD, no divergence. Tree now CLEAN, local main 4 AHEAD of origin/main, UNPUSHED.
Touches no `src/` or `api/`, so it does not move the live MCP endpoint. Push is
Andrew's call and has NOT been given.

FOUR stale/duplicate monitor notifications arrived after the fact (by937a9l9
EXIT=0 / timeout / FULLSUITE-DONE; bjzfy71rf timeout; bl9lijow2 timeout /
MATRIX-DONE). All for runs already consumed and read. Nothing re-armed; no
background work is in flight.

#### Stop-hook: parked too early — reopened threads A and B

The Stop hook (NOT a user turn) flagged that the /goal wanted a spec + fanned-out
workflow and that I had gone idle awaiting Andrew on everything. Correct read:
two threads have work that does NOT need him.

**Thread A blocker RE-READ rather than paraphrased from memory.** Lines 1386 and
1686 of this log both say Thread A "is blocked until Andrew names the brand" —
and BOTH ARE STALE. The Higgsfield section at line ~1940 is LATER: the brand was
named, the pack was generated (task b6xylrrua, 21 credits, 3762 → 3741), three
2048×2048 PNGs were fetched by hand and looked at at 900px, and `01` was picked
as the hero. The live gate is the one written at the end of that section — the
`/mcp` reconnect — which is what I have been telling Andrew. Correct, but it was
GUESSED until this read; the two earlier lines say something different and a
future reader grepping for "blocked" will hit them first.

**Thread B: there is NO DialKit gap spec/backlog file** in
`.claude/dialkit-2026-08-08/` — that directory holds only the mutant harnesses
(align / detached-draft / easing / precision / spring / version), the Sol briefs
(SOL-BRIEF R2–R9, SOL-BRIEF-VERSIONS R2–R8 + R5b), `r8-`/`r9-prefix-measure.mjs`
and `precision-callsite-brief.md`. The gap list lives in this session log, not in
a tracked spec file.

#### Thread A — step-3 blocker found and cleared BEFORE the reconnect

The `/mcp` gate is now MEASURED, not remembered: the connected Raven server's
tool list carries `generate_design_system` and `init_design_md` but has **no
`generate_mood_board`** — the running build predates that tool. So step 3 of
`docs/brand-genesis-flow.md` cannot run until Andrew reconnects. That much was
already the standing claim; this is the first time it was checked against the
live tool list rather than asserted.

**The new finding is one layer past it.** `src/mood-board.ts:47` sets
`MAX_EMBED_IMAGE_BYTES = 2_500_000`, and the generated pack is

    smashgrab-hero-01.png  6,760,562 bytes
    smashgrab-hero-02.png  6,448,270 bytes
    smashgrab-hero-03.png  7,783,467 bytes

— **all three over the per-image cap.** Passing them as `image_paths` would have
produced a board whose "Your assets" section embeds NOTHING, plus three
`exceeds the per-image embed cap — skipped` warnings. That would have surfaced
only AFTER the reconnect, i.e. in front of Andrew, on the approval stop.

Downscale measured rather than guessed. First attempt `sips -Z 1400` (PNG) was
STILL over — 3,032,816 / 3,087,775 / 3,439,696 — so PNG at any useful pixel size
does not fit. JPEG does, and is the right format for photography anyway; the
sniff at `src/mood-board.ts:336` accepts `ff d8 ff`, checked against the actual
bytes of the output rather than the extension.

    board/smashgrab-hero-01.jpg  540,346   UNDER 2,500,000
    board/smashgrab-hero-02.jpg  562,461   UNDER 2,500,000
    board/smashgrab-hero-03.jpg  697,626   UNDER 2,500,000
    total                      1,800,433   UNDER 8,000,000  (shared budget)
    first three bytes ffd8ff -> sniffs image/jpeg

Command of record:
`sips -s format jpeg -s formatOptions 82 -Z 1400 <in>.png --out board/<in>.jpg`

Eyes-on at full size on 01 after the re-encode, not inferred from the byte
count: near-black ground, single hard source, long sharp cast shadow to the
upper left, crisp lacy patty edges, cheese still the only saturated element, no
banding in the shadow falloff at q82. The re-encode costs nothing the board
needs.

Originals untouched at `~/projects/raven-genesis-demo/pack/*.png`; the board
copies are a sibling `board/` directory, so the takedown/regenerate path is
unaffected.

---

## Push, endpoint verification, and the full tool census (2026-08-08 → 09)

### The push

Andrew authorised it explicitly. Four steps, each measured rather than inferred.

1. **`git fetch` + scope check.** `git diff --name-only origin/main..HEAD | grep -E '^(src|api)/'` returned
   **nothing** — so the push moves no file that decides what `mcp.ravenmcp.ai` serves. That check
   matters because since the 2026-07-27 unpin every push to `main` deploys the `site` project, which
   IS the live OAuth-bearing endpoint.
2. **Full suite green before the push**, not after:
   `ℹ tests 1523 / suites 6 / pass 1520 / fail 0 / cancelled 0 / skipped 3 / todo 0` · `EXIT=0` ·
   44.6s. Matches the CLAUDE.md ledger figure exactly.
3. **Pushed** `ad36eeb..b46dac5  main -> main` — 17 files, 6868 insertions(+), 13 deletions(-).
   Contents: `browser/raven-grab.js` (+833) and its `web/public/` mirror (+833),
   `test/grab-overlay-style-versions.test.mjs` (+1973, new), `.claude/dialkit-2026-08-08/version-mutants.mjs`
   (+377), nine SOL-BRIEF-VERSIONS files, three CLAUDE.md lines, and the session log (+1819).
4. **Live endpoint re-verified after the deploy landed.** POST `tools/list` to
   `https://mcp.ravenmcp.ai/api/mcp` → `http=200`, **45 tools**,
   `sha256 f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` — an **exact** match
   against the frozen golden hash. The anonymous surface did not move.

### The tool census — and why the obvious method was wrong twice

The functionality doc needed a number it could stand behind, so all three surfaces were measured
independently rather than reading one and inferring the others.

**Attempt 1 — grep — was wrong in two separate ways and both are worth recording.**
`grep -oE '\btool\(\s*"[a-z0-9_]+"'` over `dist/` reported **106**, against a real 105 published /
110 in repo. Worse, the compound command's leading `cd` **persisted across `&&`**, so the half
labelled "and now the same two counts on the local repo dist" re-read the *published* dist. It was a
duplicate presented as a comparison, and it agreed with itself, which is exactly how it survives a
glance. Discarded entirely.

**Attempt 2 — run the real server against the packed tarball — threw `ERR_MODULE_NOT_FOUND`.**
A bare `npm pack` extract has no `node_modules`, so `@modelcontextprotocol/sdk` cannot resolve.
Fixed by running `npm install --omit=dev --ignore-scripts --no-audit --no-fund` inside the unpacked
package before invoking the counter.

**Method of record:** `buildServer({ remote: false, tasteStore: new FsTasteStore() })` and
`buildServer({ remote: true, ... })`, reading `_registeredTools` off each. The explicit
`remote: false` is load-bearing — bare `buildServer()` falls back to `process.env.RAVEN_REMOTE`, so
a census script without it silently measures the remote server. Script at
`scratchpad/enum-tools.mjs`, output at `scratchpad/tools.tsv`.

| Surface | Count | How |
| --- | --- | --- |
| Repo `main` (b46dac5) stdio | **110** | real `buildServer({remote:false})` on local `dist/` |
| npm `raven-mcp@2.3.0` (published 2026-07-28T22:17:27Z) stdio | **105** | `npm pack` + `npm install --omit=dev` + real `buildServer` |
| Live `mcp.ravenmcp.ai` anonymous | **45** | live POST, hash-verified |
| Remote-registered (repo and npm alike) | **56** | real `buildServer({remote:true})` |
| Gated (stdio-only), repo | **55** | 110 − 55 shared |
| Gated (stdio-only), npm | **50** | 105 − 55 shared |

**The reconciliation did not close on the first pass and was chased rather than rounded.**
110 stdio + 55 gated implies 55 shared, but the remote build registers **56**. The extra is
`delete_taste_data`, which is registered ONLY in remote mode and has no stdio counterpart — it is
the GDPR-shaped delete for per-user Redis data, which local stdio has no equivalent of.

So: **45 anonymous + 10 OAuth-gated Taste Engine tools = 55 shared with stdio, + `delete_taste_data`
= 56 remote total.** The ten that unlock on sign-in are `audit_taste`, `bind_taste_surface`,
`create_taste_profile`, `generate_taste_portrait`, `get_taste_interview`, `get_taste_profile`,
`label_finding`, `list_taste_decisions`, `list_taste_profiles`, `record_taste_decision`.

**The 105 → 110 drift is exactly the pattern-library work**, and all five are in
`REMOTE_GATED_TOOLS`, which is why the anon hash has never moved across any of it:
`capture_reference`, `search_references`, `map_reference_to_tokens`, `forget_references`,
`generate_mood_board`. npm has not moved since 2026-07-28.

### Font tooling on this host

`pyftsubset`, `woff2_compress` and `fonttools` are all absent, and `python3 -m pip install --user`
is refused under PEP 668. **Do not reach for `--break-system-packages`** — a throwaway venv is the
same result with none of the risk:

    python3 -m venv scratchpad/fontenv && ./fontenv/bin/pip install fonttools brotli

Subsetting Untitled Sans Regular/Medium/Bold plus Geist Mono to a latin-and-punctuation woff2 gives
**61 KB raw / 82 KB base64 across four faces** — cheap enough to inline in an Artifact, where the CSP
blocks font CDNs outright and a linked webfont fails silently to a system fallback.

---

## The Raven functionality map — build, judge, fix, verify (2026-08-08 → 08-09)

Andrew's ask after the push: *"create a quick doc or deck on all of the funcitonality in
Raven now, it's to hel pme keep track, think about hwo to change the marketing site, and
how to explain all oif it's funcitonality to people"*. Three audiences in one artifact —
his own inventory, a marketing-site rethink, and an explanation for other people.

### Building it from a measurement, not from memory

The tool list is not written by hand anywhere. `scratchpad/build-artifact.mjs` reads
`scratchpad/tools-short.txt` (110 lines, `name|ANON-or-GATED|description`), which was
itself produced by standing up the real server — `buildServer({ remote: false,
tasteStore: new FsTasteStore() })` against local `dist/`, never bare `buildServer()`,
which falls back to `process.env.RAVEN_REMOTE` and silently measures the remote build.

Four surface numbers, each measured rather than quoted:

| Surface | Count | How |
|---|---|---|
| repo `main` (b46dac5) stdio | **110** | real `buildServer({remote:false})` on local `dist/` |
| npm `raven-mcp@2.3.0` | **105** | `npm pack` + `npm install --omit=dev` + real `buildServer` |
| live `mcp.ravenmcp.ai` anonymous | **45** | live POST, golden hash verified |
| remote-registered | **56** | real `buildServer({remote:true})` |

45 anon + 10 OAuth Taste Engine + `delete_taste_data` (remote-only Redis delete) = 56.
The 105→110 gap is exactly the five pattern-library tools, all in `REMOTE_GATED_TOOLS`.

Two census attempts by grep came back **106** against a real 105/110, and one "comparison"
re-read the same `dist/` twice because a leading `cd` persisted across `&&` — so it agreed
with itself. Both are why the counts above are taken off a booted server.

### The 17 truncated descriptions — found by looking, not by a check

Seventeen tool descriptions ended mid-clause in the rendered page. Nothing caught them:
not the build, not a test, not a lint. I found them by reading the artifact I had just
published. They were re-read off the real server and replaced, and a **sentence-completeness
assertion** now sits in the build script so the class cannot come back silently.

That assertion, and the audit-count pair beside it, both sit **before** font-inlining and
`writeFileSync` — a throwing assertion must never leave a bad artifact on disk. The
audit-count pair exists because the first version of that sentence said "twenty-two
`audit_*` tools" inside a group of 26 that holds 21: true server-wide, false about the
group it sat in. Both halves are graded now:

```js
if (auditAll  !== 22) throw new Error(`audit_* server-wide is ${auditAll}, copy says 21 + 1 = 22`);
if (auditHere !== 21) throw new Error(`audit_* in the Audit group is ${auditHere}, copy says 21`);
```

### The design-judge pass — verdict BLOCK, 5 block + 1 warn

Run against `raven-map.src.html`, global layer only (raven-mcp has no project overlay),
surface bound **product-site (ravenmcp.ai)** so the monochrome-scoped rules stayed inactive.

1. `CONTENT-ACCURACY-read-before-asserting` · block — `<h2>Five things…</h2>` headed **six**
   `.claim` rows. → "Six things".
2. `TYPE-no-faux-anything` · block — `<em>this project's</em>`. Only Regular/Medium/Bold/Mono
   are inlined, so the browser synthesizes an oblique. → `.em{font-weight:500}` on the real
   Medium face.
3. `LAYOUT-no-card-soup` · block — `.dcard`×3 + `.group`×10 + `.claim`×6 = **19** shadowed
   rounded cards, and `.dcard` carried the `border-top:3px solid var(--tier)` accent rail
   named in `artifact-design` as an AI tell. → **19 → 10**.
4. `SPACING-tap-targets-44px` · block · **`source: raven`** — delegated to `audit_tap_targets`,
   not eyeballed. I had estimated `.filt` at "roughly 34–36px"; Raven measured **30**.
5. `CONTENT-ACCURACY-open-references-before-scoring` · block — three sentences asserted what
   the live marketing site currently does, while the section's own note conceded the pages
   weren't re-read. All three rewritten as proposals.
6. `VOICE-editorial-restraint` · warn — pull-quote made an unverifiable absolute about every
   competitor. → *"Raven hands an agent a measurement, not an opinion — the same number every
   run, and the rule it came from."*

All nine items (six findings + three self-found observations) applied.

### The de-carding, measured at both viewports

`.claim` went from a card to hairline-ruled editorial rows via **grid auto-placement with
zero HTML edits** — `.claim h3{grid-column:1;grid-row:1}` plus `.claim > :not(h3){grid-column:2}`.
The carried plan omitted the mobile override, which is mandatory: without
`@media (max-width:820px){.claim > :not(h3){grid-column:1}}` every paragraph is stranded in
a column that no longer exists.

`.scratch/pitch.mjs` screenshots `.pitch` at 1280px and 780px **and asserts the geometry**, so
the picture is not the only evidence:

```
pitch-desktop {"headX":102,"proseX":351,"headY":-141,"proseY":-141,"claimW":1080,"proseW":668}
pitch-narrow  {"headX":34,"proseX":34,"headY":-250,"proseY":-213,"claimW":716,"proseW":668}
PITCH OK
```

Then looked at both PNGs. Desktop: two columns on a shared baseline, mono proof lines under a
soft rule, no card. Narrow: headings full width, prose stacked beneath, rules intact.

### THE STALE SERVER — the significant error of the round

After the tap-target fix landed and the build reran, `audit_tap_targets` returned a reading
**identical to the pre-fix one**: 4 elements, 0 passing, all `h 30`, `deficit_h 14`. Rather
than theorise about CSS specificity I compared disk against wire:

```
grep -c "min-height:44px" scratchpad/raven-map.html        → 2
curl -s http://127.0.0.1:8791/ | grep -c "min-height:44px" → 0
```

`.scratch/serve.mjs` called `readFileSync` at **module scope**. Every request since process
start had returned the build that happened to be on disk when the process booted. This is
this repo's own rule — *a check whose failure mode is indistinguishable from its success mode
is not a check* — landing on the **fixture** rather than the product. A stale response is
byte-for-byte indistinguishable from a fresh one at the socket.

Fixed by moving the read inside the handler, adding `cache-control: no-store`, and writing the
failure mode into a comment above it. Freshness is now asserted mechanically, not glanced at:

```
disk=  128933 wire=  128933 min44_over_http=2
SERVER FRESH OK
```

Re-measured against the fresh server: **total 4, passing 4, failing 0, `fix_table: []`**.
Judge finding 4 closed by Raven's own ruler.

### Lessons

1. **A compaction summary's "verbatim" code is a faithful reconstruction, not byte-exact.**
   An `Edit` against an unread region failed on a string carried through a summary. Read the
   region first, always.
2. **A byte count read without comparison to disk is not a freshness check.** I had recorded
   `bytes=128000` from `curl` as evidence the server was serving the new build. Disk was
   **128,933**. The discrepancy sat in plain sight and read as confirmation. The fix is
   `[ "$DISK" -eq "$WIRE" ]`, not a glance.
3. **`grep -o "pattern[^}]*}"` is line-scoped and silently misses multi-line CSS blocks.** It
   reported `.filt{` as absent from the built artifact when it was present, producing a false
   "the fix never landed" signal that briefly pointed the investigation at the build instead of
   the server.
4. **Scope an invalidation precisely before discarding results.** On finding the stale server my
   first instinct was that every green measurement was void. `.scratch/shoot.mjs` navigates via
   `pathToFileURL(SRC).href` — `file://`, straight from disk — so it was never affected. Reading
   the probe's own target URL is what separated the two.
5. **A count-assertion mutant that exits 1 while printing only the Node banner proves the exit
   code, not the message.** `... 2>&1 | tail -1` on a throwing Node process shows
   `Node.js v26.5.0`. Use `tail -5`, or grep the message substring.
6. **`node x.mjs | tail -20; echo EXIT=$?` reports `tail`'s status**, not node's — this repo's
   own "a pipe eats the exit code" trap, hit again.
7. **`page.click()` scrolls its target into view**, so a screenshot named "top" taken after an
   interaction is not the top. Reorder the probe.
8. **A 46,016px-tall mobile capture is not a readable artifact.** `.scratch/crop.mjs` exists for
   that reason.

### Font tooling note (unresolved, not blocking)

`pyftsubset` / `woff2_compress` / `fonttools` are absent on this host and `pip install --user`
is refused under PEP 668. **Do not use `--break-system-packages`.** The route is
`python3 -m venv scratchpad/fontenv && ./fontenv/bin/pip install fonttools brotli`. Subsetting
the four faces to latin-and-punctuation gives 61 KB raw / 82 KB base64 — cheap enough to inline,
which matters because the Artifact CSP blocks font CDNs and a linked webfont fails silently to a
system fallback. The only honest check is `document.fonts.check('400 16px "Untitled Sans"')`.

### State

Artifact live at `https://claude.ai/code/artifact/777aa17f-7042-4293-90e3-19ab248798a3`
(republished to the same file path, so the URL is preserved). Loopback server killed. Sol
falsification pass launched detached. Nothing pushed from this round — the artifact and its
build scripts live in the session scratchpad and `.scratch/`, neither of which is tracked.

### The Sol adverse round — verdict DOES NOT SURVIVE, 1 × P1 + 3 × P2, all four real

Brief at `.scratch/sol-brief.md`, report-only, six named claims to attack, visual design
explicitly out of scope (a separate judge gate already covered it). Launched detached to a
file — a real audit outruns the 10-minute Bash cap.

**Every one of Sol's four line citations was opened and re-read before any edit.** All four
checked out, which is worth recording precisely because a line number in an adverse report is
a claim that decays, and the habit only pays when it occasionally catches a stale one.

**(A) P1 — CONFIRMED, both halves.** The page called the 105→110 gap "the whole pattern-library
feature". The Pattern library group holds **four** tools; the fifth, `generate_mood_board`,
belongs to the Taste Engine. Nothing anywhere graded that split — the count, the group
attribution and the name list were three separate statements of one fact and only the first
had ever been checked.

**(B) P2 — CONFIRMED, and worse than reported.** The page said "Nothing public is stale."
Opening the live apex found it stating **three different tool counts on one page**: `99` in the
footer, "one hundred" in a section heading, `104` in the FAQ — against 105 on npm and 110 on
`main`. All three come from `web/lib/counts.ts`, one hand-maintained constant whose own comment
admits nothing asserts it. That file is **reported to Andrew, not edited** — the ask was a doc,
not a site fix.

**(C) P2 — CONFIRMED but narrower than stated.** Sol claimed the grouping loop could silently
drop or duplicate a tool. It cannot: the loop already throws on an unknown name and on a
duplicate within `GROUPS`. The real residue was one layer earlier — the `byName` Map silently
collapses a **duplicate LINE in `tools-short.txt`**, and the total check then passes because the
census file and the map agree with each other about the wrong number. A direct assertion now
names that fault.

**(D) P2 — CONFIRMED.** Three descriptions were noun fragments, and the assertion's own comment
claimed it enforced "complete sentences" when it only catches truncation. Both fixed.

### Three new assertion families, each mutant-proven

The gap is now graded three ways, because the page states it three ways:

- data side — Pattern library holds exactly 4, and each of the four is in it
- data side — `generate_mood_board` is in Taste Engine
- **HTML side** — the drift section's rendered `.names` list equals the five, in order

That third one grades the page rather than the data, and it is the one that matters: a name
silently dropped from the list would leave the prose saying "five" over a list of four with
every data-side assertion still green. It sits between the source read and `writeFileSync`,
like every other assertion in that script.

Matrix: **3 mutants, 3 killed, 0 survived; 1 CONTROL, 0 false-failed.** The control reorders two
tool names inside one group — behaviour-neutral by construction, because a red-only matrix is
structurally blind to a false fail. Every restore verified with `cmp -s`.

### Lessons

9. **Default-locale `grep` returns zero matches on a file containing invalid UTF-8** — rc=1, no
   error, indistinguishable from "not present". `LC_ALL=C grep -a` is the fix. This is the
   "a check whose failure mode is indistinguishable from its success mode is not a check" rule
   arriving in the instrument rather than the product, for the second time this round.
10. **On a 602 KB file that embeds CLAUDE.md, a broad `grep` matches the embedded prose**,
    produces 226 KB of output, and gets persisted to a side file rather than shown — so the
    search silently returns nothing usable. `sed -n 'A,Bp' | cut -c1-N` over a known line range
    is the correct instrument.
11. **A mechanical guard proposed in response to an adverse finding must be measured against the
    real corpus before it is shipped.** Sol's finding D suggested enforcing complete sentences.
    A closed verb list was written and measured: it flagged **75 of 110** descriptions, nearly
    all sound imperatives ("Audit HTML/CSS against Raven's standards."). The measurement reversed
    the plan — the guard was not shipped, the overclaiming comment was corrected instead, and the
    three real fragments were fixed by hand. A guard that fires on correct copy is worse than a
    narrow one that does not. This lesson is written into `build-artifact.mjs` as a code comment
    as well, so it survives the loss of this log.
12. **A mutant intercepted by a pre-existing guard is not a kill.** Two of five mutants never
    reached the assertion under test — one hit `duplicate tool`, the other hit
    `grouped 109, expected 110`. Counting them would have overstated the matrix by two. Re-shape
    the mutant until it reaches the guard (a genuine group MOVE; a length-preserving SWAP), or
    record it as intercepted.
13. **A CSS block that has only ever held one child has no stacking rule, and adding a second
    child exposes that silently.** `.drift p{margin:0}` rendered the two new paragraphs as one
    wall of text. Nothing in the build, the data assertions or the count checks could see it —
    only the new geometry probe and the eyes-on capture. And the probe was believed only after
    the captured PNG was read: `gap 0` was a derived expected-value, exactly as falsifiable as
    the measurement it graded. It was real. Fixed with `.drift p + p{margin-top:10px}`,
    re-measured at `gap: 10` on both viewports, re-inspected.

### State

Artifact republished to the same file path, so
`https://claude.ai/code/artifact/777aa17f-7042-4293-90e3-19ab248798a3` is preserved and now
carries every fix. `node build-artifact.mjs` → `OK 110 tools open=45 auth=10 local=55`.
`node .scratch/drift.mjs` → `DRIFT OK` at 1280 and 780. `node .scratch/pitch.mjs` → `PITCH OK`.
Nothing pushed from this round — the artifact and its build scripts live in the session
scratchpad and `.scratch/`, neither of which is tracked.
