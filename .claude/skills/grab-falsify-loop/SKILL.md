---
name: grab-falsify-loop
description: The proven fix→kill-proof-test→falsify iteration loop for browser/raven-grab.js overlay work. Use for ANY change to the grab overlay (features, fixes, restyles) — it encodes the style contract, mirror rule, kill-proof procedure, falsify-panel shape, and the harness recipe for eyes-on verification.
---

# Grab overlay falsify loop

Every substantive change to `browser/raven-grab.js` runs this loop until a falsify wave returns only MINORs or accepted-by-design findings.

## Invariants (violations are bugs)

- **Mirror:** `browser/raven-grab.js` must stay byte-identical to `web/public/raven-grab.js`. After every edit: `cp browser/raven-grab.js web/public/raven-grab.js && cmp browser/raven-grab.js web/public/raven-grab.js`.
- **Style contract (overlay only):** `var` + `function` keyword; NO arrow functions, NO optional chaining, NO `const`/`let` inside function bodies, NO `for...of`. Template literals: 23 pre-existing backticks are grandfathered — match the surrounding string-concat idiom, don't add new ones. Nested function declarations ARE used (e.g. `commit()` in `beginStyleEdit`). Modern ESM/arrows are fine in `test/grab-bridge.test.mjs`.
- **Tests:** `npm test` must exit 0 (runs tsc build + `node --test test/**/*.test.mjs`). The suite honors `RAVEN_GRAB_TEST_OVERLAY=<path>` to load an alternate overlay copy.
- **isConnected convention:** the fake test DOM may leave `isConnected` undefined — check `=== false` / `!== false`, never truthiness.
- **buildLayerTree caps:** 500 nodes / depth 12.

## The loop

1. **Fix/feature leg** (codex, `agentType: 'codex:codex-rescue'`): line-anchored spec per edit; edits ONLY the overlay + mirror. Verify with `node --check` + targeted `node --test`.
2. **Test leg** (codex, edits ONLY `test/grab-bridge.test.mjs`): one regression test per behavior. **Kill-when-reverted proof is mandatory for fixes**: revert the specific fix in a scratch copy, run the test against it via `RAVEN_GRAB_TEST_OVERLAY`, show it FAILS; then show it passes against the real overlay. A test that can't be killed proves nothing.
3. **Falsify panel** (2–3 codex report-only lenses in parallel): prompts start with `REPORT ONLY. DO NOT EDIT ANY FILES.` Escalate wave-over-wave: single actions → paired/compound gestures → async interleavings (1.5s layer poll, fetch resolutions, setTimeout timers, deactivate/reactivate). Require severity + exact lines + concrete failure scenario + whether an existing test catches it; tell them an empty blocking list is acceptable.
4. **Main-loop disposition:** verify EVERY finding against source before accepting — falsifiers over-state (e.g. the template-literal "contract blocker" that was pre-existing convention). Classify: fix now / accepted-by-design (log why) / deferred (log where).
5. **Converge:** only MINORs/accepted left → `cmp` + `npm test` + eyes-on harness pass → commit with explicit pathspec.

## Eyes-on harness

`phase1-harness.mjs`: bridge on :49901 proxying the Verdict demo (:8472), serving the overlay from disk per-request; control on :49902 (`/ops`, `/mark?id=&mark=applied|rejected`). Alt+G activates. Overlay shadow host is an anonymous DIV child of `<html>`:
`[...document.documentElement.children].find(e => e.tagName === 'DIV' && e.shadowRoot)`.

## Gotchas

- Codex agent edits get auto-staged — use `git diff HEAD`, not `git diff`.
- Keep workflow `agent()` return schemas tiny (or schemaless): a large JSON return killed a leg on the StructuredOutput retry cap AFTER all its work was done (recover from the transcript, don't re-run).
- A codex wrapper that narrates timers with no findings is stalled — fire a fresh pass.
- `git commit` with explicit pathspec always (shared multi-instance tree).
- **Fan out as wide as the task deserves — but every loop must CONVERGE (Andrew: "efficiency is number one")**: dedupe vs everything SEEN (not just confirmed) so judge-rejected findings can't respawn, end the loop when a round yields nothing new (≤2 dry-rounds), and set an explicit cheap `model` on every `agent()` call. A 288-agent hunt is fine when each round finds new ground; the 2026-07-13 runaway burned a session limit because it spent most agents RE-verifying duplicates for hours — the bug was non-convergence, not width.
