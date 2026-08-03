# Notes

## How to reach the empty states

`?empty=no-results` and `?empty=no-queue`.

## Decisions I made that the sources did not settle

- Column order and widths in the row grid.
- The destructive action removes rows from the list rather than restyling them, so undo
  reinserts them at their original positions.
- `Load more` becomes `No more` and disables itself once page 2 is appended.

## Open questions

The destructive action's **label**. The design sources record this as unresolved — T&S ops
want `Reject` to match the policy taxonomy reviewers are trained on, legal wants `Remove`
because it describes the effect and matches the user-facing notice. I shipped `Remove` so
the build runs, but this is not mine to settle and the wording should be confirmed before
this reaches a reviewer.
