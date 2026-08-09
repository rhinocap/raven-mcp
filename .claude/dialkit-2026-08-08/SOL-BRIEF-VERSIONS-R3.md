# Falsification brief — named style versions, round 3 (Sol, REPORT ONLY)

You are an adversarial reviewer. **Do not edit any file.** Your job is to REFUTE the
claim below, not to confirm it. Read the code yourself; treat every sentence here as
a claim under test, including the measurements.

## The claim

The round-2 fixes to the named-style-versions feature in the Raven Grab overlay are
correct, and the three tests written for them are detecting rather than encoding.

## What changed in round 2 (all in `browser/raven-grab.js`, mirrored byte-identically
to `web/public/raven-grab.js`)

1. **Shape is not validity.** `isStyleVersionEdits` was split into a SHAPE half
   (types) and a VALIDITY half (`CSS.supports(property, edit.newValue)`, with a
   fallback to `true` when `window.CSS.supports` is unavailable). Motivation:
   `restoreStyleVersion` CLEARS live edits before applying, and `commitStyleEdit`
   refuses anything `CSS.supports` rejects — so a hand-edited
   `{"color":{"newValue":"nonsense"}}` wiped the user's live work, applied nothing,
   and returned `true`. A destructive no-op reported as a successful restore.
2. **A stale component-scope mirror blocks BOTH a save and a restore.**
   `outstandingScopeSiblingPreview()` returns the first property still held in
   `styleEditScopeSiblingsOriginal` (when `styleEditScopeSiblingsTarget ===
   selectedElement`), or `""`. Both blockers consult it, and the refusal names the
   row to clear. Motivation: `editScope` is a live toggle and says nothing about how
   the draft was PRODUCED — edit under component scope, switch back to instance, and
   `componentScopeSiblingElements()` returns `[]` while the siblings still carry the
   mirrored values.
3. **The cap is per selector, at both doors.** `evictStyleVersionsOverCap(selector)`
   on the save side and `capStoredVersionsPerSelector(entries)` on the read side
   replaced two global `slice(-STYLE_VERSION_LIMIT)` calls. Motivation: the panel
   renders per selector, so a global trim deletes a version off an element the user
   is not looking at — a silent loss.

Explicitly **reported, not fixed**: the scope toggle's own asymmetry — leaving
component scope neither reverts nor re-applies the mirrored sibling previews.

## Evidence offered

- `test/grab-overlay-style-versions.test.mjs` — 16 tests, real Chromium, full probe
  pattern (loopback listen with `once('error')`, mkdtemp/writeFile/rm, launch,
  newPage, goto with `.ok()`, close), three of them new this round.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — v3 matrix, measured:
  **22 mutants, 22 killed, 0 survived; 2 controls, 0 false-failed; EXIT=0**, against
  a declared 16p/0f/0s baseline. Harness contract: clean green baseline first,
  declared `EXPECTED_BASELINE_TESTS`/`EXPECTED_BASELINE_SKIPS` so a baseline that
  measured nothing cannot pass as a result, `node --check` per mutant, find-strings
  required present AND unique, deduped failing test NAMES, exit-status/summary
  agreement required, `process.exitCode = 1` on any survivor or false fail.
- Radii: V1 1 · V2 1 · V3 5 · V4 1 · V5 1 · V6 1 · V7 2 · V8 7 · V9 16 · V10 1 ·
  V11 1 · V12 1 · V13 1 · V14 1 · V15 1 · V16 1 · V17 2 · V18 1 · V19 1 · V20 1 ·
  V21 1 · V22 1.

## Where to attack

- Is the `CSS.supports` read-side check ever able to DROP a version the user legitimately
  saved in this session (shorthand serialization, vendor values, custom properties,
  `var()` references, `!important`, values valid in the page's engine but not at
  check time)? A read filter that silently deletes real work is worse than the bug.
- Does the `!window.CSS || typeof window.CSS.supports !== "function"` fallback open a
  path back to the destructive no-op?
- Is `outstandingScopeSiblingPreview()`'s `styleEditScopeSiblingsTarget !==
  selectedElement` early-return correct? Can a mirror outstanding on a DIFFERENT element
  go unblocked, so the same blend ships under another selection?
- Can the per-selector cap now allow unbounded TOTAL storage growth (N selectors ×
  100) and hit the sessionStorage quota — and what happens on the throw?
- Do the three new tests actually assert the mechanism, or a proxy that would pass
  against the defect? Name a concrete input where a test passes and the product is wrong.
- Are the V13-vs-V17 and V21-vs-V22 "two mechanisms" readings correct, or is one of
  each pair redundant?
- Anything in the suite header or the harness comments that is a CLAIM and is false.

## Output

Findings only, ranked P1/P2/P3, each with: the file and line, a concrete failing
input or sequence, and what the observable wrong behaviour is. If a claim survives,
say which ones you tried to break and how. Verdict: SURVIVES / DOES NOT SURVIVE.
