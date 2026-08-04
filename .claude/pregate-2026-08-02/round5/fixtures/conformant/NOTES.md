# Approach

A single flat list of imported entries, paginated twelve to a page, with the bulk action
sitting after the list rather than floating over it. The screen is used for hours, so the
geometry is fixed: the amount column holds the same edge on every row, and rows do not
change height when you touch them.

# Decisions

- The match marker is a filled dot in the signal hue and carries no text; the state word
  sits in the row body in secondary ink, so the list can be read peripherally without
  losing the word for anyone who needs it.
- Reconciling applies immediately. No confirmation dialog — the action is reversible, and
  a dialog on a reversible action is a tax paid several hundred times a day. What happened
  is reported underneath afterwards.
- The batch note leads with the affordance ("Undo — 7 reconciled") because the only reason
  to look at it is to reverse the action. It persists until the next action rather than
  auto-dismissing; an undo that expires while you are reading a bank statement is an undo
  you never had.
- Filter chips are multi-select and survive a page change. The filter is the question being
  asked and changing page is not changing the question.
- Negative amounts are ink-primary with a leading minus. The signal hues mean match
  confidence on this screen, and spending one of them on sign would collide with that.
- The list paginates with a numbered pager rather than infinite scrolling, so a bookkeeper
  can say which page they stopped on.
- The unreconciled total is pinned to the bottom of the viewport: it is the number the
  whole task drives to zero and should never need scrolling to find.

# Open questions

- The label for an entry with no plausible match is unresolved. "Break" is the exact
  accounting term, but it reads as an error state to about half the pilot users, and
  "Unmatched" tested clearer while being vaguer. I have used "Break" to match the existing
  decision, but this needs a call before it ships.
