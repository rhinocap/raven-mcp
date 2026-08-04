# Approach

I asked `compose_build_prompt` for the grounding (profile `ledger`, project `arena`,
surface "reconciliation review screen"). It returns in two halves: the first call gives
tokens, settled decisions, prohibitions, gaps and acceptance criteria, and then asks for a
colourless, typeless, sizeless **skeleton** — nodes with role, archetype, containment,
order, emphasis and density, plus a state machine, content slots and motion specs. I wrote
that skeleton, passed it back, and built against the composed prompt that came out.

Two things about the skeleton were worth learning the hard way. Emphasis is a *type ramp*,
not an importance ramp — 1 binds the small step, 3 the large one — so my first pass had
dates and meta-labels shouting. And archetypes are matched against the system's component
inventory, so naming a node `page-header` put it in a transient-surface bucket and clamped
its type; `title-block` is the name that behaves.

The build is one file, opened from disk, no network, no build step. All colour, type,
space and motion literals live in exactly one `:root` block and nothing below it carries a
hex, a `px` or a font name — the rest of the stylesheet is `var()` only. The block is split
in two: the twenty-one token *names* the arena system exposes, and a short group of local
additions (below) that it does not.

The layout is a fixed shell: header, filter bar, table, reconcile bar, and a total footer
pinned to the bottom of the viewport with the list scrolling behind it (`dec_4`). At
1440×900 the page itself never scrolls.

Verification was a Playwright suite at 1440×900 — 54 checks covering the state machine,
every settled decision that is measurable, computed contrast on every rendered text node,
tap targets, the amount-column inset per row, roles and live regions, no network requests,
no console errors, and the reduced-motion path. All 54 pass. It earned its keep: it caught
a real defect where `.entry-table th, .entry-table td { padding: 0 }` out-specified
`.cell-amount` and silently collapsed the mandated 56px amount inset to zero. That is
invisible by eye and would have shipped.

# Decisions

**Twenty-four entries, ten to a page.** `dec_msdyq34b_d90i` settles the mechanism —
numbered pager, no infinite scroll, no load-more — but not the page size. Ten is what fits
above the pinned footer at 1440×900 without the page scrolling, and it splits 24 into
10/10/4. Filter selections survive a page change (`dec_msdyq34b_zxp6`); changing a filter
returns to page 1, because the page you were on is meaningless against a different result
set.

**Selection persists across pages but is released by a filter change.** Paging is
navigation — you have not changed your mind about what you picked. Changing a filter
changes what the set even means, and a bulk Reconcile must never act on rows the person
cannot see. This is the one place I chose the more destructive behaviour deliberately.

**Header control is genuinely page-scoped.** `dec_msdyq34c_0pco` requires mixed on partial
page selection, so the control acts on the ten rows currently visible, and its label says
so. A control that silently selected all 24 while showing 10 would be the same class of
bug as reconciling rows you cannot see.

**A second filter dimension.** State alone would not exercise
`dec_msdyq34b_8daa` — chips are multi-select and narrow *cumulatively*, which is only
meaningful as a compound question. So there are two groups: State and Direction. Within a
group chips are OR, across groups AND. Every chip carries its live count, so the person can
see a filter is empty before they commit to it.

**The running total ignores the filters.** It reports every unreconciled entry, always —
£12,796.99 across 24 at rest. A filtered total would quietly answer a different question
from the one the footer's label asks. The filter bar carries its own "N of M entries"
count so the narrowed view is still legible.

**Undo is single-level and restores the selection too.** `dec_3` says the batch note
persists until the next action and never auto-dismisses, so there is no countdown and no
timer anywhere in the file. Focus moves to Undo after a reconcile (the Reconcile button is
now disabled and would be a focus trap) and back to Reconcile after an undo. Undoing puts
the entries back *and* re-selects them, because the most likely reason to undo is that you
picked the wrong rows, and you want to be where you were.

**Reconcile is immediate, reported afterwards** (`dec_msdyq34a_tfum`) — no confirmation
dialog. The bar sits below the list in document order and never floats
(`dec_msdyq34a_04p3`). Batch note copy follows `dec_2` exactly: "Undo — 10 reconciled",
affordance first, em dash, no trailing period, no second person.

**Motion is nearly absent.** Rows fade on reconcile at `--motion-duration-base` with
`--motion-easing-standard`; nothing else moves. Row height is identical resting, hovered
and selected, and nothing expands (`dec_msdyq34c_bmr7`) — this is a list read top to bottom
hundreds of times and reflow on hover would be intolerable. Under
`prefers-reduced-motion` every transition is removed and the row simply goes.

**Money.** Negatives are ink-primary with a leading U+2212, never a signal hue, never
parentheses (`dec_msdyq34c_we0s`). Amounts are right-aligned with the fixed
`--space-column` inset on every row, headers included, so the column has one right edge.
Match markers are 6px filled dots in the signal hue with no text and no tooltip
(`dec_1`, `dec_msdyq34c_64s3`); the state word lives in the row body in ink-secondary.

**The twenty archetypes that matched no component.** The tool asked me to name my
equivalent or create one, and report which. All twenty are created here — the arena
system exposes tokens but no component inventory that these resolve against, so there was
nothing to reuse:

| Archetype (node) | Built as |
| --- | --- |
| screen (screen) | `.screen` — fixed shell, list scrolls, footer pinned |
| title-block (screen-header) | `.title-block` |
| heading (screen-title) | `.screen-title` |
| meta-label (account-meta) | `.account-meta` |
| filter-bar (filter-bar) | `.filter-bar` with `.filter-group` / `.chip` |
| meta-label (filter-summary) | `.filter-summary` |
| data-table (entry-table) | `.entry-table` in `.entry-table-frame` (real `<table>`) |
| table-header (entry-table-head) | `.entry-table thead` |
| checkbox (select-all-control) | `.select-box` on a native `<input type=checkbox>`, `indeterminate` |
| checkbox (row-select-control) | `.select-box`, same component |
| meta-label (entry-date) | `.cell-date` |
| text-cell (entry-description) | `.cell-description` |
| meta-label (entry-state-word) | `.cell-state` |
| empty-state (empty-state) | `.empty-state` |
| pagination (pager) | `.pager` with `.pager-btn` |
| meta-label (selection-count) | `.selection-count` |
| button (reconcile-action) | `.btn.btn-primary` |
| button (clear-selection-action) | `.btn.btn-quiet` |
| button (undo-action) | `.btn.btn-quiet.undo-action` |
| meta-label (total-label) | `.total-label` |

Three of these are one component used twice (`.select-box`, `.btn`), which is the shape I
would push back into the system.

**Local token additions.** The system disclosed twenty-one token *names* and no values, so
the values in group 1 of `:root` are mine and are the thing to replace first when the real
scale is reachable. Group 2 is additions the system does not expose at all: `--font-sans`,
`--hairline-width`, `--rule-strong`, `--focus-width`, `--focus-offset`, `--radius-sm`,
`--radius-pill`, `--marker-size`, `--control-min`, `--row-height`, `--box-size`, the five
column widths, `--page-inset`, `--footer-height`.

**`APP-TYPE-floor` read as 13px.** The prohibition says no body text below 13pt. There is
no pt in a browser and 13pt would be ~17.3px, which is not a floor, it is a body size. I
read it as the intended smallest step and bound `--type-xs` to 13px; nothing on the screen
is smaller. If the rule literally means points, every size here moves up.

# Open questions

**"Break" is unresolved and I did not resolve it.** `dec_msdyq34d_bkqq` is flagged
contested — half the pilot users read "Break" as an error state rather than an accounting
term, and "Unmatched" tested clearer but is vaguer. I shipped "Break" because it is the
recorded decision and a build is not the place to overturn one, but I have isolated it:
every occurrence comes from a single `STATE_WORDS` map, so a ruling is a one-line change
with no other edits. **The question for the product owner:** who is this screen for? If it
is bookkeepers who live in the vocabulary daily, "Break" is correct and the pilot confusion
is a first-week cost that disappears. If it is business owners doing their own books
monthly, they never stop being first-week users and "Unmatched" wins. The A/B result cannot
answer that; the audience definition can. A third option worth testing — "Needs a match" —
is neither jargon nor vague, but it is longer and the column is tight.

**No token values, so the palette is mine.** The system gave names only. The hues I chose
for `signal-match` / `signal-review` / `signal-break` all clear 4.5:1 on both surfaces, but
whether green/amber/red is even the arena convention is unverified — `APP-COLOR-restraint`
forbids a second accent hue, which suggests a more restrained signal treatment may be
intended. First thing to reconcile against the real scale.

**No type-family token exists.** There is no `type.family` in the disclosed set and
`font-family` literals are a defect, so `--font-sans` is a local addition falling back to
the system UI stack. A real build needs the arena face; this one cannot name it.

**Undo depth.** Single-level, and a second reconcile discards the first batch's undo. That
is right for a screen where you reconcile in bursts and notice a mistake immediately. It is
wrong if people batch-reconcile a whole page and then review — in which case this needs a
session-scoped history, not an undo. I could not tell from the brief which of those the work
actually looks like, and it is the difference between a one-line change and a real feature.

**Selection released on filter change.** Defended above, but it is a judgement call I would
want watched in use: someone who filters to Match, selects, then adds Review to widen the
set will lose their picks, and widening does not have the safety problem that narrowing
does. Making it directional (keep the selection when the set grows, drop it when it
shrinks) is more correct and less predictable, so I did not.
