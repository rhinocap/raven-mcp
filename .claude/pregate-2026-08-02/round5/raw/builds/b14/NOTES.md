# Approach

`compose_build_prompt` is the only tool this arm exposes. Called with
`profile: ledger`, `project: arena`, `surface: reconciliation review screen`, it returned the
grounding half: the token set (colors / type / space / motion by name), five taste decisions,
ten active Decision Graph decisions with their rejected alternatives, three prohibitions, one
contested decision, and the A1–A7 acceptance criteria. Everything below is built to that.

The response also set `skeleton_required: true` and asked for a Structure/States skeleton on a
second call. I derived one and called back. The skeleton's own lint passed after I discovered
its shape empirically (`structure` as a single `StructureNode` root with `node_id` / `emphasis`
1–3 / `density` compact|default|roomy; `states` as `{ initial, states[], transitions[] }` with
`kind` on each transition; an optional `provenance[]` with `kind` pixel|note|pattern|inferred),
but every lint-clean skeleton I sent — minimal through full — then died inside the tool with
`TypeError: Cannot read properties of undefined (reading 'toLowerCase')`. About twenty shaped
attempts, all the same. I did not go around the tool to find the schema: the CLI stub forwards
into a `pregate` directory this arm is forbidden to read, so I stopped there and built from the
grounding half, which is complete on its own. The skeleton I derived is the structure below.

Build is one self-contained `index.html`: no network, no build step, vanilla everything, opened
from `file://`. Verified in headless Chromium at 1440×900 (see the end of this section).

Structure, in document order: header · filter chips · entry table (sticky header row, 10 rows a
page) · numbered pager · reconcile bar · undo note · pinned total footer. States modelled:
nothing selected · partial selection (header control mixed) · whole page selected · batch
applied · no entries match the filters · nothing left to reconcile.

What I could and could not check. The acceptance criteria name `review_diff`, `talon_scan`,
`audit_tap_targets`, `audit_contrast` and `audit_taste`; none of them is reachable from this arm,
so **A1, A2, A3, A4 and A7 are unverified by tool**. I measured the mechanical ones myself in the
browser instead, and those results are:

- No hex, no `px`, and no font-family literal anywhere outside the `:root` token block —
  grepped; all lengths are `rem`, all colours `rgb()`. (Stands in for A1/A2, not equal to it.)
- Every `button` and `input` hit area ≥ 44×44 CSS px — measured on every control in the default
  and post-interaction states: zero under. (Stands in for A3.)
- Text contrast ≥ 4.5:1 — computed for every text-bearing element against its resolved
  background: zero under. (Stands in for A4.)
- Entry rows are the same height resting, hovered and selected: 45px in all three.
- Seed data: all 24 entries render verbatim, in the given order, across the three pages.
- Running total £12,796.99 for 24 entries, checked against a hand sum of the seed amounts.
- Reconcile → 10 removed, total and count update, note reads "Undo — 10 reconciled"; undo
  restores all 10 to their original positions and the total to £12,796.99.
- No console errors, no page errors. Whole screen fits 1440×900 without scrolling
  (document height exactly 900 with the undo note present).

A6 (semantic roles and live regions) is agent-asserted by the criteria themselves: `role="group"`
on each filter facet, `aria-pressed` on chips, `aria-selected` on rows, native `indeterminate` on
the page-select control, `aria-current="page"` in the pager, `aria-live="polite"` on the selection
count, and `role="status"` on the undo note.

# Decisions

Settled by the design system and built to as given — not re-opened: 6px filled signal dot with
the state word beside it in `--ink-secondary` and no tooltip; undo copy affordance-first
("Undo — 7 reconciled"); the note never auto-dismisses and shows no countdown; total footer
pinned to the viewport; amount column right-aligned with its right edge a fixed `--space-column`
from the row edge; reconcile bar below the list in flow; no confirmation dialog; numbered pager;
multi-select chips that survive a page change; negatives in `--ink-primary` with a leading minus;
row height constant across states; mixed header select control; no shift-drag range selection.

Calls I had to make myself:

1. **Token values are materialised in one `:root` block.** The tool gave token *names* only, and
   the page must open from disk with no network, so the values had to be written somewhere. They
   are all in a single commented token layer at the top; every rule after it uses `var()` only.
   The values themselves are my reading of the names, not the store's — swap the block and the
   page re-skins. If A1's `review_diff` counts that block as added lines, it will flag it; the
   alternative was a page with no colour at all.
2. **Five local primitives are not in the design system**, and are flagged as such in the file:
   `--font-sans`, `--hairline-width`, `--marker-dot` (the 6px from the marker decision),
   `--control-min` (44px, from A3), `--row-height`, `--page-max`, `--radius`, and three column
   widths. They belong in the system; I could not add them there from this arm.
3. **Two filter facets, not one.** The brief asks for filtering by match state; the multi-select
   decision's own reasoning is about compound questions ("needs review AND over a threshold"),
   which a single state facet cannot express — three state chips OR'd together only ever widen.
   So there is a State facet (Match / Review / Break) and an Amount facet (Money in / Money out /
   £500 and over). Within a facet the chips are OR; across facets they are AND. That is what
   "narrows further" means with more than one facet in play.
4. **10 entries a page**, giving three pages from 24 — enough that the pager is doing real work,
   and it keeps the reconcile bar, the undo note and the total all above the fold at 1440×900.
5. **Selection persists across pages and across filter changes.** The decision that rules out
   drag-selection does so because selections must survive a page boundary, so they do. When the
   selection includes entries not on screen the bar says so: "12 selected · 3 not in view". The
   header control still acts only on the current page, as the brief requires.
6. **Changing a filter returns you to page 1**, and does not clear the selection. The decision
   protects filters from a page change, not the reverse; landing on a page that no longer exists
   is worse than the reset.
7. **The undo slot is always reserved** (an empty 44px band under the reconcile bar), so applying
   a batch never shifts the page under the cursor — the same reasoning as the constant row height.
8. **The undo note ends on the next action**: any selection change, filter change, page change,
   or a second reconcile. It never expires on a timer, and there is no countdown. Undo restores
   the exact batch to its original positions and selects nothing.
9. **The footer total is the whole unreconciled balance, not the filtered view** — it is the
   number the task drives to zero, so a filter must not move it. When a filter is active, the
   filter row carries the view count instead ("Showing 11 of 24").
10. **The footer figure is not a live region.** The undo note (`role="status"`) already announces
    every change that moves the total; making both live would announce the same event twice.
11. **Rows are selected by checkbox or by clicking anywhere in the row.** Keyboard operation goes
    through the checkboxes, which are real focusable inputs; the row click is a mouse convenience
    only, so nothing is keyboard-unreachable.
12. **Dates render as "2 Jul 2026"** rather than a numeric format — unambiguous, and tabular
    figures keep the column aligned.

# Open questions

1. **"Break" as the label — unresolved, and deliberately left as it is.** `dec_msdyq34d_bkqq` is
   contested: half the pilot users read Break as an error state rather than an accounting term,
   and "Unmatched" tested clearer but vaguer. I built the active label ("Break", with the rose
   signal dot) and did not quietly switch it. It needs a product-owner call, and the choice has a
   knock-on: the filter chip carries the same word, so whatever is decided has to change in two
   places and in whatever the import pipeline names the state.
2. **Token values.** I invented the nine colour values, five type steps and four space steps from
   their names. Someone with the store needs to diff my `:root` block against the real DESIGN.md
   values before this goes anywhere near a real build.
3. **The second facet is my invention.** Money in / Money out / £500 and over is a plausible
   reading of "compound questions", but the £500 threshold in particular is a guess. A designer
   should say what the real second axis is — amount, counterparty, age of entry, or something the
   bookkeeper asks for that I have not thought of.
4. **Reconciling entries that are selected but not on screen.** I allowed it, and I flag it in the
   bar ("3 not in view"). It is reversible, so it follows the no-dialog decision — but it is the
   one place on this screen where the action reaches past what the person can see, and it is worth
   a designer's opinion.
5. **What a page of 300 looks like.** The decisions are written for a bookkeeper working hundreds
   of rows; with 24 seed entries I could not test whether 10 rows a page is right, or whether the
   pager needs first/last controls or a jump field once there are thirty pages.
6. **`compose_build_prompt`'s second pass is broken for this arm** (`toLowerCase` on undefined
   after a clean skeleton lint). Whatever that pass would have added to the brief — component
   templates, per-node guidance — is missing from this build, and neither I nor the reviewer can
   see what it was.
