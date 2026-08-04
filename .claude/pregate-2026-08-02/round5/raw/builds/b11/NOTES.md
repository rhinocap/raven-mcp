# Approach

The design system was read through the tools, not the filesystem: `read_design_md`
returned the `arena` token set and the seven `ds-*` component definitions,
`get_taste_profile` returned the `ledger` profile (14 rules, 8 of them scoped to
`arena`) and the binding for the `reconciliation review screen` surface, and
`audit_taste` was run against the finished HTML.

The screen is built as a single flex column at 1440x900 that never scrolls in any
state. `ds-entry-row` is the unit of work and everything else is chrome arranged
around it: filters above, `ds-reconcile-bar` directly above the list so the action
sits next to what it acts on, `ds-batch-note` under the bar where the result of that
action appears, `ds-total-footer` pinned to the bottom. The list is the flexible
child, so when the batch note opens the list frame absorbs the height rather than
the page shifting under the pointer — on a screen worked for hours, a row that moves
while being clicked is the expensive failure.

Every token from `DESIGN.md` is declared in `:root` and every visual value is a
`var()` reference. Three primitives the system does not carry were added as derived
tokens and are listed under Decisions.

Verification was a 56-check Chromium harness against the file at 1440x900, plus
eyes-on the rendered screens. It asserts the 24 seed entries render verbatim and in
order across all three pages, the totals (`£12,796.99` net, in `£15,814.30`, out
`−£3,017.31`), bulk select / reconcile / undo round-tripping to the exact starting
total, filter and search composing with paging and selection, no external requests,
no page scroll at 1440x900, and the measurable taste rules — every interactive
target at least 44x44, no font size outside the five-step ramp, entry-row text at
the 13px step, no bare hex/rgb/px outside `:root`, no transition on the row
background, no entrance animation on rows, hover resolving to `--surface-recessed`,
and no `ds-*` class outside the seven in `DESIGN.md`. All 56 pass.

`audit_taste` returns **BLOCK, 1 finding** on the finished build. It is a real
conflict in the configuration, not a defect I chose to leave: see Open questions.

# Decisions

**Pagination, eight per page, rather than a scrolling list.** The brief calls for a
header control that acts on "the whole page of entries", which only has a bounded
meaning if pages exist. Eight gives three even pages of 24 and — measured, not
estimated — is the largest page size where the full screen still fits 900px with the
batch note open, so no state ever introduces a scrollbar.

**Selection is scoped to the current page and the current filter.** Changing page,
changing a filter chip, or typing in search clears the selection. The alternative is
selection that survives out of view, which means a bulk action in a bookkeeping tool
can reconcile entries the person cannot see. The reconcile bar therefore always
names exactly what it will act on ("8 entries selected · net £5,348.27") and that
statement is always visible on screen.

**The batch note persists; it does not time out.** `ds-batch-note` states the count
and the net of the last batch and holds `Undo` until another batch replaces it. A
timed dismissal makes reversibility a race, which is the wrong trade on a working
screen. Undo is a full stack — repeated undos walk back batch by batch, and the note
reports the depth once more than one batch exists.

**Filters compose rather than switch.** The three `ds-filter-chip` controls toggle
independently (none active means all), and a description search narrows within them.
Each chip carries its visible label and a live count that reflects what is still
unreconciled, so the counts fall as work is done.

**The running total ignores the filter.** `ds-total-footer` always reports the whole
unreconciled set, because that is the number being worked down. When a filter is
active a second line reports the in-view subtotal, so the filtered figure is
available without the primary number moving.

**Amount sign is carried by the minus glyph, not by colour.** `DESIGN.md` states the
signal hues carry state and nothing else, and the surface binding repeats it. Money
direction is not match state, so `ds-amount-cell` stays `--ink-primary` throughout
and negatives are marked with a true minus sign under tabular figures.

**The row select control is drawn by hand.** A native checkbox ships a ~16x16 hit
rect, which fails `A11Y-target-size`. The input is `appearance: none` at 44x44 with a
16px mark drawn in `::before`, so the element's own rect satisfies the rule rather
than relying on the surrounding cell. The row is also a click target, and shift-click
selects a range.

**Hover and selection are both instant and do not collide.** Hover resolves to
`--surface-recessed` per `COLOR-recessed-hover`; selection resolves to
`--surface-raised` plus a 2px `--ink-primary` inset edge, so a selected row hovered
still reads as selected. No transition is declared on any row background, and no
entrance animation exists on list content. Motion is confined to chip hover at
`--motion-duration-fast`, and is disabled under `prefers-reduced-motion`.

**Three derived tokens were added**, each tied to a value the system already states:
`--hairline-width: 1px` (the weight of the existing `hairline` colour token),
`--edge-width` (twice that, for the selected-row edge and focus ring), and
`--target-min: 44px` (the number written into `A11Y-target-size`). Column geometry is
derived from `--space-column` by multiplication rather than by new values. The type
tokens are unitless in `DESIGN.md` and are written in px here because CSS requires a
unit; the five values are unchanged and no sixth was introduced.

**Layout wrappers use `l-*` classes, never `ds-*`.** `DESIGN.md` defines seven
components and `NAME-system-vocabulary` requires those names. Structural containers
are not components, so they are marked `l-*` rather than given invented `ds-*` names,
and pagination is an element of the list (`l-list__page-control`) rather than a new
component. The harness asserts no `ds-*` class exists outside the seven.

# Open questions

**1. `APP-COLOR-restraint` blocks the screen, and the block cannot be cleared without
breaking it.** `audit_taste` returns `BLOCK` with the evidence `color hue clusters:
#4f8f74 at 155deg; #c99a34 at 41deg` — it reads the signal hues as a second accent.
The detector was characterised directly: one signal hue passes, any two block. So the
only way to satisfy the rule is to render at most one of `match`, `review` and
`break` in colour, which contradicts `DESIGN.md` (three signal hues, `ds-match-marker`
is "the confidence signal") and the surface binding's own note that signal hues carry
state. The project layer was followed and the generic app-template rule was not. The
fix is a configuration change, not a code change: add a per-surface override
disabling `APP-COLOR-restraint` for `arena / reconciliation review screen`, or
rewrite the clause to exempt the declared signal set. This needs the profile owner.

**2. The same clause requires light/dark support and `arena` ships one palette.**
There are no light-mode tokens in `DESIGN.md`, and inventing them would violate
`COLOR-tokens-only`. The screen is dark-only. Either the system needs a light palette
or the clause needs narrowing for this surface.

**3. The eight `arena`-scoped rules were never machine-assessed.** With the surface
bound (`project: "arena"`), `audit_taste` returned all eight under
`skipped_out_of_scope`; without a project it returned them under `not_assessed`, with
the reason that no deterministic detector exists for those clauses. Either way, no
tool call verified them. They were verified instead by direct measurement in the
harness, listed under Approach. Whether the scope filter is behaving as intended is
worth confirming, because as configured the arena rules can never fire on the arena
surface.

**4. Cross-page batching is not supported.** Selection clears on page change, so a
batch cannot span pages. That was chosen deliberately over selection that acts on
off-screen entries, but the honest third option — persistent selection with the bar
stating "6 selected, 2 not in view" — is better than both and was not built because
it changes what the header control means. A product owner should settle whether a
batch is allowed to exceed one page.

**5. Text scaling is untested.** `APP-TYPE-floor` asks for respect for font-scale
settings; the type tokens are px, so browser font-size preference does not move them
(page zoom does). Expressing the ramp in rem would fix it but would restate the token
values as fractions, which reads as introducing new numbers. This needs a call on how
the ramp should be expressed.

**6. `--type-xs` (12px) sits below the 13px body floor.** It is used only for column
headers, eyebrows and chip counts — labels rather than body text — which is the
reading `TYPE-fixed-ramp` implies by naming 13px specifically for entry rows. If the
floor is meant to apply to every rendered string, those uses need to move to 13px.
