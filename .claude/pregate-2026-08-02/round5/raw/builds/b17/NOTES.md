# Approach

Called `compose_build_prompt` (the only tool this configuration exposes) with the profile
`ledger`, project `arena`, surface `reconciliation review screen`, and an intent derived from
the brief. It returned the grounding half: 21 tokens by name, five taste decisions, ten active
Decision Graph decisions, three prohibitions, one contested decision, two design notes, and
seven acceptance criteria. That response is the specification this screen was built to; every
layout, copy and colour call below traces to a line in it.

The response also said to derive a Structure/States skeleton and call the tool again with it.
**That second call could not be completed.** Every skeleton that passes the tool's own lint
crashes the composer with `Cannot read properties of undefined (reading 'toLowerCase')`. I
worked out the schema by probing the error messages — `structure` is a single StructureNode
root, each node needs a string `node_id`, an `emphasis` of 1|2|3 and a `density` of
compact|default|roomy; the optional `states` is `{ initial, states: [{ name }] }` and `initial`
must name a member. A skeleton in exactly that shape passes lint and then throws, and it throws
identically for a bare one-node structure, a seven-node structure keyed to the design system's
own component ids, a kitchen-sink node carrying ~20 candidate extra fields, and every variant
of the states object. The failure does not vary with skeleton content, so it is not something
my input can fix. The build therefore runs on the grounding half alone. The tool stub points at
a `pregate` directory the brief forbids reading, so I could not confirm the cause from source.

Verification: the acceptance criteria name `review_diff`, `talon_scan`, `audit_tap_targets`,
`audit_contrast` and `audit_taste`. **None of those tools exist in this configuration** —
`compose_build_prompt` is the only one served. So A1–A4 and A7 are unverified *by the tools they
cite*. In their place I ran the page in headless Chrome at a true 1440×900 viewport under a
52-assertion harness that drives the real surface: select, bulk-select, reconcile, undo, filter,
page, drain-to-empty. It measures, rather than asserts, the things the criteria are about —
computed contrast of every rendered text node against its real background (all ≥ 4.5:1), the
bounding box of every button, input and hit-label (all ≥ 44×44), every declared font-size
(floor 13px), the amount column's inset on every row, and a scan of the stylesheet for colour or
size literals outside `:root` (none). All 52 pass. That harness is evidence about the built
surface, not a substitute for the cited tools; the distinction matters and is why it is stated
here rather than reported as "A1–A7 pass".

Four defects came out of that loop and were fixed: the checkbox hit area measured 16×16 (the
native box, not the 44×44 cell — rebuilt as a custom-drawn control filling the cell), the batch
note linearised as `Undo— 12 reconciled` with the space living only in a flex gap, the
"Clear filters" chip stayed visible when no filter was active (`[hidden]` lost to
`display:inline-flex`), and the reconcile bar fell below the fold at 900px. Eyes-on caught two
more the assertions did not: a full-width focus ring around the note container, and after Undo
focus fell to `<body>` because it was sent to a Reconcile button that had just been disabled.

# Decisions

**Settled by the tool, built as given.** Six-pixel filled marker dot in the signal hue carrying
no text, with the state word beside it in `--ink-secondary` and no tooltip anywhere on the page.
Batch note reading `Undo — 10 reconciled`, affordance first, em dash, no period, no second
person, no countdown, no auto-dismiss. Total footer pinned to the viewport with the list
scrolling behind it. Amount column right-aligned with its digits a fixed `--space-column` from
the row edge, identical on every row (measured: 56px + the table's 1px border, constant across
all rows and matching the "Amount" header). Negatives in `--ink-primary` with a leading minus,
never a signal hue, never parenthesised. Reconcile bar below the list, after it in document
order, `position: static`. Reconcile applies immediately with no dialog. Numbered pager, no
infinite scroll, no load-more. Multi-select chips that survive a page change. Rows the same
height resting, hovered and selected. Tri-state header select control. Selection by checkbox or
row click only.

**Token values are mine.** The tool gave 21 token *names* and their CSS custom-property names,
not their values, and the brief forbids going to the filesystem for `DESIGN.md`. So `:root`
carries values I authored against the two design notes — a restrained near-monochrome with the
three signal hues reserved entirely for the 6px dot. **If the real design system has values,
mine are wrong and only `:root` needs replacing** — nothing below it contains a literal.

**Local token extensions.** The 21 named tokens do not cover a font stack, a control size, a
border width, a radius, or the marker's own diameter. Rather than let literals loose in the
rules, I added them to `:root` under a `(local)` comment: `--font-ui`, `--size-marker`,
`--size-control`, `--size-row`, `--size-hairline`, `--size-focus`, `--size-page`, `--size-box`,
`--size-stroke`, `--size-tick-w`, `--size-tick-h`, `--size-dash-w`, `--radius-base`,
`--leading-base`, `--leading-tight`, `--tracking-tight`, three weights, and `--zero`. These are
scaffolding for a self-contained file, not proposed additions to the system.

**Ten rows a page, three pages.** The page size is what makes the reconcile bar reachable
without scrolling at 1440×900. Twelve rows pushed the bar under the pinned footer, and eleven
missed by 3px. The bar cannot be pinned or floated — that is explicitly rejected — so the row
count is the variable that had to give. Measured: content ends at 812px, the footer starts at
854px, nothing scrolls.

**A second filter facet.** State chips alone cannot ask the compound question the multi-select
decision was made for. Money in / money out sits beside them: chips OR within a facet, AND
across facets. Match+Review shows both; Review+Break AND Money-in shows five. Counts on each
chip reflect the *other* facet's active filter, so they always predict what clicking will show.

**Reconcile acts on the whole selection, including rows the current filter hides.** The brief
says the action applies to whatever is selected, and selection survives both paging and filter
changes. Silently dropping the hidden ones would be a different action than the one the button
names. Instead the bar discloses it in place — `1 selected · 1 not shown by this filter` — right
next to the button, and the action is undoable. This is the one place where two settled
decisions (selection persistence, filter persistence) compose into a case neither of them
covers; see Open questions.

**"Until the next action" excludes selecting a row.** The note clears on reconcile, undo, a
filter change and a page change. Ticking a checkbox does not clear it: selection is not yet a
committed action, and clearing the undo while someone builds their next batch would take away
the reversal exactly when it is most likely to be wanted. Verified: the note survives a
selection change and clears on all four of the others.

**Focus after a bulk action.** Reconcile moves focus to the Undo button — the same reasoning
that puts the word first in the copy. Undo moves focus to the header select control at the top
of the list the entries just returned to.

**Running total is the whole unreconciled balance, not the filtered subset.** It is the number
the task drives to zero, so a filter must not appear to move it. Filtered counts live in the
list meta line instead: `1–7 of 7 shown · 24 unreconciled`.

# Open questions

1. **The "Break" label is contested and I have not resolved it.** Decision `dec_msdyq34d_bkqq`
   is flagged contested: half the pilot users read "Break" as an error state rather than an
   accounting term, and "Unmatched" tested clearer but vaguer. The screen ships the current
   term, "Break", because that is what the decision says today and quietly changing a contested
   term is how a contest gets lost by default. It needs a product-owner call, not a build-time
   one. Worth noting that the marker decision makes the word cheaper to change than it looks:
   the hue carries the state peripherally, so the word is doing a smaller share of the work.

2. **The skeleton half of `compose_build_prompt` is broken and this build never saw it.** Every
   lint-valid skeleton crashes the composer. Whatever the Structure/States section would have
   added — semantic roles, live regions, node emphasis and density — I inferred from the brief
   and the decisions instead. A6 in particular ("semantic roles and live regions from the
   Structure section are present") cannot be checked against a section that was never issued.
   Someone should look at that code path before the next build runs through it.

3. **`APP-TYPE-floor` says 13pt; I read it as 13px.** Taken literally, 13pt is ~17px body text,
   which is roughly a third taller per row and fights the "a working list, read top to bottom
   hundreds of times" design note head-on. Body is 14px and the smallest text on the page is
   13px, everything in `rem` so browser text scaling works. If the floor really is 13pt, the row
   height and page size both have to be reworked, and the density note needs revisiting with it.

4. **Should reconciling reach entries the current filter hides?** Disclosed and undoable here,
   but a bookkeeper who filters to Break, hits select-all and reconciles will also clear a row
   they ticked ten minutes ago under a different filter. The alternatives are to scope the
   action to the visible set (contradicts "applies to whatever is currently selected") or to
   drop selections when a filter changes (silently discards work). Worth a real decision rather
   than my disclosure line.

5. **Ten rows a page is a layout consequence, not a considered choice.** It falls out of the
   reconcile bar needing to be reachable at 900px without scrolling. On a taller screen it
   wastes rows. If the bar can be sticky to the bottom of the *list* rather than the page — a
   reading the rejected list does not obviously cover, since it rejects floating over the list
   and sitting in the header — the page could carry more rows on more screens.

6. **The undo history is one deep.** A second reconcile replaces the first note and the first
   batch stops being reversible. Nothing in the decisions asks for more, and the persistent note
   makes a single level far more useful than a timed one, but "reversible" has a depth and
   nobody has stated it.

7. **Selection persistence across pages is inferred.** Filter persistence is settled; selection
   is not addressed anywhere. I made it persist, because the tri-state header decision implies
   selection is tracked page by page against a larger set. If the intent was per-page selection,
   the off-filter disclosure line in the bar becomes unnecessary and open question 4 disappears
   with it.
