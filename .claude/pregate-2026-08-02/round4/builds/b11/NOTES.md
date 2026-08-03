## How to reach the empty states

`?state=no-results` and `?state=no-queue`; `no-queue` also arrives naturally once the destructive action removes every loaded row.

## Decisions I made that the sources did not settle

- Destructive semantics: rows leave the queue (the pill has only flagged/held/cleared), and undo reinserts them at their original indices.
- Undo also restores the selection it acted on, extending `dec_selection_persists`: an assembled batch is the reviewer's work, so reversal returns it.
- `ds-undo-strip` sits in normal flow between the rail and the list, with its height reserved at all times so the queue never moves — the same trade `dec_1` makes for the rail. Verified: 0px shift when the strip appears.
- Structural tokens (`--rule-width`, `--focus-width/offset`, `--radius`, `--gutter-select`, `--hit-min`, `--font-ui`) are declared in `:root` because DESIGN.md states those values as prose but ships no token for them. Nothing outside `:root` is a bare value.
- Clicking a row toggles it; shift-click extends a range. Keyboard operation is the `ds-select-cell`, so rows add no second tab stop.
- The header `ds-select-cell` carries a visible "Select page" label; per-row cells use `aria-label` only, since `dec_5` fixes the gutter at 40px and leaves no room for text.
- `ds-load-more` holds a 260ms in-place loading state; exhausted reads "End of queue".
- The `compact` row variant is styled but never instantiated — nothing here calls for a density switch.

## Open questions

- **The destructive action's label.** `dec_destructive_label` is CONTESTED — ops want "Reject", legal wants "Remove" — and says not to pick one silently. It ships provisionally as "Remove", isolated in one `DESTRUCTIVE` constant and flagged in the markup. Closing it is a T&S/legal call.
- Whether a queue emptied by removals while page 2 is unloaded is really `no-queue`. It currently shows `no-queue`, with Load more still offered.
