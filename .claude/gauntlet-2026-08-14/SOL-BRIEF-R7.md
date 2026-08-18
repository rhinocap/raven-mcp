# Falsification pass — round 7 (report-only)

Repo: /Users/accunliffe/projects/raven-mcp  (branch main)

## What to attack

Round 6 of an adverse loop on the `design_gauntlet` tool's HAIRLINE PROVENANCE
feature returned DOES NOT SURVIVE with **two P1 confident-wrong-answer defects**,
both the same shape the loop has now hit four times: a cascade source or a
conditional at-rule the probe could not evaluate, silently answered as though it
could. Round 7 fixed both. **Attack the fixes and the guards.** Prior rounds'
findings are closed; do not re-report them.

### P1-1 — shadow roots were a FOURTH unscanned rule source

Both stylesheet loops read `document`. CSSOM gives every DocumentOrShadowRoot its
OWN `styleSheets` and `adoptedStyleSheets`, so a shadow sheet is in neither —
while `:host` matches the host element, which IS measured
(`querySelectorAll("body *")` returns hosts; it just does not descend into them).
`:host { border-top-width: 1px !important }` therefore beat an inline `0.5px`
invisibly and the inline fast path recovered `0.5px` for an edge painted at 1px.

The fix scans each host's shadow root and **COUNTS** rather than collects: a
shadow selector is not evaluable from outside its tree (`el.matches(":host")`
answers false on the host), so recording the rule against an unmatchable selector
would be no record at all and recording it as authored would be a false recovery.
A non-zero count refuses every recovery document-wide, exactly as `sheetsBlocked`
already does. The count is gated on a border-width declaration actually being
present, so an ordinary shadow-DOM page is unaffected.

### P1-2 — an UNKNOWN conditional group was collected as AUTHORED

`@supports`, `@container`, `@media` and `@layer` were discriminated by type and
**everything else fell through to the plain recursion with `unevaluable`
unchanged**. A comment called that "a false ambiguity … in the honest direction";
it was exactly backwards. `@scope (.absent) { .row { border-top-width: .25px
!important } }` never applies, the scope condition is dropped at collection, and
only `r.selector` is tested with `el.matches()` — so a width on no render
outranked the inline declaration and was handed back as a confident recovery.
Same for `@starting-style`. The fix inverts the default: an at-rule group not on
the known list degrades to UNRESOLVED.

## Files

- `src/design-gauntlet.ts` — `declaresBorderWidth()`, the shadow scan, the
  `shadowBorderRules > 0` refusal gate, the `isNesting/isMedia/isLayer` whitelist,
  and the new shadow cause sentence in the hairline caveat.
- `test/design-gauntlet.test.mjs` — three new `hairlines:` tests (a shadow
  `:host !important` host; a BENIGN shadow root as the opposite-direction
  control; an `@scope (.absent)` unknown group) and the `SHADOW_ROWS` helper.
- `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` — G61–G64 and the bumped
  `EXPECTED_BASELINE` (51 → 54).

## Claims under audit — falsify each

1. **A shadow root is the LAST unscanned author-origin rule source that can
   outrank an inline width.** Falsify by naming a FIFTH: something that
   participates in the cascade, outranks an inline declaration, and appears in
   none of `document.styleSheets` (recursed), `document.adoptedStyleSheets`,
   `CSSImportRule.styleSheet.cssRules`, or a shadow root's own two collections.
   Nested shadow roots, slotted content, `::part`/`::theme`, `@scope` inside a
   shadow sheet, UA/user-origin `!important`, and transitions are fair game.
2. **COUNTING beats collecting for a shadow rule, and the count's gate is
   correct.** `declaresBorderWidth` recurses through nested groups and treats an
   unreadable nested import as "might declare one". Falsify: a shadow sheet that
   changes a rendered border width and is NOT counted; or an ordinary page that
   IS counted and loses its whole recovery for nothing.
3. **The document-wide refusal is the honest trade, not laziness.** Falsify: a
   case where refusing document-wide produces a WRONG answer rather than a lost
   one, or an argument that a cheaper per-element answer exists.
4. **The unknown-group whitelist is correct in both directions.** `@layer`
   changes priority and never applicability so it recurses as authored;
   `!!rule.selectorText` separates a CSS-nesting style rule from an at-rule
   group. Falsify: a group on the list whose rules do NOT always apply, or a
   group off the list whose rules ALWAYS apply (so the fix costs a real
   recovery). `@scope` with a matching root is the interesting case — say what
   it costs.
5. **The three new tests are falsifiable guards, not comments.** G61 (gate
   deleted) and G62 (scan never counts) are one rule at two doors and are claimed
   to redden the shadow test alone; G63 (gate fires on ANY shadow root) is
   claimed to redden the BENIGN test alone; G64 (unknown group collected as
   authored) the `@scope` test alone. Falsify: a mutant that kills a different
   assertion than its declaration says, or a new test that passes under a
   plausible wrong revert.
6. **The benign-shadow control earns its place.** Its comment says a
   `border-width: 0` in a shadow sheet still counts, because a `0` can outrank an
   inline declaration and delete the edge. Falsify that reasoning, or show the
   control passes under a mutant it should catch.
7. **The new caveat cause sentence is necessary.** The shadow refusal gets its
   own wording rather than riding on the existing "conflicting widths whose
   winner depends on specificity" sentence, on the claim that a caller reading
   "specificity" would go looking for a conflict that is not on the page.
   Falsify: a reading the new sentence gets wrong, or a case where both sentences
   fire and mislead together.
8. **The half-applied state was the real hazard and is now guarded.** This round
   shipped for a while with `shadowBorderRules` incremented and nothing reading
   it: it compiled clean and the whole suite passed. G61/G62 exist so that state
   is distinguishable from the fix. Falsify: another half-state that still
   compiles and passes.

## Measurements given (do not re-run the browser suite; it needs Chromium)

- `.claude/gauntlet-2026-08-14/agent-output/suite-r8.log` — 54/54/0/0, EXIT=0,
  read from inside the log. +3 over round 6's 51 is exactly the three new tests.
- `.claude/gauntlet-2026-08-14/agent-output/mutants-v13.log` — the round-7 matrix
  (64 mutants + 2 controls). **In flight while this brief was written**; if it is
  incomplete or absent, say so rather than assuming a result.
- `.claude/gauntlet-2026-08-14/agent-output/mutants-v12.log` — the round-6 matrix.

## Ground rules

REPORT ONLY — change no files. Rank findings P1/P2/P3. A claim in a COMMENT is
falsifiable exactly like an assertion. Prefer a concrete counterexample input
over an argument. If you believe a mutant does not kill what it is declared
against, say which assertion actually fires.
