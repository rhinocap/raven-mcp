# Falsification brief — REPORT ONLY, change nothing

Repo: /Users/accunliffe/projects/raven-mcp (public OSS MCP server). Nothing is
committed or pushed. `src/` is untouched.

## The claim to attack

"The three CALL SITES of the numeric precision floor are now guarded. A
regression at any one of them turns exactly one test red."

## What was done

1. `browser/raven-grab.js` — the ONLY product change is a rewritten comment
   above `scrubPrecisionMode` (~line 5020). No behaviour changed. Mirrored
   byte-identical to `web/public/raven-grab.js`.
2. NEW `test/grab-overlay-precision-tiers.test.mjs` — 3 Playwright/Chromium
   tests, one per call site:
   - pointer scrub: mousedown on `[data-style-label]` for `font-size`, Alt held,
     5px drag, assert the element's inline `font-size` is `16.5px`.
   - style-editor arrow: open the editor on `font-size`, Alt+ArrowUp, assert the
     input reads `16.1`.
   - size-control arrow: open the editor on `width`, Alt+ArrowUp, assert `240.1`.
3. `.claude/dialkit-2026-08-08/precision-mutants.mjs` — matrix v3, now running
   both `test/grab-bridge.test.mjs` and the new suite.

## Evidence

- Full suite: 1495 tests / 1492 pass / 0 fail / 3 skipped, EXIT=0.
  The 3 skips were READ at output lines 109/714/715.
- Matrix v3 in `.claude/dialkit-2026-08-08/agent-output/precision-matrix-v3.txt`:
  7 mutants, 7 killed, 0 survived; 1 control green, 0 false-failed.
  P5/P6/P7 each radius 1, a different test each.
- Matrix v2 (`precision-matrix-v2.txt`) is the BEFORE state: P5/P6/P7 SURVIVED.
- `test/no-private-paths.test.mjs` on the index: 4 pass / 0 fail.

## Attack these specifically

1. **Do the three tests actually discriminate?** Is there any way each passes
   while its call site is broken? Consider: the whole-number fixture premise,
   whether `16.5px` could arise from a path other than the fine tier, whether
   the Alt keypress reaches the handler at all vs. the assertion passing for an
   unrelated reason, and whether Chromium normalisation could mask a defect.
2. **Is the scrub test measuring the scrub?** It arms on `[data-style-label]`.
   Verify by reading `beginStyleScrub` and its mousedown registration
   (~line 12442) that no other mechanism could produce the same inline value.
3. **Radius-1 claim.** P5/P6/P7 each redden exactly one test. Is that evidence of
   three separate wirings, or could one shared mechanism produce it?
4. **The rewritten comment.** Read it. Is every claim in it true against the
   code? It asserts (a) the unit assertions cannot see past the helper, (b) the
   browser suite covers the wiring, (c) `beginStyleScrub.move()` re-derives the
   rounding inline rather than calling `steppedNumericValue`, and (d) the two
   are not trivially unifiable because they use different parsers
   (`parseNumericValue` vs `parseNumericExpression`).
5. **The harness.** `precision-mutants.mjs`: is the name regex, the skip-vs-
   baseline pin, the exit/summary agreement check, or the control sound? Can the
   matrix report a kill that is not a kill, or miss a survivor?
6. **Scope/safety.** Did anything reach `src/`, the remote tool set, or the
   anonymous 45-tool surface? Confirm or refute from the diff.
7. **CLAUDE.md** — the ledger figure and the two landmines. Any claim there that
   the evidence does not support?

Output: numbered findings, each P1/P2/P3, each with the file:line and the
concrete input that breaks it. End with SURVIVES or DOES NOT SURVIVE. Do not
edit any file.
