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
