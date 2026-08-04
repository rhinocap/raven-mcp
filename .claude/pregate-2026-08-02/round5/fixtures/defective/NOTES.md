# Approach

A dense table of the imported entries with the bulk action at the top so it is reachable
without scrolling, filters beside it, and a running unreconciled total at the foot of the
page. Twelve rows load at a time with a Load more button rather than paging, which keeps
the scroll position stable.

# Decisions

- Match state is shown as a labelled pill in a state colour, with a tooltip explaining
  where the confidence came from.
- Reconciling asks for confirmation first, since it changes the books.
- Negative amounts are shown in red and in parentheses, following normal accounting
  convention.
- Filters are single-select icon buttons — one state at a time keeps the question simple.
- Rows expand slightly on hover so the description has room to breathe.

# Open questions

None — the requirements were clear enough to build from directly.
