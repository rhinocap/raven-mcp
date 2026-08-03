# Round 3 pre-registration amendments

The pre-registration says a change after the first build exists is recorded here with its
reason, and the analysis reported both ways. Both amendments below were decided from
**hand-written validation fixtures** (`harness-validation/`), before any real build was
scored, and both apply identically to the two arms.

## A1 — P1 measures the MAX text size in the transient surface, not "the message"

**Registered:** "Snackbar message font-size resolves within the body band (≤ 20px)."
**Amended to:** "No text node inside the surface that appeared on save exceeds 20px."

**Reason:** identifying "the message" requires guessing a class name or DOM position, which
differs per build and would make the primary endpoint depend on a heuristic that could
plausibly favour one arm's naming conventions. The max over the surface needs no such guess,
is strictly stronger (it implies the registered check), and targets the same defect — display
type inside a glanced-at surface. The surface itself is identified mechanically as the set of
elements that became visible as a result of the save click.

## A2 — P2 excludes talon findings in category `structure`

**Registered:** "talon_scan → 0 findings ≥ warning."
**Amended to:** "talon_scan → 0 findings ≥ warning, excluding category `structure`."

**Reason:** TAL-010 (heading-level skips) and TAL-011 (no landmark roles) score document
structure. The deliverable is one component on a minimal demo harness, not a page, and neither
arm's prompt asked for landmarks or a heading hierarchy. Evidence it is not a real defect
signal here: a hand-written, deliberately clean fixture (`harness-validation/build-91`) fires
TAL-011, as does the deliberately defective one — the rule is a constant across the design,
so leaving it in removes P2's ability to discriminate at all while penalising both arms
equally. Excluded findings are still captured per build under `talon_structure_excluded` and
the analysis is reported both ways.

## Harness validation record

| fixture | intended | P1 | P2 | P3 | P4 | P5 | P6 | score |
|---|---|---|---|---|---|---|---|---|
| build-90 | deliberately defective (27px in surface, bare hex, no reduced-motion) | F | T | T | T | F | F | 3 |
| build-91 | deliberately clean | T | T | T | T | T | T | 6 |

The defective fixture violates exactly the checks it was written to violate, and the clean one
passes all six. Two harness bugs were found and fixed during this validation: a relative
`file://` path (ERR_INVALID_URL) and a `page.evaluate` string being evaluated as an expression
that returned the collector function instead of calling it.
