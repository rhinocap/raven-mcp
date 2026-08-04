# Approach

The screen was built from what the Raven tools hold, in this order:

1. `list_taste_profiles` → `get_taste_profile('ledger')` — 14 rules, and the surface binding for
   `arena / reconciliation review screen` (voice: plain, second-person-free, no exclamation;
   density: a working list read top to bottom hundreds of times; restraint: signal hues carry
   state only, never decoration).
2. `read_design_md` / `inventory_design_system` — the arena token set (9 colours, a five-step
   type ramp, a four-step space scale, two durations and one easing) and the seven `ds-*`
   components with their expected states.
3. `list_taste_decisions('ledger')` — 5 recorded judgement calls (marker, batch-note copy,
   batch-note persistence, footer pinning, amount-column geometry).
4. `decision_list` — 10 active Decision Graph nodes (bar placement, no confirmation dialog,
   numbered pagination, multi-select chips, filters survive page change, negative-amount
   treatment, fixed row height, mixed-state header control, no marker tooltip, no range select).

Those four sources are treated as binding; everything below in **Decisions** is either how a
recorded decision was implemented or a call made where the record was silent.

The build is one file, vanilla, no network. Every visual value in the stylesheet is
`var(--token)`; the only literals in the file are the token definitions themselves, in the
`:root` block, so the design system is the single place a value changes.

Verified in headless Chromium at 1440×900 opened over `file://`:

- document height exactly 900px — nothing scrolls, no horizontal overflow; zero non-`file://`
  requests; zero console errors.
- amount right edge is 56px from the row edge on every row, identical across all rows, and the
  footer total shares that edge.
- select-all → reconcile → note → undo round-trips: 24 → 14 entries, £12,796.99 → £8,856.42 →
  £12,796.99.
- partial selection puts the header control in mixed state; filtering, paging, the bulk action
  and the totals were exercised together.
- `audit_page` 100 / A. `audit_contrast` 17 text elements, 0 AA failures, lowest ratio 6.68.
  `audit_tap_targets` 8/8 pass at the 44px minimum (the checkbox input itself carries the
  44×44 target; a pseudo-element draws the 20px box).

# Decisions

**Following the record.**

- Pagination, numbered, 10 per page (`dec_msdyq34b_d90i`). 10 was chosen so a whole page, the
  pager, the bulk bar and the batch note all fit at 1440×900 without scrolling — the bar is in
  document flow below the list, so anything that pushes it below the fold costs a scroll before
  every bulk action.
- `ds-reconcile-bar` sits after the list in document order and below it on screen, never
  floating (`dec_msdyq34a_04p3`). Idle shows "Nothing selected" with the action disabled; armed
  shows the count and the net value of the selection and fills the action.
- Reconciling applies immediately, no dialog (`dec_msdyq34a_tfum`); the surface reports
  afterwards in `ds-batch-note`.
- `ds-batch-note` reads "Undo — 7 reconciled" — affordance first, em dash, no period, no second
  person (`dec_2`). It never auto-dismisses and carries no countdown (`dec_3`).
- `ds-total-footer` is fixed to the bottom of the viewport; the page scrolls behind it
  (`dec_4`). At 1440×900 nothing scrolls, so the total is always in view.
- The amount column is right-aligned with its right edge a fixed `--space-column` from the row
  edge (`dec_5`), and the list header and footer total share that edge.
- `ds-match-marker` is a filled 6px dot in the signal hue with no text and no tooltip
  (`dec_1`, `dec_msdyq34c_64s3`); the state word sits beside it in `--ink-secondary`.
- Negative amounts are `--ink-primary` with a leading minus, never a signal hue, never
  parenthesised (`dec_msdyq34c_we0s`).
- Row height is identical resting, hovered, selected and focused (`dec_msdyq34c_bmr7`).
  Hover pushes the row back to `--surface-recessed`; selection lifts it to `--surface-raised`
  with an `--ink-primary` edge, and carries no transition, so it lands on the frame of the click.
- Rows are selected by checkbox or by row click only — no shift-click, no drag range
  (`dec_msdyq34d_jfkp`).
- The header control is a real tri-state checkbox and reports mixed for a partial page
  selection (`dec_msdyq34c_0pco`).
- Chips are multi-select and filters survive a page change (`dec_msdyq34b_8daa`,
  `dec_msdyq34b_zxp6`). Every chip carries a visible text label.

**Calls made where the record was silent.**

- *Chip semantics.* Chips within one dimension are OR (Matched + Review shows both); chips
  across dimensions are AND. The rationale on `dec_msdyq34b_8daa` names a compound question —
  "needs review AND over a threshold" — which needs a second dimension to be askable at all, so
  an **Amount** group was added alongside **State**, with one chip, *Over £1,000*. The £1,000
  figure is taken from that rationale; it is not recorded anywhere as a system value.
- *Selection is page-scoped.* Changing page or changing a filter clears the selection. The
  rejection of drag-select treats a selection that silently crosses a page boundary as the
  hazard, and the bulk action here is deliberately unconfirmed, so nothing invisible is ever in
  the set the button acts on. Filters themselves persist, as recorded.
- *When the batch note clears.* On the next reconcile, on a page change, on a filter change, or
  on undo. Selecting rows does **not** clear it — an undo that disappears the moment a checkbox
  is ticked would fail the same way an expiring one does.
- *Undo depth is one batch.* The most recent bulk action only; a second reconcile replaces the
  note and the earlier batch stops being reversible. Undo returns the entries unselected and
  clears the note.
- *The footer total is the whole unreconciled book, not the filtered view.* It is the number the
  task drives to zero, so a filter must not move it. When a filter is active the filtered
  subtotal is appended in `--ink-secondary` beside the entry count.
- *Type usage.* `--type-xs` (12px) is used only for uppercase column and section labels;
  everything read as body text is `--type-sm` (13px) or larger, so the 13px floor holds for
  body copy. The largest type on the screen is the unreconciled total, not the page title.
- *One primary action.* The palette has no brand accent, and the signal hues are reserved for
  state, so the single filled control (Reconcile) is drawn by inverting `--ink-primary` against
  `--surface-base`. Undo and the pager are outlined or plain.
- *Naming.* Six ds-* names the system does not define were needed: `ds-page`, `ds-filters`,
  `ds-entry-head`, `ds-entry-list`, `ds-pager`, `ds-select-control`. All are namespaced and none
  uses the generic vocabulary the naming rule rejects. `ds-pager` and `ds-select-control` are the
  Decision Graph's own words ("a numbered pager", "the header select control").
- *Derived tokens.* Values the system needs but does not name — hairline width, the 6px marker,
  the 44px interactive minimum, control radii, column widths — are declared once in `:root` and
  composed from the four-step space scale (for example `--col-date: calc(--space-column +
  --space-wide + --space-base)`). The scale itself is not extended.
- *Motion.* Rows do not animate in or out, and reconciled rows are removed instantly. The only
  transitions are the fast background changes on chips and on the bar arming.
- *Empty states.* "No entries match the filter" when a filter excludes everything;
  "Nothing left to reconcile" when the book is clear.

**Audit findings dispositioned rather than fixed.**

- `audit_page` warns that there is no `flex-wrap` and no `clamp()`. Both are marketing-layout
  heuristics that would break this screen: wrapping a row destroys the fixed column geometry
  `dec_5` requires, and fluid type would grow the ramp that `TYPE-fixed-ramp` freezes.
- `audit_typography` warns that 19px and 26px are off a single modular ratio, and that the row
  description sits at 1.45 leading against a dominant 1.2. The ramp is the system's own five
  steps and cannot be re-derived; 1.45 is body leading inside a fixed-height row and changes no
  geometry.

# Open questions

1. **`APP-COLOR-restraint` cannot pass on this palette, and it is a `block`.** `audit_taste`
   returns BLOCK on "one primary color plus one accent", citing `--signal-match` and
   `--signal-review` as a second accent hue. The arena system ships three signal hues and the
   surface binding says they carry state; rendering match confidence without them is not
   possible. Either the rule needs a scoped override for this surface or the detector needs to
   exempt tokens declared as signal. Not resolvable from the build side.
2. **There is no light palette.** The same rule asks for system light/dark support, but
   `DESIGN.md` defines a single dark surface ramp, and inventing light values would break
   `COLOR-tokens-only` (also `block`). The page declares `color-scheme: dark` and stays dark.
   If light mode is wanted, the token set has to grow first.
3. **Where do reconciled entries go?** The brief and the record cover removal and undo but not
   the destination. There is no reconciled view, no count of what has been cleared this session,
   and no route back to a batch once the note has been replaced. A "reconciled today" view would
   change how much weight the single-level undo has to carry.
4. **Is a one-batch undo enough?** A bookkeeper reconciling ten pages does ten bulk actions; only
   the last is reversible. A short stack, or an audit trail, is a product call.
5. **Should the selection really clear on a page change?** It is the safe reading of the
   record, but someone who selects four rows, steps to page 2 to check a figure and comes back
   loses the four. The alternative — keeping the selection but acting only on the visible part
   of it — was rejected as more confusing, not as wrong.
6. **The £1,000 threshold is inferred**, from the rationale on the multi-select chip decision.
   The real value, and whether the threshold should be a chip at all rather than a numeric
   input, is a designer's call.
7. **Is the running total net?** It is currently the net of everything unreconciled
   (£12,796.99 for the 24 seed entries). Money in and money out are not shown separately, and a
   bookkeeper may want both halves rather than one signed figure.
8. **State wording.** The row and chip words are "Matched", "Review", "Break". "Review" reads as
   an instruction as much as a state; "Needs review" is clearer but breaks the single-word
   column rhythm the marker decision implies.
