## How to reach the empty states

`?q=zzzz` (or any non-matching filter text) gives `no-results`; `?empty=1`, or selecting all and applying the destructive action, gives `no-queue`.

## Decisions I made that the sources did not settle

- The destructive action removes rows. `ds-status-pill` declares only flagged/held/cleared, so a fourth status would have invented one. Undo re-inserts each row at its original index.
- `ds-undo-strip` sits in normal flow between the rail and the list — dec_rail_position's reasoning, never occlude the rows under review — on `--surface-raised`, the one element here meant to rise. It does not auto-dismiss: dec_no_confirm_modal leaves reversal as the only control, so it persists until the next action or Dismiss.
- Undo restores the selection with the rows, by dec_selection_persists' rationale: never silently discard an assembled batch.
- A text filter and a Default/Compact density toggle were added; `no-results` needs a real filter to be reachable honestly. Neither is a declared component, so neither carries `data-ds`.
- Selection survives filter changes and bulk actions apply to the whole selection; the header `ds-select-cell` reflects visible rows only.
- The destructive button is separated by a hairline, not a colour — signal hues are semantic.
- Compact rows give up their own padding; the 44px `ds-select-cell` sets the floor (57px → 45px).
- Local tokens for font stack, border width, hit-target floor, checkbox size, status column. The system declares none.

## Open questions

- The destructive label. dec_destructive_label is contested — Reject (T&S ops) vs Remove (Legal) — so I shipped both, with a note in the rail, rather than picking silently.
- Whether destructive should mean removal at all, or a fourth reviewed-and-rejected status the pill does not have.
- `audit_taste` returns PASS but marks 17 of 18 rules "no deterministic detector"; I verified those by measuring the rendered page.
