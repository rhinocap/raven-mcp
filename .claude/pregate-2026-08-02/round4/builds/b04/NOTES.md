## How to reach the empty states

`index.html?q=zzzzz` → `no-results` (its Clear filter button restores the list); `index.html?empty=1` → `no-queue`, also reached by selecting all rows and applying the destructive action.

## Decisions I made that the sources did not settle

- **Derived tokens.** DESIGN.md names no border width, radius, hit target, focus-ring width or font stack. I added them to `:root` (`--radius-pill: 3px`, `--hit-min: 44px`, `--font-ui`, …) so no bare value appears outside the token block.
- **Undo strip placement.** No source locates it. It sits in a permanently reserved lane between rail and list: it never occludes rows (`dec_rail_position`'s objection to bottom bars) and never shifts the list when it enters.
- **Undo restores the selection**, not just the statuses — clearing the selection was part of the action being reversed.
- **Row anatomy.** Excerpt is the primary line; `id · time · author` is the secondary line the `compact` variant drops.
- **Row-click and drag select**, from `dec_1` ("select by clicking a row") and `MOTION-selection-is-instant` ("rubber-band across dozens of rows").
- **Destructive = remove from queue**; undo re-inserts at the original index.
- **Filter is URL-only** (`?q=`), matched over the whole row. Selection persists across it.
- **Tri-state header.** DESIGN.md declares no `indeterminate` state on `ds-select-cell`; `dec_indeterminate_header` requires one. I added `data-state="indeterminate"`.
- The column-header row has no `ds-*` name, so it uses a non-`ds` class.

## Open questions

- **The destructive action's label is contested** (`dec_destructive_label`): ops want *Reject*, legal wants *Remove*, neither has conceded. The build renders *Remove* provisionally — one constant at the top of the script — because it is the wording already committed to in the user-facing notice. Not mine to close.
- Should a bulk action apply to selected rows the filter has hidden?
- Should `ds-load-more` stay visible in the `no-results` state?
