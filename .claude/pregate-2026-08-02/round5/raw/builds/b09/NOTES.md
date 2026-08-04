# Approach

Pulled the system through the tools before writing anything: `read_design_md` (project
`arena`) for the tokens, the seven `ds-*` component names and the intent statement
("a working screen, not a dashboard… the design exists to make that repetition cheap"),
`get_taste_profile` (`ledger`) for the fourteen rules — six generic app rules plus eight
scoped to `arena` — and the surface binding for `reconciliation review screen`
(voice: plain, second-person-free, no exclamation; density: a list read top to bottom
hundreds of times; restraint: signal hues carry state only).

The screen is one vertical stack at a fixed 1120px measure: title → `ds-filter-chip` row →
`ds-reconcile-bar` → `ds-batch-note` → `ds-entry-list` (sticky header row + scrolling body)
→ `ds-total-footer`. Everything except the list is fixed height; the list takes the
remaining space and scrolls, so the action surface, the undo affordance and the running
total are all permanently on screen no matter how far down the list the person is. Rows are
48px, eleven visible at 1440×900.

Markup is a `<ul>` of `<li class="ds-entry-row">`, each row a `<label>` wrapping a real
checkbox, so the checkbox's accessible name is the whole entry ("02 Jul 2026, Kingsway
Supplies Ltd, Matched, −284.50 pounds") and the visual column headers can stay decorative.
No table, no ARIA grid, no roving tabindex.

Verified in headless Chromium at 1440×900, opened from `file://`:

- 24 rows, no console errors, zero non-`file://` requests, `body.scrollWidth` 1440 (no
  horizontal overflow).
- Every `button`/`input` bounding rect ≥ 44×44 — measured, zero undersized.
- Every rendered font size ∈ {12, 13, 15, 19, 26}. The first measurement caught two leaks
  (a 13.333px UA default on form controls and 16px on `<html>`); both fixed by setting the
  family/size on the root and `font: inherit` on form controls, then re-measured clean.
- Contrast: description 14.2:1, secondary text (date, state label, column headers, footer
  label) 6.7:1, armed Reconcile button 15.3:1.
- Full flow driven: select one → select via row body → filter to Review with a selection
  held outside the filter → header select-all → Reconcile → Undo → shift-click range →
  reconcile everything → empty state → undo everything. Totals, chip counts, tri-state
  header control and the reconcile bar were asserted at each step and all reconcile.

`audit_taste` on the finished file returns **BLOCK** on one rule. Disposition below.

# Decisions

**Tokens.** The `:root` block is the only place a literal value appears; it is the
DESIGN.md frontmatter transcribed verbatim. Every use site is `var()` or `calc()`. Values
the system does not name are derived rather than invented: hairline is
`calc(var(--space-tight) / 8)`, the 48px minimum target is
`calc(var(--space-column) - var(--space-tight))`, the 1120px measure is
`calc(var(--space-column) * 20)`, column widths are multiples of `--space-column`. No new
type step and no new space step. Selected and hover tints are `color-mix()` over existing
tokens, never a new hex.

**24 entries.** Scroll, not pagination. Pagination would make "select all" ambiguous
(this page vs. all pages) on a screen whose whole job is bulk action, and it would put a
pager between the list and the total. The header control therefore acts on **every entry
matching the current filter**, not just the rows currently painted — for the default All
filter that is all 24.

**Filter and selection are independent, and the screen says so.** Filtering never clears
the selection. When a selection includes entries the current filter hides, the reconcile
bar states it: "2 selected entries are outside the current filter". Reconcile then applies
to the whole selection, including those. The alternative — silently dropping hidden
entries from the action — is the same bug with worse consequences in a bookkeeping tool.

**Reconcile is reversible as a stack, not as a single toast.** Each bulk action pushes a
batch; `ds-batch-note` always shows the top of the stack with its count and net value, and
Undo pops it and restores those entries to their original positions. Undo twice and both
batches come back. Focus moves to Undo immediately after a reconcile, so the reversal is
one keystroke away from the action.

**Breaks are flagged, not blocked.** A break means the feed and the books disagree. When a
selection contains any, the bar says "1 break in the selection" next to the button. It does
not prevent the action — see Open questions.

**Amount column carries no currency symbol; totals do.** The account is single-currency
(stated in the subhead), and repeating £ twenty-four times is noise in a column being
scanned. Money out is a true minus sign (−), money in is unsigned. Amounts are never
hue-coded: the signal hues carry match state and nothing else, per the binding.

**The largest type on the screen is the unreconciled total** (26px, the top of the ramp).
The screen title is 19px. On a working screen the number is the thing being watched.

**Hover pushes back** (`--surface-recessed`), including on a selected row, which mixes the
selection tint into the recessed surface rather than lifting. Selection is marked by a 2px
inset `--ink-primary` rule on the left edge plus a neutral tint — no hue, since hue is
reserved for state.

**No motion on the list.** Rows have no transition at all, so selection feedback is
immediate and nothing animates in on filter change or undo. Transitions exist only on the
filter chips, the reconcile bar's idle→armed shift, and the buttons, at the system's
110/180ms and standard easing; all are dropped under `prefers-reduced-motion`.

**Keyboard.** Arrow up/down, Home and End move between rows, Shift+arrow extends the
selection, Space toggles natively, Shift+click selects a range. Focus survives re-render.

**Copy.** No second person anywhere, no exclamation, no filler: "No entries selected",
"Reconcile", "9 entries reconciled · net £455.37", "Undo", "No entries in this filter.",
"Nothing left to reconcile." Every filter control carries a visible text label.

**Dispositioned audit finding — APP-COLOR-restraint (block), kept as-is.** The detector
reads the three signal hues as multiple accent hues: `#4f8f74` at 155°, `#c99a34` at 41°,
plus `#cf5b45`. Those three are `signal-match`, `signal-review` and `signal-break` from
this project's own DESIGN.md, and the bound surface's design note ("signal hues carry state
only, never decoration") presupposes they exist and are used for state. Collapsing them
would delete the match signal this screen is built to read. APP-COLOR-restraint is an
unscoped app-template rule; the eight rules the profile actually scopes to `arena` sanction
this palette. I did not silence the finding — it is real and it is overruled by the
project-scoped system, which is a call the profile owner should ratify (see below).

**What the audit could not check.** All eight `arena`-scoped rules came back
`skipped_out_of_scope` for both `html` and `url` targets — the surface binding has an empty
`hosts` list, so scope never resolves and the rules that actually govern this build were
never evaluated by the tool. Four more (`APP-TYPE-floor`, `APP-SPACING-rhythm`,
`APP-VOICE-concise`, `APP-MOTION-restraint`) returned `not_assessed` — no deterministic
detector — and `APP-TAP-targets` needed delegated `audit_tap_targets` results that this
configuration does not expose. I verified those by direct measurement instead (font ramp,
target sizes, contrast, transition properties) rather than treating a PASS-shaped verdict
as coverage.

# Open questions

1. **Should `break` entries be bulk-reconcilable at all?** A break is an unexplained
   difference between the feed and the books. This build warns and allows, on the reasoning
   that the person may legitimately be clearing known differences. A product owner may want
   them excluded from bulk action entirely, or gated behind a per-entry confirmation. This
   is the one decision here with real money consequences and it should not be settled by a
   build.

2. **Where do reconciled entries go?** The brief requires them to leave the unreconciled
   list and be undoable. It does not say whether a "Reconciled" view exists. Undo is
   currently the only route back, and only within the session — once the page is reloaded
   the batches are gone. If reconciliation is meant to be auditable after the fact, this
   screen needs a sibling view and the undo window needs a defined lifetime (session? until
   period close? never?).

3. **APP-COLOR-restraint needs a per-surface override.** The rule conflicts head-on with
   the arena token set on both halves. On hue: the design system defines three signal
   colours and the surface binding tells me to use them for state. On light/dark: the rule
   says "respects system light/dark mode", but arena ships a single dark palette and
   COLOR-tokens-only forbids inventing the light values it would take to honour that. I set
   `color-scheme: dark` and stopped there rather than invent nine tokens. Both halves want
   either an `overrides` entry on the `reconciliation review screen` binding or a light
   palette added to DESIGN.md — the profile owner's call, not mine.

4. **Should the entry list keep a fixed height when a filter returns few rows?** Filtering
   to Break leaves four rows in a panel sized for eleven, so a large empty area sits above
   the footer. I chose stable geometry — the total and the action bar never move — over a
   list that shrinks to its content. On a screen used for hours I think stillness wins, but
   it is a taste call worth putting in front of the designer with both versions on screen.

5. **Select-all under a filter is unlabelled beyond its `aria-label`.** The header control
   reads "Select every entry in view" to assistive tech but shows only a checkbox, because
   the list header's first column is 56px wide. If the intended semantics are ever anything
   other than "everything the filter currently admits", that needs visible words, and the
   header row needs a different shape to hold them.
