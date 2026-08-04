# Approach

The system came from the Raven tools, not from guesswork. `read_design_md` supplied the
`arena` tokens (9 colours, a five-step type ramp, a four-step space scale, two motion
durations) and the `ds-*` component vocabulary. `get_taste_profile` supplied 14 rules on
the `ledger` profile, six of them scoped to `arena` and bound to the
`reconciliation review screen` surface (`density: a working list, read top to bottom
hundreds of times`; `restraint: signal hues carry state only`; voice: plain,
second-person-free, no exclamation). `list_taste_decisions` supplied 5 recorded judgement
calls and `decision_list` supplied 10 active Decision Graph nodes. Every one of those 15
records is load-bearing in the build; none of them was overridden.

The screen is one HTML file: a token block, a stylesheet that references only tokens, and
a small state machine. State is four values — `reconciled`, `selected`, the filter facets,
and the current page — and one `render()` that redraws from them. There is no framework,
no build step, and no network request of any kind.

Structure, top to bottom: page header, `ds-filter-chip` row, the entry list (a real
`<table>` for row/column semantics), a numbered pager, `ds-reconcile-bar`, `ds-batch-note`,
and a `ds-total-footer` pinned to the viewport. That order is the Decision Graph's, not a
preference: the bar sits after the list in document order and beneath it on screen.

What the decisions dictated, and where each landed:

| Record | In the build |
|---|---|
| `dec_1` marker is a 6px filled dot, state word beside it | `.ds-match-marker` + `Matched` / `Needs review` / `Break` in `--ink-secondary` |
| `dec_2` note copy is "Undo — 7 reconciled" | affordance first, em dash, no period, no second person |
| `dec_3` note never auto-dismisses | no timer anywhere; verified still present after 6s |
| `dec_4` total footer pinned to the viewport | `position: fixed`, list scrolls behind it |
| `dec_5` amount right edge a fixed 56px from the row edge | measured at exactly 56.00px |
| bar below the list, not floating | in flow, after the list |
| reconcile applies immediately, no dialog | one click, reversible after the fact |
| numbered pager, no infinite scroll | Previous / 1 / 2 / 3 / Next |
| chips are multi-select and compound | state facet ORs within itself, AND against the amount facet |
| filters survive a page change | page navigation touches only `page` |
| negatives in `--ink-primary` with a leading minus | `-£284.50`, never red, never bracketed |
| row height constant in every state | 48px resting, hovered and selected (measured) |
| header control reports a mixed state | native `indeterminate`, not a binary checkbox |
| marker carries no tooltip | no `title` attribute in the file |
| no shift-drag range selection | checkbox or row click only |

Verified on the real page in headless Chromium at 1440×900, not by reading the source:
24 seed rows diffed field-by-field against the brief (verbatim, in order); running total
£12,796.99 cross-checked in integer pence; amount edge at 56.00px; all row heights equal
at 48px; hover resolves to `--surface-recessed`; the selected row carries no transition
(computed duration 0s); zero hex, `rgb()` or bare `px` anywhere outside the `:root` token
block; zero console errors and zero non-`file://` requests. Raven's own audits: `audit_page`
100 / A, `audit_contrast` 0 AA failures across 31 measured text elements (lowest ratio
6.68), `audit_tap_targets` 28 / 28 passing at the 44px minimum. Eyes-on at full resolution
on the resting, armed, post-action, filtered and drained states.

Two defects were found by that verification and fixed rather than shipped. The base
`th, td { padding: 0 }` rule out-specified the amount column's modifier, so the column was
left-aligned at 112px from the row edge instead of right-aligned at 56px — the exact thing
`dec_5` exists to prevent, and invisible in a source read. And at ten rows per page the
`ds-batch-note` fell below the fold, which put the undo affordance off-screen at the moment
it was created.

# Decisions

Judgement calls the records did not settle:

- **Eight entries per page, three pages.** The page size is what makes the whole working
  loop fit in 900px without scrolling — list, pager, bar, and the batch note that appears
  after an action. Ten rows pushed the undo off-screen. Density lost to reachability
  because an unreachable undo is not an undo.
- **Two filter facets, not one.** `dec_msdyq34b_8daa` justifies multi-select with a
  compound question ("needs review AND over a threshold"), which needs a second facet to
  be askable. So: match state (three chips, OR within the facet) and amount (`Over £500`,
  AND across facets). The £500 threshold is invented; see the open questions.
- **Chip counts are facet-aware.** Each chip's count reflects what selecting it would
  actually yield given the other facet, so the number never promises rows the filter will
  not produce.
- **Selection persists across pages and filters; the bar discloses it.** Silently dropping
  a selection at a page boundary is the failure `dec_msdyq34d_jfkp` names. So the selection
  is a set of ids that survives navigation, and the bar says `5 on other pages` or
  `3 hidden by the current filters` whenever the count exceeds what is on screen. A
  `Clear selection` control sits beside the action.
- **The header control acts on the current page after filtering** — the eight rows the
  person can actually see, which is what "the whole page of entries" means once a filter
  is on.
- **The running total ignores the filters.** It is the number the task drives to zero, so
  it counts every unreconciled entry regardless of the current view. The filter is a
  question about the list, not a change to the balance.
- **The batch note clears on the next reconcile, a page change, or a filter change** —
  the "next action or a navigation" of `dec_3`. It survives selection changes, and it
  survives the page being clamped when a reconcile empties the last page, because neither
  is a navigation the person performed.
- **Undo restores the entries unreconciled and unselected**, and returns focus to the
  reconcile action. It does not re-select them; re-selecting would re-arm a destructive
  action nobody asked for twice.
- **Nine derived tokens were added** for values the system does not name: `--size-target`
  (44px), `--size-row` (48px), `--size-marker` (6px), `--size-checkbox`, `--size-footer`,
  `--hairline-width`, `--edge-selected`, `--focus-ring-width`, `--radius-control`, plus
  four column widths and `--layout-max`. They live in the `:root` block with the system
  tokens so `COLOR-tokens-only` holds literally — no rule in the stylesheet carries a raw
  value. They are additions to the system's vocabulary and should be reviewed as such.
- **Selection is shown as `--surface-raised` plus a 2px inset left edge**, drawn with an
  inset `box-shadow` rather than a border so the row cannot change height. Hover is
  `--surface-recessed`, per `COLOR-recessed-hover`: hover pushes back, selection comes
  forward.
- **`color-scheme: dark` is declared**, so the native checkboxes render on the dark surface
  instead of as bright white squares dominating the left rail.
- **Two audit warnings were rejected on the record.** `audit_page` asks for `clamp()` fluid
  sizing and `audit_typography` calls 26px off its inferred modular scale. Both would
  require changing the type ramp, which `TYPE-fixed-ramp` blocks — the ramp is five fixed
  steps and does not grow. The system wins over the generic heuristic.
- **Empty states are two distinct sentences**: `No entries match these filters` when a
  filter is hiding everything, `Nothing left to reconcile` when the work is done. They are
  not the same condition and should not read the same.

# Open questions

1. **`APP-COLOR-restraint` blocks this screen and the design system causes it.**
   `audit_taste` returns BLOCK: "One primary color plus one accent", evidence
   `#4f8f74 at 155deg; #c99a34 at 41deg`. But DESIGN.md defines three signal hues and
   `dec_1` requires the match marker to be a filled dot in the signal hue, so the conflict
   is between the profile's unscoped app-level rule and `arena`'s own tokens. It cannot be
   resolved inside the screen. Either the rule needs an `arena` override exempting the
   signal hues, or the system needs a state treatment that is not hue-carried. Flagging
   rather than silently shipping a BLOCK.
2. **The `Over £500` threshold is invented.** The decision record justifies compound
   filtering but names no number, and £500 is arbitrary against a 24-entry sample. Is
   the second facet an amount threshold at all, and if so is it a fixed value, a
   configurable one, or a different axis entirely (date range, counterparty, age of the
   unmatched entry)?
3. **Should the running total follow the filters?** It ignores them here. A bookkeeper
   filtered to `Break` may well want the total of what they are currently looking at.
   A second figure risks two numbers competing for the one slot the footer has.
4. **There is no way back to a reconciled entry once the note is gone.** Reconciling
   removes entries from the list, and undo covers only the most recent batch until the
   next action clears it. A real product needs a reconciled view or an audit trail; the
   brief scopes this screen to the unreconciled list, so nothing was built. Confirm that
   is intended.
5. **Cross-page selection is a guess about intent.** The bar reports `N on other pages`
   rather than clearing the selection, on the reasoning that a silent drop is worse than
   a disclosed carry. If reconciling entries the person cannot currently see is considered
   unsafe, the alternative is to scope the action to the visible page and say so.
6. **The chips have no keyboard shortcuts and the rows no arrow-key navigation.** On a
   screen used for hours the mouse round-trip is the real cost, but adding keys means
   choosing a model (roving focus, `j`/`k`, space to select) that belongs to the whole
   product, not to one screen. Nothing was invented here.
