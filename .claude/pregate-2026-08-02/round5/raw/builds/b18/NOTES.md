# Approach

I pulled the whole configuration through the Raven tools before writing anything:
`read_design_md` / `inventory_design_system` for the arena token set and the `ds-*`
component vocabulary, `get_taste_profile` for the `ledger` profile (14 rules, 6 of them
`block`) and its binding to `arena / reconciliation review screen`,
`list_taste_decisions` for the five recorded judgement calls, and `decision_list` for the
ten active Decision Graph nodes. Everything below is downstream of those, not of taste.

The screen is a fixed-height working surface, not a scrolling document. Top to bottom:
title and account line, one filter band, the entry list (the only thing that scrolls, with
a sticky column header), the numbered pager, the reconcile bar, and the pinned total
footer. That order is not arbitrary — the Decision Graph puts `ds-reconcile-bar` *after*
the list in document order and beneath it on screen, and the taste record pins
`ds-total-footer` to the bottom of the viewport. Those two together fix the vertical
stack, so I built the shell as a flex column at `100vh` with the list as the single
`flex:1; min-height:0` scroller.

Every visual value is `var(--token)`. Literals appear only inside the `:root` token block,
which is split into the DESIGN.md tokens copied verbatim and a short derived set (font
stack, weights, leading, radius, hairline width, focus width, `--marker-size: 6px` from
taste `dec_1`, `--target-min: 44px` from `A11Y-target-size`, and the column widths, which
are `calc()` of `--space-column`). The type ramp did not grow: the page uses `xs`, `sm`,
`md` and `xl` from the five steps and adds nothing.

Verification, all against the real render at 1440×900 in headless Chromium:

- **Seed data** — parsed the shipped `SEED` array back out of the file and diffed all 24
  rows field by field against the brief's table. Verbatim, in order.
- **Token discipline** (`COLOR-tokens-only`, block) — 0 bare hex, 0 bare `rgb()`, 0 bare
  `px` anywhere in the stylesheet outside the `:root` definitions.
- **Tap targets** (`A11Y-target-size` / `APP-TAP-targets`, block) — measured every
  rendered `button` and `input` with `getBoundingClientRect`, fed the geometry to
  `audit_tap_targets`: **20/20 pass, 0 failing**. This caught a real defect: the
  checkboxes were 16×16 boxes sitting inside 44px cells. Row checkboxes were saved by the
  clickable row, but the header select-all had no such fallback and was a genuine 16×16
  target. The input is now the full 44×44 square with the visible box drawn in `::before`.
- **Contrast** — sampled computed foreground/background/size for every distinct text
  treatment and ran `audit_contrast`: **9/9 pass AA**, lowest ratio 6.68.
- **`audit_page`** — 100 / grade A, 13/14 checks, 0 errors.
- **`audit_taste`** — one finding, dispositioned below.
- **Behaviour** — drove and screenshotted six states: default, armed, mixed selection
  across a page boundary, post-reconcile, post-undo, compound filter, and empty filter.
  Reconcile removes exactly the selection (24 → 14 entries, £12,796.99 → £8,856.42) and
  undo restores the count, the total, the pager and the selection exactly.

The second bug this caught: `preventDefault()` on a checkbox click makes the browser
revert the checked state *after* dispatch, so the header control never rendered as
checked. Selection now runs off `change`, not `click`.

# Decisions

**Taken from the configuration, not invented.**

- `ds-match-marker` is a 6px filled dot in the signal hue with no text and no tooltip; the
  state word sits beside it in `--ink-secondary` (taste `dec_1`, graph
  `dec_msdyq34c_64s3`). The dot is `aria-hidden`; the word carries the meaning.
- Negative amounts are `--ink-primary` with a leading minus, never parenthesised, never a
  signal hue (`dec_msdyq34c_we0s`).
- The amount column's right edge is a fixed `--space-column` (56px) from the row edge on
  every row, measured at x=1200 against a row edge of 1256 (taste `dec_5`).
- Rows are a fixed `--target-min` tall resting, hovered and selected; nothing expands
  (`dec_msdyq34c_bmr7`). Hover is `--surface-recessed`, selected is `--surface-raised`
  (`COLOR-recessed-hover` — hover pushes back, so selection is the only thing that lifts).
- No transition touches a row. Selection is instant, and rows are written straight in with
  no entrance animation (`MOTION-selection-instant`, `MOTION-no-list-entrance`).
- Reconcile applies immediately with no confirmation dialog and the surface reports
  afterwards (`dec_msdyq34a_tfum`).
- `ds-batch-note` reads `Undo — 10 reconciled`: affordance first, em dash, no period, no
  second person (taste `dec_2`). It never auto-dismisses and shows no countdown
  (taste `dec_3`).
- Numbered pager, no infinite scroll, no load-more (`dec_msdyq34b_d90i`). Page size is 10,
  giving 3 pages, chosen so a full page never has to scroll at 900px tall.
- Filter chips are multi-select and survive a page change (`dec_msdyq34b_8daa`,
  `dec_msdyq34b_zxp6`). Every chip carries a visible text label
  (`CONTENT-chips-labelled`).
- Selection is by checkbox or row click only; no shift-click, no drag range
  (`dec_msdyq34d_jfkp`).
- The header control is genuinely tri-state and reports mixed when part of the page is
  selected (`dec_msdyq34c_0pco`).

**Judgement calls the configuration did not settle.**

- *Chip logic.* Within a group the chips are an OR; across groups they are an AND. The
  graph's rationale for multi-select is the compound question "needs review **AND** over a
  threshold", so I added an Amount group (`Over £500`, `Under £100`) alongside the three
  state chips — without a second dimension the "narrows further" rule has nothing to
  narrow against. `Review` + `Under £100` returns 6 of 24.
- *Selection survives page and filter changes.* `dec_msdyq34d_jfkp` rejects drag-select
  because it "produces selections that silently do not survive the page boundary", which
  only reads as a defect if selections are meant to survive. So they do — and because
  reconciling something you cannot see is a real risk, the bar says
  `5 selected — 3 not on this page` whenever part of the selection is off-screen.
- *The footer total ignores the filter.* It is the number the whole task drives to zero
  (taste `dec_4`), so it counts every unreconciled entry. The filter band carries the
  filtered count separately (`Showing 6 of 24`).
- *No currency symbol on rows.* A column of figures scans on its digits; the symbol is
  stated once in the `Amount (GBP)` column header and once on the footer total.
- *The batch note clears on another reconcile, an undo, a page change or a filter change —
  but not on mere selection.* Taste `dec_3` says "until the next action or a navigation";
  retiring an undo because someone ticked a box would be the expiring-undo failure that
  decision exists to prevent.
- *Names beyond the seven `ds-*` components.* DESIGN.md names no shell, list, pager or
  filter container. Rather than reach for `Table` / `Grid` / `Chip` (explicitly banned by
  `NAME-system-vocabulary`), I extended the same vocabulary: `ds-screen`,
  `ds-screen-header`, `ds-entry-list`, `ds-entry-pager`, `ds-filter-set`. The list header
  is not a new component — it is `ds-entry-row--header`, which is also where the graph
  puts the mixed-state control.

**Findings dispositioned rather than fixed.**

- `audit_taste` returns one block: `APP-COLOR-restraint` ("one primary color plus one
  accent"), evidenced as `#4f8f74 at 155deg; #c99a34 at 41deg`. Those are
  `--signal-match` and `--signal-review` — two of the three signal hues DESIGN.md defines
  and `dec_1` requires the marker to use. The surface binding's own design note says
  "signal hues carry state only, never decoration", which is the narrower and more
  specific instruction for this surface, and the build honours it: the hues appear only on
  the match markers and their filter chips, never as a background, a border, a negative
  amount, or a decorative accent. Overridden deliberately; flagged below.
- `audit_page`'s single warning is "no `clamp()` for fluid sizing". Rejected: `clamp()`
  arguments are bare pixel literals, which `COLOR-tokens-only` blocks, and this is a fixed
  1440×900 working screen, not a fluid marketing page.
- `audit_taste` reported the eight `arena`-scoped rules as `skipped_out_of_scope` — the
  surface binding has an empty `hosts` list, so a `file://` page cannot match it. I
  verified all eight by direct measurement instead; the evidence is in **Approach**.

# Open questions

1. **`APP-COLOR-restraint` versus the arena signal palette.** The profile rule is
   `block` severity and demands one primary plus one accent; the arena design system
   ships three signal hues and the taste record requires the marker to carry them. I
   resolved it in favour of the surface-specific configuration, but that is a rule
   collision someone owns. Either the profile rule needs an `arena` override recorded via
   `record_taste_decision`, or the signal hues need to be formally exempted from the
   accent count. Right now the screen ships with a standing `BLOCK` verdict against it.
2. **Light mode.** The same rule also requires respecting system light/dark. DESIGN.md
   defines exactly one palette and it is dark; `COLOR-tokens-only` and `TYPE-fixed-ramp`
   forbid inventing the light values myself. The page is dark-only. A light token set has
   to come from the design system before this can be honoured.
3. **Should a `break` be reconcilable at all?** In a real ledger a reconciliation break is
   an unresolved discrepancy, and letting a bulk action sweep one away is how differences
   get buried. The brief says the bulk action applies to whatever is selected, so it does
   — including breaks. If the product intends otherwise, the options are to exclude
   `break` from the header select-all, or to have the bar name what it is about to include
   (`7 selected — 2 breaks`). This is the question I would put first.
4. **Is cross-page selection right?** I inferred it from the drag-select rationale rather
   than from an explicit decision. The alternative — clearing the selection at the page
   boundary — is safer and would make the "not on this page" line unnecessary. Worth an
   explicit decision either way.
5. **Undo depth.** One level, restoring the last batch exactly (entries and their
   selection). Nothing in the configuration says whether a bookkeeper needs to walk back
   further, or whether a reconciled batch should stay reachable somewhere on the screen
   after the note is retired.
6. **Empty-state copy.** `No entries match the filter` and `Nothing left to reconcile` are
   mine. The Decision Graph has no empty-state decision — `gap_scan` lists exactly this as
   an open coverage gap — and empty-state wording is normally worth a product owner's eye.
7. **Page size.** 10 fits 900px with room to spare. It is a layout guess, not a decision:
   on a shorter viewport, or with an entry list far longer than 24, the right number may
   be different or may need to follow the viewport.
