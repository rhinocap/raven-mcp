# Falsification pass — round 8 (report-only)

Repo: /Users/accunliffe/projects/raven-mcp  (branch main)

## What to attack

Round 7 of an adverse loop on the `design_gauntlet` tool's HAIRLINE PROVENANCE
feature returned DOES NOT SURVIVE with two P1 confident-wrong-answer defects and
two P2s. Round 8 fixed three of the four. **Attack the fixes and the guards.**
Prior rounds' findings are closed; do not re-report them. One finding is
deliberately still OPEN — see the bottom — and re-reporting it adds nothing.

The feature's governing rule, which every claim below is judged against: **a
false RECOVERY is worse than a false ambiguity.** Handing back a confident
authored width for an edge painted at some other width is the forbidden
outcome. Refusing to answer is the honest direction, but a refusal that never
lifts is an outage, not a refusal.

### P1-1 — CLOSED shadow roots were invisible to the scan

Round 7 added a shadow-root scan, and it read `host.shadowRoot`, which is null
BY DEFINITION for `{ mode: "closed" }`. A closed `:host { border-top-width: 1px
!important }` therefore beat an inline `0.5px` with nothing to count, and the
probe handed back a CONFIDENT `0.5px` for an edge painted at 1px.

The fix wraps `Element.prototype.attachShadow` in a `page.addInitScript` and
stashes every closed root in a non-enumerable, non-writable
`window.__ravenClosedShadowRoots`. The root object is only ever reachable at the
moment it is created. Running as an init script is what makes the wrapper win —
it installs before any page script. The scan then walks open roots via
`host.shadowRoot` and closed roots via the stash, **re-checking
`measured.has(root.host)`** rather than assuming it.

Stated in the comment rather than defended against: this is a CORRECTNESS
mechanism against ordinary pages, NOT a security boundary.

### P1-2 — shadow `adoptedStyleSheets` had no fixture

Both shadow collections were scanned, but the `SHADOW_ROWS` helper delivered its
CSS only through an inline `<style>` element, so the adopted half could regress
with no test failing. The helper now takes `mode` and `adopted` as PARAMETERS.

### P2-4 — the caveat falsely reported a specificity conflict, SEVEN ways

Sol named the shadow cause. Reading `authoredSubPixel` end-to-end found it
returns `"unresolved"` from EIGHT distinct causes — a blocked sheet, a shadow
rule, an overflowed scan, an active animation, an unreadable inline expression,
an `!important` rule outranking an inline declaration, a matched rule whose own
width would not parse, and a genuine specificity conflict — and only the LAST is
what "the winner depends on specificity" describes. A dedicated
`subPixelConflict` counter is incremented at that ONE site, and the caveat
splits one sentence into two: the specificity sentence fires only on the
conflict count, and the remainder gets a sentence that states the refusal
WITHOUT naming a mechanism it does not know.

## Files

- `src/design-gauntlet.ts` — the `attachShadow` init-script wrapper, the
  two-kind shadow scan with its `measured.has` re-check, `subPixelConflict`, and
  the split caveat.
- `test/design-gauntlet.test.mjs` — the parameterized `SHADOW_ROWS` helper and
  four new `hairlines:` tests (CLOSED root; shadow ADOPTED sheet; a REAL
  specificity conflict as the positive control; a DETACHED closed root as the
  opposite-direction control).
- `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` — G65–G70 and the bumped
  `EXPECTED_BASELINE` (57 → 58).

## Claims under audit — falsify each

1. **Wrapping `attachShadow` in an init script sees every closed root that can
   matter.** Falsify by naming a closed root that affects a MEASURED element's
   border and is not in the stash: a root created before the init script runs, a
   root created in a same-origin iframe or a document written by
   `document.write`, an `attachShadow` reached through a different realm's
   `Element.prototype`, a declarative `<template shadowrootmode="closed">` (does
   the parser call the wrapped method?), or anything using
   `Reflect.construct`/`cloneNode` to get a root without calling `attachShadow`.
2. **The `measured.has(root.host)` re-check is correct in BOTH directions.**
   Falsify: a stashed root whose host is not in `querySelectorAll("body *")` but
   whose rules DO change a measured border (slotted content is the interesting
   case — `::slotted()` styles light-DOM nodes that ARE measured); or an
   ordinary page that loses its whole recovery because of it.
3. **The counter split makes the caveat honest.** Falsify: a case where
   `subPixelConflict` fires and the page has no specificity conflict; a case
   where a genuine conflict does NOT increment it; or a caller reading the new
   generic sentence and drawing a wrong conclusion. Note `animatedSide` has no
   cause sentence of its own — say whether that is a defect.
4. **The generic sentence is load-bearing, not cosmetic.** The claim is that
   without it a fixture with `subPixelAmbiguous > 0`, `subPixelConflict === 0`
   and no document-wide cause emits a malformed `"Hairline caveat: . A 1px
   entry..."`. Falsify by showing that state is unreachable, or that the string
   is fine.
5. **The four new tests are falsifiable guards, not comments.** G65 (closed root
   never stashed) and G66 (stash never read) are one rule at two doors and are
   claimed to redden the CLOSED test alone; G67 (adopted spread dropped) the
   shadow-ADOPTED test alone; G68 (`measured.has` re-check dropped) the DETACHED
   test alone; G69 (specificity sentence back on the total) the three ABSENCE
   assertions; G70 (conflict counter never increments) the POSITIVE CONTROL
   alone. Falsify: a mutant that kills a different assertion than its
   declaration says, or a new test that passes under a plausible wrong revert.
6. **The positive control earns its place.** Three tests assert the specificity
   sentence is ABSENT, and the claim is that without a test asserting it FIRES,
   deleting the sentence outright would satisfy all three vacuously. Falsify
   that reasoning. Its fixture uses two deliberately SUB-PIXEL widths (`0.5px`
   vs `0.75px`) so the winner still paints at 1px and the edge reaches the
   recovery branch — falsify that this is necessary, or that it works.
7. **Another half-applied state that still compiles and still passes.** Round 7
   shipped with `shadowBorderRules` incremented and nothing reading it. Round 8
   has the same two-door shape in the stash. Name a THIRD.
8. **The `dist/` the matrix grades is the `src/` that was audited.** The build is
   `clean && tsc`. Falsify any drift.

## Measurements given (do not re-run the browser suite; it needs Chromium)

- `.claude/gauntlet-2026-08-14/agent-output/suite-r9.log` — 57/57/0/0, EXIT=0,
  read from inside the log. (The DETACHED test was added after that run; the
  baseline is 58 now and the matrix grades its own baseline.)
- `.claude/gauntlet-2026-08-14/agent-output/mutants-v14.log` — the round-8 matrix
  (70 mutants + 2 controls). **In flight while this brief was written**; if it is
  incomplete or absent, SAY SO rather than assuming a result. A previous round's
  matrix was read at G6 and reported honestly as unmeasured — do that again.

## Deliberately OPEN — do not re-report

Round 7's P2-3 stands unfixed and is scheduled for round 9:
`declaresBorderWidth` counts a shadow rule that cannot affect any measured
element (`.internal { border: 1px }` styles a node inside the shadow tree, which
`querySelectorAll("body *")` never returns), so one such rule refuses recovery
document-wide. The planned fix is to count a shadow rule only when its selector
can reach a measured element — `:host`, `:host()`, `:host-context()`,
`::slotted()` — recursing through nested groups, and fail-closed on an
unreadable selector. **Attacking that PLAN is in scope and valuable; restating
the finding is not.**

## Ground rules

REPORT ONLY — change no files. Rank findings P1/P2/P3. A claim in a COMMENT is
falsifiable exactly like an assertion. Prefer a concrete counterexample input
over an argument. If you believe a mutant does not kill what it is declared
against, say which assertion actually fires.
