## How to reach the empty states

`?q=zzz` (a filter matching nothing) → `no-results`; `?empty=1`, or Remove every row → `no-queue`.

## Decisions I made that the sources did not settle

- The destructive action is **Remove**: it deletes the rows, and Undo restores them at their original indices.
- It carries no signal hue — those are semantic — so it is neutral like Hold and Clear, separated only by space.
- Derived tokens for values the sources mandate but never name: `--hit-target` 44px, `--rule-width` 1px, `--radius-pill` 3px, `--control-box` 14px, `--font-ui` (a system stack; no typeface is specified anywhere).
- Row is excerpt on line one, `id · time · @author` as the secondary metadata line the `compact` variant drops (`?compact=1`).
- `ds-undo-strip` is the only thing that floats, so it is the sole consumer of `--surface-raised`: fixed bottom-left, 8s, no countdown.
- Clicking a row toggles it (dec_1: reviewers click a row, then an action).
- `--ink-faint` is 3.4:1 on `--surface-base`, so it dresses only disabled and exhausted controls, never live text.
- Undo restores statuses and rows; it does not restore the selection.
- Excerpts render without the brief's surrounding quote marks.

## Open questions

- Whether "destructive" means removed from the queue or taken down at the platform is policy, not design.
- A destructive action visually identical to Hold and Clear may be too quiet. Fixing it needs either a neutral emphasis level this system lacks or an exception to the semantic-hue rule — the team's call, not mine.
- `ds-queue-row` declares a `disabled` state; nothing in this brief produces one, so it is styled but unreachable.
- The filter is a query param only: the sources name no filter component, and inventing one would break the `ds-*` vocabulary.
