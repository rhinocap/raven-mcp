# Approach

I pulled the system through the tools before writing anything: `read_design_md` (the
`arena` DESIGN.md — nine colour tokens, a five-step type ramp, a four-step space scale,
two motion durations, and seven `ds-*` components with their expected states),
`get_taste_profile` (`ledger` — fourteen rules, six global and eight scoped to `arena`,
plus the surface binding for *reconciliation review screen*: voice "plain,
second-person-free, no exclamation"; density "a working list, read top to bottom hundreds
of times"; restraint "signal hues carry state only, never decoration"), and `audit_taste`
against the finished file.

The screen is built as one fixed 1440×900 working surface. Nothing but the entry list
scrolls: the head, the filter row, the list header, the reconcile bar and the total footer
are always in the same place, because a person doing this several hundred times should
never have to look for the controls. Every visual value is `var(--token)`; the only
literals in the file are the token definitions in `:root`. Geometry is arithmetic on the
space scale rather than new magnitudes — the 44px minimum target is
`calc(var(--space-wide) + var(--space-base) + var(--space-tight) / 2)`, the hairline is
`var(--space-tight) / 8` — and the unitless type steps are used as
`calc(var(--type-sm) * 1px)`, so the ramp cannot grow by accident.

Component names come from DESIGN.md and nothing else: `ds-entry-row`, `ds-amount-cell`,
`ds-match-marker`, `ds-reconcile-bar`, `ds-filter-chip`, `ds-batch-note`,
`ds-total-footer`. Layout wrappers carry `ds-` names too (`ds-screen`, `ds-list`,
`ds-bar-message`) — see the last open question.

Verified, not assumed: a 42-assertion Playwright run in headless Chromium at 1440×900
(counts, totals computed independently in Python, filter interaction, select-all
tri-state, shift-range, reconcile, multi-level undo, both empty states, every visible
target ≥ 44×44, zero external requests, zero console errors — 42/42 pass), plus
full-resolution eyes-on of the initial, armed, cross-filter, post-reconcile and empty
states. The eyes-on caught a real defect the assertions did not: the first version placed
`ds-batch-note` as an absolutely-positioned overlay, and it covered the Reconcile button.
It is now an in-flow slot in the bar, with a regression check that the two rectangles do
not intersect.

# Decisions

1. **24 entries, one screen: the list scrolls, there is no pagination.** Splitting a
   24-row reconciliation into pages would make the running total and the select-all
   ambiguous for no gain. The list body is the only scroll region.
2. **"The whole page" for the header control means the current filtered set.** The header
   checkbox selects everything the filter is showing, and carries a tri-state
   (unchecked / indeterminate / checked) against that set.
3. **Selection survives a filter change, and the bar says so.** Switching filters never
   silently drops or silently keeps rows: when part of the selection is outside the
   current filter the `ds-reconcile-bar` reads "7 entries selected · −£200.13 · 7 not
   shown by this filter", and the action button names its own count ("Reconcile 7"). A
   bulk action should never act on more rows than the person can see without saying so.
4. **Reconcile removes rows immediately**; the result is stated in `ds-batch-note`
   ("7 entries reconciled · −£200.13") with Undo beside it, and the chip counts, the
   header progress and the total all move in the same frame.
5. **Undo is a stack, not one level, and it never expires.** Undo pops the most recent
   batch, the note then offers the batch before it, and rows return in their original
   order. `Cmd/Ctrl+Z` is bound. No auto-dismiss timer: on a screen used for hours a
   disappearing undo is a trap.
6. **`ds-batch-note` lives in the bar, not over it.** It occupies the bar's message slot,
   so it never covers a control, never shifts the list, and its Undo stays reachable.
7. **Signal hues are used only by `ds-match-marker` and the matching filter dots.**
   Amounts are `--ink-primary` with a minus sign for money out — money direction is not a
   match state, so it does not get a hue.
8. **Match state is always spelled out in words** next to the dot, so state never depends
   on colour alone.
9. **Hover pushes the row back (`--surface-recessed`); selected is recessed plus an
   `--ink-primary` left rail with `transition: none`** — selection feedback is instant,
   hover is the only thing that eases.
10. **The whole row is a click target** (44px minimum), shift-click extends a range from
    the last row touched, and the checkbox is the keyboard stop with a visible focus ring
    on both the control and the row.
11. **Type discipline:** entry rows and all body text at the 13 step, 12 reserved for
    uppercase column and section labels, 19 for the page title, 26 for the total. No sixth
    size.
12. **`ds-total-footer` shows net unreconciled, entry count, and money in / money out;**
    a second line showing the filtered subtotal appears only while a filter is active, so
    the headline number always means the same thing.
13. **Motion is three transitions total** (row hover, chip hover, bar border) at the fast
    duration on the standard easing. No entrance animation on list content, and
    `prefers-reduced-motion` removes all of it.
14. **Dark only.** DESIGN.md ships one surface ramp; inventing a light one would be
    inventing tokens.

# Open questions

1. **`APP-COLOR-restraint` blocks this screen, and I could not resolve it without breaking
   the design system.** `audit_taste` on the final file returns
   `Verdict: BLOCK (1 block, 0 warn)` — "color hue clusters: #4f8f74 at 155deg; #c99a34 at
   41deg". I measured the detector rather than guessing at it: three signal hues → BLOCK,
   dropping the review amber → still BLOCK, one hue → PASS. The rule permits exactly one
   chromatic hue, and DESIGN.md defines three signal hues whose entire job is match state.
   I kept the three, because the surface binding explicitly sanctions signal hues for
   state and a one-hue triage screen cannot distinguish matched from review from break at
   a glance. **Needs a ruling:** scope `APP-COLOR-restraint` out of `arena` (the way the
   other colour rules are scoped), or collapse the signal set — which changes the product,
   not the CSS.
2. **The same rule's second clause, "respects system light/dark mode", is unsatisfiable as
   written.** There is one surface ramp in the token set. Either a light ramp gets added
   to DESIGN.md or the rule needs an explicit dark-only exemption for this project.
3. **The audit did not check the rules that matter most here.** On every run — with and
   without `project` / `scope` arguments — all eight `arena`-scoped rules came back under
   `skipped_out_of_scope` for an `html` target, five of the six global rules came back
   `not_assessed` ("no deterministic detector"), and `APP-TAP-targets` needed a delegated
   run that a raw-HTML target cannot supply. So exactly one of fourteen rules was actually
   evaluated. Compliance with the other thirteen in this build is by construction plus my
   own harness (tokens-only grep, 44×44 measurement, no-transition-on-selected, no list
   entrance animation, labelled filter chips, `ds-*` names). A project-scoped rule that
   never fires on the project's own build is a silent gate, and I would want that fixed in
   the tooling before it is trusted as a merge check.
4. **No confirmation step before a bulk reconcile, of any size.** Undo is the safety net.
   If reconciliation writes to the books irreversibly downstream, a threshold ("more than
   N entries" or "more than £X") probably needs a confirm — that is a product call, and it
   changes the bar.
5. **A `break` can currently be reconciled like anything else.** A break means the entry
   did not find its match; in a real product it probably needs a reason, a write-off, or a
   manual match before it may leave the list. I did not invent that flow, because inventing
   it would put an undisclosed rule into the screen.
6. **State is session-only.** Reload restores all 24 entries and empties the undo stack.
   Whether reconciliation and undo persist is a back-end question this screen cannot
   answer alone.
7. **Structural wrappers are not in the DESIGN.md vocabulary.** `ds-screen`, `ds-list`,
   `ds-list-head`, `ds-list-body`, `ds-bar-message`, `ds-select`, `ds-action`, `ds-dot`
   carry the `ds-` prefix and hold no styling identity of their own, but if the seven
   named components are meant to be exhaustive, these need either adding to the system or
   replacing with something already in it.
