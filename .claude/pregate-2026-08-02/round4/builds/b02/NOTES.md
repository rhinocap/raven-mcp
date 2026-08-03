# NOTES

## How to reach the empty states

`?state=no-results` (or type any non-matching filter, e.g. `zzz`) for `no-results`; `?state=empty` — or load page 2, select all, Reject — for `no-queue`. Also `?filter=`, `?page=2`, `?variant=compact`.

## Decisions I made that the sources did not settle

- **Undo strip placement.** `dec_rail_position` rules out bottom-floating chrome and `dec_1` rules out anything that moves the queue, so `ds-undo-strip` lives in a permanently reserved slot between the rail and the list. Measured: 0px shift when it appears.
- **Filter.** The system names no filter component, so it is a plain labelled search field, not a `ds-*` instance. It matches id, handle, excerpt and status.
- **Local tokens.** DESIGN.md names no value for hairline width, hit-target floor, max radius, checkbox size or font stack. Added as clearly marked extensions so no bare value is written in a rule.
- **Row height** (~57px) is set by the 44px hit floor, not by padding — padding stays `tight`.
- **Destructive semantics:** removes rows from the queue; Hold/Clear only change status. Undo restores rows at their original index; it does not restore the selection.
- **All three actions are neutral.** Signal hues are semantic, so the destructive one is not red.
- Bulk actions apply to the whole selection, including rows the filter currently hides.
- Simulated page fetch held to 260ms; rows render as the `default` variant.

## Open questions

- **The destructive action's label is contested** (`dec_destructive_label`): Ops want "Reject" (matches the trained policy taxonomy), Legal want "Remove" (matches the user-facing notice). I shipped "Reject" provisionally because this surface's user is the trained reviewer, and marked the button `data-contested="dec_destructive_label"`. Not mine to close.
