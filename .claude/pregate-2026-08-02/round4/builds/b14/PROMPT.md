## Build prompt

The following build prompt was composed for you. Then do the task below.

---

# Build: moderation queue: a dense reviewable list with bulk selection, bulk actions, paging, and its empty states
Derive the Structure/States skeleton from the reference you are holding and call compose_build_prompt again with it as `skeleton` — this response is the grounding half only.
Grounded in: `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round4/arena/DESIGN.md` (resolved via default) · taste `kettle/internal trust & safety moderation console — the bulk review queue a reviewer sits in for a six-hour shift` · inventory DESIGN.md (7 components)

## Tokens to use
- colors: `colors.surface-base` (`--color-surface-base`), `colors.surface-raised` (`--color-surface-raised`), `colors.surface-recessed` (`--color-surface-recessed`), `colors.surface-sunken` (`--color-surface-sunken`), `colors.ink-primary` (`--color-ink-primary`), `colors.ink-secondary` (`--color-ink-secondary`), `colors.ink-faint` (`--color-ink-faint`), `colors.rule-hair` (`--color-rule-hair`), `colors.rule-solid` (`--color-rule-solid`), `colors.signal-flag` (`--color-signal-flag`), `colors.signal-hold` (`--color-signal-hold`), `colors.signal-clear` (`--color-signal-clear`), `colors.focus-ring` (`--color-focus-ring`)
- type: `type.ui-dense` (`--type-ui-dense`), `type.ui` (`--type-ui`), `type.ui-lead` (`--type-ui-lead`), `type.section` (`--type-section`), `type.page` (`--type-page`)
- space: `space.hair` (`--space-hair`), `space.tight` (`--space-tight`), `space.snug` (`--space-snug`), `space.base` (`--space-base`), `space.loose` (`--space-loose`), `space.slack` (`--space-slack`)
- motion: `motion.duration.snap` (`--motion-duration-snap`), `motion.duration.base` (`--motion-duration-base`), `motion.duration.settle` (`--motion-duration-settle`), `motion.easing.standard` (`--motion-easing-standard`), `motion.easing.exit` (`--motion-easing-exit`)
No hex, no px, no font-family literals — every literal is a defect the acceptance criteria below will catch.

## Prohibitions
- rejected for layout (taste decision `dec_1`): Rail collapses to zero height when idle and grows when armed (shifts the whole queue down by 48px the instant a row is checked, under the reviewer's cursor), Actions hidden until armed, Count centred — Reviewers select by clicking a row and then immediately clicking an action. A rail that grows on selection moves the action they were aiming at.
- rejected for color (taste decision `dec_2`): Filled chip in the signal hue (three saturated blocks per row across a 50-row queue is unreadable at density), Signal-hue text on a neutral fill (fails contrast on --signal-hold) — Tested at 50 rows: filled chips dominated the scan and the reviewer stopped seeing the row content.
- rejected for content (taste decision `dec_3`): "You held 3 items. Undo?" (addresses the reviewer, which the voice forbids), "3 items were held — click here to undo", Undo as an icon — The strip is read in peripheral vision while the reviewer is already scanning the next batch. Three words is the budget.
- rejected for motion (taste decision `dec_4`): Countdown ring or progress bar (a moving element in peripheral vision pulls the eye off the queue), Persist until dismissed (accumulates strips across a fast shift), 4 seconds (measured too short to notice a mis-click) — 8s was the median time to notice a mis-click in the shadowing sessions; the countdown was the single most complained-about element in the previous console.
- rejected for spacing (taste decision `dec_5`): Selection control revealed on row hover (the text reflows horizontally under the cursor), Control sized to its own 44px hit area, letting the gutter vary — A stable left text edge is what makes a 50-row queue scannable. The control's 44px hit area extends vertically and beyond the gutter; the gutter itself stays 40px.
- rejected in the Decision Graph (`dec_rail_position`, active — read via listActiveDecisions(), not decision_list): Bottom-anchored floating bar (the common pattern; occludes the rows under review), Fixed/sticky top bar (permanently costs vertical density in a dense queue), Right sidebar rail (breaks the row scan line) — "Reviewers work the bottom of a long queue. A bottom-floating bar occludes exactly the rows they are about to act on, and a fixed top bar steals 56px of the densest region on the screen."
- rejected in the Decision Graph (`dec_no_confirm_modal`, active — read via listActiveDecisions(), not decision_list): Confirmation modal (measured ineffective: 380ms median dismissal), Type-to-confirm for large selections (rejected: reviewers batch 50+ routinely), Delayed apply with a countdown (rejected: blocks the next action) — "Instrumented over six weeks: reviewers dismissed the confirmation dialog in a median of 380ms, i.e. without reading it, so it prevented nothing while costing roughly two seconds per action across ~200 actions a shift. Reversal after the fact is the control that actually works."
- rejected in the Decision Graph (`dec_load_more`, active — read via listActiveDecisions(), not decision_list): Infinite scroll (loses scroll position after an action mutates the list), Numbered pagination (selection cannot span pages) — "Selection must be able to span pages, and the reviewer must never lose scroll position mid-batch."
- rejected in the Decision Graph (`dec_selection_persists`, active — read via listActiveDecisions(), not decision_list): Clear selection on fetch (safer-looking, discards assembled batches), Warn-and-clear (a dialog, which dec_no_confirm_modal forbids) — "Reviewers assemble a batch across two or three pages before acting on it. Clearing on fetch silently discards their work."
- rejected in the Decision Graph (`dec_rail_before_list`, active — read via listActiveDecisions(), not decision_list): Skip-link to the actions (an extra affordance to teach, for a problem ordering solves), aria-flowto / positive tabindex reordering (fragile, unsupported) — "A 50-row queue puts the bulk actions 50+ tab stops away if DOM order follows the eye. Visual order and DOM order agree here anyway, because the rail is above the list."
- rejected in the Decision Graph (`dec_indeterminate_header`, active — read via listActiveDecisions(), not decision_list): Two-state header plus a separate 'Select all N' link (two controls for one concept), No header control at all — "An unchecked header over a partial selection reads as 'nothing is selected' and has caused reviewers to re-select an already-assembled batch."

## Gaps / decisions for you
1. Contested decision `dec_destructive_label`: "CONTESTED: the destructive bulk action's label. T&S ops want 'Reject' because it matches the policy taxonomy reviewers are trained on. Legal wants 'Remove' because it describes the effect on the content and is what appears in the user-facing notice.". Open question — do not silently resolve it; flag it in your report.

## Acceptance criteria
A criterion cites the check that proves it, or it is marked agent-asserted — never left implying a tool checks something it does not.
| # | Claim | Check | Verified by |
|---|---|---|---|
| A1 | No bare hex, font-size, font-family, or margin/padding/gap literal on an added line of a recognized UI file | review_diff verdict `pass` with `checks_skipped` empty | tool, bounded — it reads only added lines of UI-extension files and does not check arbitrary dimension literals; read `checks_skipped` with the verdict |
| A2 | Clears the deterministic color/spacing/motion detectors | talon_scan → 0 findings ≥ warning | tool, on an agent-supplied post-interaction elements+viewport snapshot — talon_scan takes no interactions, so a url-mode run would audit the default state |
| A3 | Every interactive target ≥ 44 CSS px on both axes | audit_tap_targets (minSize 44 CSS px) | tool, on an agent-supplied post-interaction elements[] snapshot |
| A4 | Text contrast ≥ 4.5:1 (AA normal text) | audit_contrast | tool, on an agent-supplied post-interaction dom_snapshot |
| A6 | Semantic roles and live regions from the Structure section are present in the markup | manual read of the diff | agent-asserted — audit_page has no live-region rule |
| A7 | Taste verdict not BLOCK and every design_note present | audit_taste → note_assessments + verdict | tool — scoped to the page's default state; audit_taste takes no interactions, so post-interaction elements are covered by A2–A4, not A7 |

Design notes are acceptance criteria too — audit_taste verifies each as present/partial/missing on the built surface:
- typography: Five steps, all small. Queue row text is ui-dense (13). ui-lead (16) is the selection count and nothing else. No 18, no 24, no display size.
- spacing: Density before comfort. Row padding tight or snug, never base or larger. Whitespace separates regions, not rows.
- color: Depth ramp, not a lightness ramp. Row hover and selection use --surface-recessed, darker than the page, so a hovered row reads pressed-in. --surface-raised is for floating focused things only. Signal hues are semantic and never decorative.
- layout: One column, full width, hairline row separation. No cards, no shadows, no radius above 3px.
- motion: Three durations only (90/160/260ms). Selection tint changes instantly with no transition, because reviewers rubber-band across dozens of rows. The undo strip enters at base (160ms).
- imagery: None. No illustration, no icon set beyond a minimal set that always accompanies a text label.
- entrance: None on the queue. It must be readable the instant it paints — no stagger, fade, or slide on rows.
- loading: ds-load-more carries its own loading state in place. No skeletons, no spinners over the list, no layout shift when a page appends.
- navigation: The queue is the whole screen. No sidebar, no tabs, no breadcrumb.
- aesthetic: Instrument panel. Dense, flat, unornamented, legible at speed by a tired person.
- libraries: Vanilla HTML/CSS/JS in a single file. No framework, no CSS library, no icon font.
- content: Two empty states that say different things and are never merged.
- atmosphere: Quiet and unremarkable. Nothing in this console should be noticed.
- special: The reviewer is measured on throughput and on not making irreversible mistakes. Every decision in this system trades one against the other, and the trade has already been made — check the decision graph before re-making it.

---

# Round-4 build task — Kettle bulk review queue

This brief is **identical for all three arms**. The arms differ only in the information block
that precedes it. Nothing in this file names a design decision, a token value, or a behaviour
that is under measurement.

---

## What to build

A single self-contained `index.html` (inline CSS and JS, no build step, no framework, no CDN,
no external font) implementing the **bulk review queue** for Kettle, the internal trust & safety
moderation console described in the project's design system.

It must run by opening the file directly in a browser.

## Seeded data — use exactly this, in this order

**Page 1 (12 rows).** Each row: id, submitted-at, author handle, a one-line excerpt, a status.

| id | submitted | author | excerpt | status |
|---|---|---|---|---|
| K-4471 | 09:02 | @noor_h | "shipping delays again, third week running" | flagged |
| K-4472 | 09:04 | @dvsg | "link in bio for the full list" | held |
| K-4473 | 09:07 | @mara.p | "anyone else getting this error on upload" | cleared |
| K-4474 | 09:11 | @tt_ronin | "reposting since it got taken down" | flagged |
| K-4475 | 09:12 | @quietkiln | "the receipts are in the thread" | flagged |
| K-4476 | 09:15 | @halcy0n | "DM me if you want the discount code" | held |
| K-4477 | 09:19 | @b_orchard | "not sure this belongs here but" | cleared |
| K-4478 | 09:23 | @sm1th | "same account, new handle" | flagged |
| K-4479 | 09:26 | @tessel | "screenshots attached, timestamps intact" | cleared |
| K-4480 | 09:31 | @nvrmnd_ | "last warning before I escalate" | flagged |
| K-4481 | 09:33 | @pol_ax | "cross-posted from the other board" | held |
| K-4482 | 09:38 | @wren.k | "closing the loop on this one" | cleared |

**Page 2 (8 rows), appended on demand.**

| id | submitted | author | excerpt | status |
|---|---|---|---|---|
| K-4483 | 09:41 | @oddment | "the policy page says otherwise" | flagged |
| K-4484 | 09:44 | @lune_ | "adding context in the replies" | cleared |
| K-4485 | 09:47 | @gravl | "third report on this account today" | flagged |
| K-4486 | 09:49 | @itsfine | "escalating per the runbook" | held |
| K-4487 | 09:52 | @porthole9 | "duplicate of K-4474" | flagged |
| K-4488 | 09:55 | @andesite | "no action needed, closing" | cleared |
| K-4489 | 09:58 | @tinct | "requesting a second reviewer" | held |
| K-4490 | 10:02 | @vellum_ | "attaching the original submission" | cleared |

Page 2 is the last page.

## Behaviour the build must support

1. **Per-row selection**, and a header control that selects and deselects the whole visible page.
2. **A live selection count.**
3. **Three bulk actions** operating on the current selection: `Hold`, `Clear`, and one destructive
   action. Applying any of them updates the affected rows and clears the selection.
4. **Paging to page 2**, appending the eight rows above to the existing list.
5. **Reversal of the most recent bulk action.**
6. **Both empty states** must be reachable and visibly different: a filter that matched nothing,
   and a genuinely empty queue. Expose them however you like — a query param, a dev control,
   whatever is simplest — and say how in `NOTES.md`.

Beyond this list, the design system governs. Where the brief is silent, it is silent
deliberately: consult the project's own sources rather than choosing a generic default.

## Required markup hooks

So the build can be measured without guessing at selectors, every component instance carries
its design-system name in **both** a class and a `data-ds` attribute:

```html
<div class="ds-queue-row" data-ds="ds-queue-row"> … </div>
```

Use the component names exactly as the design system declares them. Rows additionally carry
`data-id="K-4471"`. Nothing else is prescribed — structure, element choice, and everything
visual are yours.

## Also produce

**`NOTES.md`** next to `index.html`, at most 300 words, with three headings:

- **How to reach the empty states** — one line.
- **Decisions I made that the sources did not settle** — anything you chose yourself.
- **Open questions** — anything you found that you judged was *not yours to settle*, and why.

Write `NOTES.md` after the build, and do not pad it. An empty section is a legitimate answer.

## Constraints

- Single file for the app, plus `NOTES.md`. No other files.
- No network requests at runtime.
- Works in current Chrome at a 1440×900 viewport.
- Do not read any file under `round4/` other than what your information block points you to,
  and do not read any other build.


---

## Output

Write exactly two files, both into `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round4/builds/b14/`:

- `index.html` — the build
- `NOTES.md` — as specified in the task brief

## Ground rules

- Do not read anything under this round's directory other than what you are pointed at above.
  Specifically: do not open `fixtures/`, `measure.mjs`, `PREREGISTRATION.md`, or any other
  `builds/` directory. They contain the answer key and the scoring harness. A build that
  transcribes them measures nothing.
- Do not ask questions. Everything you need is in this file or reachable from it. Where a
  detail is genuinely unsettled, decide, build, and say so in `NOTES.md`.
- Finish. A partial build scores as a partial build.
