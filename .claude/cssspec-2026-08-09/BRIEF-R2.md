# Falsification pass — round 2 — Grab panel CSS spec

REPORT ONLY. Do not edit any file. Do not run `npm test`. Do not modify `browser/raven-grab.js`.
Your output is a written report; nothing you say will be applied automatically.

## What this is

`docs/grab-panel-css-spec.md` (511 lines) is a SPEC. No code has been changed. It proposes a
design-token migration for the Raven Grab overlay's CSS, which lives entirely inside one
template literal in `browser/raven-grab.js` (`:host {` opens at line 774, the literal closes
at 1564).

Round 1 returned DOES NOT SURVIVE (2 × P1, 3 × P2, 1 × P3). All six findings were
dispositioned and the spec was revised (399 → 511 lines). Round 1's raw log is at
`.claude/cssspec-2026-08-09/agent-output/sol-round1.log` — read it if useful, but do NOT
assume its findings are still open; several fixes are the very claims under audit below.

## Files

- Spec under audit: `docs/grab-panel-css-spec.md`
- Ground truth: `browser/raven-grab.js` (read-only; 14,377 lines)
- Mirror that must stay byte-identical: `web/public/raven-grab.js`

## Claims under audit

Each of these is a claim the revised spec makes. Try to REFUTE each one against the actual
source file. Default to "refuted" when you cannot verify.

1. **The mono count is 28.** §1 Gap 2 and §3 Phase B both assert `grep -c
   'var(--raven-grab-mono)' browser/raven-grab.js` = 28 usages, plus 1 definition line at
   :789. Verify the number, and verify the §3 Phase B enumeration of call-site line numbers
   actually resolves to mono declarations (spot-check every one you can).

2. **`--raven-grab-ui` and `--raven-grab-mono` are byte-identical today** (:788–789), and the
   `@import` at :773 requests no monospace family. If either is false, the spec's central
   premise — that swapping in a real mono face is a visible change with a 28-site blast
   radius — is wrong.

3. **The Phase A / Phase B split is sound.** Phase A = geometry tokens, claimed to move
   exactly 4 named pixel values and be diffable by capture. Phase B = the single
   `--raven-grab-mono` declaration, claimed to move zero declared pixels while changing glyph
   metrics on all 28 sites. Attack: is Phase A really pixel-exhaustive? Is there any
   geometry change hiding in Phase B, or any glyph-metric change hiding in Phase A?

4. **The 2px-vs-4px grid measurement.** §2's comment claims: over the 19 distinct spacing
   values `{1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,28,32,36,44}`, a 2px grid moves 5 of 19 (26%)
   and a 4px grid moves 10 of 19 (53%). Recompute both. Also check the stated caveat — that
   the unit is DISTINCT VALUES unweighted by occurrence, and that §3's own four migrations
   total 5px of movement under BOTH grids and therefore cannot separate them.

5. **The eleven re-derived §3 citations.** The citation note (around lines 78–95) claims all
   eleven §3 line references were re-derived by `grep -n` on the selector itself, listing
   `:1074→:1075`, `:1090→:1089`, `:1097→:1095`, `:1101→:1098`, `:1112→:1104`, `:1119→:1110`,
   `:1122→:1112`, `:1125→:1117`, `:1128→:1125`, the §3 range `1073-1130 → 1073-1127`, and the
   §3.5 state range `:1102-1105 → :1099-1103`. Verify EVERY corrected number against the
   source. A citation that is still wrong is a P1, because the spec is an instruction sheet
   someone will edit from.

6. **The `:1095` full-shorthand replacement.** §3.4 claims the source declaration at :1095 is
   `font: 600 calc(8px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui);
   letter-spacing: -.01em;` — four properties plus tracking — and that specifying `font-size`
   alone would silently drop weight / line-height / family. Verify the source line, and check
   whether the proposed replacement preserves every property, including cascade order effects
   (the `font` shorthand resets unspecified sub-properties).

7. **§5's four verification checks are effect-sensitive.** Each carries an explicit
   `*Fails on:*` line. Check 1: `git diff --stat` must list BOTH `browser/` and `web/public/`
   non-empty before `npm test`. Check 2: four `getComputedStyle` reads (`paddingTop ===
   '8px'`, `gap === '4px'`, `paddingLeft === '12px'`, `borderRadius === '6px'`). Check 3: a
   canvas advance-width measurement, `m('ii') === m('MM')` must become false. Check 4:
   bidirectional grep, `grep -c 'calc([0-9]*px \* var(--raven-grab-font-scale))'` = 0 AND
   `grep -c 'var(--raven-grab-text-'` ≥ 6, scoped to `sed -n '1073,1127p'`.
   For each check, name an input where the migration is WRONG and the check still passes.
   Check 3 in particular: does that canvas measurement actually discriminate, given the
   overlay's font stack and fallback behaviour?

8. **§6.2's snap/dock rewrite.** It claims: the mobile sheet ALREADY snaps (nearest of
   collapsed/half/full by absolute difference, plus top/bottom dock by midpoint,
   `endMobileSheetDrag` :2969–2986; supporting symbols `mobileSheetDock` :332,
   `mobileSheetSnap` :354, `setMobileSheetDock` :2681, `setMobileSheetSnap` :2750, `nextDock`
   :2981), while the DESKTOP rail does not (`wirePanelDrag` :2907, `placePanel` :2884 writes
   `left` only, `endPanelDrag` releases and nothing else). Conclusion drawn: the only missing
   behaviour is horizontal edge-snapping on the desktop rail, and the pattern to copy is
   Raven's own `endMobileSheetDrag` rather than anything from DialKit. Verify every line
   number and the behavioural claim on both paths.

9. **`prefers-color-scheme` occurs 0 times** in `browser/raven-grab.js` (§6.1). Verify.

10. **Scope honesty.** The spec splits itself into §1–§5 DERIVED (a Raven-native scale, not
    from DialKit) and §6 TRANSCRIBED (the three facts DialKit actually publishes: `theme:
    light|dark|system`, `layout: popover|inline`, `position:` four corners). Attack whether
    any DERIVED section smuggles in an unsourced DialKit claim, or whether §6 overstates what
    DialKit publishes.

## Also look for, unprompted

- Any remaining internal contradiction between sections (round 1 found §0 contradicting §6.2).
- Any claim stated as measured that carries no measurement.
- Any place the spec would produce a broken stylesheet if followed literally.
- Anything that would make the byte-identical mirror test fail.

## Output format

Rank findings P1 / P2 / P3. For each: the claim, the evidence that refutes it (file:line),
and the concrete correction. End with exactly one verdict line:

`VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`

If you find nothing, say so explicitly rather than inventing a finding.
