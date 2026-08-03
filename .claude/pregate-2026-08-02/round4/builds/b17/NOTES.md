# NOTES

## How to reach the empty states

`index.html?state=no-results` (filter prefilled with a non-matching term) and `index.html?state=no-queue`; both are also reachable by hand — type a term that matches nothing, or select every row and Remove.

## Decisions I made that the sources did not settle

- **Derived tokens.** The system has no hairline width, hit-target, or font token, so `--rule-width: 1px`, `--hit-target: 44px`, `--font-ui` are declared in `:root` and everything else references tokens. `read_design_md` emits `--color-surface-base`; DESIGN.md prose and the taste rules say `--surface-base`, so both names exist and the short ones are used.
- **The destructive button is neutral.** Signal hues are status-only, so Remove gets no colour — it is separated from Hold/Clear by a `--rule-solid` divider instead.
- **Undo is single-level and full.** It restores row status/position *and* the selection that the action cleared, persists until the next bulk action or Dismiss, and sits in flow between rail and list (never floating, by the same rationale as `dec_rail_position`).
- Row height floor is the select cell's 44px hit area; padding stays `tight`.
- The filter is not a design-system component, so it carries no `data-ds`.
- Shift-click extends a range. Selection mutates rows in place — no re-render — so focus survives and the tint is instant.
- Excerpts render without quote marks.

## Open questions

- **The destructive label.** `dec_destructive_label` is contested: T&S ops want "Reject", Legal want "Remove". I shipped "Remove" as a placeholder marked `data-decision-status="contested"`; the humans close it.
- The system names no filter component, and paging/`no-results` require one.
- Whether undo should be a stack rather than one level.
- `ds-queue-row`'s `compact` variant is styled but nothing exposes it — who chooses it?
