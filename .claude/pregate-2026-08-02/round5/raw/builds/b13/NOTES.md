# Approach

The screen was built from the project's own record rather than from a generic pattern. Four
sources were pulled through the Raven tools before any markup was written:

- `read_design_md` / `inventory_design_system` — the `arena` DESIGN.md: 9 colour tokens, a
  five-step type ramp, a four-step space scale, three motion tokens, and the seven `ds-*`
  components with their expected states.
- `get_taste_profile` (`ledger`) — 14 rules, 8 of them scoped to `arena`, plus the surface
  binding for `reconciliation review screen` (voice: plain, second-person-free, no
  exclamation; density: a working list read top to bottom hundreds of times; restraint:
  signal hues carry state only).
- `list_taste_decisions` — 5 recorded judgement calls (marker form, batch-note copy,
  batch-note persistence, footer position, amount-column geometry).
- `decision_list` — 10 active Decision Graph nodes (bar placement, no confirmation dialog,
  numbered pagination, multi-select chips, filters surviving a page change, negative-amount
  treatment, fixed row height, mixed-state header control, no marker tooltip, no range
  selection).

Every one of those 15 recorded calls is implemented literally; none was overridden. The type
ramp is declared unitless as the system declares it and converted with a `--type-unit`
multiplier, so the five steps scale with the browser's font-size setting instead of being
frozen in px.

Verification was done against the rendered page at 1440x900 in headless Chromium, driving the
real controls rather than reading the source:

- Opening total **£12,796.99** across 24 entries, matching a hand sum of the seed data.
- The amount cell's right edge measured at exactly **56px** from the row edge on all ten rows
  of a page (dec_5).
- Row height measured at **44px** resting, hovered and selected — identical in all three.
- Header control reports `indeterminate` at a partial page selection and `checked` at a full
  one.
- Select all 10 on page 1 → Reconcile → 14 entries / £8,856.42 remain and the batch note
  reads "Undo — 10 reconciled"; Undo → back to 24 entries / £12,796.99.
- Compound filter (Needs review AND Over £1,000) narrows to zero and shows the empty line.
- `audit_tap_targets`: 23/23 passing at the 44px grade.
- `audit_contrast`: 71 text elements, 0 non-passing.
- `audit_page`: score 100, grade A, 14/15 checks, no errors.
- No console errors or page errors in any interaction path.

# Decisions

**Ten per page, numbered pager.** The Decision Graph mandates a numbered pager with no
infinite scroll and no load-more. Ten rows is the largest page that lets the list, the pager,
`ds-reconcile-bar` and the pinned `ds-total-footer` all sit on a 1440x900 screen at once
without the bar being pushed under the footer — which the graph's "bar below the list, never
floating" call requires.

**Selection is page-scoped.** The header control acts on the page and reports a mixed state
for a partial page, so selection is scoped the same way: changing page or changing a filter
clears it. This keeps the bar's count honest — it can only ever count rows that are on
screen, so "Reconcile 7" never silently includes entries the filter has hidden.

**Filters: two groups, OR within, AND across.** State (Matched / Needs review / Break) and
Amount (Money in / Money out / Over £1,000). The graph requires that a second chip narrows
rather than replaces, and cites the compound question "needs review AND over a threshold" —
which a single state group cannot express, since two state chips can only ever widen. A
second axis makes the narrowing real. Every chip carries a visible text label and a live
count of the unreconciled entries matching it on its own.

**The batch note survives a filter change but not a page change.** The recorded decision is
that the note persists "until the next action or a navigation", never auto-dismisses and
never counts down. A filter is treated as not-navigation, on the graph's own reasoning that
"the filter is the question being asked"; the pager is treated as navigation. The practical
effect is that narrowing the list to check something does not destroy the undo.

**Reconcile applies immediately.** No dialog, no arm-then-apply, no type-to-confirm. Rows
leave the list on click, the total and the chip counts update, and the note reports what
happened with the reversal first: "Undo — 7 reconciled".

**Surface levels.** Page is `--surface-base`. A row hover pushes back to
`--surface-recessed`; a selected row lifts to `--surface-raised`. Neither transitions —
selection feedback is immediate, and rows do not animate in.

**Amounts are never a signal hue.** Negatives render in `--ink-primary` with a leading minus
and no parentheses. The three signal hues appear only as the 6px `ds-match-marker` dot, with
the state word beside it in `--ink-secondary` and no tooltip anywhere.

**The footer total ignores the filter; a second line does not.** The large figure is always
the whole unreconciled position — the number the task drives to zero. When a filter is on, a
secondary line adds the filtered count and subtotal, so the filter is usable alongside the
total rather than corrupting it.

**Checkbox geometry.** The checkbox input itself is the 44x44 target with a 16px box painted
on it, rather than a 16px input inside a 44px label. Both give the same hit area, but only
the first passes `audit_tap_targets`, which measures the control and not its wrapper — and
the rule that matters should be enforced by the thing that checks it.

**Local geometry tokens.** DESIGN.md carries colour, type, space and motion, but no radius,
border-width, control-size or column-width values, and `COLOR-tokens-only` forbids bare px.
Rather than write literals, a small block of local tokens is declared in `:root` under an
explicit comment (`--size-hairline`, `--size-marker`, `--size-target`, `--size-check`,
`--size-tick-*`, `--size-dash`, `--radius-sm`, `--radius-round`, the three column widths,
`--size-page-max`, `--size-footer`, `--size-ring`, `--type-unit`, `--font-ui`). See the first
open question.

**Vocabulary extensions.** `ds-page-header`, `ds-filter-bar`, `ds-entry-list` and `ds-pager`
were added in the system's `ds-*` idiom for surfaces DESIGN.md does not name. Nothing was
called a Table, Grid, Chip, Toast, Modal or Snackbar.

# Open questions

1. **Three signal hues fail the profile's own colour rule.** `audit_taste` returns
   **BLOCK** on `APP-COLOR-restraint` ("one primary colour plus one accent") citing
   `#4f8f74` and `#c99a34` — both of which are DESIGN.md tokens, and one of which dec_1
   requires the match marker to carry. The project's tokens were treated as authoritative
   and the global rule as mis-scoped for this surface. That needs a ruling: either
   `APP-COLOR-restraint` gets an `arena` override that exempts the signal hues as state
   rather than accent, or the marker loses its hue.

2. **There is no light palette.** The same rule also asks for system light/dark support, but
   the token set defines one dark palette and no light values exist to map to. The screen is
   dark-only. If light mode is real, DESIGN.md needs a second set of surface and ink values
   before it can be built.

3. **Should geometry become system tokens?** The local `--size-*` and `--radius-*` block
   above is a stopgap that keeps the build free of bare literals. Those values are design
   decisions (control size, corner radius, hairline weight, column widths) and probably
   belong in DESIGN.md rather than in one page's stylesheet.

4. **Should a batch ever span pages?** Selection is cleared on a page change here. Nothing in
   the record states it, but the header control is page-scoped and the graph's ban on drag
   selection is argued from selections that "silently do not survive the page boundary". If
   a bookkeeper genuinely wants to assemble a batch across three pages, that needs an
   explicit decision and a visible "N selected, M on other pages" treatment.

5. **Is the pager a navigation for the purposes of the undo?** Reading it as one means paging
   away and back burns an undo that dec_3 deliberately refuses to expire on a timer. The
   alternative — the note surviving until the next reconcile only — is arguably closer to the
   rationale but further from the wording.

6. **The "Over £1,000" threshold is invented.** The Decision Graph names "over a threshold"
   as the motivating compound question but never gives the number, and never says whether it
   compares absolute value or signed amount. £1,000 on absolute value was chosen because it
   splits this seed data usefully; the real figure should come from the product owner, and it
   may want to be editable rather than fixed.

7. **Can a `break` be reconciled at all?** This screen lets any selected entry be reconciled
   regardless of match state, including the four breaks. In a real ledger a break usually
   needs a posting decision first, which would mean either excluding breaks from the bulk
   action or routing them somewhere else. Nothing in the record covers it.

8. **The typography audit disagrees with the fixed ramp.** `audit_typography` warns that 19px
   and 26px are off a detected 1.067 modular scale. `TYPE-fixed-ramp` says the five steps do
   not grow or change, so the warning was not acted on. Worth confirming the ramp is
   deliberate rather than inherited.
