## How to reach the empty states
Append `?state=no-results` or `?state=no-queue` to the file URL; `no-queue` also
appears on its own once the destructive action empties the list.

## Decisions I made that the sources did not settle
- **Destructive action removes rows.** There is no fourth `ds-status-pill` variant to
  represent a rejected item, so rejecting takes the rows out of the queue. Undo
  reinserts them at their original indices.
- **`ds-undo-strip` is fixed to the bottom-right.** The rail is deliberately static, so a
  reversal anchored to it scrolls out of sight; `--surface-raised` is reserved for
  floating focused things, which reads as this component. Right side keeps it off the
  left-hand scan line. Copy is `N held` / `N cleared` / `N rejected` plus a text `Undo`.
- **Rows use the default (two-line) variant:** excerpt, then `id · time · author`.
- **Both empty states hide the rail, the header control and `ds-load-more`** — with no
  rows there is nothing to arm.
- **Header control acts on every row currently in the list** (both pages once loaded).
- Clicking anywhere in a row toggles its selection.
- Column labels use `--type-ui-dense` so nothing in the queue region outsizes row text.
- `1px` rules and the 44px hit floor are composed from tokens
  (`--space-slack` + 2 × `--space-hair`); raw values appear only in the `:root` block.

## Open questions
- **`dec_destructive_label` is contested and I did not resolve it.** The button ships as
  **Reject** provisionally, tagged `data-contested="dec_destructive_label"`, and the undo
  strip says `N rejected`; both strings move together when the decision lands. Policy
  taxonomy versus user-facing notice is T&S ops' and Legal's call, not mine.
- `ds-queue-row`'s declared `disabled` state has no trigger here. I styled it rather than
  invent an interaction to reach it.
