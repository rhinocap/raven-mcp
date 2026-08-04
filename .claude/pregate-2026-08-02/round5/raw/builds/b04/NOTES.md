# Approach

Grounding came from `compose_build_prompt` (arm A, profile `ledger`, project `arena`,
surface `reconciliation review screen`). That call returned the token set, five taste
decisions, ten active Decision-Graph decisions, the prohibition list, one contested
decision, and the acceptance criteria. Everything below is built to that response. The
tool asked to be called a second time with a derived `skeleton`; that half never
returned (see Open questions), so the Structure/States skeleton I derived was used
directly rather than round-tripped through the tool.

Shape of the screen, top to bottom: header, filter chips, entry table, numbered pager,
reconcile bar, and a total footer pinned to the bottom of the viewport. That order is
the decisions' order — the bar sits *after* the list in document order and beneath it
on screen, never floating; the total is pinned and never scrolls away.

24 entries is more than one screen, so the list paginates 10 per page across 3 pages
with a numbered pager (infinite scroll, load-more and virtualisation are all rejected in
the decision record). Filters are chips, multi-select, and survive paging and bulk
actions. Selection is per row or per page, and the header control reports a mixed state.
Reconcile applies immediately with no dialog and hands back a persistent undo.

Everything is one file, no network, no build step. State lives in a small closure —
`ledger`, `selected`, `filters`, `page`, `lastBatch`, `note` — and the list and pager
re-render from it on every change. Keyboard focus is captured and restored across those
re-renders, or a keyboard user would be thrown back to the top of the page on every
selection.

Verified in headless Chromium at 1440×900, from `file://`:

- 24 rows read back across the 3 pages match the seed table exactly — order, dates,
  descriptions, amounts, states.
- Total starts at £12,796.99. Reconciling 10 → £8,856.42 and `14 entries · 10
  reconciled`; undo returns £12,796.99 / `24 entries`, with every entry back at its
  original index (full 24-row re-read is byte-identical to the seed).
- Header select control: unchecked → indeterminate on a partial page selection →
  checked; it stays visible in all three.
- Filters compose: `Break` alone → 4; `Break` + `Over £1,000` → 1; `Review` + `Over
  £1,000` → 0 and the empty state appears. Chips stay pressed across a page change.
- Selection persisting under a filter is declared, not hidden: "10 entries selected — 9
  not shown by the current filter".
- Keyboard: Space on a row checkbox toggles it and focus stays on that checkbox; Enter
  on a pager button keeps focus on the pager; after Reconcile focus lands on Undo, and
  Enter there undoes the batch.
- Every interactive element measures ≥ 44×44 CSS px (checked in the DOM; zero
  violations). The amount column's right edge sits exactly 56 px from the row edge on
  every row.
- Page height is exactly 900 px at 1440×900 — no scrolling in the default state, no
  horizontal scroll. Row height is identical resting, hovered and selected (48.5 px).
- Zero console errors, zero network requests of any kind.
- Text contrast computed against the actual pairs in use: ink-primary 15.9:1,
  ink-secondary 6.0:1 on the page ground, 5.4:1 on a selected row, white on the primary
  button 17.4:1 — all above 4.5:1. Signal hues appear only as non-text dots (4.1–6.6:1).

# Decisions

- **10 rows a page, 3 pages.** Enough to scan a run of entries, and it keeps the
  reconcile bar and the pinned total on screen together at 1440×900 without scrolling.
- **Token values are mine.** The tool disclosed token *names* only (`--color-ink-primary`
  and so on) and no path to the design system, so I chose the values and verified them
  for contrast. Every literal in the file lives in the single `:root` block; nothing
  below it uses a raw hex, size or family. Someone with access to `arena/DESIGN.md`
  should swap the values in that block.
- **A small block of local constants sits with the tokens** — typeface stack, hairline
  width, focus-ring width, the 6 px marker size named by `dec_1`, two radii, the page
  max-width, and row/control heights derived with `calc()` from the space scale. The
  disclosed set has no type, border, radius or control-size token, and the page cannot
  render without them. They are grouped and commented so they are easy to replace.
- **Two filter facets, not one.** `dec_msdyq34b_8daa` keeps chips multi-select because
  the real question is compound — "needs review AND over a threshold". A state-only chip
  set cannot ask that of itself, so there is a second facet (money in / money out / over
  £1,000). Chips within a facet widen it; facets narrow each other. The £1,000 threshold
  is invented.
- **Selection survives filtering and paging, and says so.** The selection is the person's
  set, not the viewport's. When part of it is filtered out of view the bar reads "10
  entries selected — 9 not shown by the current filter", and Reconcile acts on all 10.
  The alternative — silently dropping hidden entries from the selection — loses work
  without saying so.
- **The batch note lives in the reconcile bar's left slot**, on the same line as the
  actions, rather than in a block beneath it. A block below the bar pushed the undo
  affordance off the bottom of a 900 px viewport, which is exactly the failure `dec_3`
  exists to prevent. It replaces the selection count, which is free because any selection
  change is "the next action" and ends the note anyway. Copy is `dec_2` verbatim: "Undo —
  7 reconciled".
- **"The next action" that ends the note** is a filter change, a page change, any
  selection change, or another reconcile. Nothing is time-based; there is no countdown
  and no auto-dismiss.
- **Undo restores each entry at its original index** so the list comes back in seed
  order, and replaces the note with "Restored — 7 entries back on the list" — a statement,
  not an affordance, subject to the same persistence rule.
- **The total is the whole unreconciled ledger and ignores filters.** Filtering narrows
  the view, not the books. The list's own count line carries the filtered number
  ("Showing 7 of 24 entries") so the two never get confused. The footer's right side
  carries the entry count and, once a batch has been reconciled, how many.
- **Focus is preserved across re-renders**, moves to Undo after a reconcile, and to the
  header select control after an undo.
- **Marker and state word** follow `dec_1`: a filled dot in the signal hue with no text
  and no tooltip, and the word beside it in secondary ink. Negatives take a leading minus
  in primary ink, never a signal hue and never brackets. Amounts and dates are tabular.
- **Reconciled entries just leave the list.** The brief asks for removal and an undo; it
  names no destination, so there is no reconciled view here, only the running count in
  the footer.
- **"Break" is kept as the state word**, per the active decision — not because the
  contest is settled (it isn't; see below).

# Open questions

1. **"Break" vs "Unmatched" (`dec_msdyq34d_bkqq`) is contested and I have not resolved
   it.** The build ships "Break" because that is what the active decision says, but half
   the pilot users read it as an error state, and the marker's hue for `break` is the
   most alarm-like of the three, which pushes the same way. Product owner's call, and it
   changes one label plus the chip.
2. **The second half of `compose_build_prompt` is broken in this configuration.** The
   first response says the skeleton must be sent back for the Structure/States half. Any
   skeleton that *fails* lint returns a clean error (`structure.node_id` required,
   `emphasis` must be 1|2|3, `density` must be compact|default|roomy,
   `states.initial` must be a member of `states[]`) — but every skeleton that *passes*
   lint throws `Cannot read properties of undefined (reading 'toLowerCase')`, including a
   full one naming all seven inventory components. So the Structure/States half of the
   prompt was never available. Harness owner's call; the build is grounded on the first
   response only.
3. **The design system's real token values are unknown to me.** Names came back without
   values, and the brief forbids going to the filesystem for them. The palette, type
   scale, spacing values and motion timings in `:root` are my choices that satisfy the
   stated constraints — they are not the system's. They need replacing before this is
   anything but a working prototype. The same goes for the missing typeface, border,
   radius and control-size tokens.
4. **Selection under a filter** — I keep hidden entries selected and reconcile them.
   A designer might reasonably want the opposite (filtering deselects what it hides), or
   want Reconcile to act only on what is visible. Worth deciding explicitly; it is the
   one place where a bulk action can touch something the person cannot see.
5. **Does a selection click really count as "the next action" that kills the undo?**
   `dec_3` says the note persists until the next action or a navigation, which I read
   strictly. The consequence is that one stray row click destroys a 20-entry undo. If the
   intent was only "it does not expire on a timer", the note should survive selection and
   die only on a reconcile or a navigation.
6. **Where reconciled entries go.** Nothing in the brief or the decision record describes
   a reconciled view, a per-session batch history, or what happens after a reload. Real
   bookkeepers will ask for at least a list of what they just cleared.
7. **The acceptance criteria could not be tool-checked here.** A1–A4 and A7 name
   `review_diff`, `talon_scan`, `audit_tap_targets`, `audit_contrast` and `audit_taste`,
   but this configuration exposes only `compose_build_prompt`. I substituted direct
   measurement — DOM rect measurement for tap targets and the amount column, computed
   WCAG ratios for every text/background pair in use, a read of the diff for roles and
   live regions, and a grep of my own file for literals outside the token block. Those
   criteria are agent-asserted here, not tool-verified.
8. **The amount facet is an invention.** "Over £1,000" and the money in / money out split
   come from the rationale attached to the multi-select chip decision, not from the brief.
   If the real second facet is a date range, an account, or a supplier, the chip row
   changes shape.
