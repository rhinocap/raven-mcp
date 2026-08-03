# NOTES — Kettle bulk review queue (b14)

## How to reach the empty states
`index.html?state=no-results` and `index.html?state=no-queue`; `no-queue` is also reached in normal use by selecting every row, then the destructive action.

## Decisions I made that the sources did not settle
- **The destructive action removes rows** rather than restatusing them: `ds-status-pill` has only `flagged` / `held` / `cleared`, so a rejected item has no representation. Undo reinserts each removed row at its original index.
- **`ds-status-pill` is signal-hue text with no fill.** Both filled treatments are rejected in `dec_2`, so the label carries the hue directly (≥4.75:1 on base and on the recessed tint).
- **The destructive button is neutral, not red.** Signal hues are semantic and never emphasis; it is separated by position and a slack gap.
- **`ds-undo-strip` occupies a reserved column inside `ds-action-rail`**, not a band above the list. The rail is 58px in every state; the first row never moves.
- **The rail is static above the list** — every sticky, floating, and sidebar position is rejected in `dec_rail_position`.
- **A `--font-ui` token was minted.** The system declares no font family; nothing else is untokenized.
- Rows are click-to-select too; `ds-select-cell` stays the keyboard/AT control. The header control's scope is every loaded row. `ds-load-more` simulates a 260ms fetch, then goes `exhausted`.
- No filter control was built — not in the brief's behaviours, not in the vocabulary.

## Open questions
- **`dec_destructive_label` is contested (Reject vs Remove).** "Reject" ships provisionally, tagged `data-contested="dec_destructive_label"` in the markup. Policy taxonomy versus user-facing notice is a T&S/Legal call.
- If a rejected item is meant to stay visible, `ds-status-pill` needs a fourth variant — a design-system change.
- `ds-queue-row`'s `disabled` state and `compact` variant have no trigger here and are unused.
