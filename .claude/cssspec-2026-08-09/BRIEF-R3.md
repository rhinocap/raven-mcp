# Falsification pass — round 3 — Grab panel CSS spec

REPORT ONLY. Do not edit any file. Do not run `npm test`. Do not modify
`browser/raven-grab.js` or `web/public/raven-grab.js`. Your output is a written report;
nothing you say will be applied automatically.

## What this is

`docs/grab-panel-css-spec.md` (742 lines) is a SPEC. **No code has been changed.** It
proposes a design-token migration for the Raven Grab overlay's CSS, which lives entirely
inside one template literal in `browser/raven-grab.js` (`:host {` opens at line 774, the
literal closes at 1564).

Round 1 returned DOES NOT SURVIVE (6 findings). Round 2 returned DOES NOT SURVIVE
(5 × P1, 4 × P2, 2 × P3). All seventeen were dispositioned and the spec grew 399 → 511 →
742 lines. **The claims under audit below are largely round 2's own fixes**, so do not
assume an earlier round's finding is still open — several were fixed by rewriting the
section that contained them.

Raw logs, if useful (do not treat their findings as current):
`.claude/cssspec-2026-08-09/agent-output/sol-round1.log`,
`.claude/cssspec-2026-08-09/agent-output/sol-round2.log`.

**One known error in the round-2 brief, stated here so you do not inherit it:** it claimed
§5 check 3's `m('ii') === m('MM')` "must become false". That was wrong. Equal advance
widths mean a monospace face resolved, so the spec's "must be **true**" is correct.

## Files

- Spec under audit: `docs/grab-panel-css-spec.md`
- Ground truth: `browser/raven-grab.js` (read-only; 14,377 lines)
- Mirror that must stay byte-identical: `web/public/raven-grab.js`

## Claims under audit

Try to REFUTE each against the actual source. Default to "refuted" when you cannot verify.

1. **§5's checks are now EXECUTABLE.** The spec claims the overlay attaches an **open**
   shadow root to a host carrying `data-raven-grab-overlay` (`:393-400`), so every check-2
   and check-3 selector must be queried through `document.querySelector('[data-raven-grab-overlay]').shadowRoot`.
   Verify the host attribute, the `mode: "open"`, and that each of the five selectors used
   (`.raven-grab-styles li:not(.raven-grab-style-category)`, `.raven-grab-style-label-wrap`,
   `.raven-grab-style-input`, `.raven-grab-token-unlink`, `.raven-grab-styles code`) is a
   class that the overlay actually emits. **Name any selector that still cannot resolve, or
   any precondition the spec fails to state.** The spec claims exactly two of them are
   conditional (edit mode; a token-linked row) — is that the full list?

2. **The `:not(.raven-grab-style-category)` correction.** §5 check 2 claims the FIRST
   `.raven-grab-styles li` is always a category heading row, because `renderPanel` pushes
   the heading `<li>` before the rows it heads (`:11648`), and that as `:first-child` it
   resolves to `padding-top: 2px` from the rule at `:1080` — so the earlier draft's
   `paddingTop === '8px'` assertion failed on correct code. Verify BOTH halves: the push
   order, and the `:first-child` padding. **Is a category row always present?** If a panel
   can render style rows with no category heading, the exclusion selector is still right
   but the stated reason is wrong.

3. **The `font` shorthand claim.** §5 check 3 claims that because §3.3 adds
   `font-variant-numeric: tabular-nums` to `.raven-grab-styles code`,
   `getComputedStyle(...).font` serialises to the empty string, so the canvas font MUST be
   built from `fontStyle`/`fontWeight`/`fontSize`/`fontFamily` longhands. Attack the
   reasoning (CSSOM shorthand serialisation rules) and the replacement: does the longhand
   string actually discriminate a monospace face from Geist / `-apple-system`, and is there
   an input where the migration is WRONG and this check still passes?

4. **The Phase A / Phase B boundary.** Phase A = geometry tokens, claimed to move exactly
   four named pixel values and be diffable by capture. Phase B = the single
   `--raven-grab-mono` declaration PLUS `font-variant-numeric`, claimed to move zero
   declared pixels while changing glyph metrics. §3.4 states its exhaustive-pixel claim is
   TRUE ONLY BECAUSE `font-variant-numeric` is deferred. **Is any other Phase A change
   capable of moving a rendered pixel?** Walk every substitution in §3 and check.

5. **The "substitution list, not a complete rule" notes.** §3's header and the inline notes
   on §3.2, §3.3 and §3.4 enumerate the declarations each before/after block omits (e.g.
   §3.2's source rule at `:1078` also carrying `display: block`, `grid-template-columns`,
   `min-height`, `background`, `pointer-events`; §3.3's `:1098` also carrying `color`,
   `background`, `padding`, `overflow-wrap`, `letter-spacing`). **Verify every omission list
   against the source. A missing entry is a P1**, because someone editing from this document
   would delete a live declaration.

6. **§6.2's inertness claim — the most consequential single claim in the document.** It
   asserts that `endMobileSheetDrag`'s three-detent nearest-target loop cannot respond to
   the gesture at all, because `pointermove` (`:2960-2968`) writes only `top` and
   `bottom: auto` and never touches height; height is written solely by
   `setMobileSheetSnap` (`:2757`) into `--raven-grab-sheet-height` (`:853`); and
   `box-sizing: border-box` is global (`:790`) — so the measured
   `getBoundingClientRect().height` at release is always exactly
   `mobileSheetHeight(currentSnap)`, distance 0, and the loop re-selects the detent it
   already had. **Find a reachable input where it does NOT.** The spec itself concedes two
   narrow cases (release inside the 200ms `transition: height` at `:854`; a viewport resize
   between the snap and the drag) — are there more? Does any CSS constraint (`max-height`,
   `min-height`, a flex/grid parent, safe-area insets, the `:854` transform transition,
   the `collapsed` state) make the rendered height differ from the written custom property?
   If the loop is NOT inert, the recommendation in §6.2 and §7 item 3 is wrong.

7. **§6.3's geometry argument.** It claims the desktop panel pins `top`, `right` AND
   `bottom` simultaneously (`:821`, re-pinned at `:838` and `:842`), has no height of its
   own, and that `placePanel` (`:2884`) writes `right: auto` + `left` while storing a `top`
   in `el.__ravenPosition` that is never applied — therefore Raven has TWO positions, not
   four, and four-corner placement is a panel-geometry redesign that is INDEPENDENT of
   edge-snapping rather than downstream of it. Verify every line and the "never applied"
   claim in particular (search all readers of `__ravenPosition`).

8. **The re-measured spacing inventory.** §2 claims a panel-wide inventory of **23 positive
   spacing values / 16 radii / 30 sizes**, with a 2px grid moving 6 of 23 (26%) and a 4px
   grid moving 13 of 23 (57%), unit = DISTINCT VALUES unweighted by occurrence. Recompute
   from the source. State your extraction method; if it differs from what the spec implies,
   say so.

9. **The mono call-site enumeration.** §1 Gap 2 / §3 Phase B claim
   `grep -c 'var(--raven-grab-mono)' browser/raven-grab.js` = **28 usages** plus 1
   definition at `:789`, reconciling as 4 inside the §3 range + 24 outside, and that
   `--raven-grab-ui` and `--raven-grab-mono` are byte-identical at `:788-789` with the
   `@import` at `:773` requesting no monospace family. Verify the count, the split, the
   byte-identity and the import.

10. **The WCAG citation.** §2 and §4 item 4 claim 44px is **SC 2.5.5 Target Size
    (Enhanced, AAA)**, that SC 2.5.8 is the AA criterion at 24×24 CSS px, and that the
    overlay meets 2.5.8 separately via the hit-slop at `:1102`. Verify the criterion
    numbers, sizes and levels, and verify the `:1102` claim against the source.

11. **§5 check 4's three greps.** Scoped to `sed -n '1073,1127p' browser/raven-grab.js`
    and PIPED: `grep -c 'calc([0-9]*px \* var(--raven-grab-font-scale))'` = 0,
    `grep -c 'var(--raven-grab-text-'` ≥ 6, `grep -c 'var(--raven-grab-mono)'` = exactly 4.
    Verify the line range still bounds §3's rules, verify the pre-migration counts make the
    post-migration expectations correct, and **name an input where the migration is wrong
    and all three still pass.**

## Also look for, unprompted

- Any remaining internal contradiction between sections (round 1 found §0 contradicting
  §6.2; round 2 found §7's ordering contradicting the Phase A/B split).
- Any claim stated as measured that carries no measurement.
- Any place the spec would produce a broken stylesheet if followed literally.
- Any surviving stale claim from an earlier draft that is NOT labelled as a correction.
- Anything that would make the byte-identical mirror test fail.

## Output format

Rank findings P1 / P2 / P3. For each: the claim, the evidence that refutes it (file:line),
and the concrete correction. End with exactly one verdict line:

`VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`

If you find nothing, say so explicitly rather than inventing a finding.
