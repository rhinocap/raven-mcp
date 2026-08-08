# Falsification brief — Raven Grab overlay, Motion/easing control + mic alignment

REPORT ONLY. Do not edit files. Your job is to REFUTE the claims below, not confirm them.

Repo: /Users/accunliffe/projects/raven-mcp (public, open-source MCP server).
Read these two artifacts (they are the whole change under review):
  .claude/dialkit-2026-08-08/agent-output/diff-tracked.patch   (browser/raven-grab.js + test/grab-bridge.test.mjs)
  .claude/dialkit-2026-08-08/agent-output/new-tests.txt        (two NEW test files, concatenated)
web/public/raven-grab.js is a byte-identical mirror of browser/raven-grab.js (asserted by a test); ignore its half of the diff.

## What was built

1. A `motion` category in STYLE_CATEGORIES (transition-property/-duration/-timing-function/-delay).
   STYLE_PROPERTIES is derived from STYLE_CATEGORIES and is what computedStylesFor() captures,
   so this one lever controls both the panel rows and the captured payload.
2. A cubic-bezier parser (parseEasingValue, formatCubicBezier, timingFunctionCount, EASING_KEYWORDS)
   and an `easing` branch in classifyStyleControl.
3. An SVG curve editor in beginStyleEdit: two draggable handles + five keyword presets.
4. unitOptionsForProperty returns ["ms","s"] for time properties.
5. A shared CSS rule making every mic-bearing label row flex/space-between:
   `.raven-grab-field > span, .raven-grab-feedback-field > span`.
6. Deliberate NO-mic decisions on the three type="email" inputs, documented in comments.

## Claims to attack

C1. The parser REFUSES everything it cannot faithfully redraw, so committing a value the editor
    opened can never destroy the original. Specifically: steps(), step-start, step-end, linear(),
    any compound (comma-separated) timing-function list, and MIXED multi-select all fall back to
    the plain-text control.
C2. x coordinates are clamped to [0,1] because CSS Easing L1 requires it; y coordinates are NOT
    clamped to [0,1], because overshoot/anticipation curves are valid CSS. The drag surface draws
    y over [-0.5, 1.5] and that is a limit of the picture, not of the value.
C3. A preset button writes the KEYWORD (`ease-out`), never its bezier expansion.
C4. Releasing the pointer COMMITS, and the committed value reaches the element's inline style.
C5. The mic-alignment rule covers ALL five mic-bearing label rows, not just the one a design judge
    happened to look at; a mutant narrowing it to the feedback row alone is caught.
C6. The two new suites' mutant matrices are honestly reported (10 mutants / 10 killed for easing,
    3 / 3 for alignment) and every radius claim in their headers is true.

## Where to be hostile

- Find a CSS timing-function value that parseEasingValue ACCEPTS and formatCubicBezier round-trips
  to something DIFFERENT. Legal CSS number syntax includes `+0.5`, `1e-1`, `.5`, and whitespace
  variants; the parser deliberately rejects some of these — check the rejections are rejections and
  not silent mis-parses.
- Check the top-level-comma regex `/,(?![^(]*\))/` against nested parens and against a value with a
  comma inside cubic-bezier() itself.
- Check case handling, `!important`, custom properties (`var(--x)`), and global keywords
  (inherit/initial/unset/revert) reaching classifyStyleControl.
- Check the drag math when the SVG is scaled, when getBoundingClientRect is zero, and at the exact
  clamp boundaries.
- Check whether any test in the two new files could pass against the defect it names (a test that
  cannot fail is worse than no test). Name any assertion you believe is unfalsifiable.
- Check whether the new CSS rule changes any label row that has NO mic (there are many).
- Check whether adding four properties to the captured style set breaks any documented payload
  contract or size assumption.

Answer with a numbered list. For each finding: severity (P1/P2/P3), the exact file + line, the
concrete input that triggers it, and the observable wrong behaviour. If a claim survives, say so
explicitly and say what evidence would have falsified it. End with a one-line verdict:
SURVIVES or DOES NOT SURVIVE.
