# NOTES — b09

## How to reach the empty states

`?empty=no-results` or `?empty=no-queue`. `no-queue` is also reachable by hand: select all, Reject.

## Decisions I made that the sources did not settle

- **The destructive action removes rows.** `ds-status-pill` has only flagged/held/cleared, so a rejected row has no pill to wear. Undo re-inserts at the original indices; Hold and Clear restate the pill in place.
- **The undo slot is permanently reserved** (44px, above the list). dec_1's objection — a region that grows under the cursor moves the button being aimed at — applies to the strip as much as the rail, so the strip fades in without moving anything.
- **Status marker:** a signal dot plus a mandatory neutral label, dots aligned in a fixed column. Not a chip, no signal-hue text.
- **Structural constants** (44px hit area, 40px gutter, hairline, radius, font stack) sit beside the tokens under a `--struct-` namespace; the system tokenises colour, type, space and motion only.
- Shift-click extends a range; clicking row text toggles. Undo restores statuses, not the selection.
- **`compact` is unused.** No density control was asked for, and a compact row is shorter than the select cell's 44px hit area, so adjacent hit areas would overlap.

## Open questions

- **`dec_destructive_label` — contested, and not mine to settle.** Ops want "Reject" (the taxonomy reviewers are trained on); Legal wants "Remove" (what the user-facing notice says). Shipped as "Reject" provisionally, reasoning that this console is the reviewer-facing surface and the notice is a different one — but that is a guess at a trade someone else owns. Marked `data-contested="dec_destructive_label"` in the markup so the choice is not silent.
- `no-results` presupposes a filter control no source specifies. The state renders; nothing here produces it by filtering.
- The palette is inlined as hex in `:root` — a self-contained file has nowhere else to define the properties.
