# Playground schema 2.0 in Raven (2026-10-31)

Branch `motion-playground` (unmerged, not pushed). Andrew's instruction on Motion Lab decision 7: "Change it, keep accepting, let's test it before we push any thing that major."

## What changed
- `src/data/motion/playground.schema.json` re-synced from Motion Lab HEAD `ab669de` with `scripts/sync-motion-motifs.mjs`. `schemaVersion` is now `enum ["1.0","2.0"]`; `curve` joins the param types with `kinds`, `default` and up to 4 labelled `stops`. The keyfob schema and runtime hashes did not change; `--check` reports in sync.
- `motifs.lock.json`: `source_commit` 27b70b7 to ab669de, playground schema sha256 `6d5825b7…51d3d`. ab669de is a local Motion Lab commit, also not pushed.
- `src/motion-playground/validate.ts`: ported Motion Lab's curve rules (commits 6f0a845 and 4d91c95):
  - `curveValueOk` and `curveKey`, taken from `src/timeline/evaluator.js`
  - curve values in `valueOk`, so presets and overrides are checked
  - easing role accepts a curve
  - a curve needs schemaVersion "2.0"
  - default and stops must be curves the control offers
  - stop labels in designer language unless the control is advanced
  - no duplicate stop labels or curves
  - a curve cannot be in a constraint
- `src/motion-playground/index.ts`: a motif with a curve control is refused with a named error, because Raven's template fork has no curve editor. No built-in motif reaches this today; the comment says so.

## Verification
- New test `schema 2.0 adds the curve control; 1.0 documents stay valid unchanged` in `test/motion-playground.test.mjs`.
- Mutants against `dist/` (scratchpad `curve-mutants.mjs`): 10 of 10 killed, including restoring the old 1.0-only schema. Restore was verified by string equality, and the control passed.
- Anonymous build: 45 tools, hash `f64bb18…2bb0a6`, unchanged.
- Full suite (`RAVEN_NO_USAGE_LOG=1 npm test`): 1869 tests, 1866 pass, 0 fail, 3 skipped, EXIT=0 read inside the log. The skips are the same three, at log lines 121/895/896. The new test passed at log line 1317. `test/motion-playground.test.mjs` is the only test file in the diff, going from 26 to 27 tests. The branch's last logged figure (1840, 2026-09-22) is stale by earlier branch work; it is not attributable to this change.
- Keyfob output measured against HEAD, not argued: HEAD was built from `git archive` in the scratchpad, and both builds ran the same calls.
  - seeded HTML is byte-identical (`cmp`)
  - HTML with an override is byte-identical
  - an out-of-range override is refused with the same message
- One visible difference: a curve-shaped override on keyfob's 1.0 enum `swingFeel` is still refused, but the error now carries two more schema lines, `unevaluated properties (default)` and `(widget)`. They come from the synced Motion Lab schema. The lock keeps Raven's copy byte-identical to it, so changing them belongs in Motion Lab, not here.

## Sol pass (GPT-6.1-Sol, medium, report-only)
- Verdict: DOES NOT SURVIVE, one P2. Removing any of four rules left the test green:
  - the spring maximum duration
  - a stop must be a kind the control offers
  - the stop-label punctuation check
  - the curve check on constraint operand `b`
- Sol confirmed the rest: no mismatch in the curve port, schema bytes and lock hash match Motion Lab, keyfob HTML is byte-identical to HEAD, and the anonymous build has 45 tools.
- Fixed in the test only; no product code changed. Added:
  - a refusal case for each of the four rules, plus the code-shaped stop label (`swing_feel`)
  - preset values at every curve bound, accepted on the edge and refused just past it: spring duration 10 and 60000, bounce ±0.9, and all eight bezier x/y limits
  - presets reach `curveValueOk` without the JSON Schema's curve shape, so they test the TypeScript bounds on their own
- Mutants v2 (`curve-mutants.mjs`, re-run whole):
  - 26 mutants, 26 killed; restore verified, control passed, EXIT=0
  - the first v2 run had one survivor, a dropped `p[2] >= 0`; the edge set was incomplete, and the eight-edge set closed it
- Full suite re-run: 1869 / 1866 / 0 / 3, EXIT=0; the same three skips at lines 121/895/896. Same count, because the cases went into the existing test.
- Sol did not edit the tree: HEAD is still a3a5e01, and the code diff is unchanged from its snapshot.
- Committed locally as 66637fb on `motion-playground` (16 ahead of origin/main, no remote branch). Not pushed.
