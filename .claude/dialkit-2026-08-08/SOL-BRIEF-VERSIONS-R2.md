# Falsification brief — round 2, named style versions (Raven Grab overlay)

You are a report-only adversarial reviewer. Do NOT edit any file. Find defects.
Your verdict is either SURVIVES or DOES NOT SURVIVE, with each finding rated
P1 (correctness/data-loss/security), P2 (real defect, bounded harm) or P3
(claim or comment is false).

## What this is

`browser/raven-grab.js` implements "named style versions" in the Raven Grab
overlay: the user saves the active draft's *style edits* under a name, then
restores or deletes them. Storage is `sessionStorage`, key
`raven-grab-style-versions-v1`, scoped by CSS selector. Read roughly lines
4500–4790 of `browser/raven-grab.js` (`STYLE_VERSION_STORE_KEY` through
`styleVersionsMarkup`), plus `syncActiveStyleDraftKey`, `componentScopeFor`,
`setEditScope`, `applyStyleToScopeSiblings` and `dropStyleDraft`.

Round 1 of this review already ran and returned DOES NOT SURVIVE with 5×P2 +
1×P3. **This round grades the FIX for those findings, and the tests and mutation
harness written for it.** The round-1 findings and their disposition are:

1. Save refused component scope; **restore did not** — a restore under component
   scope mirrors the version onto every sibling via `applyStyleToScopeSiblings`,
   and the scope can be switched *after* a save. FIXED: `restoreStyleVersion`
   returns false unless `editScope === "instance"`.
2. The blocker returned a boolean, so a disabled Save could not say why.
   FIXED: `styleVersionSaveBlocker()` returns the reason string or "".
3. Stored ids were trusted (`hydrateStyleVersions` seeded the sequence from the
   stored MAX). FIXED by **renumbering**: hydrate ignores stored ids entirely,
   assigns `index + 1`, and sets `styleVersionSequence = styleVersions.length`.
4. `typeof x === "object"` accepted `{"edits":{"color":null}}`, which then threw
   out of the restore click handler. FIXED: `isStyleVersionEdits()` requires a
   string `newValue` per property; bad entries are dropped at read time.
5. The 100-entry cap was enforced only on the way to storage, so the 101st save
   rendered a full list and the oldest row vanished on the next reload. FIXED:
   eviction moved into memory at the save site; the storage-read `.slice()`
   stays as belt-and-braces.
6. (P3) The harness could grade a corpus that is not the one it describes.
   FIXED: `EXPECTED_BASELINE_TESTS` declared per suite.

One round-1 finding was **ACCEPTED, not fixed**: an instruction draft does NOT
block a save. Rationale in the code comment — a version covers base styles and
an instruction is not a style. Mutant V15 inverts it so the decision is pinned.
If you think that acceptance is wrong, say so, but grade it as a decision.

## Files to read

- `browser/raven-grab.js` — the product code (the versions block, and every
  function named above).
- `test/grab-overlay-style-versions.test.mjs` — 12 browser tests, real Chromium,
  full-probe pattern. Its header states the decisions and the measured matrix.
- `.claude/dialkit-2026-08-08/version-mutants.mjs` — the mutation harness.

## Measured facts (do not re-derive; challenge them if you think they are wrong)

- Suite: 12 tests / 12 pass / 0 fail / 0 skipped.
- Matrix: baseline 12p/0f/0s, **16 mutants, 16 killed, 0 survived; 2 CONTROLS,
  0 false-failed**, EXIT=0. Radii: V1 1, V2 1, V3 3, V4 1, V5 1, V6 1, V7 2,
  V8 4, V9 12, V10 1, V11 1, V12 1, V13 1, V14 1, V15 1, V16 1.
- The mirror `web/public/raven-grab.js` is byte-identical to `browser/`.

## What I most want attacked

1. **Is renumber-on-hydrate actually sufficient?** Ids are used to route restore
   and delete. Is there any path where a stored id, a live id, or the sequence
   can still collide or misroute — including across a save/delete/reload
   interleaving, or two tabs sharing one `sessionStorage`-equivalent?
2. **Is the scope rule now closed at every door?** Save and restore both refuse
   component scope. What about delete, the markup, the blocker note, and the
   in-place row update on a duplicate name? Is there a sequence that lands a
   version's styles on siblings anyway?
3. **`isStyleVersionEdits` — what still gets through?** Prototype keys, arrays,
   getters that throw, huge strings, `newValue` present but `property` bogus.
   What is the worst outcome of each: a refusal, a dead button, or a wrong
   write?
4. **The cap.** Both doors are capped. Is there a third door? Is the in-memory
   eviction correct when a save UPDATES an existing name rather than pushing?
5. **The tests.** Which of the 12 could pass against a defect? Which assertion is
   weaker than the property it names? Is any fixture confounded — i.e. would it
   pass with the mechanism it targets deleted, for a reason other than the one
   the test claims?
6. **The harness.** Can it report "killed" for the wrong reason, or grade a run
   it should have refused? Is any mutant behaviour-neutral (a false kill) or is
   either control not actually neutral?
7. **Every comment is a claim.** The suite header and the code comments make
   specific factual assertions (radii, what a mutant proves, what a rule
   covers). Name any that are false or overstated.

Report findings only. Cite file and line. Do not edit.
