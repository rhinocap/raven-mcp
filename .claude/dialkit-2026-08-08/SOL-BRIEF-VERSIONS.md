# Falsification brief — named style versions (Grab overlay)

You are a REPORT-ONLY adversary. Do not edit any file. Your job is to REFUTE the
claims below, not to confirm them. Default to "this claim does not survive" when
you are uncertain, and say exactly which input or sequence breaks it.

## Repo
`/Users/accunliffe/projects/raven-mcp` — public open-source MCP server. The work
under review is uncommitted and touches only:

- `browser/raven-grab.js` (the Grab overlay, injected into a user's page)
- `web/public/raven-grab.js` (a byte-identical mirror; `cp` of the above)
- `test/grab-overlay-style-versions.test.mjs` (new, 6 tests, real Chromium)
- `test/grab-overlay-voice-alignment.test.mjs` (one number: mic count 8 → 9)
- `.claude/dialkit-2026-08-08/version-mutants.mjs` (new mutation harness)

Nothing in `src/` or `api/` changed, so the live MCP endpoint is not involved.

## What the feature is
The overlay lets a designer edit an element's computed styles in a panel. Those
edits accumulate in a module-level `styleEdits` map (the "draft"). This round
adds NAMED VERSIONS: save the current draft's style edits under a name, list
them, restore one, delete one. Persisted in `sessionStorage`, scoped by CSS
selector, capped at 40 chars / 100 entries.

## Claims to attack

1. **Restore is correct.** `restoreStyleVersion` REVERTS every property in the
   live draft that the named version does not carry (via `clearStyleEdit`), then
   applies the version's own edits through `commitStyleEdit`. Claim: after a
   restore, the element carries exactly the version's edits and nothing else.
   Attack the ordering, the token-carrying branch, mixed values, scope siblings,
   and any property whose revert path differs from its apply path.

2. **The refusal is honest.** `styleVersionSaveBlocker()` refuses to save while
   the draft also holds state (hover/focus) edits, token intents, or a text
   edit, returning the reason as a string that the panel prints. Claim: there is
   no input that produces a saved version representing only PART of what is on
   screen. Attack: is `styleEdits` really the only versioned collection? Is
   there a fourth kind of edit not in the blocker's list? Can a blocked
   condition arise BETWEEN the blocker check and the write?

3. **The id sequence cannot collide.** `hydrateStyleVersions` seeds
   `styleVersionSequence` from the stored MAXIMUM id, not the length. Claim: a
   newly minted id can never equal a live one, so restore/delete never misroute.
   Attack: two tabs on the same origin, a hand-edited `sessionStorage` value, a
   non-integer or negative id passing the shape filter, `Number.MAX_SAFE_INTEGER`.

4. **The section stays in sync without re-rendering.** A style commit
   deliberately does NOT call `renderPanel()` (it would destroy the open editor
   mid-keystroke). Visibility and the refusal note are synced in place from
   `syncActiveStyleDraftKey()`, which is called from all fifteen draft-mutation
   sites. Claim: the section's visible state always matches the draft. Attack:
   any path that mutates `styleEdits` / `stateStyleEdits` / `tokenIntents` /
   `textEdit` WITHOUT reaching `syncActiveStyleDraftKey`; the multi-panel
   (`panelQueryAll`) case; selection change; draft stash/restore; the mobile
   sheet.

5. **Storage is safe.** `readStoredStyleVersions` shape-filters every entry and
   swallows parse errors to `[]`. Claim: no `sessionStorage` content can throw
   at boot or inject markup. Attack: prototype-polluting keys, a name containing
   HTML (is `escapeHtml` applied at EVERY site the name reaches, including the
   `aria-label`?), a selector that is not a string at some depth, a huge blob.

6. **The mutation matrix is trustworthy.** `version-mutants.mjs` reports 9
   mutants / 9 killed / 0 survived, 2 controls / 0 false-failed, EXIT=0. Claim:
   that verdict is falsifiable and the controls are behaviour-neutral. Attack
   the harness itself: can it report a kill it did not make, or grade a run that
   measured nothing? Are C1/C2 genuinely neutral? Is any mutant red for the
   wrong reason (e.g. red both before and after the fix, which this repo has
   already recorded once as a mis-graded control)?

7. **The tests encode rather than detect.** All six passed on their first run.
   Attack each test's preconditions: does any assertion pass against the defect
   it names? Is any fixture confounded (e.g. a value already carrying a decimal,
   an element whose geometry makes the assertion insensitive)?

## Output
For each finding: severity (P1/P2/P3), the exact file and line, the concrete
input or sequence that breaks it, and what the correct behaviour would be. No
patches. If a claim survives, say so in one line and move on — do not pad.
