## Instructions

A Raven MCP server is connected with the full local tool surface, including the design system,
the taste profile and its bindings, per-project taste decisions, and the project's Decision
Graph. Use whatever you need, then do the task.

A Raven MCP server is connected. Invoke a tool like this:

    node /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round4/raven-cli.mjs B2 <tool_name> '<json-args>'

Run it with a bad tool name to see the list of tools available to you. The project's design
system lives at `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round4/arena`. The taste profile is named `kettle` and the project is named
`kettle`.

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

Write exactly two files, both into `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round4/builds/b18/`:

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
