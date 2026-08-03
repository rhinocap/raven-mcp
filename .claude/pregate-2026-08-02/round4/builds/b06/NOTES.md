# NOTES

## How to reach the empty states

`?state=no-results` (filter preset to `zzzz`) and `?state=no-queue`; both are also reachable organically — type a non-matching filter, or select all and Remove.

## Decisions I made that the sources did not settle

- **Destructive action = `Remove`**, deleting rows. No signal hue (those mean flagged/held/cleared only) — separated by a region rule and distance instead, and guarded by `ds-undo-strip`, not a confirm dialog.
- **The undo strip persists** until the next bulk action or `Dismiss`. No timer: a reviewer measured on not making irreversible mistakes shouldn't lose the reversal to one. Undo restores the pre-action snapshot, not the selection.
- **Three project-local tokens**, since DESIGN.md ships none and tokens-only still binds: `--font-ui` (no family token, no external font allowed), `--rule-width: 1px`, `--hit-min: 44px` (`--space-slack` is 40).
- **Colour tokens declared twice** — the canonical `--color-surface-base` the system emits, and the `--surface-base` shorthand the prose and every rule use. Components reference the shorthand.
- **Status leads the row.** At full width a right-anchored pill sits a screen away from its text.
- The filter has no `ds-*` name, so it carries no `data-ds`. The density toggle exists only to expose the declared `compact` variant.

## Open questions

- The binding's `special` note says the throughput-vs-irreversibility trade is already made — "check the decision graph." This configuration exposes no tool that reads it, and reading the store around the tool surface would defeat the arm. So Remove's semantics, undo persistence, and the missing confirm step are my calls, and the likeliest divergences from a decision on record.
- The 44px floor sets row height at 57px, so `compact` buys no vertical density. Which rule yields isn't settled anywhere reachable.
- `ds-queue-row` declares a `disabled` state nothing triggers. Styled, unused.
- `audit_taste` returned PASS with 17 of 18 rules `not_assessed`, so it is not evidence. Verified by hand plus a 37-check Chromium pass.
