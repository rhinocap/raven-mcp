---
colors:
  surface-base: "#0e1113"
  surface-raised: "#171b1e"
  surface-recessed: "#0a0c0e"
  surface-sunken: "#060809"
  ink-primary: "#e8eaec"
  ink-secondary: "#9aa3a9"
  ink-faint: "#5f686e"
  rule-hair: "#242a2e"
  rule-solid: "#39424a"
  signal-flag: "#d4573a"
  signal-hold: "#c08a2e"
  signal-clear: "#4a8f6d"
  focus-ring: "#6ea8d8"
type:
  ui-dense: 13
  ui: 14
  ui-lead: 16
  section: 20
  page: 28
space:
  hair: "2px"
  tight: "6px"
  snug: "10px"
  base: "16px"
  loose: "24px"
  slack: "40px"
motion:
  duration:
    snap: "90ms"
    base: "160ms"
    settle: "260ms"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
    exit: "cubic-bezier(0.4, 0, 1, 1)"
components:
  ds-queue-row:
    states: [hover, focus-within, selected, disabled]
    variants: [default, compact]
  ds-select-cell:
    aliases: [row-check]
    states: [hover, focus-visible, checked, disabled]
    variants: [default]
  ds-action-rail:
    aliases: [bulk-bar]
    states: [idle, armed]
    variants: [default]
  ds-status-pill:
    states: []
    variants: [flagged, held, cleared]
  ds-load-more:
    states: [hover, focus-visible, loading, exhausted]
    variants: [default]
  ds-undo-strip:
    states: [entering, visible, leaving]
    variants: [default]
  ds-empty-rest:
    states: []
    variants: [no-results, no-queue]
---

# Kettle — internal moderation console design brief (pre-gate round-4 fixture)

Kettle is the internal console a trust & safety reviewer sits in for six hours a
day. It is not a marketing surface and it is not a consumer product. Density,
legibility at speed, and a total absence of decoration are the whole brief. The
reviewer is tired, is working a queue, and is measured on throughput and on not
making irreversible mistakes.

## Surfaces

Four surface tokens, and they are not a lightness ramp — they are a depth
ramp. `--surface-base` is the page. `--surface-raised` is anything that floats
above it and takes focus. `--surface-recessed` is the *row hover and selection*
tint, deliberately darker than the page so a hovered row reads as pressed-in
rather than lifted. `--surface-sunken` is reserved for inert wells (empty
states, disabled regions). Using `--surface-raised` for a row hover is the
single most common mistake and it is wrong here.

## Type

Five steps, all of them small. `--type-ui-dense` (13) is the queue row's own
text — reviewers scan hundreds of rows and the row must not breathe. `--type-ui`
(14) is controls and labels. `--type-ui-lead` (16) is the selection count and
nothing else. `--type-section` (20) is a region heading. `--type-page` (28) is
used once per screen. There is no 18, no 24, and no display size; if a design
seems to want one, the hierarchy is wrong.

## Signal colour

Three status hues — `--signal-flag`, `--signal-hold`, `--signal-clear` — and
they carry meaning, so they are never decorative and never used for emphasis,
brand, or hover. `--focus-ring` is the only other non-neutral and belongs to
`:focus-visible` alone. Everything else in the console is neutral.

## Rules that hold everywhere

- Every visual value is `var(--token)`. No bare hex, no bare px outside motion
  distances, no font literals.
- Status is never encoded by colour alone — a `ds-status-pill` always carries
  its text label.
- No icon-only control anywhere a destructive or state-changing action lives.
  Icons may accompany a text label; they may not replace one.
- Every animation honours `prefers-reduced-motion`, and a state indicator is
  never clamped by that rule — only decoration is.
- Focus is always visible and never removed; `--focus-ring` at 2px offset 2px.
- 44px minimum hit target on anything clickable, including inside a dense row.

## Component vocabulary

The names below are the real ones in this system. They are not generic and a
build that invents `Checkbox`, `Toolbar`, `Toast`, or `Badge` is not using this
design system.

- `ds-queue-row` — one item in the review queue. `compact` variant drops the
  secondary metadata line.
- `ds-select-cell` — the per-row selection control. Owns its own 44px hit area
  independent of the row's height.
- `ds-action-rail` — the bulk action region. `armed` when a selection exists.
- `ds-status-pill` — the flagged/held/cleared marker. Text label mandatory.
- `ds-load-more` — the queue's paging control, with an `exhausted` terminal.
- `ds-undo-strip` — the post-action reversal affordance.
- `ds-empty-rest` — the two empty states, which are different: `no-results` is
  a filter that matched nothing, `no-queue` is a genuinely empty queue.
