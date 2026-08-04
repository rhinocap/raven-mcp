# Approach

I called `compose_build_prompt` (the only tool this configuration exposes) with
`profile: ledger`, `project: arena`, `surface: reconciliation review screen`. It returned the
grounding half: the token names, fifteen settled decisions (five taste decisions, ten from the
Decision Graph), three prohibitions plus every rejected alternative, one contested decision, two
design notes, and six acceptance criteria. That response instructed me to derive a Structure/States
skeleton and call the tool a second time with it as `skeleton` to get the build half.

**The second call never succeeded.** Every skeleton that passes the tool's own lint crashes the
composer with `Cannot read properties of undefined (reading 'toLowerCase')`. I probed the schema
black-box until the lint was fully satisfied — `structure` is a single `StructureNode` root
(`node_id` string, `emphasis` 1|2|3, `density` compact|default|roomy, `children`); `states` is
`{ initial, states[{name}], transitions[{from,to,on,kind}] }`; `content` is a slot array keyed to
`node_id` with `kind` ∈ note|pattern|inferred|designer (`pattern` additionally requires
`pattern_ref`). With all of that lint-clean — including a full skeleton naming all seven DESIGN.md
components and five real screen states — the crash is identical and unchanged. It is also identical
for a one-node skeleton, so it is not something in my tree: it reproduces on the minimum input the
lint will accept. I did not read the harness beyond the stub `raven-cli.mjs`, whose target is inside
a `pregate` directory I am forbidden to read.

So the build is grounded in the first half only. Practically, the cost is the **token values**: the
tool named twenty-one tokens and disclosed no values for any of them. I declared all of them once,
in a single `:root` block at the top of the file, and every rule below that block reads through
`var()` — there is no second hex, no second font-size, no bare margin/padding/gap literal anywhere
in the stylesheet. `--space-column: 56px` is not a guess: the spacing decision states it. The rest
are stand-ins chosen to satisfy the constraints I *was* given (AA contrast, the 13-unit type floor,
no gradient, no second accent hue). Swapping the real values into that one block is the whole
migration.

Verification I actually ran: headless Chromium at 1440×900, driving the real page through
select → select-page → reconcile → undo → filter → compound filter → page change → empty filter →
reconcile-to-zero. Measured from the live DOM: page height 900px (no scroll at the target viewport),
every entry row 45px resting **and** hovered **and** selected, the amount text's right edge exactly
56px from the row edge on every row, zero interactive targets under 44×44, zero console or page
errors. Body text computes to 14px, secondary ink `rgb(91,96,105)` on white ≈ 6.4:1 and on the
recessed header ≈ 5.1:1, both over AA.

# Decisions

Everything in "Decisions in force" is implemented as written. The ones worth spelling out:

- **Match marker** — a filled 6px dot in the signal hue, `aria-hidden`, no text of its own, no
  `title`, no tooltip, no popover. The state word sits beside it in the row body in
  `--color-ink-secondary`. Signal hues appear nowhere else on the page: not on the Reconcile button,
  not on negative amounts, not as row backgrounds.
- **Amounts** — right-aligned, tabular figures, `--color-ink-primary` with a leading minus (U+2212).
  No red, no parentheses. The right edge is `padding-inline-end: var(--space-column)` on the cell,
  so it is content-independent by construction.
- **Row height** — 44px content box, fixed. Resting, hover and selected differ only in background;
  selected adds an inset left bar via `box-shadow`, which does not affect layout. Nothing expands.
- **Reconcile bar** — below the list, after it in document order, in normal flow. Not floating, not
  overlaying, not in the header. It is always present (the button disables at zero selection) so it
  never appears and shifts the list under the cursor.
- **No confirmation** — Reconcile applies immediately and the surface reports afterwards.
- **Batch note** — `Undo — 10 reconciled`. Affordance first, em dash, no trailing period, no second
  person, no timer, no countdown, no auto-dismiss. It persists until the next action (any selection
  change, filter change, page change, or another reconcile) or until it is used. It lives inside a
  persistent `role="status" aria-live="polite"` region.
- **Total footer** — `position: fixed` at the bottom of the viewport, always visible, list scrolls
  behind it. It shows the whole unreconciled position (count and net amount), never the filtered
  subset — the filtered count lives in the filter bar instead.
- **Pagination** — numbered pager, 10 rows per page, 3 pages at 24 entries. No infinite scroll, no
  load-more. Filter selections survive a page change.
- **Filter chips** — multi-select, `aria-pressed`, in two labelled groups. Selection persists across
  page changes and across reconciles.
- **Header select control** — reports `indeterminate` when some but not all rows on the page are
  selected, and toggles exactly the current page's rows. It is never hidden.
- **Selection** — checkbox or row click. No shift-click range, no drag-to-select.

Judgement calls I made where the decisions did not reach:

1. **Chip semantics: union within a group, intersection across groups.** The decision says a second
   chip must narrow rather than replace, and its rationale names a compound question ("needs review
   AND over a threshold"). A pure AND inside the state group would make Review + Break match nothing,
   which is not narrowing, it is breaking. So I added a second dimension — Money in / Money out /
   Over £1,000 — which is what makes the compound question in the rationale askable at all. Within
   State, chips union; State AND Amount intersect.
2. **Selection persists across pages, and the bar says when part of it is off-screen.** Reconcile
   acts on the whole selection, so hiding rows behind a filter could silently reconcile things the
   person cannot see. The bar reads `7 entries selected · 2 hidden by filters` when that is true.
3. **Undo restores the selection, not just the entries.** The action cleared the selection as part of
   reconciling; reversing it returns the screen to exactly the state before the button was pressed.
4. **Page size 10.** Twenty-four entries over three pages exercises the numbered pager honestly, and
   the whole screen fits in 900px with no scrolling — the pinned footer earns its keep at shorter
   viewports rather than at this one.
5. **`--font-sans` and `--footer-height`** are not in the disclosed token set. They are declared in
   the same `:root` block for the same reason, and flagged there in a comment.
6. **Type floor read as px, not pt.** `APP-TYPE-floor` says "below 13pt". Read literally on the web
   that is ~17.3px, which contradicts the `density` design note. Everything is set in `rem` (so
   browser text scaling works and nothing is disabled) with 13px as the smallest computed size.

# Open questions

1. **The contested `Break` label — `dec_msdyq34d_bkqq`.** Shipped as `Break`, per the decision as
   written, and not silently resolved. The contest stands: half the pilot users read it as an error
   state, and "Unmatched" tested clearer but vaguer. It is a one-word change in `STATE_WORD` and one
   chip label. This needs the product owner, not me — and the answer likely differs for a trained
   bookkeeper versus a business owner doing their own books, which is a segmentation question the
   contest record does not settle.
2. **The real token values.** Twenty-one tokens were named, none valued, and the second
   `compose_build_prompt` call that would presumably have carried them crashes. Every value in the
   `:root` block except `--space-column` is mine. Before this goes anywhere near a real screen,
   someone with store access has to paste the real palette, type ramp and motion curve in. Also
   worth a look: `--color-signal-review` at my value is an amber that is legible as a 6px dot but
   would fail AA as text, which is fine under the current decision (the marker carries no text) and
   would not be if that decision were ever reopened.
3. **Five of the six acceptance criteria are unrun.** A1 needs `review_diff`, A2 `talon_scan`, A3
   `audit_tap_targets`, A4 `audit_contrast`, A7 `audit_taste`. This configuration exposes only
   `compose_build_prompt`, so none of them could be executed. What I report above is a hand-rolled
   headless-Chromium equivalent: it measures the same quantities (44px targets, computed colours and
   sizes, literal-free CSS below the token block) but it is *my* harness grading *my* build, which is
   weaker evidence than the named tools. A6 (semantic roles and live regions) is agent-asserted by
   the criteria themselves; the page uses a real `<table>` with `<caption>`/`<thead>`/scoped `<th>`,
   `role="region"` on the reconcile bar, `role="status" aria-live="polite"` on the batch note,
   `role="group"` on each filter group, `aria-pressed` on chips, `aria-selected` on rows,
   `aria-current="page"` on the pager, and per-row checkbox labels naming date, description and
   amount.
4. **Whether the footer total should follow the filter.** I show the whole unreconciled position at
   all times, on the reading that the layout decision calls it "the number the whole task is driving
   to zero". A bookkeeper working a filtered slice ("all the Breaks") may well want that slice's
   subtotal too. That is a second number in the footer, and I did not add it on my own authority.
5. **Undo depth.** One level, the last batch only, which is what "reversible" strictly requires. If
   the real workflow is reconcile-reconcile-reconcile-realise, a stack is a different design and a
   different note.
6. **What reconciling actually does.** Here it removes entries from the unreconciled list and the
   running total, and nothing else. Where those entries go — a reconciled view, a filter state, an
   export — is off this screen and undefined by the brief.
7. **Keyboard range selection.** Shift-drag is rejected and I did not add a keyboard substitute.
   Reconciling a page is one control; reconciling ten scattered rows is ten clicks. If that is the
   common case, it needs a real answer rather than the absence of the rejected one.
