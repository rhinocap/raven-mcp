# Adverse falsification pass — Grab overlay CSS spec

Read `docs/grab-panel-css-spec.md` in this repo. It is a SPEC ONLY; no code has changed.

Your job is to REFUTE it, not to confirm it. Report only — do not edit any file.

## Claims under audit

1. Every `path:line` citation in the spec resolves to the content it claims, in
   `browser/raven-grab.js`. Check them. Specifically: :773 (Google Fonts @import),
   :774 (`:host {`), :788-789 (the two font tokens), :1073 (the "no nested card"
   comment), :1074 (the style row), :1101 (the `code` cell), :1112 (the input),
   :1564 (close of the CSS template literal).
2. The claim that `--raven-grab-ui` and `--raven-grab-mono` are byte-identical.
3. The claim that `prefers-color-scheme` appears ZERO times in the file.
4. The claim that no edge-snapping / dock behaviour exists.
5. §3's exhaustive list of moved pixels: row padding 9->8, label-wrap gap 5->4,
   input horizontal padding 10->12, unlink radius 7->6, AND NOTHING ELSE.
   Walk every AFTER block in §3 against its BEFORE and find any value the spec
   changed without listing it. This is the highest-value check.
6. §2's token set actually covers every literal §3 substitutes. Any token
   referenced in §3 but not defined in §2 is a defect.
7. The claim that a 2px-quantised scale normalises the measured values with less
   movement than a 4px scale.
8. §5's verification bar: is each check actually falsifiable, or would it pass on
   a change that never took effect?

## What you may NOT rely on

The spec asserts DialKit publishes no spacing/type/radius numbers. Do not fetch
the web. Treat that as given and audit only the internal consistency of the spec.

## Output

Findings ranked P1/P2/P3, each with file:line evidence. Then one verdict line:
SURVIVES or DOES NOT SURVIVE.
