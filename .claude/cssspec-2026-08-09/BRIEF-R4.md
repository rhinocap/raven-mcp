# Falsification pass — round 4 — Grab panel CSS spec

REPORT ONLY. Do not edit any file. Do not run `npm test`. Do not modify
`browser/raven-grab.js` or `web/public/raven-grab.js`. Your output is a written report;
nothing you say will be applied automatically.

## What this is

`docs/grab-panel-css-spec.md` is a SPEC. **No code has been changed.** It proposes a
design-token migration for the Raven Grab overlay's CSS, which lives entirely inside one
template literal in `browser/raven-grab.js` (`:host {` opens at line 774, the literal
closes at 1564).

Rounds 1, 2 and 3 all returned DOES NOT SURVIVE (6, then 11, then 7 findings). All were
dispositioned; the spec grew 399 → 511 → 742 → ~880 lines. **No round has yet audited the
current text** — round 3 audited a 742-line snapshot and nine edits landed after it
launched. The claims below are round 3's own fixes, so do not assume an earlier round's
finding is still open.

Raw logs, if useful (do not treat their findings as current):
`.claude/cssspec-2026-08-09/agent-output/sol-round1.log`, `…sol-round2.log`,
`…sol-round3.log`. Prior briefs: `BRIEF-R3.md` and its predecessors, same directory.

**One known error in the round-2 brief, stated here so you do not inherit it:** it claimed
§5 check 3's `m('ii') === m('MM')` "must become false". That was wrong. Equal advance
widths mean a monospace face resolved, so the spec's "must be **true**" is correct.

## Files

- Spec under audit: `docs/grab-panel-css-spec.md`
- Ground truth: `browser/raven-grab.js` (read-only; 14,377 lines)
- Mirror that must stay byte-identical: `web/public/raven-grab.js`

## Claims under audit

Try to REFUTE each against the actual source. Default to "refuted" when you cannot verify.

1. **§3.4's exhaustive-pixel claim, re-derived after `:1096` was added.** It now names
   **six** values that Phase A moves: row padding 9→8; label-wrap gap 5→4; style-input
   horizontal padding 10→12; radius-field input horizontal padding 5→6; radius-field input
   radius 5→4; unlink radius 7→6. **Walk every substitution in §3 and find a seventh**, or
   any of the six that is misstated. The claim is also said to hold ONLY because §3.3's
   `font-variant-numeric` is deferred to Phase B — attack that too.

2. **§3's omission lists.** §3.2/§3.3/§3.4's before/after blocks are substitution lists,
   not complete rules, and each names the declarations it omits — including a ten-row table
   in §3.4. **Verify every omission list against the source. A missing entry is a P1**,
   because someone editing from this document would delete a live declaration. `:1096` was
   missing from §3.4 entirely for three rounds; check whether any rule inside `:1073-1127`
   is still absent from §3 altogether.

3. **§2A's grid-comparison arithmetic**, re-derived over six migrations: 2px grid moves 5
   of the six, 4px grid moves 7. Recompute. The spec says the panel-wide inventory (23
   positive spacing values / 16 radii / 30 sizes, unit = DISTINCT VALUES unweighted by
   occurrence) is what chooses the grid, and that the six-value comparison merely leans the
   same way. Verify both the inventory and the six-value arithmetic.

4. **§5 check 2's six computed-value reads and the four-conditional table.** The spec now
   claims checks 2 and 3 query six elements, four of which are conditional, with a stated
   ordering dependency: `.raven-grab-radius-field input` requires `beginRadiusEdit`
   (`:8511-8513`) reached by clicking `[data-radius-expand]` (`:12697-12698`), which is
   emitted only inside the `.raven-grab-style-label-wrap` branch (`:11631-11632`), which
   itself requires a non-`Mixed` `border-radius` that passes `parseBorderRadius`. **Is that
   the full precondition list? Name any selector that still cannot resolve, or any
   precondition the spec fails to state.** Also verify the six asserted computed values are
   the values a correct migration actually produces.

5. **§5 check 4's stated blind spot.** The spec claims all three greps pass on a migration
   that substitutes `--raven-grab-text-lg` where §3 says `--raven-grab-text-2xs` (counts
   0 / ≥6 / 4), so check 4 bounds shape and not value. It also states pre-migration counts
   of 7 (leg 1) and 4 (leg 3), and calls leg 3 a preservation check rather than a progress
   check. Verify all of that, and **name a further input where the migration is wrong and
   every check in §5 still passes.**

6. **§6.2's three-reason refutation of "one line, not a loop".** The spec now claims
   flipping `data-side` alone cannot move the panel because (a) `placePanel` writes inline
   `right: auto` + `left` (`:2888-2889`) which outrank `[data-side="left"]` (`:833`);
   (b) `clampPanelToViewport` (`:2893-2904`) restores `pos.left` from `__ravenPosition` on
   every resize (`:14320`); (c) the only declared transition is `transform 200ms ease`
   (`:831`), so nothing animates `left`. Verify each. **Is there a fourth reason, or is any
   of the three wrong?** It also cites `updateMobileSheetViewport` (`:14296-14300`) as the
   codebase's own precedent for the fix — verify that reading.

7. **§6.2's inertness claim and its now-CLOSED exceptions.** The spec asserts
   `endMobileSheetDrag`'s three-detent loop cannot respond to the gesture, because
   `pointermove` (`:2960-2968`) writes only `top`/`bottom` and never height; height is
   written solely by `setMobileSheetSnap` (`:2757`) into `--raven-grab-sheet-height`
   (`:853`); and `box-sizing: border-box` is global (`:790`). Round 3's two conceded
   exceptions are now claimed CLOSED: the in-flight `transition: height` (`:854`) is killed
   during a drag by `data-sheet-dragging` (`:2956`) + `:868` on the same selector; and a
   viewport resize recomputes the stored height from current `innerHeight`
   (`:14302`, `:2747`). One residual is left open and labelled UNMEASURED: `:14302` skips
   the rewrite when `mobileSheetSnap === "collapsed"`. **Find a reachable input where the
   loop is NOT inert**, and say whether the residual is reachable.

8. **§6.3's revised geometry claim.** It now says Raven has "two anchored SIDES plus a
   continuum of dragged horizontal positions — not four, and not two either", that
   `pos.top` round-trips through `clampPanelToViewport` → `placePanel` and never reaches
   the DOM, and that `panelPosition` (`:352`, assigned `:2887`) is **never read anywhere in
   the file**. Verify the never-read claim by searching all readers.

9. **The mono call-site enumeration.** §1 Gap 2 / §3 Phase B claim
   `grep -c 'var(--raven-grab-mono)' browser/raven-grab.js` = **28 usages** plus 1
   definition at `:789`, reconciling as 4 inside the §3 range + 24 outside, and that
   `--raven-grab-ui` and `--raven-grab-mono` are byte-identical at `:788-789` with the
   `@import` at `:773` requesting no monospace family. Verify the count, the split, the
   byte-identity and the import.

10. **The WCAG citation.** §2 and §4 item 4 claim 44px is **SC 2.5.5 Target Size
    (Enhanced, AAA)**, that SC 2.5.8 is the AA criterion at 24×24 CSS px, and that the
    overlay meets 2.5.8 separately via the hit-slop at `:1090-1091`. Verify the criterion
    numbers, sizes and levels, and verify the hit-slop citation against the source.

## Also look for, unprompted

- Any remaining internal contradiction between sections (round 1 found §0 contradicting
  §6.2; round 2 found §7's ordering contradicting the Phase A/B split; round 3 found §5's
  own gate failing on §3's instructions). **Pay particular attention to counts that were
  updated in one place and not another — "four pixels" became six this round.**
- Any claim stated as measured that carries no measurement.
- Any place the spec would produce a broken stylesheet if followed literally, including
  malformed CSS comments in §2A's token block.
- Any surviving stale claim from an earlier draft that is NOT labelled as a correction.
- Anything that would make the byte-identical mirror test fail.

## Output format

Rank findings P1 / P2 / P3. For each: the claim, the evidence that refutes it (file:line),
and the concrete correction. End with exactly one verdict line:

`VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`

If you find nothing, say so explicitly rather than inventing a finding.
