## How to reach the empty states

`?state=no-results` and `?state=no-queue`; both also arise naturally — filter for something absent, or select all and Remove.

## Decisions I made that the sources did not settle

- Destructive action is **Remove**: rows leave the queue rather than take a fourth status, because `ds-status-pill` declares three variants.
- No confirmation before Remove. The system ships `ds-undo-strip` as its reversal affordance and declares no dialog component, so reversibility is bought with undo.
- The undo strip persists until Undo or Dismiss rather than auto-expiring; a timer is a second irreversibility.
- Remove is set apart by a hairline separator and position, never colour — signal hues are semantic only.
- Two tokens DESIGN.md omits: `--font-ui` and `--size-hit-target: 44px`, defined once in `:root` so no use site carries a literal. Hairlines and radii use `--space-hair`; there is no 1px token.
- The filter field has no `ds-*` name, so it ships as scaffolding with no `data-ds`. It exists because `no-results` must offer to clear a filter.
- `compact` rows are reachable at `?density=compact`. I did not invent a density toggle.
- `ds-load-more` carries a `loading` state but no artificial latency — with no network the append is synchronous, so it goes straight to `exhausted`.
- Undo restores data only; selection stays cleared.

## Open questions

- The profile's `special` note says the throughput-vs-irreversibility trade is already recorded in a decision graph. Only `read_design_md`, `get_taste_profile` and `audit_taste` were exposed, so I could not read it. Whether Remove is soft or hard, and whether it needs a confirm step, is that record's call.
- Column heads and the page title match no declared component; if names exist, they should replace my scaffolding classes.
