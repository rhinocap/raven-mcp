# Approach

The only tool exposed in this configuration was `compose_build_prompt`. Its first call returned
the grounding half: the 21 token names (colors / type / space / motion), an inventory of 7
components (`ds-entry-row`, `ds-match-marker`, `ds-amount-cell`, `ds-filter-chip`,
`ds-reconcile-bar`, `ds-batch-note`, `ds-total-footer`), 5 taste decisions, 10 active
Decision-Graph decisions, 3 prohibitions, 1 contested decision, and 7 acceptance criteria.

That response asks for a second call carrying a Structure/States `skeleton`. I reverse-engineered
the skeleton schema from its linter (`structure` = a single StructureNode root, each node needing
`node_id` / `emphasis` 1|2|3 / `density` compact|default|roomy; `states` = `{ initial, states[] }`
keyed on `name`; an optional `content[]` of slots with `kind` note|pattern|inferred|designer). A
skeleton that clears the lint entirely still fails: every phase-2 call returns
`Cannot read properties of undefined (reading 'toLowerCase')`, for any skeleton shape, any
surface, and any extra arguments. So the second half of the prompt (and the Structure/States
section it would have carried) was never obtained. Everything below is built from the grounding
half, and the failure is logged under Open questions.

The screen is one column at 1120px: page head → filter chips → entry list (8 rows, paginated) →
reconcile bar → batch note → numbered pager, with the unreconciled total pinned to the bottom of
the viewport. Page size 8 was chosen so the list, the reconcile bar and the pager all sit above the
fold at 1440×900 — the bar has to be reachable without scrolling, and its decision forbids floating
it over the list.

Verification actually run (the audit tools named in the acceptance criteria are not reachable from
this configuration, so these are substitutes, not those checks):

- Rendered from `file://` in headless Chrome at 1440×900 and read the screenshots: default state,
  partial selection, and post-reconcile.
- Scripted DOM harness driving the real page: select-all → 8 selected; deselect one → header
  control goes indeterminate and the bar reads 7; reconcile → those 7 leave the list, total moves
  £12,796.99 → £7,164.22, note reads `Undo — 7 reconciled`; undo → list and total restored;
  filters (`Review` → 7 shown, `Review`+`Break` → 11, plus `Over £1,000` → 1); selection made on
  page 1 survives a move to page 2 and reconciles across both pages; navigation clears the note;
  reconciling everything leaves the empty state, `£0.00`, and `Page 1 of 1`.
- Measured every interactive element's box: all ≥ 44×44 CSS px (chips, row and header checkbox
  cells, bar buttons, undo, pager buttons, clear-filters).
- Computed WCAG contrast for every foreground/background pair in use: lowest text pair is
  `ink-secondary` on `surface-recessed` at 6.8:1; signal hues sit between 5.25:1 and 6.89:1
  (they are used on 6px dots, not text).
- Grepped the file: zero hex values, zero absolute-unit literals and zero `font-family` literals
  outside the single `:root` token block.

# Decisions

Decisions taken from the tool and built to as given:

- **Match marker** — a 6px filled dot in the signal hue, no text, no `title`, no tooltip, no
  popover. The state word sits beside it in the row body in `--color-ink-secondary`.
- **Amount cell** — right-aligned, right edge a fixed `--space-column` (56px) from the row edge on
  every row, tabular numerals. Negatives render in `--color-ink-primary` with a leading minus, never
  a signal hue, never parentheses.
- **Entry row** — one fixed height (`--row-height`) resting, hovered and selected; nothing expands.
  Selection is by checkbox or row click only — no shift-click, no drag range. Selected rows get a
  recessed background plus an inset ink rail, both height-neutral.
- **Header select control** — a real tri-state checkbox: checked when the whole page is selected,
  `indeterminate` (a dash) when the page is partly selected, and it acts on exactly the page.
- **Reconcile bar** — below the list, after it in document order, in flow; never floating, never in
  the header. Reconciling applies immediately with no confirmation of any kind.
- **Batch note** — `Undo — 7 reconciled`: affordance first, em dash, no trailing period, no second
  person, no timer, no countdown, no auto-dismiss. It persists until an action or a navigation.
- **Total footer** — fixed to the bottom of the viewport, showing the running unreconciled total
  and count; the list scrolls behind it.
- **Pagination** — a numbered pager (Previous · 1 2 3 · Next). No infinite scroll, no load-more.
- **Filter chips** — multi-select and they survive page changes.
- **Prohibitions** — no gradients, no second accent hue (selection, buttons and pressed chips are
  all ink/surface monochrome; the three signal hues carry match state only), no filler copy.

Judgement calls where the grounding was silent:

- **Chip families.** The decision requires chips that narrow rather than replace, and cites
  "needs review AND over a threshold" as the real question. Chips are therefore grouped into three
  families — State, Direction, Size — OR within a family, AND across families. So `Review` + `Break`
  widens to 11 entries, and adding `Over £1,000` narrows that to 1.
- **Where the batch note lives, and what dismisses it.** It sits directly under the reconcile bar
  in a slot of reserved height, so its arrival shifts nothing. "The next action" is read as a
  filter change, a page change, or another reconcile — deliberately *not* a row selection, since
  dismissing an undo on a stray click in the list would be the same loss the decision exists to
  prevent.
- **Selection is global, not per page.** A selection survives page changes and the bar reports
  `3 entries selected — 1 on this page` whenever some of it is elsewhere, so a bulk action can
  never act on more than the count on the button.
- **Undo restores entries unselected**, in their original order and positions, rather than
  reinstating the selection — an undo shouldn't leave the same batch armed one click from being
  re-applied.
- **Page size 8**, so the whole working set (list + bar + pager) is on screen at 1440×900.
- **Dates render `02 Jul`**; the year is constant across this import and is stated once in the
  page head rather than 24 times in the column.
- **Token values.** The tool disclosed token *names* but not their values, so `:root` holds
  placeholder values and is the only place in the file with a literal. Everything else consumes
  `var()`. Names not in the disclosed list (font stack, radii, control floor, row height, column
  widths, tracking) are grouped under a `LOCAL` comment in the same block rather than inlined.
- **Focus, keyboard and semantics.** A real `<table>` with `<caption>`/`scope="col"`, real
  checkboxes with per-row accessible names, a polite `role="status"` on the batch note, a polite
  live region announcing "N entries shown, page X of Y", and a visible 3px focus ring.

# Open questions

1. **`Break` vs `Unmatched` — unresolved, flagged, not silently decided.** The tool reports
   `dec_msdyq34d_bkqq` as contested: half of pilot users read "Break" as an error state rather than
   an accounting term, while "Unmatched" tested clearer but vaguer. The build ships the current
   active label, "Break", because changing a domain term unilaterally is the more expensive
   mistake. This needs the product owner: a third option ("No match found") may beat both, and the
   answer changes the copy in the row, the filter chip and the empty state.
2. **`compose_build_prompt` phase 2 is broken in this configuration.** Every call carrying a
   lint-clean `skeleton` throws `Cannot read properties of undefined (reading 'toLowerCase')`, so
   the Structure/States half of the prompt was never issued. If that half named required landmarks,
   live-region wording, or an empty/loading/error state set, this build has met them only by
   inference. Worth fixing before anyone treats a build under this configuration as fully grounded.
3. **None of the six tool-verified acceptance criteria could actually be run.** `review_diff` (A1),
   `talon_scan` (A2), `audit_tap_targets` (A3), `audit_contrast` (A4) and `audit_taste` (A7) are not
   exposed here. The substitutes above measure the same properties by hand; they are not the same
   evidence, and the taste verdict in particular (A7, plus the `density` and `restraint` design
   notes) remains unmeasured.
4. **The 13pt type floor.** `APP-TYPE-floor` prohibits body text below 13pt. On the web that reads
   ambiguously — 13pt is ~17px. This build takes it as a 13px floor, uses 15px for row text, and
   reserves 13px for uppercase column and group labels only. If the rule literally means 17px, the
   whole scale and the row density need to move together.
5. **Filtered-out selections.** An entry selected on one page stays selected when a filter later
   hides it, and a bulk reconcile includes it. The bar discloses this ("— 1 on this page") and the
   button states the true count, but the alternative — dropping hidden entries from the selection —
   is defensible and is a product call.
6. **What reconciling actually posts.** This screen removes entries from the unreconciled list and
   nothing else. Where they go (a reconciled ledger, a batch record, an audit trail) and whether
   undo is still available after a reload or to a second person are unspecified; the undo here is
   session-local and single-batch deep.
