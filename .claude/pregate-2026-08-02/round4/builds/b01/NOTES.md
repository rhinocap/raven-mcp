# NOTES

## How to reach the empty states

`index.html?empty=no-results` and `index.html?empty=no-queue`; `no-queue` also arrives on its own once every remaining row has been rejected.

## Decisions I made that the sources did not settle

- **The destructive action removes rows** rather than writing a fourth status — `ds-status-pill` declares exactly three variants, so a rejected item has no pill to wear and leaves the queue.
- **Undo restores statuses and re-inserts removed rows at their original index, but does not restore the selection.** Inside the 8s window the reviewer is usually assembling the next batch; re-arming the old one would clobber it.
- **`ds-undo-strip` sits at the right end of `ds-action-rail`**, whose height is pinned to its tallest child. The rail is the same height idle, armed, and with the strip up, so nothing under the cursor moves. Strip enters at 160ms, auto-dismisses at 8s, no countdown.
- **Row body** is the excerpt over `id · time · author`, status at the right edge. The `compact` variant is defined but unused.
- **Two constants are not in the token file:** `--rule-width` (1px hairline) and `--hit-target` (44px, from the brief). `--font-ui` carries `system-ui` so no `font-family` literal is emitted.
- Shift-click extends a selection run. Column labels use `ui-dense`, not `ui`, to stay inside the row rhythm.

## Open questions

- **`dec_destructive_label` is contested and I did not settle it.** The button renders "Reject" so the build is operable, and carries `data-decision-status="contested"` with `data-decision-candidates="Reject|Remove"`. Note the choice also sets the undo verb ("3 rejected" vs "3 removed"). A human call.
- `no-results` implies a filter, and no filter control exists anywhere in the sources. I exposed the state by query param rather than inventing one.
