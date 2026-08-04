# Approach

I read the system through the Raven tools before writing anything, because the brief's
"how you handle that is a design decision" turned out to be already decided in several
places.

What the tools returned:

- `read_design_md` / `inventory_design_system` — the `arena` DESIGN.md: 9 colour tokens,
  a five-step type ramp, a four-step space scale, two motion durations and one easing,
  and seven `ds-*` components with their expected states.
- `get_taste_profile` (`ledger`) — 14 rules, 6 global and 8 scoped to `arena`, plus the
  binding for the `reconciliation review screen` surface: voice `plain, second-person-free,
  no exclamation`; density `a working list, read top to bottom hundreds of times`;
  restraint `signal hues carry state only, never decoration`.
- `list_taste_decisions` — 5 recorded judgement calls (marker shape, batch-note copy,
  batch-note persistence, footer pinning, amount-column geometry).
- `decision_list` — 10 active Decision Graph nodes for scope `ledger`. `gap_scan` then
  surfaced an eleventh that `decision_list` does not return because it is not active:
  `dec_msdyq34d_bkqq`, status `contested`, on the word "Break". `decision_get` gave the
  contest reason.

Between them those 26 records answered most of what the brief left open — pagination
style, whether there is a confirmation dialog, where the bulk bar sits, how negatives
render, whether the header control has a mixed state, what the undo copy says. So the
build is mostly transcription, and the design work was in the gaps: the second filter
dimension, the page size, what the footer shows while a filter is on, and what happens to
a selection that spans pages.

Structure is a fixed-height shell at 1440×900: page head, filter bank, list header, the
entry list as the only scrolling region, pager, batch note, reconcile bar, total footer.
Everything below the list is `flex-shrink: 0`, so the list absorbs any change and the
reconcile bar and the total never move.

Verified before writing this file:

- `audit_page` on the built HTML — 100 / A, 13 of 14 checks pass, 0 errors.
- `audit_taste` (profile `ledger`, project `arena`, surface bound) — one BLOCK, discussed
  under Open questions; it is a conflict between a global rule and the project's own
  token set, not a defect in the build.
- Headless Chromium at 1440×900, driving the real page: measured row heights, the amount
  column inset, every interactive target, and the fonts actually computed; then clicked
  through single select, select-page, mixed state, reconcile, undo, clear, each filter
  combination, both page directions, the filtered-empty state and the all-reconciled
  state. No console errors. Amount right edge is exactly 56px from the row edge on all
  10 rows, on the list header and on the footer total. Every row is exactly 48px in every
  state. No interactive target under 44×44. Only three font sizes ever compute: 13, 15
  and 19px.

# Decisions

Bound by a record, implemented as stated:

1. **Numbered pager, 3 pages.** `dec_msdyq34b_d90i` rules out infinite scroll and
   load-more. Page size is 10, which is mine — it is the largest page that leaves the
   footer, bar and pager on screen at 900px once the batch note is present.
2. **Reconcile applies immediately.** No dialog, no arm-then-apply (`dec_msdyq34a_tfum`).
   The bar is `idle` when nothing is selected and `armed` when something is.
3. **Reconcile bar below the list**, in flow, after it in document order
   (`dec_msdyq34a_04p3`). Nothing floats over the list.
4. **Batch note reads "Undo — 7 reconciled"** — affordance first, em dash, no period, no
   second person (`dec_2`). It never auto-dismisses and shows no countdown (`dec_3`).
5. **Total footer pinned**, always visible, list scrolls in its own region behind it
   (`dec_4`). Rejected alternatives — footer at the end of the list, hide-on-scroll,
   total in the header — are all absent.
6. **Amount column right-aligned at a fixed 56px (`--space-column`) from the row edge**
   (`dec_5`). Every band on the screen carries the same right inset, so the list header
   label and the footer total sit on the same edge as the figures. Measured, not assumed.
7. **Negatives are `--ink-primary` with a leading minus**, never a signal hue, never
   parenthesised (`dec_msdyq34c_we0s`).
8. **Match marker is a filled 6px dot with no text of its own**; the state word sits
   beside it in `--ink-secondary` (`dec_1`). No `title`, no tooltip, no popover
   (`dec_msdyq34c_64s3`).
9. **Row height is identical resting, hovered and selected** (`dec_msdyq34c_bmr7`).
   Selection is carried by background and a 2px left rule drawn as a pseudo-element, so
   it cannot change layout.
10. **Header control reports `mixed`** when part of the page is selected
    (`dec_msdyq34c_0pco`). It is `role="checkbox"` with `aria-checked="mixed"`.
11. **No shift-click or drag range selection** (`dec_msdyq34d_jfkp`). Rows toggle by
    click or by Space on the focused row.
12. **Filter chips are multi-select and survive a page change**
    (`dec_msdyq34b_8daa`, `dec_msdyq34b_zxp6`).
13. **Hover is `--surface-recessed`, never `--surface-raised`** (`COLOR-recessed-hover`).
    Selection is the raised one. Hover is scoped with `:not([aria-checked="true"])` so
    raised is never assigned to a hover state even indirectly.
14. **Every visual value is a token** (`COLOR-tokens-only`). Every literal in the file is
    in `:root` and nowhere else; `audit_page` counts 0 bare hex outside it.
15. **`ds-*` component names only** (`NAME-system-vocabulary`). No Table, Grid, Chip,
    Toast, Modal or Snackbar anywhere in the markup, CSS or script.
16. **No entrance animation on the list, no transition on the selected background**
    (`MOTION-no-list-entrance`, `MOTION-selection-instant`). The only transitions on the
    page are colour and border on chips, pager buttons and the two bar buttons, at
    `--motion-duration-fast`. Selection changes are a class-free attribute flip.
17. **Every filter control carries a visible text label** (`CONTENT-chips-labelled`).
    Nothing is icon-only.

Mine, where nothing in the system decided it:

18. **The second filter dimension is an amount threshold.** `dec_msdyq34b_8daa`'s
    rationale is explicit that the real question is compound — "needs review AND over a
    threshold" — and a state-only chip set cannot express that, because one entry has one
    state. So chips within State union together and the Amount group intersects with
    them. The threshold is £500, which I picked; see Open questions.
19. **Chips carry live counts** of unreconciled entries matching them. On a screen whose
    whole job is triage, the count is what makes the chip worth reading before clicking.
20. **Selection persists across pages, and the bar says when it does.** The graph rejects
    drag-select precisely because it produces "selections that silently do not survive the
    page boundary", so silently dropping a selection on page change would be the same
    failure by another route. The bar appends "4 not in view" whenever part of the
    selection is off the current page, so the count in the button is never a surprise.
21. **Undo restores the entries still selected.** It returns the surface to its exact
    pre-action state, and the highlighted rows are the clearest possible statement of what
    came back. One level of undo — the last batch only.
22. **The note is cleared by a page change or a filter change, not by selecting rows.**
    `dec_3` ends the note at "the next action or a navigation". Building the next
    selection is not yet an action, and clearing the undo the moment someone starts the
    next batch would be the expiry that decision exists to prevent.
23. **The footer total always shows every unreconciled entry, filter or no filter.** It is the
    number the task drives to zero (`dec_4`). When a filter is on, a second, quieter
    readout — "In view · 11 · £2,546.87" — appears next to it rather than replacing it.
24. **Row height is 48px, not 44.** 44 is the accessibility floor (`A11Y-target-size`);
    48 clears it and stays on the 8pt grid (`APP-SPACING-rhythm`). Same for chips, pager
    buttons and both bar buttons.
25. **The primary action is `--ink-primary` on `--surface-base`, not a signal hue.** The
    binding says signal hues carry state only, never decoration, and an action is not a
    state.
26. **The `--type-xs` (12px) step is left unused.** It exists in the ramp but sits below
    the 13pt body floor (`APP-TYPE-floor`), so nothing on this screen uses it.
27. **Geometry tokens were added** for values DESIGN.md does not name — `--size-row`,
    `--size-target`, `--size-marker`, `--size-box`, `--size-hairline`, `--size-focus`,
    `--size-accent`, `--size-shell`, the four column widths, two radii, two line heights
    and one tracking value. They are grouped and commented as an extension. Adding them
    was the only way to satisfy "every visual value is `var(--token)`" without inventing
    colours or type steps, which the rules do forbid.
28. **Container names were added** for bands the component list does not cover:
    `ds-shell`, `ds-band`, `ds-page-head`, `ds-filter-bank`, `ds-list-head`, `ds-list`,
    `ds-pager`, `ds-button`. They follow the existing prefix and avoid every banned word,
    but they are not in DESIGN.md; see Open questions.
29. **Toggling a selection does not rebuild the list** — only the affected rows' marks,
    the header control and the bar change. On a screen worked for hours, nothing under
    the cursor should move and keyboard focus should never be thrown away.

# Open questions

1. **"Break" is contested and I shipped it anyway.** `dec_msdyq34d_bkqq` is `status:
   contested`: half the pilot users read it as an error state rather than an accounting
   term, and "Unmatched" tested clearer but vaguer. I used "Break" because the decision is
   the one on record and no successor exists, and because the marker's colour already
   reads as alarm to some people — which is probably part of why the word does too. This
   needs a call before shipping, and it is cheap: the label is one entry in `STATE_WORD`.
   Worth noting the contest is only about the row word; the filter chip inherits it.

2. **`APP-COLOR-restraint` blocks this screen and cannot be satisfied as written.**
   `audit_taste` returns one BLOCK: "One primary color plus one accent", evidence
   `#4f8f74 at 155deg; #c99a34 at 41deg`. Those are two of the three signal hues that
   DESIGN.md defines and that `dec_1` requires the marker to use. The global rule and the
   project's own token set contradict each other. I followed the project system, because
   the surface binding says signal hues carry state, and dropping them would remove the
   screen's only peripheral cue. Either the rule needs an `arena` override exempting the
   signal group, or the marker needs a non-hue treatment. Not something to decide inside
   a build.

3. **The same rule asks for system light/dark support, and there is no light palette.**
   DESIGN.md names one value per colour token and all of them are dark. Deriving light
   counterparts would mean inventing nine tokens, which `COLOR-tokens-only` and
   `TYPE-fixed-ramp` are pointed directly at. The screen is dark-only. If light mode is
   real, the token set needs a second set of values first.

4. **£500 is my number.** The threshold chip exists because `dec_msdyq34b_8daa`'s
   rationale requires a second dimension, but no record says what the threshold is or
   whether it should be fixed at all. £500 splits this data usefully (9 of 24) and nothing
   more. Alternatives worth considering: a value the person sets, a "money in / money out"
   pair instead, or a materiality figure that comes from the account.

5. **The pager and the page bands have no `ds-*` name.** DESIGN.md names seven components
   and a pager is not one of them, yet `dec_msdyq34b_d90i` requires one. Same for the
   shell, the page head, the filter bank and the list header. I named them by extension
   rather than reaching for a banned word, but they should either be added to DESIGN.md or
   renamed to whatever they are already called elsewhere in the product.

6. **Page size is unrecorded.** 10 is what fits at 900px with the batch note showing. On a
   shorter viewport it is wrong, and on a taller one it wastes the screen. A recorded
   decision — fixed 10, fixed 25, or fit-to-viewport — would settle it.

7. **Nothing says what happens to a selection that spans pages when a filter removes some
   of it.** Currently the selection survives and the bar reports how much of it is out of
   view, so reconciling still acts on entries the person can no longer see. That is
   defensible and it is stated, but it is the one place on this screen where the action is
   larger than the view, and it deserves a real decision rather than my default.

8. **There is one level of undo.** `dec_3` says the note persists until the next action;
   it does not say whether the action before last is still reversible. Reconciling twice
   in a row currently makes the first batch permanent with no warning. If batches are
   often small and quick, a stack would be more honest than a single slot.

9. **`audit_page` warns there is no `clamp()` for fluid sizing.** I did not add any:
   `TYPE-fixed-ramp` says the scale is five steps and does not grow, and a fixed working
   screen at 1440×900 has nothing to interpolate between. Flagging it so the warning is
   not read later as an oversight.
