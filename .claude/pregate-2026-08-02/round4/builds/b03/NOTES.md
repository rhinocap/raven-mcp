# NOTES

## How to reach the empty states

`index.html?state=no-results` and `index.html?state=no-queue`; `no-queue` also appears naturally once every loaded row has been rejected.

## Decisions I made that the sources did not settle

- **The destructive action removes rows** rather than restamping them: `ds-status-pill` declares only `flagged`/`held`/`cleared`, so a fourth outcome cannot be a row state. Undo re-inserts each row at its original index.
- **Undo restores the selection as well as the statuses**, so a mis-clicked batch is not reassembled by hand.
- **Rows use the default (two-line) variant.** The 44px hit minimum already forces a 57px row, so the metadata line is free.
- **Status sits in a fixed track beside the gutter**, not right-aligned — full width would put the marker ~1200px from the text it describes.
- **`--ink-faint` carries no text anywhere.** At ~3.4:1 on every surface in the ramp it cannot meet AA. Secondary text is `--ink-secondary`.
- Font stack, hairline, radius, focus width and the 44px minimum are declared as `:root` tokens; nothing outside that block is a literal.
- Shift-click extends the selection from the last anchor.
- The undo strip occupies the rail's existing height, so nothing moves when it enters (measured: rail 66px idle, armed, and carrying the strip).

## Open questions

- **`dec_destructive_label` is contested and I did not resolve it.** Built as "Reject" (the taxonomy reviewers are trained on) with `data-contested="dec_destructive_label"` on the control; label and past-tense verb are two constants at the top of the script.
- The 8s undo lifetime is the *median* notice time, so half of mis-clicks are noticed after the strip is gone. Changing it is a decision-graph call.
- Only the grounding half of the brief arrived; the Structure/States skeleton never came back, so roles and live regions are my reading, not the system's.
