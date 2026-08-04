# Approach

I pulled the system before writing anything: `read_design_md` (project `arena`), `get_taste_profile`
(profile `ledger`, surface `reconciliation review screen`), and `audit_taste` against the built page.

DESIGN.md gave me the whole vocabulary — nine colours, a five-step type ramp, a four-step space scale,
two durations and one easing, and seven named components (`ds-entry-row`, `ds-amount-cell`,
`ds-match-marker`, `ds-reconcile-bar`, `ds-filter-chip`, `ds-batch-note`, `ds-total-footer`). The
build is those seven components and nothing else; the screen is assembled from them rather than from
a generic table/toolbar/toast kit.

The CSS has two layers. A `:root` token block holds every literal in the file, transcribed from the
DESIGN.md frontmatter under the `cssVar` names that file declares. Below it, a derived layer computes
the values the system doesn't name — hairline width, corner radius, control height, column widths —
as `calc()` from the tokens above, so the geometry moves when the scale moves and there are no
independent constants. Verified: zero bare hex, zero bare `rgb()`, zero bare `px` anywhere outside
that one block, and only four of the five ramp steps ever appear as a `font-size`.

The screen reads as a working list under `--space-column` margins: header, filter row, reconcile bar,
batch note, list, total footer. Only the list scrolls; the reconcile bar and the running total are
always on screen because those are the two things the person is checking against.

Verification was measured, not assumed. I drove the real page in headless Chrome at 1440×900 through
a 44-assertion suite covering every requirement (select, bulk select, filter, reconcile, undo,
running total, keyboard, empty state) plus live geometry — every interactive element's bounding box,
column alignment between the sticky header and the rows, and confirmation that nothing overflows the
viewport. 44/44 pass. The suite ran from a scratchpad copy so the build directory holds exactly the
two required files.

# Decisions

**24 entries → one scrolling list, not pages.** Pagination would make "reconcile the selection" mean
"reconcile this arbitrary slice of 20", and a bookkeeper going top-to-bottom does not want to lose
their place at a page boundary. The list is a single internally-scrolling region with a sticky column
header; the reconcile bar and total footer sit outside it and never scroll away. Because there is no
pagination, the header control acts on *everything currently passing the filter* — labelled "Select
every entry in view" — and it is tri-state (empty / partial / all).

**Selection survives a filter change, and says so.** The alternative — silently dropping entries from
the selection when they leave the filter — quietly changes what a person is about to reconcile. So
selection persists, and when part of it is out of view the reconcile bar states it plainly:
"7 entries are outside the current filter and will still be reconciled." Acting on something you
cannot see is the scarier failure in bookkeeping, so it gets named rather than hidden.

**Filter chips are multi-select toggles.** "Needs review" and "Break" are the two states a person
actually wants side by side. "All" clears the filters rather than being a fourth mutually-exclusive
option. Every chip carries a visible text label and a live count of unreconciled entries in that
state; the counts fall as entries are reconciled.

**Undo is a persistent note, not a timed one.** `ds-batch-note` appears after a bulk action and stays
until it is undone, dismissed, or replaced by a later batch. A disappearing undo puts a stopwatch on
a financial correction. Undo restores entries to their original positions in the list (the model
flags entries rather than splicing them, so order is structural) and restores them *still selected*,
because the usual reason to undo is that the selection was wrong and needs adjusting, not discarding.
⌘Z / Ctrl+Z works while a note is live.

**Match state is a coloured dot plus a text label, never colour alone.** Satisfies the surface's
"signal hues carry state only" note, keeps the screen readable for colour-blind users, and sidesteps
a contrast problem: `--signal-break` as 13px text on `--surface-raised` measures 4.40:1, under the
4.5 threshold. As a dot it is a graphical object at 4.40:1 against a 3:1 requirement, and the label
beside it runs at 6.8:1.

**Amounts carry no colour.** Money out is prefixed with a minus and the column is right-aligned with
tabular figures. Colouring negatives red would spend `--signal-break` on decoration, which the
surface binding explicitly forbids. For the same reason I removed two signal-hue uses I had put in
first: a green rail on the batch note and amber warning text in the reconcile bar. Neither was a
match state, so neither had any business wearing a match-state hue.

**Hover pushes back, selection adds a rail.** Hover is `--surface-recessed` per the system. Selection
is the same recessed ground plus a 2px `--ink-primary` left rail and a filled checkbox, so the two
never read as the same thing. Neither has a transition — selection feedback is immediate, and rows
never animate on entrance.

**Mixed-sign sums are labelled "net".** A selection of −£14.20, −£8.40 and +£42.30 nets to £19.70;
showing that bare would misread as £19.70 of outgoings. The footer breaks the running total into
money in, money out, and net, with net at the largest ramp step as the number a person glances at.

**`ds-*` maps 1:1 to DESIGN.md.** The seven `ds-*` classes in the file are exactly the seven
components that file names. Layout scaffolding that isn't a system component (`screen`, `entry-list`,
`filter-row`) deliberately does *not* wear the `ds-` prefix, and the buttons are BEM elements of the
components that own them (`ds-reconcile-bar__action`, `ds-batch-note__action`) rather than a new
button primitive the system never defined.

**Keyboard, because this screen is used for hours.** Roving focus over rows with ↑/↓/Home/End, Space
to toggle, Shift+click and Shift+↑/↓ for ranges, Escape to clear. The grid carries `role="grid"` with
`aria-selected` per row, and bulk actions announce through a live region.

**The list keeps its height when a filter narrows it.** Filtering to 7 entries leaves empty space
below rather than collapsing the list, so the reconcile bar and footer stay put and rows do not jump
under the cursor as filters change.

# Open questions

**1. `APP-COLOR-restraint` blocks this screen, and I do not think the screen is wrong.** This is the
one thing I would put in front of the designer before shipping. `audit_taste` returns
`BLOCK — color hue clusters: #4f8f74 at 155deg; #c99a34 at 41deg` against the clause "one primary
color plus one accent". I measured the detector rather than guessing at it: collapsing the three
match-state hues to a single hue flips the verdict to PASS, so it is counting distinct non-neutral
hues and blocking at two or more.

But arena's own DESIGN.md ships exactly three signal hues, and this surface's binding note says
"signal hues carry state only, never decoration" — which presupposes they are *used*. Honouring the
rule literally means one hue for three match states on the screen whose entire job is distinguishing
those three states. I kept the three, on the reading that the project's token set and per-surface
binding are the more specific authority, and removed the two places where I had used a signal hue for
something that was not a match state. The finding is real and still outstanding.
**Which gives way — the app-level colour rule, or the three signal tokens?** If the rule wins I need
a non-hue encoding for match state (weight, position, glyph) approved before I build it.

**2. `APP-COLOR-restraint` also requires respecting system light/dark mode, and the token set is
dark-only.** There is no light value for any of the nine colours. I declared `color-scheme: dark` and
built the dark surface honestly rather than inventing nine light-mode values that would not be the
system's. **Is a light theme in scope, and if so who owns those token values?**

**3. Eight of the fourteen rules could not be machine-checked in this configuration.** Every
`arena`-scoped rule (`COLOR-tokens-only`, `COLOR-recessed-hover`, `TYPE-fixed-ramp`,
`NAME-system-vocabulary`, `CONTENT-chips-labelled`, `MOTION-no-list-entrance`,
`MOTION-selection-instant`, `A11Y-target-size`) returned `skipped_out_of_scope` when auditing HTML,
apparently because scope resolves through host matchers and this surface's binding has no hosts. I
verified all eight by hand instead and recorded the evidence: no bare values outside the token block;
hover is `--surface-recessed`; only ramp steps used and entry rows measure 13px; `ds-*` is 1:1 with
DESIGN.md; every chip has a text label; the only transition in the file is opacity on the batch note;
and every interactive element measures at least 44×44 live (rows, chips, buttons and checkboxes are
all 48). **Should the surface binding carry a host matcher so these run automatically?** Hand-checking
is not a substitute in a repo where this runs on every change.

**4. DESIGN.md names no typeface.** Every other visual value is tokenised, so this reads as a gap
rather than a deliberate omission. I used a system sans stack and put it behind a `--font-sans`
variable so it is one line to change. **What is the real typeface, and should it be a token?**

**5. Where do reconciled entries go?** The brief requires them to leave the unreconciled list, and
they do. Undo covers the most recent batch while its note is live; once dismissed, this screen offers
no route back. That felt right for one screen, but a real product almost certainly needs a reconciled
view and an audit trail. **Is un-reconciling an entry after the fact a supported action, and does it
belong on this screen or elsewhere?**

**6. The reconcile bar is the only bulk action.** Real reconciliation also needs "mark as
excluded/personal", "split", and "create a rule from this match", and `ds-reconcile-bar` would be
where they live. I built only what the brief specified. **What else belongs in that bar, and does it
stay a single primary action with a secondary menu, or become a row of equals?**

**7. Two microcopy calls worth a second opinion.** "Break" is used verbatim from the seed data as the
user-facing label; if the product has a fuller term for an unmatched entry it should be used here.
And the empty state reads "Every entry is reconciled." — deliberately flat, per the surface's
"no exclamation" voice note, where most products would celebrate. **Confirm both read right to the
people who use this daily.**
