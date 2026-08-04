# Approach

The design system came from the tools, not the filesystem: `read_design_md` (arena
tokens, the `ds-*` component vocabulary and the states each component owes),
`get_taste_profile` (`ledger` — 14 rules, 8 of them scoped to arena and bound to the
`reconciliation review screen` surface), and `audit_taste` on the finished page.

The surface is treated as a working list, not a dashboard. Everything above the list
is chrome that must not move: a fixed header, a filter row, a reconcile bar that is
always present, and a total footer pinned to the bottom. Only the rows scroll. The
person's eye can rest on the same coordinates for hours; nothing reflows underneath a
click except the rows themselves.

Structure, top to bottom:

- **Header** — account, feed period, and a live count of imported / unreconciled /
  reconciled.
- **`ds-filter-chip` row** — All, Matched, Review, Break, each with a visible text
  label, a live count, and a signal dot. Multi-select: Review + Break together is the
  real "what still needs a human" view.
- **`ds-reconcile-bar`** — idle by default with the hint and a disabled action; armed
  once anything is selected, showing the count, the net value of the selection, and
  how many of the selected entries the current filter is hiding.
- **`ds-batch-note`** — appears after a bulk reconcile with what was applied and an
  Undo. Not a timed toast; it stays until it is undone or dismissed.
- **`ds-entry-list`** — a sticky column header carrying the select-all control, then
  `ds-entry-row`s (date, description, `ds-match-marker`, `ds-amount-cell`), scrolling
  in a fixed-height region.
- **`ds-total-footer`** — unreconciled count, money in, money out, the filtered
  subtotal, and net outstanding.

Every visual value is `var(--token)`. The base tokens are transcribed verbatim from
DESIGN.md; a short derived block below them composes strokes, radii, row height and
column widths out of the base scales so no declaration carries a literal. Amounts are
held as integer pence so the running total cannot drift.

Verified in headless Chromium at 1440×900, opened as `file://` from disk: 24 rows,
net £12,796.99 (in £15,814.30 / out −£3,017.31), zero network requests, zero console
errors, no document scroll, no interactive target under 44×44, smallest rendered font
13px, row background transition duration 0s. Filter → select-all → reconcile → undo
was driven end to end and the totals, counts, chip counts and row order all returned
to their starting values. Eyes-on at full resolution in idle, armed, and post-batch
states — that pass caught two defects, both fixed: `[hidden]` was being out-specified
by `.button { display: inline-flex }`, so "Clear selection" showed while the bar was
idle; and the empty note slot was leaving a double gap above the list.

# Decisions

**Scroll, not pages.** 24 entries do not fit; a pager would add a control and split
the running total's meaning. Instead the list body is the only scrolling region, so
the header, the reconcile bar and the footer never leave. The header's select-all
therefore acts on "the whole page of entries" in the sense of everything currently
listed — which, with a filter on, is the filtered set. Its label states the number
(`All shown (7)`) so the scope is never inferred.

**Selection survives filtering, and says so.** Selection is a set of ids, not a set of
rows. Changing the filter does not silently drop a selection, because a bookkeeper who
selects three breaks, switches to review, selects four more, and hits Reconcile means
all seven. The cost is that the bar must tell the truth about what is off-screen, so
when the current filter hides part of the selection it reads `· 17 not shown in this
filter`. This is the one place the screen deliberately spends words.

**Selected is a rail, not a lift.** Hover pushes a row back to `--surface-recessed`,
per the system. Selection needed a second signal that survives hover, so a selected
row gets a 4px `--ink-primary` rail on its leading edge plus a tint mixed between base
and raised. Using `--surface-raised` outright would have dropped `--signal-break` text
to about 4.4:1; the mixed tint keeps every marker above 4.5:1 and keeps hover the only
thing that ever recesses.

**The row is the target.** Each row is a `<label>` wrapping a real checkbox, so the
whole 48px row is the hit area, the checkbox keeps its native keyboard and screen
reader behaviour, and no JS is needed to make a click select. Shift-click extends from
the last row touched; ArrowUp/ArrowDown walk the list; Escape clears the selection;
Cmd/Ctrl+Z undoes the last batch.

**Undo is a stack, and the note is the handle.** Each bulk reconcile pushes a batch.
The note shows the most recent one; undoing it restores those entries to their
original positions in the list and reveals the previous batch's note, still undoable.
Dismiss clears the note history and keeps the reconciliation. Undo restores position,
not just membership, because the list order is derived from the source data rather
than from removal order.

**Totals are stated twice, differently.** Net outstanding in the footer is always the
whole unreconciled book — it is the number the person is working down, and a filter
must not appear to change it. The filtered subtotal sits beside it as its own labelled
figure. The reconcile bar carries a third figure, the value of the current selection,
which is what a bulk action is about to move.

**Colour carries state and nothing else.** The three signal hues appear only in the
match marker dots and labels and in the filter chips that select those states. Amounts
are `--ink-primary` regardless of sign; direction is carried by the minus sign and
tabular figures, not by red and green.

**No entrance motion, no selection transition.** Rows appear; they do not animate in,
stagger, or fade. Row backgrounds have no transition at all, so selection and hover
are instant. The only motion on the screen is the 110ms colour change on the reconcile
bar and the chips.

**Two names extend the vocabulary.** DESIGN.md names the seven components but not the
list container or its header row; those are `ds-entry-list` and `ds-entry-list-head`,
built in the same vocabulary. Page-level wrappers use plain structural names and are
not presented as components.

**Derived tokens.** DESIGN.md has no stroke width, radius, row height or column width.
Rather than write literals, a derived block composes them from the base scales
(`--stroke-rail: calc(var(--space-tight) / 2)`, `--row-height: calc(var(--space-wide)
* 2)`, `--col-date: calc(var(--space-column) * 2)`, and so on) plus two irreducible
values, `--stroke-hairline: 1px` and `--stroke-focus: 2px`. The five-step type ramp is
not extended; `--type-xs` (12px) is left unused so nothing on the screen renders below
the 13px body floor, and the root and form controls are pinned to the ramp so browser
defaults do not introduce 16px and 13.33px.

# Open questions

1. **`APP-COLOR-restraint` is unsatisfiable against this design system, and it is the
   one blocking finding.** `audit_taste` returns BLOCK on the finished page:
   `color hue clusters: #4f8f74 at 155deg; #c99a34 at 41deg` — the rule allows one
   primary plus one accent, and DESIGN.md mandates three signal hues. I confirmed this
   is structural, not a property of my build: auditing a stub page that merely declares
   the three signal tokens and uses none of them returns the identical BLOCK. Either
   the rule needs an arena-scoped exemption for the signal ramp, or the system needs to
   carry match state without a third hue. I did not resolve it in the build's favour,
   because dropping a signal hue would break the design system it is being judged
   against. This needs the design owner.
2. **Dark only.** The same clause asks for system light/dark support, but the token set
   defines a single dark palette. Adding a light mode would mean inventing nine colour
   values, which `COLOR-tokens-only` forbids. The page is dark in both schemes. If
   light mode is wanted, the system needs a second set of colour tokens first.
3. **What "reconciled" means to the ledger.** Reconciling here removes entries from
   the working list and holds them in an undoable batch. Whether that is a local draft
   until the person commits the session, or an immediate write to the books, changes
   how long Undo may stay available and whether it should survive a reload. Nothing is
   persisted in this build.
4. **Whether a break should be reconcilable in bulk at all.** A `break` entry has no
   counterpart in the books, so bulk-reconciling one arguably needs a reason code or a
   write-off rather than the same action a matched entry gets. The build treats all
   three states identically; a real product probably should not.
5. **Whether select-all should ever cross the filter.** It currently acts on the
   visible set only. At 24 entries that is obvious; at 2,000 with a filter on, some
   products offer a follow-up "select all 2,000 matching". Whether that is wanted, and
   what confirmation it would need, is a product call.
6. **Column set.** Date, description, match state, amount is what the seed data
   supports. A working reconciliation screen usually also shows the proposed match —
   the ledger account or invoice an entry was matched *to* — and without it the
   difference between "Matched" and "Review" is asserted rather than shown. That column
   needs data this exercise does not have.
