// Seeds the round-5 fixture store THROUGH THE REGISTERED TOOLS, never by writing JSON
// by hand. Hand-written store files are how you get a fixture whose shape the real
// readers disagree with, and then spend a round measuring the disagreement.
//
// The store lives OUTSIDE the repository, at a path that appears in no builder prompt
// and in no tool output (raven-cli.mjs redacts absolute paths). Round 4's fixture sat
// inside the round directory and its own treatment prompt cited the path, so every
// arm-A build simply opened it. Round 4's arena is now public in git as well, which
// makes an in-repo round-5 fixture a fixture sitting next to an answer key.
//
//   node seed5.mjs        (idempotent-ish: wipes the taste + decisions stores first)

import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STORE = '/Users/accunliffe/.pregate-r5-8f3a2c';
const REPO = '/Users/accunliffe/projects/raven-mcp';
const ARENA = join(STORE, 'arena');

for (const d of [join(STORE, 'taste'), join(ARENA, '.raven', 'decisions')]) {
  if (existsSync(d)) rmSync(d, { recursive: true });
  mkdirSync(d, { recursive: true });
}

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_TASTE_HOME = join(STORE, 'taste');
process.env.RAVEN_DECISIONS_HOME = join(ARENA, '.raven', 'decisions');
process.env.RAVEN_NO_CONSULTATION_TRACE = '1';

const { buildServer } = await import(`${REPO}/dist/index.js`);
const { FsTasteStore } = await import(`${REPO}/dist/taste-store.js`);
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const tools = server._registeredTools;

const call = async (name, args) => {
  const res = await tools[name].handler(args, {});
  const text = res?.content?.[0]?.text ?? '';
  if (res?.isError) { console.error(`${name} FAILED: ${text}`); process.exit(1); }
  try { return JSON.parse(text); } catch { return text; }
};

const PROFILE = 'ledger';
const PROJECT = 'arena';

// ── Profile rules. These are the CONTROL surface: reachable by every arm through
// get_taste_profile, so they must not encode any discriminating fact.
await call('create_taste_profile', {
  name: PROFILE,
  template: 'app',
  rules: [
    { rule_id: 'COLOR-tokens-only', clause_text: 'Every visual value is var(--token). No bare hex, no bare rgb(), no bare px outside motion distances.', category: 'color', severity_default: 'block', negative_prompt: 'Do NOT write literal color, size, or font values. Reference the design tokens.', scope: PROJECT },
    { rule_id: 'COLOR-recessed-hover', clause_text: 'A row hover pushes the row back, it does not lift it.', category: 'color', severity_default: 'warn', negative_prompt: 'Do NOT use --surface-raised for a row hover state. Hover is --surface-recessed.', scope: PROJECT },
    { rule_id: 'TYPE-fixed-ramp', clause_text: 'The type scale is the five steps in DESIGN.md and does not grow. Entry-row text is the 13px step.', category: 'typography', severity_default: 'block', negative_prompt: 'Do NOT introduce a font size outside the five-step ramp.', scope: PROJECT },
    { rule_id: 'NAME-system-vocabulary', clause_text: 'Components use the ds-* names from DESIGN.md.', category: 'naming', severity_default: 'block', negative_prompt: 'Do NOT invent names like Table, Grid, Chip, Toast, Modal, or Snackbar. Use the ds-* vocabulary.', scope: PROJECT },
    { rule_id: 'CONTENT-chips-labelled', clause_text: 'Every filter control carries a visible text label.', category: 'content', severity_default: 'block', negative_prompt: 'Do NOT ship an icon-only filter control.', scope: PROJECT },
    { rule_id: 'MOTION-no-list-entrance', clause_text: 'List content appears; it does not animate in.', category: 'motion', severity_default: 'warn', negative_prompt: 'Do NOT animate entry rows on entrance — no fade-in, no stagger, no slide.', scope: PROJECT },
    { rule_id: 'MOTION-selection-instant', clause_text: 'Selection feedback is immediate.', category: 'motion', severity_default: 'warn', negative_prompt: 'Do NOT put a transition on the selected background colour.', scope: PROJECT },
    { rule_id: 'A11Y-target-size', clause_text: 'Every interactive target is at least 44x44.', category: 'accessibility', severity_default: 'block', negative_prompt: 'Do NOT ship a clickable target smaller than 44 by 44.', scope: PROJECT },
  ],
});

await call('bind_taste_surface', {
  profile: PROFILE,
  project: PROJECT,
  surface: 'reconciliation review screen',
  voice_note: 'plain, second-person-free, no exclamation',
  design_notes: {
    density: 'a working list, read top to bottom hundreds of times',
    restraint: 'signal hues carry state only, never decoration',
  },
});

// ── The five taste decisions. Each states a CHOSEN position that DESIGN.md does not
// contain, and rejects alternatives a competent builder would otherwise pick. Two of
// them deliberately invert round 4's answers (filled vs outlined marker; affordance
// before count) so that round-4 material in the repo is a liability, not a hint.
const TASTE = [
  {
    dimension: 'color',
    decision: 'ds-match-marker is a filled 6px dot in the signal hue, carrying no text of its own. The state word lives in the row body as --ink-secondary text, not inside the marker.',
    rejected: ['an outlined marker with a 1px border', 'a text-bearing badge or pill', 'a coloured background behind the whole row'],
    why: 'at three hundred rows the marker is read peripherally; a shape and a hue land faster than a word, and the word is still there for anyone who needs it',
  },
  {
    dimension: 'content',
    decision: 'ds-batch-note copy is the affordance first, then the count: "Undo — 7 reconciled". Em dash, no trailing period, no second person.',
    rejected: ['count first, e.g. "7 reconciled. Undo"', 'addressing the person as "you"', 'any timer or countdown text'],
    why: 'the only reason to look at the note is to reverse the action, so the reversal is the first thing the eye lands on',
  },
  {
    dimension: 'motion',
    decision: 'ds-batch-note persists until the next action or a navigation. It never auto-dismisses and never shows a countdown.',
    rejected: ['a 5 or 8 second auto-dismiss', 'a progress bar or countdown digit', 'dismissing on scroll'],
    why: 'a bookkeeper looks away mid-batch constantly; an undo that expires while they are reading a statement is an undo they never had',
  },
  {
    dimension: 'layout',
    decision: 'ds-total-footer is pinned to the bottom of the viewport and stays visible while the entry list scrolls behind it.',
    rejected: ['a footer at the end of the list', 'a footer that hides on scroll down and returns on scroll up', 'putting the total in the header'],
    why: 'the unreconciled total is the number the whole task is driving to zero; it should never require scrolling to find',
  },
  {
    dimension: 'spacing',
    decision: 'The amount column is right-aligned and its right edge sits a fixed 56px (--space-column) from the row edge, identical on every row regardless of content width.',
    rejected: ['a proportional or percentage column', 'sizing the column to its widest content', 'centre alignment'],
    why: 'scanning a column of figures depends on the digits sharing an edge; anything content-dependent breaks the line the eye follows',
  },
];
for (const t of TASTE) {
  await call('record_taste_decision', { profile: PROFILE, project: PROJECT, source: 'user-directed', ...t });
}

// ── The Decision Graph. Ten active nodes and one contested.
const GRAPH = [
  { key: 'bar_below', statement: 'ds-reconcile-bar sits below the entry list, after it in document order and beneath it on screen.', rationale: 'the bar acts on what you have just read past, so it belongs at the end of the reading, not floating over it', scope: 'ledger', component_ref: 'ds-reconcile-bar', alternatives_rejected: ['a bar above the list', 'a floating bar overlaying the list', 'a bar in the page header'] },
  { key: 'no_confirm', statement: 'Reconciling a selection applies immediately, with no confirmation dialog, and the surface reports what happened afterwards.', rationale: 'the action is reversible, and a dialog on a reversible action is a tax paid three hundred times a day', scope: 'ledger', component_ref: 'ds-reconcile-bar', alternatives_rejected: ['a confirmation dialog', 'a type-to-confirm field', 'a two-step arm-then-apply toggle'] },
  { key: 'paginate', statement: 'The entry list paginates with a numbered pager. It does not infinitely scroll and it has no load-more button.', rationale: 'a bookkeeper needs to be able to say which page they stopped on and come back to it', scope: 'ledger', component_ref: 'ds-entry-row', alternatives_rejected: ['infinite scroll', 'a load-more button', 'a virtualised endless list'] },
  { key: 'filter_multi', statement: 'ds-filter-chip is multi-select: choosing a second chip narrows further rather than replacing the first.', rationale: 'the real questions are compound — needs review AND over a threshold — and a single-select chip set cannot ask one', scope: 'ledger', component_ref: 'ds-filter-chip', alternatives_rejected: ['single-select chips', 'a dropdown that permits one value'] },
  { key: 'filter_persists', statement: 'Filter chip selections survive a page change; moving between pages does not clear them.', rationale: 'the filter is the question being asked, and changing page is not changing the question', scope: 'ledger', component_ref: 'ds-filter-chip', alternatives_rejected: ['clearing filters on page change', 'a confirm-before-losing-filters prompt'] },
  { key: 'negative_ink', statement: 'A negative amount renders in --ink-primary with a leading minus sign. It is never a signal hue and never wrapped in parentheses.', rationale: 'the signal hues mean match confidence here; spending one of them on sign would collide with the only thing they are for', scope: 'ledger', component_ref: 'ds-amount-cell', alternatives_rejected: ['red negatives', 'parenthesised negatives', 'a minus in --signal-break'] },
  { key: 'row_height_stable', statement: 'An entry row is the same height resting, hovered, and selected. Nothing expands on interaction.', rationale: 'a list that reflows under the cursor cannot be scanned at speed', scope: 'ledger', component_ref: 'ds-entry-row', alternatives_rejected: ['expand-on-hover detail', 'a taller selected state', 'an inline expanding drawer'] },
  { key: 'header_tristate', statement: 'The header select control reports a mixed state when some but not all rows on the page are selected.', rationale: 'a plain checked/unchecked control lies about a partial selection, and the bulk bar acts on exactly that partial selection', scope: 'ledger', component_ref: 'ds-entry-row', alternatives_rejected: ['a binary checkbox', 'hiding the header control when the selection is partial'] },
  { key: 'marker_no_tooltip', statement: 'The match marker carries no tooltip. Its meaning is in the row body text beside it.', rationale: 'a tooltip is unreachable on touch and invisible while scanning, which is the only mode this screen is used in', scope: 'ledger', component_ref: 'ds-match-marker', alternatives_rejected: ['a title attribute', 'a hover tooltip', 'a popover on click'] },
  { key: 'select_no_drag', statement: 'Rows are selected by their checkbox or by click. There is no shift-drag range selection.', rationale: 'drag selection over a paginated list produces selections that silently do not survive the page boundary', scope: 'ledger', component_ref: 'ds-entry-row', alternatives_rejected: ['shift-click range selection', 'drag-to-select'] },
];
const ids = {};
for (const g of GRAPH) {
  const { key, ...rest } = g;
  const node = await call('decision_add', rest);
  ids[key] = node.id;
}

// The contested one. decision_list with no status calls listActiveDecisions() and cannot
// return it; reaching it takes an explicit status:"contested". That is the sharpest
// discriminator in the round, so it is asserted in verify-fixture5.mjs rather than assumed.
const contested = await call('decision_add', {
  statement: 'An entry with no plausible match is labelled "Break".',
  rationale: 'the accounting term is exact',
  scope: 'ledger', component_ref: 'ds-match-marker',
  alternatives_rejected: ['"Unmatched"', '"No match"'],
});
await call('decision_contest', { id: contested.id, reason: 'half the pilot users read "Break" as an error state rather than an accounting term; "Unmatched" tested clearer but is vaguer' });
ids.break_label = contested.id;

console.log(JSON.stringify({ store: STORE, profile: PROFILE, project: PROJECT, decisions: ids }, null, 2));
