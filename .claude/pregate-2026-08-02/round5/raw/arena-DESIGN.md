---
colors:
  surface-base: "#101215"
  surface-raised: "#171a1e"
  surface-recessed: "#0b0d0f"
  ink-primary: "#e6e8ea"
  ink-secondary: "#9aa1a8"
  signal-match: "#4f8f74"
  signal-review: "#c99a34"
  signal-break: "#cf5b45"
  hairline: "#242a30"
type:
  xs: 12
  sm: 13
  md: 15
  lg: 19
  xl: 26
space:
  tight: "8px"
  base: "16px"
  wide: "24px"
  column: "56px"
motion:
  duration:
    fast: "110ms"
    base: "180ms"
  easing:
    standard: "cubic-bezier(0.2, 0, 0, 1)"
components:
  ds-entry-row:
    states: [hover, focus-visible, selected]
  ds-amount-cell:
    states: [default]
  ds-match-marker:
    states: [default]
  ds-reconcile-bar:
    states: [idle, armed]
  ds-filter-chip:
    states: [default, hover, active]
  ds-batch-note:
    states: [default]
  ds-total-footer:
    states: [default]
---

# Ledger — reconciliation review

The surface a bookkeeper works in when a bank feed has been imported and the entries
need to be matched against the books. It is a working screen, not a dashboard: the
person using it is going down a list making the same judgement several hundred times,
and the design exists to make that repetition cheap.

## Tokens

Every visual value in this system is a token. `--surface-base` is the page,
`--surface-raised` is anything sitting on it, `--surface-recessed` is anything the
page has pushed back. `--ink-primary` is text you read, `--ink-secondary` is text you
skim. The three signal hues carry state and nothing else — they are never decoration
and never a background for body text.

The type scale is five steps and it does not grow. The space scale is four steps;
`--space-column` exists specifically for column geometry and is not a general gap.

## Components

- `ds-entry-row` — one imported transaction. Carries a date, a description, a match
  marker, and an amount. This is the unit of work.
- `ds-amount-cell` — the money on an entry row.
- `ds-match-marker` — the confidence signal for whether this entry found its match.
- `ds-reconcile-bar` — the bulk action surface. Idle until entries are selected, armed
  once they are.
- `ds-filter-chip` — narrows the list.
- `ds-batch-note` — what the surface says after a bulk action has been applied.
- `ds-total-footer` — the running total of what is still unreconciled.

## What this file is not

This file is the system's vocabulary: tokens, component names, and the states each
component is expected to have. It does not record the judgement calls — which of two
reasonable treatments was chosen for a given component, or why. Those live in the
taste decisions and in the project's Decision Graph, and they are what turn this
vocabulary into a specific screen.
