# NOTES

## How to reach the empty states

`index.html?state=no-results` (or type a filter that matches nothing, e.g. `zzz`) and `index.html?state=no-queue`.

## Decisions I made that the sources did not settle

- **The destructive action removes rows from the queue** rather than setting a fourth status: `ds-status-pill` declares exactly three variants, so a "rejected" pill would be an invented one. Undo re-inserts each row at its original index.
- **Undo restores statuses *and* the selection** — a full return to the pre-action state. One level deep, most recent action only.
- **`ds-undo-strip` sits inside `ds-action-rail`, out of flow.** It costs no permanent vertical density and shifts nothing under the cursor when it appears — same reasoning as `dec_rail_position`.
- **Bulk actions apply to the whole selection, including rows hidden by the filter.** Selection is never silently dropped (`dec_selection_persists`).
- Row: id + excerpt on the primary line, time + author on the secondary line that `compact` drops, so the id survives both variants. `?rows=compact` exercises it; no density toggle, since none is in the vocabulary.
- Rail buttons use `aria-disabled`, not `disabled`, so the rail stays in the tab ring ahead of the rows (`dec_rail_before_list`) and focus survives applying an action.
- Local tokens DESIGN.md does not define: `--font-ui`, `--border-hair` 1px, `--radius-max` 3px, `--hit-min` 44px, column widths. Row padding stays `tight`; the select cell carries a negative block margin so its 44px hit area does not inflate the row (50px rows, no hit-area overlap between rows).

## Open questions

- **The destructive label is contested** (`dec_destructive_label`: ops "Reject" vs legal "Remove"). Built as "Remove" and marked `data-open-question`; not mine to settle.
- Given that, is removal even the intended destructive semantic — or was a fourth status meant, with a pill variant still to be drawn?
