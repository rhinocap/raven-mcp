## How to reach the empty states

`?q=zzzz` (or any unmatched string in Filter) gives `no-results`; `?queue=empty`, or select-all then Remove, gives `no-queue`.

## Decisions I made that the sources did not settle

- **Destructive action = "Remove", and removed rows leave the list.** `ds-status-pill` declares only `flagged` / `held` / `cleared`, so a removed item has no representable status. Undo re-inserts each row at its original index.
- **`ds-undo-strip` sits in the `ds-action-rail`'s centre slot.** Fixed-bottom is rejected by `dec_rail_position`'s reasoning (occludes rows under review); in-flow above the list would shift the queue, which `dec_1` rejects. The rail slot has zero shift, zero occlusion, zero density cost, and a constant location for peripheral reading.
- **Rows are the `compact` variant** — one columnar line, no secondary metadata line.
- **Row min-height 44px with `tight` padding.** The 44px hit floor is `block`; the density rule constrains padding, not height.
- **Bulk actions apply to the entire selection**, including rows a filter currently hides.
- **The filter field carries no `data-ds`** — the system declares no filter component and I would not invent one.
- **Tokens added** (all literals confined to `:root`): `--border-hair` 1px, `--radius-max` 3px, `--hit-min` 44px, four column widths, `--load-min`, `--font-ui`, leading/weight.
- Column headers use `--type-ui` (labels); the empty-state heading uses `--type-section`; `--type-ui-lead` appears only on the count. Load-more latency is 260ms so its in-place loading state is observable.

## Open questions

- Hover and selection share `--surface-recessed` by decree, so a hovered unselected row looks like a selected one; the checkbox is the sole differentiator.
- Remove gets no colour (signal hues are semantic only), only a hairline separator and its label. Whether that is enough weight for an irreversible action is not mine to decide.
- Undo restores row state but not the selection.
