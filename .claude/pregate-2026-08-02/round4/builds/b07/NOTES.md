# NOTES — b07

## How to reach the empty states
`?q=zzz` (or any filter matching nothing) shows `no-results`; `?queue=empty` shows `no-queue`. Extras: `?row=compact`, `?state=loading`.

## Decisions I made that the sources did not settle
- **Two local tokens.** DESIGN.md forbids font literals but declares no font token, and mandates 44px hit targets with no space token at 44. Added `--font-ui` and `--hit-min`, marked LOCAL in `:root`. Every other value is transcribed.
- **Row shape.** Two lines — excerpt, then `id · time · author` — making the default row 57px, so the 44px hit area fits without overlapping the next row. It still overhangs the fixed 40px gutter. The `compact` variant drops the metadata line and the control then overhangs vertically, as the spacing decision describes.
- **The destructive action removes rows.** `ds-status-pill` has only three variants, so a rejected item leaves the queue: it holds the `disabled` row state for the 8s reversal window, then drops.
- **Undo restores the selection too**, so a mis-clicked batch is immediately re-actionable.
- **The undo strip sits in the rail's always-reserved middle column** and is exactly as tall as the action buttons. Rail height is 58px in idle, armed and undo — the queue never moves.
- No signal hue on the destructive button; the hues are semantic here.
- Added a filter field and shift-click range selection.
- Paging appends synchronously, so `loading` is not observable normally.

## Open questions
- **`dec_destructive_label` is contested and I did not settle it.** The button reads "Reject" as a placeholder, carries `data-contested="dec_destructive_label"`, and the strip's verb derives from the same constant — one line changes both.
- The rail scrolls away with the page, so deep in a long queue the undo strip is off-screen. Both behaviours are decided; their interaction is not.
