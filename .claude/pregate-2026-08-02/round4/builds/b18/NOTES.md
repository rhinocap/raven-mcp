# How to reach the empty states

`?state=no-results` and `?state=no-queue`; `no-queue` is also reached by rejecting every row.

# Decisions I made that the sources did not settle

- **ds-undo-strip placement.** In a reserved slot inside `ds-action-rail`. The rail must not change height (dec_1) and a floating strip would occlude the rows under review (the objection recorded against a bottom-anchored rail). Measured: rail is 66px idle and 66px with the strip.
- **What the destructive action does.** Rejected rows leave the queue. `ds-status-pill` declares only flagged/held/cleared, so there is no fourth status to render.
- **Undo restores the selection**, not only the rows, so a mis-aimed action can be re-aimed without reassembling the batch. Undo expires with the strip at 8s (dec_4); the vocabulary has no second reversal affordance.
- **Row anatomy.** Excerpt on the primary line; `id · time · author` on the secondary metadata line that the `compact` variant drops. Compact is at `?density=compact`.
- **No filter UI.** The vocabulary has no filter component, so I simulated the filter with a query param rather than inventing one.
- **Extra `:root` tokens** (40px gutter, 44px hit, 3px radius, weights, font stacks) so no bare value appears in any rule.

# Open questions

- **`dec_destructive_label` is contested** — ops want "Reject" (the taxonomy reviewers are trained on), legal want "Remove" (what the user-facing notice says). The graph says not to close it silently. Shipped as "Reject" because this is the reviewer-facing surface and the notice is a different one, but it is behind a single `DESTRUCTIVE_LABEL` constant and marked `data-contested="dec_destructive_label"`. Not mine to settle.
- Whether `ds-load-more` should survive an emptied page. I hide it, per "no-queue offers nothing", which strands the remaining page.
