# NOTES

## How to reach the empty states

`?queue=empty` gives `no-queue`; typing a non-matching string in Filter (or `?filter=zzzzz`) gives `no-results` — and rejecting every row also empties the queue for real.

## Decisions I made that the sources did not settle

- The destructive action **removes** rows rather than restatusing them: `ds-status-pill` declares only flagged/held/cleared, and inventing a fourth variant costs more than deleting. Undo restores them in place.
- `ds-undo-strip` sits in normal flow under the rail — same anti-occlusion logic as `dec_rail_position`. It persists until used or superseded, and Undo restores the prior selection as well as the prior rows.
- Selection is filter-independent. A selected row hidden by the filter still counts and is still acted on, extending `dec_selection_persists`.
- The filter field is not in the component vocabulary, so it carries a plain `queue-filter` class and no `data-ds` rather than a minted `ds-*` name.
- Derived tokens added for values DESIGN.md states in prose but does not carry in frontmatter: `--rule-width` 1px, `--radius-max` 3px, `--hit-min` 44px, plus font stack, weights, leading. Every usage is still `var()`.
- Row select cells carry `aria-label`; only the header cell gets a visible label.
- Rows use the `default` variant. `compact` is unused — the 44px hit floor sets row height either way.
- `--surface-raised` is unused: nothing floats, because `dec_no_confirm_modal` bans dialogs.
- The destructive button is neutral, not red. Signal hues are status-only.

## Open questions

- `dec_destructive_label` is contested (Reject vs Remove). The build ships "Reject" so it runs, tagged `data-open-question="dec_destructive_label"`. Not mine to close: T&S ops and Legal each have a live constraint and neither has conceded.
- Whether the undo strip should auto-dismiss. That is the throughput-vs-irreversibility trade this team makes explicitly, so I left it persistent rather than picking a timeout.
