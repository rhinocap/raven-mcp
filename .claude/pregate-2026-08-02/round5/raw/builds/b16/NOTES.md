# Approach

I pulled the system through the Raven tools before writing anything: `read_design_md` /
`inventory_design_system` for the `arena` tokens and the `ds-*` component vocabulary,
`get_taste_profile` for the `ledger` rules and the `reconciliation review screen` binding,
`list_taste_decisions` for the five recorded per-project judgement calls, and
`decision_list` for the ten decisions in the project's Decision Graph. Those three layers
answered nearly every question the brief left open, so the build is mostly transcription
rather than invention.

Shape of the screen, top to bottom: title band → `ds-filter-set` → `ds-entry-list`
(sticky column header + scrolling rows) → `ds-pager` → `ds-reconcile-bar` →
`ds-batch-note` → `ds-total-footer` pinned to the viewport bottom. The reconcile bar is
in normal flow after the list in DOM order and beneath it on screen, and it never overlays
anything (dec_msdyq34a_04p3). The footer is `position: fixed` with reserved space, so it
is always on screen without occluding the last row (dec_4).

State lives in four plain objects — `reconciled`, `selected`, `stateFilter`, `sizeFilter`
— plus a page index and the last reconciled batch. Everything rendered is derived from
those on each pass, so filtering, paging, selection, bulk reconcile and undo compose
rather than special-case each other. Selection is patched in place rather than
re-rendered, so nothing about a row moves or re-enters when you tick it.

Every literal value in the file lives in the `:root` block. Nothing below it uses a bare
hex, `rgb()`, or `px` (COLOR-tokens-only, verified by static scan: 0 / 0 / 0). Geometry
the design system does not name is derived with `calc()` over the four-step space scale,
so the 8pt rhythm survives — `--size-row` and `--size-control` are both
`var(--space-wide) * 2` = 48, which is simultaneously the row height and the 44px tap
target floor.

Verification, in a headless Chromium at 1440×900 against the file on disk: a 41-check
harness covering every numbered requirement in the brief and every decision in the graph
(row-height invariance across resting/hover/selected, the 56px amount edge on every row,
mixed-state header control, reconcile → note → undo → restored order, chip multi-select,
filters surviving a page change, the ramp, target sizes, zero console errors, zero network
requests). All 41 pass. Raven's own `audit_tap_targets` reports 22/22 passing and
`audit_contrast` 24/24 passing with a minimum ratio of 6.68:1. Eyes-on at full resolution
on four states (initial, partial selection, filtered-empty, post-reconcile) caught three
things the assertions did not: the `<ul>`'s default 40px padding was throwing the column
header out of line with the rows, the state word was sitting in a far-right column instead
of beside its marker, and a page size of 12 left the last row permanently half-clipped.
All three are fixed.

# Decisions

**Taken from the system, not invented.** Numbered pager, no infinite scroll, no load-more.
Reconcile applies immediately with no confirmation. Multi-select filter chips that survive
a page change. Negative amounts in `--ink-primary` with a leading minus, never a signal
hue, never parenthesised. Constant row height in every state. Mixed state on the header
select control. No tooltip on the match marker. Selection by checkbox or click only — no
shift-range, no drag. A 6px filled dot for the marker with the state word as separate
`--ink-secondary` text. `ds-batch-note` reading "Undo — 7 reconciled", affordance first,
em dash, no trailing period, no second person, never auto-dismissing. Pinned total footer.
Amount column right-aligned with its right edge a fixed 56px from the row edge.

**Judgement calls I had to make on top of those:**

- **Page size 10, three pages.** The graph mandates a pager but not a page size. 12 filled
  the region exactly and left a clipped half-row at the fold on a screen read top to bottom
  hundreds of times; 10 renders a whole page with no clipping and no scroll at 1440×900.
- **"Beside it" is literal.** dec_msdyq34c_64s3 says the marker's meaning is "in the row
  body text beside it". I first built the state word as a right-hand column and it was
  1000px away from the dot it explains. The word now sits immediately after the marker:
  `[select] [dot] [state] [date] [description] [amount]`.
- **Chip logic: union within the state group, AND across groups.** dec_msdyq34b_8daa says
  a second chip narrows rather than replaces, and its rationale names the compound question
  "needs review AND over a threshold". Read strictly as AND everywhere, Match + Review
  would return zero rows, since no entry is two states. So states union and the size chip
  intersects — which is what the rationale actually asks for.
- **The threshold chip is "Over £500", on absolute value.** No amount is recorded anywhere.
  See open questions.
- **Selection persists across pages, and says so.** Filters survive a page change by
  decision; selection following the same rule is consistent. To keep that from becoming a
  silent surprise, the bar reports "7 selected · 3 not on this page".
- **Primary action is inverted ink, not a signal hue.** The palette has no brand accent, and
  the surface binding says signal hues carry state only. So the armed Reconcile button is
  `--ink-primary` on `--surface-base`.
- **Undo restores entries unselected**, in their original order. Re-selecting them would
  re-arm a bulk action nobody asked for a second time.
- **The batch note clears on a filter change, a page change, and its own undo**, and is
  replaced by a new reconcile. It does not clear on selection changes — reading "next
  action" as *an action that changes what the note refers to*.
- **Extension component names.** DESIGN.md has no component for the page frame, the list
  header, the pager, the select control, the action buttons, or the empty state. They are
  named `ds-screen`, `ds-list-head`, `ds-pager`, `ds-select-control`, `ds-action`,
  `ds-empty` — `ds-*` vocabulary, and none of the names the profile forbids.
- **`--type-xs` (12px) is defined but unused.** APP-TYPE-floor puts the floor at 13pt, so
  nothing on the screen renders below `--type-sm`. Not using a step is cheaper than
  arguing about which text is exempt.
- **Motion is close to none.** No entrance animation on rows, no transition on any
  background-color anywhere, so selection and hover are instant. The only transitions are
  `border-color` / `color` on chips and buttons at `--motion-duration-fast`, plus a
  `prefers-reduced-motion` kill switch.
- **The 24 entries and their order are verbatim from the brief**, including the em dashes
  and the `*` in `SUMUP *CAFE`. Opening total: £12,796.99 across 24 entries.

# Open questions

Four, in the order I would want them answered.

1. **APP-COLOR-restraint contradicts the arena palette, and I could not resolve it in the
   build.** Raven's `audit_taste` returns **BLOCK** on this surface: "One primary color plus
   one accent" against evidence "color hue clusters: #4f8f74 at 155deg; #c99a34 at 41deg".
   Those are `--signal-match` and `--signal-review` — tokens `arena`'s own DESIGN.md defines
   and `ds-match-marker` exists to display. The app-level rule and the project-level system
   cannot both be satisfied; I followed the more specific one (the arena binding), and the
   signal hues appear only on 6px state dots, never as decoration or as a background for
   text. This needs either a scope exclusion on APP-COLOR-restraint for `arena` or an
   explicit ruling that three state hues are exempt from the one-accent count.
2. **Same rule asks the surface to respect system light/dark.** The arena token set defines
   exactly one surface ramp, and it is dark. There are no light values to switch to, so the
   screen is dark-only. If light mode is genuinely wanted, the token set needs a second set
   of surface and ink values before any markup changes.
3. **"Over £500" is my number, not the product's.** The compound example in
   dec_msdyq34b_8daa names "over a threshold" without saying what it is, whether it is
   fixed or the person sets it, and whether it should read on the absolute amount or only
   on money leaving the account. I used a fixed £500 on absolute value because it splits
   this data usefully (9 of 24); all three of those choices are guesses.
4. **Whether selection should survive a page change at all.** No decision covers it, and
   the drag-select ban is argued partly from selections "that silently do not survive the
   page boundary" — which reads as a warning about cross-page selection in general. I made
   it persist and made the off-page count visible, but the opposite reading (selection is
   page-scoped and clears on navigation) is defensible and would remove the need for that
   "· 3 not on this page" caveat entirely.

One thing I want to flag as decided rather than open: the three `arena`-scoped rule groups
came back `skipped_out_of_scope` from `audit_taste` because the surface binding has no host
matchers and the target was raw HTML rather than a URL. I verified all eight of those rules
myself instead — tokens-only by static scan, recessed hover / instant selection / no
entrance motion / constant row height by computed style, the fixed ramp by enumerating every
rendered font size, chip labels and the `ds-*` vocabulary by inspection, and target size by
measuring all 22 interactive elements. They pass; they were just not machine-checked by
Raven.
